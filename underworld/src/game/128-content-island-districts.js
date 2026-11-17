/* =====================================================================
   [CONTENT] VALEN ISLAND: THE NEW DISTRICTS (City Spread, round the grid)
   The owner's ruling (CITY_SPREAD.md §10): the 12 x 12 city stays where it
   is as old downtown, and the island fills out round it with districts of
   their own, laid out on curving streets, not a grid:
   - Bayview Heights, the bay's north shore: Bayview Crescent below the
     Coast Highway, Ridgeview Drive and Laurel Way climbing behind it, villas
     with pools, a village of shops;
   - Villa Valen at the head of Ridgeview Drive: the island's grandest
     estate, and under its hill the Valen Vault, a bunker you can drive into;
   - Marsh Hollow, the south-west lowlands between Longshore Drive and the
     Southshore Highway: a through road, Heron Loop and Reed Street, houses,
     walk-up flats and a high street;
   - Blackgate Landing, the west coast where the Blackgate Bridge lands:
     Quay Road and Foundry Wharf, warehouses, container stacks, cranes;
   - smaller places on the existing roads: lakeside cabins and a diner on
     the Coast Highway by Lake Valen, more of Gull Harbor. (A diner on the
     Highland Pass was tried: the pass has no level site for one.)
   The streets are island roads (022's road list), so the GPS, traffic, taxis
   and police use them like every other road. Lots are planned before the
   roads are built (a road's level comes from the ground it finds): each is
   kept clear of every road, the city, the airport, the proving ground,
   Cedar Fields South, Valen Point, the lake, the sea and every other site,
   and stands on its own level pad. Geometry lives in extra blocks
   (world.xblocks), streamed and collided like the rest of the island.
   ===================================================================== */
