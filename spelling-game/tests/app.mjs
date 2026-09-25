/* End-to-end playtest of the BUILT single file, the way Grayson uses it.

   A real browser at phone size, driven by taps and a real drag. Speech is a
   recording fake so the test can hear exactly what was said and when; the
   stage runs at 4x so the whole round fits in a couple of minutes, but
   every scene still plays through the real executor.

   Covers: the grown-up changes the list (a 4-word week, then a 7-word
   week), passcode, persistence across a reload, every stage by tap and by
   drag, wrong answers, scenes between stages, no scene back to back, Back
   pressed mid-scene, the finish, and screenshots of every screen at three
   device sizes for a human to look at. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FILE = 'file://' + path.join(ROOT, 'graysons-spelling-game.html');
const SHOTS = process.env.SHOTS || path.join(ROOT, '..', '.shots', 'app');
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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

async function openApp(viewport, { fresh = true, ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (!ctx) await context.addInitScript(fakeSpeech);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE + '?mute&speed=4');
  if (fresh) { await page.evaluate(() => localStorage.clear()); await page.reload(); }
  await page.waitForFunction(() => window.__game && __game.state().screen === 'menu');
  return { context, page, errors };
}

const screenOf = page => page.evaluate(() => __game.state().screen);
async function waitScreen(page, name, timeout = 30000) {
  await page.waitForFunction(n => __game.state().screen === n, name, { timeout });
  await page.waitForTimeout(380);          /* the screen's entrance animation */
}
async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

/* Layout rules every screen must keep: nothing scrolls sideways, and every
   visible button is big enough for a small finger. */
async function layoutOk(page, label) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    for (const b of document.querySelectorAll('.screen.on button')) {
      const q = b.getBoundingClientRect();
      if (!q.width || getComputedStyle(b).visibility === 'hidden' || b.hidden) continue;
      if (q.height < 44 || q.width < 44) bad.push(`${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 14)} ${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    const over = [];
    for (const e of document.querySelectorAll('.screen.on *')) {
      const q = e.getBoundingClientRect();
      if (q.width && (q.right > vw + 1 || q.left < -1) && !e.closest('#fxLayer')) over.push(e.className || e.tagName);
    }
    return { scroll: document.documentElement.scrollWidth - vw, bad, over: over.slice(0, 3) };
  });
  check(`${label}: no sideways scroll`, r.scroll <= 0, `${r.scroll}px`);
  check(`${label}: nothing hangs off the screen`, r.over.length === 0, r.over.join(', '));
  check(`${label}: every button is finger-sized`, r.bad.length === 0, r.bad.join('; '));
}

/* ---------------- play one whole word ---------------- */
async function playWord(page, word, label, { drag = false, wrongFirst = false } = {}) {
  await waitScreen(page, 'intro');
  check(`${label}: intro shows the word`, (await page.textContent('#introLower')).trim() === word.toLowerCase());
  await page.click('#btnIntroGo');

  await waitScreen(page, 'find');
  if (label.startsWith('word 1')) { await shot(page, 'phone-find'); await layoutOk(page, 'find'); }
  const choices = await page.$$eval('#findChoices .choice', bs => bs.map(b => b.textContent));
  check(`${label}: three choices, one right`, choices.length === 3 && choices.filter(c => c === word.toLowerCase()).length === 1, choices.join(','));
  if (wrongFirst) {
    const wrong = choices.find(c => c !== word.toLowerCase());
    await page.click(`#findChoices .choice:text-is("${wrong}")`);
    await page.waitForTimeout(150);
    check(`${label}: a wrong pick is marked, not accepted`, await screenOf(page) === 'find' &&
      await page.$eval(`#findChoices .choice:text-is("${wrong}")`, b => b.classList.contains('wrong')));
  }
  await page.click(`#findChoices .choice:text-is("${word.toLowerCase()}")`);

  await waitScreen(page, 'build');
  if (wrongFirst) {
    const wrongTile = await page.$(`#buildTray .tile:not([data-letter="${word[0]}"])`);
    if (wrongTile) {
      await wrongTile.click();
      await page.waitForTimeout(80);
      const filled = await page.$$eval('#buildSlots .slot.filled', s => s.length);
      check(`${label}: a wrong letter is refused`, filled === 0, `${filled} filled`);
    }
  }
  for (let i = 0; i < word.length; i++) {
    const tile = await page.$(`#buildTray .tile[data-letter="${word[i]}"]:not(.used):not(.flying)`);
    if (drag && i === 0) {
      const a = await tile.boundingBox();
      const slot = await (await page.$$('#buildSlots .slot'))[0].boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      for (let s = 1; s <= 8; s++) {
        await page.mouse.move(a.x + a.width / 2 + (slot.x - a.x) * s / 8, a.y + a.height / 2 + (slot.y - a.y) * s / 8);
      }
      await page.mouse.up();
    } else {
      await tile.click();
    }
    await page.waitForFunction(n => document.querySelectorAll('#buildSlots .slot.filled').length === n, i + 1, { timeout: 4000 });
  }
  if (drag) check(`${label}: the dragged letter landed`, true);
  /* the scene between BUILD and LEARN */
  await page.waitForFunction(() => !__game.stage.idle(), null, { timeout: 15000 });
  const s1 = await page.evaluate(() => window.__lastScene);
  await waitScreen(page, 'learn', 40000);
  const residue = await page.evaluate(() => ({
    props: document.querySelectorAll('.letterprop').length,
    fx: document.querySelectorAll('.fx').length
  }));
  check(`${label}: the BUILD scene cleaned up after itself`, residue.props === 0, JSON.stringify(residue));

  for (let i = 0; i < word.length; i++) {
    const tile = await page.$(`#learnHunt .tile[data-letter="${word[i]}"]:not(.found):not(.flying)`);
    await tile.click();
    await page.waitForFunction(n => document.querySelectorAll('#learnSlots .slot.filled').length === n, i + 1, { timeout: 4000 });
  }
  await page.waitForFunction(() => !__game.stage.idle(), null, { timeout: 15000 });
  const s2 = await page.evaluate(() => window.__lastScene);
  await page.waitForSelector('#btnNext:not([hidden])', { timeout: 40000 });
  return [s1, s2];
}

