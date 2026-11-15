/* Captures of the island (Operation Blackgate): node underworld/tools/isle-shots.mjs <out dir> [name prefixes…]
   ISLE_DPR=2 for presentation shots. Free-camera scenes park the player under the view (the island's tiles and the
   city's chunks stream round the player) and aim the camera by hand; `clear` thins the haze for the long views. */
import fs from 'node:fs'; import path from 'node:path';
import { launch, open, boot } from '../tests/lib.mjs';
const OUT = path.resolve(process.argv[2] || 'isle-shots'), ONLY = process.argv.slice(3), DPR = +(process.env.ISLE_DPR || 1), FILE_Q = +(process.env.ISLE_Q || 2);
fs.mkdirSync(OUT, { recursive: true });
const want = n => !ONLY.length || ONLY.some(p => n.startsWith(p));
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR });
await boot(page, false);
await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
await page.click('#btnNew', { timeout: 120000 });
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 240000 });
await page.evaluate(q => {
  const g = window.game; g.events.cool = 1e9; g.save.settings.guide = false; g.police.enabled = false; g.player.health = 1e6; if (g.debug) g.debug.god = true;
  g.quality.mode = q; g.quality.setMode(q);
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const c = window.__cam; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } };
  // (a long view from high up: `near` pushes the near plane out, or the far shore shimmers against the sea)
  let n0 = g.camera.near; Object.defineProperty(g.camera, 'near', { get: () => window.__near || n0, set: v => { n0 = v; } });
  const E = g.env.update.bind(g.env); g.env.update = (...a) => { E(...a); if (window.__clear) { g.scene.fog.density = window.__clear; g.scenery.water.material.uniforms.uFogDen.value = window.__clear; } };
}, FILE_Q);
const frames = async n => { const f0 = await page.evaluate(() => window.game.frame); await page.waitForFunction(t => window.game.frame >= t, f0 + n, { timeout: Math.max(240000, n * 2500), polling: 50 }); };
const hud = on => page.evaluate(on => { for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip', 'zoneCard', 'objective']) { const el = document.getElementById(id); if (el) el.style.visibility = on ? '' : 'hidden'; } }, on);
async function view(name, px, pz, cam, o = {}) {
  if (!want(name)) return;
  await page.evaluate(([px, pz, cam, o]) => {
    const g = window.game; if (g.player.vehicle) g.exitVehicle(true);
    g.resetPlayerState(px, pz, 0); g.env.time = o.time ?? 13; try { g.env.setWeather('clear', true); } catch {}
    window.__cam = cam; window.__clear = o.clear || 0; window.__near = o.near || 0; g.camera.updateProjectionMatrix(); window.__pv && (g.fleet.live.clear(), g.fleet.update(px, pz));
    for (let k = 0; k < 40; k++) g.chunks.update(px, pz, g.frame + k);
    for (let k = 0; k < 60; k++) g.isleScene.update(px, pz);
  }, [px, pz, cam, o]);
  await hud(false); await frames(o.settle || 30);
  const st = await page.evaluate(() => { const g = window.game, i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, tiles: g.isleScene.tiles.size, trees: g.isleScene.stats.trees, veh: g.vehicles.list.length }; });
  await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 240000 });
  console.log('shot', name, JSON.stringify(st));
}
export { page, view, frames, hud, OUT, b, errors, want };
if (!process.env.ISLE_LIB) {
  await view('01-island-overview', 480, 300, [300, 3500, 1700, 300, 0, -100], { clear: 0.00006, settle: 50, near: 40 });
  await view('02-city-and-bay', 480, 480, [-1500, 420, 1500, 300, 0, 350], { clear: 0.00022 });
  await view('03-highlands', 300, -900, [1500, 520, 300, 300, 120, -1600], { clear: 0.00025 });
  await view('04-airport', 600, 2000, [600, 330, 1500, 600, 0, 2200], { clear: 0.0003 });
  await view('05-airport-apron', 1050, 1985, [1010, 9, 2030, 1070, 3, 1940]);
  await view('06-blackgate-bridge', -1085, 900, [-880, 34, 1010, -1100, 14, 500]);
  await view('07-tunnel', -1870, -1010, [-1850, 15.5, -985, -1915, 10, -1160]);
  await view('08-mount-valen-road', 520, -1560, [640, 205, -1480, 350, 240, -1790], { clear: 0.0004 });
  await view('09-crestmoor-ridge', 140, -600, [210, 96, -470, 60, 62, -640]);
  await view('10-valen-point-pits', 1575, 560, [1592, 7, 610, 1568, 1, 520]);
  await view('11-proving-ground', 920, 1528, [880, 12, 1548, 1100, 2, 1520]);
  await view('12-saltmarsh', -470, 1140, [-380, 30, 1250, -520, 2, 1050]);
  await view('13-lake-valen', 1650, -640, [1560, 60, -520, 1700, 0, -900], { clear: 0.0004 });
  await view('14-lighthouse', 1530, -2740, [1640, 30, -2660, 1500, 16, -2796]);
  console.log('errors', errors.length, errors.slice(0, 5).join('\n').slice(0, 2000));
  await b.close(); process.exit(0);
}
