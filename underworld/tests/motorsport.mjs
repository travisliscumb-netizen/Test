/* Valen Point Motorsport Park (Session 6B, §45.34): a new district off the map, joined by a causeway.
   - The world: the causeway leaves the east perimeter road; ground, collision and the seawall gap let you across
     and nowhere else; the island stands where nothing of the city was; a position on it survives a save.
   - The road: a car drives itself from the city to Race Control and back (no teleport, every step physical); the
     GPS routes there and back along the causeway, with no leg through a building; traffic uses the causeway and
     comes back onto the lattice; police units come out along it; a cab comes along it.
   - The circuit: about 3 km, every corner's tangents fit its straights, a car can lap it at speed on its own racing
     line without leaving the track; a track day times valid laps (all sectors) and keeps the best.
   - Ownership: Clean Bank, no Rank or Rep gate (an early jackpot player can buy it); it survives a reload; its 24
     pit-garage bays are real parking that keeps the exact cars where they are; the impound's three yards still
     hold a space for every car you could own.
   - Official events: scrutineering by class and papers, the entry fee and the prize in Clean Bank (the fee waived
     for the owner), no heat from a cop watching, opponents who really race; the Invitational's car is awarded
     once, never again after a reload. A hosted meeting pays its gate once.
   - Streaming: the district's blocks and its near scenery go when you leave and come back when you return. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = true; g.env.time = 13;
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 1e9; };
  window.__step = (n, follow) => { for (let k = 0; k < n; k++) { g.update(0.05, 0.05); if (follow && k % 10 === 0 && g.vehicles.list.includes(follow)) g.resetPlayerState(follow.pos.x - Math.sin(follow.h) * 8, follow.pos.z - Math.cos(follow.h) * 8, 0); } };
  window.__car = (type, x, z, h = 0) => { const g2 = window.game, e = g2.content.addToGarage(type, 'bought', undefined, true); if (!e) return null; e.prov = { dirty: 0, clean: 1000 }; if (g2.player.state === 'vehicle') g2.exitVehicle(true); const v = g2.vreg.spawnFor(e, { x, z, h, y: 0 }); v.display = false; e.out = true; e.loc = { x, z, h, y: v.pos.y }; g2.resetPlayerState(x + 2.5, z, 0); g2.completeEnter(v); return e; };
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

// ---------------------------------------------------------------- 1. the world: a causeway out to an island
const world = await ev(() => {
  const g = window.game, w = g.world, pv = window.__pv, VP = pv.VP, out = {};
  out.links = w.links.filter(l => l.spur && l.name === 'Valen Point Causeway').map(l => ({ name: l.name, a: l.ends[0].axis + ':' + l.ends[0].line + ':' + l.ends[0].seg, b: !!l.ends[1].free }));
  out.groundCause = window.__pv.groundY(1200, VP.cw.z); out.groundIsland = window.__pv.groundY(1900, 500); out.sea = window.__pv.groundY(1200, VP.cw.z + 40); out.seaCity = window.__pv.groundY(1300, 200);
  // walls: from the perimeter road straight out along the causeway is open; along the old seawall it is not
  const res = { x: 0, z: 0 }, grid = w.grid;
  const hitAt = (x, z) => grid.resolveCircle(x, z, 0.6, 0.2, 1.5, {}).hit;
  out.openGap = [972, 980, 1100, 1430, 1445].every(x => !hitAt(x, VP.cw.z));
  out.wallNorth = hitAt(CITY_E(), VP.cw.z - 30) && hitAt(CITY_E(), VP.cw.z + 30);
  function CITY_E() { return 960 + 18; }
  out.rails = hitAt(1200, VP.cw.z - VP.cw.half) && hitAt(1200, VP.cw.z + VP.cw.half);
  out.islandEdge = hitAt(VP.x1, 500) && hitAt(1900, VP.z0) && hitAt(VP.x0, 300);
  out.blocks = w.xblocks.length; out.places = !!w.places.motorsport;
  void res;
  return out;
});
check('a causeway road leaves the east perimeter road (a spur off the lattice) and ends on the island', world.links.length === 1 && world.links[0].name === 'Valen Point Causeway' && world.links[0].a === '0:12:6' && world.links[0].b, JSON.stringify(world));
check('ground: road level along the causeway and on the island, sea beyond them', world.groundCause === 0 && world.groundIsland === 0 && world.sea < -1 && world.seaCity < -1, JSON.stringify(world));
check('walls: the seawall has a gap only for the causeway; the causeway has rails; the island has an edge', world.openGap && world.wallNorth && world.rails && world.islandEdge, JSON.stringify(world));

// ---------------------------------------------------------------- 2. the circuit
const circuit = await ev(() => {
  const g = window.game, T = g.world.vp.track, pv = window.__pv;
  const tight = T.R.filter(R => R > 0 && R < 60).length, R = [...new Set(T.corners.map(c => c.R))].sort((a, b) => a - b);
  // the longest straight, and the faster corners
  let run = 0, longest = 0; for (const r of T.R) { if (r === 0) { run += pv.VP_TRACK.step; longest = Math.max(longest, run); } else run = 0; }
  // the barrier lines never come within 8.5 m of any other part of the track (no shortcut, no barrier on the road)
  let worst = 1e9;
  for (const line of g.world.vp.barriers) for (let k = 0; k < line.length; k += 3) { const q = line[k]; if (!q) continue; for (let j = 0; j < T.pts.length; j += 2) { const p = T.pts[j]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < worst) worst = d; } }
  return { len: Math.round(T.len), fits: T.fits, corners: R, tight, longest, worst: +worst.toFixed(2), bays: g.world.vp.bays.length };
});
check('the circuit: about 3 km, every corner’s tangents fit its straights, broad sweepers (110–150 m) and only two slow corners (40–45 m), straights of over 400 m', circuit.len > 2800 && circuit.len < 3400 && circuit.fits && circuit.corners.filter(r => r >= 110).length >= 3 && circuit.corners.filter(r => r < 50).length === 2 && circuit.longest > 400, JSON.stringify(circuit));
check('the barriers keep off the road: no barrier within 8.5 m of the centreline anywhere', circuit.worst >= 8.5, JSON.stringify(circuit));

// ---------------------------------------------------------------- 3. a car drives itself there and back
const drive = async (to, follow = true) => {
  await ev(to => { const g = window.game, v = window.__drv; v.drive.setGoal(to.x, to.z); window.__trace = [[v.pos.x, v.pos.z]]; }, to);
  let st = null;
  for (let r = 0; r < 30; r++) {
    st = await ev(() => { const g = window.game, v = window.__drv; for (let k = 0; k < 100; k++) { window.__step(1, v); if (k % 5 === 0) window.__trace.push([v.pos.x, v.pos.z]); } return { arrived: v.drive.arrived, alive: g.vehicles.list.includes(v), x: v.pos.x, z: v.pos.z }; });
    if (st.arrived || !st.alive) break;
  }
  const tr = await ev(() => { const t = window.__trace; let jump = 0; for (let k = 1; k < t.length; k++) jump = Math.max(jump, Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1])); const cw = t.filter(p => p[0] > 980 && p[0] < 1430); return { jump: +jump.toFixed(1), n: t.length, onCause: cw.length && cw.every(p => Math.abs(p[1] - window.__pv.VP.cw.z) < window.__pv.VP.cw.half) }; });
  return { ...st, ...tr };
};
await ev(() => { const g = window.game; window.__calm(); g.police.enabled = false; g.resetPlayerState(940, 470, 0); const v = g.vehicles.spawn('sedan', 954, 470, 0, { driver: 'npc' }); v.mission = 'test'; v.touched = true; v.drive = new window.__pv.DriveAI(v, g, 'taxi'); v.drive.cruise = 18; window.__drv = v; });
const office = await ev(() => { const d = window.game.world.places.motorsport.door; return { x: d.x, z: d.z - 4 }; });
const there = await drive(office);
const back = await drive({ x: 700, z: 480 });
check('a car drives from the city along the causeway to Race Control, every step physical (no teleport: never more than 15 m in a quarter second)', there.arrived && there.alive && there.onCause && there.jump < 15 && Math.hypot(there.x - office.x, there.z - office.z) < 12, JSON.stringify(there));
check('…and drives back into the city the same way', back.arrived && back.alive && back.onCause && back.jump < 15 && back.x < 960, JSON.stringify(back));
await ev(() => { const g = window.game, v = window.__drv; g.vehicles.despawn(v); g.police.enabled = true; });

// ---------------------------------------------------------------- 4. the GPS both ways, never through a building
const gps = await ev(() => {
  const g = window.game, pv = window.__pv, VP = pv.VP, grid = g.world.grid, out = {};
  const through = r => { let bad = 0; for (let k = 1; k < r.length; k++) { const a = r[k - 1], b = r[k], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz); if (L < 0.5) continue; const h = grid.raycast(a.x, 1.0, a.z, dx / L, 0, dz / L, L, 0.5); if (h && h.col && (h.col.kind === 'bld' || h.col.kind === 'wall')) bad++; } return bad; };
  const cw = r => r.filter(q => q.x > 990 && q.x < 1430).every(q => Math.abs(q.z - VP.cw.z) < VP.cw.half);
  const T = g.world.vp.track, d = g.world.places.motorsport.door;
  for (const [name, a, b] of [['to office', [320, 300], [d.x, d.z]], ['office to city', [d.x, d.z], [320, 300]], ['city to circuit', [240, 700], T.pts[700]], ['circuit to city', T.pts[300], [600, 160]], ['annex', [480, 500], [1481.5, 230]]]) {
    const r = pv.gpsRoute(a[0], a[1], b[0], b[1]);
    out[name] = { n: r.length, ok: Math.hypot(r[r.length - 1].x - b[0], r[r.length - 1].z - b[1]) < 1 && cw(r), through: through(r) };
  }
  return out;
});
check('GPS routes there and back (city ↔ Race Control, city ↔ the circuit, the annex) along the causeway, no leg through a building or wall', Object.values(gps).every(o => o.ok && o.through === 0 && o.n > 3), JSON.stringify(gps));

// ---------------------------------------------------------------- 5. traffic and police use the causeway
const traffic = await ev(() => {
  const g = window.game, spur = g.world.links.find(l => l.spur && l.name === 'Valen Point Causeway'), out = { seen: 0, back: 0 };
  window.__calm(); g.police.enabled = false;
  g.resetPlayerState(1100, 527.5, 0);
  const watch = new Set();
  for (let k = 0; k < 1600; k++) {
    g.update(0.05, 0.05);
    for (const c of g.traffic.cars) if (c.ai && c.ai.path && c.ai.path.link === spur.id) watch.add(c);
    for (const c of watch) if (c.ai && c.ai.mode === 'lane' && g.vehicles.list.includes(c)) { out.back++; watch.delete(c); }
  }
  out.seen = out.back + watch.size;
  g.police.enabled = true;
  return out;
});
check('traffic drives the causeway and comes back onto the city’s roads', traffic.seen >= 1 && traffic.back >= 1, JSON.stringify(traffic));
const police = await ev(() => {
  const g = window.game, P = g.police, out = {};
  window.__calm(); g.hotwatch.cool = 1e9;
  const d = g.world.places.motorsport.door; g.resetPlayerState(d.x, d.z - 3, 0);
  P.setLevel(2); P.units.length = 0;
  for (let k = 0; k < 6 && !P.units.length; k++) P.spawnUnit();
  const u = P.units[0]; out.unit = !!u;
  if (u) { out.from = [Math.round(u.v.pos.x), Math.round(u.v.pos.z)]; const d0 = Math.hypot(u.v.pos.x - d.x, u.v.pos.z - d.z); for (let k = 0; k < 400; k++) { g.update(0.05, 0.05); g.resetPlayerState(d.x, d.z - 3, 0); } out.closer = d0 - Math.hypot(u.v.pos.x - d.x, u.v.pos.z - d.z); }
  window.__calm();
  return out;
});
check('police come out along the causeway after you on the island', police.unit && police.from[0] > 980 && police.closer > 40, JSON.stringify(police));

// ---------------------------------------------------------------- 6. ownership: an early jackpot player buys it, no gate
const buy = await ev(() => {
  const g = window.game, uw = g.uw, PM = uw.props, out = {};
  window.__calm();
  out.rank = uw.rank; out.rep = g.save.rep;
  g.money.W.clean = 0; out.poor = PM.buy('motorsport');
  g.money.W.clean = 2e6; window.__log = [];
  const cap0 = g.content.garageCap, price = PM.price(window.__pv.PROPS.find(p => p.id === 'motorsport'));
  out.why = PM.buy('motorsport');
  out.owned = PM.owned('motorsport'); out.paid = Math.round(2e6 - g.money.W.clean) === price; out.src = window.__log.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join();
  out.cap = g.content.garageCap - cap0;
  return out;
});
check('an early jackpot player (no Rank, next to no Rep) buys the park from the bank: no gate but the money; 24 pit-garage spaces come with it', buy.rank === 0 && buy.rep < 300 && /bank/.test(buy.poor) && buy.why === '' && buy.owned && buy.paid && buy.src === 'clean:property' && buy.cap === 24, JSON.stringify(buy));
const park = await ev(() => {
  const g = window.game, s = g.save, out = {};
  // three cars into the pit garages: their spaces are the garages' bays
  const ids = [];
  for (const t of ['sports', 'sedan', 'muscle']) { const e = g.content.addToGarage(t, 'bought', undefined, true); ids.push(e.uid); }
  window.__ids = ids;
  const es = ids.map(u => s.garage.find(e => e.uid === u));
  out.atPark = es.map(e => e.at && e.at.p);
  // park one of them out on the circuit's apron (street-parked where it stands)
  const e = es[2], v = g.vreg.spawnFor(e, { x: 1500, z: 470, h: 0, y: 0 }); e.out = true; e.loc = { x: 1500, z: 470, h: 0, y: v.pos.y };
  out.bays = es.map(e => g.vreg.bayPos(e)).map(b => b && [Math.round(b.x), Math.round(b.z)]); out.ids = ids;
  g.resetPlayerState(1490, 520, 0); window.__step(10);
  return out;
});
await reload();
const park2 = await ev(() => {
  const g = window.game;
  return { owned: g.uw.props.owned('motorsport'), cap: g.content.garageCap, pos: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)], prov: true };
});
check('save → reload: still yours; a position on the island is kept (not pulled back to the coast)', park2.owned && park2.pos[0] > 1400, JSON.stringify(park2));
const park3 = await ev(ids => {
  const g = window.game, s = g.save, es = ids.map(u => s.garage.find(e => e.uid === u));
  window.__step(20);
  const live = es.map(e => g.vreg.live(e)), out = { at: es.map(e => e.at && e.at.p), loc: es[2].loc && [Math.round(es[2].loc.x), Math.round(es[2].loc.z)] };
  out.inBays = es.slice(0, 2).map((e, i) => { const b = g.vreg.bayPos(e), v = live[i]; return !!(b && v && Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 1); });
  out.street = live[2] && Math.hypot(live[2].pos.x - 1500, live[2].pos.z - 470) < 1;
  out.dupes = ids.map(u => g.vehicles.list.filter(v => v.garageUid === u).length);
  return out;
}, park.ids);
check('pit-garage parking: each car keeps its exact garage bay (or its street spot on the apron) through a reload, one car each', park3.at.every(p => p === 'motorsport') && park3.inBays.every(Boolean) && park3.street && park3.dupes.every(n => n === 1), JSON.stringify({ park, park3 }));
const imp = await ev(() => { const g = window.game, pv = window.__pv, PM = g.uw.props; let bays = 0; for (const d of pv.PROPS) bays += PM.bays(d).length; return { bays, cap: g.impound.capacity(), lots: g.impound.lots() }; });
check('the impound still holds a space for every car you could own, now in three yards (the Valen Point annex too)', imp.cap >= imp.bays && imp.lots.length === 3 && imp.bays >= 118, JSON.stringify(imp));
// seized where it stands: on the island to the annex, downtown to the main yard (never across the causeway for nothing)
const where = await ev(() => {
  const g = window.game, I = g.impound, s = g.save, out = {};
  const one = (x, z) => { const e = g.content.addToGarage('sedan', 'bought', undefined, true); const v = g.vreg.spawnFor(e, { x, z, h: 0, y: 0 }); e.out = true; e.loc = { x, z, h: 0, y: v.pos.y }; g.resetPlayerState(x + 30, z, 0); I.seize(e, 'abandoned'); const r = { lot: I.lotOf(e), name: I.spaceName(e) }; e.imp = null; s.garage.splice(s.garage.indexOf(e), 1); return r; };
  out.island = one(1500, 470); out.city = one(400, 365);
  return out;
});
check('a car seized on Valen Point goes to the annex; one seized downtown goes to the city’s main yard', where.island.lot === 'impound_vp' && /annex/.test(where.island.name) && where.city.lot === 'impound' && /main yard/.test(where.city.name), JSON.stringify(where));

// ---------------------------------------------------------------- 7. official events: Clean money, class rules, no heat
const raceTo = async (id, place, prep) => {
  await ev(([id, prep]) => { const g = window.game, P = g.motorsport; window.__calm(); if (prep) (0, eval)(prep)(); const e = window.__pv.VP_EVENTS.find(x => x.id === id); P.enter(e); }, [id, prep || null]);
  await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); });
  await frames(page, 15);
  const obj = await ev(() => { const A = window.game.race.active; return A ? { phase: A.phase, obj: A.objective } : null; });
  if (!obj || obj.phase === 'toStart') { await ev(() => window.game.missions.fail('test')); return { refused: obj && obj.obj }; }
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  // let the field get away, a cop watching from the pit wall
  const mid = await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; const s0 = A.racers.map(r => [r.v.pos.x, r.v.pos.z]); g.police.spawnCop(window.__pv.VP_PIT.laneX, v.pos.z - 10); let saw = 0; for (let k = 0; k < 160; k++) { v.vel.set(Math.sin(v.h) * 30, Math.cos(v.h) * 30); g.update(0.05, 0.05); if (g.police.copCanSee(v.pos.x, v.pos.z, 40)) saw++; } return { moved: A.racers.map((r, i) => Math.round(Math.hypot(r.v.pos.x - s0[i][0], r.v.pos.z - s0[i][1]))), level: g.police.level, saw }; });
  await ev(place => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = place - 1; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); }, place);
  await page.waitForFunction(() => !window.game.missions.active, null, { timeout: 30000, polling: 50 });
  return { mid };
};
// not the owner: sell it back for this part (an outsider pays the entry)
// the cars for the events first (their spaces are the park's), then sell up for this part: an outsider pays the entry
await ev(() => { const g = window.game; window.__ev = { compact: window.__car('compact', 1490, 528, Math.PI / 2).uid, sports: g.content.addToGarage('sports', 'bought', undefined, true).uid, kodiak: g.content.addToGarage('kodiak', 'bought', undefined, true).uid }; g.save.uw.props.motorsport.owned = false; });
const cls = await raceTo('vp_gt', 1);
check('scrutineering: a car outside the event’s class doesn’t get on the grid (nothing charged)', cls.refused && /Wrong class/.test(cls.refused), JSON.stringify(cls));
const into = type => ev(type => { const g = window.game, e = g.save.garage.find(x => x.uid === window.__ev[type]); if (g.player.state === 'vehicle') g.exitVehicle(true); const v = g.vreg.live(e) || g.vreg.spawnFor(e, { x: 1490, z: 528, h: Math.PI / 2, y: 0 }); e.out = true; e.loc = { x: v.pos.x, z: v.pos.z, h: v.h, y: v.pos.y }; g.resetPlayerState(v.pos.x + 2.5, v.pos.z, 0); g.completeEnter(v); }, type);
await into('sports');
await ev(() => { const g = window.game; window.__log = []; window.__c0 = g.money.W.clean; window.__d0 = g.money.W.dirty.me; });
const gt = await raceTo('vp_gt', 1);
const gtMoney = await ev(() => { const g = window.game, L = window.__log.filter(x => /^track/.test(x.src) || x.cur === 'dirty'); return { in: L.filter(x => x.d > 0).map(x => x.cur + ':' + x.src + ':' + Math.round(x.d)).join(), out: L.filter(x => x.d < 0).map(x => x.cur + ':' + x.src + ':' + Math.round(-x.d)).join(), dirty: Math.round(g.money.W.dirty.me - window.__d0), level: g.police.level }; });
check('an official event: the entry fee and the prize are Clean Bank (no Dirty Cash moves), booked as the track’s', gtMoney.in === 'clean:trackPrize:6000' && gtMoney.out === 'clean:trackFee:1000' && gtMoney.dirty === 0, JSON.stringify(gtMoney));
check('…no heat from a cop watching you race it (it really saw you); the opponents really race (each covered ground)', gt.mid.level === 0 && gt.mid.saw > 0 && gt.mid.moved.length === 5 && gt.mid.moved.every(d => d > 60), JSON.stringify(gt));
const again = await (async () => { await ev(() => { window.__log = []; }); await raceTo('vp_gt', 1); return ev(() => window.__log.filter(x => x.d > 0 && /^track/.test(x.src)).map(x => x.src + ':' + Math.round(x.d)).join()); })();
check('the same event won again today pays half (the daily tiers, as street races)', again === 'trackPrize:3000', again);
// the owner: no entry fee; the Invitational's car once
await ev(() => { const g = window.game; g.save.uw.props.motorsport.owned = true; });
await into('kodiak');
await ev(() => { const g = window.game; window.__log = []; window.__n0 = g.save.garage.length; });
const inv = await raceTo('vp_inv', 1);
void inv;
const won = await ev(() => { const g = window.game, s = g.save; return { fee: window.__log.filter(x => x.d < 0 && x.src === 'trackFee').length, car: s.garage.filter(e => e.type === 'monarch' && e.origin === 'prize').length, flag: !!s.track.prize.vp_inv, n: s.garage.length - window.__n0 }; });
check('the owner races free; the Invitational’s winner gets the Monarch, once', won.fee === 0 && won.car === 1 && won.flag && won.n === 1, JSON.stringify(won));
await reload();
const won2 = await ev(() => { const g = window.game, s = g.save, P = g.motorsport, e = window.__pv.VP_EVENTS.find(x => x.id === 'vp_inv'); const v = g.player.state === 'vehicle' ? g.player.vehicle : null; return { car: s.garage.filter(e => e.type === 'monarch' && e.origin === 'prize').length, flag: !!s.track.prize.vp_inv, again: v ? P.canEnter(v, e) : P.s.prize.vp_inv ? 'won' : '' }; });
check('save → reload: one Monarch, the prize flagged; the Invitational can’t be won twice', won2.car === 1 && won2.flag && /already|won/.test(won2.again), JSON.stringify(won2));
// a hosted meeting: paid now, the gate once, the next day
const host = await ev(() => {
  const g = window.game, P = g.motorsport, uw = g.uw, out = {};
  window.__log = []; out.why = P.host(); out.twice = P.host();
  uw.S.day += 1; P.tickDay(); out.take = window.__log.filter(x => x.src === 'trackIncome').map(x => Math.round(x.d));
  P.tickDay(); out.take2 = window.__log.filter(x => x.src === 'trackIncome').map(x => Math.round(x.d));
  out.out = window.__log.filter(x => x.d < 0).map(x => x.src + ':' + Math.round(-x.d)).join();
  return out;
});
check('hosting a meeting costs Clean now and pays its gate once on the next day (with the park’s own takings)', host.why === '' && /already/.test(host.twice) && host.take.includes(32000) && host.take.includes(9000) && host.take2.filter(n => n === 32000).length === 1 && /trackHost:20000/.test(host.out), JSON.stringify(host));

// ---------------------------------------------------------------- 8. the circuit in free roam: a timed lap, at speed
const lap = await ev(() => {
  const g = window.game, P = g.motorsport, T = g.world.vp.track, pv = window.__pv, out = {};
  window.__calm(); g.police.enabled = false;
  out.book = P.book();
  // an AI car laps the circuit on its own racing line (it really drives it: barriers and all)
  const ck = pv.vpCheckpoints({ laps: 1 }), s = ck.start, v = g.vehicles.spawn('sports', s.x, s.z, s.h, { driver: 'npc' });
  v.mission = 'test'; v.touched = true; v.drive = new pv.DriveAI(v, g, 'race'); v.drive.path = ck.aiPath.map(c => ({ ...c })); v.drive.pi = 0; v.drive.wait = 0; v.drive.cruise = 60;
  let off = 0, maxV = 0, t = 0;
  for (let k = 0; k < 4000 && v.drive.pi < v.drive.path.length - 8; k++) {
    window.__step(1, v); t += 0.05; maxV = Math.max(maxV, v.speed);
    if (k % 10 === 0) { let d = 1e9; for (let j = 0; j < T.pts.length; j += 3) d = Math.min(d, Math.hypot(T.pts[j][0] - v.pos.x, T.pts[j][1] - v.pos.z)); if (d > 9) off++; }
  }
  out.done = v.drive.pi >= v.drive.path.length - 8; out.t = Math.round(t); out.maxV = Math.round(maxV * 3.6); out.off = off;
  g.vehicles.despawn(v);
  // the player's timed lap: crossing the line, every sector, crossing it again
  const e = window.__car('sports', T.pts[g.world.vp.sf.k][0], T.pts[g.world.vp.sf.k][1] + 30, Math.PI), pl = g.player.vehicle;
  const n = T.pts.length, k0 = g.world.vp.sf.k;
  for (let j = -12; j <= n + 6; j += 3) { const p = T.pts[((k0 + j) % n + n) % n]; pl.pos.x = p[0]; pl.pos.z = p[1]; pl.syncMesh(0); P.update(0.25); }
  out.laps = P.session && P.session.laps; out.best = P.s.best;
  // cutting the infield (skipping sectors) doesn't count
  const before = P.session.laps; for (const z of [g.world.vp.sf.z + 20, g.world.vp.sf.z - 20, g.world.vp.sf.z + 20, g.world.vp.sf.z - 20]) { pl.pos.x = g.world.vp.sf.x; pl.pos.z = z; pl.syncMesh(0); P.update(0.25); }
  out.cut = P.session.laps - before;
  void e;
  return out;
});
check('free roam: a car laps the circuit at speed on its own racing line and stays on the track', lap.done && lap.off === 0 && lap.maxV > 150 && lap.t < 200, JSON.stringify(lap));
check('a track day times a lap through every sector and keeps the best; cutting across doesn’t count', lap.book === '' && lap.laps === 1 && lap.best && lap.best.t > 0 && lap.cut === 0, JSON.stringify(lap));

// ---------------------------------------------------------------- 9. streaming: leaving and coming back
const stream = await ev(() => {
  const g = window.game, out = {};
  const xb = () => [...g.chunks.visible].filter(i => i >= 1000).length;
  g.resetPlayerState(1700, 520, 0); window.__step(60); out.there = xb(); out.nearThere = g.vpScene.near.visible;
  g.resetPlayerState(200, 300, 0); window.__step(60); out.away = xb(); out.nearAway = g.vpScene.near.visible; out.farAway = g.vpScene.far.visible; out.cached = g.chunks.chunks.size <= g.chunks.maxCached + 8;
  g.resetPlayerState(1560, 560, 0); window.__step(60); out.back = xb(); out.nearBack = g.vpScene.near.visible;
  return out;
});
check('streaming: the district’s blocks and near scenery show on the island, go when you are back in the city (far version only), and return', stream.there > 0 && stream.nearThere && stream.away === 0 && !stream.nearAway && stream.farAway && stream.cached && stream.back > 0 && stream.nearBack, JSON.stringify(stream));

// ---------------------------------------------------------------- 10. the maps
const maps = await ev(() => { const g = window.game, ui = g.ui; return { vp: !!ui.vpImg, w: ui.mapW, inMap: ui._mapXY(2380, 520)[0] <= ui.mapW }; });
check('the maps reach Valen Point (a painted district, panning east to it)', maps.vp && maps.w > 2000 && maps.inMap, JSON.stringify(maps));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'motorsport');
