// ===SECTION 2===
/* Operation Blackgate — configuration and shared constants.
   Everything the rest of the file tunes against lives here. */
'use strict';

var CELL = 4;          // world units per grid cell (4m tile)
var WALL_H = 3.5;      // wall height
var WALL_T = 0.2;      // wall slab thickness

var CFG = {
  camera: { fov: 75, near: 0.05, far: 100, eyeHeight: 1.65, crouchEye: 0.95 },
  player: {
    width: 0.4, height: 1.8, depth: 0.4,
    walkSpeed: 4.6, sprintMul: 1.6, crouchMul: 0.5,
    accel: 42, friction: 14, gravity: 22, stepUp: 0.55,
    maxHealth: 100, maxArmor: 100
  },
  render: {
    pixelRatioCap: 2,           // spec cap; the dynamic resolution scaler works under it
    shadowMapSize: 512,
    shadowLightsDesktop: 6,     // hard ceiling from the brief
    shadowLightsMobile: 2,      // cube shadows are 6 render passes each — mobile cannot pay for 6
    lightPoolSize: 8,           // constant light count: changing it would recompile every material
    fixtureSpacing: 8,          // world units between ceiling fluorescents
    bloomThreshold: 0.78,
    bloomIntensity: 0.85,
    bloomScale: 0.5,            // bloom targets run at half resolution
    fogDensity: 0.06,
    fogColor: 0x0d0d1a
  },
  gfx: {
    bloomThreshold: 0.85, bloomStrength: 0.4, bloomRadius: 0.5,
    vignetteDarkness: 0.45, vignetteOffset: 0.95,
    // wide gap between the two: a machine has to be clearly comfortable before
    // quality climbs back, so the two thresholds can never chase each other
    exposure: 1.2, downgradeMs: 22, upgradeMs: 13,
    shadowSize: 1024, shadowLights: 2,     // two key lights cast; the cap is six
    muzzleFlashMs: 80
  },
  colors: {
    fluoro: 0xccddff,           // ceiling fixture white
    alarm: 0xff1500,
    ambient: 0x0a0a0a,          // near-black: fixtures light the scene, not fill
    hemiSky: 0x8888aa,
    hemiGround: 0x444422,
    muzzle: 0xffaa22,
    blood: 0xaa1111,
    screenGlow: 0x59d0ff,
    objectiveGlow: 0xffb128
  },
  // GoldenEye's targeting was never a raw crosshair — the N64 game snapped the
  // shot onto a guard inside a generous cone. On a phone, where the look stick
  // is the whole aiming budget, that is the difference between a fight and a
  // chore. Held deliberately weak: it only bends a shot that was already close,
  // it needs clear line of sight, and it stands down while you are aiming down
  // sights so a deliberate headshot is still yours to take.
  assist: { radius: 0.8, pull: 0.7, pullMouse: 0.45, maxRange: 40,
            bodyLow: 0.35, bodyHigh: 1.7 },
  ai: {
    sightRange: 20, sightFov: Math.PI / 3,      // 60 degrees half-cone from the brief
    skipDistance: 25, alertPause: 0.6, searchTimeout: 8,
    fireRange: 18, hearingRadius: 22, suppressedHearing: 7
  },
  difficulty: [
    { name: 'Agent',        dmgTaken: 0.6, aim: 0.55, reaction: 0.85, health: 1.2 },
    { name: 'Secret Agent', dmgTaken: 1.0, aim: 1.0,  reaction: 0.6,  health: 1.0 },
    { name: '00 Agent',     dmgTaken: 1.5, aim: 1.35, reaction: 0.42, health: 0.85 }
  ],
  // GoldenEye's loop: you go in with a pistol and take the guards' rifles.
  pickups: {
    radius: 1.1,               // walk-over collection distance
    armor: 50,                 // one vest; two fill the bar
    kf7Drop: [12, 22],         // rounds in a fallen guard's rifle
    kf7Crate: 60,
    kf7ReserveCap: 240
  },
  saveKey: 'blackgate.save.v2',
  legacySaveKey: 'blackgate.save.v1'
};

/* ---------- cheats ----------
   GoldenEye's cheats were earned, not typed in: beat a level on a tier, or
   under a target time, and something silly or powerful unlocked. Same here.
   Any active cheat keeps the run off the best-time table and earns nothing. */
var CHEATS = [
  { id: 'paintball', name: 'Paintball Mode', rule: 'Complete the mission on Agent',
    earned: function (r) { return r.tier >= 0; } },
  { id: 'dk', name: 'DK Mode', rule: 'Complete the mission on Secret Agent',
    earned: function (r) { return r.tier >= 1; } },
  { id: 'turbo', name: 'Turbo Mode', rule: 'Complete the mission on 00 Agent',
    earned: function (r) { return r.tier >= 2; } },
  { id: 'ammo', name: 'Infinite Ammo', rule: 'Complete Secret Agent in under 3:30',
    earned: function (r) { return r.tier >= 1 && r.time < 210; } },
  { id: 'invincible', name: 'Invincibility', rule: 'Complete 00 Agent in under 3:00',
    earned: function (r) { return r.tier >= 2 && r.time < 180; } }
];
function cheatOn(id) { return !!(SAVE.cheatsOn[id] && SAVE.unlocked[id]); }
function anyCheatOn() {
  for (var i = 0; i < CHEATS.length; i++) if (cheatOn(CHEATS[i].id)) return true;
  return false;
}

/* Grid cell codes used by the level map. */
var C_OPEN = 0, C_WALL = 1, C_DOOR = 2, C_START = 3, C_EXIT = 4;

var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE = IS_TOUCH && Math.min(window.innerWidth, window.innerHeight) < 900;

/* Shared scratch objects — the frame loop must not allocate. */
var _v1 = null, _v2 = null, _v3 = null;   // filled once THREE exists (Section 4 init)

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function randRange(a, b) { return a + Math.random() * (b - a); }
function fmtClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
/* Cell centre in world space. */
function cellToWorldX(gx) { return (gx + 0.5) * CELL; }
function cellToWorldZ(gz) { return (gz + 0.5) * CELL; }
function worldToCellX(x) { return Math.floor(x / CELL); }
function worldToCellZ(z) { return Math.floor(z / CELL); }

/* ---------- shared game state and world bootstrap ----------
   These live with the constants rather than down in the loop section for one
   concrete reason: the automated suite in Section 11 asserts against a real
   constructed world, and separate <script> blocks only see declarations from
   blocks that have already executed. Keeping the state singleton and the
   idempotent bootWorld() up here lets Section 11 run against the genuine
   article before Section 12 ever starts the frame loop. */
var GAME = {
  state: 'menu',            // menu | playing | paused | over
  elapsed: 0, difficulty: 1,
  alarm: false, alarmAt: 0, kills: 0, bodies: 0,
  objectives: { terminal: false, escaped: false, stockpile: false },
  sciKills: 0, tanksLeft: 0,
  // GoldenEye's debrief broke every hit down by where it landed
  stats: { shots: 0, hits: 0, head: 0, torso: 0, limb: 0 },
  cheated: false,           // latched at mission start
  noise: { x: 0, z: 0, r: 0, t: 0 },
  frameCount: 0, lastTime: 0, raf: 0,
  showStats: false, booted: false
};
var player = null;          // alias the test suite reads
var collidables = null;

function bootWorld() {
  if (GAME.booted) return true;
  var canvas = document.getElementById('c');
  if (!initRenderer(canvas)) {
    document.getElementById('screenFatal').classList.add('on');
    document.getElementById('screenTitle').classList.remove('on');
    return false;
  }
  buildTextures();
  buildMaterials();
  buildEnvironment();

  var level = buildLevel(PLAN);
  buildProps(level);
  buildNav(level);
  buildPickups(level);
  for (var i = 0; i < level.meshes.length; i++) RENDER.scene.add(level.meshes[i]);
  RENDER.scene.add(level.props);
  setupLights(level);
  initPostFX();
  resizeRenderer();

  PLAYER = makePlayer();
  player = PLAYER;
  collidables = level.collidables;
  PLAYER.pos.copy(level.spawnPoints.player);

  buildWeapons();
  spawnEnemies();
  initHUD();
  GAME.booted = true;
  return true;
}

/* ---------- persistence ----------
   One validated record: best time per tier, unlocked cheats, which cheats are
   switched on, and every option. localStorage is wrapped throughout because
   Safari private mode throws on write; the game then simply keeps the record
   in memory for the session. Everything read back is type- and range-checked,
   so a hand-edited or corrupted save degrades to defaults field by field
   instead of taking the game down. */
var SETTINGS_DEFAULT = {
  sensitivity: 1.0, invertY: false, volume: 0.75,
  bloom: true, shadows: true, stats: false,
  lookMode: 'swipe'          // touch look: 'swipe' (drag = direct look) or 'stick' (rate)
};
var SAVE = {
  best: [0, 0, 0], unlocked: {}, cheatsOn: {},
  settings: JSON.parse(JSON.stringify(SETTINGS_DEFAULT))
};

function validTime(t) { return typeof t === 'number' && isFinite(t) && t > 0 && t < 86400; }

function sanitizeSave(o) {
  var out = { best: [0, 0, 0], unlocked: {}, cheatsOn: {},
              settings: JSON.parse(JSON.stringify(SETTINGS_DEFAULT)) };
  if (!o || typeof o !== 'object') return out;
  if (Array.isArray(o.best)) {
    for (var i = 0; i < 3; i++) if (validTime(o.best[i])) out.best[i] = o.best[i];
  }
  for (var c = 0; c < CHEATS.length; c++) {
    var id = CHEATS[c].id;
    if (o.unlocked && o.unlocked[id] === true) out.unlocked[id] = true;
    if (o.cheatsOn && o.cheatsOn[id] === true && out.unlocked[id]) out.cheatsOn[id] = true;
  }
  var s = o.settings;
  if (s && typeof s === 'object') {
    var d = out.settings;
    if (typeof s.sensitivity === 'number' && isFinite(s.sensitivity)) d.sensitivity = clamp(s.sensitivity, 0.3, 2.6);
    if (typeof s.volume === 'number' && isFinite(s.volume)) d.volume = clamp(s.volume, 0, 1);
    if (typeof s.invertY === 'boolean') d.invertY = s.invertY;
    if (typeof s.bloom === 'boolean') d.bloom = s.bloom;
    if (typeof s.shadows === 'boolean') d.shadows = s.shadows;
    if (typeof s.stats === 'boolean') d.stats = s.stats;
    if (s.lookMode === 'swipe' || s.lookMode === 'stick') d.lookMode = s.lookMode;
  }
  return out;
}

function loadSave() {
  var raw = null;
  try { raw = window.localStorage.getItem(CFG.saveKey); } catch (e) { raw = null; }
  var parsed = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
  if (!parsed) {
    // v1 kept a single best time with no tier; it was almost always set on the
    // default tier, so that is where it is carried forward to.
    try {
      var old = JSON.parse(window.localStorage.getItem(CFG.legacySaveKey) || 'null');
      if (old && validTime(old.best)) parsed = { best: [0, old.best, 0] };
    } catch (e) {}
  }
  var s = sanitizeSave(parsed);
  SAVE.best = s.best; SAVE.unlocked = s.unlocked; SAVE.cheatsOn = s.cheatsOn; SAVE.settings = s.settings;
}

function writeSave() {
  try {
    window.localStorage.setItem(CFG.saveKey, JSON.stringify({
      v: 2, best: SAVE.best, unlocked: SAVE.unlocked, cheatsOn: SAVE.cheatsOn, settings: SAVE.settings
    }));
  } catch (e) {}
}

function eraseSave() {
  var s = sanitizeSave(null);
  SAVE.best = s.best; SAVE.unlocked = s.unlocked; SAVE.cheatsOn = s.cheatsOn; SAVE.settings = s.settings;
  try {
    window.localStorage.removeItem(CFG.saveKey);
    window.localStorage.removeItem(CFG.legacySaveKey);
  } catch (e) {}
}

/* ---------- objectives, win and loss ----------
   GoldenEye's best structural idea was that the difficulty setting did not
   just move numbers around: each tier added objectives on top of the last, so
   the same level asked something new of you. Agent gets in and out. Secret
   Agent also has to destroy the stockpile the facility exists to make. 00
   Agent has to do all of it without killing a single member of staff, which
   turns every panicking scientist who runs across your sights into a problem.

   Objectives are data. The HUD, the briefing, the pause screen and the win
   condition all read this one list, so adding another is a single entry. */
var OBJECTIVES = [
  { id: 'archive', tier: 0, letter: 'A',
    text: 'Download the research archive',
    brief: 'Reach the control room and pull the archive off the terminal.',
    done: function () { return GAME.objectives.terminal; } },
  { id: 'stockpile', tier: 1, letter: 'B',
    text: 'Destroy the nerve-gas stockpile',
    brief: 'The plant holds the finished agent in four tanks. Rupture every one.',
    done: function () { return GAME.objectives.stockpile; } },
  { id: 'staff', tier: 2, letter: 'C', constraint: true,
    text: 'Leave no lab staff dead',
    brief: 'The scientists are civilians under duress. Bring them all out alive.',
    done: function () { return GAME.sciKills === 0; },
    failed: function () { return GAME.sciKills > 0; } },
  { id: 'escape', tier: 0, letter: 'D', last: true,
    text: 'Exit through the chemical plant',
    brief: 'The plant door unlocks once the archive is yours.',
    done: function () { return GAME.objectives.escaped; } }
];

function objectiveById(id) {
  for (var i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].id === id) return OBJECTIVES[i];
  return null;
}

/* The objectives in play at the current difficulty, in briefing order. */
function activeObjectives() {
  var out = [], i;
  for (i = 0; i < OBJECTIVES.length; i++) {
    var o = OBJECTIVES[i];
    if (o.tier <= GAME.difficulty && !o.last) out.push(o);
  }
  for (i = 0; i < OBJECTIVES.length; i++) {
    if (OBJECTIVES[i].last) out.push(OBJECTIVES[i]);
  }
  // relabel A, B, C... so the list always reads in order at every tier
  for (i = 0; i < out.length; i++) out[i].letter = String.fromCharCode(65 + i);
  return out;
}

/* Every objective except the final exit has to be met before the exit counts. */
function fieldObjectivesMet() {
  var list = activeObjectives();
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.last) continue;
    if (!o.done()) return false;
  }
  return true;
}
/* The field objectives you can still act on: everything except the exit and
   the constraints. A constraint is either intact or lost for good, so it can
   never be what stands between you and the door. */
function outstandingObjectives() {
  var list = activeObjectives(), out = [];
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.last || o.constraint) continue;
    if (!o.done()) out.push(o);
  }
  return out;
}
function anyObjectiveFailed() {
  var list = activeObjectives();
  for (var i = 0; i < list.length; i++) if (list[i].failed && list[i].failed()) return true;
  return false;
}
/* Reaching the exit with the actionable objectives done ends the mission. It
   used to demand the constraints too, so a single dead scientist on 00 Agent
   left the exit permanently inert: a soft lock with nothing on screen to say
   why. GoldenEye's rule is the one used here -- you can always leave, and the
   debrief tells you the mission failed because an objective did. */
function checkExtraction() {
  return playerIsAtExit() && outstandingObjectives().length === 0;
}
function checkWin() {
  return checkExtraction() && !anyObjectiveFailed();
}
function checkLoss() {
  return player.health <= 0;
}
function playerIsAtExit() {
  if (!LEVEL) return false;
  var e = LEVEL.spawnPoints.exit;
  return Math.hypot(PLAYER.pos.x - e.x, PLAYER.pos.z - e.z) < 2.6;
}

var TERMINAL_HOLD = 1.2;     // seconds of USE to pull the archive

function updateInteraction(dt) {
  var t = LEVEL.terminal;
  var prompt = null;
  var d = Math.hypot(PLAYER.pos.x - t.pos.x, PLAYER.pos.z - t.pos.z);
  if (!t.used && d < 2.8 && Math.abs(PLAYER.pos.y + PLAYER.eye - t.pos.y) < 2.4) {
    if (INPUT.interact) {
      PLAYER.interactHold += dt;
      if (PLAYER.interactHold >= TERMINAL_HOLD) {
        completeTerminal();
      }
    } else PLAYER.interactHold = Math.max(0, PLAYER.interactHold - dt * 2);
    var n = Math.round(clamp(PLAYER.interactHold / TERMINAL_HOLD, 0, 1) * 10);
    prompt = 'HOLD USE · DOWNLOAD ' + PROGRESS_BARS[n];
  } else if (playerIsAtExit()) {
    // Standing at the door with work left used to say nothing at all.
    var left = outstandingObjectives();
    if (left.length) prompt = 'EXIT HELD · ' + left[0].text.toUpperCase();
  }
  hudPrompt(prompt);
}
/* The eleven possible download bars, built once rather than a string per frame. */
var PROGRESS_BARS = (function () {
  var out = [];
  for (var n = 0; n <= 10; n++) {
    var s = '';
    for (var i = 0; i < 10; i++) s += (i < n ? '█' : '░');
    out.push(s);
  }
  return out;
})();

function completeTerminal() {
  var t = LEVEL.terminal;
  if (t.used) return;
  t.used = true;
  GAME.objectives.terminal = true;
  PLAYER.interactHold = 0;
  t.screen.material = MAT.ledGreen;
  t.led.material = MAT.ledGreen;
  sfxTerminal();
  hudToast(GAME.objectives.stockpile || GAME.difficulty < 1
    ? 'Research archive downloaded. The plant exit is unlocked.'
    : 'Archive downloaded. Exit unlocked -- the stockpile still stands.');
  hudUpdateObjectives();
  // unlock the exit doors
  for (var i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    if (d.locked) { d.locked = false; setDoorLamps(d, MAT.ledGreen); }
  }
}

// ===SECTION 3===
/* Procedural materials and the level itself. Nothing is loaded — every texture
   is drawn to a canvas at startup and every wall is a box on a 4m grid. */

var TEX = {};      // texture cache
var MAT = {};      // material cache

/* ---------- procedural texture generation ---------- */

