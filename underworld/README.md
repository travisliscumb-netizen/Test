# The Underworld

A free-roam systemic crime sandbox set in the city of Port Valen, in one HTML file (`index.html`).
The player-facing title is "The Underworld". Folder names, the save key and the code tags still say
`underworld` / Port Valen so existing saves keep loading. It was built from a copy of
`port-valen/templates/master-template-1.0-stable.html`. The master template has not been changed.

You start with $0, no car, no weapon, no property, no crew and no reputation. There is no scripted
opening. Your first money can come from pickpocketing, mugging, glovebox loot, the chop shop, fencing,
street races (with a buy-in), dealing, street-fight bystander rewards, robbing criminals or a feed tip.
From there you can work up to City Kingpin.

## Run it

Open `underworld/index.html` in a desktop or mobile browser. It's fully self-contained and works
offline. Three.js r160 and the postprocessing addons the game uses (EffectComposer, RenderPass,
UnrealBloomPass, OutputPass, ShaderPass, FXAAShader) are bundled unmodified with esbuild. The bundle
is inlined in a `<script type="module" id="threeInline">` block and exposed as `window.__PV_THREE`.
There's no CDN, no import map, and no external asset. The bundle adds about 1.2 MB to the file.

To rebuild the bundle:

```
npm install esbuild@0.24.2 three@0.160.0
npx esbuild underworld/tools/three-entry.js --bundle --format=esm --target=es2020 --legal-comments=inline --charset=utf8 --outfile=three-bundle.js
# then replace the body of <script type="module" id="threeInline"> with three-bundle.js
```

## Controls (keyboard / mouse)

| Key | Action |
| --- | --- |
| WASD, Shift, Ctrl/Alt | Move, sprint, walk |
| LMB / G / V | Light combo (third hit is a kick finisher) / heavy / kick |
| RMB (fists) | Block |
| X | Dodge |
| E / F | Interact, steal or enter a car, talk, deal, pickpocket |
| 1–5, Q | Weapons |
| Tab / I | Empire screen: overview, territory, crew, assets, market, stash, factions, police, feed |
| M | Big map: wheel / pinch to zoom (1×–8×), drag to pan, Places index with search and categories, layer filters, tap a place for its card and "Track location" |
| T (map open) | Territory overlay (also a map layer; tap a turf for details) |
| B (in a car) | Look back |
| F5 | Quick save (only when it is safe) |
| Esc / P | Pause |

Touch: there is a stick, plus a tap for a light hit, a hold for a heavy hit, Blk to block,
Blk plus the stick to dodge. The top bar holds Map, Phone (Empire screen), Cam, Radio (in a car) and
Pause in one row that never covers the location label. In a car, Gas and Brake are large thumb
buttons at the bottom right with Drift and Horn above them. The speedometer, prompts and toasts are
placed by a layout pass (`HudLayout`) so they never sit under a control. That holds down to
320 px widths, in portrait and landscape.

## Where things live in the code

The engine sections from the template (`[CORE] ...`) are still there and have been patched in place:
melee facing, the combat moveset, reverse speed and reverse camera, vehicle damage stages,
witnesses and the investigation, the zero-start save schema, and the district map.
The new layer, tagged `[UNDERWORLD]`, sits just before `[CORE] UI MANAGER`:

- Data tables: goods and risk tiers, factions and bosses, stages, properties, contacts, officers, crew roles and traits
- `Market`: prices per district, plus supply shocks and the night/day demand split
- `Underworld`: the strategic clock, influence, stage and inventory/storage. Its save lives in `save.uw`
- `FactionSim` and `GangManager`: five rival factions that run on their own, plus street crews, HQ guards, squads, buyers and brawls
- `CrewManager` and `PropertyManager`: the crew (roles, ranks, loyalty, fear and betrayal), plus safehouses, garages, warehouses and fronts
- `PressureSystem`: police pressure, corruption, honest officers and outside investigations
- `Prison`: arrest and sentencing. The jail block is playable and has its own accelerated clock (1 real minute ≈ 1 year at 1×). The street clock stays frozen while you serve
- `OppFeed`, `EmpireUI`, `NeonSigns`

City and property layer (this pass):

- `RoadNet` and `SUPERBLOCKS`: the 12×12 lattice with segments closed inside superblocks (estate,
  park, stadium, terminal, fields). Traffic, GPS, races, police routing, peds and the ground shader
  read it. There are no dead ends and every node stays connected. Local lanes, drives, lots and
  paths are painted into a separate raster (`localRoadAt` / `localSurfaceAt`).
- `CITY v2` generators: suburbs (cul-de-sacs, crescents, street lots, low-rise), Crestmoor Heights
  (wealthy), the Crestmoor estate, Greenway Park, the Stadium District (bowl, lot, tunnel onto
  the pitch), the ferry terminal, Cedar Fields (the country edge), the multi-level parkade and the
  Saltworks drive-in chop shop.
- Prop sanity pass (`_propSanity` / `auditPlacement`): every pole, lamp, hydrant, bench, bin, sign,
  tree and shelter is checked against roads, lanes and driveways. A prop in the way slides to a
  clear spot or is removed, and the wires follow moved poles.
