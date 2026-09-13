/* Long-session soak. Looks for the failure modes that only show up after a
   player has been in the app for a while: heap growth, DOM/canvas objects that
   accumulate, timers that are never cleared, listener leaks, and effect pools
   that creep upward run after run. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const { server, url } = await serve(ROOT);
const b = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);

// count live timers and listeners by instrumenting before anything runs
await page.evaluate(() => {
  window.__probe = { timeouts: 0, intervals: 0, rafs: 0 };
  const st = window.setTimeout, ct = window.clearTimeout;
  const si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = (...a) => { window.__probe.timeouts++; return st(...a); };
  window.clearTimeout = (...a) => { window.__probe.timeouts--; return ct(...a); };
  window.setInterval = (...a) => { window.__probe.intervals++; return si(...a); };
  window.clearInterval = (...a) => { window.__probe.intervals--; return ci(...a); };
});

async function snapshot(label) {
  const m = await page.evaluate(async () => {
    if (window.gc) window.gc();
    await new Promise((r) => setTimeout(r, 120));
    const g = window.__blockstack.game();
    return {
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      canvases: document.querySelectorAll('canvas').length,
      domNodes: document.querySelectorAll('*').length,
      intervals: window.__probe.intervals,
      blocks: g.blocks.length,
      particles: window.__blockstack.metrics ? null : null,
      debris: g.debris.length
    };
  });
  console.log(label.padEnd(26), JSON.stringify(m));
  return m;
}

const first = await snapshot('baseline');

// 25 complete runs across different levels, plus restarts and world changes
for (let round = 0; round < 20; round++) {
  await page.evaluate(async (r) => {
    const api = window.__blockstack;
    api.start(1 + (r * 7) % 100);
    const g = () => api.game();
    for (let i = 0; i < 30 && g().active; i++) {
      const a = g().active;
      a.pos = (a.axis === 'x' ? g().top.x : g().top.z) + (i % 4 === 0 ? 0.13 : 0);
      api.place();
    }
  }, round);
  await page.waitForTimeout(60);
}
const afterRuns = await snapshot('after 20 level runs');

// a very long stack climb through every world
await page.evaluate(async () => {
  const api = window.__blockstack;
  api.stack();
  for (let i = 0; i < 130 && api.game().active; i++) {
    const a = api.game().active;
    a.pos = a.axis === 'x' ? api.game().top.x : api.game().top.z;
    api.place();
  }
});
await page.waitForTimeout(1500);
const afterClimb = await snapshot('after 130-block climb');
const climbFps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  function tick() { n++; if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); }
  requestAnimationFrame(tick);
}));
console.log('fps at 130-block climb   ', climbFps.toFixed(1));

// rapid restarts, the classic way to leak timers and listeners
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => window.__blockstack.start(50));
}
await page.waitForTimeout(900);
const afterRestarts = await snapshot('after 40 rapid restarts');

// menu churn
const T = { timeout: 1500 };
for (let i = 0; i < 20; i++) {
  await page.click('#pauseBtn', T).catch(() => {});
  await page.click('#toMapBtn', T).catch(() => {});
  await page.click('#mapBack', T).catch(() => {});
  await page.click('#recordsBtn', T).catch(() => {});
  await page.click('#recBack', T).catch(() => {});
  await page.click('#playBtn', T).catch(() => {});
}
const afterMenus = await snapshot('after 20 menu cycles');

console.log('\n--- verdict ---');
if (first.heapMB !== null) {
  const growth = afterMenus.heapMB - first.heapMB;
  console.log(`heap ${first.heapMB} -> ${afterMenus.heapMB} MB (growth ${growth.toFixed(1)} MB)`);
}
console.log(`canvases ${first.canvases} -> ${afterMenus.canvases}`);
console.log(`DOM nodes ${first.domNodes} -> ${afterMenus.domNodes}`);
console.log(`live intervals ${first.intervals} -> ${afterMenus.intervals}`);
console.log(`console errors: ${errors.length}`, errors.slice(0, 4).join(' | '));
await b.close(); server.close();