/* Tile normal map: flat blue field with recessed grout lines. */
function makeTileNormalMap(size, tileCount) {
  size = size || 256; tileCount = tileCount || 4;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  var tileSize = size / tileCount;
  var groutWidth = 4;

  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Grout: two offset strips per line so the groove has a lit side and a dark
  // side rather than reading as a flat painted stripe.
  for (var i = 0; i <= tileCount; i++) {
    var p = i * tileSize;
    ctx.fillStyle = 'rgb(96,128,210)';
    ctx.fillRect(p - groutWidth / 2, 0, groutWidth / 2, size);
    ctx.fillRect(0, p - groutWidth / 2, size, groutWidth / 2);
    ctx.fillStyle = 'rgb(160,128,210)';
    ctx.fillRect(p, 0, groutWidth / 2, size);
    ctx.fillRect(0, p, size, groutWidth / 2);
  }
  // Fine surface break-up so large walls are not perfectly smooth under a light.
  var img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (var k = 0; k < d.length; k += 4) {
    var n = (Math.random() - 0.5) * 12;
    d[k] = clamp(d[k] + n, 0, 255);
    d[k + 1] = clamp(d[k + 1] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);

  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* Albedo for tiled surfaces: base colour, grout, per-tile shade variation and grime. */
function makeTileAlbedo(opts) {
  var size = opts.size || 256, tiles = opts.tiles || 4;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  var ts = size / tiles;

  ctx.fillStyle = opts.grout || '#5d5a52';
  ctx.fillRect(0, 0, size, size);

  for (var ty = 0; ty < tiles; ty++) {
    for (var tx = 0; tx < tiles; tx++) {
      var shade = 1 + (Math.random() - 0.5) * (opts.variation === undefined ? 0.13 : opts.variation);
      var c = opts.base.map(function (v) { return clamp(Math.round(v * shade), 0, 255); });
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.fillRect(tx * ts + 2, ty * ts + 2, ts - 4, ts - 4);
    }
  }
  // grime: soft dark blotches, heavier toward the bottom edge
  var blots = opts.grime === undefined ? 26 : opts.grime;
  for (var i = 0; i < blots; i++) {
    var gx = Math.random() * size, gy = Math.random() * size;
    var r = randRange(size * 0.04, size * 0.16);
    var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, 'rgba(20,18,14,' + randRange(0.05, 0.16).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(20,18,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.283); ctx.fill();
  }
  // fine speckle
  var img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (var k = 0; k < d.length; k += 4) {
    var n = (Math.random() - 0.5) * 14;
    d[k] = clamp(d[k] + n, 0, 255); d[k + 1] = clamp(d[k + 1] + n, 0, 255); d[k + 2] = clamp(d[k + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);

  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;      // colour map — must be sRGB tagged
  return tex;
}

/* Greyscale roughness/scuff map. Linear encoding (data, not colour). */
function makeRoughMap(size, scale, contrast) {
  size = size || 128;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(size, size), d = img.data;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      // cheap value noise: three octaves of smoothed randomness
      var v = 0.5
        + 0.28 * Math.sin(x * 0.21 * scale + Math.sin(y * 0.13 * scale) * 2.0)
        + 0.16 * Math.sin(y * 0.34 * scale + Math.cos(x * 0.19 * scale) * 1.5)
        + (Math.random() - 0.5) * 0.14;
      v = clamp(0.5 + (v - 0.5) * (contrast || 1), 0, 1);
      // Compress into the matte end of the range: this map only ever modulates
      // an already-rough surface, and a full 0..1 swing turns tile into mirror.
      v = 0.66 + v * 0.34;
      var i = (y * size + x) * 4, c = Math.round(v * 255);
      d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* Brushed metal albedo for doors and machinery. */
function makeMetalAlbedo(base) {
  var size = 128;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (var i = 0; i < 420; i++) {
    var y = Math.random() * size;
    ctx.strokeStyle = 'rgba(255,255,255,' + randRange(0.015, 0.07).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + randRange(-1, 1)); ctx.stroke();
  }
  for (i = 0; i < 220; i++) {
    var y2 = Math.random() * size;
    ctx.strokeStyle = 'rgba(0,0,0,' + randRange(0.02, 0.09).toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(size, y2 + randRange(-1, 1)); ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* Panel seam normal map for metal wall panelling. */
function makePanelNormalMap(size, cols, rows) {
  size = size || 256;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  var cw = size / cols, ch = size / rows;
  for (var x = 0; x <= cols; x++) {
    var px = x * cw;
    ctx.fillStyle = 'rgb(88,128,205)';  ctx.fillRect(px - 3, 0, 3, size);
    ctx.fillStyle = 'rgb(168,128,205)'; ctx.fillRect(px, 0, 3, size);
  }
  for (var y = 0; y <= rows; y++) {
    var py = y * ch;
    ctx.fillStyle = 'rgb(128,88,205)';  ctx.fillRect(0, py - 3, size, 3);
    ctx.fillStyle = 'rgb(128,168,205)'; ctx.fillRect(0, py, size, 3);
  }
  // rivet dimples along the seams
  for (var rx = 0; rx < cols; rx++) {
    for (var ry = 0; ry < rows; ry++) {
      var cx = rx * cw + 7, cy = ry * ch + 7;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5);
      g.addColorStop(0, 'rgb(150,150,240)'); g.addColorStop(1, 'rgb(128,128,255)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 6.283); ctx.fill();
    }
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* Suspended ceiling: drop-tile grid with a slight per-tile tint shift. */
function makeDropTileAlbedo(size) {
  size = size || 256;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3c3d3a';
  ctx.fillRect(0, 0, size, size);
  var t = size / 2;
  for (var y = 0; y < 2; y++) {
    for (var x = 0; x < 2; x++) {
      var v = 1 + (Math.random() - 0.5) * 0.12;
      var c = Math.round(150 * v);
      ctx.fillStyle = 'rgb(' + c + ',' + Math.round(c * 0.99) + ',' + Math.round(c * 0.92) + ')';
      ctx.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      // perforation speckle
      for (var i = 0; i < 240; i++) {
        ctx.fillStyle = 'rgba(60,58,52,' + randRange(0.05, 0.22).toFixed(2) + ')';
        ctx.fillRect(x * t + 4 + Math.random() * (t - 8), y * t + 4 + Math.random() * (t - 8), 2, 2);
      }
    }
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* CRT monitor face: scanlines over green terminal text. Scrolls via UV offset. */
function makeMonitorTexture() {
  var w = 256, h = 256;
  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#02120a';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#4dff9b';
  var lines = ['> KELVARA SYS 7', '  CORE TEMP  NOMINAL', '  PRESSURE   1.04 BAR',
               '  VALVE 3    OPEN', '  VALVE 7    CLOSED', '> DIAG --loop', '  0x4F2A OK',
               '  0x4F2B OK', '  0x51C0 WARN', '> _'];
  for (var i = 0; i < lines.length; i++) {
    ctx.globalAlpha = 0.55 + Math.random() * 0.45;
    ctx.fillText(lines[i], 8, 20 + i * 24);
  }
  ctx.globalAlpha = 1;
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  for (var y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* Server rack face: rows of status LEDs. */
function makeServerRackTexture() {
  var w = 128, h = 256;
  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0d10';
  ctx.fillRect(0, 0, w, h);
  for (var row = 0; row < 22; row++) {
    var y = 6 + row * 11;
    ctx.fillStyle = '#161b21';
    ctx.fillRect(4, y, w - 8, 8);
    for (var d = 0; d < 8; d++) {
      var on = Math.random();
      ctx.fillStyle = on > 0.75 ? '#6cff9e' : (on > 0.6 ? '#1d5c33' : '#0e2418');
      ctx.fillRect(10 + d * 13, y + 2, 4, 4);
    }
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* Muzzle flash: radial falloff with a few spokes, drawn once to a canvas. */
function makeFlashTexture() {
  var size = 128;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  var c = size / 2;
  var g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,226,150,0.92)');
  g.addColorStop(0.55, 'rgba(255,150,40,0.42)');
  g.addColorStop(1.0, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < 5; i++) {
    var a = Math.random() * Math.PI * 2, len = c * randRange(0.5, 0.95);
    ctx.strokeStyle = 'rgba(255,210,140,0.5)';
    ctx.lineWidth = randRange(2, 5);
    ctx.beginPath(); ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* EXIT lettering for the plates on the plant exit doors. */
function makeExitTexture() {
  var canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 80;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a0203';
  ctx.fillRect(0, 0, 256, 80);
  ctx.fillStyle = '#ff2a1c';
  ctx.font = 'bold 56px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 128, 42);
  var tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function buildTextures() {
  TEX.tileNormal  = makeTileNormalMap(256, 4);
  TEX.wallAlbedo  = makeTileAlbedo({ base: [171, 163, 142], grout: '#524d43', tiles: 4, grime: 34 });
  TEX.floorAlbedo = makeTileAlbedo({ base: [104, 105, 108], grout: '#37383a', tiles: 2, grime: 40, variation: 0.10 });
  TEX.ceilAlbedo  = makeTileAlbedo({ base: [143, 141, 129], grout: '#4d4b44', tiles: 2, grime: 22, variation: 0.06 });
  TEX.labAlbedo   = makeTileAlbedo({ base: [138, 150, 157], grout: '#454e52', tiles: 4, grime: 26 });
  TEX.plantAlbedo = makeTileAlbedo({ base: [92, 98, 93], grout: '#313531', tiles: 2, grime: 48, variation: 0.16 });
  TEX.metalAlbedo = makeMetalAlbedo('#6a7a6a');
  TEX.bathAlbedo  = makeTileAlbedo({ base: [206, 208, 205], grout: '#7d8079', tiles: 6, grime: 18, variation: 0.07 });
  TEX.panelNormal = makePanelNormalMap(256, 2, 2);
  TEX.dropTile    = makeDropTileAlbedo(256);
  TEX.monitor     = makeMonitorTexture();
  TEX.rackFace    = makeServerRackTexture();
  TEX.flash       = makeFlashTexture();
  TEX.exit        = makeExitTexture();
  TEX.rough       = makeRoughMap(128, 1.0, 1.2);
  TEX.roughFine   = makeRoughMap(128, 2.4, 1.5);
}

/* Clone a texture with its own repeat — CanvasTextures are shared, repeats are not. */
function repeated(tex, rx, ry) {
  var t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

function buildMaterials() {
  var NS = function (x, y) { return new THREE.Vector2(x, y); };

  // Concrete wall: matte, non-metal, with the tile normal supplying relief.
  MAT.wall = new THREE.MeshStandardMaterial({
    color: 0xd6ccb4, roughness: 0.9, metalness: 0.0,
    map: repeated(TEX.wallAlbedo, 1, 1),
    normalMap: repeated(TEX.tileNormal, 4, 2),
    normalScale: NS(0.6, 0.6),
    roughnessMap: repeated(TEX.rough, 2, 1)
  });
  // Metal panel wall: the lab and control wing are panelled, not tiled.
  MAT.wallLab = new THREE.MeshStandardMaterial({
    color: 0x6f7a82, roughness: 0.25, metalness: 0.85, envMapIntensity: 0.9,
    map: repeated(TEX.labAlbedo, 1, 1),
    normalMap: repeated(TEX.panelNormal, 2, 1),
    normalScale: NS(0.85, 0.85),
    roughnessMap: repeated(TEX.roughFine, 2, 1)
  });
  MAT.wallPlant = new THREE.MeshStandardMaterial({
    color: 0x9aa39a, roughness: 0.93, metalness: 0.12,
    map: repeated(TEX.plantAlbedo, 1, 1),
    normalMap: repeated(TEX.tileNormal, 2, 1),
    normalScale: NS(0.8, 0.8),
    roughnessMap: repeated(TEX.rough, 2, 2)
  });
  // Corridor floor: polished enough to catch the ceiling fixtures.
  MAT.floor = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.8,
    map: repeated(TEX.floorAlbedo, 1, 1),
    normalMap: repeated(TEX.tileNormal, 2, 2),
    normalScale: NS(0.5, 0.5),
    roughnessMap: repeated(TEX.rough, 1, 1)
  });
  MAT.floorPlant = new THREE.MeshStandardMaterial({
    color: 0x74796f, roughness: 0.95, metalness: 0.16,
    map: repeated(TEX.plantAlbedo, 1, 1),
    normalMap: repeated(TEX.tileNormal, 1, 1),
    normalScale: NS(0.7, 0.7),
    roughnessMap: repeated(TEX.rough, 2, 2)
  });
  MAT.ceiling = new THREE.MeshStandardMaterial({
    color: 0xbbb8a8, roughness: 0.8, metalness: 0.0,
    map: repeated(TEX.dropTile, 1, 1),
    normalMap: repeated(TEX.tileNormal, 2, 2),
    normalScale: NS(0.3, 0.3)
  });
  // Bathroom floor: smaller white tile, matte.
  MAT.floorBath = new THREE.MeshStandardMaterial({
    color: 0xd8dad6, roughness: 0.45, metalness: 0.0,
    map: repeated(TEX.bathAlbedo, 1, 1),
    normalMap: repeated(TEX.tileNormal, 4, 4),
    normalScale: NS(0.5, 0.5),
    roughnessMap: repeated(TEX.roughFine, 2, 2)
  });
  // Stainless lab bench top.
  MAT.benchTop = new THREE.MeshStandardMaterial({
    color: 0xb9c0c6, roughness: 0.15, metalness: 0.95, envMapIntensity: 1.0,
    map: repeated(TEX.metalAlbedo, 2, 1)
  });
  // Polished floor drain.
  MAT.drain = new THREE.MeshStandardMaterial({
    color: 0x9aa1a8, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.2
  });
  // Server rack: dark chassis with an emissive LED face.
  MAT.rack = new THREE.MeshStandardMaterial({
    color: 0x30363d, roughness: 0.6, metalness: 0.7, envMapIntensity: 0.7
  });
  MAT.rackFace = new THREE.MeshStandardMaterial({
    color: 0x1a1f24, roughness: 0.6, metalness: 0.7,
    map: TEX.rackFace, emissive: 0xffffff, emissiveMap: TEX.rackFace, emissiveIntensity: 1.2
  });
  // Monitor face: emissive CRT, UV-scrolled in the frame loop.
  MAT.monitor = new THREE.MeshStandardMaterial({
    color: 0x0a1a12, roughness: 0.35, metalness: 0.0,
    map: TEX.monitor, emissive: 0xffffff, emissiveMap: TEX.monitor, emissiveIntensity: 1.5
  });
  MAT.metal = new THREE.MeshStandardMaterial({
    color: 0x6a7a6a, roughness: 0.3, metalness: 0.8, envMapIntensity: 0.6,
    map: repeated(TEX.metalAlbedo, 1, 1),
    roughnessMap: repeated(TEX.roughFine, 1, 1)
  });
  MAT.metalDark = new THREE.MeshStandardMaterial({
    color: 0x3b444d, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.5,
    map: repeated(TEX.metalAlbedo, 2, 2)
  });
  MAT.trim = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.6 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.95, metalness: 0.0 });
  MAT.porcelain = new THREE.MeshStandardMaterial({ color: 0xe6e9ea, roughness: 0.18, metalness: 0.02, envMapIntensity: 0.8 });
  MAT.glass = new THREE.MeshStandardMaterial({
    color: 0x9fd6e8, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.28, envMapIntensity: 1.0
  });
  MAT.hazard = new THREE.MeshStandardMaterial({ color: 0xc8a021, roughness: 0.7, metalness: 0.3 });
  MAT.vat = new THREE.MeshStandardMaterial({ color: 0x7d8a84, roughness: 0.42, metalness: 0.75, envMapIntensity: 0.7 });
  MAT.chem = new THREE.MeshStandardMaterial({
    color: 0x2f6b4a, roughness: 0.15, metalness: 0.0, emissive: 0x0d3322, emissiveIntensity: 0.6
  });

  // Emissive surfaces — these are what the bloom pass picks up.
  MAT.lampOn = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: CFG.colors.fluoro, emissiveIntensity: 1.8, roughness: 1, metalness: 0
  });
  // Exit signage — sits well above the bloom threshold.
  MAT.exitSign = new THREE.MeshStandardMaterial({
    color: 0x220305, emissive: 0xff2318, emissiveIntensity: 2.0, roughness: 0.6, metalness: 0
  });
  // Held under ACES's shoulder: a stronger red tone-maps to salmon pink.
  MAT.exitPlate = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: TEX.exit, emissiveIntensity: 1.1, roughness: 0.6, metalness: 0
  });
  MAT.screen = new THREE.MeshStandardMaterial({
    color: 0x0a1a22, emissive: CFG.colors.screenGlow, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0
  });
  MAT.screenAmber = new THREE.MeshStandardMaterial({
    color: 0x1a1206, emissive: CFG.colors.objectiveGlow, emissiveIntensity: 1.7, roughness: 0.4, metalness: 0
  });
  MAT.ledRed = new THREE.MeshStandardMaterial({ color: 0x220407, emissive: 0xff2d3c, emissiveIntensity: 2.0, roughness: 0.5 });
  MAT.ledDim = new THREE.MeshStandardMaterial({ color: 0x1a0405, emissive: 0x3a0a0e, emissiveIntensity: 0.3, roughness: 0.5 });
  // Highlight variants. The aimed fixture swaps to these, so "you are pointing
  // at me" is the same indicator turned up rather than a new visual idea.
  MAT.ledRedHot = new THREE.MeshStandardMaterial({ color: 0xff6a72, emissive: 0xff2d3c, emissiveIntensity: 3.2, roughness: 0.35 });
  MAT.ledAmber = new THREE.MeshStandardMaterial({ color: 0xffb128, emissive: 0xffb128, emissiveIntensity: 1.5, roughness: 0.4 });
  MAT.ledAmberHot = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb128, emissiveIntensity: 3.4, roughness: 0.35 });
  MAT.ledGreen = new THREE.MeshStandardMaterial({ color: 0x04220e, emissive: 0x5dff8f, emissiveIntensity: 1.4, roughness: 0.5 });

  MAT.guard = new THREE.MeshStandardMaterial({ color: 0x3d4a3d, roughness: 0.8, metalness: 0.08 });
  MAT.enemyTorso = new THREE.MeshStandardMaterial({ color: 0x3d4a3d, roughness: 0.75, metalness: 0.12 });
  MAT.enemyPants = new THREE.MeshStandardMaterial({ color: 0x222830, roughness: 0.85, metalness: 0.05 });
  MAT.enemySkin  = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.75, metalness: 0.0 });
  MAT.enemyBeret = new THREE.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 0.9, metalness: 0.05 });
  MAT.alertDot   = new THREE.MeshStandardMaterial({ color: 0x2a0206, emissive: 0xff2010, emissiveIntensity: 2.2, roughness: 0.5 });
  MAT.guardVest = new THREE.MeshStandardMaterial({ color: 0x1e2620, roughness: 0.65, metalness: 0.22 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xb8886a, roughness: 0.75, metalness: 0.0 });
  MAT.labCoat = new THREE.MeshStandardMaterial({ color: 0xdde3e6, roughness: 0.85, metalness: 0.0 });
  MAT.gunmetal = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.7 });
  // pickups: none uses red or amber, which the facility reserves for "shoot
  // this" and "use this"; the armour's blue matches its bar on the HUD
  MAT.armorStrip = new THREE.MeshStandardMaterial({ color: 0x0c2233, emissive: 0x48b7ff, emissiveIntensity: 1.6, roughness: 0.5 });
  MAT.ammoCrate = new THREE.MeshStandardMaterial({ color: 0x4b5232, roughness: 0.8, metalness: 0.2 });
  MAT.brass = new THREE.MeshStandardMaterial({ color: 0xb58a3a, roughness: 0.35, metalness: 0.9, envMapIntensity: 0.9 });
}

/* ---------- geometry merging (r128 core has no BufferGeometryUtils) ----------
   Static level geometry is baked into one buffer per material so a whole
   facility costs a handful of draw calls instead of several hundred. */
function mergeGeometries(geoms) {
  var attrNames = ['position', 'normal', 'uv'];
  var total = 0, i, j;
  for (i = 0; i < geoms.length; i++) total += geoms[i].attributes.position.count;

  var out = new THREE.BufferGeometry();
  var arrays = {};
  arrays.position = new Float32Array(total * 3);
  arrays.normal = new Float32Array(total * 3);
  arrays.uv = new Float32Array(total * 2);

  var indexCount = 0;
  for (i = 0; i < geoms.length; i++) {
    var g = geoms[i];
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  var indices = total > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  var vOff = 0, iOff = 0;
  for (i = 0; i < geoms.length; i++) {
    var geo = geoms[i];
    for (j = 0; j < attrNames.length; j++) {
      var name = attrNames[j];
      var src = geo.attributes[name];
      var size = name === 'uv' ? 2 : 3;
      if (!src) continue;
      arrays[name].set(src.array, vOff * size);
    }
    var cnt = geo.attributes.position.count;
    if (geo.index) {
      for (j = 0; j < geo.index.count; j++) indices[iOff++] = geo.index.array[j] + vOff;
    } else {
      for (j = 0; j < cnt; j++) indices[iOff++] = j + vOff;
    }
    vOff += cnt;
    geo.dispose();
  }
  out.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}

/* ---------- the facility plan ----------
   Rooms are rectangles of cells; the 2D grid the brief asks for is generated
   from them so the layout stays readable and the runtime still walks a grid. */
var PLAN = {
  w: 28, h: 31,
  rooms: [
    { id: 'bathroom', x0: 1,  z0: 1,  x1: 5,  z1: 5,  style: 'bath'  },
    { id: 'corridorV', x0: 3, z0: 6,  x1: 4,  z1: 12, style: 'tile'  },
    { id: 'corridorH', x0: 3, z0: 11, x1: 22, z1: 12, style: 'tile'  },
    { id: 'labLink',  x0: 20, z0: 13, x1: 21, z1: 13, style: 'lab'   },
    { id: 'lab',      x0: 18, z0: 14, x1: 24, z1: 20, style: 'lab'   },
    { id: 'ctrlLink', x0: 20, z0: 21, x1: 21, z1: 21, style: 'lab'   },
    { id: 'control',  x0: 18, z0: 22, x1: 23, z1: 26, style: 'lab'   },
    { id: 'connect',  x0: 13, z0: 24, x1: 17, z1: 25, style: 'plant' },
    { id: 'plant',    x0: 2,  z0: 19, x1: 12, z1: 26, style: 'plant' },
    { id: 'exitHall', x0: 6,  z0: 27, x1: 7,  z1: 29, style: 'plant' }
  ],
  doors: [
    { x: 3,  z: 6,  axis: 'x', tag: 'bath1' },
    { x: 4,  z: 6,  axis: 'x', tag: 'bath2' },
    { x: 20, z: 13, axis: 'x', tag: 'lab1'  },
    { x: 21, z: 13, axis: 'x', tag: 'lab2'  },
    { x: 20, z: 21, axis: 'x', tag: 'ctrl1' },
    { x: 21, z: 21, axis: 'x', tag: 'ctrl2' },
    { x: 6,  z: 27, axis: 'x', tag: 'exit1', locked: true },
    { x: 7,  z: 27, axis: 'x', tag: 'exit2', locked: true }
  ],
  start: { x: 1, z: 1 },
  exit:  { x: 6, z: 29 }
};

/* Build the 2D grid the brief specifies (0 open, 1 wall, 2 door, 3 start, 4 exit). */
function buildGrid(plan) {
  var g = [], x, z;
  for (z = 0; z < plan.h; z++) {
    var row = [];
    for (x = 0; x < plan.w; x++) row.push(C_WALL);
    g.push(row);
  }
  var styleAt = [];
  for (z = 0; z < plan.h; z++) { styleAt.push(new Array(plan.w)); }

  for (var r = 0; r < plan.rooms.length; r++) {
    var room = plan.rooms[r];
    for (z = room.z0; z <= room.z1; z++) {
      for (x = room.x0; x <= room.x1; x++) {
        if (z < 0 || z >= plan.h || x < 0 || x >= plan.w) continue;
        g[z][x] = C_OPEN;
        styleAt[z][x] = room.style;
        }
    }
  }
  for (var d = 0; d < plan.doors.length; d++) {
    var dr = plan.doors[d];
    g[dr.z][dr.x] = C_DOOR;
    if (!styleAt[dr.z][dr.x]) styleAt[dr.z][dr.x] = 'tile';
  }
  g[plan.start.z][plan.start.x] = C_START;
  g[plan.exit.z][plan.exit.x] = C_EXIT;
  return { grid: g, style: styleAt };
}

function isPassable(code) { return code !== C_WALL; }

/* ---------- level construction ---------- */
var LEVEL = null;

function addBox(list, geo, mat, x, y, z, rotY) {
  var g = geo.clone();
  var m = new THREE.Matrix4();
  var q = new THREE.Quaternion();
  if (rotY) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  list.push(g);
}
function pushAABB(arr, cx, cy, cz, sx, sy, sz, tag) {
  arr.push({
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minY: cy - sy / 2, maxY: cy + sy / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
    tag: tag || 'wall'
  });
}

function setDoorLamps(door, mat) {
  for (var i = 0; i < door.lamps.length; i++) door.lamps[i].material = mat;
}

function buildLevel(plan) {
  var built = buildGrid(plan);
  var grid = built.grid, styleAt = built.style;
  var collidables = [];
  var doors = [];
  var lightPoints = [];
  var props = new THREE.Group();
  props.name = 'props';

  var bucket = {
    wall: [], wallLab: [], wallPlant: [],
    floor: [], floorPlant: [], floorBath: [], ceiling: [],
    trim: [], metal: [], lamp: []
  };

  var floorGeo = new THREE.PlaneGeometry(CELL, CELL, 2, 2);
  floorGeo.rotateX(-Math.PI / 2);
  var ceilGeo = new THREE.PlaneGeometry(CELL, CELL, 2, 2);
  ceilGeo.rotateX(Math.PI / 2);
  var wallGeoX = new THREE.BoxGeometry(CELL, WALL_H, WALL_T);   // spans X, faces Z
  var wallGeoZ = new THREE.BoxGeometry(WALL_T, WALL_H, CELL);   // spans Z, faces X
  var trimGeoX = new THREE.BoxGeometry(CELL, 0.05, WALL_T + 0.07);
  var trimGeoZ = new THREE.BoxGeometry(WALL_T + 0.07, 0.05, CELL);

  var x, z, wx, wz;
  for (z = 0; z < plan.h; z++) {
    for (x = 0; x < plan.w; x++) {
      var code = grid[z][x];
      if (!isPassable(code)) continue;
      wx = cellToWorldX(x); wz = cellToWorldZ(z);
      var style = styleAt[z][x] || 'tile';

      // floor + ceiling for every passable cell (ceilings are not optional —
      // without them the point lights spill into the void and the fog reads wrong)
      addBox(style === 'plant' ? bucket.floorPlant : (style === 'bath' ? bucket.floorBath : bucket.floor),
              floorGeo, null, wx, 0, wz);
      addBox(bucket.ceiling, ceilGeo, null, wx, WALL_H, wz);

      // walls: one slab on each boundary where this open cell meets a solid one
      var neighbours = [
        { dx: 0, dz: -1, ax: 'x' }, { dx: 0, dz: 1, ax: 'x' },
        { dx: -1, dz: 0, ax: 'z' }, { dx: 1, dz: 0, ax: 'z' }
      ];
      for (var n = 0; n < neighbours.length; n++) {
        var nb = neighbours[n];
        var nx = x + nb.dx, nz = z + nb.dz;
        var solid = (nx < 0 || nz < 0 || nx >= plan.w || nz >= plan.h) || !isPassable(grid[nz][nx]);
        if (!solid) continue;
        var bx = wx + nb.dx * CELL / 2, bz = wz + nb.dz * CELL / 2;
        var target = style === 'lab' ? bucket.wallLab : (style === 'plant' ? bucket.wallPlant : bucket.wall);
        if (nb.ax === 'x') {
          addBox(target, wallGeoX, null, bx, WALL_H / 2, bz);
          addBox(bucket.trim, trimGeoX, null, bx, 0.025, bz);          // baseboard
          addBox(bucket.trim, trimGeoX, null, bx, WALL_H - 0.025, bz); // cornice
          pushAABB(collidables, bx, WALL_H / 2, bz, CELL, WALL_H, WALL_T);
        } else {
          addBox(target, wallGeoZ, null, bx, WALL_H / 2, bz);
          addBox(bucket.trim, trimGeoZ, null, bx, 0.025, bz);
          addBox(bucket.trim, trimGeoZ, null, bx, WALL_H - 0.025, bz);
          pushAABB(collidables, bx, WALL_H / 2, bz, WALL_T, WALL_H, CELL);
        }
      }
    }
  }

  // ---- ceiling fluorescents every CFG.render.fixtureSpacing units ----
  var housingGeo = new THREE.BoxGeometry(2.7, 0.10, 0.42);
  var tubeGeo = new THREE.BoxGeometry(2.55, 0.04, 0.30);
  var step = Math.max(1, Math.round(CFG.render.fixtureSpacing / CELL));
  for (z = 0; z < plan.h; z += step) {
    for (x = 0; x < plan.w; x += step) {
      if (!isPassable(grid[z][x])) continue;
      wx = cellToWorldX(x); wz = cellToWorldZ(z);
      addBox(bucket.metal, housingGeo, null, wx, WALL_H - 0.06, wz);
      addBox(bucket.lamp, tubeGeo, null, wx, WALL_H - 0.13, wz);
      lightPoints.push(new THREE.Vector3(wx, WALL_H - 0.35, wz));
    }
  }

  // ---- doors ----
  var doorGeo = new THREE.BoxGeometry(CELL - 0.15, WALL_H - 0.1, 0.16);
  var frameGeoV = new THREE.BoxGeometry(0.22, WALL_H, 0.36);
  for (var di = 0; di < plan.doors.length; di++) {
    var dr = plan.doors[di];
    wx = cellToWorldX(dr.x); wz = cellToWorldZ(dr.z);
    var mesh = new THREE.Mesh(doorGeo, dr.locked ? MAT.metalDark : MAT.metal);
    mesh.position.set(wx, (WALL_H - 0.1) / 2, wz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    props.add(mesh);
    addBox(bucket.trim, frameGeoV, null, wx - CELL / 2 + 0.11, WALL_H / 2, wz);
    addBox(bucket.trim, frameGeoV, null, wx + CELL / 2 - 0.11, WALL_H / 2, wz);

    // A lock lamp on both faces: it used to be on the south face only, so the
    // exit door's red lamp could not be seen from the plant you approach it from.
    var lampGeo = new THREE.BoxGeometry(0.12, 0.12, 0.06);
    var lamp = new THREE.Mesh(lampGeo, dr.locked ? MAT.ledRed : MAT.ledGreen);
    lamp.position.set(wx + CELL / 2 - 0.4, 2.2, wz + 0.21);
    props.add(lamp);
    var lampBack = new THREE.Mesh(lampGeo, lamp.material);
    lampBack.position.set(wx + CELL / 2 - 0.4, 2.2, wz - 0.21);
    props.add(lampBack);

    var door = {
      tag: dr.tag, mesh: mesh, lamps: [lamp, lampBack], locked: !!dr.locked, open: 0, target: 0,
      closedY: (WALL_H - 0.1) / 2, x: wx, z: wz,
      aabb: { minX: wx - CELL / 2, maxX: wx + CELL / 2, minY: 0, maxY: WALL_H,
              minZ: wz - 0.18, maxZ: wz + 0.18, tag: 'door' }
    };
    doors.push(door);
    collidables.push(door.aabb);
  }

  // ---- merged static meshes ----
  var meshes = [];
  function commit(list, mat, name, receive, cast) {
    if (!list.length) return null;
    var geo = mergeGeometries(list);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.castShadow = cast !== false;
    mesh.receiveShadow = receive !== false;
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
    return mesh;
  }
  commit(bucket.floor, MAT.floor, 'floor', true, false);
  commit(bucket.floorPlant, MAT.floorPlant, 'floorPlant', true, false);
  commit(bucket.floorBath, MAT.floorBath, 'floorBath', true, false);
  commit(bucket.ceiling, MAT.ceiling, 'ceiling', true, false);
  commit(bucket.wall, MAT.wall, 'walls');
  commit(bucket.wallLab, MAT.wallLab, 'wallsLab');
  commit(bucket.wallPlant, MAT.wallPlant, 'wallsPlant');
  commit(bucket.trim, MAT.trim, 'trim', true, false);
  commit(bucket.metal, MAT.metal, 'fixtures', true, false);
  var lampMesh = commit(bucket.lamp, MAT.lampOn, 'lamps', false, false);

  LEVEL = {
    grid: grid, style: styleAt, plan: plan,
    collidables: collidables, doors: doors, meshes: meshes,
    props: props, lightPoints: lightPoints, lampMesh: lampMesh,
    spawnPoints: {
      player: new THREE.Vector3(cellToWorldX(plan.start.x), 0, cellToWorldZ(plan.start.z)),
      exit: new THREE.Vector3(cellToWorldX(plan.exit.x), 0, cellToWorldZ(plan.exit.z))
    }
  };
  return LEVEL;
}

/* ---------- room dressing ----------
   Props are BoxGeometry only, per the brief. They are merged per material where
   they are static, and kept separate where the game needs to touch them. */
function buildProps(level) {
  var group = level.props;
  var col = level.collidables;
  level.tanks = [];
  INTERACTABLES.length = 0;
  var statics = { metal: [], dark: [], porcelain: [], hazard: [], vat: [], rubber: [], trim: [],
                  bench: [], drain: [], rack: [] };

  function prop(bucket, w, h, d, cx, cy, cz, solid, tag) {
    var geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(cx, cy, cz);
    statics[bucket].push(geo);
    if (solid) pushAABB(col, cx, cy, cz, w, h, d, tag || 'prop');
  }
  /* Detail-only geometry: never registers a collider, so the level's collision
     shape is exactly what it was before this pass. */
  function pipe(bucket, radius, length, cx, cy, cz, axis) {
    var geo = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
    if (axis === 'x') geo.rotateZ(Math.PI / 2);
    else if (axis === 'z') geo.rotateX(Math.PI / 2);
    geo.translate(cx, cy, cz);
    statics[bucket].push(geo);
  }
  function cyl(bucket, rTop, rBot, h, cx, cy, cz, seg) {
    var geo = new THREE.CylinderGeometry(rTop, rBot, h, seg || 14, 1);
    geo.translate(cx, cy, cz);
    statics[bucket].push(geo);
  }
  function disc(bucket, radius, h, cx, cy, cz) {
    var geo = new THREE.CylinderGeometry(radius, radius, h, 16, 1);
    geo.translate(cx, cy, cz);
    statics[bucket].push(geo);
  }
  function live(mat, w, h, d, cx, cy, cz, solid, tag) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, cy, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (solid) pushAABB(col, cx, cy, cz, w, h, d, tag || 'prop');
    return m;
  }
  var cx, cz;

  // ---- bathroom: stalls down the east wall, basins opposite ----
  for (var s = 0; s < 3; s++) {
    var sz = cellToWorldZ(1 + s * 1.4);
    prop('dark', 0.08, 2.0, 1.5 * CELL / 2.2, cellToWorldX(4) + 0.9, 1.0, sz, true, 'stall');
    prop('dark', 1.9, 2.0, 0.08, cellToWorldX(4), 1.0, sz - 1.35, true, 'stall');
    prop('porcelain', 0.42, 0.42, 0.62, cellToWorldX(4) + 0.4, 0.21, sz, true, 'wc');
    prop('porcelain', 0.44, 0.5, 0.16, cellToWorldX(4) + 0.4, 0.55, sz + 0.3, false);
  }
  for (var b = 0; b < 3; b++) {
    var bz = cellToWorldZ(1.6 + b * 1.2);
    prop('porcelain', 0.5, 0.22, 0.42, cellToWorldX(1) - 1.6, 0.9, bz, true, 'basin');
    prop('metal', 0.06, 0.9, 0.5, cellToWorldX(1) - 1.88, 1.75, bz, false);   // mirror plate
  }
  prop('trim', 0.1, 0.9, CELL * 4.6, cellToWorldX(1) - 1.9, 0.42, cellToWorldZ(3), false);
  disc('drain', 0.22, 0.03, cellToWorldX(3), 0.015, cellToWorldZ(3));      // polished floor drain
  disc('dark', 0.30, 0.012, cellToWorldX(3), 0.006, cellToWorldZ(3));

  // ---- corridor dressing: pipe runs, signage, crates ----
  for (var pz = 7; pz <= 12; pz++) {
    pipe('metal', 0.04, CELL, cellToWorldX(3) - 1.72, 2.98, cellToWorldZ(pz), 'z');
    pipe('metal', 0.04, CELL, cellToWorldX(3) - 1.52, 2.76, cellToWorldZ(pz), 'z');
    pipe('dark', 0.028, CELL, cellToWorldX(3) - 1.62, 2.60, cellToWorldZ(pz), 'z');
  }
  prop('dark', 0.16, 0.16, 0.16, cellToWorldX(3) - 1.72, 2.98, cellToWorldZ(12) + 1.6, false);  // junction
  prop('dark', 0.16, 0.16, 0.16, cellToWorldX(3) - 1.52, 2.76, cellToWorldZ(12) + 1.6, false);
  for (var px = 5; px <= 21; px++) {
    pipe('metal', 0.04, CELL, cellToWorldX(px), 3.04, cellToWorldZ(11) - 1.86, 'x');
    pipe('dark', 0.028, CELL, cellToWorldX(px), 2.84, cellToWorldZ(11) - 1.78, 'x');
  }
  for (var jx = 7; jx <= 19; jx += 6) {
    prop('dark', 0.17, 0.17, 0.17, cellToWorldX(jx), 3.04, cellToWorldZ(11) - 1.86, false);
  }
  prop('dark', 0.62, 0.46, 0.08, cellToWorldX(3) - 1.82, 2.1, cellToWorldZ(9), false);
  live(MAT.monitor, 0.44, 0.30, 0.05, cellToWorldX(3) - 1.78, 2.1, cellToWorldZ(9), false);
  prop('dark', 0.62, 0.46, 0.08, cellToWorldX(12), 2.1, cellToWorldZ(11) - 1.84, false);
  live(MAT.monitor, 0.44, 0.30, 0.05, cellToWorldX(12), 2.1, cellToWorldZ(11) - 1.80, false);
  prop('dark', 1.0, 1.0, 1.0, cellToWorldX(6), 0.5, cellToWorldZ(12) + 1.2, true, 'crate');
  prop('dark', 1.0, 1.0, 1.0, cellToWorldX(6) + 0.5, 1.5, cellToWorldZ(12) + 1.2, true, 'crate');
  prop('hazard', 0.7, 1.0, 0.7, cellToWorldX(17), 0.5, cellToWorldZ(12) + 1.3, true, 'barrel');

  // ---- laboratory: benches, monitors, shelving ----
  for (var r = 0; r < 3; r++) {
    var lz = cellToWorldZ(15 + r * 2);
    prop('bench', CELL * 2.2, 0.06, 0.9, cellToWorldX(20), 0.98, lz, true, 'bench');   // stainless top
    prop('dark', CELL * 2.2 - 0.3, 0.05, 0.8, cellToWorldX(20), 0.42, lz, false);        // lower shelf
    for (var lg = 0; lg < 4; lg++) {
      prop('metal', 0.07, 0.92, 0.07,
        cellToWorldX(20) + (lg % 2 ? 1 : -1) * (CELL * 1.05),
        0.46, lz + (lg < 2 ? -0.35 : 0.35), false);
    }
    prop('dark', 0.12, 0.9, 0.85, cellToWorldX(19) - 1.6, 0.45, lz, true, 'bench');
    prop('dark', 0.12, 0.9, 0.85, cellToWorldX(21) + 1.6, 0.45, lz, true, 'bench');
    live(MAT.monitor, 0.46, 0.34, 0.06, cellToWorldX(19) + 0.4, 1.28, lz - 0.2, false);
    live(MAT.monitor, 0.46, 0.34, 0.06, cellToWorldX(21) - 0.4, 1.28, lz + 0.2, false);
    prop('porcelain', 0.16, 0.30, 0.16, cellToWorldX(20) + 0.9, 1.16, lz, false);
    prop('porcelain', 0.14, 0.22, 0.14, cellToWorldX(20) - 0.9, 1.12, lz, false);
  }
  prop('metal', 0.5, 2.2, CELL * 2, cellToWorldX(24) + 1.5, 1.1, cellToWorldZ(17), true, 'shelf');
  prop('dark', 1.1, 0.55, CELL * 5, cellToWorldX(21), WALL_H - 0.42, cellToWorldZ(17), false);  // ceiling duct
  pipe('metal', 0.05, CELL * 5, cellToWorldX(19.4), WALL_H - 0.5, cellToWorldZ(17), 'z');
  prop('dark', 0.55, 0.08, CELL * 2 - 0.2, cellToWorldX(24) + 1.45, 1.5, cellToWorldZ(17), false);
  prop('dark', 0.55, 0.08, CELL * 2 - 0.2, cellToWorldX(24) + 1.45, 0.8, cellToWorldZ(17), false);

  // ---- control room: raised platform, console banks, the objective terminal ----
  var platY = 0.4;
  var px0 = cellToWorldX(20) - CELL / 2, pz0 = cellToWorldZ(24) - CELL / 2;
  prop('metal', CELL * 4, platY, CELL * 3, cellToWorldX(21.5), platY / 2, cellToWorldZ(25), false);
  col.push({
    minX: cellToWorldX(21.5) - CELL * 2, maxX: cellToWorldX(21.5) + CELL * 2,
    minY: 0, maxY: platY,
    minZ: cellToWorldZ(25) - CELL * 1.5, maxZ: cellToWorldZ(25) + CELL * 1.5,
    tag: 'platform', walkable: true
  });
  for (var c = 0; c < 3; c++) {
    var ccz = cellToWorldZ(24 + c * 0.9);
    prop('dark', 1.5, 1.0, 0.7, cellToWorldX(19) - 0.4, platY + 0.5, ccz, true, 'console');
    live(MAT.monitor, 1.2, 0.5, 0.06, cellToWorldX(19) - 0.4, platY + 1.15, ccz + 0.3, false);
  }
  prop('dark', 0.8, 1.0, CELL * 2.2, cellToWorldX(23) + 1.3, platY + 0.5, cellToWorldZ(24.5), true, 'console');
  // server racks: detail only, no collider, so the room walks exactly as before
  for (var rk = 0; rk < 4; rk++) {
    var rkz = cellToWorldZ(22.6 + rk * 0.62);
    prop('rack', 0.75, 1.95, 0.9, cellToWorldX(18) - 1.1, platY + 0.98, rkz, false);
    var face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.7), MAT.rackFace);
    face.position.set(cellToWorldX(18) - 1.1 + 0.46, platY + 0.98, rkz);
    face.rotation.y = Math.PI / 2;
    group.add(face);
  }
  live(MAT.monitor, 0.06, 0.5, CELL * 1.6, cellToWorldX(23) + 0.88, platY + 1.15, cellToWorldZ(24.5), false);

  // the terminal itself: amber, unmistakable, and the only interactable here
  var termX = cellToWorldX(21), termZ = cellToWorldZ(26) + 1.1;
  var term = live(MAT.metalDark, 1.1, 1.35, 0.55, termX, platY + 0.68, termZ, true, 'terminal');
  var screen = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.6, 0.07), MAT.screenAmber);
  screen.position.set(termX, platY + 1.05, termZ - 0.3);
  screen.rotation.x = -0.28;
  group.add(screen);
  var termLed = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), MAT.ledGreen);
  termLed.position.set(termX + 0.44, platY + 1.3, termZ - 0.22);
  group.add(termLed);
  var bigScreen = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.6), MAT.monitor);
  bigScreen.position.set(cellToWorldX(20.5), 2.75, cellToWorldZ(22) - 1.9);
  group.add(bigScreen);
  var bigFrame = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.9, 0.12), MAT.metalDark);
  bigFrame.position.set(cellToWorldX(20.5), 2.75, cellToWorldZ(22) - 1.98);
  group.add(bigFrame);

  level.terminal = {
    mesh: term, screen: screen, led: termLed,
    pos: new THREE.Vector3(termX, platY + 1.0, termZ),
    used: false
  };
  // The one thing you hold USE on, so it carries the other half of the colour
  // rule: amber, which no scenery is allowed to be.
  termLed.material = MAT.ledAmber;
  level.terminal.setHighlight = function (on) {
    if (!this.used) this.led.material = on ? MAT.ledAmberHot : MAT.ledAmber;
  };
  term.userData.terminal = level.terminal;
  registerInteractable({
    mesh: term, kind: 'use', label: 'ARCHIVE TERMINAL', range: 12, useRange: 2.8,
    owner: level.terminal,
    live: function () { return !this.owner.used; },
    setHighlight: function (on) { this.owner.setHighlight(on); }
  });

  // ---- chemical plant: vats, pipework, barrels ----
  var vatSpots = [[4.5, 21], [9, 21], [4.5, 24.5], [9, 24.5]];
  for (var v = 0; v < vatSpots.length; v++) {
    var vx = cellToWorldX(vatSpots[v][0]), vz = cellToWorldZ(vatSpots[v][1]);
    // Collider stays the original box; the visible tank is now a cylinder.
    pushAABB(col, vx, 1.2, vz, 2.6, 2.4, 2.6, 'vat');
    cyl('vat', 1.32, 1.32, 2.4, vx, 1.2, vz, 16);
    cyl('vat', 1.46, 1.46, 0.22, vx, 2.48, vz, 16);
    cyl('vat', 1.46, 1.46, 0.22, vx, 0.13, vz, 16);
    pipe('metal', 0.12, 1.0, vx, 3.0, vz, 'y');
    live(MAT.chem, 2.2, 0.1, 2.2, vx, 2.66, vz, false);
    // The pressure gauge is the weak point. It is a live mesh rather than
    // merged static geometry precisely so a shot can find it and so the
    // stockpile objective has something specific to aim at.
    // Red, not green. One rule has to hold across the whole facility or it is
    // not a rule: a lit red indicator means "shoot this and something happens".
    var gauge = live(MAT.ledRed, 0.30, 0.30, 0.12, vx + 1.36, 1.7, vz, false);
    var tank = { gauge: gauge, pos: new THREE.Vector3(vx, 1.6, vz), intact: true };
    gauge.userData.tank = tank;
    level.tanks.push(tank);
    tank.setHighlight = function (on) {
      if (this.intact) this.gauge.material = on ? MAT.ledRedHot : MAT.ledRed;
    };
    registerInteractable({
      mesh: gauge, kind: 'shoot', label: 'GAS TANK', range: 40, owner: tank,
      live: function () { return this.owner.intact; },
      setHighlight: function (on) { this.owner.setHighlight(on); }
    });
    prop('metal', 0.18, 0.18, CELL * 1.6, vx, 3.3, vz + CELL * 0.8, false);
  }
  for (var hp = 0; hp < 6; hp++) {
    prop('metal', CELL * 2.6, 0.2, 0.2, cellToWorldX(6.5), 3.15 - hp * 0.02, cellToWorldZ(19.4 + hp * 1.3), false);
  }
  for (var bb = 0; bb < 5; bb++) {
    prop('hazard', 0.72, 1.05, 0.72, cellToWorldX(2.6 + (bb % 3) * 0.28), 0.52, cellToWorldZ(25.6 - Math.floor(bb / 3) * 0.3), true, 'barrel');
  }
  prop('dark', 1.2, 1.2, 1.2, cellToWorldX(11.5), 0.6, cellToWorldZ(20), true, 'crate');
  prop('metal', 0.4, 2.6, 0.4, cellToWorldX(12) + 1.2, 1.3, cellToWorldZ(23), true, 'pillar');
  // mid-height walkway grating with thin railings — detail only
  var wkX = cellToWorldX(11.4), wkZ0 = 19.2, wkZ1 = 26.2;
  prop('dark', 1.5, 0.08, (wkZ1 - wkZ0) * CELL, wkX, 2.05, cellToWorldZ((wkZ0 + wkZ1) / 2), false);
  for (var rl = 0; rl < 2; rl++) {
    var rx = wkX + (rl ? 0.7 : -0.7);
    pipe('metal', 0.03, (wkZ1 - wkZ0) * CELL, rx, 2.95, cellToWorldZ((wkZ0 + wkZ1) / 2), 'z');
    pipe('metal', 0.03, (wkZ1 - wkZ0) * CELL, rx, 2.55, cellToWorldZ((wkZ0 + wkZ1) / 2), 'z');
    for (var pst = 0; pst <= 6; pst++) {
      pipe('metal', 0.03, 0.95, rx, 2.52, cellToWorldZ(wkZ0 + pst * 1.16), 'y');
    }
  }

  // Exit signage rides on the exit door slabs themselves. The old signs hung in
  // mid-air two metres in front of the doors, and one sat inside solid rock.
  for (var ed = 0; ed < level.doors.length; ed++) {
    var exDoor = level.doors[ed];
    if (exDoor.tag.indexOf('exit') !== 0) continue;
    var plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.04), MAT.exitPlate);
    plate.position.set(0, 0.9, -0.1);            // plant side of the slab, above head height
    exDoor.mesh.add(plate);
  }

  // ---- commit merged prop geometry ----
  var matFor = {
    metal: MAT.metal, dark: MAT.metalDark, porcelain: MAT.porcelain,
    hazard: MAT.hazard, vat: MAT.vat, rubber: MAT.rubber, trim: MAT.trim,
    bench: MAT.benchTop, drain: MAT.drain, rack: MAT.rack
  };
  for (var key in statics) {
    if (!statics[key].length) continue;
    var geo = mergeGeometries(statics[key]);
    var mesh = new THREE.Mesh(geo, matFor[key]);
    mesh.name = 'props_' + key;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    level.meshes.push(mesh);
  }

  buildAlarmPanels(level, group);

  // Raycast set: merged statics plus the live prop meshes. Shots and sight
  // checks test these, and nothing else.
  level.raycastTargets = level.meshes.slice();
  group.traverse(function (o) { if (o.isMesh) level.raycastTargets.push(o); });
  return level;
}

