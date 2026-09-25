/* App shell: screens, input devices, game loop, HUD, audio and renderer glue. */

import { Game, MODES } from './engine.js';
import { Controls } from './controls.js';
import { Bot } from './ai.js';
import { Audio } from './audio.js';
import { Store, DEFAULT_BINDINGS } from './save.js';
import { COLORS } from './pieces.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const store = new Store();
const S = () => store.settings;
const audio = new Audio();
audio.setVolumes(S().music, S().sfx);

const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', softDrop: 'Soft drop', hardDrop: 'Hard drop',
  rotateCW: 'Rotate ↻', rotateCCW: 'Rotate ↺', rotate180: 'Rotate 180°', hold: 'Hold',
  pause: 'Pause', view: 'Camera view'
};
const VIEW_NAMES = { flat: 'Flat 2D', tilt: 'Tilted 3D', dynamic: 'Dynamic 3D' };
const VIEW_ORDER = ['flat', 'tilt', 'dynamic'];
const MODE_NAMES = { marathon: 'Marathon', sprint: 'Sprint', ultra: 'Ultra', endless: 'Endless' };

/* ---------------- renderer (lazy so a WebGL failure can be reported) ---------------- */

let renderer = null;
let THEMES = null, themeFor = null;

async function initRenderer() {
  const test = document.createElement('canvas').getContext('webgl2');
  if (!test) throw new Error('WebGL 2 is not available in this browser.');
  const mod = await import('./render.js');
  THEMES = mod.THEMES;
  themeFor = mod.themeFor;
  renderer = new mod.Renderer($('#gl'), { quality: S().quality });
  applyRenderSettings();
}

function applyRenderSettings() {
  if (!renderer) return;
  const s = S();
  renderer.showGhost = s.ghost;
  renderer.showGrid = s.grid;
  renderer.shakeEnabled = s.shake;
  renderer.particlesEnabled = s.particles;
  if (s.quality === 'auto') {
    if (!renderer.autoQuality) renderer.setAutoQuality(true);
  } else if (renderer.autoQuality || renderer.qualityName !== s.quality) {
    renderer.autoQuality = false;
    renderer.setQuality(s.quality);
  }
}

/* ---------------- app state ---------------- */

let app = 'boot';            // boot | title | countdown | playing | paused | over
let game = null;
let demo = true;
let bot = null;
let demoRestart = 0;
let controls = null;
let countdownT = 0;
let countdownNext = 0;
let resultsTimer = 0;
let screenStack = [];
let currentMode = 'marathon';
let lastSummary = null;
let countdownResume = false;
let lockFromHardDrop = false;

function newDemo() {
  demo = true;
  game = new Game({ mode: 'endless', seed: (Math.random() * 2 ** 31) | 0 });
  bot = new Bot(game, { stepMs: 90 });
  game.start();
  if (renderer) {
    renderer.calm = true;
    renderer.reset();
    renderer.applyTheme(THEMES[0], true);
  }
  setAccent(0x22e6ff);
}

/* ---------------- screens ---------------- */

function showScreen(id, { push = true } = {}) {
  for (const s of $$('[data-screen]')) s.classList.toggle('show', s.id === id);
  if (push && id) {
    if (screenStack[screenStack.length - 1] !== id) screenStack.push(id);
  }
  if (id === 'modes') refreshModeCards();
  if (id === 'records') renderRecords(currentRecordTab);
  if (id === 'help') renderHelpKeys();
  if (id === 'settings') syncSettingsUI();
  rectsDirty = true;
  requestAnimationFrame(() => {
    const scr = id && document.getElementById(id);
    if (!scr) return;
    const first = scr.querySelector('.btn.primary, .mode-card, .tab[aria-selected="true"], button');
    if (first && matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
  });
}

function hideScreens() {
  for (const s of $$('[data-screen]')) s.classList.remove('show');
  screenStack = [];
}

function back() {
  audio.play('ui');
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1];
  if (prev) showScreen(prev, { push: false });
  else if (app === 'paused') showScreen('pause');
  else showScreen('title');
}

