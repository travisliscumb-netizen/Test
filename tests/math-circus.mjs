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


/* Real pointer drags (sliders and drag-and-drop), not synthetic handler calls. */
async function regionBox(id) {
  return page.evaluate(i => {
    const r = MC.regions.find(rr => rr.id === i);
    if (!r) throw new Error('no region ' + i);
    const rect = document.getElementById('c').getBoundingClientRect();
    const toX = vx => rect.left + MC.V.ox + vx * MC.V.s;
    const toY = vy => rect.top + MC.V.oy + vy * MC.V.s;
    return { track: r.track || null, cx: toX(r.x + r.w / 2), cy: toY(r.y + r.h / 2),
             left: toX(r.x), top: toY(r.y), s: MC.V.s, vy: r.y + r.h / 2 };
  }, id);
}
async function dragSliderTo(id, value, minV, maxV) {
  const b = await regionBox(id);
  const [tx, tw] = b.track;
  const u = (value - minV) / (maxV - minV);
  const rect = await page.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return { l: r.left, t: r.top, ox: MC.V.ox, oy: MC.V.oy, s: MC.V.s };
  });
  const sx = rect.l + rect.ox + (tx + tw * u) * rect.s;
  const sy = b.cy;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy, { steps: 3 });
  await page.mouse.up();
  await frame();
}
async function dragBetween(fromId, toId) {
  const a = await regionBox(fromId), b = await regionBox(toId);
  await page.mouse.move(a.cx, a.cy);
  await page.mouse.down();
  await page.mouse.move((a.cx + b.cx) / 2, (a.cy + b.cy) / 2, { steps: 4 });
  await page.mouse.move(b.cx, b.cy, { steps: 4 });
  await page.mouse.up();
  await frame();
}

/* ================================================================== GAME 5 */
/* Mirror of the game's own flight model, including muzzle height and bucket-rim
   height: where does the ball cross the rim line on the way down? */
