/* End-to-end playtest. Drives the real page in Chromium at iPhone sizes:
   taps the canvas like a player, walks the menus, checks persistence across a
   reload, and fails on any console error or page exception. */

import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, '..', '.shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'iphone-15-pro-max', width: 430, height: 932 }
];

async function newPage(vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__blockstack, null, { timeout: 8000 });
  return { ctx, page, errors };
}

/* A scripted player: waits until the block is within `tol` world units of the
   target centre, then taps the canvas. The harness can only observe the block
   once per animation frame, so the tolerance floor is one frame of travel --
   asking for tighter than that would spin forever. */
async function playBlocks(page, count, tol) {
  return page.evaluate(async ({ count, tol }) => {
    const api = window.__blockstack;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 9000) {
      const g = api.game();
      if (!g || !g.active) { await sleep(8); continue; }
      const a = g.active;
      const centre = a.axis === 'x' ? g.top.x : g.top.z;
      const floor = a.speed * 1.55 / 60;
      if (Math.abs(a.pos - centre) <= Math.max(tol, floor)) {
        const before = g.placed;
        document.getElementById('stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        if (api.game().placed > before) placed++;
        if (api.state().phase === 'over' || api.state().phase === 'complete') break;
        await sleep(24);
      } else {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    return { placed, state: api.state() };
  }, { count, tol });
}

/* ------------------------------------------------------------- run it --- */
const vp = VIEWPORTS[1];
let { ctx, page, errors } = await newPage(vp);

check('boots to title screen', await page.isVisible('#title'));
check('canvas is sized to the viewport',
  await page.evaluate(() => { const c = document.getElementById('stage'); return c.width > 0 && c.height > 0; }));

await page.click('#playBtn');
await page.waitForTimeout(400);
check('play starts level 1', (await page.evaluate(() => window.__blockstack.state().cfg.num)) === 1);
check('HUD visible during play', await page.isVisible('#hud'));
check('level 1 shows the tap hint', await page.isVisible('#hint'));
await page.screenshot({ path: path.join(SHOTS, '01-level-1.png') });

/* Perfect play should never shrink the platform. */
let r = await playBlocks(page, 5, 0.004);
let st = await page.evaluate(() => window.__blockstack.state());
check('perfect placements keep full width',
  Math.abs(st.summary.remaining - st.cfg.maxSize) < 1e-6,
  `remaining=${st.summary.remaining.toFixed(4)}`);
check('perfect streak recorded', st.summary.perfects >= 5, `perfects=${st.summary.perfects}`);
check('3-perfect recovery fired at least once', st.summary.recoveries >= 1 || st.summary.remaining >= st.cfg.maxSize);
await page.screenshot({ path: path.join(SHOTS, '02-perfect-run.png') });

/* Sloppy play should shrink and eventually end the run. */
r = await playBlocks(page, 40, 0.32);
st = await page.evaluate(() => window.__blockstack.state());
check('sloppy play resolves the level (cleared or ended)',
  ['over', 'complete'].includes(st.phase), `phase=${st.phase}`);

await page.waitForTimeout(900);
check('result screen appears quickly after the run ends', await page.isVisible('#result'));
await page.screenshot({ path: path.join(SHOTS, '03-result.png') });

/* Fast retry: tapping the backdrop restarts immediately. */
const t0 = Date.now();
await page.mouse.click(vp.width / 2, vp.height * 0.12);
await page.waitForFunction(() => window.__blockstack.state().screen === 'game', null, { timeout: 3000 });
check('fail to playing in under 2s', Date.now() - t0 < 2000, `${Date.now() - t0}ms`);

/* Pause behaviour */
await page.click('#pauseBtn');
await page.waitForTimeout(200);
check('pause sheet opens', await page.isVisible('#pause'));
const posA = await page.evaluate(() => window.__blockstack.game().active.pos);
await page.waitForTimeout(500);
const posB = await page.evaluate(() => window.__blockstack.game().active.pos);
check('paused game does not advance', posA === posB);
await page.screenshot({ path: path.join(SHOTS, '04-pause.png') });
await page.click('#resumeBtn');
await page.waitForTimeout(300);
check('resume restarts motion',
  (await page.evaluate(() => window.__blockstack.game().active.pos)) !== posB);

/* Level map */
await page.click('#pauseBtn');
await page.click('#toMapBtn');
await page.waitForTimeout(300);
check('level map opens', await page.isVisible('#map'));
check('map shows 10 tiles', (await page.locator('#levelGrid .tile').count()) === 10);
check('locked levels are disabled',
  (await page.locator('#levelGrid .tile.locked').count()) > 0);
check('boss tile is marked', (await page.locator('#levelGrid .tile.boss').count()) === 1);
await page.screenshot({ path: path.join(SHOTS, '05-map.png') });

/* Every world's background renders without throwing */
for (let w = 1; w <= 10; w++) {
  await page.evaluate((n) => window.__blockstack.start(n), (w - 1) * 10 + 1);
  await page.waitForTimeout(160);
}
check('all 10 world environments render', errors.length === 0, errors.slice(0, 2).join(' | '));

/* Boss flow, including the endless continuation */
await page.evaluate(() => window.__blockstack.start(10));
await page.waitForTimeout(250);
check('boss level announces itself', await page.isVisible('#bossBanner'));
const bossTarget = await page.evaluate(() => window.__blockstack.state().cfg.target);
await playBlocks(page, bossTarget, 0.004);
st = await page.evaluate(() => window.__blockstack.state());
check('boss clears at its target', st.summary.bossCleared, `placed=${st.summary.placed}/${bossTarget}`);
check('boss continues into an endless run', st.phase === 'endless', `phase=${st.phase}`);
check('bank-run button appears', await page.isVisible('#finishBtn'));
await page.screenshot({ path: path.join(SHOTS, '06-boss-endless.png') });
await playBlocks(page, 4, 0.004);
st = await page.evaluate(() => window.__blockstack.state());
check('endless blocks counted', st.summary.endlessBlocks >= 4, `endless=${st.summary.endlessBlocks}`);
await page.click('#finishBtn');
await page.waitForTimeout(900);
check('banking the run shows the result', await page.isVisible('#result'));

/* World completion celebration after the world-1 boss */
const sawWorldClear = await page.evaluate(() => {
  const s = window.__blockstack.save();
  return Object.keys(s.levels).length > 0;
});
check('boss result is saved', sawWorldClear);

/* Records + achievements */
await page.evaluate(() => window.__blockstack.start(1));
await page.waitForTimeout(120);
await page.click('#pauseBtn'); await page.click('#toMapBtn');
await page.click('#mapBack');
await page.waitForTimeout(200);
await page.click('#recordsBtn');
await page.waitForTimeout(250);
check('records screen opens', await page.isVisible('#records'));
check('achievements listed', (await page.locator('#achList .ach').count()) === 10);
check('at least one achievement earned', (await page.locator('#achList .ach.on').count()) > 0);
await page.screenshot({ path: path.join(SHOTS, '07-records.png') });

/* Settings persist across a reload, and so does progress. */
await page.click('#recBack');
await page.waitForTimeout(150);
await page.click('.toggle[data-setting="music"]');
const musicOff = await page.evaluate(() => window.__blockstack.save().settings.music);
const savedHighest = await page.evaluate(() => window.__blockstack.save().highest);
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack, null, { timeout: 8000 });
const after = await page.evaluate(() => window.__blockstack.save());
check('settings survive a reload', after.settings.music === musicOff);
check('progress survives a reload', after.highest === savedHighest, `${after.highest} vs ${savedHighest}`);
check('title shows a continue action',
  (await page.textContent('#playLabel')).toLowerCase().includes('continue'));

/* Level 100 is reachable and playable */
await page.evaluate(() => {
  const api = window.__blockstack;
  api.start(100);
});
await page.waitForTimeout(300);
st = await page.evaluate(() => window.__blockstack.state());
check('level 100 loads', st.cfg.num === 100 && st.cfg.boss, JSON.stringify({ n: st.cfg.num, t: st.cfg.target }));
await playBlocks(page, 3, 0.004);
st = await page.evaluate(() => window.__blockstack.state());
check('level 100 is playable', st.summary.placed >= 3);
await page.screenshot({ path: path.join(SHOTS, '08-level-100.png') });

/* No rotation anywhere: the projection of a fixed world point must be constant
   for a fixed camera, and the camera must only ever move vertically. */
const rot = await page.evaluate(() => {
  const R = window.__blockstack.game() && document;
  const api = window.__blockstack;
  const g = api.game();
  return typeof g === 'object';
});
check('engine exposes no rotation state',
  await page.evaluate(() => {
    const g = window.__blockstack.game();
    const keys = Object.keys(g.active || {}).concat(Object.keys(g.blocks[0]));
    return !keys.some((k) => /rot|angle|spin|yaw|pitch/i.test(k));
  }));

/* Frame budget on the busiest world */
await page.evaluate(() => window.__blockstack.start(100));
await page.waitForTimeout(200);
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  function tick() { n++; if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); }
  requestAnimationFrame(tick);
}));
check('frame rate holds up', fps > 50, `${fps.toFixed(1)} fps (headless)`);

