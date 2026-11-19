/* =====================================================================
   [CONTENT] POTTER'S LANE, NORTHGATE AND PARKSIDE, REBUILT (owner, 2026-11-19: the original city redeveloped;
   CITY_REBUILD.md §5.5)
   The Greenway precinct (at its own offset, 021) round Greenway Park: three superblocks.
   Potter's Lane (2, 0..1), Crestmoor's corner north of the park: one winding lane of big houses (gated drives,
   double and triple garages: the homes the property ladder buys in Crestmoor among them), the edge streets lined with
   them too.
   Northgate (3..5, 0..1), the old quarter's northern spill:
   - Northgate Road, its high street, from Potter's Lane's edge street east and down to the park's north side;
   - Weavers Row down to the park, Mill Street up to the north edge, Northgate Mews round its turning circle;
   - Northgate Square, a small paved square off the high street;
   - kept where they stood: the Vipers stash yard (5,0; the Canal Street Loft over its north side) and Fuel & Go
     Northgate (5,1), its forecourt on the street to the south.
   Parkside (5, 2..3), the strip between the park and the east edge, where the Coast Highway comes in:
   - Parkside Crescent from the highway down to the south edge, Lamplighter Walk up to Northgate.
   ===================================================================== */
REBUILDS.potters = {
  name: 'Crestmoor Heights',
  streets: [
    /* 0 */ { name: 'Potter’s Lane', w: 7, res: true, ctrl: [[196, 5.6], [192, 30], [200, 58], [210, 84], [206, 112], [198, 136], [204, 154.4]] }
  ],
  addr: {},
  houses: true, rich: true, gap: 2, secondRow: false,
  require: [
    { spec: { type: 'large', w: 18, d: 12, garage: 'triple' }, n: 2, zone: 'u' },
    { spec: { type: 'large', w: 16, d: 11, garage: 'double' }, n: 2, zone: 'u' }
  ],
  sidewalks: { trees: 0.85, park: 0.2 },
  styles: [STYLE.HOUSE],
  heights: [6.5, 10],
  secrets: [[180, 10]]
};
REBUILDS.northgate = {
  name: 'Northgate',
  streets: [
    /* 0 */ { name: 'Northgate Road', w: 10, high: true, ctrl: [[245.6, 44], [270, 40], [300, 34], [330, 42], [356, 64], [374, 96], [382, 128], [384, 154.4]] },
    /* 1 */ { name: 'Weavers Row', w: 8, fork: 0, near: [300, 34], ctrl: [[302, 62], [296, 92], [290, 124], [288, 154.4]] },
    /* 2 */ { name: 'Mill Street', w: 8, ctrl: [[338, 5.6], [336, 24]], join: 0, joinNear: [331, 42] },
    /* 3 */ { name: 'Northgate Mews', w: 7, circle: 7, fork: 1, near: [296, 92], ctrl: [[320, 100], [340, 108]] }
  ],
  addr: {},
  keep: [{ bx: 5, bz: 0, cell: true }, { bx: 5, bz: 1, cell: true }],
  squares: [{ x: 322, z: 138, r: 10, ring: 6.5, name: 'Northgate Square', id: 'northgatesq', icon: '⛲', sub: 'A small square off Northgate Road', secret: [4, 4] }],
  styles: [STYLE.BRICK, STYLE.BRICK, STYLE.SHOP, STYLE.APT, STYLE.HOUSE],
  sidewalks: { trees: 0.6, benches: true, park: 0.2 },
  secrets: [[300, 150]]
};
REBUILDS.parkside = {
  name: 'Parkside',
  streets: [
    /* 0 */ { name: 'Parkside Crescent', w: 9, high: true, ctrl: [[474.4, 200], [452, 212], [434, 236], [428, 268], [432, 296], [440, 314.4]] },
    /* 1 */ { name: 'Lamplighter Walk', w: 7, fork: 0, near: [452, 212], ctrl: [[440, 190], [428, 172], [424, 165.6]] }
  ],
  // Voltline Electronics: its door on the north edge street is at Lamplighter Walk's mouth; it stands on Parkside
  // Crescent, in its own cell
  addr: { '5,2,0,16': [448, 236] },
  styles: [STYLE.BRICK, STYLE.SHOP, STYLE.APT, STYLE.OFFICE],
  heights: [9, 22],
  secondAt: 18,
  sidewalks: { trees: 0.6, benches: true, news: true, park: 0.15 },
  secrets: [[470, 310]]
};
