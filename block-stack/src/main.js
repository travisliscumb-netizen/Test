/* Block Stack -- game controller.
   Owns the loop, input, screens, feedback and progression. All gameplay rules
   live in engine.js; all balance lives in config.js. */

import { WORLDS, levelConfig, RATING_RULES, LEVEL_COUNT, BLOCK_H, blockColor as blockColorFor } from './config.js';
import { Game, PHASE } from './engine.js';
import { Renderer } from './render.js';
import * as Audio from './audio.js';
import * as Save from './save.js';
import { drawIcon } from './icon.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------- haptics -- */
const Haptics = (() => {
  const label = $('hapticLabel');
  const canSwitch = !!label;
  let last = 0;
  function fire(pattern) {
    if (!Save.get().settings.haptics) return;
    const now = performance.now();
    if (now - last < 28) return;
    last = now;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); return; } catch (e) { /* ignore */ } }
    if (canSwitch) { try { label.click(); } catch (e) { /* ignore */ } }
  }
  return {
    light: () => fire(9),
    medium: () => fire(18),
    heavy: () => fire([0, 26, 40, 26]),
    success: () => fire([0, 12, 26, 20]),
    celebrate: () => fire([0, 18, 50, 18, 50, 34]),
    fail: () => fire([0, 44, 60, 22])
  };
})();

/* ------------------------------------------------------------- elements -- */
const canvas = $('stage');
const hud = $('hud');
const el = {
  hudLevel: $('hudLevel'), hudWorld: $('hudWorld'), hudScore: $('hudScore'),
  hudBar: $('hudBar'), hudProg: $('hudProg'), combo: $('combo'), hint: $('hint'),
  finish: $('finishBtn'), boss: $('bossBanner'), toast: $('toast'),
  title: $('title'), map: $('map'), pause: $('pause'), result: $('result'),
  worldClear: $('worldClear'), records: $('records'),
  levelGrid: $('levelGrid'), worldStrip: $('worldStrip'),
  mapWorldName: $('mapWorldName'), mapWorldSub: $('mapWorldSub'), mapCrowns: $('mapCrowns'),
  mapFoot: $('mapFoot'), worldPanel: $('worldPanel'),
  resKicker: $('resKicker'), resTitle: $('resTitle'), resCrowns: $('resCrowns'),
  resScore: $('resScore'), resStats: $('resStats'), resNext: $('resNext'),
  resPrimary: $('resPrimary'), resRetry: $('resRetry'), resMap: $('resMap'),
  retryHint: $('retryHint'),
  wcName: $('wcName'), wcCrowns: $('wcCrowns'), wcNext: $('wcNext'),
  playLabel: $('playLabel'),
  tStatLevel: $('tStatLevel'), tStatCrowns: $('tStatCrowns'), tStatPerfect: $('tStatPerfect'),
  recGrid: $('recGrid'), achList: $('achList'), recSub: $('recSub')
};

const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.6 7 12l5-7.4L17 12l4-3.4-1.6 10.2H4.6z" fill="currentColor"/></svg>';

/* ---------------------------------------------------------------- state -- */
const save = Save.load();
Audio.init(save.settings);

const renderer = new Renderer(canvas);
let game = null;
let cfg = null;
let paused = false;
let screen = 'title';
let mapWorld = Math.min(10, Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10));
let lastTime = 0;
let acc = 0;
let raf = 0;
let resultLocked = false;
let pendingWorldClear = null;
const STEP = 1 / 120;

/* --------------------------------------------------------------- screens -- */
const SCREENS = {
  title: el.title, map: el.map, result: el.result,
  worldClear: el.worldClear, records: el.records
};

function show(name) {
  screen = name;
  for (const [k, node] of Object.entries(SCREENS)) node.classList.toggle('hidden', k !== name);
  hud.classList.toggle('hidden', name !== 'game');
  el.pause.classList.add('hidden');
  if (name !== 'game') el.boss.classList.remove('on');   // the 1.9s banner must
                                                         // not outlive the run
  el.combo.classList.remove('on');
  if (name === 'title') refreshTitle();
  if (name === 'map') buildMap();
  if (name === 'records') buildRecords();
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('on'), 1900);
}

