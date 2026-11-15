/* =====================================================================
   [CONTENT] VALEN ISLAND: GENERATION (Operation Blackgate)
   What stands on the island off the lattice (022 is the ground itself):
   - the road network as curved links (the Coast Highway round the
     highlands, Mount Valen Road to the summit, the Southshore Highway and
     Longshore Drive round the lowlands, the Blackgate Bridge across the
     mouth of Valen Bay), so the GPS, traffic, taxis and police all use it;
   - Port Valen International: two runways, a parallel taxiway and its
     links, the apron, the terminal with two piers, the control tower,
     three hangars, the helipads, a car park, the airport fire station;
   - the Valen Proving Ground: a kilometre strip, a skid pad, a slalom lot;
   - Crestmoor Ridge's mansions, Saltmarsh on the bay, Gull Harbor, the
     lighthouse, the Mount Valen observatory, Fire Station No. 1;
   - colliders: the bridge's rails, the tunnel's walls;
   - the fleet: where the island's own vehicles stand (race cars in the
     Valen Point pits and paddock, aircraft at the airport, helicopters on
     the hospital's and the police station's roofs, fire engines,
     ambulances, the cars of each settlement). IslandFleet (245) spawns
     them as you come near, like the city's parked cars.
   District geometry lives in extra blocks (world.xblocks), streamed like
   Valen Point's.
   ===================================================================== */
