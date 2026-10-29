/* =====================================================================
   ENTRANCES: every door you can actually use gets the same believable dress -
   a contrasting door leaf in a light frame with a handle, a wall lamp above it
   (warm, brighter after dark), a canopy over shop and public doors and a mat on
   the pavement. A faint ring appears on the ground only when you are close.
   One merged mesh for the whole city plus one for the lamps, so it costs two
   draw calls.
   ===================================================================== */
const ENTRANCE_STYLE = {
  home: { leaf: 0x5a3220, frame: 0xefe9dc, handle: 0xd8b04a, canopy: null },
  shop: { leaf: 0x1d2b36, frame: 0xb8bec6, handle: 0xdfe3e8, canopy: 'accent' },
  public: { leaf: 0x26303a, frame: 0xd8dde3, handle: 0xdfe3e8, canopy: 0x2b5f9c },
  works: { leaf: 0x3a3f46, frame: 0xf2c230, handle: 0xdfe3e8, canopy: null }
};
const _apQ = [];
class EntranceDressing {
  constructor(g) {
    this.g = g; this.doors = [];
    const w = g.world, I = g.content.interiors, add = (x, z, h, kind, id, setback = 0) => {
      if (!isFinite(x) || !isFinite(z) || !isFinite(h)) return;
      if (this.doors.some(d => Math.hypot(d.x - x, d.z - z) < 2.2)) return;
      this.doors.push({ x, z, h, kind, id, setback });
    };
    // interiors with a street door (shops, the tower lobby, police, stations ...)
    for (const def of I.list) {
      if (def.noDoor || !def.door || def.id === 'prison') continue;
      const pl = w.places[def.place] || {}, kind = pl.grand ? 'grand' : def.store || pl.kind === 'shop' ? 'shop' : pl.kind === 'public' ? 'public' : pl.kind === 'home' || pl.kind === 'home2' ? 'home' : 'shop';
      add(def.door.x, def.door.z, def.door.h || 0, kind, def.id);
    }
    // property for sale or owned (homes, businesses, warehouses)
    if (g.uw) for (const L of g.uw.locs) if (L.kind === 'prop' && L.def.kind !== 'garage') add(L.x, L.z, L.h || 0, L.def.kind === 'safehouse' ? 'home' : L.def.kind === 'warehouse' ? 'works' : 'shop', L.def.id, L.setback);
    // houses you can break into look like houses you can walk into
    for (const hm of w.homes) {
      if (hm.propId || hm.type === 'farm' || hash2i(hm.x0 | 0, hm.z0 | 0, 61) > 0.38) continue;
      add(hm.door.x, hm.door.z, hm.door.h, 'home', hm.id);
    }
    this.build();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; ring.visible = false; g.outdoor.add(ring); this.ring = ring;
  }
  build() {
    const g = this.g, grid = g.world.grid, gb = new GeoBuilder(), lb = new GeoBuilder();
    this.signs = [];
    for (const d of this.doors) {
      const fx = Math.sin(d.h), fz = Math.cos(d.h), y0 = groundY(d.x, d.z, CURB_H + 1);
      // find the facade behind the door point (the door point stands on the pavement)
      const hit = grid.raycast(d.x, y0 + 1.2, d.z, -fx, 0, -fz, 4.5, 0.6);
      d.wall = hit ? hit.t : null;
      const S = ENTRANCE_STYLE[d.kind] || ENTRANCE_STYLE.shop;
      const rx = Math.cos(d.h), rz = -Math.sin(d.h); // to the right, along the facade
      const at = (side, out, y) => [d.x - fx * (d.wall - out) + rx * side, y0 + y, d.z - fz * (d.wall - out) + rz * side];
      const box = (b, side, out, y, w2, h2, dd, col) => { const [x, yy, z] = at(side, out, y); b.box(x, yy, z, w2, h2, dd, C(col), d.h); };
      // a landmark with its own built entrance (the casino) only gets the near-range ring
      if (d.kind === 'grand') continue;
      this.approach(d, gb, y0);
      // mat on the pavement in front of the door
      const mx = d.x - fx * ((d.wall || 1.4) - 0.75), mz = d.z - fz * ((d.wall || 1.4) - 0.75);
      gb.box(mx, groundY(mx, mz, y0 + 0.5) + 0.012, mz, 1.25, 0.024, 0.75, C(0x2a2622), d.h);
      gb.box(mx, groundY(mx, mz, y0 + 0.5) + 0.026, mz, 1.05, 0.006, 0.55, C(d.kind === 'home' ? 0x7a3a2a : 0x3a4048), d.h);
      if (d.wall === null) continue;
      // door leaf, frame (two jambs and a head), handle, threshold step
      box(gb, 0, 0.035, 1.12, 1.16, 2.24, 0.06, S.leaf);
      if (d.kind === 'shop' || d.kind === 'public') box(gb, 0, 0.07, 1.45, 0.9, 1.05, 0.02, 0x8fb3c8); // glazed panel
      else for (const yy of [0.55, 1.5]) box(gb, 0, 0.07, yy, 0.86, 0.62, 0.02, S.leaf === 0x5a3220 ? 0x4a2818 : S.leaf); // raised panels
      for (const sx of [-1, 1]) box(gb, sx * 0.66, 0.05, 1.18, 0.14, 2.36, 0.1, S.frame);
      box(gb, 0, 0.05, 2.38, 1.46, 0.16, 0.1, S.frame);
      box(gb, 0.42, 0.1, 1.05, 0.05, 0.22, 0.05, S.handle);
      box(gb, 0, 0.18, 0.04, 1.5, 0.08, 0.36, 0xb8b2a6);
      // canopy over shop and public doors (a business wears its trade's colour)
      const bdef = PROP_BY_ID[d.id], bcat = bdef && bdef.kind === 'business' && bdef.cat ? BIZ_CATS[bdef.cat] : null;
      if (bcat) this.signs.push({ d, x: d.x - fx * (d.wall - 0.09), y: y0 + 3.15, z: d.z - fz * (d.wall - 0.09), h: d.h, def: bdef });
      if (S.canopy) {
        const col = bcat ? new THREE.Color(bcat.col).getHex() : S.canopy === 'accent' ? PAL.awning[(hash2i(d.x | 0, d.z | 0, 7) * PAL.awning.length) | 0] : S.canopy;
        box(gb, 0, 0.55, 2.78, 2.1, 0.1, 1.1, col);
        box(gb, 0, 1.08, 2.66, 2.1, 0.22, 0.04, col);
      }
      // the lamp: a dark bracket and a warm lens
      box(gb, 0, 0.09, 2.62, 0.22, 0.1, 0.18, 0x22252a);
      box(lb, 0, 0.16, 2.54, 0.3, 0.12, 0.14, 0xffffff);
    }
    this.mesh = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }));
    this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; g.outdoor.add(this.mesh);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc070, emissiveIntensity: 0.4, roughness: 0.4 });
    this.lamps = new THREE.Mesh(lb.build(), this.lampMat); this.lamps.frustumCulled = false; g.outdoor.add(this.lamps);
    this.buildSigns();
  }
  // business name boards over every storefront: one 1024×1024 texture atlas (4×21 slots), and two merged meshes,
  // plain boards and lit ones (a business you have improved lights its sign at night; level 3 gets a neon frame)
  buildSigns() {
    const g = this.g;
    if (this.signMeshes) for (const m of this.signMeshes) { g.outdoor.remove(m); m.geometry.dispose(); }
    this.signMeshes = [];
    if (!this.signs.length) return;
    if (!this.atlas) {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024; const c = cv.getContext('2d');
      this.signs.forEach((sg, i) => {
        const col = i % 4, row = Math.floor(i / 4), x = col * 256, y = row * 48, C2 = BIZ_CATS[sg.def.cat];
        c.fillStyle = '#14161b'; c.fillRect(x, y, 256, 48); c.fillStyle = C2.col; c.fillRect(x, y + 42, 256, 6); c.fillRect(x, y, 8, 42);
        c.fillStyle = '#f4f1ea'; let fs = 26; c.font = `800 ${fs}px Arial, sans-serif`; while (c.measureText(sg.def.name).width > 232 && fs > 12) { fs--; c.font = `800 ${fs}px Arial, sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sg.def.name, x + 132, y + 22, 236);
        sg.slot = i;
      });
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      this.atlas = tex;
      this.signMat = [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 })];
    }
    const PM = g.uw && g.uw.props, groups = [[], []], frames = new GeoBuilder();
    for (const sg of this.signs) { const lv = PM ? PM.level(sg.def.id) : 0; groups[lv >= 2 ? 1 : 0].push(sg); if (lv >= 3) { const C2 = BIZ_CATS[sg.def.cat], c = C(new THREE.Color(C2.col).getHex()); frames.box(sg.x + Math.sin(sg.h) * 0.01, sg.y - 0.32, sg.z + Math.cos(sg.h) * 0.01, 3.05, 0.06, 0.05, c, sg.h); frames.box(sg.x + Math.sin(sg.h) * 0.01, sg.y + 0.3, sg.z + Math.cos(sg.h) * 0.01, 3.05, 0.06, 0.05, c, sg.h); } }
    groups.forEach((list, gi) => {
      if (!list.length) return;
      const pos = [], uv = [], idx = [];
      for (const sg of list) {
        const rx = Math.cos(sg.h), rz = -Math.sin(sg.h), w = 1.45, hh = 0.27, u0 = (sg.slot % 4) / 4, v0 = 1 - Math.floor(sg.slot / 4) * 48 / 1024, u1 = u0 + 0.25, v1 = v0 - 48 / 1024, b = pos.length / 3;
        for (const [a, c2, u, v] of [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, 1, u0, v0]]) pos.push(sg.x + rx * w * a, sg.y + hh * c2, sg.z + rz * w * a), uv.push(u, v);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.signMat[gi]); m.frustumCulled = false; g.outdoor.add(m); this.signMeshes.push(m);
    });
    if (!frames.empty) { const m = new THREE.Mesh(frames.build(), new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.9 })); m.frustumCulled = false; g.outdoor.add(m); this.signMeshes.push(m); }
  }
  refresh() { this.buildSigns(); }
  // the approach to a door: nothing parks in front of it, and on a car park or a forecourt a paved walk with
  // kerbs runs from the door out to the edge of the lot (the painted stalls under it are covered), so it is
  // clear where people walk in. On ordinary pavement it is a short threshold of darker paving.
  approach(d, gb, y0) {
    const w = this.g.world, fx = Math.sin(d.h), fz = Math.cos(d.h), rx = Math.cos(d.h), rz = -Math.sin(d.h);
    const wall = d.wall || 1.4, bx = Math.floor(d.x / P), bz = Math.floor(d.z / P), blk = w.block(bx, bz);
    // keep a corridor 2.6 m wide and 8 m deep in front of the door free of parked cars
    let cleared = 0;
    if (blk && blk.parked) blk.parked = blk.parked.filter(c => { const lx = (c.x - d.x) * rx + (c.z - d.z) * rz, lz = (c.x - d.x) * fx + (c.z - d.z) * fz; const hit = Math.abs(lx) < 2.6 && lz > -wall && lz < 8.5; if (hit) cleared++; return !hit; });
    this.cleared = (this.cleared || 0) + cleared;
    // how far the lot runs in front of the door (stop at the road, a wall or 14 m)
    // a door that stands back from the street (across a lawn, a forecourt, a car park) gets a paved walk out to it
    const onLot = d.setback > 1.5 || (blk && (blk.t === 'K' || localSurfaceAt(d.x + fx * 2, d.z + fz * 2) > 0));
    let len = 1.6;
    const maxLen = Math.max(14, (d.setback || 0) + 4);
    if (onLot) { len = 2; for (; len < maxLen; len += 0.5) { const x = d.x + fx * len, z = d.z + fz * len; if (RoadNet.roadAt(x, z) || w.grid.query(x - 0.4, z - 0.4, x + 0.4, z + 0.4, _apQ).some(c => c.y1 > 0.5 && c.kind !== 'prop')) break; } }
    const L = len + wall - 0.2, cxp = d.x - fx * (wall - 0.2) + fx * L / 2, czp = d.z - fz * (wall - 0.2) + fz * L / 2;
    const yy = groundY(cxp, czp, y0 + 0.5);
    if (onLot) {
      gb.box(cxp, yy + 0.014, czp, 2.4, 0.028, L, C(0xc9c2b2), d.h);
      for (const s2 of [-1, 1]) gb.box(cxp + rx * s2 * 1.28, yy + 0.04, czp + rz * s2 * 1.28, 0.16, 0.08, L, C(0x7d776c), d.h);
      for (let k = 1; k < L / 0.8; k++) { const t = -L / 2 + k * 0.8; gb.box(cxp + fx * t, yy + 0.03, czp + fz * t, 2.3, 0.004, 0.04, C(0xa59d8c), d.h); }
      d.walk = len;
    } else {
      const tl = Math.min(L, 2.2), tx = d.x - fx * (wall - 0.2) + fx * tl / 2, tz = d.z - fz * (wall - 0.2) + fz * tl / 2;
      gb.box(tx, groundY(tx, tz, y0 + 0.5) + 0.008, tz, 1.9, 0.016, tl, C(d.kind === 'home' ? 0x8a7f72 : 0x6f737a), d.h);
    }
  }
  // the nearest dressed door to (x, z) and its distance
  nearest(x, z) { let best = null, bd = 1e9; for (const d of this.doors) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } } return best ? { d: best, dist: bd } : null; }
  update(dt) {
    const g = this.g, p = g.player, env = g.env;
    this.lampMat.emissiveIntensity = 0.35 + (env.night || 0) * 2.2 + (env.dark || 0) * 0.8;
    if (this.signMat) { this.signMat[0].emissiveIntensity = 0.05 + (env.night || 0) * 0.25; this.signMat[1].emissiveIntensity = 0.3 + (env.night || 0) * 1.1; }
    const show = p.state === 'foot' && !p.interior && g.state === 'playing';
    const n = show ? this.nearest(p.pos.x, p.pos.z) : null;
    const ring = this.ring;
    if (!n || n.dist > 7) { ring.visible = false; return; }
    const d = n.d, fx = Math.sin(d.h), fz = Math.cos(d.h), back = d.wall === null ? 0.9 : d.wall - 0.75;
    const x = d.x - fx * back, z = d.z - fz * back;
    ring.position.set(x, groundY(x, z, p.pos.y + 1) + 0.04, z);
    this.t = (this.t || 0) + dt;
    ring.material.opacity = clamp((7 - n.dist) / 4, 0, 1) * (0.32 + 0.12 * Math.sin(this.t * 3));
    ring.visible = true;
  }
}

