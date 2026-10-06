/* Painted fighter renderer.

   A fighter is painted into its own offscreen layer each frame, always
   facing right in the layer, then composited (mirrored if needed).

   Limbs are not cylinders: each whole arm and leg is ONE swept shape along
   a centreline that rounds smoothly through the joint, with an anatomical
   radius profile on each side (deltoid, triceps/biceps, forearm swell,
   glute/quad, knee, calf, ankle). Shading is painted in soft bands that
   follow that same centreline, so light wraps around the bend instead of
   sitting on a straight tube. Torso and head are smooth closed contours
   shaded with concentric light-shifted fills plus soft "spots" (radial
   gradients) for muscle, cheekbone and occlusion detail.

   Then the whole layer gets a backlit rim (silhouette minus a shifted
   copy of itself), a brush-grain texture, and a soft dark edge when it is
   composited. Hair, sashes, headband tails, flaps and capes are verlet
   chains simulated in world space.                                        */

import { mix, shade, tint, rgba, multiply, glowSprite } from './color.js';

const LX = -0.46, LY = -0.89;             // key light, screen space: from the upper left
const BANDS = 10;
const stateOf = new WeakMap();

/* ================================================================ math */
const hyp = Math.hypot;
function nrm(x, y) { const d = hyp(x, y) || 1; return [x / d, y / d]; }

function profile(keys) {
  return (u) => {
    if (u <= keys[0][0]) return [keys[0][1], keys[0][2]];
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (u <= k1[0]) {
        const k0 = keys[i - 1];
        const t = (u - k0[0]) / (k1[0] - k0[0] || 1);
        const e = (1 - Math.cos(t * Math.PI)) / 2;
        return [k0[1] + (k1[1] - k0[1]) * e, k0[2] + (k1[2] - k0[2]) * e];
      }
    }
    const k = keys[keys.length - 1];
    return [k[1], k[2]];
  };
}

/* Centreline through joints J (layer coords), rounded through each inner
   joint with a quadratic arc. Every sample carries its profile parameter
   u (segment index + fraction) and a unit normal. */
function centerline(J, sm = 0.24) {
  const out = [];
  const last = J.length - 2;
  for (let i = 0; i <= last; i++) {
    const a = J[i], b = J[i + 1];
    const t0 = i === 0 ? 0 : sm, t1 = i === last ? 1 : 1 - sm;
    const len = hyp(b[0] - a[0], b[1] - a[1]) * (t1 - t0);
    const n = Math.max(3, Math.ceil(len / 5));
    for (let k = 0; k < n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, u: i + t });
    }
    if (i < last) {
      const c = J[i + 1], d = J[i + 2];
      const p0 = [a[0] + (c[0] - a[0]) * (1 - sm), a[1] + (c[1] - a[1]) * (1 - sm)];
      const p2 = [c[0] + (d[0] - c[0]) * sm, c[1] + (d[1] - c[1]) * sm];
      for (let k = 0; k < 7; k++) {
        const s = k / 7, w0 = (1 - s) * (1 - s), w1 = 2 * (1 - s) * s, w2 = s * s;
        out.push({ x: w0 * p0[0] + w1 * c[0] + w2 * p2[0], y: w0 * p0[1] + w1 * c[1] + w2 * p2[1], u: i + 1 - sm + 2 * sm * s });
      }
    } else {
      out.push({ x: b[0], y: b[1], u: i + 1 });
    }
  }
  for (let i = 0; i < out.length; i++) {
    const p = out[Math.max(0, i - 1)], q = out[Math.min(out.length - 1, i + 1)];
    let [tx, ty] = nrm(q.x - p.x, q.y - p.y);
    if (tx === 0 && ty === 0) ty = 1;
    out[i].nx = -ty; out[i].ny = tx;
  }
  return out;
}

function smoothThrough(p, pts) {
  p.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    p.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  const l = pts[pts.length - 1];
  p.lineTo(l[0], l[1]);
}

/* Closed outline of a swept shape: side A along +normal, side B along
   -normal, rounded caps. `off` shifts the centre along the normal. */
function sweepPath(cs, A, B, off) {
  const n = cs.length;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = cs[i], o = off ? off[i] : 0;
    const x = c.x + c.nx * o, y = c.y + c.ny * o;
    L[i] = [x + c.nx * A[i], y + c.ny * A[i]];
    R[n - 1 - i] = [x - c.nx * B[i], y - c.ny * B[i]];
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  smoothThrough(p, L);
  const e = cs[n - 1], eo = off ? off[n - 1] : 0;
  const an = Math.atan2(e.ny, e.nx);
  const ec = (A[n - 1] - B[n - 1]) / 2 + eo;
  p.arc(e.x + e.nx * ec, e.y + e.ny * ec, Math.max(0.1, (A[n - 1] + B[n - 1]) / 2), an, an + Math.PI, true);
  smoothThrough(p, R);
  const s = cs[0], so = off ? off[0] : 0;
  const a0 = Math.atan2(s.ny, s.nx);
  const sc = (A[0] - B[0]) / 2 + so;
  p.arc(s.x + s.nx * sc, s.y + s.ny * sc, Math.max(0.1, (A[0] + B[0]) / 2), a0 + Math.PI, a0, true);
  p.closePath();
  return p;
}

function sweep(J, prof, k = 1, range = null, sm) {
  let cs = centerline(J, sm);
  if (range) cs = cs.filter((c) => c.u >= range[0] && c.u <= range[1]);
  if (cs.length < 2) return null;
  const A = [], B = [];
  for (const c of cs) { const [a, b] = prof(c.u); A.push(a * k); B.push(b * k); }
  return { cs, A, B, path: sweepPath(cs, A, B) };
}

/* =========================================================== painting */

function makeTones(c, light, back, skin) {
  let base = multiply(c, light.key, 0.3);
  if (back) base = mix(base, light.ambient, 0.4);
  let dark = mix(shade(base, 0.58), light.ambient, 0.35);
  if (skin) dark = mix(dark, '#5e1a12', 0.22);
  const hi = tint(mix(base, light.key, 0.35), back ? 0.12 : 0.24);
  const out = [];
  for (let k = 1; k <= BANDS; k++) {
    const t = k / BANDS;
    out.push(t < 0.45 ? mix(dark, base, t / 0.45) : mix(base, hi, (t - 0.45) / 0.55));
  }
  return { dark, base, hi, bands: out };
}

function paintSweep(g, sw, tones, Lv, gloss = 0) {
  if (!sw) return;
  const { cs, A, B, path } = sw;
  g.save();
  g.clip(path);
  g.fillStyle = tones.dark;
  g.fill(path);
  const A2 = new Array(cs.length), B2 = new Array(cs.length), off = new Array(cs.length);
  for (let k = 1; k <= BANDS; k++) {
    const t = k / BANDS;
    const sc = 1 - t * 0.8;
    for (let i = 0; i < cs.length; i++) {
      const d = cs[i].nx * Lv[0] + cs[i].ny * Lv[1];
      A2[i] = A[i] * sc; B2[i] = B[i] * sc;
      off[i] = d * t * 0.55 * (A[i] + B[i]) / 2;
    }
    g.globalAlpha = 0.42;
    g.fillStyle = tones.bands[k - 1];
    g.fill(sweepPath(cs, A2, B2, off));
  }
  if (gloss) {
    for (let i = 0; i < cs.length; i++) {
      const d = cs[i].nx * Lv[0] + cs[i].ny * Lv[1];
      A2[i] = A[i] * 0.16; B2[i] = B[i] * 0.16;
      off[i] = d * 0.6 * (A[i] + B[i]) / 2;
    }
    g.globalAlpha = gloss;
    g.fillStyle = tint(tones.hi, 0.5);
    g.fill(sweepPath(cs, A2, B2, off));
  }
  g.restore();
}

