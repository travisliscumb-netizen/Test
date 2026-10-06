/* Small colour toolkit. Everything is memoised: the renderer asks for the
   same handful of shades every frame.                                    */

const parsed = new Map();
export function rgb(hex) {
  let v = parsed.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    parsed.set(hex, v);
  }
  return v;
}

const toHex = (r, g, b) => '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);

const mixCache = new Map();
export function mix(a, b, t) {
  const key = a + b + t.toFixed(3);
  let v = mixCache.get(key);
  if (!v) {
    const A = rgb(a), B = rgb(b);
    v = toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
    if (mixCache.size > 4000) mixCache.clear();
    mixCache.set(key, v);
  }
  return v;
}

export const shade = (c, t) => mix(c, '#000000', t);
export const tint = (c, t) => mix(c, '#ffffff', t);

export function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* Multiply blend (for lighting a base colour by a coloured key light). */
export function multiply(a, b, t = 1) {
  const A = rgb(a), B = rgb(b);
  const m = toHex(A[0] * B[0] / 255, A[1] * B[1] / 255, A[2] * B[2] / 255);
  return t >= 1 ? m : mix(a, m, t);
}

/* Cached radial glow sprite, drawn additively for every light source. */
const glows = new Map();
export function glowSprite(color, size = 128) {
  const key = color + size;
  let c = glows.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.18, rgba(color, 0.6));
    grad.addColorStop(0.45, rgba(color, 0.18));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    glows.set(key, c);
  }
  return c;
}

/* Soft puff sprite (normal blending) for dust and smoke: one cached
   gradient instead of a new one per particle per frame. */
const puffs = new Map();
export function puffSprite(color, size = 64) {
  const key = color + size;
  let c = puffs.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(color, 0.9));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    puffs.set(key, c);
  }
  return c;
}
