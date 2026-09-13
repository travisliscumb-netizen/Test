/* Canvas renderer.

   Projection is a FIXED dimetric ("2.5D"): world X runs down-right, world Z
   runs down-left, world Y is straight up the screen. It never rotates, never
   tilts and never swings -- the only camera motion is a vertical follow so the
   landing surface stays at a stable screen position. Placement is a 1-D
   alignment problem and the picture must never make the player re-derive where
   the edges are.

   The elevation is deliberately higher than textbook 2:1 isometric (the top
   face is a 1.72:1 diamond, not 2:1). A higher camera spends the phone's
   abundant VERTICAL budget on the block's travel instead of its scarce
   horizontal one, which is what lets the blocks be half the screen wide; it
   also shows more of the two top surfaces the player is actually comparing.

   A real 3D engine would buy nothing here (fixed camera, no intersecting
   geometry, painter's order is simply bottom-to-top) and would cost a large
   download plus GPU time on a phone. */

import { BLOCK_H } from './config.js';
import { HOVER } from './engine.js';

/* Camera framing. The anchor eases down the screen as the tower grows: early on
   the ground stays in shot for context, later the tower gets the room. The move
   is slow enough to be invisible frame to frame. */
const ANCHOR_LOW = 0.520;
const ANCHOR_HIGH = 0.425;
const ANCHOR_RAMP = 14;      // blocks over which the anchor travels

const KY_RATIO = 0.58;       // top-face half-height / half-width
/* Hard caps. Effects are spawned per placement, so a fast streak can otherwise
   pile up dozens of simultaneous stroked-text popups and ellipse strokes -- the
   two most expensive things this renderer draws. Oldest out. */
