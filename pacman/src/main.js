/* App shell: fixed-step loop, screens, layout, input routing, sound cues and
   persistence. The simulation itself lives in engine.js. */

import { Game, DIR, fruitShelf } from './engine.js';
import { botDirection } from './bot.js';
import { Renderer, BOARD_W, BOARD_H, SLAB_PAD } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { drawGhost, drawPac, drawFruit, COLORS } from './sprites.js';
import * as Save from './save.js';

const STEP = 1 / 60;
const MAX_STEPS = 6;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const seed = () => (Math.random() * 2 ** 31) >>> 0;

const root = document.documentElement;
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
root.classList.toggle('touch', isTouch);
root.classList.toggle('vibrate', isTouch && typeof navigator.vibrate === 'function');

const data = Save.load();
const settings = data.settings;
const persist = () => Save.store(data);

const sound = new Sound();
sound.enabled = settings.sound;
sound.volume = settings.volume;

const renderer = new Renderer($('#stage'));
renderer.quality = settings.lighting ? 'high' : 'low';

const ui = {
  pauseBtn: $('#pause-btn'),
  hud: $('#hud'),
  hudTop: $('#hud-top'),
  hudBottom: $('#hud-bottom'),
  score: $('#hud-score'),
  best: $('#hud-best'),
  level: $('#hud-level'),
  lives: $('#hud-lives'),
  fruit: $('#hud-fruit'),
  dpad: $('#dpad'),
  toast: $('#toast'),
  screens: Object.fromEntries($$('[data-screen]').map((el) => [el.dataset.screen, el]))
};

const state = {
  mode: 'title',            // 'title' | 'game'
  game: null,
  demo: null,
  demoOverFor: 0,
  stack: [],                // open overlay screens, top last
  overIn: -1,               // seconds until the game-over panel opens
  entry: null,              // pending high-score entry
  acc: 0,
  time: 0,
  last: performance.now(),
  hud: { shown: -1, best: -1, lives: -1, level: -1 }
};
const dprNow = () => clamp(window.devicePixelRatio || 1, 1, 3);

const highScore = () => (data.scores[0] ? data.scores[0].score : 0);
const playing = () => state.mode === 'game' && state.stack.length === 0 && state.game && state.game.phase !== 'gameover';

/* --------------------------------------------------------------- demo */

function newDemo() {
  state.demo = new Game({ seed: seed() });
  state.demo.phaseTimer = 75;
  state.demo.drainEvents();
  state.demoOverFor = 0;
}

/* ------------------------------------------------------------- screens */

function refreshScreens() {
  $$('[data-armed]').forEach(disarm);
  const top = state.stack[state.stack.length - 1];
  for (const [name, el] of Object.entries(ui.screens)) {
    el.hidden = name === 'title' ? state.mode !== 'title' : name !== top;
  }
  const inGame = state.mode === 'game';
  ui.hud.hidden = !inGame;
  ui.dpad.hidden = !inGame || !state.padVisible || state.stack.length > 0;
}

function focusFirst(name) {
  const el = ui.screens[name];
  if (!el) return;
  const target = el.querySelector('[autofocus]') || el.querySelector('.btn-primary') || el.querySelector('button, input');
  if (target && !isTouch) target.focus({ preventScroll: true });
}

function open(name) {
  state.stack.push(name);
  if (name === 'scores') renderScores();
  if (name === 'settings') syncSettings();
  refreshScreens();
  focusFirst(name);
}

function back() {
  const top = state.stack.pop();
  if (top === 'over') state.stack.push('over');           // game over is left via its buttons
  refreshScreens();
  const now = state.stack[state.stack.length - 1];
  if (now) focusFirst(now);
  else if (state.mode === 'title') $('#btn-play').focus({ preventScroll: true });
}

function toast(text, ms = 1600) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.classList.remove('show'), ms);
}

/* ----------------------------------------------------------- game flow */

