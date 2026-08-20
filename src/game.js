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
    exposure: 1.2, downgradeMs: 22,
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
  saveKey: 'blackgate.save.v1'
};

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
  objectives: { terminal: false, escaped: false },
  noise: null, frameCount: 0, lastTime: 0, raf: 0,
  showStats: false, booted: false, best: 0
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
  loadBest();
  GAME.booted = true;
  return true;
}

/* localStorage is wrapped: Safari private mode throws on write. */
function saveBest() {
  try { window.localStorage.setItem(CFG.saveKey, JSON.stringify({ best: GAME.best })); } catch (e) {}
}
function loadBest() {
  try {
    var raw = window.localStorage.getItem(CFG.saveKey);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (o && typeof o.best === 'number' && isFinite(o.best) && o.best > 0 && o.best < 86400) GAME.best = o.best;
  } catch (e) { GAME.best = 0; }
}

/* ---------- objectives, win and loss ---------- */
function checkWin() {
  return GAME.objectives.terminal && playerIsAtExit();
}
function checkLoss() {
  return player.health <= 0;
}
function playerIsAtExit() {
  if (!LEVEL) return false;
  var e = LEVEL.spawnPoints.exit;
  return Math.hypot(PLAYER.pos.x - e.x, PLAYER.pos.z - e.z) < 2.6;
}

function updateInteraction(dt) {
  var t = LEVEL.terminal;
  var prompt = null;
  var d = Math.hypot(PLAYER.pos.x - t.pos.x, PLAYER.pos.z - t.pos.z);
  if (!t.used && d < 2.8 && Math.abs(PLAYER.pos.y + PLAYER.eye - t.pos.y) < 2.4) {
    if (INPUT.interact) {
      PLAYER.interactHold += dt;
      if (PLAYER.interactHold >= 1.2) {
        completeTerminal();
      }
    } else PLAYER.interactHold = Math.max(0, PLAYER.interactHold - dt * 2);
    var bar = '';
    var n = Math.round(clamp(PLAYER.interactHold / 1.2, 0, 1) * 10);
    for (var i = 0; i < 10; i++) bar += (i < n ? '█' : '░');
    prompt = 'HOLD USE · DOWNLOAD ' + bar;
  } else if (GAME.objectives.terminal && playerIsAtExit()) {
    prompt = 'EXIT REACHED';
  }
  hudPrompt(prompt);
}

function completeTerminal() {
  var t = LEVEL.terminal;
  if (t.used) return;
  t.used = true;
  GAME.objectives.terminal = true;
  PLAYER.interactHold = 0;
  t.screen.material = MAT.ledGreen;
  t.led.material = MAT.ledGreen;
  sfxTerminal();
  hudToast('Research archive downloaded. The plant exit is unlocked.');
  hudUpdateObjectives();
  // unlock the exit doors
  for (var i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    if (d.locked) { d.locked = false; d.lamp.material = MAT.ledGreen; }
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
  MAT.screen = new THREE.MeshStandardMaterial({
    color: 0x0a1a22, emissive: CFG.colors.screenGlow, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0
  });
  MAT.screenAmber = new THREE.MeshStandardMaterial({
    color: 0x1a1206, emissive: CFG.colors.objectiveGlow, emissiveIntensity: 1.7, roughness: 0.4, metalness: 0
  });
  MAT.ledRed = new THREE.MeshStandardMaterial({ color: 0x220407, emissive: 0xff2d3c, emissiveIntensity: 2.0, roughness: 0.5 });
  MAT.ledDim = new THREE.MeshStandardMaterial({ color: 0x1a0405, emissive: 0x3a0a0e, emissiveIntensity: 0.3, roughness: 0.5 });
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
  start: { x: 3, z: 3 },
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

    var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), dr.locked ? MAT.ledRed : MAT.ledGreen);
    lamp.position.set(wx + CELL / 2 - 0.4, 2.2, wz + 0.14);
    props.add(lamp);

    var door = {
      tag: dr.tag, mesh: mesh, lamp: lamp, locked: !!dr.locked, open: 0, target: 0,
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
    live(MAT.ledGreen, 0.14, 0.14, 0.06, vx + 1.32, 1.7, vz, false);
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

  // exit signage
  live(MAT.exitSign, 0.9, 0.28, 0.06, cellToWorldX(6.5), 2.6, cellToWorldZ(26) + 1.9, false);
  live(MAT.exitSign, 0.7, 0.24, 0.06, cellToWorldX(3.5), 2.6, cellToWorldZ(6) - 1.9, false);
  live(MAT.exitSign, 0.7, 0.24, 0.06, cellToWorldX(9), 2.6, cellToWorldZ(70 / CELL - 0.5) , false);

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

  // Raycast set: merged statics plus the live prop meshes. Shots and sight
  // checks test these, and nothing else.
  level.raycastTargets = level.meshes.slice();
  group.traverse(function (o) { if (o.isMesh) level.raycastTargets.push(o); });
  return level;
}

/* Guard and lab-staff placement with their patrol routes, in cell coordinates. */
function cellVec(x, z) { return new THREE.Vector3(cellToWorldX(x), 0, cellToWorldZ(z)); }

var SPAWNS = [
  // bathroom pair
  { kind: 'guard', at: [2, 4], patrol: [[2, 4], [4, 2], [2, 2], [4, 4]] },
  { kind: 'guard', at: [4, 5], patrol: [[4, 5], [2, 5], [3, 3]] },
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
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var old = ENEMIES.list[i];
    RENDER.scene.remove(old.group);
    old.group.traverse(function (o) {
      if (o.isMesh && o.geometry) o.geometry.dispose();   // materials are shared, geometry is not
    });
  }
  ENEMIES.list.length = 0;
  for (i = 0; i < SPAWNS.length; i++) {
    var s = SPAWNS[i];
    var pts = [];
    for (var p = 0; p < s.patrol.length; p++) pts.push(cellVec(s.patrol[p][0], s.patrol[p][1]));
    var e = new Enemy(cellVec(s.at[0], s.at[1]), pts, s.kind);
    e.sightPhase = i & 1;          // half the roster does its sight check each frame
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
    light.visible = false;
    scene.add(light);
    RENDER.lightPool.push({ light: light, fixture: -1, casts: i < shadowCount, side: (i % 2) ? 1 : -1 });
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
    if (fixtureIdx < 0) { slot.light.visible = false; slot.fixture = -1; continue; }
    if (slot.fixture !== fixtureIdx) {
      slot.fixture = fixtureIdx;
      slot.light.position.copy(pts[fixtureIdx]);
      slot.light.position.x += slot.side * 0.6;      // flank the fixture body
    }
    var d2 = pts[fixtureIdx].distanceToSquared(camPos);
    slot.light.visible = d2 < 260;
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
    RENDER.lightPool[i].light.color.copy(col);
    RENDER.lightPool[i].light.intensity = intensity;
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
  quality: 'high', frameSamples: [], sampleIdx: 0, downgraded: false, stage: 0
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
   resolution if that was not enough, which is what keeps a phone above 45fps. */
function updateRenderScale(dt, frameMs) {
  RENDER.frameMs += (frameMs - RENDER.frameMs) * 0.08;

  GFX.frameSamples[GFX.sampleIdx % 60] = frameMs;
  GFX.sampleIdx++;
  if (GFX.sampleIdx % 60 !== 0 || GFX.frameSamples.length < 60) return;

  var sum = 0;
  for (var i = 0; i < 60; i++) sum += GFX.frameSamples[i];
  var avg = sum / 60;

  if (avg > CFG.gfx.downgradeMs) {
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
    noiseRadius: 0, alive: true,
    fovPunch: 0, fovCurrent: CFG.camera.fov,
    shotsFired: 0, shotsHit: 0, kills: 0,
    lastDamageAt: -99, interactTarget: null, interactHold: 0
  };
}

/* AABB for the player body at a given feet position. */
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
  var speed = CFG.player.walkSpeed;
  if (P.crouch) speed *= CFG.player.crouchMul;
  else if (P.sprinting) speed *= CFG.player.sprintMul;

  var sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  var wishX = (mx * cos - mz * sin) * speed;
  var wishZ = (mx * sin + mz * cos) * speed;
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
      GAME.noise = { x: P.pos.x, z: P.pos.z, r: P.noiseRadius, t: 0.4 };
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
  if (Math.abs(cam.fov - P.fovCurrent) > 0.01) {
    cam.fov = P.fovCurrent;
    cam.updateProjectionMatrix();
  }
}

