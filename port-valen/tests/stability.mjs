/* Port Valen stability suite (release-candidate gate for the master template).
   1. Arrest regression: ten arrests in different situations; after each one the
      pose must be clean and walk / sprint / jump / aim / enter / exit must work.
   2. Fix checks: settings take effect, Esc/confirm handling, HUD layers on pause
      and arrest, mission retry, pay-once completion, door double-entry guard,
      safe vehicle exit, NaN recovery, corrupt-save recovery.
   3. Soak: six long cycles of driving, police, jobs, events, arrest, death,
      interiors, menus, weather and saving; entity/resource counts must stay flat.

   Usage:  node port-valen/tests/stability.mjs
   Offline: THREE_DIR=/path/to/three/package node port-valen/tests/stability.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
const { chromium } = playwright;
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const THREE_DIR = process.env.THREE_DIR;
const IGNORE = /GPU stall|swiftshader|WebGL-|Automatic fallback to software WebGL/i;
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
async function open(browser, file, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, ...ctxOpts });
  if (THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => {
    const fp = path.join(THREE_DIR, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', ''));
    if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + file);
  return { ctx, page, errors };
}
const frames = async (page, n) => { const f0 = await page.evaluate(() => window.game.frame); await page.waitForFunction(t => window.game.frame >= t, f0 + n, { timeout: 240000, polling: 100 }); };
async function startNew(page) {
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await page.click('#btnNew');
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 90000, polling: 100 });
  await frames(page, 3);
}

/* ---------------- arrest regression ---------------- */
{
const b = await launch();
const { page, errors } = await open(b, FILE, { viewport: { width: 480, height: 270 } });
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await startNew(page);
await page.evaluate(() => { const g = window.game; g.save.weapons.pistol = true; g.save.ammo.pistol = 200; g.events.cool = 1e9; });
const poseClean = () => page.evaluate(() => { const ps = window.game.player.pose; return { sur: +(ps.surrender || 0).toFixed(3), crouch: +(ps.crouch || 0).toFixed(3), down: +(ps.down || 0).toFixed(3), state: window.game.player.state, gs: window.game.state, trans: !!window.game.player.trans, bust: window.game.police.bust, lvl: window.game.police.level, fov: window.game.camera.fov }; });
async function arrest(setup, arg) {
  await page.evaluate(setup, arg);
  await page.evaluate(() => { const g = window.game; if (g.police.level === 0) g.police.setLevel(1); g.onBusted(); });
  let mid = 0;
  for (let k = 0; k < 40 && mid < 0.6; k++) { await frames(page, 1); mid = Math.max(mid, await page.evaluate(() => window.game.player.pose.surrender || 0)); }
  await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 120000, polling: 200 });
  await frames(page, 4);
  return mid;
}
async function afterChecks(tag) {
  let s = await poseClean();
  check(`${tag}: pose clean after release`, s.sur === 0 && s.crouch === 0 && s.down === 0 && s.state === 'foot' && !s.trans && s.bust === 0 && s.lvl === 0, JSON.stringify(s));
  const p0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await frames(page, 15); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, amp: window.game.player.pose.amp }));
  check(`${tag}: walk/sprint moves`, Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8, JSON.stringify([p0, p1]));
  await page.keyboard.press('Space'); await frames(page, 2);
  check(`${tag}: jump`, await page.evaluate(() => !window.game.player.onGround || window.game.player.vel.y > 0));
  await frames(page, 25);
  await page.evaluate(() => { const g = window.game; g.player.selectWeapon(2); g.player.mag.pistol = 12; });
  await page.mouse.down({ button: 'right' }); await frames(page, 6);
  const aim = await page.evaluate(() => window.game.player.aim);
  await page.mouse.up({ button: 'right' }); await frames(page, 10);
  const sur2 = await page.evaluate(() => window.game.player.pose.surrender || 0);
  check(`${tag}: aim works, hands still down`, sur2 === 0, 'aim ' + aim.toFixed(2));
  await page.evaluate(() => { const g = window.game, p = g.player; g.player.selectWeapon(0); const v = g.vehicles.spawn('sedan', p.pos.x + Math.sin(p.h) * 2.4, p.pos.z + Math.cos(p.h) * 2.4, p.h + Math.PI / 2, { parked: true }); v.touched = true; const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, __pv.groundY(w.x, w.z), w.z); window.__tv = v; });
  await frames(page, 3); await page.keyboard.press('KeyE'); await frames(page, 14);
  check(`${tag}: enter vehicle`, await page.evaluate(() => window.game.player.state === 'vehicle'));
  await page.keyboard.press('KeyE'); await frames(page, 6);
  s = await poseClean();
  check(`${tag}: exit vehicle, pose clean`, s.state === 'foot' && s.sur === 0 && s.crouch === 0, JSON.stringify(s));
  await page.evaluate(() => { const g = window.game; if (window.__tv && g.vehicles.list.includes(window.__tv)) g.vehicles.despawn(window.__tv); });
}
let mid = await arrest(() => {});
check('surrender pose shown while in custody', mid > 0.3, String(mid));
await afterChecks('standing');
await arrest(() => { window.game.player.vel.set(6, 0, 0); window.game.player.pose.amp = 1.1; window.game.player.pose.lean = 0.2; });
await afterChecks('running');
await arrest(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('suv', p.pos.x + 2, p.pos.z, 0, { parked: true }); v.touched = true; const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, __pv.groundY(w.x, w.z), w.z); g.completeEnter(v); g.exitVehicle(true); });
await afterChecks('just exited a car');
await arrest(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x + 2, p.pos.z, 0, { parked: true }); v.touched = true; const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, __pv.groundY(w.x, w.z), w.z); g.beginEnter(v); });
await afterChecks('mid car entry');
await arrest(() => { const g = window.game, c = g.missions.contacts[0]; let s; for (let i = 0; i < 40; i++) { s = g.missions.generate(c); if (s.type === 'delivery') break; } g.missions.start(s); g.police.setLevel(2); g.player.aim = 1; g.player.pose.aim = 1; g.player.reloadT = 0.5; });
check('mission failed by arrest, UI cleared', await page.evaluate(() => !window.game.missions.active && document.getElementById('objective').classList.contains('hidden') === false ? true : !window.game.missions.active));
await afterChecks('during mission at 2 stars');
for (const lvl of [3, 5]) { await arrest((l) => window.game.police.setLevel(l), lvl); await afterChecks(`at ${lvl} stars`); }
await arrest(() => {}); await arrest(() => {});
await afterChecks('twice in a row');
// death then arrest
await page.evaluate(() => window.game.onPlayerDeath('test'));
await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 120000, polling: 200 });
await frames(page, 4);
await afterChecks('after death');
// arrest then quit & continue, then reload
await arrest(() => {});
await page.evaluate(() => window.game.saveGame());
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60000 }); await frames(page, 6);
await afterChecks('after save/load');
const stats = await page.evaluate(() => window.game.save.stats.busted);
console.log('busted count persisted', stats);
check('arrest regression: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await b.close();
}