function startGame() {
  finalizeEntry();
  sound.unlock();
  state.mode = 'game';
  state.game = new Game({ seed: seed(), difficulty: settings.difficulty });
  state.stack = [];
  state.overIn = -1;
  state.acc = 0;
  renderer.fx.reset();
  state.hud = { shown: 0, best: -1, lives: -1, level: -1 };
  refreshScreens();
  document.activeElement?.blur?.();
}

function pause() {
  if (!playing()) return;
  sound.setLoop(null);
  const g = state.game;
  $('#pause-sub').textContent = `Level ${g.level} · ${g.score.toLocaleString('en-US')} points`;
  open('pause');
}

function resume() {
  state.stack = [];
  state.last = performance.now();
  refreshScreens();
}

function quitToTitle() {
  finalizeEntry();
  state.mode = 'title';
  state.game = null;
  state.stack = [];
  sound.setLoop(null);
  renderer.fx.reset();
  newDemo();
  refreshTitleBest();
  refreshScreens();
  $('#btn-play').focus({ preventScroll: true });
}

function openGameOver() {
  const g = state.game;
  $('#over-score').textContent = g.score.toLocaleString('en-US');
  $('#over-level').textContent = String(g.level);
  const st = g.stats;
  const secs = Math.round(st.frames / 60);
  $('#st-dots').textContent = st.dots.toLocaleString('en-US');
  $('#st-ghosts').textContent = String(st.ghosts);
  $('#st-combo').textContent = st.bestCombo ? `×${st.bestCombo}` : '—';
  $('#st-fruit').textContent = String(st.fruit);
  $('#st-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('#over-best').hidden = !(g.score > 0 && g.score > highScore());
  const form = $('#initials-form');
  state.entry = null;
  /* A qualifying score is stored immediately, so closing the tab can't lose
     it; entering initials only renames the stored row. */
  if (Save.qualifies(data.scores, g.score)) {
    const row = { name: (data.lastName || 'YOU').padEnd(3, ' '), score: g.score, level: g.level, mode: g.difficulty };
    const { scores, rank } = Save.insertScore(data.scores, row);
    data.scores = scores;
    persist();
    state.entry = { row, rank, named: false };
    $('#initials').value = data.lastName || '';
  }
  form.hidden = !state.entry;
  open('over');
  if (state.entry && !isTouch) $('#initials').focus();
}

function nameEntry(raw) {
  const e = state.entry;
  if (!e || e.named) return false;
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (!clean) return false;
  e.row.name = clean.padEnd(3, ' ');
  e.named = true;
  data.lastName = clean;
  persist();
  return true;
}

/* Leaving the game-over screen with initials typed but not submitted still
   applies them. */
function finalizeEntry() {
  if (state.entry && !state.entry.named && !$('#initials-form').hidden) nameEntry($('#initials').value);
}

/* ------------------------------------------------------- event wiring */

const GHOST_HEX = COLORS.ghost;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function buzz(pattern) {
  if (settings.haptics && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}

function handleEvents(g) {
  const live = g === state.game;
  const fx = renderer.fx;
  const rich = renderer.quality === 'high';
  for (const e of g.drainEvents()) {
    switch (e.type) {
      case 'dot':
        if (live) sound.waka();
        if (rich) fx.burst(e.c * 8 + 4, e.r * 8 + 4, '#ffd2b8', 3, 26, 0.28, 0.55);
        break;
      case 'power':
        fx.ring(e.c * 8 + 4, e.r * 8 + 4, '#ffc9a8', 34, 0.6, 1.8);
        fx.burst(e.c * 8 + 4, e.r * 8 + 4, '#ffd2b8', 14, 60, 0.5, 0.9);
        fx.wallFlash = 1;
        fx.wallFlashColor = '#8fa2ff';
        fx.punch = 1;
        if (live) sound.power();
        break;
      case 'ghostEaten':
        fx.burst(e.x, e.y, GHOST_HEX[e.ghost], 18, 80, 0.7, 1.2, 'shard');
        fx.burst(e.x, e.y, '#ffffff', 8, 40, 0.4, 0.7);
        fx.ring(e.x, e.y, '#5ff4ff', 22, 0.45, 1.6);
        fx.punch = 1;
        if (live) { sound.eatGhost(); buzz(25); }
        break;
      case 'fruit':
        fx.burst(e.x, e.y, '#ff9fd8', 18, 60, 0.6, 1, 'shard');
        fx.ring(e.x, e.y, '#ff9fd8', 18, 0.45);
        if (live) sound.fruit();
        break;
      case 'extraLife':
        if (live) { sound.extraLife(); toast('Extra life!'); }
        break;
      case 'death':
        if (settings.shake && !reducedMotion.matches) fx.shake = 1.6;
        if (live) buzz([50, 40, 110]);
        break;
      case 'deathAnim':
        if (live) sound.death();
        break;
      case 'levelClear':
        for (const [col, n] of [['#ffd93b', 18], ['#2fe4ff', 14], ['#ff8fd8', 14]]) fx.burst(g.pac.x, g.pac.y, col, n, 110, 1, 1.1, 'shard');
        break;
      case 'mazeFlash':
        if (live) sound.levelClear();
        break;
      case 'intermission':
        if (live) sound.intermission();
        break;
      case 'gameStart':
        if (live) sound.intro();
        break;
      case 'gameOver':
        if (live) { sound.gameOver(); state.overIn = 2.2; }
        break;
      default:
        break;
    }
  }
}

function updateLoopSound() {
  const g = state.game;
  if (!playing() || !g) { sound.setLoop(null); return; }
  if (g.phase !== 'playing') { sound.setLoop(null); return; }
  if (g.ghosts.some((x) => x.state === 'eyes' || x.state === 'entering')) sound.setLoop('eyes');
  else if (g.frightActive) sound.setLoop('fright');
  else {
    const left = g.dotsLeft;
    sound.setLoop('siren', left > 180 ? 0 : left > 120 ? 1 : left > 70 ? 2 : left > 30 ? 3 : 4);
  }
}

/* -------------------------------------------------------------- input */

function focusables() {
  const top = state.stack[state.stack.length - 1] || (state.mode === 'title' ? 'title' : null);
  if (!top) return [];
  return [...ui.screens[top].querySelectorAll('button, input')].filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
}

const input = new Input({
  surface: $('#stage'),
  dpad: ui.dpad,
  onDir(d, source) {
    if (playing()) { state.game.setInput(d); return true; }
    if (source !== 'key' && source !== 'pad') return false;
    const active = document.activeElement;
    if (active && active.type === 'range' && (d === DIR.LEFT || d === DIR.RIGHT)) return false;
    const list = focusables();
    if (!list.length) return false;
    const i = list.indexOf(active);
    const fwd = d === DIR.DOWN || d === DIR.RIGHT;
    const next = i < 0 ? list[0] : list[(i + (fwd ? 1 : -1) + list.length) % list.length];
    next.focus({ preventScroll: false });
    return true;
  },
  onCommand(cmd, opts) {
    switch (cmd) {
      case 'gesture':
        sound.unlock();
        return false;
      case 'pause':
        if (playing()) pause();
        else if (state.stack[state.stack.length - 1] === 'pause') resume();
        return true;
      case 'back':
        if (state.stack.length) {
          if (state.stack[state.stack.length - 1] === 'pause') resume();
          else back();
        } else if (playing()) pause();
        return true;
      case 'mute':
        setSetting('sound', !settings.sound);
        toast(settings.sound ? 'Sound on' : 'Sound off');
        return true;
      case 'confirm': {
        if (playing() && state.game.phase === 'intermission') { state.game.nextLevel(); return true; }
        const a = document.activeElement;
        if (a && a !== document.body && (a.tagName === 'BUTTON' || a.tagName === 'INPUT')) {
          /* Keyboards activate buttons natively; gamepads and checkboxes don't. */
          if (opts && opts.pad && a.tagName === 'BUTTON') { a.click(); return true; }
          if (a.tagName === 'INPUT' && a.type === 'checkbox') { a.click(); return true; }
          return false;
        }
        if (state.mode === 'title' && !state.stack.length) { startGame(); return true; }
        return false;
      }
      default:
        return false;
    }
  }
});

/* ------------------------------------------------------------ settings */

function setSetting(key, value) {
  settings[key] = value;
  persist();
  if (key === 'sound') sound.setEnabled(value);
  if (key === 'volume') sound.setVolume(value);
  if (key === 'lighting') renderer.quality = value ? 'high' : 'low';
  if (key === 'dpad') layout();
  syncSettings();
}

function syncSettings() {
  for (const el of $$('[data-setting]')) {
    const k = el.dataset.setting;
    if (el.type === 'checkbox') el.checked = !!settings[k];
    else if (el.type === 'radio') el.checked = settings[k] === el.value;
    else {
      el.value = String(Math.round(settings[k] * 100));
      el.style.setProperty('--fill', `${el.value}%`);
    }
  }
}

for (const el of $$('[data-setting]')) {
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    const k = el.dataset.setting;
    setSetting(k, el.type === 'checkbox' ? el.checked : el.type === 'radio' ? el.value : Number(el.value) / 100);
    if (k === 'sound' && el.checked) { sound.unlock(); sound.click(); }
  });
}
$$('[data-setting="volume"]').forEach((el) => el.addEventListener('change', () => sound.click()));