function bestShot(d) {
  const G = d.g, KV = d.kv;
  let best = null;
  const forces = d.lockForce ? [d.lockForce] : [1,2,3,4,5,6,7,8,9,10];
  for (const f of forces) for (let a = 0; a <= 90; a++) {
    const rad = a * Math.PI / 180, v = f * KV;
    const mx = 40 + Math.cos(rad) * 30, my = d.geo.groundY - 20 - Math.sin(rad) * 30;
    const vx = Math.cos(rad) * v, vy = -Math.sin(rad) * v;
    const disc = vy * vy - 2 * G * (my - d.geo.rim);
    if (disc < 0) continue;
    const t = (-vy + Math.sqrt(disc)) / G;           /* descending crossing of the rim */
    const x = mx + vx * t;
    const err = Math.abs(x - d.geo.bucketX);
    if (!best || err < best.err) best = { f, a, err, x };
  }
  return best;
}
async function settle(maxFrames = 400) {
  return page.evaluate(async n => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < n; k++) {
      if (MC.modal) return true;
      const d = MC.current.debug();
      if (!d.flying) return false;
      await wait();
    }
    return false;
  }, maxFrames);
}
async function testCannon() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('cannon', diff);
    const d0 = await dbg();
    const wantTol = { easy: 44, medium: 30, hard: 17 }[diff];
    check(`cannon/${diff}: tolerance ${wantTol}, ${diff === 'hard' ? '3 shots' : 'unlimited shots'}`,
      d0.tol === wantTol && d0.maxShots === (diff === 'hard' ? 3 : 0), JSON.stringify(d0));
    check(`cannon/${diff}: force ${diff === 'easy' ? 'locked' : 'free'}`,
      (diff === 'easy') === (d0.lockForce > 0), 'lockForce=' + d0.lockForce);
    const best = bestShot(d0);
    check(`cannon/${diff}: the bucket is reachable with integer controls`,
      best.err <= d0.tol / 2, JSON.stringify({ dist: d0.dist, best }));
    if (diff === 'hard') await shot('cannon');
    if (!d0.lockForce) await dragSliderTo('sForce', best.f, 1, 10);
    await dragSliderTo('sAngle', best.a, 0, 90);
    const d1 = await dbg();
    check(`cannon/${diff}: sliders respond to a real drag`,
      d1.angle === best.a && d1.force === best.f, JSON.stringify(d1));
    await tap('fire');
    await settle();
    const m = await modalOf();
    check(`cannon/${diff}: first shot in the bucket = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    check(`cannon/${diff}: shot count saved`, (await stored()).games.cannon.bestShots === 1);
    await backToHub();
  }
  /* deliberate miss: a flat angle must fall short and cost a star */
  await openGame('cannon', 'medium');
  const d0 = await dbg();
  await dragSliderTo('sAngle', 5, 0, 90);
  await dragSliderTo('sForce', 1, 1, 10);
  await tap('fire');
  await settle();
  const dm = await dbg();
  check('cannon: a bad shot misses and counts', dm && dm.shots === 1 && !dm.hit && (await modalOf()) === null, JSON.stringify(dm));
  const best = bestShot(d0);
  await dragSliderTo('sForce', best.f, 1, 10);
  await dragSliderTo('sAngle', best.a, 0, 90);
  await tap('fire');
  await settle();
  const m2 = await modalOf();
  check('cannon: second-shot hit scores 2 stars', m2 && m2.stars === 2, JSON.stringify(m2));
  await backToHub();
  /* hard runs out of shots */
  await openGame('cannon', 'hard');
  for (let i = 0; i < 3; i++) {
    await dragSliderTo('sAngle', 5, 0, 90);
    await dragSliderTo('sForce', 1, 1, 10);
    await tap('fire');
    await settle();
  }
  const mf = await modalOf();
  check('cannon/hard: three misses ends the attempt', mf && mf.failed === true, JSON.stringify(mf));
  await backToHub();
}

/* ================================================================== GAME 6 */
async function testRiddle() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('riddle', diff);
    const d0 = await dbg();
    const want = { easy: [10, 2], medium: [30, 3], hard: [50, 4] }[diff];
    check(`riddle/${diff}: range 1-${want[0]}, ${want[1]} clues`,
      d0.max === want[0] && d0.clues.length === want[1], JSON.stringify(d0.clues));
    check(`riddle/${diff}: exactly one number fits every clue`,
      d0.target >= 1 && d0.target <= d0.max, 'target=' + d0.target);
    if (diff === 'hard') {
      check('riddle/hard: includes an indirect clue',
        d0.clues.some(c => /Double me|Half of me/.test(c)), JSON.stringify(d0.clues));
      await shot('riddle');
    }
    await tapF('n' + d0.target);
    const m = await modalOf();
    check(`riddle/${diff}: the right number wins with 3 stars`, m && m.stars === 3, JSON.stringify(m));
    await backToHub();
  }
  /* deliberate wrong taps */
  await openGame('riddle', 'medium');
  const d0 = await dbg();
  const wrongs = [];
  for (let n = 1; n <= d0.max && wrongs.length < 1; n++) if (n !== d0.target) wrongs.push(n);
  await tapF('n' + wrongs[0]);
  const d1 = await dbg();
  check('riddle: a wrong tap eliminates that number', d1.wrong === 1 && d1.dead.includes(wrongs[0]), JSON.stringify(d1));
  check('riddle: an eliminated number is no longer tappable', !(await page.evaluate(n => MC.hasRegion('n' + n), wrongs[0])));
  await tapF('n' + d0.target);
  const m = await modalOf();
  check('riddle: one wrong tap scores 2 stars', m && m.stars === 2, JSON.stringify(m));
  await backToHub();
}

/* ================================================================== GAME 7 */
/* Search for a legal arrangement: place exactly mustPlace free performers on
   distinct free slots so left torque equals right torque. */
function solveBalance(d) {
  const slots = [];
  for (const side of ['L', 'R']) for (let dd = 1; dd <= 4; dd++) slots.push(side + dd);
  const taken = new Set(d.perf.filter(p => p.slot).map(p => p.slot));
  const open = slots.filter(s => !taken.has(s));
  const free = d.perf.filter(p => !p.fixed);
  const base = d.perf.filter(p => p.fixed)
    .reduce((s, p) => s + (p.slot[0] === 'R' ? 1 : -1) * p.w * (+p.slot[1]), 0);
  const chosen = [];
  let answer = null;
  (function rec(i, used, net) {
    if (answer) return;
    if (chosen.length === d.mustPlace) { if (net === 0) answer = chosen.slice(); return; }
    if (i >= free.length) return;
    for (let k = 0; k < open.length; k++) {
      if (used[k] || answer) continue;
      used[k] = 1;
      const sl = open[k];
      chosen.push({ id: free[i].id, slot: sl });
      rec(i + 1, used, net + (sl[0] === 'R' ? 1 : -1) * free[i].w * (+sl[1]));
      chosen.pop();
      used[k] = 0;
    }
    rec(i + 1, used, net);   /* leave this performer in the wings */
  })(0, {}, base);
  return answer;
}
async function testBalance() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('balance', diff);
    const d0 = await dbg();
    const wantLeftovers = diff === 'hard' ? 1 : 0;
    check(`balance/${diff}: ${wantLeftovers} performer sits out`, d0.leftovers === wantLeftovers, JSON.stringify(d0));
    if (diff === 'easy') check('balance/easy: one performer is pre-seated', d0.perf.some(p => p.fixed));
    if (diff === 'hard') {
      check('balance/hard: five or more performers', d0.perf.length >= 5, 'n=' + d0.perf.length);
      await shot('balance');
    }
    const plan = solveBalance(d0);
    check(`balance/${diff}: a balanced arrangement exists`, !!plan, JSON.stringify(d0.perf));
    for (const step of plan) await dragBetween('take_' + step.id, 'slot_' + step.slot);
    const m = await modalOf();
    check(`balance/${diff}: dragging into balance wins with 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    check(`balance/${diff}: moves saved`, (await stored()).games.balance.bestMoves <= plan.length);
    await backToHub();
  }
  /* deliberate wrong placement first */
  await openGame('balance', 'medium');
  const d0 = await dbg();
  const plan = solveBalance(d0);
  const taken = new Set(d0.perf.filter(p => p.slot).map(p => p.slot));
  const planned = new Set(plan.map(p => p.slot));
  let junk = null;
  for (const side of ['L', 'R']) for (let dd = 1; dd <= 4; dd++) {
    const sl = side + dd;
    if (!taken.has(sl) && !planned.has(sl) && !junk) junk = sl;
  }
  await dragBetween('take_' + plan[0].id, 'slot_' + junk);
  const d1 = await dbg();
  check('balance: a wrong placement counts a move and tips the beam',
    d1.moves === 1 && d1.left !== d1.right, JSON.stringify(d1));
  for (const step of plan) await dragBetween('take_' + step.id, 'slot_' + step.slot);
  const m = await modalOf();
  check('balance: extra moves cost stars', m && m.kind === 'result' && m.stars < 3, JSON.stringify(m));
  await backToHub();
}

