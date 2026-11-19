/* =====================================================================
   [CONTENT] THE NIGHTLIFE STRIP, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5.7)
   The Strip (4..5, 8..11; the precinct stands at its own offset, 021) is two superblocks round its landmarks:
   - Strip North (4..5, 8..9): Neon Row through Club Neon's cell from the north edge to the stadium's edge street;
     Starlite Way from the Blackgate Bridge's crossroads down past the Starlite Motel. Kept where they stood: the
     impound's overflow yard (4,8) and the Valen Royale (5,9), its doors on the street to the south;
   - Strip South (4..5, 10..11): Cooper's Lane (the Curved Roads pass's lane, 122, carried on) from the west edge along
     the Southbank Fuel & Go's forecourt, where the street ran, out to the east edge; Lark Lane down to the south edge.
     Fuel & Go Southbank (5,10) is kept.
   Harborview Mall (6,8) and the cell south of it keep their streets: the mall's car park opens onto the street between
   them.
   ===================================================================== */
const STRIP_STYLE = { styles: [STYLE.SHOP, STYLE.SHOP, STYLE.BRICK, STYLE.APT, STYLE.DECO], heights: [8, 20], gap: 0.4, secondAt: 18 };
REBUILDS.stripn = Object.assign({
  name: 'Nightlife Strip',
  streets: [
    /* 0 */ { name: 'Neon Row', w: 10, high: true, ctrl: [[430, 645.6], [434, 668], [446, 688], [462, 700], [474.4, 704]] },
    /* 1 */ { name: 'Starlite Way', w: 9, high: true, ctrl: [[325.6, 760], [344, 764], [362, 774], [372, 788], [376, 794.4]] }
  ],
  addr: {},
  keep: [{ bx: 4, bz: 8, cell: true }, { bx: 5, bz: 9, cell: true }],
  sidewalks: { trees: 0.3, benches: true, news: true, park: 0.1 },
  secrets: [[470, 650]]
}, STRIP_STYLE);
REBUILDS.southbank = Object.assign({
  name: 'Nightlife Strip',
  streets: [
    /* 0 */ { name: 'Cooper’s Lane', w: 8, high: true, ctrl: [[325.6, 842], [348, 856], [372, 868], [398, 877], [424, 882], [452, 882], [474.4, 896]] },
    /* 1 */ { name: 'Lark Lane', w: 7, fork: 0, near: [372, 868], ctrl: [[368, 898], [366, 928], [370, 954.4]] }
  ],
  addr: {},
  keep: [{ bx: 5, bz: 10, cell: true }],
  sidewalks: { trees: 0.3, benches: true, news: true, park: 0.1 },
  secrets: [[330, 950]]
}, STRIP_STYLE);
