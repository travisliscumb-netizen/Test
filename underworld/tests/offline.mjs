/* Offline launch: the browser context is offline and every non-file request is aborted.
   The game must load, render, start and play (UI, vehicles, police, combat, map and
   minimap) with zero network requests, and the file must carry no CDN reference. */
import fs from 'node:fs';
import { launch, open, check, frames, startNew, FILE, finish } from './lib.mjs';
const html = fs.readFileSync(FILE, 'utf8');
check('no CDN / import map left in the file', !/cdn\.jsdelivr|unpkg\.com|cdnjs|type="importmap"|from 'three/.test(html));
check('Three.js r160 is inlined', /REVISION = "160"/.test(html) && html.includes('id="threeInline"'));
const b = await launch();
const { page, errors, net } = await open(b);
const online = await page.evaluate(() => navigator.onLine);
check('browser context really is offline', online === false);
await startNew(page);
const eng = await page.evaluate(() => ({ rev: window.__PV_THREE.THREE.REVISION, comp: !!window.game.composer || !!window.game.renderer, gl: !!window.game.renderer.getContext() }));
check('engine booted from the inline bundle', eng.rev === '160' && eng.gl, JSON.stringify(eng));
await page.evaluate(() => { const g = window.game; g.input.wantLock = false; g.input.noLock = true; g.events.cool = 1e9; g.resetPlayerState(4 * 80 + 40, 4 * 80 + 2, Math.PI / 2); });
await page.mouse.move(240, 135);
await frames(page, 30);
// the frame really rendered: the screenshot is not a flat colour
const shot = await page.screenshot();
let distinct = new Set(); for (let i = 200; i < shot.length; i += 997) distinct.add(shot[i]);
check('the 3D view renders (non-flat frame)', distinct.size > 40, 'distinct byte values ' + distinct.size);
// walk + punch
const p0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
await page.keyboard.down('KeyW'); await frames(page, 20); await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
check('walks', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8);
await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 3);
check('punches', await page.evaluate(() => window.game.player.attackT > 0 || window.game.player.pose.punch > 0.05));
await frames(page, 15);
// vehicle enter / drive / exit
await page.evaluate(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x + Math.cos(p.h) * 2.3, p.pos.z - Math.sin(p.h) * 2.3, p.h + Math.PI / 2, { parked: true }); v.touched = true; });
await frames(page, 3);
await page.keyboard.press('KeyE'); await frames(page, 35);
const inCar = await page.evaluate(() => window.game.player.state);
await page.keyboard.down('KeyW'); await frames(page, 25); await page.keyboard.up('KeyW');
const sp = await page.evaluate(() => window.game.player.vehicle ? window.game.player.vehicle.speed : 0);
await page.keyboard.press('KeyE'); await frames(page, 30);
check('enters, drives and exits a car', inCar === 'vehicle' && sp > 1 && await page.evaluate(() => window.game.player.state === 'foot'), `${inCar} speed ${sp.toFixed(1)}`);
// police respond
await page.evaluate(() => window.game.police.setLevel(2));
await frames(page, 90);
const pol = await page.evaluate(() => ({ lvl: window.game.police.level, units: window.game.police.units.length + window.game.police.cops.length }));
check('police respond to a wanted level', pol.lvl >= 1 && pol.units > 0, JSON.stringify(pol));
await page.evaluate(() => window.game.police.clear('offline test'));
// UI, map, minimap
await page.evaluate(() => window.game.uw.ui.open('overview')); await frames(page, 2);
check('Empire UI opens', await page.evaluate(() => window.game.ui.modal === 'empireScreen' && document.getElementById('empBody').innerHTML.length > 50));
await page.evaluate(() => { while (window.game.ui.stack.length) window.game.ui.back(); });
await page.keyboard.press('KeyM'); await frames(page, 3);
const map = await page.evaluate(() => { const c = document.getElementById('bigmapCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4096) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return { open: window.game.mapOpen, lit: n }; });
check('big map opens and draws', map.open && map.lit > 50, JSON.stringify(map));
await page.keyboard.press('KeyM'); await frames(page, 3);
const mm = await page.evaluate(() => { const c = document.getElementById('minimap'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i + 3] > 0) n++; return n; });
check('minimap draws', mm > 100, 'opaque samples ' + mm);
check('zero network requests', net.length === 0, net.slice(0, 5).join(' | '));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'offline');
