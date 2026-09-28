// Boot, main loop, screens and glue between simulation, renderer, audio,
// input and storage.
import { CONFIG, toKmh } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Save } from './save.js';
import { autopilot } from './autopilot.js';
import { randomSeed, seedFrom } from './rng.js';
import { drawYeti } from './characters.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const save = new Save();
const renderer = new Renderer(canvas);
const sound = new Sound();
const input = new Input(window, canvas);

// title | controls | options | about | playing | paused | over
let mode = 'title';
let game = null; // the live run
let demo = null; // attract mode behind the menus
let lastTs = 0;
let needsDraw = true;
let touchSeen = false;
let wasTurbo = false;
let portraitTipShown = false;
let demoStuck = 0;

const SCREENS = ['title', 'controls', 'options', 'about', 'pause', 'over'];
const coarse = matchMedia('(pointer: coarse)');

// ------------------------------------------------------------- screens

function show(id) {
  // Drop focus from a button that's about to vanish, or its keyup would click it.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  for (const s of SCREENS) $('#' + s).classList.toggle('hidden', s !== id);
  const hudOn = mode === 'playing' || mode === 'paused' || mode === 'over';
  $('#hud').classList.toggle('hidden', !hudOn);
  updateTouchUI();
  // Keyboard users land on the main action; touch users don't get a focus ring.
  if (id && !touchSeen) {
    const btn = $('#' + id + ' .btn.primary') || $('#' + id + ' .btn');
    btn?.focus({ preventScroll: true });
  }
}

function showTitle() {
  mode = 'title';
  game = null;
  input.capture = false;
  input.clear();
  sound.resume();
  if (!demo) newDemo();
  renderer.reset();
  refreshBestLine();
  show('title');
  needsDraw = true;
}

function openPanel(name) {
  mode = name;
  if (name === 'about') refreshStatsLine();
  show(name);
}

function refreshBestLine() {
  const b = save.data.best;
  $('#best-line').textContent = b.score > 0 ? `Best: ${fmtInt(b.score)} pts · ${fmtInt(b.distance)}m · ${Math.round(b.maxSpeed)} km/h` : '';
}

function refreshStatsLine() {
  const t = save.data.totals;
  $('#stats-line').textContent = t.runs
    ? `You've skied ${fmtInt(t.distance)}m over ${t.runs} run${t.runs === 1 ? '' : 's'}, been eaten ${t.eaten} time${t.eaten === 1 ? '' : 's'} and escaped ${t.escapes}.`
    : '';
}

function updateTouchUI() {
  const pref = save.settings.touch;
  const touchy = pref === 'on' || (pref === 'auto' && (touchSeen || coarse.matches));
  document.body.classList.toggle('touch-ui', touchy);
  $('#touch').classList.toggle('hidden', !(touchy && mode === 'playing'));
}

let toastTimer = 0;
function toast(text, ms = 2200, warn = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('warn', warn);
  el.classList.remove('hidden');
  // Restart the entry animation.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.add('hidden');
}

// ------------------------------------------------------------------ runs

function pickSeed() {
  const s = save.settings;
  if (s.seedMode === 'fixed' && s.seed.trim()) return seedFrom(s.seed);
  return randomSeed();
}

function newDemo() {
  demo = new Game({ seed: randomSeed(), demo: true });
  demo.setViewSize(renderer.viewW, renderer.viewH);
  demoStuck = 0;
}

function startRun(seed = pickSeed()) {
  sound.unlock();
  sound.resume();
  game = new Game({ seed });
  game.setViewSize(renderer.viewW, renderer.viewH);
  renderer.reset();
  mode = 'playing';
  input.capture = true;
  input.clear();
  wasTurbo = false;
  hideToast();
  show(null);
  sound.play('start');
  lastTs = performance.now();
  const runs = save.data.totals.runs;
  if (runs < 3) {
    const touchy = document.body.classList.contains('touch-ui');
    toast(touchy ? 'Steer with the pad · HOP to jump · hold F to go fast' : '← → steer · ↓ brake · Space hop · F go fast', 4200);
  }
  if (touchSeen && innerHeight > innerWidth && !portraitTipShown) {
    portraitTipShown = true;
    setTimeout(() => mode === 'playing' && toast('Tip: turn your phone sideways for a wider view', 3000), 4400);
  }
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.clear();
  sound.pause();
  hideToast();
  $('#pause-seed').textContent = `Mountain #${game.seed}`;
  show('pause');
  needsDraw = true;
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'playing';
  input.clear();
  sound.resume();
  lastTs = performance.now();
  show(null);
}

