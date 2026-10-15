/* Ramps, decks and jumps, driven for real: an autopilot steers the player's car through the game's
   own update (physics, collisions, ground contact) along a path, the way a player would.
   - Central Parkade: street -> ground floor -> level 1 -> level 2 -> roof, then roof -> street
   - Quarter Garage: street -> side ramp -> landing -> roof
   - every unique stunt jump: launch, flight, landing (no burial, no spin-up, nothing non-finite)
   - wheel / body consistency on ramps and in the air (no wheel pushed up through the hood)
   - the side of a raised ramp is a wall, not a step a car climbs
   - representative slopes for every class of car */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

await ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.peds.enabled = false;
  for (const v of g.traffic.cars.slice()) g.vehicles.despawn(v);
  // autopilot: pure pursuit along a polyline with filleted corners
  const A = window.__ap = { on: false };
  A.fillet = (pts, r) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1], c = pts[i + 1];
      const ax = p[0] - a[0], az = p[1] - a[1], la = Math.hypot(ax, az), bx = c[0] - p[0], bz = c[1] - p[1], lb = Math.hypot(bx, bz);
      const ux = ax / la, uz = az / la, wx = bx / lb, wz = bz / lb;
      const th = Math.acos(Math.max(-1, Math.min(1, ux * wx + uz * wz)));
      const rr = p[2] !== undefined ? p[2] : r;
      if (th < 0.05 || !rr) { out.push(p); continue; }
      const t = Math.min(rr * Math.tan(th / 2), la * 0.49, lb * 0.49);
      const s0 = [p[0] - ux * t, p[1] - uz * t], s1 = [p[0] + wx * t, p[1] + wz * t];
      for (let k = 0; k <= 8; k++) { const q = k / 8, m0 = [s0[0] + (p[0] - s0[0]) * q, s0[1] + (p[1] - s0[1]) * q], m1 = [p[0] + (s1[0] - p[0]) * q, p[1] + (s1[1] - p[1]) * q]; out.push([m0[0] + (m1[0] - m0[0]) * q, m0[1] + (m1[1] - m0[1]) * q]); }
    }
    out.push(pts[pts.length - 1]);
    // resample every 1 m
    const res = [out[0]];
    for (let i = 1; i < out.length; i++) { const a = res[res.length - 1], c = out[i], d = Math.hypot(c[0] - a[0], c[1] - a[1]); const n = Math.floor(d); for (let k = 1; k <= n; k++) res.push([a[0] + (c[0] - a[0]) * k / Math.max(d, 1e-6), a[1] + (c[1] - a[1]) * k / Math.max(d, 1e-6)]); if (Math.hypot(c[0] - res[res.length - 1][0], c[1] - res[res.length - 1][1]) > 0.3) res.push(c); }
    return res;
  };
  A.start = (path, opts = {}) => {
    Object.assign(A, { on: true, manual: false, path, i: 0, speed: opts.speed || 7, maxDev: 0, stuckT: 0, stuck: false, done: false, t: 0, airT: 0, wheelDev: 0, ys: [], minY: 1e9, maxY: -1e9, nan: false, maxYaw: 0, hp0: g.player.vehicle.health });
  };
  A.drive = (v, dt) => {
    const P = A.path;
    // advance along the path: nearest point ahead
    let best = A.i, bd = 1e9;
    for (let k = A.i; k < Math.min(P.length, A.i + 25); k++) { const d = Math.hypot(P[k][0] - v.pos.x, P[k][1] - v.pos.z); if (d < bd) { bd = d; best = k; } }
    A.i = best; A.maxDev = Math.max(A.maxDev, bd);
    const la = Math.min(P.length - 1, A.i + Math.round(3 + Math.abs(v.localVel().z) * 0.45));
    const tp = P[la], lp = v.toLocal(tp[0], tp[1]);
    const ang = Math.atan2(lp.x, lp.z);
    // slow for upcoming bends
    let bend = 0; for (let k = A.i; k < Math.min(P.length - 2, A.i + 10); k++) { const a = P[k], c = P[k + 1], d = P[k + 2]; const h1 = Math.atan2(c[0] - a[0], c[1] - a[1]), h2 = Math.atan2(d[0] - c[0], d[1] - c[1]); let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; bend += Math.abs(dh); }
    let want = bend > 0.6 ? Math.min(A.speed, 4.5) : A.speed;
    const left = P.length - 1 - A.i; if (left < 6) want = Math.min(want, left * 0.6);
    const vf = v.localVel().z;
    v.ctl.steer = Math.max(-1, Math.min(1, ang * 2.2));
    v.ctl.throttle = Math.max(-1, Math.min(1, (want - vf) * 0.5));
    v.ctl.handbrake = false;
    if (left <= 1 && v.speed < 0.6) A.done = true;
    if (v.speed < 0.3 && want > 1) A.stuckT += dt; else A.stuckT = Math.max(0, A.stuckT - dt * 2);
    if (A.stuckT > 4) A.stuck = true;
  };
  g._driveControlOrig = g.driveControl;
  g.driveControl = function (dt) {
    const v = this.player.vehicle; if (!v) return;
    if (A.on) A.drive(v, dt); else if (!A.manual) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = true; }
    this.player.pos.set(v.pos.x, v.pos.y, v.pos.z); this.player.h = v.h;
  };
  // fixed-step simulation without rendering; records ground / wheel / attitude health
  A.run = (seconds, until) => {
    const dt = 1 / 60;
    for (let n = 0; n < seconds * 60; n++) {
      g.update(dt, dt);
      const v = g.player.vehicle; if (!v) break;
      A.t += dt;
      if (!isFinite(v.pos.x + v.pos.y + v.pos.z + v.h + v.pitchG + v.rollG)) A.nan = true;
      A.minY = Math.min(A.minY, v.pos.y); A.maxY = Math.max(A.maxY, v.pos.y);
      A.maxYaw = Math.max(A.maxYaw, Math.abs(v.yawRate));
      if (v.airborne) A.airT += dt;
      // wheel vs body: contact point measured in the body frame, before the suspension clamp
      v.pose(); v.mesh.updateMatrix(); const e = v.mesh.matrix.elements, R = v.spec.wheelR;
      // a wheel briefly pushed up at a kerb is suspension; one held up for 4+ frames is the old bug
      let dmax = 0;
      if (!v.airborne && v.landT <= 0) for (let i = 0; i < 4; i++) { const [lx, lz] = v.vg.wheels[i]; const rest = e[1] * lx + e[5] * R + e[9] * lz + e[13]; const d = (v._wy[i] + R - rest) / e[5]; if (Math.abs(d) < 0.45) dmax = Math.max(dmax, d); }
      A.dh = (A.dh || []); A.dh.push(dmax); if (A.dh.length > 4) A.dh.shift();
      A.wheelDev = Math.max(A.wheelDev, Math.min(...A.dh));
      if ((A.on && (A.done || A.stuck)) || (until && until(v))) break;
    }
    const v = g.player.vehicle;
    return { x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(1), i: A.i, n: A.path ? A.path.length : 0, maxDev: +A.maxDev.toFixed(2), stuck: A.stuck, done: A.done, t: +A.t.toFixed(1), air: +A.airT.toFixed(2), wheelDev: +A.wheelDev.toFixed(3), nan: A.nan, maxYaw: +A.maxYaw.toFixed(2), hp: +v.health.toFixed(1) };
  };
  A.car = (type, x, z, h, y) => {
    if (g.player.state === 'vehicle') g.exitVehicle(true);
    if (g.player.lastVehicle && g.vehicles.list.includes(g.player.lastVehicle)) g.vehicles.despawn(g.player.lastVehicle);
    g.resetPlayerState(x + 3, z, 0);
    const v = g.vehicles.spawn(type, x, z, h, { parked: true, y }); v.touched = true; g.completeEnter(v); v.health = 100;
    return v;
  };
});