/* ---------- alarm panels ----------
   The alarm used to fire the instant a guard decided you were hostile, which
   made stealth a coin flip: spotted meant caught, and nothing you did about it
   mattered. Here a guard has to reach a wall panel and physically pull it, so
   being seen starts a race instead of ending the mission. You can drop him
   before he arrives, or shoot the panel out beforehand and take that whole
   wing off the board. Kill the last working panel and the garrison can never
   be called at all -- which is the quiet run the PP7 exists for. */
/* Each panel is mounted on a named wall of a named cell: [cellX, cellZ, side].
   They used to be given as bare coordinates, and every one of the seven had
   ended up floating in open floor -- one dead centre in the insertion corridor,
   walked straight through. The mount below refuses a side that has no wall. */
var PANEL_SPOTS = [
  [3, 9, 'W'],      // insertion corridor
  [12, 11, 'N'],    // main corridor, halfway along
  [19, 12, 'S'],    // corridor end, beside the lab door
  [18, 17, 'W'],    // laboratory
  [23, 23, 'E'],    // control room
  [8, 19, 'N'],     // chemical plant, north wall
  [4, 26, 'S']      // chemical plant, by the exit hall
];
var SIDE_DIR = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

/* Position and facing for something fixed flush to a cell's wall. Throws if
   that side of the cell is open: a mount point off a wall is a level bug and
   has to fail the build, not float. */
function wallMount(level, cx, cz, side, standOff) {
  var d = SIDE_DIR[side];
  if (!d) throw new Error('bad wall side ' + side);
  var g = level.grid;
  var nx = cx + d[0], nz = cz + d[1];
  if (!isPassable(g[cz] && g[cz][cx])) throw new Error('mount cell ' + cx + ',' + cz + ' is solid');
  var solid = nz < 0 || nz >= g.length || nx < 0 || nx >= g[0].length || !isPassable(g[nz][nx]);
  if (!solid) throw new Error('no wall on the ' + side + ' side of cell ' + cx + ',' + cz);
  var face = CELL / 2 - WALL_T / 2;                 // wall face, from the cell centre
  var out = face - (standOff || 0);
  return {
    x: cellToWorldX(cx) + d[0] * out, z: cellToWorldZ(cz) + d[1] * out,
    // local +Z points away from the wall, into the room
    rotY: Math.atan2(-d[0], -d[1]),
    normalX: -d[0], normalZ: -d[1]
  };
}

function buildAlarmPanels(level, group) {
  level.panels = [];
  var box = new THREE.BoxGeometry(0.40, 0.50, 0.12);
  var bezelGeo = new THREE.BoxGeometry(0.54, 0.64, 0.06);
  var lamp = new THREE.BoxGeometry(0.17, 0.17, 0.05);
  for (var i = 0; i < PANEL_SPOTS.length; i++) {
    var sp = PANEL_SPOTS[i];
    var mount = wallMount(level, sp[0], sp[1], sp[2], 0.06);
    var wx = mount.x, wz = mount.z;
    // Half-Life 2's rule: the object should announce itself before the HUD
    // does. A wall is flat grey tile, so the panel gets a pale raised bezel, a
    // dark recessed face and a lamp big enough to pick out down a corridor --
    // three cues that no piece of scenery in the building has.
    var mesh = new THREE.Mesh(box, MAT.metalDark);
    mesh.position.set(wx, 1.45, wz);
    mesh.rotation.y = mount.rotY;
    mesh.castShadow = false; mesh.receiveShadow = true;
    var bezel = new THREE.Mesh(bezelGeo, MAT.hazard);
    bezel.position.set(0, 0, -0.03);
    bezel.castShadow = false; bezel.receiveShadow = true;
    mesh.add(bezel);
    var led = new THREE.Mesh(lamp, MAT.ledRed);
    led.position.set(0, 0.16, 0.075);
    led.castShadow = false;
    mesh.add(led);
    group.add(mesh);
    var panel = { mesh: mesh, led: led, alive: true,
                  pos: new THREE.Vector3(wx, 1.45, wz),
                  // where a guard stands to pull it: an arm's length off the wall
                  stand: new THREE.Vector3(wx + mount.normalX * 0.75, 0, wz + mount.normalZ * 0.75) };
    mesh.userData.panel = panel;
    level.panels.push(panel);
    // Both destructibles wear the same signature: a red indicator that is lit
    // while the thing still matters, and dark once it does not.
    panel.setHighlight = function (on) {
      if (this.alive) this.led.material = on ? MAT.ledRedHot : MAT.ledRed;
    };
    // owner, not a captured local: these are built in a var-scoped loop, so a
    // closure over the loop variable would leave all seven entries pointing at
    // whichever panel happened to be built last
    registerInteractable({
      mesh: mesh, kind: 'shoot', label: 'ALARM PANEL', range: 40, owner: panel,
      live: function () { return this.owner.alive; },
      setHighlight: function (on) { this.owner.setHighlight(on); }
    });
  }
}

/* The nearest panel that still works, or null if the wing has been cut. */
function nearestLivePanel(from) {
  if (!LEVEL || !LEVEL.panels) return null;
  var best = null, bestD = Infinity;
  for (var i = 0; i < LEVEL.panels.length; i++) {
    var p = LEVEL.panels[i];
    if (!p.alive) continue;
    var d = Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/* Rupture a stockpile tank. Venting nerve agent is loud: it wakes the wing. */
function ruptureTank(tank) {
  if (!tank || !tank.intact) return;
  tank.intact = false;
  tank.gauge.material = MAT.ledDim;
  spawnImpactEffect(tank.pos, null, false);
  sfxExplosion(tank.pos);
  flashLight(tank.pos, 14, 8, 0xa8ff7a, 0.3);
  makeNoise(tank.pos.x, tank.pos.z, 26);
  var left = LEVEL.tanks.filter(function (t) { return t.intact; }).length;
  if (left) {
    hudToast('Tank ruptured. ' + left + ' still holding.');
  } else {
    GAME.objectives.stockpile = true;
    hudToast('Stockpile destroyed. Blackgate has nothing left to ship.');
    hudUpdateObjectives();
  }
}

function destroyPanel(panel) {
  if (!panel || !panel.alive) return;
  panel.alive = false;
  panel.led.material = MAT.ledDim;
  panel.mesh.material = MAT.metalDark;
  sfxImpact(panel.pos, true);
  var left = LEVEL.panels.filter(function (p) { return p.alive; }).length;
  hudToast(left ? ('Alarm panel destroyed. ' + left + ' still live.')
                : 'Last alarm panel destroyed. They cannot call this in.');
}

/* Guard and lab-staff placement with their patrol routes, in cell coordinates. */
function cellVec(x, z) { return new THREE.Vector3(cellToWorldX(x), 0, cellToWorldZ(z)); }

var SPAWNS = [
  // The insertion room is empty. You get the bathroom to find your feet, and
  // the first guard is met through the doorway on your terms — the Facility
  // opening, rather than a room that has already seen you.
  { kind: 'guard', at: [3.5, 8.0], patrol: [[3.5, 12.0], [3.5, 7.5]] },
  { kind: 'guard', at: [3.5, 11.0], patrol: [[3.5, 12.4], [6.5, 11.5], [3.5, 12.4]] },
  // main corridor patrols
  { kind: 'guard', at: [3.5, 9], patrol: [[3.5, 8], [3.5, 12], [8, 11.5]] },
  { kind: 'guard', at: [12, 11.5], patrol: [[6, 11.5], [16, 11.5], [16, 12.4], [6, 12.4]] },
  { kind: 'guard', at: [20, 12], patrol: [[21, 11.5], [14, 12.4], [21, 12.4]] },
  // laboratory staff
  { kind: 'scientist', at: [19, 16], patrol: [[19, 15], [23, 16], [19, 19]] },
  { kind: 'scientist', at: [22, 18], patrol: [[22, 19], [20, 15], [23, 18]] },
  // control room
  { kind: 'guard', at: [19, 23], patrol: [[19, 23], [22, 23], [22, 25.5], [19, 25.5]] },
  { kind: 'guard', at: [21, 25], patrol: [[21, 25], [19, 22.5], [23, 24]] },
  // chemical plant
  { kind: 'guard', at: [7, 22], patrol: [[7, 20], [7, 25], [11, 25], [11, 20]] },
  { kind: 'guard', at: [3, 24], patrol: [[3, 20], [3, 25.5], [6, 23]] },
  { kind: 'guard', at: [15, 24.5], patrol: [[14, 24.5], [16.5, 24.5]] }
];

function spawnEnemies() {
  for (var i = 0; i < ENEMIES.list.length; i++) ENEMIES.list[i].dispose();
  ENEMIES.list.length = 0;
  ENEMIES.runnerActive = null;
  for (i = 0; i < SPAWNS.length; i++) {
    var s = SPAWNS[i];
    var pts = [];
    for (var p = 0; p < s.patrol.length; p++) pts.push(cellVec(s.patrol[p][0], s.patrol[p][1]));
    var e = new Enemy(cellVec(s.at[0], s.at[1]), pts, s.kind);
    e.group.position.y = supportHeight(e.group.position.x, e.group.position.z);
    e.sightPhase = i & 1;          // half the roster does its sight check each frame
    // Face the first leg of the patrol rather than all staring down +Z, so the
    // opening of the level is not decided by an accident of default rotation.
    if (pts.length) {
      e.yaw = Math.atan2(pts[0].x - e.group.position.x, pts[0].z - e.group.position.z);
      e.applyYaw();
    }
    ENEMIES.list.push(e);
  }
}

// ===SECTION 4===
/* Renderer, lighting rig, environment probe and the post-processing chain.
   Design notes that matter:
   - Point-light cube shadows cost six render passes each, so the number of
     shadow casters is fixed at construction (changing it mid-frame would force
     every material in the scene to recompile). Two key lights cast; the cap is six.
   - The facility has ~70 light fixtures but only a small pool of real lights;
     the pool is re-homed to the nearest fixtures as the player moves, which
     keeps the light count — and therefore the shader programs — constant. */

var RENDER = {
  renderer: null, scene: null, camera: null,
  ambient: null, hemi: null, lightPool: [], envRT: null,
  shadowSize: 1024, shadowCount: 0,
  bloomEnabled: true, shadowsEnabled: true,
  width: 1, height: 1, renderScale: 1, targetScale: 1,
  frameMs: 16.7, scaleCooldown: 0, shadowTick: 0,
  alarmMix: 0, drawInfo: ''
};

function initRenderer(canvas) {
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer || !renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.render.pixelRatioCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.gfx.exposure;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(CFG.render.fogColor, 1);
  RENDER.renderer = renderer;

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CFG.render.fogColor, CFG.render.fogDensity);
  scene.background = new THREE.Color(CFG.render.fogColor);
  RENDER.scene = scene;

  var camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, CFG.camera.near, CFG.camera.far);
  camera.rotation.order = 'YXZ';
  RENDER.camera = camera;
  scene.add(camera);

  _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3();
  return renderer;
}

/* A tiny synthetic room baked to a PMREM probe. Without it every metal surface
   renders black — metalness with no environment has nothing to reflect, and the
   PBR table in this build leans hard on metalness. */
function buildEnvironment() {
  var envScene = new THREE.Scene();
  // Emissive standard materials rather than basic ones: MeshBasicMaterial is
  // banned on game surfaces, and there is no reason to make an exception here.
  var emis = function (hex) {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hex, emissiveIntensity: 1, roughness: 1 });
  };
  var shell = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 24), emis(0x0e1218));
  shell.material.side = THREE.BackSide;
  envScene.add(shell);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), emis(0x191b20));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -4.9;
  envScene.add(floor);
  for (var i = -1; i <= 1; i++) {
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.6), emis(0xccddff));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, 4.9, i * 6);
    envScene.add(strip);
  }
  try {
    var pmrem = new THREE.PMREMGenerator(RENDER.renderer);
    pmrem.compileEquirectangularShader();
    RENDER.envRT = pmrem.fromScene(envScene, 0.04);
    RENDER.scene.environment = RENDER.envRT.texture;
    pmrem.dispose();
  } catch (e) {
    RENDER.envRT = null;
  }
  shell.geometry.dispose(); floor.geometry.dispose();
}

function setupLights(level) {
  var scene = RENDER.scene;

  // Near-black ambient: with no fixture overhead, a room reads as dark.
  RENDER.ambient = new THREE.AmbientLight(CFG.colors.ambient, 1.0);
  scene.add(RENDER.ambient);

  // A whisper of hemisphere so unlit geometry keeps its shape instead of
  // collapsing to a flat silhouette. Far below the old fill level.
  RENDER.hemi = new THREE.HemisphereLight(CFG.colors.hemiSky, CFG.colors.hemiGround, 0.22);
  scene.add(RENDER.hemi);

  // Four fixtures' worth of light, a PointLight pair flanking each. The count is
  // fixed for the lifetime of the scene — changing it would recompile every
  // material — so the pool is re-homed onto nearby fixtures instead.
  RENDER.shadowSize = IS_MOBILE ? 512 : CFG.gfx.shadowSize;
  var shadowCount = CFG.gfx.shadowLights;
  for (var i = 0; i < CFG.render.lightPoolSize; i++) {
    var light = new THREE.PointLight(CFG.colors.fluoro, 1.5, 6);
    if (i < shadowCount) {
      light.castShadow = true;
      light.shadow.mapSize.width = RENDER.shadowSize;
      light.shadow.mapSize.height = RENDER.shadowSize;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 8;
      light.shadow.bias = -0.005;
    }
    light.position.set(0, WALL_H - 0.35, 0);
    // Always visible. three.js counts only visible lights when it builds the
    // lighting state every material is compiled against, so toggling .visible
    // is a light-count change -- and a shader recompile hitch -- in disguise.
    // An unused slot is switched off by weight instead (see updateLighting).
    light.visible = true;
    light.intensity = 0;
    scene.add(light);
    RENDER.lightPool.push({ light: light, fixture: -1, casts: i < shadowCount, side: (i % 2) ? 1 : -1, weight: 0 });
  }
  RENDER.shadowCount = shadowCount;
}

/* Re-home the light pool onto the fixtures nearest the camera, two lights per
   fixture. Runs on a slow tick — positions only change as the player walks. */
var _fixtureOrder = [];
var _colNormal = new THREE.Color(), _colAlarm = new THREE.Color();
function updateLightPool(camPos) {
  var pts = LEVEL.lightPoints, i;
  if (_fixtureOrder.length !== pts.length) {
    _fixtureOrder.length = 0;
    for (i = 0; i < pts.length; i++) _fixtureOrder.push(i);
  }
  _fixtureOrder.sort(function (a, b) {
    return pts[a].distanceToSquared(camPos) - pts[b].distanceToSquared(camPos);
  });
  for (i = 0; i < RENDER.lightPool.length; i++) {
    var slot = RENDER.lightPool[i];
    var fixtureIdx = (i >> 1) < _fixtureOrder.length ? _fixtureOrder[i >> 1] : -1;
    if (fixtureIdx < 0) { slot.weight = 0; slot.fixture = -1; continue; }
    if (slot.fixture !== fixtureIdx) {
      slot.fixture = fixtureIdx;
      slot.light.position.copy(pts[fixtureIdx]);
      slot.light.position.x += slot.side * 0.6;      // flank the fixture body
    }
    var d2 = pts[fixtureIdx].distanceToSquared(camPos);
    slot.weight = d2 < 260 ? 1 : 0;
  }
}

/* Alarm lighting: lerp to red over 0.3s, then pulse at 1Hz. */
function updateLighting(dt, alarmActive, elapsed) {
  var target = alarmActive ? 1 : 0;
  var rate = dt / 0.3;
  RENDER.alarmMix += clamp(target - RENDER.alarmMix, -rate, rate);
  var mix = RENDER.alarmMix;

  var col = _colNormal.setHex(CFG.colors.fluoro).lerp(_colAlarm.setHex(CFG.colors.alarm), mix);
  var pulse = 0.55 + 0.45 * Math.sin(elapsed * Math.PI * 2);      // 1Hz
  var intensity = 1.5 * (1 - mix) + mix * (1.5 * pulse * 1.7);

  for (var i = 0; i < RENDER.lightPool.length; i++) {
    var slot = RENDER.lightPool[i];
    slot.light.color.copy(col);
    slot.light.intensity = intensity * slot.weight;
  }
  if (MAT.lampOn) {
    MAT.lampOn.emissive.copy(col);
    MAT.lampOn.emissiveIntensity = 1.8 * (1 - mix) + mix * (1.9 * pulse);
  }
  RENDER.hemi.intensity = 0.22 * (1 - mix * 0.5);
}

/* ---------- post-processing chain ----------
   RenderPass -> UnrealBloomPass -> Vignette -> FXAA, built from the r128
   examples/js scripts inlined in Section 1.

   Colour-space note: r128 takes a material's output encoding from the render
   target it is drawing into, so the composer's targets are tagged sRGB. That
   keeps the chain display-referred end to end and lets FXAA (which reasons
   about perceptual luma) be the final pass exactly as specified, with no extra
   gamma-correction pass in between. */

var GFX = {
  composer: null, renderPass: null, bloom: null, vignette: null, fxaa: null,
  quality: 'high', frameSamples: [], sampleIdx: 0, downgraded: false, stage: 0, goodWindows: 0
};

function initPostFX() {
  var renderer = RENDER.renderer, scene = RENDER.scene, camera = RENDER.camera;
  var size = renderer.getDrawingBufferSize(new THREE.Vector2());

  var rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, stencilBuffer: false
  });
  rt.texture.encoding = THREE.sRGBEncoding;
  rt.texture.generateMipmaps = false;

  var composer = new THREE.EffectComposer(renderer, rt);
  composer.setSize(size.x, size.y);

  GFX.renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(GFX.renderPass);

  // threshold 0.85, strength 0.4, radius 0.5 — only emissive surfaces, muzzle
  // flashes and sparks sit above the threshold, so nothing else blooms.
  GFX.bloom = new THREE.UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    CFG.gfx.bloomStrength, CFG.gfx.bloomRadius, CFG.gfx.bloomThreshold
  );
  composer.addPass(GFX.bloom);

  GFX.vignette = new THREE.ShaderPass(THREE.VignetteShader);
  GFX.vignette.uniforms['darkness'].value = CFG.gfx.vignetteDarkness;
  GFX.vignette.uniforms['offset'].value = CFG.gfx.vignetteOffset;
  composer.addPass(GFX.vignette);

  GFX.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
  composer.addPass(GFX.fxaa);
  GFX.fxaa.renderToScreen = true;

  GFX.composer = composer;
  updateFXAAResolution();
  publishGFX();
}

/* FXAA works in device pixels, so its resolution uniform tracks the drawing
   buffer and has to be recomputed whenever the canvas or pixel ratio changes. */
function updateFXAAResolution() {
  if (!GFX.fxaa) return;
  var renderer = RENDER.renderer;
  var pr = renderer.getPixelRatio();
  var w = Math.max(1, Math.floor(RENDER.width * pr));
  var h = Math.max(1, Math.floor(RENDER.height * pr));
  GFX.fxaa.material.uniforms['resolution'].value.set(1 / w, 1 / h);
}

function publishGFX() {
  window.__GFX = {
    bloomStrength: GFX.bloom ? GFX.bloom.strength : 0,
    shadowSize: RENDER.shadowSize,
    quality: GFX.quality
  };
}

function resizeRenderer() {
  var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  RENDER.width = w; RENDER.height = h;
  var dpr = Math.min(window.devicePixelRatio || 1, CFG.render.pixelRatioCap) * RENDER.renderScale;
  RENDER.renderer.setPixelRatio(dpr);
  RENDER.renderer.setSize(w, h, false);
  RENDER.camera.aspect = w / h;
  RENDER.camera.updateProjectionMatrix();

  if (GFX.composer) {
    GFX.composer.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    if (GFX.bloom) GFX.bloom.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    updateFXAAResolution();
  }
  hudResizeCanvas();
}

/* Adaptive quality: average the last 60 frame times; past 22ms the bloom pass
   is switched off and the shadow maps drop to 512. A second stage trims render
   resolution if that was not enough, which is what keeps a phone above 45fps.

   Three rules stop it misjudging a machine that is actually fine. It ignores
   the first couple of seconds, because the opening frames pay for shader
   compiles and the environment bake and are not representative of anything. It
   caps each sample, so one stall -- a tab switch, a garbage collection --
   cannot poison a whole window. And it can climb back up: a sustained stretch
   comfortably under budget restores the stage it gave away, with a wide gap
   between the two thresholds so it cannot sit there flapping. */
function updateRenderScale(dt, frameMs) {
  RENDER.frameMs += (frameMs - RENDER.frameMs) * 0.08;

  // a single stalled frame is an event, not evidence about the hardware
  GFX.frameSamples[GFX.sampleIdx % 60] = Math.min(frameMs, 120);
  GFX.sampleIdx++;
  if (GFX.sampleIdx % 60 !== 0 || GFX.frameSamples.length < 60) return;
  if (GAME.frameCount < 150 || GAME.state !== 'playing') return;   // warm-up

  var sum = 0;
  for (var i = 0; i < 60; i++) sum += GFX.frameSamples[i];
  var avg = sum / 60;

  if (avg < CFG.gfx.upgradeMs && GFX.stage > 0) {
    GFX.goodWindows++;
    if (GFX.goodWindows >= 3) {
      GFX.goodWindows = 0;
      if (GFX.stage === 2) {
        GFX.stage = 1;
        RENDER.renderScale = 1;
        resizeRenderer();
        console.log('[PERF] avg frame ' + avg.toFixed(1) + 'ms — render scale back to 1.0');
      } else {
        GFX.stage = 0;
        GFX.quality = 'high';
        if (GFX.bloom) GFX.bloom.enabled = RENDER.bloomEnabled;
        setShadowMapSize(CFG.gfx.shadowSize);
        console.log('[PERF] avg frame ' + avg.toFixed(1) + 'ms — bloom back on, shadow maps ' + CFG.gfx.shadowSize);
      }
      publishGFX();
    }
    return;
  }
  if (avg > CFG.gfx.downgradeMs) {
    GFX.goodWindows = 0;
    if (GFX.stage === 0) {
      GFX.stage = 1;
      GFX.quality = 'low';
      if (GFX.bloom) GFX.bloom.enabled = false;
      setShadowMapSize(512);
      console.log('[PERF] avg frame ' + avg.toFixed(1) + 'ms over 60 frames — bloom off, shadow maps 512');
      publishGFX();
    } else if (GFX.stage === 1) {
      GFX.stage = 2;
      RENDER.renderScale = 0.75;
      resizeRenderer();
      console.log('[PERF] avg frame ' + avg.toFixed(1) + 'ms still over budget — render scale 0.75');
      publishGFX();
    }
  }
}

function setShadowMapSize(px) {
  RENDER.shadowSize = px;
  for (var i = 0; i < RENDER.lightPool.length; i++) {
    var slot = RENDER.lightPool[i];
    if (!slot.casts) continue;
    slot.light.shadow.mapSize.width = px;
    slot.light.shadow.mapSize.height = px;
    if (slot.light.shadow.map) {
      slot.light.shadow.map.dispose();
      slot.light.shadow.map = null;      // forces reallocation at the new size
    }
  }
}

function renderFrame() {
  var r = RENDER.renderer;
  if (!r || !GFX.composer) return;
  if (RENDER.shadowsEnabled) {
    RENDER.shadowTick++;
    r.shadowMap.autoUpdate = IS_MOBILE ? (RENDER.shadowTick % 2 === 0) : true;
  }
  // The composer issues several render calls per frame and the renderer resets
  // its counters on each one, so accumulate manually across the whole chain.
  r.info.autoReset = false;
  r.info.reset();
  GFX.composer.render();
  RENDER.drawInfo = r.info.render.calls + ' calls / ' + r.info.render.triangles + ' tris';
}

function setBloomEnabled(on) {
  RENDER.bloomEnabled = !!on;
  if (GFX.bloom) GFX.bloom.enabled = !!on && GFX.stage === 0;
  publishGFX();
}
function setShadowsEnabled(on) {
  RENDER.shadowsEnabled = !!on;
  RENDER.renderer.shadowMap.enabled = !!on;
  // toggling shadow state invalidates compiled programs; only ever done from a menu
  RENDER.scene.traverse(function (o) { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}

// ===SECTION 5===
/* Every sound in the facility is synthesized on the fly — there is not a single
   audio file in this build. The context is created inside the first user gesture
   because iOS will not start one any other way, and ensureAudio() is written to
   return a boolean rather than throw so that a browser with audio blocked still
   plays the game silently. */

var audioCtx = null;            // stays null until a real user gesture
var audioAvailable = false;
var AUDIO = { master: null, volume: 0.75, noiseBuf: null, alarmOsc: null, alarmGain: null };

function ensureAudio() {
  if (audioAvailable) return true;
  if (audioCtx) return audioAvailable;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audioCtx = new AC();
    AUDIO.master = audioCtx.createGain();
    AUDIO.master.gain.value = AUDIO.volume;
    AUDIO.master.connect(audioCtx.destination);
    // A one-sample silent buffer pushed through synchronously: iOS treats the
    // context as unlocked only once something has actually played inside the gesture.
    var b = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    var s = audioCtx.createBufferSource();
    s.buffer = b; s.connect(AUDIO.master); s.start(0);
    if (audioCtx.resume) audioCtx.resume();
    AUDIO.noiseBuf = makeNoiseBuffer(1.0);
    audioAvailable = true;
    return true;
  } catch (e) {
    audioCtx = null; audioAvailable = false;
    return false;
  }
}
function audioResume() { try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
function audioSuspend() { try { if (audioCtx && audioCtx.state === 'running') audioCtx.suspend(); } catch (e) {} }
function setMasterVolume(v) {
  AUDIO.volume = clamp(v, 0, 1);
  try { if (AUDIO.master) AUDIO.master.gain.value = AUDIO.volume; } catch (e) {}
}
function makeNoiseBuffer(sec) {
  var n = Math.floor(audioCtx.sampleRate * sec);
  var buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function envelope(t0, peak, attack, decay) {
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}
function noiseBurst(t0, peak, dur, filterType, freq, q, rate) {
  var src = audioCtx.createBufferSource();
  src.buffer = AUDIO.noiseBuf; src.loop = true;
  src.playbackRate.value = rate || 1;
  var f = audioCtx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
  var g = envelope(t0, peak, 0.003, dur);
  src.connect(f); f.connect(g); g.connect(AUDIO.master);
  src.start(t0); src.stop(t0 + dur + 0.06);
  return f;
}
function toneSweep(t0, peak, dur, f0, f1, type) {
  var o = audioCtx.createOscillator();
  o.type = type || 'sawtooth';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  var g = envelope(t0, peak, 0.004, dur);
  o.connect(g); g.connect(AUDIO.master);
  o.start(t0); o.stop(t0 + dur + 0.06);
}
/* Distance attenuation done by hand — cheaper than a PannerNode per shot and
   accurate enough for a corridor shooter. */
function distGain(worldPos, maxDist) {
  if (!worldPos || !PLAYER) return 1;
  var d = worldPos.distanceTo(RENDER.camera.position);
  return clamp(1 - d / (maxDist || 40), 0, 1);
}

function sfxGunshot(type, at) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime, a = distGain(at, 45);
  if (a <= 0.01) return;
  if (type === 'pp7') {           // suppressed: soft thump, no crack
    noiseBurst(t, 0.22 * a, 0.09, 'bandpass', 900, 1.4, 0.85);
    toneSweep(t, 0.15 * a, 0.08, 260, 90, 'sine');
  } else if (type === 'kf7') {    // rifle: bright crack over a low body
    noiseBurst(t, 0.34 * a, 0.10, 'bandpass', 2600, 0.9, 1.25);
    noiseBurst(t, 0.20 * a, 0.16, 'lowpass', 700, 0.7, 0.8);
    toneSweep(t, 0.22 * a, 0.09, 520, 140, 'square');
  } else {                        // enemy AK-ish
    noiseBurst(t, 0.18 * a, 0.12, 'bandpass', 1800, 1.0, 1.0);
    toneSweep(t, 0.12 * a, 0.09, 380, 120, 'square');
  }
}
function sfxImpact(at, hard) {
  if (!audioAvailable) return;
  var a = distGain(at, 30); if (a <= 0.02) return;
  noiseBurst(audioCtx.currentTime, (hard ? 0.16 : 0.09) * a, hard ? 0.09 : 0.05, 'highpass', hard ? 1800 : 3200, 0.9, 1);
}
function sfxFlesh(at) {
  if (!audioAvailable) return;
  var a = distGain(at, 30); if (a <= 0.02) return;
  noiseBurst(audioCtx.currentTime, 0.17 * a, 0.10, 'lowpass', 520, 0.9, 1);
}
function sfxEnemyDeath(at) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime, a = distGain(at, 35); if (a <= 0.02) return;
  var o = audioCtx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(randRange(150, 210), t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.42);
  var g = envelope(t, 0.16 * a, 0.02, 0.42);
  var f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  o.connect(f); f.connect(g); g.connect(AUDIO.master);
  o.start(t); o.stop(t + 0.5);
  noiseBurst(t + 0.03, 0.10 * a, 0.30, 'lowpass', 640, 0.8, 0.9);
}
function sfxMinePlant(at) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime, a = distGain(at, 20);
  noiseBurst(t, 0.12 * a, 0.05, 'bandpass', 1600, 3.0, 1);
  toneSweep(t + 0.05, 0.09 * a, 0.09, 700, 1300, 'square');
}
function sfxMineBeep(at) {
  if (!audioAvailable) return;
  var a = distGain(at, 22); if (a <= 0.03) return;
  toneSweep(audioCtx.currentTime, 0.07 * a, 0.05, 1800, 1800, 'square');
}
function sfxExplosion(at) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime, a = distGain(at, 60); if (a <= 0.02) return;
  noiseBurst(t, 0.5 * a, 0.65, 'lowpass', 380, 0.6, 0.7);
  noiseBurst(t, 0.3 * a, 0.22, 'bandpass', 1400, 0.8, 1.2);
  toneSweep(t, 0.32 * a, 0.5, 160, 38, 'sawtooth');
}
function sfxAlert() {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  for (var i = 0; i < 2; i++) {
    var o = audioCtx.createOscillator();
    o.type = 'square'; o.frequency.value = 880;
    var g = envelope(t + i * 0.22, 0.11, 0.01, 0.16);
    o.connect(g); g.connect(AUDIO.master);
    o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.2);
  }
}
/* Facility klaxon: an 880Hz square gated by a slow LFO, started once and
   stopped when the alarm clears. */
