/*
 * Block Stack 3D - end to end QA suite.
 *
 * Boots the real game in headless Chromium (WebGL via SwiftShader), drives it
 * through every flow the spec calls out and asserts on both game state and
 * rendered pixels.
 *
 *   node test/e2e.mjs                 # run everything
 *   node test/e2e.mjs --headed        # watch it
 *   KEEP_SHOTS=1 node test/e2e.mjs    # keep the screenshots in test/out
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test', 'out');

/* playwright is installed globally in this environment */
function loadPlaywright() {
  const tries = [];
  try { tries.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch {}
  tries.push(path.join(ROOT, 'node_modules'));
  for (const dir of tries) {
    try { return createRequire(dir + '/')('playwright'); } catch {}
  }
  throw new Error('playwright not found. `npm i -D playwright` or install it globally.');
}

/* ---------------------------------------------------------------- *
 * static file server
 * ---------------------------------------------------------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webmanifest': 'application/manifest+json',
               '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'game.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ---------------------------------------------------------------- *
 * tiny test harness
 * ---------------------------------------------------------------- */
let passed = 0;
const failures = [];
let current = '';

function ok(cond, msg) {
  if (cond) { passed++; return true; }
  failures.push(`${current} -> ${msg}`);
  console.log(`   ✗ ${msg}`);
  return false;
}
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b})`);

async function group(name, fn) {
  current = name;
  console.log(`\n▸ ${name}`);
  const before = failures.length;
  try { await fn(); } catch (e) { failures.push(`${name} -> threw: ${e.stack}`); console.log(`   ✗ threw: ${e.message}`); }
  if (failures.length === before) console.log('   ✓ all checks passed');
}

/* ---------------------------------------------------------------- *
 * page helpers
 * ---------------------------------------------------------------- */
const state = (p) => p.evaluate(() => window.GameDebug.state);
const save  = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.GameDebug.progress.data)));

const start = (p, level) => p.evaluate((l) => window.GameDebug.startLevel(l), level);

/** n perfect drops, executed as one synchronous batch so the slide cannot drift */
const perfect = (p, n) => p.evaluate((count) => {
  for (let i = 0; i < count; i++) { window.GameDebug.alignPerfect(); window.GameDebug.tap(); }
}, n);

const offsetDrop = (p, d) => p.evaluate((o) => { window.GameDebug.setOffset(o); window.GameDebug.tap(); }, d);
const missDrop = (p) => p.evaluate(() => { window.GameDebug.missNow(); window.GameDebug.tap(); });

const visible = (p, id) => p.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return !el.classList.contains('hidden') && r.width > 0 && r.height > 0;
}, id);

const clearSave = (p) => p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

/** overlays are shown after a short delay so the player sees the block fall */
const waitOverlay = (p, id) => p.waitForFunction(
  (i) => { const el = document.getElementById(i); return el && !el.classList.contains('hidden'); },
  id, { timeout: 4000 });

/** wait for CSS entrance animations so measurements are of the settled layout */
const settle = async (p) => {
  await p.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await p.waitForTimeout(60);
};

/** the UI ignores input briefly after appearing; wait that out before clicking */
const armed = async (p) => { await p.waitForFunction(() => !window.GameDebug.uiLocked(), null, { timeout: 4000 }); };
const clickWhenArmed = async (p, sel) => { await armed(p); await p.click(sel); };
const tapWhenArmed = async (p, sel) => {
  await armed(p);
  const box = await p.locator(sel).boundingBox();
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};

/* ================================================================ *
 * main
 * ================================================================ */
const { chromium } = loadPlaywright();
const { server, port } = await serve();
const BASE = `http://127.0.0.1:${port}/game.html`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars']
});

/* iPhone 14-ish */
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug, null, { timeout: 15000 });
await clearSave(page);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.GameDebug);

/* ---------------------------------------------------------------- */
await group('boot & WebGL', async () => {
  ok(await page.evaluate(() => !!window.GameDebug.view().renderer), 'renderer exists');
  eq(await visible(page, 'overlay-menu'), true, 'menu shows on boot');
  eq(await visible(page, 'fatal'), false, 'no fatal error banner');
  const s = await state(page);
  eq(s.mode, 'menu', 'starts in the menu');
  eq(s.highestUnlocked, 1, 'fresh save unlocks only level 1');
});

/* ---------------------------------------------------------------- */
await group('QA: normal level clear flow', async () => {
  await start(page, 1);
  let s = await state(page);
  eq(s.mode, 'playing', 'level 1 is playing');
  eq(s.isBoss, false, 'level 1 is a normal level');
  eq(s.goal, 5, 'level 1 needs 5 stacks');
  eq(await visible(page, 'boss-row'), false, 'no boss chips on a normal level');
  eq(await visible(page, 'btn-advance'), false, 'no Advance button on a normal level');

  await perfect(page, 4);
  s = await state(page);
  eq(s.height, 4, '4 stacks landed');
  eq(s.mode, 'playing', 'still playing one short of the goal');
  eq(await visible(page, 'overlay-clear'), false, 'no clear overlay yet');

  await perfect(page, 1);
  s = await state(page);
  eq(s.mode, 'clear', 'level clears exactly on the goal');
  await waitOverlay(page, 'overlay-clear');
  eq(await visible(page, 'overlay-clear'), true, 'clear overlay shown');
  eq((await save(page)).highestUnlocked, 2, 'level 2 unlocked');
  ok(s.score > 0, 'score accumulated');

  // and the Next button moves on
  await clickWhenArmed(page, '#btn-next');
  s = await state(page);
  eq(s.level, 2, 'Next Level advances to level 2');
  eq(s.mode, 'playing', 'level 2 starts playing');
});