function applyTheme(world) {
  document.documentElement.style.setProperty('--accent', world.accent);
  document.documentElement.style.setProperty('--accent-ink', pickInk(world.accent));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', world.sky[world.sky.length - 1]);
}

function pickInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? '#14110A' : '#FFFFFF';
}

/* ------------------------------------------------------------- gameplay -- */
function startLevel(n) {
  cfg = levelConfig(n);
  const world = WORLDS[cfg.worldIndex];
  applyTheme(world);
  renderer.setWorld(world);
  renderer.setLevel(cfg);
  renderer.resize();

  game = new Game(cfg);
  paused = false;
  resultLocked = false;
  pendingWorldClear = null;

  el.hudLevel.textContent = cfg.boss ? `Level ${cfg.num} · Boss` : `Level ${cfg.num}`;
  el.hudWorld.textContent = `${world.name}`;
  el.finish.classList.add('hidden');
  el.combo.classList.remove('on');
  updateHud();

  show('game');
  Audio.unlock();
  Audio.startMusic(Audio.musicConfigForWorld(world));

  if (cfg.boss) {
    el.boss.innerHTML = `<b>BOSS</b><small>${world.name}</small>`;
    el.boss.classList.remove('on');
    void el.boss.offsetWidth;
    el.boss.classList.add('on');
    Audio.sfx.bossIntro();
    Haptics.medium();
  }
  if (cfg.hint) showHint(cfg.hint);
  if (n >= 50 && Save.unlock('level-50')) achievementToast('level-50');

  lastTime = 0;
  acc = 0;
  if (!raf) raf = requestAnimationFrame(loop);
}

function showHint(text) {
  el.hint.textContent = text;
  el.hint.classList.add('on');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => el.hint.classList.remove('on'), 2300);
}

function updateHud() {
  if (!game) return;
  el.hudScore.textContent = game.score.toLocaleString();
  const done = Math.min(game.placed, cfg.target);
  el.hudBar.style.width = `${(done / cfg.target) * 100}%`;
  el.hudProg.textContent = game.phase === PHASE.ENDLESS
    ? `+${game.endlessBlocks}`
    : `${done} / ${cfg.target}`;
}

/** Advance simulation. Fixed 120 Hz steps keep movement identical on every
    device and make a tap's timing error bounded by 8 ms, not by frame rate. */
function step(dt) {
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 40) { game.update(STEP); acc -= STEP; }
  if (guard >= 40) acc = 0;
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (!game) return;
  const now = ts / 1000;
  let dt = lastTime ? now - lastTime : 1 / 60;
  lastTime = now;
  dt = clamp(dt, 0, 0.1);

  if (!paused && screen === 'game') step(dt);
  drainEvents();
  renderer.frame(game, dt, { paused: paused || screen !== 'game', menu: screen !== 'game' });
  updateHud();
}

/* ----------------------------------------------------------- feedback --- */
function activeWorldPoint() {
  const top = game.top;
  return { x: top.x, y: top.y + BLOCK_H, z: top.z };
}