function renderScores() {
  const list = $('#score-table');
  list.textContent = '';
  if (!data.scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scores yet. Go set one!';
    list.append(li);
    return;
  }
  data.scores.forEach((s, i) => {
    const li = document.createElement('li');
    if (state.entry && state.entry.row === s) li.classList.add('fresh');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = s.name;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = s.score.toLocaleString('en-US');
    const lvl = document.createElement('small');
    lvl.className = 'lvl';
    lvl.textContent = `Level ${s.level} · ${s.mode === 'arcade' ? 'Arcade' : 'Easy'}`;
    pts.append(lvl);
    li.append(rank, who, pts);
    list.append(li);
  });
}

/* ------------------------------------------------------------- clicks */

$('#btn-play').addEventListener('click', startGame);
ui.pauseBtn.addEventListener('click', () => { sound.unlock(); pause(); });

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  sound.unlock();
  if (btn.dataset.open) { sound.click(); open(btn.dataset.open); return; }
  const act = btn.dataset.action;
  if (!act) return;
  sound.click();
  /* Destructive actions need a second tap within three seconds. */
  if (btn.dataset.confirm && !btn.dataset.armed) {
    const label = btn.querySelector('span');
    btn.dataset.armed = '1';
    btn.dataset.label = label.textContent;
    label.textContent = btn.dataset.confirm;
    btn.classList.add('armed');
    clearTimeout(btn.disarm);
    btn.disarm = setTimeout(() => disarm(btn), 3000);
    return;
  }
  disarm(btn);
  switch (act) {
    case 'back': back(); break;
    case 'resume': resume(); break;
    case 'restart': startGame(); break;
    case 'again': startGame(); break;
    case 'quit': quitToTitle(); break;
    case 'reset-scores':
      data.scores = [];
      state.entry = null;
      persist();
      toast('High scores cleared');
      break;
    default: break;
  }
});