/* ---------------------------------------------------------------- */
await group('QA: overhang is sliced and inherited', async () => {
  await start(page, 1);
  const base = (await state(page)).baseSize;
  await offsetDrop(page, 0.9);
  let s = await state(page);
  near(s.sizeX, base - 0.9, 1e-6, 'width shrank by exactly the overhang');
  eq(s.sizeZ, base, 'the other axis is untouched');
  eq(s.axis, 'z', 'the axis alternates after a drop');

  await offsetDrop(page, -0.5);
  s = await state(page);
  near(s.sizeZ, base - 0.5, 1e-6, 'depth shrank on the second axis');
  near(s.sizeX, base - 0.9, 1e-6, 'width kept its inherited size');
});

/* ---------------------------------------------------------------- */
await group('QA: the moving block is a solid 3-D block, not a flat sheet', async () => {
  await start(page, 1);
  await perfect(page, 2);
  await page.evaluate(() => window.GameDebug.setOffset(1.6));   // clear of the tower behind
  await page.waitForTimeout(120);

  const b = await page.evaluate(() => window.GameDebug.movingBounds());
  ok(b.h >= 1.4, `real thickness (block height ${b.h})`);
  ok(b.w > 1 && b.d > 1, 'real footprint');
  ok(Math.min(b.w, b.h, b.d) / Math.max(b.w, b.h, b.d) > 0.3, 'no dimension is degenerate/flat');
  ok(b.triangles > 150, `rounded-edge geometry, not a quad (${b.triangles} triangles)`);
  ok(!b.hasShadow && !b.castsShadow,
     'the sliding block casts no shadow - a shadow under it is a free aiming reticle');
  ok(b.hasGlow && b.glowOpacity > 0.1, `floating glow present (opacity ${b.glowOpacity})`);

  const f = await page.evaluate(() => window.GameDebug.faceSamples());
  ok(f && f.top && f.front && f.side, 'all three faces are on screen');
  if (f && f.top && f.front && f.side) {
    ok(f.top.lum > f.front.lum + 0.02, `top face is lit brighter than the front (${f.top.lum.toFixed(3)} vs ${f.front.lum.toFixed(3)})`);
    ok(Math.abs(f.front.lum - f.side.lum) > 0.008 || Math.abs(f.front.r - f.side.r) > 2,
       'front and side faces are shaded differently');
    ok(f.top.lum - Math.min(f.front.lum, f.side.lum) > 0.03, 'clear light-to-shadow range across the faces');
    const spread = f.silhouette.height / f.silhouette.width;
    ok(spread > 0.35, `silhouette has real vertical depth (h/w ${spread.toFixed(2)})`);
    ok(f.silhouette.width / f.silhouette.canvasW > 0.15, 'block is large enough on screen to read');
  }

  // and it is still a solid block at the hardest level, where blocks are smallest
  await start(page, 100);
  await perfect(page, 3);
  await page.evaluate(() => window.GameDebug.setOffset(1.2));
  await page.waitForTimeout(100);
  const b2 = await page.evaluate(() => window.GameDebug.movingBounds());
  ok(b2.h >= 1.4, 'late-level blocks keep full thickness');
  ok(Math.min(b2.w, b2.h, b2.d) / Math.max(b2.w, b2.h, b2.d) > 0.5, 'late-level blocks are chunky');
  const f2 = await page.evaluate(() => window.GameDebug.faceSamples());
  if (ok(!!(f2 && f2.top && f2.front), 'faces visible at level 100')) {
    ok(f2.top.lum > f2.front.lum + 0.01, 'top still reads brighter than the front at level 100');
  }
});

/* ---------------------------------------------------------------- */
await group('QA: the tower turns as one playfield, and drops stay square', async () => {
  // no turning at all while it is still being taught
  await start(page, 5);
  await perfect(page, 6);
  let s = await state(page);
  eq(s.towerAngle, 0, 'world 1 never turns the tower');
  eq(s.plan.rotationSet.length, 0, 'and has no turn angles');

  // world 2 turns 45 degrees, and the whole playfield goes with it
  await start(page, 15);
  const angles = [];
  for (let i = 0; i < 6; i++) {   // level 15 clears at 7, so stay inside the run
    await perfect(page, 1);
    await page.evaluate(() => window.GameDebug.finishTurn());
    angles.push((await state(page)).towerAngle);
  }
  ok(angles.some((a) => Math.abs(a) > 1), `the tower actually turned (${angles.join(', ')})`);
  for (const a of angles) {
    const mod = Math.abs(Math.round(a) % 45);
    ok(mod === 0 || mod === 45, `orientation is a taught angle, not arbitrary (${a})`);
  }

  // the critical property: turning must not break the landing geometry
  s = await state(page);
  eq(s.mode, 'playing', 'still playing through the turns');
  near(s.sizeX, s.baseSize, 1e-6, 'perfect drops through turns lose no width');
  near(s.sizeZ, s.baseSize, 1e-6, 'and no depth - the playfield turns, the blocks still land square');
  eq(s.sizePercent, 100, 'a full block survived every rotation');

  // the pad turns with the tower: the first block lands square on it
  await start(page, 25);
  await page.evaluate(() => { window.GameDebug.freeze(true); window.GameDebug.alignPerfect(); });
  const before = await page.evaluate(() => window.GameDebug.view().towerAngle);
  await page.evaluate(() => { window.GameDebug.view().turnTower(90, 0.2); window.GameDebug.finishTurn(); });
  const after = await page.evaluate(() => window.GameDebug.view().towerAngle);
  near(Math.abs(after - before), Math.PI / 2, 0.02, 'turnTower turns by exactly what it is asked');
  await page.evaluate(() => { window.GameDebug.alignPerfect(); window.GameDebug.freeze(false); });
  await perfect(page, 1);
  eq((await state(page)).sizePercent, 100, 'a perfect drop on a turned tower is still perfect');

  // a full turn only exists where the tower is also turning live
  const late = await page.evaluate(() => {
    const L = window.GameDebug.logic;
    return { at70: L.rotationSet(70), at71: L.rotationSet(71),
             during70: L.levelConfig(70).plan.rotateDuring,
             during71: L.levelConfig(71).plan.rotateDuring,
             spin71: L.levelConfig(71).plan.spinRate };
  });
  eq(late.at70.includes(360), false, 'no meaningless full turn before live rotation');
  eq(late.at71.includes(360), true, 'a full turn arrives with live rotation');
  eq(late.during71, true, 'and the tower is turning while the block travels');
  ok(late.spin71 > 0, 'with a real spin rate');
});

