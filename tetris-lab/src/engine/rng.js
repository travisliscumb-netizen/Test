/* Seeded, serialisable PRNG (mulberry32).

   Every source of randomness in the engine goes through one of these so that a
   game, a bot simulation or a Lab design run can be replayed exactly from its
   seed. Math.random is never used inside src/engine or src/lab. */

export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n) { return Math.floor(this.next() * n); }

  /** Integer in [lo, hi] inclusive. */
  range(lo, hi) { return lo + this.int(hi - lo + 1); }

  pick(arr) { return arr[this.int(arr.length)]; }

  chance(p) { return this.next() < p; }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Index drawn from non-negative weights. Falls back to uniform if all are 0. */
  weighted(weights) {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (!(total > 0)) return this.int(weights.length);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] > 0 ? weights[i] : 0;
      if (r < w) return i;
      r -= w;
    }
    return weights.length - 1;
  }

  /** Independent child stream; deterministic given this stream's state. */
  fork() { return new Rng((this.next() * 4294967296) ^ 0x5bd1e995); }

  get state() { return this.s; }
  set state(v) { this.s = v >>> 0; }
}

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeed() {
  // Only used at the boundary (starting a new game); never inside simulation.
  const g = globalThis.crypto;
  if (g && g.getRandomValues) return g.getRandomValues(new Uint32Array(1))[0];
  return (Date.now() ^ (performance.now() * 1000)) >>> 0;
}
