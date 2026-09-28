// Visual QA: captures the key moments of the game to .shots/ for review.
//   NODE_PATH=$(npm root -g) node tools/shots.mjs [width height]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve, ROOT } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.argv[2]) || 1280;
const H = Number(process.argv[3]) || 720;
const tag = `${W}x${H}`;

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const shot = async (name) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url);
await wait(1500);
await shot('01-title');

await page.evaluate(() => window.__skifree.start(1991));
await wait(900);
await shot('02-start');

// Ski a while with a few turns.
await page.keyboard.down('ArrowRight');
await wait(350);
await page.keyboard.up('ArrowRight');
await wait(1600);
await page.keyboard.down('ArrowLeft');
await wait(500);
await page.keyboard.up('ArrowLeft');
await wait(1500);
await shot('03-skiing');

await page.keyboard.down('KeyF');
await wait(1800);
await shot('04-turbo');
await page.keyboard.up('KeyF');

// Summon the yeti right now.
await page.evaluate(() => {
  const g = window.__skifree.game;
  g.nextYetiAt = 0;
});
await wait(1400);
await shot('05-yeti-appears');
await wait(3500);
await shot('06-yeti-chase');

// Stop and get eaten.
await page.keyboard.down('ArrowLeft');
await wait(2500);
await page.keyboard.up('ArrowLeft');
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => window.__skifree.game.yeti?.state);
  if (st === 'eat') break;
  await wait(300);
}
await wait(700);
await shot('07-eaten');
await wait(1500);
await shot('08-celebrate');
await wait(1500);
await shot('09-gameover');

await page.keyboard.press('Escape');
await page.evaluate(() => window.__skifree.menu());
await page.click('[data-action="options"]');
await wait(300);
await shot('10-options');
await page.keyboard.press('Escape');
await page.click('[data-action="controls"]');
await wait(300);
await shot('11-controls');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
server.close();
