# Final audit

A second pass over the whole project, done as a review of someone else's work after all five milestones were built.

## What was checked

1. **Re-read for bugs and unfinished work:** the simulation core (`game/world.ts`, `game/game.ts`, `entities/*`), `main.ts`, `core/loop.ts`, and `render/renderer.ts`, line by line. Every other module was reviewed when written and is held to its contract by tests.
2. **Dead code:** a script listed every exported symbol with no uses outside its own file. Each hit was either deleted, made private, or given tests.
3. **Leftovers:** searched for TODO, FIXME, stub, hack and stray `console.log` in `src`, `tests`, `tools` and `e2e`. None remain. The only `console.log` is the screenshot tool's intended output.
4. **Visual QA in a real browser:** sprite sheets for every theme; each level rendered whole with `tools/levels.html`; live play at desktop size, iPhone landscape (844×390 @3×) and iPhone portrait; the flagpole, walk-out and tally sequence.
5. **Full verification:** type-check (browser and Node configs), unit tests, production build, and Playwright end-to-end tests against the built file.

## What was found and fixed

| # | Found | Fix | Proof the fix is right |
|---|---|---|---|
| 1 | `PixelCanvas.set` silently dropped pixels at fractional coordinates (a typed array ignores a fractional index), so clouds rendered as a circle and a line | Snap coordinates to integers; ellipses iterate whole pixels | New test in `gfx.test.ts`; clouds checked again in screenshots |
| 2 | Pits showed bright sky at their bottom in every theme | The nearest parallax layer now reaches the bottom of the view | New test: an opaque layer covers the view's bottom row, in all 4 themes |
| 3 | Two suns or moons on screen at once (the layer tiled narrower than the view) | Landmark layers are wider than the widest view | New test |
| 4 | Fortress stone was a loud saturated red | Muted to dark maroon | Screenshot review |
| 5 | Portrait title showed `?PUSH FAR TO RUN?`: `(` and `)` were missing from the font | Added the glyphs. The font test now reads every string literal in the renderer instead of a hand-picked list | Mutation check: deleting `(` makes the test fail and names the string |
| 6 | On touch screens the HUD's lives counter sat under the mute and pause buttons | HUD laid out in 5 even columns; the top-right corner is reserved in touch mode | Re-shot the iPhone landscape view |
| 7 | `stepEffects` appended score popups to the array it was iterating, so a new popup was also stepped in that frame | Collect popups, then append after the loop | World tests still pass; behaviour is now exact |
| 8 | **Physics bug:** the airborne speed cap was only set on jump take-off. Walking off a ledge after an earlier running jump let you reach running speed in the air without holding run | Refresh the cap on every grounded step | New regression test; confirmed it **fails** with the fix stashed and passes with it |
| 9 | Off-screen actors were culled only on the left, so a shell kicked right slid on forever, knocking out enemies off-screen | Cull past the right edge too, with a margin wider than the activation margin | Two new tests: far-off shells are removed; enemies just past the edge are kept |
| 10 | A new high score was saved only between runs, so closing the tab mid-run lost it | Also saved when the page is hidden | Code review (browser storage path) |
| 11 | The title backdrop never animated (its frame counter only ticked during play) | Tick the counter on the title without simulating | New test: frame advances, hero does not move |
| 12 | `viewWidthFor` and `placeView` (screen-fit maths) had no tests | Added `display.test.ts` covering landscape phone, portrait phone, ultrawide and letterboxing | 5 new tests |
| 13 | Dead code: `PixelCanvas.recolor`, `PixelCanvas.from`, the unused stop function returned by `runLoop`, and two theme colour fields nothing read | Deleted | Type-check with `noUnusedLocals` passes |
| 14 | Docs: README's art example would have failed the size test it mentions; the parser was described as reporting file lines, but it reports map row and column | Corrected the wording | — |

Earlier, during the per-unit checks, I also fixed off-by-one windows in coyote time and jump buffering (they now use exact "steps since" counters and are tested at both boundaries), and gave the level solver a heap and an `exhausted` flag. With the flag, its negative controls prove impossibility by exploring every reachable state instead of passing because the search budget ran out.

## Re-verification of the fixes

After all fixes, everything was run again from scratch:

```
npm test           14 files, 194 tests passed
npm run build      type-check (both configs) clean; dist/index.html = 102,058 bytes, no external references
npx playwright test
  ✓ holding right and pressing jump for 5 seconds moves the hero, no console errors (x 102 → 802.8)
  ✓ pause stops the simulation and resumes it
  ✓ on-screen controls start the game and drive the hero (iPhone landscape)
  ✓ the pause button pauses
  4 passed
```

Tests that guard the fixes and the brief's requirements:

