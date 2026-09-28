/* End-to-end playtest in Chromium. Plays the real page through real input
   (keyboard and touch), walks every major flow, checks persistence across a
   reload, and fails on any console error or page exception.

     node tests/playtest.mjs */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, '.shots');
fs.mkdirSync(SHOTS, { recursive: true });
const IGNORE = [/fonts\.(googleapis|gstatic)/, /ERR_CERT/, /net::ERR_/];

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

const { server, url } = await serve(ROOT);
const browser = await playwright.chromium.launch();

async function open(viewport, { touch = false, init = null } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (init) await page.addInitScript(init);
  await page.goto(`${url}/index.html?nosw`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__prismfall?.app?.screenName);
  return { ctx, page, errors };
}

const app = (page, fn, arg) => page.evaluate(fn, arg);
const screenName = (page) => app(page, () => window.__prismfall.app.screenName);
const game = (page) => app(page, () => { const g = window.__prismfall.app.screen?.session?.game; return g ? { phase: g.phase, pieces: g.stats.pieces, lines: g.stats.lines, score: g.stats.score, over: g.isOver } : null; });

/* Play N pieces through the real keyboard: the bot only decides; every
   rotation, move and drop is a key press delivered to the page. */
async function playByKeyboard(page, n) {
  await page.evaluate(async () => { window.__botmod = await import('/src/engine/bot.js'); });
  const placed = () => page.evaluate(() => window.__prismfall.app.screen?.session?.game?.stats.pieces ?? 0);
  const start = await placed();
  const deadline = Date.now() + 60000;
  while ((await placed()) - start < n && Date.now() < deadline) {
    const plan = await page.evaluate(() => {
      const s = window.__prismfall.app.screen?.session;
      const g = s?.game;
      if (!g || !g.active || g.phase !== 'playing') return null;
      s.__bot = s.__bot || new window.__botmod.Bot(g.rules, { skill: 1 });
      const p = s.__bot.plan(g);
      if (!p) return null;
      return { hold: p.hold, s: p.s, x: p.x, cur: g.active.s, curX: g.active.x, n: g.active.p.states.length };
    });
    if (!plan) { await page.waitForTimeout(120); continue; }
    if (plan.hold) { await page.keyboard.press('KeyC'); await page.waitForTimeout(30); continue; }
    const cw = (plan.s - plan.cur + plan.n) % plan.n;
    for (let k = 0; k < (cw === 3 ? 1 : cw); k++) await page.keyboard.press(cw === 3 ? 'KeyZ' : 'ArrowUp');
    const nowX = await page.evaluate(() => window.__prismfall.app.screen.session.game.active?.x);
    const dx = plan.x - (nowX ?? plan.x);
    for (let k = 0; k < Math.abs(dx); k++) await page.keyboard.press(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Space');
    await page.waitForTimeout(40);
  }
}

/* ------------------------------------------------ desktop, first run -- */
{
  const { ctx, page, errors } = await open({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  check('first run shows the welcome guide', (await screenName(page)) === 'help' && (await page.locator('h1', { hasText: 'Welcome' }).count()) === 1);
  await page.getByRole('button', { name: "Let's play" }).click();
  check('welcome leads to mode select', (await screenName(page)) === 'classic');

  await page.locator('#mode-marathon').click();
  check('marathon starts', (await screenName(page)) === 'play');
  await page.waitForTimeout(2800); // countdown
  await playByKeyboard(page, 24);
  const g1 = await game(page);
  check('keyboard play places pieces', g1 && g1.pieces >= 20, JSON.stringify(g1));
  check('keyboard play clears lines and scores', g1 && g1.lines >= 4 && g1.score > 500, JSON.stringify(g1));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-play.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape pauses', (await page.locator('.dialog', { hasText: 'Paused' }).count()) === 1);
  const pausedAt = await game(page);
  await page.waitForTimeout(1200);
  const stillPaused = await game(page);
  check('game is frozen while paused', pausedAt.pieces === stillPaused.pieces);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(200);
  check('resume closes the pause dialog', (await page.locator('.dialog', { hasText: 'Paused' }).count()) === 0);

  await app(page, () => window.__prismfall.app.screen.session.game.gameOver('test'));
  await page.waitForSelector('.dialog >> text=Game over', { timeout: 5000 });
  check('game over shows results', true);
  check('results record a personal best', (await page.locator('.newbest').count()) >= 1);
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.waitForTimeout(3000);
  const g2 = await game(page);
  check('play again starts a fresh game', g2 && g2.pieces === 0 && g2.phase === 'playing', JSON.stringify(g2));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit' }).click();
  await page.locator('.dialog .btn.danger').click();
  await page.waitForTimeout(300);
  check('quit returns to mode select', (await screenName(page)) === 'classic');

  /* ------------------------------------------------------------ Lab -- */
  await app(page, () => window.__prismfall.app.go('lab'));
  await page.waitForTimeout(400);
  await page.locator('.seg button', { hasText: /^2$/ }).click();
  await page.locator('#lab-generate').click();
  await page.waitForSelector('text=/Done: \\d of 2 designs accepted/', { timeout: 90000 });
  const accepted = await page.locator('.concept-card').count();
  check('design session produces accepted designs', accepted >= 1, `${accepted} cards`);
  const logLines = await page.locator('.feed .line').count();
  check('design log narrates the session', logLines >= 3, `${logLines} lines`);
  await page.screenshot({ path: path.join(SHOTS, 'e2e-lab-results.png') });

  await page.locator('.concept-card').first().click();
  check('opening a design shows its detail', (await screenName(page)) === 'detail');
  check('detail shows critic report and journal', (await page.locator('text=Critic report').count()) === 1 && (await page.locator('.journal .j').count()) >= 1);
  await page.locator('#save-design').click();
  await page.waitForTimeout(200);
  const savedCount = await app(page, () => window.__prismfall.app.save.data.lab.saved.length);
  check('saving adds the design to the collection', savedCount === 1);
  await page.screenshot({ path: path.join(SHOTS, 'e2e-detail.png') });

  await page.locator('#play-design').click();
  await page.waitForTimeout(2800);
  await playByKeyboard(page, 10);
  const g3 = await game(page);
  check('a Lab design is playable with the keyboard', g3 && g3.pieces >= 6, JSON.stringify(g3));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-lab-play.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit' }).click();
  await page.locator('.dialog .btn.danger').click();
  await page.waitForTimeout(300);
  check('quitting a Lab game returns to the design', (await screenName(page)) === 'detail');

  await page.getByRole('button', { name: 'Modify' }).click();
  check('modify opens the editor', (await screenName(page)) === 'editor');
  await page.locator('.editor-grid button[aria-pressed="false"], .hex-editor button[aria-pressed="false"]').first().click();
  await page.waitForTimeout(250);
  check('editing marks the design untested', (await page.locator('.verdict.untested').count()) >= 1);
  if (await page.locator('text=Not playable yet').count()) {
    check('invalid edits are explained, not crashed', true);
    // Undo the edit and continue with a valid design.
    await page.locator('#undo-edit').click();
    await page.waitForTimeout(250);
    check('undo restores the previous shape', (await page.locator('text=Not playable yet').count()) === 0);
  }
  const valid = await page.locator('text=Valid: safe to play and test').count();
  check('the edited design validates', valid === 1);
  if (valid) {
    await page.locator('#test-design').click();
    await page.waitForFunction(() => !document.querySelector('#test-design')?.textContent.includes('Testing'), null, { timeout: 60000 });
    check('re-testing an edited design returns a verdict', (await page.locator('.verdict:not(.untested)').count()) >= 1);
  }
  await page.getByRole('button', { name: 'Save as new' }).click();
  await page.waitForTimeout(300);
  check('an edited design saves as a new design', (await screenName(page)) === 'detail' && (await app(page, () => window.__prismfall.app.save.data.lab.saved.length)) === 2);

  /* ------------------------------------------------------- settings -- */
  await app(page, () => window.__prismfall.app.go('settings', { tab: 'access' }));
  await page.locator('button[aria-label="High contrast"]').click();
  check('high contrast applies immediately', await page.evaluate(() => document.body.classList.contains('hc')));
  await page.locator('button[aria-label="High contrast"]').click();
  await app(page, () => window.__prismfall.app.go('settings', { tab: 'controls' }));
  await page.locator('button[aria-label^="Hold: C"]').click();
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(100);
  const holdKeys = await app(page, () => window.__prismfall.app.save.settings.keys.hold);
  check('key rebinding works', holdKeys[0] === 'KeyV', JSON.stringify(holdKeys));
  await app(page, () => window.__prismfall.app.save.flush());

  /* ------------------------------------------------------ persistence -- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__prismfall?.app?.screenName === 'title');
  const persisted = await app(page, () => {
    const d = window.__prismfall.app.save.data;
    return { saved: d.lab.saved.length, record: d.records.marathon.length, hold: d.settings.keys.hold[0], games: d.stats.games };
  });
  check('progress persists across reload', persisted.saved >= 1 && persisted.record >= 1 && persisted.hold === 'KeyV' && persisted.games === 1 /* quit games are deliberately not recorded */, JSON.stringify(persisted));
  await app(page, () => window.__prismfall.app.go('progress'));
  check('records appear on the progress screen', (await page.locator('.scores-table tbody tr').count()) >= 1);

  check('desktop run had no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/* -------------------------------------------------- phone with touch -- */
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, { touch: true, init: () => localStorage.setItem('prismfall.save', JSON.stringify({ v: 2, settings: { seenIntro: true } })) });
  await app(page, () => window.__prismfall.app.go('play', { kind: 'classic', mode: 'sprint' }));
  await page.waitForTimeout(2800);
  check('touch controls are shown on phones', await page.locator('.touch.on').isVisible());
  for (let i = 0; i < 6; i++) {
    await page.locator('.touch-btn[aria-label="Move left"]').tap();
    await page.locator('.touch-btn[aria-label="Hard drop"]').tap();
  }
  const g = await game(page);
  check('touch buttons play the game', g && g.pieces >= 6, JSON.stringify(g));
  const box = await page.locator('.well-frame canvas').boundingBox();
  const before = await app(page, () => window.__prismfall.app.screen.session.game.active?.s);
  await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.waitForTimeout(80);
  const after = await app(page, () => window.__prismfall.app.screen.session.game.active?.s);
  check('tapping the well rotates', before !== after || before === undefined, `${before} -> ${after}`);
  const fits = await page.evaluate(() => {
    const r = document.querySelector('.well-frame').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
  });
  check('phone layout fits with no horizontal scroll', fits);
  await page.screenshot({ path: path.join(SHOTS, 'e2e-phone-play.png') });
  check('phone run had no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/* --------------------------------------------------- corrupted save -- */
{
  const { ctx, page, errors } = await open({ width: 1024, height: 700 }, { init: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('prismfall.save', '{"v":2,"settings":{"theme":'); } } });
  await page.waitForTimeout(1200);
  check('a corrupted save is backed up and replaced', await page.evaluate(() => localStorage.getItem('prismfall.save.corrupt') === '{"v":2,"settings":{"theme":'));
  check('the player is told, calmly', (await page.locator('.toast', { hasText: 'Save data reset' }).count()) === 1);
  check('the game still works after corruption', ['help', 'title'].includes(await screenName(page)));
  check('corrupted-save run had no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall playtest checks passed');
process.exit(failures ? 1 : 0);