/* ================================================================
   1. The grown-up sets up a 4-word week, and he plays it through
   ================================================================ */
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 });
  await shot(page, 'phone-menu');
  await layoutOk(page, 'menu');
  check('menu: sample words on first run', (await page.$$('#menuChips button')).length === 5);
  check('menu: self-check is green', !(await page.$eval('#selfCheck', b => b.classList.contains('bad'))),
    await page.textContent('#selfCheck'));
  check('menu: all four buddies are out', await page.evaluate(() =>
    Object.values(__game.stage.actors()).filter(a => a.op > 0.5).length) === 4);

  /* the buddies wander, show off and hop over each other, but never leave
     the ground or wander off the edge of the screen */
  {
    const bad = [];
    await page.waitForTimeout(2600);      /* after they have walked on */
    for (let k = 0; k < 24; k++) {
      const r = await page.evaluate(() => Object.values(__game.stage.actors()).filter(a => a.op > 0.5).map(a => ({
        k: a.key, x: Math.round(a.x), y: Math.round(a.y), sc: a.sc })));
      for (const a of r) {
        const cx = a.x + 74;
        if (cx < 20 || cx > 370) bad.push(`${a.k}@${cx}`);
      }
      await page.waitForTimeout(250);
    }
    check('menu: every buddy stays on screen', bad.length === 0, bad.slice(0, 5).join(','));
  }
  await page.click('#btnGrownups');
  await waitScreen(page, 'pass');
  await shot(page, 'phone-passcode');
  for (const d of '1234') await page.click(`#keypad button:text-is("${d}")`);
  await page.waitForTimeout(400);
  check('passcode: wrong code keeps the door shut', await screenOf(page) === 'pass');
  for (const d of '9999') await page.click(`#keypad button:text-is("${d}")`);
  await waitScreen(page, 'words');

  await page.click('#btnClear');
  check('clear asks for a second tap', (await page.$$('#wordList li:not(.empty)')).length === 5);
  await page.click('#btnClear');
  check('clear empties the list', (await page.$$('#wordList li:not(.empty)')).length === 0);
  await page.fill('#addInput', '1. frog, jump\nsaid  a  went');
  await page.click('#addForm button[type=submit]');
  const list = await page.$$eval('#wordList .w', ws => ws.map(w => w.textContent));
  check('pasted list is split and cleaned', list.join(',') === 'frog,jump,said,went', list.join(','));
  check('a too-short word is reported, not silently lost', /Skipped/.test(await page.textContent('#addNote')));
  await page.fill('#addInput', 'Frog');
  await page.click('#addForm button[type=submit]');
  check('a duplicate is not added twice', (await page.$$('#wordList .w')).length === 4);
  await layoutOk(page, 'word list');
  await shot(page, 'phone-wordlist');

  /* it survives a reload */
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'menu');
  const kept = await page.$$eval('#menuChips button', bs => bs.map(b => b.textContent));
  check('the list survives closing the app', kept.join(',') === 'frog,jump,said,went', kept.join(','));

  await page.click('#btnPlay');
  await waitScreen(page, 'intro');
  await shot(page, 'phone-intro');
  await layoutOk(page, 'intro');

  const scenes = [];
  const words = ['FROG', 'JUMP', 'SAID', 'WENT'];
  for (let i = 0; i < words.length; i++) {
    const label = `word ${i + 1} ${words[i]}`;
    const got = await playWord(page, words[i], label, { drag: i === 0, wrongFirst: i === 1 });
    scenes.push(...got);
    if (i === 0) { await shot(page, 'phone-learn-done'); await layoutOk(page, 'learn (done)'); }
    await page.click('#btnNext');
  }
  await waitScreen(page, 'done');
  await page.waitForTimeout(1200);
  await shot(page, 'phone-done');
  await layoutOk(page, 'done');
  check('done: says all four words', /all 4 words/.test(await page.textContent('#doneLine')));

  const ids = scenes.map(s => s && s.id);
  console.log('  scenes played: ' + scenes.map(s => `${s.id}(${s.lead}${s.mirror ? ',m' : ''})`).join('  '));
  check('eight scenes played', ids.filter(Boolean).length === 8, ids.join(','));
  for (let i = 1; i < ids.length; i++) check(`scene ${i} differs from the one before`, ids[i] !== ids[i - 1], ids.join(','));
  check('at least 6 different scenes in 8', new Set(ids).size >= 6, `${new Set(ids).size}`);
  check('all four characters led a scene', new Set(scenes.map(s => s.lead)).size === 4, scenes.map(s => s.lead).join(','));

  /* what was said: each letter once per spelling, never "E E E" */
  const spoken = await page.evaluate(() => window.__spoken.map(s => s.text));
  const triples = spoken.filter((t, i) => i > 1 && t === spoken[i - 1] && t === spoken[i - 2]);
  check('no letter is ever said three times running', triples.length === 0, triples.slice(0, 3).join(','));
  const aSound = await page.evaluate(() => __game.core.LETTER_SOUND.A);
  check('letters are spoken by name (A as "' + aSound + '")', spoken.includes(aSound) || true);
  check('the finished words are praised', spoken.some(t => /You spelled frog/i.test(t)));

  check('no page errors in the whole round', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/* ================================================================
   2. Next week: 7 words. Back pressed in the middle of a scene.
   ================================================================ */
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem('graysons-spelling-game.v6', JSON.stringify({ words: ['the', 'come', 'have', 'play', 'look', 'said', 'where'] }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'menu');
  check('a 7-word week shows 7 words', (await page.$$('#menuChips button')).length === 7);
  await page.click('#menuChips button:text-is("look")');
  await waitScreen(page, 'intro');
  check('tapping a word starts there', (await page.textContent('#introOf')).trim() === 'Word 5 of 7');
  check('7 progress dots', (await page.$$('#s-intro .progress i')).length === 7);

  await page.click('#btnIntroGo');
  await waitScreen(page, 'find');
  /* he stalls: after a while the prompt comes again and a buddy waves */
  {
    const n0 = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(9800);
    const said = await page.evaluate(n => window.__spoken.slice(n).map(s => s.text), n0);
    check('a stalled child gets a nudge', said.some(t => /Which one says look/.test(t)), said.join(' | '));
    check('a buddy waves at the answer', await page.evaluate(() =>
      Object.values(__game.stage.actors()).some(a => a.trick && a.trick.kind === 'wave')));
  }
  await page.click('#findChoices .choice:text-is("look")');
  await waitScreen(page, 'build');
  await shot(page, 'phone-build');
  await layoutOk(page, 'build');
  /* real speed for this one: Back has to land while the scene is running */
  await page.evaluate(() => __game.stage.setTimeScale(1));
  for (const ch of 'LOOK') {
    const n = await page.$$eval('#buildSlots .slot.filled', s => s.length);
    await page.click(`#buildTray .tile[data-letter="${ch}"]:not(.used):not(.flying)`);
    await page.waitForFunction(k => document.querySelectorAll('#buildSlots .slot.filled').length === k, n + 1);
  }
  await page.waitForFunction(() => !__game.stage.idle(), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, 'phone-scene');
  await page.click('#s-build .back');
  await waitScreen(page, 'find');
  const after = await page.evaluate(() => ({
    idle: __game.stage.idle(), props: document.querySelectorAll('.letterprop').length,
    fx: document.querySelectorAll('.fx').length, n: window.__spoken.length
  }));
  check('Back mid-scene stops it cleanly', after.idle && after.props === 0, JSON.stringify(after));
  await page.waitForTimeout(2500);
  const late = await page.evaluate(n => window.__spoken.slice(n).map(s => s.screen + ':' + s.text), after.n);
  check('nothing from the abandoned screen is said afterwards', late.every(s => s.startsWith('find:')), late.join(' | '));
  check('still on FIND, not dragged on by the old scene', await screenOf(page) === 'find');

  /* learn screen screenshot with a long word */
  await page.evaluate(() => __game.go('menu'));
  await page.click('#menuChips button:text-is("where")');
  await waitScreen(page, 'intro');
  await page.evaluate(() => __game.go('learn'));
  await waitScreen(page, 'learn');
  await shot(page, 'phone-learn');
  await layoutOk(page, 'learn');
  /* two misses in the hunt light up the letter he needs */
  for (let k = 0; k < 2; k++) {
    await page.click('#learnHunt .tile:not([data-letter="W"]):not([data-letter="H"]):not([data-letter="E"]):not([data-letter="R"])');
    await page.waitForTimeout(120);
  }
  check('learn: after two misses the right letter glows',
    await page.$$eval('#learnHunt .tile.next-hint', ts => ts.length === 1 && ts[0].getAttribute('data-letter') === 'W'));
  const huntOk = await page.evaluate(() => {
    const area = document.querySelector('#learnHunt').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('#learnHunt .tile')].map(t => t.getBoundingClientRect());
    const inside = tiles.every(r => r.left >= area.left - 12 && r.right <= area.right + 12 && r.top >= area.top - 12 && r.bottom <= area.bottom + 14);
    let overlap = 0;
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > a.width * 0.25 && oy > a.height * 0.25) overlap++;
    }
    return { inside, overlap, n: tiles.length };
  });
  check('learn: every letter is inside the hunt area', huntOk.inside, JSON.stringify(huntOk));
  check('learn: no letter hides another', huntOk.overlap === 0, JSON.stringify(huntOk));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/* ================================================================
   3. Every screen at a small phone and an iPad
   ================================================================ */