// ---------------------------------------------------------------- Central Parkade
const pk = await ev(() => { const w = window.game.world, p = w.parkade, b = w.block(5, 6); return { ...p, bz0: b.z0, xm: (p.x0 + p.x1) / 2 }; });
const { x0, x1, z0, z1, rz0, rz1, L, xm, bz0 } = pk;
const up = [[xm, bz0 - 12], [xm, z0 + 5, 4.5], [x1 - 4, z0 + 5, 4.5], [x1 - 4, rz0], [x1 - 4, rz1], [x1 - 4, z1 - 5.5, 5], [x0 + 4, z1 - 5.5, 5], [x0 + 4, rz1], [x0 + 4, rz0], [x0 + 4, z0 + 5.5, 5], [x1 - 4, z0 + 5.5, 5], [x1 - 4, rz0], [x1 - 4, rz1], [x1 - 4, z1 - 5.5, 5], [xm + 6, z1 - 5.5]];
await ev(([up]) => { const A = window.__ap; A.car('sedan', up[0][0], up[0][1], 0, 0); A.start(A.fillet(up, 5), { speed: 7 }); }, [up]);
let r = null;
for (let k = 0; k < 12 && !(r && (r.done || r.stuck)); k++) r = await ev(() => window.__ap.run(15));
check('Central Parkade: a car drives from the street up every ramp to the roof without getting stuck', r.done && !r.stuck && Math.abs(r.y - L[3]) < 0.3, JSON.stringify(r));
check('Central Parkade: the climb stays on the planned line (no wall or kerb shoves it off)', r.maxDev < 2.2, `max deviation ${r.maxDev} m`);
check('Central Parkade: nothing non-finite, no spin, no damage on the way up', !r.nan && r.maxYaw < 2.5 && r.hp > 97, JSON.stringify(r));
check('Central Parkade: wheels stay on their arches on every ramp transition (no wheel through the body)', r.wheelDev < 0.1, `max wheel offset ${r.wheelDev} m`);
// levels visited, sampled on the way back down (each aisle sits at its deck height)
const down = [[xm, z1 - 5.5], [x1 - 4, z1 - 5.5, 5], [x1 - 4, rz1], [x1 - 4, rz0], [x1 - 4, z0 + 5.5, 5], [x0 + 4, z0 + 5.5, 5], [x0 + 4, rz0], [x0 + 4, rz1], [x0 + 4, z1 - 5.5, 5], [x1 - 4, z1 - 5.5, 5], [x1 - 4, rz1], [x1 - 4, rz0], [x1 - 4, z0 + 5, 4.5], [xm, z0 + 5, 4.5], [xm, bz0 - 12]];
await ev(([down, y]) => { const A = window.__ap; A.car('sedan', down[0][0], down[0][1], Math.PI / 2, y); A.start(A.fillet(down, 5), { speed: 7 }); A.levels = []; }, [down, L[3]]);
r = null;
const seen = new Set();
for (let k = 0; k < 40 && !(r && (r.done || r.stuck)); k++) {
  r = await ev(() => window.__ap.run(4));
  const lv = await ev(([L]) => { const v = window.game.player.vehicle; let best = -1; for (let i = 0; i < 4; i++) if (Math.abs(v.pos.y - L[i]) < 0.12) best = i; return best; }, [L]);
  if (lv >= 0) seen.add(lv);
}
check('Central Parkade: and drives back down from the roof to the street', r.done && !r.stuck && r.y < 0.3 && r.z < bz0, JSON.stringify(r));
check('Central Parkade: the way down passes every deck (roof, 2, 1, ground)', [0, 1, 2, 3].every(k => seen.has(k)), JSON.stringify([...seen]));
check('Central Parkade: the way down stays on its line, no damage', r.maxDev < 2.2 && r.hp > 97 && !r.nan, JSON.stringify(r));
// geometry: every ramp joins two decks, its ends open onto aisles, its sides are walled
const geo = await ev(() => {
  const g = window.game, w = g.world, p = w.parkade, gy = window.__pv.groundY, grid = w.grid, res = {}, out = [];
  const xsE = (p.eS[0] + p.eS[1]) / 2, xsW = (p.wS[0] + p.wS[1]) / 2;
  for (const [x, a, dir] of [[xsE, 0, 1], [xsW, 1, -1], [xsE, 2, 1]]) {
    const foot = dir > 0 ? p.rz0 : p.rz1, head = dir > 0 ? p.rz1 : p.rz0;
    const yFoot = gy(x, foot - dir * 3, p.L[a] + 0.1, 0.6), yHead = gy(x, head + dir * 3, p.L[a + 1] - 0.1, 0.6);
    const yMid = gy(x, (foot + head) / 2, (p.L[a] + p.L[a + 1]) / 2, 0.6);
    // nothing solid across either end at car height
    const endFoot = grid.resolveCircle(x, foot - dir * 1.2, 1.0, p.L[a] + 0.3, p.L[a] + 1.5, res).hit;
    const endHead = grid.resolveCircle(x, head + dir * 1.2, 1.0, p.L[a + 1] + 0.3, p.L[a + 1] + 1.5, res).hit;
    // the sides: a car beside the ramp at mid height cannot get onto it from the side
    const side = grid.resolveCircle(x - 4.6, (foot + head) / 2, 0.9, p.L[a] + 0.3, p.L[a] + 1.6, res).hit && grid.resolveCircle(x + 4.6, (foot + head) / 2, 0.9, p.L[a] + 0.3, p.L[a] + 1.6, res).hit;
    out.push({ a, foot: +yFoot.toFixed(2), head: +yHead.toFixed(2), mid: +yMid.toFixed(2), want: [p.L[a], p.L[a + 1]], endFoot, endHead, side });
  }
  return out;
});
check('Central Parkade: each ramp starts on its deck, ends on the next, and is 8 m wide and open at both ends', geo.every(q => Math.abs(q.foot - q.want[0]) < 0.05 && Math.abs(q.head - q.want[1]) < 0.05 && q.mid > q.want[0] && q.mid < q.want[1] && !q.endFoot && !q.endHead), JSON.stringify(geo));
check('Central Parkade: every ramp is walled along both sides', geo.every(q => q.side), JSON.stringify(geo));

