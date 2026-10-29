/* =====================================================================
   [CORE] PROP MANAGER (instanced, streamed by active blocks)
   ===================================================================== */
class PropManager {
  constructor(game) {
    this.game = game; this.world = game.world; this.scene = game.outdoor;
    this.mat = makePropMaterial(0.8, 0.05);
    this.folMat = makeFoliageMaterial();
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.meshes = {}; this.glows = {}; this.geos = {}; this.far = {}; this.act = {}; this._cullAt = new THREE.Vector3(1e9, 0, 0); this._cullDir = new THREE.Vector3(); this._cullT = 0; this._sph = new THREE.Sphere(); this.nearR = 70;
    this.active = new Set(); this.dirty = true;
    this.byType = {};
    for (const t in PROP_DEFS) {
      const list = (this.world.propTypes[t] || []).slice();
      if (t === 'lamp') for (const p of this.world.promenade) list.push({ type: 'lamp', x: p.x, z: p.z, ry: p.ry, s: 1, id: -1, block: -1, broken: false });
      this.byType[t] = list;
      if (!list.length) continue;
      const g = new GeoBuilder(); PROP_DEFS[t].build(g);
      const geo = g.build(); this.geos[t] = geo;
      const im = new THREE.InstancedMesh(geo, PROP_DEFS[t].foliage ? this.folMat : this.mat, list.length);
      im.count = 0; im.frustumCulled = false; im.castShadow = !!PROP_DEFS[t].cast; im.receiveShadow = true;
      if (PROP_DEFS[t].tint) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3); }
      this.scene.add(im); this.meshes[t] = im;
      // foliage has a far version (G3): cull() splits the active instances between the two, and skips the unseen
      if (PROP_DEFS[t].lod) {
        const lg = new GeoBuilder(); PROP_DEFS[t].lod(lg);
        const fm = new THREE.InstancedMesh(lg.build(), PROP_DEFS[t].foliage ? this.folMat : this.mat, list.length);
        fm.count = 0; fm.frustumCulled = false; fm.castShadow = !!PROP_DEFS[t].cast; fm.receiveShadow = true;
        fm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
        this.scene.add(fm); this.far[t] = fm; this.act[t] = [];
      }
      if (PROP_DEFS[t].glow) {
        const gg = new GeoBuilder();
        for (const [x, y, z, sx, sy, sz] of PROP_DEFS[t].glow) gg.add(TPL.sphere0, M(x, y, z, sx, sy, sz), C(0xffffff));
        const gm = new THREE.InstancedMesh(gg.build(), this.glowMat, list.length);
        gm.count = 0; gm.frustumCulled = false;
        this.scene.add(gm); this.glows[t] = gm;
      }
    }
    // traffic light bulbs (3 per pole)
    const nPoles = (this.byType.tlight || []).length;
    const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
    this.bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, Math.max(1, nPoles * 3));
    this.bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nPoles * 3) * 3), 3);
    this.bulbs.count = 0; this.bulbs.frustumCulled = false; this.scene.add(this.bulbs);
    this.activePoles = [];
    this.bulbTimer = 0;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }
  setActiveBlocks(set) {
    let same = set.size === this.active.size;
    if (same) for (const k of set) if (!this.active.has(k)) { same = false; break; }
    if (same && !this.dirty) return;
    this.active = new Set(set); this.dirty = false;
    const promoOK = (p) => {
      if (p.block >= 0) return this.active.has(p.block);
      const bx = clamp(Math.floor(p.x / P), 0, N - 1), bz = clamp(Math.floor(p.z / P), 0, N - 1);
      return this.active.has(bz * N + bx);
    };
    for (const t in this.meshes) {
      const im = this.meshes[t], list = this.byType[t]; let n = 0;
      const gm = this.glows[t];
      if (this.far[t]) { // foliage: collect the active instances; cull() places them
        const A = this.act[t]; A.length = 0;
        for (const p of list) if (!p.broken && promoOK(p)) { const h = hash2i(p.id, 3, 9); A.push({ x: p.x, z: p.z, ry: p.ry, s: p.s, r: 0.8 + h * 0.4, g: 0.85 + hash2i(p.id, 4, 9) * 0.3, b: 0.75 + h * 0.3 }); }
        this._cullT = 0; continue;
      }
      for (const p of list) {
        if (p.broken || !promoOK(p)) continue;
        M(p.x, CURB_H, p.z, p.s, p.s, p.s, p.ry);
        im.setMatrixAt(n, _m4);
        if (gm) gm.setMatrixAt(n, _m4);
        if (im.instanceColor) {
          const h = hash2i(p.id, 3, 9);
          this._c.setRGB(0.8 + h * 0.4, 0.85 + hash2i(p.id, 4, 9) * 0.3, 0.75 + h * 0.3);
          im.setColorAt(n, this._c);
        }
        n++;
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (gm) { gm.count = n; gm.instanceMatrix.needsUpdate = true; }
    }
    this.activePoles = (this.byType.tlight || []).filter(p => !p.broken && this.active.has(p.block));
    this.bulbTimer = 0;
  }
  markDirty() { this.dirty = true; }
  // foliage LOD and culling (G3): every instance in the active blocks used to be drawn at full detail in every
  // direction (a park view reached 1.2M triangles). Near ones (nearR) get the full tree, farther ones the cheap
  // version, and ones outside the view are skipped, except within 18 m, whose shadows can still fall into view.
  // Re-sorted five times a second, or at once when the camera moves 6 m or turns.
  cull(camera, frustum, dt) {
    this._cullT -= dt;
    camera.getWorldDirection(this._cullDir);
    const moved = camera.position.distanceToSquared(this._cullAt) > 36 || this._cullDir.dot(this._lastDir || this._cullDir) < 0.97;
    if (this._cullT > 0 && !moved) return;
    this._cullT = 0.2; this._cullAt.copy(camera.position); this._lastDir = (this._lastDir || new THREE.Vector3()).copy(this._cullDir);
    const cx = camera.position.x, cz = camera.position.z, nr2 = this.nearR * this.nearR, sph = this._sph, col = this._c;
    for (const t in this.far) {
      const im = this.meshes[t], fm = this.far[t]; let n = 0, f = 0;
      for (const a of this.act[t]) {
        const d2 = (a.x - cx) * (a.x - cx) + (a.z - cz) * (a.z - cz);
        if (d2 > 18 * 18) { sph.center.set(a.x, 3.5 * a.s, a.z); sph.radius = 5 * a.s; if (!frustum.intersectsSphere(sph)) continue; }
        M(a.x, CURB_H, a.z, a.s, a.s, a.s, a.ry); col.setRGB(a.r, a.g, a.b);
        if (d2 < nr2) { im.setMatrixAt(n, _m4); im.setColorAt(n, col); n++; } else { fm.setMatrixAt(f, _m4); fm.setColorAt(f, col); f++; }
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      fm.count = f; fm.instanceMatrix.needsUpdate = true; fm.instanceColor.needsUpdate = true;
    }
  }
  update(dt, night) {
    this.glowMat.color.setRGB(1, 0.82, 0.55).multiplyScalar(0.15 + night * 3.2);
    this.bulbTimer -= dt;
    if (this.bulbTimer > 0) return;
    this.bulbTimer = 0.2;
    const bm = this.bulbs; let n = 0;
    const off = 0.06;
    for (const p of this.activePoles) {
      const st = Signals.state(p.node[0], p.node[1], p.axis);
      const cs = Math.cos(p.ry), sn = Math.sin(p.ry);
      for (let k = 0; k < 3; k++) {
        // local (-3.6, y, 0.18) rotated by ry
        const lx = -3.6, lz = 0.18, ly = 5.65 - k * 0.36;
        const wx = p.x + lx * cs + lz * sn, wz = p.z - lx * sn + lz * cs;
        this._m.makeTranslation(wx, CURB_H + ly, wz);
        bm.setMatrixAt(n, this._m);
        const on = (k === 0 && st === 2) || (k === 1 && st === 1) || (k === 2 && st === 0);
        if (k === 0) this._c.setRGB(on ? 4 : off * 2, on ? 0.15 : off * 0.3, on ? 0.1 : off * 0.3);
        else if (k === 1) this._c.setRGB(on ? 4 : off * 2, on ? 2.2 : off, 0.05);
        else this._c.setRGB(on ? 0.2 : off * 0.3, on ? 3.2 : off * 1.6, on ? 1.4 : off);
        bm.setColorAt(n, this._c);
        n++;
      }
    }
    bm.count = n; bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
  }
  breakProp(p) {
    if (p.broken) return false;
    p.broken = true; if (p.col) p.col.on = false;
    p.respawnAt = performance.now() + 90000;
    this.dirty = true;
    return true;
  }
  respawnTick(px, pz) {
    const now = performance.now();
    for (const t in PROP_DEFS) {
      if (!PROP_DEFS[t].breakable) continue;
      for (const p of this.byType[t] || []) {
        if (p.broken && now > p.respawnAt && dist2(p.x, p.z, px, pz) > 90 * 90) { p.broken = false; if (p.col) p.col.on = true; this.dirty = true; }
      }
    }
  }
}

