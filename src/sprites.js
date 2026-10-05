/* Vector character art. Every function draws in logical units around (x, y)
   on whatever transform the caller has set, so the same code paints the game,
   the menus and the generated app icons.

   The look is lit-sphere rather than flat: a key light from the upper left,
   a specular highlight, a darker terminator toward the lower right, and a
   thin rim so silhouettes stay crisp on any background. */

export const COLORS = {
  pac: ['#fffdf0', '#ffec3d', '#ffd21a', '#eba300'],
  ghost: { blinky: '#ff3d4f', pinky: '#ff8fd8', inky: '#2fe4ff', clyde: '#ffad42' },
  fright: '#3a46ff',
  frightDeep: '#1a1f8f',
  frightFace: '#ffe0c8',
  flash: '#f4f5ff',
  flashFace: '#ff3355',
  eyeWhite: '#ffffff',
  pupil: '#1630c9'
};

const TAU = Math.PI * 2;
const DIR_ANGLE = [-Math.PI / 2, Math.PI, Math.PI / 2, 0];   // up, left, down, right

function mix(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/* Soft contact shadow on the floor beneath an actor. */
export function drawShadow(ctx, x, y, rx, ry, alpha = 0.55) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ pac */

/* mouth: half-angle of the wedge in radians. */
export function drawPac(ctx, x, y, r, mouth, dir = 1) {
  const a = DIR_ANGLE[dir] ?? Math.PI;
  const body = new Path2D();
  if (mouth <= 0.001) body.arc(x, y, r, 0, TAU);
  else {
    body.moveTo(x - Math.cos(a) * r * 0.16, y - Math.sin(a) * r * 0.16);
    body.arc(x, y, r, a + mouth, a - mouth + TAU);
    body.closePath();
  }

  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x + r * 0.1, y + r * 0.12, r * 1.12);
  g.addColorStop(0, COLORS.pac[0]);
  g.addColorStop(0.28, COLORS.pac[1]);
  g.addColorStop(0.72, COLORS.pac[2]);
  g.addColorStop(1, COLORS.pac[3]);
  ctx.fillStyle = g;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  /* Lips: the cut faces of the wedge read as depth, not as a flat notch. */
  if (mouth > 0.001) {
    ctx.strokeStyle = 'rgba(190, 95, 0, 0.42)';
    ctx.lineWidth = r * 0.14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a + mouth) * r * 1.05, y + Math.sin(a + mouth) * r * 1.05);
    ctx.lineTo(x - Math.cos(a) * r * 0.16, y - Math.sin(a) * r * 0.16);
    ctx.lineTo(x + Math.cos(a - mouth) * r * 1.05, y + Math.sin(a - mouth) * r * 1.05);
    ctx.stroke();
  }
  /* Terminator: the far side of the sphere falls into shade. */
  const sh = ctx.createRadialGradient(x - r * 0.5, y - r * 0.55, r * 0.6, x - r * 0.2, y - r * 0.25, r * 1.6);
  sh.addColorStop(0, 'rgba(120, 50, 0, 0)');
  sh.addColorStop(1, 'rgba(150, 70, 0, 0.24)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  ctx.restore();

  /* Specular highlight. */
  ctx.save();
  ctx.globalAlpha = 0.85;
  const sp = ctx.createRadialGradient(x - r * 0.4, y - r * 0.46, 0, x - r * 0.4, y - r * 0.46, r * 0.36);
  sp.addColorStop(0, 'rgba(255,255,255,0.95)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.46, r * 0.36, r * 0.26, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(150, 80, 0, 0.3)';
  ctx.lineWidth = Math.max(0.3, r * 0.04);
  ctx.stroke(body);
}

/* The death: Pac-Man turns upward and his mouth opens until nothing is left.
   p runs 0..1. */
export function drawPacDeath(ctx, x, y, r, p) {
  if (p >= 1) return;
  drawPac(ctx, x, y, r, 0.12 + p * (Math.PI - 0.12), 0);
}

/* --------------------------------------------------------------- ghosts */

function ghostBody(x, y, t, w = 6.8) {
  const top = y - 0.4, bottom = y + 6.7;
  const p = new Path2D();
  p.moveTo(x - w, bottom - 1);
  p.lineTo(x - w, top);
  p.arc(x, top, w, Math.PI, 0);
  p.lineTo(x + w, bottom - 1);
  const feet = 3, n = 30, depth = 2.1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const px = x + w - u * w * 2;
    const py = bottom - depth * Math.abs(Math.sin(u * Math.PI * feet + t));
    p.lineTo(px, py);
  }
  p.closePath();
  return p;
}

