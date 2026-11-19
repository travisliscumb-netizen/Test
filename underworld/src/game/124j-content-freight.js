/* =====================================================================
   [CONTENT] THE FREIGHT PARK, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5.8)
   Six lattice cells (7..9, 10..11; the precinct stands at its own offset, 021) are one superblock of sheds and yards:
   - Freight Way, the works road across it from the street by the bonded stores to the east edge, along the Cannery
     Row warehouse's back where the street ran;
   - Bonded Lane and Gantry Road up to the north edge, Ironside Lane down to the south edge.
   Kept where it stood: the Cannery Row warehouse (7,10), its gate on the north edge street. The Velvet bonded store
   (6,10) and the tow yard south of it keep their streets: the warehouses' back doors open onto the street between them.
   ===================================================================== */
REBUILDS.freight = {
  name: 'Warehouse District',
  streets: [
    /* 0 */ { name: 'Freight Way', w: 11, ctrl: [[565.6, 900], [580, 892], [600, 888], [640, 890], [700, 896], [740, 908], [770, 916], [794.4, 920]] },
    /* 1 */ { name: 'Bonded Lane', w: 9, fork: 0, near: [640, 890], ctrl: [[652, 868], [658, 840], [660, 805.6]] },
    /* 2 */ { name: 'Gantry Road', w: 9, fork: 0, near: [740, 908], ctrl: [[748, 880], [750, 850], [742, 805.6]] },
    /* 3 */ { name: 'Ironside Lane', w: 8, fork: 0, near: [620, 889], ctrl: [[616, 915], [612, 954.4]] }
  ],
  addr: {},
  keep: [{ bx: 7, bz: 10, cell: true }],
  styles: [STYLE.WARE, STYLE.IND, STYLE.WARE, STYLE.IND, STYLE.BRICK],
  sizes: [[30, 20], [26, 18], [22, 16], [18, 14], [14, 12]],
  heights: [7, 13],
  roof: 'ind',
  gap: 1.5,
  secondAt: 24,
  sidewalks: { trees: 0.1, park: 0 },
  secrets: [[790, 950]]
};
