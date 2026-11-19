# CITY REBUILD: Phase 1 of the 2026-11-19 brief (the plan, the record and the handoff)

The owner's brief (2026-11-19, "Complete city redevelopment, world overhaul and gameplay interaction upgrade") makes
Phase 1 the mandatory first priority: every remaining square-grid neighbourhood of the original city is rebuilt
from the ground up, with organic streets, smaller and varied blocks, parks, believable junctions and selective,
functional roundabouts. The old city and the new districts are to read as one city. Phases 2–10 (the graphics
overhaul, the interaction wheel, doors and break-ins, the weapon and equipment wheels, the tactical pause, the mobile
HUD, input, the final regression) wait until Phase 1 has passed its gate and been reviewed.

Phase 1 may span two sessions. This file is the handoff between them. Read §0 first.

## 0. Start here (status)
- **Session A (2026-11-19). Done so far:**
  - The checkpoint of the earlier overhaul work: island roundabouts, architecture, DRS and tile streaming (ISLAND.md
    §10).
  - The audit (§2), the plan, and the before screenshots.
  - The rebuild kit (124). The Old Quarter was ported onto it, and its fingerprint was unchanged.
  - **The Old Quarter rebuilt over its whole precinct** (column 3 and row 7).
  - **Linden Hills rebuilt.**
  - **The financial core rebuilt**, with Exchange Circus, the city's first roundabout.
  - Suite `rebuild` covers every rebuilt district.
- **Owner ruling (2026-11-19).** The financial core is redeveloped too (DECISIONS.md).
- **Next action:** Session B: Uptown, Greenway and Heights, the port strip, the Nightlife Strip and stadium cells,
  the freight park (§5). These precincts stand at their own offsets (021), so check the kit's lattice-to-world
  handling (`wox`/`woz` and the address offsets) on the first of them.

## 1. What "done" means (the gate, from the brief)
- No obvious large repetitive square grid left anywhere in the city. Straight streets are allowed where a real city
  would have them, such as arterials, the waterfront and edge streets between districts.
- Every district is rebuilt on its own streets in the newer districts' style. Old and new read as one city, with no
  visible seam.
- The road network is logical: connected, no accidental dead ends (cul-de-sacs are fine where they belong), no
  needless 90° turns.
  - Roundabouts go where they earn their place (district entrances, major junctions), and traffic, the GPS and
    taxis all use them.
- Nothing is lost:
  - Every business, property, home, garage, shop, service, mission place, race, NPC place, dealer, gang HQ and
    landmark still exists and works.
  - Saves load. A relocated door keeps its identity and ownership.
- Delivered with:
  - Before/after screenshots and a summary per area.
  - The new network explained.
  - Connectivity/GPS, traffic AI and save-compatibility results.
  - A performance comparison and the remaining issues.

## 2. The audit (2026-11-19, on `0beff6a`)
The city is a 12 × 12 lattice of 80 m cells (`P = 80`). Since S1 the lattice is the address system:
`CityLayout` (021) places ten precincts round the island. 31 cells are already off the grid:
- the Old Quarter superblock (9);
- the estate (2), Greenway Park (6), the stadium (6), the Container Terminal (4) and Cedar Fields (4).

**113 grid cells remain:**

| Precinct | Cells | Grid left | Notes |
|---|---|---|---|
| core (financial) | 4..9 × 4..7 | 24 | Valen Tower 6,5; Central Parkade 5,6; Valen Prestige Motors 8,5; Glasshouse depot 9,4; Police Impound 4,7; Fuel & Go Eastgate 9,7; banks d (8,7) and c (6,6); hotel, jeweller, law firm, restaurants; skyline, harbour_condo |
| port | 10..11 × 0..11 | 20 | Saltworks Plant 10,1; Fuel & Go 10,4; Saltworks Used Autos 10,5; Okafor Motor Works 10,7; Harbor Row Depot 11,8; Tidewater shed 11,9; Docklock garage 10,9; Pier Yard and Saltworks Yard closures; races saltloop, industrial, quayside |
| uptown | 6..9 × 0..3 | 16 | Meridian Motors 7,1; Bellcourt warehouse 9,1; car wash 9,2; ten businesses |
| linden | 0..3 × 8..10 | 12 | pocket park 3,9; market_apt; launderette, pizza and others; Wet Track |
| greenway | 2..5 × 0..1, 5 × 0..3 | 10 | Vipers stash 5,0; Fuel & Go Northgate 5,1; canal_loft, loft |
| strip | 4..5 × 8..11 | 8 | Police Impound overflow 4,8; Valen Royale 5,9; Fuel & Go Southbank 5,10; club, arcade, motel |
| freight | 6..9 × 10..11 | 8 | Velvet bonded store 6,10; Cannery Row warehouse 7,10 |
| oldquarter | column 3, row 7 | 7 | Fuel & Go Westside 3,7; security firm; bedsit |
| heights | 0..1 × 1..3 | 6 | Crestmoor houses |
| stadium | 6,8 and 6,9 | 2 | Harborview Mall 6,8 |