/* ---------------------------------------------------------------- */
await group('QA: entry sides and movement rhythm are learnable, not random', async () => {
  // the same level plays the same way every time - the fairness guarantee
  const runOf = (lvl) => page.evaluate((l) => {
    const L = window.GameDebug.logic, c = L.levelConfig(l);
    return Array.from({ length: 24 }, (_, h) => L.approachSide(c, h) + ':' + L.rotationDelta(c, h));
  }, lvl);
  for (const lvl of [12, 45, 88]) {
    const a = await runOf(lvl), b = await runOf(lvl);
    eq(a.join('|'), b.join('|'), `level ${lvl} is identical on a retry`);
  }

  // and the live game follows that plan rather than rolling dice
  await start(page, 12);
  const planned = await page.evaluate(() => {
    const L = window.GameDebug.logic, c = L.levelConfig(12);
    return [0, 1, 2, 3].map((h) => L.approachSide(c, h));
  });
  const actual = [];
  for (let i = 0; i < 4; i++) {
    actual.push((await state(page)).side);
    await perfect(page, 1);
    await page.evaluate(() => window.GameDebug.finishTurn());
  }
  eq(actual.join(','), planned.join(','), 'the block enters from the side the plan says');

  // level 1 is a single constant speed; late levels have a real rhythm
  const rhythm = await page.evaluate(() => {
    const L = window.GameDebug.logic;
    const sample = (l) => {
      const c = L.levelConfig(l);
      const vals = [];
      for (let i = -20; i <= 20; i++) vals.push(L.speedProfile(c, i / 20));
      return { min: Math.min(...vals), max: Math.max(...vals) };
    };
    return { one: sample(1), late: sample(75) };
  });
  eq(rhythm.one.min, rhythm.one.max, 'level 1 never changes speed');
  ok(rhythm.late.max / rhythm.late.min > 1.4, 'late levels vary speed along the travel');
  ok(rhythm.late.min > 0.1, 'and never stall the block');
});

/* ---------------------------------------------------------------- */
await group('QA: a level starts on the ground and every block counts', async () => {
  await start(page, 1);
  let s = await state(page);
  eq(s.height, 0, 'nothing is stacked at the start of a level');
  eq(s.blockCount, 0, 'no blocks are placed for you - the tower starts empty');
  eq(s.topY, 0, 'the pad is the anchor for the first drop');
  eq(await page.textContent('#prog-value'), '0 / ' + s.goal, 'HUD opens at zero');

  // the pad is exactly the level footprint, so drop one is judged like the rest
  await page.evaluate(() => { window.GameDebug.freeze(true); window.GameDebug.alignPerfect(); });
  const b = await page.evaluate(() => window.GameDebug.movingBounds());
  near(b.anchorSx, s.baseSize, 1e-6, 'the pad is the level starting footprint');
  near(b.anchorSz, s.baseSize, 1e-6, 'the pad is square to the level footprint');
  await page.evaluate(() => window.GameDebug.freeze(false));

  // the very first block counts towards the goal
  await perfect(page, 1);
  s = await state(page);
  eq(s.height, 1, 'the first block counts');
  eq(s.blockCount, 1, 'and it is the only block in the tower');
  near(s.topY, 1.5, 1e-6, 'it rests directly on the pad');
  eq(await page.textContent('#prog-value'), '1 / ' + s.goal, 'HUD counts it');

  // the first block can be sliced like any other
  await start(page, 1);
  await offsetDrop(page, 0.8);
  s = await state(page);
  eq(s.height, 1, 'a sloppy first drop still counts');
  near(s.sizeX, s.baseSize - 0.8, 1e-6, 'the first block is sliced by the pad edge');

  // and missing the pad ends the run immediately
  await start(page, 1);
  await missDrop(page);
  s = await state(page);
  eq(s.mode, 'fail', 'missing the pad on drop one fails the run');
  eq(s.height, 0, 'with nothing stacked');
  await waitOverlay(page, 'overlay-fail');
  await clickWhenArmed(page, '#btn-retry');
  eq((await state(page)).height, 0, 'retry puts you back on the empty pad');
});

/* ---------------------------------------------------------------- */
await group('QA: the block hovers clear of the tower and falls when dropped', async () => {
  await start(page, 1);
  await perfect(page, 3);
  await page.evaluate(() => { window.GameDebug.freeze(true); window.GameDebug.alignPerfect(); });
  await page.waitForTimeout(200);

  let s = await state(page);
  let b = await page.evaluate(() => window.GameDebug.movingBounds());
  const blockH = b.h;
  const clearAir = (b.y - blockH / 2) - (s.topY + blockH / 2);
  ok(clearAir > blockH * 1.5,
     `real air under the block: ${clearAir.toFixed(2)} units, over ${(clearAir / blockH).toFixed(1)} block heights`);
  near(b.y, s.topY + s.hover, 0.1, 'the block hovers at the level hover height');

  near(b.anchorY, s.topY, 1e-6, 'the block hovers over the top of the tower');

  // Landed blocks still cast shadows - only the sliding one is exempt, so the
  // tower keeps its depth without handing the player a targeting aid.
  ok(await page.evaluate(() => window.GameDebug.view().shadowsEnabled), 'scene shadows still enabled');
  await page.evaluate(() => { window.GameDebug.alignPerfect(); window.GameDebug.freeze(false); });

  // dropping makes it fall: the landed block descends over several frames
  const fall = await page.evaluate(async () => {
    window.GameDebug.alignPerfect();
    const from = window.GameDebug.movingBounds().y;
    const target = window.GameDebug.state.topY + 1.5;
    window.GameDebug.tap();
    const ys = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      ys.push(window.GameDebug.landedTopY());
    }
    return { from, target, ys };
  });
  ok(fall.ys[0] > fall.target + 0.2, `the block starts in the air (${fall.ys[0].toFixed(2)} vs ${fall.target.toFixed(2)})`);
  ok(fall.ys.some((y, i) => i > 0 && y < fall.ys[i - 1]), 'it descends across frames');
  ok(fall.ys.filter((y) => y > fall.target + 0.05).length >= 2, 'the fall takes more than one frame');
  near(fall.ys[fall.ys.length - 1], fall.target, 0.01, 'it comes to rest exactly on the tower');
  ok(fall.ys.every((y, i) => i === 0 || y <= fall.ys[i - 1] + 1e-6), 'it never bounces back up mid-fall');

  // the gap widens as the climb gets harder
  const gaps = await page.evaluate(() => [1, 50, 100].map((l) => window.GameDebug.logic.levelConfig(l).dropGap));
  ok(gaps[0] < gaps[1] && gaps[1] < gaps[2], `drop height grows with level (${gaps.join(' -> ')})`);
});

