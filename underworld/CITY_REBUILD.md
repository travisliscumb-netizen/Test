# CITY REBUILD: Phase 1 of the 2026-11-19 brief (the plan, the record and the handoff)

The owner's brief (2026-11-19, "Complete city redevelopment, world overhaul and gameplay interaction upgrade") makes
Phase 1 the mandatory first priority: every remaining square-grid neighbourhood of the original city is rebuilt
from the ground up, with organic streets, smaller and varied blocks, parks, believable junctions and selective,
functional roundabouts. The old city and the new districts are to read as one city. Phases 2–10 (the graphics
overhaul, the interaction wheel, doors and break-ins, the weapon and equipment wheels, the tactical pause, the mobile
HUD, input, the final regression) wait until Phase 1 has passed its gate and been reviewed.

Phase 1 may span two sessions. This file is the handoff between them. Read §0 first.

## 0. Start here (status)
- **Session A (2026-11-19):**
  - The rebuild kit (124).
  - The Old Quarter (whole precinct), Linden Hills and the financial core, with Exchange Circus, the first city
    roundabout.
  - The island roundabouts.
- **Session B (2026-11-19):**
  - Uptown, with Meridian Circus.
  - Crestmoor Heights, Potter's Lane, Northgate and Parkside.
  - The port's Harbor Row.
  - The Nightlife Strip (north and south).
  - The freight park.
  - Kit fixes for offset precincts, street lighting, houses on edge streets and stunt jumps (§5.4–5.8 and the kit
    fixes).
  - Pre-existing failures fixed on the way: the Route 9 Diner's name board, and the turf corners in offset precincts.
- **What is left of the grid, and why** (all deliberate, §5.6–5.8):
  - The port's north end (10,0, 11,0, 11,1) and 11,4, beside its yards.
  - The mall's cell and the one south of it (6,8, 6,9).
  - The Velvet bonded store and the tow yard (6,10, 6,11).
- **The Phase 1 gate has been run (§9). Phase 1 stops here for the owner's visual review.** Phases 2–10 wait for it,
  along with the decisions in §9.6.

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

### 5.4 Uptown (precinct uptown, cells 6..9 × 0..3; 124e)
- **Streets.** Three island roads reach it. Meridian Way carries Lakeside Avenue (north) down to Sound Parkway
  (south), swinging round Meridian Motors: its showroom drive and its delivery bay open onto the avenue, as they did
  onto the lattice. Meridian Circus (642, 212; radius 13) is the roundabout where Sound Road comes in (Sound
  Street) and Bellcourt Street leaves for the east. Halden Street, Copper Lane, Wren Street and Plover Lane fill the rest.
- **Square:** Meridian Square, south of the circus.
- **Kept:** Meridian Motors (7,1), the Industrial Belt works (9,0), the Bellcourt warehouse (9,1; its gate now on
  the east edge street, the only side still open) and the building site with its dirt jump (9,2).
- **Density:** 225 buildings (115 before).

### 5.5 Crestmoor Heights, Potter's Lane, Northgate and Parkside (precincts heights and greenway; 124f, 124g)
- **Crestmoor** (0..1 × 1..3): Crestmoor Drive from the Coast Highway (a crossroads at the west edge) down to the
  south edge; Hillcrest Lane; Ashby, Sorrel and Rowan Close. Big houses with gated drives on every street and on
  the edge streets, and a gatehouse at the drive's entrance.
- **Potter's Lane** (2 × 0..1): the Crestmoor cells north of the park, one winding lane of big houses.
- **Northgate** (3..5 × 0..1): Northgate Road (the high street), Weavers Row, Mill Street, Northgate Mews and
  Northgate Square. The Vipers stash yard (5,0) and Fuel & Go Northgate (5,1; its forecourt on the street to the
  south) are kept.
- **Parkside** (5 × 2..3): Parkside Crescent from the Coast Highway (a crossroads at the east edge) to the south
  edge, and Lamplighter Walk.
- **The property ladder:** Crestmoor's homes are all there (`require`: the luxury triples, the upscale doubles,
  the house with a double garage). The homes and property suites count 46 buyable homes, as before.

### 5.6 The port strip (precinct port; 124h)
- **Harbor Row** (11 × 5..7, beside Pier Yard): Harbor Row from the landmarks' street down to the depot's edge
  street, and Anchor Street out to Sound Parkway at the waterfront. Sheds and works buildings.
- **Already off the grid:** the Saltmarsh estate (10..11 × 2..3) and Cannery Cut (10,8–10,9), the Curved Roads
  pass's streets.
