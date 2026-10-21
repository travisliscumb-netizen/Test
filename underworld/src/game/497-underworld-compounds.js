/* =====================================================================
   [UNDERWORLD] WAREHOUSE COMPOUNDS (§5-§6, Session 3B): the physical side of
   a warehouse's security. The world generator lays out each compound once
   (yard, building, loading docks, drive lanes: world.compounds); this module
   builds what security buys from the saved tiers, and keeps it working:
   - Perimeter: an open lot, chain-link, a tall fence behind bollards,
     anti-climb fencing behind anti-ram barriers, a hardened wall with fencing
     on top. Panels a tier leaves weak break when a car rams them hard enough.
   - Access: an open gap, a basic gate, a motorised gate, a reinforced gate
     with a guard booth, a massive gate with access posts and a rising wedge.
     A gate opens only for who allows() admits: the player, crew who work
     here or walk with the player, vehicles they drive, and vehicles carrying
     a delivery for this warehouse. Everyone else waits outside.
   - Surveillance: cameras with a field of view, a range and line of sight
     (coverage() and seen() measure the same thing), wall lights and
     floodlights; at night the lighting decides how far a camera sees.
   - Vault and interior: the rooms inside, built when you walk in.
   Breaches (a rammed panel or gate) are runtime state, mended at the end of
   the day; everything else follows the tiers in the save, so a reload
   rebuilds the same compound. Nothing here touches money or the abstract
   raid odds (WarehouseSystem.defense), which stay as Session 3A set them.
   ===================================================================== */
const WH_SIDE = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const WH_LOD = 260;      // a compound is simulated (gates, agents, cameras) while the player is this close
const WH_GUARD_LOD = 150; // its guards stand at their posts while the player is this close
// world-space boxes (with yaw) merged into one lit mesh, plus lamps (glow), see-through mesh panels and light pools
class CompoundKit {
  constructor() { this.t = { solid: CompoundKit.B(), glow: CompoundKit.B(), mesh: CompoundKit.B(), pool: CompoundKit.B() }; this._c = new THREE.Color(); this.n = 0; }
  static B() { return { p: [], c: [], i: [] }; }
  // centre x/z, bottom y, size w (along local x) h d (along local z), yaw ry; o.t picks the bucket
  box(x, y, z, w, h, d, color, ry = 0, t = 'solid') {
    const T = this.t[t], c = this._c.set(color), base = T.p.length / 3, hx = w / 2, hz = d / 2, cs = Math.cos(ry), sn = Math.sin(ry);
    for (const f of KIT_FACES) {
      const sh = t === 'solid' ? 0.78 + 0.22 * f[4] : 1;
      for (let k = 0; k < 4; k++) {
        const s = f[k], lx = s[0] * hx, lz = s[2] * hz;
        T.p.push(x + lx * cs + lz * sn, y + (s[1] > 0 ? h : 0), z - lx * sn + lz * cs);
        T.c.push(c.r * sh, c.g * sh, c.b * sh);
      }
    }
    for (let q = 0; q < 6; q++) { const o = base + q * 4; T.i.push(o, o + 1, o + 2, o, o + 2, o + 3); }
    this.n++;
  }
  // a flat disc of light on the ground (pool bucket)
  disc(x, y, z, r, color, seg = 14) {
    const T = this.t.pool, c = this._c.set(color), base = T.p.length / 3;
    T.p.push(x, y, z); T.c.push(c.r, c.g, c.b);
    for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; T.p.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r); T.c.push(0, 0, 0); }
    for (let k = 0; k < seg; k++) T.i.push(base, base + 2 + k, base + 1 + k);
  }
  build() {
    const grp = new THREE.Group(), M = CompoundKit.mats();
    for (const k of ['solid', 'glow', 'mesh', 'pool']) {
      const T = this.t[k]; if (!T.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(T.c, 3));
      geo.setIndex(T.i); if (k === 'solid' || k === 'mesh') geo.computeVertexNormals(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, M[k]); m.name = k;
      if (k === 'solid') { m.castShadow = true; m.receiveShadow = true; }
      if (k === 'pool') m.renderOrder = 2;
      grp.add(m);
    }
    return grp;
  }
  static mats() {
    if (CompoundKit._m) return CompoundKit._m;
    return (CompoundKit._m = {
      solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      mesh: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      pool: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    });
  }
}

// a van driven along a compound's drive lane (forward and reverse legs), then handed to ordinary traffic
class LaneDriver {
  constructor(v, g, pts, opts = {}) { this.v = v; this.g = g; this.pts = pts; this.i = 0; this.done = false; this.wait = 0; this.cruise = opts.speed || 6; this.onDone = opts.onDone || null; this.stuck = 0; this.stalls = 0; }
  update(dt) {
    const v = this.v, ctl = v.ctl;
    if (v.health <= 0 || v.burnt) { ctl.throttle = 0; ctl.handbrake = true; ctl.steer = 0; return; }
    if (this.wait > 0) { this.wait -= dt; ctl.throttle = v.localVel().z > 0.3 ? -0.6 : v.localVel().z < -0.3 ? 0.6 : 0; ctl.handbrake = Math.abs(v.localVel().z) < 0.3; ctl.steer = 0; return; }
    if (this.done) { ctl.throttle = 0; ctl.handbrake = true; ctl.steer = 0; return; }
    const w = this.pts[this.i], last = this.i === this.pts.length - 1, lp = v.toLocal(w.x, w.z), d = Math.hypot(lp.x, lp.z);
    const passed = !last && d < 4.5 && (w.rev ? lp.z > 0.3 : lp.z < -0.3);
    if (d < (last ? 0.8 : 1.8) || passed) {
      if (last) { this.done = true; ctl.throttle = 0; ctl.handbrake = true; if (this.onDone) this.onDone(); return; }
      const nx = this.pts[this.i + 1];
      if (!!nx.rev !== !!w.rev) this.wait = 0.5; // changing direction: come to a stop first
      this.i++; return;
    }
    const fv = v.localVel().z;
    ctl.handbrake = false;
    if (w.rev) {
      // reversing: the tail leads, and steering toward a side swings the tail to that side
      const ang = Math.atan2(lp.x, -lp.z);
      ctl.steer = clamp(ang * 2.2, -1, 1);
      const want = -Math.min(2.6, 0.8 * d + 0.6);
      ctl.throttle = fv > want ? -0.6 : 0.25;
    } else {
      const ang = Math.atan2(lp.x, lp.z);
      ctl.steer = clamp(ang * 2.0, -1, 1);
      let want = last ? Math.min(this.cruise, 0.7 * d + 0.4) : this.cruise;
      if (Math.abs(ang) > 0.45) want = Math.min(want, 3.2);
      ctl.throttle = fv < want ? clamp((want - fv) * 0.45 + 0.18, 0.15, 0.75) : fv > want + 1.2 ? -0.5 : 0;
    }
    // wedged (a closed gate, a car in the way): wait and try again rather than shove
    if (Math.abs(fv) < 0.15) { this.stuck += dt; if (this.stuck > 2.5) { this.stuck = 0; this.wait = 1.0; this.stalls++; } } else this.stuck = 0;
  }
}

