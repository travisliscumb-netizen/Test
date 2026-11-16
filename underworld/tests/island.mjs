/* Operation Blackgate: Valen Island (022, 127, 177, 232, 245).
   - The island: an irregular shore with sea all round, beaches, a bay, a lake, islets; highlands and lowlands; the city
     on its waist with a seawall only where it meets the water; ground that the physics and the meshes share.
   - Districts and places: every district off the lattice by name; the airport, the proving ground, the fire station,
     the settlements, the lighthouse and the observatory as places; the city's own essentials still there.
   - Roads: every island road is a curved link in the road graph; the GPS finds a way from the middle of the city to
     every place out there and back; road beds are level across and no steeper than their grade; the bridge's deck
     and the tunnel's floor answer by height.
   - The sea: you wade and slow down; a car bogs down.
   - The fleet: race cars in the Valen Point pits and at the proving ground (taken and driven like any car, faster than
     a street car, not something you can keep); aircraft at the airport; a helicopter on each of the two roofs.
   - Flight: the aeroplane takes off from the runway, climbs, turns and lands on it; the helicopter spools up, lifts
     straight off the hospital's roof, flies and sets down again. You cannot step out in the air.
   - The map: the whole island in map space, zoom out to all of it; a save out on the island comes back where it was.
   - A touch phone in landscape boots it, keeps the near ground within budget and relabels its buttons in an aircraft. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const first = await open(b), { page, errors } = first;
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => {
  const g = window.game; g.police.enabled = false; g.events.cool = 1e9; g.save.settings.guide = false; if (g.debug) g.debug.god = true;
  window.__keys = new Set(); const D = g.input.isDown.bind(g.input); g.input.isDown = a => window.__keys.has(a) || D(a);
});
const keys = k => ev(k => { window.__keys = new Set(k); }, k);
// ---------------------------------------------------------------- the island
const isle = await ev(() => {
  const g = window.game, { Island: I, ISLE, SEA_Y, groundY, LAKE, MT_VALEN } = window.__pv, S = 32;
  let land = 0, n = 0, hi = -99, west = 1e9, east = -1e9, north = 1e9, south = -1e9;
  for (let z = ISLE.z0 + S / 2; z < ISLE.z1; z += S) for (let x = ISLE.x0 + S / 2; x < ISLE.x1; x += S) { n++; const h = I.height(x, z, 1e6); if (h > SEA_Y + 0.3) { land++; hi = Math.max(hi, h); west = Math.min(west, x); east = Math.max(east, x); north = Math.min(north, z); south = Math.max(south, z); } }
  // the shore's outline is irregular: its distance from the island's middle swings widely round the compass
  const rad = []; for (let a = 0; a < 360; a += 5) { let r = 0; for (let d = 100; d < 4200; d += 20) if (I.land(250 + Math.cos(a * Math.PI / 180) * d, -300 + Math.sin(a * Math.PI / 180) * d)) r = d; rad.push(r); }
  const edge = (x, z) => I.height(x, z, 1e6) < SEA_Y - 0.25;
  return {
    ready: I.ready, km2: +(land * S * S / 1e6).toFixed(1), frac: +(land / n).toFixed(2), hi: Math.round(hi), span: [Math.round(east - west), Math.round(south - north)],
    radMin: Math.min(...rad), radMax: Math.max(...rad), seaAllRound: [[ISLE.x0 + 40, 0], [ISLE.x1 - 40, 0], [0, ISLE.z0 + 40], [0, ISLE.z1 - 40]].every(p => edge(p[0], p[1])),
    bay: I.sea(-520, 250) && I.sea(-300, 600), sound: I.sea(1200, 500), lake: I.lake(LAKE.x, LAKE.z) && I.land(LAKE.x, LAKE.z - 420) && I.land(LAKE.x, LAKE.z + 420) && I.land(LAKE.x - 520, LAKE.z) && I.land(LAKE.x + 520, LAKE.z),
    islets: [[-560, 470], [-1720, 520], [2860, -900], [-1450, 2720], [2680, 2480], [-2330, -2480]].filter(p => I.land(p[0], p[1])).length,
    summit: Math.round(I.height(MT_VALEN.x, MT_VALEN.z, 1e6)), beach: (() => { let x = -1000; while (x > -1500 && I.land(x, 1500)) x -= 2; return I.surface(x + 14, 1500, I.height(x + 14, 1500, 1e6), 0); })(),
    shore: Object.fromEntries(Object.entries(g.world.shore).map(([k, v]) => [k, v.reduce((s, r) => s + r[1] - r[0], 0) | 0])),
    // the seawall's runs by precinct and side (CITY_SPREAD.md: the city stands in precincts round Valen Bay)
    walls: (() => { const o = {}; for (const r of g.world.shoreRuns) { const id = window.__pv.CityLayout.precincts[r.k].id + '.' + r.side; o[id] = (o[id] || 0) + Math.round(r.b - r.a); } return o; })(),
    layout: window.__pv.CityLayout.id,
    wade: +groundY(-300, 500).toFixed(2), cityEdge: [+groundY(400, -19).toFixed(2), +groundY(400, -30).toFixed(2), +groundY(400, -17).toFixed(2)]
  };
});
check('the island is built: about 19 km² of land in a 5.6 × 6.4 km sea, sea on every edge of the map, a summit over 240 m', isle.ready && isle.km2 > 15 && isle.km2 < 24 && isle.frac < 0.62 && isle.seaAllRound && isle.hi > 240 && isle.summit > 235, JSON.stringify(isle));
check('an irregular outline, not a rectangle: the shore is between a few hundred metres and several kilometres from the middle', isle.radMin < 900 && isle.radMax > 2400 && isle.span[0] > 4200 && isle.span[1] > 5200, JSON.stringify([isle.radMin, isle.radMax, isle.span]));
check('Valen Bay west of the city, Valen Sound east of it, Lake Valen inland with land all round it, six islets', isle.bay && isle.sound && isle.lake && isle.islets === 6, JSON.stringify(isle));
check('a beach on the long shore (sand), and you can wade: the sea floor is never deeper than 1.25 m under the surface', isle.beach === 1 && Math.abs(isle.wade - (-2.45)) < 0.01, JSON.stringify([isle.beach, isle.wade]));
{ const W = isle.walls, w = k => W[k] || 0;
  check('the seawall stands only where the city meets water: the port on Valen Sound, the Nightlife Strip and the core\'s and Old Quarter\'s west streets on Valen Bay; the core\'s north street and Linden Hills\' south street over dry ground have none',
    isle.layout === 'island' && w('port.e') > 900 && w('strip.n') > 400 && w('core.w') + w('oldquarter.w') > 300 && w('core.n') < 60 && w('linden.s') < 20, JSON.stringify(W)); }
check('the ground carries on from the city’s promenade without a step you could not walk', isle.cityEdge.every(h => h > -0.1 && h < 0.6), JSON.stringify(isle.cityEdge));
// the meshes and the physics share the ground: a near tile's vertices are the tile's heights, and a point inside a cell
// is on one of its two triangles
const mesh = await ev(() => {
  const g = window.game, { Island: I, ISLE } = window.__pv; g.resetPlayerState(-900, -700, 0); for (let k = 0; k < 40; k++) g.isleScene.update(-900, -700);
  const T = [...g.isleScene.tiles.values()][0], m = T.group.children[0], pos = m.geometry.attributes.position; let worst = 0;
  for (let i = 0; i < 4225; i += 37) worst = Math.max(worst, Math.abs(pos.getY(i) - I.height(pos.getX(i), pos.getZ(i), 1e6)));
  const x0 = ISLE.x0 + T.tx * ISLE.tile, z0 = ISLE.z0 + T.tz * ISLE.tile, a = I.height(x0 + 40, z0 + 40), bq = I.height(x0 + 44, z0 + 40), c = I.height(x0 + 40, z0 + 44), mid = I.height(x0 + 41, z0 + 41);
  return { worst, tri: Math.abs(mid - (a + (bq - a) * 0.25 + (c - a) * 0.25)), tiles: g.isleScene.tiles.size, far: g.isleScene.far.geometry.drawRange.count / 3 | 0, trees: g.isleScene.stats.trees };
});
check('a near tile is drawn with the heights the physics stands on (to the millimetre), a cell is its two triangles', mesh.worst < 0.002 && mesh.tri < 1e-6 && mesh.tiles > 3 && mesh.far > 5000, JSON.stringify(mesh));
// ---------------------------------------------------------------- districts and places
const zones = await ev(() => {
  const { zoneKey, ZONES, districtNameAt } = window.__pv, g = window.game;
  const CL = window.__pv.CityLayout, L = (x, z) => [CL.wx(x, z), CL.wz(x, z)]; // a lattice point where its block stands
  // (Saltmarsh's village gave way to the Nightlife Strip; its shore west of the Strip keeps the name)
  const at = { ridge: [250, -560], mount: [350, -1500], highlands: [-1500, -900], saltmarsh: [-800, 1340], southshore: [-600, 2000], airport: [600, 2100], proving: [1400, 1560], vp: [1800, 500], cfs: [300, 1300], downtown: [520, 440] };
  const out = {}; for (const k in at) out[k] = ZONES[zoneKey(at[k][0], at[k][1])].name;
  out.names = [districtNameAt(350, -1500), districtNameAt(-300, 500), districtNameAt(1650, -900)];
  // a city street's name on its own street, and what the same grid lines are called out on the island
  const { streetNameAt } = window.__pv;
  out.streets = [streetNameAt(...L(80, 300)), streetNameAt(...L(80, 80)), streetNameAt(...L(300, 480)), streetNameAt(-12, 480), streetNameAt(600, 1800)];
  out.offStreets = [[80, 1500], [80, 2300], [400, -1200], [-1100, 480], [1900, 480], [2000, 560], [320, 2410], [-600, 322]].map(q => streetNameAt(q[0], q[1]));
  out.want = ['airport', 'proving', 'firehouse', ...(CL.at(-500, 1150) ? [] : ['saltmarsh']), 'gull', 'lighthouse', 'summit', 'motorsport', 'offroad', 'police', 'hospital', 'chopshop'];
  out.places = out.want.filter(id => g.world.places[id] && isFinite(g.world.places[id].door.x));
  out.banks = Object.keys(window.__pv.BANKS).length; out.casino = !!g.world.places.casino || Object.values(g.world.places).some(p => /Royale/i.test(p.name || ''));
  return out;
});
check('every district off the lattice by name', zones.ridge === 'Crestmoor Ridge' && zones.mount === 'Mount Valen' && zones.highlands === 'Blackgate Highlands' && zones.saltmarsh === 'Saltmarsh' && zones.southshore === 'Southshore' && zones.airport === 'Port Valen International' && zones.proving === 'Valen Proving Ground', JSON.stringify(zones));
check('Valen Point, Cedar Fields and the city’s own districts keep theirs; the water has names too', zones.vp === 'Valen Point' && zones.cfs === 'Cedar Fields' && zones.downtown === 'Financial District' && zones.names[0] === 'Mount Valen' && zones.names[1] === 'Offshore' && zones.names[2] === 'Lake Valen', JSON.stringify(zones));
check('a city street is named on its own street and nowhere else: the grid\u2019s lines across the mountain, the runways, the bridge and the racetrack are not Ash St or Central Blvd',
  zones.streets[0] === 'Ash St' && zones.streets[1] === 'Ash St & 1st Ave' && zones.streets[2] === 'Central Blvd' && zones.streets[3] === 'Central Blvd' && zones.streets[4] === 'Airport Access' &&
  zones.offStreets.every(n => n === null || !/ (St|Ave|Blvd)$|^(Harbor Ave|Foundry Rd|Quay Rd|North Shore Dr|South Shore Dr)$/.test(n)), JSON.stringify([zones.streets, zones.offStreets]));
check('the new places are on the map, and the city’s essentials still are (police, hospital, chop shop, three banks, the casino)', zones.places.length === zones.want.length && zones.want.length >= 11 && zones.banks === 3 && zones.casino, JSON.stringify(zones));
// ---------------------------------------------------------------- roads
const roads = await ev(() => {
  const g = window.game, { Island: I, RoadGraph: RG, Links, groundY, SEA_Y } = window.__pv, out = { roads: I.roads.map(R => R.name), links: I.roads.filter(R => Links.list.some(L => L.name === R.name)).length };
  const from = [500, 480], to = { airport: [600, 1850], proving: [1200, 1480], summit: [395, -1815], lighthouse: [1528, -2775], saltmarsh: [-520, 1172], gull: [-1265, -2265], bridge: [-1100, 500], tunnel: [-1925, -1270], vp: [1515, 520], cfs: [400, 1126], ridge: [140, -604] };
  out.routes = {}; for (const k in to) { const r = RG.route(from[0], from[1], to[k][0], to[k][1], { kinds: new Set(['grid', 'link', 'spur', 'ext']) }), back = RG.route(to[k][0], to[k][1], from[0], from[1], { kinds: new Set(['grid', 'link', 'spur', 'ext']) }); out.routes[k] = r && back ? [Math.round(r.len), Math.round(Math.hypot(r.g.x - to[k][0], r.g.z - to[k][1]))] : null; }
  // from Saltmarsh to Gull Harbor the short way is over the bridge
  const rb = RG.route(-520, 1172, -1265, -2265, {}); out.overBridge = rb && rb.steps.some(s => s.e.name === 'Blackgate Bridge'); out.gps = window.__pv.gpsRoute(500, 480, 600, 1850).length;
  // beds: level across, the ground on the centre line is the road's own level, no steeper than the grade
  let cross = 0, centre = 0, grade = 0, total = 0;
  for (const R of I.roads) {
    total += R.len;
    for (let k = 2; k < R.pts.length - 2; k += 3) {
      // (not on a span, not inside the city's square, not within 40 m of where it meets another road: two beds share the ground there)
      const p = R.pts[k]; if (R.sp[k] || R.sp[k - 1] || R.sp[k + 1] || window.__pv.CityLayout.inCity(p[0], p[1], 30)) continue;
      if (I.roads.some(Q => Q !== R && (Q.hosts.some(H => H && H.road === R && Math.hypot(R.pts[H.k][0] - p[0], R.pts[H.k][1] - p[1]) < 40) || R.hosts.some(H => H && H.road === Q && Math.hypot(Q.pts[H.k][0] - p[0], Q.pts[H.k][1] - p[1]) < 40)))) continue;
      const a = R.pts[k - 1], c = R.pts[k + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]), nx = (c[1] - a[1]) / l, nz = -(c[0] - a[0]) / l, w = R.w / 2 - 1.5;
      const h0 = groundY(p[0], p[1], R.y[k] + 1), hl = groundY(p[0] + nx * w, p[1] + nz * w, R.y[k] + 1), hr = groundY(p[0] - nx * w, p[1] - nz * w, R.y[k] + 1);
      centre = Math.max(centre, Math.abs(h0 - R.y[k])); cross = Math.max(cross, Math.abs(hl - hr));
      grade = Math.max(grade, Math.abs(R.y[k + 1] - R.y[k]) / (R.cum[k + 1] - R.cum[k]) - R.grade);
    }
  }
  out.beds = { centre: +centre.toFixed(3), cross: +cross.toFixed(3), grade: +grade.toFixed(4), km: +(total / 1000).toFixed(1) };
  // the bridge: the deck for whoever is on it, the sea for whoever is under it; the tunnel: its floor inside, the hill above
  const B = I.roads.find(R => R.name === 'Blackgate Bridge'), kb = Math.round((B.bridges[0][0] + B.bridges[0][1]) / 2), pb = B.pts[kb];
  out.bridge = { len: Math.round(B.cum[B.bridges[0][1]] - B.cum[B.bridges[0][0]]), deck: +B.y[kb].toFixed(1), on: +groundY(pb[0], pb[1], B.y[kb] + 1).toFixed(2), under: +groundY(pb[0], pb[1], SEA_Y).toFixed(2), beside: +groundY(pb[0] + 14, pb[1], B.y[kb] + 1).toFixed(2), rails: g.world.isle.rails.filter(r => r.kind === 1).length, towers: g.world.isle.towers.length };
  const T = I.roads.find(R => R.tunnel), kt = Math.round((T.tunnel[0] + T.tunnel[1]) / 2), pt = T.pts[kt];
  out.tunnel = { road: T.name, len: Math.round(T.cum[T.tunnel[1]] - T.cum[T.tunnel[0]]), floor: +T.y[kt].toFixed(2), inside: +groundY(pt[0], pt[1], T.y[kt] + 1).toFixed(2), above: +groundY(pt[0], pt[1], T.y[kt] + 60).toFixed(1) };
  out.spots = window.__pv.extRoadSpots(600, 1716).length;
  out.ribbon = [g.isleScene.roads.children.reduce((s, m) => s + m.geometry.attributes.position.count, 0), I.roads.reduce((s, R) => s + R.pts.filter(p => window.__pv.offCity(p[0], p[1])).length, 0) * 2];
  return out;
});
check('the island\'s roads (its own, the new districts\' streets and the roads between the city\'s precincts), every one a curved link in the road graph, over 25 km of them, each painted by a ribbon along its own polyline', roads.roads.length >= 17 && roads.links === roads.roads.length && roads.beds.km > 25 && roads.ribbon[0] >= roads.ribbon[1], JSON.stringify([roads.roads, roads.beds, roads.ribbon]));
check('the GPS finds a way from the middle of the city to every place on the island, and back', Object.values(roads.routes).every(r => r && r[0] > 300 && r[1] < 60), JSON.stringify(roads.routes));
check('Saltmarsh to Gull Harbor goes over the Blackgate Bridge; the in-game GPS routes to the airport', roads.overBridge && roads.gps > 10, JSON.stringify([roads.overBridge, roads.gps]));
check('road beds: the ground on the centre line is the road’s own level, level across, never steeper than the road’s grade', roads.beds.centre < 0.1 && roads.beds.cross < 0.1 && roads.beds.grade < 0.002, JSON.stringify(roads.beds));
check('the Blackgate Bridge: over 500 m of deck 16 m up for whoever is on it, the sea for whoever is under or beside it, rails and two towers', roads.bridge.len > 500 && Math.abs(roads.bridge.on - roads.bridge.deck) < 0.01 && roads.bridge.deck > 14 && roads.bridge.under < -2 && roads.bridge.beside < -2 && roads.bridge.rails === 2 && roads.bridge.towers === 2, JSON.stringify(roads.bridge));
check('the Blackgate Tunnel: 400–560 m under the ridge on the Coast Highway, its floor inside, the hill over it', roads.tunnel.road === 'Coast Highway' && roads.tunnel.len > 400 && roads.tunnel.len < 560 && Math.abs(roads.tunnel.inside - roads.tunnel.floor) < 0.01 && roads.tunnel.above > roads.tunnel.floor + 20, JSON.stringify(roads.tunnel));
check('police units and cabs have road to arrive by out on the island', roads.spots > 10, String(roads.spots));
// ---------------------------------------------------------------- the airport
const ap = await ev(() => {
  const g = window.game, { AIRPORT: A, Island: I, groundY } = window.__pv, ids = g.world.xblocks.filter(b => b.xb && b.xb.startsWith('ap_'));
  let flat = 0; for (const r of A.rw) for (let x = r.x0; x <= r.x1; x += 25) for (const dz of [-r.w / 2, 0, r.w / 2]) flat = Math.max(flat, Math.abs(groundY(x, r.z + dz) - A.y));
  const term = g.world.xblocks.find(b => b.xb === 'ap_term'), east = g.world.xblocks.find(b => b.xb === 'ap_hangars');
  return { rw: A.rw.map(r => r.x1 - r.x0), flat: +flat.toFixed(3), blocks: ids.length, tower: term.bld.some(r => r.y0 + r.h > A.y + 38), terminal: term.bld.some(r => r.x1 - r.x0 >= 200), hangars: g.world.isle.sites.hangars.length, hangarWalls: east.det.filter(d => d.col).length, pads: g.world.isle.sites.helipads.length,
    lights: g.world.xblocks.filter(b => b.xb && b.xb.startsWith('ap_lights')).reduce((s, b) => s + b.fx.length, 0), road: !!window.__pv.RoadGraph.nearest(600, 1840, { maxD: 30 }) };
});
check('the airport: two runways (over 1.5 km and 1.1 km), dead level, a terminal, a control tower, three hangars you can taxi into, two helipads, runway lights, a road to the door', ap.rw[0] >= 1500 && ap.rw[1] >= 1100 && ap.flat < 0.02 && ap.terminal && ap.tower && ap.hangars === 3 && ap.hangarWalls >= 9 && ap.pads === 2 && ap.lights > 120 && ap.road, JSON.stringify(ap));
// ---------------------------------------------------------------- the sea
const sea = await ev(async () => {
  const g = window.game, p = g.player, { SEA_Y } = window.__pv; g.resetPlayerState(-1195, 1500, -Math.PI / 2);
  return { y0: +p.pos.y.toFixed(2), sea: SEA_Y };
});
// (walking reads the movement keys themselves: hold W, facing west down the beach)
await ev(() => { const g = window.game; g.cam.yaw = -Math.PI / 2; g.input.down.add('up'); }); await frames(page, 30);
const dry = await ev(() => { const p = window.game.player; return { x: p.pos.x, v: Math.hypot(p.vel.x, p.vel.z) }; });
const wet = await ev(async () => {
  const g = window.game, p = g.player, I = window.__pv.Island; let x = -1000; while (x > -1500 && I.land(x, 1500)) x -= 2;
  g.resetPlayerState(x - 14, 1500, -Math.PI / 2); g.cam.yaw = -Math.PI / 2; g.input.down.add('up');
  await new Promise(r => { let n = 0; const f = () => (++n > 45 ? r() : requestAnimationFrame(f)); f(); });
  const o = { y: +p.pos.y.toFixed(2), v: Math.hypot(p.vel.x, p.vel.z), state: p.state, alive: g.state === 'playing' }; g.input.down.delete('up'); return o;
});
check('you walk down the beach into the sea and wade: slower the deeper, never under, still on your feet', dry.v > 3.5 && wet.y < sea.sea - 0.6 && wet.y >= sea.sea - 1.26 && wet.v > 0.8 && wet.v < dry.v * 0.7 && wet.alive && wet.state === 'foot', JSON.stringify([sea, dry, wet]));
const bog = await ev(() => { const g = window.game, v = g.vehicles.spawn('sedan', -1290, 1500, -Math.PI / 2, {}); v.vel.set(-20, 0); v.driver = 'npc'; window.__bog = v; return +v.pos.y.toFixed(2); });
await frames(page, 60);
const bog2 = await ev(() => { const v = window.__bog, s = v.speed; window.game.vehicles.despawn(v); return +s.toFixed(1); });
check('a car in the sea bogs down', bog < -1.7 && bog2 < 6, JSON.stringify([bog, bog2]));
// ---------------------------------------------------------------- the fleet: race cars
const fleet = await ev(() => {
  const g = window.game, { VEHICLES: V, CARGO_LB, CAR_MSRP } = window.__pv; g.resetPlayerState(1590, 560, 0); g.fleet.update(1590, 560);
  const cars = g.vehicles.list.filter(v => v.fleet), race = cars.filter(v => V[v.type].race);
  return { n: cars.length, race: race.map(v => v.type), styles: [...new Set(race.map(v => V[v.type].race))].length, pit: race.filter(v => Math.abs(v.pos.x - 1573.3) < 1).length, unlocked: race.every(v => !v.locked),
    faster: V.gt3.vmax > V.supercar.vmax && V.lmp.grip > V.supercar.grip && V.formula.mass < 800, inert: race.every(v => CARGO_LB[v.type] === undefined && !CAR_MSRP[v.type]), sites: g.world.isle.fleet.length };
});
check('Valen Point: a dozen race cars of six kinds (GT, cup, prototype, open-wheel, rally, drift) in the pit boxes and the paddock, unlocked', fleet.race.length >= 12 && fleet.styles === 6 && fleet.pit === 6 && fleet.unlocked, JSON.stringify(fleet));
check('they outrun and outgrip the street’s fastest, and they are track property (nothing to keep or sell)', fleet.faster && fleet.inert, JSON.stringify(fleet));
// take the GT car from its pit box and drive it down the pit lane and out onto the circuit
const take = await ev(() => { const g = window.game, v = g.vehicles.list.find(v => v.type === 'gt3' && Math.abs(v.pos.x - 1573.3) < 1); g.player.pos.set(v.pos.x + 1.7, v.pos.y, v.pos.z); const n = g.nearestVehicle(1.8); window.__car = v; if (n) g.beginEnter(n); return { near: n && n.type, prompt: document.getElementById('prompt') ? document.getElementById('prompt').textContent : '' }; });
await frames(page, 70);
const inCar = await ev(() => { const g = window.game, p = g.player; return { state: p.state, type: p.vehicle && p.vehicle.type, stolen: g.save.stats.stolen }; });
check('you walk up to the GT car, take it and are in the seat', take.near === 'gt3' && inCar.state === 'vehicle' && inCar.type === 'gt3' && inCar.stolen >= 1, JSON.stringify([take, inCar]));
await ev(() => { const v = window.__car, T = window.game.world.vp.track, k = window.game.world.vp.sf.k; v.pos.set(T.pts[k][0], 0, T.pts[k][1] + 30); v.h = Math.PI; v.vel.set(0, 0); });
await keys(['up']);
let top = 0; for (let k = 0; k < 6; k++) { await frames(page, 30); top = Math.max(top, await ev(() => window.__car.speed)); }
const lap = await ev(top => { const v = window.__car; return { spd: +top.toFixed(1), z: Math.round(v.pos.z), x: Math.round(v.pos.x), hp: Math.round(v.health) }; }, top);
await keys([]); await ev(() => window.game.exitVehicle(true));
check('and drive it on the circuit: flat out down the main straight it is past 150 km/h within a few seconds, in one piece', lap.spd > 42 && lap.z < 560 && lap.hp > 60, JSON.stringify(lap));
const prov = await ev(() => { const g = window.game, { PROVING: G, groundY } = window.__pv; g.resetPlayerState(G.strip.x0 + 12, G.strip.z + 9.5, 0); g.fleet.update(G.strip.x0, G.strip.z); let flat = 0; for (let x = G.strip.x0; x <= G.strip.x1; x += 20) flat = Math.max(flat, Math.abs(groundY(x, G.strip.z) - G.y)); return { cars: g.vehicles.list.filter(v => v.fleet === 'proving').map(v => v.type), len: G.strip.x1 - G.strip.x0, flat: +flat.toFixed(3), pad: G.pad.r }; });
check('the proving ground: a level kilometre of strip, a skid pad, cars waiting on the start line', prov.len >= 1000 && prov.flat < 0.02 && prov.pad >= 50 && prov.cars.length >= 5, JSON.stringify(prov));
// ---------------------------------------------------------------- flight: the aeroplane
const st = () => ev(() => { const g = window.game, v = g.player.vehicle; if (!v || !v.air) return { dead: true, state: g.state }; const A = v.air; return { x: Math.round(v.pos.x), z: Math.round(v.pos.z), y: +v.pos.y.toFixed(1), agl: +A.agl.toFixed(1), spd: +Math.hypot(v.vel.x, v.vel.y).toFixed(1), vy: +A.vy.toFixed(1), pitch: +A.pitch.toFixed(2), bank: +A.bank.toFixed(2), thr: +A.thr.toFixed(2), on: +A.on.toFixed(2), gnd: A.grounded, hp: Math.round(v.health), h: +(((v.h % 6.2832) + 6.2832) % 6.2832).toFixed(2) }; });
// held keys until a condition, flown by the physics alone at 1/60 s a step (a circuit takes seconds of test, not minutes
// of software rendering); a few frames are drawn after each leg
await ev(src => { window.__st = new Function('return (' + src + ')()'); }, (() => { const g = window.game, v = g.player.vehicle; if (!v || !v.air) return { dead: true, state: g.state }; const A = v.air; return { x: Math.round(v.pos.x), z: Math.round(v.pos.z), y: +v.pos.y.toFixed(1), agl: +A.agl.toFixed(1), spd: +Math.hypot(v.vel.x, v.vel.y).toFixed(1), vy: +A.vy.toFixed(1), pitch: +A.pitch.toFixed(2), bank: +A.bank.toFixed(2), thr: +A.thr.toFixed(2), on: +A.on.toFixed(2), gnd: A.grounded, hp: Math.round(v.health), h: +(((v.h % 6.2832) + 6.2832) % 6.2832).toFixed(2) }; }).toString());
const hold = async (k, until, max = 1200) => {
  await keys(k);
  const s = await ev(([src, n]) => { const g = window.game, f = new Function('s', 'return (' + src + ')(s)'); let s = window.__st(); for (let i = 0; i < n && !s.dead && !f(s); i++) { g.driveControl(1 / 60); g.vehicles.update(1 / 60); s = window.__st(); } return s; }, [until.toString(), max * 4]);
  await frames(page, 3); return s;
};
const air0 = await ev(() => {
  const g = window.game; g.resetPlayerState(1026, 1975, Math.PI); g.fleet.live.clear(); g.fleet.update(1026, 1975);
  const planes = g.vehicles.list.filter(v => v.type === 'skylark'), helis = g.vehicles.list.filter(v => v.type === 'heli'), v = planes.find(v => Math.abs(v.pos.x - 1023) < 3);
  g.player.pos.set(v.pos.x + 1.6, v.pos.y, v.pos.z); const n = g.nearestVehicle(1.8); if (n) g.beginEnter(n);
  return { planes: planes.length, helis: helis.length, near: n && n.type, hangar: planes.some(p => p.pos.z < 1922), rotors: !!v.rotors, sleep: v.sleep };
});
await frames(page, 70);
const air1 = await st();
check('the airport’s aircraft: three aeroplanes (one in a hangar) and two helicopters; you walk up to one, get in and the engine starts', air0.planes === 3 && air0.helis === 2 && air0.hangar && air0.near === 'skylark' && air0.rotors && !air1.dead && air1.on > 0.5 && air1.gnd, JSON.stringify([air0, air1]));
const noExit = await ev(() => { const g = window.game, v = g.player.vehicle; v.pos.set(-120, 3.2, 2410); v.h = Math.PI / 2; v.vel.set(0, 0); v.air.grounded = true; return true; });
await frames(page, 30);
const roll = await hold(['up'], s => !s.gnd), rollX = roll.x;
const climb = await hold(['up', 'jump'], s => s.y > 90);
const exitAir = await ev(() => { const g = window.game; g.exitVehicle(false); return g.player.state; });
check('it needs a take-off run (over 60 m of runway), lifts off above its stall speed and climbs; you cannot step out in the air', roll && !roll.dead && rollX > -60 && roll.spd > 25 && climb.y > 90 && climb.vy > 2 && climb.hp === 100 && exitAir === 'vehicle' && noExit, JSON.stringify([roll, climb, exitAir]));
const level = await hold(['up'], s => s.x > 1500, 500);
const turn = await hold(['up', 'left'], s => s.h > 4.55 && s.h < 4.9);
check('level flight holds its height hands-off; a banked turn brings it round onto the opposite heading', !turn.dead && Math.abs(level.y - climb.y) < 45 && Math.abs(turn.bank) > 0.5 && turn.h > 4.5 && turn.y > 50, JSON.stringify([level, turn]));
await hold(['up'], s => s.x < -650, 700);
await hold(['left'], s => s.h > 1.45 && s.h < 1.7);
await ev(() => { const v = window.game.player.vehicle; v.pos.z = 2410; v.h = Math.PI / 2; });
const fin = await hold(['down', 'walk'], s => s.agl < 9 || s.gnd, 700);
const touch = await hold(['down'], s => s.gnd, 500);
const stop = await hold(['down'], s => s.spd < 0.6, 700);
const out = await ev(() => { const g = window.game, v = g.player.vehicle; window.__keys = new Set(); g.exitVehicle(false); return { state: g.player.state, hp: v ? Math.round(v.health) : -1, rw: v ? Math.abs(v.pos.z - 2410) < 40 : false }; });
check('throttle back, a shallow descent and it lands on the runway on its wheels, brakes to a stop and you step out', !stop.dead && touch.gnd && stop.spd < 0.6 && out.state === 'foot' && out.hp > 55, JSON.stringify([fin, touch, stop, out]));
// ---------------------------------------------------------------- flight: the helicopter on the hospital's roof
const roof = await ev(() => { const g = window.game, L = g.world.isle.lifts.find(l => /Alda/.test(l.name)); g.resetPlayerState(L.a.x, L.a.z, 0); g.fleet.live.clear(); g.fleet.update(L.a.x, L.a.z); const a = g.liftAction(); return { lifts: g.world.isle.lifts.length, label: a && a.label, roofY: L.b.y }; });
await ev(() => window.game.liftAction().act()); await frames(page, 60);
const up = await ev(() => { const g = window.game, p = g.player, v = g.vehicles.list.find(v => v.type === 'medevac'), pol = g.world.isle.fleet.find(f => f.id === 'roof_police'); const r = { py: +p.pos.y.toFixed(1), heliY: +v.pos.y.toFixed(1), down: (g.liftAction() || {}).label, polSite: !!pol }; p.pos.set(v.pos.x + 1.9, v.pos.y, v.pos.z + 0.4); const n = g.nearestVehicle(1.8); r.near = n && n.type; if (n) g.beginEnter(n); window.__hx = v.pos.x; window.__hz = v.pos.z; return r; });
await frames(page, 70);
check('both roofs have a lift from the street; on the hospital’s roof stands the air ambulance, and you get in', roof.lifts === 2 && /Lift up/.test(roof.label || '') && Math.abs(up.py - roof.roofY) < 0.3 && Math.abs(up.heliY - roof.roofY) < 0.3 && /Lift down/.test(up.down || '') && up.near === 'medevac' && up.polSite, JSON.stringify([roof, up]));
const spool = await hold(['jump'], s => s.agl > 30, 700);
const drift = await ev(() => { const v = window.game.player.vehicle; return +Math.hypot(v.pos.x - window.__hx, v.pos.z - window.__hz).toFixed(1); });
check('the rotor spools up and it lifts straight off the roof (no run: it has moved under 3 m across the ground 30 m up)', !spool.dead && spool.agl > 30 && drift < 3, JSON.stringify([spool, drift]));
const fwd = await hold(['up'], s => s.spd > 28, 500);
const hover = await hold(['down'], s => s.spd < 1.5, 500);
const hov2 = await hold([], () => false, 60);
check('nose down it flies forward, pulled back it stops, hands off it hovers where it is', fwd.spd > 28 && hover.spd < 1.5 && Math.abs(hov2.y - hover.y) < 1.5 && hov2.spd < 1.5 && hov2.hp === 100, JSON.stringify([fwd, hover, hov2]));
const down = await hold(['walk'], s => s.gnd, 1200);
const hout = await ev(() => { const g = window.game, v = g.player.vehicle; window.__keys = new Set(); g.exitVehicle(false); return { state: g.player.state, hp: v ? Math.round(v.health) : -1 }; });
check('and sets down wherever there is room (a street, a roof), in one piece; you step out', !down.dead && down.gnd && hout.state === 'foot' && hout.hp > 60, JSON.stringify([down, hout]));
// ---------------------------------------------------------------- traffic on the island, the map, a save
await ev(() => { const g = window.game; g.resetPlayerState(700, 1560, 0); g.traffic.enabled = true; });
await frames(page, 400);
const traf = await ev(() => { const g = window.game, { offCity } = window.__pv; return g.traffic.cars.filter(v => offCity(v.pos.x, v.pos.z)).length; });
check('traffic drives the island’s highways', traf >= 1, String(traf));
const map = await ev(() => {
  const g = window.game, ui = g.ui; ui.toggleMap(true); const bm = ui.bigmap || g.bigmap || ui.map; const o = { x0: ui.mapX0, z0: ui.mapZ0, w: ui.mapW, h: ui.mapH, img: !!ui.isleImg && ui.isleImg.width > 300, labels: ui.mmImg.labels.filter(L => /MOUNT VALEN|PORT VALEN INTERNATIONAL|SALTMARSH|LAKE VALEN/.test(L.t)).length, labelsWant: window.__pv.CityLayout.at(-520, 1090) ? 3 : 4 }; // (Saltmarsh's label is not drawn where a precinct of the city stands on it)
  const [mx, mz] = ui._mapXY(-2000, -3000); o.neg = mx < 0 && mz < 0; ui.toggleMap(false); return o;
});
check('the map covers the whole island: map space runs north and west of the city, the island’s image and its labels are on it', map.x0 < -2000 && map.z0 < -3000 && map.w > 2900 && map.h > 2900 && map.img && map.labels === map.labelsWant && map.neg, JSON.stringify(map));
await ev(() => { const g = window.game; g.resetPlayerState(395, -1815, 0); g.saveGame(true); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
await page.click('#btnContinue', { timeout: 120000 });
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000, polling: 100 }); await frames(page, 5);
const back = await ev(() => { const p = window.game.player.pos; return { x: Math.round(p.x), z: Math.round(p.z), y: Math.round(p.y) }; });
check('a save on Mount Valen’s summit comes back on Mount Valen’s summit', Math.abs(back.x - 395) < 6 && Math.abs(back.z + 1815) < 6 && back.y > 235, JSON.stringify(back));
await ev(() => { const g = window.game; g.save.pos = { x: -400, z: 450, h: 0 }; g.startPlay(false); });
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000, polling: 100 }); await frames(page, 5);
const ashore = await ev(() => { const p = window.game.player.pos, I = window.__pv.Island, off = window.__pv.offCity(p.x, p.z); return { x: Math.round(p.x), z: Math.round(p.z), dry: !off || I.land(p.x, p.z) }; });
check('a save out in the bay comes back ashore', ashore.dry, JSON.stringify(ashore));
check('no console errors (desktop)', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 600));
// ---------------------------------------------------------------- a touch phone in landscape
{
  // (the desktop page is closed first: two pages of this size at once on software GL can run past the 30 s navigation limit)
  await first.ctx.close();
  const P = await open(b, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await startNew(P.page);
  const m = await P.page.evaluate(() => {
    const g = window.game; g.police.enabled = false; g.quality.setMode(1); g.resetPlayerState(290, 1998, 0); g.fleet.update(290, 1998); for (let k = 0; k < 40; k++) g.isleScene.update(290, 1998);
    const v = g.vehicles.list.find(v => v.type === 'heli'); g.player.pos.set(v.pos.x + 1.9, v.pos.y, v.pos.z + 0.4); g.beginEnter(g.nearestVehicle(1.8));
    return { touch: !document.getElementById('touch').classList.contains('hidden'), tiles: g.isleScene.tiles.size, level: g.quality.level };
  });
  await frames(P.page, 80);
  const m2 = await P.page.evaluate(() => { const g = window.game, i = g.renderer.info.render; return { state: g.player.state, gas: document.querySelector('#touch .tbtn[data-act="gas"]').textContent, brake: document.querySelector('#touch .tbtn[data-act="brake"]').textContent, alt: document.getElementById('gear').textContent, tris: i.triangles, calls: i.calls, speedo: !document.getElementById('speedo').classList.contains('hidden') }; });
  check('a phone in landscape: touch controls up, the near ground within budget, and in a helicopter Gas and Brake read Up and Down, the speedometer shows height', m.touch && m.tiles <= 16 && m2.state === 'vehicle' && m2.gas === 'Up' && m2.brake === 'Down' && /GND|m/.test(m2.alt) && m2.speedo && m2.tris < 700000, JSON.stringify([m, m2]));
  check('no console errors (phone)', P.errors.length === 0, P.errors.slice(0, 3).join(' | ').slice(0, 600));
  await P.ctx.close();
}
await finish(b, 'island');
