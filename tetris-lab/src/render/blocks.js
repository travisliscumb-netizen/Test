/* Block painter.

   Every cell on screen is a pre-rendered sprite: each (style, lattice,
   colour, special, size, variant) combination is painted once into an
   offscreen canvas and then blitted with drawImage. That makes a detailed,
   multi-layer block (shadow, bevel, gloss, specular, texture, outline) cost the
   same per frame as a flat rectangle, so visual richness never trades against
   frame rate.

   Styles: gem (default), jelly, glass, neon, retro, flat (accessibility).
   Variants: solid, ghost (landing preview), flash (clear highlight),
             dim (a locked cell in the danger zone / game over). */

import { pieceColor, lighten, darken, rgba, glyphFor, PALETTE } from './theme.js';
import { SPECIAL_BOMB, SPECIAL_WILD } from '../engine/board.js';

const SQRT3 = Math.sqrt(3);

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ------------------------------------------------------------- paths -- */

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexPath(ctx, cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  ctx.beginPath();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[5], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < 6; i++) {
    const p = pts[i], n = pts[(i + 1) % 6];
    const m = mid(p, n);
    ctx.arcTo(p[0], p[1], m[0], m[1], r);
  }
  ctx.closePath();
}

/** Trace the cell shape centred at (cx, cy); `inset` shrinks it in px. */
function cellPath(ctx, lattice, cx, cy, size, inset, roundness) {
  if (lattice === 'hex') {
    const R = size - inset * 1.15;
    hexPath(ctx, cx, cy, R, R * roundness * 0.9);
  } else {
    const s = size - inset * 2;
    roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * roundness);
  }
}

/* ---------------------------------------------------------- glyphs -- */

function drawGlyph(ctx, kind, cx, cy, s) {
  const u = s * 0.16;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(1, s * 0.05);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'bar': ctx.moveTo(cx, cy - u * 1.3); ctx.lineTo(cx, cy + u * 1.3); ctx.stroke(); break;
    case 'hbar': ctx.moveTo(cx - u * 1.3, cy); ctx.lineTo(cx + u * 1.3, cy); ctx.stroke(); break;
    case 'square': ctx.strokeRect(cx - u, cy - u, u * 2, u * 2); break;
    case 'triangle': ctx.moveTo(cx, cy - u * 1.2); ctx.lineTo(cx + u * 1.2, cy + u); ctx.lineTo(cx - u * 1.2, cy + u); ctx.closePath(); ctx.stroke(); break;
    case 'wave': ctx.moveTo(cx - u * 1.3, cy + u * 0.4); ctx.quadraticCurveTo(cx - u * 0.6, cy - u * 1.2, cx, cy); ctx.quadraticCurveTo(cx + u * 0.6, cy + u * 1.2, cx + u * 1.3, cy - u * 0.4); ctx.stroke(); break;
    case 'cross': ctx.moveTo(cx - u, cy - u); ctx.lineTo(cx + u, cy + u); ctx.moveTo(cx + u, cy - u); ctx.lineTo(cx - u, cy + u); ctx.stroke(); break;
    case 'diamond': ctx.moveTo(cx, cy - u * 1.3); ctx.lineTo(cx + u * 1.1, cy); ctx.lineTo(cx, cy + u * 1.3); ctx.lineTo(cx - u * 1.1, cy); ctx.closePath(); ctx.stroke(); break;
    case 'chevron': ctx.moveTo(cx - u * 1.1, cy + u * 0.6); ctx.lineTo(cx, cy - u * 0.6); ctx.lineTo(cx + u * 1.1, cy + u * 0.6); ctx.stroke(); break;
    case 'dot': ctx.arc(cx, cy, u * 0.7, 0, Math.PI * 2); ctx.fill(); break;
    case 'ring': ctx.arc(cx, cy, u * 1.1, 0, Math.PI * 2); ctx.stroke(); break;
    case 'plus': ctx.moveTo(cx - u * 1.2, cy); ctx.lineTo(cx + u * 1.2, cy); ctx.moveTo(cx, cy - u * 1.2); ctx.lineTo(cx, cy + u * 1.2); ctx.stroke(); break;
    case 'bolt': ctx.moveTo(cx + u * 0.3, cy - u * 1.3); ctx.lineTo(cx - u * 0.6, cy + u * 0.1); ctx.lineTo(cx + u * 0.4, cy + u * 0.1); ctx.lineTo(cx - u * 0.3, cy + u * 1.3); ctx.stroke(); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? u * 0.55 : u * 1.3;
        const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke(); break;
    }
    default: break;
  }
  ctx.restore();
}