- **Collision resolution:** `collision.test.ts` covers flush landing, walls on both sides, no tunnelling at any speed, no seam snagging, and walking out of an embedded wall. `fuzz.test.ts` runs up to 12,000 frames of random input per level (3 seeds) and checks the hero is never left inside a solid tile.
- **Jump physics:** `player.test.ts` covers variable height, the running jump, the coyote and buffer windows at their exact boundaries, skids, speed caps, corner correction, bump targeting and determinism.
- **Enemy stomp and kill logic:** `world.test.ts` covers squash, stomp chains, double stomps, side hits, shrinking, invulnerability, shell kick, shell combos, stopping a shell, shell revive, ledge turning, block-bump kills and right-edge culling.
- **Levels:** `level.test.ts` checks format and structure, and `reachability.test.ts` proves every level can be finished from its start and from every checkpoint.

## Known limits (deliberate, not defects)

- The completability proof plays as a small hero with no enemies. It proves the geometry can be traversed, not that a particular run with enemies is survivable. That is covered by play-testing and the rules tests.
- The e2e suite runs Chromium. Mobile Safari specifics (audio unlock, the silent switch, safe areas) are handled in code following WebKit's documented behaviour, but no real iPhone was available in this environment to test on.

## Second round: jump fix and hi-res art overhaul

**Jump.** Measured the problem before changing anything: a held standing jump peaked at 3.88 tiles, but level 1 has two 4-tile pipes and block tops 4 tiles up, so they could only be reached with a running start. Jump velocity was raised (standing ≈ 5.2 tiles; running still highest). New tests:
- a 4-tile pipe can be climbed from a standstill without running;
- walking jumps go at least as high as standing ones;
- **every level can be finished without ever pressing run** (the solver run with the run button disabled).

**Art.** The pixel pipeline (indexed images, palettes, bitmap font, low-res buffer, sharp-bilinear scaling) was replaced by painted vector art drawn at native resolution.

| Found during the rewrite | Fix | Proof |
|---|---|---|
| Snapping the scale to whole-pixel tiles brought back thin bars on phones | Paint the snapping slack (extra backdrop, ground continued past the map edges) | Display tests require the painted area to cover the whole screen on four phone sizes; the rotation e2e test checks both screen edges |
| Title, level card and pause overlays didn't cover the slack, leaving visible borders | Overlays fill the whole painted area | Screenshot review |
| Ground tiles painted lazily the first time they scrolled into view caused 100–150 ms hitches | Paint every ground variant up front; warm the next level's art during the level card | p95 frame interval 117 ms → 50 ms; worst frame 150 → 67 ms |
| 40 radial gradients created per frame for ambient particles | One pre-painted glow sprite, drawn with `drawImage` | Same measurement |
| CPU-only rendering at 3× density ran at ~30 fps | Adaptive resolution (`FrameBudget`): steps down 3× → 2× → 1.5× when the median frame is slower than 22 ms | Unit tests for the policy; in the test browser it settles at 2× and a 16.7 ms median |
| Grub's single mandible read as a cigarette; Shellback's peeking eyes were hidden behind its shell; raised arms crossed the hero's face | Redrawn | Art preview at `/tools/art.html` |
| Oversized clouds, busy soil texture, slab-like snow caps | Retuned | Screenshot review of all four worlds |
| `paint.bake` left unused once the art cache replaced it | Deleted | Dead-code scan |

**Testing the art for real.** `@napi-rs/canvas` gives the unit tests a real Canvas 2D:
- `art.test.ts` paints every hero pose (both forms), each enemy state, the items, the flag and the tower, and checks each paints and stays inside its box;
- it checks that every tile is a whole number of pixels at three scales, and that ground fills are solid with matching edges between variants (no seams);
- it checks that every backdrop's nearest layer covers the bottom of the view (pits never show bare sky);
- `render.test.ts` renders the title, intro, pause, game over, ending, every level along its whole length, and every hero phase.

**Re-verification:**

```
npm test             15 files, 214 tests passed
npm run build        type-check clean; dist/index.html = 111,741 bytes
npx playwright test  5 passed (rotation, smoke, pause, touch, touch pause)
```

**Limit:** frame-rate figures come from headless Chromium rasterising on the CPU. The adaptive resolution is the safeguard for real devices; it has not been measured on an iPhone.

## Third round: Bud's Takeover reskin

A reskin, a light difficulty tweak, a hidden Easter egg and a bug sweep. Not a rebuild: no level geometry, platform position or enemy mechanic changed.

### Proof that what had to stay the same did

- **Level maps:** byte-identical to the previous commit in all four levels (`cmp` of the 15 map rows); only the name, theme and time header lines changed.
- **Golden test** (`tests/golden.test.ts`): hashes recorded from the previous commit cover:
  - every tile, the start, flag, goal and checkpoints;
  - every enemy spawn;
  - a 900-frame patrol of every enemy;
  - a 1,500-frame scripted run of the hero.

  All four levels match. Mutation checks: changing one tile in level 2 fails that level, and changing `maxFallSpeed` by 0.01 fails all four.