class CompoundSystem {
  constructor(uw) {
    this.uw = uw; this.R = {}; this.vans = []; this.alarmT = {}; this.events = [];
    const g = uw.g;
    for (const id in g.world.compounds) {
      const C = g.world.compounds[id];
      // the dock doors are part of the building at every tier: roll-ups that open for an authorized vehicle in the bay
      C.dockDoors = C.docks.map((dk, k) => g.doors.add({ id: 'dock:' + id + ':' + k, x: dk.x, z: dk.z, y: dk.y, w: dk.w, h: dk.h, axis: dk.axis, color: 0x8a9096, kind: 'dock', want: () => this.dockWant(id, k) }));
      this.R[id] = { id, C, sig: null, group: null, gateGrp: null, wedgeGrp: null, cols: [], panels: [], gate: null, wedge: null, cams: [], dirty: false, live: false };
    }
  }
  get g() { return this.uw.g; }
  C(id) { return this.g.world.compounds[id]; }
  // the tiers the compound shows: what you have bought, or nothing while it is for sale
  tiers(id) {
    const W = this.uw.whse, o = this.uw.props.owned(id);
    const t = {}; for (const k of WH_CAT_IDS) t[k] = o ? W.tier(id, k) : 0;
    return t;
  }
  // rebuild a compound when its tiers changed (upgrade, purchase, load) or a breach was mended
  sync(force) { for (const id in this.R) this.build(id, force); }
  build(id, force) {
    const R = this.R[id], t = this.tiers(id), sig = WH_CAT_IDS.map(k => t[k]).join('') + (this.uw.props.owned(id) ? 'o' : '-');
    if (!force && sig === R.sig && !R.dirty) return;
    const g = this.g, grid = g.world.grid, C = R.C;
    const keepGate = R.sig === sig && R.gate ? { open: R.gate.open, broken: R.gate.broken } : null;
    const keepBroken = R.sig === sig ? new Set(R.panels.filter(p => p.broken).map(p => p.key)) : new Set();
    for (const c of R.cols) grid.remove(c);
    for (const grp of [R.group, R.gateGrp, R.wedgeGrp]) if (grp) { g.scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    R.group = R.gateGrp = R.wedgeGrp = null;
    R.cols = []; R.panels = []; R.gate = null; R.wedge = null; R.cams = []; R.lights = 0; R.posts = []; R.samples = null;
    R.sig = sig; R.dirty = false; R.t = t;
    // every collider reports what drives into it (R.contacts: what a test reads to prove a clean drive-through)
    const k = new CompoundKit(), col = (c) => { c.kind = c.kind || 'det'; c.onHit = (v, imp) => this.contact(R, c, v, imp); grid.add(c); R.cols.push(c); return c; };
    const Y = CURB_H, L = C.lot, G = C.gate;
    const ns = side => side === 'n' || side === 's';
    // ---------------------------------------------------------------- perimeter
    const F = WH_FENCE[t.perimeter];
    if (F) {
      for (const seg of C.perim) {
        const o = WH_SIDE[seg.side], len = seg.a1 - seg.a0, n = Math.max(1, Math.ceil(len / 3)), pl = len / n;
        for (let i = 0; i < n; i++) {
          const a0 = seg.a0 + i * pl, a1 = a0 + pl, am = (a0 + a1) / 2, key = seg.side + ':' + seg.a0.toFixed(1) + ':' + i;
          const P = (a, out = 0) => ns(seg.side) ? [a, seg.e + o[1] * out] : [seg.e + o[0] * out, a];
          const [px, pz] = P(am), ry = ns(seg.side) ? 0 : Math.PI / 2;
          const panel = { key, ram: F.ram, broken: keepBroken.has(key), side: seg.side, x: px, z: pz };
          const th = F.wall ? 0.4 : 0.2;
          const c = col(ns(seg.side) ? { x0: a0, x1: a1, z0: pz - th / 2, z1: pz + th / 2, y0: 0, y1: Y + F.h } : { x0: px - th / 2, x1: px + th / 2, z0: a0, z1: a1, y0: 0, y1: Y + F.h });
          c.see = !F.wall; c.wh = id;
          if (F.ram < Infinity) c.part = panel;
          if (panel.broken) c.on = false;
          panel.col = c; R.panels.push(panel);
          // the post at the panel's start (and the last one at the end)
          for (const a of i === n - 1 ? [a0, a1] : [a0]) {
            const [qx, qz] = P(a), pw = F.wall ? 0.5 : F.kind === 'chain' ? 0.1 : 0.16;
            k.box(qx, Y, qz, pw, F.h + (F.wall ? 0 : 0.1), pw, F.wall ? 0x8a857a : 0x4a5056, ry);
          }
          if (panel.broken) { k.box(px + o[0] * 1.4, Y, pz + o[1] * 1.4, pl * 0.9, 0.08, 1.2, 0x5f676e, ry + 0.2); continue; }
          if (F.wall) {
            k.box(px, Y, pz, pl, F.wall, 0.35, 0xa8a296, ry); k.box(px, Y + F.wall, pz, pl, 0.1, 0.45, 0xc8c2b4, ry);
            k.box(px, Y + F.wall + 0.1, pz, pl, F.h - F.wall - 0.1, 0.04, 0x5c646b, ry, 'mesh');
            k.box(px, Y + F.h - 0.06, pz, pl, 0.06, 0.08, 0x3a3f44, ry);
          } else {
            k.box(px, Y + 0.05, pz, pl, F.h - 0.1, 0.03, F.kind === 'chain' ? 0xb4bcc4 : F.kind === 'tall' ? 0x7c868e : 0x5a636a, ry, 'mesh');
            k.box(px, Y + F.h - 0.06, pz, pl, 0.06, 0.06, 0x5a6066, ry); k.box(px, Y + 0.02, pz, pl, 0.06, 0.06, 0x5a6066, ry);
            if (F.kind !== 'chain') k.box(px, Y + F.h * 0.5, pz, pl, 0.05, 0.05, 0x5a6066, ry);
          }
          if (F.kind === 'anticlimb' || F.kind === 'wall') {
            // the outward-leaning anti-climb topper and its razor coil
            const [tx, tz] = P(am, 0.22);
            k.box(tx, Y + F.h, tz, pl, 0.55, 0.03, 0x3a3f44, ry, 'mesh');
            const [cx2, cz2] = P(am, 0.4); k.box(cx2, Y + F.h + 0.35, cz2, pl, 0.3, 0.3, 0x8a9096, ry, 'mesh');
          }
        }
        // bollards (tall fence) or anti-ram barriers (anti-climb, wall) on the sides that face traffic
        if (!C.front.includes(seg.side)) continue;
        const P2 = (a) => ns(seg.side) ? [a, seg.e + o[1] * 0.55] : [seg.e + o[0] * 0.55, a];
        if (F.bollards) {
          for (let a = seg.a0 + 0.6; a <= seg.a1 - 0.3; a += 1.5) {
            const [bx, bz] = P2(a); k.box(bx, Y, bz, 0.26, 1.0, 0.26, 0xe8c04a); k.box(bx, Y + 0.62, bz, 0.27, 0.14, 0.27, 0x1a1c20);
            col({ x: bx, z: bz, r: 0.17, y0: 0, y1: Y + 1.05 });
          }
        }
        if (F.barriers) {
          const nb = Math.max(1, Math.floor((seg.a1 - seg.a0 + 0.15) / 2.45)), bl = (seg.a1 - seg.a0) / nb;
          for (let i = 0; i < nb; i++) {
            const am = seg.a0 + (i + 0.5) * bl, [bx, bz] = P2(am), ry = ns(seg.side) ? 0 : Math.PI / 2;
            k.box(bx, Y, bz, bl - 0.15, 0.85, 0.6, 0xc8c2b4, ry); k.box(bx, Y + 0.85, bz, bl - 0.15, 0.06, 0.24, 0xb8b2a4, ry);
            col(ns(seg.side) ? { x0: am - bl / 2 + 0.07, x1: am + bl / 2 - 0.07, z0: bz - 0.3, z1: bz + 0.3, y0: 0, y1: Y + 0.9 } : { x0: bx - 0.3, x1: bx + 0.3, z0: am - bl / 2 + 0.07, z1: am + bl / 2 - 0.07, y0: 0, y1: Y + 0.9 });
          }
        }
      }
    }
    // ---------------------------------------------------------------- access: gate, booth, posts, wedge
    const A = WH_GATE[t.access], gn = G.n, lat = ns(G.side) ? [1, 0] : [0, 1];
    if (A) {
      const hw = G.w / 2, gry = ns(G.side) ? 0 : Math.PI / 2;
      for (const s of [-1, 1]) {
        const qx = G.x + lat[0] * s * (hw + 0.25), qz = G.z + lat[1] * s * (hw + 0.25);
        k.box(qx, Y, qz, 0.5, A.h + 0.5, 0.5, A.kind === 'massive' ? 0x4a4f55 : 0x5a6066, gry);
        col({ x0: qx - 0.25, x1: qx + 0.25, z0: qz - 0.25, z1: qz + 0.25, y0: 0, y1: Y + A.h + 0.5 });
        if (A.controlled) k.box(qx, Y + A.h + 0.5, qz, 0.24, 0.18, 0.24, 0xffb020, gry, 'glow');
      }
      // the leaf, in its own group so it can slide along the fence line (it parks inside, toward +lat)
      const lk = new CompoundKit(), th = A.kind === 'massive' ? 0.5 : A.kind === 'reinforced' ? 0.35 : 0.14;
      if (A.kind === 'basic') { lk.box(0, Y + 0.08, 0, G.w, A.h - 0.1, 0.03, 0xaab2ba, gry, 'mesh'); lk.box(0, Y + A.h - 0.07, 0, G.w, 0.07, 0.07, 0x6a7076, gry); lk.box(0, Y + 0.05, 0, G.w, 0.07, 0.07, 0x6a7076, gry); for (const s of [-1, 0, 1]) lk.box(lat[0] * s * (hw - 0.05), Y, lat[1] * s * (hw - 0.05), 0.07, A.h, 0.07, 0x6a7076, gry); }
      else if (A.kind === 'motor') { lk.box(0, Y + 0.1, 0, G.w, 1.2, th, 0x5f676e, gry); lk.box(0, Y + 1.3, 0, G.w, A.h - 1.3, 0.04, 0x7c868e, gry, 'mesh'); lk.box(0, Y + A.h - 0.08, 0, G.w, 0.08, 0.12, 0x3a3f44, gry); }
      else { lk.box(0, Y + 0.08, 0, G.w, A.h - 0.08, th, A.kind === 'massive' ? 0x2f3439 : 0x3a3f46, gry); for (let i = 0; i < 4; i++) lk.box(lat[0] * (-hw + 1 + i * 2), Y + 0.5, lat[1] * (-hw + 1 + i * 2), 0.9, 0.18, th + 0.02, i % 2 ? 0x1a1c20 : 0xe8c04a, gry); }
      const leaf = lk.build(); leaf.position.set(G.x, 0, G.z); g.scene.add(leaf); R.gateGrp = leaf;
      const gc = col(ns(G.side) ? { x0: G.x - hw, x1: G.x + hw, z0: G.z - th / 2 - 0.1, z1: G.z + th / 2 + 0.1, y0: 0, y1: Y + A.h, kind: 'gate' } : { x0: G.x - th / 2 - 0.1, x1: G.x + th / 2 + 0.1, z0: G.z - hw, z1: G.z + hw, y0: 0, y1: Y + A.h, kind: 'gate' });
      gc.wh = id;
      R.gate = { def: A, open: keepGate ? keepGate.open : 0, broken: keepGate ? keepGate.broken : false, col: gc, want: false, lat, hw };
      if (A.ram < Infinity) gc.part = R.gate;
      if (A.booth && C.booth) {
        const b0 = C.booth; k.box(b0.x, Y, b0.z, b0.w, 2.6, b0.d, 0xd8d0c0); k.box(b0.x, Y + 2.6, b0.z, b0.w + 0.5, 0.18, b0.d + 0.5, 0x3a3f44);
        k.box(b0.x, Y + 1.2, b0.z, b0.w + 0.04, 0.9, b0.d + 0.04, 0x6a8ab0, 0, 'glow');
        col({ x0: b0.x - b0.w / 2, x1: b0.x + b0.w / 2, z0: b0.z - b0.d / 2, z1: b0.z + b0.d / 2, y0: 0, y1: Y + 2.8 });
        R.posts.push({ x: b0.x + (G.x - b0.x) * 0.5, z: b0.z + (G.z - b0.z) * 0.5, h: Math.atan2(-gn[0], -gn[1]), booth: true });
      }
      if (A.posts) for (const s of [-1, 1]) {
        const qx = G.x + gn[0] * 1.6 + lat[0] * s * (hw - 0.7), qz = G.z + gn[1] * 1.6 + lat[1] * s * (hw - 0.7);
        k.box(qx, Y, qz, 0.3, 1.25, 0.3, 0x2a2d33); k.box(qx, Y + 1.0, qz, 0.2, 0.16, 0.06, 0x46d47c, 0, 'glow');
        col({ x: qx, z: qz, r: 0.2, y0: 0, y1: Y + 1.3 });
      }
      if (A.wedge) {
        const wk = new CompoundKit(), wx = G.x + gn[0] * 3.2, wz = G.z + gn[1] * 3.2, ww = G.w - 1.4;
        wk.box(0, Y, 0, ns(G.side) ? ww : 1.2, 0.9, ns(G.side) ? 1.2 : ww, 0x2a2d33);
        for (let i = 0; i < 5; i++) { const a = -ww / 2 + (i + 0.5) * ww / 5; wk.box(lat[0] * a, Y + 0.9, lat[1] * a, ns(G.side) ? ww / 5 - 0.1 : 1.22, 0.02, ns(G.side) ? 1.22 : ww / 5 - 0.1, i % 2 ? 0x1a1c20 : 0xe8c04a); }
        const wg = wk.build(); wg.position.set(wx, 0, wz); g.scene.add(wg); R.wedgeGrp = wg;
        const wc = col(ns(G.side) ? { x0: wx - ww / 2, x1: wx + ww / 2, z0: wz - 0.6, z1: wz + 0.6, y0: 0, y1: Y + 0.95, kind: 'gate' } : { x0: wx - 0.6, x1: wx + 0.6, z0: wz - ww / 2, z1: wz + ww / 2, y0: 0, y1: Y + 0.95, kind: 'gate' });
        R.wedge = { down: 0, col: wc };
      }
    }
    // ---------------------------------------------------------------- surveillance: cameras and lights
    R.cams = this.cameras(C, t.surveillance);
    for (const cm of R.cams) {
      if (cm.pole) { k.box(cm.x, Y, cm.z, 0.16, cm.y - Y, 0.16, 0x5a6066); col({ x: cm.x, z: cm.z, r: 0.12, y0: 0, y1: cm.y }); }
      k.box(cm.x, cm.y - 0.1, cm.z, 0.22, 0.2, 0.42, 0xd8dade, cm.yaw);
      k.box(cm.x + Math.sin(cm.yaw) * 0.22, cm.y - 0.05, cm.z + Math.cos(cm.yaw) * 0.22, 0.12, 0.1, 0.04, 0x1a1c20, cm.yaw);
      k.box(cm.x - Math.sin(cm.yaw) * 0.2, cm.y + 0.08, cm.z - Math.cos(cm.yaw) * 0.2, 0.05, 0.05, 0.05, 0xff3030, 0, 'glow');
      if (cm.dome) k.box(cm.x, cm.y + 0.1, cm.z, 0.3, 0.12, 0.3, 0x2a2d33);
    }
    R.lights = this.lights(C, t.surveillance, k, col);
    const grp = k.build(); g.scene.add(grp); R.group = grp; R.boxes = k.n;
    R.posts.push(...this.guardPosts(C));
    this.place(R);
  }
  // camera mounts by surveillance tier (cumulative): face corners → gate posts → yard corners → corner domes
  cameras(C, s) {
    const S = WH_SURV[s], out = []; if (!S.cams) return out;
    const B = C.bld, L = C.lot, G = C.gate, fo = WH_SIDE[C.face], ns = C.face === 'n' || C.face === 's';
    const faceE = C.face === 'n' ? B.z0 : C.face === 's' ? B.z1 : C.face === 'w' ? B.x0 : B.x1;
    const fc = ns ? [[B.x0, faceE], [B.x1, faceE]] : [[faceE, B.z0], [faceE, B.z1]];
    const cen = C.center, yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
    const add = (x, y, z, yaw, fov, extra = {}) => out.push({ x, y, z, yaw, fov, range: S.range, ...extra });
    // 1. the two corners of the yard face, looking out across the yard
    for (const [x, z] of fc) { const tx = (x + G.x) / 2 + (x - cen.x) * 0.3, tz = (z + G.z) / 2 + (z - cen.z) * 0.3; add(x + fo[0] * 0.3, CURB_H + 6.2, z + fo[1] * 0.3, yawTo(x, z, tx, tz), 2.1); }
    if (S.cams >= 4) {
      // 2. the gate: one looks out along the approach, one in along the lane
      const lat = G.axis === 'x' ? [1, 0] : [0, 1], gp = [G.x + lat[0] * (G.w / 2 + 0.25), G.z + lat[1] * (G.w / 2 + 0.25)];
      const ox = gp[0] - G.n[0] * 0.35, oz = gp[1] - G.n[1] * 0.35;
      add(ox, CURB_H + 4.4, oz, yawTo(ox, oz, G.x - G.n[0] * 5, G.z - G.n[1] * 5), 2.3, { gateOut: true });
      add(gp[0] + G.n[0] * 0.35, CURB_H + 4.4, gp[1] + G.n[1] * 0.35, Math.atan2(G.n[0], G.n[1]), 1.9);
    }
    if (S.cams >= 6) {
      // 3. poles at the lot corners on the gate's side, looking back at the building
      const corners = G.side === 'n' ? [[L.x0 + 1, L.z0 + 1], [L.x1 - 1, L.z0 + 1]] : G.side === 's' ? [[L.x0 + 1, L.z1 - 1], [L.x1 - 1, L.z1 - 1]] : G.side === 'w' ? [[L.x0 + 1, L.z0 + 1], [L.x0 + 1, L.z1 - 1]] : [[L.x1 - 1, L.z0 + 1], [L.x1 - 1, L.z1 - 1]];
      for (const [x, z] of corners) add(x, CURB_H + 5.2, z, yawTo(x, z, cen.x, cen.z), 1.8, { pole: true });
    }
    if (S.cams >= 10) {
      // 4. domes on all four corners of the building, looking outward (the side and back strips)
      for (const [x, z] of [[B.x0, B.z0], [B.x1, B.z0], [B.x0, B.z1], [B.x1, B.z1]]) { const dx = x < (B.x0 + B.x1) / 2 ? -1 : 1, dz = z < (B.z0 + B.z1) / 2 ? -1 : 1; add(x + dx * 0.3, CURB_H + 7.0, z + dz * 0.3, Math.atan2(dx, dz), 4.8, { dome: true }); }
    }
    return out;
  }
  // wall lights and floodlights; returns how many fixtures were built
  lights(C, s, k, col) {
    const B = C.bld, L = C.lot, fo = WH_SIDE[C.face], ns = C.face === 'n' || C.face === 's', Y = CURB_H;
    const faceE = C.face === 'n' ? B.z0 : C.face === 's' ? B.z1 : C.face === 'w' ? B.x0 : B.x1;
    const onFace = (a, out) => ns ? [a, faceE + fo[1] * out] : [faceE + fo[0] * out, a];
    const a0 = ns ? B.x0 : B.z0, a1 = ns ? B.x1 : B.z1;
    let n = 0;
    // tier 0: one weak lamp over the personnel door
    { const [x, z] = ns ? [C.door.x, faceE + fo[1] * 0.15] : [faceE + fo[0] * 0.15, C.door.z]; k.box(x, Y + 3.2, z, 0.3, 0.14, 0.3, 0xffe2a8, 0, 'glow'); k.disc(x + fo[0] * 1.2, Y + 0.03, z + fo[1] * 1.2, 3.2, 0x6a5a3a); n++; }
    if (s >= 1) for (let i = 0; i < 4; i++) { const a = a0 + (i + 0.5) * (a1 - a0) / 4, [x, z] = onFace(a, 0.2); k.box(x, Y + 5.6, z, 0.5, 0.3, 0.3, 0xfff1d6, 0, 'glow'); k.disc(x + fo[0] * 3, Y + 0.03, z + fo[1] * 3, 6.5, 0x5a5448); n++; }
    const pole = (x, z, r) => { k.box(x, Y, z, 0.22, 8, 0.22, 0x5a6066); col({ x, z, r: 0.15, y0: 0, y1: Y + 8 }); k.box(x, Y + 8, z, 1.2, 0.25, 0.5, 0xfffbe8, 0, 'glow'); k.disc(x, Y + 0.035, z, r, 0x6a6658); n++; };
    const G = C.gate, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
    const gateCorners = G.side === 'n' ? [[L.x0 + 1.5, L.z0 + 1.5], [L.x1 - 1.5, L.z0 + 1.5]] : G.side === 's' ? [[L.x0 + 1.5, L.z1 - 1.5], [L.x1 - 1.5, L.z1 - 1.5]] : G.side === 'w' ? [[L.x0 + 1.5, L.z0 + 1.5], [L.x0 + 1.5, L.z1 - 1.5]] : [[L.x1 - 1.5, L.z0 + 1.5], [L.x1 - 1.5, L.z1 - 1.5]];
    if (s >= 2) for (const [x, z] of gateCorners) pole(x, z, 13);
    if (s >= 3) { const [x1, z1] = onFace(a0 - 0.0, 2.2), [x2, z2] = onFace(a1, 2.2); pole(x1 + (ns ? -1.5 : 0), z1 + (ns ? 0 : -1.5), 11); pole(x2 + (ns ? 1.5 : 0), z2 + (ns ? 0 : 1.5), 11); }
    if (s >= 4) { for (const [x, z] of [[L.x0 + 1.5, L.z0 + 1.5], [L.x1 - 1.5, L.z0 + 1.5], [L.x0 + 1.5, L.z1 - 1.5], [L.x1 - 1.5, L.z1 - 1.5]]) if (!gateCorners.some(c => Math.abs(c[0] - x) < 0.1 && Math.abs(c[1] - z) < 0.1) && !(x > B.x0 - 2 && x < B.x1 + 2 && z > B.z0 - 2 && z < B.z1 + 2)) pole(x, z, 12); k.disc(cx, Y + 0.036, cz, 16, 0x3a3a34); }
    return n;
  }
  // where Enforcers stand: inside the gate, by the docks, at the yard corners (the booth when there is one)
  guardPosts(C) {
    const G = C.gate, lat = G.axis === 'x' ? [1, 0] : [0, 1], face = Math.atan2(-G.n[0], -G.n[1]), grid = this.g.world.grid, res = {}, out = [];
    // inside the gate on both sides of the lane, beside each dock bay, then the yard corners on the gate's side
    const cand = [-1, 1].map(s => ({ x: G.x + G.n[0] * 4.5 + lat[0] * s * (G.w / 2 + 1.4), z: G.z + G.n[1] * 4.5 + lat[1] * s * (G.w / 2 + 1.4), h: face }));
    for (const dk of C.docks) cand.push({ x: dk.bay.x + (dk.axis === 'x' ? 2.9 : 0), z: dk.bay.z + (dk.axis === 'z' ? 2.9 : 0), h: face });
    const L = C.lot, cs = G.side === 'n' ? [[L.x0 + 3, L.z0 + 3], [L.x1 - 3, L.z0 + 3]] : G.side === 's' ? [[L.x0 + 3, L.z1 - 3], [L.x1 - 3, L.z1 - 3]] : G.side === 'w' ? [[L.x0 + 3, L.z0 + 3], [L.x0 + 3, L.z1 - 3]] : [[L.x1 - 3, L.z0 + 3], [L.x1 - 3, L.z1 - 3]];
    for (const [x, z] of cs) cand.push({ x, z, h: face });
    for (const P of cand) if (!grid.resolveCircle(P.x, P.z, 0.45, CURB_H + 0.3, CURB_H + 1.7, res).hit && !C.park.some(q => Math.hypot(q.x - P.x, q.z - P.z) < 3.2)) out.push(P);
    return out;
  }
  // gate and wedge meshes follow their state; groups only exist near the player
  place(R) {
    const G = R.gate;
    if (G && R.gateGrp) {
      const C = R.C, slide = G.open * (C.gate.w - 0.4);
      R.gateGrp.position.set(C.gate.x + G.lat[0] * slide, 0, C.gate.z + G.lat[1] * slide);
      R.gateGrp.rotation.set(0, 0, 0);
      if (G.broken) { R.gateGrp.position.set(C.gate.x + C.gate.n[0] * 1.6, -0.2, C.gate.z + C.gate.n[1] * 1.6); R.gateGrp.rotation.set(C.gate.axis === 'x' ? -1.35 * Math.sign(C.gate.n[1]) : 0, 0, C.gate.axis === 'z' ? 1.35 * Math.sign(C.gate.n[0]) : 0); }
    }
    if (R.wedge && R.wedgeGrp) R.wedgeGrp.position.y = -R.wedge.down * 0.88;
  }
  // ---------------------------------------------------------------- who the gate lets in (the one rule)
  // returns '' when allowed, or why not. a: the player, a vehicle, or a person on foot
  why(id, a) {
    const g = this.g, uw = this.uw, p = g.player;
    if (!uw.props.owned(id)) return 'not yours';
    if (a === p) return uw.inJail ? 'in jail' : '';
    if (a && a.spec && a.ctl) {
      if (a === p.vehicle && p.state === 'vehicle') return uw.inJail ? 'in jail' : '';
      const m = a.wh;
      if (m && m.to === id && m.until > g.time) return '';               // a delivery for this warehouse
      if (m && m.crew) return this.crewWhy(id, m.crew);                  // one of the crew who works here at the wheel
      return 'no business here';
    }
    if (a && a.crewId) return this.crewWhy(id, a.crewId);
    return 'no business here';
  }
  allows(id, a) { return this.why(id, a) === ''; }
  crewWhy(id, crewId) {
    const c = this.uw.crew.find(crewId);
    if (!c || c.status !== 'active') return 'not working for you';
    if (c.assign === WarehouseSystem.key(id) || this.uw.crew.bodyguards().includes(c.id)) return '';
    return 'works somewhere else';
  }
  // is anyone the gate should open for near it? (vehicles get a longer reach at speed, as DoorSystem does)
  gateWant(R) {
    const g = this.g, p = g.player, G = R.C.gate, id = R.id;
    const reach = v => clamp(12 + v.speed * 1.2, 12, 36);
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    if (!p.interior) {
      const ax = pv ? pv.pos.x : p.pos.x, az = pv ? pv.pos.z : p.pos.z;
      if (Math.hypot(ax - G.x, az - G.z) < (pv ? reach(pv) : 4.5) && this.allows(id, p)) return true;
    }
    for (const v of g.vehicles.nearby(G.x, G.z, 36)) { if (v === pv || v.burnt) continue; if (Math.hypot(v.pos.x - G.x, v.pos.z - G.z) < reach(v) && this.allows(id, v)) return true; }
    for (const q of g.peds.peds) { if (q.state === 'down' || q.state === 'ko' || !q.crewId) continue; if (dist2(q.x, q.z, G.x, G.z) < 5 * 5 && this.allows(id, q)) return true; }
    return false;
  }
  // a dock door opens for an authorized vehicle in its bay (a controlled gate also wants it stopped first)
  dockWant(id, k) {
    const R = this.R[id], C = R.C, b = C.docks[k].bay, g = this.g;
    if (!this.uw.props.owned(id)) return false;
    const A = WH_GATE[R.t ? R.t.access : 0];
    for (const v of g.vehicles.nearby(b.x, b.z, 4)) if (Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 3.2 && (!A || !A.controlled || v.speed < 1.5) && this.allows(id, v)) return true;
    return false;
  }
  // ---------------------------------------------------------------- contacts and breaches
  contact(R, c, v, imp) {
    if (imp > 0.4) { R.contacts = R.contacts || []; R.contacts.push({ t: this.g.time, imp: +imp.toFixed(2), kind: c.kind, wh: !!v.wh, player: v === this.g.player.vehicle }); if (R.contacts.length > 30) R.contacts.shift(); }
    if (c.part) this.ram(R.id, c.part, imp);
  }
  ram(id, part, imp) {
    if (part.broken || imp < part.ram) return;
    const R = this.R[id], g = this.g;
    part.broken = true; part.col.on = false;
    if (part === R.gate) { R.gate.open = 0; this.place(R); } else R.dirty = true;
    g.audio.play('crash', { x: part.x || R.C.gate.x, z: part.z || R.C.gate.z });
    this.events.push({ t: g.time, id, kind: 'breach', what: part === R.gate ? 'gate' : 'fence' });
    this.alarm(id, part === R.gate ? 'Someone rammed the gate' : 'Someone drove through the fence');
  }
  alarm(id, what) {
    const g = this.g, uw = this.uw, now = g.time;
    if (this.alarmT[id] && now - this.alarmT[id] < 90) return;
    this.alarmT[id] = now;
    const d = PROP_BY_ID[id];
    if (!uw.props.owned(id)) return;
    uw.news('pv', `${what} at ${d.name}.${WH_SURV[this.R[id].t.surveillance].cams ? ' The cameras have it.' : ''}`);
    if (!uw.S.jail && g.state === 'playing') g.ui.toast(`${d.name}: ${what.toLowerCase()}.`, 'warn');
  }
  // the end of the day: crews mend fences and rehang gates
  mend() {
    for (const id in this.R) {
      const R = this.R[id]; let any = false;
      for (const p of R.panels) if (p.broken) { p.broken = false; p.col.on = true; any = true; }
      if (R.gate && R.gate.broken) { R.gate.broken = false; any = true; }
      if (any) this.build(id, true);
    }
  }
  // ---------------------------------------------------------------- cameras
  // a camera sees a point when it is in range (shortened at night by the tier's lighting), inside its field of view
  // and in clear line of sight
  camSees(cm, x, y, z, night, light) {
    const range = cm.range * (1 - night * (1 - light));
    const dx = x - cm.x, dz = z - cm.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    let da = Math.atan2(dx, dz) - cm.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > cm.fov / 2) return false;
    return this.g.world.grid.lineOfSight(cm.x, cm.y, cm.z, x, y, z);
  }
  seen(id, x, y, z, night = this.g.env.night) {
    const R = this.R[id], light = WH_SURV[R.t ? R.t.surveillance : 0].light;
    for (const cm of R.cams) if (this.camSees(cm, x, y, z, night, light)) return true;
    return false;
  }
  // the share of the yard (and the gate approach) at least one camera covers: same test as seen(). Samples are every
  // 2 m of ground someone could stand on (not inside the building, a dock, the booth or a barrier)
  samples(id) {
    const R = this.R[id]; if (R.samples) return R.samples;
    const C = R.C, B = C.bld, L = C.lot, out = [], grid = this.g.world.grid, res = {};
    const free = (x, z) => !grid.resolveCircle(x, z, 0.3, CURB_H + 0.3, CURB_H + 1.7, res).hit;
    for (let x = L.x0 + 1; x < L.x1; x += 2) for (let z = L.z0 + 1; z < L.z1; z += 2) if (!(x > B.x0 - 0.6 && x < B.x1 + 0.6 && z > B.z0 - 0.6 && z < B.z1 + 0.6) && free(x, z)) out.push({ x, z, out: false });
    const G = C.gate, lat = G.axis === 'x' ? [1, 0] : [0, 1];
    for (const d of [2, 4, 6, 8]) for (const s of [-2, 0, 2]) { const x = G.x - G.n[0] * d + lat[0] * s, z = G.z - G.n[1] * d + lat[1] * s; if (free(x, z)) out.push({ x, z, out: true }); }
    return (R.samples = out);
  }
  coverage(id, night = this.g.env.night) {
    const P = this.samples(id); let n = 0;
    for (const s of P) if (this.seen(id, s.x, CURB_H + 1, s.z, night)) n++;
    return { seen: n, total: P.length, frac: P.length ? n / P.length : 0 };
  }
  inYard(id, x, z) { const L = this.R[id].C.lot; return x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1; }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g, p = g.player, px = p.pos.x, pz = p.pos.z, night = g.env.night;
    CompoundKit.mats().pool.opacity = 0.18 + 0.62 * night;
    for (const id in this.R) {
      this.build(id);
      const R = this.R[id], C = R.C, near = Math.hypot(px - C.center.x, pz - C.center.z) < WH_LOD;
      if (R.group) R.group.visible = near || Math.hypot(g.camera.position.x - C.center.x, g.camera.position.z - C.center.z) < 420;
      if (R.gateGrp) R.gateGrp.visible = R.group.visible;
      if (R.wedgeGrp) R.wedgeGrp.visible = R.group.visible;
      R.live = near;
      if (!near) continue;
      const G = R.gate;
      if (G) {
        if (G.broken) G.col.on = false;
        else {
          G.want = this.gateWant(R);
          G.open = clamp(G.open + (G.want ? 1 : -1) * dt / G.def.open, 0, 1);
          G.col.on = G.open < 0.75;
        }
        if (R.wedge) { const W = R.wedge; W.down = clamp(W.down + (G.want && G.open > 0.5 ? 1 : -1) * dt / 0.6, 0, 1); W.col.on = W.down < 0.7; }
        this.place(R);
      }
      if (R.dirty) this.build(id, true);
      // the cameras watch the yard: anyone in it the gate wouldn't let in raises the alarm
      if ((R.watchT = (R.watchT || 0) - dt) <= 0 && R.cams.length && this.uw.props.owned(id)) {
        R.watchT = 0.5;
        for (const q of g.peds.peds) {
          if (q.state === 'down' || !this.inYard(id, q.x, q.z) || this.allows(id, q)) continue;
          if (this.seen(id, q.x, q.y + 1.2, q.z, night)) { this.events.push({ t: g.time, id, kind: 'intruder', who: q.kind || 'ped' }); this.alarm(id, 'Someone is inside the fence'); break; }
        }
        for (const v of g.vehicles.nearby(C.center.x, C.center.z, 40)) {
          if (v.burnt || !v.driver || !this.inYard(id, v.pos.x, v.pos.z) || this.allows(id, v)) continue;
          if (this.seen(id, v.pos.x, v.pos.y + 1.2, v.pos.z, night)) { this.events.push({ t: g.time, id, kind: 'intruder', who: 'vehicle' }); this.alarm(id, 'A car nobody knows is in the yard'); break; }
        }
      }
    }
    this.updateVans(dt);
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }
  // ---------------------------------------------------------------- the people and vans that work here
  // Enforcers at their posts while you are near (a crew group the gang system keeps and culls like any other)
  wantGroups(want, px, pz) {
    const gs = this.uw.gangs, W = this.uw.whse;
    for (const w of this.walkers || []) want.add(w.gr.key);
    for (const id in this.R) {
      const R = this.R[id], C = R.C;
      if (!this.uw.props.owned(id) || Math.hypot(px - C.center.x, pz - C.center.z) > WH_GUARD_LOD) continue;
      const enf = W.crewAt(id, 'enforcer'); if (!enf.length) continue;
      const key = 'wh:' + id; want.add(key);
      let gr = gs.groups.get(key);
      if (gr && (gr.members.length !== Math.min(enf.length, R.posts.length) || gr.members.some(m => !enf.some(c => c.id === m.crewId)))) { gs.removeGroup(gr); gr = null; }
      if (gr) continue;
      gr = { key, kind: 'whguard', fid: 'pc', x: C.center.x, z: C.center.z, members: [], hostile: false, crew: true, wh: id };
      gs.groups.set(key, gr);
      enf.slice(0, R.posts.length).forEach((c, i) => {
        const P = R.posts[i], m = gs.makeMember(gr, crewLook(c.id), 'guard', P.x, P.z, P.h);
        m.x = P.x; m.z = P.z; m.y = groundY(P.x, P.z); m.home = { x: P.x, z: P.z, h: P.h }; m.crewId = c.id; m.gun = true; m.health = 120;
      });
    }
  }
  // a crew member walks in from the street (they come through the gate like anyone else)
  walkIn(id, crewId) {
    const R = this.R[id], C = R.C, G = C.gate, gs = this.uw.gangs, c = this.uw.crew.find(crewId);
    if (!c) return null;
    const key = 'whw:' + id + ':' + crewId; if (gs.groups.has(key)) gs.removeGroup(gs.groups.get(key));
    const gr = { key, kind: 'whwalk', fid: 'pc', x: G.x, z: G.z, members: [], hostile: false, crew: true, wh: id };
    gs.groups.set(key, gr);
    const sx = G.x - G.n[0] * 7, sz = G.z - G.n[1] * 7, m = gs.makeMember(gr, crewLook(crewId), 'walker', sx, sz, Math.atan2(G.n[0], G.n[1]));
    m.x = sx; m.z = sz; m.y = groundY(sx, sz); m.crewId = crewId;
    m.route = [{ x: G.x - G.n[0] * 1.5, z: G.z - G.n[1] * 1.5 }, { x: G.x + G.n[0] * 5, z: G.z + G.n[1] * 5 }, { x: C.door.x, z: C.door.z }]; m.ri = 0;
    m.home = { x: m.route[0].x, z: m.route[0].z, h: 0 };
    this.walkers = this.walkers || []; this.walkers.push({ m, gr, id });
    return m;
  }
  updateWalkers() {
    if (!this.walkers || !this.walkers.length) return;
    const gs = this.uw.gangs;
    this.walkers = this.walkers.filter(w => {
      const m = w.m; if (!this.g.peds.peds.includes(m)) return false;
      const t = m.route[m.ri]; if (Math.hypot(m.x - t.x, m.z - t.z) < 0.9) { m.ri++; if (m.ri >= m.route.length) { this.events.push({ t: this.g.time, id: w.id, kind: 'walkin', crew: m.crewId }); gs.removeGroup(w.gr); return false; } }
      const n = m.route[m.ri]; m.home = { x: n.x, z: n.z, h: 0 };
      return true;
    });
  }
  // a Driver's van: leaving on a run (from a dock) or coming back with a delivery (from the street)
  onRun(kind, r) {
    const uw = this.uw, c = uw.crew.find(r.crew);
    let id = null;
    if (kind === 'arrive') id = PROP_BY_ID[r.to] && PROP_BY_ID[r.to].kind === 'warehouse' ? r.to : null;
    else id = PROP_BY_ID[r.from] && PROP_BY_ID[r.from].kind === 'warehouse' ? r.from : c ? WarehouseSystem.idOf(c.assign) : null;
    if (!id || !this.R[id] || !uw.props.owned(id)) return null;
    const C = this.R[id].C, p = this.g.player;
    if (p.interior || Math.hypot(p.pos.x - C.center.x, p.pos.z - C.center.z) > WH_LOD) return null;
    return this.spawnVan(id, kind, { crew: r.crew, to: kind === 'arrive' ? id : r.to, run: r.id });
  }
  spawnVan(id, kind, man) {
    const g = this.g, C = this.R[id].C;
    let k = 0;
    for (; k < C.docks.length; k++) { const b = C.docks[k].bay; if (!g.vehicles.nearby(b.x, b.z, 3.5).length && !this.vans.some(V => V.id === id && V.dock === k)) break; }
    if (k >= C.docks.length) return null;
    const dk = C.docks[k], lane = kind === 'arrive' ? C.lanes.in[k] : C.lanes.out[k];
    let v;
    if (kind === 'arrive') { const a = lane[0], b2 = lane[1]; v = g.vehicles.spawn('van', a.x, a.z, Math.atan2(b2.x - a.x, b2.z - a.z), { driver: 'npc', color: 0x2a3a4a }); }
    else v = g.vehicles.spawn('van', dk.bay.x, dk.bay.z, dk.bay.h, { driver: 'npc', color: 0x2a3a4a });
    v.touched = true; v.mission = 'whrun'; v.locked = true;
    v.wh = { id, crew: man.crew, to: man.to, run: man.run, until: g.time + 240 };
    const V = { v, id, dock: k, kind, phase: kind === 'arrive' ? 'in' : 'out', t: 0, stalls: 0 };
    v.drive = new LaneDriver(v, g, lane, { speed: 6, onDone: () => { V.stalls += v.drive.stalls; V.phase = V.phase === 'in' ? 'unload' : 'gone'; V.t = 0; } });
    this.vans.push(V);
    return V;
  }
  updateVans(dt) {
    const g = this.g, p = g.player;
    this.updateWalkers();
    this.vans = this.vans.filter(V => {
      const v = V.v; if (!g.vehicles.list.includes(v)) return false;
      if (v === p.vehicle) { v.mission = null; v.drive = null; return false; } // the player took it
      V.t += dt;
      if (V.phase === 'unload' && V.t > 20) { V.phase = 'out'; V.t = 0; v.wh.until = g.time + 240; v.drive = new LaneDriver(v, g, this.R[V.id].C.lanes.out[V.dock], { speed: 6, onDone: () => { V.stalls += v.drive.stalls; V.phase = 'gone'; V.t = 0; } }); }
      if (V.phase === 'gone') {
        // out on the street: an ordinary car again, gone once nobody is looking
        if (!(v.drive instanceof DriveAI)) { v.drive = new DriveAI(v, g, 'cruise'); v.drive.cruise = 12; const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 300, 700); v.drive.setGoal(c.x, c.z); }
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        if (d > 200 || (d > 90 && !g.inView(v.pos.x, 1, v.pos.z, 3))) { g.vehicles.despawn(v); return false; }
      }
      return true;
    });
  }
  // ---------------------------------------------------------------- the loading bay (you, in a car, at a dock)
  dockAt(x, z, r = 3.2) {
    for (const id in this.R) for (const dk of this.R[id].C.docks) if (Math.hypot(x - dk.bay.x, z - dk.bay.z) < r) return id;
    return null;
  }
  bayAction(v) {
    const id = this.dockAt(v.pos.x, v.pos.z); if (!id || !this.uw.props.owned(id) || v.speed > 2) return null;
    return { label: `Loading bay · ${PROP_BY_ID[id].name}`, act: () => { this.uw.ui.whTab = 'product'; this.uw.ui.openProp(id); } };
  }
  // ---------------------------------------------------------------- inside
  enter(id) {
    const g = this.g, I = g.content.interiors;
    if (!this.uw.props.owned(id)) return false;
    const def = I.addDynamic(warehouseInteriorDef(this.R[id].C, id, this.tiers(id)));
    return I.enter(def.id);
  }
  // bought an upgrade while standing inside: the rooms change around you
  refreshInterior(id) {
    const g = this.g, I = g.content.interiors, p = g.player, cur = I.cur;
    if (!cur || cur.propId !== id) return;
    const lx = p.pos.x - cur.ox, lz = p.pos.z - cur.oz, ly = p.pos.y - cur.fy;
    cur.group.visible = false; I.dispose(cur);
    const def = I.addDynamic(warehouseInteriorDef(this.R[id].C, id, this.tiers(id)));
    I.cur = def; def.group.visible = true; p.interior = { id: def.id, floor: def.fy, def };
    p.pos.set(def.ox + lx, def.fy + ly, def.oz + lz);
  }
  spot(s) {
    const I = this.g.content.interiors, id = I.cur && I.cur.propId; if (!id) return;
    const tab = { storage: 'product', pvault: 'product', vault: 'cash', armory: 'weapons', office: 'logistics', monitor: 'security', ready: 'crew' }[s];
    if (!tab) return;
    this.uw.ui.whTab = tab; this.uw.ui.openProp(id);
  }
  // what the security tab says the compound physically has now
  status(id) {
    const R = this.R[id], C = R.C, t = R.t || this.tiers(id), cov = this.coverage(id, 0), covN = this.coverage(id, 1);
    return {
      fence: WH_FENCE[t.perimeter] ? WH_FENCE[t.perimeter].kind : 'none', gate: WH_GATE[t.access] ? WH_GATE[t.access].kind : 'none',
      breaches: R.panels.filter(p => p.broken).length + (R.gate && R.gate.broken ? 1 : 0), cams: R.cams.length, lights: R.lights,
      day: cov.frac, night: covN.frac, booth: !!(WH_GATE[t.access] && WH_GATE[t.access].booth && C.booth)
    };
  }
  reset() {
    for (const V of this.vans) if (this.g.vehicles.list.includes(V.v) && V.v !== this.g.player.vehicle) this.g.vehicles.despawn(V.v);
    this.vans = []; this.walkers = []; this.alarmT = {}; this.events = [];
    for (const id in this.R) { const R = this.R[id]; R.sig = null; for (const p of R.panels) p.broken = false; if (R.gate) { R.gate.broken = false; R.gate.open = 0; } }
    this.sync(true);
  }
}

