/* Frame-time profile: bot autoplay at high level with effects, optionally
   under CPU throttling. Prints p50 / p95 / worst frame and dropped-frame %.
     node tools/profile.mjs [throttle=1] [viewport=desktop|phone] */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const throttle = Number(process.argv[2] || 1);
const vp = process.argv[3] === 'phone' ? { width: 390, height: 844, deviceScaleFactor: 3 } : { width: 1440, height: 900, deviceScaleFactor: 2 };
const { server, url } = await serve(ROOT);
const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('prismfall.save', JSON.stringify({ v: 2, settings: { seenIntro: true } })));
await page.goto(`${url}/index.html?nosw`);
await page.waitForFunction(() => window.__prismfall?.app?.screenName === 'title');
if (throttle > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
const report = async (label) => {
  const r = await page.evaluate(() => new Promise((res) => {
    const d = []; let last = performance.now(); const end = last + 6000;
    const f = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(d); };
    requestAnimationFrame(f);
  }));
  r.sort((a, b) => a - b);
  const q = (p) => r[Math.min(r.length - 1, Math.floor(r.length * p))].toFixed(1);
  console.log(`${label.padEnd(10)} frames ${r.length}  p50 ${q(0.5)}ms  p95 ${q(0.95)}ms  worst ${r[r.length - 1].toFixed(1)}ms  >25ms ${(100 * r.filter((x) => x > 25).length / r.length).toFixed(1)}%`);
};
await page.waitForTimeout(1500);
await report('title');
await page.evaluate(() => window.__prismfall.app.go('play', { kind: 'classic', mode: 'marathon', startLevel: 12 }));
await page.waitForTimeout(2800);
await page.evaluate(() => { window.__prismfall.app.debug.autoplay = true; window.__prismfall.app.debug.autoT = 0; });
await report('gameplay');
await page.evaluate(() => { window.__prismfall.app.debug.autoplay = false; window.__prismfall.app.go('lab'); });
await page.waitForTimeout(800);
await page.click('#lab-generate');
await report('lab-run');
await browser.close(); server.close();
