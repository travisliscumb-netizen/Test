// Real-time 3D renderer (three.js / WebGL). Draws the exact same simulation
// as the 2D renderer: the game never knows which one is on screen.
//
// Coordinates: simulation units (METER per metre) map to metres in three.js.
// Sim x -> three X, sim y (downhill) -> three +Z, height -> three +Y.
//
// Static scenery is drawn with one InstancedMesh per object type (merged,
// vertex-coloured low-poly geometry), so a forest costs a handful of draw
// calls. Characters are small articulated groups animated procedurally.
// A transparent 2D canvas on top carries popups, the yeti marker and grading.
import * as THREE from '../vendor/three.min.js';
import { CONFIG, METER } from './config.js';
import { OBJECTS, SIGNS } from './objects.js';
import { OUTFITS, DOG_COATS, C } from './palette.js';
import { hash } from './rng.js';

const S = 1 / METER; // sim units -> metres
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const col = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------ geometry kit

// Paints a geometry with one vertex colour (for merging into one mesh).
function paint(geo, hex, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = col(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? ((hash(seed, (i / 3) | 0) & 255) / 255 - 0.5) * jitter : 0;
    arr[i * 3] = clamp(c.r + j, 0, 1);
    arr[i * 3 + 1] = clamp(c.g + j, 0, 1);
    arr[i * 3 + 2] = clamp(c.b + j, 0, 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function at(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}

// Concatenates non-indexed, painted geometries into one.
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    if (!p.attributes.normal) p.computeVertexNormals();
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    colr.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.computeBoundingSphere();
  return g;
}

const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg, 1);
const cyl = (r0, r1, h, seg = 7) => new THREE.CylinderGeometry(r0, r1, h, seg, 1);
const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function pineGeo(h, w, tiers, snowy, v) {
  const parts = [paint(at(cyl(w * 0.08, w * 0.1, h * 0.22), 0, h * 0.11, 0), '#6d4526')];
  const greens = ['#23693f', '#256f42', '#1f643a', '#2a7446'];
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const r = (w / 2) * (1 - f * 0.68);
    const th = h * 0.42;
    const y = h * 0.16 + (h * 0.78 - th * 0.5) * f + th / 2;
    parts.push(paint(at(cone(r, th, 8), 0, y, 0, 0, (i * 0.7 + v) % TAU), greens[(v + i) & 3], 0.06, v * 31 + i));
    if (snowy || i === tiers - 1) {
      parts.push(paint(at(cone(r * 0.55, th * 0.45, 8), 0, y + th * 0.28, 0, 0, i * 0.4), '#ffffff'));
    }
  }
  // A drift banked against the trunk.
  parts.push(paint(at(ball(w * 0.26, 1), 0, 0, 0, 0, 0, 0, 1, 0.28, 1), '#f4f8fd'));
  return merge(parts);
}

function deadTreeGeo(snapped) {
  const parts = [];
  if (snapped) {
    parts.push(paint(at(cyl(0.16, 0.2, 0.5), 0, 0.25, 0), '#6d4526'));
    parts.push(paint(at(cyl(0.1, 0.15, 3.4), 0, 0.2, 1.8, Math.PI / 2 - 0.05, 0, 0), '#4a2e18'));
    return merge(parts);
  }
  parts.push(paint(at(cyl(0.1, 0.2, 4.2), 0, 2.1, 0), '#4a2e18'));
  for (let i = 0; i < 5; i++) {
    const y = 1.3 + i * 0.55, a = i * 2.2;
    parts.push(paint(at(cyl(0.04, 0.07, 1.2 - i * 0.12), Math.cos(a) * 0.35, y + 0.3, Math.sin(a) * 0.35, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8), '#5a3820'));
  }
  return merge(parts);
}

function rockGeo(r) {
  return merge([
    paint(at(ball(r, 0), 0, r * 0.35, 0, 0.3, 0.7, 0, 1.2, 0.7, 1), '#8b94a4', 0.12, r * 100),
    paint(at(ball(r * 0.75, 0), -r * 0.1, r * 0.72, -r * 0.1, 0, 0.4, 0, 1, 0.32, 1), '#ffffff'),
  ]);
}

function snowmanGeo(smashed) {
  if (smashed) {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(paint(at(ball(0.18 + (i % 3) * 0.06, 0), Math.cos(i * 1.7) * 0.5, 0.08, Math.sin(i * 1.7) * 0.5), '#ffffff'));
    parts.push(paint(at(cone(0.05, 0.25, 6), 0.3, 0.06, 0.1, 0, 0, Math.PI / 2), '#f08a24'));
    parts.push(paint(at(cyl(0.16, 0.16, 0.25), -0.35, 0.1, 0.2, 0.5, 0, 0.6), '#1d2533'));
    return merge(parts);
  }
  return merge([
    paint(at(ball(0.55, 1), 0, 0.5, 0), '#ffffff'),
    paint(at(ball(0.42, 1), 0, 1.25, 0), '#ffffff'),
    paint(at(ball(0.3, 1), 0, 1.85, 0), '#ffffff'),
    paint(at(cone(0.05, 0.3, 6), 0, 1.85, 0.4, Math.PI / 2, 0, 0), '#f08a24'),
    paint(at(cyl(0.24, 0.24, 0.05), 0, 2.08, 0), '#1d2533'),
    paint(at(cyl(0.17, 0.17, 0.3), 0, 2.25, 0), '#1d2533'),
    paint(at(cyl(0.33, 0.33, 0.1), 0, 1.55, 0), '#e0393e'),
    paint(at(cyl(0.02, 0.02, 0.7), -0.5, 1.4, 0, 0, 0, 1.1), '#4a2e18'),
    paint(at(cyl(0.02, 0.02, 0.7), 0.5, 1.45, 0, 0, 0, -1.2), '#4a2e18'),
  ]);
}

function rampGeo() {
  // A kicker rising toward downhill (+Z), with an orange lip.
  const w = 2.6, l = 2.8, h = 0.75;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(l, 0);
  shape.lineTo(l, h);
  shape.quadraticCurveTo(l * 0.5, h * 0.25, 0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 6 });
  // Rotate so the shape's length runs downhill (+Z), then centre it.
  at(g, w / 2, 0, -l / 2, 0, -Math.PI / 2, 0);
  return merge([
    paint(g, '#e8f1fb'),
    paint(at(box(w + 0.05, 0.12, 0.12), 0, h - 0.04, l / 2), '#f28a1e'),
    paint(at(cyl(0.04, 0.04, 1.1), -w / 2 - 0.1, 0.55, l / 2), '#f28a1e'),
    paint(at(cyl(0.04, 0.04, 1.1), w / 2 + 0.1, 0.55, l / 2), '#f28a1e'),
  ]);
}

function flagGeo(color, down) {
  const g = merge([paint(at(cyl(0.03, 0.03, 2.2), 0, 1.1, 0), '#f4f6f9'), paint(at(new THREE.PlaneGeometry(0.8, 0.55), 0.42, 1.9, 0), color)]);
  if (down) at(g, 0, 0.05, 0, 0, 0, 1.45);
  return g;
}

