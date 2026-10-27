/* The road network after the Curved Roads pass: one road graph (135) of every drivable road, the lattice and the curved
   streets alike. Junctions come from the geometry (skewed T-junctions, a Y, crossings of lattice streets, link-to-link
   joins); the GPS, traffic, AI drivers (police, taxis, vans), the maps, parking, saves and races all follow the same
   curves. New streets: Saltmarsh Way (a diagonal and a sweeping curve across 3rd Ave) and Kiln Lane (a Y off it) in the
   Industrial Belt, Tanner's Row through the Old Quarter terraces, the Farm Track off Cedar Fields Road; the countryside's
   tracks are country roads that follow the hills. Everything is driven, placed and measured in the running game. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
const helpers = () => ev(() => {
  const g = window.game, P = window.__pv;
  g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.env.setWeather('clear', true); g.env.time = 11;
  window.__step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) g.update(dt, dt); };
  // how far (x, z) is outside the surface of the streets round it (negative: on one, by that much)
  window.__off = (x, z) => P.RoadGraph.surfaceDist(x, z, { kinds: P.RG_STREETS });
  window.__links = name => g.world.links.filter(L => L.name === name);
  // a physics car of the city's with an AI driver, at (x, z) facing h
  window.__aiCar = (type, x, z, h, mode) => { const v = g.vehicles.spawn(type, x, z, h, { driver: mode === 'pursue' ? 'cop' : 'npc' }); v.mission = 'test'; v.touched = true; v.drive = new P.DriveAI(v, g, mode); return v; };
});
await helpers();

// ---------------------------------------------------------------- 1. the graph: the grid as it was, junctions from geometry
const G = await ev(() => {
  const g = window.game, P = window.__pv, R = P.RoadGraph, out = {};
  out.n = [R.nodes.length, R.edges.length];
  let bad = 0, open = 0;
  for (const es of R.segEdges.values()) { const L = es.reduce((s, e) => s + e.len, 0); if (Math.abs(L - 80) > 1e-6 || es.some(e => e.pts.length !== 2 || e.kind !== 'grid')) bad++; }
  for (const a of [0, 1]) for (let line = 0; line <= 12; line++) for (let seg = 0; seg < 12; seg++) if (P.RoadNet.segOpen(a, line, seg)) open++;
  out.grid = { segs: R.segEdges.size, open, bad, closed: P.RoadNet.closed.size, bfs: P.RoadNet.path(0, 0, 12, 12).length };
  const seen = new Set([0]), q = [R.nodes[0]];
  while (q.length) { const n = q.pop(); for (const { e } of n.edges) for (const m of [e.a, e.b]) if (!seen.has(m.id)) { seen.add(m.id); q.push(m); } }
  out.reach = seen.size / R.nodes.length;
  const outT = inc => inc.end === 0 ? inc.e.t0 : [-inc.e.t1[0], -inc.e.t1[1]];
  // the angle a road makes with a lattice street where it leaves it (90: square on), measured past the kerb stub
  const leave = (n, inc) => { const e = inc.e, out2 = inc.end === 0, a = R.pointAt(e, out2 ? 9 : e.len - 9), c = R.pointAt(e, out2 ? 13 : e.len - 13), u = [c[0] - a[0], c[1] - a[1]], l = Math.hypot(u[0], u[1]), ax = n.att.axis === 0 ? [0, 1] : [1, 0]; return Math.acos(Math.min(1, Math.abs(u[0] * ax[0] + u[1] * ax[1]) / l)) * 180 / Math.PI; };
  out.tees = []; out.cross = [];
  for (const n of R.nodes) if (n.att) {
    const ls = n.edges.filter(x => x.e.kind !== 'grid');
    for (const x of ls) out.tees.push({ name: x.e.name, ang: +leave(n, x).toFixed(1) });
    if (ls.length >= 2) out.cross.push(ls.map(x => x.e.name).join(' / '));
  }
  out.y = [];
  for (const n of R.nodes) if (!n.att && !n.lat && n.edges.length >= 3) {
    const minor = n.edges.find(x => x.e.link && x.e.link.ends.some(e => e.onLink && Math.hypot(e.C.x - n.x, e.C.z - n.z) < 0.8)); if (!minor) continue;
    const u = outT(minor), others = n.edges.filter(x => x !== minor);
    out.y.push({ minor: minor.e.name, main: others[0].e.name, ang: +Math.min(...others.map(o => { const v = outT(o); return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI; })).toFixed(1) });
  }
  const sw = window.__links('Saltmarsh Way'), A = sw.find(L => L.pts[0][0] < 810), B = sw.find(L => L !== A), hd = (a, c) => Math.atan2(c[0] - a[0], c[1] - a[1]);
  out.diag = +(hd(A.pts[0], A.pts[A.pts.length - 1]) * 180 / Math.PI).toFixed(1);
  out.straight = A.pts.every(p => Math.abs((p[0] - A.pts[0][0]) * Math.cos(hd(A.pts[0], A.pts[A.pts.length - 1])) - (p[1] - A.pts[0][1]) * Math.sin(hd(A.pts[0], A.pts[A.pts.length - 1]))) < 1e-6);
  out.trans = +(Math.abs(hd(A.pts[A.pts.length - 2], A.pts[A.pts.length - 1]) - hd(B.pts[0], B.pts[1])) * 180 / Math.PI).toFixed(2);
  // each new street's shape: its tightest turn between samples and its tightest radius (clear of the junction stubs)
  out.shapes = [];
  for (const nm of ['Saltmarsh Way', 'Kiln Lane', 'Tanner’s Row', 'Farm Track']) for (const L of window.__links(nm)) {
    let turn = 0; for (let k = 1; k < L.pts.length - 1; k++) { let d = Math.abs(hd(L.pts[k], L.pts[k + 1]) - hd(L.pts[k - 1], L.pts[k])); if (d > Math.PI) d = 2 * Math.PI - d; turn = Math.max(turn, d); }
    let minR = Infinity; for (const e of R.edges) if (e.link === L) for (let k = 0; k < e.pts.length; k++) if (e.cum[k] > 9 && e.cum[k] < e.len - 9) minR = Math.min(minR, e.rad[k]);
    out.shapes.push({ nm, len: Math.round(L.len), turn: +(turn * 180 / Math.PI).toFixed(1), minR: isFinite(minR) ? Math.round(minR) : 'straight', ends: L.ends.map(e => e.onLink ? 'on ' + e.onLink : e.free ? 'free' : 'lattice') });
  }
  return out;
});
check('the grid is still the grid: every open lattice segment is in the graph, straight, 80 m end to end; closures and lattice paths unchanged', G.grid.bad === 0 && G.grid.segs === G.grid.open && G.grid.closed === 22 && G.grid.bfs === 25, JSON.stringify(G.grid));
check('one connected network: every junction reaches every other (the city, the curved streets, Valen Point, Cedar Fields South)', G.reach === 1, JSON.stringify({ reach: G.reach, n: G.n }));
const skew = G.tees.filter(x => x.ang < 75);
check('T-junctions at any angle: at least three new streets leave the grid well off square (under 75°), none sharper than 30°', skew.length >= 3 && G.tees.every(x => x.ang >= 30), JSON.stringify(G.tees));
check('a Y-junction: Kiln Lane forks off Saltmarsh Way at a shallow angle (15–40°)', G.y.some(y => y.minor === 'Kiln Lane' && y.main === 'Saltmarsh Way' && y.ang >= 15 && y.ang <= 40), JSON.stringify(G.y));
check('a link-to-link T: the Farm Track meets Cedar Fields Road part way along it', G.y.some(y => y.minor === 'Farm Track' && y.main === 'Cedar Fields Road'), JSON.stringify(G.y));
check('crossings: Saltmarsh Way and Tanner’s Row cross lattice streets, and the Farm Track meets the bridge track across the perimeter road (four roads at one point)', ['Saltmarsh Way / Saltmarsh Way', 'Tanner’s Row / Tanner’s Row'].every(c => G.cross.includes(c)) && G.cross.some(c => /Farm Track/.test(c) && /Cedar Fields Track/.test(c)), JSON.stringify(G.cross));
check('a diagonal: Saltmarsh Way leaves Juniper St in a straight line at about 40° to the grid', G.straight && Math.abs(G.diag - 39.5) < 1, JSON.stringify({ diag: G.diag, straight: G.straight }));
check('curves: every new street is smooth (no turn over 10° between samples) and its bends are 20 m or wider', G.shapes.every(s => s.turn < 10 && (s.minR === 'straight' || s.minR >= 20)), JSON.stringify(G.shapes));
check('a curve meets a straight: the diagonal runs into Saltmarsh Way’s curve across 3rd Ave without a kink (under 4°)', G.trans < 4, JSON.stringify(G.trans));

// ---------------------------------------------------------------- 2. no road through a building, and none through a lot
const lots = await ev(() => {
  const g = window.game, P = window.__pv, w = g.world, out = { hits: [], homes: 0, n: 0 };
  const tmp = [];
  for (const L of w.links) {
    if (L.spur) continue;
    const pts = L.pts;
    for (let k = 0; k < pts.length - 1; k++) for (let s = 0; s < 1; s += 0.25) {
      const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * s, z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * s, tx = pts[k + 1][0] - pts[k][0], tz = pts[k + 1][1] - pts[k][1], l = Math.hypot(tx, tz) || 1;
      for (const o of [-1, 0, 1]) {
        const px = x - tz / l * o * (L.w / 2 - 0.4), pz = z + tx / l * o * (L.w / 2 - 0.4); out.n++;
        for (const c of w.grid.query(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, tmp)) {
          if (c.kind === 'prop' || c.y1 < 0.6 || c.y0 > 2.5) continue;
          const inside = c.r !== undefined ? Math.hypot(px - c.x, pz - c.z) < c.r : px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1;
          if (inside && out.hits.length < 8) out.hits.push({ road: L.name, x: +px.toFixed(1), z: +pz.toFixed(1), kind: c.kind });
        }
        for (const h of w.homes) if (px > h.x0 && px < h.x1 && pz > h.z0 && pz < h.z1) out.homes++;
      }
    }
  }
  // what the estate blocks hold now, and what the terraces lost to Tanner's Row
  out.blocks = ['10,2', '10,3', '3,10', '4,10'].map(k => { const [x, z] = k.split(',').map(Number), bb = w.block(x, z); return { k, bld: bb.bld.length, kerbCars: bb.parked.filter(c => c.kerb).length }; });
  return out;
});
check('no street runs through a building, a wall, a fence, a container or a tank (every curved street, sampled across its width every ~0.6 m)', lots.hits.length === 0 && lots.n > 2000, JSON.stringify(lots.hits));
check('no street runs through a house or its lot', lots.homes === 0, String(lots.homes));
check('the estate is built round its new roads (warehouses, and cars parked along the kerbs); the terraces keep their rows', lots.blocks[0].bld >= 3 && lots.blocks[1].bld >= 3 && lots.blocks[0].kerbCars >= 3 && lots.blocks[2].bld >= 10 && lots.blocks[3].bld >= 10, JSON.stringify(lots.blocks));

// ---------------------------------------------------------------- 3. the kerb is cut where a curved road leaves a street
const cuts = await ev(() => {
  const g = window.game, P = window.__pv, out = { n: P.CurbCuts.n, list: [] };
  for (const c of P.CurbCuts.list) {
    const mid = (c.a0 + c.a1) / 2, pt = o => c.axis === 0 ? [c.line * 80 + c.side * o, c.seg * 80 + mid] : [c.seg * 80 + mid, c.line * 80 + c.side * o];
    let prev = null, maxStep = 0, mono = true;
    for (let o = 3; o <= 9; o += 0.05) { const [x, z] = pt(o), y = P.groundY(x, z); if (prev !== null) { maxStep = Math.max(maxStep, Math.abs(y - prev)); if (y < prev - 1e-6) mono = false; } prev = y; }
    // a control just beyond the cut: the kerb is still a kerb there
    const ctl = o => c.axis === 0 ? [c.line * 80 + c.side * o, c.seg * 80 + c.a1 + 3] : [c.seg * 80 + c.a1 + 3, c.line * 80 + c.side * o];
    const [k0x, k0z] = ctl(5.9), [k1x, k1z] = ctl(6.1);
    out.list.push({ e: P.RoadGraph.edges[c.e].name, w: +(c.a1 - c.a0).toFixed(1), step: +maxStep.toFixed(4), mono, kerb: +(P.groundY(k1x, k1z) - P.groundY(k0x, k0z)).toFixed(3) });
  }
  return out;
});
check('every curved street that leaves a raised kerb has its kerb cut (a ramp across its mouth)', cuts.n >= 14 && cuts.list.every(c => c.w > 6), JSON.stringify({ n: cuts.n, w: cuts.list.map(c => c.w) }));
check('the ground climbs the ramp smoothly from the road to the kerb top (no step over 6 mm in 5 cm), and the kerb beyond the mouth is untouched (15 cm)', cuts.list.every(c => c.mono && c.step < 0.006 && Math.abs(c.kerb - 0.15) < 0.01), JSON.stringify(cuts.list.filter(c => !(c.mono && c.step < 0.006 && Math.abs(c.kerb - 0.15) < 0.01)).slice(0, 4)));
// a car driven onto Saltmarsh Way from Juniper St: no kerb strike, no air
const ramp = await ev(() => {
  const g = window.game, P = window.__pv, A = window.__links('Saltmarsh Way')[0], goal = A.pts[12];
  g.resetPlayerState(790, 150, 0); window.__step(10);
  const v = window.__aiCar('sedan', 797.4, 140, 0, 'deliver'); v.drive.cruise = 9; v.drive.setGoal(goal[0], goal[1]);
  const out = { maxDy: 0, air: 0, frames: 0, on: false, crossed: false }; let y0 = v.pos.y;
  for (let k = 0; k < 60 * 15 && !v.drive.arrived; k++) {
    g.update(1 / 60, 1 / 60); out.frames++;
    if (k > 10) { out.maxDy = Math.max(out.maxDy, Math.abs(v.pos.y - y0)); if (v.airborne) out.air++; }
    y0 = v.pos.y;
    if (v.pos.x > 806.5) out.crossed = true;
    if (window.__off(v.pos.x, v.pos.z) < 0 && v.pos.x > 812) out.on = true;
  }
  out.at = [Math.round(v.pos.x), Math.round(v.pos.z), +v.pos.y.toFixed(2)]; out.arrived = v.drive.arrived;
  g.vehicles.despawn(v);
  return out;
});
check('a car turns off Juniper St onto Saltmarsh Way over the kerb cut: no step strike, never airborne', ramp.crossed && ramp.on && ramp.arrived && ramp.air === 0 && ramp.maxDy < 0.03, JSON.stringify(ramp));

// ---------------------------------------------------------------- 4. the GPS: along the curves, both ways, no chord cuts
const gps = await ev(() => {
  const g = window.game, P = window.__pv, R = P.RoadGraph, out = {};
  const len = r => { let d = 0; for (let k = 1; k < r.length; k++) d += Math.hypot(r[k].x - r[k - 1].x, r[k].z - r[k - 1].z); return d; };
  // the whole of Saltmarsh Way, Juniper St to Kestrel St: the route's length is the street's
  const sw = window.__links('Saltmarsh Way'), A = sw.find(L => L.pts[0][0] < 810), B = sw.find(L => L !== A);
  const r1 = R.route(A.ends[0].C.x, A.ends[0].C.z, B.ends[1].C.x, B.ends[1].C.z);
  const streetLen = R.edges.filter(e => e.name === 'Saltmarsh Way').reduce((s, e) => s + e.len, 0);
  out.whole = { route: +r1.len.toFixed(2), street: +streetLen.toFixed(2), poly: +len(r1.pts).toFixed(2), names: [...new Set(r1.steps.map(s => s.e.name))] };
  // a trip that takes the Y: Juniper St to 4th Ave by Kiln Lane
  const K = window.__links('Kiln Lane')[0], kq = K.pts[Math.floor(K.pts.length * 0.6)];
  const r2 = P.gpsRoute(780, 170, kq[0], kq[1]);
  out.y = { n: r2.length, onKiln: r2.filter(p => K.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 1e-6)).length, onA: r2.filter(p => A.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 1e-6)).length, end: +Math.hypot(r2[r2.length - 1].x - kq[0], r2[r2.length - 1].z - kq[1]).toFixed(3) };
  // two ways round: the same distance there and back
  const pairs = [[805, 175, 372, 870], [262, 806, 874, 262], [40, 600, 846, 316], [200, 940, 300, 1300]];
  out.two = pairs.map(([a, b2, c, d]) => { const f = R.route(a, b2, c, d), r = R.route(c, d, a, b2); return [Math.round(f.len), Math.round(r.len)]; });
  // no chord cuts and no shortcuts: every metre of a route is on a road surface, and it is never shorter than the crow flies
  out.cuts = 0; out.short = 0; out.samples = 0;
  for (const [a, b2, c, d] of [...pairs, [850, 300, 270, 820], [130, 290, 846, 316]]) {
    const r = P.gpsRoute(a, b2, c, d), core = r.slice(1, -1);
    for (let k = 1; k < core.length; k++) { const p0 = core[k - 1], p1 = core[k], L = Math.hypot(p1.x - p0.x, p1.z - p0.z); for (let s = 0; s <= L; s += 1) { const x = p0.x + (p1.x - p0.x) * s / (L || 1), z = p0.z + (p1.z - p0.z) * s / (L || 1); out.samples++; if (window.__off(x, z) > 0.05) out.cuts++; } }
    if (len(r) < Math.hypot(c - a, d - b2) - 0.01) out.short++;
  }
  // a road that can't be reached is detected (no route), not drawn as a straight line: Cedar Fields South without its bridge track
  out.cut = R.route(500, 500, 300, 1300, { filter: e => e.name !== 'Cedar Fields Track' }) === null;
  out.fare = { len: Math.round(P.routeLen(805, 175, 372, 870)), graph: Math.round(R.route(805, 175, 372, 870).len) };
  return out;
});
check('route distance is the road’s length: Saltmarsh Way end to end measures the street (diagonal, crossing, curve)', Math.abs(gps.whole.route - gps.whole.street) < 0.5 && Math.abs(gps.whole.poly - gps.whole.route) < 0.5 && gps.whole.names.length === 1, JSON.stringify(gps.whole));
check('the GPS takes the Y: from Juniper St along the diagonal and into Kiln Lane, ending on the curve', gps.y.onKiln >= 8 && gps.y.onA >= 10 && gps.y.end < 0.01, JSON.stringify(gps.y));
check('two-way: every route is the same length there and back (within 2%)', gps.two.every(([f, r]) => Math.abs(f - r) <= Math.max(f, r) * 0.02), JSON.stringify(gps.two));
check('no chord cuts: every metre of six cross-town routes lies on a road surface, none shorter than the crow flies', gps.cuts === 0 && gps.short === 0 && gps.samples > 3000, JSON.stringify({ cuts: gps.cuts, short: gps.short, n: gps.samples }));
check('a disconnection is detected: with the bridge track gone, no route reaches Cedar Fields South', gps.cut, String(gps.cut));
check('taxi fares measure the same road distance as the route', Math.abs(gps.fare.len - gps.fare.graph) <= 12, JSON.stringify(gps.fare));

// ---------------------------------------------------------------- 5. traffic on the curves and through the junctions
const traffic = await ev(async () => {
  const g = window.game, P = window.__pv, tr = g.traffic, R = P.RoadGraph, out = { cars: [] };
  g.resetPlayerState(845, 250, 0); window.__step(6);
  for (const v of tr.cars.slice()) g.vehicles.despawn(v);
  const spawn0 = tr.trySpawn; tr.trySpawn = () => null; // no new cars, and none thinned out
  // cars on the estate's streets, from each end
  const mk = (e, dir, d) => {
    const steps = [{ e, dir, from: d, to: dir ? 0 : e.len }], w = tr.walk(dir ? e.a : e.b, e, steps, false); if (!w) return null;
    const [cx, cz, tx, tz] = R.pointAt(e, d), sg = dir ? -1 : 1, off = Math.min(2.6, e.w / 4);
    const v = g.vehicles.spawn('sedan', cx - tz * sg * off, cz + tx * sg * off, Math.atan2(tx * sg, tz * sg), { kinematic: true, driver: 'npc' });
    v.ai = { i: 0, j: 0, dx: 1, dz: 0, s: 0, mode: 'path', t: 0, len: 1, speed: 6, pers: 1, gapK: 1, runK: 1, maxV: 13, react: 0.3, reactT: 0, runLight: null, next: null, blockT: 0, honkT: 1, laneOff: 0, overtake: 0, creepT: 0, p0: null, linkSeen: 0 };
    tr.linkPath(v, steps, w); tr.cars.push(v); return v;
  };
  const es = R.edges.filter(e => ['Saltmarsh Way', 'Kiln Lane'].includes(e.name));
  for (const e of es) for (const dir of [0, 1]) { const v = mk(e, dir, e.len * 0.3); if (v) out.cars.push({ v, e: e.name, maxSide: 0, minSide: 99, over: 0, merged: false, roadOff: 0, n: 0 }); }
  const t0 = g.time;
  for (let k = 0; k < 60 * 40; k++) {
    g.update(1 / 60, 1 / 60);
    for (const T of out.cars) {
      const v = T.v; if (!v.ai || !g.vehicles.list.includes(v)) continue;
      if (v.ai.mode !== 'path') { T.merged = true; continue; }
      const pa = v.ai.path; T.n++;
      // on a road surface, on the right-hand side of the street it is on, at no more than the bend allows
      if (window.__off(v.pos.x, v.pos.z) > -0.6) { T.roadOff++; if (!T.where) T.where = [Math.round(v.pos.x), Math.round(v.pos.z), +window.__off(v.pos.x, v.pos.z).toFixed(2)]; }
      // the planner brakes at 4.5 m/s² for the next point's limit: never faster than that allows
      const k1 = Math.min(pa.k + 1, pa.lim.length - 1), allow = Math.max(pa.lim[pa.k], Math.sqrt(pa.lim[k1] ** 2 + 9 * Math.max(0, pa.cum[k1] - pa.d)));
      if (v.ai.speed > allow + 0.3) { T.over++; if (!T.ow) T.ow = { sp: +v.ai.speed.toFixed(2), allow: +allow.toFixed(2), k: pa.k, lim: [pa.lim[pa.k], pa.lim[k1]].map(x => +x.toFixed(2)), d: +pa.d.toFixed(1), len: +pa.len.toFixed(1), at: [Math.round(v.pos.x), Math.round(v.pos.z)] }; }
    }
    if (out.cars.every(T => T.merged)) break;
  }
  out.cars = out.cars.map(T => ({ e: T.e, merged: T.merged, n: T.n, roadOff: T.roadOff, over: T.over, where: T.where, ow: T.ow }));
  out.secs = Math.round(g.time - t0);
  tr.trySpawn = spawn0;
  return out;
});
check('traffic drives the curves, the diagonal and the Y on the road (body well inside the surface) and back out onto the grid', traffic.cars.length >= 6 && traffic.cars.every(c => c.merged && c.roadOff === 0 && c.n > 30), JSON.stringify(traffic));
check('…never faster than the bend allows (the speed limit comes from the curve’s radius)', traffic.cars.every(c => c.over === 0), JSON.stringify(traffic.cars.map(c => [c.over, c.ow])));
// a car crossing 3rd Ave on Saltmarsh Way gives way to a car coming along 3rd Ave
const gw = await ev(() => {
  const g = window.game, P = window.__pv, tr = g.traffic, R = P.RoadGraph;
  for (const v of tr.cars.slice()) g.vehicles.despawn(v);
  const spawn0 = tr.trySpawn; tr.trySpawn = () => null;
  const X = R.nodes.find(n => n.att && n.edges.filter(x => x.e.name === 'Saltmarsh Way').length === 2);
  const A = X.edges.find(x => x.e.name === 'Saltmarsh Way' && x.end === 1).e, B = X.edges.find(x => x.e.name === 'Saltmarsh Way' && x.end === 0).e;
  // from 30 m back on the diagonal, across 3rd Ave and on (the walk takes it to the next street)
  const steps = [{ e: A, dir: 0, from: A.len - 34, to: A.len }, { e: B, dir: 0, from: 0, to: B.len }], w = tr.walk(B.b, B, steps, false);
  w.gates.unshift({ k: 1, node: X });
  const [cx, cz, tx, tz] = R.pointAt(A, A.len - 34);
  const v = g.vehicles.spawn('sedan', cx - tz * 2.6, cz + tx * 2.6, Math.atan2(tx, tz), { kinematic: true, driver: 'npc' });
  v.ai = { i: 0, j: 0, dx: 1, dz: 0, s: 0, mode: 'path', t: 0, len: 1, speed: 8, pers: 1, gapK: 1, runK: 1, maxV: 13, react: 0.3, reactT: 0, runLight: null, next: null, blockT: 0, honkT: 1, laneOff: 0, overtake: 0, creepT: 0, p0: null, linkSeen: 0 };
  tr.linkPath(v, steps, w); tr.cars.push(v);
  // a car on 3rd Ave heading east, 40 m short of the crossing
  const at = X.att, s0 = at.along - 40;
  const c = g.vehicles.spawn('van', at.seg * 80 + s0, at.line * 80 + 2.6, Math.PI / 2, { kinematic: true, driver: 'npc' });
  c.ai = { i: at.seg, j: at.line, dx: 1, dz: 0, s: s0, mode: 'lane', t: 0, len: 1, speed: 9, pers: 1, gapK: 1, runK: 0, maxV: 9, react: 0.3, reactT: 0, runLight: false, next: null, blockT: 0, honkT: 1, laneOff: 0, overtake: 0, creepT: 0, p0: null, linkSeen: 999 };
  tr.cars.push(c);
  g.resetPlayerState(at.C.x, at.C.z - 30, 0);
  const gate = v.ai.path.gates[0].d, out = { gate: Math.round(gate), entered: null, vanPassed: null, crossed: false, minGap: 99 };
  for (let k = 0; k < 60 * 25; k++) {
    g.update(1 / 60, 1 / 60);
    const vanS = c.ai && c.ai.mode === 'lane' ? c.ai.s : 999, toC = at.along - vanS;
    if (out.vanPassed === null && toC < -6) out.vanPassed = k;
    if (v.ai && v.ai.mode === 'path' && v.ai.path.d >= gate - 0.5 && out.entered === null) out.entered = k;
    if (v.ai && v.ai.mode === 'path' && toC > -6 && toC < 30) out.minGap = Math.min(out.minGap, gate - v.ai.path.d);
    if (!v.ai || v.ai.mode !== 'path' || v.ai.path.d > gate + 14) { out.crossed = true; break; }
  }
  tr.trySpawn = spawn0;
  for (const q of [v, c]) if (g.vehicles.list.includes(q)) g.vehicles.despawn(q);
  return out;
});
check('at the crossing a car on the curved street waits for the car coming along 3rd Ave, then crosses', gw.crossed && gw.vanPassed !== null && gw.entered !== null && gw.entered > gw.vanPassed && gw.minGap > 0, JSON.stringify(gw));

// ---------------------------------------------------------------- 6. AI drivers: police, a delivery van and a cab on the curves
const drive = await ev(() => {
  const g = window.game, P = window.__pv, out = {};
  const run = (v, secs, done) => {
    const T = { off: 0, n: 0, worst: -99, t: 0 };
    for (let k = 0; k < secs * 60; k++) {
      g.update(1 / 60, 1 / 60);
      if (k % 6 === 0) { const o = window.__off(v.pos.x, v.pos.z); T.n++; T.worst = Math.max(T.worst, o); if (o > 0.2) { T.off++; if (!T.where) T.where = [Math.round(v.pos.x), Math.round(v.pos.z), +o.toFixed(2), +v.speed.toFixed(1)]; } }
      if (done()) { T.t = +(k / 60).toFixed(1); break; }
    }
    return T;
  };
  // police: a unit runs from Juniper St to a suspect on Tanner's Row (its route takes Saltmarsh Way? no: the shortest
  // streets; through the Old Quarter it takes Tanner's Row's bends), at pursuit speed
  const tq = window.__links('Tanner’s Row')[1].pts[12];
  g.resetPlayerState(tq[0], tq[1], 0); window.__step(4);
  const cop = window.__aiCar('police', 237.4, 740, 0, 'pursue'); cop.siren = true;
  cop.drive.cruise = 20; cop.drive.target = () => ({ x: tq[0], z: tq[1], speed: 20 });
  const T1 = run(cop, 70, () => Math.hypot(cop.pos.x - tq[0], cop.pos.z - tq[1]) < 12);
  out.police = { ...T1, d: Math.round(Math.hypot(cop.pos.x - tq[0], cop.pos.z - tq[1])), viaRow: cop.drive.path.some(p => window.__links('Tanner’s Row').some(L => L.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 3))) };
  g.vehicles.despawn(cop);
  // a delivery van: from 2nd Ave across the estate to a yard off Kiln Lane
  const K = window.__links('Kiln Lane')[0], kq = K.pts[Math.floor(K.pts.length * 0.7)];
  g.resetPlayerState(kq[0] + 15, kq[1], 0); window.__step(4);
  const van = window.__aiCar('van', 797.4, 140, 0, 'cruise'); van.drive.mode = 'deliver'; van.drive.cruise = 12; van.drive.setGoal(kq[0], kq[1]);
  const T2 = run(van, 70, () => van.drive.arrived);
  out.van = { ...T2, arrived: van.drive.arrived, d: Math.round(Math.hypot(van.pos.x - kq[0], van.pos.z - kq[1])), viaA: van.drive.path.some(p => window.__links('Saltmarsh Way')[0].pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 3)) };
  g.vehicles.despawn(van);
  return out;
});
check('police drive to a suspect on Tanner’s Row at pursuit speed along its bends, on the road the whole way', drive.police.d <= 12 && drive.police.viaRow && drive.police.off === 0 && drive.police.n > 20, JSON.stringify(drive.police));
check('a delivery van takes the diagonal and the Y to a yard off Kiln Lane, on the road the whole way, and stops there', drive.van.arrived && drive.van.d < 10 && drive.van.viaA && drive.van.off === 0, JSON.stringify(drive.van));
// a cab: called from Kiln Lane, hired to Tanner's Row; it drives there by itself (no shortcut, no fade)
const cab = await ev(() => {
  const g = window.game, T = g.taxi, P = window.__pv, p = g.player;
  g.money.W.clean = 5000; g.police.clear();
  const K = window.__links('Kiln Lane')[0], kq = K.pts[Math.floor(K.pts.length * 0.5)];
  g.resetPlayerState(kq[0] + 4, kq[1], 0); window.__step(60);
  const pick = P.nearestRoadPoint(p.pos.x, p.pos.z);
  T.call(); let t = 0; while (T.state === 'coming' && t < 120 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state, t };
  const out = { came: Math.round(t / 60), pickOnKiln: K.pts.some(s => Math.hypot(s[0] - pick.x, s[1] - pick.z) < 5) };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  T.approach(v); document.querySelector('#svcBody [data-act="hire"]').click();
  const tq = window.__links('Tanner’s Row')[0].pts[14];
  g.ui.mapView.setPick(tq[0], tq[1]); const q = g.ui.mapView.pickMode.q, dest = g.ui.mapView.pickMode.dest;
  const m0 = g.money.total(); document.querySelector('#mapPick [data-pk="ok"]').click();
  let off = 0, n = 0; t = 0;
  const where = [];
  while (T.state === 'riding' && t < 180 * 60) { g.update(1 / 60, 1 / 60); t++; if (t % 6 === 0) { n++; const o = window.__off(v.pos.x, v.pos.z); if (o > 0.2) { off++; if (where.length < 6) where.push([Math.round(v.pos.x), Math.round(v.pos.z), +o.toFixed(2), +v.speed.toFixed(1)]); } } }
  return { ...out, secs: Math.round(t / 60), state: T.state, recov: T.recov || 0, paid: m0 - g.money.total(), fare: q.fare, m: Math.round(q.m), d: Math.round(Math.hypot(p.pos.x - dest.x, p.pos.z - dest.z)), destOnRow: window.__links('Tanner’s Row')[0].pts.some(s => Math.hypot(s[0] - dest.x, s[1] - dest.z) < 5), off, n, where };
});
check('a cab called to Kiln Lane comes to the curve, and a fare to Tanner’s Row snaps onto the lane', cab.pickOnKiln && cab.destOnRow, JSON.stringify(cab));
check('the cab drives the whole way itself on the roads (no recovery, no shortcut) and charges the quoted fare', cab.state === 'idle' && cab.recov === 0 && cab.off === 0 && cab.paid === cab.fare && cab.d < 20, JSON.stringify(cab));

// ---------------------------------------------------------------- 7. the maps draw the curves
const maps = await ev(() => {
  const g = window.game, ui = g.ui, out = {};
  // (each pixel copied to a scratch canvas made for reading, so the maps' own canvases are never read back)
  const rd = document.createElement('canvas'); rd.width = rd.height = 1; const rc = rd.getContext('2d', { willReadFrequently: true });
  const px = (img, x, z) => { const [mx, mz] = ui._mapXY(x, z); rc.clearRect(0, 0, 1, 1); rc.drawImage(img, Math.round(mx), Math.round(mz), 1, 1, 0, 0, 1, 1); const d = rc.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const asph = c => c && Math.abs(c[0] - 0x6f) < 14 && Math.abs(c[1] - 0x76) < 14 && Math.abs(c[2] - 0x82) < 14;
  const B = window.__links('Saltmarsh Way')[1], K = window.__links('Kiln Lane')[0], T2 = window.__links('Tanner’s Row')[0];
  const on = [B.pts[6], K.pts[14], T2.pts[15]], off = [[B.pts[6][0] - 16, B.pts[6][1] + 14]];
  out.big = on.map(q => asph(px(ui.mapImg, q[0], q[1]))); out.mini = on.map(q => asph(px(ui.mmImg, q[0], q[1])));
  out.offRoad = off.map(q => asph(px(ui.mapImg, q[0], q[1])));
  // the big map names a curved street when you tap it
  const mv = ui.mapView, e = mv.roadEntry(K.pts[14][0] + 1, K.pts[14][1], 6);
  out.card = e && e.name;
  return out;
});
check('both maps draw the new streets where they are (the curve, the Y, the Old Quarter lane), not the yards beside them', maps.big.every(Boolean) && maps.mini.every(Boolean) && !maps.offRoad.some(Boolean), JSON.stringify(maps));
check('the big map’s road card names a curved street', maps.card === 'Kiln Lane', String(maps.card));

// ---------------------------------------------------------------- 8. parked cars follow the kerb's curve
const park = await ev(() => {
  const g = window.game, P = window.__pv, out = { gen: [], live: [] };
  const sw = window.__links('Saltmarsh Way');
  const tang = (x, z) => { let best = null; for (const L of sw) for (let k = 0; k < L.pts.length - 1; k++) { const a = L.pts[k], c = L.pts[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (!best || d < best.d) best = { d, h: Math.atan2(dx, dz), w: L.w }; } return best; };
  const dev = (h, h0) => { let d = Math.abs(((h - h0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return Math.min(d, Math.PI - d); };
  for (const k of ['10,2', '10,3']) { const [x, z] = k.split(',').map(Number); for (const c of g.world.block(x, z).parked.filter(c => c.kerb)) { const q = tang(c.x, c.z); out.gen.push({ dh: +(dev(c.h, q.h) * 180 / Math.PI).toFixed(1), off: +(q.d - (q.w / 2 - 1.15)).toFixed(2) }); } }
  // the cars themselves, once you walk up to them
  g.resetPlayerState(830, 200, 0); window.__step(30);
  for (const v of g.vehicles.list) if (v.parked && !v.garageUid) { const q = tang(v.pos.x, v.pos.z); if (q && q.d < q.w / 2) out.live.push(+(dev(v.h, q.h) * 180 / Math.PI).toFixed(1)); }
  return out;
});
check('cars parked along Saltmarsh Way sit at the kerb, nose to tail with the road (heading within 3° of the street’s line)', park.gen.length >= 4 && park.gen.every(c => c.dh < 3 && Math.abs(c.off) < 0.2), JSON.stringify(park.gen));
check('…and the parked cars in the world are placed the same way', park.live.length >= 3 && park.live.every(d => d < 3), JSON.stringify(park.live));

// ---------------------------------------------------------------- 9. a race route along curved streets
const race = await ev(() => {
  const g = window.game, P = window.__pv;
  const def = { id: 'test_saltmarsh', name: 'Saltmarsh test', route: [[800, 140], [828, 204], [846, 316]], laps: 1, opp: 1, cls: ['sports'] };
  const R = P.raceCheckpoints(def), pts = P.routeRacePath(def).pts, out = { cps: R.cps.length, ai: R.aiPath.length };
  out.cpOff = R.cps.filter(c => window.__off(c.x, c.z) > 0).length;
  out.slow = Math.min(...R.aiPath.map(a => a.vmax)); out.fast = Math.max(...R.aiPath.map(a => a.vmax));
  out.viaKiln = pts.some(p => window.__links('Kiln Lane')[0].pts.some(s => Math.hypot(s[0] - p[0], s[1] - p[1]) < 1));
  // an AI racer runs it on its racing line, start to finish
  const st = R.start, v = window.__aiCar('sports', st.x, st.z, st.h, 'race');
  v.drive.path = R.aiPath.map(c => ({ ...c })); v.drive.pi = 0; v.drive.cruise = 24;
  g.resetPlayerState(st.x, st.z + 30, 0);
  let off = 0, n = 0, t = 0;
  for (; t < 60 * 60 && v.drive.pi < v.drive.path.length - 3; t++) { if (t % 20 === 0) g.resetPlayerState(v.pos.x - Math.sin(v.h) * 10, v.pos.z - Math.cos(v.h) * 10, 0); g.update(1 / 60, 1 / 60); if (t % 6 === 0) { n++; if (window.__off(v.pos.x, v.pos.z) > 0.3) off++; } }
  out.done = v.drive.pi >= v.drive.path.length - 3; out.secs = +(t / 60).toFixed(1); out.off = off; out.n = n;
  g.vehicles.despawn(v);
  return out;
});
check('a race can be laid along curved streets: checkpoints follow the route (diagonal, crossing, Y, curve), all on the road', race.cps >= 4 && race.cpOff === 0 && race.viaKiln && race.ai >= 30, JSON.stringify(race));
check('…its racing line slows for the bends and junction corners, and an AI racer runs it start to finish on the road', race.slow < race.fast && race.done && race.off === 0, JSON.stringify(race));

// ---------------------------------------------------------------- 10. the countryside's tracks follow the hills as roads
const country = await ev(() => {
  const g = window.game, P = window.__pv, cf = g.world.cfs, out = {};
  const H = (x, z) => P.Terrain.height(x, z) - P.Terrain.rough;
  for (const [name, T] of [['bridge track', cf.tracks[0]], ['loop', cf.tracks[1]], ['east track', cf.tracks[2]]]) {
    const pts = T.pts, hs = pts.map(q => H(q[0], q[1]));
    let g1 = 0, g20 = 0, cross = 0, lo = 1e9, hi = -1e9, cut = 0;
    for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (d > 0.5) g1 = Math.max(g1, Math.abs(hs[k] - hs[k - 1]) / d); lo = Math.min(lo, hs[k]); hi = Math.max(hi, hs[k]); }
    for (let k = 8; k < pts.length; k++) { let d = 0; for (let j = k - 7; j <= k; j++) d += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); g20 = Math.max(g20, Math.abs(hs[k] - hs[k - 8]) / d); }
    for (let k = 1; k < pts.length - 1; k++) { const a = pts[k - 1], c = pts[k + 1], tx = c[0] - a[0], tz = c[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l, w = T.w / 2 - 0.6; cross = Math.max(cross, Math.abs(H(pts[k][0] + nx * w, pts[k][1] + nz * w) - H(pts[k][0] - nx * w, pts[k][1] - nz * w)) / (2 * w)); }
    if (T.prof) for (let k = 0; k < T.prof.y.length; k++) cut = Math.max(cut, Math.abs(T.prof.y[k] - T.prof.raw[k]));
    out[name] = { grade: +g1.toFixed(3), grade20: +g20.toFixed(3), cross: +cross.toFixed(3), climb: +(hi - lo).toFixed(2), cutFill: +cut.toFixed(2) };
  }
  // the hills themselves are still there
  const C = P.Terrain.regions.find(r => r.id === 'country'); let lo = 1e9, hi = -1e9; for (let i = 0; i < C.h.length; i += 7) { lo = Math.min(lo, C.h[i]); hi = Math.max(hi, C.h[i]); }
  out.hills = +(hi - lo).toFixed(1);
  // traffic out there: a car comes along the tracks, on the ground
  const tr = g.traffic; for (const v of tr.cars.slice()) g.vehicles.despawn(v);
  g.resetPlayerState(150, 1300, 0); window.__step(10);
  // (kept as a test car: an ordinary one this far from the player and out of sight is recycled at once)
  let car = null; for (let k = 0; k < 80 && !car; k++) { const v = tr.trySpawn(); if (v && v.ai && v.ai.mode === 'path') { car = v; v.mission = 'test'; } }
  out.traffic = !!car;
  if (car) {
    let air = 0, n = 0, off = 0;
    // on the road out there: the packed track, or the gravel of a pad (where a car turns round at a track's end)
    const onTrack = (x, z) => [P.TSURF.track, P.TSURF.gravel].includes(P.Terrain.surf(x, z)) || window.__off(x, z) < 0;
    for (let k = 0; k < 60 * 12; k++) { g.update(1 / 60, 1 / 60); if (!g.vehicles.list.includes(car) || !car.ai) break; if (k % 6 === 0) { n++; if (Math.abs(car.pos.y - P.groundY(car.pos.x, car.pos.z)) > 0.25) air++; if (!onTrack(car.pos.x, car.pos.z)) { off++; if (!out.offAt) out.offAt = [Math.round(car.pos.x), Math.round(car.pos.z), P.Terrain.surf(car.pos.x, car.pos.z)]; } } }
    out.car = { n, air, off, at: out.offAt, on: car.ai && car.ai.path ? R2(car.ai.path.d) : null };
  }
  function R2(v) { return Math.round(v); }
  return out;
});
const tr3 = ['bridge track', 'loop', 'east track'].map(k => country[k]);
check('country roads: the tracks climb and fall with the hills (each still rises 3 m or more) but never steeper than 12% (8% over 20 m)', tr3.every(r => r.grade <= 0.12 && r.grade20 <= 0.08 && r.climb >= 3), JSON.stringify(country));
check('…level across their width (under 2% side slope), cut and filled no more than 2.5 m, and the hills round them untouched', tr3.every(r => r.cross <= 0.02 && r.cutFill <= 2.5) && country.hills >= 7, JSON.stringify(country));
check('traffic drives the countryside’s tracks, on the ground, on the road', country.traffic && country.car && country.car.air === 0 && country.car.off === 0 && country.car.n > 20, JSON.stringify(country.car));

// ---------------------------------------------------------------- 11. saves: a car on a curve, and a car whose spot was built on
await ev(() => {
  const g = window.game, P = window.__pv, s = g.save;
  if (g.player.state === 'vehicle') g.exitVehicle(true);
  const add = (x, z, h) => { const e = { uid: s.nextUid++, type: 'sedan', color: 0x3355aa, origin: 'bought', dmg: 0, tune: { engine: 0, brakes: 0, grip: 0, armor: 0 }, at: null, out: true, loc: { x, z, h, y: P.groundY(x, z) }, trunk: {}, prov: { dirty: 0, clean: 1000 }, seen: g.vreg.econ() }; s.garage.push(e); return e; };
  // on Tanner's Row's bend, along the lane
  const T2 = window.__links('Tanner\u2019s Row')[1], q = T2.pts[10], q1 = T2.pts[11], h = Math.atan2(q1[0] - q[0], q1[1] - q[1]), lx = q[0] - Math.cos(h) * 1.6, lz = q[1] + Math.sin(h) * 1.6;
  const e1 = add(lx, lz, h);
  // one saved where a warehouse of the new estate now stands (as an old save would have it)
  const b2 = g.world.block(10, 3), wh = b2.bld.reduce((p, r) => (r.x1 - r.x0) * (r.z1 - r.z0) > (p.x1 - p.x0) * (p.z1 - p.z0) ? r : p);
  const e2 = add((wh.x0 + wh.x1) / 2, (wh.z0 + wh.z1) / 2, 0); e2.loc.y = 0.15;
  window.__save = { u1: e1.uid, u2: e2.uid, p1: [lx, lz, h], wh: [wh.x0, wh.z0, wh.x1, wh.z1] };
  g.resetPlayerState(lx + 6, lz, 0);
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
});
const saved = await ev(() => window.__save);
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await helpers();
const reload = await ev(S => {
  const g = window.game, P = window.__pv, s = g.save, out = {};
  const toasts = []; const t0 = g.ui.toast.bind(g.ui); g.ui.toast = (m, k) => { toasts.push(m); return t0(m, k); };
  window.__step(20);
  const e1 = s.garage.find(e => e.uid === S.u1), v1 = e1 && g.vreg.live(e1);
  out.curve = v1 ? { d: +Math.hypot(v1.pos.x - S.p1[0], v1.pos.z - S.p1[1]).toFixed(2), dh: +Math.abs(v1.h - S.p1[2]).toFixed(3), y: +(v1.pos.y - P.groundY(v1.pos.x, v1.pos.z)).toFixed(2) } : null;
  const e2 = s.garage.find(e => e.uid === S.u2);
  g.resetPlayerState(e2.loc.x + 5, e2.loc.z, 0); window.__step(20);
  const v2 = g.vreg.live(e2), [x0, z0, x1, z1] = S.wh;
  out.moved = v2 ? { inWh: v2.pos.x > x0 - 1 && v2.pos.x < x1 + 1 && v2.pos.z > z0 - 1 && v2.pos.z < z1 + 1, blocked: P.kerbBlocked(g.world, v2.pos.x, v2.pos.z, v2.pos.y, v2.h), onKerb: window.__off(v2.pos.x, v2.pos.z) < 0, savedThere: Math.hypot(e2.loc.x - v2.pos.x, e2.loc.z - v2.pos.z) < 0.5, far: Math.round(Math.hypot(v2.pos.x - (x0 + x1) / 2, v2.pos.z - (z0 + z1) / 2)), told: toasts.some(m => /moved to the kerb/.test(m)) } : null;
  return out;
}, saved);
check('save → reload: a car left on Tanner’s Row’s bend is where it was, facing along the lane, on the road', reload.curve && reload.curve.d < 0.3 && reload.curve.dh < 0.02 && Math.abs(reload.curve.y) < 0.3, JSON.stringify(reload.curve));
check('save → reload: a car saved where the estate now has a warehouse is put at the nearest clear kerb (not inside the wall), the new spot is saved, and you are told', reload.moved && !reload.moved.inWh && !reload.moved.blocked && reload.moved.onKerb && reload.moved.savedThere && reload.moved.far < 80 && reload.moved.told, JSON.stringify(reload.moved));

// ---------------------------------------------------------------- 12. cost
const cost = await ev(() => {
  const g = window.game, P = window.__pv, R = P.RoadGraph, out = {};
  let t0 = performance.now(); R.build(g.world); out.build = +(performance.now() - t0).toFixed(1);
  const pts = []; for (let k = 0; k < 300; k++) pts.push([Math.random() * 960, Math.random() * 960, Math.random() * 960, Math.random() * 960]);
  t0 = performance.now(); for (const [a, b2, c, d] of pts) P.gpsRoute(a, b2, c, d); out.route = +((performance.now() - t0) / pts.length).toFixed(3);
  t0 = performance.now(); let n = 0; for (const [a, b2, c, d] of pts.slice(0, 100)) { const r = R.route(a, b2, c, d); if (r) { R.lane(r.steps, { R: 12 }); n++; } } out.lane = +((performance.now() - t0) / n).toFixed(3);
  t0 = performance.now(); for (const [a, b2] of pts) for (let k = 0; k < 10; k++) R.nearest(a + k, b2); out.nearest = +((performance.now() - t0) / pts.length / 10 * 1000).toFixed(1);
  out.graph = [R.nodes.length, R.edges.length];
  return out;
});
check('cheap enough for a phone: the graph builds in under 150 ms, a GPS route takes under 1.5 ms, a car’s lane under 3 ms, a nearest-road query under 60 µs', cost.build < 150 && cost.route < 1.5 && cost.lane < 3 && cost.nearest < 60, JSON.stringify(cost));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'roadnet');
