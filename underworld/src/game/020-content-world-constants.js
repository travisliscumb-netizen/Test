/* =====================================================================
   [CONTENT] WORLD CONSTANTS
   ===================================================================== */
const P = 80;            // block pitch (road centre to road centre)
const N = 12;            // blocks per side
const CITY = N * P;      // 960 m
const ROAD_HALF = 6;     // curb distance from road centreline
const WALK_W = 4;        // sidewalk width
const INNER = ROAD_HALF + WALK_W; // 10: building line
const LANE = 2.6;        // lane centre offset from road centreline
const CURB_H = 0.15;
const TURN_IN = 10;      // distance from node where intersection paths begin
const EDGE_MARGIN = 18;  // promenade beyond outer roads
const GRAVITY = 22;

// District legend: D downtown, C commercial, R rowhouse residential, H houses,
// I industrial, P park, K parking, X construction
const DISTRICT_MAP = [
  'WWWRRCCCCIII',
  'WWWRRCCKCIII',
  'WWGGGCCDCXII',
  'WRGGGCDDDCII',
  'RRRCCDDDDCKI',
  'RRKCDDDDDCCI',
  'RRRCDDDXDCII',
  'HRRCCDDDCCKI',
  'HHRRCCKAAAII',
  'HHRPRCCAAAII',
  'HHHRRRIIIITT',
  'FFFFRRIIIITT'
];
const DTYPE = { D: 1, C: 2, R: 3, H: 4, I: 5, P: 6, K: 7, X: 8, Z: 9, G: 10, A: 11, F: 12, W: 13, T: 11 };
const DNAME = { D: 'Financial District', C: 'Downtown', R: 'Old Quarter', H: 'Linden Hills', I: 'Industrial Belt', P: 'Pocket Park', K: 'Downtown', X: 'Downtown', W: 'Crestmoor Heights', G: 'Greenway Park', A: 'Stadium District', T: 'Container Terminal', F: 'Cedar Fields' };
const SPECIAL = {
  safehouse: { bx: 1, bz: 9 },
  hospital: { bx: 8, bz: 7 },
  police: { bx: 3, bz: 5 },
  chopshop: { bx: 10, bz: 6 }
};
const STREET_NAMES_X = ['Harbor Ave', 'Ash St', 'Birch St', 'Cedar St', 'Dock St', 'Elm St', 'Foundry Rd', 'Gull St', 'Hale St', 'Iris St', 'Juniper St', 'Kestrel St', 'Quay Rd'];
const STREET_NAMES_Z = ['North Shore Dr', '1st Ave', '2nd Ave', '3rd Ave', '4th Ave', '5th Ave', 'Central Blvd', '7th Ave', '8th Ave', '9th Ave', '10th Ave', '11th Ave', 'South Shore Dr'];

