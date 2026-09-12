/* Canvas renderer.

   Projection is a FIXED 2:1 dimetric ("2.5D"): world X runs down-right, world Z
   runs down-left, world Y is straight up the screen. It never rotates, never
   tilts and never swings -- the only camera motion is a vertical follow so the
   landing surface stays at a constant screen position. That is deliberate:
   placement is a 1-D alignment problem and the picture must never make the
   player re-derive where the edges are.

   A real 3D engine would buy nothing here (fixed camera, no intersecting
   geometry, painter's order is simply bottom-to-top) and would cost a large
   download plus GPU time on a phone. Hand-projected faces with per-face
   lighting and bevels give the same look at a fraction of the budget. */

import { BLOCK_H } from './config.js';

const ANCHOR = 0.44;         // landing surface sits here down the viewport,
                             // leaving the tower to fill the space below it
const MAX_PARTICLES = 260;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${h.toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`
         : `hsl(${h.toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}% / ${a})`;

/* deterministic noise so scenery is identical every load */
function srand(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 0; this.H = 0; this.dpr = 1;
    this.K = 60;
    this.cam = { x: 0, y: 0, z: 0 };
    this.camTarget = { x: 0, y: 0, z: 0 };
    this.ox = 0; this.oy = 0;
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.ambient = [];
    this.flashA = 0; this.flashColor = '#fff';
    this.pulse = 0; this.shake = 0;
    this.world = null;
    this.bg = null;
    this.travel = 1.3;
    this.time = 0;
    this.guideA = 0;
  }

  /* ------------------------------------------------------------- layout -- */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._computeScale();
    this._buildBackground();
    this._seedAmbient();
  }

  setLevel(cfg) {
    this.travel = cfg.travel;
    this._computeScale();
    this.cam = { x: 0, y: 0, z: 0 };
    this.camTarget = { x: 0, y: 0, z: 0 };
    this.particles.length = 0; this.rings.length = 0; this.popups.length = 0;
    this.flashA = 0; this.pulse = 0; this.shake = 0; this.guideA = 0;
  }

  setWorld(world) {
    if (this.world && this.world.id === world.id) return;
    this.world = world;
    this._buildBackground();
    this._seedAmbient();
  }

  _computeScale() {
    if (!this.W) return;
    // Fit the full travel path across the viewport with a comfortable margin,
    // and never let a large screen inflate blocks past a readable size.
    const byWidth = (this.W * 0.94) / (2 * (1 + this.travel));
    const byHeight = this.H * 0.155;
    this.K = Math.max(26, Math.min(byWidth, byHeight, 124));
  }

  /* --------------------------------------------------------- projection -- */
  px(x, z) { return (x - z) * this.K + this.ox; }
  py(x, y, z) { return (x + z) * this.K * 0.5 - y * this.K + this.oy; }

  _updateCamera(game, dt) {
    const top = game.top;
    this.camTarget.x = top.x;
    this.camTarget.z = top.z;
    this.camTarget.y = top.y + BLOCK_H;
    const k = 1 - Math.pow(0.0016, dt);      // frame-rate independent smoothing
    this.cam.x = lerp(this.cam.x, this.camTarget.x, k);
    this.cam.z = lerp(this.cam.z, this.camTarget.z, k);
    this.cam.y = lerp(this.cam.y, this.camTarget.y, k);
    this.ox = this.W / 2 - (this.cam.x - this.cam.z) * this.K;
    this.oy = this.H * ANCHOR - ((this.cam.x + this.cam.z) * this.K * 0.5 - this.cam.y * this.K);
  }

  /* ------------------------------------------------------------ effects -- */
  addParticles(n, o) {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.45 + Math.random() * 0.75);
      this.particles.push({
        x: o.x + (Math.random() - 0.5) * (o.spread || 0),
        y: o.y + Math.random() * 0.04,
        z: o.z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        vy: (o.up || 0.9) * (0.5 + Math.random()),
        life: o.life * (0.65 + Math.random() * 0.6), max: o.life,
        size: o.size * (0.6 + Math.random() * 0.8),
        color: o.color, grav: o.grav === undefined ? 3.4 : o.grav,
        kind: o.kind || 'spark'
      });
    }
  }

  addRing(x, y, z, color, maxR = 1.1, life = 0.5, width = 3) {
    this.rings.push({ x, y, z, r: 0.12, maxR, life, max: life, color, width });
  }

  addPopup(text, wx, wy, wz, color, size = 20) {
    this.popups.push({ text, x: this.px(wx, wz), y: this.py(wx, wy, wz), life: 0.9, max: 0.9, color, size });
  }

  flash(color, a = 0.22) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  kick(amount = 0.016) { this.pulse = Math.max(this.pulse, amount); }
  shakeBy(amount) { this.shake = Math.max(this.shake, amount); }

  /* --------------------------------------------------------- background -- */
  _buildBackground() {
    if (!this.W || !this.world) return;
    const w = this.W, h = Math.round(this.H * 1.45);
    const c = document.createElement('canvas');
    const dpr = Math.min(this.dpr, 2);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = this.world;

    const sky = g.createLinearGradient(0, 0, 0, h);
    P.sky.forEach((col, i) => sky.addColorStop(i / (P.sky.length - 1), col));
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    const R = srand(P.id * 7919 + 13);
    const horizon = h * 0.62;
    SCENERY[P.scenery](g, w, h, horizon, R, P);

    // vignette keeps the eye on the tower
    const vg = g.createRadialGradient(w / 2, h * 0.62, Math.min(w, h) * 0.30, w / 2, h * 0.62, Math.max(w, h) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);

    this.bg = c;
    this.bgH = h;
    // Climbing must push the horizon DOWN the screen, never drag the ground up
    // into view. Start with the horizon at 72% and let it descend to ~90%.
    this.bgTop = -(horizon - this.H * 0.72);
    this.bgShift = Math.max(0, -this.bgTop);
  }

  _seedAmbient() {
    this.ambient.length = 0;
    if (!this.world || !this.W) return;
    const kind = this.world.ambient;
    if (kind === 'none') return;
    const counts = { snow: 46, ember: 34, bubble: 26, star: 60, sand: 30 };
    const n = counts[kind] || 0;
    for (let i = 0; i < n; i++) {
      this.ambient.push({
        x: Math.random() * this.W,
        y: Math.random() * this.H,
        r: kind === 'star' ? 0.6 + Math.random() * 1.5 : 1 + Math.random() * 2.6,
        v: 0.3 + Math.random(),
        p: Math.random() * Math.PI * 2,
        kind
      });
    }
  }

  _drawAmbient(dt) {
    const ctx = this.ctx;
    if (!this.ambient.length) return;
    const W = this.W, H = this.H;
    for (const a of this.ambient) {
      a.p += dt * (0.6 + a.v);
      if (a.kind === 'snow') {
        a.y += (12 + a.v * 26) * dt; a.x += Math.sin(a.p) * 9 * dt;
        if (a.y > H) { a.y = -4; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(a.p) ** 2})`;
      } else if (a.kind === 'ember') {
        a.y -= (26 + a.v * 40) * dt; a.x += Math.sin(a.p * 1.4) * 12 * dt;
        if (a.y < -4) { a.y = H + 4; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,${120 + Math.floor(80 * Math.sin(a.p))},60,${0.35 + 0.3 * Math.sin(a.p) ** 2})`;
      } else if (a.kind === 'bubble') {
        a.y -= (16 + a.v * 22) * dt; a.x += Math.sin(a.p) * 7 * dt;
        if (a.y < -6) { a.y = H + 6; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(210,255,250,${0.16 + 0.14 * Math.sin(a.p) ** 2})`;
      } else if (a.kind === 'sand') {
        a.x += (18 + a.v * 30) * dt; a.y += Math.sin(a.p) * 5 * dt;
        if (a.x > W + 4) { a.x = -4; a.y = Math.random() * H; }
        ctx.fillStyle = `rgba(255,230,180,${0.16 + 0.12 * Math.sin(a.p) ** 2})`;
      } else { // star
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.6 * Math.abs(Math.sin(a.p * 0.7))})`;
      }
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------- blocks -- */
  _faceColors(c) {
    return {
      top: hsl(c.h, c.s * 0.96, c.l + 14),
      inner: hsl(c.h, c.s * 0.92, c.l + 20),
      right: hsl(c.h, c.s, c.l - 3),
      rightLo: hsl(c.h + 2, c.s, c.l - 12),
      left: hsl(c.h + 5, c.s * 0.95, c.l - 16),
      leftLo: hsl(c.h + 7, c.s * 0.95, c.l - 25),
      edge: hsl(c.h, c.s * 0.8, c.l + 30)
    };
  }

  drawBlock(b, opts = {}) {
    const ctx = this.ctx;
    const settle = opts.settle === undefined ? (b.settle || 0) : opts.settle;
    const squash = settle > 0 ? Math.sin(settle * Math.PI) : 0;
    const hs = 1 - 0.20 * squash;
    const ws = 1 + 0.09 * squash;
    const shear = opts.shear || 0;

    const w2 = (b.w * ws) / 2, d2 = (b.d * ws) / 2;
    const yb = b.y, yt = b.y + BLOCK_H * hs;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (alpha <= 0.01) return;

    const Ax = this.px(b.x - w2, b.z - d2) + shear, Ay = this.py(b.x - w2, yt, b.z - d2);
    const Bx = this.px(b.x + w2, b.z - d2) + shear, By = this.py(b.x + w2, yt, b.z - d2);
    const Cx = this.px(b.x + w2, b.z + d2) + shear, Cy = this.py(b.x + w2, yt, b.z + d2);
    const Dx = this.px(b.x - w2, b.z + d2) + shear, Dy = this.py(b.x - w2, yt, b.z + d2);
    const Bbx = this.px(b.x + w2, b.z - d2), Bby = this.py(b.x + w2, yb, b.z - d2);
    const Cbx = this.px(b.x + w2, b.z + d2), Cby = this.py(b.x + w2, yb, b.z + d2);
    const Dbx = this.px(b.x - w2, b.z + d2), Dby = this.py(b.x - w2, yb, b.z + d2);

    const col = this._faceColors(b.color);
    if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }

    // +x face (screen right)
    let g = ctx.createLinearGradient(Bx, By, Cbx, Cby);
    g.addColorStop(0, col.right); g.addColorStop(1, col.rightLo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Cbx, Cby); ctx.lineTo(Bbx, Bby); ctx.closePath(); ctx.fill();

    // +z face (screen left)
    g = ctx.createLinearGradient(Dx, Dy, Cbx, Cby);
    g.addColorStop(0, col.left); g.addColorStop(1, col.leftLo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.lineTo(Dbx, Dby); ctx.lineTo(Cbx, Cby); ctx.closePath(); ctx.fill();

    // ambient occlusion along the ground contact
    ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(Bbx, Bby); ctx.lineTo(Cbx, Cby); ctx.lineTo(Dbx, Dby); ctx.stroke();

    // top face
    ctx.fillStyle = col.top;
    ctx.beginPath(); ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.closePath(); ctx.fill();

    // chamfer: an inset top plate reads as a bevelled edge without extra geometry
    const cx = (Ax + Bx + Cx + Dx) / 4, cy = (Ay + By + Cy + Dy) / 4;
    const span = Math.abs(Bx - Dx);
    const inset = clamp(span * 0.055, 1.2, 7);
    const t = clamp(inset / Math.max(8, span * 0.5), 0.02, 0.3);
    ctx.fillStyle = col.inner;
    ctx.beginPath();
    ctx.moveTo(lerp(Ax, cx, t), lerp(Ay, cy, t));
    ctx.lineTo(lerp(Bx, cx, t), lerp(By, cy, t));
    ctx.lineTo(lerp(Cx, cx, t), lerp(Cy, cy, t));
    ctx.lineTo(lerp(Dx, cx, t), lerp(Dy, cy, t));
    ctx.closePath(); ctx.fill();

    // specular sheen across the top plate
    g = ctx.createLinearGradient(Ax, Ay, Cx, Cy);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.closePath(); ctx.fill();

    // crisp top edge
    ctx.strokeStyle = col.edge; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.closePath(); ctx.stroke();

    if (opts.fog > 0 && this.world) {
      ctx.save();
      ctx.globalAlpha = opts.fog;
      ctx.fillStyle = this.world.fog;
      ctx.beginPath();
      ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Bbx, Bby);
      ctx.lineTo(Cbx, Cby); ctx.lineTo(Dbx, Dby); ctx.lineTo(Dx, Dy);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (opts.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = opts.glow;
      ctx.lineWidth = 2 + 3 * opts.glowAmount;
      ctx.globalAlpha = 0.5 * opts.glowAmount;
      ctx.beginPath(); ctx.moveTo(Ax, Ay); ctx.lineTo(Bx, By); ctx.lineTo(Cx, Cy); ctx.lineTo(Dx, Dy); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    if (alpha < 1) ctx.restore();
  }

  _topFacePath(ctx, b, y) {
    const w2 = b.w / 2, d2 = b.d / 2;
    ctx.beginPath();
    ctx.moveTo(this.px(b.x - w2, b.z - d2), this.py(b.x - w2, y, b.z - d2));
    ctx.lineTo(this.px(b.x + w2, b.z - d2), this.py(b.x + w2, y, b.z - d2));
    ctx.lineTo(this.px(b.x + w2, b.z + d2), this.py(b.x + w2, y, b.z + d2));
    ctx.lineTo(this.px(b.x - w2, b.z + d2), this.py(b.x - w2, y, b.z + d2));
    ctx.closePath();
  }

  /* The single most important readability aid: the incoming block's footprint
     projected onto the landing surface, drawn darker where it actually
     overlaps. The player reads the cut before committing instead of guessing
     what the perspective is doing. */
  _drawLandingShadow(game) {
    const a = game.active;
    if (!a) return;
    const ctx = this.ctx;
    const top = game.top;
    const y = top.y + BLOCK_H;
    const foot = {
      x: a.axis === 'x' ? a.pos : top.x,
      z: a.axis === 'z' ? a.pos : top.z,
      w: a.w, d: a.d
    };
    const height = (a.y - y) / BLOCK_H;
    const soft = clamp(1 - height * 0.12, 0.5, 1);

    ctx.save();
    ctx.globalAlpha = 0.11 * soft;
    ctx.fillStyle = '#000';
    this._topFacePath(ctx, foot, y + 0.002);
    ctx.fill();
    ctx.restore();

    ctx.save();
    this._topFacePath(ctx, top, y + 0.003);
    ctx.clip();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#000';
    this._topFacePath(ctx, foot, y + 0.003);
    ctx.fill();
    ctx.restore();
  }

  _drawGuides(game, accent) {
    const a = game.active;
    if (!a || this.guideA <= 0.01) return;
    const ctx = this.ctx;
    const top = game.top;
    const y = top.y + BLOCK_H + 0.004;
    const w2 = top.w / 2, d2 = top.d / 2;
    const ext = a.range + 0.08;
    ctx.save();
    ctx.globalAlpha = this.guideA * 0.30;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 9]);
    const lines = a.axis === 'x'
      ? [[[top.x - ext, top.z - d2], [top.x + ext, top.z - d2]],
         [[top.x - ext, top.z + d2], [top.x + ext, top.z + d2]]]
      : [[[top.x - w2, top.z - ext], [top.x - w2, top.z + ext]],
         [[top.x + w2, top.z - ext], [top.x + w2, top.z + ext]]];
    for (const [p0, p1] of lines) {
      ctx.beginPath();
      ctx.moveTo(this.px(p0[0], p0[1]), this.py(p0[0], y, p0[1]));
      ctx.lineTo(this.px(p1[0], p1[1]), this.py(p1[0], y, p1[1]));
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawGroundShadow(game) {
    const ctx = this.ctx;
    const base = game.blocks[0];
    const cx = this.px(base.x, base.z);
    const cy = this.py(base.x, base.y, base.z);
    if (cy < -80 || cy > this.H + 160) return;
    const rx = this.K * 2.1, ry = this.K * 1.05;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* --------------------------------------------------------------- draw -- */
  frame(game, dt, opts = {}) {
    const ctx = this.ctx;
    this.time += dt;
    this._updateCamera(game, dt);

    const P = this.world;
    const accent = P ? P.accent : '#fff';

    this.guideA = lerp(this.guideA, game.active && !opts.paused ? 1 : 0, 1 - Math.pow(0.004, dt));
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.pulse = Math.max(0, this.pulse - dt * 0.09);
    this.shake = Math.max(0, this.shake - dt * 26);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // background + parallax
    if (this.bg) {
      const py = clamp(this.cam.y * this.K * 0.05, 0, this.bgShift);
      ctx.drawImage(this.bg, 0, this.bgTop + py, this.W, this.bgH);
    } else {
      ctx.fillStyle = '#101018'; ctx.fillRect(0, 0, this.W, this.H);
    }
    this._drawAmbient(dt);

    // Menus sit on the live world environment. Drawing the tower behind them
    // only fights the logo and the cards for attention.
    if (opts.menu) { ctx.globalAlpha = 1; return; }

    ctx.save();
    if (this.pulse > 0.0005 || this.shake > 0.05) {
      const s = 1 + this.pulse;
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(this.W / 2 + sx, this.H * ANCHOR + sy);
      ctx.scale(s, s);
      ctx.translate(-this.W / 2, -this.H * ANCHOR);
    }

    this._drawGroundShadow(game);

    // Cull to the viewport: a 40-block tower only ever shows ~12 blocks.
    const blocks = game.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const sy = this.py(b.x, b.y + BLOCK_H, b.z);
      if (sy < -this.K * 2) continue;
      if (sy > this.H + this.K * 2) continue;
      const depth = blocks.length - 1 - i;
      this.drawBlock(b, { fog: depth > 14 ? Math.min(0.62, (depth - 14) * 0.05) : 0 });
    }

    this._drawGuides(game, accent);
    this._drawLandingShadow(game);

    // debris
    for (const d of game.debris) {
      const age = 1 - d.life / 2.2;
      this.drawBlock(d, { alpha: clamp(d.life * 1.4, 0, 1), settle: 0, shear: (d.spin || 0) * age * 22 });
    }

    // active block
    if (game.active && !opts.hideActive) {
      const a = game.active;
      const blk = {
        x: a.axis === 'x' ? a.pos : game.top.x,
        z: a.axis === 'z' ? a.pos : game.top.z,
        y: a.y, w: a.w, d: a.d, color: a.color, settle: 0
      };
      const g = 0.55 + 0.32 * Math.sin(this.time * 5);
      this.drawBlock(blk, { glow: accent, glowAmount: g });
    }

    this._drawParticles(dt);
    this._drawRings(dt);
    ctx.restore();

    this._drawPopups(dt);

    if (this.flashA > 0.002) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();
    }
  }

  _drawParticles(dt) {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const a = clamp(p.life / p.max, 0, 1);
      const sx = this.px(p.x, p.z), sy = this.py(p.x, p.y, p.z);
      if (sx < -30 || sx > this.W + 30 || sy < -30 || sy > this.H + 30) continue;
      const s = p.size * this.K * a;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'dust') {
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, s * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(sx, sy - s * 0.5); ctx.lineTo(sx + s * 0.6, sy);
        ctx.lineTo(sx, sy + s * 0.5); ctx.lineTo(sx - s * 0.6, sy);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawRings(dt) {
    const ctx = this.ctx;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.max;
      const rad = lerp(0.12, r.maxR, t * (2 - t));
      const a = (1 - t) * 0.85;
      const cx = this.px(r.x, r.z), cy = this.py(r.x, r.y, r.z);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * this.K * 2, rad * this.K, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPopups(dt) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) { this.popups.splice(i, 1); continue; }
      const t = 1 - p.life / p.max;
      const a = t < 0.15 ? t / 0.15 : clamp((1 - t) / 0.5, 0, 1);
      const scale = t < 0.2 ? lerp(0.6, 1.08, t / 0.2) : lerp(1.08, 1, clamp((t - 0.2) / 0.2, 0, 1));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y - t * 58);
      ctx.scale(scale, scale);
      ctx.font = `800 ${p.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------- scenery ----
   Each world gets its own silhouette language, not a hue swap. Everything here
   is baked once into an offscreen canvas per world/size. */

function band(g, w, y0, y1, color) { g.fillStyle = color; g.fillRect(0, y0, w, y1 - y0); }

function sun(g, cx, cy, r, inner, outer) {
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  rg.addColorStop(0, inner); rg.addColorStop(0.55, inner);
  rg.addColorStop(1, outer);
  g.fillStyle = rg;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

function ridge(g, w, baseY, amp, freq, phase, color, jag = 0, R = Math.random) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, baseY);
  const step = Math.max(4, w / 90);
  for (let x = 0; x <= w; x += step) {
    const n = Math.sin(x * freq + phase) * amp
            + Math.sin(x * freq * 2.7 + phase * 1.7) * amp * 0.32
            + (jag ? Math.sin(x * freq * 6.3 + phase * 3.1) * amp * jag : 0);
    g.lineTo(x, baseY - n);
  }
  g.lineTo(w, baseY + 4000); g.lineTo(0, baseY + 4000);
  g.closePath(); g.fill();
}

