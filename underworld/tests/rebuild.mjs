/* The city rebuilt (Phase 1 of the owner's 2026-11-19 brief; CITY_REBUILD.md). For every district rebuilt with the
   kit (124: a superblock whose `rb` names its definition):
   - no lattice street is left inside it;
   - every street of its definition is a link, both ends on a road that runs (an edge street or another street);
   - every SPECIAL cell (the police station, the hospital, the safehouse, the chop shop) and every landmark cell on it is
     kept (its definition's `keep`): nothing the city had is lost;
   - every door with an address there (businesses, homes, banks, HQs) is on a street (not on its carriageway) with its
     building right behind it, and the GPS finds a way to it from the city's middle;
   - the precinct keeps its density (buildings, against the count before Phase 1);
   and the whole road graph is still one network. */
import { launch, open, check, startNew, finish } from './lib.mjs';
// buildings per precinct before Phase 1 (the audit on 0beff6a, CITY_REBUILD.md §2)
const BEFORE = { heights: 49, greenway: 124, uptown: 115, port: 41, oldquarter: 354, core: 113, linden: 139, strip: 104, stadium: 15, freight: 9 };
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const R = await page.evaluate(() => {
  const g = window.game, w = g.world, P = window.__pv, RN = P.RoadNet, RG = P.RoadGraph, out = [];
  for (const sb of P.SUPERBLOCKS) {
    if (!sb.rb) continue;
    const D = P.REBUILDS[sb.rb], o = { id: sb.id };
    // the lattice inside
    const inner = [];
    for (let i = sb.bx0 + 1; i <= sb.bx1; i++) for (let j = sb.bz0; j <= sb.bz1; j++) inner.push(RN.segOpen(0, i, j));
    for (let j = sb.bz0 + 1; j <= sb.bz1; j++) for (let i = sb.bx0; i <= sb.bx1; i++) inner.push(RN.segOpen(1, j, i));
    o.inner = inner.length; o.open = inner.filter(Boolean).length;
    // (the superblock in world metres: where its precinct stands)
    const ox = (P.CityLayout.siteI(sb.bx0, sb.bz0) - sb.bx0) * 80, oz = (P.CityLayout.siteJ(sb.bx0, sb.bz0) - sb.bz0) * 80;
    const inSb = (x, z) => x > sb.bx0 * 80 + ox && x < (sb.bx1 + 1) * 80 + ox && z > sb.bz0 * 80 + oz && z < (sb.bz1 + 1) * 80 + oz;
    // its streets: each a link, its ends attached
    o.streets = D.streets.length;
    o.links = D.streets.map(S => { const L = w.links.filter(L2 => L2.name === S.name && L2.pts.some(p => inSb(p[0], p[1]))); return { name: S.name, n: L.length, attached: L.every(L2 => L2.ends.every(Boolean)) }; });
    // what it keeps
    const kept = new Set((D.keep || []).map(K => K.bx + ',' + K.bz)), lost = [];
    for (let bx = sb.bx0; bx <= sb.bx1; bx++) for (let bz = sb.bz0; bz <= sb.bz1; bz++) {
      const key = bx + ',' + bz, sp = Object.keys(P.GAME_CONFIG.world.specialBlocks).find(k => P.GAME_CONFIG.world.specialBlocks[k].bx === bx && P.GAME_CONFIG.world.specialBlocks[k].bz === bz);
      // (the starter safehouse needs no cell of its own: a house on the new streets is it, its address unchanged)
      const housed = sp === 'safehouse' && (() => { const h = w.block(bx, bz).safehouse; return !!(h && h.home && inSb(h.x, h.z)); })();
      if ((sp || P.GAME_CONFIG.world.landmarks[key]) && !kept.has(key) && !housed) lost.push(key + ':' + (sp || P.GAME_CONFIG.world.landmarks[key].name));
    }
    o.lost = lost;
    // the doors
    const from = RG.nearest(480 + ox, 480 + oz, { maxD: 400 });
    o.doors = g.uw.locs.filter(L => L.kind !== 'deal' && inSb(L.x, L.z)).map(L => {
      const fx = Math.sin(L.h), fz = Math.cos(L.h), hit = w.grid.raycast(L.x + fx * 1.5, P.groundY(L.x, L.z) + 1.2, L.z + fz * 1.5, -fx, 0, -fz, 6, 0.3), road0 = RG.nearest(L.x, L.z, { maxD: 30 });
      // (a house round a cul-de-sac faces its turning circle: the circle's kerb is its road)
      let road = road0;
      for (const Lk of w.links) if (Lk.ring) { const dc = Math.hypot(L.x - Lk.ring.x, L.z - Lk.ring.z) - Lk.ring.r; if (road && dc < road.d) road = { ...road, d: dc, x: Lk.ring.x, z: Lk.ring.z }; }
      const rt = RG.route(560, 480, L.x, L.z);
      const inKept = (D.keep || []).some(K => L.x > K.bx * 80 + ox && L.x < (K.bx + 1) * 80 + ox && L.z > K.bz * 80 + oz && L.z < (K.bz + 1) * 80 + oz);
      // (a kept cell's door: a clear line to the road that serves it now, nothing built in the way)
      let reach = null;
      if (inKept && road) { const dx = road.x - L.x, dz = road.z - L.z, d = Math.hypot(dx, dz); const h2 = d > 0.5 ? w.grid.raycast(L.x, P.groundY(L.x, L.z) + 1.2, L.z, dx / d, 0, dz / d, Math.max(0, d - 1), 0.3) : null; reach = h2 ? 'blocked at ' + h2.t.toFixed(1) : 'clear'; }
      // (a detached house stands behind its front garden and drive: its door is further from the kerb than a shop's)
      const house = L.kind === 'prop' && (() => { const d = P.PROP_BY_ID[L.id], h = d && d.home && w.homes.find(x => x.id === d.home); return !!(h && !h.flat && h.type !== 'apartment'); })();
      return { id: L.kind + ':' + L.id, kept: inKept, house, reach, wall: hit ? +hit.t.toFixed(1) : null, road: road ? +road.d.toFixed(1) : null, onRoad: P.isOnRoad(L.x, L.z), gps: !!(rt && Math.hypot(rt.g.x - L.x, rt.g.z - L.z) < 30) };
    });
    // where the hospital and the police let you out (a SPECIAL cell's respawn): on open ground, a road at hand
    o.respawns = Object.keys(P.GAME_CONFIG.world.specialBlocks).map(k => { const S = P.GAME_CONFIG.world.specialBlocks[k], bk = w.block(S.bx, S.bz), r = bk && bk.respawn; if (!r || !inSb(r.x, r.z)) return null;
      const gy = P.groundY(r.x, r.z), hit = w.grid.resolveCircle(r.x, r.z, 0.6, gy + 0.3, gy + 1.7, {}).hit, road = RG.nearest(r.x, r.z, { maxD: 40 });
      return { k, clear: !hit, road: road ? +road.d.toFixed(1) : null }; }).filter(Boolean);
    // the density: buildings on the precinct's blocks
    const pr = P.CityLayout.precinctOf(sb.bx0, sb.bz0); o.precinct = pr.id;
    o.bld = w.blocks.filter(bk => P.CityLayout.precinctOf(bk.bx, bk.bz) === pr).reduce((n, bk) => n + bk.bld.length, 0);
    out.push(o);
  }
  const seen = new Set([RG.nodes[0]]), st = [RG.nodes[0]];
  while (st.length) { const n = st.pop(); for (const x of n.edges) for (const m of [x.e.a, x.e.b]) if (!seen.has(m)) { seen.add(m); st.push(m); } }
  return { sbs: out, reach: seen.size, nodes: RG.nodes.length };
});
check('at least one district rebuilt with the kit', R.sbs.length >= 1, R.sbs.map(s => s.id).join(','));
for (const s of R.sbs) {
  check(`${s.id}: no lattice street left inside it`, s.inner > 0 && s.open === 0, JSON.stringify({ inner: s.inner, open: s.open }));
  check(`${s.id}: every one of its ${s.streets} streets is a link, both ends on a road`, s.links.every(l => l.n >= 1 && l.attached), JSON.stringify(s.links.filter(l => !(l.n >= 1 && l.attached))));
  check(`${s.id}: every special and landmark cell on it is kept`, s.lost.length === 0, JSON.stringify(s.lost));
  // (a door in a kept cell stands as it always did: the Quarter Garage's ramp, a gas station's shop)
check(`${s.id}: every door is on a street, off its carriageway, its building right behind it`, s.doors.length >= 1 && s.doors.every(d => d.kept || (d.wall !== null && d.wall < 4 && d.road !== null && d.road < (d.house ? 18 : 12) && !d.onRoad)), JSON.stringify(s.doors.filter(d => !(d.kept || (d.wall !== null && d.wall < 4 && d.road !== null && d.road < (d.house ? 18 : 12) && !d.onRoad)))));
  check(`${s.id}: every door in a cell it keeps has a clear way to a road`, s.doors.filter(d => d.kept).every(d => d.road !== null && d.road < 30 && d.reach === 'clear'), JSON.stringify(s.doors.filter(d => d.kept && !(d.road !== null && d.road < 30 && d.reach === 'clear'))));
check(`${s.id}: every respawn on it (the hospital's, the police's) is clear, a road at hand`, s.respawns.every(r => r.clear && r.road !== null && r.road < 25), JSON.stringify(s.respawns));
check(`${s.id}: the GPS finds every door`, s.doors.every(d => d.gps), JSON.stringify(s.doors.filter(d => !d.gps).map(d => d.id)));
  check(`${s.id}: its precinct (${s.precinct}) keeps its density`, s.bld >= (BEFORE[s.precinct] || 0), `${s.bld} buildings (before ${BEFORE[s.precinct]})`);
}
// ---- traffic: a lattice car turns into each district by a street's end on an edge street, drives the district's
// streets in its lane and comes back out onto the lattice or the island roads (three streets a district)
const T = await page.evaluate(async () => {
  const g = window.game, w = g.world, tr = g.traffic, P = window.__pv, out = [];
  g.events.cool = 1e9; g.police.enabled = false; g.peds.target = 0;
  for (const sb of P.SUPERBLOCKS) {
    if (!sb.rb) continue;
    const names = P.REBUILDS[sb.rb].streets.map(S => S.name), done = new Set();
    for (const L of w.links) {
      if (!names.includes(L.name) || done.has(L.name) || done.size >= 3) continue;
      const e = L.ends.find(e2 => e2 && e2.axis >= 0); if (!e) continue;
      done.add(L.name);
      for (const v of tr.cars.slice()) g.vehicles.despawn(v);
      // (the player off the carriageway: on the far pavement of the edge street, outside the district; no one on foot in
      // the streets, the network is what is tested)
      // (the district's middle where its precinct stands, 021: an end's crossing is in world metres)
      const wcx = (sb.bx0 + sb.bx1 + 1) * 40 + (P.CityLayout.siteI(sb.bx0, sb.bz0) - sb.bx0) * 80, wcz = (sb.bz0 + sb.bz1 + 1) * 40 + (P.CityLayout.siteJ(sb.bx0, sb.bz0) - sb.bz0) * 80;
      const offS = e.axis === 0 ? (e.C.x < wcx ? -9 : 9) : 0, offZ = e.axis === 1 ? (e.C.z < wcz ? -9 : 9) : 0;
      g.resetPlayerState(e.C.x + offS, e.C.z + offZ, 0);
      for (const pd of g.peds.peds.slice()) if (!pd.keep) { pd.dead = true; }
      g.peds.peds = g.peds.peds.filter(pd => pd.keep);
      await new Promise(r => { const f0 = g.frame; const iv = setInterval(() => { if (g.frame > f0 + 5) { clearInterval(iv); r(); } }, 20); });
      // (a street's end can be a crossroads with a road going the other way out of the district, an island road, or have
      // another street's mouth close by: a car that turns onto that one is not the test, and another is sent, up to eight)
      let v = null, took = false, merged = false, maxOff = 0, wasIn = false, outT = 0, via = null; const other = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        if (v && g.vehicles.list.includes(v)) g.vehicles.despawn(v);
        v = null; for (let k = 0; k < 80 && !v; k++) { v = tr.trySpawn(); if (v && (v.patrol || v.ai.mode !== 'lane')) { g.vehicles.despawn(v); v = null; } }
        if (!v) break;
        // (coming up the edge street toward the end: one way, then the other; from 32 m out, then from 12 m, inside the
        // stretch where traffic decides on a turn (280 maybeTakeLink), past any other street's mouth close by; at a
        // crossroads a car takes one of the two roads, so it may take some tries to turn in toward the district)
        const sg = attempt % 2 ? -1 : 1, dir = e.axis === 0 ? [0, sg] : [sg, 0], back = attempt % 4 < 2 ? 32 : 12;
        const n0 = sg > 0 ? [e.axis === 0 ? e.line : e.seg, e.axis === 0 ? e.seg : e.line] : [e.axis === 0 ? e.line : e.seg + 1, e.axis === 0 ? e.seg + 1 : e.line];
        Object.assign(v.ai, { i: n0[0], j: n0[1], dx: dir[0], dz: dir[1], s: Math.max(4, (sg > 0 ? e.along : 80 - e.along) - back), mode: 'lane', next: null, linkSeen: 0, speed: 8 });
        const lp = tr.lanePt(v.ai.i, v.ai.j, dir[0], dir[1], v.ai.s); v.pos.x = lp[0]; v.pos.z = lp[1]; v.h = Math.atan2(dir[0], dir[1]);
        tr.target = 1; tr.linkChance = 1;
        took = false; merged = false; maxOff = 0; wasIn = false; outT = 0; via = null;
        let wrong = null;
        // (stepped, not waited for: up to 240 s of game time in 0.05 s steps, whatever the frame rate: a route through a big
        // district can run round its roundabout and its avenues before it leaves)
        try {
          for (let k = 0; k < 4800 && v.ai && !merged; k++) {
            g.update(0.05, 0.05);
            if (!v.ai) break;
            if (v.ai.mode === 'path') {
              if (!took) { const first = w.links[v.ai.path.link]; if (first && first.name !== L.name) { wrong = first.name; break; } }
              took = true; v.mission = v.mission || 'test';
              // (inside the district: past its edge the car is out on the rest of the city's and the island's roads)
              const ox2 = (P.CityLayout.siteI(sb.bx0, sb.bz0) - sb.bx0) * 80, oz2 = (P.CityLayout.siteJ(sb.bx0, sb.bz0) - sb.bz0) * 80;
              const inD = v.pos.x > sb.bx0 * 80 + ox2 && v.pos.x < (sb.bx1 + 1) * 80 + ox2 && v.pos.z > sb.bz0 * 80 + oz2 && v.pos.z < (sb.bz1 + 1) * 80 + oz2;
              // (off the road surface: every road round it counts, a junction's and a cul-de-sac's turning circle too, 135)
              if (inD && k % 4 === 0) maxOff = Math.max(maxOff, Math.min(30, P.RoadGraph.surfaceDist(v.pos.x, v.pos.z, { r: 30 })));
              // out again: a street of the district that ends on an edge street running on into the island's roads keeps
              // the car on its route past the edge; out of the district, on a road and driving, for two seconds, is out
              if (inD) wasIn = true;
              outT = wasIn && !inD && v.ai.speed > 2 && P.RoadGraph.surfaceDist(v.pos.x, v.pos.z, { r: 30 }) < 0.5 ? outT + 0.05 : 0;
              if (outT >= 2) { merged = true; via = 'route'; }
            } else if (took) { merged = true; via = 'lane'; }
          }
        } finally { tr.linkChance = 0.4; tr.target = 18; if (v.mission === 'test') v.mission = null; }
        if (!wrong) break;
        other.push(wrong);
      }
      if (!v) { out.push({ sb: sb.id, name: L.name, err: 'spawn' }); continue; }
      const pa = v.ai && v.ai.path, gt = pa && pa.gates[0];
      out.push({ sb: sb.id, name: L.name, took, merged, via, over: +maxOff.toFixed(2), ...(other.length ? { other } : {}), ...(merged ? {} : { at: v.ai ? [Math.round(v.pos.x), Math.round(v.pos.z)] : null, mode: v.ai && v.ai.mode, sp: v.ai && +v.ai.speed.toFixed(1), left: pa && Math.round(pa.len - pa.d), gate: gt ? { d: +(gt.d - pa.d).toFixed(1), rb: !!gt.rb, blocked: tr.gateBlocked(v, gt) } : null, near: g.vehicles.list.filter(o => o !== v && Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z) < 14).map(o => [o.type, Math.round(o.pos.x - v.pos.x), Math.round(o.pos.z - v.pos.z), !!o.parked, o.ai ? o.ai.mode : null]), player: [Math.round(g.player.pos.x - v.pos.x), Math.round(g.player.pos.z - v.pos.z)] }) });
    }
  }
  return out;
});
check('traffic turns into every rebuilt district, keeps to the streets and comes back out (onto the lattice, or on its route onto the island roads)', T.length >= 3 && T.every(t => t.took && t.merged && t.over < 0.5), JSON.stringify(T));
// ---- the city's roundabouts (a rebuilt district's rings: Exchange Circus): one way round in the graph and the GPS,
// and traffic that goes round them with no deadlock, nobody the wrong way, nobody through anybody
const RBS = await page.evaluate(async () => {
  const g = window.game, P = window.__pv, RG = P.RoadGraph, out = [];
  for (const RB of P.CITY_RINGS) {
    const ring = RG.edges.filter(e => e.roundabout === RB), nodes = new Set(ring.flatMap(e => [e.a, e.b]));
    const loop = ring.length >= 3 && [...nodes].every(n => ring.filter(e => e.b === n).length === 1 && ring.filter(e => e.a === n).length === 1);
    const legE = [...new Set([...nodes].flatMap(n => n.edges.filter(x => !x.e.oneway).map(x => x.e)))];
    let routes = 0, ok = 0, wrong = 0;
    for (const A of legE) for (const B of legE) if (A !== B) { const pa = RG.pointAt(A, A.len / 2), pb = RG.pointAt(B, B.len / 2), rt = RG.route(pa[0], pa[1], pb[0], pb[1]); routes++; if (rt) { ok++; if (rt.steps.some(st => st.e.oneway && st.dir !== 0)) wrong++; } }
    g.events.cool = 1e9; g.police.enabled = false; g.peds.target = 0;
    for (const v of g.traffic.cars.slice()) g.vehicles.despawn(v);
    g.resetPlayerState(RB.x + 60, RB.z + 60, 0); g.traffic.target = 30; g.traffic.linkChance = 1;
    const band = v => Math.abs(Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) - RB.r) < RB.w / 2 + 0.5, still = new Map(), seen = new Set();
    const ex = []; let right = 0, wrongWay = 0, stuck = 0, over = 0;
    for (let k = 0; k < 150 * 20; k++) {
      g.update(0.05, 0.05);
      for (const v of g.traffic.cars) {
        const sv = v.speed < 0.3 ? (still.get(v) || 0) + 0.05 : 0; still.set(v, sv); if (Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) < 80) stuck = Math.max(stuck, sv);
        if (band(v)) { seen.add(v); const a = Math.atan2(v.pos.z - RB.z, v.pos.x - RB.x), tx = Math.sin(a), tz = -Math.cos(a), vx = Math.sin(v.h) * v.speed, vz = Math.cos(v.h) * v.speed, vt = vx * tx + vz * tz, vr = vx * Math.cos(a) + vz * Math.sin(a); if (v.speed > 1.5 && Math.abs(vr) < 0.5 * Math.abs(vt)) { if (vt > 0) right++; else wrongWay++; } }
      }
      if (k % 20 === 0) { const L = g.traffic.cars.filter(v => Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) < 80); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.hypot(L[i].pos.x - L[j].pos.x, L[i].pos.z - L[j].pos.z) < 1.6) { over++; if (ex.length < 6) { const f = v => [v.type, Math.round(v.pos.x - RB.x), Math.round(v.pos.z - RB.z), +v.speed.toFixed(1), v.ai && v.ai.mode, v.ai && v.ai.gateWait ? 1 : 0]; ex.push([k, f(L[i]), f(L[j])]); } } }
    }
    out.push({ id: RB.id, edges: ring.length, loop, legs: legE.length, routes, ok, wrong, ring: seen.size, right, wrongWay, stuck: +stuck.toFixed(1), over, ...(over ? { ex } : {}) });
  }
  return out;
});
check('the city has its roundabouts (Exchange Circus)', RBS.length >= 1, JSON.stringify(RBS.map(r => r.id)));
for (const r of RBS) {
  check(`${r.id}: a closed one-way ring, its legs on it, the GPS only ever the right way round`, r.loop && r.legs >= 3 && r.ok === r.routes && r.wrong === 0, JSON.stringify(r));
  check(`${r.id}: traffic goes round it: nobody the wrong way, no deadlock, nobody through anybody`, r.ring >= 6 && r.right > 300 && r.wrongWay === 0 && r.stuck < 40 && r.over <= 3, JSON.stringify(r));
}
check('the road graph is one network', R.reach === R.nodes, `${R.reach}/${R.nodes}`);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'rebuild');
