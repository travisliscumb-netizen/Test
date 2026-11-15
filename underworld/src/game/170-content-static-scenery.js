/* =====================================================================
   [CONTENT] STATIC SCENERY (ground, sidewalk slabs, seawall, railing, water, bridge)
   ===================================================================== */
// district road styles: 0 standard, 1 Old Quarter (warm worn asphalt, granite setts at the kerb,
// dashed white centre line), 2 Financial District (dark fresh asphalt, crisp markings),
// 3 industrial (concrete slabs with joints, faded paint), 4 residential hills (pale smooth asphalt,
// no parking ticks), 5 Nightlife Strip (dark glossy asphalt that catches the neon at night)
const ROAD_STYLE = { o: 1, c: 2, s: 3, w: 3, h: 3, u: 4, l: 4, p: 5 };
function buildStaticScenery(scene, world) {
  // block-type lookup texture for the ground shader
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
  const gmat = makeGroundMaterial(tex, RoadNet.texture(), world.localTexture());
  const E = EDGE_MARGIN;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY + E * 2, CITY + E * 2).rotateX(-Math.PI / 2), gmat);
  ground.position.set(CITY / 2, 0, CITY / 2); ground.receiveShadow = true;
  scene.add(ground);
  const gs = new GeoBuilder();
  for (const b of world.blocks) gs.add(TPL.box, M(b.cx, CURB_H / 2, b.cz, P - ROAD_HALF * 2, CURB_H, P - ROAD_HALF * 2), null);
  // raised fill where a superblock swallowed a road segment (and its node, if no road is left there)
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    if (!RoadNet.segOpen(0, i, j)) gs.add(TPL.box, M(i * P, CURB_H / 2, j * P + P / 2, ROAD_HALF * 2, CURB_H, P - ROAD_HALF * 2), null);
    if (!RoadNet.segOpen(1, i, j)) gs.add(TPL.box, M(j * P + P / 2, CURB_H / 2, i * P, P - ROAD_HALF * 2, CURB_H, ROAD_HALF * 2), null);
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (RoadNet.degree(i, j) === 0) gs.add(TPL.box, M(i * P, CURB_H / 2, j * P, ROAD_HALF * 2, CURB_H, ROAD_HALF * 2), null);
  // promenade ring
  const pw = E - ROAD_HALF, L = CITY + E * 2;
  gs.add(TPL.box, M(CITY / 2, CURB_H / 2, -ROAD_HALF - pw / 2, L, CURB_H, pw), null);
  // the south promenade, seawall and railing stop either side of the land bridge to Cedar Fields South (Session 6C)
  const s0 = CFS.lb.x - CFS.lb.half, s1 = CFS.lb.x + CFS.lb.half, southRun = (x0, x1, f) => { if (x1 > x0) f((x0 + x1) / 2, x1 - x0); };
  for (const [x0, x1] of [[-E, s0], [s1, CITY + E]]) southRun(x0, x1, (xc, l) => gs.add(TPL.box, M(xc, CURB_H / 2, CITY + ROAD_HALF + pw / 2, l, CURB_H, pw), null));
  gs.add(TPL.box, M(-ROAD_HALF - pw / 2, CURB_H / 2, CITY / 2, pw, CURB_H, CITY + ROAD_HALF * 2), null);
  // the east promenade, seawall and railing stop either side of the causeway to Valen Point (Session 6B)
  const g0 = VP.cw.z - VP.cw.half, g1 = VP.cw.z + VP.cw.half, eastRun = (z0, z1, f) => { if (z1 > z0) f((z0 + z1) / 2, z1 - z0); };
  eastRun(-ROAD_HALF, g0, (zc, l) => gs.add(TPL.box, M(CITY + ROAD_HALF + pw / 2, CURB_H / 2, zc, pw, CURB_H, l), null));
  eastRun(g1, CITY + ROAD_HALF, (zc, l) => gs.add(TPL.box, M(CITY + ROAD_HALF + pw / 2, CURB_H / 2, zc, pw, CURB_H, l), null));
  // seawall faces: only where the city's edge meets open water (world.shore; Operation Blackgate)
  const wh = 3.2, SH = world.shore;
  for (const [a, b] of SH.n) gs.add(TPL.box, M((a + b) / 2, CURB_H - wh / 2 - 0.01, -E - 0.5, b - a, wh, 1), null);
  for (const [a, b] of SH.s) gs.add(TPL.box, M((a + b) / 2, CURB_H - wh / 2 - 0.01, CITY + E + 0.5, b - a, wh, 1), null);
  for (const [a, b] of SH.w) gs.add(TPL.box, M(-E - 0.5, CURB_H - wh / 2 - 0.01, (a + b) / 2, 1, wh, b - a), null);
  for (const [a, b] of SH.e) gs.add(TPL.box, M(CITY + E + 0.5, CURB_H - wh / 2 - 0.01, (a + b) / 2, 1, wh, b - a), null);
  // the kerb cut away where each curved road leaves a lattice street (Curved Roads pass)
  addCurbCuts(gs);
  const slabs = new THREE.Mesh(gs.build(), gmat); slabs.receiveShadow = true; scene.add(slabs);
  // the curved streets' painted lines
  buildRoadMarkings(scene);
  // railing: posts and two rails along the same runs
  const gr = new GeoBuilder(); const rc = C(0x3a3f45);
  for (const [side, runs] of Object.entries(SH)) for (const [a, b] of runs) {
    const P2 = t => side === 'n' ? [t, -E + 0.3] : side === 's' ? [t, CITY + E - 0.3] : side === 'w' ? [-E + 0.3, t] : [CITY + E - 0.3, t];
    for (let t = Math.max(a, -E); t <= Math.min(b, CITY + E); t += 2.5) { const [x, z] = P2(t); gr.add(TPL.cyl6, M(x, CURB_H + 0.55, z, 0.04, 1.1, 0.04), rc); }
    const [mx, mz] = P2((a + b) / 2), alongX = side === 'n' || side === 's';
    for (const [y, h] of [[1.1, 0.07], [0.6, 0.04]]) gr.add(TPL.box, M(mx, CURB_H + y, mz, alongX ? b - a : 0.08, h, alongX ? 0.08 : b - a), rc);
  }
  const rail = new THREE.Mesh(gr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  scene.add(rail);
  // water
  // the sea is a frame round the city's square, not a sheet under it: nothing shows through the city's ground, and a
  // sheet 1.2 m below it loses the depth test to it from high in the air (seen as half the city under water)
  const wp = [], wi = [], WH = 8000, C2 = CITY / 2;
  for (const [x0, x1, z0, z1] of [[-WH, WH, -WH, -C2], [-WH, WH, C2, WH], [-WH, -C2, -C2, C2], [C2, WH, -C2, C2]]) {
    const n = wp.length / 3; wp.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0); wi.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setIndex(wi);
  const water = new THREE.Mesh(wgeo, makeWaterMaterial());
  water.position.set(CITY / 2, -1.2, CITY / 2);
  scene.add(water);
  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4800, 32, 16), makeSkyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  return { ground, slabs, water, sky, gmat };
}

