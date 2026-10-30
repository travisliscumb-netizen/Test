/* Visual QA captures for the graphics overhaul: the same scenes, from the same cameras, at the same time of day and
   weather, for any build, so a "before" and an "after" set line up picture for picture.

   node underworld/tools/vqa-shots.mjs <index.html> <out dir> [scene,scene,...]

   World scenes are shot at 1024x576 on the Medium preset (the phone default) (desktop profile); the HUD, phone and map scenes on an
   iPhone-sized touch viewport (844x390 at 2x). Free-camera scenes park the player under the view so the chunks
   stream in, and aim the camera by hand; play scenes (interiors, jail, pursuit, the player close up) use the game's
   own camera. Each scene's stats (draw calls, triangles, geometries, textures) go to <out dir>/stats.json.
   SwiftShader renders it: colours, geometry and layout are real, frame times are not. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
const { chromium } = playwright;
const [fileArg, outArg, onlyArg] = process.argv.slice(2);
if (!fileArg || !outArg) { console.error('usage: vqa-shots.mjs <index.html> <out dir> [scenes]'); process.exit(2); }
const FILE = path.resolve(fileArg), OUT = path.resolve(outArg), ONLY = onlyArg ? onlyArg.split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const want = n => !ONLY || ONLY.some(o => n === o || n.startsWith(o + '-') || n.startsWith(o));
// look-dev: VQA_QUICK=1 shoots at half size with a short settle, for fast iteration (not for comparisons)
const QUICK = !!process.env.VQA_QUICK, VW = QUICK ? 640 : 1024, VH = QUICK ? 360 : 576, SETTLE = QUICK ? 0.4 : 1;
const stats = fs.existsSync(path.join(OUT, 'stats.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'stats.json'), 'utf8')) : {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function session(opts) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
  await ctx.setOffline(true);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message.split('\n')[0]); });
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|swiftshader|WebGL-|Automatic fallback|GroupMarkerNotSet/i.test(m.text())) console.log('CONSOLE', m.type(), m.text().slice(0, 400)); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 300000 });
  // the loading screen fades after the first rendered frames (slow on software GL): wait for it, then click
  await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
  await page.click('#btnNew', { timeout: 120000 });
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 240000 });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => {
    const g = window.game; g.events.cool = 1e9; g.save.settings.guide = false; g.police.enabled = false; g.player.health = 1e6; if (g.debug) g.debug.god = true;
    g.quality.mode = 1; g.quality.setMode(1);
    // a free camera when window.__cam is set; the game's own camera otherwise
    const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const c = window.__cam; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } };
  });
  return { ctx, page, ev, errors };
}
// a heavy scene on software GL (a three-star pursuit at night) can take over a second a frame: allow 2 s each
const frames = async (page, n) => { const f0 = await page.evaluate(() => window.game.frame); await page.waitForFunction(t => window.game.frame >= t, f0 + n, { timeout: Math.max(240000, n * 2000), polling: 50 }); };
async function shot(S, name, prep, settle = 40) {
  if (!want(name)) return;
  try {
    await S.ev(prep.fn, prep.arg);
    if (prep.after) await prep.after(S);
    await frames(S.page, Math.max(6, Math.round(settle * SETTLE)));
    const st = await S.ev(() => { const g = window.game, i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, peds: g.peds.peds.length, veh: g.vehicles.list.length, interior: !!(g.content.interiors && g.content.interiors.cur) }; });
    await S.page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 240000 });
    stats[name] = st; console.log('shot', name, JSON.stringify(st));
  } catch (e) { console.log('FAILED', name, e.message.split('\n')[0]); stats[name] = { error: e.message.split('\n')[0] }; }
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
}
// a free-camera view: the player parked below it (chunks stream around the player), time, weather, HUD hidden
const view = (px, pz, cam, time = 12, weather = 'clear') => ({ fn: ([px, pz, cam, time, weather]) => {
  const g = window.game; if (g.content.interiors && g.content.interiors.cur) g.content.interiors.exit(true);
  if (g.player.vehicle) g.exitVehicle(true);
  g.resetPlayerState(px, pz, 0); g.env.time = time; try { g.env.setWeather(weather, true); g.env.wet = g.env.rain; } catch {} // the ground soaked through, as after a while in the rain
  for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip', 'zoneCard', 'objective']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
  window.__cam = cam; for (let k = 0; k < 40; k++) g.chunks.update(px, pz, g.frame + k);
}, arg: [px, pz, cam, time, weather] });
const hud = on => () => { for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip', 'zoneCard', 'objective']) { const el = document.getElementById(id); if (el) el.style.visibility = on ? '' : 'hidden'; } };

// ---------------------------------------------------------------- the world (desktop profile)
{
  const S = await session({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await shot(S, 'w01-downtown-street-day', view(560, 410, [563.5, 1.8, 418, 560, 9, 330], 12));
  await shot(S, 'w02-downtown-street-night', view(560, 410, [563.5, 1.8, 418, 560, 9, 330], 22));
  await shot(S, 'w03-downtown-aerial-day', view(540, 400, [720, 150, 600, 520, 0, 380], 15));
  await shot(S, 'w04-downtown-aerial-night', view(540, 400, [720, 150, 600, 520, 0, 380], 22.5));
  await shot(S, 'w05-downtown-rain', view(560, 410, [563.5, 1.8, 418, 560, 9, 330], 17, 'heavy'));
  await shot(S, 'w06-old-quarter', view(120, 480, [34, 2.0, 483.5, 140, 6, 478], 10));
  await shot(S, 'w07-old-quarter-aerial', view(120, 440, [-20, 70, 560, 120, 0, 420], 10));
  await shot(S, 'w08-industrial', view(800, 120, [870, 36, 30, 800, 0, 150], 14));
  await shot(S, 'w09-industrial-street', view(800, 150, [803.5, 2.0, 70, 800, 6, 160], 14));
  await shot(S, 'w10-linden-hills', view(80, 760, [83.5, 2.0, 690, 80, 4, 790], 9));
  await shot(S, 'w11-crestmoor', view(120, 60, [300, 60, 180, 120, 0, 40], 16));
  await shot(S, 'w12-waterfront', view(950, 620, [976, 3, 680, 975, 2, 520], 18));
  await shot(S, 'w13-docklands-aerial', view(880, 640, [1060, 80, 760, 880, 0, 620], 13));
  await shot(S, 'w14-park', view(280, 240, [420, 60, 330, 280, 0, 240], 11));
  await shot(S, 'w15-curved-roads', view(400, 720, [480, 90, 820, 400, 0, 700], 12));
  await shot(S, 'w16-cedar-fields', view(300, 1100, [300, 22, 1058, 300, 0, 1200], 11));
  await shot(S, 'w17-cedar-fields-ground', view(220, 1180, [200, 2.2, 1150, 260, 1, 1250], 16));
  await shot(S, 'w18-valen-point', view(1650, 520, [1480, 60, 520, 1750, 0, 500], 14));
  // Valen Point's pit straight: aimed at the track start from the game's own data
  await shot(S, 'w19-valen-point-pits', { fn: () => { const g = window.game, P = window.__pv, s = P.vpCheckpoints({ laps: 1 }).start; g.resetPlayerState(s.x, s.z, 0); g.env.time = 15; window.__cam = [s.x + 25, 8, s.z - 40, s.x, 2, s.z + 20]; for (let k = 0; k < 40; k++) g.chunks.update(s.x, s.z, g.frame + k); } });
  await shot(S, 'w20-skyline-dusk', view(480, 480, [-60, 40, 1000, 480, 40, 480], 19.2));
  await shot(S, 'w21-downtown-night-rain', view(560, 410, [563.5, 1.8, 418, 560, 9, 330], 22, 'rain'));
  // vehicles on the causeway: every ordinary model, then the ten one-offs
  const lineup = (types, tag) => ({ fn: ([types]) => {
    const g = window.game, z = 516, x0 = 1060; if (g.player.vehicle) g.exitVehicle(true);
    for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle) g.vehicles.despawn(v);
    g.traffic.enabled = false; g.resetPlayerState(x0 + 40, z + 14, 0); g.env.time = 13; try { g.env.setWeather('clear', true); } catch {}
    types.forEach((t, i) => { const v = g.vehicles.spawn(t, x0 + (i % 6) * 8, z - Math.floor(i / 6) * 6.5, Math.PI / 2, { parked: true }); v.touched = true; v.locked = true; });
    window.__cam = [x0 + 20, 4.2, z + 14, x0 + 20, 0.6, z - 4];
    for (let k = 0; k < 30; k++) g.chunks.update(x0 + 20, z, g.frame + k);
  }, arg: [types] });
  const types = await S.ev(() => Object.entries(window.__pv.VEHICLES).filter(([k, s]) => !k.startsWith('u_')).map(([k]) => k));
  const uniq = await S.ev(() => Object.keys(window.__pv.VEHICLES).filter(k => k.startsWith('u_')));
  for (let r = 0; r * 12 < types.length; r++) await shot(S, `v0${r + 1}-vehicles`, lineup(types.slice(r * 12, r * 12 + 12)));
  await shot(S, 'v09-unique-cars', lineup(uniq));
  // close-ups of ordinary and unique cars (a 3/4 front view at eye height)
  const close = (t, n) => ({ fn: ([t]) => { const g = window.game, x = 1100, z = 516; for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle) g.vehicles.despawn(v); g.resetPlayerState(x + 12, z + 12, 0); g.env.time = 16.5; const v = g.vehicles.spawn(t, x, z, Math.PI / 2, { parked: true }); v.touched = true; window.__cam = [x + 4.6, 1.5, z + 4.2, x, 0.7, z]; }, arg: [t] });
  for (const t of ['sedan', 'sports', 'police', 'pickup', 'van']) await shot(S, `v10-car-${t}`, close(t));
  for (const t of uniq) await shot(S, `v11-unique-${t}`, close(t));
  // people: the player close up, a crowd at noon
  await shot(S, 'c01-player-front', { fn: () => { const g = window.game; if (g.player.vehicle) g.exitVehicle(true); g.traffic.enabled = true; g.env.time = 12; try { g.env.setWeather('clear', true); g.env.wet = 0; } catch {} const x = 563.5, z = 380; g.resetPlayerState(x, z, Math.PI); window.__cam = [x, 1.55, z - 2.6, x, 1.0, z]; for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip', 'zoneCard', 'objective']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } } });
  await shot(S, 'c02-player-back', { fn: () => { const g = window.game, x = 563.5, z = 380; window.__cam = [x + 1.2, 1.9, z + 3.2, x, 1.1, z]; } });
  await shot(S, 'c03-crowd', { fn: () => { const g = window.game; g.peds.target = 60; const x = 571, z = 380; g.resetPlayerState(x, z, 0); g.env.time = 12.5; window.__cam = [x - 1, 2.3, z + 14, x - 1, 1.2, z - 10]; }, after: async S2 => { await S2.ev(() => {
    // the crowd walks in on the simulation clock (no rendering); then the camera frames the nearest group of people
    const g = window.game; for (let n = 0; n < 240; n++) g.update(1 / 60, 1 / 60);
    const p = g.player.pos, near = g.peds.peds.filter(q => q.state !== 'dead' && q.health > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 6);
    if (near.length) { const cx = near.reduce((a, q) => a + q.x, 0) / near.length, cz = near.reduce((a, q) => a + q.z, 0) / near.length, dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz) || 1; window.__cam = [cx + dx / l * 7, 2.0, cz + dz / l * 7, cx, 1.1, cz]; }
  }); } });
  await S.ctx.close();
}
// ---------------------------------------------------------------- play scenes with the game camera
{
  const S = await session({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const play = fn => ({ fn: ([src]) => { window.__cam = null; const g = window.game; for (const id of ['moneyFeed', 'toasts', 'tip', 'zoneCard']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } (0, eval)('(' + src + ')')(g); }, arg: [fn.toString()] });
  await shot(S, 'p01-casino', play(g => { g.police.clear(); g.env.time = 22; if (g.player.vehicle) g.exitVehicle(true); g.content.enterCasino(); }), 120);
  await shot(S, 'p02-casino-floor', play(g => { const d = g.content.interiors.cur; if (d) { g.player.pos.set(d.ox, d.fy, d.oz + 2); g.player.h = Math.PI; } }), 60);
  const biz = cat => g => { const P = window.__pv; if (g.content.interiors.cur) g.content.interiors.exit(true); const d = P.PROPS.find(p => p.kind === 'business' && P.ROB_CAT_THEME[p.cat] === cat); if (d) { const L = g.uw.loc('prop', d.id); g.resetPlayerState(L.x, L.z, 0); g.content.enterBiz(d.id); } };
  for (const cat of ['pharmacy', 'jewelry', 'pawn', 'bar', 'shop', 'food', 'electronics', 'boutique', 'service']) await shot(S, `p04-biz-${cat}`, play(new Function('g', `(${biz.toString()})(${JSON.stringify(cat)})(g)`)), 120);
  await shot(S, 'p05-home-rich', play(g => { const I = g.content.interiors; if (I.cur) I.exit(true); const h = g.world.homes.find(x => !x.propId && x.district === 'u'); const def = I.addDynamic(window.__pv.houseInteriorDef(h, null)); I.enter(def.id); }), 120);
  await shot(S, 'p06-home-modest', play(g => { const I = g.content.interiors; if (I.cur) I.exit(true); const h = g.world.homes.find(x => !x.propId && x.district === 'l'); const def = I.addDynamic(window.__pv.houseInteriorDef(h, null)); I.enter(def.id); }), 120);
  await shot(S, 'p07-warehouse', play(g => { const I = g.content.interiors; if (I.cur) I.exit(true); g.uw.S.props.whse_w = { owned: true, dmg: 0, since: 1, lvl: 1 }; const L = g.uw.loc('prop', 'whse_w'); g.resetPlayerState(L.x, L.z, 0); g.uw.compounds.enter('whse_w'); }), 120);
  await shot(S, 'p08-warehouse-yard', play(g => { const I = g.content.interiors; if (I.cur) I.exit(true); const C = g.world.compounds.whse_w; const x = (C.x0 + C.x1) / 2 || C.x, z = (C.z0 + C.z1) / 2 || C.z; g.resetPlayerState(x, z, 0); g.env.time = 20.5; }), 120);
  await shot(S, 'p09-pursuit-night', play(g => { const I = g.content.interiors; if (I.cur) I.exit(true); g.police.enabled = true; g.env.time = 23; const P = window.__pv, kp = P.nearestRoadPoint(480, 300); const v = g.vehicles.spawn('sports', kp.x, kp.z, 0, {}); g.resetPlayerState(kp.x + 2, kp.z, 0); g.completeEnter(v); g.police.setLevel(3); }), 300);
  await shot(S, 'p10-race-start', play(g => { g.police.clear(); g.police.setLevel(0); g.police.enabled = false; if (g.player.vehicle) g.exitVehicle(true); const P = window.__pv, ck = P.vpCheckpoints({ laps: 3 }), s = ck.start; g.env.time = 15; const me = g.vehicles.spawn('sports', s.x - 2.7, s.z + 30, s.h, {}); g.resetPlayerState(me.pos.x + 2, me.pos.z, 0); g.completeEnter(me); for (let k = 0; k < 5; k++) { const v = g.vehicles.spawn(['sports', 'muscle', 'tempest', 'hellion', 'revenant'][k], s.x + (k % 2 ? 2.7 : -2.7), s.z + 9 * k + 9, s.h, { parked: true }); v.touched = true; } }), 120);
  await shot(S, 'p11-jail', play(g => { if (g.player.vehicle) g.exitVehicle(true); g.police.enabled = true; g.uw.S.rap.cur = { pickpocket: 1 }; g.police.setLevel(1); g.onBusted(); }), 10);
  if (want('p11-jail')) {
    try {
      const { throughCourt } = await import('../tests/lib.mjs');
      await throughCourt(S.page);
      await S.page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
      await frames(S.page, 60); await S.page.screenshot({ path: path.join(OUT, 'p11-jail.png'), timeout: 240000 });
      stats['p11-jail'] = await S.ev(() => { const i = window.game.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, interior: !!window.game.content.interiors.cur }; });
      console.log('shot p11-jail', JSON.stringify(stats['p11-jail']));
      await S.ev(() => { const g = window.game; g.player.pos.x += 3; }); await frames(S.page, 40); await S.page.screenshot({ path: path.join(OUT, 'p12-jail-block.png'), timeout: 240000 });
    } catch (e) { console.log('FAILED p11-jail', e.message.split('\n')[0]); }
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
  }
  await S.ctx.close();
}
// ---------------------------------------------------------------- the interface on an iPhone-sized screen
{
  const S = await session({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const ui = fn => ({ fn: ([src]) => { window.__cam = null; const g = window.game; while (g.ui.stack.length) g.ui.back(); if (g.mapOpen) g.ui.toggleMap(false); (0, eval)('(' + src + ')')(g); }, arg: [fn.toString()] });
  await shot(S, 'u01-hud-foot', ui(g => { g.env.time = 12; g.money.W.dirty.me = 1840; g.money.W.clean = 26500; const x = 563.5, z = 380; g.resetPlayerState(x, z, Math.PI); }), 60);
  await shot(S, 'u02-hud-car', ui(g => { const P = window.__pv, kp = P.nearestRoadPoint(563, 380); const v = g.vehicles.spawn('sedan', kp.x, kp.z, 0, {}); g.resetPlayerState(kp.x + 2, kp.z, 0); g.completeEnter(v); }), 60);
  await shot(S, 'u03-hud-wanted', ui(g => { g.police.enabled = true; g.police.setLevel(2); }), 60);
  await shot(S, 'u04-phone', ui(g => { g.police.clear(); g.police.enabled = false; if (g.player.vehicle) g.exitVehicle(true); g.uw.ui.open(); }), 20);
  await shot(S, 'u05-phone-empire', ui(g => { g.uw.ui.open('overview'); }), 20);
  await shot(S, 'u06-phone-market', ui(g => { g.uw.ui.open('market'); }), 20);
  await shot(S, 'u07-map', ui(g => { g.ui.toggleMap(true); }), 20);
  await shot(S, 'u08-map-zoom', ui(g => { g.ui.toggleMap(true); const v = g.ui.mapView; v.zoomAt(3, v.W / 2, v.H / 2, true); }), 20);
  await shot(S, 'u09-casino-royale', ui(g => { g.content.enterCasino(); }), 120);
  await shot(S, 'u10-royale-screen', ui(g => { g.money.W.clean = 2e6; const G = g.gamble; if (G.openRoyale) G.openRoyale(); else if (g.content.spotAct) g.content.spotAct('g:slot:royale0'); }), 30);
  await shot(S, 'u11-supplier', ui(g => { if (g.content.interiors.cur) g.content.interiors.exit(true); const L = g.uw.loc('spot', 'sully'); g.resetPlayerState(L.x, L.z, 0); g.uw.ui.openSpot(L); }), 20);
  await shot(S, 'u12-pause', ui(g => { g.pause && g.pause(); }), 10);
  await S.ctx.close();
}
await b.close();
console.log('done', Object.keys(stats).length, 'scenes →', OUT);
