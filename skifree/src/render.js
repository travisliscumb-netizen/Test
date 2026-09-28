// Canvas renderer. Owns everything purely visual: the snow, ski tracks,
// particles, footprints and the camera transform. The simulation never reads
// anything from here.
import { CONFIG } from './config.js';
import { C } from './palette.js';
import { OBJECTS } from './objects.js';
import { SpriteCache, spriteBounds, makeCanvas } from './sprites.js';
import { drawSkier, drawBoarder, drawDog, drawYeti, drawChair, groundShadow } from './characters.js';
import { hash, hash01 } from './rng.js';

const TILE = 256;
const TALL = new Set(['tree_s', 'tree_m', 'tree_l', 'tree_snowy', 'tree_dead', 'lift_tower', 'sign', 'snowman']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

class Particles {
  constructor(max) {
    this.max = max;
    this.list = [];
    for (let i = 0; i < max; i++) this.list.push({ life: 0 });
    this.cursor = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size, color) {
    // Round-robin reuse: when full, the oldest particle is recycled.
    const p = this.list[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life;
    p.size = size;
    p.color = color;
    return p;
  }
  update(dt) {
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vz -= 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
        p.vx *= 0.85;
        p.vy *= 0.85;
      }
    }
  }
  clear() {
    for (const p of this.list) p.life = 0;
  }
}

