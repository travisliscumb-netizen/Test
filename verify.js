/* verify.js — static + headless-runtime checks for index.html
   Usage: node verify.js
   Exit code 0 = all checks passed. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, 'index.html');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 1. file exists and is non-empty ---------- */
section('1. File');
const exists = fs.existsSync(FILE);
check('index.html exists', exists);
if (!exists) { console.log('\nFATAL: no index.html'); process.exit(1); }
const html = fs.readFileSync(FILE, 'utf8');
check('index.html is non-empty', html.length > 1000, html.length + ' bytes');

/* ---------- extract script ---------- */
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
check('exactly one inline <script> block', scripts.length === 1, scripts.length + ' found');
const js = scripts.join('\n');

/* ---------- 2. script parses ---------- */
section('2. Parse');
let parseErr = null;
try { new Function(js); } catch (e) { parseErr = e; }
check('script content parses without SyntaxError', !parseErr, parseErr && parseErr.message);

/* ---------- 3. no external references / modules ---------- */
section('3. Offline & dependency-free');
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
const jsNoComments = stripComments(js);
const codeOnly = htmlNoComments.replace(/<script[^>]*>[\s\S]*?<\/script>/g, m => stripComments(m));
const banned = ['import ', 'require(', 'https://', 'http://', '.png', '.jpg', '.mp3', '.wav', '.glb'];
banned.forEach(tok => {
  const idx = codeOnly.indexOf(tok);
  check('no "' + tok + '" outside comments', idx < 0,
    idx >= 0 ? 'near: ' + codeOnly.slice(Math.max(0, idx - 40), idx + 40).replace(/\s+/g, ' ') : '');
});
check('no ES module import statement', !/\bimport\s+[\w{*'"]/.test(jsNoComments));
check('no <link> or <img> tags', !/<link\b|<img\b/i.test(htmlNoComments));

/* ---------- 4. viewport ---------- */
section('4. Viewport');
const vp = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
check('viewport meta present', !!vp);
check('viewport contains viewport-fit=cover', !!vp && /viewport-fit=cover/.test(vp[0]), vp && vp[0]);
check('safe-area insets used in CSS', (html.match(/env\(safe-area-inset-/g) || []).length >= 8,
  (html.match(/env\(safe-area-inset-/g) || []).length + ' uses');

/* ---------- 5. handler names resolve ---------- */
section('5. Handlers resolve');
const declaredFns = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
const declaredVars = new Set([...js.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
const paramNames = new Set();
[...js.matchAll(/function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)].forEach(m =>
  m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => paramNames.add(n)));
const markupHandlers = [...htmlNoComments.matchAll(/on(?:click|change|input)\s*=\s*"([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
const uniqueHandlers = [...new Set(markupHandlers)];
check('markup declares handlers', uniqueHandlers.length >= 20, uniqueHandlers.length + ' distinct handlers');
const missingHandlers = uniqueHandlers.filter(h => !declaredFns.has(h));
check('every markup handler is a defined function', missingHandlers.length === 0, missingHandlers.join(', '));
const listenerIdents = [...js.matchAll(/addEventListener\(\s*['"][\w]+['"]\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)].map(m => m[1]);
const missingListeners = [...new Set(listenerIdents)]
  .filter(n => !declaredFns.has(n) && !declaredVars.has(n) && !paramNames.has(n));
check('every addEventListener handler identifier is defined', missingListeners.length === 0, missingListeners.join(', '));

/* ---------- 6 & 10. screen IDs ---------- */
section('6/10. Screens');
const REQUIRED_SCREENS = ['screen-title', 'screen-mission-select', 'screen-briefing', 'screen-settings',
  'screen-controls', 'screen-pause', 'screen-victory', 'screen-defeat', 'screen-cheats', 'screen-arena'];
const domIds = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]));
REQUIRED_SCREENS.forEach(id => check('screen "' + id + '" exists in markup', domIds.has(id)));
check('exactly ten screens required and present', REQUIRED_SCREENS.length === 10 && REQUIRED_SCREENS.every(id => domIds.has(id)));
const referencedScreens = [...new Set([...js.matchAll(/['"](screen-[a-z-]+)['"]/g)].map(m => m[1]))];
const danglingScreens = referencedScreens.filter(id => !domIds.has(id));
check('every screen id referenced by code exists in the DOM', danglingScreens.length === 0, danglingScreens.join(', '));
const referencedEls = [...new Set([...js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]))];
const danglingEls = referencedEls.filter(id => !domIds.has(id));
check('every getElementById target exists in the DOM', danglingEls.length === 0, danglingEls.join(', '));

/* ---------- 7. no placeholder markers ---------- */
section('7. No placeholders');
['TODO', 'FIXME', 'not implemented', 'NOT IMPLEMENTED'].forEach(tok => {
  check('no "' + tok + '"', html.indexOf(tok) < 0);
});
check('no "stub" marker', !/\bstubs?\b/i.test(html));

/* ---------- 8. weapon and enemy configs ---------- */
section('8. Weapon & enemy configs');
const weaponBlock = js.slice(js.indexOf('var WEAPONS=['), js.indexOf('var WEAPON={'));
['sidearm', 'smg', 'shotgun'].forEach(id => check('weapon "' + id + '" present', weaponBlock.includes("id:'" + id + "'")));
const WEAPON_FIELDS = ['name', 'mode', 'damage', 'rpm', 'magSize', 'reload', 'reserve', 'recoil',
  'spreadHip', 'spreadAim', 'range', 'falloffStart', 'falloffMin', 'pellets', 'noise', 'sound', 'switchTime'];
const weaponEntries = weaponBlock.split('{ id:').slice(1);
check('three weapon configs', weaponEntries.length === 3, weaponEntries.length + ' found');
WEAPON_FIELDS.forEach(f => {
  const n = weaponEntries.filter(e => new RegExp('(^|[,{\\s])' + f + '\\s*:').test(e)).length;
  check('all 3 weapons define "' + f + '"', n === 3, n + '/3');
});
const enemyBlock = js.slice(js.indexOf('var ENEMY_TYPES={'), js.indexOf('var ENEMIES=[]'));
['guard', 'heavy', 'drone'].forEach(k => check('enemy "' + k + '" present', enemyBlock.includes(k + ':{ key:')));
const ENEMY_FIELDS = ['name', 'health', 'armor', 'speed', 'chaseSpeed', 'radius', 'height', 'fov', 'viewRange',
  'hearing', 'damage', 'fireRate', 'burst', 'accuracy', 'alertTime', 'attackRange', 'callTime', 'score'];
const enemyEntries = enemyBlock.split(/\w+:\{ key:/).slice(1);
check('three enemy configs', enemyEntries.length === 3, enemyEntries.length + ' found');
ENEMY_FIELDS.forEach(f => {
  const n = enemyEntries.filter(e => new RegExp('(^|[,{\\s])' + f + '\\s*:').test(e)).length;
  check('all 3 enemies define "' + f + '"', n === 3, n + '/3');
});

/* ---------- 9. FSM states ---------- */
section('9. FSM states');
const STATES = ['PATROL', 'SUSPICIOUS', 'ALERT', 'ATTACK', 'SEARCH', 'DEAD'];
STATES.forEach(st => {
  const uses = (js.match(new RegExp("'" + st + "'", 'g')) || []).length;
  check('FSM state ' + st + ' present and referenced', uses >= 2, uses + ' references');
});
check('FSM switch dispatches on state', /switch\s*\(\s*e\.state\s*\)/.test(js));

/* =====================================================================
   RUNTIME — headless boot of the real script against DOM/WebGL stubs.
   ===================================================================== */
section('R. Headless runtime');

function makeStubDom(html, opts) {
  opts = opts || {};
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
  const nodes = {};
  function mkEl(id) {
    const el = {
      id: id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', children: [],
      style: {}, dataset: {}, hidden: false,
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); return this._s.has(c); }
      },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener() { }, removeEventListener() { },
      getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 780 }; },
      requestPointerLock() { },
      getContext(kind) { return kind === '2d' ? make2d() : (opts.noWebGL ? null : makeGL()); }
    };
    return el;
  }
  ids.forEach(id => { nodes[id] = mkEl(id); });
  // crosshair has four bar children in the markup
  if (nodes['crosshair']) for (let i = 0; i < 4; i++) nodes['crosshair'].appendChild(mkEl('ch' + i));
  const doc = {
    hidden: false, fullscreenElement: null, pointerLockElement: null,
    documentElement: mkEl('html'),
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return mkEl('q'); },
    createElement(t) { return mkEl('created-' + t); },
    addEventListener() { }, removeEventListener() { }, exitPointerLock() { }
  };
  return { doc, nodes };
}
function make2d() {
  const noop = () => { };
  return {
    canvas: { width: 92, height: 92 },
    clearRect: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1
  };
}
function makeGL() {
  const calls = { drawArrays: 0, bufferData: 0, bufferSubData: 0 };
  const noop = () => { };
  const gl = {
    _calls: calls,
    ARRAY_BUFFER: 1, STATIC_DRAW: 2, DYNAMIC_DRAW: 3, TRIANGLES: 4, FLOAT: 5,
    DEPTH_TEST: 6, CULL_FACE: 7, BACK: 8, LEQUAL: 9, BLEND: 10, SRC_ALPHA: 11, ONE: 12,
    COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256, VERTEX_SHADER: 13, FRAGMENT_SHADER: 14,
    COMPILE_STATUS: 15, LINK_STATUS: 17,
    createShader: () => ({}), shaderSource: noop, compileShader: noop,
    getShaderParameter: () => true, deleteShader: noop,
    createProgram: () => ({}), attachShader: noop, linkProgram: noop,
    getProgramParameter: () => true, useProgram: noop,
    getAttribLocation: (p, n) => ({ aPos: 0, aNor: 1, aCol: 2, aA: 3 })[n],
    getUniformLocation: () => ({}),
    createBuffer: () => ({}), bindBuffer: noop,
    bufferData: (t, d) => { calls.bufferData++; if (d && d.length !== undefined && !isFinite(d.length)) throw new Error('bad buffer'); },
    bufferSubData: (t, o, d) => { calls.bufferSubData++; if (d && [...d.slice(0, 64)].some(v => !isFinite(v))) throw new Error('NaN in particle buffer'); },
    enableVertexAttribArray: noop, vertexAttribPointer: noop,
    uniformMatrix4fv: (l, t, m) => { for (let i = 0; i < m.length; i++) if (!isFinite(m[i])) throw new Error('NaN in matrix uniform'); },
    uniform1f: (l, v) => { if (!isFinite(v)) throw new Error('NaN uniform1f'); },
    uniform3f: noop, uniform4f: noop,
    enable: noop, disable: noop, depthFunc: noop, depthMask: noop, cullFace: noop,
    clearColor: noop, clear: noop, viewport: noop, blendFunc: noop,
    drawArrays: (m, f, c) => { calls.drawArrays++; if (!isFinite(c) || c < 0) throw new Error('bad draw count ' + c); }
  };
  return gl;
}
function makeSandbox(o) {
  o = o || {};
  const { doc, nodes } = makeStubDom(html, o);
  let t = 0;
  const store = new Map();
  const localStorage = o.throwingStorage ? {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); }
  } : {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  if (o.corruptSave) store.set('agent64.spyops.save.v3', '{"bestTime":"not a number","settings":{"quality":42},');
  if (o.hostileSave) store.set('agent64.spyops.save.v3', JSON.stringify({
    version: 3, completed: 'yes', bestTime: -50, difficulty: 99, arenaBest: 1e9,
    settings: { quality: 'ultra', sens: 9999, volume: null, debug: 'x' },
    cheatsUnlocked: { invulnerable: 'true' }, cheatsActive: { invulnerable: true }
  }));
  const raf = [];
  const win = {
    innerWidth: 390, innerHeight: 780, devicePixelRatio: 3,
    localStorage: o.noStorage ? undefined : localStorage,
    addEventListener() { }, removeEventListener() { },
    AudioContext: o.audio ? function () {
      return {
        currentTime: 0, sampleRate: 44100, state: 'running', destination: {},
        createGain: () => ({ gain: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { }, setTargetAtTime() { } }, connect() { }, disconnect() { } }),
        createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
        createBufferSource: () => ({ buffer: null, loop: false, playbackRate: { value: 1 }, connect() { }, start() { }, stop() { } }),
        createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() { } }),
        createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { }, start() { }, stop() { } }),
        resume() { }, suspend() { }
      };
    } : undefined,
    ontouchstart: undefined
  };
  const sandbox = {
    window: win, document: doc, navigator: { maxTouchPoints: 5, userAgent: 'node' },
    location: { reload() { } }, console,
    performance: { now: () => (t += 16.7) },
    requestAnimationFrame: fn => { raf.push(fn); return raf.length; },
    cancelAnimationFrame: () => { },
    setTimeout: (fn, ms) => 0, clearTimeout: () => { },
    Math, Date, JSON, Float32Array, Int32Array, Int8Array, Array, Object, String, Number,
    isFinite, parseInt, parseFloat, Error
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  Object.keys(win).forEach(k => { if (!(k in sandbox)) sandbox[k] = win[k]; });
  return { sandbox, nodes, win, doc, store, raf, tick: () => t };
}

function runScript(opts) {
  const env = makeSandbox(opts);
  const ctx = vm.createContext(env.sandbox);
  vm.runInContext(js, ctx, { filename: 'index.html:script', timeout: 20000 });
  return { ctx, env };
}

/* --- R1: boots with no audio, no storage, capped DPR --- */
let boot1 = null, bootErr = null;
try { boot1 = runScript({}); } catch (e) { bootErr = e; }
check('script boots headless without throwing', !bootErr, bootErr && (bootErr.message + '\n' + (bootErr.stack || '').split('\n').slice(0, 4).join('\n')));

if (boot1) {
  const G = boot1.ctx;
  check('renderer initialised (WebGL stub accepted)', !!G.R.gl);
  check('device pixel ratio capped at <= 1.5 (device reports 3)', G.R.dpr <= 1.5, 'dpr=' + G.R.dpr);
  check('save loaded with defaults', G.SAVE && G.SAVE.settings.quality === 'med');
  check('title screen is the boot screen', G.GAME.screen === 'screen-title');
  check('audio degraded gracefully when AudioContext is missing', G.AUD.ok === false);

  /* --- R2: full mission run --- */
  let runErr = null;
  try {
    G.startMission(false);
    check('mission built static geometry', G.WORLD.mesh.length > 5000, G.WORLD.mesh.length + ' floats');
    check('mission built collision solids', G.WORLD.solids.length > 80, G.WORLD.solids.length + ' boxes');
    check('waypoint graph present', G.WORLD.waypoints.length >= 20, G.WORLD.waypoints.length + ' nodes');
    check('all three enemy types spawned', new Set(G.ENEMIES.map(e => e.key)).size === 3);
    check('ten enemies spawned', G.ENEMIES.length === 10, G.ENEMIES.length + '');

    // Walk each authored leg as a body would: sample along it, follow the
    // floor, and require head clearance and a climbable step at every sample.
    function bandBlocked(x, z, y0, y1, r) {
      const list = G.WORLD.solids;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (x + r > s.x0 && x - r < s.x1 && z + r > s.z0 && z - r < s.z1 && y1 > s.y0 && y0 < s.y1) return true;
      }
      return false;
    }
    function walkable(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(2, Math.ceil(len / 0.35));
      let ground = a.y || 0;
      for (let i = 1; i <= steps; i++) {
        const x = a.x + dx * i / steps, z = a.z + dz * i / steps;
        const from = ground + 0.55;
        const t = G.rayLevel(x, from, z, 0, -1, 0, from + 4, null);
        const g = from - t;
        if (!isFinite(g) || g < -2) return 'void@' + x.toFixed(1) + ',' + z.toFixed(1);
        if (g - ground > 0.47) return 'step ' + (g - ground).toFixed(2) + '@' + x.toFixed(1) + ',' + z.toFixed(1);
        // headroom band, not a full-body overlap: on a staircase the next
        // step always intersects the body box, and step-up resolves that.
        if (bandBlocked(x, z, g + 0.5, g + 1.7, 0.40)) return 'blocked@' + x.toFixed(1) + ',' + z.toFixed(1);
        ground = g;
      }
      return (Math.abs(ground - (b.y || 0)) < 0.6) ? null : 'ends at y=' + ground.toFixed(2);
    }
    let blockedEdges = [];
    G.WORLD.edges.forEach(e => {
      const a = G.WORLD.waypoints[e[0]], b = G.WORLD.waypoints[e[1]];
      const r = walkable(a, b) || walkable(b, a);
      if (r) blockedEdges.push(e[0] + '-' + e[1] + '(' + r + ')');
    });
    check('every waypoint edge is walkable end to end', blockedEdges.length === 0, blockedEdges.join(' '));

    // patrol routes are walked in straight lines with no path-finding
    let blockedPatrol = [];
    G.WORLD.enemySpawns.forEach((sp, i) => {
      for (let k = 0; k < sp.patrol.length; k++) {
        const a = G.WORLD.waypoints[sp.patrol[k]], b = G.WORLD.waypoints[sp.patrol[(k + 1) % sp.patrol.length]];
        if (a === b) continue;
        const r = walkable(a, b);
        if (r) blockedPatrol.push('spawn' + i + ':' + sp.patrol[k] + '->' + sp.patrol[(k + 1) % sp.patrol.length] + '(' + r + ')');
      }
    });
    check('every patrol leg is walkable', blockedPatrol.length === 0, blockedPatrol.join(' '));

    // the graph must be fully connected, or enemies could never reach the player
    const seen = new Set([0]); const q = [0];
    while (q.length) { const c = q.shift(); (G.WORLD.adj[c] || []).forEach(n => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); }
    check('waypoint graph is fully connected', seen.size === G.WORLD.waypoints.length, seen.size + '/' + G.WORLD.waypoints.length);

    // player spawn and every waypoint must be clear of solid geometry
    let inside = [];
    G.WORLD.waypoints.forEach((w, i) => { if (G.overlapsSolid(w.x, (w.y || 0) + 0.06, w.z, 0.4, 1.7)) inside.push(i); });
    check('no waypoint is embedded in level geometry', inside.length === 0, 'nodes ' + inside.join(','));
    check('player spawn is clear', !G.overlapsSolid(G.PLAYER.x, G.PLAYER.y, G.PLAYER.z, 0.34, 1.72));

    /* --- route completability: flood fill the level as a walking body --- */
    function floodFill(startX, startZ, bodyH, blockRects) {
      const cell = 0.6, b = G.WORLD.bounds;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
      const z0 = Math.min(b.z0, b.z1), z1 = Math.max(b.z0, b.z1);
      const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
      const seen = new Map();
      const key = (i, k) => i * 100000 + k;
      const inBlocked = (x, z) => (blockRects || []).some(r => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
      const groundAt = (x, z, from) => {
        const t = G.rayLevel(x, from, z, 0, -1, 0, from + 6, null);
        return from - t;
      };
      const si = Math.round((startX - x0) / cell), sk = Math.round((startZ - z0) / cell);
      const q = [[si, sk, groundAt(startX, startZ, 1.2)]];
      seen.set(key(si, sk), q[0][2]);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let guardCount = 0;
      while (q.length && guardCount++ < 400000) {
        const [i, k, g] = q.shift();
        for (const [di, dk] of dirs) {
          const ni = i + di, nk = k + dk;
          if (ni < 0 || nk < 0 || ni > nx || nk > nz) continue;
          if (seen.has(key(ni, nk))) continue;
          const x = x0 + ni * cell, z = z0 + nk * cell;
          if (inBlocked(x, z)) continue;
          const ng = groundAt(x, z, g + 0.5);
          if (!isFinite(ng) || ng < -3 || ng - g > 0.46 || g - ng > 4.5) continue;
          if (bandBlocked(x, z, ng + 0.45, ng + bodyH, 0.34)) continue;
          seen.set(key(ni, nk), ng);
          q.push([ni, nk, ng]);
        }
      }
      return {
        reached(x, z) {
          const i = Math.round((x - x0) / cell), k = Math.round((z - z0) / cell);
          for (let a = -1; a <= 1; a++) for (const c of [-1, 0, 1])
            if (seen.has(key(i + a, k + c))) return true;
          return false;
        },
        // an interactable sits on a console or pedestal; what must be reachable
        // is a standing spot inside its interaction radius
        reachedNear(x, z, r) {
          for (let a = 0; a < 16; a++) {
            const ang = a * Math.PI / 8;
            if (this.reached(x + Math.cos(ang) * r * 0.8, z + Math.sin(ang) * r * 0.8)) return true;
          }
          return this.reached(x, z);
        },
        count: seen.size
      };
    }
    const st = G.WORLD.playerStart;
    const standing = floodFill(st.x, st.z, 1.72, null);
    check('flood fill covers the map from the spawn', standing.count > 2000, standing.count + ' cells');
    let unreachable = [];
    G.WORLD.interacts.forEach(it => { if (!standing.reachedNear(it.x, it.z, it.r)) unreachable.push(it.id); });
    check('every objective is reachable on foot from the spawn', unreachable.length === 0, unreachable.join(','));
    check('the extraction pad is reachable', standing.reached(-2, -118));
    // the culvert is crouch-only by design: standing must not fit, crouching must
    const crouching = floodFill(st.x, st.z, 1.02, null);
    check('the maintenance culvert is crouch-only', !standing.reached(-28, -40));
    check('the maintenance culvert is passable while crouched', crouching.reached(-28, -40));
    // sealing the main gate must still leave a way into the facility (route 2)
    const gateSealed = floodFill(st.x, st.z, 1.02, [[-6, -16, 6, -12]]);
    check('with the main gate sealed the culvert still reaches the turbine hall',
      gateSealed.reached(-19, -52), 'cells=' + gateSealed.count);
    check('with the main gate sealed the culvert still reaches the vault',
      gateSealed.reachedNear(7.5, -105.5, 2.4));
    // and the gate route alone reaches the vault without the culvert
    const culvertSealed = floodFill(st.x, st.z, 1.72, [[-33, -16, -23, -12]]);
    check('the direct gate route reaches the vault on its own', culvertSealed.reachedNear(7.5, -105.5, 2.4));

    /* --- camera & projection orientation --- */
    (function () {
      const P = G.PLAYER;
      P.x = G.WORLD.playerStart.x; P.z = G.WORLD.playerStart.z; P.yaw = 0; P.pitch = 0;
      G.render();
      const fx = Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const eye = G.playerEyeY();
      const snap = (r) => ({ x: r.x, y: r.y, visible: r.visible });
      const ahead = snap(G.worldToScreen(P.x + fx * 10, eye, P.z + fz * 10));
      check('a point straight ahead projects to screen centre',
        ahead.visible && Math.abs(ahead.x - 195) < 12 && Math.abs(ahead.y - 390) < 12,
        JSON.stringify({ x: +ahead.x.toFixed(1), y: +ahead.y.toFixed(1), visible: ahead.visible }));
      const right = snap(G.worldToScreen(P.x + fx * 10 + 4, eye, P.z + fz * 10));
      check('world +right projects to the right of centre', right.visible && right.x > ahead.x + 40, right.x.toFixed(1));
      const above = snap(G.worldToScreen(P.x + fx * 10, eye + 4, P.z + fz * 10));
      check('world +up projects above centre', above.visible && above.y < ahead.y - 40, above.y.toFixed(1));
      const behind = snap(G.worldToScreen(P.x - fx * 10, eye, P.z - fz * 10));
      check('a point behind the camera is rejected', behind.visible === false);
      // fan rays across the view: the player should be looking at a built world
      let hits = 0, tot = 0;
      for (let a = -0.6; a <= 0.6; a += 0.15) {
        for (let b = -0.3; b <= 0.3; b += 0.15) {
          const cp = Math.cos(b);
          const t2 = G.rayLevel(P.x, eye, P.z, Math.sin(P.yaw + a) * cp, Math.sin(b), -Math.cos(P.yaw + a) * cp, 90, null);
          tot++; if (t2 < 90) hits++;
        }
      }
      check('the spawn view actually looks at level geometry', hits >= tot * 0.5, hits + '/' + tot + ' rays hit');
      check('render() produced draw calls', G.R.drawCalls > 0, G.R.drawCalls + ' draws');
    })();

    /* --- detection tuning: stealth has to be genuinely viable --- */
    (function () {
      const g = G.ENEMIES[0];
      const save = { x: G.PLAYER.x, y: G.PLAYER.y, z: G.PLAYER.z, yaw: g.yaw, aw: g.awareness, st: g.state };
      function timeToDetect(crouch, dist) {
        g.awareness = 0; g.state = 'PATROL';
        G.PLAYER.dead = false; G.PLAYER.crouch = crouch;
        G.PLAYER.vx = 0; G.PLAYER.vz = 0; G.PLAYER.sprint = false;
        G.PLAYER.x = g.x; G.PLAYER.z = g.z + dist; G.PLAYER.y = g.y;
        g.yaw = Math.atan2(G.PLAYER.x - g.x, -(G.PLAYER.z - g.z));
        if (!G.enemyCanSeePlayer(g)) return -1;
        let s = 0;
        while (g.awareness < 1 && s < 30) { G.enemyPerception(g, 1 / 60); s += 1 / 60; }
        return s;
      }
      const stand = timeToDetect(false, 12), crouch = timeToDetect(true, 12);
      check('the detection test had a clear sightline', stand > 0 && crouch > 0, 'stand=' + stand + ' crouch=' + crouch);
      check('a crouched approach buys meaningfully more time than standing (stand '+stand.toFixed(2)+'s crouch '+crouch.toFixed(2)+'s)',
        crouch > stand * 1.8 && crouch > 1.5,
        'stand ' + stand.toFixed(2) + 's vs crouch ' + crouch.toFixed(2) + 's at 12m');
      check('standing in a guard cone is punished quickly', stand > 0 && stand < 3.0, stand.toFixed(2) + 's');
      G.PLAYER.x = save.x; G.PLAYER.y = save.y; G.PLAYER.z = save.z;
      g.yaw = save.yaw; g.awareness = save.aw; g.state = save.st;
      G.PLAYER.crouch = false;
    })();

    // simulate: walk forward, look around, fire, reload, switch weapons
    const startX = G.PLAYER.x, startZ = G.PLAYER.z;
    let maxParts = 0, maxDraws = 0;
    for (let i = 0; i < 900; i++) {
      G.INPUT.moveY = -1; G.INPUT.moveX = Math.sin(i / 60) * 0.4;
      G.INPUT.lookX = Math.sin(i / 90) * 3;
      G.INPUT.fire = (i % 17) < 4;
      G.INPUT.sprint = (i % 200) > 150;
      G.INPUT.crouch = (i % 300) > 260;
      if (i % 233 === 0) G.weaponCycle();
      if (i % 311 === 0) G.weaponReload();
      G.frame(1000 + i * 16.7);
      maxParts = Math.max(maxParts, G.PART.alive);
      maxDraws = Math.max(maxDraws, G.R.drawCalls);
    }
    check('900 simulated frames ran without throwing', true);
    check('player actually moved', Math.hypot(G.PLAYER.x - startX, G.PLAYER.z - startZ) > 1,
      'moved ' + Math.hypot(G.PLAYER.x - startX, G.PLAYER.z - startZ).toFixed(2) + 'm');
    check('player position stayed finite', isFinite(G.PLAYER.x) && isFinite(G.PLAYER.y) && isFinite(G.PLAYER.z));
    check('player never fell out of the world', G.PLAYER.y > -7, 'y=' + G.PLAYER.y.toFixed(2));
    check('particle pool respected its ceiling', maxParts <= G.CFG.pool.particles, maxParts + '/' + G.CFG.pool.particles);
    check('decal pool respected its ceiling', G.DECAL.n <= G.CFG.pool.decals, G.DECAL.n + '/' + G.CFG.pool.decals);
    check('tracer pool respected its ceiling', G.TRACE.n <= G.CFG.pool.tracers, G.TRACE.n + '/' + G.CFG.pool.tracers);
    check('draw calls stayed bounded (peak ' + maxDraws + ')', maxDraws < 260, 'max ' + maxDraws + ' per frame');
    check('ammunition was consumed', G.WEAPON.state.some((st, i) => st.mag < G.WEAPONS[i].magSize || st.reserve < Math.round(G.WEAPONS[i].reserve * 0.55)));

    // no enemy may be permanently wedged
    const stuck = G.ENEMIES.filter(e => e.stuckT > 2.5);
    check('no enemy exceeded the stuck timeout', stuck.length === 0, stuck.length + ' stuck');

    /* --- R3: perception, combat, damage exchange --- */
    const guard = G.ENEMIES.find(e => e.key === 'guard' && e.state !== 'DEAD');
    G.PLAYER.x = guard.x + 2; G.PLAYER.z = guard.z + 2; G.PLAYER.y = guard.y;
    G.PLAYER.crouch = false; G.INPUT.crouch = false;
    let detected = false, attacked = false;
    for (let i = 0; i < 400; i++) {
      G.INPUT.fire = false; G.INPUT.moveY = 0; G.INPUT.moveX = 0;
      G.frame(20000 + i * 16.7);
      if (guard.awareness > 0.5) detected = true;
      if (guard.state === 'ATTACK' || guard.state === 'ALERT') attacked = true;
      if (detected && attacked) break;
    }
    check('a guard detects the player', detected, 'awareness=' + guard.awareness.toFixed(2));
    check('a guard escalates to ALERT/ATTACK', attacked, 'state=' + guard.state);
    const hpBefore = G.PLAYER.health;
    for (let i = 0; i < 600; i++) G.frame(30000 + i * 16.7);
    check('an alerted enemy damages the player', G.PLAYER.health < hpBefore || G.PLAYER.dead,
      hpBefore + ' -> ' + G.PLAYER.health);
    check('alarm was raised by the alerted enemy', G.GAME.alarm === true);

    /* --- R4: killing an enemy --- */
    G.startMission(false);
    const target = G.ENEMIES[0];
    G.enemyDamage(target, 9999, 0, 1, false);
    check('an enemy can be killed', target.state === 'DEAD');
    check('kill counter incremented', G.GAME.kills === 1);

    /* --- R5: objectives, alarm, checkpoints, win --- */
    G.startMission(false);
    const relay = G.WORLD.interacts.find(i => i.kind === 'relay');
    G.PLAYER.x = relay.x; G.PLAYER.z = relay.z; G.PLAYER.y = relay.y;
    G.INPUT.interact = true;
    for (let i = 0; i < 200 && !relay.done; i++) G.frame(50000 + i * 16.7);
    check('a relay terminal can be disabled by holding USE', relay.done === true);
    check('relay counter tracked', G.GAME.relays === 1);
    const vault = G.WORLD.interacts.find(i => i.kind === 'vault');
    G.PLAYER.x = vault.x; G.PLAYER.z = vault.z; G.PLAYER.y = vault.y;
    for (let i = 0; i < 300 && !vault.done; i++) G.frame(60000 + i * 16.7);
    check('the data core can be taken from the vault', vault.done === true && G.GAME.coreTaken === true);
    check('extraction opens once the core is taken', G.GAME.extractOpen === true);
    G.INPUT.interact = false;
    const ex = G.WORLD.interacts.find(i => i.kind === 'extract');
    G.PLAYER.x = ex.x; G.PLAYER.z = ex.z; G.PLAYER.y = ex.y;
    for (let i = 0; i < 60 && G.GAME.state === 'play'; i++) G.frame(70000 + i * 16.7);
    check('reaching extraction with the core wins the mission', G.GAME.state === 'victory');
    check('completion is saved', G.SAVE.completed === true && G.SAVE.bestTime > 0);
    check('completing the mission unlocks a cheat', G.SAVE.cheatsUnlocked.infiniteAmmo === true);
    check('checkpoint was recorded during the run', !!G.GAME.checkpoint);

    /* --- R6: losing --- */
    G.startMission(false);
    G.playerDamage(99999, 0, 0, 'Test Rig');
    check('player death fails the mission', G.GAME.state === 'defeat');
    check('restart from checkpoint or fresh works', (function () {
      G.uiRestartFresh();
      return G.GAME.state === 'play' && G.PLAYER.health > 0;
    })());

    /* --- R7: pause / resume --- */
    G.uiPause();
    check('pause switches state and shows the pause screen', G.GAME.state === 'paused' && G.GAME.screen === 'screen-pause');
    G.uiResume();
    check('resume returns to play', G.GAME.state === 'play');

    /* --- R8: bot arena --- */
    G.startArena();
    check('arena builds and starts', G.GAME.mode === 'arena' && G.GAME.state === 'play');
    check('arena spawns at least three bots', G.ENEMIES.length >= 3, G.ENEMIES.length + ' bots');
    check('cheats are inert inside the arena', G.cheatOn('invulnerable') === false);
    for (let i = 0; i < 600; i++) {
      G.INPUT.fire = (i % 11) < 3; G.INPUT.moveY = -1;
      G.frame(90000 + i * 16.7);
    }
    check('arena ran 600 frames without throwing', true);
    const bot = G.ENEMIES[0];
    G.enemyDamage(bot, 99999, 0, 1, false);
    check('arena kill scores for the player', G.ARENA.playerScore === 1);
    G.playerDamage(99999, 0, 0, 'Sparring Bot');
    check('player death in the arena scores for the bots', G.ARENA.botScore === 1);
    for (let i = 0; i < 300; i++) G.frame(120000 + i * 16.7);
    check('player respawns in the arena', G.PLAYER.dead === false);
    check('a downed bot respawns', G.ENEMIES.filter(e => e.state !== 'DEAD').length >= 3);
    G.ARENA.time = 0.01;
    G.frame(140000);
    check('arena ends on the match timer', G.ARENA.over === true && G.GAME.screen === 'screen-victory');

    /* --- R9: restart five times, no growth --- */
    G.uiQuit();
    const before = { listeners: G.LISTENERS.length, enemies: G.ENEMIES.length, timeouts: G.TIMEOUTS.length };
    let meshLens = [];
    for (let r = 0; r < 5; r++) {
      G.startMission(false);
      for (let i = 0; i < 120; i++) { G.INPUT.moveY = -1; G.INPUT.fire = (i % 9) < 3; G.frame(200000 + r * 5000 + i * 16.7); }
      meshLens.push(G.WORLD.mesh.length);
    }
    check('five mission restarts kept enemy count stable', G.ENEMIES.length <= 11, G.ENEMIES.length + '');
    check('five restarts did not accumulate event listeners', G.LISTENERS.length === before.listeners,
      before.listeners + ' -> ' + G.LISTENERS.length);
    check('five restarts produced identical geometry (no growth)', new Set(meshLens).size === 1, meshLens.join(','));
    check('particle pool arrays are fixed size', G.PART.x.length === G.CFG.pool.particles);
    check('quality change resizes without error', (function () { G.uiSetQuality('low'); G.uiSetQuality('high'); return G.R.dpr <= 1.5; })());
    check('debug panel toggles', (function () { const b = G.SAVE.settings.debug; G.uiToggleDebug(); const c = G.SAVE.settings.debug; G.uiToggleDebug(); return b !== c; })());

    /* --- R10: every screen reachable via its handler --- */
    const navChecks = [
      ['uiShowTitle', 'screen-title'], ['uiShowMissionSelect', 'screen-mission-select'],
      ['uiPickMission', 'screen-briefing'], ['uiShowSettings', 'screen-settings'],
      ['uiShowControls', 'screen-controls'], ['uiShowCheats', 'screen-cheats'],
      ['uiShowArenaMenu', 'screen-arena']
    ];
    let navOk = true, navBad = [];
    navChecks.forEach(([fn, id]) => { G[fn](); if (G.GAME.screen !== id) { navOk = false; navBad.push(fn); } });
    check('every menu handler opens its screen', navOk, navBad.join(','));
    const allHandlersCallable = uniqueHandlers.filter(h => typeof G[h] !== 'function');
    check('every markup handler is callable at runtime', allHandlersCallable.length === 0, allHandlersCallable.join(','));
  } catch (e) {
    runErr = e;
    check('runtime simulation completed', false, e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
  }
}

/* --- R11: hostile / corrupt / absent storage --- */
section('R. Storage resilience');
[['corrupt JSON save', { corruptSave: true }],
['hostile field types in save', { hostileSave: true }],
['localStorage throwing (Private Browsing)', { throwingStorage: true }],
['localStorage entirely absent', { noStorage: true }]].forEach(([name, opts]) => {
  let ok = true, msg = '';
  try {
    const r = runScript(opts);
    const S = r.ctx.SAVE;
    ok = !!S && ['low', 'med', 'high'].includes(S.settings.quality)
      && typeof S.bestTime === 'number' && S.bestTime >= 0
      && S.difficulty >= 0 && S.difficulty <= 2
      && typeof S.settings.volume === 'number';
    if (ok) { r.ctx.startMission(false); for (let i = 0; i < 60; i++) r.ctx.frame(1000 + i * 16.7); }
    if (opts.hostileSave) ok = ok && r.ctx.SAVE.cheatsActive.invulnerable === false;
  } catch (e) { ok = false; msg = e.message; }
  check('survives ' + name + ' and normalises settings', ok, msg);
});

/* --- R12: audio path when AudioContext exists --- */
section('R. Audio');
try {
  const r = runScript({ audio: true });
  r.ctx.uiStartGame();
  check('audio initialises inside the Start Game gesture', r.ctx.AUD.ok === true);
  r.ctx.startMission(false);
  for (let i = 0; i < 120; i++) { r.ctx.INPUT.fire = (i % 7) < 3; r.ctx.frame(1000 + i * 16.7); }
  check('firing with audio enabled throws nothing', true);
  r.ctx.raiseAlarm(null);
  check('alarm tone starts without throwing', r.ctx.GAME.alarm === true);
} catch (e) {
  check('audio path runs without throwing', false, e.message);
}

/* --- R13: no WebGL at all --- */
section('R. No WebGL');
try {
  const r = runScript({ noWebGL: true });
  check('missing WebGL shows the recoverable message instead of crashing', r.ctx.R.gl === null || r.ctx.R.gl === undefined);
} catch (e) {
  check('missing WebGL does not throw', false, e.message);
}

/* ---------- summary ---------- */
console.log('\n' + '='.repeat(58));
console.log('PASSED ' + pass + '   FAILED ' + fail);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
console.log('='.repeat(58));
process.exit(fail ? 1 : 0);