function drainEvents() {
  const world = WORLDS[cfg.worldIndex];
  for (const ev of game.drain()) {
    if (ev.type === 'place') {
      const p = activeWorldPoint();
      if (!ev.perfect) {
        Audio.sfx.place(); Audio.sfx.cut();
        Haptics.light();
        renderer.addParticles(7, {
          x: p.x, y: p.y, z: p.z, spread: 0.35, speed: 0.7, up: 0.7,
          life: 0.5, size: 0.05, color: 'rgba(255,255,255,0.55)', kind: 'dust'
        });
        renderer.kick(0.006);
      }
      renderer.addPopup(`+${ev.gained}`, p.x, p.y + 0.06, p.z,
        ev.perfect ? world.accent : 'rgba(255,255,255,0.85)', ev.perfect ? 19 : 16);
    } else if (ev.type === 'perfect') {
      const p = activeWorldPoint();
      Audio.sfx.perfect(ev.combo);
      Haptics.success();
      renderer.addRing(p.x, p.y + 0.01, p.z, world.accent, 1.15, 0.55, 3.4);
      renderer.addParticles(16, {
        x: p.x, y: p.y, z: p.z, spread: 0.25, speed: 1.25, up: 1.5,
        life: 0.75, size: 0.07, color: world.accent
      });
      renderer.flash(world.accent, 0.10);
      renderer.kick(0.015);
      renderer.addPopup('PERFECT', p.x, p.y + 1.0, p.z, '#FFFFFF', 21);
      setCombo(ev.combo);
      if (Save.unlock('first-perfect')) achievementToast('first-perfect');
      if (ev.combo >= 3 && Save.unlock('triple')) achievementToast('triple');
      if (ev.combo >= 10 && Save.unlock('ten-perfect')) achievementToast('ten-perfect');
    } else if (ev.type === 'cut') {
      setCombo(0);
      if (ev.ratio < 0.10 && Save.unlock('sliver')) achievementToast('sliver');
    } else if (ev.type === 'recover') {
      const p = activeWorldPoint();
      Audio.sfx.recover();
      Haptics.heavy();
      renderer.addRing(p.x, p.y + 0.01, p.z, '#FFFFFF', 1.9, 0.7, 4.5);
      renderer.addParticles(26, {
        x: p.x, y: p.y, z: p.z, spread: 0.5, speed: 1.7, up: 2.0,
        life: 1.0, size: 0.075, color: world.accent
      });
      renderer.flash('#FFFFFF', 0.16);
      renderer.kick(0.026);
      renderer.addPopup('WIDTH RESTORED', p.x, p.y + 1.45, p.z, world.accent, 17);
      if (Save.unlock('comeback')) achievementToast('comeback');
    } else if (ev.type === 'miss') {
      Audio.sfx.miss(); Audio.sfx.fall();
      Haptics.fail();
      renderer.shakeBy(9);
      setCombo(0);
    } else if (ev.type === 'bossCleared') {
      onBossCleared(ev);
    } else if (ev.type === 'over') {
      onRunEnded(ev, false);
    } else if (ev.type === 'complete') {
      onRunEnded(ev, true);
    }
  }
}

function setCombo(n) {
  if (n >= 2) {
    el.combo.textContent = `PERFECT ×${n}`;
    el.combo.classList.add('on');
  } else {
    el.combo.classList.remove('on');
  }
}

/* ---------------------------------------------------------- run endings -- */
function onBossCleared(summary) {
  Audio.sfx.bossClear();
  Haptics.celebrate();
  renderer.flash('#FFFFFF', 0.3);
  renderer.kick(0.05);
  const world = WORLDS[cfg.worldIndex];
  const p = activeWorldPoint();
  renderer.addParticles(46, {
    x: p.x, y: p.y, z: p.z, spread: 0.8, speed: 2.4, up: 2.6,
    life: 1.5, size: 0.09, color: world.accent
  });
  el.boss.innerHTML = '<b>BOSS CLEARED</b><small>Keep stacking for a record</small>';
  el.boss.classList.remove('on');
  void el.boss.offsetWidth;
  el.boss.classList.add('on');
  el.finish.classList.remove('hidden');
  Save.recordRun(summary, { cumulative: false }); // banked now; totals land at the end
  if (Save.unlock('first-boss')) achievementToast('first-boss');
}

function onRunEnded(summary, completed) {
  if (resultLocked) return;
  resultLocked = true;
  const beat = Save.recordRun(summary);
  Save.flush();

  if (summary.endlessBlocks >= 25 && Save.unlock('endless-25')) achievementToast('endless-25');
  if (completed && summary.level === LEVEL_COUNT && Save.unlock('level-100')) achievementToast('level-100');

  const worldNo = cfg.world;
  const wp = Save.worldProgress(worldNo);
  const justFinishedWorld = completed && wp.done === 10;
  if (justFinishedWorld && Save.unlock('world-clear')) achievementToast('world-clear');
  pendingWorldClear = justFinishedWorld ? worldNo : null;

  if (completed) {
    Audio.sfx.levelComplete();
    Haptics.celebrate();
    renderer.flash('#FFFFFF', 0.22);
    const p = activeWorldPoint();
    renderer.addParticles(34, {
      x: p.x, y: p.y, z: p.z, spread: 0.7, speed: 2.0, up: 2.2,
      life: 1.2, size: 0.08, color: WORLDS[cfg.worldIndex].accent
    });
  }
  if (beat.includes('score') || beat.includes('streak') || beat.includes('endless')) {
    Audio.sfx.record();
  }
  el.finish.classList.add('hidden');
  // Let the fall/celebration read before the card lands -- but if the player
  // has already walked away (pause -> level map) do not yank them back.
  setTimeout(() => {
    if (screen !== 'game') return;
    showResult(summary, completed, beat);
  }, completed ? 620 : 520);
}

