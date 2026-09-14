/* Automated playtest for math-circus-act1.html.
   Drives the real page in Chromium at iPhone viewport sizes: taps through the
   hub, plays every game to a win AND to a deliberate failure, and verifies the
   localStorage write by reading it back. Fails on any console error. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = path.join(ROOT, '.shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = process.argv[2] || null;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ executablePath: EXEC });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(url + '/math-circus-act1.html', { waitUntil: 'load' });

const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const tap = id => page.evaluate(i => MC.tapId(i), id);
const tapF = async id => { await tap(id); await frame(); };
const ids = () => page.evaluate(() => MC.ids());
const dbg = () => page.evaluate(() => MC.current && MC.current.debug ? MC.current.debug() : null);
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(MC.state)));
const modalOf = () => page.evaluate(() => MC.modal ? { kind: MC.modal.kind, stars: MC.modal.stars, failed: !!MC.modal.failed, msg: MC.modal.message } : null);
const stored = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem(MC.SAVE_KEY)); } catch (e) { return null; } });
async function realTap(id) {
  const pt = await page.evaluate(i => {
    const r = MC.regions.find(rr => rr.id === i);
    if (!r) throw new Error('no region ' + i);
    const rect = document.getElementById('c').getBoundingClientRect();
    return { x: rect.left + MC.V.ox + (r.x + r.w / 2) * MC.V.s, y: rect.top + MC.V.oy + (r.y + r.h / 2) * MC.V.s };
  }, id);
  await page.touchscreen.tap(pt.x, pt.y);
  await frame();
}
async function shot(name) { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
/* Open a game from the hub through the real UI (pre-game card + difficulty). */
async function openGame(id, diff) {
  await page.evaluate(() => MC.goHub());
  await frame();
  await realTap(id);
  await frame();
  const m = await page.evaluate(() => MC.modal && MC.modal.kind);
  if (m !== 'pregame') throw new Error('pregame card did not open for ' + id);
  await realTap('m_d_' + diff);
  await realTap('m_start');
  await frame();
  const scr = await page.evaluate(() => MC.screen);
  if (scr !== 'game') throw new Error('game did not start: ' + id);
}
async function backToHub() {
  const has = await page.evaluate(() => MC.hasRegion('m_hub') || MC.hasRegion('g_back'));
  if (!has) throw new Error('no way back to hub');
  if (await page.evaluate(() => MC.hasRegion('m_hub'))) await tap('m_hub');
  else await tap('g_back');
  await frame();
}

/* ------------------------------------------------------------- milestone 1-2 */
if (!ONLY) {
  const hubIds = await ids();
  const expect = ['seals', 'trapeze', 'magician', 'traffic', 'cannon', 'riddle', 'balance', 'tickets', 'elephant', 'bolts', 'clowns', 'lions'];
  check('hub shows all twelve rings', expect.every(i => hubIds.includes(i)), hubIds.join(','));
  check('hub has settings gear', hubIds.includes('settings'));
  const s0 = await state();
  check('fresh save has 12 game records', Object.keys(s0.games).length === 12);
  check('fresh save is all zero stars', expect.every(i => s0.games[i].stars === 0));
  await shot('hub');

  await realTap('settings');
  check('settings opens', (await page.evaluate(() => MC.modal.kind)) === 'settings');
  await realTap('m_sound');
  check('sound toggles off', (await state()).settings.sound === false);
  check('sound setting persisted', (await stored()).settings.sound === false);
  await realTap('m_sound');
  check('sound toggles back on', (await state()).settings.sound === true);
  await realTap('m_reset');
  check('reset asks for confirmation', (await page.evaluate(() => MC.modal.kind)) === 'confirm');
  await realTap('m_no');
  check('cancel returns to settings', (await page.evaluate(() => MC.modal.kind)) === 'settings');
  await realTap('m_close2');
  check('settings closes', (await page.evaluate(() => MC.modal)) === null);
  await shot('settings');

  await realTap('seals');
  check('pre-game card opens', (await page.evaluate(() => MC.modal.kind)) === 'pregame');
  await shot('pregame');
  await realTap('m_close');
  check('pre-game card closes', (await page.evaluate(() => MC.modal)) === null);
}

