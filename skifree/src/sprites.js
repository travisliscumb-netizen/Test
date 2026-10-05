// Static scenery, drawn as vector art once per (type, variant, state, scale)
// into an offscreen canvas and then blitted. Every sprite's origin is its
// footprint on the snow, so y-sorting and collision share one point.
import { C } from './palette.js';
import { SIGNS } from './objects.js';
import { Rng } from './rng.js';

const TAU = Math.PI * 2;

// Bounds of each sprite relative to its origin: [left, top, width, height].
const BOUNDS = {
  tree_s: [-20, -50, 44, 56],
  tree_m: [-26, -68, 56, 74],
  tree_l: [-34, -92, 72, 98],
  tree_snowy: [-29, -78, 62, 84],
  tree_dead: [-22, -66, 48, 72],
  rock_s: [-14, -14, 30, 20],
  rock_l: [-22, -24, 46, 30],
  stump: [-11, -12, 24, 18],
  mogul: [-20, -8, 42, 16],
  snowpile: [-20, -20, 42, 26],
  snowman: [-18, -44, 38, 50],
  ramp: [-26, -30, 54, 38],
  flag_red: [-4, -40, 22, 44],
  flag_blue: [-4, -40, 22, 44],
  sign: [-34, -46, 68, 52],
  lift_tower: [-18, -160, 36, 166],
  banner: [-204, -74, 408, 82],
};

export function spriteBounds(t) {
  return BOUNDS[t];
}

export class SpriteCache {
  constructor() {
    this.scale = 0;
    this.map = new Map();
  }

  // Pixel density changed (zoom or DPR): throw everything away.
  setScale(s) {
    // Quantise so tiny zoom changes don't thrash the cache.
    const q = Math.max(0.5, Math.round(s * 8) / 8);
    if (q !== this.scale) {
      this.scale = q;
      this.map.clear();
    }
  }

  get(o) {
    const key = o.t + ':' + variant(o) + ':' + (o.state ? 1 : 0) + (o.fall || 0);
    let spr = this.map.get(key);
    if (!spr) {
      spr = this.build(o);
      this.map.set(key, spr);
    }
    return spr;
  }