function towerGeo() {
  return merge([
    paint(at(cyl(0.18, 0.28, 13.5), 0, 6.75, 0), '#7c8796'),
    paint(at(box(1.9, 0.25, 0.25), 0, 13.5, 0), '#4d5664'),
    paint(at(cyl(0.45, 0.55, 0.3), 0, 0.15, 0), '#9aa3b0'),
  ]);
}

const STATIC = {
  tree_s: () => pineGeo(3.0, 1.9, 3, false, 0),
  tree_m: () => pineGeo(4.2, 2.5, 4, false, 1),
  tree_l: () => pineGeo(5.8, 3.3, 5, false, 2),
  tree_snowy: () => pineGeo(4.8, 2.9, 4, true, 3),
  tree_dead: () => deadTreeGeo(false),
  tree_dead_x: () => deadTreeGeo(true),
  rock_s: () => rockGeo(0.55),
  rock_l: () => rockGeo(0.95),
  stump: () => merge([paint(at(cyl(0.38, 0.45, 0.45, 9), 0, 0.22, 0), '#6d4526'), paint(at(cyl(0.36, 0.36, 0.06, 9), 0, 0.47, 0), '#ffffff')]),
  mogul: () => paint(at(ball(1, 2), 0, -0.05, 0, 0, 0, 0, 1.0, 0.3, 0.75), '#f5f9fe'),
  snowpile: () => merge([paint(at(ball(0.85, 1), 0, 0, 0, 0, 0.5, 0, 1, 0.65, 0.9), '#ffffff'), paint(at(ball(0.5, 1), 0.35, 0.25, -0.2), '#f3f7fc')]),
  snowman: () => snowmanGeo(false),
  snowman_x: () => snowmanGeo(true),
  ramp: () => rampGeo(),
  flag_red: () => flagGeo('#e0393e', false),
  flag_red_x: () => flagGeo('#e0393e', true),
  flag_blue: () => flagGeo('#2f6fd6', false),
  flag_blue_x: () => flagGeo('#2f6fd6', true),
  lift_tower: () => towerGeo(),
  poop: () => merge([paint(at(ball(0.13, 1), 0, 0.06, 0, 0, 0, 0, 1, 0.6, 1), '#6b4526'), paint(at(ball(0.09, 1), 0, 0.14, 0, 0, 0, 0, 1, 0.7, 1), '#7d5230'), paint(at(cone(0.06, 0.1, 6), 0, 0.22, 0), '#8c5e37')]),
  chair: () => merge([
    paint(at(cyl(0.03, 0.03, 2.4), 0, -1.2, 0), '#2d333d'),
    paint(at(box(1.1, 0.08, 0.45), 0, -2.4, 0), '#3a4250'),
    paint(at(box(1.1, 0.4, 0.06), 0, -2.2, -0.22), '#3a4250'),
  ]),
};

// Which instanced mesh draws an object in its current state.
function staticKey(o) {
  if (o.state) {
    if (o.t === 'snowman') return 'snowman_x';
    if (o.t === 'tree_dead') return 'tree_dead_x';
    if (o.t === 'flag_red' || o.t === 'flag_blue') return o.t + '_x';
  }
  return o.t;
}

// ----------------------------------------------------------- characters