function setAlarmLoop(on) {
  if (!audioAvailable) return;
  try {
    if (on && !AUDIO.alarmOsc) {
      var o = audioCtx.createOscillator(); o.type = 'square'; o.frequency.value = 880;
      var g = audioCtx.createGain(); g.gain.value = 0.0;
      var lfo = audioCtx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
      var lg = audioCtx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(g.gain);
      var f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
      o.connect(f); f.connect(g); g.connect(AUDIO.master);
      o.start(); lfo.start();
      g.gain.setValueAtTime(0.045, audioCtx.currentTime);
      AUDIO.alarmOsc = { o: o, lfo: lfo }; AUDIO.alarmGain = g;
    } else if (!on && AUDIO.alarmOsc) {
      var ref = AUDIO.alarmOsc;
      AUDIO.alarmGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
      setTimeout(function () { try { ref.o.stop(); ref.lfo.stop(); } catch (e) {} }, 600);
      AUDIO.alarmOsc = null;
    }
  } catch (e) {}
}
function sfxFootstep(crouch, left) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  noiseBurst(t, crouch ? 0.022 : 0.05, 0.05, 'bandpass', left ? 620 : 780, 1.8, 1);
}
function sfxDoor(at) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime, a = distGain(at, 25);
  toneSweep(t, 0.10 * a, 0.42, 420, 110, 'sawtooth');
  noiseBurst(t, 0.07 * a, 0.42, 'lowpass', 500, 0.8, 0.6);
}
function sfxReload(stage) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  if (stage === 'out') { noiseBurst(t, 0.10, 0.06, 'bandpass', 1100, 3, 1); }
  else { noiseBurst(t, 0.13, 0.07, 'bandpass', 820, 2.4, 1); toneSweep(t, 0.06, 0.05, 320, 620, 'square'); }
}
function sfxUI(up) {
  if (!audioAvailable) return;
  toneSweep(audioCtx.currentTime, 0.09, 0.08, up ? 520 : 620, up ? 880 : 340, 'sine');
}
function sfxTerminal() {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  for (var i = 0; i < 5; i++) toneSweep(t + i * 0.06, 0.055, 0.045, 760 + i * 150, 900 + i * 150, 'square');
}
function sfxPlayerHurt() {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  noiseBurst(t, 0.16, 0.2, 'lowpass', 420, 0.8, 0.8);
  toneSweep(t, 0.09, 0.18, 190, 95, 'sine');
}
function sfxSting(win) {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  var notes = win ? [392, 523, 659, 784] : [330, 262, 196, 147];
  for (var i = 0; i < notes.length; i++) {
    var o = audioCtx.createOscillator();
    o.type = win ? 'triangle' : 'sawtooth';
    o.frequency.value = notes[i];
    var g = envelope(t + i * 0.16, 0.13, 0.02, win ? 0.4 : 0.6);
    o.connect(g); g.connect(AUDIO.master);
    o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.7);
  }
}
function sfxPickup() {
  if (!audioAvailable) return;
  var t = audioCtx.currentTime;
  toneSweep(t, 0.11, 0.08, 620, 1180, 'sine');
  toneSweep(t + 0.07, 0.09, 0.12, 1180, 1500, 'sine');
}

// ===SECTION 6===
/* Player state, movement and AABB collision.
   Movement collision is swept per axis against the level's AABB list rather than
   through THREE.Raycaster: a raycaster walks scene graph objects and allocates
   intersection records every frame, which is the wrong tool for a body that
   only ever needs box-vs-box. */

var PLAYER = null;

function makePlayer() {
  return {
    pos: new THREE.Vector3(0, 0, 0),       // feet
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0, pitch: 0,
    health: CFG.player.maxHealth, maxHealth: CFG.player.maxHealth,
    armor: 0,
    crouch: false, crouchT: 0, sprinting: false, onGround: true,
    height: CFG.player.height, eye: CFG.camera.eyeHeight,
    bob: 0, bobPhase: 0, stepPhase: 0,
    lastClear: new THREE.Vector3(), stuckFrames: 0,
    noiseRadius: 0, alive: true,
    fovPunch: 0, fovCurrent: CFG.camera.fov,
    shotsFired: 0, shotsHit: 0, kills: 0,
    lastDamageAt: -99, interactTarget: null, interactHold: 0
  };
}

/* AABB for the player body at a given feet position. */
/* True when the body at this position overlaps nothing solid. */
function playerIsClear(pos) {
  var box = playerAABB(pos);
  var list = LEVEL.collidables;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.disabled || b.walkable) continue;
    if (b.maxY - pos.y <= CFG.player.stepUp) continue;   // walkable kerbs are not obstructions
    if (aabbOverlap(box, b)) return false;
  }
  return true;
}

function playerAABB(pos, heightOverride) {
  var w = CFG.player.width, d = CFG.player.depth;
  var h = heightOverride || (PLAYER ? PLAYER.height : CFG.player.height);
  return {
    minX: pos.x - w / 2, maxX: pos.x + w / 2,
    minY: pos.y, maxY: pos.y + h,
    minZ: pos.z - d / 2, maxZ: pos.z + d / 2
  };
}
function aabbOverlap(a, b) {
  return a.maxX > b.minX && a.minX < b.maxX &&
         a.maxY > b.minY && a.minY < b.maxY &&
         a.maxZ > b.minZ && a.minZ < b.maxZ;
}

/* Distance along a ray to the first enabled collision box, searched in
   [near, far]; Infinity if nothing is hit. Slab test, no allocation.

   Sight, occlusion and AI queries all come through here rather than through
   THREE.Raycaster on the rendered level. The level mesh is ~17k merged
   triangles and one mesh cast measured 0.75ms on a desktop; the roster made
   several a frame. The collision boxes are the level's real shape as far as
   bodies are concerned, and there are only a couple of hundred of them. */
function rayBoxesDistance(o, d, near, far) {
  var list = LEVEL.collidables, best = far;
  // a zero component would give 0 * Infinity = NaN on a box face; nudge it
  var ix = 1 / (d.x > 1e-9 || d.x < -1e-9 ? d.x : 1e-9),
      iy = 1 / (d.y > 1e-9 || d.y < -1e-9 ? d.y : 1e-9),
      iz = 1 / (d.z > 1e-9 || d.z < -1e-9 ? d.z : 1e-9);
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.disabled) continue;
    var t1 = (b.minX - o.x) * ix, t2 = (b.maxX - o.x) * ix;
    var tmin = t1 < t2 ? t1 : t2, tmax = t1 < t2 ? t2 : t1;
    t1 = (b.minY - o.y) * iy; t2 = (b.maxY - o.y) * iy;
    var lo = t1 < t2 ? t1 : t2, hi = t1 < t2 ? t2 : t1;
    if (lo > tmin) tmin = lo;
    if (hi < tmax) tmax = hi;
    t1 = (b.minZ - o.z) * iz; t2 = (b.maxZ - o.z) * iz;
    lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1;
    if (lo > tmin) tmin = lo;
    if (hi < tmax) tmax = hi;
    if (tmax < tmin || tmax < near) continue;
    var hit = tmin < near ? near : tmin;
    // a ray that starts inside a box (a body against a console) is not blocked by it
    if (tmin < near && tmax >= near && o.x > b.minX && o.x < b.maxX && o.y > b.minY && o.y < b.maxY && o.z > b.minZ && o.z < b.maxZ) continue;
    if (hit < best) best = hit;
  }
  return best < far ? best : Infinity;
}

/* Clear sight between two points, judged against the collision boxes. */
var _losDir = null;
function hasLineOfSight(from, to) {
  if (!_losDir) _losDir = new THREE.Vector3();
  _losDir.copy(to).sub(from);
  var dist = _losDir.length();
  if (dist < 0.01) return true;
  _losDir.divideScalar(dist);
  return rayBoxesDistance(from, _losDir, 0.05, dist - 0.05) === Infinity;
}

/* The one proxy box per living enemy that shots and the aim probe test. Built
   into a reused array: this runs every frame. */
var _hitMeshes = [];
function liveHitMeshes() {
  _hitMeshes.length = 0;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    if (ENEMIES.list[i].state !== 'DEAD') _hitMeshes.push(ENEMIES.list[i].hitMesh);
  }
  return _hitMeshes;
}

/* Resolve an AABB out of every box it overlaps, smallest penetration first.
   Returns the corrected feet position. */
function resolveCollision(aabb, collidables) {
  var cx = (aabb.minX + aabb.maxX) / 2;
  var cz = (aabb.minZ + aabb.maxZ) / 2;
  var halfW = (aabb.maxX - aabb.minX) / 2;
  var halfD = (aabb.maxZ - aabb.minZ) / 2;
  var y = aabb.minY, h = aabb.maxY - aabb.minY;
  if (!collidables) return new THREE.Vector3(cx, y, cz);

  // Two passes: resolving one box can push the body into another.
  for (var pass = 0; pass < 2; pass++) {
    for (var i = 0; i < collidables.length; i++) {
      var b = collidables[i];
      if (b.disabled) continue;
      var box = { minX: cx - halfW, maxX: cx + halfW, minY: y, maxY: y + h, minZ: cz - halfD, maxZ: cz + halfD };
      if (!aabbOverlap(box, b)) continue;
      // step over anything low enough to walk up (platform lips, kerbs)
      if (b.maxY - y > 0 && b.maxY - y <= CFG.player.stepUp && b.stepable !== false) { y = b.maxY; continue; }
      var penX = (cx < (b.minX + b.maxX) / 2) ? (b.minX - (cx + halfW)) : (b.maxX - (cx - halfW));
      var penZ = (cz < (b.minZ + b.maxZ) / 2) ? (b.minZ - (cz + halfD)) : (b.maxZ - (cz - halfD));
      if (Math.abs(penX) < Math.abs(penZ)) cx += penX; else cz += penZ;
    }
  }
  return new THREE.Vector3(cx, y, cz);
}

/* Highest supporting surface under the body, used for the control room platform. */
function groundHeightUnder(pos, collidables) {
  var best = 0;
  var halfW = CFG.player.width / 2, halfD = CFG.player.depth / 2;
  for (var i = 0; i < collidables.length; i++) {
    var b = collidables[i];
    if (b.disabled || !b.walkable) continue;
    if (pos.x + halfW <= b.minX || pos.x - halfW >= b.maxX) continue;
    if (pos.z + halfD <= b.minZ || pos.z - halfD >= b.maxZ) continue;
    if (b.maxY <= pos.y + CFG.player.stepUp && b.maxY > best) best = b.maxY;
  }
  return best;
}

function updatePlayer(dt, input) {
  var P = PLAYER;
  if (!P.alive) return;

  // ---- stance ----
  var wantCrouch = input.crouch;
  P.crouchT = clamp(P.crouchT + (wantCrouch ? dt * 8 : -dt * 8), 0, 1);
  var standH = CFG.player.height, crouchH = CFG.player.height * 0.5;
  var targetH = lerp(standH, crouchH, P.crouchT);
  if (targetH > P.height) {
    // only stand if there is headroom
    var test = playerAABB(P.pos, targetH);
    var blocked = false;
    for (var i = 0; i < LEVEL.collidables.length && !blocked; i++) {
      var b = LEVEL.collidables[i];
      if (!b.disabled && aabbOverlap(test, b) && b.maxY > P.pos.y + CFG.player.stepUp) blocked = true;
    }
    if (!blocked) P.height = targetH; else P.crouchT = clamp(P.crouchT + dt * 8, 0, 1);
  } else P.height = targetH;
  P.crouch = P.crouchT > 0.5;
  P.eye = lerp(CFG.camera.eyeHeight, CFG.camera.crouchEye, P.crouchT);

  // ---- look ----
  P.yaw -= input.lookX;
  P.pitch -= input.lookY * (input.invertY ? -1 : 1);
  P.pitch = clamp(P.pitch, -1.396, 1.396);        // +/-80 degrees, never full vertical

  // ---- movement ----
  var mag = Math.hypot(input.moveX, input.moveY);
  var mx = input.moveX, mz = input.moveY;
  if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
  P.sprinting = input.sprint && mag > 0.85 && !P.crouch && mz < -0.1;
  var speed = CFG.player.walkSpeed * (GAME.turbo ? 1.5 : 1);
  if (P.crouch) speed *= CFG.player.crouchMul;
  else if (P.sprinting) speed *= CFG.player.sprintMul;

  var sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  // forward = (-sin, -cos), right = (cos, -sin); mz is -1 for "forward"
  var wishX = (mx * cos + mz * sin) * speed;
  var wishZ = (mz * cos - mx * sin) * speed;
  var accel = CFG.player.accel * dt;
  P.vel.x += (wishX - P.vel.x) * Math.min(1, accel);
  P.vel.z += (wishZ - P.vel.z) * Math.min(1, accel);
  if (mag < 0.05) {
    var fr = Math.min(1, CFG.player.friction * dt);
    P.vel.x -= P.vel.x * fr; P.vel.z -= P.vel.z * fr;
  }

  // gravity and support
  P.vel.y -= CFG.player.gravity * dt;
  P.pos.x += P.vel.x * dt;
  P.pos.z += P.vel.z * dt;
  P.pos.y += P.vel.y * dt;

  var corrected = resolveCollision(playerAABB(P.pos), LEVEL.collidables);
  // if the resolver moved us, kill the velocity into the wall
  if (Math.abs(corrected.x - P.pos.x) > 1e-6) P.vel.x = 0;
  if (Math.abs(corrected.z - P.pos.z) > 1e-6) P.vel.z = 0;
  P.pos.copy(corrected);
  separateFromBodies(P);

  // Wedge failsafe. Two boxes meeting at a corner can each push the body back
  // into the other, which reads to the player as being stuck inside a wall.
  // Every frame that ends cleanly is remembered; a frame that ends overlapping
  // retreats toward the last good spot instead of trapping the player there.
  if (playerIsClear(P.pos)) {
    P.lastClear.copy(P.pos);
    P.stuckFrames = 0;
  } else {
    P.stuckFrames++;
    if (P.stuckFrames > 3) {
      var back = P.lastClear.clone().sub(P.pos);
      var backLen = back.length();
      if (backLen > 0.001) {
        // ease back along the escape line rather than snapping
        P.pos.addScaledVector(back.normalize(), Math.min(backLen, 0.35));
      }
      P.vel.set(0, P.vel.y, 0);
      if (P.stuckFrames > 30) { P.pos.copy(P.lastClear); P.stuckFrames = 0; }
    }
  }

  var ground = groundHeightUnder(P.pos, LEVEL.collidables);
  if (P.pos.y <= ground + 0.001) { P.pos.y = ground; P.vel.y = 0; P.onGround = true; }
  else P.onGround = false;

  // ---- head bob and footstep noise ----
  var hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 0.4) {
    P.bobPhase += dt * (P.sprinting ? 13 : (P.crouch ? 6 : 9.5));
    P.bob = Math.sin(P.bobPhase) * (P.sprinting ? 0.045 : 0.026) * (P.crouch ? 0.5 : 1);
    P.stepPhase -= dt * (P.sprinting ? 1.6 : (P.crouch ? 0.7 : 1));
    if (P.stepPhase <= 0) {
      P.stepPhase = 0.45;
      sfxFootstep(P.crouch, (Math.floor(P.bobPhase) & 1) === 0);
      // noise the AI can hear; crouching is genuinely quieter
      P.noiseRadius = P.crouch ? 3 : (P.sprinting ? 12 : 7);
      makeNoise(P.pos.x, P.pos.z, P.noiseRadius);
    }
  } else {
    P.bob *= Math.max(0, 1 - dt * 6);
  }

  // ---- FOV punch springs back toward the resting FOV ----
  P.fovPunch += (0 - P.fovPunch) * Math.min(1, dt * 14);
  var restFov = CFG.camera.fov + (P.sprinting ? 4 : 0) - (WEAPONS.aiming ? 12 : 0);
  P.fovCurrent += (restFov + P.fovPunch - P.fovCurrent) * Math.min(1, dt * 12);

  // ---- camera ----
  var cam = RENDER.camera;
  cam.position.set(P.pos.x, P.pos.y + P.eye + P.bob, P.pos.z);
  cam.rotation.set(P.pitch, P.yaw, 0);
  // Shots and the aim probe cast from the camera's world matrix, which three.js
  // otherwise refreshes only when it renders -- after this frame's shots. Every
  // shot used to leave along last frame's aim.
  cam.updateMatrixWorld();
  if (Math.abs(cam.fov - P.fovCurrent) > 0.01) {
    cam.fov = P.fovCurrent;
    cam.updateProjectionMatrix();
  }
}

/* Guards are solid. You used to walk straight through them. The push is only
   taken if it leaves you clear of the level, so a guard can never shove you
   into a wall; the wedge failsafe below would catch it if one did. */
var BODY_GAP = 0.2 + 0.3;       // player half-width + guard radius
function separateFromBodies(P) {
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    var g = e.group.position;
    if (Math.abs(g.y - P.pos.y) > 1.2) continue;
    var dx = P.pos.x - g.x, dz = P.pos.z - g.z, d = Math.hypot(dx, dz);
    if (d >= BODY_GAP) continue;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    var push = BODY_GAP - d, ox = P.pos.x, oz = P.pos.z;
    P.pos.x += dx / d * push; P.pos.z += dz / d * push;
    if (!playerIsClear(P.pos)) { P.pos.x = ox; P.pos.z = oz; }
  }
}

function damagePlayer(amount, fromPos) {
  var P = PLAYER;
  if (!P.alive || GAME.state !== 'playing') return;
  if (GAME.invincible) { hudFlashDamage(fromPos); return; }
  var diff = CFG.difficulty[GAME.difficulty];
  amount *= diff.dmgTaken;
  // body armour soaks first, exactly like the field kit it is named after
  if (P.armor > 0) {
    var soak = Math.min(P.armor, amount * 0.7);
    P.armor -= soak; amount -= soak;
  }
  P.health -= amount;
  P.lastDamageAt = GAME.elapsed;
  sfxPlayerHurt();
  hudFlashDamage(fromPos);
  if (P.health <= 0) {
    P.health = 0; P.alive = false;
    // the frame loop's loss check ends the mission; ending it here as well was
    // two code paths for one event
  }
}

// ===SECTION 7===
/* Three weapons, hitscan resolution, pooled effects and a box-built viewmodel.
   One deliberate structural choice: the muzzle flash light is created once and
   parked at zero intensity rather than added and removed per shot. Adding a
   light to a three.js scene changes the lighting state every material is
   compiled against, so an add/remove per trigger pull would recompile the whole
   scene's shaders on every shot. */

var WEAPONS = {
  list: [], index: 0, aiming: false, cooldown: 0, reloading: 0,
  muzzleLight: null, viewGroup: null, viewModels: [], recoil: 0, swayX: 0, swayY: 0,
  mines: [], impactPool: [], impactHead: 0, lastFireAt: -99,
  flashQuad: null, flashTimer: 0, flashPeak: 0, flashSpan: 0, flashFromPlayer: false
};
var weapons = null;          // the array the test suite inspects
var currentWeapon = null;

function buildWeapons() {
  WEAPONS.list = [
    {
      id: 'pp7', name: 'PP7', slot: 1, owned: true,
      damage: 25, auto: false, rps: 4.5, magSize: 7, ammoInMag: 7,
      reserve: Infinity, infiniteReserve: true, reloadTime: 1.15,
      spread: 0.006, aimSpread: 0.0015, recoil: 0.9, range: 60,
      suppressed: true, noise: CFG.ai.suppressedHearing, sound: 'pp7'
    },
    {
      // Not carried in: taken off the first guard you drop, as in the Facility.
      id: 'kf7', name: 'KF7 SOVIET', slot: 2, owned: false,
      damage: 15, auto: true, rps: 10, magSize: 30, ammoInMag: 0,
      reserve: 0, infiniteReserve: false, reloadTime: 2.1,
      spread: 0.028, aimSpread: 0.011, recoil: 1.5, range: 55,
      suppressed: false, noise: CFG.ai.hearingRadius, sound: 'kf7'
    },
    {
      id: 'mine', name: 'PROXIMITY MINE', slot: 3, owned: true,
      damage: 80, auto: false, rps: 1, magSize: 3, ammoInMag: 3,
      reserve: 0, infiniteReserve: false, reloadTime: 0,
      spread: 0, aimSpread: 0, recoil: 0.4, range: 4,
      thrown: true, blastRadius: 5, noise: CFG.ai.hearingRadius, sound: 'mine'
    }
  ];
  weapons = WEAPONS.list;
  WEAPONS.index = 0;
  currentWeapon = weapons[0];

  // parked muzzle light — never added or removed at runtime
  WEAPONS.muzzleLight = new THREE.PointLight(0xff8800, 0, 4);
  RENDER.scene.add(WEAPONS.muzzleLight);

  buildViewModels();
  buildImpactPool();
}

/* Viewmodels are compound groups parented to the camera. Every part is a
   MeshStandardMaterial; barrels are real cylinders rather than boxes. */
function buildViewModels() {
  var g = new THREE.Group();
  RENDER.camera.add(g);
  g.position.set(0, 0, 0);
  WEAPONS.viewGroup = g;

  function box(w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
  function barrel(r, len, x, y, z, mat) {
    var geo = new THREE.CylinderGeometry(r, r, len, 10, 1);
    geo.rotateX(Math.PI / 2);                 // lie the cylinder along -Z
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }

  var slideMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.1, metalness: 0.9, envMapIntensity: 1.8 });
  var gripMat  = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.3 });
  var woodMat  = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95, metalness: 0.0 });
  var darkMet  = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.6 });
  MAT.gunSlide = slideMat; MAT.gunGrip = gripMat; MAT.gunWood = woodMat; MAT.gunDark = darkMet;

  // --- PP7: slide, barrel, handle ---
  var pp7 = new THREE.Group();
  pp7.add(box(0.08, 0.05, 0.18, 0, 0, 0, slideMat));
  pp7.add(barrel(0.012, 0.22, 0, 0.002, -0.16, slideMat));
  pp7.add(box(0.055, 0.12, 0.08, 0, -0.075, 0.045, gripMat));
  pp7.add(box(0.03, 0.018, 0.05, 0, -0.03, 0.02, gripMat));       // trigger guard
  WEAPONS.viewModels.push(pp7);

  // --- KF7 Soviet: receiver, barrel, stock, magazine ---
  var kf7 = new THREE.Group();
  kf7.add(box(0.08, 0.07, 0.35, 0, 0, 0, darkMet));
  kf7.add(barrel(0.013, 0.45, 0, 0.012, -0.36, darkMet));
  kf7.add(box(0.055, 0.09, 0.2, 0, -0.012, 0.26, woodMat));        // stock
  kf7.add(box(0.04, 0.14, 0.07, 0, -0.10, -0.02, darkMet));        // magazine below receiver
  kf7.add(box(0.05, 0.10, 0.07, 0, -0.075, 0.10, gripMat));        // pistol grip
  kf7.add(box(0.016, 0.02, 0.10, 0, 0.05, -0.10, darkMet));        // rear sight rail
  WEAPONS.viewModels.push(kf7);

  // --- Proximity mine: flat disc + blinking LED ---
  var mine = new THREE.Group();
  var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.03, 18, 1),
    new THREE.MeshStandardMaterial({ color: 0x8a7a2e, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.8 }));
  disc.rotation.x = Math.PI / 2;
  mine.add(disc);
  var blink = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), MAT.ledRed);
  blink.position.set(0.03, 0.02, -0.02);
  mine.add(blink);
  mine.userData.blinker = blink;
  WEAPONS.viewModels.push(mine);

  for (var i = 0; i < WEAPONS.viewModels.length; i++) {
    WEAPONS.viewModels[i].visible = (i === 0);
    WEAPONS.viewModels[i].scale.setScalar(0.82);   // re-scaled per frame for aspect
    g.add(WEAPONS.viewModels[i]);
  }

  // Muzzle flash quad: a plane already facing the camera because it lives in
  // view space. MeshStandardMaterial with a strong emissive so bloom catches it.
  // Additive blending is what makes this read as light rather than a decal: the
  // dark edge of the radial texture adds nothing, so the falloff is free and no
  // alpha-channel behaviour has to be relied on.
  var flashMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2.4,
    emissiveMap: TEX.flash, map: TEX.flash,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, roughness: 1, metalness: 0
  });
  MAT.muzzleFlash = flashMat;
  var flash = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), flashMat);
  flash.visible = false;
  flash.renderOrder = 5;
  g.add(flash);
  WEAPONS.flashQuad = flash;
}

function buildImpactPool() {
  var geo = new THREE.SphereGeometry(0.04, 5, 4);
  var matSpark = new THREE.MeshStandardMaterial({
    color: 0xffcc66, emissive: 0xffaa22, emissiveIntensity: 2.2, roughness: 1
  });
  var matBlood = new THREE.MeshStandardMaterial({ color: CFG.colors.blood, roughness: 1 });
  // Eight particles per impact, drawn from a fixed pool so a firefight can
  // never allocate mid-frame.
  for (var i = 0; i < 48; i++) {
    var m = new THREE.Mesh(geo, matSpark);
    m.visible = false; m.castShadow = false; m.receiveShadow = false;
    m.frustumCulled = false;
    RENDER.scene.add(m);
    WEAPONS.impactPool.push({ mesh: m, life: 0, vel: new THREE.Vector3(), spark: matSpark, blood: matBlood });
  }
}

function spawnImpactEffect(point, normal, isFlesh) {
  var n = normal || new THREE.Vector3(0, 1, 0);
  for (var i = 0; i < 8; i++) {
    var p = WEAPONS.impactPool[WEAPONS.impactHead];
    WEAPONS.impactHead = (WEAPONS.impactHead + 1) % WEAPONS.impactPool.length;
    p.mesh.material = isFlesh ? p.blood : p.spark;
    p.mesh.position.copy(point);
    p.mesh.visible = true;
    p.life = 0.8;
    p.vel.set(
      n.x * randRange(1, 3) + randRange(-1.6, 1.6),
      Math.abs(n.y) * randRange(0.5, 2) + randRange(0.6, 2.8),
      n.z * randRange(1, 3) + randRange(-1.6, 1.6)
    );
  }
}
function updateImpacts(dt) {
  for (var i = 0; i < WEAPONS.impactPool.length; i++) {
    var p = WEAPONS.impactPool[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    var s = clamp(p.life / 0.8, 0, 1);
    p.mesh.scale.setScalar(0.4 + s * 0.6);
  }
}

function switchWeapon(idx) {
  if (idx < 0 || idx >= WEAPONS.list.length || idx === WEAPONS.index) return;
  if (!WEAPONS.list[idx].owned) return;
  WEAPONS.index = idx;
  currentWeapon = WEAPONS.list[idx];
  WEAPONS.reloading = 0;
  for (var i = 0; i < WEAPONS.viewModels.length; i++) WEAPONS.viewModels[i].visible = (i === idx);
  sfxReload('in');
}
function cycleWeapon(dir) {
  var n = WEAPONS.list.length;
  for (var step = 1; step < n; step++) {
    var idx = ((WEAPONS.index + dir * step) % n + n) % n;
    if (WEAPONS.list[idx].owned) { switchWeapon(idx); return; }
  }
}
function reloadWeapon() {
  var w = currentWeapon;
  if (!w || w.thrown || WEAPONS.reloading > 0) return;
  if (w.ammoInMag >= w.magSize) return;
  if (!w.infiniteReserve && w.reserve <= 0) return;
  WEAPONS.reloading = w.reloadTime;
  sfxReload('out');
}
function finishReload() {
  var w = currentWeapon;
  var need = w.magSize - w.ammoInMag;
  if (w.infiniteReserve) { w.ammoInMag = w.magSize; }
  else {
    var take = Math.min(need, w.reserve);
    w.ammoInMag += take; w.reserve -= take;
  }
  sfxReload('in');
}

/* Hitscan. Enemies and the level are both tested; nearest hit wins so nobody
   ever shoots through a wall. */
var _ray = null, _screenCentre = null;
/* ---------- what the crosshair is on ----------
   Two rules run this game's interaction language, and they are borrowed rather
   than invented. Half-Life 2's: the object's own shape and lighting should say
   what it is before any interface does, so every interactable here wears the
   same housing and the same lit indicator and reads as equipment on sight.
   Mirror's Edge's: one colour, used for nothing else, means "you can act on
   this" -- red is a thing to shoot, amber is a thing to hold USE on, and no
   scenery is allowed either colour.

   The interface is the second half, not the first. One probe down the
   crosshair each frame classifies what is under it; the reticle, the label and
   the object's own highlight all read that one result, so they can never
   disagree with each other or with what a shot would actually hit. */
var AIM = { kind: null, target: null, label: '', dist: Infinity, prompt: '' };
var INTERACTABLES = [];        // rebuilt with the level
var _aimRay = null, _aimCentre = null, _aimPoint = new THREE.Vector3();

function registerInteractable(entry) { INTERACTABLES.push(entry); }

function updateAimProbe() {
  AIM.kind = null; AIM.target = null; AIM.label = ''; AIM.dist = Infinity; AIM.prompt = '';
  if (!LEVEL || GAME.state !== 'playing') return;
  if (!_aimRay) { _aimRay = new THREE.Raycaster(); _aimCentre = new THREE.Vector2(0, 0); }
  _aimRay.setFromCamera(_aimCentre, RENDER.camera);
  _aimRay.far = 60;

  var bestDist = Infinity, bestKind = null, bestTarget = null, bestLabel = '';

  // guards first: they are what you are usually pointing at
  var i;
  var eh = _aimRay.intersectObjects(liveHitMeshes(), false);
  if (eh.length) {
    bestDist = eh[0].distance; bestKind = 'enemy';
    bestTarget = eh[0].object.userData.enemy;
    bestLabel = bestTarget && bestTarget.kind === 'scientist' ? 'LAB STAFF' : 'GUARD';
  }

  // Then the fixtures. Shoot targets and use targets are found differently on
  // purpose. A thing you shoot is found by the same ray the bullet takes, so
  // the reticle can never promise a hit the shot would not make. A thing you
  // hold USE on is found by standing near it and facing it, because a use
  // prompt that depends on landing a ray on a box tucked behind a console desk
  // blinks out exactly when you have walked up to the console to use it.
  for (i = 0; i < INTERACTABLES.length; i++) {
    var it = INTERACTABLES[i];
    if (!it.live()) continue;
    if (it.kind === 'shoot') {
      var hit = _aimRay.intersectObject(it.mesh, true);
      if (!hit.length || hit[0].distance >= bestDist) continue;
      if (hit[0].distance > it.range) continue;
      bestDist = hit[0].distance; bestKind = 'shoot';
      bestTarget = it; bestLabel = it.label;
      _aimPoint.copy(hit[0].point);
    }
  }

  // use targets get the last word when you are genuinely next to one
  for (i = 0; i < INTERACTABLES.length; i++) {
    var u = INTERACTABLES[i];
    if (u.kind !== 'use' || !u.live()) continue;
    var up = u.owner.pos;
    var ud2 = Math.hypot(up.x - PLAYER.pos.x, up.z - PLAYER.pos.z);
    if (ud2 > u.range) continue;
    var fx = -Math.sin(PLAYER.yaw), fz = -Math.cos(PLAYER.yaw);
    if (ud2 > 0.05 && ((up.x - PLAYER.pos.x) / ud2 * fx + (up.z - PLAYER.pos.z) / ud2 * fz) < 0.45) continue;
    if (bestKind === 'enemy' && bestDist < ud2) continue;   // a guard in the way comes first
    bestDist = ud2; bestKind = 'use'; bestTarget = u; bestLabel = u.label;
  }
  if (!bestKind) return;
  if (bestKind === 'use') {
    // proximity-found, so the occlusion pass below does not apply to it
    AIM.kind = 'use'; AIM.target = bestTarget; AIM.label = bestLabel; AIM.dist = bestDist;
    AIM.prompt = bestDist <= bestTarget.useRange ? 'HOLD USE' : 'MOVE CLOSER';
    return;
  }

  // Nothing is highlighted through a wall: the probe only tests the short list
  // above, so the level itself has to be asked separately whether it is in the
  // way. It asks the collision boxes rather than the rendered triangles: the
  // merged level is ~17k triangles and a mesh raycast against it cost most of a
  // millisecond, every frame, on a desktop. Geometry closer than 0.45m is the
  // console or rail you are standing against, not something in the way.
  var occl = rayBoxesDistance(_aimRay.ray.origin, _aimRay.ray.direction, 0.45, bestDist - 0.05);
  if (occl < bestDist - 0.05) return;                            // occluded

  AIM.kind = bestKind; AIM.target = bestTarget; AIM.label = bestLabel; AIM.dist = bestDist;
  if (bestKind === 'shoot') AIM.prompt = 'SHOOT TO DISABLE';
}

/* The aimed fixture lights up. Restraint on purpose: a brighter version of the
   indicator it already has, not an outline round the whole object, so the
   highlight reads as the thing noticing you rather than as an overlay. */
var _aimHighlighted = null;
function applyAimHighlight() {
  var want = (AIM.kind === 'shoot' || AIM.kind === 'use') ? AIM.target : null;
  if (want === _aimHighlighted) return;
  if (_aimHighlighted && _aimHighlighted.setHighlight) _aimHighlighted.setHighlight(false);
  if (want && want.setHighlight) want.setHighlight(true);
  _aimHighlighted = want;
}

/* Bend the shot toward the nearest guard the crosshair is already close to,
   GoldenEye style. The test is a cylinder around the body, not an angular cone:
   a fixed cone is unusable up close, where the gap between eye height and chest
   height is most of the budget on its own. A body-width cylinder is generous at
   knife range and tight across a hall, which is what a thumb on a phone needs.
   It only ever narrows the gap, it needs clear line of sight, and it stands
   down while you are aiming down sights so a deliberate shot stays yours. */
var _assistAim = null, _assistRay = null;
function applyAimAssist(ray, w) {
  if (WEAPONS.aiming || w.thrown) return null;   // aiming down sights is manual
  var A = CFG.assist;
  if (!_assistAim) { _assistAim = new THREE.Vector3(); _assistRay = new THREE.Vector3(); }
  var origin = ray.ray.origin, dir = ray.ray.direction;
  var maxR = Math.min(A.maxRange, w.range);
  var best = null, bestMiss = A.radius, bestX = 0, bestY = 0, bestZ = 0;

  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    var p = e.group.position;
    // how far along the shot the target stands
    var t = (p.x - origin.x) * dir.x + (p.y + 1.05 - origin.y) * dir.y + (p.z - origin.z) * dir.z;
    if (t < 0.6 || t > maxR) continue;
    // the point on the shot at that range, and the point on the body nearest it
    _assistRay.copy(dir).multiplyScalar(t).add(origin);
    _assistAim.set(p.x, clamp(_assistRay.y, p.y + A.bodyLow, p.y + A.bodyHigh), p.z);
    var miss = _assistAim.distanceTo(_assistRay);
    if (miss >= bestMiss) continue;
    bestMiss = miss; best = e;
    bestX = _assistAim.x; bestY = _assistAim.y; bestZ = _assistAim.z;
  }
  // One line-of-sight test, on the winner only: this runs on every trigger pull
  // and a per-enemy scene raycast would be the most expensive thing in the game.
  if (!best) return null;
  _assistAim.set(bestX, bestY, bestZ);
  if (!hasLineOfSight(origin, _assistAim)) return null;
  _assistRay.copy(_assistAim).sub(origin).normalize();
  dir.lerp(_assistRay, INPUT.usingTouch ? A.pull : A.pullMouse).normalize();
  return best;
}