  build(o) {
    const [bx, by, bw, bh] = BOUNDS[o.t];
    const s = this.scale;
    const cv = makeCanvas(Math.ceil(bw * s) + 2, Math.ceil(bh * s) + 2);
    const ctx = cv.getContext('2d');
    ctx.scale(s, s);
    ctx.translate(-bx + 1 / s, -by + 1 / s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawStatic(ctx, o);
    return { cv, x: bx - 1 / s, y: by - 1 / s, w: cv.width / s, h: cv.height / s };
  }
}

// Signs store which face they show in `v`; everything else has 4 looks.
const variant = (o) => (o.t === 'sign' ? o.v : o.v & 3);

export function makeCanvas(w, h) {
  // A plain canvas where there is a DOM: older Safari can't blit OffscreenCanvas.
  if (typeof document === 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

// ---------------------------------------------------------------- helpers

function ellipse(ctx, x, y, rx, ry, fill, stroke, lw = 1.3) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// Soft-edged contact shadow (baked into the cached sprite, so it's free).
function shadow(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.2);
  g.addColorStop(0, 'rgba(38, 66, 112, 0.3)');
  g.addColorStop(0.55, 'rgba(38, 66, 112, 0.18)');
  g.addColorStop(1, 'rgba(38, 66, 112, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx * 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Lightens (f > 0) or darkens (f < 0) a #rrggbb colour.
function tint(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f > 0 ? c + (255 - c) * f : c * (1 + f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function poly(ctx, pts, fill, stroke, lw = 1.3) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// ------------------------------------------------------------- scenery

export function drawStatic(ctx, o) {
  const v = variant(o);
  switch (o.t) {
    case 'tree_s':
      return pine(ctx, 30, 46, 3, false, v);
    case 'tree_m':
      return pine(ctx, 40, 62, 4, false, v);
    case 'tree_l':
      return pine(ctx, 54, 86, 5, false, v);
    case 'tree_snowy':
      return pine(ctx, 46, 72, 4, true, v);
    case 'tree_dead':
      return o.state ? deadTreeSnapped(ctx, v) : deadTree(ctx, v);
    case 'rock_s':
      return rock(ctx, 11, 9, v);
    case 'rock_l':
      return rock(ctx, 18, 16, v + 7);
    case 'stump':
      return stump(ctx);
    case 'mogul':
      return mogul(ctx, v);
    case 'snowpile':
      return snowpile(ctx, v);
    case 'snowman':
      return o.state ? snowmanSmashed(ctx, v) : snowman(ctx, v);
    case 'ramp':
      return ramp(ctx);
    case 'flag_red':
      return flag(ctx, C.red, o.state, o.fall);
    case 'flag_blue':
      return flag(ctx, C.blue, o.state, o.fall);
    case 'sign':
      return o.state ? signDown(ctx, o.v) : sign(ctx, o.v);
    case 'lift_tower':
      return liftTower(ctx);
    case 'banner':
      return banner(ctx, o.v);
  }
}

function pine(ctx, w, h, tiers, snowy, v) {
  const rng = new Rng(1000 + v * 17 + w);
  shadow(ctx, w * 0.14, 1, w * 0.55, w * 0.19);
  // Snow drifted up around the base, with a little ambient occlusion.
  ellipse(ctx, 0, 0.5, w * 0.3, w * 0.09, 'rgba(70, 100, 150, 0.22)');
  // Trunk, rounded by a gradient.
  const tg = ctx.createLinearGradient(-w * 0.07, 0, w * 0.07, 0);
  tg.addColorStop(0, '#8a5a32');
  tg.addColorStop(1, C.trunkDark);
  ctx.fillStyle = tg;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(-w * 0.07, -h * 0.16, w * 0.14, h * 0.17);
  ctx.fill();
  ctx.stroke();

  const lean = rng.range(-1.5, 1.5);
  const hueJitter = [C.tree, '#256f42', '#1f643a', '#2a7446'][v];
  const top = -h;
  const base = -h * 0.12;
  const span = base - top;
  // Bottom tier first; each higher tier overlaps the one below.
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const yb = base - span * f * 0.78;
    const yt = i === tiers - 1 ? top : yb - span * 0.42;
    const hw = (w / 2) * (1 - f * 0.72) * rng.range(0.94, 1.04);
    const cx = lean * f;
    // Scalloped skirt.
    const pts = [cx + lean * 0.4, yt];
    const sc = 3;
    for (let k = 0; k <= sc; k++) {
      const x = cx + hw - (2 * hw * k) / sc;
      pts.push(x, yb + (k % 2 ? 1.5 : -0.5));
      if (k < sc) pts.push(x - hw / sc, yb - 2.5);
    }
    // The tier above casts a soft shadow onto this one's needles.
    if (i > 0) ellipse(ctx, cx + 1, yb + 1, hw * 0.9, 2.6, 'rgba(8, 40, 22, 0.28)');
    // Needles: lit from the upper left, deep green in the shade.
    const fg = ctx.createLinearGradient(cx - hw, yt, cx + hw, yb);
    fg.addColorStop(0, tint(hueJitter, 0.22));
    fg.addColorStop(0.55, hueJitter);
    fg.addColorStop(1, tint(hueJitter, -0.35));
    poly(ctx, pts, fg, C.outline, 1.3);
    // Rim light down the sunny edge.
    ctx.beginPath();
    ctx.moveTo(cx + lean * 0.4 - 0.6, yt + 2);
    ctx.lineTo(cx - hw * 0.8, yb - 2.2);
    ctx.strokeStyle = 'rgba(190, 240, 200, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (snowy) {
      const sy = yt + (yb - yt) * 0.52;
      poly(
        ctx,
        [cx + lean * 0.4, yt, cx + hw * 0.52, sy, cx + hw * 0.22, sy - 2, cx, sy + 1.5, cx - hw * 0.25, sy - 1.5, cx - hw * 0.52, sy],
        '#ffffff',
        C.outline,
        1.1,
      );
    } else if (i === tiers - 1 || rng.chance(0.55)) {
      // A dusting on the tips.
      ellipse(ctx, cx - hw * 0.55, yb - 1.8, hw * 0.28, 1.4, '#ffffff');
    }
  }
  // Drift heaped against the trunk, in front of the lowest needles.
  const dg = ctx.createLinearGradient(0, -5, 0, 2);
  dg.addColorStop(0, '#ffffff');
  dg.addColorStop(1, '#dde8f4');
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, 1.5);
  ctx.quadraticCurveTo(-w * 0.1, -h * 0.05, 0, -h * 0.045);
  ctx.quadraticCurveTo(w * 0.12, -h * 0.06, w * 0.22, 1.5);
  ctx.closePath();
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 150, 195, 0.6)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function deadTree(ctx, v) {
  const rng = new Rng(200 + v);
  shadow(ctx, 6, 1, 16, 5);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 5.2;
  const branches = [];
  const trunkTop = -58 + rng.range(-4, 4);
  branches.push([0, 0, rng.range(-3, 3), trunkTop]);
  for (let i = 0; i < 5; i++) {
    const y = -18 - i * 8 - rng.range(0, 4);
    const dir = i % 2 ? 1 : -1;
    const len = rng.range(10, 18) * (1 - i * 0.1);
    branches.push([0, y, dir * len, y - rng.range(8, 14)]);
    if (rng.chance(0.6)) branches.push([dir * len * 0.6, y - 5, dir * (len * 0.6 + 6), y - 14]);
  }
  for (const pass of [[C.outline, 5], [C.trunkDark, 3.2]]) {
    ctx.strokeStyle = pass[0];
    ctx.lineWidth = pass[1];
    for (const [x0, y0, x1, y1] of branches) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.lineWidth = pass[1] + 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(branches[0][2], trunkTop);
    ctx.stroke();
  }
  ctx.strokeStyle = '#8a5a32';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-1, -2);
  ctx.lineTo(branches[0][2] - 1, trunkTop + 4);
  ctx.stroke();
  // Snow sitting on a couple of branches.
  for (let i = 1; i < branches.length; i += 2) {
    const b = branches[i];
    ellipse(ctx, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2 - 1.8, 3, 1.3, '#ffffff');
  }
}

// What's left after the yeti runs through one.
function deadTreeSnapped(ctx, v) {
  shadow(ctx, 4, 1, 16, 4);
  ctx.save();
  ctx.translate(2, -2);
  ctx.rotate(v % 2 ? 1.35 : -1.35);
  for (const pass of [[C.outline, 5], [C.trunkDark, 3.2]]) {
    ctx.strokeStyle = pass[0];
    ctx.lineWidth = pass[1];
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -34);
    ctx.moveTo(0, -16);
    ctx.lineTo(7, -24);
    ctx.moveTo(0, -24);
    ctx.lineTo(-6, -31);
    ctx.stroke();
  }
  ctx.restore();
  // Splintered stump.
  poly(ctx, [-4, 0, -4, -7, -2, -5, 0, -9, 2, -5, 4, -8, 4, 0], C.trunk, C.outline, 1.2);
}

function rock(ctx, rx, ry, v) {
  const rng = new Rng(300 + v);
  shadow(ctx, 3, 1, rx * 1.05, ry * 0.35);
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.15, 0.15);
    const r = rng.range(0.82, 1.08);
    // Flat bottom, domed top.
    const y = Math.sin(a) > 0 ? Math.sin(a) * ry * 0.22 : Math.sin(a) * ry * r;
    pts.push(Math.cos(a) * rx * r, y - ry * 0.12);
  }
  const rg = ctx.createLinearGradient(-rx, -ry, rx, ry * 0.3);
  rg.addColorStop(0, C.rockLight);
  rg.addColorStop(0.5, C.rock);
  rg.addColorStop(1, C.rockDark);
  poly(ctx, pts, rg, C.outline, 1.4);
  // Shaded underside.
  ctx.save();
  ctx.clip();
  ellipse(ctx, rx * 0.35, 0, rx, ry * 0.45, C.rockDark);
  ellipse(ctx, -rx * 0.35, -ry * 0.62, rx * 0.5, ry * 0.3, C.rockLight);
  // Snow cap.
  ellipse(ctx, -rx * 0.1, -ry * 0.95, rx * 0.62, ry * 0.3, '#ffffff');
  ctx.restore();
  poly(ctx, pts, null, C.outline, 1.4);
}

