// Deterministic randomness. The world is a pure function of (seed, chunk), so
// chunk generation uses hashed seeds rather than one shared stream: chunks can
// be generated in any order, evicted and regenerated, and still come out the
// same.

// 32-bit integer hash of any number of integers (murmur3-style finaliser).
export function hash(...ints) {
  let h = 0x9e3779b9;
  for (let i = 0; i < ints.length; i++) {
    let k = ints[i] | 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Uniform float in [0, 1) from integer coordinates.
export const hash01 = (...ints) => hash(...ints) / 4294967296;

// Small fast PRNG with a stream API.
export class Rng {
  constructor(seed) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return a + Math.floor((b - a + 1) * this.next());
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  // Picks a key from { key: weight } proportionally.
  weighted(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = this.next() * total;
    for (const k in table) {
      r -= table[k];
      if (r < 0) return k;
    }
    return null;
  }
}

// Smooth 2D value noise in [0, 1], deterministic per seed.
export function valueNoise(seed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(seed, xi, yi);
  const b = hash01(seed, xi + 1, yi);
  const c = hash01(seed, xi, yi + 1);
  const d = hash01(seed, xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Accepts a number or any string and returns a 32-bit seed.
export function seedFrom(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const s = String(value ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const randomSeed = () => (Math.random() * 4294967296) >>> 0;