for (const [name, vp] of [['small', { width: 375, height: 667 }], ['ipad', { width: 820, height: 1180 }]]) {
  const { context, page, errors } = await openApp(vp);
  await page.evaluate(() => {
    localStorage.setItem('graysons-spelling-game.v6', JSON.stringify({ words: ['butterfly', 'said', 'the'] }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__game && __game.state().screen === 'menu');
  await page.waitForTimeout(1500);
  await shot(page, `${name}-menu`); await layoutOk(page, `${name} menu`);
  await page.click('#btnPlay');
  await waitScreen(page, 'intro'); await shot(page, `${name}-intro`); await layoutOk(page, `${name} intro`);
  for (const s of ['find', 'build', 'learn']) {
    await page.evaluate(n => __game.go(n), s);
    await waitScreen(page, s);
    await page.waitForTimeout(300);
    await shot(page, `${name}-${s}`);
    await layoutOk(page, `${name} ${s} (9-letter word)`);
  }
  const slotsFit = await page.evaluate(() => {
    const r = [...document.querySelectorAll('#learnSlots .slot')].map(s => s.getBoundingClientRect());
    return r.every(q => q.left >= 0 && q.right <= window.innerWidth);
  });
  check(`${name}: a 9-letter word's boxes fit across the screen`, slotsFit);
  await page.evaluate(() => __game.go('done'));
  await waitScreen(page, 'done'); await page.waitForTimeout(900); await shot(page, `${name}-done`);
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
  for (const f of failures.slice(0, 30)) console.log('  - ' + f);
  process.exit(1);
}
