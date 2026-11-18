/* =====================================================================
   [CONTENT] THE ORGANIC DOWNTOWN (owner, 2026-11-18)
   The central grid broken up so it reads as a city that grew: the lanes, the crescent, the avenue and
   the works roads are curved streets (122); this file dresses the lattice segments closed to traffic
   (CITY_CLOSED, 020) and draws them on the maps. Each closure is paved across, wall to wall, and
   kept from cars by a line of bollards at each end:
   - a mews (the Old Quarter): planters down the middle, benches, a bike rack, lanterns;
   - a plaza (the commercial core): a fountain with trees round it, benches, lamps, a bin;
   - a yard (the port strip): pallets and barrels along its sides, a dumpster, yard lights.
   The block on the west (or north) side of a closure dresses it, from its own random stream, so the
   strip streams in and out with that block and nothing else in the city moves.
   ===================================================================== */
// the strip a closure paves, in lattice metres: [x0, z0, x1, z1], wall to wall across, cross street to cross street
function closureRect(c) {
  const W = ROAD_HALF + WALK_W, a = c.j * P + ROAD_HALF, b = (c.j + 1) * P - ROAD_HALF;
  return c.a === 0 ? [c.i * P - W, a, c.i * P + W, b] : [a, c.i * P - W, b, c.i * P + W];
}
// the block that dresses a closure (west of a north-south one, north of an east-west one)
function closureOwner(c) { return c.a === 0 ? [c.i - 1, c.j] : [c.j, c.i - 1]; }
const CLOSED_MAPCOL = { mews: '#8b7d6b', plaza: '#8f8a80', yard: '#6f6c66' };
{
  const base = World.prototype._genBlock;
  World.prototype._genBlock = function (b) {
    base.call(this, b);
    for (const c of CITY_CLOSED) { const o = closureOwner(c); if (o[0] === b.bx && o[1] === b.bz) this._dressClosure(b, c); }
  };
}
Object.assign(World.prototype, {
  _dressClosure(b, c) {
    const rng = new RNG(b.i * 6151 + c.i * 97 + c.j * 13 + c.a), R = closureRect(c);
    // a point `along` metres down the strip (from its north or west end) and `lat` across it (from its centre line)
    const L = c.a === 0 ? R[3] - R[1] : R[2] - R[0];
    const at = (along, lat) => c.a === 0 ? [c.i * P + lat, R[1] + along] : [R[0] + along, c.i * P + lat];
    const ry = c.a === 0 ? 0 : Math.PI / 2;
    this._areaS([[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]], 'concrete');
    // bollards across each end (the pavement corners stay open), 1.6 m apart: people pass, cars do not
    for (const e of [1.2, L - 1.2]) for (let lat = -ROAD_HALF + 0.8; lat <= ROAD_HALF - 0.8 + 1e-6; lat += 1.6) { const [x, z] = at(e, lat); this._prop(b, 'bollard', x, z, ry); }
    const seat = (along, lat, face) => { const [x, z] = at(along, lat), r = ry + face; this._prop(b, 'bench', x, z, r); b.seats.push({ x, z, ry: r }); };
    if (c.kind === 'mews') {
      for (let k = 0; k < 4; k++) { const [x, z] = at(14 + k * 13.5, 0); this._prop(b, k % 2 ? 'planter' : 'bush', x, z, rng.range(0, 6)); }
      seat(20, -4.2, Math.PI / 2); seat(48, 4.2, -Math.PI / 2);
      { const [x, z] = at(34, -4.6); this._prop(b, 'bikerack', x, z, ry); }
      for (const [al, lat] of [[8, 5.4], [L / 2, -5.4], [L - 8, 5.4]]) { const [x, z] = at(al, lat); this._prop(b, 'parklamp', x, z, 0); }
      { const [x, z] = at(L / 2 + 6, 3.5); b.secrets.push({ x, z }); }
    } else if (c.kind === 'plaza') {
      const [cx, cz] = at(L / 2, 0);
      this._det(b, 'cyl', cx, CURB_H + 0.4, cz, 3.4, 0.8, 0x8d8a84, null, { x: cx, z: cz, r: 3.4, y0: 0, y1: 0.9, kind: 'det' });
      this._det(b, 'cyl', cx, CURB_H + 1.1, cz, 0.45, 1.6, 0x9a958c);
      this._det(b, 'cyl', cx, CURB_H + 1.95, cz, 1.2, 0.2, 0x9a958c);
      b.water.push({ x: cx, z: cz, r: 3.0, y: CURB_H + 0.82 });
      b.fx.push({ type: 'fountain', x: cx, y: CURB_H + 2.0, z: cz });
      for (const al of [10, L - 10]) for (const lat of [-5.5, 5.5]) { const [x, z] = at(al, lat); this._prop(b, 'tree', x, z, rng.range(0, 6), rng.range(0.9, 1.2)); }
      seat(L / 2 - 8, -5.2, Math.PI / 2); seat(L / 2 + 8, -5.2, Math.PI / 2); seat(L / 2 - 8, 5.2, -Math.PI / 2); seat(L / 2 + 8, 5.2, -Math.PI / 2);
      for (const [al, lat] of [[20, 0], [L - 20, 0]]) { const [x, z] = at(al, lat); this._prop(b, 'parklamp', x, z, 0); }
      { const [x, z] = at(L / 2 + 12, 6.4); this._prop(b, 'bin', x, z, ry); }
      { const [x, z] = at(L / 2 - 4, 4); b.secrets.push({ x, z }); }
    } else {
      for (let al = 10; al < L - 8; al += 7) { if (!rng.chance(0.6)) continue; const lat = rng.chance(0.5) ? -6.8 : 6.8, [x, z] = at(al, lat); this._prop(b, rng.chance(0.6) ? 'pallet' : 'barrel', x, z, rng.range(0, 3)); }
      { const [x, z] = at(L / 2, -6.6); this._prop(b, 'dumpster', x, z, ry); }
      for (const al of [16, L - 16]) { const [x, z] = at(al, 6.9); this._prop(b, 'lotlamp', x, z, 0); }
      { const [x, z] = at(L / 2 + 5, 6.5); b.secrets.push({ x, z }); }
    }
  }
});
// the maps: each closure's paving where it stands (its precinct's offset), over the street bed
{
  const base = World.prototype.paintMapExtra;
  World.prototype.paintMapExtra = function (g, X, k, view, phase) {
    base.call(this, g, X, k, view, phase);
    if (phase !== 'ground') return;
    for (const c of CITY_CLOSED) {
      const o = closureOwner(c), p = CityLayout.precinctOf(o[0], o[1]); if (!p) continue;
      const R = closureRect(c), ox = p.ox * P, oz = p.oz * P;
      if (view && (R[2] + ox < view.x0 || R[0] + ox > view.x1 || R[3] + oz < view.z0 || R[1] + oz > view.z1)) continue;
      g.fillStyle = CLOSED_MAPCOL[c.kind] || CLOSED_MAPCOL.plaza;
      g.fillRect(X(R[0] + ox), X(R[1] + oz), (R[2] - R[0]) * k, (R[3] - R[1]) * k);
      if (c.kind === 'plaza') { const cx = (R[0] + R[2]) / 2 + ox, cz = (R[1] + R[3]) / 2 + oz; g.fillStyle = '#2f6e8a'; g.beginPath(); g.arc(X(cx), X(cz), Math.max(1.5, 3.4 * k), 0, 7); g.fill(); }
    }
  };
}
