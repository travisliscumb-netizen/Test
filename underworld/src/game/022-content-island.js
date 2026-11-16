/* =====================================================================
   [CONTENT] VALEN ISLAND (Operation Blackgate)
   The whole world as one island. The lattice city no longer stands in a
   square of sea: it sits on the waist of an hourglass island, with the
   highlands (Mount Valen, the Crestmoor ridge, the Blackgate ridge) to the
   north, the lowlands (Cedar Fields, the airport, the proving ground, the
   long beach) to the south, Valen Bay on its west waterfront and Valen
   Sound, with Valen Point in it, on its east.
   - the coast: a closed spline (ISLE_COAST) and a few islets, kept as a
     signed-distance grid (16 m) with noise on it wherever nothing built
     needs the shore to stay put;
   - the ground: an analytic height (the shore's profile, the lobes'
     hills) with level pads blended in (the city, Cedar Fields, the
     airport, building sites) and a road bed cut or banked for every road,
     baked on demand into 256 m tiles of 4 m cells. The physics reads the
     tiles as the same two triangles a cell is drawn with, so a wheel sits
     on what you see;
   - two-level ground: a bridge's deck over the water and the Blackgate
     Tunnel's floor under the ridge are answered by the reference height
     (groundY's y), like the city's decks;
   - the sea: you can wade (ISLE.wade deep), a car bogs down in it.
   Everything off the lattice asks Island: groundBase, the scenery, the
   maps, zones, spawns.
   ===================================================================== */
const SEA_Y = -1.2;
const ISLE = { name: 'Valen Island', x0: -2560, z0: -3328, x1: 3072, z1: 3072, tile: 256, cell: 4, wade: 1.25, sdfCell: 16, sdfMax: 400, shMax: 34, verge: 6 };
const WORLD_X0 = ISLE.x0, WORLD_Z0 = ISLE.z0;
// the coast, clockwise from the city's north-west corner: Valen Bay's north shore and Blackgate Point, the highlands'
// west coast, the north cape, the east coast and the north shore of Valen Sound, the city's east side (inside the
// city's own square, whose seawall is the real edge there), the lowlands' north coast, the east cape, the south
// coast, the long beach, the south headland and the bay's south shore
const ISLE_COAST = [
  [30, 70], [-260, -40], [-640, -60], [-980, 40], [-1120, 235], [-1300, 150], [-1500, -150], [-1750, -500], [-2050, -900],
  [-2200, -1400], [-2050, -1900], [-1750, -2300], [-1300, -2550], [-800, -2900], [-200, -3100], [400, -3000], [1000, -2750],
  [1500, -2830], [2100, -2600], [2500, -2200], [2700, -1700], [2600, -1200], [2300, -800], [2500, -450], [2250, -200],
  [1800, -230], [1400, -170], [1120, -130], [960, 30], [930, 500], [930, 900], [790, 940], [800, 1080], [900, 1200],
  [1150, 1230], [1500, 1150], [1900, 1160], [2300, 1300], [2450, 1650], [2300, 2050], [2000, 2300], [1700, 2700],
  [1200, 2900], [600, 2850], [0, 2900], [-500, 2700], [-900, 2300], [-1150, 1900], [-1250, 1500], [-1300, 1100],
  [-1260, 940], [-1100, 760], [-880, 900], [-600, 1000], [-300, 960], [-100, 900], [30, 860]
];
// islets: [x, z, radius, name]
const ISLE_ISLETS = [[-560, 470, 78, 'Battery Island'], [-1720, 520, 120, 'Gull Rock'], [2860, -900, 135, 'Tern Island'], [-1450, 2720, 150, 'Castaway Cay'], [2680, 2480, 165, 'Dutchman’s Rest'], [-2330, -2480, 120, 'Widow’s Tooth']];
// where the shore must stay exactly as drawn (no coast noise): the city, Cedar Fields, the airport, the proving
// ground, the bridge's two headlands, the lighthouse point
const ISLE_KEEP = [[-140, -140, 1100, 1100], [-80, 980, 740, 1550], [-330, 1740, 1530, 2600], [800, 1420, 2040, 1760], [-1260, 60, -960, 360], [-1250, 690, -940, 990], [1380, -2900, 1680, -2620]];
// the airport and the proving ground (level pads; built in 127)
const AIRPORT = { name: 'Port Valen International', x0: -250, z0: 1820, x1: 1450, z1: 2520, y: 3.2,
  rw: [{ id: '09/27', z: 2410, x0: -170, x1: 1370, w: 46 }, { id: '09R/27L', z: 2205, x0: 120, x1: 1220, w: 32 }],
  tw: { z: 2085, x0: -120, x1: 1320, w: 18 }, links: [0, 420, 840, 1260], apron: { x0: 230, z0: 1945, x1: 1330, z1: 2050 } };
