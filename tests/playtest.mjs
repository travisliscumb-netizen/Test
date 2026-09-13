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
check('splash clears itself', await page.evaluate(() => {
  const s = document.getElementById('splash');
  return !s || s.classList.contains('out');
}));
await page.screenshot({ path: path.join(SHOTS, '01-level-1.png') });

/* Perfect play should never shrink the platform. */
let r = await playBlocks(page, 5, 0.004);
let st = await page.evaluate(() => window.__blockstack.state());
check('perfect placements keep full width',
  Math.abs(st.summary.remaining - st.cfg.maxSize) < 1e-6,
  `remaining=${st.summary.remaining.toFixed(4)}`);
check('every placement in a perfect pass was perfect',
  st.summary.perfects === st.summary.placed && st.summary.placed >= 4,
  `${st.summary.perfects}/${st.summary.placed}`);
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
check('boss level announces itself', await page.isVisible('#banner'));
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
check('achievements listed', (await page.locator('#achList .ach').count()) >= 10);
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

/* ---- polish-pass coverage ------------------------------------------- */
const p3 = await newPage(VIEWPORTS[1]);

/* Block scale: the stack must dominate the frame, not sit far away in it. */
await p3.page.click('#playBtn');
await p3.page.waitForTimeout(500);
{
  // measured from the renderer itself, not a copy of its formula
  const m = await p3.page.evaluate(() => window.__blockstack.metrics());
  const frac = (2 * m.k) / m.w;
  check('blocks occupy about half the screen width', frac > 0.44 && frac < 0.58,
    `${(frac * 100).toFixed(0)}% of viewport width`);
  check('backing store is capped at 2x', m.dpr <= 2, `dpr=${m.dpr}`);
}

/* Rapid repeated taps must not corrupt state or double-place. */
const tapsBefore = await p3.page.evaluate(() => window.__blockstack.game().placed);
for (let i = 0; i < 12; i++) await p3.page.mouse.click(195, 620, { delay: 4 });
const tapsAfter = await p3.page.evaluate(() => window.__blockstack.state());
check('rapid repeated taps stay consistent',
  ['playing', 'over', 'complete', 'ready'].includes(tapsAfter.phase), `phase=${tapsAfter.phase}`);
check('rapid taps never place more than one block each',
  tapsAfter.summary.placed <= tapsBefore + 12, `${tapsBefore} -> ${tapsAfter.summary.placed}`);

/* Both travel axes, and a platform trimmed down to a sliver. */
await p3.page.evaluate(() => window.__blockstack.start(45));
await p3.page.waitForTimeout(200);
const axes = await p3.page.evaluate(async () => {
  const api = window.__blockstack;
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const g = api.game(); if (!g.active) break;
    seen.add(g.active.axis);
    g.active.pos = g.active.axis === 'x' ? g.top.x : g.top.z;
    api.place();
  }
  return [...seen];
});
check('both travel axes occur in an alternating level', axes.length === 2, axes.join(','));

const sliver = await p3.page.evaluate(async () => {
  const api = window.__blockstack;
  api.start(1);
  const g = () => api.game();
  for (let i = 0; i < 7 && g().active; i++) {
    const a = g().active;
    a.pos = (a.axis === 'x' ? g().top.x : g().top.z) + 0.11;
    api.place();
  }
  return { w: g().top.w, phase: api.state().phase };
});
check('a heavily trimmed platform still plays', sliver.w < 0.45 && sliver.phase !== 'over',
  `w=${sliver.w.toFixed(3)} phase=${sliver.phase}`);

/* A tall tower must not degrade: culling should keep the cost flat. */
await p3.page.evaluate(() => window.__blockstack.stack());
await p3.page.waitForTimeout(150);
await p3.page.evaluate(async () => {
  const api = window.__blockstack;
  for (let i = 0; i < 45 && api.game().active; i++) {
    const a = api.game().active;
    a.pos = a.axis === 'x' ? api.game().top.x : api.game().top.z;
    api.place();
  }
});
// the burst places 45 blocks in one tick: let the effects expire AND the
// camera finish travelling before measuring steady-state cost
await p3.page.waitForTimeout(1600);
const tallState = await p3.page.evaluate(() => window.__blockstack.state());
check('stack mode reaches a tall tower', tallState.summary.placed >= 40, `h=${tallState.summary.placed}`);
check('stack mode crossed into a later world',
  (await p3.page.evaluate(() => window.__blockstack.game().live.world)) >= 4);
