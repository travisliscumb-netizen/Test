/* End-to-end playtest for Crimson Realm. Drives the real page in Chromium at
   phone-landscape sizes with real touch input (CDP touch events, which the
   browser turns into pointer events exactly as on a phone), walks every
   screen, fights, screenshots every stage, and fails on any console error. */

import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'crimson-realm');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, '..', '.shots', 'crimson');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const errors = [];

async function newPage(vp) {
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__crimson, null, { timeout: 8000 });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}

const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const center = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
const tap = async (page, cdp, sel) => {
  const c = await center(page, sel);
  await touch(cdp, 'touchStart', [c]);
  await touch(cdp, 'touchEnd', []);
};

/* ---------------------------------------------------- 1. menus by touch */
{
  const { ctx, page, cdp } = await newPage({ width: 844, height: 390 });
  check('boot screen shows', await page.locator('#boot.show').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '01-boot.png') });
  await tap(page, cdp, '#boot');
  await page.waitForSelector('#title.show');
  await frames(page, 20);
  check('title screen after tap', await page.locator('#title.show').isVisible());
  check('attract fight renders behind title', await page.evaluate(() => window.__crimson.renderer.stageId !== null));
  await page.screenshot({ path: path.join(SHOTS, '02-title.png') });

  await tap(page, cdp, '#newBtn');
  await page.waitForSelector('#select.show');
  await tap(page, cdp, '.card[data-id="volta"]');
  await frames(page, 6);
  check('fighter select picks by touch', (await page.locator('#selName').textContent()) === 'VOLTA');
  await page.screenshot({ path: path.join(SHOTS, '03-select.png') });

  await tap(page, cdp, '#selGo');
  await page.waitForSelector('#ladder.show');
  check('ladder shows level 1', /BEGIN LEVEL 1/.test(await page.locator('#ladderGo').textContent()));
  await page.screenshot({ path: path.join(SHOTS, '04-ladder.png') });

  await tap(page, cdp, '#ladderGo');
  await page.waitForSelector('#vs.show');
  await frames(page, 6);
  await page.screenshot({ path: path.join(SHOTS, '05-vs.png') });
  // the VS screen auto-advances after 2.6 s; on a slow machine it may already have
  if (await page.evaluate(() => window.__crimson.mode === 'vs')) await tap(page, cdp, '#vs');
  await page.waitForFunction(() => window.__crimson.mode === 'fight');
  check('controls visible in fight', await page.locator('#controls').isVisible());
  await page.waitForFunction(() => window.__crimson.match.phase === 'fight', null, { timeout: 6000 });

  // ---- touch: punch button
  const before = await page.evaluate(() => window.__crimson.match.fighters[0].serial);
  await tap(page, cdp, '.pad-p');
  await frames(page, 4);
  const st = await page.evaluate(() => ({ s: window.__crimson.match.fighters[0].serial, id: window.__crimson.match.fighters[0].moveId }));
  check('PUNCH button throws a jab', st.s !== before && st.id === 'jab', JSON.stringify(st));

  // ---- touch: floating stick, drag right = walk forward
  const zone = await page.locator('#stickZone').boundingBox();
  const o = { x: zone.x + zone.width * 0.4, y: zone.y + zone.height * 0.6, id: 7 };
  await frames(page, 30);
  const x0 = await page.evaluate(() => window.__crimson.match.fighters[0].x);
  await touch(cdp, 'touchStart', [o]);
  await touch(cdp, 'touchMove', [{ ...o, x: o.x + 60 }]);
  await frames(page, 24);
  const walk = await page.evaluate(() => ({ x: window.__crimson.match.fighters[0].x, s: window.__crimson.match.fighters[0].state }));
  check('stick drag walks the fighter', walk.x > x0 + 20, `x ${x0.toFixed(0)} -> ${walk.x.toFixed(0)} (${walk.s})`);

  // ---- multi-touch: hold the stick down AND tap kick = sweep
  await touch(cdp, 'touchEnd', []);
  await page.evaluate(() => { const m = window.__crimson.match; m.fighters[1].x = Math.min(2500, m.fighters[0].x + 700); });
  await page.waitForFunction(() => window.__crimson.match.fighters[0].neutral, null, { timeout: 5000 });
  await touch(cdp, 'touchStart', [o]);
  await touch(cdp, 'touchMove', [{ ...o, y: o.y + 60 }]);
  await frames(page, 4);
  const kc = await center(page, '.pad-k');
  await touch(cdp, 'touchStart', [{ ...o, y: o.y + 60 }, { ...kc, id: 9 }]);
  await frames(page, 3);
  const sweep = await page.evaluate(() => window.__crimson.match.fighters[0].moveId);
  check('stick down + KICK (two thumbs) = sweep', sweep === 'sweep', sweep);
  await touch(cdp, 'touchEnd', []);

  // ---- hold block
  await frames(page, 40);
  const bc = await center(page, '.pad-b');
  await touch(cdp, 'touchStart', [{ ...bc, id: 3 }]);
  await frames(page, 6);
  const blk = await page.evaluate(() => window.__crimson.match.fighters[0].state);
  check('holding BLOCK blocks', blk === 'block' || blk === 'bstun', blk);
  await touch(cdp, 'touchEnd', []);
  check('level 1 tutorial prompt appears', await page.locator('#tip').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '06-fight-touch.png') });

  // ---- pause
  await tap(page, cdp, '#pauseBtn');
  await frames(page, 2);
  check('pause button pauses', await page.evaluate(() => window.__crimson.paused));
  await page.screenshot({ path: path.join(SHOTS, '07-pause.png') });
  await tap(page, cdp, '#resumeBtn');
  check('resume', !(await page.evaluate(() => window.__crimson.paused)));

  // ---- finish the match on autopilot and check progression
  await page.evaluate(() => window.__crimson.start('volta', 1, 0, true));
  const over = await page.evaluate(() => window.__crimson.fastForward(60 * 60 * 8));
  check('match reaches a result', over);
  await page.evaluate(() => window.__crimson.showResultNow());
  await frames(page, 4);
  check('result screen', await page.locator('#result.show').isVisible());
  const prog = await page.evaluate(() => ({ won: window.__crimson.match.winner.side === 0, run: window.__crimson.state.run }));
  check('progress saved', prog.won ? prog.run.level === 2 : prog.run.losses === 1, JSON.stringify(prog));
  await page.screenshot({ path: path.join(SHOTS, '08-result.png') });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__crimson);
  const persisted = await page.evaluate(() => window.__crimson.state.run);
  check('progress survives reload', JSON.stringify(persisted) === JSON.stringify(prog.run), JSON.stringify(persisted));
  await ctx.close();
}