function goTitle() {
  app = 'title';
  $('#hud').hidden = true;
  setTouchVisible(false);
  hideScreens();
  showScreen('title');
  newDemo();
  audio.setLevel(1);
  audio.setDanger(false);
  audio.setMuffled(true);
  if (audio.ctx && !audio.playing) audio.startMusic();
  if (renderer) renderer.setView('showcase');
}

/* ---------------- game lifecycle ---------------- */

function startGame(mode) {
  currentMode = mode;
  audio.unlock();
  audio.play('uiSelect');
  const s = S();
  demo = false;
  bot = null;
  game = new Game({
    mode,
    startLevel: s.startLevel,
    seed: (Math.random() * 2 ** 31) | 0,
    sdf: s.sdf === 0 ? Infinity : s.sdf
  });
  if (!controls) controls = new Controls(game, { das: s.das, arr: s.arr });
  controls.releaseAll();
  controls.setGame(game);
  controls.configure({ das: s.das, arr: s.arr });

  if (renderer) {
    renderer.calm = false;
    renderer.reset();
    renderer.setView(s.view);
    renderer.applyTheme(themeFor(game.level));
  }
  setAccent(themeFor ? themeFor(game.level).accent : 0x22e6ff);
  hideScreens();
  $('#hud').hidden = false;
  $('#hud').dataset.game = mode;
  setTouchVisible(true);
  resetHud();
  audio.setLevel(game.level);
  audio.setDanger(false);
  audio.stopMusic();
  beginCountdown();
}

function beginCountdown(resume = false) {
  app = 'countdown';
  countdownT = 0;
  countdownNext = 0;
  countdownResume = resume;
  $('#countdown').innerHTML = '';
  audio.setMuffled(true);
}

function tickCountdown(dt) {
  const step = countdownResume ? 0.45 : 0.62;
  countdownT += dt;
  const labels = countdownResume ? ['3', '2', '1'] : ['3', '2', '1', 'GO'];
  while (countdownNext < labels.length && countdownT >= countdownNext * step) {
    const label = labels[countdownNext];
    const el = document.createElement('span');
    el.textContent = label;
    if (label === 'GO') el.className = 'go';
    $('#countdown').replaceChildren(el);
    audio.play(label === 'GO' ? 'go' : 'count');
    countdownNext++;
  }
  if (countdownT >= labels.length * step - (countdownResume ? 0 : step * 0.5)) {
    app = 'playing';
    setTimeout(() => { if (app !== 'countdown') $('#countdown').replaceChildren(); }, 400);
    if (game.state === 'ready') game.start();
    audio.setMuffled(false);
    if (!countdownResume || !audio.playing) audio.restartMusic();
  }
}

function pauseGame() {
  if (app !== 'playing' && app !== 'countdown') return;
  app = 'paused';
  controls && controls.releaseAll();
  $('#countdown').replaceChildren();
  audio.play('pause');
  audio.setMuffled(true);
  showScreen('pause');
}

function resumeGame() {
  if (app !== 'paused') return;
  hideScreens();
  audio.play('uiSelect');
  beginCountdown(game.state !== 'ready');
}

function endGame(finished) {
  app = 'over';
  controls && controls.releaseAll();
  lastSummary = game.summary();
  lastSummary.finished = finished;
  const rank = store.addRecord(lastSummary);
  audio.stopMusic();
  audio.play(finished ? 'win' : 'over');
  resultsTimer = setTimeout(() => showResults(lastSummary, rank), finished ? 1300 : 1700);
}

/* ---------------- event handling ---------------- */

let lastSoftSound = 0;

