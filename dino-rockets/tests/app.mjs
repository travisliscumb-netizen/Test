/* End-to-end playtest of the BUILT single file, the way Grayson uses it.

   A real browser at phone size, driven by taps and a real drag. Speech is a
   recording fake so the test can hear exactly what was said; the stage
   runs at 4x so a whole mission fits in a few minutes, but every crew
   scene still plays through the real executor.

   Covers: the grown-up sets the week (passcode, paste a list, duplicates,
   too-short words), persistence across a reload, a whole mission through
   every activity (meet, zap, build by tap and by drag, missing, blast from
   memory) with wrong answers, the countdown and launch, egg hatching, the
   star map, the meteor-shower finale, Dino Base, mastery going up and down,
   Back pressed mid-scene, stalls getting a nudge, and every screen at three
   device sizes with layout rules checked. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FILE = 'file://' + path.join(ROOT, 'graysons-dino-rockets.html');
const SHOTS = process.env.SHOTS || path.join(ROOT, '..', '.shots', 'dino-app');
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STORE = 'graysons-dino-rockets.v1';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`);
  console.log(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`);
}

/* A speech engine that records and finishes each utterance quickly. */
function fakeSpeech() {
  const log = [];
  window.__spoken = log;
  let cur = null;
  const synth = {
    speaking: false, pending: false, paused: false,
    speak(u) {
      if (u.volume === 0) return;           /* the iOS unlock primer */
      log.push({ t: performance.now(), text: u.text, screen: document.body.getAttribute('data-screen') });
      this.speaking = true; cur = u;
      u.__t = setTimeout(() => { this.speaking = false; cur = null; u.onend && u.onend(); }, 40 + u.text.length * 6);
    },
    cancel() {
      if (!cur) return;
      clearTimeout(cur.__t); const u = cur; cur = null; this.speaking = false;
      setTimeout(() => u.onerror && u.onerror({ error: 'canceled' }), 0);
    },
    getVoices() { return [{ name: 'Samantha', lang: 'en-US' }]; },
    resume() {}, pause() {}, addEventListener() {}
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
}

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

async function openApp(viewport, { words = null } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(fakeSpeech);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE + '?mute&speed=4&fast');
  await page.evaluate(([k, w]) => { localStorage.clear(); if (w) localStorage.setItem(k, JSON.stringify({ words: w })); }, [STORE, words]);
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'home');
  return { context, page, errors };
}