const PROVING = { name: 'Valen Proving Ground', x0: 880, z0: 1490, x1: 1960, z1: 1690, y: 3.0, strip: { z: 1528, x0: 900, x1: 1940, w: 22 }, pad: { x: 1120, z: 1622, r: 52 }, lot: { x0: 1280, z0: 1575, x1: 1900, z1: 1675 } };
// Lake Valen: an inland sea in the highlands' east, between the mountain and the east hills (its water is the sea's level)
const LAKE = { name: 'Lake Valen', x: 1650, z: -900, rx: 330, rz: 235 };
// Mount Valen's summit and the Blackgate ridge's crest line
const MT_VALEN = { x: 350, z: -1750, h: 250, r: 800 };
const BG_RIDGE = { ax: -2150, az: -1220, bx: -650, bz: -1560, h: 100, r: 150 };
/* ---------------- the road network off the lattice ----------------
   Each road is a spline through its control points, sampled every 2.5 m like the city's curved streets. An end is 'lat' (it meets a perimeter road of
   the lattice at the kerb), a road's id (it ends on that road: the end is moved onto that road's nearest point) or
   'ring' (a turning circle). deck: a bridge's height over the water; cut: where the road goes through a ridge instead
   of over it, one even grade for `half` m either side of the point (the Blackgate Tunnel). Order matters: a road can
   only end on one listed before it. */