const matCache = new Map();
function mat(hex, opts) {
  const k = hex + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
    matCache.set(k, m);
  }
  return m;
}
function part(geo, hex, parent, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, mat(hex, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
// A pivot group so limbs rotate about a joint.
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function buildSkier(outfit, board = false) {
  const [jacket, pants, hat, skis] = OUTFITS[outfit % OUTFITS.length];
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0); // leans and tricks rotate this
  const r = { root, body, board };
  if (board) {
    r.board = part(box(0.32, 0.04, 1.5), skis, body, 0, 0.03, 0);
    r.board.rotation.y = Math.PI / 2;
  } else {
    r.skiL = part(box(0.09, 0.035, 1.7), skis, body, -0.13, 0.02, 0.15);
    r.skiR = part(box(0.09, 0.035, 1.7), skis, body, 0.13, 0.02, 0.15);
  }
  r.hips = joint(body, 0, 0.62, 0);
  r.legL = joint(r.hips, -0.12, 0, 0);
  r.legR = joint(r.hips, 0.12, 0, 0);
  part(box(0.15, 0.6, 0.17), pants, r.legL, 0, -0.3, 0);
  part(box(0.15, 0.6, 0.17), pants, r.legR, 0, -0.3, 0);
  r.torso = joint(r.hips, 0, 0, 0);
  part(new THREE.CapsuleGeometry(0.21, 0.3, 4, 8), jacket, r.torso, 0, 0.36, 0);
  part(box(0.44, 0.06, 0.3), '#ffffff', r.torso, 0, 0.3, 0); // jacket stripe
  r.armL = joint(r.torso, -0.25, 0.55, 0);
  r.armR = joint(r.torso, 0.25, 0.55, 0);
  part(box(0.11, 0.45, 0.12), jacket, r.armL, 0, -0.22, 0);
  part(box(0.11, 0.45, 0.12), jacket, r.armR, 0, -0.22, 0);
  if (!board) {
    const pl = part(cyl(0.015, 0.015, 1.1, 4), '#2d333d', r.armL, 0, -0.75, -0.2);
    pl.rotation.x = 0.5;
    const pr = part(cyl(0.015, 0.015, 1.1, 4), '#2d333d', r.armR, 0, -0.75, -0.2);
    pr.rotation.x = 0.5;
  }
  r.head = joint(r.torso, 0, 0.82, 0);
  part(ball(0.17, 1), C.skin, r.head, 0, 0, 0);
  const beanie = part(new THREE.SphereGeometry(0.18, 10, 6, 0, TAU, 0, Math.PI / 2), hat, r.head, 0, 0.02, 0);
  beanie.scale.y = 1.05;
  part(ball(0.06, 0), hat, r.head, 0, 0.22, 0);
  part(box(0.3, 0.07, 0.06), '#1d2533', r.head, 0, 0.01, 0.15); // goggle band
  part(box(0.22, 0.05, 0.04), '#5cc0ff', r.head, 0, 0.01, 0.18, { emissive: '#1a5a8a' }); // lens
  r.scarf = part(box(0.08, 0.04, 0.5), hat, r.torso, 0.08, 0.68, -0.25);
  root.traverse((o) => (o.castShadow = true));
  return r;
}

function animateSkier(r, s, t) {
  const { root, body } = r;
  root.visible = s.state !== 'caught' && s.state !== 'chomped';
  if (!root.visible) return;
  const h = s.heading || 0;
  root.position.set(s.x * S, (s.z || 0) * S, s.y * S);
  root.rotation.set(0, h, 0);
  body.rotation.set(0, 0, 0);
  body.position.set(0, 0, 0);
  const tuck = s.turbo ? 1 : s.tucking ? 0.6 : 0;
  // Lean into the carve: the gap between skis and travel.
  const lean = clamp(((s.travel ?? h) - h) * -1.4, -0.45, 0.45);
  r.hips.position.y = 0.62 - tuck * 0.12;
  r.torso.rotation.set(0.15 + tuck * 0.55, 0, lean);
  r.legL.rotation.set(-tuck * 0.5, 0, 0);
  r.legR.rotation.set(-tuck * 0.5, 0, 0);
  r.armL.rotation.set(-0.5 - tuck * 0.6, 0, 0.25);
  r.armR.rotation.set(-0.5 - tuck * 0.6, 0, -0.25);
  if (r.skiL) {
    const plough = s.braking ? 0.3 : 0;
    r.skiL.rotation.set(0, plough, 0);
    r.skiR.rotation.set(0, -plough, 0);
    r.skiL.position.x = -0.13;
    r.skiR.position.x = 0.13;
  }
  // Scarf streams behind at speed.
  const flow = clamp((s.speed || 0) / 300, 0, 1);
  r.scarf.rotation.set(-0.2 + flow * 0.9 + Math.sin(t * 18) * 0.1 * flow, Math.sin(t * 11) * 0.2 * flow, 0);
  if (s.walking) {
    const k = Math.sin(t * 14);
    r.legL.rotation.x = k * 0.4;
    r.legR.rotation.x = -k * 0.4;
  }
  switch (s.state) {
    case 'crash':
    case 'fall': {
      // Face-down in the snow, skis askew.
      body.rotation.set(Math.PI / 2 - 0.15, 0, 0.4);
      body.position.set(0, 0.2, 0.3);
      if (r.skiL) {
        r.skiL.rotation.y = 0.8;
        r.skiR.rotation.y = -0.6;
      }
      r.armL.rotation.set(-2.6, 0, 0.6);
      r.armR.rotation.set(-2.4, 0, -0.6);
      break;
    }
    case 'tumble':
      body.position.y = 0.6;
      body.rotation.set(t * 13, 0, Math.sin(t * 7) * 0.5);
      break;
    case 'recover': {
      const k = 1 - clamp((s.stateTime || 0) / 0.3, 0, 1);
      r.hips.position.y = 0.3 + k * 0.32;
      r.torso.rotation.x = 0.9 - k * 0.75;
      break;
    }
  }
  // Tricks.
  const tr = s.trick;
  if (tr) {
    const p = ease(Math.min(1, tr.t / tr.dur));
    body.position.y = 0.9;
    if (tr.kind === 'flip') body.rotation.x = -TAU * p;
    else if (tr.kind === 'spin') body.rotation.y = TAU * p;
    else {
      const k = Math.sin(p * Math.PI);
      r.legL.rotation.z = -0.7 * k;
      r.legR.rotation.z = 0.7 * k;
      r.armL.rotation.set(-2.8 * k - 0.5 * (1 - k), 0, 0.6 * k);
      r.armR.rotation.set(-2.8 * k - 0.5 * (1 - k), 0, -0.6 * k);
      if (r.skiL) {
        r.skiL.position.x = -0.13 - 0.4 * k;
        r.skiR.position.x = 0.13 + 0.4 * k;
      }
    }
    body.position.y -= 0.9;
  }
  if (r.board) {
    // Riders stand sideways on the board.
    r.hips.rotation.y = -Math.PI / 2 * 0.8;
  }
}

function buildDog(look, bear = false) {
  const [coat, patch] = bear ? ['#f6f1e4', '#e6dcc4'] : DOG_COATS[look % DOG_COATS.length];
  const k = bear ? 2.4 : 1;
  const root = new THREE.Group();
  const body = joint(root, 0, 0.32 * k, 0);
  part(box(0.32 * k, 0.26 * k, 0.6 * k), coat, body, 0, 0, 0);
  if (!bear) part(box(0.2, 0.12, 0.25), patch, body, 0.05, 0.12, -0.05);
  const head = joint(body, 0, 0.12 * k, 0.36 * k);
  part(box(0.24 * k, 0.22 * k, 0.24 * k), coat, head, 0, 0, 0);
  part(box(0.13 * k, 0.11 * k, 0.15 * k), bear ? '#efe7d6' : patch, head, 0, -0.04 * k, 0.17 * k);
  part(box(0.05 * k, 0.05 * k, 0.04 * k), '#1d2533', head, 0, -0.01 * k, 0.25 * k);
  for (const sx of [-1, 1]) {
    part(box(0.04 * k, 0.04 * k, 0.02), '#1d2533', head, sx * 0.07 * k, 0.05 * k, 0.12 * k);
    const ear = part(box(0.07 * k, bear ? 0.07 * k : 0.15, 0.04), bear ? coat : patch, head, sx * 0.1 * k, 0.12 * k, -0.02);
    ear.rotation.z = sx * 0.3;
  }
  const legs = [];
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    const j = joint(body, x * k, -0.1 * k, z * k);
    part(box(0.08 * k, 0.24 * k, 0.08 * k), coat, j, 0, -0.12 * k, 0);
    legs.push(j);
  }
  let tail = null;
  if (!bear) {
    tail = joint(body, 0, 0.08, -0.3);
    part(box(0.05, 0.05, 0.22), coat, tail, 0, 0.05, -0.1);
  }
  root.traverse((o) => (o.castShadow = true));
  return { root, body, head, legs, tail, bear };
}

function animateDog(r, a, t) {
  r.root.visible = a.state !== 'chomped';
  r.root.position.set(a.x * S, (a.z || 0) * S, a.y * S);
  r.root.rotation.y = a.heading;
  const moving = (a.speed || 0) > 8 && a.state !== 'sit' && a.state !== 'startled';
  const w = t * (r.bear ? 6 : moving && a.speed > 60 ? 18 : 8);
  r.legs.forEach((j, i) => (j.rotation.x = moving ? Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0));
  const sit = a.state === 'sit';
  r.body.rotation.x = sit ? -0.45 : 0;
  r.head.rotation.x = a.state === 'startled' ? -0.6 : sit ? 0.4 : 0;
  if (r.tail) r.tail.rotation.y = Math.sin(t * 14) * 0.6;
}

function buildYeti() {
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const fur = '#ffffff';
  const furMat = { flatShading: true };
  part(ball(0.75, 1), fur, body, 0, 1.25, 0, furMat).scale.set(1, 1.15, 0.85);
  part(ball(0.5, 1), '#dfe8f3', body, 0, 1.05, 0.28, furMat).scale.set(1, 1, 0.6);
  const head = joint(body, 0, 2.15, 0.05);
  part(ball(0.5, 1), fur, head, 0, 0, 0, furMat);
  part(new THREE.SphereGeometry(0.34, 14, 10), '#9fb0c6', head, 0, -0.04, 0.27).scale.set(1, 0.85, 0.5);
  const eyes = [];
  for (const sx of [-1, 1]) {
    eyes.push(part(ball(0.07, 1), '#ffffff', head, sx * 0.13, 0.07, 0.42));
    part(ball(0.035, 0), '#1d2533', head, sx * 0.12, 0.07, 0.48);
    const brow = part(box(0.18, 0.05, 0.05), '#1d2533', head, sx * 0.14, 0.18, 0.43);
    brow.rotation.z = sx * -0.35;
  }
  const mouth = part(new THREE.SphereGeometry(0.16, 12, 8), '#8f1f2b', head, 0, -0.17, 0.4);
  mouth.scale.set(1.2, 0.5, 0.4);
  const arms = [];
  for (const sx of [-1, 1]) {
    const j = joint(body, sx * 0.7, 1.75, 0);
    part(new THREE.CapsuleGeometry(0.16, 0.75, 3, 8), fur, j, 0, 0.45, 0, furMat);
    part(ball(0.17, 1), '#9fb0c6', j, 0, 0.95, 0);
    arms.push(j);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const j = joint(root, sx * 0.35, 0.55, 0);
    part(new THREE.CapsuleGeometry(0.2, 0.25, 3, 8), fur, j, 0, -0.2, 0, furMat);
    part(box(0.36, 0.14, 0.52), '#9fb0c6', j, 0, -0.5, 0.08);
    legs.push(j);
  }
  root.traverse((o) => (o.castShadow = true));
  root.scale.setScalar(CONFIG.YETI_DRAW_SCALE);
  return { root, body, head, mouth, arms, legs };
}

