/* =====================================================================
   [CONTENT] VALEN ISLAND: THE COUNTRYSIDE (the wider city spread)
   Between the city's districts the island is farmed, as land round a real
   coastal city is: a patchwork of fields (wheat, barley, canola, maize,
   pasture, hay, ploughed ground), orchards and vineyards on the warmer
   slopes, hedgerows along the field edges with gaps for the gates,
   farmsteads on the country roads (128: kind 'farm'), and wind turbines
   on the open high ground.
   Fields are laid out per region as a slightly rotated grid of parcels of
   varied size; a parcel is kept only where all of it is dry, gentle
   ground clear of every road, pad, precinct and site. They are paint and
   planting, not new physics: the ground is the island's own, the crop is
   its vertex colour (177 _col), hedges are shrubs a car can push through,
   orchard trees and turbine towers collide.
   ===================================================================== */
const FARM_CROPS = {
  wheat: { col: 0xc4ab55, row: 0x9c8538, stripe: 10 },
  barley: { col: 0xd2c487, row: 0xae9f62, stripe: 10 },
  canola: { col: 0xd9c636, row: 0xa99a2a, stripe: 0 },
  maize: { col: 0x6b9440, row: 0x456b26, stripe: 6 },
  pasture: { col: 0x7ba850, row: 0x6a9446, stripe: 0 },
  hay: { col: 0xb4ab66, row: 0x948b4c, stripe: 14, bales: true },
  plough: { col: 0x7a5c40, row: 0x5a4330, stripe: 5 },
  orchard: { col: 0x6a8c46, row: 0x58783a, stripe: 0, orchard: true },
  vines: { col: 0x8c8a5c, row: 0x6c6a44, stripe: 0, vines: true }
};
// regions by layout: a rectangle, the grid's angle, the parcel size (along, across), and the crops it grows
const FARM_REGIONS = {
  island: [
    { id: 'southvale', box: [-150, 1505, 880, 1800], ang: 0.1, fw: 94, fd: 64, crops: ['wheat', 'wheat', 'barley', 'canola', 'maize', 'pasture', 'hay', 'plough'] },
    { id: 'westmoor', box: [-1250, 1650, -300, 2560], ang: -0.22, fw: 101, fd: 72, crops: ['wheat', 'barley', 'canola', 'pasture', 'pasture', 'hay', 'plough', 'maize', 'orchard'] },
    { id: 'southcape', box: [-300, 2540, 1500, 2700], ang: 0.03, fw: 109, fd: 56, crops: ['barley', 'wheat', 'canola', 'hay', 'plough'] },
    { id: 'eastfields', box: [1480, 1700, 2100, 2400], ang: 0.35, fw: 78, fd: 56, crops: ['vines', 'vines', 'orchard', 'pasture', 'hay', 'wheat'], slope: 0.3 },
    { id: 'soundplain', box: [930, -480, 1560, -130], ang: -0.3, fw: 86, fd: 60, crops: ['maize', 'wheat', 'pasture', 'canola', 'orchard', 'hay'] },
    { id: 'northwest', box: [-1660, -480, -760, -130], ang: 0.25, fw: 90, fd: 64, crops: ['pasture', 'pasture', 'hay', 'barley', 'orchard', 'plough'] },
    { id: 'gullfarms', box: [-1960, -2360, -1540, -1940], ang: -0.4, fw: 78, fd: 56, crops: ['pasture', 'hay', 'barley', 'plough'] }
  ]
};
// wind farms: a line of sites (every `sp` m from a to b); a site not on open, gentle, dry ground is skipped
const FARM_WIND = {
  island: [
    { a: [1840, 1880], b: [2180, 2300], sp: 120 },
    { a: [-860, 2060], b: [-640, 2460], sp: 130 },
    { a: [-1600, -430], b: [-1150, -330], sp: 140 }
  ]
};
const Farms = {
  fields: [], buckets: new Map(), trees: new Map(), boxes: new Map(), turbines: [], ready: false,
  BK: 64,
  // is (x, z) ground a field may cover: dry, clear of roads, pads, the city and every site
  clear(x, z, m = 6) {
    const h = Island.height(x, z, 1e6);
    if (h < SEA_Y + 1.4) return false;
    if (CityLayout.inCity(x, z, EDGE_MARGIN + 30)) return false;
    const inR = (R, k) => x > R.x0 - k && x < R.x1 + k && z > R.z0 - k && z < R.z1 + k;
    if (inR(CFS, 25) || inR(AIRPORT, 45) || inR(PROVING, 35) || inR(VP, 45) || inR(VILLA_VALEN, 20)) return false;
    if (((x - LAKE.x) / (LAKE.rx + 60)) ** 2 + ((z - LAKE.z) / (LAKE.rz + 60)) ** 2 < 1) return false;
    if (Island._nearRoad(Island._seg, x, z) && Island._rd < m) return false;
    for (const P of Island.pads) if (P.x1 - P.x0 < 900 && x > P.x0 - 4 && x < P.x1 + 4 && z > P.z0 - 4 && z < P.z1 + 4) return false;
    return true;
  },
  slope(x, z) { Island.height(x, z, 1e6); return Math.hypot(Island.gx, Island.gz); },
  init() {
    this.fields = []; this.buckets.clear(); this.trees.clear(); this.boxes.clear(); this.turbines = [];
    const regions = FARM_REGIONS[CityLayout.id] || [];
    for (const R of regions) this._region(R);
    for (const W of FARM_WIND[CityLayout.id] || []) {
      const L = Math.hypot(W.b[0] - W.a[0], W.b[1] - W.a[1]), n = Math.floor(L / W.sp);
      for (let k = 0; k <= n; k++) {
        const x = W.a[0] + (W.b[0] - W.a[0]) * k / Math.max(1, n), z = W.a[1] + (W.b[1] - W.a[1]) * k / Math.max(1, n);
        if (!this.clear(x, z, 26) || this.slope(x, z) > 0.25 || this.at(x, z, 8)) continue;
        this.turbines.push({ x, z, y: Island.height(x, z, 1e6), h: 1.1 + hash2i(Math.round(x), Math.round(z), 401) * 0.6, ph: hash2i(Math.round(x), Math.round(z), 403) * 6.28 });
      }
    }
    this.ready = true;
  },
  _region(R) {
    const ca = Math.cos(R.ang), sa = Math.sin(R.ang), cx = (R.box[0] + R.box[2]) / 2, cz = (R.box[1] + R.box[3]) / 2;
    const ext = Math.hypot(R.box[2] - R.box[0], R.box[3] - R.box[1]) / 2 + 60, lane = 5, smax = R.slope || 0.27;
    const W = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
    // columns and rows of varied width: the patchwork of real field boundaries
    const cuts = (len, base, seed) => { const out = [-len]; let s = -len; for (let k = 0; s < len; k++) { s += base * (0.65 + 0.7 * hash2i(k, seed, 405)) + lane; out.push(s); } return out; };
    const us = cuts(ext, R.fw, R.id.length * 7 + 1), vs = cuts(ext, R.fd, R.id.length * 7 + 2);
    const idx = new Map();
    for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
      const u0 = us[i], u1 = us[i + 1] - lane, v0 = vs[j], v1 = vs[j + 1] - lane, hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
      const [fx, fz] = W((u0 + u1) / 2, (v0 + v1) / 2);
      if (fx < R.box[0] || fx > R.box[2] || fz < R.box[1] || fz > R.box[3]) continue;
      const crop = R.crops[Math.floor(hash2i(i * 31 + j, R.id.length, 407) * R.crops.length)], C = FARM_CROPS[crop];
      let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
        const [x, z] = W((u0 + u1) / 2 + a * (hu - 2), (v0 + v1) / 2 + b * (hv - 2));
        if (!this.clear(x, z) || this.slope(x, z) > (C.vines || C.orchard ? smax + 0.08 : smax)) ok = false;
      }
      if (!ok) continue;
      const F = { id: this.fields.length, region: R.id, crop, C, cx: fx, cz: fz, ca, sa, hu, hv, i, j, tone: 0.93 + 0.14 * hash2i(i, j, 409) };
      this.fields.push(F); idx.set(i + ',' + j, F);
      const r = Math.hypot(hu, hv);
      for (let bx = Math.floor((fx - r) / this.BK); bx <= Math.floor((fx + r) / this.BK); bx++) for (let bz = Math.floor((fz - r) / this.BK); bz <= Math.floor((fz + r) / this.BK); bz++) {
        const key = bx + ',' + bz; if (!this.buckets.has(key)) this.buckets.set(key, []); this.buckets.get(key).push(F);
      }
    }
    // planting: hedgerows on the field edges (one row between neighbours), orchards, vines, bales
    for (const F of this.fields) if (F.region === R.id) {
      const L = (u, v) => [F.cx + u * ca - v * sa, F.cz + u * sa + v * ca];
      const edge = (side, along, half, at, gate) => {
        for (let s = -half + 2; s < half - 2; s += 3.1) {
          if (Math.abs(s - gate) < 5) continue;
          const [x, z] = side ? L(s, at) : L(at, s);
          if (!this.clear(x, z, 4)) continue;
          const k = hash2i(Math.round(x * 3), Math.round(z * 3), 411);
          this._tree(x, z, 0.3 + k * 0.17, k * 6.28, 2);
        }
      };
      const gate = (hash2i(F.i, F.j, 413) - 0.5) * F.hu;
      edge(0, 0, F.hv, F.hu + lane / 2, (hash2i(F.i, F.j, 415) - 0.5) * F.hv);
      edge(1, 0, F.hu, F.hv + lane / 2, gate);
      if (!idx.has((F.i - 1) + ',' + F.j)) edge(0, 0, F.hv, -F.hu - lane / 2, 999);
      if (!idx.has(F.i + ',' + (F.j - 1))) edge(1, 0, F.hu, -F.hv - lane / 2, 999);
      if (F.C.orchard) for (let u = -F.hu + 5; u < F.hu - 4; u += 8) for (let v = -F.hv + 5; v < F.hv - 4; v += 8) {
        const [x, z] = L(u, v), k = hash2i(Math.round(x), Math.round(z), 417);
        this._tree(x + (k - 0.5), z, 0.5 + k * 0.16, k * 6.28, 0);
      }
      if (F.C.vines) for (let v = -F.hv + 3; v < F.hv - 2; v += 3.2) for (let u = -F.hu + 4; u < F.hu - 4; u += 10) {
        const [x, z] = L(u + 5, v); this._box(x, z, 10, 1.25, 0.55, 0x3d5a2a, -R.ang);
      }
      if (F.C.bales) { const n = 4 + Math.floor(hash2i(F.i, F.j, 419) * 9); for (let k = 0; k < n; k++) { const [x, z] = L((hash2i(k, F.id, 421) - 0.5) * (F.hu * 1.6), (hash2i(k, F.id, 423) - 0.5) * (F.hv * 1.6)); this._box(x, z, 1.6, 1.5, 1.6, 0xc8b46a, hash2i(k, F.id, 425) * 3, true); } }
    }
  },
  _tile(x, z) { return Math.floor((z - ISLE.z0) / ISLE.tile) * 64 + Math.floor((x - ISLE.x0) / ISLE.tile); },
  _tree(x, z, s, r, kind) {
    const key = this._tile(x, z); if (!this.trees.has(key)) this.trees.set(key, [[], [], []]);
    this.trees.get(key)[kind].push([x, Island.height(x, z, 1e6), z, s, r]);
  },
  _box(x, z, w, h, d, col, ry, cyl) {
    const key = this._tile(x, z); if (!this.boxes.has(key)) this.boxes.set(key, []);
    this.boxes.get(key).push({ x, y: Island.height(x, z, 1e6), z, w, h, d, col, ry, cyl: !!cyl });
  },
  // the field at (x, z), or null; inset: how far inside its edge the point must be (negative reaches past it)
  at(x, z, inset = 0) {
    const L = this.buckets.get(Math.floor(x / this.BK) + ',' + Math.floor(z / this.BK)); if (!L) return null;
    for (const F of L) {
      const dx = x - F.cx, dz = z - F.cz, u = dx * F.ca + dz * F.sa, v = -dx * F.sa + dz * F.ca;
      if (Math.abs(u) < F.hu - inset && Math.abs(v) < F.hv - inset) return F;
    }
    return null;
  },
  // the crop's colour at (x, z) into c (a THREE.Color holding the ground's own), or false where there is no field
  tint(x, z, c, tmp) {
    const F = this.at(x, z, 0); if (!F) return false;
    const dx = x - F.cx, dz = z - F.cz, u = dx * F.ca + dz * F.sa, v = -dx * F.sa + dz * F.ca, C = F.C;
    tmp.setHex(C.col);
    if (C.stripe) { const s = 0.5 + 0.5 * Math.sin(v * 6.2832 / C.stripe), t2 = this._t2 || (this._t2 = new THREE.Color()); tmp.lerp(t2.setHex(C.row), s * 0.55); }
    tmp.multiplyScalar(F.tone * (1 + 0.05 * tNoise(x / 23, z / 23, 427)));
    // the headland: a few metres of the field's edge are grass and wheel ruts
    const edge = Math.min(F.hu - Math.abs(u), F.hv - Math.abs(v));
    c.lerp(tmp, smoothstep(1, 5, edge));
    return true;
  },
  // the tile's farm geometry (vine rows, bales) as one vertex-coloured mesh, or null
  tileGeo(key) {
    const L = this.boxes.get(key); if (!L || !L.length) return null;
    const gb = new GeoBuilder();
    for (const b of L) { if (b.cyl) gb.cyl(b.x, b.y + b.h / 2 - 0.1, b.z, b.w / 2, b.h, C(b.col)); else gb.box(b.x, b.y + b.h / 2 - 0.1, b.z, b.w, b.h, b.d, C(b.col), b.ry); }
    return gb.build();
  },
  // the wind turbines: one group for the whole island (seen from anywhere), their rotors turned by update()
  buildTurbines(scene, grid) {
    if (!this.turbines.length) return null;
    const mat = makePropMaterial(0.55, 0.15), group = new THREE.Group(), rotors = [];
    const tw = new GeoBuilder();
    for (const T of this.turbines) {
      const s = T.h;
      tw.cyl(T.x, T.y + 30 * s, T.z, 1.5 * s, 60 * s, C(0xeef0f0));
      tw.box(T.x, T.y + 60.8 * s, T.z, 3 * s, 3 * s, 9 * s, C(0xe6e8e8));
      grid.add({ x: T.x, z: T.z, r: 1.7 * s, y0: T.y - 1, y1: T.y + 60 * s, kind: 'det' });
    }
    group.add(new THREE.Mesh(tw.build(), mat));
    for (const T of this.turbines) {
      const s = T.h, rg = new GeoBuilder();
      rg.cyl(0, 0, 0, 1.3 * s, 1.6 * s, C(0xe0e2e2));
      for (let k = 0; k < 3; k++) { const a = k * 2.0944; rg.add(TPL.box, new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0, 12 * s, 0)).multiply(new THREE.Matrix4().makeScale(1.4 * s, 24 * s, 0.35 * s)), C(0xf4f5f5)); }
      const m = new THREE.Mesh(rg.build(), mat), piv = new THREE.Group();
      piv.position.set(T.x, T.y + 60.8 * s, T.z); piv.rotation.y = 0.6; m.position.set(0, 0, -4.9 * s); m.rotation.z = T.ph; piv.add(m); group.add(piv); rotors.push(m);
    }
    scene.add(group); this._rotors = rotors; this._turbGroup = group;
    return group;
  },
  update(dt) { if (this._rotors) for (const m of this._rotors) m.rotation.z += dt * 1.35; }
};
