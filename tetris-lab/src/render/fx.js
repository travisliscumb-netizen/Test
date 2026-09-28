/* Particle effects on a full-screen overlay canvas.

   Pooled: particles live in preallocated typed arrays, so a four-line clear
   that spawns hundreds of sparks allocates nothing. Coordinates are CSS
   pixels in page space, which lets bursts fly out of the well and across the
   side panels. Reduced-motion mode cuts counts and removes shockwaves. */

const MAX = 1400;
const KIND_SPARK = 0, KIND_SHARD = 1, KIND_GLOW = 2;

export class FX {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX); this.rot = new Float32Array(MAX); this.vr = new Float32Array(MAX);
    this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.color = new Array(MAX).fill('#fff');
    this.count = 0;
    this.rings = [];
    this.scale = 1;       // effect intensity multiplier (reduced motion -> 0.35)
    this.dpr = 1;
    this.seed = 1;
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.w = w; this.h = h;
  }

  spawn(x, y, vx, vy, life, size, color, kind = KIND_SPARK, grav = 900, drag = 0.9) {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.rot[i] = this.rand() * Math.PI; this.vr[i] = (this.rand() - 0.5) * 12;
    this.grav[i] = grav; this.drag[i] = drag; this.kind[i] = kind; this.color[i] = color;
  }

  /** Burst from a cell: shards + sparks in the cell's colour. */
  cellBurst(x, y, cell, color, power = 1) {
    const n = Math.max(1, Math.round((5 + power * 4) * this.scale));
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (120 + this.rand() * 380) * (0.7 + power * 0.35);
      const kind = k % 3 === 0 ? KIND_SHARD : KIND_SPARK;
      this.spawn(x + (this.rand() - 0.5) * cell * 0.6, y + (this.rand() - 0.5) * cell * 0.6,
        Math.cos(a) * sp, Math.sin(a) * sp - 180 * power, 0.45 + this.rand() * 0.55,
        kind === KIND_SHARD ? cell * (0.18 + this.rand() * 0.2) : 2 + this.rand() * 3, color, kind, 1100, 0.88);
    }
  }

  /** Dust puff where a hard-dropped piece lands. */
  impact(x, y, width, color, power = 1) {
    const n = Math.round(10 * power * this.scale);
    for (let k = 0; k < n; k++) {
      const dir = this.rand() < 0.5 ? -1 : 1;
      this.spawn(x + (this.rand() - 0.5) * width, y, dir * (80 + this.rand() * 260) * power, -(40 + this.rand() * 160) * power,
        0.35 + this.rand() * 0.3, 2 + this.rand() * 2.5, color, KIND_SPARK, 700, 0.86);
    }
  }

  /** Soft glowing motes rising (level up, perfect clear). */
  motes(x, y, w, h, colors, n = 40) {
    n = Math.round(n * this.scale);
    for (let k = 0; k < n; k++) {
      this.spawn(x + this.rand() * w, y + this.rand() * h, (this.rand() - 0.5) * 60, -(60 + this.rand() * 180),
        1 + this.rand() * 1.2, 3 + this.rand() * 6, colors[k % colors.length], KIND_GLOW, -40, 0.97);
    }
  }

  ring(x, y, color, maxR = 160, life = 0.5, width = 6) {
    if (this.scale < 0.5) return;
    this.rings.push({ x, y, color, r: 4, maxR, life, max: life, width });
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.count;
        if (i !== j) {
          this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j];
          this.rot[i] = this.rot[j]; this.vr[i] = this.vr[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
          this.kind[i] = this.kind[j]; this.color[i] = this.color[j];
        }
        continue;
      }
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      i++;
    }
    for (const r of this.rings) { r.life -= dt; r.r += (r.maxR - r.r) * Math.min(1, dt * 9); }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.count && !this.rings.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.max[i];
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = this.color[i];
      const s = this.size[i];
      if (this.kind[i] === KIND_SHARD) {
        ctx.save();
        ctx.translate(this.x[i], this.y[i]);
        ctx.rotate(this.rot[i]);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (this.kind[i] === KIND_GLOW) {
        ctx.globalAlpha = Math.min(1, t) * 0.7;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], s * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    }
    for (const r of this.rings) {
      const t = r.life / r.max;
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * t + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  get active() { return this.count > 0 || this.rings.length > 0; }
  clear() { this.count = 0; this.rings = []; }
}
