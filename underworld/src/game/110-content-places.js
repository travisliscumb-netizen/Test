/* =====================================================================
   [CONTENT] PLACES: service landmarks (repair shop, dealership, depot) and the
   registry of every enterable door / service point in the city.
   ===================================================================== */
Object.assign(LANDMARK_BLOCKS, {
  '10,7': { gen: '_genMotorWorks', name: 'Okafor Motor Works', icon: 'W', ground: 'K' },
  '7,1': { gen: '_genDealer', name: 'Meridian Motors', icon: 'N', ground: 'K', mapCat: 'carsNew', sub: 'New cars · hatchbacks to work trucks · walk the lot, inspect, buy' },
  // v6: a used-car lot across the street from the chop shop, and a performance & luxury showroom downtown
  '10,5': { gen: '_genUsedLot', name: 'Saltworks Used Autos', icon: 'U', ground: 'K', mapCat: 'carsUsed', sub: 'Used cars · condition varies · bargains · stock changes every two days' },
  '8,5': { gen: '_genShowroom', name: 'Valen Prestige Motors', icon: '★', ground: 'D', mapCat: 'carsLux', sub: 'Performance & luxury · glass showroom · rare cars rotate' },
  '11,8': { gen: '_genDepot', name: 'Harbor Row Depot', icon: 'D', ground: 'I' }
});

