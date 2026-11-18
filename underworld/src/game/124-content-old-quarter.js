/* =====================================================================
   [CONTENT] THE OLD QUARTER, REBUILT (owner, 2026-11-18: the downtown torn down and redeveloped round
   a gridded financial core, district by district; this is the first)
   Nine lattice cells (0..2, 4..6) are one superblock with no grid inside it. Its streets are curved
   through-roads (links, 020: traffic, the GPS, taxis and the police use them):
   - Saint Ivo Street, the high street, winding from the north edge to the south;
   - Market Street, crossing it in two staggered halves (west to the shore road, east to Downtown);
   - Bell Lane, Cooper's Walk, Chapel Lane, Garage Row and Wick Lane, the old lanes off them;
   - Saint Ivo Square beside the high street, with its fountain.
   Every street is lined with terraces (brick, shopfronts, flats; two to four storeys) stepping along
   its curve, and so are the four edge streets; behind the frontage, yards and gardens. The Quarter
   Garage stands where it stood, Garage Row running past the foot of its ramp.
   Everything that had an address on these cells keeps it: a door given as (block, side, along) on a
   street that no longer exists is found on the nearest of the new streets (sidewalkSpot, 390, asks
   oldQuarterSpot), and the frontage stands behind it. The district, its turfs and its name are the
   cells', as they were.
   ===================================================================== */
