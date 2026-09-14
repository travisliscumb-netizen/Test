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

const SUITE = { seals: testSeals, trapeze: testTrapeze, magician: testMagician, traffic: testTraffic, cannon: testCannon, riddle: testRiddle, balance: testBalance, tickets: testTickets };
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