const state = page => page.evaluate(() => __game.state());
const screenOf = async page => (await state(page)).screen;
async function waitScreen(page, name, timeout = 45000) {
  await page.waitForFunction(n => __game.state().screen === n, name, { timeout });
  await page.waitForTimeout(350);          /* the screen's entrance animation */
}
async function waitStep(page, step, timeout = 45000) {
  await page.waitForFunction(s => __game.state().screen === 'play' && __game.state().step === s, step, { timeout });
  await page.waitForTimeout(300);
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const spokenSince = (page, n) => page.evaluate(k => window.__spoken.slice(k).map(s => s.text), n);
const spokenCount = page => page.evaluate(() => window.__spoken.length);

/* Layout rules every screen must keep: nothing scrolls sideways, nothing
   hangs off the edge, every visible button is big enough for a small finger,
   and the main card never runs under the bottom of the screen. */
async function layoutOk(page, label) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const bad = [];
    for (const b of document.querySelectorAll('.screen.on button')) {
      const q = b.getBoundingClientRect();
      if (!q.width || b.hidden || getComputedStyle(b).visibility === 'hidden' || b.closest('[hidden]')) continue;
      if (b.classList.contains('blank')) continue;
      if (q.height < 44 || q.width < 44) bad.push(`${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 14)} ${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    const over = [];
    for (const e of document.querySelectorAll('.screen.on *')) {
      const q = e.getBoundingClientRect();
      if (!q.width || e.closest('.zap-field') || e.closest('.map') || e.closest('.babies')) continue;
      if (q.right > vw + 1 || q.left < -1) over.push((e.className && e.className.baseVal == null ? e.className : e.tagName) + '');
    }
    const card = document.querySelector('.screen.on .card');
    const low = card ? card.getBoundingClientRect().bottom - vh : 0;
    return { scroll: document.documentElement.scrollWidth - vw, bad, over: over.slice(0, 3), low };
  });
  check(`${label}: no sideways scroll`, r.scroll <= 0, `${r.scroll}px`);
  check(`${label}: nothing hangs off the screen`, r.over.length === 0, r.over.join(', '));
  check(`${label}: every button is finger-sized`, r.bad.length === 0, r.bad.join('; '));
  check(`${label}: the card fits on screen`, r.low <= 1, `${Math.round(r.low)}px under`);
}

/* ---------------- one activity each ---------------- */
async function doMeet(page, word, opt) {
  check(`${opt.label} meet: shows the word`, (await page.textContent('.holo .lower')).trim() === word.toLowerCase());
  const n = await spokenCount(page);
  await page.click('.holo .slot >> nth=0');
  await page.waitForTimeout(120);
  const said = await spokenSince(page, n);
  const first = await page.evaluate(ch => __game.core.letterSound(ch, {}), word[0]);
  check(`${opt.label} meet: tapping a letter says its name`, said.includes(first), said.join('|'));
  if (opt.shots) { await page.waitForTimeout(500); await shot(page, `${opt.shots}-meet`); await layoutOk(page, `${opt.shots} meet`); }
  await page.waitForSelector('.activity .btn-launch:not([hidden])', { timeout: 20000 });
  await page.click('.activity .btn-launch');
}
async function doZap(page, word, opt) {
  for (let round = 1; round <= 2; round++) {
    await page.waitForFunction(r => {
      const l = document.querySelector('.zap-round');
      return l && l.textContent === `Round ${r} of 2` && document.querySelectorAll('.meteor:not(.hit)').length >= 2;
    }, round, { timeout: 10000 });
    const opts = await page.$$eval('.meteor', ms => ms.map(m => m.textContent));
    check(`${opt.label} zap round ${round}: ${round + 2} meteors, one right`,
      opts.length === round + 2 && opts.filter(o => o === word.toLowerCase()).length === 1, opts.join(','));
    if (opt.shots && round === 2) { await page.waitForTimeout(400); await shot(page, `${opt.shots}-zap`); await layoutOk(page, `${opt.shots} zap`); }
    if (opt.wrong && round === 1) {
      const wrong = opts.find(o => o !== word.toLowerCase());
      await page.click(`.meteor:text-is("${wrong}")`, { force: true });
      await page.waitForTimeout(150);
      check(`${opt.label} zap: a wrong meteor is not accepted`,
        await page.$eval(`.meteor:text-is("${wrong}")`, m => m.classList.contains('wrong') && !m.classList.contains('hit')));
    }
    await page.click(`.meteor:text-is("${word.toLowerCase()}")`, { force: true });
  }
}
async function dragTo(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let s = 1; s <= 10; s++) await page.mouse.move(ax + (bx - ax) * s / 10, ay + (by - ay) * s / 10);
  await page.mouse.up();
}
async function doBuild(page, word, opt) {
  if (opt.shots) { await shot(page, `${opt.shots}-build`); await layoutOk(page, `${opt.shots} build`); }
  if (opt.wrong) {
    const wrongTile = await page.$(`.tray .tile:not([data-letter="${word[0]}"])`);
    if (wrongTile) {
      await wrongTile.click({ force: true });
      await page.waitForTimeout(100);
      check(`${opt.label} build: a wrong crystal is refused`, (await page.$$('.activity .slot.filled')).length === 0);
    }
  }
  for (let i = 0; i < word.length; i++) {
    const tile = await page.$(`.tray .tile[data-letter="${word[i]}"]:not(.used):not(.flying)`);
    if (opt.drag && i === 0) {
      const slot = (await page.$$('.activity .slot'))[0];
      await dragTo(page, tile, slot);
    } else await tile.click({ force: true });
    await page.waitForFunction(n => document.querySelectorAll('.activity .slot.filled').length === n, i + 1, { timeout: 5000 });
  }
  if (opt.drag) check(`${opt.label} build: the dragged crystal landed`, true);
}
async function doMissing(page, word, opt) {
  if (opt.shots) { await shot(page, `${opt.shots}-missing`); await layoutOk(page, `${opt.shots} missing`); }
  for (let guard = 0; guard < 6; guard++) {
    const gap = await page.evaluate(() => [...document.querySelectorAll('.activity .slot')].findIndex(s => s.classList.contains('gap')));
    if (gap === -1) break;
    const choices = await page.$$eval('.choices .tile', ts => ts.map(t => t.getAttribute('data-letter')));
    check(`${opt.label} missing: three choices with the answer`, choices.length === 3 && choices.includes(word[gap]), choices.join(''));
    const filled = await page.$$eval('.activity .slot.filled', s => s.length);
    await page.click(`.choices .tile[data-letter="${word[gap]}"]`);
    await page.waitForFunction(n => document.querySelectorAll('.activity .slot.filled').length === n, filled + 1, { timeout: 5000 });
    await page.waitForTimeout(80);
  }
  check(`${opt.label} missing: every box filled`, (await page.$$('.activity .slot.filled')).length === word.length);
}
async function doBlast(page, word, opt) {
  if (opt.shots) { await shot(page, `${opt.shots}-blast`); await layoutOk(page, `${opt.shots} blast`); }
  check(`${opt.label} blast: the word is hidden`, (await page.$$('.activity .slot.filled')).length === 0);
  const keys = await page.$$eval('.keys .key', ks => ks.map(k => k.getAttribute('data-letter')));
  check(`${opt.label} blast: every letter of the word has a key`, [...word].every(c => keys.includes(c)), keys.join(''));
  for (let i = 0; i < word.length; i++) {
    if (opt.peek && i === 0) {
      const wrong = keys.find(k => k !== word[0]);
      await page.click(`.keys .key[data-letter="${wrong}"]`);
      await page.click(`.keys .key[data-letter="${wrong}"]`);
      await page.waitForTimeout(120);
      check(`${opt.label} blast: two misses flash the word and light the key`,
        (await page.$$('.activity .peek')).length === 1 &&
        await page.$eval(`.keys .key[data-letter="${word[0]}"]`, k => k.classList.contains('hint')));
    }
    await page.click(`.keys .key[data-letter="${word[i]}"]`);
    await page.waitForFunction(n => document.querySelectorAll('.activity .slot.filled').length === n, i + 1, { timeout: 5000 });
  }
}
const DO = { meet: doMeet, zap: doZap, build: doBuild, missing: doMissing, blast: doBlast };

/* Play one planet from the play screen to the egg. Returns the scenes seen. */
async function playPlanet(page, label, opt = {}) {
  await waitScreen(page, 'play');
  const st = await state(page);
  const word = st.word, acts = st.acts, scenes = [];
  if (opt.shots) await layoutOk(page, `${opt.shots} play`);
  for (let k = 0; k < acts.length; k++) {
    await waitStep(page, k);
    const before = await page.evaluate(() => window.__lastScene && JSON.stringify(window.__lastScene));
    await DO[acts[k]](page, word, { ...opt, label: `${label} ${word}`, wrong: opt.wrong && acts[k] !== 'meet' });
    if (acts[k] === 'build' || acts[k] === 'missing' || acts[k] === 'blast') {
      await page.waitForFunction(b => window.__lastScene && JSON.stringify(window.__lastScene) !== b, before, { timeout: 30000 });
      scenes.push(await page.evaluate(() => window.__lastScene));
      if (acts[k] === 'blast' && opt.shots) {
        await page.waitForFunction(() => !__game.stage.idle(), null, { timeout: 10000 });
        await page.waitForTimeout(500);
        await shot(page, `${opt.shots}-scene`);
      }
    }
  }
  return { word, acts, scenes };
}

async function hatch(page, label, opt = {}) {
  await waitScreen(page, 'hatch');
  if (opt.shots) { await shot(page, `${opt.shots}-egg`); await layoutOk(page, `${opt.shots} egg`); }
  const before = await page.evaluate(() => __game.settings().babies.length);
  for (let t = 0; t < 3; t++) { await page.click('#egg'); await page.waitForTimeout(90); }
  await page.waitForSelector('#btnHatchNext:not([hidden])', { timeout: 5000 });
  const name = (await page.textContent('#babyName')).trim();
  check(`${label}: the egg hatches a named baby`, /^Meet \w+!/.test(name), name);
  check(`${label}: the baby joins the base`, await page.evaluate(() => __game.settings().babies.length) === before + 1);
  if (opt.shots) { await page.waitForTimeout(700); await shot(page, `${opt.shots}-hatched`); await layoutOk(page, `${opt.shots} hatched`); }
}

/* Scenes left nothing behind: no letter props, no particles, stage idle. */
async function cleanStage(page, label) {
  await page.waitForFunction(() => __game.stage.idle(), null, { timeout: 30000 });
  const r = await page.evaluate(() => ({
    props: document.querySelectorAll('#fxLayer .letterprop, #fxLayer .payload').length,
    fx: document.querySelectorAll('#fxLayer .fx').length,
    rockets: document.querySelectorAll('.launch-rocket').length
  }));
  check(`${label}: the scene cleaned up after itself`, r.props === 0 && r.rockets === 0, JSON.stringify(r));
}

/* ================================================================
   1. The grown-up sets up a 4-word week; he plays the whole mission
   ================================================================ */
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 });
  await page.waitForTimeout(1800);
  await shot(page, 'phone-home');
  await layoutOk(page, 'home');
  check('home: sample words on first run', await page.textContent('#missionCount') === '0 of 5 planets');
  check('home: self-check is green', !(await page.$eval('#selfCheck', b => b.classList.contains('bad'))), await page.textContent('#selfCheck'));
  check('home: all four crew are out', await page.evaluate(() => Object.values(__game.stage.actors()).filter(a => a.op > 0.5).length) === 4);

  /* the crew wander and show off, but never leave the screen */
  {
    const bad = [];
    for (let k = 0; k < 20; k++) {
      const r = await page.evaluate(() => Object.values(__game.stage.actors()).filter(a => a.op > 0.5).map(a => ({ k: a.key, x: Math.round(a.x) })));
      for (const a of r) { const cx = a.x + 75; if (cx < 10 || cx > 380) bad.push(`${a.k}@${cx}`); }
      await page.waitForTimeout(250);
    }
    check('home: every crew member stays on screen', bad.length === 0, bad.slice(0, 5).join(','));
  }

  await page.click('#btnGrownups');
  await waitScreen(page, 'pass');
  await shot(page, 'phone-passcode');
  await layoutOk(page, 'passcode');
  for (const d of '1234') await page.click(`#keypad button:text-is("${d}")`);
  await page.waitForTimeout(500);
  check('passcode: a wrong code keeps the door shut', await screenOf(page) === 'pass');
  for (const d of '9999') await page.click(`#keypad button:text-is("${d}")`);
  await waitScreen(page, 'words');

  await page.click('#btnClear');
  check('clear asks for a second tap', (await page.$$('#wordList li:not(.empty)')).length === 5);
  await page.click('#btnClear');
  check('clear empties the list', (await page.$$('#wordList li:not(.empty)')).length === 0);
  await page.fill('#addInput', '1. frog, jump\nsaid  a  went');
  await page.click('#addForm button[type=submit]');
  const list = await page.$$eval('#wordList .w', ws => ws.map(w => w.textContent));
  check('a pasted list is split and cleaned', list.join(',') === 'frog,jump,said,went', list.join(','));
  check('a too-short word is reported, not silently lost', /Skipped/.test(await page.textContent('#addNote')));
  await page.fill('#addInput', 'Frog');
  await page.click('#addForm button[type=submit]');
  check('a duplicate is not added twice', (await page.$$('#wordList .w')).length === 4);
  check('the duplicate is explained', /Already/.test(await page.textContent('#addNote')));
  await layoutOk(page, 'word list');
  await shot(page, 'phone-words');

  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'home');
  check('the list survives closing the app', (await page.evaluate(() => __game.settings().words.join(','))) === 'FROG,JUMP,SAID,WENT');
  check('home shows a 4-planet mission', await page.textContent('#missionCount') === '0 of 4 planets');
  check('4 planets on the track', (await page.$$('#missionTrack i')).length === 4);

  await page.click('#btnPlay');
  await waitScreen(page, 'play');
  const allScenes = [];
  const played = [];
  for (let i = 0; i < 4; i++) {
    const label = `planet ${i + 1}`;
    const opt = { drag: i === 0, wrong: i === 1, peek: i === 2, shots: i === 0 ? 'phone' : null };
    const r = await playPlanet(page, label, opt);
    played.push(r);
    check(`${label}: a new word starts from the beginning (meet, zap, build, blast)`, r.acts.join(',') === 'meet,zap,build,blast', r.acts.join(','));
    allScenes.push(...r.scenes);
    await hatch(page, label, { shots: i === 0 ? 'phone' : null });
    await cleanStage(page, label);
    if (i === 0) {
      /* a look at the map between planets, then carry on from it */
      await page.click('#btnHatchNext');
      await waitScreen(page, 'play');
      await page.click('#btnPlayBack');
      await waitScreen(page, 'map');
      await page.waitForTimeout(500);
      await shot(page, 'phone-map');
      await layoutOk(page, 'map');
      check('map: the first planet shows its baby', (await page.$$('.map-node.done .done-badge')).length === 1);
      check('map: the rocket waits at planet 2', await page.$eval('.map-node.next .map-word', e => e.textContent) === 'jump');
      check('map: the finale is locked', (await page.$$('.map-finale.locked')).length === 1);
      await page.click('.map-finale .planet-btn', { force: true });
      await page.waitForTimeout(200);
      check('map: a locked finale says why', /every planet/.test(await page.textContent('#toast')));
      await page.click('.map-node.next .planet-btn', { force: true });
    } else if (i < 3) await page.click('#btnHatchNext');
  }
  check('4 planets played in order', played.map(p => p.word).join(',') === 'FROG,JUMP,SAID,WENT', played.map(p => p.word).join(','));
  check('the hatch button now offers the meteor shower', /Meteor shower/.test(await page.textContent('#btnHatchNext')));

  const st1 = await page.evaluate(() => __game.settings().stats);
  check('mastery: clean spells level a word up', st1.FROG.level === 1 && st1.JUMP.level === 1, JSON.stringify(st1.FROG));
  check('mastery: a peeked word stays at level 0', st1.SAID.level === 0, JSON.stringify(st1.SAID));

  /* the meteor shower: the shakiest words, blast only */
  await page.click('#btnHatchNext');
  await waitScreen(page, 'play');
  const fin = await state(page);
  check('finale: it is a review', fin.review === true);
  check('finale: the peeked word comes first', fin.word === 'SAID', fin.word);
  check('finale: blast only, all four words', fin.acts.length === 4 && fin.acts.every(a => a === 'blast'), fin.acts.join(','));
  await shot(page, 'phone-finale');
  for (let k = 0; k < fin.acts.length; k++) {
    await waitStep(page, k);
    const w = (await state(page)).word;
    const before = await page.evaluate(() => JSON.stringify(window.__lastScene));
    await doBlast(page, w, { label: `finale ${w}` });
    await page.waitForFunction(b => JSON.stringify(window.__lastScene) !== b, before, { timeout: 30000 });
    allScenes.push(await page.evaluate(() => window.__lastScene));
  }
  await waitScreen(page, 'done');
  await cleanStage(page, 'finale');
  await page.waitForTimeout(1200);
  await shot(page, 'phone-done');
  await layoutOk(page, 'done');
  check('done: says all four words', /all 4 words/.test(await page.textContent('#doneLine')), await page.textContent('#doneLine'));
  check('done: the finale is saved', await page.evaluate(() => __game.settings().week.finale) === true);
  const st2 = await page.evaluate(() => __game.settings().stats);
  check('mastery: the reviewed word climbs', st2.SAID.level === 1 && st2.FROG.level === 2, JSON.stringify([st2.SAID.level, st2.FROG.level]));

  const ids = allScenes.map(s => s && s.id);
  console.log('  scenes played: ' + allScenes.map(s => `${s.id}(${s.lead}${s.mirror ? ',m' : ''})`).join('  '));
  check('12 scenes played (2 per planet + 4 in the finale)', ids.filter(Boolean).length === 12, ids.join(','));
  for (let i = 1; i < ids.length; i++) check(`scene ${i} differs from the one before`, ids[i] !== ids[i - 1], ids.join(','));
  /* the planner's guarantee: a scene never comes back within 3 of itself
     (each lead has 6 scenes, so the 3-deep window can always be honoured) */
  for (let i = 3; i < ids.length; i++) check(`scenes ${i - 3}-${i} are all different`, new Set(ids.slice(i - 3, i + 1)).size === 4, ids.join(','));
  console.log(`  ${new Set(ids).size} different scenes in ${ids.length}`);
  check('all four crew led a scene', new Set(allScenes.map(s => s.lead)).size === 4, allScenes.map(s => s.lead).join(','));
  check('the rocket launched from every planet (4 countdowns)', (await page.evaluate(() => window.__spoken.filter(s => s.text === '3').length)) === 4);

  /* Dino Base: four babies wander and answer to their names */
  await page.click('#btnDoneBase');
  await waitScreen(page, 'base');
  await page.waitForTimeout(1200);
  await shot(page, 'phone-base');
  await layoutOk(page, 'base');
  check('base: four babies live here', (await page.$$('#babies .baby')).length === 4);
  const x0 = await page.$$eval('#babies .baby', bs => bs.map(b => b.style.transform));
  await page.waitForTimeout(3500);
  const x1 = await page.$$eval('#babies .baby', bs => bs.map(b => b.style.transform));
  check('base: the babies move about', x0.some((t, i) => t !== x1[i]));
  const n = await spokenCount(page);
  await page.click('#babies .baby >> nth=0', { force: true });
  await page.waitForTimeout(150);
  const said = await spokenSince(page, n);
  const nm = await page.$eval('#babies .baby.named .tag', t => t.textContent);
  check('base: a tapped baby says its name', said.some(t => t.startsWith(nm)), said.join('|') + ' / ' + nm);
  const keep = await page.evaluate(() => __game.settings().babies.length);
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'home');
  check('babies are kept for good', await page.evaluate(() => __game.settings().babies.length) === keep);
  check('home: the base button counts them', (await page.textContent('#babyCount')).trim() === '4');
  check('home: the mission reads complete', /PLAY AGAIN/.test(await page.textContent('#playLabel')));

  const spoken = await page.evaluate(() => window.__spoken.map(s => s.text));
  const triples = spoken.filter((t, i) => i > 1 && t === spoken[i - 1] && t === spoken[i - 2]);
  check('no letter is ever said three times running', triples.length === 0, triples.slice(0, 3).join(','));
  check('no page errors in the whole mission', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/* ================================================================
   2. A word he knows gets the harder route; stalls; Back mid-scene
   ================================================================ */
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 }, { words: ['the', 'come', 'have', 'play', 'look', 'said', 'where'] });
  check('a 7-word week makes 7 planets', (await page.$$('#missionTrack i')).length === 7);
  await page.evaluate(() => {
    const S = __game.settings();
    S.stats.LOOK = { level: 1, plays: 1, clean: 1, misses: 0, posMisses: [0, 0, 0, 0], last: 1 };
    S.stats.WHERE = { level: 2, plays: 2, clean: 2, misses: 0, posMisses: [0, 0, 0, 0, 3], last: 1 };
  });
  await page.evaluate(() => __game.startPlanet(4));
  await waitScreen(page, 'play');
  check('a level-1 word swaps build for missing pieces', (await state(page)).acts.join(',') === 'meet,zap,missing,blast', (await state(page)).acts.join(','));
  await page.evaluate(() => __game.startPlanet(6));
  await waitScreen(page, 'play');
  check('a level-2 word goes straight to the hard stuff', (await state(page)).acts.join(',') === 'meet,missing,blast', (await state(page)).acts.join(','));
  await doMeet(page, 'WHERE', { label: 'where' });
  await waitStep(page, 1);
  check('missing: the letter he missed before is a gap', await page.$eval('.activity .slot >> nth=4', s => s.classList.contains('gap') || !s.classList.contains('filled')));
  await shot(page, 'phone-missing');
  await layoutOk(page, 'missing');

  /* he stalls on zap: the prompt comes again and a buddy waves */
  await page.evaluate(() => __game.startPlanet(0));
  await waitScreen(page, 'play');
  await page.click('.activity .btn-launch', { timeout: 20000 }).catch(async () => {
    await page.waitForSelector('.activity .btn-launch:not([hidden])', { timeout: 20000 });
    await page.click('.activity .btn-launch');
  });
  await waitStep(page, 1);
  {
    const n0 = await spokenCount(page);
    await page.waitForTimeout(9800);
    const said = await spokenSince(page, n0);
    check('a stalled child gets a nudge', said.some(t => /Which one says the/.test(t)), said.join(' | '));
    check('a buddy waves at the answer', await page.evaluate(() => (__game.stage.ambient.lastReact() || {}).kind === 'wave'));
  }

  /* real speed: Back has to land while the scene is running */
  await page.evaluate(() => __game.stage.setTimeScale(1));
  await doZap(page, 'THE', { label: 'the' });
  await waitStep(page, 2);
  await doBuild(page, 'THE', { label: 'the' });
  await page.waitForFunction(() => !__game.stage.idle(), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, 'phone-scene-build');
  await page.click('#btnPlayBack');
  await waitScreen(page, 'map');
  const after = await page.evaluate(() => ({
    idle: __game.stage.idle(), props: document.querySelectorAll('#fxLayer .letterprop, #fxLayer .payload').length, n: window.__spoken.length
  }));
  check('Back mid-scene stops it cleanly', after.idle && after.props === 0, JSON.stringify(after));
  await page.waitForTimeout(2500);
  const late = await page.evaluate(n => window.__spoken.slice(n).map(s => s.screen + ':' + s.text), after.n);
  check('nothing from the abandoned planet is said afterwards', late.every(s => s.startsWith('map:')), late.join(' | '));
  check('still on the map, not dragged on by the old scene', await screenOf(page) === 'map');

  /* a peek (help) during blast knocks a known word back a level */
  await page.evaluate(() => __game.stage.setTimeScale(4));
  const lvl0 = await page.evaluate(() => __game.settings().stats.LOOK.level);
  await page.evaluate(() => __game.startPlanet(4));
  await waitScreen(page, 'play');
  for (const a of ['meet', 'zap', 'missing']) { await waitStep(page, ['meet', 'zap', 'missing'].indexOf(a)); await DO[a](page, 'LOOK', { label: 'look' }); }
  await waitStep(page, 3);
  await doBlast(page, 'LOOK', { label: 'look', peek: true });
  await waitScreen(page, 'hatch');
  const lvl1 = await page.evaluate(() => __game.settings().stats.LOOK.level);
  check('a word that needed help goes back a level', lvl1 === lvl0 - 1, `${lvl0} -> ${lvl1}`);

  /* a new list is a new week */
  await page.evaluate(() => __game.go('pass'));
  for (const d of '9999') await page.click(`#keypad button:text-is("${d}")`);
  await waitScreen(page, 'words');
  check('progress lists every word with stars', (await page.$$('#progressList li')).length === 7);
  await page.fill('#addInput', 'friend');
  await page.click('#addForm button[type=submit]');
  check('adding a word starts a new mission', await page.evaluate(() => __game.settings().week.done.length) === 0);
  check('known words keep their stars across weeks', await page.evaluate(() => __game.settings().stats.WHERE.level) === 2);
  await page.click('[data-back="home"] >> visible=true');
  await waitScreen(page, 'home');
  check('home shows the 8-planet mission', await page.textContent('#missionCount') === '0 of 8 planets');

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/* ================================================================
   3. Every screen at a small phone and an iPad, with a long word
   ================================================================ */
