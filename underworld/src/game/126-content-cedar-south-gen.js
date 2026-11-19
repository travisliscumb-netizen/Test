/* =====================================================================
   [CONTENT] CEDAR FIELDS SOUTH: SOUTHSHORE SPEEDWAY (owner, 2026-11-18)
   The off-road park is gone (its course, its compound, its countryside
   tracks); in its place an asphalt oval, half of the Southshore
   Motorsport Complex with the road course south-west of it (129b):
   - the oval: two 400 m straights joined by 90 m turns, 15 m wide, the
     turns banked (the outside 1.8 m up), driven anticlockwise (left
     turns); a sealed apron on the inside, a concrete wall round the
     outside, armco round the infield;
   - the pits: a pit lane inside a pit wall along the front (north)
     straight, twelve drive-through garages behind it (two bays each,
     the complex's owner's parking), the paddock behind them with the
     Speedway Office, transporters and a car park; a grandstand along the
     back straight;
   - the ways in: the land bridge's track from the city (a Links spur to
     the paddock's turning circle, as before) and the gate road from the
     Southshore Highway through a gate in the west fence (Oval Gate Road,
     022/129b), the way from the road course (Paddock Road).
   The ground is the height field (027): the whole site held level, the
   oval stamped into it with its banking. Everything that is not ground
   streams as district blocks (world.xblocks) like Valen Point.
   ===================================================================== */