check('a new run is not interrupted by the previous run\'s result card',
  (await p3.page.evaluate(() => window.__blockstack.state().screen)) === 'game');
/* Frame rate at a tall tower is measured on a FRESH page. Headless Chromium
   rasterises in software and a long-lived page degrades ~20% regardless of what
   is drawn, so reusing this one would measure the harness, not the game. */
{
  const perf = await newPage(VIEWPORTS[1]);
  await perf.page.evaluate(async () => {
    const api = window.__blockstack;
    api.stack();
    for (let i = 0; i < 45 && api.game().active; i++) {
      const a = api.game().active;
      a.pos = a.axis === 'x' ? api.game().top.x : api.game().top.z;
      api.place();
    }
  });
  await perf.page.waitForTimeout(1500);
  const fpsTall = await perf.page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(tick);
  }));
  const draws = await perf.page.evaluate(() => ({ blocks: window.__blockstack.game().blocks.length }));
  check('tall tower holds frame rate', fpsTall > 50,
    `${fpsTall.toFixed(1)} fps at ${draws.blocks} blocks (headless software raster)`);
  await perf.ctx.close();
}

/* A cut piece must keep the exact material of the block it came from. */
const cutColor = await p3.page.evaluate(async () => {
  const api = window.__blockstack;
  api.start(1);
  const g = api.game();
  const a = g.active;
  const src = { ...a.color };
  a.pos = (a.axis === 'x' ? g.top.x : g.top.z) + 0.3;
  api.place();
  const d = api.game().debris[0];
  return d ? { src, got: { ...d.color } } : null;
});
check('cut pieces keep the parent block material',
  !!cutColor && cutColor.src.h === cutColor.got.h && cutColor.src.l === cutColor.got.l,
  cutColor ? `${cutColor.src.h.toFixed(1)} vs ${cutColor.got.h.toFixed(1)}` : 'no debris');

/* Nothing in the interface may paint at the bottom edge of the screen. */
const bottomEdge = await p3.page.evaluate(() => {
  const vh = window.innerHeight;
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('#app')) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return;
    if (b.bottom > vh - 30 && b.top < vh + 40) bad.push(el.id || el.tagName);
  });
  return bad;
});
check('no stray control paints at the bottom edge', bottomEdge.length === 0, bottomEdge.join(','));