function damagePlayer(amount, fromPos) {
  var P = PLAYER;
  if (!P.alive || GAME.state !== 'playing') return;
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
  hudFlashDamage();
  hudUpdateVitals();
  if (P.health <= 0) {
    P.health = 0; P.alive = false;
    endMission(false, 'killed');
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
  flashQuad: null, flashTimer: 0
};
var weapons = null;          // the array the test suite inspects
var currentWeapon = null;

function buildWeapons() {
  WEAPONS.list = [
    {
      id: 'pp7', name: 'PP7', slot: 1,
      damage: 25, auto: false, rps: 4.5, magSize: 7, ammoInMag: 7,
      reserve: Infinity, infiniteReserve: true, reloadTime: 1.15,
      spread: 0.006, aimSpread: 0.0015, recoil: 0.9, range: 60,
      suppressed: true, noise: CFG.ai.suppressedHearing, sound: 'pp7'
    },
    {
      id: 'kf7', name: 'KF7 SOVIET', slot: 2,
      damage: 15, auto: true, rps: 10, magSize: 30, ammoInMag: 30,
      reserve: 120, infiniteReserve: false, reloadTime: 2.1,
      spread: 0.028, aimSpread: 0.011, recoil: 1.5, range: 55,
      suppressed: false, noise: CFG.ai.hearingRadius, sound: 'kf7'
    },
    {
      id: 'mine', name: 'PROXIMITY MINE', slot: 3,
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
  WEAPONS.index = idx;
  currentWeapon = WEAPONS.list[idx];
  WEAPONS.reloading = 0;
  for (var i = 0; i < WEAPONS.viewModels.length; i++) WEAPONS.viewModels[i].visible = (i === idx);
  sfxReload('in');
  hudUpdateAmmo();
}
function cycleWeapon(dir) {
  var n = WEAPONS.list.length;
  switchWeapon(((WEAPONS.index + dir) % n + n) % n);
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
  hudUpdateAmmo();
}

/* Hitscan. Enemies and the level are both tested; nearest hit wins so nobody
   ever shoots through a wall. */
var _ray = null, _screenCentre = null;
function fireWeapon() {
  var w = currentWeapon;
  if (!w) return false;
  if (WEAPONS.cooldown > 0 || WEAPONS.reloading > 0) return false;
  if (w.thrown) return placeMine();
  if (w.ammoInMag <= 0) {
    if (w.infiniteReserve || w.reserve > 0) reloadWeapon();
    return false;
  }

  w.ammoInMag--;
  WEAPONS.cooldown = 1 / w.rps;
  WEAPONS.recoil = w.recoil;
  PLAYER.shotsFired++;
  PLAYER.fovPunch = 3;                       // FOV punch, never camera shake
  hudShotFired();
  WEAPONS.lastFireAt = GAME.elapsed;

  if (!_ray) { _ray = new THREE.Raycaster(); _screenCentre = new THREE.Vector2(0, 0); }
  var cam = RENDER.camera;
  _ray.setFromCamera(_screenCentre, cam);
  _ray.far = w.range;

  // apply spread to the ray direction
  var spread = WEAPONS.aiming ? w.aimSpread : w.spread;
  if (PLAYER.crouch) spread *= 0.7;
  if (PLAYER.sprinting) spread *= 2.2;
  _ray.ray.direction.x += randRange(-spread, spread);
  _ray.ray.direction.y += randRange(-spread, spread);
  _ray.ray.direction.z += randRange(-spread, spread);
  _ray.ray.direction.normalize();

  var enemyHit = null, enemyDist = Infinity, enemyPoint = null;
  var meshes = [];
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var e = ENEMIES.list[i];
    if (e.state === 'DEAD') continue;
    meshes.push(e.hitMesh);
  }
  var hits = _ray.intersectObjects(meshes, true);
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
    var headshot = enemyPoint.y > enemyHit.group.position.y + 1.45;
    var dmg = w.damage * (headshot ? 2.5 : 1);
    enemyHit.takeDamage(dmg, PLAYER.pos);
    spawnImpactEffect(enemyPoint, hits[0].face ? hits[0].face.normal : null, true);
    sfxFlesh(enemyPoint);
    PLAYER.shotsHit++;
    hudHitMarker(headshot);
  } else if (wallHits.length) {
    var wp = wallHits[0];
    spawnImpactEffect(wp.point, wp.face ? wp.face.normal : null, false);
    sfxImpact(wp.point, true);
  }
  hudUpdateAmmo();
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
function flashMuzzle(pos) {
  WEAPONS.muzzleLight.position.copy(pos);
  WEAPONS.muzzleLight.color.setHex(0xff8800);
  WEAPONS.muzzleLight.distance = 4;
  WEAPONS.muzzleLight.intensity = 10;
  WEAPONS.flashTimer = CFG.gfx.muzzleFlashMs / 1000;
  if (WEAPONS.flashQuad) {
    WEAPONS.flashQuad.visible = true;
    WEAPONS.flashQuad.scale.setScalar(0.01);
    WEAPONS.flashQuad.rotation.z = randRange(0, Math.PI);
  }
}

/* ---------- proximity mines ---------- */
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
  w.ammoInMag--;
  WEAPONS.cooldown = 1 / w.rps;

  var mineGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.03, 16, 1);
  mineGeo.rotateX(Math.PI / 2);
  var mesh = new THREE.Mesh(mineGeo, MAT.hazard);
  mesh.position.copy(pos).addScaledVector(normal, 0.05);
  mesh.lookAt(pos.clone().add(normal));
  mesh.castShadow = true;
  RENDER.scene.add(mesh);
  var led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), MAT.ledRed);
  led.position.set(0.03, 0.02, 0.03);
  mesh.add(led);

  WEAPONS.mines.push({ mesh: mesh, led: led, pos: mesh.position.clone(), armTime: 1.0, beep: 0, live: true });
  sfxMinePlant(mesh.position);
  hudUpdateAmmo();
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
  WEAPONS.muzzleLight.position.copy(m.pos);
  WEAPONS.muzzleLight.intensity = 26;
  RENDER.scene.remove(m.mesh);
  m.mesh.geometry.dispose();
  WEAPONS.mines.splice(idx, 1);
}