function districtAt(bx, bz) {
  if (bx < 0 || bz < 0 || bx >= N || bz >= N) return 'W';
  return DISTRICT_MAP[bz][bx];
}
function streetNameAt(x, z) {
  const i = Math.round(x / P), j = Math.round(z / P);
  const dx = Math.abs(x - i * P), dz = Math.abs(z - j * P);
  if (dx < ROAD_HALF + WALK_W && dz < ROAD_HALF + WALK_W && i >= 0 && j >= 0 && i <= N && j <= N) return STREET_NAMES_X[i] + ' & ' + STREET_NAMES_Z[j];
  if (dx < ROAD_HALF + WALK_W && i >= 0 && i <= N) return STREET_NAMES_X[i];
  if (dz < ROAD_HALF + WALK_W && j >= 0 && j <= N) return STREET_NAMES_Z[j];
  if (x > CITY + ROAD_HALF && vpCauseway(x, z)) return 'Valen Point Causeway';
  if (vpLand(x, z)) return VP.name;
  if (z > CITY + EDGE_MARGIN && cfsBridge(x, z)) return 'Cedar Fields Track';
  if (cfsLand(x, z)) return CFS.name;
  if (x < 0 || z < 0 || x > CITY || z > CITY) return 'Harbor Promenade';
  return null;
}
// Named districts (identity layer over the land-use map above). Each has its own
// traffic mix, foot traffic, police presence and a line for the discovery card.
const ZONE_MAP = [
  'uuuooommmsss',
  'uuuoommmmsss',
  'uugggmmcmsss',
  'uogggmcccmss',
  'ooommccccmms',
  'ooomcccccmms',
  'ooomcccccmhh',
  'loommcccmmhh',
  'lloopppaaahh',
  'lloopppaaahh',
  'llloppwwwwhh',
  'rrrrppwwwwhh'
];
const ZONES = {
  c: { name: 'Financial District', tag: 'Glass towers, clean hands, dirty money', col: '#7fb2ff', ped: 1.3, cops: 1.6, night: 0.9,
    traffic: { taxi: 3, sedan: 3, compact: 2, suv: 1.6, sports: 1.4, van: 0.6, luxury: 1.2 } },
  m: { name: 'Downtown', tag: 'Diners, rackets and gridlock', col: '#ffb547', ped: 1.1, cops: 1.1, night: 0.8,
    traffic: { sedan: 3, compact: 3, taxi: 1.5, van: 1.5, suv: 1.2, pickup: 0.8, sports: 0.6 } },
  o: { name: 'Old Quarter', tag: 'Brick rows, corner boys and long memories', col: '#e0896b', ped: 1.0, cops: 0.8, night: 0.7,
    traffic: { compact: 3, sedan: 2.5, van: 1.2, pickup: 1, taxi: 0.8, muscle: 0.15 } },
  l: { name: 'Linden Hills', tag: 'Cul-de-sacs, carports and nosy neighbours', col: '#8fe39b', ped: 0.55, cops: 0.6, night: 0.5,
    traffic: { suv: 3, sedan: 2.5, compact: 2, pickup: 1.2, sports: 0.5 } },
  s: { name: 'Industrial Belt', tag: 'Smokestacks, chop shops and night racers', col: '#d8a227', ped: 0.35, cops: 0.6, night: 1.1,
    traffic: { truck: 2.2, pickup: 2.5, van: 2.5, compact: 1, sedan: 1, muscle: 0.3 } },
  h: { name: 'Docklands', tag: 'Containers, cranes and whatever is inside them', col: '#46d4c4', ped: 0.35, cops: 0.7, night: 0.6,
    traffic: { truck: 3, van: 2.5, pickup: 2, sedan: 1, compact: 0.8 } },
  g: { name: 'Greenway Park', tag: 'The island’s green lung', col: '#5fbf6a', ped: 1.2, cops: 0.7, night: 0.4,
    traffic: { compact: 2, sedan: 2, taxi: 1, suv: 1 } },
  p: { name: 'Nightlife Strip', tag: 'Neon, velvet ropes and rooms by the hour', col: '#e056fd', ped: 1.15, cops: 1.0, night: 1.6,
    traffic: { taxi: 3, sedan: 2, sports: 1.4, luxury: 0.8, suv: 1.2, compact: 1.5, muscle: 0.4 } },
  w: { name: 'Warehouse District', tag: 'Bonded stores, freight yards, no witnesses', col: '#b0855a', ped: 0.3, cops: 0.5, night: 0.8,
    traffic: { truck: 2.5, van: 3, pickup: 2, utility: 1.2, compact: 0.8, sedan: 0.8 } },
  u: { name: 'Crestmoor Heights', tag: 'Gates, hedges and very good lawyers', col: '#e8d28a', ped: 0.35, cops: 1.3, night: 0.3,
    traffic: { luxury: 3, suv: 2.5, sports: 1.6, coupe: 1.2, sedan: 1 } },
  a: { name: 'Stadium District', tag: 'Game nights, tailgates and the biggest car park in town', col: '#6fa8ff', ped: 0.6, cops: 0.9, night: 1.2,
    traffic: { sedan: 2.5, suv: 2, taxi: 2, compact: 2, sports: 0.8, van: 0.8 } },
  r: { name: 'Cedar Fields', tag: 'Dirt tracks and nobody watching', col: '#c9b06b', ped: 0.15, cops: 0.3, night: 0.3,
    traffic: { pickup: 3.5, offroad: 1.5, van: 1, sedan: 1, compact: 0.8 } },
  // Valen Point (Session 6B): off the lattice, east across the causeway; no foot traffic, few police
  v: { name: 'Valen Point', tag: 'Pit garages, grandstands and the fastest legal mile on the island', col: '#ff6b4a', ped: 0, cops: 0.4, night: 0.4,
    traffic: { sports: 2, sedan: 2, suv: 1.5, van: 1.2, pickup: 0.8, muscle: 0.6, truck: 0.4 } }
};
function zoneKey(x, z) {
  if (x > CITY + EDGE_MARGIN && x < VP.x1 + 400) return 'v';
  // Cedar Fields South (Session 6C) is more of Cedar Fields
  if (cfsSide(x, z)) return 'r';
  const bx = clamp(Math.floor(x / P), 0, N - 1), bz = clamp(Math.floor(z / P), 0, N - 1);
  return ZONE_MAP[bz][bx];
}
function zoneAt(x, z) { return ZONES[zoneKey(x, z)]; }
function districtNameAt(x, z) {
  if (inValenPoint(x, z)) return VP.name;
  if (inCedarSouth(x, z)) return CFS.name;
  if (x < -ROAD_HALF - 2 || z < -ROAD_HALF - 2 || x > CITY + ROAD_HALF + 2 || z > CITY + ROAD_HALF + 2) return 'Waterfront';
  return zoneAt(x, z).name;
}
// Time-of-day curves for traffic and foot traffic (rush hours, lunch, nightlife).
function trafficCurve(t) {
  const rush = Math.exp(-((t - 8) ** 2) / 1.1) + Math.exp(-((t - 17.4) ** 2) / 1.6);
  const base = t < 5 || t >= 23.5 ? 0.42 : t < 6.5 ? 0.62 : t >= 21 ? 0.72 : 0.9;
  return clamp(base + rush * 0.5, 0.4, 1.4);
}
function pedCurve(t) {
  const peaks = Math.exp(-((t - 8.2) ** 2) / 1.2) * 0.35 + Math.exp(-((t - 12.8) ** 2) / 1.4) * 0.4 + Math.exp(-((t - 18) ** 2) / 2.5) * 0.4;
  const base = t < 5 ? 0.25 : t < 7 ? 0.55 : t >= 23 ? 0.4 : t >= 20.5 ? 0.7 : 0.9;
  return clamp(base + peaks, 0.2, 1.4);
}
function isRushHour(t) { return (t >= 7.25 && t < 9.25) || (t >= 16.5 && t < 18.75); }
/* ---------------- road network: which lattice segments exist ----------------
   The arterial lattice (13 x 13 nodes) is still the backbone every AI drives on, but it is no
   longer a perfect grid: superblocks (stadium district, Greenway Park, the container terminal,
   the Crestmoor estate, Cedar Fields) swallow the road segments inside them, which turns
   crossroads into T-junctions and breaks up the long straight streets. Everything that reads
   the road layout (traffic, drive AI, GPS, pedestrians, lamps, signals, physics, the ground
   shader, the maps) asks RoadNet instead of assuming a full grid. Closures never touch the
   perimeter road or a race line, and never leave a dead end in the lattice. */