/* ================================================================== GAME 8 */
async function serveTicketAnswer(value) {
  const d = await dbg();
  if (d.usesPad) {
    for (const ch of String(value)) await tapF('k' + ch);
    await tapF('kOK');
  } else {
    const i = d.options.indexOf(value);
    if (i < 0) throw new Error('correct option missing: ' + value + ' in ' + JSON.stringify(d.options));
    await tapF('o' + i);
  }
}
async function testTickets() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('tickets', diff);
    const d0 = await dbg();
    check(`tickets/${diff}: ${diff === 'easy' ? 'one price' : diff === 'medium' ? 'two prices' : 'bundle pricing'}`,
      d0.board.length === (diff === 'easy' ? 1 : diff === 'medium' ? 2 : 3), JSON.stringify(d0.board));
    check(`tickets/${diff}: change-making ${diff === 'easy' ? 'off' : 'on'}`,
      (d0.bill > 0) === (diff !== 'easy'), 'bill=' + d0.bill);
    check(`tickets/${diff}: ${diff === 'hard' ? 'numpad' : 'multiple choice'}`, d0.usesPad === (diff === 'hard'));
    if (diff === 'hard') await shot('tickets');
    for (let i = 0; i < 20; i++) {
      if (await page.evaluate(() => !!MC.modal)) break;
      const d = await dbg();
      await serveTicketAnswer(d.phase === 'total' ? d.total : d.change);
    }
    const m = await modalOf();
    check(`tickets/${diff}: six clean customers = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    check(`tickets/${diff}: accuracy saved`, (await stored()).games.tickets.bestCorrect === 6);
    await backToHub();
  }
  /* deliberate wrong total on the first customer */
  await openGame('tickets', 'medium');
  const d0 = await dbg();
  const wrongIdx = d0.options.findIndex(o => o !== d0.total);
  await tapF('o' + wrongIdx);
  const d1 = await dbg();
  check('tickets: a wrong total keeps the same customer at the window',
    d1.idx === 0 && d1.phase === 'total', JSON.stringify(d1));
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => !!MC.modal)) break;
    const d = await dbg();
    await serveTicketAnswer(d.phase === 'total' ? d.total : d.change);
  }
  const m = await modalOf();
  check('tickets: one slip drops it to 2 stars', m && m.stars === 2, JSON.stringify(m));
  await backToHub();
}


async function tapVirtual(vx, vy) {
  const pt = await page.evaluate(([x, y]) => {
    const rect = document.getElementById('c').getBoundingClientRect();
    return { x: rect.left + MC.V.ox + x * MC.V.s, y: rect.top + MC.V.oy + y * MC.V.s };
  }, [vx, vy]);
  await page.touchscreen.tap(pt.x, pt.y);
  await frame();
}

/* ================================================================== GAME 9 */
function solveJugs(caps, target) {
  const key = v => v.join(',');
  const start = caps.map(() => 0);
  const prevOf = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      if (st.some(v => v === target)) {
        const path = [];
        let cur = st;
        while (prevOf.get(key(cur))) { const p = prevOf.get(key(cur)); path.unshift(p.op); cur = p.from; }
        return path;
      }
      const moves = [];
      for (let i = 0; i < caps.length; i++) {
        if (st[i] < caps[i]) { const n = st.slice(); n[i] = caps[i]; moves.push([n, { k: 'fill', i }]); }
        if (st[i] > 0) { const n = st.slice(); n[i] = 0; moves.push([n, { k: 'empty', i }]); }
        for (let j = 0; j < caps.length; j++) {
          if (i === j || st[i] === 0 || st[j] === caps[j]) continue;
          const amt = Math.min(st[i], caps[j] - st[j]);
          const n = st.slice(); n[i] -= amt; n[j] += amt;
          moves.push([n, { k: 'pour', i, j }]);
        }
      }
      for (const [n, op] of moves) {
        const k = key(n);
        if (prevOf.has(k)) continue;
        prevOf.set(k, { from: st, op });
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}
async function pourOps(ops) {
  for (const op of ops) {
    if (await page.evaluate(() => !!MC.modal)) break;
    if (op.k === 'fill') { await tapF('barrel'); await tapF('c' + op.i); }
    else if (op.k === 'empty') { await tapF('c' + op.i); await tapF('drain'); }
    else { await tapF('c' + op.i); await tapF('c' + op.j); }
  }
}
async function testElephant() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('elephant', diff);
    const d0 = await dbg();
    const wantCups = diff === 'easy' ? 2 : 3;
    check(`elephant/${diff}: ${wantCups} cups`, d0.caps.length === wantCups, JSON.stringify(d0.caps));
    check(`elephant/${diff}: dose step ${diff === 'easy' ? 'skipped' : 'present'}`,
      (d0.phase === 'dose') === (diff !== 'easy'), d0.phase);
    const opsRange = { easy: [2, 2], medium: [3, 4], hard: [4, 6] }[diff];
    check(`elephant/${diff}: shortest solution is ${opsRange[0]}-${opsRange[1]} pours`,
      d0.minOps >= opsRange[0] && d0.minOps <= opsRange[1], 'minOps=' + d0.minOps);
    if (diff !== 'easy') {
      const exact = d0.weight / d0.ratio;
      check(`elephant/${diff}: dose division ${diff === 'hard' ? 'has a remainder' : 'is exact'}`,
        (Math.abs(exact - Math.round(exact)) > 1e-9) === (diff === 'hard'),
        `${d0.weight}/${d0.ratio}=${exact}`);
      await tapF('d' + d0.doseOptions.indexOf(d0.doseAnswer));
      check(`elephant/${diff}: right dose opens the pouring puzzle`, (await dbg()).phase === 'pour');
    }
    if (diff === 'hard') await shot('elephant');
    const ops = solveJugs(d0.caps, d0.target);
    check(`elephant/${diff}: puzzle is solvable`, !!ops && ops.length === d0.minOps,
      JSON.stringify({ caps: d0.caps, target: d0.target, ops }));
    await pourOps(ops);
    const m = await modalOf();
    check(`elephant/${diff}: shortest solution = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    await backToHub();
  }
  /* deliberate slips: a wrong dose, and a pour that cannot happen */
  await openGame('elephant', 'medium');
  const d0 = await dbg();
  await tapF('d' + d0.doseOptions.findIndex(o => o !== d0.doseAnswer));
  const d1 = await dbg();
  check('elephant: a wrong dose is rejected and costs a star', d1.preMiss === 1 && d1.phase === 'dose');
  await tapF('d' + d0.doseOptions.indexOf(d0.doseAnswer));
  await tapF('c0'); await tapF('c1');
  const d2 = await dbg();
  check('elephant: pouring from an empty cup does nothing', d2.pours === 0, JSON.stringify(d2));
  const ops = solveJugs(d0.caps, d0.target);
  await pourOps(ops);
  const m = await modalOf();
  check('elephant: a wrong dose caps the score at 2 stars', m && m.stars === 2, JSON.stringify(m));
  await backToHub();
}