function updateWeapons(dt, input) {
  if (WEAPONS.cooldown > 0) WEAPONS.cooldown -= dt;
  if (WEAPONS.reloading > 0) {
    WEAPONS.reloading -= dt;
    if (WEAPONS.reloading <= 0) { WEAPONS.reloading = 0; finishReload(); }
  }
  WEAPONS.aiming = !!input.aim && !PLAYER.sprinting;

  // Muzzle flash: light is binary for 80ms; the quad scales 0->1 over the first
  // 30ms then 1->0 over the next 30ms, synchronised with it.
  if (WEAPONS.flashTimer > 0) {
    WEAPONS.flashTimer -= dt;
    var elapsedMs = CFG.gfx.muzzleFlashMs - WEAPONS.flashTimer * 1000;
    if (WEAPONS.flashQuad) {
      var q = WEAPONS.flashQuad, k;
      if (elapsedMs <= 30) k = clamp(elapsedMs / 30, 0, 1);
      else if (elapsedMs <= 60) k = clamp(1 - (elapsedMs - 30) / 30, 0, 1);
      else k = 0;
      q.scale.setScalar(Math.max(0.01, k));
      q.visible = k > 0.02;
    }
    if (WEAPONS.flashTimer <= 0) {
      WEAPONS.flashTimer = 0;
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

var ENEMIES = { list: [], sightTick: 0 };

var Enemy = function (position, patrolPoints, kind) {
  this.kind = kind || 'guard';
  this.state = 'PATROL';
  this.health = this.kind === 'scientist' ? 55 : 100;
  this.maxHealth = this.health;
  this.patrolPoints = patrolPoints || [];
  this.currentPatrolIdx = 0;
  this.lastKnownPlayerPos = null;
  this.stateClock = 0;
  this.alertness = 0;
  this.canSee = false;
  this.yaw = 0;
  this.fireClock = randRange(0.2, 0.9);
  this.burst = 0;
  this.pauseClock = 0;
  this.deathClock = 0;
  this.speed = this.kind === 'scientist' ? 3.4 : 2.1;
  this.chaseSpeed = this.kind === 'scientist' ? 4.4 : 3.4;
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
  // The part sizes below are exactly as specified; they are seated so the body
  // is continuous, then the whole assembly is scaled to the 1.75m capsule the
  // AI and hit detection already use. Scaling preserves the given proportions.
  var body = new THREE.Group();
  this.body = body;
  this.torso = part(0.45, 0.55, 0.25, 0, 0.745, 0, isSci ? MAT.labCoat : MAT.enemyTorso);
  this.head  = part(0.28, 0.28, 0.28, 0, 1.160, 0, MAT.enemySkin);
  this.legL  = part(0.17, 0.45, 0.20, -0.12, 0.245, 0, pants);
  this.legR  = part(0.17, 0.45, 0.20, 0.12, 0.245, 0, pants);
  this.armL  = part(0.14, 0.35, 0.14, -0.295, 0.80, 0, uniform);
  this.armR  = part(0.14, 0.35, 0.14, 0.295, 0.80, 0, uniform);
  body.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
  body.scale.setScalar(1.35);
  g.add(body);

  // torso and legs carry the silhouette; arms and head add nothing to a shadow
  this.head.castShadow = false; this.armL.castShadow = false; this.armR.castShadow = false;

  if (!isSci) {
    var beretGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12, 1);
    this.beret = new THREE.Mesh(beretGeo, MAT.enemyBeret);
    this.beret.position.set(0, 1.160 + 0.14, 0);
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
  this.alertDot.position.set(0, 1.92, 0);
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
  // enemy rather than nine.
  this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.75, 0.5),
    new THREE.MeshStandardMaterial({ visible: false }));
  this.hitMesh.position.set(0, 0.88, 0);
  this.hitMesh.userData.enemy = this;
  g.add(this.hitMesh);
  g.traverse((function (self) { return function (o) { o.userData.enemy = self; }; })(this));

  this.group = g;
  RENDER.scene.add(g);
};

/* White emissive flash on every part for 80ms, then back to black. Materials are
   shared between enemies, so each hit swaps in a per-enemy clone for the
   duration rather than tinting every guard in the level. */
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

Enemy.prototype.setState = function (s) {
  if (this.state === s) return;
  this.state = s;
  this.stateClock = 0;
  if (s === 'ATTACK') this.fireClock = CFG.difficulty[GAME.difficulty].reaction;
  // Committing to the player is what raises the alarm, from whichever state the
  // enemy got there — SEARCH can promote straight to ATTACK on sight.
  if ((s === 'CHASE' || s === 'ATTACK') && !GAME.alarm) raiseAlarm(this);
};

Enemy.prototype.eyePos = function () {
  return new THREE.Vector3(this.group.position.x, this.group.position.y + 1.56, this.group.position.z);
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
  var to = new THREE.Vector3(playerPos.x, playerPos.y + PLAYER.height * 0.6, playerPos.z);
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
    this.lastKnownPlayerPos = playerPos.clone();
    this.alertness = Math.min(1, this.alertness + dt * 2.2);
  } else {
    this.alertness = Math.max(0, this.alertness - dt * 0.25);
  }

  // hearing: gunfire and running footsteps
  if (GAME.noise && GAME.noise.t > 0 && this.state === 'PATROL') {
    var nd = Math.hypot(GAME.noise.x - this.group.position.x, GAME.noise.z - this.group.position.z);
    if (nd < GAME.noise.r) {
      this.lastKnownPlayerPos = new THREE.Vector3(GAME.noise.x, 0, GAME.noise.z);
      this.setState('SEARCH');
    }
  }

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
  if (this.moveToward(target, dt, this.speed)) {
    this.currentPatrolIdx = (this.currentPatrolIdx + 1) % this.patrolPoints.length;
    this.pauseClock = randRange(0.5, 1.8);
  }
};

Enemy.prototype.alert = function (dt) {
  this.applyYaw();
  if (this.lastKnownPlayerPos) this.faceToward(this.lastKnownPlayerPos, dt, 7);
  if (this.stateClock >= CFG.ai.alertPause) {
    if (!GAME.alarm) raiseAlarm(this);
    if (this.kind === 'scientist') this.setState('SEARCH');   // staff flee rather than close in
    else this.setState('CHASE');
  }
};

Enemy.prototype.chase = function (dt, playerPos) {
  var target = this.canSee ? playerPos : this.lastKnownPlayerPos;
  if (!target) { this.setState('SEARCH'); return; }
  var dist = this.group.position.distanceTo(target);
  if (this.kind === 'scientist') {
    // run away from the player, not toward
    var away = this.group.position.clone().sub(playerPos).normalize().multiplyScalar(6).add(this.group.position);
    this.moveToward(away, dt, this.chaseSpeed);
    if (!this.canSee && this.stateClock > 4) this.setState('SEARCH');
    return;
  }
  if (this.canSee && dist < CFG.ai.fireRange) { this.setState('ATTACK'); return; }
  if (this.moveToward(target, dt, this.chaseSpeed) && !this.canSee) this.setState('SEARCH');
  if (!this.canSee && this.stateClock > CFG.ai.searchTimeout) this.setState('SEARCH');
};

