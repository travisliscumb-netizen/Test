/* Port Valen end-to-end playtest. Drives the real game in headless Chromium:
   desktop keyboard play, combat / police / every mission type, arrest + death
   respawns, save persistence across reload, and phone touch controls.
   Fails on any console error or page exception.

   Usage:  node port-valen/tests/playtest.mjs
   Offline: THREE_DIR=/path/to/three/package node port-valen/tests/playtest.mjs
            (serves three@0.160.0 from a local npm package instead of the CDN) */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
const { chromium, devices } = playwright;
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const THREE_DIR = process.env.THREE_DIR;
const IGNORE = /GPU stall|swiftshader|WebGL-|Automatic fallback to software WebGL/i;

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
async function openGame(ctxOpts) {
  const ctx = await browser.newContext({ viewport: { width: 560, height: 315 }, ...ctxOpts });
  if (THREE_DIR) {
    await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => {
      const fp = path.join(THREE_DIR, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', ''));
      if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'not found' });
      route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 120000 });
  await page.evaluate(() => window.game.quality.setMode(0));
  return { ctx, page, errors };
}
const frames = async (page, n) => { const f0 = await page.evaluate(() => game.frame); await page.waitForFunction(t => game.frame >= t, f0 + n, { timeout: 240000, polling: 100 }); };
const playing = page => page.waitForFunction(() => game.state === 'playing', null, { timeout: 240000, polling: 200 });

/* ---------------- desktop ---------------- */
{
  const { ctx, page, errors } = await openGame();
  check('main menu shown', await page.isVisible('#mainMenu'));
  await page.click('#btnNew'); await playing(page); await frames(page, 3);
  check('HUD shown in game', await page.isVisible('#hud'));
  const p0 = await page.evaluate(() => ({ ...game.player.pos }));
  await page.keyboard.down('KeyW'); await frames(page, 25); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ ...game.player.pos }));
  check('WASD walking moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1);
  await page.keyboard.press('Space'); await frames(page, 2);
  check('jump', await page.evaluate(() => !game.player.onGround || game.player.vel.y > 0));
  await frames(page, 60);
  const pop = await page.evaluate(() => ({ traffic: game.traffic.cars.length, peds: game.peds.peds.length, parked: game.vehicles.list.filter(v => v.parked).length }));
  check('traffic, pedestrians and parked cars stream in', pop.traffic > 0 && pop.peds > 0 && pop.parked > 0, JSON.stringify(pop));
  await page.evaluate(() => { const v = game.vehicles.list.find(v => v.parked && v.driver === null); const w = v.toWorld(v.spec.w / 2 + 0.6, 0); game.player.spawn(w.x, w.z, v.h); });
  await frames(page, 3);
  await page.keyboard.press('KeyE'); await frames(page, 12);
  check('E enters a parked car', await page.evaluate(() => game.player.state === 'vehicle'));
  await page.keyboard.down('KeyW'); await frames(page, 40);
  const sp = await page.evaluate(() => game.player.vehicle.speed); await page.keyboard.up('KeyW');
  check('car accelerates', sp > 4, 'speed ' + sp.toFixed(1));
  await page.keyboard.down('KeyS'); await frames(page, 40); await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyE'); await frames(page, 4);
  check('E exits the car', await page.evaluate(() => game.player.state === 'foot'));
  await page.evaluate(() => { game.save.weapons.pistol = true; game.save.ammo.pistol = 60; game.player.mag.pistol = 12; game.player.selectWeapon(2); for (let i = 0; i < 3; i++) game.combat.fire(game.player.wep); });
  await frames(page, 5);
  check('pistol fires and consumes ammo', await page.evaluate(() => game.player.mag.pistol === 9));
  await page.evaluate(() => game.police.setLevel(5)); await frames(page, 120);
  const pol = await page.evaluate(() => ({ units: game.police.units.length, heli: game.police.heli.active, stars: document.querySelectorAll('#stars b.on').length }));
  check('5-star response (units + helicopter + HUD stars)', pol.units >= 3 && pol.heli && pol.stars === 5, JSON.stringify(pol));
  await page.evaluate(() => { game.police.clear(); game.police.setLevel(1); const p = game.player.pos; for (let i = 0; i < 2; i++) game.police.spawnCop(p.x + 0.8, p.z + 0.3); });
  await page.waitForFunction(() => game.state === 'busted', null, { timeout: 240000, polling: 200 }).catch(() => {});
  check('arrest when cops reach the player', await page.evaluate(() => game.save.stats.busted === 1));
  await playing(page);
  check('respawn at police HQ with heat cleared', await page.evaluate(() => game.police.level === 0));
  await page.evaluate(() => game.player.damage(5000, 'test')); await frames(page, 2);
  check('death state', await page.evaluate(() => game.state === 'dead'));
  await playing(page);
  check('respawn at hospital with full health', await page.evaluate(() => game.player.health === game.player.maxHealth));
  for (const type of ['delivery', 'courier', 'theft', 'escape', 'race', 'hidden', 'chase', 'survive']) {
    await page.evaluate(t => { const c = game.missions.contacts.find(c => c.types.includes(t)); let s; for (let i = 0; i < 80; i++) { s = game.missions.generate(c); if (s.type === t) break; } game.missions.start(s); }, type);
    await frames(page, 15);
    check(`mission template runs: ${type}`, await page.evaluate(() => !!game.missions.active));
    await page.evaluate(() => { game.missions.fail('test'); game.police.lockLevel = 0; game.police.clear(); });
  }
  const m = await page.evaluate(() => { const c = game.missions.contacts[0]; let s; do { s = game.missions.generate(c); } while (s.type !== 'delivery'); game.missions.start(s); return { money: game.save.money, dest: s.dest, reward: s.reward }; });
  await page.evaluate(d => game.player.spawn(d.x, d.z, 0), m.dest); await frames(page, 6);
  check('delivery passes at destination and pays out', await page.evaluate(m => !game.missions.active && game.save.money === m.money + m.reward, m));
  await page.keyboard.press('Escape'); await frames(page, 2);
  check('Esc opens pause menu', await page.isVisible('#pauseMenu'));
  await page.click('#btnResume'); await frames(page, 2);
  await page.keyboard.press('KeyM'); await frames(page, 2);
  check('M opens city map', await page.isVisible('#bigmap'));
  await page.keyboard.press('KeyM'); await frames(page, 2);
  await page.evaluate(() => { game.save.money = 4321; game.saveGame(); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 120000 });
  check('save persists across reload', await page.evaluate(() => game.save.money === 4321 && game.save.missionsCompleted === 1) && !(await page.isDisabled('#btnContinue')));
  await page.click('#btnNew');
  check('new game over a save asks for confirmation', await page.isVisible('#confirmScreen'));
  await page.click('#confirmNo');
  check('cancel keeps the save', !(await page.isVisible('#confirmScreen')) && await page.evaluate(() => game.save.money === 4321 && game.state === 'menu'));
  await page.click('#btnNew'); await page.click('#confirmYes'); await playing(page);
  check('confirm starts a fresh career', await page.evaluate(() => game.save.money === 500 && game.save.missionsCompleted === 0));
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close(); // free the CPU for the phone run (software WebGL is slow)
}