/* ---------------------------------------------------------------- */
await group('QA: remaining size and the star rating', async () => {
  await clearSave(page);
  await page.evaluate(() => window.GameDebug.progress.load());
  await start(page, 3);
  let s = await state(page);
  eq(s.sizePercent, 100, 'a level opens with the whole block');
  eq(s.stars, 3, 'a full block is three stars');
  eq(await page.textContent('#size-pct'), '100%', 'HUD shows the percentage');

  // the meter reflects area, not one axis
  await offsetDrop(page, s.baseSize * 0.1);
  s = await state(page);
  eq(s.sizePercent, 90, 'one axis down a tenth is 90% of the area');
  await offsetDrop(page, s.baseSize * 0.1);
  s = await state(page);
  eq(s.sizePercent, 81, 'a tenth off each axis leaves 81%, not 90%');
  eq(s.stars, 3, 'still above 80%');
  eq(await page.textContent('#size-pct'), '81%', 'HUD tracks it');
  const lit = await page.evaluate(() =>
    [...document.querySelectorAll('#stars i')].filter((e) => e.classList.contains('on')).length);
  eq(lit, 3, 'three stars lit in the HUD');

  // cross each threshold and check the tier
  const tierAt = async (frac) => {
    await start(page, 3);
    const base = (await state(page)).baseSize;
    const side = Math.sqrt(frac);
    await page.evaluate((d) => { window.GameDebug.setOffset(d); window.GameDebug.tap(); }, base * (1 - side));
    await page.evaluate((d) => { window.GameDebug.setOffset(d); window.GameDebug.tap(); }, base * (1 - side));
    const st = await state(page);
    return { pct: st.sizePercent, stars: st.stars };
  };
  let t = await tierAt(0.70); eq(t.stars, 2, `70% is two stars (got ${t.pct}%)`);
  t = await tierAt(0.50);     eq(t.stars, 1, `50% is one star (got ${t.pct}%)`);
  t = await tierAt(0.30);     eq(t.stars, 0, `30% is no stars (got ${t.pct}%)`);

  // recovery puts percentage back, which is the point of it
  await start(page, 3);
  await offsetDrop(page, 0.9);
  const dropped = (await state(page)).sizePercent;
  await perfect(page, 3);
  s = await state(page);
  ok(s.sizePercent > dropped, `recovery restores percentage (${dropped}% -> ${s.sizePercent}%)`);
  ok(s.sizePercent <= 100, 'and never exceeds a full block');

  // stars are awarded on clear, saved, and shown on the level map
  await start(page, 1);
  await perfect(page, 5);
  s = await state(page);
  eq(s.mode, 'clear', 'level cleared');
  eq(s.stars, 3, 'a clean run is three stars');
  await waitOverlay(page, 'overlay-clear');
  eq(await page.textContent('#clear-pct'), '100%', 'award screen shows the percentage');
  const awarded = await page.evaluate(() =>
    [...document.querySelectorAll('#clear-stars i')].filter((e) => e.classList.contains('on')).length);
  eq(awarded, 3, 'three stars shown on the award screen');
  eq((await save(page)).levelStars['1'], 3, 'stars saved for the level');

  await clickWhenArmed(page, '#btn-clear-menu');
  await page.evaluate(() => window.GameDebug.openLevels());
  const cell = await page.evaluate(() => {
    const c = document.querySelector('#level-grid .mapcell .cellstars');
    return c ? c.getAttribute('data-n') : null;
  });
  eq(cell, '3', 'the level map shows the stars earned');
  await clickWhenArmed(page, '#btn-levels-close');

  // a worse replay does not take stars away
  await start(page, 1);
  await offsetDrop(page, 1.6);
  await perfect(page, 4);
  await waitOverlay(page, 'overlay-clear');
  ok((await state(page)).stars < 3, 'the replay earned fewer stars');
  eq((await save(page)).levelStars['1'], 3, 'the stored best is unchanged');
});

/* ---------------------------------------------------------------- */
await group('QA: boss levels appear every 10th level with the right targets', async () => {
  for (const lvl of [9, 10, 11, 50, 99, 100]) {
    await start(page, lvl);
    const s = await state(page);
    eq(s.isBoss, lvl % 10 === 0, `level ${lvl} boss flag`);
    eq(s.goal, lvl % 10 === 0 ? lvl : s.goal, `level ${lvl} target`);
    if (lvl % 10 === 0) {
      eq(s.goal, lvl, `boss ${lvl} requires height ${lvl}`);
      eq(await visible(page, 'boss-row'), true, `boss chips shown on ${lvl}`);
      eq(await page.textContent('#boss-req'), String(lvl), `HUD shows required height ${lvl}`);
      eq(await page.textContent('#hud-mode'), 'BOSS', 'HUD says BOSS');
    } else {
      eq(await page.textContent('#hud-mode'), 'NORMAL', 'HUD says NORMAL');
    }
  }
});

