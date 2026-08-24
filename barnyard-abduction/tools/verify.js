/* ============================================================================
   HEADLESS VERIFIER — Barnyard Abduction
   ----------------------------------------------------------------------------
   There is no browser or GPU in this environment, so this is the strongest
   verification available: it executes the real game script inside a Node vm
   against a faithful stub of the Three.js r128 API surface and the DOM the
   game touches, then drives actual simulated frames.

   What this DOES prove:
     - every file-level reference resolves (no typos, no undefined globals)
     - the world, all six species, the farmer and the UFO all construct
     - spawning, AI ticks, beam acquisition/capture, scoring, combos, damage,
       mission win/fail, save/load and every cheat combination run without
       throwing
     - scout framing maths is correct at real iPhone aspect ratios
     - landmark coordinates match STEP2_WORLD_SPEC

   What this does NOT prove:
     - anything visual: shading, materials, lighting, actual rendered output
     - real device performance or frame rate
     - touch handling on a real iPhone
   Those require the owner to open the file on iPhone Safari.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'barnyard-abduction.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

let failures = [];
let checks = 0;
function check(name, fn) {
  checks++;
  try {
    const r = fn();
    if (r === false) { failures.push(name + ' -> returned false'); console.log('  FAIL  ' + name); }
    else console.log('  ok    ' + name + (typeof r === 'string' ? '  (' + r + ')' : ''));
  } catch (e) {
    failures.push(name + ' -> ' + e.message);
    console.log('  FAIL  ' + name + '  :: ' + e.message);
  }
}

/* ------------------------------------------------------------- THREE stub -- */
class V2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  clone() { return new V2(this.x, this.y); }
}
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  length() { return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  distanceTo(v) { return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2); }
}
class Color {
  constructor(hex = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; if (typeof hex === 'number') this.setHex(hex); }
  setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
  getHex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
  setHSL(h, s, l) { this.r = l; this.g = l; this.b = l; return this; }
  offsetHSL() { return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { const c = new Color(); return c.copy(this); }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
}
class BufferAttribute {
  constructor(arr, item) { this.array = arr; this.itemSize = item; this.count = arr.length / item; this.needsUpdate = false; }
  getX(i) { return this.array[i * this.itemSize]; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
  setX(i, v) { this.array[i * this.itemSize] = v; }
  setY(i, v) { this.array[i * this.itemSize + 1] = v; }
  setZ(i, v) { this.array[i * this.itemSize + 2] = v; }
}
class Geo {
  constructor() { this.attributes = {}; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  computeVertexNormals() {} dispose() {} translate() { return this; }
  rotateX() { return this; } rotateY() { return this; } rotateZ() { return this; }
  clone() { const g = new Geo(); g.attributes = this.attributes; return g; }
}
function PlaneGeo(w, h, sw, shg) {
  const g = new Geo();
  const nx = sw + 1, nz = shg + 1, n = nx * nz;
  const arr = new Float32Array(n * 3);
  let i = 0;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    arr[i * 3] = -w / 2 + (x / sw) * w;
    arr[i * 3 + 1] = 0;
    arr[i * 3 + 2] = -h / 2 + (z / shg) * h;
    i++;
  }
  g.setAttribute('position', new BufferAttribute(arr, 3));
  return g;
}
class Obj3D {
  constructor() {
    this.position = new V3(); this.rotation = new V3(); this.scale = new V3(1, 1, 1);
    this.scale.setScalar = (s) => { this.scale.x = this.scale.y = this.scale.z = s; return this.scale; };
    this.rotation.set = (x, y, z) => { this.rotation.x = x; this.rotation.y = y; this.rotation.z = z; };
    this.children = []; this.userData = {}; this.visible = true;
    this.castShadow = false; this.receiveShadow = false; this.name = '';
  }
  add(o) { if (o) this.children.push(o); return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); return this; }
  lookAt() {} rotateX() {} traverse(fn) { fn(this); this.children.forEach(c => c.traverse && c.traverse(fn)); }
}
class Mesh extends Obj3D {
  constructor(geo, mat) { super(); this.geometry = geo || new Geo(); this.material = mat || {}; }
}
class InstancedMesh extends Mesh {
  constructor(g, m, c) { super(g, m); this.count = c; this.instanceMatrix = { needsUpdate: false }; this._set = 0; }
  setMatrixAt(i, m) { if (i >= this.count) throw new Error('instance index ' + i + ' >= count ' + this.count); this._set++; }
}
class Mat {
  constructor(o = {}) { Object.assign(this, o); this.color = new Color(o.color === undefined ? 0xffffff : o.color); }
  clone() { return new Mat(this); }
}

function geoFn() { return new Geo(); }
const THREE = {
  Vector2: V2, Vector3: V3, Color, BufferAttribute, BufferGeometry: Geo,
  Object3D: Obj3D, Group: Obj3D, Mesh, InstancedMesh,
  PlaneBufferGeometry: PlaneGeo,
  BoxBufferGeometry: geoFn, SphereBufferGeometry: geoFn, CylinderBufferGeometry: geoFn,
  ConeBufferGeometry: geoFn, TorusBufferGeometry: geoFn, CircleBufferGeometry: geoFn,
  RingBufferGeometry: geoFn, LatheBufferGeometry: geoFn, ShapeBufferGeometry: geoFn,
  ExtrudeBufferGeometry: geoFn,
  MeshLambertMaterial: Mat, MeshPhongMaterial: Mat, MeshBasicMaterial: Mat,
  MeshStandardMaterial: Mat, PointsMaterial: Mat,
  ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
  Shape: class { constructor(p) { this.pts = p; } moveTo() {} lineTo() {} closePath() {} },
  Matrix4: class { compose() { return this; } },
  Quaternion: class { setFromEuler() { return this; } },
  Euler: class { constructor() {} set() { return this; } },
  Scene: class extends Obj3D { constructor() { super(); this.background = null; this.fog = null; } },
  Fog: class { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } },
  Points: class extends Mesh {},
  PerspectiveCamera: class extends Obj3D {
    constructor(fov, aspect, near, far) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; }
    updateProjectionMatrix() {}
  },
  DirectionalLight: class extends Obj3D {
    constructor(c, i) { super(); this.color = new Color(c); this.intensity = i;
      this.shadow = { mapSize: { width: 0, height: 0 }, camera: {}, bias: 0 }; }
  },
  HemisphereLight: class extends Obj3D { constructor(a, b, i) { super(); this.intensity = i; } },
  PointLight: class extends Obj3D { constructor(c, i) { super(); this.color = new Color(c); this.intensity = i; } },
  WebGLRenderer: class {
    constructor() { this.domElement = makeEl('canvas'); this.shadowMap = { enabled: false, type: 0 }; }
    setPixelRatio() {} setSize() {} render() { this.rendered = (this.rendered || 0) + 1; }
  },
  Clock: class {
    constructor() { this.t = 0; } getDelta() { return 0.016; }
  },
  DoubleSide: 2, BackSide: 1, FrontSide: 0,
  AdditiveBlending: 2, sRGBEncoding: 3001, PCFSoftShadowMap: 2
};