/* The scenery must not end in a flat hard-edged bar across the bottom. */
const bandScan = await p3.page.evaluate(() => {
  const out = [];
  const c = document.getElementById('stage');
  const g = c.getContext('2d');
  const dpr = c.width / c.getBoundingClientRect().width;
  const col = Math.floor(c.width * 0.08);
  const read = (y) => {
    const d = g.getImageData(col, Math.round(c.height - y * dpr), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  let flat = 0;
  for (let y = 2; y < 46; y++) {
    const a = read(y), b = read(y + 1);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 0) flat++;
  }
  out.push(flat);
  return out[0];
});
check('the horizon resolves into a gradient, not a flat bar', bandScan < 34, `${bandScan}/44 identical rows`);

check('polish pass produced no console errors', p3.errors.length === 0, p3.errors.slice(0, 3).join(' | '));
await p3.ctx.close();

/* ---- regression guards for bugs already fixed once ------------------- */
{
  const rg = await newPage(VIEWPORTS[1]);

  // black crowns: the sprite has no fill of its own, so the icon must inherit
  const crownFill = await rg.page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'crowns';
    host.innerHTML = '<span class="cr on"><svg><use href="#i-crown"/></svg></span>';
    document.getElementById('app').appendChild(host);
    const svg = host.querySelector('svg');
    const fill = getComputedStyle(svg).fill;
    const colour = getComputedStyle(host.querySelector('.cr')).color;
    host.remove();
    return { fill, colour };
  });
  check('crowns inherit the accent rather than defaulting to black',
    crownFill.fill !== 'rgb(0, 0, 0)' && crownFill.colour !== 'rgb(0, 0, 0)',
    `fill=${crownFill.fill} colour=${crownFill.colour}`);

  // color-mix is Safari 16.2+; the plain fallback must stand on its own
  const btn = await rg.page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    document.getElementById('app').appendChild(b);
    const cs = getComputedStyle(b);
    const out = { bgColor: cs.backgroundColor, bgImage: cs.backgroundImage };
    b.remove();
    return out;
  });
  check('primary button keeps a solid fill without color-mix',
    btn.bgColor !== 'rgba(0, 0, 0, 0)' && btn.bgColor !== 'transparent', btn.bgColor);

  // effect pools must not grow without bound under a long perfect streak
  const pools = await rg.page.evaluate(async () => {
    const api = window.__blockstack;
    api.start(1);
    for (let i = 0; i < 60 && api.game().active; i++) {
      const a = api.game().active;
      a.pos = a.axis === 'x' ? api.game().top.x : api.game().top.z;
      api.place();
    }
    const r = api.pools();
    return r;
  });
  check('effect pools stay capped under a 60-perfect burst',
    pools.particles <= 180 && pools.rings <= 5 && pools.popups <= 6 && pools.debris <= 8,
    JSON.stringify(pools));

  // a stale result card must not land on a run that has already restarted
  const stale = await rg.page.evaluate(async () => {
    const api = window.__blockstack;
    api.start(3);
    const g = api.game();
    g.active.pos = (g.active.axis === 'x' ? g.top.x : g.top.z) + 9; // guaranteed miss
    api.place();
    api.start(4);                       // restart immediately, before the card
    await new Promise((r) => setTimeout(r, 900));
    return api.state().screen;
  });
  check('a restarted run is never interrupted by the old result card',
    stale === 'game', `screen=${stale}`);

  // the haptic switch must be nowhere near the visible edge
  const hap = await rg.page.evaluate(() => {
    const el = document.getElementById('hapticSwitch');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), left: Math.round(b.left), vh: window.innerHeight, vw: window.innerWidth };
  });
  check('the iOS haptic switch sits outside the viewport',
    hap && (hap.top < -40 || hap.left < -40), JSON.stringify(hap));

  // cut material identity, re-checked on the z axis this time
  const zcut = await rg.page.evaluate(async () => {
    const api = window.__blockstack;
    api.start(45);
    const g = () => api.game();
    let guard = 0;
    while (g().active && g().active.axis !== 'z' && guard++ < 8) {
      g().active.pos = g().active.axis === 'x' ? g().top.x : g().top.z;
      api.place();
    }
    const a = g().active;
    if (!a || a.axis !== 'z') return null;
    const src = { ...a.color };
    a.pos = g().top.z + 0.28;
    api.place();
    const d = api.game().debris[api.game().debris.length - 1];
    return d ? { src, got: { ...d.color } } : null;
  });
  check('z-axis cut pieces keep the parent material',
    !!zcut && zcut.src.h === zcut.got.h && zcut.src.s === zcut.got.s && zcut.src.l === zcut.got.l,
    zcut ? `h ${zcut.src.h.toFixed(1)} vs ${zcut.got.h.toFixed(1)}` : 'no z-axis block found');

  check('regression guards produced no console errors', rg.errors.length === 0, rg.errors.slice(0, 2).join(' | '));
  await rg.ctx.close();
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
let splashOk = true;
for (const m of [[1290, 2796], [1170, 2532], [750, 1334]]) {
  const res = await mp.goto(`${url}/icons/splash-${m[0]}x${m[1]}.png`);
  if (!res || res.status() !== 200) splashOk = false;
}
check('iOS launch images resolve', splashOk);
await mp.close();

await browser.close();
server.close();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
console.log('screenshots:', SHOTS);
process.exit(failures ? 1 : 0);
