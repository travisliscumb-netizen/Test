/* Placement (world audit, 2026-11-17): everything in the world stands where it should and faces the way it should.
   Nothing solid stands on what you drive on (lattice streets, island roads, the Southshore circuits and pit lane, the
   runways); stop signs stand off the road; every traffic light's arm reaches over its road; every street lamp leans
   over its road; sidewalk and park benches face the street or walk they sit on; no prop is buried inside a building;
   island buildings stand on the ground or on the building under them, never in the air; the parked fleet stands
   level, off the roads and out of the sea; the fire station stands at the level of the highway at its doors; the turning circles stand level; Villa Valen's
   gate meets Ridgeview Drive's circle; every island house car has a drive to its road; the city's drive mouths are clear. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

const r = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, I = P.Island, out = {};
  const blocks = [...w.blocks, ...w.xblocks];
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  // the island roads on a grid, for speed
  const G = 24, grid = new Map();
  I.roads.forEach((R, ri) => { for (let k = 0; k < R.pts.length - 1; k++) { const a = R.pts[k], c = R.pts[k + 1]; for (let i = Math.floor(Math.min(a[0], c[0]) / G); i <= Math.floor(Math.max(a[0], c[0]) / G); i++) for (let j = Math.floor(Math.min(a[1], c[1]) / G); j <= Math.floor(Math.max(a[1], c[1]) / G); j++) { const kk = i * 100003 + j; if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(ri, k); } } });
  const isleRoad = (x, z, m = 0) => { const L = grid.get(Math.floor(x / G) * 100003 + Math.floor(z / G)); if (!L) return null; for (let q = 0; q < L.length; q += 2) { const R = I.roads[L[q]]; if (segD(x, z, R.pts[L[q + 1]], R.pts[L[q + 1] + 1]) < R.w / 2 - m) return R.id; } return null; };
  // the two Southshore tracks (Valen Point's circuit closed, 2026-11-18): the road course with its pit lane, and the oval
  const T = w.sr && w.sr.track, SP = P.SR.pit, OT = w.cfs && w.cfs.track;
  const pitLane = (x, z) => x > SP.x0 && x < SP.x1 && Math.abs(z - SP.z) < SP.w / 2;
  const onLoop = (L, cx, cz, r, half, x, z) => { if (!L || Math.hypot(x - cx, z - cz) > r) return false; for (let k = 0; k < L.pts.length - 1; k++) if (segD(x, z, L.pts[k], L.pts[k + 1]) < half) return true; return false; };
  const circuit = (x, z) => onLoop(T, -620, 2100, 700, P.SR.w / 2, x, z) || onLoop(OT, 350, 1315, 450, P.OVAL.half, x, z);
  const A = P.AIRPORT, F = w.isle.field;
  const runway = (x, z) => A.rw.some(q => x > q.x0 && x < q.x1 && Math.abs(z - q.z) < q.w / 2) || (F && x > F.rw.x0 && x < F.rw.x1 && Math.abs(z - F.rw.z) < F.rw.w / 2);
  // what you drive on (the local lanes' raster is left out: a park's boulders and a car park's walls stand at its edges on purpose)
  const drive = (x, z) => (P.isOnRoad(x, z) && 'street') || (isleRoad(x, z, 0.3) && 'island road') || (T && pitLane(x, z) && 'pit lane') || (circuit(x, z) && 'circuit') || (runway(x, z) && 'runway') || false;
  const solid = [];
  for (const bk of blocks) {
    for (const p of bk.props) if (p.col && drive(p.x, p.z)) solid.push([p.type, drive(p.x, p.z), Math.round(p.x), Math.round(p.z)]);
    for (const d of bk.det) { const c = d.col; if (!c || c.y1 - c.y0 < 0.4) continue; const x = c.x !== undefined ? c.x : (c.x0 + c.x1) / 2, z = c.z !== undefined ? c.z : (c.z0 + c.z1) / 2, s = drive(x, z); if (s) solid.push([d.kind, s, Math.round(x), Math.round(z), bk.name || bk.i]); }
    for (const q of bk.bld) { if (q.hollow) continue; const x = (q.x0 + q.x1) / 2, z = (q.z0 + q.z1) / 2, s = drive(x, z); if (s) solid.push(['building', s, Math.round(x), Math.round(z), bk.name || bk.i]); }
  }
  out.solid = { n: solid.length, eg: solid.slice(0, 8) };
  // the pit lane on its own: nothing standing in it from the garages to the pit wall
  const pit = []; if (T) for (const bk of blocks) for (const d of bk.det) { const c = d.col; if (!c || c.y1 - c.y0 < 0.25) continue; const x = c.x !== undefined ? c.x : (c.x0 + c.x1) / 2, z = c.z !== undefined ? c.z : (c.z0 + c.z1) / 2; if (pitLane(x, z)) pit.push([d.kind, Math.round(x), Math.round(z)]); }
  out.pit = { track: !!T, n: pit.length, eg: pit.slice(0, 6) };
  const road = (x, z) => P.isOnRoad(x, z) || P.localRoadAt(x, z);
  const turn = (ry, fx, fz) => [fx * Math.cos(ry) + fz * Math.sin(ry), -fx * Math.sin(ry) + fz * Math.cos(ry)];
  // stop signs: the red octagons, their posts off every road
  const st = []; for (const bk of blocks) for (const d of bk.det) if (d.kind === 'cyl8' && d.color.getHex() === 0xc8102e) st.push({ x: d.x, z: d.z });
  const stOn = st.filter(s => road(s.x, s.z) || isleRoad(s.x, s.z)).map(s => [Math.round(s.x), Math.round(s.z)]);
  out.stop = { n: st.length, on: stOn.length, eg: stOn.slice(0, 6) };
  // traffic lights: the pole off the road, the arm's tip (3.6 m along local -x) over it
  const tl = w.propTypes.tlight || []; const tlBad = [];
  for (const p of tl) { const [dx, dz] = turn(p.ry, -1, 0); if (road(p.x, p.z) || !road(p.x + dx * 3.6, p.z + dz * 3.6)) tlBad.push([Math.round(p.x), Math.round(p.z), +p.ry.toFixed(2)]); }
  out.tlight = { n: tl.length, bad: tlBad.length, eg: tlBad.slice(0, 6) };
  // street lamps: the pole off the road, the arm (local +z) reaching toward it within 4 m
  const lp = w.propTypes.lamp || []; const lpBad = [];
  for (const p of lp) { const [dx, dz] = turn(p.ry, 0, 1); let ok = false; for (let s = 1; s <= 4 && !ok; s += 0.5) ok = road(p.x + dx * s, p.z + dz * s); if (road(p.x, p.z) || !ok) lpBad.push([Math.round(p.x), Math.round(p.z), +p.ry.toFixed(2)]); }
  out.lamp = { n: lp.length, bad: lpBad.length, eg: lpBad.slice(0, 6) };
  // benches: none with a street or a walk closer behind it than in front of it (within 4 m)
  const be = []; let nb = 0;
  for (const bk of blocks) for (const p of bk.props) { if (p.type !== 'bench') continue; nb++;
    const fx = Math.sin(p.ry), fz = Math.cos(p.ry); let front = Infinity, back = Infinity;
    for (let s = 0.5; s <= 4; s += 0.5) { if (front === Infinity && road(p.x + fx * s, p.z + fz * s)) front = s; if (back === Infinity && road(p.x - fx * s, p.z - fz * s)) back = s; }
    if (back < front) be.push([bk.name, Math.round(p.x), Math.round(p.z), +p.ry.toFixed(2)]); }
  // and every bench's seat (where a pedestrian sits) faces the way the bench does
  let seatOff = 0; for (const bk of blocks) for (const p of bk.props) if (p.type === 'bench') { const s = (bk.seats || []).find(q => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.z - p.z) < 0.01); if (s && Math.abs(Math.atan2(Math.sin(s.ry - p.ry), Math.cos(s.ry - p.ry))) > 0.01) seatOff++; }
  out.bench = { n: nb, back: be.length, seatOff, eg: be.slice(0, 6) };
  // props inside a building's walls
  const inB = []; for (const bk of blocks) for (const p of bk.props) for (const q of bk.bld) if (!q.hollow && p.x > q.x0 + 0.2 && p.x < q.x1 - 0.2 && p.z > q.z0 + 0.2 && p.z < q.z1 - 0.2 && (q.y0 || 0) < (bk.ground || 0) + 1) { inB.push([p.type, Math.round(p.x), Math.round(p.z), bk.name || bk.i]); break; }
  out.buried = { n: inB.length, eg: inB.slice(0, 6) };
  // island buildings: on the ground, or on the top of the building under them (a cab on its tower, a floor over garages)
  const fl = [];
  for (const bk of w.xblocks) for (const q of bk.bld) { if (q.y0 === undefined || q.hollow || q.tierOf) continue;
    const pts = [[q.x0 + 0.6, q.z0 + 0.6], [q.x1 - 0.6, q.z0 + 0.6], [q.x0 + 0.6, q.z1 - 0.6], [q.x1 - 0.6, q.z1 - 0.6], [(q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2]];
    let gap = 0; for (const [x, z] of pts) gap = Math.max(gap, q.y0 - P.groundY(x, z, q.y0 - 0.5));
    if (gap <= 0.8) continue;
    const held = bk.bld.some(o => o !== q && Math.abs((o.y0 || 0) + o.h - q.y0) < 0.8 && Math.min(o.x1, q.x1) > Math.max(o.x0, q.x0) && Math.min(o.z1, q.z1) > Math.max(o.z0, q.z0));
    if (!held) fl.push([bk.name, Math.round(q.x0), Math.round(q.z0), q.y0, +gap.toFixed(1)]); }
  out.float = { n: fl.length, eg: fl.slice(0, 6) };
  // the parked fleet: level, off the roads (outside the venues), out of the buildings and the sea
  const sl = { n: 0, steep: [], road: [], sea: [], bld: [] };
  for (const site of w.isle.fleet) for (const s of site.slots || []) { sl.n++;
    const x = s.x, z = s.z, h = P.groundY(x, z, (s.y || 0) + 1), tag = [site.id, s.cls || '', Math.round(x), Math.round(z)];
    const slope = Math.max(Math.abs(P.groundY(x + 2, z, h + 1) - P.groundY(x - 2, z, h + 1)), Math.abs(P.groundY(x, z + 2, h + 1) - P.groundY(x, z - 2, h + 1))) / 4;
    if (slope > 0.18 || (s.y !== undefined && Math.abs(s.y - h) > 0.8)) sl.steep.push(tag);
    if (isleRoad(x, z, 0.5) && !/^(ap_|field_|vp|cfs|pits|paddock|grid|proving)/.test(site.id)) sl.road.push(tag);
    if (h < P.SEA_Y - 0.3) sl.sea.push(tag);
    // (a hangar holds its aircraft: the airport's and the airfield's)
    if (!/^(ap_|field_)/.test(site.id)) for (const bk of w.xblocks) if (bk.bld.some(q => !q.hollow && x > q.x0 + 0.3 && x < q.x1 - 0.3 && z > q.z0 + 0.3 && z < q.z1 - 0.3 && (q.y0 || 0) < h + 1.5)) { sl.bld.push(tag.concat(bk.name)); break; }
  }
  out.slots = sl;
  // the island's road lamps (178): the post off every road, the head over its own road's carriageway, on the ground
  const RL = w.roadLamps || [], rlBad = [];
  for (const l of RL) {
    const R = I.roads.find(q => q.id === l.road); let dh = 1e9; for (let k = 0; k < R.pts.length - 1; k++) dh = Math.min(dh, segD(l.hx, l.hz, R.pts[k], R.pts[k + 1]));
    const gy = P.groundY(l.x, l.z, l.y + 1);
    if (isleRoad(l.x, l.z) || P.isOnRoad(l.x, l.z) || dh > R.w / 2 + 0.3 || Math.abs(gy - l.y) > 0.6) rlBad.push([l.road, Math.round(l.x), Math.round(l.z), isleRoad(l.x, l.z) || '', +dh.toFixed(1), +(gy - l.y).toFixed(1)]);
  }
  const rlIn = RL.filter(l => w.xblocks.some(bk => bk.bld.some(q => !q.hollow && l.x > q.x0 && l.x < q.x1 && l.z > q.z0 && l.z < q.z1))).length;
  out.roadLamps = { n: RL.length, pools: (w.lampPools || []).length, bad: rlBad.length, inBld: rlIn, eg: rlBad.slice(0, 6) };
  // the turning circles (022): the ground under every one is level with it, across its asphalt
  const rings = [];
  for (const R of I.roads) { if (!R.ring) continue; const g2 = R.ring, rr = g2.r + R.w / 2, y = R.y[R.y.length - 1]; let dev = 0;
    for (let k = 0; k < 24; k++) for (const f of [0, 0.5, 0.95]) { const a = k / 24 * Math.PI * 2; dev = Math.max(dev, Math.abs(P.groundY(g2.x + Math.cos(a) * rr * f, g2.z + Math.sin(a) * rr * f, y + 3) - y)); }
    if (dev > 0.1) rings.push([R.id, +dev.toFixed(2)]); }
  out.rings = { n: I.roads.filter(R => R.ring).length, bad: rings };
  // Villa Valen: Ridgeview Drive's circle before the gate, on the gate's axis and the estate's level, the way to the gate clear
  { const R = I.roads.find(q => q.id === 'h3'), g2 = R.ring, V = w.isle.villa, rr = g2.r + R.w / 2; let hit = null;
    for (let z = g2.z - rr + 0.5; z > -862; z -= 0.5) { const gy = P.groundY(-600, z, V.y + 2); if (w.grid.resolveCircle(-600, z, 1.0, gy + 0.3, gy + 1.5, {}).hit) { hit = Math.round(z); break; } }
    out.villaGate = { dx: +(g2.x + 600).toFixed(2), y: +R.y[R.y.length - 1].toFixed(2), estate: V.y, edge: +(g2.z - rr).toFixed(1), hit }; }
  // the island's houses (128): every parked car has a drive from it to its road, nothing solid in the way
  const dr = w.isle.drives || [], dBad = []; let dN = 0;
  for (const F of w.isle.fleet) { if (!/^dist/.test(F.id)) continue;
    for (const s2 of F.slots || []) { dN++; const d = dr.find(d => Math.hypot(d.ax - s2.x, d.az - s2.z) < 0.6); if (!d) { dBad.push([F.id, Math.round(s2.x), Math.round(s2.z), 'no drive']); continue; }
      // (exactly, over every road: the grid above indexes the cells a centre line crosses, not the carriageway's edge)
      if (!I.roads.some(R => R.pts.some((p, k) => k < R.pts.length - 1 && segD(d.bx, d.bz, p, R.pts[k + 1]) < R.w / 2 + 0.2))) dBad.push([F.id, Math.round(d.bx), Math.round(d.bz), 'ends off the road']);
      const L = Math.hypot(d.bx - d.ax, d.bz - d.az);
      for (let t = 2.6; t < L - 0.5; t += 0.5) { const x = d.ax + (d.bx - d.ax) * t / L, z = d.az + (d.bz - d.az) * t / L, gy = P.groundY(x, z, s2.y + 3); if (w.grid.resolveCircle(x, z, 1.0, gy + 0.3, gy + 1.5, {}).hit) { dBad.push([F.id, Math.round(x), Math.round(z), 'blocked']); break; } } } }
  out.isleDrives = { n: dN, bad: dBad.length, eg: dBad.slice(0, 6) };
  // the city's home drives (121): the pavement between each and its street clear of poles, lamps and trees
  const mBad = []; let mN = 0;
  for (const bk of w.blocks) for (const r of bk.drives || []) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2; let m = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = 0.3; t < 9; t += 0.3) if (road(cx + dx * (hx + t), cz + dz * (hz + t))) { if (!m || t < m.t) m = { dx, dz, t }; break; }
    mN++; if (!m) { mBad.push([bk.name, Math.round(cx), Math.round(cz), 'no street']); continue; }
    const half = Math.min(m.dx ? hz : hx, 1.6);
    for (let t = 0.2; t < m.t; t += 0.4) for (const o of [-half + 0.5, 0, half - 0.5]) { const x = cx + m.dx * (hx + t) + (m.dz ? o : 0), z = cz + m.dz * (hz + t) + (m.dx ? o : 0); const p = bk.props.find(p => p.col && Math.hypot(p.x - x, p.z - z) < 1.0); if (p) { mBad.push([bk.name, Math.round(cx), Math.round(cz), p.type]); t = 1e9; break; } } }
  out.mouths = { n: mN, bad: mBad.length, eg: mBad.slice(0, 6) };
  // the fire station stands at the level of the Coast Highway passing its doors (the bays open onto it)
  const fs = w.xblocks.find(bk => bk.place && bk.place.id === 'firehouse'), hw = I.roads.find(R => R.id === 'n1e');
  if (fs && hw) { const d = fs.place.door; let best = 1e9, hy = null; hw.pts.forEach((p, k) => { const e = Math.hypot(p[0] - d.x, p[1] - d.z); if (e < best) { best = e; hy = hw.y[k]; } }); out.fire = { floor: fs.bld[0].y0, road: +hy.toFixed(2), dist: +best.toFixed(1) }; }
  return out;
});
check('nothing solid stands on a street, an island road, the circuit, the pit lane or a runway', r.solid.n === 0, JSON.stringify(r.solid));
check('the Southshore Raceway pit lane is clear from the garages to the pit wall', r.pit.track && r.pit.n === 0, JSON.stringify(r.pit));
check('every stop sign stands off the road', r.stop.n >= 20 && r.stop.on === 0, JSON.stringify(r.stop));
check('every traffic light stands off the road with its arm over it', r.tlight.n >= 200 && r.tlight.bad === 0, JSON.stringify(r.tlight));
check('every street lamp stands off the road and leans over it', r.lamp.n >= 1000 && r.lamp.bad === 0, JSON.stringify(r.lamp));
check('every bench faces the street or walk it sits on, and its seat faces the same way', r.bench.n >= 150 && r.bench.back === 0 && r.bench.seatOff === 0, JSON.stringify(r.bench));
check('no prop buried inside a building', r.buried.n === 0, JSON.stringify(r.buried));
check('no island building stands in the air', r.float.n === 0, JSON.stringify(r.float));
check('the parked fleet stands level, off the roads, out of buildings and out of the sea', r.slots.n >= 250 && !r.slots.steep.length && !r.slots.road.length && !r.slots.sea.length && !r.slots.bld.length, JSON.stringify({ n: r.slots.n, steep: r.slots.steep, road: r.slots.road, sea: r.slots.sea, bld: r.slots.bld }));
check('the island highways have their lamps: each post off the road, its head over its own carriageway, on the ground, none in a building; a pool under every island lamp', r.roadLamps.n >= 300 && r.roadLamps.bad === 0 && r.roadLamps.inBld === 0 && r.roadLamps.pools >= r.roadLamps.n, JSON.stringify(r.roadLamps));
check('every turning circle stands level on its ground (none half under the grass or in the air)', r.rings.n >= 10 && r.rings.bad.length === 0, JSON.stringify(r.rings));
check('Villa Valen: Ridgeview Drive ends in a turning circle at the gate, on its axis and the estate’s level, the way through the gate clear', Math.abs(r.villaGate.dx) < 1.5 && Math.abs(r.villaGate.y - r.villaGate.estate) < 0.3 && r.villaGate.edge > -851 && r.villaGate.edge < -844 && r.villaGate.hit === null, JSON.stringify(r.villaGate));
check('every car parked at an island house has a drive to its road, nothing in the way', r.isleDrives.n >= 150 && r.isleDrives.bad === 0, JSON.stringify(r.isleDrives));
check('every city home drive meets its street with the pavement between clear (no pole, lamp or tree in the mouth)', r.mouths.n >= 60 && r.mouths.bad === 0, JSON.stringify(r.mouths));
check('the fire station stands level with the Coast Highway at its doors', !!r.fire && Math.abs(r.fire.floor - r.fire.road) < 1.5 && r.fire.dist < 40, JSON.stringify(r.fire));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'placement');