function drawSpecial(ctx, special, cx, cy, s) {
  if (special === SPECIAL_BOMB) {
    ctx.save();
    const r = s * 0.24;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#6b6b7a');
    g.addColorStop(1, '#101014');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.03, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
    // fuse and spark
    ctx.strokeStyle = '#d9c7a0'; ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.6); ctx.quadraticCurveTo(cx + r * 1.0, cy - r * 1.3, cx + r * 1.25, cy - r * 1.05); ctx.stroke();
    ctx.fillStyle = '#ffe066'; ctx.shadowColor = '#ff9a2e'; ctx.shadowBlur = s * 0.2;
    ctx.beginPath(); ctx.arc(cx + r * 1.3, cy - r * 1.1, s * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (special === SPECIAL_WILD) {
    ctx.save();
    const r = s * 0.26;
    const cols = ['#ff4d5e', '#ffd22e', '#3ee06a', '#1fd7f0', '#b14dff'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2 + (i * 2 * Math.PI) / 5, -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/* ------------------------------------------------------------ styles -- */

function speckle(ctx, cx, cy, s, seed) {
  // Deterministic micro-texture so blocks read as material, not flat paint.
  let x = seed * 9301 + 49297;
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 14; i++) {
    x = (x * 9301 + 49297) % 233280;
    const px = cx + ((x / 233280) - 0.5) * s * 0.7;
    x = (x * 9301 + 49297) % 233280;
    const py = cy + ((x / 233280) - 0.5) * s * 0.7;
    ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
    ctx.fillRect(px, py, Math.max(1, s * 0.03), Math.max(1, s * 0.03));
  }
  ctx.restore();
}

function paintGem(ctx, L, cx, cy, s, c) {
  const inset = s * 0.03;
  // drop shadow
  ctx.save();
  ctx.translate(0, s * 0.05);
  cellPath(ctx, L, cx, cy, s, inset, 0.2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.restore();
  // body
  cellPath(ctx, L, cx, cy, s, inset, 0.2);
  let g = ctx.createLinearGradient(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
  g.addColorStop(0, lighten(c, 0.45));
  g.addColorStop(0.45, c);
  g.addColorStop(1, darken(c, 0.42));
  ctx.fillStyle = g;
  ctx.fill();
  // inner face (bevel)
  const f = s * 0.15;
  cellPath(ctx, L, cx, cy, s, inset + f, 0.14);
  g = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  g.addColorStop(0, lighten(c, 0.2));
  g.addColorStop(1, darken(c, 0.12));
  ctx.fillStyle = g;
  ctx.fill();
  // inner glow at the bottom (light passing through the gem)
  ctx.save();
  cellPath(ctx, L, cx, cy, s, inset + f, 0.14);
  ctx.clip();
  const rg = ctx.createRadialGradient(cx, cy + s * 0.35, 0, cx, cy + s * 0.35, s * 0.55);
  rg.addColorStop(0, rgba(lighten(c, 0.5), 0.45));
  rg.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  // gloss band
  const gl = ctx.createLinearGradient(cx, cy - s / 2, cx, cy);
  gl.addColorStop(0, 'rgba(255,255,255,0.42)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.05, cy - s * 0.2, s * 0.42, s * 0.22, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  speckle(ctx, cx, cy, s, c.charCodeAt(2));
  // edge light on top-left, crisp outline
  ctx.save();
  cellPath(ctx, L, cx, cy, s, inset, 0.2);
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.strokeStyle = rgba(darken(c, 0.6), 0.75);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - s, cy - s, s * 1.0, s * 1.0);
  ctx.clip();
  cellPath(ctx, L, cx, cy, s, inset + s * 0.03, 0.2);
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.restore();
  // specular
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.24, cy - s * 0.24, Math.max(1, s * 0.055), 0, Math.PI * 2);
  ctx.fill();
}

function paintJelly(ctx, L, cx, cy, s, c) {
  const inset = s * 0.04;
  ctx.save();
  ctx.translate(0, s * 0.06);
  cellPath(ctx, L, cx, cy, s, inset, 0.36);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.restore();
  cellPath(ctx, L, cx, cy, s, inset, 0.36);
  const g = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.2, s * 0.05, cx, cy, s * 0.72);
  g.addColorStop(0, lighten(c, 0.5));
  g.addColorStop(0.5, c);
  g.addColorStop(1, darken(c, 0.35));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  cellPath(ctx, L, cx, cy, s, inset, 0.36);
  ctx.clip();
  // rim light from below
  ctx.strokeStyle = rgba(lighten(c, 0.55), 0.55);
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.1, s * 0.52, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  // big soft highlight
  const hl = ctx.createRadialGradient(cx - s * 0.12, cy - s * 0.24, 0, cx - s * 0.12, cy - s * 0.24, s * 0.3);
  hl.addColorStop(0, 'rgba(255,255,255,0.75)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.2, cy - s * 0.26, s * 0.08, s * 0.05, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function paintGlass(ctx, L, cx, cy, s, c) {
  const inset = s * 0.05;
  cellPath(ctx, L, cx, cy, s, inset, 0.16);
  const g = ctx.createLinearGradient(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
  g.addColorStop(0, rgba(lighten(c, 0.35), 0.62));
  g.addColorStop(1, rgba(darken(c, 0.2), 0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  cellPath(ctx, L, cx, cy, s, inset, 0.16);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.1);
  ctx.lineTo(cx - s * 0.1, cy - s);
  ctx.lineTo(cx + s * 0.15, cy - s);
  ctx.lineTo(cx - s, cy + s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.3, cy - s);
  ctx.lineTo(cx + s * 0.38, cy - s);
  ctx.lineTo(cx - s, cy + s * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  cellPath(ctx, L, cx, cy, s, inset, 0.16);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.strokeStyle = rgba(lighten(c, 0.55), 0.95);
  ctx.stroke();
  cellPath(ctx, L, cx, cy, s, inset + s * 0.1, 0.12);
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
}

function paintNeon(ctx, L, cx, cy, s, c) {
  const inset = s * 0.1;
  cellPath(ctx, L, cx, cy, s, inset, 0.18);
  ctx.fillStyle = rgba(darken(c, 0.72), 0.95);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = s * 0.32;
  cellPath(ctx, L, cx, cy, s, inset, 0.18);
  ctx.lineWidth = Math.max(1.5, s * 0.09);
  ctx.strokeStyle = c;
  ctx.stroke();
  ctx.restore();
  cellPath(ctx, L, cx, cy, s, inset, 0.18);
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.strokeStyle = lighten(c, 0.7);
  ctx.stroke();
  cellPath(ctx, L, cx, cy, s, inset + s * 0.16, 0.2);
  ctx.fillStyle = rgba(c, 0.22);
  ctx.fill();
}

function paintRetro(ctx, L, cx, cy, s, c) {
  const inset = s * 0.04;
  if (L === 'hex') {
    cellPath(ctx, L, cx, cy, s, inset, 0.02);
    ctx.fillStyle = c; ctx.fill();
    cellPath(ctx, L, cx, cy, s, inset + s * 0.14, 0.02);
    ctx.fillStyle = lighten(c, 0.18); ctx.fill();
    cellPath(ctx, L, cx, cy, s, inset, 0.02);
    ctx.lineWidth = Math.max(1, s * 0.06); ctx.strokeStyle = darken(c, 0.5); ctx.stroke();
    return;
  }
  const x = cx - s / 2 + inset, y = cy - s / 2 + inset, w = s - inset * 2;
  const b = Math.max(1, Math.round(w / 7));
  ctx.fillStyle = darken(c, 0.4); ctx.fillRect(x, y, w, w);
  ctx.fillStyle = lighten(c, 0.4); ctx.fillRect(x, y, w - b, w - b);
  ctx.fillStyle = c; ctx.fillRect(x + b, y + b, w - 2 * b, w - 2 * b);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + b, y + b, b, b);
  ctx.fillRect(x + b * 2, y + b, b, b);
  ctx.fillRect(x + b, y + b * 2, b, b);
}

function paintFlat(ctx, L, cx, cy, s, c, hc) {
  const inset = s * 0.04;
  cellPath(ctx, L, cx, cy, s, inset, 0.12);
  ctx.fillStyle = c;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * (hc ? 0.09 : 0.06));
  ctx.strokeStyle = hc ? '#ffffff' : darken(c, 0.45);
  ctx.stroke();
}

const PAINTERS = { gem: paintGem, jelly: paintJelly, glass: paintGlass, neon: paintNeon, retro: paintRetro, flat: paintFlat };

/* ----------------------------------------------------------- painter -- */

export class BlockPainter {
  constructor() {
    this.cache = new Map();
    this.opts = { style: 'gem', theme: null, highContrast: false, glyphs: false };
  }

  configure(opts) {
    const next = { ...this.opts, ...opts };
    if (next.style !== this.opts.style || next.theme !== this.opts.theme ||
        next.highContrast !== this.opts.highContrast || next.glyphs !== this.opts.glyphs) {
      this.cache.clear();
    }
    this.opts = next;
  }

  /** Sprite dimensions (css-agnostic px) for a cell of the given size. */
  static dims(lattice, size) {
    const pad = Math.ceil(size * 0.28);
    if (lattice === 'hex') return { w: Math.ceil(size * 2) + pad * 2, h: Math.ceil(size * SQRT3) + pad * 2, pad };
    return { w: Math.ceil(size) + pad * 2, h: Math.ceil(size) + pad * 2, pad };
  }

  sprite(lattice, color, special, size, variant = 'solid') {
    if (!Number.isFinite(size)) size = 4;
    size = Math.max(4, Math.min(256, Math.round(size * 2) / 2));
    const key = `${lattice}|${color}|${special}|${size}|${variant}`;
    let spr = this.cache.get(key);
    if (spr) return spr;
    if (this.cache.size > 1200) this.cache.clear();
    const { w, h, pad } = BlockPainter.dims(lattice, size);
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const cx = w / 2, cy = h / 2;
    // For hex, `size` is the circumradius; painters use s as the cell's nominal
    // diameter so proportions read the same on both lattices.
    const s = lattice === 'hex' ? size * 1.8 : size;
    const L = lattice;
    const shapeSize = lattice === 'hex' ? size : size;
    const base = color === 0 ? '#888888' : pieceColor(color, this.opts.theme);
    const hc = this.opts.highContrast;
    const style = hc ? 'flat' : this.opts.style;

    // The painters take the cell shape size (side for squares, radius for hexes).
    const paint = (fn) => fn(ctx, L, cx, cy, shapeSize, base, hc);
    if (variant === 'ghost') {
      cellPath(ctx, L, cx, cy, shapeSize, shapeSize * 0.08, 0.2);
      ctx.fillStyle = rgba(base, hc ? 0.25 : 0.16);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.strokeStyle = rgba(lighten(base, 0.25), hc ? 1 : 0.8);
      ctx.setLineDash([Math.max(2, s * 0.16), Math.max(2, s * 0.09)]);
      ctx.stroke();
    } else if (variant === 'flash') {
      ctx.save();
      ctx.shadowColor = base;
      ctx.shadowBlur = s * 0.5;
      cellPath(ctx, L, cx, cy, shapeSize, shapeSize * 0.03, 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    } else {
      paint(PAINTERS[style] || paintGem);
      if (variant === 'dim') {
        cellPath(ctx, L, cx, cy, shapeSize, shapeSize * 0.03, 0.2);
        ctx.fillStyle = 'rgba(8,6,20,0.55)';
        ctx.fill();
      }
      if (special) drawSpecial(ctx, special, cx, cy, s * (lattice === 'hex' ? 0.62 : 1));
      else if (this.opts.glyphs && color) drawGlyph(ctx, glyphFor(color), cx, cy, s * (lattice === 'hex' ? 0.62 : 1));
    }
    spr = { canvas: cv, w, h, pad };
    this.cache.set(key, spr);
    return spr;
  }

  /** Draw a cell centred at (cx, cy). */
  draw(ctx, lattice, color, special, cx, cy, size, variant = 'solid') {
    const spr = this.sprite(lattice, color, special, size, variant);
    ctx.drawImage(spr.canvas, Math.round(cx - spr.w / 2), Math.round(cy - spr.h / 2));
  }
}

export { PALETTE };
