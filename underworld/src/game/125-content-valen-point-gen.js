/* =====================================================================
   [CONTENT] VALEN POINT: GENERATION (Session 6B, §45.34)
   The motorsport park on the island east of the city:
   - the circuit: straights joined by constant-radius arcs (a fillet at
     every corner of VP_TRACK.verts), about 3.2 km a lap, 14 m wide: a
     430 m main straight, a 680 m back straight and a 660 m east straight
     joined by broad 110–150 m sweepers, an infield of two slow hairpins
     (40–45 m) and medium corners (60–80 m);
   - run-off and barriers: armco on both sides, further out on the
     outside of the faster corners, with gaps where the pit lane merges;
   - the pit lane beside the main straight behind a pit wall, twelve
     drive-through pit garages (two parking bays each), the paddock with
     Race Control, two grandstands, two spectator car parks, the main
     entrance and the causeway's turning circle;
   - the Valen Point annex of the police impound (an overflow yard).
   District geometry lives in extra blocks (world.xblocks) so the chunk
   manager streams it like city blocks; the big flat surfaces (ground,
   track, kerbs, lines) and the barriers are a few merged meshes built by
   ValenPointScenery and swapped for a far version with distance.
   ===================================================================== */
const VP_TRACK = {
  w: 14,
  // corners: [x, z, radius]; the main straight runs north along x = 1600 (start/finish at z = VP_TRACK.sf)
  verts: [[1600, 230, 130], [2280, 200, 150], [2300, 860, 110], [1990, 850, 45], [1960, 560, 40], [1760, 540, 60], [1760, 860, 80], [1600, 860, 70]],
  sf: 600, step: 2
};
// the pit complex beside the main straight
const VP_PIT = { laneX: 1577, laneW: 10, wallX: 1587, wall: [445, 725], lane: [430, 740], garX: [1533, 1570], garZ: [450, 690], cell: 20,
  entry: [[1593, 795], [1582, 768], [1577, 740]], exit: [[1577, 430], [1582, 405], [1593, 378]] };
