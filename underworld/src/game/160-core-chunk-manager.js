/* =====================================================================
   [CORE] CHUNK MANAGER (per-block meshes, LRU cache, far-LOD skyline)
   ===================================================================== */
class ChunkManager {
  constructor(game) {
    this.game = game; this.world = game.world; this.scene = game.scene;
    this.bldMat = makeBuildingMaterial();
    this.detMat = makePropMaterial(0.82, 0.05);
    this.wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 });
    this.atlas = makeBillboardAtlas();
    this.bbMat = new THREE.MeshStandardMaterial({ map: this.atlas, emissiveMap: this.atlas, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.55 });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.poolMat = new THREE.MeshStandardMaterial({ color: 0x1b4652, roughness: 0.04, metalness: 0.4 });
    // showroom glass: one transparent material shared by every pane (drawn after the opaque city)
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8dc, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    this.signCache = new Map();
    this.chunks = new Map(); // block index -> {group, lastUsed}
    this.visible = new Set();
    this.maxCached = 70;
    this.radius = 3;
    this.buildQueue = [];
    this.fxActive = [];
    this._buildFar();
  }
  _buildFar() {
    const list = [];
    for (const b of this.world.blocks) for (const r of b.bld) if (r.far) list.push([b, r]);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    const aB = new Float32Array(list.length * 4), aO = new Float32Array(list.length * 4);
    const im = new THREE.InstancedMesh(geo, this.bldMat, list.length);
    this.farIdx = new Map();
    const col = new THREE.Color();
    list.forEach(([b, r], i) => {
      const h = r.totalH || r.h;
      M((r.x0 + r.x1) / 2, r.y0, (r.z0 + r.z1) / 2, r.x1 - r.x0, h, r.z1 - r.z0);
      im.setMatrixAt(i, _m4);
      col.copy(r.color); im.setColorAt(i, col);
      aB.set([r.style + 16 * (r.gtype || 0), r.seed, r.fh, r.bayX], i * 4); aO.set([r.ox, r.oy, r.oz, r.bayZ], i * 4);
      if (!this.farIdx.has(b.i)) this.farIdx.set(b.i, []);
      this.farIdx.get(b.i).push({ i, m: _m4.clone() });
    });
    geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    geo.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4));
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    this.far = im; this.scene.add(im);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  _setFar(bi, show) {
    const arr = this.farIdx.get(bi); if (!arr) return;
    for (const e of arr) this.far.setMatrixAt(e.i, show ? e.m : this._zero);
    this.far.instanceMatrix.needsUpdate = true;
  }
  _signTex(s) {
    const key = s.text + s.bg + s.fg;
    if (!this.signCache.has(key)) {
      const tex = makeSignTexture(s.text, s.bg, s.fg, 1024, Math.round(1024 * s.h / s.w));
      this.signCache.set(key, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.5 }));
    }
    return this.signCache.get(key);
  }
  _buildChunk(b) {
    const group = new THREE.Group(); group.name = 'chunk' + b.i;
    const gb = new GeoBuilder({ bld: true });
    for (const r of b.bld) {
      if (r.farOnly || r.hollow) continue;
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const ex = { b: [r.style + 16 * (r.gtype || 0), r.seed, r.fh, r.bayX], o: [r.ox, r.oy, r.oz, r.bayZ] };
      gb.add(TPL.box, M(cx, r.y0 + r.h / 2, cz, w, r.h, d), r.color, ex);
      if (r.roof === 'gable') {
        const rh = Math.min(w, d) * 0.38;
        const rc = r.roofColor || C(0x4a3a32);
        const ov = 0.5;
        if (r.ridgeX) gb.add(TPL.prism, M(cx, r.y0 + r.h, cz, w + ov, rh, d + ov), rc, ex);
        else gb.add(TPL.prism, M(cx, r.y0 + r.h, cz, d + ov, rh, w + ov, Math.PI / 2), rc, ex);
      }
    }
    if (!gb.empty) {
      const m = new THREE.Mesh(gb.build(), this.bldMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    const gd = new GeoBuilder();
    const gl = new GeoBuilder();
    const bc = new GeoBuilder();
    for (const d of b.det) {
      if (d.sx < 0.02 && d.sy < 0.02) continue;
      const rx = d.rx || 0, rz = d.rz || 0;
      if (d.kind === 'box') gd.add(TPL.box, M(d.x, d.y, d.z, d.sx, d.sy, d.sz, d.ry, rx, rz), d.color);
      else if (d.kind === 'cylr') gd.add(TPL.cyl, M(d.x, d.y, d.z, d.sx, d.sy, d.sz, d.ry, rx, rz), d.color);
      else if (d.kind === 'cone') gd.add(TPL.cone, M(d.x, d.y, d.z, d.sx, d.sy, d.sz, d.ry, rx, rz), d.color);
      else if (d.kind === 'disc') gd.add(TPL.disc, M(d.x, d.y, d.z, d.sx, 1, d.sz, d.ry, rx, rz), d.color);
    }
    for (const f of b.fx) {
      if (f.type === 'crown') {
        const y = f.y + 0.9, c = C(0xffe2b0), t = 0.25;
        gl.add(TPL.box, M((f.x0 + f.x1) / 2, y, f.z0 - 0.02, f.x1 - f.x0, t, 0.08), c);
        gl.add(TPL.box, M((f.x0 + f.x1) / 2, y, f.z1 + 0.02, f.x1 - f.x0, t, 0.08), c);
        gl.add(TPL.box, M(f.x0 - 0.02, y, (f.z0 + f.z1) / 2, 0.08, t, f.z1 - f.z0), c);
        gl.add(TPL.box, M(f.x1 + 0.02, y, (f.z0 + f.z1) / 2, 0.08, t, f.z1 - f.z0), c);
      } else if (f.type === 'beacon') bc.add(TPL.sphere0, M(f.x, f.y, f.z, 0.35, 0.35, 0.35), C(0xffffff));
      else if (f.type === 'canopy') { gl.add(TPL.box, M(f.x, f.y, f.z, f.w * 0.9, 0.05, 0.25), C(0xfff2dc)); gl.add(TPL.box, M(f.x, f.y, f.z, 0.25, 0.05, f.d * 0.9), C(0xfff2dc)); for (const k of [-0.33, 0.33]) gl.add(TPL.box, M(f.x + f.w * k, f.y, f.z, 0.2, 0.05, f.d * 0.8), C(0xfff2dc)); }
      else if (f.type === 'neon') gl.add(TPL.box, M(f.x, f.y, f.z, f.w, f.h, f.d, f.ry || 0), C(f.c));
      else if (f.type === 'docklight') { for (let k = -1; k <= 1; k++) gl.add(TPL.box, M(f.x + k * f.w / 3, f.y, f.z, 0.6, 0.18, 0.18), C(0xffe0a8)); }
      else if (f.type === 'flood') gl.add(TPL.box, M(f.x, f.y, f.z, 3.6, 2.0, 0.6, f.ry), C(0xf0f4ff));
      else if (f.type === 'rooflamp') gl.add(TPL.sphere0, M(f.x, f.y, f.z, 0.35, 0.18, 0.35), C(0xffe6c0));
      else if (f.type === 'helipad') for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; gl.add(TPL.sphere0, M(f.x + Math.cos(a) * 6.1, f.y, f.z + Math.sin(a) * 6.1, 0.15, 0.1, 0.15), C(0x80ff90)); }
    }
    if (b.wires && b.wires.length) {
      const pts = [];
      for (const [ax, ay, az, bx2, by, bz2] of b.wires) { const n = 8; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const sag = s => Math.sin(s * Math.PI) * 0.7; pts.push(lerp(ax, bx2, t0), lerp(ay, by, t0) - sag(t0), lerp(az, bz2, t0), lerp(ax, bx2, t1), lerp(ay, by, t1) - sag(t1), lerp(az, bz2, t1)); } }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      group.add(new THREE.LineSegments(wg, this.wireMat));
    }
    if (!gd.empty) { const m = new THREE.Mesh(gd.build(), this.detMat); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    if (!gl.empty) group.add(new THREE.Mesh(gl.build(), this.glowMat));
    if (b.glass && b.glass.length) {
      const gg = new GeoBuilder();
      for (const q of b.glass) gg.add(TPL.box, M(q.x, q.y, q.z, q.sx, q.sy, q.sz), C(0xffffff));
      const m = new THREE.Mesh(gg.build(), this.glassMat); m.renderOrder = 1; group.add(m);
    }
    if (!bc.empty) group.add(new THREE.Mesh(bc.build(), this.beaconMat));
    // billboards & shop signs from the atlas
    const gbb = new GeoBuilder({ uv: true });
    for (const s of [...b.billboards, ...b.signs.filter(s => s.ad !== undefined)]) {
      const i = s.ad, u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 2;
      gbb.add(TPL.plane, M(s.x, s.y, s.z, s.w, s.h, 1, s.ry), null, { uv: [u0, v0, 0.25, 0.5] });
    }
    if (!gbb.empty) group.add(new THREE.Mesh(gbb.build(), this.bbMat));
    for (const s of b.signs) if (s.text) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), this._signTex(s));
      m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; group.add(m);
    }
    for (const w of b.water) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 24).rotateX(-Math.PI / 2), this.poolMat);
      m.position.set(w.x, w.y, w.z); m.receiveShadow = true; group.add(m);
    }
    return { group, block: b, lastUsed: 0 };
  }
  setRadius(r) { if (this._wide) { this._wide.r = r; this.radius = Math.max(r, 5); } else this.radius = r; }
  // the penthouse looks out over the whole city: stream more blocks in while you are up there
  wide(on) {
    if (on && !this._wide) { this._wide = { r: this.radius, c: this.maxCached }; this.radius = Math.max(this.radius, 5); this.maxCached = 150; }
    else if (!on && this._wide) { this.radius = this._wide.r; this.maxCached = this._wide.c; this._wide = null; }
  }
  update(px, pz, frame) {
    const R = this.radius;
    const want = new Set();
    const pbx = Math.floor(px / P), pbz = Math.floor(pz / P);
    const cand = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const bx = pbx + dx, bz = pbz + dz;
      if (bx < 0 || bz < 0 || bx >= N || bz >= N) continue;
      const b = this.world.block(bx, bz);
      const d = Math.hypot(b.cx - px, b.cz - pz);
      if (d < R * P + P * 0.5) { want.add(b.i); cand.push([d, b]); }
    }
    cand.sort((a, b) => a[0] - b[0]);
    // build at most one missing chunk per frame (two when nothing is visible yet)
    let budget = this.visible.size === 0 ? 50 : 1;
    for (const [, b] of cand) {
      if (budget <= 0) break;
      if (!this.chunks.has(b.i)) { this.chunks.set(b.i, this._buildChunk(b)); budget--; }
    }
    // swap visibility
    for (const i of this.visible) if (!want.has(i) || !this.chunks.has(i)) {
      const c = this.chunks.get(i); if (c) this.scene.remove(c.group);
      this.visible.delete(i); this._setFar(i, true);
    }
    for (const i of want) {
      const c = this.chunks.get(i);
      if (!c) continue;
      c.lastUsed = frame;
      if (!this.visible.has(i)) { this.scene.add(c.group); this.visible.add(i); this._setFar(i, false); }
    }
    // LRU eviction
    if (this.chunks.size > this.maxCached) {
      const arr = [...this.chunks.entries()].filter(([i]) => !this.visible.has(i)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      while (this.chunks.size > this.maxCached && arr.length) {
        const [i, c] = arr.shift();
        c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        this.chunks.delete(i);
      }
    }
  }
  updateMaterials(night, t) {
    this.bbMat.emissiveIntensity = 0.12 + night * 1.0;
    this.glowMat.color.setScalar(0.2 + night * 2.2);
    const blink = (Math.sin(t * 3.0) > 0.6) ? 4 : 0.15;
    this.beaconMat.color.setRGB(blink, blink * 0.05, blink * 0.05);
    for (const m of this.signCache.values()) m.emissiveIntensity = 0.25 + night * 1.1;
  }
}