Enemy.prototype.attack = function (dt, playerPos) {
  this.faceToward(playerPos, dt, 9);
  if (!this.canSee) {
    if (this.stateClock > 1.2) this.setState('CHASE');
    return;
  }
  var dist = this.group.position.distanceTo(playerPos);
  if (dist > CFG.ai.fireRange * 1.1) { this.setState('CHASE'); return; }
  // strafe a little so they are not static targets
  var strafe = Math.sin(this.stateClock * 1.4 + this.group.position.x) * 0.7;
  var dir = new THREE.Vector3(playerPos.x - this.group.position.x, 0, playerPos.z - this.group.position.z).normalize();
  var side = new THREE.Vector3(-dir.z, 0, dir.x);
  var want = this.group.position.clone()
    .addScaledVector(side, strafe)
    .addScaledVector(dir, dist > 7 ? 0.8 : -0.4);
  this.moveToward(want, dt, this.speed * 0.9, true);

  this.fireClock -= dt;
  if (this.fireClock <= 0) {
    this.shoot(playerPos);
    this.burst--;
    if (this.burst > 0) this.fireClock = 0.12;
    else { this.burst = randRange(2, 4) | 0; this.fireClock = randRange(0.7, 1.5) * (2 - CFG.difficulty[GAME.difficulty].aim); }
  }
};

Enemy.prototype.search = function (dt) {
  if (this.canSee) { this.setState(this.kind === 'scientist' ? 'CHASE' : 'ATTACK'); return; }
  if (this.lastKnownPlayerPos) {
    if (this.moveToward(this.lastKnownPlayerPos, dt, this.speed * 1.1)) {
      this.lastKnownPlayerPos = null;
    }
  } else {
    this.yaw += Math.sin(this.stateClock * 1.6) * dt * 2.0;
    this.applyYaw();
  }
  if (this.stateClock > CFG.ai.searchTimeout) {
    this.setState('PATROL');
    this.lastKnownPlayerPos = null;
  }
};

Enemy.prototype.shoot = function (playerPos) {
  var from = this.eyePos();
  var to = new THREE.Vector3(playerPos.x, playerPos.y + PLAYER.height * 0.55, playerPos.z);
  sfxGunshot('enemy', this.group.position);
  makeNoise(this.group.position.x, this.group.position.z, CFG.ai.hearingRadius);
  WEAPONS.muzzleLight.position.copy(from).addScaledVector(to.clone().sub(from).normalize(), 0.5);
  WEAPONS.muzzleLight.intensity = 5;

  var aim = CFG.difficulty[GAME.difficulty].aim;
  var dist = from.distanceTo(to);
  var hitChance = clamp(0.72 * aim * (1 - dist / 40) * (PLAYER.crouch ? 0.8 : 1) * (PLAYER.sprinting ? 0.85 : 1), 0.06, 0.9);
  if (Math.random() < hitChance && hasLineOfSight(from, to)) {
    damagePlayer(randRange(6, 11), this.group.position);
  } else {
    // visible miss: spark off whatever is behind the player
    var dir = to.clone().sub(from).normalize();
    dir.x += randRange(-0.06, 0.06); dir.y += randRange(-0.04, 0.06); dir.z += randRange(-0.06, 0.06);
    var r = new THREE.Raycaster(from, dir.normalize(), 0.2, 30);
    var h = r.intersectObjects(LEVEL.raycastTargets, false);
    if (h.length) { spawnImpactEffect(h[0].point, h[0].face ? h[0].face.normal : null, false); sfxImpact(h[0].point, true); }
  }
};

