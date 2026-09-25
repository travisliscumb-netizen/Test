/* End-to-end test in real Chromium (software WebGL, so it runs headless on CI
   machines without a GPU). Drives the page like a player on desktop and on a
   phone, and fails on any console error or uncaught exception.

   Run: npm run test:e2e        Screenshots land in ../.shots/ (git-ignored). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';
import { loadPlaywright } from '../tools/pw.mjs';

const { chromium } = loadPlaywright();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, '..', '.shots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

/* ---------- static checks: the service worker precaches exactly what ships ---------- */
{
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/^\s*'([^']+)',?$/gm)].map((m) => m[1]).filter((f) => f !== './');
  const missing = listed.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  check('sw.js: every precached file exists', missing.length === 0, missing.join(', '));
  const shipped = [
    ...fs.readdirSync(path.join(ROOT, 'src')).map((f) => `src/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'vendor')).map((f) => `vendor/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'icons')).map((f) => `icons/${f}`)
  ];
  const unlisted = shipped.filter((f) => !listed.includes(f));
  check('sw.js: every shipped asset is precached', unlisted.length === 0, unlisted.join(', '));
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(ctxOpts, tag) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '?test');
  await page.waitForFunction(() => window.__tetris && __tetris.renderer && __tetris.app === 'title', null, { timeout: 30000 });
  // Software rendering is slow; pin the cheapest tier so the test is about behaviour.
  await page.evaluate(() => { const r = __tetris.renderer; r.autoQuality = false; r.setQuality('low'); });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `tetris-${tag}-${name}.png`) });
  return { ctx, page, errors, shot };
}

const waitApp = (page, state, timeout = 60000) =>
  page.waitForFunction((s) => __tetris.app === s, state, { timeout });

async function startMode(page, mode) {
  await page.click('[data-go="modes"]');
  await page.waitForSelector('#modes.show');
  await page.click(`[data-mode="${mode}"]`);
  await waitApp(page, 'playing');
}

