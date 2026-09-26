# Barnyard Abduction

Fly a flying saucer over a sunny farm, hold the tractor beam to abduct the
livestock, and keep moving when the farmer starts throwing tomatoes.

**Play:** open `index.html` in a browser. It is one self-contained file
(D-001) built on Three.js r128 (D-003) from a CDN. All geometry, textures,
sound and music are generated at runtime, so there are no asset files.
iPhone Safari is the primary target (D-004).

| Touch | Keyboard |
|---|---|
| Drag anywhere on the left half to fly (the stick appears under your thumb) | WASD / arrows |
| Hold **BEAM** | Space |
| Hold **SCOUT** for the whole-farm view | Q or Shift |
| ⏸ | P / Esc |

## What changed from the two earlier builds, and why

Both earlier attempts were rendered and played in headless Chromium before
anything was rebuilt. What was found:

| Problem | `…-build-n6h36t` | `…-next-task-pixo0t` | Now |
|---|---|---|---|
| Scout view | Rendered only sky (fog and far plane hid the farm) | Worked, but the farm was tiny and sparse | Solved numerically; exactly 5% margin on 6 device sizes; landmarks and a saucer locator stay readable |
| Camera | Low chase cam, animals were specks | Nearly top-down; **the saucer covered the spot you were beaming** | Fixed north-up at 47°. The beam spot sits at screen centre with the saucer above it, so it never hides the target |
| Look | Washed-out pastel | Neon lime, no tone mapping | sRGB + ACES done correctly for r128, soft baked shadows, textured hero buildings, cloud shadows |
| Controls | 5 buttons and a fixed stick | Beam button beside the stick | Floating stick, one big BEAM button, SCOUT. Altitude is automatic |
| HUD | ~40% of the screen | Radar, hull bar and 3 panels | Score + shield pips, goal chips, timer ring; world-anchored farmer alert |
| Scope | 25 cheats, upgrades, 10-map shell | 1 mission, no audio | 5 escalating missions + Free Flight, stars, full audio |

## The game

- **Missions.**
  1. *First Contact*: the farmer naps on the porch, and the tutorial teaches by doing.
  2. *Wake-Up Call*: the farmer patrols and throws tomatoes.
  3. *Shopping List*: only listed species count.
  4. *Double Trouble*: two farmers.
  5. *Golden Hour*: sunset lighting and heavy animals.
  6. *Free Flight*: no clock and no farmer; always unlocked.
- **Stars.** One for finishing, one for finishing with at least ⅓ of the time left, and one for taking at most 1 hit.
- **Beam.** Hovering over an animal shows a gold ring and makes the BEAM button pulse. Holding BEAM dips the saucer and lifts the animal. Heavier animals lift more slowly. Letting go drops the animal, which lands dizzy.
- **Scoring.** Quick successive captures build a combo of up to ×5.
- **Farmer.** He goes patrol → **?** (the ring fills as he notices you) → **!** (chase), with an arm wind-up and a whistle before each throw.
  - His first throw is always a warning shot.
  - A hit costs a shield pip, splats the screen, and **knocks the animal out of the beam**.
  - Shields regenerate. You can beam the farmer up for a bonus; he walks back out of the house, dizzy but unharmed.
- **Six species** with distinct behaviour:
  - Chickens zig-zag.
  - Sheep flock together.
  - Goats are curious and walk up to the saucer.
  - Horses spook from far away.
  - Pigs and cows are steady.
- **The barn restocks** the species a mission still needs, so a mission can always be finished.
- **Readability aids.**
  - Canopies stipple away when they sit between the camera and the saucer or its beam spot.
  - An arrow points to the nearest animal you still need when none are on screen.
- **Audio.** Everything is synthesised with WebAudio, including a species voice on each capture. The music ramps up whenever a farmer is chasing (D-018).
- **Autosave** writes stars and best scores to `localStorage`, guarded against private mode and corrupt data (D-019).

## Decisions that depart from the canon docs (owner: please confirm or overrule)

1. **Fixed north-up camera** instead of a chase cam that turns with you. It is
   still a third-person, top-down presentation. It was chosen because
   it keeps orientation stable for a young player and makes the scout view a
   zoom of the same camera rather than a cut. Tunables: `TUNE.cam`.
2. **No manual altitude and no boost button.** The saucer dips automatically
   while beaming. That means fewer controls for small hands. Both specs say boost and vertical
   movement are *allowed*, not required.
3. **The silo is solid**, in addition to the farmhouse, barn and windmill (D-008).
   It is 30 units tall, and flying through it looked broken.
4. **The barn has a red roof** (walls are red too). From the gameplay and scout
   angles you mostly see the roof, and a grey roof read as a grey block.
5. **Levels, stars and Free Flight replace** the upgrades, cheats and 10-map shell.
   Only Map 1 exists. Systems read everything map-specific from the `MAP`
   object (D-024), so a second map is a data plus builder job.

## Verify

```
npm install
npm run verify
```

`tools/verify.mjs` drives the real page in headless Chromium, with the real
Three.js r128 served locally. It uses real clicks, real pointer drags on the
stick and the actual BEAM button, and deterministic 60 Hz stepping. It
runs 46 checks, including:
- the UI flow and unlocks
- stick and beam input
- capture, drop and combo
- every farmer behaviour, hit and knock-out
- the loss and win paths
- Shopping List rules and restocking
- collision and fence limits
- pause and autosave, including a corrupt save
- the draw-call budget
- scout framing at 6 iPhone and iPad sizes (exactly 0.900 NDC, which is a 5% margin)

Screenshots are written to `../.shots/barnyard/`.

**Not verified here, so please check on a real iPhone:**
- Frame rate. The software renderer says nothing about GPU speed. The game steps its resolution down on its own if it drops below about 40 fps.
- Two-thumb touch feel.
- How the synthesised audio sounds.

Budget measured here: about 60 draw calls and 480k triangles in play; about 280 draw calls and 720k triangles in scout with 40+ animals on screen.

## Where to tune

Every gameplay number is in `TUNE` (saucer, beam, shields, combo, farmer,
camera, score) or `SPECIES` (points, lift time, speeds, fear radius). Missions
are in `LEVELS`, and the map layout, zones, routes and lighting profiles are in `MAP`.
