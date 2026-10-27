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
  // seawall faces
  const wh = 3.2;
  gs.add(TPL.box, M(CITY / 2, CURB_H - wh / 2 - 0.01, -E - 0.5, L + 2, wh, 1), null);
  for (const [x0, x1] of [[-E - 1, s0], [s1, CITY + E + 1]]) southRun(x0, x1, (xc, l) => gs.add(TPL.box, M(xc, CURB_H - wh / 2 - 0.01, CITY + E + 0.5, l, wh, 1), null));
  gs.add(TPL.box, M(-E - 0.5, CURB_H - wh / 2 - 0.01, CITY / 2, 1, wh, L), null);
  eastRun(-E, g0, (zc, l) => gs.add(TPL.box, M(CITY + E + 0.5, CURB_H - wh / 2 - 0.01, zc, 1, wh, l), null));
  eastRun(g1, CITY + E, (zc, l) => gs.add(TPL.box, M(CITY + E + 0.5, CURB_H - wh / 2 - 0.01, zc, 1, wh, l), null));
  // the kerb cut away where each curved road leaves a lattice street (Curved Roads pass)
  addCurbCuts(gs);
  const slabs = new THREE.Mesh(gs.build(), gmat); slabs.receiveShadow = true; scene.add(slabs);
  // the curved streets' painted lines
  buildRoadMarkings(scene);
  // railing
  const gr = new GeoBuilder(); const rc = C(0x3a3f45);
  for (let t = -E; t <= CITY + E; t += 2.5) {
    for (const [x, z] of [[t, -E + 0.3], [t, CITY + E - 0.3], [-E + 0.3, t], [CITY + E - 0.3, t]]) if (!(x > CITY && z > g0 - 0.5 && z < g1 + 0.5) && !(z > CITY && x > s0 - 0.5 && x < s1 + 0.5)) gr.add(TPL.cyl6, M(x, CURB_H + 0.55, z, 0.04, 1.1, 0.04), rc);
  }
  for (const [x0, x1] of [[-E, s0], [s1, CITY + E]]) southRun(x0, x1, (xc, l) => { gr.add(TPL.box, M(xc, CURB_H + 1.1, CITY + E - 0.3, l, 0.07, 0.08), rc); gr.add(TPL.box, M(xc, CURB_H + 0.6, CITY + E - 0.3, l, 0.04, 0.08), rc); });
  for (const [x, z, w, d] of [[CITY / 2, -E + 0.3, L, 0.08], [-E + 0.3, CITY / 2, 0.08, L]]) {
    gr.add(TPL.box, M(x, CURB_H + 1.1, z, w, 0.07, d), rc); gr.add(TPL.box, M(x, CURB_H + 0.6, z, w, 0.04, d), rc);
  }
  for (const [z0, z1] of [[-E, g0], [g1, CITY + E]]) eastRun(z0, z1, (zc, l) => { gr.add(TPL.box, M(CITY + E - 0.3, CURB_H + 1.1, zc, 0.08, 0.07, l), rc); gr.add(TPL.box, M(CITY + E - 0.3, CURB_H + 0.6, zc, 0.08, 0.04, l), rc); });
  const rail = new THREE.Mesh(gr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  scene.add(rail);
  // water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), makeWaterMaterial());
  water.position.set(CITY / 2, -1.2, CITY / 2);
  scene.add(water);
  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), makeSkyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  return { ground, slabs, water, sky, gmat };
}