const SUPERBLOCKS = [
  { id: 'estate', bx0: 0, bz0: 0, bx1: 1, bz1: 0, gen: '_genEstate', peds: false, ground: 'W', land: 'W' },
  { id: 'park', bx0: 2, bz0: 2, bx1: 4, bz1: 3, gen: '_genBigPark', peds: true, ground: 'G', land: 'G' },
  { id: 'stadium', bx0: 7, bz0: 8, bx1: 9, bz1: 9, gen: '_genStadiumDistrict', peds: false, ground: 'Z', land: 'A' },
  { id: 'terminal', bx0: 10, bz0: 10, bx1: 11, bz1: 11, gen: '_genTerminal', peds: false, ground: 'A', land: 'T' },
  { id: 'fields', bx0: 0, bz0: 11, bx1: 3, bz1: 11, gen: '_genFields', peds: false, ground: 'F', land: 'F' }
];
function superblockAt(bx, bz) { for (const sb of SUPERBLOCKS) if (bx >= sb.bx0 && bx <= sb.bx1 && bz >= sb.bz0 && bz <= sb.bz1) return sb; return null; }
const RoadNet = {
  closed: new Set(),
  key(a, i, j) { return a * 10000 + i * 100 + j; },
  init() {
    this.closed.clear();
    for (const sb of SUPERBLOCKS) {
      for (let i = sb.bx0 + 1; i <= sb.bx1; i++) for (let j = sb.bz0; j <= sb.bz1; j++) this.closed.add(this.key(0, i, j));
      for (let j = sb.bz0 + 1; j <= sb.bz1; j++) for (let i = sb.bx0; i <= sb.bx1; i++) this.closed.add(this.key(1, j, i));
    }
  },
  // axis 0: the north-south road x = i*P, segment j runs from node (i,j) to (i,j+1)
  // axis 1: the east-west road z = i*P, segment j runs from node (j,i) to (j+1,i)
  segOpen(a, i, j) { return i >= 0 && i <= N && j >= 0 && j < N && !this.closed.has(this.key(a, i, j)); },
  open(i, j, dx, dz) { return dx ? this.segOpen(1, j, Math.min(i, i + dx)) : this.segOpen(0, i, Math.min(j, j + dz)); },
  degree(i, j) { let d = 0; if (this.open(i, j, 1, 0)) d++; if (this.open(i, j, -1, 0)) d++; if (this.open(i, j, 0, 1)) d++; if (this.open(i, j, 0, -1)) d++; return d; },
  isJunction(i, j) { return this.degree(i, j) >= 3; },
  // is the world point on a lattice road that exists?
  roadAt(x, z) {
    if (x < -ROAD_HALF || z < -ROAD_HALF || x > CITY + ROAD_HALF || z > CITY + ROAD_HALF) return false;
    const i = Math.round(x / P), j = Math.round(z / P);
    const onV = Math.abs(x - i * P) < ROAD_HALF, onH = Math.abs(z - j * P) < ROAD_HALF;
    if (!onV && !onH) return false;
    if (onV && onH) return this.degree(i, j) > 0;
    if (onV) return this.segOpen(0, i, clamp(Math.floor(z / P), 0, N - 1));
    return this.segOpen(1, j, clamp(Math.floor(x / P), 0, N - 1));
  },
  // block side -> is the road beside it open? side 0 north, 1 south, 2 west, 3 east (the _sidewalk order)
  sideOpen(bx, bz, side) { return side === 0 ? this.segOpen(1, bz, bx) : side === 1 ? this.segOpen(1, bz + 1, bx) : side === 2 ? this.segOpen(0, bx, bz) : this.segOpen(0, bx + 1, bz); },
  // shortest node path (BFS over open segments); falls back to the nearest reachable node
  path(i0, j0, i1, j1) {
    i0 = clamp(i0, 0, N); j0 = clamp(j0, 0, N); i1 = clamp(i1, 0, N); j1 = clamp(j1, 0, N);
    const W2 = N + 1, prev = new Int16Array(W2 * W2).fill(-1), q = [i0 * W2 + j0];
    prev[q[0]] = q[0];
    let best = q[0], bd = Math.abs(i0 - i1) + Math.abs(j0 - j1);
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = Math.floor(c / W2), j = c % W2;
      const d = Math.abs(i - i1) + Math.abs(j - j1); if (d < bd) { bd = d; best = c; }
      if (d === 0) break;
      for (const [dx, dz] of DIRS4) { if (!this.open(i, j, dx, dz)) continue; const n = (i + dx) * W2 + (j + dz); if (prev[n] < 0) { prev[n] = c; q.push(n); } }
    }
    const out = []; for (let c = best; ; c = prev[c]) { out.push([Math.floor(c / W2), c % W2]); if (prev[c] === c) break; }
    return out.reverse();
  },
  // nearest node that has at least one open segment
  nearNode(x, z) {
    let i = clamp(Math.round(x / P), 0, N), j = clamp(Math.round(z / P), 0, N);
    if (this.degree(i, j) > 0) return [i, j];
    let best = null, bd = 1e9;
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) if (this.degree(a, b) > 0) { const d = (a * P - x) ** 2 + (b * P - z) ** 2; if (d < bd) { bd = d; best = [a, b]; } }
    return best;
  },
  // data texture for the ground shader: R vertical seg open, G horizontal seg open, B junction, A node open
  texture() {
    const S = 16, d = new Uint8Array(S * S * 4);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const o = (j * S + i) * 4;
      d[o] = j < N && this.segOpen(0, i, j) ? 255 : 0;
      d[o + 1] = i < N && this.segOpen(1, j, i) ? 255 : 0;
      d[o + 2] = this.isJunction(i, j) ? 255 : 0;
      d[o + 3] = this.degree(i, j) > 0 ? 255 : 0;
    }
    const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  }
};
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
RoadNet.init();
/* ---------------- curved links: through-roads that leave the lattice ----------------
   A link is a curved local road whose two ends meet lattice roads side-on (T-junctions part way
   along a segment): Greenway Park Drive, the Cedar Fields road. The lattice graph itself never
   changes (saves, races, missions and police routing all rely on it); links are layered on top:
   traffic turns off onto them and merges back, and the GPS routes through them. */
