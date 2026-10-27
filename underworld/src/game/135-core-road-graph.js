/* =====================================================================
   [CORE] ROAD GRAPH (the Curved Roads pass)
   Every drivable road in one graph: the lattice's open segments, the curved links and spurs, the
   extensions' routes and their loops. Each road comes in as a polyline (a chain). Wherever the end
   of one chain lies on another (a link's end on a lattice segment, a track's end on a spur, one lane
   meeting another part way along) the host is split there, so the junctions come from the geometry
   itself: T-junctions at any angle, Y-junctions and shallow merges, crossings, link-to-link joins.
   Edges keep their polylines, so a route is as long as the road it follows and every consumer (the
   GPS and both maps, AI drivers, traffic, taxis, police, spawns) follows the same curve.
   The lattice (RoadNet) does not change: signals, lane traffic, races and saves still use it, and
   its segments are edges here like any other road.
   ===================================================================== */
const RG_EPS = 0.75, RG_CELL = 16;
// road kinds: 'grid' (a lattice segment or part of one), 'link' (a curved through-road), 'spur' (a road with a
// free end: the causeway, the land bridge track), 'ext' (an extension's own routes), 'loop' (a circuit or course)
const RG_STREETS = new Set(['grid', 'link', 'spur', 'ext']);
const RoadGraph = {
  ready: false, nodes: [], edges: [], segAtt: new Map(),
  _cells: new Map(), _segE: null, _segK: null, _stamp: null, _q: 0,
  build(world) {
    this.ready = false; this._walk = null;
    const chains = [];
    for (let a = 0; a < 2; a++) for (let line = 0; line <= N; line++) for (let seg = 0; seg < N; seg++) {
      if (!RoadNet.segOpen(a, line, seg)) continue;
      const p0 = a === 0 ? [line * P, seg * P] : [seg * P, line * P], p1 = a === 0 ? [line * P, (seg + 1) * P] : [(seg + 1) * P, line * P];
      chains.push({ pts: [p0, p1], w: ROAD_HALF * 2, kind: 'grid', name: a === 0 ? STREET_NAMES_X[line] : STREET_NAMES_Z[line], lat: { axis: a, line, seg }, traffic: true });
    }
    for (const L of Links.list) {
      // a link's ends meet the lattice road on its centreline (the attach point), so the junction is a point the
      // two roads share
      const pts = L.pts.map(q => [q[0], q[1]]), e0 = L.ends[0], e1 = L.ends[1], last = pts[pts.length - 1];
      if (!e0.onLink && Math.hypot(pts[0][0] - e0.C.x, pts[0][1] - e0.C.z) > 0.01) pts.unshift([e0.C.x, e0.C.z]);
      if (!L.spur && !e1.onLink && Math.hypot(last[0] - e1.C.x, last[1] - e1.C.z) > 0.01) pts.push([e1.C.x, e1.C.z]);
      chains.push({ pts, w: L.w, kind: L.spur ? 'spur' : 'link', name: L.name, link: L, st: L.road.st || L.road.mat || 'asphalt', ring: L.spur ? L.ring : null, traffic: true });
    }
    for (const X of world.exts || []) {
      X.roads.forEach((r, k) => chains.push({ pts: r.map(q => [q[0], q[1]]), w: 7, kind: 'ext', ext: X.id, name: X.name || X.id, traffic: !!(X.traffic && X.traffic.includes(k)) }));
      if (X.loop) chains.push({ pts: X.loop.pts.map(q => [q[0], q[1]]), closed: true, w: 12, kind: 'loop', ext: X.id, name: X.loopName || X.id, traffic: false });
    }
    this._split(chains);
    this._index();
    this._exitDist();
    this.ready = true;
    this.buildCuts();
    world.roadGraph = this;
  },
  // ---------------------------------------------------------------- building
  _split(chains) {
    const cell = v => Math.floor(v / RG_CELL), key = (cx, cz) => (cx + 1000) * 4096 + (cz + 1000);
    // segments of every chain, by cell
    const segs = new Map();
    chains.forEach((c, ci) => {
      const n = c.pts.length, m = c.closed ? n : n - 1;
      for (let k = 0; k < m; k++) {
        const a = c.pts[k], b = c.pts[(k + 1) % n];
        for (let cx = cell(Math.min(a[0], b[0]) - RG_EPS); cx <= cell(Math.max(a[0], b[0]) + RG_EPS); cx++) for (let cz = cell(Math.min(a[1], b[1]) - RG_EPS); cz <= cell(Math.max(a[1], b[1]) + RG_EPS); cz++) {
          const kk = key(cx, cz); if (!segs.has(kk)) segs.set(kk, []); segs.get(kk).push(ci, k);
        }
      }
    });
    // split points: every open chain's two ends, and wherever such an end lies on another chain
    const splits = chains.map(() => []);
    chains.forEach((c, ci) => {
      if (c.closed) return;
      for (const end of [0, 1]) {
        const E = end ? c.pts[c.pts.length - 1] : c.pts[0];
        let snap = null;
        const list = segs.get(key(cell(E[0]), cell(E[1]))) || [];
        for (let q = 0; q < list.length; q += 2) {
          const cj = list[q], k = list[q + 1]; if (cj === ci) continue;
          const H = chains[cj], n = H.pts.length, a = H.pts[k], b = H.pts[(k + 1) % n];
          const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const t = clamp(((E[0] - a[0]) * dx + (E[1] - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t;
          if (Math.hypot(E[0] - px, E[1] - pz) > RG_EPS) continue;
          splits[cj].push({ s: k + t, x: px, z: pz });
          if (!snap) snap = [px, pz];
        }
        // the end itself, moved onto the road it meets (so the two share the junction point exactly)
        if (snap) { if (end) c.pts[c.pts.length - 1] = snap; else c.pts[0] = snap; }
        const P2 = end ? c.pts[c.pts.length - 1] : c.pts[0];
        splits[ci].push({ s: end ? c.pts.length - 1 : 0, x: P2[0], z: P2[1] });
      }
    });
    // nodes: split points closer than RG_EPS are one node
    const nodes = [], nh = new Map(), nk = v => Math.floor(v / 2);
    const nodeAt = (x, z) => {
      for (let cx = nk(x) - 1; cx <= nk(x) + 1; cx++) for (let cz = nk(z) - 1; cz <= nk(z) + 1; cz++) for (const n of nh.get(key(cx, cz)) || []) if (Math.hypot(n.x - x, n.z - z) <= RG_EPS) return n;
      const n = { id: nodes.length, x, z, edges: [], lat: null, att: null, ring: null };
      nodes.push(n); const kk = key(nk(x), nk(z)); if (!nh.has(kk)) nh.set(kk, []); nh.get(kk).push(n);
      return n;
    };
    const edges = [];
    this.segAtt.clear();
    chains.forEach((c, ci) => {
      const n = c.pts.length, S = splits[ci];
      if (c.closed && !S.length) S.push({ s: 0, x: c.pts[0][0], z: c.pts[0][1] });
      for (const sp of S) sp.node = nodeAt(sp.x, sp.z);
      S.sort((p, q) => p.s - q.s);
      const U = []; for (const sp of S) { const l = U[U.length - 1]; if (!l || (sp.s - l.s > 1e-6 && sp.node !== l.node)) U.push(sp); }
      if (c.closed && U.length > 1 && U[U.length - 1].node === U[0].node) U.pop();
      // grid chains: what the split points are on the lattice (a node, or a point part way along the segment)
      if (c.lat) for (const sp of U) {
        if (sp.s < 1e-6 || sp.s > 1 - 1e-6) { if (!sp.node.lat) sp.node.lat = [Math.round(sp.x / P), Math.round(sp.z / P)]; }
        else if (!sp.node.att) {
          sp.node.att = { axis: c.lat.axis, line: c.lat.line, seg: c.lat.seg, along: sp.s * P, C: { x: sp.x, z: sp.z } };
          const kk = Links.key(c.lat.axis, c.lat.line, c.lat.seg); if (!this.segAtt.has(kk)) this.segAtt.set(kk, []);
          this.segAtt.get(kk).push(sp.node); this.segAtt.get(kk).sort((p, q) => p.att.along - q.att.along);
        }
      }
      if (c.ring) { const fe = U[U.length - 1]; if (fe && fe.s > n - 1 - 1e-6) fe.node.ring = c.ring; }
      const piece = (A, B, wrap) => {
        const pts = [[A.x, A.z]];
        if (!wrap) { for (let k = Math.floor(A.s) + 1; k < B.s - 1e-6; k++) if (k > A.s + 1e-6) pts.push(c.pts[k]); }
        else { for (let k = Math.floor(A.s) + 1; k < n; k++) if (k > A.s + 1e-6) pts.push(c.pts[k]); for (let k = 0; k < B.s - 1e-6; k++) pts.push(c.pts[k]); }
        pts.push([B.x, B.z]);
        const P2 = pts.filter((q, k) => k === 0 || Math.hypot(q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]) > 1e-3);
        if (P2.length < 2) return;
        const cum = new Float64Array(P2.length);
        for (let k = 1; k < P2.length; k++) cum[k] = cum[k - 1] + Math.hypot(P2[k][0] - P2[k - 1][0], P2[k][1] - P2[k - 1][1]);
        const len = cum[P2.length - 1]; if (len < 0.05) return;
        const e = { id: edges.length, a: A.node, b: B.node, pts: P2, cum, len, w: c.w, kind: c.kind, name: c.name, traffic: c.traffic, st: c.st || 'asphalt', ext: c.ext || null, link: c.link || null, lat: null };
        if (c.lat) e.lat = { axis: c.lat.axis, line: c.lat.line, seg: c.lat.seg, a0: A.s * P, a1: (wrap ? B.s + n : B.s) * P };
        const u0 = [P2[1][0] - P2[0][0], P2[1][1] - P2[0][1]], m = P2.length, u1 = [P2[m - 1][0] - P2[m - 2][0], P2[m - 1][1] - P2[m - 2][1]], l0 = Math.hypot(u0[0], u0[1]) || 1, l1 = Math.hypot(u1[0], u1[1]) || 1;
        e.t0 = [u0[0] / l0, u0[1] / l0]; e.t1 = [u1[0] / l1, u1[1] / l1];
        e.rad = this._radii(P2, cum);
        edges.push(e); A.node.edges.push({ e, end: 0 }); B.node.edges.push({ e, end: 1 });
      };
      for (let k = 0; k + 1 < U.length; k++) piece(U[k], U[k + 1], false);
      if (c.closed && U.length) piece(U[U.length - 1], U[0], true);
    });
    this.nodes = nodes; this.edges = edges;
    // each lattice segment's pieces, in order along it
    this.segEdges = new Map();
    for (const e of edges) if (e.lat) { const kk = Links.key(e.lat.axis, e.lat.line, e.lat.seg); if (!this.segEdges.has(kk)) this.segEdges.set(kk, []); this.segEdges.get(kk).push(e); }
    for (const L of this.segEdges.values()) L.sort((p, q) => p.lat.a0 - q.lat.a0);
  },
  // the bend radius at each vertex, from the circle through the points about 4 m either side (Infinity on a straight)
  _radii(pts, cum) {
    const n = pts.length, R = new Float32Array(n).fill(Infinity);
    for (let k = 1; k < n - 1; k++) {
      let a = k - 1, b = k + 1;
      while (a > 0 && cum[k] - cum[a] < 4) a--;
      while (b < n - 1 && cum[b] - cum[k] < 4) b++;
      R[k] = circR(pts[a], pts[k], pts[b]);
    }
    if (n > 2) { R[0] = R[1]; R[n - 1] = R[n - 2]; }
    return R;
  },
  _index() {
    const segE = [], segK = [];
    this._cells.clear();
    const cell = v => Math.floor(v / RG_CELL);
    for (const e of this.edges) for (let k = 0; k < e.pts.length - 1; k++) {
      const a = e.pts[k], b = e.pts[k + 1], id = segE.length; segE.push(e.id); segK.push(k);
      for (let cx = cell(Math.min(a[0], b[0])); cx <= cell(Math.max(a[0], b[0])); cx++) for (let cz = cell(Math.min(a[1], b[1])); cz <= cell(Math.max(a[1], b[1])); cz++) {
        const kk = (cx + 1000) * 4096 + (cz + 1000); let L = this._cells.get(kk); if (!L) this._cells.set(kk, L = []); L.push(id);
      }
    }
    this._segE = Int32Array.from(segE); this._segK = Int32Array.from(segK); this._stamp = new Uint32Array(segE.length); this._q = 0;
    const E2 = this.edges.length * 2;
    this._dist = new Float64Array(E2); this._prev = new Int32Array(E2); this._done = new Uint8Array(E2);
  },
  // how far each node is from a junction with the lattice over the roads traffic drives (cars walking the curved
  // roads use it to find their way back)
  _exitDist() {
    const d = new Float64Array(this.nodes.length).fill(Infinity), heap = new RGHeap();
    for (const n of this.nodes) if (n.att) { d[n.id] = 0; heap.push(n.id, 0); }
    while (heap.n) {
      const [u, du] = heap.pop(); if (du > d[u]) continue;
      for (const { e } of this.nodes[u].edges) {
        if (e.kind === 'grid' || !e.traffic) continue;
        const v = e.a.id === u ? e.b.id : e.a.id, nd = du + e.len;
        if (nd < d[v]) { d[v] = nd; heap.push(v, nd); }
      }
    }
    for (const n of this.nodes) n.exitD = d[n.id];
  },
  // ---------------------------------------------------------------- queries
  // a point on edge e, `d` metres from its first point: [x, z, tx, tz] (tx, tz: the unit direction of the road there)
  pointAt(e, d) {
    const c = e.cum, n = c.length; d = clamp(d, 0, e.len);
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    const a = e.pts[lo], b = e.pts[hi], l = c[hi] - c[lo] || 1, t = (d - c[lo]) / l, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx, tz];
  },
  // the part of edge e from d0 to d1 metres along it, in that order (either way round)
  slice(e, d0, d1) {
    const out = [], a = this.pointAt(e, d0), b = this.pointAt(e, d1);
    out.push([a[0], a[1]]);
    if (d1 >= d0) { for (let k = 0; k < e.pts.length; k++) if (e.cum[k] > d0 + 1e-6 && e.cum[k] < d1 - 1e-6) out.push(e.pts[k]); }
    else { for (let k = e.pts.length - 1; k >= 0; k--) if (e.cum[k] < d0 - 1e-6 && e.cum[k] > d1 + 1e-6) out.push(e.pts[k]); }
    out.push([b[0], b[1]]);
    return out;
  },
  // the nearest point on any road: { e, k, x, z, d, along (m from the edge's first point), side (+1 right of the edge's
  // direction, -1 left) }. o.kinds: a Set of road kinds to consider (default: all); o.filter(e): any other test
  nearest(x, z, o = {}) {
    if (!this.ready) return null;
    const kinds = o.kinds || null, filter = o.filter || null, maxD = o.maxD || 600, cell = v => Math.floor(v / RG_CELL);
    const q = ++this._q, cx0 = cell(x), cz0 = cell(z);
    let best = null;
    for (let r = 0; r * RG_CELL < maxD + RG_CELL; r++) {
      if (best && (r - 1) * RG_CELL > best.d) break;
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== r) continue;
        const L = this._cells.get((cx + 1000) * 4096 + (cz + 1000)); if (!L) continue;
        for (const id of L) {
          if (this._stamp[id] === q) continue; this._stamp[id] = q;
          const e = this.edges[this._segE[id]]; if (kinds && !kinds.has(e.kind)) continue; if (filter && !filter(e)) continue;
          const k = this._segK[id], a = e.pts[k], b = e.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
          if (!best || d < best.d - 1e-9) best = { e, k, x: px, z: pz, d, along: e.cum[k] + Math.sqrt(l2) * t, side: (x - a[0]) * dz - (z - a[1]) * dx > 0 ? -1 : 1 };
        }
      }
    }
    return best && best.d <= maxD ? best : null;
  },
  // how far (x, z) is outside the surface of the nearest road around it (negative: on a road, by that much), over every
  // road within `r` m: at a junction a point can be off one road's edge and well inside another's
  surfaceDist(x, z, o = {}) {
    if (!this.ready) return Infinity;
    const r = o.r || 24, kinds = o.kinds || null, cell = v => Math.floor(v / RG_CELL), q = ++this._q;
    let best = Infinity;
    for (let cx = cell(x - r); cx <= cell(x + r); cx++) for (let cz = cell(z - r); cz <= cell(z + r); cz++) {
      const L = this._cells.get((cx + 1000) * 4096 + (cz + 1000)); if (!L) continue;
      for (const id of L) {
        if (this._stamp[id] === q) continue; this._stamp[id] = q;
        const e = this.edges[this._segE[id]]; if (kinds && !kinds.has(e.kind)) continue;
        const k = this._segK[id], a = e.pts[k], b = e.pts[k + 1], d = segDist(x, z, a[0], a[1], b[0], b[1]) - e.w / 2;
        if (d < best) best = d;
      }
    }
    // a spur's turning circle is road too
    for (const n of this.nodes) if (n.ring && Math.abs(n.ring.x - x) < r + n.ring.r && Math.abs(n.ring.z - z) < r + n.ring.r) best = Math.min(best, Math.hypot(x - n.ring.x, z - n.ring.z) - n.ring.r);
    return best;
  },
  // the cost of turning from one traversal into the next at a node (0 straight on, turnK at a right angle)
  _turn(e, dir, e2, dir2, turnK) {
    const u = dir ? [-e.t0[0], -e.t0[1]] : e.t1, w = dir2 ? [-e2.t1[0], -e2.t1[1]] : e2.t0;
    return turnK * (1 - (u[0] * w[0] + u[1] * w[1])) * 0.5;
  },
  // the shortest way by road from (fx, fz) to (tx, tz): each end joins the nearest road. o.h: the heading of a car
  // starting there (driving off backwards costs o.uturn m); o.kinds / o.filter as for nearest; o.turnK: what a right
  // angle costs (m). Returns { steps: [{ e, dir (0 along the edge, 1 against it), from, to }], len, pts: [{ x, z }],
  // s, g } (the two road points the ends joined), or null when no road joins them
  route(fx, fz, tx, tz, o = {}) {
    if (!this.ready) return null;
    const s = this.nearest(fx, fz, o), g = this.nearest(tx, tz, o); if (!s || !g) return null;
    const turnK = o.turnK ?? 8, E = this.edges, dist = this._dist, prev = this._prev, done = this._done, heap = new RGHeap();
    dist.fill(Infinity); prev.fill(-1); done.fill(0);
    const hp = dir => {
      if (o.h === undefined) return 0;
      const p = this.pointAt(s.e, s.along), sg = dir ? -1 : 1;
      // turning back costs more where the road is too narrow to turn in (a car goes round the block instead)
      return (p[2] * sg * Math.sin(o.h) + p[3] * sg * Math.cos(o.h)) < -0.2 ? (o.uturn ?? (s.e.w >= 10 ? 40 : 220)) : 0;
    };
    const gx = g.x, gz = g.z, H = n => Math.hypot(n.x - gx, n.z - gz);
    const kinds = o.kinds || null, filter = o.filter || null, ok = e => (!kinds || kinds.has(e.kind)) && (!filter || filter(e));
    let best = Infinity, bestS = -2, bestTail = 0;
    if (s.e === g.e) { const dir = g.along >= s.along ? 0 : 1; best = Math.abs(g.along - s.along) + hp(dir); bestS = -1; bestTail = dir; }
    for (const dir of [0, 1]) {
      const st = s.e.id * 2 + dir, c = (dir ? s.along : s.e.len - s.along) + hp(dir);
      dist[st] = c; heap.push(st, c + H(dir ? s.e.a : s.e.b));
    }
    while (heap.n) {
      const [st, key] = heap.pop(); if (done[st]) continue; done[st] = 1;
      if (key >= best) break;
      const e = E[st >> 1], dir = st & 1, n = dir ? e.a : e.b, c = dist[st];
      // reaching the goal's road from this node
      if (n === g.e.a) { const tot = c + this._turn(e, dir, g.e, 0, turnK) + g.along; if (tot < best) { best = tot; bestS = st; bestTail = 0; } }
      if (n === g.e.b) { const tot = c + this._turn(e, dir, g.e, 1, turnK) + g.e.len - g.along; if (tot < best) { best = tot; bestS = st; bestTail = 1; } }
      for (const inc of n.edges) {
        const e2 = inc.e; if (!ok(e2)) continue;
        const dir2 = inc.end === 0 ? 0 : 1;
        let pen;
        if (e2 === e) { if (dir2 === dir || n.edges.length > 1) continue; pen = n.ring ? 6 : 25; } // a U-turn only at a dead end
        else pen = this._turn(e, dir, e2, dir2, turnK);
        const st2 = e2.id * 2 + dir2, nc = c + pen + e2.len;
        if (nc < dist[st2]) { dist[st2] = nc; prev[st2] = st; heap.push(st2, nc + H(dir2 ? e2.a : e2.b)); }
      }
    }
    if (bestS === -2) return null;
    const steps = [];
    if (bestS === -1) steps.push({ e: s.e, dir: bestTail, from: s.along, to: g.along });
    else {
      const chain = []; for (let st = bestS; st >= 0; st = prev[st]) chain.push(st);
      chain.reverse();
      chain.forEach((st, k) => {
        const e = E[st >> 1], dir = st & 1;
        const from = k === 0 ? s.along : dir ? e.len : 0, to = dir ? 0 : e.len;
        steps.push({ e, dir, from, to });
      });
      steps.push({ e: g.e, dir: bestTail, from: bestTail ? g.e.len : 0, to: g.along });
    }
    const pts = [];
    let len = 0;
    for (const st of steps) {
      len += Math.abs(st.to - st.from);
      for (const q of this.slice(st.e, st.from, st.to)) { const l = pts[pts.length - 1]; if (!l || Math.hypot(l.x - q[0], l.z - q[1]) > 1e-6) pts.push({ x: q[0], z: q[1] }); }
    }
    return { steps: steps.filter(st => Math.abs(st.to - st.from) > 1e-6 || steps.length === 1), len, pts, s, g, cost: best };
  },
  // the lane a car drives along a list of steps: each road offset to the right of travel (o.off(e), m), the corners
  // between them rounded to about o.R m (o.maxCut caps how far back a corner starts), a U-turn round a spur's turning
  // circle or a tight loop at another dead end, resampled every o.step m and lightly smoothed.
  // Returns { pts: [[x, z]], cum, rad (the bend radius at each point), marks (where each step's lane starts, m) }
  lane(steps, o = {}) {
    const offOf = o.off || (e => Math.min(LANE * 0.7, e.w / 4)), R0 = o.R ?? 10, step = o.step ?? 2;
    const pcs = [];
    steps.forEach((st, si) => {
      const raw = this.slice(st.e, st.from, st.to); if (raw.length < 2) return;
      const q = offsetLine(raw, offOf(st.e)), len = lineLen(q);
      if (len < 0.3 && pcs.length) return;
      pcs.push({ q, st, len, si });
    });
    if (!pcs.length) return null;
    // join the pieces: trim each corner back and bridge it with a curve
    const out = [], marks = [];
    let cur = pcs[0].q.slice(), rawLen = 0;
    marks.push(0);
    // a curved road leaves a lattice street by a short stub from the street's centre line to the kerb, then turns onto
    // its own line: the stub is part of the junction, and the corner is turned straight onto the road's own line
    const stub = q => q.length > 2 && Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) > 3 && (() => { const u = unit2(q[0], q[1]), v = unit2(q[1], q[2]); return u[0] * v[0] + u[1] * v[1] < 0.99; })();
    for (let k = 1; k < pcs.length; k++) {
      let A = cur, B = pcs[k].q;
      const nd = pcs[k - 1].st.dir ? pcs[k - 1].st.e.a : pcs[k - 1].st.e.b;
      if (nd.att && pcs[k].st.e.kind !== 'grid' && stub(B)) B = B.slice(1);
      if (nd.att && pcs[k - 1].st.e.kind !== 'grid' && stub(A.slice().reverse())) A = A.slice(0, -1);
      const nA = A.length;
      const ta = unit2(A[nA - 2], A[nA - 1]), tb = unit2(B[0], B[1]);
      const th = Math.acos(clamp(ta[0] * tb[0] + ta[1] * tb[1], -1, 1));
      const node = pcs[k - 1].st.dir ? pcs[k - 1].st.e.a : pcs[k - 1].st.e.b;
      if (th < 0.06) { out.push(...A.slice(0, -1)); rawLen += lineLen(A); marks.push(rawLen); cur = B.slice(); if (Math.hypot(B[0][0] - A[nA - 1][0], B[0][1] - A[nA - 1][1]) > 0.5) cur.unshift(A[nA - 1]); continue; }
      let bridge;
      const lenA = lineLen(A), lenB = lineLen(B);
      if (th > 2.6) {
        // a U-turn: round the turning circle when the road has one, else a tight loop beyond the end
        const pA = A[nA - 1], pB = B[0];
        const c = node.ring ? [node.ring.x, node.ring.z] : [(pA[0] + pB[0]) / 2 + ta[0] * 3, (pA[1] + pB[1]) / 2 + ta[1] * 3];
        const r = node.ring ? node.ring.r : Math.max(3, Math.hypot(pA[0] - c[0], pA[1] - c[1]));
        bridge = arcVia(pA, pB, c, r, ta);
        out.push(...A.slice(0, -1)); out.push(pA, ...bridge); rawLen += lenA; marks.push(rawLen + lineLen([pA, ...bridge, pB])); rawLen += lineLen([pA, ...bridge, pB]);
        cur = B.slice();
        continue;
      }
      // how far back the corner starts: about R0 m of radius, but no further than keeps the curve's apex (a quarter of
      // the way into the corner along its bisector) 1.6 m inside the road surface on the inside of the turn
      const eA = pcs[k - 1].st.e, eB = pcs[k].st.e, s2 = Math.max(0.2, Math.sin(th / 2));
      const room = Math.min(eA.w / 2 - offOf(eA), eB.w / 2 - offOf(eB)) / s2 - 1.6, lMax = Math.max(1.2, room / (0.5 * s2));
      const cut = clamp(R0 * Math.tan(Math.min(th, 2.4) / 2), 1.2, Math.min(o.maxCut ?? 14, lenA * 0.45, lenB * 0.45, lMax));
      const A2 = trimEnd(A, cut), B2 = trimStart(B, cut), p0 = A2[A2.length - 1], p2 = B2[0];
      // the control point: where the two lane lines meet (the middle of the gap if they don't, ahead of both)
      let ctl = lineX(p0, ta, p2, tb);
      if (!ctl || (ctl[0] - p0[0]) * ta[0] + (ctl[1] - p0[1]) * ta[1] < 0 || (p2[0] - ctl[0]) * tb[0] + (p2[1] - ctl[1]) * tb[1] < 0) ctl = [(A[nA - 1][0] + B[0][0]) / 2, (A[nA - 1][1] + B[0][1]) / 2];
      const m = Math.max(3, Math.ceil(cut * 2 / 1.5));
      bridge = []; for (let i = 1; i < m; i++) { const t = i / m, u = 1 - t; bridge.push([u * u * p0[0] + 2 * u * t * ctl[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * ctl[1] + t * t * p2[1]]); }
      out.push(...A2, ...bridge);
      rawLen += lineLen(A2) + lineLen([p0, ...bridge, p2]); marks.push(rawLen);
      cur = B2;
    }
    out.push(...cur); rawLen += lineLen(cur);
    // resample, smooth (the ends stay put) and measure
    let pts = resample(out, step);
    for (let it = 0; it < 2; it++) { const q = pts.map(p => p.slice()); for (let k = 1; k < pts.length - 1; k++) { q[k][0] = pts[k][0] + 0.25 * (pts[k - 1][0] + pts[k + 1][0] - 2 * pts[k][0]); q[k][1] = pts[k][1] + 0.25 * (pts[k - 1][1] + pts[k + 1][1] - 2 * pts[k][1]); } pts = q; }
    const cum = new Float64Array(pts.length); for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    // marks by step: where each step's lane starts (a step too short to draw starts where the next one does)
    const sc = rawLen > 0 ? cum[pts.length - 1] / rawLen : 1, bySt = [];
    for (let si = 0, p = 0; si < steps.length; si++) { while (p < pcs.length - 1 && pcs[p].si < si) p++; bySt.push((pcs[p].si >= si ? marks[p] : rawLen) * sc); }
    return { pts, cum, rad: this._radii(pts, cum), marks: bySt, len: cum[pts.length - 1] };
  },
  // lattice pieces of one segment between two distances along it (from its lower node), as steps
  gridSteps(axis, line, seg, a0, a1) {
    const out = [], up = a1 >= a0, es = this.segEdges.get(Links.key(axis, line, seg)) || [];
    for (const e of up ? es : es.slice().reverse()) {
      const lo = Math.max(Math.min(a0, a1), e.lat.a0), hi = Math.min(Math.max(a0, a1), e.lat.a1); if (hi - lo < 1e-6) continue;
      out.push(up ? { e, dir: 0, from: lo - e.lat.a0, to: hi - e.lat.a0 } : { e, dir: 1, from: hi - e.lat.a0, to: lo - e.lat.a0 });
    }
    return out;
  },
  // places a car can join a road, every ~`every` m of the roads that pass `test`, in both lanes: [{ x, z, h, e }]
  spots(test, every = 20) {
    const out = [];
    for (const e of this.edges) {
      if (!test(e)) continue;
      const off = Math.min(LANE * 0.8, e.w / 4);
      for (let d = Math.min(e.len / 2, 8); d < e.len - 4; d += every) {
        const [x, z, tx, tz] = this.pointAt(e, d), h = Math.atan2(tx, tz);
        out.push({ x: x - tz * off, z: z + tx * off, h, e }, { x: x + tz * off, z: z - tx * off, h: h + Math.PI, e });
      }
    }
    return out;
  }
};
// a small binary heap of (id, key) pairs
class RGHeap {
  constructor() { this.id = []; this.k = []; this.n = 0; }
  push(id, k) {
    let i = this.n++; this.id[i] = id; this.k[i] = k;
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= k) break; this.id[i] = this.id[p]; this.k[i] = this.k[p]; i = p; }
    this.id[i] = id; this.k[i] = k;
  }
  pop() {
    const id = this.id[0], k = this.k[0], n = --this.n;
    if (n > 0) {
      const lid = this.id[n], lk = this.k[n]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= lk) break; this.id[i] = this.id[c]; this.k[i] = this.k[c]; i = c; }
      this.id[i] = lid; this.k[i] = lk;
    }
    return [id, k];
  }
}
// ---------------------------------------------------------------- polyline helpers
// the radius of the circle through three points (Infinity when they are in a line)
function circR(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const A2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return A2 < 1e-9 ? Infinity : ab * bc * ca / (2 * A2);
}
function unit2(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
function lineLen(q) { let l = 0; for (let k = 1; k < q.length; k++) l += Math.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]); return l; }
// a polyline moved `off` m to the right of its direction of travel (mitred at the vertices, the mitre capped)
function offsetLine(q, off) {
  const n = q.length, out = [];
  for (let k = 0; k < n; k++) {
    const t0 = k > 0 ? unit2(q[k - 1], q[k]) : null, t1 = k < n - 1 ? unit2(q[k], q[k + 1]) : null;
    let tx, tz, m = 1;
    if (t0 && t1) { tx = t0[0] + t1[0]; tz = t0[1] + t1[1]; const l = Math.hypot(tx, tz); if (l < 1e-6) { tx = t1[0]; tz = t1[1]; } else { tx /= l; tz /= l; m = Math.min(2, 1 / Math.max(0.5, tx * t1[0] + tz * t1[1])); } }
    else { const t = t0 || t1; tx = t[0]; tz = t[1]; }
    out.push([q[k][0] - tz * off * m, q[k][1] + tx * off * m]);
  }
  return out;
}
function trimEnd(q, d) {
  let rem = d;
  for (let k = q.length - 1; k > 0; k--) {
    const l = Math.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]);
    if (l >= rem) { const t = (l - rem) / (l || 1); return [...q.slice(0, k), [q[k - 1][0] + (q[k][0] - q[k - 1][0]) * t, q[k - 1][1] + (q[k][1] - q[k - 1][1]) * t]]; }
    rem -= l;
  }
  return [q[0], q[0]];
}
function trimStart(q, d) { return trimEnd(q.slice().reverse(), d).reverse(); }
// where the line through a along u meets the line through b along v (null if they are parallel)
function lineX(a, u, b, v) {
  const den = u[0] * v[1] - u[1] * v[0]; if (Math.abs(den) < 1e-6) return null;
  const t = ((b[0] - a[0]) * v[1] - (b[1] - a[1]) * v[0]) / den;
  return [a[0] + u[0] * t, a[1] + u[1] * t];
}
// points every `step` m along a polyline (its two ends kept)
function resample(q, step) {
  const out = [q[0].slice()]; let carry = 0;
  for (let k = 1; k < q.length; k++) {
    const a = q[k - 1], b = q[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-9) continue;
    let d = step - carry;
    while (d < l) { const t = d / l; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    carry = l - (d - step);
  }
  const last = q[q.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.35) out.push(last.slice()); else out[out.length - 1] = last.slice();
  return out;
}
// an arc of radius r round c from a toward b, the way that sweeps through direction `fwd` (the far side of a turn)
function arcVia(a, b, c, r, fwd) {
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), af = Math.atan2(fwd[1], fwd[0]);
  let a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  // which way round passes the far side (af)?
  const ccw = (((af - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < (((a1 - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (ccw) { while (a1 <= a0) a1 += 2 * Math.PI; } else { while (a1 >= a0) a1 -= 2 * Math.PI; }
  const m = Math.max(6, Math.ceil(Math.abs(a1 - a0) * r / 1.5)), out = [];
  for (let i = 1; i < m; i++) { const t = a0 + (a1 - a0) * i / m; out.push([c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r]); }
  return out;
}
// ---------------------------------------------------------------- kerb cuts
// Where a curved road leaves a lattice street the kerb (the block's 15 cm slab edge) is cut: a ramp in the gutter, 1.4 m
// wide, rises from the road to the kerb top across the mouth of the road (a metre of flare each side), so a car drives
// on and off the curved roads without a step. The ground (groundBase) and the drawn ramp are the same plane.
const CUT_W = 1.4;
const CurbCuts = {
  n: 0, list: [], bySeg: new Map(),
  // the ramp's height at a point on a lattice road (0 off the ramps)
  at(x, z) {
    const i = Math.round(x / P), j = Math.round(z / P), dv = x - i * P, dh = z - j * P, g0 = ROAD_HALF - CUT_W;
    let axis, line, off, seg, along;
    if (Math.abs(dv) > g0 && Math.abs(dv) < ROAD_HALF && Math.abs(dh) >= ROAD_HALF) { axis = 0; line = i; off = dv; seg = Math.floor(z / P); along = z - seg * P; }
    else if (Math.abs(dh) > g0 && Math.abs(dh) < ROAD_HALF && Math.abs(dv) >= ROAD_HALF) { axis = 1; line = j; off = dh; seg = Math.floor(x / P); along = x - seg * P; }
    else return 0;
    const L = this.bySeg.get(axis * 10000 + line * 100 + seg); if (!L) return 0;
    for (const c of L) if ((off > 0 ? 1 : -1) === c.side && along >= c.a0 && along <= c.a1) return CURB_H * (Math.abs(off) - g0) / CUT_W;
    return 0;
  }
};
RoadGraph.buildCuts = function () {
  CurbCuts.n = 0; CurbCuts.list = []; CurbCuts.bySeg.clear();
  for (const n of this.nodes) if (n.att) for (const inc of n.edges) {
    const e = inc.e; if (e.kind === 'grid') continue;
    const at = n.att, out = inc.end === 0, ofs = p => at.axis === 0 ? p[0] - at.line * P : p[1] - at.line * P, alg = p => at.axis === 0 ? p[1] - at.seg * P : p[0] - at.seg * P;
    const q = out ? this.slice(e, 0, Math.min(e.len, 30)) : this.slice(e, e.len, Math.max(0, e.len - 30));
    const side = ofs(q[q.length - 1]) > 0 ? 1 : -1;
    // only where the ground beside the street is the kerb (the promenade's gaps and the extensions are at road level)
    const pr = at.axis === 0 ? [at.line * P + side * (ROAD_HALF + 1), at.C.z] : [at.C.x, at.line * P + side * (ROAD_HALF + 1)];
    if (groundBase(pr[0], pr[1]) < CURB_H * 0.5) continue;
    // where the road's two edges cross the kerb line: the mouth
    let a0 = Infinity, a1 = -Infinity;
    for (const s of [-1, 1]) {
      const b = offsetLine(q, s * e.w / 2), tgt = side * ROAD_HALF;
      for (let k = 0; k < b.length - 1; k++) {
        const o0 = ofs(b[k]), o1 = ofs(b[k + 1]); if ((o0 - tgt) * (o1 - tgt) > 0 || o0 === o1) continue;
        const t = (tgt - o0) / (o1 - o0), al = alg([b[k][0] + (b[k + 1][0] - b[k][0]) * t, b[k][1] + (b[k + 1][1] - b[k][1]) * t]);
        a0 = Math.min(a0, al); a1 = Math.max(a1, al); break;
      }
    }
    if (!isFinite(a0)) continue;
    const c = { axis: at.axis, line: at.line, seg: at.seg, side, a0: a0 - 1, a1: a1 + 1, e: e.id }, key = c.axis * 10000 + c.line * 100 + c.seg;
    CurbCuts.list.push(c); if (!CurbCuts.bySeg.has(key)) CurbCuts.bySeg.set(key, []); CurbCuts.bySeg.get(key).push(c);
  }
  CurbCuts.n = CurbCuts.list.length;
};
// the ramp's shape: across x 0 (the gutter, road level) to 1 (the kerb, its top), along z -0.5..0.5, up y (the top is y = x)
let _wedgeTpl = null;
function wedgeTemplate() {
  if (_wedgeTpl) return _wedgeTpl;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.5, 1, 1, 0.5, 1, 1, -0.5, 0, 0, -0.5, 0, 0, 0.5, 1, 1, 0.5,   // the slope
    0, 0, -0.5, 1, 1, -0.5, 1, 0, -0.5,                                  // the two flanks
    0, 0, 0.5, 1, 0, 0.5, 1, 1, 0.5
  ], 3));
  g.computeVertexNormals();
  return (_wedgeTpl = templateFrom(g));
}
function addCurbCuts(gs) {
  for (const c of CurbCuts.list) {
    const len = c.a1 - c.a0, mid = (c.a0 + c.a1) / 2, g0 = ROAD_HALF - CUT_W;
    if (c.axis === 0) gs.add(wedgeTemplate(), M(c.line * P + c.side * g0, 0.004, c.seg * P + mid, CUT_W, CURB_H - 0.004, len, c.side > 0 ? 0 : Math.PI), null);
    else gs.add(wedgeTemplate(), M(c.seg * P + mid, 0.004, c.line * P + c.side * g0, CUT_W, CURB_H - 0.004, len, c.side > 0 ? -Math.PI / 2 : Math.PI / 2), null);
  }
}
// ---------------------------------------------------------------- road markings on the curved streets
// Painted lines as thin ribbons a centimetre above the road (one mesh, one draw call): the centre line follows the curve
// (a double yellow line, or the Old Quarter's dashed white one; faded in the industrial districts), and a dashed give-way
// line crosses the lane that meets another road. Only on asphalt streets; never inside a lattice road or a junction.
function buildRoadMarkings(scene) {
  const pos = [], col = [], idx = [];
  const Y = CURB_H + 0.012, YEL = [0.7, 0.53, 0.13], WHT = [0.78, 0.78, 0.76];
  const ribbon = (q, off, wd, c) => {
    if (q.length < 2) return;
    const L = offsetLine(q, off), base = pos.length / 3;
    for (let k = 0; k < L.length; k++) {
      const t = k < L.length - 1 ? unit2(L[k], L[k + 1]) : unit2(L[k - 1], L[k]), nx = -t[1] * wd / 2, nz = t[0] * wd / 2;
      pos.push(L[k][0] - nx, Y, L[k][1] - nz, L[k][0] + nx, Y, L[k][1] + nz); col.push(...c, ...c);
      if (k) { const a = base + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  // the stretches of each street that are clear of junctions, as [from, to] distances along its polyline
  const R = RoadGraph;
  for (const L of Links.list) {
    if (L.spur || (L.road.st || 'asphalt') !== 'asphalt') continue;
    const pts = L.pts, cum = L.cum, near = [];
    for (const e of L.ends) if (e.onLink) { const H = Links.list.find(h => h.name === e.onLink && Links.nearestOn(h, e.C.x, e.C.z).d < 0.6); near.push([e.C.x, e.C.z, (H ? H.w : 8) / 2 + 1.6]); }
    // where another street meets this one part way along (a Y-junction on it)
    for (const M2 of Links.list) for (const e of M2.ends) if (e.onLink === L.name && Links.nearestOn(L, e.C.x, e.C.z).d < 0.6) near.push([e.C.x, e.C.z, M2.w / 2 + 2.5]);
    const ok = k => !RoadNet.roadAt(pts[k][0], pts[k][1]) && Math.min(Math.abs(pts[k][0] - Math.round(pts[k][0] / P) * P), Math.abs(pts[k][1] - Math.round(pts[k][1] / P) * P)) > ROAD_HALF + 1.4 && near.every(n => Math.hypot(pts[k][0] - n[0], pts[k][1] - n[1]) > n[2]);
    const runs = []; let s = -1;
    for (let k = 0; k < pts.length; k++) { if (ok(k) && s < 0) s = k; if ((!ok(k) || k === pts.length - 1) && s >= 0) { const e2 = ok(k) ? k : k - 1; if (e2 > s) runs.push([s, e2]); s = -1; } }
    const mid = pts[Math.floor(pts.length / 2)], style = ROAD_STYLE[zoneKey(mid[0], mid[1])] || 0;
    for (const [k0, k1] of runs) {
      const q = pts.slice(k0, k1 + 1);
      if (style === 1) {
        // the Old Quarter's dashed white line: 3 m of paint, 1.5 m gap
        const qc = cum.slice(k0, k1 + 1);
        for (let d = qc[0] + 0.5; d < qc[qc.length - 1] - 0.5; d += 4.5) ribbon(cutLine(q, qc, d, Math.min(d + 3, qc[qc.length - 1] - 0.5)), 0, 0.12, WHT);
      } else {
        const c = style === 3 ? YEL.map(v => v * 0.75) : YEL;
        ribbon(q, -0.17, 0.11, c); ribbon(q, 0.17, 0.11, c);
      }
    }
  }
  // give-way lines: across the lane that comes up to a lattice street or another street, just short of it
  for (const n of R.nodes) {
    const minor = [];
    if (n.att) for (const inc of n.edges) if (inc.e.kind === 'link') minor.push(inc);
    for (const inc of n.edges) if (inc.e.kind === 'link' && !n.att && inc.e.link && inc.e.link.ends.some(e => e.onLink && Math.hypot(e.C.x - n.x, e.C.z - n.z) < 0.8)) minor.push(inc);
    for (const inc of minor) {
      const e = inc.e; if ((e.st || 'asphalt') !== 'asphalt') continue;
      const out = inc.end === 0, host = n.att ? null : n.edges.find(x => x.e.link !== e.link);
      // how far out from the node the road leaves its host's surface
      let d = 0;
      for (; d < Math.min(e.len - 1, 25); d += 0.25) {
        const p = R.pointAt(e, out ? d : e.len - d);
        if (n.att ? !RoadNet.roadAt(p[0], p[1]) : polyDist(p[0], p[1], host.e.pts) > host.e.w / 2) break;
      }
      const p = R.pointAt(e, out ? d + 0.6 : e.len - d - 0.6), tx = out ? p[2] : -p[2], tz = out ? p[3] : -p[3];
      // the lane toward the node is on the left of the outward direction
      const lx = tz, lz = -tx;
      for (let o = 0.25; o < e.w / 2 - 0.35; o += 0.85) {
        const a = [p[0] + lx * o, p[1] + lz * o], b = [p[0] + lx * Math.min(o + 0.5, e.w / 2 - 0.35), p[1] + lz * Math.min(o + 0.5, e.w / 2 - 0.35)];
        ribbon([a, b], 0, 0.3, WHT);
      }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((v, k) => k % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.receiveShadow = true; m.name = 'roadMarkings';
  scene.add(m);
  return m;
}
// the part of a polyline between distances d0 and d1 along it (cum: its cumulative lengths)
function cutLine(q, cum, d0, d1) {
  const at = d => { let k = 0; while (k < q.length - 2 && cum[k + 1] < d) k++; const t = (d - cum[k]) / ((cum[k + 1] - cum[k]) || 1); return [q[k][0] + (q[k + 1][0] - q[k][0]) * t, q[k][1] + (q[k + 1][1] - q[k][1]) * t]; };
  const out = [at(d0)]; for (let k = 0; k < q.length; k++) if (cum[k] > d0 && cum[k] < d1) out.push(q[k]); out.push(at(d1));
  return out;
}
// ---------------------------------------------------------------- kerb spots (save safety)
// is a car's footprint at (x, z) (on ground y) inside something solid: a building, a wall, a container, a tank?
// (its footprint as three circles along heading h; a graze, a mirror over a fence, does not count)
function kerbBlocked(world, x, z, y, h = 0) {
  const r = kerbBlocked._r || (kerbBlocked._r = {}), fx = Math.sin(h), fz = Math.cos(h);
  for (const a of [-1.3, 0, 1.3]) {
    world.grid.resolveCircle(x + fx * a, z + fz * a, 0.85, y + 0.3, y + 1.4, r);
    if (r.hit && r.col && r.col.kind !== 'prop' && r.depth > 0.25) return true;
  }
  return false;
}
// the nearest clear kerb spot to (x, z): by the nearest street, at its kerb on that side, facing the way traffic goes
// there; spots further along that street, then the lattice's kerbs, if that one is taken
function kerbSpot(world, x, z) {
  const R = RoadGraph, q = R.ready ? R.nearest(x, z, { kinds: RG_STREETS }) : null;
  if (q) for (let k = 0; k < 12; k++) {
    const d = clamp(q.along + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6.5, 0, q.e.len);
    const [px, pz, tx, tz] = R.pointAt(q.e, d), off = (q.e.lat ? 4.6 : q.e.w / 2 - 1.15) * q.side, sx = px - tz * off, sz = pz + tx * off;
    if (q.e.lat && (q.e.lat.a0 + d < 14 || q.e.lat.a0 + d > P - 14)) continue;
    const h = q.side > 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz);
    if (!kerbBlocked(world, sx, sz, groundY(sx, sz), h)) return { x: sx, z: sz, h };
  }
  const c = curbNear(x, z);
  return kerbBlocked(world, c.x, c.z, groundY(c.x, c.z), c.h) ? null : c;
}
