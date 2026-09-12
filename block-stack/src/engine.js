/* Block Stack — pure game engine.
   No DOM, no canvas, no audio. Deterministic given (config, tap times), so the
   headless balance simulator drives exactly the same code the game runs. */

import { BASE, BLOCK_H, MIN_SIZE, RECOVER, PERFECT_STREAK, blockColor, rateRun } from './config.js';

export const PHASE = {
  READY: 'ready',       // level armed, first block moving, nothing placed yet
  PLAYING: 'playing',
  ENDLESS: 'endless',   // boss requirement met, player chose to keep stacking
  OVER: 'over',
  COMPLETE: 'complete'
};

/* ------------------------------------------------------------- rhythms ----
   u = progress along the current directed sweep, 0..1. Every profile is a
   pure function of u, so a player can learn it. Nothing is random.        */
const bump = (u, c, hw) => {
  const d = Math.abs(u - c) / hw;
  if (d >= 1) return 0;
  const x = 1 - d;
  return x * x * (3 - 2 * x);
};

export const RHYTHMS = {
  constant: () => 1,
  accel: (u) => 0.62 + 0.85 * u,
  decel: (u) => 1.47 - 0.85 * u,
  // Two pulses per sweep. The phase matters: a symmetric double pulse with its
  // minima at the walls also puts one at u=0.5 -- which is exactly the target
  // centre -- so the block would crawl through the hardest moment and `pulse`
  // would be EASIER than constant speed. Peaks go at the walls and the centre.
  pulse: (u) => 1 + 0.36 * Math.cos(4 * Math.PI * u),
  pause: (u) => 1 - 0.94 * Math.max(bump(u, 0.33, 0.055), bump(u, 0.69, 0.055)),
  reverse: () => 1
};

const SCRIPTED_REVERSE_AT = 0.62;
const REVERSE_COOLDOWN = 3; // sweeps between scripted reversals -> 6-sweep cycle

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* The perfect window is a time budget. Converting it with the block's
   instantaneous speed keeps precision and speed independent difficulty knobs,
   and makes a slow stretch of a rhythm honestly easier to hit. The clamp stops
   a deep pause from turning into a free perfect. */
const RHYTHM_WINDOW_CLAMP = [0.70, 1.50];
export function perfectWindowOf(active) {
  const f = RHYTHMS[active.rhythm] || RHYTHMS.constant;
  const m = clamp(f(clamp(active.u, 0, 1)), RHYTHM_WINDOW_CLAMP[0], RHYTHM_WINDOW_CLAMP[1]);
  return active.perfectTime * active.speed * m;
}

export class Game {
  /**
   * @param {object} cfg level config from config.js
   * @param {object} [opts] { assist:boolean }
   */
  constructor(cfg, opts = {}) {
    this.cfg = cfg;
    this.assistEnabled = opts.assist !== false;
    this.events = [];

    const s = cfg.maxSize;
    this.blocks = [{
      x: 0, z: 0, w: s, d: s, y: 0, index: 0,
      color: blockColor(cfg.world, 0), settle: 0
    }];

    this.placed = 0;
    this.perfects = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.recoveries = 0;
    this.score = 0;
    this.smallest = s;
    this.streakForRecovery = 0;
    this.time = 0;
    this.phase = PHASE.READY;
    this.active = null;
    this.debris = [];
    this.bossCleared = false;
    this.endlessBlocks = 0;

    this._spawn();
  }

  get top() { return this.blocks[this.blocks.length - 1]; }
  get remaining() { return Math.min(this.top.w, this.top.d); }
  get goal() { return this.cfg.target; }
  get progress() { return clamp(this.placed / this.cfg.target, 0, 1); }

  emit(type, data) { this.events.push(Object.assign({ type }, data)); }
  drain() { const e = this.events; this.events = []; return e; }

  /* Hidden comeback assistance. Never announced, never shown. */
  _assist() {
    if (!this.assistEnabled) return { speed: 1, travel: 1, perfect: 1 };
    const floor = 0.45 * this.cfg.maxSize;
    if (this.remaining >= floor) return { speed: 1, travel: 1, perfect: 1 };
    const t = clamp((floor - this.remaining) / (floor - MIN_SIZE), 0, 1);
    return { speed: 1 - 0.18 * t, travel: 1 - 0.16 * t, perfect: 1 + 0.55 * t };
  }

  _axisFor(i) {
    const m = this.cfg.axis;
    if (m === 'x') return 'x';
    if (m === 'z') return 'z';
    if (m === 'alt') return i % 2 === 0 ? 'x' : 'z';
    if (m === 'alt2') return Math.floor(i / 2) % 2 === 0 ? 'x' : 'z';
    return 'x';
  }