const VP_SITE = {
  office: { x0: 1470, x1: 1500, z0: 560, z1: 590 },
  ring: { x: 1474, z: 520, r: 14 },
  paddock: { x0: 1446, x1: 1530, z0: 300, z1: 790 },
  parkN: { x0: 1446, x1: 1530, z0: 232, z1: 296 },
  parkS: { x0: 1446, x1: 1530, z0: 800, z1: 900 },
  standN: { x0: 1537, x1: 1570, z0: 290, z1: 440 },
  standS: { x0: 1537, x1: 1570, z0: 700, z1: 795 },
  annex: { ox: 1446, oz: 150 }
};
// the circuit's centreline: { pts: [[x, z]...], cum, len, R (local radius, 0 on straights), n (left normal) }
function vpTrackLine() {
  const V = VP_TRACK.verts, n = V.length, segs = [];
  const unit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
  // each corner: the tangent points and the arc between them
  const C = V.map((v, k) => {
    const a = unit(V[(k - 1 + n) % n], v), b = unit(v, V[(k + 1) % n]), R = v[2];
    const th = Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1)), t = R * Math.tan(th / 2);
    const cross = a[0] * b[1] - a[1] * b[0], s = cross > 0 ? 1 : -1;          // +1 a right-hand (clockwise) corner
    const t1 = [v[0] - a[0] * t, v[1] - a[1] * t], t2 = [v[0] + b[0] * t, v[1] + b[1] * t];
    const nrm = [-a[1] * s, a[0] * s], cen = [t1[0] + nrm[0] * R, t1[1] + nrm[1] * R];
    return { t1, t2, cen, R, th, s, t };
  });
  const pts = [], Rs = [], step = VP_TRACK.step;
  const push = (p, R) => { pts.push(p); Rs.push(R); };
  for (let k = 0; k < n; k++) {
    const c = C[k], nx = C[(k + 1) % n];
    // the arc round corner k
    const a0 = Math.atan2(c.t1[1] - c.cen[1], c.t1[0] - c.cen[0]), arcLen = c.R * c.th, m = Math.max(2, Math.ceil(arcLen / step));
    for (let i = 0; i < m; i++) { const a = a0 + c.s * c.th * i / m; push([c.cen[0] + Math.cos(a) * c.R, c.cen[1] + Math.sin(a) * c.R], c.R); }
    // the straight to the next corner
    const L = Math.hypot(nx.t1[0] - c.t2[0], nx.t1[1] - c.t2[1]), ms = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < ms; i++) push([lerp(c.t2[0], nx.t1[0], i / ms), lerp(c.t2[1], nx.t1[1], i / ms)], 0);
  }
  const cum = [0];
  for (let k = 1; k <= pts.length; k++) { const a = pts[k - 1], b = pts[k % pts.length]; cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  // left normals (of the direction of travel)
  const nl = pts.map((p, k) => { const a = pts[(k - 1 + pts.length) % pts.length], b = pts[(k + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; });
  // the tangent lengths fit their straights (checked by tests/motorsport.mjs)
  const fits = C.every((c, k) => c.t + C[(k + 1) % n].t <= Math.hypot(V[(k + 1) % n][0] - V[k][0], V[(k + 1) % n][1] - V[k][1]) + 1e-6);
  return { pts, R: Rs, cum, len: cum[pts.length], nl, corners: C, fits };
}
Object.assign(World.prototype, {
  // a district block: the same shape as a city block (so the chunk manager, far skyline, colliders, places and
  // compounds all take it) on a lattice origin (ox, oz) east of the city; r: how far its contents reach from the centre
  _vpBlock(id, ox, oz, r, name) {
    const b = { bx: -1, bz: -1, t: 'V', i: 1000 + this.xblocks.length, xb: id, offMap: true, noPeds: true,
      x0: ox + INNER, z0: oz + INNER, x1: ox + P - INNER, z1: oz + P - INNER, cx: ox + P / 2, cz: oz + P / 2, r,
      bld: [], det: [], props: [], parked: [], signs: [], billboards: [], fx: [], secrets: [], seats: [], water: [], special: null, name: name || VP.name };
    this.xblocks.push(b);
    return b;
  },
  _genValenPoint() {
    this.xblocks = [];
    const T = vpTrackLine(), Y = 0, wall = (x0, z0, x1, z1, y1 = 1.2) => this.grid.add({ x0, z0, x1, z1, y0: -5, y1, kind: 'wall' });
    const vp = this.vp = { track: T, bays: [], barriers: [], sf: null, pit: VP_PIT, site: VP_SITE };
    // ---------------------------------------------------------------- the island's edge and the causeway's rails
    const g0 = VP.cw.z - VP.cw.half, g1 = VP.cw.z + VP.cw.half;
    wall(VP.x0 - 1, VP.z0 - 1, VP.x1 + 1, VP.z0, 3); wall(VP.x0 - 1, VP.z1, VP.x1 + 1, VP.z1 + 1, 3); wall(VP.x1, VP.z0, VP.x1 + 1, VP.z1, 3);
    wall(VP.x0 - 1, VP.z0, VP.x0, g0, 3); wall(VP.x0 - 1, g1, VP.x0, VP.z1, 3);
    wall(CITY + EDGE_MARGIN, g0 - 0.4, VP.x0, g0); wall(CITY + EDGE_MARGIN, g1, VP.x0, g1 + 0.4);
    // ---------------------------------------------------------------- barriers: armco each side, run-off by corner speed
    // offset from the centreline: 7 m of track and a run-off that grows on the outside of faster corners and
    // eases in over 50 m; the main straight's west side is the pit wall / catch fence line
    const half = VP_TRACK.w / 2, N2 = T.pts.length, step = VP_TRACK.step;
    const runOut = R => R <= 0 ? 12 : R < 60 ? 18 : R < 100 ? 22 : 28;
    const ease = (k, f) => { let best = f(k); for (let d = 1; d <= 25; d++) { const w = 1 - d / 26; best = Math.max(best, f((k + d) % N2) * w, f((k - d + N2) % N2) * w); } return best; };
    // +1 a right-hand bend (x right, z down: clockwise on the map), whose outside is the left; −1 a left-hand bend
    const turn = k => T.R[k] > 0 ? Math.sign(this._vpTurn(T, k)) : 0;
    const offL = k => half + ease(k, i => turn(i) > 0 ? runOut(T.R[i]) : T.R[i] > 0 ? 4 : 12);
    const offR = k => half + ease(k, i => turn(i) < 0 ? runOut(T.R[i]) : T.R[i] > 0 ? 4 : 12);
    const mainSt = (x, z) => Math.abs(x - VP_TRACK.verts[0][0]) < 1 && z > 360 && z < 790;
    const pitGap = z => (z > 372 && z < 448) || (z > 722 && z < 800);
    for (const side of [1, -1]) {
      const line = [];
      for (let k = 0; k < N2; k++) {
        const p = T.pts[k], nl = T.nl[k];
        let off = side > 0 ? offL(k) : offR(k);
        const west = p[0] + nl[0] * side * off < p[0];
        if (mainSt(p[0], p[1]) && west) { off = VP_PIT.wallX - p[0] < 0 ? p[0] - VP_PIT.wallX : off; if (pitGap(p[1])) { line.push(null); continue; } }
        line.push([p[0] + nl[0] * side * off, p[1] + nl[1] * side * off]);
      }
      vp.barriers.push(line);
      // colliders: posts a metre apart along the rail (smooth enough to slide along, round enough for curves)
      for (let k = 0; k < N2; k++) {
        const a = line[k], b2 = line[(k + 1) % N2]; if (!a || !b2) continue;
        const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]), m = Math.max(1, Math.round(L / 1.0));
        for (let i = 0; i < m; i++) this.grid.add({ x: lerp(a[0], b2[0], i / m), z: lerp(a[1], b2[1], i / m), r: 0.45, y0: -1, y1: 1.1, kind: 'det', barrier: true });
      }
    }
    // the pit wall between the pit lane and the main straight
    wall(VP_PIT.wallX - 0.4, VP_PIT.wall[0], VP_PIT.wallX + 0.4, VP_PIT.wall[1], 1.2);
    // ---------------------------------------------------------------- start / finish: the timing line and a gantry
    const sfK = T.pts.findIndex(p => Math.abs(p[0] - VP_TRACK.verts[0][0]) < 1 && Math.abs(p[1] - VP_TRACK.sf) <= step);
    vp.sf = { k: sfK, x: T.pts[sfK][0], z: T.pts[sfK][1], along: T.cum[sfK] };
    const B = {};
    B.pits = this._vpBlock('pits', 1520, 530, 240, 'Valen Point pits');
    B.pad = this._vpBlock('paddock', 1448, 500, 300, 'Valen Point paddock');
    B.north = this._vpBlock('north', 1515, 330, 160, 'North grandstand');
    B.south = this._vpBlock('south', 1515, 730, 140, 'South grandstand');
    B.track = this._vpBlock('track', 1880, 480, 520, 'Valen Point circuit');
    const sfb = B.pits;
    const gx0 = VP_PIT.wallX + 0.6, gx1 = VP.x0 + 0;
    this._det(sfb, 'box', gx0, Y + 4.5, vp.sf.z, 0.6, 9, 0.6, 0x2a2e33, 0, true);
    this._det(sfb, 'box', vp.sf.x + half + 4, Y + 4.5, vp.sf.z, 0.6, 9, 0.6, 0x2a2e33, 0, true);
    this._det(sfb, 'box', (gx0 + vp.sf.x + half + 4) / 2, Y + 8.6, vp.sf.z, vp.sf.x + half + 4 - gx0 + 0.6, 1.4, 1.0, 0x1d2126);
    for (let k = 0; k < 5; k++) sfb.fx.push({ type: 'neon', x: vp.sf.x - 6 + k * 3, y: Y + 7.8, z: vp.sf.z - 0.55, w: 0.6, h: 0.6, d: 0.1, c: 0xff2a2a });
    sfb.signs.push({ text: 'VALEN POINT', x: (gx0 + vp.sf.x + half + 4) / 2, y: Y + 8.6, z: vp.sf.z + 0.52, ry: 0, w: 14, h: 1.2, bg: '#1d2126', fg: '#ffffff' });
    void gx1;
    // ---------------------------------------------------------------- pit garages: drive-through, two bays each
    const [gxa, gxb] = VP_PIT.garX, [gz0, gz1] = VP_PIT.garZ, cell = VP_PIT.cell, n = Math.round((gz1 - gz0) / cell);
    for (let i = 0; i <= n; i++) { const z = gz0 + i * cell; this._bld(B.pits, gxa, z - 0.3, gxb, z + 0.3, 5.6, STYLE.IND, 0xd8dade, 5.6, 4, { exactH: true, y0: Y, oy: Y }); }
    // the pit building over the garages: hospitality and timing, glass on the pit side
    this._bld(B.pits, gxa, gz0 - 0.3, gxb, gz1 + 0.3, 7, STYLE.GLASS, 0x3a4652, 3.5, 4, { exactH: true, y0: Y + 5.6, oy: Y, far: true });
    for (let i = 0; i < n; i++) {
      const zc = gz0 + cell * (i + 0.5);
      for (const dz of [-4.5, 4.5]) vp.bays.push({ x: (gxa + gxb) / 2, z: zc + dz, h: Math.PI / 2, y: Y, garage: i + 1 });
      // garage number board over the pit-lane opening, floor paint
      B.pits.signs.push({ text: String(i + 1), x: gxb + 0.05, y: Y + 4.7, z: zc, ry: Math.PI / 2, w: 2.2, h: 1.2, bg: '#c8102e', fg: '#ffffff' });
      this._det(B.pits, 'box', (gxa + gxb) / 2, Y + 0.012, zc, gxb - gxa - 1, 0.02, cell - 1.4, C(0x5a5e63));
    }
    // ---------------------------------------------------------------- grandstands: tiers rising away from the track
    const stand = (b, S) => {
      for (let t = 0; t < 6; t++) {
        const x1 = S.x1 - t * 5, h = 1 + t * 1.3;
        this._bld(b, x1 - 5, S.z0, x1, S.z1, h, STYLE.IND, 0x9aa0a6, h, 5, { exactH: true, y0: Y, oy: Y, far: t === 5 });
        // a crowd on each tier (static, cheap: part of the chunk's detail mesh)
        for (let z = S.z0 + 1.5; z < S.z1 - 1; z += 1.6) if (hash2i(Math.floor(z * 3), t, 41) < 0.62) this._det(b, 'box', x1 - 2.5 + (hash2i(Math.floor(z), t, 43) - 0.5), Y + h + 0.45, z, 0.5, 0.9, 0.45, C([0xc0392b, 0x2471a3, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x1c2833][Math.floor(hash2i(Math.floor(z * 5), t, 47) * 6)]));
      }
      // roof on columns
      this._det(b, 'box', S.x0 + 12, Y + 12.5, (S.z0 + S.z1) / 2, 26, 0.6, S.z1 - S.z0 + 2, C(0xe8eaed));
      for (let z = S.z0; z <= S.z1; z += 25) this._det(b, 'cyl', S.x0 + 1, Y + 6.3, z, 0.4, 12.6, 0x6a7078, null, { x: S.x0 + 1, z, r: 0.45, y0: 0, y1: 12.6, kind: 'det' });
      b.signs.push({ text: 'VALEN POINT MOTORSPORT PARK', x: S.x1 + 0.05, y: Y + 1.1, z: (S.z0 + S.z1) / 2, ry: Math.PI / 2, w: 22, h: 1.0, bg: '#c8102e', fg: '#ffffff' });
    };
    stand(B.north, VP_SITE.standN); stand(B.south, VP_SITE.standS);
    // ---------------------------------------------------------------- Race Control in the paddock (the office you use)
    const O = VP_SITE.office;
    this._bld(B.pad, O.x0, O.z0, O.x1, O.z1, 10, STYLE.GLASS, 0x2c3a48, 3.4, 3.2, { exactH: true, y0: Y, oy: Y });
    B.pad.signs.push({ text: 'RACE CONTROL', x: (O.x0 + O.x1) / 2, y: Y + 8.6, z: O.z0 - 0.06, ry: Math.PI, w: 12, h: 1.3, bg: '#14181c', fg: '#ff6b4a' });
    this._det(B.pad, 'box', (O.x0 + O.x1) / 2, Y + 1.2, O.z0 - 0.06, 1.4, 2.4, 0.12, C(0x22262b));
    B.pad.fx.push({ type: 'canopy', x: (O.x0 + O.x1) / 2, y: Y + 2.9, z: O.z0 - 0.6, w: 1.6, d: 1 });
    B.pad.place = { id: 'motorsport', name: 'Valen Point Motorsport Park', kind: 'landmark', door: { x: (O.x0 + O.x1) / 2, z: O.z0 - 1.1, h: Math.PI }, under: { x: (O.x0 + O.x1) / 2, z: (O.z0 + O.z1) / 2 } };
    // transporters and hospitality units in the paddock
    for (let k = 0; k < 8; k++) {
      const z = 330 + k * 26 + (k >= 4 ? 120 : 0), x = 1500;
      this._det(B.pad, 'box', x, Y + 2.0, z, 16, 4.0, 2.6, C([0xc8102e, 0x1c3f94, 0xeeeeee, 0x111418][k % 4]), 0, true);
      this._det(B.pad, 'box', x - 9.2, Y + 1.7, z, 2.6, 3.4, 2.5, C(0x2a2e33), 0, true);
    }
    // ---------------------------------------------------------------- the main entrance over the access road
    const ex = VP.x0 + 6;
    for (const s2 of [-1, 1]) this._det(B.pad, 'box', ex, Y + 4, VP.cw.z + s2 * 9.5, 1.6, 8, 1.6, 0x2a2e33, 0, true);
    this._det(B.pad, 'box', ex, Y + 8.6, VP.cw.z, 1.8, 1.6, 21, C(0xc8102e));
    B.pad.signs.push({ text: 'VALEN POINT MOTORSPORT PARK', x: ex - 0.95, y: Y + 8.6, z: VP.cw.z, ry: -Math.PI / 2, w: 18, h: 1.2, bg: '#c8102e', fg: '#ffffff' });
    // the turning circle's island
    this._det(B.pad, 'cyl', VP_SITE.ring.x, Y + 0.25, VP_SITE.ring.z, 6, 0.5, 0x6f8a5a, null, { x: VP_SITE.ring.x, z: VP_SITE.ring.z, r: 6, y0: -1, y1: 0.5, kind: 'det' });
    this._det(B.pad, 'cyl', VP_SITE.ring.x, Y + 3, VP_SITE.ring.z, 0.25, 6, 0x8c949c);
    // marshal posts round the circuit, outside the barriers
    for (let k = 0; k < N2; k += 120) { const p = T.pts[k], nl = T.nl[k], o = offL(k) + 4; const x = p[0] + nl[0] * o, z = p[1] + nl[1] * o; if (vpLand(x, z)) this._det(B.track, 'box', x, Y + 1.3, z, 2.4, 2.6, 2.4, C(0xf2f2f2), 0, true); }
    // ---------------------------------------------------------------- the police impound's Valen Point annex
    const ab = this._vpBlock('annex', VP_SITE.annex.ox, VP_SITE.annex.oz, 60, IMPOUND.annex.name);
    this._genImpoundOverflow(ab, new RNG(9137), IMPOUND.annex, { side: 's', offMap: true });
    // ---------------------------------------------------------------- the causeway road: a spur off the perimeter road
    // out to the turning circle (a Links spur: traffic, the GPS, taxis and police all route along it)
    const R0 = VP_SITE.ring, sx = R0.x - R0.r;
    this.localRoads.push({ k: 'line', link: 'Valen Point Causeway', spur: true, w: VP.cw.road * 2, pts: [[CITY + ROAD_HALF, VP.cw.z], [CITY + EDGE_MARGIN + 30, VP.cw.z], [VP.x0 - 30, VP.cw.z], [VP.x0 + 4, VP.cw.z], [sx, VP.cw.z]], ring: R0, mat: 'asphalt' });
    // the district's drivable routes for the GPS and AI drivers (polylines; two-way): from the turning circle round
    // to the paddock, the gaps either side of the garages, the pit lane and its merges, Race Control and the annex
    // gate, the car parks; the circuit itself joins at the pit exit and entry (vp.track, every ~50 m)
    const r0 = VP_SITE.ring, ex0 = r0.x + r0.r;
    const pk = (x, z) => T.pts.reduce((b2, p, k) => Math.hypot(p[0] - x, p[1] - z) < b2.d ? { k, d: Math.hypot(p[0] - x, p[1] - z) } : b2, { k: 0, d: 1e9 }).k;
    vp.exitK = pk(VP_PIT.exit[2][0], VP_PIT.exit[2][1] - 12); vp.entryK = pk(VP_PIT.entry[0][0], VP_PIT.entry[0][1] + 12);
    vp.roads = [
      [[sx, VP.cw.z], [r0.x, r0.z - r0.r - 2], [ex0 + 2, r0.z], [1515, r0.z]],
      [[1515, r0.z], [1515, 445], [1553, 445], [VP_PIT.laneX, 445]],
      [[1515, r0.z], [1515, 695], [1553, 695], [VP_PIT.laneX, 695]],
      [[VP_PIT.laneX, 445], [VP_PIT.laneX, 695]],
      [[VP_PIT.laneX, 445], ...VP_PIT.exit, T.pts[vp.exitK]],
      [T.pts[vp.entryK], ...VP_PIT.entry, [VP_PIT.laneX, 695]],
      [[1515, r0.z], [(O.x0 + O.x1) / 2, O.z0 - 6]],
      [[1515, 445], [1495, 300], [VP_SITE.annex.ox + P / 2 - 4.5, 240], [VP_SITE.annex.ox + P / 2 - 4.5, 224]],
      [[1515, 695], [1490, 820]]
    ];
    vp.road0 = [sx, VP.cw.z];
    // colliders for every district block's buildings and details (the city's own loop ran before these existed)
    for (const b of this.xblocks) {
      for (const bl of b.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
      for (const d of b.det) if (d.col) this.grid.add(d.col);
    }
  },
  // signed turn at centreline sample k (cross product of the incoming and outgoing directions)
  _vpTurn(T, k) {
    const n = T.pts.length, a = T.pts[(k - 1 + n) % n], p = T.pts[k], b = T.pts[(k + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
  }
});