export class Renderer {
  constructor(canvas, cfg = CONFIG) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cfg = cfg;
    this.sprites = new SpriteCache();
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.zoom = 1;
    this.tile = null;
    this.tileScale = 0;
    this.items = [];
    this.particles = new Particles(cfg.MAX_PARTICLES);
    this.reducedMotion = false;
    this.effects = true;
    this.time = 0;
    this.kick = 0; // brief impact shake
    this.reset();
  }

  reset() {
    this.tracks = new Array(this.cfg.TRACK_POINTS);
    this.trackHead = 0;
    this.trackCount = 0;
    this.lastTrack = null;
    this.prints = [];
    this.lastPrint = null;
    this.printSide = 1;
    this.craters = [];
    this.particles.clear();
    this.kick = 0;
    this.sprayAcc = 0;
  }

  // Sizes the backing store and picks a zoom that shows a consistent amount
  // of mountain whatever the screen: at least VIEW_MIN_W x VIEW_MIN_H units.
  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = clamp(dpr || 1, 1, 3);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    const c = this.cfg;
    // Small phones trade a little look-ahead for a readable skier.
    const needW = clamp(this.cssW, c.VIEW_SMALL_W, c.VIEW_MIN_W);
    const needH = clamp(this.cssH * 1.1, c.VIEW_SMALL_H, c.VIEW_MIN_H);
    this.zoom = clamp(Math.min(this.cssW / needW, this.cssH / needH), c.ZOOM_MIN, c.ZOOM_MAX);
    this.sprites.setScale(this.zoom * this.dpr);
  }

  get viewW() {
    return this.cssW / this.zoom;
  }
  get viewH() {
    return this.cssH / this.zoom;
  }

  // ------------------------------------------------------------- effects

  handleEvents(events, game) {
    const P = this.particles;
    const fx = this.effects;
    const many = (n) => Math.ceil(n * (fx ? 1 : 0.35));
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const def = OBJECTS[e.obj];
          const n = many(14 + Math.min(20, e.speed / 12));
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 30 + Math.random() * (40 + e.speed * 0.4);
            P.spawn(e.x, e.y, 2, Math.cos(a) * s, Math.sin(a) * s * 0.6, 80 + Math.random() * 160, 0.5 + Math.random() * 0.5, 1.5 + Math.random() * 2.2, '#ffffff');
          }
          // A tree shrugs the snow off its branches.
          if (def && def.h > 50) {
            for (let i = 0; i < many(12); i++) {
              P.spawn(e.x + (Math.random() - 0.5) * 30, e.y - 4, def.h * (0.4 + Math.random() * 0.5), (Math.random() - 0.5) * 30, 10, -20, 0.9 + Math.random() * 0.5, 1.4 + Math.random() * 1.6, '#ffffff');
            }
          }
          if (def && def.hit === 'crash') {
            this.craters.push({ x: e.x, y: e.y, age: 0 });
            if (this.craters.length > 30) this.craters.shift();
            this.kick = Math.max(this.kick, Math.min(1, e.speed / 300));
          }
          break;
        }
        case 'wipeout':
          this.craters.push({ x: e.x, y: e.y, age: 0 });
          this.kick = Math.max(this.kick, 0.6);
        // fallthrough
        case 'bump':
        case 'dog':
          for (let i = 0; i < many(18); i++) {
            const a = Math.random() * Math.PI * 2;
            P.spawn(e.x, e.y, 2, Math.cos(a) * 70, Math.sin(a) * 40, 90 + Math.random() * 120, 0.6, 1.6 + Math.random() * 1.8, '#ffffff');
          }
          break;
        case 'smash':
          for (let i = 0; i < many(30); i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 40 + Math.random() * 110;
            P.spawn(e.x, e.y, 10 + Math.random() * 25, Math.cos(a) * s, Math.sin(a) * s * 0.7, 60 + Math.random() * 180, 0.7 + Math.random() * 0.6, 2 + Math.random() * 3, '#ffffff');
          }
          break;
        case 'land':
        case 'mogul':
          for (let i = 0; i < many(e.type === 'land' ? 12 + e.air * 16 : 7); i++) {
            const a = Math.random() * Math.PI * 2;
            P.spawn(e.x, e.y, 1, Math.cos(a) * 60, Math.sin(a) * 30, 60 + Math.random() * 70, 0.45, 1.3 + Math.random() * 1.5, '#ffffff');
          }
          break;
        case 'ramp':
          for (let i = 0; i < many(10); i++) {
            P.spawn(e.x + (Math.random() - 0.5) * 20, e.y, 2, (Math.random() - 0.5) * 50, e.speed * 0.3, 140 + Math.random() * 100, 0.6, 1.5 + Math.random() * 1.5, '#ffffff');
          }
          break;
        case 'yetibonk':
          for (let i = 0; i < many(20); i++) {
            const a = Math.random() * Math.PI * 2;
            P.spawn(e.x, e.y, 40 + Math.random() * 40, Math.cos(a) * 60, Math.sin(a) * 30, 40, 1, 1.6 + Math.random() * 2, '#ffffff');
          }
          break;
        case 'caught':
          this.kick = 1;
          break;
      }
    }
  }

  // Samples the skier into the track ring buffer and emits spray.
  updateEffects(game, dt) {
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 3);
    this.particles.update(dt);
    const p = game.player;
    const c = this.cfg;

    // Ski tracks: two grooves, broken whenever the skis leave the snow.
    const grounded = p.state === 'ski' && p.z <= 0;
    if (grounded) {
      const last = this.lastTrack;
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= c.TRACK_SPACING) {
        const pt = { x: p.x, y: p.y, h: p.heading, w: 3.3 + p.skid * 2.2, brk: !last };
        this.tracks[this.trackHead] = pt;
        this.trackHead = (this.trackHead + 1) % this.tracks.length;
        this.trackCount = Math.min(this.trackCount + 1, this.tracks.length);
        this.lastTrack = pt;
      }
    } else {
      this.lastTrack = null;
    }

    // Spray off the skis: speed, carving and turbo all add to it.
    if (grounded && p.speed > 60) {
      const fast = p.speed / c.TURBO_SPEED;
      let rate = (fast * fast * 60 + p.skid * 140 + (p.turbo ? 90 : 0)) * (this.effects ? 1 : 0.3);
      this.sprayAcc += rate * dt;
      const back = Math.sin(p.travel), down = Math.cos(p.travel);
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const out = side * (30 + p.skid * 90 + Math.random() * 40);
        this.particles.spawn(
          p.x - back * 6 + (Math.random() - 0.5) * 6,
          p.y - down * 4,
          1 + Math.random() * 3,
          Math.cos(p.travel) * out - back * p.speed * 0.25,
          -Math.sin(p.travel) * out * 0.5 - down * p.speed * 0.22,
          60 + Math.random() * (80 + fast * 80),
          0.35 + Math.random() * (0.3 + fast * 0.4),
          1 + Math.random() * (1.2 + fast * 1.2),
          Math.random() < 0.3 ? '#dfeaf7' : '#ffffff',
        );
      }
    }

    // Yeti footprints.
    const y = game.yeti;
    if (y && y.state !== 'eat' && y.state !== 'gone' && y.speed > 20) {
      const lp = this.lastPrint;
      if (!lp || Math.hypot(y.x - lp.x, y.y - lp.y) > 22) {
        this.printSide = -this.printSide;
        const px = y.x + Math.cos(y.heading) * 7 * this.printSide;
        const py = y.y - Math.sin(y.heading) * 5 * this.printSide;
        this.lastPrint = { x: y.x, y: y.y };
        this.prints.push({ x: px, y: py, h: y.heading });
        if (this.prints.length > 160) this.prints.shift();
        if (this.effects && Math.random() < 0.6) {
          this.particles.spawn(px, py, 1, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, 50, 0.4, 1.4, '#ffffff');
        }
      }
    }
  }

  // ------------------------------------------------------------- drawing

  // shiftX/shiftY move the skier on screen (CSS px): the title screen uses it
  // to keep the attract-mode skier out from behind the menu.
  draw(game, shiftX = 0, shiftY = 0) {
    const ctx = this.ctx;
    let v = game.view;
    const zoomEff = this.zoom / game.zoomMul;
    const k = zoomEff * this.dpr;

    // Camera wobble: turbo hum plus impact kicks, both off under reduced motion.
    let sx = 0, sy = 0;
    if (!this.reducedMotion) {
      const amp = game.shake * this.cfg.CAMERA_SHAKE_TURBO + this.kick * 3;
      sx = Math.sin(this.time * 53) * amp;
      sy = Math.cos(this.time * 47) * amp * 0.6;
    }
    const ox = v.x0 + sx - shiftX / zoomEff, oy = v.y0 + sy - shiftY / zoomEff;
    if (shiftX || shiftY) {
      // Widen the rect used for culling to what is actually on screen.
      v = { ...v, x0: ox, x1: ox + v.w, y0: oy, y1: oy + v.h };
    }
    ctx.setTransform(k, 0, 0, k, -ox * k, -oy * k);
    ctx.imageSmoothingEnabled = true;

    this.drawSnow(ctx, v);
    this.drawDecals(ctx, game, v);
    this.drawTracks(ctx, v);
    this.drawScene(ctx, game, v);
    this.drawParticles(ctx, v);
    this.drawLift(ctx, game, v);

    // Screen-space overlays.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(ctx, game, v, zoomEff);
  }

  buildTile() {
    const s = this.sprites.scale;
    if (this.tile && this.tileScale === s) return;
    this.tileScale = s;
    const cv = makeCanvas(Math.round(TILE * s), Math.round(TILE * s));
    const ctx = cv.getContext('2d');
    ctx.scale(cv.width / TILE, cv.height / TILE);
    ctx.fillStyle = C.snow;
    ctx.fillRect(0, 0, TILE, TILE);
    // Wrapped draws make the tile seamless.
    const wrap = (fn) => {
      for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) fn(dx, dy);
    };
    let seed = 7;
    const rnd = () => hash01(seed++, 3);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * TILE, y = rnd() * TILE, r = 30 + rnd() * 60;
      wrap((dx, dy) => {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, 'rgba(214, 226, 242, 0.35)');
        g.addColorStop(1, 'rgba(214, 226, 242, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      });
    }
    // Wind ripples: faint curved strokes across the slope.
    ctx.strokeStyle = 'rgba(190, 208, 232, 0.35)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 14; i++) {
      const x = rnd() * TILE, y = rnd() * TILE, w = 10 + rnd() * 22;
      wrap((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx - w, y + dy);
        ctx.quadraticCurveTo(x + dx, y + dy - 2.5, x + dx + w, y + dy);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 160; i++) {
      const x = rnd() * TILE, y = rnd() * TILE;
      ctx.fillStyle = i % 5 ? 'rgba(150, 175, 212, 0.28)' : 'rgba(255, 255, 255, 1)';
      ctx.fillRect(x, y, 0.9 + rnd() * 0.8, 0.9 + rnd() * 0.8);
    }
    this.tile = cv;
  }

  drawSnow(ctx, v) {
    this.buildTile();
    const x0 = Math.floor(v.x0 / TILE) * TILE;
    const y0 = Math.floor(v.y0 / TILE) * TILE;
    for (let y = y0; y < v.y1; y += TILE) {
      for (let x = x0; x < v.x1; x += TILE) ctx.drawImage(this.tile, x, y, TILE + 0.5, TILE + 0.5);
    }
    // Broad, soft undulations in the slope: cheap depth cue, deterministic.
    const S = 520;
    for (let gy = Math.floor(v.y0 / S) - 1; gy <= Math.floor(v.y1 / S) + 1; gy++) {
      for (let gx = Math.floor(v.x0 / S) - 1; gx <= Math.floor(v.x1 / S) + 1; gx++) {
        const hsh = hash(gx, gy, 77);
        const cx = (gx + (hsh & 255) / 255) * S;
        const cy = (gy + ((hsh >> 8) & 255) / 255) * S;
        const r = 160 + ((hsh >> 16) & 127);
        if (cx + r < v.x0 || cx - r > v.x1 || cy + r < v.y0 || cy - r > v.y1) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(196, 212, 234, 0.22)');
        g.addColorStop(1, 'rgba(196, 212, 234, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }

  drawDecals(ctx, game, v) {
    // Body-shaped dents where the skier went down.
    for (const c of this.craters) {
      if (c.y < v.y0 - 20 || c.y > v.y1 + 20) continue;
      ctx.fillStyle = 'rgba(160, 184, 216, 0.35)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 11, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of game.decals) {
      if (d.y < v.y0 - 20 || d.y > v.y1 + 20) continue;
      if (d.kind === 'yellow') {
        ctx.fillStyle = 'rgba(236, 206, 70, 0.7)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 3.4, 1.8, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Yeti footprints: three toes and a heel.
    ctx.fillStyle = 'rgba(128, 152, 190, 0.42)';
    for (const f of this.prints) {
      if (f.y < v.y0 - 20 || f.y > v.y1 + 20 || f.x < v.x0 - 20 || f.x > v.x1 + 20) continue;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 3.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      const dx = Math.sin(f.h), dy = Math.cos(f.h);
      for (const t of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.arc(f.x + dx * 4.2 + dy * t * 2.2, f.y + dy * 3 - dx * t * 1.5, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTracks(ctx, v) {
    const n = this.trackCount;
    if (n < 2) return;
    const N = this.tracks.length;
    const start = (this.trackHead - n + N) % N;
    ctx.strokeStyle = C.track;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let prev = null;
      for (let i = 0; i < n; i++) {
        const t = this.tracks[(start + i) % N];
        const inView = t.y > v.y0 - 30 && t.y < v.y1 + 30 && t.x > v.x0 - 30 && t.x < v.x1 + 30;
        const px = t.x + Math.cos(t.h) * t.w * side;
        const py = t.y - Math.sin(t.h) * t.w * side * 0.72 + 1;
        if (prev && !t.brk && inView) {
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(px, py);
        }
        prev = [px, py];
      }
      ctx.stroke();
    }
  }

  drawScene(ctx, game, v) {
    const items = this.items;
    items.length = 0;
    // Tall sprites extend far above their footprint, so look below the view.
    game.world.forEachInRect(v.x0 - 40, v.y0 - 30, v.x1 + 40, v.y1 + 170, (o) => {
      if (o.t === 'gate') return;
      items.push({ y: o.y, o, k: 0 });
    });
    for (const a of game.actors) {
      if (a.x > v.x0 - 40 && a.x < v.x1 + 40 && a.y > v.y0 - 30 && a.y < v.y1 + 60) items.push({ y: a.y, o: a, k: 1 });
    }
    const p = game.player;
    if (p.state !== 'caught') items.push({ y: p.y, o: p, k: 2 });
    if (game.yeti && game.yeti.state !== 'gone') items.push({ y: game.yeti.y, o: game.yeti, k: 3 });
    items.sort((a, b) => a.y - b.y);

    // Shadows of airborne characters first, so they lie on the snow beneath.
    for (const it of items) {
      if (it.k === 0) continue;
      ctx.save();
      ctx.translate(it.o.x, it.o.y);
      groundShadow(ctx, it.k === 3 ? 20 * this.cfg.YETI_DRAW_SCALE : it.o.kind === 'dog' ? 8 : 10, it.o.z || 0);
      ctx.restore();
    }

    let playerHidden = false;
    let playerIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const o = it.o;
      if (it.k === 0) {
        const spr = this.sprites.get(o);
        ctx.drawImage(spr.cv, o.x + spr.x, o.y + spr.y, spr.w, spr.h);
        // Does something tall now cover the skier?
        if (playerIndex >= 0 && TALL.has(o.t) && !playerHidden) {
          const b = spriteBounds(o.t);
          const top = p.y - 30 - p.z;
          if (p.x + 8 > o.x + b[0] + 4 && p.x - 8 < o.x + b[0] + b[2] - 4 && p.y > o.y + b[1] + 6 && top < o.y) playerHidden = true;
        }
        continue;
      }
      ctx.save();
      ctx.translate(o.x, o.y);
      if (it.k === 2) {
        playerIndex = i;
        this.drawPlayer(ctx, o);
      } else if (it.k === 1) {
        if (o.kind === 'dog') drawDog(ctx, o);
        else if (o.kind === 'boarder') drawBoarder(ctx, { ...o, outfit: 1 + (o.look % 5) });
        else drawSkier(ctx, { ...o, travel: o.heading, outfit: 1 + (o.look % 5), tucking: false, braking: o.beginner && o.state === 'go', stateTime: 0 });
      } else {
        ctx.scale(this.cfg.YETI_DRAW_SCALE, this.cfg.YETI_DRAW_SCALE);
        drawYeti(ctx, { ...o, outfit: 0 });
      }
      ctx.restore();
    }
    // Keep the skier readable behind trees: a ghosted silhouette on top.
    if (playerHidden) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.translate(p.x, p.y);
      this.drawPlayer(ctx, p);
      ctx.restore();
    }
  }

  drawPlayer(ctx, p) {
    // Blink while ghosting through obstacles after getting up.
    if (p.grace > 0 && Math.floor(p.grace * 12) % 2 === 0) ctx.globalAlpha *= 0.55;
    drawSkier(ctx, { ...p, outfit: 0 });
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx, v) {
    for (const q of this.particles.list) {
      if (q.life <= 0) continue;
      if (q.x < v.x0 - 10 || q.x > v.x1 + 10 || q.y < v.y0 - 10 || q.y > v.y1 + 60) continue;
      const a = Math.min(1, q.life / (q.max * 0.5));
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y - q.z, q.size, 0, Math.PI * 2);
      ctx.fill();
      // A faint rim so white spray reads against white snow.
      ctx.strokeStyle = 'rgba(120, 150, 195, 0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Cable and chairs overhead: drawn above everything, with ground shadows.
  drawLift(ctx, game, v) {
    const cfg = this.cfg;
    const world = game.world;
    const H = 150; // cable height above the snow
    const end = world.liftEnd();
    const yA = Math.max(0, v.y0 - 60), yB = Math.min(end, v.y1 + H + 60);
    if (yA > yB || cfg.LIFT_X + 30 < v.x0 || cfg.LIFT_X - 30 > v.x1) return;
    const spacing = 170;
    const speed = 42;
    const t = game.time + 1000;
    const lanes = [
      { x: cfg.LIFT_X - 13, dir: -1 }, // loaded chairs going up
      { x: cfg.LIFT_X + 13, dir: 1 }, // empties coming down
    ];
    // Shadows.
    ctx.fillStyle = 'rgba(38, 66, 112, 0.12)';
    for (const lane of lanes) {
      const off = (((t * speed * lane.dir) % spacing) + spacing) % spacing;
      for (let y = Math.floor(yA / spacing) * spacing + off; y < yB; y += spacing) {
        ctx.beginPath();
        ctx.ellipse(lane.x + 22, y + 8, 9, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Cables.
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;
    for (const lane of lanes) {
      ctx.beginPath();
      ctx.moveTo(lane.x, yA - H);
      ctx.lineTo(lane.x, yB - H);
      ctx.stroke();
    }
    // Chairs.
    for (const lane of lanes) {
      const off = (((t * speed * lane.dir) % spacing) + spacing) % spacing;
      for (let y = Math.floor(yA / spacing) * spacing + off; y < yB; y += spacing) {
        const id = Math.round((y - off) / spacing);
        const hsh = hash(id, lane.dir + 5);
        const riders = lane.dir < 0 ? hsh % 3 : hsh % 7 === 0 ? 1 : 0;
        ctx.save();
        ctx.translate(lane.x, y - H);
        drawChair(ctx, riders, [(hsh >> 4) & 7, (hsh >> 8) & 7]);
        ctx.restore();
      }
    }
  }

  drawOverlays(ctx, game, v, zoomEff) {
    const W = this.cssW, H = this.cssH;
    const p = game.player;
    const c = this.cfg;

    // Turbo: faint speed streaks racing up the screen.
    if (p.turbo && p.onGround && !this.reducedMotion) {
      const fast = clamp((p.speed - c.PLAYER_SPEED) / (c.TURBO_SPEED - c.PLAYER_SPEED), 0, 1);
      ctx.strokeStyle = `rgba(150, 180, 220, ${0.28 * fast})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const x = ((hash(i, 9) % 1000) / 1000) * W;
        const len = 40 + (hash(i, 10) % 80);
        const y = H - ((this.time * (900 + (hash(i, 11) % 500)) + (hash(i, 12) % 1000)) % (H + len));
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
      }
      ctx.stroke();
    }

    // Where is the yeti? An edge marker whenever it's off screen.
    const y = game.yeti;
    if (y && (y.state === 'chase' || y.state === 'stumble')) {
      const sx = (y.x - v.x0) * zoomEff, sy = (y.y - 30 - v.y0) * zoomEff;
      const m = 26;
      if (sx < 0 || sx > W || sy < 0 || sy > H) {
        const cx = W / 2, cy = H / 2;
        const dx = sx - cx, dy = sy - cy;
        const s = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m) / Math.abs(dy || 1e-3));
        const ex = cx + dx * s, ey = cy + dy * s;
        const a = Math.atan2(dy, dx);
        const pulse = 1 + Math.sin(this.time * 9) * 0.12;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(224, 57, 62, 0.92)';
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(13, -6);
        ctx.lineTo(13, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-a);
        // Mini yeti face.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.yetiFace;
        ctx.beginPath();
        ctx.ellipse(0, 1, 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.outline;
        ctx.fillRect(-3.5, -1.5, 2, 2);
        ctx.fillRect(1.5, -1.5, 2, 2);
        ctx.fillStyle = C.mouth;
        ctx.beginPath();
        ctx.ellipse(0, 3, 3, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Danger vignette as it closes in.
      const d = y.distanceTo(p);
      const near = clamp(1 - (d - 60) / 360, 0, 1);
      if (near > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(224, 57, 62, 0)');
        g.addColorStop(1, `rgba(224, 57, 62, ${0.16 * near})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
}