- **Not rebuilt:**
  - The three cells at the strip's north end (10,0, 11,0, 11,1). A superblock over 10..11 × 0 would close the
    street north of Saltworks Yard, leaving the yard's west end a lone corner, which the organic downtown's rules
    forbid. 11,1 is the yard's other side.
  - 11,4, on Pier Yard's north side.
- **Landmarks:** all kept. Both races on the port's lattice (quayside, saltloop) run only on edge streets that stay
  open.

### 5.7 The Nightlife Strip (precinct strip; 124i)
- **Strip North** (4..5 × 8..9): Neon Row through Club Neon's cell, and Starlite Way from the Blackgate Bridge's
  crossroads. The impound's overflow yard and the Valen Royale (its doors on the street to the south) are kept.
- **Strip South** (4..5 × 10..11): Cooper's Lane (the Curved Roads pass's lane, carried on) runs along Fuel & Go
  Southbank's forecourt where the street ran, plus Lark Lane.
- **Not rebuilt:** Harborview Mall (6,8) and the cell south of it (6,9). The mall's car park opens onto the street
  between them.

### 5.8 The freight park (precinct freight; 124j)
- **Freight** (7..9 × 10..11): Freight Way along the Cannery Row warehouse's back, where the street ran, plus
  Bonded Lane, Gantry Road and Ironside Lane. The Cannery Row warehouse is kept.
- **Not rebuilt:** the Velvet bonded store (6,10) and the tow yard south of it (6,11). The street between the two
  yards (x = 560) carries both warehouses' back doors, and nothing narrower than it fits there.

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
- Session B: the precincts that stand at their own offsets (021).
  - The world gets its own copies of the cached street lines, rings and turning circles. Before this, the bake
    (090) moved the cache (`rebuiltSpot` then read world metres as lattice metres) and missed the roundabout's
    centre, so no traffic went round Meridian Circus.
  - The bake now reads where every entry stands before it moves anything.
  - `rebuiltSpot` asks the road net by site (`CityLayout.siteI/J`), so a door is where it was built for, at
    generation and in play. The turf corners (450) had the same bug.
- Street lighting:
  - The kit lit its streets with park lamps. The city's street lamps now stand on both pavements, staggered about as
    close as the lattice's, each with a pool of light at night (`lampPools`, 178).
  - Benches and news boxes stand on the shopping streets.
  - Uptown had 55 lamps and now has the lattice's density again.
- Houses facing an edge street:
  - They were refused, because the drive check only knew the kit's own streets.
  - The drive is now paved to the lattice carriageway ahead (`driveAhead`).
- Stunt jumps:
  - The city sets its industrial kicker jumps and the building site's dirt jump after it is built (100 `_postGen`),
    at fixed spots in their cells. In a rebuilt cell those spots were on the new streets, or behind buildings with
    no run-up. The core's dirt jump (7,6) had no run-up since Session A.
  - The kit now chooses each jump's spot before it builds: the ramp off every street, its run-up and landing kept
    clear like a stunt lane. The jump keeps its id, so saves keep it.
  - All 14 unique jumps are in place; the ramps suite drives each one at three speeds.
- Street names that would repeat another street's (Kiln Lane, Gull Lane) were renamed (Potter's Lane, Plover
  Lane).