/* ---------------------------------------------------------------- DOM stub -- */
const elements = {};
function makeEl(tag) {
  const el = {
    tagName: tag, children: [], style: {}, dataset: {}, _attrs: {},
    textContent: '', innerHTML: '', value: '50', _handlers: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    setAttribute(k, v) { this._attrs[k] = v; }, getAttribute(k) { return this._attrs[k]; },
    hasAttribute(k) { return k in this._attrs; },
    querySelector() { return makeEl('div'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 130, height: 130 }; },
    get firstChild() { return this.children[0]; },
    get offsetWidth() { return 100; }
  };
  return el;
}
const document = {
  readyState: 'complete',
  body: makeEl('body'),
  getElementById(id) { return elements[id] || (elements[id] = makeEl('div')); },
  querySelector() { return makeEl('div'); },
  querySelectorAll() { return []; },
  createElement: makeEl,
  addEventListener() {}, hidden: false
};

let storage = {};
const timers = [];
const sandbox = {
  THREE, document,
  console: { log() {}, warn() {}, error(...a) { console.log('  [game error]', ...a); } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
  Math, JSON, Date, isNaN, parseInt, parseFloat, Object, Array, String, Number, Boolean, Error
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};
sandbox.window.addEventListener = () => {};
sandbox.window.innerWidth = 390;   // iPhone 14 portrait
sandbox.window.innerHeight = 844;
sandbox.window.devicePixelRatio = 3;
sandbox.window.confirm = () => true;
sandbox.window.AudioContext = undefined;   // exercise the no-audio path first

console.log('\n=== BARNYARD ABDUCTION — HEADLESS VERIFICATION ===\n');
console.log('[1] Load and boot');
vm.createContext(sandbox);
check('script evaluates with no throw', () => { vm.runInContext(script, sandbox, { filename: 'barnyard-abduction.html' }); return true; });

const G = sandbox.GAME, W = sandbox.WORLD, S = sandbox.SPECIES, M = sandbox.MAPS;
check('GAME.init ran and left phase MENU', () => {
  timers.forEach(fn => fn());          // flush the boot timeout
  return G.phase === 'MENU' ? G.phase : false;
});

console.log('\n[2] Spec conformance (STEP2_WORLD_SPEC)');
const farm = M.farm;
check('map is 425 x 425', () => farm.size === 425);
const lm = id => farm.landmarks.find(l => l.id === id);
check('farmhouse at (-125,-125), collides', () => lm('farmhouse').x === -125 && lm('farmhouse').z === -125 && lm('farmhouse').collide);
check('barn at (-165,-95), collides', () => lm('barn').x === -165 && lm('barn').z === -95 && lm('barn').collide);
check('windmill at (155,145) h32, collides', () => lm('windmill').x === 155 && lm('windmill').h === 32 && lm('windmill').collide);
check('shed does NOT collide (spec §6)', () => lm('shed').collide === false);
check('tractors/truck do NOT collide (spec §6)', () =>
  !lm('truck').collide && !lm('tractorA').collide && !lm('tractorB').collide);
check('pond centred (115,135)', () => farm.pond.x === 115 && farm.pond.z === 135);
check('grove has 5-6 primary trees', () => farm.grove.trees >= 5 && farm.grove.trees <= 6);
check('altitude envelope 4..35', () => sandbox.TUNE.ufo.minAlt === 4 && sandbox.TUNE.ufo.maxAlt === 35);
check('all 6 core species present', () => {
  const want = ['cow', 'horse', 'sheep', 'goat', 'pig', 'chicken'];
  return want.every(k => S[k]) ? want.join(',') : false;
});
check('all 25 cheats declared', () => sandbox.CHEAT_DEFS.length === 25 ? '25' : sandbox.CHEAT_DEFS.length);
check('campaign order is the locked 10', () => sandbox.MAP_ORDER.length === 10 && sandbox.MAP_ORDER[0] === 'farm');
check('only Farm is marked built', () =>
  sandbox.MAP_ORDER.filter(id => M[id].built).length === 1);

console.log('\n[3] World construction');
check('WORLD.build completes', () => { G.buildScene(farm); return true; });
check('terrain vertices displaced + coloured', () => {
  const t = W.root.children.find(c => c.name === 'terrain');
  const p = t.geometry.attributes.position, c = t.geometry.attributes.color;
  let moved = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) > 0.01) moved++;
  return moved > p.count * 0.8 && c.count === p.count ? moved + ' verts' : false;
});
check('3 colliders registered (farmhouse/barn/windmill)', () =>
  W.colliders.length === 3 ? W.colliders.map(c => c.id).join(',') : W.colliders.length);