What depends on the lattice, found by the audit:
- **Addresses** `(block, side, along)`, resolved by `sidewalkSpot` (390): PROPS (businesses, safehouses, garages),
  HOME_LADDER, SPOTS, HQS and BANKS. A door on a street that no longer runs is re-found on the nearest new street.
  This is the Old Quarter's mechanism (`oldQuarterSpot`); it generalises.
- **Whole-cell landmarks** (LANDMARK_BLOCKS, 100; 110 places): gas stations, the tower, the parkade, the mall, the
  plant, the garage. Dealers, gang warehouses and the impounds are their own cell generators. Each draws its
  entrances toward the lattice streets.
- **Races** (RACES, 370): six run on lattice crossings (`nodes`). A rebuilt district closes those streets, so each
  race moves to a `route` (waypoints through the road graph, `routeRacePath`), as the Curved Roads pass did.
- **Lane-mode traffic, kerb parking, peds, police, signals and lamps** (`sideOpen`/`segOpen`): these already follow
  RoadNet's closures (the Old Quarter proved it). Curved links carry path-mode traffic, the GPS and taxis.
- **Stunt jumps** (unique surfaces): their run-up, flight and landing are kept clear (the Old Quarter's `lanes` rule).
- **Turfs, zones and district names**: these stay by cell. The address system is unchanged, so gangs, police
  presence and traffic mix are unchanged.

## 3. Architecture (decided)
- **Superblocks, generalised.** Each district's grid cells become one superblock (or several, where a landmark or
  the district's shape needs it). The lattice inside closes, and the district's streets are hand-shaped spline
  roads registered as links. The Old Quarter showed that traffic, the GPS, taxis, police, peds and parking all work
  on this.
  - The 80 m lattice stays the address system and the backbone where it still runs: the edge streets between
    districts and the arterials.
  - Rejected again, for the same reasons as on 2026-11-18: warping the lattice itself, or redrawing only the map.
- **One kit, data per district** (§4). The Old Quarter's generator (124) becomes a data-driven kit. Each district is
  data plus the rare bespoke piece: its streets, squares and parks, kept landmark plots, roundabouts and address
  fixes. One `rebuiltSpot` replaces `oldQuarterSpot` for every district.
- **Long straight edge streets are broken too.** Where both sides of an edge street are rebuilt districts at the
  same offset, segments may close (CITY_CLOSED) and be replaced by curved links, so the superblock edges don't
  leave a coarse grid. Arterials and waterfront roads stay straight on purpose.
- **Roundabouts in the city** use the island machinery (023, 135, 280), generalised to rings on city links. They
  are placed only at district entrances and major junctions.
- **Saves:** the save keys are ids (props, homes, garages, venues) and do not change. Positions are derived from
  addresses at load. No `SAVE_VERSION` bump. A save made in a building that moved puts the player at its new door
  (the spawn uses the address).

## 4. The rebuild kit (`124` generalised; file `124-content-district-rebuild.js`)
A district definition holds:
- `id`, `cells`, `zone`;
- `streets`: spline control points, widths, forks onto other streets, parking sides and a hierarchy (avenue,
  street, lane);
- `squares` and `parks`;
- `keep`: landmark cells regenerated in place, with the side their entrance needs open;
- `addr`: address fixes;
- `roundabouts`;
- `styles`: the frontage mix and heights by street class;
- `extras`: a bespoke hook.

The kit provides:
- streets and pavements;
- frontage along every street (shops on the high streets, varied depth and height), a second row and courtyards;
- gardens and yards, lamps, kerb cars, street names and signs;
- address relocation, stunt-lane clearance, map places and distribution into member blocks.

The Old Quarter is ported first, and its output must be unchanged (building count, positions, address spots), with
a fingerprint check.

## 5. The districts (design, in order)
Session A: the kit, the Old Quarter's remainder, Linden Hills, the financial core.
Session B: Uptown, Greenway and Heights, the port strip, the Nightlife Strip and the stadium's cells, the freight park.
Then the races, the city roundabouts, verification, screenshots, documentation and the gate.
### 5.1 The Old Quarter (precinct oldquarter, cells 0..3 × 4..7; 124b)
- **Streets.**
  - Saint Ivo Street is the high street, north edge to south edge.
  - Market Street runs in two halves: west to the shore, east to the core.
  - Bell Lane, Cooper's Walk and Chapel Lane.
  - Garage Row, which now continues east to the core.
  - Wick Lane, south to Linden.
  - Lantern Lane and Hawthorn Bend, new in row 7. They take the names of the old lanes in those cells.
- **Kept:**
  - The Quarter Garage (2,5).
  - The Westside Fuel & Go (3,7), facing its south street.
  - The police station (3,5, SPECIAL.police), as the city builds it. It has a north forecourt from its door to
    Market Street and a south yard (its respawn point) to Garage Row.
- **Moved:** the Wet Track is now a route through Saint Ivo Street and Linden Parade, round the Old Quarter and
  Linden.
- **Density:** 477 buildings, against 354 before.

### 5.2 Linden Hills (precinct linden, cells 0..3 × 8..10; 124c)
- **Streets.**
  - Linden Parade is the high street (shops).
  - Kestrel Curve is the long loop, with Millrace Lane, Willow Bend and Tanner's Row off it. Tanner's Row meets
    Cooper's Lane across the avenue.
  - Cul-de-sacs, each with a turning circle: Mason's Walk, Ropewalk, Linden Close and Orchard Close.
- **Houses:** detached houses, semi-detached pairs and low blocks of flats (the city's own house generator: drives,
  garages, yards). The property ladder buys from them. Houses also stand round each turning circle.
- **Kept:** the Pocket Park (3,9).
- **The starter safehouse** is the house nearest its old cell's middle, at its old address.
- **Moved to the Parade:** Tony's Pizzeria, Bubbles Wash & Fold and the Linden Chemist (their corners became
  junctions). The Market Street Apartment moved just north of Willow Bend's mouth.

