/* Captures every remaining screen state for the final design review. */
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
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR', m.text()); });
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);
await page.evaluate(() => {
  localStorage.setItem('blockstack.save.v1', JSON.stringify({
    v: 1, highest: 24, completed: 23,
    levels: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [i + 1, {
      crowns: [3, 2, 3, 1, 2, 3, 2, 2, 3, 3][i % 10], score: 1200 + i * 130,
      perfects: 6, combo: 5, remainPct: 0.7, endless: 0 }])),
    records: { totalPerfects: 214, bestCombo: 14, smallest: 0.09, totalRuns: 61,
      totalBlocks: 780, bestScore: 4820, bestEndless: 12, recoveries: 19, bestStack: 47 },
    achievements: { 'first-perfect': 1, triple: 1, 'first-boss': 1, comeback: 1 },
    settings: { sound: true, music: false, haptics: true }
  }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);
await page.waitForTimeout(1200);

await page.click('#recordsBtn'); await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 's1-records.png') });
await page.click('#recBack'); await page.waitForTimeout(300);

// pause sheet mid-run
await page.evaluate(async () => {
  const api = window.__blockstack; api.start(24);
  for (let i = 0; i < 6 && api.game().active; i++) {
    const a = api.game().active;
    a.pos = (a.axis === 'x' ? api.game().top.x : api.game().top.z) + (i === 2 ? 0.12 : 0);
    api.place();
  }
});
await page.waitForTimeout(700);
await page.click('#pauseBtn'); await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 's2-pause.png') });
await page.click('#resumeBtn'); await page.waitForTimeout(200);

// failure state
await page.evaluate(async () => {
  const api = window.__blockstack;
  const g = api.game();
  if (g.active) { g.active.pos = (g.active.axis === 'x' ? g.top.x : g.top.z) + 5; api.place(); }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 's3-fail.png') });

// first-run title (no progress)
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, 's4-first-run.png') });

// the very first seconds of level 1
await page.click('#playBtn');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 's5-level1.png') });

await b.close(); server.close();
console.log('screens written');
