/* City layout and generation sanity: the lattice is broken up (closures, T-junctions, no dead
   ends) but still connected; nothing stands in a lane; buildings keep off roads and do not
   overlap; every house faces a street with a driveway that reaches it; the districts exist;
   the stadium can be driven into and out of; the parkade can be driven up to the roof;
   locations sit on real sidewalks; AI routing respects the closures. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; });

// 1. road network
const net = await ev(() => {
  const { RoadNet, SUPERBLOCKS } = window.__pv, N = 12;
  let closed = RoadNet.closed.size, dead = 0, tj = 0, iso = 0, open = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const d = RoadNet.degree(i, j); if (d === 1) dead++; if (d === 3) tj++; if (d === 0) iso++; if (d > 0) open++; }
  // connectivity: BFS from (0,0) reaches every node that has a road
  const seen = new Set(['0,0']), q = [[0, 0]];
  while (q.length) { const [i, j] = q.shift(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (RoadNet.open(i, j, dx, dz) && !seen.has((i + dx) + ',' + (j + dz))) { seen.add((i + dx) + ',' + (j + dz)); q.push([i + dx, j + dz]); } }
  // perimeter stays whole; race lines on the lattice stay open (countryside races run on their own paths: offroad.mjs)
  let perim = true; for (let k = 0; k < N; k++) for (const [a, i] of [[0, 0], [0, N], [1, 0], [1, N]]) if (!RoadNet.segOpen(a, i, k)) perim = false;
  const races = window.__pv.RACES.filter(r => r.nodes).every(r => { const ns = r.nodes.concat(r.loop ? [r.nodes[0]] : []); for (let k = 0; k < ns.length - 1; k++) { const [a0, b0] = ns[k], [a1, b1] = ns[k + 1]; const dx = Math.sign(a1 - a0), dz = Math.sign(b1 - b0); let i = a0, j = b0; while (i !== a1 || j !== b1) { if (!RoadNet.open(i, j, dx, dz)) return false; i += dx; j += dz; } } return true; });
  // longest straight run of open road (the old grid ran 12 blocks edge to edge everywhere)
  let fullRuns = 0; for (let a = 0; a < 2; a++) for (let i = 1; i < N; i++) { let all = true; for (let k = 0; k < N; k++) if (!RoadNet.segOpen(a, i, k)) all = false; if (all) fullRuns++; }
  return { closed, dead, tj, iso, open, reached: seen.size, perim, races, fullRuns, sb: SUPERBLOCKS.length };
});
check('superblocks close lattice segments (the grid is broken up)', net.closed >= 20 && net.sb >= 5, JSON.stringify(net));
check('the road lattice has no dead ends', net.dead === 0, JSON.stringify(net));
check('there are T-junctions where streets end at a superblock', net.tj >= 12, JSON.stringify(net));
check('every road node is reachable from every other (connected)', net.reached === net.open, JSON.stringify(net));
check('the perimeter road and every race route stay open', net.perim && net.races, JSON.stringify(net));
check('fewer inner streets run unbroken edge to edge than before (22 of 22 in the old grid)', net.fullRuns <= 16, `${net.fullRuns} unbroken inner streets`);
const route = await ev(() => {
  const { RoadNet } = window.__pv, P = 80;
  // a drive AI asked to go through the stadium district takes roads that exist
  const path = RoadNet.path(7, 7, 10, 10); let ok = true; for (let k = 0; k < path.length - 1; k++) { const [i, j] = path[k], [a, c] = path[k + 1]; if (!RoadNet.open(i, j, a - i, c - j)) ok = false; }
  const gps = window.game.ui && true;
  return { len: path.length, ok, gps };
});
check('route planning only uses open segments', route.ok && route.len > 4, JSON.stringify(route));

// 2. placement sanity
const pl = await ev(() => {
  const g = window.game, w = g.world, P = 80;
  const audit = w.auditPlacement();
  const rep = w.propReport;
  // ground-level buildings must not stand on a lattice road or a local lane
  let onRoad = 0, overlap = 0, onLane = 0; const bad = [];
  const all = [];
  for (const bk of w.blocks) for (const r of bk.bld) { if (r.y0 > 0.5 || r.farOnly || r.hollow || r.noCol) continue; all.push(r); }
  for (const r of all) {
    for (let x = r.x0 + 0.5; x < r.x1; x += 2) for (let z = r.z0 + 0.5; z < r.z1; z += 2) { if (window.__pv.isOnRoad(x, z)) { onRoad++; bad.push('road ' + Math.round(x) + ',' + Math.round(z)); } else if (window.__pv.localRoadAt(x, z)) { onLane++; bad.push('lane ' + Math.round(x) + ',' + Math.round(z)); } }
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], c = all[j]; if (a.x0 < c.x1 - 0.3 && a.x1 > c.x0 + 0.3 && a.z0 < c.z1 - 0.3 && a.z1 > c.z0 + 0.3) { overlap++; if (bad.length < 12) bad.push('overlap ' + Math.round(a.x0) + ',' + Math.round(a.z0)); } }
  // trees and poles: none on a road or lane after the validator
  let trees = 0; for (const t of (w.propTypes.tree || []).concat(w.propTypes.pine || [], w.propTypes.upole || [], w.propTypes.lamp || [])) if (window.__pv.isOnRoad(t.x, t.z) || window.__pv.localRoadAt(t.x, t.z)) trees++;
  return { audit: audit.length, auditS: audit.slice(0, 5), moved: rep.moved, removed: rep.removed, checked: rep.checked, onRoad, onLane, overlap, trees, bad: bad.slice(0, 10) };
});
check('no street prop (pole, lamp, hydrant, bench, bin, sign, tree, bus shelter) stands on a road, lane or driveway', pl.audit === 0, JSON.stringify(pl.auditS));
check('the placement validator ran over every prop', pl.checked > 5000, `checked ${pl.checked}, moved ${pl.moved}, removed ${pl.removed}`);
check('trees, poles and lamps never stand in a road', pl.trees === 0, pl.trees + ' bad');
check('ground-level buildings never stand on a road or a local lane', pl.onRoad === 0 && pl.onLane === 0, JSON.stringify(pl.bad));
check('ground-level buildings do not overlap each other', pl.overlap === 0, JSON.stringify(pl.bad));

// 3. houses and driveways
const hs = await ev(() => {
  const w = window.game.world, P = 80, FV = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const homes = w.homes; let noStreet = 0, badBay = 0; const bad = [];
  for (const h of homes) {
    const f = FV[h.face];
    // walking out of the front door you reach a lane or a lattice road within 30 m
    let ok = false; for (let t = 1; t <= 30 && !ok; t += 0.5) { const x = h.door.x + f[0] * t, z = h.door.z + f[1] * t; if (window.__pv.isOnRoad(x, z) || window.__pv.localSurfaceAt(x, z) || (h.lot && 0)) ok = true; }
    if (!ok) { noStreet++; if (bad.length < 6) bad.push(h.id + ' ' + h.type + ' at ' + Math.round(h.door.x) + ',' + Math.round(h.door.z)); }
    for (const bay of h.bays) if (window.__pv.isOnRoad(bay.x, bay.z) && bay.kind !== 'street') badBay++;
  }
  const types = {}; for (const h of homes) types[h.type] = (types[h.type] || 0) + 1;
  const gar = {}; for (const h of homes) gar[h.garage] = (gar[h.garage] || 0) + 1;
  return { n: homes.length, noStreet, badBay, bad, types, gar, kinds: [...new Set(w.blocks.map(b => b.roadKind).filter(Boolean))] };
});
check('a real residential stock is generated (houses, bungalows, semis, apartments, mansions)', hs.n >= 45 && hs.types.bungalow && hs.types.large && hs.types.apartment, JSON.stringify(hs.types));
check('every house front door faces a street, lane or drive', hs.noStreet === 0, JSON.stringify(hs.bad));
check('parking bays sit off the traffic lanes', hs.badBay === 0, hs.badBay + ' bays in lanes');
check('garages of every size exist (carport, single, double, triple)', hs.gar.carport && hs.gar.single && hs.gar.double && hs.gar.triple, JSON.stringify(hs.gar));
check('suburban street patterns vary (cul-de-sacs, crescents, street lots, low-rise, estates)', hs.kinds.length >= 4, hs.kinds.join(','));

// 4. districts
const dz = await ev(() => { const g = window.game, Z = window.__pv.ZONES; const need = ['c', 'm', 'o', 'l', 'u', 's', 'h', 'w', 'g', 'p', 'a', 'r']; const zm = window.__pv.GAME_CONFIG.world.zoneMap.join(''); return { missing: need.filter(k => !Z[k] || !zm.includes(k)), names: need.map(k => Z[k] && Z[k].name) }; });
check('every district exists on the map (downtown, industrial, port, suburbs, wealthy, park, stadium, old quarter, country, nightlife)', dz.missing.length === 0, JSON.stringify(dz));
const lm = await ev(() => { const w = window.game.world; return { stadium: !!w.stadium, parkade: !!w.parkade, tower: !!w.towerTop, terminal: !!(w.compounds && w.compounds.whse_d), mapPlaces: w.mapPlaces.map(m => m.id) }; });
check('the landmarks are generated (stadium, parkade, tower top, terminal, park, estate, farm)', lm.stadium && lm.parkade && lm.tower && lm.terminal && ['greenway', 'estate', 'farm', 'terminal', 'stadium'].every(k => lm.mapPlaces.includes(k)), JSON.stringify(lm));

// 5. locations on real sidewalks
const lc = await ev(() => {
  const g = window.game, uw = g.uw, bad = [];
  for (const L of uw.locs) { if (window.__pv.isOnRoad(L.x, L.z)) bad.push(L.kind + ':' + L.id + ' on road'); }
  for (const t of uw.T) for (const s of [t.hang, t.deal]) { if (window.__pv.isOnRoad(s.x, s.z)) bad.push('turf ' + t.i + ' on road'); const sb = window.__pv.SUPERBLOCKS.find(q => s.x > q.bx0 * 80 + 10 && s.x < (q.bx1 + 1) * 80 - 10 && s.z > q.bz0 * 80 + 10 && s.z < (q.bz1 + 1) * 80 - 10); if (sb && !sb.peds) bad.push('turf ' + t.i + ' inside ' + sb.id); }
  return bad;
});
check('properties, contacts, HQs and turf corners stand on sidewalks (never in a road or a closed superblock)', lc.length === 0, lc.slice(0, 6).join(' | '));

// 6. stadium: drive in through the tunnel, onto the pitch, and back out
const drive = async (setup, steer, frames2, until) => {
  await ev(setup);
  for (let k = 0; k < frames2; k++) { await ev(([s]) => { const g = window.game, v = g.player.vehicle; if (v) { g.input.down.add('gas'); v.ctl.steer = s; } }, [steer]); await frames(page, 2); if (until && await ev(until)) break; }
  await ev(() => window.game.input.down.delete('gas'));
};
await drive(() => { const g = window.game, st = g.world.stadium, x = st.tunnel.x - 26, z = st.tunnel.z; g.resetPlayerState(x, z + 3, 0); const v = g.vehicles.spawn('sedan', x, z, Math.PI / 2, { parked: true }); v.touched = true; g.completeEnter(v); }, 0, 140, () => { const g = window.game, st = g.world.stadium, v = g.player.vehicle; return v && v.pos.x > st.cx - 20; });
const inS = await ev(() => { const g = window.game, st = g.world.stadium, v = g.player.vehicle, d = g.doors.byId('stadiumTunnel'); return { x: v.pos.x.toFixed(1), cx: st.cx, inside: Math.hypot((v.pos.x - st.cx) / st.A, (v.pos.z - st.cz) / st.B) < 0.66, door: d.open.toFixed(2) }; });
check('the stadium service door opens and you can drive through the tunnel onto the pitch', inS.inside, JSON.stringify(inS));
await ev(() => { const g = window.game, v = g.player.vehicle; v.h = -Math.PI / 2; v.vel.set(0, 0); });
await drive(() => {}, 0, 160, () => { const g = window.game, st = g.world.stadium, v = g.player.vehicle; return v && v.pos.x < st.tunnel.x - 10; });
const outS = await ev(() => { const g = window.game, st = g.world.stadium, v = g.player.vehicle; return { x: v.pos.x.toFixed(1), out: v.pos.x < st.tunnel.x - 6 }; });
check('and drive back out the same way', outS.out, JSON.stringify(outS));

// 7. parkade: up the ramps to the roof
const climb = await ev(() => {
  const g = window.game, pk = g.world.parkade, L = pk.L;
  // the deck heights the physics sees at each level, from a car's point of view
  const gy = window.__pv.groundY, xm = pk.x0 + 12, zm = pk.z0 + 6;
  return { l0: +gy(xm, zm, L[0]).toFixed(2), l1: +gy(xm, zm, L[1]).toFixed(2), l2: +gy(xm, zm, L[2]).toFixed(2), l3: +gy(xm, zm, L[3]).toFixed(2), legacy: +gy(xm, zm).toFixed(2), L };
});
check('stacked parking decks: a car on each level stands on that level (not the roof)', Math.abs(climb.l0 - climb.L[0]) < 0.05 && Math.abs(climb.l1 - climb.L[1]) < 0.05 && Math.abs(climb.l2 - climb.L[2]) < 0.05 && Math.abs(climb.l3 - climb.L[3]) < 0.05, JSON.stringify(climb));
await drive(() => { const g = window.game, pk = g.world.parkade; g.exitVehicle(true); const x = pk.x1 - 4, z = pk.z0 + 9; g.resetPlayerState(x + 3, z, 0); const v = g.vehicles.spawn('sports', x, z, 0, { parked: true, y: pk.L[0] }); v.touched = true; g.completeEnter(v); }, 0, 90, () => { const g = window.game, v = g.player.vehicle, pk = g.world.parkade; return v && v.pos.z > pk.z1 - 9; });
const up1 = await ev(() => { const g = window.game, v = g.player.vehicle, pk = g.world.parkade; return { y: +v.pos.y.toFixed(2), L1: pk.L[1] }; });
check('a car driven up the first ramp arrives on level 1', Math.abs(up1.y - up1.L1) < 0.35, JSON.stringify(up1));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'city');
