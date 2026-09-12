/* The app icon, drawn as vector art in the game's own projection and materials.
   It is a purpose-built composition -- not a scaled screenshot -- so it stays
   legible at 32px: three bevelled blocks, each cut a little narrower than the
   one below, which is the whole game in one silhouette.

   Shared by the PWA icon generator (tools/make-icons.mjs) and the title screen,
   so the launcher icon and the game are literally the same artwork. */

const BLOCKS = [
  { size: 1.00, dx: 0.00, dz: 0.00, h: '#14B08A' },
  { size: 0.85, dx: 0.07, dz: -0.04, h: '#F0533C' },
  { size: 0.68, dx: -0.03, dz: 0.08, h: '#FFC24A' }
];

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} S  square edge in pixels
 * @param {object} [o] { maskable:boolean, transparent:boolean, radius:number }
 */
export function drawIcon(ctx, S, o = {}) {
  const maskable = !!o.maskable;
  const radius = o.radius === undefined ? (maskable ? 0 : S * 0.225) : o.radius;

  ctx.save();
  ctx.clearRect(0, 0, S, S);

  if (!o.transparent) {
    if (radius > 0) { roundRect(ctx, 0, 0, S, S, radius); ctx.clip(); }
    const bg = ctx.createLinearGradient(0, 0, S * 0.35, S);
    bg.addColorStop(0, '#3A4166');
    bg.addColorStop(0.5, '#20263E');
    bg.addColorStop(1, '#101322');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);

    // warm bloom behind the stack so the blocks separate from the ground
    const glow = ctx.createRadialGradient(S * 0.5, S * 0.52, 0, S * 0.5, S * 0.52, S * 0.66);
    glow.addColorStop(0, 'rgba(255,192,100,0.60)');
    glow.addColorStop(0.45, 'rgba(255,132,78,0.20)');
    glow.addColorStop(1, 'rgba(255,110,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);

    // top sheen
    const sheen = ctx.createLinearGradient(0, 0, 0, S * 0.5);
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, S, S * 0.5);
  }

  // The stack shrinks to 62% inside a maskable icon so a circular crop keeps it.
  const fit = maskable ? 0.64 : 0.87;
  const K = S * 0.45 * fit;
  const BH = 0.34;
  const cx = S * 0.5;
  const cy = S * (maskable ? 0.525 : 0.535) + K * BH * 1.5;

  const px = (x, z) => cx + (x - z) * K;
  const py = (x, y, z) => cy + (x + z) * K * 0.5 - y * K;

  // contact shadow
  ctx.save();
  ctx.translate(cx, cy + K * 0.16);
  ctx.scale(1, 0.34);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, K * 1.15);
  sh.addColorStop(0, 'rgba(0,0,0,0.50)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0.16)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(0, 0, K * 1.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  let y = 0;
  BLOCKS.forEach((b) => {
    const w2 = b.size / 2;
    const x0 = b.dx, z0 = b.dz;
    const yt = y + BH, yb = y;
    const A = [px(x0 - w2, z0 - w2), py(x0 - w2, yt, z0 - w2)];
    const B = [px(x0 + w2, z0 - w2), py(x0 + w2, yt, z0 - w2)];
    const C = [px(x0 + w2, z0 + w2), py(x0 + w2, yt, z0 + w2)];
    const D = [px(x0 - w2, z0 + w2), py(x0 - w2, yt, z0 + w2)];
    const Bb = [px(x0 + w2, z0 - w2), py(x0 + w2, yb, z0 - w2)];
    const Cb = [px(x0 + w2, z0 + w2), py(x0 + w2, yb, z0 + w2)];
    const Db = [px(x0 - w2, z0 + w2), py(x0 - w2, yb, z0 + w2)];

    const poly = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };

    // right face
    let g = ctx.createLinearGradient(B[0], B[1], Cb[0], Cb[1]);
    g.addColorStop(0, shade(b.h, -0.02));
    g.addColorStop(1, shade(b.h, -0.24));
    ctx.fillStyle = g; poly([B, C, Cb, Bb]); ctx.fill();

    // left face
    g = ctx.createLinearGradient(D[0], D[1], Cb[0], Cb[1]);
    g.addColorStop(0, shade(b.h, -0.24));
    g.addColorStop(1, shade(b.h, -0.42));
    ctx.fillStyle = g; poly([C, D, Db, Cb]); ctx.fill();

    // top face + chamfer
    ctx.fillStyle = shade(b.h, 0.16);
    poly([A, B, C, D]); ctx.fill();
    const mx = (A[0] + B[0] + C[0] + D[0]) / 4, my = (A[1] + B[1] + C[1] + D[1]) / 4;
    const t = 0.13;
    const inset = [A, B, C, D].map((p) => [p[0] + (mx - p[0]) * t, p[1] + (my - p[1]) * t]);
    ctx.fillStyle = shade(b.h, 0.30);
    poly(inset); ctx.fill();

    g = ctx.createLinearGradient(A[0], A[1], C[0], C[1]);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; poly([A, B, C, D]); ctx.fill();

    ctx.strokeStyle = shade(b.h, 0.42);
    ctx.lineWidth = Math.max(1, S * 0.006);
    poly([A, B, C, D]); ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, S * 0.005);
    ctx.beginPath();
    ctx.moveTo(Bb[0], Bb[1]); ctx.lineTo(Cb[0], Cb[1]); ctx.lineTo(Db[0], Db[1]);
    ctx.stroke();

    y += BH;
  });

  // precision spark on the top block's high corner
  const topB = BLOCKS[BLOCKS.length - 1];
  const sx = px(topB.dx + topB.size / 2, topB.dz - topB.size / 2);
  const sy = py(topB.dx + topB.size / 2, y + 0.02, topB.dz - topB.size / 2);
  const r = S * 0.040 * (maskable ? 0.85 : 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.7);
  sg.addColorStop(0, 'rgba(255,240,200,0.62)');
  sg.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sx, sy, r * 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(sx, sy - r); ctx.quadraticCurveTo(sx + r * 0.18, sy - r * 0.18, sx + r, sy);
  ctx.quadraticCurveTo(sx + r * 0.18, sy + r * 0.18, sx, sy + r);
  ctx.quadraticCurveTo(sx - r * 0.18, sy + r * 0.18, sx - r, sy);
  ctx.quadraticCurveTo(sx - r * 0.18, sy - r * 0.18, sx, sy - r);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore();
}
