# CITY SPREAD — the city into the island (the plan, the record and the handoff)

> **SUPERSEDED BY THE OWNER, 2026-11-15 (§10).** Usage ran short, so the owner switched from true relocation to
> building round the grid: the 12 × 12 city stays where it is as old downtown, and new districts on curving streets
> fill the island round it. §10 is the live state. §0–§9 remain the plan if relocation is ever resumed; S1 (the
> layout layer, `021`) is built and harmless either way.


The owner's directive (2026-11-15, after playing Operation Blackgate): the city must stop being a square that floats
in the middle of the island. Spread it into the island so the whole map reads as one real coastal city. **Keep every
working gameplay system and relocate it; do not redraw it. No placeholders: every stage leaves a properly playable
game.** The owner was shown two ways to do it (true relocation, or new neighbourhoods built round a fixed grid) and
ruled for **true relocation**, knowing it is several sessions of work and that the first is groundwork.

This file is written so that anyone can continue the work cold: a new session, or another model. §0 says where to
start; §4 is the stage list with what is done; §5 is the checklist of every place the code still assumes a square.

## 0. Start here
- Repo `travisliscumb-netizen/Test`, folder `underworld/`, branch **`claude/epic-galileo-m47k4d`** (the island build;
  the owner named it for this work). Read `CLAUDE.md` (rules), then this file, then `ISLAND.md` (the island).
- Build: `node underworld/tools/build.mjs` (never edit `index.html` by hand; `--check` proves it matches `src/`).
- Prove nothing moved: `node underworld/tools/world-print.mjs /tmp/now.json && node underworld/tools/world-print.mjs
  --cmp underworld/docs/city-spread/world-print-classic.json /tmp/now.json` must print `IDENTICAL` for any change that
  is not meant to move the world (18 s). §6.
- The layout's own suite: `node underworld/tests/layout.mjs` (Node only, under a second).
- Then the suites a change touches, then the regression runner (`TESTING.md`). Two cores here: a suite takes 1–10
  minutes, the full regression several hours at `CONC=2`.
- **Next action: §4, stage S2.** Work the checklist in §5 from the top; each row says how to convert it.

## 1. Why this is not "move the pins"
The city is a 12 × 12 lattice of 80 m blocks (`020`: `P`, `N`, `CITY = 960`), and the lattice is the game's address
system, not a set of things placed on a map. Measured on the source at `c4abcc2`:

| What assumes the square | Count | Where |
|---|---|---|
| world point → lattice cell (`Math.floor(x / P)` …) | 66 | 20 files |
| lattice index → world metres (`i * P`) | 171 | 30 files |
| the lattice's bounds (`N`, `N - 1`, `<= N`) | 134 | 27 files |
| the square's extent (`CITY`) | 137 | 27 files |
| block lookups (`world.block`, `bz * N + bx`) | 42 | 14 files |
| zone / district / turf tables | 95 | 30 files |
| `RoadNet` (which lattice streets exist) | 37 | 12 files |
| rasters fixed to the square (`(p + 48) / 1056`) | 16 | 4 files |
| **total** | **741** | **55 of 104 source files** |

Besides: the city's ground is **one plane with one shader** that paints every lattice street procedurally from
`floor(p / 80.0)` and a 16 × 16 road texture (`060` lines 352–603, `170` lines 21–24); the local-road and AO rasters
cover exactly −48…1008 m; gang turfs are a fixed 6 × 6 grid of 2 × 2-block territories read by 15 systems; 29 of the
74 test suites assert lattice positions; saves hold world positions. Operation Blackgate left the lattice alone for
these reasons and said so (`ISLAND.md` §2, §7).

## 2. The architecture (decided; do not reopen without a reason that is written here)
**The lattice stays the city's address system. Where a block stands becomes data.**

