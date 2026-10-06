/* App controller: screens, the fixed-step loop, progression, feedback.
   The simulation runs at exactly 60 Hz regardless of display refresh;
   rendering happens once per animation frame.                           */

import {
  FIGHTERS, ROSTER, BOSS_ID, STAGES, LADDER_LENGTH, HZ,
  difficultyFor, tierName, opponentFor, stageFor
} from './config.js';
import { Match, blankInput, rng32 } from './engine.js';
import { AI } from './ai.js';
import { Renderer, drawCard, QUALITY } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { load, save, wipe } from './save.js';
import { drawIcon } from './icon.js';

const STEP = 1000 / HZ;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = load();
const sound = new Sound();
const renderer = new Renderer($('stage'));
const input = new Input({
  stickZone: $('stickZone'), stickBase: $('stickBase'), stickKnob: $('stickKnob'),
  buttons: [...document.querySelectorAll('.pad')].map((el) => ({ el, key: el.dataset.k })),
  onPress: () => { if (state.settings.haptics && navigator.vibrate) navigator.vibrate(8); }
});

let mode = 'boot';           // boot | title | select | ladder | vs | fight
let paused = false;
let match = null;            // the real fight
let cpu = null;
let pilot = params.has('autoplay') ? true : null;
let current = null;          // { level, oppId, stage, diff, boss, ... }
let attract = null;          // background demo fight on the title screen
let acc = 0;
let last = performance.now();
let resultAt = 0;
let vsUntil = 0;
let selId = state.fighter || 'kael';
let tutorial = null;
let installPrompt = null;
let cpuFrozen = false;                // test hook only
const inBuf = blankInput();
const GESTURES = ['TAP', 'SWIPE \u2192 FOE', 'SWIPE \u2191\u2193'];

function kitHtml(id) {
  const d = FIGHTERS[id];
  return d.specials.map((sp, i) => `<span>${GESTURES[i]}</span><b>${sp.name}</b>`).join('') +
    `<span>EXECUTE</span><b class="fin">${d.finisher.name}</b>`;
}

/* Adaptive resolution: if this device cannot hold 60 fps in a fight, step
   the canvas resolution down (and remember it). Strong phones keep the full
   1080p backing store; weaker ones trade sharpness for smoothness. */
const PERF_WINDOW = 150;     // frames (~2.5 s) judged as a whole, so one hitch never costs quality
const perf = { sum: 0, frames: 0 };
function watchFrameRate(dtMs) {
  perf.sum += dtMs;
  if (++perf.frames < PERF_WINDOW) return;
  const avg = perf.sum / perf.frames;
  perf.sum = 0;
  perf.frames = 0;
  if (avg > STEP * 1.3 && (state.quality || 0) < QUALITY.length - 1) {
    state.quality = (state.quality || 0) + 1;
    save(state);
    onResize();
  }
}

/* ================================================================ screens */
const SCREENS = ['boot', 'title', 'select', 'ladder', 'vs'];
const OVERLAYS = ['pause', 'result', 'how', 'settings'];

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('show', s === id);
  if (id) mode = id;
}
function overlay(id, on) { $(id).classList.toggle('show', on); }
function anyOverlay() { return OVERLAYS.some((o) => $(o).classList.contains('show')); }

function goTitle() {
  for (const o of OVERLAYS) overlay(o, false);
  paused = false;
  match = null;
  setControls(false);
  hideTip();
  show('title');
  refreshTitle();
  startAttract();
}

function refreshTitle() {
  const run = state.run;
  $('continueBtn').classList.toggle('hidden', !run);
  if (run) {
    const opp = opponentFor(run.fighter, run.level);
    $('continueLabel').textContent = `Continue · Level ${run.level}`;
    $('continueSub').textContent = `${FIGHTERS[run.fighter].name} vs ${FIGHTERS[opp].name} · ${tierName(run.level)}`;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const hint = $('installHint');
  hint.innerHTML = '';
  if (installPrompt) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm';
    b.textContent = 'Install App';
    b.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; refreshTitle(); };
    hint.appendChild(b);
  } else if (ios && !standalone) {
    hint.textContent = 'Install: tap Share, then "Add to Home Screen" — you get the app icon and true fullscreen.';
  }
}

