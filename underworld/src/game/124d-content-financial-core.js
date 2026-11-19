/* =====================================================================
   [CONTENT] THE FINANCIAL CORE, REBUILT (owner, 2026-11-19: the original city redeveloped, the core included;
   CITY_REBUILD.md §5.3)
   Twenty-four lattice cells (4..9, 4..7) are one superblock. A downtown keeps some straight streets, and the core's
   are where its landmarks need them:
   - Central Blvd, the one straight avenue, on the old Central Blvd's line and keeping its name: Valen Tower's door, Valen Prestige
     Motors' showroom and the Central Parkade's ramp all open onto it; its ends swing in to meet the edge streets;
   - Exchange Circus, a roundabout on the boulevard east of the tower, with Exchange Street north and south of it;
   - Glass Mile, a diagonal avenue from the north edge down to the boulevard;
   - Assay Lane, Ledger Row, Bourse Lane, Mint Street and Counting House Lane between the towers; Tower Mews, a short
     close to the tower's garage door;
   - Exchange Square, a plaza with a fountain south of the boulevard.
   Kept where they stood, as the city builds them: Valen Tower, the Central Parkade, Valen Prestige Motors, the
   Glasshouse depot, the Police Impound, Fuel & Go Eastgate and St. Alda Hospital. The Central Bank moves onto the
   boulevard, the Commercial Bank onto Counting House Lane (a Downtown cell), each a deep hall with its service yard.
   ===================================================================== */
REBUILDS.core = {
  name: 'Financial District',
  streets: [
    /* 0 */ { name: 'Exchange Circus', id: 'exchange', ring: 13, at: [612, 480], w: 9 },
    /* 1 */ { name: 'Central Blvd', w: 11, high: true, ctrl: [[325.6, 454], [345, 470], [372, 480], [440, 480], [520, 480], [584, 480]], join: 0, joinNear: [599, 480] },
    /* 2 */ { name: 'Central Blvd', w: 11, high: true, fork: 0, near: [625, 480], ctrl: [[642, 480], [700, 480], [760, 480], [780, 470], [794.4, 456]] },
    /* 3 */ { name: 'Exchange Street', w: 9, high: true, fork: 0, near: [612, 467], ctrl: [[612, 450], [608, 420], [600, 400], [598, 370], [600, 340], [606, 325.6]] },
    /* 4 */ { name: 'Exchange Street', w: 9, high: true, fork: 0, near: [612, 493], ctrl: [[612, 512], [614, 550], [616, 590], [614, 634.4]] },
    /* 5 */ { name: 'Glass Mile', w: 10, high: true, fork: 1, near: [462, 480], ctrl: [[452, 460], [434, 430], [414, 398], [392, 366], [372, 325.6]] },
    /* 6 */ { name: 'Tower Mews', w: 7, circle: 6, fork: 1, near: [564, 480], ctrl: [[564, 466], [564, 450]] },
    /* 7 */ { name: 'Bourse Lane', w: 8, fork: 1, near: [380, 480], ctrl: [[384, 500], [386, 530], [392, 560], [402, 584], [418, 606], [436, 634.4]] },
    /* 8 */ { name: 'Mint Street', w: 8, fork: 7, near: [408, 594], ctrl: [[440, 600], [480, 606], [520, 608], [570, 604]], join: 4, joinNear: [615, 600] },
    /* 9 */ { name: 'Ledger Row', w: 8, fork: 3, near: [600, 400], ctrl: [[630, 400], [660, 399], [700, 400], [730, 404], [760, 414], [794.4, 430]] },
    /* 10 */ { name: 'Counting House Lane', w: 8, fork: 2, near: [700, 480], ctrl: [[714, 500], [740, 514], [768, 522], [794.4, 528]] },
    /* 11 */ { name: 'Assay Lane', w: 8, fork: 5, near: [414, 398], ctrl: [[440, 390], [480, 386], [520, 388], [560, 391]], join: 3, joinNear: [600, 396] }
  ],
  // the banks on the boulevard: deep buildings with their service yards behind (the kit's bank rule)
  // (the Commercial Bank keeps to Downtown's cells, on Counting House Lane: the three banks stand in three districts)
  // (the hotel and the jeweller on straight stretches, each in its own district's cells: where their old corners are now
  // the boulevard's curve and Bourse Lane's bend, a building cannot stand flush behind the door)
  addr: { '6,6,2,28': [520, 494], '8,7,3,52': [752, 540], '4,5,2,56': [420, 470], '5,7,3,16': [450, 594] },
  keep: [
    { bx: 6, bz: 5, cell: true }, { bx: 5, bz: 6, cell: true }, { bx: 8, bz: 5, cell: true }, { bx: 9, bz: 4, cell: true },
    // (St. Alda's rooftop helipad, the air ambulance's: its approaches kept clear, nothing over 22 m within 70 m)
    { bx: 4, bz: 7, cell: true }, { bx: 9, bz: 7, cell: true }, { bx: 8, bz: 7, cell: true, low: { r: 70, h: 22 } }
  ],
  squares: [{ x: 520, z: 578, r: 15, ring: 9.5, name: 'Exchange Square', id: 'exchangesq', icon: '⛲', sub: 'The core’s plaza, off Central Blvd', secret: [6, -6] }],
  // towers and offices: big footprints, tall
  styles: [STYLE.GLASS, STYLE.GLASS, STYLE.OFFICE, STYLE.DECO],
  sizes: [[30, 26], [26, 24], [22, 20], [18, 18], [14, 16], [12, 12]],
  heights: [24, 96],
  roof: 'mid',
  gap: 0.6,
  secondAt: 26,
  sidewalks: { trees: 0.5, benches: true, news: true, park: 0.1 },
  secrets: [[340, 340], [780, 620]]
};
