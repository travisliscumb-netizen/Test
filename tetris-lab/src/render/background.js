/* Animated background.

   Rendered at half resolution and scaled up by CSS: everything here is soft
   (glows, out-of-focus silhouettes), so the lost detail reads as depth of
   field and the fill-rate cost drops by 4x.

   Layers, back to front:
     gradient sky (theme), orbiting light blobs, three parallax layers of
     drifting piece silhouettes, twinkling motes, gameplay reactions (clear
     pulses, level-up hue swing, danger tint).
   Reduced motion freezes everything after one frame. */

import { rgba, hexToRgb } from './theme.js';

const SHAPES = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]
];

export class Background {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.theme = null;
    this.t = 0;
    this.energy = 0;
    this.danger = 0;
    this.intensity = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.hueKick = 0;
    this.reduced = false;
    this.frozen = false;
    this.seed = 7;
    this.floaters = [];
    this.motes = [];
    this.scale = 0.5;
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }

  setTheme(th) { this.theme = th; this.frozen = false; }
  setReduced(r) { this.reduced = r; this.frozen = false; }

  resize(w, h, dpr) {
    this.scale = Math.min(0.6, 0.5 * Math.max(1, dpr * 0.75));
    this.w = w; this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * this.scale));
    this.canvas.height = Math.max(1, Math.round(h * this.scale));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.populate();
    this.frozen = false;
  }

  populate() {
    const area = (this.w * this.h) / (1280 * 800);
    const n = Math.round(14 + 14 * Math.min(1.6, area));
    this.floaters = [];
    for (let i = 0; i < n; i++) this.floaters.push(this.newFloater(true));
    this.motes = [];
    for (let i = 0; i < Math.round(50 * Math.min(1.5, area) + 20); i++) {
      this.motes.push({ x: this.rand(), y: this.rand(), s: 0.6 + this.rand() * 1.8, p: this.rand() * Math.PI * 2, f: 0.6 + this.rand() * 1.8 });
    }
  }

  newFloater(anywhere) {
    const depth = this.rand();
    return {
      shape: SHAPES[Math.floor(this.rand() * SHAPES.length)],
      x: this.rand(), y: anywhere ? this.rand() : 1.15,
      depth,
      size: 10 + depth * 26,
      rot: this.rand() * Math.PI * 2,
      vr: (this.rand() - 0.5) * 0.25,
      vy: 0.008 + depth * 0.02,
      vx: (this.rand() - 0.5) * 0.006,
      color: Math.floor(this.rand() * 4),
      filled: this.rand() < 0.45
    };
  }

  /** Gameplay reactions. */
  pulse(amount, color) {
    this.flash = Math.min(1.2, this.flash + amount);
    if (color) this.flashColor = color;
  }
  kickHue(amount) { this.hueKick = Math.min(1, this.hueKick + amount); }

  update(dt, { danger = 0, intensity = 0 } = {}) {
    this.danger += (danger - this.danger) * Math.min(1, dt * 3);
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.hueKick = Math.max(0, this.hueKick - dt * 0.6);
    if (this.reduced) return;
    const speed = 1 + this.intensity * 1.6 + this.hueKick * 2;
    this.t += dt * speed;
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      f.y -= f.vy * dt * speed;
      f.x += f.vx * dt;
      f.rot += f.vr * dt * speed;
      if (f.y < -0.15 || f.x < -0.15 || f.x > 1.15) this.floaters[i] = this.newFloater(false);
    }
  }

  draw() {
    if (!this.theme) return;
    if (this.reduced && this.frozen && this.flash <= 0 && this.danger < 0.01) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const th = this.theme;
    const k = this.scale;

    // Sky.
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, th.bg[0]);
    g.addColorStop(0.55, th.bg[1]);
    g.addColorStop(1, th.bg[2]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Orbiting light blobs.
    ctx.globalCompositeOperation = 'lighter';
    const t = this.t;
    const R = Math.max(W, H);
    for (let i = 0; i < 5; i++) {
      const col = th.blobs[i % th.blobs.length];
      const bx = W * (0.5 + 0.42 * Math.sin(t * (0.05 + i * 0.013) + i * 1.7));
      const by = H * (0.5 + 0.38 * Math.cos(t * (0.043 + i * 0.011) + i * 2.3));
      const br = R * (0.34 + 0.08 * Math.sin(t * 0.1 + i));
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const a = 0.2 + 0.08 * this.intensity + 0.12 * this.flash;
      rg.addColorStop(0, rgba(col, a));
      rg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // Parallax silhouettes.
    ctx.globalCompositeOperation = 'source-over';
    for (const f of this.floaters) {
      const col = th.blobs[f.color % th.blobs.length];
      const s = f.size * k * (0.8 + this.hueKick * 0.2);
      ctx.save();
      ctx.translate(f.x * W, f.y * H);
      ctx.rotate(f.rot);
      ctx.globalAlpha = 0.06 + f.depth * 0.12;
      ctx.fillStyle = rgba(col, f.filled ? 0.8 : 0.0);
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = Math.max(1, s * 0.09);
      let cx = 0, cy = 0;
      for (const [x, y] of f.shape) { cx += x; cy += y; }
      cx /= f.shape.length; cy /= f.shape.length;
      for (const [x, y] of f.shape) {
        const px = (x - cx - 0.5) * s, py = (y - cy - 0.5) * s;
        const inset = s * 0.08;
        if (f.filled) ctx.fillRect(px + inset, py + inset, s - inset * 2, s - inset * 2);
        else ctx.strokeRect(px + inset, py + inset, s - inset * 2, s - inset * 2);
      }
      ctx.restore();
    }

    // Twinkles.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (const m of this.motes) {
      const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(this.t * m.f + m.p));
      ctx.globalAlpha = a;
      const s = m.s * k * 2;
      ctx.fillRect(m.x * W, ((m.y - this.t * 0.004 * m.f) % 1 + 1) % 1 * H, s, s);
    }

    // Clear pulse.
    if (this.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.5, this.flash * 0.35);
      const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.7);
      rg.addColorStop(0, this.flashColor);
      rg.addColorStop(1, rgba(this.flashColor, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    // Danger tint and vignette.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, R * 0.25, W / 2, H / 2, R * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    const [dr, dg, db] = hexToRgb('#ff2046');
    const d = this.danger;
    vg.addColorStop(1, d > 0.01 ? `rgba(${dr},${dg},${db},${0.18 + d * 0.3})` : 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    this.frozen = true;
  }
}