function showResult(summary, completed, beat) {
  el.resKicker.textContent = cfg.boss ? `World ${cfg.world} Boss` : `Level ${cfg.num}`;
  el.resTitle.textContent = completed
    ? (cfg.boss ? 'Boss Cleared' : 'Complete')
    : (summary.bossCleared ? 'Boss Cleared' : 'Tower Down');

  const crowns = completed || summary.bossCleared ? summary.crowns : 0;
  el.resCrowns.innerHTML = [0, 1, 2].map((i) =>
    `<span class="cr ${i < crowns ? 'on' : ''}">${CROWN_SVG}</span>`).join('');
  if (crowns) {
    [...el.resCrowns.children].forEach((c, i) => {
      if (i >= crowns) return;
      c.classList.remove('on');
      setTimeout(() => c.classList.add('on'), 140 + i * 150);
    });
  }

  el.resScore.textContent = summary.score.toLocaleString();
  const stats = [
    ['Blocks', summary.placed],
    ['Perfects', summary.perfects],
    ['Best streak', summary.bestCombo]
  ];
  if (summary.bossCleared) stats[0] = ['Extra blocks', summary.endlessBlocks];
  el.resStats.innerHTML = stats.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');

  const rec = Save.levelRecord(cfg.num);
  const cleared = completed || summary.bossCleared;
  const lines = [];
  if (beat.includes('score')) lines.push('New best score');
  else if (beat.includes('streak')) lines.push('New best perfect streak');
  else if (beat.includes('endless')) lines.push('New continuation record');
  if (cleared && crowns > 0 && crowns < 3) lines.push(RATING_RULES[crowns - 1].text);
  else if (!lines.length && rec) lines.push(`Best ${rec.score.toLocaleString()}`);
  el.resNext.innerHTML = lines.map((t, i) =>
    `<span class="${i ? 'rn-sub' : ''}">${t}</span>`).join('<br>');

  const advance = cleared;
  const isLast = cfg.num >= LEVEL_COUNT;
  el.resPrimary.textContent = advance ? (isLast ? 'Play Again' : 'Next Level') : 'Retry';
  el.retryHint.textContent = advance ? 'Tap anywhere to continue' : 'Tap anywhere to retry';
  el.resRetry.classList.toggle('hidden', !advance);

  show('result');
}

function resultPrimary() {
  const advance = el.resPrimary.textContent !== 'Retry';
  if (pendingWorldClear) { showWorldClear(pendingWorldClear); return; }
  if (!advance) { startLevel(cfg.num); return; }
  const next = cfg.num >= LEVEL_COUNT ? cfg.num : cfg.num + 1;
  startLevel(next);
}

function showWorldClear(worldNo) {
  const w = WORLDS[worldNo - 1];
  const wp = Save.worldProgress(worldNo);
  el.wcName.textContent = w.name;
  el.wcCrowns.innerHTML = `<span class="cr on">${CROWN_SVG}</span>` +
    `<b class="wc-count">${wp.crowns}/30</b>`;
  const nxt = WORLDS[worldNo];
  el.wcNext.textContent = nxt ? `${nxt.name} unlocked` : 'Every world complete';
  applyTheme(nxt || w);
  if (nxt) { renderer.setWorld(nxt); }
  Audio.sfx.worldComplete();
  Haptics.celebrate();
  pendingWorldClear = null;
  show('worldClear');
}

