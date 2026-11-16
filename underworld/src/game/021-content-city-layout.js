/* =====================================================================
   [CONTENT] CITY LAYOUT (CITY_SPREAD.md)
   Which city block stands where on the island.
   The city was authored as a 12 x 12 lattice (020: DISTRICT_MAP, ZONE_MAP,
   SUPERBLOCKS, the turfs, every place and mission). That lattice stays the
   city's ADDRESS system: a block is "the block at lattice cell (3, 5)" for
   good. Where a block STANDS is this file's business. The lattice is cut
   into precincts (rectangles of whole cells) and each precinct stands on
   the island at its own offset, a whole number of cells, so the island
   keeps one 80 m grid and the arithmetic done on world points (the nearest
   street line, a lane's offset, a kerb, a lamp) holds everywhere unchanged.
   Two spaces, then:
     lattice (L): cell (lx, lz) in 0..N-1: what the tables and the block
                  generators speak;
     world (W):   metres on the island: what the simulation, the physics,
                  the renderer and the saves speak. A world cell is
                  (I, J) = (floor(x / P), floor(z / P)).
   A precinct's FRAME is its cells, the streets round them and the strip
   outside those streets (EDGE_MARGIN): the part of the world that is "in
   the city" because of that precinct. A lattice street that two parted
   precincts shared is built once for each of them (their own edge street).
   The 'classic' layout is the city as it was built: one precinct, all 144
   cells, offset 0, where lattice and world are the same numbers.
   Rules a layout must keep (check() refuses one that does not, at boot):
   every cell in exactly one precinct; cuts on even lines only, so a 2 x 2
   turf moves whole; a superblock inside one precinct; precincts that stand
   at different offsets at least one empty cell apart (their frames must
   not touch); precincts at the same offset may abut (they are neighbours
   on the lattice and share their street as they always did).
   ===================================================================== */