/* Where on the body a shot landed. GoldenEye did not treat a guard as one
   block: a head shot dropped him, a limb shot barely hurt but visibly changed
   what he could do. Hit detection still uses the single box proxy -- one
   volume per guard rather than seven -- and the landing point is classified
   against the model's real proportions afterwards, which costs nothing.

   The numbers below come from the mesh: every part is laid out in local space
   and the whole body is scaled by 1.35, so the boundaries are the part edges
   multiplied through. */
var BODY_SCALE = 1.35;
var ZONE_HEAD_Y = 1.377,        // bottom of the head box
    ZONE_LEG_Y  = 0.635,        // top of the legs
    ZONE_ARM_X  = 0.30;         // inner edge of the arms
var ZONE_DAMAGE = { head: 2.5, torso: 1.0, arm: 0.5, leg: 0.5 };

function enemyHitZone(enemy, point) {
  var g = enemy.group;
  var localY = point.y - g.position.y;
  if (localY >= ZONE_HEAD_Y) return 'head';
  if (localY < ZONE_LEG_Y) return 'leg';
  // inside the torso band: far enough out to the side and it is an arm
  var dx = point.x - g.position.x, dz = point.z - g.position.z;
  var cos = Math.cos(-g.rotation.y), sin = Math.sin(-g.rotation.y);
  var lateral = Math.abs(dx * cos - dz * sin);
  return lateral >= ZONE_ARM_X ? 'arm' : 'torso';
}

function fireWeapon() {
  var w = currentWeapon;
  if (!w) return false;
  if (WEAPONS.cooldown > 0 || WEAPONS.reloading > 0) return false;
  if (w.thrown) return placeMine();
  if (w.ammoInMag <= 0) {
    if (w.infiniteReserve || w.reserve > 0) reloadWeapon();
    return false;
  }

  if (!GAME.infiniteAmmo) w.ammoInMag--;
  WEAPONS.cooldown = 1 / w.rps;
  WEAPONS.recoil = w.recoil;
  PLAYER.shotsFired++;
  GAME.stats.shots++;
  PLAYER.fovPunch = 3;                       // FOV punch, never camera shake
  hudShotFired();
  WEAPONS.lastFireAt = GAME.elapsed;

  if (!_ray) { _ray = new THREE.Raycaster(); _screenCentre = new THREE.Vector2(0, 0); }
  var cam = RENDER.camera;
  _ray.setFromCamera(_screenCentre, cam);
  _ray.far = w.range;

  // ---- targeting assist (see CFG.assist) ----
  applyAimAssist(_ray, w);

  // apply spread to the ray direction
  var spread = WEAPONS.aiming ? w.aimSpread : w.spread;
  if (PLAYER.crouch) spread *= 0.7;
  if (PLAYER.sprinting) spread *= 2.2;
  _ray.ray.direction.x += randRange(-spread, spread);
  _ray.ray.direction.y += randRange(-spread, spread);
  _ray.ray.direction.z += randRange(-spread, spread);
  _ray.ray.direction.normalize();

  var enemyHit = null, enemyDist = Infinity, enemyPoint = null;
  var hits = _ray.intersectObjects(liveHitMeshes(), false);
  if (hits.length > 0) {
    enemyHit = hits[0].object.userData.enemy;
    enemyDist = hits[0].distance;
    enemyPoint = hits[0].point.clone();
  }

  var wallHits = _ray.intersectObjects(LEVEL.raycastTargets, false);
  var wallDist = wallHits.length ? wallHits[0].distance : Infinity;

  var muzzle = getMuzzleWorldPos();
  flashMuzzle(muzzle);
  sfxGunshot(w.sound, muzzle);
  makeNoise(PLAYER.pos.x, PLAYER.pos.z, w.noise);

  if (enemyHit && enemyDist <= wallDist) {
    var zone = enemyHitZone(enemyHit, enemyPoint);
    var dmg = w.damage * ZONE_DAMAGE[zone];
    enemyHit.takeDamage(dmg, PLAYER.pos, zone);
    spawnImpactEffect(enemyPoint, hits[0].face ? hits[0].face.normal : null, true);
    sfxFlesh(enemyPoint);
    PLAYER.shotsHit++;
    GAME.stats.hits++;
    if (zone === 'head') GAME.stats.head++;
    else if (zone === 'torso') GAME.stats.torso++;
    else GAME.stats.limb++;
    hudHitMarker(zone === 'head');
  } else if (wallHits.length) {
    var wp = wallHits[0];
    var ud = wp.object ? wp.object.userData : null;
    if (ud && ud.panel) destroyPanel(ud.panel);
    if (ud && ud.tank) ruptureTank(ud.tank);
    spawnImpactEffect(wp.point, wp.face ? wp.face.normal : null, false);
    if (GAME.paintball) paintSplat(wp.point, wp.face ? wp.face.normal : null, wp.object);
    sfxImpact(wp.point, true);
  }
  if (w.ammoInMag <= 0 && (w.infiniteReserve || w.reserve > 0)) reloadWeapon();
  return true;
}

function getMuzzleWorldPos() {
  var cam = RENDER.camera;
  var v = new THREE.Vector3(0.09, -0.08, -0.72);
  return v.applyMatrix4(cam.matrixWorld);
}
/* Binary on/off for exactly CFG.gfx.muzzleFlashMs, no lerp. The light object is
   created once at startup and only its intensity changes, because adding or
   removing a light would recompile every material in the scene. */
/* Every flash in the game drives the one shared muzzle light, so every flash
   has to arm the timer that turns it off again. Guard fire and mine blasts used
   to set the light and never clear it, which left a lamp burning in the middle
   of the level for the rest of the mission. */
function flashLight(pos, intensity, distance, colorHex, seconds) {
  WEAPONS.muzzleLight.position.copy(pos);
  WEAPONS.muzzleLight.color.setHex(colorHex);
  WEAPONS.muzzleLight.distance = distance;
  WEAPONS.muzzleLight.intensity = intensity;
  WEAPONS.flashTimer = seconds;
  WEAPONS.flashPeak = intensity;
  WEAPONS.flashSpan = seconds;
}

function flashMuzzle(pos) {
  flashLight(pos, 10, 4, 0xff8800, CFG.gfx.muzzleFlashMs / 1000);
  WEAPONS.flashFromPlayer = true;
  if (WEAPONS.flashQuad) {
    WEAPONS.flashQuad.visible = true;
    WEAPONS.flashQuad.scale.setScalar(0.01);
    WEAPONS.flashQuad.rotation.z = randRange(0, Math.PI);
  }
}

/* ---------- proximity mines ---------- */
var _mineGeo = null, _mineLedGeo = null;
function placeMine() {
  var w = currentWeapon;
  if (w.ammoInMag <= 0) return false;
  if (!_ray) { _ray = new THREE.Raycaster(); _screenCentre = new THREE.Vector2(0, 0); }
  _ray.setFromCamera(_screenCentre, RENDER.camera);
  _ray.far = 4;
  var hits = _ray.intersectObjects(LEVEL.raycastTargets, false);
  var pos, normal;
  if (hits.length) { pos = hits[0].point.clone(); normal = hits[0].face ? hits[0].face.normal.clone() : new THREE.Vector3(0, 1, 0); }
  else {
    pos = RENDER.camera.position.clone().addScaledVector(_ray.ray.direction, 2);
    pos.y = PLAYER.pos.y + 0.1; normal = new THREE.Vector3(0, 1, 0);
  }
  if (!GAME.infiniteAmmo) w.ammoInMag--;
  WEAPONS.cooldown = 1 / w.rps;

  // One geometry for every mine ever placed. Building a fresh cylinder and a
  // fresh sphere per throw meant the detonation had to dispose them, and the
  // LED sphere was being missed — a small leak that grew with every mine.
  if (!_mineGeo) {
    _mineGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.03, 16, 1);
    _mineGeo.rotateX(Math.PI / 2);
    _mineLedGeo = new THREE.SphereGeometry(0.012, 8, 6);
  }
  var mesh = new THREE.Mesh(_mineGeo, MAT.hazard);
  mesh.position.copy(pos).addScaledVector(normal, 0.05);
  mesh.lookAt(pos.clone().add(normal));
  mesh.castShadow = true;
  RENDER.scene.add(mesh);
  var led = new THREE.Mesh(_mineLedGeo, MAT.ledRed);
  led.position.set(0.03, 0.02, 0.03);
  mesh.add(led);

  WEAPONS.mines.push({ mesh: mesh, led: led, pos: mesh.position.clone(), armTime: 1.0, beep: 0, live: true });
  sfxMinePlant(mesh.position);
  return true;
}
function updateMines(dt) {
  for (var i = WEAPONS.mines.length - 1; i >= 0; i--) {
    var m = WEAPONS.mines[i];
    if (!m.live) continue;
    if (m.armTime > 0) { m.armTime -= dt; continue; }
    m.beep -= dt;
    if (m.beep <= 0) { m.beep = 1.1; sfxMineBeep(m.pos); }
    for (var j = 0; j < ENEMIES.list.length; j++) {
      var e = ENEMIES.list[j];
      if (e.state === 'DEAD') continue;
      if (e.group.position.distanceTo(m.pos) < 3.2) { detonateMine(i); break; }
    }
  }
}
function detonateMine(idx) {
  var m = WEAPONS.mines[idx];
  if (!m || !m.live) return;
  m.live = false;
  var blast = WEAPONS.list[2].blastRadius, dmg = WEAPONS.list[2].damage;
  for (var j = 0; j < ENEMIES.list.length; j++) {
    var e = ENEMIES.list[j];
    if (e.state === 'DEAD') continue;
    var d = e.group.position.distanceTo(m.pos);
    if (d < blast) e.takeDamage(dmg * (1 - d / blast), m.pos);
  }
  var pd = PLAYER.pos.distanceTo(m.pos);
  if (pd < blast) damagePlayer(dmg * 0.6 * (1 - pd / blast), m.pos);

  spawnImpactEffect(m.pos, new THREE.Vector3(0, 1, 0), false);
  spawnImpactEffect(m.pos, new THREE.Vector3(0, 1, 0), false);
  sfxExplosion(m.pos);
  makeNoise(m.pos.x, m.pos.z, 30);
  flashLight(m.pos, 26, 11, 0xffc04a, 0.22);
  RENDER.scene.remove(m.mesh);   // geometry is shared: nothing to dispose here
  WEAPONS.mines.splice(idx, 1);
}

/* ---------- pickups ----------
   Walk over something to take it. Static ones are placed with the level --
   the body armour in the third bathroom stall is the Facility's, where
   GoldenEye hid it -- and every guard who goes down leaves his rifle behind,
   which is how the KF7 is got at all. A pickup you cannot use (armour at full,
   a rifle when the pouch is full) stays where it is for later. */
var PICKUP_SPOTS = [
  { kind: 'armor', x: 4.4, z: 4.35 },    // bathroom, third stall
  { kind: 'armor', x: 22.6, z: 25.4 },   // control room, behind the terminal bank
  { kind: 'ammo',  x: 11.2, z: 21.2 },   // chemical plant, by the crate
  { kind: 'ammo',  x: 23.2, z: 19.3 }    // laboratory, far corner
];
var PICKUPS = { list: [], statics: [] };

function makeArmorMesh() {
  var g = new THREE.Group();
  var vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.14), MAT.guardVest);
  vest.position.y = 0.26;
  g.add(vest);
  var strip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.02), MAT.armorStrip);
  strip.position.set(0, 0.38, 0.08);
  g.add(strip);
  g.rotation.x = -1.2;          // lying on the floor, tilted up at you
  return g;
}
function makeAmmoMesh() {
  var g = new THREE.Group();
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.3), MAT.ammoCrate);
  box.position.y = 0.13;
  g.add(box);
  var lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.32), MAT.brass);
  lid.position.y = 0.275;
  g.add(lid);
  return g;
}

function buildPickups(level) {
  PICKUPS.statics.length = 0;
  for (var i = 0; i < PICKUP_SPOTS.length; i++) {
    var sp = PICKUP_SPOTS[i];
    var x = cellToWorldX(sp.x - 0.5) , z = cellToWorldZ(sp.z - 0.5);
    var mesh = sp.kind === 'armor' ? makeArmorMesh() : makeAmmoMesh();
    var y = supportHeight(x, z);
    mesh.position.set(x, y, z);
    mesh.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    PICKUPS.statics.push({ kind: sp.kind, mesh: mesh, pos: new THREE.Vector3(x, y, z),
                           amount: sp.kind === 'armor' ? CFG.pickups.armor : CFG.pickups.kf7Crate,
                           taken: false, dynamic: false, baseY: y });
  }
}

/* Put the level's own pickups back and clear anything dropped last mission. */
function resetPickups() {
  for (var i = 0; i < PICKUPS.list.length; i++) {
    var p = PICKUPS.list[i];
    RENDER.scene.remove(p.mesh);
    if (p.dynamic) p.mesh.traverse(function (o) { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
  PICKUPS.list.length = 0;
  for (i = 0; i < PICKUPS.statics.length; i++) {
    var s = PICKUPS.statics[i];
    s.taken = false;
    s.mesh.position.y = s.baseY;
    RENDER.scene.add(s.mesh);
    PICKUPS.list.push(s);
  }
}

function spawnRiflePickup(mesh, rounds) {
  PICKUPS.list.push({ kind: 'kf7', mesh: mesh, pos: mesh.position.clone(), amount: rounds,
                      taken: false, dynamic: true, baseY: mesh.position.y });
}

/* Apply a pickup; returns false if it would do nothing, so it stays put. */
function applyPickup(p) {
  var kf7 = WEAPONS.list[1];
  if (p.kind === 'armor') {
    if (PLAYER.armor >= CFG.player.maxArmor) return false;
    PLAYER.armor = Math.min(CFG.player.maxArmor, PLAYER.armor + p.amount);
    hudToast('Body armour');
    return true;
  }
  var cap = CFG.pickups.kf7ReserveCap;
  if (kf7.owned && kf7.reserve >= cap) return false;
  var fresh = !kf7.owned;
  if (fresh) {
    kf7.owned = true;
    // a rifle comes loaded: the first magazine goes straight in
    var load = Math.min(kf7.magSize, p.amount);
    kf7.ammoInMag = load;
    kf7.reserve = Math.min(cap, p.amount - load);
  } else {
    kf7.reserve = Math.min(cap, kf7.reserve + p.amount);
  }
  hudToast(fresh ? 'Picked up the KF7 Soviet  [2]' : ('KF7 ammo +' + p.amount));
  return true;
}

function updatePickups(dt) {
  var r2 = CFG.pickups.radius * CFG.pickups.radius;
  for (var i = PICKUPS.list.length - 1; i >= 0; i--) {
    var p = PICKUPS.list[i];
    if (!p.dynamic) {
      p.mesh.rotation.y += dt * 1.2;          // a slow turn catches the eye
    }
    var dx = p.pos.x - PLAYER.pos.x, dz = p.pos.z - PLAYER.pos.z;
    if (dx * dx + dz * dz > r2 || Math.abs(p.pos.y - PLAYER.pos.y) > 1.2) continue;
    if (!applyPickup(p)) continue;
    p.taken = true;
    sfxPickup();
    RENDER.scene.remove(p.mesh);
    if (p.dynamic) p.mesh.traverse(function (o) { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    PICKUPS.list.splice(i, 1);
  }
}

/* ---------- paintball mode ----------
   GoldenEye's paintball cheat swapped bullet holes for splats of colour. A
   fixed ring of flat discs, recycled oldest-first, so a long firefight costs
   no allocation and never grows the scene. */
var PAINT = { pool: [], head: 0, colors: [0xff2d9b, 0x2dd4ff, 0xffe12d, 0x7dff2d, 0xff7a2d, 0xb46bff] };
var _paintN = new THREE.Vector3(), _paintQ = new THREE.Quaternion(), _paintUp = new THREE.Vector3(0, 0, 1);
function ensurePaintPool() {
  if (!PAINT.pool.length) {
    var geo = new THREE.CircleGeometry(0.11, 10);
    for (var i = 0; i < 48; i++) {
      var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.visible = false; m.castShadow = false; m.receiveShadow = true;
      RENDER.scene.add(m);
      PAINT.pool.push(m);
    }
  }
}
function paintSplat(point, normal, object) {
  ensurePaintPool();
  var s = PAINT.pool[PAINT.head];
  PAINT.head = (PAINT.head + 1) % PAINT.pool.length;
  _paintN.copy(normal || _paintUp);
  if (object && object.matrixWorld && normal) _paintN.transformDirection(object.matrixWorld);
  _paintQ.setFromUnitVectors(_paintUp, _paintN);
  s.quaternion.copy(_paintQ);
  s.position.copy(point).addScaledVector(_paintN, 0.01);
  s.material.color.setHex(PAINT.colors[(Math.random() * PAINT.colors.length) | 0]);
  s.scale.setScalar(randRange(0.7, 1.4));
  s.visible = true;
}
function clearPaint() { for (var i = 0; i < PAINT.pool.length; i++) PAINT.pool[i].visible = false; }

function updateWeapons(dt, input) {
  if (WEAPONS.cooldown > 0) WEAPONS.cooldown -= dt;
  if (WEAPONS.reloading > 0) {
    WEAPONS.reloading -= dt;
    if (WEAPONS.reloading <= 0) { WEAPONS.reloading = 0; finishReload(); }
  }
  WEAPONS.aiming = (!!input.aim || !!input.aimToggle) && !PLAYER.sprinting;

  // Muzzle flash: light is binary for 80ms; the quad scales 0->1 over the first
  // 30ms then 1->0 over the next 30ms, synchronised with it.
  if (WEAPONS.flashTimer > 0) {
    WEAPONS.flashTimer -= dt;
    // The light falls off across whatever span the source asked for, so a
    // gunshot snaps and a mine blast lingers, and neither can be left burning.
    var span = WEAPONS.flashSpan || (CFG.gfx.muzzleFlashMs / 1000);
    WEAPONS.muzzleLight.intensity = (WEAPONS.flashPeak || 10) * clamp(WEAPONS.flashTimer / span, 0, 1);
    if (WEAPONS.flashFromPlayer && WEAPONS.flashQuad) {
      var elapsedMs = CFG.gfx.muzzleFlashMs - WEAPONS.flashTimer * 1000;
      var q = WEAPONS.flashQuad, k;
      if (elapsedMs <= 30) k = clamp(elapsedMs / 30, 0, 1);
      else if (elapsedMs <= 60) k = clamp(1 - (elapsedMs - 30) / 30, 0, 1);
      else k = 0;
      q.scale.setScalar(Math.max(0.01, k));
      q.visible = k > 0.02;
    }
    if (WEAPONS.flashTimer <= 0) {
      WEAPONS.flashTimer = 0;
      WEAPONS.flashFromPlayer = false;
      WEAPONS.muzzleLight.intensity = 0;
      if (WEAPONS.flashQuad) WEAPONS.flashQuad.visible = false;
    }
  }

  if (input.fire) {
    if (currentWeapon.auto) fireWeapon();
    else if (!input.fireLatched) { if (fireWeapon()) input.fireLatched = true; }
  }
  updateImpacts(dt);
  updateMines(dt);

  // 2Hz blink on the held mine and on every armed mine in the world
  var blinkOn = (Math.sin(GAME.elapsed * Math.PI * 4) > 0);
  var heldMine = WEAPONS.viewModels[2];
  if (heldMine && heldMine.userData.blinker) {
    heldMine.userData.blinker.material = blinkOn ? MAT.ledRed : MAT.ledDim;
  }
  for (var mi = 0; mi < WEAPONS.mines.length; mi++) {
    var mm = WEAPONS.mines[mi];
    if (mm.led) mm.led.material = (blinkOn && mm.armTime <= 0) ? MAT.ledRed : MAT.ledDim;
  }

  // viewmodel: recoil kick, sway from look input, sprint tilt
  WEAPONS.recoil *= Math.max(0, 1 - dt * 11);
  WEAPONS.swayX += (clamp(-input.lookAccumX * 0.35, -0.05, 0.05) - WEAPONS.swayX) * Math.min(1, dt * 8);
  WEAPONS.swayY += (clamp(-input.lookAccumY * 0.35, -0.05, 0.05) - WEAPONS.swayY) * Math.min(1, dt * 8);
  input.lookAccumX *= Math.max(0, 1 - dt * 6);
  input.lookAccumY *= Math.max(0, 1 - dt * 6);

  var vm = WEAPONS.viewModels[WEAPONS.index];
  if (vm && WEAPONS.flashQuad) {
    // barrel-tip offsets in each model's own local space, scaled the same way
    // the viewmodel is, so the flash sits on the muzzle for every weapon
    var tipLocal = WEAPONS.index === 1 ? [0, 0.012, -0.60]
                 : (WEAPONS.index === 0 ? [0, 0.002, -0.28] : [0, 0.01, -0.06]);
    var vs = vm.scale.x;
    WEAPONS.flashQuad.position.set(
      vm.position.x + tipLocal[0] * vs,
      vm.position.y + tipLocal[1] * vs,
      vm.position.z + tipLocal[2] * vs
    );
  }
  if (vm) {
    // A portrait phone has the same vertical FOV but a much narrower horizontal
    // one, so a fixed-size viewmodel swallows the frame. Scale it with aspect.
    var aspect = RENDER.width / Math.max(1, RENDER.height);
    var vmScale = 0.82 * clamp(aspect, 0.62, 1.0);
    vm.scale.setScalar(vmScale);
    var xMul = clamp(aspect, 0.62, 1.0);
    var aimT = WEAPONS.aiming ? 1 : 0;
    var hs = Math.hypot(PLAYER.vel.x, PLAYER.vel.z) / CFG.player.walkSpeed;
    // Bob is applied to the weapon group, never to the camera.
    var tSec = GAME.elapsed;
    var bobX = Math.sin(tSec * 2.5) * 0.005 * hs;
    var bobY = Math.abs(Math.sin(tSec * 5.0)) * 0.004 * hs;
    var reloadDip = WEAPONS.reloading > 0 ? Math.sin((1 - WEAPONS.reloading / Math.max(0.01, currentWeapon.reloadTime)) * Math.PI) : 0;
    var sprintT = PLAYER.sprinting ? 1 : 0;
    vm.userData.sprintT = lerp(vm.userData.sprintT || 0, sprintT, 0.14);
    var st = vm.userData.sprintT;
    vm.position.set(
      (lerp(0.20, 0, aimT) + WEAPONS.swayX + bobX) * xMul,
      lerp(-0.185, -0.075, aimT) + WEAPONS.swayY - bobY - reloadDip * 0.13 - st * 0.04,
      lerp(-0.46, -0.34, aimT) + WEAPONS.recoil * 0.05
    );
    vm.rotation.set(
      -WEAPONS.recoil * 0.22 - reloadDip * 0.7 + st * 0.35,
      lerp(0.14, 0, aimT) + st * 0.4,
      st * 0.25 + reloadDip * 0.3
    );
  }
}

// ===SECTION 8===
/* Enemy AI. Guards run the five-state machine from the brief; lab staff use the
   same machine but never enter ATTACK — they run and raise the alarm instead. */

var ENEMIES = { list: [], sightTick: 0, runnerActive: null };

/* ---------- navigation ----------
   Guards used to walk in a straight line at whatever they wanted, with no path
   search at all. A runner whose panel was round a corner stood against a wall
   until a timer gave up on him, a search ended at the first doorway, and the
   stuck failsafe teleported people back to their patrol posts. That is the
   opposite of GoldenEye, whose garrison came and found you.

   The level is already a grid of 4m cells, so the navigation graph is that
   grid. Each open cell gets one node -- its centre, or the nearest spot in it
   a body actually fits if furniture sits on the centre -- and A* runs over
   eight-way links. A guard with a clear straight run skips the graph entirely,
   and one following a path cuts corners whenever the next-but-one node is in
   reach, so paths read as walking rather than as tracing squares. */
var NAV = { w: 0, h: 0, open: null, nx: null, nz: null, door: null, cols: null, edge: null };
/* The eight neighbour directions; bit k of NAV.edge[cell] says the straight
   walk from this cell's node to that neighbour's node is clear for a body. */
var NAV_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
var BODY_R = 0.3, BODY_STEP = 0.55;

/* Collision boxes bucketed by cell, each expanded by a body radius, so a body
   query looks at the handful of boxes near it rather than all of them. */
function buildCollisionCells(level) {
  var w = level.plan.w, h = level.plan.h, cells = new Array(w * h);
  for (var i = 0; i < cells.length; i++) cells[i] = [];
  var list = level.collidables, pad = 0.5;
  for (i = 0; i < list.length; i++) {
    var b = list[i];
    var x0 = Math.max(0, worldToCellX(b.minX - pad)), x1 = Math.min(w - 1, worldToCellX(b.maxX + pad));
    var z0 = Math.max(0, worldToCellZ(b.minZ - pad)), z1 = Math.min(h - 1, worldToCellZ(b.maxZ + pad));
    for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) cells[z * w + x].push(b);
  }
  NAV.cols = cells;
}
var _noBoxes = [];
function boxesNear(x, z) {
  var cx = worldToCellX(x), cz = worldToCellZ(z);
  if (cx < 0 || cz < 0 || cx >= NAV.w || cz >= NAV.h) return _noBoxes;
  return NAV.cols[cz * NAV.w + cx];
}

/* Would a guard's body fit here, standing on whatever supports it at y?
   Kerbs and the control-room platform are stepped onto, not walked into:
   guards used to treat the 0.4m platform as a wall, so the guard posted on it
   was stuck until the failsafe teleported him off, and could never get back
   on. Doors are ignored -- they open for anyone who walks up to them -- unless
   locked. */
function bodyFits(x, z, y) {
  var list = boxesNear(x, z);
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.disabled || b.walkable) continue;
    if (b.tag === 'door' && !b.door.locked) continue;
    if (b.maxY - y <= BODY_STEP) continue;
    if (x + BODY_R > b.minX && x - BODY_R < b.maxX && z + BODY_R > b.minZ && z - BODY_R < b.maxZ &&
        y + 1.7 > b.minY && y + 0.1 < b.maxY) return false;
  }
  return true;
}
function supportHeight(x, z) {
  var list = boxesNear(x, z), best = 0;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.disabled || !b.walkable) continue;
    if (x + BODY_R <= b.minX || x - BODY_R >= b.maxX || z + BODY_R <= b.minZ || z - BODY_R >= b.maxZ) continue;
    if (b.maxY <= BODY_STEP && b.maxY > best) best = b.maxY;
  }
  return best;
}

/* Is a straight walk from a to b clear for a body? Sampled every 0.35m. */
function walkClear(ax, az, bx, bz) {
  var dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  var n = Math.max(1, Math.ceil(len / 0.35));
  for (var i = 1; i <= n; i++) {
    var t = i / n, x = ax + dx * t, z = az + dz * t;
    if (!bodyFits(x, z, supportHeight(x, z))) return false;
  }
  return true;
}

function buildNav(level) {
  var plan = level.plan, w = plan.w, h = plan.h;
  NAV.w = w; NAV.h = h;
  buildCollisionCells(level);
  NAV.open = new Uint8Array(w * h);
  NAV.nx = new Float32Array(w * h); NAV.nz = new Float32Array(w * h);
  NAV.door = new Array(w * h);
  for (var i = 0; i < level.doors.length; i++) {
    var d = level.doors[i];
    d.aabb.door = d;
    NAV.door[worldToCellZ(d.z) * w + worldToCellX(d.x)] = d;
  }
  var offs = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9],
              [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];
  for (var z = 0; z < h; z++) {
    for (var x = 0; x < w; x++) {
      if (!isPassable(level.grid[z][x])) continue;
      var cx = cellToWorldX(x), cz = cellToWorldZ(z);
      for (var k = 0; k < offs.length; k++) {
        var px = cx + offs[k][0], pz = cz + offs[k][1];
        if (bodyFits(px, pz, supportHeight(px, pz))) {
          NAV.open[z * w + x] = 1; NAV.nx[z * w + x] = px; NAV.nz[z * w + x] = pz;
          break;
        }
      }
    }
  }
  // Two neighbouring cells being open does not make the walk between their
  // nodes clear: a lab bench spans a whole 4m cell. Every link is walked once
  // here, at build time, and only links a body can actually take are kept.
  NAV.edge = new Uint8Array(w * h);
  // Built with every door unlocked: a lock is a state, checked per query by
  // navCellOpen. Baking the exit's lock in here cut the exit hall off for good.
  var locks = [];
  for (i = 0; i < level.doors.length; i++) { locks.push(level.doors[i].locked); level.doors[i].locked = false; }
  for (z = 0; z < h; z++) {
    for (x = 0; x < w; x++) {
      var ci = z * w + x;
      if (!NAV.open[ci]) continue;
      for (var k2 = 0; k2 < NAV_DIRS.length; k2++) {
        var ex = x + NAV_DIRS[k2][0], ez = z + NAV_DIRS[k2][1];
        if (ex < 0 || ez < 0 || ex >= w || ez >= h) continue;
        var ni = ez * w + ex;
        if (!NAV.open[ni]) continue;
        if (walkClear(NAV.nx[ci], NAV.nz[ci], NAV.nx[ni], NAV.nz[ni])) NAV.edge[ci] |= (1 << k2);
      }
    }
  }
  for (i = 0; i < level.doors.length; i++) level.doors[i].locked = locks[i];
}

function navCellOpen(x, z) {
  if (x < 0 || z < 0 || x >= NAV.w || z >= NAV.h) return false;
  var i = z * NAV.w + x;
  if (!NAV.open[i]) return false;
  var d = NAV.door[i];
  return !(d && d.locked);
}

