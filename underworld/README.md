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
| LMB / G / V | Light combo (third hit is a kick finisher) / heavy / kick. With a gun: LMB fires along the crosshair, V or G is a quick melee |
| RMB | Fists: block. Gun: aim down sights (tighter spread, closer camera, slower walk) |
| R (gun drawn, on foot) | Reload (R is the radio in a car) |
| X | Dodge |
| E / F | Interact, steal or enter a car, talk, deal, pickpocket |
| 1–5, Q | Weapons |
| Tab / I | Empire screen: overview, territory, crew, assets, market, stash, factions, police, feed |
| M | Big map: wheel / pinch to zoom (1×–8×), drag to pan, Places index with search and categories, layer filters, tap a place for its card and "Track location" |
| T (map open) | Territory overlay (also a map layer; tap a turf for details) |
| B (in a car) | Look back |
| F5 | Quick save (only when it is safe) |
| Esc / P | Pause |

Touch with a gun drawn uses a three-finger layout: the left thumb moves, the right side of the
screen aims, and a large FIRE button fires (drag from FIRE to keep aiming while you shoot). ADS,
RELOAD and a contextual MELEE button (shown when someone is within reach) sit around FIRE, and the
crosshair opens with the real spread and turns red over an enemy. Aim assist (Settings: off / low /
medium / high, touch and gamepad only) adds a little friction and a capped pull toward a visible
target in a narrow cone in front of you, never behind you or through walls.

Touch with fists: there is a stick, plus a tap for a light hit, a hold for a heavy hit, Blk to block,
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

Gameplay pass (this build):

- Shooting (`CombatSystem`, `CameraRig`): every shot is a ray from the rendered camera through the
  crosshair, traced again from the muzzle so walls in between still stop it. Per-weapon hip/ADS/
  moving spread, bloom and recovery, recoil that kicks the view up and settles back, reloads,
  headshots, hit markers. Gun stance levels the camera when you draw a weapon.
- Survivability: 300 health at the start (+60 per Constitution level). A body vest is a separate
  layer (150 points) that takes 75% of each hit until it is spent. A lone pistol needs 10-12 body
  hits. NPC fire against the player is slower and less accurate than before, so a gunfight with
  three gangsters lasts about three times as long (17-18 s before, ~53 s now, same setup).
- Vehicles: speed-sensitive steering (tight at parking speed, calm at speed), stronger brakes with
  class differences and weight transfer, better reverse steering, twice the durability with seven
  damage stages (normal, light, damaged, smoking, heavily damaged, critical, destroyed). Visual
  tiers BEATER / COMMON / NICE / SPORT / LUXURY / RARE (paint finish, trim, rims, lights) with LOD
  meshes. Rare models park in the wealthy districts; the garage screen is a collection view.
- Inventory (`Inv`, `Armory`): product is counted by weight or pieces with a cost basis in every
  location (on you, vehicle trunks, safehouse, property, warehouse). Market value, unrealised and
  realised profit. Guns are single items that live on you or in a stash; ammo is counted; the
  Armorer has Buy weapons / Buy ammo / Buy armor / Loadout / Stash tabs.
- `DeliveryManager`: crew runners move product between your locations for a fee, with a success
  chance from the runner and the route, and outcomes from SUCCESS to BETRAYAL, reported afterwards.
- `RoyaltySystem`: rival crews operating on your turf pay royalties that grow with your influence.
- `Gamble` (`[UNDERWORLD] GAMBLING`): Fuel & Go scratch cards ($5-$100, grand prizes $12,500 to
  $1,000,000) and the Lucky Pump slot; the Valen Royale casino on the Nightlife Strip (block 5,9)
  with a cashier, bar, slot floor (classic, 5-reel video, high-volatility, progressive, VIP),
  blackjack, European roulette and fixed-limit Hold'em against four AI personalities, with LOW /
  STANDARD / HIGH / VIP limits by standing. Every bet is settled in one step before its reveal; an
  open blackjack hand and poker chips survive a reload. Every game keeps a house edge.
- Roads (`splinePts`, `Links`, `GPS`): Greenway Park Drive and the Cedar Fields road are smooth
  curved through-roads. One polyline feeds the ground shader, both maps, traffic (which turns off
  onto them and merges back) and the GPS. The lattice graph is unchanged. District road styles
  (`ROAD_STYLE`) for the Old Quarter, Financial District, industrial areas, residential hills and
  the Strip.