function disarm(btn) {
  clearTimeout(btn.disarm);
  if (!btn.dataset.armed) return;
  delete btn.dataset.armed;
  btn.querySelector('span').textContent = btn.dataset.label;
  btn.classList.remove('armed');
}

$('#initials').addEventListener('input', (e) => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (v !== e.target.value) e.target.value = v;
});
$('#initials-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!nameEntry($('#initials').value)) { $('#initials').focus(); return; }
  $('#initials-form').hidden = true;
  $('#initials').blur();
  sound.click();
  toast(`Saved as #${state.entry.rank + 1}`);
  $('[data-screen="over"] .btn-primary').focus({ preventScroll: true });
});

/* ------------------------------------------------------------- layout */

function insets() {
  const cs = getComputedStyle($('#safe-probe'));
  return {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0
  };
}

/* The board is drawn with a slab margin around it, so layout works in slab
   units: the maze plus SLAB_PAD on every side. */
const SLAB_W = BOARD_W + SLAB_PAD * 2;
const SLAB_H = BOARD_H + SLAB_PAD * 2;
const HUD_TOP = 58;
const HUD_BOTTOM = 40;
const HUD_GAP = 10;

function place(el, x, y, w = null, h = null) {
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.width = w === null ? '' : `${Math.round(w)}px`;
  el.style.height = h === null ? '' : `${Math.round(h)}px`;
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ins = insets();
  const dpr = dprNow();
  const margin = 10;
  const area = { x: ins.l + margin, y: ins.t + margin, w: vw - ins.l - ins.r - margin * 2, h: vh - ins.t - ins.b - margin * 2 };
  const wantPad = isTouch && settings.dpad;
  const portrait = vh >= vw;

  /* Side layout -- HUD in the gutters beside a full-height board -- whenever
     the screen is wide enough to leave real gutters; otherwise HUD bars are
     stacked above and below. */
  const sSide = Math.min(area.w / SLAB_W, area.h / SLAB_H);
  const side = !portrait && (area.w - SLAB_W * sSide) / 2 >= 150;

  let s, slabX, slabY, padZone = 0;
  if (side) {
    s = sSide;
    slabX = area.x + (area.w - SLAB_W * s) / 2;
    slabY = area.y + (area.h - SLAB_H * s) / 2;
  } else {
    const chrome = HUD_TOP + HUD_BOTTOM + HUD_GAP * 2;
    if (wantPad && portrait) padZone = clamp(vh * 0.24, 150, 230);
    s = Math.min(area.w / SLAB_W, (area.h - chrome - padZone) / SLAB_H);
    if (padZone && s < (area.w / SLAB_W) * 0.72) { padZone = 0; s = Math.min(area.w / SLAB_W, (area.h - chrome) / SLAB_H); }
    const groupH = SLAB_H * s + chrome;
    const spare = area.h - padZone - groupH;
    slabX = area.x + (area.w - SLAB_W * s) / 2;
    slabY = area.y + HUD_TOP + HUD_GAP + Math.max(0, padZone ? spare * 0.3 : spare / 2);
  }
  const board = { x: slabX + SLAB_PAD * s, y: slabY + SLAB_PAD * s, w: BOARD_W * s, h: BOARD_H * s };
  renderer.resize(vw, vh, dpr, board);

  const slabW = SLAB_W * s, slabH = SLAB_H * s;
  ui.hud.classList.toggle('side', side);
  root.style.setProperty('--hud-value', `${Math.round(clamp(s * 9, 20, 34))}px`);
  if (side) {
    const gw = Math.min(230, slabX - ins.l - 32);
    const gx = slabX - 24 - gw;
    place(ui.hudTop, gx, slabY + 6, gw);
    place(ui.hudBottom, gx, slabY + slabH - 6 - 150, gw, 150);
    /* Pause takes the top of the opposite gutter, clear of the stat cards
       and above the D-pad. */
    place(ui.pauseBtn, slabX + slabW + 24, slabY + 6);
  } else {
    place(ui.hudTop, slabX + 4, slabY - HUD_GAP - HUD_TOP, slabW - 8, HUD_TOP);
    ui.pauseBtn.style.left = ui.pauseBtn.style.top = '';
    place(ui.hudBottom, slabX + 6, slabY + slabH + HUD_GAP, slabW - 12, HUD_BOTTOM);
  }

  /* D-pad: centred under the board in portrait, in the right gutter in
     landscape, hidden when there is no room for a comfortable thumb target. */
  let pad = null;
  if (wantPad) {
    if (portrait && padZone) {
      const top = slabY + slabH + HUD_GAP + HUD_BOTTOM, bottom = vh - ins.b;
      const size = Math.min(bottom - top - 24, 210, vw * 0.58);
      if (size >= 120) pad = { size, cx: vw / 2, cy: (top + bottom) / 2 };
    } else if (!portrait) {
      const gutter = vw - ins.r - (slabX + slabW);
      const size = Math.min(gutter - 32, 190, vh * 0.55);
      if (size >= 120) pad = { size, cx: (slabX + slabW + vw - ins.r) / 2, cy: vh - ins.b - size / 2 - Math.max(24, vh * 0.08) };
    }
  }
  state.padVisible = !!pad;
  if (pad) {
    ui.dpad.style.setProperty('--pad-size', `${Math.round(pad.size)}px`);
    place(ui.dpad, pad.cx - pad.size / 2, pad.cy - pad.size / 2);
  }
  state.hud.lives = -1;
  state.hud.level = -1;
  refreshScreens();
}