function gameOver() {
  mode = 'over';
  input.capture = false;
  const s = game.stats;
  const run = {
    score: game.score,
    distance: Math.floor(s.distance),
    maxSpeed: Math.round(toKmh(s.maxSpeed)),
    escapes: s.yetiEscapes,
    eaten: true,
  };
  const broke = save.recordRun(run);
  $('#over-dist').textContent = fmtInt(run.distance) + 'm';
  $('#over-score').textContent = fmtInt(run.score);
  $('#over-speed').textContent = run.maxSpeed + ' km/h';
  $('#over-escapes').textContent = String(run.escapes);
  $('#over-escapes-row').classList.toggle('hidden', run.escapes === 0);
  $('#over-title').textContent = run.escapes > 0 ? 'The Yeti got you in the end' : 'Eaten by the Yeti';
  const badges = [];
  if (broke.score) badges.push('New best score!');
  else if (broke.distance) badges.push('Longest run yet!');
  if (broke.maxSpeed && !broke.score) badges.push('Fastest ever!');
  $('#over-best').textContent = badges.join(' ');
  $('#over-best').classList.toggle('hidden', badges.length === 0);
  show('over');
  sound.play('gameover');
}

// ---------------------------------------------------------------- events

function handleEvents(g, live) {
  const ev = g.events;
  if (!ev.length) return;
  renderer.handleEvents(ev, g);
  if (live) {
    for (const e of ev) {
      switch (e.type) {
        case 'yeti':
          sound.play('yeti', e);
          break;
        case 'escape':
          sound.play('escape', e);
          toast('You lost the Yeti!  +' + CONFIG.STYLE_ESCAPE, 2600);
          break;
        case 'gameover':
          gameOver();
          break;
        case 'land':
          if (e.air > 0.5) sound.play('land', e);
          else sound.play('mogul', e);
          break;
        default:
          sound.play(e.type, e);
      }
    }
  }
  ev.length = 0;
}

function step(g, dt, inp, live) {
  const n = Math.max(1, Math.ceil(dt / CONFIG.SIM_STEP - 1e-6));
  const h = dt / n;
  for (let i = 0; i < n; i++) g.update(h, inp);
  handleEvents(g, live);
}

// Mouse steering: head for the pointer, like the original.
function aimAt(sx, sy) {
  const g = game;
  if (!g) return null;
  const v = g.view;
  const z = renderer.zoom / g.zoomMul;
  const wx = v.x0 + sx / z, wy = v.y0 + sy / z;
  const p = g.player;
  const dx = wx - p.x, dy = wy - (p.y - 12);
  if (dy <= 6) return Math.sign(dx || 1) * Math.PI / 2;
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(dx, dy)));
}

// ------------------------------------------------------------------ loop

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(CONFIG.MAX_FRAME_DT, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;

  let active;
  if (mode === 'playing' || mode === 'paused' || mode === 'over') {
    active = game;
    if (mode === 'playing') {
      const inp = input.state(aimAt);
      document.body.classList.toggle('mouse-aim', inp.aim !== null);
      if (inp.turbo && !wasTurbo && game.player.controllable) sound.play('turbo');
      wasTurbo = inp.turbo;
      step(game, dt, inp, true);
    } else if (mode === 'over') {
      game.update(dt, {});
    }
  } else {
    active = demo;
    const inp = autopilot(demo, { skill: 0.8, turbo: 'never' });
    step(demo, dt, inp, false);
    // Never let the attract mode sit face-down in a tree.
    demoStuck = demo.player.speed < 20 ? demoStuck + dt : 0;
    if (demoStuck > 4 || demo.time > 240) {
      newDemo();
      renderer.reset();
      active = demo;
    }
  }

  if (mode !== 'paused' || needsDraw) {
    if (mode !== 'paused') renderer.updateEffects(active, dt);
    if (active === demo) {
      // Keep the attract-mode skier visible beside (or below) the menu.
      const wide = renderer.cssW >= 700;
      renderer.draw(active, wide ? -renderer.cssW * 0.27 : 0, wide ? 0.08 * renderer.cssH : 0.5 * renderer.cssH);
    } else {
      renderer.draw(active);
    }
    needsDraw = false;
  }
  sound.frame(active, mode === 'playing');
  sound.setMusic(musicFor(active));
  if (active === game && game) updateHud(game);
  if (mode === 'title') drawLogoYeti(ts / 1000);
}

