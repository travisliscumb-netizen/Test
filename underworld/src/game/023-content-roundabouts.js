/* =====================================================================
   [CONTENT] ROUNDABOUTS (the world overhaul, 2026-11-19; ISLAND.md §10)
   Six junctions of the island's roads become roundabouts, where the roads
   meet the districts, the logistics park, the Sound Flats and the fair:
   - the ground under each is levelled (a pad, before the roads find their
     level), every road that crosses its circle is cut at the ring (a road
     through it becomes two legs, each ending on the ring), and the ring is
     a road of its own: closed, one-way, anticlockwise on the map (traffic
     keeps right), its id 'rb:<id>' so each leg's stop line stands at the
     ring's edge (177);
   - the road graph takes the ring's pieces as one-way edges (135): the GPS,
     AI drivers, traffic and taxis only ever go round it the right way;
     traffic entering gives way to traffic already on it (280);
   - a raised central island with a kerb, planting and a tree, give-way
     signs at each entry and a sign ahead on each approach (_genRoundabouts).
   ===================================================================== */
// [id, name, x, z, ring radius (to the carriageway's centre), carriageway width]
const ROUNDABOUTS = [
  { id: 'harbour', name: 'Harbour Circus', x: 314, z: 50, r: 17, w: 9 },
  { id: 'gardens', name: 'Gardens Circle', x: 709, z: 872, r: 16, w: 9 },
  { id: 'freight', name: 'Freight Circle', x: 747, z: 1186, r: 17, w: 9.5 },
  { id: 'longshore', name: 'Longshore Circle', x: 760, z: 1330, r: 18, w: 9.5 },
  { id: 'sound', name: 'Sound Circus', x: 1298, z: 450, r: 16, w: 9 },
  { id: 'fairground', name: 'Fairground Circle', x: 2000, z: 2049, r: 16, w: 9 }
];
// the central island's planting radius inside the ring's inner kerb
function roundaboutIsland(RB) { return RB.r - RB.w / 2 - 0.4; }
Object.assign(Island, {
  // each roundabout's level ground: the last pad (after every other, before the roads take their level: buildRoads)
  roundaboutPads() {
    if (CityLayout.id !== 'island') return;
    for (const RB of ROUNDABOUTS) { const e = RB.r + RB.w / 2 + 8; RB.y = Math.round(Math.max(this.base0(RB.x, RB.z), SEA_Y + 1.7) * 10) / 10; this.addPad(RB.x - e, RB.z - e, RB.x + e, RB.z + e, RB.y, 45); }
  },
  // cut the roads at each ring and add the rings (after every road is laid and has its level; before the index)
  applyRoundabouts() {
    if (CityLayout.id !== 'island') return;
    for (const RB of ROUNDABOUTS) {
      const cx = RB.x, cz = RB.z, r = RB.r, ringId = 'rb:' + RB.id, out = [], meets = [], cutInto = new Map();
      const inside = p => Math.hypot(p[0] - cx, p[1] - cz) < r;
      // where a segment from a (outside) to b (inside), or the other way, crosses the circle: the point and the share
      const cross = (a, b) => { let lo = 0, hi = 1; const ia = inside(a); for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, q = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inside(q) === ia) lo = m; else hi = m; } const t = (lo + hi) / 2; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t }; };
      for (const R of this.roads) {
        if (R.closed) { out.push(R); continue; }
        const n = R.pts.length, ins = R.pts.map(inside);
        if (!ins.some(Boolean)) { out.push(R); continue; }
        // the stretches outside the circle, each ending at the ring where it meets it
        const pieces = []; let s = 0;
        for (let i = 0; i < n; i++) if (ins[i]) { if (i > s) pieces.push([s, i - 1]); while (i + 1 < n && ins[i + 1]) i++; s = i + 1; }
        if (s < n) pieces.push([s, n - 1]);
        const made = pieces.map(([a, b]) => {
          const startRing = a > 0, endRing = b < n - 1, pts = [], y = [], sp = [];
          // (the leg ends exactly on the circle, where the ring has a vertex of its own: a road point within 2 m of
          // that end goes, so no sliver of a segment is left to turn the leg's last heading about)
          const c0 = startRing && cross(R.pts[a], R.pts[a - 1]), c1 = endRing && cross(R.pts[b], R.pts[b + 1]);
          const far = q => (!c0 || Math.hypot(q[0] - c0.p[0], q[1] - c0.p[1]) > 2) && (!c1 || Math.hypot(q[0] - c1.p[0], q[1] - c1.p[1]) > 2);
          if (c0) { pts.push(c0.p); y.push(RB.y); sp.push(0); meets.push(c0.p); }
          for (let k = a; k <= b; k++) if (far(R.pts[k]) || (k === a && !c0) || (k === b && !c1)) { pts.push(R.pts[k]); y.push(R.y[k]); sp.push(R.sp[k]); }
          if (c1) { pts.push(c1.p); y.push(RB.y); sp.push(0); meets.push(c1.p); }
          const cum = new Float64Array(pts.length); for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          // (the leg eases to the ring's level over its last 25 m: the road's own level where it was cut need not be
          // the ring's, and the step would stand at the give-way line)
          const RAMP = 25, ease = (iEnd, iNext, dir) => { if (pts.length < 3) return; const dy = RB.y - y[iNext]; for (let k = iNext; k >= 0 && k < pts.length; k += dir) { const d = Math.abs(cum[k] - cum[iEnd]); if (d >= RAMP) break; y[k] += dy * (1 - d / RAMP); } };
          if (c0) ease(0, 1, 1);
          if (c1) ease(pts.length - 1, pts.length - 2, -1);
          // (bridges and tunnels index the road's points: the leg keeps none of those within 2 m of the ring, and a
          // roundabout stands on level open ground, so only indices clear of the ring end are mapped)
          const off = a - (startRing ? 1 : 0), dropped = startRing ? (() => { let n2 = 0; for (let k = a; k <= b && !far(R.pts[k]); k++) n2++; return n2; })() : 0;
          const remap = L => L && L.map(q => [q[0] - off - dropped, q[1] - off - dropped]).filter(q => q[0] >= (startRing ? 1 : 0) && q[1] < pts.length - (endRing ? 1 : 0));
          return { ...R, pts, y: Float64Array.from(y), sp: Uint8Array.from(sp), cum, len: cum[pts.length - 1],
            ends: [startRing ? ringId : R.ends[0], endRing ? ringId : R.ends[1]], hosts: [startRing ? null : R.hosts[0], endRing ? null : R.hosts[1]],
            ring: endRing ? null : R.ring, bridges: remap(R.bridges), tunnel: (q => q && q.length ? q[0] : null)(remap(R.tunnel && [R.tunnel])), base: R.base || R.id, mapChunks: null };
        }).filter(P2 => P2.len > 6);
        // the longest piece keeps the road's id (its name is every piece's); the others are '<id>.<n>'
        let main = 0; made.forEach((P2, k) => { if (P2.len > made[main].len) main = k; });
        // (ids stay unique when a road is cut at more than one ring: the next free '<base>.<n>')
        cutInto.set(R, made);
        made.forEach((P2, k) => { if (k !== main) { const base = R.base || R.id; let q = 1; while (this.roads.some(o => o.id === base + '.' + q) || out.some(o => o.id === base + '.' + q)) q++; P2.id = base + '.' + q; } out.push(P2); });
      }
      // the ring: anticlockwise on the map (decreasing angle: x east, z south), every ~2 m, closed, with a vertex
      // exactly where each leg meets it (its node there is that leg's end: 020 Links, 135)
      const m = Math.max(24, Math.round(2 * Math.PI * r / 2)), TAU = Math.PI * 2, norm = a => ((a % TAU) + TAU) % TAU;
      const at = meets.map(p => norm(-Math.atan2(p[1] - cz, p[0] - cx))), angs = [...at];
      for (let k = 0; k < m; k++) { const u = k / m * TAU; if (at.every(q => Math.min(Math.abs(q - u), TAU - Math.abs(q - u)) * r > 0.7)) angs.push(u); }
      angs.sort((p, q) => p - q);
      const pts = angs.map(u => [cx + Math.cos(-u) * r, cz + Math.sin(-u) * r]); pts.push(pts[0].slice());
      const cum = new Float64Array(pts.length); for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const ringR = { id: ringId, name: RB.name, w: RB.w, grade: 0.07, deck: undefined, cut: null, ends: [ringId, ringId], ring: null, pts, hosts: [null, null], st: 'asphalt', closed: true, oneway: true, roundabout: RB, cls: 0,
        y: new Float64Array(pts.length).fill(RB.y), sp: new Uint8Array(pts.length), cum, len: cum[pts.length - 1], bridges: [], tunnel: null };
      out.push(ringR);
      // each leg's host at its ring end is the ring (the point of it the leg meets), as a road's is the road it joins
      for (const Q of out) if (Q !== ringR) for (const k of [0, 1]) if (Q.ends[k] === ringId) {
        const [hx, hz] = Q.pts[k ? Q.pts.length - 1 : 0]; let bi = 0, bd = Infinity;
        ringR.pts.forEach((q, i) => { const d = Math.hypot(q[0] - hx, q[1] - hz); if (d < bd) { bd = d; bi = i; } });
        Q.hosts = Q.hosts.slice(); Q.hosts[k] = { road: ringR, k: bi };
      }
      // every road that joins one this ring cut (its host: the road and the point it meets) now joins the piece that
      // runs past that point, at that point's index there
      for (const Q of out) Q.hosts = (Q.hosts || []).map(H => {
        const made = H && cutInto.get(H.road); if (!made) return H;
        const [hx, hz] = H.road.pts[H.k]; let best = null;
        for (const P2 of made) P2.pts.forEach((q, i) => { const d = Math.hypot(q[0] - hx, q[1] - hz); if (!best || d < best.d) best = { d, road: P2, k: i }; });
        return best && best.d < 3 ? { ...H, road: best.road, k: best.k } : null;
      });
      this.roads = out;
    }
  }
});
// (each roundabout's central island and signs: World._genRoundabouts, 128b, which loads after the world)