// the streets, in lattice metres. A street that starts on another (`fork`: its index, `near`: where) starts on that
// street's own polyline, so the junction is exact; every other end meets an edge street side-on
const OQ_STREETS = [
  { name: 'Saint Ivo Street', w: 9, park: [1, -1], ctrl: [[100, 325.6], [104, 345], [96, 368], [84, 392], [86, 418], [102, 440], [118, 462], [122, 488], [112, 512], [104, 534], [108, 554.4]] },
  { name: 'Market Street', w: 8, park: [1], fork: 0, near: [86, 422], ctrl: [[64, 430], [44, 427], [24, 431], [5.6, 436]] },
  { name: 'Market Street', w: 8, park: [-1], fork: 0, near: [92, 378], ctrl: [[120, 372], [150, 366], [180, 372], [210, 380], [234.4, 384]] },
  { name: 'Bell Lane', w: 7, fork: 2, near: [182, 372], ctrl: [[186, 356], [190, 340], [196, 325.6]] },
  { name: 'Cooper’s Walk', w: 7, fork: 0, near: [119, 470], ctrl: [[92, 482], [62, 492], [36, 506], [5.6, 518]] },
  { name: 'Chapel Lane', w: 7, fork: 4, near: [56, 494], ctrl: [[50, 512], [40, 532], [32, 554.4]] },
  { name: 'Garage Row', w: 8, fork: 0, near: [121, 494], ctrl: [[150, 486], [180, 482], [206, 480], [226, 488], [234.4, 504]] },
  { name: 'Wick Lane', w: 7, fork: 0, near: [106, 530], ctrl: [[130, 530], [160, 524], [190, 528], [234.4, 538]] }
];
// Saint Ivo Square: a paved round beside the high street, its fountain in the middle
const OQ_SQUARE = { x: 58, z: 462, r: 11 };
// the streets' polylines (computed once; sidewalkSpot needs them before the world is built)
let OQ_LINES = null;
function oqLines() {
  if (OQ_LINES) return OQ_LINES;
  OQ_LINES = [];
  for (const S of OQ_STREETS) {
    let ctrl = S.ctrl;
    if (S.fork !== undefined) {
      const par = OQ_LINES[S.fork].pts; let k = 0, best = Infinity;
      for (let i = 0; i < par.length; i++) { const d = Math.hypot(par[i][0] - S.near[0], par[i][1] - S.near[1]); if (d < best) { best = d; k = i; } }
      ctrl = [par[k], ...S.ctrl];
    }
    OQ_LINES.push({ name: S.name, w: S.w, park: S.park || null, pts: splinePts(ctrl) });
  }
  return OQ_LINES;
}
const OQ_SB = () => SUPERBLOCKS.find(s => s.id === 'oldquarter');
// a door on one of the old cells (sidewalkSpot's address), on the new streets: the kerbside point of the nearest
// street, `o` from its centre line as the lattice spot was from its own, facing the street. Only for a side whose
// lattice street is gone; a side on an edge street that still runs keeps its spot. Lattice metres, or null.
function oldQuarterSpot(bx, bz, side, x, z, o) {
  const sb = superblockAt(bx, bz); if (!sb || sb.id !== 'oldquarter') return null;
  if (RoadNet.sideOpen(bx, bz, [0, 3, 1, 2][side])) return null;
  let best = null;
  for (const L of oqLines()) for (let k = 0; k < L.pts.length - 1; k++) {
    const a = L.pts[k], c = L.pts[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, px, pz, L, tx: dx / Math.sqrt(l2), tz: dz / Math.sqrt(l2) };
  }
  // off the side of the street the old spot was on (along the normal, not toward a junction)
  const s = Math.sign(-best.tz * (x - best.px) + best.tx * (z - best.pz)) || 1, nx = -best.tz * s, nz = best.tx * s;
  const off = best.L.w / 2 + Math.max(1.6, o - ROAD_HALF);
  return { x: best.px + nx * off, z: best.pz + nz * off, h: Math.atan2(-nx, -nz) };
}
Object.assign(World.prototype, {
  _genOldQuarter(a, sb, rng) {
    for (const m of sb.members) m.wires = m.wires || [];
    this._sbSidewalks(sb, rng, { trees: 0.3, park: 0.4 });
    const b = a, lines = oqLines(), roads = [];
    // the streets (kerbside parking on the high street and Market Street)
    for (const L of lines) { const r = this._road(L.pts, L.w, 'asphalt', { link: L.name }); r.park = L.park; roads.push(r); }
    // the Quarter Garage, where it always stood
    const gb = this.block(2, 5); this._genGarage(gb, rng); gb.name = 'Quarter Garage';
    const G = { x0: gb.x0 - 1, z0: gb.z0 - 1, x1: gb.x1 + 1, z1: gb.z1 + 2 };
    // Saint Ivo Square
    const Q = OQ_SQUARE;
    this._discS(Q.x, Q.z, Q.r, 'concrete');
    this._det(b, 'cyl', Q.x, CURB_H + 0.4, Q.z, 2.8, 0.8, 0x8d8a84, null, { x: Q.x, z: Q.z, r: 2.8, y0: 0, y1: 0.9, kind: 'det' });
    this._det(b, 'cyl', Q.x, CURB_H + 1.2, Q.z, 0.4, 1.6, 0x9a958c);
    b.water.push({ x: Q.x, z: Q.z, r: 2.4, y: CURB_H + 0.82 });
    b.fx.push({ type: 'fountain', x: Q.x, y: CURB_H + 2.0, z: Q.z });
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.3, x = Q.x + Math.cos(t) * 7.2, z = Q.z + Math.sin(t) * 7.2; if (k % 2) this._prop(b, 'tree', x, z, rng.range(0, 6), 0.9); else { const ry = Math.atan2(Q.x - x, Q.z - z); this._prop(b, 'bench', x, z, ry); b.seats.push({ x, z, ry }); } }
    this._prop(b, 'parklamp', Q.x + 9.5, Q.z - 3, 0); this._prop(b, 'parklamp', Q.x - 9.5, Q.z + 3, 0);
    b.secrets.push({ x: Q.x + 5, z: Q.z + 5 });
    // ---- the frontage: terraces along every street, both sides, and along the four edge streets inside them
    const segD = (x, z, p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1; let t = ((x - p[0]) * dx + (z - p[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t); };
    const clearRoads = (x0, z0, x1, z1, m) => roads.every(r => rectPolyDist(x0, z0, x1, z1, r.pts) > r.w / 2 + m);
    const placed = [];
    const free = (x0, z0, x1, z1) => x0 >= sb.x0 && z0 >= sb.z0 && x1 <= sb.x1 && z1 <= sb.z1
      && !(x0 < G.x1 && x1 > G.x0 && z0 < G.z1 && z1 > G.z0)
      && Math.hypot(clamp(Q.x, x0, x1) - Q.x, clamp(Q.z, z0, z1) - Q.z) > Q.r + 2
      && clearRoads(x0, z0, x1, z1, 2.6)
      && !placed.some(q => x0 < q.x1 + 0.1 && x1 > q.x0 - 0.1 && z0 < q.z1 + 0.1 && z1 > q.z0 - 0.1);
    const styles = [STYLE.BRICK, STYLE.BRICK, STYLE.BRICK, STYLE.SHOP, STYLE.HOUSE, STYLE.APT];
    const pal = { [STYLE.BRICK]: PAL.brick, [STYLE.SHOP]: PAL.shop, [STYLE.HOUSE]: PAL.house, [STYLE.APT]: PAL.apt };
    const build = (q, tx, tz, nx, nz, shopBias) => {
      const style = rng.chance(shopBias) ? STYLE.SHOP : rng.pick(styles), h = rng.range(7.5, 15.5), fh = style === STYLE.SHOP ? 3.6 : 3.1;
      const r = this._bld(b, q[0], q[1], q[2], q[3], h, style, rng.pick(pal[style]), fh, style === STYLE.BRICK ? 2.6 : 3.2, { gtype: style === STYLE.SHOP ? 1 : 0 });
      this._rooftop(b, r, rng, 'old'); placed.push(r);
      // the street face: an awning over a shop, a stoop at a house door
      const cx = (q[0] + q[2]) / 2, cz = (q[1] + q[3]) / 2, alongX = Math.abs(nz) >= Math.abs(nx);
      const fx = alongX ? cx : (nx < 0 ? q[0] : q[2]), fz = alongX ? (nz < 0 ? q[1] : q[3]) : cz, sx = alongX ? 0 : Math.sign(nx), sz = alongX ? Math.sign(nz) : 0;
      const wide = alongX ? q[2] - q[0] : q[3] - q[1];
      if (style === STYLE.SHOP) this._det(b, 'box', fx + sx * 0.9, CURB_H + 3.05, fz + sz * 0.9, alongX ? wide * 0.8 : 1.8, 0.12, alongX ? 1.8 : wide * 0.8, rng.pick(PAL.awning), 0);
      else if (wide > 4) this._det(b, 'box', fx + sx * 0.6, CURB_H + 0.25, fz + sz * 0.6, alongX ? 2.2 : 1.2, 0.5, alongX ? 1.2 : 2.2, 0x8c8780, 0, true);
      return r;
    };
    // along a polyline, on one side: terrace fronts set back across the pavement (`set` from the centre line), each the
    // biggest that fits; beside a curve a front steps back until its corner clears the kerb
    const line = (pts, set, side, shopBias) => {
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const L = cum[cum.length - 1];
      for (let d = 4; d < L - 4; d += 2) {
        let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++;
        const p = pts[k], c = pts[k + 1], sl = (cum[k + 1] - cum[k]) || 1, tx = (c[0] - p[0]) / sl, tz = (c[1] - p[1]) / sl, t = (d - cum[k]) / sl;
        const px = p[0] + (c[0] - p[0]) * t, pz = p[1] + (c[1] - p[1]) * t, nx = -tz * side, nz = tx * side;
        let got = null;
        for (const [w0, d0] of [[10, 11], [9, 10], [8, 10], [7, 9], [6, 8]]) {
          for (let back = 0; back <= 3 && !got; back += 0.5) {
            const off = set + d0 / 2 + back, cx = px + nx * off, cz = pz + nz * off, alongX = Math.abs(tx) >= Math.abs(tz);
            const wx = alongX ? w0 : d0, wz = alongX ? d0 : w0, q = [cx - wx / 2, cz - wz / 2, cx + wx / 2, cz + wz / 2];
            if (free(...q)) got = q;
          }
          if (got) break;
        }
        if (got) { build(got, tx, tz, nx, nz, shopBias); d += Math.max(got[2] - got[0], got[3] - got[1]) * 0.35; }
      }
    };
    // every door with an address on these cells first: a front right behind it, facing its street, so the business,
    // the flat, the bank or the HQ has its building wherever the street now runs
    const addr = [...PROPS, ...HOME_LADDER, ...SPOTS].map(d => d.at).concat(Object.values(HQS)).filter(at => at && superblockAt(at[0], at[1]) === sb);
    for (const at of addr) {
      const s = sidewalkSpot(at[0], at[1], at[2], at[3], ROAD_HALF + 3.1), ox = (CityLayout.siteI(at[0], at[1]) - at[0]) * P, oz = (CityLayout.siteJ(at[0], at[1]) - at[1]) * P;
      const nx = -Math.sin(s.h), nz = -Math.cos(s.h), alongX = Math.abs(nz) >= Math.abs(nx);
      let got = null;
      for (const [w0, d0] of [[9, 10], [8, 9], [7, 8], [6, 7]]) {
        for (let gap = 0.6; gap <= 2.6 && !got; gap += 0.4) {
          const cx = s.x - ox + nx * (gap + d0 / 2), cz = s.z - oz + nz * (gap + d0 / 2), wx = alongX ? w0 : d0, wz = alongX ? d0 : w0, q = [cx - wx / 2, cz - wz / 2, cx + wx / 2, cz + wz / 2];
          if (free(...q)) got = q;
        }
        if (got) break;
      }
      if (got) build(got, 0, 0, -nx, -nz, 0.6);
    }
    // the high street first (shops), then the lanes, then the edge streets
    for (const r of roads) { const hi = r.link === 'Saint Ivo Street' || r.link === 'Market Street'; for (const s of [1, -1]) line(r.pts, r.w / 2 + 2.6, s, hi ? 0.55 : 0.12); }
    const E = [[[sb.x0 - INNER, sb.z0 - INNER], [sb.x1 + INNER, sb.z0 - INNER], 1], [[sb.x1 + INNER, sb.z1 + INNER], [sb.x0 - INNER, sb.z1 + INNER], 1], [[sb.x0 - INNER, sb.z1 + INNER], [sb.x0 - INNER, sb.z0 - INNER], 1], [[sb.x1 + INNER, sb.z0 - INNER], [sb.x1 + INNER, sb.z1 + INNER], 1]];
    for (const [p, q, s] of E) line(linePts(p, q, 4), INNER, s, 0.2);
    // a second row behind the first (back terraces and mews houses round courtyards), where the land is deep enough
    for (const r of roads) for (const s of [1, -1]) line(r.pts, r.w / 2 + 2.6 + 15, s, 0);
    // ---- behind the frontage: gardens and yards (trees, bushes, a shed), never in a street, a building or the square
    const open = (x, z, m) => roads.every(r => polyDist(x, z, r.pts) > r.w / 2 + m) && Math.hypot(x - Q.x, z - Q.z) > Q.r + 1 && !(x > G.x0 && x < G.x1 && z > G.z0 && z < G.z1) && !placed.some(q => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m);
    for (let x = sb.x0 + 3; x < sb.x1 - 3; x += 6) for (let z = sb.z0 + 3; z < sb.z1 - 3; z += 6) {
      const jx = x + rng.range(-1.8, 1.8), jz = z + rng.range(-1.8, 1.8);
      if (!open(jx, jz, 2.4)) continue;
      if (rng.chance(0.08) && open(jx, jz, 4.5)) { const r = this._bld(b, jx - 1.8, jz - 1.5, jx + 1.8, jz + 1.5, 2.6, STYLE.HOUSE, rng.pick(PAL.house), 2.6, 3, { exactH: true }); placed.push(r); continue; }
      if (rng.chance(0.55)) this._prop(b, rng.chance(0.6) ? 'tree' : 'bush', jx, jz, rng.range(0, 6), rng.range(0.8, 1.2));
    }
    // ---- lamps along the streets (alternate sides on the pavement), cars at the kerbs
    for (const r of roads) {
      const pts = r.pts; let acc = 0, side = 1;
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], c = pts[k + 1], l = Math.hypot(c[0] - p[0], c[1] - p[1]); if (l < 0.01) continue;
        const tx = (c[0] - p[0]) / l, tz = (c[1] - p[1]) / l;
        for (let s = (22 - acc % 22 + 22) % 22; s < l; s += 22) {
          const x = p[0] + tx * s - tz * side * (r.w / 2 + 1.1), z = p[1] + tz * s + tx * side * (r.w / 2 + 1.1); side = -side;
          if (x < sb.x0 || x > sb.x1 || z < sb.z0 || z > sb.z1 || this._roadDist(x, z) < 0.5 || placed.some(q => x > q.x0 - 0.5 && x < q.x1 + 0.5 && z > q.z0 - 0.5 && z < q.z1 + 0.5)) continue;
          this._prop(b, 'parklamp', x, z, 0);
        }
        acc += l;
      }
      this._kerbCars(b, rng, r, roads);
    }
    b.secrets.push({ x: 30, z: 360 }, { x: 200, z: 540 });
    this.mapPlaces.push({ id: 'oldquarter', name: 'Saint Ivo Square', cat: 'landmark', icon: '⛲', x: Q.x, z: Q.z, sub: 'The Old Quarter’s square, on Saint Ivo Street' });
    sb.name = 'Old Quarter';
  }
});
