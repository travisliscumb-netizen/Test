/* Frame-cost probe: same viewport and quality for any build.
   Usage: node underworld/tests/perf.mjs path/to/index.html */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from './lib.mjs';
const file = path.resolve(process.argv[2] || 'index.html');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 480, height: 270 } });
const TD = process.env.THREE_DIR;
if (TD) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => { const fp = path.join(TD, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '')); route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }); });
await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
const page = await ctx.newPage();
await page.goto('file://' + file);
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await page.click('#btnNew');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await new Promise(r => setTimeout(r, 5000));
const r = await page.evaluate(async () => {
  const g = window.game; const t0 = performance.now(), f0 = g.frame;
  await new Promise(r => setTimeout(r, 8000));
  const ms = (performance.now() - t0) / Math.max(1, g.frame - f0);
  const u0 = performance.now(); for (let i = 0; i < 30; i++) g.update(0.016, 0.016); const upd = (performance.now() - u0) / 30;
  const r0 = performance.now(); for (let i = 0; i < 10; i++) g.render(0.016, 0.016); const ren = (performance.now() - r0) / 10;
  const info = g.renderer.info.render;
  return { msPerFrame: +ms.toFixed(1), updateMs: +upd.toFixed(2), renderMs: +ren.toFixed(1), calls: info.calls, tris: info.triangles, peds: g.peds.peds.length, veh: g.vehicles.list.length, groups: g.uw ? g.uw.gangs.groups.size : 0 };
});
console.log(path.basename(path.dirname(file)), JSON.stringify(r));
await Promise.race([b.close(), new Promise(r => setTimeout(r, 4000))]);
process.exit(0);