let resizeQueued = false;
function queueLayout() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; layout(); });
}
window.addEventListener('resize', queueLayout);
window.visualViewport?.addEventListener('resize', queueLayout);
window.addEventListener('orientationchange', queueLayout);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (playing()) pause();
    sound.suspend();
  } else {
    sound.resume();
    state.last = performance.now();
  }
});
window.addEventListener('blur', () => { if (playing()) pause(); });

/* ------------------------------------------------------------- HUD */

function iconCanvas(cssSize, draw) {
  const dpr = dprNow();
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(cssSize * dpr);
  const g = c.getContext('2d');
  const k = c.width / 16;
  g.setTransform(k, 0, 0, k, 0, 0);
  draw(g);
  return c;
}

function updateHud(dt) {
  const g = state.game;
  if (!g || ui.hud.hidden) return;
  const h = state.hud;
  /* Score counts up rather than jumping; the bump marks every gain. */
  if (h.shown !== g.score) {
    const gap = g.score - h.shown;
    h.shown = gap < 0 ? g.score : Math.min(g.score, Math.ceil(h.shown + Math.max(gap * Math.min(1, dt * 14), 1)));
    ui.score.textContent = h.shown.toLocaleString('en-US');
    ui.score.classList.add('bump');
    clearTimeout(h.bumpT);
    h.bumpT = setTimeout(() => ui.score.classList.remove('bump'), 90);
  }
  const best = Math.max(highScore(), g.score);
  if (h.best !== best) { h.best = best; ui.best.textContent = best.toLocaleString('en-US'); }
  if (h.lives !== g.lives) {
    h.lives = g.lives;
    ui.lives.replaceChildren(...Array.from({ length: Math.min(g.lives, 6) }, () =>
      iconCanvas(20, (c) => drawPac(c, 8, 8, 6.6, 0.6, 1))));
  }
  if (h.level !== g.level) {
    h.level = g.level;
    ui.level.textContent = String(g.level);
    ui.fruit.replaceChildren(...fruitShelf(g.level).slice(-5).map((kind) =>
      iconCanvas(20, (c) => drawFruit(c, kind, 8, 8.5, 1.05))));
  }
}

