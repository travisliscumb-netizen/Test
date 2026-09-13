/* Block Stack -- game controller.
   Owns the loop, input, screens, feedback and progression. All gameplay rules
   live in engine.js; all balance lives in config.js. */

import {
  WORLDS, levelConfig, stackConfig, stackWorldAt, STACK_BEATS, STACK_MILESTONE,
  RATING_RULES, LEVEL_COUNT, BLOCK_H, blockColor as blockColorFor
} from './config.js';
import { Game, PHASE } from './engine.js';
import { Renderer } from './render.js';
import * as Audio from './audio.js';
import * as Save from './save.js';
import { drawIcon } from './icon.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const icon = (name, cls = '') => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;

/* ------------------------------------------------------------- haptics -- */
const Haptics = (() => {
  const label = $('hapticLabel');
  const box = $('hapticSwitch');
  let last = 0;
  function fire(pattern) {
    if (!Save.get().settings.haptics) return;
    const now = performance.now();
    if (now - last < 26) return;
    last = now;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); return; } catch (e) { /* ignore */ } }
    // iOS has no vibrate(); toggling a switch control is the only system haptic.
    if (label) { try { label.click(); if (box) box.blur(); } catch (e) { /* ignore */ } }
  }
  return {
    light: () => fire(9),
    medium: () => fire(17),
    heavy: () => fire([0, 26, 38, 26]),
    success: () => fire([0, 11, 24, 19]),
    celebrate: () => fire([0, 18, 46, 18, 46, 32]),
    fail: () => fire([0, 42, 58, 22])
  };
})();

/* ------------------------------------------------------------- elements -- */
const canvas = $('stage');
const hud = $('hud');
const el = {
  hudLevel: $('hudLevel'), hudWorld: $('hudWorld'), hudScore: $('hudScore'),
  hudScoreLabel: $('hudScoreLabel'), hudRail: $('hudRail'),
  combo: $('combo'), hint: $('hint'), finish: $('finishBtn'),
  banner: $('banner'), toast: $('toast'), toastText: $('toastText'),
  title: $('title'), map: $('map'), pause: $('pause'), result: $('result'),
  worldClear: $('worldClear'), records: $('records'), splash: $('splash'),
  levelGrid: $('levelGrid'), worldStrip: $('worldStrip'),
  mapPlay: $('mapPlay'), mapWorldName: $('mapWorldName'), mapWorldSub: $('mapWorldSub'), mapCrowns: $('mapCrowns'),
  mapFoot: $('mapFoot'), worldPanel: $('worldPanel'),
  resKicker: $('resKicker'), resTitle: $('resTitle'), resCrowns: $('resCrowns'),
  resScore: $('resScore'), resStats: $('resStats'), resNote: $('resNote'),
  resPrimary: $('resPrimary'), resRetry: $('resRetry'), resMap: $('resMap'),
  retryHint: $('retryHint'),
  wcName: $('wcName'), wcCrowns: $('wcCrowns'), wcNext: $('wcNext'),
  playLabel: $('playLabel'), stackSub: $('stackSub'),
  tStatLevel: $('tStatLevel'), tStatCrowns: $('tStatCrowns'), tStatPerfect: $('tStatPerfect'),
  recGrid: $('recGrid'), achList: $('achList'), recSub: $('recSub')
};

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
let stackWorld = 1;
let runId = 0;
let nextBeat = 0;
let nextMilestone = STACK_MILESTONE;
const STEP = 1 / 120;

const isStack = () => !!(cfg && cfg.stack);

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
  if (name !== 'game') {
    el.banner.classList.remove('on');   // a 1.9s banner must not outlive its run
    el.combo.classList.remove('on');
    el.hint.classList.remove('on');
  }
  if (name === 'title') refreshTitle();
  if (name === 'map') buildMap();
  if (name === 'records') buildRecords();
}

function toast(msg) {
  el.toastText.textContent = msg;
  el.toast.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('on'), 1900);
}

function showBanner(title, sub) {
  el.banner.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
  el.banner.classList.remove('on');
  void el.banner.offsetWidth;
  el.banner.classList.add('on');
}