function stump(ctx) {
  shadow(ctx, 3, 1, 10, 3.5);
  ctx.fillStyle = C.trunk;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-8, 0);
  ctx.ellipse(0, 0, 8, 3, 0, Math.PI, 0, true);
  ctx.lineTo(8, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, 0, -6, 8, 3.2, '#d9a86b', C.outline, 1.3);
  ellipse(ctx, 0, -6, 4.5, 1.7, null, '#a9743f', 0.8);
  ellipse(ctx, -1.5, -7, 4, 1.5, '#ffffff');
}

function mogul(ctx, v) {
  const w = 17 + v;
  const g = ctx.createRadialGradient(-w * 0.3, -5, 1, 0, -1, w);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#eef4fb');
  g.addColorStop(1, 'rgba(205, 220, 238, 0)');
  ellipse(ctx, 0, -1, w, 6.5, g);
  // Shadowed downhill face.
  ctx.beginPath();
  ctx.ellipse(1, 0.5, w * 0.82, 4.5, 0, 0.1, Math.PI - 0.1);
  ctx.strokeStyle = 'rgba(120, 150, 190, 0.45)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-2, -2.5, w * 0.55, 3, 0, Math.PI + 0.3, TAU - 0.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// A heaped pile of snow: taller and lumpier than a mogul, with blue shade.
function snowpile(ctx, v) {
  const rng = new Rng(500 + v);
  shadow(ctx, 3, 1, 17, 5);
  const pts = [];
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const r = rng.range(0.85, 1.1);
    pts.push(Math.cos(a) * 16 * r, Math.sin(a) * 15 * r * (0.7 + 0.3 * Math.sin((i / n) * Math.PI)) + 1);
  }
  const g = ctx.createLinearGradient(-10, -16, 10, 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#eef4fb');
  g.addColorStop(1, '#c8d8ec');
  poly(ctx, pts, g, 'rgba(110, 140, 185, 0.9)', 1.3);
  ellipse(ctx, -5, -10, 5, 2.5, 'rgba(255,255,255,0.9)');
  ellipse(ctx, 6, -3, 7, 2.2, 'rgba(150, 180, 220, 0.35)');
}

const SCARVES = ['#e0393e', '#2f6fd6', '#2fa860', '#8e4ad6'];

function snowman(ctx, v) {
  shadow(ctx, 3, 1, 12, 4);
  const ball = (y, r) => {
    ellipse(ctx, 0, y, r, r * 0.95, '#ffffff', C.outline, 1.3);
    ellipse(ctx, r * 0.3, y + r * 0.3, r * 0.6, r * 0.5, 'rgba(160, 185, 215, 0.35)');
  };
  ball(-8, 9);
  // Arms.
  ctx.strokeStyle = C.trunkDark;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -21);
  ctx.lineTo(-15, -27 - v);
  ctx.moveTo(-12, -25 - v * 0.6);
  ctx.lineTo(-14, -30 - v);
  ctx.moveTo(6, -21);
  ctx.lineTo(15, -25 + v);
  ctx.stroke();
  ball(-21, 7);
  ball(-32, 5.2);
  // Scarf.
  ctx.fillStyle = SCARVES[v];
  ctx.fillRect(-5, -28, 10, 2.4);
  ctx.fillRect(1.5, -28, 2.4, 7);
  // Buttons, eyes, carrot.
  for (const y of [-23, -19, -11, -6]) ellipse(ctx, 0, y, 0.9, 0.9, C.outline);
  ellipse(ctx, -1.8, -33.5, 0.8, 0.8, C.outline);
  ellipse(ctx, 1.8, -33.5, 0.8, 0.8, C.outline);
  poly(ctx, [0.5, -32, 7, -31, 0.5, -30.2], C.carrot, C.outline, 0.7);
  // Hat.
  ctx.fillStyle = C.outline;
  ctx.fillRect(-6, -37.4, 12, 1.8);
  ctx.fillRect(-4, -43, 8, 6);
  ctx.fillStyle = SCARVES[(v + 1) & 3];
  ctx.fillRect(-4, -38.8, 8, 1.4);
}