function animateYeti(r, y, t, victim) {
  r.root.visible = y.state !== 'gone';
  if (!r.root.visible) return;
  r.root.position.set(y.x * S, 0, y.y * S);
  r.root.rotation.y = y.heading;
  r.body.position.y = 0;
  r.body.rotation.set(0, 0, 0);
  const run = (y.speed || 0) > 30 ? 1 : 0.2;
  const w = t * (6 + Math.min(10, (y.speed || 0) / 30));
  let mouthOpen = y.lunging ? 1 : 0.35;
  victim.root.visible = false;
  if (y.state === 'eat') {
    const e = y.eatTime;
    r.root.rotation.y = Math.PI; // faces the camera (uphill) for the show
    r.legs.forEach((l) => (l.rotation.x = 0));
    if (e < 0.35) {
      const k = e / 0.35;
      r.arms.forEach((a, i) => a.rotation.set(1.6 * k, 0, (i ? -1 : 1) * 0.3));
      mouthOpen = 0.6 + k * 0.4;
      victim.root.visible = true;
      victim.root.position.set(0, 0, 0.9);
      victim.root.rotation.set(0, Math.PI, 0);
      victim.root.scale.setScalar(1 / CONFIG.YETI_DRAW_SCALE);
    } else if (e < 1.1) {
      const k = (e - 0.35) / 0.75;
      const lift = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
      const sink = Math.max(0, (k - 0.55) / 0.45);
      r.arms.forEach((a, i) => a.rotation.set(-0.2 - lift * 0.4, 0, (i ? -1 : 1) * 0.3));
      mouthOpen = 1;
      victim.root.visible = true;
      victim.root.position.set(0, 1.2 + lift * 1.9 - sink * 0.6, 0.45);
      victim.root.rotation.set(Math.PI * lift, Math.PI, 0);
      victim.root.scale.setScalar((1 - sink * 0.6) / CONFIG.YETI_DRAW_SCALE);
    } else if (e < 1.8) {
      const k = (e - 1.1) / 0.7;
      mouthOpen = Math.abs(Math.sin(k * Math.PI * 5)) * 0.5;
      r.body.scale.set(1 + Math.abs(Math.sin(k * 16)) * 0.06, 1, 1);
      r.arms.forEach((a, i) => a.rotation.set(0.6, 0, (i ? -1 : 1) * 0.5));
    } else {
      const k = e - 1.8;
      const hop = Math.abs(Math.sin(k * 7));
      r.body.position.y = hop * 0.6;
      mouthOpen = 0.1;
      r.arms.forEach((a, i) => a.rotation.set(0, 0, (i ? -1 : 1) * (0.2 + hop * 0.5)));
    }
    if (e >= 1.1) r.body.scale.y = 1;
  } else {
    r.body.scale.set(1, 1, 1);
    r.body.position.y = Math.abs(Math.sin(w)) * 0.12 * run;
    r.legs.forEach((l, i) => (l.rotation.x = Math.sin(w + (i ? Math.PI : 0)) * 0.7 * run));
    // Arms up, pumping; thrown forward in a lunge.
    r.arms.forEach((a, i) => a.rotation.set((y.lunging ? 1.2 : 0) + Math.sin(w + (i ? 0 : Math.PI)) * 0.35 * run, 0, (i ? -1 : 1) * 0.35));
    if (y.state === 'stumble') {
      r.body.rotation.set(0.5, 0, Math.sin(t * 9) * 0.3);
    }
  }
  r.mouth.scale.y = 0.15 + mouthOpen * 0.55;
}

// ----------------------------------------------------------- particles