function peaks(g, w, baseY, height, count, color, R) {
  // One continuous ridge line: adjacent summits share a valley, so this reads
  // as a mountain range instead of a row of detached triangles.
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-8, baseY + 4000);
  g.lineTo(-8, baseY - height * (0.10 + R() * 0.2));
  const seg = w / count;
  for (let i = 0; i < count; i++) {
    const summit = i * seg + seg * (0.28 + R() * 0.44);
    g.lineTo(summit, baseY - height * (0.55 + R() * 0.7));
    g.lineTo((i + 1) * seg, baseY - height * (0.05 + R() * 0.24));
  }
  g.lineTo(w + 8, baseY - height * 0.12);
  g.lineTo(w + 8, baseY + 4000);
  g.closePath();
  g.fill();
}

function stars(g, w, h, n, R, maxY) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * (maxY || h);
    const r = R() * 1.5 + 0.3;
    g.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.6})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

const SCENERY = {
  hills(g, w, h, hz, R) {
    sun(g, w * 0.78, hz - h * 0.13, h * 0.062, 'rgba(255,244,208,0.80)', 'rgba(255,196,120,0)');
    ridge(g, w, hz + h * 0.02, h * 0.055, 0.010, 1.2, '#8FA95C', 0, R);
    ridge(g, w, hz + h * 0.09, h * 0.045, 0.014, 3.1, '#5E7C45', 0, R);
    ridge(g, w, hz + h * 0.17, h * 0.040, 0.019, 0.4, '#3C5733', 0, R);
    band(g, w, hz + h * 0.30, h, '#2A3D28');
  },
  sea(g, w, h, hz, R) {
    sun(g, w * 0.24, hz - h * 0.12, h * 0.055, 'rgba(255,236,214,0.82)', 'rgba(255,150,130,0)');
    band(g, w, hz, h, '#1B6C87');
    for (let i = 0; i < 26; i++) {
      const y = hz + (i / 26) ** 1.7 * h * 0.40;
      g.fillStyle = `rgba(255,255,255,${0.10 - i * 0.003})`;
      const ww = w * (0.12 + R() * 0.28);
      g.fillRect(w * 0.30 - ww / 2 + (R() - 0.5) * w * 0.15, y, ww, 1.6);
    }
    ridge(g, w, hz + h * 0.06, h * 0.02, 0.03, 2.0, 'rgba(10,60,80,0.55)', 0, R);
    band(g, w, hz + h * 0.42, h, '#0E4258');
  },
  dunes(g, w, h, hz, R) {
    sun(g, w * 0.5, hz - h * 0.085, h * 0.075, 'rgba(255,248,222,0.80)', 'rgba(255,180,110,0)');
    ridge(g, w, hz + h * 0.03, h * 0.05, 0.008, 0.7, '#E3A867', 0, R);
    ridge(g, w, hz + h * 0.12, h * 0.048, 0.011, 2.6, '#C4854D', 0, R);
    ridge(g, w, hz + h * 0.22, h * 0.042, 0.015, 4.4, '#9A6238', 0, R);
    band(g, w, hz + h * 0.34, h, '#6E442A');
  },
  peaks(g, w, h, hz, R) {
    band(g, w, hz - h * 0.02, h, 'rgba(120,180,150,0.18)');
    peaks(g, w, hz + h * 0.03, h * 0.16, 7, '#4E9B74', R);
    peaks(g, w, hz + h * 0.12, h * 0.20, 5, '#2F7357', R);
    peaks(g, w, hz + h * 0.22, h * 0.15, 9, '#1C4A3C', R);
    band(g, w, hz + h * 0.32, h, '#123027');
  },
  mesa(g, w, h, hz, R) {
    sun(g, w * 0.20, hz - h * 0.11, h * 0.050, 'rgba(255,226,200,0.8)', 'rgba(255,120,110,0)');
    for (let layer = 0; layer < 3; layer++) {
      const y = hz + h * (0.02 + layer * 0.10);
      const col = ['#B4584F', '#8C3B40', '#5E2434'][layer];
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, y + h * 0.4);
      let x = 0;
      while (x < w) {
        const wdt = w * (0.10 + R() * 0.16);
        const ht = h * (0.05 + R() * 0.07) * (1 - layer * 0.15);
        g.lineTo(x, y); g.lineTo(x + wdt * 0.18, y - ht);
        g.lineTo(x + wdt * 0.82, y - ht); g.lineTo(x + wdt, y);
        x += wdt * (1 + R() * 0.3);
      }
      g.lineTo(w, y + h * 0.4); g.closePath(); g.fill();
    }
    band(g, w, hz + h * 0.30, h, '#3A162A');
  },
  snow(g, w, h, hz, R) {
    sun(g, w * 0.76, hz - h * 0.15, h * 0.055, 'rgba(255,255,255,0.72)', 'rgba(200,230,255,0)');
    // darker than the sky, or a pale world turns its mountains into artefacts
    peaks(g, w, hz - h * 0.01, h * 0.20, 5, '#87AFCD', R);
    peaks(g, w, hz + h * 0.07, h * 0.14, 7, '#6791B5', R);
    ridge(g, w, hz + h * 0.17, h * 0.040, 0.011, 1.9, '#F1F8FD', 0, R);
    ridge(g, w, hz + h * 0.26, h * 0.034, 0.017, 4.2, '#D6E8F5', 0, R);
    band(g, w, hz + h * 0.33, h, '#BFDAEC');
  },
  volcano(g, w, h, hz, R) {
    sun(g, w * 0.5, hz + h * 0.02, h * 0.22, 'rgba(255,140,60,0.30)', 'rgba(255,80,40,0)');
    g.fillStyle = '#4E1822';
    g.beginPath();
    g.moveTo(0, hz + h * 0.34); g.lineTo(w * 0.26, hz - h * 0.02);
    g.lineTo(w * 0.41, hz - h * 0.21); g.lineTo(w * 0.59, hz - h * 0.21);
    g.lineTo(w * 0.74, hz - h * 0.02); g.lineTo(w, hz + h * 0.34);
    g.closePath(); g.fill();
    const lg = g.createLinearGradient(0, hz - h * 0.21, 0, hz + h * 0.06);
    lg.addColorStop(0, 'rgba(255,214,120,1)'); lg.addColorStop(0.45, 'rgba(255,120,40,0.8)');
    lg.addColorStop(1, 'rgba(220,60,30,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(w * 0.41, hz - h * 0.21); g.lineTo(w * 0.59, hz - h * 0.21);
    g.lineTo(w * 0.62, hz + h * 0.06); g.lineTo(w * 0.38, hz + h * 0.06); g.closePath(); g.fill();
    peaks(g, w, hz + h * 0.10, h * 0.09, 9, '#2C0A11', R);
    band(g, w, hz + h * 0.28, h, '#170509');
  },
  deep(g, w, h, hz, R) {
    for (let i = 0; i < 7; i++) {
      const x = R() * w;
      const lg = g.createLinearGradient(x, 0, x + w * 0.10, h);
      lg.addColorStop(0, 'rgba(180,255,245,0.14)');
      lg.addColorStop(1, 'rgba(180,255,245,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * 0.08, 0);
      g.lineTo(x + w * 0.20, h); g.lineTo(x - w * 0.04, h); g.closePath(); g.fill();
    }
    ridge(g, w, hz + h * 0.14, h * 0.05, 0.012, 2.2, '#0B4450', 0, R);
    ridge(g, w, hz + h * 0.26, h * 0.05, 0.018, 5.0, '#062F3B', 0, R);
    band(g, w, hz + h * 0.36, h, '#031F29');
  },
  aurora(g, w, h, hz, R) {
    stars(g, w, h, 130, R, hz + h * 0.1);
    const cols = [['rgba(90,240,180,0.40)', 'rgba(90,240,180,0)'],
                  ['rgba(160,120,255,0.34)', 'rgba(160,120,255,0)'],
                  ['rgba(255,110,190,0.26)', 'rgba(255,110,190,0)']];
    for (let i = 0; i < 3; i++) {
      const y = h * (0.12 + i * 0.09);
      const lg = g.createLinearGradient(0, y - h * 0.10, 0, y + h * 0.16);
      lg.addColorStop(0, cols[i][1]); lg.addColorStop(0.4, cols[i][0]); lg.addColorStop(1, cols[i][1]);
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.011 + i * 2.1) * h * 0.045);
      for (let x = w; x >= 0; x -= 8) g.lineTo(x, y + h * 0.16 + Math.sin(x * 0.009 + i * 1.3) * h * 0.04);
      g.closePath(); g.fill();
    }
    peaks(g, w, hz + h * 0.12, h * 0.16, 6, '#1A2140', R);
    peaks(g, w, hz + h * 0.24, h * 0.12, 8, '#0E1428', R);
    band(g, w, hz + h * 0.34, h, '#080D1B');
  },
  cosmos(g, w, h, hz, R) {
    stars(g, w, h, 220, R);
    for (let i = 0; i < 4; i++) {
      const cx = R() * w, cy = R() * h * 0.75, r = h * (0.10 + R() * 0.16);
      const hue = [280, 200, 330, 40][i];
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, `hsl(${hue} 80% 62% / 0.30)`);
      rg.addColorStop(1, `hsl(${hue} 80% 62% / 0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    const px = w * 0.74, py = h * 0.20, pr = h * 0.055;
    const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, '#FFD98A'); pg.addColorStop(1, '#B06A2E');
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,220,170,0.5)'; g.lineWidth = pr * 0.16;
    g.beginPath(); g.ellipse(px, py, pr * 1.9, pr * 0.44, -0.32, 0, Math.PI * 2); g.stroke();
    peaks(g, w, hz + h * 0.20, h * 0.13, 7, '#150C2A', R);
    band(g, w, hz + h * 0.32, h, '#0B0618');
  }
};