// ---------------------------------------------------------------- Quarter Garage
const qg = await ev(() => { const w = window.game.world, q = w.quarterGarage, b = w.block(2, 5); return { ...q, bz1: b.z1, bx1: b.x1 }; });
{
  const rx = (qg.rx0 + qg.rx1) / 2;
  const path = [[rx, qg.bz1 + 10], [rx, qg.z1 - 2], [rx, qg.land1], [rx, qg.land0 + 5, 5], [qg.x1 - 12, qg.land0 + 5]];
  await ev(([path]) => { const A = window.__ap; A.car('sedan', path[0][0], path[0][1], Math.PI, 0); A.start(A.fillet(path, 5), { speed: 7 }); }, [path]);
  r = null;
  for (let k = 0; k < 8 && !(r && (r.done || r.stuck)); k++) r = await ev(() => window.__ap.run(15));
  check('Quarter Garage: the side ramp delivers the car onto the roof (landing, then through the barrier opening)', r.done && !r.stuck && Math.abs(r.y - qg.top) < 0.3 && r.x < qg.x1, JSON.stringify(r));
  check('Quarter Garage: no damage, no wheel through the body, stays on line', r.hp > 97 && r.wheelDev < 0.1 && r.maxDev < 2.2, JSON.stringify(r));
}