/* ----------------------------------------------------------- level map --- */
function buildMap() {
  const maxWorld = Math.min(10, Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10));
  mapWorld = clamp(mapWorld, 1, 10);
  const w = WORLDS[mapWorld - 1];
  applyTheme(w);
  renderer.setWorld(w);
  el.mapWorldName.textContent = w.name;
  el.mapWorldSub.textContent = `World ${w.id} · ${w.subtitle}`;
  const wp = Save.worldProgress(mapWorld);
  el.mapCrowns.textContent = wp.crowns;

  el.worldStrip.innerHTML = WORLDS.map((ww) => {
    const unlocked = ww.id <= maxWorld;
    return `<button class="wchip ${ww.id === mapWorld ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-world="${ww.id}">
      <i style="background:${ww.accent}"></i>${unlocked ? ww.name : 'Locked'}</button>`;
  }).join('');

  const base = (mapWorld - 1) * 10;
  el.levelGrid.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const n = base + i + 1;
    const unlocked = Save.isUnlocked(n);
    const rec = Save.levelRecord(n);
    const boss = (i + 1) === 10;
    const cls = ['tile'];
    if (!unlocked) cls.push('locked');
    if (rec) cls.push('done');
    if (boss) cls.push('boss');
    if (n === save.highest && unlocked) cls.push('current');
    const pips = `<div class="pips">${[0, 1, 2].map((k) =>
      `<i class="${rec && k < rec.crowns ? 'on' : ''}"></i>`).join('')}</div>`;
    return `<button class="${cls.join(' ')}" data-level="${n}" ${unlocked ? '' : 'disabled'}>
      <b>${unlocked ? n : '🔒'}</b>${unlocked ? pips : ''}</button>`;
  }).join('');

  const active = el.worldStrip.querySelector('.wchip.on');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

  const best = Array.from({ length: 10 }, (_, i) => Save.levelRecord(base + i + 1))
    .filter(Boolean).reduce((a, r) => Math.max(a, r.score), 0);
  el.worldPanel.innerHTML = `
    <div class="wp-row"><span>${w.subtitle}</span><b>${wp.done}/10 cleared</b></div>
    <div class="wp-bar"><i style="width:${(wp.crowns / 30) * 100}%"></i></div>
    <div class="wp-row wp-sub"><span>${wp.crowns} of 30 crowns</span>
      <b>${best ? 'Best ' + best.toLocaleString() : 'No score yet'}</b></div>`;

  const total = Object.keys(save.levels).length;
  el.mapFoot.textContent = `${total} / ${LEVEL_COUNT} levels cleared · ${allCrowns()} crowns`;
}

function allCrowns() {
  return Object.values(save.levels).reduce((a, r) => a + r.crowns, 0);
}

/* ------------------------------------------------------------- records --- */
function buildRecords() {
  const r = save.records;
  const items = [
    ['Highest level', save.completed || '—'],
    ['Best score', r.bestScore.toLocaleString()],
    ['Best perfect streak', r.bestCombo],
    ['Total perfects', r.totalPerfects.toLocaleString()],
    ['Smallest platform', r.smallest < 1 ? `${Math.round(r.smallest * 100)}%` : '—'],
    ['Longest continuation', r.bestEndless],
    ['Total blocks placed', r.totalBlocks.toLocaleString()],
    ['Recoveries', r.recoveries]
  ];
  el.recGrid.innerHTML = items.map(([l, v]) =>
    `<div class="rec-item"><b>${v}</b><span>${l}</span></div>`).join('');
  el.recSub.textContent = `${allCrowns()} of ${LEVEL_COUNT * 3} crowns`;
  el.achList.innerHTML = Save.ACHIEVEMENTS.map((a) => {
    const on = Save.hasAchievement(a.id);
    return `<div class="ach ${on ? 'on' : ''}"><div class="mark">${on ? '✓' : '·'}</div>
      <div><b>${a.name}</b><span>${a.desc}</span></div></div>`;
  }).join('');
}

function achievementToast(id) {
  const a = Save.ACHIEVEMENTS.find((x) => x.id === id);
  if (a) { toast(`Achievement · ${a.name}`); Audio.sfx.record(); }
}

function refreshTitle() {
  const w = WORLDS[clamp(Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10), 1, 10) - 1];
  applyTheme(w);
  renderer.setWorld(w);
  el.playLabel.textContent = save.completed > 0 ? `Continue · Level ${Math.min(save.highest, LEVEL_COUNT)}` : 'Play';
  el.tStatLevel.textContent = Math.min(save.highest, LEVEL_COUNT);
  el.tStatCrowns.textContent = allCrowns();
  el.tStatPerfect.textContent = save.records.totalPerfects.toLocaleString();
  syncToggles();
}

