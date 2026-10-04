/* Vector character art. Every function draws in logical units around (x, y)
   on whatever transform the caller has set, so the same code paints the game,
   the menus' roster and the generated app icons. */

export const COLORS = {
  pac: ['#fffbd0', '#ffe94a', '#ffc400', '#e09a00'],
  ghost: { blinky: '#ff3b3b', pinky: '#ffa6ee', inky: '#2ee8ff', clyde: '#ffb54d' },
  fright: '#2f3dff',
  frightFace: '#ffd7b8',
  flash: '#f3f4ff',
  flashFace: '#ff2d55',
  eyeWhite: '#ffffff',
  pupil: '#1d2fe0'
};

const TAU = Math.PI * 2;
const DIR_ANGLE = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];   // up, left, down, right

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

/* ------------------------------------------------------------------ pac */

/* mouth: half-angle of the wedge in radians. */
export function drawPac(ctx, x, y, r, mouth, dir = 1) {
  const a = DIR_ANGLE[dir] ?? Math.PI;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.05);
  g.addColorStop(0, COLORS.pac[0]);
  g.addColorStop(0.35, COLORS.pac[1]);
  g.addColorStop(0.8, COLORS.pac[2]);
  g.addColorStop(1, COLORS.pac[3]);
  ctx.fillStyle = g;
  ctx.beginPath();
  if (mouth <= 0.001) ctx.arc(x, y, r, 0, TAU);
  else {
    ctx.moveTo(x - Math.cos(a) * r * 0.18, y - Math.sin(a) * r * 0.18);
    ctx.arc(x, y, r, a + mouth, a - mouth + TAU);
    ctx.closePath();
  }
  ctx.fill();
}

/* The arcade death: Pac-Man turns upward and his mouth opens until nothing is
   left. p runs 0..1. */
export function drawPacDeath(ctx, x, y, r, p) {
  if (p >= 1) return;
  const mouth = 0.12 + p * (Math.PI - 0.12);
  drawPac(ctx, x, y, r, mouth, 0);
}

/* --------------------------------------------------------------- ghosts */

function ghostBodyPath(ctx, x, y, t) {
  const w = 6.7, top = y - 0.6, bottom = y + 6.6;
  ctx.beginPath();
  ctx.moveTo(x - w, bottom);
  ctx.lineTo(x - w, top);
  ctx.arc(x, top, w, Math.PI, 0);
  ctx.lineTo(x + w, bottom);
  const feet = 3, n = 24, depth = 1.9;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const px = x + w - u * w * 2;
    const py = bottom - depth * Math.abs(Math.sin(u * Math.PI * feet + t));
    ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawEyes(ctx, x, y, dir) {
  const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0;
  const dy = dir === 0 ? -1 : dir === 2 ? 1 : 0;
  ctx.fillStyle = COLORS.eyeWhite;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * 2.7 + dx * 0.9, y - 1.6 + dy * 0.9, 2.15, 2.75, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = COLORS.pupil;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * 2.7 + dx * 1.9, y - 1.6 + dy * 2.0, 1.25, 0, TAU);
    ctx.fill();
  }
}

/* mode: 'normal' | 'fright' | 'flash' | 'eyes'. t animates the skirt. */
export function drawGhost(ctx, x, y, { color, dir = 1, t = 0, mode = 'normal' }) {
  if (mode === 'eyes') { drawEyes(ctx, x, y, dir); return; }
  const base = mode === 'fright' ? COLORS.fright : mode === 'flash' ? COLORS.flash : color;
  const g = ctx.createLinearGradient(x, y - 7, x, y + 7);
  g.addColorStop(0, shade(base, 0.38));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.32));
  ctx.fillStyle = g;
  ghostBodyPath(ctx, x, y, t);
  ctx.fill();

  /* Rim light along the dome. */
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = shade(base, 0.7);
  ctx.lineWidth = 0.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - 0.6, 5.5, Math.PI * 1.12, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();

  if (mode === 'normal') { drawEyes(ctx, x, y, dir); return; }
  const face = mode === 'fright' ? COLORS.frightFace : COLORS.flashFace;
  ctx.fillStyle = face;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + s * 2.3, y - 1.4, 1.15, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = face;
  ctx.lineWidth = 0.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const px = x - 4.5 + i * 1.5, py = y + 2.8 + (i % 2 ? -1 : 0);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}

