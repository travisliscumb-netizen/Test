/* =====================================================================
   [CONTENT] UPTOWN, REBUILT (owner, 2026-11-19: the original city redeveloped; CITY_REBUILD.md §5.4)
   Sixteen lattice cells (6..9, 0..3; the precinct stands out on the island at its own offset, 021) are one
   superblock. Three island roads reach it: Lakeside Avenue from the north, Sound Road from the west and Sound Parkway
   from the south. Its streets carry them in:
   - Meridian Way, the avenue from Lakeside Avenue down to Sound Parkway, swinging round Meridian Motors (its showroom
     drive and its delivery bay open onto it, as they did onto the lattice streets);
   - Meridian Circus, the roundabout where Sound Road comes in (Sound Street) and Bellcourt Street leaves for the east;
   - Halden Street down the east side, Copper Lane and Wren Street on the west, Plover Lane on to the south edge;
   - Meridian Square, a plaza south of the circus.
   Kept where they stood, as the city builds them: Meridian Motors (7,1), the Industrial Belt works (9,0), the
   Bellcourt warehouse (9,1) and the building site with its dirt jump (9,2), along the east edge street.
   ===================================================================== */
REBUILDS.uptown = {
  name: 'Uptown',
  streets: [
    /* 0 */ { name: 'Meridian Circus', id: 'meridian', ring: 13, at: [642, 212], w: 9 },
    /* 1 */ { name: 'Meridian Way', w: 11, high: true, ctrl: [[600, 5.6], [598, 26], [586, 48], [568, 68], [557, 92], [555, 120], [558, 144], [570, 158], [600, 162], [622, 166], [636, 180]], join: 0, joinNear: [642, 199] },
    /* 2 */ { name: 'Meridian Way', w: 11, high: true, fork: 0, near: [642, 225], ctrl: [[642, 244], [634, 270], [616, 294], [600, 314.4]] },
    /* 3 */ { name: 'Sound Street', w: 10, high: true, fork: 0, near: [629, 212], ctrl: [[610, 210], [580, 206], [548, 201], [516, 199], [485.6, 200]] },
    /* 4 */ { name: 'Bellcourt Street', w: 9, fork: 0, near: [655, 212], ctrl: [[672, 216], [700, 226], [728, 246], [756, 266], [794.4, 282]] },
    /* 5 */ { name: 'Halden Street', w: 8, ctrl: [[680, 5.6], [684, 40], [690, 80], [694, 120], [698, 160], [700, 200]], join: 4, joinNear: [700, 226] },
    /* 6 */ { name: 'Copper Lane', w: 8, ctrl: [[520, 5.6], [516, 36], [507, 70], [510, 110], [518, 150], [528, 180]], join: 3, joinNear: [530, 200] },
    /* 7 */ { name: 'Wren Street', w: 8, fork: 3, near: [548, 201], ctrl: [[546, 230], [537, 260], [529, 290], [526, 314.4]] },
    /* 8 */ { name: 'Plover Lane', w: 7, fork: 4, near: [756, 266], ctrl: [[751, 290], [746, 314.4]] }
  ],
  // Velvet Hair Studio: its north-side door is at the mouth of Meridian Way, where no building can stand behind it; it
  // moves a little down the avenue, in its own cell
  addr: { '7,0,0,32': [608, 40] },
  // the landmarks, as the city builds them, along the east edge street and round the dealer's lot
  keep: [{ bx: 7, bz: 1, cell: true }, { bx: 9, bz: 0, cell: true }, { bx: 9, bz: 1, cell: true }, { bx: 9, bz: 2, cell: true }],
  squares: [{ x: 586, z: 258, r: 14, ring: 9, name: 'Meridian Square', id: 'meridiansq', icon: '⛲', sub: 'Uptown’s plaza, off Meridian Circus', secret: [5, -5] }],
  // shops, offices and flats: Uptown is the downtown's busier, lower half
  styles: [STYLE.SHOP, STYLE.BRICK, STYLE.OFFICE, STYLE.DECO, STYLE.APT, STYLE.OFFICE],
  sizes: [[22, 18], [18, 16], [16, 14], [14, 14], [12, 12], [10, 12]],
  heights: [9, 42],
  roof: 'mid',
  gap: 0.6,
  secondAt: 20,
  sidewalks: { trees: 0.55, benches: true, news: true, park: 0.15 },
  secrets: [[500, 300], [700, 20]]
};
