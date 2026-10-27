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
// places a car can join the road to where you are: the causeway or the land bridge, in the lane heading your way
function extRoadSpots(x, z) {
  if (cfsSide(x, z)) { const out = [], bx = CFS.lb.x; for (let zz = CITY + EDGE_MARGIN + 10; zz < CFS.z0 + 30; zz += 15) { out.push({ x: bx - LANE * 0.8, z: zz, h: 0 }); out.push({ x: bx + LANE * 0.8, z: zz, h: Math.PI }); } return out; }
  return vpRoadSpots();
}
// a point for the police to drive to near `ref`: kept on the ground that `ref` is on
function extClampSearch(refX, refZ, x, z, m) {
  if (cfsSide(refX, refZ)) return [clamp(x, CFS.x0 + m, CFS.x1 - m), clamp(z, CFS.z0 + m, CFS.z1 - m)];
  return vpClampSearch(refX, x, z, m);
}
