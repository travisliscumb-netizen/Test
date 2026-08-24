# Barnyard Abduction

A kid-friendly browser UFO game. Fly a saucer around a 425 × 425 farm, use the
tractor beam to abduct livestock, and stay ahead of a farmer who throws turnips
at you.

Built from the canonical design corpus in Dropbox (`/Games/Barnyard Abduction`
and `/Barnyard Abduction Studio`) in a single pass.

---

## Run it

Open **`barnyard-abduction.html`** in a browser. No build step, no server, no
install. Primary target is iPhone Safari (D-004) — the whole control scheme is
touch-first.

It needs one online load of Three.js r128 from a CDN; everything else
(geometry, textures, audio, UI) is generated at runtime, so there are no asset
files to ship and nothing else to fetch.

**Controls**

| Touch | Keyboard (desktop review only) |
|---|---|
| Left stick — fly | `WASD` / arrows |
| ▲ ▼ — altitude | `R` / `F` |
| BEAM — hold to abduct | `Space` |
| SCOUT — hold for whole-farm view | `Q` |
| BOOST | `Shift` |

---

## Architecture

**One evolving HTML file (D-001).** No module folders, no bundler, no assembly
step — because development and verification happen on an iPhone with no build
tooling. `build/` holds the file split into ordered sections purely so it can be
edited and syntax-checked piece by piece; `tools/assemble.sh` concatenates them
back into the single deliverable. That is an authoring convenience, not a
module system.

```
barnyard-abduction.html      the game — the actual deliverable
build/                       ordered sections (authoring only)
  part_00_head.html            document shell, CSS, HUD + menu DOM
  part_01_core.js              tuning tables, cheat modifiers, save, audio
  part_02_map.js               map registry + Map 1 data
  part_03_world.js             terrain, fence, buildings, props, grass
  part_04_creatures.js         6 species + farmer models
  part_05_ufo.js               UFO, controller, camera/scout, input
  part_06_systems.js           animals AI, farmer AI, beam, projectiles, FX
  part_07_game.js              mission state, scoring, combos, main loop
  part_08_ui.js                HUD, menus, cheats, upgrades, campaign
tools/assemble.sh            rebuild the single file from parts
tools/verify.js              headless verification (86 checks)
docs/                        changelog, registry, assumptions, review queue
```

Sections talk through named interfaces on a shared namespace (`TUNE`, `CHEATS`,
`SAVE`, `WORLD`, `UFO`, `BEAM`, `ANIMALS`, `FARMERS`, `GAME`, `UI`) — Constitution
Rules 4 and 5, adapted to one file.

### Design decisions honoured

- **Tuning is data.** Every balance value lives in `TUNE` and `SPECIES`. Nothing
  gameplay-tunable is buried in logic (Tech Arch §6).
- **Cheats are first-class.** All 25 cheats write into one `CHEATS.mod` table;
  no system ever checks a cheat id directly (Constitution Rule 9, §28).
- **Maps are pluggable.** Every system reads bounds, regions, landmarks, spawn
  zones, NPC sets and missions off the map object. No system names a map
  (D-024). Only the Farm is built.
- **Scout framing is derived.** Camera height is computed each frame from
  `camera.fov` and aspect so the full fence plus a 5% margin is guaranteed in
  portrait and landscape — never a hand-tuned constant (D-012).
- **The farmer is never harmed.** He gets beamed up, flails comically, and walks
  back out of the farmhouse a few seconds later (§6).

---

## What's in it

**World** — 425 × 425 farm to the exact `STEP2_WORLD_SPEC` coordinates. White
picket perimeter fence, farmhouse and barn hub (upper-left), plowed field with
real furrow geometry (upper-right), kidney pond + reeds + working windmill
(lower-right), irregular tree grove (lower-left), curving dirt roads, and
countryside continuing past the fence. Region transitions are painted into
terrain vertex colours with smooth falloff — no hard quadrant lines.

**Hero assets** — the barn has a gambrel roof, structural frame, plank cladding,
trim, sliding doors with track and X-braces, hayloft with hoist beam, cupola and
weather vane. The farmhouse has a porch with posts/railing/steps, layered roof
with eaves, recessed windows with sills, chimney, and a mailbox. Neither is a
coloured box.

**Creatures** — six species, each with readable anatomy (eyes with highlights,
ears, snouts, horns, tails, combs, wattles, manes, hooves) and its own
personality: sheep flock, chickens scatter, goats wander unpredictably, cows
plod, horses spook, pigs burst. Farmer has hat, beard, plaid shirt, overalls
with straps and buckles, boots and a pitchfork.

**Systems** — hold-to-activate tractor beam with layered cone, travelling rings,
ground pool and a telegraphing lock ring; auto-lock on the nearest eligible
target; per-species lift resistance. Farmer patrol → suspicious → alert → chase
→ aim with a legible rising suspicion meter. Cartoon turnip projectiles.
Shields with regen. Combo multipliers up to 7×. Five Farm missions, permanent
upgrades, autosave, full settings, and all 25 cheats.

---

## Status — read this before assuming anything works

Implementation is **REVIEW_READY, not FINALIZED**. Per D-025, design being
finalised never means a thing is built, and code passing headless checks never
means it is verified on device.

`tools/verify.js` runs 86 checks — it executes the real game script against a
stubbed Three.js r128 and DOM, then drives thousands of simulated frames. It
proves the code runs, the spec coordinates match, capture/scoring/missions/
cheats/persistence all work, and scout framing is mathematically correct at
real iPhone aspect ratios.

```
node tools/verify.js
```

It proves **nothing about how the game looks or performs.** No GPU, no browser,
no touch. Shading, materials, lighting, frame rate and touch feel all need the
owner on an actual iPhone. See `docs/REVIEW_QUEUE.md` for the checklist.
