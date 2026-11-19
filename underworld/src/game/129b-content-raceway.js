/* =====================================================================
   [CONTENT] SOUTHSHORE RACEWAY (owner, 2026-11-18: "find another open space and put a racetrack on one
   of the two main islands, wherever it fits properly")
   The island's second circuit, on the south lobe: the open plain between Marsh Hollow and the airport,
   the widest level ground left free (a survey of every road, pad, district, farm and site: the sea
   comes in to its south-west, the farms stand to its west, the airport's level ground to its east).
   - The circuit: 1.6 km, 13 m wide, eleven corners (filletLoop, like Valen Point's): a main straight
     running east past the pits, a fast east side with a kink, a long south straight, a hairpin, a
     chicane back through the infield and a sweeper onto the main straight. It keeps 50 m from
     Longshore Drive, which runs past its south-west on the diagonal; the level site steps back from it. Run-off gravel on the outside of the faster corners, armco both sides,
     red-and-white kerbs, edge lines, a start/finish line with a gantry, a ten-car grid.
   - The pits: a pit lane beside the main straight behind a pit wall, nine drive-through garages (two
     bays each, the owner's parking), the paddock behind them with the Race Office, a grandstand in
     the infield.
   - Raceway Road leaves Heron Loop in Marsh Hollow and ends in a turning circle at the paddock.
   The whole site stands on one level pad. The venue (events, sessions, the property) is RacewayPark
   (509c); the near ground (track, kerbs, paint, run-off, paddock) is RacewayScenery below.
   ===================================================================== */