function isleSpiral(cx, cz, r0, a0, r1, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (a0 + (a1 - a0) * t) * Math.PI / 180, r = r0 + (r1 - r0) * t; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return out; }
const ISLE_ROADS = [
  { id: 'n1', name: 'Coast Highway', w: 11, grade: 0.07, ends: ['lat', 'lat'], cut: { x: -1925, z: -1270, half: 340 },
    pts: [[120, -6], [120, -60], [95, -170], [-10, -270], [-240, -330], [-560, -330], [-860, -300], [-1180, -380], [-1500, -640], [-1740, -950], [-1930, -1250], [-1900, -1560], [-1740, -1850], [-1470, -2130], [-1060, -2400], [-560, -2700], [-60, -2790], [450, -2700], [960, -2490], [1460, -2500], [1960, -2320], [2280, -1940], [2400, -1450], [2180, -950], [1900, -600], [1520, -430], [1160, -330], [930, -230], [845, -110], [840, -60], [840, -6]] },
  { id: 'n2', name: 'Mount Valen Road', w: 9, grade: 0.11, ends: ['n1', 'ring'], ring: 15,
    pts: [[-10, -270], [-150, -420], [-60, -560], [140, -604], [330, -590], ...isleSpiral(MT_VALEN.x, MT_VALEN.z, 1150, 85, 78, -410, 44)] },
  { id: 'n3', name: 'Highland Pass', w: 9, grade: 0.09, ends: ['n2', 'n1'], pts: [[1315, -1750], [1480, -1880], [1720, -1930], [2020, -1830], [2330, -1700]] },
  { id: 'n4', name: 'Lighthouse Road', w: 8, grade: 0.09, ends: ['n1', 'ring'], ring: 13, pts: [[1620, -2452], [1642, -2560], [1602, -2680], [1548, -2745], [1530, -2772]] },
  { id: 's1', name: 'Southshore Highway', w: 11, grade: 0.07, ends: ['lat', 'lat'],
    pts: [[40, 966], [40, 984], [34, 1002], [20, 1016], [-2, 1023], [-28, 1025], [-55, 1034], [-76, 1056], [-90, 1090], [-100, 1150], [-104, 1230], [-110, 1420], [-60, 1580], [80, 1680], [330, 1722], [600, 1716], [735, 1620], [762, 1420], [752, 1240], [742, 1150], [722, 1080], [700, 1035], [686, 1005], [680, 985], [680, 966]] },
  { id: 's2', name: 'Airport Access', w: 10, grade: 0.07, ends: ['s1', 'ring'], ring: 17, pts: [[600, 1716], [600, 1770], [600, 1820], [600, 1856]] },
  { id: 's3', name: 'Blackgate Bridge', w: 12, grade: 0.065, deck: 16, ends: ['s1', 'n1'],
    pts: [[-100, 1230], [-270, 1192], [-520, 1172], [-780, 1130], [-960, 1060], [-1062, 960], [-1090, 860], [-1096, 700], [-1100, 500], [-1104, 300], [-1100, 190], [-1085, 60], [-1000, -140], [-920, -250], [-860, -300]] },
  { id: 's4', name: 'Longshore Drive', w: 10, grade: 0.08, ends: ['s3', 's1'],
    pts: [[-780, 1130], [-930, 1300], [-1010, 1560], [-960, 1860], [-780, 2180], [-500, 2470], [-140, 2700], [400, 2710], [1000, 2710], [1420, 2640], [1700, 2380], [1980, 2080], [2120, 1750], [2010, 1420], [1650, 1330], [1200, 1375], [900, 1350], [756, 1330]] },
  { id: 's5', name: 'Proving Ground Road', w: 9, grade: 0.07, ends: ['s4', 'ring'], ring: 14, pts: [[1200, 1375], [1200, 1430], [1200, 1475]] }
];
const Island = {
  ready: false, sdf: null, SW: 0, SH: 0, pads: [], roads: [], tiles: new Map(), _seg: new Map(), _sseg: new Map(), _multi: new Set(),
  // left by the last height(): the slope of the ground found
  gx: 0, gz: 0,
  _fx: { grip: 1, drag: 0, bump: 0, s: 0 },
  // ---------------------------------------------------------------- the coast
  // the coast's outline: a closed Catmull-Rom through ISLE_COAST, a point about every 24 m
  coastLine() {
    if (this._coast) return this._coast;
    const P0 = ISLE_COAST, n = P0.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = P0[(i - 1 + n) % n], b = P0[i], c = P0[(i + 1) % n], d = P0[(i + 2) % n];
      const m = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 24));
      for (let k = 0; k < m; k++) {
        const t = k / m, t2 = t * t, t3 = t2 * t;
        const f = (p, q, r, s) => 0.5 * (2 * q + (r - p) * t + (2 * p - 5 * q + 4 * r - s) * t2 + (3 * q - p - 3 * r + s) * t3);
        out.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
      }
    }
    return this._coast = out;
  },
  // how freely the shore may wander here: 0 inside a kept rectangle, 1 from 200 m out
  _coastAmp(x, z) {
    let a = 1;
    for (const K of ISLE_KEEP) { const dx = Math.max(K[0] - x, 0, x - K[2]), dz = Math.max(K[1] - z, 0, z - K[3]); a = Math.min(a, smoothstep(0, 200, Math.hypot(dx, dz))); if (a === 0) break; }
    return a;
  },
  _buildSDF() {
    const c = ISLE.sdfCell, W = Math.round((ISLE.x1 - ISLE.x0) / c) + 1, H = Math.round((ISLE.z1 - ISLE.z0) / c) + 1, MAXD = ISLE.sdfMax;
    const line = this.coastLine(), n = line.length, d2 = new Float32Array(W * H).fill(MAXD * MAXD);
    // the distance to the outline: each segment lowers the points within MAXD of it
    for (let k = 0; k < n; k++) {
      const a = line[k], b = line[(k + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0]) - MAXD - ISLE.x0) / c)), i1 = Math.min(W - 1, Math.floor((Math.max(a[0], b[0]) + MAXD - ISLE.x0) / c));
      const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1]) - MAXD - ISLE.z0) / c)), j1 = Math.min(H - 1, Math.floor((Math.max(a[1], b[1]) + MAXD - ISLE.z0) / c));
      for (let j = j0; j <= j1; j++) {
        const pz = ISLE.z0 + j * c - a[1];
        for (let i = i0; i <= i1; i++) {
          const px = ISLE.x0 + i * c - a[0], t = clamp((px * dx + pz * dz) / l2, 0, 1), ex = px - dx * t, ez = pz - dz * t, d = ex * ex + ez * ez, o = j * W + i;
          if (d < d2[o]) d2[o] = d;
        }
      }
    }
    const sdf = new Float32Array(W * H), xs = [], E = EDGE_MARGIN;
    for (let j = 0; j < H; j++) {
      const z = ISLE.z0 + j * c, zs = z + 0.0137;
      // inside the outline: even-odd along the row
      xs.length = 0;
      for (let k = 0; k < n; k++) { const a = line[k], b = line[(k + 1) % n]; if ((a[1] > zs) !== (b[1] > zs)) xs.push(a[0] + (zs - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      let q = 0, inside = false;
      for (let i = 0; i < W; i++) {
        const x = ISLE.x0 + i * c;
        while (q < xs.length && xs[q] < x) { inside = !inside; q++; }
        let d = Math.sqrt(d2[j * W + i]); if (inside) d = -d;
        for (const I of ISLE_ISLETS) d = Math.min(d, Math.hypot(x - I[0], z - I[1]) - I[2]);
        const amp = this._coastAmp(x, z);
        if (amp > 0) d += amp * (38 * tNoise(x / 330, z / 330, 91) + 15 * tNoise(x / 105, z / 105, 93));
        // every precinct of the city (to its seawall, 021) is land whatever the outline does
        let dc = Infinity;
        for (const p of CityLayout.precincts) {
          const ex = Math.max(p.x0 - E - x, x - p.x1 - E), ez = Math.max(p.z0 - E - z, z - p.z1 - E);
          dc = Math.min(dc, ex > 0 || ez > 0 ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez));
        }
        sdf[j * W + i] = clamp(Math.min(d, dc), -MAXD, MAXD);
      }
    }
    this.sdf = sdf; this.SW = W; this.SH = H;
  },
  // signed distance to the shore (m): negative on land, positive at sea
  sd(x, z) {
    const c = ISLE.sdfCell, u = (x - ISLE.x0) / c, v = (z - ISLE.z0) / c, W = this.SW;
    if (u < 0 || v < 0 || u >= W - 1 || v >= this.SH - 1) return ISLE.sdfMax;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j, o = j * W + i, s = this.sdf;
    return (s[o] * (1 - fx) + s[o + 1] * fx) * (1 - fz) + (s[o + W] * (1 - fx) + s[o + W + 1] * fx) * fz;
  },
  // ---------------------------------------------------------------- the natural ground
  // the island before anything is built on it: the shore's profile (a seabed shelving away, a beach, a coastal
  // plain) and the hills of each lobe, which die away toward the coast
  nat(x, z) {
    const d = -this.sd(x, z);
    if (d <= 0) return Math.max(SEA_Y - 6, SEA_Y + d * 0.07);
    const G = (dx, dz, r) => Math.exp(-(dx * dx + dz * dz) / (r * r));
    const shore = SEA_Y + 2.5 * smoothstep(0, 36, d) + 1.3 * smoothstep(36, 170, d), inl = smoothstep(26, 360, d);
    const wN = 1 - smoothstep(-260, 60, z), wS = smoothstep(980, 1220, z);
    let hills = 0, extra = 0;
    if (wN > 0) {
      // Mount Valen (rugged), the east hills, the north cape, the Crestmoor ridge above the city, the west and north-east rises
      let m = MT_VALEN.h * G(x - MT_VALEN.x, z - MT_VALEN.z, MT_VALEN.r) * (0.88 + 0.12 * (1 - Math.abs(tNoise(x / 360, z / 360, 61))));
      m += 85 * G(x - 1750, z + 1450, 560) + 60 * G(x + 250, z + 2500, 480) + 44 * G(x - 330, z + 520, 330) + 45 * G(x - 1050, z + 2250, 400) + 38 * G(x + 1500, z + 500, 380);
      m += (6 * tNoise(x / 190, z / 190, 63) + 2 * tNoise(x / 67, z / 67, 65)) * smoothstep(8, 60, m);
      hills += wN * m;
      // the Blackgate ridge runs from the mountain's shoulder down to the west coast and ends in a cliff
      const R = BG_RIDGE, rx = R.bx - R.ax, rz = R.bz - R.az, t = clamp(((x - R.ax) * rx + (z - R.az) * rz) / (rx * rx + rz * rz), 0, 1), dr = Math.hypot(x - R.ax - rx * t, z - R.az - rz * t);
      extra += wN * R.h * Math.exp(-dr * dr / (R.r * R.r)) * smoothstep(10, 130, d);
    }
    if (wS > 0) hills += wS * (34 * G(x - 2260, z - 1660, 330) + 14 * G(x + 760, z - 1560, 380) + 18 * G(x - 300, z - 2790, 300));
    // the two bluffs the bridge springs from
    extra += 13 * (G(x + 1105, z - 215, 150) + G(x + 1088, z - 835, 150)) * smoothstep(4, 60, d);
    const roll = 2.2 * (tNoise(x / 240, z / 240, 51) + 0.55) + 1.1 * tNoise(x / 84, z / 84, 53) + 0.35 * tNoise(x / 29, z / 29, 55);
    const h = shore + inl * (hills + roll * (0.5 + 1.2 * Math.max(wN, wS))) + extra;
    // Lake Valen's basin: the ground eases down to a bed below the sea's level, the shore wandering a little
    const lx = (x - LAKE.x) / LAKE.rx, lz = (z - LAKE.z) / LAKE.rz, le = lx * lx + lz * lz;
    if (le < 2.6) { const k = 1 - smoothstep(0.55, 1.75, le + 0.22 * tNoise(x / 120, z / 120, 57)); return h * (1 - k) + (SEA_Y - 4.5) * k; }
    return h;
  },
  // a level pad: the ground is exactly y inside the rectangle and eases back to the natural ground over `blend` m
  // outside it (only where that ground is land: a pad on the shore does not fill the sea in)
  addPad(x0, z0, x1, z1, y, blend = 40) { const P = { x0, z0, x1, z1, y, blend }; this.pads.push(P); return P; },
  // the natural ground with the pads in it
  base0(x, z) {
    let h = this.nat(x, z);
    const land = smoothstep(SEA_Y + 0.15, SEA_Y + 1.5, h);
    for (const P of this.pads) {
      const dx = Math.max(P.x0 - x, 0, x - P.x1), dz = Math.max(P.z0 - z, 0, z - P.z1);
      if (dx === 0 && dz === 0) { h = P.y; continue; }
      if (dx >= P.blend || dz >= P.blend) continue;
      const dd = Math.hypot(dx, dz); if (dd >= P.blend) continue;
      const k = (1 - smoothstep(0, P.blend, dd)) * land;
      h = P.y * k + h * (1 - k);
    }
    return h;
  },
  // ---------------------------------------------------------------- roads
  // lay the network out: sample each road, move its ends onto the roads they meet, then give each a level along its
  // length (its profile) and index the segments. Called once by the world's generator, after the pads are in.
  buildRoads() {
    this.roads = []; const byId = {};
    for (const D of ISLE_ROADS) {
      // a control point authored at the city's edge (its 'lat' end and the approach to it) moves with the precinct
      // whose streets it meets (021); out on the island it stays where it was drawn
      const cp = D.pts.map(p => CityLayout.anchor(p[0], p[1])), hosts = [null, null];
      D.ends.forEach((e, k) => {
        const H = byId[e]; if (!H) return;
        const q = k ? cp[cp.length - 1] : cp[0]; let best = 0, bd = Infinity;
        H.pts.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = i; } });
        const p = H.pts[best]; if (k) cp[cp.length - 1] = [p[0], p[1]]; else cp[0] = [p[0], p[1]];
        hosts[k] = { road: H, k: best };
      });
      const pts = splinePts(cp, 2.5);
      const R = { id: D.id, name: D.name, w: D.w, grade: D.grade, deck: D.deck, cut: D.cut || null, ends: D.ends, ring: null, pts, hosts, st: D.st || 'asphalt' };
      if (D.ring) { const a = pts[pts.length - 2], b = pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; R.ring = { x: b[0] + (b[0] - a[0]) / l * D.ring, z: b[1] + (b[1] - a[1]) / l * D.ring, r: D.ring }; }
      this._profile(R);
      this.roads.push(R); byId[R.id] = R;
    }
    this._indexRoads();
    this.tiles.clear();
    this.ready = true;
  },
  // a road's level at each of its points. Over water it is a bridge (its deck's height); through a cut it holds one
  // grade from end to end (the deep part is the tunnel); elsewhere it follows the ground, averaged over about 40 m
  // either side, pinned where it meets the lattice or another road, and never steeper than its grade.
  _profile(R) {
    const pts = R.pts, n = pts.length, cum = new Float64Array(n), raw = new Float64Array(n), nat = new Float64Array(n), sp = new Uint8Array(n), pin = new Float64Array(n).fill(NaN);
    for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const deck = R.deck !== undefined ? R.deck : SEA_Y + 4.4;
    for (let k = 0; k < n; k++) {
      const h = this.base0(pts[k][0], pts[k][1]); nat[k] = h;
      if (h < SEA_Y + 0.7) { sp[k] = 1; raw[k] = deck; } else raw[k] = Math.max(h, SEA_Y + 1.7);
    }
    // a bridge's span reaches a little past the water's edge onto the abutments
    for (let pass = 0; pass < 2; pass++) { const c = sp.slice(); for (let k = 0; k < n; k++) if (c[k] === 1 && pass < 2) { if (k > 0 && !c[k - 1]) sp[k - 1] = 1; if (k < n - 1 && !c[k + 1]) sp[k + 1] = 1; } }
    // the ends: the lattice's kerb level, the level of the road it meets, or the ground itself
    // (held for as long as it runs beside the other road, at that road's level abreast of it, or over the city's
    // promenade: the ground there is theirs)
    R.ends.forEach((e, k) => {
      const i = k ? n - 1 : 0, H = R.hosts[k]; if (e !== 'lat' && !H) return;
      for (let j = 0; j < n; j++) {
        const q = k ? n - 1 - j : j, along = Math.abs(cum[q] - cum[i]);
        if (e === 'lat') { if (along > EDGE_MARGIN - ROAD_HALF + 2) break; pin[q] = CURB_H; continue; }
        // (as far as its own carriageway is still on the other road's verge, 150 m at most)
        const hp = H.road.pts; let best = H.k, bd = Infinity;
        for (let m = Math.max(0, H.k - 40); m <= Math.min(hp.length - 1, H.k + 40); m++) { const d = Math.hypot(hp[m][0] - pts[q][0], hp[m][1] - pts[q][1]); if (d < bd) { bd = d; best = m; } }
        if (bd - H.road.w / 2 > ISLE.verge + R.w / 2 + 2 || along > 150) break;
        pin[q] = H.road.y[best];
      }
    });
    // the cut: from where the ground first rises above T either side of the ridge, one even grade
    let cut = null;
    if (R.cut) {
      let c = 0, bd = Infinity; for (let k = 0; k < n; k++) { const d = Math.hypot(pts[k][0] - R.cut.x, pts[k][1] - R.cut.z); if (d < bd) { bd = d; c = k; } }
      let a = c, b = c; while (a > 1 && cum[c] - cum[a] < R.cut.half) a--; while (b < n - 2 && cum[b] - cum[c] < R.cut.half) b++;
      cut = [a, b];
    }
    const avg = (src, rad) => { const out = new Float64Array(n); let lo = 0, hi = 0, s = 0; for (let k = 0; k < n; k++) { while (hi < n && cum[hi] - cum[k] <= rad) s += src[hi++]; while (cum[k] - cum[lo] > rad) s -= src[lo++]; out[k] = s / (hi - lo); } return out; };
    if (cut) for (let k = cut[0]; k <= cut[1]; k++) raw[k] = raw[cut[0]] + (raw[cut[1]] - raw[cut[0]]) * (cum[k] - cum[cut[0]]) / ((cum[cut[1]] - cum[cut[0]]) || 1);
    let y = avg(avg(raw, 40), 40);
    for (let k = 0; k < n; k++) if (!isNaN(pin[k])) { const dl = pin[k] - y[k]; for (let j = 0; j < n; j++) { const f = 1 - Math.abs(cum[j] - cum[k]) / 60; if (f > 0) y[j] += dl * f * f * (3 - 2 * f); } }
    for (let k = 0; k < n; k++) if (!isNaN(pin[k])) y[k] = pin[k];
    // no steeper than the grade: out from the first end, then back from the last (a pinned end stays put; two pins
    // further apart in height than the road is long enough for leave the step at the first end, which the preview tool reports)
    for (let pass = 0; pass < 2; pass++) for (let k = 1; k < n; k++) { const i = pass ? n - 1 - k : k, j = pass ? i + 1 : i - 1, ds = Math.abs(cum[i] - cum[j]) * R.grade; if (isNaN(pin[i])) y[i] = clamp(y[i], y[j] - ds, y[j] + ds); }
    // the tunnel: the part of the cut with at least 8.5 m of hill over the road
    if (cut) { for (let k = cut[0]; k <= cut[1]; k++) if (nat[k] - y[k] > 8.5) sp[k] = 2; let a = -1, b = -1; for (let k = 0; k < n; k++) if (sp[k] === 2) { if (a < 0) a = k; b = k; } for (let k = a; k <= b && a >= 0; k++) sp[k] = 2; R.tunnel = a >= 0 ? [a, b] : null; }
    R.cum = cum; R.len = cum[n - 1]; R.y = y; R.sp = sp;
    // the bridges: runs of span points over water
    R.bridges = []; for (let k = 0; k < n; k++) if (sp[k] === 1) { let b = k; while (b < n - 1 && sp[b + 1] === 1) b++; R.bridges.push([k, b]); k = b; }
  },
  _indexRoads() {
    this._seg.clear(); this._sseg.clear(); this._multi.clear();
    const C = 64, T = ISLE.tile;
    this.roads.forEach((R, ri) => {
      const reach = R.w / 2 + ISLE.verge + ISLE.shMax;
      for (let k = 0; k < R.pts.length - 1; k++) {
        const a = R.pts[k], b = R.pts[k + 1], span = R.sp[k] && R.sp[k + 1], id = ri * 65536 + k;
        const put = (M, m) => { for (let cx = Math.floor((Math.min(a[0], b[0]) - m) / C); cx <= Math.floor((Math.max(a[0], b[0]) + m) / C); cx++) for (let cz = Math.floor((Math.min(a[1], b[1]) - m) / C); cz <= Math.floor((Math.max(a[1], b[1]) + m) / C); cz++) { const key = (cx + 512) * 1024 + cz + 512; let L = M.get(key); if (!L) M.set(key, L = []); L.push(id); } };
        if (!span) put(this._seg, reach);
        if (R.sp[k] || R.sp[k + 1]) {
          put(this._sseg, R.w / 2 + 4);
          for (let tx = Math.floor((Math.min(a[0], b[0]) - R.w - ISLE.x0) / T); tx <= Math.floor((Math.max(a[0], b[0]) + R.w - ISLE.x0) / T); tx++) for (let tz = Math.floor((Math.min(a[1], b[1]) - R.w - ISLE.z0) / T); tz <= Math.floor((Math.max(a[1], b[1]) + R.w - ISLE.z0) / T); tz++) this._multi.add(tz * 64 + tx);
        }
      }
    });
  },
  // the nearest road bed to (x, z) among the segments indexed in M: sets _rd (distance outside the road's edge),
  // _ry (the road's level there), _rr (the road), _rk (segment), _rt (how far along the segment), _ro (signed offset)
  _nearRoad(M, x, z) {
    const L = M.get((Math.floor(x / 64) + 512) * 1024 + Math.floor(z / 64) + 512); if (!L) return false;
    // (on its own carriageway and verge a road listed earlier wins over one listed later: the road another joins keeps
    // its own level right through the junction, and the joining road meets it)
    let bd = Infinity, bk = Infinity;
    for (let q = 0; q < L.length; q++) {
      const id = L[q], ri = (id / 65536) | 0, R = this.roads[ri], k = id % 65536, a = R.pts[k], b = R.pts[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
      const ox = x - a[0] - dx * t, oz = z - a[1] - dz * t, d = Math.hypot(ox, oz) - R.w / 2, key = d < ISLE.verge ? ri * 100 + Math.max(d, 0) * 0.001 + (d < 0 ? d * 1e-6 : 0) : 1e6 + d;
      if (key < bk) { bk = key; bd = d; this._rr = R; this._rk = k; this._rt = t; this._ry = R.y[k] + (R.y[k + 1] - R.y[k]) * t; }
    }
    this._rd = bd;
    return bd < Infinity;
  },
  // the ground at (x, z): the natural ground and pads with the road beds cut or banked into it (bridge decks and
  // the tunnel's floor are not part of it: see _spanAt). o.wide: for the far mesh (32 m apart), the ground within
  // that many metres of a road is never above it, so the road's ribbon is not buried by the coarse hills
  compute(x, z, wide) {
    const h = this.base0(x, z);
    if (!this._nearRoad(this._seg, x, z)) return h;
    const y = this._ry, d = this._rd;
    if (wide) return d < wide ? Math.min(h, y - 0.4 - 0.02 * Math.max(0, d)) : h;
    // level across the road and a verge either side (ISLE.verge: wide enough that every 4 m cell the carriageway
    // touches is level, so the baked tile is too), then eased into the hillside over a shoulder as wide as the cut is deep
    const sh = Math.min(ISLE.shMax, 5 + 1.7 * Math.abs(y - h)), v0 = ISLE.verge;
    if (d >= v0 + sh) return h;
    const t = smoothstep(v0, v0 + sh, d);
    return y * (1 - t) + h * t;
  },
  // ---------------------------------------------------------------- tiles
  _tile(tx, tz) {
    const key = tz * 64 + tx; let T = this.tiles.get(key); if (T) return T;
    const c = ISLE.cell, n = ISLE.tile / c + 1, h = new Float32Array(n * n), x0 = ISLE.x0 + tx * ISLE.tile, z0 = ISLE.z0 + tz * ISLE.tile;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = this.compute(x0 + i * c, z0 + j * c);
    T = { tx, tz, x0, z0, h, n, multi: this._multi.has(key) };
    this.tiles.set(key, T);
    return T;
  },
  // a bridge's deck or the tunnel's floor at (x, z) for something at height y (undefined: whatever stands on the
  // road), or null where the ordinary ground answers. Sets _sgx / _sgz (the slope along the road).
  _spanAt(x, z, y) {
    if (!this._nearRoad(this._sseg, x, z)) return null;
    const R = this._rr, k = this._rk, s0 = R.sp[k], s1 = R.sp[k + 1], kind = s0 || s1;
    // a span's last segment (one end on the ground): the road's own bed takes over from the middle of it
    if ((!s0 && this._rt < 0.5) || (!s1 && this._rt > 0.5)) return null;
    const lim = kind === 2 ? 3.2 : 0.7;
    if (this._rd > lim) return null;
    const ry = this._ry;
    if (kind === 1 ? (y !== undefined && y < ry - 3.5) : (y !== undefined && y > ry + 8)) return null;
    const a = R.pts[k], b = R.pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, g = (R.y[k + 1] - R.y[k]) / l;
    this._sgx = g * (b[0] - a[0]) / l; this._sgz = g * (b[1] - a[1]) / l;
    return ry;
  },
  // ground height at (x, z); y: the height of whatever is asking (see _spanAt). The slope is left in gx / gz.
  height(x, z, y) {
    if (!this.ready || x < ISLE.x0 || z < ISLE.z0 || x >= ISLE.x1 || z >= ISLE.z1) { this.gx = 0; this.gz = 0; return SEA_Y - 6; }
    const c = ISLE.cell, T = this._tile(Math.floor((x - ISLE.x0) / ISLE.tile), Math.floor((z - ISLE.z0) / ISLE.tile));
    if (T.multi) { const s = this._spanAt(x, z, y); if (s !== null) { this.gx = this._sgx; this.gz = this._sgz; return s; } }
    const u = (x - T.x0) / c, v = (z - T.z0) / c, i = Math.min(T.n - 2, Math.floor(u)), j = Math.min(T.n - 2, Math.floor(v)), fx = u - i, fz = v - j, o = j * T.n + i, hh = T.h;
    const a = hh[o], b = hh[o + 1], cc = hh[o + T.n], d = hh[o + T.n + 1];
    // the cell's two triangles, split along b–c as the meshes are
    if (fx + fz <= 1) { this.gx = (b - a) / c; this.gz = (cc - a) / c; return a + (b - a) * fx + (cc - a) * fz; }
    this.gx = (d - cc) / c; this.gz = (d - b) / c;
    return d + (cc - d) * (1 - fx) + (b - d) * (1 - fz);
  },
  // the top surface (a bridge's deck, the hill over the tunnel): what scenery and spawns stand on
  top(x, z) { return this.height(x, z, 1e6); },
  // is (x, z) open water (the ground under it below the sea)?
  sea(x, z) { return this.height(x, z, -100) < SEA_Y - 0.25; },
  // is (x, z) on Lake Valen?
  lake(x, z) { const lx = (x - LAKE.x) / LAKE.rx, lz = (z - LAKE.z) / LAKE.rz; return lx * lx + lz * lz < 2.2 && this.sea(x, z); },
  // is (x, z) dry land of the island (anything above the tide line)?
  land(x, z) { return this.ready && this.height(x, z) > SEA_Y + 0.3; },
  // ---------------------------------------------------------------- surfaces and districts
  // 0 grass, 1 sand, 2 rock, 3 road, 4 forest floor, 5 dry grass, 6 concrete (the airport, the proving ground)
  surface(x, z, h, slope) {
    if (this._nearRoad(this._seg, x, z) && this._rd <= 0.5) return 3;
    const d = -this.sd(x, z);
    if ((d < 40 && h < SEA_Y + 3.4) || h < SEA_Y + 0.9) return 1;
    if (slope > 0.62 || h > 205) return 2;
    if (z > 980) return this.forest(x, z) > 0.62 ? 4 : 5;
    return this.forest(x, z) > 0.5 ? 4 : 0;
  },
  // how wooded the ground is (0 open … 1 deep forest): the highlands' slopes and the hollows of the north, copses in the south
  forest(x, z) {
    const n = 0.5 + 0.5 * tNoise(x / 310, z / 310, 71) + 0.22 * tNoise(x / 90, z / 90, 73);
    return z < 60 ? n + 0.12 : n - 0.2;
  },
  // what the ground does to a car off the road (null on a road or off the island's ground): grip ×, rolling drag,
  // bump. The same shape Terrain.effect answers with.
  effect(x, z, trail) {
    if (!this.ready || x < ISLE.x0 || z < ISLE.z0 || x >= ISLE.x1 || z >= ISLE.z1) return null;
    if (this._nearRoad(this._seg, x, z) && this._rd <= 1) return null;
    if (this._nearRoad(this._sseg, x, z) && this._rd <= 1) return null;
    const h = this.height(x, z, 1e6), s = this.surface(x, z, h, Math.hypot(this.gx, this.gz)), k = 1 - 0.65 * (trail || 0), E = this._fx;
    if (s === 6 || s === 3) return null;
    const F = s === 1 ? [0.66, 1.5, 0.03, TSURF.dirt] : s === 2 ? [0.74, 0.6, 0.08, TSURF.rock] : [0.82, 0.4, 0.035, TSURF.grass];
    E.grip = 1 - (1 - F[0]) * k; E.drag = F[1] * k; E.bump = F[2] * k; E.s = F[3];
    return E;
  },
  // do the island's hills rise through the straight line from a to b? (Sight: the police, the camera.)
  occludes(ax, ay, az, bx, by, bz) {
    if (!this.ready || ay < -5 || by < -5) return false;
    const inC = (x, z) => CityLayout.inCity(x, z);
    if (inC(ax, az) && inC(bx, bz)) return false;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 12) return false;
    const n = Math.ceil(L / 8), gx = this.gx, gz = this.gz; let hit = false;
    for (let k = 1; k < n && !hit; k++) { const t = k / n, x = ax + dx * t, z = az + dz * t; if (!inC(x, z) && this.height(x, z, 1e6) > ay + (by - ay) * t + 0.3) hit = true; }
    this.gx = gx; this.gz = gz;
    return hit;
  },
  // the island's districts off the lattice (keys of ZONES)
  zoneKey(x, z) {
    const A = AIRPORT, G = PROVING;
    if (x > A.x0 - 60 && x < A.x1 + 60 && z > A.z0 - 90 && z < A.z1 + 60) return 'y';
    if (x > G.x0 - 30 && x < G.x1 + 30 && z > G.z0 - 30 && z < G.z1 + 30) return 'j';
    if (z > 880) return x < -160 && z < 1500 ? 'b' : 'e';
    if (z > -700 && z < -250 && x > -120 && x < 760) return 'k';
    if (Math.hypot(x - MT_VALEN.x, z - MT_VALEN.z) < 1250) return 'n';
    return 't';
  },
  // one-time set-up: the shore (the generator adds its building sites' pads, then corePads, then the roads)
  init() {
    if (this.sdf) return;
    this._buildSDF();
    this.pads = [];
  },
  // the big level grounds, strongest last: the proving ground, the airport, Cedar Fields South's rim, the city
  corePads() {
    const A = AIRPORT, G = PROVING, E = EDGE_MARGIN;
    this.addPad(G.x0, G.z0, G.x1, G.z1, G.y, 90);
    this.addPad(A.x0, A.z0, A.x1, A.z1, A.y, 140);
    this.addPad(CFS.x0, CFS.z0, CFS.x1, CFS.z1, 0.1, 70);
    for (const p of CityLayout.precincts) this.addPad(p.x0 - E, p.z0 - E, p.x1 + E, p.z1 + E, CURB_H, 110);
  }
};