/* ---------------------------------------------------------------- */
await group('QA: boss failure before the target', async () => {
  await clearSave(page);
  await page.evaluate(() => window.GameDebug.progress.load());
  await start(page, 10);
  await perfect(page, 4);
  let s = await state(page);
  eq(s.height, 4, 'climbed to 4');
  eq(s.bossTargetMet, false, 'target not met at 4/10');
  eq(await visible(page, 'btn-advance'), false, 'BUG 6: no exit button before the target');
  eq(await visible(page, 'banner'), false, 'no target banner before the target');

  await missDrop(page);
  s = await state(page);
  eq(s.mode, 'fail', 'BUG 8: failing before the target fails the boss');
  await waitOverlay(page, 'overlay-fail');
  eq(await visible(page, 'overlay-fail'), true, 'fail overlay shown');
  eq(await visible(page, 'overlay-clear'), false, 'not treated as a clear');
  eq((await save(page)).highestUnlocked, 1, 'no level unlocked by a failed boss');
  eq((await save(page)).bossBest['10'], 4, 'BUG 9: best height recorded even on a failed run');
  ok((await page.textContent('#fail-title')).length > 0, 'fail title set');
});

/* ---------------------------------------------------------------- */
await group('QA: boss target reached, then manual exit', async () => {
  await start(page, 10);
  await perfect(page, 9);
  let s = await state(page);
  eq(s.height, 9, 'one short of the target');
  eq(s.bossTargetMet, false, 'target not yet met');
  eq(await visible(page, 'btn-advance'), false, 'BUG 6: exit button still hidden at 9/10');

  await perfect(page, 1);
  s = await state(page);
  eq(s.height, 10, 'target height reached');
  eq(s.bossTargetMet, true, 'target flagged as met');
  eq(s.mode, 'playing', 'BUG 5: reaching the target does not interrupt play');
  eq(s.movingActive, true, 'BUG 5: a new block is already sliding');
  eq(await visible(page, 'overlay-clear'), false, 'BUG 5: no overlay interrupts the run');
  eq(await visible(page, 'btn-advance'), true, 'exit button appears once the target is met');
  eq(await visible(page, 'banner'), true, 'target-reached banner shown');
  eq((await page.textContent('#btn-advance')).trim().startsWith('Advance'), true, 'button reads Advance');

  // play really does continue
  await perfect(page, 2);
  s = await state(page);
  eq(s.height, 12, 'you can keep stacking past the target');
  eq(s.mode, 'playing', 'still playing past the target');

  await clickWhenArmed(page, '#btn-advance');
  s = await state(page);
  eq(s.mode, 'clear', 'Advance ends the boss run');
  await waitOverlay(page, 'overlay-clear');
  eq(await visible(page, 'overlay-clear'), true, 'clear overlay shown');
  eq((await save(page)).highestUnlocked, 11, 'level 11 unlocked');
  eq((await save(page)).bossBest['10'], 12, 'best height saved from the manual exit');
});

/* ---------------------------------------------------------------- */
await group('QA: boss target reached, kept climbing, then fell', async () => {
  await start(page, 20);
  await perfect(page, 20);
  let s = await state(page);
  eq(s.height, 20, 'reached the required 20');
  eq(s.bossTargetMet, true, 'target met');
  eq(s.mode, 'playing', 'play continues');

  await perfect(page, 5);
  eq((await state(page)).height, 25, 'climbed to 25');

  await missDrop(page);
  s = await state(page);
  eq(s.mode, 'clear', 'BUG 7: falling after the target still clears the boss');
  await waitOverlay(page, 'overlay-clear');
  eq(await visible(page, 'overlay-clear'), true, 'clear overlay, not the fail overlay');
  eq(await visible(page, 'overlay-fail'), false, 'fail overlay not shown');
  ok((await page.textContent('#clear-sub')).includes('25'), 'summary reports the final height');
  eq((await save(page)).highestUnlocked, 21, 'level 21 unlocked by the cleared boss');
  eq((await save(page)).bossBest['20'], 25, 'BUG 9: best height 25 saved for boss 20');
});

/* ---------------------------------------------------------------- */
await group('QA: boss records are per level and never regress', async () => {
  await start(page, 20);
  await perfect(page, 6);
  await missDrop(page);
  const s1 = await save(page);
  eq(s1.bossBest['20'], 25, 'a worse run does not overwrite the record');
  await waitOverlay(page, 'overlay-fail');
  eq(await visible(page, 'overlay-fail'), true, 'a run that never reached 20 fails');

  eq(s1.bossBest['10'], 12, 'boss 10 keeps its own record');
  eq(s1.bossBest['30'], undefined, 'untouched bosses have no record');

  await start(page, 20);
  await perfect(page, 20);
  await perfect(page, 8);
  eq((await state(page)).height, 28, 'climbed to 28');
  await clickWhenArmed(page, '#btn-advance');
  eq((await save(page)).bossBest['20'], 28, 'a better run raises the record');
  eq(await page.textContent('#boss-best'), '28', 'HUD shows the boss best');
});

