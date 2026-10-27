/* =====================================================================
   [CONTENT] CEDAR FIELDS: TERRAIN SCENERY (Session 6C)
   The height field (027) drawn as vertex-coloured meshes whose vertices
   are exactly the physics grid's (height, rough layer and all), so a
   wheel sits on what you see:
   - the countryside in 50 m tiles: tiles near the focus at the full 1 m
     grid (each with a short skirt so no crack shows against its
     neighbours), everything else in one 5 m mesh with holes where the
     near tiles are (its index is rebuilt when the near set changes), and
     a rock face down to the water round the shore;
   - the land bridge's embankment (always drawn) and the Cedar Fields
     strip (drawn near it, in the city's ground material so its fields
     look as they did; only where its ground rises off the kerb slab,
     which shows through everywhere else);
   - the shore fence and the bridge rails (one merged mesh).
   ===================================================================== */
const TSURF_COL = [0x5d7f45, 0x8a6b47, 0x4b3a29, 0x7d776d, 0xa39478, 0x96784f];
const CFS_SCN = { tile: 50, far: 5, nearR: 70, stripR: 500, cache: 24 };
class CedarScenery {
  constructor(scene, world, gmat) {
    this.scene = scene; this.world = world; this.cf = world.cfs;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    // the strip and the bridge's promenade gap meet the city's ground slabs at the same height: they draw on top
    this.matOff = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.R = {}; for (const R of Terrain.regions) this.R[R.id] = R;
    this.tiles = new Map(); this.nearSet = null; this.stats = { built: 0 }; this._stamp = 0;
    const C3 = new THREE.Color(); this._col = (s, x, z, y) => { C3.setHex(TSURF_COL[s]); const k = 1 + 0.08 * tNoise(x / 9, z / 9, 61) + (s === 0 ? clamp((y - 3) * 0.02, -0.08, 0.06) : 0); return [C3.r * k, C3.g * k, C3.b * k]; };
    // a vertex's colour: the surfaces of the cells round it blended (r cells each way), so patches have soft edges
    this._colAt = (R, i, j, y, r) => {
      let cr = 0, cg = 0, cb = 0, n = 0;
      for (let b = -r; b < r; b++) for (let a = -r; a < r; a++) { const ii = clamp(i + a, 0, R.W - 1), jj = clamp(j + b, 0, R.H - 1); C3.setHex(TSURF_COL[R.s[jj * R.W + ii]]); cr += C3.r; cg += C3.g; cb += C3.b; n++; }
      const x = R.x0 + i, z = R.z0 + j, k = 1 + 0.08 * tNoise(x / 9, z / 9, 61) + clamp((y - 3) * 0.015, -0.08, 0.06);
      return [cr / n * k, cg / n * k, cb / n * k];
    };
    const RC = this.R.country;
    this.TW = Math.ceil((RC.W - 1) / CFS_SCN.tile); this.TH = Math.ceil((RC.H - 1) / CFS_SCN.tile);
    this.far = this._farMesh(RC); scene.add(this.far);
    this.bridge = this._gridMesh(this.R.bridge, 0, 0, this.R.bridge.W - 1, this.R.bridge.H - 1, { sides: true, mat: this.matOff }); scene.add(this.bridge);
    // the strip wears the city's ground (its fields, drives and verges are painted by world position), a centimetre
    // above the kerb slab it rises from
    this.strip = this._gridMesh(this.R.strip, 0, 0, this.R.strip.W - 1, this.R.strip.H - 1, { masked: true, mat: gmat || this.matOff }); this.strip.position.y = 0.01; scene.add(this.strip);
    this.fence = this._fenceMesh(); scene.add(this.fence);
    this.group = new THREE.Group(); scene.add(this.group);
  }
  // vertex (i, j) of region R: [x, y, z] with the rough layer, exactly as the physics has it
  _v(R, i, j) {
    i = clamp(i, 0, R.W - 1); j = clamp(j, 0, R.H - 1);
    const o = j * R.W + i, x = R.x0 + i, z = R.z0 + j;
    return [x, R.h[o] + Terrain._rough(x, z, R.s[o], R.m[o]), z, o];
  }
  // a mesh over cells [i0, i1) × [j0, j1) of R at 1 m, with options: skirt (a short drop on all four edges),
  // sides (rock faces down to the water along the long edges), masked (only where the ground is free of the mask)
  _gridMesh(R, i0, j0, i1, j1, opt = {}) {
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1, pos = [], col = [], nrm = [], idx = [];
    const H = (i, j) => this._v(R, i, j)[1];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const [x, y, z] = this._v(R, i0 + i, j0 + j);
      pos.push(x, y, z); col.push(...this._colAt(R, i0 + i, j0 + j, y, 1));
      const gx = (H(i0 + i + 1, j0 + j) - H(i0 + i - 1, j0 + j)) / 2, gz = (H(i0 + i, j0 + j + 1) - H(i0 + i, j0 + j - 1)) / 2, l = Math.hypot(gx, 1, gz);
      nrm.push(-gx / l, 1 / l, -gz / l);
    }
    const free = (i, j) => !opt.masked || R.m[clamp(j0 + j, 0, R.H - 1) * R.W + clamp(i0 + i, 0, R.W - 1)] > 0.001;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!(free(i, j) && free(i + 1, j) && free(i, j + 1) && free(i + 1, j + 1))) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // edges: a strip of vertices dropped below the edge (a skirt) or down to the water (a bank)
    const edge = (list, drop, rock) => {
      for (let k = 0; k < list.length - 1; k++) {
        const A = list[k], B = list[k + 1], base = pos.length / 3;
        for (const q of [A, B]) { pos.push(pos[q * 3], drop === null ? -3 : pos[q * 3 + 1] - drop, pos[q * 3 + 2]); const c = rock ? this._col(TSURF.rock, pos[q * 3], pos[q * 3 + 2], 0) : [col[q * 3] * 0.7, col[q * 3 + 1] * 0.7, col[q * 3 + 2] * 0.7]; col.push(...c); nrm.push(0, 0.3, 0.95); }
        idx.push(A, base, B, B, base, base + 1, A, B, base, B, base + 1, base);
      }
    };
    const N2 = [], S2 = [], W2 = [], E2 = [];
    for (let i = 0; i < nx; i++) { N2.push(i); S2.push((nz - 1) * nx + i); }
    for (let j = 0; j < nz; j++) { W2.push(j * nx); E2.push(j * nx + nx - 1); }
    if (opt.skirt) for (const L of [N2, S2, W2, E2]) edge(L, 0.6, false);
    if (opt.sides) for (const L of [W2, E2]) edge(L, null, true);
    if (opt.banks) for (const [L, on] of opt.banks) if (on) edge(L, null, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, opt.mat || this.mat); m.receiveShadow = true;
    m.userData.nGrid = nx * nz;
    return m;
  }
  // the countryside at 5 m: one mesh; its index skips the cells of the near tiles; a rock bank round the shore
  _farMesh(R) {
    const s = CFS_SCN.far, nx = Math.floor((R.W - 1) / s) + 1, nz = Math.floor((R.H - 1) / s) + 1, pos = [], col = [], nrm = [];
    const H = (i, j) => R.h[clamp(j * s, 0, R.H - 1) * R.W + clamp(i * s, 0, R.W - 1)];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const o = Math.min(R.H - 1, j * s) * R.W + Math.min(R.W - 1, i * s), x = R.x0 + Math.min(R.W - 1, i * s), z = R.z0 + Math.min(R.H - 1, j * s), y = R.h[o];
      pos.push(x, y, z); col.push(...this._colAt(R, Math.min(R.W - 1, i * s), Math.min(R.H - 1, j * s), y, Math.ceil(s / 2)));
      const gx = (H(i + 1, j) - H(i - 1, j)) / (4 * s) * 2, gz = (H(i, j + 1) - H(i, j - 1)) / (4 * s) * 2, l = Math.hypot(gx, 1, gz);
      nrm.push(-gx / l, 1 / l, -gz / l);
    }
    this._fn = { nx, nz, s };
    // the shore: rock faces from the edge vertices down to the water
    const bank = [];
    const ring = []; for (let i = 0; i < nx; i++) ring.push(i); for (let j = 1; j < nz; j++) ring.push(j * nx + nx - 1); for (let i = nx - 2; i >= 0; i--) ring.push((nz - 1) * nx + i); for (let j = nz - 2; j >= 0; j--) ring.push(j * nx);
    for (let k = 0; k < ring.length - 1; k++) {
      const A = ring[k], B = ring[k + 1], base = pos.length / 3;
      for (const q of [A, B]) { pos.push(pos[q * 3], -3, pos[q * 3 + 2]); col.push(...this._col(TSURF.rock, pos[q * 3], pos[q * 3 + 2], 0)); nrm.push(0, 0.3, 0.95); }
      bank.push(A, base, B, B, base, base + 1, A, B, base, B, base + 1, base);
    }
    this._bank = bank;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true;
    this._farIndex(m, new Set());
    return m;
  }
  _farIndex(m, holes) {
    const { nx, nz, s } = this._fn, T = CFS_SCN.tile / s, idx = this._bank.slice();
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (holes.has(Math.floor(i / T) + ',' + Math.floor(j / T))) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    m.geometry.setIndex(idx);
  }
  _tile(tx, tz) {
    const key = tx + ',' + tz; let t = this.tiles.get(key);
    if (!t) {
      const R = this.R.country, T = CFS_SCN.tile, i0 = tx * T, j0 = tz * T, i1 = Math.min(R.W - 1, i0 + T), j1 = Math.min(R.H - 1, j0 + T);
      t = { key, mesh: this._gridMesh(R, i0, j0, i1, j1, { skirt: true }), used: 0 };
      this.tiles.set(key, t); this.stats.built++;
    }
    return t;
  }
  // the shore fence and the land bridge's rails: posts every 3 m and two rails, on the ground
  _fenceMesh() {
    const gv = new GeoBuilder(), wood = C(0x6b5236), steel = C(0x8c949c), cf = this.cf;
    const run = (x0, z0, x1, z1, c, h) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3)), ry = Math.atan2(-(z1 - z0), x1 - x0);
      for (let k = 0; k <= n; k++) { const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n), y = groundY(x, z); gv.add(TPL.box, M(x, y + h / 2, z, 0.14, h, 0.14, ry), c); }
      for (let k = 0; k < n; k++) {
        const xa = lerp(x0, x1, k / n), za = lerp(z0, z1, k / n), xb = lerp(x0, x1, (k + 1) / n), zb = lerp(z0, z1, (k + 1) / n), ya = groundY(xa, za), yb = groundY(xb, zb);
        const l = Math.hypot(xb - xa, zb - za, yb - ya), rz = Math.atan2(yb - ya, Math.hypot(xb - xa, zb - za));
        for (const f of [0.45, 0.85]) gv.add(TPL.box, M((xa + xb) / 2, (ya + yb) / 2 + h * f, (za + zb) / 2, l + 0.05, 0.08, 0.06, ry, 0, rz), c);
      }
    };
    for (const [x0, z0, x1, z1] of cf.fence) run(x0, z0, x1, z1, wood, 1.1);
    for (const [x0, z0, x1, z1] of cf.rails) run(x0, z0, x1, z1, steel, 1.0);
    const m = new THREE.Mesh(gv.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    m.receiveShadow = true;
    return m;
  }
  // which tiles are near the focus: drawn at 1 m; the rest of the countryside comes from the far mesh
  update(fx, fz) {
    const R = this.R.country, T = CFS_SCN.tile, r = CFS_SCN.nearR, want = [];
    const d0 = Math.hypot(Math.max(R.x0 - fx, 0, fx - R.x1), Math.max(R.z0 - fz, 0, fz - R.z1));
    if (d0 < r) for (let tz = 0; tz < this.TH; tz++) for (let tx = 0; tx < this.TW; tx++) {
      const x0 = R.x0 + tx * T, z0 = R.z0 + tz * T, d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - T), Math.max(z0 - fz, 0, fz - z0 - T));
      if (d < r) want.push(tx + ',' + tz);
    }
    const key = want.join('|');
    const S = this.R.strip, ds = Math.hypot(Math.max(S.x0 - fx, 0, fx - S.x1), Math.max(S.z0 - fz, 0, fz - S.z1));
    this.strip.visible = ds < CFS_SCN.stripR;
    this.fence.visible = d0 < 600;
    if (key === this.nearSet) return;
    this.nearSet = key;
    this.group.clear();
    const stamp = ++this._stamp;
    for (const k of want) { const [tx, tz] = k.split(',').map(Number), t = this._tile(tx, tz); t.used = stamp; this.group.add(t.mesh); }
    this._farIndex(this.far, new Set(want));
    // keep the most recently used tiles; dispose the rest
    if (this.tiles.size > CFS_SCN.cache) for (const t of [...this.tiles.values()].sort((a, b) => a.used - b.used).slice(0, this.tiles.size - CFS_SCN.cache)) { t.mesh.geometry.dispose(); this.tiles.delete(t.key); }
  }
}