/* Nearest open node to a world point, searching outward a couple of rings. */
function navCellFor(x, z) {
  var cx = worldToCellX(x), cz = worldToCellZ(z);
  if (navCellOpen(cx, cz)) return cz * NAV.w + cx;
  var best = -1, bestD = Infinity;
  for (var r = 1; r <= 2; r++) {
    for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
      var nx = cx + dx, nz = cz + dz;
      if (!navCellOpen(nx, nz)) continue;
      var i = nz * NAV.w + nx, dd = Math.hypot(NAV.nx[i] - x, NAV.nz[i] - z);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/* A* over the cell grid. Writes node indices, start to goal, into out and
   returns true if a route exists. Diagonal steps need both orthogonal
   neighbours open, so a path never cuts a wall corner. */
var _navG = null, _navF = null, _navFrom = null, _navOpen = [], _navStamp = null, _navGen = 0;
function navPath(fromCell, toCell, out) {
  out.length = 0;
  if (fromCell < 0 || toCell < 0) return false;
  var n = NAV.w * NAV.h, w = NAV.w;
  if (!_navG || _navG.length !== n) {
    _navG = new Float32Array(n); _navF = new Float32Array(n);
    _navFrom = new Int32Array(n); _navStamp = new Uint32Array(n);
  }
  _navGen++;
  var gen = _navGen, closedGen = (0x80000000 | gen) >>> 0;   // unsigned, to match the Uint32Array it is compared against
  var tx = toCell % w, tz = (toCell / w) | 0;
  function heur(i) { var dx = Math.abs(i % w - tx), dz = Math.abs(((i / w) | 0) - tz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); }
  _navOpen.length = 0;
  _navStamp[fromCell] = gen; _navG[fromCell] = 0; _navF[fromCell] = heur(fromCell); _navFrom[fromCell] = -1;
  _navOpen.push(fromCell);
  while (_navOpen.length) {
    var bi = 0;
    for (var k = 1; k < _navOpen.length; k++) if (_navF[_navOpen[k]] < _navF[_navOpen[bi]]) bi = k;
    var cur = _navOpen[bi];
    _navOpen[bi] = _navOpen[_navOpen.length - 1]; _navOpen.pop();
    if (cur === toCell) {
      for (var c = cur; c !== -1; c = _navFrom[c]) out.push(c);
      out.reverse();
      return true;
    }
    _navStamp[cur] = closedGen;
    var cx = cur % w, cz = (cur / w) | 0;
    for (var k = 0; k < NAV_DIRS.length; k++) {
      if (!(NAV.edge[cur] & (1 << k))) continue;
      var dx = NAV_DIRS[k][0], dz = NAV_DIRS[k][1];
      var nx = cx + dx, nz = cz + dz;
      if (!navCellOpen(nx, nz)) continue;
      if (dx && dz && (!navCellOpen(cx + dx, cz) || !navCellOpen(cx, cz + dz))) continue;
      var ni = nz * w + nx;
      if (_navStamp[ni] === closedGen) continue;
      var g = _navG[cur] + ((dx && dz) ? 1.4142 : 1);
      if (_navStamp[ni] === gen && g >= _navG[ni]) continue;
      if (_navStamp[ni] !== gen) _navOpen.push(ni);
      _navStamp[ni] = gen; _navG[ni] = g; _navF[ni] = g + heur(ni); _navFrom[ni] = cur;
    }
  }
  return false;
}

var Enemy = function (position, patrolPoints, kind) {
  this.kind = kind || 'guard';
  this.state = 'PATROL';
  this.health = this.kind === 'scientist' ? 55 : 100;
  this.maxHealth = this.health;
  this.patrolPoints = patrolPoints || [];
  this.currentPatrolIdx = 0;
  this.lastKnownPlayerPos = new THREE.Vector3();
  this.hasLastKnown = false;
  this.stateClock = 0;
  this.alertness = 0;
  this.canSee = false;
  this.yaw = 0;
  this.fireClock = randRange(0.2, 0.9);
  this.burst = 0;
  this.pauseClock = 0;
  this.deathClock = 0;
  this.disarmed = false; this.limp = false; this.flinch = 0; this.droppedGun = null;
  this.alarmTarget = null; this.runClock = 0; this.runCheckAt = null;
  this.speed = this.kind === 'scientist' ? 3.4 : 2.1;
  this.chaseSpeed = this.kind === 'scientist' ? 4.4 : 3.4;
  // navigation state, all owned and reused
  this.path = []; this.pathIdx = 0; this.pathGoal = -1; this.repathClock = 0; this.direct = false;
  this.goal = new THREE.Vector3(); this.fleeTo = new THREE.Vector3(); this.hasFlee = false;
  this.stuck = 0; this.sweeps = 0;
  this.buildMesh(position);
};

Enemy.prototype.buildMesh = function (position) {
  var g = new THREE.Group();
  g.position.copy(position);
  // Y-then-X so the death tip is around the body's own left-right axis and
  // therefore always reads as falling forward, whichever way it was facing.
  g.rotation.order = 'YXZ';

  var isSci = this.kind === 'scientist';
  var uniform = isSci ? MAT.labCoat : MAT.guard;
  var pants   = isSci ? MAT.labCoat : MAT.enemyPants;

  function part(w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // The part sizes below are seated so the body is continuous, then the whole
  // assembly is scaled to the 1.75m capsule the AI and hit detection use.
  var body = new THREE.Group();
  this.body = body;
  this.torso = part(0.45, 0.55, 0.25, 0, 0.745, 0, isSci ? MAT.labCoat : MAT.enemyTorso);
  this.head  = part(0.28, 0.28, 0.28, 0, 1.160, 0, MAT.enemySkin);
  this.legL  = part(0.17, 0.45, 0.20, -0.12, 0.245, 0, pants);
  this.legR  = part(0.17, 0.45, 0.20, 0.12, 0.245, 0, pants);
  this.armL  = part(0.14, 0.35, 0.14, -0.295, 0.80, 0, uniform);
  this.armR  = part(0.14, 0.35, 0.14, 0.295, 0.80, 0, uniform);
  body.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
  body.scale.setScalar(BODY_SCALE);
  g.add(body);

  // torso and legs carry the silhouette; arms and head add nothing to a shadow
  this.head.castShadow = false; this.armL.castShadow = false; this.armR.castShadow = false;

  // DK Mode, GoldenEye's best-loved cheat: huge heads and long arms. The head
  // grows up from the neck so the head zone's lower edge is unchanged and the
  // hit classifier needs no special case; only the proxy box grows to cover it.
  var headTop = 1.30;
  if (GAME.dk) {
    var hs = 2.2;
    this.head.scale.setScalar(hs);
    this.head.position.y = 1.02 + 0.14 * hs;
    this.armL.scale.y = this.armR.scale.y = 1.6;
    this.armL.position.y = this.armR.position.y = 0.975 - 0.175 * 1.6;
    headTop = 1.02 + 0.28 * hs;
  }

  if (!isSci) {
    var beretGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12, 1);
    this.beret = new THREE.Mesh(beretGeo, MAT.enemyBeret);
    this.beret.position.set(0, headTop + 0.01, 0);
    if (GAME.dk) this.beret.scale.set(2.2, 1.5, 2.2);
    this.beret.castShadow = false;
    body.add(this.beret);

    this.gun = part(0.08, 0.09, 0.44, 0.26, 0.80, -0.24, MAT.gunmetal);
    this.gun.castShadow = false;
    body.add(this.gun);
  } else {
    this.board = part(0.24, 0.30, 0.03, 0.26, 0.78, -0.12, MAT.labCoat);
    body.add(this.board);
  }

  // Alert indicator: only visible while this one is actively hunting.
  this.alertDot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.alertDot);
  this.alertDot.position.set(0, headTop * BODY_SCALE + 0.17, 0);
  this.alertDot.visible = false;
  this.alertDot.castShadow = false;
  g.add(this.alertDot);

  // Every part shares one emissive flash, so the parts list is cached here.
  this.parts = [this.torso, this.head, this.legL, this.legR, this.armL, this.armR];
  if (this.beret) this.parts.push(this.beret);
  if (this.gun) this.parts.push(this.gun);
  if (this.board) this.parts.push(this.board);
  this.hitFlashT = 0;
  this.flashMats = null;

  // A single low-poly proxy carries the raycast so a shot tests one box per
  // enemy rather than nine. It spans feet to the top of the head.
  var proxyH = headTop * BODY_SCALE;
  this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, proxyH, 0.5), HIT_PROXY_MAT);
  this.hitMesh.position.set(0, proxyH / 2, 0);
  this.hitMesh.userData.enemy = this;
  g.add(this.hitMesh);
  g.traverse((function (self) { return function (o) { o.userData.enemy = self; }; })(this));

  this.group = g;
  RENDER.scene.add(g);
};
/* One invisible material for every proxy box rather than one per enemy. */
var HIT_PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });

/* White emissive flash on every part for 80ms, then back. Materials are shared
   between enemies, so each hit swaps in a per-enemy clone for the duration
   rather than tinting every guard in the level. */
Enemy.prototype.startHitFlash = function () {
  if (!this.flashMats) {
    this.flashMats = [];
    for (var i = 0; i < this.parts.length; i++) {
      var m = this.parts[i].material.clone();
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 1.0;
      this.flashMats.push(m);
      this.parts[i].userData.baseMat = this.parts[i].material;
    }
  }
  for (var k = 0; k < this.parts.length; k++) this.parts[k].material = this.flashMats[k];
  this.hitFlashT = 0.08;
};
Enemy.prototype.endHitFlash = function () {
  for (var i = 0; i < this.parts.length; i++) {
    if (this.parts[i].userData.baseMat) this.parts[i].material = this.parts[i].userData.baseMat;
  }
  this.hitFlashT = 0;
};
/* The cloned flash materials belong to this enemy alone, so they go with it. */
Enemy.prototype.dispose = function () {
  RENDER.scene.remove(this.group);
  this.group.traverse(function (o) {
    if (o.isMesh && o.geometry) o.geometry.dispose();   // materials are shared, geometry is not
  });
  if (this.flashMats) for (var i = 0; i < this.flashMats.length; i++) this.flashMats[i].dispose();
  this.flashMats = null;
};

Enemy.prototype.setState = function (s) {
  if (this.state === s) return;
  this.state = s;
  this.stateClock = 0;
  this.pathGoal = -1;                  // a new intent plans a new route
  if (s === 'ATTACK') this.fireClock = CFG.difficulty[GAME.difficulty].reaction;
  if (s !== 'CHASE') this.hasFlee = false;
};

Enemy.prototype.setLastKnown = function (x, z) {
  this.lastKnownPlayerPos.set(x, 0, z);
  this.hasLastKnown = true;
};

/* Scratch vectors for the per-frame AI paths. Each is written immediately
   before use and never held across another call that writes the same one. */
var _eyeVec = new THREE.Vector3(), _sightTo = new THREE.Vector3(),
    _shootTo = new THREE.Vector3(), _shootDir = new THREE.Vector3(), _navTo = new THREE.Vector3();
Enemy.prototype.eyePos = function () {
  return _eyeVec.set(this.group.position.x, this.group.position.y + 1.56, this.group.position.z);
};

/* Sight: range, cone and an occlusion ray. Runs on alternate frames, and not at
   all beyond the skip distance. */
Enemy.prototype.updateSight = function (playerPos) {
  this.canSee = false;
  if (this.state === 'DEAD' || !PLAYER.alive) return false;
  var pos = this.group.position;
  var dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
  var dist = Math.hypot(dx, dz);
  var range = CFG.ai.sightRange * (GAME.alarm ? 1.3 : 1) * (PLAYER.crouch ? 0.75 : 1);
  if (dist > range) return false;

  var toYaw = Math.atan2(dx, dz);
  var diff = Math.atan2(Math.sin(toYaw - this.yaw), Math.cos(toYaw - this.yaw));
  var fov = CFG.ai.sightFov * ((this.state === 'CHASE' || this.state === 'ATTACK') ? 1.7 : 1);
  if (Math.abs(diff) > fov) return false;

  var from = this.eyePos();
  var to = _sightTo.set(playerPos.x, playerPos.y + PLAYER.height * 0.6, playerPos.z);
  if (!hasLineOfSight(from, to)) return false;
  this.canSee = true;
  return true;
};

Enemy.prototype.update = function (dt, playerPos) {
  if (this.state === 'DEAD') { this.updateDeath(dt); return; }
  this.stateClock += dt;

  var far = this.group.position.distanceToSquared(playerPos) > CFG.ai.skipDistance * CFG.ai.skipDistance;
  if (!far && (ENEMIES.sightTick & 1) === (this.sightPhase || 0)) this.updateSight(playerPos);
  else if (far) this.canSee = false;

  if (this.canSee) {
    this.setLastKnown(playerPos.x, playerPos.z);
    this.sweeps = 0;                       // a fresh sighting restarts the sweep
    this.alertness = Math.min(1, this.alertness + dt * 2.2);
  } else {
    this.alertness = Math.max(0, this.alertness - dt * 0.25);
  }

  // hearing: gunfire and running footsteps
  var noise = GAME.noise;
  if (noise.t > 0 && this.state === 'PATROL') {
    var nd = Math.hypot(noise.x - this.group.position.x, noise.z - this.group.position.z);
    if (nd < noise.r) {
      this.setLastKnown(noise.x, noise.z);
      this.setState('SEARCH');
    }
  }

  if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt);

  switch (this.state) {
    case 'PATROL': this.patrol(dt); break;
    case 'ALERT':  this.alert(dt); break;
    case 'CHASE':  this.chase(dt, playerPos); break;
    case 'ATTACK': this.attack(dt, playerPos); break;
    case 'SEARCH': this.search(dt); break;
  }
  this.animate(dt);
};

Enemy.prototype.patrol = function (dt) {
  if (this.canSee) { this.setState('ALERT'); return; }
  if (!this.patrolPoints.length) { this.yaw += Math.sin(this.stateClock * 0.7) * dt * 0.6; this.applyYaw(); return; }
  if (this.pauseClock > 0) { this.pauseClock -= dt; this.applyYaw(); return; }
  var target = this.patrolPoints[this.currentPatrolIdx % this.patrolPoints.length];
  // navigate, not a straight line: after a search a guard can be a long way
  // from his route, and the way back is rarely straight
  if (this.navigate(target, dt, this.speed, 0.55)) {
    this.currentPatrolIdx = (this.currentPatrolIdx + 1) % this.patrolPoints.length;
    this.pauseClock = randRange(0.5, 1.8);
  }
};

Enemy.prototype.alert = function (dt) {
  this.applyYaw();
  if (this.hasLastKnown) this.faceToward(this.lastKnownPlayerPos, dt, 7);
  if (this.stateClock >= CFG.ai.alertPause) {
    if (!this.isCombatant()) { this.setState('CHASE'); return; }   // staff and the disarmed flee
    // First guard to react breaks for a panel rather than engaging. If every
    // panel in the building is dead he has nothing to run to, and fights.
    if (!GAME.alarm && !ENEMIES.runnerActive) {
      var panel = nearestLivePanel(this.group.position);
      if (panel) {
        this.alarmTarget = panel;
        this.runClock = 0;
        this.runCheckAt = null;
        ENEMIES.runnerActive = this;
        this.setState('CHASE');
        return;
      }
    }
    this.setState('CHASE');
  }
};

/* Somewhere to run to: an open cell well away from the player, preferring the
   one that puts the most distance between them. Picked once per flight. */
Enemy.prototype.pickFleeSpot = function (playerPos) {
  var pos = this.group.position, best = -1, bestScore = -Infinity;
  var cx = worldToCellX(pos.x), cz = worldToCellZ(pos.z);
  for (var dz = -4; dz <= 4; dz++) for (var dx = -4; dx <= 4; dx++) {
    var x = cx + dx, z = cz + dz;
    if (!navCellOpen(x, z)) continue;
    var i = z * NAV.w + x;
    var fromPlayer = Math.hypot(NAV.nx[i] - playerPos.x, NAV.nz[i] - playerPos.z);
    var fromMe = Math.hypot(NAV.nx[i] - pos.x, NAV.nz[i] - pos.z);
    var score = fromPlayer - fromMe * 0.35;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) { this.fleeTo.copy(pos); }
  else this.fleeTo.set(NAV.nx[best], 0, NAV.nz[best]);
  this.hasFlee = true;
};

Enemy.prototype.chase = function (dt, playerPos) {
  // The runner ignores you entirely: his job is the panel on the wall.
  if (this.alarmTarget) {
    if (GAME.alarm || !this.alarmTarget.alive) { this.clearAlarmRun(); }
    else {
      var pnl = this.alarmTarget;
      var gap = Math.hypot(pnl.pos.x - this.group.position.x, pnl.pos.z - this.group.position.z);
      if (gap < 1.2) { raiseAlarm(this); this.clearAlarmRun(); return; }
      // With a real route to follow a run only fails if he is physically held
      // up -- wedged in a doorway, or boxed in by you. Progress is judged over
      // two-second windows; a window he barely moves in ends the run.
      this.runClock += dt;
      if (!this.runCheckAt) this.runCheckAt = this.group.position.clone();
      if (this.runClock > 2) {
        var moved = this.runCheckAt.distanceTo(this.group.position);
        this.runCheckAt.copy(this.group.position);
        this.runClock = 0;
        if (moved < 0.5) { this.clearAlarmRun(); }
      }
      if (this.alarmTarget) { this.navigate(pnl.stand, dt, this.chaseSpeed, 0.3); return; }
    }
  }
  if (!this.isCombatant()) {
    // Run from the player, along a real route to somewhere far from him.
    if (!this.hasFlee) this.pickFleeSpot(playerPos);
    var there = this.navigate(this.fleeTo, dt, this.chaseSpeed, 0.6);
    if (there) {
      if (this.canSee && this.stateClock > 1.5) { this.hasFlee = false; this.stateClock = 0; }
      else if (!this.canSee) this.setState('SEARCH');
    }
    return;
  }
  var target = this.canSee ? playerPos : (this.hasLastKnown ? this.lastKnownPlayerPos : null);
  if (!target) { this.setState('SEARCH'); return; }
  var dist = Math.hypot(target.x - this.group.position.x, target.z - this.group.position.z);
  if (this.canSee && dist < CFG.ai.fireRange) { this.setState('ATTACK'); return; }
  if (this.navigate(target, dt, this.chaseSpeed, 0.8) && !this.canSee) this.setState('SEARCH');
  if (!this.canSee && this.stateClock > CFG.ai.searchTimeout) this.setState('SEARCH');
};

var _atkDir = new THREE.Vector3(), _atkSide = new THREE.Vector3(), _atkWant = new THREE.Vector3(),
    _muzzleAt = new THREE.Vector3();
Enemy.prototype.attack = function (dt, playerPos) {
  this.faceToward(playerPos, dt, 9);
  if (!this.canSee) {
    if (this.stateClock > 1.2) this.setState('CHASE');
    return;
  }
  var dist = this.group.position.distanceTo(playerPos);
  if (dist > CFG.ai.fireRange * 1.1) { this.setState('CHASE'); return; }
  if (!this.isCombatant()) { this.setState('CHASE'); return; }   // CHASE is the flee path for these
  // strafe a little so they are not static targets
  var strafe = Math.sin(this.stateClock * 1.4 + this.group.position.x) * 0.7;
  _atkDir.set(playerPos.x - this.group.position.x, 0, playerPos.z - this.group.position.z).normalize();
  _atkSide.set(-_atkDir.z, 0, _atkDir.x);
  _atkWant.copy(this.group.position)
    .addScaledVector(_atkSide, strafe)
    .addScaledVector(_atkDir, dist > 7 ? 0.8 : -0.4);
  this.moveToward(_atkWant, dt, this.speed * 0.9, true);
  this.faceToward(playerPos, dt, 12);   // keep the rifle on you while stepping

  this.fireClock -= dt;
  if (this.fireClock <= 0) {
    this.shoot(playerPos);
    this.burst--;
    if (this.burst > 0) this.fireClock = 0.12;
    else { this.burst = randRange(2, 4) | 0; this.fireClock = randRange(0.7, 1.5) * (2 - CFG.difficulty[GAME.difficulty].aim); }
  }
};

Enemy.prototype.search = function (dt) {
  if (this.canSee) { this.setState(this.isCombatant() ? 'ATTACK' : 'CHASE'); return; }
  // Staff and disarmed guards stay where they fled to and keep their heads
  // down. They used to walk back to where they last saw you, straight into you.
  if (this.hasLastKnown && this.isCombatant()) {
    if (this.navigate(this.lastKnownPlayerPos, dt, this.speed * (GAME.alarm ? 1.5 : 1.1), 0.8)) {
      this.hasLastKnown = false;
      // With the alarm up the garrison does not go back to its posts: each
      // guard sweeps the rooms around the last sighting instead.
      if (GAME.alarm && this.sweeps < 6) { this.sweeps++; this.pickSweepSpot(); }
    }
  } else {
    this.yaw += Math.sin(this.stateClock * 1.6) * dt * 2.0;
    this.applyYaw();
  }
  if (this.stateClock > CFG.ai.searchTimeout * (GAME.alarm ? 5 : 1)) {
    this.setState('PATROL');
    this.hasLastKnown = false;
  }
};

/* A nearby open cell to sweep next, within two cells of where he is. */
Enemy.prototype.pickSweepSpot = function () {
  var pos = this.group.position;
  var cx = worldToCellX(pos.x), cz = worldToCellZ(pos.z);
  for (var tries = 0; tries < 12; tries++) {
    var x = cx + ((Math.random() * 5) | 0) - 2, z = cz + ((Math.random() * 5) | 0) - 2;
    if (!navCellOpen(x, z) || (x === cx && z === cz)) continue;
    var i = z * NAV.w + x;
    this.setLastKnown(NAV.nx[i], NAV.nz[i]);
    return;
  }
};

var _missDir = new THREE.Vector3(), _missAt = new THREE.Vector3();
Enemy.prototype.shoot = function (playerPos) {
  var from = this.eyePos();
  var to = _shootTo.set(playerPos.x, playerPos.y + PLAYER.height * 0.55, playerPos.z);
  sfxGunshot('enemy', this.group.position);
  makeNoise(this.group.position.x, this.group.position.z, CFG.ai.hearingRadius);
  _shootDir.copy(to).sub(from).normalize();
  _muzzleAt.copy(from).addScaledVector(_shootDir, 0.5);
  flashLight(_muzzleAt, 5, 3.4, 0xffaa33, CFG.gfx.muzzleFlashMs / 1000);

  var aim = CFG.difficulty[GAME.difficulty].aim;
  var dist = from.distanceTo(to);
  var hitChance = clamp(0.72 * aim * (1 - dist / 40) * (PLAYER.crouch ? 0.8 : 1) * (PLAYER.sprinting ? 0.85 : 1), 0.06, 0.9);
  if (Math.random() < hitChance && hasLineOfSight(from, to)) {
    damagePlayer(randRange(6, 11), this.group.position);
  } else {
    // visible miss: spark off whatever is behind the player
    _missDir.copy(_shootDir);
    _missDir.x += randRange(-0.06, 0.06); _missDir.y += randRange(-0.04, 0.06); _missDir.z += randRange(-0.06, 0.06);
    _missDir.normalize();
    var d = rayBoxesDistance(from, _missDir, 0.2, 30);
    if (d !== Infinity) {
      _missAt.copy(from).addScaledVector(_missDir, d);
      spawnImpactEffect(_missAt, null, false);
      sfxImpact(_missAt, true);
    }
  }
};

/* Is this enemy plausibly on the player's screen? Cheap: a facing test first,
   and only then the sight test. Used to decide whether a failsafe may move him. */
var _seeChk = null;
function playerCanSeeEnemy(e) {
  var p = e.group.position;
  var dx = p.x - PLAYER.pos.x, dz = p.z - PLAYER.pos.z;
  var dist = Math.hypot(dx, dz);
  if (dist > 35) return false;
  if (dist > 0.001) {
    var fx = -Math.sin(PLAYER.yaw), fz = -Math.cos(PLAYER.yaw);
    if ((dx / dist) * fx + (dz / dist) * fz < 0.45) return false;   // outside a wide FOV
  }
  if (!_seeChk) _seeChk = new THREE.Vector3();
  _seeChk.set(p.x, p.y + 1.2, p.z);
  return hasLineOfSight(RENDER.camera.position, _seeChk);
}

/* Where on a fresh route to start: the furthest of the next few nodes that a
   straight walk reaches. Node 0 is the cell you stand in, but a cell is 4m
   across -- you may be past its node already, or behind a bench from node 1 --
   so neither "always skip it" nor "always visit it" is right. Always visiting
   it made anyone whose goal shared their cell walk to the node, turn for the
   goal, re-plan, and walk back to the node, forever. */
function furthestReachableNode(x, z, path) {
  var best = 0;
  for (var i = Math.min(path.length - 1, 3); i >= 1; i--) {
    if (walkClear(x, z, NAV.nx[path[i]], NAV.nz[path[i]])) { best = i; break; }
  }
  return best;
}

/* Head for a target, by the straight line when it is clear and by the nav
   graph when it is not. Returns true on arrival within arrive metres. The
   route is re-planned twice a second, or at once if the goal changes cell. */
Enemy.prototype.navigate = function (target, dt, speed, arrive) {
  var pos = this.group.position;
  var dist = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (dist < arrive) return true;
  var goalCell = navCellFor(target.x, target.z);
  this.repathClock -= dt;
  if (this.repathClock <= 0 || goalCell !== this.pathGoal) {
    this.repathClock = 0.5 + Math.random() * 0.15;     // staggered, so the roster never plans in one frame
    this.pathGoal = goalCell;
    this.direct = walkClear(pos.x, pos.z, target.x, target.z);
    if (!this.direct) {
      navPath(navCellFor(pos.x, pos.z), goalCell, this.path);
      this.pathIdx = furthestReachableNode(pos.x, pos.z, this.path);
    }
  }
  if (this.direct || !this.path.length) {
    this.moveToward(target, dt, speed, true);
    return false;
  }
  // follow the route, cutting to the next-but-one node when it is in reach
  if (this.pathIdx >= this.path.length) { this.moveToward(target, dt, speed, true); return false; }
  var node = this.path[this.pathIdx];
  var nx = NAV.nx[node], nz = NAV.nz[node];
  if (Math.hypot(nx - pos.x, nz - pos.z) < 0.7) {
    this.pathIdx++;
    if (this.pathIdx < this.path.length && this.pathIdx + 1 < this.path.length) {
      var ahead = this.path[this.pathIdx + 1];
      if (walkClear(pos.x, pos.z, NAV.nx[ahead], NAV.nz[ahead])) this.pathIdx++;
    }
    if (this.pathIdx >= this.path.length) { this.moveToward(target, dt, speed, true); return false; }
    node = this.path[this.pathIdx]; nx = NAV.nx[node]; nz = NAV.nz[node];
  }
  _navTo.set(nx, 0, nz);
  this.moveToward(_navTo, dt, speed, true);
  return false;
};

Enemy.prototype.moveToward = function (target, dt, speed, noArrive) {
  var pos = this.group.position;
  if (this.limp) speed *= 0.55;
  if (this.flinch > 0) speed *= 0.35;      // staggered, briefly
  var dx = target.x - pos.x, dz = target.z - pos.z;
  var dist = Math.hypot(dx, dz);
  if (dist < 0.55 && !noArrive) return true;
  if (dist < 0.001) return true;
  dx /= dist; dz /= dist;
  this.faceToward(target, dt, 6);

  var step = Math.min(speed * dt, dist);
  var nx = pos.x + dx * step, nz = pos.z + dz * step;
  // slide along whatever is in the way, one axis at a time, stepping up onto
  // kerbs and the platform exactly as the player does
  var movedX = false, movedZ = false;
  // and never into the player: a step that closes to inside a body's width is
  // not taken, so guards stop at you instead of walking through you
  var tooClose = PLAYER && PLAYER.alive && Math.hypot(nx - PLAYER.pos.x, nz - PLAYER.pos.z) < BODY_GAP + 0.05 &&
                 Math.hypot(nx - PLAYER.pos.x, nz - PLAYER.pos.z) < Math.hypot(pos.x - PLAYER.pos.x, pos.z - PLAYER.pos.z);
  if (tooClose) { this.faceToward(PLAYER.pos, dt, 6); return false; }
  if (bodyFits(nx, pos.z, supportHeight(nx, pos.z))) { pos.x = nx; movedX = true; }
  if (bodyFits(pos.x, nz, supportHeight(pos.x, nz))) { pos.z = nz; movedZ = true; }
  pos.y = supportHeight(pos.x, pos.z);
  // Failsafe for a body that intends to move and cannot. With routes to follow
  // this should be rare; when it happens the route is thrown away and planned
  // again, and only a guard held fast for a long time -- and never one you are
  // looking at -- is moved back onto his patrol post.
  if (!movedX && !movedZ) {
    this.stuck += dt;
    if (this.stuck > 0.6) this.repathClock = 0;
    var onScreen = this.canSee || playerCanSeeEnemy(this);
    if (this.stuck > (onScreen ? 8 : 3) && this.patrolPoints.length) {
      this.stuck = 0;
      var p = this.patrolPoints[this.currentPatrolIdx % this.patrolPoints.length];
      pos.x = p.x; pos.z = p.z; pos.y = supportHeight(p.x, p.z);
      this.pathGoal = -1;
    }
  } else this.stuck = 0;
  return false;
};

Enemy.prototype.faceToward = function (target, dt, rate) {
  var want = Math.atan2(target.x - this.group.position.x, target.z - this.group.position.z);
  var diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
  this.yaw += diff * Math.min(1, rate * dt);
  this.applyYaw();
};
Enemy.prototype.applyYaw = function () { this.group.rotation.y = this.yaw + Math.PI; };

Enemy.prototype.animate = function (dt) {
  if (this.hitFlashT > 0) {
    this.hitFlashT -= dt;
    if (this.hitFlashT <= 0) this.endHitFlash();
  }
  if (this.alertDot) {
    this.alertDot.visible = (this.state === 'ALERT' || this.state === 'ATTACK' || !!this.alarmTarget);
  }
  var moving = this.state === 'CHASE' || this.state === 'SEARCH' ||
               (this.state === 'PATROL' && this.pauseClock <= 0);
  this.walkPhase = (this.walkPhase || 0) + (moving ? dt * 7 : 0);
  var sw = moving ? Math.sin(this.walkPhase) * 0.42 : 0;
  this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
  this.armL.rotation.x = -sw * 0.6;
  if (this.state === 'ATTACK') {
    this.armR.rotation.x = -1.2;
    if (this.gun) { this.gun.position.set(0.20, 0.92, -0.38); this.gun.rotation.x = 0; }
  } else {
    this.armR.rotation.x = sw * 0.6;
    if (this.gun) this.gun.position.set(0.26, 0.80, -0.24);
  }
};

Enemy.prototype.takeDamage = function (amount, fromPos, zone) {
  if (this.state === 'DEAD') return;
  this.startHitFlash();
  this.health -= amount;
  this.alertness = 1;
  if (fromPos) this.setLastKnown(fromPos.x, fromPos.z);
  if (this.health <= 0) { this.die(zone); return; }

  // A limb hit does little damage but changes what this guard can still do,
  // which is the interesting half. An arm hit disarms him: he drops the rifle
  // and breaks for cover instead of trading fire, so you can neutralise a
  // guard without killing him. A leg hit leaves him in the fight but slow.
  if (zone === 'arm' && this.gun && !this.disarmed) {
    this.disarm();
    this.setState('CHASE');              // CHASE is the flight path for the unarmed
    return;
  }
  if (zone === 'leg') this.limp = true;

  this.flinch = 0.28;                   // brief stagger, read in animate()
  if (this.state !== 'ATTACK' && this.state !== 'CHASE') this.setState('ALERT');
};

Enemy.prototype.clearAlarmRun = function () {
  this.alarmTarget = null;
  this.runClock = 0; this.runCheckAt = null;
  if (ENEMIES.runnerActive === this) ENEMIES.runnerActive = null;
};

/* Lab staff never fight, and a guard whose rifle is on the floor no longer
   can. Both run instead, which is why the two are asked the same question
   everywhere the AI decides between closing in and getting clear. */
Enemy.prototype.isCombatant = function () {
  return this.kind !== 'scientist' && !this.disarmed;
};

/* The rifle leaves his hands and lands on the floor as something you can pick
   up -- the GoldenEye loop of going in with a pistol and leaving with theirs. */
Enemy.prototype.dropGun = function () {
  if (!this.gun) return null;
  var wp = new THREE.Vector3();
  this.gun.getWorldPosition(wp);
  this.body.remove(this.gun);
  var idx = this.parts.indexOf(this.gun);
  if (idx >= 0) this.parts.splice(idx, 1);
  if (this.flashMats && idx >= 0) {
    this.gun.material = this.gun.userData.baseMat || this.gun.material;
    this.flashMats[idx].dispose();
    this.flashMats.splice(idx, 1);
  }
  var gun = this.gun;
  this.gun = null;
  var gx = wp.x, gz = wp.z;
  // never drop it inside a wall or a console
  if (!bodyFits(gx, gz, supportHeight(gx, gz))) { gx = this.group.position.x; gz = this.group.position.z; }
  var gy = supportHeight(gx, gz);
  gun.position.set(gx, gy + 0.06, gz);
  gun.rotation.set(0, randRange(0, Math.PI * 2), Math.PI / 2);
  gun.scale.setScalar(BODY_SCALE);
  gun.userData.enemy = null;
  RENDER.scene.add(gun);
  this.droppedGun = gun;
  spawnRiflePickup(gun, Math.round(randRange(CFG.pickups.kf7Drop[0], CFG.pickups.kf7Drop[1])));
  return gun;
};

Enemy.prototype.disarm = function () {
  this.disarmed = true;
  this.clearAlarmRun();
  this.dropGun();
  sfxImpact(this.group.position, false);
};