Object.assign(World.prototype, {
  _genMotorWorks(b, rng) {
    this._sidewalk(b, rng, { trees: 0.2, park: 0 });
    // workshop with roll-up doors facing the yard, office annex beside it
    const ws = this._bld(b, b.x0 + 3, b.z0 + 3, b.x0 + 36, b.z0 + 22, 7.4, STYLE.IND, 0x8a6f58, 7.4, 6.2, { gtype: 3, exactH: true });
    this._ring(b, ws, ws.y0 + ws.h - 0.35, 0.7, 0.35, C(0x1d4f8a));
    this._rooftop(b, ws, rng, 'ind');
    const of = this._bld(b, b.x0 + 36, b.z0 + 3, b.x1 - 3, b.z0 + 17, 6.2, STYLE.BRICK, 0x9c5a44, 3.1, 3.2, { gtype: 1, exactH: true });
    this._rooftop(b, of, rng, 'mid');
    b.signs.push({ text: 'OKAFOR MOTOR WORKS', x: (ws.x0 + ws.x1) / 2, y: CURB_H + 6.3, z: ws.z1 + 0.05, ry: 0, w: 15, h: 1.5, bg: '#1d4f8a', fg: '#ffffff' });
    b.signs.push({ text: 'SINCE 1987 · REPAIRS · TUNING · PAINT', x: (ws.x0 + ws.x1) / 2, y: CURB_H + 5.05, z: ws.z1 + 0.05, ry: 0, w: 15, h: 0.7, bg: '#f2c230', fg: '#1b1b1b' });
    b.signs.push({ text: 'OFFICE', x: (of.x0 + of.x1) / 2, y: CURB_H + 3.3, z: of.z1 + 0.05, ry: 0, w: 3.2, h: 0.6, bg: '#101418', fg: '#f2c230' });
    // service bay apron: painted box, bollards, hanging lamp
    const bx = b.x0 + 19, bz = b.z0 + 29;
    this._det(b, 'box', bx, CURB_H + 0.012, bz, 7.5, 0.025, 9, C(0x3a3f45));
    for (const s of [-1, 1]) {
      this._det(b, 'box', bx + s * 3.8, CURB_H + 0.02, bz, 0.18, 0.03, 9, C(0xf2c230));
      this._prop(b, 'bollard', bx + s * 4.6, bz + 4.2, 0);
    }
    b.fx.push({ type: 'canopy', x: bx, y: CURB_H + 6.6, z: ws.z1 + 1.5, w: 8, d: 3 });
    // yard clutter that tells you what happens here
    for (let k = 0; k < 4; k++) { this._det(b, 'cyl', b.x0 + 5 + k * 1.1, CURB_H + 0.55, ws.z1 + 1.4, 0.38, 1.1, 0x1a1a1c); }
    for (let k = 0; k < 3; k++) this._prop(b, 'barrel', b.x0 + 31 + k * 0.9, ws.z1 + 1.2, rng.range(0, 3));
    this._prop(b, 'pallet', b.x0 + 34, ws.z1 + 3.4, 0.2);
    this._prop(b, 'dumpster', b.x1 - 5, b.z0 + 20, Math.PI / 2);
    this._det(b, 'box', b.x0 + 27, CURB_H + 0.6, ws.z1 + 1.1, 1.6, 1.2, 0.9, C(0xc0392b), 0, true);
    // a project car on stands and a waiting line of customer cars on the lot paint
    this._det(b, 'box', b.x0 + 8, CURB_H + 0.9, b.z0 + 27, 1.9, 0.9, 4.4, C(0x5a6a7a));
    for (const dx of [-0.8, 0.8]) for (const dz of [-1.6, 1.6]) this._det(b, 'box', b.x0 + 8 + dx, CURB_H + 0.25, b.z0 + 27 + dz, 0.25, 0.5, 0.25, C(0xd23a2a));
    for (let k = 0; k < 7; k++) if (rng.chance(0.65)) b.parked.push({ x: b.cx - 26 + 1.4 + (k * 2 + 6) * 2.8, z: b.cz + 13.4, h: 0, cls: null });
    b.place = {
      id: 'motorworks', name: 'Okafor Motor Works', kind: 'service',
      door: { x: (of.x0 + of.x1) / 2, z: of.z1 + 1.1, h: 0 },
      bay: { x: bx, z: bz, h: Math.PI },
      under: { x: (ws.x0 + ws.x1) / 2, z: (ws.z0 + ws.z1) / 2 }
    };
    b.secrets.push({ x: b.x1 - 3, z: b.z0 + 24 });
  },
  _genDealer(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, park: 0, benches: true });
    const sr = this._bld(b, b.x0 + 6, b.z0 + 3, b.x1 - 6, b.z0 + 21, 8.5, STYLE.GLASS, 0x9fb7c8, 8.5, 4.2, { gtype: 2, exactH: true });
    this._ring(b, sr, sr.y0 + sr.h - 0.4, 0.8, 0.5, C(0xe8eef4));
    this._rooftop(b, sr, rng, 'mid');
    b.signs.push({ text: 'MERIDIAN MOTORS', x: b.cx, y: CURB_H + 7.2, z: sr.z1 + 0.06, ry: 0, w: 18, h: 1.8, bg: '#0f1d33', fg: '#e8eef6' });
    b.signs.push({ text: 'NEW CARS · DRIVE AWAY TODAY', x: b.cx, y: CURB_H + 5.9, z: sr.z1 + 0.06, ry: 0, w: 12, h: 0.7, bg: '#c8501e', fg: '#ffffff' });
    // entrance canopy and pennant poles along the street edge of the display lot
    this._det(b, 'box', b.cx, CURB_H + 3.6, sr.z1 + 2.2, 10, 0.3, 4.4, C(0xe8eef4));
    b.fx.push({ type: 'canopy', x: b.cx, y: CURB_H + 3.42, z: sr.z1 + 2.2, w: 9, d: 4 });
    const flagC = [0xd23a2a, 0xf2c230, 0x2a5f9e, 0xf4f4f2];
    for (let k = 0; k < 8; k++) {
      const x = b.x0 + 4 + k * 8.6, z = b.z1 - 2.5;
      if (Math.abs(x - b.cx) < 5) continue; // the lot's exit
      this._det(b, 'cyl', x, CURB_H + 3, z, 0.06, 6, 0xd0d4d8);
      this._det(b, 'box', x + 0.5, CURB_H + 5.4, z, 1.0, 0.7, 0.03, C(flagC[k % 4]));
    }
    // fifteen painted display stalls in three rows, angled to the street; a centre aisle and a dropped kerb
    // let a car you buy drive straight out
    const slots = [];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
      const x = b.cx - 23 + k * 11.5 + (k >= 2 ? 0 : 0), z = b.cz + 1 + r * 9.5, h = (k % 2 ? 1 : -1) * 0.32;
      if (k === 2 && r === 2) continue;
      slots.push({ x: k === 2 ? b.cx : x, z, h });
    }
    slots.push({ x: b.cx - 23 + 2 * 11.5 + 5.75, z: b.cz + 1 + 2 * 9.5 + 0.4, h: 0.32 }); // replaces the aisle stall
    for (const sl of slots) this._stallPad(b, sl, 0xdfe3e8);
    this._road([[b.cx, b.cz + 26], [b.cx, b.z1 + 4.6]], 7);
    for (const [lx, lz] of [[-16, 6], [16, 6], [-16, 22], [16, 22]]) this._prop(b, 'lotlamp', b.cx + lx, b.cz + lz, 0);
    b.place = {
      id: 'dealer', name: 'Meridian Motors', kind: 'service', lot: 'new',
      desk: { x: b.cx + 3, z: sr.z1 + 2.4, h: 0 },
      door: { x: b.cx, z: sr.z1 + 1.2, h: 0 },
      slots,
      delivery: { x: b.bx * P + 4.6, z: b.cz + 4, h: Math.PI }
    };
  },
  // a painted stall: a pale pad with a border, and a little price stand at its nose
  _stallPad(b, sl, col) {
    const fx = Math.sin(sl.h), fz = Math.cos(sl.h);
    this._det(b, 'box', sl.x, CURB_H + 0.012, sl.z, 3.0, 0.02, 5.8, C(col), sl.h);
    for (const sx of [-1, 1]) this._det(b, 'box', sl.x + Math.cos(sl.h) * sx * 1.55, CURB_H + 0.018, sl.z - Math.sin(sl.h) * sx * 1.55, 0.1, 0.02, 5.8, C(0xf4f4f2), sl.h);
    const px = sl.x + fx * 3.3, pz = sl.z + fz * 3.3;
    this._det(b, 'box', px, CURB_H + 0.45, pz, 0.06, 0.9, 0.06, C(0x3a3f46), sl.h);
    this._det(b, 'box', px, CURB_H + 0.95, pz, 0.62, 0.42, 0.04, C(0xf4f1ea), sl.h);
    this._det(b, 'box', px, CURB_H + 1.08, pz + 0.001, 0.62, 0.1, 0.045, C(col === 0xdfe3e8 ? 0x2a5f9e : 0xc8501e), sl.h);
  },
  // Saltworks Used Autos: a gravel-and-concrete cash lot across the street from the chop shop, with a portable
  // sales office, a reconditioning shed, bunting, hand-lettered signs and tyre stacks. Legal cars on this side
  // of the street, the other kind on the other side.
  _genUsedLot(b, rng) {
    this._sidewalk(b, rng, { trees: 0, park: 0 });
    const cx = b.cx, e = 0.6;
    this._rectS(b.x0 + 2, b.z0 + 2, b.x1 - 2, b.z1 - 2, 'concrete');
    // fence on three sides; the street side is open between two gate posts
    this._fence(b, b.x0 + e, b.z0 + e, b.x1 - e, b.z0 + e, 'chain');
    this._fence(b, b.x0 + e, b.z0 + e, b.x0 + e, b.z1 - e, 'chain'); this._fence(b, b.x1 - e, b.z0 + e, b.x1 - e, b.z1 - e, 'chain');
    this._fence(b, b.x0 + e, b.z1 - e, cx - 6, b.z1 - e, 'chain'); this._fence(b, cx + 6, b.z1 - e, b.x1 - e, b.z1 - e, 'chain');
    for (const sx of [-1, 1]) this._det(b, 'box', cx + sx * 6.2, CURB_H + 1.2, b.z1 - e, 0.3, 2.4, 0.3, C(0xc8501e), 0, true);
    this._road([[cx, b.z1 - 3], [cx, b.z1 + 4.6]], 9);
    // portable sales office and the reconditioning shed
    const off = this._bld(b, b.x0 + 4, b.z0 + 4, b.x0 + 17, b.z0 + 12, 3.2, STYLE.IND, 0xd8d0bc, 3.2, 3, { exactH: true }); off.far = false;
    this._det(b, 'box', (off.x0 + off.x1) / 2, CURB_H + 3.25, off.z1 + 0.8, off.x1 - off.x0 + 0.6, 0.12, 1.8, C(0x2a5f9e));
    const shed = this._bld(b, b.x1 - 26, b.z0 + 3, b.x1 - 4, b.z0 + 17, 6, STYLE.IND, 0x7d6f63, 6, 6, { gtype: 3, exactH: true });
    this._rooftop(b, shed, rng, 'ind');
    b.signs.push({ text: 'SALTWORKS USED AUTOS', x: (off.x0 + off.x1) / 2, y: CURB_H + 4.2, z: off.z1 + 0.06, ry: 0, w: 12, h: 1.3, bg: '#f2c230', fg: '#1b1b1b' });
    b.signs.push({ text: 'RECONDITIONING', x: (shed.x0 + shed.x1) / 2, y: CURB_H + 5.1, z: shed.z1 + 0.06, ry: 0, w: 9, h: 0.9, bg: '#1b1b1b', fg: '#f4f1ea' });
    // a pole sign at the gate everyone on the street can read
    this._det(b, 'cyl', cx - 9, CURB_H + 3.5, b.z1 - 3, 0.16, 7, 0x3a3f46, 'r');
    b.signs.push({ text: 'USED AUTOS · CASH TODAY', x: cx - 9, y: CURB_H + 7.4, z: b.z1 - 2.9, ry: 0, w: 7.5, h: 1.2, bg: '#c8501e', fg: '#ffffff' });
    b.signs.push({ text: 'NO CREDIT? NO PROBLEM', x: cx - 9, y: CURB_H + 6.3, z: b.z1 - 2.9, ry: 0, w: 7.5, h: 0.7, bg: '#1b1b1b', fg: '#f2c230' });
    b.signs.push({ text: 'WE BUY ANY CAR*', x: (shed.x0 + shed.x1) / 2, y: CURB_H + 1.4, z: shed.z1 + 0.06, ry: 0, w: 5, h: 0.6, bg: '#f4f1ea', fg: '#c8501e' });
    // bunting strung between poles over the rows
    const flag = [0xd23a2a, 0xf2c230, 0x2a5f9e, 0xf4f4f2, 0x2f8a4a];
    for (const z of [b.cz - 2, b.cz + 10]) {
      for (const sx of [-1, 1]) this._det(b, 'cyl', cx + sx * 28, CURB_H + 2.5, z, 0.06, 5, 0xb8bec6);
      for (let k = 0; k < 28; k++) { const x = cx - 27 + k * 2, sag = Math.sin(k / 27 * Math.PI) * 0.6; this._det(b, 'box', x, CURB_H + 4.6 - sag, z, 0.34, 0.4, 0.02, C(flag[k % flag.length]), 0); }
    }
    // tyre stacks, a ramp of a jack, a bargain board
    for (let k = 0; k < 4; k++) for (let n = 0; n < 2 + (k % 3); n++) this._det(b, 'cyl', shed.x0 - 2 - k * 1.1, CURB_H + 0.15 + n * 0.3, shed.z1 + 1.5 + (k % 2) * 0.4, 0.4, 0.28, 0x161618);
    this._det(b, 'box', b.x0 + 22, CURB_H + 0.9, b.z0 + 6, 2.6, 1.6, 0.08, C(0xf4f1ea), 0, true);
    b.signs.push({ text: 'BARGAIN OF THE WEEK', x: b.x0 + 22, y: CURB_H + 1.2, z: b.z0 + 6.06, ry: 0, w: 2.4, h: 0.5, bg: '#f4f1ea', fg: '#d23a2a' });
    // ten stalls, two rows of five facing the street, a drive aisle down the middle
    const slots = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) {
      const x = cx - 26 + k * 10.4 + (k >= 2.5 ? 2.2 : 0) + (k === 2 ? -4.2 : 0), z = b.cz + 2 + r * 12, h = (k % 2 ? 1 : -1) * 0.22;
      slots.push({ x: k === 2 ? cx - 5.6 : x, z, h });
    }
    for (const sl of slots) this._stallPad(b, sl, 0xb8b0a0);
    for (const [lx, lz] of [[-20, 8], [20, 8]]) this._prop(b, 'lotlamp', cx + lx, b.cz + lz, 0);
    b.place = {
      id: 'usedlot', name: 'Saltworks Used Autos', kind: 'service', lot: 'used',
      desk: { x: (off.x0 + off.x1) / 2 + 2, z: off.z1 + 1.4, h: 0 },
      door: { x: (off.x0 + off.x1) / 2, z: off.z1 + 1.1, h: 0 },
      slots
    };
  },
  // Valen Prestige Motors: an office tower at the back and, in front, a glass pavilion on a polished floor
  // with six cars, lots of space between them, spot lights over each, a turntable for the flagship, a feature
  // wall with the name on it, and a wide glass front that opens in the middle so a car can drive out.
  _genShowroom(b, rng) {
    this._sidewalk(b, rng, { trees: 0.4, benches: true, park: 0 });
    const cx = b.cx;
    const tw = this._bld(b, b.x0 + 8, b.z0 + 3, b.x1 - 8, b.z0 + 19, 34, STYLE.GLASS, 0x2a3a4c, 4.2, 4.2, { gtype: 2, exactH: true });
    this._ring(b, tw, tw.y0 + tw.h - 0.4, 0.8, 0.5, C(0xe8d28a));
    this._rooftop(b, tw, rng, 'mid');
    const X0 = b.x0 + 7, X1 = b.x1 - 7, Z0 = b.z0 + 23, Z1 = b.z0 + 47, H = 6.4, y0 = CURB_H;
    // polished floor with a tile grid, the feature wall at the back, the roof and its light trim
    this._det(b, 'box', cx, y0 + 0.012, (Z0 + Z1) / 2, X1 - X0, 0.02, Z1 - Z0, C(0x24272c));
    for (let x = X0 + 4; x < X1; x += 4) this._det(b, 'box', x, y0 + 0.024, (Z0 + Z1) / 2, 0.03, 0.005, Z1 - Z0, C(0x3a3e45));
    for (let z = Z0 + 4; z < Z1; z += 4) this._det(b, 'box', cx, y0 + 0.024, z, X1 - X0, 0.005, 0.03, C(0x3a3e45));
    this._det(b, 'box', cx, y0 + H / 2, Z0 + 0.25, X1 - X0, H, 0.5, C(0x17191d), 0, true);
    b.signs.push({ text: 'VALEN PRESTIGE', x: cx, y: y0 + 4.2, z: Z0 + 0.52, ry: 0, w: 14, h: 1.5, bg: '#17191d', fg: '#e8d28a' });
    b.signs.push({ text: 'PERFORMANCE · LUXURY · RARE', x: cx, y: y0 + 3.2, z: Z0 + 0.52, ry: 0, w: 9, h: 0.5, bg: '#17191d', fg: '#c8ccd2' });
    this._det(b, 'box', cx, y0 + H + 0.2, (Z0 + Z1) / 2, X1 - X0 + 1.2, 0.4, Z1 - Z0 + 1.2, C(0xe8eef4));
    b.fx.push({ type: 'crown', x0: X0 - 0.6, x1: X1 + 0.6, z0: Z0 - 0.6, z1: Z1 + 0.6, y: y0 + H - 0.8 });
    b.signs.push({ text: 'VALEN PRESTIGE MOTORS', x: cx, y: y0 + H + 1.2, z: Z1 + 0.62, ry: 0, w: 16, h: 1.4, bg: '#0e0f12', fg: '#e8d28a' });
    // slender columns and glass on the sides and front (the front opens 9 m wide in the middle)
    const glass = b.glass || (b.glass = []), gcol = (x, z, sx, sz) => this._det(b, 'none', x, y0 + H / 2, z, sx, H, sz, null, 0, { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2, y0: 0, y1: y0 + H, kind: 'det', see: true });
    for (const x of [X0, X1]) { glass.push({ x, y: y0 + H / 2, z: (Z0 + Z1) / 2, sx: 0.06, sy: H, sz: Z1 - Z0 }); gcol(x, (Z0 + Z1) / 2, 0.2, Z1 - Z0); }
    const gap = 4.5;
    for (const [a, c] of [[X0, cx - gap], [cx + gap, X1]]) { glass.push({ x: (a + c) / 2, y: y0 + H / 2, z: Z1, sx: c - a, sy: H, sz: 0.06 }); gcol((a + c) / 2, Z1, c - a, 0.2); }
    glass.push({ x: cx, y: y0 + H - 0.6, z: Z1, sx: gap * 2, sy: 1.2, sz: 0.06 }); // transom over the opening
    for (let x = X0; x <= X1 + 0.01; x += (X1 - X0) / 6) for (const z of [Z0 + 0.6, Z1]) if (Math.abs(x - cx) > gap - 0.2 || z !== Z1) this._det(b, 'cyl', x, y0 + H / 2, z, 0.14, H, 0x8a9096, 'r');
    for (const sx of [-1, 1]) for (let z = Z0 + 4; z < Z1; z += 5) this._det(b, 'box', cx + sx * (X1 - X0) / 2, y0 + H / 2, z, 0.08, H, 0.08, C(0x8a9096));
    // light strips on the ceiling, a spot over every car, the turntable
    for (const z of [Z0 + 5, Z0 + 12, Z0 + 19]) b.fx.push({ type: 'neon', x: cx, y: y0 + H - 0.05, z, w: X1 - X0 - 4, h: 0.06, d: 0.25, c: 0xfff6e6 });
    const slots = [
      { x: cx, z: Z0 + 8.5, h: 0, turn: true }, { x: cx - 15, z: Z0 + 7.5, h: 0.45 }, { x: cx + 15, z: Z0 + 7.5, h: -0.45 },
      { x: cx - 16, z: Z0 + 17.5, h: 0.7 }, { x: cx + 16, z: Z0 + 17.5, h: -0.7 }, { x: cx - 6.5, z: Z0 + 17.5, h: 0.25 }
    ];
    for (const sl of slots) {
      b.fx.push({ type: 'neon', x: sl.x, y: y0 + H - 0.08, z: sl.z, w: 1.4, h: 0.05, d: 1.4, c: 0xffffff });
      b.fx.push({ type: 'neon', x: sl.x, y: y0 + 0.05, z: sl.z, w: 4.6, h: 0.004, d: 6.6, c: 0x4a4e57, ry: sl.h }); // the pool of light the spot throws
      if (sl.turn) { this._det(b, 'cyl', sl.x, y0 + 0.04, sl.z, 3.3, 0.06, 0xd8dade); b.fx.push({ type: 'neon', x: sl.x, y: y0 + 0.075, z: sl.z, w: 6.4, h: 0.01, d: 0.06, c: 0xe8d28a }); }
      else this._det(b, 'box', sl.x, y0 + 0.03, sl.z, 3.2, 0.03, 5.8, C(0x31353b), sl.h);
    }
    // the sales desk, lounge chairs, planters and bollards on the forecourt, banner poles
    this._det(b, 'box', cx + 10, y0 + 0.5, Z0 + 2.4, 3.2, 1.0, 0.9, C(0xe8eef4), 0, true);
    for (const sx of [-1, 1]) this._det(b, 'box', cx - 10 + sx * 1.2, y0 + 0.35, Z0 + 2.2, 0.9, 0.7, 0.9, C(0x6a1e2a), 0, true);
    for (const sx of [-1, 1]) { this._prop(b, 'planter', cx + sx * 9, Z1 + 3.5, 0); this._prop(b, 'planter', cx + sx * 20, Z1 + 3.5, 0); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) this._prop(b, 'bollard', cx + sx * (5.6 + k * 1.4), Z1 + 6, 0);
    for (const sx of [-1, 1]) { this._det(b, 'cyl', cx + sx * 26, y0 + 4, Z1 + 5, 0.08, 8, 0xd0d4d8); this._det(b, 'box', cx + sx * 26 + sx * 0.45, y0 + 5.6, Z1 + 5, 0.8, 3.2, 0.03, C(0x0e0f12)); }
    this._rectS(X0 - 2, Z1, X1 + 2, b.z1 - 2, 'concrete');
    this._road([[cx, Z1 - 1], [cx, b.z1 + 4.6]], 8);
    b.place = {
      id: 'prestige', name: 'Valen Prestige Motors', kind: 'service', lot: 'lux',
      desk: { x: cx + 10, z: Z0 + 3.6, h: Math.PI },
      door: { x: cx, z: Z1 + 1.2, h: 0 },
      slots
    };
  },
  _genDepot(b, rng) {
    this._sidewalk(b, rng, { trees: 0, park: 0 });
    const wh = this._bld(b, b.x0 + 3, b.z0 + 3, b.x1 - 3, b.z0 + 30, 11, STYLE.WARE, 0x6f7a80, 5.5, 6, { gtype: 3, exactH: true });
    this._dressBox(b, wh, rng, 'warehouse');
    this._rooftop(b, wh, rng, 'ind');
    b.signs.push({ text: 'HARBOR ROW DEPOT', x: b.cx, y: CURB_H + 9, z: wh.z1 + 0.06, ry: 0, w: 16, h: 1.8, bg: '#14181c', fg: '#e8c04a' });
    b.signs.push({ text: 'VALEN SHIPPING CO. · NO ENTRY', x: b.cx, y: CURB_H + 7.6, z: wh.z1 + 0.06, ry: 0, w: 12, h: 0.7, bg: '#b03a2e', fg: '#ffffff' });
    // personnel door with a caged light
    const dx = b.cx + 12;
    this._det(b, 'box', dx, CURB_H + 1.2, wh.z1 + 0.08, 1.3, 2.4, 0.12, C(0x2a2e33));
    b.fx.push({ type: 'canopy', x: dx, y: CURB_H + 2.9, z: wh.z1 + 0.6, w: 1.6, d: 1 });
    this._containers(b, rng, b.x0 + 5, b.z0 + 38, b.x1 - 5, b.z1 - 5);
    for (let k = 0; k < 4; k++) this._prop(b, 'pallet', b.x0 + 6 + k * 2.2, wh.z1 + 2.5, rng.range(0, 1));
    this._prop(b, 'barrier', b.cx - 6, wh.z1 + 5, 0); this._prop(b, 'barrier', b.cx + 6, wh.z1 + 5, 0);
    b.place = {
      id: 'depot', name: 'Harbor Row Depot', kind: 'locked',
      door: { x: dx, z: wh.z1 + 1.1, h: 0 },
      under: { x: (wh.x0 + wh.x1) / 2, z: (wh.z0 + wh.z1) / 2 }
    };
  },
  // collect every door and service point after the whole city is built
  _placesGen() {
    const P2 = this.places = {};
    for (const b of this.blocks) if (b.place) P2[b.place.id] = b.place;
    const sb = this.block(SPECIAL.safehouse.bx, SPECIAL.safehouse.bz).safehouse;
    P2.safehouse = { id: 'safehouse', name: 'Linden Hills Safehouse', kind: 'home', door: { x: sb.x, z: sb.z, h: 0 }, garage: sb.garage, under: { x: sb.x, z: sb.z - 9 } };
    // Valen Tower lobby (penthouse lift), Fuel & Go store, Police HQ lobby
    const tb = this.block(6, 5), base = tb.bld[0];
    P2.tower = { id: 'tower', name: 'Valen Tower', kind: 'home2', door: { x: tb.cx, z: base.z1 + 1.1, h: 0 }, garage: { x: tb.bx * P + P - 4.6, z: tb.cz + 22, h: 0 }, under: { x: tb.cx, z: tb.cz - 6 } };
    const gb = this.block(10, 4), st = gb.bld.find(r => r.style === STYLE.SHOP) || gb.bld[0];
    P2.store = { id: 'store', name: 'Fuel & Go', kind: 'shop', door: { x: (st.x0 + st.x1) / 2, z: st.z1 + 1.1, h: 0 }, under: { x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2 } };
    const pb = this.block(SPECIAL.police.bx, SPECIAL.police.bz), main = pb.bld[0];
    P2.police = { id: 'police', name: 'Police HQ', kind: 'public', door: { x: (main.x0 + main.x1) / 2, z: main.z0 - 1.1, h: Math.PI }, under: { x: (main.x0 + main.x1) / 2, z: main.z0 + 12 } };
    const hb = this.block(SPECIAL.hospital.bx, SPECIAL.hospital.bz);
    P2.hospital = { id: 'hospital', name: 'St. Alda Hospital', kind: 'landmark', door: { x: hb.respawn.x, z: hb.respawn.z, h: 0 } };
    const mb = this.block(6, 8);
    P2.mall = { id: 'mall', name: 'Harborview Mall', kind: 'landmark', door: { x: mb.cx, z: mb.z0 + 31, h: 0 } };
    const sd = this.stadium;
    P2.stadium = { id: 'stadium', name: 'Valen Stadium', kind: 'landmark', door: { x: sd.cx, z: sd.cz + sd.B + 18, h: 0 }, center: { x: sd.cx, z: sd.cz }, tunnel: sd.tunnel };
    P2.shed4 = { id: 'shed4', name: 'Tidewater Shed 4', kind: 'landmark', door: { x: this.terminalShed.x, z: this.terminalShed.z, h: this.terminalShed.h } };
    if (this.parkade) P2.parkade = { id: 'parkade', name: 'Central Parkade', kind: 'landmark', door: { x: this.parkade.entrance.x, z: this.parkade.entrance.z, h: Math.PI } };
    const qg = this.block(2, 5);
    P2.garageRoof = { id: 'garageRoof', name: 'Quarter Garage', kind: 'landmark', door: { x: qg.x1 - 8, z: qg.z1 + 1, h: 0 }, roof: { x: (qg.x0 + 2 + qg.x1 - 12) / 2, z: (qg.z0 + 2 + qg.z1 - 4) / 2, y: CURB_H + 10 } };
    const pl = this.block(10, 1);
    P2.plant = { id: 'plant', name: 'Saltworks Plant', kind: 'landmark', door: { x: pl.cx, z: pl.z1 + 1, h: 0 } };
    const cs = this.block(SPECIAL.chopshop.bx, SPECIAL.chopshop.bz).chopshop;
    P2.chopshop = { id: 'chopshop', name: 'Saltworks Chop Shop', kind: 'landmark', door: { x: cs.x, z: cs.z, h: Math.PI } };
    // the county jail block is an interior with no street door (you only arrive in cuffs)
    const jb = this.block(8, 10);
    P2.prison = { id: 'prison', name: 'County Jail', kind: 'hidden', hidden: true, door: { x: P2.police.door.x, z: P2.police.door.z, h: P2.police.door.h }, under: { x: jb.cx, z: jb.cz } };
  }
});
{
  const base2 = World.prototype.generate;
  World.prototype.generate = function () { base2.call(this); this._placesGen(); Links.build(this); };
}
/* ---------------------------------------------------------------------
   The Valen Royale: the casino on the Nightlife Strip, a block south of Club Neon.
   A plum-and-gold gaming hall with a glass hotel tower over it, a lit porte-cochère and a
   valet forecourt on the Strip. The gaming floor is an interior built when you walk in.
   --------------------------------------------------------------------- */