Enemy.prototype.moveToward = function (target, dt, speed, noArrive) {
  var pos = this.group.position;
  var dx = target.x - pos.x, dz = target.z - pos.z;
  var dist = Math.hypot(dx, dz);
  if (dist < 0.55 && !noArrive) return true;
  if (dist < 0.001) return true;
  dx /= dist; dz /= dist;
  this.faceToward(target, dt, 6);

  var step = speed * dt;
  var nx = pos.x + dx * step, nz = pos.z + dz * step;
  // AABB slide against the level, same treatment the player gets
  var body = { minX: nx - 0.3, maxX: nx + 0.3, minY: pos.y + 0.1, maxY: pos.y + 1.7, minZ: nz - 0.3, maxZ: nz + 0.3 };
  var blockedX = false, blockedZ = false;
  for (var i = 0; i < LEVEL.collidables.length; i++) {
    var b = LEVEL.collidables[i];
    if (b.disabled) continue;
    if (aabbOverlap(body, b)) {
      var testX = { minX: nx - 0.3, maxX: nx + 0.3, minY: body.minY, maxY: body.maxY, minZ: pos.z - 0.3, maxZ: pos.z + 0.3 };
      var testZ = { minX: pos.x - 0.3, maxX: pos.x + 0.3, minY: body.minY, maxY: body.maxY, minZ: nz - 0.3, maxZ: nz + 0.3 };
      if (aabbOverlap(testX, b)) blockedX = true;
      if (aabbOverlap(testZ, b)) blockedZ = true;
    }
  }
  if (!blockedX) pos.x = nx;
  if (!blockedZ) pos.z = nz;
  // failsafe: an enemy that intends to move but cannot for two seconds is
  // nudged back onto its patrol node rather than grinding a corner forever
  if (blockedX && blockedZ) {
    this.stuck = (this.stuck || 0) + dt;
    if (this.stuck > 2) {
      this.stuck = 0;
      if (this.patrolPoints.length) {
        var p = this.patrolPoints[this.currentPatrolIdx % this.patrolPoints.length];
        pos.x = p.x; pos.z = p.z;
      }
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
Enemy.prototype.applyYaw = function () { this.group.rotation.y = this.yaw; };

Enemy.prototype.animate = function (dt) {
  if (this.hitFlashT > 0) {
    this.hitFlashT -= dt;
    if (this.hitFlashT <= 0) this.endHitFlash();
  }
  if (this.alertDot) {
    this.alertDot.visible = (this.state === 'ALERT' || this.state === 'ATTACK');
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

Enemy.prototype.takeDamage = function (amount, fromPos) {
  if (this.state === 'DEAD') return;
  this.startHitFlash();
  this.health -= amount;
  this.alertness = 1;
  if (fromPos) this.lastKnownPlayerPos = fromPos.clone ? fromPos.clone() : new THREE.Vector3(fromPos.x, 0, fromPos.z);
  if (this.health <= 0) { this.die(); return; }
  this.setState('ALERT');       // being shot always alerts, whatever it was doing
};

Enemy.prototype.die = function () {
  this.state = 'DEAD';
  this.endHitFlash();
  if (this.alertDot) this.alertDot.visible = false;
  this.deathClock = 0;
  this.health = 0;
  this.hitMesh.userData.enemy = null;
  sfxEnemyDeath(this.group.position);
  PLAYER.kills++;
  GAME.kills++;
  if (!GAME.alarm && this.kind !== 'scientist') {
    // a body found later is not modelled; dying quietly is the reward for the PP7
    GAME.bodies++;
  }
  hudUpdateObjectives();
};

Enemy.prototype.updateDeath = function (dt) {
  this.deathClock += dt;
  // linear interpolation to -PI/2 over 400ms, driven from the update loop
  var t = Math.min(1, this.deathClock / 0.4);
  this.group.rotation.x = -t * (Math.PI / 2);
  if (this.deathClock > 12 && this.group.visible) this.group.visible = false;
};

function hasLineOfSight(from, to) {
  var dir = to.clone().sub(from);
  var dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  var ray = new THREE.Raycaster(from, dir, 0.05, dist - 0.05);
  var hits = ray.intersectObjects(LEVEL.raycastTargets, false);
  return hits.length === 0;
}

function makeNoise(x, z, radius) {
  GAME.noise = { x: x, z: z, r: radius, t: 0.4 };
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
    if (source && source.lastKnownPlayerPos) e.lastKnownPlayerPos = source.lastKnownPlayerPos.clone();
    else e.lastKnownPlayerPos = PLAYER.pos.clone();
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
  if (GAME.noise && GAME.noise.t > 0) GAME.noise.t -= dt;
  for (var i = 0; i < ENEMIES.list.length; i++) ENEMIES.list[i].update(dt, PLAYER.pos);
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
  mouseDX: 0, mouseDY: 0,          // pending mouse/drag delta
  stickLookX: 0, stickLookY: 0,    // normalised right-stick deflection
  fire: false, fireLatched: false, aim: false, crouch: false, sprint: false,
  interact: false, invertY: false, sensitivity: 1.0,
  keys: {}, pointerLocked: false, mouseDown: false, usingTouch: false
};

var TOUCH = {
  deadZone: 8, maxRadius: 60, expo: 1.5,
  lookRate: 2.6,          // radians/second at full deflection
  left: { id: -1, ox: 0, oy: 0, x: 0, y: 0 },
  right: { id: -1, ox: 0, oy: 0, x: 0, y: 0 },
  els: {}
};

/* The exact pipeline the brief specifies: raw offset, radial dead zone,
   expo curve, normalise, scale. */
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
  document.addEventListener('pointerlockchange', function () {
    INPUT.pointerLocked = (document.pointerLockElement === canvas);
  }, false);
  window.addEventListener('wheel', function (e) {
    if (GAME.state !== 'playing') return;
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  // ---------- touch ----------
  var opts = { passive: false };
  canvas.addEventListener('touchstart', onTouchStart, opts);
  canvas.addEventListener('touchmove', onTouchMove, opts);
  canvas.addEventListener('touchend', onTouchEnd, opts);
  canvas.addEventListener('touchcancel', onTouchEnd, opts);
  var tl = document.getElementById('touch');
  tl.addEventListener('touchstart', onTouchStart, opts);
  tl.addEventListener('touchmove', onTouchMove, opts);
  tl.addEventListener('touchend', onTouchEnd, opts);
  tl.addEventListener('touchcancel', onTouchEnd, opts);

  bindHoldButton('btnFire', function (down) { INPUT.fire = down; if (!down) INPUT.fireLatched = false; });
  bindHoldButton('btnUse', function (down) { INPUT.interact = down; });
  bindTapButton('btnWeap', function () { cycleWeapon(1); });
  bindTapButton('btnCrouch', function () { INPUT.crouch = !INPUT.crouch; });
  bindTapButton('btnPause', function () { if (GAME.state === 'playing') pauseGame(); });

  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opts);
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, opts);
}

function isButtonTarget(el) {
  return el && el.classList && el.classList.contains('tbtn');
}
function onTouchStart(e) {
  if (GAME.state !== 'playing') return;
  INPUT.usingTouch = true;
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (isButtonTarget(t.target)) continue;          // buttons handle themselves
    var leftHalf = t.clientX < window.innerWidth * 0.45;
    var stick = leftHalf ? TOUCH.left : TOUCH.right;
    if (stick.id !== -1) continue;
    stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = 0; stick.y = 0;
    var el = leftHalf ? TOUCH.els.stickL : TOUCH.els.stickR;
    el.style.left = t.clientX + 'px'; el.style.top = t.clientY + 'px';
    el.classList.add('on');
    el.firstElementChild.style.left = '40px';
    el.firstElementChild.style.top = '40px';
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
    var dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
    var v = applyStick(dx, dy);
    stick.x = v.x; stick.y = v.y; stick.mag = v.mag;

    var el = isLeft ? TOUCH.els.stickL : TOUCH.els.stickR;
    var mag = Math.min(Math.hypot(dx, dy), TOUCH.maxRadius);
    var ang = Math.atan2(dy, dx);
    el.firstElementChild.style.left = (40 + Math.cos(ang) * mag * 0.62) + 'px';
    el.firstElementChild.style.top = (40 + Math.sin(ang) * mag * 0.62) + 'px';
    if (isLeft) el.classList.toggle('sprint', v.mag > 0.85);
  }
  e.preventDefault();
}
function onTouchEnd(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var id = e.changedTouches[i].identifier;
    if (id === TOUCH.left.id) {
      TOUCH.left.id = -1; TOUCH.left.x = 0; TOUCH.left.y = 0; TOUCH.left.mag = 0;
      TOUCH.els.stickL.classList.remove('on', 'sprint');
    } else if (id === TOUCH.right.id) {
      TOUCH.right.id = -1; TOUCH.right.x = 0; TOUCH.right.y = 0; TOUCH.right.mag = 0;
      TOUCH.els.stickR.classList.remove('on');
    }
  }
  e.preventDefault();
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
function bindTapButton(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', function (e) {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('press'); fn();
  }, { passive: false });
  el.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.remove('press'); }, { passive: false });
  el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }, false);
}

function onKeyDown(e) {
  var k = e.key.toLowerCase();
  if (INPUT.keys[k]) return;
  INPUT.keys[k] = true;
  INPUT.usingTouch = false;
  if (k === 'escape') { if (GAME.state === 'playing') pauseGame(); else if (GAME.state === 'paused') resumeGame(); }
  if (GAME.state !== 'playing') return;
  if (k === 'c') INPUT.crouch = !INPUT.crouch;
  if (k === 'r') reloadWeapon();
  if (k === 'q') cycleWeapon(-1);
  if (k === 'e' && !e.repeat) INPUT.interact = true;
  if (k === '1') switchWeapon(0);
  if (k === '2') switchWeapon(1);
  if (k === '3') switchWeapon(2);
  if (k === ' ') e.preventDefault();
}
function onKeyUp(e) {
  var k = e.key.toLowerCase();
  INPUT.keys[k] = false;
  if (k === 'e') INPUT.interact = false;
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
  // Pointer lock where it exists; a plain drag everywhere else (iOS has no lock)
  if (INPUT.pointerLocked || INPUT.mouseDown) {
    INPUT.mouseDX += e.movementX || 0;
    INPUT.mouseDY += e.movementY || 0;
  }
}
function requestPointerLock() {
  var canvas = document.getElementById('c');
  var fn = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
  if (fn) { try { fn.call(canvas); } catch (e) {} }
}
function exitPointerLock() { try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {} }

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

  var sens = INPUT.sensitivity;
  var mouseLookX = INPUT.mouseDX * 0.0022 * sens;
  var mouseLookY = INPUT.mouseDY * 0.0022 * sens;
  INPUT.mouseDX = 0; INPUT.mouseDY = 0;

  var stickLookX = (TOUCH.right.x || 0) * TOUCH.lookRate * sens * dt;
  var stickLookY = (TOUCH.right.y || 0) * TOUCH.lookRate * sens * dt;

  INPUT.lookX = mouseLookX + stickLookX;
  INPUT.lookY = mouseLookY + stickLookY;
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
  crossGap: 0, crossGapTarget: 0
};