function handleEvent(e) {
  if (renderer) renderer.onEvent(e, game);
  if (demo) {
    if (e.type === 'levelUp') setAccent(themeFor(e.level).accent);
    return;
  }
  switch (e.type) {
    case 'move': audio.play('move'); break;
    case 'rotate': audio.play(e.kick > 0 ? 'kick' : 'rotate'); break;
    case 'softDrop': {
      const now = performance.now();
      if (now - lastSoftSound > 45) { audio.play('softDrop'); lastSoftSound = now; }
      break;
    }
    case 'hardDrop': audio.play('hardDrop', e.distance); break;
    case 'lock': if (!lockFromHardDrop) audio.play('lock'); break;
    case 'hold': audio.play('hold'); break;
    case 'clear': onClear(e); break;
    case 'levelUp':
      audio.play('levelUp');
      audio.setLevel(e.level);
      setAccent(themeFor(e.level).accent);
      popup([[`Level ${e.level}`, 'big', '#ffffff']], 0.1);
      break;
    case 'gameOver':
      endGame(false);
      break;
    case 'finish':
      endGame(true);
      break;
  }
}

function onClear(e) {
  const lines = [];
  const T = '#' + COLORS.T.toString(16).padStart(6, '0');
  const I = '#' + COLORS.I.toString(16).padStart(6, '0');
  if (e.tspin !== 'none') {
    audio.play('tspin');
    if (e.lines) audio.play('clear', e);
    lines.push([e.label, e.tspin === 'full' ? 'big' : 'mid', T]);
  } else if (e.lines === 4) {
    audio.play('tetris');
    lines.push(['Tetris', 'huge', I]);
    flash();
  } else {
    audio.play('clear', e);
    if (e.lines >= 2) lines.push([e.label, 'mid', '#ffffff']);
  }
  if (e.b2b) lines.push([`Back-to-back${e.b2bCount > 1 ? ' ×' + e.b2bCount : ''}`, 'small', '#ffd81f']);
  if (e.combo > 0) lines.push([`${e.combo} Combo`, 'small', '#3dff6e']);
  if (e.perfect) {
    audio.play('perfect');
    lines.push(['Perfect clear', 'big', '#ffd81f']);
    flash();
  }
  if (e.points > 0 && (lines.length || e.lines)) lines.push([`+${e.points.toLocaleString()}`, 'points', '#ffffff']);
  if (e.tspin === 'full' && e.lines) flash();
  if (lines.length) popup(lines);
}

function popup(lines, delay = 0) {
  const box = $('#popups');
  const make = () => {
    for (const [text, size, color] of lines) {
      const el = document.createElement('div');
      el.className = `pop ${size}`;
      el.style.setProperty('--c', color);
      el.textContent = text;
      el.addEventListener('animationend', () => el.remove());
      box.appendChild(el);
    }
    while (box.children.length > 8) box.firstChild.remove();
  };
  delay ? setTimeout(make, delay * 1000) : make();
}

