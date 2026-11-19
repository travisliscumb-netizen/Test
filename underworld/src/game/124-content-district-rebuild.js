/* =====================================================================
   [CONTENT] THE DISTRICT REBUILD KIT (owner, 2026-11-19: the whole original city redeveloped; CITY_REBUILD.md)
   A district's lattice cells are one superblock (020: SUPERBLOCKS, its `gen` '_genRebuilt' and its `rb` the id of
   its definition here). The lattice inside it closes and its streets are hand-shaped curves (links, 020: traffic,
   the GPS, taxis and the police use them). The kit lays everything else from the definition:
   - the streets and their pavements, kerbside parking where the definition says;
   - the landmarks it keeps (a whole cell regenerated where it stood, `keep`) and its squares;
   - a front behind every door with an address on its cells (a business, a home, a bank, an HQ), found on the
     nearest of its streets when the lattice street it had is gone (`rebuiltSpot`, asked by sidewalkSpot, 390);
   - frontage along every street (shops on the high streets), along the edge streets inside the district, a second
     row behind, gardens and yards behind that; lamps along the streets, cars at the kerbs.
   The cells stay the address system: the district, its turfs and its name are the cells', as they were.
   Definitions are in lattice metres (the district's precinct places them, 021).

   A definition (REBUILDS[id]):
     name        the district's name (the superblock's)
     streets     [{ name, w, park: [sides], fork: index, near: [x, z], ctrl: [[x, z]...], high: true, res: true,
                   circle: r }]: `high` a high street (shops), `res` lined with detached houses, `circle` a cul-de-sac
                 ending in a turning circle of that radius
                 a street that starts on another (`fork`) starts on that street's own polyline, so the junction is
                 exact; every other end meets an edge street side-on
     addr        { 'bx,bz,side,along': [x, z] }: where to look for a door whose own street point has no room
     keep        [{ bx, bz, gen, landmark: 'bx,bz' } | { bx, bz, cell: true }]: a cell regenerated where it stood (its
                 rect kept clear): by a landmark generator, or by the city's own (a SPECIAL cell, 020); `forecourts`
                 [[x0, z0, x1, z1]]: paved and kept clear between a door (or a respawn point) and its street; `low`
                 { r, h }: everything built within r of it no taller than h (a rooftop helipad's approaches)
                 or a roundabout's ring: { name, id, ring: radius, at: [x, z], w }; a street ends on another
                 (`join`: its index, `joinNear`: where), exactly on its line
     squares     [{ x, z, r, ring, fountain: true, name, sub, icon, secret: [dx, dz] }]
     styles      the frontage's styles (weights by repetition); heights [lo, hi]
     sidewalks   _sbSidewalks' options
     secrets     [[x, z]]
     houses      the edge streets inside the district lined with houses too; rich: the bigger houses; mix: the
                 weights of a residential lot's kind ({ house, semi, apartment })
     require     [{ spec: { type, w, d, garage }, n, zone }]: homes the district must have (the property ladder's), placed
                 first where the cell's zone is `zone`
     gap         the space kept between buildings (0.1 m: terraces)
     secondRow   false: no back row behind the street frontage (suburbs)
     extras      (world, b, sb, rng, kit) a hook after the frontage, before the gardens
   ===================================================================== */