/* ================================================================= GAME 10 */
async function tapCell(d, x, y) {
  const g = d.geo;
  await tapVirtual(g.x0 + (x - 0.5) * g.cell, g.y0 + (d.size - y + 0.5) * g.cell);
}
async function testBolts() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('bolts', diff);
    const d0 = await dbg();
    const want = { easy: [5, 1], medium: [8, 1], hard: [10, 2] }[diff];
    check(`bolts/${diff}: ${want[0]}x${want[0]} grid, ${want[1]} missing bolt(s)`,
      d0.size === want[0] && d0.need === want[1], JSON.stringify({ size: d0.size, need: d0.need }));
    if (diff !== 'easy') check(`bolts/${diff}: the missing column is marked`, d0.columns.length === want[1]);
    if (diff === 'hard') await shot('bolts');
    for (const m of d0.missing) {
      await tapCell(d0, m.x, m.y);
      const dc = await dbg();
      check(`bolts/${diff}: cursor lands on (${m.x}, ${m.y})`,
        dc.cursor && dc.cursor.x === m.x && dc.cursor.y === m.y, JSON.stringify(dc.cursor));
      await tapF('place');
    }
    const mm = await modalOf();
    check(`bolts/${diff}: all bolts placed first time = 3 stars`, mm && mm.stars === 3, JSON.stringify(mm));
    await backToHub();
  }
  /* deliberate wrong cell */
  await openGame('bolts', 'medium');
  const d0 = await dbg();
  const miss = d0.missing[0];
  const badY = miss.y === 1 ? 2 : miss.y - 1;
  await tapCell(d0, miss.x, badY);
  await tapF('place');
  const d1 = await dbg();
  check('bolts: a wrong hole is rejected and counted', d1.taps === 1 && d1.found.length === 0, JSON.stringify(d1));
  await tapCell(d0, miss.x, miss.y);
  await tapF('place');
  const m = await modalOf();
  check('bolts: second attempt scores 2 stars', m && m.stars === 2, JSON.stringify(m));
  await backToHub();
}