- `HOME_LADDER` / `defineHomeProps` (21 homes over six tiers), `PropertyManager` bays and capacity
  (street 1, carport/lot 1–2, single 1, double 2, triple 3, mansion 10 underground, penthouse 1
  outdoor + 4 underground), `GarageDisplay` (stored cars stand in their bays), `DoorSystem` (garage
  and service doors that open for whoever is allowed), `VSpaces` (underground garages at y = -30)
  and on-demand house interiors (`houseInteriorDef`, loaded on entry and unloaded on exit).
- Valen Tower: street lobby, elevator (Penthouse / Lobby / Garage), the penthouse at the real tower
  top with a terrace view (wide chunk streaming while you are up there), and the residents' garage.
- `MapView`: the vector big map with zoom-dependent labels, the Places index, layers (Locations,
  Properties, Businesses, Factions, Territory, Police, Garages, Landmarks), the property card and
  tracking. `MAP_CATS` gives one symbol per category on the big map, the index and the minimap.

The save key is `pvunderworld.save.v1` and the schema version is 3. Saves are versioned, sanitized
and written only in a stable state. Settings are stored under a separate key.

## Tests

The tests use Playwright with headless Chromium (SwiftShader). Run them from the repo root. Every
suite runs with the browser context offline. Any non-file request is aborted and counted as an
error, so a hidden network dependency fails the suite.

```
node underworld/tests/smoke.mjs     # boot, $0 start, every menu, map overlay, location layout
node underworld/tests/core.mjs      # melee facing (8 dirs, 180°, post-exit), combo + step-in stress, reverse speed, reverse-camera transitions
node underworld/tests/arrest.mjs    # 9 arrest situations (idle/walk/sprint/fight/vehicle exit/pursuit/map open/repeated) -> jail -> release -> stale-state audit; death respawns
node underworld/tests/session.mjs   # $0 -> first money -> property -> crew -> turf -> corruption -> drive/chase/bust/release -> save/reload/repair
node underworld/tests/ui.mjs        # minimap labels upright, big map layout, colours, input leaks, overlays, touch controls
node underworld/tests/offline.mjs   # no network at all: load, render, play, UI, vehicles, police, combat, map
node underworld/tests/phone.mjs     # phone layouts (8 sizes, 320–932 px, portrait + landscape): top bar, jail, driving HUD, menus
node underworld/tests/map.mjs       # pinch/pan/wheel zoom, limits, labels by zoom, index search, tap to centre, tracking, layers, cards
node underworld/tests/city.mjs      # road network (no dead ends, connected), prop placement, buildings, districts, landmarks, stadium, parkade
node underworld/tests/property.mjs  # 21 homes / 6 tiers, parking capacity, garage doors, bays, save/reload, mansion, penthouse, interiors
node underworld/tests/stress.mjs    # realistic phone session across every new system, HUD overlap audit after each step
node underworld/tests/cityshots.mjs # screenshots of the new districts for visual review (.shots/city)
CYCLES=10 node underworld/tests/soak.mjs  # long session: entities, listeners, timers, GPU memory, frame cost, heap, save round-trip
node underworld/tests/shots.mjs     # screenshots for visual review
node underworld/tests/perf.mjs underworld/index.html   # frame-cost probe (THREE_DIR=... to compare the CDN-based template)
```

Each suite prints PASS/FAIL lines and a summary, and it exits non-zero if any check fails.

## Validation record (this build, 2,388,719 bytes, sha256 `97bcd75e06f1`)

Every suite was run offline against the final file:

| Suite | Result |
| --- | --- |
| smoke | 16 / 16 |
| core (melee facing, combo + step-in stress, reverse speed, reverse-camera transitions) | 64 / 64 |
| arrest (9 situations, stale-state audit, death respawns) | 126 / 126 |
| session | 33 / 33 |
| ui (map / minimap / touch) | 23 / 23 |
| offline | 14 / 14 |
| soak (12 cycles: no listener/timer growth, heap 91.7 → 91.7 MB, frame cost flat) | 37 / 37 |
| phone (8 phone sizes) | 71 / 71 |
| map | 22 / 22 |
| city | 25 / 25 |
| property | 33 / 33 |
| stress (realistic phone session) | 29 / 29 |
| master checksum (`sha256sum -c master-template-1.0-stable.sha256`) | OK |

`port-valen/tests/playtest.mjs` (the original template's playtest) needs the jsDelivr CDN to boot the
template. It can't boot in an offline sandbox, before or after this pass.

Performance comes from `tests/perf.mjs` (SwiftShader, two runs per build, compared with the previous build):

| | previous build | this build |
| --- | --- | --- |
| desktop, low: game-logic update | 0.80–1.01 ms | 0.73–1.15 ms |
| desktop, low: draw calls / triangles | 110–113 / 272–355k | 107–113 / 293–348k |
| phone profile (4× CPU throttle, 800×400, quality 1): update | 4.0–6.5 ms | 4.7–8.9 ms |
| phone profile: draw calls / triangles | 199–243 / 648–868k | 210–237 / 676–871k |
| wall ms/frame (desktop / phone) | 320–364 / 1333–1600 | 276–348 / 1333–1601 |

The update ranges overlap. A per-subsystem profile (300 updates under 4× throttle) puts both builds
at 9.4–12.2 ms in total. The only new per-frame cost found there was the HUD layout pass. It now runs
on change (cheap fingerprint plus ResizeObserver) with a 1 s safety timer, instead of every 0.1 s.