/* ----------------------------------------- 2. every stage, mid-fight */
{
  const { ctx, page } = await newPage({ width: 932, height: 430 });
  const homes = { ember: 'temple', kael: 'bridge', granite: 'forge', volta: 'spire', shade: 'grove', malrath: 'throne' };
  const timings = [];
  for (const [opp, stage] of Object.entries(homes)) {
    const me = opp === 'kael' ? 'shade' : 'kael';
    await page.evaluate(([me, opp]) => window.__crimson.start(me, 9, 0, true, opp), [me, opp]);
    await page.evaluate(() => window.__crimson.fastForward(420));
    await frames(page, 120);
    await page.evaluate(() => window.__crimson.setQuality(0));
    await frames(page, 2);             // play live so effects are at their natural density
    const ok = await page.evaluate((stage) => window.__crimson.renderer.stageId === stage, stage);
    check(`stage ${stage} loads`, ok);
    // true raster cost: getImageData forces the deferred canvas work to finish
    const ms = await page.evaluate(() => {
      const r = window.__crimson.renderer, m = window.__crimson.match;
      r.g.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      for (let i = 0; i < 6; i++) { r.frame(m, 1 / 60, { label: 'LEVEL 9' }); r.g.getImageData(0, 0, 1, 1); }
      return { ms: (performance.now() - t0) / 6, h: r.canvas.height };
    });
    timings.push(`${stage} ${ms.ms.toFixed(0)}ms@${ms.h}p`);
    await page.screenshot({ path: path.join(SHOTS, `10-stage-${stage}.png`) });
  }
  console.log('      raster cost per frame on this GPU-less container (CPU raster; phones use the GPU):', timings.join(', '));

  // adaptive resolution: slow frames must step quality down, fast ones must not
  // paused, so the live loop (genuinely slow in this container) cannot
  // step the quality itself between the synthetic samples
  await page.evaluate(() => window.__crimson.pause());
  const full = await page.evaluate(() => window.__crimson.setQuality(0));
  check('quality 0 is a 1080p backing store', full === 1080, String(full));
  const fast = await page.evaluate(() => window.__crimson.simulateFrames(16.7, 400));
  check('fast device keeps full resolution', fast.quality === 0, JSON.stringify(fast));
  await page.evaluate(() => window.__crimson.setQuality(0));   // fresh measurement window
  const slow1 = await page.evaluate(() => window.__crimson.simulateFrames(40, 200));
  const slow2 = await page.evaluate(() => window.__crimson.simulateFrames(40, 400));
  check('slow device steps resolution down, never below the floor', slow1.quality === 1 && slow2.quality === 2 && slow2.backingH === 720, JSON.stringify([slow1, slow2]));
  await page.evaluate(() => { window.__crimson.setQuality(0); window.__crimson.resume(); });

  // ---- an execution
  await page.evaluate(() => window.__crimson.start('ember', 5, 0, true, 'granite'));
  const reached = await page.evaluate(() => {
    const c = window.__crimson, m = c.match;
    m.fighters[0].wins = 1;
    for (let i = 0; i < 60 * 60 * 3; i++) {
      if (m.phase === 'fight' && m.fighters[1].hp > 30) m.fighters[1].hp = 30;
      if (m.phase === 'fight' && m.fighters[0].hp < 400) m.fighters[0].hp = 900;
      if (m.phase === 'finish' && m.koWinner === m.fighters[0]) m.fighters[0].buf.s = 9;
      c.fastForward(1);
      if (m.phase === 'finisher' && m.phaseT > 50) return 'shattered';
      if (m.over) return 'over-without-finisher';
    }
    return m.phase;
  });
  check('execution plays (EXECUTE! -> pieces)', reached === 'shattered', reached);
  await frames(page, 30);
  check('body pieces and blood rendered', await page.evaluate(() => window.__crimson.renderer.pieces.length >= 8));
  await page.screenshot({ path: path.join(SHOTS, '11-execution.png') });
  await ctx.close();
}

