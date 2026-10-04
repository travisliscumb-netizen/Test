/* Canvas renderer. Static layers (backdrop, maze, dot sprites, CRT overlay)
   are rasterised once per resize at device resolution; each frame then costs a
   handful of blits plus the moving actors. Positions are interpolated between
   simulation frames so motion stays smooth on 90/120 Hz displays. */

import * as M from './maze.js';
import { buildWallLoops, traceLoops } from './mazeshape.js';
import { fruitShelf } from './engine.js';
import { drawPac, drawPacDeath, drawGhost, drawFruit, COLORS } from './sprites.js';

export const FRAME_W = 224;
export const FRAME_H = 288;
export const MAZE_Y = 24;
export const FONT = '"Press Start 2P", ui-monospace, Menlo, monospace';

const PAC_R = 6.4;
const TAU = Math.PI * 2;

const THEME = {
  normal: { line: '#3d63ff', core: '#b8c8ff', glow: 'rgba(61, 99, 255, 0.95)', fill: 'rgba(30, 48, 170, 0.22)', door: '#ffb3e2' },
  flash: { line: '#ffffff', core: '#ffffff', glow: 'rgba(235, 240, 255, 0.95)', fill: 'rgba(200, 210, 255, 0.16)', door: '#ffb3e2' }
};

const GHOST_COLOR = COLORS.ghost;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

/* ---------------------------------------------------------------- effects */

class Effects {
  constructor() { this.reset(); }

  reset() {
    this.particles = [];
    this.rings = [];
    this.shake = 0;
  }

  burst(x, y, color, count = 16, speed = 60, life = 0.55, size = 1.1) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + Math.random() * 0.4;
      const v = speed * (0.45 + Math.random() * 0.75);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }

  ring(x, y, color, radius = 18, life = 0.45, width = 1.4) {
    this.rings.push({ x, y, color, radius, life, max: life, width });
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 3.2 * dt;
      p.vy *= 1 - 3.2 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake = Math.max(0, this.shake - dt * 6);
  }

  draw(ctx) {
    if (!this.particles.length && !this.rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2 + ease(t) * r.radius, 0, TAU);
      ctx.stroke();
    }
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* --------------------------------------------------------------- renderer */

export class Renderer {
  constructor(el) {
    this.canvas = el;
    this.ctx = el.getContext('2d', { alpha: false });
    this.wallPath = new Path2D();
    traceLoops(this.wallPath, buildWallLoops());
    this.fx = new Effects();
    this.glows = new Map();
    this.crt = true;
  }

  /* frame: the 224x288 play frame's rectangle in CSS pixels. */
  resize(cssW, cssH, dpr, frame) {
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.s = (frame.w / FRAME_W) * dpr;
    this.ox = Math.round(frame.x * dpr);
    this.oy = Math.round(frame.y * dpr);
    this.mazeOy = Math.round(this.oy + MAZE_Y * this.s);
    this.glows.clear();
    this.buildBackdrop();
    this.mazes = { normal: this.buildMaze(THEME.normal), flash: this.buildMaze(THEME.flash) };
    this.buildDots();
    this.buildOverlay();
  }