/* ---------------------------------------------------------------- */
await group('QA: persistence after reload', async () => {
  const before = await save(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.GameDebug);
  const after = await save(page);
  eq(after.highestUnlocked, before.highestUnlocked, 'unlock survives a reload');
  eq(after.bossBest['10'], before.bossBest['10'], 'boss 10 record survives a reload');
  eq(after.bossBest['20'], 28, 'boss 20 record survives a reload');
  ok(after.totalDrops > 0, 'lifetime stats persisted');

  // the level map reflects the saved state
  await page.evaluate(() => window.GameDebug.openLevels());
  eq(await visible(page, 'overlay-levels'), true, 'level map opens');
  const cells = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#level-grid .mapcell')];
    return { total: b.length, boss: b.filter(x => x.classList.contains('boss')).length,
             locked: b.filter(x => x.classList.contains('locked')).length,
             bossLabels: b.filter(x => x.classList.contains('boss'))
                          .map(x => x.querySelector('.n').textContent.trim()),
             bossAria: b.filter(x => x.classList.contains('boss'))
                        .every(x => /boss/i.test(x.getAttribute('aria-label') || '')) };
  });
  eq(cells.total, 100, 'map has 100 levels');
  eq(cells.boss, 10, 'map marks 10 boss levels');
  eq(cells.bossLabels.join(','), '10,20,30,40,50,60,70,80,90,100', 'bosses are every 10th level');
  eq(cells.bossAria, true, 'boss cells are labelled as bosses for screen readers');
  eq(cells.locked, 100 - after.highestUnlocked, 'locked count matches the save');
  ok((await page.textContent('#level-grid')).includes('28'), 'map shows the boss best');
  await clickWhenArmed(page, '#btn-levels-close');
});

/* ---------------------------------------------------------------- */
await group('QA: 3-perfect recovery', async () => {
  await start(page, 30);
  const base = (await state(page)).baseSize;

  // lose size on both axes first
  await offsetDrop(page, 0.8);
  await offsetDrop(page, 0.7);
  let s = await state(page);
  const lostX = s.sizeX, lostZ = s.sizeZ;
  ok(lostX < base && lostZ < base, 'size was lost');
  eq(s.streak, 0, 'a sloppy drop clears the streak');

  // two perfects are not enough
  await perfect(page, 2);
  s = await state(page);
  eq(s.streak, 2, 'streak counts up');
  eq(s.recoveries, 0, 'BUG 10: no refund at two perfects');
  near(s.sizeX, lostX, 1e-9, 'size unchanged at two perfects');

  // the third one pays out
  await perfect(page, 1);
  s = await state(page);
  eq(s.recoveries, 1, 'BUG 10: refund granted on the third perfect drop');
  ok(s.sizeX > lostX, `width recovered (${lostX.toFixed(3)} -> ${s.sizeX.toFixed(3)})`);
  ok(s.sizeZ > lostZ, 'depth recovered');
  ok(s.sizeX <= base + 1e-9 && s.sizeZ <= base + 1e-9, 'BUG 10: refund never exceeds the level base size');

  // the grown top block is what the next block lands on
  const bounds = await page.evaluate(() => window.GameDebug.movingBounds());
  near(bounds.w, s.sizeX, 0.011, 'the next block inherits the recovered width');

  // hammering perfects can never break the cap
  await perfect(page, 30);
  s = await state(page);
  ok(s.sizeX <= base + 1e-9, `cap holds after many refunds (${s.sizeX} <= ${base})`);
  ok(s.sizeZ <= base + 1e-9, 'cap holds on the other axis');
  ok(s.recoveries >= 2, 'refunds keep coming every third perfect');
  near(s.sizeX, base, 0.001, 'a long perfect streak restores the full base size');

  // and it works on normal levels too
  await start(page, 7);
  const nb = (await state(page)).baseSize;
  await offsetDrop(page, 0.6);
  const shrunk = (await state(page)).sizeX;
  await perfect(page, 3);
  s = await state(page);
  eq(s.recoveries, 1, 'recovery also works on normal levels');
  ok(s.sizeX > shrunk && s.sizeX <= nb + 1e-9, 'normal-level refund respects the cap');
});

