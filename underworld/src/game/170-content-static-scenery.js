/* =====================================================================
   [CONTENT] STATIC SCENERY (ground, sidewalk slabs, seawall, railing, water, bridge)
   ===================================================================== */
// district road styles: 0 standard, 1 Old Quarter (warm worn asphalt, granite setts at the kerb,
// dashed white centre line), 2 Financial District (dark fresh asphalt, crisp markings),
// 3 industrial (concrete slabs with joints, faded paint), 4 residential hills (pale smooth asphalt,
// no parking ticks), 5 Nightlife Strip (dark glossy asphalt that catches the neon at night)
const ROAD_STYLE = { o: 1, c: 2, s: 3, w: 3, h: 3, u: 4, l: 4, p: 5 };
function buildStaticScenery(scene, world) {
  // block-type lookup texture for the ground shader (lattice-indexed: each precinct's shader takes its offset off)
  const data = new Uint8Array(N * N * 4);
  for (const b of world.blocks) {
    const t = b.special === 'hospital' || b.special === 'police' ? DTYPE.C : DTYPE[b.ground || (b.landmark && b.landmark.ground) || b.t] || DTYPE.C;
    data[b.i * 4] = t; data[b.i * 4 + 3] = 255;
    // road style of the district (the road on a block's east and south sides takes it)
    data[b.i * 4 + 1] = ROAD_STYLE[zoneKey(b.cx, b.cz)] || 0;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  U.uAO.value = makeAOTexture(world);
  const roadTex = RoadNet.texture(), localTex = world.localTexture();
  const E = EDGE_MARGIN, pw = E - ROAD_HALF, wh = 3.2;
  // every precinct where it stands (021): its ground, its kerbs and slabs, its promenade and its seawall, drawn with a
  // ground material of its own whose shader takes the precinct's offset off before it reads the lattice's textures
  const grounds = [], slabsList = [], mats = [];
  for (const p of CityLayout.precincts) {
    const gmat = makeGroundMaterial(tex, roadTex, localTex, p.ox * P, p.oz * P); mats.push(gmat);
    const W = p.x1 - p.x0 + E * 2, D = p.z1 - p.z0 + E * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), gmat);
    ground.position.set((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2); ground.receiveShadow = true;
    scene.add(ground); grounds.push(ground);
    const gs = new GeoBuilder();
    for (const b of world.blocks) if (CityLayout.precinctOf(b.bx, b.bz) === p) gs.add(TPL.box, M(b.cx, CURB_H / 2, b.cz, P - ROAD_HALF * 2, CURB_H, P - ROAD_HALF * 2), null);
    // raised fill where a superblock swallowed a road segment (and its node, if no road is left there)
    for (let i = p.lx0; i <= p.lx1 + 1; i++) for (let j = p.lz0; j <= p.lz1; j++) { const I = (i + p.ox) * P, J = (j + p.oz) * P; if (!RoadNet.segOpen(0, i + p.ox, j + p.oz)) gs.add(TPL.box, M(I, CURB_H / 2, J + P / 2, ROAD_HALF * 2, CURB_H, P - ROAD_HALF * 2), null); }
    for (let i = p.lz0; i <= p.lz1 + 1; i++) for (let j = p.lx0; j <= p.lx1; j++) { const Z = (i + p.oz) * P, X = (j + p.ox) * P; if (!RoadNet.segOpen(1, i + p.oz, j + p.ox)) gs.add(TPL.box, M(X + P / 2, CURB_H / 2, Z, P - ROAD_HALF * 2, CURB_H, ROAD_HALF * 2), null); }
    for (let i = p.lx0; i <= p.lx1 + 1; i++) for (let j = p.lz0; j <= p.lz1 + 1; j++) if (RoadNet.degree(i + p.ox, j + p.oz) === 0) gs.add(TPL.box, M((i + p.ox) * P, CURB_H / 2, (j + p.oz) * P, ROAD_HALF * 2, CURB_H, ROAD_HALF * 2), null);
    // promenade strips outside the edge streets, less a seam (another precinct's blocks across the street) and the
    // land bridge to Cedar Fields South and the causeway to Valen Point where this edge still meets them
    const strips = (side, a0, a1) => {
      const ns = side === 'n' || side === 's', across = side === 'n' ? p.z0 - P / 2 : side === 's' ? p.z1 + P / 2 : side === 'w' ? p.x0 - P / 2 : p.x1 + P / 2;
      let runs = [[a0, a1]];
      const cut = (g0, g1) => { runs = runs.flatMap(([u, v]) => v <= g0 || u >= g1 ? [[u, v]] : [[u, g0], [g1, v]].filter(q => q[1] > q[0])); };
      for (let k = ns ? p.lx0 : p.lz0; k <= (ns ? p.lx1 : p.lz1); k++) { const t0 = ((ns ? p.ox : p.oz) + k) * P; if (ns ? CityLayout.cellAt(t0 + P / 2, across) >= 0 : CityLayout.cellAt(across, t0 + P / 2) >= 0) cut(t0 - ROAD_HALF, t0 + P + ROAD_HALF); }
      if (side === 's' && Math.abs(p.z1 - CITY) < 0.5) cut(CFS.lb.x - CFS.lb.half, CFS.lb.x + CFS.lb.half);
      if (side === 'e' && Math.abs(p.x1 - CITY) < 0.5) cut(VP.cw.z - VP.cw.half, VP.cw.z + VP.cw.half);
      return runs;
    };
    for (const [a, b2] of strips('n', p.x0 - E, p.x1 + E)) gs.add(TPL.box, M((a + b2) / 2, CURB_H / 2, p.z0 - ROAD_HALF - pw / 2, b2 - a, CURB_H, pw), null);
    for (const [a, b2] of strips('s', p.x0 - E, p.x1 + E)) gs.add(TPL.box, M((a + b2) / 2, CURB_H / 2, p.z1 + ROAD_HALF + pw / 2, b2 - a, CURB_H, pw), null);
    for (const [a, b2] of strips('w', p.z0 - ROAD_HALF, p.z1 + ROAD_HALF)) gs.add(TPL.box, M(p.x0 - ROAD_HALF - pw / 2, CURB_H / 2, (a + b2) / 2, pw, CURB_H, b2 - a), null);
    for (const [a, b2] of strips('e', p.z0 - ROAD_HALF, p.z1 + ROAD_HALF)) gs.add(TPL.box, M(p.x1 + ROAD_HALF + pw / 2, CURB_H / 2, (a + b2) / 2, pw, CURB_H, b2 - a), null);
    // seawall faces: only where this precinct's edge meets open water (world.shoreRuns; Operation Blackgate)
    for (const r of world.shoreRuns) if (r.k === p.k) {
      const ns = r.side === 'n' || r.side === 's', o = r.side === 'n' || r.side === 'w' ? -0.5 : 0.5;
      gs.add(TPL.box, ns ? M((r.a + r.b) / 2, CURB_H - wh / 2 - 0.01, r.at + o, r.b - r.a, wh, 1) : M(r.at + o, CURB_H - wh / 2 - 0.01, (r.a + r.b) / 2, 1, wh, r.b - r.a), null);
    }
    // the kerb cut away where each curved road leaves this precinct's lattice streets (Curved Roads pass)
    addCurbCuts(gs, c => CityLayout.at(c.axis === 0 ? c.line * P : c.seg * P + P / 2, c.axis === 0 ? c.seg * P + P / 2 : c.line * P) === p);
    const slabs = new THREE.Mesh(gs.build(), gmat); slabs.receiveShadow = true; scene.add(slabs); slabsList.push(slabs);
  }
  // the curved streets' painted lines
  buildRoadMarkings(scene);
  // railing: posts and two rails along the seawall's runs
  const gr = new GeoBuilder(); const rc = C(0x3a3f45);
  for (const r of world.shoreRuns) {
    const p = CityLayout.precincts[r.k], ns = r.side === 'n' || r.side === 's', o = r.side === 'n' || r.side === 'w' ? 0.3 : -0.3;
    const lo = (ns ? p.x0 : p.z0) - E, hi = (ns ? p.x1 : p.z1) + E;
    const P2 = t => ns ? [t, r.at + o] : [r.at + o, t];
    for (let t = Math.max(r.a, lo); t <= Math.min(r.b, hi); t += 2.5) { const [x, z] = P2(t); gr.add(TPL.cyl6, M(x, CURB_H + 0.55, z, 0.04, 1.1, 0.04), rc); }
    const [mx, mz] = P2((r.a + r.b) / 2);
    for (const [y, h] of [[1.1, 0.07], [0.6, 0.04]]) gr.add(TPL.box, M(mx, CURB_H + y, mz, ns ? r.b - r.a : 0.08, h, ns ? 0.08 : r.b - r.a), rc);
  }
  const rail = new THREE.Mesh(gr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  scene.add(rail);
  // water: the sea everywhere but under the precincts' frames (nothing shows through the city's ground, and a sheet
  // 1.2 m below it loses the depth test to it from high in the air). The plane is cut on every frame's edges, and a
  // cell of that cut is left out when a frame covers it
  const WH = 8000, xs = new Set([-WH, WH]), zs = new Set([-WH, WH]);
  for (const p of CityLayout.precincts) { xs.add(p.x0 - E); xs.add(p.x1 + E); zs.add(p.z0 - E); zs.add(p.z1 + E); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), wp = [], wi = [];
  const covered = (x, z) => CityLayout.precincts.some(p => x > p.x0 - E && x < p.x1 + E && z > p.z0 - E && z < p.z1 + E);
  for (let a = 0; a < X.length - 1; a++) for (let c = 0; c < Z.length - 1; c++) {
    const x0 = X[a], x1 = X[a + 1], z0 = Z[c], z1 = Z[c + 1];
    if (covered((x0 + x1) / 2, (z0 + z1) / 2)) continue;
    const n = wp.length / 3; wp.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0); wi.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setIndex(wi);
  const water = new THREE.Mesh(wgeo, makeWaterMaterial());
  water.position.set(0, -1.2, 0);
  scene.add(water);
  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4800, 32, 16), makeSkyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  // (the extensions' scenery off the lattice uses a ground material that stands where the lattice was authored)
  const at0 = CityLayout.precincts.find(p => !p.ox && !p.oz), gmat0 = at0 ? mats[at0.k] : makeGroundMaterial(tex, roadTex, localTex, 0, 0);
  return { ground: grounds[0], grounds, slabs: slabsList[0], slabsList, water, sky, gmat: gmat0, gmats: mats };
}
