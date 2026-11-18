/* =====================================================================
   [CONTENT] CEDAR FIELDS: TERRAIN SCENERY (Session 6C)
   The height field (027) drawn as vertex-coloured meshes whose vertices
   are exactly the physics grid's (height, rough layer and all), so a
   wheel sits on what you see:
   - the countryside in 50 m tiles: tiles near the focus at the full 1 m
     grid (each with a short skirt so no crack shows against its
     neighbours), everything else in one 5 m mesh with holes where the
     near tiles are (its index is rebuilt when the near set changes), or
     a 10 m one from more than 300 m away, and a rock face down to the
     water round the shore;
   - the land bridge's embankment (always drawn) and the Cedar Fields
     strip (in the city's ground material so its fields look as they
     did, at 1 m within 120 m and at 4 m out to 500 m; only where its
     ground rises off the kerb slab, which shows through everywhere
     else);
   - the shore fence and the bridge rails (one merged mesh).
   ===================================================================== */
const TSURF_COL = [0x5d7f45, 0x8a6b47, 0x4b3a29, 0x7d776d, 0xa39478, 0x96784f, 0x2e3033];
const CFS_SCN = { tile: 50, far: 5, farC: 10, farR: 300, nearR: 70, stripR: 500, stripNear: 120, stripStep: 4, fenceR: 250, cache: 24 };
class CedarScenery {
  constructor(scene, world, gmat) {
    this.scene = scene; this.world = world; this.cf = world.cfs;
    this.mat = makeTerrainMaterial();
    // the strip and the bridge's promenade gap meet the city's ground slabs at the same height: they draw on top
    this.matOff = makeTerrainMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
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
    // the far countryside: at 5 m within 300 m of it (with holes for the near tiles), at 10 m beyond
    this.far = this._farMesh(RC, CFS_SCN.far); scene.add(this.far);
    this.farC = this._farMesh(RC, CFS_SCN.farC); this.farC.visible = false; scene.add(this.farC);
    this.bridge = this._gridMesh(this.R.bridge, 0, 0, this.R.bridge.W - 1, this.R.bridge.H - 1, { sides: true, mat: this.matOff }); scene.add(this.bridge);
    // the strip wears the city's ground (its fields, drives and verges are painted by world position), a centimetre
    // above the kerb slab it rises from
    this.strip = this._gridMesh(this.R.strip, 0, 0, this.R.strip.W - 1, this.R.strip.H - 1, { masked: true, mat: gmat || this.matOff }); this.strip.position.y = 0.01; scene.add(this.strip);
    // and a 4 m version of it beyond 120 m
    this.stripC = this._gridMesh(this.R.strip, 0, 0, this.R.strip.W - 1, this.R.strip.H - 1, { masked: true, mat: gmat || this.matOff, step: CFS_SCN.stripStep }); this.stripC.position.y = 0.01; this.stripC.visible = false; scene.add(this.stripC);
    this.fence = this._fenceMesh(); scene.add(this.fence);
    this.group = new THREE.Group(); scene.add(this.group);
  }
  // vertex (i, j) of region R: [x, y, z] with the rough layer, exactly as the physics has it
  _v(R, i, j) {
    i = clamp(i, 0, R.W - 1); j = clamp(j, 0, R.H - 1);
    const o = j * R.W + i, x = R.x0 + i, z = R.z0 + j;
    return [x, R.h[o] + Terrain._rough(x, z, R.s[o], R.m[o]), z, o];
  }
  // a mesh over cells [i0, i1) × [j0, j1) of R every `step` cells (1 m by default), with options: skirt (a short drop
  // on all four edges), sides (rock faces down to the water along the long edges), masked (only where the ground is
  // free of the mask)
  _gridMesh(R, i0, j0, i1, j1, opt = {}) {
    const st = opt.step || 1, nx = Math.floor((i1 - i0) / st) + 1, nz = Math.floor((j1 - j0) / st) + 1, pos = [], col = [], nrm = [], idx = [];
    const H = (i, j) => this._v(R, i, j)[1];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const ci = i0 + i * st, cj = j0 + j * st, [x, y, z] = this._v(R, ci, cj);
      pos.push(x, y, z); col.push(...this._colAt(R, ci, cj, y, st > 1 ? Math.ceil(st / 2) : 1));
      const gx = (H(ci + st, cj) - H(ci - st, cj)) / (2 * st), gz = (H(ci, cj + st) - H(ci, cj - st)) / (2 * st), l = Math.hypot(gx, 1, gz);
      nrm.push(-gx / l, 1 / l, -gz / l);
    }
    const free = (i, j) => !opt.masked || R.m[clamp(j0 + j * st, 0, R.H - 1) * R.W + clamp(i0 + i * st, 0, R.W - 1)] > 0.001;
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
  // the countryside at s m: one mesh; its index skips the cells of the near tiles; a rock bank round the shore
  _farMesh(R, s) {
    const nx = Math.floor((R.W - 1) / s) + 1, nz = Math.floor((R.H - 1) / s) + 1, pos = [], col = [], nrm = [];
    const H = (i, j) => R.h[clamp(j * s, 0, R.H - 1) * R.W + clamp(i * s, 0, R.W - 1)];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const o = Math.min(R.H - 1, j * s) * R.W + Math.min(R.W - 1, i * s), x = R.x0 + Math.min(R.W - 1, i * s), z = R.z0 + Math.min(R.H - 1, j * s), y = R.h[o];
      pos.push(x, y, z); col.push(...this._colAt(R, Math.min(R.W - 1, i * s), Math.min(R.H - 1, j * s), y, Math.ceil(s / 2)));
      const gx = (H(i + 1, j) - H(i - 1, j)) / (4 * s) * 2, gz = (H(i, j + 1) - H(i, j - 1)) / (4 * s) * 2, l = Math.hypot(gx, 1, gz);
      nrm.push(-gx / l, 1 / l, -gz / l);
    }
    const m0 = { nx, nz, s };
    // the shore: rock faces from the edge vertices down to the water
    const bank = [];
    const ring = []; for (let i = 0; i < nx; i++) ring.push(i); for (let j = 1; j < nz; j++) ring.push(j * nx + nx - 1); for (let i = nx - 2; i >= 0; i--) ring.push((nz - 1) * nx + i); for (let j = nz - 2; j >= 0; j--) ring.push(j * nx);
    for (let k = 0; k < ring.length - 1; k++) {
      const A = ring[k], B = ring[k + 1], base = pos.length / 3;
      for (const q of [A, B]) { pos.push(pos[q * 3], -3, pos[q * 3 + 2]); col.push(...this._col(TSURF.rock, pos[q * 3], pos[q * 3 + 2], 0)); nrm.push(0, 0.3, 0.95); }
      bank.push(A, base, B, B, base, base + 1, A, B, base, B, base + 1, base);
    }
    m0.bank = bank;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true; m.userData.grid = m0;
    this._farIndex(m, new Set());
    return m;
  }
  _farIndex(m, holes) {
    const { nx, nz, s, bank } = m.userData.grid, T = CFS_SCN.tile / s, idx = bank.slice();
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
  // the shore fence and the land bridge's rails: posts every 4 m and two rails, on the ground
  _fenceMesh() {
    const gv = new GeoBuilder(), wood = C(0x6b5236), steel = C(0x8c949c), cf = this.cf;
    const run = (x0, z0, x1, z1, c, h) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 4)), ry = Math.atan2(-(z1 - z0), x1 - x0);
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
    this.strip.visible = ds < CFS_SCN.stripNear; this.stripC.visible = !this.strip.visible && ds < CFS_SCN.stripR;
    this.fence.visible = Math.min(d0, Math.hypot(CFS.lb.x - fx, Math.max(0, CFS_EDGE - fz))) < CFS_SCN.fenceR;
    this.far.visible = d0 < CFS_SCN.farR; this.farC.visible = !this.far.visible;
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
// ---------------------------------------------------------------------- the Southshore Speedway's surface (2026-11-18)
// The height field draws the oval's asphalt at its 1 m grid; over it, one merged mesh at the ground's own height (the
// banking and all): the track with its edge lines, the apron and its double yellow, the start/finish chequer, the pit
// lane and the paddock's concrete; and the walls: concrete round the outside, armco round the infield.
class OvalScenery {
  constructor(scene, world) {
    const cf = world.cfs; if (!cf || !cf.oval) return;
    const T = cf.track, O = OVAL, half = O.half, n = T.pts.length, pos = [], col = [];
    const gy = (x, z) => { const y = Terrain.height(x, z); return y === null ? O.y : y - Terrain.rough; };
    const C3 = new THREE.Color();
    // a quad a little over the ground (a, b, c, d: [x, z] round it), wound to face up
    const quad = (q, lift, hex) => {
      C3.setHex(hex); const P3 = q.map(p => [p[0], gy(p[0], p[1]) + lift, p[1]]);
      for (const tri of [[0, 1, 2], [0, 2, 3]]) {
        let [a, b, c] = tri.map(i => P3[i]);
        if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0) [b, c] = [c, b];
        for (const v of [a, b, c]) { pos.push(...v); col.push(C3.r, C3.g, C3.b); }
      }
    };
    // a strip along the oval between left offsets o1 < o2, every sample
    const strip = (o1, o2, lift, hex) => { for (let k = 0; k < n; k++) { const j = (k + 1) % n, A = T.pts[k], B2 = T.pts[j], na = T.nl[k], nb = T.nl[j]; const c = typeof hex === 'function' ? hex(k) : hex; if (c === null) continue; quad([[A[0] + na[0] * o1, A[1] + na[1] * o1], [A[0] + na[0] * o2, A[1] + na[1] * o2], [B2[0] + nb[0] * o2, B2[1] + nb[1] * o2], [B2[0] + nb[0] * o1, B2[1] + nb[1] * o1]], lift, c); } };
    strip(-half, half, 0.05, 0x2b2d30);
    strip(half, half + O.apron, 0.05, 0x55585c);
    strip(-half + 0.35, -half + 0.6, 0.07, 0xeeeeea); strip(half - 0.6, half - 0.35, 0.07, 0xeeeeea);
    strip(half + 0.1, half + 0.3, 0.07, 0xe8c04a); strip(half + 0.45, half + 0.65, 0.07, 0xe8c04a);
    // the start/finish line: a chequered band across the track
    { const k0 = cf.sf.k; for (let c = 0; c < 15; c++) for (let r2 = 0; r2 < 2; r2++) { const A = T.pts[(k0 + r2) % n], nl = T.nl[k0], o1 = -half + c, o2 = o1 + 1; quad([[A[0] + nl[0] * o1, A[1] + nl[1] * o1], [A[0] + nl[0] * o2, A[1] + nl[1] * o2], [A[0] + nl[0] * o2 - 1, A[1] + nl[1] * o2], [A[0] + nl[0] * o1 - 1, A[1] + nl[1] * o1]], 0.08, (c + r2) % 2 ? 0x111111 : 0xf2f2f2); } }
    // the paddock, the garage apron, the pit lane and its merges
    const Pd = O.paddock, PW = O.pit, R4 = (x0, z0, x1, z1, lift, hex) => quad([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], lift, hex);
    R4(Pd.x0, Pd.z0, Pd.x1, PW.garZ[0], 0.04, 0x8e8c86); R4(PW.garX[0], PW.garZ[0], PW.garX[1], PW.garZ[1], 0.04, 0x8e8c86);
    R4(PW.exit[0][0], PW.garZ[1], PW.entry[2][0], PW.z + PW.w / 2, 0.045, 0x34363a);
    const lane = [...PW.exit.slice().reverse(), ...PW.entry.slice().reverse()].reverse(), ln = lineNormals(lane);
    for (let k = 0; k < lane.length - 1; k++) { const A = lane[k], B2 = lane[k + 1], na = ln[k], nb = ln[k + 1], w = PW.w / 2; quad([[A[0] - na[0] * w, A[1] - na[1] * w], [A[0] + na[0] * w, A[1] + na[1] * w], [B2[0] + nb[0] * w, B2[1] + nb[1] * w], [B2[0] - nb[0] * w, B2[1] - nb[1] * w]], 0.045, 0x34363a); }
    for (const x of [PW.x0 + 6, PW.x1 - 6]) R4(x - 0.3, PW.z - PW.w / 2, x + 0.3, PW.z + PW.w / 2, 0.055, 0xf2f2f2);
    // the gate road's asphalt through the paddock to the turning circle
    const gp = cf.gate, gn = lineNormals(gp);
    for (let k = 0; k < gp.length - 1; k++) { if (gp[k][0] < CFS.x0) continue; const A = gp[k], B2 = gp[k + 1], na = gn[k], nb = gn[k + 1]; quad([[A[0] - na[0] * 4.5, A[1] - na[1] * 4.5], [A[0] + na[0] * 4.5, A[1] + na[1] * 4.5], [B2[0] + nb[0] * 4.5, B2[1] + nb[1] * 4.5], [B2[0] - nb[0] * 4.5, B2[1] - nb[1] * 4.5]], 0.045, 0x34363a); }
    { const R0 = O.ring, r = R0.r + 4, m = 32; for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, b = (i + 1) / m * Math.PI * 2; quad([[R0.x, R0.z], [R0.x + Math.cos(a) * r, R0.z + Math.sin(a) * r], [R0.x + Math.cos(b) * r, R0.z + Math.sin(b) * r], [R0.x, R0.z]], 0.05, 0x34363a); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); this.mesh.name = 'speedway'; this.mesh.receiveShadow = true; scene.add(this.mesh);
    // the walls: vertical faces along each line (both sides drawn), concrete 1.2 m with a fence above, armco a rail
    const wp = [], wc = [];
    const face = (a, b, y0, y1, hex) => { C3.setHex(hex); for (const v of [[a[0], a[2] + y0, a[1]], [b[0], b[2] + y0, b[1]], [b[0], b[2] + y1, b[1]], [a[0], a[2] + y0, a[1]], [b[0], b[2] + y1, b[1]], [a[0], a[2] + y1, a[1]]]) { wp.push(...v); wc.push(C3.r, C3.g, C3.b); } };
    for (const W of cf.walls) for (let k = 0; k < W.line.length; k++) {
      const a = W.line[k], b = W.line[(k + 1) % W.line.length]; if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) > 6) continue;
      if (W.kind === 'concrete') { face(a, b, -0.2, 1.2, 0xe4e4de); face(a, b, 1.2, 1.3, 0x1f6fb2); face(a, b, 1.3, 3.6, 0x6a7078); }
      else face(a, b, 0.45, 0.85, 0xc8ccd0);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3)); wg.computeVertexNormals();
    this.walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1 })); this.walls.name = 'speedway-walls'; scene.add(this.walls);
  }
}
