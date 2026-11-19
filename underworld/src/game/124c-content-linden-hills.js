/* =====================================================================
   [CONTENT] LINDEN HILLS, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5)
   Twelve lattice cells (0..3, 8..10) are one superblock: the grid of square suburban blocks gives way to
   streets that wander as a suburb's do. Its street names are the ones the blocks' own lanes had:
   - Linden Parade, the local high street (shops and the launderette, the pizzeria, the pharmacy), winding
     from the Old Quarter's edge to Cedar Fields;
   - Kestrel Curve, the long loop east of it, with Millrace Lane up to the north edge, Willow Bend out to the
     east and Tanner's Row on to Cooper's Lane across the avenue (the strip's lane, 122);
   - Mason's Walk off the shore road, Ropewalk and Orchard Close off the Parade, Linden Close off Kestrel Curve:
     cul-de-sacs, each round its turning circle.
   Detached houses line the residential streets (the city's own houses, 120: a drive, a garage or a carport,
   a back yard); the Pocket Park stands where it stood. The starter safehouse is the house nearest its cell's
   middle (the kit, 124). The cells stay the address system: Linden Hills is the district it was.
   ===================================================================== */
REBUILDS.linden = {
  name: 'Linden Hills',
  streets: [
    { name: 'Linden Parade', w: 9, park: [1, -1], high: true, ctrl: [[100, 645.6], [96, 668], [84, 690], [72, 714], [70, 742], [72, 772], [78, 800], [96, 826], [116, 848], [124, 874.4]] },
    { name: 'Kestrel Curve', w: 7, res: true, fork: 0, near: [84, 690], ctrl: [[110, 688], [140, 692], [170, 702], [196, 718], [214, 744], [220, 772], [214, 800], [204, 822], [198, 846], [200, 874.4]] },
    { name: 'Millrace Lane', w: 7, res: true, fork: 1, near: [170, 702], ctrl: [[184, 684], [198, 664], [210, 645.6]] },
    { name: 'Willow Bend', w: 7, res: true, fork: 1, near: [214, 744], ctrl: [[232, 722], [256, 708], [284, 700], [314.4, 694]] },
    { name: 'Tanner’s Row', w: 7, res: true, fork: 1, near: [206, 824], ctrl: [[232, 832], [262, 838], [290, 842], [314.4, 842]] },
    { name: 'Mason’s Walk', w: 7, res: true, circle: 9, ctrl: [[5.6, 690], [24, 694], [40, 690]] },
    { name: 'Ropewalk', w: 7, res: true, circle: 9, fork: 0, near: [72, 772], ctrl: [[52, 780], [36, 796]] },
    { name: 'Linden Close', w: 7, res: true, circle: 9, fork: 1, near: [140, 692], ctrl: [[142, 716], [138, 742], [130, 764]] },
    { name: 'Orchard Close', w: 7, res: true, circle: 9, fork: 0, near: [96, 826], ctrl: [[120, 812], [146, 804], [166, 800]] }
  ],
  // Tony's Pizzeria and Bubbles Wash & Fold: their own corners are junctions now; they stand on the Parade
  // (and the Linden Chemist beside them; the Market Street Apartment's corner is Willow Bend's mouth: it stands
  // just north of it)
  addr: { '2,9,1,16': [88, 728], '0,9,2,48': [58, 736], '2,9,3,28': [88, 756], '3,8,1,48': [302, 672] },
  // the Pocket Park, where it stood (the city's own park block, 090)
  keep: [{ bx: 3, bz: 9, cell: true }],
  // (the suburb's own mix: houses, semi-detached pairs, a few low blocks of flats; the property ladder buys from it)
  houses: true, mix: { house: 0.82, semi: 0.08, apartment: 0.1 }, gap: 3, secondRow: false,
  // the homes the property ladder buys here (500: bungalows, family houses, the double-garage houses, the flats)
  require: [
    { spec: { type: 'apartment', w: 22, d: 12, garage: 'street', flat: true }, n: 3 },
    { spec: { type: 'semi', w: 14.4, d: 9, garage: 'street' }, n: 2 },
    { spec: { type: 'bungalow', w: 12, d: 9, garage: 'carport' }, n: 3 },
    { spec: { type: 'bungalow', w: 12, d: 9, garage: 'street' }, n: 2 },
    { spec: { type: 'bungalow', w: 11, d: 8.5, garage: 'single' }, n: 5, zone: 'l' },
    { spec: { type: 'house', w: 9, d: 8.5, garage: 'carport' }, n: 3, zone: 'l' },
    { spec: { type: 'house', w: 10, d: 9, garage: 'single' }, n: 8, zone: 'l' },
    { spec: { type: 'house', w: 11, d: 9, garage: 'double' }, n: 4, zone: 'l' }
  ],
  sidewalks: { trees: 0.75, park: 0.3 },
  styles: [STYLE.HOUSE, STYLE.HOUSE, STYLE.BRICK, STYLE.APT],
  heights: [6.5, 11],
  secrets: [[30, 860], [290, 660]]
};