function paintShape(g, path, cx, cy, size, Lv, tones) {
  g.save();
  g.clip(path);
  g.fillStyle = tones.dark;
  g.fill(path);
  for (let k = 1; k <= BANDS; k++) {
    const t = k / BANDS;
    const sc = 1 - t * 0.72;
    g.save();
    g.translate(cx + Lv[0] * size * t * 0.42, cy + Lv[1] * size * t * 0.42);
    g.scale(sc, sc);
    g.translate(-cx, -cy);
    g.globalAlpha = 0.42;
    g.fillStyle = tones.bands[k - 1];
    g.fill(path);
    g.restore();
  }
  g.restore();
}

function spot(g, x, y, rx, ry, color, a, rot = 0) {
  if (rx <= 0 || ry <= 0) return;
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}

function softLine(g, pts, color, width, alpha) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = rgba(color, alpha * 0.45);
  g.lineWidth = width * 1.9;
  const draw = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    g.stroke();
  };
  draw();
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  draw();
  g.restore();
}

/* ============================================================ chains */
function makeChain(n) {
  const mk = () => Array.from({ length: n }, () => [0, 0]);
  return { p: mk(), q: mk(), init: false };
}

function stepChain(ch, ax, ay, o) {
  const { seg, grav = 0.55, drag = 0.86, wind = 0, stiff = 0 } = o;
  const p = ch.p, q = ch.q;
  if (!ch.init || hyp(p[0][0] - ax, p[0][1] - ay) > 220) {
    for (let i = 0; i < p.length; i++) {
      p[i][0] = q[i][0] = ax - wind * 8 * i;
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
      const d = hyp(dx, dy) || 0.001;
      p[i][0] = p[i - 1][0] + (dx * seg) / d;
      p[i][1] = p[i - 1][1] + (dy * seg) / d;
    }
    for (let i = 1; i < p.length; i++) if (p[i][1] > -2) p[i][1] = -2;   // rests on the floor
    if (stiff) {
      for (let i = 2; i < p.length; i++) {
        p[i][0] += (2 * p[i - 1][0] - p[i - 2][0] - p[i][0]) * stiff;
        p[i][1] += (2 * p[i - 1][1] - p[i - 2][1] - p[i][1]) * stiff;
      }
    }
  }
}