/* --------------------------------------------------------------- select */
function buildRoster() {
  const box = $('roster');
  box.innerHTML = '';
  for (const id of ROSTER) {
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.id = id;
    const c = document.createElement('canvas');
    c.width = c.height = 192;
    b.appendChild(c);
    const label = document.createElement('span');
    label.textContent = FIGHTERS[id].name;
    b.appendChild(label);
    b.onclick = () => { selId = id; sound.play('select'); refreshSelect(); };
    box.appendChild(b);
    drawCard(c, id, {});
  }
}

function refreshSelect() {
  const d = FIGHTERS[selId];
  for (const b of $('roster').children) b.classList.toggle('on', b.dataset.id === selId);
  $('selName').textContent = d.name;
  $('selTitle').textContent = d.title;
  $('selBio').textContent = d.bio;
  $('selSpecials').innerHTML = kitHtml(selId).replace('<b class="fin">', '<b class="fin" style="color:#ff7a7a">');
  const stat = (label, v) => `<span>${label}</span><i><b style="width:${Math.round(Math.min(1, v) * 100)}%"></b></i>`;
  $('selStats').innerHTML =
    stat('POWER', (d.power - 0.8) / 0.4) + stat('SPEED', (d.speed - 0.75) / 0.45) + stat('HEALTH', (d.hp - 850) / 350);
}

function goSelect() {
  stopAttract();
  show('select');
  refreshSelect();
}

/* --------------------------------------------------------------- ladder */
function goLadder() {
  stopAttract();
  const run = state.run;
  show('ladder');
  const strip = $('ladderStrip');
  strip.innerHTML = '';
  const top = Math.max(LADDER_LENGTH, run.level + 2);
  let nowEl = null;
  for (let lv = 1; lv <= top; lv++) {
    const opp = opponentFor(run.fighter, lv);
    const el = document.createElement('div');
    el.className = 'rung' + (lv < run.level ? ' done' : lv === run.level ? ' now' : ' locked') + (opp === BOSS_ID ? ' boss' : '');
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    el.appendChild(c);
    el.insertAdjacentHTML('beforeend', `<div class="lv">${lv}</div><div class="tier">${lv > LADDER_LENGTH ? 'Endless · ' : ''}${tierName(lv)}</div>`);
    strip.appendChild(el);
    drawCard(c, opp, { facing: -1 });
    if (lv === run.level) nowEl = el;
  }
  if (nowEl) requestAnimationFrame(() => nowEl.scrollIntoView({ inline: 'center', block: 'nearest' }));
  const opp = opponentFor(run.fighter, run.level);
  const boss = opp === BOSS_ID;
  $('ladderTitle').textContent = run.level > LADDER_LENGTH ? 'ENDLESS LADDER' : 'THE LADDER';
  $('ladderInfo').textContent = `Level ${run.level} · ${tierName(run.level)} — ${FIGHTERS[run.fighter].name} vs ${FIGHTERS[opp].name}${boss ? ' (BOSS)' : ''} at ${STAGES[stageFor(opp, run.level)].name}`;
  $('ladderGo').textContent = `BEGIN LEVEL ${run.level}`;
}

/* ---------------------------------------------------------------- fight */
function startLevel(skipVs = false) {
  stopAttract();
  const run = state.run;
  const level = run.level;
  const oppId = run.forceOpp || opponentFor(run.fighter, level);
  const boss = oppId === BOSS_ID;
  const diff = difficultyFor(level, run.losses, boss);
  const stage = stageFor(oppId, level);
  const seed = (Date.now() ^ (level * 7919)) >>> 0;
  current = { level, oppId, stage, diff, boss, maxCombo: 0, seed };
  match = new Match({
    p1: run.fighter, p2: oppId, seed, viewW: renderer.viewW,
    p1Mods: { dmgIn: diff.aiDamage },
    p2Mods: { dmgIn: diff.playerDamage, speedMul: FIGHTERS[oppId].speed * diff.speed }
  });
  cpu = new AI(diff, rng32(seed + 1));
  if (pilot) pilot = new AI(difficultyFor(9), rng32(seed + 2));
  renderer.setStage(stage);
  renderer.reset();
  input.clear();
  acc = 0;
  resultAt = 0;
  tutorial = level === 1 && !run.tutorialDone ? makeTutorial() : null;
  for (const o of OVERLAYS) overlay(o, false);
  paused = false;

  $('vsAName').textContent = FIGHTERS[run.fighter].name;
  $('vsBName').textContent = FIGHTERS[oppId].name;
  $('vsStage').textContent = STAGES[stage].name;
  $('vsLevel').textContent = `LEVEL ${level} · ${tierName(level).toUpperCase()}${boss ? ' · BOSS' : ''}`;
  sound.startMusic(stage, diff.d);
  if (skipVs) return beginFight();
  show('vs');
  sound.play('gong');
  vsUntil = performance.now() + 2600;
}

