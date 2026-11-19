/* =====================================================================
   [CONTENT] THE OLD QUARTER, REBUILT (owner, 2026-11-18: the first district of the downtown redeveloped; since
   2026-11-19 one definition of the district rebuild kit, 124)
   Sixteen lattice cells (0..3, 4..7: the whole precinct since 2026-11-19, when the grid's last column and row went)
   are one superblock with no grid inside it. Its streets are curved through-roads:
   - Saint Ivo Street, the high street, winding from the north edge to the south;
   - Market Street, crossing it in two staggered halves (west to the shore road, east to Downtown);
   - Bell Lane, Cooper's Walk, Chapel Lane, Garage Row, Wick Lane, Lantern Lane and Hawthorn Bend, the old lanes off them
     (the names the blocks' own lanes had, 122);
     Market Street and Garage Row run on east to the core, Saint Ivo Street, Chapel Lane and Wick Lane south to
     Linden Hills;
   - Saint Ivo Square beside the high street, with its fountain.
   Every street is lined with terraces (brick, shopfronts, flats; two to four storeys) stepping along
   its curve, and so are the four edge streets; behind the frontage, yards and gardens. The Quarter
   Garage stands where it stood, Garage Row running past the foot of its ramp; so does the Westside Fuel & Go,
   on the street to the south it has always faced.
   ===================================================================== */
// the streets, in lattice metres
const OQ_STREETS = [
  { name: 'Saint Ivo Street', w: 11.5, park: [1, -1], high: true, ctrl: [[100, 325.6], [104, 345], [96, 368], [84, 392], [86, 418], [102, 440], [118, 462], [122, 488], [112, 512], [104, 534], [110, 560], [122, 586], [126, 610], [120, 634.4]] },
  { name: 'Market Street', w: 8, high: true, fork: 0, near: [86, 422], ctrl: [[64, 430], [44, 427], [24, 431], [5.6, 436]] },
  { name: 'Market Street', w: 8, high: true, fork: 0, near: [92, 378], ctrl: [[120, 372], [150, 366], [180, 372], [210, 380], [240, 386], [268, 390], [292, 384], [314.4, 378]] },
  { name: 'Bell Lane', w: 7, fork: 2, near: [182, 372], ctrl: [[186, 356], [190, 340], [196, 325.6]] },
  { name: 'Cooper’s Walk', w: 7, fork: 0, near: [119, 470], ctrl: [[92, 482], [62, 492], [36, 506], [5.6, 518]] },
  { name: 'Chapel Lane', w: 7, fork: 4, near: [56, 494], ctrl: [[50, 512], [40, 532], [30, 560], [26, 596], [36, 634.4]] },
  { name: 'Garage Row', w: 8, fork: 0, near: [121, 494], ctrl: [[150, 486], [180, 482], [206, 481], [222, 487], [246, 494], [272, 495], [296, 495], [314.4, 495]] },
  { name: 'Wick Lane', w: 7, fork: 0, near: [106, 530], ctrl: [[130, 530], [160, 524], [190, 528], [214, 538], [226, 560], [230, 592], [222, 634.4]] },
  { name: 'Lantern Lane', w: 7, fork: 0, near: [123, 590], ctrl: [[146, 592], [170, 600], [190, 616], [196, 634.4]] },
  { name: 'Hawthorn Bend', w: 7, fork: 5, near: [28, 580], ctrl: [[44, 588], [58, 604], [64, 634.4]] }
];
// Saint Ivo Square: a paved round beside the high street, its fountain in the middle
const OQ_SQUARE = { x: 58, z: 462, r: 11, ring: 7.2, secret: [5, 5], name: 'Saint Ivo Square', icon: '⛲', id: 'oldquarter', sub: 'The Old Quarter’s square, on Saint Ivo Street' };
REBUILDS.oldquarter = {
  name: 'Old Quarter',
  streets: OQ_STREETS,
  // the Neighborhood Bank (353: 2,5 north side, the Quarter Garage's front) is a deep building with a staff door on
  // its back
  // (since 2026-11-19 on Market Street's west half, north side, where the street runs straight enough for its deep hall
  // to stand flush behind its door)
  addr: { '2,5,0,44': [44, 418] },
  // the Quarter Garage stands where it stood, Garage Row running past the foot of its ramp
  // and so do the Westside Fuel & Go, facing the street to the south, and the police station (SPECIAL.police): its
  // front door faces north, across a forecourt to Market Street; its yard (where an arrest is released) south to
  // Garage Row
  keep: [{ bx: 2, bz: 5, gen: '_genGarage', landmark: '2,5' }, { bx: 3, bz: 7, gen: '_genGasStation', landmark: '3,7' }, { bx: 3, bz: 5, cell: true, forecourts: [[248, 392, 312, 405], [248, 475, 312, 486]] }],
  squares: [OQ_SQUARE],
  secrets: [[30, 360], [200, 540]]
};