function applyTheme(world) {
  const root = document.documentElement.style;
  root.setProperty('--accent', world.accent);
  root.setProperty('--accent-ink', pickInk(world.accent));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', world.sky[world.sky.length - 1]);
}

function pickInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? '#14110A' : '#FFFFFF';
}

/* ------------------------------------------------------------- gameplay -- */
function beginRun(newCfg) {
  runId++;
  cfg = newCfg;
  const world = WORLDS[cfg.world - 1];
  stackWorld = cfg.world;
  applyTheme(world);
  renderer.setWorld(world);
  renderer.setLevel(cfg);
  renderer.resize();

  game = new Game(cfg);
  paused = false;
  resultLocked = false;
  pendingWorldClear = null;
  nextBeat = 0;
  nextMilestone = STACK_MILESTONE;

  el.hudScoreLabel.textContent = isStack() ? 'SCORE' : 'SCORE';
  el.finish.classList.add('hidden');
  el.combo.classList.remove('on');
  updateHud();

  show('game');
  Audio.unlock();
  Audio.startMusic(Audio.musicConfigForWorld(world));

  if (cfg.boss) {
    showBanner('BOSS', world.name);
    Audio.sfx.bossIntro();
    Haptics.medium();
  }
  if (cfg.hint) showHint(cfg.hint);
  if (!isStack() && cfg.num >= 50 && Save.unlock('level-50')) achievementToast('level-50');

  lastTime = 0;
  acc = 0;
  if (!raf) raf = requestAnimationFrame(loop);
}

function startLevel(n) { beginRun(levelConfig(n)); }
function startStack() { beginRun(stackConfig()); }

function showHint(text) {
  el.hint.textContent = text;
  el.hint.classList.add('on');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => el.hint.classList.remove('on'), 2400);
}

function updateHud() {
  if (!game) return;
  el.hudScore.textContent = game.score.toLocaleString();
  if (isStack()) {
    el.hudLevel.textContent = `Height ${game.placed}`;
    el.hudWorld.textContent = WORLDS[stackWorld - 1].name;
    // the rail fills toward the next world, so climbing always has a near goal
    const span = 12;
    el.hudRail.style.width = `${((game.placed % span) / span) * 100}%`;
  } else {
    el.hudLevel.textContent = cfg.boss ? `Level ${cfg.num} · Boss` : `Level ${cfg.num}`;
    const done = Math.min(game.placed, cfg.target);
    // The rail carries the proportion; the count answers "how much is left"
    // without spending another line of the HUD on it.
    el.hudWorld.textContent = game.phase === PHASE.ENDLESS
      ? `${WORLDS[cfg.worldIndex].name} · +${game.endlessBlocks}`
      : `${WORLDS[cfg.worldIndex].name} · ${done}/${cfg.target}`;
    el.hudRail.style.width = game.phase === PHASE.ENDLESS ? '100%' : `${(done / cfg.target) * 100}%`;
  }
}

/** Fixed 120 Hz steps keep movement identical on every device and bound a tap's
    timing error at 8 ms rather than at whatever frame rate the phone manages. */
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
function impactPoint() {
  const top = game.top;
  return { x: top.x, y: top.y + BLOCK_H, z: top.z };
}

