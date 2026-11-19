/* The island's roundabouts (the world overhaul, 2026-11-19; ISLAND.md §10).
   - Six junctions are roundabouts: each ring is a closed, one-way road (anticlockwise on the map: traffic keeps
     right), three one-way edges in the road graph, every leg ending on it; nothing else crosses its central island.
   - Every entry and exit lane (the curve a car drives from a leg onto the ring and off it) stays on the carriageway,
     clear of the central island.
   - The GPS routes across each one between every pair of legs, and only the right way round.
   - Traffic: cars enter, go round and leave; none drives the wrong way, none is stuck, none drives through another.
   - The scenery: a kerbed central island with a collider, a give-way sign at each entry. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

// ---------------------------------------------------------------- 1. the network
const net = await ev(() => {
  const P = window.__pv, RG = P.RoadGraph, I = P.Island, out = [];
  for (const RB of P.ROUNDABOUTS) {
    const ring = RG.edges.filter(e => e.roundabout === RB), nodes = new Set(ring.flatMap(e => [e.a, e.b]));
    // a closed loop: each ring node has exactly one ring edge in and one out
    const loop = [...nodes].every(n => ring.filter(e => e.b === n).length === 1 && ring.filter(e => e.a === n).length === 1);
    const legs = [...nodes].map(n => n.edges.filter(x => !x.e.oneway).length);
    // the legs come in well apart round it (metres of ring between neighbouring legs)
    const angs = [...nodes].map(n => Math.atan2(n.z - RB.z, n.x - RB.x)).sort((p, q) => p - q), spread = Math.min(...angs.map((a, i) => ((i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2) - a) * RB.r));
    // the way round: anticlockwise on the map (decreasing angle, x east, z south)
    const e0 = ring[0], p = RG.pointAt(e0, e0.len * 0.4), q = RG.pointAt(e0, e0.len * 0.6);
    const a0 = Math.atan2(p[1] - RB.z, p[0] - RB.x), a1 = Math.atan2(q[1] - RB.z, q[0] - RB.x), turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    // no road but the ring comes inside the ring's inner kerb
    let through = 0; for (const R of I.roads) if (!R.closed) for (const pt of R.pts) if (Math.hypot(pt[0] - RB.x, pt[1] - RB.z) < RB.r - RB.w / 2) through++;
    // the lanes: from each leg onto the ring, and off the ring onto each leg
    let lanes = 0, inside = 0, margin = 99;
    for (const nd of nodes) {
      const rin = ring.find(e => e.b === nd), rout = ring.find(e => e.a === nd);
      for (const x of nd.edges) {
        const L = x.e; if (L.oneway) continue;
        const toNd = L.b === nd ? 0 : 1, span = Math.min(40, L.len);
        for (const st of [[{ e: L, dir: toNd, from: toNd ? span : L.len - span, to: toNd ? 0 : L.len }, { e: rout, dir: 0, from: 0, to: rout.len }],
          [{ e: rin, dir: 0, from: 0, to: rin.len }, { e: L, dir: 1 - toNd, from: toNd ? 0 : L.len, to: toNd ? span : L.len - span }]]) {
          const ln = RG.lane(st, { off: e => Math.min(2.6, e.w / 4), R: 10, step: 2 }); lanes++;
          let mn = 99; for (const pt of ln.pts) mn = Math.min(mn, Math.hypot(pt[0] - RB.x, pt[1] - RB.z));
          margin = Math.min(margin, mn - (RB.r - RB.w / 2)); if (mn < RB.r - RB.w / 2) inside++;
        }
      }
    }
    // the GPS: from the middle of each leg to the middle of each other, only the right way round the ring
    const legE = [...new Set([...nodes].flatMap(n => n.edges.filter(x => !x.e.oneway).map(x => x.e)))];
    let routes = 0, ok = 0, wrong = 0, viaRing = 0;
    for (const A of legE) for (const B of legE) if (A !== B) {
      const pa = RG.pointAt(A, A.len / 2), pb = RG.pointAt(B, B.len / 2), rt = RG.route(pa[0], pa[1], pb[0], pb[1]); routes++;
      if (!rt) continue; ok++;
      if (rt.steps.some(st => st.e.oneway && st.dir !== 0)) wrong++;
      if (rt.steps.some(st => st.e.roundabout === RB)) viaRing++;
    }
    // level: each leg comes to the ring at the ring's own level (no step, no mound), and the last 30 m of it gently
    let step = 0, grade = 0;
    for (const R of I.roads) if (!R.closed) for (const k of [0, 1]) if (R.ends[k] === 'rb:' + RB.id) {
      const n = R.pts.length, i0 = k ? n - 1 : 0; step = Math.max(step, Math.abs(R.y[i0] - RB.y));
      for (let i = 1; i < n; i++) if (Math.abs(R.cum[i] - R.cum[i0]) < 30) { const g2 = Math.abs(R.y[i] - R.y[i - 1]) / Math.max(0.5, R.cum[i] - R.cum[i - 1]); grade = Math.max(grade, g2); }
    }
    out.push({ id: RB.id, ringEdges: ring.length, loop, legs, turn: +turn.toFixed(3), through, lanes, inside, margin: +margin.toFixed(2), routes, ok, wrong, viaRing, spread: +spread.toFixed(1), step: +step.toFixed(2), grade: +grade.toFixed(3) });
  }
  // the whole road graph is still one network
  const seen = new Set([RG.nodes[0]]), st = [RG.nodes[0]];
  while (st.length) { const n = st.pop(); for (const x of n.edges) for (const m of [x.e.a, x.e.b]) if (!seen.has(m)) { seen.add(m); st.push(m); } }
  return { rbs: out, reach: seen.size, nodes: RG.nodes.length };
});
check('six roundabouts', net.rbs.length === 6, net.rbs.map(r => r.id).join(','));
for (const r of net.rbs) {
  check(`${r.id}: the ring is a closed loop of one-way edges`, r.ringEdges >= 3 && r.loop, JSON.stringify(r));
  check(`${r.id}: its legs come in well apart (15 m of ring at least between them)`, r.spread >= 15, String(r.spread));
  check(`${r.id}: a leg at every ring node`, r.legs.length >= 3 && r.legs.every(n => n >= 1), JSON.stringify(r.legs));
  check(`${r.id}: the ring runs anticlockwise on the map`, r.turn < 0, String(r.turn));
  check(`${r.id}: no road crosses the central island`, r.through === 0, String(r.through));
  check(`${r.id}: every leg meets the ring at its level and gently`, r.step < 0.05 && r.grade < 0.08, `step ${r.step} m, grade ${r.grade}`);
  check(`${r.id}: every entry and exit lane stays off the central island`, r.lanes >= 6 && r.inside === 0 && r.margin > 2, `${r.lanes} lanes, margin ${r.margin} m`);
  check(`${r.id}: the GPS routes leg to leg, only the right way round`, r.ok === r.routes && r.wrong === 0 && r.viaRing > 0, JSON.stringify(r));
}
check('the road graph is one network', net.reach === net.nodes, `${net.reach}/${net.nodes}`);

// ---------------------------------------------------------------- 2. the scenery
const scn = await ev(() => {
  const P = window.__pv, w = window.game.world, out = [];
  for (const RB of P.ROUNDABOUTS) {
    const legs = P.Island.roads.filter(R => !R.closed && R.ends.includes('rb:' + RB.id)).reduce((n, R) => n + R.ends.filter(e => e === 'rb:' + RB.id).length, 0);
    const xb = w.xblocks.find(x => x.xb === 'rb_' + RB.id);
    const giveWay = xb ? xb.signs.filter(s => s.text === 'GIVE WAY').length : 0;
    const col = w.grid.query(RB.x - 2, RB.z - 2, RB.x + 2, RB.z + 2, []).some(c => c.kind === 'det' && c.r > 3);
    // nothing built on it: no building's footprint within the ring's outer pavement
    const R0 = RB.r + RB.w / 2 + 2.5; let built = 0;
    for (const bk of w.blocks.concat(w.xblocks || [])) for (const q of bk.bld || []) { const dx = Math.max(q.x0 - RB.x, 0, RB.x - q.x1), dz = Math.max(q.z0 - RB.z, 0, RB.z - q.z1); if (Math.hypot(dx, dz) < R0) built++; }
    out.push({ id: RB.id, legs, giveWay, col, built });
  }
  return out;
});
for (const s of scn) check(`${s.id}: central island with a collider, a give-way sign at each entry`, s.col && s.legs >= 3 && s.giveWay === s.legs, JSON.stringify(s));
for (const s of scn) check(`${s.id}: no building stands on the ring`, s.built === 0, JSON.stringify(s));

// ---------------------------------------------------------------- 3. traffic
for (const id of ['harbour', 'longshore', 'fairground']) {
  const t = await ev(([id, secs]) => {
    const g = window.game, P = window.__pv, RB = P.ROUNDABOUTS.find(q => q.id === id);
    g.events.cool = 1e9; g.police.enabled = false; g.peds.target = 0;
    for (const v of g.traffic.cars.slice()) g.vehicles.despawn(v); g.traffic.cars.length = 0;
    g.resetPlayerState(RB.x + 60, RB.z + 60, 0); g.traffic.target = 30; g.traffic.linkChance = 1;
    const band = v => Math.abs(Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) - RB.r) < RB.w / 2 + 0.5;
    const still = new Map(), seen = new Set(), left = new Set();
    let right = 0, wrong = 0, stuck = 0, over = 0;
    for (let k = 0; k < secs * 20; k++) {
      g.update(0.05, 0.05);
      for (const v of g.traffic.cars) {
        const near = Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) < 80;
        const s = v.speed < 0.3 ? (still.get(v) || 0) + 0.05 : 0; still.set(v, s); if (near) stuck = Math.max(stuck, s);
        if (band(v)) {
          seen.add(v);
          const a = Math.atan2(v.pos.z - RB.z, v.pos.x - RB.x), tx = Math.sin(a), tz = -Math.cos(a), vx = Math.sin(v.h) * v.speed, vz = Math.cos(v.h) * v.speed, vt = vx * tx + vz * tz, vr = vx * Math.cos(a) + vz * Math.sin(a);
          if (v.speed > 1.5 && Math.abs(vr) < 0.5 * Math.abs(vt)) { if (vt > 0) right++; else wrong++; }
        } else if (seen.has(v) && Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) > RB.r + 15) left.add(v);
      }
      if (k % 20 === 0) { const L = g.traffic.cars.filter(v => Math.hypot(v.pos.x - RB.x, v.pos.z - RB.z) < 80); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.hypot(L[i].pos.x - L[j].pos.x, L[i].pos.z - L[j].pos.z) < 1.6) over++; }
    }
    return { ring: seen.size, left: left.size, right, wrong, stuck: +stuck.toFixed(1), over };
  }, [id, 150]);
  check(`${id}: traffic goes round and leaves`, t.ring >= 8 && t.left >= 5 && t.right > 500, JSON.stringify(t));
  check(`${id}: nobody drives the wrong way round`, t.wrong === 0, JSON.stringify(t));
  check(`${id}: no deadlock (no car stands 40 s near it)`, t.stuck < 40, JSON.stringify(t));
  check(`${id}: cars don't drive through each other`, t.over <= 3, JSON.stringify(t));
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'roundabouts');