const Links = {
  list: [], idx: new Map(),
  key(axis, line, seg) { return axis + ':' + line + ':' + seg; },
  // which lattice segment an end of a link meets, and where along it
  attach(E) {
    const i = Math.round(E[0] / P), j = Math.round(E[1] / P), dV = Math.abs(E[0] - i * P), dH = Math.abs(E[1] - j * P);
    let a;
    if (dV <= dH) { const seg = clamp(Math.floor(E[1] / P), 0, N - 1); a = { axis: 0, line: i, seg, along: E[1] - seg * P, C: { x: i * P, z: E[1] }, d: dV }; }
    else { const seg = clamp(Math.floor(E[0] / P), 0, N - 1); a = { axis: 1, line: j, seg, along: E[0] - seg * P, C: { x: E[0], z: j * P }, d: dH }; }
    return a.d <= ROAD_HALF + 1.5 && a.along > TURN_IN + 4 && a.along < P - TURN_IN - 4 && RoadNet.segOpen(a.axis, a.line, a.seg) ? a : null;
  },
  // an end that meets another curved road part way along it (a Y-junction, a lane off a lane): the point on that road
  attachLink(E, world, self) {
    let best = null;
    for (const r of world.localRoads) {
      if (!r.link || r.k !== 'line' || r === self) continue;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = clamp(((E[0] - a[0]) * dx + (E[1] - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(E[0] - px, E[1] - pz);
        if (d <= 0.5 && (!best || d < best.d)) best = { axis: -1, onLink: r.link, C: { x: px, z: pz }, d };
      }
    }
    return best;
  },
  build(world) {
    this.list = []; this.idx.clear();
    for (const r of world.localRoads) {
      if (!r.link || r.k !== 'line') continue;
      // a spur (the Valen Point causeway) meets the lattice at its first end only; its far end is a turning circle.
      // An end may also meet another curved road (Curved Roads pass: Y-junctions, the farm track off Cedar Fields Road)
      const last = r.pts[r.pts.length - 1];
      const a = this.attach(r.pts[0]) || this.attachLink(r.pts[0], world, r), b = r.spur ? { free: true, axis: -1, C: { x: last[0], z: last[1] } } : this.attach(last) || this.attachLink(last, world, r);
      if (!a || !b) continue;
      const cum = [0]; for (let k = 1; k < r.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]));
      const L = { id: this.list.length, name: r.link, pts: r.pts, w: r.w, cum, len: cum[cum.length - 1], lane: Math.min(LANE, r.w / 4), ends: [a, b], road: r, spur: !!r.spur, ring: r.ring || null };
      this.list.push(L);
      L.ends.forEach((e, k) => { if (e.free || e.onLink) return; const key = this.key(e.axis, e.line, e.seg); if (!this.idx.has(key)) this.idx.set(key, []); this.idx.get(key).push({ link: L, e: k, end: e }); });
    }
    world.links = this.list;
  },
  // the lane polyline from end `from` to the other end, offset to the right-hand side of travel
  lane(L, from) {
    const c = from === 0 ? L.pts : L.pts.slice().reverse(), off = L.lane, out = [];
    for (let k = 0; k < c.length; k++) {
      const a = c[Math.max(0, k - 1)], b = c[Math.min(c.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      out.push([c[k][0] - tz * off, c[k][1] + tx * off]);
    }
    return out;
  },
  // a spur's whole lane for a car: out on the right-hand side, round the turning circle, back to the lattice
  loop(L) {
    const out = this.lane(L, 0), back = this.lane(L, 1), R0 = L.ring;
    if (!R0) return [...out, ...back];
    const e = out[out.length - 1], s = back[0];
    let a0 = Math.atan2(e[1] - R0.z, e[0] - R0.x), a1 = Math.atan2(s[1] - R0.z, s[0] - R0.x);
    // the long way round, by the far side of the circle (the angle falls from a0 to a1)
    while (a1 >= a0) a1 -= Math.PI * 2;
    const arc = [], m = Math.max(6, Math.ceil((a0 - a1) / 0.15));
    for (let i = 1; i < m; i++) { const a = a0 + (a1 - a0) * i / m; arc.push([R0.x + Math.cos(a) * R0.r, R0.z + Math.sin(a) * R0.r]); }
    return [...out, ...arc, ...back];
  },
  // nearest point on one link
  nearestOn(L, x, z) { const s = this.list; this.list = [L]; const r = this.nearest(x, z); this.list = s; return r; },
  // nearest point on any link: { link, k (segment), x, z, d, along (metres from end 0) }
  nearest(x, z) {
    let best = null;
    for (const L of this.list) for (let k = 0; k < L.pts.length - 1; k++) {
      const a = L.pts[k], b = L.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { link: L, k, x: px, z: pz, d, along: L.cum[k] + Math.sqrt(l2) * t };
    }
    return best;
  }
};
/* ---------------- local roads: streets that are not part of the lattice ----------------
   Cul-de-sacs, crescents, the stadium ring road, container lanes, park drives and farm tracks.
   They are drawn into one raster (about 0.7 m per texel, the same footprint as the AO map):
   R asphalt, G gravel/dirt, B concrete yard. The ground shader paints from it, the maps draw
   the same shapes, and the CPU copy answers "is this point on a local road?" for prop
   placement and for keeping houses, trees and poles out of the way. */
const LOCAL = { S: 1536, data: null, canvas: null };
// is (x,z) on a local lane (street, drive, path)? Lots and yards do not count.
function localRoadAt(x, z) {
  const d = LOCAL.lane; if (!d) return 0;
  const S = LOCAL.S, u = Math.floor((x + 48) / 1056 * S), v = Math.floor((z + 48) / 1056 * S);
  if (u < 0 || v < 0 || u >= S || v >= S) return 0;
  return d[v * S + u] > 140 ? 1 : 0;
}
function localSurfaceAt(x, z) {
  const d = LOCAL.data; if (!d) return 0;
  const S = LOCAL.S, u = Math.floor((x + 48) / 1056 * S), v = Math.floor((z + 48) / 1056 * S);
  if (u < 0 || v < 0 || u >= S || v >= S) return 0;
  const o = (v * S + u) * 4;
  return d[o] > 150 ? 1 : d[o + 1] > 150 ? 2 : d[o + 2] > 150 ? 3 : 0;
}
// Ground height: road surface 0, raised sidewalks/blocks at CURB_H.
// step: how far above the reference height y a surface may be and still count as ground (people
// climb 1.25 m onto a deck edge; a car's wheel only rides up CAR_STEP and treats anything higher as a wall)
// After a call SURF.gx / SURF.gz hold the slope of the ground that was found (dh/dx, dh/dz).
// On the Cedar Fields terrain (Session 6C) the slope is the height field's, and Terrain.hit / Terrain.rough say that
// the ground came from it and how much of its height is the fine rough layer (the suspension's business).
function groundY(x, z, y, step) {
  SURF.gx = 0; SURF.gz = 0; Terrain.hit = false;
  if (y !== undefined && y < -12 && typeof vspaceFloor === 'function') { const f = vspaceFloor(x, z, y); if (f !== null) return f; }
  const b = groundBase(x, z), hit = Terrain.hit, tgx = Terrain.gx, tgz = Terrain.gz;
  const s = surfaceY(x, z, y, step);
  if (s > b) { Terrain.hit = false; return s; }
  SURF.gx = hit ? tgx : 0; SURF.gz = hit ? tgz : 0;
  return b;
}
function groundBase(x, z) {
  // Valen Point (the island and its causeway, from the perimeter road out) is flat at road level
  if (x > CITY + ROAD_HALF && (vpCauseway(x, z) || vpLand(x, z))) return 0;
  // the Cedar Fields strip, the land bridge and the countryside south of it: the height field
  if (Terrain.ready) { Terrain.hit = false; const t = Terrain.height(x, z); if (t !== null) return t; }
  if (x < -EDGE_MARGIN || z < -EDGE_MARGIN || x > CITY + EDGE_MARGIN || z > CITY + EDGE_MARGIN) return -3;
  // roads sit at 0; everything else (blocks, the outer promenade, closed road strips) is raised
  // (the kerb is cut where a curved road leaves a lattice street: a ramp in the gutter, CurbCuts in 135)
  return RoadNet.roadAt(x, z) ? (CurbCuts.n ? CurbCuts.at(x, z) : 0) : CURB_H;
}
function isOnRoad(x, z) { return RoadNet.roadAt(x, z); }
// Streetlight positions for one block (must match the ground shader formula).
const LAMP_OFFS = [16, 40, 64];
const LAMP_SIDE = 6.8;
function blockLamps(bx, bz) {
  const out = [];
  const x0 = bx * P, z0 = bz * P;
  for (const o of LAMP_OFFS) {
    out.push([x0 + LAMP_SIDE, z0 + o, -Math.PI / 2]);      // west side, arm toward -x road
    out.push([x0 + P - LAMP_SIDE, z0 + o, Math.PI / 2]);   // east side, arm toward +x road
    out.push([x0 + o, z0 + LAMP_SIDE, Math.PI]);           // north side
    out.push([x0 + o, z0 + P - LAMP_SIDE, 0]);             // south side
  }
  return out;
}