function flash() {
  const f = $('#flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

let toastTimer = 0;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

function setAccent(hex) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', `rgb(${r}, ${g}, ${b})`);
  root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
}

/* ---------------- HUD ---------------- */

const hudEls = {
  score: $('#s-score'), level: $('#s-level'), lines: $('#s-lines'), time: $('#s-time'), timeLabel: $('#s-time-label'),
  pps: $('#s-pps'), b2b: $('#s-b2b'), combo: $('#s-combo'),
  goalLabel: $('#goal-label'), goalText: $('#goal-text'), goalBar: $('#goal-bar'), goal: $('#goal')
};
const hudCache = {};

function setText(key, value) {
  if (hudCache[key] === value) return false;
  hudCache[key] = value;
  hudEls[key].textContent = value;
  return true;
}

export function fmtTime(ms, cs = true) {
  ms = Math.max(0, ms);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}${cs ? '.' + String(c).padStart(2, '0') : ''}`;
}

function resetHud() {
  for (const k of Object.keys(hudCache)) delete hudCache[k];
  const mode = game.mode;
  hudEls.timeLabel.textContent = mode === 'ultra' ? 'Time left' : 'Time';
  hudEls.goal.hidden = mode === 'endless';
  hudEls.goalLabel.textContent = mode === 'sprint' ? 'Lines left' : mode === 'ultra' ? 'Time' : 'Goal';
  $('.stat[data-stat="time"]').classList.remove('low');
  $('#popups').replaceChildren();
  updateHud();
}

function updateHud() {
  if (!game || demo) return;
  if (setText('score', game.score.toLocaleString())) {
    hudEls.score.classList.remove('bump');
    void hudEls.score.offsetWidth;
    hudEls.score.classList.add('bump');
  }
  setText('level', String(game.level));
  const r = MODES[game.mode];
  setText('lines', String(game.lines));
  const t = r.timeLimit ? r.timeLimit - game.time : game.time;
  setText('time', fmtTime(t));
  if (r.timeLimit) $('.stat[data-stat="time"]').classList.toggle('low', t < 10000);
  const secs = game.time / 1000;
  setText('pps', secs > 1 ? (game.stats.pieces / secs).toFixed(2) : '0.00');
  setText('b2b', game.b2b > 0 ? `×${game.b2b}` : '–');
  setText('combo', game.combo > 0 ? String(game.combo) : '–');
  let frac = 0, text = '';
  if (game.mode === 'sprint') { frac = game.lines / 40; text = String(Math.max(0, 40 - game.lines)); }
  else if (game.mode === 'ultra') { frac = game.time / r.timeLimit; text = fmtTime(r.timeLimit - game.time, false); }
  else if (game.mode === 'marathon') { frac = game.lines / r.goalLines; text = `${game.lines} / ${r.goalLines}`; }
  setText('goalText', text);
  const w = `${Math.min(100, frac * 100).toFixed(1)}%`;
  if (hudCache.goalW !== w) { hudCache.goalW = w; hudEls.goalBar.style.width = w; }
}

/* ---------------- layout rects for the 3D camera and previews ---------------- */

let rectsDirty = true;
let stageRect = { x: 0, y: 0, w: innerWidth, h: innerHeight };
let slotRects = null;

function measure() {
  rectsDirty = false;
  const el = app === 'title' || demo ? $('#title-stage') : $('#stage');
  const r = el.getBoundingClientRect();
  stageRect = r.width > 10 && r.height > 10
    ? { x: r.left, y: r.top, w: r.width, h: r.height }
    : { x: 0, y: 0, w: innerWidth, h: innerHeight };
  if (!demo && !$('#hud').hidden) {
    slotRects = [];
    for (const s of $$('.slot')) {
      const b = s.getBoundingClientRect();
      slotRects[Number(s.dataset.slot)] = b.width > 0 && b.height > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
    }
  } else slotRects = null;
  const p = $('#popups');
  p.style.left = `${stageRect.x}px`;
  p.style.top = `${stageRect.y}px`;
  p.style.width = `${stageRect.w}px`;
  p.style.height = `${stageRect.h * 0.8}px`;
}

addEventListener('resize', () => { rectsDirty = true; });
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(() => { rectsDirty = true; });
  ro.observe($('#stage'));
  ro.observe($('#title-stage'));
  ro.observe($('#touch'));
  for (const el of $$('.slot, .col')) ro.observe(el);
}
// Positions can shift without any observed size changing (fonts arriving,
// safe-area changes), so re-measure on those and on a slow heartbeat too.
if (document.fonts) document.fonts.ready.then(() => { rectsDirty = true; });
setInterval(() => { rectsDirty = true; }, 1000);

/* ---------------- input: keyboard ---------------- */

const codeToAction = () => {
  const map = new Map();
  for (const [action, keys] of Object.entries(S().bindings)) for (const k of keys) if (k) map.set(k, action);
  return map;
};
let keyMap = codeToAction();
let listening = null;           // { action, index, el } while rebinding

/* Browsers only allow audio after a gesture; the title theme starts on the first one. */
function wake() {
  audio.unlock();
  if (app === 'title' && audio.ctx && !audio.playing) audio.startMusic();
}

addEventListener('keydown', (e) => {
  wake();
  if (listening) { captureBinding(e); return; }
  const action = keyMap.get(e.code);

  if (app === 'playing' || app === 'countdown') {
    if (action || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (action === 'pause') return pauseGame();
    if (action === 'view') return cycleView();
    if (action && app === 'playing') controls.press(action);
    return;
  }

  // Menus.
  if (e.code === 'Escape' || (e.code === 'KeyP' && app === 'paused' && !screenStack.includes('settings'))) {
    e.preventDefault();
    if (app === 'paused' && screenStack.length <= 1) return resumeGame();
    if (app === 'over') return;
    if (screenStack.length > 1) return back();
    return;
  }
  if (app === 'over' && (e.code === 'Enter' || e.code === 'Space') && $('#results').classList.contains('show')) {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    return startGame(currentMode);
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    if (document.activeElement && document.activeElement.type === 'range') return;
    e.preventDefault();
    moveFocus(e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1);
  }
});

addEventListener('keyup', (e) => {
  const action = keyMap.get(e.code);
  if (!action || !controls) return;
  controls.release(action);
});

addEventListener('blur', () => {
  controls && controls.releaseAll();
  if (app === 'playing' || app === 'countdown') pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controls && controls.releaseAll();
    if (app === 'playing' || app === 'countdown') pauseGame();
    if (audio.ctx) audio.ctx.suspend();
  } else if (audio.ctx) audio.ctx.resume();
});

function moveFocus(dir) {
  const scr = $('.screen.show');
  if (!scr) return;
  const items = $$('button:not([disabled]), input', scr).filter((b) => b.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length] || items[0];
  next.focus();
  audio.play('ui');
}

function cycleView() {
  const i = VIEW_ORDER.indexOf(S().view);
  const v = VIEW_ORDER[(i + 1) % VIEW_ORDER.length];
  store.setSetting('view', v);
  if (renderer && !demo) renderer.setView(v);
  toast(`Camera · ${VIEW_NAMES[v]}`);
  syncSettingsUI();
}

/* ---------------- input: gamepad ---------------- */

const PAD = { 14: 'left', 15: 'right', 13: 'softDrop', 12: 'hardDrop', 0: 'rotateCW', 1: 'rotateCCW', 2: 'rotate180', 3: 'hold', 4: 'hold', 5: 'hold' };
const padPrev = new Map();

function pollGamepads() {
  if (!navigator.getGamepads) return;
  for (const gp of navigator.getGamepads()) {
    if (!gp) continue;
    const prev = padPrev.get(gp.index) || {};
    const now = {};
    gp.buttons.forEach((b, i) => { now[i] = b.pressed; });
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    now.stickL = ax < -0.55; now.stickR = ax > 0.55; now.stickD = ay > 0.6;
    const edge = (k) => now[k] && !prev[k];
    const fall = (k) => !now[k] && prev[k];

    if (app === 'playing') {
      for (const [btn, action] of Object.entries(PAD)) {
        if (edge(btn)) controls.press(action);
        if (fall(btn)) controls.release(action);
      }
      for (const [k, action] of [['stickL', 'left'], ['stickR', 'right'], ['stickD', 'softDrop']]) {
        if (edge(k)) controls.press(action);
        if (fall(k)) controls.release(action);
      }
      if (edge(9)) pauseGame();
    } else if (app !== 'countdown') {
      if (edge(12) || edge(14) || edge('stickL')) moveFocus(-1);
      if (edge(13) || edge(15) || edge('stickR')) moveFocus(1);
      if (edge(0) && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
      if (edge(1)) {
        if (app === 'paused' && screenStack.length <= 1) resumeGame();
        else if (screenStack.length > 1) back();
      }
      if (edge(9) && app === 'paused') resumeGame();
    }
    padPrev.set(gp.index, now);
  }
}

/* ---------------- input: touch ---------------- */

function setTouchVisible(inGame) {
  const mode = S().touchControls;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const show = inGame && (mode === 'on' || (mode === 'auto' && coarse));
  $('#touch').hidden = !show;
  document.body.classList.toggle('touch-on', show);
  requestAnimationFrame(() => {
    const h = show ? $('#touch').getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--touch-h', `${Math.round(h)}px`);
    rectsDirty = true;
  });
}

for (const btn of $$('#touch [data-act]')) {
  const action = btn.dataset.act;
  const down = (e) => {
    e.preventDefault();
    audio.unlock();
    btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    if (app === 'playing') controls.press(action);
    if (navigator.vibrate && (action === 'hardDrop')) navigator.vibrate(12);
  };
  const up = (e) => {
    e.preventDefault();
    btn.classList.remove('down');
    if (controls) controls.release(action);
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------------- menus ---------------- */

document.addEventListener('pointerdown', wake, { capture: true });
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    audio.play('uiSelect');
    showScreen(go.dataset.go);
    return;
  }
  if (e.target.closest('[data-back]')) return back();
  const card = e.target.closest('.mode-card[data-mode]');
  if (card) return startGame(card.dataset.mode);
});

$('#pause-btn').addEventListener('click', () => { pauseGame(); });
$('#view-btn').addEventListener('click', () => { cycleView(); });
$('#resume').addEventListener('click', resumeGame);
$('#restart').addEventListener('click', () => startGame(currentMode));
$('#quit').addEventListener('click', () => { audio.play('ui'); goTitle(); });
$('#retry').addEventListener('click', () => startGame(currentMode));
$('#to-title').addEventListener('click', () => { audio.play('ui'); goTitle(); });

for (const b of $$('.stepper .step')) {
  b.addEventListener('click', () => {
    const v = Math.min(20, Math.max(1, S().startLevel + Number(b.dataset.step)));
    store.setSetting('startLevel', v);
    $('#start-level').textContent = String(v);
    audio.play('ui');
  });
}

function refreshModeCards() {
  $('#start-level').textContent = String(S().startLevel);
  for (const el of $$('[data-best]')) {
    const m = el.dataset.best;
    const b = store.best(m);
    el.textContent = !b ? '' : m === 'sprint' ? `Best ${fmtTime(b.time)}` : `Best ${b.score.toLocaleString()}`;
  }
}

/* ---------------- settings UI ---------------- */

const RANGES = {
  'set-das': { key: 'das', fmt: (v) => `${v} ms`, to: (v) => v, from: (v) => v },
  'set-arr': { key: 'arr', fmt: (v) => (v === 0 ? 'Instant' : `${v} ms`), to: (v) => v, from: (v) => v },
  'set-music': { key: 'music', fmt: (v) => `${v}%`, to: (v) => v / 100, from: (v) => Math.round(v * 100) },
  'set-sfx': { key: 'sfx', fmt: (v) => `${v}%`, to: (v) => v / 100, from: (v) => Math.round(v * 100) }
};

for (const [id, cfg] of Object.entries(RANGES)) {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    $(`output[data-for="${id}"]`).textContent = cfg.fmt(v);
    store.setSetting(cfg.key, cfg.to(v));
    onSettingsChanged(cfg.key);
  });
}

for (const seg of $$('.seg[data-setting]')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    const key = seg.dataset.setting;
    let v = b.dataset.value;
    if (v === 'true' || v === 'false') v = v === 'true';
    else if (key === 'sdf') v = Number(v);
    store.setSetting(key, v);
    audio.play('ui');
    syncSettingsUI();
    onSettingsChanged(key);
  });
}

for (const tab of $$('.tab[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const t of $$('.tab[data-tab]')) t.setAttribute('aria-selected', String(t === tab));
    for (const b of $$('.tab-body')) b.hidden = b.dataset.body !== tab.dataset.tab;
    audio.play('ui');
  });
}

$('#reset-settings').addEventListener('click', () => {
  store.resetSettings();
  keyMap = codeToAction();
  audio.play('uiSelect');
  syncSettingsUI();
  for (const k of ['das', 'music', 'view', 'quality', 'ghost', 'touchControls']) onSettingsChanged(k);
  toast('Defaults restored');
});
$('#reset-bindings').addEventListener('click', () => {
  store.setSetting('bindings', DEFAULT_BINDINGS);
  keyMap = codeToAction();
  audio.play('uiSelect');
  renderBindings();
});

function onSettingsChanged(key) {
  const s = S();
  if (key === 'das' || key === 'arr') controls && controls.configure({ das: s.das, arr: s.arr });
  if (key === 'sdf' && game && !demo) game.sdf = s.sdf === 0 ? Infinity : s.sdf;
  if (key === 'music' || key === 'sfx') audio.setVolumes(s.music, s.sfx);
  if (key === 'view' && renderer && !demo) renderer.setView(s.view);
  if (key === 'touchControls') setTouchVisible(!demo && app !== 'title');
  applyRenderSettings();
}

function syncSettingsUI() {
  const s = S();
  for (const [id, cfg] of Object.entries(RANGES)) {
    const input = document.getElementById(id);
    const v = cfg.from(s[cfg.key]);
    input.value = String(v);
    $(`output[data-for="${id}"]`).textContent = cfg.fmt(v);
  }
  for (const seg of $$('.seg[data-setting]')) {
    const cur = String(s[seg.dataset.setting]);
    for (const b of $$('button', seg)) b.setAttribute('aria-pressed', String(b.dataset.value === cur));
  }
  renderBindings();
}

function keyName(code) {
  if (!code) return '';
  const names = {
    Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Backquote: '`', Slash: '/', Period: '.', Comma: ',',
    Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '='
  };
  if (names[code]) return names[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

function renderBindings() {
  const box = $('#bindings');
  box.replaceChildren();
  for (const action of Object.keys(DEFAULT_BINDINGS)) {
    const row = document.createElement('div');
    row.className = 'bind-row';
    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[action];
    row.appendChild(label);
    for (let i = 0; i < 2; i++) {
      const b = document.createElement('button');
      b.className = 'key-slot';
      b.textContent = keyName(S().bindings[action][i]);
      b.setAttribute('aria-label', `${ACTION_LABELS[action]} key ${i + 1}`);
      b.addEventListener('click', () => {
        if (listening) listening.el.classList.remove('listening');
        listening = { action, index: i, el: b };
        b.classList.add('listening');
        b.textContent = '…';
      });
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  for (const k of $$('kbd[data-bind]')) k.textContent = keyName(S().bindings[k.dataset.bind][0]);
}

function captureBinding(e) {
  e.preventDefault();
  e.stopPropagation();
  const { action, index } = listening;
  listening.el.classList.remove('listening');
  listening = null;
  if (e.code === 'Escape') { renderBindings(); return; }
  const b = JSON.parse(JSON.stringify(S().bindings));
  if (e.code === 'Backspace' || e.code === 'Delete') {
    b[action][index] = '';
  } else {
    for (const a of Object.keys(b)) b[a] = b[a].map((k) => (k === e.code ? '' : k)); // one action per key
    b[action][index] = e.code;
  }
  store.setSetting('bindings', b);
  keyMap = codeToAction();
  audio.play('uiSelect');
  renderBindings();
}

/* ---------------- records & help ---------------- */

let currentRecordTab = 'marathon';
for (const t of $$('.tab[data-rtab]')) {
  t.addEventListener('click', () => { audio.play('ui'); renderRecords(t.dataset.rtab); });
}

function recordTable(mode, highlightIndex = -1, limit = 10) {
  const list = store.records[mode].slice(0, limit);
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = mode === 'sprint' ? 'Finish 40 lines to set a time.' : 'No games yet. Go set one.';
    return p;
  }
  const table = document.createElement('table');
  table.className = 'rec-table';
  const main = mode === 'sprint' ? 'Time' : 'Score';
  const head = document.createElement('tr');
  for (const h of ['#', main, 'Lines', mode === 'sprint' || mode === 'ultra' ? 'PPS' : 'Level', 'Date']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  table.appendChild(head);
  list.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.className = 'me';
    const cells = [
      [String(i + 1), 'rank'],
      [mode === 'sprint' ? fmtTime(r.time) : r.score.toLocaleString(), 'main'],
      [String(r.lines), ''],
      [mode === 'sprint' || mode === 'ultra' ? r.pps.toFixed(2) : String(r.level), ''],
      [r.date, '']
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  return table;
}

function renderRecords(mode) {
  currentRecordTab = mode;
  for (const t of $$('.tab[data-rtab]')) t.setAttribute('aria-selected', String(t.dataset.rtab === mode));
  $('#record-table').replaceChildren(recordTable(mode));
}

function renderHelpKeys() {
  const dl = $('#help-keys');
  dl.replaceChildren();
  for (const action of Object.keys(DEFAULT_BINDINGS)) {
    const dt = document.createElement('dt');
    for (const k of S().bindings[action].filter(Boolean)) {
      const kbd = document.createElement('kbd');
      kbd.textContent = keyName(k);
      dt.appendChild(kbd);
    }
    const dd = document.createElement('dd');
    dd.textContent = ACTION_LABELS[action];
    dl.append(dt, dd);
  }
}

/* ---------------- results ---------------- */

function showResults(sum, rank) {
  const mode = sum.mode;
  const kicker = sum.finished ? (mode === 'ultra' ? 'Time up' : 'Complete') : 'Game over';
  $('#r-kicker').textContent = `${MODE_NAMES[mode]} · ${kicker}`;
  const sprintTime = mode === 'sprint' && sum.finished;
  $('#r-main').textContent = sprintTime ? fmtTime(sum.time) : sum.score.toLocaleString();
  $('#r-sub').textContent = sprintTime
    ? `${sum.pieces} pieces · ${sum.pps.toFixed(2)} per second`
    : mode === 'sprint' ? `${sum.lines} of 40 lines` : `${sum.lines} lines · level ${sum.level}`;
  $('#r-badge').hidden = rank !== 0;
  const stats = [
    ['Time', fmtTime(sum.time)], ['Lines', sum.lines], ['Pieces', sum.pieces], ['PPS', sum.pps.toFixed(2)],
    ['Tetrises', sum.tetrises], ['T-Spins', sum.tspins + sum.minis], ['Max combo', Math.max(0, sum.maxCombo)], ['Max B2B', Math.max(0, sum.maxB2B)]
  ];
  const box = $('#r-stats');
  box.replaceChildren();
  for (const [label, value] of stats) {
    const d = document.createElement('div');
    const l = document.createElement('label');
    l.textContent = label;
    const o = document.createElement('output');
    o.textContent = String(value);
    d.append(l, o);
    box.appendChild(d);
  }
  $('#r-table').replaceChildren(recordTable(mode, rank, 5));
  screenStack = [];
  showScreen('results');
}

/* ---------------- main loop ---------------- */

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  pollGamepads();

  if (game) {
    const ms = dt * 1000;
    if (demo) {
      bot.update(ms);
      game.update(ms);
      if (game.state === 'over') {
        demoRestart += dt;
        if (demoRestart > 2.5) { demoRestart = 0; newDemo(); }
      }
    } else if (app === 'playing') {
      controls.update(ms);
      game.update(ms);
    } else if (app === 'countdown') {
      tickCountdown(dt);
    }
    lockFromHardDrop = false;
    for (const e of game.drainEvents()) {
      if (e.type === 'hardDrop') lockFromHardDrop = true;
      handleEvent(e);
    }
    if (!demo) {
      updateHud();
      audio.setDanger(game.stackHeight() >= 15 && game.state === 'playing');
    }
  }

  if (renderer) {
    if (rectsDirty) measure();
    renderer.frame(dt, game, stageRect, slotRects);
  }
  requestAnimationFrame(loop);
}

/* ---------------- boot ---------------- */

async function boot() {
  syncSettingsUI();
  try {
    await initRenderer();
  } catch (err) {
    console.error(err);
    $('#fatal-msg').textContent += ` (${err.message})`;
    showScreen('fatal');
    return;
  }
  goTitle();
  requestAnimationFrame((t) => { last = t; loop(t); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (new URLSearchParams(location.search).has('test')) {
  window.__tetris = {
    get app() { return app; },
    get game() { return game; },
    get demo() { return demo; },
    get renderer() { return renderer; },
    store
  };
}

boot();