function initHUD() {
  var ids = ['hud', 'touch', 'dmgVig', 'lowHpVig', 'objText', 'alertBox',
             'interactPrompt', 'toast', 'fpsCounter'];
  for (var i = 0; i < ids.length; i++) HUD.el[ids[i]] = document.getElementById(ids[i]);

  HUD.canvas = document.getElementById('hudCanvas');
  HUD.ctx = HUD.canvas ? HUD.canvas.getContext('2d') : null;

  // objective rows are created once; updates only touch className
  HUD.el.objText.innerHTML = '';
  HUD.objRows = [];
  var labels = ['A. Download research archive', 'B. Exit through the chemical plant'];
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

function hudShow(on) {
  HUD.el.hud.classList.toggle('on', !!on);
  HUD.el.touch.classList.toggle('on', !!on);
  if (HUD.canvas) HUD.canvas.style.display = on ? 'block' : 'none';
}

/* These stay as entry points so the rest of the game is untouched; the canvas
   pass reads live state every frame, so they only need to nudge timers. */
function hudUpdateVitals() {}
function hudUpdateAmmo() {}
function hudSyncWeapon() {}
function hudUpdateObjectives() {
  if (!HUD.built) return;
  HUD.objRows[0].className = GAME.objectives.terminal ? 'done' : '';
  HUD.objRows[1].className = GAME.objectives.escaped ? 'done' : '';
}
function hudAlert(text) {
  if (!HUD.built) return;
  HUD.el.alertBox.textContent = text;
  HUD.el.alertBox.style.opacity = '1';
  HUD.alertTimer = 3.0;
}
function hudHitMarker(head) {
  HUD.hitTimer = head ? 0.16 : 0.12;
}
/* Crosshair kicks open 8px on firing and closes back over 300ms. */
function hudShotFired() {
  HUD.crossGap = 8;
}
function hudFlashDamage() {
  if (!HUD.built) return;
  HUD.el.dmgVig.style.opacity = '1';
  HUD.dmgTimer = 0.16;
}
function hudToast(msg) {
  if (!HUD.built) return;
  HUD.el.toast.textContent = msg;
  HUD.el.toast.style.opacity = '1';
  HUD.toastTimer = 3.4;
}
function hudPrompt(text) {
  if (!HUD.built) return;
  var el = HUD.el.interactPrompt, btn = document.getElementById('btnUse');
  if (!text) { el.classList.remove('on'); btn.classList.remove('on'); return; }
  el.classList.add('on'); btn.classList.add('on');
  el.textContent = text;
}

function hudTick(dt) {
  if (!HUD.built) return;
  if (HUD.alertTimer > 0) { HUD.alertTimer -= dt; if (HUD.alertTimer <= 0) HUD.el.alertBox.style.opacity = '0'; }
  if (HUD.hitTimer > 0) HUD.hitTimer -= dt;
  if (HUD.dmgTimer > 0) { HUD.dmgTimer -= dt; if (HUD.dmgTimer <= 0) HUD.el.dmgVig.style.opacity = '0'; }
  if (HUD.toastTimer > 0) { HUD.toastTimer -= dt; if (HUD.toastTimer <= 0) HUD.el.toast.style.opacity = '0'; }

  var low = PLAYER.health < 35 ? clamp((35 - PLAYER.health) / 35, 0, 1) : 0;
  HUD.el.lowHpVig.style.opacity = low ? String(low * (0.55 + 0.45 * Math.sin(GAME.elapsed * 6))) : '0';

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

  // ---- crosshair: four lines with a centre gap ----
  var cx = Math.round(w / 2), cy = Math.round(h / 2);
  var gap = 5 + HUD.crossGap, len = 9;
  ctx.lineWidth = 2;
  ctx.strokeStyle = HUD.hitTimer > 0 ? '#ff2d3c' : '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
  ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
  ctx.stroke();
  ctx.shadowBlur = 0;

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
  ctx.fillStyle = '#9fb0c4'; ctx.textAlign = 'left';
  ctx.fillText('BODY ARMOUR / HEALTH', bx, by - 6);
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
}

/* Safe-area insets read once per resize would be ideal, but they are cheap and
   this keeps the canvas honest when a phone rotates. */
function hudInsetLeft() { return hudInsetPx('--safe-l'); }
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
/* Automated test suite. It runs on load against the real constructed world —
   real level, real collidables, real weapon and enemy objects — not mocks.
   bootWorld() is idempotent, so calling it here simply guarantees the world
   exists before the assertions touch it; Section 12 then starts the loop. */

bootWorld();

var TEST_SUITE = {
  results: [],

  run: function (name, fn) {
    try {
      var result = fn();
      this.results.push({ name: name, pass: !!result, error: null });
    } catch (e) {
      this.results.push({ name: name, pass: false, error: e.message });
    }
  },

  report: function () {
    var passed = this.results.filter(function (r) { return r.pass; }).length;
    var total = this.results.length;
    console.log('[TEST SUITE] ' + passed + '/' + total + ' passed');
    this.results.forEach(function (r) {
      console.log('  ' + (r.pass ? '✓' : '✗') + ' ' + r.name + (r.error ? ' — ' + r.error : ''));
    });
    return this.results;
  }
};

TEST_SUITE.run('Player starts with 100 health', function () { return player.health === 100; });
TEST_SUITE.run('Player starts with 3 weapons', function () { return weapons.length === 3; });
TEST_SUITE.run('Collision: player cannot enter wall cell', function () {
  // take a real wall slab out of the level and stand the player inside it
  var wall = null;
  for (var i = 0; i < collidables.length; i++) {
    if (collidables[i].tag === 'wall') { wall = collidables[i]; break; }
  }
  if (!wall) throw new Error('no wall collidables in level');
  var wallPos = new THREE.Vector3((wall.minX + wall.maxX) / 2, 0, (wall.minZ + wall.maxZ) / 2);
  var result = resolveCollision(playerAABB(wallPos), collidables);
  return result.distanceTo(wallPos) > 0.1;   // must have been pushed out
});
TEST_SUITE.run('Enemy transitions PATROL to ALERT on damage', function () {
  var e = new Enemy(new THREE.Vector3(0, 0, 10), []);
  e.setState('PATROL');
  e.takeDamage(10);
  var ok = e.state === 'ALERT';
  RENDER.scene.remove(e.group);
  return ok;
});
TEST_SUITE.run('Win condition false at start', function () { return !checkWin(); });
TEST_SUITE.run('Loss condition false at full health', function () { return !checkLoss(); });
TEST_SUITE.run('Loss condition true at zero health', function () {
  var savedHealth = player.health;
  player.health = 0;
  var result = checkLoss();
  player.health = savedHealth;
  return result;
});
TEST_SUITE.run('Ammo decrements on fire', function () {
  var before = currentWeapon.ammoInMag;
  fireWeapon();
  var after = currentWeapon.ammoInMag;
  currentWeapon.ammoInMag = before;      // leave the loadout as we found it
  WEAPONS.cooldown = 0; WEAPONS.reloading = 0;
  PLAYER.shotsFired = 0; PLAYER.shotsHit = 0;
  return after === before - 1;
});
TEST_SUITE.run('AudioContext not created before user gesture', function () {
  return typeof audioCtx === 'undefined' || audioCtx === null;
});

/* --- additional checks over the same live world --- */
TEST_SUITE.run('Level grid is rectangular and matches the plan', function () {
  var g = LEVEL.grid;
  if (g.length !== PLAN.h) return false;
  for (var i = 0; i < g.length; i++) if (g[i].length !== PLAN.w) return false;
  return true;
});
TEST_SUITE.run('Every objective is reachable from the spawn', function () {
  // flood fill the passable grid from the start cell
  var g = LEVEL.grid, seen = {}, q = [[PLAN.start.x, PLAN.start.z]];
  seen[PLAN.start.x + ',' + PLAN.start.z] = true;
  while (q.length) {
    var c = q.shift();
    var nb = [[c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]];
    for (var i = 0; i < nb.length; i++) {
      var x = nb[i][0], z = nb[i][1], k = x + ',' + z;
      if (x < 0 || z < 0 || x >= PLAN.w || z >= PLAN.h || seen[k]) continue;
      if (!isPassable(g[z][x])) continue;
      seen[k] = true; q.push([x, z]);
    }
  }
  var termCell = seen[worldToCellX(LEVEL.terminal.pos.x) + ',' + worldToCellZ(LEVEL.terminal.pos.z)];
  var exitCell = seen[PLAN.exit.x + ',' + PLAN.exit.z];
  return !!termCell && !!exitCell;
});
TEST_SUITE.run('No enemy spawns inside level geometry', function () {
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var p = ENEMIES.list[i].group.position;
    var box = { minX: p.x - 0.3, maxX: p.x + 0.3, minY: p.y + 0.2, maxY: p.y + 1.7, minZ: p.z - 0.3, maxZ: p.z + 0.3 };
    for (var c = 0; c < collidables.length; c++) {
      if (collidables[c].walkable || collidables[c].disabled) continue;
      if (aabbOverlap(box, collidables[c])) throw new Error('spawn ' + i + ' (' + ENEMIES.list[i].kind + ') is inside ' + collidables[c].tag);
    }
  }
  return ENEMIES.list.length >= 8;
});
TEST_SUITE.run('Every material on level geometry is physically based', function () {
  for (var i = 0; i < LEVEL.meshes.length; i++) {
    var m = LEVEL.meshes[i].material;
    if (!m.isMeshStandardMaterial) throw new Error(LEVEL.meshes[i].name + ' uses ' + m.type);
  }
  return true;
});
TEST_SUITE.run('No more than six shadow-casting lights', function () {
  var n = 0;
  RENDER.scene.traverse(function (o) { if (o.isLight && o.castShadow) n++; });
  return n <= 6;
});
TEST_SUITE.run('Weapon damage and fire-rate table matches the brief', function () {
  var pp7 = weapons[0], kf7 = weapons[1], mine = weapons[2];
  return pp7.damage === 25 && pp7.magSize === 7 && pp7.auto === false &&
         kf7.damage === 15 && kf7.magSize === 30 && kf7.auto === true && kf7.rps === 10 &&
         mine.damage === 80 && mine.magSize === 3;
});
TEST_SUITE.run('Enemy FSM exposes exactly the five live states', function () {
  var e = ENEMIES.list[0];
  var states = ['PATROL', 'ALERT', 'CHASE', 'ATTACK', 'SEARCH'];
  for (var i = 0; i < states.length; i++) {
    e.setState(states[i]);
    if (e.state !== states[i]) return false;
  }
  e.setState('PATROL');
  return true;
});
TEST_SUITE.run('Pitch clamp holds at plus/minus 80 degrees', function () {
  var saved = PLAYER.pitch;
  INPUT.lookY = -100; updatePlayer(0.016, INPUT);
  var high = PLAYER.pitch;
  INPUT.lookY = 100; updatePlayer(0.016, INPUT); updatePlayer(0.016, INPUT);
  var low = PLAYER.pitch;
  INPUT.lookY = 0; PLAYER.pitch = saved;
  return high <= 1.3963 && low >= -1.3963;
});
TEST_SUITE.run('Touch stick honours dead zone and expo curve', function () {
  var dead = applyStick(5, 0);                       // inside the 8px dead zone
  var full = applyStick(TOUCH.maxRadius, 0);          // at the rim
  var half = applyStick(TOUCH.maxRadius / 2, 0);      // halfway out
  return dead.mag === 0 && Math.abs(full.mag - 1) < 1e-6 && half.mag < 0.5;
});