/* ================================================================== GAME 1 */
async function testSeals() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('seals', diff);
    check(`seals/${diff}: back to hub always available`, (await ids()).includes('g_back'));
    const d0 = await dbg();
    const expectedN = { easy: 4, medium: 6, hard: 9 }[diff];
    check(`seals/${diff}: ${expectedN} seals`, d0.n === expectedN, 'n=' + d0.n);
    const parRange = { easy: [1, 1], medium: [2, 3], hard: [4, 8] }[diff];
    check(`seals/${diff}: par in spec range`, d0.par >= parRange[0] && d0.par <= parRange[1], 'par=' + d0.par);
    if (diff === 'hard') await shot('seals');
    /* selection sort == minimum swaps, so a clean solve should score 3 stars */
    await page.evaluate(async () => {
      const wait = () => new Promise(r => requestAnimationFrame(r));
      const n = MC.current.debug().n;
      for (let i = 0; i < n; i++) {
        const d = MC.current.debug();
        if (d.perm[i] === i + 1) continue;
        const j = d.perm.indexOf(i + 1);
        MC.tapId('s' + i); await wait(); MC.tapId('s' + j); await wait();
      }
    });
    await frame();
    const m = await modalOf();
    check(`seals/${diff}: solving wins`, m && m.kind === 'result', JSON.stringify(m));
    check(`seals/${diff}: par solve = 3 stars`, m && m.stars === 3, 'stars=' + (m && m.stars));
    const saved = await stored();
    /* the save schema keeps ONE best per game (not per difficulty), so bestMoves
       only ever moves down; assert it is at least as good as this solve. */
    check(`seals/${diff}: save written and readable`,
      saved.games.seals.stars === 3 && saved.games.seals.bestMoves <= d0.par && saved.games.seals.difficulty === diff,
      JSON.stringify(saved.games.seals));
    await backToHub();
  }
  /* deliberate inefficiency: two wasted swaps must cost stars */
  await openGame('seals', 'medium');
  await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 3; k++) { MC.tapId('s0'); await wait(); MC.tapId('s1'); await wait(); }
    const n = MC.current.debug().n;
    for (let i = 0; i < n; i++) {
      const d = MC.current.debug();
      if (d.perm[i] === i + 1) continue;
      const j = d.perm.indexOf(i + 1);
      MC.tapId('s' + i); await wait(); MC.tapId('s' + j); await wait();
    }
  });
  await frame();
  const m2 = await modalOf();
  check('seals: wasteful solve scores below 3 stars', m2 && m2.kind === 'result' && m2.stars < 3, 'stars=' + (m2 && m2.stars));
  check('seals: best score kept at the better value', (await stored()).games.seals.bestMoves <= 3);
  await backToHub();
}

/* ================================================================== GAME 2 */
async function testTrapeze() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('trapeze', diff);
    const d0 = await dbg();
    const expected = { easy: [1, 0.40], medium: [2, 0.25], hard: [3, 0.15] }[diff];
    check(`trapeze/${diff}: ${expected[0]} gap(s), window ${expected[1]}s`,
      d0.gaps === expected[0] && Math.abs(d0.win - expected[1]) < 1e-9, JSON.stringify(d0));
    if (diff === 'medium') await shot('trapeze');
    const res = await page.evaluate(async () => {
      const wait = () => new Promise(r => requestAnimationFrame(r));
      for (let k = 0; k < 6000; k++) {
        if (MC.modal) break;
        const d = MC.current.debug();
        if ((d.phase === 'swing' || d.phase === 'fly') && d.err < d.win * 0.3) MC.tapId('tap');
        await wait();
      }
      return MC.current.debug();
    });
    const m = await modalOf();
    check(`trapeze/${diff}: perfect timing clears the level`, m && m.kind === 'result' && m.stars === 3,
      JSON.stringify({ m, res }));
    check(`trapeze/${diff}: clean run saved`, (await stored()).games.trapeze.bestStreak >= expected[0]);
    await backToHub();
  }
  /* deliberate miss: tapping far from the zone must drop the artist */
  await openGame('trapeze', 'easy');
  const miss = await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 600; k++) {
      const d = MC.current.debug();
      if (d.phase === 'swing' && d.err > d.win * 2.2) { MC.tapId('tap'); await wait(); return MC.current.debug(); }
      await wait();
    }
    return MC.current.debug();
  });
  check('trapeze: mistimed release drops the artist', miss.misses === 1 && miss.phase === 'fall', JSON.stringify(miss));
  const after = await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 400; k++) { const d = MC.current.debug(); if (d.phase === 'swing') return d; await wait(); }
    return MC.current.debug();
  });
  check('trapeze: a fall resets the gap, not the level', after.phase === 'swing' && after.idx === 0, JSON.stringify(after));
  await backToHub();
}


