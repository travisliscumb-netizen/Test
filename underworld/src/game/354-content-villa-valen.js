/* =====================================================================
   [CONTENT] VILLA VALEN: the house you can walk into from the first minute,
   the bunker under it and the cache hidden in it (owner, 2026-11-16).
   - The house (villaInteriorDef): two storeys, 64 x 30 m. Ground floor: a
     double-height entrance hall with the grand staircase, the great living
     room, the formal dining room, the library, the study, the family cinema,
     the kitchen (two islands, a pantry), the garden room and a powder room.
     Upper floor: the master suite (bedroom, sitting room, ensuite, walk-in
     closet), a family lounge, five more bedrooms with their own bathrooms.
   - A bookcase in the library hides the lift to the bunker (villaBunkerDef):
     a scene change, like every interior, built 60 m under the island somewhere
     nothing else is. Operations room, armoury, mess, crew quarters, lounge
     and cinema, cash vault, plant room, med bay, comms.
   - A panel in the master's walk-in closet hides $20,000,000, clean, once
     (the secret 'villacache': it pays straight into the bank).
   - Nobody lives there: anyone can walk in. It is for sale at the gate
     (PROPS 'villa'); owned, its bed, wardrobe, stash, laptop and the garage
     under the pavilion (VSPACE_DEFS.villa) are yours.
   ===================================================================== */
const VILLA_INT = { W: 64, D: 30, H1: 4.6, H2: 4.2, at: { x: -610, z: -921 }, bunkerAt: { x: -610, z: -1185 } };
// where the front door is on the island (the portico, 128) and which way you face coming out
const VILLA_DOOR = { x: -610, z: -900.9, h: 0 };

