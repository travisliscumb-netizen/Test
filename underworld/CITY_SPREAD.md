# CITY SPREAD — the city into the island (the plan, the record and the handoff)

> **RESUMED BY THE OWNER, 2026-11-16.** After seeing the round-the-grid districts (§10) the owner asked again for
> the city to flow with the island instead of floating in the middle of it: keep every working system, relocate it,
> no redraw, no placeholders. True relocation (§0–§9) is the live plan again; §10's districts stay and are part of
> the island the precincts move into (their sites and §3's draft siting overlap and are settled at S5).


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
- **S1–S7 are done, and the wider spread (S8, owner's ruling 2026-11-16: split the core, move more out, fill the map
  with city, suburb and countryside) is built.** The island layout has ten precincts; §9's last entry is the record.

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
| S2 | Tables and bounds in world space | Every row of §5 marked S2: block lookups, `RoadNet`'s world-facing questions, loops and clamps over `N`, every use of `CITY` as "the city's extent", arrays and keys sized by `N`. Classic layout only; nothing visible changes | fingerprint `IDENTICAL`; `layout` extended to each converted table under the `apart` layout; full regression no worse than the island gate (1,928 / 10, the same ten) | **DONE** (§9) |
| S3 | Bake and the tracer | `World.generate` builds in the lattice then bakes to the world; rasters stay lattice-space with lookups converted; one ground plane per precinct with `uOff`; the collision grid, the chunk streamer and the far mesh follow blocks, not the square; `Island` takes the city's level pads, kept shore and far-mesh hole from `CityLayout` | a **tracer layout** (the whole city as one precinct moved two cells) boots, plays `smoke` and prints a fingerprint equal to classic's once every coordinate is taken relative to its block (`world-print --rel`, to be added); classic still `IDENTICAL` | **DONE** (§9) |
| S4 | Edges, seams and joins | The perimeter per precinct (seawall where its edge is wet, verge where dry; lamps, corners); seam streets built once per precinct; road-graph nodes, signals and kerb cuts per precinct; connectors as island roads whose `lat` ends meet precinct edge streets; the causeway and the land bridge anchored to their host precinct | a **two-precinct tracer** (the city cut in half, the halves 3 cells apart, one connector) boots; GPS, traffic, taxis and police cross the connector; `roadnet`, `roads`, `taxi`, `police` green on it | **DONE** (§9) |
| S5 | The real layout | Siting pass on the island's height map (level, low, dry, near a road, off the airport and the proving ground); the picture for the owner; `CITY_LAYOUTS.island`; the coast re-cut where the square's flanks were; connector roads; the big map, minimap and turf map; races, missions and deliveries that crossed what is now a seam | owner signs off the picture **before** the layout is made default; then every place reachable by GPS from every other; new suite `spread` | **DONE** (§9; the owner gave full control) |
| S6 | Saves | The save is stamped with its layout (an additive field, default `classic`, no `SAVE_VERSION` bump); a classic save's every world position is carried to where its block now stands (old world → lattice → new world); idempotent | a save made by `releases/banks/Underworld_Banks.html` loads with the player, home, garage, parked and tracked cars, stashes and dropped weapons beside the same buildings | **DONE** (§9) |
| S7 | Tests and the gate | Suites speak lattice positions through one helper instead of raw numbers; `island`, `city`, `map`, `roads` re-asserted for the new world; full regression; phone-profile performance against the island build; docs; release export | full regression at or above the island gate; perf within the mobile budget (`CLAUDE.md`) | **IN PROGRESS** (§9) |

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
- **2026-11-16, S2 (most of it).** Relocation resumed. The convention, now fixed: *authored tables keep lattice
  addresses; the simulation speaks world cells.* `world.block(bx, bz)` stays a lattice address (SPECIAL, landmarks,
  missions); `world.blockW(I, J)` / `blockAt(x, z)` look up by world cell or point; every block records the world
  cell it stands in (`b.I`, `b.J`). `RoadNet` keeps the authored closures in lattice numbers and builds the world's
  open segments from the active layout (`RoadNet.layout()`, called by `CityLayout.use`); `segOpen`, `open`,
  `degree`, `roadAt`, `path`, `nearNode` take world numbers over the layout's node rectangle (`I0..I1`, `J0..J1`);
  `edgeNode` replaces `i === 0 || i === N …`; `texture()` stays lattice (the ground shader takes the offset off,
  S3). New in `021`: `wx`/`wz` (lattice metres → world), `cellNear` (the old clamp of `floor(x / P)`), `cx`/`cz`
  (the middle of town), `frameX`/`frameZ`; `precinctOf` accepts a cell or node just outside the lattice.
  Converted: pedestrians (walk in world cells), traffic (spawn bounds, edge-street speed), drive AI, police (spawn,
  roadblock), taxis (spawn loops, street names), missions (contacts, race routes), turf centres and the bar-sign
  placement, sidewalk/curb spot helpers, `randomCurbSpot`, chunk streaming, prop activation, the road graph's lattice
  chains (world lines, named by their own precinct's line), entrances, the prison transport, the save clamp, the
  vehicle fallback, the big map and minimap (each precinct's bed, blocks, lanes, tints and borders by world cell),
  the turf map, the map's street labels and pickers, `ZONE_CENTRE`. Suite `layout` gained 9 S2 checks under
  `classic` (86,275 answers equal to the old arithmetic) and `apart` (every street where its precinct stands and no
  other; roadAt; routes; edge streets; lattice metres → world); a mutation of `RoadNet.layout` fails 3 of them.
  Fingerprint: differs from the build before only by the new `I`/`J` fields (`WP_SKIP=I,J` to show it), plus three
  blocks (53, 65, 66) and `world.propTypes`, which already differ between two runs of the same build (runtime
  state; the tool is not fully deterministic since the round-the-grid build). **Left for S2:** the generation-time
  files (`090` perimeter, `100`, `110`, `120`, `122`, `170`) and the anchored extensions (`025`, `026`, `022`, `127`,
  `128`, `176`, `177`) belong to S3/S4 by §5's own table; `localRoadAt`/`localSurfaceAt` (F, S3); the full
  regression (the S2 gate) when S3's tracer exists, since under `classic` it cannot see a wrong conversion.
- **2026-11-16, S3.** The bake: the city is generated under `classic` (same seeds, same noise) and `World._bake`
  moves every block and the world's lists by its precinct's offset (x/z keys, [x, z] points, wire runs, compound fence
  runs, signal crossings in cells; normals, flags and shared tables untouched); colliders are registered after it in
  their old order, then `_postGen` runs where the city stands. The perimeter is built per precinct after the bake
  (`world.shoreRuns`), leaving out seams. One ground mesh and one ground material **per offset group** (precincts at one
  offset share their streets): the mesh is the union of their frames with no overlap; the shader takes the offset off
  (`uOff`) and knows its cells (the block texture's alpha) instead of assuming 0..960. The local-road raster is an
  **atlas** with a tile per group (`LOCAL.tiles`, `localPx`, the shader's `uLoc`), because two groups' lattice frames
  overlap near a cut and would share pixels. The AO map stays lattice. Island: every precinct's ground is land and
  levelled (`corePads`, the SDF), its far mesh and ribbons skip every frame, `_coastAmp` keeps every frame's coast.
  Test layouts: `?layout=tracer` (the city moved whole), `?layout=tracer2` (two halves and a connector); `UW_QUERY`
  runs any suite under one.
- **2026-11-16, S4.** Connectors: `CITY_CONNECTORS[layout]` (island roads in world metres whose `lat` ends meet
  precinct edge streets). An island road's control point authored at the city's edge moves with the precinct it meets
  (`CityLayout.anchor`). Valen Point's causeway and the Cedar Fields land bridge leave from whichever precinct edge
  meets them (`VP_EDGE`, `CFS_EDGE`).
- **2026-11-16, S5: the island layout** (the owner: "you have full control, whatever makes most sense for a smooth city
  layout"). The draft of §3 with one change: **the port does not move.** A precinct never turns, and the Docklands'
  quay, cranes and container berth face east; on the west coast they would face inland. So the Industrial Belt, the
  Docklands and the Container Terminal stay on Valen Sound beside the core (Valen Point's causeway still lands on their
  east street), and last session's Blackgate Landing keeps the west coast. Moved: **Crestmoor Heights** (cells 0..1 x
  0..3, offset −8, −6) to the bay's north shore, **the Nightlife Strip, the Stadium and the Warehouse District** (4..9 x
  8..11, offset −12, +4) to its south shore. Roads (`ISLE_ROAD_LAYOUT.island`): the Coast Highway runs through the
  Heights' own streets (`n1e` from the core to its east street, `n1` on from its west street); the Southshore Highway's
  east end reaches the core's south street; the Blackgate Bridge road leaves from the Strip's west street; Strip Road
  joins the Strip's east street to the Southshore Highway; Bayview Crescent gives way to the Heights; Ridgeview Drive
  climbs to Villa Valen from the Heights' north street; Reed Street stops short of the Strip. Saltmarsh (village, jetty)
  steps aside where a precinct stands. Street races keep to one offset (`CityLayout.nodeX/Z`): the Quayside Sprint now
  turns up the core's bay front, the Pink Slip keeps to the core and the port. Tanner's Row, which crossed from Linden
  Hills into the Strip's block, is now two lanes, each meeting its own precinct's edge street.
  **The island layout is the default** (`CITY_LAYOUT_DEFAULT`); `?layout=classic` is the square, fingerprint-identical
  to the build before the city spread.
- **2026-11-16, S6.** A save carries its layout (`layout`, additive; a save without one is classic). Loaded under
  another, every `{ x, z }` that stood in a precinct of the old layout moves to where the same block stands now
  (`CityLayout.relocate`), the stamp updates, a second load moves nothing. Suite `relocate` (7 checks).
- **2026-11-16, S7 (started).** Suites updated for the island layout where they asserted the square: `city` (network
  checks over the world and the road graph, races per offset), `roadnet` (grid over the layout's node rectangle,
  crossings, fare points through the layout), `island` (seawall by precinct and side, Saltmarsh's shore, street names
  and places through the layout, road beds skip every frame, road count), `districts` (the streets and lots the layout
  keeps), `layout` (starts on island, tests classic explicitly). Full regression on the island default: running; its
  result goes here and in CURRENT_SESSION.md.

- **2026-11-16, S7 (done).** Full regression on the island default (`underworld/.runs/spread/`), every failure re-run
  alone and classified. Bugs it found, fixed: the bake left warehouse yard parking (`park`) at lattice coordinates, so
  a warehouse in a moved precinct had its bays outside its yard (`park` now moves; a curved street's kerb-side list
  `[1, -1]` does not); police units spawned on any node of the layout's node rectangle, which between precincts is open
  ground (now only on a node with an open street; traffic, drive AI and taxis already checked). Tanner's Row's far
  half is **Cooper's Lane** wherever the layout parts its two blocks (`_nameApart`, after the bake). Suites that still
  asserted the square, updated: `relocate` (its save is made under `?layout=classic`), `roads` (corner path through
  the layout's nodes, island ribbons by `inCity`, a street's two halves may meet through one precinct), `taxi` (map
  picks through `wx/wz`), `races` (districts pre-discovered: a route through a new district adds the discovery Rep),
  `kingpin` (inner turfs by lattice position), `roadnet` (Cooper's Lane, the pursuit target in the unit's precinct),
  `compound` (street groups cleared under the gang cap before the raiders spawn).
  **Linden Gardens** (128, `ISLE_INFILL_ROADS`): the screenshots showed the Strip's old ground between Linden Hills,
  downtown and the docks as an empty lawn. It is levelled to the kerb (`ISLE_GARDENS.pads`, 022 `corePads`) and built
  up on seven curving streets (Garden Parade, Quince Street, Cobb Lane, Mercer Street, Gardenia Close, Sorrel Street,
  Wharf Lane) joining the three precincts and the Southshore Highway: 31 lots (shops and flats facing downtown,
  houses behind, a yard by the docks; infill lots keep 24 m from the edge streets and pack tighter), tree-lined
  streets, lamps; zone Linden Hills. Island layout only: classic stays `IDENTICAL` to the baseline.
  Gate: the affected suites on the final build all pass (roadnet 42, offroad 51, roads 20, districts 8, island 41,
  city 25, taxi 20, map 22, layout 32, police 13, arrest 126, legal 21, compound 56, relocate 7, races 24, kingpin 6;
  stress, raid pass alone). Still failing here, identically on the pre-spread island build: `threat`'s real-time clock
  check and `cityshots`' screenshot timeout (software GL: fewer than a second of frames in three of wall time).
  Performance (perf suite, software GL, calm / busy): draw calls 156 / 163 before, 188 / 177 now; triangles +6 % / +4 %.
  Honest state: the city reads as downtown with the port and Linden Hills (now with Linden Gardens) in the island's
  waist, Crestmoor Heights on the bay's north shore and the Strip on its south shore. Only two of six precincts moved;
  a wider spread (splitting the core) is the owner's call.

- **2026-11-16, S8: the wider spread (owner: "spread it wider, split the core and move more districts out, use up more
  of the map ... rural, farmland ... research what makes it realistic").** Research: the classic urban models
  (Burgess's rings, Hoyt's sectors, Harris and Ullman's multiple nuclei) and game-city design writing agree on one
  dominant centre, specialised sub-centres, and transition belts out to countryside; players' complaint about open
  worlds is one dense city and empty stretches. The layout follows the multiple-nuclei shape:
  - **Downtown on the waist** (offset 0): the core's south half (`core`, lattice 2..9 × 4..7: Financial District,
    Downtown, the Old Quarter's east), the Old Quarter's west, Linden Hills, the port.
  - **The north shore** (offset −8, −6): Crestmoor Heights and, beside it, **Greenway** (2..5 × 0..3: Greenway Park,
    the north Old Quarter): the affluent quarter on the bay.
  - **Uptown** (6..9 × 0..3, offset 14, −5): a second business centre on Valen Sound's north shore below Lake Valen.
  - **The freight park** (the Warehouse District, 6..9 × 10..11, offset 8, 4) on the south-east plain by the airport;
    the **Stadium** (6..9 × 8..9) stays with the **Nightlife Strip** (4..5 × 8..11) on the bay's south shore.
  - Connectors: Strip Road, Freight Road, Lakeside Avenue, Sound Road; the Coast Highway runs from Greenway across
    Midtown to the core's north street.
  - **Midtown** (128 `ISLE_INFILL`): the waist the core's north half left, levelled and built up on Harbour Boulevard,
    Midtown Avenue, Ferry Street and Pier Road: office towers (new lot kind `tower`, 28–70 m) and mid-rise flats over
    shops (new kind `mid`). Linden Gardens stays south of downtown. **Soundview** round Uptown (houses, flats) and
    the **Southport Logistics Park** on Freight Road.
  - **The countryside** (new `129-content-island-farms.js`, `Farms`): fields in seven regions as rotated patchworks of
    varied parcels, each kept only on dry, gentle ground clear of every road, pad, precinct and site, painted by crop
    on the island's vertex colours (wheat, barley, canola, maize, pasture, hay with bales, ploughed ground; tramlines
    and furrows, headlands), orchards (trees on an 8 m grid), vineyards (trellis rows), hedgerows on the field edges
    with gate gaps (shrubs, no collider: you can drive cross-country), 21 farmsteads on the country roads (house,
    red barn, two silos, machinery shed: lot kind `farm`), and wind turbines with turning rotors on open high ground.
  Bugs found and fixed on the way: the bake did not move `world.doors` (the Crestmoor mansion's garage door stood in
  Midtown); the seawall walled off any island road leaving over a wet edge (gaps now cut for every road end); the
  local-road atlas tiles were not on the lattice's pixel grid, so a footprint tested before the bake could read
  differently after it (tile origins snapped; the atlas's metre size is its whole-pixel size); a district split
  across precincts was labelled at an average between them. Races re-routed to keep to precincts that stand together
  (Quayside Sprint, Saltworks Circuit). Classic stays `IDENTICAL` to the baseline (blocks 53, 65 and 66 take one of
  two variants from run to run on every build, before this work too: KNOWN_ISSUES).
  Gate: the affected suites pass on the final build (island 41, smoke 16, relocate 7, police 13, layout, districts,
  map, taxi, races, gangs, property; city, roadnet, roads and offroad after the fixes); the full regression result is
  in CURRENT_SESSION.md.

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
