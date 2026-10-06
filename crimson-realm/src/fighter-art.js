/* Paints a posed skeleton as a lit, costumed fighter.

   Every limb is a tapered capsule shaded as a cylinder -- highlight toward
   the stage's key light, core shadow, then a coloured rim light from the
   stage on the far edge -- so the same fighter reads differently at dusk,
   in a forge or under lightning. Torso and head are drawn in their own
   rotated local frames so costumes, faces and armour follow the pose.
   Hair, sashes, headband tails and capes are verlet chains.              */

import { mix, shade, tint, rgba, multiply, glowSprite } from './color.js';

const LX = -0.46, LY = -0.89;             // key light direction, canvas space (from upper left)
const chainsOf = new WeakMap();

/* ------------------------------------------------------------ helpers */

function capsulePath(g, ax, ay, bx, by, ra, rb, bulge) {
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / L, ny = dx / L;
  const th = Math.atan2(ny, nx);
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const rm = ((ra + rb) / 2) * (1 + bulge);
  g.beginPath();
  g.moveTo(ax + nx * ra, ay + ny * ra);
  g.quadraticCurveTo(mx + nx * rm, my + ny * rm, bx + nx * rb, by + ny * rb);
  g.arc(bx, by, rb, th, th + Math.PI, true);
  g.quadraticCurveTo(mx - nx * rm, my - ny * rm, ax - nx * ra, ay - ny * ra);
  g.arc(ax, ay, ra, th + Math.PI, th, true);
  g.closePath();
  return [nx, ny, mx, my, rm];
}

function toCanvas(cx, cy, ang, F, lx, ly) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [cx + (lx * c - ly * s) * F, cy + (lx * s + ly * c)];
}

function stepChain(ch, ax, ay, opts) {
  const { seg, grav = 0.55, drag = 0.86, wind = 0, stiff = 0 } = opts;
  const p = ch.p, q = ch.q;
  if (!ch.init || Math.hypot(p[0][0] - ax, p[0][1] - ay) > 220) {
    for (let i = 0; i < p.length; i++) {
      p[i][0] = q[i][0] = ax - wind * 40 * i * 0.2;
      p[i][1] = q[i][1] = ay + i * seg;
    }
    ch.init = true;
  }
  p[0][0] = ax; p[0][1] = ay;
  for (let i = 1; i < p.length; i++) {
    const vx = (p[i][0] - q[i][0]) * drag, vy = (p[i][1] - q[i][1]) * drag;
    q[i][0] = p[i][0]; q[i][1] = p[i][1];
    p[i][0] += vx + wind;
    p[i][1] += vy + grav;
  }
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < p.length; i++) {
      const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1];
      const d = Math.hypot(dx, dy) || 0.001;
      const k = seg / d;
      p[i][0] = p[i - 1][0] + dx * k;
      p[i][1] = p[i - 1][1] + dy * k;
    }
    for (let i = 1; i < p.length; i++) if (p[i][1] > -2) p[i][1] = -2;   // cloth rests on the floor
    if (stiff) {
      // stiffness: pull each link toward the line of its parent link
      for (let i = 2; i < p.length; i++) {
        const ex = 2 * p[i - 1][0] - p[i - 2][0], ey = 2 * p[i - 1][1] - p[i - 2][1];
        p[i][0] += (ex - p[i][0]) * stiff;
        p[i][1] += (ey - p[i][1]) * stiff;
      }
    }
  }
}

function makeChain(n) {
  const mk = () => Array.from({ length: n }, () => [0, 0]);
  return { p: mk(), q: mk(), init: false };
}

