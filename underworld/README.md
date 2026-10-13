# Port Valen: Underworld

A free-roam systemic crime sandbox in one HTML file (`index.html`). It was built from a copy of
`port-valen/templates/master-template-1.0-stable.html`. The master template has not been changed.

You start with $0, no car, no weapon, no property, no crew and no reputation. There is no scripted
opening. Your first money can come from pickpocketing, mugging, glovebox loot, the chop shop, fencing,
street races (with a buy-in), dealing, street-fight bystander rewards, robbing criminals or a feed tip.
From there you can work up to City Kingpin.

## Run it

Open `underworld/index.html` in a desktop or mobile browser. Three.js 0.160 loads from
`cdn.jsdelivr.net`, the same way the master template does. The first load needs a network
connection. Everything else is inline.

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

The tests use Playwright with headless Chromium (SwiftShader). Run them from the repo root. When the
CDN is unreachable, set `THREE_DIR` to an unpacked `three@0.160.0` package and the tests serve
Three.js from it.

```
npm pack three@0.160.0 && tar xzf three-0.160.0.tgz      # once, offline copy
export THREE_DIR=$PWD/package
node underworld/tests/smoke.mjs     # boot, $0 start, every menu, map overlay, location layout
node underworld/tests/core.mjs      # melee facing in 8 directions, 180° turns, post-exit punch, combo, reverse speed/camera
node underworld/tests/arrest.mjs    # 6 arrest situations -> sentencing -> jail -> release -> full movement set
node underworld/tests/session.mjs   # $0 -> first money -> property -> crew -> turf -> corruption -> save/reload/repair
CYCLES=8 node underworld/tests/soak.mjs   # long session: bounded entities, no NaN, flat heap
node underworld/tests/shots.mjs     # screenshots for visual review
```

Each suite prints PASS/FAIL lines and a summary, and it exits non-zero if any check fails.