function beginFight() {
  show(null);
  for (const s of SCREENS) $(s).classList.remove('show');
  mode = 'fight';
  setControls(!pilot);
  last = performance.now();
}

function setControls(on) {
  $('controls').classList.toggle('hidden', !on);
  input.enabled = on;
  if (!on) input.clear();
}

function stepFight() {
  const p1 = match.fighters[0];
  const i1 = pilot ? pilot.update(p1, match) : input.sample(inBuf);
  const i2 = cpuFrozen ? blankInput() : cpu.update(match.fighters[1], match);
  match.update(i1, i2);
  const evs = match.drain();
  renderer.handle(evs, match);
  for (const e of evs) onEvent(e, match, true);
  if (tutorial) tutorial.tick();
}

function onEvent(e, m, real) {
  const player = m.fighters[0];
  const s = state.settings;
  switch (e.type) {
    case 'hit':
      sound.play(e.armor ? 'block' : (e.sfx || 'heavy'), { power: e.dmg / 100 });
      if (e.att === player) { player.lastAttackHit = m.tick; }
      if (real && s.haptics && navigator.vibrate && (e.f === player || e.att === player)) navigator.vibrate(e.heavy ? 28 : 14);
      if (real && e.att === player) current.maxCombo = Math.max(current.maxCombo, e.combo);
      break;
    case 'block': sound.play('block'); if (real && tutorial && e.f === player) tutorial.did('block'); break;
    case 'whoosh':
      sound.play('whoosh', { heavy: e.heavy });
      if (real && tutorial && e.f === player) tutorial.did(e.f.moveId);
      if (e.f.move && e.f.move.charged) sound.play('heavy');
      break;
    case 'dash': sound.play('jump'); break;
    case 'guardbreak': sound.play('crush'); sound.play('block'); if (real && s.haptics && navigator.vibrate) navigator.vibrate(30); break;
    case 'proj-land': sound.play(e.p.kind === 'rock' ? 'thud' : 'explode'); break;
    case 'fin-slash': sound.play('block'); sound.play('whoosh', { heavy: true }); break;
    case 'fin-pyre': sound.play('fire'); sound.play('quake'); break;
    case 'fin-fire': if (Math.random() < 0.25) sound.play('fire'); break;
    case 'fin-bolt': sound.play('zap'); if (e.big) sound.play('ko'); break;
    case 'fin-pillar': sound.play('quake'); break;
    case 'fin-boulder': sound.play('thud', { power: 1 }); break;
    case 'fin-tendrils': sound.play('void'); break;
    case 'fin-tendril': if (Math.random() < 0.2) sound.play('teleport'); break;
    case 'fin-void': sound.play('void'); break;
    case 'jump': sound.play('jump'); if (real && tutorial && e.f === player) tutorial.did('jump'); break;
    case 'land': sound.play('land'); break;
    case 'thud': sound.play('thud', { power: e.power }); break;
    case 'proj': sound.play({ void: 'void', bolt: 'zap', kunai: 'whoosh', blade: 'rise', rock: 'heavy', pillar: 'void' }[e.p.kind] || 'fire'); break;
    case 'proj-hit': case 'clash': sound.play('explode'); break;
    case 'special':
      if (e.kind === 'dash') sound.play('zap');
      else if (e.kind === 'teleport') sound.play('teleport');
      else if (e.kind === 'rising') sound.play('rise');
      if (real && tutorial && e.f === player) tutorial.did(m.tick - (player.lastAttackHit || -99) < 24 ? 'cancel' : 'special');
      break;
    case 'quake': sound.play('quake'); break;
    case 'ko': sound.play('ko'); if (real && s.haptics && navigator.vibrate) navigator.vibrate([40, 30, 80]); break;
    case 'finisher': sound.play('gong'); break;
    case 'shatter':
      sound.play(s.blood && e.style !== 'sink' && e.style !== 'ash' ? 'gore' : 'explode');
      if (real && e.att === player) state.stats.executions++;
      break;
    case 'announce':
      if (real) setTimeout(() => sound.say((e.sub ? `${e.text}. ${e.sub}` : e.text).replace(/!/g, '')), (e.delay || 0) * STEP);
      if (real && e.kind === 'perfect' && m.koWinner === player) state.stats.perfects++;
      break;
    case 'matchover':
      if (real) resultAt = performance.now() + 1600;
      break;
  }
}