function musicFor(g) {
  if (mode === 'over') return 'calm';
  const y = g && !g.demo ? g.yeti : null;
  if (y && (y.state === 'chase' || y.state === 'stumble')) return 'chase';
  if (y && y.state === 'eat') return 'silent';
  return 'calm';
}

// ------------------------------------------------------------------- HUD

const hudEls = {
  time: $('#hud-time'),
  dist: $('#hud-dist'),
  speed: $('#hud-speed'),
  style: $('#hud-style'),
  bar: $('#speedo i'),
  speedo: $('#speedo'),
};
const hudLast = {};
function setText(key, text) {
  if (hudLast[key] !== text) {
    hudLast[key] = text;
    hudEls[key].textContent = text;
  }
}
function updateHud(g) {
  const p = g.player;
  const t = Math.floor(g.time);
  setText('time', `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  setText('dist', fmtInt(g.stats.distance) + 'm');
  setText('speed', Math.round(toKmh(p.speed)) + ' km/h');
  setText('style', fmtInt(g.style));
  const pct = Math.min(100, (p.speed / CONFIG.TURBO_SPEED) * 100).toFixed(1) + '%';
  if (hudLast.bar !== pct) {
    hudLast.bar = pct;
    hudEls.bar.style.width = pct;
  }
  const turbo = p.turbo && p.controllable;
  if (hudLast.turbo !== turbo) {
    hudLast.turbo = turbo;
    hudEls.speedo.classList.toggle('turbo', turbo);
  }
}

const fmtInt = (n) => Math.floor(n).toLocaleString('en-US');

// A small yeti waving from the corner of the logo.
const logoCanvas = $('#logo-yeti');
const logoCtx = logoCanvas.getContext('2d');
function drawLogoYeti(t) {
  const r = logoCanvas.getBoundingClientRect();
  const dpr = Math.min(3, devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h) return;
  if (logoCanvas.width !== w || logoCanvas.height !== h) {
    logoCanvas.width = w;
    logoCanvas.height = h;
  }
  const s = w / 84;
  logoCtx.setTransform(1, 0, 0, 1, 0, 0);
  logoCtx.clearRect(0, 0, w, h);
  logoCtx.setTransform(s, 0, 0, s, w / 2, h * 0.93);
  logoCtx.lineJoin = 'round';
  logoCtx.lineCap = 'round';
  drawYeti(logoCtx, { state: 'chase', anim: t * 0.35, heading: 0.3, speed: 60, lunging: false });
}

// --------------------------------------------------------------- options

function applySettings() {
  const s = save.settings;
  sound.setVolumes(s.master, s.music, s.sfx);
  renderer.reducedMotion = s.reducedMotion;
  renderer.effects = s.effects;
  $('#opt-master').value = s.master;
  $('#opt-music').value = s.music;
  $('#opt-sfx').value = s.sfx;
  $('#opt-motion').checked = s.reducedMotion;
  $('#opt-effects').checked = s.effects;
  $('#opt-touch').value = s.touch;
  $('#opt-seed-mode').value = s.seedMode;
  $('#opt-seed').value = s.seed;
  $('#seed-row').classList.toggle('hidden', s.seedMode !== 'fixed');
  updateTouchUI();
}

function bindOptions() {
  const change = (patch) => {
    save.updateSettings(patch);
    applySettings();
  };
  $('#opt-master').addEventListener('input', (e) => change({ master: +e.target.value }));
  $('#opt-music').addEventListener('input', (e) => change({ music: +e.target.value }));
  $('#opt-sfx').addEventListener('input', (e) => {
    change({ sfx: +e.target.value });
    sound.unlock();
    sound.play('gate');
  });
  $('#opt-motion').addEventListener('change', (e) => change({ reducedMotion: e.target.checked }));
  $('#opt-effects').addEventListener('change', (e) => change({ effects: e.target.checked }));
  $('#opt-touch').addEventListener('change', (e) => change({ touch: e.target.value }));
  $('#opt-seed-mode').addEventListener('change', (e) => {
    const patch = { seedMode: e.target.value };
    // Switching to a fixed mountain with no number yet: pick one to start from.
    if (e.target.value === 'fixed' && !save.settings.seed.trim()) patch.seed = String(randomSeed() % 100000);
    change(patch);
  });
  $('#opt-seed').addEventListener('change', (e) => change({ seed: e.target.value.trim() }));

  const reset = $('#reset-records');
  let armed = 0;
  reset.addEventListener('click', () => {
    if (Date.now() - armed < 3000) {
      save.resetRecords();
      reset.textContent = 'Records cleared';
      armed = 0;
      refreshBestLine();
      setTimeout(() => (reset.textContent = 'Reset records'), 1500);
    } else {
      armed = Date.now();
      reset.textContent = 'Tap again to confirm';
      setTimeout(() => {
        if (armed && Date.now() - armed >= 3000) reset.textContent = 'Reset records';
      }, 3100);
    }
  });
}

// ------------------------------------------------------------- wiring

function onAction(action) {
  sound.unlock();
  sound.play('click');
  switch (action) {
    case 'play':
      return startRun();
    case 'controls':
    case 'options':
    case 'about':
      return openPanel(action);
    case 'back':
      return showTitle();
    case 'resume':
      return resume();
    case 'restart':
      return startRun();
    case 'same':
      return startRun(game ? game.seed : pickSeed());
    case 'menu':
      return showTitle();
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) onAction(el.dataset.action);
});
$('#pause-btn').addEventListener('click', () => pause());
for (const el of document.querySelectorAll('#touch [data-key]')) input.bindTouchButton(el, el.dataset.key);

input.on('pause', () => {
  if (mode === 'playing') pause();
  else if (mode === 'paused') resume();
  else if (mode === 'controls' || mode === 'options' || mode === 'about') showTitle();
});
input.on('restart', () => {
  if (mode === 'playing' || mode === 'paused') startRun();
});
input.on('confirm', (e) => {
  // Let Enter activate whatever button has focus.
  if (document.activeElement && document.activeElement.tagName === 'BUTTON') return false;
  if (mode === 'title') startRun();
  else if (mode === 'paused') resume();
  else if (mode === 'over' && game.overTime > 0.4) startRun();
  else return false;
  return true;
});
input.on('any', (e) => {
  sound.unlock();
  if (mode === 'playing' && game) game.skipEating();
  const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
  if (mode === 'over' && e && e.code === 'Space' && !onButton && game.overTime > 0.4) {
    e.preventDefault?.();
    startRun();
  }
});

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !touchSeen) {
    touchSeen = true;
    updateTouchUI();
  }
}, { capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'playing') pause();
    sound.pause();
  } else if (mode !== 'paused') {
    sound.resume();
    lastTs = performance.now();
  }
});
window.addEventListener('blur', () => {
  if (mode === 'playing') pause();
});

function resize() {
  const vv = window.visualViewport;
  const w = Math.round(vv ? vv.width : innerWidth);
  const h = Math.round(vv ? vv.height : innerHeight);
  renderer.resize(w, h, devicePixelRatio || 1);
  for (const g of [game, demo]) g?.setViewSize(renderer.viewW, renderer.viewH);
  needsDraw = true;
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
coarse.addEventListener?.('change', updateTouchUI);

// Test hook: lets the automated playtest inspect and steer the real game.
window.__skifree = {
  get mode() { return mode; },
  get game() { return game; },
  get demo() { return demo; },
  get renderer() { return renderer; },
  get save() { return save; },
  start: (seed) => startRun(seed),
  pause,
  resume,
  menu: showTitle,
};

// ------------------------------------------------------------------ boot

bindOptions();
applySettings();
resize();
newDemo();
showTitle();
requestAnimationFrame((ts) => {
  lastTs = ts;
  frame(ts);
});