const ISLE_DISTRICT_ROADS = [
  { id: 'h1', name: 'Bayview Crescent', w: 8, grade: 0.09, ends: ['n1', 'n1'], pts: [[-300, -330], [-332, -262], [-420, -205], [-540, -176], [-660, -188], [-760, -240], [-800, -305]] },
  // (its turning circle stands on the villa's axis before the gate, on the estate's level: the road ended 2.6 m below the
  // gate, the circle 7 m off the axis and half under the grass, with grass between it and the gate)
  { id: 'h3', name: 'Ridgeview Drive', w: 8, grade: 0.1, ends: ['n1', 'ring'], ring: 12, ringAt: [-600, -830], ringOpen: [[-600, -848]], pts: [[-450, -330], [-456, -400], [-500, -468], [-590, -520], [-690, -560], [-742, -640], [-722, -730], [-662, -782], [-612, -800], [-600, -815]] },
  { id: 'h4', name: 'Laurel Way', w: 8, grade: 0.1, ends: ['h3', 'ring'], ring: 13, pts: [[-596, -523], [-680, -472], [-790, -452], [-880, -472], [-930, -540]] },
  { id: 'm1', name: 'Marsh Hollow Road', w: 9, grade: 0.08, ends: ['s4', 's1'], pts: [[-918, 1290], [-800, 1356], [-640, 1418], [-480, 1466], [-330, 1450], [-200, 1402], [-108, 1420]] },
  { id: 'm2', name: 'Heron Loop', w: 8, grade: 0.09, ends: ['m1', 'm1'], pts: [[-640, 1418], [-622, 1540], [-520, 1628], [-380, 1636], [-282, 1560], [-330, 1450]] },
  { id: 'm3', name: 'Reed Street', w: 8, grade: 0.09, ends: ['m1', 'ring'], ring: 12, pts: [[-480, 1466], [-470, 1380], [-450, 1312]] },
  { id: 'p1', name: 'Quay Road', w: 10, grade: 0.08, ends: ['s4', 'ring'], ring: 16, pts: [[-1000, 1520], [-1080, 1500], [-1140, 1440], [-1162, 1340], [-1150, 1250]] },
  { id: 'p2', name: 'Foundry Wharf', w: 10, grade: 0.08, ends: ['s4', 'ring'], ring: 16, pts: [[-985, 1720], [-1070, 1724], [-1140, 1760]] },
  // to Valen Field, the villa's airstrip on the west coast
  { id: 'x1', name: 'Airfield Road', w: 9, grade: 0.09, ends: ['h3', 'ring'], ring: 14, pts: [[-742, -640], [-860, -690], [-1000, -760], [-1120, -850], [-1200, -915], [-1255, -965], [-1290, -968]] }
];
ISLE_ROADS.push(...ISLE_DISTRICT_ROADS);
// with the city round the bay (021 'island'): Crestmoor Heights takes the bay's north shore, so Bayview Crescent gives
// way to it (its lots too: _districtPlan keeps clear of every precinct) and Ridgeview Drive climbs to Villa Valen from
// the Heights' north street; Reed Street stops short of the Nightlife Strip on the south shore
Object.assign(ISLE_ROAD_LAYOUT.island, {
  h1: null,
  h3: { ends: ['lat', 'ring'], pts: [[-520, -486], [-545, -512], [-590, -532], [-690, -560], [-742, -640], [-722, -730], [-662, -782], [-612, -800], [-600, -815]] },
  m3: { pts: [[-480, 1466], [-472, 1400], [-465, 1345]] }
});
// Linden Gardens (island layout): the ground the Nightlife Strip left between Linden Hills, downtown's south edge and
// the docks is built up as Linden Hills' newer half, on curving streets that tie the three together and meet the
// Southshore Highway: shops and flats facing downtown, houses behind, a pair of yards by the docks
const ISLE_INFILL_ROADS = [
  { after: 'p2', id: 'g1', name: 'Garden Parade', w: 10, grade: 0.08, ends: ['lat', 's1'], pts: [[440, 646], [440, 700], [452, 752], [490, 800], [552, 838], [626, 860], [705, 872]] },
  { after: 'p2', id: 'g2', name: 'Quince Street', w: 8, grade: 0.09, ends: ['lat', 'g1'], pts: [[326, 760], [370, 760], [410, 756], [452, 752]] },
  { after: 'p2', id: 'g3', name: 'Gardenia Close', w: 8, grade: 0.09, ends: ['g1', 'ring'], ring: 12, pts: [[552, 838], [549, 878], [538, 914], [522, 944]] },
  { after: 'p2', id: 'g4', name: 'Mercer Street', w: 8, grade: 0.09, ends: ['lat', 'g3'], pts: [[326, 920], [390, 922], [450, 922], [500, 918], [538, 914]] },
  { after: 'p2', id: 'g6', name: 'Cobb Lane', w: 8, grade: 0.09, ends: ['lat', 'g1'], pts: [[326, 840], [380, 842], [430, 845], [470, 838], [502, 822]] },
  { after: 'p2', id: 'g7', name: 'Sorrel Street', w: 9, grade: 0.08, ends: ['lat', 'g1'], pts: [[600, 646], [602, 700], [608, 760], [618, 815], [624, 856]] },
  // Midtown (the waist the core's north half left): Harbour Boulevard from the port to the Coast Highway, Midtown
  // Avenue up from the core, Ferry Street from the Old Quarter, Pier Road out to the north shore
  { after: 'p2', id: 'd1', name: 'Harbour Boulevard', w: 12, grade: 0.07, ends: ['lat', 'n1e'], pts: [[794, 120], [700, 118], [600, 112], [500, 100], [400, 82], [330, 58], [300, 40]] },
  { after: 'p2', id: 'd2', name: 'Midtown Avenue', w: 11, grade: 0.07, ends: ['lat', 'd1'], pts: [[600, 314], [600, 250], [598, 180], [600, 112]] },
  { after: 'p2', id: 'd3', name: 'Ferry Street', w: 9, grade: 0.08, ends: ['lat', 'n1e'], pts: [[120, 314], [120, 240], [125, 140], [140, 40], [160, -10], [175, -52]] },
  { after: 'p2', id: 'd4', name: 'Pier Road', w: 9, grade: 0.08, ends: ['d1', 'ring'], ring: 14, pts: [[500, 100], [502, 40], [506, -20], [512, -70]] },
  { after: 'p2', id: 'g5', name: 'Wharf Lane', w: 9, grade: 0.08, ends: ['s1', 'lat'], pts: [[694, 760], [730, 767], [770, 775], [794, 778]] }
];
ISLE_ROAD_LAYOUT.island.add.push(...ISLE_INFILL_ROADS);
// the ground infill districts fill, by layout (Island.zoneKey reads each as its zone), levelled to the city's kerb in
// rectangles that keep off the water (022 corePads)
const ISLE_INFILL = {
  island: [
    { d: 'gardens', zone: 'l', box: [320, 640, 800, 1000], pads: [[320, 640, 800, 860], [320, 860, 690, 990]] },
    { d: 'midtown', zone: 'm', box: [0, -140, 800, 320], pads: [[12, -90, 800, 320]] }
  ]
};
// the districts: their names, where their name sits on the map, the signs their shops and yards carry
const ISLE_DISTRICTS = {
  bayview: { name: 'Bayview Heights', at: [-470, -230], signs: ['BAYVIEW MARKET', 'HARBOUR CAFÉ', 'CRESCENT PHARMACY', 'THE BAY BISTRO'], cars: ['luxury', 'crest', 'suv', 'sports', 'kodiak', 'sedan', 'coupe', 'estate'] },
  marsh: { name: 'Marsh Hollow', at: [-300, 1440], signs: ['HOLLOW GROCERY', 'HERON DINER', 'SUDS LAUNDROMAT', 'MARSH HARDWARE', 'PIZZA NAPOLI', 'REED ST BARBERS'], cars: ['sedan', 'compact', 'estate', 'pickup', 'metro', 'suv', 'regent', 'van'] },
  landing: { name: 'Blackgate Landing', at: [-1120, 1430], signs: ['BLACKGATE FREIGHT', 'VALEN COLD STORAGE', 'PIER 9 IMPORTS', 'SOUND SHIPPING CO.', 'WESTCOAST SALVAGE', 'FOUNDRY TRADING'], cars: ['truck', 'van', 'pickup', 'utility'] },
  lakeside: { name: 'Lake Valen Shore', at: [1880, -600], signs: ['LAKEVIEW DINER'], cars: ['pickup', 'suv', 'offroad', 'estate'] },
  gull: { name: 'Gull Harbor', at: [-1290, -2275], signs: [], cars: ['pickup', 'van', 'utility'] },
  soundview: { name: 'Soundview', at: [1350, -300], signs: ['SOUNDVIEW MARKET', 'LAKESIDE PHARMACY', 'NORTHSHORE CAFÉ', 'SOUND SURF & TACKLE'], cars: ['sedan', 'suv', 'estate', 'compact', 'coupe', 'luxury'] },
  logistics: { name: 'Southport Logistics Park', at: [930, 1170], signs: ['SOUTHPORT FREIGHT', 'AIRSIDE CARGO', 'VALEN COURIER', 'COLD CHAIN 24', 'ISLAND PARCEL CO.'], cars: ['truck', 'van', 'utility', 'pickup'] },
  farms: { name: 'Valen Farmland', at: [380, 1650], signs: ['FARM SHOP', 'FRESH EGGS', 'PICK YOUR OWN', 'VALEN DAIRY', 'HAY FOR SALE'], cars: ['pickup', 'utility', 'estate', 'van', 'offroad'] },
  midtown: { name: 'Midtown', at: [420, 160], signs: ['HARBOUR TRUST', 'MIDTOWN DELI', 'PIER 1 OYSTER BAR', 'VALEN HERALD', 'FERRY ST PHARMACY', 'NORTHSIDE GYM', 'BLUE TIDE CAFÉ', 'MIDTOWN BOOKS'], cars: ['sedan', 'luxury', 'taxi', 'coupe', 'suv', 'regent', 'metro', 'estate'] },
  gardens: { name: 'Linden Gardens', at: [520, 800], signs: ['GARDEN PARADE DELI', 'QUINCE ST LAUNDRY', 'LINDEN FLORIST', 'PARADE NEWS', 'THE CORNER TAP', 'MERCER BAKERY'], cars: ['sedan', 'compact', 'estate', 'metro', 'suv', 'regent', 'coupe', 'van'] }
};
// what goes where: shops and flats first (they want the best frontage), then the houses fill the rest
const ISLE_LOT_PLAN = [
  { d: 'bayview', road: 'h1', kind: 'shop', sp: 40, box: [-470, -300, -320, -170], max: 3 },
  { d: 'bayview', road: 'h1', kind: 'villa', sp: 36 },
  { d: 'bayview', road: 'h3', kind: 'villa', sp: 38, endClear: 70 },
  { d: 'bayview', road: 'h4', kind: 'villa', sp: 36 },
  { d: 'marsh', road: 'm1', kind: 'shop', sp: 38, box: [-340, 1370, -100, 1500], max: 6 },
  { d: 'marsh', road: 'm1', kind: 'apt', sp: 42, box: [-600, 1380, -330, 1510], max: 4 },
  { d: 'marsh', road: 'm1', kind: 'house', sp: 24 },
  { d: 'marsh', road: 'm2', kind: 'house', sp: 24 },
  { d: 'marsh', road: 'm3', kind: 'house', sp: 23 },
  { d: 'landing', road: 'p1', kind: 'ware', sp: 58 },
  { d: 'landing', road: 'p2', kind: 'ware', sp: 58 },
  { d: 'lakeside', road: 'n1', kind: 'shop', sp: 40, box: [1700, -680, 2000, -500], max: 1 },
  { d: 'lakeside', road: 'n1', kind: 'cabin', sp: 34, box: [1500, -800, 2260, -380], max: 12 },
  { d: 'gull', road: 'n1', kind: 'cabin', sp: 30, box: [-1520, -2440, -1080, -2080], max: 8 },
  // (infill: right up to the precincts' edge streets, not the 80 m the open-country districts keep from the city)
  { d: 'gardens', road: 'g1', kind: 'shop', sp: 35, box: [380, 646, 640, 870], max: 6, gap: 1, infill: true },
  { d: 'gardens', road: 'g1', kind: 'apt', sp: 38, max: 6, gap: 2, infill: true },
  { d: 'gardens', road: 'g1', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g2', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g3', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g4', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g7', kind: 'apt', sp: 38, max: 4, gap: 2, infill: true },
  { d: 'gardens', road: 'g7', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g6', kind: 'house', sp: 23, gap: 1, infill: true },
  { d: 'gardens', road: 'g5', kind: 'ware', sp: 58, infill: true },
  // Uptown's neighbourhood along Sound Road and Lakeside Avenue; the logistics park along Freight Road
  { d: 'soundview', road: 'cU', kind: 'shop', sp: 36, max: 2, gap: 2, layout: 'island' },
  { d: 'soundview', road: 'cV', kind: 'apt', sp: 40, max: 4, gap: 2, layout: 'island' },
  { d: 'soundview', road: 'cV', kind: 'house', sp: 24, gap: 2, layout: 'island' },
  { d: 'soundview', road: 'n1', kind: 'house', sp: 24, gap: 2, box: [1180, -560, 1560, -330], layout: 'island' },
  { d: 'logistics', road: 'cW', kind: 'ware', sp: 60, gap: 4, infill: true, layout: 'island' },
  // farmsteads on the country roads, in the countryside's regions (129) under the layout that farms them
  { d: 'farms', road: 's1', kind: 'farm', sp: 210, box: [-150, 1500, 880, 1810], max: 4, layout: 'island' },
  { d: 'farms', road: 's4', kind: 'farm', sp: 230, box: [-1260, 1640, -300, 2570], max: 5, layout: 'island' },
  { d: 'farms', road: 's4', kind: 'farm', sp: 230, box: [-300, 2560, 1500, 2760], max: 3, layout: 'island' },
  { d: 'farms', road: 's4', kind: 'farm', sp: 220, box: [1470, 1690, 2120, 2410], max: 3, layout: 'island' },
  { d: 'farms', road: 'n1', kind: 'farm', sp: 220, box: [920, -490, 1570, -120], max: 3, layout: 'island' },
  { d: 'farms', road: 'n1', kind: 'farm', sp: 220, box: [-1670, -490, -750, -120], max: 3, layout: 'island' },
  { d: 'farms', road: 's3', kind: 'farm', sp: 220, box: [-1670, -490, -750, -120], max: 2, layout: 'island' },
  // Midtown: towers on the boulevard and the avenue, mid-rise flats behind, shops on the corners
  { d: 'midtown', road: 'd2', kind: 'tower', sp: 38, gap: 2, infill: true },
  { d: 'midtown', road: 'd1', kind: 'tower', sp: 38, max: 8, gap: 2, infill: true },
  { d: 'midtown', road: 'd1', kind: 'shop', sp: 35, max: 4, gap: 1, infill: true },
  { d: 'midtown', road: 'n1e', kind: 'mid', sp: 40, box: [0, -140, 800, 320], gap: 2, infill: true },
  { d: 'midtown', road: 'd3', kind: 'mid', sp: 40, gap: 2, infill: true },
  { d: 'midtown', road: 'd4', kind: 'shop', sp: 35, max: 3, gap: 1, infill: true },
  { d: 'midtown', road: 'd4', kind: 'mid', sp: 40, gap: 2, infill: true },
  { d: 'midtown', road: 'd1', kind: 'mid', sp: 40, gap: 2, infill: true }
];
// a lot's size: W along the road, D back from it; set: the verge between the carriageway and the lot
const ISLE_LOT = { villa: { W: 34, D: 30, set: 4 }, house: { W: 22, D: 22, set: 3.5 }, cabin: { W: 18, D: 18, set: 4 }, shop: { W: 34, D: 26, set: 3.5 }, apt: { W: 36, D: 28, set: 3.5 }, ware: { W: 56, D: 40, set: 4 }, tower: { W: 34, D: 32, set: 4 }, farm: { W: 56, D: 48, set: 6 }, mid: { W: 36, D: 28, set: 3.5 } };
// Villa Valen: the estate's walled grounds, levelled at one height, and the vault under its hill
// Valen Field (owner, 2026-11-17: a runway on the other side of the island, behind the villa): the villa's private
// airstrip on the flat ground west of it, 12 m up. A 700 m runway (09/27) for the Corsair and the Meridian, a taxiway to
// an apron with a hangar, a lounge and a fuel point, a windsock, edge and threshold lights; Airfield Road from Ridgeview
const VALEN_FIELD = { name: 'Valen Field', x0: -2000, z0: -1060, x1: -1200, z1: -925, y: 12, rw: { z: -1012, x0: -1950, x1: -1250, w: 30 },
  apron: { x0: -1500, z0: -982, x1: -1300, z1: -938 }, tw: { x: -1400, z0: -997, z1: -982, w: 16 } };
const VILLA_VALEN = { x0: -692, z0: -1062, x1: -518, z1: -850, y: 21.5, gate: -600, vault: { x0: -604, z0: -1052, x1: -528, z1: -994, door: -563 } };
Object.assign(World.prototype, {
  // ---------------------------------------------------------------- planning (before the roads are built)
  _districtPlan(sitePad) {
    const roads = {}, all = [];
    for (const D of Island.roadDefs()) {
      const pts = splinePts(D.pts.map(p => [p[0], p[1]]), 2.5), cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
      let ring = null;
      if (D.ring) { const a = pts[pts.length - 2], b = pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; ring = { x: b[0] + (b[0] - a[0]) / l * D.ring, z: b[1] + (b[1] - a[1]) / l * D.ring, r: D.ring + D.w / 2 }; }
      const R = { D, pts, cum, bb: [x0 - 60, z0 - 60, x1 + 60, z1 + 60], ring }; roads[D.id] = R; all.push(R);
    }
    // the rectangle's distance from a point
    const rd = (x0, z0, x1, z1, x, z) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    const roadClear = (x0, z0, x1, z1, m) => {
      for (const R of all) {
        if (x1 < R.bb[0] || x0 > R.bb[2] || z1 < R.bb[1] || z0 > R.bb[3]) continue;
        const lim = R.D.w / 2 + m;
        for (const p of R.pts) if (rd(x0, z0, x1, z1, p[0], p[1]) < lim) return false;
        if (R.ring && rd(x0, z0, x1, z1, R.ring.x, R.ring.z) < R.ring.r + m) return false;
      }
      return true;
    };
    const V = VILLA_VALEN;
    const KEEP_CITY = m => CityLayout.precincts.map(p => [p.x0 - m, p.z0 - m, p.x1 + m, p.z1 + m]), CITY80 = KEEP_CITY(80), CITY_IN = KEEP_CITY(EDGE_MARGIN + 6);
    const KEEP = [[CFS.x0 - 40, CFS.z0 - 40, CFS.x1 + 40, CFS.z1 + 40], [AIRPORT.x0 - 40, AIRPORT.z0 - 40, AIRPORT.x1 + 40, AIRPORT.z1 + 40],
      [PROVING.x0 - 40, PROVING.z0 - 40, PROVING.x1 + 40, PROVING.z1 + 40], [VP.x0 - 50, VP.z0 - 50, VP.x1 + 50, VP.z1 + 50], [V.x0 - 12, V.z0 - 12, V.x1 + 12, V.z1 + 12]];
    const hit = (a, b, m = 0) => a[0] - m < b[2] && a[2] + m > b[0] && a[1] - m < b[3] && a[3] + m > b[1];
    const pads0 = Island.pads.map(p => [p.x0, p.z0, p.x1, p.z1]), taken = [];
    const lakeIn = (x, z) => ((x - LAKE.x) / (LAKE.rx + 45)) ** 2 + ((z - LAKE.z) / (LAKE.rz + 45)) ** 2 < 1;
    const groundOk = (r, relief) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        const x = lerp(r[0], r[2], i / 2), z = lerp(r[1], r[3], j / 2), h = Island.nat(x, z);
        if (h < SEA_Y + 1.1 || lakeIn(x, z)) return false;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      return hi - lo <= relief;
    };
    const lots = [];
    for (const E of ISLE_LOT_PLAN) {
      if (!roads[E.road] || (E.layout && E.layout !== CityLayout.id)) continue; // a street this city layout does not build (ISLE_ROAD_LAYOUT)
      const R = roads[E.road], S = ISLE_LOT[E.kind], pts = R.pts, cum = R.cum, L = cum[cum.length - 1];
      let n = 0;
      for (let s = E.sp / 2 + 18, i = 0; s < L - 18 - (E.endClear || 0); s += E.sp, i++) {
        let k = 0; while (k < pts.length - 2 && cum[k + 1] < s) k++;
        const a = pts[Math.max(0, k - 2)], c = pts[Math.min(pts.length - 1, k + 3)], tl = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, tx = (c[0] - a[0]) / tl, tz = (c[1] - a[1]) / tl;
        for (const side of [-1, 1]) {
          if (E.max && n >= E.max) break;
          // inward (away from the road), snapped to an axis: the lot faces the road square-on
          const nx = tz * side, nz = -tx * side, ax = Math.abs(nx) > Math.abs(nz), vx = ax ? Math.sign(nx) : 0, vz = ax ? 0 : Math.sign(nz);
          const hx = ax ? S.D / 2 : S.W / 2, hz = ax ? S.W / 2 : S.D / 2;
          let ok = null;
          for (const extra of [0, 5, 10]) {
            const off = R.D.w / 2 + S.set + S.D / 2 + extra, cx = pts[k][0] + nx * off, cz = pts[k][1] + nz * off, r = [cx - hx, cz - hz, cx + hx, cz + hz];
            if (E.box && (cx < E.box[0] || cx > E.box[2] || cz < E.box[1] || cz > E.box[3])) break;
            if (r[0] < ISLE.x0 + 60 || r[1] < ISLE.z0 + 60 || r[2] > ISLE.x1 - 60 || r[3] > ISLE.z1 - 60) break;
            if (KEEP.some(q => hit(r, q)) || (E.infill ? CITY_IN : CITY80).some(q => hit(r, q)) || pads0.some(q => hit(r, q, 8)) || taken.some(q => hit(r, q, E.gap ?? 8))) continue;
            if (!roadClear(r[0], r[1], r[2], r[3], 2.4) || !groundOk(r, E.kind === 'ware' ? 6 : 7.5)) continue;
            ok = { cx, cz, r }; break;
          }
          if (!ok) continue;
          taken.push(ok.r);
          // levelled at the street's height in front of it: the street's bed eases into the ground over a shoulder that
          // widens with the step between them (022 compute), so a lot at the street's level keeps its whole area
          // (infill stands on the city's own level, like the ground round it: corePads)
          const P = sitePad(ok.r[0] - 2, ok.r[1] - 2, ok.r[2] + 2, ok.r[3] + 2, 8, E.infill ? CURB_H : Math.round(Island.nat(pts[k][0], pts[k][1]) * 10) / 10);
          lots.push({ d: E.d, kind: E.kind, x: ok.cx, z: ok.cz, vx, vz, ux: -vz, uz: vx, W: S.W, D: S.D, rect: ok.r, P, road: E.road, i: lots.length, seed: (i * 2 + (side > 0 ? 1 : 0)) * 31 + lots.length });
          n++;
        }
        if (E.max && n >= E.max) break;
      }
    }
    // the estate's grounds: one level, cut into the hill
    const estate = sitePad(V.x0, V.z0, V.x1, V.z1, 30, V.y);
    // and the ground before the gate, where Ridgeview Drive ends in its turning circle, on the same level
    sitePad(V.gate - 24, V.z1, V.gate + 24, V.z1 + 30, 26, V.y);
    return { lots, estate, roads };
  },
  // ---------------------------------------------------------------- building (after the roads)
  _genDistricts(plan, box, cyl, fleet) {
    const isle = this.isle, rng = (a, b) => hash2i(a, b, 9137);
    const greens = [0x3f6b2e, 0x4c7a34, 0x355f2a, 0x5a8238];
    // a district tree: a trunk with a root flare, and a crown of a main mass and three clumps in mixed greens, darker below
    const tree = (b, x, y, z, s, k) => {
      const q = j => hash2i(Math.round(x * 3 + j), Math.round(z * 3 - j), 431), g0 = Math.abs(Math.round(k)) % 4;
      cyl(b, x, y + 1.25 * s, z, 0.2 * s, 2.5 * s, 0x4e3c2c, true); cyl(b, x, y + 0.12 * s, z, 0.32 * s, 0.24 * s, 0x4e3c2c, false);
      this._det(b, 'blob', x, y + 3.8 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, C(greens[g0]).multiplyScalar(0.88));
      // three limbs from the trunk up into the crown (a cylinder from A to B: pitch, then yaw, as M's YXZ order does)
      for (let j = 0; j < 3; j++) {
        const a = (j + 0.3 + q(j + 20) * 0.4) / 3 * Math.PI * 2, ax = 0, ay = (1.7 + q(j + 23) * 0.5) * s, bx = Math.cos(a) * 1.15 * s, by = 3.4 * s, bz = Math.sin(a) * 1.15 * s;
        const dx = bx - ax, dy = by - ay, dz = bz, L = Math.hypot(dx, dy, dz);
        const lm = this._det(b, 'cylr', x + bx / 2, y + (ay + by) / 2, z + bz / 2, 0.08 * s, L, 0.08 * s, C(0x4e3c2c), Math.atan2(dx, dz)); lm.rx = Math.acos(dy / L);
      }
      // four clumps round it, two low and spreading, two high: an uneven crown, not a ball
      for (let j = 0; j < 4; j++) { const a = (j + q(j) * 0.5) / 4 * Math.PI * 2, low = j % 2 === 0, r = (low ? 1.55 : 1.0) * s, w = (low ? 1.35 : 1.15) + q(j + 9) * 0.3; this._det(b, 'blob', x + Math.cos(a) * r, y + (low ? 3.2 : 4.6) * s + q(j + 5) * 0.4 * s, z + Math.sin(a) * r, w * s, (low ? 0.95 : 1.05) * s, w * s, C(greens[(g0 + j + 1) % 4]).multiplyScalar(low ? 0.86 : 1.1)); }
    };
    const title = t => t.toLowerCase().replace(/(^|[\s.])([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase());
    // a lot's own frame: cu along the road, cv inward from the lot's centre (the front edge is cv = -D/2)
    const W2 = (L, cu, cv) => [L.x + L.ux * cu + L.vx * cv, L.z + L.uz * cu + L.vz * cv];
    const rectL = (L, cu, cv, hu, hv) => { const [x, z] = W2(L, cu, cv), ax = L.vx !== 0, hx = ax ? hv : hu, hz = ax ? hu : hv; return [x - hx, z - hz, x + hx, z + hz]; };
    const boxL = (b, L, cu, cv, su, sv, y, sy, col, solid) => { const [x, z] = W2(L, cu, cv), ax = L.vx !== 0; return box(b, x, y, z, ax ? sv : su, sy, ax ? su : sv, col, solid); };
    const face = L => Math.atan2(-L.vx, -L.vz);
    // group each district's lots into blocks of about 200 m
    const blocks = new Map(), blockOf = L => {
      const key = L.d + ':' + Math.floor(L.x / 200) + ':' + Math.floor(L.z / 200);
      let B = blocks.get(key); if (!B) { B = { d: L.d, lots: [], slots: [], folk: [] }; blocks.set(key, B); }
      return B;
    };
    // a lot that a second road's shoulder reaches (inside a bend, by a junction) is no longer level once the roads are
    // cut: it stays an empty plot rather than a house half buried in a bank
    plan.lots = plan.lots.filter(L => { const r = L.rect, hx = (r[2] - r[0]) * 0.36, hz = (r[3] - r[1]) * 0.36; return [[L.x - hx, L.z - hz], [L.x + hx, L.z + hz], [L.x - hx, L.z + hz], [L.x + hx, L.z - hz], [L.x, L.z]].every(q => Math.abs(Island.height(q[0], q[1]) - L.P.y) < 0.3); });
    plan.lots.forEach((L, k) => { L.i = k; });
    for (const L of plan.lots) blockOf(L).lots.push(L);
    let bi = 0;
    for (const B of blocks.values()) {
      let cx = 0, cz = 0; for (const L of B.lots) { cx += L.x; cz += L.z; } cx /= B.lots.length; cz /= B.lots.length;
      let r = 0; for (const L of B.lots) r = Math.max(r, Math.hypot(L.x - cx, L.z - cz));
      B.b = this._isleBlock('dist_' + B.d + bi++, cx, cz, r + 90, ISLE_DISTRICTS[B.d].name); B.cx = cx; B.cz = cz;
    }
    // the yard is dressed clear of each car's way out: from the car straight out to the front of the lot (the drive, below)
    const dressLot = (B, b, L, y, kind, house, keep) => {
      const extra = [];
      for (const S of B.slots) {
        const cu = (S.x - L.x) * L.ux + (S.z - L.z) * L.uz, cv = (S.x - L.x) * L.vx + (S.z - L.z) * L.vz;
        if (Math.abs(cu) > L.W / 2 || Math.abs(cv) > L.D / 2) continue;
        for (let v = cv + 3; v > -L.D / 2 - 1; v -= 1.5) extra.push([cu, v, 2.6]);
      }
      this._dressLot(b, L, y, kind, house, [...keep, ...extra]);
    };
    const signN = {};
    for (const B of blocks.values()) for (const L of B.lots) {
      const b = B.b, y = L.P.y, Dd = ISLE_DISTRICTS[L.d], h = face(L), q = k => rng(L.seed, k), car = k => Dd.cars[Math.floor(q(k) * Dd.cars.length)];
      const bld = (r, hh, style, col, fh, bay, o = {}) => this._bld(b, r[0], r[1], r[2], r[3], hh, style, col, fh, bay, { exactH: true, y0: y, oy: y, ...o });
      if (L.kind === 'villa') {
        const wall = [0xf2ede2, 0xe8e0d0, 0xdcd6cc, 0xf4f1ea, 0xe6dccb][Math.floor(q(1) * 5)], roof = [0x8a4a34, 0x3a4652, 0x5a4a3a, 0x7a3a2e][Math.floor(q(2) * 4)];
        bld(rectL(L, -3, 1, 9.5, 6), 7.4, STYLE.HOUSE, wall, 3.7, 4.2, { roof: 'gable', roofColor: roof });
        bld(rectL(L, 10.5, -1, 4, 4.5), 3.6, STYLE.HOUSE, wall, 3.6, 4, { roof: 'gable', roofColor: roof });
        const [px, pz] = W2(L, -4, 10.6); this._det(b, 'disc', px, y + 0.06, pz, 4, 1, 4, C(0xd8d2c4)); this._det(b, 'disc', px, y + 0.09, pz, 3.1, 1, 3.1, C(0x35a6cf)); b.water.push({ x: px, z: pz, r: 3, y: y + 0.12 });
        boxL(b, L, 0, L.D / 2 - 0.5, L.W - 1, 1.1, y + 0.7, 1.4, 0x35602c, true);
        for (const s of [-1, 1]) boxL(b, L, s * (L.W / 2 - 0.7), 3.5, 1.1, L.D - 8, y + 0.7, 1.4, 0x35602c, true);
        const [cx, cz] = W2(L, 10.5, -10); B.slots.push({ x: cx, z: cz, h, y, cls: car(3) });
        const [tx, tz] = W2(L, -13, -10); tree(b, tx, y, tz, 1, L.i);
        // the yard, the front door and the porch (121)
        dressLot(B, b, L, y, 'villa', [-12.5, -5, 6.5, 7], [[-4, 10.6, 5], [10.5, -1, 5.6], [10.5, -10, 3.6], [-13, -10, 2]]);
      } else if (L.kind === 'house') {
        const two = q(1) < 0.55, wall = [0xf2d9c4, 0xc9e2e8, 0xf0e6b8, 0xd8e8c8, 0xe8c8c8, 0xdcdcec, 0xe4dccc][Math.floor(q(2) * 7)];
        bld(rectL(L, -1, 1.5, two ? 6.5 : 7.5, 5), two ? 5.8 : 3.6, STYLE.HOUSE, wall, two ? 2.9 : 3.6, 3.2, { roof: 'gable', roofColor: [0x5a4a3a, 0x3a4652, 0x7a3a2e][Math.floor(q(3) * 3)] });
        boxL(b, L, 0, L.D / 2 - 0.5, L.W - 1, 0.12, y + 0.5, 1, 0xf0eee8, true);
        boxL(b, L, 8, -7.5, 3.6, 7, y + 0.03, 0.06, 0x8a8a88, false);
        if (q(4) < 0.8) { const [cx, cz] = W2(L, 8, -6.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(5) }); }
        const [tx, tz] = W2(L, -7, 8.5); tree(b, tx, y, tz, 0.85, L.i);
        const hu = two ? 6.5 : 7.5; dressLot(B, b, L, y, 'house', [-1 - hu, -3.5, -1 + hu, 6.5], [[8, -7.5, 4.4], [-7, 8.5, 1.8]]);
      } else if (L.kind === 'cabin') {
        bld(rectL(L, 0, 0, 4.6, 4), 4.4, STYLE.HOUSE, [0x7a5a3e, 0x8a6a48, 0x5e4a38][Math.floor(q(1) * 3)], 4.4, 3, { roof: 'gable', roofColor: 0x3a3d40 });
        boxL(b, L, -6.2, 2, 1.2, 2.6, y + 0.5, 1, 0x6a4a2e, true);
        if (q(2) < 0.75) { const [cx, cz] = W2(L, 5.8, -5.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(3) }); }
        const [tx, tz] = W2(L, -5, 6.5); tree(b, tx, y, tz, 1.1, L.i);
        dressLot(B, b, L, y, 'cabin', [-4.6, -4, 4.6, 4], [[-6.2, 2, 2], [5.8, -5.5, 3.6], [-5, 6.5, 1.8]]);
      } else if (L.kind === 'shop') {
        const r = rectL(L, 0, 3, 15, 8), n = signN[L.d] = (signN[L.d] || 0) + 1, text = Dd.signs[(n - 1) % Math.max(1, Dd.signs.length)] || 'GENERAL STORE';
        boxL(b, L, 0, -9.5, L.W - 2, 6, y + 0.03, 0.06, 0x3c3f44, false); for (const k of [-4.5, 4.5]) boxL(b, L, k, -9.5, 0.15, 5, y + 0.07, 0.02, 0xf2f2f2, false);
        bld(r, 5.4, STYLE.SHOP, [0xd8cbb4, 0xc8b8a0, 0xe0d4c0, 0xb8c4cc][Math.floor(q(1) * 4)], 5.4, 6);
        const [sx, sz] = W2(L, 0, 3 - 8 - 0.14); b.signs.push({ text, x: sx, y: y + 4.3, z: sz, ry: h, w: 14, h: 1.5, bg: ['#1c3f94', '#8a1c1c', '#1d5c3a', '#2a2e33'][n % 4], fg: '#ffffff' });
        const [nx, nz] = W2(L, 0, 3 - 8 - 0.4); b.fx.push({ type: 'neon', x: nx, y: y + 3.2, z: nz, w: L.vx ? 0.12 : 26, h: 0.14, d: L.vx ? 26 : 0.12, c: 0xffe6b8 });
        for (const k of [-9, 0, 9]) if (q(k + 20) < 0.6) { const [cx, cz] = W2(L, k, -9.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(k + 30) }); }
        const [fx, fz] = W2(L, 4, -6); B.folk.push([fx, fz, h + Math.PI], [fx + L.ux * 2.5, fz + L.uz * 2.5, h + 2.6]);
        // a shop is a place on the map: you can be sent to it
        if (!b.place) b.place = { id: 'dist_' + L.d + '_' + n, name: title(text), kind: 'landmark', door: { x: sx - L.vx * 1.4, z: sz - L.vz * 1.4, h }, under: { x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 } };
      } else if (L.kind === 'farm') {
        // a farmstead: the house by the lane, a red barn and two silos behind, a machinery shed, a gravel yard
        const wall = [0xf2ede2, 0xe8dcc4, 0xd8d0c0][Math.floor(q(1) * 3)];
        boxL(b, L, 4, 2, L.W - 10, L.D - 12, y + 0.03, 0.06, 0x9a8f7c, false);
        bld(rectL(L, -17, -12, 6, 5), 6.2, STYLE.HOUSE, wall, 3.1, 3.2, { roof: 'gable', roofColor: [0x5a4a3a, 0x3a4652, 0x7a3a2e][Math.floor(q(2) * 3)] });
        bld(rectL(L, 6, 8, 11, 8), 10.5, STYLE.WARE, [0x8a2e24, 0x7a2a22, 0x9a3a2c][Math.floor(q(3) * 3)], 10.5, 6, { roof: 'gable', roofColor: 0x3a3d40 });
        bld(rectL(L, 21, -6, 5, 7), 6, STYLE.WARE, 0x8a929a, 6, 6);
        for (const k of [0, 1]) { const [sx, sz] = W2(L, -6 + k * 6.5, 15); cyl(b, sx, y + 8, sz, 2.6, 16, 0xb8bcc0, true); cyl(b, sx, y + 16.4, sz, 2.7, 0.8, 0x8a8e92, true); }
        const [cx, cz] = W2(L, -6, -16); B.slots.push({ x: cx, z: cz, h, y, cls: car(3) });
        const [tx, tz] = W2(L, -24, -20), [ux, uz] = W2(L, -10, -21); tree(b, tx, y, tz, 1.1, L.i); tree(b, ux, y, uz, 0.9, L.i + 3);
      } else if (L.kind === 'tower') {
        // an office tower on a plaza: glass, stone or deco, 28-70 m, its lobby on the street
        const sty = [STYLE.GLASS, STYLE.GLASS, STYLE.OFFICE, STYLE.DECO][Math.floor(q(1) * 4)], col = (sty === STYLE.GLASS ? PAL.glass : sty === STYLE.DECO ? PAL.deco : PAL.office), hh = 28 + Math.round(q(2) * 42);
        boxL(b, L, 0, 0, L.W - 1, L.D - 1, y + 0.04, 0.08, 0xb4b0a8, false);
        bld(rectL(L, 0, 2.5, 13 - q(3) * 2, 11), hh, sty, col[Math.floor(q(4) * col.length)], 3.8, 4.2, { shops: true });
        const [tx, tz] = W2(L, -14, -12.5), [ux, uz] = W2(L, 14, -12.5); tree(b, tx, y, tz, 0.9, L.i); tree(b, ux, y, uz, 0.9, L.i + 1);
        for (const k of [-7, 7]) if (q(k + 40) < 0.5) { const [cx, cz] = W2(L, k, -13.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(k + 50) }); }
        const [fx, fz] = W2(L, 2, -11); B.folk.push([fx, fz, h + Math.PI]);
      } else if (L.kind === 'mid') {
        // mid-rise flats over shops: 5-8 storeys of brick or render
        const fl = 5 + Math.floor(q(1) * 4);
        bld(rectL(L, 0, 2, 16.5, 9), fl * 3.2, q(2) < 0.5 ? STYLE.BRICK : STYLE.APT, [0xa8644a, 0x8a5a44, 0xc4b6a2, 0xb8a48c, 0x9a8a78, 0xd0c4b0][Math.floor(q(3) * 6)], 3.2, 4, { shops: true });
        for (const k of [-11, 0, 11]) if (q(k + 40) < 0.55) { const [cx, cz] = W2(L, k, -11.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(k + 50) }); }
        const [fx, fz] = W2(L, -6, -10); B.folk.push([fx, fz, h + Math.PI]);
      } else if (L.kind === 'apt') {
        bld(rectL(L, 0, 2, 16, 8), 13.6, STYLE.APT, [0xb8a48c, 0xc4b6a2, 0x9a8a78][Math.floor(q(1) * 3)], 3.4, 4);
        for (const k of [-12, -4, 4, 12]) if (q(k + 40) < 0.6) { const [cx, cz] = W2(L, k, -10.5); B.slots.push({ x: cx, z: cz, h, y, cls: car(k + 50) }); }
        const [tx, tz] = W2(L, -15, -10.5); tree(b, tx, y, tz, 0.9, L.i);
      } else if (L.kind === 'ware') {
        const r = rectL(L, 0, 4, 20, 14), n = signN[L.d] = (signN[L.d] || 0) + 1, text = Dd.signs[(n - 1) % Dd.signs.length];
        boxL(b, L, 0, 0, L.W - 2, L.D - 2, y + 0.03, 0.06, 0x8f8f8a, false);
        bld(r, 10, STYLE.WARE, [0x8a929a, 0x9a8a6a, 0x6a7a86, 0xa8a49a][Math.floor(q(1) * 4)], 5, 8);
        const [sx, sz] = W2(L, 0, 4 - 14 - 0.14); b.signs.push({ text, x: sx, y: y + 8.4, z: sz, ry: h, w: 18, h: 1.8, bg: '#14181c', fg: '#ffd84d' });
        for (const k of [-11, 0, 11]) { const [dx, dz] = W2(L, k, 4 - 14 - 0.3); b.fx.push({ type: 'docklight', x: dx, y: y + 5.4, z: dz, w: 3 }); boxL(b, L, k, 4 - 14 - 0.08, 5, 0.1, y + 2.4, 4.6, 0x3a3f45, false); }
        const cc = [0xb03a2e, 0x2a6fd6, 0x2e8a4a, 0xd8a227, 0x6a4a8a, 0xe8e2d8];
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) for (let t = 0; t < 1 + Math.floor(q(60 + k + s * 7) * 3); t++) boxL(b, L, s * 25, -1 + k * 6.6, 2.5, 6.1, y + 1.3 + t * 2.6, 2.6, cc[Math.floor(q(70 + k * 3 + t + s) * 6)], true);
        const [cx, cz] = W2(L, 8, -14.5); B.slots.push({ x: cx, z: cz, h, y, cls: 'truck' });
        if (q(9) < 0.6) { const [vx, vz] = W2(L, -8, -14.5); B.slots.push({ x: vx, z: vz, h, y, cls: car(10) }); }
        if (!b.place) b.place = { id: 'dist_' + L.d + '_' + n, name: ISLE_DISTRICTS[L.d].name, kind: 'landmark', door: { x: sx - L.vx * 2, z: sz - L.vz * 2, h }, under: { x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2 } };
      }
    }
    // ---------------------------------------------------------------- driveways: every parked car at a house to its road
    // (a car whose drive cannot be laid, too steep or blocked, is not parked there: it could never leave)
    for (const B of blocks.values()) B.slots = B.slots.filter(S => {
      const L = B.lots.find(L => S.x > L.rect[0] - 1 && S.x < L.rect[2] + 1 && S.z > L.rect[1] - 1 && S.z < L.rect[3] + 1);
      const R = L && Island.roads.find(q => q.id === L.road);
      return !R || this._isleDrive(B.b, S.x, S.z, S.y, R, [], ISLE_DRIVE.back, [-L.vx, -L.vz]);
    });
    // ---------------------------------------------------------------- street lamps along the new streets
    const lotRects = plan.lots.map(L => L.rect), V = VILLA_VALEN, blockList = [...blocks.values()];
    // a point clear of every island road but its own (a street tree must not stand in a crossing street)
    const roadClearPt = (x, z, own) => Island.roads.every(Q => Q === own || Q.pts.every(p => Math.hypot(p[0] - x, p[1] - z) > Q.w / 2 + 2.5));
    for (const D of [...ISLE_DISTRICT_ROADS, ...ISLE_INFILL_ROADS]) {
      const R = Island.roads.find(q => q.id === D.id); if (!R) continue;
      const own = blockList.filter(B => ISLE_DISTRICTS[B.d] && D.id[0] === { bayview: 'h', marsh: 'm', landing: 'p', gardens: 'g', midtown: 'd' }[B.d]); if (!own.length) continue;
      let side = 1;
      for (let s = 24; s < R.cum[R.cum.length - 1] - 10; s += 44) {
        let k = 0; while (k < R.pts.length - 2 && R.cum[k + 1] < s) k++;
        if (R.bridges.some(sp => k >= sp[0] - 2 && k <= sp[1] + 2)) continue;
        const a = R.pts[Math.max(0, k - 1)], c = R.pts[Math.min(R.pts.length - 1, k + 1)], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = (c[1] - a[1]) / l * side, nz = -(c[0] - a[0]) / l * side;
        const x = R.pts[k][0] + nx * (R.w / 2 + 1.6), z = R.pts[k][1] + nz * (R.w / 2 + 1.6), y = R.y[k];
        side = -side;
        if (lotRects.some(r => x > r[0] - 1 && x < r[2] + 1 && z > r[1] - 1 && z < r[3] + 1) || (x > V.x0 && x < V.x1 && z > V.z0 && z < V.z1) || !roadClearPt(x, z, R) || this._onIsleDrive(x, z, 1.2)) continue;
        const B = own.reduce((m, q) => Math.hypot(q.cx - x, q.cz - z) < Math.hypot(m.cx - x, m.cz - z) ? q : m);
        cyl(B.b, x, y + 3.2, z, 0.11, 6.4, 0x3a3f45, true);
        box(B.b, x - nx * 0.7, y + 6.35, z - nz * 0.7, Math.abs(nx) > 0.5 ? 1.5 : 0.3, 0.14, Math.abs(nx) > 0.5 ? 0.3 : 1.5, 0x3a3f45, false);
        B.b.fx.push({ type: 'neon', x: x - nx * 1.2, y: y + 6.22, z: z - nz * 1.2, w: 0.5, h: 0.1, d: 0.5, c: 0xffe2b0 });
        // (its pool of light on the road at night, 178)
        (this.lampPools = this.lampPools || []).push({ x: x - nx * 1.2, z: z - nz * 1.2, y });
        // Linden Gardens' streets are tree-lined: a street tree each side between the lamps
        if (D.id[0] === 'g' || D.id[0] === 'd') for (const sd of [-1, 1]) {
          let k2 = 0; const s2 = s + 22; while (k2 < R.pts.length - 2 && R.cum[k2 + 1] < s2) k2++;
          const a2 = R.pts[Math.max(0, k2 - 1)], c2 = R.pts[Math.min(R.pts.length - 1, k2 + 1)], l2 = Math.hypot(c2[0] - a2[0], c2[1] - a2[1]) || 1;
          const tx = R.pts[k2][0] + (c2[1] - a2[1]) / l2 * sd * (R.w / 2 + 2.6), tz = R.pts[k2][1] - (c2[0] - a2[0]) / l2 * sd * (R.w / 2 + 2.6);
          if (s2 > R.cum[R.cum.length - 1] - 12 || lotRects.some(r => tx > r[0] - 2 && tx < r[2] + 2 && tz > r[1] - 2 && tz < r[3] + 2) || !roadClearPt(tx, tz, R) || CityLayout.inCity(tx, tz, EDGE_MARGIN + 3) || this._onIsleDrive(tx, tz, 2)) continue;
          tree(B.b, tx, R.y[k2], tz, 0.95 + 0.25 * hash2i(Math.round(tx), Math.round(tz), 77), tx + tz);
        }
      }
    }
    // ---------------------------------------------------------------- the district streets' junctions and services (121):
    // a stop sign where a street meets another road, manhole covers down the middle, drains at the kerb
    for (const D of [...ISLE_DISTRICT_ROADS, ...ISLE_INFILL_ROADS]) {
      const R = Island.roads.find(q => q.id === D.id); if (!R || !R.pts || R.pts.length < 3) continue;
      const own = blockList.filter(B => ISLE_DISTRICTS[B.d] && D.id[0] === { bayview: 'h', marsh: 'm', landing: 'p', gardens: 'g', midtown: 'd' }[B.d]); if (!own.length) continue;
      const nearB = (x, z) => own.reduce((m, q) => Math.hypot(q.cx - x, q.cz - z) < Math.hypot(m.cx - x, m.cz - z) ? q : m).b;
      const n = R.pts.length;
      (R.ends || []).forEach((e, k) => {
        if (!e || e === 'ring') return;
        // 9 m short of the junction along the road, on the right-hand verge, facing the traffic coming up to it
        let i = k ? n - 1 : 0; while (k ? (i > 1 && R.cum[n - 1] - R.cum[i] < 9) : (i < n - 2 && R.cum[i] < 9)) i += k ? -1 : 1;
        const j = k ? i - 1 : i + 1, P = R.pts[i], Q = R.pts[j], l = Math.hypot(P[0] - Q[0], P[1] - Q[1]) || 1, tx = (P[0] - Q[0]) / l, tz = (P[1] - Q[1]) / l;
        const x = P[0] - tz * (R.w / 2 + 1.0), z = P[1] + tx * (R.w / 2 + 1.0), y = R.y[i];
        if (lotRects.some(r => x > r[0] - 1 && x < r[2] + 1 && z > r[1] - 1 && z < r[3] + 1) || !roadClearPt(x, z, R)) return;
        this._stopSign(nearB(x, z), x, y, z, tx, tz, true);
      });
      for (let s = 30, m = 0; s < R.cum[R.cum.length - 1] - 20; s += 30, m++) {
        let k = 0; while (k < n - 2 && R.cum[k + 1] < s) k++;
        if (R.bridges && R.bridges.some(sp => k >= sp[0] - 1 && k <= sp[1] + 1)) continue;
        const a = R.pts[k], c = R.pts[k + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = clamp((s - R.cum[k]) / l, 0, 1), tx = (c[0] - a[0]) / l, tz = (c[1] - a[1]) / l;
        const x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t, y = R.y[k] + (R.y[k + 1] - R.y[k]) * t, B = nearB(x, z);
        if (m % 2 === 0) this._det(B, 'disc', x - tz * 0.9, y + 0.03, z + tx * 0.9, 0.36, 1, 0.36, C(0x3a3c40));
        else { const sd = m % 4 === 1 ? 1 : -1; this._det(B, 'box', x - tz * sd * (R.w / 2 - 0.35), y + 0.03, z + tx * sd * (R.w / 2 - 0.35), 0.4, 0.02, 0.9, C(0x2a2c30), Math.atan2(tx, tz)); }
      }
    }
    // ---------------------------------------------------------------- each district on the map, its cars and its people
    for (const id in ISLE_DISTRICTS) {
      const Dd = ISLE_DISTRICTS[id], mine = blockList.filter(B => B.d === id); if (!mine.length) continue;
      const B = mine.reduce((m, q) => Math.hypot(q.cx - Dd.at[0], q.cz - Dd.at[1]) < Math.hypot(m.cx - Dd.at[0], m.cz - Dd.at[1]) ? q : m);
      if (!this.mapPlaces.some(p => p.id === 'district_' + id)) this.mapPlaces.push({ id: 'district_' + id, name: Dd.name, cat: 'landmark', icon: '⌂', x: B.cx, z: B.cz, sub: 'A neighbourhood of Valen Island' });
    }
    blockList.forEach((B, k) => {
      if (B.slots.length) fleet('dist' + k, B.cx, B.cz, Math.max(230, B.b.r + 120), B.slots);
      if (B.folk.length) isle.fleet.push({ id: 'folk_dist' + k, x: B.cx, z: B.cz, r: 0, slots: [], people: B.folk });
    });
    isle.districts = { lots: plan.lots, blocks: blockList.map(B => ({ d: B.d, i: B.b.i, n: B.lots.length })) };
    this._genVillaValen(plan.estate, box, cyl, fleet, tree);
    this._genValenField(box, cyl, fleet);
  },
  // ---------------------------------------------------------------- VALEN FIELD: the villa's airstrip
  _genValenField(box, cyl, fleet) {
    const F = VALEN_FIELD, R = F.rw, y = F.y, cx = (R.x0 + R.x1) / 2, b = this._isleBlock('valen_field', cx, -985, 430, F.name);
    const W = 0xf2f2ee, ASP = 0x2c2e33, CONC = 0x9a9c98;
    const flat = (x, z, sx, sz, col, h = 0.04) => box(b, x, y + h, z, sx, 0.02, sz, col, false);
    // the runway: asphalt with a lighter shoulder, edge lines, a dashed centre line, the threshold bars, the touchdown
    // zone marks and the aiming points at each end, 09 and 27 in white
    flat(cx, R.z, R.x1 - R.x0 + 20, R.w + 8, 0x4a4c50, 0.03); flat(cx, R.z, R.x1 - R.x0, R.w, ASP, 0.045);
    for (const s of [-1, 1]) flat(cx, R.z + s * (R.w / 2 - 0.9), R.x1 - R.x0 - 8, 0.6, W, 0.06);
    for (let x = R.x0 + 70; x < R.x1 - 70; x += 50) flat(x, R.z, 30, 0.7, W, 0.06);
    for (const [ex, dir] of [[R.x0, 1], [R.x1, -1]]) {
      for (let k = 0; k < 8; k++) { const zz = R.z - R.w / 2 + 3 + k * ((R.w - 6) / 7); if (Math.abs(zz - R.z) < 2) continue; flat(ex + dir * 16, zz, 28, 1.6, W, 0.06); }
      for (const s of [-1, 1]) { flat(ex + dir * 150, R.z + s * 5.5, 40, 4, W, 0.06); for (const d of [240, 300, 360]) for (const q of [0, 1]) flat(ex + dir * d, R.z + s * (4 + q * 2.6), 20, 1.4, W, 0.06); }
      // the designator: a 7-segment number from boxes, read from the approach (09 at the west end, 27 at the east)
      const num = dir > 0 ? [0, 9] : [2, 7], SEG = { 0: 'abcdef', 2: 'abdeg', 7: 'abc', 9: 'abcdfg' };
      num.forEach((n, i) => {
        const ox = ex + dir * 52, oz = R.z + dir * (i ? 3.5 : -3.5), Lh = 7, Lw = 4.4, seg = SEG[n];
        // (local: along the runway = up the digit, across = its width; seen from the approach end)
        const P2 = (u, v2) => [ox + dir * v2, oz - dir * u];
        const bar = (u0, v0, u1, v1) => { const [x0, z0] = P2(u0, v0), [x1, z1] = P2(u1, v1); flat((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.9, Math.abs(z1 - z0) + 0.9, W, 0.065); };
        if (seg.includes('a')) bar(-Lw / 2, Lh, Lw / 2, Lh); if (seg.includes('g')) bar(-Lw / 2, Lh / 2, Lw / 2, Lh / 2); if (seg.includes('d')) bar(-Lw / 2, 0, Lw / 2, 0);
        if (seg.includes('b')) bar(Lw / 2, Lh / 2, Lw / 2, Lh); if (seg.includes('c')) bar(Lw / 2, 0, Lw / 2, Lh / 2);
        if (seg.includes('f')) bar(-Lw / 2, Lh / 2, -Lw / 2, Lh); if (seg.includes('e')) bar(-Lw / 2, 0, -Lw / 2, Lh / 2);
      });
    }
    // edge lights (white), threshold lights (green at the start, red at the far end), along both sides
    for (let x = R.x0; x <= R.x1 + 0.1; x += 50) for (const s of [-1, 1]) { cyl(b, x, y + 0.25, R.z + s * (R.w / 2 + 1.4), 0.08, 0.5, 0x2a2c30, false); b.fx.push({ type: 'neon', x, y: y + 0.55, z: R.z + s * (R.w / 2 + 1.4), w: 0.22, h: 0.18, d: 0.22, c: 0xfff4d8 }); }
    for (const [ex, c] of [[R.x0 - 4, 0x5aff8a], [R.x1 + 4, 0xff4a4a]]) for (let k = -6; k <= 6; k++) b.fx.push({ type: 'neon', x: ex, y: y + 0.3, z: R.z + k * 2.4, w: 0.22, h: 0.16, d: 0.22, c });
    // the taxiway to the apron (yellow centre line), the apron with stand markings
    const T = F.tw, A = F.apron;
    flat(T.x, (R.z + R.w / 2 + A.z0) / 2, T.w, A.z0 - (R.z + R.w / 2) + 2, ASP, 0.05); flat(T.x, (R.z + A.z0) / 2, 0.3, A.z0 - R.z, 0xe2b43a, 0.065);
    flat((A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2, A.x1 - A.x0, A.z1 - A.z0, CONC, 0.05);
    for (const sx of [-1460, -1400, -1340]) { flat(sx, (A.z0 + A.z1) / 2, 0.3, A.z1 - A.z0 - 6, 0xe2b43a, 0.065); flat(sx, A.z0 + 6, 9, 0.3, 0xe2b43a, 0.065); }
    // the hangar (open-fronted toward the apron), the lounge with its canopy and glass, the fuel point, a windsock
    const bld = (x0, z0, x1, z1, h, style, col, fh, bay, o = {}) => this._bld(b, x0, z0, x1, z1, h, style, col, fh, bay, { exactH: true, y0: y, oy: y, ...o });
    bld(-1520, -968, -1490, -930, 11, STYLE.WARE, 0xa8aeb4, 11, 6, { roof: 'gable', roofColor: 0x4a5058 });
    box(b, -1488.9, y + 4.5, -949, 0.2, 9, 30, 0x1a1c20, false);
    bld(-1290, -950, -1256, -930, 4.6, STYLE.GLASS, 0x3a5060, 4.6, 4.2);
    box(b, -1273, y + 4.7, -952.5, 36, 0.3, 6, 0xf2f2ee, false); for (const x of [-1288, -1258]) cyl(b, x, y + 2.3, -954.5, 0.14, 4.6, 0xd8d8d8, true);
    b.signs.push({ text: 'VALEN FIELD', x: -1273, y: y + 5.4, z: -955.6, ry: Math.PI, w: 10, h: 1.0, bg: '#14181c', fg: '#d4af37' });
    box(b, -1310, y + 1.1, -944, 2.4, 2.2, 1.4, 0xc8102e, true); box(b, -1310, y + 2.35, -944, 2.6, 0.3, 1.6, 0x2a2c30, false);
    cyl(b, -1230, y + 3.5, -1040, 0.08, 7, 0xd8d8d8, true); const ws = this._det(b, 'cone', -1229, y + 6.6, -1040, 0.45, 2.4, 0.45, C(0xff7a1a)); ws.rz = Math.PI / 2;
    for (const x of [-1990, -1970]) box(b, x, y + 0.6, R.z, 1.2, 1.2, 40, 0x9a9c98, false);
    // the helipad west of the hangar: a ring and an H
    this._det(b, 'disc', -1546, y + 0.05, -950, 10, 1, 10, C(0x3a3d42)); this._det(b, 'disc', -1546, y + 0.06, -950, 8.6, 1, 8.6, C(0x2c2e33)); for (const s2 of [-1, 1]) flat(-1546 + s2 * 2.2, -950, 0.8, 6, 0xf2c94c, 0.07); flat(-1546, -950, 4.4, 0.8, 0xf2c94c, 0.07);
    // the place, the aircraft on the apron, a fuel truck, the ground crew
    b.place = { id: 'valen_field', name: F.name, kind: 'landmark', door: { x: -1273, z: -958, h: Math.PI }, under: { x: -1273, z: -940 } };
    this.mapPlaces.push({ id: 'valen_field', name: F.name, cat: 'landmark', icon: '✈', x: cx, z: R.z, sub: 'Villa Valen’s private airstrip: a jet, a twin and a helicopter' });
    fleet('field_air', -1400, -980, 520, [{ x: -1460, z: -962, h: Math.PI, y, cls: 'meridian' }, { x: -1400, z: -962, h: Math.PI, y, cls: 'corsair' }, { x: -1340, z: -962, h: Math.PI, y, cls: 'skylark' }, { x: -1546, z: -950, h: Math.PI, y, cls: 'aurelia' }, { x: -1318, z: -942, h: -Math.PI / 2, y, cls: 'utility' }]);
    this.isle.fleet.push({ id: 'folk_field', x: -1400, z: -960, r: 0, slots: [], people: [[-1275, -957, Math.PI], [-1312, -948, 0.4], [-1455, -975, 2.2]] });
    this.isle.field = F;
  },
  // ---------------------------------------------------------------- VILLA VALEN and the VALEN VAULT
  _genVillaValen(pad, box, cyl, fleet, tree) {
    const V = VILLA_VALEN, y = pad.y, b = this._isleBlock('villa_valen', (V.x0 + V.x1) / 2, (V.z0 + V.z1) / 2, 150, 'Villa Valen');
    const GOLD = 0xd4af37, STONE = 0xe8e0cc, WALL = 0xf4efe4, SLATE = 0x2e3640;
    const bld = (x0, z0, x1, z1, h, style, col, fh, bay, o = {}) => this._bld(b, x0, z0, x1, z1, h, style, col, fh, bay, { exactH: true, y0: y, oy: y, ...o });
    // ------------------------------------------------ the house (owner, 2026-11-16: walk-in from the first minute, 354):
    // a tall entrance block behind a six-column portico, a wing either side (the interior's 64 x 30 m: the great living
    // room, dining room and library west; the study, cinema and kitchen east; six bedrooms over them), a glass orangery
    // off the west wing and a colonnade from the east wing to the garage pavilion
    bld(-618, -936, -602, -902, 12.4, STYLE.HOUSE, WALL, 4.6, 4.2, { roof: 'gable', roofColor: SLATE });
    bld(-642, -936, -618, -906, 9.6, STYLE.HOUSE, WALL, 4.6, 4.4, { roof: 'gable', roofColor: SLATE });
    bld(-602, -936, -578, -906, 9.6, STYLE.HOUSE, WALL, 4.6, 4.4, { roof: 'gable', roofColor: SLATE });
    bld(-660, -932, -642, -912, 5.2, STYLE.GLASS, 0x3a5060, 5.2, 3.6);
    box(b, -651, y + 5.35, -922, 19, 0.3, 21, 0xf8f4ea, false);
    for (let k = 0; k < 6; k++) { const x = -622.5 + k * 5; cyl(b, x, y + 5.1, -898.6, 0.5, 10.2, 0xf8f4ea, true); box(b, x, y + 0.2, -898.6, 1.4, 0.4, 1.4, STONE, false); box(b, x, y + 10.25, -898.6, 1.3, 0.3, 1.3, GOLD, false); }
    box(b, -610, y + 10.7, -899.9, 32, 0.7, 6.6, 0xf8f4ea, false); box(b, -610, y + 11.15, -896.7, 32.4, 0.25, 0.3, GOLD, false);
    // the pediment over the portico
    for (let i = 0; i < 6; i++) box(b, -610, y + 11.35 + i * 0.42, -897.2, 30 - i * 5, 0.42, 0.6, 0xf8f4ea, false);
    box(b, -610, y + 0.2, -899.6, 30, 0.4, 6, STONE, false); box(b, -610, y + 0.1, -896.0, 26, 0.2, 1.4, STONE, false);
    box(b, -610, y + 2.4, -901.95, 3.2, 4.8, 0.2, 0x3a2418, false); box(b, -610, y + 4.95, -901.9, 3.6, 0.2, 0.22, GOLD, false);
    for (const sx of [-1, 1]) { box(b, -610 + sx * 2.6, y + 2.2, -901.9, 0.9, 4.4, 0.12, 0xb8d0e0, false); this._det(b, 'blob', -610 + sx * 4.2, y + 0.9, -897, 0.7, 0.9, 0.7, C(0x2f6a3a)); }
    b.fx.push({ type: 'neon', x: -610, y: y + 9.6, z: -900, w: 0.9, h: 0.9, d: 0.9, c: 0xfff0c8 });
    b.glass = b.glass || [];
    for (const x of [-637, -629, -622, -598, -591, -583]) for (const gy of [2.6, 7.0]) b.glass.push({ x, y: y + gy, z: -905.82, sx: 3.0, sy: 2.0, sz: 0.1 });
    for (const x of [-610]) for (const gy of [7.2]) b.glass.push({ x, y: y + gy, z: -901.82, sx: 3.6, sy: 2.4, sz: 0.1 });
    for (const x of [-633, -625, -595, -587]) b.fx.push({ type: 'neon', x, y: y + 2.6, z: -905.86, w: 2.4, h: 1.6, d: 0.06, c: 0xffe8c0 });
    // the colonnade to the garage pavilion
    for (let x = -576; x <= -562; x += 3.5) cyl(b, x, y + 1.7, -905, 0.22, 3.4, 0xf8f4ea, true);
    box(b, -569, y + 3.55, -906.5, 18, 0.3, 4, 0xf8f4ea, false); box(b, -569, y + 0.05, -906.5, 18, 0.1, 4, STONE, false);
    // ------------------------------------------------ the motor court, its fountain, the drive and the gate
    this._det(b, 'disc', -610, y + 0.04, -877, 21, 1, 21, C(0xd8d0c0));
    cyl(b, -610, y + 0.4, -877, 4.4, 0.8, STONE, true); this._det(b, 'disc', -610, y + 0.82, -877, 3.8, 1, 3.8, C(0x3a9ad0)); b.water.push({ x: -610, z: -877, r: 3.6, y: y + 0.82 });
    cyl(b, -610, y + 1.9, -877, 0.4, 2.4, STONE, false); cyl(b, -610, y + 3.15, -877, 1.4, 0.3, GOLD, false); b.fx.push({ type: 'fountain', x: -610, y: y + 3.4, z: -877 });
    box(b, -600, y + 0.03, -856, 9, 0.06, 12, 0xd8d0c0, false);
    // (and on through the gate to Ridgeview Drive's turning circle outside)
    box(b, -600, y + 0.03, V.z1 + 2.2, 9, 0.06, 4.4, 0xd8d0c0, false);
    for (const gx of [-606.5, -593.5]) {
      box(b, gx, y + 1.9, V.z1, 1.6, 3.8, 1.6, STONE, true); box(b, gx, y + 3.95, V.z1, 1.9, 0.3, 1.9, GOLD, false);
      this._det(b, 'blob', gx, y + 4.6, V.z1, 0.55, 0.55, 0.55, C(GOLD)); b.fx.push({ type: 'neon', x: gx, y: y + 3.3, z: V.z1 + 0.85, w: 0.5, h: 0.5, d: 0.08, c: 0xffe2b0 });
    }
    b.signs.push({ text: 'VILLA VALEN', x: -600, y: y + 3.5, z: V.z1 + 0.2, ry: 0, w: 8, h: 0.9, bg: '#14181c', fg: '#d4af37' });
    // the wall round the grounds (the gate left open), lamps along it
    const wall = (x0, z0, x1, z1) => { const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0); box(b, (x0 + x1) / 2, y + 1.3, (z0 + z1) / 2, ax ? Math.abs(x1 - x0) : 0.6, 2.6, ax ? 0.6 : Math.abs(z1 - z0), 0xe0d6c0, true); box(b, (x0 + x1) / 2, y + 2.68, (z0 + z1) / 2, ax ? Math.abs(x1 - x0) + 0.2 : 0.8, 0.16, ax ? 0.8 : Math.abs(z1 - z0) + 0.2, STONE, false); };
    wall(V.x0, V.z1, -607.4, V.z1); wall(-592.6, V.z1, V.x1, V.z1); wall(V.x0, V.z0, V.x0, V.z1); wall(V.x1, V.z0, V.x1, V.z1); wall(V.x0, V.z0, V.x1, V.z0);
    for (let x = V.x0 + 20; x < V.x1 - 10; x += 26) if (Math.abs(x - V.gate) > 12) b.fx.push({ type: 'neon', x, y: y + 2.95, z: V.z1 + 0.5, w: 0.4, h: 0.3, d: 0.1, c: 0xffe2b0 });
    // ------------------------------------------------ the garage pavilion (six bays) beside the motor court
    bld(-560, -924, -526, -900, 5, STYLE.HOUSE, WALL, 5, 5, { roof: 'gable', roofColor: SLATE });
    // four doors; the second opens for the owner onto the garage under the pavilion (VSPACE_DEFS.villa)
    for (let k = 0; k < 4; k++) if (k !== 1) box(b, -555.5 + k * 8.4, y + 1.9, -899.88, 6.4, 3.8, 0.12, 0x2a2e33, false);
    this._door(b, { id: 'villaGarage', x: -547.1, z: -899.82, w: 6.0, h: 3.6, axis: 'x', face: 1, y, color: 0x2a2e33, block: b.i, kind: 'vspace', space: 'villa', prop: 'villa' });
    // ------------------------------------------------ behind the house: the pool terrace, the pool house, loungers
    box(b, -610, y + 0.05, -948, 66, 0.1, 22, STONE, false);
    // the pool: a raised basin 44 x 10 m, its coping a seat-high stone wall, pale tiles inside, a darker band and steps at
    // the shallow end, and water 0.12 m under the coping (it was a blue slab and four disks laid on the stone)
    box(b, -610, y + 0.1, -951, 43.2, 0.06, 9.2, 0xbfe6f2, false);
    for (let x = -630; x <= -590; x += 2.2) box(b, x, y + 0.165, -951, 0.06, 0.004, 9.0, 0x9ad4e6, false);
    box(b, -610, y + 0.17, -951, 1.6, 0.004, 9.0, 0x1f6f9a, false);
    for (let i = 0; i < 3; i++) box(b, -630.2 + i * 0.5, y + 0.15 + i * 0.12, -951, 0.5, 0.12, 6, 0xe8f4f8, false);
    for (const [cx, cz, sx, sz] of [[-610, -946.2, 44.8, 0.6], [-610, -955.8, 44.8, 0.6], [-632.2, -951, 0.6, 9], [-587.8, -951, 0.6, 9]]) {
      box(b, cx, y + 0.4, cz, sx, 0.8, sz, 0xece6d8, true); box(b, cx, y + 0.82, cz, sx + 0.1, 0.06, sz + 0.12, 0xf6f2e8, false);
    }
    b.water.push({ x: -610, z: -951, w: 43.6, d: 9.6, y: y + 0.7 });
    box(b, -610, y + 0.86, -946, 44.4, 0.02, 0.3, GOLD, false); box(b, -610, y + 0.86, -956, 44.4, 0.02, 0.3, GOLD, false);
    for (let x = -626; x <= -594; x += 6.4) box(b, x, y + 0.35, -941.2, 1.6, 0.3, 3.4, 0xf8f8f4, false);
    bld(-584, -966, -566, -952, 4.2, STYLE.GLASS, 0x3a5060, 4.2, 4);
    // ------------------------------------------------ the tennis court and the helipad
    box(b, -667, y + 0.05, -878, 22, 0.08, 36, 0x2f6f5a, false);
    for (const z of [-895, -861, -878]) box(b, -667, y + 0.1, z, 20, 0.02, 0.12, 0xf2f2f2, false);
    box(b, -667, y + 0.55, -878, 22, 1.1, 0.06, 0x1a1a1e, false);
    this._det(b, 'disc', -540, y + 0.05, -878, 9, 1, 9, C(0x2a2e33)); box(b, -543, y + 0.07, -878, 0.8, 0.04, 6, 0xf2c94c, false); box(b, -537, y + 0.07, -878, 0.8, 0.04, 6, 0xf2c94c, false); box(b, -540, y + 0.07, -878, 5.2, 0.04, 0.8, 0xf2c94c, false);
    b.fx.push({ type: 'helipad', x: -540, y: y + 0.2, z: -878 });
    // ------------------------------------------------ gardens: an avenue up the drive, trees round the walls
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) tree(b, -600 + s * 8, y, -858 - k * 7 - (k > 1 ? 18 : 0), 0.9, k);
    for (let x = V.x0 + 8; x < V.x1 - 6; x += 14) { if (x > -660 && x < -500) continue; tree(b, x, y, V.z0 + 10, 1.1, x); }
    for (let z = V.z0 + 30; z < V.z1 - 12; z += 16) { tree(b, V.x0 + 7, y, z, 1, z); if (z > -990) tree(b, V.x1 - 7, y, z, 1, z + 1); }
    // ================================================ THE VALEN VAULT: a bunker cut into the hill behind the house
    const Q = V.vault, H = 7, t = 0.8, cxv = (Q.x0 + Q.x1) / 2, czv = (Q.z0 + Q.z1) / 2, CON = 0xb4b8bc, DARK = 0x2c3036;
    const solidBox = (x, yy, z, sx, sy, sz, col) => this._det(b, 'box', x, yy, z, sx, sy, sz, C(col), 0, { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2, y0: yy - sy / 2, y1: yy + sy / 2, kind: 'det' });
    // the shell: four walls (the door in the south one), the ceiling, the turf over it and its banks down to the lawn
    const dw = 10, dx0 = Q.door - dw / 2, dx1 = Q.door + dw / 2;
    solidBox((Q.x0 + dx0) / 2, y + H / 2, Q.z1, dx0 - Q.x0, H, t, CON); solidBox((dx1 + Q.x1) / 2, y + H / 2, Q.z1, Q.x1 - dx1, H, t, CON);
    solidBox(Q.door, y + H - 0.9, Q.z1, dw, 1.8, t, CON);
    solidBox(cxv, y + H / 2, Q.z0, Q.x1 - Q.x0, H, t, CON); solidBox(Q.x0, y + H / 2, czv, t, H, Q.z1 - Q.z0, CON); solidBox(Q.x1, y + H / 2, czv, t, H, Q.z1 - Q.z0, CON);
    solidBox(cxv, y + H + 0.4, czv, Q.x1 - Q.x0 + t, 0.8, Q.z1 - Q.z0 + t, DARK);
    box(b, cxv, y + H + 1.2, czv, Q.x1 - Q.x0 + 2, 0.8, Q.z1 - Q.z0 + 2, 0x557a3c, false);
    const bank = 7, sl = Math.atan2(H + 1.6, bank);
    box(b, cxv, y + (H + 1.6) / 2, Q.z0 - bank / 2, Q.x1 - Q.x0 + 2 * bank, 0.6, Math.hypot(bank, H + 1.6), 0x557a3c, false).rx = sl;
    box(b, Q.x0 - bank / 2, y + (H + 1.6) / 2, czv, Math.hypot(bank, H + 1.6), 0.6, Q.z1 - Q.z0 + 2, 0x557a3c, false).rz = sl;
    box(b, Q.x1 + bank / 2, y + (H + 1.6) / 2, czv, Math.hypot(bank, H + 1.6), 0.6, Q.z1 - Q.z0 + 2, 0x557a3c, false).rz = -sl;
    this.grid.add({ x0: Q.x0 - bank, z0: Q.z0 - bank, x1: Q.x0, z1: Q.z1, y0: y, y1: y + H, kind: 'det' }); this.grid.add({ x0: Q.x1, z0: Q.z0 - bank, x1: Q.x1 + bank, z1: Q.z1, y0: y, y1: y + H, kind: 'det' }); this.grid.add({ x0: Q.x0, z0: Q.z0 - bank, x1: Q.x1, z1: Q.z0, y0: y, y1: y + H, kind: 'det' });
    // the portal: a concrete frame, the round vault door swung open beside it, the name in gold, floodlights
    solidBox(dx0 - 1.2, y + H / 2, Q.z1 + 1, 2.4, H + 0.6, 2, 0x8a9096); solidBox(dx1 + 1.2, y + H / 2, Q.z1 + 1, 2.4, H + 0.6, 2, 0x8a9096);
    box(b, Q.door, y + H + 0.3, Q.z1 + 1, dw + 4.8, 1.2, 2, 0x8a9096, false);
    const vd = this._det(b, 'cylr', dx0 - 4.6, y + 4.4, Q.z1 + 4.4, 4.2, 1.1, 4.2, C(0xa0a6ac)); vd.rx = Math.PI / 2; vd.ry = -0.9;
    const vh = this._det(b, 'cylr', dx0 - 4.6, y + 4.4, Q.z1 + 4.4, 1.3, 1.3, 1.3, C(GOLD)); vh.rx = Math.PI / 2; vh.ry = -0.9;
    this.grid.add({ x: dx0 - 4.6, z: Q.z1 + 4.4, r: 2.4, y0: y, y1: y + 8.6, kind: 'det' });
    b.signs.push({ text: 'THE VALEN VAULT', x: Q.door, y: y + H + 0.3, z: Q.z1 + 2.05, ry: 0, w: 12, h: 1.1, bg: '#14181c', fg: '#d4af37' });
    b.fx.push({ type: 'flood', x: dx0 - 1.2, y: y + H + 0.9, z: Q.z1 + 2.1, ry: 0 }, { type: 'flood', x: dx1 + 1.2, y: y + H + 0.9, z: Q.z1 + 2.1, ry: 0 });
    box(b, Q.door, y + 0.03, (Q.z1 - 959) / 2, 9, 0.06, -959 - Q.z1, 0x8a8a88, false);
    const gz = Q.z1 - 9, inner = Q.z1 - 18;
    // inside: a polished floor, strip lights down the ceiling
    box(b, cxv, y + 0.04, czv, Q.x1 - Q.x0 - t, 0.06, Q.z1 - Q.z0 - t, 0x3a3d44, false);
    for (const z of [Q.z1 - 4, inner + 0.6]) b.fx.push({ type: 'neon', x: cxv, y: y + 0.12, z, w: Q.x1 - Q.x0 - 3, h: 0.05, d: 0.18, c: 0xd4af37 });
    for (let z = Q.z0 + 6; z < Q.z1 - 3; z += 10) for (const x of [Q.x0 + 0.5, Q.x1 - 0.5]) b.fx.push({ type: 'neon', x, y: y + 3.4, z, w: 0.08, h: 1.8, d: 0.5, c: 0xfff0d8 });
    for (let x = Q.x0 + 8; x < Q.x1 - 4; x += 12) b.fx.push({ type: 'neon', x, y: y + H - 0.12, z: czv, w: 0.3, h: 0.08, d: Q.z1 - Q.z0 - 6, c: 0xe8f0ff });
    const gx = [-596, -586, -576, -550, -541, -532];
    // the gallery: six cars on lit turntables, nose to the door
    gx.forEach((x, k) => { this._det(b, 'disc', x, y + 0.08, gz, 3.6, 1, 3.6, C(0x14161a)); b.fx.push({ type: 'neon', x, y: y + 0.1, z: gz, w: 4.4, h: 0.04, d: 6.4, c: [0x40c8ff, 0xd4af37, 0xff3a6a][k % 3] }); });
    fleet('vault_gallery', cxv, gz, 220, gx.map((x, k) => ({ x, z: gz, h: 0, y, cls: ['valkyr', 'obsidian', 'revenant', 'monarch', 'hellion', 'kodiak'][k] })));
    // the inner wall with three doorways, and the rooms behind it: the command room, the lounge, the strongroom
    const doors = [-588, -564, -540], seg = [Q.x0];
    for (const d of doors) seg.push(d - 2.2, d + 2.2); seg.push(Q.x1);
    for (let k = 0; k < seg.length; k += 2) solidBox((seg[k] + seg[k + 1]) / 2, y + H / 2, inner, seg[k + 1] - seg[k], H, 0.5, CON);
    for (const d of doors) { solidBox(d, y + H - 1.1, inner, 4.4, 2.2, 0.5, CON); box(b, d, y + 4.95, inner + 0.3, 4.6, 0.12, 0.1, GOLD, false); }
    const roomZ = (Q.z0 + inner) / 2, roomD = inner - Q.z0;
    solidBox(-576, y + H / 2, roomZ, 0.5, H, roomD, CON); solidBox(-552, y + H / 2, roomZ, 0.5, H, roomD, CON);
    // the command room: a wall of screens, a desk, the island on a lit table
    for (let k = 0; k < 5; k++) for (let r = 0; r < 2; r++) b.fx.push({ type: 'neon', x: -600 + k * 4.8, y: y + 2.3 + r * 2.2, z: Q.z0 + 0.55, w: 4.2, h: 1.9, d: 0.06, c: [0x2a8cff, 0x30d0a0, 0x1a5aa8][(k + r) % 3] });
    box(b, -590, y + 0.55, Q.z0 + 5, 20, 1.1, 1.6, DARK, true); box(b, -590, y + 0.85, -1032, 8, 1.7, 5, 0x30343a, true); b.fx.push({ type: 'neon', x: -590, y: y + 1.72, z: -1032, w: 7.4, h: 0.04, d: 4.4, c: 0x2ad1ff });
    for (const x of [-596, -590, -584]) box(b, x, y + 0.6, Q.z0 + 7.4, 0.9, 1.2, 0.9, 0x1a1a1e, false);
    b.signs.push({ text: 'COMMAND', x: -590, y: y + H - 1.2, z: inner - 0.3, ry: Math.PI, w: 6, h: 0.7, bg: '#0d1620', fg: '#2ad1ff' });
    // the lounge: a black-and-gold bar, lit shelves, sofas round a grotto pool, a chandelier
    box(b, -564, y + 0.6, Q.z0 + 3.2, 20, 1.2, 1.4, 0x111113, true); box(b, -564, y + 1.24, Q.z0 + 3.2, 20.4, 0.08, 1.6, GOLD, false);
    for (let r = 0; r < 3; r++) b.fx.push({ type: 'neon', x: -564, y: y + 2.2 + r * 1.1, z: Q.z0 + 0.6, w: 18, h: 0.06, d: 0.3, c: 0xffb04a });
    box(b, -564, y + 0.08, -1032, 13, 0.06, 7, 0xd8c8a0, false); box(b, -564, y + 0.11, -1032, 11, 0.04, 5, 0x2a9ad0, false); b.water.push({ x: -567, z: -1032, r: 2.4, y: y + 0.13 }, { x: -561, z: -1032, r: 2.4, y: y + 0.13 });
    box(b, -564, y + 0.5, -1022.5, 12, 1, 2.4, 0xf2ece0, true); box(b, -571.6, y + 0.5, -1032, 2.4, 1, 8, 0xf2ece0, true); box(b, -556.4, y + 0.5, -1032, 2.4, 1, 8, 0xf2ece0, true);
    this._det(b, 'blob', -564, y + H - 1.4, -1032, 1.2, 0.9, 1.2, C(GOLD)); b.fx.push({ type: 'neon', x: -564, y: y + H - 2.3, z: -1032, w: 1.4, h: 0.5, d: 1.4, c: 0xfff0c8 });
    b.signs.push({ text: 'LOUNGE', x: -564, y: y + H - 1.2, z: inner - 0.3, ry: Math.PI, w: 5, h: 0.7, bg: '#14181c', fg: '#d4af37' });
    // the strongroom: the vault door in the far wall, gold on pallets, cash, the armoury racks
    const sd = this._det(b, 'cylr', -538, y + 3.2, Q.z0 + 0.7, 3, 0.8, 3, C(0x8c949c)); sd.rx = Math.PI / 2;
    const sh = this._det(b, 'cylr', -538, y + 3.2, Q.z0 + 1.15, 0.9, 0.3, 0.9, C(GOLD)); sh.rx = Math.PI / 2;
    for (let p = 0; p < 4; p++) {
      const px = -547.5 + (p % 2) * 5, pz = -1046 + Math.floor(p / 2) * 7;
      box(b, px, y + 0.25, pz, 2.4, 0.5, 2.4, 0x7a5a3a, true);
      for (let l = 0; l < 3; l++) box(b, px, y + 0.68 + l * 0.36, pz, 2 - l * 0.4, 0.34, 2 - l * 0.4, p % 2 ? 0x5d8a4a : GOLD, false);
    }
    for (let k = 0; k < 5; k++) { box(b, Q.x1 - 0.9, y + 2, Q.z0 + 6 + k * 5, 0.5, 3.4, 3.6, DARK, true); for (let r = 0; r < 3; r++) box(b, Q.x1 - 1.25, y + 1 + r * 0.9, Q.z0 + 6 + k * 5, 0.12, 0.16, 2.8, 0x6a7078, false); }
    b.fx.push({ type: 'neon', x: -538, y: y + H - 0.15, z: roomZ, w: 18, h: 0.06, d: 0.3, c: 0xfff0d8 });
    b.signs.push({ text: 'STRONGROOM', x: -540, y: y + H - 1.2, z: inner - 0.3, ry: Math.PI, w: 7, h: 0.7, bg: '#14181c', fg: '#d4af37' });
    // ------------------------------------------------ the place, the cars on the drive, the people
    b.place = { id: 'villa_valen', name: 'Villa Valen', kind: 'landmark', door: { x: V.gate, z: V.z1 + 6, h: Math.PI }, under: { x: -610, z: -920 } };
    this.mapPlaces.push({ id: 'vault', name: 'The Valen Vault', cat: 'landmark', icon: '♜', x: Q.door, z: Q.z1 + 6, sub: 'The bunker under Villa Valen' });
    fleet('villa_court', -610, -880, 240, [{ x: -620, z: -889, h: Math.PI / 2, y, cls: 'luxury' }, { x: -598, z: -866, h: -Math.PI / 2, y, cls: 'kodiak' }, { x: -555.5, z: -893.5, h: Math.PI, y, cls: 'sports' }, { x: -530.7, z: -893.5, h: Math.PI, y, cls: 'monarch' }, { x: -540, z: -878, h: Math.PI / 2, y, cls: 'aurelia' }]);
    this.isle.fleet.push({ id: 'folk_villa', x: -610, z: -900, r: 0, slots: [], people: [[-606, -896, 0.3], [-614, -896, -0.3], [-596, V.z1 + 3, Math.PI], [-563, Q.z1 + 4, 0], [-600, -948.5, 1.6]] });
    this.isle.villa = { pad, vault: Q, y };
  }
});
// ---------------------------------------------------------------- driveways (2026-11-17)
// A parked car at an island house stood on its lawn with grass (a verge, trees) between it and its road: there was no
// way for it to leave. Each one gets a paved drive from behind the car to the edge of its own road's carriageway: in
// 2 m pieces that follow the ground (a sloped piece from point to point), up onto the pavement where a district street
// has one (the dropped kerb), and never steeper than ISLE_DRIVE.maxGrade (a car climbs what the ground is; where it would be steeper, there is no drive and the
// car is not parked there). A district tree standing in its way is taken out; anything else in the way (a wall, a
// building, a hedge) and the car is not parked there either. this.isle.drives keeps them: the street lamps, the street
// trees and the road lamps (178) keep off them.
const ISLE_DRIVE = { w: 3.4, back: 3, piece: 2, maxGrade: 0.45, maxLen: 70, col: 0x8f918e };
Object.assign(World.prototype, {
  // (why a drive was not laid: kept for the placement suite and the audit)
  _driveNo(why, x, z, ...a) { (this.isle.driveNo = this.isle.driveNo || []).push([why, Math.round(x), Math.round(z), ...a]); return false; },
  _onIsleDrive(x, z, m = 0) {
    for (const d of (this.isle && this.isle.drives) || []) {
      const dx = d.bx - d.ax, dz = d.bz - d.az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - d.ax) * dx + (z - d.az) * dz) / l2, 0, 1);
      if (Math.hypot(x - d.ax - dx * t, z - d.az - dz * t) < d.w / 2 + m) return true;
    }
    return false;
  },
  // a drive for a car at (sx, sz) (its ground sy) to road R, through way points (a gap in a hedge) if any; true if laid
  // (dir: the way the lot faces its road; the drive runs straight out that way to the road, square across the verge,
  // not on a slant to the nearest point of the road through the neighbours' hedges)
  _isleDrive(b, sx, sz, sy, R, via = [], back = ISLE_DRIVE.back, dir = null) {
    const D = ISLE_DRIVE, isle = this.isle, urban = /^[ghmpd]\d/.test(R.id), hw = R.w / 2;
    // the nearest point of the road's centre line to the last way point (or the car)
    const [qx, qz] = via.length ? via[via.length - 1] : [sx, sz];
    let best = null;
    for (let k = 0; k < R.pts.length - 1; k++) {
      const a = R.pts[k], c = R.pts[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, t = clamp(((qx - a[0]) * dx + (qz - a[1]) * dz) / l2, 0, 1);
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(qx - px, qz - pz);
      if (!best || d < best.d) best = { d, px, pz, y: R.y[k] + (R.y[k + 1] - R.y[k]) * t };
    }
    if (dir && !via.length) {
      // straight out of the lot: the first point along dir that is on the road's carriageway
      for (let t = 0; t < ISLE_DRIVE.maxLen; t += 0.5) {
        const x = sx + dir[0] * t, z = sz + dir[1] * t;
        for (let k = 0; k < R.pts.length - 1; k++) {
          const a = R.pts[k], c = R.pts[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, u = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
          const px = a[0] + dx * u, pz = a[1] + dz * u, d = Math.hypot(x - px, z - pz);
          if (d < hw - 0.4) { best = { d: Math.hypot(sx - px, sz - pz), px, pz, y: R.y[k] + (R.y[k + 1] - R.y[k]) * u, ex: x, ez: z }; t = 1e9; break; }
        }
      }
    }
    if (!best || best.d < hw + 0.5) return true; // (already at the road)
    // the line: behind the car, the car, the way points, the road's edge (just onto the carriageway)
    const ex = best.ex !== undefined ? best.ex : best.px + (qx - best.px) / best.d * (hw - 0.4), ez = best.ez !== undefined ? best.ez : best.pz + (qz - best.pz) / best.d * (hw - 0.4);
    const f = via.length ? via[0] : [ex, ez], fl = Math.hypot(f[0] - sx, f[1] - sz) || 1;
    const line = [[sx - (f[0] - sx) / fl * back, sz - (f[1] - sz) / fl * back], [sx, sz], ...via, [ex, ez]];
    let len = 0; for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (len > D.maxLen) return this._driveNo('long', sx, sz);
    // the surface along it: the lot's level at the car, the ground on the way, the pavement and the road at the end
    const surf = (x, z) => {
      const dr = Math.hypot(x - best.px, z - best.pz);
      if (dr <= hw) return best.y + 0.04;
      if (urban && dr < hw + 2.4) return best.y + 0.2;
      return Math.max(Island.height(x, z), SEA_Y + 0.4) + 0.03;
    };
    const P = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], c = line[i], l = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(l / D.piece));
      for (let j = i === 1 ? 0 : 1; j <= n; j++) { const x = a[0] + (c[0] - a[0]) * j / n, z = a[1] + (c[1] - a[1]) * j / n; P.push([x, i <= 1 && j <= n ? sy + 0.03 : surf(x, z), z]); }
    }
    for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]); if (l > 0.01 && Math.abs(P[i][1] - P[i - 1][1]) / l > D.maxGrade) return this._driveNo('steep', sx, sz, +(P[i][1] - P[i - 1][1]).toFixed(2), i); }
    // what stands in the way: a district tree goes; anything else and there is no drive
    const segs = []; for (let i = 1; i < line.length; i++) segs.push({ ax: line[i - 1][0], az: line[i - 1][1], bx: line[i][0], bz: line[i][1], w: D.w });
    const near = (x, z, m) => segs.some(d => { const dx = d.bx - d.ax, dz = d.bz - d.az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - d.ax) * dx + (z - d.az) * dz) / l2, 0, 1); return Math.hypot(x - d.ax - dx * t, z - d.az - dz * t) < d.w / 2 + m; });
    const hitsRect = (x0, z0, x1, z1) => segs.some(d => {
      const dx = d.bx - d.ax, dz = d.bz - d.az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (let t = 0; t <= l; t += 0.5) for (const o of [-d.w / 2, 0, d.w / 2]) { const x = d.ax + dx * t / l + nx * o, z = d.az + dz * t / l + nz * o; if (x > x0 && x < x1 && z > z0 && z < z1) return true; }
      return false;
    });
    const trees = [];
    for (const B of isle.blocks) {
      for (const r of B.bld) { if (r.hollow) continue; for (const p of P) if (p[0] > r.x0 - 0.8 && p[0] < r.x1 + 0.8 && p[2] > r.z0 - 0.8 && p[2] < r.z1 + 0.8) return this._driveNo('bld', sx, sz, B.name); }
      for (const d of B.det) {
        const c = d.col; if (!c || c.y1 - c.y0 < 0.3) continue;
        const x = c.x !== undefined ? c.x : (c.x0 + c.x1) / 2, z = c.z !== undefined ? c.z : (c.z0 + c.z1) / 2;
        // (a post or a trunk by its radius; a box by its own rectangle: a long hedge is not a circle as wide as it is long)
        if (c.r !== undefined ? !near(x, z, c.r + 0.3) : !hitsRect(c.x0 - 0.3, c.z0 - 0.3, c.x1 + 0.3, c.z1 + 0.3)) continue;
        if (d.kind === 'cylr' && d.color && d.color.getHex() === C(0x4e3c2c).getHex()) trees.push([B, d.x, d.z]); else return this._driveNo('det', sx, sz, d.kind, d.color && d.color.getHexString(), Math.round(x), Math.round(z));
      }
    }
    for (const [B, x, z] of trees) B.det = B.det.filter(d => !(Math.hypot(d.x - x, d.z - z) < 3.6 && (d.kind === 'blob' || (d.kind === 'cylr' && d.color && d.color.getHex() === C(0x4e3c2c).getHex()))));
    // the pieces: a slab from point to point, pitched to the slope between them
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], c = P[i], dx = c[0] - a[0], dz = c[2] - a[2], l = Math.hypot(dx, dz); if (l < 0.01) continue;
      const dy = c[1] - a[1], s = this._det(b, 'box', (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, D.w, 0.06, Math.hypot(l, dy) + 0.12, C(D.col), Math.atan2(dx, dz));
      s.rx = -Math.atan2(dy, l);
    }
    (isle.drives = isle.drives || []).push(...segs);
    return true;
  }
});
