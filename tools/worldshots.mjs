/* Renders every world mid-run into one contact sheet so palette pairings and
   scenery can be judged by eye rather than by assertion. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const OUT = process.argv[2] || path.join(ROOT, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(ROOT);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);

for (let w = 1; w <= 10; w++) {
  const lvl = (w - 1) * 10 + 5;
  await page.evaluate(async (n) => {
    const api = window.__blockstack;
    api.start(n);
    const g = api.game();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // build a tower of a believable height with a mix of hits and misses
    for (let i = 0; i < 9 && g.active; i++) {
      const a = g.active;
      const c = a.axis === 'x' ? g.top.x : g.top.z;
      const want = i % 3 === 0 ? 0.13 : a.speed * 1.6 / 60;
      let guard = 0;
      while (guard++ < 900) {
        const aa = api.game().active;
        if (!aa) break;
        const cc = aa.axis === 'x' ? api.game().top.x : api.game().top.z;
        if (Math.abs(aa.pos - cc) <= want) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      api.place();
      await sleep(60);
    }
  }, lvl);
  await page.waitForTimeout(360);
  await page.screenshot({ path: path.join(OUT, `world-${String(w).padStart(2, '0')}.png`) });
}

// stitch a sheet
const sheet = await page.evaluate(async () => {
  const files = Array.from({ length: 10 }, (_, i) => `../.shots/world-${String(i + 1).padStart(2, '0')}.png`);
  return files;
});
await b.close(); server.close();
console.log('wrote 10 world screenshots to', OUT);