function drainEvents() {
  const world = WORLDS[(isStack() ? stackWorld : cfg.world) - 1];
  for (const ev of game.drain()) {
    if (ev.type === 'place') {
      const p = impactPoint();
      renderer.strike();
      if (!ev.perfect) {
        Audio.sfx.place(); Audio.sfx.cut();
        Haptics.light();
        renderer.addParticles(8, {
          x: p.x, y: p.y, z: p.z, spread: 0.4, speed: 0.8, up: 0.7,
          life: 0.45, size: 0.045, color: 'rgba(255,255,255,0.5)', kind: 'dust'
        });
        renderer.kick(0.005);
      }
      /* On a perfect the word, the combo pill and the counting score already
         say it three times over; a fourth floating number is noise. Ordinary
         placements keep the number, low over the deck. */
      if (!ev.perfect) {
        renderer.addPopup(`+${ev.gained}`, p.x, p.y + 0.9, p.z, 'rgba(255,255,255,0.88)', 16);
      }
    } else if (ev.type === 'perfect') {
      const p = impactPoint();
      Audio.sfx.perfect(ev.combo);
      Haptics.success();
      renderer.addRing(p.x, p.y + 0.01, p.z, world.accent, 1.05, 0.5, 3.2);
      renderer.addParticles(15, {
        x: p.x, y: p.y, z: p.z, spread: 0.25, speed: 1.3, up: 1.6,
        life: 0.7, size: 0.06, color: world.accent
      });
      renderer.flash(world.accent, 0.09);
      renderer.kick(0.014);
      renderer.addPopup('PERFECT', p.x, p.y + 1.72, p.z, '#FFFFFF', 21, 900);
      setCombo(ev.combo);
      if (Save.unlock('first-perfect')) achievementToast('first-perfect');
      if (ev.combo >= 3 && Save.unlock('triple')) achievementToast('triple');
      if (ev.combo >= 10 && Save.unlock('ten-perfect')) achievementToast('ten-perfect');
    } else if (ev.type === 'cut') {
      setCombo(0);
      if (ev.ratio < 0.10 && Save.unlock('sliver')) achievementToast('sliver');
    } else if (ev.type === 'recover') {
      const p = impactPoint();
      Audio.sfx.recover();
      Haptics.heavy();
      renderer.addRing(p.x, p.y + 0.01, p.z, '#FFFFFF', 1.8, 0.65, 4.2);
      renderer.addParticles(24, {
        x: p.x, y: p.y, z: p.z, spread: 0.5, speed: 1.8, up: 2.0,
        life: 0.95, size: 0.07, color: world.accent
      });
      renderer.flash('#FFFFFF', 0.14);
      renderer.kick(0.024);
      renderer.clearPopups();
      renderer.addPopup('WIDTH RESTORED', p.x, p.y + 1.72, p.z, world.accent, 17, 900);
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
  if (isStack() && game.phase !== PHASE.OVER) stackProgression();
}

/* The endless climb has no levels, so its progression is told through the sky,
   a one-line note when a mechanic arrives, and a milestone every 25 blocks. */
function stackProgression() {
  const h = game.placed;
  const w = stackWorldAt(h);
  if (w !== stackWorld) {
    stackWorld = w;
    const world = WORLDS[w - 1];
    applyTheme(world);
    renderer.setWorld(world, true);
    Audio.startMusic(Audio.musicConfigForWorld(world));
    showBanner(world.name.toUpperCase(), `Altitude ${h}`);
    Audio.sfx.levelComplete();
    Haptics.medium();
    renderer.flash('#FFFFFF', 0.12);
  }
  while (nextBeat < STACK_BEATS.length && h >= STACK_BEATS[nextBeat].at) {
    showHint(STACK_BEATS[nextBeat].text);
    nextBeat++;
  }
  if (h >= nextMilestone) {
    nextMilestone += STACK_MILESTONE;
    const p = impactPoint();
    Audio.sfx.record();
    Haptics.celebrate();
    renderer.addParticles(30, {
      x: p.x, y: p.y, z: p.z, spread: 0.7, speed: 2.1, up: 2.3,
      life: 1.1, size: 0.075, color: WORLDS[stackWorld - 1].accent
    });
    renderer.addRing(p.x, p.y, p.z, '#FFFFFF', 2.2, 0.8, 4);
    renderer.kick(0.03);
    renderer.clearPopups();
    renderer.addPopup(`${h}`, p.x, p.y + 1.85, p.z, '#FFFFFF', 34, 900);
    toast(`${h} blocks`);
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
  renderer.flash('#FFFFFF', 0.26);
  renderer.kick(0.045);
  const world = WORLDS[cfg.worldIndex];
  const p = impactPoint();
  renderer.addParticles(42, {
    x: p.x, y: p.y, z: p.z, spread: 0.8, speed: 2.3, up: 2.5,
    life: 1.4, size: 0.085, color: world.accent
  });
  showBanner('BOSS CLEARED', 'Keep stacking for a record');
  el.finish.classList.remove('hidden');
  Save.recordRun(summary, { cumulative: false }); // banked now; totals land at the end
  if (Save.unlock('first-boss')) achievementToast('first-boss');
}

function onRunEnded(summary, completed) {
  if (resultLocked) return;
  resultLocked = true;
  const beat = Save.recordRun(summary, { stack: isStack() });
  Save.flush();

  if (summary.endlessBlocks >= 25 && Save.unlock('endless-25')) achievementToast('endless-25');
  if (!isStack() && completed && summary.level === LEVEL_COUNT && Save.unlock('level-100')) achievementToast('level-100');
  if (isStack() && summary.placed >= 60 && Save.unlock('climb-60')) achievementToast('climb-60');

  if (!isStack()) {
    const wp = Save.worldProgress(cfg.world);
    const justFinishedWorld = completed && wp.done === 10;
    if (justFinishedWorld && Save.unlock('world-clear')) achievementToast('world-clear');
    pendingWorldClear = justFinishedWorld ? cfg.world : null;
  }

  if (completed) {
    Audio.sfx.levelComplete();
    Haptics.celebrate();
    renderer.flash('#FFFFFF', 0.2);
    const p = impactPoint();
    renderer.addParticles(30, {
      x: p.x, y: p.y, z: p.z, spread: 0.7, speed: 2.0, up: 2.2,
      life: 1.1, size: 0.075, color: WORLDS[cfg.world - 1].accent
    });
  }
  if (beat.length) Audio.sfx.record();
  el.finish.classList.add('hidden');
  /* Let the fall read before the card lands. Keyed to the run, not the screen:
     if the player has already started another attempt, a stale timer must not
     drop the previous run's card over the new one. */
  const myRun = runId;
  setTimeout(() => {
    if (runId !== myRun || screen !== 'game') return;
    showResult(summary, completed, beat);
  }, completed ? 600 : 500);
}

const CROWN = '<svg><use href="#i-crown"/></svg>';

function showResult(summary, completed, beat) {
  const stack = isStack();
  el.resKicker.textContent = stack ? 'Stack · Endless'
    : cfg.boss ? `World ${cfg.world} Boss` : `Level ${cfg.num}`;
  el.resTitle.textContent = stack ? 'Run Over'
    : completed ? (cfg.boss ? 'Boss Cleared' : 'Complete')
    : (summary.bossCleared ? 'Boss Cleared' : 'Tower Down');

  const cleared = completed || summary.bossCleared;
  const crowns = stack ? 0 : (cleared ? summary.crowns : 0);
  el.resCrowns.classList.toggle('hidden', stack);
  if (!stack) {
    el.resCrowns.innerHTML = [0, 1, 2].map((i) => `<span class="cr">${CROWN}</span>`).join('');
    [...el.resCrowns.children].forEach((c, i) => {
      if (i >= crowns) return;
      setTimeout(() => c.classList.add('on'), 150 + i * 140);
    });
  }

  el.resScore.textContent = summary.score.toLocaleString();
  const stats = stack
    ? [['Height', summary.placed], ['Perfects', summary.perfects], ['Best streak', summary.bestCombo]]
    : summary.bossCleared
      ? [['Extra blocks', summary.endlessBlocks], ['Perfects', summary.perfects], ['Best streak', summary.bestCombo]]
      : [['Blocks', summary.placed], ['Perfects', summary.perfects], ['Best streak', summary.bestCombo]];
  el.resStats.innerHTML = stats.map(([l, v]) =>
    `<div><b class="num">${v}</b><span>${l}</span></div>`).join('');

  const rec = stack ? null : Save.levelRecord(cfg.num);
  const lines = [];
  if (beat.includes('stack')) lines.push('New best climb');
  else if (beat.includes('score')) lines.push('New best score');
  else if (beat.includes('streak')) lines.push('New best perfect streak');
  else if (beat.includes('endless')) lines.push('New continuation record');
  if (stack) lines.push(`<span class="sub">Best ${save.records.bestStack || 0} blocks</span>`);
  else if (cleared && crowns > 0 && crowns < 3) lines.push(`<span class="sub">${RATING_RULES[crowns - 1].text}</span>`);
  else if (!cleared) {
    // a failed run should still answer "what do I need to do here"
    lines.push(`<span class="sub">${summary.placed} of ${cfg.target} blocks${
      rec ? ` · best ${rec.score.toLocaleString()}` : ''}</span>`);
  } else if (!lines.length && rec) lines.push(`<span class="sub">Best ${rec.score.toLocaleString()}</span>`);
  el.resNote.innerHTML = lines.join('<br>');

  const advance = !stack && cleared;
  const isLast = !stack && cfg.num >= LEVEL_COUNT;
  el.resPrimary.textContent = stack ? 'Climb Again' : advance ? (isLast ? 'Play Again' : 'Next Level') : 'Retry';
  el.retryHint.textContent = advance ? 'Tap anywhere to continue' : 'Tap anywhere to retry';
  el.resRetry.classList.toggle('hidden', !advance);
  el.resMap.innerHTML = stack ? `${icon('back')}Menu` : `${icon('grid')}Levels`;

  show('result');
}

function resultPrimary() {
  if (pendingWorldClear) { showWorldClear(pendingWorldClear); return; }
  if (isStack()) { startStack(); return; }
  const advance = el.resPrimary.textContent !== 'Retry';
  if (!advance) { startLevel(cfg.num); return; }
  startLevel(cfg.num >= LEVEL_COUNT ? cfg.num : cfg.num + 1);
}

function showWorldClear(worldNo) {
  const w = WORLDS[worldNo - 1];
  const wp = Save.worldProgress(worldNo);
  el.wcName.textContent = w.name;
  el.wcCrowns.innerHTML = `<span class="cr on">${CROWN}</span><b class="wc-count num">${wp.crowns}/30</b>`;
  const nxt = WORLDS[worldNo];
  el.wcNext.textContent = nxt ? `${nxt.name} unlocked` : 'Every world complete';
  applyTheme(nxt || w);
  if (nxt) renderer.setWorld(nxt, true);
  Audio.sfx.worldComplete();
  Haptics.celebrate();
  pendingWorldClear = null;
  show('worldClear');
}

function nextAfterWorld() {
  if (cfg.num >= LEVEL_COUNT) { show('title'); return; }
  startLevel(cfg.num + 1);
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

  // Locked worlds still show their name: knowing what is ahead is the point.
  el.worldStrip.innerHTML = WORLDS.map((ww) => {
    const unlocked = ww.id <= maxWorld;
    const badge = unlocked ? `<i style="background:${ww.accent}"></i>` : icon('lock', 'wlock');
    return `<button class="wchip ${ww.id === mapWorld ? 'on' : ''} ${unlocked ? '' : 'locked'}"
      data-world="${ww.id}" ${unlocked ? '' : 'disabled'}>${badge}${ww.name}</button>`;
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
    const face = unlocked
      ? `${boss ? icon('crown', 'crown') : ''}<b class="num">${n}</b>${pips}`
      : icon('lock', 'lock');
    return `<button class="${cls.join(' ')}" data-level="${n}" ${unlocked ? '' : 'disabled'}
      aria-label="Level ${n}${unlocked ? '' : ' locked'}">${face}</button>`;
  }).join('');

  const active = el.worldStrip.querySelector('.wchip.on');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

  const best = Array.from({ length: 10 }, (_, i) => Save.levelRecord(base + i + 1))
    .filter(Boolean).reduce((a, r) => Math.max(a, r.score), 0);
  el.worldPanel.innerHTML = `
    <div class="panel-row"><span>${w.subtitle}</span><b class="num">${wp.done}/10 cleared</b></div>
    <div class="meter"><i style="width:${(wp.crowns / 30) * 100}%"></i></div>
    <div class="panel-row panel-sub"><span>${wp.crowns} of 30 crowns</span>
      <b>${best ? 'Best ' + best.toLocaleString() : 'No score yet'}</b></div>`;

  el.mapFoot.textContent = `${Object.keys(save.levels).length} / ${LEVEL_COUNT} levels cleared · ${allCrowns()} crowns`;

  /* The map exists to get the player into a level, so it ends with the action
     rather than with an orphaned stat line over a screenful of nothing. */
  const target = clamp(save.highest, base + 1, base + 10);
  const playable = Save.isUnlocked(target) ? target : base + 1;
  $('mapPlayLabel').textContent = Save.levelRecord(playable)
    ? `Replay Level ${playable}` : `Play Level ${playable}`;
  $('mapPlay').dataset.level = playable;
}

function allCrowns() {
  return Object.values(save.levels).reduce((a, r) => a + r.crowns, 0);
}

/* ------------------------------------------------------------- records --- */
function buildRecords() {
  const r = save.records;
  const items = [
    ['Highest level', save.completed || '—'],
    ['Best stack climb', r.bestStack || '—'],
    ['Best score', r.bestScore.toLocaleString()],
    ['Best perfect streak', r.bestCombo],
    ['Total perfects', r.totalPerfects.toLocaleString()],
    ['Smallest platform', r.smallest < 1 ? `${Math.round(r.smallest * 100)}%` : '—'],
    ['Longest run', r.bestEndless],
    ['Total blocks placed', r.totalBlocks.toLocaleString()]
  ];
  el.recGrid.innerHTML = items.map(([l, v]) =>
    `<div class="rec-item"><b class="num">${v}</b><span>${l}</span></div>`).join('');
  el.recSub.textContent = `${allCrowns()} of ${LEVEL_COUNT * 3} crowns`;
  el.achList.innerHTML = Save.ACHIEVEMENTS.map((a) => {
    const on = Save.hasAchievement(a.id);
    return `<div class="ach ${on ? 'on' : ''}"><div class="mark">${icon(on ? 'check' : 'dot')}</div>
      <div><b>${a.name}</b><span>${a.desc}</span></div></div>`;
  }).join('');
}

function achievementToast(id) {
  const a = Save.ACHIEVEMENTS.find((x) => x.id === id);
  if (a) { toast(a.name); Audio.sfx.record(); }
}

function refreshTitle() {
  const w = WORLDS[clamp(Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10), 1, 10) - 1];
  applyTheme(w);
  renderer.setWorld(w);
  el.playLabel.textContent = save.completed > 0 ? `Continue · Level ${Math.min(save.highest, LEVEL_COUNT)}` : 'Play';
  el.stackSub.textContent = save.records.bestStack ? `Best ${save.records.bestStack} blocks` : 'No limit';
  el.tStatLevel.textContent = Math.min(save.highest, LEVEL_COUNT);
  el.tStatCrowns.textContent = allCrowns();
  el.tStatPerfect.textContent = save.records.totalPerfects.toLocaleString();
  syncToggles();
}

/* ------------------------------------------------------------- settings -- */
function syncToggles() {
  document.querySelectorAll('.toggle[data-setting]').forEach((b) => {
    const on = !!save.settings[b.dataset.setting];
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
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
const TAP_BLOCK = 'button, .toggle, .wchip, .tile, .world-strip, .rec-body, .level-grid, .sheet';

function onPointerDown(e) {
  if (e.target.closest && e.target.closest(TAP_BLOCK)) return;
  if (screen === 'game') {
    if (paused || !game || !game.active) return;
    // Consume the time since the last simulation step so the tap is judged
    // against where the block is NOW, not where it was up to 8 ms ago.
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
   included, so the menus are never silent until the first level starts. */
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
document.addEventListener('selectstart', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    onPointerDown({ target: document.body });
  }
  if (e.code === 'Escape' && screen === 'game') togglePause();
});

function currentWorld() {
  const n = isStack() ? stackWorld
    : cfg ? cfg.world : clamp(Math.ceil(Math.min(save.highest, LEVEL_COUNT) / 10), 1, 10);
  return WORLDS[n - 1];
}
function ensureMenuMusic() {
  if (screen === 'game') return;
  Audio.startMusic(Audio.musicConfigForWorld(currentWorld()));
}

/* --------------------------------------------------------------- wiring -- */
$('playBtn').addEventListener('click', () => { Audio.sfx.ui(); startLevel(Math.min(save.highest, LEVEL_COUNT)); });
$('stackBtn').addEventListener('click', () => { Audio.sfx.ui(); startStack(); });
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

$('mapPlay').addEventListener('click', (e) => {
  e.stopPropagation();
  Audio.sfx.ui();
  startLevel(+$('mapPlay').dataset.level);
});

$('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('restartBtn').addEventListener('click', () => {
  setPaused(false);
  if (isStack()) startStack(); else startLevel(cfg.num);
});
$('toMapBtn').addEventListener('click', () => {
  setPaused(false);
  mapWorld = isStack() ? mapWorld : cfg.world;
  show(isStack() ? 'title' : 'map');
});
el.finish.addEventListener('click', (e) => { e.stopPropagation(); game.finish(); drainEvents(); });

el.resPrimary.addEventListener('click', (e) => { e.stopPropagation(); resultPrimary(); });
el.resRetry.addEventListener('click', (e) => {
  e.stopPropagation();
  if (isStack()) startStack(); else startLevel(cfg.num);
});
el.resMap.addEventListener('click', (e) => {
  e.stopPropagation();
  if (isStack()) { show('title'); return; }
  mapWorld = cfg.world;
  show('map');
});
$('wcBtn').addEventListener('click', (e) => { e.stopPropagation(); nextAfterWorld(); });

const wipe = $('wipeBtn');
wipe.addEventListener('click', () => {
  if (!wipe.dataset.armed) {
    wipe.dataset.armed = '1';
    wipe.textContent = 'Tap Again To Erase';
    setTimeout(() => { delete wipe.dataset.armed; wipe.textContent = 'Erase All Progress'; }, 3500);
    return;
  }
  Save.resetAll();
  Object.assign(save, Save.get());
  toast('Progress erased');
  show('title');
});

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
  if (game) renderer.frame(game, 0, { paused: true, menu: screen !== 'game' });
}
function scheduleResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(doResize, 70); }
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', () => setTimeout(doResize, 220));
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);

/* ----------------------------------------------------------------- boot -- */
function paintIcon(id, size) {
  const c = $(id);
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  c.width = size * dpr; c.height = size * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawIcon(g, size, { transparent: true });
}

/* A decorative tower for the menus, built directly rather than by simulating
   placements, so it always looks deliberate instead of however the dice fell. */
function buildIdleTower(g) {
  const steps = [
    [0.00, 0.00, 1.00], [0.04, 0.00, 0.94], [0.04, -0.05, 0.90],
    [-0.02, -0.05, 0.86], [-0.02, 0.03, 0.82], [0.03, 0.03, 0.79], [0.03, -0.02, 0.76]
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
      color: blockColorFor(g.cfg.world, i), settle: 0, drop: 0
    });
  });
  g.active = null;
  g.drain();
}

