/* =====================================================================
   [CONTENT] THE PORT STRIP, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5.6)
   The port strip (10..11, 0..11) keeps its landmarks (the Saltworks Plant, the Harbor Road Fuel & Go, Saltworks Used
   Autos, the chop shop, Okafor Motor Works, Harbor Row Depot, the Tidewater shed), the Saltmarsh estate's and Cannery
   Cut's curved streets (122) and its two paved yards (Saltworks Yard, Pier Yard: 020's closures). Harbor Row (11, 5..7),
   beside Pier Yard, is its last run of grid rebuilt: Harbor Row from the strip's street (the landmarks' side) down to
   the depot's edge street, Anchor Street out to the Sound Parkway at the waterfront; sheds, a chandler's, rooms over
   the bars.
   (The three cells at the strip's north end stay as they are: a superblock over 10..11, 0 would close the street north
   of Saltworks Yard and leave the yard's west end a lone corner, which the organic downtown's rules forbid; 11,1 is the
   yard's other side.)
   ===================================================================== */
const PORT_STYLE = { styles: [STYLE.IND, STYLE.WARE, STYLE.IND, STYLE.BRICK], sizes: [[26, 18], [22, 16], [18, 14], [16, 12], [12, 12]], heights: [7, 14], roof: 'ind', gap: 1.2, secondAt: 22 };
REBUILDS.harborrow = Object.assign({
  name: 'Industrial Belt',
  streets: [
    /* 0 */ { name: 'Harbor Row', w: 10, ctrl: [[885.6, 432], [904, 450], [920, 480], [930, 512], [928, 548], [916, 580], [904, 610], [900, 634.4]] },
    /* 1 */ { name: 'Anchor Street', w: 9, fork: 0, near: [930, 512], ctrl: [[944, 518], [954.4, 520]] }
  ],
  addr: {},
  sidewalks: { trees: 0.15, park: 0 },
  secrets: [[950, 630]]
}, PORT_STYLE);