/* ----------------------------------------------------------- title art */

const castCanvases = $$('canvas[data-ghost]');
const hero = $('#hero');

function drawCast(time) {
  const dpr = dprNow();
  castCanvases.forEach((c, i) => {
    const css = c.clientWidth || 46;
    const px = Math.round(css * dpr);
    if (c.width !== px) { c.width = px; c.height = px; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const k = px / 17;
    g.setTransform(k, 0, 0, k, 0, 0);
    const look = [3, 2, 1, 0][Math.floor(time * 0.6 + i * 0.7) % 4];
    drawGhost(g, 8.5, 8.2, { color: COLORS.ghost[c.dataset.ghost], dir: look, t: time * 7 + i });
  });
}

/* The title strip: Pac-Man chased by the four ghosts until he reaches the
   power pellet, then the chase reverses and he eats them one by one. */
function drawHero(time) {
  if (!hero || hero.offsetParent === null) return;
  const dpr = dprNow();
  const cw = hero.clientWidth, ch = hero.clientHeight;
  if (hero.width !== Math.round(cw * dpr)) { hero.width = Math.round(cw * dpr); hero.height = Math.round(ch * dpr); }
  const g = hero.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, hero.width, hero.height);
  const k = (ch * dpr) / 22;
  g.setTransform(k, 0, 0, k, 0, 0);
  const W = (cw * dpr) / k, y = 11;
  const P = 9, t = time % P;
  const turn = W * 0.8;
  const names = ['blinky', 'pinky', 'inky', 'clyde'];
  const mouth = 0.95 * (0.5 - 0.5 * Math.cos(time * 9));
  if (t < P / 2) {
    const f = t / (P / 2);
    const px = -20 + (turn + 20) * f;
    for (let i = 0; i < 9; i++) {
      const dx = 12 + i * ((turn - 18) / 9);
      if (dx > px) { g.fillStyle = '#ffd9c4'; g.beginPath(); g.arc(dx, y, 1.1, 0, Math.PI * 2); g.fill(); }
    }
    if (px < turn) {
      const pg = g.createRadialGradient(turn + 4, y, 0, turn + 4, y, 3.4);
      pg.addColorStop(0, '#fff'); pg.addColorStop(1, '#ff9a6a');
      g.fillStyle = pg; g.beginPath(); g.arc(turn + 4, y, 3.2 + Math.sin(time * 7) * 0.3, 0, Math.PI * 2); g.fill();
    }
    drawPac(g, px, y, 6.5, mouth, 3);
    names.forEach((n, i) => drawGhost(g, px - 22 - i * 16, y, { color: COLORS.ghost[n], dir: 3, t: time * 8 + i }));
  } else {
    const f = (t - P / 2) / (P / 2);
    const travel = turn + 90;
    const px = turn + 4 - travel * 1.18 * f;
    names.forEach((n, i) => {
      const gx = turn - 22 - i * 16 - travel * f;
      const eaten = px < gx + 3;
      drawGhost(g, gx, y, { color: COLORS.ghost[n], dir: 1, t: time * 8 + i, mode: eaten ? 'eyes' : (f > 0.8 && Math.floor(time * 6) % 2 ? 'flash' : 'fright') });
    });
    drawPac(g, px, y, 6.5, mouth, 1);
  }
}