Enemy.prototype.die = function (zone) {
  this.restY = this.group.position.y;    // where the body settles, for the sink-out
  this.deathZone = zone || 'torso';
  this.clearAlarmRun();          // someone else can make the run now
  this.endHitFlash();
  this.dropGun();
  this.state = 'DEAD';
  if (this.alertDot) this.alertDot.visible = false;
  this.deathClock = 0;
  this.health = 0;
  this.hitMesh.userData.enemy = null;
  sfxEnemyDeath(this.group.position);
  PLAYER.kills++;
  GAME.kills++;
  if (this.kind === 'scientist') {
    GAME.sciKills++;
    var staff = objectiveById('staff');
    if (staff && staff.tier <= GAME.difficulty && GAME.sciKills === 1) {
      hudAlert('OBJECTIVE FAILED');
      hudToast('A member of the lab staff is dead. That objective cannot be recovered.');
    }
  }
  if (!GAME.alarm && this.kind !== 'scientist') GAME.bodies++;
  hudUpdateObjectives();
  witnessDeath(this);
};

/* A guard who watches a colleague drop knows something is wrong, even if he
   never saw you. GoldenEye's guards had exactly this sense, and without it a
   body falling in plain sight in a lit corridor changes nothing, which is the
   kind of gap that makes an AI feel blind. */
var _witnessFrom = new THREE.Vector3(), _witnessTo = new THREE.Vector3();
function witnessDeath(victim) {
  var vp = victim.group.position;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e === victim || e.state === 'DEAD') continue;
    if (e.state !== 'PATROL') continue;            // already busy
    var d = Math.hypot(e.group.position.x - vp.x, e.group.position.z - vp.z);
    if (d > CFG.ai.sightRange) continue;
    _witnessFrom.set(e.group.position.x, e.group.position.y + 1.56, e.group.position.z);
    _witnessTo.set(vp.x, vp.y + 1.0, vp.z);
    if (!hasLineOfSight(_witnessFrom, _witnessTo)) continue;
    e.setLastKnown(PLAYER.pos.x, PLAYER.pos.z);
    e.setState('ALERT');
  }
}

Enemy.prototype.updateDeath = function (dt) {
  this.deathClock += dt;
  // linear interpolation to -PI/2 over 400ms, driven from the update loop
  var t = Math.min(1, this.deathClock / 0.4);
  this.group.rotation.x = -t * (Math.PI / 2);
  // Bodies settle through the floor over the last second rather than popping
  // out of existence. Sinking rather than fading on purpose: every enemy shares
  // one set of materials, so fading one would fade all of them.
  if (this.deathClock > 11 && this.group.visible) {
    var sink = Math.min(1, (this.deathClock - 11) / 1.0);
    this.group.position.y = this.restY - sink * 1.1;
    if (sink >= 1) this.group.visible = false;
  }
};

/* hasLineOfSight lives with the collision code in Section 6. */

/* One noise slot, overwritten in place: footsteps call this several times a
   second and used to allocate a fresh object each time. A quieter sound does
   not mask a louder one that is still ringing. */
function makeNoise(x, z, radius) {
  var n = GAME.noise;
  if (n.t > 0 && n.r > radius) return;
  n.x = x; n.z = z; n.r = radius; n.t = 0.4;
}

function raiseAlarm(source) {
  if (GAME.alarm) return;
  GAME.alarm = true;
  GAME.alarmAt = GAME.elapsed;
  setAlarmLoop(true);
  sfxAlert();
  hudAlert('! GUARD ALERTED');
  // everyone converges on the last known position
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD' || e === source) continue;
    if (source && source.hasLastKnown) e.setLastKnown(source.lastKnownPlayerPos.x, source.lastKnownPlayerPos.z);
    else e.setLastKnown(PLAYER.pos.x, PLAYER.pos.z);
    if (e.state === 'PATROL') e.setState('SEARCH');
  }
}

function updateEnemyShadowCulling(camPos) {
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    var near = e.group.position.distanceToSquared(camPos) < 210;
    if (e.shadowOn === near) continue;
    e.shadowOn = near;
    e.torso.castShadow = near; e.legL.castShadow = near; e.legR.castShadow = near;
  }
}

/* Slow vertical crawl on the monitor texture. One shared texture, one offset
   write per frame — the canvas itself is generated once at load. */
function updateScreens(dt) {
  if (MAT.monitor && MAT.monitor.map) {
    MAT.monitor.map.offset.y = (MAT.monitor.map.offset.y + dt * 0.035) % 1;
  }
}

function updateEnemies(dt) {
  ENEMIES.sightTick++;
  if (GAME.noise.t > 0) GAME.noise.t -= dt;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    e.update(dt, PLAYER.pos);
    // same reason as the camera: shots test the proxy box at its world matrix,
    // so it has to be where the guard is now, not where he was last render
    if (e.group.visible) e.group.updateMatrixWorld(true);
  }
}

// ===SECTION 9===
/* Input. Touch is the primary path: two floating sticks plus buttons, every
   finger tracked by its identifier so a second thumb never steals the first
   one's stick. Desktop keyboard and mouse ride alongside and take over the
   moment a key or the mouse moves. */

var INPUT = {
  moveX: 0, moveY: 0,
  lookX: 0, lookY: 0,              // radians applied this frame
  lookAccumX: 0, lookAccumY: 0,    // for viewmodel sway
  mouseDX: 0, mouseDY: 0,          // pending mouse delta
  swipeDX: 0, swipeDY: 0,          // pending touch-swipe delta, in CSS pixels
  fire: false, fireLatched: false, aim: false, aimToggle: false, crouch: false, sprint: false,
  interact: false, invertY: false, sensitivity: 1.0, lookMode: 'swipe',
  keys: {}, pointerLocked: false, lockWanted: false, mouseDown: false, usingTouch: false
};

var TOUCH = {
  deadZone: 8, maxRadius: 60, expo: 1.5,
  lookRate: 2.6,          // stick mode: radians/second at full deflection
  swipeRate: 0.0052,      // swipe mode: radians per CSS pixel of drag
  left: { id: -1, ox: 0, oy: 0, x: 0, y: 0, mag: 0 },
  right: { id: -1, ox: 0, oy: 0, x: 0, y: 0, mag: 0, lx: 0, ly: 0 },
  els: {}
};

/* The stick pipeline: raw offset, radial dead zone, expo curve, normalise. */
function applyStick(dx, dy) {
  var mag = Math.hypot(dx, dy);
  if (mag < TOUCH.deadZone) return { x: 0, y: 0, mag: 0 };
  var clamped = Math.min(mag, TOUCH.maxRadius);
  var shaped = Math.pow(clamped / TOUCH.maxRadius, TOUCH.expo) * TOUCH.maxRadius;
  var nx = dx / mag, ny = dy / mag;
  var norm = shaped / TOUCH.maxRadius;
  return { x: nx * norm, y: ny * norm, mag: norm };
}

function initInput() {
  var canvas = document.getElementById('c');
  TOUCH.els.stickL = document.getElementById('stickL');
  TOUCH.els.stickR = document.getElementById('stickR');

  // ---------- desktop ----------
  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);
  canvas.addEventListener('mousedown', onMouseDown, false);
  window.addEventListener('mouseup', onMouseUp, false);
  window.addEventListener('mousemove', onMouseMove, false);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);
  document.addEventListener('pointerlockchange', onPointerLockChange, false);
  window.addEventListener('wheel', function (e) {
    if (GAME.state !== 'playing') return;
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  // ---------- touch ----------
  var opts = { passive: false };
  var tl = document.getElementById('touch');
  [canvas, tl].forEach(function (el) {
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchmove', onTouchMove, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', onTouchEnd, opts);
  });

  bindHoldButton('btnFire', function (down) { INPUT.fire = down; if (!down) INPUT.fireLatched = false; });
  bindHoldButton('btnUse', function (down) { INPUT.interact = down; });
  bindTapButton('btnWeap', function () { cycleWeapon(1); });
  bindTapButton('btnCrouch', function () { INPUT.crouch = !INPUT.crouch; syncToggleButtons(); });
  // Aiming down sights on a phone is a toggle: holding a third thumb on a
  // button while also moving and looking is not a thing hands can do.
  bindTapButton('btnAim', function () { INPUT.aimToggle = !INPUT.aimToggle; syncToggleButtons(); });
  bindTapButton('btnReload', function () { reloadWeapon(); });
  bindTapButton('btnPause', function () { if (GAME.state === 'playing') pauseGame(); });

  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opts);
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, opts);
}

function syncToggleButtons() {
  var a = document.getElementById('btnAim'), c = document.getElementById('btnCrouch');
  if (a) a.classList.toggle('latched', !!INPUT.aimToggle);
  if (c) c.classList.toggle('latched', !!INPUT.crouch);
}

/* Browsers drop pointer lock on Esc without always delivering the keydown, so
   losing the lock while playing is itself the pause signal. A lock the game
   released on purpose (pausing, the end screen) is not. */
function onPointerLockChange() {
  var canvas = document.getElementById('c');
  var locked = document.pointerLockElement === canvas;
  var lost = INPUT.pointerLocked && !locked;
  INPUT.pointerLocked = locked;
  if (lost && INPUT.lockWanted && GAME.state === 'playing') pauseGame();
  INPUT.lockWanted = locked;
}

function isButtonTarget(el) {
  return el && el.classList && el.classList.contains('tbtn');
}
function onTouchStart(e) {
  if (GAME.state !== 'playing') return;
  if (!INPUT.usingTouch) { INPUT.usingTouch = true; hudShow(true); }
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (isButtonTarget(t.target)) continue;          // buttons handle themselves
    var leftHalf = t.clientX < window.innerWidth * 0.45;
    var stick = leftHalf ? TOUCH.left : TOUCH.right;
    if (stick.id !== -1) continue;
    stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = 0; stick.y = 0; stick.mag = 0;
    stick.lx = t.clientX; stick.ly = t.clientY;
    // In swipe mode the right thumb is a trackpad, not a stick, so no ring.
    if (!leftHalf && INPUT.lookMode === 'swipe') continue;
    var el = leftHalf ? TOUCH.els.stickL : TOUCH.els.stickR;
    el.style.left = t.clientX + 'px'; el.style.top = t.clientY + 'px';
    el.classList.add('on');
    el.firstElementChild.style.transform = 'translate(0px,0px)';
  }
  e.preventDefault();
}
function onTouchMove(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var stick = (t.identifier === TOUCH.left.id) ? TOUCH.left :
                (t.identifier === TOUCH.right.id) ? TOUCH.right : null;
    if (!stick) continue;
    var isLeft = (stick === TOUCH.left);
    if (!isLeft && INPUT.lookMode === 'swipe') {
      // direct look: the view follows the thumb, the way every modern mobile
      // shooter aims; a rate stick is too coarse for a headshot
      INPUT.swipeDX += t.clientX - stick.lx;
      INPUT.swipeDY += t.clientY - stick.ly;
      stick.lx = t.clientX; stick.ly = t.clientY;
      continue;
    }
    var dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
    var v = applyStick(dx, dy);
    stick.x = v.x; stick.y = v.y; stick.mag = v.mag;

    var el = isLeft ? TOUCH.els.stickL : TOUCH.els.stickR;
    var mag = Math.min(Math.hypot(dx, dy), TOUCH.maxRadius);
    var ang = Math.atan2(dy, dx);
    el.firstElementChild.style.transform =
      'translate(' + (Math.cos(ang) * mag * 0.62).toFixed(1) + 'px,' + (Math.sin(ang) * mag * 0.62).toFixed(1) + 'px)';
    if (isLeft) el.classList.toggle('sprint', v.mag > 0.85);
  }
  e.preventDefault();
}
function releaseStick(stick, el) {
  stick.id = -1; stick.x = 0; stick.y = 0; stick.mag = 0;
  el.classList.remove('on', 'sprint');
}
function onTouchEnd(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var id = e.changedTouches[i].identifier;
    if (id === TOUCH.left.id) releaseStick(TOUCH.left, TOUCH.els.stickL);
    else if (id === TOUCH.right.id) releaseStick(TOUCH.right, TOUCH.els.stickR);
  }
  e.preventDefault();
}
function releaseAllInput() {
  INPUT.fire = false; INPUT.fireLatched = false; INPUT.interact = false; INPUT.aim = false;
  INPUT.mouseDown = false; INPUT.mouseDX = INPUT.mouseDY = 0; INPUT.swipeDX = INPUT.swipeDY = 0;
  INPUT.keys = {};
  if (TOUCH.els.stickL) { releaseStick(TOUCH.left, TOUCH.els.stickL); releaseStick(TOUCH.right, TOUCH.els.stickR); }
  var pressed = document.querySelectorAll('.tbtn.press');
  for (var i = 0; i < pressed.length; i++) pressed[i].classList.remove('press');
}
function bindHoldButton(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  var active = -1;
  el.addEventListener('touchstart', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (active !== -1) return;
    active = e.changedTouches[0].identifier;
    el.classList.add('press'); fn(true);
  }, { passive: false });
  function up(e) {
    e.preventDefault(); e.stopPropagation();
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active) { active = -1; el.classList.remove('press'); fn(false); }
    }
  }
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
  el.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('press'); fn(true); }, false);
  el.addEventListener('mouseup', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('press'); fn(false); }, false);
  el.addEventListener('mouseleave', function () { if (el.classList.contains('press')) { el.classList.remove('press'); fn(false); } }, false);
}
/* A tap fires once. preventDefault on touchstart already suppresses the
   synthesised click in current browsers; the timestamp guard keeps it to one
   action on any browser that synthesises the click regardless. */
function bindTapButton(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  var touchAt = -1e9;
  el.addEventListener('touchstart', function (e) {
    e.preventDefault(); e.stopPropagation();
    touchAt = performance.now();
    el.classList.add('press'); fn();
  }, { passive: false });
  el.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('press'); }, { passive: false });
  el.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (performance.now() - touchAt < 800) return;
    fn();
  }, false);
}

function onKeyDown(e) {
  var k = e.key.toLowerCase();
  if (INPUT.keys[k]) return;
  INPUT.keys[k] = true;
  INPUT.usingTouch = false;
  if (k === 'escape' || k === 'p') { if (GAME.state === 'playing') pauseGame(); else if (GAME.state === 'paused') resumeGame(); }
  if (GAME.state !== 'playing') return;
  if (k === 'c') { INPUT.crouch = !INPUT.crouch; syncToggleButtons(); }
  if (k === 'r') reloadWeapon();
  if (k === 'q') cycleWeapon(-1);
  if (k === 'e' || k === 'f') INPUT.interact = true;
  if (k === '1') switchWeapon(0);
  if (k === '2') switchWeapon(1);
  if (k === '3') switchWeapon(2);
  if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
}
function onKeyUp(e) {
  var k = e.key.toLowerCase();
  INPUT.keys[k] = false;
  if (k === 'e' || k === 'f') INPUT.interact = false;
}
function onMouseDown(e) {
  if (GAME.state !== 'playing') return;
  e.preventDefault();
  INPUT.usingTouch = false;
  if (e.button === 0) { INPUT.fire = true; INPUT.mouseDown = true; }
  if (e.button === 2) INPUT.aim = true;
  if (!INPUT.pointerLocked && e.button === 0) requestPointerLock();
}
function onMouseUp(e) {
  if (e.button === 0) { INPUT.fire = false; INPUT.fireLatched = false; INPUT.mouseDown = false; }
  if (e.button === 2) INPUT.aim = false;
}
function onMouseMove(e) {
  if (GAME.state !== 'playing') return;
  // Pointer lock where it exists; a plain drag everywhere else
  if (INPUT.pointerLocked || INPUT.mouseDown) {
    INPUT.mouseDX += e.movementX || 0;
    INPUT.mouseDY += e.movementY || 0;
  }
}
function requestPointerLock() {
  var canvas = document.getElementById('c');
  var fn = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
  if (!fn) return;
  try {
    var p = fn.call(canvas);
    // newer browsers return a promise that rejects if the lock is refused
    if (p && typeof p.catch === 'function') p.catch(function () {});
  } catch (e) {}
}
function exitPointerLock() {
  INPUT.lockWanted = false;
  try { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
}

/* Fold every source into the per-frame input the player controller reads. */
function gatherInput(dt) {
  var keyX = 0, keyY = 0;
  if (INPUT.keys['w'] || INPUT.keys['arrowup']) keyY -= 1;
  if (INPUT.keys['s'] || INPUT.keys['arrowdown']) keyY += 1;
  if (INPUT.keys['a'] || INPUT.keys['arrowleft']) keyX -= 1;
  if (INPUT.keys['d'] || INPUT.keys['arrowright']) keyX += 1;

  var tx = TOUCH.left.x || 0, ty = TOUCH.left.y || 0;
  INPUT.moveX = keyX + tx;
  INPUT.moveY = keyY + ty;
  INPUT.sprint = !!INPUT.keys['shift'] || (TOUCH.left.mag || 0) > 0.85;

  // Aiming down sights narrows the field of view, so look slows with it or
  // the scope turns every thumb twitch into a lurch.
  var sens = INPUT.sensitivity * (WEAPONS.aiming ? 0.6 : 1);
  var mouseLookX = INPUT.mouseDX * 0.0022 * sens;
  var mouseLookY = INPUT.mouseDY * 0.0022 * sens;
  INPUT.mouseDX = 0; INPUT.mouseDY = 0;

  var swipeX = INPUT.swipeDX * TOUCH.swipeRate * sens;
  var swipeY = INPUT.swipeDY * TOUCH.swipeRate * sens;
  INPUT.swipeDX = 0; INPUT.swipeDY = 0;

  var stickLookX = 0, stickLookY = 0;
  if (INPUT.lookMode === 'stick') {
    stickLookX = (TOUCH.right.x || 0) * TOUCH.lookRate * sens * dt;
    stickLookY = (TOUCH.right.y || 0) * TOUCH.lookRate * sens * dt;
  }

  INPUT.lookX = mouseLookX + stickLookX + swipeX;
  INPUT.lookY = mouseLookY + stickLookY + swipeY;
  INPUT.lookAccumX += INPUT.lookX;
  INPUT.lookAccumY += INPUT.lookY;
  return INPUT;
}

// ===SECTION 10===
/* HUD. Plain absolutely-positioned DOM over the canvas — the element handles
   are looked up once and only their values are written afterwards, so no frame
   ever rebuilds markup. */

/* The crosshair, health bar, ammo readout, weapon name and alert wash are drawn
   on a 2D canvas layered over the WebGL canvas and repainted in the rAF loop.
   Objectives and the alert banner stay as HTML — they change rarely and never
   per frame. Nothing here touches innerHTML. */

var HUD = {
  el: {}, canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
  alertTimer: 0, hitTimer: 0, toastTimer: 0, dmgTimer: 0, built: false,
  crossGap: 0, crossGapTarget: 0, promptText: '', vigText: '', useOn: false,
  dmgFromX: 0, dmgFromZ: 0, dmgDirTimer: 0
};

function initHUD() {
  var ids = ['hud', 'touch', 'dmgVig', 'lowHpVig', 'objText', 'alertBox',
             'interactPrompt', 'toast', 'fpsCounter', 'btnUse', 'cheatTag'];
  for (var i = 0; i < ids.length; i++) HUD.el[ids[i]] = document.getElementById(ids[i]);

  HUD.canvas = document.getElementById('hudCanvas');
  HUD.ctx = HUD.canvas ? HUD.canvas.getContext('2d') : null;

  // objective rows are created once; updates only touch className
  HUD.el.objText.innerHTML = '';
  HUD.objRows = [];
  var labels = objectiveLabels();
  for (i = 0; i < labels.length; i++) {
    var row = document.createElement('div');
    row.textContent = labels[i];
    HUD.el.objText.appendChild(row);
    HUD.objRows.push(row);
  }
  HUD.built = true;
  hudResizeCanvas();
}

function hudResizeCanvas() {
  if (!HUD.canvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  HUD.dpr = dpr;
  HUD.w = window.innerWidth; HUD.h = window.innerHeight;
  HUD.canvas.width = Math.floor(HUD.w * dpr);
  HUD.canvas.height = Math.floor(HUD.h * dpr);
  HUD.canvas.style.width = HUD.w + 'px';
  HUD.canvas.style.height = HUD.h + 'px';
  if (HUD.ctx) HUD.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* Touch controls only where there is touch: on a desktop they were drawn over
   the view and did nothing. A device that reports touch, or any touch at all
   during play, brings them up. */
function hudShow(on) {
  HUD.el.hud.classList.toggle('on', !!on);
  HUD.el.touch.classList.toggle('on', !!on && (IS_TOUCH || INPUT.usingTouch));
  if (HUD.canvas) HUD.canvas.style.display = on ? 'block' : 'none';
}

/* Health, armour and ammo have no update hooks: the canvas pass reads live
   state every frame. The empty hooks the DOM HUD used to need are gone. */
function objectiveLabels() {
  var list = activeObjectives(), out = [];
  for (var i = 0; i < list.length; i++) out.push(list[i].letter + '. ' + list[i].text);
  return out;
}

/* The list length changes with difficulty, so the rows are rebuilt whenever a
   mission starts rather than assumed to be the two the markup began with. */
function hudRebuildObjectives() {
  if (!HUD.built) return;
  var host = HUD.el.objText;
  var labels = objectiveLabels();
  while (host.firstChild) host.removeChild(host.firstChild);
  HUD.objRows = [];
  for (var i = 0; i < labels.length; i++) {
    var row = document.createElement('div');
    row.textContent = labels[i];
    host.appendChild(row);
    HUD.objRows.push(row);
  }
  hudUpdateObjectives();
}

function hudUpdateObjectives() {
  if (!HUD.built) return;
  var list = activeObjectives();
  for (var i = 0; i < list.length && i < HUD.objRows.length; i++) {
    var o = list[i];
    var cls = '';
    if (o.failed && o.failed()) {
      cls = 'failed';                 // lost outright, and it cannot come back
    } else if (!o.constraint && o.done()) {
      cls = 'done';
    }
    // A constraint is satisfied from the moment the mission starts, so ticking
    // it off while you are still playing would tell you that you had achieved
    // something you have merely not yet ruined. It stays neutral until the
    // debrief, where done() is finally the whole truth.
    HUD.objRows[i].className = cls;
  }
}
function hudAlert(text) {
  if (!HUD.built) return;
  HUD.el.alertBox.textContent = text;
  HUD.el.alertBox.style.opacity = '1';
  HUD.alertTimer = 3.0;
}
function hudClearAlert() {
  if (!HUD.built) return;
  HUD.el.alertBox.style.opacity = '0';
  HUD.el.alertBox.textContent = '';
  HUD.alertTimer = 0;
}
function hudHitMarker(head) {
  HUD.hitTimer = head ? 0.16 : 0.12;
}
/* Crosshair kicks open 8px on firing and closes back over 300ms. */
function hudShotFired() {
  HUD.crossGap = 8;
}
/* The red wash, plus an arc round the crosshair pointing at whoever fired:
   without it a hit from behind in a corridor is just a mystery. */
function hudFlashDamage(fromPos) {
  if (!HUD.built) return;
  HUD.el.dmgVig.style.opacity = '1';
  HUD.dmgTimer = 0.16;
  if (fromPos && PLAYER) {
    HUD.dmgFromX = fromPos.x; HUD.dmgFromZ = fromPos.z;
    HUD.dmgDirTimer = 1.1;
  }
}
function hudToast(msg) {
  if (!HUD.built) return;
  HUD.el.toast.textContent = msg;
  HUD.el.toast.style.opacity = '1';
  HUD.toastTimer = 3.4;
}
/* Called every frame; the DOM is only touched when the prompt changes. */
function hudPrompt(text) {
  if (!HUD.built) return;
  text = text || '';
  if (text === HUD.promptText) return;
  HUD.promptText = text;
  var el = HUD.el.interactPrompt, btn = HUD.el.btnUse;
  el.classList.toggle('on', !!text);
  btn.classList.toggle('on', !!text || AIM.kind === 'use');
  el.textContent = text;
}

function hudTick(dt) {
  if (!HUD.built) return;
  if (HUD.alertTimer > 0) { HUD.alertTimer -= dt; if (HUD.alertTimer <= 0) HUD.el.alertBox.style.opacity = '0'; }
  if (HUD.hitTimer > 0) HUD.hitTimer -= dt;
  if (HUD.dmgDirTimer > 0) HUD.dmgDirTimer -= dt;
  if (HUD.dmgTimer > 0) { HUD.dmgTimer -= dt; if (HUD.dmgTimer <= 0) HUD.el.dmgVig.style.opacity = '0'; }
  if (HUD.toastTimer > 0) { HUD.toastTimer -= dt; if (HUD.toastTimer <= 0) HUD.el.toast.style.opacity = '0'; }

  var low = PLAYER.health < 35 ? clamp((35 - PLAYER.health) / 35, 0, 1) : 0;
  var vig = low ? (low * (0.55 + 0.45 * Math.sin(GAME.elapsed * 6))).toFixed(2) : '0';
  if (vig !== HUD.vigText) { HUD.vigText = vig; HUD.el.lowHpVig.style.opacity = vig; }
  // the USE button also shows when the probe has found a use target in reach
  var wantUse = !!HUD.promptText || (AIM.kind === 'use' && AIM.prompt === 'HOLD USE');
  if (wantUse !== HUD.useOn) { HUD.useOn = wantUse; HUD.el.btnUse.classList.toggle('on', wantUse); }

  // crosshair gap closes linearly over 300ms
  if (HUD.crossGap > 0) HUD.crossGap = Math.max(0, HUD.crossGap - dt * (8 / 0.3));

  if (GAME.showStats && (GAME.frameCount & 15) === 0) {
    HUD.el.fpsCounter.textContent =
      Math.round(1000 / Math.max(0.01, RENDER.frameMs)) + ' fps  ' + RENDER.frameMs.toFixed(1) + ' ms\n' +
      RENDER.drawInfo + '\nq ' + GFX.quality + '  shadow ' + RENDER.shadowSize;
  }
  hudDrawCanvas();
}

function hudDrawCanvas() {
  var ctx = HUD.ctx;
  if (!ctx) return;
  var w = HUD.w, h = HUD.h;
  ctx.clearRect(0, 0, w, h);

  // ---- alert wash: 12% red, pulsing at 1Hz, only while the alarm is up ----
  if (GAME.alarm) {
    var pulse = 0.5 + 0.5 * Math.sin(GAME.elapsed * Math.PI * 2);
    ctx.globalAlpha = 0.12 * (0.45 + 0.55 * pulse);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // ---- crosshair ----
  // The reticle answers one question: what would this shot do? White means
  // nothing in particular, red means a target, amber means something to hold
  // USE on. It is the same colour rule the fixtures themselves use, so the
  // interface and the world never tell you different things. Kept small and
  // centred: competitive practice is that a reticle which balloons around
  // hides the thing you are aiming at, so the state shows in colour and in a
  // pair of corner brackets rather than in size.
  var cx = Math.round(w / 2), cy = Math.round(h / 2);
  var gap = 5 + HUD.crossGap, len = 9;
  var aimCol = '#ffffff';
  if (HUD.hitTimer > 0) aimCol = '#ff2d3c';
  else if (AIM.kind === 'enemy' || AIM.kind === 'shoot') aimCol = '#ff2d3c';
  else if (AIM.kind === 'use') aimCol = '#ffb128';
  ctx.lineWidth = 2;
  ctx.strokeStyle = aimCol;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
  ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
  ctx.stroke();

  // brackets: drawn only when the probe found something, so their presence is
  // itself the signal that this is a thing and not scenery
  if (AIM.kind) {
    var br = gap + len + 5, arm = 5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var qx = -1; qx <= 1; qx += 2) {
      for (var qy = -1; qy <= 1; qy += 2) {
        ctx.moveTo(cx + qx * br, cy + qy * br - qy * arm);
        ctx.lineTo(cx + qx * br, cy + qy * br);
        ctx.lineTo(cx + qx * br - qx * arm, cy + qy * br);
      }
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // where the last hit came from: bearing relative to the view, up is ahead
  if (HUD.dmgDirTimer > 0) {
    var ddx = HUD.dmgFromX - PLAYER.pos.x, ddz = HUD.dmgFromZ - PLAYER.pos.z;
    var fwx = -Math.sin(PLAYER.yaw), fwz = -Math.cos(PLAYER.yaw);
    var rtx = Math.cos(PLAYER.yaw), rtz = -Math.sin(PLAYER.yaw);
    var brg = Math.atan2(ddx * rtx + ddz * rtz, ddx * fwx + ddz * fwz);
    var ang = brg - Math.PI / 2;               // canvas angle: 0 is +x, up is -PI/2
    ctx.strokeStyle = 'rgba(255,45,60,' + clamp(HUD.dmgDirTimer / 0.5, 0, 0.9).toFixed(2) + ')';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 64, ang - 0.38, ang + 0.38); ctx.stroke();
  }

  // name the thing, and say what the trigger would do about it
  if (AIM.kind && AIM.label) {
    // Above the reticle, not below it: the hold-USE progress bar already lives
    // under the crosshair, and two lines both saying HOLD USE on top of each
    // other is worse than either alone.
    var labelY = cy - gap - len - 20;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 4;
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = aimCol;
    ctx.fillText(AIM.label + '  ' + Math.round(AIM.dist) + 'm', cx, labelY);
    // The download bar is the better prompt whenever it is up, so defer to it.
    var barUp = HUD.el.interactPrompt && HUD.el.interactPrompt.classList.contains('on');
    if (AIM.prompt && !(AIM.kind === 'use' && barUp)) {
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillStyle = AIM.prompt === 'MOVE CLOSER' ? '#9fb0c4' : aimCol;
      ctx.fillText(AIM.prompt, cx, labelY - 15);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  var padL = 16 + hudInsetLeft(), padB = 18 + hudInsetBottom(), padR = 16 + hudInsetRight();

  // ---- health bar, bottom left ----
  var barW = 200, barH = 14;
  var bx = padL, by = h - padB - barH;
  var frac = clamp(PLAYER.health / Math.max(1, PLAYER.maxHealth), 0, 1);
  ctx.fillStyle = 'rgba(6,10,16,0.72)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = frac > 0.6 ? '#3ddc6b' : (frac > 0.3 ? '#ffc23a' : '#ff2d3c');
  ctx.fillRect(bx + 1, by + 1, (barW - 2) * frac, barH - 2);
  ctx.strokeStyle = 'rgba(159,176,196,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  // The floor tiles are near-white under the fluorescents; a grey label on its
  // own disappears into them, so every small caption gets a dark drop.
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#c8d6e6';
  ctx.fillText('BODY ARMOUR / HEALTH', bx, by - 6);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (PLAYER.armor > 0) {
    var aFrac = clamp(PLAYER.armor / CFG.player.maxArmor, 0, 1);
    ctx.fillStyle = '#48b7ff';
    ctx.fillRect(bx, by + barH + 3, (barW) * aFrac, 4);
  }

  // ---- ammo + weapon name, bottom right ----
  var w2 = currentWeapon;
  if (w2) {
    var reserve = w2.infiniteReserve ? '\u221E' : String(w2.reserve);
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.font = '30px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(w2.ammoInMag + ' / ' + reserve, w - padR, h - padB);
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#9fb0c4';
    ctx.fillText(w2.name, w - padR, h - padB - 34);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  ctx.textAlign = 'left';

  hudDrawWaypoint(ctx, w, h);
  if (LEVEL && GAME.state === 'playing') {
    if (MINIMAP.tick !== (GAME.frameCount >> 3)) {
      MINIMAP.tick = GAME.frameCount >> 3;
      minimapRefresh();
    }
    hudDrawMinimap(ctx, w, h);
  }
}

/* ---------- minimap ----------
   Drawn on the same 2D canvas: a rotating plan view with the player fixed at the
   centre facing up. Walls come straight out of the collision list, so the map can
   never disagree with what you can actually walk through. Contacts follow the
   same rule the radar in a stealth game should: a guard appears once he has been
   seen or once he is hunting, never before. */
var MINIMAP = { rects: [], tick: -1, range: 30 };

function minimapRefresh() {
  var list = LEVEL.collidables, out = MINIMAP.rects;
  out.length = 0;
  var px = PLAYER.pos.x, pz = PLAYER.pos.z, r = MINIMAP.range;
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    if (b.walkable) continue;
    if (b.disabled) continue;                            // an open door is a gap, not a wall
    if (b.maxY < PLAYER.pos.y + 0.35) continue;          // low kerbs are not walls
    if (b.maxX < px - r || b.minX > px + r) continue;
    if (b.maxZ < pz - r || b.minZ > pz + r) continue;
    out.push(b);
  }
}

function hudDrawMinimap(ctx, w, h) {
  var size = Math.min(132, Math.max(96, Math.round(Math.min(w, h) * 0.30)));
  var pad = 14;
  var cx = w - hudInsetRight() - pad - size / 2;
  var cy = hudInsetTop() + pad + size / 2;
  var rad = size / 2;
  var scale = rad / MINIMAP.range;
  var yaw = PLAYER.yaw;
  var cosY = Math.cos(yaw), sinY = Math.sin(yaw);

  // world delta -> map space, with the player's heading pointing up
  function toMap(wx, wz) {
    var dx = wx - PLAYER.pos.x, dz = wz - PLAYER.pos.z;
    return [dx * cosY - dz * sinY, dx * sinY + dz * cosY];
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.283); ctx.closePath();
  ctx.fillStyle = 'rgba(5,9,14,0.72)'; ctx.fill();
  ctx.save(); ctx.clip();

  // walls
  ctx.fillStyle = 'rgba(150,170,195,0.34)';
  for (var i = 0; i < MINIMAP.rects.length; i++) {
    var b = MINIMAP.rects[i];
    var c0 = toMap(b.minX, b.minZ), c1 = toMap(b.maxX, b.minZ),
        c2 = toMap(b.maxX, b.maxZ), c3 = toMap(b.minX, b.maxZ);
    ctx.beginPath();
    ctx.moveTo(cx + c0[0] * scale, cy + c0[1] * scale);
    ctx.lineTo(cx + c1[0] * scale, cy + c1[1] * scale);
    ctx.lineTo(cx + c2[0] * scale, cy + c2[1] * scale);
    ctx.lineTo(cx + c3[0] * scale, cy + c3[1] * scale);
    ctx.closePath(); ctx.fill();
  }

  // doors, coloured by whether they will actually open for you
  for (i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    var dm = toMap(d.x, d.z);
    if (Math.hypot(dm[0], dm[1]) > MINIMAP.range) continue;
    ctx.fillStyle = d.locked ? 'rgba(255,45,60,0.95)' : 'rgba(93,255,143,0.9)';
    ctx.fillRect(cx + dm[0] * scale - 2.5, cy + dm[1] * scale - 2.5, 5, 5);
  }

  // Alarm panels and intact stockpile tanks. Both are things you act on rather
  // than things that act on you, so unlike guards they are always shown: the
  // decision of which panel to cut before you are seen is the interesting one,
  // and you cannot make it if you have to find them by walking into them.
  for (i = 0; LEVEL.panels && i < LEVEL.panels.length; i++) {
    var pn = LEVEL.panels[i];
    var pm = toMap(pn.pos.x, pn.pos.z);
    if (Math.hypot(pm[0], pm[1]) > MINIMAP.range) continue;
    var pxx = cx + pm[0] * scale, pyy = cy + pm[1] * scale;
    ctx.strokeStyle = pn.alive ? 'rgba(255,45,60,0.95)' : 'rgba(120,130,145,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pxx, pyy, 3.5, 0, 6.283); ctx.stroke();
    if (!pn.alive) {   // a cut panel gets a line through it
      ctx.beginPath(); ctx.moveTo(pxx - 3, pyy - 3); ctx.lineTo(pxx + 3, pyy + 3); ctx.stroke();
    }
  }
  for (i = 0; LEVEL.tanks && i < LEVEL.tanks.length; i++) {
    var tk = LEVEL.tanks[i];
    if (!tk.intact) continue;
    var tm = toMap(tk.pos.x, tk.pos.z);
    if (Math.hypot(tm[0], tm[1]) > MINIMAP.range) continue;
    ctx.fillStyle = 'rgba(168,255,122,0.85)';
    ctx.fillRect(cx + tm[0] * scale - 3, cy + tm[1] * scale - 3, 6, 6);
  }

  // Guards, but only the ones that have given themselves away. A radar showing
  // every patrol would make the stealth half of the level pointless; a guard
  // who is hunting you has already broken cover, and you should be able to see
  // where he is going. Red is coming for you, amber is looking for you.
  for (i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    var hunting = e.state === 'ATTACK' || e.state === 'CHASE';
    var known = hunting || e.state === 'ALERT' || e.state === 'SEARCH' || e.canSee;
    if (!known) continue;
    var em = toMap(e.group.position.x, e.group.position.z);
    if (Math.hypot(em[0], em[1]) > MINIMAP.range) continue;
    ctx.fillStyle = hunting ? '#ff2d3c' : '#ffb128';
    ctx.beginPath(); ctx.arc(cx + em[0] * scale, cy + em[1] * scale, 3, 0, 6.283); ctx.fill();
  }
  ctx.restore();   // release the clip

  // objective marker, pinned to the rim when it is off the map
  var obj = hudObjectiveTarget();
  if (obj) {
    var om = toMap(obj.x, obj.z);
    var dist = Math.hypot(om[0], om[1]);
    var ox = om[0] * scale, oy = om[1] * scale;
    var clamped = false;
    if (dist * scale > rad - 9) {
      var k = (rad - 9) / (dist * scale);
      ox *= k; oy *= k; clamped = true;
    }
    ctx.fillStyle = '#ffb128';
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy - 6);
    ctx.lineTo(cx + ox + 5, cy + oy + 4);
    ctx.lineTo(cx + ox - 5, cy + oy + 4);
    ctx.closePath(); ctx.fill();
    if (clamped) { ctx.strokeStyle = 'rgba(255,177,40,0.55)'; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // rim, then the player arrow on top
  ctx.strokeStyle = 'rgba(159,176,196,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.283); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.5, cy + 5); ctx.lineTo(cx - 4.5, cy + 5);
  ctx.closePath(); ctx.fill();

  // heading letter above the map
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#9fb0c4'; ctx.textAlign = 'center';
  var deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  var dirs = ['N','NE','E','SE','S','SW','W','NW'];
  ctx.fillText(dirs[Math.round(deg / 45) % 8], cx, cy - rad - 5);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* Where the player is currently supposed to be heading: the archive, then the
   nearest tank still standing if this tier wants the stockpile, then the exit.
   It used to jump straight from the terminal to the exit, pointing a Secret
   Agent at a door that would not end the mission.

   This function and hudDrawWaypoint were each declared twice. The later copy
   of a function declaration wins, so the corrected off-screen marker below had
   been silently replaced by the older mirrored one it was written to fix. */
function hudObjectiveTarget() {
  if (!LEVEL) return null;
  if (!GAME.objectives.terminal) return LEVEL.terminal ? LEVEL.terminal.pos : null;
  var stock = objectiveById('stockpile');
  if (stock && stock.tier <= GAME.difficulty && !GAME.objectives.stockpile && LEVEL.tanks) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < LEVEL.tanks.length; i++) {
      var t = LEVEL.tanks[i];
      if (!t.intact) continue;
      var d = Math.hypot(t.pos.x - PLAYER.pos.x, t.pos.z - PLAYER.pos.z);
      if (d < bestD) { bestD = d; best = t.gauge.position; }
    }
    if (best) return best;
  }
  return LEVEL.spawnPoints.exit;
}

/* A marker in the view itself, clamped to the screen edge when off camera, so
   the objective is findable without reading the map. */
function hudDrawWaypoint(ctx, w, h) {
  var obj = hudObjectiveTarget();
  if (!obj) return;
  var dist = Math.round(Math.hypot(obj.x - PLAYER.pos.x, obj.z - PLAYER.pos.z));
  var cxs = w / 2, cys = h / 2, m = 46;
  var sx, sy, offscreen;

  var v = _wpVec.set(obj.x, obj.y + 1.2, obj.z).project(RENDER.camera);
  if (v.z <= 1) {
    sx = (v.x * 0.5 + 0.5) * w;
    sy = (-v.y * 0.5 + 0.5) * h;
    offscreen = sx < m || sx > w - m || sy < m || sy > h - m;
  } else {
    offscreen = true;
  }

  if (offscreen) {
    // A projected point behind the camera is meaningless, and mirroring it can
    // land the marker near the middle of the screen, pointing you the wrong
    // way. Off-screen targets are placed by true bearing instead: straight
    // ahead is up, dead behind is straight down, and the marker rides the
    // border in between, so the arrow always names the way you have to turn.
    var dx = obj.x - PLAYER.pos.x, dz = obj.z - PLAYER.pos.z;
    var fx = -Math.sin(PLAYER.yaw), fz = -Math.cos(PLAYER.yaw);
    var rx = Math.cos(PLAYER.yaw), rz = -Math.sin(PLAYER.yaw);
    var bearing = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    var ux = Math.sin(bearing), uy = -Math.cos(bearing);
    // push that direction out to the inset border rectangle
    var halfW = cxs - m, halfH = cys - m;
    var k = Math.min(
      Math.abs(ux) > 1e-4 ? halfW / Math.abs(ux) : Infinity,
      Math.abs(uy) > 1e-4 ? halfH / Math.abs(uy) : Infinity
    );
    sx = cxs + ux * k; sy = cys + uy * k;
  }

  ctx.save();
  ctx.globalAlpha = offscreen ? 0.78 : 0.95;
  ctx.strokeStyle = '#ffb128'; ctx.fillStyle = '#ffb128'; ctx.lineWidth = 2;
  if (offscreen) {
    // an arrow that points off the edge, toward where the objective actually is
    var ang = Math.atan2(sy - cys, sx - cxs);
    ctx.translate(sx, sy); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-5, 7); ctx.lineTo(-5, -7);
    ctx.closePath(); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 6.283); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 14, sy); ctx.lineTo(sx - 5, sy);
    ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 14, sy); ctx.stroke();
  }
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
  ctx.fillText(dist + 'm', sx, sy + 24);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.restore();
}

var _wpVec = new THREE.Vector3();

/* Safe-area insets read once per resize would be ideal, but they are cheap and
   this keeps the canvas honest when a phone rotates. */
function hudInsetLeft() { return hudInsetPx('--safe-l'); }
function hudInsetTop() { return hudInsetPx('--safe-t'); }
function hudInsetRight() { return hudInsetPx('--safe-r'); }
function hudInsetBottom() { return hudInsetPx('--safe-b'); }
var _insetCache = {}, _insetTick = -1;
function hudInsetPx(name) {
  if (_insetTick !== GAME.frameCount >> 6) {
    _insetTick = GAME.frameCount >> 6;
    _insetCache = {};
  }
  if (_insetCache[name] !== undefined) return _insetCache[name];
  var v = 0;
  try {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = parseFloat(raw) || 0;
  } catch (e) { v = 0; }
  _insetCache[name] = v;
  return v;
}

// ===SECTION 11===
/* Game state, the frame loop, and the objective / win / loss rules. */

/* Doors slide up when someone unlocked is close, and their collider goes with them. */
/* How close a body has to be for a door to notice it, and how close it has to
   be before the door refuses to close on top of it. */
var DOOR_TRIGGER = 3.2, DOOR_MOUTH = 1.35;

function doorOccupant(d) {
  if (Math.hypot(PLAYER.pos.x - d.x, PLAYER.pos.z - d.z) < DOOR_TRIGGER) return true;
  // Guards use these doors too. Without this a chasing guard walks into a slab
  // that only ever opened for the player, and the chase dies in the corridor.
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    var p = e.group.position;
    if (Math.hypot(p.x - d.x, p.z - d.z) < DOOR_TRIGGER) return true;
  }
  return false;
}

function doorMouthBlocked(d) {
  if (Math.hypot(PLAYER.pos.x - d.x, PLAYER.pos.z - d.z) < DOOR_MOUTH) return true;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    var p = e.group.position;
    if (Math.hypot(p.x - d.x, p.z - d.z) < DOOR_MOUTH) return true;
  }
  return false;
}