/* ---------- desktop ---------- */
{
  const { ctx, page, errors, shot } = await open({ viewport: { width: 1280, height: 800 } }, 'desktop');
  check('desktop: title screen visible with a live demo game', await page.evaluate(() =>
    document.querySelector('#title').classList.contains('show') && __tetris.demo && __tetris.game.state === 'playing'));
  const demoPlays = await page.waitForFunction(() => __tetris.game.stats.pieces >= 3, null, { timeout: 30000 }).then(() => true, () => false);
  check('desktop: demo bot is placing pieces', demoPlays);
  await shot('title');

  await startMode(page, 'marathon');
  check('desktop: HUD shown, demo off', await page.evaluate(() => !document.querySelector('#hud').hidden && !__tetris.demo));

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForFunction((n) => __tetris.game.stats.pieces >= n, i + 1, { timeout: 20000 });
  }
  const s1 = await page.evaluate(() => ({ pieces: __tetris.game.stats.pieces, score: __tetris.game.score }));
  check('desktop: keyboard hard drops place pieces and score', s1.pieces === 5 && s1.score > 0, JSON.stringify(s1));
  await page.waitForTimeout(400);
  const hudScore = await page.textContent('#s-score');
  check('desktop: HUD score matches game', hudScore === s1.score.toLocaleString('en-US') || hudScore === s1.score.toLocaleString(), hudScore);

  const before = await page.evaluate(() => __tetris.game.piece.type);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(200);
  check('desktop: C holds the current piece', await page.evaluate((t) => __tetris.game.hold === t, before));

  // A real Tetris: fill four rows except the right column, drop a vertical I.
  await page.evaluate(() => {
    const g = __tetris.game;
    g.board.fill(0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) g.board[y * 10 + x] = 1 + (x % 7);
    g.board[4 * 10] = 2;
    g.piece = { type: 'I', rot: 1, x: 7, y: 10 };
    g.lowestY = 10;
  });
  const linesBefore = await page.evaluate(() => __tetris.game.lines);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => [...document.querySelectorAll('#popups .pop')].some((p) => p.textContent === 'Tetris'), null, { timeout: 20000 });
  check('desktop: Tetris clears 4 lines and shows the TETRIS popup', await page.evaluate((l) => __tetris.game.lines === l + 4, linesBefore));
  await page.waitForTimeout(500);
  await shot('tetris');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#pause.show');
  check('desktop: Escape pauses', await page.evaluate(() => __tetris.app === 'paused'));
  const frozen = await page.evaluate(() => __tetris.game.time);
  await page.waitForTimeout(600);
  check('desktop: game clock is frozen while paused', await page.evaluate((t) => __tetris.game.time === t, frozen));
  await shot('pause');
  await page.click('#resume');
  await waitApp(page, 'playing');
  check('desktop: resume returns to play', true);

  // Clicking HUD furniture must never restart the run (regression: the HUD
  // once carried data-mode, which the mode-card click handler matched).
  const piecesNow = await page.evaluate(() => __tetris.game.stats.pieces);
  await page.click('#view-btn');
  await page.waitForTimeout(300);
  check('desktop: HUD buttons do not restart the game', await page.evaluate((n) => __tetris.game.stats.pieces === n && __tetris.app === 'playing', piecesNow));
  check('desktop: view button cycles the camera (dynamic -> flat)', await page.evaluate(() => __tetris.store.settings.view === 'flat'));
  await page.click('#pause-btn');
  await page.waitForSelector('#pause.show');
  check('desktop: pause button pauses', await page.evaluate(() => __tetris.app === 'paused'));
  await page.click('#resume');
  await waitApp(page, 'playing');

  await page.keyboard.press('KeyV');
  await page.keyboard.press('KeyV');
  await page.keyboard.press('KeyV');
  const view = await page.evaluate(() => __tetris.store.settings.view);
  check('desktop: V cycles the camera through all three views', view === 'flat', view);
  await page.waitForTimeout(1200);
  await shot('flat-view');

  // Top out deliberately and reach the results screen.
  await page.evaluate(() => {
    const g = __tetris.game;
    for (let y = 0; y < 19; y++) for (let x = 0; x < 10; x++) if (x !== y % 10) g.board[y * 10 + x] = 8;
  });
  for (let i = 0; i < 6 && (await page.evaluate(() => __tetris.app)) === 'playing'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('#results.show', { timeout: 30000 });
  check('desktop: topping out shows results', await page.evaluate(() => document.querySelector('#r-kicker').textContent.includes('Game over')));
  check('desktop: the score was recorded', await page.evaluate(() => __tetris.store.records.marathon.length === 1));
  await shot('results');

  // Settings persist across reloads.
  await page.click('#to-title');
  await waitApp(page, 'title');
  await page.click('#title [data-go="settings"]');
  await page.waitForSelector('#settings.show');
  await page.$eval('#set-das', (el) => { el.value = '120'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-tab="graphics"]');
  await page.click('.seg[data-setting="quality"] [data-value="medium"]');
  await shot('settings');
  await page.reload();
  await page.waitForFunction(() => window.__tetris && __tetris.renderer, null, { timeout: 30000 });
  const persisted = await page.evaluate(() => ({ das: __tetris.store.settings.das, view: __tetris.store.settings.view, quality: __tetris.renderer.qualityName, recs: __tetris.store.records.marathon.length }));
  check('desktop: settings and records survive a reload', persisted.das === 120 && persisted.view === 'flat' && persisted.quality === 'medium' && persisted.recs === 1, JSON.stringify(persisted));

  // Key rebinding: bind hard drop to KeyK and use it.
  await page.evaluate(() => { const r = __tetris.renderer; r.setQuality('low'); });
  await page.click('#title [data-go="settings"]');
  await page.click('[data-tab="controls"]');
  await page.click('.bind-row:nth-child(4) .key-slot');
  await page.keyboard.press('KeyK');
  check('desktop: rebinding writes the new key', await page.evaluate(() => __tetris.store.settings.bindings.hardDrop[0] === 'KeyK'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await waitApp(page, 'title');
  await startMode(page, 'sprint');
  await page.keyboard.press('KeyK');
  await page.waitForFunction(() => __tetris.game.stats.pieces === 1, null, { timeout: 20000 });
  check('desktop: rebound key performs a hard drop', true);

  check('desktop: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

/* ---------- phone ---------- */
{
  const { ctx, page, errors, shot } = await open({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  }, 'phone');
  await page.waitForTimeout(1000);
  await shot('title');
  await page.tap('[data-go="modes"]');
  await page.waitForSelector('#modes.show');
  await page.tap('[data-mode="ultra"]');
  await waitApp(page, 'playing');
  check('phone: on-screen controls are shown', await page.evaluate(() => !document.querySelector('#touch').hidden));

  const box = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const touch = document.querySelector('#touch').getBoundingClientRect();
    return { stageBottom: stage.bottom, touchTop: touch.top, stageW: stage.width, stageH: stage.height };
  });
  check('phone: playfield sits above the controls', box.stageBottom <= box.touchTop + 1 && box.stageW > 150 && box.stageH > 300, JSON.stringify(box));

  await page.tap('[data-act="rotateCW"]');
  await page.tap('[data-act="left"]');
  await page.tap('[data-act="hardDrop"]');
  await page.waitForFunction(() => __tetris.game.stats.pieces === 1, null, { timeout: 20000 });
  check('phone: touch buttons move, rotate and drop', true);
  await page.tap('[data-act="hold"]');
  await page.waitForTimeout(200);
  check('phone: touch hold works', await page.evaluate(() => __tetris.game.hold !== null));
  await page.waitForTimeout(600);
  await shot('game');
  await page.tap('#pause-btn');
  await page.waitForSelector('#pause.show');
  check('phone: pause button pauses', await page.evaluate(() => __tetris.app === 'paused'));
  check('phone: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