function snowmanSmashed(ctx, v) {
  const rng = new Rng(400 + v);
  shadow(ctx, 3, 1, 15, 4);
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-13, 13), y = rng.range(-6, 2);
    const r = rng.range(2.5, 5.5);
    ellipse(ctx, x, y, r, r * 0.7, '#ffffff', C.outline, 1);
  }
  poly(ctx, [6, -3, 13, -1, 6, 0], C.carrot, C.outline, 0.7);
  ctx.save();
  ctx.translate(-8, -3);
  ctx.rotate(-0.5);
  ctx.fillStyle = C.outline;
  ctx.fillRect(-5, 0, 10, 1.6);
  ctx.fillRect(-3.5, -5, 7, 5);
  ctx.restore();
}

// A snow kicker: a long ramp rising towards the camera, ending in a steep lip.
function ramp(ctx) {
  shadow(ctx, 4, 4, 24, 6);
  // Run-in: rises from the snow at the back to the lip at the front.
  const g = ctx.createLinearGradient(0, -26, 0, -6);
  g.addColorStop(0, '#f2f7fd');
  g.addColorStop(1, '#ffffff');
  poly(ctx, [-13, -26, 13, -26, 22, -6, -22, -6], g, C.outline, 1.5);
  // Groomer corduroy.
  ctx.strokeStyle = 'rgba(140, 170, 210, 0.5)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(-13 - 9 * t + 2, -26 + 20 * t);
    ctx.lineTo(13 + 9 * t - 2, -26 + 20 * t);
    ctx.stroke();
  }
  // The lip: a shadowed wall facing downhill.
  poly(ctx, [-22, -6, 22, -6, 20, 2, -20, 2], '#8fb2dc', C.outline, 1.5);
  // Hazard chevrons along the edge so it reads at speed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-21, -6.5, 42, 3);
  ctx.clip();
  ctx.fillStyle = '#f28a1e';
  ctx.fillRect(-22, -7, 44, 4);
  ctx.fillStyle = C.outline;
  for (let x = -22; x < 22; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, -3);
    ctx.lineTo(x + 3, -7);
    ctx.lineTo(x + 6, -7);
    ctx.lineTo(x + 3, -3);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-21, -6.5, 42, 3);
}