const OVAL = {
  name: 'Southshore Speedway', y: 1.0, half: 7.5, apron: 5, rise: 1.8, step: 2,
  // corners [x, z, radius] in the direction of travel: west along the front straight, then south, east, north
  verts: [[60, 1225, 90], [60, 1405, 90], [640, 1405, 90], [640, 1225, 90]],
  sfX: 350,
  // the pit lane (along x), the pit wall, the garages north of it, the merges at each end of the front straight
  pit: { z: 1208, w: 10, x0: 188, x1: 512, wallZ: 1215.3, garX: [230, 470], garZ: [1176, 1200], cell: 20,
    entry: [[548, 1220], [530, 1213], [512, 1208]], exit: [[188, 1208], [170, 1213], [152, 1220]] },
  paddock: { x0: 110, z0: 1066, x1: 560, z1: 1176 },
  ring: { x: 300, z: 1110, r: 12 },
  office: { x0: 320, z0: 1098, x1: 350, z1: 1122 },
  stand: { x0: 200, x1: 500, z0: 1420, z1: 1448 },
  // the level site, and the gate in the west fence for the road from the highway
  flat: [{ x0: 25, z0: 1058, x1: 675, z1: 1455 }],
  gate: { z: 1150, half: 9 }
};
// the oval's centreline (filletLoop: a rounded rectangle whose short sides are all turn), with the start/finish sample
function ovalLine() {
  const T = filletLoop(OVAL.verts, OVAL.step);
  T.sfK = T.pts.findIndex((p, k) => T.R[k] === 0 && Math.abs(p[0] - OVAL.sfX) <= OVAL.step && Math.abs(p[1] - OVAL.verts[0][1]) < 0.5);
  T.sfAlong = T.cum[T.sfK];
  return T;
}
// the banking at each sample: 0 on the straights, full through the turns, eased in and out over the turns' first 40 m
function ovalBank(T) {
  const n = T.pts.length, out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (!(T.R[k] > 0)) continue;
    let d = 0; while (d < n && T.R[(k + d) % n] > 0 && T.R[(k - d + n) % n] > 0) d++;
    out[k] = smoothstep(0, 40, d * OVAL.step);
  }
  return out;
}
Object.assign(World.prototype, {
  _genCedarSouth() {
    const T = ovalLine(), O = OVAL, rng = new RNG(6301), lb = CFS.lb;
    const tracks = [], pads = [];
    const landY = 0.9, land = { x0: 186, z0: 1040, x1: 214, z1: 1062 };
    pads.push({ ...land, y: landY }, ...O.flat.map(f => ({ ...f, y: O.y })));
    // ---------------------------------------------------------------- the land bridge's track: the city → the paddock's turning circle
    const R0 = O.ring;
    const spurPts = splinePts([[lb.x, lb.z0], [lb.x, CFS.z0], [lb.x + 2, 1062], [225, 1086], [255, 1102], [R0.x - R0.r, R0.z]]);
    this.localRoads.push({ k: 'line', link: 'Cedar Fields Track', spur: true, w: lb.road * 2, pts: spurPts, ring: R0, mat: 'dirt' });
    tracks.push({ pts: spurPts.filter(p => p[1] >= CFS.z0 - 1), w: lb.road * 2 + 1 });
    // the gate road: from Oval Gate Road's end on the island (022), through the west gate, to the turning circle
    const gr = ISLE_ROADS.find(D => D.id === 'sr3'), gEnd = gr.pts[gr.pts.length - 1];
    const gatePts = splinePts([gEnd, [CFS.x0, O.gate.z], [40, 1146], [110, 1136], [190, 1124], [250, 1114], [R0.x - R0.r, R0.z]], 2.5);
    tracks.push({ pts: gatePts.filter(p => p[0] >= CFS.x0), w: 9 });
    const bank = ovalBank(T);
    this.cfs = { pads, tracks, oval: { T, y: O.y, half: O.half, apron: O.apron, rise: O.rise, side: 1, bankK: bank, flat: O.flat }, landY, track: T, site: O, Yc: O.y, spur: spurPts, gate: gatePts, bays: [], blocks: [] };
    // ---------------------------------------------------------------- the ground
    Terrain.build(this);
    const gy = (x, z) => { const y = Terrain.height(x, z); return y === null ? 0 : y - Terrain.rough; };
    const cf = this.cfs, Y = O.y, wall = (x0, z0, x1, z1, y1 = 1.2, y0 = -5) => this.grid.add({ x0, z0, x1, z1, y0, y1, kind: 'wall' });
    // ---------------------------------------------------------------- district blocks (for streaming)
    const blk = (id, cx, cz, r, name) => { const b = this._xBlock(id, cx - P / 2, cz - P / 2, r, name || CFS.name); b.t = 'S'; cf.blocks.push(b); return b; };
    const B = { pad: blk('so_paddock', 330, 1120, 260, 'Southshore Speedway paddock'), pits: blk('so_pits', 350, 1200, 220, 'Southshore Speedway pits'), stand: blk('so_stand', 350, 1434, 170, 'Southshore Speedway grandstand'), oval: blk('so_oval', 350, 1315, 330, O.name) };
    // the countryside round the site in tiles: trees stream with them
    const tiles = [];
    for (let tz = 0; tz < 3; tz++) for (let tx = 0; tx < 5; tx++) { const x0 = CFS.x0 + tx * 140, z0 = CFS.z0 + tz * 150; tiles.push({ x0, z0, x1: x0 + 140, z1: z0 + 150, b: blk('cfs_' + tx + '_' + tz, x0 + 70, z0 + 75, 110) }); }
    const tileAt = (x, z) => (tiles.find(t => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) || tiles[0]).b;
    // ---------------------------------------------------------------- the fence all round (a gap for the land bridge and one for the west gate)
    const G0 = O.gate;
    cf.fence = [[CFS.x0 + 1, CFS.z0 + 1, lb.x - lb.half, CFS.z0 + 1], [lb.x + lb.half, CFS.z0 + 1, CFS.x1 - 1, CFS.z0 + 1], [CFS.x1 - 1, CFS.z0 + 1, CFS.x1 - 1, CFS.z1 - 1], [CFS.x1 - 1, CFS.z1 - 1, CFS.x0 + 1, CFS.z1 - 1],
      [CFS.x0 + 1, CFS.z1 - 1, CFS.x0 + 1, G0.z + G0.half], [CFS.x0 + 1, G0.z - G0.half, CFS.x0 + 1, CFS.z0 + 1]];
    for (const [x0, z0, x1, z1] of cf.fence) wall(Math.min(x0, x1) - 0.2, Math.min(z0, z1) - 0.2, Math.max(x0, x1) + 0.2, Math.max(z0, z1) + 0.2, 6);
    cf.rails = [[lb.x - lb.half + 0.4, CFS_EDGE + EDGE_MARGIN, lb.x - lb.half + 0.4, CFS.z0 + 1], [lb.x + lb.half - 0.4, CFS_EDGE + EDGE_MARGIN, lb.x + lb.half - 0.4, CFS.z0 + 1]];
    for (const [x0, z0, x1, z1] of cf.rails) wall(x0 - 0.2, z0, x1 + 0.2, z1, 3);
    // the gate: two posts and a sign over the road
    for (const s2 of [-1, 1]) this._det(B.pad, 'box', CFS.x0 + 1, gy(CFS.x0 + 2, G0.z) + 3, G0.z + s2 * (G0.half - 0.5), 0.6, 6, 0.6, C(0x2a2e33), 0, true);
    this._det(B.pad, 'box', CFS.x0 + 1, gy(CFS.x0 + 2, G0.z) + 6.1, G0.z, 0.7, 1.1, G0.half * 2, C(0x1f6fb2));
    B.pad.signs.push({ text: 'SOUTHSHORE SPEEDWAY', x: CFS.x0 + 0.6, y: gy(CFS.x0 + 2, G0.z) + 6.1, z: G0.z, ry: -Math.PI / 2, w: G0.half * 2 - 1, h: 0.9, bg: '#1f6fb2', fg: '#ffffff' });
    // ---------------------------------------------------------------- the walls: concrete round the outside, armco round the infield
    const n = T.pts.length, half = O.half, pitSide = (x, z) => z < O.verts[0][1] && x > O.pit.exit[2][0] - 2 && x < O.pit.entry[0][0] + 2;
    cf.walls = [];
    for (const [side, off] of [[-1, half + 2], [1, half + O.apron + 0.6]]) {
      const line = [];
      for (let k = 0; k < n; k++) {
        const p = T.pts[k], nl = T.nl[k], x = p[0] + nl[0] * side * off, z = p[1] + nl[1] * side * off;
        line.push(side < 0 && pitSide(x, z) ? null : [x, z, gy(x - nl[0] * side * 0.8, z - nl[1] * side * 0.8)]);
      }
      cf.walls.push({ line, kind: side < 0 ? 'concrete' : 'armco' });
      for (let k = 0; k < n; k++) {
        const a = line[k], b2 = line[(k + 1) % n]; if (!a || !b2) continue;
        const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]), m = Math.max(1, Math.round(L));
        for (let i = 0; i < m; i++) { const yy = lerp(a[2], b2[2], i / m); this.grid.add({ x: lerp(a[0], b2[0], i / m), z: lerp(a[1], b2[1], i / m), r: side < 0 ? 0.5 : 0.45, y0: yy - 1.5, y1: yy + (side < 0 ? 1.2 : 1.1), kind: 'det', barrier: true }); }
      }
    }
    // the pit wall
    const PW = O.pit;
    this._det(B.pits, 'box', (PW.exit[0][0] + PW.entry[2][0]) / 2, Y + 0.6, PW.wallZ, PW.entry[2][0] - PW.exit[0][0] - 24, 1.2, 0.8, C(0xd8d8d0), 0, { x0: PW.exit[0][0] + 12, x1: PW.entry[2][0] - 12, z0: PW.wallZ - 0.4, z1: PW.wallZ + 0.4, y0: Y - 1, y1: Y + 1.2, kind: 'det' });
    // ---------------------------------------------------------------- start / finish: the line, the gantry, the grid behind it (east: the straight runs west)
    const sf = T.pts[T.sfK];
    cf.sf = { k: T.sfK, x: sf[0], z: sf[1], along: T.sfAlong };
    const gz0 = PW.wallZ + 0.6, gz1 = sf[1] + half + O.apron + 1.5;
    for (const z of [gz0, gz1]) this._det(B.pits, 'box', sf[0], Y + 4.5, z, 0.6, 9, 0.6, 0x2a2e33, 0, true);
    this._det(B.pits, 'box', sf[0], Y + 8.6, (gz0 + gz1) / 2, 1.0, 1.4, gz1 - gz0 + 0.6, 0x1d2126);
    for (let k = 0; k < 5; k++) B.pits.fx.push({ type: 'neon', x: sf[0] + 0.55, y: Y + 7.8, z: sf[1] - 6 + k * 3, w: 0.1, h: 0.6, d: 0.6, c: 0xff2a2a });
    B.pits.signs.push({ text: 'SOUTHSHORE SPEEDWAY', x: sf[0] + 0.52, y: Y + 8.6, z: (gz0 + gz1) / 2, ry: Math.PI / 2, w: 14, h: 1.2, bg: '#1d2126', fg: '#ffffff' });
    cf.grid = [];
    for (let k = 0; k < 10; k++) { const gx = sf[0] + 34 + k * 8, gzz = sf[1] + (k % 2 ? 3 : -3); cf.grid.push({ x: gx, z: gzz }); this._det(B.pits, 'box', gx - 2.6, Y + 0.09, gzz, 0.18, 0.02, 3, C(0xf2f2f2)); for (const s2 of [-1, 1]) this._det(B.pits, 'box', gx - 1.9, Y + 0.09, gzz + s2 * 1.5, 1.4, 0.02, 0.18, C(0xf2f2f2)); }
    // ---------------------------------------------------------------- the garages: drive-through, two bays each, between the paddock and the pit lane
    const [gxa, gxb] = PW.garX, [gza, gzb] = PW.garZ, cell = PW.cell, nG = Math.round((gxb - gxa) / cell);
    for (let i = 0; i <= nG; i++) { const x = gxa + i * cell; this._bld(B.pits, x - 0.3, gza, x + 0.3, gzb, 5.6, STYLE.IND, 0xd8dade, 5.6, 4, { exactH: true, y0: Y, oy: Y }); }
    this._bld(B.pits, gxa - 0.3, gza, gxb + 0.3, gzb, 6, STYLE.GLASS, 0x3a4652, 3, 4, { exactH: true, y0: Y + 5.6, oy: Y, far: true });
    for (let i = 0; i < nG; i++) {
      const xc = gxa + cell * (i + 0.5);
      for (const dx of [-4.5, 4.5]) cf.bays.push({ x: xc + dx, z: (gza + gzb) / 2, h: 0, y: Y, garage: i + 1 });
      B.pits.signs.push({ text: 'S' + (i + 1), x: xc, y: Y + 4.7, z: gzb + 0.05, ry: 0, w: 2.2, h: 1.2, bg: '#c8102e', fg: '#ffffff' });
    }
    // ---------------------------------------------------------------- the grandstand along the back straight: tiers rising away from the track
    {
      const S = O.stand;
      for (let t = 0; t < 7; t++) {
        const z0 = S.z0 + t * 4, h = 1 + t * 1.3;
        this._bld(B.stand, S.x0, z0, S.x1, z0 + 4, h, STYLE.IND, 0x9aa0a6, h, 5, { exactH: true, y0: Y, oy: Y, far: t === 6 });
        for (let x = S.x0 + 1.5; x < S.x1 - 1; x += 1.6) if (hash2i(Math.floor(x * 3), t, 53) < 0.6) this._det(B.stand, 'box', x, Y + h + 0.45, z0 + 2 + (hash2i(Math.floor(x), t, 55) - 0.5), 0.45, 0.9, 0.5, C([0xc0392b, 0x2471a3, 0xf1c40f, 0xecf0f1, 0x27ae60][Math.floor(hash2i(Math.floor(x * 7), t, 57) * 5)]));
      }
      this._det(B.stand, 'box', (S.x0 + S.x1) / 2, Y + 13.5, S.z0 + 14, S.x1 - S.x0 + 2, 0.6, 30, C(0xe8eaed));
      for (let x = S.x0; x <= S.x1; x += 30) this._det(B.stand, 'cyl', x, Y + 6.8, S.z1 - 1, 0.4, 13.6, 0x6a7078, null, { x, z: S.z1 - 1, r: 0.45, y0: Y, y1: Y + 13.6, kind: 'det' });
      B.stand.signs.push({ text: 'SOUTHSHORE SPEEDWAY', x: (S.x0 + S.x1) / 2, y: Y + 1.1, z: S.z0 - 0.05, ry: Math.PI, w: 26, h: 1.0, bg: '#c8102e', fg: '#ffffff' });
    }
    // ---------------------------------------------------------------- the Speedway Office on the turning circle (the door you use: its west face)
    {
      const OF = O.office;
      this._bld(B.pad, OF.x0, OF.z0, OF.x1, OF.z1, 9, STYLE.GLASS, 0x2c3a48, 3.4, 3.2, { exactH: true, y0: Y, oy: Y });
      B.pad.signs.push({ text: 'SPEEDWAY OFFICE', x: OF.x0 - 0.06, y: Y + 7.6, z: (OF.z0 + OF.z1) / 2, ry: -Math.PI / 2, w: 12, h: 1.3, bg: '#14181c', fg: '#ff6b4a' });
      this._det(B.pad, 'box', OF.x0 - 0.06, Y + 1.2, (OF.z0 + OF.z1) / 2, 0.12, 2.4, 1.4, C(0x22262b));
      B.pad.place = { id: 'oval', name: O.name, kind: 'landmark', door: { x: OF.x0 - 1.1, z: (OF.z0 + OF.z1) / 2, h: -Math.PI / 2 }, under: { x: (OF.x0 + OF.x1) / 2, z: (OF.z0 + OF.z1) / 2 } };
      // the turning circle's island, transporters along the paddock's back, lamps
      this._det(B.pad, 'cyl', R0.x, Y + 0.25, R0.z, 4, 0.5, 0x6f8a5a, null, { x: R0.x, z: R0.z, r: 4, y0: Y - 1, y1: Y + 0.5, kind: 'det' });
      for (let k = 0; k < 6; k++) { const x = 380 + k * 28; this._bld(B.pad, x, 1072, x + 16, 1075, 3.6, STYLE.IND, [0xd23a2a, 0x1f6fb2, 0xe8eaed, 0x2e2e2e, 0xf1c40f, 0x27ae60][k], 3.6, 4, { exactH: true, y0: Y, oy: Y }); }
      for (const [x, z] of [[200, 1150], [380, 1150], [520, 1150], [150, 1100]]) this._prop(B.pad, 'lotlamp', x, z, 0, 1, OVAL.y);
    }
    // ---------------------------------------------------------------- the countryside round the site: trees (clear of the site, the roads and the fence)
    const clearOf = (x, z, m) => {
      for (const P2 of pads) if (x > P2.x0 - m && x < P2.x1 + m && z > P2.z0 - m && z < P2.z1 + m) return false;
      for (const L of tracks) for (let k = 0; k < L.pts.length - 1; k += 2) { const a = L.pts[k], b2 = L.pts[Math.min(L.pts.length - 1, k + 2)]; if (segDist(x, z, a[0], a[1], b2[0], b2[1]) < L.w / 2 + m) return false; }
      return x > CFS.x0 + 4 && x < CFS.x1 - 4 && z > CFS.z0 + 4 && z < CFS.z1 - 4;
    };
    cf.trees = 0;
    for (let k = 0; k < 600 && cf.trees < 90; k++) {
      const x = rng.range(CFS.x0 + 6, CFS.x1 - 6), z = rng.range(CFS.z0 + 6, CFS.z1 - 6);
      if (tNoise(x / 70, z / 70, 51) < 0.05 || !clearOf(x, z, 4)) continue;
      const b = tileAt(x, z), y = gy(x, z), s = rng.range(0.85, 1.35);
      this._det(b, 'cyl', x, y + 1.4 * s, z, 0.22 * s, 2.8 * s, 0x5a4330, null, { x, z, r: 0.35 * s, y0: y - 1, y1: y + 3 * s, kind: 'det' });
      [[2.2, 2.3, 2.6, 0x264a2c], [1.75, 2.0, 4.1, 0x2c5232], [1.25, 1.8, 5.4, 0x325b37], [0.7, 1.4, 6.5, 0x3a643c]].forEach(([r, h, yy, c], i) => this._det(b, 'fir', x, y + yy * s, z, r * s, h * s, r * s, C(c), i * 0.6));
      cf.trees++;
    }
    // ---------------------------------------------------------------- routes for the GPS and AI drivers (polylines, two-way)
    // from the turning circle round to the office; through garage 6 to the pit lane and out of its exit onto the
    // oval (the loop joins the routes there, at the front straight's west end)
    cf.joinK = T.pts.reduce((b2, p, k) => Math.hypot(p[0] - PW.exit[2][0] + 6, p[1] - O.verts[0][1]) < Math.hypot(T.pts[b2][0] - PW.exit[2][0] + 6, T.pts[b2][1] - O.verts[0][1]) ? k : b2, 0);
    const cj = T.pts[cf.joinK], ex = [R0.x - R0.r, R0.z], gc = gxa + cell * 5.5;
    cf.roads = [
      gatePts,
      [ex, [R0.x, R0.z + R0.r + 2], [R0.x + R0.r + 2, R0.z], [O.office.x0 - 4, (O.office.z0 + O.office.z1) / 2]],
      [[R0.x + R0.r + 2, R0.z], [gc, gza - 8], [gc, (gza + gzb) / 2], [gc, PW.z], [PW.exit[0][0], PW.z], PW.exit[1], cj]
    ];
    cf.road0 = ex;
    // colliders for the district's buildings and details
    for (const b of cf.blocks) {
      for (const bl of b.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
      for (const d of b.det) if (d.col) this.grid.add(d.col);
    }
    this.mapPlaces.push({ id: 'oval', name: O.name, cat: 'landmark', icon: 'R', x: O.office.x0 - 6, z: (O.office.z0 + O.office.z1) / 2, sub: `A ${(T.len / 1000).toFixed(1)} km banked oval, twelve pit garages · the Southshore Motorsport Complex` });
  }
});
