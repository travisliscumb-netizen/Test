/* The app icon.

   Drawn with the game's own projection (the same 1.72:1 dimetric top face), the
   same chamfered material, the same key-light direction and the same rim
   treatment as a block in play -- so the launcher icon is not "artwork about the
   game", it is the game's material rendered at icon scale.

   Three decisions carry it at 16px:
   - a single warm hue ramp with a very wide VALUE range, because value survives
     downsampling where hue does not;
   - a cool ground behind a warm object, for maximum object/ground separation;
   - a stepped, tapering silhouette, which says "cut and stacked with care"
     rather than "toy bricks".

   No text, no sparkle, no screenshot. */

const KY = 0.58;
const BH = 0.50;

const BLOCKS = [
  { size: 1.00, dx: 0.000, dz: 0.000, c: '#9E2F26' },
  { size: 0.845, dx: 0.085, dz: -0.070, c: '#EE6330' },
  { size: 0.680, dx: -0.055, dz: 0.090, c: '#FFC23C' }
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
 * @param {object} [o] { maskable, transparent, radius }
 */
export function drawIcon(ctx, S, o = {}) {
  const maskable = !!o.maskable;
  const radius = o.radius === undefined ? (maskable ? 0 : S * 0.2237) : o.radius;

  ctx.save();
  ctx.clearRect(0, 0, S, S);

  if (!o.transparent) {
    if (radius > 0) { roundRect(ctx, 0, 0, S, S, radius); ctx.clip(); }
    // cool ground: the complement of the object, so the silhouette never muddies
    const bg = ctx.createLinearGradient(S * 0.18, 0, S * 0.82, S);
    bg.addColorStop(0, '#26527A');
    bg.addColorStop(0.46, '#14304F');
    bg.addColorStop(1, '#080F1D');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);

    // key light, placed where the blocks' own key light comes from
    const glow = ctx.createRadialGradient(S * 0.72, S * 0.16, 0, S * 0.64, S * 0.32, S * 0.86);
    glow.addColorStop(0, 'rgba(255,212,150,0.46)');
    glow.addColorStop(0.38, 'rgba(255,152,88,0.16)');
    glow.addColorStop(1, 'rgba(255,110,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);

    // floor plane, so the stack is standing on something
    const floor = ctx.createLinearGradient(0, S * 0.56, 0, S);
    floor.addColorStop(0, 'rgba(3,8,18,0)');
    floor.addColorStop(0.55, 'rgba(3,8,18,0.38)');
    floor.addColorStop(1, 'rgba(2,5,12,0.80)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, S * 0.56, S, S * 0.44);
  }

  // 62% inside a maskable icon so a circular crop keeps the whole stack
  const fit = maskable ? 0.70 : 1;
  const K = S * 0.302 * fit;
  const cx = S * 0.5;
  const stackH = 2 * KY * K + BLOCKS.length * BH * K;
  const cy = S * (maskable ? 0.50 : 0.505) + stackH * 0.5 - KY * K;

  const px = (x, z) => cx + (x - z) * K;
  const py = (x, y, z) => cy + (x + z) * K * KY - y * K;

  // contact shadow on the floor
  ctx.save();
  ctx.translate(cx, cy + K * 0.06);
  ctx.scale(1, KY * 0.72);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, K * 1.35);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0.20)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.arc(0, 0, K * 1.35, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const poly = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };

  let y = 0;
  let prevTop = null;   // top-face polygon of the block below, for occlusion
  BLOCKS.forEach((b, idx) => {
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

    /* Contact occlusion, drawn on the surface below at the correct height and
       clipped to it -- an unclipped copy at the wrong height reads as a
       misaligned dark plate rather than a shadow. */
    if (prevTop) {
      const foot = [
        [px(x0 - w2, z0 - w2), py(x0 - w2, yb, z0 - w2)],
        [px(x0 + w2, z0 - w2), py(x0 + w2, yb, z0 - w2)],
        [px(x0 + w2, z0 + w2), py(x0 + w2, yb, z0 + w2)],
        [px(x0 - w2, z0 + w2), py(x0 - w2, yb, z0 + w2)]
      ];
      const fx = (foot[0][0] + foot[2][0]) / 2, fy = (foot[0][1] + foot[2][1]) / 2;
      ctx.save();
      poly(prevTop); ctx.clip();
      ctx.fillStyle = '#000';
      for (const [sc, al] of [[1.26, 0.10], [1.13, 0.13], [1.04, 0.16]]) {
        ctx.globalAlpha = al;
        poly(foot.map((q) => [fx + (q[0] - fx) * sc - S * 0.012, fy + (q[1] - fy) * sc + S * 0.008]));
        ctx.fill();
      }
      ctx.restore();
    }

    // +x face
    let g = ctx.createLinearGradient(B[0], B[1], Cb[0], Cb[1]);
    g.addColorStop(0, shade(b.c, -0.02));
    g.addColorStop(1, shade(b.c, -0.26));
    ctx.fillStyle = g; poly([B, C, Cb, Bb]); ctx.fill();

    // +z face
    g = ctx.createLinearGradient(D[0], D[1], Cb[0], Cb[1]);
    g.addColorStop(0, shade(b.c, -0.26));
    g.addColorStop(1, shade(b.c, -0.46));
    ctx.fillStyle = g; poly([C, D, Db, Cb]); ctx.fill();

    // top face + chamfer plate
    ctx.fillStyle = shade(b.c, 0.13);
    poly([A, B, C, D]); ctx.fill();
    const mx = (A[0] + B[0] + C[0] + D[0]) / 4, my = (A[1] + B[1] + C[1] + D[1]) / 4;
    const t = 0.125;
    const inset = [A, B, C, D].map((p) => [p[0] + (mx - p[0]) * t, p[1] + (my - p[1]) * t]);
    ctx.fillStyle = shade(b.c, 0.24);
    poly(inset); ctx.fill();

    g = ctx.createLinearGradient(A[0], A[1], C[0], C[1]);
    g.addColorStop(0, 'rgba(255,255,255,0.26)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g; poly([A, B, C, D]); ctx.fill();

    // rim light on the two lit edges only -- same rule the game uses
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, S * 0.0085);
    ctx.strokeStyle = shade(b.c, 0.52);
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
    ctx.lineWidth = Math.max(1, S * 0.006);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.lineTo(A[0], A[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath(); ctx.moveTo(Bb[0], Bb[1]); ctx.lineTo(Cb[0], Cb[1]); ctx.lineTo(Db[0], Db[1]); ctx.stroke();

    prevTop = [A, B, C, D];
    y += BH;
  });

  ctx.restore();
}

/** The iOS launch image: the icon on the app's ground, nothing else. */
export function drawSplash(ctx, W, H) {
  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, '#232A3E');
  bg.addColorStop(0.48, '#141827');
  bg.addColorStop(1, '#0A0B12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const S = Math.min(W, H) * 0.30;
  ctx.save();
  ctx.translate((W - S) / 2, (H - S) / 2 - H * 0.04);
  drawIcon(ctx, S, { radius: S * 0.2237 });
  ctx.restore();
}
