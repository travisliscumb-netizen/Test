/* Port Valen campaign test. Plays all story missions through the real stage
   engine (teleport-assisted driving), then checks rewards, reputation,
   achievements and Tull's free races. Fails on any console error.

   Usage:  node port-valen/tests/campaign.mjs
   Offline: THREE_DIR=/path/to/three/package node port-valen/tests/campaign.mjs
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

const { page, errors } = await openGame({ viewport: { width: 480, height: 270 } });
await page.click('#btnNew'); await playing(page); await frames(page, 3);
await page.evaluate(() => {
  const g = window.game; g.police.enabled = true; g.events.cool = 1e9; g.debug.god = true;
  window.__log = [];
  const of = g.missions.fail.bind(g.missions);
  g.missions.fail = (r) => { window.__log.push('FAIL ' + (g.missions.active ? g.missions.active.spec.title : '?') + ': ' + r); of(r); };
  window.__drv = () => {
    const p = g.player, m = g.missions.active, C = g.content;
    const tp = (x, z, y) => {
      if (p.state === 'vehicle') { const v = p.vehicle; v.pos.set(x, y ?? __pv.groundY(x, z), z); v.vel.set(0, 0); v.airborne = false; v.syncMesh(0); p.pos.copy(v.pos); }
      else { p.pos.set(x, y ?? __pv.groundY(x, z), z); p.vel.set(0, 0, 0); }
      g.focus.set(x, 0, z);
    };
    const enterCar = v => {
      if (!v) return;
      if (p.state === 'vehicle' && p.vehicle === v) return;
      if (p.state === 'vehicle') g.exitVehicle(true);
      if (p.interior) C.interiors.exit(true);
      const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, __pv.groundY(w.x, w.z), w.z); p.state = 'foot';
      g.completeEnter(v);
    };
    const anyCar = () => { if (p.interior) C.interiors.exit(true); if (p.state === 'vehicle') return p.vehicle; const v = g.vehicles.spawn('sports', p.pos.x + 3, p.pos.z, 0, { parked: true }); v.touched = true; enterCar(v); return v; };
    const foot = () => { if (p.state === 'vehicle') g.exitVehicle(true); };
    if (!m) return 'idle';
    const st = m.st; if (!st) return 'nost';
    if (g.police.level > 0 && st.t !== 'lose' && st.t !== 'enter') g.police.clear();
    switch (st.t) {
      case 'enter': enterCar(m.refs[st.ref]); break;
      case 'goto':
        if (st.need === 'foot') foot(); else if (st.need === 'any') anyCar(); else if (st.need) enterCar(m.refs[st.need]);
        tp(st.at.x, st.at.z, p.interior ? __pv.IY : undefined); break;
      case 'collect': if (st.need === 'any') anyCar(); else if (st.need) enterCar(m.refs[st.need]); if (st.left.length) tp(st.left[0].x, st.left[0].z); break;
      case 'choose': if (st.need === 'any') anyCar(); tp(st.opts[1].at.x, st.opts[1].at.z); break;
      case 'pickup': foot(); tp(st.at.x, st.at.z, p.interior ? __pv.IY : undefined); break;
      case 'interior': foot(); C.interiors.enter(st.id, true); break;
      case 'exitInt': C.interiors.exit(true); break;
      case 'hold': foot(); tp(st.at.x, st.at.z, st.at.y); st.acc = st.dur; break;
      case 'lose': if (st.time > 1.2) g.police.clear(); break;
      case 'race': {
        const R = g.race.active; if (!R) break;
        if (R.phase === 'toStart') { anyCar(); tp(R.R.start.x, R.R.start.z); }
        else if (R.phase === 'count') R.count = 0.01;
        else if (R.phase === 'run') { anyCar(); const c = R.R.cps[R.cp]; if (c) tp(c.x + 2, c.z + 2); }
        break;
      }
      case 'tail': {
        const v = m.refs[st.ref]; anyCar();
        tp(v.pos.x - Math.sin(v.h) * 40, v.pos.z - Math.cos(v.h) * 40);
        if (st.time > 1.5) { v.pos.set(st.dest.x, __pv.groundY(st.dest.x, st.dest.z), st.dest.z); v.vel.set(0, 0); }
        break;
      }
      case 'wreck': { const v = m.refs[st.ref]; anyCar(); if (st.time > 0.5) v.health = 0; break; }
      case 'deliverCars': { const r = st.refs.find(k => !st.done[k]); if (r) { enterCar(m.refs[r]); tp(st.at.x, st.at.z); } break; }
      case 'owned': {
        if (!(p.state === 'vehicle' && p.vehicle.garageUid)) { if (!g.garageCar || !g.vehicles.list.includes(g.garageCar)) C.takeOut(g.save.garage[0].uid); enterCar(g.garageCar); }
        const bay = g.world.places.motorworks.bay; tp(bay.x, bay.z); break;
      }
      case 'store': { const v = m.refs[st.ref]; if (v) { enterCar(v); const gp = C.garagePoints()[0]; tp(gp.p.x, gp.p.z); C.storeVehicle(v, gp); } break; }
    }
    return st.t + '#' + m.si;
  };
});
const ids = await page.evaluate(() => __pv.CAMPAIGN.map(d => d.id));
for (let k = 0; k < ids.length + 3; k++) {
  const nx = await page.evaluate(() => {
    const g = window.game, d = g.campaign.nextJob(); if (!d) return null;
    if (d.night) g.env.time = 22;
    const c = g.missions.contacts.find(x => x.id === d.giver);
    if (g.player.state === 'vehicle') g.exitVehicle(true);
    if (c.interior) { if (!g.player.interior || g.player.interior.id !== c.interior) g.content.interiors.enter(c.interior, true); }
    else if (g.player.interior) g.content.interiors.exit(true);
    g.missions.cool = {};
    g.player.pos.set(c.x + 1.2, c.interior ? __pv.IY : __pv.groundY(c.x + 1.2, c.z), c.z); g.focus.set(c.x, 0, c.z);
    return { id: d.id, giver: d.giver, blk: g.campaign.blocker(d) };
  });
  if (!nx) break;
  await frames(page, 6);
  const off = await page.evaluate(() => { const o = window.game.missions.offer; return o ? { t: o.type, title: o.title, locked: o.locked, chip: o.chip } : null; });
  if (!off || off.t !== 'story') { check('offer for ' + nx.id, false, JSON.stringify([nx, off])); break; }
  await page.evaluate(() => { const g = window.game; g.missions.start(g.missions.offer); });
  let last = '', same = 0, guard = 0;
  while (guard++ < 400) {
    const r = await page.evaluate(() => window.__drv());
    if (r === 'idle') break;
    same = r === last ? same + 1 : 0; last = r;
    if (same > 60) { console.log('STUCK at', r, await page.evaluate(() => { const m = window.game.missions.active; return m ? m.objective : ''; })); break; }
    await frames(page, 3);
  }
  const res = await page.evaluate((id) => ({ done: !!window.game.save.story[id], rep: window.game.save.rep, money: window.game.save.money, log: window.__log.slice(-3), active: !!window.game.missions.active }), nx.id);
  check(`story ${nx.id} (${off.title})`, res.done, JSON.stringify(res));
  if (!res.done) { await page.evaluate(() => { const g = window.game; if (g.missions.active) g.missions.fail('test abort'); }); }
}
const fin = await page.evaluate(() => {
  const g = window.game, s = g.save;
  return { done: g.campaign.doneCount(), total: __pv.CAMPAIGN.length, rep: s.rep, repName: g.content.repName, garage: s.garage.map(e => e.type + ':' + e.origin), ach: Object.keys(s.achievements), money: s.money, pct: g.campaign.percent(), msgs: s.messages.length };
});
console.log(JSON.stringify(fin));
check('all story missions complete', fin.done === fin.total, fin.done + '/' + fin.total);
check('reached Legend rep', fin.rep >= 2000, fin.rep + ' ' + fin.repName);
check('rewards in garage', ['classic:reward', 'coupe:reward', 'unmarked:reward'].every(x => fin.garage.includes(x)), fin.garage.join(','));
check('achievements day_one + legend', fin.ach.includes('day_one') && fin.ach.includes('legend'), fin.ach.join(','));
// tull free race after the arc
const fr = await page.evaluate(() => { const g = window.game, c = g.missions.contacts.find(x => x.id === 'tull'); g.env.time = 22; g.env.setWeather('rain', true); const o = g.campaign.offerFor(c); return o && { type: o.type, title: o.title }; });
check('Tull offers free races after arc 3', fr && fr.type === 'srace', fr && fr.title);
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