function showResult() {
  resultAt = 0;
  const run = state.run;
  const won = match.winner === match.fighters[0];
  const level = current.level;
  const t = $('resTitle');
  if (won) {
    state.stats.wins++;
    state.best = Math.max(state.best, level);
    run.level = level + 1;
    run.losses = 0;
    run.tutorialDone = true;
    const champion = level === LADDER_LENGTH;
    if (champion) state.champion = true;
    t.textContent = champion ? 'CHAMPION' : 'VICTORY';
    t.className = 'win';
    $('resSub').textContent = champion
      ? 'The throne is yours. The ladder now goes on forever, and it keeps climbing.'
      : `Level ${level} cleared. Next: ${FIGHTERS[opponentFor(run.fighter, run.level)].name} · ${tierName(run.level)}`;
    $('resNext').classList.remove('hidden');
    $('resRetry').classList.add('hidden');
  } else {
    state.stats.losses++;
    run.losses = (run.losses || 0) + 1;
    t.textContent = 'DEFEATED';
    t.className = 'lose';
    $('resSub').textContent = run.losses <= 4
      ? 'Try again. Your opponent eases off a little each time you lose this level.'
      : 'Try again. Mix up highs, lows and jump-ins, and punish missed attacks.';
    $('resNext').classList.add('hidden');
    $('resRetry').classList.remove('hidden');
  }
  save(state);
  const p = match.fighters[0];
  $('resStats').innerHTML =
    `<div><b>${p.wins}-${match.fighters[1].wins}</b><span>ROUNDS</span></div>` +
    `<div><b>${current.maxCombo}</b><span>BEST COMBO</span></div>` +
    `<div><b>${Math.round((p.hp / p.maxHp) * 100)}%</b><span>HEALTH LEFT</span></div>`;
  setControls(false);
  hideTip();
  overlay('result', true);
}

/* -------------------------------------------------------------- tutorial
   Level 1 only: one prompt at a time, each cleared by doing it.         */
function makeTutorial() {
  const steps = [
    { text: 'Tap PUNCH three times fast for a combo', done: (k) => k === 'jab2' || k === 'cross' },
    { text: 'SWIPE PUNCH toward your foe: lunging cross', done: (k) => k === 'cross' },
    { text: 'Hold BLOCK when they swing at you', done: (k) => k === 'block' },
    { text: 'SWIPE PUNCH UP: uppercut  \u00b7  SWIPE KICK DOWN: sweep', done: (k) => k === 'upper' || k === 'sweep' },
    { text: 'HOLD KICK, then let go: breaks their guard', done: (k) => k === 'ckick' || k === 'cpunch' },
    { text: 'Tap SPECIAL. Swipe it for your other two specials', done: (k) => k === 'special' },
    { text: 'Land a hit, then SPECIAL: a special-cancel combo', done: (k) => k === 'cancel' }
  ];

  let i = 0, shownAt = 0, ticks = 0;
  const tip = $('tip');
  const showStep = () => {
    if (i >= steps.length) { hideTip(); return; }
    tip.textContent = steps[i].text;
    tip.classList.remove('hidden');
    shownAt = ticks;
  };
  return {
    tick() {
      ticks++;
      if (match.phase !== 'fight') { tip.classList.add('hidden'); return; }
      if (tip.classList.contains('hidden') && i < steps.length) showStep();
      if (ticks - shownAt > 60 * 11) { i++; showStep(); }
    },
    did(k) {
      if (i < steps.length && steps[i].done(k) && ticks - shownAt > 40) { i++; sound.play('ui'); showStep(); }
    }
  };
}
function hideTip() { $('tip').classList.add('hidden'); }

/* -------------------------------------------------------------- attract */
function startAttract() {
  if (attract) return;
  const r = Math.random;
  const a = ROSTER[Math.floor(r() * ROSTER.length)];
  let b = ROSTER[Math.floor(r() * ROSTER.length)];
  if (b === a) b = BOSS_ID;
  const stage = FIGHTERS[b].home;
  const seed = (r() * 1e9) >>> 0;
  const m = new Match({ p1: a, p2: b, seed, viewW: renderer.viewW });
  m.noFinish = false;
  attract = { m, ai1: new AI(difficultyFor(12), rng32(seed + 3)), ai2: new AI(difficultyFor(12), rng32(seed + 4)), stage };
  renderer.setStage(stage);
  renderer.reset();
  sound.startMusic(stage, 0.15);
}
function stopAttract() { attract = null; }

