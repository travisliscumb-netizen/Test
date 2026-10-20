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
  gs.add(TPL.box, M(CITY / 2, CURB_H / 2, CITY + ROAD_HALF + pw / 2, L, CURB_H, pw), null);
  gs.add(TPL.box, M(-ROAD_HALF - pw / 2, CURB_H / 2, CITY / 2, pw, CURB_H, CITY + ROAD_HALF * 2), null);
  gs.add(TPL.box, M(CITY + ROAD_HALF + pw / 2, CURB_H / 2, CITY / 2, pw, CURB_H, CITY + ROAD_HALF * 2), null);
  // seawall faces
  const wh = 3.2;
  gs.add(TPL.box, M(CITY / 2, CURB_H - wh / 2 - 0.01, -E - 0.5, L + 2, wh, 1), null);
  gs.add(TPL.box, M(CITY / 2, CURB_H - wh / 2 - 0.01, CITY + E + 0.5, L + 2, wh, 1), null);
  gs.add(TPL.box, M(-E - 0.5, CURB_H - wh / 2 - 0.01, CITY / 2, 1, wh, L), null);
  gs.add(TPL.box, M(CITY + E + 0.5, CURB_H - wh / 2 - 0.01, CITY / 2, 1, wh, L), null);
  const slabs = new THREE.Mesh(gs.build(), gmat); slabs.receiveShadow = true; scene.add(slabs);
  // railing
  const gr = new GeoBuilder(); const rc = C(0x3a3f45);
  for (let t = -E; t <= CITY + E; t += 2.5) {
    for (const [x, z] of [[t, -E + 0.3], [t, CITY + E - 0.3], [-E + 0.3, t], [CITY + E - 0.3, t]]) gr.add(TPL.cyl6, M(x, CURB_H + 0.55, z, 0.04, 1.1, 0.04), rc);
  }
  for (const [x, z, w, d] of [[CITY / 2, -E + 0.3, L, 0.08], [CITY / 2, CITY + E - 0.3, L, 0.08], [-E + 0.3, CITY / 2, 0.08, L], [CITY + E - 0.3, CITY / 2, 0.08, L]]) {
    gr.add(TPL.box, M(x, CURB_H + 1.1, z, w, 0.07, d), rc); gr.add(TPL.box, M(x, CURB_H + 0.6, z, w, 0.04, d), rc);
  }
  // decorative bridge to the mainland (east)
  const bz = 6 * P + 40, deckY = 14, bc = C(0x8a3a2a), dc = C(0x55595e);
  gr.add(TPL.box, M(CITY + E + 700, deckY, bz, 1400, 1.4, 18), dc);
  for (let x = CITY + E + 30; x < CITY + E + 1400; x += 60) gr.add(TPL.box, M(x, (deckY - 1) / 2 - 1, bz, 3, deckY + 1, 10), dc);
  for (const tx of [CITY + E + 260, CITY + E + 760]) for (const s of [-7.5, 7.5]) gr.add(TPL.box, M(tx, 50, bz + s, 3.2, 100, 3.2), bc);
  for (const tx of [CITY + E + 260, CITY + E + 760]) { gr.add(TPL.box, M(tx, 96, bz, 3, 3, 18), bc); gr.add(TPL.box, M(tx, 60, bz, 2.5, 2.5, 18), bc); }
  const rail = new THREE.Mesh(gr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  scene.add(rail);
  // bridge cables
  const pts = [];
  const towers = [CITY + E + 260, CITY + E + 760];
  for (const s of [-7.5, 7.5]) {
    const cab = (x0, y0, x1, y1, sag) => { const n = 24; for (let i = 0; i < n; i++) { const a = i / n, b2 = (i + 1) / n; const ya = lerp(y0, y1, a) - Math.sin(a * Math.PI) * sag, yb = lerp(y0, y1, b2) - Math.sin(b2 * Math.PI) * sag; pts.push(lerp(x0, x1, a), ya, bz + s, lerp(x0, x1, b2), yb, bz + s); } };
    cab(CITY + E, deckY + 1, towers[0], 98, 20); cab(towers[0], 98, towers[1], 98, 70); cab(towers[1], 98, CITY + E + 1100, deckY + 1, 20);
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x6a2a20 })));
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