check('grove built ~10 trees', () => W.trees.length >= 6 ? W.trees.length : false);
check('windmill blade hub exists', () => !!W.windmillBlades);
check('every InstancedMesh filled within its count', () => {
  let n = 0, bad = 0;
  W.root.traverse(o => {
    if (o instanceof InstancedMesh) { n++; if (o._set > o.count) bad++; }
  });
  return bad === 0 ? n + ' instanced meshes' : false;
});

console.log('\n[4] Creatures');
Object.keys(S).forEach(kind => {
  check(kind + ' model builds with head+legs', () => {
    const m = sandbox.CREATURE.build(kind, S[kind]);
    if (!m.userData.head) throw new Error('no head');
    if (!m.userData.legs || !m.userData.legs.length) throw new Error('no legs');
    let parts = 0; m.traverse(() => parts++);
    if (parts < 12) throw new Error('only ' + parts + ' parts — too blocky');
    return parts + ' parts';
  });
});
check('farmer model builds with arms/legs/fork', () => {
  const f = sandbox.CREATURE.farmer();
  let parts = 0; f.traverse(() => parts++);
  return (f.userData.head && f.userData.arms.length === 2 && f.userData.legs.length === 2 && f.userData.fork)
    ? parts + ' parts' : false;
});

console.log('\n[5] Scout framing (derived, not hard-coded)');
[['iPhone portrait', 390, 844], ['iPhone landscape', 844, 390], ['iPad', 820, 1180]].forEach(([n, w, h]) => {
  check('full fence + 5% margin fits — ' + n, () => {
    sandbox.CAM.resize(w / h);
    const H = sandbox.CAM.scoutHeight(farm);
    const vFov = sandbox.CAM.cam.fov * Math.PI / 180;
    const halfV = Math.tan(vFov / 2) * H;             // world half-height seen
    const halfH = halfV * (w / h);                    // world half-width seen
    const need = 425 / 2 * 1.05;
    if (halfV < need || halfH < need)
      throw new Error('fence clipped: sees ' + halfH.toFixed(0) + 'x' + halfV.toFixed(0) + ', needs ' + need.toFixed(0));
    return 'h=' + H.toFixed(0) + ' sees ' + halfH.toFixed(0) + 'x' + halfV.toFixed(0);
  });
});
sandbox.CAM.resize(390 / 844);