/* ------------------------------------------------------------- settings -- */
function syncToggles() {
  document.querySelectorAll('.toggle[data-setting]').forEach((b) => {
    b.classList.toggle('on', !!save.settings[b.dataset.setting]);
  });
}

document.querySelectorAll('.toggle[data-setting]').forEach((b) => {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = b.dataset.setting;
    const next = !save.settings[key];
    Save.setSetting(key, next);
    if (key === 'sound') Audio.setSound(next);
    if (key === 'music') Audio.setMusic(next);
    if (key === 'haptics' && next) Haptics.medium();
    Audio.unlock();
    syncToggles();
    Audio.sfx.ui();
  });
});

/* ---------------------------------------------------------------- input -- */
const TAP_BLOCK = 'button, .toggle, .wchip, .tile, .world-strip, .rec-body, .level-grid';

function currentWorld() {
  const n = cfg ? cfg.world : clamp(Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10), 1, 10);
  return WORLDS[n - 1];
}
function ensureMenuMusic() {
  if (screen === 'game') return;
  Audio.startMusic(Audio.musicConfigForWorld(currentWorld()));
}

function onPointerDown(e) {
  if (e.target.closest(TAP_BLOCK)) return;
  if (screen === 'game') {
    if (paused || !game || !game.active) return;
    // Consume the time since the last simulation step so a tap is judged
    // against where the block is now, not where it was up to 8 ms ago.
    const now = performance.now() / 1000;
    if (lastTime) {
      const extra = clamp(now - lastTime, 0, 0.05);
      if (extra > 0) { step(extra); lastTime = now; }
    }
    game.place();
    drainEvents();
    return;
  }
  if (screen === 'result') { resultPrimary(); return; }
  if (screen === 'worldClear') { nextAfterWorld(); return; }
}

/* Audio needs a gesture; take the first one wherever it lands, buttons
   included, so the menus are not silent until the first level starts. */
document.addEventListener('pointerdown', () => {
  Audio.unlock();
  ensureMenuMusic();
}, { capture: true, passive: true });

canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
el.result.addEventListener('pointerdown', onPointerDown, { passive: true });
el.worldClear.addEventListener('pointerdown', onPointerDown, { passive: true });
hud.addEventListener('pointerdown', onPointerDown, { passive: true });

const SCROLLABLE = '.level-grid, .rec-body, .world-strip, .screen-inner, .sheet';
document.addEventListener('touchmove', (e) => {
  // Block rubber-banding over the play area, but never over a real scroller.
  if (e.target.closest && e.target.closest(SCROLLABLE)) return;
  if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onPointerDown({ target: document.body }); }
  if (e.code === 'Escape' && screen === 'game') togglePause();
});

/* --------------------------------------------------------------- wiring -- */
$('playBtn').addEventListener('click', () => { Audio.sfx.ui(); startLevel(Math.min(save.highest, LEVEL_COUNT)); });
$('mapBtn').addEventListener('click', () => { Audio.sfx.ui(); show('map'); });
$('recordsBtn').addEventListener('click', () => { Audio.sfx.ui(); show('records'); });
$('mapBack').addEventListener('click', () => { Audio.sfx.uiBack(); show('title'); });
$('recBack').addEventListener('click', () => { Audio.sfx.uiBack(); show('title'); });

el.worldStrip.addEventListener('click', (e) => {
  const b = e.target.closest('.wchip');
  if (!b || b.classList.contains('locked')) return;
  mapWorld = +b.dataset.world;
  Audio.sfx.ui();
  buildMap();
});
el.levelGrid.addEventListener('click', (e) => {
  const b = e.target.closest('.tile');
  if (!b || b.disabled) return;
  Audio.sfx.ui();
  startLevel(+b.dataset.level);
});

