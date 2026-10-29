/* Plays a release the way a static host serves it, and checks it works.

   node underworld/tools/verify-release.mjs <release dir> <file.html>

   Serves <release dir> over plain HTTP on localhost (like Vercel: static files, nothing else), then in headless
   Chromium (SwiftShader), with every request outside that server blocked, runs two profiles:
     desktop 960x540, keyboard;  iPhone (390x844 landscape, touch, mobile UA, 4x CPU throttle).
   Each: the page boots with no errors and no failed or outside requests; a new game starts; the player walks; a car
   is entered and driven; the phone and the map open; the core systems exist; a save is written under the release's
   own localStorage keys (RELEASE.json) and nowhere else, and survives a reload through Continue. The iPhone
   profile drives the on-screen stick with real touch events.
   Exit 1 on any failure. A desktop browser is not an iPhone: this proves the package, not the device. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
const { chromium } = playwright;

const [dirArg, name] = process.argv.slice(2);
if (!dirArg || !name) { console.error('usage: verify-release.mjs <release dir> <file.html>'); process.exit(2); }
const dir = path.resolve(dirArg), rel = JSON.parse(fs.readFileSync(path.join(dir, 'RELEASE.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary' };
const served = [], missing = [];
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(dir, u === '/' ? 'index.html' : u);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { missing.push(u); res.writeHead(404); res.end('not found'); return; }
  served.push(u); res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let fails = 0;
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`); };
const IGNORE = /GPU stall|swiftshader|WebGL-|Automatic fallback to software WebGL|GroupMarkerNotSet/i;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

async function profile(tag, ctxOpts, throttle) {
  const ctx = await b.newContext(ctxOpts), errors = [], outside = [];
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
  await ctx.route(u => !u.href.startsWith(base) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), r => { outside.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  page.on('requestfailed', r => { if (!r.url().startsWith('data:')) errors.push('REQUEST FAILED ' + r.url()); });
  const t0 = Date.now();
  await page.goto(base + (tag === 'desktop' ? '' : name)); // the folder's index.html (a redirect) on one, the file itself on the other
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 300000 });
  const bootMs = Date.now() - t0;
  const ev = (f, a) => page.evaluate(f, a);
  const step = sec => ev(s => { const g = window.game; for (let n = 0; n < s * 60; n++) g.update(1 / 60, 1 / 60); }, sec);
  check(`${tag}: the page boots from the static server (${(bootMs / 1000).toFixed(1)} s)`, true);
  const meta = await ev(() => (document.querySelector('meta[name="release"]') || {}).content || '');
  check(`${tag}: it is the release (${meta})`, meta.includes(rel.commit), meta);
  await ev(() => window.game.quality.setMode(0));
  // the loading screen fades after the first rendered frames (slow on software GL): wait for it, then click
  await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
  await page.click('#btnNew', { timeout: 120000 });
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 240000 });
  await ev(() => { const g = window.game; g.events.cool = 1e9; g.save.settings.guide = false; });
  const sys = await ev(() => { const g = window.game; return ['uw', 'police', 'traffic', 'peds', 'missions', 'vehicles', 'vreg', 'gamble', 'race', 'world', 'chunks', 'money'].filter(k => !g[k]); });
  check(`${tag}: a new game starts and the core systems exist (city, police, traffic, people, missions, vehicles, casino, racing, money)`, sys.length === 0, sys.join(','));
  // walk
  const p0 = await ev(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  let p1;
  if (ctxOpts.hasTouch) {
    // the on-screen stick: a real touch on the left of the canvas, dragged up
    const cdp = await ctx.newCDPSession(page), vw = ctxOpts.viewport.width, vh = ctxOpts.viewport.height, x = vw * 0.18, y = vh * 0.7;
    const touchUI = await ev(() => { const t = document.getElementById('touch'); return !!t && getComputedStyle(t).display !== 'none' && window.game.input.usingTouch !== undefined; });
    check(`${tag}: the touch controls are on screen`, touchUI);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - k * 10, id: 1 }] });
    const stick = await ev(() => ({ ...window.game.input.stick }));
    await step(1.5);
    p1 = await ev(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(`${tag}: dragging the on-screen stick moves the player`, stick.active && stick.y > 0.5 && Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, JSON.stringify({ stick, moved: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2) }));
  } else {
    await page.keyboard.down('KeyW'); await step(1.5); await page.keyboard.up('KeyW');
    p1 = await ev(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
    check(`${tag}: W walks the player`, Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, (Math.hypot(p1.x - p0.x, p1.z - p0.z)).toFixed(2));
  }
  // a car
  const car = await ev(() => {
    const g = window.game, P = window.__pv, kp = P.nearestRoadPoint(g.player.pos.x, g.player.pos.z), v = g.vehicles.spawn('sedan', kp.x, kp.z, 0, {});
    g.resetPlayerState(kp.x + 2, kp.z, 0); g.completeEnter(v); const a = { x: v.pos.x, z: v.pos.z };
    g.input.down.add('up'); for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60); g.input.down.delete('up');
    return { inCar: g.player.vehicle === v, moved: +Math.hypot(v.pos.x - a.x, v.pos.z - a.z).toFixed(1), speed: +Math.abs(v.speed || 0).toFixed(1) };
  });
  check(`${tag}: a car is entered and drives`, car.inCar && car.moved > 2, JSON.stringify(car));
  await ev(() => { const g = window.game; if (g.player.vehicle) g.exitVehicle(true); });
  // phone and map
  const ui = await ev(() => { const g = window.game; g.uw.ui.open(); const phone = !!g.ui.modal && document.querySelectorAll('#empBody [data-act^="app:"]').length; const m = document.querySelector('#empBody [data-act="app:map"]'); if (m) m.click(); const map = !!g.mapOpen; if (g.mapOpen) g.ui.toggleMap(false); while (g.ui.stack.length) g.ui.back(); return { phone, map }; });
  check(`${tag}: the phone opens (its app groups) and the map opens from it`, ui.phone > 0 && ui.map, JSON.stringify(ui));
  // save, under this release's keys only
  const sv = await ev(k => { const g = window.game; g.money.W.dirty.me = 4321; g.saveGame(true); return { mine: !!localStorage.getItem(k.save), settings: !!localStorage.getItem(k.settings), keys: Object.keys(localStorage) }; }, rel.saveKeys);
  const foreign = sv.keys.filter(k => k !== rel.saveKeys.save && k !== rel.saveKeys.settings);
  check(`${tag}: the save is written under ${rel.saveKeys.save} and nothing else`, sv.mine && foreign.length === 0, JSON.stringify(sv));
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 300000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 240000 });
  const back = await ev(() => ({ dirty: window.game.money.W.dirty.me, day: window.game.uw.S.day }));
  check(`${tag}: Continue after a reload restores the save`, back.dirty === 4321, JSON.stringify(back));
  check(`${tag}: no page errors, no failed requests, nothing fetched from outside the host`, errors.length === 0 && outside.length === 0, [...errors, ...outside].slice(0, 5).join(' | '));
  await ctx.close();
}

await profile('desktop', { viewport: { width: 960, height: 540 } }, false);
await profile('iPhone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }, true);
check('the static host was asked only for files in the release folder, and had them all', missing.length === 0, 'missing: ' + missing.join(', ') + ' · served: ' + [...new Set(served)].join(', '));
await b.close(); server.close();
console.log(fails ? `FAILED (${fails})` : 'RELEASE VERIFIED');
process.exit(fails ? 1 : 0);