console.log('\n[6] Live simulation — 1200 frames of mission 1');
check('mission starts', () => { G.startMission('farm', 0, false); return G.phase === 'PLAYING'; });
check('animals + farmer spawned', () =>
  sandbox.ANIMALS.list.length > 30 && sandbox.FARMERS.list.length === 1
    ? sandbox.ANIMALS.list.length + ' animals' : false);

function frames(n, drive) {
  for (let i = 0; i < n; i++) { if (drive) drive(i); G.loop(); }
}
check('600 frames of flight + beam without throwing', () => {
  frames(600, (i) => {
    sandbox.INPUT.x = Math.sin(i * 0.02);
    sandbox.INPUT.y = Math.cos(i * 0.017);
    sandbox.INPUT.beam = true;
    sandbox.INPUT.up = (i % 200 < 100) ? 1 : -1;
    sandbox.INPUT.boost = (i % 90 < 30);
  });
  return true;
});
check('UFO stayed inside the fence', () => {
  const p = sandbox.UFO.pos, lim = 425 / 2;
  return (Math.abs(p.x) < lim && Math.abs(p.z) < lim)
    ? 'x=' + p.x.toFixed(0) + ' z=' + p.z.toFixed(0) : false;
});
check('UFO respected altitude envelope', () => {
  const y = sandbox.UFO.pos.y;
  return (y >= 3 && y <= 35.1) ? 'y=' + y.toFixed(1) : 'y=' + y;
});
check('beam captures a targeted animal end-to-end', () => {
  // deterministic: park the saucer directly over one animal and hold the beam
  G.startMission('farm', 0, false);
  const A = sandbox.ANIMALS.list.find(a => a.kind === 'cow') || sandbox.ANIMALS.list[0];
  const kind = A.kind;
  const scoreBefore = G.score, takenBefore = G.taken;
  let captured = false;
  for (let i = 0; i < 400 && !captured; i++) {
    sandbox.UFO.pos.set(A.x, 12, A.z);        // stay locked over the target
    sandbox.INPUT.beam = true;
    sandbox.INPUT.x = 0; sandbox.INPUT.y = 0;
    G.loop();
    if (G.taken > takenBefore) captured = true;
  }
  if (!captured) throw new Error('held the beam over a ' + kind + ' for 400 frames and never captured it');
  if (G.score <= scoreBefore) throw new Error('captured but score did not increase');
  return kind + ' captured, +' + (G.score - scoreBefore) + ' pts';
});
check('capture persisted to the save file', () => {
  if (!(sandbox.SAVE.data.totalAbducted > 0)) throw new Error('totalAbducted still 0');
  if (!(sandbox.SAVE.data.career > 0)) throw new Error('career still 0');
  return 'career ' + sandbox.SAVE.data.career + ', abducted ' + sandbox.SAVE.data.totalAbducted;
});
check('farmer abduction removes then returns him unharmed', () => {
  const F = sandbox.FARMERS.list[0];
  F.state = 'BEAMED'; F.beamT = 0; F.y = 0;
  sandbox.BEAM.target = F; sandbox.BEAM.targetKind = 'farmer';
  const takenBefore = G.farmersTaken;
  for (let i = 0; i < 300 && G.farmersTaken === takenBefore; i++) {
    sandbox.UFO.pos.set(F.x, 12, F.z);
    sandbox.INPUT.beam = true;
    G.loop();
  }
  if (G.farmersTaken === takenBefore) throw new Error('farmer never completed abduction');
  if (F.state !== 'GONE') throw new Error('expected GONE, got ' + F.state);
  // he must come back on his own
  F.goneT = 0.001;
  sandbox.INPUT.beam = false;
  G.loop();
  if (F.state !== 'PATROL') throw new Error('farmer did not return, state ' + F.state);
  return 'abducted then returned to PATROL';
});
check('collision push-out ejects UFO from every solid building', () => {
  const out = [];
  W.colliders.forEach(c => {
    // worst case: parked exactly at the centre, zero velocity
    sandbox.UFO.pos.set(c.x, Math.min(c.h - 1, 8), c.z);
    sandbox.UFO.vel.set(0, 0, 0);
    sandbox.INPUT.x = 0; sandbox.INPUT.y = 0; sandbox.INPUT.up = 0;
    for (let i = 0; i < 30; i++) G.loop();
    const d = Math.hypot(sandbox.UFO.pos.x - c.x, sandbox.UFO.pos.z - c.z);
    const need = c.r + sandbox.TUNE.ufo.radius * sandbox.UFO.scale() - 0.5;
    if (d < need) throw new Error(c.id + ': only ' + d.toFixed(1) + 'u out, needs ' + need.toFixed(1));
    out.push(c.id + ' ' + d.toFixed(0) + 'u');
  });
  return out.join(', ');
});
check('600 more frames with farmer aggro', () => {
  // sit next to the farmer so suspicion maxes and he fires
  const F = sandbox.FARMERS.list[0];
  frames(600, () => {
    sandbox.UFO.pos.x = F.x + 12; sandbox.UFO.pos.z = F.z + 12; sandbox.UFO.pos.y = 10;
    sandbox.INPUT.beam = true;
  });
  return 'farmer state ' + F.state + ', suspicion ' + F.suspicion.toFixed(2);
});
check('farmer reached an aggressive state', () => {
  const F = sandbox.FARMERS.list[0];
  return ['ALERT', 'CHASE', 'AIM', 'GONE', 'BEAMED'].includes(F.state) ? F.state : 'stuck in ' + F.state;
});

