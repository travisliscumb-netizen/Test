/* Placement (world audit, 2026-11-17): everything in the world stands where it should and faces the way it should.
   Nothing solid stands on what you drive on (lattice streets, island roads, the Valen Point circuit and pit lane, the
   runways); stop signs stand off the road; every traffic light's arm reaches over its road; every street lamp leans
   over its road; sidewalk and park benches face the street or walk they sit on; no prop is buried inside a building;
   island buildings stand on the ground or on the building under them, never in the air; the parked fleet stands
   level, off the roads and out of the sea; the fire station stands at the level of the highway at its doors. */
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
  const T = w.vp && w.vp.track, VPP = P.VP_PIT;
  const pitLane = (x, z) => x > VPP.laneX - VPP.laneW / 2 && x < VPP.laneX + VPP.laneW / 2 && z > VPP.lane[0] && z < VPP.lane[1];
  const circuit = (x, z) => { if (!T || Math.hypot(x - 1880, z - 480) > 900) return false; for (let k = 0; k < T.pts.length - 1; k++) if (segD(x, z, T.pts[k], T.pts[k + 1]) < 6.5) return true; return false; };
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
  // the fire station stands at the level of the Coast Highway passing its doors (the bays open onto it)
  const fs = w.xblocks.find(bk => bk.place && bk.place.id === 'firehouse'), hw = I.roads.find(R => R.id === 'n1e');
  if (fs && hw) { const d = fs.place.door; let best = 1e9, hy = null; hw.pts.forEach((p, k) => { const e = Math.hypot(p[0] - d.x, p[1] - d.z); if (e < best) { best = e; hy = hw.y[k]; } }); out.fire = { floor: fs.bld[0].y0, road: +hy.toFixed(2), dist: +best.toFixed(1) }; }
  return out;
});
check('nothing solid stands on a street, an island road, the circuit, the pit lane or a runway', r.solid.n === 0, JSON.stringify(r.solid));
check('the Valen Point pit lane is clear from the garages to the pit wall', r.pit.track && r.pit.n === 0, JSON.stringify(r.pit));
check('every stop sign stands off the road', r.stop.n >= 20 && r.stop.on === 0, JSON.stringify(r.stop));
check('every traffic light stands off the road with its arm over it', r.tlight.n >= 200 && r.tlight.bad === 0, JSON.stringify(r.tlight));
check('every street lamp stands off the road and leans over it', r.lamp.n >= 1000 && r.lamp.bad === 0, JSON.stringify(r.lamp));
check('every bench faces the street or walk it sits on, and its seat faces the same way', r.bench.n >= 150 && r.bench.back === 0 && r.bench.seatOff === 0, JSON.stringify(r.bench));
check('no prop buried inside a building', r.buried.n === 0, JSON.stringify(r.buried));
check('no island building stands in the air', r.float.n === 0, JSON.stringify(r.float));
check('the parked fleet stands level, off the roads, out of buildings and out of the sea', r.slots.n >= 250 && !r.slots.steep.length && !r.slots.road.length && !r.slots.sea.length && !r.slots.bld.length, JSON.stringify({ n: r.slots.n, steep: r.slots.steep, road: r.slots.road, sea: r.slots.sea, bld: r.slots.bld }));
check('the fire station stands level with the Coast Highway at its doors', !!r.fire && Math.abs(r.fire.floor - r.fire.road) < 1.5 && r.fire.dist < 40, JSON.stringify(r.fire));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'placement');