for (const [name, vp] of [['small', { width: 375, height: 667 }], ['ipad', { width: 820, height: 1180 }]]) {
  const { context, page, errors } = await openApp(vp, { words: ['butterfly', 'said', 'the'] });
  await page.evaluate(() => { __game.settings().babies = [1, 2, 3, 4, 5, 6, 7].map(s => ({ seed: s * 7919, at: 1 })); });
  await page.evaluate(() => __game.go('home'));
  await page.waitForTimeout(1500);
  await shot(page, `${name}-home`); await layoutOk(page, `${name} home`);
  await page.evaluate(() => __game.startPlanet(0));
  await waitScreen(page, 'play');
  await shot(page, `${name}-meet`); await layoutOk(page, `${name} meet (9 letters)`);
  for (const [k, act] of [[1, 'zap'], [2, 'build'], [3, 'blast']]) {
    await page.evaluate(k => __game.jump(k), k);
    await waitStep(page, k);
    await page.waitForTimeout(400);
    await shot(page, `${name}-${act}`);
    await layoutOk(page, `${name} ${act} (9 letters)`);
    const fits = await page.evaluate(() => [...document.querySelectorAll('.activity .slot')].every(q => { const r = q.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    check(`${name} ${act}: a 9-letter word's boxes fit across the screen`, fits);
  }
  await page.evaluate(() => __game.jump(2, 'missing'));
  await waitStep(page, 2);
  await shot(page, `${name}-missing`); await layoutOk(page, `${name} missing (9 letters)`);
  await page.evaluate(() => __game.go('hatch'));
  await waitScreen(page, 'hatch'); await shot(page, `${name}-egg`); await layoutOk(page, `${name} egg`);
  await page.evaluate(() => __game.go('map'));
  await waitScreen(page, 'map'); await shot(page, `${name}-map`); await layoutOk(page, `${name} map`);
  await page.evaluate(() => __game.go('base'));
  await waitScreen(page, 'base'); await page.waitForTimeout(900); await shot(page, `${name}-base`); await layoutOk(page, `${name} base`);
  await page.evaluate(() => __game.go('done'));
  await waitScreen(page, 'done'); await page.waitForTimeout(900); await shot(page, `${name}-done`); await layoutOk(page, `${name} done`);
  await page.evaluate(() => __game.go('pass'));
  await waitScreen(page, 'pass'); await layoutOk(page, `${name} passcode`);
  await page.evaluate(() => __game.go('words'));
  await waitScreen(page, 'words'); await shot(page, `${name}-words`); await layoutOk(page, `${name} words`);
  check(`${name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`screenshots: ${SHOTS}`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures.slice(0, 40)) console.log('  - ' + f);
  process.exit(1);
}