function ribbonPath(pts, w0, w1) {
  const n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const [dx, dy] = nrm(b[0] - a[0], b[1] - a[1]);
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    R.unshift([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  smoothThrough(p, L);
  smoothThrough(p, R);
  p.closePath();
  return p;
}

/* ============================================================ texture */
let grain = null;
function grainCanvas() {
  if (grain) return grain;
  const S = 192;
  grain = document.createElement('canvas');
  grain.width = grain.height = S;
  const g = grain.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 1337;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (r() - 0.5) * 120;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // brush streaks
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.07})`;
    g.lineWidth = 1 + r() * 3;
    const x = r() * S, y = r() * S, a = -0.8 + r() * 0.5, l = 10 + r() * 30;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return grain;
}

/* ========================================================= main entry */

function stateFor(f) {
  let st = stateOf.get(f);
  if (!st) {
    st = {
      hair: makeChain(8), tail: makeChain(5), sash: makeChain(6), cape: makeChain(7), flap: makeChain(4), flapB: makeChain(4),
      lay: document.createElement('canvas'), sil: document.createElement('canvas'), rim: document.createElement('canvas'),
      ready: false
    };
    stateOf.set(f, st);
  }
  return st;
}

function ensure(c, w, h) {
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, Math.ceil(w * 1.15));
    c.height = Math.max(c.height, Math.ceil(h * 1.15));
  }
}

function profilesFor(f) {
  const b = f.body, s = b.scale, k = b.bulk, L = f.def.look;
  const key = s + ':' + k;
  if (f._prof && f._prof.key === key) return f._prof;
  const A = 12.5 * s * k, Fa = 10 * s * k;
  const T = 15.5 * s * k, C = 11.6 * s * k;
  const baggy = L.pantsStyle === 'gi' ? 1.16 : 1;
  const stone = L.stone ? 1.12 : 1;
  const fem = L.female ? 0.92 : 1;
  const prof = {
    key,
    // side A = back of the limb, side B = front (for a limb hanging down)
    arm: profile([
      [0, A * 1.16, A * 1.08], [0.12, A * 1.12 * stone, A * 1.02], [0.42, A * 1.06 * stone, A * 1.12 * stone * fem],
      [0.85, A * 0.82, A * 0.84], [1, A * 0.8, A * 0.8], [1.18, Fa * 1.08 * stone, Fa * 1.12 * stone],
      [1.6, Fa * 0.86, Fa * 0.9], [2, Fa * 0.66, Fa * 0.66]
    ]),
    leg: profile([
      [0, T * 1.1 * baggy * (2 - fem), T * 1.05 * baggy], [0.3, T * 1.0 * baggy, T * 1.1 * baggy], [0.8, T * 0.76 * baggy, T * 0.84 * baggy],
      [1, T * 0.7 * baggy, T * 0.76 * baggy], [1.3, C * 1.08 * baggy * stone, C * 0.84 * baggy],
      [1.75, C * 0.7 * (baggy > 1 ? 1.25 : 1), C * 0.64 * (baggy > 1 ? 1.25 : 1)], [2, C * 0.56 * (baggy > 1 ? 1.35 : 1), C * 0.56 * (baggy > 1 ? 1.35 : 1)]
    ]),
    // foot: A = sole side, B = instep
    foot: profile([[0, 6.2 * s, 6.6 * s], [0.3, 4.2 * s, 7.8 * s], [0.75, 3.6 * s, 4.6 * s], [1, 3.2 * s, 3.4 * s]]),
    fist: profile([[0, 8.2 * s * Math.sqrt(k), 8.6 * s * Math.sqrt(k)], [0.5, 9.8 * s * Math.sqrt(k) * stone, 9.6 * s * Math.sqrt(k) * stone], [1, 9 * s * Math.sqrt(k) * stone, 8.8 * s * Math.sqrt(k) * stone]])
  };
  f._prof = prof;
  return prof;
}

export function drawFighter(g, f, light, opts = {}) {
  const sk = f.skel;
  if (!sk || !sk.hip) return;
  const st = stateFor(f);
  const F = f.facing;
  const T = g.getTransform();
  // painted layers render at ~75% of the screen's density: the soft look
  // hides it, and it roughly halves the fill cost
  const px = Math.min(2.2, Math.max(0.35, hyp(T.a, T.b) * 0.75));

  if (opts.silhouette) {
    g.save();
    if (f.alpha < 1 || opts.alpha != null) g.globalAlpha = (opts.alpha ?? 1) * f.alpha;
    g.translate(f.x, -f.y);
    g.scale(F, 1);
    const geo = buildGeometry(f, st, false);
    g.fillStyle = opts.silhouette;
    for (const p of geo.all) g.fill(p);
    g.restore();
    return;
  }

  if (opts.reuse) {
    if (st.ready) composite(g, f, st, opts);
    return;
  }

  if (opts.chains !== false) stepChains(f, st);
  paintLayer(f, st, light, px, opts.time || 0, !!opts.lite);
  composite(g, f, st, opts);
}

function composite(g, f, st, opts) {
  const F = f.facing;
  g.save();
  const a = (opts.alpha ?? 1) * f.alpha;
  g.translate(f.x, -f.y);
  g.scale(F / st.px, 1 / st.px);
  g.globalAlpha = a * 0.75;
  const o = 1.8;
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) g.drawImage(st.sil, 0, 0, st.w, st.h, st.ox + dx, st.oy + dy, st.w, st.h);
  g.globalAlpha = a;
  g.drawImage(st.lay, 0, 0, st.w, st.h, st.ox, st.oy, st.w, st.h);
  g.restore();
}

/* local layer space: x forward (always facing right), y down, origin at the
   fighter's root on the floor. */
function localPoints(f) {
  const P = {};
  for (const k in f.skel) {
    const q = f.skel[k];
    if (Array.isArray(q)) P[k] = [q[0], -q[1]];
  }
  return P;
}

function toWorld(f, p) { return [f.x + p[0] * f.facing, p[1] - f.y]; }
function toLocal(f, p) { return [(p[0] - f.x) * f.facing, p[1] + f.y]; }

function frameOf(a, b) {
  return Math.atan2(b[0] - a[0], -(b[1] - a[1]));
}
function inFrame(o, ang, x, y) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
}

function stepChains(f, st) {
  const P = localPoints(f);
  const L = f.def.look;
  const s = f.body.scale, k = f.body.bulk;
  const r = f.body.head;
  const hAng = frameOf(P.neck, P.head);
  const tAng = frameOf(P.hip, P.neck);
  const tLen = hyp(P.neck[0] - P.hip[0], P.neck[1] - P.hip[1]);
  const wind = -f.facing * 0.12 - (f.vx || 0) * 0.05;
  const W = (p) => toWorld(f, p);
  const style = L.hair.style;
  if (style === 'long') stepChain(st.hair, ...W(inFrame(P.head, hAng, -0.72 * r, -0.4 * r)), { seg: 10 * s, wind, grav: 0.7, stiff: 0.08 });
  else if (style === 'ponytail') stepChain(st.hair, ...W(inFrame(P.head, hAng, -0.55 * r, -0.9 * r)), { seg: 9.5 * s, wind, grav: 0.6, stiff: 0.12 });
  else if (style === 'mask') stepChain(st.hair, ...W(inFrame(P.head, hAng, -0.88 * r, -0.28 * r)), { seg: 8 * s, wind: wind * 1.3, grav: 0.35 });
  if (L.band) stepChain(st.tail, ...W(inFrame(P.head, hAng, -1.0 * r, -0.36 * r)), { seg: 8 * s, wind: wind * 1.4, grav: 0.3 });
  if (L.sash) stepChain(st.sash, ...W(inFrame(P.hip, tAng, -22 * s * k, -tLen * 0.1)), { seg: 9 * s, wind: wind * 1.1, grav: 0.5 });
  if (L.cape) stepChain(st.cape, ...W(inFrame(P.hip, tAng, -18 * s * k, -tLen * 0.94)), { seg: 22 * s, wind: wind * 0.8, grav: 0.8, drag: 0.8, stiff: 0.05 });
  if (L.top === 'robe' || L.top === 'stone' || L.top === 'plate') {
    stepChain(st.flap, ...W(inFrame(P.hip, tAng, 17 * s * k, -tLen * 0.05)), { seg: 13 * s, wind: wind * 0.3, grav: 0.9, drag: 0.75 });
    stepChain(st.flapB, ...W(inFrame(P.hip, tAng, -19 * s * k, -tLen * 0.05)), { seg: 13 * s, wind: wind * 0.3, grav: 0.9, drag: 0.75 });
  }
}

/* ----------------------------------------------- geometry (shared) */
function torsoContour(len, k, fem) {
  const pts = fem
    ? [[22, 6], [21, -0.16], [16, -0.32], [19, -0.5], [25, -0.6], [22, -0.78], [15, -0.94], [8, -1.0],
      [-9, -1.0], [-19, -0.9], [-23, -0.72], [-19, -0.5], [-16, -0.32], [-26, -0.12], [-23, 8]]
    : [[21, 6], [20, -0.18], [19, -0.32], [23, -0.48], [29, -0.6], [27, -0.8], [17, -0.95], [9, -1.0],
      [-10, -1.0], [-22, -0.9], [-27, -0.72], [-24, -0.5], [-18, -0.3], [-25, -0.1], [-22, 8]];
  const p = new Path2D();
  const P = pts.map(([x, y]) => [x * k, Math.abs(y) > 1.5 ? y : y * len]);
  const n = P.length;
  p.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  p.closePath();
  return p;
}

function headContour(r, stone) {
  const p = new Path2D();
  if (stone) {
    const pts = [[-0.1, -1.0], [0.72, -0.86], [0.98, -0.3], [1.02, 0.15], [0.92, 0.55], [0.6, 0.98], [-0.45, 0.92], [-0.95, 0.2], [-0.82, -0.66]];
    p.moveTo(pts[0][0] * r, pts[0][1] * r);
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
      p.quadraticCurveTo(a[0] * r, a[1] * r, ((a[0] + b[0]) / 2) * r, ((a[1] + b[1]) / 2) * r);
    }
    p.closePath();
    return p;
  }
  // profile: crown, forehead, brow, nose, lips, chin, jaw, nape
  p.moveTo(-0.05 * r, -1.02 * r);
  p.bezierCurveTo(0.42 * r, -1.04 * r, 0.74 * r, -0.82 * r, 0.8 * r, -0.42 * r);
  p.quadraticCurveTo(0.9 * r, -0.3 * r, 0.86 * r, -0.18 * r);          // brow ridge
  p.quadraticCurveTo(0.9 * r, -0.04 * r, 1.08 * r, 0.14 * r);          // nose bridge to tip
  p.quadraticCurveTo(1.04 * r, 0.24 * r, 0.9 * r, 0.25 * r);           // nostril
  p.quadraticCurveTo(0.93 * r, 0.33 * r, 0.9 * r, 0.4 * r);            // upper lip
  p.quadraticCurveTo(0.84 * r, 0.44 * r, 0.88 * r, 0.5 * r);           // mouth
  p.quadraticCurveTo(0.9 * r, 0.58 * r, 0.8 * r, 0.64 * r);            // lower lip
  p.quadraticCurveTo(0.84 * r, 0.82 * r, 0.62 * r, 0.9 * r);           // chin
  p.quadraticCurveTo(0.2 * r, 0.98 * r, -0.2 * r, 0.76 * r);           // jaw
  p.quadraticCurveTo(-0.5 * r, 0.66 * r, -0.66 * r, 0.6 * r);          // nape
  p.bezierCurveTo(-1.02 * r, 0.3 * r, -1.04 * r, -0.62 * r, -0.05 * r, -1.02 * r);
  p.closePath();
  return p;
}

function rotPath(path, o, ang) {
  const m = new DOMMatrix().translate(o[0], o[1]).rotate(ang * 180 / Math.PI);
  const p = new Path2D();
  p.addPath(path, m);
  return p;
}

function buildGeometry(f, st, withChains = true) {
  const P = localPoints(f);
  const b = f.body, s = b.scale, k = b.bulk, L = f.def.look;
  const pr = profilesFor(f);
  const geo = { P, all: [] };
  geo.armB = sweep([P.shB, P.elB, P.hb], pr.arm);
  geo.armF = sweep([P.shF, P.elF, P.hf], pr.arm);
  geo.legB = sweep([P.hipB, P.knB, P.anB], pr.leg);
  geo.legF = sweep([P.hipF, P.knF, P.anF], pr.leg);
  geo.footB = sweep([P.heB, P.fb], pr.foot);
  geo.footF = sweep([P.heF, P.ff], pr.foot);
  const fist = (el, hd) => {
    const [dx, dy] = nrm(hd[0] - el[0], hd[1] - el[1]);
    const len = 9.5 * s * Math.sqrt(k);
    return sweep([[hd[0] - dx * 3 * s, hd[1] - dy * 3 * s], [hd[0] + dx * len, hd[1] + dy * len]], pr.fist);
  };
  geo.fistB = fist(P.elB, P.hb);
  geo.fistF = fist(P.elF, P.hf);
  const tLen = hyp(P.neck[0] - P.hip[0], P.neck[1] - P.hip[1]);
  geo.tAng = frameOf(P.hip, P.neck);
  geo.tLen = tLen;
  geo.torsoLocal = torsoContour(tLen, s * k, L.female);
  geo.torso = rotPath(geo.torsoLocal, P.hip, geo.tAng);
  geo.hAng = frameOf(P.neck, P.head);
  geo.neck = sweep([P.neck, P.head], () => [8.6 * s * k, 8.2 * s * k]);
  geo.headLocal = headContour(b.head, L.stone);
  geo.head = rotPath(geo.headLocal, P.head, geo.hAng);
  geo.all.push(geo.armB.path, geo.legB.path, geo.footB.path, geo.fistB.path, geo.torso, geo.legF.path, geo.footF.path, geo.neck.path, geo.head, geo.armF.path, geo.fistF.path);
  if (withChains) {
    const loc = (ch) => ch.p.map((q) => toLocal(f, q));
    geo.chains = {};
    if (st.hair.init) geo.chains.hair = loc(st.hair);
    if (st.tail.init) geo.chains.tail = loc(st.tail);
    if (st.sash.init) geo.chains.sash = loc(st.sash);
    if (st.cape.init) geo.chains.cape = loc(st.cape);
    if (st.flap.init) geo.chains.flap = loc(st.flap);
    if (st.flapB.init) geo.chains.flapB = loc(st.flapB);
  }
  return geo;
}

/* ------------------------------------------------------- the painting */
function paintLayer(f, st, light, px, time, lite) {
  const geo = buildGeometry(f, st, true);
  const P = geo.P;
  const b = f.body, s = b.scale, k = b.bulk, L = f.def.look;
  const F = f.facing;
  const Lv = nrm(LX * F, LY);                         // key light in layer space
  const flash = f.flash > 0 ? 0.55 : 0;

  // bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const key in P) grow(P[key][0], P[key][1]);
  for (const c in geo.chains) for (const q of geo.chains[c]) grow(q[0], q[1]);
  const m = 46 * s * Math.max(1, k) + (L.hair.style === 'horns' ? 40 * s : 0);
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  let W = Math.ceil((x1 - x0) * px), H = Math.ceil((y1 - y0) * px);
  let pxe = px;
  const cap = 1400;
  if (W > cap || H > cap) { pxe = px * cap / Math.max(W, H); W = Math.ceil((x1 - x0) * pxe); H = Math.ceil((y1 - y0) * pxe); }
  ensure(st.lay, W, H); ensure(st.sil, W, H); ensure(st.rim, W, H);
  st.w = W; st.h = H; st.px = pxe; st.ox = x0 * pxe; st.oy = y0 * pxe;

  const g = st.lay.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W + 2, H + 2);
  g.setTransform(pxe, 0, 0, pxe, -x0 * pxe, -y0 * pxe);

  const T = (c, back = false, skin = false) => makeTones(flash ? mix(c, '#ffffff', flash) : c, light, back, skin);
  const skinT = T(L.skin, false, !L.stone), skinTB = T(L.skin, true, !L.stone);
  const legC = L.stone ? L.skin : L.pants;
  const armC = L.sleeve === 'long' ? L.topColor : L.skin;
  const armBC = L.top === 'robe' || L.sleeve === 'long' || L.top === 'plate' ? L.topColor : L.skin;
  const foreC = L.gloves || L.wraps || L.skin;
  const fistC = L.gloves || L.wraps || L.skin;
  const bootC = L.boots || L.skin;
  const isSkin = (c) => c === L.skin && !L.stone;
  const ao = rgba(mix(light.ambient, '#000000', 0.6), 0.55);

  const occlude = (path, blur, dx, dy) => {
    if (lite) return;
    // soft contact shadow cast by `path` onto what is already painted
    g.save();
    g.shadowColor = ao;
    g.shadowBlur = blur * pxe;
    g.shadowOffsetX = 10000 + dx * pxe;
    g.shadowOffsetY = dy * pxe;
    g.translate(-10000 / pxe, 0);
    g.fillStyle = '#000';
    g.fill(path);
    g.restore();
  };

  /* ---- cloth behind ---- */
  const C = geo.chains;
  const clothPaint = (pts, w0, w1, color, back, sheen = 0.25) => {
    if (!pts) return;
    const path = ribbonPath(pts, w0, w1);
    const t = T(color, back);
    g.fillStyle = t.base;
    g.fill(path);
    g.save();
    g.clip(path);
    softLine(g, pts, t.dark, w0 * 0.55, 0.55);
    softLine(g, pts.map((q) => [q[0] + Lv[0] * w0 * 0.2, q[1] + Lv[1] * w0 * 0.2]), t.hi, w0 * 0.18, sheen);
    g.restore();
  };
  if (C.cape) {
    clothPaint(C.cape, 36 * s, 74 * s, L.cape, true, 0.2);
    g.save();
    g.clip(ribbonPath(C.cape, 36 * s, 74 * s));
    const ct = T(L.cape, true);
    for (const o of [-0.32, -0.1, 0.14, 0.34]) {
      softLine(g, C.cape.map((q, j) => {
        const w = (36 + 38 * j / (C.cape.length - 1)) * s;
        return [q[0] + o * w, q[1]];
      }), o > 0 ? ct.hi : ct.dark, 3 * s, 0.4);
    }
    g.restore();
  }
  if (C.sash) clothPaint(C.sash, 9 * s, 4 * s, L.sash, true);
  if (C.tail) clothPaint(C.tail, 5 * s, 2 * s, L.band, true);
  if (C.hair && L.hair.style !== 'mask') {
    const w0 = (L.hair.style === 'long' ? 22 : 13) * s;
    clothPaint(C.hair, w0, 3 * s, L.hair.color, false, 0.35);
    g.save();
    g.clip(ribbonPath(C.hair, w0, 3 * s));
    const ht = T(L.hair.color);
    for (let i = -2; i <= 2; i++) {
      softLine(g, C.hair.map((q, j) => [q[0] + i * w0 * 0.16 * (1 - j / C.hair.length), q[1]]), i % 2 ? ht.hi : ht.dark, 1.3 * s, 0.5);
    }
    g.restore();
  }
  if (C.hair && L.hair.style === 'mask') clothPaint(C.hair, 6 * s, 2 * s, L.mask, true);
  if (C.flapB) clothPaint(C.flapB, 20 * s * k, 9 * s * k, L.top === 'stone' ? L.belt : L.top === 'plate' ? L.topColor : L.topColor2, true, 0.12);

  /* ---- back arm & leg ---- */
  const arm = (side, back) => {
    const sw = side === 'F' ? geo.armF : geo.armB;
    const fs = side === 'F' ? geo.fistF : geo.fistB;
    const el = P['el' + side], hd = side === 'F' ? P.hf : P.hb;
    if (!back) occlude(sw.path, 10 * s, Lv[0] * -4 * s, Lv[1] * -4 * s);
    const base = back ? armBC : armC;
    paintSweep(g, sw, T(base, back, isSkin(base)), Lv, isSkin(base) ? 0.18 : 0.1);
    if (foreC !== base) {
      const fsw = sweep([P['sh' + side], el, hd], profilesFor(f).arm, 1.03, [1.12, 2]);
      paintSweep(g, fsw, T(foreC, back, isSkin(foreC)), Lv, 0.12);
      if (L.wraps && !L.gloves && fsw) {
        g.save(); g.clip(fsw.path);
        const wt = T(L.wraps, back);
        for (let i = 0; i < 7; i++) {
          const c = fsw.cs[Math.floor((i + 0.5) / 7 * fsw.cs.length)];
          const r = (fsw.A[0] + fsw.B[0]) * 0.6;
          softLine(g, [[c.x + c.nx * r, c.y + c.ny * r + 2 * s], [c.x - c.nx * r, c.y - c.ny * r - 1 * s]], wt.dark, 1.2 * s, 0.45);
        }
        g.restore();
      }
    }
    if (!back && isSkin(base)) {
      // bicep and deltoid highlights
      const mid = sw.cs[Math.floor(sw.cs.length * 0.22)];
      spot(g, mid.x + Lv[0] * 4 * s, mid.y + Lv[1] * 4 * s, 9 * s * k, 5 * s * k, tint(skinT.hi, 0.3), 0.35, Math.atan2(mid.ny, mid.nx) + Math.PI / 2);
    }
    paintSweep(g, fs, T(fistC, back, isSkin(fistC)), Lv, 0.2);
    // knuckles
    const kc = fs.cs[Math.floor(fs.cs.length * 0.78)];
    for (let i = -1; i <= 2; i++) {
      const o = i * 3.2 * s;
      spot(g, kc.x + kc.nx * o, kc.y + kc.ny * o, 2.6 * s, 2.2 * s, T(fistC, back).hi, 0.45);
    }
    if (L.top === 'armor' || L.top === 'plate') pauldron(g, P['sh' + side], el, back);
  };

  const pauldron = (gg, sh, el, back) => {
    const ang = Math.atan2(el[1] - sh[1], el[0] - sh[0]);
    const r = 17 * s * k;
    const path = new Path2D();
    path.ellipse(r * 0.22, 0, r * 1.08, r * 0.96, 0, -Math.PI * 0.95, Math.PI * 0.95);
    path.closePath();
    const wp = rotPath(path, sh, ang);
    const base = L.top === 'armor' ? L.trim : L.topColor;
    paintShape(gg, wp, sh[0], sh[1], r, Lv, T(base, back));
    gg.save();
    gg.lineWidth = 1.8 * s;
    gg.strokeStyle = rgba(T(L.trim || '#c9a227', back).hi, 0.9);
    gg.stroke(wp);
    if (L.top === 'plate') {
      gg.translate(sh[0], sh[1]);
      gg.rotate(ang);
      const tt = T(L.trim, back);
      for (let i = -1; i <= 1; i++) {
        const sp = new Path2D();
        sp.moveTo(i * r * 0.5 - 4 * s, -r * 0.72);
        sp.quadraticCurveTo(i * r * 0.5 - r * 0.35, -r * 1.2, i * r * 0.5 - r * 0.28, -r * 1.6 + Math.abs(i) * r * 0.25);
        sp.quadraticCurveTo(i * r * 0.5, -r * 1.1, i * r * 0.5 + 5 * s, -r * 0.76);
        sp.closePath();
        paintShape(gg, sp, i * r * 0.5, -r, r * 0.5, Lv, tt);
      }
    }
    gg.restore();
  };

  const leg = (side, back) => {
    const sw = side === 'F' ? geo.legF : geo.legB;
    const ft = side === 'F' ? geo.footF : geo.footB;
    if (!back) occlude(sw.path, 12 * s, -Lv[0] * 4 * s, -Lv[1] * 4 * s);
    paintSweep(g, ft, T(bootC, back, isSkin(bootC)), Lv, 0.14);
    paintSweep(g, sw, T(legC, back, isSkin(legC)), Lv, isSkin(legC) ? 0.14 : 0.08);
    if (L.boots) {
      const bsw = sweep([P['hip' + side], P['kn' + side], P['an' + side]], profilesFor(f).leg, 1.05, [1.42, 2]);
      paintSweep(g, bsw, T(L.boots, back), Lv, 0.22);
      if (bsw) {
        const c = bsw.cs[0];
        softLine(g, [[c.x + c.nx * bsw.A[0], c.y + c.ny * bsw.A[0]], [c.x - c.nx * bsw.B[0], c.y - c.ny * bsw.B[0]]], T(L.boots, back).hi, 1.6 * s, 0.6);
      }
    } else if (L.pantsStyle === 'gi') {
      // ankle wraps on barefoot fighters
      const wsw = sweep([P['hip' + side], P['kn' + side], P['an' + side]], profilesFor(f).leg, 0.62, [1.86, 2]);
      paintSweep(g, wsw, T(L.wraps || L.skin, back), Lv, 0.1);
    }
    if (!L.stone && L.pantsStyle === 'gi') {
      // fabric folds: soft creases that follow the bend of the leg
      g.save();
      g.clip(sw.path);
      const tt = T(legC, back);
      const cs = sw.cs;
      for (const [u0, u1, o] of [[0.3, 0.95, 0.35], [1.05, 1.6, -0.3], [1.5, 1.95, 0.4], [0.6, 1.25, -0.5]]) {
        const pts = cs.filter((c) => c.u >= u0 && c.u <= u1).map((c) => {
          const [ra] = profilesFor(f).leg(c.u);
          return [c.x + c.nx * ra * o, c.y + c.ny * ra * o];
        });
        if (pts.length > 2) softLine(g, pts, tt.dark, 2.2 * s, 0.4);
      }
      g.restore();
    }
    if (L.stone || isSkin(legC)) {
      const kn = P['kn' + side];
      spot(g, kn[0] + Lv[0] * 3 * s, kn[1] + Lv[1] * 3 * s, 8 * s * k, 6 * s * k, T(legC, back).hi, 0.3);
    }
  };

  arm('B', true);
  leg('B', true);

  /* ---- torso ---- */
  const tLen = geo.tLen;
  const kk = s * k;
  const bare = L.top === 'robe' || L.top === 'stone' || L.top === 'gi';
  g.save();
  g.translate(P.hip[0], P.hip[1]);
  g.rotate(geo.tAng);
  const Lt = [Lv[0] * Math.cos(-geo.tAng) - Lv[1] * Math.sin(-geo.tAng), Lv[0] * Math.sin(-geo.tAng) + Lv[1] * Math.cos(-geo.tAng)];
  const tp = geo.torsoLocal;
  const wT = 27 * kk;
  paintShape(g, tp, 0, -tLen * 0.55, wT * 1.4, Lt, bare ? skinT : T(L.topColor));
  g.save();
  g.clip(tp);
  if (bare && !L.stone) {
    // anatomy: pec shelf, abdominal blocks, serratus, oblique
    spot(g, wT * 0.55, -tLen * 0.7, wT * 0.55, tLen * 0.12, skinT.hi, 0.35);
    softLine(g, [[wT * 1.05, -tLen * 0.6], [wT * 0.45, -tLen * 0.53], [-wT * 0.1, -tLen * 0.62]], skinT.dark, 2.6 * s, 0.4);
    for (let i = 0; i < 3; i++) {
      const y = -tLen * (0.24 + i * 0.1);
      spot(g, wT * 0.62, y, wT * 0.22, tLen * 0.045, skinT.hi, 0.32);
      softLine(g, [[wT * 0.4, y + tLen * 0.05], [wT * 0.88, y + tLen * 0.045]], skinT.dark, 1.4 * s, 0.32);
    }
    softLine(g, [[wT * 0.42, -tLen * 0.58], [wT * 0.4, -tLen * 0.15]], skinT.dark, 1.3 * s, 0.3);
    for (let i = 0; i < 3; i++) softLine(g, [[wT * 0.2, -tLen * (0.42 + i * 0.05)], [wT * 0.02, -tLen * (0.38 + i * 0.05)]], skinT.dark, 1.2 * s, 0.25);
    spot(g, -wT * 0.6, -tLen * 0.78, wT * 0.5, tLen * 0.14, skinT.dark, 0.3);
  }
  const cT = T(L.topColor), cT2 = T(L.topColor2 || L.topColor);
  const region = (pts, tones, size = wT * 1.4) => {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    paintShape(g, p, 0, -tLen * 0.55, size, Lt, tones);
    return p;
  };
  if (L.top === 'gi') {
    region([[-wT * 1.5, 8], [-wT * 1.5, -tLen * 1.1], [wT * 0.05, -tLen * 1.1], [wT * 0.62, -tLen * 0.42], [wT * 1.5, -tLen * 0.42], [wT * 1.5, 8]], cT);
    softLine(g, [[wT * 0.05, -tLen * 1.08], [wT * 0.62, -tLen * 0.42]], cT.hi, 2.4 * s, 0.6);
    for (let i = 0; i < 3; i++) softLine(g, [[-wT * (1.0 - i * 0.3), -tLen * 0.95], [-wT * (0.7 - i * 0.3), -tLen * 0.5], [-wT * (0.8 - i * 0.3), -tLen * 0.1]], cT.dark, 2 * s, 0.35);
  } else if (L.top === 'robe') {
    region([[-wT * 1.5, 8], [-wT * 1.5, -tLen * 1.1], [-wT * 0.25, -tLen * 1.1], [wT * 1.5, -tLen * 0.34], [wT * 1.5, 8]], cT);
    for (let i = 0; i < 4; i++) softLine(g, [[-wT * (0.9 - i * 0.35), -tLen * (0.95 - i * 0.05)], [-wT * (0.4 - i * 0.3), -tLen * 0.5], [-wT * (0.6 - i * 0.4), -tLen * 0.05]], cT2.dark, 2 * s, 0.4);
    softLine(g, [[-wT * 0.25, -tLen * 1.08], [wT * 1.4, -tLen * 0.36]], cT.hi, 2.6 * s, 0.6);
  } else if (L.top === 'armor') {
    const pl = region([[-wT * 1.5, -tLen * 0.18], [-wT * 1.5, -tLen * 0.98], [wT * 1.5, -tLen * 0.98], [wT * 1.5, -tLen * 0.18]], cT);
    g.lineWidth = 2.2 * s; g.strokeStyle = rgba(T(L.trim).hi, 0.85); g.stroke(pl);
    for (const y of [0.42, 0.62, 0.8]) softLine(g, [[-wT * 1.4, -tLen * y], [wT * 0.2, -tLen * (y + 0.04)], [wT * 1.4, -tLen * y]], cT2.dark, 1.6 * s, 0.6);
    spot(g, wT * 0.5, -tLen * 0.68, wT * 0.6, tLen * 0.14, cT.hi, 0.35);
    softLine(g, [[wT * 0.62, -tLen * 0.82], [wT * 0.36, -tLen * 0.64], [wT * 0.62, -tLen * 0.62], [wT * 0.34, -tLen * 0.42]], f.def.element.glow, 2.4 * s, 0.95);
  } else if (L.top === 'wrap') {
    for (let i = -3; i < 7; i++) softLine(g, [[-wT * 1.4, -tLen * (0.08 + i * 0.12)], [wT * 1.4, -tLen * (0.26 + i * 0.12)]], cT2.dark, 2 * s, 0.6);
    for (let i = -3; i < 7; i++) softLine(g, [[-wT * 1.4, -tLen * (0.12 + i * 0.12)], [wT * 1.4, -tLen * (0.3 + i * 0.12)]], cT.hi, 0.9 * s, 0.25);
    softLine(g, [[-wT * 1.2, -tLen * 1.0], [wT * 1.2, -tLen * 0.25]], T(L.trim).base, 3.2 * s, 0.85);
  } else if (L.top === 'stone') {
    const pulse = 0.55 + 0.45 * Math.sin(time * 3 + f.side);
    for (const pts of [[[0.2, 0.9], [-0.3, 0.7], [0.1, 0.5], [-0.1, 0.38]], [[0.8, 0.3], [0.4, 0.5], [0.9, 0.7]], [[-0.6, 0.2], [-0.2, 0.4], [-0.7, 0.6]]]) {
      const q = pts.map(([a, c]) => [wT * a, -tLen * c]);
      softLine(g, q, L.cracks, 2.6 * s, 0.35 + pulse * 0.45);
      softLine(g, q, '#fff1c4', 0.9 * s, 0.25 + pulse * 0.4);
    }
    spot(g, -wT * 0.6, -tLen * 0.92, wT * 0.8, tLen * 0.14, L.moss, 0.7, 0.2);
    spot(g, wT * 0.3, -tLen * 0.3, wT * 0.4, tLen * 0.08, L.moss, 0.4);
    for (let i = 0; i < 9; i++) spot(g, wT * (((i * 37) % 17) / 8.5 - 1), -tLen * (((i * 23) % 13) / 13), 3 * s, 3 * s, skinT.dark, 0.35);
  } else if (L.top === 'plate') {
    for (let i = 0; i < 4; i++) softLine(g, [[-wT * 1.4, -tLen * (0.14 + i * 0.1)], [wT * 0.3, -tLen * (0.2 + i * 0.1)], [wT * 1.4, -tLen * (0.14 + i * 0.1)]], T(L.trim).base, 1.6 * s, 0.75);
    const cp = new Path2D();
    cp.moveTo(wT * 1.4, -tLen * 0.98);
    cp.quadraticCurveTo(wT * 0.1, -tLen * 0.82, wT * 0.4, -tLen * 0.56);
    cp.quadraticCurveTo(wT * 0.8, -tLen * 0.48, wT * 1.4, -tLen * 0.52);
    cp.closePath();
    paintShape(g, cp, wT * 0.8, -tLen * 0.75, wT, Lt, cT2);
    g.lineWidth = 2 * s; g.strokeStyle = rgba(T(L.trim).hi, 0.9); g.stroke(cp);
    spot(g, wT * 0.62, -tLen * 0.74, 9 * s, 9 * s, f.def.element.glow, 0.9);
  }
  // belt / waistband and the trunks below it
  if (L.belt) {
    const bt = T(L.belt);
    const band = new Path2D();
    band.rect(-wT * 1.6, -tLen * 0.17, wT * 3.2, tLen * 0.12);
    paintShape(g, band, 0, -tLen * 0.11, wT, Lt, bt);
    softLine(g, [[-wT * 1.6, -tLen * 0.05], [wT * 1.6, -tLen * 0.05]], bt.dark, 1.6 * s, 0.6);
  }
  if (!L.stone) {
    const pants = new Path2D();
    pants.rect(-wT * 1.6, -tLen * 0.05, wT * 3.2, tLen * 0.4);
    paintShape(g, pants, 0, 0, wT, Lt, T(legC));
  }
  // occlusion where the torso meets the neck and the hips
  spot(g, 0, -tLen * 0.98, wT * 0.7, tLen * 0.08, skinT.dark, 0.35);
  g.restore();
  if (L.beads) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = wT * (0.12 + 0.62 * Math.sin(t * Math.PI)) - wT * 0.12;
      const y = -tLen * (0.98 - 0.44 * Math.sin(t * Math.PI * 0.5 + 0.2) * (t < 0.5 ? t * 2 : 1));
      const bp = new Path2D();
      bp.arc(x, y, 3.7 * s, 0, Math.PI * 2);
      paintShape(g, bp, x, y, 3.7 * s, Lt, T(i === 5 ? '#d9a441' : L.beads));
    }
  }
  g.restore();

  /* ---- front leg, flaps ---- */
  leg('F', false);
  if (C.flap) clothPaint(C.flap, 21 * s * k, 9 * s * k, L.top === 'stone' ? L.belt : L.topColor, false, 0.18);

  /* ---- head ---- */
  occlude(geo.head, 12 * s, 0, 5 * s);
  const neckC = L.stone ? L.skin : L.hair.style === 'mask' ? L.mask : L.skin;
  paintSweep(g, geo.neck, T(neckC, false, isSkin(neckC)), Lv, 0);
  const r = b.head;
  g.save();
  g.translate(P.head[0], P.head[1]);
  g.rotate(geo.hAng);
  const Lh = [Lv[0] * Math.cos(-geo.hAng) - Lv[1] * Math.sin(-geo.hAng), Lv[0] * Math.sin(-geo.hAng) + Lv[1] * Math.cos(-geo.hAng)];
  const hp = geo.headLocal;
  const style = L.hair.style;
  const faceT = style === 'mask' ? T(L.mask) : skinT;
  paintShape(g, hp, 0.1 * r, -0.1 * r, r * 1.3, Lh, faceT);
  g.save();
  g.clip(hp);
  // jaw shadow and cheekbone
  spot(g, 0.25 * r, 0.78 * r, 0.7 * r, 0.25 * r, faceT.dark, 0.55);
  if (style !== 'mask') spot(g, 0.55 * r, 0.12 * r, 0.3 * r, 0.18 * r, tint(faceT.hi, 0.2), 0.35);

  const eye = (glow) => {
    spot(g, 0.6 * r, -0.12 * r, 0.26 * r, 0.16 * r, faceT.dark, style === 'mask' ? 0 : 0.6);
    if (glow) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.drawImage(glowSprite(glow, 64), 0.62 * r - 11 * s, -0.12 * r - 11 * s, 22 * s, 22 * s);
      g.restore();
      const e = new Path2D();
      e.ellipse(0.64 * r, -0.12 * r, 0.17 * r, 0.06 * r, -0.1, 0, Math.PI * 2);
      g.fillStyle = tint(glow, 0.55);
      g.fill(e);
      return;
    }
    const e = new Path2D();
    e.moveTo(0.48 * r, -0.12 * r);
    e.quadraticCurveTo(0.62 * r, -0.2 * r, 0.76 * r, -0.12 * r);
    e.quadraticCurveTo(0.62 * r, -0.06 * r, 0.48 * r, -0.12 * r);
    g.fillStyle = '#e9dfd2';
    g.fill(e);
    g.fillStyle = '#2a1a10';
    g.beginPath(); g.arc(0.68 * r, -0.125 * r, 0.05 * r, 0, Math.PI * 2); g.fill();
    softLine(g, [[0.46 * r, -0.15 * r], [0.62 * r, -0.21 * r], [0.78 * r, -0.14 * r]], '#1a0c08', 1.3 * s, 0.85);
    // brow
    softLine(g, [[0.42 * r, -0.3 * r], [0.66 * r, -0.36 * r], [0.86 * r, -0.28 * r]], style === 'long' ? '#b9b9c4' : L.hair.color === '#000' ? '#2a1a14' : shade(L.hair.color, 0.2), 2.6 * s, 0.85);
    // mouth and nostril
    softLine(g, [[0.72 * r, 0.47 * r], [0.86 * r, 0.47 * r]], '#4a1a14', 1.3 * s, 0.7);
    spot(g, 0.94 * r, 0.22 * r, 0.06 * r, 0.04 * r, '#3a120c', 0.6);
  };

  const hairCap = (color) => {
    const hc = new Path2D();
    hc.moveTo(0.74 * r, -0.56 * r);
    hc.quadraticCurveTo(0.5 * r, -1.22 * r, -0.4 * r, -1.1 * r);
    hc.quadraticCurveTo(-1.18 * r, -0.66 * r, -0.98 * r, 0.52 * r);
    hc.lineTo(-0.36 * r, 0.24 * r);
    hc.quadraticCurveTo(-0.2 * r, -0.32 * r, 0.24 * r, -0.5 * r);
    hc.closePath();
    const ht = T(color);
    paintShape(g, hc, -0.2 * r, -0.5 * r, r, Lh, ht);
    g.save();
    g.clip(hc);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      softLine(g, [[0.6 * r - t * 0.3 * r, -0.62 * r - t * 0.1 * r], [-0.1 * r - t * 0.3 * r, -1.0 * r + t * 0.2 * r], [-0.9 * r + t * 0.1 * r, -0.2 * r + t * 0.5 * r]], i % 2 ? ht.hi : ht.dark, 1.1 * s, 0.45);
    }
    g.restore();
  };

  // ear
  if (style !== 'mask' && style !== 'horns' && !L.stone) {
    const ear = new Path2D();
    ear.ellipse(-0.12 * r, 0.02 * r, 0.16 * r, 0.24 * r, 0.15, 0, Math.PI * 2);
    paintShape(g, ear, -0.12 * r, 0.02 * r, 0.2 * r, Lh, skinT);
    softLine(g, [[-0.08 * r, -0.12 * r], [-0.18 * r, 0.02 * r], [-0.1 * r, 0.16 * r]], skinT.dark, 1.2 * s, 0.6);
  }

  if (style === 'long' || style === 'ponytail') {
    eye(null);
    hairCap(L.hair.color);
    if (L.band) {
      const bp = new Path2D();
      bp.moveTo(-1.15 * r, -0.44 * r); bp.lineTo(0.95 * r, -0.52 * r); bp.lineTo(0.95 * r, -0.34 * r); bp.lineTo(-1.15 * r, -0.22 * r); bp.closePath();
      paintShape(g, bp, 0, -0.38 * r, r, Lh, T(L.band));
    }
    if (style === 'ponytail') softLine(g, [[-0.6 * r, -0.64 * r], [0.2 * r, -0.72 * r], [0.88 * r, -0.66 * r]], L.trim || '#d4a940', 2.4 * s, 0.95);
    if (L.scar) softLine(g, [[0.46 * r, -0.4 * r], [0.58 * r, -0.1 * r], [0.7 * r, 0.14 * r]], '#7a1e1e', 1.5 * s, 0.75);
  } else if (style === 'bald') {
    eye(null);
    spot(g, -0.1 * r, -0.66 * r, 0.5 * r, 0.24 * r, '#fff1dc', 0.3, -0.3);
    spot(g, 0.1 * r, -0.72 * r, 0.18 * r, 0.08 * r, '#ffffff', 0.35, -0.3);
    if (L.mark) spot(g, 0.62 * r, -0.56 * r, 0.1 * r, 0.1 * r, L.mark, 0.95);
  } else if (style === 'mask') {
    const band = new Path2D();
    band.moveTo(0.2 * r, -0.3 * r); band.lineTo(1.1 * r, -0.36 * r); band.lineTo(1.1 * r, 0.02 * r); band.lineTo(0.2 * r, 0.04 * r); band.closePath();
    paintShape(g, band, 0.6 * r, -0.15 * r, 0.5 * r, Lh, skinT);
    for (let i = 0; i < 5; i++) softLine(g, [[-r, (0.16 + i * 0.17) * r], [0.2 * r, (0.12 + i * 0.16) * r], [r, (0.08 + i * 0.17) * r]], faceT.dark, 1.5 * s, 0.45);
    for (let i = 0; i < 3; i++) softLine(g, [[-r, (-0.5 - i * 0.18) * r], [r, (-0.52 - i * 0.16) * r]], faceT.dark, 1.4 * s, 0.4);
    eye(L.glowEyes);
  } else if (style === 'none') {
    const brow = new Path2D();
    brow.moveTo(0.05 * r, -0.52 * r); brow.lineTo(1.06 * r, -0.42 * r); brow.lineTo(1.06 * r, -0.2 * r); brow.lineTo(0.05 * r, -0.28 * r); brow.closePath();
    paintShape(g, brow, 0.5 * r, -0.36 * r, 0.5 * r, Lh, T(shade(L.skin, 0.15)));
    spot(g, 0.6 * r, -0.08 * r, 0.3 * r, 0.12 * r, '#000000', 0.5);
    eye(L.glowEyes);
    softLine(g, [[-0.5 * r, -0.9 * r], [-0.2 * r, -0.4 * r], [-0.5 * r, 0.1 * r]], L.cracks, 2 * s, 0.85);
    spot(g, -0.4 * r, -0.6 * r, 0.4 * r, 0.2 * r, L.moss, 0.5);
  } else if (style === 'horns') {
    const helm = new Path2D();
    helm.moveTo(-1.1 * r, -0.2 * r);
    helm.quadraticCurveTo(-0.9 * r, -1.25 * r, 0.2 * r, -1.1 * r);
    helm.lineTo(0.95 * r, -0.4 * r); helm.lineTo(0.95 * r, -0.08 * r); helm.lineTo(0.3 * r, -0.2 * r);
    helm.lineTo(0.2 * r, 0.6 * r); helm.lineTo(-1.1 * r, 0.6 * r); helm.closePath();
    paintShape(g, helm, -0.2 * r, -0.4 * r, r, Lh, T(L.topColor));
    g.lineWidth = 1.8 * s; g.strokeStyle = rgba(T(L.trim).hi, 0.9); g.stroke(helm);
    eye(L.glowEyes);
    const beard = new Path2D();
    beard.moveTo(0.35 * r, 0.55 * r);
    beard.quadraticCurveTo(0.65 * r, 1.25 * r, 0.1 * r, 1.42 * r);
    beard.quadraticCurveTo(-0.1 * r, 1.0 * r, -0.2 * r, 0.7 * r);
    beard.closePath();
    paintShape(g, beard, 0.2 * r, 0.9 * r, 0.4 * r, Lh, T('#2a2420'));
  }
  g.restore();                                   // unclip
  if (style === 'horns') {
    for (const [ox, back] of [[-0.15 * r, true], [0.3 * r, false]]) {
      const hn = new Path2D();
      hn.moveTo(ox - 0.18 * r, -0.85 * r);
      hn.bezierCurveTo(ox - 0.9 * r, -1.3 * r, ox - 1.25 * r, -2.0 * r, ox - 0.55 * r, -2.55 * r);
      hn.bezierCurveTo(ox - 0.85 * r, -1.95 * r, ox - 0.45 * r, -1.35 * r, ox + 0.25 * r, -0.95 * r);
      hn.closePath();
      const ht = T(L.hair.color, back);
      paintShape(g, hn, ox - 0.5 * r, -1.6 * r, 0.9 * r, Lh, ht);
      g.save();
      g.clip(hn);
      for (let i = 0; i < 6; i++) softLine(g, [[ox - 0.6 * r - i * 0.06 * r, -1.0 * r - i * 0.25 * r], [ox - 0.2 * r - i * 0.08 * r, -1.0 * r - i * 0.24 * r]], ht.dark, 1.4 * s, 0.6);
      g.restore();
    }
  }
  g.restore();                                   // head frame

  /* ---- front arm ---- */
  arm('F', false);

  /* ---- elemental charge on the hands during specials ---- */
  if (f.state === 'special' && f.def.element) {
    const el = f.def.element;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin(time * 30);
    for (const q of [P.hf, P.hb]) {
      const R = 60 * s * pulse;
      g.drawImage(glowSprite(el.glow, 128), q[0] - R, q[1] - R, R * 2, R * 2);
    }
    g.restore();
  }

  /* ---- layer post: rim light, grain, silhouette ---- */
  const rim = st.rim.getContext('2d');
  const rimPass = (wpx, alpha) => {
    rim.setTransform(1, 0, 0, 1, 0, 0);
    rim.globalCompositeOperation = 'source-over';
    rim.clearRect(0, 0, W + 2, H + 2);
    rim.drawImage(st.lay, 0, 0);
    rim.globalCompositeOperation = 'source-in';
    rim.fillStyle = tint(light.rim, 0.25);
    rim.fillRect(0, 0, W, H);
    rim.globalCompositeOperation = 'destination-out';
    // remove every pixel whose neighbour toward the key light is inside: what remains is the far edge
    rim.drawImage(st.lay, Lv[0] * wpx, Lv[1] * wpx);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha;
    g.drawImage(st.rim, 0, 0);
  };
  if (!lite) rimPass(Math.max(1.5, 3.2 * s * pxe), 0.85);
  // painterly grain, only where the fighter is
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.09;
  g.fillStyle = g.createPattern(grainCanvas(), 'repeat');
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  const sg = st.sil.getContext('2d');
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'source-over';
  sg.clearRect(0, 0, W + 2, H + 2);
  sg.drawImage(st.lay, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = mix(light.ambient, '#000000', 0.75);
  sg.fillRect(0, 0, W, H);
  sg.globalCompositeOperation = 'source-over';
  st.ready = true;
}

export function drawShadow(g, f) {
  if (f.hidden) return;
  const h = Math.max(0, f.y);
  const k = Math.max(0.35, 1 - h / 420);
  const w = 74 * f.body.scale * Math.sqrt(f.body.bulk) * k;
  g.save();
  g.globalAlpha = 0.6 * k * f.alpha;
  g.translate(f.x + (f.skel.hip ? f.skel.hip[0] * f.facing * 0.5 : 0), 2);
  g.scale(1, 0.17);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, w);
  gr.addColorStop(0, 'rgba(0,0,0,0.9)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, w, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