/* ---------------------------------------------------------------- */
await group('QA: touch controls', async () => {
  await start(page, 3);
  await page.evaluate(() => { window.GameDebug.freeze(true); window.GameDebug.alignPerfect(); });
  const before = (await state(page)).height;
  await page.touchscreen.tap(195, 520);
  await page.waitForTimeout(80);
  let s = await state(page);
  eq(s.height, before + 1, 'a tap in the play area drops the block');
  eq(s.movingActive, true, 'the next block is already sliding');

  await page.evaluate(() => window.GameDebug.alignPerfect());
  await page.touchscreen.tap(60, 760);
  await page.waitForTimeout(80);
  eq((await state(page)).height, before + 2, 'taps work near the bottom edge too');

  await page.evaluate(() => window.GameDebug.alignPerfect());
  await page.touchscreen.tap(384, 300);
  await page.waitForTimeout(80);
  eq((await state(page)).height, before + 3, 'taps work near the right edge too');
  await page.evaluate(() => window.GameDebug.freeze(false));

  // a tap that ends the run must not also press the button that appears under
  // the finger (pointerdown drops, the trailing click would hit the overlay)
  await start(page, 5);
  await page.evaluate(() => window.GameDebug.missNow());
  const failBtn = await page.evaluate(() => {
    const r = document.getElementById('btn-fail-menu').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(failBtn.x || 195, failBtn.y || 600);
  await waitOverlay(page, 'overlay-fail');
  await page.waitForTimeout(120);
  s = await state(page);
  eq(s.mode, 'fail', 'the tap failed the run');
  eq(await visible(page, 'overlay-fail'), true, 'the fail overlay is still up, not dismissed by the same tap');
  eq(await visible(page, 'overlay-menu'), false, 'the trailing click did not press Level Map');

  // and the boss exit button cannot be triggered by the tap that reveals it
  await start(page, 10);
  await page.evaluate(() => { window.GameDebug.freeze(true);
    for (let i = 0; i < 9; i++) { window.GameDebug.alignPerfect(); window.GameDebug.tap(); }
    window.GameDebug.alignPerfect(); });
  const advBox = await page.evaluate(() => {
    const r = document.getElementById('btn-advance').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(advBox.x, advBox.y);   // this tap reaches the target
  await page.waitForTimeout(140);
  s = await state(page);
  eq(s.height, 10, 'the tap landed the 10th block');
  eq(s.bossTargetMet, true, 'target met');
  eq(s.mode, 'playing', 'the same tap did not press the freshly revealed Advance button');
  await page.evaluate(() => window.GameDebug.freeze(false));

  const btn = await page.evaluate(() => {
    const r = document.getElementById('btn-advance').getBoundingClientRect();
    return { h: r.height, w: r.width };
  });
  ok(btn.h >= 44, `Advance button meets the 44px touch target (${btn.h}px)`);

  const h = (await state(page)).height;
  await tapWhenArmed(page, '#btn-advance');
  await page.waitForTimeout(100);
  const s2 = await state(page);
  eq(s2.mode, 'clear', 'tapping Advance exits the boss');
  eq(s2.height, h, 'tapping Advance did not also drop a block');

  await waitOverlay(page, 'overlay-clear');
  await clickWhenArmed(page, '#btn-clear-menu');
  eq(await visible(page, 'overlay-menu'), true, 'back to the menu');
});

/* ---------------------------------------------------------------- */
await group('QA: keyboard controls', async () => {
  await start(page, 3);
  await page.evaluate(() => { window.GameDebug.freeze(true); window.GameDebug.alignPerfect(); });
  const before = (await state(page)).height;
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  eq((await state(page)).height, before + 1, 'spacebar drops the block');
  await page.evaluate(() => window.GameDebug.alignPerfect());
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  eq((await state(page)).height, before + 2, 'spacebar keeps working');
  await page.evaluate(() => window.GameDebug.alignPerfect());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  eq((await state(page)).height, before + 3, 'Enter also drops the block');
  await page.evaluate(() => window.GameDebug.freeze(false));
  const scrolled = await page.evaluate(() => window.scrollY);
  eq(scrolled, 0, 'spacebar does not scroll the page');

  await page.keyboard.press('Escape');
  eq(await visible(page, 'overlay-menu'), true, 'Escape opens the menu');
});

/* ---------------------------------------------------------------- */
await group('QA: level themes are distinct and stay in art direction', async () => {
  const seen = await page.evaluate(() => {
    const out = [];
    for (let lvl = 1; lvl <= 100; lvl++) {
      const t = window.GameDebug.logic.themeForLevel(lvl);
      out.push({ lvl, sky: t.skyTop + t.skyBottom, pal: t.palette.join(','), world: t.worldName });
    }
    return out;
  });
  const sigs = new Set(seen.map(s => s.sky + s.pal));
  eq(sigs.size, 100, 'all 100 levels are visually unique');
  let sameAsPrev = 0;
  for (let i = 1; i < seen.length; i++) if (seen[i].sky + seen[i].pal === seen[i - 1].sky + seen[i - 1].pal) sameAsPrev++;
  eq(sameAsPrev, 0, 'no level looks like the one before it');
  eq(new Set(seen.map(s => s.world)).size, 10, '10 world bands');

  // every level actually renders and applies its theme to the page chrome
  for (const lvl of [1, 12, 23, 34, 45, 56, 67, 78, 89, 100]) {
    await start(page, lvl);
    const applied = await page.evaluate(() => ({
      sky: getComputedStyle(document.documentElement).getPropertyValue('--sky-top').trim(),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
      bodyBoss: document.body.classList.contains('boss')
    }));
    const t = await page.evaluate((l) => window.GameDebug.logic.themeForLevel(l), lvl);
    eq(applied.sky.toLowerCase(), t.skyTop.toLowerCase(), `level ${lvl} theme applied to the UI`);
    eq(applied.meta.toLowerCase(), t.skyTop.toLowerCase(), `level ${lvl} status-bar colour matches`);
    eq(applied.bodyBoss, lvl % 10 === 0, `level ${lvl} boss styling`);
  }
});

/* ---------------------------------------------------------------- */
await group('QA: long boss climb (level 100, height 100)', async () => {
  await start(page, 100);
  await page.evaluate(() => {
    for (let i = 0; i < 100; i++) { window.GameDebug.alignPerfect(); window.GameDebug.tap(); }
  });
  const s = await state(page);
  eq(s.height, 100, '100 stacks landed');
  eq(s.bossTargetMet, true, 'boss 100 target met at exactly 100');
  eq(s.mode, 'playing', 'still playing after the target');
  ok(s.blockCount <= 26, `old blocks are culled to keep the scene light (${s.blockCount} meshes)`);
  ok(s.topY > 140, 'the tower really is 100 blocks tall');
  eq((await save(page)).bossBest['100'], 100, 'boss 100 record saved');
  await page.waitForTimeout(200);
  eq(pageErrors.length, 0, 'no errors during the long climb');
  await page.screenshot({ path: path.join(OUT, 'boss100.png') });
});

/* ---------------------------------------------------------------- */
await group('QA: iPhone layout (no broken layout, no scrolling)', async () => {
  const sizes = [
    { name: 'iPhone SE', width: 320, height: 568 },
    { name: 'iPhone 14', width: 390, height: 844 },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
    { name: 'landscape', width: 844, height: 390 }
  ];
  for (const sz of sizes) {
    await page.setViewportSize({ width: sz.width, height: sz.height });
    await start(page, 10);
    await perfect(page, 10);
    await settle(page);

    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const ids = ['hud', 'hud-level', 'prog-fill', 'boss-row', 'streak-dots', 'btn-advance', 'banner', 'scene'];
      const boxes = {};
      for (const id of ids) {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        boxes[id] = { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
      }
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        scrollW: d.scrollWidth, scrollH: d.scrollHeight,
        scrollX: window.scrollX, scrollY: window.scrollY,
        boxes,
        tapTargets: [...document.querySelectorAll('#hud .iconbtn')].map((e) => {
          const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height));
        }),
        canvasCss: (() => { const r = document.getElementById('scene').getBoundingClientRect(); return [r.width, r.height]; })(),
        drawing: [document.getElementById('scene').width, document.getElementById('scene').height]
      };
    });

    ok(m.scrollW <= m.vw + 1, `${sz.name}: no horizontal overflow (${m.scrollW} <= ${m.vw})`);
    ok(m.scrollH <= m.vh + 1, `${sz.name}: no vertical overflow (${m.scrollH} <= ${m.vh})`);
    near(m.canvasCss[0], m.vw, 1, `${sz.name}: canvas fills the width`);
    near(m.canvasCss[1], m.vh, 1, `${sz.name}: canvas fills the height`);
    ok(m.drawing[0] >= m.vw, `${sz.name}: canvas backing store is at device resolution`);

    for (const [id, b] of Object.entries(m.boxes)) {
      ok(b.w > 0 && b.h > 0, `${sz.name}: #${id} is laid out`);
      ok(b.x >= -0.5 && b.right <= m.vw + 0.5,
         `${sz.name}: #${id} stays inside the width [x=${b.x.toFixed(1)} right=${b.right.toFixed(1)} vw=${m.vw}]`);
      ok(b.y >= -0.5 && b.bottom <= m.vh + 0.5,
         `${sz.name}: #${id} stays inside the height [y=${b.y.toFixed(1)} bottom=${b.bottom.toFixed(1)} vh=${m.vh}]`);
    }
    ok(m.boxes.hud.bottom < m.boxes['btn-advance'].y, `${sz.name}: HUD does not overlap the Advance button`);
    // contextual minimalism: the live HUD is a thin band, not a dashboard
    ok(m.boxes.hud.h <= 104, `${sz.name}: HUD stays a thin band (${m.boxes.hud.h.toFixed(0)}px)`);
    if (m.vh >= 560) {
      ok(m.boxes.hud.h / m.vh < 0.20,
         `${sz.name}: HUD uses under a fifth of the screen (${((m.boxes.hud.h / m.vh) * 100).toFixed(1)}%)`);
    }
    ok(m.boxes.hud.bottom < m.vh * 0.65,
       `${sz.name}: HUD stays clear of the thumb zone`);
    for (const t of m.tapTargets) ok(t >= 44, `${sz.name}: HUD buttons meet the 44px target (${t}px)`);
    await page.screenshot({ path: path.join(OUT, 'layout-' + sz.name.replace(/\s+/g, '-') + '.png') });
  }

  // menu + overlays also fit
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.GameDebug.openMenu());
  await settle(page);
  let fit = await page.evaluate(() => {
    const p = document.querySelector('#overlay-menu .panel').getBoundingClientRect();
    return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, vw: innerWidth, vh: innerHeight };
  });
  ok(fit.left >= -0.5 && fit.right <= fit.vw + 0.5, 'menu panel fits the narrowest phone');
  ok(fit.bottom <= fit.vh + 0.5, 'menu panel does not run off the bottom');

  await page.evaluate(() => window.GameDebug.openLevels());
  await settle(page);
  fit = await page.evaluate(() => {
    const p = document.querySelector('#overlay-levels .panel').getBoundingClientRect();
    const c = document.querySelector('#level-grid .mapcell').getBoundingClientRect();
    return { right: p.right, vw: innerWidth, cell: c.width, bottom: p.bottom, vh: innerHeight };
  });
  ok(fit.right <= fit.vw + 0.5, 'level map fits the narrowest phone');
  ok(fit.cell >= 20, `level map buttons stay tappable (${fit.cell.toFixed(1)}px)`);
  await page.screenshot({ path: path.join(OUT, 'level-map.png') });
  await clickWhenArmed(page, '#btn-levels-close');
  await page.setViewportSize({ width: 390, height: 844 });
});

