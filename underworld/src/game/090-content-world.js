/* =====================================================================
   [CONTENT] WORLD (deterministic city layout + colliders + nav helpers)
   ===================================================================== */
const PAL = {
  glass: [0x4b6f86, 0x2f4a66, 0x5d7a75, 0x7a6650, 0x8c96a0, 0x3e5560],
  office: [0xb8b2a6, 0x9fa3a6, 0xc9c1b0, 0x8f8a80, 0xa7a196],
  brick: [0x8a4a35, 0x9b5b3e, 0x6e3b2c, 0xa3714f, 0x7c5442, 0x8f6048],
  shop: [0xd9cbb0, 0xb7c4c9, 0xe3d7c3, 0xa9b8a0, 0xcab49a, 0xd6b8a8],
  ind: [0x8d9296, 0x6f7a80, 0x9a8f7d, 0x7b8a7a, 0xa08f6c, 0x7d6f63],
  house: [0xe9e4da, 0xc6d6df, 0xe2d2b3, 0xb9cbb1, 0xd8b9a8, 0xf0e6c8, 0xa8b8c8],
  deco: [0xd8ccb4, 0xc2b59b, 0xe0d6c4, 0xcfc0a2],
  roof: [0x5a3a32, 0x3d4247, 0x6b4a3a, 0x4a4f3c, 0x58463e],
  awning: [0x9c2b2b, 0x2b5f9c, 0x2b8c5a, 0xc9822a, 0x333a44, 0x7a2b6e, 0x2e8c8a],
  container: [0xb5462e, 0x2e6fb5, 0x2e9a5a, 0xd1a32a, 0x7a7f86, 0x8c3a8c, 0xc96a2a],
  apt: [0xd6d2ca, 0xb9c2c6, 0xcbbfa8, 0xa9a49a, 0xe0d8c8, 0x8e9aa3]
};
const STYLE = { GLASS: 0, OFFICE: 1, BRICK: 2, SHOP: 3, IND: 4, HOUSE: 5, DECO: 6, APT: 7, PARKING: 8, WARE: 9 };

