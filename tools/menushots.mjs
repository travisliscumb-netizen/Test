/* Captures the menu, result and world-complete screens for visual review. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const OUT = path.join(ROOT, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(ROOT);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'm1-title.png') });

// seed some progress so the map and records have something to show
await page.evaluate(() => {
  const raw = {
    v: 1, highest: 24, completed: 23,
    levels: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [i + 1, {
      crowns: [3, 2, 3, 1, 2, 3, 2, 2, 3, 3][i % 10], score: 1200 + i * 130,
      perfects: 6 + (i % 5), combo: 4 + (i % 6), remainPct: 0.6 + (i % 4) * 0.1, endless: i === 9 ? 12 : 0
    }])),
    records: { totalPerfects: 214, bestCombo: 14, smallest: 0.09, totalRuns: 61, totalBlocks: 780, bestScore: 4820, bestEndless: 12, recoveries: 19 },
    achievements: { 'first-perfect': 1, triple: 1, 'ten-perfect': 1, 'first-boss': 1, 'world-clear': 1, comeback: 1 },
    settings: { sound: true, music: true, haptics: true }
  };
  localStorage.setItem('blockstack.save.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'm2-title-progress.png') });
await page.click('#mapBtn'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'm3-map.png') });
await page.click('#mapBack'); await page.click('#recordsBtn'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'm4-records.png') });

// drive level 10 to a boss clear so the result + world-complete screens render
await page.click('#recBack');
await page.evaluate(async () => {
  const api = window.__blockstack;
  api.start(10);
  const g = () => api.game();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0;
  while (n < api.state().cfg.target && g().active && n < 60) {
    const a = g().active;
    const c = a.axis === 'x' ? g().top.x : g().top.z;
    let guard = 0;
    while (guard++ < 900) {
      const aa = g().active; if (!aa) break;
      const cc = aa.axis === 'x' ? g().top.x : g().top.z;
      if (Math.abs(aa.pos - cc) <= aa.speed * 1.6 / 60) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    api.place(); n++; await sleep(40);
  }
  api.finish();
});
await page.waitForTimeout(1100);
await page.screenshot({ path: path.join(OUT, 'm5-result-boss.png') });
await page.click('#resPrimary'); await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, 'm6-world-complete.png') });
await b.close(); server.close();
console.log('menu screenshots written');
