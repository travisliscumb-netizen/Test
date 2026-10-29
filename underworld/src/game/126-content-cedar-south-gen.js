/* =====================================================================
   [CONTENT] CEDAR FIELDS SOUTH: GENERATION (Session 6C, §45.36)
   The countryside south of the city, reached from Cedar Fields Road by
   the farm track, the perimeter road and the land bridge:
   - the ground is the height field (027): hills, hollows, rock and mud,
     dirt tracks with ruts, level gravel pads where things are built;
   - the off-road course: a closed loop of about 1 km, 12 m wide, of
     straights and fillets (filletLoop), with whoops, two jumps, a mud
     wallow, a rock garden and a cambered bend stamped into the ground;
   - the off-road park's compound beside it: the Course Office (the place
     you use), a six-bay garage shed (the registry's physical spaces for
     the owner), a service stand, the timing tower and a spectator bank;
   - the land bridge's dirt road, a Links spur from the south perimeter
     road to a turning circle in the compound forecourt (traffic, the GPS,
     taxis and the police use it), and the countryside's tracks for the
     GPS and AI drivers (world.cfs.roads);
   - trees, rocks, hay bales and a shore fence. Everything that is not
     ground streams as district blocks (world.xblocks) like Valen Point.
   ===================================================================== */
const CFS_COURSE = {
  w: 12, step: 2,
  // corners [x, z, radius], driven in this order (east along the start straight first)
  verts: [[340, 1180, 25], [620, 1175, 35], [650, 1300, 30], [560, 1330, 20], [600, 1440, 30], [420, 1460, 35], [380, 1350, 22], [320, 1290, 25]],
  sfX: 450
};
const CFS_SITE = {
  land: { x0: 186, z0: 1040, x1: 214, z1: 1062 },
  compound: { x0: 330, z0: 1086, x1: 470, z1: 1166 },
  ring: { x: 345, z: 1112, r: 12 },
  office: { x0: 440, x1: 462, z0: 1092, z1: 1108 },
  shed: { x0: 372, x1: 399, z0: 1124, z1: 1132, bay: 4.5 },
  stand: { x0: 403, x1: 412, z0: 1122, z1: 1134 },
  bank: { x0: 452, x1: 468, z0: 1148, z1: 1165 }
};
// the course's features, by where they start (a fraction of the lap after the start/finish line) and their kind
const CFS_FEATURES = [
  { kind: 'whoops', f: 0.04, len: 55, h: 0.45, n: 5, straight: true },
  { kind: 'jump', f: 0.2, len: 24, h: 1.5, straight: true },
  { kind: 'mud', f: 0.33, len: 45, h: 0.2 },
  { kind: 'rock', f: 0.47, len: 60 },
  { kind: 'camber', f: 0.6, len: 70, h: 1.2, bend: true },
  { kind: 'whoops', f: 0.76, len: 45, h: 0.35, n: 4, straight: true },
  { kind: 'jump', f: 0.88, len: 20, h: 1.0, straight: true }
];
// the course's centreline (filletLoop), with the start/finish sample
function cfsCourseLine() {
  const T = filletLoop(CFS_COURSE.verts, CFS_COURSE.step);
  T.sfK = T.pts.findIndex((p, k) => T.R[k] === 0 && Math.abs(p[0] - CFS_COURSE.sfX) <= CFS_COURSE.step && p[1] < 1200);
  T.sfAlong = T.cum[T.sfK];
  return T;
}
Object.assign(World.prototype, {
  _genCedarSouth() {
    const T = cfsCourseLine(), S = CFS_SITE, O0 = S.office, rng = new RNG(6301);
    const tracks = [], pads = [];
    // ---------------------------------------------------------------- level pads (their height from the hills they sit in)
    const padY = r => clamp(Terrain.raw((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), 0.6, 5);
    const landY = 0.9;
    pads.push({ ...S.land, y: landY }, { ...S.compound, y: padY(S.compound) });
    const Yc = pads[1].y;
    // ---------------------------------------------------------------- the course and its features (along from pts[0])
    const len = T.len, inStraight = (a, l) => { for (let d = 0; d <= l; d += 2) { const k = this._cfsK(T, (a + d) % len); if (T.R[k] > 0) return false; } return true; };
    const inBend = (a, l) => { const k = this._cfsK(T, (a + l / 2) % len); return T.R[k] > 0; };
    const features = [];
    for (const F of CFS_FEATURES) {
      let at = (T.sfAlong + F.f * len) % len;
      // slide forward to the first place it fits (a straight for whoops and jumps, a bend for the camber)
      for (let tries = 0; tries < 400; tries++, at = (at + 2) % len) if ((!F.straight || inStraight(at, F.len)) && (!F.bend || inBend(at, F.len)) && at + F.len < len) break;
      features.push({ kind: F.kind, at, len: F.len, h: F.h || 0, n: F.n || 1 });
    }
    // ---------------------------------------------------------------- the spur: perimeter road → land bridge → compound
    const R0 = S.ring, lb = CFS.lb;
    const spurPts = splinePts([[lb.x, lb.z0], [lb.x, CFS.z0], [lb.x + 2, 1064], [216, 1084], [240, 1098], [272, 1107], [R0.x - R0.r, R0.z]]);
    this.localRoads.push({ k: 'line', link: 'Cedar Fields Track', spur: true, w: lb.road * 2, pts: spurPts, ring: R0, mat: 'dirt' });
    tracks.push({ pts: spurPts.filter(p => p[1] >= CFS.z0 - 1), w: lb.road * 2 + 1 });
    // the countryside loop (west fields, south hills and back), from the spur and back to it further along (both ends
    // are spur vertices, so the GPS joins them): the illegal races' ground
    const onSpur = (x, z) => spurPts.reduce((b2, p) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(b2[0] - x, b2[1] - z) ? p : b2);
    const la = onSpur(200, 1068), lz = onSpur(270, 1106);
    const loop = splinePts([la, [160, 1084], [90, 1112], [40, 1200], [52, 1320], [140, 1420], [255, 1445], [305, 1370], [258, 1260], [282, 1172], [306, 1124], lz], 2.5);
    tracks.push({ pts: loop, w: 8 });
    // a farm track east past the compound to the far fields, and back round the course's north side
    const east = splinePts([[O0.x1 + 4, O0.z0 - 2], [540, 1102], [630, 1094], [662, 1150], [668, 1230]], 2.5);
    tracks.push({ pts: east, w: 7 });
    this.cfs = { pads, tracks, course: { pts: T.pts, w: CFS_COURSE.w, features, closed: true }, landY, track: T, site: S, Yc, loop, east, spur: spurPts, bays: [], blocks: [] };
    // ---------------------------------------------------------------- the ground
    Terrain.build(this);
    const gy = (x, z) => { const y = Terrain.height(x, z); return y === null ? 0 : y - Terrain.rough; };
    const cf = this.cfs, wall = (x0, z0, x1, z1, y1 = 1.2, y0 = -5) => this.grid.add({ x0, z0, x1, z1, y0, y1, kind: 'wall' });
    // ---------------------------------------------------------------- district blocks (for streaming)
    const blk = (id, cx, cz, r, name) => { const b = this._vpBlock(id, cx - P / 2, cz - P / 2, r, name || CFS.name); b.t = 'S'; cf.blocks.push(b); return b; };
    const B = { compound: blk('cfs_compound', 400, 1126, 90, 'Cedar Fields Off-Road Park'), course: blk('cfs_course', 490, 1320, 220, 'Cedar Fields off-road course') };
    // the countryside in tiles: trees, rocks and bales stream with them
    const tiles = [];
    for (let tz = 0; tz < 3; tz++) for (let tx = 0; tx < 5; tx++) { const x0 = CFS.x0 + tx * 140, z0 = CFS.z0 + tz * 150; tiles.push({ x0, z0, x1: x0 + 140, z1: z0 + 150, b: blk('cfs_' + tx + '_' + tz, x0 + 70, z0 + 75, 110) }); }
    const tileAt = (x, z) => (tiles.find(t => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) || tiles[0]).b;
    // ---------------------------------------------------------------- the shore: a post-and-rail fence all round (and its colliders)
    cf.fence = [[CFS.x0 + 1, CFS.z0 + 1, lb.x - lb.half, CFS.z0 + 1], [lb.x + lb.half, CFS.z0 + 1, CFS.x1 - 1, CFS.z0 + 1], [CFS.x1 - 1, CFS.z0 + 1, CFS.x1 - 1, CFS.z1 - 1], [CFS.x1 - 1, CFS.z1 - 1, CFS.x0 + 1, CFS.z1 - 1], [CFS.x0 + 1, CFS.z1 - 1, CFS.x0 + 1, CFS.z0 + 1]];
    for (const [x0, z0, x1, z1] of cf.fence) wall(Math.min(x0, x1) - 0.2, Math.min(z0, z1) - 0.2, Math.max(x0, x1) + 0.2, Math.max(z0, z1) + 0.2, 6);
    // the land bridge's rails, from the seawall out
    cf.rails = [[lb.x - lb.half + 0.4, CITY + EDGE_MARGIN, lb.x - lb.half + 0.4, CFS.z0 + 1], [lb.x + lb.half - 0.4, CITY + EDGE_MARGIN, lb.x + lb.half - 0.4, CFS.z0 + 1]];
    for (const [x0, z0, x1, z1] of cf.rails) wall(x0 - 0.2, z0, x1 + 0.2, z1, 3);
    // ---------------------------------------------------------------- the compound
    const bc = B.compound;
    const O = S.office;
    this._bld(bc, O.x0, O.z0, O.x1, O.z1, 7, STYLE.WARE, 0x7a5a3a, 3.4, 4, { exactH: true, y0: Yc, oy: Yc, roof: 'gable', roofColor: 0x3a3d40 });
    bc.signs.push({ text: 'COURSE OFFICE', x: O.x0 - 0.06, y: Yc + 4.6, z: (O.z0 + O.z1) / 2, ry: -Math.PI / 2, w: 8, h: 1.1, bg: '#2a2016', fg: '#f2c230' });
    this._det(bc, 'box', O.x0 - 0.06, Yc + 1.2, (O.z0 + O.z1) / 2, 0.12, 2.4, 1.4, C(0x22262b));
    bc.fx.push({ type: 'canopy', x: O.x0 - 0.6, y: Yc + 2.9, z: (O.z0 + O.z1) / 2, w: 1, d: 1.6 });
    bc.place = { id: 'offroad', name: 'Cedar Fields Off-Road Park', kind: 'landmark', door: { x: O.x0 - 1.1, z: (O.z0 + O.z1) / 2, h: -Math.PI / 2 }, under: { x: (O.x0 + O.x1) / 2, z: (O.z0 + O.z1) / 2 } };
    // the garage shed: six open bays facing the forecourt, a back wall, dividers and a roof
    const G = S.shed, nb = Math.round((G.x1 - G.x0) / G.bay);
    this._det(bc, 'box', (G.x0 + G.x1) / 2, Yc + 2.2, G.z0 - 0.2, G.x1 - G.x0 + 0.4, 4.4, 0.4, C(0x8a8f94), 0, true);
    for (let i = 0; i <= nb; i++) { const x = G.x0 + i * G.bay; this._det(bc, 'box', x, Yc + 2.2, (G.z0 + G.z1) / 2, 0.25, 4.4, G.z1 - G.z0, C(0x8a8f94), 0, true); }
    this._det(bc, 'box', (G.x0 + G.x1) / 2, Yc + 4.55, (G.z0 + G.z1) / 2 + 0.6, G.x1 - G.x0 + 1, 0.3, G.z1 - G.z0 + 1.6, C(0x5a3a2a));
    bc.signs.push({ text: 'OWNERS’ GARAGE', x: (G.x0 + G.x1) / 2, y: Yc + 4.0, z: G.z1 + 1.35, ry: 0, w: 9, h: 0.8, bg: '#2a2016', fg: '#ffffff' });
    for (let i = 0; i < nb; i++) {
      const x = G.x0 + G.bay * (i + 0.5);
      cf.bays.push({ x, z: (G.z0 + G.z1) / 2 + 0.6, h: Math.PI, y: Yc, garage: i + 1 });
      this._det(bc, 'box', x, Yc + 0.035, (G.z0 + G.z1) / 2 + 0.6, G.bay - 0.6, 0.02, G.z1 - G.z0 - 0.4, C(0x6a6458));
    }
    // the service stand: a covered bay with a lift, beside the shed
    const SS = S.stand;
    for (const [x, z] of [[SS.x0, SS.z0], [SS.x1, SS.z0], [SS.x0, SS.z1], [SS.x1, SS.z1]]) this._det(bc, 'box', x, Yc + 2.1, z, 0.3, 4.2, 0.3, C(0x2a2e33), 0, true);
    this._det(bc, 'box', (SS.x0 + SS.x1) / 2, Yc + 4.3, (SS.z0 + SS.z1) / 2, SS.x1 - SS.x0 + 0.8, 0.25, SS.z1 - SS.z0 + 0.8, C(0xc8102e));
    for (const sx of [-1.1, 1.1]) this._det(bc, 'box', (SS.x0 + SS.x1) / 2 + sx, Yc + 0.08, (SS.z0 + SS.z1) / 2, 0.5, 0.16, 6, C(0xe8c04a));
    bc.signs.push({ text: 'SERVICE', x: (SS.x0 + SS.x1) / 2, y: Yc + 3.8, z: SS.z1 + 0.45, ry: 0, w: 4, h: 0.7, bg: '#c8102e', fg: '#ffffff' });
    cf.stand = SS;
    // the park's gate on the spur and its sign
    for (const s2 of [-1, 1]) this._det(bc, 'box', S.compound.x0 + 2, Yc + 3, R0.z + s2 * 7, 0.5, 6, 0.5, C(0x5a3a2a), 0, true);
    this._det(bc, 'box', S.compound.x0 + 2, Yc + 5.8, R0.z, 0.6, 0.9, 14.6, C(0x5a3a2a));
    bc.signs.push({ text: 'CEDAR FIELDS OFF-ROAD PARK', x: S.compound.x0 + 1.6, y: Yc + 5.8, z: R0.z, ry: -Math.PI / 2, w: 12, h: 0.8, bg: '#2a2016', fg: '#f2c230' });
    // the turning circle's island
    this._det(bc, 'cyl', R0.x, Yc + 0.25, R0.z, 4, 0.5, 0x6f8a5a, null, { x: R0.x, z: R0.z, r: 4, y0: -1, y1: Yc + 0.5, kind: 'det' });
    // the timing tower at the start/finish line and the spectator bank
    const sf = T.pts[T.sfK], tx = sf[0], tz = sf[1] - CFS_COURSE.w / 2 - 4;
    this._bld(bc, tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5, 8, STYLE.IND, 0xd8dade, 4, 3, { exactH: true, y0: gy(tx, tz), oy: gy(tx, tz) });
    bc.signs.push({ text: 'START · FINISH', x: tx, y: gy(tx, tz) + 7, z: tz + 2.56, ry: 0, w: 4.6, h: 0.8, bg: '#14181c', fg: '#ff6b4a' });
    cf.sf = { k: T.sfK, x: sf[0], z: sf[1], along: T.sfAlong };
    const BK = S.bank;
    for (let t = 0; t < 4; t++) { const z1 = BK.z0 + t * 4, h = 0.6 + t * 0.9; this._bld(bc, BK.x0, z1, BK.x1, z1 + 4, h, STYLE.IND, 0x9aa0a6, h, 4, { exactH: true, y0: Yc, oy: Yc, far: t === 3 }); }
    // ---------------------------------------------------------------- the course: marker poles both sides, tyre stacks on the bends
    const half = CFS_COURSE.w / 2, bco = B.course;
    for (let k = 0; k < T.pts.length; k += 6) {
      const p = T.pts[k], nl = T.nl[k];
      for (const s2 of [1, -1]) {
        const x = p[0] + nl[0] * s2 * (half + 1.2), z = p[1] + nl[1] * s2 * (half + 1.2);
        if (T.R[k] > 0 && k % 12 === 0) this._det(bco, 'cyl', x, gy(x, z) + 0.45, z, 0.55, 0.9, 0x1d1f22, null, { x, z, r: 0.6, y0: gy(x, z) - 1, y1: gy(x, z) + 0.9, kind: 'det' });
        else this._det(bco, 'cyl', x, gy(x, z) + 0.6, z, 0.05, 1.2, (k / 6) % 2 ? 0xff6b1a : 0xf2f2f2);
      }
    }
    // the start/finish gantry over the course
    for (const s2 of [1, -1]) { const x = sf[0], z = sf[1] + s2 * (half + 1.5); this._det(bco, 'box', x, gy(x, z) + 3, z, 0.4, 6, 0.4, 0x2a2e33, 0, true); }
    this._det(bco, 'box', sf[0], gy(sf[0], sf[1]) + 5.8, sf[1], 0.5, 0.8, CFS_COURSE.w + 3.4, C(0xff6b1a));
    // ---------------------------------------------------------------- the countryside: trees, rocks, bales (clear of tracks, the course, pads)
    const clearOf = (x, z, m) => {
      for (const P2 of pads) if (x > P2.x0 - m && x < P2.x1 + m && z > P2.z0 - m && z < P2.z1 + m) return false;
      for (const L of [...tracks, { pts: T.pts, w: CFS_COURSE.w + 8 }]) for (let k = 0; k < L.pts.length - 1; k += 2) { const a = L.pts[k], b2 = L.pts[Math.min(L.pts.length - 1, k + 2)]; if (segDist(x, z, a[0], a[1], b2[0], b2[1]) < L.w / 2 + m) return false; }
      return x > CFS.x0 + 4 && x < CFS.x1 - 4 && z > CFS.z0 + 4 && z < CFS.z1 - 4;
    };
    cf.trees = 0;
    for (let k = 0; k < 900 && cf.trees < 260; k++) {
      // copses: trees gather where a slow noise is high
      const x = rng.range(CFS.x0 + 6, CFS.x1 - 6), z = rng.range(CFS.z0 + 6, CFS.z1 - 6);
      if (tNoise(x / 70, z / 70, 51) < 0.05 || !clearOf(x, z, 4)) continue;
      const b = tileAt(x, z), y = gy(x, z), s = rng.range(0.85, 1.35), pine = rng.chance(0.55);
      this._det(b, 'cyl', x, y + 1.4 * s, z, 0.22 * s, 2.8 * s, 0x5a4330, null, { x, z, r: 0.35 * s, y0: y - 1, y1: y + 3 * s, kind: 'det' });
      // firs in tiers of boughs, broadleaves as a canopy of leaf clumps (G3; they were a cone and a box)
      if (pine) [[2.2, 2.3, 2.6, 0x264a2c], [1.75, 2.0, 4.1, 0x2c5232], [1.25, 1.8, 5.4, 0x325b37], [0.7, 1.4, 6.5, 0x3a643c]].forEach(([r, h, yy, c], i) => this._det(b, 'fir', x, y + yy * s, z, r * s, h * s, r * s, C(c), i * 0.8 + x));
      else {
        const ry0 = rng.range(0, 6);
        this._det(b, 'blob', x, y + 3.7 * s, z, 2.1 * s, 1.7 * s, 2.1 * s, C(0x3e6a2e), ry0);
        for (let q = 0; q < 4; q++) { const a = ry0 + q * 1.57 + rng.range(-0.3, 0.3); this._det(b, 'blob', x + Math.cos(a) * 1.3 * s, y + (3.2 + rng.range(0, 1.2)) * s, z + Math.sin(a) * 1.3 * s, 1.3 * s, 1.1 * s, 1.3 * s, C([0x4a7a3a, 0x3a6630, 0x54843f, 0x456f35][q]), a); }
      }
      cf.trees++;
    }
    cf.rocks = 0;
    for (let k = 0; k < 1500 && cf.rocks < 120; k++) {
      const x = rng.range(CFS.x0 + 6, CFS.x1 - 6), z = rng.range(CFS.z0 + 6, CFS.z1 - 6);
      if (Terrain.surf(x, z) !== TSURF.rock || !clearOf(x, z, 2)) continue;
      const b = tileAt(x, z), y = gy(x, z), s = rng.range(0.6, 1.8);
      this._det(b, 'box', x, y + 0.25 * s, z, 1.3 * s, 0.9 * s, 1.1 * s, C(0x7d776d), rng.range(0, 3), { x, z, r: 0.6 * s, y0: y - 1, y1: y + 0.6 * s, kind: 'det' });
      cf.rocks++;
    }
    for (let k = 0; k < 14; k++) {
      const x = rng.range(60, 300), z = rng.range(1090, 1240); if (!clearOf(x, z, 3)) continue;
      const b = tileAt(x, z), y = gy(x, z);
      this._det(b, 'cyl', x, y + 0.6, z, 0.75, 1.2, 0xd8b45a, null, { x, z, r: 0.8, y0: y - 1, y1: y + 1.2, kind: 'det' });
    }
    // ---------------------------------------------------------------- routes for the GPS and AI drivers (polylines, two-way), from the spur's far end
    const ex = [R0.x - R0.r, R0.z];
    // the course joins at a sample 30 m before the line, off the paddock
    cf.joinK = (T.sfK - 15 + T.pts.length) % T.pts.length;
    const cj = T.pts[cf.joinK];
    cf.roads = [
      [ex, [R0.x, R0.z - R0.r - 2], [R0.x + R0.r + 2, R0.z], [O.x0 - 6, (O.z0 + O.z1) / 2]],
      [[R0.x + R0.r + 2, R0.z], [(G.x0 + G.x1) / 2, G.z1 + 6]],
      [[R0.x + R0.r + 2, R0.z], [(SS.x0 + SS.x1) / 2, SS.z1 + 6]],
      [[R0.x + R0.r + 2, R0.z], [cj[0], S.compound.z1 + 2], cj],
      // the two tracks at their full resolution (the 2.5 m spline samples): routes follow the bends, not chords
      [[O.x0 - 6, (O.z0 + O.z1) / 2], [O.x0 - 6, O.z0 - 6], [O.x1 + 4, O.z0 - 6], ...east],
      loop
    ];
    cf.road0 = ex;
    // colliders for the district's buildings and details
    for (const b of cf.blocks) {
      for (const bl of b.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
      for (const d of b.det) if (d.col) this.grid.add(d.col);
    }
    this.mapPlaces.push({ id: 'offroad', name: 'Cedar Fields Off-Road Park', cat: 'landmark', icon: 'O', x: (O.x0 + O.x1) / 2, z: O.z0 - 2, sub: 'Off-road course and compound · across the land bridge' });
  },
  // the course sample at distance `a` along it
  _cfsK(T, a) { let lo = 0, hi = T.pts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T.cum[m] <= a) lo = m; else hi = m - 1; } return lo; }
});