const CITY_LAYOUTS = {
  classic: [{ id: 'city', lx0: 0, lz0: 0, lx1: N - 1, lz1: N - 1, ox: 0, oz: 0 }],
  // never shipped as the default: the whole city moved three cells west and two north, so a coordinate the bake
  // (090) misses, or a question still asked of the square, shows up (CITY_SPREAD.md S3). ?layout=tracer
  tracer: [{ id: 'city', lx0: 0, lz0: 0, lx1: N - 1, lz1: N - 1, ox: -3, oz: -2 }],
  // never shipped either: the city cut in two, the west half three cells further west, the halves joined by one
  // connector road (CITY_CONNECTORS), so routing, traffic and the edges between parted precincts are exercised (S4)
  tracer2: [{ id: 'west', lx0: 0, lz0: 0, lx1: 5, lz1: N - 1, ox: -3, oz: 0 }, { id: 'east', lx0: 6, lz0: 0, lx1: N - 1, lz1: N - 1, ox: 0, oz: 0 }],
  // the city round Valen Bay (CITY_SPREAD.md §3, §9): the core, the west of the Old Quarter, Linden Hills with the
  // farm, and the port (the Industrial Belt, the Docklands and the Container Terminal, whose quay faces east and so
  // stays on Valen Sound: a precinct never turns) stay on the island's waist; Crestmoor Heights stands on the bay's
  // north shore, the Nightlife Strip, the Stadium and the Warehouse District on its south shore
  island: [
    { id: 'core', lx0: 2, lz0: 0, lx1: 9, lz1: 7, ox: 0, oz: 0 },
    { id: 'oldquarter', lx0: 0, lz0: 4, lx1: 1, lz1: 7, ox: 0, oz: 0 },
    { id: 'linden', lx0: 0, lz0: 8, lx1: 3, lz1: 11, ox: 0, oz: 0 },
    { id: 'heights', lx0: 0, lz0: 0, lx1: 1, lz1: 3, ox: -8, oz: -6 },
    { id: 'strip', lx0: 4, lz0: 8, lx1: 9, lz1: 11, ox: -12, oz: 4 },
    { id: 'port', lx0: 10, lz0: 0, lx1: 11, lz1: 11, ox: 0, oz: 0 }
  ]
};
// the roads that join a layout's precincts: island roads (022's format, in world metres) whose 'lat' ends meet two
// precincts' edge streets side-on
const CITY_CONNECTORS = {
  tracer2: [{ id: 'c1', name: 'Tracer Link', w: 11, grade: 0.07, ends: ['lat', 'lat'], pts: [[240, 440], [300, 441], [420, 441], [480, 440]] }],
  island: [
    // the Strip's east street to the Southshore Highway
    { id: 'cS', name: 'Strip Road', w: 10, grade: 0.07, ends: ['lat', 's1'], pts: [[-154, 1160], [-128, 1156], [-100, 1150]] }
  ]
};
const CityLayout = {
  id: '', precincts: [], own: new Int8Array(N * N).fill(-1), sites: new Map(),
  // the world rectangle round every precinct's cells (a quick "nowhere near the city")
  x0: 0, z0: 0, x1: 0, z1: 0,
  key(I, J) { return (I + 512) * 1024 + (J + 512); },
  // why a precinct list cannot be a layout (null when it can)
  check(list) {
    const seen = new Int8Array(N * N).fill(-1), int = v => Number.isInteger(v);
    for (const p of list) {
      if (![p.lx0, p.lz0, p.lx1, p.lz1, p.ox, p.oz].every(int)) return `precinct ${p.id}: cells and offsets are whole numbers`;
      if (p.lx0 < 0 || p.lz0 < 0 || p.lx1 >= N || p.lz1 >= N || p.lx0 > p.lx1 || p.lz0 > p.lz1) return `precinct ${p.id}: outside the lattice`;
      if (p.lx0 % 2 || p.lz0 % 2 || !(p.lx1 % 2) || !(p.lz1 % 2)) return `precinct ${p.id}: cut on an odd line (a turf is 2 x 2 cells and moves whole)`;
      if (Math.abs(p.lx0 + p.ox) > 400 || Math.abs(p.lz0 + p.oz) > 400 || Math.abs(p.lx1 + p.ox) > 400 || Math.abs(p.lz1 + p.oz) > 400) return `precinct ${p.id}: off the map`;
      for (let lz = p.lz0; lz <= p.lz1; lz++) for (let lx = p.lx0; lx <= p.lx1; lx++) { const o = lz * N + lx; if (seen[o] >= 0) return `cell ${lx},${lz} is in precincts ${list[seen[o]].id} and ${p.id}`; seen[o] = p.k; }
    }
    for (let o = 0; o < N * N; o++) if (seen[o] < 0) return `cell ${o % N},${Math.floor(o / N)} is in no precinct`;
    for (const sb of SUPERBLOCKS) { const k = seen[sb.bz0 * N + sb.bx0]; for (let lz = sb.bz0; lz <= sb.bz1; lz++) for (let lx = sb.bx0; lx <= sb.bx1; lx++) if (seen[lz * N + lx] !== k) return `superblock ${sb.id} is cut by a precinct line`; }
    // world cells: I0..I1, J0..J1 inclusive
    const W = p => [p.lx0 + p.ox, p.lz0 + p.oz, p.lx1 + p.ox, p.lz1 + p.oz];
    for (const a of list) for (const b of list) {
      if (a.k >= b.k) continue;
      const A = W(a), B = W(b), g = a.ox === b.ox && a.oz === b.oz ? 0 : 1;
      if (A[0] - g <= B[2] && A[2] + g >= B[0] && A[1] - g <= B[3] && A[3] + g >= B[1]) return g ? `precincts ${a.id} and ${b.id} stand at different offsets less than one cell apart` : `precincts ${a.id} and ${b.id} overlap`;
    }
    return null;
  },
  // make a layout the city's: one of CITY_LAYOUTS by name, or a table of its own (the layout suite's)
  use(id, table) {
    const T = table || CITY_LAYOUTS[id]; if (!T) throw new Error('CityLayout: no layout "' + id + '"');
    const list = T.map((p, k) => ({ ...p, k, x0: (p.lx0 + p.ox) * P, z0: (p.lz0 + p.oz) * P, x1: (p.lx1 + 1 + p.ox) * P, z1: (p.lz1 + 1 + p.oz) * P }));
    const err = this.check(list); if (err) throw new Error('CityLayout "' + id + '": ' + err);
    this.id = id; this.table = T; this.precincts = list; this.own.fill(-1); this.sites.clear();
    this.x0 = this.z0 = Infinity; this.x1 = this.z1 = -Infinity;
    for (const p of list) {
      for (let lz = p.lz0; lz <= p.lz1; lz++) for (let lx = p.lx0; lx <= p.lx1; lx++) { this.own[lz * N + lx] = p.k; this.sites.set(this.key(lx + p.ox, lz + p.oz), lz * N + lx); }
      this.x0 = Math.min(this.x0, p.x0); this.z0 = Math.min(this.z0, p.z0); this.x1 = Math.max(this.x1, p.x1); this.z1 = Math.max(this.z1, p.z1);
    }
    RoadNet.layout();
    return this;
  },
  // ---------------------------------------------------------------- world -> city
  // the precinct whose frame holds a world point, or null off the city. m: how far outside the edge streets'
  // centre lines still counts (EDGE_MARGIN: the whole frame; ROAD_HALF: the carriageway only)
  at(x, z, m = EDGE_MARGIN) {
    if (x < this.x0 - m || z < this.z0 - m || x > this.x1 + m || z > this.z1 + m) return null;
    const I = Math.floor(x / P), J = Math.floor(z / P), s = this.sites.get(this.key(I, J));
    return s !== undefined ? this.precincts[this.own[s]] : this._nearest(x, z, I, J, m);
  },
  // the precinct nearest a world point, wherever the point is (a turf, a search area, a spawn clamped to the city)
  near(x, z) {
    const I = Math.floor(x / P), J = Math.floor(z / P), s = this.sites.get(this.key(I, J));
    return s !== undefined ? this.precincts[this.own[s]] : this._nearest(x, z, I, J, Infinity);
  },
  // outside every cell (the outer half of an edge street, the strip beyond it, or further): the precinct whose
  // cells are nearest, among those within m of the point. Two that abut at one offset both reach a point by their
  // seam: the one whose own rows and columns it lies in wins
  _nearest(x, z, I, J, m) {
    let best = null, bd = Infinity;
    for (const p of this.precincts) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
      if (dx > m || dz > m) continue;
      const d = (dx * dx + dz * dz) * 4 + (I - p.ox < p.lx0 || I - p.ox > p.lx1 ? 1 : 0) + (J - p.oz < p.lz0 || J - p.oz > p.lz1 ? 1 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  },
  inCity(x, z, m = EDGE_MARGIN) { return this.at(x, z, m) !== null; },
  // the lattice cell (lz * N + lx) of the city block a world point stands in, or -1 (a street's half belongs to
  // the cell beside it, as it always did; the strip outside the edge streets is in no cell)
  cellAt(x, z) { const s = this.sites.get(this.key(Math.floor(x / P), Math.floor(z / P))); return s === undefined ? -1 : s; },
  // the lattice cell of a world cell, or -1 where no city block stands
  cell(I, J) { const s = this.sites.get(this.key(I, J)); return s === undefined ? -1 : s; },
  // inside precinct p's frame: the lattice column and row nearest a world point (the frame's outer strip belongs
  // to the edge cells), and world metres as lattice metres
  lx(p, x) { return clamp(Math.floor(x / P) - p.ox, p.lx0, p.lx1); },
  lz(p, z) { return clamp(Math.floor(z / P) - p.oz, p.lz0, p.lz1); },
  latX(p, x) { return x - p.ox * P; },
  latZ(p, z) { return z - p.oz * P; },
  // the precinct whose streets cross at world node (I, J) (the crossing of street lines x = I * P and z = J * P)
  nodeAt(I, J) { for (const p of this.precincts) { const i = I - p.ox, j = J - p.oz; if (i >= p.lx0 && i <= p.lx1 + 1 && j >= p.lz0 && j <= p.lz1 + 1) return p; } return null; },
  // ---------------------------------------------------------------- city -> world
  // (a lattice cell or node just outside the lattice, as a node on its far edge or a neighbour asked for, takes the
  // offset of the edge cell beside it)
  precinctOf(lx, lz) { return this.precincts[this.own[clamp(lz, 0, N - 1) * N + clamp(lx, 0, N - 1)]]; },
  siteI(lx, lz) { return lx + this.precinctOf(lx, lz).ox; },
  siteJ(lx, lz) { return lz + this.precinctOf(lx, lz).oz; },
  // lattice metres -> world metres (a point of a block authored in the lattice: its cell's precinct moves it)
  wx(x, z) { return x + this.precinctOf(Math.floor(x / P), Math.floor(z / P)).ox * P; },
  wz(x, z) { return z + this.precinctOf(Math.floor(x / P), Math.floor(z / P)).oz * P; },
  // a point authored in the lattice at a precinct's edge (an island road's end meeting its edge street, within m of
  // its cells): where it stands once the precinct has moved; any other point is returned as it is
  anchor(x, z, m = 60) {
    let best = null, bd = Infinity;
    for (const p of this.precincts) {
      const dx = Math.max(p.lx0 * P - x, 0, x - (p.lx1 + 1) * P), dz = Math.max(p.lz0 * P - z, 0, z - (p.lz1 + 1) * P), d = Math.max(dx, dz);
      if (d <= m && d < bd) { bd = d; best = p; }
    }
    return best ? [x + best.ox * P, z + best.oz * P] : [x, z];
  },
  // the middle of town: where the lattice's centre stands (a fallback spot, the direction "away from the city")
  cx() { return this.wx(CITY / 2, CITY / 2); },
  cz() { return this.wz(CITY / 2, CITY / 2); },
  // the lattice cell (lz * N + lx) a world point belongs to: the block it stands in, or off every block the nearest
  // precinct's edge cell (the old clamp of floor(x / P) to 0..N - 1)
  cellNear(x, z) { const c = this.cellAt(x, z); if (c >= 0) return c; const p = this.near(x, z); return this.lz(p, z) * N + this.lx(p, x); },
  // a world point kept inside the frame of the precinct nearest it, m inside the frame's edge
  frameX(p, x, m = 0) { return clamp(x, p.x0 - EDGE_MARGIN + m, p.x1 + EDGE_MARGIN - m); },
  frameZ(p, z, m = 0) { return clamp(z, p.z0 - EDGE_MARGIN + m, p.z1 + EDGE_MARGIN - m); },
  worldX(p, x) { return x + p.ox * P; },
  worldZ(p, z) { return z + p.oz * P; },
  // the layout in use, to come back to (the world generator builds the city in the lattice, then bakes it, 090)
  current() { return { id: this.id, table: this.table }; },
  restore(c) { return this.use(c.id, c.table); },
  // the layout in plain data (the world fingerprint, the save's stamp)
  describe() { return { id: this.id, precincts: this.precincts.map(p => [p.id, p.lx0, p.lz0, p.lx1, p.lz1, p.ox, p.oz]) }; }
};
// the layout the city is built to: 'classic' unless the page asks for another by name (?layout=…, the tests' tracers)
CityLayout.use((() => { try { const m = /[?&]layout=([a-z0-9_]+)/i.exec(location.search); return m && CITY_LAYOUTS[m[1]] ? m[1] : 'classic'; } catch { return 'classic'; } })());
