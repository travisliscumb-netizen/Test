// usage: node underworld/tools/perf-scenarios.mjs [path-to-index.html] [out.json]
// The CONTENT COMPLETE mobile baseline (M13), alongside tests/perf.mjs (calm street, night-storm pursuit with a gang
// fight, Valen Point, Cedar Fields). These are the other heavy everyday scenes, on the phone profile perf.mjs uses
// with PHONE=1 (800x400, touch, 4x CPU throttling, SwiftShader): downtown at noon on foot, a fast drive through
// downtown, the phone's full map open over the street, the casino floor, a jail cell. No physical iPhone is
// available here: wall ms/frame under SwiftShader is GPU-bound and only meaningful between builds; CPU update ms
// (game logic) and draw calls / triangles / live geometries are the numbers that carry over to a device.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(HERE, '..', 'index.html'));
const OUT = path.resolve(process.argv[3] || path.join(HERE, '..', '.runs', 'perf-scenarios.json'));
process.env.UW_FILE = file;
const { chromium, throughCourt } = await import('../tests/lib.mjs');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 400 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + file);
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.click('#btnNew');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 180000 });
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.save.settings.guide = false; g.player.health = 1e6; if (g.debug) g.debug.god = true; });
const settle = ms => new Promise(r => setTimeout(r, ms));
await settle(5000);
// the same measure as tests/perf.mjs: 8 s of real frames, then game logic alone (60 steps, median of 3), then render submit
const measure = () => page.evaluate(async () => {
  const g = window.game; const t0 = performance.now(), f0 = g.frame;
  await new Promise(r => setTimeout(r, 8000));
  const ms = (performance.now() - t0) / Math.max(1, g.frame - f0);
  const runs = []; for (let k = 0; k < 3; k++) { const u0 = performance.now(); for (let i = 0; i < 60; i++) g.update(1 / 60, 1 / 60); runs.push((performance.now() - u0) / 60); }
  runs.sort((a, b) => a - b);
  const r0 = performance.now(); for (let i = 0; i < 6; i++) g.render(1 / 60, 1 / 60); const ren = (performance.now() - r0) / 6;
  const info = g.renderer.info;
  return { msPerFrame: +ms.toFixed(1), updateMs: +runs[1].toFixed(2), renderMs: +ren.toFixed(1), calls: info.render.calls, tris: info.render.triangles, geo: info.memory.geometries, tex: info.memory.textures, peds: g.peds.peds.length, veh: g.vehicles.list.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
});
const R = {};
// 1. downtown at noon, on foot, traffic on: the Financial District's busiest block
await page.evaluate(() => { const g = window.game, P = window.__pv, c = P.ZONE_CENTRE.c, kp = P.nearestRoadPoint(c.x, c.z); g.env.time = 12; try { g.env.setWeather('clear', true); } catch {} g.traffic.enabled = true; g.resetPlayerState(kp.x + 4, kp.z + 4, 0); });
await settle(6000); R.downtownFoot = await measure();
// 2. a fast drive through downtown: a sports car carried along a GPS route across the district at ~30 m/s (the city
// streaming past, traffic and pedestrians round it), the way perf.mjs drives the track with an AI path
await page.evaluate(() => {
  const g = window.game, P = window.__pv, c = P.ZONE_CENTRE.c, a = P.nearestRoadPoint(c.x - 200, c.z - 200), z = P.nearestRoadPoint(c.x + 200, c.z + 200);
  const pts = [{ x: a.x, z: a.z }, ...P.gpsRoute(a.x, a.z, z.x, z.z)], v = g.vehicles.spawn('sports', a.x, a.z, 0, {});
  g.resetPlayerState(v.pos.x + 2, v.pos.z, 0); g.completeEnter(v);
  let i = 0, t = 0; window.__perfDrive = setInterval(() => { const p0 = pts[i], p1 = pts[i + 1]; if (!p1) { pts.reverse(); i = 0; t = 0; return; } const L = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1; t += 1.5 / L; if (t >= 1) { i++; t = 0; return; } v.pos.x = p0.x + (p1.x - p0.x) * t; v.pos.z = p0.z + (p1.z - p0.z) * t; v.h = Math.atan2(p1.x - p0.x, p1.z - p0.z); v.vel.set(0, 0); }, 50);
});
await settle(4000); R.downtownDrive = await measure();
await page.evaluate(() => { clearInterval(window.__perfDrive); const g = window.game; if (g.player.vehicle) g.exitVehicle(true); });
// 3. the phone's full map open over the street
await page.evaluate(() => { const g = window.game; g.uw.ui.open(); const m = document.querySelector('#empBody [data-act="app:map"]'); if (m) m.click(); else g.ui.toggleMap(true); });
await settle(3000); R.phoneMap = await measure(); R.phoneMap.mapOpen = await page.evaluate(() => !!window.game.mapOpen);
await page.evaluate(() => { const g = window.game; if (g.mapOpen) g.ui.toggleMap(false); while (g.ui.stack && g.ui.stack.length) g.ui.back(); });
// 4. the casino floor (interior: tables, slots, the Royale bank)
await page.evaluate(() => { const g = window.game; g.env.time = 22; g.police.clear(); g.content.enterCasino(); });
await settle(4000); R.casino = await measure(); R.casino.inside = await page.evaluate(() => !!window.game.content.interiors.cur);
await page.evaluate(() => { const g = window.game; if (g.content.interiors.cur) g.content.interiors.exit(true); });
// 5. a jail cell (a one-star arrest through the court; the jail HUD and the cell block)
await page.evaluate(() => { const g = window.game; g.uw.S.rap.cur = { pickpocket: 1 }; g.police.setLevel(1); g.onBusted(); });
await throughCourt(page);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
await settle(4000); R.jail = await measure();
R.errors = errs.slice(0, 5);
fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
console.log(path.basename(file) + ' [phone x4 CPU]', JSON.stringify(R));
await Promise.race([b.close(), new Promise(r => setTimeout(r, 4000))]);
process.exit(0);