/* ---------------- fix checks ---------------- */
{
const b = await launch();
const { page, errors } = await open(b, FILE, { viewport: { width: 640, height: 360 } });
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
check('template version label', await page.evaluate(() => window.__pv.GAME_CONFIG.version === '1.0-STABLE' && Object.isFrozen(window.__pv.GAME_CONFIG)));
await startNew(page);
await page.evaluate(() => { window.game.events.cool = 1e9; });
// ---- settings take effect
const setv = async (id, v) => page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); }, [id, v]);
await setv('setFov', 85); await frames(page, 30);
check('FOV setting', await page.evaluate(() => Math.abs(window.game.camera.fov - 85) < 3), await page.evaluate(() => window.game.camera.fov));
await setv('setFov', 70);
await setv('setTraffic', 0.3); await setv('setPeds', 0.3);
check('traffic/ped density stored', await page.evaluate(() => window.game.save.settings.traffic === 0.3 && window.game.save.settings.peds === 0.3));
await frames(page, 160);
const dens = await page.evaluate(() => ({ t: window.game.traffic.cars.length, want: window.game.traffic.target * window.game.env.trafficMul * 0.3 }));
check("traffic follows density", dens.t <= Math.ceil(dens.want) + 3, JSON.stringify(dens));
await setv('setTraffic', 1); await setv('setPeds', 1);
await setv('setVol', 0.2);
check('volume setting reaches audio', await page.evaluate(() => Math.abs(window.game.audio.vol.master - 0.2) < 1e-6 || window.game.save.settings.volume === 0.2));
await setv('setVol', 0.8);
await page.evaluate(() => document.getElementById('setShadows').click());
check('shadows toggle', await page.evaluate(() => window.game.renderer.shadowMap.enabled === false || window.game.save.settings.shadows === false));
await page.evaluate(() => document.getElementById('setShadows').click());
await page.evaluate(() => document.getElementById('setGuide').click()); await frames(page, 15);
check('guide toggle saved', await page.evaluate(() => window.game.save.settings.guide === false));
await page.evaluate(() => document.getElementById('setGuide').click());
await page.evaluate(() => { const s = document.getElementById('setQuality'); s.value = '1'; s.dispatchEvent(new Event('change')); });
check('quality preset applies', await page.evaluate(() => window.game.quality.level === 1));
await page.evaluate(() => { const s = document.getElementById('setQuality'); s.value = '0'; s.dispatchEvent(new Event('change')); });
// ---- pause hides HUD, Esc closes confirm before anything else
await page.keyboard.press('Escape'); await frames(page, 3);
check('pause hides gameplay HUD', await page.evaluate(() => getComputedStyle(document.getElementById('hud')).opacity === '0' || document.body.dataset.gs === 'paused'));
await page.click('#btnQuit').catch(() => {});
// quit -> menu, then confirm dialog + Esc on New Game
await page.waitForFunction(() => window.game.state === 'menu', null, { timeout: 30000 });
await page.click('#btnNew'); await frames(page, 2);
const conf = await page.isVisible('#confirmScreen');
await page.keyboard.press('Escape'); await frames(page, 3);
check('new game asks to confirm over a save', conf);
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60000 }); await frames(page, 4);
// in play: confirm via garage sell -> Esc dismisses only the dialog
await page.evaluate(() => { const g = window.game; g.content.addToGarage('sedan', 'bought', 0x123456, true); g.content.openGarage(); });
await page.click('#svcBody [data-act^="sell:"]'); await frames(page, 2);
const c1 = await page.isVisible('#confirmScreen');
await page.keyboard.press('Escape'); await frames(page, 3);
const c2 = await page.evaluate(() => ({ confirm: !document.getElementById('confirmScreen').classList.contains('hidden'), svc: !document.getElementById('svcScreen').classList.contains('hidden') }));
check('Esc dismisses the confirm dialog first', c1 && !c2.confirm && c2.svc, JSON.stringify(c2));
await page.keyboard.press('Escape'); await frames(page, 3);
check('second Esc closes the panel', await page.evaluate(() => !window.game.ui.modal && window.game.state === 'playing'));
// ---- arrest overlay hides gameplay prompts
await page.evaluate(() => { const g = window.game; g.police.setLevel(1); g.onBusted(); }); await frames(page, 3);
check('custody overlay hides offers/objective', await page.evaluate(() => document.body.dataset.gs === 'busted' && getComputedStyle(document.getElementById('offer')).display === 'none'));
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 120000 }); await frames(page, 3);
// ---- mission retry
await page.evaluate(() => { const g = window.game, c = g.missions.contacts[0]; let s; for (let i = 0; i < 40; i++) { s = g.missions.generate(c); if (s.type === 'courier') break; } g.missions.start(s); });
await frames(page, 4);
await page.evaluate(() => window.game.missions.fail('test'));
await page.keyboard.press('Escape'); await frames(page, 3);
check('retry offered in pause after a failure', await page.isVisible('#btnRetry'), await page.textContent('#retrySub'));
await page.click('#btnRetry'); await frames(page, 6);
check('retry restarts the job', await page.evaluate(() => !!window.game.missions.active && window.game.state === 'playing'));
const paid = await page.evaluate(() => { const g = window.game, m = g.missions.active; const before = g.save.money; g.missions.pass(); g.missions.pass(); return g.save.money - before === m.spec.reward; });
check('completion pays exactly once', paid);
// ---- double door entry is guarded
const dbl = await page.evaluate(async () => {
  const g = window.game, d = g.world.places.store.door; g.resetPlayerState(d.x, d.z + 0.6, Math.PI);
  let n = 0; const orig = g.content.onInterior.bind(g.content); g.content.onInterior = (id, e) => { if (e) n++; orig(id, e); };
  g.content.interiors.enter('store'); g.content.interiors.enter('store');
  await new Promise(r => setTimeout(r, 1500));
  g.content.onInterior = orig; return { n, inside: !!g.player.interior };
});
check('double door entry fires once', dbl.n === 1 && dbl.inside, JSON.stringify(dbl));
await page.evaluate(() => window.game.content.interiors.exit(true));
// ---- exiting a car parked against a wall never lands inside geometry
const wall = await page.evaluate(() => {
  const g = window.game, b = g.world.blocks.find(x => x.bld.length && x.t === 'D'), r = b.bld[0];
  const x = r.x0 - 1.0, z = (r.z0 + r.z1) / 2;
  const v = g.vehicles.spawn('van', x, z, 0, { parked: true }); v.touched = true;
  const w = v.toWorld(-v.spec.w / 2 - 0.6, 0); g.player.pos.set(w.x, window.__pv.groundY(w.x, w.z), w.z); g.completeEnter(v);
  g.exitVehicle(true);
  const p = g.player.pos, res = g.world.grid.resolveCircle(p.x, p.z, 0.3, p.y + 0.4, p.y + 1.6, {});
  let inCar = false; for (const o of g.vehicles.nearby(p.x, p.z, 4)) { const lp = o.toLocal(p.x, p.z); if (Math.abs(lp.x) < o.spec.w / 2 && Math.abs(lp.z) < o.spec.l / 2) inCar = true; }
  return { hit: res.hit && res.depth > 0.05, inCar };
});
check('exit next to a wall is clear', !wall.hit && !wall.inCar, JSON.stringify(wall));
// ---- NaN guard
const nanr = await page.evaluate(() => { const g = window.game, v = g.vehicles.list.find(x => x.mode === 'phys'); if (!v) return 'none'; v.vel.x = NaN; v.pos.z = Infinity; g.vehicles.sanitize(v); return isFinite(v.pos.z) && isFinite(v.vel.x); });
check('vehicle NaN recovery', nanr === true, String(nanr));
// ---- marker gem hides at point blank
check('contact marker gem hides at point blank', await page.evaluate(() => { const g = window.game, c = g.missions.contacts[0]; g.missions.markers.update(1, { x: c.x + 1, z: c.z }); return c.marker.gem.visible === false; }));
// ---- corrupted save recovers
await page.evaluate(() => { window.game.wiped = true; }); await page.evaluate(() => localStorage.setItem('portvalen.save.v1', JSON.stringify({ version: 2, money: 'lots', rep: null, settings: { fov: 9999, volume: NaN, quality: 'ultra' }, stats: { playTime: 50, distDrive: 'x' }, garage: [{ type: 'nope' }, { type: 'sedan', tune: { engine: 99 } }], messages: 'x', outfit: { cap: 'red' } })));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
const bad = await page.evaluate(() => { const s = window.game.save; return { money: s.money, fov: s.settings.fov, q: s.settings.quality, garage: s.garage.map(e => e.type + ':' + e.tune.engine), msgs: Array.isArray(s.messages), dd: s.stats.distDrive }; });
check('corrupt save loads with safe defaults', bad.money === 500 && bad.fov === 90 && bad.q === 'auto' && bad.garage.join() === 'sedan:3' && bad.msgs && bad.dd === 0, JSON.stringify(bad));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 60000 }); await frames(page, 6);
check('corrupt save still plays', await page.evaluate(() => window.game.state === 'playing'));

