// Barnyard Abduction — end-to-end verification in headless Chromium.
//
//   npm install && npm run verify
//
// Loads the real index.html with the real Three.js r128 (served from
// node_modules instead of the CDN), then drives it through the UI and the
// window.__BA hook. Simulation is stepped deterministically (fixed 60 Hz) so
// results do not depend on how fast the software renderer happens to be.
// Screenshots land in ../.shots/barnyard/ (git-ignored).
//
// What this proves: the code runs without errors, every system behaves as
// specified, and scout framing is correct at real device aspect ratios.
// What it cannot prove: real-device frame rate and touch feel. See README.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const page_url = 'file://' + path.join(root, 'index.html');
const threeFile = path.join(root, 'node_modules/three/build/three.min.js');
const shotDir = path.resolve(root, '../.shots/barnyard');
fs.mkdirSync(shotDir, { recursive: true });
if (!fs.existsSync(threeFile)) { console.error('Run `npm install` first (needs three@0.128.0).'); process.exit(2); }

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openPage(viewport = { width: 430, height: 860 }, ctx = null) {
  const context = ctx || await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED/.test(m.text())) errors.push('console: ' + m.text().slice(0, 400)); });
  await page.route(/three(\.min)?\.js$/, r => r.fulfill({ path: threeFile, contentType: 'application/javascript' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); // offline-safe; UI falls back to system rounded font
  await page.goto(page_url);
  await page.waitForFunction(() => window.__BA && document.getElementById('loading').classList.contains('gone'), null, { timeout: 90000 });
  return { page, errors, context };
}
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);

// In-page helpers, installed once per page.
const HELPERS = `
window.__T = {
  nearest(filter) {
    const B = __BA; let best = null, bd = 1e9;
    for (const a of B.ents.animals) { if (a.state === 'lifted' || a.state === 'falling' || (filter && !filter(a))) continue;
      const d = Math.hypot(a.x - B.ufo.pos.x, a.z - B.ufo.pos.z); if (d < bd) { bd = d; best = a; } }
    return best;
  },
  // fly over a matching animal, hold the beam until it is captured; returns frames used or -1
  abduct(filter) {
    const B = __BA, a = this.nearest(filter);
    if (!a) return -1;
    for (const o of B.ents.animals) if (o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 12) o.x += o.x > 0 ? -30 : 30; // keep the grab unambiguous
    B.fly(a.x, a.z); a.state = 'graze'; a.t = 99; a.speed = 0; a.want = 0; a.panic = 0;
    B.setInput({ beam: true, x: 0, z: 0 });
    const before = B.G.captured;
    for (let i = 0; i < 60 * 6; i++) { B.sim(1); if (B.G.captured > before || B.G.ended) { B.setInput({ beam: false }); B.sim(10); return i; } }
    B.setInput({ beam: false }); B.sim(5); return -1;
  },
};`;