1. **Two spaces.** *Lattice space* (L): cell `(lx, lz)` in 0…11, the space every authored table speaks
   (`DISTRICT_MAP`, `ZONE_MAP`, `SUPERBLOCKS`, `SPECIAL`, turfs, places, missions, `CURVED_STREETS`) and every block
   generator builds in. *World space* (W): metres on the island; what the simulation, physics, renderer and saves
   speak.
2. **Precincts.** The lattice is cut into rectangles of whole cells. A precinct moves as one rigid piece to its own
   place on the island: `W = L + (ox, oz) × 80 m`, **offsets in whole cells**. No rotation, ever: every collider is an
   axis-aligned box, and a rotated district would mean rebuilding every building, which is the redraw the owner ruled
   out. A district is irregular by its outline, the coast, the curved streets it already has and the roads between
   precincts, not by turning its grid.
3. **Why whole cells.** The island keeps a single 80 m grid, so every piece of arithmetic done on a world point
   (the nearest street line, a lane's offset, a kerb, a lamp, the ground shader's `floor(p / 80.0)`) stays valid
   everywhere without being touched. Of the 741 references, the 171 `i * P` and most of the 66 `x / P` are therefore
   **already correct**; what changes is the *tables* (which must learn that world cell `(I, J)` is lattice cell
   `(I − ox, J − oz)` of some precinct, or of none) and the *bounds* (`0…N` becomes "is a city block standing here").
4. **Frames.** A precinct's frame is its cells, the streets round them and the 18 m strip outside those streets
   (`EDGE_MARGIN`): the part of the world that is "in the city" because of it. Frames never overlap. A lattice
   street two parted precincts shared is built once for each (their own edge street), so every precinct is complete
   on its own.
5. **Generate in the lattice, then bake.** The world generator keeps building the city exactly as it does today, in
   lattice space, with the same seeds and the same position-keyed noise, so every building, prop and interior is
   bit-for-bit what it was. A final step moves each precinct's blocks (and the world's own lists) to where they stand.
   Generating at the new place instead was rejected: hashes and noise keyed on position would give different
   buildings, which is a redraw.
6. **Rendering.** One ground plane per precinct with a uniform `uOff` (its offset in metres); the shader subtracts it
   before every texture lookup, so the road texture, the local-road raster and the AO map stay in lattice space,
   unchanged, shared by all precincts.
7. **One owner.** `021-content-city-layout.js` (`CityLayout`) owns the precinct table and both directions of the map.
   Nothing else may compare a world coordinate against `0`, `CITY` or `N` to decide what is city.

The rules a layout must keep (enforced at boot by `CityLayout.check`, proven by suite `layout`): every cell in exactly
one precinct; cuts on even lines only (a 2 × 2 turf moves whole); a superblock inside one precinct; precincts at
different offsets at least one empty cell apart; precincts at the same offset may abut (lattice neighbours that did
not move relative to each other, which is how a non-rectangular group stays together).

