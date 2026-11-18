/* =====================================================================
   [CONTENT] THE WORLD'S EXTENT OFF THE CITY
   The far edge the collision grid and the maps cover, and whether a point is
   off the city's lattice altogether. (Valen Point, the motorsport island east
   of the city that this file used to describe, was taken out on 2026-11-18
   when Valen Sound was filled in: 022, ISLAND.md.)
   ===================================================================== */
// the far edge of everything the collision grid and the maps have to cover
const WORLD_X1 = ISLE.x1;
// is (x, z) beyond the city altogether (the island, or the sea)?
function offCity(x, z) { return CityLayout.at(x, z) === null; }