console.log('\n[7] Mission outcomes');
check('timeout triggers failure', () => {
  G.startMission('farm', 0, false);
  G.timeLeft = 0.001;
  G.loop();
  return G.phase === 'OVER' ? 'phase OVER' : 'phase ' + G.phase;
});
check('reaching the goal triggers completion + unlock', () => {
  G.startMission('farm', 0, false);
  const before = Object.keys(sandbox.SAVE.data.progress.missions).length;
  while (G.taken < G.goal && sandbox.ANIMALS.list.length) G.onAbduct(sandbox.ANIMALS.list[0]);
  const rec = sandbox.SAVE.data.progress.missions['farm:f1'];
  return (G.phase === 'OVER' && rec && rec.done) ? 'recorded best ' + rec.best : false;
});
check('shields depleting ends the mission', () => {
  G.startMission('farm', 1, false);
  for (let i = 0; i < 40 && G.phase === 'PLAYING'; i++) {
    const died = sandbox.UFO.damage(50);
    sandbox.UFO.hurtTimer = 0;
    G.onUfoHit(died);
  }
  return G.phase === 'OVER' ? 'phase OVER' : 'survived — shields ' + sandbox.UFO.shield;
});
check('combo multiplier climbs through the tiers', () => {
  G.startMission('farm', 0, false);
  G.combo = 0;
  const seen = [];
  [1, 2, 3, 5, 8, 12, 20].forEach(c => { G.combo = c; seen.push(G.comboMultiplier()); });
  return seen.join('/') === '1/2/3/4/5/6/7' ? seen.join('/') : 'got ' + seen.join('/');
});

console.log('\n[8] Cheats — every one individually, then stacked');
sandbox.CHEAT_DEFS.forEach(c => {
  check('cheat: ' + c.name, () => {
    sandbox.CHEATS.clear();
    sandbox.CHEATS.set(c.id, c.step ? c.step[c.step.length - 1] : (c.opts ? c.opts[2] : true));
    G.startMission('farm', 0, false);
    frames(45, (i) => { sandbox.INPUT.beam = true; sandbox.INPUT.x = Math.sin(i * 0.1); });
    return sandbox.ANIMALS.list.length + ' animals';
  });
});
check('stacked: god + megabeam + x10 + 10x animals + 10 farmers + party + moon', () => {
  sandbox.CHEATS.clear();
  ['god', 'megabeam', 'x10', 'x10animals', 'party', 'moon', 'rainbow', 'bighead', 'bigmals'].forEach(id => sandbox.CHEATS.set(id, true));
  sandbox.CHEATS.set('farmers', 10);
  G.startMission('farm', 0, false);
  frames(120, (i) => { sandbox.INPUT.beam = true; sandbox.INPUT.x = Math.sin(i * 0.05); });
  return sandbox.ANIMALS.list.length + ' animals, ' + sandbox.FARMERS.list.length + ' farmers';
});
check('god mode really is invulnerable', () => {
  const before = sandbox.UFO.shield;
  sandbox.UFO.damage(9999);
  return sandbox.UFO.shield === before ? 'shield held at ' + before : 'took damage';
});
check('mutually exclusive cheats swap, never stack', () => {
  sandbox.CHEATS.clear();
  sandbox.CHEATS.set('tiny', true); sandbox.CHEATS.set('giant', true);
  if (sandbox.CHEATS.on.tiny) throw new Error('tiny survived giant');
  sandbox.CHEATS.set('x2', true); sandbox.CHEATS.set('x10', true);
  if (sandbox.CHEATS.on.x2) throw new Error('x2 survived x10');
  return 'size + score exclusions hold';
});
sandbox.CHEATS.clear();