  buildBackdrop() {
    const W = this.canvas.width, H = this.canvas.height, s = this.s;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#04050c';
    g.fillRect(0, 0, W, H);
    const cx = this.ox + (FRAME_W * s) / 2, cy = this.oy + (FRAME_H * s) / 2;
    const rad = Math.max(W, H) * 0.75;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grd.addColorStop(0, '#0d1236');
    grd.addColorStop(0.45, '#070a1e');
    grd.addColorStop(1, '#030409');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    /* A faint dot lattice outside the frame gives the empty margins texture. */
    const step = Math.max(10, Math.round(8 * s));
    g.fillStyle = 'rgba(120, 140, 255, 0.07)';
    const r = Math.max(0.6, s * 0.18);
    for (let y = (this.oy % step) + step / 2; y < H; y += step) {
      for (let x = (this.ox % step) + step / 2; x < W; x += step) {
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }
    /* Clear the lattice under the maze so the board reads as a solid panel. */
    const mx = this.ox - 2 * s, my = this.mazeOy - 2 * s, mw = (FRAME_W + 4) * s, mh = (M.HEIGHT + 4) * s;
    g.save();
    roundRectPath(g, mx, my, mw, mh, 6 * s);
    g.clip();
    const panel = g.createLinearGradient(0, my, 0, my + mh);
    panel.addColorStop(0, '#060818');
    panel.addColorStop(1, '#03040c');
    g.fillStyle = panel;
    g.fillRect(mx, my, mw, mh);
    g.restore();
    this.backdrop = c;
  }

  buildMaze(theme) {
    const s = this.s;
    const pad = Math.ceil(6 * s);
    const c = canvas(M.WIDTH * s + pad * 2, M.HEIGHT * s + pad * 2);
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, pad, pad);
    g.save();
    g.beginPath();
    g.rect(0, -6, M.WIDTH, M.HEIGHT + 12);
    g.clip();

    g.fillStyle = theme.fill;
    g.fill(this.wallPath, 'evenodd');

    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.shadowColor = theme.glow;
    g.shadowBlur = 4.5 * s;
    g.strokeStyle = theme.line;
    g.lineWidth = 1.05;
    g.stroke(this.wallPath);
    g.shadowBlur = 1.5 * s;
    g.stroke(this.wallPath);
    g.shadowBlur = 0;
    g.strokeStyle = theme.core;
    g.lineWidth = 0.42;
    g.stroke(this.wallPath);

    /* Ghost-house door. */
    g.shadowColor = theme.door;
    g.shadowBlur = 3 * s;
    g.fillStyle = theme.door;
    roundRectPath(g, 13 * 8 - 1.5, 12 * 8 + 3, 19, 2, 1);
    g.fill();
    g.restore();
    return { canvas: c, pad };
  }

  buildDots() {
    const s = this.s;
    const mk = (radius, glowR, color, glowColor) => {
      const size = Math.ceil(glowR * 2 * s) + 2;
      const c = canvas(size, size);
      const g = c.getContext('2d');
      const h = size / 2;
      const grd = g.createRadialGradient(h, h, 0, h, h, glowR * s);
      grd.addColorStop(0, glowColor);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.fillStyle = color;
      g.beginPath();
      g.arc(h, h, radius * s, 0, TAU);
      g.fill();
      return { canvas: c, half: h };
    };
    this.dotSprite = mk(1.05, 3.2, '#ffd9c4', 'rgba(255, 190, 160, 0.35)');
    this.powerSprite = mk(3.6, 8.5, '#ffe2d0', 'rgba(255, 180, 150, 0.55)');
  }