  _spawn() {
    const cfg = this.cfg;
    const top = this.top;
    const i = this.placed;
    const axis = this._axisFor(i);
    const a = this._assist();

    const center = axis === 'x' ? top.x : top.z;
    const range = cfg.travel * a.travel;
    const startSide = cfg.dir === 'flip' ? (i % 2 === 0 ? -1 : 1) : -1;
    const rhythm = cfg.rhythms[i % cfg.rhythms.length];

    this.active = {
      axis, center, range,
      pos: center + startSide * range,
      dir: -startSide,
      speed: cfg.speed * a.speed,
      perfectTime: cfg.perfect * a.perfect,  // seconds of slack, not units
      rhythm,
      u: 0,
      sweepsSinceScripted: REVERSE_COOLDOWN,
      w: top.w, d: top.d,
      y: top.y + BLOCK_H,
      index: i + 1,
      color: blockColor(cfg.world, i + 1),
      spawnAt: this.time
    };
    this.emit('spawn', { axis, rhythm, dirFromLeft: startSide < 0 });
  }

  /* ------------------------------------------------------------- update -- */
  update(dt) {
    this.time += dt;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const p = this.debris[i];
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) this.debris.splice(i, 1);
    }
    for (const b of this.blocks) if (b.settle > 0) b.settle = Math.max(0, b.settle - dt * 4.5);

    const a = this.active;
    if (!a || this.phase === PHASE.OVER || this.phase === PHASE.COMPLETE) return;

    const span = a.range * 2;
    const mult = RHYTHMS[a.rhythm] ? RHYTHMS[a.rhythm](clamp(a.u, 0, 1)) : 1;
    const step = a.speed * mult * dt;
    a.pos += a.dir * step;
    a.u += step / span;

    // Scripted mid-sweep reversal (world 8+). Fires on a fixed 6-sweep cycle.
    if (a.rhythm === 'reverse' && a.u >= SCRIPTED_REVERSE_AT &&
        a.sweepsSinceScripted >= REVERSE_COOLDOWN) {
      a.dir *= -1; a.u = 0; a.sweepsSinceScripted = 0;
      this.emit('turn', { scripted: true });
    }

    const lo = a.center - a.range, hi = a.center + a.range;
    if (a.pos <= lo) { a.pos = lo + (lo - a.pos); a.dir = 1; a.u = 0; a.sweepsSinceScripted++; this.emit('turn', { scripted: false }); }
    else if (a.pos >= hi) { a.pos = hi - (a.pos - hi); a.dir = -1; a.u = 0; a.sweepsSinceScripted++; this.emit('turn', { scripted: false }); }
    a.pos = clamp(a.pos, lo, hi);
  }

  /* -------------------------------------------------------------- place -- */
  place() {
    if (!this.active || this.phase === PHASE.OVER || this.phase === PHASE.COMPLETE) return null;
    if (this.phase === PHASE.READY) this.phase = PHASE.PLAYING;

    const a = this.active;
    const top = this.top;
    const axis = a.axis;
    const size = axis === 'x' ? a.w : a.d;
    const cTop = axis === 'x' ? top.x : top.z;
    const delta = a.pos - cTop;
    const mag = Math.abs(delta);

    // Complete miss.
    if (mag >= size) {
      this._pushDebris({ x: axis === 'x' ? a.pos : top.x, z: axis === 'z' ? a.pos : top.z,
        y: a.y, w: a.w, d: a.d, color: a.color, vx: 0, vz: 0, outward: Math.sign(delta) || 1, axis });
      this.active = null;
      this.combo = 0; this.streakForRecovery = 0;
      this.phase = PHASE.OVER;
      this.emit('miss', { total: true });
      this.emit('over', this.summary());
      return { kind: 'miss' };
    }

    const perfect = mag <= perfectWindowOf(a);
    let newSize = size, newCenter = cTop;
    let cutWidth = 0, cutCenter = 0;

    if (!perfect) {
      newSize = size - mag;
      newCenter = cTop + delta / 2;
      cutWidth = mag;
      cutCenter = a.pos + Math.sign(delta) * (size - mag) / 2;

      if (newSize < MIN_SIZE) {
        this._pushDebris({ x: axis === 'x' ? a.pos : top.x, z: axis === 'z' ? a.pos : top.z,
          y: a.y, w: a.w, d: a.d, color: a.color, outward: Math.sign(delta) || 1, axis });
        this.active = null;
        this.combo = 0; this.streakForRecovery = 0;
        this.phase = PHASE.OVER;
        this.emit('miss', { total: false });
        this.emit('over', this.summary());
        return { kind: 'miss' };
      }
    }

    const block = {
      x: axis === 'x' ? newCenter : top.x,
      z: axis === 'z' ? newCenter : top.z,
      w: axis === 'x' ? newSize : a.w,
      d: axis === 'z' ? newSize : a.d,
      y: a.y,
      index: a.index,
      color: a.color,
      settle: 1
    };

    let gained = 10;
    if (perfect) {
      this.perfects++;
      this.combo++;
      this.streakForRecovery++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      gained = Math.min(400, 60 + 40 * (this.combo - 1));
      this.emit('perfect', { combo: this.combo });
    } else {
      this.combo = 0;
      this.streakForRecovery = 0;
      this.debris.push(this._cutPiece(axis, cutCenter, cutWidth, block, a));
      this.emit('cut', { amount: mag, ratio: newSize / this.cfg.maxSize });
    }

    this.blocks.push(block);
    this.placed++;
    if (this.phase === PHASE.ENDLESS) this.endlessBlocks++;
    this.score += gained;
    this.smallest = Math.min(this.smallest, Math.min(block.w, block.d));
    this.emit('place', { perfect, gained, block });

    // Three-perfect recovery — meaningful, never a full reset.
    if (perfect && this.streakForRecovery >= PERFECT_STREAK) {
      this.streakForRecovery = 0;
      const grown = this._recover(block);
      if (grown > 0) {
        this.recoveries++;
        this.score += 120;
        this.emit('recover', { amount: grown, block });
      }
    }

    this.active = null;

    if (this.phase !== PHASE.ENDLESS && this.placed >= this.cfg.target) {
      if (this.cfg.boss) {
        this.bossCleared = true;
        this.phase = PHASE.ENDLESS;
        this.emit('bossCleared', this.summary());
        this._spawn();
        return { kind: perfect ? 'perfect' : 'place', cleared: true };
      }
      this.phase = PHASE.COMPLETE;
      this.score += 250 * this.rating();
      this.emit('complete', this.summary());
      return { kind: perfect ? 'perfect' : 'place', complete: true };
    }

    this._spawn();
    return { kind: perfect ? 'perfect' : 'place' };
  }

  _recover(block) {
    const max = this.cfg.maxSize;
    let budget = RECOVER;
    let grown = 0;
    // Restore the axis that lost the most first.
    const axes = [['w', max - block.w], ['d', max - block.d]].sort((p, q) => q[1] - p[1]);
    for (const [key, deficit] of axes) {
      if (budget <= 0 || deficit <= 1e-6) continue;
      const add = Math.min(budget, deficit);
      block[key] += add;
      budget -= add;
      grown += add;
    }
    return grown;
  }

  _cutPiece(axis, center, width, kept, a) {
    const outward = Math.sign(center - (axis === 'x' ? kept.x : kept.z)) || 1;
    return {
      x: axis === 'x' ? center : kept.x,
      z: axis === 'z' ? center : kept.z,
      y: a.y,
      w: axis === 'x' ? width : a.w,
      d: axis === 'z' ? width : a.d,
      color: a.color,
      vx: axis === 'x' ? outward * 1.1 : 0,
      vz: axis === 'z' ? outward * 1.1 : 0,
      vy: 0.9,
      life: 1.6,
      spin: outward * 0.9
    };
  }

  _pushDebris(o) {
    const outward = o.outward || 1;
    this.debris.push({
      x: o.x, z: o.z, y: o.y, w: o.w, d: o.d, color: o.color,
      vx: o.axis === 'x' ? outward * 1.4 : 0,
      vz: o.axis === 'z' ? outward * 1.4 : 0,
      vy: 1.1, life: 2.2, spin: outward * 1.2
    });
  }

  /** Boss continuation: player banks the run. */
  finish() {
    if (this.phase !== PHASE.ENDLESS) return null;
    this.phase = PHASE.COMPLETE;
    this.active = null;
    this.score += 250 * this.rating();
    this.emit('complete', this.summary());
    return this.summary();
  }

  rating() {
    return rateRun({
      placed: this.placed,
      perfects: this.perfects,
      remaining: this.remaining,
      maxSize: this.cfg.maxSize
    });
  }

  summary() {
    return {
      level: this.cfg.num,
      world: this.cfg.world,
      boss: this.cfg.boss,
      bossCleared: this.bossCleared,
      cleared: this.bossCleared || this.placed >= this.cfg.target,
      placed: this.placed,
      target: this.cfg.target,
      perfects: this.perfects,
      bestCombo: this.bestCombo,
      recoveries: this.recoveries,
      score: this.score,
      remaining: this.remaining,
      remainingPct: this.remaining / this.cfg.maxSize,
      smallest: this.smallest,
      endlessBlocks: this.endlessBlocks,
      crowns: this.rating(),
      height: this.blocks.length - 1
    };
  }
}

export { BASE, BLOCK_H, MIN_SIZE };