/* ================================================================== GAME 3 */
async function testMagician() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('magician', diff);
    const d0 = await dbg();
    const want = { easy: [6, 3], medium: [4.5, 4], hard: [3, 4] }[diff];
    check(`magician/${diff}: ${want[0]}s timer, ${want[1]} choices`,
      d0.time === want[0] && d0.opts === want[1] && d0.options.length === want[1], JSON.stringify(d0));
    check(`magician/${diff}: 8 rounds`, d0.rounds === 8);
    if (diff === 'hard') await shot('magician');
    await page.evaluate(async () => {
      const wait = () => new Promise(r => requestAnimationFrame(r));
      for (let k = 0; k < 40000; k++) {
        if (MC.modal) break;
        const d = MC.current.debug();
        if (d.phase === 'ask') MC.tapId('o' + d.correctIdx);
        await wait();
      }
    });
    const m = await modalOf();
    check(`magician/${diff}: eight correct answers rescues him`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    check(`magician/${diff}: zero hits saved`, (await stored()).games.magician.bestHits === 0);
    await backToHub();
  }
  /* deliberate failure: three wrong answers must lose the magician */
  await openGame('magician', 'easy');
  const lost = await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 40000; k++) {
      if (MC.modal) break;
      const d = MC.current.debug();
      if (d.phase === 'ask') MC.tapId('o' + (d.correctIdx === 0 ? 1 : 0));
      await wait();
    }
    return MC.current.debug();
  });
  const fm = await modalOf();
  check('magician: three wrong answers ends the run', fm && fm.failed === true && fm.stars === 0, JSON.stringify(fm));
  check('magician: hit points ran out', lost.hp <= 0, JSON.stringify(lost));
  check('magician: a failed run does not award stars', (await stored()).games.magician.stars === 3);
  await backToHub();
  /* deliberate timeout: letting the spell timer empty costs a hit point */
  await openGame('magician', 'easy');
  const timedOut = await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 40000; k++) {
      const d = MC.current.debug();
      if (d.hits > 0) return d;
      await wait();
    }
    return MC.current.debug();
  });
  check('magician: timer running out costs a hit point', timedOut.hits === 1 && timedOut.hp === 2, JSON.stringify(timedOut));
  await backToHub();
}

/* ================================================================== GAME 4 */
async function testTraffic() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('traffic', diff);
    const d0 = await dbg();
    const wantRoutes = diff === 'easy' ? 2 : 3;
    check(`traffic/${diff}: ${wantRoutes} routes offered`, d0.totals.length === wantRoutes, JSON.stringify(d0));
    check(`traffic/${diff}: exactly one route beats the deadline`,
      d0.onTime.filter(Boolean).length === 1, JSON.stringify(d0));
    check(`traffic/${diff}: totals within the spec cap`,
      Math.max(...d0.totals) <= (diff === 'easy' ? 20 : 60), JSON.stringify(d0.totals));
    if (diff === 'hard') {
      check('traffic/hard: uses half minutes', d0.totals.some(t => Math.abs(t % 1 - 0.5) < 1e-9), JSON.stringify(d0.totals));
      await shot('traffic');
    }
    const good = d0.onTime.indexOf(true);
    await tapF('r' + good);
    const d1 = await dbg();
    check(`traffic/${diff}: picking a route asks for its total`, d1.phase === 'total' && d1.options.length === 4);
    const oi = d1.options.indexOf(d0.totals[good]);
    check(`traffic/${diff}: the true total is among the choices`, oi >= 0, JSON.stringify(d1.options));
    await tapF('t' + oi);
    const m = await modalOf();
    check(`traffic/${diff}: right route + right total = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    check(`traffic/${diff}: tries saved`, (await stored()).games.traffic.bestTries === 1);
    await backToHub();
  }
  /* deliberate errors: a wrong total, then a correct total on a too-slow route */
  await openGame('traffic', 'medium');
  const d0 = await dbg();
  const late = d0.onTime.indexOf(false);
  await tapF('r' + late);
  const d1 = await dbg();
  const wrongOpt = d1.options.findIndex(o => o !== d0.totals[late]);
  await tapF('t' + wrongOpt);
  const d2 = await dbg();
  check('traffic: a wrong total keeps you on the same route', d2.phase === 'total' && d2.tries === 1, JSON.stringify(d2));
  const rightOpt = d2.options.indexOf(d0.totals[late]);
  await tapF('t' + rightOpt);
  const d3 = await dbg();
  check('traffic: right total on a late route sends you back to the map',
    d3.phase === 'choose' && d3.tries === 2, JSON.stringify(d3));
  const good = d0.onTime.indexOf(true);
  await tapF('r' + good);
  const d4 = await dbg();
  await tapF('t' + d4.options.indexOf(d0.totals[good]));
  const m2 = await modalOf();
  check('traffic: three tries scores one star', m2 && m2.kind === 'result' && m2.stars === 1, JSON.stringify(m2));
  await backToHub();
}

const SUITE = { seals: testSeals, trapeze: testTrapeze, magician: testMagician, traffic: testTraffic };
for (const [name, fn] of Object.entries(SUITE)) {
  if (ONLY && ONLY !== name) continue;
  try { await fn(); }
  catch (e) { check(name + ': threw', false, e.message); }
}

/* --------------------------------------------------------------- wrap up */
if (!ONLY) {
  const before = await state();
  await page.reload({ waitUntil: 'load' });
  await frame();
  const after = await state();
  check('progress survives a full reload', JSON.stringify(before.games) === JSON.stringify(after.games));
}
check('no console errors or page exceptions', errors.length === 0, errors.slice(0, 4).join(' | '));

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