function boot() {
  paintIcon('splashIcon', 108);
  renderer.resize();
  paintIcon('logoIcon', 130);
  cfg = levelConfig(Math.min(save.highest, LEVEL_COUNT));
  game = new Game(cfg);
  buildIdleTower(game);
  renderer.setWorld(WORLDS[cfg.worldIndex]);
  renderer.setLevel(cfg);
  show('title');
  raf = requestAnimationFrame(loop);

  // hold the splash for one painted frame so the title never flashes in unstyled
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => {
      el.splash.classList.add('out');
      setTimeout(() => el.splash.remove(), 400);
    }, 120);
  }));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
    });
  }
}

boot();

// Exposed for the automated test harness only; nothing in the UI hangs off it.
window.__blockstack = {
  start: startLevel,
  stack: startStack,
  place: () => { game.place(); drainEvents(); },
  state: () => ({ screen, paused, phase: game && game.phase, summary: game && game.summary(), cfg }),
  game: () => game,
  save: () => Save.get(),
  metrics: () => ({ k: renderer.K, dpr: renderer.dpr, w: renderer.W, h: renderer.H, anchor: renderer.anchor }),
  pools: () => ({
    particles: renderer.particles.length, rings: renderer.rings.length,
    popups: renderer.popups.length, debris: game.debris.length
  }),
  pause: setPaused,
  finish: () => { game.finish(); drainEvents(); }
};
