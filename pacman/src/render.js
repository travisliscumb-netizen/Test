/* Canvas renderer.

   Layers, back to front:
     backdrop   slow aurora, rendered small and upscaled (one blit)
     floor      glass slab under the maze                   (prerendered)
     pools      coloured light the actors throw on the floor
     walls      bevelled glass with drop shadow and rim     (prerendered)
     wall light every actor's light, masked onto the wall rims
     pellets    shimmering, with a travelling brightness wave
     actors     contact shadows, Pac-Man's trail, sprites, halos
     effects    particles, shockwaves, score pops, banners

   Static layers are rasterised once per resize at device resolution. Motion
   is interpolated between simulation frames so it stays smooth at 120 Hz. */

import * as M from './maze.js';
import { MAZES } from './maze.js';
import { buildWallLoops, traceLoops } from './mazeshape.js';
import { drawPac, drawPacDeath, drawGhost, drawFruit, drawShadow, COLORS, rgba } from './sprites.js';

export const BOARD_W = M.WIDTH;
export const BOARD_H = M.HEIGHT;
export const SLAB_PAD = 6;
export const FONT = '"Outfit", ui-sans-serif, system-ui, sans-serif';

const PAC_R = 6.5;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const easeOut = (t) => 1 - (1 - t) ** 3;

const GHOST_COLOR = COLORS.ghost;

/* One colour theme per maze: glass body, inner glow, bevel, neon rim, and a
   faint tint for the floor beneath. */
export const THEMES = [
  { body: ['#1b2470', '#10164d'], inner: [90, 130, 255], bevel: '190, 210, 255', rim: '#6f8fff', core: '#dbe5ff', glow: '70, 110, 255', floor: ['#0c1236', '#090d28', '#06091c'] },
  { body: ['#3a1a72', '#220e4a'], inner: [190, 110, 255], bevel: '235, 205, 255', rim: '#c27bff', core: '#f4e2ff', glow: '175, 80, 255', floor: ['#160c38', '#0f0829', '#09051c'] },
  { body: ['#0c4a5e', '#062b3a'], inner: [60, 215, 210], bevel: '190, 255, 248', rim: '#3fe0d0', core: '#d9fffa', glow: '30, 200, 190', floor: ['#071d2c', '#051622', '#030e17'] },
  { body: ['#5e2512', '#36140a'], inner: [255, 150, 90], bevel: '255, 220, 190', rim: '#ff9a52', core: '#ffeedd', glow: '255, 120, 50', floor: ['#1f0f0c', '#170b09', '#0f0706'] }
];
const FRIGHT_LIGHT = '#5b6bff';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/* ---------------------------------------------------------------- effects */

class Effects {
  constructor() { this.reset(); }

  reset() {
    this.particles = [];
    this.rings = [];
    this.shake = 0;
    this.punch = 0;
    this.wallFlash = 0;
    this.wallFlashColor = '#9fb4ff';
  }