function villaInteriorDef(owned) {
  const { W, D, H1, H2 } = VILLA_INT, H = H1 + H2, hw = W / 2, hd = D / 2, U = H1, G = H1 - 0.3;
  const def = {
    id: 'villa', dynamic: true, name: 'Villa Valen', w: W, d: D, h: H, seed: 4242, tier: 7,
    exit: { x: 0, z: hd - 0.7 }, spawnH: Math.PI, place: null, at: { ...VILLA_INT.at }, door: { ...VILLA_DOOR },
    propId: owned ? 'villa' : null, owned, villa: true, noExit: true,
    // walkable decks: the upper floor is everything but the void over the entrance hall; the staircase climbs north
    levels: [
      { x0: -hw, x1: -8, z0: -hd, z1: hd, h: U },
      { x0: 8, x1: hw, z0: -hd, z1: hd, h: U },
      { x0: -8, x1: 8, z0: -hd, z1: 0, h: U },
      { x0: -1.8, x1: 1.8, z0: 0, z1: 12, axis: 'z', dir: -1, h0: 0, h1: U }
    ],
    build(k, rng) {
      def.windows = [];
      const WALL = 0xece6d8, WALL2 = 0xe2dac8, MARBLE = 0xece8de, MARBLE2 = 0xd8d2c4, OAK = 0x8a6440, OAK2 = 0x7a5636, WAL = 0x4a3222, GOLD = 0xd8b04a, CREAM = 0xf2ece0, NAVY = 0x22304a;
      k.room(W, D, H, { floor: MARBLE, wall: WALL, wall2: WALL2, ceil: 0xf6f2e8, trim: 0x2a2620, lights: [6, 2], lightC: 0xfff4dc });
      k.tiles(W, D, MARBLE, MARBLE2, 1.25);
      k.door(0, hd - 0.02, 0, 0x3a2418, GOLD);
      // a wooden floor laid over a room's marble (x0, z0, x1, z1 at height y): planks along x
      const wood = (x0, z0, x1, z1, y = 0, c1 = OAK, c2 = OAK2) => { const n = Math.max(1, Math.round((z1 - z0) / 0.6)); for (let i = 0; i < n; i++) k.box((x0 + x1) / 2, y + 0.002, z0 + (i + 0.5) * (z1 - z0) / n, x1 - x0 - 0.02, 0.012, (z1 - z0) / n - 0.02, i % 2 ? c1 : c2, { flat: true }); };
      // a chequered floor laid over one room
      const tilesAt = (x0, z0, x1, z1, y, c2, sz) => { const nx = Math.floor((x1 - x0) / sz), nz = Math.floor((z1 - z0) / sz); k.box((x0 + x1) / 2, y + 0.001, (z0 + z1) / 2, x1 - x0 - 0.02, 0.01, z1 - z0 - 0.02, 0xe8e4dc, { flat: true }); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if ((i + j) % 2) k.box(x0 + (i + 0.5) * sz, y + 0.004, z0 + (j + 0.5) * sz, sz - 0.03, 0.01, sz - 0.03, c2, { flat: true }); };
      const carpet = (x0, z0, x1, z1, y, c) => k.box((x0 + x1) / 2, y + 0.002, (z0 + z1) / 2, x1 - x0 - 0.02, 0.016, z1 - z0 - 0.02, c, { flat: true });
      // ---------------------------------------------------------------- the upper floor slab (ceiling of the ground floor)
      const slab = (x0, z0, x1, z1) => k.box((x0 + x1) / 2, H1 - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, 0xf6f2e8, { col: true });
      slab(-hw, -hd, -8, hd); slab(8, -hd, hw, hd); slab(-8, -hd, 8, 0);
      // ---------------------------------------------------------------- the grand staircase: 30 steps north from the hall
      const st0 = 12, st1 = 0, n = 30, run = (st0 - st1) / n;
      for (let i = 0; i < n; i++) { const z = st0 - (i + 0.5) * run, top = (i + 1) * H1 / n; k.box(0, 0, z, 3.6, top, run + 0.01, MARBLE); k.box(0, top - 0.02, z + run / 2 - 0.03, 3.6, 0.025, 0.06, 0x8a7a5a); k.box(0, top, z, 2.2, 0.012, run - 0.04, 0x7a1a2a, { flat: true }); }
      for (let i = 0; i < 15; i++) {
        const za = st0 - i * (st0 - st1) / 15, zb = st0 - (i + 1) * (st0 - st1) / 15, ha = (st0 - za) / (st0 - st1) * H1, hb = (st0 - zb) / (st0 - st1) * H1;
        if (ha > 0.4) k.cols.push({ x0: -1.8, x1: 1.8, z0: zb, z1: za, y0: 0, y1: ha - 0.05 });
        for (const sx of [-1.88, 1.88]) { k.cols.push({ x0: sx - 0.08, x1: sx + 0.08, z0: zb, z1: za, y0: Math.max(0, ha - 0.3), y1: hb + 1.0 }); k.box(sx, ha + 0.9, (za + zb) / 2, 0.09, 0.09, za - zb + 0.02, WAL); k.box(sx, ha, (za + zb) / 2, 0.03, 0.9, 0.03, GOLD); }
      }
      for (const sx of [-1.88, 1.88]) { k.box(sx, 0, st0 + 0.1, 0.3, 1.2, 0.3, WAL); k.box(sx, 1.2, st0 + 0.1, 0.36, 0.2, 0.36, GOLD); }
      // the gallery rail along the landing, open where the staircase arrives
      const rail = (x0, z0, x1, z1) => { const ax = Math.abs(x1 - x0) > 0.1, len = ax ? x1 - x0 : z1 - z0; k.box((x0 + x1) / 2, U, (z0 + z1) / 2, ax ? len : 0.05, 1.0, ax ? 0.05 : len, 0xa8c8d8); k.box((x0 + x1) / 2, U + 1.0, (z0 + z1) / 2, ax ? len : 0.1, 0.06, ax ? 0.1 : len, WAL); k.cols.push({ x0: Math.min(x0, x1) - 0.06, x1: Math.max(x0, x1) + 0.06, z0: Math.min(z0, z1) - 0.06, z1: Math.max(z0, z1) + 0.06, y0: U, y1: U + 1.1 }); };
      rail(-8, 0, -1.9, 0); rail(1.9, 0, 8, 0);
      // ================================================================ GROUND FLOOR
      // walls (gaps are doorways; the hall opens wide to the living room)
      iwall(k, 'z', -8, -hd, hd, 0, G, WALL, [[-10.6, -8.4], [4, 10]]);  // rear hall|library, hall|living room (an arch)
      iwall(k, 'z', 8, -hd, hd, 0, G, WALL, [[-9, -6], [6, 8.2]]);       // rear hall|kitchen, hall|study
      iwall(k, 'x', 0, -8, 8, 0, G, WALL2, [[-7, -3.2], [3.2, 7]]);        // hall|garden room
      iwall(k, 'x', 0, -hw, -8, 0, G, WALL2, [[-22.6, -20.4], [-14.2, -12]]); // living|dining, living|library
      iwall(k, 'z', -18, -hd, 0, 0, G, WALL, [[-7, -5]]);                  // dining|library
      iwall(k, 'x', 0, 8, hw, 0, G, WALL2, [[9.4, 11.4], [26, 28.2]]);      // study|kitchen, cinema|kitchen
      iwall(k, 'z', 18, 0, hd, 0, G, WALL, [[3, 5]]);                      // study|cinema
      iwall(k, 'z', 4, -hd, -11, 0, G, WALL2, [[-12.8, -11.6]]); iwall(k, 'x', -11, 4, 8, 0, G, WALL2); // powder room
      iwall(k, 'z', 28, -hd, -10, 0, G, WALL2, [[-11.6, -10.4]]); iwall(k, 'x', -10, 28, hw, 0, G, WALL2); // pantry
      // ---- the entrance hall: a rug at the door, consoles, two chandeliers, statues, a pair of palms
      FURN.rug(k, 0, 0, 13.6, 5, 2.4, 0x7a1a2a, 0x9a2a3a);
      for (const sx of [-1, 1]) {
        k.box(sx * 6.6, 0, 11.6, 0.6, 0.9, 2.4, WAL, { col: true }); k.box(sx * 6.6, 0.9, 11.6, 0.66, 0.04, 2.46, MARBLE2);
        FURN.art(k, sx * 7.92, 1.6, 11.6, sx < 0 ? 1 : 3, 1.8, 1.2, sx < 0 ? 0x8a2f3a : 0x2a5f9e);
        FURN.plant(k, sx * 7.2, 0, 14.2, 1.3); k.box(sx * 5, 0, 4.2, 0.9, 1.1, 0.9, MARBLE2, { col: true }); k.box(sx * 5, 1.1, 4.2, 0.45, 1.1, 0.45, GOLD);
      }
      FURN.chandelier(k, 0, H - 2.2, 7); FURN.chandelier(k, 0, H - 2.2, 12.5);
      // ---- the garden room behind the hall (under the landing): sofas round a rug, a grand piano, palms, the garden doors
      wood(-8, -hd, 4, 0);
      FURN.rug(k, -2, 0, -8, 7, 5, 0x5a6a4a, 0x6a7a5a); FURN.sofa(k, -2, 0, -10.2, 0, 3.0, 0xe6e2da); FURN.sofa(k, -5.4, 0, -7.6, 1, 2.4, 0xe6e2da); FURN.armchair(k, 1.4, 0, -7.6, 3, 0x8a6a4a); FURN.coffeeTable(k, -2, 0, -7.8, 0, 1.6, 0.9, WAL);
      k.box(1.5, 0, -12.8, 2.0, 0.95, 1.5, 0x111113, { col: true }); k.box(1.5, 0.95, -12.8, 2.0, 0.08, 1.5, 0x1a1a1c); k.box(1.0, 0.95, -12.1, 0.9, 0.12, 0.3, 0xf2f2f0);
      for (const x of [-7.3, 3.3]) FURN.plant(k, x, 0, -14.3, 1.2);
      for (const x of [-5, -1, 3]) { k.box(x, 0, -hd + 0.06, 1.6, 2.6, 0.06, 0x9fc4d8); k.box(x, 2.6, -hd + 0.06, 1.7, 0.08, 0.1, WAL); }
      // powder room
      FURN.toilet(k, 7.3, 0, -14.4, 0); FURN.vanity(k, 5.2, 0, -14.6, 0, 1.0, 0x2a2c30); k.box(6, 0, -13, 4, 0.01, 4, 0x3a3d42, { flat: true });
      // ---- the great living room (24 x 15): two seating groups, the fireplace, the media wall, a bar in the corner
      wood(-hw, 0, -8, hd);
      FURN.rug(k, -24, 0, 6.5, 8, 6, 0x2a3a52, 0x3a4a62); FURN.rug(k, -17.2, 0, 9.5, 6, 5, 0x6a4a3a, 0x7a5a4a);
      FURN.fireplace(k, -hw + 0.3, 0, 6.5, 1, 2.6); k.box(-hw + 0.1, 1.5, 6.5, 0.2, 2.8, 3.4, 0xd8d0c0); FURN.art(k, -hw + 0.22, 2.4, 6.5, 1, 2.2, 1.2, 0x2a5f9e);
      FURN.sofa(k, -24, 0, 3.6, 0, 3.8, 0x3a3f46); FURN.sofa(k, -24, 0, 9.6, 2, 3.8, 0x3a3f46); FURN.armchair(k, -27.6, 0, 6.5, 1, 0x6a4a3a); FURN.coffeeTable(k, -24, 0, 6.6, 0, 2.0, 1.0, 0x1a1c20);
      k.box(-17.2, 0, 0.4, 5.0, 0.55, 0.55, 0x1a1c20, { col: true }); FURN.tv(k, -17.2, 0.5, 0.3, 0, 3.8, false);
      FURN.sofa(k, -17.2, 0, 10.8, 2, 3.4, 0xe6e2da); FURN.armchair(k, -20.8, 0, 8.4, 1, 0xe6e2da); FURN.armchair(k, -13.6, 0, 8.4, 3, 0xe6e2da); FURN.coffeeTable(k, -17.2, 0, 8.4, 0, 1.6, 0.8, WAL);
      FURN.bar(k, -10.6, 0, 12.9, 3, 3.2, 3); FURN.lamp(k, -30.8, 0, 1.2); FURN.lamp(k, -30.8, 0, 13.6); FURN.plant(k, -19, 0, 14.2, 1.1); FURN.plant(k, -30.6, 0, 3.0);
      for (const [x, z] of [[-24, 4], [-24, 9], [-17, 4], [-17, 10]]) FURN.ceilingLight(k, x, H1, z, 1.4);
      // ---- the formal dining room: a table for fourteen, two sideboards, two chandeliers
      wood(-hw, -hd, -18, 0, 0, 0x5a3e2b, 0x4e3524);
      FURN.rug(k, -25, 0, -7.5, 11, 5, 0x5a1a2a, 0x7a2a3a); FURN.diningSet(k, -25, 0, -7.5, 0, 14, 0x2a2620);
      k.box(-25, 0, -hd + 0.35, 4.0, 0.9, 0.55, WAL, { col: true }); k.box(-hw + 0.35, 0, -7.5, 0.55, 0.9, 3.0, WAL, { col: true });
      FURN.art(k, -25, 1.8, -hd + 0.02, 0, 3.2, 1.6, 0x5a3a7a); FURN.chandelier(k, -28, G - 1.0, -7.5); FURN.chandelier(k, -22, G - 1.0, -7.5); FURN.plant(k, -19, 0, -14.2);
      // ---- the library: shelves floor to ceiling, reading chairs, a desk, a globe; one bookcase is not a bookcase
      wood(-18, -hd, -8, 0, 0, 0x6a4a32, 0x5e4029);
      for (const [x, z, o, w] of [[-17.75, -10.5, 1, 7], [-17.75, -2.9, 1, 3.6], [-16, -14.75, 0, 3.2], [-9.6, -14.75, 0, 2.8]]) FURN.bookshelf(k, x, 0, z, o, w, rng, 3.6);
      // the secret: a bookcase that stands a hand's width proud of the wall, a red book that glows when you are close
      FURN.bookshelf(k, -12.9, 0, -14.68, 0, 2.6, rng, 3.6); k.box(-12.2, 1.55, -14.45, 0.08, 0.3, 0.2, 0x9a1a2a); k.glow(-12.2, 1.86, -14.45, 0.06, 0.02, 0.06, 0xff4d4d, 1.2);
      FURN.rug(k, -13, 0, -7, 6, 5, 0x2a3a2a, 0x3a4a3a); FURN.armchair(k, -15.4, 0, -6, 1, 0x5a2a1a); FURN.armchair(k, -10.6, 0, -6, 3, 0x5a2a1a); FURN.coffeeTable(k, -13, 0, -6, 0, 1.0, 0.8, WAL);
      FURN.desk(k, -15.6, 0, -2.4, 2, 1.8, false, WAL); k.box(-9.4, 0, -2.4, 0.5, 0.8, 0.5, WAL, { col: true });
      k.box(-9.4, 0.8, -2.4, 0.12, 0.25, 0.12, GOLD); k.box(-9.4, 1.05, -2.4, 0.6, 0.6, 0.6, 0x3a6a9a); FURN.lamp(k, -17.2, 0, -0.8);
      // ---- the study (yours once you own it): the desk with the laptop, the safe, shelves, a map of the island
      wood(8, 0, 18, hd, 0, 0x5a3e2b, 0x4e3524);
      FURN.desk(k, 13, 0, 4.0, 2, 2.2, true, WAL); k.box(13, 0, 2.6, 0.9, 1.15, 0.12, 0x2a2a2e);
      FURN.bookshelf(k, 8.25, 0, 11.6, 1, 5, rng, 3.4); FURN.safe(k, 17.4, 0, 13.4, 3); FURN.armchair(k, 11, 0, 11.5, 0, 0x4a2a1a); FURN.armchair(k, 15, 0, 11.5, 0, 0x4a2a1a);
      k.box(15, 1.3, 0.24, 3.4, 1.8, 0.04, 0xc8b88a); for (let i = 0; i < 10; i++) k.box(13.6 + i * 0.3, 1.5 + (i % 3) * 0.45, 0.27, 0.07, 0.07, 0.01, 0xd23a2a);
      FURN.rug(k, 13, 0, 7.6, 5, 4, NAVY, 0x2a3a5a);
      // ---- the family cinema: a wall-sized screen, three rows of seats, a popcorn counter
      carpet(18, 0, hw, hd, 0, 0x2a1a22);
      k.box(hw - 0.3, 0.6, 7.5, 0.2, 3.4, 10, 0x111111); k.glow(hw - 0.42, 0.75, 7.5, 0.02, 3.1, 9.6, 0x3a5a8a, 1.3);
      for (let r = 0; r < 3; r++) { k.box(25 - r * 3.4, 0, 8.6, 2.6, 0.18 * r, 8.6, 0x2a1a22, { flat: true }); FURN.sofa(k, 25 - r * 3.4, 0.18 * r, 8.6, 1, 7.2, 0x6a1a2a); }
      k.box(29.6, 0, 14.3, 2.4, 1.0, 0.7, 0x1a1c20, { col: true }); k.glow(29.6, 1.0, 14.3, 0.6, 0.5, 0.5, 0xffd84d, 1.4);
      for (let i = 0; i < 4; i++) k.glow(18.4, 2.4, 2 + i * 3.6, 0.04, 0.5, 0.3, 0xffb04a, 1.8);
      // ---- the kitchen (24 x 15): a long run under the hood, a second along the east wall, two islands, the family table
      tilesAt(8, -hd, hw, 0, 0, 0xd4d0c8, 0.75);
      FURN.kitchenRun(k, 18.5, 0, -hd + 0.35, 0, 17, { upper: true, hood: true, base: 0x2a2c30, top: 0xe8e4dc, fridgeC: 0xb8bcc2 });
      FURN.kitchenRun(k, hw - 0.35, 0, -5.5, 3, 7, { upper: true, fridge: true, base: 0x2a2c30, top: 0xe8e4dc, fridgeC: 0xb8bcc2 });
      FURN.island(k, 14, 0, -8.2, 0, 4.4, 0x1a1c20, 0xe8e4dc, 4); FURN.island(k, 22, 0, -8.2, 0, 4.4, 0x1a1c20, 0xe8e4dc, 4);
      FURN.diningSet(k, 20, 0, -2.6, 0, 8, OAK); FURN.plant(k, 9, 0, -1, 1.0);
      for (const lx of [12.5, 15.5, 20.5, 23.5]) FURN.ceilingLight(k, lx, H1, -8.2, 0.9);
      FURN.ceilingLight(k, 20, H1, -2.6, 1.6);
      // the pantry
      for (const z of [-14.6, -10.4]) k.box(30, 0, z, 3.6, 2.2, 0.4, 0x6a5a48, { col: true });
      for (let i = 0; i < 12; i++) k.box(28.6 + (i % 6) * 0.5, 0.7 + Math.floor(i / 6) * 0.7, -14.3, 0.3, 0.32, 0.22, [0xd23a2a, 0xffd84d, 0x46a04a, 0xe8e4dc][i % 4]);
      // the door down to the garage, at the kitchen's east end
      k.box(hw - 0.05, 0, -1.2, 0.1, 2.4, 1.6, 0x2a2c30); k.glow(hw - 0.12, 2.5, -1.2, 0.03, 0.16, 1.2, 0x8fe39b, 2.4);
      // ground floor windows (the view: the island below the hill)
      for (const [x, z, ry, w] of [[-26, hd - 0.06, Math.PI, 3.2], [-14, hd - 0.06, Math.PI, 3.2], [13, hd - 0.06, Math.PI, 2.4], [-25, -hd + 0.06, 0, 3.4], [14, -hd + 0.06, 0, 3.0], [23, -hd + 0.06, 0, 3.0], [-hw + 0.06, -7.5, Math.PI / 2, 3.0], [-hw + 0.06, 11, Math.PI / 2, 3.0]]) FURN.window(def, x, 1.1, z, w, 2.0, ry);
      // ================================================================ UPPER FLOOR
      const U2 = U;
      iwall(k, 'z', -8, -hd, hd, U2, H2, WALL, [[-2.8, -0.4]]);          // the master suite's double doors off the landing
      iwall(k, 'x', -3, -8, hw, U2, H2, WALL2, [[-6.6, -3], [4, 5.4], [9.5, 10.9], [21.5, 22.9]]); // landing|lounge, bed 6, bed 2, bed 3
      iwall(k, 'x', 0, 8, hw, U2, H2, WALL2, [[9.5, 10.9], [21.5, 22.9]]); // landing|bed 4, bed 5
      iwall(k, 'z', 2, -hd, -3, U2, H2, WALL);   // lounge|bed 6
      iwall(k, 'z', 8, -hd, -3, U2, H2, WALL); iwall(k, 'z', 8, 0, hd, U2, H2, WALL);
      iwall(k, 'z', 20, -hd, -3, U2, H2, WALL); iwall(k, 'z', 20, 0, hd, U2, H2, WALL);
      // the master suite: its own hall, the bedroom, a sitting room, the ensuite and the walk-in closet
      iwall(k, 'x', -3, -16, -8, U2, H2, WALL2, [[-13, -11.6]]);           // suite hall|sitting room
      iwall(k, 'z', -16, -hd, 0, U2, H2, WALL, [[-2.6, -0.6]]);            // bedroom|suite hall
      iwall(k, 'x', 0, -hw, -8, U2, H2, WALL2, [[-27, -25.4], [-14, -12.4]]); // bedroom|ensuite, suite hall|closet
      iwall(k, 'z', -20, 0, hd, U2, H2, WALL, [[6, 7.6]]);                 // ensuite|closet
      // the ensuites of bedrooms 2-5 (in a corner of each)
      for (const [x0, z0, x1, z1, gx] of [[16, -hd, 20, -10, 17.2], [28, -hd, 32, -10, 29.2], [16, 11, 20, hd, 17.2], [28, 11, 32, hd, 29.2]]) {
        const zw = z0 === -hd ? z1 : z0; iwall(k, 'x', zw, x0, x1, U2, H2, WALL2, [[gx, gx + 1.2]]); iwall(k, 'z', x0, z0, z1, U2, H2, WALL2);
        const cz = (z0 + z1) / 2; FURN.shower(k, x1 - 0.7, U2, z0 === -hd ? z0 + 0.7 : z1 - 0.7, 0, 1.1); FURN.toilet(k, x0 + 0.5, U2, cz, 1); FURN.vanity(k, x0 + 2, U2, z0 === -hd ? z0 + 0.3 : z1 - 0.3, z0 === -hd ? 0 : 2, 1.0);
        k.box((x0 + x1) / 2, U2, cz, x1 - x0 - 0.1, 0.01, z1 - z0 - 0.1, 0xd8dcdc, { flat: true });
      }
      // ---- the landing: a runner, art, a console, plants
      carpet(-8, -3, hw, 0, U2, 0x7a1a2a);
      for (const x of [12, 18, 26]) FURN.art(k, x, U2 + 1.4, -2.92, 0, 1.6, 1.0, [0x2a5f9e, 0x8a2f3a, 0x3a6a4a][(x / 6) % 3 | 0]);
      FURN.plant(k, 31.3, U2, -1.5, 1.0); for (const x of [-6, 14, 28]) FURN.ceilingLight(k, x, H, -1.5, 1.0);
      // ---- the master bedroom
      carpet(-hw, -hd, -16, 0, U2, 0xc8bca8);
      FURN.bed(k, -hw + 1.6, U2, -7.5, 1, 2.4, 2.6, 0x6a3a8a, 0x1a1c20); FURN.nightstand(k, -hw + 0.4, U2, -9.4, 1); FURN.nightstand(k, -hw + 0.4, U2, -5.6, 1);
      FURN.sofa(k, -27, U2, -7.5, 3, 2.4, 0xe6e2da); FURN.tv(k, -16.2, U2 + 0.6, -7.5, 3, 2.2, false); k.box(-16.35, U2, -7.5, 0.4, 0.6, 2.6, 0x1a1c20, { col: true });
      FURN.fireplace(k, -24, U2, -hd + 0.3, 0, 2.0); FURN.dresser(k, -19, U2, -hd + 0.35, 0, 1.6, 0x2c2e33, true); FURN.lamp(k, -30.8, U2, -1.2); FURN.armchair(k, -18, U2, -2, 2, 0x8a6a4a);
      // the sitting room
      FURN.sofa(k, -12, U2, -13.8, 0, 2.6, 0x2a3a52); FURN.coffeeTable(k, -12, U2, -11.8, 0, 1.2, 0.7); FURN.armchair(k, -9, U2, -10.8, 3, 0x2a3a52); FURN.plant(k, -15.3, U2, -14.3);
      // the ensuite: a freestanding tub, two basins, a walk-in shower
      tilesAt(-hw, 0, -20, hd, U2, 0xd8d4cc, 0.8);
      FURN.tub(k, -26, U2, 8.5, 1, 2.0); FURN.vanity(k, -28, U2, 0.35, 0, 1.6, 0x2a2c30); FURN.vanity(k, -24.4, U2, 0.35, 0, 1.6, 0x2a2c30);
      FURN.shower(k, -hw + 0.9, U2, 14.1, 0, 1.6); FURN.toilet(k, -21, U2, 14.4, 2); FURN.plant(k, -21, U2, 1.0, 0.9);
      // the walk-in closet: wardrobes all round, an island of drawers, a mirror; and one panel that does not sit flush
      carpet(-20, 0, -8, hd, U2, 0xd8ccb8);
      for (let i = 0; i < 6; i++) { FURN.wardrobe(k, -19.6, U2, 1.4 + i * 2.2, 1, 2.0, 0xf2ece0); }
      for (let i = 0; i < 4; i++) FURN.wardrobe(k, -17.5 + i * 2.2, U2, hd - 0.4, 2, 2.0, 0xf2ece0);
      FURN.dresser(k, -14, U2, 7.5, 0, 3.0, 0xf2ece0, false); k.box(-14, U2 + 0.9, 7.5, 3.0, 0.04, 0.6, 0x2a2620);
      k.box(-8.25, U2 + 0.2, 4, 0.06, 2.4, 1.2, 0xcfe0ec); // the full-length mirror
      if (!def.cacheTaken) { k.box(-8.24, U2 + 0.2, 12, 0.08, 2.2, 1.3, 0xe8e2d4); k.box(-8.2, U2 + 1.2, 11.5, 0.04, 0.08, 0.04, 0x9a8a6a); }
      // ---- the family lounge over the garden room: a pool table, a sectional round a screen, a card table
      wood(-8, -hd, 2, -3, U2);
      FURN.poolTable(k, -0.8, U2, -10.2, 0); FURN.ceilingLight(k, -0.8, H, -10.2, 1.6);
      FURN.sofa(k, -5, U2, -6.6, 2, 3.2, 0x3a3f46); FURN.tv(k, -5, U2 + 0.6, -14.75, 0, 2.6, false); k.box(-5, U2, -14.7, 3, 0.6, 0.45, 0x1a1c20, { col: true });
      FURN.arcade(k, 1.2, U2, -14.4, 0, 0xd23a2a); FURN.arcade(k, 0.2, U2, -14.4, 0, 0x6a3a8a);
      // ---- bedroom 6 (the guest room)
      carpet(2, -hd, 8, -3, U2, 0xb8c4c8); FURN.bed(k, 5, U2, -hd + 1.3, 0, 1.6, 2.1, 0x3a6a8a); FURN.nightstand(k, 6.8, U2, -hd + 0.35, 0); FURN.wardrobe(k, 2.45, U2, -7, 1, 1.4); FURN.lamp(k, 7.4, U2, -4);
      // ---- bedrooms 2-5
      const bedroom = (x0, z0, x1, z1, rug, sheet, twin) => {
        const cx = (x0 + x1) / 2, north = z0 === -hd, wz = north ? z0 : z1;
        carpet(x0, z0, x1, z1, U2, rug);
        const nz2 = north ? wz + 0.35 : wz - 0.35, o2 = north ? 0 : 2;
        if (twin) { for (const bx of [x0 + 2.2, x0 + 5.8]) FURN.bed(k, bx, U2, north ? wz + 1.2 : wz - 1.2, o2, 1.2, 2.0, sheet); FURN.nightstand(k, x0 + 4, U2, nz2, o2); }
        else { FURN.bed(k, x0 + 4, U2, north ? wz + 1.35 : wz - 1.35, o2, 2.0, 2.3, sheet); FURN.nightstand(k, x0 + 1.6, U2, nz2, o2); FURN.nightstand(k, x0 + 6.4, U2, nz2, o2); }
        FURN.wardrobe(k, x0 + 0.4, U2, (z0 + z1) / 2 + (north ? 2 : -2), 1, 1.6); FURN.desk(k, x1 - 6, U2, north ? z1 - 1.0 : z0 + 1.0, north ? 2 : 0, 1.4, false);
        FURN.dresser(k, cx + 1, U2, north ? z1 - 0.45 : z0 + 0.45, north ? 2 : 0, 1.4); FURN.armchair(k, x1 - 2.4, U2, (z0 + z1) / 2, 3, 0x8a7a6a);
        FURN.ceilingLight(k, x0 + 4, H, (z0 + z1) / 2, 1.2);
        FURN.window(def, x0 + 4, U2 + 1.0, north ? -hd + 0.06 : hd - 0.06, 2.6, 1.6, north ? 0 : Math.PI);
      };
      bedroom(8, -hd, 20, -3, 0x8a9aa8, 0x2f5d8a); bedroom(20, -hd, hw, -3, 0xb8a888, 0x8a3a3a);
      bedroom(8, 0, 20, hd, 0xa8b898, 0x3a6a4a); bedroom(20, 0, hw, hd, 0xd8b8c8, 0xd28cb8, true);
      // upper windows
      for (const [x, z, ry, w] of [[-24, -hd + 0.06, 0, 3.0], [-12, -hd + 0.06, 0, 2.4], [-3, -hd + 0.06, 0, 2.6], [-hw + 0.06, -7.5, Math.PI / 2, 3.0], [-26, hd - 0.06, Math.PI, 2.6], [hw - 0.06, -1.5, -Math.PI / 2, 1.6]]) FURN.window(def, x, U2 + 1.0, z, w, 1.6, ry);
      for (const [x, z] of [[-24, -7.5], [-12, -9], [-26, 7.5], [-14, 7.5], [-3, -6.5], [5, -9]]) FURN.ceilingLight(k, x, H, z, 1.1);
    }
  };
  // the spots: the way out, the hidden lift, the hidden cache; owned, the house's own
  def.spots = [
    { id: 'exit', x: 0, z: hd - 0.7, r: 1.3, label: 'Leave' },
    { id: 'v:lift', x: -12.9, z: -13.4, r: 1.3, label: 'A bookcase that stands proud of the wall' },
    { id: 'v:cache', x: -9.0, y: U, z: 12, r: 1.0, label: 'A panel that doesn’t sit flush' }
  ];
  if (owned) def.spots.push(
    { id: 'laptop', x: 13, z: 5.2, r: 1.3, label: 'Run your empire' },
    { id: 'stash', x: 16.4, z: 13.4, r: 1.3, label: 'Safe · stash & property' },
    { id: 'tv', x: -17.2, z: 7.4, r: 1.5, label: 'Watch the news' },
    { id: 'fridge', x: hw - 1.6, z: -8.6, r: 1.3, label: 'Grab a snack' },
    { id: 'bar', x: -11.8, z: 12.9, r: 1.4, label: 'Mix a drink' },
    { id: 'v:garage', x: hw - 1.0, z: -1.2, r: 1.3, label: 'Down to the garage' },
    { id: 'bed', x: -hw + 4.6, y: U, z: -7.5, r: 1.8, label: 'Sleep & save' },
    { id: 'wardrobe', x: -18.4, y: U, z: 5, r: 1.4, label: 'Wardrobe' },
    { id: 'pool', x: -2.2, y: U, z: -10.2, r: 1.3, label: 'Shoot some pool' }
  );
  else def.spots.push({ id: 'v:buy', x: 13, z: 5.2, r: 1.3, label: '' }); // (the label is set when the house is entered)
  return def;
}

