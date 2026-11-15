/* =====================================================================
   [CONTENT] VALEN ISLAND: SCENERY (Operation Blackgate)
   The island's ground (022) drawn as vertex-coloured meshes:
   - near the focus, 256 m tiles at the physics' own 4 m grid (the same
     heights and the same two triangles a cell, so a wheel sits on what
     you see), each with a skirt, built one a frame as you move and
     dropped again behind you;
   - everything else as one 32 m mesh of the whole island whose index
     skips the tiles drawn near (and the sea bed, the city's square and
     Cedar Fields, which draw themselves);
   - forests: instanced trees on the near tiles (and their trunks'
     colliders), by the island's own forest map;
   - the roads as ribbons on their beds (one mesh, a painted texture), the
     turning circles, the Blackgate Bridge (deck, parapets, piers, towers
     and cables) and the Blackgate Tunnel (the tube, its lights, portals);
   - the airfield's and the proving ground's surfaces and paint.
   ===================================================================== */
const ISLE_SCN = { near: [300, 380, 450, 520], far: 32, keep: 200, trees: [20, 16, 14, 12] };
const ISLE_COL = [0x5f8146, 0xd9c9a0, 0x7d776d, 0x4a4d50, 0x3d5c36, 0x8a9150, 0x9a9c9a];
class IslandScenery {
  constructor(scene, world, game) {
    this.scene = scene; this.world = world; this.g = game;
    this.mat = makeTerrainMaterial();
    this.tiles = new Map(); this.queue = []; this.stats = { built: 0, trees: 0 };
    this._c = new THREE.Color(); this._c2 = new THREE.Color(); this._rgb = [0, 0, 0];
    this.far = this._farMesh(); scene.add(this.far);
    this.roads = this._roadMesh(); scene.add(this.roads);
    this.struct = this._structures(); scene.add(this.struct);
    this.paint = this._paint(); scene.add(this.paint);
    this._tx = 1e9; this._tz = 1e9; this._holes = new Set(); this._farDirty = true;
    this._treeGeo = null;
  }
  // ---------------------------------------------------------------- colours
  // the ground's colour at (x, z): its surface (grass, sand, rock, forest floor, dry grass), paler with height, mottled
  _col(x, z, h, slope) {
    const s = Island.surface(x, z, h, slope), c = this._c.setHex(ISLE_COL[s]), o = this._rgb;
    let k = 1 + 0.09 * tNoise(x / 37, z / 37, 67) + 0.05 * tNoise(x / 9, z / 9, 69);
    if (s === 0 || s === 4 || s === 5) {
      // steep ground shows its rock, high ground goes pale and stony, the shore's grass thins into sand
      const rock = smoothstep(0.42, 0.62, slope) + smoothstep(150, 215, h) * 0.7;
      if (rock > 0) c.lerp(this._c2.setHex(ISLE_COL[2]), Math.min(1, rock));
      k *= 1 + clamp((h - 30) * 0.0012, -0.04, 0.12);
    } else if (s === 1) k *= h < SEA_Y + 0.25 ? 0.72 : 1;
    o[0] = c.r * k; o[1] = c.g * k; o[2] = c.b * k;
    return o;
  }
  // is the cell with corner (x, z) and size s one the island does not draw (the city's square, Cedar Fields' own ground)?
  _foreign(x, z, s) {
    const E = EDGE_MARGIN;
    if (x >= -E && z >= -E && x + s <= CITY + E && z + s <= CITY + E) return true;
    if (x >= CFS.x0 && z >= CFS.z0 && x + s <= CFS.x1 && z + s <= CFS.z1) return true;
    return false;
  }
  // ---------------------------------------------------------------- the far mesh
  _farMesh() {
    const s = ISLE_SCN.far, nx = (ISLE.x1 - ISLE.x0) / s + 1, nz = (ISLE.z1 - ISLE.z0) / s + 1, n = nx * nz, E = EDGE_MARGIN;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nrm = new Float32Array(n * 3), H = new Float32Array(n);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = ISLE.x0 + i * s, z = ISLE.z0 + j * s;
      // inside the city's square the coarse mesh ducks under the streets it would otherwise cover
      H[j * nx + i] = x > -E && z > -E && x < CITY + E && z < CITY + E ? -0.6 : Island.compute(x, z, 26);
    }
    const hAt = (i, j) => H[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const o = (j * nx + i) * 3, x = ISLE.x0 + i * s, z = ISLE.z0 + j * s, h = H[j * nx + i];
      const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * s), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * s), l = Math.hypot(gx, 1, gz);
      pos[o] = x; pos[o + 1] = h; pos[o + 2] = z; nrm[o] = -gx / l; nrm[o + 1] = 1 / l; nrm[o + 2] = -gz / l;
      const c = this._col(x, z, h, Math.hypot(gx, gz)); col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // which tiles hold any land at all (the rest are never built near)
    const T = ISLE.tile / s, tw = (ISLE.x1 - ISLE.x0) / ISLE.tile, th = (ISLE.z1 - ISLE.z0) / ISLE.tile;
    this.landTile = new Uint8Array(tw * th); this.tw = tw; this.th = th;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) if (Math.max(H[j * nx + i], H[j * nx + i + 1], H[(j + 1) * nx + i], H[(j + 1) * nx + i + 1]) > SEA_Y - 0.6) this.landTile[Math.floor(j / T) * tw + Math.floor(i / T)] = 1;
    this._fg = { nx, nz, s, H, idx: new Uint32Array((nx - 1) * (nz - 1) * 6) };
    g.setIndex(new THREE.BufferAttribute(this._fg.idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((ISLE.x0 + ISLE.x1) / 2, 60, (ISLE.z0 + ISLE.z1) / 2), 4600);
    const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true; m.frustumCulled = false; m.name = 'isleFar';
    return m;
  }
  _farIndex() {
    const { nx, nz, s, H, idx } = this._fg, T = ISLE.tile / s; let n = 0;
    for (let j = 0; j < nz - 1; j++) {
      const tz = Math.floor(j / T);
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        if (Math.max(H[a], H[b], H[c], H[d]) < SEA_Y - 0.5) continue;
        if (this._holes.has(tz * 64 + Math.floor(i / T))) continue;
        if (this._foreign(ISLE.x0 + i * s, ISLE.z0 + j * s, s)) continue;
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
      }
    }
    const g = this.far.geometry; g.index.needsUpdate = true; g.setDrawRange(0, n);
    this._farDirty = false;
  }
  // ---------------------------------------------------------------- near tiles
  _tileMesh(tx, tz) {
    const T = Island._tile(tx, tz), n = T.n, c = ISLE.cell, hh = T.h, nv = n * n;
    const pos = new Float32Array((nv + n * 8) * 3), col = new Float32Array((nv + n * 8) * 3), nrm = new Float32Array((nv + n * 8) * 3), idx = [];
    const hAt = (i, j) => i >= 0 && j >= 0 && i < n && j < n ? hh[j * n + i] : Island.compute(T.x0 + i * c, T.z0 + j * c);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 3, x = T.x0 + i * c, z = T.z0 + j * c, h = hh[j * n + i];
      const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * c), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * c), l = Math.hypot(gx, 1, gz);
      pos[o] = x; pos[o + 1] = h; pos[o + 2] = z; nrm[o] = -gx / l; nrm[o + 1] = 1 / l; nrm[o + 2] = -gz / l;
      const q = this._col(x, z, h, Math.hypot(gx, gz)); col[o] = q[0]; col[o + 1] = q[1]; col[o + 2] = q[2];
    }
    // the tunnel's mouths: the cells of the cut's end wall that the bore goes through are left open
    const mouth = (x, z) => {
      if (!T.multi || !Island._nearRoad(Island._sseg, x, z)) return false;
      const R = Island._rr, k = Island._rk; if (!R.tunnel || Island._rd > 2.6) return false;
      return Math.abs(k - R.tunnel[0]) <= 1 || Math.abs(k + 1 - R.tunnel[1]) <= 1;
    };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
      if (Math.max(hh[a], hh[b], hh[cc], hh[d]) < SEA_Y - 0.5) continue;
      const x = T.x0 + i * c, z = T.z0 + j * c;
      if (this._foreign(x, z, c) || mouth(x + c / 2, z + c / 2)) continue;
      idx.push(a, cc, b, b, cc, d);
    }
    // a skirt round the tile hides the seam against the coarse mesh and a neighbour not built yet
    let v = nv;
    const edge = list => {
      const base = v;
      for (const q of list) { pos[v * 3] = pos[q * 3]; pos[v * 3 + 1] = pos[q * 3 + 1] - 2.2; pos[v * 3 + 2] = pos[q * 3 + 2]; col[v * 3] = col[q * 3] * 0.8; col[v * 3 + 1] = col[q * 3 + 1] * 0.8; col[v * 3 + 2] = col[q * 3 + 2] * 0.8; nrm[v * 3] = nrm[q * 3]; nrm[v * 3 + 1] = nrm[q * 3 + 1]; nrm[v * 3 + 2] = nrm[q * 3 + 2]; v++; }
      for (let k = 0; k < list.length - 1; k++) { const A = list[k], B = list[k + 1], a2 = base + k, b2 = a2 + 1; if (pos[A * 3 + 1] < SEA_Y - 0.5 && pos[B * 3 + 1] < SEA_Y - 0.5) continue; idx.push(A, a2, B, B, a2, b2, A, B, a2, B, b2, a2); }
    };
    const N2 = [], S2 = [], W2 = [], E2 = [];
    for (let i = 0; i < n; i++) { N2.push(i); S2.push((n - 1) * n + i); W2.push(i * n); E2.push(i * n + n - 1); }
    edge(N2); edge(S2); edge(W2); edge(E2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat); m.receiveShadow = true; m.name = 'isleTile';
    return m;
  }
  // the trees of a tile: a jittered grid over the island's forest map, clear of roads, pads, sand and rock
  _trees(tx, tz) {
    const lv = this.g.quality ? this.g.quality.level : 1, step = ISLE_SCN.trees[clamp(lv, 0, 3)], x0 = ISLE.x0 + tx * ISLE.tile, z0 = ISLE.z0 + tz * ISLE.tile, n = Math.floor(ISLE.tile / step);
    const list = [[], []];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const ix = Math.floor(x0 / step) + i, iz = Math.floor(z0 / step) + j;
      const x = (ix + 0.15 + 0.7 * hash2i(ix, iz, 201)) * step, z = (iz + 0.15 + 0.7 * hash2i(ix, iz, 203)) * step;
      const f = Island.forest(x, z); if (hash2i(ix, iz, 205) > (f - 0.42) * 2.4) continue;
      if (this._foreign(x - 6, z - 6, 12) || inValenPoint(x, z)) continue;
      const h = Island.height(x, z, 1e6), sl = Math.hypot(Island.gx, Island.gz);
      if (h < SEA_Y + 1.6 || sl > 0.6 || h > 200) continue;
      if (Island._nearRoad(Island._seg, x, z) && Island._rd < 5) continue;
      if (Island._nearRoad(Island._sseg, x, z) && Island._rd < 14) continue;
      let pad = false; for (const P of Island.pads) if (x > P.x0 - 5 && x < P.x1 + 5 && z > P.z0 - 5 && z < P.z1 + 5) { pad = true; break; }
      if (pad || Island.surface(x, z, h, sl) === 1) continue;
      const pine = hash2i(ix, iz, 207) < (z < 60 ? 0.3 + smoothstep(20, 120, h) * 0.55 : 0.2);
      list[pine ? 1 : 0].push([x, h, z, 0.9 + hash2i(ix, iz, 209) * 0.75, hash2i(ix, iz, 211) * 6.28]);
    }
    return list;
  }
  _treeGeos() {
    if (this._treeGeo) return this._treeGeo;
    const mk = t => { const g = new GeoBuilder(); PROP_DEFS[t].lod(g); return g.build(); };
    return this._treeGeo = [mk('tree'), mk('pine')];
  }
  _buildTile(tx, tz) {
    const key = tz * 64 + tx, group = new THREE.Group(), mesh = this._tileMesh(tx, tz); group.add(mesh);
    const T = { key, tx, tz, group, cols: [], trees: 0 };
    const lists = this._trees(tx, tz), geos = this._treeGeos(), fol = this.g.props ? this.g.props.folMat : null, lv = this.g.quality ? this.g.quality.level : 1;
    lists.forEach((L, k) => {
      if (!L.length || !fol) return;
      const im = new THREE.InstancedMesh(geos[k], fol, L.length); im.castShadow = lv >= 2; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(L.length * 3), 3);
      L.forEach((t, i) => {
        M(t[0], t[1] - 0.15, t[2], t[3], t[3], t[3], t[4]); im.setMatrixAt(i, _m4);
        const v = 0.8 + hash2i(Math.floor(t[0]), Math.floor(t[2]), 213) * 0.4; this._c.setRGB(v, 0.85 + (v - 0.8) * 0.5, v * 0.9); im.setColorAt(i, this._c);
        T.cols.push(this.world.grid.add({ x: t[0], z: t[2], r: 0.32 * t[3], y0: t[1] - 1, y1: t[1] + 3.2 * t[3], kind: 'det', tree: true }));
      });
      im.computeBoundingSphere(); group.add(im); T.trees += L.length;
    });
    this.scene.add(group); this.tiles.set(key, T);
    this._holes.add(key); this._farDirty = true; this.stats.built++; this.stats.trees += T.trees;
  }
  _dropTile(T) {
    this.scene.remove(T.group);
    T.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry) o.geometry.dispose(); });
    for (const c of T.cols) this.world.grid.remove(c);
    this.tiles.delete(T.key); this._holes.delete(T.key); this._farDirty = true; this.stats.trees -= T.trees;
  }
  // which tiles should be drawn near: every land tile within the near range of the focus
  update(fx, fz) {
    const lv = this.g.quality ? this.g.quality.level : 1, R = ISLE_SCN.near[clamp(lv, 0, 3)], Ts = ISLE.tile;
    const tx = Math.floor((fx - ISLE.x0) / 32), tz = Math.floor((fz - ISLE.z0) / 32);
    if (tx !== this._tx || tz !== this._tz || lv !== this._lv) {
      this._tx = tx; this._tz = tz; this._lv = lv;
      const want = [];
      for (let j = Math.floor((fz - R - ISLE.z0) / Ts); j <= Math.floor((fz + R - ISLE.z0) / Ts); j++) for (let i = Math.floor((fx - R - ISLE.x0) / Ts); i <= Math.floor((fx + R - ISLE.x0) / Ts); i++) {
        if (i < 0 || j < 0 || i >= this.tw || j >= this.th || !this.landTile[j * this.tw + i]) continue;
        const x0 = ISLE.x0 + i * Ts, z0 = ISLE.z0 + j * Ts, d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - Ts), Math.max(z0 - fz, 0, fz - z0 - Ts));
        if (d < R && !this.tiles.has(j * 64 + i)) want.push([d, i, j]);
      }
      want.sort((a, b) => a[0] - b[0]); this.queue = want;
      for (const T of [...this.tiles.values()]) { const x0 = ISLE.x0 + T.tx * Ts, z0 = ISLE.z0 + T.tz * Ts, d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - Ts), Math.max(z0 - fz, 0, fz - z0 - Ts)); if (d > R + ISLE_SCN.keep) this._dropTile(T); }
    }
    // one tile a frame (all of them when nothing is drawn yet: a new game, a load, a long jump)
    let budget = this.tiles.size === 0 ? 99 : 1;
    while (budget-- > 0 && this.queue.length) { const [, i, j] = this.queue.shift(); if (!this.tiles.has(j * 64 + i)) this._buildTile(i, j); }
    if (this._farDirty) this._farIndex();
  }
  // ---------------------------------------------------------------- roads
  _roadTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#3b3d41'; g.fillRect(0, 0, 128, 256);
    // worn wheel tracks, a little grain, white edge lines, a dashed yellow centre line
    for (let k = 0; k < 900; k++) { const v = 52 + Math.floor(hash2i(k, 7, 301) * 26); g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(hash2i(k, 1, 303) * 128, hash2i(k, 2, 305) * 256, 2, 2); }
    g.fillStyle = 'rgba(30,31,34,0.35)'; for (const x of [26, 46, 74, 94]) g.fillRect(x, 0, 8, 256);
    g.fillStyle = '#e4e4de'; g.fillRect(6, 0, 3, 256); g.fillRect(119, 0, 3, 256);
    g.fillStyle = '#e2b43a'; g.fillRect(62, 0, 4, 110);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  _roadMesh() {
    const pos = [], uv = [], nrm = [], idx = [], E = EDGE_MARGIN;
    const inCity = p => p[0] > -E && p[1] > -E && p[0] < CITY + E && p[1] < CITY + E;
    for (const R of Island.roads) {
      let prev = -1;
      for (let k = 0; k < R.pts.length; k++) {
        const p = R.pts[k];
        // inside the city's square the ground shader paints the road (the local-roads raster); the ribbon starts at its edge
        if (inCity(p) && inCity(R.pts[Math.min(R.pts.length - 1, k + 1)]) && inCity(R.pts[Math.max(0, k - 1)])) { prev = -1; continue; }
        const a = R.pts[Math.max(0, k - 1)], b = R.pts[Math.min(R.pts.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l, base = pos.length / 3, y = R.y[k] + 0.035;
        pos.push(p[0] + nx * R.w / 2, y, p[1] + nz * R.w / 2, p[0] - nx * R.w / 2, y, p[1] - nz * R.w / 2);
        uv.push(0, R.cum[k] / 12, 1, R.cum[k] / 12); nrm.push(0, 1, 0, 0, 1, 0);
        if (prev >= 0) idx.push(prev, base, prev + 1, prev + 1, base, base + 1);
        prev = base;
      }
      // the turning circle at a dead end
      if (R.ring) {
        const c0 = pos.length / 3, y = R.y[R.y.length - 1] + 0.03, rr = R.ring.r + R.w / 2;
        pos.push(R.ring.x, y, R.ring.z); uv.push(0.3, 0); nrm.push(0, 1, 0);
        for (let q = 0; q <= 32; q++) { const an = q / 32 * Math.PI * 2; pos.push(R.ring.x + Math.cos(an) * rr, y, R.ring.z + Math.sin(an) * rr); uv.push(0.3, 0.6); nrm.push(0, 1, 0); if (q) idx.push(c0, c0 + q + 1, c0 + q); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this._roadTexture(), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; m.frustumCulled = false; m.name = 'isleRoads';
    return m;
  }
  // ---------------------------------------------------------------- the bridge and the tunnel
  _structures() {
    const g = new GeoBuilder(), glow = new GeoBuilder(), group = new THREE.Group(), steel = C(0x23272c), conc = C(0x9a9c98), dark = C(0x3a3c40);
    const seg = (a, b, w, hgt, yOff, col) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), pitch = Math.atan2(b[2] - a[2], L); g.add(TPL.box, M((a[0] + b[0]) / 2, (a[2] + b[2]) / 2 + yOff, (a[1] + b[1]) / 2, w, hgt, Math.hypot(L, b[2] - a[2]) + 0.05, Math.atan2(dx, dz), -pitch), col); };
    for (const R of Island.roads) {
      const P3 = k => [R.pts[k][0], R.pts[k][1], R.y[k]];
      for (const [k0, k1] of R.bridges) {
        const span = R.cum[k1] - R.cum[k0], big = span > 300;
        for (let k = k0; k < k1; k++) seg(P3(k), P3(k + 1), R.w + 1.6, 1.1, -0.58, conc);
        // piers down to the bed, a little under 50 m apart
        const np = Math.max(1, Math.round(span / 48));
        for (let q = 1; q < np; q++) { const k = Math.round(k0 + (k1 - k0) * q / np), p = P3(k), bed = Island.base0(p[0], p[1]); g.add(TPL.box, M(p[0], (p[2] - 1.1 + bed - 1) / 2, p[1], 2.4, p[2] - 1.1 - bed + 1, R.w * 0.7, Math.atan2(R.pts[k + 1][0] - p[0], R.pts[k + 1][1] - p[1])), conc); }
        if (big) for (const T of this.world.isle.towers || []) if (T.road === R) {
          // a tower: two legs, portal beams, a red light on each; the main cables and their hangers
          for (const L of T.legs) { g.add(TPL.box, M(L.x, (T.top + T.bed) / 2, L.z, 3, T.top - T.bed, 3.4, T.h), steel); glow.add(TPL.sphere0, M(L.x, T.top + 0.7, L.z, 0.6, 0.6, 0.6), C(0xff2a2a)); }
          for (const yy of [T.deck + 9, T.top - 4]) g.add(TPL.box, M(T.x, yy, T.z, R.w + 6, 2.2, 2.6, T.h), steel);
        }
        if (big) {
          const TT = (this.world.isle.towers || []).filter(T => T.road === R).sort((a, b) => a.k - b.k);
          if (TT.length === 2) for (const side of [-1, 1]) {
            const off = R.w / 2 + 1.2, at = k => { const a = R.pts[Math.max(0, k - 1)], b = R.pts[Math.min(R.pts.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [R.pts[k][0] + (b[1] - a[1]) / l * off * side, R.pts[k][1] - (b[0] - a[0]) / l * off * side, R.y[k]]; };
            // the cable's height over the deck: from the anchorages up to each tower's top, sagging to 4 m at mid-span
            const hgt = k => { const [A, B] = TT; if (k <= A.k) return lerp(1.2, A.top - A.deck, ((k - k0) / Math.max(1, A.k - k0)) ** 1.6); if (k >= B.k) return lerp(1.2, B.top - B.deck, ((k1 - k) / Math.max(1, k1 - B.k)) ** 1.6); const u = (k - A.k) / (B.k - A.k) * 2 - 1; return 4 + (A.top - A.deck - 4) * u * u; };
            for (let k = k0; k < k1; k++) { const a = at(k), b = at(k + 1); a[2] += hgt(k); b[2] += hgt(k + 1); seg(a, b, 0.5, 0.5, 0, steel); if ((k - k0) % 4 === 2) { const p = at(k), hh = hgt(k); if (hh > 2) g.add(TPL.box, M(p[0], p[2] + hh / 2, p[1], 0.14, hh, 0.14), steel); } }
          }
        }
      }
      // parapets along every span's rails; the tunnel's walls, roof and lights
      if (R.tunnel) {
        const [k0, k1] = R.tunnel, a0 = Math.max(0, k0 - 2), a1 = Math.min(R.pts.length - 1, k1 + 2), wl = R.w / 2 + 1.1;
        for (let k = a0; k < a1; k++) {
          const a = P3(k), b = P3(k + 1), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
          for (const s of [-1, 1]) seg([a[0] + nx * wl * s, a[1] + nz * wl * s, a[2]], [b[0] + nx * wl * s, b[1] + nz * wl * s, b[2]], 0.6, 6.6, 3.2, dark);
          seg(a, b, R.w + 2.8, 0.6, 6.7, dark);
          if (k % 4 === 0) glow.add(TPL.box, M(a[0], a[2] + 6.3, a[1], 1.6, 0.12, 0.5, Math.atan2(dx, dz)), C(0xffe2a8));
        }
        // the portals: two piers and a lintel in front of each mouth
        for (const [k, dir] of [[a0, 1], [a1, -1]]) {
          const p = P3(k), q = P3(k + dir), h = Math.atan2(q[0] - p[0], q[1] - p[1]), fx = Math.sin(h), fz = Math.cos(h), rx = fz, rz = -fx;
          for (const s of [-1, 1]) g.add(TPL.box, M(p[0] + rx * s * (R.w / 2 + 3.4), p[2] + 4.5, p[1] + rz * s * (R.w / 2 + 3.4), 4.6, 9.6, 1.6, h), conc);
          g.add(TPL.box, M(p[0], p[2] + 8.6, p[1], R.w + 11.4, 3.4, 1.6, h), conc);
          const sgn = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.5), new THREE.MeshBasicMaterial({ map: makeSignTexture('BLACKGATE TUNNEL', '#14181c', '#ffffff', 1024, 118) }));
          sgn.position.set(p[0] - fx * 0.85, p[2] + 8.6, p[1] - fz * 0.85); sgn.rotation.y = h + Math.PI; group.add(sgn);
        }
      }
    }
    for (const r of this.world.isle.rails) if (r.kind === 1) for (let k = 0; k < r.line.length - 1; k++) seg(r.line[k], r.line[k + 1], 0.3, 1.0, 0.5, conc);
    if (!g.empty) { const m = new THREE.Mesh(g.build(), makePropMaterial(0.85, 0.1)); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); }
    if (!glow.empty) { const m = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true })); m.frustumCulled = false; group.add(m); }
    group.name = 'isleStruct';
    return group;
  }
  // ---------------------------------------------------------------- the airfield and the proving ground: surfaces and paint
  _paint() {
    const g = new GeoBuilder(), group = new THREE.Group(), A = AIRPORT, Y = A.y, asph = C(0x2e3034), conc = C(0x8f918e), white = C(0xe8e8e2), yel = C(0xe2b43a), lot = C(0x3a3c40);
    const slab = (x0, z0, x1, z1, y, col, lift = 0.03) => g.add(TPL.box, M((x0 + x1) / 2, y + lift - 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0), col);
    const label = (text, x, y, z, w, h, ry, fg = '#e8e8e2') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: makeSignTexture(text, '#2e3034', fg, 512, Math.round(512 * h / w)), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, y + 0.07, z); group.add(m); };
    // the apron, the taxiway and its links to both runways, the runways with their centre lines, edges and thresholds
    slab(A.apron.x0, A.apron.z0, A.apron.x1, A.apron.z1, Y, conc);
    slab(A.tw.x0, A.tw.z - A.tw.w / 2, A.tw.x1, A.tw.z + A.tw.w / 2, Y, asph);
    slab(A.tw.x0, A.tw.z - 0.2, A.tw.x1, A.tw.z + 0.2, Y, yel, 0.05);
    for (const lx of A.links) { slab(lx - 9, A.apron.z1, lx + 9, A.rw[0].z - A.rw[0].w / 2, Y, asph, 0.025); slab(lx - 0.2, A.apron.z1, lx + 0.2, A.rw[0].z - A.rw[0].w / 2, Y, yel, 0.05); }
    for (const r of A.rw) {
      slab(r.x0, r.z - r.w / 2, r.x1, r.z + r.w / 2, Y, asph, 0.04);
      for (let x = r.x0 + 150; x < r.x1 - 150; x += 60) slab(x, r.z - 0.45, x + 30, r.z + 0.45, Y, white, 0.06);
      for (const s of [-1, 1]) slab(r.x0, r.z + s * (r.w / 2 - 1.2) - 0.45, r.x1, r.z + s * (r.w / 2 - 1.2) + 0.45, Y, white, 0.06);
      for (const [x, d] of [[r.x0 + 8, 1], [r.x1 - 8, -1]]) for (let q = 0; q < 8; q++) { const z = r.z + (q - 3.5) * (r.w - 6) / 8; slab(Math.min(x, x + d * 30), z - 0.9, Math.max(x, x + d * 30), z + 0.9, Y, white, 0.06); }
      label(r.id.split('/')[0], r.x0 + 62, Y, r.z, 18, 12, -Math.PI / 2); label(r.id.split('/')[1], r.x1 - 62, Y, r.z, 18, 12, Math.PI / 2);
    }
    // the helipads' circles, the stands' lead-in lines, the car park and its bays
    for (const h of this.world.isle.sites.helipads) { for (let q = 0; q < 28; q++) { const a = q / 28 * Math.PI * 2; g.add(TPL.box, M(h.x + Math.cos(a) * 7, Y + 0.02, h.z + Math.sin(a) * 7, 1.6, 0.1, 0.45, -a + Math.PI / 2), yel); } label('H', h.x, Y, h.z, 6, 6, 0); }
    for (const x of [1023, 1079]) slab(x - 0.2, 1950, x + 0.2, A.apron.z1, Y, yel, 0.05);
    const cp = this.world.isle.sites.carpark; slab(cp.x0, cp.z0, cp.x1, cp.z1, Y, lot);
    for (let r = 0; r < 3; r++) for (let k = 0; k <= 11; k++) slab(304.4 + k * 15, 1857 + r * 22, 304.7 + k * 15, 1867 + r * 22, Y, white, 0.05);
    // hangar floors
    for (const H of this.world.isle.sites.hangars) slab(H.x0, H.z0, H.x1, A.apron.z0, Y, conc, 0.025);
    // the proving ground: the strip and its lanes, the skid pad's rings, the slalom lot
    const G = PROVING, S = G.strip, GY = G.y;
    slab(S.x0, S.z - S.w / 2, S.x1, S.z + S.w / 2, GY, asph, 0.04);
    for (const s of [-1, 0, 1]) for (let x = S.x0 + 4; x < S.x1 - 8; x += s ? 1e9 : 24) slab(x, S.z + s * (S.w / 2 - 0.8) - 0.2, s ? S.x1 : x + 10, S.z + s * (S.w / 2 - 0.8) + 0.2, GY, white, 0.06);
    slab(S.x0 + 19.4, S.z - S.w / 2, S.x0 + 20.6, S.z + S.w / 2, GY, white, 0.06); slab(S.x0 + 1019.4, S.z - S.w / 2, S.x0 + 1020.6, S.z + S.w / 2, GY, white, 0.06);
    g.add(TPL.disc, M(G.pad.x, GY + 0.04, G.pad.z, G.pad.r, 1, G.pad.r), asph);
    for (const rr of [18, 34, G.pad.r - 2]) for (let q = 0; q < 48; q++) { const a = q / 48 * Math.PI * 2; g.add(TPL.box, M(G.pad.x + Math.cos(a) * rr, GY + 0.02, G.pad.z + Math.sin(a) * rr, rr * 0.09, 0.1, 0.3, -a + Math.PI / 2), white); }
    slab(G.lot.x0, G.lot.z0, G.lot.x1, G.lot.z1, GY, asph, 0.04);
    slab(1196, 1503, 1204, S.z - S.w / 2, GY, asph, 0.035);
    const m = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; m.frustumCulled = false; group.add(m); group.name = 'islePaint';
    return group;
  }
}