/* The inside of a warehouse, built from its tiers when you walk in: a loading area behind the dock doors,
   racking (caged from vault tier 1), back rooms by vault tier (a safe → a cash room → a vault and an armory →
   a large vault, a product vault and a ready room), and a mezzanine up a stair with the Lieutenant's office and
   the CCTV desk, security room or command room. Every room's door, the stair and each interaction point stay
   reachable at every tier (tests/compound.mjs walks it). */
function warehouseInteriorDef(C, id, t) {
  const big = C.bld.x1 - C.bld.x0 > 40, W = big ? 40 : 32, D = big ? 24 : 20, H = 8, hw = W / 2, hd = D / 2;
  const MH = 3.6, MW = big ? 13 : 10, mx1 = -hw + MW, sx1 = mx1 + (big ? 7 : 6.5), deck = -hd + 6;
  const d = PROP_BY_ID[id];
  const def = {
    id: 'w:' + id, dynamic: true, name: d.name, w: W, d: D, h: H, seed: 4100 + id.length, propId: id, owned: true, place: null,
    at: { x: (C.bld.x0 + C.bld.x1) / 2, z: (C.bld.z0 + C.bld.z1) / 2 }, door: { x: C.door.x, z: C.door.z, h: C.door.h },
    exit: { x: -hw + 2.5, z: hd - 0.7 }, spawnH: Math.PI, tiers: { ...t },
    levels: [
      { x0: -hw, x1: mx1, z0: -hd, z1: deck, h: MH },
      { x0: mx1, x1: sx1, z0: -hd + 0.3, z1: -hd + 1.9, axis: 'x', dir: -1, h0: 0, h1: MH }
    ],
    spots: [],
    build(k, rng) {
      const steel = 0x6a7076, wallC = 0x7a8288, yel = 0xe8c04a;
      k.room(W, D, H, { floor: 0x6a6c6e, wall: wallC, ceil: 0x3a3e42, trim: 0x2a2a2a, band: [0, 1.2], bandC: 0x4a5258, lights: [5, 3], lightC: 0xe8f0ff });
      for (let i = 0; i < 12; i++) k.box(-hw + 2 + rng() * (W - 4), -0.006, -hd + 2 + rng() * (D - 4), 0.8 + rng() * 2, 0.008, 0.6 + rng(), 0x5a5c5e, { flat: true });
      k.door(-hw + 2.5, hd - 0.02, 0, 0x2a2e33, 0x46d4c4);
      // dock doors from the inside, the loading line and pallets waiting by them
      for (const x of [-4, 4]) { k.box(x, 1.2, hd - 0.05, 3.6, 3.4, 0.08, 0x8a9096); for (let r = 0; r < 9; r++) k.box(x, 1.4 + r * 0.36, hd - 0.1, 3.5, 0.04, 0.02, 0x6a7076); k.box(x, 0, hd - 1.0, 4.4, 1.2, 2.0, 0x8a857a, { col: true }); }
      k.box(0, -0.004, hd - 6, W - 1, 0.012, 0.16, yel, { flat: true });
      for (const x of [9, 12]) if (x < hw - 1) k.crate(x, hd - 3.5, 1.1, 0x8a6a4a, 2);
      // ---- the mezzanine: deck, columns, railings, the stair up (east end, climbing west against the back wall)
      k.box((-hw + mx1) / 2, MH - 0.3, (-hd + deck) / 2, MW, 0.3, 6, 0x4a4f55, { col: true });
      for (const x of [-hw + 0.4, (-hw + mx1) / 2, mx1 - 0.3]) { k.box(x, 0, deck - 0.3, 0.3, MH - 0.3, 0.3, steel, { col: true }); }
      const rail = (x0, z0, x1, z1) => { const ax = Math.abs(x1 - x0) > 0.1, len = ax ? x1 - x0 : z1 - z0; k.box((x0 + x1) / 2, MH, (z0 + z1) / 2, ax ? len : 0.06, 1.05, ax ? 0.06 : len, yel); k.cols.push({ x0: Math.min(x0, x1) - 0.06, x1: Math.max(x0, x1) + 0.06, z0: Math.min(z0, z1) - 0.06, z1: Math.max(z0, z1) + 0.06, y0: MH, y1: MH + 1.1 }); };
      rail(-hw, deck, mx1, deck); rail(mx1, -hd + 2.0, mx1, deck);
      const n = 16, run = (sx1 - mx1) / n;
      for (let i = 0; i < n; i++) { const x = sx1 - (i + 0.5) * run, top = (i + 1) * MH / n; k.box(x, 0, -hd + 1.1, run + 0.01, top, 1.6, 0x5a5f66); k.box(x + run / 2 - 0.03, top - 0.02, -hd + 1.1, 0.06, 0.025, 1.6, yel); }
      for (let i = 0; i < 8; i++) {
        const xa = sx1 - i * (sx1 - mx1) / 8, xb = sx1 - (i + 1) * (sx1 - mx1) / 8, ha = (sx1 - xa) / (sx1 - mx1) * MH, hb = (sx1 - xb) / (sx1 - mx1) * MH;
        if (ha > 0.4) k.cols.push({ x0: xb, x1: xa, z0: -hd + 0.3, z1: -hd + 1.9, y0: 0, y1: ha - 0.05 });
        k.cols.push({ x0: xb, x1: xa, z0: -hd + 1.92, z1: -hd + 2.06, y0: Math.max(0, ha - 0.3), y1: hb + 1.0 }); k.box((xa + xb) / 2, ha + 0.9, -hd + 1.99, xa - xb + 0.02, 0.06, 0.06, yel);
      }
      // ---- on the deck: the Lieutenant's office, and the CCTV desk / security room / command room
      const ox = -hw + MW * 0.25, cx = -hw + MW * 0.72;
      FURN.desk(k, ox, MH, -hd + 1.0, 0, 1.8, true, 0x3a3e44); FURN.armchair(k, ox, MH, -hd + 2.6, 2, 0x2a2c30);
      k.box(-hw + 0.2, MH + 1.0, -hd + 3.0, 0.04, 1.2, 2.2, 0xb59a6a); for (let i = 0; i < 6; i++) k.box(-hw + 0.24, MH + 1.15 + (i % 2) * 0.5, -hd + 2.2 + Math.floor(i / 2) * 0.6, 0.02, 0.36, 0.42, 0xf4f2ee);
      def.spots.push({ id: 'w:office', x: ox, y: MH, z: -hd + 2.0, r: 1.3, label: 'Lieutenant’s office · logistics' });
      if (t.surveillance >= 1) {
        const scr = t.surveillance >= 4 ? 8 : t.surveillance >= 3 ? 5 : 2;
        k.box(cx, MH, -hd + 0.6, 2.6, 0.8, 0.8, 0x2a2d33, { col: true });
        for (let i = 0; i < scr; i++) k.glow(cx - 1.3 + 0.35 + (i % 4) * 0.65, MH + 1.05 + Math.floor(i / 4) * 0.5, -hd + 0.25, 0.55, 0.4, 0.03, i % 3 ? 0x4a8a6a : 0x6a8ab0, 1.4);
        if (t.surveillance >= 3) {
          // a glazed room round it, its door facing the deck
          const gx0 = cx - 2.4, gx1 = Math.min(mx1 - 0.2, cx + 2.4);
          iwall(k, 'z', gx0, -hd, deck - 1.2, MH, 3, 0x9ab0c0, [[-hd + 2.6, -hd + 3.8]], 0.08);
          iwall(k, 'x', deck - 1.2, gx0, gx1, MH, 3, 0x9ab0c0, [[cx - 0.6, cx + 0.6]], 0.08);
        }
        def.spots.push({ id: 'w:monitor', x: cx, y: MH, z: -hd + 1.8, r: 1.3, label: t.surveillance >= 4 ? 'Command room · cameras & security' : t.surveillance >= 3 ? 'Security room · cameras & security' : 'CCTV desk · cameras & security' });
      }
      // ---- racking in the middle band, caged from vault tier 1
      const rz0 = -hd + 7.5, rz1 = hd - 7, rx1 = Math.min(-1.5, sx1 - 1.5);
      for (let x = -hw + 2; x < rx1 - 0.5; x += 3.6) {
        k.shelfUnit(x, (rz0 + rz1) / 2, 1.2, rz1 - rz0, 4.2, 4, rng, [0x8a6a4a, 0x6a7a8a, 0x5a4a3a, 0x7a6a5a]);
      }
      if (t.vault >= 1) {
        const cz0 = rz0 - 0.6, cz1 = rz1 + 0.6, cx0 = -hw + 0.4, cx1 = rx1 + 0.4, gate = [(cx0 + cx1) / 2 - 0.7, (cx0 + cx1) / 2 + 0.7];
        const mesh = t.vault >= 3 ? 0x4a5258 : 0x8a9096;
        iwall(k, 'x', cz1, cx0, cx1, 0, 2.6, mesh, [gate], 0.06); iwall(k, 'x', cz0, cx0, cx1, 0, 2.6, mesh, [], 0.06); iwall(k, 'z', cx1, cz0, cz1, 0, 2.6, mesh, [], 0.06);
      }
      def.spots.push({ id: 'w:storage', x: (-hw + 0.4 + rx1 + 0.4) / 2, z: rz1 + 1.8, r: 1.4, label: t.vault >= 1 ? 'Product cage · storage' : 'Product storage' });
      // ---- the back rooms, right to left along the back wall
      const room = (x0, x1, label, gap, col, thick) => {
        const z1 = -hd + 7;
        iwall(k, 'x', z1, x0, x1, 0, 3.2, col, [[gap - 0.7, gap + 0.7]], thick);
        if (x0 > sx1 + 0.2) iwall(k, 'z', x0, -hd, z1, 0, 3.2, col, [], thick);
        return { x0, x1, z0: -hd, z1, gap, label };
      };
      let xR = hw;
      if (t.vault === 0) { k.box(hw - 2, 0, -hd + 1.2, 1.4, 0.75, 0.8, 0x5a3e2b, { col: true }); k.box(hw - 2, 0.75, -hd + 1.2, 0.5, 0.25, 0.35, 0x2a2a2e); def.spots.push({ id: 'w:vault', x: hw - 2, z: -hd + 2.4, r: 1.2, label: 'Cash box · Dirty Cash' }); }
      if (t.vault === 1) { FURN.safe(k, hw - 0.6, 0, -hd + 1.4, 3); def.spots.push({ id: 'w:vault', x: hw - 1.8, z: -hd + 1.6, r: 1.2, label: 'Safe · Dirty Cash' }); }
      if (t.vault === 2) { const r = room(hw - 6, hw, 'Cash room', hw - 3, 0x8a8478, 0.2); FURN.safe(k, hw - 0.6, 0, -hd + 2, 3); k.box(hw - 3.5, 0, -hd + 1, 1.6, 0.8, 0.8, 0x3a3e44, { col: true }); def.spots.push({ id: 'w:vault', x: hw - 1.8, z: -hd + 2.2, r: 1.2, label: 'Cash room · Dirty Cash' }); xR = r.x0; }
      if (t.vault >= 3) {
        const vw = t.vault >= 4 ? (big ? 9 : 8) : (big ? 7 : 6), v = room(hw - vw, hw, 'Vault', hw - vw / 2, 0x55595e, 0.5);
        k.box(v.gap - 1.0, 0, v.z1 + 0.5, 0.15, 2.2, 1.6, 0x8a9096); k.glow(v.gap, 2.6, v.z1 + 0.3, 0.8, 0.12, 0.04, 0x46d47c, 2);
        for (let i = 0; i < (t.vault >= 4 ? 6 : 3); i++) k.crate(hw - 1 - (i % 3) * 1.3, -hd + 1 + Math.floor(i / 3) * 1.4, 0.9, 0x3a6a3a, 1);
        def.spots.push({ id: 'w:vault', x: v.gap, z: -hd + 3.6, r: 1.3, label: 'Vault · Dirty Cash' });
        const aw = big ? 5 : 4.5, a = room(v.x0 - aw, v.x0, 'Armory', v.x0 - aw / 2, 0x6a6458, 0.3);
        for (let i = 0; i < 4; i++) { k.box(a.x0 + 0.8 + i * 0.85, 1.0, -hd + 0.25, 0.12, 1.2, 0.06, 0x2a2a2e); k.box(a.x0 + 0.8 + i * 0.85, 1.6, -hd + 0.3, 0.6, 0.06, 0.06, 0x3a3a3a); }
        k.box(a.x0 + aw / 2, 0, -hd + 2.6, 2.2, 0.9, 0.8, 0x4a4f55, { col: true });
        def.spots.push({ id: 'w:armory', x: a.gap, z: -hd + 4.8, r: 1.3, label: 'Armory · weapons & ammo' });
        xR = a.x0;
      }
      if (t.vault >= 4) {
        // the product vault along the right wall in front of the vault, and a ready room under the deck
        const pz1 = hd - 6.2, pz0 = pz1 - 5;
        iwall(k, 'x', pz0, hw - 6, hw, 0, 3.2, 0x55595e, [], 0.4); iwall(k, 'x', pz1, hw - 6, hw, 0, 3.2, 0x55595e, [], 0.4);
        iwall(k, 'z', hw - 6, pz0, pz1, 0, 3.2, 0x55595e, [[pz0 + 1.8, pz0 + 3.2]], 0.4);
        for (let i = 0; i < 4; i++) k.crate(hw - 1.0 - (i % 2) * 1.3, pz0 + 0.9 + Math.floor(i / 2) * 3.0, 1.0, 0x6a5a3a, 2);
        def.spots.push({ id: 'w:pvault', x: hw - 4.4, z: pz0 + 2.5, r: 1.2, label: 'Product vault · storage' });
        for (let i = 0; i < 4; i++) k.box(-hw + 0.5, 0, -hd + 0.8 + i * 1.2, 0.6, 1.9, 1.0, 0x4a5a4a, { col: true });
        k.box(-hw + 6.5, 0, -hd + 3, 2.2, 0.75, 1.1, 0x5a3e2b, { col: true });
        for (const s of [-1, 1]) k.box(-hw + 6.5, 0, -hd + 3 + s * 0.95, 1.8, 0.45, 0.4, 0x2a2c30);
        def.spots.push({ id: 'w:ready', x: -hw + 6.5, z: -hd + 4.6, r: 1.3, label: 'Ready room · crew' });
      }
      void xR;
    }
  };
  return def;
}