function villaBunkerDef(owned) {
  const W = 52, D = 36, H = 4.4, hw = W / 2, hd = D / 2;
  const def = {
    id: 'villa_bunker', dynamic: true, name: 'The bunker under Villa Valen', w: W, d: D, h: H, seed: 9191, tier: 7,
    exit: { x: 0, z: hd - 2 }, spawn: { x: 0, z: hd - 2.4 }, spawnH: Math.PI, place: null, at: { ...VILLA_INT.bunkerAt }, door: { ...VILLA_DOOR },
    propId: owned ? 'villa' : null, owned, villa: true, noExit: true, noDoor: true,
    build(k, rng) {
      const CON = 0xb8bcc0, CON2 = 0xa8acb0, DARK = 0x2c3036, STEEL = 0x8a9096, GOLD = 0xd4af37, G = H;
      k.room(W, D, H, { floor: 0x3a3d44, wall: CON, wall2: CON2, ceil: 0x55585c, trim: 0x1a1c20, band: [0, 1.0], bandC: 0x2c3036, lights: [6, 4], lightC: 0xe8f0ff });
      k.tiles(W, D, 0x3a3d44, 0x34373e, 2);
      // the spine corridor (z 6..10) with the rooms off it
      iwall(k, 'x', 6, -hw, hw, 0, G, CON2, [[-20, -17.6], [-9, -5], [5, 9], [17.6, 20]]);    // north rooms: mess, operations (wide), lounge
      iwall(k, 'x', 10, -hw, hw, 0, G, CON2, [[-22, -16], [-9, -7], [-2, 2], [7, 9], [18, 20.4]]); // south rooms: vault (glass), plant, lift lobby, med bay, comms
      iwall(k, 'z', -12, -hd, 6, 0, G, CON); iwall(k, 'z', 12, -hd, 6, 0, G, CON);
      iwall(k, 'x', -4, -hw, -12, 0, G, CON2, [[-14.6, -12.6]]); iwall(k, 'x', -4, 12, hw, 0, G, CON2, [[17.6, 20]]); // armoury|mess, bunks|lounge
      for (const x of [-12, -4, 4, 12]) iwall(k, 'z', x, 10, hd, 0, G, CON);
      // ---- the lift lobby: the lift doors, a gold band, the name
      k.box(0, 0, hd - 0.1, 3.0, 2.6, 0.1, STEEL); k.box(0, 0, hd - 0.14, 0.04, 2.6, 0.04, DARK); k.glow(0, 2.75, hd - 0.15, 1.8, 0.14, 0.03, GOLD, 2.2);
      k.glow(-2.4, 1.3, hd - 0.15, 0.2, 0.3, 0.03, 0x8fe39b, 2.0);
      // ---- operations (x -12..12, z -18..6): a wall of screens, the island on a lit table, desks
      for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) k.glow(-10 + i * 4, 1.2 + r * 1.5, -hd + 0.12, 3.6, 1.3, 0.04, [0x2a8cff, 0x30d0a0, 0x1a5aa8][(i + r) % 3], 1.5);
      k.box(0, 0, -7, 9, 0.95, 5.5, 0x30343a, { col: true }); k.glow(0, 0.95, -7, 8.4, 0.03, 5, 0x2ad1ff, 0.9);
      for (const [x, z] of [[-2.6, -8.2], [1.4, -6.4], [3.0, -8.6]]) k.box(x, 0.98, z, 0.6, 0.4, 0.6, 0x9ab4c8);
      for (const x of [-8, -4, 4, 8]) { FURN.desk(k, x, 0, -13.5, 2, 1.6, true, DARK); }
      for (const x of [-6, 6]) FURN.sofa(k, x, 0, 3.6, 2, 2.6, 0x2a2c30);
      // ---- the armoury (x -26..-12, z -18..-4): racks, crates, a bench
      for (let i = 0; i < 4; i++) { k.box(-hw + 0.5, 0, -15 + i * 3, 0.5, 3.0, 2.6, DARK, { col: true }); for (let r = 0; r < 3; r++) k.box(-hw + 0.85, 0.7 + r * 0.8, -15 + i * 3, 0.12, 0.14, 2.2, 0x6a7078); }
      for (let i = 0; i < 3; i++) k.box(-17 + i * 2.2, 0, -16.6, 1.8, 0.9, 1.2, 0x3a4a2a, { col: true });
      k.box(-18, 0, -9, 4, 0.9, 1.2, STEEL, { col: true }); k.glow(-18, 3.0, -9, 2.4, 0.05, 0.4, 0xfff0d8, 2.4);
      // ---- the mess (x -26..-12, z -4..6): a kitchen run, a long table, a fridge
      FURN.kitchenRun(k, -19, 0, -3.65, 0, 8, { upper: true, base: DARK, top: 0xc8ccd0, fridgeC: 0xb8bcc2 });
      FURN.diningSet(k, -19, 0, 2, 0, 10, 0x4a4e54);
      // ---- crew quarters (x 12..26, z -18..-4): bunks
      for (let i = 0; i < 4; i++) { const z = -16.6 + i * 3.2; for (const lv of [0, 1.3]) { k.box(23.5, lv, z, 4.4, 0.4, 1.6, 0x4a4e54, { col: lv === 0 }); k.box(23.5, lv + 0.4, z, 4.2, 0.16, 1.4, [0x2f5d8a, 0x3a6a4a, 0x6a3a3a, 0x5a5a6a][i]); } k.box(25.7, 0, z, 0.1, 2.4, 1.6, 0x4a4e54); }
      for (let i = 0; i < 4; i++) FURN.wardrobe(k, 12.4, 0, -16 + i * 3, 1, 1.2, 0x5a5e64);
      // ---- the lounge and cinema (x 12..26, z -4..6)
      k.box(hw - 0.3, 0.5, 1, 0.2, 2.8, 7, 0x111111); k.glow(hw - 0.42, 0.65, 1, 0.02, 2.5, 6.6, 0x3a5a8a, 1.3);
      FURN.sofa(k, 20, 0, 1, 1, 5, 0x6a1a2a); FURN.sofa(k, 16.6, 0, 1, 1, 5, 0x6a1a2a); FURN.bar(k, 14, 0, -2.6, 0, 3, 3);
      // ---- the cash vault (x -26..-12, z 10..18): a round door, pallets of cash and gold
      // the vault is seen through a wall of steel bars; its door, on a forty-year time lock, is the round one inside
      for (let x = -21.85; x <= -16.1; x += 0.3) k.box(x, 0, 10, 0.07, G, 0.07, STEEL);
      for (const yy of [0.05, 1.2, 2.4, G - 0.2]) k.box(-19, yy, 10, 6, 0.12, 0.14, STEEL);
      k.cols.push({ x0: -22, x1: -16, z0: 9.9, z1: 10.1, y0: 0, y1: G });
      k.box(-25.6, 0.2, 14, 0.3, 2.8, 2.8, STEEL); k.glow(-25.42, 1.6, 14, 0.03, 0.6, 0.6, GOLD, 1.2);
      for (let p = 0; p < 6; p++) { const px = -22.6 + (p % 3) * 3.4, pz = 13.4 + Math.floor(p / 3) * 2.8; k.box(px, 0, pz, 2.2, 0.25, 2.2, 0x7a5a3a, { col: true }); for (let l = 0; l < 3; l++) k.box(px, 0.25 + l * 0.34, pz, 1.9 - l * 0.35, 0.32, 1.9 - l * 0.35, p % 2 ? 0x5d8a4a : GOLD); }
      // ---- the plant room (x -12..-4): the generator, the air plant, pipes
      k.box(-8, 0, 15, 5, 2.2, 2.6, 0x5a6a5a, { col: true }); k.box(-8, 2.2, 15, 1.2, 1.2, 1.2, 0x4a5a4a); k.box(-10.6, 0, 11.4, 1.6, 2.6, 1.6, STEEL, { col: true });
      for (let i = 0; i < 3; i++) k.box(-8, 3.4 + i * 0.25, 13, 7.6, 0.18, 0.18, [0xd23a2a, 0x2a6fd6, 0xffd84d][i]);
      // ---- the med bay (x 4..12): two beds, a cabinet
      for (const x of [6, 10]) FURN.bed(k, x, 0, hd - 1.4, 2, 1.0, 2.1, 0xe8eef6, 0x8a9096);
      k.box(11.6, 0, 13.6, 0.5, 1.8, 3, 0xe8eef6, { col: true }); k.glow(11.32, 2.2, 13.6, 0.03, 0.5, 0.5, 0xd23a2a, 1.6);
      // ---- comms (x 12..26): server racks blinking
      for (let i = 0; i < 5; i++) { k.box(15 + i * 2.2, 0, 16.6, 1.2, 2.4, 1.2, 0x1a1c20, { col: true }); for (let r = 0; r < 4; r++) k.glow(15 + i * 2.2, 0.5 + r * 0.5, 15.98, 0.8, 0.04, 0.02, [0x30d0a0, 0x2a8cff][(i + r) % 2], 1.6); }
      FURN.desk(k, 23.5, 0, 12.4, 0, 2.0, true, DARK);
      // corridor lights
      for (let x = -22; x <= 22; x += 6) FURN.ceilingLight(k, x, H, 8, 1.2);
    }
  };
  def.spots = [
    { id: 'v:up', x: 0, z: hd - 1.2, r: 1.5, label: 'Lift · up to the house' },
    { id: 'v:arms', x: -18, z: -7.6, r: 1.5, label: 'The armoury bench · patch up and strap on a vest' },
    { id: 'fridge', x: -15.5, z: -2.6, r: 1.3, label: 'Grab something from the mess' },
    { id: 'v:ops', x: 0, z: -3.6, r: 1.8, label: 'The operations table' },
    { id: 'v:vault', x: -19, z: 9.4, r: 1.3, label: 'The vault door' }
  ];
  if (owned) def.spots.push({ id: 'bed', x: 21, z: -16.6, r: 1.6, label: 'Sleep & save' }, { id: 'tv', x: 18.2, z: 1, r: 1.6, label: 'Watch the news' });
  return def;
}