class World {
  constructor() {
    this.grid = new CollisionGrid();
    this.blocks = [];
    this.lampSet = [];
    this.propTypes = {};
    this.totalProps = 0;
    this.secrets = [];
    this.lots = []; // parking stall positions per block
  }
  block(bx, bz) { return (bx < 0 || bz < 0 || bx >= N || bz >= N) ? null : this.blocks[bz * N + bx]; }
  // a block by its index: a city block, or one of Valen Point's district blocks (index 1000 and up)
  blockI(i) { return i < 1000 ? this.blocks[i] : (this.xblocks || [])[i - 1000]; }
  generate() {
    for (let bz = 0; bz < N; bz++) for (let bx = 0; bx < N; bx++) {
      const t = districtAt(bx, bz);
      const b = {
        bx, bz, t, i: bz * N + bx,
        x0: bx * P + INNER, z0: bz * P + INNER, x1: (bx + 1) * P - INNER, z1: (bz + 1) * P - INNER,
        cx: bx * P + P / 2, cz: bz * P + P / 2,
        bld: [], det: [], props: [], parked: [], signs: [], billboards: [], fx: [], secrets: [], seats: [], water: [],
        special: null
      };
      for (const k in SPECIAL) if (SPECIAL[k].bx === bx && SPECIAL[k].bz === bz) b.special = k;
      this.blocks.push(b);
    }
    this.localRoads = []; this.homes = []; this.mapPlaces = []; this.compounds = {};
    for (const b of this.blocks) { const sb = superblockAt(b.bx, b.bz); if (sb) { b.superblock = sb; b.noPeds = !sb.peds; b.ground = sb.ground; } }
    for (const b of this.blocks) this._genBlock(b);
    this._genPerimeter();
    this._buildLocalRaster();
    if (this._propSanity) this._propSanity();
    // colliders
    for (const b of this.blocks) {
      for (const bl of b.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
      for (const d of b.det) if (d.col) this.grid.add(d.col);
      for (const p of b.props) if (p.col) { p.col.prop = p; this.grid.add(p.col); }
    }
  }
  // ----- helpers -----
  _bld(b, x0, z0, x1, z1, h, style, color, fh, bayN, opts = {}) {
    const w = x1 - x0, d = z1 - z0;
    const nx = Math.max(1, Math.round(w / bayN)), nz = Math.max(1, Math.round(d / bayN));
    const floors = Math.max(1, Math.round(h / fh));
    const hh = opts.exactH ? h : floors * fh + 0.6;
    const r = {
      x0, z0, x1, z1, y0: opts.y0 ?? CURB_H, h: hh, style, color: C(color), fh, bayX: w / nx, bayZ: d / nz,
      seed: Math.floor(hash2i(Math.floor(x0 * 7), Math.floor(z0 * 13), 5) * 97), ox: x0, oz: z0, oy: opts.oy ?? CURB_H,
      roof: opts.roof || 'flat', roofColor: opts.roofColor ? C(opts.roofColor) : null, noCol: !!opts.noCol, far: opts.far !== false, gtype: opts.gtype || 0
    };
    b.bld.push(r);
    return r;
  }
  _det(b, kind, x, y, z, sx, sy, sz, color, ry = 0, col) {
    if (kind === 'cyl') { kind = 'cylr'; col = ry || undefined; ry = 0; color = sz; sz = sx; }
    const d = { kind, x, y, z, sx, sy, sz, color: typeof color === 'number' ? C(color) : color, ry };
    if (col === true) d.col = { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2, y0: y - sy / 2, y1: y + sy / 2, kind: 'det' };
    else if (col === 'r') d.col = { x, z, r: Math.max(sx, sz), y0: y - sy / 2, y1: y + sy / 2, kind: 'det' };
    else if (col) d.col = col;
    b.det.push(d);
    return d;
  }
  _prop(b, type, x, z, ry = 0, s = 1) {
    const p = { type, x, z, ry, s, id: this.totalProps++, broken: false, block: b.i };
    const def = PROP_DEFS[type];
    if (def && def.col) {
      if (def.col.r !== undefined) p.col = { x, z, r: def.col.r * s, y0: 0, y1: def.col.h * s, kind: 'prop' };
      else {
        const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
        const hw = (def.col.w * c + def.col.d * sn) / 2 * s, hd = (def.col.w * sn + def.col.d * c) / 2 * s;
        p.col = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: 0, y1: def.col.h * s, kind: 'prop' };
      }
      if (def.breakable) p.col.breakable = true;
    }
    b.props.push(p);
    (this.propTypes[type] || (this.propTypes[type] = [])).push(p);
    return p;
  }
  _rooftop(b, r, rng, kind) {
    const top = r.y0 + r.h, w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const par = r.color.clone().multiplyScalar(0.7);
    // parapet
    if (r.roof === 'flat') {
      this._det(b, 'box', cx, top + 0.35, r.z0 + 0.15, w, 0.7, 0.3, par);
      this._det(b, 'box', cx, top + 0.35, r.z1 - 0.15, w, 0.7, 0.3, par);
      this._det(b, 'box', r.x0 + 0.15, top + 0.35, cz, 0.3, 0.7, d - 0.6, par);
      this._det(b, 'box', r.x1 - 0.15, top + 0.35, cz, 0.3, 0.7, d - 0.6, par);
    }
    const n = rng.int(1, Math.min(5, Math.floor(w * d / 60) + 1));
    for (let i = 0; i < n; i++) {
      const ux = rng.range(r.x0 + 2, r.x1 - 2), uz = rng.range(r.z0 + 2, r.z1 - 2);
      const s = rng.range(1.2, 2.6);
      this._det(b, 'box', ux, top + s * 0.4, uz, s, s * 0.8, s * rng.range(0.8, 1.6), C(0x9aa0a6).multiplyScalar(rng.range(0.7, 1.05)));
    }
    if (kind === 'tower' && rng.chance(0.6)) {
      const ah = rng.range(8, 22);
      this._det(b, 'cyl', cx + rng.range(-2, 2), top + ah / 2, cz + rng.range(-2, 2), 0.18, ah, 0xb0b4b8);
      b.fx.push({ type: 'beacon', x: cx, y: top + ah, z: cz });
    }
    if (kind === 'tower' && rng.chance(0.35) && w > 18 && d > 18) {
      this._det(b, 'disc', cx, top + 0.05, cz, 6, 1, 6, 0x3a3f46);
      this._det(b, 'disc', cx, top + 0.07, cz, 4.6, 1, 4.6, 0xd8d8d8);
      this._det(b, 'disc', cx, top + 0.09, cz, 4.3, 1, 4.3, 0x3a3f46);
    }
    if (kind === 'old' && rng.chance(0.4)) {
      const tx = rng.range(r.x0 + 3, r.x1 - 3), tz = rng.range(r.z0 + 3, r.z1 - 3);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this._det(b, 'box', tx + lx * 1.2, top + 1.5, tz + lz * 1.2, 0.2, 3, 0.2, 0x3b3530);
      this._det(b, 'cyl', tx, top + 4.4, tz, 1.8, 3, 0x7a5a3c);
      this._det(b, 'cone', tx, top + 6.4, tz, 1.9, 1, 1.9, 0x4a3a2c);
    }
  }
  _billboard(b, x, y, z, ry, w, h, rng, legsFrom = null) {
    const ad = rng.int(0, 7);
    b.billboards.push({ x, y, z, ry, w, h, ad });
    const fx = Math.sin(ry), fz = Math.cos(ry);
    this._det(b, 'box', x - fx * 0.15, y, z - fz * 0.15, w + 0.4, h + 0.4, 0.25, 0x2a2d33, ry);
    if (legsFrom !== null) {
      const rx = Math.cos(ry), rz = -Math.sin(ry), lh = y - h / 2 - legsFrom;
      for (const s of [-0.3, 0.3]) {
        const lx = x + rx * w * s - fx * 0.4, lz = z + rz * w * s - fz * 0.4;
        this._det(b, 'box', lx, legsFrom + lh / 2, lz, 0.35, lh, 0.35, 0x45484e, ry, legsFrom < 1 ? { x: lx, z: lz, r: 0.3, y0: 0, y1: y, kind: 'det' } : null);
      }
    }
  }
  // perimeter row of buildings around a block
  _rows(b, rng, o) {
    const { x0, z0, x1, z1 } = b;
    const depth = o.depth;
    const alleySide = rng.int(0, 3), alleyPos = rng.range(0.3, 0.7);
    const sides = [
      { ax: 'x', f: z0, a: x0, e: x1, dir: 1, ry: Math.PI },
      { ax: 'x', f: z1, a: x0, e: x1, dir: -1, ry: 0 },
      { ax: 'z', f: x0, a: z0 + depth, e: z1 - depth, dir: 1, ry: -Math.PI / 2 },
      { ax: 'z', f: x1, a: z0 + depth, e: z1 - depth, dir: -1, ry: Math.PI / 2 }
    ];
    sides.forEach((s, si) => {
      let cur = s.a;
      const alleyAt = (o.alley && si === alleySide) ? s.a + (s.e - s.a) * alleyPos : -1;
      while (cur < s.e - 0.5) {
        let w = rng.range(o.wMin, o.wMax);
        if (s.e - (cur + w) < o.wMin * 0.7) w = s.e - cur;
        if (alleyAt > 0 && cur < alleyAt && cur + w > alleyAt - 3) {
          // leave an alley gap
          const gapStart = alleyAt - 3;
          if (gapStart - cur > 4) w = gapStart - cur;
          else { cur = alleyAt + 3; b.secrets.push(s.ax === 'x' ? { x: alleyAt, z: s.f + s.dir * depth * 0.6 } : { x: s.f + s.dir * depth * 0.6, z: alleyAt }); continue; }
        }
        const h = rng.range(o.hMin, o.hMax) * (o.hScale || 1);
        const style = rng.pick(o.styles);
        const pal = o.pal[style] || PAL.shop;
        let bx0, bz0, bx1, bz1;
        const dd = depth - rng.range(0, o.depthVar || 0);
        if (s.ax === 'x') { bx0 = cur; bx1 = cur + w; if (s.dir > 0) { bz0 = s.f; bz1 = s.f + dd; } else { bz0 = s.f - dd; bz1 = s.f; } }
        else { bz0 = cur; bz1 = cur + w; if (s.dir > 0) { bx0 = s.f; bx1 = s.f + dd; } else { bx0 = s.f - dd; bx1 = s.f; } }
        const fh = style === STYLE.BRICK || style === STYLE.HOUSE ? 3.1 : style === STYLE.APT ? 3.0 : 3.6;
        const shopFront = (o.shops && (style === STYLE.SHOP || style === STYLE.OFFICE || style === STYLE.DECO || style === STYLE.BRICK)) || (style === STYLE.BRICK && rng.chance(0.22));
        const r = this._bld(b, bx0, bz0, bx1, bz1, h, style, rng.pick(pal), fh, style === STYLE.BRICK ? 2.6 : style === STYLE.APT ? 3.2 : 3.4, { gtype: shopFront ? 1 : 0 });
        this._rooftop(b, r, rng, h > 20 ? 'mid' : 'old');
        // street facade dressing: awnings, shop signs, stoops
        const fxn = Math.sin(s.ry), fzn = Math.cos(s.ry);
        const faceX = s.ax === 'x' ? (bx0 + bx1) / 2 : (s.dir > 0 ? bx0 : bx1);
        const faceZ = s.ax === 'x' ? (s.dir > 0 ? bz0 : bz1) : (bz0 + bz1) / 2;
        if (o.shops && (style === STYLE.SHOP || style === STYLE.OFFICE || style === STYLE.DECO) && w > 5) {
          const aw = w - 1.2;
          if (rng.chance(0.75)) this._det(b, 'box', faceX + fxn * 0.9, CURB_H + 3.05, faceZ + fzn * 0.9, s.ax === 'x' ? aw : 1.8, 0.12, s.ax === 'x' ? 1.8 : aw, rng.pick(PAL.awning), 0);
          if (rng.chance(0.6)) b.signs.push({ x: faceX + fxn * 0.08, y: CURB_H + 3.9, z: faceZ + fzn * 0.08, ry: s.ry, w: Math.min(aw * 0.8, 6), h: 0.9, ad: rng.int(0, 7) });
        }
        if (o.stoops && w > 4) this._det(b, 'box', faceX + fxn * 0.6, CURB_H + 0.25, faceZ + fzn * 0.6, s.ax === 'x' ? 2.2 : 1.2, 0.5, s.ax === 'x' ? 1.2 : 2.2, 0x8c8780, 0, true);
        if (o.roofBoards && h < 22 && rng.chance(0.12) && w > 8) this._billboard(b, faceX - fxn * 2, r.y0 + r.h + 3.6, faceZ - fzn * 2, s.ry, 7, 3.5, rng, r.y0 + r.h);
        this._dress(b, r, rng, { ax: s.ax, dir: s.dir, ry: s.ry, fx: fxn, fz: fzn, faceX, faceZ, w, shop: shopFront });
        cur += w;
      }
    });
    return depth;
  }
  _courtyard(b, rng, depth, kind) {
    const ix0 = b.x0 + depth + 1.5, iz0 = b.z0 + depth + 1.5, ix1 = b.x1 - depth - 1.5, iz1 = b.z1 - depth - 1.5;
    if (ix1 - ix0 < 6) return;
    const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
    b.secrets.push({ x: cx, z: cz });
    if (kind === 'green') {
      for (let i = 0; i < 6; i++) this._prop(b, 'tree', rng.range(ix0 + 1, ix1 - 1), rng.range(iz0 + 1, iz1 - 1), rng.range(0, 6), rng.range(0.8, 1.2));
      this._prop(b, 'bench', cx, cz + 2, 0); b.seats.push({ x: cx, z: cz + 2, ry: 0 });
    } else {
      for (let i = 0; i < 3; i++) this._prop(b, 'dumpster', rng.range(ix0 + 1.5, ix1 - 1.5), rng.range(iz0 + 1.5, iz1 - 1.5), rng.pick([0, Math.PI / 2]));
      if (rng.chance(0.6)) b.parked.push({ x: cx + rng.range(-3, 3), z: cz, h: rng.range(0, 6.28), cls: null });
    }
  }
  _sidewalk(b, rng, o) {
    // lamps (positions fixed so the ground shader can light them)
    // (only along roads that exist: a superblock's inner sides have no street to light)
    const LSIDE = [2, 3, 0, 1];
    blockLamps(b.bx, b.bz).forEach(([x, z, ry], k) => { if (RoadNet.sideOpen(b.bx, b.bz, LSIDE[k % 4])) this._prop(b, 'lamp', x, z, ry); });
    // traffic light poles at the four block corners (each faces both axes)
    const cs = [[b.bx * P + 6.7, b.bz * P + 6.7, 0, 0], [(b.bx + 1) * P - 6.7, b.bz * P + 6.7, 1, 0], [b.bx * P + 6.7, (b.bz + 1) * P - 6.7, 0, 1], [(b.bx + 1) * P - 6.7, (b.bz + 1) * P - 6.7, 1, 1]];
    for (const [x, z, ex, ez] of cs) {
      // pole offset signs relative to its node; each corner serves exactly one approach
      const ox = ex ? -1 : 1, oz = ez ? -1 : 1;
      const ns = ox === oz;
      const ry = ns ? (oz > 0 ? 0 : Math.PI) : (ox > 0 ? Math.PI / 2 : -Math.PI / 2);
      // a signal only where roads actually meet, on an approach that still exists
      if (!RoadNet.isJunction(b.bx + ex, b.bz + ez) || !(ns ? RoadNet.segOpen(0, b.bx + ex, b.bz) : RoadNet.segOpen(1, b.bz + ez, b.bx))) continue;
      const p = this._prop(b, 'tlight', x, z, ry);
      p.node = [b.bx + ex, b.bz + ez]; p.axis = ns ? 0 : 1;
    }
    const sides = [
      { n: [0, -1], along: [1, 0], o: [b.bx * P, b.bz * P], ry: Math.PI },
      { n: [0, 1], along: [1, 0], o: [b.bx * P, (b.bz + 1) * P], ry: 0 },
      { n: [-1, 0], along: [0, 1], o: [b.bx * P, b.bz * P], ry: -Math.PI / 2 },
      { n: [1, 0], along: [0, 1], o: [(b.bx + 1) * P, b.bz * P], ry: Math.PI / 2 }
    ];
    const slots = [12, 20, 24, 28, 32, 36, 44, 48, 52, 56, 60, 68];
    sides.forEach((s, si) => {
      if (!RoadNet.sideOpen(b.bx, b.bz, si)) return;
      let hyd = false;
      // point at lateral distance `lat` from the road centreline, inward (toward the block)
      const at = (along, lat) => {
        const inward = [-s.n[0], -s.n[1]];
        const baseX = s.o[0] + s.along[0] * along + (s.n[0] !== 0 ? 0 : 0), baseZ = s.o[1] + s.along[1] * along;
        return [baseX + inward[0] * lat, baseZ + inward[1] * lat];
      };
      for (const sl of slots) {
        const r = rng.next();
        if (o.trees && r < o.trees && sl % 8 === 4) { const [x, z] = at(sl, 7.3); this._prop(b, o.palms ? 'pine' : 'tree', x, z, rng.range(0, 6), rng.range(0.85, 1.15)); continue; }
        if (!hyd && r > 0.9) { const [x, z] = at(sl, 6.55); this._prop(b, 'hydrant', x, z, s.ry); hyd = true; continue; }
        if (r > 0.8) { const [x, z] = at(sl, 6.9); this._prop(b, 'bin', x, z, 0); continue; }
        if (o.benches && r > 0.7 && r < 0.78) { const [x, z] = at(sl, 9.45); this._prop(b, 'bench', x, z, s.ry + Math.PI); b.seats.push({ x, z, ry: s.ry + Math.PI }); continue; }
        if (o.news && r > 0.66 && r < 0.7) { const [x, z] = at(sl, 9.4); this._prop(b, 'newsbox', x, z, s.ry); continue; }
      }
      if (o.busStop && si === rng.int(0, 3)) { const [x, z] = at(30, 9.1); this._prop(b, 'busstop', x, z, s.ry); b.seats.push({ x, z, ry: s.ry }); }
      // curbside parking (in the shoulder of the adjacent road)
      const roadIdx = si === 0 ? b.bz : si === 1 ? b.bz + 1 : si === 2 ? b.bx : b.bx + 1;
      const nPark = isBoulevard(roadIdx) ? 0 : (o.park || 0);
      this._streetFurniture(b, rng, s, si, at, o);
      for (let k = 0; k < 4; k++) {
        if (rng.next() > nPark) continue;
        const along = 18 + k * 13 + rng.range(-1, 1);
        const [x, z] = at(along, 4.85);
        b.parked.push({ x, z, h: headingFromRightTo(-s.n[0], -s.n[1]), cls: null, curb: true });
      }
    });
  }
  _genBlock(b) {
    const rng = new RNG(b.i * 7919 + 1337);
    const W = b.x1 - b.x0;
    const t = b.special === 'hospital' || b.special === 'police' ? 'S' : b.t;
    const dist = Math.hypot(b.bx - 5.5, b.bz - 5);
    const lm = LANDMARK_BLOCKS[b.bx + ',' + b.bz];
    if (b.superblock) {
      const sb = b.superblock;
      if (b.bx === sb.bx0 && b.bz === sb.bz0) { this._sbRun(sb, rng); }
      b.name = sb.name || DNAME[b.t] || 'Port Valen';
      return;
    }
    if (lm) { this[lm.gen](b, rng); b.name = lm.name; b.landmark = lm; return; }
    switch (t) {
      case 'D': {
        this._sidewalk(b, rng, { trees: 0.5, benches: true, news: true, busStop: rng.chance(0.4), park: 0.15 });
        const plan = rng.int(0, 2);
        const hBase = 55 + 95 * clamp(1 - dist / 4, 0, 1);
        const lots = plan === 0 ? [[0, 0, 1, 1]] : plan === 1 ? (rng.chance(0.5) ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 1]]) : [[0, 0, .5, .5], [.5, 0, 1, .5], [0, .5, .5, 1], [.5, .5, 1, 1]];
        for (const L of lots) {
          const lx0 = b.x0 + L[0] * W, lz0 = b.z0 + L[1] * W, lx1 = b.x0 + L[2] * W, lz1 = b.z0 + L[3] * W;
          const lw = lx1 - lx0;
          if (plan === 2 && rng.chance(0.18)) { // pocket plaza
            const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
            for (let i = 0; i < 4; i++) this._prop(b, 'planter', cx + (i % 2 ? 5 : -5), cz + (i < 2 ? 5 : -5), 0);
            this._det(b, 'cyl', cx, CURB_H + 0.4, cz, 3, 0.8, 0x8d8a84, null, { x: cx, z: cz, r: 3, y0: 0, y1: 0.9, kind: 'det' });
            b.water.push({ x: cx, z: cz, r: 2.6, y: CURB_H + 0.82 });
            b.fx.push({ type: 'fountain', x: cx, y: CURB_H + 0.9, z: cz });
            b.secrets.push({ x: cx + 4, z: cz - 4 });
            continue;
          }
          const inset = rng.range(1.5, 4);
          const style = rng.pick([STYLE.GLASS, STYLE.GLASS, STYLE.OFFICE, STYLE.DECO]);
          const col = rng.pick(style === STYLE.GLASS ? PAL.glass : style === STYLE.DECO ? PAL.deco : PAL.office);
          const h = hBase * rng.range(0.55, 1.1) * (plan === 2 ? 0.75 : 1);
          let x0 = lx0 + inset, z0 = lz0 + inset, x1 = lx1 - inset, z1 = lz1 - inset;
          if (rng.chance(0.45) && lw > 25) { // podium
            const pod = this._bld(b, lx0 + 0.5, lz0 + 0.5, lx1 - 0.5, lz1 - 0.5, rng.range(7, 12), STYLE.SHOP, rng.pick(PAL.shop), 4.2, 4);
            this._rooftop(b, pod, rng, 'mid');
            x0 += 3; z0 += 3; x1 -= 3; z1 -= 3;
            const t1 = this._bld(b, x0, z0, x1, z1, h, style, col, 3.6, 3.2);
            t1.noCol = true; this._towerTiers(b, t1, rng);
            pod.gtype = 1; this._dressBox(b, pod, rng, 'podium');
          } else {
            const t1 = this._bld(b, x0, z0, x1, z1, h, style, col, 3.6, 3.2, { gtype: 2 });
            this._towerTiers(b, t1, rng);
            this._dressBox(b, t1, rng, 'tower');
            // plaza dressing in the inset ring
            if (inset > 2.5) { this._prop(b, 'planter', x0 - 1.2, (z0 + z1) / 2, 0); this._prop(b, 'bench', (x0 + x1) / 2, z1 + 1.3, 0); }
          }
        }
        break;
      }
      case 'C': {
        this._sidewalk(b, rng, { trees: 0.4, benches: true, news: true, busStop: rng.chance(0.35), park: 0.45 });
        const depth = this._rows(b, rng, { depth: rng.range(15, 20), depthVar: 3, wMin: 9, wMax: 20, hMin: 9, hMax: 34, hScale: 1 + clamp(1 - dist / 6, 0, 1) * 0.6, styles: [STYLE.SHOP, STYLE.SHOP, STYLE.OFFICE, STYLE.DECO, STYLE.BRICK, STYLE.APT], pal: { [STYLE.SHOP]: PAL.shop, [STYLE.OFFICE]: PAL.office, [STYLE.DECO]: PAL.deco, [STYLE.BRICK]: PAL.brick, [STYLE.APT]: PAL.apt }, alley: true, shops: true, roofBoards: true });
        this._courtyard(b, rng, depth, 'service');
        break;
      }
      case 'R': {
        this._sidewalk(b, rng, { trees: 0.6, benches: false, park: 0.7 });
        const depth = this._rows(b, rng, { depth: rng.range(11, 14), wMin: 6, wMax: 10, hMin: 8, hMax: 16, styles: [STYLE.BRICK, STYLE.BRICK, STYLE.SHOP, STYLE.HOUSE, STYLE.APT], pal: { [STYLE.BRICK]: PAL.brick, [STYLE.SHOP]: PAL.shop, [STYLE.HOUSE]: PAL.house, [STYLE.APT]: PAL.apt }, alley: rng.chance(0.6), stoops: true, shops: false });
        this._courtyard(b, rng, depth, 'green');
        break;
      }
      case 'H': this._genSuburb(b, rng); break;
      case 'W': this._genWealthy(b, rng); break;
      case 'I': this._genIndustrial(b, rng); break;
      case 'P': this._genPark(b, rng); break;
      case 'K': this._genParking(b, rng); break;
      case 'X': this._genConstruction(b, rng); break;
      case 'S': this._genSpecial(b, rng); break;
    }
    b.name = DNAME[b.t] || 'Port Valen';
  }
  _towerTiers(b, base, rng) {
    let cur = base, top = base.y0 + base.h;
    const tiers = rng.int(0, 2);
    for (let i = 0; i < tiers; i++) {
      const ins = rng.range(2.5, 5);
      const w = cur.x1 - cur.x0 - ins * 2, d = cur.z1 - cur.z0 - ins * 2;
      if (w < 10 || d < 10) break;
      const h = rng.range(8, 30);
      const r = this._bld(b, cur.x0 + ins, cur.z0 + ins, cur.x1 - ins, cur.z1 - ins, h, cur.style, '#' + cur.color.getHexString(), cur.fh, cur.bayX, { y0: top, oy: CURB_H, noCol: true, far: false });
      r.color = cur.color.clone();
      this._rooftop(b, cur, rng, 'mid');
      cur = r; top = r.y0 + r.h;
    }
    base.totalH = top - CURB_H;
    this._rooftop(b, cur, rng, 'tower');
    if (rng.chance(0.4)) b.fx.push({ type: 'crown', x0: cur.x0, z0: cur.z0, x1: cur.x1, z1: cur.z1, y: top });
  }
  _genHouses(b, rng) {
    this._sidewalk(b, rng, { trees: 0.7, park: 0.35 });
    const W = b.x1 - b.x0;
    const n = rng.chance(0.5) ? 3 : 2;
    const lot = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const lx0 = b.x0 + i * lot, lz0 = b.z0 + j * lot;
      const cx = lx0 + lot / 2, cz = lz0 + lot / 2;
      const isEdgeI = i === 0 || i === n - 1, isEdgeJ = j === 0 || j === n - 1;
      if (!isEdgeI && !isEdgeJ) { // middle lot: garden / pool
        for (let k = 0; k < 4; k++) this._prop(b, rng.chance(0.5) ? 'tree' : 'bush', cx + rng.range(-6, 6), cz + rng.range(-6, 6), rng.range(0, 6), rng.range(0.8, 1.2));
        b.secrets.push({ x: cx, z: cz });
        continue;
      }
      // face the nearest street
      const face = j === 0 ? 0 : j === n - 1 ? 1 : i === 0 ? 2 : 3;
      const hw = rng.range(8, Math.min(12, lot - 6)), hd = rng.range(7, Math.min(10, lot - 7));
      const floors = rng.chance(0.55) ? 2 : 1;
      const hx = cx + rng.range(-1, 1), hz = cz + rng.range(-1, 1);
      const rot = face >= 2;
      const w = rot ? hd : hw, d = rot ? hw : hd;
      const r = this._bld(b, hx - w / 2, hz - d / 2, hx + w / 2, hz + d / 2, floors * 3.0, STYLE.HOUSE, rng.pick(PAL.house), 3.0, 2.8, { roof: 'gable', roofColor: rng.pick(PAL.roof) });
      r.ridgeX = !rot;
      // chimney
      if (rng.chance(0.5)) this._det(b, 'box', hx + (rot ? 0 : w * 0.3), r.y0 + r.h + 1.6, hz + (rot ? d * 0.3 : 0), 0.7, 2.4, 0.7, 0x7a4a3a);
      // fence along the street edge with a gap
      const fc = C(rng.pick([0xf0eee8, 0x6b5a4a, 0x3a3d40]));
      const fy = CURB_H + 0.5;
      if (face <= 1) {
        const fz = face === 0 ? lz0 + 0.3 : lz0 + lot - 0.3;
        this._det(b, 'box', lx0 + lot * 0.25 - 0.8, fy, fz, lot * 0.5 - 3.2, 1, 0.08, fc, 0, true);
        this._det(b, 'box', lx0 + lot * 0.75 + 0.8, fy, fz, lot * 0.5 - 3.2, 1, 0.08, fc, 0, true);
      } else {
        const fx = face === 2 ? lx0 + 0.3 : lx0 + lot - 0.3;
        this._det(b, 'box', fx, fy, lz0 + lot * 0.25 - 0.8, 0.08, 1, lot * 0.5 - 3.2, fc, 0, true);
        this._det(b, 'box', fx, fy, lz0 + lot * 0.75 + 0.8, 0.08, 1, lot * 0.5 - 3.2, fc, 0, true);
      }
      for (let k = 0; k < 2; k++) this._prop(b, rng.chance(0.6) ? 'tree' : 'bush', lx0 + rng.range(1.5, lot - 1.5), lz0 + rng.range(1.5, lot - 1.5), rng.range(0, 6), rng.range(0.8, 1.15));
      this._driveway(b, rng, face, lx0, lz0, lot, hx, hz, w, d);
      if (b.special === 'safehouse' && i === 0 && j === n - 1) {
        b.safehouse = { x: hx, z: lz0 + lot + 1.5, garage: { x: hx + 8, z: lz0 + lot + 5.15, h: -Math.PI / 2 } };
      }
    }
    if (b.special === 'safehouse' && !b.safehouse) b.safehouse = { x: b.x0 + 8, z: b.z1 + 1.5, garage: { x: b.x0 + 16, z: b.z1 + 5.15, h: -Math.PI / 2 } };
  }
  _genIndustrial(b, rng) {
    if (b.special === 'chopshop') { this._genChopShop(b, rng); return; }
    this._sidewalk(b, rng, { trees: 0, park: 0.2 });
    const plan = rng.int(0, 2);
    const fenceC = C(0x5c6166);
    // perimeter chain-link fence with a gate on one side
    const gate = rng.int(0, 3);
    const fy = CURB_H + 1.1;
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) return;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      this._det(b, 'box', cx, fy, cz, alongX ? len : 0.06, 2.2, alongX ? 0.06 : len, fenceC, 0, true);
      this._det(b, 'box', cx, CURB_H + 2.25, cz, alongX ? len : 0.1, 0.08, alongX ? 0.1 : len, C(0x3a3d40));
    };
    const e = 0.6;
    const gx = (b.x0 + b.x1) / 2, gz = (b.z0 + b.z1) / 2;
    if (gate === 0) { fence(b.x0 + e, b.z0 + e, gx - 4, b.z0 + e); fence(gx + 4, b.z0 + e, b.x1 - e, b.z0 + e); } else fence(b.x0 + e, b.z0 + e, b.x1 - e, b.z0 + e);
    if (gate === 1) { fence(b.x0 + e, b.z1 - e, gx - 4, b.z1 - e); fence(gx + 4, b.z1 - e, b.x1 - e, b.z1 - e); } else fence(b.x0 + e, b.z1 - e, b.x1 - e, b.z1 - e);
    if (gate === 2) { fence(b.x0 + e, b.z0 + e, b.x0 + e, gz - 4); fence(b.x0 + e, gz + 4, b.x0 + e, b.z1 - e); } else fence(b.x0 + e, b.z0 + e, b.x0 + e, b.z1 - e);
    if (gate === 3) { fence(b.x1 - e, b.z0 + e, b.x1 - e, gz - 4); fence(b.x1 - e, gz + 4, b.x1 - e, b.z1 - e); } else fence(b.x1 - e, b.z0 + e, b.x1 - e, b.z1 - e);
    b.gate = gate;
    const wh = (x0, z0, x1, z1, h) => {
      const ware = rng.chance(0.3);
      const r = this._bld(b, x0, z0, x1, z1, h, ware ? STYLE.WARE : STYLE.IND, rng.pick(ware ? PAL.brick : PAL.ind), 5, 4.5, { gtype: 3 });
      this._dressBox(b, r, rng, 'warehouse');
      this._rooftop(b, r, rng, 'ind');
      // roll-up doors
      const n = Math.floor((x1 - x0) / 8);
      for (let k = 0; k < n; k++) this._det(b, 'box', x0 + 4 + k * 8, CURB_H + 2.2, z1 + 0.06, 4, 4.4, 0.1, 0x55595e);
      return r;
    };
    if (plan === 0) {
      wh(b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z0 + 28, rng.range(9, 14));
      this._containers(b, rng, b.x0 + 5, b.z0 + 36, b.x1 - 5, b.z1 - 5);
    } else if (plan === 1) {
      wh(b.x0 + 4, b.z0 + 4, b.x0 + 30, b.z1 - 20, rng.range(8, 12));
      for (let k = 0; k < 3; k++) {
        const tx = b.x0 + 40 + (k % 2) * 10, tz = b.z0 + 10 + k * 14, r = rng.range(3.5, 4.5), h = rng.range(8, 13);
        this._det(b, 'cyl', tx, CURB_H + h / 2, tz, r, h, rng.pick([0xc8c8c0, 0xaab4bb, 0x9ea38a]), null, { x: tx, z: tz, r, y0: 0, y1: h + 1, kind: 'det' });
        this._det(b, 'cyl', tx, CURB_H + h + 0.3, tz, r * 0.92, 0.6, 0x8a8f94);
      }
      this._containers(b, rng, b.x0 + 34, b.z1 - 18, b.x1 - 5, b.z1 - 5);
    } else {
      wh(b.x0 + 4, b.z0 + 4, b.x0 + 26, b.z0 + 26, rng.range(10, 15));
      wh(b.x0 + 32, b.z0 + 32, b.x1 - 4, b.z1 - 4, rng.range(7, 11));
      const cx = b.x1 - 10, cz = b.z0 + 10, ch = rng.range(22, 32);
      this._det(b, 'cyl', cx, CURB_H + ch / 2, cz, 1.4, ch, 0x8a5a48, null, { x: cx, z: cz, r: 1.5, y0: 0, y1: ch, kind: 'det' });
      for (let k = 1; k < 4; k++) this._det(b, 'cyl', cx, CURB_H + ch * k / 4, cz, 1.5, 0.4, 0xd8d8d8);
      b.fx.push({ type: 'smoke', x: cx, y: CURB_H + ch + 0.5, z: cz });
      this._containers(b, rng, b.x0 + 5, b.z0 + 32, b.x0 + 26, b.z1 - 5);
    }
    // forklift-ish props and pallets
    for (let k = 0; k < 4; k++) this._prop(b, rng.chance(0.5) ? 'pallet' : 'barrel', rng.range(b.x0 + 3, b.x1 - 3), rng.range(b.z0 + 30, b.z1 - 3), rng.range(0, 3));
    if (b.bx === N - 1) { // dock cranes on the harbour edge
      const x = CITY + 12;
      const z = b.z0 + 30;
      const yc = C(0xd8a227);
      for (const dz of [-6, 6]) for (const dx of [-4, 4]) this._det(b, 'box', x + dx, 14, z + dz, 0.9, 28, 0.9, yc, 0, true);
      this._det(b, 'box', x + 8, 28.5, z, 40, 2, 3, yc);
      this._det(b, 'box', x + 1, 30.5, z, 5, 3, 4, C(0xe8e0d0));
      this._det(b, 'box', x - 9, 27, z, 6, 3, 5, C(0x55595e));
    }
    b.secrets.push({ x: (b.x0 + b.x1) / 2 + 12, z: b.z1 - 8 });
    if (b.special === 'chopshop') {
      b.chopshop = { x: (b.x0 + b.x1) / 2, z: b.z0 - 4.5 };
      b.signs.push({ text: 'CHOP SHOP', x: b.x0 + 15, y: CURB_H + 7, z: b.z0 + 4 - 0.1, ry: Math.PI, w: 9, h: 1.6, bg: '#1b1b1b', fg: '#ffb547' });
    }
  }
  // Saltworks Chop Shop: a fenced yard off the north street and a drive-in shed. The roll door
  // goes up for any car you could sell (not one you own); park inside to get an offer.
  _genChopShop(b, rng) {
    this._sidewalk(b, rng, { trees: 0, park: 0.1 });
    const cx = (b.x0 + b.x1) / 2, z0 = b.z0, e = 0.6, fc = C(0x5c6166);
    this._road([[cx, z0 - 4.6], [cx, z0 + 3]], 7.4);
    this._rectS(b.x0 + 2, z0 + 1, b.x1 - 2, b.z1 - 2, 'concrete');
    this._fence(b, b.x0 + e, z0 + e, cx - 4.4, z0 + e, 'chain'); this._fence(b, cx + 4.4, z0 + e, b.x1 - e, z0 + e, 'chain');
    this._fence(b, b.x0 + e, b.z1 - e, b.x1 - e, b.z1 - e, 'chain'); this._fence(b, b.x0 + e, z0 + e, b.x0 + e, b.z1 - e, 'chain'); this._fence(b, b.x1 - e, z0 + e, b.x1 - e, b.z1 - e, 'chain');
    void fc;
    // the shed: walls and roof as pieces so a car fits inside; open north front with a roll door
    const sx0 = cx - 7, sx1 = cx + 7, sz0 = z0 + 8, sz1 = z0 + 26, H = 6, wc = C(0x7d6f63);
    const wall = (x, z, sx, sz) => this._det(b, 'box', x, CURB_H + H / 2, z, sx, H, sz, wc, 0, true);
    wall(sx0 + 0.2, (sz0 + sz1) / 2, 0.4, sz1 - sz0); wall(sx1 - 0.2, (sz0 + sz1) / 2, 0.4, sz1 - sz0); wall(cx, sz1 - 0.2, sx1 - sx0, 0.4);
    wall(sx0 + 2.3, sz0 + 0.2, 4.2, 0.4); wall(sx1 - 2.3, sz0 + 0.2, 4.2, 0.4);
    this._det(b, 'box', cx, CURB_H + H - 0.6, sz0 + 0.2, 5.6, 1.2, 0.4, wc);
    this._det(b, 'box', cx, CURB_H + H + 0.15, (sz0 + sz1) / 2, sx1 - sx0 + 0.6, 0.3, sz1 - sz0 + 0.6, C(0x55595e));
    this._door(b, { id: 'chopDoor', x: cx, z: sz0 - 0.05, w: 5.4, h: H - 1.3, axis: 'x', face: 0, y: CURB_H, color: 0x8a6a3a, block: b.i, kind: 'custom', allow: g => g.player.state !== 'vehicle' || !(g.player.vehicle.owned || g.player.vehicle.garageUid) });
    b.signs.push({ text: 'SALTWORKS CHOP SHOP', x: cx, y: CURB_H + H + 0.9, z: sz0 - 0.3, ry: Math.PI, w: 11, h: 1.5, bg: '#1b1b1b', fg: '#ffb547' });
    b.signs.push({ text: 'NO QUESTIONS · CASH ONLY', x: cx, y: CURB_H + 1.6, z: z0 + e - 0.08, ry: Math.PI, w: 5, h: 0.7, bg: '#ffb547', fg: '#1b1b1b' });
    // inside: a lift, a stripped shell, tyre stacks, a workbench, hanging lamps
    for (const s2 of [-1, 1]) this._det(b, 'box', cx + s2 * 2.4, CURB_H + 1.6, sz1 - 6, 0.35, 3.2, 0.35, C(0xd23a2a), 0, true);
    this._det(b, 'box', sx0 + 1.2, CURB_H + 0.45, sz1 - 3, 1.6, 0.9, 4.4, C(0x5a6a7a), 0, true);
    for (let k = 0; k < 4; k++) this._det(b, 'cyl', sx1 - 1.2, CURB_H + 0.35 + k * 0.3, sz0 + 3 + (k % 2) * 0.2, 0.42, 0.28, 0x161618);
    this._det(b, 'box', sx1 - 1.0, CURB_H + 0.45, sz1 - 4, 1.4, 0.9, 3, C(0x6a4a32), 0, true);
    for (let k = 0; k < 3; k++) b.fx.push({ type: 'rooflamp', x: cx, y: CURB_H + H - 0.5, z: sz0 + 4 + k * 6 });
    // the yard: wrecks waiting to be stripped, an office, junk
    const off = this._bld(b, b.x0 + 3, z0 + 30, b.x0 + 15, z0 + 40, 3.4, STYLE.IND, 0x8a7a6a, 3.4, 3, { exactH: true }); off.far = false;
    for (let k = 0; k < 5; k++) { const wx = b.x0 + 20 + k * 6.5, wz = b.z1 - 8; this._det(b, 'box', wx, CURB_H + 0.6, wz, 1.9, 1.0, 4.3, C(rng.pick([0x5a3a2a, 0x3a4a5a, 0x6a6a5a, 0x2a2a2a])), 0, true); this._det(b, 'box', wx, CURB_H + 1.25, wz + 0.3, 1.6, 0.5, 2.0, C(0x2a2d33)); }
    for (let k = 0; k < 6; k++) this._prop(b, k % 2 ? 'barrel' : 'pallet', b.x1 - 6 - rng.range(0, 6), z0 + 30 + k * 2.6, rng.range(0, 3));
    b.chopshop = { x: cx, z: sz0 + 8 };
    b.secrets.push({ x: b.x1 - 4, z: b.z1 - 4 });
  }
  _containers(b, rng, x0, z0, x1, z1) {
    const n = rng.int(3, 7);
    for (let i = 0; i < n; i++) {
      const rot = rng.chance(0.5);
      const w = rot ? 2.5 : 6.1, d = rot ? 6.1 : 2.5;
      const x = rng.range(x0 + w / 2, Math.max(x0 + w / 2, x1 - w / 2)), z = rng.range(z0 + d / 2, Math.max(z0 + d / 2, z1 - d / 2));
      const stack = rng.int(1, 3);
      for (let s = 0; s < stack; s++) {
        this._det(b, 'box', x, CURB_H + 1.3 + s * 2.6, z, w, 2.6, d, rng.pick(PAL.container), 0, s === 0 ? { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: CURB_H + 2.6 * stack, kind: 'det' } : null);
      }
    }
  }
  _genPark(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, benches: false, park: 0.3 });
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const onPath = (x, z) => { const lx = x - cx, lz = z - cz; const pa = Math.min(Math.abs(lx), Math.abs(lz), Math.abs(Math.hypot(lx, lz) - 19), Math.abs(Math.abs(lx) - Math.abs(lz)) * 0.7071); return pa < 2.6 || Math.hypot(lx, lz) < 8.5; };
    let placed = 0;
    for (let i = 0; i < 70 && placed < 34; i++) {
      const x = rng.range(b.x0 + 2, b.x1 - 2), z = rng.range(b.z0 + 2, b.z1 - 2);
      if (onPath(x, z)) continue;
      this._prop(b, rng.chance(0.75) ? 'tree' : (rng.chance(0.5) ? 'pine' : 'bush'), x, z, rng.range(0, 6), rng.range(0.85, 1.35)); placed++;
    }
    // fountain
    this._det(b, 'cyl', cx, CURB_H + 0.35, cz, 6.2, 0.7, 0x9a958c, null, { x: cx, z: cz, r: 6.2, y0: 0, y1: 0.75, kind: 'det' });
    this._det(b, 'cyl', cx, CURB_H + 1.2, cz, 0.7, 2.4, 0x9a958c);
    this._det(b, 'cyl', cx, CURB_H + 2.4, cz, 1.8, 0.25, 0x9a958c);
    b.water.push({ x: cx, z: cz, r: 5.8, y: CURB_H + 0.62 });
    b.fx.push({ type: 'fountain', x: cx, y: CURB_H + 2.6, z: cz });
    // benches and lamps along the ring path
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + Math.PI / 8;
      const bx = cx + Math.cos(a) * 21.4, bz = cz + Math.sin(a) * 21.4;
      this._prop(b, 'bench', bx, bz, Math.atan2(cx - bx, cz - bz));
      b.seats.push({ x: bx, z: bz, ry: Math.atan2(cx - bx, cz - bz) });
      const lx = cx + Math.cos(a + Math.PI / 8) * 21.4, lz = cz + Math.sin(a + Math.PI / 8) * 21.4;
      this._prop(b, 'parklamp', lx, lz, 0);
    }
    b.secrets.push({ x: b.x0 + 5, z: b.z0 + 5 }, { x: b.x1 - 5, z: b.z1 - 5 });
  }
  _genParking(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, park: 0.2 });
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    // booth
    const r = this._bld(b, cx + 22, cz + 24, cx + 26, cz + 28, 3, STYLE.SHOP, 0xd9cbb0, 3, 2);
    r.far = false;
    this._det(b, 'box', cx + 24, CURB_H + 3.15, cz + 26, 5, 0.25, 5, 0x3d4247);
    // rows (match ground shader)
    const rows = [[-24.2, 0], [-18.6, Math.PI], [-5.4, 0], [0.2, Math.PI], [13.4, 0], [19.0, Math.PI]];
    for (const [rz, ry] of rows) for (let k = 0; k < 18; k++) {
      const x = cx - 26 + 1.4 + k * 2.8, z = cz + rz;
      if (rng.chance(0.38)) b.parked.push({ x, z, h: ry, cls: null });
      else if (rng.chance(0.08)) b.secrets.push({ x, z });
    }
    for (const [lx, lz] of [[-14, -12], [14, -12], [-14, 7], [14, 7]]) this._prop(b, 'lotlamp', cx + lx, cz + lz, 0);
    if (rng.chance(0.7)) this._billboard(b, b.x0 + 3, 9, cz, -Math.PI / 2, 9, 4.5, rng, CURB_H);
  }
  _genConstruction(b, rng) {
    this._sidewalk(b, rng, { trees: 0, park: 0.1 });
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    // plywood hoarding
    const hc = C(0x6f6a5c), e = 0.6, hy = CURB_H + 1.25;
    const L = b.x1 - b.x0 - e * 2;
    this._det(b, 'box', cx, hy, b.z0 + e, L, 2.5, 0.15, hc, 0, true);
    this._det(b, 'box', cx - L / 4 - 3, hy, b.z1 - e, L / 2 - 6, 2.5, 0.15, hc, 0, true);
    this._det(b, 'box', cx + L / 4 + 3, hy, b.z1 - e, L / 2 - 6, 2.5, 0.15, hc, 0, true);
    this._det(b, 'box', b.x0 + e, hy, cz, 0.15, 2.5, L, hc, 0, true);
    this._det(b, 'box', b.x1 - e, hy, cz, 0.15, 2.5, L, hc, 0, true);
    b.signs.push({ text: 'DANGER · HARD HAT AREA', x: cx - 10, y: CURB_H + 1.5, z: b.z0 + e - 0.1, ry: Math.PI, w: 8, h: 1.1, bg: '#f2c230', fg: '#1b1b1b' });
    // skeleton tower
    const fx0 = cx - 14, fz0 = cz - 18, fw = 24, fd = 20;
    const floors = rng.int(5, 9), fh = 3.6;
    const conc = C(0xa8a49c);
    for (let f = 0; f <= floors; f++) {
      const partial = f === floors ? 0.5 : 1;
      this._det(b, 'box', fx0 + fw * partial / 2, CURB_H + f * fh + 0.15, fz0 + fd / 2, fw * partial, 0.3, fd, conc);
    }
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
      const x = fx0 + i * fw / 4, z = fz0 + j * fd / 3;
      const hgt = (i <= 2 ? floors : floors - 1) * fh;
      this._det(b, 'box', x, CURB_H + hgt / 2, z, 0.6, hgt, 0.6, conc, 0, { x, z, r: 0.45, y0: 0, y1: hgt, kind: 'det' });
    }
    // scaffolding on one face
    const sc = C(0x9aa0a8);
    for (let k = 0; k <= 6; k++) this._det(b, 'box', fx0 + k * fw / 6, CURB_H + floors * fh / 2, fz0 - 1.4, 0.08, floors * fh, 0.08, sc);
    for (let f = 1; f <= floors; f++) this._det(b, 'box', fx0 + fw / 2, CURB_H + f * fh, fz0 - 1.4, fw, 0.08, 1.2, C(0x8a6a3a));
    // tower crane
    const kx = cx + 18, kz = cz + 14, kh = 52 + rng.range(0, 14);
    const yc = C(0xe0b31e);
    this._det(b, 'box', kx, CURB_H + 0.6, kz, 5, 1.2, 5, 0x6a6a6a, 0, true);
    this._det(b, 'box', kx, CURB_H + kh / 2, kz, 1.6, kh, 1.6, yc, 0, { x: kx, z: kz, r: 1.2, y0: 0, y1: kh, kind: 'det' });
    const jr = rng.range(0, Math.PI * 2);
    const jx = Math.sin(jr), jz = Math.cos(jr);
    this._det(b, 'box', kx + jx * 16, CURB_H + kh + 1, kz + jz * 16, 1.2, 1.2, 48, yc, jr);
    this._det(b, 'box', kx - jx * 7, CURB_H + kh + 0.4, kz - jz * 7, 2.4, 2.2, 3.4, C(0x7a7a7a), jr);
    this._det(b, 'box', kx + jx * 1.5, CURB_H + kh - 1.2, kz + jz * 1.5, 2, 2, 2, C(0xeae4d4), jr);
    this._det(b, 'box', kx, CURB_H + kh + 4, kz, 0.6, 6, 0.6, yc);
    b.fx.push({ type: 'beacon', x: kx + jx * 39, y: CURB_H + kh + 2, z: kz + jz * 39 }, { type: 'beacon', x: kx, y: CURB_H + kh + 7, z: kz });
    // site cabins, piles, barriers
    for (let k = 0; k < 2; k++) this._det(b, 'box', b.x0 + 6 + k * 7, CURB_H + 1.3, b.z1 - 6, 6, 2.6, 2.5, k ? 0x2e6fb5 : 0xe0e0d8, 0, true);
    this._det(b, 'box', cx - 18, CURB_H + 0.6, cz + 16, 5, 1.2, 3, 0x8a6a3a, 0, true);
    for (let k = 0; k < 8; k++) this._prop(b, 'cone', cx - 8 + k * 2.2, b.z1 - 3, 0);
    for (let k = 0; k < 3; k++) this._prop(b, 'barrier', cx + 6 + k * 3.2, b.z1 - 4.5, 0);
    b.secrets.push({ x: fx0 + 4, z: fz0 + 4 }, { x: cx - 18, z: cz + 20 });
  }
  _genSpecial(b, rng) {
    this._sidewalk(b, rng, { trees: 0.4, benches: true, park: 0.1 });
    const isH = b.special === 'hospital';
    const col = isH ? 0xe8ecef : 0x5a6f8c;
    const main = this._bld(b, b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z0 + 34, isH ? 30 : 18, isH ? STYLE.OFFICE : STYLE.DECO, col, 3.6, 3.4);
    this._rooftop(b, main, rng, 'tower');
    const wing = this._bld(b, b.x0 + 4, b.z0 + 34, b.x0 + 24, b.z1 - 4, isH ? 14 : 10, isH ? STYLE.OFFICE : STYLE.DECO, col, 3.6, 3.4);
    this._rooftop(b, wing, rng, 'mid');
    const fx = b.x0 + 42, fz = b.z1 + 2.2;
    if (isH) {
      b.signs.push({ text: '✚ ST. ALDA HOSPITAL', x: (b.x0 + b.x1) / 2, y: CURB_H + 27, z: b.z0 + 4 - 0.12, ry: Math.PI, w: 18, h: 2.4, bg: '#f4f6f8', fg: '#d02a3a' });
      b.signs.push({ text: 'EMERGENCY', x: b.x0 + 40, y: CURB_H + 4.2, z: b.z0 + 34 + 0.12, ry: 0, w: 8, h: 1.3, bg: '#d02a3a', fg: '#ffffff' });
      this._det(b, 'box', b.x0 + 40, CURB_H + 3.5, b.z0 + 37, 10, 0.3, 6, 0xd02a3a);
      for (const dx of [-4.6, 4.6]) this._det(b, 'box', b.x0 + 40 + dx, CURB_H + 1.75, b.z0 + 39.6, 0.3, 3.5, 0.3, 0xd0d0d0, 0, true);
      b.respawn = { x: b.x0 + 40, z: b.z1 + 2, h: 0 };
    } else {
      b.signs.push({ text: 'PORT VALEN POLICE', x: (b.x0 + b.x1) / 2, y: CURB_H + 15, z: b.z0 + 4 - 0.12, ry: Math.PI, w: 16, h: 2.2, bg: '#0f2a52', fg: '#ffffff' });
      for (let k = 0; k < 5; k++) b.parked.push({ x: b.x0 + 32 + k * 4.5, z: b.z0 + 44, h: 0, cls: 'police' });
      b.respawn = { x: fx, z: fz, h: 0 };
    }
    for (let k = 0; k < 4; k++) this._prop(b, 'planter', b.x0 + 30 + k * 7, b.z1 - 3, 0);
  }
  _genPerimeter() {
    // stored separately; world mesh builds the seawall/railing
    this.perimeter = [
      { x0: -EDGE_MARGIN - 1, z0: -EDGE_MARGIN - 1, x1: CITY + EDGE_MARGIN + 1, z1: -EDGE_MARGIN + 0.2 },
      { x0: -EDGE_MARGIN - 1, z0: CITY + EDGE_MARGIN - 0.2, x1: CITY + EDGE_MARGIN + 1, z1: CITY + EDGE_MARGIN + 1 },
      { x0: -EDGE_MARGIN - 1, z0: -EDGE_MARGIN, x1: -EDGE_MARGIN + 0.2, z1: CITY + EDGE_MARGIN },
      // the east wall stops either side of the causeway to Valen Point (Session 6B)
      { x0: CITY + EDGE_MARGIN - 0.2, z0: -EDGE_MARGIN, x1: CITY + EDGE_MARGIN + 1, z1: VP.cw.z - VP.cw.half },
      { x0: CITY + EDGE_MARGIN - 0.2, z0: VP.cw.z + VP.cw.half, x1: CITY + EDGE_MARGIN + 1, z1: CITY + EDGE_MARGIN }
    ];
    for (const p of this.perimeter) this.grid.add({ ...p, y0: -5, y1: 3, kind: 'wall' });
    // promenade lamps and benches outside the perimeter road
    this.promenade = [];
    for (let k = 0; k < N; k++) for (const o of LAMP_OFFS) {
      const t = k * P + o;
      this.promenade.push({ type: 'lamp', x: -LAMP_SIDE, z: t, ry: Math.PI / 2 });
      this.promenade.push({ type: 'lamp', x: CITY + LAMP_SIDE, z: t, ry: -Math.PI / 2 });
      this.promenade.push({ type: 'lamp', x: t, z: -LAMP_SIDE, ry: 0 });
      this.promenade.push({ type: 'lamp', x: t, z: CITY + LAMP_SIDE, ry: Math.PI });
    }
  }
  // ---------- queries used by AI / missions ----------
  nodePos(i, j) { return [i * P, j * P]; }
  randomCurbSpot(fromX, fromZ, minD, maxD, rng = Math.random) {
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(rng() * (N + 1)), j = Math.floor(rng() * N);
      const vertical = rng() < 0.5;
      const along = 20 + rng() * 40;
      const side = rng() < 0.5 ? -1 : 1;
      let x, z, h;
      if (vertical) { if (i > N || !RoadNet.segOpen(0, i, j)) continue; x = i * P + side * 4.6; z = j * P + along; h = side > 0 ? Math.PI : 0; }
      else { const ii = Math.floor(rng() * N), jj = Math.floor(rng() * (N + 1)); if (!RoadNet.segOpen(1, jj, ii)) continue; x = ii * P + along; z = jj * P + side * 4.6; h = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
      if (x < -1 || z < -1 || x > CITY + 1 || z > CITY + 1) continue;
      const d = Math.hypot(x - fromX, z - fromZ);
      if (d >= minD && d <= maxD) return { x, z, h };
    }
    return { x: P * 6 + 4.6, z: P * 6 + 30, h: 0 };
  }
  randomSecret(fromX, fromZ, minD, maxD) {
    const all = [];
    for (const b of this.blocks) for (const s of b.secrets) { const d = Math.hypot(s.x - fromX, s.z - fromZ); if (d >= minD && d <= maxD) all.push(s); }
    return all.length ? pick(all) : null;
  }
}
// heading for a parked car whose right side faces direction (rx, rz)
function headingFromRightTo(rx, rz) {
  // right = (-cos h, sin h)  =>  h = atan2(rz, -rx)
  return Math.atan2(rz, -rx);
}