// Soft round points with per-point size and alpha.
function makePoints(max) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(max), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(max), 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 400 }, uColor: { value: new THREE.Color('#ffffff') } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; uniform vec3 uColor;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float edge = smoothstep(0.5, 0.32, r); vec3 c = mix(vec3(0.62,0.72,0.86), uColor, smoothstep(0.5, 0.25, r));
        gl_FragColor = vec4(c, vA * edge); }`,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  return pts;
}

class Particles {
  constructor(max) {
    this.max = max;
    this.list = [];
    for (let i = 0; i < max; i++) this.list.push({ life: 0 });
    this.cursor = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size) {
    const p = this.list[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, size });
    return p;
  }
  update(dt) {
    for (const p of this.list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vz -= 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
        p.vx *= 0.85;
        p.vy *= 0.85;
      }
    }
  }
  clear() {
    for (const p of this.list) p.life = 0;
  }
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ============================================================== renderer

export class Renderer3D {
  // Throws if WebGL isn't available, so the caller can fall back to 2D.
  constructor(canvas, overlay, cfg = CONFIG) {
    this.cfg = cfg;
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.is3D = true;
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.zoom = 2; // CSS px per sim unit at the skier, measured each frame
    this.viewW = 2400; // generous sim-unit footprint for world generation
    this.viewH = 2600;
    this.sideSpawn = 620; // where a yeti 'from the side' appears
    this.reducedMotion = false;
    this.effects = true;
    this._lite = false;
    this.time = 0;
    this.kick = 0;
    this.alarm = 0;
    this.hud = null;
    this.particles = new Particles(cfg.MAX_PARTICLES);
    this.buildScene();
    this.reset();
  }

  get lite() {
    return this._lite;
  }
  // Lite: no shadows, 1x pixels, fewer flakes. Set by the host on slow frames.
  set lite(v) {
    this._lite = !!v;
    this.gl.shadowMap.enabled = !v;
    this.sun.castShadow = !v;
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
    this.resize(this.cssW, this.cssH, this.dpr);
  }

  buildScene() {
    const scene = (this.scene = new THREE.Scene());
    // Sky: a vertical gradient, fog the same colour as the horizon.
    scene.background = canvasTexture(4, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#6fa8e6');
      g.addColorStop(0.55, '#bcd8f4');
      g.addColorStop(1, '#eaf2fb');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    scene.fog = new THREE.Fog('#e6eff9', 55, 125);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 400);
    this.camPos = new THREE.Vector3(0, 14, -12);
    this.camLook = new THREE.Vector3(0, 0, 14);

    const hemi = new THREE.HemisphereLight('#dcecff', '#ffffff', 1.55);
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight('#fff1d8', 2.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    // The snowfield: a large plane that follows the camera in whole texture
    // tiles, so its texture stays anchored to the world.
    const snowTex = canvasTexture(512, 512, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      let seed = 3;
      const rnd = () => (hash(seed++, 9) & 65535) / 65535;
      for (let i = 0; i < 26; i++) {
        const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 110;
        for (const dx of [-w, 0, w]) {
          for (const dy of [-h, 0, h]) {
            const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
            g.addColorStop(0, 'rgba(205, 222, 244, 0.16)');
            g.addColorStop(1, 'rgba(205, 222, 244, 0)');
            c.fillStyle = g;
            c.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
          }
        }
      }
      for (let i = 0; i < 900; i++) {
        c.fillStyle = i % 4 ? 'rgba(160, 185, 220, 0.35)' : 'rgba(255,255,255,1)';
        c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
      }
    });
    snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
    this.tile = 24; // metres per texture repeat
    const size = 480;
    snowTex.repeat.set(size / this.tile, size / this.tile);
    const ground = (this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: '#f4f8fd', map: snowTex })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Instanced scenery.
    // Double-sided: flags and thin parts are seen from behind (the camera looks downhill).
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const vcFlat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.inst = {};
    for (const key of Object.keys(STATIC)) {
      const flat = /tree|rock|snowpile|mogul/.test(key);
      const m = new THREE.InstancedMesh(STATIC[key](), flat ? vcFlat : vc, key === 'poop' ? 64 : 700);
      m.castShadow = !/mogul|poop/.test(key);
      m.receiveShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      this.inst[key] = m;
    }
    this.dummy = new THREE.Object3D();

    // Flat decals: footprints, yellow snow, craters (instanced discs).
    this.decalMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), 320);
    this.decalMesh.count = 0;
    this.decalMesh.frustumCulled = false;
    this.decalMesh.renderOrder = 1;
    scene.add(this.decalMesh);

    // Signs and course arches: few, each with a painted text texture.
    this.signPool = new Map();
    this.signTex = SIGNS.map((text, i) =>
      canvasTexture(256, 96, (c, w, h) => {
        const bg = ['#2f6fd6', '#2fa860', '#f28a1e', '#ffffff', '#ffcf33', '#e0393e'][i];
        c.fillStyle = bg;
        c.beginPath();
        c.roundRect ? c.roundRect(4, 4, w - 8, h - 8, 16) : c.rect(4, 4, w - 8, h - 8);
        c.fill();
        c.lineWidth = 6;
        c.strokeStyle = '#1d2533';
        c.stroke();
        c.fillStyle = i === 3 || i === 4 ? '#1d2533' : '#ffffff';
        c.font = '900 42px Fredoka, Nunito, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, w / 2, h / 2 + 2, w - 24);
      }),
    );
    this.bannerTex = ['START', 'FINISH'].map((text, i) =>
      canvasTexture(1024, 64, (c, w, h) => {
        c.fillStyle = i ? '#1d2533' : '#e0393e';
        c.fillRect(0, 0, w, h);
        if (i) {
          for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) if (((x + y) / 16) % 2 && (x < 160 || x > w - 160)) {
            c.fillStyle = '#fff';
            c.fillRect(x, y, 16, 16);
          }
        }
        c.fillStyle = '#ffffff';
        c.font = '900 44px Fredoka, Nunito, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, w / 2, h / 2 + 2);
      }),
    );

    // Ski tracks: two ribbons rebuilt from the sample buffer each frame.
    const maxV = this.cfg.TRACK_POINTS * 12;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxV * 3), 3));
    this.trackMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: '#a9bfe0', transparent: true, opacity: 0.6, depthWrite: false }));
    this.trackMesh.frustumCulled = false;
    this.trackMesh.renderOrder = 1;
    scene.add(this.trackMesh);

    // Lift cables.
    const cg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.85, 13.4, -10), new THREE.Vector3(-0.85, 13.4, 10), new THREE.Vector3(0.85, 13.4, -10), new THREE.Vector3(0.85, 13.4, 10)]);
    this.cables = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#2d333d' }));
    this.cables.frustumCulled = false;
    scene.add(this.cables);

    // Particles: spray and snowfall.
    this.sprayPts = makePoints(this.cfg.MAX_PARTICLES);
    this.flakePts = makePoints(260);
    scene.add(this.sprayPts, this.flakePts);
    this.flakes = [];
    for (let i = 0; i < 260; i++) this.flakes.push({ x: Math.random() * 120 - 60, y: Math.random() * 30, z: Math.random() * 120 - 40, s: 0.06 + Math.random() * 0.1, ph: Math.random() * TAU });

    // Characters, pooled by actor.
    this.player = buildSkier(0);
    scene.add(this.player.root);
    this.victim = buildSkier(1);
    this.yeti = buildYeti();
    this.yeti.root.add(this.victim.root);
    scene.add(this.yeti.root);
    this.actorViews = new Map();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  reset() {
    this.tracks = new Array(this.cfg.TRACK_POINTS);
    this.trackHead = 0;
    this.trackCount = 0;
    this.lastTrack = null;
    this.prints = [];
    this.lastPrint = null;
    this.printSide = 1;
    this.craters = [];
    this.particles.clear();
    this.popups = [];
    this.kick = 0;
    this.alarm = 0;
    this.sprayAcc = 0;
    this.breath = 0;
    this.camInit = false;
    for (const v of this.actorViews.values()) this.scene.remove(v.root);
    this.actorViews.clear();
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = clamp(dpr || 1, 1, this._lite ? 1 : 2);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(this.cssW, this.cssH, false);
    this.overlay.width = Math.round(this.cssW * this.dpr);
    this.overlay.height = Math.round(this.cssH * this.dpr);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(this._lite ? 1024 : 2048, this._lite ? 1024 : 2048);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  // Screen point -> sim coordinates on the snow (for mouse/finger steering).
  screenToWorld(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.cssW) * 2 - 1, -(sy / this.cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x / S, y: hit.z / S };
  }

  project(x, y, z = 0) {
    const v = new THREE.Vector3(x * S, z * S, y * S).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.cssW, y: (-v.y * 0.5 + 0.5) * this.cssH, behind: v.z > 1 };
  }

  // ------------------------------------------------------------- events

  popup(x, y, text, color, scale = 1, z = 40) {
    this.popups.push({ x, y, z, text, color, scale, t: 0 });
    if (this.popups.length > 12) this.popups.shift();
  }

  burst(x, y, z, n, speed, up, life, size) {
    const k = this.effects ? 1 : 0.35;
    for (let i = 0; i < Math.ceil(n * k); i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.spawn(x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.7, up * (0.5 + Math.random()), life * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.8));
    }
  }

  handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const def = OBJECTS[e.obj];
          this.burst(e.x, e.y, 4, 16 + Math.min(20, e.speed / 12), 60 + e.speed * 0.4, 160, 0.8, 3);
          if (def && def.h > 50) this.burst(e.x, e.y, def.h * 0.7, 14, 25, 10, 1.2, 2.5);
          if (def && def.hit === 'crash') {
            this.craters.push({ x: e.x, y: e.y });
            if (this.craters.length > 30) this.craters.shift();
            this.kick = Math.max(this.kick, Math.min(1, e.speed / 300));
          }
          break;
        }
        case 'wipeout':
        case 'bump':
        case 'dog':
        case 'pileup':
          this.burst(e.x, e.y, 3, 18, 80, 140, 0.7, 2.8);
          if (e.type === 'wipeout') this.kick = Math.max(this.kick, 0.6);
          break;
        case 'smash':
          this.burst(e.x, e.y, 20, 30, 110, 180, 1, 4);
          break;
        case 'land':
          this.burst(e.x, e.y, 1, 12 + e.air * 16, 70, 90, 0.5, 2.6);
          break;
        case 'mogul':
        case 'pile':
          this.burst(e.x, e.y, 2, 10, 60, 100, 0.5, 2.6);
          break;
        case 'ramp':
          this.burst(e.x, e.y, 2, 10, 40, 180, 0.6, 2.4);
          break;
        case 'yetibonk':
          this.burst(e.x, e.y, 60, 20, 60, 60, 1, 3);
          break;
        case 'caught':
        case 'bearhit':
          this.kick = 1;
          if (e.type === 'bearhit') this.popup(e.x, e.y, 'BEAR!', '#e0393e', 1.3);
          break;
        case 'yeti':
          this.alarm = 1;
          break;
        case 'style':
          this.popup(e.x, e.y, `+${e.amount} ${e.label}`, e.amount >= 100 ? '#e0393e' : '#2f6fd6');
          break;
        case 'gatemiss':
          this.popup(e.x, e.y, `Missed +${e.penalty}s`, '#e0393e');
          break;
        case 'coursestart':
          this.popup(e.x, e.y, 'GO!', '#2fa860', 1.6, 80);
          break;
        case 'poop':
          this.popup(e.x, e.y, e.npc ? 'Ew!' : 'EWW!', '#7d5230');
          break;
        case 'yetieat':
          this.popup(e.x, e.y, 'Sorry, buddy!', '#e0393e', 1.2, 90);
          break;
        case 'yetiretarget':
          if (e.to !== 'player') this.popup(e.x, e.y, '!', '#e0393e', 1.6, 60);
          break;
      }
    }
  }

  updateEffects(game, dt) {
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 3);
    this.alarm = Math.max(0, this.alarm - dt * 1.2);
    this.particles.update(dt);
    for (const q of this.popups) q.t += dt;
    this.popups = this.popups.filter((q) => q.t < 1.4);
    const p = game.player;
    const c = this.cfg;

    const grounded = p.state === 'ski' && p.z <= 0;
    if (grounded) {
      const last = this.lastTrack;
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= c.TRACK_SPACING) {
        const pt = { x: p.x, y: p.y, h: p.heading, w: 2.6 + p.skid * 2.2, brk: !last };
        this.tracks[this.trackHead] = pt;
        this.trackHead = (this.trackHead + 1) % this.tracks.length;
        this.trackCount = Math.min(this.trackCount + 1, this.tracks.length);
        this.lastTrack = pt;
      }
    } else {
      this.lastTrack = null;
    }

    if (grounded && p.speed > 60) {
      const fast = p.speed / c.TURBO_SPEED;
      this.sprayAcc += (fast * fast * 60 + p.skid * 140 + (p.turbo ? 90 : 0)) * (this.effects ? 1 : 0.3) * dt;
      const back = Math.sin(p.travel), down = Math.cos(p.travel);
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const out = side * (30 + p.skid * 90 + Math.random() * 40);
        this.particles.spawn(p.x - back * 8, p.y - down * 6, 2 + Math.random() * 3, Math.cos(p.travel) * out - back * p.speed * 0.25, -Math.sin(p.travel) * out * 0.5 - down * p.speed * 0.2, 70 + Math.random() * (80 + fast * 90), 0.35 + Math.random() * (0.3 + fast * 0.4), 1.6 + Math.random() * (1.4 + fast * 1.6));
      }
    }

    const y = game.yeti;
    if (y && (y.state === 'chase' || y.state === 'stumble') && y.speed > 20) {
      const lp = this.lastPrint;
      if (!lp || Math.hypot(y.x - lp.x, y.y - lp.y) > 24) {
        this.printSide = -this.printSide;
        this.lastPrint = { x: y.x, y: y.y };
        this.prints.push({ x: y.x + Math.cos(y.heading) * 7 * this.printSide, y: y.y - Math.sin(y.heading) * 7 * this.printSide });
        if (this.prints.length > 160) this.prints.shift();
      }
      if (this.effects) {
        this.breath -= dt;
        if (this.breath <= 0) {
          this.breath = 0.22;
          this.particles.spawn(y.x + Math.sin(y.heading) * 12, y.y + Math.cos(y.heading) * 12, 46 * c.YETI_DRAW_SCALE, Math.sin(y.heading) * 50, Math.cos(y.heading) * 50, 40, 0.8, 4);
        }
      }
    }
  }

  // --------------------------------------------------------------- draw

  updateCamera(game, dt, shiftX, shiftY) {
    const p = game.player;
    const c = this.cfg;
    const fast = clamp((p.speed - c.PLAYER_SPEED * 0.6) / (c.TURBO_SPEED - c.PLAYER_SPEED * 0.6), 0, 1);
    const y = game.yeti;
    const eating = y && y.state === 'eat' && !y.victim;
    // Portrait screens need the camera further back to see the sides.
    const aspectK = this.camera.aspect < 1 ? 1 / Math.sqrt(this.camera.aspect) : 1;
    let height = (8.5 + fast * 4) * aspectK;
    let back = (7 + fast * 3) * aspectK;
    let ahead = 9 + fast * 7;
    let fx = p.x * S + Math.sin(p.travel) * p.speed * S * 0.35;
    let fz = p.y * S;
    if (eating) {
      fx = y.x * S;
      fz = y.y * S;
      height = 7.5;
      back = 9;
      ahead = 1.5 - (game.over ? 3.5 : 0);
    }
    // Title screen: frame the attract skier off to one side of the menu.
    fx -= (shiftX / this.zoom) * S;
    fz -= (shiftY / this.zoom) * S;
    const wantPos = new THREE.Vector3(fx, height, fz - back);
    const wantLook = new THREE.Vector3(fx, 0, fz + ahead);
    const k = this.camInit ? 1 - Math.exp(-6 * dt) : 1;
    this.camInit = true;
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    let sx = 0, sy = 0;
    if (!this.reducedMotion) {
      const amp = (game.shake * c.CAMERA_SHAKE_TURBO * 0.04 + this.kick * 0.12);
      sx = Math.sin(this.time * 53) * amp;
      sy = Math.cos(this.time * 47) * amp;
    }
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
    // Pixels per sim unit at the skier: drives mouse aim and tests.
    const a = this.project(p.x, p.y), b = this.project(p.x + METER, p.y);
    const z = Math.hypot(b.x - a.x, b.y - a.y) / METER;
    if (Number.isFinite(z) && z > 0) this.zoom = z;
  }

  draw(game, shiftX = 0, shiftY = 0) {
    const dt = Math.min(0.05, this.time - (this.lastDraw ?? this.time) || 1 / 60);
    this.lastDraw = this.time;
    game.sideSpawn = this.sideSpawn;
    this.updateCamera(game, dt, shiftX, shiftY);
    const cx = this.camLook.x, cz = this.camLook.z;

    // Sun and its shadow box follow the action.
    this.sun.position.set(cx - 30, 55, cz - 25);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
    // Ground snaps to whole texture tiles so the texture never swims.
    this.ground.position.set(Math.round(cx / this.tile) * this.tile, 0, Math.round(cz / this.tile) * this.tile);

    this.drawStatics(game);
    this.drawCharacters(game);
    this.drawTracks();
    this.drawDecals(game);
    this.drawParticles();
    this.drawLift(game, cz);

    this.gl.render(this.scene, this.camera);
    this.drawOverlay(game);
  }

  drawStatics(game) {
    const counts = {};
    for (const k in this.inst) counts[k] = 0;
    const d = this.dummy;
    const p = game.player;
    const x0 = p.x - 1500, x1 = p.x + 1500, y0 = p.y - 500, y1 = p.y + 2300;
    const seen = new Set();
    game.world.forEachInRect(x0, y0, x1, y1, (o) => {
      if (o.t === 'gate') return;
      if (o.t === 'sign' || o.t === 'banner') {
        seen.add(o.id);
        this.placeSign(o);
        return;
      }
      const key = staticKey(o);
      const m = this.inst[key];
      if (!m || counts[key] >= m.instanceMatrix.count) return;
      const h = hash(o.id, 7);
      const tree = key.startsWith('tree');
      d.position.set(o.x * S, 0, o.y * S);
      d.rotation.set(0, tree || key.startsWith('rock') || key.startsWith('snow') ? (h & 1023) / 163 : 0, 0);
      if (key.endsWith('_x') && key.startsWith('flag')) d.rotation.y = (o.fall || 1) > 0 ? 0 : Math.PI;
      const sc = tree ? 0.88 + ((h >> 10) & 255) / 1000 : 1;
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      m.setMatrixAt(counts[key]++, d.matrix);
    });
    // Dog poop lives on the game, not the world.
    for (const q of game.poop) {
      if (counts.poop >= 64) break;
      d.position.set(q.x * S, 0, q.y * S);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.inst.poop.setMatrixAt(counts.poop++, d.matrix);
    }
    for (const k in this.inst) {
      const m = this.inst[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    }
    for (const [id, mesh] of this.signPool) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.signPool.delete(id);
      }
    }
  }

  placeSign(o) {
    let g = this.signPool.get(o.id);
    if (!g) {
      g = new THREE.Group();
      if (o.t === 'banner') {
        const half = 12;
        for (const sx of [-1, 1]) {
          const pole = new THREE.Mesh(cyl(0.1, 0.1, 4.2), mat('#7c8796'));
          pole.position.set(sx * half, 2.1, 0);
          pole.castShadow = true;
          g.add(pole);
        }
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 1.1), new THREE.MeshLambertMaterial({ map: this.bannerTex[o.v ? 1 : 0], side: THREE.DoubleSide }));
        strip.position.set(0, 3.8, 0);
        strip.rotation.y = Math.PI;
        strip.castShadow = true;
        g.add(strip);
      } else {
        const post = new THREE.Mesh(cyl(0.06, 0.06, 2.4), mat('#7a4f28'));
        post.position.y = 1.2;
        post.castShadow = true;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), new THREE.MeshLambertMaterial({ map: this.signTex[o.v] || this.signTex[0], side: THREE.DoubleSide }));
        board.position.y = 2.25;
        board.rotation.y = Math.PI;
        board.castShadow = true;
        g.add(post, board);
      }
      g.position.set(o.x * S, 0, o.y * S);
      this.scene.add(g);
      this.signPool.set(o.id, g);
    }
    g.rotation.z = o.state && o.t === 'sign' ? 1.3 : 0;
  }

  drawCharacters(game) {
    const t = this.time;
    const p = game.player;
    animateSkier(this.player, { ...p }, t);
    // Turbo afterglow: nothing to pool, a simple emissive tint on speed.
    // Actors.
    const alive = new Set();
    for (const a of game.actors) {
      if (a.gone || Math.abs(a.y - p.y) > 2600 || Math.abs(a.x - p.x) > 1800) continue;
      alive.add(a.id);
      let v = this.actorViews.get(a.id);
      if (!v) {
        v = a.kind === 'dog' ? buildDog(a.look) : a.kind === 'bear' ? buildDog(0, true) : buildSkier(1 + (a.look % 5), a.kind === 'boarder');
        v.kind = a.kind;
        this.scene.add(v.root);
        this.actorViews.set(a.id, v);
      }
      if (a.kind === 'dog' || a.kind === 'bear') animateDog(v, a, t + a.id);
      else animateSkier(v, { ...a, travel: a.heading, braking: a.beginner && a.state === 'go' }, t + a.id);
    }
    for (const [id, v] of this.actorViews) {
      if (!alive.has(id)) {
        this.scene.remove(v.root);
        this.actorViews.delete(id);
      }
    }
    // The yeti (and whoever it's eating).
    const y = game.yeti;
    if (y) {
      if (y.victim && this.victimOutfit !== y.victim.look) {
        this.yeti.root.remove(this.victim.root);
        this.victim = buildSkier(1 + (y.victim.look % 5));
        this.victimOutfit = y.victim.look;
        this.yeti.root.add(this.victim.root);
      } else if (!y.victim && this.victimOutfit !== 'player') {
        this.yeti.root.remove(this.victim.root);
        this.victim = buildSkier(0);
        this.victimOutfit = 'player';
        this.yeti.root.add(this.victim.root);
      }
      animateYeti(this.yeti, y, t, this.victim);
    } else {
      this.yeti.root.visible = false;
    }
  }

  drawTracks() {
    const pos = this.trackMesh.geometry.attributes.position;
    const arr = pos.array;
    const n = this.trackCount;
    const N = this.tracks.length;
    const start = (this.trackHead - n + N) % N;
    let v = 0;
    const W = 0.07; // ribbon half-width in metres
    let prev = null;
    for (let i = 0; i < n; i++) {
      const t = this.tracks[(start + i) % N];
      if (prev && !t.brk) {
        for (const side of [-1, 1]) {
          const ox0 = Math.cos(prev.h) * prev.w * side * S, oz0 = -Math.sin(prev.h) * prev.w * side * S;
          const ox1 = Math.cos(t.h) * t.w * side * S, oz1 = -Math.sin(t.h) * t.w * side * S;
          const ax = prev.x * S + ox0, az = prev.y * S + oz0, bx = t.x * S + ox1, bz = t.y * S + oz1;
          const px = Math.cos(t.h) * W, pz = -Math.sin(t.h) * W;
          const quad = [ax - px, az - pz, ax + px, az + pz, bx + px, bz + pz, ax - px, az - pz, bx + px, bz + pz, bx - px, bz - pz];
          for (let q = 0; q < 12; q += 2) {
            arr[v++] = quad[q];
            arr[v++] = 0.015;
            arr[v++] = quad[q + 1];
          }
        }
      }
      prev = t;
    }
    this.trackMesh.geometry.setDrawRange(0, v / 3);
    pos.needsUpdate = true;
  }

  drawDecals(game) {
    const d = this.dummy;
    const m = this.decalMesh;
    let i = 0;
    const put = (x, y, r, sx, color) => {
      if (i >= 320) return;
      d.position.set(x * S, 0.012, y * S);
      d.rotation.set(0, 0, 0);
      d.scale.set(r * sx, 1, r);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, color);
      i++;
    };
    const blue = col('#9db3d6'), yellow = col('#e8c84a'), dent = col('#b4c7e3');
    for (const f of this.prints) put(f.x, f.y, 0.26, 0.75, blue);
    for (const c of this.craters) put(c.x, c.y, 0.7, 1.6, dent);
    for (const dcl of game.decals) if (dcl.kind === 'yellow') put(dcl.x, dcl.y, 0.22, 1.4, yellow);
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  drawParticles() {
    const pts = this.sprayPts;
    const pos = pts.geometry.attributes.position.array;
    const size = pts.geometry.attributes.aSize.array;
    const alpha = pts.geometry.attributes.aAlpha.array;
    let n = 0;
    for (const q of this.particles.list) {
      if (q.life <= 0) continue;
      pos[n * 3] = q.x * S;
      pos[n * 3 + 1] = q.z * S + 0.05;
      pos[n * 3 + 2] = q.y * S;
      size[n] = q.size * S * 1.6;
      alpha[n] = Math.min(1, q.life / (q.max * 0.5)) * 0.95;
      n++;
    }
    pts.geometry.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha']) pts.geometry.attributes[k].needsUpdate = true;
    const scale = this.cssH * this.dpr * 0.9;
    pts.material.uniforms.uScale.value = scale;

    // Snowfall around the camera.
    const f = this.flakePts;
    const fp = f.geometry.attributes.position.array, fs = f.geometry.attributes.aSize.array, fa = f.geometry.attributes.aAlpha.array;
    const cnt = this.effects ? (this._lite ? 90 : 260) : 0;
    const calm = this.reducedMotion ? 0.35 : 1;
    const cx = this.camLook.x, cz = this.camLook.z;
    for (let i = 0; i < cnt; i++) {
      const q = this.flakes[i];
      q.y -= 1.6 * calm * (1 / 60);
      if (q.y < 0) q.y += 30;
      const wx = cx + ((((q.x + Math.sin(this.time * 0.6 + q.ph) * 2 - cx) % 120) + 180) % 120) - 60;
      const wz = cz + ((((q.z - cz) % 120) + 160) % 120) - 40;
      fp[i * 3] = wx;
      fp[i * 3 + 1] = q.y;
      fp[i * 3 + 2] = wz;
      fs[i] = q.s;
      fa[i] = 0.9;
    }
    f.geometry.setDrawRange(0, cnt);
    for (const k of ['position', 'aSize', 'aAlpha']) f.geometry.attributes[k].needsUpdate = true;
    f.material.uniforms.uScale.value = scale;
  }

  drawLift(game, cz) {
    const c = this.cfg;
    const end = game.world.liftEnd() * S;
    const lx = c.LIFT_X * S;
    const zA = Math.max(0, cz - 60), zB = Math.min(end, cz + 120);
    const show = zA < zB;
    this.cables.visible = show;
    const m = this.inst.chair;
    let n = 0;
    if (show) {
      const g = this.cables.geometry.attributes.position.array;
      g.set([lx - 0.85, 13.4, zA, lx - 0.85, 13.4, zB, lx + 0.85, 13.4, zA, lx + 0.85, 13.4, zB]);
      this.cables.geometry.attributes.position.needsUpdate = true;
      const spacing = 11, speed = 2.6, t = game.time + 1000;
      for (const [dx, dir] of [[-0.85, -1], [0.85, 1]]) {
        const off = (((t * speed * dir) % spacing) + spacing) % spacing;
        for (let z = Math.floor(zA / spacing) * spacing + off; z < zB && n < 60; z += spacing) {
          this.dummy.position.set(lx + dx, 13.4, z);
          this.dummy.rotation.set(0, dir < 0 ? Math.PI : 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          m.setMatrixAt(n++, this.dummy.matrix);
        }
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ overlay

  drawOverlay(game) {
    const ctx = this.octx;
    const W = this.cssW, H = this.cssH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const p = game.player;
    const c = this.cfg;

    // Turbo speed streaks.
    if (p.turbo && p.onGround && !this.reducedMotion) {
      const fast = clamp((p.speed - c.PLAYER_SPEED) / (c.TURBO_SPEED - c.PLAYER_SPEED), 0, 1);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * fast})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const x = ((hash(i, 9) % 1000) / 1000) * W;
        const len = 40 + (hash(i, 10) % 80);
        const y = H - ((this.time * (900 + (hash(i, 11) % 500)) + (hash(i, 12) % 1000)) % (H + len));
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
      }
      ctx.stroke();
    }

    // Floating style texts.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const q of this.popups) {
      const s = this.project(q.x, q.y, q.z + 38 + q.t * 40);
      if (s.behind) continue;
      const k = q.t / 1.4;
      const pop = q.t < 0.12 ? 0.6 + (q.t / 0.12) * 0.5 : 1.1 - Math.min(0.1, (q.t - 0.12) * 0.5);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `800 ${Math.round(18 * pop * q.scale)}px Fredoka, Nunito, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(q.text, s.x, s.y);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;

    // Yeti off-screen marker and danger glow.
    const y = game.yeti;
    if (y && (y.state === 'chase' || y.state === 'stumble')) {
      const s = this.project(y.x, y.y, 40);
      const m = 30;
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        let dx = s.x - W / 2, dy = s.y - H / 2;
        if (s.behind) {
          dx = -dx;
          dy = Math.abs(dy) * -1 - 10; // behind the camera: show at the top
        }
        const sc = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m) / Math.abs(dy || 1e-3));
        const ex = W / 2 + dx * sc;
        const underHud = this.hud && ex > this.hud.left - 18;
        const ey = Math.max(underHud ? this.hud.bottom : 64, H / 2 + dy * sc);
        const a = Math.atan2(dy, dx);
        const pulse = 1 + Math.sin(this.time * 9) * 0.12;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(224, 57, 62, 0.95)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(24, 0);
        ctx.lineTo(14, -7);
        ctx.lineTo(14, 7);
        ctx.closePath();
        ctx.fill();
        ctx.rotate(-a);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C.yetiFace;
        ctx.beginPath();
        ctx.ellipse(0, 1, 6, 5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C.outline;
        ctx.fillRect(-3.5, -1.5, 2, 2);
        ctx.fillRect(1.5, -1.5, 2, 2);
        ctx.restore();
      }
      const d = y.distanceTo(p);
      const near = Math.max(clamp(1 - (d - 60) / 360, 0, 1), this.alarm * (0.6 + 0.4 * Math.sin(this.time * 18)));
      if (near > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(224, 57, 62, 0)');
        g.addColorStop(1, `rgba(224, 57, 62, ${0.2 * near})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
}