try {
  /* ---------------------------------------------------------------- boot + UI flow */
  {
    const { page, errors, context } = await openPage();
    await page.addScriptTag({ content: HELPERS });
    check('boots with no page or console errors', errors.length === 0, errors.join(' | '));
    check('title screen shown after load', await visible(page, 'scrTitle'));
    const stats = await page.evaluate(() => ({ animals: __BA.ents.animals.length, colliders: __BA.MAP.colliders.length }));
    check('title attract mode has a live herd', stats.animals >= 30, `${stats.animals} animals`);
    await page.waitForTimeout(700); // let the loading veil finish fading
    await page.screenshot({ path: path.join(shotDir, '01-title.png') });

    await page.click('#scrTitle [data-act=levels]');
    check('PLAY opens mission list', await visible(page, 'scrLevels'));
    const lvls = await page.$$eval('.lvl', els => els.map(e => e.classList.contains('locked')));
    check('6 missions listed; only 1 + Free Flight unlocked on a fresh save', lvls.length === 6 && !lvls[0] && lvls[1] && lvls[4] && !lvls[5], JSON.stringify(lvls));
    await page.screenshot({ path: path.join(shotDir, '02-missions.png') });
    await page.click('.lvl >> nth=0');
    check('mission opens a briefing', await visible(page, 'scrBrief'));
    await page.click('[data-act=start]');
    const st = await page.evaluate(() => ({ mode: __BA.G.mode, hud: document.getElementById('hud').classList.contains('on'), farmer: __BA.ents.farmers[0].state }));
    check('GO starts Mission 1 with HUD on and the farmer asleep', st.mode === 'play' && st.hud && st.farmer === 'asleep', JSON.stringify(st));

    /* ---------------------------------------------------------- real pointer input */
    // floating stick: drag upward on the left half → saucer flies north (−z)
    const z0 = await page.evaluate(() => __BA.ufo.pos.z);
    await page.mouse.move(110, 620); await page.mouse.down(); await page.mouse.move(110, 540, { steps: 6 });
    await page.waitForTimeout(1500);
    const stickOn = await page.evaluate(() => document.getElementById('stick').classList.contains('on'));
    await page.mouse.up();
    const z1 = await page.evaluate(() => __BA.ufo.pos.z);
    check('floating stick appears under the thumb and flies the saucer north', stickOn && z1 < z0 - 2, `z ${z0.toFixed(1)} → ${z1.toFixed(1)}`);

    await page.evaluate(() => __BA.stop());
    const tut = await page.evaluate(() => { __BA.fly(__BA.G.flags.sx + 25, __BA.G.flags.sz); __BA.sim(5); return { tut: __BA.G.tut, hint: document.getElementById('hint').textContent }; });
    check('tutorial advances after flying and asks for an animal', tut.tut >= 1, JSON.stringify(tut));

    // BEAM through the actual button (pointer capture path), not the test hook
    const tgt = await page.evaluate(() => { const a = __T.nearest(); __BA.fly(a.x, a.z); a.state = 'graze'; a.t = 99; __BA.sim(3); return { kind: a.kind, cand: !!__BA.beam.cand, ready: document.getElementById('beamBtn').classList.contains('ready') }; });
    check('hovering over an animal telegraphs it (gold ring + pulsing BEAM button)', tgt.cand && tgt.ready, JSON.stringify(tgt));
    const bb = await page.$('#beamBtn'); const box = await bb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    const lift = await page.evaluate(() => { __BA.sim(30); return { target: __BA.beam.target && __BA.beam.target.kind, lifted: __BA.beam.target && __BA.beam.target.y > .5 }; });
    await page.evaluate(() => __BA.step(0));
    await page.screenshot({ path: path.join(shotDir, '03-beam-lift.png') });
    const cap = await page.evaluate(() => { for (let i = 0; i < 300 && !__BA.G.captured; i++) __BA.sim(1); return { captured: __BA.G.captured, score: __BA.G.score, prog: __BA.G.progress.any }; });
    await page.mouse.up();
    check('holding the BEAM button lifts the target', !!lift.target && lift.lifted, JSON.stringify(lift));
    check('capture scores species points and counts toward the goal', cap.captured === 1 && cap.score > 0 && cap.prog === 1, JSON.stringify(cap));

    // release mid-lift drops the animal
    const drop = await page.evaluate(() => {
      const a = __T.nearest(x => x.kind === 'cow' || x.kind === 'horse'); __BA.fly(a.x, a.z); a.state = 'graze'; a.t = 99;
      __BA.setInput({ beam: true }); __BA.sim(45); const mid = a.state; __BA.setInput({ beam: false }); __BA.sim(2); const after = a.state;
      __BA.sim(240); return { mid, after, alive: a.alive, landedY: +a.y.toFixed(2), state: a.state };
    });
    check('letting go mid-lift drops the animal; it lands dizzy and recovers', drop.mid === 'lifted' && drop.after === 'falling' && drop.alive && drop.landedY === 0 && drop.state !== 'falling', JSON.stringify(drop));

    // combo: two quick captures multiply
    const combo = await page.evaluate(() => { __BA.G.lastCap = -99; const s0 = __BA.G.score; __T.abduct(a => a.kind === 'chicken'); const s1 = __BA.G.score; __T.abduct(a => a.kind === 'chicken'); const s2 = __BA.G.score; return { first: s1 - s0, second: s2 - s1, combo: __BA.G.combo }; });
    check('quick successive captures build a combo multiplier', combo.combo === 2 && combo.first === 10 && combo.second === 20, JSON.stringify(combo));

    // finish mission 1
    const fin = await page.evaluate(() => { let guard = 0; while (!__BA.G.ended && guard++ < 20) __T.abduct(); __BA.sim(150); return { ended: __BA.G.ended, won: __BA.G.won, mode: __BA.G.mode }; });
    check('reaching the goal wins the mission and shows results', fin.won && fin.mode === 'result' && await visible(page, 'scrResult'), JSON.stringify(fin));
    await page.evaluate(() => __BA.step(0));
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(shotDir, '04-results.png') });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('barnyard-abduction.v2')));
    check('result is autosaved (stars + best score)', saved && saved.levels.L1 && saved.levels.L1.stars >= 1 && saved.levels.L1.best > 0, JSON.stringify(saved));
    await page.click('#scrResult [data-act=levels]');
    const lv2 = await page.$$eval('.lvl', els => els.map(e => e.classList.contains('locked')));
    check('winning Mission 1 unlocks Mission 2', !lv2[1], JSON.stringify(lv2));
    check('no errors during the full Mission 1 flow', errors.length === 0, errors.join(' | '));

    /* ---------------------------------------------------------------- farmer */
    const far = await page.evaluate(() => {
      __BA.startLevel(1); __BA.sim(5);
      const f = __BA.ents.farmers[0], log = [];
      __BA.fly(f.x + 22, f.z + 8);
      let st = f.state, throws = 0, prevT = 0, firstHitAt = -1, shields0 = __BA.G.shields, maxDecals = 0;
      for (let i = 0; i < 60 * 12; i++) {
        __BA.sim(1);
        if (f.state !== st) { log.push(st + '→' + f.state); st = f.state; }
        if (__BA.ents.tomatoes.length > prevT) throws++;
        prevT = __BA.ents.tomatoes.length;
        if (__BA.G.shields < shields0 && firstHitAt < 0) firstHitAt = throws;
        maxDecals = Math.max(maxDecals, __BA.ents.decals.length);
      }
      return { log: log.slice(0, 6), throws, firstHitAt, shields: __BA.G.shields, groundSplats: maxDecals };
    });
    check('farmer escalates patrol → suspicious → chase/wind-up', far.log[0] === 'patrol→suspicious' && far.log.some(s => s.endsWith('windup')), far.log.join(', '));
    check('farmer throws tomatoes; the first is a harmless warning shot', far.throws >= 2 && far.firstHitAt !== 1 && far.groundSplats >= 1, JSON.stringify(far));
    check('tomato hits cost shields', far.shields < 5, `shields ${far.shields}/5`);
    await page.evaluate(() => __BA.step(0));
    await page.screenshot({ path: path.join(shotDir, '05-farmer.png') });

    const knock = await page.evaluate(() => {
      __BA.startLevel(1); __BA.sim(5);
      const f = __BA.ents.farmers[0]; f.warned = true; f.alert = 1.2; f.state = 'chase'; f.cd = 0;
      for (let tries = 0; tries < 12; tries++) {
        const a = __T.nearest(x => x.kind === 'horse' || x.kind === 'cow'); if (!a) break;
        a.x = f.x + 20; a.z = f.z + 6; a.state = 'graze'; a.t = 99; __BA.fly(a.x, a.z);
        __BA.setInput({ beam: true });
        const sh = __BA.G.shields;
        for (let i = 0; i < 60 * 3; i++) { __BA.sim(1); if (__BA.G.shields < sh) { const s = a.state; __BA.setInput({ beam: false }); return { knocked: s, tries }; } if (!a.alive) break; }
        __BA.setInput({ beam: false }); __BA.sim(20); __BA.G.shields = 5;
      }
      return { knocked: null };
    });
    check('a tomato hit knocks the animal out of the beam', knock.knocked === 'falling', JSON.stringify(knock));

    const lose = await page.evaluate(() => { __BA.startLevel(1); __BA.sim(5); __BA.G.shields = 1; const f = __BA.ents.farmers[0]; f.warned = true; f.alert = 1.2; f.state = 'chase'; f.cd = 0; __BA.fly(f.x + 15, f.z + 5);
      for (let i = 0; i < 60 * 30 && !__BA.G.ended; i++) __BA.sim(1); __BA.sim(150); return { ended: __BA.G.ended, won: __BA.G.won, reason: __BA.G.reason, mode: __BA.G.mode }; });
    check('running out of shields fails the mission with a clear reason', lose.ended && !lose.won && lose.reason === 'Too many tomatoes!' && lose.mode === 'result', JSON.stringify(lose));

    const beamFarmer = await page.evaluate(() => {
      __BA.startLevel(1); __BA.sim(5);
      const f = __BA.ents.farmers[0];
      for (const a of __BA.ents.animals) if (Math.hypot(a.x - f.x, a.z - f.z) < 15) a.x += 60;
      __BA.fly(f.x, f.z); f.state = 'patrol'; f.route = [[f.x, f.z]]; f.wp = 0;
      __BA.setInput({ beam: true }); const s0 = __BA.G.score;
      let lifted = false; for (let i = 0; i < 60 * 4 && f.state !== 'gone'; i++) { __BA.sim(1); lifted = lifted || f.state === 'lifted'; }
      __BA.setInput({ beam: false });
      const gone = f.state === 'gone', pts = __BA.G.score - s0;
      __BA.sim(60 * (__BA.TUNE.farmer.awayTime + 1));
      return { lifted, gone, pts, back: f.state, visible: f.rig.root.visible };
    });
    check('the farmer can be beamed up for a bonus and walks back out unharmed', beamFarmer.lifted && beamFarmer.gone && beamFarmer.pts >= 150 && beamFarmer.back !== 'gone' && beamFarmer.visible, JSON.stringify(beamFarmer));

    const timeout = await page.evaluate(() => { __BA.startLevel(1); __BA.G.timeLeft = .5; __BA.sim(60); __BA.sim(130); return { reason: __BA.G.reason, won: __BA.G.won, mode: __BA.G.mode }; });
    check("timer running out fails with \"Time's up!\"", timeout.reason === "Time's up!" && !timeout.won && timeout.mode === 'result', JSON.stringify(timeout));

    /* ---------------------------------------------------------------- shopping list */
    const shop = await page.evaluate(() => {
      __BA.startLevel(2); __BA.sim(5); __BA.ents.farmers[0].x += 300;
      const s0 = __BA.G.score; __T.abduct(a => a.kind === 'pig'); const pig = { score: __BA.G.score - s0, progress: JSON.stringify(__BA.G.progress) };
      __T.abduct(a => a.kind === 'cow'); const cow = __BA.G.progress.cow;
      return { pig, cow };
    });
    check('Shopping List: off-list animals score but do not count; listed ones do', shop.pig.score > 0 && shop.pig.progress === '{}' && shop.cow === 1, JSON.stringify(shop));
    const stock = await page.evaluate(() => {
      __BA.ents.farmers[0].x += 300;
      let guard = 0; while (!__BA.G.ended && guard++ < 40) { const need = Object.entries(__BA.G.level.goal).find(([k, v]) => (__BA.G.progress[k] || 0) < v); if (!need) break; if (__T.abduct(a => a.kind === need[0]) < 0) __BA.sim(60 * 4); }
      return { won: __BA.G.won, progress: __BA.G.progress };
    });
    check('the barn restocks needed species so a list can always be finished', stock.won, JSON.stringify(stock));

    /* ---------------------------------------------------------------- world limits */
    const lim = await page.evaluate(() => {
      __BA.startLevel(5); __BA.sim(5);
      const M = __BA.MAP, b = M.colliders[1];
      __BA.fly(b.x, b.z); __BA.sim(2);
      const u = __BA.ufo.pos, insideBarn = Math.abs(u.x - b.x) < b.hw && Math.abs(u.z - b.z) < b.hd;
      __BA.setInput({ x: 1, z: 1 }); __BA.fly(150, 150); __BA.sim(240); __BA.setInput({ x: 0, z: 0 });
      const s = Math.pow(Math.pow(Math.abs(u.x) / 199, 4.5) + Math.pow(Math.abs(u.z) / 199, 4.5), 1 / 4.5);
      return { insideBarn, fenceScale: +s.toFixed(3) };
    });
    check('saucer cannot enter the barn footprint', !lim.insideBarn, JSON.stringify(lim));
    check('saucer is held inside the fence', lim.fenceScale <= 1.0, JSON.stringify(lim));

    const free = await page.evaluate(() => { __BA.startLevel(5); __BA.sim(5); for (let i = 0; i < 16; i++) __T.abduct(); return { farmers: __BA.ents.farmers.length, animals: __BA.ents.animals.length, captured: __BA.G.captured, ended: __BA.G.ended, timer: document.getElementById('timerTxt').textContent }; });
    check('Free Flight: no farmer, no clock, herd keeps topping up', free.farmers === 0 && !free.ended && free.captured === 16 && free.animals >= 24 && free.timer === '∞', JSON.stringify(free));

    /* ---------------------------------------------------------------- pause */
    await page.evaluate(() => __BA.go());
    await page.keyboard.press('KeyP');
    const paused = await page.evaluate(() => __BA.G.mode);
    const pv = await visible(page, 'scrPause');
    await page.keyboard.press('KeyP');
    const resumed = await page.evaluate(() => __BA.G.mode);
    check('P pauses (with menu) and resumes', paused === 'paused' && pv && resumed === 'play', `${paused} → ${resumed}`);

    /* ---------------------------------------------------------------- budget */
    const perf = await page.evaluate(() => { __BA.stop(); __BA.startLevel(3); __BA.step(60); const play = { calls: __BA.drawCalls(), tris: __BA.tris() }; __BA.setInput({ scout: true }); __BA.step(120); const scout = { calls: __BA.drawCalls(), tris: __BA.tris() }; __BA.setInput({ scout: false }); return { play, scout, animals: __BA.ents.animals.length }; });
    check('draw calls stay within an iPhone budget (< 400 even in scout with 40+ animals)', perf.play.calls < 400 && perf.scout.calls < 400, JSON.stringify(perf));
    check('no errors across the whole run', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  /* ---------------------------------------------------------------- scout framing */
  for (const [w, h, label] of [[390, 844, 'iPhone portrait'], [844, 390, 'iPhone landscape'], [430, 932, 'iPhone Pro Max portrait'], [932, 430, 'iPhone Pro Max landscape'], [820, 1180, 'iPad portrait'], [1180, 820, 'iPad landscape']]) {
    const { page, errors, context } = await openPage({ width: w, height: h });
    const r = await page.evaluate(() => { __BA.stop(); __BA.startLevel(0); __BA.setInput({ scout: true }); __BA.sim(180); return { ndc: __BA.fenceNdc(), ring: __BA.scene.children.some(o => o.isMesh && o.visible && o.material.color && o.renderOrder === 9) }; });
    check(`scout frames the whole fence with a ~5% margin — ${label} ${w}×${h}`, r.ndc <= 0.9005 && r.ndc >= 0.88 && r.ring && errors.length === 0, `max |NDC| ${r.ndc.toFixed(4)} (≤ 0.90 = 5% margin)`);
    if (w === 390 || w === 844) { await page.evaluate(() => __BA.step(0)); await page.screenshot({ path: path.join(shotDir, `06-scout-${w}x${h}.png`) }); }
    const back = await page.evaluate(() => { __BA.setInput({ scout: false }); __BA.sim(120); return __BA.fenceNdc(); });
    check(`releasing scout returns to the close gameplay camera — ${label}`, back > 1.5, `fence |NDC| ${back.toFixed(2)}`);
    if (w === 390 || w === 844) {
      await page.evaluate(() => { __BA.clearInput(); __BA.startLevel(1); __BA.sim(90); __BA.step(0); });
      await page.screenshot({ path: path.join(shotDir, `07-play-${w}x${h}.png`) });
    }
    await context.close();
  }

  /* ---------------------------------------------------------------- corrupt save */
  {
    const context = await browser.newContext({ viewport: { width: 430, height: 860 } });
    await context.addInitScript(() => { try { localStorage.setItem('barnyard-abduction.v2', '{not json'); } catch (e) {} });
    const { page, errors } = await openPage(null, context);
    const lv = await page.evaluate(() => __BA.LEVELS.length);
    check('a corrupt save is ignored instead of breaking the game', errors.length === 0 && lv === 6, errors.join(' | '));
    await context.close();
  }
} catch (e) {
  check('verification script completed', false, e.stack);
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${path.relative(process.cwd(), shotDir)}`);
process.exit(fail ? 1 : 0);