## 6. Checklist
- [x] Checkpoint of the earlier overhaul work (roundabouts on the island, architecture, DRS)
- [x] Audit (§2)
- [x] Before screenshots (`releases/p1-before/`, JPEG)
- [x] The kit; the Old Quarter ported, fingerprint unchanged
- [x] Old Quarter remainder (column 3, row 7)
- [x] Linden Hills
- [x] Financial core
- [x] Uptown (Meridian Circus, the second city roundabout)
- [x] Greenway and Heights (Crestmoor, Potter's Lane, Northgate, Parkside)
- [x] Port strip (Harbor Row; the rest already off the grid or kept, §5.6)
- [x] Nightlife Strip (north and south), freight park; the stadium's cells are the stadium and the mall (§5.7)
- [x] Races re-laid on routes where their streets closed; city roundabouts (Exchange Circus, Meridian Circus)
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
- `business`: "every storefront business wears a name board" was missing `diner_s` (the Route 9 Diner, port cell
  11,5). **Fixed in Session B:** Harbor Row's rebuild gives the diner its own building behind its door.
- `roads`: "merge back onto the lattice" can fail on a recycled vehicle. The test reads a pooled car that was
  despawned and reused, and sees `ai` null.

## 8. Before screenshots
`releases/p1-before/`: `<precinct>_aerial.jpg` and `<precinct>_top.jpg` for all ten precincts, plus `city_top.jpg`. They are
taken from `0beff6a` (the committed build) at 13:00 in clear weather, on the High preset.

## 9. The Phase 1 gate (2026-11-19)
### 9.1 Full regression
- 86 suites, 2,242 checks, 0 failing.
- The run started on `aeaf52d`. Suites that failed were fixed and rerun on the later builds:
  - `da2b896` adds the save fix;
  - then the generation speed-up, whose world fingerprint is identical.
- Every first-run failure was one of two kinds:
  - **A timeout under load.** Twenty suites shared a software-GL machine. Each passed alone, and the slow-generation
    fix (§9.4) removed the boot timeouts.
  - **A test standing on a lattice street the rebuild removed.** These tests were moved onto streets that still run,
    with no tolerance changed:
    - shooting (Central Blvd), core (reversing on the edge street; step-in against a building's wall);
    - island (Kestrel St, as Ash St is gone);
    - survival (every fight on the same open street).
- The two failures known from before Phase 1 are both gone. The Route 9 Diner has its building, and the roads
  suite's recycled-car case did not recur.

### 9.2 Connectivity, the GPS and traffic
- **The road graph:** 382 nodes and 505 edges, all reachable from one node (`rebuild`, `roadnet`).
- **The `rebuild` suite (105 checks) covers every rebuilt district:**
  - every street is a link with both ends on a road;
  - every door is on a street, with its building right behind it;
  - the GPS finds every door;
  - every respawn is clear;
  - every precinct keeps its density;
  - traffic turns into each district's streets, keeps to the road surface (within 0.5 m) and comes back out.
- **The city roundabouts (Exchange Circus, Meridian Circus):** one way, round the right way in the GPS, with traffic
  going round, nobody the wrong way, no deadlock and no overlaps.
- **The `roadnet` suite (42 checks):** the graph builds in 23 ms, a route takes 0.07 ms, and taxis, police and races
  run on the curved streets.

### 9.3 Saves
- The `savecompat` suite uses a real save made on the build before Phase 1, with 26 properties bought in every
  rebuilt district. On this build:
  - every property is still owned;
  - every owned door is on a street the GPS reaches;
  - a player saved on an old street that a building now covers comes back on the nearest pavement.
- No `SAVE_VERSION` bump. Positions come from addresses; kept cars already move to a clear kerb (505).

### 9.4 Performance (pre-Phase 1 `0beff6a` against this build; 1280×720, High preset, 13:00, software GL)
- **Cold boot:** 20.7 s before, 22.0 s now. It was 40.3 s until the kit's lot clearance was indexed by street segment;
  the fingerprint is identical.
- **Buildings:** 1,063 before, 1,702 now. Props: 8,096 before, 6,208 now (fewer lattice kerbs).
- **JS heap:** 169 MB before, 179 MB now.
- **Aerial and street views of every precinct:** draw calls and triangles are similar or lower (core street level:
  826k → 617k triangles). The median render time is unchanged within the noise of software GL. The table is in the
  gate report.

### 9.5 Screenshots
- `releases/p1-before/` and `releases/p1-after/`: every precinct (aerial and top), the port in two halves, and the
  whole city.

### 9.6 Remaining issues and the owner's decisions
- **The port strip still reads as a grid from above.** Its middle street and cross streets run between seven kept
  landmarks, two paved yards (Saltworks Yard, Pier Yard) and the Saltmarsh curves. Only Harbor Row was rebuilt.
  Going further means absorbing or moving a yard (the organic rules need two), re-laying the saltloop race on a route
  and rerouting the landmarks' access.
  - **Decision:** keep the dock grid (ports are often rectilinear), or redesign the port.
- **Cells kept on the grid, each for a stated reason** (§5.6–5.8): the mall's cell and the one south of it; the
  Velvet store and the tow yard.
- **The island pass's city-edge frontage** (128, 2026-11-18) is a row of mid-rise blocks facing every edge street
  that borders land. Around Uptown, which stands alone, it reads as a ring of detached buildings.
  - **Decision:** keep it, or drop or rethink it in Phase 2's environment pass.
- **The traffic light floor** in the placement suite is now 160, down from 200. Lights stand only at lattice
  crossroads, which the districts replace with T-junctions and roundabouts. The rebuilt districts have no signals
  of their own, because path traffic would not obey them.