/* ------------------------------------------------ 3. portrait + install */
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  check('portrait shows rotate prompt', await page.locator('#rotate').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '12-portrait.png') });
  const m = await (await page.request.get(url + '/manifest.webmanifest')).json();
  check('manifest: landscape + fullscreen', m.orientation === 'landscape' && m.display === 'fullscreen');
  for (const ic of m.icons) {
    const r = await page.request.get(url + '/' + ic.src);
    const buf = await r.body();
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    check(`icon ${ic.src} is a ${ic.sizes} PNG`, r.ok() && `${w}x${h}` === ic.sizes);
  }
  const apple = await page.request.get(url + '/icons/apple-touch-icon-180.png');
  check('apple-touch-icon present', apple.ok());
  const sw = await (await page.request.get(url + '/sw.js')).text();
  const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((x) => x[1]).filter(Boolean);
  let missing = [];
  for (const f of shell) if (!(await page.request.get(url + '/' + f)).ok()) missing.push(f);
  check('every precached file exists', missing.length === 0, missing.join(', '));
  const srcs = fs.readdirSync(path.join(ROOT, 'src'));
  const uncached = srcs.filter((f) => !shell.includes('src/' + f));
  check('every source file is precached for offline', uncached.length === 0, uncached.join(', '));
  await ctx.close();
}

check('no console errors or exceptions', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
console.log('screenshots in', SHOTS);
process.exit(failures ? 1 : 0);