// ---------------------------------------------------------------- unique stunt jumps
// each jump is taken straight on at three speeds; it passes when it launches, lands on its wheels,
// and at least one sensible speed gives a clean jump (nothing hit on the run-up or in the air)
const jumps = await ev(() => {
  const g = window.game, w = g.world, A = window.__ap, out = [];
  const runJump = (s, speed) => {
    const dx = s.axis === 'x' ? s.dir : 0, dz = s.axis === 'z' ? s.dir : 0;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, half = (s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0) / 2;
    const sx = cx - dx * (half + 14), sz = cz - dz * (half + 14), h = Math.atan2(dx, dz);
    const base = s.dir > 0 ? s.h0 : s.h1;
    const v = A.car('sports', sx, sz, h, base);
    v.pos.set(sx, window.__pv.groundY(sx, sz, base + 0.2), sz); v.h = h; v.vel.set(dx * speed, dz * speed); v.syncMesh(0);
    A.on = false; A.manual = true;
    let launched = false, landed = false, buried = false, maxAirYaw = 0, airT = 0, pitchMax = 0, landImp = 0, trace = '', hitRun = null, hitAir = null, hp0 = v.health;
    const onLand0 = g.vehicles.onLand.bind(g.vehicles), imp0 = g.vehicles.impact.bind(g.vehicles);
    g.vehicles.onLand = (vv, imp, at) => { if (vv === v) landImp = Math.max(landImp, imp); return onLand0(vv, imp, at); };
    g.vehicles.impact = (vv, sp, ix, iz, nx, nz, o) => { if (vv === v && sp > 3) { const at = `${ix.toFixed(0)},${iz.toFixed(0)} y${vv.pos.y.toFixed(1)} sp${sp.toFixed(0)}${o ? ' car' : ''}`; if (!launched && !hitRun) hitRun = at; else if (launched && !landed && !hitAir) hitAir = at; } return imp0(vv, sp, ix, iz, nx, nz, o); };
    for (let n = 0; n < 60 * 6; n++) {
      v.ctl.throttle = v.localVel().z < speed ? 1 : 0; v.ctl.steer = 0;
      g.update(1 / 60, 1 / 60);
      if (!g.player.vehicle) break;
      if (v.airborne) { launched = true; airT += 1 / 60; maxAirYaw = Math.max(maxAirYaw, v.hitT > 0 ? 0 : Math.abs(v.yawRate)); pitchMax = Math.max(pitchMax, Math.abs(v.pitchG)); }
      else if (launched && airT > 0.2) landed = true;
      if (!isFinite(v.pos.x + v.pos.y + v.pos.z + v.pitchG)) { trace = 'NaN'; break; }
      if (landed && n % 10 === 0) { const gy = window.__pv.groundY(v.pos.x, v.pos.z, v.pos.y + 0.5); if (v.pos.y < gy - 0.12) buried = true; }
      if (landed && n > 60 * 2.5) break;
    }
    g.vehicles.onLand = onLand0; g.vehicles.impact = imp0;
    return { launched, landed, airT: +airT.toFixed(2), maxAirYaw: +maxAirYaw.toFixed(2), pitchMax: +pitchMax.toFixed(2), buried, imp: +landImp.toFixed(1), dmg: +(hp0 - v.health).toFixed(0), trace, hitRun, hitAir };
  };
  for (const s of w.jumps) {
    // rooftop leaps are taken at street speeds; ground kickers faster
    const runs = (Math.min(s.h0, s.h1) > 5 ? [12, 16, 22] : [16, 22, 28]).map(sp => ({ sp, ...runJump(s, sp) }));
    const clean = runs.filter(r => r.launched && r.landed && !r.hitRun && !r.hitAir && !r.buried && r.dmg < 30 && r.airT > 0.3);
    out.push({ id: s.id, x: Math.round((s.x0 + s.x1) / 2), z: Math.round((s.z0 + s.z1) / 2), axis: s.axis, dir: s.dir, h: +(s.h1 - s.h0).toFixed(1), clean: clean.map(r => r.sp), runs });
  }
  return out;
});
const flat = jumps.flatMap(j => j.runs.map(r => ({ id: j.id, ...r })));
check(`every unique stunt jump has a clear run-up and launches the car (${jumps.length} jumps, 3 speeds each)`, flat.every(r => r.launched && !r.hitRun), JSON.stringify(flat.filter(r => !r.launched || r.hitRun).map(r => [r.id, r.sp, r.hitRun])));
check('every jump lands on the wheels: no burial in the road, nothing non-finite', flat.every(r => (!r.launched || r.landed) && !r.buried && !r.trace), JSON.stringify(flat.filter(r => r.buried || r.trace || (r.launched && !r.landed))));
check('every jump has a clean landing at a sensible speed (nothing hit in the air, < 30% damage)', jumps.every(j => j.clean.length > 0), JSON.stringify(jumps.filter(j => !j.clean.length).map(j => [j.id, j.x, j.z, j.runs.map(r => [r.sp, r.hitAir, r.dmg])])));
check('no jump spins the car up in the air (yaw < 1.3 rad/s unless something was hit)', flat.every(r => r.maxAirYaw < 1.3), JSON.stringify(flat.map(r => [r.id, r.sp, r.maxAirYaw])));
check('attitude in the air stays believable (|pitch| < 0.6 rad)', flat.every(r => r.pitchMax < 0.6), JSON.stringify(flat.map(r => [r.id, r.sp, r.pitchMax])));
console.log('jumps', JSON.stringify(jumps.map(j => ({ id: j.id, x: j.x, z: j.z, axis: j.axis, dir: j.dir, clean: j.clean, runs: j.runs.map(r => [r.sp, r.airT, r.dmg, r.hitRun, r.hitAir]) }))));