window.__TESTS__ = TEST_SUITE;
TEST_SUITE.report();

// ===SECTION 12===
/* Game state, the frame loop, and the objective / win / loss rules. */

/* Doors slide up when someone unlocked is close, and their collider goes with them. */
function updateDoors(dt) {
  for (var i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    var dist = Math.hypot(PLAYER.pos.x - d.x, PLAYER.pos.z - d.z);
    var want = (!d.locked && dist < 3.2) ? 1 : 0;
    if (want !== d.target) {
      d.target = want;
      if (want) sfxDoor(d.mesh.position);
    }
    if (Math.abs(d.open - d.target) > 0.001) {
      d.open += clamp(d.target - d.open, -dt * 1.6, dt * 1.6);
      d.mesh.position.y = d.closedY + d.open * (WALL_H - 0.1);
      d.aabb.disabled = d.open > 0.75;
    }
  }
}

function startMission() {
  ensureAudio();
  audioResume();
  GAME.state = 'playing';
  GAME.elapsed = 0;
  GAME.alarm = false; GAME.alarmAt = 0; GAME.kills = 0; GAME.bodies = 0;
  GAME.objectives.terminal = false; GAME.objectives.escaped = false;
  GAME.noise = null;
  setAlarmLoop(false);
  RENDER.alarmMix = 0;

  // reset player
  PLAYER = makePlayer();
  player = PLAYER;
  PLAYER.pos.copy(LEVEL.spawnPoints.player);
  PLAYER.yaw = Math.PI;         // facing out of the bathroom
  PLAYER.maxHealth = Math.round(CFG.player.maxHealth * CFG.difficulty[GAME.difficulty].health);
  PLAYER.health = PLAYER.maxHealth;

  // reset weapons
  for (var i = 0; i < WEAPONS.list.length; i++) {
    var w = WEAPONS.list[i];
    w.ammoInMag = w.magSize;
    if (!w.infiniteReserve) w.reserve = (w.id === 'kf7') ? 120 : 0;
  }
  switchWeapon(0);
  WEAPONS.index = 0; currentWeapon = WEAPONS.list[0];
  for (i = 0; i < WEAPONS.viewModels.length; i++) WEAPONS.viewModels[i].visible = (i === 0);
  for (i = WEAPONS.mines.length - 1; i >= 0; i--) {
    RENDER.scene.remove(WEAPONS.mines[i].mesh);
    WEAPONS.mines[i].mesh.geometry.dispose();
    WEAPONS.mines.splice(i, 1);
  }
  for (i = 0; i < WEAPONS.impactPool.length; i++) { WEAPONS.impactPool[i].life = 0; WEAPONS.impactPool[i].mesh.visible = false; }

  // reset terminal + doors
  LEVEL.terminal.used = false;
  LEVEL.terminal.screen.material = MAT.screenAmber;
  LEVEL.terminal.led.material = MAT.ledGreen;
  for (i = 0; i < LEVEL.doors.length; i++) {
    var d = LEVEL.doors[i];
    d.locked = (d.tag.indexOf('exit') === 0);
    d.open = 0; d.target = 0;
    d.mesh.position.y = d.closedY;
    d.aabb.disabled = false;
    d.lamp.material = d.locked ? MAT.ledRed : MAT.ledGreen;
  }

  spawnEnemies();
  INPUT.crouch = false; INPUT.fire = false; INPUT.fireLatched = false; INPUT.interact = false;
  TOUCH.left.id = -1; TOUCH.right.id = -1; TOUCH.left.x = TOUCH.left.y = TOUCH.right.x = TOUCH.right.y = 0;

  showScreen(null);
  hudShow(true);
  hudUpdateVitals(); hudUpdateAmmo(); hudUpdateObjectives();
  hudToast('Insertion complete. Find the control room.');
  GAME.lastTime = performance.now();
}

