/* Captures gameplay under each theme / piece style and accessibility mode,
   so readability can be checked side by side. Output: .shots/look-*.png */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.shots');
const LOOKS = [
  ['a11y', { highContrast: true, glyphs: true }],
  ['glyphs', { glyphs: true }],
  ...['sunset', 'aurora', 'abyss', 'candy', 'noir', 'gilded'].map((t) => [`theme-${t}`, { theme: t }]),
  ...['jelly', 'glass', 'neon', 'retro', 'flat'].map((st) => [`style-${st}`, { style: st }])
];
const { server, url } = await serve(ROOT);
const browser = await playwright.chromium.launch();
for (const [name, settings] of LOOKS) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  await page.addInitScript((s) => localStorage.setItem('prismfall.save', JSON.stringify({ v: 2, settings: { seenIntro: true, ...s }, stats: { xp: 1e6 }, achievements: { tetris: 1, 'level-15': 1, 'lab-play': 1, 'lines-500': 1 } })), settings);
  await page.goto(`${url}/index.html?nosw`);
  await page.waitForFunction(() => window.__prismfall?.app?.screenName === 'title');
  await page.evaluate(() => window.__prismfall.app.go('play', { kind: 'classic', mode: 'marathon' }));
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.__prismfall.app.debug.autoplay = true; });
  await page.waitForTimeout(5200);
  await page.evaluate(() => { window.__prismfall.app.debug.autoplay = false; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `look-${name}.png`) });
  await ctx.close();
}
await browser.close(); server.close();
console.log('done');
