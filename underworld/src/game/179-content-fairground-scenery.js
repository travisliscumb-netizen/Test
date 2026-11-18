/* =====================================================================
   [CONTENT] THE SOUTHSHORE FAIRGROUND: SCENERY THAT MOVES (129c)
   - The near ground: the midway, the footpath, the car park, the kart
     track with its kerbs and line, the ride's bases (one merged mesh at
     the pad's level), the kart track's tyre walls.
   - The roller coaster's track (two rails, a spine and the ties, one
     mesh) and its train of three cars.
   - The rides' moving parts, turned every frame from FairClock (the same
     clocks the rides you board run on, 509d): the Ferris wheel and its
     sixteen gondolas, the carousel, the drop tower's seat ring, the
     pirate ship.
   Everything is hidden, and nothing is posed, beyond FAIR_SCENE_R of
   the focus.
   ===================================================================== */
const FAIR_SCENE_R = 1100;
class FairgroundScenery {
  constructor(scene, world) {
    this.world = world; const fr = world.fair; if (!fr) return;
    this.root = new THREE.Group(); this.root.name = 'fairground'; scene.add(this.root);
    const Y = FAIR.y, F = FAIR, fb = new FlatBuilder();
    // ---------------------------------------------------------------- the ground: paving, paths, the car park, the kart track
    fb.rect(F.mid.x0, F.mid.z - F.mid.w / 2, F.mid.x1, F.mid.z + F.mid.w / 2, Y + 0.04, FAIR_COL.pave);
    // the plaza outside the arch, from the turning circle to the gate
    fb.rect(F.pad.x1 - 2, F.mid.z - F.mid.w / 2 - 2, F.park.x0 + 4, F.mid.z + F.mid.w / 2 + 2, Y + 0.04, FAIR_COL.pave);
    // the pavement along the Fair Office's front, out of the turning circle's way
    fb.rect(F.office.x0 - 4, F.office.z1, F.office.x1 + 4, F.office.z1 + 4.4, Y + 0.04, FAIR_COL.pave);
    fb.rect(fr.kartPath[0][0] - 2, fr.kartPath[0][1], fr.kartPath[0][0] + 2, fr.kartPath[1][1], Y + 0.04, FAIR_COL.path);
    fb.rect(F.park.x0, F.park.z0, F.park.x1, F.park.z1, Y + 0.045, FAIR_COL.asphalt);
    for (const r of [0, 1]) for (let k = 0; k <= 27; k++) { const x = F.park.x0 + 3.4 + k * 3.2; if (x > F.park.x1 - 1) continue; const z = r ? F.park.z1 - 6 : F.park.z0 + 6; fb.rect(x - 0.06, z - 2.6, x + 0.06, z + 2.6, Y + 0.05, FAIR_COL.line); }
    // paths from the midway to each ride's gate, and the coaster's station forecourt
    for (const R of Object.values(fr.rides)) if (R.id !== 'kart') { const z0 = Math.min(R.at.z, F.mid.z), z1 = Math.max(R.at.z, F.mid.z); fb.rect(R.at.x - 1.6, z0, R.at.x + 1.6, z1, Y + 0.035, FAIR_COL.path); }
    fb.rect(1560, F.mid.z - F.mid.w / 2 - 6, 1636, F.mid.z - F.mid.w / 2, Y + 0.035, FAIR_COL.path);
    // the kart track: asphalt, red and white kerbs on the corners, a chequered line
    const KT = fr.kart, half = F.kart.w / 2, N2 = KT.pts.length;
    fb.strip(KT.pts, KT.nl, 0, N2, -half, half, Y + 0.06, FAIR_COL.asphalt, true);
    for (const s of [1, -1]) fb.strip(KT.pts, KT.nl, 0, N2, s > 0 ? half - 0.8 : -half, s > 0 ? half : -half + 0.8, Y + 0.07, k => KT.R[k] > 0 ? (Math.floor(k / 2) % 2 ? FAIR_COL.kerbR : FAIR_COL.kerbW) : null, true);
    { const k0 = KT.sf.k; for (let c = 0; c < 8; c++) for (let r2 = 0; r2 < 2; r2++) { const o1 = -half + c, o2 = o1 + 1, A = KT.pts[(k0 + r2) % N2], nl = KT.nl[k0]; fb.quad([A[0] + nl[0] * o1, A[1] + nl[1] * o1], [A[0] + nl[0] * o2, A[1] + nl[1] * o2], [A[0] + nl[0] * o2 + (KT.pts[(k0 + r2 + 1) % N2][0] - A[0]), A[1] + nl[1] * o2 + (KT.pts[(k0 + r2 + 1) % N2][1] - A[1])], [A[0] + nl[0] * o1 + (KT.pts[(k0 + r2 + 1) % N2][0] - A[0]), A[1] + nl[1] * o1 + (KT.pts[(k0 + r2 + 1) % N2][1] - A[1])], Y + 0.075, (c + r2) % 2 ? 0x111111 : 0xf2f2f2); } }
    // every triangle faces up
    for (let i = 0; i < fb.p.length; i += 9) {
      const P0 = fb.p, ax = P0[i], az = P0[i + 2], bx = P0[i + 3], bz = P0[i + 5], cx = P0[i + 6], cz = P0[i + 8];
      if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) for (let j = 0; j < 3; j++) { const t = P0[i + 3 + j]; P0[i + 3 + j] = P0[i + 6 + j]; P0[i + 6 + j] = t; const u = fb.c[i + 3 + j]; fb.c[i + 3 + j] = fb.c[i + 6 + j]; fb.c[i + 6 + j] = u; }
    }
    this.ground = fb.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); this.ground.name = 'fair-ground'; this.root.add(this.ground);
    // ---------------------------------------------------------------- the kart track's tyre walls (a band of tyres both sides)
    {
      const P = [], Cc = [], cols = [new THREE.Color(0x1c1d20), new THREE.Color(0xd23a2a), new THREE.Color(0x1c1d20), new THREE.Color(0xf2f2f2)];
      for (const line of fr.barriers) for (let k = 0; k < line.length; k++) {
        const a = line[k], b = line[(k + 1) % line.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 3) continue;
        const c = cols[Math.floor(k / 2) % 4];
        for (const q of [[a[0], Y, a[1]], [b[0], Y, b[1]], [b[0], Y + 0.85, b[1]], [a[0], Y, a[1]], [b[0], Y + 0.85, b[1]], [a[0], Y + 0.85, a[1]]]) { P.push(...q); Cc.push(c.r, c.g, c.b); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.computeVertexNormals();
      this.tyres = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.tyres.name = 'fair-tyres'; this.root.add(this.tyres);
    }
    this._coaster(); this._wheel(); this._carousel(); this._drop(); this._ship();
    this.near = true;
  }
  // a merged mesh from tubes along a line of points (rings of m vertices, radius r): rails, spines, rims
  static tubes(lines, m, colorOf) {
    const P = [], N = [], Cc = [], I = []; let base = 0; const v = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const L of lines) {
      const pts = L.pts, n = pts.length, closed = !!L.closed, col = new THREE.Color(L.color);
      for (let i = 0; i < n; i++) {
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], t = (closed || (i > 0 && i < n - 1) ? b.clone().sub(a) : (i ? pts[i].clone().sub(pts[i - 1]) : pts[1].clone().sub(pts[0]))).normalize();
        const ref = L.ups ? L.ups[i] : (Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up);
        v.copy(ref).sub(t.clone().multiplyScalar(ref.dot(t))).normalize(); w.copy(t).cross(v);
        for (let j = 0; j < m; j++) { const a2 = j / m * Math.PI * 2, nx = v.x * Math.cos(a2) + w.x * Math.sin(a2), ny = v.y * Math.cos(a2) + w.y * Math.sin(a2), nz = v.z * Math.cos(a2) + w.z * Math.sin(a2); P.push(pts[i].x + nx * L.r, pts[i].y + ny * L.r, pts[i].z + nz * L.r); N.push(nx, ny, nz); Cc.push(col.r, col.g, col.b); }
      }
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) for (let j = 0; j < m; j++) { const a = base + i * m + j, b = base + ((i + 1) % n) * m + j, c = base + ((i + 1) % n) * m + (j + 1) % m, d = base + i * m + (j + 1) % m; I.push(a, b, c, a, c, d); }
      base += n * m;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setIndex(I);
    void colorOf; return g;
  }
  static mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o }); }
  // ---------------------------------------------------------------- the roller coaster: track and train
  _coaster() {
    const C = this.world.fair.coaster, rl = [], rr = [], sp = [], ups = [];
    for (let i = 0; i < C.n; i++) { const p = C.pts[i], t = C.T[i], u = C.U[i], b = t.clone().cross(u); rl.push(p.clone().addScaledVector(b, 0.55)); rr.push(p.clone().addScaledVector(b, -0.55)); sp.push(p.clone().addScaledVector(u, -0.42)); ups.push(u); }
    const g = FairgroundScenery.tubes([{ pts: rl, r: 0.075, color: 0xd8dce0, closed: true, ups }, { pts: rr, r: 0.075, color: 0xd8dce0, closed: true, ups }, { pts: sp, r: 0.21, color: 0xd23a2a, closed: true, ups }], 6);
    // the ties: a bar across under the rails every 1.5 m
    const tg = new GeoBuilder(), m4 = new THREE.Matrix4(), bm = new THREE.Matrix4();
    for (let i = 0; i < C.n; i += 3) {
      const p = C.pts[i], t = C.T[i], u = C.U[i], b = t.clone().cross(u);
      bm.makeBasis(b, u, t); m4.copy(bm).setPosition(p.clone().addScaledVector(u, -0.2)); m4.scale(new THREE.Vector3(1.2, 0.08, 0.14)); tg.add(TPL.box, m4, 0xb8bec4);
    }
    const ties = new THREE.Mesh(tg.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.coasterTrack = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 })); this.coasterTrack.name = 'fair-coaster';
    this.root.add(this.coasterTrack, ties);
    // the train: three cars (a tub, two rows of seats, the lead car's nose)
    this.train = [];
    const body = FairgroundScenery.mat(0x1f6fb2), trim = FairgroundScenery.mat(0xf2c230), seat = FairgroundScenery.mat(0x2b2e33);
    for (let c = 0; c < FAIR.coaster.cars; c++) {
      const car = new THREE.Group(), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); car.add(m); return m; };
      add(new THREE.BoxGeometry(1.5, 0.55, 2.3), body, 0, 0.45, 0);
      add(new THREE.BoxGeometry(1.56, 0.12, 2.36), trim, 0, 0.76, 0);
      for (const z of [-0.45, 0.6]) { add(new THREE.BoxGeometry(1.3, 0.5, 0.18), seat, 0, 0.95, z - 0.3); add(new THREE.BoxGeometry(1.3, 0.12, 0.6), seat, 0, 0.72, z); }
      if (c === 0) add(new THREE.BoxGeometry(1.5, 0.45, 0.5), trim, 0, 0.5, 1.35).rotation.x = 0.35;
      car.matrixAutoUpdate = false; this.root.add(car); this.train.push(car);
    }
    this._ca = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3() };
  }
  // ---------------------------------------------------------------- the Ferris wheel: the rotor (rims, spokes, lights) and the gondolas
  _wheel() {
    const W = FAIR.wheel, Y = FAIR.y, hub = new THREE.Vector3(W.x, Y + W.hub, W.z);
    this.wheelRotor = new THREE.Group(); this.wheelRotor.position.copy(hub); this.root.add(this.wheelRotor);
    const lines = [];
    for (const dz of [-W.gap / 2, W.gap / 2]) {
      const rim = [], rim2 = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; rim.push(new THREE.Vector3(Math.sin(a) * W.r, -Math.cos(a) * W.r, dz)); rim2.push(new THREE.Vector3(Math.sin(a) * (W.r - 1.6), -Math.cos(a) * (W.r - 1.6), dz)); }
      lines.push({ pts: rim, r: 0.22, color: 0xf4f2ec, closed: true }, { pts: rim2, r: 0.14, color: 0xf4f2ec, closed: true });
      for (let k = 0; k < W.n; k++) { const a = k / W.n * Math.PI * 2; lines.push({ pts: [new THREE.Vector3(0, 0, dz * 0.4), new THREE.Vector3(Math.sin(a) * W.r, -Math.cos(a) * W.r, dz)], r: 0.09, color: 0xd8dce0 }); }
    }
    for (let k = 0; k < W.n; k++) { const a = k / W.n * Math.PI * 2; lines.push({ pts: [new THREE.Vector3(Math.sin(a) * W.r, -Math.cos(a) * W.r, -W.gap / 2), new THREE.Vector3(Math.sin(a) * W.r, -Math.cos(a) * W.r, W.gap / 2)], r: 0.1, color: 0xd8dce0 }); }
    this.wheelRotor.add(new THREE.Mesh(FairgroundScenery.tubes(lines, 6), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 })));
    // bulbs round the rim (lit at night, 179's update)
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 96), m4 = new THREE.Matrix4();
    for (let i = 0; i < 96; i++) { const a = i / 48 * Math.PI * 2, dz = i < 48 ? -W.gap / 2 - 0.25 : W.gap / 2 + 0.25; m4.makeTranslation(Math.sin(a) * W.r, -Math.cos(a) * W.r, dz); bulbs.setMatrixAt(i, m4); }
    this.wheelBulbs = bulbs; this.wheelRotor.add(bulbs);
    // the gondolas: a cabin under a roof, hanging from the rim's cross bar
    this.gondolas = [];
    const cols = [0xd23a2a, 0xf2c230, 0x2471a3, 0x2e8b57];
    for (let k = 0; k < W.n; k++) {
      const gd = new THREE.Group(), body = FairgroundScenery.mat(cols[k % 4]), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); gd.add(m); return m; };
      // the tub (its floor 3.1 m under the pin, waist-high walls), the corner posts and the roof: open all round above the walls
      add(new THREE.BoxGeometry(2.0, 0.75, 2.6), body, 0, -2.725, 0);
      add(new THREE.BoxGeometry(2.3, 0.18, 2.9), body, 0, -0.55, 0);
      for (const sx of [-0.95, 0.95]) for (const sz of [-1.2, 1.2]) add(new THREE.BoxGeometry(0.07, 1.75, 0.07), FairgroundScenery.mat(0xd8dce0), sx, -1.47, sz);
      add(new THREE.BoxGeometry(0.12, 0.6, 0.12), FairgroundScenery.mat(0xd8dce0), 0, -0.25, 0);
      this.root.add(gd); this.gondolas.push(gd);
    }
  }
  // ---------------------------------------------------------------- the carousel: platform, centre, canopy, twelve horses on poles
  _carousel() {
    const R = FAIR.carousel, Y = FAIR.y;
    const g = this.carousel = new THREE.Group(); g.position.set(R.x, Y + 0.5, R.z); this.root.add(g);
    const add = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };
    add(new THREE.CylinderGeometry(R.r, R.r, 0.5, 32), FairgroundScenery.mat(0xe8dcc0), 0, 0.25, 0);
    add(new THREE.CylinderGeometry(1.4, 1.4, 5.4, 16), FairgroundScenery.mat(0xe056fd), 0, 3.2, 0);
    const can = add(new THREE.ConeGeometry(R.r + 0.6, 2.6, 24, 1, false), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 0, 7.2, 0);
    { const c = can.geometry, col = []; const a = c.attributes.position; for (let i = 0; i < a.count; i++) { const ang = Math.atan2(a.getX(i), a.getZ(i)), s = Math.floor((ang + Math.PI) / (Math.PI * 2) * 24) % 2; col.push(...(s ? [0.82, 0.23, 0.16] : [0.96, 0.95, 0.92])); } c.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); can.material.vertexColors = true; }
    add(new THREE.CylinderGeometry(R.r + 0.6, R.r + 0.6, 0.6, 24, 1, true), FairgroundScenery.mat(0xf2c230, { side: THREE.DoubleSide }), 0, 5.8, 0);
    this.horses = [];
    const hc = [0xf4f2ec, 0x6b4a2b, 0x2b2e33, 0xc8a46a];
    for (let k = 0; k < R.n; k++) {
      const th = k / R.n * Math.PI * 2, r = R.r - 1.5, h = new THREE.Group(); h.position.set(Math.sin(th) * r, 1.4, Math.cos(th) * r); h.rotation.y = th + Math.PI / 2; g.add(h);
      add(new THREE.CylinderGeometry(0.05, 0.05, 5.0, 6), FairgroundScenery.mat(0xd8c070, { metalness: 0.7 }), Math.sin(th) * r, 3.0, Math.cos(th) * r);
      const m = FairgroundScenery.mat(hc[k % 4]);
      add(new THREE.BoxGeometry(0.42, 0.5, 1.4), m, 0, 0, 0, h); add(new THREE.BoxGeometry(0.3, 0.65, 0.35), m, 0, 0.4, 0.75, h).rotation.x = -0.5; add(new THREE.BoxGeometry(0.28, 0.3, 0.5), m, 0, 0.7, 0.98, h);
      for (const sx of [-0.14, 0.14]) for (const sz of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.1, 0.7, 0.1), m, sx, -0.5, sz, h);
      add(new THREE.BoxGeometry(0.46, 0.12, 0.5), FairgroundScenery.mat(0xd23a2a), 0, 0.3, 0, h);
      this.horses.push({ h, th, ph: k * 1.3 });
    }
  }
  // ---------------------------------------------------------------- the drop tower's seat ring
  _drop() {
    const D = FAIR.drop, Y = FAIR.y, g = this.dropRing = new THREE.Group(); g.position.set(D.x, Y + 1.2, D.z); this.root.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, 1.2, 24, 1, true), FairgroundScenery.mat(0xf2c230, { side: THREE.DoubleSide })); ring.position.y = 0.6; g.add(ring);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), FairgroundScenery.mat(0x2b2e33)); s.position.set(Math.cos(a) * (D.r + 0.3), 0.15, -Math.sin(a) * (D.r + 0.3)); s.rotation.y = a + Math.PI / 2; g.add(s); }
  }
  // ---------------------------------------------------------------- the pirate ship: a hull hung on two arms from the pivot
  _ship() {
    const S = FAIR.ship, Y = FAIR.y, g = this.ship = new THREE.Group(); g.position.set(S.x, Y + S.arm + 2.2, S.z); this.root.add(g);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const wood = FairgroundScenery.mat(0x8a5a33), dark = FairgroundScenery.mat(0x3b2716), steel = FairgroundScenery.mat(0x6a7078, { metalness: 0.6 });
    // the hull: a long box with raked ends, the deck with rows of benches, a mast and a skull-and-crossbones sail
    add(new THREE.BoxGeometry(S.len - 4, 2.0, 4.2), wood, 0, -S.arm + 0.2, 0);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(2.6, 2.6, 4.2), wood, sx * (S.len / 2 - 1.6), -S.arm + 0.9, 0).rotation.z = sx * 0.5;
    for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(0.5, 0.5, 3.6), dark, -S.len / 2 + 2.6 + k * 2.4, -S.arm + 1.45, 0);
    for (const sz of [-1.9, 1.9]) add(new THREE.BoxGeometry(S.len - 3, 0.25, 0.25), FairgroundScenery.mat(0xf2c230), 0, -S.arm + 1.3, sz);
    add(new THREE.CylinderGeometry(0.12, 0.12, 5, 8), dark, 0, -S.arm + 3.6, 0);
    add(new THREE.BoxGeometry(3.2, 2.4, 0.05), FairgroundScenery.mat(0x111418, { side: THREE.DoubleSide }), 0, -S.arm + 4.4, 0);
    for (const sz of [-1.6, 1.6]) { const arm = add(new THREE.BoxGeometry(0.35, S.arm - 1, 0.35), steel, 0, -(S.arm - 1) / 2, sz); void arm; }
  }
  // ---------------------------------------------------------------- per frame: shown near, the rides posed from their clocks
  update(fx, fz, t, night) {
    if (!this.root) return;
    const d = Math.hypot(fx - 1680, fz - 1965), near = d < FAIR_SCENE_R;
    if (near !== this.near) { this.root.visible = near; this.near = near; }
    if (!near) return;
    const W = FAIR.wheel, Y = FAIR.y;
    // the wheel: the rotor turns, the gondolas hang plumb from their pins
    this.wheelRotor.rotation.z = FairClock.wheel(t).ang;
    for (let k = 0; k < W.n; k++) { const a = FairClock.gondolaAng(t, k); this.gondolas[k].position.set(W.x + Math.sin(a) * W.r, Y + W.hub - Math.cos(a) * W.r, W.z); }
    this.wheelBulbs.visible = night;
    // the carousel turns and the horses ride up and down
    { const st = FairClock.carousel(t); this.carousel.rotation.y = st.ang; for (const H of this.horses) H.h.position.y = 1.4 + (st.phase === 'run' ? 0.32 * Math.sin(st.bob * 2.4 + H.ph) : 0); }
    // the drop tower's ring, the ship's swing
    this.dropRing.position.y = Y + FairClock.drop(t).y;
    this.ship.rotation.z = FairClock.ship(t).a;
    // the coaster's train: each car on the track behind the one in front, square to the rails
    { const st = FairClock.coaster(t), q = this._ca, m4 = new THREE.Matrix4(), b = new THREE.Vector3();
      for (let c = 0; c < this.train.length; c++) { fairCoasterAt(st.s - c * FAIR.coaster.carLen, q); b.copy(q.t).cross(q.u); m4.makeBasis(b.negate(), q.u, q.t).setPosition(q.p); const car = this.train[c]; car.matrix.copy(m4); car.matrixWorldNeedsUpdate = true; } }
  }
}