/* ---------------------------------------------------------------- fruit */

function blob(ctx, x, y, r, c0, c1, hx = -0.35, hy = -0.4) {
  const g = ctx.createRadialGradient(x + r * hx, y + r * hy, r * 0.1, x, y, r);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function shine(ctx, x, y, rx, ry, rot = -0.6, a = 0.75) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function leaf(ctx, x, y, len, ang, color = '#3ddc5a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fill();
  ctx.restore();
}

const FRUIT_ART = {
  cherry(ctx) {
    ctx.strokeStyle = '#b5762e';
    ctx.lineWidth = 0.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.6, 1.6); ctx.quadraticCurveTo(-0.5, -3.5, 3.6, -5.2);
    ctx.moveTo(2.4, 2.6); ctx.quadraticCurveTo(2.2, -2, 3.6, -5.2);
    ctx.stroke();
    leaf(ctx, 3.4, -5.1, 3.4, -2.6);
    blob(ctx, -2.6, 2.9, 2.85, '#ff8a8a', '#c0001a');
    blob(ctx, 2.6, 3.6, 2.85, '#ff8a8a', '#c0001a');
    shine(ctx, -3.5, 1.9, 0.75, 0.45);
    shine(ctx, 1.7, 2.6, 0.75, 0.45);
  },
  strawberry(ctx) {
    const g = ctx.createRadialGradient(-1.4, -1.5, 0.5, 0, 0.5, 6);
    g.addColorStop(0, '#ff7a7a'); g.addColorStop(1, '#c4001f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-5.8, 2.2, -6, -3.6, -2.2, -3.6);
    ctx.quadraticCurveTo(0, -4.2, 2.2, -3.6);
    ctx.bezierCurveTo(6, -3.6, 5.8, 2.2, 0, 6);
    ctx.fill();
    ctx.fillStyle = '#fff3c0';
    for (const [sx, sy] of [[-2.6, -1.4], [0, -1.8], [2.6, -1.4], [-1.4, 0.8], [1.4, 0.8], [-2.8, 1.6], [2.8, 1.6], [0, 3], [-1.2, 4.1], [1.2, 4.1], [0, 0.2]]) {
      ctx.beginPath(); ctx.ellipse(sx, sy, 0.32, 0.5, 0, 0, TAU); ctx.fill();
    }
    for (const a of [-2.2, -1.4, -0.4, 0.4, 1.4]) leaf(ctx, 0, -3.6, 3.2, a - Math.PI / 2 + 0.2, '#2fcc55');
    ctx.fillStyle = '#25a845';
    ctx.fillRect(-0.4, -6, 0.8, 2.4);
  },
  orange(ctx) {
    blob(ctx, 0, 1, 5.1, '#ffd08a', '#e86a00');
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (const [sx, sy] of [[-2, 2], [1.5, 3.4], [2.6, 0], [-0.4, -1.8], [0.4, 0.8]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 0.3, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -3.9); ctx.lineTo(0.4, -5.4); ctx.stroke();
    leaf(ctx, 0.4, -5, 3.6, -0.35, '#36d35a');
    shine(ctx, -2, -1.4, 1.1, 0.6);
  },
  apple(ctx) {
    const g = ctx.createRadialGradient(-1.6, -1.2, 0.4, 0, 1, 6.2);
    g.addColorStop(0, '#ff8d8d'); g.addColorStop(1, '#b00018');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -2.8);
    ctx.bezierCurveTo(-2.6, -5.2, -6.6, -3.4, -5.6, 1.4);
    ctx.bezierCurveTo(-4.8, 5.4, -1.8, 6.6, 0, 5.4);
    ctx.bezierCurveTo(1.8, 6.6, 4.8, 5.4, 5.6, 1.4);
    ctx.bezierCurveTo(6.6, -3.4, 2.6, -5.2, 0, -2.8);
    ctx.fill();
    ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 0.75; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -2.6); ctx.quadraticCurveTo(0.2, -4.8, 1, -5.8); ctx.stroke();
    leaf(ctx, 0.7, -4.6, 3.4, -0.5, '#3ddc5a');
    shine(ctx, -2.8, -0.8, 1.2, 0.65);
  },
  melon(ctx) {
    const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0.8, 6);
    g.addColorStop(0, '#b9ff9a'); g.addColorStop(1, '#1f8f2a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0.8, 5, 5.4, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0.8, 5, 5.4, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(10, 80, 20, 0.75)'; ctx.lineWidth = 0.7;
    for (const sx of [-3.4, -1.2, 1.2, 3.4]) {
      ctx.beginPath(); ctx.moveTo(sx * 0.6, -4.6); ctx.quadraticCurveTo(sx * 1.25, 0.8, sx * 0.6, 6.2); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -4.4); ctx.lineTo(0.6, -6); ctx.stroke();
    shine(ctx, -2.2, -1.6, 1, 0.55);
  },
  galaxian(ctx) {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(-1.6, -1); ctx.lineTo(0, -3); ctx.lineTo(1.6, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2f6bff';
    ctx.beginPath();
    ctx.moveTo(-1.4, 0); ctx.lineTo(-6, -4.6); ctx.lineTo(-5.8, 0.6); ctx.lineTo(-1.2, 3.4); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1.4, 0); ctx.lineTo(6, -4.6); ctx.lineTo(5.8, 0.6); ctx.lineTo(1.2, 3.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3045';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-1.8, -2.4); ctx.lineTo(1.8, -2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3045';
    ctx.fillRect(-0.5, -1.5, 1, 1.2);
  },
  bell(ctx) {
    const g = ctx.createLinearGradient(-5, -5, 5, 5);
    g.addColorStop(0, '#fff6a0'); g.addColorStop(0.5, '#ffd51a'); g.addColorStop(1, '#d99a00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.4, 3.6);
    ctx.bezierCurveTo(-4.4, 2.6, -4.6, -5.4, 0, -5.4);
    ctx.bezierCurveTo(4.6, -5.4, 4.4, 2.6, 5.4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d99a00';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-5.6, 3.2, 11.2, 1.5, 0.75) : ctx.rect(-5.6, 3.2, 11.2, 1.5); ctx.fill();
    ctx.fillStyle = '#2ee8ff';
    ctx.beginPath(); ctx.arc(0, 5.6, 1.15, 0, TAU); ctx.fill();
    shine(ctx, -2, -2.4, 0.9, 1.8, 0.35, 0.6);
  },
  key(ctx) {
    ctx.fillStyle = '#2ee8ff';
    ctx.beginPath(); ctx.ellipse(0, -3.2, 3.4, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#05060f';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-1.7, -3.9, 3.4, 1.2, 0.6) : ctx.rect(-1.7, -3.9, 3.4, 1.2); ctx.fill();
    const g = ctx.createLinearGradient(-1, 0, 1, 0);
    g.addColorStop(0, '#f2f4ff'); g.addColorStop(1, '#9aa3c0');
    ctx.fillStyle = g;
    ctx.fillRect(-0.8, -0.8, 1.6, 7.2);
    ctx.fillRect(0.8, 2.6, 1.8, 1.1);
    ctx.fillRect(0.8, 4.8, 1.4, 1.1);
  }
};

export const FRUIT_KINDS = Object.keys(FRUIT_ART);

export function drawFruit(ctx, kind, x, y, scale = 1) {
  const art = FRUIT_ART[kind];
  if (!art) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  art(ctx);
  ctx.restore();
}
