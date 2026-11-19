/* =====================================================================
   [CONTENT] THE ISLAND'S BUILDINGS DRESSED LIKE THE CITY'S (2026-11-18)
   The world overhaul's audit (ISLAND.md §10): the island districts' buildings
   were the city's own boxes (_bld) without the city's dressing, so beside the
   original city they read as placeholders. This pass gives every district
   building the same treatment a city street building gets (090/100):
   - its front is the face toward its nearest road;
   - a shop, office or showroom there gets the glazed shop floor (gtype 1),
     an awning and a fascia sign, like the city's high streets;
   - the facade dressing (_dress: plinth, cornice, string courses, downpipes,
     fire escapes, balconies, air-conditioners, blade signs, a house's porch);
   - a flat roof gets its plant (_rooftop: tanks, vents, parapets, water
     towers on old brick); a warehouse its loading dock (_dressBox).
   Only the island districts' blocks (dist_*): the tracks, the airport, the
   fairground and the villa have their own architecture.
   And the island's streets furnished like the city's (_isleFurniture):
   hydrants, bins, benches, bus stops and news boxes along the district
   streets, a name sign at each end of every street, speed-limit signs on
   the highways; each clear of the carriageways, of anything built and of
   every post already standing.
   ===================================================================== */
// spacing (m) along a street, each side: hydrants, bins, benches (urban streets only); a bus stop on a street longer than
// busMin; a highway's speed-limit signs every limitStep
const ISLE_FURN = { hydrant: 85, bin: 64, bench: 110, busMin: 260, limitStep: 1400, limits: { n1: 50, n1e: 40, s1: 50, s4: 50, n2: 40, s3: 40, sp1: 40, sp2: 40, x1: 30 } };
Object.assign(World.prototype, {
  _dressIsland() {
    let n = 0;
    for (const b of this.isle.blocks) {
      if (!/^dist_/.test(b.xb || '')) continue;
      const rng = new RNG(hash2i(Math.floor(b.cx), Math.floor(b.cz), 2301) * 1e9);
      for (const r of b.bld.slice()) {
        if (r.noDress || r.h < 2.5) continue;
        const f = this._isleFront(r);
        // the shop floor and its awning and sign (the city's street-row rule, 090 _row)
        const shopStyle = r.style === STYLE.SHOP || r.style === STYLE.OFFICE || r.style === STYLE.DECO || (r.style === STYLE.APT && r.h > 12 && rng.chance(0.5));
        if (f && f.near && (shopStyle || (r.style === STYLE.BRICK && rng.chance(0.4))) && r.h >= 4) {
          r.gtype = 1; f.shop = true;
          if (shopStyle && f.w > 5) {
            const aw = f.w - 1.2;
            if (rng.chance(0.75)) this._det(b, 'box', f.faceX + f.fx * 0.9, r.y0 + 3.05, f.faceZ + f.fz * 0.9, f.ax === 'x' ? aw : 1.8, 0.12, f.ax === 'x' ? 1.8 : aw, rng.pick(PAL.awning), 0);
            if (rng.chance(0.7)) b.signs.push({ x: f.faceX + f.fx * 0.08, y: r.y0 + 3.9, z: f.faceZ + f.fz * 0.08, ry: f.ry, w: Math.min(aw * 0.8, 6), h: 0.9, ad: rng.int(0, 7) });
          }
        }
        if (f) this._dress(b, r, rng, f);
        if (r.roof !== 'gable') {
          if (r.style === STYLE.WARE) { this._dressBox(b, r, rng, 'warehouse'); this._rooftop(b, r, rng, 'ind'); }
          else this._rooftop(b, r, rng, r.h > 20 ? 'mid' : r.style === STYLE.BRICK ? 'old' : 'mid');
        }
        n++;
      }
    }
    return n;
  },
  _isleFurniture() {
    const F = ISLE_FURN, urban = new Set(ISLE_INFILL_ROADS.map(D => D.id)), street = new Set([...ISLE_DISTRICT_ROADS, ...ISLE_INFILL_ROADS].map(D => D.id));
    // what a post must keep clear of: every carriageway, everything built, every post already standing
    const segs = []; for (const R of Island.roads) for (let k = 0; k < R.pts.length - 1; k += 1) { const a = R.pts[k], c = R.pts[k + 1]; segs.push({ R, a, c, x0: Math.min(a[0], c[0]) - R.w, x1: Math.max(a[0], c[0]) + R.w, z0: Math.min(a[1], c[1]) - R.w, z1: Math.max(a[1], c[1]) + R.w }); }
    const grid = new Map(), cellOf = (x, z) => Math.floor(x / 32) * 4096 + Math.floor(z / 32);
    for (const sg of segs) for (let i = Math.floor(sg.x0 / 32); i <= Math.floor(sg.x1 / 32); i++) for (let j = Math.floor(sg.z0 / 32); j <= Math.floor(sg.z1 / 32); j++) { const k = i * 4096 + j; (grid.get(k) || grid.set(k, []).get(k)).push(sg); }
    const segD = (x, z, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const inRoad = (x, z, m) => (grid.get(cellOf(x, z)) || []).some(sg => segD(x, z, sg.a, sg.c) < sg.R.w / 2 + m);
    const solid = []; for (const b of this.xblocks) { for (const r of b.bld) solid.push([r.x0 - 1.2, r.z0 - 1.2, r.x1 + 1.2, r.z1 + 1.2]); for (const d of b.det) { const c = d.col; if (!c) continue; solid.push(c.r !== undefined ? [c.x - c.r - 1, c.z - c.r - 1, c.x + c.r + 1, c.z + c.r + 1] : [c.x0 - 1, c.z0 - 1, c.x1 + 1, c.z1 + 1]); } }
    // (nor on a runway: the airport's and Valen Field's, with 6 m to spare either side)
    const AP = AIRPORT, FLD = this.isle && this.isle.field, runway = (x, z) => AP.rw.some(q => x > q.x0 - 6 && x < q.x1 + 6 && Math.abs(z - q.z) < q.w / 2 + 6) || !!(FLD && x > FLD.rw.x0 - 6 && x < FLD.rw.x1 + 6 && Math.abs(z - FLD.rw.z) < FLD.rw.w / 2 + 6);
    // (nor on a house's drive: a post there would stand in the way of the car parked up it)
    const onDrive = (x, z) => this._onIsleDrive(x, z, 1.2);
    const placed = [], free = (x, z, m = 1.5) => !solid.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3]) && !placed.some(q => Math.hypot(q[0] - x, q[1] - z) < m + 1.5) && !inRoad(x, z, 0.4) && !runway(x, z) && !onDrive(x, z);
    // the block a thing streams with: the nearest island block that reaches it, or one for this street
    const blockAt = (R, x, z) => { let best = null, bd = Infinity; for (const b of this.isle.blocks) { const d = Math.hypot(b.cx - x, b.cz - z); if (d < b.r && d < bd) { bd = d; best = b; } } return best || this.xblocks.find(b => b.xb === 'furn_' + R.id) || this._isleBlock('furn_' + R.id, x, z, 260, R.name); };
    let n = 0;
    const put = (R, type, x, z, ry, y) => { this._prop(blockAt(R, x, z), type, x, z, ry, 1, y); placed.push([x, z]); n++; };
    // a post with a plate: a street name, a speed limit (white, black figures)
    const sign = (R, x, z, y, ry, text, bg, fg, w, h) => { const b = blockAt(R, x, z); this._det(b, 'cyl', x, y + 1.35, z, 0.05, 2.7, 0x6a6e72, null, { x, z, r: 0.12, y0: y - 1, y1: y + 2.7, kind: 'det' }); b.signs.push({ text, x: x + Math.sin(ry) * 0.04, y: y + 2.45, z: z + Math.cos(ry) * 0.04, ry, w, h, bg, fg }); b.signs.push({ text, x: x - Math.sin(ry) * 0.04, y: y + 2.45, z: z - Math.cos(ry) * 0.04, ry: ry + Math.PI, w, h, bg, fg }); placed.push([x, z]); n++; };
    for (const R of Island.roads) {
      if (R.closed) continue;
      const len = R.cum[R.cum.length - 1], isStreet = street.has(R.base || R.id), isUrban = urban.has(R.base || R.id), off = R.w / 2 + 1.7;
      const at = (s2, side) => {
        let k = 0; while (k < R.pts.length - 2 && R.cum[k + 1] < s2) k++;
        if ((R.bridges || []).some(b => k >= b[0] - 3 && k <= b[1] + 3) || (R.tunnel && k >= R.tunnel[0] - 4 && k <= R.tunnel[1] + 4)) return null;
        const a = R.pts[k], c = R.pts[k + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = clamp((s2 - R.cum[k]) / l, 0, 1), tx = (c[0] - a[0]) / l, tz = (c[1] - a[1]) / l;
        const nx = tz * side, nz = -tx * side, cx = a[0] + (c[0] - a[0]) * t + nx * off, cz = a[1] + (c[1] - a[1]) * t + nz * off, y = R.y[k] + (R.y[k + 1] - R.y[k]) * t + (isStreet ? CURB_H : 0);
        // facing the carriageway (a bench's seat, a sign's face to the oncoming traffic)
        return { x: cx, z: cz, y, toRoad: Math.atan2(-nx, -nz), along: Math.atan2(tx, tz) };
      };
      // the street's name at both ends, on the right of the traffic coming in
      if (isStreet && len > 60) for (const [s2, side, dir] of [[12, 1, 0], [len - 12, -1, Math.PI]]) { const q = at(s2, side); if (q && free(q.x, q.z, 1)) sign(R, q.x, q.z, q.y, q.along + dir, R.name.toUpperCase(), '#1f5f3a', '#ffffff', Math.min(3.6, 0.5 + R.name.length * 0.22), 0.42); }
      // a highway's limit: after each end, then every limitStep, facing the traffic
      const lim = F.limits[R.base || R.id];
      if (lim) for (let s2 = 60; s2 < len - 40; s2 += F.limitStep) for (const side of [1, -1]) { const q = at(side > 0 ? s2 : len - s2, side); if (q && free(q.x, q.z, 1)) sign(R, q.x, q.z, q.y, q.along + (side > 0 ? Math.PI : 0), 'SPEED LIMIT ' + lim, '#f4f4f0', '#111111', 1.0, 1.1); }
      if (!isStreet) continue;
      // hydrants, bins and benches by the kerb; one bus stop (with its news box) on a longer street
      for (const side of [1, -1]) {
        for (let s2 = 30 + (side > 0 ? 0 : F.hydrant / 2); s2 < len - 25; s2 += F.hydrant) { const q = at(s2, side); if (q && free(q.x, q.z)) put(R, 'hydrant', q.x, q.z, q.toRoad, q.y); }
        if (isUrban) {
          for (let s2 = 22 + (side > 0 ? 10 : 40); s2 < len - 20; s2 += F.bin) { const q = at(s2, side); if (q && free(q.x, q.z)) put(R, 'bin', q.x, q.z, q.toRoad, q.y); }
          for (let s2 = 50 + (side > 0 ? 0 : 55); s2 < len - 30; s2 += F.bench) { const q = at(s2, side); if (q && free(q.x, q.z, 2)) { put(R, 'bench', q.x, q.z, q.toRoad + Math.PI, q.y); const b = blockAt(R, q.x, q.z); b.seats.push({ x: q.x, z: q.z, ry: q.toRoad + Math.PI }); } }
        }
      }
      if (len > F.busMin) for (const side of [1, -1]) { const q = at(len * (side > 0 ? 0.42 : 0.58), side); if (q && free(q.x, q.z, 4)) { put(R, 'busstop', q.x, q.z, q.toRoad + Math.PI, q.y); const p2 = at(len * (side > 0 ? 0.42 : 0.58) + 5, side); if (p2 && free(p2.x, p2.z)) put(R, 'newsbox', p2.x, p2.z, p2.toRoad, p2.y); break; } }
    }
    return n;
  },
  // the face of r toward its nearest island road: the facade frame _dress takes ({ ax, dir, ry, fx, fz, faceX, faceZ,
  // w }; near: within a street's frontage), or null when no road is within reach
  _isleFront(r) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    // a lot's building knows which way its lot faces the street (128); otherwise the nearest island road decides
    if (r.face) {
      const [fx, fz] = r.face;
      if (fx < -0.5) return { ax: 'z', dir: 1, ry: -Math.PI / 2, fx: -1, fz: 0, faceX: r.x0, faceZ: cz, w: r.z1 - r.z0, near: true };
      if (fx > 0.5) return { ax: 'z', dir: -1, ry: Math.PI / 2, fx: 1, fz: 0, faceX: r.x1, faceZ: cz, w: r.z1 - r.z0, near: true };
      if (fz < -0.5) return { ax: 'x', dir: 1, ry: Math.PI, fx: 0, fz: -1, faceX: cx, faceZ: r.z0, w: r.x1 - r.x0, near: true };
      return { ax: 'x', dir: -1, ry: 0, fx: 0, fz: 1, faceX: cx, faceZ: r.z1, w: r.x1 - r.x0, near: true };
    }
    if (!Island._nearRoad(Island._seg, cx, cz)) return null;
    const R = Island._rr, k = Island._rk, t = Island._rt, a = R.pts[k], c = R.pts[k + 1], px = a[0] + (c[0] - a[0]) * t, pz = a[1] + (c[1] - a[1]) * t;
    const dx = px - cx, dz = pz - cz, w = r.x1 - r.x0, d = r.z1 - r.z0;
    const near = Island._rd < 40;
    if (Math.abs(dx) / w > Math.abs(dz) / d) {
      // the front runs along z, on the x0 (west) or x1 (east) side
      return dx < 0 ? { ax: 'z', dir: 1, ry: -Math.PI / 2, fx: -1, fz: 0, faceX: r.x0, faceZ: cz, w: d, near } : { ax: 'z', dir: -1, ry: Math.PI / 2, fx: 1, fz: 0, faceX: r.x1, faceZ: cz, w: d, near };
    }
    return dz < 0 ? { ax: 'x', dir: 1, ry: Math.PI, fx: 0, fz: -1, faceX: cx, faceZ: r.z0, w, near } : { ax: 'x', dir: -1, ry: 0, fx: 0, fz: 1, faceX: cx, faceZ: r.z1, w, near };
  }
});
// the roundabouts' central islands and signs (023 lays the rings out)
Object.assign(World.prototype, {
  // each roundabout's central island (raised, kerbed, planted, a tree in the middle), its give-way signs and the signs
  // on the approaches; a solid cylinder keeps cars off the island
  _genRoundabouts() {
    if (CityLayout.id !== 'island') return;
    for (const RB of ROUNDABOUTS) {
      const b = this._isleBlock('rb_' + RB.id, RB.x, RB.z, 140, RB.name), y = RB.y, ri = roundaboutIsland(RB);
      this._det(b, 'cyl', RB.x, y + 0.12, RB.z, ri, 0.24, C(0xc9c6bd), null, { x: RB.x, z: RB.z, r: ri - 0.3, y0: y - 1, y1: y + 0.6, kind: 'det' });
      this._det(b, 'cyl', RB.x, y + 0.255, RB.z, ri - 0.35, 0.03, C(0x5f8a46));
      // planting: a ring of shrubs, flower beds, the tree in the middle
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, rr = ri - 1.6; this._det(b, 'blob', RB.x + Math.cos(a) * rr, y + 0.7, RB.z + Math.sin(a) * rr, 0.9, 0.8, 0.9, C(k % 2 ? 0x3f6a34 : 0x4c7a3a)); }
      for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2, rr = ri * 0.5; this._det(b, 'cyl', RB.x + Math.cos(a) * rr, y + 0.32, RB.z + Math.sin(a) * rr, 1.1, 0.12, C([0xd23a2a, 0xf2c230, 0xe056fd][k % 3])); }
      this._det(b, 'cyl', RB.x, y + 1.6, RB.z, 0.28, 2.8, C(0x5a4632));
      this._det(b, 'blob', RB.x, y + 4.4, RB.z, 3.2, 2.6, 3.2, C(0x3f6a34));
      // the island's name on a low stone in its kerb, toward each entry; a give-way sign at each entry; a sign ahead on
      // each approach (a leg of a road that ends on this ring)
      for (const R of Island.roads) {
        if (R.closed) continue;
        for (const [k, at] of [[0, 0], [1, R.pts.length - 1]]) {
          if (R.ends[k] !== 'rb:' + RB.id) continue;
          const p = R.pts[at], q = R.pts[k ? Math.max(0, at - 6) : Math.min(R.pts.length - 1, at + 6)], l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / l, uz = (p[1] - q[1]) / l;
          // (on the right of the traffic coming in: the right of travel is (−uz, ux) on the map)
          const rx = -uz, rz = ux, side = R.w / 2 + 1.2, face = Math.atan2(-ux, -uz);
          const gx = p[0] - ux * (RB.w / 2 + 2.5) + rx * side, gz = p[1] - uz * (RB.w / 2 + 2.5) + rz * side;
          this._det(b, 'cyl', gx, y + 1.25, gz, 0.05, 2.5, 0x6a6e72, null, { x: gx, z: gz, r: 0.12, y0: y - 1, y1: y + 2.5, kind: 'det' });
          b.signs.push({ text: 'GIVE WAY', x: gx - ux * 0.04, y: y + 2.3, z: gz - uz * 0.04, ry: face, w: 0.95, h: 0.62, bg: '#ffffff', fg: '#c8102e' });
          const da = Math.min(70, R.len - 8); if (da < 30) continue;
          // the sign ahead: where the leg is da m back from the ring
          let s = k ? R.len - da : da, kk = 0; while (kk < R.pts.length - 2 && R.cum[kk + 1] < s) kk++;
          const a = R.pts[kk], c2 = R.pts[kk + 1], l2 = Math.hypot(c2[0] - a[0], c2[1] - a[1]) || 1, dx = (c2[0] - a[0]) / l2 * (k ? 1 : -1), dz = (c2[1] - a[1]) / l2 * (k ? 1 : -1);
          const sx = a[0] - dz * side, sz = a[1] + dx * side, sy = R.y[kk];
          const bb = this.xblocks.find(x => x.xb === 'rb_' + RB.id);
          this._det(bb, 'cyl', sx, sy + 1.35, sz, 0.05, 2.7, 0x6a6e72, null, { x: sx, z: sz, r: 0.12, y0: sy - 1, y1: sy + 2.7, kind: 'det' });
          bb.signs.push({ text: 'ROUNDABOUT', x: sx - dx * 0.04, y: sy + 2.45, z: sz - dz * 0.04, ry: Math.atan2(-dx, -dz), w: 1.3, h: 0.6, bg: '#1f4f9a', fg: '#ffffff' });
          bb.signs.push({ text: RB.name.toUpperCase(), x: sx - dx * 0.04, y: sy + 1.9, z: sz - dz * 0.04, ry: Math.atan2(-dx, -dz), w: 1.6, h: 0.36, bg: '#1f4f9a', fg: '#ffffff' });
        }
      }
    }
  }
});