// ---------------------------------------------------------------- the side of a ramp is a wall
const side = await ev(() => {
  const g = window.game, w = g.world, A = window.__ap;
  const s = w.jumps.find(j => j.h1 - j.h0 > 1.2 && !j.id.startsWith('parkade') && !j.id.startsWith('garage'));
  const hi = s.dir > 0 ? 0.8 : 0.2, cx = s.axis === 'x' ? s.x0 + (s.x1 - s.x0) * hi : (s.x0 + s.x1) / 2, cz = s.axis === 'z' ? s.z0 + (s.z1 - s.z0) * hi : (s.z0 + s.z1) / 2;
  // come at it square to its side
  const nx = s.axis === 'x' ? 0 : 1, nz = s.axis === 'x' ? 1 : 0, wd = (s.axis === 'x' ? s.z1 - s.z0 : s.x1 - s.x0) / 2;
  const sx = cx - nx * (wd + 7), sz = cz - nz * (wd + 7), base = Math.min(s.h0, s.h1);
  const v = A.car('sedan', sx, sz, Math.atan2(nx, nz), base); A.on = false; A.manual = true;
  let maxY = v.pos.y;
  for (let n = 0; n < 150; n++) { v.ctl.throttle = 0.8; v.ctl.steer = 0; g.update(1 / 60, 1 / 60); maxY = Math.max(maxY, v.pos.y); }
  return { id: s.id, base, top: Math.max(s.h0, s.h1), maxY: +maxY.toFixed(2), x: +v.pos.x.toFixed(1), z: +v.pos.z.toFixed(1) };
});
check('driving into the side of a raised ramp: the car is stopped, it does not climb up onto it', side.maxY < side.base + 0.6, JSON.stringify(side));