function updateDoors(dt) {
  for (var i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    var want = (!d.locked && doorOccupant(d)) ? 1 : 0;
    // A door never closes on a body standing in its mouth. The collider it
    // switches back on is full height, so closing on the player reads exactly
    // like being shoved into, or wedged inside, a wall.
    if (!want && doorMouthBlocked(d)) want = 1;
    if (want !== d.target) {
      d.target = want;
      if (want) sfxDoor(d.mesh.position);
    }
    if (Math.abs(d.open - d.target) > 0.001) {
      d.open += clamp(d.target - d.open, -dt * 1.6, dt * 1.6);
      d.mesh.position.y = d.closedY + d.open * (WALL_H - 0.1);
    }
    // Kept outside the animation branch: the collider has to agree with the
    // slab's actual position on every frame, not only on frames where it moved.
    d.aabb.disabled = d.open > 0.75;
  }
}

function startMission() {
  ensureAudio();
  audioResume();
  GAME.state = 'playing';
  GAME.elapsed = 0;
  GAME.alarm = false; GAME.alarmAt = 0; GAME.kills = 0; GAME.bodies = 0;
  GAME.objectives.terminal = false; GAME.objectives.escaped = false;
  GAME.objectives.stockpile = false; GAME.sciKills = 0;
  GAME.stats.shots = 0; GAME.stats.hits = 0; GAME.stats.head = 0; GAME.stats.torso = 0; GAME.stats.limb = 0;
  GAME.noise.t = 0;
  GAME.dyingT = 0;

  // cheats are read once, here, so a run's rules cannot change halfway through
  GAME.paintball = cheatOn('paintball');
  GAME.dk = cheatOn('dk');
  GAME.turbo = cheatOn('turbo');
  GAME.infiniteAmmo = cheatOn('ammo');
  GAME.invincible = cheatOn('invincible');
  GAME.cheated = anyCheatOn();
  clearPaint();

  hudRebuildObjectives();
  setAlarmLoop(false);
  RENDER.alarmMix = 0;
  hudClearAlert();

  // reset player
  PLAYER = makePlayer();
  player = PLAYER;
  PLAYER.pos.copy(LEVEL.spawnPoints.player);
  PLAYER.lastClear.copy(PLAYER.pos); PLAYER.stuckFrames = 0;
  PLAYER.yaw = Math.PI;         // facing out of the bathroom
  PLAYER.maxHealth = Math.round(CFG.player.maxHealth * CFG.difficulty[GAME.difficulty].health);
  PLAYER.health = PLAYER.maxHealth;

  // reset weapons: PP7 and mines carried in, the rifle taken in the field
  WEAPONS.flashTimer = 0; WEAPONS.flashPeak = 0; WEAPONS.flashSpan = 0;
  WEAPONS.flashFromPlayer = false;
  if (WEAPONS.muzzleLight) WEAPONS.muzzleLight.intensity = 0;
  if (WEAPONS.flashQuad) WEAPONS.flashQuad.visible = false;
  WEAPONS.cooldown = 0; WEAPONS.reloading = 0; WEAPONS.recoil = 0;
  for (var i = 0; i < WEAPONS.list.length; i++) {
    var w = WEAPONS.list[i];
    w.owned = w.id !== 'kf7';
    w.ammoInMag = w.owned ? w.magSize : 0;
    if (!w.infiniteReserve) w.reserve = 0;
  }
  WEAPONS.index = 0; currentWeapon = WEAPONS.list[0];
  for (i = 0; i < WEAPONS.viewModels.length; i++) WEAPONS.viewModels[i].visible = (i === 0);
  for (i = WEAPONS.mines.length - 1; i >= 0; i--) {
    RENDER.scene.remove(WEAPONS.mines[i].mesh);   // shared geometry, see placeMine
    WEAPONS.mines.splice(i, 1);
  }
  for (i = 0; i < WEAPONS.impactPool.length; i++) { WEAPONS.impactPool[i].life = 0; WEAPONS.impactPool[i].mesh.visible = false; }

  // reset the stockpile
  if (LEVEL.tanks) {
    for (i = 0; i < LEVEL.tanks.length; i++) {
      LEVEL.tanks[i].intact = true;
      LEVEL.tanks[i].gauge.material = MAT.ledRed;
    }
  }

  // reset alarm panels and whoever was running for one
  ENEMIES.runnerActive = null;
  if (LEVEL.panels) {
    for (i = 0; i < LEVEL.panels.length; i++) {
      var pn = LEVEL.panels[i];
      pn.alive = true;
      pn.led.material = MAT.ledRed;
      pn.mesh.material = MAT.metalDark;
    }
  }

  // reset terminal + doors
  LEVEL.terminal.used = false;
  LEVEL.terminal.screen.material = MAT.screenAmber;
  LEVEL.terminal.led.material = MAT.ledAmber;
  for (i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    d.locked = (d.tag.indexOf('exit') === 0);
    d.open = 0; d.target = 0;
    d.mesh.position.y = d.closedY;
    d.aabb.disabled = false;
    setDoorLamps(d, d.locked ? MAT.ledRed : MAT.ledGreen);
  }

  spawnEnemies();
  resetPickups();
  _aimHighlighted = null;
  if (WEAPONS.viewGroup) WEAPONS.viewGroup.visible = true;
  releaseAllInput();
  INPUT.crouch = false; INPUT.aimToggle = false;
  syncToggleButtons();

  showScreen(null);
  hudShow(true);
  HUD.promptText = null; hudPrompt('');
  hudUpdateObjectives();
  var tag = HUD.el.cheatTag;
  if (tag) {
    var names = [];
    for (i = 0; i < CHEATS.length; i++) if (cheatOn(CHEATS[i].id)) names.push(CHEATS[i].name);
    tag.textContent = names.length ? 'CHEATS: ' + names.join(' · ') : '';
  }
  hudToast('Insertion complete. Find the control room.');
  // Compile every material in the scene now, behind the insertion toast.
  // three.js otherwise compiles a shader the first time its material comes
  // into view -- a pickup, a paint splat, a guard's hit flash -- which is a
  // visible hitch in the middle of play on a phone.
  // compile() skips hidden objects, so the paint ring is shown for the call
  if (GAME.paintball) { ensurePaintPool(); PAINT.pool[0].visible = true; }
  try { RENDER.renderer.compile(RENDER.scene, RENDER.camera); } catch (e) {}
  if (GAME.paintball) PAINT.pool[0].visible = false;
  GAME.lastTime = performance.now();
}

/* What a finished run earned: the tier's best time, and any cheat whose rule
   it met. A run with a cheat switched on earns neither -- it is on the record
   as played, not as a time. */
function recordResult(won) {
  var out = { newBest: false, unlocked: [] };
  if (!won || GAME.cheated) return out;
  var t = GAME.elapsed, tier = GAME.difficulty;
  if (!SAVE.best[tier] || t < SAVE.best[tier]) { SAVE.best[tier] = t; out.newBest = true; }
  var result = { tier: tier, time: t };
  for (var i = 0; i < CHEATS.length; i++) {
    var c = CHEATS[i];
    if (!SAVE.unlocked[c.id] && c.earned(result)) { SAVE.unlocked[c.id] = true; out.unlocked.push(c.name); }
  }
  writeSave();
  return out;
}

function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

function endMission(won, reason) {
  if (GAME.state === 'over') return;
  GAME.state = 'over';
  GAME.objectives.escaped = reason === 'escaped';
  exitPointerLock();
  releaseAllInput();
  setAlarmLoop(false);
  hudShow(false);
  sfxSting(won);

  var st = GAME.stats;
  var acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
  var tierName = CFG.difficulty[GAME.difficulty].name;
  setText('endTitle', won ? 'MISSION COMPLETE' : 'MISSION FAILED');
  document.getElementById('endTitle').className = won ? 'win' : 'lose';
  setText('endEyebrow', (won || reason === 'escaped' ? 'Extraction' : 'Signal lost') + ' · ' + tierName);
  setText('bigStat', fmtClock(GAME.elapsed));
  var text;
  if (won) text = GAME.alarm ? 'Out with the archive, but Blackgate logged the intrusion.'
                             : 'Out with the archive and no alarm on record. Textbook.';
  else if (reason === 'escaped') text = 'You made it out, but an objective was lost. The mission is a failure.';
  else if (reason === 'killed') text = 'The garrison put you down inside the facility.';
  else text = 'Mission aborted.';
  setText('endText', text);

  // one line per objective, GoldenEye style: completed, failed or incomplete
  var host = document.getElementById('endObjectives');
  if (host) {
    while (host.firstChild) host.removeChild(host.firstChild);
    var ol = activeObjectives();
    for (var oi = 0; oi < ol.length; oi++) {
      var o = ol[oi], row = document.createElement('div');
      row.className = 'kv';
      var name = document.createElement('span'); name.textContent = o.letter + '. ' + o.text;
      var state = document.createElement('b');
      var failed = o.failed && o.failed();
      var done = o.last ? GAME.objectives.escaped : (!failed && o.done());
      state.textContent = failed ? 'Failed' : (done ? 'Completed' : 'Incomplete');
      state.className = failed ? 'bad' : (done ? 'good' : '');
      row.appendChild(name); row.appendChild(state);
      host.appendChild(row);
    }
  }
  setText('endAlarm', GAME.alarm ? 'Raised' : 'Silent');
  setText('endKills', String(GAME.kills));
  setText('endAcc', acc + '%  (' + st.hits + '/' + st.shots + ')');
  setText('endZones', st.head + ' / ' + st.torso + ' / ' + st.limb);

  var rec = recordResult(won);
  var best = SAVE.best[GAME.difficulty];
  setText('endBest', GAME.cheated ? 'Not recorded (cheats on)'
    : (best ? fmtClock(best) + (rec.newBest ? '  NEW' : '') : '—'));
  setText('endUnlock', rec.unlocked.length ? 'Cheat unlocked: ' + rec.unlocked.join(', ') : '');
  showScreen('screenEnd');
}

function pauseGame() {
  if (GAME.state !== 'playing') return;
  GAME.state = 'paused';
  // The latch has to drop with the trigger. Leaving it set means the first
  // click after resuming is swallowed on any semi-automatic weapon; and a
  // thumb or key still held when the menu came up must not keep acting after it.
  releaseAllInput();
  exitPointerLock();
  audioSuspend();
  setText('pauseTime', fmtClock(GAME.elapsed));
  setText('pauseAlarm', GAME.alarm ? 'RAISED' : 'Silent');
  setText('pauseTier', CFG.difficulty[GAME.difficulty].name);
  var host = document.getElementById('pauseObjectives');
  if (host) {
    while (host.firstChild) host.removeChild(host.firstChild);
    var ol = activeObjectives();
    for (var i = 0; i < ol.length; i++) {
      var o = ol[i], row = document.createElement('div');
      row.className = 'kv';
      var n = document.createElement('span'); n.textContent = o.letter + '. ' + o.text;
      var b = document.createElement('b');
      var failed = o.failed && o.failed();
      b.textContent = failed ? 'Failed' : (o.constraint ? 'Holding' : (o.done() ? 'Done' : '—'));
      b.className = failed ? 'bad' : (!o.constraint && o.done() ? 'good' : '');
      row.appendChild(n); row.appendChild(b);
      host.appendChild(row);
    }
  }
  hudShow(false);
  showScreen('screenPause');
}
function resumeGame() {
  if (GAME.state !== 'paused') return;
  audioResume();
  GAME.state = 'playing';
  GAME.lastTime = performance.now();
  showScreen(null);
  hudShow(true);
}
function abortMission() {
  GAME.state = 'menu';
  releaseAllInput();
  hudShow(false);
  setAlarmLoop(false);
  showScreen('screenTitle');
}

/* The briefing is written from the same objective table the HUD reads, so a
   player choosing 00 Agent is told what the extra objectives are before
   committing rather than discovering them in the field. */
function renderBriefing() {
  var host = document.getElementById('briefObjectives');
  if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  var list = activeObjectives();
  for (var i = 0; i < list.length; i++) {
    var card = document.createElement('div');
    card.className = 'card';
    var h = document.createElement('h3');
    h.textContent = 'Objective ' + list[i].letter + (list[i].constraint ? ' · must not fail' : '');
    var para = document.createElement('p');
    para.textContent = list[i].brief;
    card.appendChild(h); card.appendChild(para);
    host.appendChild(card);
  }
  var best = SAVE.best[GAME.difficulty];
  setText('briefBest', best ? 'Best time on this tier: ' + fmtClock(best) : 'No time on record for this tier yet.');
}

/* Cheat list: every cheat is shown, locked ones with the rule that earns them. */
function renderCheats() {
  var host = document.getElementById('cheatList');
  if (!host) return;
  while (host.firstChild) host.removeChild(host.firstChild);
  for (var i = 0; i < CHEATS.length; i++) {
    (function (c) {
      var row = document.createElement('div');
      row.className = 'row';
      var label = document.createElement('label');
      label.textContent = c.name;
      var sub = document.createElement('div');
      sub.className = 'tiny';
      sub.textContent = SAVE.unlocked[c.id] ? 'Unlocked' : 'Locked — ' + c.rule;
      var left = document.createElement('div');
      left.appendChild(label); left.appendChild(sub);
      row.appendChild(left);
      var tog = document.createElement('button');
      tog.className = 'tog' + (cheatOn(c.id) ? ' on' : '');
      tog.id = 'cheat_' + c.id;
      tog.disabled = !SAVE.unlocked[c.id];
      tog.setAttribute('aria-label', c.name);
      tog.appendChild(document.createElement('i'));
      tog.addEventListener('click', function (e) {
        e.preventDefault();
        if (!SAVE.unlocked[c.id]) return;
        SAVE.cheatsOn[c.id] = !SAVE.cheatsOn[c.id];
        tog.classList.toggle('on', !!SAVE.cheatsOn[c.id]);
        ensureAudio(); sfxUI(!!SAVE.cheatsOn[c.id]);
        writeSave();
      }, false);
      row.appendChild(tog);
      host.appendChild(row);
    })(CHEATS[i]);
  }
}

var SCREENS = ['screenTitle', 'screenBriefing', 'screenControls', 'screenOptions', 'screenCheats',
               'screenPause', 'screenEnd', 'screenFatal'];
function showScreen(id) {
  for (var i = 0; i < SCREENS.length; i++) {
    var el = document.getElementById(SCREENS[i]);
    if (el) el.classList.toggle('on', SCREENS[i] === id);
  }
  GAME.screen = id;
}

/* ---------- simulation ----------
   One fixed step of the whole game, with no rendering and no clock reads, so
   the frame loop and the test harness drive exactly the same code. */
var DEATH_CAM = 1.6;       // seconds between the killing shot and the debrief
function simulate(dt) {
  GAME.elapsed += dt;
  var input = gatherInput(dt);
  if (PLAYER.alive) {
    updatePlayer(dt, input);
    updateWeapons(dt, input);
    updatePickups(dt);
  } else {
    // GoldenEye's death: the view drops and rolls while the world carries on
    GAME.dyingT += dt;
    var k = clamp(GAME.dyingT / 0.9, 0, 1);
    var cam = RENDER.camera;
    cam.position.set(PLAYER.pos.x, PLAYER.pos.y + lerp(PLAYER.eye, 0.35, k * k), PLAYER.pos.z);
    cam.rotation.set(PLAYER.pitch * (1 - k) + 0.35 * k, PLAYER.yaw, 1.2 * k * k);
    if (WEAPONS.viewGroup) WEAPONS.viewGroup.visible = false;
  }
  updateEnemies(dt);
  updateScreens(dt);
  updateDoors(dt);
  if (PLAYER.alive) {
    updateAimProbe();
    applyAimHighlight();
    updateInteraction(dt);
  }
  hudTick(dt);
  if (PLAYER.alive && checkExtraction()) endMission(!anyObjectiveFailed(), 'escaped');
  else if (checkLoss() && GAME.dyingT >= DEATH_CAM) endMission(false, 'killed');
}

/* ---------- frame ---------- */
function frame(now) {
  GAME.raf = requestAnimationFrame(frame);
  var raw = now - GAME.lastTime;
  GAME.lastTime = now;
  if (!isFinite(raw) || raw < 0) raw = 16.7;
  var frameMs = Math.min(raw, 250);
  var dt = Math.min(raw, 50) / 1000;      // clamp so a backgrounded tab cannot teleport anyone
  GAME.frameCount++;

  if (GAME.state === 'playing') simulate(dt);

  if (GAME.booted) {
    if ((GAME.frameCount & 7) === 0) {
      updateLightPool(RENDER.camera.position);
      updateEnemyShadowCulling(RENDER.camera.position);
    }
    updateLighting(dt, GAME.alarm, GAME.elapsed);
    updateRenderScale(dt, frameMs);
    renderFrame();
  }
}

/* ---------- settings ----------
   Every control on the options screen reads from and writes to SAVE.settings,
   which is persisted; applySettings pushes the record into the running game. */
function applySettings() {
  var s = SAVE.settings;
  INPUT.sensitivity = s.sensitivity;
  INPUT.invertY = s.invertY;
  INPUT.lookMode = s.lookMode;
  setMasterVolume(s.volume);
  setBloomEnabled(s.bloom);
  if (RENDER.shadowsEnabled !== s.shadows) setShadowsEnabled(s.shadows);
  GAME.showStats = s.stats;
  var fps = document.getElementById('fpsCounter');
  if (fps) fps.classList.toggle('on', s.stats);
}
function syncOptionsUI() {
  var s = SAVE.settings;
  var sens = document.getElementById('rngSens'); if (sens) sens.value = String(Math.round(s.sensitivity * 100));
  var vol = document.getElementById('rngVol'); if (vol) vol.value = String(Math.round(s.volume * 100));
  var pairs = { togInvert: s.invertY, togBloom: s.bloom, togShadow: s.shadows, togStats: s.stats,
                togSwipe: s.lookMode === 'swipe' };
  for (var id in pairs) { var el = document.getElementById(id); if (el) el.classList.toggle('on', !!pairs[id]); }
  var fs = document.getElementById('rowFullscreen');
  if (fs) fs.style.display = fullscreenSupported() ? '' : 'none';
}

function fullscreenSupported() {
  var d = document.documentElement;
  return !!(d.requestFullscreen || d.webkitRequestFullscreen);
}
function toggleFullscreen() {
  try {
    var d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      var p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  } catch (e) {}
}

/* ---------- wiring ---------- */
function bindUI() {
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) { e.preventDefault(); ensureAudio(); sfxUI(true); fn(); }, false);
  }
  on('btnStart', function () { renderBriefing(); showScreen('screenBriefing'); });
  on('btnBriefStart', function () { startMission(); });
  on('btnBriefBack', function () { showScreen('screenTitle'); });
  on('btnControlsScreen', function () { GAME.uiBack = 'screenTitle'; showScreen('screenControls'); });
  on('btnControlsBack', function () { showScreen(GAME.uiBack || 'screenTitle'); });
  on('btnOptions', function () { GAME.uiBack = 'screenTitle'; syncOptionsUI(); showScreen('screenOptions'); });
  on('btnPauseOptions', function () { GAME.uiBack = 'screenPause'; syncOptionsUI(); showScreen('screenOptions'); });
  on('btnOptionsBack', function () { writeSave(); showScreen(GAME.uiBack || 'screenTitle'); });
  on('btnCheats', function () { renderCheats(); showScreen('screenCheats'); });
  on('btnCheatsBack', function () { showScreen('screenTitle'); });
  on('btnResume', function () { resumeGame(); });
  on('btnAbort', function () { abortMission(); });
  on('btnPlayAgain', function () { startMission(); });
  on('btnEndTitle', function () { GAME.state = 'menu'; showScreen('screenTitle'); });
  on('btnFatalReload', function () { try { location.reload(); } catch (e) {} });
  on('btnFullscreen', function () { toggleFullscreen(); });
  on('btnErase', function () {
    var el = document.getElementById('btnErase');
    // two taps: the first arms it, so a stray tap cannot wipe a save
    if (!el.classList.contains('armed')) {
      el.classList.add('armed');
      el.firstElementChild.textContent = 'Tap again to erase';
      return;
    }
    el.classList.remove('armed');
    el.firstElementChild.textContent = 'Erase save data';
    eraseSave();
    applySettings(); syncOptionsUI();
  });

  var diff = document.getElementById('selDiff');
  if (diff) diff.addEventListener('change', function () {
    GAME.difficulty = clamp(parseInt(diff.value, 10) || 0, 0, 2);
    renderBriefing();      // the tier decides the objective list, so show it
  }, false);

  var sens = document.getElementById('rngSens');
  if (sens) sens.addEventListener('input', function () {
    SAVE.settings.sensitivity = clamp(parseInt(sens.value, 10) / 100, 0.3, 2.6); applySettings();
  }, false);
  var vol = document.getElementById('rngVol');
  if (vol) vol.addEventListener('input', function () {
    SAVE.settings.volume = clamp(parseInt(vol.value, 10) / 100, 0, 1); applySettings();
  }, false);

  function toggle(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var on2 = !el.classList.contains('on');
      el.classList.toggle('on', on2);
      ensureAudio(); sfxUI(on2);
      fn(on2);
      applySettings();
    }, false);
  }
  toggle('togInvert', function (v) { SAVE.settings.invertY = v; });
  toggle('togBloom', function (v) { SAVE.settings.bloom = v; });
  toggle('togShadow', function (v) { SAVE.settings.shadows = v; });
  toggle('togStats', function (v) { SAVE.settings.stats = v; });
  toggle('togSwipe', function (v) { SAVE.settings.lookMode = v ? 'swipe' : 'stick'; });

  window.addEventListener('resize', function () { resizeRenderer(); }, false);
  window.addEventListener('orientationchange', function () { setTimeout(resizeRenderer, 250); }, false);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (GAME.state === 'playing') pauseGame(); audioSuspend(); }
    else GAME.lastTime = performance.now();
  }, false);
  window.addEventListener('blur', function () { if (GAME.state === 'playing') pauseGame(); }, false);
  window.addEventListener('pagehide', function () { writeSave(); }, false);
}

function init() {
  loadSave();
  if (!bootWorld()) return;      // fatal screen already shown
  initInput();
  bindUI();
  applySettings();
  syncOptionsUI();
  var diff = document.getElementById('selDiff');
  if (diff) diff.value = String(GAME.difficulty);
  renderBriefing();
  hudShow(false);
  showScreen('screenTitle');
  GAME.lastTime = performance.now();
  GAME.raf = requestAnimationFrame(frame);
}

init();