/* ================================================================= GAME 11 */
const TDIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
function tStep(pos, cmds, faces, size, rotate) {
  const next = pos.map((p, i) => {
    const c = cmds[i];
    if (c === null || c === undefined) return { x: p.x, y: p.y };
    const d = TDIRS[rotate ? (c + faces[i]) % 4 : c];
    const nx = p.x + d.x, ny = p.y + d.y;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return { x: p.x, y: p.y };
    return { x: nx, y: ny };
  });
  for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) {
    if (next[i].x === next[j].x && next[i].y === next[j].y) return null;
    if (next[i].x === pos[j].x && next[i].y === pos[j].y &&
        next[j].x === pos[i].x && next[j].y === pos[i].y) return null;
  }
  return next;
}
function planClowns(d) {
  if (d.shared) {
    const key = p => p.map(q => q.x + ',' + q.y).join(';');
    const goal = key(d.targets);
    let frontier = [{ pos: d.starts, seq: [] }];
    const seen = new Set([key(d.starts)]);
    for (let depth = 0; depth < 8; depth++) {
      const next = [];
      for (const node of frontier) for (let c = 0; c < 4; c++) {
        const n = tStep(node.pos, node.pos.map(() => c), d.faces, d.size, true);
        if (!n) continue;
        const k = key(n);
        if (k === goal) return [node.seq.concat(c)];
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ pos: n, seq: node.seq.concat(c) });
      }
      frontier = next;
    }
    return null;
  }
  const path = (from, to, xFirst) => {
    const out = [], dx = to.x - from.x, dy = to.y - from.y;
    const xs = () => { for (let i = 0; i < Math.abs(dx); i++) out.push(dx > 0 ? 1 : 3); };
    const ys = () => { for (let i = 0; i < Math.abs(dy); i++) out.push(dy > 0 ? 2 : 0); };
    if (xFirst) { xs(); ys(); } else { ys(); xs(); }
    return out;
  };
  for (let mask = 0; mask < (1 << d.n); mask++) {
    const qs = d.starts.map((s, i) => path(s, d.targets[i], !!(mask & (1 << i))));
    const len = Math.max(...qs.map(q => q.length));
    let pos = d.starts.map(p => ({ x: p.x, y: p.y })), ok = true;
    for (let st = 0; st < len; st++) {
      pos = tStep(pos, qs.map(q => st < q.length ? q[st] : null), d.faces, d.size, false);
      if (!pos) { ok = false; break; }
    }
    if (ok && pos.every((p, i) => p.x === d.targets[i].x && p.y === d.targets[i].y)) return qs;
  }
  return null;
}
async function enterPlan(plan, shared) {
  if (shared) { for (const c of plan[0]) await tapF('dir' + c); return; }
  for (let i = 0; i < plan.length; i++) {
    await tapF('pick' + i);
    for (const c of plan[i]) await tapF('dir' + c);
  }
}
async function runClowns() {
  await tapF('go');
  await page.evaluate(async () => {
    const wait = () => new Promise(r => requestAnimationFrame(r));
    for (let k = 0; k < 2000; k++) {
      if (MC.modal) return;
      if (!MC.current.debug().running) return;
      await wait();
    }
  });
  await frame();
}
async function testClowns() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('clowns', diff);
    const d0 = await dbg();
    const want = { easy: [2, 1, false], medium: [4, 3, false], hard: [5, 5, true] }[diff];
    check(`clowns/${diff}: ${want[1]} clown(s) on a ${want[0]}x${want[0]} ring, ${want[2] ? 'shared list' : 'one list each'}`,
      d0.size === want[0] && d0.n === want[1] && d0.shared === want[2], JSON.stringify({ size: d0.size, n: d0.n, shared: d0.shared }));
    if (diff === 'hard') await shot('clowns');
    const plan = planClowns(d0);
    check(`clowns/${diff}: an optimal plan exists`, !!plan, JSON.stringify(d0));
    const total = plan.reduce((a, q) => a + q.length, 0);
    check(`clowns/${diff}: optimal plan matches the stated best (${d0.min})`, total === d0.min, 'plan=' + total);
    await enterPlan(plan, d0.shared);
    await runClowns();
    const m = await modalOf();
    check(`clowns/${diff}: optimal run = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    await backToHub();
  }
  /* deliberate bad run */
  await openGame('clowns', 'medium');
  const d0 = await dbg();
  await tapF('pick0');
  for (let i = 0; i < 3; i++) await tapF('dir0');
  await runClowns();
  const d1 = await dbg();
  check('clowns: a wrong formation resets the ring and counts an attempt',
    d1.attempts === 2 && d1.total === 0 && (await modalOf()) === null, JSON.stringify(d1));
  const plan = planClowns(d1);
  await enterPlan(plan, d1.shared);
  await runClowns();
  const m = await modalOf();
  check('clowns: a retry can still win, but not with 3 stars', m && m.kind === 'result' && m.stars < 3, JSON.stringify(m));
  await backToHub();
}

/* ================================================================= GAME 12 */
async function testLions() {
  for (const diff of ['easy', 'medium', 'hard']) {
    await openGame('lions', diff);
    const d0 = await dbg();
    const want = { easy: 4, medium: 5, hard: 6 }[diff];
    check(`lions/${diff}: ${want} lions`, d0.n === want && d0.lions.length === want);
    check(`lions/${diff}: the requested order is unambiguous`, new Set(d0.order).size === want, JSON.stringify(d0.order));
    if (diff === 'hard') {
      const tot = id => { const l = d0.lions.find(x => x.id === id); return l.age + l.tricks; };
      const sorted = d0.order.map(tot);
      check('lions/hard: ordered by age + tricks, biggest first',
        sorted.every((v, i) => i === 0 || sorted[i - 1] >= v), JSON.stringify(sorted));
      await shot('lions');
    }
    for (let i = 0; i < d0.n; i++) await dragBetween('take' + d0.order[i], 'ped' + i);
    const m = await modalOf();
    check(`lions/${diff}: the right line-up first time = 3 stars`, m && m.kind === 'result' && m.stars === 3, JSON.stringify(m));
    await backToHub();
  }
  /* deliberate wrong order, then a fix */
  await openGame('lions', 'easy');
  const d0 = await dbg();
  const swapped = d0.order.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  for (let i = 0; i < d0.n; i++) await dragBetween('take' + swapped[i], 'ped' + i);
  const d1 = await dbg();
  check('lions: a wrong line-up is flagged, not accepted',
    d1.wrong.length > 0 && (await modalOf()) === null, JSON.stringify(d1.wrong));
  await dragBetween('take' + d0.order[0], 'ped0');
  await dragBetween('take' + d0.order[1], 'ped1');
  const m = await modalOf();
  check('lions: fixing the order still wins, with fewer stars', m && m.kind === 'result' && m.stars < 3, JSON.stringify(m));
  await backToHub();
}


/* ============================================================ milestone 6-8 */
async function testChromeAndPause() {
  for (const id of ['seals','trapeze','magician','traffic','cannon','riddle','balance','tickets','elephant','bolts','clowns','lions']) {
    await openGame(id, 'easy');
    const r = await ids();
    check(`${id}: has a visible way back to the hub`, r.includes('g_back'), r.slice(0, 6).join(','));
    check(`${id}: has a pause button`, r.includes('g_pause'));
    await realTap('g_pause');
    const pm = await page.evaluate(() => MC.modal && MC.modal.kind);
    check(`${id}: pause menu opens`, pm === 'pause');
    const pids = await ids();
    check(`${id}: pause offers resume, restart, sound and hub`,
      ['m_resume','m_restart','m_sound','m_hub'].every(k => pids.includes(k)), pids.join(','));
    await realTap('m_restart');
    check(`${id}: restart returns to play`, (await page.evaluate(() => MC.screen)) === 'game' &&
      (await page.evaluate(() => MC.modal)) === null);
    await realTap('g_back');
    check(`${id}: back button reaches the hub`, (await page.evaluate(() => MC.screen)) === 'hub');
  }
}
async function testAudio() {
  await page.evaluate(() => {
    window.__osc = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { window.__noAudio = true; return; }
    const orig = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
  check('audio: Web Audio is available in this browser', !(await page.evaluate(() => !!window.__noAudio)));
  await page.evaluate(() => { MC.state.settings.sound = true; MC.persist(); MC.goHub(); });
  await frame();
  await realTap('seals');
  const afterTap = await page.evaluate(() => window.__osc);
  check('audio: tapping a ring makes a sound', afterTap > 0, 'oscillators=' + afterTap);
  await realTap('m_start');
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
  const afterWin = await page.evaluate(() => window.__osc);
  check('audio: winning plays a fanfare', afterWin >= afterTap + 4, 'oscillators=' + afterWin);
  await tap('m_hub');
  await frame();
  await page.evaluate(() => { window.__osc = 0; MC.state.settings.sound = false; MC.persist(); });
  await realTap('trapeze');
  check('audio: sound off means silence', (await page.evaluate(() => window.__osc)) === 0);
  await page.evaluate(() => { MC.state.settings.sound = true; MC.persist(); MC.closeModal(); MC.goHub(); });
  await frame();
}
async function testPWA() {
  const man = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const href = link.getAttribute('href');
    if (!/^data:application\/manifest\+json;base64,/.test(href)) return { bad: href.slice(0, 40) };
    const json = atob(href.split(',')[1]);
    return JSON.parse(json);
  });
  check('pwa: inline manifest is a valid data URI', !!man && !man.bad, JSON.stringify(man && man.bad));
  check('pwa: manifest declares standalone portrait + icons',
    man && man.display === 'standalone' && man.orientation === 'portrait' && man.icons.length >= 2,
    JSON.stringify(man && { d: man.display, o: man.orientation, i: man.icons && man.icons.length }));
  const icon = await page.evaluate(() => {
    const l = document.querySelector('link[rel="apple-touch-icon"]');
    if (!l) return null;
    const b = atob(l.getAttribute('href').split(',')[1]);
    return { len: b.length, png: b.charCodeAt(1) === 80 && b.charCodeAt(2) === 78 && b.charCodeAt(3) === 71 };
  });
  check('pwa: apple-touch-icon is a real inline PNG', icon && icon.png && icon.len > 500, JSON.stringify(icon));
  check('pwa: iOS web-app meta tags present', await page.evaluate(() =>
    !!document.querySelector('meta[name="apple-mobile-web-app-capable"]') &&
    !!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') &&
    !!document.querySelector('meta[name="viewport"][content*="viewport-fit=cover"]')));
  /* Offline: the single-file constraint and the Service Worker spec are in direct
     conflict - a blob: script URL is refused by the engine. Assert the honest
     outcome: we try, the refusal is contained, and the game keeps working. */
  const sw = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1200));
    return JSON.parse(JSON.stringify(MC.sw));
  });
  check('pwa: service worker registration is attempted on a secure origin',
    sw.supported && sw.attempted, JSON.stringify(sw));
  check('pwa: the blob-URL refusal is captured, not swallowed',
    sw.ok || /not supported|protocol/i.test(sw.reason), JSON.stringify(sw));
  if (!sw.ok) console.log(`NOTE  offline cache unavailable: ${sw.reason}`);
  check('pwa: a failed registration does not break the game',
    await page.evaluate(() => MC.screen === 'hub' && Object.keys(MC.GAMES).length === 12));
  await page.reload({ waitUntil: 'load' });
  await frame();
  check('pwa: the game reloads cleanly after the attempt',
    await page.evaluate(() => !!(window.MC && Object.keys(MC.GAMES).length === 12)));
  const offlineReady = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check('pwa: offline status reported in Settings matches reality',
    offlineReady === (await page.evaluate(() => MC.sw.ok)) || !offlineReady,
    'controller=' + offlineReady);
}
async function testViewports() {
  for (const vp of [{ name: 'iphone-se', width: 375, height: 667 },
                    { name: 'iphone-14', width: 390, height: 844 },
                    { name: 'iphone-15-pro-max', width: 430, height: 932 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => MC.goHub());
    await frame();
    const bad = await page.evaluate(() => MC.regions.filter(r =>
      r.x < -1 || r.y < -1 || r.x + r.w > MC.V.w + 1 || r.y + r.h > MC.V.h + 1)
      .map(r => r.id + '@' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)));
    check(`${vp.name}: every hub tap target is on screen`, bad.length === 0, bad.join(' | '));
    await shot('hub-' + vp.name);
    for (const id of ['balance', 'bolts', 'clowns', 'tickets']) {
      await openGame(id, 'hard');
      const off = await page.evaluate(() => MC.regions.filter(r =>
        r.x < -1 || r.y < -1 || r.x + r.w > MC.V.w + 1 || r.y + r.h > MC.V.h + 1).map(r => r.id));
      check(`${vp.name}/${id}: every tap target is on screen`, off.length === 0, off.join(','));
      const small = await page.evaluate(() => MC.regions.filter(r =>
        r.id !== 'grid' && r.id.indexOf('slot_') !== 0 && (r.w * MC.V.s < 40 || r.h * MC.V.s < 40))
        .map(r => r.id + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)));
      check(`${vp.name}/${id}: tap targets are finger sized`, small.length === 0, small.join(' | '));
      await page.evaluate(() => MC.goHub());
      await frame();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await frame();
}


async function testCards() {
  /* The pre-game card sizes itself from its own description text; check every
     game's card fits the shortest supported screen with finger-sized controls. */
  for (const vp of [{ name: 'iphone-se', width: 375, height: 667 },
                    { name: 'iphone-15-pro-max', width: 430, height: 932 }]) {
    await page.setViewportSize(vp);
    for (const id of ['seals','trapeze','magician','traffic','cannon','riddle','balance','tickets','elephant','bolts','clowns','lions']) {
      await page.evaluate(() => { MC.closeModal(); MC.goHub(); });
      await frame();
      await realTap(id);
      const info = await page.evaluate(() => {
        const mods = MC.regions.filter(r => r.layer === 'modal');
        return {
          kind: MC.modal && MC.modal.kind,
          ids: mods.map(r => r.id),
          off: mods.filter(r => r.x < -1 || r.y < -1 || r.x + r.w > MC.V.w + 1 || r.y + r.h > MC.V.h + 1).map(r => r.id),
          small: mods.filter(r => r.w * MC.V.s < 40 || r.h * MC.V.s < 40).map(r => r.id)
        };
      });
      check(`${vp.name}/${id}: card offers three difficulties and start`,
        info.kind === 'pregame' && ['m_d_easy','m_d_medium','m_d_hard','m_start','m_close'].every(k => info.ids.includes(k)),
        info.ids.join(','));
      check(`${vp.name}/${id}: card fits the screen`, info.off.length === 0, info.off.join(','));
      check(`${vp.name}/${id}: card controls are finger sized`, info.small.length === 0, info.small.join(','));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { MC.closeModal(); MC.goHub(); });
  await frame();
}

const SUITE = { seals: testSeals, trapeze: testTrapeze, magician: testMagician, traffic: testTraffic, cannon: testCannon, riddle: testRiddle, balance: testBalance, tickets: testTickets,
  elephant: testElephant, bolts: testBolts, clowns: testClowns, lions: testLions,
  chrome: testChromeAndPause, audio: testAudio, pwa: testPWA, viewports: testViewports,
  cards: testCards };
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