Object.assign(LANDMARK_BLOCKS, {
  '5,9': { gen: '_genCasino', name: 'The Valen Royale', icon: '♦', ground: 'K', mapCat: 'casino', sub: 'Casino · slots, blackjack, roulette, Hold’em · open all night' }
});
Object.assign(World.prototype, {
  _genCasino(b, rng) {
    this._sidewalk(b, rng, { trees: 0.35, benches: true, news: false, park: 0 });
    const cx = b.cx, cz = b.cz;
    const hall = this._bld(b, b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z0 + 32, 12, STYLE.DECO, 0x3a2346, 6, 6, { gtype: 2, exactH: true });
    this._ring(b, hall, hall.y0 + hall.h - 0.5, 0.9, 0.6, C(0xd8a227));
    this._ring(b, hall, hall.y0 + 5.6, 0.35, 0.3, C(0xb8902a));
    this._rooftop(b, hall, rng, 'mid');
    // hotel tower set back on the podium: three stepped glass tiers with gold crowns
    let y = hall.y0 + hall.h;
    for (const [w, d, h] of [[26, 16, 22], [22, 13, 16], [16, 10, 9]]) {
      const t = this._bld(b, cx - w / 2, b.z0 + 9, cx + w / 2, b.z0 + 9 + d, h, STYLE.GLASS, 0x2e2440, 3.4, 3.2, { y0: y, oy: CURB_H, noCol: true, far: true, exactH: true });
      b.fx.push({ type: 'crown', x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y: y + h - 1.2 });
      this._ring(b, t, y + h - 0.3, 0.6, 0.4, C(0xd8a227));
      y += h;
    }
    b.fx.push({ type: 'beacon', x: cx, y: y + 3.2, z: b.z0 + 14 });
    this._det(b, 'cyl', cx, y + 1.5, b.z0 + 14, 0.25, 3, 0x8c949c);
    // the forecourt (v6): a paved entrance plaza at the doors under a lit porte-cochère, a drive-through drop-off
    // lane (no stall paint), a planted island carrying the canopy columns, a zebra crossing and a paved walk
    // through the car park to the street. The stall rows painted by the ground shader stay only beyond the island.
    const fz = hall.z1, Y = CURB_H, cw = 23, plazaD = 3.8, laneD = 5.4, islD = 1.2;
    const zPl = fz + plazaD / 2, zLane = fz + plazaD + laneD / 2, zIsl = fz + plazaD + laneD + islD / 2, zOut = fz + plazaD + laneD + islD;
    // plaza: cream stone with darker joints, a bronze edge and a low kerb onto the lane
    this._det(b, 'box', cx, Y + 0.012, zPl, cw, 0.024, plazaD, C(0xd9cfbd));
    for (let k = -5; k <= 5; k++) this._det(b, 'box', cx + k * 2.1, Y + 0.026, zPl, 0.05, 0.004, plazaD - 0.1, C(0xb8ad98));
    for (let k = 1; k < 3; k++) this._det(b, 'box', cx, Y + 0.026, fz + k * plazaD / 3, cw - 0.1, 0.004, 0.05, C(0xb8ad98));
    this._det(b, 'box', cx, Y + 0.04, fz + plazaD - 0.12, cw, 0.08, 0.24, C(0x8a7a5a));
    // drop-off lane: fresh dark asphalt over the old stall paint, a dashed edge and two arrows
    this._det(b, 'box', cx, Y + 0.008, zLane, cw + 6, 0.016, laneD, C(0x1e2023));
    for (let k = -6; k <= 6; k++) this._det(b, 'box', cx + k * 2.2, Y + 0.018, fz + plazaD + 0.35, 1.1, 0.004, 0.1, C(0xe8e2d0));
    for (const s2 of [-1, 1]) { this._det(b, 'box', cx + s2 * 7, Y + 0.018, zLane, 1.6, 0.004, 0.14, C(0xe8e2d0)); this._det(b, 'box', cx + s2 * 7 + 0.7, Y + 0.018, zLane + 0.2, 0.5, 0.004, 0.14, C(0xe8e2d0), -0.6); this._det(b, 'box', cx + s2 * 7 + 0.7, Y + 0.018, zLane - 0.2, 0.5, 0.004, 0.14, C(0xe8e2d0), 0.6); }
    // zebra crossing from the plaza to the island and on to the walk
    for (let k = 0; k < 6; k++) this._det(b, 'box', cx - 1.5 + 0.0, Y + 0.02, fz + plazaD + 0.5 + k * 0.85, 3.0, 0.004, 0.45, C(0xf2f0e8));
    // island: kerbed planters with the canopy columns, a gap for the crossing
    for (const s2 of [-1, 1]) {
      const ix = cx + s2 * (cw / 4 + 1.0), iw = cw / 2 - 4.2;
      this._det(b, 'box', ix, Y + 0.12, zIsl, iw, 0.24, islD, C(0x9a9284), 0, true);
      this._det(b, 'box', ix, Y + 0.27, zIsl, iw - 0.3, 0.08, islD - 0.3, C(0x2f6a3a));
    }
    // the porte-cochère: a deep canopy from the facade over plaza and lane, carried on four columns on the island
    const canD = plazaD + laneD + islD - 0.2, canZ = fz + canD / 2;
    this._det(b, 'box', cx, Y + 5.4, canZ, cw - 0.6, 0.7, canD, C(0x2a1a36));
    this._det(b, 'box', cx, Y + 5.85, canZ, cw - 0.2, 0.2, canD + 0.4, C(0xd8a227));
    for (const k of [-9.5, -3.5, 3.5, 9.5]) this._det(b, 'cyl', cx + k, Y + 2.7, zIsl, 0.35, 5.4, 0xe8dcc0, null, { x: cx + k, z: zIsl, r: 0.4, y0: 0, y1: 5.4, kind: 'det' });
    b.fx.push({ type: 'canopy', x: cx, y: Y + 5.0, z: canZ, w: cw - 2, d: canD - 1 });
    // downlights under the canopy and a warm wash on the plaza
    for (let k = -4; k <= 4; k++) for (const dz of [1.4, plazaD + 2.6]) b.fx.push({ type: 'neon', x: cx + k * 2.4, y: Y + 5.03, z: fz + dz, w: 0.5, h: 0.06, d: 0.5, c: 0xfff0c8 });
    // the red carpet: a polished runner with gold edging from the doors to the kerb, brass stanchions and ropes
    this._det(b, 'box', cx, Y + 0.03, zPl, 2.6, 0.035, plazaD - 0.1, C(0xa01628));
    for (const s2 of [-1, 1]) this._det(b, 'box', cx + s2 * 1.34, Y + 0.035, zPl, 0.08, 0.04, plazaD - 0.1, C(0xd8a227));
    for (const s2 of [-1, 1]) for (let k = 0; k < 3; k++) { const zz = fz + 0.9 + k * 1.2; this._det(b, 'cyl', cx + s2 * 1.75, Y + 0.48, zz, 0.05, 0.96, 0xd8a227); this._det(b, 'box', cx + s2 * 1.75, Y + 0.98, zz, 0.12, 0.08, 0.12, C(0xffe2a0)); if (k < 2) this._det(b, 'box', cx + s2 * 1.75, Y + 0.82, zz + 0.6, 0.05, 0.05, 1.15, C(0x9a1a2a)); }
    // the main entrance: a bronze portal with three pairs of glass doors, push bars, a lit transom and the word ENTRANCE
    const dz0 = fz + 0.03;
    this._det(b, 'box', cx, Y + 1.75, dz0 + 0.12, 9.2, 3.5, 0.22, C(0x1a0e24));
    this._det(b, 'box', cx, Y + 3.62, dz0 + 0.2, 9.6, 0.3, 0.36, C(0xd8a227));
    for (const s2 of [-1, 1]) this._det(b, 'box', cx + s2 * 4.7, Y + 1.75, dz0 + 0.2, 0.32, 3.6, 0.36, C(0xd8a227));
    for (let k = -1; k <= 1; k++) {
      const x0 = cx + k * 2.9;
      for (const s2 of [-1, 1]) {
        const lx = x0 + s2 * 0.66;
        this._det(b, 'box', lx, Y + 1.32, dz0 + 0.26, 1.2, 2.6, 0.05, C(0x2c3a46));
        b.fx.push({ type: 'neon', x: lx, y: Y + 1.32, z: dz0 + 0.29, w: 1.02, h: 2.4, d: 0.02, c: 0xffd9a0 });
        this._det(b, 'box', lx, Y + 1.32, dz0 + 0.32, 0.08, 2.62, 0.04, C(0xd8a227));
        this._det(b, 'box', lx - s2 * 0.42, Y + 1.15, dz0 + 0.36, 0.06, 0.9, 0.06, C(0xf0d070));
      }
      this._det(b, 'box', x0, Y + 1.32, dz0 + 0.3, 0.1, 2.66, 0.08, C(0xd8a227));
    }
    b.fx.push({ type: 'neon', x: cx, y: Y + 2.95, z: dz0 + 0.3, w: 8.6, h: 0.5, d: 0.04, c: 0xffe2a0 });
    b.signs.push({ text: 'ENTRANCE', x: cx, y: Y + 3.25, z: dz0 + 0.42, ry: 0, w: 3.2, h: 0.42, bg: '#1a0e24', fg: '#ffd84d' });
    // neon marquee and trim on the facade above the canopy
    b.fx.push({ type: 'neon', x: cx, y: Y + 9.6, z: fz + 0.5, w: 30, h: 0.18, d: 0.12, c: 0xe056fd });
    b.fx.push({ type: 'neon', x: cx, y: Y + 6.3, z: fz + canD + 0.2, w: cw - 0.2, h: 0.16, d: 0.1, c: 0xffd84d });
    for (const s2 of [-1, 1]) { b.fx.push({ type: 'neon', x: cx + s2 * 15.2, y: Y + 6, z: fz + 0.12, w: 0.25, h: 11, d: 0.12, c: s2 < 0 ? 0xe056fd : 0x46d4c4 }); b.fx.push({ type: 'neon', x: cx + s2 * 20, y: Y + 3.2, z: fz + 0.12, w: 5, h: 0.2, d: 0.12, c: 0xffd84d }); }
    b.signs.push({ text: 'THE VALEN ROYALE', x: cx, y: Y + 8.0, z: fz + 0.3, ry: 0, w: 22, h: 2.6, bg: '#1a0e24', fg: '#ffd84d' });
    b.signs.push({ text: 'CASINO · OPEN ALL NIGHT', x: cx, y: Y + 6.6, z: fz + canD + 0.3, ry: 0, w: 12, h: 0.9, bg: '#1a0e24', fg: '#e056fd' });
    for (let i = 0; i < 4; i++) b.signs.push({ x: hall.x0 + 5 + i * 3.6 + (i > 1 ? 30 : 0), y: Y + 3.2, z: fz + 0.06, ry: 0, w: 3, h: 1.6, ad: (i * 5 + 2) % 8 });
    // planters flank the plaza; the valet podium stands by the lane, not on the carpet
    for (const k of [-12.5, 12.5]) { this._det(b, 'box', cx + k, Y + 0.45, fz + 1.4, 2.4, 0.9, 1.2, C(0x5a4a3a), 0, true); this._det(b, 'box', cx + k, Y + 1.2, fz + 1.4, 2.0, 0.7, 0.9, C(0x2f6a3a)); }
    this._det(b, 'box', cx + 6.5, Y + 0.6, fz + plazaD - 0.7, 1.0, 1.2, 0.6, C(0x2a1a36), 0, true);
    // the walk from the island to the street through the car park: paving with kerbs, lit by bollards
    const walkZ1 = b.z1 - 0.5, walkL = walkZ1 - zOut;
    if (walkL > 1) {
      this._det(b, 'box', cx, Y + 0.014, zOut + walkL / 2, 3.2, 0.028, walkL, C(0xd9cfbd));
      for (const s2 of [-1, 1]) this._det(b, 'box', cx + s2 * 1.7, Y + 0.04, zOut + walkL / 2, 0.2, 0.08, walkL, C(0x8a7a5a));
      for (let z = zOut + 1.5; z < walkZ1 - 0.5; z += 3) for (const s2 of [-1, 1]) { this._det(b, 'cyl', cx + s2 * 2.1, Y + 0.45, z, 0.09, 0.9, 0x2a2c30); b.fx.push({ type: 'neon', x: cx + s2 * 2.1, y: Y + 0.82, z, w: 0.14, h: 0.1, d: 0.14, c: 0xffe2a0 }); }
    }
    // the car park beyond the island (the shader's outer half-row); nothing parks on the walk or the lane
    for (const [rz, ry] of [[13.4, 0], [19.0, Math.PI]]) for (let k = 0; k < 18; k++) { const x = cx - 26 + 1.4 + k * 2.8; if (Math.abs(x - cx) < 3.4 || !rng.chance(0.55)) continue; b.parked.push({ x, z: cz + rz, h: ry, cls: null }); }
    for (const [lx, lz] of [[-18, 11], [18, 11], [0, 25]]) if (!(lx === 0)) this._prop(b, 'lotlamp', cx + lx, cz + lz, 0);
    // two hidden spots, as the city block that stood here had (keeps the package draw stable)
    b.secrets.push({ x: hall.x1 + 2, z: hall.z0 + 2 }, { x: hall.x0 - 2, z: hall.z0 + 2 });
    b.place = { id: 'casino', name: 'The Valen Royale', kind: 'landmark', grand: true, door: { x: cx, z: fz + 1.1, h: 0 }, under: { x: cx, z: cz } };
  }
});