function flag(ctx, color, down, fall = 1) {
  if (down) {
    ctx.save();
    ctx.rotate(fall * 1.3);
    ctx.translate(0, 2);
  } else {
    shadow(ctx, 3, 1, 5, 1.8);
  }
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -36);
  ctx.stroke();
  ctx.strokeStyle = '#f4f6f9';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  poly(ctx, [0.5, -36, 15, -31, 0.5, -25], color, C.outline, 1.1);
  if (down) ctx.restore();
}

const SIGN_STYLE = [
  { bg: '#2f6fd6', fg: '#ffffff' }, // SLALOM
  { bg: '#2fa860', fg: '#ffffff' }, // TREE SLALOM
  { bg: '#f28a1e', fg: '#ffffff' }, // FREESTYLE
  { bg: '#ffffff', fg: '#1d2533', check: true }, // FINISH
  { bg: '#ffcf33', fg: '#1d2533', diamond: true }, // YETI XING
  { bg: '#e0393e', fg: '#ffffff' }, // SKIFREE
];

function sign(ctx, v) {
  const text = SIGNS[v] ?? '';
  const st = SIGN_STYLE[v] ?? SIGN_STYLE[0];
  shadow(ctx, 3, 1, 10, 3);
  ctx.fillStyle = C.woodDark;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(-1.6, -30, 3.2, 30);
  ctx.fill();
  ctx.stroke();
  ctx.font = '800 7px system-ui, -apple-system, "Segoe UI", sans-serif';
  const tw = Math.max(22, ctx.measureText(text).width + 8);
  if (st.diamond) {
    poly(ctx, [0, -45, 15, -32, 0, -19, -15, -32], st.bg, C.outline, 1.5);
    // A tiny yeti silhouette, arms up.
    ctx.fillStyle = st.fg;
    ctx.beginPath();
    ctx.ellipse(0, -31, 3.4, 4.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -36.6, 2.3, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = st.fg;
    ctx.beginPath();
    ctx.moveTo(-2.5, -33);
    ctx.lineTo(-6, -38);
    ctx.moveTo(2.5, -33);
    ctx.lineTo(6, -38);
    ctx.moveTo(-1.5, -27.5);
    ctx.lineTo(-2.5, -24.5);
    ctx.moveTo(1.5, -27.5);
    ctx.lineTo(2.5, -24.5);
    ctx.stroke();
    ctx.font = '800 5px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = C.outline;
    ctx.textAlign = 'center';
    ctx.fillText('YETI XING', 0, -12.5);
    return;
  }
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-tw / 2, -40, tw, 13, 2.5);
  else ctx.rect(-tw / 2, -40, tw, 13);
  ctx.fillStyle = st.bg;
  ctx.fill();
  if (st.check) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C.outline;
    for (let x = -tw / 2, i = 0; x < tw / 2; x += 3.25, i++) {
      ctx.fillRect(x, i % 2 ? -40 : -30, 3.25, 3);
    }
    ctx.restore();
  }
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = st.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -33.2);
}