function stepAttract() {
  const { m, ai1, ai2 } = attract;
  m.update(ai1.update(m.fighters[0], m), ai2.update(m.fighters[1], m));
  const evs = m.drain().filter((e) => e.type !== 'announce');
  renderer.handle(evs, m);
  if (m.over) { attract = null; startAttract(); }
}

/* ================================================================== loop */
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (mode === 'vs') {
    const t = now / 1000;
    drawCard($('vsA'), state.run.fighter, { full: true, facing: 1, t, bg: false });
    drawCard($('vsB'), current.oppId, { full: true, facing: -1, t: t + 0.4, bg: false });
    if (now >= vsUntil) beginFight();
    return;
  }
  if (mode === 'select') {
    drawCard($('selPreview'), selId, { full: true, t: now / 1000 });
    return;
  }
  if (mode === 'ladder') return;

  if (mode === 'fight' && match) {
    if (!paused) {
      if (!document.hidden) watchFrameRate(dt * 1000);
      acc += dt * 1000 * match.timeScale;
      let n = 0;
      while (acc >= STEP && n < 8) { stepFight(); acc -= STEP; n++; }
      if (n === 8) acc = 0;
      if (resultAt && now >= resultAt && !$('result').classList.contains('show')) showResult();
    }
    syncPads();
    const p = match.fighters[0];
    const prompt = match.phase === 'finish' && match.koWinner === p && match.fighters[1].state === 'dizzy' && !pilot ? 'PRESS SPECIAL TO EXECUTE' : null;
    renderer.frame(match, paused ? 0 : dt * match.timeScale, {
      label: `LEVEL ${current.level} · ${tierName(current.level).toUpperCase()}`,
      prompt, inset: insetLogical()
    });
    return;
  }

  if ((mode === 'title' || mode === 'boot') && attract) {
    acc += dt * 1000 * attract.m.timeScale;
    let n = 0;
    while (acc >= STEP && n < 8) { stepAttract(); acc -= STEP; n++; if (!attract) break; }
    if (n === 8) acc = 0;
    if (attract) renderer.frame(attract.m, dt * attract.m.timeScale, null);
  }
}

function syncPads() {
  const p = match.fighters[0];
  const sBtn = document.querySelector('.pad-s');
  const urge = match.phase === 'finish' && match.koWinner === p;
  sBtn.classList.toggle('urge', urge);
  sBtn.classList.toggle('ready', !urge && match.phase === 'fight' && p.cooldown === 0);
  sBtn.classList.toggle('cooling', !urge && p.cooldown > 0);
  const pips = sBtn.querySelectorAll('.pips em');
  for (let i = 0; i < 3; i++) pips[i].classList.toggle('on', p.cools[i] === 0);
}

/* ============================================================== plumbing */
let insetPx = 0;
function measureInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  insetPx = Math.max(parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0);
  probe.remove();
}
function insetLogical() { return (insetPx * 720) / Math.max(1, innerHeight) + 18; }

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 3), QUALITY[state.quality || 0]);
  if (match) match.viewW = renderer.viewW;
  if (attract) attract.m.viewW = renderer.viewW;
  measureInsets();
  if (mode === 'fight' && h > w && w < 900 && !paused) pause();
}

function pause() {
  if (mode !== 'fight' || paused || !match) return;
  paused = true;
  input.clear();
  overlay('pause', true);
}
function resume() {
  paused = false;
  overlay('pause', false);
  last = performance.now();
  acc = 0;
}

function applySettings() {
  const s = state.settings;
  sound.sfx = s.sound;
  sound.voice = s.voice;
  if (sound.music !== s.music) {
    sound.music = s.music;
    if (!s.music) sound.stopMusic();
    else if (current && mode === 'fight') sound.startMusic(current.stage, current.diff.d);
    else if (attract) sound.startMusic(attract.stage, 0.15);
  }
  renderer.blood = s.blood;
  document.documentElement.style.setProperty('--pad-size', s.size);
  document.documentElement.style.setProperty('--pad-opacity', s.opacity);
  $('controls').classList.toggle('lefty', !!s.lefty);
  input.sizeK = s.size;
  for (const el of document.querySelectorAll('[data-set]')) {
    const k = el.dataset.set;
    if (el.type === 'checkbox') el.checked = !!s[k]; else el.value = s[k];
  }
}