const REBUILDS = {};
// how far a polyline turns along its length (radians, summed): a crescent's, not a straight street's
function polyTurn(pts) { let t = 0; for (let k = 1; k < pts.length - 1; k++) { const a = Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]), c = Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]); t += Math.abs(Math.atan2(Math.sin(c - a), Math.cos(c - a))); } return t; }
// the city's roundabouts (a rebuilt district's rings, in world metres; filled as the world is built): the traffic reads
// them beside the island's (023: ROUNDABOUTS)
const CITY_RINGS = [];
// the streets' polylines (computed once per district: sidewalkSpot needs them before the world is built)
const REBUILD_LINES = {};
function rebuildLines(id) {
  if (REBUILD_LINES[id]) return REBUILD_LINES[id];
  const out = [];
  const nearOn = (pts, q) => { let k = 0, best = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]); if (d < best) { best = d; k = i; } } return pts[k]; };
  for (const S of REBUILDS[id].streets) {
    // a roundabout's ring: closed, one way, anticlockwise on the map (decreasing angle: traffic keeps right), a vertex
    // every ~2 m; the streets that meet it start on it (`fork`) or end on it (`join`) at one of its vertices
    if (S.ring) {
      const [cx, cz] = S.at, r = S.ring, m = Math.max(24, Math.round(2 * Math.PI * r / 2)), pts = [];
      for (let k = 0; k < m; k++) { const an = -k / m * Math.PI * 2; pts.push([cx + Math.cos(an) * r, cz + Math.sin(an) * r]); }
      pts.push(pts[0].slice());
      out.push({ name: S.name, w: S.w, park: null, high: false, res: false, ring: null, closed: true, rb: { id: S.id, name: S.name, x: cx, z: cz, r, w: S.w }, pts });
      continue;
    }
    let ctrl = S.ctrl;
    if (S.join !== undefined) ctrl = [...ctrl, nearOn(out[S.join].pts, S.joinNear)];
    if (S.fork !== undefined) {
      const par = out[S.fork].pts; let k = 0, best = Infinity;
      for (let i = 0; i < par.length; i++) { const d = Math.hypot(par[i][0] - S.near[0], par[i][1] - S.near[1]); if (d < best) { best = d; k = i; } }
      ctrl = [par[k], ...ctrl];
    }
    const pts = splinePts(ctrl);
    // a cul-de-sac: its far end opens into a turning circle (radius `circle` to the lane's centre) straight ahead
    let ring = null;
    if (S.circle) { const a = pts[pts.length - 2], c = pts[pts.length - 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; ring = { x: c[0] + (c[0] - a[0]) / l * S.circle, z: c[1] + (c[1] - a[1]) / l * S.circle, r: S.circle }; }
    out.push({ name: S.name, w: S.w, park: S.park || null, high: !!S.high, res: !!S.res, ring, pts });
  }
  return (REBUILD_LINES[id] = out);
}
// a door on a rebuilt district's cells (sidewalkSpot's address), on its new streets: the kerbside point of the
// nearest street, `o` from its centre line as the lattice spot was from its own, facing the street. Only for a side
// whose lattice street is gone; a side on an edge street that still runs keeps its spot. Lattice metres, or null.
function rebuiltSpot(bx, bz, side, x, z, o, along) {
  const sb = superblockAt(bx, bz); if (!sb || !sb.rb || !REBUILDS[sb.rb]) return null;
  // (an address the definition moves is moved even from an edge street that still runs: its corner is a junction now)
  const fix = (REBUILDS[sb.rb].addr || {})[bx + ',' + bz + ',' + side + ',' + along];
  // (the road net is by site, where the precinct stands, 021: the same answer while the city is built in the lattice and
  // once it stands on the island)
  if (!fix && RoadNet.sideOpen(CityLayout.siteI(bx, bz), CityLayout.siteJ(bx, bz), [0, 3, 1, 2][side])) return null;
  if (fix) { x = fix[0]; z = fix[1]; }
  let best = null;
  for (const L of rebuildLines(sb.rb)) for (let k = 0; k < L.pts.length - 1; k++) {
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
  // a square: paving, and a fountain with trees, benches and lamps round it
  _rbSquare(b, Q, rng) {
    this._discS(Q.x, Q.z, Q.r, 'concrete');
    if (Q.fountain !== false) {
      this._det(b, 'cyl', Q.x, CURB_H + 0.4, Q.z, 2.8, 0.8, 0x8d8a84, null, { x: Q.x, z: Q.z, r: 2.8, y0: 0, y1: 0.9, kind: 'det' });
      this._det(b, 'cyl', Q.x, CURB_H + 1.2, Q.z, 0.4, 1.6, 0x9a958c);
      b.water.push({ x: Q.x, z: Q.z, r: 2.4, y: CURB_H + 0.82 });
      b.fx.push({ type: 'fountain', x: Q.x, y: CURB_H + 2.0, z: Q.z });
    }
    const R = Q.ring || Q.r * 0.65;
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + 0.3, x = Q.x + Math.cos(t) * R, z = Q.z + Math.sin(t) * R; if (k % 2) this._prop(b, 'tree', x, z, rng.range(0, 6), 0.9); else { const ry = Math.atan2(Q.x - x, Q.z - z); this._prop(b, 'bench', x, z, ry); b.seats.push({ x, z, ry }); } }
    this._prop(b, 'parklamp', Q.x + Q.r - 1.5, Q.z - 3, 0); this._prop(b, 'parklamp', Q.x - Q.r + 1.5, Q.z + 3, 0);
    if (Q.secret) b.secrets.push({ x: Q.x + Q.secret[0], z: Q.z + Q.secret[1] });
  },
  // a city roundabout's middle: a kerbed island with planting and a tree, and a give-way sign at each street that comes
  // onto the ring (the island's roundabouts have the same, 128b)
  _rbCentre(b, RB, roads, lines) {
    const ri = RB.r - RB.w / 2 - 0.4, y = CURB_H - 0.15;
    this._det(b, 'cyl', RB.x, y + 0.12, RB.z, ri, 0.24, C(0xc9c6bd), null, { x: RB.x, z: RB.z, r: ri - 0.3, y0: y - 1, y1: y + 0.6, kind: 'det' });
    this._det(b, 'cyl', RB.x, y + 0.255, RB.z, ri - 0.35, 0.03, C(0x5f8a46));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rr = ri - 1.4; this._det(b, 'blob', RB.x + Math.cos(a) * rr, y + 0.7, RB.z + Math.sin(a) * rr, 0.8, 0.7, 0.8, C(k % 2 ? 0x3f6a34 : 0x4c7a3a)); }
    this._det(b, 'cyl', RB.x, y + 1.6, RB.z, 0.28, 2.8, C(0x5a4632));
    this._det(b, 'blob', RB.x, y + 4.2, RB.z, 2.8, 2.4, 2.8, C(0x3f6a34));
    for (const L of lines) {
      if (L.closed) continue;
      for (const [p, q] of [[L.pts[0], L.pts[Math.min(L.pts.length - 1, 6)]], [L.pts[L.pts.length - 1], L.pts[Math.max(0, L.pts.length - 7)]]]) {
        if (Math.abs(Math.hypot(p[0] - RB.x, p[1] - RB.z) - RB.r) > 0.6) continue;
        const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / l, uz = (p[1] - q[1]) / l, rx = -uz, rz = ux, side = L.w / 2 + 1.2;
        const gx = p[0] - ux * (RB.w / 2 + 2.5) + rx * side, gz = p[1] - uz * (RB.w / 2 + 2.5) + rz * side;
        this._det(b, 'cyl', gx, CURB_H + 1.25, gz, 0.05, 2.5, 0x6a6e72, null, { x: gx, z: gz, r: 0.12, y0: 0, y1: 2.6, kind: 'det' });
        b.signs.push({ text: 'GIVE WAY', x: gx - ux * 0.04, y: CURB_H + 2.3, z: gz - uz * 0.04, ry: Math.atan2(-ux, -uz), w: 0.95, h: 0.62, bg: '#ffffff', fg: '#c8102e' });
      }
    }
  },
  // a rebuilt district (its superblock's `rb` names the definition)
  _genRebuilt(a, sb, rng) {
    const D = REBUILDS[sb.rb];
    for (const m of sb.members) m.wires = m.wires || [];
    this._sbSidewalks(sb, rng, D.sidewalks || { trees: 0.3, park: 0.4 });
    const b = a, lines = rebuildLines(sb.rb), roads = [];
    // the streets: pavements both sides, the frontage's depth (concrete under the asphalt: what the shader and the maps
    // draw), then the carriageways (kerbside parking where the definition says)
    // (the world gets its own copies of the lines' points and rings: the bake moves what the world holds to where the
    // precinct stands, 090, and the lines stay in lattice metres for rebuiltSpot)
    const own = pts => pts.map(q => [q[0], q[1]]);
    for (const L of lines) { this._road(own(L.pts), L.w + 5.4, 'concrete'); if (L.ring) this._discS(L.ring.x, L.ring.z, L.ring.r + L.w / 2 + 2.7, 'concrete'); }
    const wox = (CityLayout.siteI(sb.bx0, sb.bz0) - sb.bx0) * P, woz = (CityLayout.siteJ(sb.bx0, sb.bz0) - sb.bz0) * P;
    for (const L of lines) {
      const r = this._road(own(L.pts), L.w, 'asphalt', { link: L.name }); r.park = L.park; r.high = L.high; r.res = L.res; roads.push(r);
      // a roundabout's ring (023's machinery: one way round, give way on entry, 135 and 280): built in the lattice, its
      // centre moves with the road when the city is baked to where its precinct stands; the traffic reads the same
      // object in CITY_RINGS, in world metres once the world stands
      if (L.closed) { r.closed = true; r.oneway = true; r.ringOf = { ...L.rb }; r.roundabout = { ...L.rb, y: CURB_H }; { const i0 = CITY_RINGS.findIndex(q => q.id === L.rb.id); if (i0 >= 0) CITY_RINGS.splice(i0, 1); } CITY_RINGS.push(r.roundabout); this._rbCentre(b, L.rb, roads, lines); }
      // (a cul-de-sac is a spur: its far end is free, traffic turns round its circle, 020 Links, 135)
      if (L.ring) { r.spur = true; r.ring = { ...L.ring }; this._discS(L.ring.x, L.ring.z, L.ring.r + L.w / 2, 'asphalt'); }
    }
    const circles = lines.filter(L => L.ring).map(L => ({ x: L.ring.x, z: L.ring.z, r: L.ring.r + L.w / 2 })).concat(lines.filter(L => L.closed).map(L => ({ x: L.rb.x, z: L.rb.z, r: L.rb.r + L.w / 2 + 2.7 })));
    // the landmarks it keeps, where they always stood (a landmark as it always was: the kicker pass leaves it alone, and
    // it keeps its name in the superblock)
    const kept = [], lows = [];
    for (const K of D.keep || []) {
      // (`cell`: the city's own generator for that cell, as it was before the district was rebuilt: the police station,
      // the hospital; its own seed, so it stands exactly as it did)
      // (its own ground: a park's paths, a forecourt's paving; the district's lawn is the superblock's)
      const gb = this.block(K.bx, K.bz); gb.ground = null;
      if (K.cell) { const sbk = gb.superblock; gb.superblock = null; this._genBlock(gb); gb.superblock = sbk; gb.kept = true; } else this[K.gen](gb, rng);
      if (K.landmark) { gb.landmark = LANDMARK_BLOCKS[K.landmark]; gb.name = gb.landmark.name; }
      kept.push({ x0: gb.x0 - 1, z0: gb.z0 - 1, x1: gb.x1 + 1, z1: gb.z1 + 2 });
      if (K.low) lows.push({ x: (gb.x0 + gb.x1) / 2, z: (gb.z0 + gb.z1) / 2, r: K.low.r, h: K.low.h });
      // its forecourt: paved and kept clear from its door to the street that serves it now
      for (const [x0, z0, x1, z1] of K.forecourts || []) { this._rectS(x0, z0, x1, z1, 'concrete'); kept.push({ x0, z0, x1, z1 }); }
    }
    // the squares
    const squares = D.squares || [];
    for (const Q of squares) this._rbSquare(b, Q, rng);
    // ---- the frontage: terraces along every street, both sides, and along the edge streets inside the district
    const clearRoads = (x0, z0, x1, z1, m) => roads.every(r => rectPolyDist(x0, z0, x1, z1, r.pts) > r.w / 2 + m) && circles.every(c => Math.hypot(clamp(c.x, x0, x1) - c.x, clamp(c.z, z0, z1) - c.z) > c.r + m);
    const placed = [];
    // the stunt jumps' lanes: run-up, flight and landing kept clear of anything built
    const lanes = (this.surfaces || []).filter(s => s.unique && s.x1 > sb.x0 - 40 && s.x0 < sb.x1 + 40 && s.z1 > sb.z0 - 40 && s.z0 < sb.z1 + 40).map(s => {
      const ax = s.axis === 'x', c = ax ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2, lo = (ax ? s.x0 : s.z0) - 32, hi = (ax ? s.x1 : s.z1) + 32, hw = (ax ? s.z1 - s.z0 : s.x1 - s.x0) / 2 + 4;
      return ax ? [lo, c - hw, hi, c + hw] : [c - hw, lo, c + hw, hi];
    });
    const gap = D.gap ?? 0.1, doorways = [];
    let ownDoor = null;
    const inKept = (x0, z0, x1, z1) => kept.some(G => x0 < G.x1 && x1 > G.x0 && z0 < G.z1 && z1 > G.z0);
    const inSquare = (x0, z0, x1, z1, m) => squares.some(Q => Math.hypot(clamp(Q.x, x0, x1) - Q.x, clamp(Q.z, z0, z1) - Q.z) <= Q.r + m);
    const free = (x0, z0, x1, z1) => x0 >= sb.x0 && z0 >= sb.z0 && x1 <= sb.x1 && z1 <= sb.z1
      && !lanes.some(L => x0 < L[2] && x1 > L[0] && z0 < L[3] && z1 > L[1])
      && !inKept(x0, z0, x1, z1)
      && !inSquare(x0, z0, x1, z1, 2)
      && clearRoads(x0, z0, x1, z1, 2.6)
      && !placed.some(q => x0 < q.x1 + gap && x1 > q.x0 - gap && z0 < q.z1 + gap && z1 > q.z0 - gap)
      && !doorways.some(q => q !== ownDoor && x0 < q[2] && x1 > q[0] && z0 < q[3] && z1 > q[1]);
    // the kicker jumps the city sets in its industrial cells after it is built (100 _postGen: the same seeded draw): in a
    // rebuilt cell its spot is chosen now, off every street, and its ramp, run-up and landing are kept clear like a
    // stunt lane, so the jump (the same one, its id) has room wherever the district's streets now run
    for (const m of sb.members) {
      if (m.t !== 'I' || m.landmark || m.kept || !new RNG(m.i * 31 + 7).chance(0.3)) continue;
      let best = null, bd = Infinity;
      for (let x = m.x0 + 6; x <= m.x1 - 6; x += 2) for (let z = m.z0 + 20; z <= m.z1 - 4; z += 2) {
        const ramp = [x - 2.4, z - 4, x + 2.4, z + 4], lane = [x - 3.4, z - 4 - 16, x + 3.4, z + 4 + 20];
        if (!clearRoads(...ramp, 2) || inKept(...lane) || inSquare(...lane, 1) || lanes.some(L => lane[0] < L[2] && lane[2] > L[0] && lane[1] < L[3] && lane[3] > L[1])) continue;
        const d = Math.hypot(x - (m.x0 + m.x1) / 2, z - (m.z0 + m.z1) / 2); if (d < bd) { bd = d; best = { x, z, lane }; }
      }
      if (!best) continue;
      m.jumpSpot = { x: best.x, z: best.z };
      lanes.push(best.lane);
    }
    // the building site's dirt jump (100 _postGen: the city's `X` cells): in a rebuilt cell its spot is chosen now too,
    // the ramp off every street, its 30 m run-up and 24 m landing kept clear (along x as it always ran, else along z)
    for (const m of sb.members) {
      if (m.t !== 'X' || m.landmark || m.kept) continue;
      const want = [(m.x0 + m.x1) / 2 - 1, m.z1 - 13.5];
      let best = null, bd = Infinity;
      for (const axis of ['x', 'z']) {
        for (let x = m.x0 + 5; x <= m.x1 - 5; x += 2) for (let z = m.z0 + 5; z <= m.z1 - 5; z += 2) {
          const ramp = axis === 'x' ? [x - 5, z - 2.5, x + 5, z + 2.5] : [x - 2.5, z - 5, x + 2.5, z + 5];
          const lane = axis === 'x' ? [x - 35, z - 3.6, x + 29, z + 3.6] : [x - 3.6, z - 35, x + 3.6, z + 29];
          if (!clearRoads(...ramp, 1.5) || inKept(...lane) || inSquare(...lane, 1) || lanes.some(L => lane[0] < L[2] && lane[2] > L[0] && lane[1] < L[3] && lane[3] > L[1])) continue;
          const d = Math.hypot(x - want[0], z - want[1]); if (d < bd) { bd = d; best = { x, z, axis, lane }; }
        }
        if (best) break;
      }
      if (!best) continue;
      m.dirtSpot = { x: best.x, z: best.z, axis: best.axis };
      lanes.push(best.lane);
    }
    const styles = D.styles || [STYLE.BRICK, STYLE.BRICK, STYLE.BRICK, STYLE.SHOP, STYLE.HOUSE, STYLE.APT];
    const pal = { [STYLE.BRICK]: PAL.brick, [STYLE.SHOP]: PAL.shop, [STYLE.HOUSE]: PAL.house, [STYLE.APT]: PAL.apt, [STYLE.DECO]: PAL.deco, [STYLE.OFFICE]: PAL.office, [STYLE.GLASS]: PAL.glass || PAL.deco, [STYLE.TOWER]: PAL.glass || PAL.deco, [STYLE.IND]: PAL.ind || PAL.brick, [STYLE.WARE]: PAL.ind || PAL.brick };
    const [hLo, hHi] = D.heights || [7.5, 15.5];
    D.secondAt = D.secondAt ?? 15;
    // (`door`: a building behind an address's door: the game dresses that door itself, 450, and nudges it off anything
    // solid, so no stoop is built under it)
    const build = (q, tx, tz, nx, nz, shopBias, door = false) => {
      const style = rng.chance(shopBias) ? STYLE.SHOP : rng.pick(styles), fh = style === STYLE.SHOP ? 3.6 : 3.1;
      // (low round a kept rooftop helipad: its approaches are kept clear, `low` on the cell it keeps)
      let h = rng.range(hLo, hHi);
      for (const L2 of lows) if (Math.hypot(clamp(L2.x, q[0], q[2]) - L2.x, clamp(L2.z, q[1], q[3]) - L2.z) < L2.r) h = Math.min(h, L2.h);
      const r = this._bld(b, q[0], q[1], q[2], q[3], h, style, rng.pick(pal[style]), fh, style === STYLE.BRICK ? 2.6 : 3.2, { gtype: style === STYLE.SHOP ? 1 : 0 });
      this._rooftop(b, r, rng, D.roof || 'old'); placed.push(r);
      // the street face: an awning over a shop, a stoop at a house door
      const cx = (q[0] + q[2]) / 2, cz = (q[1] + q[3]) / 2, alongX = Math.abs(nz) >= Math.abs(nx);
      const fx = alongX ? cx : (nx < 0 ? q[0] : q[2]), fz = alongX ? (nz < 0 ? q[1] : q[3]) : cz, sx = alongX ? 0 : Math.sign(nx), sz = alongX ? Math.sign(nz) : 0;
      const wide = alongX ? q[2] - q[0] : q[3] - q[1];
      if (style === STYLE.SHOP) this._det(b, 'box', fx + sx * 0.9, CURB_H + 3.05, fz + sz * 0.9, alongX ? wide * 0.8 : 1.8, 0.12, alongX ? 1.8 : wide * 0.8, rng.pick(PAL.awning), 0);
      else if (wide > 4 && !door) this._det(b, 'box', fx + sx * 0.6, CURB_H + 0.25, fz + sz * 0.6, alongX ? 2.2 : 1.2, 0.5, alongX ? 1.2 : 2.2, 0x8c8780, 0, true);
      return r;
    };
    // along a polyline, on one side: fronts set back across the pavement (`set` from the centre line), each the biggest
    // that fits; beside a curve a front steps back until its corner clears the kerb
    const sizes = D.sizes || [[10, 11], [9, 10], [8, 10], [7, 9], [6, 8]];
    const line = (pts, set, side, shopBias) => {
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const L = cum[cum.length - 1];
      for (let d = 4; d < L - 4; d += 2) {
        let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++;
        const p = pts[k], c = pts[k + 1], sl = (cum[k + 1] - cum[k]) || 1, tx = (c[0] - p[0]) / sl, tz = (c[1] - p[1]) / sl, t = (d - cum[k]) / sl;
        const px = p[0] + (c[0] - p[0]) * t, pz = p[1] + (c[1] - p[1]) * t, nx = -tz * side, nz = tx * side;
        let got = null;
        for (const [w0, d0] of sizes) {
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
    // along a residential street, on one side: detached houses (the city's own, 120: a drive, a garage or carport, a
    // yard), each facing the street square to its nearest axis, set back behind a front garden
    // (a house goes into the block of the cell it stands in: its home's address, its streaming chunk)
    const cellAt = (x, z) => this.block(clamp(Math.floor(x / P), sb.bx0, sb.bx1), clamp(Math.floor(z / P), sb.bz0, sb.bz1));
    const mix = D.mix || { house: 1 }, mixT = Object.values(mix).reduce((a2, c2) => a2 + c2, 0);
    const lotKind = () => { let r = rng.next() * mixT; for (const k in mix) { r -= mix[k]; if (r <= 0) return k; } return 'house'; };
    // the homes a district must have (the property ladder buys them by type, garage and district, 500): placed first
    // where the zone is right, each counted only when its garage was really built
    const req = (D.require || []).map(r => ({ ...r, left: r.n }));
    // a house's drive: straight out of the front, to the street ahead within 22 m. The district's own streets are local
    // roads (the drive finds them itself, 'auto', 120); an edge street is the lattice's (RoadNet): the drive is paved to
    // its carriageway, as long as it is from the front. null: no street ahead (a spur across the neighbours' lots would
    // be needed, so no house)
    const driveAhead = (x, z, fv) => {
      for (let t = 0; t <= 22; t += 0.5) {
        const qx = x + fv[0] * t, qz = z + fv[1] * t;
        if (this._roadDist(qx, qz) < 0.15) return 'auto';
        if (RoadNet.roadAt(qx, qz)) return t;
      }
      return null;
    };
    const houseLine = (pts, set, side) => {
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const L = cum[cum.length - 1];
      for (let d = 8; d < L - 8; d += 2) {
        let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++;
        const p = pts[k], c = pts[k + 1], sl = (cum[k + 1] - cum[k]) || 1, tx = (c[0] - p[0]) / sl, tz = (c[1] - p[1]) / sl, t = (d - cum[k]) / sl;
        const px = p[0] + (c[0] - p[0]) * t, pz = p[1] + (c[1] - p[1]) * t, nx = -tz * side, nz = tx * side;
        // the door faces the street: the axis nearest to -n
        const face = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 2 : 3) : (nz > 0 ? 0 : 1), ns = face < 2;
        // the lot: a house (the city's mix, 120), a semi-detached pair or a low block of flats (D.mix: their weights)
        const zk = zoneKey(px + nx * 15 + wox, pz + nz * 15 + woz), R0 = req.find(r => r.left > 0 && (!r.zone || r.zone === zk));
        const kind = R0 ? (R0.spec.type === 'semi' ? 'semi' : R0.spec.type === 'apartment' ? 'apartment' : 'house') : lotKind();
        const H = R0 ? { ...R0.spec } : kind === 'semi' ? { type: 'semi', w: 14.4, d: 9, garage: 'street' } : kind === 'apartment' ? { type: 'apartment', w: 22, d: 12, garage: 'street', flat: true } : this._pickHouse(rng, !!D.rich);
        const gw = H.garage === 'triple' ? 10.3 : H.garage === 'double' ? 7 : H.garage === 'single' || H.garage === 'carport' ? 3.7 : 0;
        // (a house with a garage or carport stands back 6 m, room for its drive and the garage beside it; a semi or flats 3.5 m)
        const off = set + (kind === 'house' ? 6 : 3.5) + H.d / 2, cx = px + nx * off, cz = pz + nz * off, half = H.w / 2 + gw;
        const q = ns ? [cx - half, cz - H.d / 2 - 1, cx + half, cz + H.d / 2 + 1] : [cx - H.d / 2 - 1, cz - half, cx + H.d / 2 + 1, cz + half];
        if (!free(...q)) continue;
        // (its drive must meet the street straight out of the garage side of the front, as a real drive does: where the
        // street is not ahead within 22 m the house would need a spur across its neighbours' lots, so none is built)
        const fv = FACE_V[face], fx0 = cx + fv[0] * H.d / 2, fz0 = cz + fv[1] * H.d / 2, drive = driveAhead(fx0, fz0, fv);
        if (drive === null) continue;
        let home;
        if (kind === 'semi') for (const s2 of [-1, 1]) home = this._house(cellAt(cx, cz), rng, { x: ns ? cx + s2 * 3.6 : cx, z: ns ? cz : cz + s2 * 3.6, face, type: 'semi', w: 7.2, d: 9, garage: 'street', drive, doorOff: s2 * 1.6, bounds: sb });
        else home = this._house(cellAt(cx, cz), rng, Object.assign({}, H, { x: cx, z: cz, face, drive, gs: rng.chance(0.5) ? 1 : -1, bounds: sb }));
        placed.push({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], house: home });
        if (R0 && home && home.type === R0.spec.type && (home.garage || 'street') === R0.spec.garage) R0.left--;
        d += (ns ? q[2] - q[0] : q[3] - q[1]) * 0.6;
      }
    };
    // round a cul-de-sac's turning circle: houses facing it (not across its mouth)
    const circleHouses = L => {
      const R0 = L.ring, a0 = L.pts[L.pts.length - 2], mouth = Math.atan2(a0[1] - R0.z, a0[0] - R0.x);
      for (let k = 0; k < 7; k++) {
        const an = mouth + (k + 1) / 8 * Math.PI * 2, nx = Math.cos(an), nz = Math.sin(an);
        const face = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 2 : 3) : (nz > 0 ? 0 : 1), ns = face < 2;
        const H = this._pickHouse(rng, !!D.rich), gw = H.garage === 'triple' ? 10.3 : H.garage === 'double' ? 7 : H.garage === 'single' || H.garage === 'carport' ? 3.7 : 0;
        const off = R0.r + L.w / 2 + 2.6 + 3.5 + H.d / 2, cx = R0.x + nx * off, cz = R0.z + nz * off, half = H.w / 2 + gw;
        const q = ns ? [cx - half, cz - H.d / 2 - 1, cx + half, cz + H.d / 2 + 1] : [cx - H.d / 2 - 1, cz - half, cx + H.d / 2 + 1, cz + half];
        if (!free(...q)) continue;
        const fv = FACE_V[face], fx0 = cx + fv[0] * H.d / 2, fz0 = cz + fv[1] * H.d / 2, drive = driveAhead(fx0, fz0, fv);
        if (drive === null) continue;
        const home = this._house(cellAt(cx, cz), rng, Object.assign({}, H, { x: cx, z: cz, face, drive, gs: rng.chance(0.5) ? 1 : -1, bounds: sb }));
        placed.push({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], house: home });
      }
    };
    // every door with an address on these cells first: a front right behind it, facing its street, so the business,
    // the flat, the bank or the HQ has its building wherever the street now runs
    // (a bank is a deep building: its staff door is on the back, well behind the counter)
    const addr = [...PROPS, ...HOME_LADDER, ...SPOTS].map(d => ({ at: d.at, bank: !!d.bank })).concat(Object.values(HQS).map(at => ({ at }))).filter(a => a.at && superblockAt(a.at[0], a.at[1]) === sb);
    const doorOf = new Map();
    // every door's way in, kept clear: from the kerb to just behind where the door stands (the game finds each door at
    // the facade behind its kerbside spot, 450; a neighbour's front built there would swallow it)
    for (const { at } of addr) {
      const s0 = sidewalkSpot(at[0], at[1], at[2], at[3]), ox = (CityLayout.siteI(at[0], at[1]) - at[0]) * P, oz = (CityLayout.siteJ(at[0], at[1]) - at[1]) * P;
      const fx = Math.sin(s0.h), fz = Math.cos(s0.h), x = s0.x - ox, z = s0.z - oz, ax = Math.abs(fz) >= Math.abs(fx);
      // (2 m to the street side of the spot, 0.4 m behind it, 1.6 m to either side)
      const xa = x + fx * 2, za = z + fz * 2, xb = x - fx * 0.4, zb = z - fz * 0.4;
      const dw = ax ? [Math.min(xa, xb) - 1.6, Math.min(za, zb), Math.max(xa, xb) + 1.6, Math.max(za, zb)] : [Math.min(xa, xb), Math.min(za, zb) - 1.6, Math.max(xa, xb), Math.max(za, zb) + 1.6];
      doorways.push(dw); doorOf.set(at, dw);
    }
    // (a bank first: it needs the most ground, a deep hall with its service yard behind)
    addr.sort((p2, q2) => (q2.bank ? 1 : 0) - (p2.bank ? 1 : 0));
    for (const { at, bank } of addr) {
      // (an address's own way in never stops its own building: only its neighbours')
      ownDoor = doorOf.get(at) || null;
      const s = sidewalkSpot(at[0], at[1], at[2], at[3], ROAD_HALF + 3.1), ox = (CityLayout.siteI(at[0], at[1]) - at[0]) * P, oz = (CityLayout.siteJ(at[0], at[1]) - at[1]) * P;
      const nx = -Math.sin(s.h), nz = -Math.cos(s.h), alongX = Math.abs(nz) >= Math.abs(nx);
      let got = null;
      for (const [w0, d0] of bank ? [[18, 24], [16, 23], [14, 22], [13, 20], [12, 18]] : [[9, 10], [8, 9], [7, 8], [6, 7], [5.5, 6], [5, 5.5]]) {
        // (further back where a slanted street leaves no room close in: the game walks the door up to its facade, 450)
        for (let gap = 0.7; gap <= 8 && !got; gap += 0.35) {
          // (square to the axis the front faces: the front stands `gap` behind the door whatever the street's slant, so
          // the door is never inside its own building's corner)
          const cx = s.x - ox + (alongX ? 0 : Math.sign(nx) * (gap + d0 / 2)), cz = s.z - oz + (alongX ? Math.sign(nz) * (gap + d0 / 2) : 0), wx = alongX ? w0 : d0, wz = alongX ? d0 : w0, q = [cx - wx / 2, cz - wz / 2, cx + wx / 2, cz + wz / 2];
          if (free(...q)) got = q;
        }
        if (got) break;
      }
      if (got) {
        // the way from the door to the facade, when it stands back: kept clear (the door walks up to it, 450)
        { const [x0, z0, x1, z1] = got, sx = s.x - ox, sz = s.z - oz; doorways.push(alongX ? [sx - 2, Math.min(sz, nz > 0 ? z0 : z1), sx + 2, Math.max(sz, nz > 0 ? z0 : z1)] : [Math.min(sx, nx > 0 ? x0 : x1), sz - 2, Math.max(sx, nx > 0 ? x0 : x1), sz + 2]); }
        const r = build(got, 0, 0, -nx, -nz, bank ? 0 : 0.6, true);
        // a bank's service yard behind it, kept open: its staff door is on the back wall (512, rearOf)
        if (bank) { r.style = STYLE.DECO; r.color = C(rng.pick(PAL.deco)); const [x0, z0, x1, z1] = got; placed.push(alongX ? (nz > 0 ? { x0, z0: z1, x1, z1: z1 + 8 } : { x0, z0: z0 - 8, x1, z1: z0 }) : (nx > 0 ? { x0: x1, z0, x1: x1 + 8, z1 } : { x0: x0 - 8, z0, x1: x0, z1 })); }
      }
    }
    // the high streets first (shops), then the lanes, then the edge streets
    ownDoor = null;
    for (const L of lines) if (L.ring && L.res) circleHouses(L);
    for (const r of roads) { if (r.closed) continue; const hi = r.high; for (const s of [1, -1]) { if (r.res) houseLine(r.pts, r.w / 2 + 2.6, s); else line(r.pts, r.w / 2 + 2.6, s, hi ? 0.55 : 0.12); } }
    const E = [[[sb.x0 - INNER, sb.z0 - INNER], [sb.x1 + INNER, sb.z0 - INNER], 1], [[sb.x1 + INNER, sb.z1 + INNER], [sb.x0 - INNER, sb.z1 + INNER], 1], [[sb.x0 - INNER, sb.z1 + INNER], [sb.x0 - INNER, sb.z0 - INNER], 1], [[sb.x1 + INNER, sb.z0 - INNER], [sb.x1 + INNER, sb.z1 + INNER], 1]];
    for (const [p, q, s] of E) { if (D.houses) houseLine(linePts(p, q, 4), INNER, s); else line(linePts(p, q, 4), INNER, s, 0.2); }
    // a second row behind the first (back terraces and mews houses round courtyards), where the land is deep enough
    if (D.secondRow !== false) for (const r of roads) if (!r.closed) for (const s of [1, -1]) line(r.pts, r.w / 2 + 2.6 + D.secondAt, s, 0);
    // the starter safehouse (SPECIAL.safehouse) on a rebuilt cell: the house nearest the cell's middle, a family house
    // with a single garage first (a tier-3 home, as it always was: a double garage reads as tier 4), its address the
    // cell's as it always was
    const S0 = SPECIAL.safehouse, keptS = (D.keep || []).some(K => K.bx === S0.bx && K.bz === S0.bz);
    if (!keptS && superblockAt(S0.bx, S0.bz) === sb) {
      const cb = this.block(S0.bx, S0.bz), mx = (cb.x0 + cb.x1) / 2, mz = (cb.z0 + cb.z1) / 2, pref = x => x.garage === 'single' ? 0 : x.garage === 'double' ? 1 : 2;
      const h = placed.filter(q => q.house && q.house.type !== 'apartment').map(q => q.house).sort((a2, c2) => pref(a2) - pref(c2) || Math.hypot(a2.door.x - mx, a2.door.z - mz) - Math.hypot(c2.door.x - mx, c2.door.z - mz))[0];
      if (h) { h.reserved = 'linden'; const bay = h.bays[0]; cb.safehouse = { x: h.door.x, z: h.door.z, h: h.door.h, home: h, garage: bay ? { x: bay.x + Math.sin(bay.h) * -4.2, z: bay.z + Math.cos(bay.h) * -4.2, h: bay.h + Math.PI } : { x: h.door.x, z: h.door.z, h: 0 } }; }
    }
    if (D.extras) D.extras(this, b, sb, rng, { roads, placed, free, build, line });
    // ---- behind the frontage: gardens and yards (trees, bushes, a shed), never in a street, a building or a square
    // (nor in a house's drive or its mouth across the pavement: 120 records each drive on its block)
    const drives = sb.members.flatMap(m2 => m2.drives || []), onDrive = (x, z, m) => drives.some(d => x > d.x0 - m && x < d.x1 + m && z > d.z0 - m && z < d.z1 + m);
    const open = (x, z, m) => !onDrive(x, z, m + 1.5) && !lanes.some(L => x > L[0] - m && x < L[2] + m && z > L[1] - m && z < L[3] + m) && roads.every(r => polyDist(x, z, r.pts) > r.w / 2 + m) && circles.every(c => Math.hypot(x - c.x, z - c.z) > c.r + m) && !squares.some(Q => Math.hypot(x - Q.x, z - Q.z) <= Q.r + 1) && !kept.some(G => x > G.x0 && x < G.x1 && z > G.z0 && z < G.z1) && !placed.some(q => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m);
    for (let x = sb.x0 + 3; x < sb.x1 - 3; x += 6) for (let z = sb.z0 + 3; z < sb.z1 - 3; z += 6) {
      const jx = x + rng.range(-1.8, 1.8), jz = z + rng.range(-1.8, 1.8);
      if (!open(jx, jz, 2.4)) continue;
      if (rng.chance(0.08) && open(jx, jz, 4.5)) { const r = this._bld(b, jx - 1.8, jz - 1.5, jx + 1.8, jz + 1.5, 2.6, STYLE.HOUSE, rng.pick(PAL.house), 2.6, 3, { exactH: true }); placed.push(r); continue; }
      if (rng.chance(0.55)) this._prop(b, rng.chance(0.6) ? 'tree' : 'bush', jx, jz, rng.range(0, 6), rng.range(0.8, 1.2));
    }
    // ---- the streets' own furniture: the city's street lamps on both pavements, staggered about as close as the
    // lattice's (three a side every 80 m), each leaning over the carriageway with a pool of light under its head at
    // night (178: the ground shader only lights the lattice's); benches and news boxes at the back of the high streets'
    // pavements (and the other shopping streets', where the district has them), facing the street; cars at the kerbs
    const LSTEP = 26, lamps = [];
    const onPave = (x, z, m) => x >= sb.x0 && x <= sb.x1 && z >= sb.z0 && z <= sb.z1 && this._roadDist(x, z) >= 0.5 && !onDrive(x, z, 1.2)
      && !inKept(x - m, z - m, x + m, z + m) && !inSquare(x - m, z - m, x + m, z + m, 0.5)
      && !placed.some(q => x > q.x0 - m && x < q.x1 + m && z > q.z0 - m && z < q.z1 + m)
      && !doorways.some(q => x > q[0] - m && x < q[2] + m && z > q[1] - m && z < q[3] + m);
    const along = (r, step, phase, fn) => {
      const pts = r.pts; let acc = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], c = pts[k + 1], l = Math.hypot(c[0] - p[0], c[1] - p[1]); if (l < 0.01) continue;
        const tx = (c[0] - p[0]) / l, tz = (c[1] - p[1]) / l;
        for (const side of [1, -1]) for (let s = ((phase + (side > 0 ? 0 : step / 2) - acc) % step + step) % step; s < l; s += step) fn(p[0] + tx * s, p[1] + tz * s, -tz * side, tx * side);
        acc += l;
      }
    };
    for (const r of roads) {
      if (r.closed) continue;
      along(r, LSTEP, 8, (cx, cz, nx, nz) => {
        const x = cx + nx * (r.w / 2 + 1.1), z = cz + nz * (r.w / 2 + 1.1);
        if (!onPave(x, z, 0.5) || lamps.some(q => Math.hypot(q[0] - x, q[1] - z) < LSTEP * 0.45)) return;
        lamps.push([x, z]);
        // (the lamp's arm, local +z, toward the street; its head 1.5 m out, over the kerb lane)
        this._prop(b, 'lamp', x, z, Math.atan2(-nx, -nz));
        (this.lampPools = this.lampPools || []).push({ x: x - nx * 1.5, z: z - nz * 1.5 });
      });
      const SW = D.sidewalks || {};
      if (r.res || !(r.high || SW.benches)) continue;
      along(r, r.high ? 40 : 72, 20, (cx, cz, nx, nz) => {
        const x = cx + nx * (r.w / 2 + 2.0), z = cz + nz * (r.w / 2 + 2.0), ry = Math.atan2(-nx, -nz);
        if (!onPave(x, z, 1.2) || lamps.some(q => Math.hypot(q[0] - x, q[1] - z) < 2.5)) return;
        if (rng.chance(SW.news ? 0.25 : 0)) { this._prop(b, 'newsbox', x, z, ry); return; }
        this._prop(b, 'bench', x, z, ry); b.seats.push({ x, z, ry });
      });
    }
    for (const r of roads) if (!r.closed) this._kerbCars(b, rng, r, roads);
    // each cell's street pattern now (what the suburb generator tags its blocks with, 120): a cul-de-sac round its
    // circle, low-rise flats, a curving residential street, a plain one, or a terrace street
    for (const m of sb.members) {
      if (m.kept || m.roadKind) continue;
      const inM = (x, z) => x >= m.bx * P && x < (m.bx + 1) * P && z >= m.bz * P && z < (m.bz + 1) * P;
      const homesHere = this.homes.filter(h => inM((h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2));
      if (lines.some(L => L.ring && inM(L.ring.x, L.ring.z))) m.roadKind = 'culdesac';
      else if (homesHere.some(h => h.type === 'apartment')) m.roadKind = 'lowrise';
      else if (homesHere.length) m.roadKind = roads.some(r => r.res && r.pts.some(q => inM(q[0], q[1])) && polyTurn(r.pts) > 0.6) ? 'crescent' : 'street';
      else m.roadKind = 'terrace';
    }
    for (const s of D.secrets || []) b.secrets.push({ x: s[0], z: s[1] });
    for (const Q of squares) if (Q.name) this.mapPlaces.push({ id: Q.id || sb.id, name: Q.name, cat: 'landmark', icon: Q.icon || '⛲', x: Q.x, z: Q.z, sub: Q.sub || '' });
    sb.name = D.name;
  }
});
