/* App shell: fixed-step loop, screens, layout, input routing, sound cues and
   persistence. The simulation itself lives in engine.js. */

import { Game, DIR } from './engine.js';
import { botDirection } from './bot.js';
import { Renderer, FRAME_W, FRAME_H } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { drawGhost, COLORS } from './sprites.js';
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
renderer.crt = settings.crt;

const ui = {
  pauseBtn: $('#pause-btn'),
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
  last: performance.now()
};

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
  ui.pauseBtn.hidden = !inGame || state.stack.length > 0;
  ui.dpad.hidden = !inGame || !state.padVisible || state.stack.length > 0;
}

function focusFirst(name) {
  const el = ui.screens[name];
  if (!el) return;
  const target = el.querySelector('[autofocus]') || el.querySelector('.pill-primary') || el.querySelector('button, input');
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
  state.game = new Game({ seed: seed() });
  state.stack = [];
  state.overIn = -1;
  state.acc = 0;
  renderer.fx.reset();
  refreshScreens();
  document.activeElement?.blur?.();
}

function pause() {
  if (!playing()) return;
  sound.setLoop(null);
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
  refreshScreens();
  $('#btn-play').focus({ preventScroll: true });
}

function openGameOver() {
  const g = state.game;
  $('#over-score').textContent = g.score.toLocaleString('en-US');
  $('#over-level').textContent = String(g.level);
  $('#over-best').hidden = !(g.score > 0 && g.score > highScore());
  const form = $('#initials-form');
  state.entry = null;
  /* A qualifying score is stored immediately, so closing the tab can't lose
     it; entering initials only renames the stored row. */
  if (Save.qualifies(data.scores, g.score)) {
    const row = { name: (data.lastName || 'YOU').padEnd(3, ' '), score: g.score, level: g.level };
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
  for (const e of g.drainEvents()) {
    switch (e.type) {
      case 'dot':
        if (live) sound.waka();
        break;
      case 'power':
        fx.ring(e.c * 8 + 4, e.r * 8 + 4, '#ffd9c4', 26, 0.5, 1.6);
        if (live) sound.power();
        break;
      case 'ghostEaten':
        fx.burst(e.x, e.y, GHOST_HEX[e.ghost], 22, 75);
        fx.ring(e.x, e.y, '#2ee8ff', 20, 0.4);
        if (live) { sound.eatGhost(); buzz(25); }
        break;
      case 'fruit':
        fx.burst(e.x, e.y, '#ffa6ee', 18, 55);
        fx.ring(e.x, e.y, '#ffa6ee', 16, 0.4);
        if (live) sound.fruit();
        break;
      case 'extraLife':
        if (live) { sound.extraLife(); toast('EXTRA LIFE!'); }
        break;
      case 'death':
        if (!reducedMotion.matches) fx.shake = 1.4;
        if (live) buzz([50, 40, 110]);
        break;
      case 'deathAnim':
        if (live) sound.death();
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
        toast(settings.sound ? 'SOUND ON' : 'SOUND OFF');
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
  if (key === 'crt') renderer.crt = value;
  if (key === 'dpad') layout();
  syncSettings();
}

function syncSettings() {
  for (const el of $$('[data-setting]')) {
    const k = el.dataset.setting;
    if (el.type === 'checkbox') el.checked = !!settings[k];
    else {
      el.value = String(Math.round(settings[k] * 100));
      el.style.setProperty('--fill', `${el.value}%`);
    }
  }
}

for (const el of $$('[data-setting]')) {
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    const k = el.dataset.setting;
    setSetting(k, el.type === 'checkbox' ? el.checked : Number(el.value) / 100);
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
    li.textContent = 'NO SCORES YET. GO SET ONE!';
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
    lvl.textContent = `LEVEL ${s.level}`;
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
      toast('HIGH SCORES CLEARED');
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
  toast(`SAVED AS #${state.entry.rank + 1}`);
  $('[data-screen="over"] .pill-primary').focus({ preventScroll: true });
});

/* ------------------------------------------------------------- layout */

function insets() {
  const cs = getComputedStyle($('#safe-probe'));
  return {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0
  };
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const ins = insets();
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  const margin = 8;
  const area = { x: ins.l + margin, y: ins.t + margin, w: vw - ins.l - ins.r - margin * 2, h: vh - ins.t - ins.b - margin * 2 };
  const wantPad = isTouch && settings.dpad;
  const portrait = vh >= vw;

  let padZone = 0;
  if (wantPad && portrait) padZone = clamp(vh * 0.26, 150, 240);
  let s = Math.min(area.w / FRAME_W, (area.h - padZone) / FRAME_H);
  /* Never let the pad squeeze the board below a playable size. */
  if (padZone && s < area.w / FRAME_W * 0.72) { padZone = 0; s = Math.min(area.w / FRAME_W, area.h / FRAME_H); }
  const fw = FRAME_W * s, fh = FRAME_H * s;
  const fx = area.x + (area.w - fw) / 2;
  const fy = padZone ? area.y + Math.max(0, (area.h - padZone - fh) * 0.3) : area.y + (area.h - fh) / 2;
  const frame = { x: fx, y: fy, w: fw, h: fh };
  renderer.resize(vw, vh, dpr, frame);

  /* D-pad: centred under the board in portrait, in the widest side gutter in
     landscape, hidden when there is no room for a comfortable thumb target. */
  let pad = null;
  if (wantPad) {
    if (portrait && padZone) {
      const top = fy + fh, bottom = vh - ins.b;
      const size = Math.min(bottom - top - 20, 210, vw * 0.58);
      if (size >= 120) pad = { size, cx: vw / 2, cy: (top + bottom) / 2 };
    } else if (!portrait) {
      const gutter = Math.max(fx - ins.l, vw - ins.r - (fx + fw));
      const size = Math.min(gutter - 28, 190, vh * 0.55);
      if (size >= 120) {
        const right = vw - ins.r - (fx + fw) >= fx - ins.l;
        const cx = right ? (fx + fw + vw - ins.r) / 2 : (ins.l + fx) / 2;
        pad = { size, cx, cy: vh - ins.b - size / 2 - Math.max(24, vh * 0.08) };
      }
    }
  }
  state.padVisible = !!pad;
  if (pad) {
    ui.dpad.style.setProperty('--pad-size', `${Math.round(pad.size)}px`);
    ui.dpad.style.left = `${Math.round(pad.cx - pad.size / 2)}px`;
    ui.dpad.style.top = `${Math.round(pad.cy - pad.size / 2)}px`;
  }

  /* Pause: in the right-hand gutter beside the score rows when the screen has
     one, otherwise in the empty right end of the score rows themselves. It is
     never allowed to overlap the maze, which starts 24 units down. */
  const gutterR = vw - ins.r - (fx + fw);
  let hud, bx, by;
  if (gutterR >= 64) {
    hud = 48;
    bx = fx + fw + Math.min(16, (gutterR - hud) / 2);
    by = Math.max(ins.t + 8, fy);
  } else {
    /* At least 44 px for touch; it may rise into the top margin to get it. */
    const room = fy + 24 * s - 2 - (ins.t + 2);
    hud = Math.floor(clamp(Math.max(44, 24 * s - 2), 36, Math.min(48, room)));
    bx = fx + fw - hud;
    by = Math.max(ins.t + 2, fy + (24 * s - hud) / 2);
    if (by + hud > fy + 24 * s - 1) by = fy + 24 * s - 1 - hud;
  }
  ui.pauseBtn.style.setProperty('--hud-size', `${hud}px`);
  ui.pauseBtn.style.left = `${Math.round(bx)}px`;
  ui.pauseBtn.style.top = `${Math.round(by)}px`;
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

/* ------------------------------------------------------------- roster */

const rosterCanvases = $$('canvas[data-ghost]');
function drawRoster(time) {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  rosterCanvases.forEach((c, i) => {
    const px = 28 * dpr;
    if (c.width !== px) { c.width = px; c.height = px; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const k = (px / 16);
    g.setTransform(k, 0, 0, k, 0, 0);
    const look = [3, 2, 1, 0][Math.floor(time * 0.7 + i) % 4];
    drawGhost(g, 8, 8.4, { color: COLORS.ghost[c.dataset.ghost], dir: look, t: time * 8 + i });
  });
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
    time: state.time, demo: titleMode, highScore: highScore()
  });
  if (titleMode && !ui.screens.title.hidden) drawRoster(state.time);
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- boot */

async function boot() {
  newDemo();
  syncSettings();
  layout();
  try {
    await Promise.race([
      document.fonts.load('8px "Press Start 2P"'),
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
