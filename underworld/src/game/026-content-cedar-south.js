/* =====================================================================
   [CONTENT] CEDAR FIELDS SOUTH (Session 6C, §45.36)
   Countryside south of the city: rough, three-dimensional ground (the
   height field in 027) with the off-road course, its garage compound and
   open fields for underground dirt racing. A dirt track leaves the south
   perimeter road below Cedar Fields and crosses a low land bridge.
   Like Valen Point it is off the lattice: the ground, collision, roads,
   AI routing, streaming and the maps ask these helpers.
   ===================================================================== */
const CFS = {
  name: 'Cedar Fields South',
  // the countryside
  x0: -20, x1: 680, z0: 1040, z1: 1490,
  // the land bridge: a dirt road (±4 m) with grass verges between rails (±7 m), from the perimeter road's kerb
  // (z = CITY + ROAD_HALF) through a gap in the promenade and the seawall out to the fields
  lb: { x: 200, road: 4, half: 7, z0: CITY + ROAD_HALF, z1: 1040 }
};
// the city's Cedar Fields strip (superblock 'fields'): rough too, around what is built there
const CF_STRIP = { x0: 0, x1: 320, z0: 880, z1: 960 };
const WORLD_Z1 = CFS.z1 + EDGE_MARGIN;
function cfsLand(x, z) { return x >= CFS.x0 && x <= CFS.x1 && z >= CFS.z0 && z <= CFS.z1; }
function cfsBridge(x, z) { return z >= CFS.lb.z0 && z <= CFS.z0 + 0.5 && Math.abs(x - CFS.lb.x) <= CFS.lb.half; }
function inCedarSouth(x, z) { return cfsLand(x, z) || (z > CITY + EDGE_MARGIN && cfsBridge(x, z)); }
// south of the city's seawall, on the countryside's side: where routing and spawns go by the land bridge
function cfsSide(x, z) { return z > CITY + EDGE_MARGIN && x > CFS.x0 - 150 && x < CFS.x1 + 150; }
// either extension (Valen Point or Cedar Fields South): routing off the lattice goes by its spur
function extSide(x, z) { return vpSide(x, z) || cfsSide(x, z); }
function inExtension(x, z) { return inValenPoint(x, z) || inCedarSouth(x, z); }
// places a car can join the road out there, for police units and taxis: Valen Point's causeway lanes, or in Cedar
// Fields South every ~20 m along the land bridge's track and the countryside tracks, in both lanes (h is the heading)
function extRoadSpots(x, z) {
  if (!cfsSide(x, z)) return vpRoadSpots();
  // every ~20 m of the countryside's roads (the land bridge's track and the tracks traffic drives), from the seawall out
  return RoadGraph.ready ? RoadGraph.spots(e => (e.ext === 'cfs' && e.traffic) || (e.kind === 'spur' && e.name === 'Cedar Fields Track')).filter(s => s.z > CITY + EDGE_MARGIN + 8) : [];
}
// is a car at spot s heading toward (x, z)?
const spotToward = (s, x, z) => Math.sin(s.h) * (x - s.x) + Math.cos(s.h) * (z - s.z) > 0;
// a point for the police to drive to near `ref`: kept on the ground that `ref` is on
function extClampSearch(refX, refZ, x, z, m) {
  if (cfsSide(refX, refZ)) return [clamp(x, CFS.x0 + m, CFS.x1 - m), clamp(z, CFS.z0 + m, CFS.z1 - m)];
  return vpClampSearch(refX, x, z, m);
}
// a closed loop of straights joined by constant-radius arcs: a fillet of radius r at every corner [x, z, r] of V,
// sampled every `step` m. Returns { pts, R (radius at each sample, 0 on a straight), cum, len, nl (left normals of
// the direction of travel), corners, fits (every pair of tangents fits its straight) }. The Valen Point circuit
// (Session 6B) and the Cedar Fields off-road course (Session 6C) are both drawn by it.
function filletLoop(V, step) {
  const n = V.length;
  const unit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
  // each corner: the tangent points and the arc between them
  const C = V.map((v, k) => {
    const a = unit(V[(k - 1 + n) % n], v), b = unit(v, V[(k + 1) % n]), R = v[2];
    const th = Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1)), t = R * Math.tan(th / 2);
    const cross = a[0] * b[1] - a[1] * b[0], s = cross > 0 ? 1 : -1;          // +1 a right-hand (clockwise) corner
    const t1 = [v[0] - a[0] * t, v[1] - a[1] * t], t2 = [v[0] + b[0] * t, v[1] + b[1] * t];
    const nrm = [-a[1] * s, a[0] * s], cen = [t1[0] + nrm[0] * R, t1[1] + nrm[1] * R];
    return { t1, t2, cen, R, th, s, t };
  });
  const pts = [], Rs = [];
  const push = (p, R) => { pts.push(p); Rs.push(R); };
  for (let k = 0; k < n; k++) {
    const c = C[k], nx = C[(k + 1) % n];
    // the arc round corner k
    const a0 = Math.atan2(c.t1[1] - c.cen[1], c.t1[0] - c.cen[0]), arcLen = c.R * c.th, m = Math.max(2, Math.ceil(arcLen / step));
    for (let i = 0; i < m; i++) { const a = a0 + c.s * c.th * i / m; push([c.cen[0] + Math.cos(a) * c.R, c.cen[1] + Math.sin(a) * c.R], c.R); }
    // the straight to the next corner
    const L = Math.hypot(nx.t1[0] - c.t2[0], nx.t1[1] - c.t2[1]), ms = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < ms; i++) push([lerp(c.t2[0], nx.t1[0], i / ms), lerp(c.t2[1], nx.t1[1], i / ms)], 0);
  }
  const cum = [0];
  for (let k = 1; k <= pts.length; k++) { const a = pts[k - 1], b = pts[k % pts.length]; cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  // left normals (of the direction of travel)
  const nl = pts.map((p, k) => { const a = pts[(k - 1 + pts.length) % pts.length], b = pts[(k + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; });
  // the tangent lengths fit their straights (checked by tests/motorsport.mjs and tests/offroad.mjs)
  const fits = C.every((c, k) => c.t + C[(k + 1) % n].t <= Math.hypot(V[(k + 1) % n][0] - V[k][0], V[(k + 1) % n][1] - V[k][1]) + 1e-6);
  return { pts, R: Rs, cum, len: cum[pts.length], nl, corners: C, fits };
}