### 5.3 The financial core (precinct core, cells 4..9 × 4..7; 124d)
- **Streets.**
  - Central Blvd is the one straight avenue, on the old Central Blvd's line. Valen Tower's door, the
    Prestige showroom's front and the Parkade's ramp open onto it.
  - Exchange Circus is a roundabout on the boulevard (612, 480; radius 13). It is the city's first: one-way and
    anticlockwise, with give way on entry, using the island's traffic machinery, generalised. Exchange Street runs
    north and south of it.
  - Glass Mile is a diagonal from the north edge to the boulevard.
  - The smaller streets: Assay Lane, Ledger Row, Bourse Lane, Mint Street and Counting House Lane, plus Tower
    Mews, a close to the tower's garage.
- **Squares:** Exchange Square, a plaza with a fountain.
- **Kept as the city builds them:** Valen Tower, the Central Parkade, Valen Prestige Motors, the Glasshouse depot,
  the Police Impound, Fuel & Go Eastgate and St. Alda Hospital.
- **Moved to the boulevard:** the Commercial Bank and the Central Bank (deep buildings with service yards).
- **Frontage:** glass and office towers on big footprints, 24–96 m tall, with a second row 26 m back.
- **Races re-laid as routes:** Midnight Run, Pink Slip and Industrial Rumble (its corner was on a core street that
  closed).

### Kit fixes found on the way (all in 124)
- An address's building is set square to the axis its front faces, so its corner never swallows the door on a
  slanted street.
- No stoop is built under an address door. The game nudges doors off anything solid (450), and the step pushed the
  Old Quarter Flop's door into its wall.
- Every address door's way in is reserved before anything is built, so no neighbour can stand on it.
- A street end must meet its edge street at least 14 m from a crossing (`Links.attach`), or the street is dropped.
  The suite catches this ("every street is a link").
- Kit houses go into the cell they stand in, and a garage may use the whole district (`_house`'s `bounds`, 120).
  Before this fix, only houses in the anchor cell could have garages.
- `require` guarantees the homes the property ladder buys by type, garage and zone.

## 6. Checklist
- [x] Checkpoint of the earlier overhaul work (roundabouts on the island, architecture, DRS)
- [x] Audit (§2)
- [x] Before screenshots (`releases/p1-before/`, JPEG)
- [x] The kit; the Old Quarter ported, fingerprint unchanged
- [x] Old Quarter remainder (column 3, row 7)
- [x] Linden Hills
- [x] Financial core
- [ ] Uptown
- [ ] Greenway and Heights
- [ ] Port strip
- [ ] Nightlife Strip, stadium cells, freight park
- [ ] Races re-laid on routes; city roundabouts
- [ ] Gate: connectivity/GPS, traffic, saves, perf, screenshots, full regression, report

## 7. Risks
- Landmark cells inside a rebuilt district need a street past their entrance. Where the kit can't give one, the
  landmark stays on an edge street that still runs.
- Lane-mode traffic thins where the lattice closes, and path-mode traffic carries the rebuilt districts. Watch the
  density and the spawns: `trySpawn` falls back to links.
- Races: changing `nodes` to `route` changes their lines. Times, rewards and ids are kept.
- Performance: more buildings and links. Measure against the baseline at each district (perf suite, the
  renderer's counts).
- The full regression is long (2 h+). Run per-district suites and a full run at the gate.

### Known failures that predate Phase 1 (they fail the same way on `0beff6a`)
- `business`: "every storefront business wears a name board" is missing `diner_s` (the Route 9 Diner, port cell
  11,5). Its facade is not found behind its door. The port's rebuild (Session B) gives every address its own
  building behind its door, which should close this. Re-check it then.
- `roads`: "merge back onto the lattice" can fail on a recycled vehicle. The test reads a pooled car that was
  despawned and reused, and sees `ai` null.

## 8. Before screenshots
`releases/p1-before/`: `<precinct>_aerial.jpg` and `<precinct>_top.jpg` for all ten precincts, plus `city_top.jpg`. They are
taken from `0beff6a` (the committed build) at 13:00 in clear weather, on the High preset.