  buildOverlay() {
    const W = this.canvas.width, H = this.canvas.height;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    this.vignette = c;

    const sc = canvas(W, H);
    const sg = sc.getContext('2d');
    sg.drawImage(c, 0, 0);
    const pitch = Math.max(2, Math.round(this.dpr * 1.5));
    sg.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < H; y += pitch * 2) sg.fillRect(0, y, W, pitch);
    this.scanlines = sc;
  }

  glow(color, radius) {
    const key = color + radius;
    let c = this.glows.get(key);
    if (c) return c;
    const s = this.s;
    const size = Math.ceil(radius * 2 * s) + 2;
    c = canvas(size, size);
    const g = c.getContext('2d');
    const h = size / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, radius * s);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    this.glows.set(key, c);
    return c;
  }

  /* Additive halo under an actor, drawn in device pixels. */
  halo(x, y, color, radius, alpha) {
    const c = this.glow(color, radius);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, this.mx(x) - c.width / 2, this.my(y) - c.height / 2);
    ctx.restore();
  }

  mx(x) { return this.ox + this.shakeX + x * this.s; }
  my(y) { return this.mazeOy + this.shakeY + y * this.s; }

  /* -------------------------------------------------------------- frame */

  draw(game, alpha, view) {
    const ctx = this.ctx, s = this.s;
    const sh = this.fx.shake;
    this.shakeX = sh ? (Math.random() - 0.5) * sh * s : 0;
    this.shakeY = sh ? (Math.random() - 0.5) * sh * s : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.backdrop, 0, 0);

    ctx.setTransform(s, 0, 0, s, this.ox, this.oy);
    this.drawTopHud(game, view);

    if (game.phase === 'intermission') this.drawIntermission(game, view);
    else this.drawBoard(game, alpha, view);

    ctx.setTransform(s, 0, 0, s, this.ox, this.oy);
    this.drawBottomHud(game);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.crt ? this.scanlines : this.vignette, 0, 0);
  }

  drawBoard(game, alpha, view) {
    const ctx = this.ctx, s = this.s;
    const phase = game.phase;
    const flashing = phase === 'flash' && Math.floor(game.phaseTimer / 12) % 2 === 0;
    const maze = flashing ? this.mazes.flash : this.mazes.normal;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(maze.canvas, this.ox + this.shakeX - maze.pad, this.mazeOy + this.shakeY - maze.pad);

    ctx.setTransform(s, 0, 0, s, this.ox + this.shakeX, this.mazeOy + this.shakeY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, M.WIDTH, M.HEIGHT);
    ctx.clip();

    this.drawDots(game, view);

    const intro = phase === 'ready' && game.phaseTimer > 132 && game.dotsEaten === 0 && game.score === 0;
    const showGhosts = !intro && !['deathAnim', 'flash', 'gameover'].includes(phase);
    const showPac = !intro && phase !== 'gameover' && phase !== 'ghostEaten';

    if (game.fruit && phase !== 'flash') {
      const bob = Math.sin(view.time * 4) * 0.5;
      this.halo(M.FRUIT_POS.x, M.FRUIT_POS.y, 'rgba(255, 120, 160, 0.5)', 11, 0.8);
      drawFruit(ctx, game.fruit.kind, M.FRUIT_POS.x, M.FRUIT_POS.y + bob, 1);
    }

    if (showPac) this.drawPacman(game, alpha);
    if (showGhosts) for (const g of game.ghosts) this.drawGhostActor(game, g, alpha, view);

    this.fx.draw(ctx);

    /* Score pops sit above everything, outlined so particles and ghosts
       underneath can't swallow them. */
    if (phase === 'ghostEaten' && game.eaten) {
      this.drawLabel(String(game.eaten.points), game.eaten.x, game.eaten.y - 3, 6, '#2ee8ff', true, true);
    }
    for (const p of game.popups) {
      this.drawLabel(p.text, p.x, p.y - 3 - (1 - p.frames / 120) * 4, 6, '#ffa6ee', true, true);
    }
    ctx.restore();

    if (intro) this.drawLabel('PLAYER ONE', M.WIDTH / 2, 11 * 8 + 1, 8, '#2ee8ff', true);
    else if (phase === 'ready' && !view.demo) this.drawLabel(`LEVEL ${game.level}`, M.WIDTH / 2, 11 * 8 + 1, 8, '#2ee8ff', true);
    if (phase === 'ready') this.drawLabel('READY!', M.WIDTH / 2, 17 * 8 + 1, 8, '#ffe94a', true);
    if (phase === 'gameover') this.drawLabel('GAME  OVER', M.WIDTH / 2, 17 * 8 + 1, 8, '#ff3b3b', true);
  }

  drawDots(game, view) {
    const ctx = this.ctx, s = this.s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dot = this.dotSprite, pow = this.powerSprite;
    const items = game.items;
    const baseX = this.ox + this.shakeX, baseY = this.mazeOy + this.shakeY;
    const pulse = game.phase === 'playing' || view.demo ? 0.5 + 0.5 * Math.sin(view.time * 7) : 1;
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        const it = items[r * M.COLS + c];
        if (!it) continue;
        const x = baseX + (c * 8 + 4) * s, y = baseY + (r * 8 + 4) * s;
        if (it === M.ITEM.DOT) {
          ctx.drawImage(dot.canvas, Math.round(x - dot.half), Math.round(y - dot.half));
        } else {
          const k = 0.84 + pulse * 0.16;
          ctx.globalAlpha = 0.78 + pulse * 0.22;
          const w = pow.canvas.width * k;
          ctx.drawImage(pow.canvas, x - w / 2, y - w / 2, w, w);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }

  interp(a, alpha) {
    return { x: lerp(a.px, a.x, alpha), y: lerp(a.py, a.y, alpha) };
  }

  drawPacman(game, alpha) {
    const ctx = this.ctx;
    const p = game.pac;
    const { x, y } = this.interp(p, alpha);
    if (game.phase === 'deathAnim') {
      const t = 1 - game.phaseTimer / 110;
      const shrink = Math.min(1, Math.max(0, (t - 0.12) / 0.62));
      if (shrink < 1) {
        this.halo(x, y, 'rgba(255, 220, 60, 0.55)', 16, 0.6 * (1 - shrink));
        drawPacDeath(ctx, x, y, PAC_R, shrink);
      }
      return;
    }
    const cycle = (p.travel % 10) / 10;
    const mouth = game.phase === 'ready' || game.phase === 'levelDone' || game.phase === 'flash'
      ? (game.phase === 'ready' ? 0 : 0.5)
      : 0.92 * (0.5 - 0.5 * Math.cos(cycle * TAU));
    this.halo(x, y, 'rgba(255, 220, 60, 0.55)', 16, 0.75);
    drawPac(ctx, x, y, PAC_R, mouth, p.facing);
  }

  drawGhostActor(game, g, alpha, view) {
    if (game.phase === 'ghostEaten' && game.eaten && game.eaten.ghost === g) return;
    const { x, y } = this.interp(g, alpha);
    let mode = 'normal';
    if (g.state === 'eyes' || g.state === 'entering') mode = 'eyes';
    else if (g.frightened && game.frightActive) mode = game.frightFlashWhite ? 'flash' : 'fright';
    const color = GHOST_COLOR[g.name];
    const glowColor = mode === 'fright' ? 'rgba(60, 80, 255, 0.6)' : mode === 'flash' ? 'rgba(255,255,255,0.5)'
      : mode === 'eyes' ? 'rgba(160, 200, 255, 0.35)' : hexA(color, 0.5);
    this.halo(x, y, glowColor, mode === 'eyes' ? 9 : 15, 0.7);
    const frozen = ['dying', 'levelDone', 'ready'].includes(game.phase);
    const t = frozen ? g.idx : view.time * 9 + g.idx * 1.3;
    drawGhost(this.ctx, x, y, { color, dir: g.dir, t, mode });
  }

  drawLabel(text, x, y, size, color, center = false, outline = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${size}px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = center ? 'center' : 'left';
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(4, 5, 12, 0.92)';
      ctx.strokeText(text, x, y);
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = 2.5 * this.s;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawTopHud(game, view) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `8px ${FONT}`;
    ctx.textBaseline = 'top';
    const blinkOn = game.phase !== 'playing' || Math.floor(game.tick / 16) % 2 === 0;
    ctx.fillStyle = '#ffffff';
    if (view.demo) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9aa6d8';
      ctx.fillText('DEMO', 16, 1);
    } else if (blinkOn) {
      ctx.textAlign = 'left';
      ctx.fillText('1UP', 24, 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('HIGH SCORE', 112, 1);
    ctx.textAlign = 'right';
    ctx.fillText(game.score ? String(game.score) : '00', 56, 10);
    const hi = Math.max(view.highScore || 0, view.demo ? 0 : game.score);
    ctx.textAlign = 'center';
    ctx.fillText(hi ? String(hi) : '', 112, 10);
    ctx.restore();
  }

  drawBottomHud(game) {
    const ctx = this.ctx;
    const y = 280;
    const lives = Math.min(game.lives, 6);
    for (let i = 0; i < lives; i++) drawPac(ctx, 20 + i * 15, y, 5.6, 0.55, 1);
    const shelf = fruitShelf(game.level);
    for (let i = 0; i < shelf.length; i++) drawFruit(ctx, shelf[shelf.length - 1 - i], 204 - i * 15, y, 0.92);
  }

  /* ------------------------------------------------------- intermission */

  drawIntermission(game, view) {
    const ctx = this.ctx, s = this.s;
    ctx.setTransform(s, 0, 0, s, this.ox, this.mazeOy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, M.WIDTH, M.HEIGHT);
    ctx.clip();
    const t = 330 - game.phaseTimer;
    const act = game.intermission || 0;
    const titles = ['ACT I', 'ACT II', 'ACT III'];
    const names = ['THE CHASE', 'OUTNUMBERED', 'TURNABOUT'];
    const fade = Math.min(1, t / 20, game.phaseTimer / 20);
    ctx.globalAlpha = fade;
    this.drawLabel(titles[act], M.WIDTH / 2, 70, 8, '#ffe94a', true);
    this.drawLabel(names[act], M.WIDTH / 2, 84, 8, '#2ee8ff', true);
    ctx.globalAlpha = 1;

    const y = 150;
    const run = view.time * 9;
    const mouthAt = (k) => 0.92 * (0.5 - 0.5 * Math.cos(k * TAU));
    /* Floor line for the stage. */
    ctx.strokeStyle = 'rgba(61, 99, 255, 0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, y + 7.4); ctx.lineTo(M.WIDTH, y + 7.4); ctx.stroke();

    if (act === 0) {
      if (t < 160) {
        const px = lerp(260, -60, t / 160);
        this.halo(px, y, 'rgba(255,220,60,0.55)', 16, 0.7);
        drawPac(ctx, px, y, PAC_R, mouthAt(t / 9), 1);
        drawGhost(ctx, px + 26, y, { color: GHOST_COLOR.blinky, dir: 1, t: run });
      } else if (t > 170) {
        const k = (t - 170) / 160;
        const gx = lerp(-30, 300, k);
        drawGhost(ctx, gx, y, { color: GHOST_COLOR.blinky, dir: 3, t: run, mode: 'fright' });
        this.halo(gx - 44, y - 14.6, 'rgba(255,220,60,0.5)', 40, 0.7);
        drawPac(ctx, gx - 44, y - 14.6, 22, mouthAt(t / 12), 3);
      }
    } else {
      const names4 = ['blinky', 'pinky', 'inky', 'clyde'];
      const firstHalf = t < 160;
      const pacLeads = (act === 1) === firstHalf;
      const k = firstHalf ? t / 160 : (t - 170) / 160;
      if (!firstHalf && t <= 170) { ctx.restore(); return; }
      const goingLeft = firstHalf;
      const x0 = goingLeft ? lerp(260, -120, k) : lerp(-120, 260, k);
      const dir = goingLeft ? 1 : 3;
      const lead = goingLeft ? -1 : 1;
      if (pacLeads) {
        drawPac(ctx, x0 + lead * 4, y, PAC_R, mouthAt(t / 9), dir);
        names4.forEach((n, i) => drawGhost(ctx, x0 - lead * (22 + i * 16), y, { color: GHOST_COLOR[n], dir, t: run + i }));
      } else {
        names4.forEach((n, i) => drawGhost(ctx, x0 + lead * (8 + i * 16), y, { color: GHOST_COLOR[n], dir, t: run + i, mode: 'fright' }));
        drawPac(ctx, x0 - lead * 20, y, PAC_R, mouthAt(t / 9), dir);
      }
    }
    ctx.restore();
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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

