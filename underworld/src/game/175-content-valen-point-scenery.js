/* =====================================================================
   [CONTENT] VALEN POINT: STATIC SCENERY (Session 6B)
   Two merged versions of the district's ground-level dressing:
   - near: the island's ground and seawall, the causeway, the track with
     run-off, kerbs, edge lines and the start/finish line, the pit lane,
     paddock and car parks, and the armco on both sides of the circuit
     (two meshes, two draw calls);
   - far: the island, the causeway and the track's asphalt only (one).
   One or the other is shown by the focus's distance from the island.
   Buildings, grandstands and the paddock stream as district blocks.
   ===================================================================== */
const VP_COL = { grass: 0x5d7f45, gravel: 0xb3a27e, asphalt: 0x2b2d30, line: 0xeeeeea, red: 0xc0392b, white: 0xf2f2f2, concrete: 0x8e8c86, park: 0x36383b, rock: 0x6b665c, yellow: 0xe8c04a };
// levels (the physical ground is 0 everywhere on the island: the verge sits a little lower for the eye)
const VP_Y = { ground: -0.08, gravel: -0.04, asphalt: 0, paint: 0.02, kerb: 0.03 };
class FlatBuilder {
  constructor() { this.p = []; this.c = []; }
  quad(a, b, c2, d, y, col) {
    const cc = new THREE.Color(col);
    for (const q of [a, b, c2, a, c2, d]) { this.p.push(q[0], y, q[1]); this.c.push(cc.r, cc.g, cc.b); }
  }
  rect(x0, z0, x1, z1, y, col) { this.quad([x0, z0], [x0, z1], [x1, z1], [x1, z0], y, col); }
  // a strip along a centreline between signed offsets o1 < o2 (along the left normal), sample k to k+1
  strip(pts, nl, k0, k1, o1, o2, y, col, closed) {
    const n = pts.length;
    for (let k = k0; k < k1; k++) {
      const a = k % n, b = (k + 1) % n; if (!closed && b === 0) break;
      const A = pts[a], B = pts[b], na = nl[a], nb = nl[b];
      const c = typeof col === 'function' ? col(a) : col; if (c === null) continue;
      const O1 = typeof o1 === 'function' ? o1(a) : o1, O2 = typeof o2 === 'function' ? o2(a) : o2;
      this.quad([A[0] + na[0] * O1, A[1] + na[1] * O1], [A[0] + na[0] * O2, A[1] + na[1] * O2], [B[0] + nb[0] * O2, B[1] + nb[1] * O2], [B[0] + nb[0] * O1, B[1] + nb[1] * O1], y, c);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const nrm = new Float32Array(this.p.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    return m;
  }
}
// normals for an open polyline
function vpNormals(pts) { return pts.map((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; }); }
class ValenPointScenery {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const vp = world.vp, T = vp.track, mat = makeTerrainMaterial({ side: THREE.DoubleSide, mown: true });
    this.mat = mat;
    // ---------------------------------------------------------------- shared: the island and the causeway
    const base = fb => {
      fb.rect(VP.x0, VP.z0, VP.x1, VP.z1, VP_Y.ground, VP_COL.grass);
      // seawall faces (vertical) round the island and the causeway's embankment
      const face = (x0, z0, x1, z1) => { const cc = new THREE.Color(VP_COL.rock); for (const q of [[x0, 0, z0], [x0, -3, z0], [x1, -3, z1], [x0, 0, z0], [x1, -3, z1], [x1, 0, z1]]) { fb.p.push(q[0], q[1] + VP_Y.ground, q[2]); fb.c.push(cc.r, cc.g, cc.b); } };
      face(VP.x0, VP.z0, VP.x1, VP.z0); face(VP.x1, VP.z0, VP.x1, VP.z1); face(VP.x1, VP.z1, VP.x0, VP.z1); face(VP.x0, VP.z1, VP.x0, VP.cw.z + VP.cw.half); face(VP.x0, VP.cw.z - VP.cw.half, VP.x0, VP.z0);
      const cz = VP.cw.z, h = VP.cw.half + 2, ce = CITY + EDGE_MARGIN;
      fb.rect(ce, cz - h, VP.x0, cz + h, -0.25, VP_COL.rock);
      face(ce, cz - h, VP.x0, cz - h); face(VP.x0, cz + h, ce, cz + h);
      fb.rect(VP.cw.x0, cz - VP.cw.road, VP_SITE.ring.x, cz + VP.cw.road, VP_Y.asphalt, VP_COL.asphalt);
    };
    // ---------------------------------------------------------------- near
    const fn = new FlatBuilder(); base(fn);
    const half = VP_TRACK.w / 2, N2 = T.pts.length, cz = VP.cw.z;
    // the causeway's paint: edge lines and a dashed centre line
    for (const s of [-1, 1]) fn.rect(VP.cw.x0 + 4, cz + s * (VP.cw.road - 0.45) - 0.12, VP.x0, cz + s * (VP.cw.road - 0.45) + 0.12, VP_Y.paint, VP_COL.line);
    for (let x = VP.cw.x0 + 10; x < VP.x0; x += 9) fn.rect(x, cz - 0.1, x + 4.5, cz + 0.1, VP_Y.paint, VP_COL.yellow);
    // the turning circle (an asphalt disc round the island)
    { const R0 = VP_SITE.ring, m = 32; for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, b = (i + 1) / m * Math.PI * 2, ro = R0.r + VP.cw.road; fn.quad([R0.x + Math.cos(a) * 6, R0.z + Math.sin(a) * 6], [R0.x + Math.cos(a) * ro, R0.z + Math.sin(a) * ro], [R0.x + Math.cos(b) * ro, R0.z + Math.sin(b) * ro], [R0.x + Math.cos(b) * 6, R0.z + Math.sin(b) * 6], VP_Y.asphalt + 0.001, VP_COL.asphalt); } }
    // paddock (concrete), car parks (asphalt with bay lines)
    const S = VP_SITE;
    fn.rect(S.paddock.x0, S.paddock.z0, S.paddock.x1, S.paddock.z1, VP_Y.gravel + 0.01, VP_COL.concrete);
    for (const Pk of [S.parkN, S.parkS]) {
      fn.rect(Pk.x0, Pk.z0, Pk.x1, Pk.z1, VP_Y.gravel + 0.01, VP_COL.park);
      for (let z = Pk.z0 + 8; z < Pk.z1 - 6; z += 16) for (let x = Pk.x0 + 3; x < Pk.x1 - 2; x += 2.8) fn.rect(x, z - 2.6, x + 0.12, z + 2.6, VP_Y.paint - 0.01, VP_COL.line);
    }
    // the apron between the garages, the grandstands and the pit lane
    fn.rect(VP_PIT.garX[1], S.standN.z0, VP_PIT.laneX - VP_PIT.laneW / 2, S.standS.z1, VP_Y.gravel + 0.01, VP_COL.concrete);
    // the pit lane, its merges, and its paint
    const lane = [...VP_PIT.entry, ...VP_PIT.exit];
    void lane;
    for (const poly of [[...VP_PIT.entry, [VP_PIT.laneX, VP_PIT.lane[0]]], [[VP_PIT.laneX, VP_PIT.lane[0]], ...VP_PIT.exit.slice(1)]]) {
      const ps = this._dense(poly, 2), nl = vpNormals(ps);
      fn.strip(ps, nl, 0, ps.length - 1, -VP_PIT.laneW / 2, VP_PIT.laneW / 2, VP_Y.asphalt, VP_COL.asphalt, false);
    }
    fn.rect(VP_PIT.laneX - VP_PIT.laneW / 2 - 0.2, VP_PIT.lane[0], VP_PIT.laneX + VP_PIT.laneW / 2, VP_PIT.lane[1], VP_Y.asphalt, VP_COL.asphalt);
    fn.rect(VP_PIT.laneX + 1.8, VP_PIT.lane[0], VP_PIT.laneX + 2.0, VP_PIT.lane[1], VP_Y.paint, VP_COL.line);
    fn.rect(VP_PIT.wallX - 0.6, VP_PIT.wall[0], VP_PIT.wallX + 0.6, VP_PIT.wall[1], 1.25, 0xd8dade);
    // the circuit: gravel traps outside the corners, asphalt, kerbs on the corners, edge lines, the start/finish line
    const bar = vp.barriers;
    const dist = (k, s) => { const q = bar[s > 0 ? 0 : 1][k]; if (!q) return half + 12; const p = T.pts[k]; return Math.hypot(q[0] - p[0], q[1] - p[1]); };
    fn.strip(T.pts, T.nl, 0, N2, k => half + 1.2, k => Math.max(half + 1.3, dist(k, 1) - 1.5), VP_Y.gravel, k => T.R[k] > 0 ? VP_COL.gravel : null, true);
    fn.strip(T.pts, T.nl, 0, N2, k => -Math.max(half + 1.3, dist(k, -1) - 1.5), -half - 1.2, VP_Y.gravel, k => T.R[k] > 0 ? VP_COL.gravel : null, true);
    fn.strip(T.pts, T.nl, 0, N2, -half, half, VP_Y.asphalt, VP_COL.asphalt, true);
    const kerb = k => T.R[k] > 0 ? (Math.floor(k / 2) % 2 ? VP_COL.red : VP_COL.white) : null;
    fn.strip(T.pts, T.nl, 0, N2, half, half + 1.2, VP_Y.kerb, kerb, true);
    fn.strip(T.pts, T.nl, 0, N2, -half - 1.2, -half, VP_Y.kerb, kerb, true);
    fn.strip(T.pts, T.nl, 0, N2, half - 0.55, half - 0.3, VP_Y.paint, VP_COL.line, true);
    fn.strip(T.pts, T.nl, 0, N2, -half + 0.3, -half + 0.55, VP_Y.paint, VP_COL.line, true);
    { const k = vp.sf.k; for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) { const o = -half + i, c = (i + j) % 2 ? VP_COL.white : 0x111111; const p = T.pts[k], nl = T.nl[k], tx = -nl[1], tz = nl[0], d0 = j * 0.6 - 0.6, d1 = d0 + 0.6; const P0 = (oo, dd) => [p[0] + nl[0] * oo + tx * dd, p[1] + nl[1] * oo + tz * dd]; fn.quad(P0(o, d0), P0(o + 1, d0), P0(o + 1, d1), P0(o, d1), VP_Y.kerb + 0.002, c); } }
    // armco: rails and posts along both barrier lines (one vertex-coloured mesh)
    const gv = new GeoBuilder(), steel = C(0xb9bec4), post = C(0x6a7078);
    for (const line of bar) for (let k = 0; k < N2; k++) {
      const a = line[k], b = line[(k + 1) % N2]; if (!a || !b) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.01) continue;
      const ry = Math.atan2(-dz, dx), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      gv.add(TPL.box, M(mx, 0.55, mz, L + 0.05, 0.32, 0.12, ry), steel);
      if (k % 2 === 0) gv.add(TPL.box, M(a[0], 0.35, a[1], 0.14, 0.7, 0.14, ry), post);
    }
    const near = new THREE.Group();
    near.add(fn.mesh(mat));
    const steelM = new THREE.Mesh(gv.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 })); steelM.castShadow = false; steelM.receiveShadow = true;
    near.add(steelM);
    // ---------------------------------------------------------------- far: the island, the causeway and the asphalt
    const ff = new FlatBuilder(); base(ff);
    const coarse = T.pts.filter((p, k) => k % 4 === 0), cn = coarse.map((p, k) => T.nl[k * 4]);
    ff.strip(coarse, cn, 0, coarse.length, -half, half, VP_Y.asphalt, VP_COL.asphalt, true);
    const far = new THREE.Group(); far.add(ff.mesh(mat));
    this.near = near; this.far = far; this.mode = null;
    scene.add(near); scene.add(far); near.visible = false; far.visible = true;
  }
  // a polyline resampled every `step` metres
  _dense(poly, step) {
    const out = [];
    for (let k = 0; k < poly.length - 1; k++) { const a = poly[k], b = poly[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L / step)); for (let i = 0; i < m; i++) out.push([lerp(a[0], b[0], i / m), lerp(a[1], b[1], i / m)]); }
    out.push(poly[poly.length - 1]);
    return out;
  }
  // near within 650 m of the island, far beyond
  update(fx, fz) {
    const dx = Math.max(VP.x0 - fx, 0, fx - VP.x1), dz = Math.max(VP.z0 - fz, 0, fz - VP.z1), d = Math.hypot(dx, dz);
    const near = d < 650;
    if (near !== this.mode) { this.mode = near; this.near.visible = near; this.far.visible = !near; }
  }
}