  burst(x, y, color, count = 16, speed = 60, life = 0.6, size = 1.1, shape = 'dot') {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + Math.random() * 0.5;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.7 + Math.random() * 0.5), max: life,
        color, size: size * (0.6 + Math.random() * 0.8), shape, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 14
      });
    }
  }

  ring(x, y, color, radius = 18, life = 0.5, width = 1.4) {
    this.rings.push({ x, y, color, radius, life, max: life, width });
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = 1 - 3 * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake = Math.max(0, this.shake - dt * 5);
    this.punch = Math.max(0, this.punch - dt * 3.2);
    this.wallFlash = Math.max(0, this.wallFlash - dt * 2.2);
  }

  draw(ctx) {
    if (!this.particles.length && !this.rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) ** 1.5;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.7);
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2 + easeOut(t) * r.radius, 0, TAU);
      ctx.stroke();
    }
    for (const p of this.particles) {
      const t = clamp01(p.life / p.max);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.5 + t * 0.7);
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.6); ctx.lineTo(-s * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* --------------------------------------------------------------- renderer */

export class Renderer {
  constructor(el) {
    this.canvas = el;
    this.ctx = el.getContext('2d', { alpha: false });
    this.wallPaths = new Map();
    this.mazeIndex = 0;
    this.fx = new Effects();
    this.glowCache = new Map();
    this.trail = [];
    this.quality = 'high';
  }

  /* board: the maze rectangle in CSS pixels. */
  resize(cssW, cssH, dpr, board) {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.s = (board.w / BOARD_W) * dpr;
    this.bx = Math.round(board.x * dpr);
    this.by = Math.round(board.y * dpr);
    this.buildSky();
    this.builtFor = -1;
    this.ensureMaze(this.mazeIndex, true);
    this.buildPellets();
    this.trail = [];
    this.staticAt = -1;
  }

  /* --------------------------------------------------------- static art */

  buildSky() {
    const W = this.canvas.width, H = this.canvas.height;
    const k = 6;
    this.sky = makeCanvas(W / k, H / k);
    this.skyK = k;
  }

  drawSky(time, target = this.ctx) {
    const c = this.sky, g = c.getContext('2d');
    const w = c.width, h = c.height;
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#070818');
    base.addColorStop(1, '#03040b');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const R = Math.max(w, h);
    const blobs = [
      ['#3a2cff', 0.32, 0.25 + Math.sin(time * 0.05) * 0.12, 0.2 + Math.cos(time * 0.04) * 0.08, 0.75],
      ['#c02cff', 0.16, 0.8 + Math.cos(time * 0.035) * 0.1, 0.55 + Math.sin(time * 0.045) * 0.1, 0.6],
      ['#00b8ff', 0.14, 0.35 + Math.cos(time * 0.03) * 0.15, 0.9 + Math.sin(time * 0.05) * 0.06, 0.7]
    ];
    for (const [col, a, fx, fy, fr] of blobs) {
      const x = fx * w, y = fy * h, r = fr * R;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, R * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.imageSmoothingQuality = 'low';
    target.drawImage(c, 0, 0, this.canvas.width, this.canvas.height);
  }

  /* Sky, floor slab and walls change slowly or not at all, so while the
     camera is still they are composited into one cached layer and the frame
     pays a single full-screen blit instead of three. */
  drawStatic(time, still) {
    const ctx = this.ctx;
    if (!still) {
      this.drawSky(time);
      this.blitSlab(this.floor);
      this.blitSlab(this.walls);
      this.staticAt = -1;
      return;
    }
    if (!this.staticLayer || this.staticLayer.width !== this.canvas.width || this.staticLayer.height !== this.canvas.height) {
      this.staticLayer = makeCanvas(this.canvas.width, this.canvas.height);
      this.staticAt = -1;
    }
    if (this.staticAt < 0 || time - this.staticAt > 0.5 || time < this.staticAt) {
      const g = this.staticLayer.getContext('2d');
      this.drawSky(time, g);
      this.blitSlab(this.floor, g);
      this.blitSlab(this.walls, g);
      this.staticAt = time;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer, 0, 0);
  }

  /* A canvas covering the slab (board plus padding), drawn in board units. */
  slabCanvas(scale = this.s) {
    const pad = SLAB_PAD + 6;
    const c = makeCanvas((BOARD_W + pad * 2) * scale, (BOARD_H + pad * 2) * scale);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
    return { c, g, pad };
  }

  /* Wall outlines are traced once per maze and kept; the rasterised layers
     are rebuilt whenever the maze or the screen size changes. */
  wallPathFor(index) {
    let p = this.wallPaths.get(index);
    if (!p) {
      p = new Path2D();
      traceLoops(p, buildWallLoops(MAZES[index]));
      this.wallPaths.set(index, p);
    }
    return p;
  }

  ensureMaze(index, force = false) {
    if (!force && index === this.builtFor) return;
    this.mazeIndex = index;
    this.builtFor = index;
    this.wallPath = this.wallPathFor(index);
    this.theme = THEMES[index % THEMES.length];
    this.buildFloor();
    this.buildWalls();
    this.staticAt = -1;
  }

  buildFloor() {
    const { c, g, pad } = this.slabCanvas();
    const s = this.s;
    const x = -SLAB_PAD, y = -SLAB_PAD, w = BOARD_W + SLAB_PAD * 2, h = BOARD_H + SLAB_PAD * 2, r = 10;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.7)';
    g.shadowBlur = 5 * s;
    g.shadowOffsetY = 1.5 * s;
    roundRectPath(g, x, y, w, h, r);
    const fl = g.createLinearGradient(0, y, 0, y + h);
    const [f0, f1, f2] = this.theme.floor;
    fl.addColorStop(0, f0);
    fl.addColorStop(0.5, f1);
    fl.addColorStop(1, f2);
    g.fillStyle = fl;
    g.fill();
    g.restore();

    g.save();
    roundRectPath(g, x, y, w, h, r);
    g.clip();
    /* Fine tile grid, barely there: gives the floor a surface to catch light. */
    g.strokeStyle = 'rgba(130, 150, 255, 0.045)';
    g.lineWidth = 0.18;
    g.beginPath();
    for (let gx = 0; gx <= BOARD_W; gx += 8) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
    for (let gy = 0; gy <= BOARD_H; gy += 8) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
    g.stroke();
    const sheen = g.createRadialGradient(BOARD_W / 2, BOARD_H * 0.28, 4, BOARD_W / 2, BOARD_H * 0.4, BOARD_H * 0.75);
    sheen.addColorStop(0, 'rgba(90, 110, 255, 0.10)');
    sheen.addColorStop(1, 'rgba(90, 110, 255, 0)');
    g.fillStyle = sheen;
    g.fillRect(x, y, w, h);
    /* Inner shadow along the slab edge. */
    g.shadowColor = 'rgba(0, 0, 0, 0.8)';
    g.shadowBlur = 4 * s;
    g.strokeStyle = 'rgba(0,0,0,0.9)';
    g.lineWidth = 3;
    roundRectPath(g, x - 1.5, y - 1.5, w + 3, h + 3, r + 1.5);
    g.stroke();
    g.restore();

    roundRectPath(g, x, y, w, h, r);
    g.strokeStyle = 'rgba(150, 170, 255, 0.16)';
    g.lineWidth = 0.4;
    g.stroke();
    this.floor = { c, pad };
  }

  buildWalls() {
    const s = this.s;
    const th = this.theme;
    const [ir, ig, ib] = th.inner;
    const P = this.wallPath;
    const { c, g, pad } = this.slabCanvas();
    g.save();
    g.beginPath();
    g.rect(0, -6, BOARD_W, BOARD_H + 12);
    g.clip();

    /* Drop shadow: the walls stand off the floor. */
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.75)';
    g.shadowBlur = 3.5 * s;
    g.shadowOffsetY = 1.8 * s;
    g.fillStyle = '#000';
    g.fill(P, 'evenodd');
    g.restore();

    /* Body: dark glass with a cool gradient. */
    const body = g.createLinearGradient(0, 0, BOARD_W * 0.4, BOARD_H);
    body.addColorStop(0, th.body[0]);
    body.addColorStop(1, th.body[1]);
    g.fillStyle = body;
    g.fill(P, 'evenodd');

    /* Inner edge glow, clipped so only the inside half of each stroke shows. */
    g.save();
    g.clip(P, 'evenodd');
    g.strokeStyle = `rgba(${ir}, ${ig}, ${ib}, 0.22)`;
    g.lineWidth = 3.4;
    g.stroke(P);
    g.strokeStyle = `rgba(${Math.min(255, ir + 30)}, ${Math.min(255, ig + 30)}, ${ib}, 0.35)`;
    g.lineWidth = 1.5;
    g.stroke(P);
    g.restore();

    /* Bevel: a bright lip on top edges, a dark one on bottom edges. */
    const bevel = (dy, color) => {
      const t = this.slabCanvas();
      t.g.fillStyle = color;
      t.g.fill(P, 'evenodd');
      t.g.globalCompositeOperation = 'destination-out';
      t.g.translate(0, dy);
      t.g.fill(P, 'evenodd');
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(t.c, 0, 0);
      g.restore();
    };
    bevel(0.85, `rgba(${th.bevel}, 0.55)`);
    bevel(-0.85, 'rgba(0, 0, 20, 0.55)');

    /* Rim: the neon edge, with a tight bloom. */
    g.lineJoin = 'round';
    g.shadowColor = `rgba(${th.glow}, 0.95)`;
    g.shadowBlur = 3 * s;
    g.strokeStyle = th.rim;
    g.lineWidth = 0.7;
    g.stroke(P);
    g.shadowBlur = 0;
    g.strokeStyle = th.core;
    g.lineWidth = 0.26;
    g.stroke(P);

    /* Ghost-house door: a glowing bar. */
    g.shadowColor = 'rgba(255, 150, 220, 0.95)';
    g.shadowBlur = 3 * s;
    const door = g.createLinearGradient(0, 98, 0, 102);
    door.addColorStop(0, '#ffd6f2');
    door.addColorStop(1, '#ff7fd0');
    g.fillStyle = door;
    roundRectPath(g, 13 * 8 - 1.2, 12 * 8 + 3.1, 18.4, 1.8, 0.9);
    g.fill();
    g.restore();
    this.walls = { c, pad };

    /* Where light lands: the rim strongly, the glass body faintly. Half
       resolution is plenty for light. */
    const ls = s / 2;
    const m = this.slabCanvas(ls);
    m.g.fillStyle = 'rgba(255,255,255,0.32)';
    m.g.fill(P, 'evenodd');
    m.g.strokeStyle = '#fff';
    m.g.lineWidth = 1.6;
    m.g.stroke(P);
    this.wallMask = m.c;
    this.light = this.slabCanvas(ls);
    this.lightScale = ls;
  }

  buildPellets() {
    const s = this.s;
    const orb = (r, glowR, stops, halo) => {
      const size = Math.ceil(glowR * 2 * s) + 4;
      const c = makeCanvas(size, size);
      const g = c.getContext('2d');
      const h = size / 2;
      const gl = g.createRadialGradient(h, h, 0, h, h, glowR * s);
      gl.addColorStop(0, halo);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl;
      g.fillRect(0, 0, size, size);
      const body = g.createRadialGradient(h - r * s * 0.35, h - r * s * 0.4, r * s * 0.05, h, h, r * s);
      stops.forEach(([o, col]) => body.addColorStop(o, col));
      g.fillStyle = body;
      g.beginPath();
      g.arc(h, h, r * s, 0, TAU);
      g.fill();
      return { c, half: h };
    };
    this.dot = orb(1.15, 3.4, [[0, '#ffffff'], [0.5, '#ffe2cf'], [1, '#ffab80']], 'rgba(255, 180, 140, 0.32)');
    this.power = orb(3.5, 9.5, [[0, '#ffffff'], [0.35, '#ffe9da'], [0.8, '#ffb48a'], [1, '#ff8a5c']], 'rgba(255, 160, 120, 0.5)');
  }

  /* A soft radial light in one colour, at a fixed resolution; it is always
     drawn scaled, and blurry gradients scale cleanly. */
  glow(color) {
    let c = this.glowCache.get(color);
    if (c) return c;
    c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color);
    gr.addColorStop(0.35, rgba(color, 0.45));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.glowCache.set(color, c);
    return c;
  }

  /* -------------------------------------------------------------- frame */

  draw(game, alpha, view) {
    const ctx = this.ctx;
    this.ensureMaze(game.maze ? game.maze.index : 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* Camera: shake plus a brief punch-in on big moments. */
    const fx = this.fx;
    const z = 1 + 0.014 * easeOut(fx.punch);
    const s = this.s * z;
    const cx = this.bx + (BOARD_W * this.s) / 2, cy = this.by + (BOARD_H * this.s) / 2;
    const sh = view.reducedMotion ? 0 : fx.shake;
    this.T = {
      s,
      x: cx - (BOARD_W * s) / 2 + (sh ? (Math.random() - 0.5) * sh * s : 0),
      y: cy - (BOARD_H * s) / 2 + (sh ? (Math.random() - 0.5) * sh * s : 0),
      z
    };

    if (game.phase === 'intermission') {
      this.drawSky(view.time);
      this.blitSlab(this.floor);
      this.drawIntermission(game, view);
      return;
    }
    this.drawBoard(game, alpha, view);
  }

  blitSlab(layer, ctx = this.ctx) {
    const T = this.T;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k = T.z;
    ctx.drawImage(layer.c, T.x - layer.pad * T.s, T.y - layer.pad * T.s, layer.c.width * k, layer.c.height * k);
  }

  boardSpace() {
    const T = this.T;
    this.ctx.setTransform(T.s, 0, 0, T.s, T.x, T.y);
  }

  lights(game, view) {
    const out = [];
    const phase = game.phase;
    const p = game.pac;
    const showGhosts = !['deathAnim', 'flash', 'gameover'].includes(phase) && !this.isIntro(game);
    if (phase !== 'gameover' && !this.isIntro(game)) out.push([p.x, p.y, '#ffd54a', 36, phase === 'deathAnim' ? 0.5 : 0.95]);
    if (showGhosts) {
      for (const g of game.ghosts) {
        if (g.state === 'eyes' || g.state === 'entering') { out.push([g.x, g.y, '#9fc4ff', 12, 0.5]); continue; }
        const fr = g.frightened && game.frightActive;
        out.push([g.x, g.y, fr ? FRIGHT_LIGHT : GHOST_COLOR[g.name], 26, 0.85]);
      }
    }
    if (game.fruit) out.push([M.FRUIT_POS.x, M.FRUIT_POS.y, '#ff7fb8', 16, 0.6]);
    const pulse = 0.5 + 0.5 * Math.sin(view.time * 6);
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        if (game.items[r * M.COLS + c] === M.ITEM.POWER) out.push([c * 8 + 4, r * 8 + 4, '#ffb48a', 15, 0.35 + pulse * 0.3]);
      }
    }
    return out;
  }

  isIntro(game) {
    return game.phase === 'ready' && game.phaseTimer > 132 && game.dotsEaten === 0 && game.score === 0;
  }

  drawBoard(game, alpha, view) {
    const ctx = this.ctx, T = this.T, fx = this.fx;
    const phase = game.phase;
    const high = this.quality === 'high';
    const lights = this.lights(game, view);
    const intro = this.isIntro(game);

    const still = T.z === 1 && !(this.fx.shake && !view.reducedMotion);
    this.drawStatic(view.time, still);

    /* Light pools on the floor (they also wash faintly over the walls, which
       now sit beneath them -- light, so that reads as glow, not error). */
    if (high) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(T.x, T.y, BOARD_W * T.s, BOARD_H * T.s);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, col, r, k] of lights) {
        const R = r * 1.15 * T.s;
        ctx.globalAlpha = 0.16 * k;
        ctx.drawImage(this.glow(col), T.x + x * T.s - R, T.y + y * T.s - R, R * 2, R * 2);
      }
      ctx.restore();
    }

    /* Wall light: every light source, plus whole-maze washes for fright,
       power pellets and the level-clear flash, masked to the walls. */
    let wash = null, washA = 0;
    if (phase === 'flash') {
      const on = Math.floor(game.phaseTimer / 12) % 2 === 0;
      wash = '#ffffff'; washA = on ? 0.9 : 0.12;
    } else if (game.frightActive) {
      wash = game.frightFlashWhite ? '#c9d2ff' : FRIGHT_LIGHT; washA = 0.28;
    }
    if (fx.wallFlash > 0) { wash = fx.wallFlashColor; washA = Math.max(washA, fx.wallFlash * 0.8); }
    if (high || wash) {
      const L = this.light, lg = L.g, ls = this.lightScale;
      lg.save();
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.globalCompositeOperation = 'source-over';
      lg.clearRect(0, 0, L.c.width, L.c.height);
      if (wash) { lg.globalAlpha = washA; lg.fillStyle = wash; lg.fillRect(0, 0, L.c.width, L.c.height); }
      lg.globalCompositeOperation = 'lighter';
      if (high) {
        for (const [x, y, col, r, k] of lights) {
          const R = r * ls;
          lg.globalAlpha = k;
          lg.drawImage(this.glow(col), (x + L.pad) * ls - R, (y + L.pad) * ls - R, R * 2, R * 2);
        }
      }
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = 'destination-in';
      lg.drawImage(this.wallMask, 0, 0);
      lg.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      const k = T.s / ls;
      ctx.drawImage(L.c, T.x - L.pad * T.s, T.y - L.pad * T.s, L.c.width * k, L.c.height * k);
      ctx.restore();
    }

    this.boardSpace();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_W, BOARD_H);
    ctx.clip();

    this.drawPellets(game, view);

    const showGhosts = !intro && !['deathAnim', 'flash', 'gameover'].includes(phase);
    const showPac = !intro && phase !== 'gameover' && phase !== 'ghostEaten';

    if (game.fruit && phase !== 'flash') {
      const bob = Math.sin(view.time * 3.2) * 0.8;
      drawShadow(ctx, M.FRUIT_POS.x, M.FRUIT_POS.y + 6.5, 4.5, 1.6, 0.5);
      this.halo(M.FRUIT_POS.x, M.FRUIT_POS.y + bob, '#ff7fb8', 12, 0.55);
      drawFruit(ctx, game.fruit.kind, M.FRUIT_POS.x, M.FRUIT_POS.y + bob - 0.8, 1.05);
    }

    /* Contact shadows first, so no actor's shadow falls across another. */
    const pacPos = this.interp(game.pac, alpha);
    const ghostPos = game.ghosts.map((g) => this.interp(g, alpha));
    if (showPac && phase !== 'deathAnim') drawShadow(ctx, pacPos.x + 0.8, pacPos.y + 6.3, 5.6, 1.9, 0.6);
    if (showGhosts) {
      game.ghosts.forEach((g, i) => {
        if (g.state === 'eyes' || g.state === 'entering') return;
        if (phase === 'ghostEaten' && game.eaten && game.eaten.ghost === g) return;
        drawShadow(ctx, ghostPos[i].x + 0.8, ghostPos[i].y + 7, 6, 2, 0.6);
      });
    }

    if (showPac) this.drawPacman(game, pacPos);
    else this.trail = [];
    if (showGhosts) game.ghosts.forEach((g, i) => this.drawGhostActor(game, g, ghostPos[i], view));

    fx.draw(ctx);
    this.drawPops(game);
    ctx.restore();

    /* Death drains the colour from everything but Pac-Man's last moment. */
    if (phase === 'dying' || phase === 'deathAnim') {
      const k = phase === 'dying' ? clamp01((60 - game.phaseTimer) / 30) : 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = '#808080';
      roundRectPath(ctx, T.x - SLAB_PAD * T.s, T.y - SLAB_PAD * T.s, (BOARD_W + SLAB_PAD * 2) * T.s, (BOARD_H + SLAB_PAD * 2) * T.s, 10 * T.s);
      ctx.fill();
      ctx.restore();
      if (phase === 'deathAnim') {
        this.boardSpace();
        this.drawPacman(game, pacPos);
      }
    }

    this.boardSpace();
    if (intro) this.banner('PLAYER ONE', 11 * 8 + 4, '#7fefff', 1 - game.phaseTimer / 252, 7);
    else if (phase === 'ready' && !view.demo) this.pill(`LEVEL ${game.level}  ·  ${game.maze.name.toUpperCase()}`, 11 * 8 + 4);
    if (phase === 'ready') this.banner('READY!', 17 * 8 + 4, '#ffe14a', 1 - game.phaseTimer / (intro ? 252 : 120), 9);
    if (phase === 'gameover' && !view.demo) this.banner('GAME OVER', 17 * 8 + 4, '#ff4d5e', 1, 9);
  }

  drawPellets(game, view) {
    const ctx = this.ctx, T = this.T;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const items = game.items;
    const t = view.time;
    const high = this.quality === 'high';
    const dot = this.dot, pow = this.power;
    const dw = dot.c.width * T.z, pw0 = pow.c.width * T.z;
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        const it = items[r * M.COLS + c];
        if (!it) continue;
        const x = T.x + (c * 8 + 4) * T.s, y = T.y + (r * 8 + 4) * T.s;
        if (it === M.ITEM.DOT) {
          ctx.globalAlpha = high ? 0.72 + 0.28 * Math.sin(t * 2.6 - (c + r) * 0.42) : 1;
          ctx.drawImage(dot.c, x - dw / 2, y - dw / 2, dw, dw);
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(t * 6);
          const k = 0.86 + pulse * 0.16;
          ctx.globalAlpha = 0.85 + pulse * 0.15;
          const pw = pw0 * k;
          ctx.drawImage(pow.c, x - pw / 2, y - pw / 2, pw, pw);
        }
      }
    }
    ctx.restore();
  }

  interp(a, alpha) {
    return { x: lerp(a.px, a.x, alpha), y: lerp(a.py, a.y, alpha) };
  }

  halo(x, y, color, radius, alpha) {
    const ctx = this.ctx, T = this.T;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    const R = radius * T.s;
    ctx.drawImage(this.glow(color), T.x + x * T.s - R, T.y + y * T.s - R, R * 2, R * 2);
    ctx.restore();
  }

  drawPacman(game, pos) {
    const ctx = this.ctx;
    const p = game.pac;
    const { x, y } = pos;
    if (game.phase === 'deathAnim') {
      const t = 1 - game.phaseTimer / 110;
      const k = clamp01((t - 0.12) / 0.62);
      if (k < 1) {
        this.halo(x, y, '#ffd54a', 18, 0.7 * (1 - k));
        drawPacDeath(ctx, x, y, PAC_R, k);
      } else if (!this.deathBurstDone) {
        this.deathBurstDone = true;
        this.fx.burst(x, y, '#ffe14a', 22, 55, 0.7, 1, 'shard');
        this.fx.ring(x, y, '#ffe14a', 16, 0.5);
      }
      return;
    }
    this.deathBurstDone = false;

    /* Motion trail: a few fading afterimages along the recent path. */
    const moving = game.phase === 'playing' && p.moving;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 12) this.trail = [];
    if (moving) this.trail.push({ x, y });
    else if (this.trail.length) this.trail.shift();
    if (this.trail.length > 9) this.trail.shift();
    if (this.quality === 'high' && this.trail.length > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = this.trail.length;
      for (let i = 0; i < n - 1; i++) {
        const q = this.trail[i], k = i / n;
        ctx.globalAlpha = 0.16 * k;
        ctx.fillStyle = '#ffcf3a';
        ctx.beginPath();
        ctx.arc(q.x, q.y, PAC_R * (0.55 + 0.4 * k), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    const cycle = (p.travel % 10) / 10;
    const mouth = game.phase === 'ready' ? 0
      : game.phase === 'levelDone' || game.phase === 'flash' ? 0.5
        : 0.95 * (0.5 - 0.5 * Math.cos(cycle * TAU));
    this.halo(x, y, '#ffd54a', 17, 0.55);
    drawPac(ctx, x, y, PAC_R, mouth, p.facing);
  }

  drawGhostActor(game, g, pos, view) {
    if (game.phase === 'ghostEaten' && game.eaten && game.eaten.ghost === g) return;
    const { x, y } = pos;
    let mode = 'normal';
    if (g.state === 'eyes' || g.state === 'entering') mode = 'eyes';
    else if (g.frightened && game.frightActive) mode = game.frightFlashWhite ? 'flash' : 'fright';
    const color = GHOST_COLOR[g.name];
    const glow = mode === 'fright' ? FRIGHT_LIGHT : mode === 'flash' ? '#ffffff' : mode === 'eyes' ? '#9fc4ff' : color;
    this.halo(x, y, glow, mode === 'eyes' ? 9 : 15, mode === 'eyes' ? 0.4 : 0.5);
    const frozen = ['dying', 'levelDone', 'ready'].includes(game.phase);
    const t = frozen ? g.idx : view.time * 8 + g.idx * 1.3;
    drawGhost(this.ctx, x, y, { color, dir: g.dir, t, mode });
  }

  /* --------------------------------------------------------------- text */

  text(str, x, y, { size = 8, weight = 800, color = '#fff', glow = color, spacing = 0, outline = true, alpha = 1, scale = 1 } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.28;
      ctx.strokeStyle = 'rgba(3, 4, 14, 0.9)';
      ctx.strokeText(str, 0, 0);
    }
    ctx.shadowColor = glow;
    ctx.shadowBlur = size * 0.6 * this.T.s;
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fillText(str, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  banner(str, y, color, p, size) {
    const t = clamp01(p * 4);
    this.text(str, BOARD_W / 2, y, { size, color, spacing: size * 0.16, scale: 0.6 + 0.4 * easeOutBack(t), alpha: clamp01(t * 2) });
  }

  pill(str, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 5.5px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.8px';
    const w = ctx.measureText(str).width + 10;
    roundRectPath(ctx, BOARD_W / 2 - w / 2, y - 4.5, w, 9, 4.5);
    ctx.fillStyle = 'rgba(14, 20, 64, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127, 239, 255, 0.55)';
    ctx.lineWidth = 0.45;
    ctx.stroke();
    ctx.fillStyle = '#bff7ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, BOARD_W / 2, y + 0.3);
    ctx.restore();
  }

  drawPops(game) {
    if (game.phase === 'ghostEaten' && game.eaten) {
      const p = 1 - game.phaseTimer / 60;
      const t = clamp01(p * 3.5);
      this.text(String(game.eaten.points), game.eaten.x, game.eaten.y - 1 - p * 4, {
        size: 7.5, color: '#5ff4ff', glow: '#2fe4ff', scale: 0.4 + 0.6 * easeOutBack(t)
      });
    }
    for (const pop of game.popups) {
      const p = 1 - pop.frames / 120;
      const t = clamp01(p * 3.5);
      this.text(pop.text, pop.x, pop.y - 2 - p * 6, {
        size: 7, color: '#ff9fd8', glow: '#ff7fb8', scale: 0.4 + 0.6 * easeOutBack(t), alpha: clamp01((1 - p) * 4)
      });
    }
  }

  /* ------------------------------------------------------- intermission */

  drawIntermission(game, view) {
    const ctx = this.ctx;
    this.boardSpace();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_W, BOARD_H);
    ctx.clip();
    const t = 330 - game.phaseTimer;
    const act = game.intermission || 0;
    const fade = clamp01(Math.min(t / 24, game.phaseTimer / 24));
    const y = 150;
    const floorY = y + 7.4;

    /* Stage: a spotlight pool and a reflective floor line. */
    const spot = ctx.createRadialGradient(BOARD_W / 2, floorY, 2, BOARD_W / 2, floorY, 120);
    spot.addColorStop(0, `rgba(90, 110, 255, ${0.22 * fade})`);
    spot.addColorStop(1, 'rgba(90, 110, 255, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    const line = ctx.createLinearGradient(0, 0, BOARD_W, 0);
    line.addColorStop(0, 'rgba(111, 143, 255, 0)');
    line.addColorStop(0.5, `rgba(111, 143, 255, ${0.7 * fade})`);
    line.addColorStop(1, 'rgba(111, 143, 255, 0)');
    ctx.fillStyle = line;
    ctx.fillRect(0, floorY, BOARD_W, 0.4);

    const titles = ['ACT I', 'ACT II', 'ACT III'];
    const names = ['The Chase', 'Outnumbered', 'Turnabout'];
    this.text(titles[act], BOARD_W / 2, 66, { size: 6, weight: 700, color: '#ffe14a', spacing: 2, alpha: fade });
    this.text(names[act], BOARD_W / 2, 80, { size: 12, weight: 800, color: '#7fefff', glow: '#2fe4ff', alpha: fade });

    const run = view.time * 9;
    const mouthAt = (k) => 0.95 * (0.5 - 0.5 * Math.cos(k * TAU));
    const cast = [];
    if (act === 0) {
      if (t < 160) {
        const px = lerp(260, -60, t / 160);
        cast.push(['pac', px, y, 6.5, mouthAt(t / 9), 1]);
        cast.push(['ghost', px + 26, y, 'blinky', 1, 'normal']);
      } else if (t > 170) {
        const gx = lerp(-30, 300, (t - 170) / 160);
        cast.push(['ghost', gx, y, 'blinky', 3, 'fright']);
        cast.push(['pac', gx - 46, floorY - 22, 22, mouthAt(t / 12), 3]);
      }
    } else if (t < 160 || t > 170) {
      const names4 = ['blinky', 'pinky', 'inky', 'clyde'];
      const firstHalf = t < 160;
      const pacLeads = (act === 1) === firstHalf;
      const k = firstHalf ? t / 160 : (t - 170) / 160;
      const x0 = firstHalf ? lerp(260, -120, k) : lerp(-120, 260, k);
      const dir = firstHalf ? 1 : 3;
      const lead = firstHalf ? -1 : 1;
      if (pacLeads) {
        cast.push(['pac', x0 + lead * 4, y, 6.5, mouthAt(t / 9), dir]);
        names4.forEach((n, i) => cast.push(['ghost', x0 - lead * (22 + i * 16), y, n, dir, 'normal', i]));
      } else {
        names4.forEach((n, i) => cast.push(['ghost', x0 + lead * (8 + i * 16), y, n, dir, 'fright', i]));
        cast.push(['pac', x0 - lead * 20, y, 6.5, mouthAt(t / 9), dir]);
      }
    }
    const drawCast = (reflection = false) => {
      for (const c of cast) {
        if (c[0] === 'pac') {
          if (!reflection) this.halo(c[1], c[2], '#ffd54a', c[3] * 2.6, 0.5);
          drawPac(ctx, c[1], c[2], c[3], c[4], c[5]);
        } else {
          drawGhost(ctx, c[1], c[2], { color: GHOST_COLOR[c[3]], dir: c[4], t: run + (c[6] || 0), mode: c[5] });
        }
      }
    };
    /* Reflection first, then the cast. */
    ctx.save();
    ctx.translate(0, floorY * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.09;
    drawCast(true);
    ctx.restore();
    for (const c of cast) {
      if (c[0] === 'pac') drawShadow(ctx, c[1], floorY, c[3] * 0.9, c[3] * 0.25, 0.5);
      else drawShadow(ctx, c[1], floorY, 6, 1.8, 0.5);
    }
    drawCast();
    ctx.restore();
  }
}