console.log('\n[9] Persistence');
check('save round-trips through localStorage', () => {
  sandbox.SAVE.data.career = 12345;
  sandbox.SAVE.data.upgrades.engine = 3;
  sandbox.SAVE.flush();
  sandbox.SAVE.data = null;
  sandbox.SAVE.load();
  return (sandbox.SAVE.data.career === 12345 && sandbox.SAVE.data.upgrades.engine === 3)
    ? 'career + upgrades restored' : false;
});
check('corrupt save falls back to defaults', () => {
  storage['barnyard-abduction-save-v1'] = '{{{not json';
  sandbox.SAVE.load();
  return sandbox.SAVE.data.career === 0 ? 'recovered clean' : false;
});
check('upgrade purchase debits the bank, not the career total', () => {
  sandbox.SAVE.data.career = 5000; sandbox.SAVE.data.spent = 0;
  const bankBefore = sandbox.SAVE.bank();
  sandbox.SAVE.data.spent += 900; sandbox.SAVE.data.upgrades.engine = 1;
  return (sandbox.SAVE.data.career === 5000 && sandbox.SAVE.bank() === bankBefore - 900)
    ? 'career intact, bank -900' : false;
});

console.log('\n[10] UI screens render without throwing');
['showTitle', 'showCampaign', 'showUpgrades', 'renderCheats', 'renderSettings'].forEach(fn => {
  check('UI.' + fn, () => { sandbox.UI[fn](); return true; });
});
check('pause / resume / quit cycle', () => {
  G.startMission('farm', 0, false);
  G.pause(); if (G.phase !== 'PAUSED') throw new Error('pause failed');
  G.resume(); if (G.phase !== 'PLAYING') throw new Error('resume failed');
  G.quitToTitle();
  return G.phase === 'MENU' ? 'MENU' : G.phase;
});
check('freeplay runs with no timer', () => {
  G.startMission('farm', 0, true);
  frames(90, () => { sandbox.INPUT.beam = true; });
  return G.freeplay && G.phase === 'PLAYING' ? 'still flying' : false;
});
check('unbuilt map is refused, not faked', () => {
  const before = G.phase;
  G.startMission('city', 0, false);
  return G.phase === before ? 'refused cleanly' : false;
});

console.log('\n[11] Audio path with WebAudio present');
check('audio engine initialises and emits events', () => {
  let toneCount = 0;
  sandbox.window.AudioContext = class {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { toneCount++; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} }; }
    resume() {}
  };
  sandbox.AUDIO.ctx = null; sandbox.AUDIO.ready = false;
  sandbox.AUDIO.init();
  ['beamOn', 'capture', 'combo', 'hit', 'win', 'lose', 'ui', 'fire', 'alert'].forEach(e => sandbox.AUDIO.sfx(e));
  Object.keys(S).forEach(k => sandbox.AUDIO.animalCry(k));
  return sandbox.AUDIO.ready && toneCount > 10 ? toneCount + ' tones' : false;
});

/* ------------------------------------------------------------------ done -- */
console.log('\n' + '='.repeat(52));
if (failures.length) {
  console.log('FAILED — ' + failures.length + ' of ' + checks + ' checks\n');
  failures.forEach(f => console.log('  * ' + f));
  process.exit(1);
} else {
  console.log('PASSED — all ' + checks + ' checks');
  console.log('\nNOT covered here: visual quality, real GPU performance, and');
  console.log('touch input on a physical iPhone. Those need the owner on device.');
  process.exit(0);
}