/* ---------------------------------------------------------------- */
await group('QA: retry flow and difficulty curve in the live game', async () => {
  await start(page, 12);
  await missDrop(page);
  eq((await state(page)).mode, 'fail', 'a miss fails a normal level');
  await waitOverlay(page, 'overlay-fail');
  await clickWhenArmed(page, '#btn-retry');
  const s = await state(page);
  eq(s.mode, 'playing', 'retry restarts the same level');
  eq(s.level, 12, 'retry keeps the level');
  eq(s.height, 0, 'retry resets the tower');
  near(s.sizeX, s.baseSize, 1e-9, 'retry restores the level start size');

  const curve = await page.evaluate(() => {
    const L = window.GameDebug.logic;
    return [1, 25, 49, 75, 99].map(l => {   // all non-boss, so goals compare
      const c = L.levelConfig(l);
      return { l, speed: c.speed, win: c.perfectWindow, size: c.baseSize,
               load: c.mechanicLoad, goal: c.goal };
    });
  });
  for (let i = 1; i < curve.length; i++) {
    ok(curve[i].speed > curve[i - 1].speed, `speed rises by level ${curve[i].l}`);
    ok(curve[i].win < curve[i - 1].win, `perfect window tightens by level ${curve[i].l}`);
    ok(curve[i].size < curve[i - 1].size, `start size shrinks by level ${curve[i].l}`);
    ok(curve[i].goal >= curve[i - 1].goal, `goal never drops by level ${curve[i].l}`);
  }
  for (let i = 1; i < curve.length; i++) {
    ok(curve[i].load >= curve[i - 1].load, `mechanic load grows by level ${curve[i].l}`);
  }
  ok(curve[0].load === 0, 'level 1 runs no extra mechanics at all');
  ok(curve[4].load > 0.9, 'the endgame is carrying the difficulty with mechanics');
  ok(curve[4].speed / curve[0].speed < 2.4,
     `speed is not the difficulty system (${(curve[4].speed / curve[0].speed).toFixed(2)}x)`);
});

/* ---------------------------------------------------------------- */
await group('no runtime errors anywhere', async () => {
  eq(pageErrors.length, 0, 'no page errors: ' + pageErrors.slice(0, 4).join(' | '));
});

/* ---------------------------------------------------------------- */
await browser.close();
server.close();
if (!process.env.KEEP_SHOTS) {
  /* screenshots are debugging aids; keep them only when asked */
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
  fs.rmdirSync(OUT);
}

console.log(`\n${'─'.repeat(56)}`);
console.log(`${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
console.log('ALL QA CHECKS PASSED');
