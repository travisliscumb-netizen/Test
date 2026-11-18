/* =====================================================================
   [CONTENT] DISTRICT BLOCKS OFF THE LATTICE, AND THE IMPOUND'S SOUND ANNEX
   Geometry off the city's lattice (the island's sites, the Southshore
   tracks, the impound's annex) lives in extra blocks (world.xblocks): the
   same shape as a city block, so the chunk manager streams them, and the
   far skyline, colliders, places and compounds all take them.
   The police impound's third yard stood on Valen Point until the sound was
   filled in (owner, 2026-11-18); it now stands on the reclaimed land just
   east of the port, on Sound Parkway (021), with the same 85 spaces (so
   the yards still hold a space for every car you could own, tests/hot.mjs).
   ===================================================================== */
// the annex's block (its lattice origin): its gate faces Sound Parkway, a short driveway up to it (the pad: Island.corePads, 022)
const SOUND_ANNEX = { ox: 1020, oz: 534 };
Object.assign(World.prototype, {
  // a district block on a lattice origin (ox, oz) off the city; r: how far its contents reach from the centre
  _xBlock(id, ox, oz, r, name) {
    const b = { bx: -1, bz: -1, t: 'X', i: 1000 + this.xblocks.length, xb: id, offMap: true, noPeds: true,
      x0: ox + INNER, z0: oz + INNER, x1: ox + P - INNER, z1: oz + P - INNER, cx: ox + P / 2, cz: oz + P / 2, r,
      bld: [], det: [], props: [], parked: [], signs: [], billboards: [], fx: [], secrets: [], seats: [], water: [], special: null, name: name || ISLE.name };
    this.xblocks.push(b);
    return b;
  },
  // the district blocks start empty: Cedar Fields South, the island and its sites, the tracks and the annex add theirs
  _genFirstXBlocks() { this.xblocks = []; },
  // the impound's Sound annex (after the island's roads: its driveway meets Sound Parkway's level)
  _genSoundAnnex() {
    if (CityLayout.id !== 'island') return;
    const ab = this._xBlock('annex', SOUND_ANNEX.ox, SOUND_ANNEX.oz, 60, IMPOUND.annex.name);
    // (paved: the yard's own surface stands 5 cm proud of the island's ground, which has no paving of its own; the
    // bay lines sit 12 mm over it)
    const PAVE = 0.05;
    this._genImpoundOverflow(ab, new RNG(9137), IMPOUND.annex, { side: 'n', offMap: true, paved: PAVE });
    const asph = C(0x4a4d52), top = CURB_H + PAVE;
    this._det(ab, 'box', ab.cx, top - 0.05, ab.z0 + 30, 58.6, 0.1, 58.6, asph);
    // the driveway: from the gate (u 4.5 of the north fence) north to the parkway's edge, in 2 m slabs that follow
    // the ground up the bank to the road (Island roads keep 0.5 m over the sea; the yard is at the kerb's height)
    const R = Island.roads.find(r => r.id === 'sp1'), gx = ab.cx + 4.5, gz = ab.z0 + 1;
    let ez = gz - 12;
    if (R) { let bd = Infinity; for (const p of R.pts) { const d = Math.abs(p[0] - gx); if (d < bd && p[1] < gz) { bd = d; ez = p[1] + R.w / 2 - 0.4; } } }
    const n = Math.max(1, Math.ceil((gz - ez) / 2)), hAt = z => Math.max(Island.height(gx, z, 1e6), CURB_H);
    for (let k = 0; k < n; k++) {
      const za = ez + (gz - ez) * k / n, zb = ez + (gz - ez) * (k + 1) / n, ya = hAt(za) + 0.03, yb = hAt(zb) + 0.03, L = Math.hypot(zb - za, yb - ya);
      ab.det.push({ kind: 'box', x: gx, y: (ya + yb) / 2 - 0.05, z: (za + zb) / 2, sx: 9, sy: 0.1, sz: L + 0.05, color: asph, ry: 0, rx: Math.atan2(ya - yb, zb - za), rz: 0 });
    }
    // colliders for its buildings and details (the city's own loop ran before it existed)
    for (const bl of ab.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
    for (const d of ab.det) if (d.col) this.grid.add(d.col);
  },
  // signed turn at a loop's centreline sample k (cross product of the incoming and outgoing directions)
  _loopTurn(T, k) {
    const n = T.pts.length, a = T.pts[(k - 1 + n) % n], p = T.pts[k], b = T.pts[(k + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
  }
});