function endMission(won, reason) {
  if (GAME.state === 'over') return;
  GAME.state = 'over';
  GAME.objectives.escaped = !!won;
  exitPointerLock();
  setAlarmLoop(false);
  hudShow(false);
  sfxSting(won);

  var acc = PLAYER.shotsFired ? Math.round(PLAYER.shotsHit / PLAYER.shotsFired * 100) : 0;
  document.getElementById('endTitle').textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
  document.getElementById('endTitle').className = won ? 'win' : 'lose';
  document.getElementById('endEyebrow').textContent = won ? 'Extraction' : 'Signal lost';
  document.getElementById('bigStat').textContent = fmtClock(GAME.elapsed);
  document.getElementById('endText').textContent = won
    ? (GAME.alarm ? 'Out with the archive, but Blackgate logged the intrusion.'
                  : 'Out with the archive and no alarm on record. Textbook.')
    : (reason === 'killed' ? 'The garrison put you down inside the facility.' : 'Mission aborted.');
  document.getElementById('endObjA').textContent = GAME.objectives.terminal ? 'Yes' : 'No';
  document.getElementById('endAlarm').textContent = GAME.alarm ? 'Yes' : 'No';
  document.getElementById('endKills').textContent = String(GAME.kills);
  document.getElementById('endAcc').textContent = acc + '%';
  if (won && (!GAME.best || GAME.elapsed < GAME.best)) { GAME.best = GAME.elapsed; saveBest(); }
  document.getElementById('endBest').textContent = GAME.best ? fmtClock(GAME.best) : '—';
  showScreen('screenEnd');
}

function pauseGame() {
  if (GAME.state !== 'playing') return;
  GAME.state = 'paused';
  INPUT.fire = false; INPUT.interact = false;
  exitPointerLock();
  audioSuspend();
  document.getElementById('pauseTime').textContent = fmtClock(GAME.elapsed);
  document.getElementById('pauseAlarm').textContent = GAME.alarm ? 'RAISED' : 'Silent';
  document.getElementById('pauseObjA').textContent = GAME.objectives.terminal ? 'Retrieved' : 'Not retrieved';
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

function showScreen(id) {
  var screens = ['screenTitle', 'screenBriefing', 'screenControls', 'screenOptions', 'screenPause', 'screenEnd', 'screenFatal'];
  for (var i = 0; i < screens.length; i++) {
    var el = document.getElementById(screens[i]);
    if (el) el.classList.toggle('on', screens[i] === id);
  }
  GAME.screen = id;
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

  if (GAME.state === 'playing') {
    GAME.elapsed += dt;
    var input = gatherInput(dt);
    updatePlayer(dt, input);
    updateWeapons(dt, input);
    updateEnemies(dt);
    updateScreens(dt);
    updateDoors(dt);
    updateInteraction(dt);
    hudTick(dt);
    if (checkWin()) { endMission(true, 'escaped'); }
    else if (checkLoss()) { endMission(false, 'killed'); }
  }

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

/* ---------- wiring ---------- */
function bindUI() {
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) { e.preventDefault(); ensureAudio(); sfxUI(true); fn(); }, false);
  }
  on('btnStart', function () { showScreen('screenBriefing'); });
  on('btnBriefing', function () { showScreen('screenBriefing'); });
  on('btnBriefStart', function () { startMission(); });
  on('btnBriefBack', function () { showScreen('screenTitle'); });
  on('btnControlsScreen', function () { GAME.uiBack = 'screenTitle'; showScreen('screenControls'); });
  on('btnControlsBack', function () { showScreen(GAME.uiBack || 'screenTitle'); });
  on('btnOptions', function () { GAME.uiBack = GAME.state === 'paused' ? 'screenPause' : 'screenTitle'; showScreen('screenOptions'); });
  on('btnPauseOptions', function () { GAME.uiBack = 'screenPause'; showScreen('screenOptions'); });
  on('btnOptionsBack', function () { showScreen(GAME.uiBack || 'screenTitle'); });
  on('btnResume', function () { resumeGame(); });
  on('btnAbort', function () { GAME.state = 'menu'; hudShow(false); setAlarmLoop(false); showScreen('screenTitle'); });
  on('btnPlayAgain', function () { startMission(); });
  on('btnEndTitle', function () { GAME.state = 'menu'; showScreen('screenTitle'); });
  on('btnFatalReload', function () { try { location.reload(); } catch (e) {} });

  var diff = document.getElementById('selDiff');
  if (diff) diff.addEventListener('change', function () { GAME.difficulty = clamp(parseInt(diff.value, 10) || 1, 0, 2); }, false);

  var sens = document.getElementById('rngSens');
  if (sens) sens.addEventListener('input', function () { INPUT.sensitivity = clamp(parseInt(sens.value, 10) / 100, 0.2, 3); }, false);
  var vol = document.getElementById('rngVol');
  if (vol) vol.addEventListener('input', function () { setMasterVolume(clamp(parseInt(vol.value, 10) / 100, 0, 1)); }, false);

  function toggle(id, initial, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('on', !!initial);
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var on2 = !el.classList.contains('on');
      el.classList.toggle('on', on2);
      ensureAudio(); sfxUI(on2);
      fn(on2);
    }, false);
  }
  toggle('togInvert', false, function (v) { INPUT.invertY = v; });
  toggle('togBloom', true, function (v) { setBloomEnabled(v); });
  toggle('togShadow', true, function (v) { setShadowsEnabled(v); });
  toggle('togStats', false, function (v) {
    GAME.showStats = v;
    document.getElementById('fpsCounter').classList.toggle('on', v);
  });

  window.addEventListener('resize', function () { resizeRenderer(); }, false);
  window.addEventListener('orientationchange', function () { setTimeout(resizeRenderer, 250); }, false);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (GAME.state === 'playing') pauseGame(); audioSuspend(); }
    else GAME.lastTime = performance.now();
  }, false);
  window.addEventListener('blur', function () { if (GAME.state === 'playing') pauseGame(); }, false);
}

function init() {
  if (!bootWorld()) return;      // fatal screen already shown
  initInput();
  bindUI();
  hudShow(false);
  showScreen('screenTitle');
  GAME.lastTime = performance.now();
  GAME.raf = requestAnimationFrame(frame);
}

init();