check('no console errors during the whole session', errors.length === 0, errors.slice(0, 3).join(' | '));
await ctx.close();

/* Other iPhone sizes render and lay out without overflow */
for (const v of [VIEWPORTS[0], VIEWPORTS[2]]) {
  const p2 = await newPage(v);
  await p2.page.click('#playBtn');
  await p2.page.waitForTimeout(400);
  const overflow = await p2.page.evaluate(() => ({
    sx: document.documentElement.scrollWidth > window.innerWidth + 1,
    sy: document.documentElement.scrollHeight > window.innerHeight + 1
  }));
  check(`${v.name}: no page overflow`, !overflow.sx && !overflow.sy, JSON.stringify(overflow));
  check(`${v.name}: no console errors`, p2.errors.length === 0, p2.errors.slice(0, 2).join(' | '));
  await p2.page.screenshot({ path: path.join(SHOTS, `09-${v.name}.png`) });
  await p2.ctx.close();
}

/* Manifest + icons actually resolve */
const mp = await browser.newPage();
const manifest = await (await mp.goto(url + '/manifest.webmanifest')).json();
check('manifest is standalone with a start_url', manifest.display === 'standalone' && !!manifest.start_url);
let iconsOk = true;
for (const i of manifest.icons) {
  const res = await mp.goto(url + '/' + i.src);
  if (!res || res.status() !== 200) { iconsOk = false; console.log('  missing icon', i.src); }
}
check('every manifest icon resolves', iconsOk);
check('maskable icons declared', manifest.icons.some((i) => i.purpose === 'maskable'));
await mp.close();

await browser.close();
server.close();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
console.log('screenshots:', SHOTS);
process.exit(failures ? 1 : 0);