function signDown(ctx, v) {
  ctx.save();
  ctx.translate(0, -2);
  ctx.rotate(1.25);
  ctx.translate(0, 2);
  sign(ctx, v);
  ctx.restore();
}

// A START / FINISH arch spanning a course: two poles and a fabric strip.
function banner(ctx, finish) {
  const half = 192;
  for (const x of [-half, half]) {
    shadow(ctx, x + 6, 1, 8, 3);
    ctx.fillStyle = C.steel;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(x - 2, -64, 4, 64);
    ctx.fill();
    ctx.stroke();
  }
  // Fabric, sagging slightly, with a gentle shade.
  const top = -66, hgt = 16;
  const g = ctx.createLinearGradient(0, top, 0, top + hgt);
  const base = finish ? '#1d2533' : C.red;
  g.addColorStop(0, finish ? '#3a4458' : '#f05a5e');
  g.addColorStop(1, base);
  ctx.beginPath();
  ctx.moveTo(-half, top);
  ctx.quadraticCurveTo(0, top + 6, half, top);
  ctx.lineTo(half, top + hgt);
  ctx.quadraticCurveTo(0, top + hgt + 6, -half, top + hgt);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (finish) {
    // Chequered ends.
    ctx.save();
    ctx.clip();
    for (const sx of [-half, half - 40]) {
      for (let x = 0; x < 40; x += 5) {
        for (let y = 0; y < hgt + 8; y += 5) {
          if (((x + y) / 5) % 2) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx + x, top + y - 2, 5, 5);
        }
      }
    }
    ctx.restore();
  }
  ctx.font = '900 11px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(finish ? 'FINISH' : 'START', 0, top + hgt / 2 + 3);
}

function liftTower(ctx) {
  shadow(ctx, 16, 2, 16, 3.5);
  // Concrete footing.
  ellipse(ctx, 0, 0, 7, 2.5, '#9aa3b0', C.outline, 1.2);
  // Mast.
  ctx.fillStyle = C.steel;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3.5, 0);
  ctx.lineTo(-2.2, -150);
  ctx.lineTo(2.2, -150);
  ctx.lineTo(3.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.steelDark;
  ctx.fillRect(0.6, -148, 1.8, 146);
  // Crossarm with sheaves.
  ctx.beginPath();
  ctx.rect(-15, -154, 30, 4);
  ctx.fillStyle = C.steelDark;
  ctx.fill();
  ctx.stroke();
  for (const x of [-13, 13]) ellipse(ctx, x, -150, 2.4, 2.4, '#2d333d', C.outline, 1);
  // Ladder rungs.
  ctx.strokeStyle = 'rgba(29, 37, 51, 0.5)';
  ctx.lineWidth = 0.7;
  for (let y = -12; y > -140; y -= 9) {
    ctx.beginPath();
    ctx.moveTo(-3, y);
    ctx.lineTo(-5.5, y);
    ctx.stroke();
  }
}