$('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('restartBtn').addEventListener('click', () => { setPaused(false); startLevel(cfg.num); });
$('toMapBtn').addEventListener('click', () => {
  setPaused(false);
  Audio.stopMusic();
  mapWorld = cfg ? cfg.world : mapWorld;
  show('map');
});
el.finish.addEventListener('click', (e) => { e.stopPropagation(); game.finish(); drainEvents(); });

el.resPrimary.addEventListener('click', (e) => { e.stopPropagation(); resultPrimary(); });
el.resRetry.addEventListener('click', (e) => { e.stopPropagation(); startLevel(cfg.num); });
el.resMap.addEventListener('click', (e) => {
  e.stopPropagation();
  Audio.stopMusic();
  mapWorld = cfg.world;
  show('map');
});
$('wcBtn').addEventListener('click', (e) => { e.stopPropagation(); nextAfterWorld(); });
$('wipeBtn').addEventListener('click', () => {
  if (!$('wipeBtn').dataset.armed) {
    $('wipeBtn').dataset.armed = '1';
    $('wipeBtn').textContent = 'Tap again to erase everything';
    setTimeout(() => {
      delete $('wipeBtn').dataset.armed;
      $('wipeBtn').textContent = 'Erase all progress';
    }, 3500);
    return;
  }
  Save.resetAll();
  Object.assign(save, Save.get());
  toast('Progress erased');
  show('title');
});

function nextAfterWorld() {
  const next = cfg.num >= LEVEL_COUNT ? LEVEL_COUNT : cfg.num + 1;
  if (cfg.num >= LEVEL_COUNT) { show('title'); return; }
  startLevel(next);
}

function togglePause() { setPaused(!paused); }
function setPaused(v) {
  if (screen !== 'game') return;
  paused = v;
  el.pause.classList.toggle('hidden', !v);
  if (v) { Audio.suspend(); syncToggles(); } else { Audio.resume(); lastTime = 0; }
  Audio.sfx.ui();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Save.flush();
    if (screen === 'game' && !paused) setPaused(true);
    Audio.suspend();
  } else if (!paused) {
    Audio.resume();
    lastTime = 0;
  }
});
window.addEventListener('blur', () => { if (screen === 'game' && !paused) setPaused(true); });
window.addEventListener('pagehide', () => Save.flush());

let resizeTimer = null;
function doResize() {
  renderer.resize();
  if (game) renderer.frame(game, 0, { paused: true });
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(doResize, 80);
});
window.addEventListener('orientationchange', () => setTimeout(doResize, 220));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(doResize, 80);
});

/* ----------------------------------------------------------------- boot -- */
function drawTitleIcon() {
  const c = $('logoIcon');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = 220;
  c.width = size * dpr; c.height = size * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawIcon(g, size, { transparent: true });
}

/* A decorative tower for the menus. Built directly rather than by simulating
   placements, so it always looks deliberate instead of however the dice fell. */
function buildIdleTower(g) {
  const steps = [
    [0.00, 0.00, 1.00], [0.04, 0.00, 0.94], [0.04, -0.05, 0.90],
    [-0.02, -0.05, 0.86], [-0.02, 0.03, 0.82], [0.03, 0.03, 0.79],
    [0.03, -0.02, 0.76]
  ];
  const base = g.blocks[0];
  const max = g.cfg.maxSize;
  steps.forEach(([dx, dz, scale], i) => {
    if (i === 0) return;
    const prev = g.blocks[g.blocks.length - 1];
    g.blocks.push({
      x: base.x + dx, z: base.z + dz,
      w: max * scale, d: max * scale,
      y: prev.y + BLOCK_H, index: i,
      color: blockColorFor(g.cfg.world, i), settle: 0
    });
  });
  g.active = null;
  g.drain();
}

function boot() {
  renderer.resize();
  drawTitleIcon();
  // idle tower behind the menus so the game never shows a dead background
  cfg = levelConfig(Math.min(save.highest, LEVEL_COUNT));
  game = new Game(cfg);
  buildIdleTower(game);
  renderer.setWorld(WORLDS[cfg.worldIndex]);
  renderer.setLevel(cfg);
  show('title');
  raf = requestAnimationFrame(loop);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
    });
  }
}

boot();

// Exposed for the automated test harness only; no UI hangs off it.
window.__blockstack = {
  start: startLevel,
  place: () => { game.place(); drainEvents(); },
  state: () => ({ screen, paused, phase: game && game.phase, summary: game && game.summary(), cfg }),
  game: () => game,
  save: () => Save.get(),
  pause: setPaused,
  finish: () => { game.finish(); drainEvents(); }
};
