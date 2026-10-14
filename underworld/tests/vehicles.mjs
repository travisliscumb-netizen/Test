/* Vehicles: low-speed turning circle, U-turn inside one street, parking into a single garage bay and
   the mansion's underground garage, reverse steering, emergency braking distances per class (and
   that the class order survives), high-speed stability (no twitchy lock), doubled durability, the
   six damage stages and their effects, and car visual tiers / LOD. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.traffic.enabled = false; g.peds.enabled = false; g.police.enabled = false; g.police.clear(); g.debug.god = true; });

// drive on an empty test pad: a long straight road far from buildings, stepped with a fixed dt
const pad = (type, x, z, h, speed = 0) => ev(([type, x, z, h, speed]) => {
  const g = window.game, p = g.player;
  if (p.state === 'vehicle') g.exitVehicle(true);
  for (const v of g.vehicles.list.slice()) g.vehicles.despawn(v);
  g.resetPlayerState(x + 6, z, h);
  const v = g.vehicles.spawn(type, x, z, h, { speed }); v.touched = true; v.driver = 'test'; window.__v = v; return v.id;
}, [type, x, z, h, speed]);
// pure physics run (no collisions): N steps of 1/60 s with a control function
const sim = (ctl, steps) => ev(([ctl, steps]) => {
  const g = window.game, v = window.__v, out = [];
  for (let i = 0; i < steps; i++) {
    v.ctl.throttle = ctl.thr; v.ctl.steer = ctl.steer; v.ctl.handbrake = !!ctl.hb;
    v.step(1 / 60, g);
    const lv = v.localVel();
    out.push({ x: v.pos.x, z: v.pos.z, h: v.h, vf: lv.z, sp: v.speed, yr: v.yawRate });
    if (ctl.until === 'stop' && Math.abs(lv.z) < 0.05 && i > 5) break;
  }
  return out;
}, [ctl, steps]);
const circle = pts => { // fit a circle through the last chunk of a path: radius
  const a = pts[Math.floor(pts.length * 0.5)], b2 = pts[Math.floor(pts.length * 0.75)], c = pts[pts.length - 1];
  const d = 2 * (a.x * (b2.z - c.z) + b2.x * (c.z - a.z) + c.x * (a.z - b2.z));
  const ux = ((a.x ** 2 + a.z ** 2) * (b2.z - c.z) + (b2.x ** 2 + b2.z ** 2) * (c.z - a.z) + (c.x ** 2 + c.z ** 2) * (a.z - b2.z)) / d;
  const uz = ((a.x ** 2 + a.z ** 2) * (c.x - b2.x) + (b2.x ** 2 + b2.z ** 2) * (a.x - c.x) + (c.x ** 2 + c.z ** 2) * (b2.x - a.x)) / d;
  return Math.hypot(a.x - ux, a.z - uz);
};
const X = 6 * 80 + 300, Z = 6 * 80; // well outside the city on the west-east boulevard line? use a test pad far east in water-free space
const R = {};

// ---------------------------------------------------------------- 1. turning circle at parking speed
for (const type of ['compact', 'sedan', 'suv', 'van', 'sports', 'truck']) {
  await pad(type, 480, 480, 0, 0);
  // creep at ~3 m/s with full lock
  const run = await sim({ thr: 0.25, steer: 1 }, 360);
  const sp = run.slice(-60).reduce((a, s) => a + s.sp, 0) / 60;
  R[type] = { r: circle(run), sp };
}
const spec = await ev(() => Object.fromEntries(['compact', 'sedan', 'suv', 'van', 'sports', 'truck'].map(k => [k, { l: window.__pv.VEHICLES[k].l, w: window.__pv.VEHICLES[k].w }])));
for (const k in R) check(`${k}: low-speed turning radius is tight (${R[k].r.toFixed(1)} m at ${R[k].sp.toFixed(1)} m/s)`, R[k].r < (k === 'truck' ? 7.2 : k === 'van' ? 5.2 : 4.6), JSON.stringify(R[k]));
// a U-turn fits inside one 12 m street (road edge to road edge) for every car but the truck
for (const k of ['compact', 'sedan', 'suv', 'sports']) check(`${k}: U-turn fits inside a 12 m street`, 2 * R[k].r + spec[k].w < 12, `diameter ${(2 * R[k].r + spec[k].w).toFixed(1)} m`);

// ---------------------------------------------------------------- 2. reverse steering
await pad('sedan', 480, 480, 0, 0);
const rv = await sim({ thr: -0.6, steer: 1 }, 240);
const rvTurn = Math.abs(rv[rv.length - 1].h - rv[0].h);
check('reverse with full lock turns the car quickly (a three-point turn needs it)', rvTurn > 1.2, `turned ${(rvTurn * 57.3).toFixed(0)}° in 4 s`);
check('reverse steering is not slower than forward steering at the same speed', circle(rv) < R.sedan.r * 1.35, `reverse radius ${circle(rv).toFixed(1)} vs fwd ${R.sedan.r.toFixed(1)}`);

// ---------------------------------------------------------------- 3. emergency braking from 100 km/h
const STOP = {};
for (const type of ['sports', 'sedan', 'suv', 'van', 'truck']) {
  await pad(type, 480, 480, 0, 27.8);
  const run = await sim({ thr: -1, steer: 0, until: 'stop' }, 900);
  STOP[type] = Math.hypot(run[run.length - 1].x - 480, run[run.length - 1].z - 480);
  R['dive_' + type] = await ev(() => window.__v.pitch);
}
check('emergency stop from 100 km/h: sedan under 26 m', STOP.sedan < 26, STOP.sedan.toFixed(1) + ' m');
check('emergency stop from 100 km/h: sports car is the shortest', STOP.sports < STOP.sedan && STOP.sports < 21, STOP.sports.toFixed(1) + ' m');
check('class order kept: sports < sedan < SUV < van < truck', STOP.sports < STOP.sedan && STOP.sedan < STOP.suv && STOP.suv < STOP.van && STOP.van < STOP.truck, JSON.stringify(Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, +v.toFixed(1)]))));
check('nobody stops instantly (truck still needs 30 m+)', STOP.truck > 30, STOP.truck.toFixed(1) + ' m');
// weight transfer: the nose dives while braking
await pad('sedan', 480, 480, 0, 25);
await sim({ thr: -1, steer: 0 }, 20);
const dive = await ev(() => ({ pitch: window.__v.pitch, wt: window.__v.wt }));
check('hard braking pitches the nose down (weight transfer)', dive.pitch > 0.03 && dive.wt > 0.15, JSON.stringify(dive));

// ---------------------------------------------------------------- 4. high-speed stability
await pad('sports', 480, 480, 0, 40);
const hs = await sim({ thr: 0.6, steer: 1 }, 120);
const hsR = circle(hs);
check('at 140 km/h full lock gives a wide, stable arc (no twitch)', hsR > 45 && Math.max(...hs.map(s => Math.abs(s.yr))) < 1.3, `radius ${hsR.toFixed(0)} m, max yaw rate ${Math.max(...hs.map(s => Math.abs(s.yr))).toFixed(2)}`);
const lockHi = await ev(() => window.__v.maxSteerNow), lockLo = await (async () => { await pad('sports', 480, 480, 0, 2); await sim({ thr: 0, steer: 1 }, 10); return ev(() => window.__v.maxSteerNow); })();
check('steering lock: big at parking speed, progressively smaller at speed', lockLo > lockHi * 2, `low ${lockLo.toFixed(2)} high ${lockHi.toFixed(2)}`);

// ---------------------------------------------------------------- 5. doubled durability and thresholds
const crash = await ev(() => {
  const g = window.game, vm = g.vehicles, out = {};
  for (const s of [5, 8, 12, 16, 22, 28, 35]) { const v = vm.spawn('sedan', 480, 480, 0, {}); v.health = 100; vm.impact(v, s, 480, 482, 0, -1, null); out[s] = +(100 - v.health).toFixed(1); vm.despawn(v); }
  return out;
});
check('small bumps (5-8 m/s) do almost nothing', crash[5] === 0 && crash[8] < 1.5, JSON.stringify(crash));
check('a 43 km/h crash (12 m/s) matters but is survivable many times', crash[12] > 2 && crash[12] < 12, JSON.stringify(crash));
check('a 100 km/h crash (28 m/s) is serious', crash[28] > 25, JSON.stringify(crash));
check('a 126 km/h crash (35 m/s) is close to wrecking the car', crash[35] > 45, JSON.stringify(crash));
// gunfire: about twice as many shots to set a car on fire as before (old: 100 / 2.5 = 40 NPC hits)
const shots = await ev(() => { const g = window.game, v = g.vehicles.spawn('sedan', 480, 480, 0, {}); let n = 0; while (v.health > 0 && n < 500) { v.hurt(2.5, 'gun'); n++; } g.vehicles.despawn(v); return n; });
check('NPC gunfire: about double the hits to disable a car (80 vs 40)', shots >= 78 && shots <= 82, String(shots));
const stages = await ev(() => { const st = window.__pv.VEH_STAGES || []; return st.map(s => s[1]); });
check('six damage stages + destroyed: normal, light, damaged, smoking, heavy, critical, destroyed', stages.length === 7 && stages.includes('SMOKING') && stages.includes('DESTROYED'), stages.join(','));
// smoke only from the smoke threshold down; power loss by stage
const fx = await ev(() => {
  const g = window.game, p = g.player, v = g.vehicles.spawn('sedan', g.cam.pos.x + 5, g.cam.pos.z + 5, 0, {}); v.touched = true; const out = {};
  const em = g.fx.smoke.emit; let n = 0; g.fx.smoke.emit = function (x, y, z, ...a) { if (Math.hypot(x - v.pos.x, z - v.pos.z) < 6) n++; return em.call(this, x, y, z, ...a); };
  for (const h of [90, 70, 50, 40, 20, 8]) { v.health = h; n = 0; for (let i = 0; i < 120; i++) g.fx.update(1 / 60); out[h] = n; }
  g.fx.smoke.emit = em; g.vehicles.despawn(v); return out;
});
check('no smoke above the smoke threshold, smoke below it, more when heavily damaged', fx[90] === 0 && fx[70] === 0 && fx[50] === 0 && fx[40] > 0 && fx[20] >= fx[40], JSON.stringify(fx));
const power = await ev(() => { const g = window.game, out = {}; for (const h of [100, 60, 35, 20, 6]) { const v = g.vehicles.spawn('sedan', 480, 480, 0, {}); v.health = h; v.driver = 'test'; v.misT = -1; const R0 = Math.random; Math.random = () => 0.99; for (let i = 0; i < 120; i++) { v.ctl.throttle = 1; v.step(1 / 60, g); } Math.random = R0; out[h] = +v.speed.toFixed(1); g.vehicles.despawn(v); } return out; });
check('power fades with damage (stage by stage)', power[100] >= power[60] && power[60] > power[35] && power[35] > power[20] && power[20] >= power[6], JSON.stringify(power));

// ---------------------------------------------------------------- 6. visual tiers, rims and LOD
const vis = await ev(() => {
  const V = window.__pv.VEHICLES, out = {};
  for (const k in V) out[k] = V[k].tier;
  return out;
});
check('every vehicle has a visual tier', Object.values(vis).every(x => ['beater', 'common', 'nice', 'sport', 'luxury', 'rare'].includes(x)), JSON.stringify(vis));
const lod = await ev(() => {
  const g = window.game, p = g.player, vm = g.vehicles, out = {};
  const c = g.camera.position, near = vm.spawn('supercar', c.x + 8, c.z, 0, { parked: true }), far = vm.spawn('supercar', c.x + 140, c.z, 0, { parked: true });
  vm.render(0.016, 0, 0, g.camera);
  out.nearTris = near.mesh.geometry.index ? near.mesh.geometry.index.count / 3 : near.mesh.geometry.attributes.position.count / 3;
  out.farTris = far.mesh.geometry.index ? far.mesh.geometry.index.count / 3 : far.mesh.geometry.attributes.position.count / 3;
  out.compactTris = (() => { const v = vm.spawn('compact', c.x + 9, c.z + 4, 0, { parked: true }); vm.render(0.016, 0, 0, g.camera); const n = v.mesh.geometry.attributes.position.count / 3; vm.despawn(v); return n; })();
  vm.despawn(near); vm.despawn(far);
  return out;
});
check('distant cars use a light LOD mesh', lod.farTris < lod.nearTris * 0.5, JSON.stringify(lod));
check('a rare supercar has more detail up close than a common compact', lod.nearTris > lod.compactTris, JSON.stringify(lod));

// ---------------------------------------------------------------- 7. parking with the real controls (game loop, collisions)
// a pure-pursuit driver steers through the analog stick and gas/brake buttons, like a thumb would
await ev(() => {
  const g = window.game;
  g.__drv = null;
  const orig = g.driveControl.bind(g);
  g.driveControl = function (dt) {
    const d = g.__drv, v = g.player.vehicle, inp = g.input;
    if (d && v) {
      const lv = v.localVel();
      // next waypoint: the first one we are not yet near
      while (d.i < d.pts.length - 1 && Math.hypot(d.pts[d.i].x - v.pos.x, d.pts[d.i].z - v.pos.z) < 3) d.i++;
      const tp = d.pts[d.i], last = d.i === d.pts.length - 1;
      const want = Math.atan2(tp.x - v.pos.x, tp.z - v.pos.z);
      let e = want - v.h; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
      const dist = Math.hypot(tp.x - v.pos.x, tp.z - v.pos.z);
      const vT = last ? Math.max(0.9, Math.min(3.2, dist * 0.8)) : 4.2;
      inp.stick.active = true; inp.stick.x = -Math.max(-1, Math.min(1, e * 2.4)); inp.stick.y = 0;
      inp.down.delete('gas'); inp.down.delete('brake');
      if (last && (dist < 0.5 || d.done)) { inp.down.add('brake'); d.done = true; }
      else if (lv.z < vT - 0.4) inp.down.add('gas'); else if (lv.z > vT + 0.6) inp.down.add('brake');
      d.minHp = Math.min(d.minHp, v.health);
    }
    return orig(dt);
  };
});
const park = async (pts, maxFrames) => {
  await ev(pts => { window.game.__drv = { pts, i: 0, done: false, minHp: 100 }; }, pts);
  const trace = []; for (let k = 0; k < maxFrames; k++) { await frames(page, 4); trace.push(await ev(() => { const g = window.game, v = g.player.vehicle, d = g.__drv; return v ? [Math.round(v.pos.x * 10) / 10, Math.round(v.pos.z * 10) / 10, d.i, d.done ? 1 : 0, Math.round(v.speed * 10) / 10, v.id] : ['none', g.player.state]; })); if (await ev(() => window.game.__drv.done && window.game.player.vehicle.speed < 0.3)) break; }
  const r = await ev(() => { const g = window.game, d = g.__drv, v = g.player.vehicle; g.__drv = null; const i = g.input; i.stick.active = false; i.stick.x = 0; i.down.delete('gas'); i.down.delete('brake'); return { x: v.pos.x, z: v.pos.z, h: v.h, done: d.done, minHp: d.minHp }; });
  r.trace = trace.filter((x, k) => k % 4 === 0 || k > trace.length - 5);
  return r;
};
// single garage: from the street, turn in and stop in the bay
const sg = await ev(() => {
  const g = window.game, PM = g.uw.props, PB = window.__pv.PROP_BY_ID, d = PB.single1;
  g.uw.S.props.single1 = { owned: true, dmg: 0, since: 1 };
  const h = g.world.homes.find(x => x.propId === 'single1'), bay = PM.bays(d)[0];
  const f = [[0, -1], [0, 1], [-1, 0], [1, 0]][h.face];
  // start on the street 14 m out from the garage, parked along the road
  const sx = h.garageFront.x + f[0] * 14 - f[1] * 7, sz = h.garageFront.z + f[1] * 14 + f[0] * 7;
  if (g.player.state === 'vehicle') g.exitVehicle(true);
  for (const v of g.vehicles.list.slice()) g.vehicles.despawn(v);
  g.resetPlayerState(sx, sz, 0);
  const v = g.vehicles.spawn('sedan', sx, sz, Math.atan2(f[1], -f[0]), { parked: true }); v.touched = true; g.completeEnter(v);
  return { bay: { x: bay.x, z: bay.z, h: bay.h }, front: { x: h.garageFront.x + f[0] * 5, z: h.garageFront.z + f[1] * 5 }, mid: { x: h.garageFront.x + f[0] * 9, z: h.garageFront.z + f[1] * 9 } };
});
await frames(page, 30);
const r1 = await park([sg.mid, sg.front, sg.bay], 260);
const e1 = Math.hypot(r1.x - sg.bay.x, r1.z - sg.bay.z);
check('single garage: turn in from the street and stop in the bay', r1.done && e1 < 1.0, `off ${e1.toFixed(2)} m, done ${r1.done}` + (e1 < 1 ? '' : ' ' + JSON.stringify(r1.trace)));
check('single garage: no wall scraped on the way in', r1.minHp > 99, `health low ${r1.minHp.toFixed(1)}`);
// mansion: the motor court ramp, then a bay in the underground garage
const mc = await ev(() => {
  const g = window.game; g.uw.S.props.mansion = { owned: true, dmg: 0, since: 1 };
  const D = g.vspaces.byProp('mansion'), S = D.street;
  if (g.player.state === 'vehicle') g.exitVehicle(true);
  for (const v of g.vehicles.list.slice()) g.vehicles.despawn(v);
  g.resetPlayerState(S.x + 3, S.z + 14, 0);
  const v = g.vehicles.spawn('sports', S.x, S.z + 14, Math.PI, { parked: true }); v.touched = true; g.completeEnter(v);
  return { S: { x: S.x, z: S.z } };
});
for (let k = 0; k < 160; k++) { await ev(() => window.game.input.down.add('gas')); await frames(page, 2); if (await ev(() => !!(window.game.player.interior && window.game.player.interior.vspace))) break; }
await ev(() => window.game.input.down.delete('gas'));
await page.waitForFunction(() => !window.game.fading, null, { timeout: 30000 }); await frames(page, 10);
const mb = await ev(() => { const g = window.game, D = g.vspaces.byProp('mansion'), v = g.player.vehicle, b5 = D.bays[5]; const fx = Math.sin(b5.h), fz = Math.cos(b5.h); return { inside: !!(g.player.interior && g.player.interior.vspace), bay: { x: b5.x, z: b5.z }, pre: { x: b5.x - fx * 8, z: b5.z - fz * 8 }, pre2: { x: b5.x - fx * 4, z: b5.z - fz * 4 }, car: { x: v.pos.x, z: v.pos.z } }; });
check('mansion: the ramp takes the car down into the motor court', mb.inside, JSON.stringify(mb.car));
if (mb.inside) {
  const r2 = await park([mb.pre, mb.pre2, mb.bay], 260);
  const e2 = Math.hypot(r2.x - mb.bay.x, r2.z - mb.bay.z);
  check('mansion garage: manoeuvre into a bay among the pillars', r2.done && e2 < 1.0, `off ${e2.toFixed(2)} m` + (e2 < 1 ? '' : ' ' + JSON.stringify(r2.trace)));
  check('mansion garage: no pillar or wall hit', r2.minHp > 99, r2.minHp.toFixed(1));
}

console.log('turning radii', JSON.stringify(R));
console.log('stopping distances', JSON.stringify(STOP));
// ---------------------------------------------------------------- 8. collectibles: rare finds, tier value, the garage as a collection
const col = await page.evaluate(() => {
  const g = window.game, w = g.world, P = window.__pv, out = { rich: 0, poor: 0, stalls: { rich: 0, poor: 0 } };
  // stream the Crestmoor/Financial blocks and the Old Quarter, count rare-tier parked cars
  const count = (bx0, bz0, bx1, bz1) => { let r = 0, n = 0; for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) { const b = w.block(bx, bz); g.vehicles.updateParked(b.cx, b.cz, 40); const cars = g.vehicles.parkedBlocks.get(b.i) || []; for (const v of cars) { n++; if (v.vtier === 'rare' && !v.rareFind) r++; } } return { r, n }; };
  out.richC = count(4, 2, 8, 6); out.poorC = count(0, 4, 2, 6);
  // value by tier: the same model as a beater, as stock, and a rare model
  const G = g.content, e = (type, vtier) => ({ type, vtier, origin: 'stolen', tune: { engine: 0, brakes: 0, grip: 0, armor: 0 }, dmg: 0 });
  out.price = { beater: G.sellPrice(e('sedan', 'beater')), common: G.sellPrice(e('sedan', 'common')), rare: G.sellPrice(e('supercar', 'rare')), rareBase: G.sellPrice(e('supercar', 'sport')) };
  const v = g.vehicles.spawn('sedan', 300, 300, 0, { parked: true, vtier: 'beater' }); out.chopBeater = g.uw.chopValue(v); v.setTier('common'); out.chopCommon = g.uw.chopValue(v); g.vehicles.despawn(v);
  // the collection summary
  const s = g.save; const keep = s.garage.slice();
  s.garage.push({ ...e('supercar', 'rare'), uid: 9901, color: 0xffffff, at: null, out: false, trunk: {} }, { ...e('classic', 'rare'), uid: 9902, color: 0xffffff, at: null, out: false, trunk: {} }, { ...e('sedan', 'beater'), uid: 9903, color: 0xffffff, at: null, out: false, trunk: {} });
  out.col = G.collection();
  s.garage.length = 0; s.garage.push(...keep);
  out.types = P.VEHICLES ? Object.keys(P.VEHICLES).filter(k => P.VEHICLES[k].tier === 'rare') : [];
  return out;
});
check('rare models turn up parked in the wealthy districts, not in the Old Quarter (placed secrets like the rooftop Zephyr aside)', col.richC.r >= 1 && col.poorC.r === 0, JSON.stringify([col.richC, col.poorC]));
check('car value follows tier: beater < stock, rare finds carry a collector premium', col.price.beater < col.price.common && col.price.rare > col.price.rareBase && col.chopBeater < col.chopCommon, JSON.stringify([col.price, col.chopBeater, col.chopCommon]));
check('garage collection: models owned, rare finds counted, total value', col.col.rare === 2 && col.col.rareModels === 2 && col.col.rareOf === 4 && col.col.byTier.rare === 2 && col.col.byTier.beater === 1 && col.col.value > col.price.rare, JSON.stringify(col.col));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'vehicles');