const MAX_PARTICLES = 180;
const MAX_RINGS = 5;
const MAX_POPUPS = 6;
const DETAIL_BLOCKS = 6;     // full material treatment for the top N blocks
const SHADOW_BLOCKS = 3;     // clipped contact shadows only where they are seen

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${h.toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`
         : `hsl(${h.toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}% / ${a})`;

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
    this.anchor = ANCHOR_LOW;
    this.ox = 0; this.oy = 0;
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.ambient = [];
    this.flashA = 0; this.flashColor = '#fff';
    this.pulse = 0; this.shake = 0;
    this.world = null;
    this.bg = null; this.bgBlur = null;
    this.bgPrev = null; this.bgPrevBlur = null; this.fade = 1;
    this.travel = 1.3;
    this.time = 0;
    this.guideA = 0;
    this.impact = 0;          // brief highlight on the block just landed
  }

  /* ------------------------------------------------------------- layout -- */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._computeScale();
    this._buildBackground(true);
    this._seedAmbient();
  }

  setLevel(cfg) {
    this.travel = cfg.travel;
    this._computeScale();
    this.cam = { x: 0, y: 0, z: 0 };
    this.anchor = ANCHOR_LOW;
    this.particles.length = 0; this.rings.length = 0; this.popups.length = 0;
    this.flashA = 0; this.pulse = 0; this.shake = 0; this.guideA = 0; this.impact = 0;
  }

  /** @param {object} world  @param {boolean} [crossfade] ease between skies */
  setWorld(world, crossfade = false) {
    if (this.world && this.world.id === world.id) return;
    if (crossfade && this.bg) {
      this.bgPrev = this.bg; this.bgPrevBlur = this.bgBlur; this.fade = 0;
    } else {
      this.bgPrev = null; this.bgPrevBlur = null; this.fade = 1;
    }
    this.world = world;
    this._buildBackground(!crossfade);
    this._seedAmbient();
  }

  _computeScale() {
    if (!this.W) return;
    /* The block is sized to the SCREEN, not to the travel path. Letting the
       outer edge clip for the instant it spends at the far extreme is a much
       better trade than shrinking every block to keep a position nobody places
       from permanently in frame. */
    // Portrait is the design target; landscape is a browser fallback where the
    // vertical budget is the scarce one, so it gets a looser height factor
    // rather than a block a sixth of the screen wide.
    const hFactor = this.W > this.H ? 0.235 : 0.176;
    this.K = Math.max(30, Math.min(this.W * 0.256, this.H * hFactor, 152));
  }

  /* --------------------------------------------------------- projection -- */
  px(x, z) { return (x - z) * this.K + this.ox; }
  py(x, y, z) { return (x + z) * this.K * KY_RATIO - y * this.K + this.oy; }

  _updateCamera(game, dt) {
    const top = game.top;
    const height = game.blocks.length - 1;
    const targetAnchor = lerp(ANCHOR_LOW, ANCHOR_HIGH, clamp(height / ANCHOR_RAMP, 0, 1));
    this.anchor = lerp(this.anchor, targetAnchor, 1 - Math.pow(0.25, dt));

    const tx = top.x, tz = top.z, ty = top.y + BLOCK_H;
    const k = 1 - Math.pow(0.0022, dt);   // frame-rate independent smoothing
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.z = lerp(this.cam.z, tz, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.ox = this.W / 2 - (this.cam.x - this.cam.z) * this.K;
    this.oy = this.H * this.anchor - ((this.cam.x + this.cam.z) * this.K * KY_RATIO - this.cam.y * this.K);
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
        spin: (Math.random() - 0.5) * 9,
        rot: Math.random() * Math.PI,
        kind: o.kind || 'spark'
      });
    }
  }

  addRing(x, y, z, color, maxR = 1.1, life = 0.5, width = 3) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, z, r: 0.12, maxR, life, max: life, color, width });
  }

  addPopup(text, wx, wy, wz, color, size = 20, weight = 800) {
    if (this.popups.length >= MAX_POPUPS) this.popups.shift();
    this.popups.push({
      text, x: this.px(wx, wz), y: this.py(wx, wy, wz),
      life: 1.0, max: 1.0, color, size, weight
    });
  }

  /** A bigger message supersedes whatever is already floating. */
  clearPopups() { this.popups.length = 0; }

  flash(color, a = 0.22) { this.flashColor = color; this.flashA = Math.max(this.flashA, a); }
  kick(amount = 0.016) { this.pulse = Math.max(this.pulse, amount); }
  shakeBy(amount) { this.shake = Math.max(this.shake, amount); }
  strike() { this.impact = 1; }

  /* --------------------------------------------------------- background -- */
  _buildBackground(dropPrev) {
    if (!this.W || !this.world) return;
    if (dropPrev) { this.bgPrev = null; this.bgPrevBlur = null; this.fade = 1; }
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
    /* Only hz .. hz+0.193h of the background is ever on screen (the rest sits
       below the viewport), so foreground layers are placed through fg(), which
       maps a normalised depth into that band. Hand-picked offsets silently put
       a third of the scenery -- and every world's ground plane -- out of frame,
       which is what made several worlds read as bare gradients. */
    const fg = (t) => horizon + h * 0.193 * t;
    SCENERY[P.scenery](g, w, h, horizon, R, P, fg);

    /* Atmospheric haze at the horizon line: distance reads as distance, and it
       keeps terrain silhouettes from cutting the sky like paper. */
    const haze = g.createLinearGradient(0, horizon - h * 0.10, 0, horizon + h * 0.14);
    haze.addColorStop(0, hexA(P.fog, 0));
    haze.addColorStop(0.45, hexA(P.fog, 0.30));
    haze.addColorStop(1, hexA(P.fog, 0));
    g.fillStyle = haze; g.fillRect(0, horizon - h * 0.10, w, h * 0.24);

    const deep = P.sky[P.sky.length - 1];
    const fore = g.createLinearGradient(0, horizon, 0, h);
    fore.addColorStop(0, hexA(deep, 0));
    fore.addColorStop(0.35, hexA(deep, 0.16));
    fore.addColorStop(1, hexA(deep, 0.72));
    g.fillStyle = fore; g.fillRect(0, horizon, w, h - horizon);

    const vg = g.createRadialGradient(w / 2, h * 0.62, Math.min(w, h) * 0.26, w / 2, h * 0.62, Math.max(w, h) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,0.16)');
    vg.addColorStop(1, 'rgba(0,0,0,0.52)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);

    if (this.bg && this.bg !== this.bgPrev) { this.bg.width = 0; this.bg.height = 0; }
    if (this.bgBlur && this.bgBlur !== this.bgPrevBlur) { this.bgBlur.width = 0; this.bgBlur.height = 0; }
    this.bg = c;
    this.bgBlur = null;
    this.bgH = h;
    this.bgTop = -(horizon - this.H * 0.72);
    this.bgShift = Math.max(0, -this.bgTop);
  }

  /* Menus sit on a depth-of-field version of the live world. Baked once, so the
     menus cost one blit instead of a per-frame backdrop blur. */
  _blurred() {
    if (this.bgBlur) return this.bgBlur;
    if (!this.bg) return null;
    const c = document.createElement('canvas');
    c.width = this.bg.width; c.height = this.bg.height;
    const g = c.getContext('2d');
    if (typeof g.filter === 'string') g.filter = 'blur(18px) saturate(76%) brightness(92%)';
    g.drawImage(this.bg, 0, 0);
    g.filter = 'none';
    this.bgBlur = c;
    return c;
  }

  _seedAmbient() {
    this.ambient.length = 0;
    if (!this.world || !this.W) return;
    const kind = this.world.ambient;
    if (kind === 'none') return;
    const counts = { snow: 40, ember: 30, bubble: 24, star: 52, sand: 26 };
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

  _drawAmbient(dt, dim) {
    const ctx = this.ctx;
    if (!this.ambient.length) return;
    const W = this.W, H = this.H;
    const k = dim ? 0.5 : 1;
    for (const a of this.ambient) {
      a.p += dt * (0.6 + a.v);
      if (a.kind === 'snow') {
        a.y += (12 + a.v * 26) * dt; a.x += Math.sin(a.p) * 9 * dt;
        if (a.y > H) { a.y = -4; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + 0.4 * Math.sin(a.p) ** 2) * k})`;
      } else if (a.kind === 'ember') {
        a.y -= (26 + a.v * 40) * dt; a.x += Math.sin(a.p * 1.4) * 12 * dt;
        if (a.y < -4) { a.y = H + 4; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,${120 + Math.floor(80 * Math.sin(a.p))},60,${(0.35 + 0.3 * Math.sin(a.p) ** 2) * k})`;
      } else if (a.kind === 'bubble') {
        a.y -= (16 + a.v * 22) * dt; a.x += Math.sin(a.p) * 7 * dt;
        if (a.y < -6) { a.y = H + 6; a.x = Math.random() * W; }
        ctx.fillStyle = `rgba(210,255,250,${(0.16 + 0.14 * Math.sin(a.p) ** 2) * k})`;
      } else if (a.kind === 'sand') {
        a.x += (18 + a.v * 30) * dt; a.y += Math.sin(a.p) * 5 * dt;
        if (a.x > W + 4) { a.x = -4; a.y = Math.random() * H; }
        ctx.fillStyle = `rgba(255,230,180,${(0.16 + 0.12 * Math.sin(a.p) ** 2) * k})`;
      } else {
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.6 * Math.abs(Math.sin(a.p * 0.7))) * k})`;
      }
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------- blocks -- */
  _faceColors(c) {
    if (c._fc) return c._fc;
    /* One key light from above and slightly to the +x side, a cool bounce on
       the shaded face. The spread between the three faces is what tells the
       player where the geometry is, so it is deliberately wide. */
    c._fc = {
      top: hsl(c.h, c.s * 0.97, c.l + 11),
      inner: hsl(c.h, c.s * 0.93, c.l + 16),
      rim: hsl(c.h, c.s * 0.62, c.l + 38),
      right: hsl(c.h + 2, c.s * 1.02, c.l - 6),
      rightLo: hsl(c.h + 4, c.s, c.l - 16),
      left: hsl(c.h + 8, c.s * 0.9, c.l - 21),
      leftLo: hsl(c.h + 11, c.s * 0.85, c.l - 31),
      edgeDark: hsl(c.h + 6, c.s * 0.8, Math.max(4, c.l - 34))
    };
    return c._fc;
  }

  _corners(b, ws, hs, shear, rise) {
    const w2 = (b.w * ws) / 2, d2 = (b.d * ws) / 2;
    const yb = b.y + rise, yt = b.y + rise + BLOCK_H * hs;
    return {
      A: [this.px(b.x - w2, b.z - d2) + shear, this.py(b.x - w2, yt, b.z - d2)],
      B: [this.px(b.x + w2, b.z - d2) + shear, this.py(b.x + w2, yt, b.z - d2)],
      C: [this.px(b.x + w2, b.z + d2) + shear, this.py(b.x + w2, yt, b.z + d2)],
      D: [this.px(b.x - w2, b.z + d2) + shear, this.py(b.x - w2, yt, b.z + d2)],
      Ab: [this.px(b.x - w2, b.z - d2), this.py(b.x - w2, yb, b.z - d2)],
      Bb: [this.px(b.x + w2, b.z - d2), this.py(b.x + w2, yb, b.z - d2)],
      Cb: [this.px(b.x + w2, b.z + d2), this.py(b.x + w2, yb, b.z + d2)],
      Db: [this.px(b.x - w2, b.z + d2), this.py(b.x - w2, yb, b.z + d2)]
    };
  }

  /* A soft contact shadow. It is CLIPPED to the top face of the block beneath,
     so it can only ever appear on a real surface -- an unclipped expanded
     silhouette haloes into the air around the tower and reads as a rendering
     fault, which is exactly what it looked like. */
  _contactShadow(b, below, strength = 1) {
    if (!below) return;
    const ctx = this.ctx;
    const y = b.y + 0.0015;
    if (b.drop > 0) strength *= 1 - b.drop * 0.6;
    const w2 = b.w / 2, d2 = b.d / 2;
    const pts = [
      [this.px(b.x - w2, b.z - d2), this.py(b.x - w2, y, b.z - d2)],
      [this.px(b.x + w2, b.z - d2), this.py(b.x + w2, y, b.z - d2)],
      [this.px(b.x + w2, b.z + d2), this.py(b.x + w2, y, b.z + d2)],
      [this.px(b.x - w2, b.z + d2), this.py(b.x - w2, y, b.z + d2)]
    ];
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
    ctx.save();
    this._facePath(ctx, below, below.y + BLOCK_H + 0.001);
    ctx.clip();
    ctx.fillStyle = '#000';
    for (const [scale, alpha] of [[1.24, 0.10], [1.08, 0.13]]) {
      ctx.globalAlpha = alpha * strength;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = cx + (pts[i][0] - cx) * scale - 3;
        const yy = cy + (pts[i][1] - cy) * scale + 2;
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawBlock(b, opts = {}) {
    const ctx = this.ctx;
    const settle = opts.settle === undefined ? (b.settle || 0) : opts.settle;
    const squash = settle > 0 ? Math.sin(settle * Math.PI) : 0;
    const hs = 1 - 0.22 * squash;
    const ws = 1 + 0.075 * squash;
    const shear = opts.shear || 0;
    const alpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (alpha <= 0.01) return;
    const detail = opts.detail !== false;
    // ease-in: the block accelerates into the platform instead of gliding
    const drop = b.drop > 0 ? b.drop * b.drop : 0;
    const rise = (opts.rise || 0) + drop * HOVER;

    const p = this._corners(b, ws, hs, shear, rise);
    const col = this._faceColors(b.color);
    if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }

    const poly = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };

    // +x face (screen right)
    if (detail) {
      const g = ctx.createLinearGradient(p.B[0], p.B[1], p.Cb[0], p.Cb[1]);
      g.addColorStop(0, col.right); g.addColorStop(1, col.rightLo);
      ctx.fillStyle = g;
    } else ctx.fillStyle = col.right;
    poly([p.B, p.C, p.Cb, p.Bb]); ctx.fill();

    // +z face (screen left)
    if (detail) {
      const g = ctx.createLinearGradient(p.D[0], p.D[1], p.Cb[0], p.Cb[1]);
      g.addColorStop(0, col.left); g.addColorStop(1, col.leftLo);
      ctx.fillStyle = g;
    } else ctx.fillStyle = col.left;
    poly([p.C, p.D, p.Db, p.Cb]); ctx.fill();

    // the vertical corner nearest the camera, and the ground contact line
    if (!opts.flat) {
      ctx.strokeStyle = col.edgeDark; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.Bb[0], p.Bb[1]); ctx.lineTo(p.Cb[0], p.Cb[1]); ctx.lineTo(p.Db[0], p.Db[1]);
      ctx.stroke();
    }

    // top face
    ctx.fillStyle = col.top;
    poly([p.A, p.B, p.C, p.D]); ctx.fill();

    // chamfer: an inset plate reads as a bevelled edge without extra geometry
    const cx = (p.A[0] + p.B[0] + p.C[0] + p.D[0]) / 4;
    const cy = (p.A[1] + p.B[1] + p.C[1] + p.D[1]) / 4;
    const span = Math.abs(p.B[0] - p.D[0]);
    if (!opts.flat) {
      const t = clamp(clamp(span * 0.05, 1.5, 9) / Math.max(8, span * 0.5), 0.02, 0.3);
      const inset = [p.A, p.B, p.C, p.D].map((q) => [q[0] + (cx - q[0]) * t, q[1] + (cy - q[1]) * t]);
      ctx.fillStyle = col.inner;
      poly(inset); ctx.fill();
    }

    if (detail) {
      const g = ctx.createLinearGradient(p.A[0], p.A[1], p.C[0], p.C[1]);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = g;
      poly([p.A, p.B, p.C, p.D]); ctx.fill();
    }

    // rim light on the two lit top edges, shade on the two away from the key
    if (!opts.flat) {
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = col.rim;
      ctx.beginPath(); ctx.moveTo(p.A[0], p.A[1]); ctx.lineTo(p.B[0], p.B[1]); ctx.lineTo(p.C[0], p.C[1]); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath(); ctx.moveTo(p.C[0], p.C[1]); ctx.lineTo(p.D[0], p.D[1]); ctx.lineTo(p.A[0], p.A[1]); ctx.stroke();
    }

    if (opts.fog > 0 && this.world) {
      ctx.save();
      ctx.globalAlpha = opts.fog;
      ctx.fillStyle = this.world.fog;
      poly([p.A, p.B, p.Bb, p.Cb, p.Db, p.D]);
      ctx.fill();
      ctx.restore();
    }
    if (opts.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = opts.glow;
      ctx.lineWidth = 1.6 + 2.6 * opts.glowAmount;
      ctx.globalAlpha = 0.42 * opts.glowAmount;
      poly([p.A, p.B, p.C, p.D]); ctx.stroke();
      ctx.restore();
    }
    if (opts.strike > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opts.strike * 0.30;
      ctx.fillStyle = '#fff';
      poly([p.A, p.B, p.C, p.D]); ctx.fill();
      ctx.restore();
    }
    if (alpha < 1) ctx.restore();
  }

  _facePath(ctx, b, y) {
    const w2 = b.w / 2, d2 = b.d / 2;
    ctx.beginPath();
    ctx.moveTo(this.px(b.x - w2, b.z - d2), this.py(b.x - w2, y, b.z - d2));
    ctx.lineTo(this.px(b.x + w2, b.z - d2), this.py(b.x + w2, y, b.z - d2));
    ctx.lineTo(this.px(b.x + w2, b.z + d2), this.py(b.x + w2, y, b.z + d2));
    ctx.lineTo(this.px(b.x - w2, b.z + d2), this.py(b.x - w2, y, b.z + d2));
    ctx.closePath();
  }

  /* The most important readability aid in the game: the incoming block's
     footprint on the landing surface, darker where it genuinely overlaps. The
     player reads the cut before committing instead of guessing what the
     perspective is doing. */
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

    ctx.save();
    this._facePath(ctx, top, y + 0.003);
    ctx.clip();
    // soft penumbra, then a crisp core: the hard edge IS the alignment cue
    ctx.fillStyle = '#000';
    const w2 = foot.w / 2, d2 = foot.d / 2;
    const cx = this.px(foot.x, foot.z);
    const cy = this.py(foot.x, y, foot.z);
    for (const [scale, alpha] of [[1.14, 0.06], [1.06, 0.08]]) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const c = [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]];
      c.forEach(([dx, dz], i) => {
        const X = cx + (this.px(foot.x + dx, foot.z + dz) - cx) * scale;
        const Y = cy + (this.py(foot.x + dx, y, foot.z + dz) - cy) * scale;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.21;
    this._facePath(ctx, foot, y + 0.003);
    ctx.fill();
    // a crisp terminator: this edge against the platform edge IS the alignment read
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.4;
    this._facePath(ctx, foot, y + 0.003);
    ctx.stroke();
    ctx.restore();
  }

  /* Alignment cue. Only TWO of the platform's four top edges can ever decide a
     placement -- the pair across the travel axis -- so those two are lit and the
     others are not. It reads as the surface catching the light rather than as a
     targeting overlay, and it costs the player nothing to learn. */
  _drawEdgeCue(game, accent) {
    const a = game.active;
    if (!a || this.guideA <= 0.01) return;
    const ctx = this.ctx;
    const top = game.top;
    const y = top.y + BLOCK_H + 0.004;
    const w2 = top.w / 2, d2 = top.d / 2;
    const P = (dx, dz) => [this.px(top.x + dx, top.z + dz), this.py(top.x + dx, y, top.z + dz)];
    const A = P(-w2, -d2), B = P(w2, -d2), C = P(w2, d2), D = P(-w2, d2);
    const pairs = a.axis === 'x' ? [[B, C], [D, A]] : [[A, B], [C, D]];

    const delta = Math.abs(a.pos - (a.axis === 'x' ? top.x : top.z));
    const near = clamp(1 - delta / (a.range * 0.6), 0, 1);

    ctx.save();
    ctx.lineCap = 'round';
    for (const [p0, p1] of pairs) {
      ctx.globalAlpha = this.guideA * (0.14 + 0.30 * near * near);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      ctx.globalAlpha = this.guideA * (0.42 + 0.50 * near * near);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();
  }

  _drawGroundShadow(game) {
    const ctx = this.ctx;
    const base = game.blocks[0];
    const cy = this.py(base.x, base.y, base.z);
    if (cy < -80 || cy > this.H + 200) return;
    const cx = this.px(base.x, base.z);
    const rx = this.K * 2.3, ry = this.K * 1.05;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.44)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.17)');
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
    const menu = !!opts.menu;

    this.guideA = lerp(this.guideA, game.active && !opts.paused && !menu ? 1 : 0, 1 - Math.pow(0.004, dt));
    this.flashA = Math.max(0, this.flashA - dt * 2.4);
    this.pulse = Math.max(0, this.pulse - dt * 0.10);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.impact = Math.max(0, this.impact - dt * 8);
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 0.85);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const py = clamp(this.cam.y * this.K * 0.05, 0, this.bgShift || 0);
    const paint = (img) => ctx.drawImage(img, 0, this.bgTop + py, this.W, this.bgH);
    if (this.bg) {
      const cur = menu ? (this._blurred() || this.bg) : this.bg;
      if (this.fade < 1 && this.bgPrev) {
        paint(menu ? (this.bgPrevBlur || this.bgPrev) : this.bgPrev);
        ctx.globalAlpha = this.fade;
        paint(cur);
        ctx.globalAlpha = 1;
      } else {
        paint(cur);
      }
    } else {
      ctx.fillStyle = '#101018'; ctx.fillRect(0, 0, this.W, this.H);
    }
    this._drawAmbient(dt, menu);

    if (menu) return;

    ctx.save();
    if (this.pulse > 0.0005 || this.shake > 0.05) {
      const s = 1 + this.pulse;
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(this.W / 2 + sx, this.H * this.anchor + sy);
      ctx.scale(s, s);
      ctx.translate(-this.W / 2, -this.H * this.anchor);
    }

    this._drawGroundShadow(game);

    // Cull to the viewport: a 40-block tower only ever shows a dozen blocks.
    const blocks = game.blocks;
    const last = blocks.length - 1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const sy = this.py(b.x, b.y + BLOCK_H, b.z);
      // sy is the top face's centre; the block spans ~0.6K above it and
      // ~1.05K below, so those are the only margins that can matter.
      if (sy < -this.K * 1.1 || sy > this.H + this.K * 0.7) continue;
      const depth = last - i;
      // past this depth the haze is opaque: there is nothing left to draw
      if (depth > 20) continue;
      if (depth < SHADOW_BLOCKS && i > 0) this._contactShadow(b, blocks[i - 1], depth === 0 ? 1 : 0.8);
      const fog = depth > 9 ? Math.min(0.92, (depth - 9) * 0.084) : 0;
      this.drawBlock(b, {
        fog,
        detail: depth < DETAIL_BLOCKS,
        flat: fog > 0.5,
        strike: depth === 0 ? this.impact : 0
      });
    }

    this._drawLandingShadow(game);
    this._drawEdgeCue(game, accent);

    for (const d of game.debris) {
      const life = clamp(d.life * 1.5, 0, 1);
      ctx.save();
      const cx = this.px(d.x, d.z), cy = this.py(d.x, d.y, d.z);
      ctx.translate(cx, cy); ctx.rotate(d.rot || 0); ctx.translate(-cx, -cy);
      this.drawBlock(d, { alpha: life, settle: 0, detail: true });
      ctx.restore();
    }

    if (game.active && !opts.hideActive) {
      const a = game.active;
      const blk = {
        x: a.axis === 'x' ? a.pos : game.top.x,
        z: a.axis === 'z' ? a.pos : game.top.z,
        y: a.y, w: a.w, d: a.d, color: a.color, settle: 0
      };
      const g = 0.40 + 0.26 * Math.sin(this.time * 4.4);
      this.drawBlock(blk, { glow: accent, glowAmount: g, detail: true, rise: HOVER });
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
    const arr = this.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const a = clamp(p.life / p.max, 0, 1);
      const sx = this.px(p.x, p.z), sy = this.py(p.x, p.y, p.z);
      if (sx < -30 || sx > this.W + 30 || sy < -30 || sy > this.H + 30) continue;
      const s = p.size * this.K * a;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'dust') {
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, s * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(p.rot);
        ctx.fillRect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawRings(dt) {
    const ctx = this.ctx;
    const arr = this.rings;
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      r.life -= dt;
      if (r.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
      const t = 1 - r.life / r.max;
      const rad = lerp(0.12, r.maxR, t * (2 - t));
      const cx = this.px(r.x, r.z), cy = this.py(r.x, r.y, r.z);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.65);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * this.K * 2, rad * this.K * 2 * KY_RATIO, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPopups(dt) {
    const ctx = this.ctx;
    const arr = this.popups;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
      const t = 1 - p.life / p.max;
      const a = t < 0.10 ? t / 0.10 : clamp((1 - t) / 0.45, 0, 1);
      // a short overshoot, then settle -- weight, not bounce
      const scale = t < 0.16 ? lerp(0.72, 1.06, easeOut(t / 0.16))
                             : lerp(1.06, 1, clamp((t - 0.16) / 0.22, 0, 1));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y - easeOut(t) * 40);
      ctx.scale(scale, scale);
      ctx.font = `${p.weight} ${p.size}px ui-rounded, -apple-system, BlinkMacSystemFont, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------- scenery ----
   Each world gets its own silhouette language, not a hue swap. Everything here
   is baked once into an offscreen canvas per world/size. */

/* Foreground ground. Deliberately NOT a flat rectangle: a hard-edged bar of
   colour across the bottom of the screen reads as a stray UI element, not as
   terrain, which is exactly what it looked like before. */
function ground(g, w, h, y0, top, bottom, end) {
  /* The ramp has to COMPLETE inside the visible band. Running it to the canvas
     floor -- which sits well below the viewport -- means the player only ever
     sees a near-constant slice of it, which is a flat bar across the bottom of
     the screen by another name. */
  const grad = g.createLinearGradient(0, y0 - h * 0.02, 0, end);
  grad.addColorStop(0, top);
  grad.addColorStop(0.45, mix(top, bottom, 0.55));
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, y0 - h * 0.02, w, h - y0 + h * 0.02);
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${gg},${bl})`;
}

function sun(g, cx, cy, r, inner, outer) {
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  rg.addColorStop(0, inner); rg.addColorStop(0.55, inner);
  rg.addColorStop(1, outer);
  g.fillStyle = rg;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

function ridge(g, w, baseY, amp, freq, phase, color, jag = 0) {
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

/* A band of haze sitting on a silhouette's base. Aerial perspective is what
   stops three ranges of the same hue from reading as one flat shape. */
function mist(g, w, baseY, height, color) {
  const m = g.createLinearGradient(0, baseY - height, 0, baseY + height * 0.35);
  m.addColorStop(0, 'rgba(255,255,255,0)');
  m.addColorStop(0.6, color);
  m.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = m;
  g.fillRect(0, baseY - height, w, height * 1.35);
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
  hills(g, w, h, hz, R, P, fg) {
    sun(g, w * 0.78, hz - h * 0.13, h * 0.062, 'rgba(255,244,208,0.80)', 'rgba(255,196,120,0)');
    ridge(g, w, fg(0.10), h * 0.055, 0.010, 1.2, '#8FA95C');
    ridge(g, w, fg(0.40), h * 0.045, 0.014, 3.1, '#5E7C45');
    ridge(g, w, fg(0.72), h * 0.040, 0.019, 0.4, '#3C5733');
    ground(g, w, h, fg(0.70), '#31462B', '#141E13', fg(1.06));
  },
  sea(g, w, h, hz, R, P, fg) {
    sun(g, w * 0.24, hz - h * 0.12, h * 0.055, 'rgba(255,236,214,0.82)', 'rgba(255,150,130,0)');
    ground(g, w, h, hz, '#2A86A0', '#04202B', fg(1.06));
    for (let i = 0; i < 26; i++) {
      const y = hz + (i / 26) ** 1.7 * h * 0.19;
      g.fillStyle = `rgba(255,255,255,${0.11 - i * 0.0032})`;
      const ww = w * (0.12 + R() * 0.28);
      g.fillRect(w * 0.24 - ww / 2 + (R() - 0.5) * w * 0.15, y, ww, 1.6);
    }
    ridge(g, w, fg(0.30), h * 0.02, 0.03, 2.0, 'rgba(10,60,80,0.45)');
  },

  /* Amber Desert. The sun is the focal point and the dunes step down in value
     from near-white at the horizon to deep umber in the foreground -- without
     that separation three warm ridges on a warm sky are one flat gradient. */
  dunes(g, w, h, hz, R, P, fg) {
    const glow = g.createLinearGradient(0, hz - h * 0.14, 0, hz + h * 0.05);
    glow.addColorStop(0, 'rgba(255,214,150,0)');
    glow.addColorStop(0.7, 'rgba(255,206,140,0.45)');
    glow.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = glow; g.fillRect(0, hz - h * 0.14, w, h * 0.19);
    sun(g, w * 0.5, hz - h * 0.055, h * 0.062, 'rgba(255,250,232,0.98)', 'rgba(255,186,112,0)');
    ridge(g, w, fg(0.08), h * 0.040, 0.009, 0.7, '#F0BE85');
    ridge(g, w, fg(0.34), h * 0.044, 0.012, 2.6, '#C98A54');
    ridge(g, w, fg(0.64), h * 0.042, 0.016, 4.4, '#8E5732');
    ground(g, w, h, fg(0.70), '#66381F', '#2A150C', fg(1.06));
  },

  /* Jade Terraces. Was a green gradient with faint pines: now a hazy valley
     light behind three ranges that separate by value, with mist between them. */
  peaks(g, w, h, hz, R, P, fg) {
    const bloom = g.createRadialGradient(w * 0.62, hz - h * 0.05, 0, w * 0.62, hz - h * 0.02, h * 0.20);
    bloom.addColorStop(0, 'rgba(236,255,236,0.55)');
    bloom.addColorStop(0.45, 'rgba(196,240,206,0.20)');
    bloom.addColorStop(1, 'rgba(180,230,195,0)');
    g.fillStyle = bloom; g.fillRect(0, hz - h * 0.26, w, h * 0.30);
    peaks(g, w, fg(0.06), h * 0.20, 6, '#71B693', R);
    mist(g, w, fg(0.06), h * 0.045, 'rgba(226,248,232,0.45)');
    peaks(g, w, fg(0.34), h * 0.17, 5, '#3C8863', R);
    mist(g, w, fg(0.34), h * 0.038, 'rgba(206,240,218,0.30)');
    peaks(g, w, fg(0.66), h * 0.13, 8, '#1D5240', R);
    ground(g, w, h, fg(0.70), '#143427', '#05130D', fg(1.06));
  },

  /* Crimson Ridge. Low hard sun, mesas stepping from dusty rose down to near
     black, and a dust haze so the foreground silhouettes separate. */
  mesa(g, w, h, hz, R, P, fg) {
    const glow = g.createLinearGradient(0, hz - h * 0.16, 0, hz + h * 0.04);
    glow.addColorStop(0, 'rgba(255,196,170,0)');
    glow.addColorStop(0.72, 'rgba(255,178,150,0.42)');
    glow.addColorStop(1, 'rgba(240,130,120,0)');
    g.fillStyle = glow; g.fillRect(0, hz - h * 0.16, w, h * 0.20);
    sun(g, w * 0.2, hz - h * 0.07, h * 0.05, 'rgba(255,240,222,0.95)', 'rgba(255,140,120,0)');
    const bands = [
      [fg(0.05), '#D98C7C', 0.055],
      [fg(0.33), '#9D4550', 0.062],
      [fg(0.66), '#5A2033', 0.068]
    ];
    bands.forEach(([y, col, ht], layer) => {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, y + h * 0.4);
      let x = 0;
      while (x < w) {
        const wdt = w * (0.10 + R() * 0.16);
        const tall = h * ht * (0.6 + R() * 0.7);
        g.lineTo(x, y); g.lineTo(x + wdt * 0.16, y - tall);
        g.lineTo(x + wdt * 0.84, y - tall); g.lineTo(x + wdt, y);
        x += wdt * (1 + R() * 0.3);
      }
      g.lineTo(w, y + h * 0.4); g.closePath(); g.fill();
      if (layer < 2) mist(g, w, y, h * 0.035, 'rgba(255,176,150,0.26)');
    });
    ground(g, w, h, fg(0.70), '#3E1526', '#150510', fg(1.06));
  },

  snow(g, w, h, hz, R, P, fg) {
    sun(g, w * 0.76, hz - h * 0.15, h * 0.055, 'rgba(255,255,255,0.72)', 'rgba(200,230,255,0)');
    peaks(g, w, hz - h * 0.01, h * 0.20, 5, '#87AFCD', R);
    mist(g, w, hz + h * 0.01, h * 0.04, 'rgba(236,246,253,0.5)');
    peaks(g, w, fg(0.30), h * 0.14, 7, '#6791B5', R);
    ridge(g, w, fg(0.55), h * 0.040, 0.011, 1.9, '#F1F8FD');
    ridge(g, w, fg(0.78), h * 0.034, 0.017, 4.2, '#D6E8F5');
    ground(g, w, h, fg(0.70), '#C3DCEE', '#6E93B0', fg(1.06));
  },
  volcano(g, w, h, hz, R, P, fg) {
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
    peaks(g, w, fg(0.45), h * 0.09, 9, '#2C0A11', R);
    ground(g, w, h, fg(0.70), '#22070D', '#0A0205', fg(1.06));
  },
  deep(g, w, h, hz, R, P, fg) {
    for (let i = 0; i < 7; i++) {
      const x = R() * w;
      const lg = g.createLinearGradient(x, 0, x + w * 0.10, h);
      lg.addColorStop(0, 'rgba(180,255,245,0.14)');
      lg.addColorStop(1, 'rgba(180,255,245,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * 0.08, 0);
      g.lineTo(x + w * 0.20, h); g.lineTo(x - w * 0.04, h); g.closePath(); g.fill();
    }
    ridge(g, w, fg(0.34), h * 0.05, 0.012, 2.2, '#0B4450');
    ridge(g, w, fg(0.66), h * 0.05, 0.018, 5.0, '#062F3B');
    ground(g, w, h, fg(0.70), '#05262F', '#010C12', fg(1.06));
  },
  aurora(g, w, h, hz, R, P, fg) {
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
    peaks(g, w, fg(0.28), h * 0.16, 6, '#1A2140', R);
    peaks(g, w, fg(0.62), h * 0.12, 8, '#0E1428', R);
    ground(g, w, h, fg(0.70), '#0B1120', '#03060C', fg(1.06));
  },
  cosmos(g, w, h, hz, R, P, fg) {
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
    peaks(g, w, fg(0.42), h * 0.13, 7, '#150C2A', R);
    ground(g, w, h, fg(0.70), '#120A26', '#04010C', fg(1.06));
  }
};
