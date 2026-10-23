/* =====================================================================
   [CONTENT] VALEN POINT (Session 6B, §45.32, §45.34)
   The motorsport district: an island east of the city, joined to the
   east perimeter road by a low causeway at z = VP.cw.z. Everything here
   is outside the 0..CITY lattice, so nothing lattice-based (RoadNet,
   blocks, turfs) covers it: the ground, collision, roads, AI routing,
   streaming and the maps each ask these helpers instead.
   ===================================================================== */
const VP = {
  name: 'Valen Point',
  // the island
  x0: 1440, x1: 2380, z0: 130, z1: 910,
  // the causeway: a two-lane road (±7 m) with a shoulder each side, from the perimeter road to the island
  cw: { z: 520, road: 7, half: 9, x0: CITY + ROAD_HALF, x1: 1440 }
};
// the far edge of everything the collision grid and the maps have to cover
const WORLD_X1 = VP.x1 + EDGE_MARGIN;
function vpLand(x, z) { return x >= VP.x0 && x <= VP.x1 && z >= VP.z0 && z <= VP.z1; }
function vpCauseway(x, z) { return x >= VP.cw.x0 && x <= VP.x0 + 0.5 && Math.abs(z - VP.cw.z) <= VP.cw.half; }
// off the city's square and on Valen Point's ground (the island, or the causeway past the seawall)
function inValenPoint(x, z) { return vpLand(x, z) || (x > CITY + EDGE_MARGIN && vpCauseway(x, z)); }
// is (x, z) beyond the city altogether (the district or the water around it)?
function offCity(x, z) { return x > CITY + EDGE_MARGIN || x < -EDGE_MARGIN || z < -EDGE_MARGIN || z > CITY + EDGE_MARGIN; }
// places a car can join the road out there: the causeway's lanes every 20 m (heading toward the island on the
// south lane, back to the city on the north), for police units and taxis (Session 6B)
function vpRoadSpots() {
  const out = [], z = VP.cw.z;
  for (let x = CITY + EDGE_MARGIN + 20; x < VP.x0 + 10; x += 20) { out.push({ x, z: z + LANE, h: Math.PI / 2 }); out.push({ x, z: z - LANE, h: -Math.PI / 2 }); }
  return out;
}
