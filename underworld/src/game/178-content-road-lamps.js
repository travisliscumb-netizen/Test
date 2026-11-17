/* =====================================================================
   [CONTENT] ROAD LAMPS: street lighting along the island's roads
   The highways and country roads ran dark between the city and the
   districts. Each road outside the city and the districts' own streets
   (which have their lamps, 128) gets a lamp every ROAD_LAMP.step metres,
   alternating sides, leaning over the carriageway; never on a bridge, in
   the tunnel (its own lights), in another road, in anything built, over
   the sea or where the ground beside the road falls away or rises (a
   cutting, an embankment). Each post is solid (a cylinder in the grid).
   At night every island lamp (these and the districts') throws a pool of
   warm light on the road under its head: the island's ground has no
   lamp pools of its own (the city's ground shader draws the lattice's).
   Drawn as four instanced meshes (posts, arms, heads, pools) for the island.
   ===================================================================== */
const ROAD_LAMP = { step: 55, first: 30, endGap: 18, inset: 1.6, h: 7.2, arm: 3.0, pool: 9.5, poolPeak: 0.32, clearRoad: 1.2, maxStep: 1.2 };
Object.assign(World.prototype, {
  // where the lamps stand (gen-time, after the island and its districts: 110), their colliders, and the pools of every
  // island lamp (the districts' are added by 128 as this.lampPools)
  _genRoadLamps() {
    const L = ROAD_LAMP, out = [], grid = this.grid;
    this.lampPools = this.lampPools || [];
    const lit = new Set([...ISLE_DISTRICT_ROADS, ...ISLE_INFILL_ROADS].map(D => D.id));
    // what a post must keep clear of: every island road's carriageway (by segment) and everything built on the island
    const segs = [];
    for (const R of Island.roads) for (let k = 0; k < R.pts.length - 1; k++) { const a = R.pts[k], b = R.pts[k + 1]; segs.push({ R, a, b, x0: Math.min(a[0], b[0]) - R.w, x1: Math.max(a[0], b[0]) + R.w, z0: Math.min(a[1], b[1]) - R.w, z1: Math.max(a[1], b[1]) + R.w }); }
    const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const inRoad = (x, z, m) => segs.some(s => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && segD(x, z, s.a, s.b) < s.R.w / 2 + m);
    const built = []; for (const b of this.xblocks) { for (const r of b.bld) built.push([r.x0, r.z0, r.x1, r.z1]); for (const d of b.det) { const c = d.col; if (!c) continue; if (c.r !== undefined) built.push([c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r]); else built.push([c.x0, c.z0, c.x1, c.z1]); } }
    const inBuilt = (x, z, m) => built.some(r => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m);
    for (const R of Island.roads) {
      if (lit.has(R.id)) continue;
      const len = R.cum[R.cum.length - 1];
      let side = 1;
      for (let s = L.first; s < len - L.endGap; s += L.step) {
        let k = 0; while (k < R.pts.length - 2 && R.cum[k + 1] < s) k++;
        if ((R.bridges || []).some(b => k >= b[0] - 2 && k <= b[1] + 2) || (R.tunnel && k >= R.tunnel[0] - 3 && k <= R.tunnel[1] + 3)) continue;
        const a = R.pts[k], b = R.pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = clamp((s - R.cum[k]) / l, 0, 1);
        const cx = a[0] + (b[0] - a[0]) * t, cz = a[1] + (b[1] - a[1]) * t, ry = R.y[k] + (R.y[k + 1] - R.y[k]) * t;
        // the side's outward normal (alternating), and the post at the verge
        const nx = (b[1] - a[1]) / l * side, nz = -(b[0] - a[0]) / l * side;
        side = -side;
        const x = cx + nx * (R.w / 2 + L.inset), z = cz + nz * (R.w / 2 + L.inset);
        if (CityLayout.inCity(x, z, EDGE_MARGIN + 6)) continue;
        if (inRoad(x, z, L.clearRoad) || inBuilt(x, z, 1.0) || this._onIsleDrive(x, z, 1.0)) continue;
        const gy = Island.height(x, z);
        if (gy < SEA_Y + 0.3 || Math.abs(gy - ry) > L.maxStep) continue;
        out.push({ x, z, y: gy, ry: Math.atan2(-nx, -nz), hx: x - nx * L.arm, hz: z - nz * L.arm, road: R.id });
      }
    }
    for (const p of out) {
      grid.add({ x: p.x, z: p.z, r: 0.16, y0: p.y - 0.5, y1: p.y + L.h, kind: 'det' });
      this.lampPools.push({ x: p.hx, z: p.hz });
    }
    this.roadLamps = out;
  }
});
// the lamps' meshes: posts and heads for this file's lamps, pools under every island lamp head
const RoadLamps = {
  built: false, posts: null, arms: null, heads: null, pools: null, headMat: null, poolMat: null,
  build(scene, world) {
    const L = ROAD_LAMP, lamps = world.roadLamps || [], pools = world.lampPools || [];
    // a post (tapered octagon), its arm toward the road, and the head under the arm's end
    const post = new THREE.CylinderGeometry(0.08, 0.13, L.h, 8).translate(0, L.h / 2, 0);
    const arm = new THREE.BoxGeometry(0.12, 0.12, L.arm + 0.2).translate(0, L.h - 0.1, (L.arm + 0.2) / 2 - 0.1);
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.4 });
    this.posts = new THREE.InstancedMesh(post, steel, Math.max(1, lamps.length));
    this.arms = new THREE.InstancedMesh(arm, steel, Math.max(1, lamps.length));
    const hg = new THREE.BoxGeometry(0.42, 0.14, 0.62).translate(0, L.h - 0.24, L.arm);
    this.headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    this.heads = new THREE.InstancedMesh(hg, this.headMat, Math.max(1, lamps.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    lamps.forEach((l, i) => { m.compose(p.set(l.x, l.y, l.z), q.setFromEuler(e.set(0, l.ry, 0)), one); this.posts.setMatrixAt(i, m); this.arms.setMatrixAt(i, m); this.heads.setMatrixAt(i, m); });
    this.posts.count = this.arms.count = this.heads.count = lamps.length;
    this.posts.castShadow = true; this.posts.receiveShadow = true;
    // the pools: a soft warm disc on the ground under each head, tilted to the ground's slope there
    const tex = makeRadialTexture('rgba(255,214,150,1)', 'rgba(255,214,150,0)', 128, false);
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    const dg = new THREE.PlaneGeometry(L.pool * 2, L.pool * 2).rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(dg, this.poolMat, Math.max(1, pools.length));
    const nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    pools.forEach((o, i) => {
      const y = groundY(o.x, o.z, (o.y !== undefined ? o.y : Island.height(o.x, o.z)) + 2);
      const gx = (groundY(o.x + 3, o.z, y + 2) - groundY(o.x - 3, o.z, y + 2)) / 6, gz = (groundY(o.x, o.z + 3, y + 2) - groundY(o.x, o.z - 3, y + 2)) / 6;
      nrm.set(-gx, 1, -gz).normalize(); q.setFromUnitVectors(up, nrm);
      m.compose(p.set(o.x, y + 0.06, o.z), q, one); this.pools.setMatrixAt(i, m);
    });
    this.pools.count = pools.length; this.pools.renderOrder = 2;
    for (const im of [this.posts, this.arms, this.heads, this.pools]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); }
    this.built = true;
  },
  // the heads glow and the pools show as night falls
  update(night) {
    if (!this.built) return;
    this.poolMat.opacity = ROAD_LAMP.poolPeak * smoothstep(0.15, 0.6, night);
    this.pools.visible = this.poolMat.opacity > 0.005;
    this.headMat.color.setRGB(0.55 + 0.45 * night, 0.5 + 0.38 * night, 0.42 + 0.27 * night);
  }
};