- **Reachability:** every level can still be finished from its start and every checkpoint, with and without the run button.

### Bugs found and fixed

| # | Found | Fix | Proof |
|---|---|---|---|
| 1 | A backdrop layer whose scaled height isn't a whole number of pixels has a half-painted last row. The renderer stretches that row into any slack below the view, so it could show as a pale strip under pits | `bakeLayer` replaces the partial row with a copy of the last whole one | The backdrop test now bakes with the real `bakeLayer` at a scale that leaves fractional heights; it failed before the fix |
| 2 | The full-layer haze fills (5 layers across 3 themes) also tinted the transparent sky around the scenery, leaving a faint rectangular band | New `tint()` paints only over pixels already drawn (`source-atop`) | Unit test: a tinted layer's empty pixels stay fully transparent |
| 3 | The street's shop fronts (awnings, windows, signs) sat 6–64 px below the ground line: hidden behind the ground, visible only at the bottom of pits | Raised the layer so the shop fronts end at the ground line | Screenshots of Main Street before and after |
| 4 | Bud's chest print was hidden by his arms and hood in most poses; his bandana, trailing from his hand, read as a blade | Front shoulder moved to the torso's leading edge, print lowered, hood smaller; bandana moved to the back pocket | Art preview of every pose |
| 5 | `BUILDS.small` had a garbled `headY` entry, and `drawArm` an unused parameter | Corrected; removed | Type-check; art tests |
| 6 | Three critters (rat, squirrel, spider) poked out of their art boxes on some frames | Trimmed tail, whiskers and leg reach | The art test checks every critter, every walk phase and state, stays in its box |
| 7 | The rebar spider was nearly invisible on the downtown night sky | Lighter body and legs, with legs drawn behind the body | Downtown screenshot |
| 8 | Docs and comments still described Moss, Grubs, Shellbacks and the old level names and themes | Updated README, DECISIONS, the level-format comment and the debug hook's name | Search for old names: only the legacy storage keys remain, kept on purpose so saved high scores and the mute setting carry over |

### Every change

- **Rename to Bud's Takeover:** title screen, page title, metadata, `package.json`, favicon (a cap), the ending text and the debug hook (`window.__budsTakeover`). Stored high score and mute setting migrate from the old keys.
- **Bud:** new hero art posed by the existing skeleton:
  - black cap with his own "B";
  - black hoodie with "BUD" across the front;
  - headphones round his neck, red bandana in his back pocket, chunky white sneakers;
  - heavy-lidded eyes and a smirk.

  He walks with a hand in his pocket, leans back when idle, and pumps both arms when running. His hitbox and physics are unchanged.
- **Themes and backdrops:** see the sub-list below.
- **Critters:** ten original ground-based critters, one module each in `src/gfx/art/critters/`, assigned per theme (rosters in DECISIONS). Grub and Shellback art were deleted. Enemies gained a cosmetic `variant` number, fixed by their order among their kind in the level file.
- **Difficulty:**
  - invulnerability after a hit 2.0 → 2.5 s;
  - stomp window 12 → 16 px;
  - side contact forgiven up to 3 px;
  - each level's clock +50 s.

  No enemy speeds or physics changed (`tests/difficulty.test.ts`).
- **God mode:** the title screen's lone floating brick toggles it, with a flash and a sound; it glows faintly while armed. It means no damage, no time-out, a rescue from pits to the last ground stood on, and a faint aura on Bud. There is no on-screen label.
- **Tools:**
  - `tools/art.html` shows every critter and the rosters;
  - `tools/levels.html?enemies=1` shows every critter at its spawn.

**Themes and backdrops.** The first four of the requested theme order are used, each with its own tiles and music:

1. Street: sidewalk, red brick, a shop row with awnings and invented signs, lamps and trees.
2. Park: grass, mossy stone, ponds, benches, flower hedges.
3. Construction: gravel, cinder block, yellow stone, orange pipes, tower cranes, a steel frame, a fence and hazard barriers, at golden hour.
4. Downtown: granite, steel blue, night towers, invented billboards and neon OPEN signs.

The other fifteen themes are unused (listed in DECISIONS).

### Re-verification

```
npm run build        type-check (both configs) clean
                     dist/index.html = 137,419 bytes (was 111,741; +25,678, from the new art)
                     only URL inside: the SVG namespace in the inlined favicon (nothing is fetched)
npm test             18 files, 246 tests passed
npx playwright test  8 passed: God-mode click (desktop) and tap (phone), the no-God-mode control,
                     rotation, smoke (no console errors), pause, touch, touch pause
```

**Limits.** God mode's pit rescue is proven by unit tests (a real fall and rescue) rather than in the browser run, which stops at the first pipe without jumping. As before, no real iPhone was available.
