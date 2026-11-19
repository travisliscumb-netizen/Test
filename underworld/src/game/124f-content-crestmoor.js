/* =====================================================================
   [CONTENT] CRESTMOOR HEIGHTS, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5.5)
   Six lattice cells (0..1, 1..3; the Heights precinct, at its own offset, 021) are one superblock below the
   Crestmoor estate: the grid of square plots gives way to the lanes a hillside of big houses has.
   - Crestmoor Drive, from the Coast Highway at the west edge winding down to the south edge;
   - Hillcrest Lane off it, east to Greenway's edge street;
   - Ashby Close, Sorrel Close and Rowan Close, cul-de-sacs round their turning circles.
   The houses are the city's own big ones (120: gated drives, double and triple garages), the homes the property
   ladder buys in Crestmoor among them; the edge streets inside the district are lined with them too.
   ===================================================================== */
REBUILDS.crestmoor = {
  name: 'Crestmoor Heights',
  streets: [
    /* 0 */ { name: 'Crestmoor Drive', w: 8, res: true, ctrl: [[5.6, 120], [30, 124], [60, 134], [90, 150], [112, 176], [124, 206], [126, 240], [118, 272], [110, 314.4]] },
    /* 1 */ { name: 'Hillcrest Lane', w: 7, res: true, fork: 0, near: [90, 150], ctrl: [[112, 134], [134, 114], [154.4, 106]] },
    /* 2 */ { name: 'Ashby Close', w: 7, res: true, circle: 9, fork: 0, near: [60, 134], ctrl: [[50, 158], [40, 180], [34, 198]] },
    /* 3 */ { name: 'Rowan Close', w: 7, res: true, circle: 9, fork: 0, near: [126, 240], ctrl: [[100, 250], [74, 262], [52, 276]] },
    /* 4 */ { name: 'Sorrel Close', w: 7, res: true, circle: 8, fork: 0, near: [112, 176], ctrl: [[92, 190], [76, 206]] }
  ],
  // Greenhouse Gus (the green supplier, 1,1 east side): his pitch would be the mouth of Hillcrest Lane; he stands on
  // the lane itself
  addr: { '1,1,1,30': [128, 129] },
  // the big houses (120's rich mix) on every street and along the edge streets inside it
  houses: true, rich: true, gap: 1.5, secondRow: false,
  // the homes the property ladder buys in Crestmoor (500: the upscale doubles, the luxury triples)
  require: [
    { spec: { type: 'large', w: 18, d: 12, garage: 'triple' }, n: 4, zone: 'u' },
    { spec: { type: 'large', w: 16, d: 11, garage: 'double' }, n: 5, zone: 'u' },
    { spec: { type: 'house', w: 14, d: 10, garage: 'double' }, n: 1, zone: 'u' }
  ],
  // the gatehouse at the Crestmoor Drive entrance, off the Coast Highway: a little lodge with a pitched roof beside the
  // drive, as the old money keeps one (the first free spot back from the pavement, either side, near the gate)
  extras(world, b, sb, rng, kit) {
    const spots = [];
    for (const dx of [8, 12, 16, 20, 26, 32]) spots.push([dx, 106.5], [dx, 128.6], [dx, 104], [dx, 131]);
    for (const [x0, z0] of spots) {
      const q = [x0, z0, x0 + 6, z0 + 5];
      if (!kit.free(...q)) continue;
      const r = world._bld(b, q[0], q[1], q[2], q[3], 3.4, STYLE.HOUSE, 0xd8cfbf, 3.4, 3, { exactH: true, roof: 'gable', roofColor: 0x3d4247 });
      kit.placed.push(r);
      // (its name board on the side facing the drive)
      const north = z0 < 120;
      b.signs.push({ text: 'CRESTMOOR HEIGHTS', x: (q[0] + q[2]) / 2, y: CURB_H + 2.6, z: north ? q[3] + 0.05 : q[1] - 0.05, ry: north ? 0 : Math.PI, w: 4.6, h: 0.5, bg: '#2a2f35', fg: '#e8d28a' });
      return;
    }
  },
  sidewalks: { trees: 0.85, park: 0.2 },
  styles: [STYLE.HOUSE, STYLE.HOUSE, STYLE.BRICK],
  heights: [6.5, 10],
  secrets: [[20, 300], [150, 200]]
};