- Map: tap open ground for a district card (police, turf, territory tax, property, street prices),
  tap a curved road for its card, and a Street prices layer.

The save key is `pvunderworld.save.v1` and the schema version is 4 (v3 saves migrate on load). Saves are versioned, sanitized
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
node underworld/tests/shooting.mjs  # crosshair alignment, walls, hip fire, recoil, ADS, reload, aim assist, 3-touch layout
node underworld/tests/survival.mjs  # health pool, hits to kill, vest layer, regeneration, real AI gunfights
node underworld/tests/vehicles.mjs  # turning, reverse, braking, durability, damage stages, tiers, LOD, parking, collectibles
node underworld/tests/inventory.mjs # located inventory, cost basis, armory, deliveries, royalties, v3 migration
node underworld/tests/gambling.mjs  # scratch cards, slots, casino games, limits, records, no money duplication
node underworld/tests/roads.mjs     # curved roads, traffic on curves, GPS, road styles, interactive map
node underworld/tests/perf.mjs underworld/index.html   # frame-cost probe (THREE_DIR=... to compare the CDN-based template)
```

Each suite prints PASS/FAIL lines and a summary, and it exits non-zero if any check fails.

## Validation record (this build, 2,590,386 bytes, sha256 `51dd45212692`)

Every suite was run offline against this pass (headless Chromium, SwiftShader):

| Suite | Result |
| --- | --- |
| smoke | 16 / 16 |
| core (melee facing, combo + step-in stress, reverse speed, reverse-camera transitions) | 64 / 64 |
| arrest (9 situations, stale-state audit, death respawns) | 126 / 126 |
| session | 33 / 33 |
| ui (map / minimap / touch) | 23 / 23 |
| offline | 14 / 14 |
| phone (8 phone sizes) | 71 / 71 |
| map | 22 / 22 |
| city | 25 / 25 |
| property | 33 / 33 (one intermittent failure of the motor-court exit drive in 1 of 4 runs; see below) |
| stress (realistic phone session) | 29 / 29 |
| soak (12 cycles: no listener/timer growth, heap 91.7 → 91.7 MB, frame cost 116 → 95 ms) | 37 / 37 |
| shooting (new) | 37 / 37 |
| survival (new) | 9 / 9 |
| vehicles (new) | 39 / 39 |
| inventory (new: located inventory, armory, deliveries, royalties, v3 migration) | 58 / 58 |
| gambling (new) | 57 / 57 |
| roads (new: curved roads, traffic, GPS, styles, map) | 18 / 18 |
| master checksum (`sha256sum -c master-template-1.0-stable.sha256`) | OK |

Known intermittent: property's "drive into the exit lane: back out on the estate drive" (a
timing-driven drive out of the mansion motor court) failed once in four runs and passed on the
other three. The parking test in the vehicles suite also failed once during development and has
passed in every run since; its failure output now includes a position trace.

`port-valen/tests/playtest.mjs` (the original template's playtest) needs the jsDelivr CDN to boot the
template. It can't boot in an offline sandbox, before or after this pass.

Performance from `tests/perf.mjs` (SwiftShader), the original build of this pass against this build:

| | original build | this build |
| --- | --- | --- |
| desktop, low: game-logic update (calm / busy) | 1.07 / 0.76 ms | 0.72 / 0.76 ms |
| desktop, low: draw calls / triangles (calm) | 111 / 348k | 113 / 354k |
| phone profile (4x CPU throttle, 800x400): update (calm / busy) | 3.75 / 3.05 ms | 3.44 / 3.01 ms |
| phone profile: draw calls / triangles (calm) | 232 / 877k | 241 / 883k |
| wall ms/frame, phone busy (GPU-bound in SwiftShader, noisy) | 889 | 1000 |

The first-drive hitch reported on phones could not be reproduced here: both builds show the same
first-play pattern, shader programs already compile behind the start-of-play fade, and the frame
where you get into a car costs under 100 ms of script even at 4x CPU throttle. A warm-up pass behind
the fade was tried and measured worse (it draws the whole streaming radius at once), so it was not
kept. An on-device profile is needed to find the cause.
