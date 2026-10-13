/* Visual pass: renders key scenes to PNGs (SHOT_DIR, default underworld/.shots). */
import { launch, open, frames, startNew } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const DIR = process.env.SHOT_DIR || path.resolve('.shots');
fs.mkdirSync(DIR, { recursive: true });
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 960, height: 540 } });
await startNew(page);
await page.evaluate(() => window.game.quality.setMode(1));
const shot = async (name) => { await frames(page, 25); await page.screenshot({ path: path.join(DIR, name + '.png') }); console.log('shot', name); };
const set = (fn, arg) => page.evaluate(fn, arg);
await set(() => { const g = window.game; g.env.time = 10; g.env.setWeather('clear', true); });
await shot('01-start');
// a gang hangout: stand near the nearest Vipers corner
await set(() => { const g = window.game, uw = g.uw; const i = uw.owner.findIndex((o, k) => o === 'vipers' && uw.T[k].zone === 'o'); const t = uw.T[i]; window.__t = t; g.resetPlayerState(t.hang.x + 60, t.hang.z, -Math.PI / 2); g.cam.yaw = -Math.PI / 2; });
await frames(page, 30);
await set(() => { const g = window.game, t = window.__t; g.resetPlayerState(t.hang.x + Math.sin(t.hang.h) * 7, t.hang.z + Math.cos(t.hang.h) * 7, t.hang.h + Math.PI); g.cam.yaw = t.hang.h + Math.PI; g.cam.pitch = -0.12; });
await frames(page, 40);
await shot('02-gang-corner');
// boss at HQ
await set(() => { const g = window.game, L = g.uw.loc('hq', 'bellcourt'); g.resetPlayerState(L.x + 70, L.z, 0); });
await frames(page, 30);
await set(() => { const g = window.game, L = g.uw.loc('hq', 'bellcourt'); g.resetPlayerState(L.x + Math.sin(L.h) * 5, L.z + Math.cos(L.h) * 5, L.h + Math.PI); g.cam.yaw = L.h + Math.PI; g.cam.pitch = -0.1; });
await frames(page, 60);
await shot('03-boss-hq');
// night on the strip, in the rain
await set(() => { const g = window.game, L = g.uw.loc('prop', 'club'); g.env.time = 22.5; g.env.setWeather('heavy', true); g.resetPlayerState(L.x + Math.sin(L.h) * 6, L.z + Math.cos(L.h) * 6, L.h + Math.PI); g.cam.yaw = L.h + Math.PI + 0.4; });
await frames(page, 80);
await shot('04-strip-night-rain');
// a car close-up (new classes)
await set(() => { const g = window.game, p = g.player; g.env.time = 17.5; g.env.setWeather('clear', true); g.resetPlayerState(5 * 80, 6 * 80 + 40, 0); for (const [t, dx] of [['luxury', -3], ['gangcar', 0], ['utility', 3]]) { const v = g.vehicles.spawn(t, p.pos.x + dx, p.pos.z + 7, Math.PI / 2 + 0.4, { parked: true }); v.touched = true; } g.cam.yaw = 0; g.cam.pitch = -0.15; });
await frames(page, 40);
await shot('05-new-cars');
// characters line-up
await set(() => { const g = window.game, p = g.player, V = window.__pv, groundY = V.groundY; g.peds.enabled = false; g.peds.peds.length = 0; const looks = [V.factionLook('vipers'), V.factionLook('tidewater'), V.factionLook('velvet'), V.factionLook('bellcourt'), V.factionLook('glasshouse'), V.copLook(), V.randomLook(), V.randomLook()]; looks.forEach((L, k) => { const q = g.peds.make('dummy', L); q.x = p.pos.x - 3.5 + k; q.z = p.pos.z + 2.6; q.y = groundY(q.x, q.z); q.h = Math.PI; q.state = 'free'; q.keep = true; q.brain = c => { c.vx = 0; c.vz = 0; c.h = Math.PI; }; g.peds.peds.push(q); }); g.cam.yaw = 0; g.cam.pitch = -0.05; g.cam.mode = 1; });
await frames(page, 30);
await shot('06-characters');
await set(() => { const g = window.game; g.cam.mode = 0; g.peds.peds.length = 0; g.peds.enabled = true; });
// empire screens
await set(() => window.game.uw.ui.open('overview')); await shot('07-empire-overview');
await set(() => { window.game.uw.ui.selTurf = 14; window.game.uw.ui.open('map'); }); await shot('08-empire-map');
await set(() => window.game.uw.ui.open('market')); await shot('09-empire-market');
await set(() => { while (window.game.ui.stack.length) window.game.ui.back(); });
await page.keyboard.press('KeyM'); await shot('10-bigmap-overlay'); await page.keyboard.press('KeyM');
// jail
await set(() => { const g = window.game; g.police.setLevel(2); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading, null, { timeout: 120000 });
await frames(page, 40);
await shot('11-jail');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await b.close();