async function goFullscreen() {
  const el = document.documentElement;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || !el.requestFullscreen || document.fullscreenElement) return;
  if (!matchMedia('(pointer: coarse)').matches) return;
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch { /* the browser declined; play windowed */ }
}

function wire() {
  $('boot').addEventListener('pointerup', () => {
    sound.unlock();
    applySettings();
    goFullscreen();
    sound.play('gong');
    goTitle();
  });
  $('continueBtn').onclick = () => { sound.play('ui'); goLadder(); };
  $('newBtn').onclick = () => { sound.play('ui'); goSelect(); };
  const showHow = () => {
    const id = (state.run && state.run.fighter) || selId;
    $('kit').innerHTML = `<b>${FIGHTERS[id].name}</b><div class="sel-specials">${kitHtml(id)}</div>`;
    overlay('how', true);
  };
  $('howBtn').onclick = () => { sound.play('ui'); showHow(); };
  $('settingsBtn').onclick = () => { sound.play('ui'); overlay('settings', true); };
  $('selGo').onclick = () => {
    sound.play('select');
    state.fighter = selId;
    state.run = { fighter: selId, level: 1, losses: 0, tutorialDone: state.seenTutorial };
    state.seenTutorial = true;
    save(state);
    goLadder();
  };
  $('ladderGo').onclick = () => { sound.play('select'); startLevel(); };
  $('vs').addEventListener('pointerup', () => { if (mode === 'vs') beginFight(); });
  for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { sound.play('ui'); goTitle(); };
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { sound.play('ui'); b.closest('.screen').classList.remove('show'); };

  // open on click, not pointerdown: the menu must not appear under the finger
  // that is still down, or its lift lands on a menu button (a ghost tap)
  $('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); pause(); });
  $('resumeBtn').onclick = resume;
  $('restartBtn').onclick = () => { startLevel(true); };
  $('pauseHowBtn').onclick = showHow;
  $('pauseSettingsBtn').onclick = () => overlay('settings', true);
  $('quitBtn').onclick = () => { save(state); goTitle(); };
  $('resNext').onclick = () => { overlay('result', false); goLadder(); };
  $('resRetry').onclick = () => { overlay('result', false); startLevel(); };
  $('resQuit').onclick = () => goTitle();
  $('resetBtn').onclick = () => {
    if (!confirm('Erase all progress and stats?')) return;
    state = wipe();
    applySettings();
    overlay('settings', false);
    goTitle();
  };
  for (const el of document.querySelectorAll('[data-set]')) {
    el.addEventListener('input', () => {
      const k = el.dataset.set;
      state.settings[k] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
      save(state);
      applySettings();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (paused) resume(); else pause(); }
    if (mode === 'boot' && (e.code === 'Enter' || e.code === 'Space')) $('boot').dispatchEvent(new PointerEvent('pointerup'));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); save(state); } });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (mode === 'title') refreshTitle(); });
  // stop iOS double-tap zoom / long-press menus inside the game
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
}

function boot() {
  wire();
  onResize();
  buildRoster();
  applySettings();
  const ic = $('bootIcon');
  drawIcon(ic.getContext('2d'), ic.width);
  startAttract();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  requestAnimationFrame(loop);
}

boot();

/* Test hook used by tests/crimson-playtest.mjs. Harmless in production. */
window.__crimson = {
  get mode() { return mode; },
  get match() { return match; },
  get paused() { return paused; },
  get current() { return current; },
  get state() { return state; },
  renderer,
  difficultyFor,
  start(fighter, level, losses = 0, autoplay = false, forceOpp = null) {
    sound.unlock();
    state.run = { fighter, level, losses, tutorialDone: level > 1, forceOpp };
    pilot = autoplay ? true : null;
    startLevel(true);
  },
  /* Simulate ticks synchronously (no rendering); returns true when over. */
  fastForward(ticks) {
    for (let i = 0; i < ticks && match && !match.over; i++) stepFight();
    return !!(match && match.over);
  },
  showResultNow() { showResult(); },
  /* feed synthetic frame times to the adaptive-resolution governor */
  simulateFrames(ms, n) { for (let i = 0; i < n; i++) watchFrameRate(ms); return { quality: state.quality || 0, backingH: renderer.canvas.height }; },
  freezeCpu(v) { cpuFrozen = !!v; },
  setQuality(q) { state.quality = q; perf.frames = 0; perf.sum = 0; onResize(); return renderer.canvas.height; },
  pause, resume
};