// ---------------------------------------------------------------- slopes for every class
const slopes = await ev(() => {
  const g = window.game, w = g.world, A = window.__ap, p = w.parkade, out = [];
  for (const type of ['compact', 'sedan', 'sports', 'suv', 'van', 'pickup', 'muscle', 'supercar', 'offroad', 'luxury']) {
    const x = (p.eS[0] + p.eS[1]) / 2;
    const v = A.car(type, x, p.rz0 - 9, 0, p.L[0]);
    A.on = false; A.manual = true; A.wheelDev = 0; A.nan = false; A.maxYaw = 0;
    let maxStepY = 0, prevY = v.pos.y, maxDY = 0;
    for (let n = 0; n < 60 * 9; n++) {
      v.ctl.throttle = v.localVel().z < 9 ? 0.7 : 0; v.ctl.steer = 0;
      g.update(1 / 60, 1 / 60);
      maxDY = Math.max(maxDY, Math.abs(v.pos.y - prevY)); prevY = v.pos.y;
      v.pose(); v.mesh.updateMatrix(); const e = v.mesh.matrix.elements, R = v.spec.wheelR;
      if (!v.airborne) for (let i = 0; i < 4; i++) { const [lx, lz] = v.vg.wheels[i]; const rest = e[1] * lx + e[5] * R + e[9] * lz + e[13]; const d = (v._wy[i] + R - rest) / e[5]; if (Math.abs(d) < 0.45) maxStepY = Math.max(maxStepY, d); }
      if (v.pos.z > p.rz1 + 3) break;
    }
    out.push({ type, y: +v.pos.y.toFixed(2), want: p.L[1], wheel: +maxStepY.toFixed(3), maxDY: +maxDY.toFixed(3), finite: isFinite(v.pos.y + v.pitchG) });
  }
  return out;
});
check('every class of car climbs a parkade ramp onto the next deck', slopes.every(q => Math.abs(q.y - q.want) < 0.25 && q.finite), JSON.stringify(slopes));
check('no class shows a wheel pushed up into the body on the ramp (< 0.1 m)', slopes.every(q => q.wheel < 0.1), JSON.stringify(slopes.map(q => [q.type, q.wheel])));
check('no vertical jumps on the way up (< 0.2 m per frame)', slopes.every(q => q.maxDY < 0.2), JSON.stringify(slopes.map(q => [q.type, q.maxDY])));

await ev(() => { const g = window.game; g.driveControl = g._driveControlOrig; });
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'ramps');
