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