function ribbon(g, pts, w0, w1, fill) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) {
    const mx = (left[i - 1][0] + left[i][0]) / 2, my = (left[i - 1][1] + left[i][1]) / 2;
    g.quadraticCurveTo(left[i - 1][0], left[i - 1][1], mx, my);
  }
  g.lineTo(left[n - 1][0], left[n - 1][1]);
  g.lineTo(right[n - 1][0], right[n - 1][1]);
  for (let i = n - 2; i >= 0; i--) {
    const mx = (right[i + 1][0] + right[i][0]) / 2, my = (right[i + 1][1] + right[i][1]) / 2;
    g.quadraticCurveTo(right[i + 1][0], right[i + 1][1], mx, my);
  }
  g.lineTo(right[0][0], right[0][1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

/* ------------------------------------------------------------- painter */

export function drawFighter(g, f, light, opts = {}) {
  const sk = f.skel;
  if (!sk || !sk.hip) return;
  const F = f.facing;
  const b = f.body;
  const s = b.scale, bulk = b.bulk;
  const L = f.def.look;
  const sil = opts.silhouette || null;
  const olw = opts.outlineW || 0;
  const flash = !sil && f.flash > 0 ? 0.55 : 0;
  const W = (q) => [f.x + q[0] * F, -(f.y + q[1])];
  const now = opts.time || 0;

  const lit = (c, back) => {
    let v = multiply(c, light.key, 0.32);
    if (back) v = mix(v, light.ambient, 0.38);
    if (flash) v = mix(v, '#ffffff', flash);
    return v;
  };

  const limb = (A, B, ra, rb, base, back, bulge = 0.1) => {
    const [nx, ny, mx, my, rm] = capsulePath(g, A[0], A[1], B[0], B[1], ra, rb, bulge);
    if (sil) { g.fillStyle = sil; g.fill(); if (olw) { g.lineWidth = olw; g.strokeStyle = sil; g.stroke(); } return; }
    const c = lit(base, back);
    const side = nx * LX + ny * LY > 0 ? 1 : -1;
    const gr = g.createLinearGradient(mx + nx * rm * side, my + ny * rm * side, mx - nx * rm * side, my - ny * rm * side);
    const hi = tint(mix(c, light.key, 0.3), 0.2);
    const dk = shade(c, 0.52);
    gr.addColorStop(0, mix(c, hi, 0.45));
    gr.addColorStop(0.28, hi);
    gr.addColorStop(0.6, c);
    gr.addColorStop(0.86, dk);
    gr.addColorStop(1, mix(dk, light.rim, 0.6));
    g.fillStyle = gr;
    g.fill();
  };

  const ball = (P, r, base, back) => {
    g.beginPath();
    g.arc(P[0], P[1], r, 0, Math.PI * 2);
    if (sil) { g.fillStyle = sil; g.fill(); if (olw) { g.lineWidth = olw; g.strokeStyle = sil; g.stroke(); } return; }
    const c = lit(base, back);
    const gr = g.createRadialGradient(P[0] + LX * r * 0.45, P[1] + LY * r * 0.45, r * 0.1, P[0], P[1], r);
    gr.addColorStop(0, tint(c, 0.28));
    gr.addColorStop(0.6, c);
    gr.addColorStop(1, mix(shade(c, 0.45), light.rim, 0.4));
    g.fillStyle = gr;
    g.fill();
  };

  /* ---------------- render-side state: cloth & hair chains ------------- */
  let st = chainsOf.get(f);
  if (!st) {
    st = { hair: makeChain(8), tail: makeChain(5), sash: makeChain(6), cape: makeChain(7), flap: makeChain(4), flapB: makeChain(4) };
    chainsOf.set(f, st);
  }
  if (opts.chains === false) st = null;

  const pal = {
    skin: L.skin,
    arm: L.skin,
    armB: L.top === 'robe' || L.sleeve === 'long' || L.top === 'plate' ? L.topColor : L.skin,
    fore: L.wraps || L.gloves || L.skin,
    fist: L.gloves || L.wraps || L.skin,
    leg: L.stone ? L.skin : L.pants,
    boot: L.boots || (L.stone ? L.skin : L.skin)
  };
  if (L.sleeve === 'long') pal.arm = L.topColor;

  const ar1 = 13.5 * s * bulk, ar2 = 10.5 * s * bulk, fr1 = 11 * s * bulk, fr2 = 8.6 * s * Math.sqrt(bulk);
  const tr1 = 20 * s * bulk, tr2 = 13.5 * s * bulk, sr1 = 13.5 * s * bulk;
  const sr2 = (L.pantsStyle === 'gi' ? 14.5 : 8.6) * s * Math.sqrt(bulk);
  const fistR = 9.4 * s * Math.sqrt(bulk) * (L.stone ? 1.2 : 1);

  const P = {};
  for (const k in sk) if (Array.isArray(sk[k])) P[k] = W(sk[k]);

  const arm = (side) => {
    const back = side === 'B';
    const sh = P['sh' + side], el = P['el' + side], hd = P[side === 'F' ? 'hf' : 'hb'];
    limb(sh, el, ar1, ar2, back ? pal.armB : pal.arm, back, L.stone ? 0.25 : 0.14);
    limb(el, hd, fr1, fr2, pal.fore, back, 0.08);
    if (!sil && L.wraps && !L.gloves) wrapLines(el, hd, fr1, back);
    const dx = hd[0] - el[0], dy = hd[1] - el[1], dl = Math.hypot(dx, dy) || 1;
    const tip = [hd[0] + (dx / dl) * fistR * 1.05, hd[1] + (dy / dl) * fistR * 1.05];
    limb(hd, tip, fistR * 0.98, fistR * 0.9, pal.fist, back, 0);
    if (!sil && (L.top === 'armor' || L.top === 'plate')) pauldron(sh, el, back);
  };

  const wrapLines = (A, B, r, back) => {
    g.save();
    g.strokeStyle = rgba(shade(lit(L.wraps, back), 0.35), 0.55);
    g.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) {
      const t = 0.45 + i * 0.12;
      const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t;
      const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1;
      g.beginPath();
      g.moveTo(x - (dy / d) * r * 0.9 + (dx / d) * 2, y + (dx / d) * r * 0.9 + (dy / d) * 2);
      g.lineTo(x + (dy / d) * r * 0.9, y - (dx / d) * r * 0.9);
      g.stroke();
    }
    g.restore();
  };

  const pauldron = (sh, el, back) => {
    const ang = Math.atan2(el[1] - sh[1], el[0] - sh[0]);
    g.save();
    g.translate(sh[0], sh[1]);
    g.rotate(ang);
    const r = 17 * s * bulk;
    const base = L.top === 'armor' ? L.trim : L.topColor;
    const c = lit(base, back);
    g.beginPath();
    g.ellipse(r * 0.25, 0, r * 1.05, r * 0.95, 0, -Math.PI * 0.95, Math.PI * 0.95);
    g.closePath();
    const gr = g.createLinearGradient(0, -r, 0, r);
    gr.addColorStop(0, tint(c, 0.35));
    gr.addColorStop(0.5, c);
    gr.addColorStop(1, mix(shade(c, 0.55), light.rim, 0.5));
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = rgba(L.trim || '#c9a227', 0.9);
    g.lineWidth = 2 * s;
    g.stroke();
    if (L.top === 'plate') {
      g.fillStyle = lit(L.trim, back);
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.5 - 3 * s, -r * 0.7);
        g.lineTo(i * r * 0.5 - r * 0.25, -r * 1.55 + Math.abs(i) * r * 0.25);
        g.lineTo(i * r * 0.5 + 4 * s, -r * 0.75);
        g.fill();
      }
    }
    g.restore();
  };

  const leg = (side) => {
    const back = side === 'B';
    const hp = P['hip' + side], kn = P['kn' + side], an = P['an' + side];
    const toe = P[side === 'F' ? 'ff' : 'fb'], heel = P['he' + side];
    limb(hp, kn, tr1, tr2, pal.leg, back, L.stone ? 0.22 : 0.12);
    if (L.boots) {
      const mid = [kn[0] + (an[0] - kn[0]) * 0.42, kn[1] + (an[1] - kn[1]) * 0.42];
      limb(kn, mid, sr1, sr1 * 0.92, pal.leg, back, 0.06);
      limb(mid, an, sr1 * 0.98, sr2 * 1.05, pal.boot, back, 0.04);
    } else {
      limb(kn, an, sr1, sr2, pal.leg, back, 0.08);
    }
    const footCol = L.boots || L.skin;
    limb(heel, toe, 6.6 * s * Math.sqrt(bulk), 4.6 * s, footCol, back, 0);
    if (!sil && !L.boots && L.pantsStyle === 'gi') {
      // ankle wraps for barefoot fighters
      ball(an, 6.4 * s, L.wraps || L.skin, back);
    }
  };

  const torsoFrame = () => {
    const hip = P.hip, neck = P.neck;
    const len = Math.hypot(neck[0] - hip[0], neck[1] - hip[1]);
    const ang = Math.atan2((neck[0] - hip[0]) * F, -(neck[1] - hip[1]));
    return { hip, len, ang };
  };

  const torsoPath = (len) => {
    const k = s * bulk;
    const fem = L.female;
    const rows = fem
      ? [[0, 24, 26], [0.32, 18, 19], [0.62, 26, 21], [0.86, 21, 21], [1, 10, 10]]
      : [[0, 23, 25], [0.32, 22, 22], [0.62, 31, 27], [0.86, 27, 25], [1, 11, 11]];
    const front = rows.map(([t, w]) => [w * k, -t * len]);
    const back = rows.map(([t, , w]) => [-w * k, -t * len]).reverse();
    const pts = [...front, ...back];
    g.beginPath();
    g.moveTo((pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], n = pts[(i + 1) % pts.length];
      g.quadraticCurveTo(a[0], a[1], (a[0] + n[0]) / 2, (a[1] + n[1]) / 2);
    }
    g.closePath();
    return 30 * k;
  };

  const fillAcross = (c, w, back) => {
    const litFront = F < 0;
    const gr = g.createLinearGradient(litFront ? w : -w, 0, litFront ? -w : w, 0);
    const hi = tint(mix(c, light.key, 0.3), 0.18);
    const dk = shade(c, 0.5);
    gr.addColorStop(0, mix(c, hi, 0.4));
    gr.addColorStop(0.3, hi);
    gr.addColorStop(0.62, c);
    gr.addColorStop(0.88, dk);
    gr.addColorStop(1, mix(dk, light.rim, 0.65));
    g.fillStyle = gr;
    g.fill();
  };

  const torso = () => {
    const { hip, len, ang } = torsoFrame();
    g.save();
    g.translate(hip[0], hip[1]);
    g.scale(F, 1);
    g.rotate(ang);
    const w = torsoPath(len);
    if (sil) { g.fillStyle = sil; g.fill(); if (olw) { g.lineWidth = olw; g.strokeStyle = sil; g.stroke(); } g.restore(); return; }
    const k = s * bulk;
    const bare = L.top === 'robe' || L.top === 'stone' || L.top === 'gi';
    fillAcross(lit(bare ? L.skin : L.topColor), w);
    g.save();
    g.clip();
    const cTop = lit(L.topColor), cTop2 = lit(L.topColor2);
    const stroke = (col, lw, a = 1) => { g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.stroke(); };

    if (bare && L.top !== 'stone') {
      // pectoral and abdominal definition
      g.beginPath();
      g.moveTo(w * 0.95, -len * 0.62);
      g.quadraticCurveTo(w * 0.35, -len * 0.5, -w * 0.1, -len * 0.62);
      stroke(shade(lit(L.skin), 0.4), 2 * s, 0.5);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(w * 0.5, -len * (0.24 + i * 0.1));
        g.lineTo(w * 0.85, -len * (0.25 + i * 0.1));
        stroke(shade(lit(L.skin), 0.35), 1.5 * s, 0.4);
      }
    }
    if (L.top === 'gi') {
      // sleeveless vest, open in a deep V at the front
      g.beginPath();
      g.moveTo(-w * 1.4, 4);
      g.lineTo(-w * 1.4, -len * 1.1);
      g.lineTo(w * 0.05, -len * 1.1);
      g.lineTo(w * 0.62, -len * 0.42);
      g.lineTo(w * 1.4, -len * 0.42);
      g.lineTo(w * 1.4, 4);
      g.closePath();
      fillAcross(cTop, w);
      g.beginPath();
      g.moveTo(w * 0.05, -len * 1.1);
      g.lineTo(w * 0.62, -len * 0.42);
      stroke(tint(cTop, 0.3), 3 * s, 0.8);
    } else if (L.top === 'robe') {
      g.beginPath();
      g.moveTo(-w * 1.4, 6);
      g.lineTo(-w * 1.4, -len * 1.1);
      g.lineTo(-w * 0.25, -len * 1.1);
      g.lineTo(w * 1.4, -len * 0.36);
      g.lineTo(w * 1.4, 6);
      g.closePath();
      fillAcross(cTop, w);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-w * (0.9 - i * 0.35), -len * (0.95 - i * 0.05));
        g.quadraticCurveTo(-w * (0.4 - i * 0.3), -len * 0.5, -w * (0.6 - i * 0.4), -len * 0.05);
        stroke(cTop2, 1.6 * s, 0.55);
      }
      g.beginPath();
      g.moveTo(-w * 0.25, -len * 1.1);
      g.lineTo(w * 1.4, -len * 0.36);
      stroke(tint(cTop, 0.35), 3 * s, 0.9);
    } else if (L.top === 'armor') {
      g.beginPath();
      g.moveTo(-w * 1.4, -len * 0.18);
      g.lineTo(-w * 1.4, -len * 0.98);
      g.lineTo(w * 1.4, -len * 0.98);
      g.lineTo(w * 1.4, -len * 0.18);
      g.quadraticCurveTo(0, -len * 0.1, -w * 1.4, -len * 0.18);
      fillAcross(cTop, w);
      stroke(lit(L.trim), 2.6 * s);
      for (const y of [0.42, 0.62, 0.8]) {
        g.beginPath();
        g.moveTo(-w * 1.4, -len * y);
        g.quadraticCurveTo(w * 0.2, -len * (y + 0.05), w * 1.4, -len * y);
        stroke(cTop2, 1.6 * s, 0.7);
      }
      // storm sigil
      g.beginPath();
      g.moveTo(w * 0.62, -len * 0.82);
      g.lineTo(w * 0.36, -len * 0.64);
      g.lineTo(w * 0.62, -len * 0.62);
      g.lineTo(w * 0.34, -len * 0.42);
      stroke(f.def.element.glow, 2.6 * s, 0.95);
    } else if (L.top === 'wrap') {
      fillAcross(cTop, w);
      for (let i = -3; i < 6; i++) {
        g.beginPath();
        g.moveTo(-w * 1.4, -len * (0.1 + i * 0.13));
        g.lineTo(w * 1.4, -len * (0.3 + i * 0.13));
        stroke(cTop2, 2.2 * s, 0.7);
      }
      g.beginPath();
      g.moveTo(-w * 1.2, -len * 1.0);
      g.lineTo(w * 1.2, -len * 0.25);
      stroke(lit(L.trim), 3.2 * s, 0.85);
    } else if (L.top === 'stone') {
      // fissures glowing with the heat inside
      const cr = L.cracks;
      const pulse = 0.55 + 0.45 * Math.sin(now * 3 + f.side);
      const path = [[0.2, 0.9, -0.3, 0.7, 0.1, 0.5], [0.8, 0.3, 0.4, 0.5, 0.9, 0.7], [-0.6, 0.2, -0.2, 0.4, -0.7, 0.6]];
      for (const [a, b2, c, d, e, h] of path) {
        g.beginPath();
        g.moveTo(w * a, -len * b2);
        g.lineTo(w * c, -len * d);
        g.lineTo(w * e, -len * h);
        stroke(cr, 2.6 * s, 0.35 + pulse * 0.5);
        stroke('#fff1c4', 0.9 * s, 0.25 + pulse * 0.4);
      }
      g.fillStyle = rgba(L.moss, 0.65);
      g.beginPath();
      g.ellipse(-w * 0.7, -len * 0.92, w * 0.7, len * 0.13, 0.2, 0, Math.PI * 2);
      g.fill();
    } else if (L.top === 'plate') {
      fillAcross(cTop, w);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-w * 1.4, -len * (0.14 + i * 0.1));
        g.quadraticCurveTo(w * 0.3, -len * (0.2 + i * 0.1), w * 1.4, -len * (0.14 + i * 0.1));
        stroke(lit(L.trim), 1.6 * s, 0.75);
      }
      g.beginPath();
      g.moveTo(w * 1.4, -len * 0.98);
      g.quadraticCurveTo(w * 0.1, -len * 0.82, w * 0.4, -len * 0.56);
      g.quadraticCurveTo(w * 0.8, -len * 0.48, w * 1.4, -len * 0.52);
      g.fillStyle = cTop2;
      g.fill();
      stroke(lit(L.trim), 2.2 * s);
      g.beginPath();
      g.arc(w * 0.62, -len * 0.74, 5 * s, 0, Math.PI * 2);
      g.fillStyle = f.def.element.glow;
      g.fill();
    }
    // belt
    if (L.belt) {
      g.beginPath();
      g.rect(-w * 1.5, -len * 0.16, w * 3, len * 0.12);
      const bc = lit(L.belt);
      const gb = g.createLinearGradient(0, -len * 0.16, 0, -len * 0.04);
      gb.addColorStop(0, tint(bc, 0.25));
      gb.addColorStop(1, shade(bc, 0.35));
      g.fillStyle = gb;
      g.fill();
    }
    g.restore();
    // muscle-shading overlay to round the whole torso
    torsoPath(len);
    const rg = g.createRadialGradient(-w * 0.3, -len * 0.7, 2, 0, -len * 0.5, len * 0.8);
    rg.addColorStop(0, 'rgba(255,255,255,0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = rg;
    g.fill();

    if (L.beads) {
      // prayer beads hanging over the chest
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const x = w * (0.1 + 0.65 * Math.sin(t * Math.PI)) - w * 0.1;
        const y = -len * (0.98 - 0.42 * Math.sin(t * Math.PI * 0.5 + 0.2) * (t < 0.5 ? t * 2 : 1));
        g.beginPath();
        g.arc(x, y, 3.6 * s, 0, Math.PI * 2);
        g.fillStyle = i === 5 ? '#d9a441' : lit(L.beads);
        g.fill();
      }
    }
    g.restore();
  };

  const headFrame = () => {
    const H = P.head, N = P.neck;
    const ang = Math.atan2((H[0] - N[0]) * F, -(H[1] - N[1]));
    return { H, ang, r: b.head };
  };

  const head = () => {
    const { H, ang, r } = headFrame();
    // neck
    limb(P.neck, H, 9 * s * bulk, 8.4 * s * bulk, L.stone ? L.skin : (L.hair.style === 'mask' ? L.mask : L.skin), false, 0);
    g.save();
    g.translate(H[0], H[1]);
    g.scale(F, 1);
    g.rotate(ang);
    const style = L.hair.style;
    const skull = () => {
      g.beginPath();
      if (L.stone) {
        g.moveTo(-0.15 * r, -1.0 * r);
        g.lineTo(0.75 * r, -0.85 * r);
        g.lineTo(1.0 * r, -0.2 * r);
        g.lineTo(0.95 * r, 0.55 * r);
        g.lineTo(0.55 * r, 1.0 * r);
        g.lineTo(-0.55 * r, 0.9 * r);
        g.lineTo(-0.95 * r, 0.1 * r);
        g.lineTo(-0.8 * r, -0.7 * r);
      } else {
        g.moveTo(0, -1.02 * r);
        g.bezierCurveTo(-0.62 * r, -1.02 * r, -1.0 * r, -0.55 * r, -0.92 * r, 0.05 * r);
        g.bezierCurveTo(-0.86 * r, 0.55 * r, -0.55 * r, 0.82 * r, -0.2 * r, 0.9 * r);
        g.quadraticCurveTo(0.25 * r, 1.08 * r, 0.52 * r, 0.92 * r);
        g.quadraticCurveTo(0.8 * r, 0.62 * r, 0.82 * r, 0.32 * r);
        g.lineTo(1.0 * r, 0.12 * r);
        g.quadraticCurveTo(0.95 * r, -0.12 * r, 0.86 * r, -0.36 * r);
        g.bezierCurveTo(0.8 * r, -0.85 * r, 0.45 * r, -1.02 * r, 0, -1.02 * r);
      }
      g.closePath();
    };
    skull();
    if (sil) { g.fillStyle = sil; g.fill(); if (olw) { g.lineWidth = olw; g.strokeStyle = sil; g.stroke(); } g.restore(); return; }
    const skinC = lit(style === 'mask' ? L.mask : L.skin);
    const rg = g.createRadialGradient(F < 0 ? 0.3 * r : -0.3 * r, -0.45 * r, r * 0.1, 0, 0, r * 1.15);
    rg.addColorStop(0, tint(skinC, 0.26));
    rg.addColorStop(0.55, skinC);
    rg.addColorStop(1, mix(shade(skinC, 0.5), light.rim, 0.55));
    g.fillStyle = rg;
    g.fill();
    g.save();
    skull();
    g.clip();

    const eye = (glow) => {
      if (glow) {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(glowSprite(glow, 64), 0.58 * r - 9 * s, -0.16 * r - 9 * s, 18 * s, 18 * s);
        g.globalCompositeOperation = 'source-over';
        g.beginPath();
        g.ellipse(0.62 * r, -0.14 * r, 0.16 * r, 0.06 * r, -0.1, 0, Math.PI * 2);
        g.fillStyle = tint(glow, 0.5);
        g.fill();
      } else {
        g.beginPath();
        g.ellipse(0.6 * r, -0.12 * r, 0.13 * r, 0.06 * r, -0.12, 0, Math.PI * 2);
        g.fillStyle = '#1a0f0c';
        g.fill();
        g.beginPath();
        g.moveTo(0.4 * r, -0.3 * r);
        g.lineTo(0.85 * r, -0.26 * r);
        g.strokeStyle = shade(skinC, 0.6);
        g.lineWidth = 2.2 * s;
        g.stroke();
      }
    };

    if (style === 'long' || style === 'ponytail') {
      g.beginPath();
      g.moveTo(0.7 * r, -0.58 * r);
      g.quadraticCurveTo(0.4 * r, -1.25 * r, -0.4 * r, -1.08 * r);
      g.quadraticCurveTo(-1.2 * r, -0.6 * r, -0.95 * r, 0.5 * r);
      g.lineTo(-0.35 * r, 0.25 * r);
      g.quadraticCurveTo(-0.25 * r, -0.3 * r, 0.2 * r, -0.48 * r);
      g.closePath();
      const hc = lit(L.hair.color);
      const hg = g.createLinearGradient(0, -r, 0, r * 0.5);
      hg.addColorStop(0, tint(hc, 0.3));
      hg.addColorStop(1, shade(hc, 0.35));
      g.fillStyle = hg;
      g.fill();
      eye(null);
      if (L.band) {
        g.beginPath();
        g.moveTo(-1.1 * r, -0.42 * r);
        g.lineTo(0.95 * r, -0.5 * r);
        g.lineTo(0.95 * r, -0.32 * r);
        g.lineTo(-1.1 * r, -0.22 * r);
        g.fillStyle = lit(L.band);
        g.fill();
      }
      if (style === 'ponytail') {
        g.beginPath();
        g.moveTo(-0.6 * r, -0.62 * r);
        g.lineTo(0.88 * r, -0.66 * r);
        g.strokeStyle = lit(L.trim || '#d4a940');
        g.lineWidth = 2.6 * s;
        g.stroke();
      }
      if (L.scar) {
        g.beginPath();
        g.moveTo(0.48 * r, -0.36 * r);
        g.lineTo(0.7 * r, 0.12 * r);
        g.strokeStyle = 'rgba(120,30,30,0.7)';
        g.lineWidth = 1.6 * s;
        g.stroke();
      }
    } else if (style === 'bald') {
      eye(null);
      g.beginPath();
      g.ellipse(-0.15 * r, -0.62 * r, 0.42 * r, 0.22 * r, -0.3, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,240,220,0.22)';
      g.fill();
      if (L.mark) {
        g.beginPath();
        g.arc(0.62 * r, -0.55 * r, 0.09 * r, 0, Math.PI * 2);
        g.fillStyle = L.mark;
        g.fill();
      }
    } else if (style === 'mask') {
      g.beginPath();
      g.moveTo(0.2 * r, -0.3 * r);
      g.lineTo(1.1 * r, -0.36 * r);
      g.lineTo(1.1 * r, 0.02 * r);
      g.lineTo(0.2 * r, 0.04 * r);
      g.closePath();
      g.fillStyle = lit(L.skin);
      g.fill();
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-r, (0.2 + i * 0.18) * r);
        g.lineTo(r, (0.1 + i * 0.18) * r);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1.4 * s;
        g.stroke();
      }
      eye(L.glowEyes);
    } else if (style === 'none') {
      g.beginPath();
      g.moveTo(0.1 * r, -0.5 * r);
      g.lineTo(1.05 * r, -0.4 * r);
      g.lineTo(1.05 * r, -0.18 * r);
      g.lineTo(0.1 * r, -0.28 * r);
      g.fillStyle = shade(skinC, 0.35);
      g.fill();
      eye(L.glowEyes);
      g.beginPath();
      g.moveTo(-0.5 * r, -0.9 * r);
      g.lineTo(-0.2 * r, -0.4 * r);
      g.lineTo(-0.5 * r, 0.1 * r);
      g.strokeStyle = rgba(L.cracks, 0.8);
      g.lineWidth = 2 * s;
      g.stroke();
    } else if (style === 'horns') {
      g.beginPath();
      g.moveTo(-1.1 * r, -0.2 * r);
      g.quadraticCurveTo(-0.9 * r, -1.25 * r, 0.2 * r, -1.1 * r);
      g.lineTo(0.95 * r, -0.4 * r);
      g.lineTo(0.95 * r, -0.08 * r);
      g.lineTo(0.3 * r, -0.2 * r);
      g.lineTo(0.2 * r, 0.6 * r);
      g.lineTo(-1.1 * r, 0.6 * r);
      g.closePath();
      g.fillStyle = lit(L.topColor);
      g.fill();
      g.strokeStyle = lit(L.trim);
      g.lineWidth = 2 * s;
      g.stroke();
      eye(L.glowEyes);
      g.beginPath();
      g.moveTo(0.35 * r, 0.55 * r);
      g.quadraticCurveTo(0.6 * r, 1.25 * r, 0.1 * r, 1.4 * r);
      g.quadraticCurveTo(-0.1 * r, 1.0 * r, -0.2 * r, 0.7 * r);
      g.fillStyle = lit('#2a2420');
      g.fill();
    }
    g.restore();

    if (style === 'horns') {
      const horn = (ox, back) => {
        const c = lit(L.hair.color, back);
        g.beginPath();
        g.moveTo(ox - 0.18 * r, -0.85 * r);
        g.bezierCurveTo(ox - 0.9 * r, -1.3 * r, ox - 1.25 * r, -2.0 * r, ox - 0.55 * r, -2.55 * r);
        g.bezierCurveTo(ox - 0.85 * r, -1.95 * r, ox - 0.45 * r, -1.35 * r, ox + 0.25 * r, -0.95 * r);
        g.closePath();
        const hg = g.createLinearGradient(ox, -0.9 * r, ox - 0.6 * r, -2.5 * r);
        hg.addColorStop(0, shade(c, 0.35));
        hg.addColorStop(0.6, c);
        hg.addColorStop(1, tint(c, 0.4));
        g.fillStyle = hg;
        g.fill();
      };
      horn(-0.15 * r, true);
      horn(0.3 * r, false);
    }
    g.restore();
  };

  const chainAnchors = () => {
    if (!st) return;
    const { H, ang, r } = headFrame();
    const tf = torsoFrame();
    const wind = -F * 0.12 - (f.vx || 0) * 0.05;
    const style = L.hair.style;
    if (style === 'long') {
      const [ax, ay] = toCanvas(H[0], H[1], ang, F, -0.7 * r, -0.35 * r);
      stepChain(st.hair, ax, ay, { seg: 10 * s, wind, grav: 0.7, stiff: 0.08 });
    } else if (style === 'ponytail') {
      const [ax, ay] = toCanvas(H[0], H[1], ang, F, -0.55 * r, -0.85 * r);
      stepChain(st.hair, ax, ay, { seg: 9.5 * s, wind, grav: 0.6, stiff: 0.12 });
    } else if (style === 'mask') {
      const [ax, ay] = toCanvas(H[0], H[1], ang, F, -0.85 * r, -0.25 * r);
      stepChain(st.hair, ax, ay, { seg: 8 * s, wind: wind * 1.3, grav: 0.35 });
    }
    if (L.band) {
      const [ax, ay] = toCanvas(H[0], H[1], ang, F, -1.0 * r, -0.32 * r);
      stepChain(st.tail, ax, ay, { seg: 8 * s, wind: wind * 1.4, grav: 0.3 });
    }
    const k = s * bulk;
    if (L.sash) {
      const [ax, ay] = toCanvas(tf.hip[0], tf.hip[1], tf.ang, F, -20 * k, -tf.len * 0.1);
      stepChain(st.sash, ax, ay, { seg: 9 * s, wind: wind * 1.1, grav: 0.5 });
    }
    if (L.cape) {
      const [ax, ay] = toCanvas(tf.hip[0], tf.hip[1], tf.ang, F, -16 * k, -tf.len * 0.95);
      stepChain(st.cape, ax, ay, { seg: 22 * s, wind: wind * 0.8, grav: 0.8, drag: 0.8, stiff: 0.05 });
    }
    if (L.top === 'robe' || L.top === 'stone' || L.top === 'plate') {
      const [ax, ay] = toCanvas(tf.hip[0], tf.hip[1], tf.ang, F, 16 * k, -tf.len * 0.06);
      stepChain(st.flap, ax, ay, { seg: 13 * s, wind: wind * 0.3, grav: 0.9, drag: 0.75 });
      const [bx, by] = toCanvas(tf.hip[0], tf.hip[1], tf.ang, F, -17 * k, -tf.len * 0.06);
      stepChain(st.flapB, bx, by, { seg: 13 * s, wind: wind * 0.3, grav: 0.9, drag: 0.75 });
    }
  };

  const cloth = (which) => {
    if (!st) return;
    const c = (col, back) => (sil ? sil : lit(col, back));
    if (which === 'back') {
      if (L.cape) ribbon(g, st.cape.p, 34 * s, 70 * s, c(L.cape, true));
      if (L.sash) ribbon(g, st.sash.p, 9 * s, 4 * s, c(L.sash, true));
      if (L.band) ribbon(g, st.tail.p, 5 * s, 2 * s, c(L.band, true));
      if (L.hair.style === 'long') ribbon(g, st.hair.p, 20 * s, 3 * s, c(L.hair.color, false));
      if (L.hair.style === 'ponytail') ribbon(g, st.hair.p, 12 * s, 4 * s, c(L.hair.color, false));
      if (L.hair.style === 'mask') ribbon(g, st.hair.p, 6 * s, 2 * s, c(L.mask, true));
      if (st.flapB.init && (L.top === 'robe' || L.top === 'stone' || L.top === 'plate')) {
        ribbon(g, st.flapB.p, 24 * s * bulk, 12 * s * bulk, c(L.top === 'stone' ? L.belt : L.top === 'plate' ? L.topColor : L.topColor2, true));
      }
    } else if (st.flap.init && (L.top === 'robe' || L.top === 'stone' || L.top === 'plate')) {
      ribbon(g, st.flap.p, 26 * s * bulk, 12 * s * bulk, c(L.top === 'stone' ? L.belt : L.top === 'plate' ? L.topColor : L.topColor2, false));
      if (!sil && L.top === 'plate') {
        g.strokeStyle = rgba(L.trim, 0.8);
        g.lineWidth = 1.6 * s;
        g.stroke();
      }
    }
  };

  /* ------------------------------------------------------------ order */
  // One dark silhouette, slightly fatter, behind the lit body: the limbs read
  // as a single figure instead of separate jointed segments.
  if (!sil && opts.outline !== false) {
    drawFighter(g, f, light, { ...opts, silhouette: mix(light.ambient, '#000000', 0.7), outlineW: 3.4 * s, chains: false });
  }
  g.save();
  if (f.alpha < 1 || opts.alpha != null) g.globalAlpha = (opts.alpha ?? 1) * f.alpha;
  chainAnchors();
  cloth('back');
  arm('B');
  leg('B');
  limb(P.hipB, P.hipF, tr1 * 1.18, tr1 * 1.18, pal.leg, false, 0);
  torso();
  leg('F');
  cloth('front');
  head();
  arm('F');

  // elemental charge on the hands during specials
  if (!sil && f.state === 'special' && f.def.element) {
    const el = f.def.element;
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin(now * 30);
    for (const k of ['hf', 'hb']) {
      const q = P[k];
      const R = 60 * s * pulse;
      g.drawImage(glowSprite(el.glow, 128), q[0] - R, q[1] - R, R * 2, R * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

export function drawShadow(g, f, light) {
  if (f.hidden) return;
  const h = Math.max(0, f.y);
  const k = Math.max(0.35, 1 - h / 420);
  const w = 70 * f.body.scale * Math.sqrt(f.body.bulk) * k;
  g.save();
  g.globalAlpha = 0.55 * k * f.alpha;
  g.translate(f.x + (f.skel.hip ? f.skel.hip[0] * f.facing * 0.5 : 0), 2);
  g.scale(1, 0.18);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, w);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, w, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