const SR = {
  name: 'Southshore Raceway', y: 7,
  // the level site: stepped back from Longshore Drive, which runs south-west of it on the diagonal
  pad: { x0: -812, z0: 1762, x1: -415, z1: 2412 }, blend: 40,
  pads: [[-812, 1762, -415, 2082], [-772, 2082, -415, 2146], [-678, 2146, -415, 2210], [-614, 2210, -415, 2306], [-598, 2306, -415, 2370], [-574, 2370, -430, 2412]],
  w: 13, step: 2,
  // corners [x, z, radius], in the direction of travel (east along the main straight first)
  verts: [[-790, 1850, 50], [-460, 1850, 45], [-445, 2015, 55], [-540, 2105, 28], [-445, 2195, 40], [-447, 2370, 45], [-525, 2385, 40], [-588, 2265, 32], [-575, 2185, 30], [-685, 2090, 40], [-770, 2040, 40]],
  sfX: -640,
  // the pit lane (east along z), the wall between it and the track, the garages north of it, their merges
  pit: { z: 1833, w: 9, x0: -720, x1: -518, wallZ: 1840.8, garZ: [1806, 1826], garX: [-710, -530], cell: 20,
    entry: [[-744, 1846.5], [-734, 1841], [-722, 1834.5]], exit: [[-516, 1834.5], [-504, 1841], [-494, 1846.5]] },
  paddock: { x0: -770, z0: 1768, x1: -466, z1: 1804 },
  // (its door on the turning circle at the end of Raceway Road)
  office: { x0: -519, z0: 1766, x1: -491, z1: 1792 },
  stand: { x0: -700, x1: -560, z0: 1872, z1: 1896 }
};
function srTrackLine() { return filletLoop(SR.verts, SR.step); }
function inRaceway(x, z, m = 0) { return SR.pads.some(p => x > p[0] - m && x < p[2] + m && z > p[1] - m && z < p[3] + m); }
// Raceway Road: off Heron Loop (its ctrl point at the loop's south end) down to the paddock's turning circle
const SR_ROAD = { id: 'sr1', name: 'Raceway Road', w: 9, grade: 0.08, ends: ['m2', 'ring'], ring: 14, ringAt: [-540, 1778], pts: [[-520, 1628], [-524, 1664], [-532, 1700], [-538, 1732], [-540, 1762]] };
// the Southshore Motorsport Complex (2026-11-18): Paddock Road from Raceway Road east to the Southshore Highway, and
// Oval Gate Road from the highway to the oval's west gate (126 carries it on inside the fence to the paddock)
const SR_LINK = { id: 'sr2', name: 'Paddock Road', w: 9, grade: 0.08, ends: ['sr1', 's1'], pts: [[-538, 1732], [-470, 1730], [-380, 1722], [-280, 1708], [-170, 1680], [-90, 1640], [-40, 1600]] };
const SR_GATE = { id: 'sr3', name: 'Oval Gate Road', w: 9, grade: 0.08, ends: ['s1', 'ring'], ring: 10, pts: [[-100, 1150], [-82, 1150], [-62, 1150]] };
ISLE_DISTRICT_ROADS.push(SR_ROAD, SR_LINK, SR_GATE); ISLE_ROADS.push(SR_ROAD, SR_LINK, SR_GATE);
const SR_COL = { asphalt: 0x2b2d30, line: 0xeeeeea, red: 0xc0392b, white: 0xf2f2f2, gravel: 0xb3a27e, concrete: 0x8e8c86, pit: 0x34363a, check: 0x111111 };
Object.assign(World.prototype, {
  // the level site, before the roads find their level (127 calls this)
  _racewayPad() { for (const p of SR.pads) Island.addPad(p[0], p[1], p[2], p[3], SR.y, SR.blend); },
  _genRaceway() {
    const T = srTrackLine(), Y = SR.y, half = SR.w / 2, N2 = T.pts.length;
    const sr = this.sr = { track: T, sf: null, bays: [], barriers: [], road: SR_ROAD };
    const B = {
      pits: this._isleBlock('sr_pits', -620, 1816, 200, 'Southshore Raceway pits'),
      pad: this._isleBlock('sr_paddock', -560, 1786, 260, 'Southshore Raceway paddock'),
      stand: this._isleBlock('sr_stand', -630, 1884, 120, 'Southshore Raceway grandstand'),
      track: this._isleBlock('sr_track', -625, 2110, 380, SR.name)
    };
    // ---------------------------------------------------------------- start / finish
    const sfK = T.pts.findIndex(p => Math.abs(p[1] - SR.verts[0][1]) < 0.5 && Math.abs(p[0] - SR.sfX) <= SR.step);
    sr.sf = { k: sfK, x: T.pts[sfK][0], z: T.pts[sfK][1], along: T.cum[sfK] };
    // ---------------------------------------------------------------- barriers: armco both sides, run-off by corner speed
    const runOut = R => R <= 0 ? 10 : R < 40 ? 16 : R < 60 ? 20 : 24;
    const ease = (k, f) => { let best = f(k); for (let d = 1; d <= 20; d++) { const w = 1 - d / 21; best = Math.max(best, f((k + d) % N2) * w, f((k - d + N2) % N2) * w); } return best; };
    const turn = k => T.R[k] > 0 ? Math.sign(this._loopTurn(T, k)) : 0;
    const offL = k => half + ease(k, i => turn(i) > 0 ? runOut(T.R[i]) : T.R[i] > 0 ? 4 : 10);
    const offR = k => half + ease(k, i => turn(i) < 0 ? runOut(T.R[i]) : T.R[i] > 0 ? 4 : 10);
    sr.offL = offL; sr.offR = offR; sr.turn = turn;
    // the main straight's pit side is the pit wall and the merges (no armco)
    const pitSide = (x, z) => z < SR.verts[0][1] && x > SR.pit.entry[0][0] - 6 && x < SR.pit.exit[2][0] + 6;
    for (const side of [1, -1]) {
      const line = [];
      for (let k = 0; k < N2; k++) {
        const p = T.pts[k], nl = T.nl[k], off = side > 0 ? offL(k) : offR(k), x = p[0] + nl[0] * side * off, z = p[1] + nl[1] * side * off;
        line.push(pitSide(x, z) && Math.abs(p[1] - SR.verts[0][1]) < 1 ? null : [x, z]);
      }
      sr.barriers.push(line);
      for (let k = 0; k < N2; k++) {
        const a = line[k], b2 = line[(k + 1) % N2]; if (!a || !b2) continue;
        const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]), m = Math.max(1, Math.round(L));
        for (let i = 0; i < m; i++) this.grid.add({ x: lerp(a[0], b2[0], i / m), z: lerp(a[1], b2[1], i / m), r: 0.45, y0: Y - 1, y1: Y + 1.1, kind: 'det', barrier: true });
      }
    }
    // the pit wall
    this._det(B.pits, 'box', (SR.pit.x0 + SR.pit.x1) / 2 + 1, Y + 0.6, SR.pit.wallZ, SR.pit.x1 - SR.pit.x0 - 6, 1.2, 0.8, C(0xd8d8d0), 0, { x0: SR.pit.x0 + 4, x1: SR.pit.x1 - 2, z0: SR.pit.wallZ - 0.4, z1: SR.pit.wallZ + 0.4, y0: Y - 1, y1: Y + 1.2, kind: 'det' });
    // ---------------------------------------------------------------- the gantry over the line and the grid behind it
    const gz0 = SR.pit.wallZ + 0.6, gz1 = sr.sf.z + half + 3;
    for (const z of [gz0, gz1]) this._det(B.pits, 'box', sr.sf.x, Y + 4.5, z, 0.6, 9, 0.6, 0x2a2e33, 0, true);
    this._det(B.pits, 'box', sr.sf.x, Y + 8.6, (gz0 + gz1) / 2, 1.0, 1.4, gz1 - gz0 + 0.6, 0x1d2126);
    for (let k = 0; k < 5; k++) B.pits.fx.push({ type: 'neon', x: sr.sf.x - 0.55, y: Y + 7.8, z: sr.sf.z - 6 + k * 3, w: 0.1, h: 0.6, d: 0.6, c: 0xff2a2a });
    B.pits.signs.push({ text: 'SOUTHSHORE RACEWAY', x: sr.sf.x - 0.52, y: Y + 8.6, z: (gz0 + gz1) / 2, ry: -Math.PI / 2, w: 13, h: 1.2, bg: '#1d2126', fg: '#ffffff' });
    // the grid: ten boxes in two staggered files behind the line (west of it: the straight runs east)
    sr.grid = [];
    for (let k = 0; k < 10; k++) {
      const gx = sr.sf.x - 34 - k * 8, gz = sr.sf.z + (k % 2 ? 3 : -3); sr.grid.push({ x: gx, z: gz });
      this._det(B.pits, 'box', gx + 2.6, Y + 0.09, gz, 0.18, 0.02, 3, C(0xf2f2f2));
      for (const s2 of [-1, 1]) this._det(B.pits, 'box', gx + 1.9, Y + 0.09, gz + s2 * 1.5, 1.4, 0.02, 0.18, C(0xf2f2f2));
    }
    // ---------------------------------------------------------------- the pit garages: drive-through, two bays each
    const [gxa, gxb] = SR.pit.garX, [gza, gzb] = SR.pit.garZ, cell = SR.pit.cell, n = Math.round((gxb - gxa) / cell);
    for (let i = 0; i <= n; i++) { const x = gxa + i * cell; this._bld(B.pits, x - 0.3, gza, x + 0.3, gzb, 5.6, STYLE.IND, 0xd8dade, 5.6, 4, { exactH: true, y0: Y, oy: Y }); }
    this._bld(B.pits, gxa - 0.3, gza, gxb + 0.3, gzb, 6, STYLE.GLASS, 0x3a4652, 3, 4, { exactH: true, y0: Y + 5.6, oy: Y, far: true });
    for (let i = 0; i < n; i++) {
      const xc = gxa + cell * (i + 0.5);
      for (const dx of [-4.5, 4.5]) sr.bays.push({ x: xc + dx, z: (gza + gzb) / 2, h: 0, y: Y, garage: i + 1 });
      B.pits.signs.push({ text: String(i + 1), x: xc, y: Y + 4.7, z: gzb + 0.05, ry: 0, w: 2.2, h: 1.2, bg: '#1f6fb2', fg: '#ffffff' });
    }
    // ---------------------------------------------------------------- the grandstand in the infield: tiers rising away from the track
    {
      const S = SR.stand;
      for (let t = 0; t < 6; t++) {
        const z0 = S.z0 + t * 4, h = 1 + t * 1.3;
        this._bld(B.stand, S.x0, z0, S.x1, z0 + 4, h, STYLE.IND, 0x9aa0a6, h, 5, { exactH: true, y0: Y, oy: Y, far: t === 5 });
        for (let x = S.x0 + 1.5; x < S.x1 - 1; x += 1.6) if (hash2i(Math.floor(x * 3), t, 47) < 0.6) this._det(B.stand, 'box', x, Y + h + 0.45, z0 + 2 + (hash2i(Math.floor(x), t, 49) - 0.5), 0.45, 0.9, 0.5, C([0xc0392b, 0x2471a3, 0xf1c40f, 0xecf0f1, 0x27ae60][Math.floor(hash2i(Math.floor(x * 7), t, 51) * 5)]));
      }
      this._det(B.stand, 'box', (S.x0 + S.x1) / 2, Y + 12.5, S.z0 + 12, S.x1 - S.x0 + 2, 0.6, 26, C(0xe8eaed));
      for (let x = S.x0; x <= S.x1; x += 28) this._det(B.stand, 'cyl', x, Y + 6.3, S.z1 - 1, 0.4, 12.6, 0x6a7078, null, { x, z: S.z1 - 1, r: 0.45, y0: Y, y1: Y + 12.6, kind: 'det' });
      B.stand.signs.push({ text: 'SOUTHSHORE RACEWAY', x: (S.x0 + S.x1) / 2, y: Y + 1.1, z: S.z0 - 0.05, ry: Math.PI, w: 22, h: 1.0, bg: '#1f6fb2', fg: '#ffffff' });
    }
    // ---------------------------------------------------------------- the Race Office in the paddock (the door you use: its west face, on the turning circle)
    {
      const O = SR.office;
      this._bld(B.pad, O.x0, O.z0, O.x1, O.z1, 9, STYLE.GLASS, 0x2c3a48, 3.4, 3.2, { exactH: true, y0: Y, oy: Y });
      B.pad.signs.push({ text: 'RACE OFFICE', x: O.x0 - 0.06, y: Y + 7.6, z: (O.z0 + O.z1) / 2, ry: -Math.PI / 2, w: 11, h: 1.3, bg: '#14181c', fg: '#4ab3ff' });
      this._det(B.pad, 'box', O.x0 - 0.06, Y + 1.2, (O.z0 + O.z1) / 2, 0.12, 2.4, 1.4, C(0x22262b));
      B.pad.place = { id: 'raceway', name: SR.name, kind: 'landmark', door: { x: O.x0 - 1.1, z: (O.z0 + O.z1) / 2, h: -Math.PI / 2 }, under: { x: (O.x0 + O.x1) / 2, z: (O.z0 + O.z1) / 2 } };
      // transporters along the paddock's back
      for (let k = 0; k < 5; k++) { const x = SR.paddock.x0 + 16 + k * 30; this._bld(B.pad, x, SR.paddock.z0 + 2, x + 16, SR.paddock.z0 + 5, 3.6, STYLE.IND, [0xd23a2a, 0x1f6fb2, 0xe8eaed, 0x2e2e2e, 0xf1c40f][k], 3.6, 4, { exactH: true, y0: Y, oy: Y }); }
      for (const [x, z] of [[-560, 1800], [-760, 1800], [-660, 1790]]) this._prop(B.pad, 'lotlamp', x, z, 0, 1, Y);
    }
    // ---------------------------------------------------------------- the fleet: race cars in the garages and the paddock
    this.isle.fleet.push({ id: 'sr_pits', x: -620, z: 1816, r: 300, slots: sr.bays.filter((q, i) => i % 3 === 0).map((q, i) => ({ x: q.x, z: q.z, h: q.h, y: Y, cls: ['gt3', 'cup', 'drift', 'formula', 'lmp', 'rally'][i % 6] })) });
    // Valen Point's race cars came here when it closed (2026-11-18): six in a row in the paddock, facing the garages ...
    this.isle.fleet.push({ id: 'sr_paddock', x: -710, z: 1786, r: 300, slots: ['drift', 'cup', 'formula', 'gt3', 'lmp', 'rally'].map((cls, k) => ({ x: SR.paddock.x0 + 30 + k * 12, z: 1788, h: 0, y: Y, cls })) });
    // ... and at the oval's garages (126), its own six and Valen Point's pit six
    if (this.cfs) this.isle.fleet.push({ id: 'so_pits', x: 350, z: 1188, r: 300, slots: this.cfs.bays.filter((q, i) => i % 2 === 1).map((q, i) => ({ x: q.x, z: q.z, h: q.h, y: q.y, cls: ['cup', 'gt3', 'muscle', 'lmp', 'sports', 'formula', 'gt3', 'formula', 'lmp', 'cup', 'gt3', 'rally'][i % 12] })) });
    this.mapPlaces.push({ id: 'raceway', name: SR.name, cat: 'landmark', icon: 'R', x: SR.office.x0 - 6, z: (SR.office.z0 + SR.office.z1) / 2, sub: `A ${(T.len / 1000).toFixed(1)} km road course, nine pit garages · the Southshore Motorsport Complex` });
    // (the blocks' colliders are added with the rest of the island's, 127)
  }
});
// the maps (the big map, the minimap, the whole island: 600's island painter calls this): the circuit, its pit lane
// and paddock
World.prototype.paintRaceway = function (g, X, k, view) {
  {
    if (!this.sr) return;
    const p = SR.pad; if (view && (p.x1 < view.x0 || p.x0 > view.x1 || p.z1 < view.z0 || p.z0 > view.z1)) return;
    const T = this.sr.track;
    g.fillStyle = '#8e8c86'; g.fillRect(X(SR.paddock.x0), X(SR.paddock.z0), (SR.paddock.x1 - SR.paddock.x0) * k, (SR.pit.z + SR.pit.w / 2 - SR.paddock.z0) * k);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#e8e8e2'; g.lineWidth = Math.max(2.5, (SR.w + 3) * k);
    g.beginPath(); T.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.closePath(); g.stroke();
    g.strokeStyle = '#3a3c40'; g.lineWidth = Math.max(1.6, SR.w * k);
    g.beginPath(); T.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.closePath(); g.stroke();
    const sf = this.sr.sf; g.fillStyle = '#ffffff'; g.fillRect(X(sf.x) - 1, X(sf.z - SR.w / 2), 2, SR.w * k);
  }
};
// ---------------------------------------------------------------------- the near ground: one merged mesh at the pad's level
class RacewayScenery {
  constructor(scene, world) {
    const sr = world.sr; if (!sr) return;
    const T = sr.track, half = SR.w / 2, N2 = T.pts.length, Y = SR.y, fb = new FlatBuilder();
    // gravel on the outside of the faster corners, out to where the armco stands
    fb.strip(T.pts, T.nl, 0, N2, k => half + 1.2, k => sr.offL(k) - 0.6, Y + 0.04, k => sr.turn(k) > 0 && T.R[k] > 0 && T.R[k] < 70 ? SR_COL.gravel : null, true);
    fb.strip(T.pts, T.nl, 0, N2, k => -(sr.offR(k) - 0.6), k => -(half + 1.2), Y + 0.04, k => sr.turn(k) < 0 && T.R[k] > 0 && T.R[k] < 70 ? SR_COL.gravel : null, true);
    // the paddock, the apron in front of the garages and the pit lane (with its merges)
    fb.rect(SR.paddock.x0, SR.paddock.z0, SR.paddock.x1, SR.pit.garZ[0], Y + 0.05, SR_COL.concrete);
    fb.rect(SR.pit.garX[0], SR.pit.garZ[0], SR.pit.garX[1], SR.pit.garZ[1], Y + 0.05, SR_COL.concrete);
    fb.rect(SR.pit.entry[2][0], SR.pit.garZ[1], SR.pit.exit[0][0], SR.pit.z + SR.pit.w / 2, Y + 0.06, SR_COL.pit);
    const lane = [...SR.pit.entry, [SR.pit.x0 + 10, SR.pit.z], [SR.pit.x1 - 10, SR.pit.z], ...SR.pit.exit], ln = lineNormals(lane);
    fb.strip(lane, ln, 0, lane.length - 1, -SR.pit.w / 2, SR.pit.w / 2, Y + 0.065, SR_COL.pit, false);
    // the turning circle and the road's last metres onto the paddock
    { const R0 = SR_ROAD.ringAt, r = SR_ROAD.ring + SR_ROAD.w / 2, m = 32; for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, b = (i + 1) / m * Math.PI * 2; fb.quad([R0[0], R0[1]], [R0[0] + Math.cos(a) * r, R0[1] + Math.sin(a) * r], [R0[0] + Math.cos(b) * r, R0[1] + Math.sin(b) * r], [R0[0], R0[1]], Y + 0.055, SR_COL.pit); } }
    // the track, its edge lines and kerbs
    fb.strip(T.pts, T.nl, 0, N2, -half, half, Y + 0.08, SR_COL.asphalt, true);
    for (const s of [1, -1]) fb.strip(T.pts, T.nl, 0, N2, s > 0 ? half - 0.6 : -half + 0.35, s > 0 ? half - 0.35 : -half + 0.6, Y + 0.1, SR_COL.line, true);
    for (const s of [1, -1]) fb.strip(T.pts, T.nl, 0, N2, s > 0 ? half : -half - 1.2, s > 0 ? half + 1.2 : -half, Y + 0.1, k => T.R[k] > 0 && T.R[k] < 70 ? (Math.floor(k / 2) % 2 ? SR_COL.red : SR_COL.white) : null, true);
    // the start/finish line (a chequered band across the track) and the pit lane's speed lines
    { const k0 = sr.sf.k; for (let c = 0; c < 13; c++) for (let r2 = 0; r2 < 2; r2++) { const o1 = -half + c, o2 = o1 + 1, A = T.pts[(k0 + r2) % N2], nl = T.nl[k0]; fb.quad([A[0] + nl[0] * o1, A[1] + nl[1] * o1], [A[0] + nl[0] * o2, A[1] + nl[1] * o2], [A[0] + nl[0] * o2 + 1, A[1] + nl[1] * o2], [A[0] + nl[0] * o1 + 1, A[1] + nl[1] * o1], Y + 0.11, (c + r2) % 2 ? SR_COL.check : SR_COL.white); } }
    for (const x of [SR.pit.x0 + 4, SR.pit.x1 - 4]) fb.rect(x - 0.3, SR.pit.z - SR.pit.w / 2, x + 0.3, SR.pit.z + SR.pit.w / 2, Y + 0.075, SR_COL.white);
    // every triangle faces up (a strip's quads wind one way or the other by which side of the centreline they lie on)
    for (let i = 0; i < fb.p.length; i += 9) {
      const P0 = fb.p, ax = P0[i], az = P0[i + 2], bx = P0[i + 3], bz = P0[i + 5], cx = P0[i + 6], cz = P0[i + 8];
      if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) for (let j = 0; j < 3; j++) { const t = P0[i + 3 + j]; P0[i + 3 + j] = P0[i + 6 + j]; P0[i + 6 + j] = t; const u = fb.c[i + 3 + j]; fb.c[i + 3 + j] = fb.c[i + 6 + j]; fb.c[i + 6 + j] = u; }
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = fb.mesh(mat); this.mesh.name = 'raceway'; scene.add(this.mesh);
    // the armco: a rail on posts along both barrier lines (one merged mesh)
    const rp = [], rc = [], cc = new THREE.Color(0xc8ccd0);
    const quad = (a, b, y0, y1) => { for (const q of [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]]) { rp.push(...q); rc.push(cc.r, cc.g, cc.b); } };
    for (const line of sr.barriers) for (let k = 0; k < line.length; k++) { const a = line[k], b = line[(k + 1) % line.length]; if (!a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) > 6) continue; quad(a, b, Y + 0.45, Y + 0.85); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); gg.computeVertexNormals();
    this.rail = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.rail.name = 'raceway-armco'; scene.add(this.rail);
  }
}
