/* Cedar Fields South, the terrain and off-road racing (Session 6C, §45.36).
   - The world: a land bridge leaves the south perimeter road (a spur off the lattice) through a gap in the seawall;
     the countryside stands south of the city where only sea was; the Cedar Fields strip stays where it was.
   - The terrain: a real height field over the strip, the bridge and the countryside (hills, rises, dips, rock, mud,
     ruts, camber, jumps, whoops); the strip is held flat under and around everything already built there (props,
     buildings, fences, drives), and rough everywhere else; what is drawn is exactly what the wheels touch.
   - The physics: surfaces change grip and rolling drag for every car; a road car struggles more than an off-roader;
     the wheels ride the rough, the suspension soaks part of it (more on an off-roader), the car keeps its ground
     contact over rough ground and flies off a jump and lands; slopes pull.
   - The road: a car drives itself from the city to the Course Office and back; the GPS routes there and back with
     no leg through a building; traffic drives the land bridge and comes back; police and a cab come along the
     tracks; no pedestrians are made out in the fields; the camera stays above the hills.
   - Official events (Clean Bank, no Rep, no heat), class rules for off-roaders, trucks and values, the daily tiers,
     timed laps; the countryside races (Dirty Cash, Rep, heat only when a cop sees it, on alternate days); Vance's
     off-road pink slip (every third day, cars built for dirt only).
   - The compound: Clean Bank, no Rank gate; six real bays; the service stand (owner only, a third off); the impound
     still holds a space for every car you could own; a reload keeps it all and a position in the countryside.
   - Streaming: the district's blocks and the near terrain tiles come and go with you. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = true; g.env.time = 13;
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 1e9; };
  window.__step = (n, follow) => { for (let k = 0; k < n; k++) { g.update(0.05, 0.05); if (follow && k % 10 === 0 && g.vehicles.list.includes(follow)) g.resetPlayerState(follow.pos.x - Math.sin(follow.h) * 8, follow.pos.z - Math.cos(follow.h) * 8, 0); } };
  // a car of yours of that type (one already in the fleet if there is one: the fleet has only so many spaces)
  window.__car = (type, x, z, h = 0) => { const g2 = window.game, old = g2.save.garage.find(q => q.type === type && !q.imp && !(window.__bayIds || []).includes(q.uid)); if (old) { const lv = g2.vreg.live(old); if (lv) { if (g2.player.vehicle === lv && g2.player.state === 'vehicle') g2.exitVehicle(true); g2.vehicles.despawn(lv); } old.out = false; } const e = old || g2.content.addToGarage(type, 'bought', undefined, true); if (!e) return null; e.prov = { dirty: 0, clean: 1000 }; if (g2.player.state === 'vehicle') g2.exitVehicle(true); const v = g2.vreg.spawnFor(e, { x, z, h }); v.display = false; e.out = true; e.loc = { x, z, h, y: v.pos.y }; g2.resetPlayerState(x + 2.5, z, 0); g2.completeEnter(v); return e; };
  window.__log = []; if (!window.__hooked) { g.money.on(x => window.__log.push(x)); window.__hooked = true; }
});
await helpers();
const reload = async () => {
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};

// ---------------------------------------------------------------- 1. the world: a land bridge south to the countryside
const world = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, CFS = P.CFS, out = {}, gy = P.groundY;
  const L = w.links.find(l => l.spur && l.name === 'Cedar Fields Track');
  out.link = L && { a: L.ends[0].axis + ':' + L.ends[0].line + ':' + L.ends[0].seg, free: !!L.ends[1].free };
  out.vpLink = !!w.links.find(l => l.spur && l.name === 'Valen Point Causeway');
  // ground: road level through the promenade gap, rising along the bridge to the landing; sea either side of it
  out.bridge = [968, 975, 1000, 1020, 1039].map(z => +gy(CFS.lb.x, z).toFixed(2));
  out.sea = [gy(CFS.lb.x - 30, 1000), gy(CFS.lb.x + 30, 1000), gy(800, 1200), gy(CFS.x1 + 40, 1200)].map(v => +v.toFixed(1));
  out.cityPromenade = +gy(CFS.lb.x - 40, 972).toFixed(2);
  const hitAt = (x, z) => w.grid.resolveCircle(x, z, 0.6, 0.2, 1.5, {}).hit;
  out.gap = [970, 980, 1000, 1030].every(z => !hitAt(CFS.lb.x, z));
  out.seawall = hitAt(CFS.lb.x - 40, 978) && hitAt(CFS.lb.x + 40, 978);
  out.rails = hitAt(CFS.lb.x - CFS.lb.half + 0.4, 1010) && hitAt(CFS.lb.x + CFS.lb.half - 0.4, 1010);
  out.shore = hitAt(CFS.x0 + 1, 1300) && hitAt(CFS.x1 - 1, 1300) && hitAt(400, CFS.z1 - 1) && hitAt(100, CFS.z0 + 1);
  out.place = !!w.places.offroad;
  return out;
});
check('a land bridge leaves the south perimeter road (a spur off the lattice) and ends in the countryside; Valen Point’s causeway is still there', world.link && world.link.a === '1:12:2' && world.link.free && world.vpLink && world.place, JSON.stringify(world));
check('ground: road level through the promenade gap, rising along the bridge to the fields; sea either side and beyond', world.bridge[0] === 0 && world.bridge[1] === 0 && world.bridge[4] > 0.6 && world.bridge[2] < world.bridge[3] && world.sea.every(v => v < -1) && world.cityPromenade === 0.15, JSON.stringify(world));
check('walls: the seawall opens only for the land bridge; the bridge has rails; the countryside has a fence all round', world.gap && world.seawall && world.rails && world.shore, JSON.stringify(world));

// ---------------------------------------------------------------- 2. the terrain
const terrain = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, T = P.Terrain, out = {};
  const R = id => T.regions.find(r => r.id === id);
  const C = R('country'), S = R('strip');
  let lo = 1e9, hi = -1e9; for (let i = 0; i < C.h.length; i += 7) { lo = Math.min(lo, C.h[i]); hi = Math.max(hi, C.h[i]); }
  out.relief = [+lo.toFixed(2), +hi.toFixed(2)];
  const sc = [0, 0, 0, 0, 0, 0]; for (const s of C.s) sc[s]++; out.surfaces = sc.map(n => +(n / C.s.length).toFixed(3));
  // steepest 1 m slope on the course and the tracks, and the course's features as built
  const cf = w.cfs; out.features = cf.course.features.map(f => f.kind);
  const hAt = (x, z) => P.groundY(x, z);
  const jump = cf.course.features.find(f => f.kind === 'jump'), Tk = cf.track, kAt = a => Tk.cum.findIndex(c => c >= a);
  const k0 = kAt(jump.at), kTop = kAt(jump.at + jump.len * 0.62), kEnd = kAt(jump.at + jump.len);
  // the kicker's height over the hill it is built on (the baked ground against the bare hills there)
  const pt = Tk.pts[kTop]; out.jumpH = +(T._baked(C, pt[0], pt[1]) - T.raw(pt[0], pt[1])).toFixed(2); void k0; void kEnd;
  const wh = cf.course.features.find(f => f.kind === 'whoops'); const ys = []; for (let a = wh.at; a < wh.at + wh.len; a += 1) ys.push(hAt(...Tk.pts[kAt(a)])); out.whoopRange = +(Math.max(...ys) - Math.min(...ys)).toFixed(2);
  const cb = cf.course.features.find(f => f.kind === 'camber'); const kc = kAt(cb.at + cb.len / 2), p = Tk.pts[kc], nl = Tk.nl[kc]; out.camber = +(hAt(p[0] + nl[0] * 5, p[1] + nl[1] * 5) - hAt(p[0] - nl[0] * 5, p[1] - nl[1] * 5)).toFixed(2);
  const mud = cf.course.features.find(f => f.kind === 'mud'); out.mudSurf = T.surf(...Tk.pts[kAt(mud.at + mud.len / 2)]) === P.TSURF.mud;
  const rock = cf.course.features.find(f => f.kind === 'rock'); out.rockSurf = T.surf(...Tk.pts[kAt(rock.at + rock.len / 2)]) === P.TSURF.rock;
  // ruts on a track: the wheel lines sit lower than the crown
  // (across the countryside loop at a dozen places)
  let rut = 0, nr = 0;
  for (let k = 40; k < cf.loop.length - 40; k += 60) {
    const q = cf.loop[k], q2 = cf.loop[k + 1], dx = q2[0] - q[0], dz = q2[1] - q[1], l = Math.hypot(dx, dz), nx = dz / l, nz = -dx / l;
    if (T.surf(q[0], q[1]) !== P.TSURF.track) continue;
    // both wheel lines against the crown (the hill's cross-slope cancels out between the two sides)
    let sum = 0, m = 0; for (let o = 0.8; o <= 1.21; o += 0.1) { sum += (T._baked(C, q[0] + nx * o, q[1] + nz * o) + T._baked(C, q[0] - nx * o, q[1] - nz * o)) / 2 - T._baked(C, q[0], q[1]); m++; }
    rut += sum / m; nr++;
  }
  out.rut = +(rut / Math.max(1, nr)).toFixed(3); out.rutN = nr;
  // the strip: rough where it is free, flat at kerb height under everything built there
  let free = 0, mx = 0; for (let i = 0; i < S.m.length; i++) { if (S.m[i] > 0.01) free++; mx = Math.max(mx, S.h[i] - 0.15); }
  out.stripFree = +(free / S.m.length).toFixed(2); out.stripMax = +mx.toFixed(2);
  const fields = w.blocks.filter(b => b.superblock && b.superblock.id === 'fields');
  let worst = 0, n = 0;
  for (const b of fields) {
    for (const p of b.props) { worst = Math.max(worst, Math.abs(hAt(p.x, p.z) - 0.15)); n++; }
    for (const bl of b.bld) for (const [x, z] of [[bl.x0, bl.z0], [bl.x1, bl.z1], [bl.x0 - 1, (bl.z0 + bl.z1) / 2], [(bl.x0 + bl.x1) / 2, bl.z1 + 1]]) { worst = Math.max(worst, Math.abs(hAt(x, z) - 0.15)); n++; }
    for (const d of b.det) { worst = Math.max(worst, Math.abs(hAt(d.x, d.z) - 0.15)); n++; }
  }
  for (const h of w.homes) if (h.door.z > 880 && h.door.z < 960 && h.door.x < 320) { worst = Math.max(worst, Math.abs(hAt(h.door.x, h.door.z) - 0.15)); n++; }
  out.stripFlat = { worst: +worst.toFixed(3), n };
  out.road = +Math.max(...[10, 60, 120, 200, 280].map(x => Math.abs(hAt(x, 920) - 0.15))).toFixed(3);
  out.audit = w.auditPlacement().length;
  // what is drawn is what the wheels touch: the near tiles' and the strip's vertices against the physics
  g.cfsScene.update(400, 1250);
  let dv = 0, nv = 0;
  for (const m of [...g.cfsScene.group.children, g.cfsScene.strip]) { const a = m.geometry.attributes.position.array, idx = m.geometry.index.array; for (let i = 0; i < idx.length; i += 37) { if (idx[i] >= m.userData.nGrid) continue; const o = idx[i] * 3, x = a[o], y = a[o + 1] + m.position.y, z = a[o + 2]; if (y < -1) continue; const gyv = hAt(x + 1e-4, z + 1e-4); dv = Math.max(dv, Math.abs(gyv - y)); nv++; } }
  out.mesh = { worst: +dv.toFixed(3), n: nv, tiles: g.cfsScene.group.children.length };
  return out;
});
check('the countryside has real relief (hills of several metres) and every surface: grass, dirt, mud, rock, gravel, packed track', terrain.relief[1] - terrain.relief[0] > 5 && terrain.surfaces.every(f => f > 0.005), JSON.stringify(terrain));
check('the course is stamped into the ground: a jump of over a metre, whoops, a cambered bend, a mud wallow, a rock garden; the tracks have wheel ruts', terrain.jumpH > 1 && terrain.whoopRange > 0.3 && Math.abs(terrain.camber) > 0.6 && terrain.mudSurf && terrain.rockSurf && terrain.rut < -0.025 && terrain.rutN >= 6 && ['jump', 'whoops', 'mud', 'rock', 'camber'].every(k => terrain.features.includes(k)), JSON.stringify(terrain));
const solid = await ev(() => {
  const g = window.game, w = g.world, out = { n: 0, hit: 0 };
  for (const b2 of w.cfs.blocks) for (const d of b2.det) if (d.col && d.col.r !== undefined) { out.n++; if (w.grid.resolveCircle(d.col.x + 0.2, d.col.z, 0.5, d.col.y0 + 1.2, d.col.y0 + 2, {}).hit) out.hit++; }
  // a car driven into a tree trunk stops at it
  const t = w.cfs.blocks.flatMap(b2 => b2.det).find(d => d.col && d.col.r !== undefined && d.col.r > 0.3 && d.kind === 'cylr' && d.sy > 2);
  const v = g.vehicles.spawn('pickup', t.col.x - 12, t.col.z, Math.PI / 2, { driver: 'npc' }); v.mission = 'test'; v.touched = true; g.resetPlayerState(t.col.x - 20, t.col.z + 5, 0);
  for (let k = 0; k < 80; k++) { v.ctl.throttle = 0.6; v.ctl.steer = 0; v.h = Math.PI / 2; g.update(0.05, 0.05); }
  out.past = +(v.pos.x - t.col.x).toFixed(2); g.vehicles.despawn(v);
  return out;
});
check('collision: the countryside’s trees and rocks are solid (every one), and a car driven at a tree trunk stops at it', solid.n > 100 && solid.hit === solid.n && solid.past < 0, JSON.stringify(solid));
check('the strip is rough where it is free (over a third of it, rises of half a metre and more)', terrain.stripFree > 0.35 && terrain.stripMax > 0.5, JSON.stringify(terrain));
check('…and flat at kerb height under every prop, building, fence, the house doors and Cedar Fields Road; the placement audit is clean', terrain.stripFlat.worst < 0.02 && terrain.stripFlat.n > 50 && terrain.road < 0.02 && terrain.audit === 0, JSON.stringify(terrain));
check('what is drawn is what the wheels touch: terrain mesh vertices sit on the physics ground (within 2 cm)', terrain.mesh.worst < 0.02 && terrain.mesh.n > 500 && terrain.mesh.tiles > 0, JSON.stringify(terrain.mesh));

// ---------------------------------------------------------------- 3. the physics: surfaces, road cars and off-roaders
const phys = await ev(() => {
  const g = window.game, P = window.__pv, T = P.Terrain, out = {};
  window.__calm(); g.police.enabled = false;
  // grip and drag by surface, for a road car and an off-roader
  out.fx = {};
  for (const [name, s] of Object.entries(P.TSURF)) { const F = P.TSURF_FX[s]; out.fx[name] = { road: +(1 - (1 - F.grip)).toFixed(2), off: +(1 - (1 - F.grip) * 0.35).toFixed(2) }; }
  // a standing start over 4 s on a flat road in the city, and on the mud of the course, for a sedan and the Mesa Trail
  const cf = g.world.cfs, Tk = cf.track, mud = cf.course.features.find(f => f.kind === 'mud'), kAt = a => Tk.cum.findIndex(c => c >= a);
  const run = (type, x, z, h, secs) => {
    const v = g.vehicles.spawn(type, x, z, h, { driver: 'npc' }); v.mission = 'test'; v.touched = true;
    for (let k = 0; k < 4; k++) g.update(0.05, 0.05);
    const x0 = v.pos.x, z0 = v.pos.z;
    for (let k = 0; k < secs * 20; k++) { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.handbrake = false; g.update(0.05, 0.05); }
    const r = { d: +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1), v: +v.speed.toFixed(1) };
    g.vehicles.despawn(v);
    return r;
  };
  const km = kAt(mud.at), pm = Tk.pts[km], hm = Math.atan2(Tk.pts[km + 2][0] - pm[0], Tk.pts[km + 2][1] - pm[1]);
  g.resetPlayerState(pm[0] + 30, pm[1], 0);
  out.mudSedan = run('sedan', pm[0], pm[1], hm, 3); out.mudOff = run('offroad', pm[0], pm[1], hm, 3);
  // the same start on asphalt: Valen Point's main straight (flat, clear, off the terrain)
  g.resetPlayerState(1620, 700, 0);
  out.roadSedan = run('sedan', 1600, 760, Math.PI, 3); out.roadOff = run('offroad', 1600, 760, Math.PI, 3);
  out.lossSedan = +(1 - out.mudSedan.d / out.roadSedan.d).toFixed(2); out.lossOff = +(1 - out.mudOff.d / out.roadOff.d).toFixed(2);
  // the effect the physics reads at the mud for each
  const es = T.effect(pm[0], pm[1], P.trailOf('sedan')); out.eff = { sedan: { grip: +es.grip.toFixed(2), drag: +es.drag.toFixed(2) } };
  const eo = T.effect(pm[0], pm[1], P.trailOf('offroad')); out.eff.off = { grip: +eo.grip.toFixed(2), drag: +eo.drag.toFixed(2) };
  out.city = T.effect(400, 365, 0);
  return out;
});
check('surfaces change grip and drag; an off-roader feels about a third of it; the city’s roads are untouched', phys.eff.sedan.grip < phys.eff.off.grip && phys.eff.sedan.drag > phys.eff.off.drag && phys.city === null && phys.fx.mud.road < phys.fx.track.road, JSON.stringify(phys));
check('a road car struggles in the mud far more than an off-roader (distance lost against the same car on asphalt)', phys.lossSedan > 0.15 && phys.lossOff < phys.lossSedan * 0.6 && phys.mudOff.d > phys.mudSedan.d, JSON.stringify(phys));
const susp = await ev(() => {
  const g = window.game, P = window.__pv, out = {};
  window.__calm(); g.police.enabled = false;
  const cf = g.world.cfs, Tk = cf.track, kAt = a => Tk.cum.findIndex(c => c >= a);
  // the rock garden at a steady 15 m/s: the wheels ride the rocks, the body moves, the tyres stay on the ground
  const rock = cf.course.features.find(f => f.kind === 'rock');
  const ride = type => {
    const k0 = kAt(rock.at) - 6, p = Tk.pts[k0], q = Tk.pts[k0 + 2], h = Math.atan2(q[0] - p[0], q[1] - p[1]);
    const v = g.vehicles.spawn(type, p[0], p[1], h, { driver: 'npc' }); v.mission = 'test'; v.touched = true;
    g.resetPlayerState(p[0] + 20, p[1], 0);
    const wy = [], body = [], pitch = []; let air = 0, sink = 0, n = 0;
    for (let k = 0; k < 80; k++) {
      // hold the line along the course
      const kk = Tk.pts.reduce((b2, pp, j) => Math.hypot(pp[0] - v.pos.x, pp[1] - v.pos.z) < b2.d ? { j, d: Math.hypot(pp[0] - v.pos.x, pp[1] - v.pos.z) } : b2, { j: 0, d: 1e9 }).j;
      const a = Tk.pts[(kk + 3) % Tk.pts.length], want = Math.atan2(a[0] - v.pos.x, a[1] - v.pos.z);
      let dh = want - v.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      v.ctl.steer = Math.max(-1, Math.min(1, -dh * 2)); v.ctl.throttle = v.speed < 15 ? 1 : 0.2; v.ctl.handbrake = false;
      g.update(0.05, 0.05);
      if (k > 20) { wy.push(v._wy[0] - v.pos.y); body.push(v.bodyOff); pitch.push(v.pitchG); if (v.airborne) air++; if (v.pos.y < P.groundY(v.pos.x, v.pos.z) - 0.25) sink++; n++; }
    }
    const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
    const r = { wheel: +sd(wy).toFixed(3), body: +sd(body).toFixed(4), pitch: +sd(pitch).toFixed(4), air, sink, n, v: +v.speed.toFixed(1) };
    g.vehicles.despawn(v);
    return r;
  };
  out.sedan = ride('sedan'); out.off = ride('offroad');
  // the course's first jump at speed: off the ground and back down on its wheels
  const J = cf.course.features.find(f => f.kind === 'jump'), kj = kAt(J.at) - 25, p = Tk.pts[kj], q = Tk.pts[kj + 2], h = Math.atan2(q[0] - p[0], q[1] - p[1]);
  const v = g.vehicles.spawn('offroad', p[0], p[1], h, { driver: 'npc' }); v.mission = 'test'; v.touched = true; g.resetPlayerState(p[0] + 25, p[1], 0);
  let flew = 0, landed = false, worstSink = 0;
  for (let k = 0; k < 120; k++) { v.ctl.throttle = 1; v.ctl.steer = 0; if (k < 2) v.vel.set(Math.sin(h) * 22, Math.cos(h) * 22); g.update(0.05, 0.05); if (v.airborne) flew++; else if (flew) landed = true; if (!v.airborne) worstSink = Math.max(worstSink, P.groundY(v.pos.x, v.pos.z) - v.pos.y - 0.2); }
  out.jump = { flew, landed, worstSink: +worstSink.toFixed(2), alive: v.health > 0 };
  g.vehicles.despawn(v);
  // slopes pull: the same car coasting from 10 m/s up a hillside and down it
  const T = P.Terrain; let best = null;
  for (let z = 1200; z < 1450 && !best; z += 7) for (let x = 40; x < 300; x += 7) { T.height(x, z); const s = Math.hypot(T.gx, T.gz); if (s > 0.09 && s < 0.25 && T.surf(x, z) === P.TSURF.grass && T.surf(x + 15, z) === P.TSURF.grass) { best = { x, z, gx: T.gx, gz: T.gz }; break; } }
  const coast = up => { const h = Math.atan2(best.gx, best.gz) + (up ? 0 : Math.PI), r = g.vehicles.spawn('sedan', best.x, best.z, h, { driver: 'npc' }); r.mission = 'test'; r.touched = true; g.resetPlayerState(best.x + 25, best.z, 0); for (let k = 0; k < 3; k++) g.update(0.05, 0.05); r.vel.set(Math.sin(h) * 10, Math.cos(h) * 10); const x0 = r.pos.x, z0 = r.pos.z; for (let k = 0; k < 40; k++) { r.ctl.throttle = 0; r.ctl.handbrake = false; g.update(0.05, 0.05); } const d = Math.hypot(r.pos.x - x0, r.pos.z - z0); g.vehicles.despawn(r); return +d.toFixed(1); };
  if (best) out.roll = { slope: +Math.hypot(best.gx, best.gz).toFixed(2), up: coast(true), down: coast(false) };
  return out;
});
check('rough ground: the wheels ride the rocks (and are drawn on them), the body shakes; the off-roader’s suspension soaks up more of it', susp.sedan.wheel > 0.01 && susp.sedan.body > 0.002 && susp.off.body < susp.sedan.body && susp.off.pitch < susp.sedan.pitch, JSON.stringify(susp));
check('ground contact over the rocks: the tyres stay down (no bouncing into the air at 15 m/s) and nothing sinks into the ground', susp.sedan.air < susp.sedan.n * 0.15 && susp.off.air < susp.off.n * 0.1 && susp.sedan.sink === 0 && susp.off.sink === 0, JSON.stringify(susp));
check('a jump at speed: the car leaves the ground, lands on its wheels and never ends up under the surface', susp.jump.flew > 3 && susp.jump.landed && susp.jump.worstSink <= 0.05 && susp.jump.alive, JSON.stringify(susp.jump));
check('slopes pull: the same car coasting from 10 m/s gets less far up a hillside than down it', susp.roll && susp.roll.down > susp.roll.up + 1, JSON.stringify(susp.roll));

// ---------------------------------------------------------------- 4. the road there and back
const drive = async to => {
  await ev(to => { const v = window.__drv; v.drive.setGoal(to.x, to.z); window.__trace = [[v.pos.x, v.pos.z, v.pos.y]]; }, to);
  let st = null;
  for (let r = 0; r < 40; r++) {
    st = await ev(() => { const g = window.game, v = window.__drv, P = window.__pv; for (let k = 0; k < 100; k++) { window.__step(1, v); if (k % 5 === 0) window.__trace.push([v.pos.x, v.pos.z, v.pos.y - P.groundY(v.pos.x, v.pos.z), g.camera.position.y - P.groundY(g.camera.position.x, g.camera.position.z)]); } return { arrived: v.drive.arrived, alive: g.vehicles.list.includes(v), x: v.pos.x, z: v.pos.z }; });
    if (st.arrived || !st.alive) break;
  }
  const tr = await ev(() => { const t = window.__trace, CFS = window.__pv.CFS; let jump = 0, sink = 0; for (let k = 1; k < t.length; k++) { jump = Math.max(jump, Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1])); sink = Math.min(sink, t[k][2]); } const br = t.filter(p => p[1] > 980 && p[1] < 1038); return { jump: +jump.toFixed(1), sink: +sink.toFixed(2), n: t.length, onBridge: br.length > 0 && br.every(p => Math.abs(p[0] - CFS.lb.x) < CFS.lb.half) }; });
  return { ...st, ...tr };
};
await ev(() => { const g = window.game; window.__calm(); g.police.enabled = false; g.resetPlayerState(250, 940, 0); const v = g.vehicles.spawn('pickup', 230, 966 - 2.6, Math.PI / 2, { driver: 'npc' }); v.mission = 'test'; v.touched = true; v.drive = new window.__pv.DriveAI(v, g, 'taxi'); v.drive.cruise = 14; window.__drv = v; });
const office = await ev(() => { const d = window.game.world.places.offroad.door; return { x: d.x - 4, z: d.z }; });
const there = await drive(office);
const back = await drive({ x: 330, z: 700 });
check('a car drives from the city over the land bridge to the Course Office, every step physical (never more than 15 m in a quarter second, never under the ground)', there.arrived && there.alive && there.onBridge && there.jump < 15 && there.sink > -0.3 && Math.hypot(there.x - office.x, there.z - office.z) < 12, JSON.stringify(there));
check('…and drives back into the city the same way', back.arrived && back.alive && back.onBridge && back.jump < 15 && back.z < 960, JSON.stringify(back));
await ev(() => { const g = window.game; g.vehicles.despawn(window.__drv); });
const gps = await ev(() => {
  const g = window.game, P = window.__pv, CFS = P.CFS, grid = g.world.grid, out = {};
  const through = r => { let bad = 0; for (let k = 1; k < r.length; k++) { const a = r[k - 1], b2 = r[k], dx = b2.x - a.x, dz = b2.z - a.z, L = Math.hypot(dx, dz); if (L < 0.5) continue; const h = grid.raycast(a.x, P.groundY(a.x, a.z) + 1.0, a.z, dx / L, 0, dz / L, L, 0.5); if (h && h.col && (h.col.kind === 'bld' || h.col.kind === 'wall')) bad++; } return bad; };
  const br = r => r.filter(q => q.z > 982 && q.z < 1036).every(q => Math.abs(q.x - CFS.lb.x) < CFS.lb.half);
  const d = g.world.places.offroad.door, T = g.world.cfs.track, loop = g.world.cfs.loop;
  for (const [name, a, b2] of [['to office', [320, 300], [d.x, d.z]], ['office to city', [d.x, d.z], [600, 500]], ['city to course', [700, 700], T.pts[300]], ['countryside to city', loop[200], [160, 620]], ['Valen Point to the course', [1600, 600], T.pts[100]]]) {
    const r = P.gpsRoute(a[0], a[1], b2[0], b2[1]);
    out[name] = { n: r.length, ok: Math.hypot(r[r.length - 1].x - b2[0], r[r.length - 1].z - b2[1]) < 1 && br(r), through: through(r) };
  }
  return out;
});
check('GPS routes there and back (city ↔ the Course Office, the course, the countryside, even from Valen Point) over the land bridge, no leg through a building or wall', Object.values(gps).every(o => o.ok && o.through === 0 && o.n > 3), JSON.stringify(gps));
const traffic = await ev(() => {
  const g = window.game, spur = g.world.links.find(l => l.spur && l.name === 'Cedar Fields Track'), out = { seen: 0, back: 0 }, P = window.__pv;
  window.__calm(); g.police.enabled = false;
  // stand on the landing beside the track (not in its lane: traffic stops for you)
  g.resetPlayerState(188, 1056, 0);
  const watch = new Set(); let floating = 0;
  for (let k = 0; k < 1800; k++) {
    g.update(0.05, 0.05);
    for (const c of g.traffic.cars) { if (c.ai && c.ai.path && c.ai.path.link === spur.id) watch.add(c); if (c.pos.z > 980 && g.vehicles.list.includes(c) && Math.abs(c.pos.y - (P.groundY(c.pos.x, c.pos.z) - P.Terrain.rough)) > 0.15) floating++; }
    for (const c of watch) if (c.ai && c.ai.mode === 'lane' && g.vehicles.list.includes(c)) { out.back++; watch.delete(c); }
  }
  out.seen = out.back + watch.size; out.floating = floating;
  // nobody on foot is made out in the countryside
  out.peds = g.peds.peds.filter(p => p.z > 980 && !p.keep).length;
  g.police.enabled = true;
  return out;
});
check('traffic drives the land bridge out to the compound and comes back onto the city’s roads, on the ground the whole way', traffic.seen >= 1 && traffic.back >= 1 && traffic.floating === 0, JSON.stringify(traffic));
check('no pedestrians are made out in the fields', traffic.peds === 0, JSON.stringify(traffic));
const police = await ev(() => {
  const g = window.game, P = g.police, out = {};
  window.__calm(); g.hotwatch.cool = 1e9;
  const p0 = g.world.cfs.loop[300]; g.resetPlayerState(p0[0], p0[1], 0);
  P.setLevel(2); P.units.length = 0;
  for (let k = 0; k < 6 && !P.units.length; k++) P.spawnUnit();
  const u = P.units[0]; out.unit = !!u;
  if (u) { out.from = [Math.round(u.v.pos.x), Math.round(u.v.pos.z)]; const d0 = Math.hypot(u.v.pos.x - p0[0], u.v.pos.z - p0[1]); for (let k = 0; k < 500; k++) { g.update(0.05, 0.05); g.resetPlayerState(p0[0], p0[1], 0); } out.closer = d0 - Math.hypot(u.v.pos.x - p0[0], u.v.pos.z - p0[1]); }
  window.__calm();
  const cab = g.taxi.spawnCab(p0[0], p0[1]); out.cab = cab ? [Math.round(cab.pos.x), Math.round(cab.pos.z)] : null; if (cab) g.vehicles.despawn(cab);
  return out;
});
check('police come along the countryside tracks after you; a cab comes out along them too', police.unit && police.from[1] > 980 && police.closer > 40 && police.cab && police.cab[1] > 980, JSON.stringify(police));

// ---------------------------------------------------------------- 5. the compound: Clean Bank, no gate, six bays, the service stand
const buy = await ev(() => {
  const g = window.game, uw = g.uw, PM = uw.props, out = {};
  window.__calm();
  out.rank = uw.rank; out.rep = g.save.rep;
  g.money.W.clean = 0; out.poor = PM.buy('offroad');
  g.money.W.clean = 1e6; window.__log = [];
  const cap0 = g.content.garageCap, price = PM.price(window.__pv.PROPS.find(p => p.id === 'offroad'));
  out.why = PM.buy('offroad');
  out.owned = PM.owned('offroad'); out.paid = Math.round(1e6 - g.money.W.clean) === price; out.price = price; out.src = window.__log.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join();
  out.cap = g.content.garageCap - cap0;
  out.motorsport = PM.owned('motorsport');
  return out;
});
check('the compound is its own property: Clean Bank, no Rank gate (an early player buys it), six spaces come with it; Valen Point isn’t part of it', buy.rank === 0 && /bank/.test(buy.poor) && buy.why === '' && buy.owned && buy.paid && buy.src === 'clean:property' && buy.cap === 6 && !buy.motorsport, JSON.stringify(buy));
const bays = await ev(() => {
  const g = window.game, s = g.save, out = {}, ids = [];
  for (const t of ['offroad', 'pickup']) { const e = g.content.addToGarage(t, 'bought', undefined, true); ids.push(e.uid); }
  window.__bayIds = ids;
  const es = ids.map(u => s.garage.find(e => e.uid === u));
  out.at = es.map(e => e.at && e.at.p);
  out.bays = es.map(e => { const b2 = g.vreg.bayPos(e); return b2 && [Math.round(b2.x), Math.round(b2.z), +b2.y.toFixed(2)]; });
  const d = g.world.places.offroad.door; g.resetPlayerState(d.x - 3, d.z, 0); window.__step(20);
  out.live = es.map(e => { const v = g.vreg.live(e), b2 = g.vreg.bayPos(e); return !!(v && b2 && Math.hypot(v.pos.x - b2.x, v.pos.z - b2.z) < 1 && Math.abs(v.pos.y - window.__pv.groundY(v.pos.x, v.pos.z)) < 0.1); });
  return out;
});
check('the compound’s bays are real registry spaces in the owners’ shed: cars are kept there, on the ground', bays.at.every(p => p === 'offroad') && bays.live.every(Boolean), JSON.stringify(bays));
const imp = await ev(() => { const g = window.game, pv = window.__pv, PM = g.uw.props; let n = 0; for (const d of pv.PROPS) n += PM.bays(d).length; return { bays: n, cap: g.impound.capacity() }; });
check('the impound still holds a space for every car you could own (the compound’s six included)', imp.cap >= imp.bays && imp.bays >= 124, JSON.stringify(imp));
const where = await ev(() => {
  const g = window.game, I = g.impound, s = g.save;
  const e = g.content.addToGarage('sedan', 'bought', undefined, true); const v = g.vreg.spawnFor(e, { x: 150, z: 1300, h: 0 }); e.out = true; e.loc = { x: 150, z: 1300, h: 0, y: v.pos.y }; g.resetPlayerState(180, 1300, 0);
  I.seize(e, 'abandoned'); const r = { lot: I.lotOf(e), name: I.spaceName(e) }; e.imp = null; s.garage.splice(s.garage.indexOf(e), 1);
  return r;
});
check('a car seized in the countryside goes to the city’s main yard over the land bridge (never across the causeway to Valen Point)', where.lot === 'impound' && /main yard/.test(where.name), JSON.stringify(where));
const stand = await ev(() => {
  const g = window.game, O = g.offroad, S = g.world.cfs.stand, out = {};
  window.__car('pickup', (S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, Math.PI);
  const v = g.player.vehicle; v.health = 50;
  const a = O.findAction(); out.label = a && a.label;
  window.__log = []; const cost = Math.round(g.content.repairCost(v.type, v.health) * 0.7 / 10) * 10;
  if (a) a.act(); out.hp = v.health; out.paid = window.__log.filter(x => x.d < 0).map(x => x.cur + ':' + x.src + ':' + Math.round(-x.d)).join(); out.cost = cost;
  // not the owner: no service
  g.save.uw.props.offroad.owned = false; v.health = 50; const b2 = O.findAction(); out.other = b2 && b2.label; g.save.uw.props.offroad.owned = true; v.health = 100;
  return out;
});
check('the service stand repairs the owner’s car a third off, from the bank; it serves the owner only', /Service stand · repair/.test(stand.label) && stand.hp === 100 && stand.paid === 'clean:pitService:' + stand.cost && /owners only/.test(stand.other), JSON.stringify(stand));

// ---------------------------------------------------------------- 6. official events: Clean Bank, class rules, no Rep, no heat
const raceTo = async (id, place, opts = {}) => {
  await ev(([id]) => { const g = window.game, P = g.offroad; window.__calm(); const e = window.__pv.OR_EVENTS.find(x => x.id === id); P.enter(e); }, [id]);
  await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); });
  for (let k = 0; k < 15; k++) await ev(() => window.game.update(0.05, 0.05));
  const obj = await ev(() => { const A = window.game.race.active; return A ? { phase: A.phase, obj: A.objective } : null; });
  if (!obj || obj.phase === 'toStart') { await ev(() => window.game.missions.fail('test')); return { refused: obj && obj.obj }; }
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  const mid = await ev(watch => { const g = window.game, A = g.race.active, v = g.player.vehicle, P = window.__pv; const s0 = A.racers.map(r => [r.v.pos.x, r.v.pos.z]); if (watch) g.police.spawnCop(v.pos.x + 8, v.pos.z + 8); const mk = A.nextMk ? +(A.nextMk.g.position.y - P.groundY(A.nextMk.g.position.x, A.nextMk.g.position.z)).toFixed(2) : null; let under = 0, saw = 0; for (let k = 0; k < 300; k++) { v.vel.set(Math.sin(v.h) * 20, Math.cos(v.h) * 20); g.update(0.05, 0.05); if (g.police.copCanSee(v.pos.x, v.pos.z, 40)) saw++; for (const r of A.racers) if (!r.v.airborne && r.v.pos.y < P.groundY(r.v.pos.x, r.v.pos.z) - 0.3) under++; } return { moved: A.racers.map((r, i) => Math.round(Math.hypot(r.v.pos.x - s0[i][0], r.v.pos.z - s0[i][1]))), level: g.police.level, under, saw, mk, cps: A.racers.map(r => r.cp) }; }, !!opts.watch);
  await ev(place => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = place - 1; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); }, place);
  for (let k = 0; k < 40; k++) { const done = await ev(() => { window.game.update(0.05, 0.05); return !window.game.missions.active; }); if (done) break; }
  return { mid };
};
const sf = await ev(() => { const c = window.game.world.cfs.sf; return { x: c.x - 40, z: c.z - 12 }; });
await ev(sf => { window.__car('sedan', sf.x, sf.z, Math.PI / 2); }, sf);
const cls = await raceTo('or_trail', 1);
check('scrutineering: a road car doesn’t get on the grid of an off-road event (nothing charged)', cls.refused && /Wrong class/.test(cls.refused), JSON.stringify(cls));
await ev(sf => { window.__car('sedan', sf.x, sf.z, Math.PI / 2); }, sf);
const trk = await raceTo('or_truck', 1);
check('…nor of the Truck Run (trucks and pickups only)', trk.refused && /Wrong class/.test(trk.refused), JSON.stringify(trk));
await ev(sf => { window.__car('offroad', sf.x, sf.z, Math.PI / 2); const g = window.game; window.__log = []; window.__d0 = g.money.W.dirty.me; window.__r0 = g.save.rep; }, sf);
const trail = await raceTo('or_trail', 1, { watch: true });
const tm = await ev(() => { const g = window.game, L = window.__log.filter(x => /^track/.test(x.src) || x.cur === 'dirty'); return { in: L.filter(x => x.d > 0).map(x => x.cur + ':' + x.src + ':' + Math.round(x.d)).join(), out: L.filter(x => x.d < 0).map(x => x.cur + ':' + x.src + ':' + Math.round(-x.d)).join(), dirty: Math.round(g.money.W.dirty.me - window.__d0), rep: g.save.rep - window.__r0, level: g.police.level }; });
check('an official off-road event: the buy-in and the prize are Clean Bank (no Dirty Cash), no criminal Rep', tm.in === 'clean:trackPrize:2000' && tm.out === 'clean:trackFee:250' && tm.dirty === 0 && tm.rep === 0, JSON.stringify(tm));
check('…no heat from a cop watching (it really saw you); the opponents really race over the course (each covered ground, none under the surface)', trail.mid.level === 0 && trail.mid.saw > 0 && tm.level === 0 && trail.mid.moved.length === 4 && trail.mid.moved.every(d => d > 40) && trail.mid.under === 0, JSON.stringify(trail));
const again = await (async () => { await ev(sf => { window.__car('offroad', sf.x, sf.z, Math.PI / 2); window.__log = []; }, sf); await raceTo('or_trail', 1); return ev(() => window.__log.filter(x => x.d > 0 && /^track/.test(x.src)).map(x => x.src + ':' + Math.round(x.d)).join()); })();
check('race checkpoints: the next checkpoint’s marker stands on the ground (on the hills, not at sea level)', trail.mid.mk !== null && Math.abs(trail.mid.mk) < 0.1, JSON.stringify(trail.mid));
check('the same event won again today pays half (the same daily tiers as every race)', again === 'trackPrize:1000', again);
const lapT = await ev(() => {
  const g = window.game, O = g.offroad, T = g.world.cfs.track, pv = window.__pv, out = {};
  window.__calm(); g.police.enabled = false;
  if (g.missions.active) g.missions.fail('test');
  window.__log = []; out.book = O.book(); out.fee = window.__log.filter(x => x.d < 0).length;
  // an AI off-roader laps the course on its racing line: really driving it, jumps, mud and all
  const ck = O.checkpoints({ laps: 1 }), s = ck.start, v = g.vehicles.spawn('offroad', s.x, s.z, s.h, { driver: 'npc' });
  v.mission = 'test'; v.touched = true; v.drive = new pv.DriveAI(v, g, 'race'); v.drive.path = ck.aiPath.map(c => ({ ...c })); v.drive.pi = 0; v.drive.wait = 0; v.drive.cruise = 30;
  let off = 0, t = 0, air = 0;
  for (let k = 0; k < 4000 && v.drive.pi < v.drive.path.length - 8; k++) {
    window.__step(1, v); t += 0.05; if (v.airborne) air++;
    if (k % 10 === 0) { let d = 1e9; for (let j = 0; j < T.pts.length; j += 3) d = Math.min(d, Math.hypot(T.pts[j][0] - v.pos.x, T.pts[j][1] - v.pos.z)); if (d > 9) off++; }
  }
  out.done = v.drive.pi >= v.drive.path.length - 8; out.t = Math.round(t); out.off = off; out.air = air;
  g.vehicles.despawn(v);
  // the player's timed lap: from before the line, every sector, over it again
  const n = T.pts.length, k0 = g.world.cfs.sf.k;
  window.__car('offroad', T.pts[k0][0] - 20, T.pts[k0][1], Math.PI / 2); const pl = g.player.vehicle;
  for (let j = -12; j <= n + 6; j += 3) { const p = T.pts[((k0 + j) % n + n) % n]; pl.pos.x = p[0]; pl.pos.z = p[1]; pl.syncMesh(0); O.update(0.25); }
  out.laps = O.session && O.session.laps; out.best = O.s.best;
  return out;
});
check('the owner’s private session is free; an AI off-roader laps the course on its own line (over the jumps, through the mud) without leaving it', lapT.book === '' && lapT.fee === 0 && lapT.done && lapT.off === 0 && lapT.air > 0 && lapT.t < 150, JSON.stringify(lapT));
check('free-roam timed laps: a lap through every sector is timed and the best kept', lapT.laps === 1 && lapT.best && lapT.best.t > 0, JSON.stringify(lapT));

// ---------------------------------------------------------------- 7. the countryside races: Dirty Cash, Rep, heat only when seen
const country = await ev(() => {
  const g = window.game, C = g.campaign, out = {}, P = window.__pv;
  const tull = g.missions.contacts.find(c => c.id === 'tull');
  const offered = d => { g.uw.S.day = d; const seen = new Set(); for (let k = 0; k < 30; k++) { const o = C.raceOffer(tull); if (!o.locked) seen.add(o.pink ? (o.race.offroad ? 'pinkdirt' : 'pink') : o.race.id); } return [...seen]; };
  out.d0 = offered(30); out.d1 = offered(31); out.d2 = offered(32);
  const dd = P.RACES.find(r => r.id === 'dustdevil'), R = P.pathCheckpoints(dd);
  out.cps = R.cps.length; out.allOut = R.cps.every(c => c.z > 1040); out.vmax = Math.max(...R.aiPath.map(a => a.vmax));
  return out;
});
check('countryside races run on alternate economic days (one or the other is on offer), and they’re out in the fields', country.d0.includes('dustdevil') !== country.d0.includes('ridgerun') && country.d1.includes('dustdevil') !== country.d1.includes('ridgerun') && country.cps > 10 && country.allOut, JSON.stringify(country));
check('Vance’s off-road pink slip comes round only every third day, alongside (never instead of) the street one', !country.d0.includes('pinkdirt') && !country.d1.includes('pinkdirt') && country.d2.includes('pinkdirt') && country.d2.includes('pink'), JSON.stringify(country));
const streetRace = async (id, watch) => {
  const day = await ev(id => { const g = window.game, P = window.__pv, d = P.RACES.find(r => r.id === id); g.uw.S.day = d.dayOff ? 31 : 30; window.__calm(); const tull = g.missions.contacts.find(c => c.id === 'tull'); let o = null; for (let k = 0; k < 30 && !o; k++) { const x = g.campaign.raceOffer(tull); if (!x.pink && x.race.id === id) o = x; } window.__log = []; window.__r0 = g.save.rep; window.__lv0 = g.police.level; g.missions.start(o); return o && o.fee; }, id);
  await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); });
  for (let k = 0; k < 15; k++) await ev(() => window.game.update(0.05, 0.05));
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  const mid = await ev(watch => { const g = window.game, A = g.race.active, v = g.player.vehicle; g.police.enabled = true; if (watch) { g.police.spawnCop(v.pos.x + 10, v.pos.z + 6); } for (let k = 0; k < 60; k++) { v.vel.set(Math.sin(v.h) * 22, Math.cos(v.h) * 22); g.update(0.05, 0.05); } return { level: g.police.level }; }, watch);
  await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = 0; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); });
  for (let k = 0; k < 40; k++) { const done = await ev(() => { window.game.update(0.05, 0.05); return !window.game.missions.active; }); if (done) break; }
  const res = await ev(() => { const g = window.game, L = window.__log; return { in: L.filter(x => x.d > 0 && x.src === 'streetRace').map(x => x.cur + ':' + Math.round(x.d)).join(), out: L.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join(), rep: g.save.rep - window.__r0 }; });
  return { day, mid, ...res };
};
await ev(() => { const g = window.game, p0 = g.world.cfs.loop[10]; window.__car('offroad', p0[0], p0[1], 0); g.money.W.dirty.me = 5000; });
const dust = await streetRace('dustdevil', false);
check('a countryside race: the buy-in and the winnings are Dirty Cash, and it pays criminal Rep', /^dirty:\d+$/.test(dust.in) && /dirty/.test(dust.out) && !/clean/.test(dust.out) && dust.rep > 0 && dust.mid.level === 0, JSON.stringify(dust));
await ev(() => { const g = window.game, p0 = g.world.cfs.loop[10]; window.__car('offroad', p0[0], p0[1], 0); g.money.W.dirty.me = 5000; });
const seen = await streetRace('ridgerun', true);
check('…and draws heat only when a cop actually sees it (1★)', seen.mid.level === 1 && /^dirty:\d+$/.test(seen.in), JSON.stringify(seen));
const pink = await ev(() => {
  const g = window.game, P = window.__pv, out = {}, d = P.RACES.find(r => r.id === 'pinkdirt');
  g.uw.S.day = 32; g.save.pinkDirtDay = -1;
  window.__car('sedan', 300, 1110, 0); out.sedan = g.pinks.canStake(g.player.vehicle, d);
  window.__car('pickup', 300, 1110, 0); out.pickup = g.pinks.canStake(g.player.vehicle, d);
  const e = g.vreg.entryOf(g.player.vehicle); let ok = 0; for (let k = 0; k < 30; k++) { const r = g.pinks.rival(e, d); if (P.trailOf(r.type) >= 0.5) ok++; } out.rivals = ok;
  return out;
});
check('the off-road pink slip: only a car built for dirt can be put up, and Vance brings one too', /built for dirt/.test(pink.sedan) && pink.pickup === '' && pink.rivals === 30, JSON.stringify(pink));

// ---------------------------------------------------------------- 8. save and reload in the countryside
// an official win today (its tier must survive the reload: 6B dropped official ids from today's record on load)
await ev(() => { const g = window.game; if (g.missions.active) g.missions.fail('test'); if (g.player.state === 'vehicle') g.exitVehicle(true); g.raceRules.noteWin('or_trail'); window.__tier = g.raceRules.today().or_trail; g.resetPlayerState(150, 1300, 0); window.__step(10); });
const tier0 = await ev(() => window.__tier);
const bayIds = await ev(() => window.__bayIds);
await reload();
const after = await ev(ids => {
  const g = window.game, s = g.save, out = {};
  out.pos = [Math.round(g.player.pos.x), Math.round(g.player.pos.z)]; out.y = +(g.player.pos.y - window.__pv.groundY(g.player.pos.x, g.player.pos.z)).toFixed(2);
  out.owned = g.uw.props.owned('offroad');
  // walk over to the compound: the parked cars come out round you
  const d = g.world.places.offroad.door; g.resetPlayerState(d.x - 3, d.z, 0); window.__step(20);
  out.bays = ids.map(u => { const e = s.garage.find(x => x.uid === u), v = e && g.vreg.live(e), b2 = e && g.vreg.bayPos(e); return !!(v && b2 && Math.hypot(v.pos.x - b2.x, v.pos.z - b2.z) < 1); });
  out.best = !!s.offroad.best; out.tier = s.raceDay && s.raceDay.wins && s.raceDay.wins.or_trail;
  return out;
}, bayIds);
after.tier0 = tier0;
check('save → reload: a position in the countryside is kept (on the ground, not pulled back to the city); the compound, its bays, the best lap and today’s tiers are kept', after.pos[1] > 1200 && Math.abs(after.y) < 0.2 && after.owned && after.bays.every(Boolean) && after.best && after.tier0 > 0 && after.tier === after.tier0, JSON.stringify(after));

// ---------------------------------------------------------------- 9. streaming, the camera and the maps
const stream = await ev(() => {
  const g = window.game, P = window.__pv, out = {};
  const xb = () => [...g.chunks.visible].filter(i => i >= 1000 && g.world.blockI(i).xb.startsWith('cfs')).length;
  g.resetPlayerState(400, 1250, 0); window.__step(60); out.there = xb(); out.tiles = g.cfsScene.group.children.length;
  g.resetPlayerState(600, 200, 0); window.__step(60); out.away = xb(); out.tilesAway = g.cfsScene.group.children.length; out.cached = g.cfsScene.tiles.size <= 24;
  g.resetPlayerState(300, 1120, 0); window.__step(60); out.back = xb(); out.tilesBack = g.cfsScene.group.children.length;
  // the camera behind a car crossing the hills never dips into the ground
  const ck = g.offroad.checkpoints({ laps: 1 }), s = ck.start; window.__car('offroad', s.x, s.z, s.h); const v = g.player.vehicle;
  let low = 1e9; for (let k = 0; k < 400; k++) { v.ctl.throttle = 1; const p = ck.aiPath[Math.min(ck.aiPath.length - 1, Math.floor(k / 4))]; v.h = Math.atan2(p.x - v.pos.x, p.z - v.pos.z); g.update(0.05, 0.05); const c = g.camera.position; low = Math.min(low, c.y - P.groundY(c.x, c.z)); }
  out.camLow = +low.toFixed(2);
  out.maps = { img: !!g.ui.cfsImg, h: g.ui.mapH, inMap: g.ui._mapXY(300, 1490)[1] <= g.ui.mapH };
  out.name = P.placeNameAt ? P.placeNameAt(150, 1300) : '';
  return out;
});
check('streaming: the countryside’s blocks and near terrain tiles load out there, go when you are back in the city, and return', stream.there > 0 && stream.tiles > 0 && stream.away === 0 && stream.tilesAway === 0 && stream.cached && stream.back > 0 && stream.tilesBack > 0, JSON.stringify(stream));
check('the camera stays above the ground over the hills', stream.camLow > 0.3, JSON.stringify(stream));
check('the maps reach Cedar Fields South (a painted district, panning south to it); places out there are named', stream.maps.img && stream.maps.inMap && /Cedar Fields/.test(stream.name), JSON.stringify(stream));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'offroad');