/* ---------------- phone (touch) ---------------- */
{
  const { ctx, page, errors } = await openGame({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const center = async sel => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  await page.tap('#btnNew'); await playing(page); await frames(page, 3);
  check('touch controls shown', await page.isVisible('#touch [data-act="jump"]') && !(await page.isVisible('#touch [data-act="gas"]')));
  const p0 = await page.evaluate(() => ({ x: game.player.pos.x, z: game.player.pos.z, yaw: game.cam.yaw }));
  await touch('touchStart', [[150, 260, 1]]); await touch('touchMove', [[150, 200, 1]]);
  await touch('touchStart', [[150, 200, 1], [600, 200, 2]]); await touch('touchMove', [[150, 198, 1], [680, 200, 2]]);
  await frames(page, 25);
  await touch('touchEnd', [[150, 198, 1], [680, 200, 2]]); await frames(page, 2);
  const p1 = await page.evaluate(() => ({ x: game.player.pos.x, z: game.player.pos.z, yaw: game.cam.yaw }));
  check('virtual stick + look drag work together', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1 && Math.abs(p1.yaw - p0.yaw) > 0.05);
  await page.evaluate(() => { const g = game; const v = g.vehicles.spawn('compact', g.player.pos.x + 2.2, g.player.pos.z, 0, { parked: true }); const w = v.toWorld(v.spec.w / 2 + 0.6, 0); g.player.spawn(w.x, w.z, 0); });
  await frames(page, 3);
  const use = await center('#touch [data-act="interact"]');
  await touch('touchStart', [[use[0], use[1], 4]]); await frames(page, 2); await touch('touchEnd', [[use[0], use[1], 4]]); await frames(page, 12);
  check('USE button enters car; driving buttons appear', await page.evaluate(() => game.player.state === 'vehicle') && await page.isVisible('#touch [data-act="gas"]'));
  const gas = await center('#touch [data-act="gas"]');
  await touch('touchStart', [[gas[0], gas[1], 5]]); await frames(page, 30);
  const sp = await page.evaluate(() => game.player.vehicle.speed);
  await touch('touchEnd', [[gas[0], gas[1], 5]]);
  check('GAS pedal drives', sp > 3, 'speed ' + sp.toFixed(1));
  const pause = await center('#touchPause');
  await touch('touchStart', [[pause[0], pause[1], 9]]); await frames(page, 2); await touch('touchEnd', [[pause[0], pause[1], 9]]); await frames(page, 2);
  check('pause button', await page.isVisible('#pauseMenu'));
  check('phone: no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