/* ---------------- street prop placement sanity ----------------
   Every piece of street furniture is checked once the city is generated: nothing may stand in
   a traffic lane, on a curb edge or across a driveway. A prop that breaks the rule is slid
   back onto its own sidewalk (away from the nearest road) or, if there is no room, removed.
   The report is kept on the world so tests and the developer panel can show it. */
const PROP_CLEAR = 0.25; // minimum gap between any prop footprint and a drivable surface
Object.assign(World.prototype, {
  // drivable surfaces a prop must keep clear of: lattice roads, local roads, driveways
  driveSurfaceAt(x, z) {
    if (isOnRoad(x, z)) return true;
    if (typeof localRoadAt === 'function' && localRoadAt(x, z)) return true;
    const b = this.block(Math.floor(x / P), Math.floor(z / P));
    if (b && b.drives) for (const d of b.drives) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return true;
    return false;
  },
  _propFootprintBad(type, x, z, ry, sc) {
    const def = PROP_DEFS[type]; if (!def) return false;
    const pts = [[x, z]];
    if (def.col && def.col.r === undefined) {
      const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
      const hw = (def.col.w * c + def.col.d * sn) / 2 * sc + PROP_CLEAR, hd = (def.col.w * sn + def.col.d * c) / 2 * sc + PROP_CLEAR;
      for (const [a, b2] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) pts.push([x + a * hw, z + b2 * hd]);
    } else {
      const r = ((def.col && def.col.r) || 0.25) * sc + PROP_CLEAR;
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    }
    for (const [px, pz] of pts) if (this.driveSurfaceAt(px, pz)) return true;
    return false;
  },
  _propSanity() {
    const rep = this.propReport = { checked: 0, moved: 0, removed: 0, byType: {} };
    for (const b of this.blocks) {
      for (let i = b.props.length - 1; i >= 0; i--) {
        const p = b.props[i]; rep.checked++;
        if (!this._propFootprintBad(p.type, p.x, p.z, p.ry, p.s)) continue;
        rep.byType[p.type] = (rep.byType[p.type] || 0) + 1;
        (rep.list || (rep.list = [])).push({ t: p.type, x: Math.round(p.x), z: Math.round(p.z), b: b.bx + ',' + b.bz });
        // slide toward the block centre (away from the road) in 25 cm steps
        const dx = b.cx - p.x, dz = b.cz - p.z, l = Math.hypot(dx, dz) || 1;
        // move along the dominant axis only, so a prop stays aligned with its curb
        const ax = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
        let nx = null, nz = null;
        const tan = [ax[1], ax[0]];
        for (let t = 0.25; t <= 4.01; t += 0.25) {
          for (const dir of [ax, [dx / l, dz / l], tan, [-tan[0], -tan[1]]]) {
            const qx = p.x + dir[0] * t, qz = p.z + dir[1] * t;
            if (!this._propFootprintBad(p.type, qx, qz, p.ry, p.s)) { nx = qx; nz = qz; break; }
          }
          if (nx !== null) break;
        }
        const list = this.propTypes[p.type]; const li = list ? list.indexOf(p) : -1; if (li >= 0) list.splice(li, 1);
        b.props.splice(i, 1);
        if (nx === null) { rep.removed++; rep.list[rep.list.length - 1].removed = true; continue; }
        const q = this._prop(b, p.type, nx, nz, p.ry, p.s);
        if (p.type === 'upole') for (const bb of [b, this.block(b.bx - 1, b.bz), this.block(b.bx + 1, b.bz), this.block(b.bx, b.bz - 1), this.block(b.bx, b.bz + 1)]) if (bb && bb.wires) for (const w of bb.wires) for (const o of [0, 3]) if (Math.hypot(w[o] - p.x, w[o + 2] - p.z) < 1.2) { w[o] += nx - p.x; w[o + 2] += nz - p.z; }
        for (const k of ['node', 'axis']) if (p[k] !== undefined) q[k] = p[k];
        // keep the moved prop at the old index for deterministic ordering
        b.props.pop(); b.props.splice(i, 0, q);
        rep.moved++;
      }
    }
    // curbside parking never blocks a driveway mouth
    rep.parkedCleared = 0;
    for (const b of this.blocks) {
      const drives = []; for (const bb of [b, this.block(b.bx - 1, b.bz), this.block(b.bx + 1, b.bz), this.block(b.bx, b.bz - 1), this.block(b.bx, b.bz + 1)]) if (bb && bb.drives) drives.push(...bb.drives);
      if (!drives.length) continue;
      b.parked = b.parked.filter(c => { if (!c.curb) return true; const hit = drives.some(d => c.x > d.x0 - 3.2 && c.x < d.x1 + 3.2 && c.z > d.z0 - 3.2 && c.z < d.z1 + 3.2); if (hit) rep.parkedCleared++; return !hit; });
    }
    return rep;
  },
  // full audit used by tests: props, parked cars and trees against every drivable surface
  auditPlacement() {
    const bad = [];
    for (const b of this.blocks) for (const p of b.props) if (this._propFootprintBad(p.type, p.x, p.z, p.ry, p.s)) bad.push({ type: p.type, x: +p.x.toFixed(1), z: +p.z.toFixed(1), block: b.i });
    for (const b of this.blocks) for (const c of b.parked) if (c.curb) for (const bb of this.blocks) if (bb.drives) for (const d of bb.drives) if (c.x > d.x0 - 3 && c.x < d.x1 + 3 && c.z > d.z0 - 3 && c.z < d.z1 + 3) bad.push({ type: 'parked', x: +c.x.toFixed(1), z: +c.z.toFixed(1), block: b.i });
    return bad;
  }
});

