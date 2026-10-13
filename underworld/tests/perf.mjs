/* Frame-cost probe. Same viewport and quality for any build so builds can be compared.
   Reports, for a calm street and a busy scene (night storm, 3-star pursuit, gang fight):
   wall ms/frame (SwiftShader: GPU-bound and only meaningful relative to another build),
   CPU update ms (game logic only), render submit ms, draw calls, triangles, live geometries /
   textures, entity counts. PHONE=1 adds a phone profile: touch, 4x CPU throttling, 800x400.
   Usage: node underworld/tests/perf.mjs path/to/index.html
          THREE_DIR=/path/to/three/package node underworld/tests/perf.mjs port-valen/index.html */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from './lib.mjs';
const file = path.resolve(process.argv[2] || 'underworld/index.html');
const PHONE = !!process.env.PHONE;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(PHONE ? { viewport: { width: 800, height: 400 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 480, height: 270 } });
const TD = process.env.THREE_DIR;
if (TD) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => { const fp = path.join(TD, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', '')); route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }); });
await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + file);
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
const cdp = await ctx.newCDPSession(page);
if (PHONE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
if (!PHONE) await page.evaluate(() => window.game.quality.setMode(0));
await page.click('#btnNew');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 180000 });
await new Promise(r => setTimeout(r, 5000));
const measure = () => page.evaluate(async () => {
  const g = window.game; const t0 = performance.now(), f0 = g.frame;
  await new Promise(r => setTimeout(r, 8000));
  const ms = (performance.now() - t0) / Math.max(1, g.frame - f0);
  // CPU: game logic only, 60 steps of 1/60 s, median of 3 runs
  const runs = []; for (let k = 0; k < 3; k++) { const u0 = performance.now(); for (let i = 0; i < 60; i++) g.update(1 / 60, 1 / 60); runs.push((performance.now() - u0) / 60); }
  runs.sort((a, b) => a - b);
  const r0 = performance.now(); for (let i = 0; i < 6; i++) g.render(1 / 60, 1 / 60); const ren = (performance.now() - r0) / 6;
  const info = g.renderer.info;
  return { msPerFrame: +ms.toFixed(1), updateMs: +runs[1].toFixed(2), renderMs: +ren.toFixed(1), calls: info.render.calls, tris: info.render.triangles, geo: info.memory.geometries, tex: info.memory.textures, peds: g.peds.peds.length, veh: g.vehicles.list.length, groups: g.uw ? g.uw.gangs.groups.size : 0, parts: g.fx.smoke.n + g.fx.glow.n, q: g.quality.level };
});
const calm = await measure();
await page.evaluate(() => {
  const g = window.game;
  g.env.time = 23; try { g.env.setWeather('storm', true); } catch { try { g.env.setWeather('rain', true); } catch {} }
  g.police.setLevel(3);
  if (g.uw) { const uw = g.uw, i = uw.owner.findIndex(o => o && o !== 'pc'); const t = uw.T[i]; g.resetPlayerState(t.hang.x + 6, t.hang.z + 6, 0); g.player.health = 1e6; if (g.debug) g.debug.god = true; }
});
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => { const g = window.game; if (g.uw) for (const gr of g.uw.gangs.groups.values()) if (gr.members.length) { g.uw.onPedHit(gr.members[0], 'light', 1); break; } });
const busy = await measure();
console.log(path.basename(path.dirname(file)) + (PHONE ? ' [phone x4 CPU]' : ''), JSON.stringify({ calm, busy, errors: errs.slice(0, 3) }));
await Promise.race([b.close(), new Promise(r => setTimeout(r, 4000))]);
process.exit(0);
