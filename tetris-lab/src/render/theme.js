/* Palette and themes.

   Palette indices are what the engine stores in cells:
     1-7   the classic tetrominoes (I O T S Z J L) -- guideline hues
     8     garbage
     9-30  the Lab's extended hue wheel
   Each index also has a GLYPH, drawn on blocks when the colour-blind option is
   on, so no information is ever carried by hue alone.

   A theme restyles everything around the pieces (background, board, frame,
   particles, UI accents) and nudges piece saturation/lightness to sit well on
   it, without ever changing which hue a piece is. */

const CLASSIC = ['#1fd7f0', '#ffd22e', '#b14dff', '#3ee06a', '#ff4d5e', '#3d7bff', '#ff9a2e'];
const GARBAGE = '#7b8499';

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export const PALETTE = (() => {
  const p = new Array(32).fill('#888888');
  CLASSIC.forEach((c, i) => { p[i + 1] = c; });
  p[8] = GARBAGE;
  for (let i = 9; i <= 30; i++) {
    const k = i - 9;
    // Interleave so neighbouring indices are far apart on the wheel.
    const hue = ((k * 7) % 22) * (360 / 22) + 8;
    p[i] = hsl(hue, 82, k % 2 ? 62 : 56);
  }
  p[31] = '#ffffff';
  return p;
})();

/* Glyph ids drawn by render/blocks.js. */
export const GLYPHS = ['none', 'bar', 'square', 'triangle', 'wave', 'cross', 'diamond', 'chevron', 'dot', 'ring', 'star', 'plus', 'hbar', 'bolt'];
export function glyphFor(color) {
  if (color >= 1 && color <= 7) return GLYPHS[color];
  if (color === 8) return 'hbar';
  return GLYPHS[1 + ((color - 9) % (GLYPHS.length - 1))];
}

export const THEMES = {
  prism: {
    name: 'Prism', desc: 'Violet dusk with electric highlights',
    bg: ['#1a0b3d', '#3a0f6b', '#12246e'], blobs: ['#ff4fd8', '#45e3ff', '#8b5cff', '#ffb547'],
    board: '#0d0822', boardEdge: '#2a1d5c', grid: 'rgba(160,140,255,0.07)', frame: ['#ff4fd8', '#45e3ff'],
    accent: '#ff4fd8', accent2: '#45e3ff', text: '#f5f0ff', sat: 1, light: 1
  },
  sunset: {
    name: 'Sunset Arcade', desc: 'Warm synthwave horizon',
    bg: ['#2b0a2e', '#7a1c4d', '#ff7b3d'], blobs: ['#ffcc4d', '#ff4d8d', '#ff7b3d', '#b44dff'],
    board: '#1c0717', boardEdge: '#5a1c40', grid: 'rgba(255,170,120,0.08)', frame: ['#ffcc4d', '#ff4d8d'],
    accent: '#ffcc4d', accent2: '#ff4d8d', text: '#fff4ec', sat: 1.02, light: 1.02
  },
  aurora: {
    name: 'Aurora', desc: 'Northern lights over a frozen lake',
    bg: ['#04141f', '#0b3a44', '#123a2a'], blobs: ['#3dffb0', '#3dd9ff', '#a36bff', '#7dff5c'],
    board: '#061019', boardEdge: '#154a4f', grid: 'rgba(120,255,210,0.07)', frame: ['#3dffb0', '#a36bff'],
    accent: '#3dffb0', accent2: '#3dd9ff', text: '#eafff8', sat: 1, light: 1
  },
  abyss: {
    name: 'Abyss', desc: 'Bioluminescent deep ocean',
    bg: ['#020a1f', '#062a4d', '#031229'], blobs: ['#1fb8ff', '#3dffe0', '#5a6bff', '#ff5ce1'],
    board: '#020816', boardEdge: '#0f3558', grid: 'rgba(90,190,255,0.08)', frame: ['#1fb8ff', '#3dffe0'],
    accent: '#3dffe0', accent2: '#1fb8ff', text: '#e8f7ff', sat: 1.02, light: 0.98
  },
  candy: {
    name: 'Candy Pop', desc: 'Bubblegum pastels, fizzing with sugar',
    bg: ['#ff8ec9', '#b98cff', '#7fe3ff'], blobs: ['#fff275', '#ff5fa2', '#62f5c8', '#ffffff'],
    board: '#2a1240', boardEdge: '#ff8ec9', grid: 'rgba(255,200,240,0.09)', frame: ['#fff275', '#62f5c8'],
    accent: '#ff3d9a', accent2: '#2fd6ff', text: '#ffffff', sat: 1.05, light: 1.04
  },
  noir: {
    name: 'Neon Noir', desc: 'Rain-slick midnight city',
    bg: ['#050507', '#16161f', '#0a0a10'], blobs: ['#ff2a4d', '#2a8cff', '#ffffff', '#ff2a4d'],
    board: '#040406', boardEdge: '#2a2a36', grid: 'rgba(255,255,255,0.06)', frame: ['#ff2a4d', '#2a8cff'],
    accent: '#ff2a4d', accent2: '#2a8cff', text: '#f2f2f7', sat: 1.05, light: 1
  },
  gilded: {
    name: 'Gilded', desc: 'Black lacquer and hammered gold',
    bg: ['#0b0906', '#231a0c', '#0e0b07'], blobs: ['#ffcf5c', '#ff9f2e', '#fff1c1', '#c78a2a'],
    board: '#080604', boardEdge: '#5c451d', grid: 'rgba(255,207,92,0.07)', frame: ['#ffcf5c', '#fff1c1'],
    accent: '#ffcf5c', accent2: '#fff1c1', text: '#fff8e6', sat: 0.98, light: 1.02
  }
};

export const HIGH_CONTRAST = {
  board: '#000000', boardEdge: '#ffffff', grid: 'rgba(255,255,255,0.18)'
};

export function theme(id) { return THEMES[id] || THEMES.prism; }

/* ------------------------------------------------------ colour utils -- */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Palette colour adjusted for a theme. */
export function pieceColor(index, th) {
  let c = PALETTE[index] || PALETTE[9];
  if (th && th.light > 1) c = lighten(c, (th.light - 1) * 2);
  if (th && th.light < 1) c = darken(c, (1 - th.light) * 2);
  return c;
}