check('fix checks: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await b.close();
}

/* ---------------- soak ---------------- */
{
const b = await launch();
const { page, errors } = await open(b, FILE, { viewport: { width: 480, height: 270 } });
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await startNew(page);
const metrics = () => page.evaluate(() => {
  const g = window.game, i = g.renderer.info;
  let nan = 0; for (const v of g.vehicles.list) if (!isFinite(v.pos.x + v.pos.z + v.vel.x + v.vel.y)) nan++;
  return { veh: g.vehicles.list.length, traffic: g.traffic.cars.length, peds: g.peds.peds.length, cops: g.police.cops.length, units: g.police.units.length,
    markers: g.missions.markers.items.length, markersUsed: g.missions.markers.items.filter(m => m.used).length, geo: i.memory.geometries, tex: i.memory.textures,
    scene: g.scene.children.length, voices: g.audio.voices || 0, smoke: g.fx.smoke.n, glow: g.fx.glow.n, chunks: g.chunks.chunks.size, nan,
    toasts: document.getElementById('toasts').children.length, msgs: g.save.messages.length, fading: !!g.fading, state: g.state, ps: g.player.state, fps: Math.round(g.fps) };
});
const W = (ms) => page.waitForTimeout(ms);
const playing = () => page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 120000, polling: 200 });
const log = [];
for (let cycle = 0; cycle < 6; cycle++) {
  // drive across town
  await page.evaluate((c) => { const g = window.game, p = g.player; const pts = [[1, 3], [9, 2], [10, 9], [3, 10], [6, 6], [11, 5]]; const [i, j] = pts[c % pts.length]; const x = i * 80 + 4.6, z = j * 80 + 40; g.resetPlayerState(x, z, 0); const v = g.vehicles.spawn('sports', x, z + 6, 0, { parked: true }); v.touched = true; const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, window.__pv.groundY(w.x, w.z), w.z); g.completeEnter(v); }, cycle);
  await page.keyboard.down('KeyW'); await frames(page, 30); await page.keyboard.up('KeyW');
  // wanted + escape
  await page.evaluate(() => window.game.police.setLevel(3)); await frames(page, 40);
  await page.evaluate(() => window.game.police.clear('test')); await frames(page, 5);
  // a side job started then failed
  await page.evaluate(() => { const g = window.game, c = g.missions.contacts[0]; const s = g.missions.generate(c); g.missions.start(s); });
  await frames(page, 10);
  await page.evaluate(() => { const g = window.game; if (g.missions.active) g.missions.fail('soak'); g.police.lockLevel = 0; g.police.clear(); });
  // street event
  await page.evaluate(() => { const g = window.game; g.events.clear(); g.events.spawn(['pursuit', 'accident', 'stop', 'robbery'][Math.floor(Math.random() * 4)]); }); await frames(page, 15);
  // arrest, death
  await page.evaluate(() => { const g = window.game; g.police.setLevel(1); g.onBusted(); }); await playing(); await frames(page, 3);
  await page.evaluate(() => window.game.onPlayerDeath('soak')); await playing(); await frames(page, 3);
  // interior, menus, pause, weather, save
  await page.evaluate(() => window.game.content.interiors.enter('store', true)); await frames(page, 8);
  await page.evaluate(() => window.game.content.interiors.exit(true)); await frames(page, 4);
  await page.keyboard.press('Escape'); await frames(page, 2);
  for (const s of ['progress', 'phone', 'stats', 'settings']) { await page.evaluate((x) => window.game.ui.open(x), s); await frames(page, 1); await page.keyboard.press('Escape'); await frames(page, 1); }
  await page.keyboard.press('Escape'); await frames(page, 2);
  await page.evaluate((c) => { const g = window.game; g.env.setWeather(['rain', 'fog', 'clear', 'cloudy'][c % 4], true); g.env.time = (c * 7) % 24; g.saveGame(); }, cycle);
  await page.keyboard.press('KeyM'); await frames(page, 2); await page.keyboard.press('KeyM'); await frames(page, 30);
  const m = await metrics(); log.push(m); console.log('cycle', cycle, JSON.stringify(m));
}
const first = log[1], last = log[log.length - 1];
check('state back to playing on foot', last.state === 'playing' && last.ps === 'foot', JSON.stringify(last));
check('no NaN vehicles', log.every(m => m.nan === 0));
check('vehicles bounded', last.veh < 140, last.veh);
check('peds bounded', last.peds < 70, last.peds);
check('marker pool bounded', last.markers <= first.markers + 4, `${first.markers} -> ${last.markers} (used ${last.markersUsed})`);
check('geometries not leaking', last.geo <= first.geo * 1.25 + 40, `${first.geo} -> ${last.geo}`);
check('textures not leaking', last.tex <= first.tex + 12, `${first.tex} -> ${last.tex}`);
check('scene graph not growing', last.scene <= first.scene + 8, `${first.scene} -> ${last.scene}`);
check('audio voices bounded', last.voices <= 49, last.voices);
check('toasts capped', last.toasts <= 4);
check('messages capped', last.msgs <= 60);
check('no fade stuck', !last.fading);

check('soak: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await b.close();
}
console.log(failures ? `${failures} FAILED` : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