`CityLayout` in brief: `use(id)`, `check(list)`, `at(x, z, m)` (the precinct whose frame holds a world point, or
null), `near(x, z)`, `cellAt(x, z)` / `cell(I, J)` (lattice cell index or −1), `lx(p, x)` / `lz(p, z)` (the lattice
column / row, clamped to the precinct's own cells as the old `clamp(…, 0, N − 1)` did), `latX` / `latZ`, `worldX` /
`worldZ`, `nodeAt(I, J)`, `precinctOf`, `siteI` / `siteJ`, `describe()`. Layouts live in `CITY_LAYOUTS`; `classic` is
the city as built (one precinct, offset 0, lattice and world the same numbers).

## 3. What the finished thing is
- The financial core stays on the island's waist; its flanks leave, so Valen Bay and Valen Sound cut into the old
  square and the seawall follows the water instead of a ruler.
- The other districts stand where a coastal city would put them, each on level low ground, each joined by real roads
  (highway, coast road, bridge), each with its turfs, businesses, banks, homes, dealers, missions and police posts
  exactly as they are today.
- **The draft siting** (measured, not yet approved: `tools/city-siting.mjs`, S5; the picture the owner was sent is
  `docs/city-spread/draft-siting.png`). The idea: Valen Bay becomes the city's harbour and the city wraps round it,
  tied together by the Blackgate Bridge.

  | Precinct | Lattice cells | Offset (cells) | Stands at (m) | Natural ground | Dry |
  |---|---|---|---|---|---|
  | core: Financial District, Downtown, Greenway Park, Old Quarter | 2,0 … 9,7 | 0, 0 (stays) | x 160…800, z 0…640 | 2.0…5.1 m | 100% |
  | Old Quarter (west) | 0,4 … 1,7 | 0, 0 (stays) | x 0…160, z 320…640 | −0.7…3.3 m | 93% |
  | Linden Hills and Cedar Fields farm | 0,8 … 3,11 | 0, 0 (stays) | x 0…320, z 640…960 | −0.7…3.8 m | 97% |
  | Crestmoor Heights | 0,0 … 1,3 | −8, −6 | x −640…−480, z −480…−160 (the bay's north shore) | 1.6…11.6 m | 100% |
  | Nightlife Strip, Stadium District, Warehouse District | 4,8 … 9,11 | −12, +4 | x −640…−160, z 960…1280 (the bay's south shore) | −0.8…10.2 m | 86% |
  | Industrial Belt | 10,0 … 11,5 | −25, +12 | x −1200…−1040, z 960…1440 (the west coast, where the bridge lands) | 0.0…10.8 m | 100% |
  | Docklands and the Container Terminal | 10,6 … 11,11 | −25, +12 | x −1200…−1040, z 1440…1920 (the same strip, on the water) | −0.8…8.7 m | 78% |

  Why these: Linden Hills stays because the Cedar Fields land bridge hangs off its south street and a new game
  starts at its safehouse; the two east strips keep one offset so the port is one piece; every site is low ground
  (the city's own is 2…5 m and is cut to city height the same way). What the survey ruled out: the shore straight
  north of the core, under Crestmoor Ridge, rises 60 m across a 2 × 4-cell precinct; the flattest plain on the island
  (x 1600…2000, z 1900…2600, south-east of the airport) is free and 2.5 km from the core by road. The Coast Highway,
  the bridge road and Longshore Drive each cross a proposed frame and are re-laid round it or pinned to its edge
  streets (S4/S5). The Valen Point causeway, which hangs off the Docklands' east street today, is re-pinned to the
  core's east edge (S4). `SITING_SET="docks=11,21"` tries another place without editing the table.

## 4. Stages, gates and status
Every stage ends playable, committed and pushed. A stage is done only when its gate is met.

| # | Stage | Scope | Gate | Status |
|---|---|---|---|---|
| S1 | Foundation | `CityLayout` and its rules; suite `layout`; the world fingerprint tool and the classic baseline; the first tables answering in world space (`offCity`, `zoneKey`, `districtNameAt`, `groundBase`, `turfAt`, `streetNameAt`) | fingerprint `IDENTICAL` to the baseline; `layout` green and able to fail (mutation-checked); affected suites green | **DONE** (§9) |
| S2 | Tables and bounds in world space | Every row of §5 marked S2: block lookups, `RoadNet`'s world-facing questions, loops and clamps over `N`, every use of `CITY` as "the city's extent", arrays and keys sized by `N`. Classic layout only; nothing visible changes | fingerprint `IDENTICAL`; `layout` extended to each converted table under the `apart` layout; full regression no worse than the island gate (1,928 / 10, the same ten) | TODO (next) |
| S3 | Bake and the tracer | `World.generate` builds in the lattice then bakes to the world; rasters stay lattice-space with lookups converted; one ground plane per precinct with `uOff`; the collision grid, the chunk streamer and the far mesh follow blocks, not the square; `Island` takes the city's level pads, kept shore and far-mesh hole from `CityLayout` | a **tracer layout** (the whole city as one precinct moved two cells) boots, plays `smoke` and prints a fingerprint equal to classic's once every coordinate is taken relative to its block (`world-print --rel`, to be added); classic still `IDENTICAL` | TODO |
| S4 | Edges, seams and joins | The perimeter per precinct (seawall where its edge is wet, verge where dry; lamps, corners); seam streets built once per precinct; road-graph nodes, signals and kerb cuts per precinct; connectors as island roads whose `lat` ends meet precinct edge streets; the causeway and the land bridge anchored to their host precinct | a **two-precinct tracer** (the city cut in half, the halves 3 cells apart, one connector) boots; GPS, traffic, taxis and police cross the connector; `roadnet`, `roads`, `taxi`, `police` green on it | TODO |
| S5 | The real layout | Siting pass on the island's height map (level, low, dry, near a road, off the airport and the proving ground); the picture for the owner; `CITY_LAYOUTS.island`; the coast re-cut where the square's flanks were; connector roads; the big map, minimap and turf map; races, missions and deliveries that crossed what is now a seam | owner signs off the picture **before** the layout is made default; then every place reachable by GPS from every other; new suite `spread` | TODO |
| S6 | Saves | The save is stamped with its layout (an additive field, default `classic`, no `SAVE_VERSION` bump); a classic save's every world position is carried to where its block now stands (old world → lattice → new world); idempotent | a save made by `releases/banks/Underworld_Banks.html` loads with the player, home, garage, parked and tracked cars, stashes and dropped weapons beside the same buildings | TODO |
| S7 | Tests and the gate | Suites speak lattice positions through one helper instead of raw numbers; `island`, `city`, `map`, `roads` re-asserted for the new world; full regression; phone-profile performance against the island build; docs; release export | full regression at or above the island gate; perf within the mobile budget (`CLAUDE.md`) | TODO |

Order matters: S2 before S3 (the bake needs the tables to answer for moved blocks), S3 before S4 (edges are built on
baked blocks), S5 only when a two-precinct world already plays. Do not make a new layout the default before S6.

## 5. The checklist (every place the code assumes a square)
How to convert, by kind:
- **A. point → what is here** (zone, district, turf, block, street name, in or off the city): ask `CityLayout.at` /
  `near` / `cellAt`, then index the lattice table with `lx` / `lz`. Never clamp to `0…N − 1` by hand.
- **B. world cell or node index → table** (`world.block(bx, bz)`, `RoadNet.segOpen/open/degree`, `districtAt`,
  `superblockAt` called with numbers that came from a world point): the call site keeps its arithmetic; the *callee*
  maps world index → precinct → lattice index and answers "nothing here" off every frame. Generators call the same
  functions with lattice numbers: they run before the bake, when the active mapping is the lattice itself (S3), so
  they need no change.
- **C. loops and bounds over `N`** at run time: iterate `world.blocks` (or `CityLayout.precincts`) and use the block's
  own world cell; never `for (bx = 0; bx < N; …) bx * P`.
- **D. `CITY` as an extent** (`x > CITY + …`, `clamp(x, m, CITY − m)`, `CITY / 2` as "the middle of town"): a frame
  test, a clamp to the nearest precinct's rectangle, or a named anchor (`ZONE_CENTRE`), by what the line means.
- **E. arrays, keys and textures sized by `N`** (`bz * N + bx`, `RoadNet.key`, the BFS arrays, the 16 × 16 road
  texture): these stay lattice-indexed; convert the index on the way in.
- **F. rasters and the ground shader**: stay in lattice space; subtract the precinct's offset before the lookup (S3).
- **G. anchored extensions** (Valen Point's causeway, Cedar Fields South's land bridge, the island roads' `lat` ends,
  the helipad lifts, `ISLE_KEEP[0]`, the far mesh's hole, the sea's frame): defined relative to a host precinct (S4).

| File | Refs | Kinds | Stage | Status |
|---|---|---|---|---|
| `020-content-world-constants.js` | 100 | A B E G | S1/S2 | A done for `zoneKey`, `districtNameAt`, `groundBase`, `streetNameAt`. Left: `districtAt`, `superblockAt`, `RoadNet.roadAt/nearNode/path/segOpen/open/degree/sideOpen/texture`, `Links.attach`, `localRoadAt/localSurfaceAt` (F), `blockLamps` |
| `025`, `026` (Valen Point, Cedar South helpers) | 23 | D G | S1/S4 | `offCity` done. Left: `vpSide`, `vpCauseway`, `vpClampSearch`, `inCedarSouth`, the off-city spot lists |
| `390-underworld-data.js` | 13 | A C | S1/S2 | `turfAt` done. Left: turf centres and names by lattice cell → world |
| `600-core-ui-manager.js` | 79 | C D | S2/S5 | the big map and minimap draw the lattice by loops over `N` and `i * P` |
| `090-content-world.js` | 75 | B C G | S3/S4 | generators stay in the lattice; `generate` gains the bake; `_genPerimeter` goes per precinct; `nodePos`, `randomCurbSpot`, `randomSecret` |
| `170-content-static-scenery.js` | 41 | D F G | S3/S4 | the ground plane, the promenade, the seawall and railing, the water frame |
| `120-content-city-v2.js`, `122`, `100`, `110` | 88 | B (generation) | S3 | generation-time: unchanged by design; bake their outputs (`localRoads`, `homes`, `mapPlaces`, `compounds`, places and doors) |
| `135-core-road-graph.js` | 36 | B E | S2/S4 | lattice edges from `line * P`; node `lat`; kerb cuts |
| `450-underworld-core.js` | 28 | A C | S2 | zone and turf loops |
| `280-core-traffic-manager.js`, `290-core-drive-ai.js` | 45 | B C D | S2/S4 | spawn and route by lattice node; `RoadNet` questions |
| `300-core-pedestrians.js` | 23 | B C D | S2 | sidewalk routing by block |
| `540-underworld-empire-ui.js` | 19 | C D | S5 | the turf map |
| `560-underworld-taxis.js`, `310-core-police-manager.js` | 32 | B D | S2/S4 | node routing, search clamps |
| `350`, `340`, `490`, `370`, `360`, `160`, `150`, `630`, `570`, `130` | 76 | A B C D | S2 | block lookups, clamps, loops |
| `022`, `027`, `177`, `176`, `175`, `125`, `126`, `127` | 31 | D G | S3/S4 | the island's pads, kept shore, far-mesh hole; extension anchors |
| `060-core-materials-textures.js` | 7 | F | S3 | the ground shader: add `uOff`; clamps `0…11/12` hold in lattice space |
| the rest (22 files, 1–5 refs each) | 54 | A D | S2 | mostly `zoneAt` callers (already world-safe) and a few `CITY` clamps |

Regenerate the counts with the scan in §6 after each stage; a row is done when its remaining references are all
arithmetic that is valid on the island-wide grid (say so in a comment at the site if it is not obvious).

## 6. How it is verified
- **World fingerprint** (`tools/world-print.mjs`): hashes every block (144 city, 56 extra) on its own, the world's
  lists, the road net and graph, every collider, the places, and 15,627 samples round the city plus 3,955 across the
  island of the questions everything asks (zone, ground height, on a road, local road, off the city). Deterministic
  (two runs identical). `--cmp a b` names the sections and blocks that differ. The baseline of the island build is
  `docs/city-spread/world-print-classic.json` (from `c4abcc2`). Any change under the classic layout must compare
  `IDENTICAL`; under another layout the same tool shows exactly what moved.
- **Suite `layout`** (Node, no browser, in the regression runner's list): loads `010`, `020`, `021` and `turfAt` as
  built. The classic layout must answer exactly what the replaced arithmetic answered at 95,291 points on and round
  the city, including a hair either side of every line where an answer changes; a layout cut into six precincts that
  have not moved must answer the same; a layout whose four precincts stand apart (`apart`) must map every cell,
  street and edge strip to its precinct and back; eight kinds of bad layout must be refused with the reason.
  Mutation-checked: four deliberate faults in `021` each fail it. **Extend it with every table converted in S2.**
- **Tracer layouts** (S3, S4): never ship; they exist to make a mistaken conversion visible, because under `classic`
  lattice and world are the same numbers and a wrong one passes every test.
- **Regression**: the island gate was 1,928 passed / 10 failed on `ac13fb5` (four roster checks since fixed, six
  load-timing that pass alone; `ISLAND.md` §8). The screenshot-only suites time out on this machine before and after.
- The scan behind §1 and §5: a regex count per file of the patterns in §1's table (a dozen lines of Python over
  `src/game/*.js`); rerun it rather than trusting the table when in doubt.

## 7. Saves
Nothing in S1–S4 changes a save. S6: `SaveSystem.defaults` gains `layout: 'classic'` (additive, sanitized, no version
bump). On load, if the stamp differs from `CityLayout.id`, every saved world position is mapped old world → lattice
(through the stamped layout) → new world (through the current one), then the stamp is updated, so loading twice is
the same as loading once. Positions off every frame of the old layout (out on the island, Valen Point, Cedar Fields
South) keep their numbers unless their host moved (§5 G). The fields that hold positions must be enumerated from
`030` and each owning system's `sanitize` at S6, not guessed: at least the player's `pos`, `home`, kept and tracked
vehicles, pending cars, dropped weapons (`wloc`) and stashes.

## 8. Risks, and what the owner still has to rule on
- **Streets inside a district stay a grid** (north–south, east–west, 80 m). That follows from "relocate, do not
  redraw" (§2.2). If the owner wants districts whose own streets bend, that is new building work on top of this.
- **Every district sits on level ground at city height.** Hillside sites would be terraces cut into the slope; the
  siting pass keeps to low ground, which is why Crestmoor Heights goes to the bay's north shore and not up onto
  Crestmoor Ridge. The alternative, if the owner wants a district on a hill: the bake lifts a precinct to its site's
  own height, which costs every field that holds a height (colliders, buildings, props, the on-lattice ground);
  decide at S3, not before.
- **Scale.** The lattice is 0.92 km² of city on 19 km² of island. Relocation spreads those 144 blocks; it does not
  make more of them, so the result is a core and four districts round a bay, not a metropolis that fills the island
  (the draft picture shows it honestly). More city means new blocks, which is new building work the owner would have
  to ask for; the layout is the groundwork for that too, but it is not in these stages.
- **Performance**: one ground plane and one edge per precinct instead of one; more of the city in view from the air.
  Measure on the phone profile at S3 and S5 (`CLAUDE.md` mobile budget).
- **Content that crosses a seam**: street races, deliveries and missions defined as runs of lattice nodes that two
  precincts will no longer share. Each needs a look at S5; routing through the road graph is the tool.
- **The picture** (S5): the owner approves where each district stands before it becomes the default layout.
- **One branch, one writer**: the session that built the island used this branch. Do not run two writers on it.

## 9. Log
- **2026-11-15, the draft siting.** `tools/city-siting.mjs` reads the island's natural ground under every place a
  precinct could stand (dry, low, level, clear of what is kept) and prints or draws a layout. The draft in §3 came
  out of it and went to the owner as a picture for a yes, a no or a move-that. Nothing is built from it.
- **2026-11-15, S1 done.** Added `021-content-city-layout.js` (`CityLayout`, `CITY_LAYOUTS.classic`), suite
  `layout` (23 checks; in `runall`'s list), `tools/world-print.mjs` and the baseline
  `docs/city-spread/world-print-classic.json`. `offCity`, `zoneKey`, `districtNameAt`, `groundBase`, `turfAt` and
  `streetNameAt` now ask the layout. Fingerprint against the island build: `IDENTICAL` (24 sections, 144 + 56
  blocks). Results of the affected suites and the commit are in `CURRENT_SESSION.md`.
- **A bug found on the way and fixed** (its own commit): `streetNameAt` named any point within 10 m of a lattice
  line's extension, anywhere in the world, so the HUD read "Elm St" on Mount Valen, "Dock St" on the main runway and
  "Central Blvd" on the Blackgate Bridge and at Valen Point. A lattice street is now named only inside the frame of
  the precinct whose street it is; suite `island` checks it.

## 10. Round the grid (live): the new districts, Villa Valen and the Valen Vault
The owner's words, by voice: keep the grid; build districts round it, not in a grid pattern; raise the quality
elsewhere on the map with new builds and smaller rebuilds; a lavish mansion at the top of the map near the Crestmoor
Ridge estates but in the new area, with an extravagant bunker. Built in `src/game/128-content-island-districts.js`
(commit `77549bd`), hooked into `127`'s `_genIsland` at two points (`_districtPlan` before `Island.corePads`,
`_genDistricts` before the rooftop helipads).

- **Streets** (`ISLE_DISTRICT_ROADS`, appended to `ISLE_ROADS`): Bayview Crescent, Ridgeview Drive, Laurel Way
  (north shore of Valen Bay); Marsh Hollow Road (a through route Longshore Drive → Southshore Highway), Heron Loop,
  Reed Street (south-west lowlands); Quay Road and Foundry Wharf (west coast by the Blackgate Bridge). Island roads,
  so they are road-graph links: GPS, traffic, taxis and police use them.
- **Lots** (`ISLE_LOT_PLAN`, `ISLE_LOT`): planned along each street before roads are built, clear of every road
  (and turning circle), the city, the airport, the proving ground, Cedar Fields South, Valen Point, the lake, the
  sea, other pads and each other; levelled at their street's height (the road bed's shoulder widens with the step,
  022 `compute`); any lot a second road's shoulder still reaches is dropped after the roads are cut. Kinds: villa,
  house, cabin, shop (a map place), apt, ware. Count at `77549bd`: Bayview 40, Marsh Hollow 52, Blackgate Landing 7,
  Lake Valen Shore 13, Gull Harbor 8. Street lamps every 44 m on the new streets.
- **Villa Valen** (`VILLA_VALEN`, `_genVillaValen`): walled grounds x −692…−518, z −1062…−850, level at 21.5 m, at
  the head of Ridgeview Drive. Hall and two wings, portico, fountain court, garage pavilion, infinity pool and pool
  house, tennis court, helipad (a helicopter parked), avenue and perimeter trees, gate with the name in gold.
- **The Valen Vault**: x −604…−528, z −1052…−994, a 7 m concrete shell under a turf roof with banks. The south
  doorway is 10 m wide and open (drive in); the round vault door stands open beside it. Inside: a gallery of six cars
  on lit turntables (valkyr, obsidian, revenant, monarch, hellion, kodiak), then through three doorways a command
  room (screen wall, map table), a lounge (black-and-gold bar, sofas, grotto pool, chandelier) and a strongroom
  (vault door, gold and cash pallets, armoury racks).
- **Verification**: suite `districts` (8 checks: built, level, clear of roads and each other, streets in the road
  graph, GPS reaches each, vault solid with an open doorway, places on the map, streamed, no page errors).
  `tools/district-shots.mjs <dir>` captures the villa, the vault and each district.
- **Not done (next, in order of value)**: make Villa Valen a buyable home (the homes ladder in `500` matches a
  `world.homes` record; island blocks have no home record yet, and the vault would want to be its garage); more
  "smaller rebuilds" elsewhere (the Highland Pass diner was tried and has no level site); street names in the HUD
  for the new streets come from the island road names already.