/* --------------------------------------------------------------- loop */

function frame(now) {
  const dt = Math.min(0.1, (now - state.last) / 1000);
  state.last = now;
  state.time += dt;
  input.pollGamepads();

  const titleMode = state.mode === 'title';
  const g = titleMode ? state.demo : state.game;
  const running = titleMode || (state.mode === 'game' && state.stack.length === 0);

  if (running) {
    state.acc += dt;
    let n = 0;
    while (state.acc >= STEP && n < MAX_STEPS) {
      if (titleMode) g.setInput(botDirection(g));
      g.step();
      handleEvents(g);
      state.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) state.acc = 0;
    renderer.fx.update(dt);
  }

  if (titleMode && g.phase === 'gameover' && (state.demoOverFor += dt) > 2.5) newDemo();
  if (state.mode === 'game' && state.overIn > 0 && !state.stack.includes('over')) {
    state.overIn -= dt;
    if (state.overIn <= 0) openGameOver();
  }

  updateLoopSound();
  renderer.draw(titleMode ? state.demo : g, running ? state.acc / STEP : 1, {
    time: state.time, demo: titleMode, reducedMotion: reducedMotion.matches || !settings.shake
  });
  if (titleMode && !ui.screens.title.hidden) { drawCast(state.time); drawHero(state.time); }
  updateHud(dt);
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- boot */

function refreshTitleBest() {
  const best = highScore();
  $('#title-best').hidden = !best;
  $('#title-best-value').textContent = best.toLocaleString('en-US');
}

async function boot() {
  newDemo();
  refreshTitleBest();
  syncSettings();
  layout();
  try {
    await Promise.race([
      document.fonts.load('700 16px "Outfit"'),
      new Promise((r) => setTimeout(r, 1500))
    ]);
  } catch { /* fall back to the monospace stack */ }
  state.last = performance.now();
  requestAnimationFrame(frame);
  if (!isTouch) $('#btn-play').focus({ preventScroll: true });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();

/* Exposed for the automated playtest only. */
window.__pacman = { state, settings, data, renderer, startGame, pause, resume, quitToTitle, layout };