// Crestmoor Ridge: [x, z, the side the forecourt faces] along Mount Valen Road's first leg
const ISLE_MANSIONS = [[-150, -518, 'e'], [-58, -452, 'w'], [30, -628, 's'], [50, -536, 'n'], [232, -644, 's'], [238, -550, 'n'], [395, -646, 's'], [392, -551, 'n']];
// Saltmarsh: houses either side of the bay road (x, side: -1 the bay side, 1 the landward side)
const ISLE_SALTMARSH = [-322, -392, -462, -532, -602, -672];
const ISLE_GULL = [[-1389, -2230], [-1328, -2271], [-1266, -2311], [-1205, -2352], [-1304, -2191], [-1202, -2259]];
const ISLE_FIRE = { x0: 140, z0: -158, x1: 216, z1: -96 };
const ISLE_LIGHT = { x0: 1486, z0: -2812, x1: 1548, z1: -2758, y: 5 };
const ISLE_SUMMIT = { x0: 342, z0: -1868, x1: 438, z1: -1778, y: 246 };
const ISLE_JETTY = { x0: -468, z0: 898, x1: -452, z1: 992, y: 1.1 };
Object.assign(World.prototype, {
  _isleBlock(id, cx, cz, r, name) { const b = this._vpBlock(id, cx - P / 2, cz - P / 2, r, name || ISLE.name); b.t = 'S'; b.isle = true; this.isle.blocks.push(b); return b; },
  _genIsland() {
    Island.init();
    const isle = this.isle = { blocks: [], fleet: [], lifts: [], rails: [], sites: {} };
    const box = (b, x, y, z, sx, sy, sz, col, solid, ry = 0) => this._det(b, 'box', x, y, z, sx, sy, sz, typeof col === 'number' ? C(col) : col, ry, solid ? true : undefined);
    const cyl = (b, x, y, z, r, h, col, solid) => this._det(b, 'cyl', x, y, z, r, h, col, null, solid ? { x, z, r, y0: y - h / 2, y1: y + h / 2, kind: 'det' } : undefined);
    const fleet = (id, x, z, r, slots) => { const F = { id, x, z, r, slots }; isle.fleet.push(F); return F; };
    const sitePad = (x0, z0, x1, z1, blend = 28, y) => Island.addPad(x0, z0, x1, z1, y !== undefined ? y : Math.round(Island.nat((x0 + x1) / 2, (z0 + z1) / 2) * 10) / 10, blend);
    // ---------------------------------------------------------------- level sites (before the roads: a road's level comes from the ground it finds)
    const mans = ISLE_MANSIONS.map(([x, z, f]) => ({ x, z, f, P: sitePad(x - 25, z - 22, x + 25, z + 22) }));
    const salt = []; for (const x of ISLE_SALTMARSH) for (const s of [-1, 1]) { const rz = x > -520 ? 1192 - (-270 - x) * 0.08 : 1172 - (-520 - x) * 0.1615, z = rz + s * 33; salt.push({ x, z, s, P: sitePad(x - 11, z - 9, x + 11, z + 9, 16) }); }
    const gull = ISLE_GULL.map(([x, z]) => ({ x, z, P: sitePad(x - 10, z - 8, x + 10, z + 8, 16) }));
    const fireP = sitePad(ISLE_FIRE.x0, ISLE_FIRE.z0, ISLE_FIRE.x1, ISLE_FIRE.z1, 30);
    Island.addPad(ISLE_LIGHT.x0, ISLE_LIGHT.z0, ISLE_LIGHT.x1, ISLE_LIGHT.z1, ISLE_LIGHT.y, 26);
    Island.addPad(ISLE_SUMMIT.x0, ISLE_SUMMIT.z0, ISLE_SUMMIT.x1, ISLE_SUMMIT.z1, ISLE_SUMMIT.y, 55);
    Island.addPad(ISLE_JETTY.x0, ISLE_JETTY.z0, ISLE_JETTY.x1, ISLE_JETTY.z1, ISLE_JETTY.y, 5);
    Island.corePads();
    // a shallow ditch either side of the old land bridge, so its embankment (027's own ground) stands proud of the fields
    Island.addPad(CFS.lb.x - CFS.lb.half - 1, CITY + EDGE_MARGIN, CFS.lb.x + CFS.lb.half + 1, CFS.z0, -0.45, 6);
    Island.buildRoads();
    // ---------------------------------------------------------------- the roads: curved links like the city's own
    for (const R of Island.roads) this.localRoads.push({ k: 'line', link: R.name, spur: !!R.ring, w: R.w, pts: R.pts, ring: R.ring, mat: 'asphalt', st: 'asphalt', isle: R });
    // promenade lamps that would stand in a road leaving the city
    this.promenade = this.promenade.filter(l => !Island.roads.some(R => R.ends.includes('lat') && [R.pts[0], R.pts[R.pts.length - 1]].some(e => Math.hypot(l.x - e[0], l.z - e[1]) < 13)));
    // ---------------------------------------------------------------- colliders: bridge rails, tunnel walls (posts 1.3 m apart)
    for (const R of Island.roads) {
      const spans = R.bridges.map(s => [s[0], s[1], 1]); if (R.tunnel) spans.push([R.tunnel[0], R.tunnel[1], 2]);
      for (const [k0, k1, kind] of spans) {
        const off = R.w / 2 + (kind === 2 ? 0.7 : 0.45);
        for (const side of [-1, 1]) {
          const line = [];
          for (let k = k0; k <= k1; k++) { const a = R.pts[Math.max(0, k - 1)], c = R.pts[Math.min(R.pts.length - 1, k + 1)], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; line.push([R.pts[k][0] + (c[1] - a[1]) / l * off * side, R.pts[k][1] - (c[0] - a[0]) / l * off * side, R.y[k]]); }
          isle.rails.push({ line, kind, road: R });
          for (let k = 0; k < line.length - 1; k++) {
            const a = line[k], c = line[k + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]), m = Math.max(1, Math.round(L / 1.3));
            for (let i = 0; i < m; i++) { const y = lerp(a[2], c[2], i / m); this.grid.add({ x: lerp(a[0], c[0], i / m), z: lerp(a[1], c[1], i / m), r: 0.45, y0: y - 1.2, y1: y + (kind === 2 ? 6 : 1.3), kind: 'det', barrier: true }); }
          }
        }
      }
    }
    // the Blackgate Bridge's two towers: legs outside the parapets (drawn by the scenery, solid to whatever flies into them)
    isle.towers = [];
    for (const R of Island.roads) for (const [k0, k1] of R.bridges) {
      if (R.cum[k1] - R.cum[k0] < 300) continue;
      for (const f of [0.27, 0.73]) {
        const k = Math.round(k0 + (k1 - k0) * f), p = R.pts[k], q = R.pts[k + 1], h = Math.atan2(q[0] - p[0], q[1] - p[1]), rx = Math.cos(h), rz = -Math.sin(h), deck = R.y[k], bed = Island.base0(p[0], p[1]) - 1, top = deck + 48;
        const legs = [-1, 1].map(s => ({ x: p[0] + rx * s * (R.w / 2 + 2.6), z: p[1] + rz * s * (R.w / 2 + 2.6) }));
        for (const L of legs) this.grid.add({ x: L.x, z: L.z, r: 2, y0: bed, y1: top, kind: 'det' });
        isle.towers.push({ road: R, k, x: p[0], z: p[1], h, deck, top, bed, legs });
      }
    }
    // ================================================================ PORT VALEN INTERNATIONAL
    const A = AIRPORT, Y = A.y, B = {};
    B.term = this._isleBlock('ap_term', 600, 1915, 170, A.name);
    B.east = this._isleBlock('ap_hangars', 1090, 1930, 190, A.name + ' hangars');
    B.west = this._isleBlock('ap_west', 330, 1940, 170, A.name + ' heliport');
    // the terminal: a glass hall with two piers out onto the apron, a canopy over the forecourt
    this._bld(B.term, 500, 1890, 700, 1932, 14, STYLE.GLASS, 0x4a6274, 4.6, 5, { exactH: true, y0: Y, oy: Y });
    for (const px of [532, 668]) {
      this._bld(B.term, px - 12, 1932, px + 12, 1976, 8, STYLE.GLASS, 0x55707f, 4, 4, { exactH: true, y0: Y, oy: Y });
      // the jet bridge and a parked airliner nosed in at the pier's end
      box(B.term, px + 16, Y + 4.4, 1968, 9, 2.6, 3, 0xd8dade, false);
      this._airliner(B.term, px + 23, Y, 2004, px < 600 ? 0x1c3f94 : 0xc8102e);
    }
    box(B.term, 600, Y + 6.2, 1883, 150, 0.5, 13, 0xe8eaed, false);
    for (let x = 530; x <= 670; x += 28) cyl(B.term, x, Y + 3.1, 1878, 0.35, 6.2, 0x8c949c, true);
    B.term.signs.push({ text: 'PORT VALEN INTERNATIONAL', x: 600, y: Y + 11.6, z: 1889.9, ry: Math.PI, w: 46, h: 2.6, bg: '#12202c', fg: '#ffffff' });
    B.term.signs.push({ text: 'DEPARTURES · ARRIVALS', x: 600, y: Y + 4.6, z: 1876.4, ry: Math.PI, w: 20, h: 1.1, bg: '#1c3f94', fg: '#ffffff' });
    B.term.place = { id: 'airport', name: A.name, kind: 'landmark', door: { x: 600, z: 1888.6, h: Math.PI }, under: { x: 600, z: 1911 } };
    // the control tower: a shaft, a glass cab, a roof, the mast and its beacon
    this._bld(B.term, 752, 1898, 766, 1912, 34, STYLE.IND, 0xcfd3d6, 3.4, 3.5, { exactH: true, y0: Y, oy: Y });
    this._bld(B.term, 748, 1894, 770, 1916, 5.2, STYLE.GLASS, 0x2c3a48, 5.2, 3.6, { exactH: true, y0: Y + 34, oy: Y + 34 });
    box(B.term, 759, Y + 39.5, 1905, 25, 0.6, 25, 0xe8eaed, false); cyl(B.term, 759, Y + 43.5, 1905, 0.25, 8, 0x8c949c, false);
    B.term.fx.push({ type: 'beacon', x: 759, y: Y + 47.8, z: 1905 });
    B.term.signs.push({ text: 'TOWER', x: 759, y: Y + 30, z: 1897.9, ry: Math.PI, w: 9, h: 1.8, bg: '#12202c', fg: '#ffd84d' });
    // the airport fire station beside the tower
    this._bld(B.term, 790, 1894, 826, 1914, 7, STYLE.BRICK, 0xa63a2e, 3.5, 4, { exactH: true, y0: Y, oy: Y });
    B.term.signs.push({ text: 'AIRPORT FIRE & RESCUE', x: 808, y: Y + 5.6, z: 1914.1, ry: 0, w: 16, h: 1.2, bg: '#a01818', fg: '#ffffff' });
    for (const dx of [-9, 0, 9]) box(B.term, 808 + dx, Y + 2.1, 1914.08, 6.4, 4.2, 0.12, 0x2a2e33, false);
    // the car park and the taxi rank north-west of the terminal
    isle.sites.carpark = { x0: 300, z0: 1848, x1: 478, z1: 1922 };
    const lot = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 11; k++) if (hash2i(k, r, 811) < 0.62) lot.push({ x: 312 + k * 15, z: 1862 + r * 22, h: r % 2 ? Math.PI : 0 });
    fleet('ap_lot', 390, 1885, 260, lot);
    fleet('ap_rank', 600, 1872, 240, [{ x: 571, z: 1879.5, h: Math.PI / 2, cls: 'taxi' }, { x: 578, z: 1879.5, h: Math.PI / 2, cls: 'taxi' }, { x: 585, z: 1879.5, h: Math.PI / 2, cls: 'taxi' }, { x: 808, z: 1921, h: 0, cls: 'firetruck' }, { x: 817, z: 1921, h: 0, cls: 'ambulance' }]);
    for (let x = 300; x <= 478; x += 44.5) for (const z of [1850, 1920]) { cyl(B.west, x, Y + 4.5, z, 0.14, 9, 0x6a7078, true); B.west.fx.push({ type: 'flood', x, y: Y + 9, z, ry: z < 1900 ? 0 : Math.PI }); }
    // three hangars open to the apron: walls and a roof up close (you can taxi in), one box from afar
    isle.sites.hangars = [];
    for (let k = 0; k < 3; k++) {
      const x0 = 1000 + k * 56, x1 = x0 + 46, z0 = 1880, z1 = 1922, cx = (x0 + x1) / 2, col = [0xb8bec4, 0x9aa7b4, 0xc4b8a4][k];
      box(B.east, cx, Y + 6.5, z0 + 0.3, 46, 13, 0.6, col, true); box(B.east, x0 + 0.3, Y + 6.5, (z0 + z1) / 2, 0.6, 13, 42, col, true); box(B.east, x1 - 0.3, Y + 6.5, (z0 + z1) / 2, 0.6, 13, 42, col, true);
      box(B.east, cx, Y + 13.3, (z0 + z1) / 2, 47, 0.6, 43, 0x6f7a80, true); box(B.east, cx, Y + 11.4, z1 - 0.2, 46, 3.2, 0.4, col, false);
      const far = this._bld(B.east, x0, z0, x1, z1, 13.6, STYLE.WARE, col, 13.6, 46, { exactH: true, y0: Y, oy: Y, noCol: true }); far.farOnly = true;
      B.east.signs.push({ text: 'HANGAR ' + (k + 1), x: cx, y: Y + 11.4, z: z1 + 0.05, ry: 0, w: 12, h: 1.8, bg: '#1d2126', fg: '#ffffff' });
      B.east.fx.push({ type: 'flood', x: cx, y: Y + 12.6, z: z1 + 0.6, ry: 0 });
      isle.sites.hangars.push({ x0, z0, x1, z1 });
    }
    // fuel bowsers and baggage carts on the apron (static), the windsock
    for (const [x, z] of [[910, 1962], [930, 1962]]) { box(B.east, x, Y + 1.5, z, 2.6, 2.4, 8, 0xe8eaed, true); box(B.east, x, Y + 1.2, z + 5.2, 2.4, 2.2, 2.2, 0xd8a227, true); }
    for (let k = 0; k < 5; k++) box(B.term, 596 + k * 3.4, Y + 0.7, 1962, 2.6, 1.1, 1.6, [0x2a6fd6, 0xd8a227][k % 2], true);
    cyl(B.west, 250, Y + 3.5, 2060, 0.12, 7, 0x8c949c, true); box(B.west, 251.6, Y + 6.6, 2060, 3, 0.7, 0.7, 0xff7a1a, false);
    // the heliport: two pads with their lights
    isle.sites.helipads = [{ x: 290, z: 1995 }, { x: 352, z: 1995 }];
    for (const h of isle.sites.helipads) B.west.fx.push({ type: 'helipad', x: h.x, y: Y + 0.12, z: h.z });
    // aircraft: two on the general-aviation stands, one in hangar 3, a helicopter on each pad
    fleet('ap_air', 760, 1990, 900, [{ x: 1023, z: 1968, h: 0, cls: 'skylark' }, { x: 1079, z: 1968, h: 0, cls: 'skylark' }, { x: 1135, z: 1903, h: 0, cls: 'skylark' },
      { x: 290, z: 1995, h: 0, cls: 'heli' }, { x: 352, z: 1995, h: 0, cls: 'heli' }, { x: 960, z: 1975, h: Math.PI / 2, cls: 'truck' }]);
    // runway edge lights (white), the taxiway's (blue), threshold bars (green / red)
    const lights = (x0, x1, z, w, c, step) => { for (let x = x0; x <= x1; x += step) for (const s of [-1, 1]) { const bk = this._isleLightBlock(x, z, A); bk.fx.push({ type: 'neon', x, y: Y + 0.22, z: z + s * (w / 2 + 1.2), w: 0.5, h: 0.3, d: 0.5, c }); } };
    for (const r of A.rw) { lights(r.x0, r.x1, r.z, r.w, 0xfff4d6, 55); for (let q = -3; q <= 3; q++) { this._isleLightBlock(r.x0, r.z, A).fx.push({ type: 'neon', x: r.x0 - 2, y: Y + 0.22, z: r.z + q * r.w / 7, w: 0.5, h: 0.3, d: 0.8, c: 0x40ff70 }); this._isleLightBlock(r.x1, r.z, A).fx.push({ type: 'neon', x: r.x1 + 2, y: Y + 0.22, z: r.z + q * r.w / 7, w: 0.5, h: 0.3, d: 0.8, c: 0xff3030 }); } }
    lights(A.tw.x0, A.tw.x1, A.tw.z, A.tw.w, 0x4080ff, 70);
    // ================================================================ THE PROVING GROUND
    const G = PROVING, GY = G.y, bg = this._isleBlock('proving', 1200, 1560, 330, G.name), bg2 = this._isleBlock('proving_e', 1760, 1590, 300, G.name);
    this._bld(bg, 1150, 1494, 1176, 1506, 4.6, STYLE.IND, 0xd8dade, 4.6, 4, { exactH: true, y0: GY, oy: GY });
    bg.signs.push({ text: 'VALEN PROVING GROUND', x: 1163, y: GY + 3.6, z: 1493.9, ry: Math.PI, w: 18, h: 1.3, bg: '#14181c', fg: '#ff6b4a' });
    bg.place = { id: 'proving', name: G.name, kind: 'landmark', door: { x: 1163, z: 1492.6, h: Math.PI }, under: { x: 1163, z: 1500 } };
    // gantries over the strip at the start and the kilometre, a board every 250 m
    const S = G.strip;
    for (const [gx, txt, bk] of [[S.x0 + 20, 'START', bg], [S.x0 + 1020, '1000 m', bg2]]) {
      for (const s of [-1, 1]) box(bk, gx, GY + 3.5, S.z + s * (S.w / 2 + 1), 0.6, 7, 0.6, 0x2a2e33, true);
      box(bk, gx, GY + 7.3, S.z, 1, 1.2, S.w + 3, 0x1d2126, false);
      bk.signs.push({ text: txt, x: gx - 0.52, y: GY + 7.3, z: S.z, ry: -Math.PI / 2, w: 10, h: 1.0, bg: '#1d2126', fg: '#ffffff' });
    }
    for (let m = 250; m <= 750; m += 250) { const bk = m < 600 ? bg : bg2, x = S.x0 + 20 + m; box(bk, x, GY + 1.1, S.z - S.w / 2 - 2.2, 0.3, 2.2, 0.3, 0x8c949c, true); bk.signs.push({ text: m + ' m', x, y: GY + 2.4, z: S.z - S.w / 2 - 2.2, ry: -Math.PI / 2, w: 4, h: 1.0, bg: '#f2c230', fg: '#14181c' }); }
    // tyre stacks round the skid pad, cones down the slalom
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; cyl(bg, G.pad.x + Math.cos(a) * (G.pad.r + 3), GY + 0.45, G.pad.z + Math.sin(a) * (G.pad.r + 3), 0.42, 0.9, k % 2 ? 0x1c1c1e : 0xc8102e, true); }
    for (let k = 0; k < 14; k++) cyl(bg2, G.lot.x0 + 60 + k * 36, GY + 0.35, G.lot.z0 + 50 + (k % 2 ? 9 : -9), 0.22, 0.7, 0xff7a1a, false);
    fleet('proving', 950, 1530, 320, [{ x: S.x0 + 6, z: S.z - 6.5, h: Math.PI / 2, cls: 'gt3' }, { x: S.x0 + 6, z: S.z - 2.2, h: Math.PI / 2, cls: 'drift' }, { x: S.x0 + 6, z: S.z + 2.2, h: Math.PI / 2, cls: 'rally' }, { x: S.x0 + 6, z: S.z + 6.5, h: Math.PI / 2, cls: 'cup' },
      { x: 1186, z: 1500, h: 0, cls: 'lmp' }, { x: 1192, z: 1500, h: 0, cls: 'formula' }]);
    // ================================================================ VALEN POINT: the island's race cars
    // pit boxes on the lane in front of the garages, a row in the paddock (the 24 garage bays stay the owner's)
    {
      const pit = [], cars = ['gt3', 'formula', 'lmp', 'cup', 'gt3', 'rally'];
      for (let i = 0; i < 6; i++) pit.push({ x: VP_PIT.garX[1] + 3.3, z: VP_PIT.garZ[0] + VP_PIT.cell * (i * 2 + 0.5), h: Math.PI, cls: cars[i] });
      fleet('vp_pits', 1570, 570, 330, pit);
      fleet('vp_paddock', 1523, 520, 330, [{ x: 1524, z: 468, h: Math.PI, cls: 'drift' }, { x: 1524, z: 476, h: Math.PI, cls: 'cup' }, { x: 1524, z: 566, h: Math.PI, cls: 'formula' }, { x: 1524, z: 574, h: Math.PI, cls: 'gt3' }, { x: 1524, z: 648, h: Math.PI, cls: 'lmp' }, { x: 1524, z: 656, h: Math.PI, cls: 'rally' }]);
      const pk = []; for (let k = 0; k < 8; k++) if (hash2i(k, 3, 813) < 0.7) pk.push({ x: 1460 + k * 8, z: 250, h: 0, cls: ['sports', 'apex', 'tempest', 'coupe', 'muscle', 'suv', 'sedan', 'hellion'][k] });
      fleet('vp_park', 1488, 262, 300, pk);
    }
    // ================================================================ FIRE STATION No. 1 (the Coast Highway, north of the city)
    {
      const F = ISLE_FIRE, y = fireP.y, b = this._isleBlock('firehouse', 178, -127, 80, 'Fire Station No. 1');
      this._bld(b, F.x0 + 22, F.z0 + 6, F.x1 - 6, F.z1 - 8, 9, STYLE.BRICK, 0xa63a2e, 4.5, 5, { exactH: true, y0: y, oy: y });
      this._bld(b, F.x1 - 16, F.z1 - 20, F.x1 - 6, F.z1 - 8, 19, STYLE.BRICK, 0x8f3026, 3.8, 3.3, { exactH: true, y0: y, oy: y });
      for (let k = 0; k < 3; k++) box(b, F.x0 + 21.9, y + 2.4, F.z0 + 14 + k * 13, 0.12, 4.8, 9, 0x2a2e33, false);
      b.signs.push({ text: 'PORT VALEN FIRE DEPT · STATION 1', x: F.x0 + 21.85, y: y + 7.3, z: (F.z0 + F.z1) / 2 - 1, ry: -Math.PI / 2, w: 26, h: 1.4, bg: '#a01818', fg: '#ffd84d' });
      b.place = { id: 'firehouse', name: 'Fire Station No. 1', kind: 'landmark', door: { x: F.x0 + 20.6, z: F.z1 - 14, h: -Math.PI / 2 }, under: { x: F.x0 + 40, z: (F.z0 + F.z1) / 2 } };
      fleet('firehouse', 160, -127, 260, [{ x: F.x0 + 11, z: F.z0 + 14, h: -Math.PI / 2, cls: 'firetruck' }, { x: F.x0 + 11, z: F.z0 + 27, h: -Math.PI / 2, cls: 'firetruck' }, { x: F.x0 + 11, z: F.z0 + 40, h: -Math.PI / 2, cls: 'ambulance' }]);
    }
    // ================================================================ CRESTMOOR RIDGE: eight estates over the city
    {
      const cars = ['luxury', 'kodiak', 'sports', 'monarch', 'suv', 'crest', 'luxury', 'tempest'];
      mans.forEach((m, i) => {
        const y = m.P.y, b = this._isleBlock('mansion' + i, m.x, m.z, 46, 'Crestmoor Ridge'), f = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[m.f], along = f[0] ? 'z' : 'x';
        const wall = [0xf2ede2, 0xe8e0d0, 0xdcd6cc, 0xf4f1ea][i % 4], roof = [0x8a4a34, 0x3a4652, 0x5a4a3a, 0x7a3a2e][i % 4];
        // the house is set back from the forecourt: a two-storey block, a wing, a garage beside the drive
        const hx = m.x - f[0] * 6, hz = m.z - f[1] * 6, hw = along === 'x' ? 13 : 7.5, hd = along === 'x' ? 7.5 : 13;
        this._bld(b, hx - hw, hz - hd, hx + hw, hz + hd, 7.6, STYLE.HOUSE, wall, 3.8, 4.2, { exactH: true, y0: y, oy: y, roof: 'gable', roofColor: roof });
        const wx = hx + (along === 'x' ? hw + 4.5 : 0) - f[0] * 2, wz = hz + (along === 'z' ? hd + 4.5 : 0) - f[1] * 2;
        this._bld(b, wx - 4.5, wz - 4.5, wx + 4.5, wz + 4.5, 4.2, STYLE.HOUSE, wall, 4.2, 4.2, { exactH: true, y0: y, oy: y, roof: 'gable', roofColor: roof });
        // a pool behind the house, a hedge round the plot with the drive left open
        const px = m.x - f[0] * 19 + (along === 'x' ? -8 : 0), pz = m.z - f[1] * 17 + (along === 'z' ? -8 : 0);
        this._det(b, 'disc', px, y + 0.06, pz, 5.4, 1, 5.4, C(0xd8d2c4)); b.water.push({ x: px, z: pz, r: 4.2, y: y + 0.1 });
        for (const [ex, ez, sx, sz] of [[m.x, m.z - 21.4, 49, 1.1], [m.x, m.z + 21.4, 49, 1.1], [m.x - 24.4, m.z, 1.1, 43], [m.x + 24.4, m.z, 1.1, 43]]) {
          const front = (ex - m.x) * f[0] + (ez - m.z) * f[1] > 1;
          if (!front) box(b, ex, y + 0.7, ez, sx, 1.4, sz, 0x35602c, true);
          else for (const s of [-1, 1]) box(b, ex + (sx > sz ? s * 15.5 : 0), y + 0.7, ez + (sz > sx ? s * 13.5 : 0), sx > sz ? 18 : sx, 1.4, sz > sx ? 16 : sz, 0x35602c, true);
        }
        const fx = m.x + f[0] * 15, fz = m.z + f[1] * 13, h = Math.atan2(f[0], f[1]);
        fleet('mansion' + i, m.x, m.z, 230, [{ x: fx + (along === 'x' ? -4.5 : 0), z: fz + (along === 'z' ? -4.5 : 0), h, y, cls: cars[i] }, { x: fx + (along === 'x' ? 4.5 : 0), z: fz + (along === 'z' ? 4.5 : 0), h, y, cls: cars[(i + 3) % 8] }]);
      });
    }
    // ================================================================ SALTMARSH (the bay's south shore) and its jetty
    {
      const cols = [0xf2d9c4, 0xc9e2e8, 0xf0e6b8, 0xd8e8c8, 0xe8c8c8, 0xdcdcec], bs = [this._isleBlock('saltmarsh_e', -420, 1180, 150, 'Saltmarsh'), this._isleBlock('saltmarsh_w', -620, 1160, 150, 'Saltmarsh')];
      const slots = [];
      salt.forEach((h, i) => {
        const y = h.P.y, b = bs[h.x < -520 ? 1 : 0];
        this._bld(b, h.x - 6, h.z - 4.5, h.x + 6, h.z + 4.5, 5.6, STYLE.HOUSE, cols[i % 6], 2.8, 3.2, { exactH: true, y0: y, oy: y, roof: 'gable', roofColor: [0x5a4a3a, 0x3a4652, 0x7a3a2e][i % 3] });
        box(b, h.x, y + 0.3, h.z - h.s * 6.6, 9, 0.2, 3.6, 0x9a7d58, false);
        if (hash2i(i, 5, 817) < 0.75) slots.push({ x: h.x + 8.6, z: h.z + h.s * 2, h: h.s > 0 ? Math.PI : 0, y });
      });
      bs[0].place = { id: 'saltmarsh', name: 'Saltmarsh', kind: 'landmark', door: { x: -460, z: 1000, h: Math.PI }, under: { x: -460, z: 1170 } };
      fleet('saltmarsh', -500, 1170, 260, slots);
      // the jetty: a stone mole into the bay with a light at its head
      const J = ISLE_JETTY, jb = this._isleBlock('jetty', -460, 945, 70, 'Saltmarsh Jetty');
      cyl(jb, -460, J.y + 2.4, J.z0 + 4, 0.5, 4.8, 0xe8eaed, true); jb.fx.push({ type: 'beacon', x: -460, y: J.y + 5.1, z: J.z0 + 4 });
      for (let z = J.z0 + 12; z < J.z1; z += 14) for (const s of [-1, 1]) cyl(jb, -460 + s * 5.2, J.y + 0.45, z, 0.25, 0.9, 0x4a4036, true);
    }
    // ================================================================ GULL HARBOR (the north-west cove)
    {
      const b = this._isleBlock('gull', -1290, -2275, 170, 'Gull Harbor'), slots = [];
      gull.forEach((h, i) => {
        const y = h.P.y;
        this._bld(b, h.x - 5, h.z - 4, h.x + 5, h.z + 4, 4.8, STYLE.HOUSE, [0xd8d0bc, 0xb8c4c8, 0xc8b8a4][i % 3], 2.6, 3, { exactH: true, y0: y, oy: y, roof: 'gable', roofColor: 0x3a3d40 });
        for (let k = 0; k < 3; k++) box(b, h.x - 7.5, y + 0.45 + k * 0.5, h.z - 2 + (k % 2) * 0.4, 1.3, 0.5, 1.9, [0x2a6fd6, 0xd8a227, 0x9a4a3a][(i + k) % 3], false);
        if (i % 2 === 0) slots.push({ x: h.x + 7.6, z: h.z, h: 0, y, cls: ['pickup', 'van', 'utility'][(i / 2) % 3] });
      });
      b.place = { id: 'gull', name: 'Gull Harbor', kind: 'landmark', door: { x: -1280, z: -2262, h: 0 }, under: { x: -1290, z: -2275 } };
      fleet('gull', -1290, -2275, 260, slots);
    }
    // ================================================================ THE LIGHTHOUSE (the north-east point)
    {
      const L = ISLE_LIGHT, y = L.y, b = this._isleBlock('lighthouse', 1506, -2790, 60, 'Cape Valen Light'), x = 1500, z = -2796;
      cyl(b, x, y + 5, z, 4.2, 10, 0xf2f4f6, true); cyl(b, x, y + 13, z, 3.6, 6, 0xc8102e, false); cyl(b, x, y + 20, z, 3.1, 8, 0xf2f4f6, false);
      cyl(b, x, y + 24.3, z, 4, 0.6, 0x2a2e33, false); cyl(b, x, y + 26.2, z, 2.2, 3.2, 0x8fd0e8, false); this._det(b, 'cone', x, y + 29, z, 2.8, 2.4, 2.8, C(0x2a2e33));
      b.fx.push({ type: 'neon', x, y: y + 26.2, z, w: 3, h: 2.2, d: 3, c: 0xfff0b0 }, { type: 'beacon', x, y: y + 30.6, z });
      this._bld(b, 1512, -2806, 1524, -2797, 4.2, STYLE.HOUSE, 0xf2ede2, 2.8, 3, { exactH: true, y0: y, oy: y, roof: 'gable', roofColor: 0x8a4a34 });
      b.place = { id: 'lighthouse', name: 'Cape Valen Light', kind: 'landmark', door: { x: 1506, z: -2790, h: 0 }, under: { x, z } };
      fleet('lighthouse', 1520, -2785, 220, [{ x: 1532, z: -2794, h: 0, y, cls: 'pickup' }]);
    }
    // ================================================================ THE OBSERVATORY (Mount Valen's summit) and the mast
    {
      const Sm = ISLE_SUMMIT, y = Sm.y, b = this._isleBlock('summit', 390, -1823, 80, 'Mount Valen Observatory'), x = 366, z = -1842;
      cyl(b, x, y + 3.5, z, 9, 7, 0xe8eaed, true); this._det(b, 'blob', x, y + 7.2, z, 9.4, 7.4, 9.4, C(0xf4f6f8)); box(b, x + 4, y + 11.2, z, 9, 5.2, 2.2, 0x2a2e33, false);
      this._bld(b, 380, -1860, 398, -1850, 4.4, STYLE.IND, 0xd8dade, 4.4, 4, { exactH: true, y0: y, oy: y });
      cyl(b, 428, y + 21, -1790, 0.5, 42, 0xc8102e, true); for (let k = 0; k < 3; k++) b.fx.push({ type: 'beacon', x: 428, y: y + 14 + k * 14, z: -1790 });
      // the lookout's rail on the city side
      for (let k = 0; k < 9; k++) cyl(b, 350 + k * 10, y + 0.55, -1782, 0.1, 1.1, 0x3a3f45, true);
      box(b, 390, y + 1.1, -1782, 82, 0.1, 0.12, 0x3a3f45, false);
      b.signs.push({ text: 'MOUNT VALEN · 246 m', x: 389, y: y + 3.4, z: -1849.9, ry: 0, w: 12, h: 1.2, bg: '#14181c', fg: '#ffffff' });
      b.place = { id: 'summit', name: 'Mount Valen Observatory', kind: 'landmark', door: { x: 389, z: -1848.6, h: 0 }, under: { x, z } };
      fleet('summit', 390, -1820, 220, [{ x: 404, z: -1846, h: Math.PI / 2, y, cls: 'offroad' }]);
    }
    // ================================================================ the city's two rooftop helipads (built in 090) and their lifts
    for (const key of ['hospital', 'police']) {
      const cb = this.block(SPECIAL[key].bx, SPECIAL[key].bz), H = cb && cb.helipad; if (!H) continue;
      isle.lifts.push({ name: key === 'hospital' ? 'St. Alda helipad' : 'Police air unit', a: { x: H.lift.x, z: H.lift.z, y: CURB_H }, b: { x: H.top.x, z: H.top.z, y: H.y } });
      fleet('roof_' + key, H.x, H.z, 420, [{ x: H.x, z: H.z, h: Math.PI / 2, y: H.y, cls: key === 'hospital' ? 'medevac' : 'polheli' }]);
    }
    // ================================================================ the people of each place (bystanders who stand about while you are near)
    {
      const folk = (id, x, z, people) => isle.fleet.push({ id: 'folk_' + id, x, z, r: 0, slots: [], people });
      folk('terminal', 600, 1884, [[590, 1885, 1.2], [594, 1886, -1.5], [606, 1885.5, 0.4], [612, 1886, -2.4], [575, 1881.6, 1.57], [628, 1884, 2.8], [600, 1886.5, 3.1]]);
      folk('apron', 1050, 1968, [[1030, 1975, -1.2], [1085, 1960, 0.6], [958, 1968, 1.57]]);
      folk('pits', 1560, 560, [[1571.4, 462, 1.57], [1571.4, 540, 1.57], [1571.4, 622, 1.57], [1527.6, 472, -1.57], [1527.6, 570, -1.57], [1527.6, 652, -1.57]]);
      folk('proving', 1163, 1492, [[1166, 1491, 3.14], [1170, 1490, -2.6], [PROVING.strip.x0 + 3, PROVING.strip.z - 12.5, 1.57]]);
      folk('saltmarsh', -470, 1090, [[-455, 1006, 0], [-463, 962, 2.2], [-520, 1164, 1.57], [-600, 1148, -1.57], [-392, 1176, 0.3]]);
      folk('summit', 380, -1800, [[372, -1784.5, 0.2], [376, -1785.5, -0.3], [392, -1847, 3.14]]);
      folk('lighthouse', 1508, -2788, [[1508, -2788, 1.2]]);
      folk('firehouse', 160, -127, [[ISLE_FIRE.x0 + 17, ISLE_FIRE.z0 + 20, -1.57], [ISLE_FIRE.x0 + 18, ISLE_FIRE.z0 + 34, -1.57]]);
      folk('gull', -1290, -2265, [[-1282, -2264, 0.5], [-1330, -2262, 2.0], [-1240, -2300, -0.8]]);
    }
    // colliders for the island's blocks (the city's and Valen Point's loops ran before these existed)
    for (const b of isle.blocks) {
      for (const bl of b.bld) if (!bl.noCol) bl.col = this.grid.add({ x0: bl.x0, z0: bl.z0, x1: bl.x1, z1: bl.z1, y0: bl.y0 - 1, y1: bl.y0 + bl.h, kind: 'bld' });
      for (const d of b.det) if (d.col) this.grid.add(d.col);
    }
    isle.mans = mans;
  },
  // runway lights stream in 400 m blocks along the airfield
  _isleLightBlock(x, z, A) {
    const k = Math.floor((x - A.x0) / 400), id = 'ap_lights' + k + (z > 2300 ? 's' : z > 2150 ? 'm' : 'n');
    return this.xblocks.find(b => b.xb === id) || this._isleBlock(id, A.x0 + k * 400 + 200, z, 230, A.name);
  },
  // a parked airliner (static): nose at z, pointing north
  _airliner(b, x, Y, z, tail) {
    const D = (kind, dx, dy, dz, sx, sy, sz, col, rx = 0, ry = 0, rz = 0) => b.det.push({ kind, x: x + dx, y: Y + dy, z: z + dz, sx, sy, sz, color: C(col), ry, rx, rz });
    D('cylr', 0, 4.1, 17, 1.95, 31, 1.95, 0xf2f4f6, Math.PI / 2); D('cone', 0, 4.1, -0.5, 1.95, 4, 1.95, 0xf2f4f6, -Math.PI / 2); D('cone', 0, 4.5, 35.5, 1.9, 6, 1.9, 0xf2f4f6, Math.PI / 2);
    D('box', 0, 4.1, 17, 3.95, 0.5, 31, tail);
    for (const s of [-1, 1]) { D('box', s * 9.5, 3.4, 18.5, 16, 0.45, 4.6, 0xe4e7ea, 0, -s * 0.36); D('cylr', s * 6.2, 2.3, 15.5, 1.05, 3.8, 1.05, 0x9aa0a6, Math.PI / 2); D('box', s * 4.2, 5.2, 35.5, 7, 0.3, 2.6, 0xe4e7ea, 0, -s * 0.3); D('box', s * 2.6, 1.1, 18.5, 0.6, 2.2, 1.4, 0x2a2e33); }
    D('box', 0, 8.4, 35, 0.4, 6.4, 5.2, tail, 0.5); D('box', 0, 1.0, 4, 0.5, 2, 1, 0x2a2e33);
    this.grid.add({ x0: x - 2.1, z0: z - 2, x1: x + 2.1, z1: z + 38, y0: Y, y1: Y + 6.2, kind: 'det' });
    this.grid.add({ x0: x - 17, z0: z + 15, x1: x + 17, z1: z + 22, y0: Y + 1.6, y1: Y + 4.4, kind: 'det' });
  }
});