function drawEyes(ctx, x, y, dir, glow = false) {
  const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0;
  const dy = dir === 0 ? -1 : dir === 2 ? 1 : 0;
  for (const s of [-1, 1]) {
    const ex = x + s * 2.75 + dx * 0.85, ey = y - 1.5 + dy * 0.85;
    const wg = ctx.createLinearGradient(ex, ey - 2.9, ex, ey + 2.9);
    wg.addColorStop(0, '#ffffff');
    wg.addColorStop(1, '#d9e1ff');
    ctx.fillStyle = wg;
    if (glow) { ctx.shadowColor = 'rgba(160, 200, 255, 0.9)'; ctx.shadowBlur = 4; }
    ctx.beginPath();
    ctx.ellipse(ex, ey, 2.2, 2.85, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(20, 30, 90, 0.35)';
    ctx.lineWidth = 0.3;
    ctx.stroke();

    const px = ex + dx * 1.05, py = ey + dy * 1.15;
    const pg = ctx.createRadialGradient(px - 0.3, py - 0.4, 0.1, px, py, 1.35);
    pg.addColorStop(0, '#4a64ff');
    pg.addColorStop(1, COLORS.pupil);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, 1.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(px - 0.45, py - 0.5, 0.42, 0, TAU);
    ctx.fill();
  }
}

/* mode: 'normal' | 'fright' | 'flash' | 'eyes'. t animates the skirt. */
export function drawGhost(ctx, x, y, { color, dir = 1, t = 0, mode = 'normal' }) {
  if (mode === 'eyes') { drawEyes(ctx, x, y, dir, true); return; }
  const fright = mode === 'fright', flash = mode === 'flash';
  const base = fright ? COLORS.fright : flash ? COLORS.flash : color;
  /* Frightened ghosts quiver. */
  const wob = fright || flash ? Math.sin(t * 2.3) * 0.25 : 0;
  const body = ghostBody(x, y, t, 6.8 + wob);

  const g = ctx.createLinearGradient(x, y - 7.4, x, y + 7);
  g.addColorStop(0, mix(base, 0.42));
  g.addColorStop(0.42, base);
  g.addColorStop(1, fright ? COLORS.frightDeep : mix(base, -0.38));
  ctx.fillStyle = g;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  /* Subsurface glow: light seems to come from inside the jelly. */
  const ss = ctx.createRadialGradient(x, y + 3.5, 0.5, x, y + 3.5, 7.5);
  ss.addColorStop(0, rgba(fright ? '#7f8cff' : flash ? '#ffffff' : color, 0.45));
  ss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ss;
  ctx.fillRect(x - 8, y - 8, 16, 16);
  /* Shade on the lower right of the dome. */
  const sh = ctx.createRadialGradient(x - 3, y - 4.5, 3, x - 1, y - 2, 12);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,30,0.32)');
  ctx.fillStyle = sh;
  ctx.fillRect(x - 8, y - 8, 16, 16);
  ctx.restore();

  /* Specular on the dome. */
  ctx.save();
  const sp = ctx.createRadialGradient(x - 3, y - 4.6, 0, x - 3, y - 4.6, 2.8);
  sp.addColorStop(0, 'rgba(255,255,255,0.85)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp;
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 4.6, 2.8, 1.8, -0.55, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = fright ? 'rgba(10, 12, 70, 0.5)' : 'rgba(0, 0, 0, 0.28)';
  ctx.lineWidth = 0.4;
  ctx.lineJoin = 'round';
  ctx.stroke(body);

  if (mode === 'normal') { drawEyes(ctx, x, y, dir); return; }
  const face = fright ? COLORS.frightFace : COLORS.flashFace;
  ctx.fillStyle = face;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * 2.4, y - 1.6, 1.05, 1.3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = face;
  ctx.lineWidth = 0.75;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const px = x - 4.4 + i * 1.47, py = y + 2.9 + (i % 2 ? -0.95 : 0);
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

function shine(ctx, x, y, rx, ry, rot = -0.6, a = 0.8) {
  ctx.save();
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function leaf(ctx, x, y, len, ang, color = '#3ddc5a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -len * 0.4, 0, len * 0.4);
  g.addColorStop(0, mix(color, 0.3));
  g.addColorStop(1, mix(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fill();
  ctx.restore();
}

const FRUIT_ART = {
  cherry(ctx) {
    ctx.strokeStyle = '#9b6a2c';
    ctx.lineWidth = 0.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.6, 1.6); ctx.quadraticCurveTo(-0.5, -3.5, 3.6, -5.2);
    ctx.moveTo(2.4, 2.6); ctx.quadraticCurveTo(2.2, -2, 3.6, -5.2);
    ctx.stroke();
    leaf(ctx, 3.4, -5.1, 3.4, -2.6);
    blob(ctx, -2.6, 2.9, 2.9, '#ff9a9a', '#b00018');
    blob(ctx, 2.6, 3.6, 2.9, '#ff9a9a', '#b00018');
    shine(ctx, -3.4, 1.8, 0.9, 0.55);
    shine(ctx, 1.8, 2.5, 0.9, 0.55);
  },
  strawberry(ctx) {
    const g = ctx.createRadialGradient(-1.4, -1.5, 0.5, 0, 0.5, 6);
    g.addColorStop(0, '#ff8080'); g.addColorStop(1, '#b8001c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-5.8, 2.2, -6, -3.6, -2.2, -3.6);
    ctx.quadraticCurveTo(0, -4.2, 2.2, -3.6);
    ctx.bezierCurveTo(6, -3.6, 5.8, 2.2, 0, 6);
    ctx.fill();
    ctx.fillStyle = '#fff3c0';
    for (const [sx, sy] of [[-2.6, -1.4], [0, -1.8], [2.6, -1.4], [-1.4, 0.8], [1.4, 0.8], [-2.8, 1.6], [2.8, 1.6], [0, 3], [-1.2, 4.1], [1.2, 4.1], [0, 0.2]]) {
      ctx.beginPath(); ctx.ellipse(sx, sy, 0.3, 0.48, 0, 0, TAU); ctx.fill();
    }
    for (const a of [-2.2, -1.4, -0.4, 0.4, 1.4]) leaf(ctx, 0, -3.6, 3.2, a - Math.PI / 2 + 0.2, '#2fcc55');
    shine(ctx, -2.3, -1.6, 1.1, 0.6);
  },
  orange(ctx) {
    blob(ctx, 0, 1, 5.1, '#ffd394', '#e06000');
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (const [sx, sy] of [[-2, 2], [1.5, 3.4], [2.6, 0], [-0.4, -1.8], [0.4, 0.8]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 0.3, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#6e4510'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -3.9); ctx.lineTo(0.4, -5.4); ctx.stroke();
    leaf(ctx, 0.4, -5, 3.6, -0.35, '#36d35a');
    shine(ctx, -2, -1.4, 1.3, 0.7);
  },
  apple(ctx) {
    const g = ctx.createRadialGradient(-1.6, -1.2, 0.4, 0, 1, 6.2);
    g.addColorStop(0, '#ff9090'); g.addColorStop(1, '#a00016');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -2.8);
    ctx.bezierCurveTo(-2.6, -5.2, -6.6, -3.4, -5.6, 1.4);
    ctx.bezierCurveTo(-4.8, 5.4, -1.8, 6.6, 0, 5.4);
    ctx.bezierCurveTo(1.8, 6.6, 4.8, 5.4, 5.6, 1.4);
    ctx.bezierCurveTo(6.6, -3.4, 2.6, -5.2, 0, -2.8);
    ctx.fill();
    ctx.strokeStyle = '#6e4510'; ctx.lineWidth = 0.75; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -2.6); ctx.quadraticCurveTo(0.2, -4.8, 1, -5.8); ctx.stroke();
    leaf(ctx, 0.7, -4.6, 3.4, -0.5, '#3ddc5a');
    shine(ctx, -2.8, -0.8, 1.4, 0.75);
  },
  melon(ctx) {
    const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0.8, 6);
    g.addColorStop(0, '#c4ffa6'); g.addColorStop(1, '#1b8526');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0.8, 5, 5.4, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0.8, 5, 5.4, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(10, 80, 20, 0.7)'; ctx.lineWidth = 0.7;
    for (const sx of [-3.4, -1.2, 1.2, 3.4]) {
      ctx.beginPath(); ctx.moveTo(sx * 0.6, -4.6); ctx.quadraticCurveTo(sx * 1.25, 0.8, sx * 0.6, 6.2); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#6e4510'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -4.4); ctx.lineTo(0.6, -6); ctx.stroke();
    shine(ctx, -2.2, -1.6, 1.2, 0.65);
  },
  galaxian(ctx) {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(-1.6, -1); ctx.lineTo(0, -3); ctx.lineTo(1.6, -1); ctx.closePath(); ctx.fill();
    const w = ctx.createLinearGradient(0, -5, 0, 4);
    w.addColorStop(0, '#6f9cff'); w.addColorStop(1, '#1f45d8');
    ctx.fillStyle = w;
    ctx.beginPath();
    ctx.moveTo(-1.4, 0); ctx.lineTo(-6, -4.6); ctx.lineTo(-5.8, 0.6); ctx.lineTo(-1.2, 3.4); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1.4, 0); ctx.lineTo(6, -4.6); ctx.lineTo(5.8, 0.6); ctx.lineTo(1.2, 3.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3045';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-1.8, -2.4); ctx.lineTo(1.8, -2.4); ctx.closePath(); ctx.fill();
    ctx.fillRect(-0.5, -1.5, 1, 1.2);
  },
  bell(ctx) {
    const g = ctx.createLinearGradient(-5, -5, 5, 5);
    g.addColorStop(0, '#fff6a0'); g.addColorStop(0.5, '#ffd51a'); g.addColorStop(1, '#c98a00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.4, 3.6);
    ctx.bezierCurveTo(-4.4, 2.6, -4.6, -5.4, 0, -5.4);
    ctx.bezierCurveTo(4.6, -5.4, 4.4, 2.6, 5.4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c98a00';
    ctx.beginPath(); ctx.ellipse(0, 3.95, 5.6, 0.85, 0, 0, TAU); ctx.fill();
    blob(ctx, 0, 5.6, 1.2, '#9ff4ff', '#1aa8c8');
    shine(ctx, -2, -2.4, 1, 2, 0.35, 0.65);
  },
  key(ctx) {
    const h = ctx.createLinearGradient(0, -6, 0, -0.5);
    h.addColorStop(0, '#7ff2ff'); h.addColorStop(1, '#13a6c9');
    ctx.fillStyle = h;
    ctx.beginPath(); ctx.ellipse(0, -3.2, 3.4, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#05060f';
    ctx.beginPath(); ctx.ellipse(0, -3.3, 1.7, 0.65, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(-1, 0, 1, 0);
    g.addColorStop(0, '#f2f4ff'); g.addColorStop(1, '#8e97b8');
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
