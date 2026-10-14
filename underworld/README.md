# Port Valen: Underworld

A free-roam systemic crime sandbox in one HTML file (`index.html`). It was built from a copy of
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
| M, then T | Big map, then the territory overlay (tap a turf for details) |
| B (in a car) | Look back |
| F5 | Quick save (only when it is safe) |
| Esc / P | Pause |

Touch: there is a stick, plus a tap for a light hit, a hold for a heavy hit, Blk to block,
Blk plus the stick to dodge, and a Phone button that opens the Empire screen.

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
CYCLES=10 node underworld/tests/soak.mjs  # long session: entities, listeners, timers, GPU memory, frame cost, heap, save round-trip
node underworld/tests/shots.mjs     # screenshots for visual review
node underworld/tests/perf.mjs underworld/index.html   # frame-cost probe (THREE_DIR=... to compare the CDN-based template)
```

Each suite prints PASS/FAIL lines and a summary, and it exits non-zero if any check fails.

## Validation record (build `939c6f4592d8`, 2,202,929 bytes)

These numbers come from the final build, with every suite run offline:

| Suite | Result |
| --- | --- |
| smoke | 16 / 16 |
| core (melee facing, combo + step-in stress, reverse speed, reverse-camera transitions) | 64 / 64 |
| arrest (9 situations, stale-state audit, death respawns) | 126 / 126 |
| session (run twice) | 33 / 33, 33 / 33 |
| ui (map / minimap / touch) | 23 / 23 |
| offline | 14 / 14 |
| soak (12 cycles) | 37 / 37 |
| original template playtest (`port-valen/tests/playtest.mjs`) | 36 / 36 |
| master checksum (`sha256sum -c master-template-1.0-stable.sha256`) | OK |

Performance comes from `tests/perf.mjs` in SwiftShader. Wall ms/frame there is GPU-emulation-bound, so
it's only useful for comparing builds:

| | template | underworld |
| --- | --- | --- |
| desktop, low: game-logic update | 0.30–0.62 ms | 0.62 ms |
| desktop, low: draw calls / triangles | 95–97 / 327k | 111 / 274–353k |
| phone profile (4× CPU throttle, 800×400, quality 1): update | 2.8–3.4 ms | 2.6–3.4 ms |
| phone profile: draw calls / triangles | 194–201 / 782–794k | 202–240 / 642–868k |