// the villa's comings and goings: in at the front door, the lift both ways, the garage, the cache
const VillaValen = {
  CACHE: 20000000,
  owned(g) { return !!(g.uw && g.uw.props.owned('villa')); },
  taken(g) { return !!(g.save.secrets && g.save.secrets.villacache); },
  // the front door prompt (from the street, on foot)
  doorAction(g) {
    const p = g.player; if (p.state !== 'foot' || p.interior || !g.world.isle || !g.world.isle.villa) return null;
    if (Math.hypot(p.pos.x - VILLA_DOOR.x, p.pos.z - VILLA_DOOR.z) > 2.4 || Math.abs(p.pos.y - g.world.isle.villa.y) > 3) return null;
    return { label: 'Enter Villa Valen', act: () => this.enterHouse(g, 'door') };
  },
  // into the house: at the front door, out of the lift (from the bunker) or up the garage stairs
  enterHouse(g, from) {
    const I = g.content.interiors, own = this.owned(g);
    if (I.defs.villa && (I.defs.villa.owned !== own || I.defs.villa.cacheTaken !== this.taken(g))) { if (I.cur === I.defs.villa) return; I.dispose(I.defs.villa); }
    const d0 = villaInteriorDef(own); d0.cacheTaken = this.taken(g);
    const def = I.addDynamic(d0);
    const cache = def.spots.find(s => s.id === 'v:cache'); if (cache && this.taken(g)) cache.label = '';
    const buy = def.spots.find(s => s.id === 'v:buy');
    if (buy && g.uw && PROP_BY_ID.villa) buy.label = `Villa Valen · for sale ${fmtMoney(g.uw.props.price(PROP_BY_ID.villa))}`;
    if (from === 'lift') { def.spawn = { x: -12.9, z: -12.2 }; def.spawnH = Math.PI; }
    else if (from === 'garage') { def.spawn = { x: VILLA_INT.W / 2 - 2.2, z: -1.2 }; def.spawnH = -Math.PI / 2; }
    else { def.spawn = null; def.spawnH = Math.PI; }
    const go = () => I.enter(def.id, true);
    if (from === 'door') I.enter(def.id); else g.content.ride(go);
  },
  enterBunker(g) {
    const I = g.content.interiors, def = I.addDynamic(villaBunkerDef(this.owned(g)));
    g.content.ride(() => { I.enter(def.id, true); g.ui.toast('The bookcase swings back into place above you. Nobody upstairs would ever know.'); });
  },
  takeCache(g) {
    if (this.taken(g)) return;
    g.audio.play('cash');
    g.ui.toast('Behind the panel: duffel bags, banded and vacuum-sealed, and a bank transfer slip already signed. It is all yours, and all of it is clean.');
    g.content.secret('villacache');
    const I = g.content.interiors, def = I.cur; if (def && def.villa) { def.cacheTaken = true; const s = def.spots.find(x => x.id === 'v:cache'); if (s) s.label = ''; }
  },
  spot(g, id) {
    const p = g.player, own = this.owned(g);
    switch (id) {
      case 'lift': this.enterBunker(g); break;
      case 'up': this.enterHouse(g, 'lift'); break;
      case 'cache': this.takeCache(g); break;
      case 'buy': if (g.uw) g.uw.ui.openProp('villa'); break;
      case 'garage': { const vs = g.vspaces && g.vspaces.byProp('villa'); if (vs && own) g.vspaces.enter(vs, null); break; }
      case 'arms':
        p.health = p.maxHealth; p.vest = Math.max(p.vest, VEST_MAX); g.audio.play('pickup');
        g.ui.toast('Patched up and strapped into a fresh vest from the rack.'); break;
      case 'ops':
        if (own) g.uw.ui.open('overview');
        else g.ui.toast('The whole island on one table: every road, every cop shop, every warehouse. Whoever built this planned to run the place.');
        g.audio.play('ui'); break;
      case 'vault':
        g.audio.play('deny');
        g.ui.toast(this.taken(g) ? 'The vault’s time lock has been set for the next forty years. The house already gave you what it had.' : 'A time lock, forty years on the dial. Whatever is worth having in this house is somewhere easier to reach.');
        break;
    }
  }
};
