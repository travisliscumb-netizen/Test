# Block Stack 3D

A 3-D block stacking game for iPhone and web. 100 levels across 10 worlds, with a
boss climb every 10th level.

**Play:** open `game.html` — from a web server, from GitHub Pages, or by opening
the file directly. No build step, no CDN, no network access required.

```
npx http-server -p 8080 -c-1 .     # then open http://localhost:8080/game.html
```

> The repository root `index.html` is an unrelated app that was already here and
> has been left untouched. To serve the game at the root instead, move
> `game.html` to `index.html` (the `src/` and `vendor/` paths are relative and
> keep working).

---

## How it plays

A block slides back and forth above the tower. Drop it, and whatever hangs over
the edge is sliced off — the next block inherits the smaller footprint. Miss the
tower entirely and the run is over.

* **Tap anywhere** or press **Space** / **Enter** to drop. **Esc** returns to the map.
* Land three **perfect** drops in a row and some of the lost size is restored,
  capped at the level's own starting size.
* **Normal levels** ask for a fixed number of successful stacks (5 at level 1,
  rising to 19 by level 99).
* **Boss levels** (10, 20, 30 … 100) are survival climbs. The required height is
  the level number: boss 10 wants 10, boss 100 wants 100.

### Boss rules

* Play never pauses. Hitting the required height does not interrupt anything —
  the next block is already sliding.
* Once the height is reached an **Advance** button appears. Press it whenever you
  like, or ignore it and keep climbing for a better record.
* **Fall after reaching the target and the boss still counts as cleared.** Fall
  before reaching it and the boss is failed; retry.
* Your best height for each boss is tracked separately and saved.

Progress (highest unlocked level, per-boss best heights, best scores, lifetime
stats, sound preference) is stored in `localStorage`. If storage is unavailable
the game degrades to in-memory progress instead of breaking.

---

## The 10 worlds

Each band of 10 levels has its own identity, and every level inside a band
rotates the palette and shifts the sky so no two levels look alike. The sky gets
progressively deeper from world 1 to world 10, so the climb reads as altitude.

| World | Levels | Name | Feel |
|-------|--------|------|------|
| 1 | 1–10 | Meadow Rise | bright daylight blue, primary colours |
| 2 | 11–20 | Berry Orchard | sunny blue to warm wheat |
| 3 | 21–30 | Copper Canyon | dusty terracotta, distant peaks |
| 4 | 31–40 | Harbour Deep | deep sea blue, teal and brass |
| 5 | 41–50 | Amber Ridge | the long golden hour |
| 6 | 51–60 | Pine Pass | cold blue, forest greens |
| 7 | 61–70 | Glacier Steps | ice blue, thin air |
| 8 | 71–80 | Sunset Deck | violet sky over an orange horizon |
| 9 | 81–90 | Aurora Heights | night begins, first stars |
| 10 | 91–100 | Starlit Summit | deep night, gold and warm white |

Art direction is deliberately bright, rich and toy-like — painted wooden blocks.
No pastels, no neon, no cyberpunk; `test/logic.test.cjs` asserts this
numerically against every colour of all 100 levels.

---

## Difficulty design

Everything is a smooth, monotonic function of the level number. There are no
random per-level modifiers, so difficulty never spikes.

| Lever | Level 1 | Level 100 |
|-------|---------|-----------|
| slide speed | 2.5 u/s | 7.6 u/s |
| perfect window | 95 ms | 18 ms (×1.28 on bosses) |
| starting footprint | 100% | 58% |
| movement variation | none | ±36% velocity sway |
| stacks to clear | 5 | boss: 100 |

The perfect tolerance is defined as a **time window**, not a distance. Defining
it in world units would make late levels quadratically harder — the block moves
faster *and* the target shrinks — which lands past human reaction limits and
feels broken rather than hard.

`test/balance.mjs` verifies this by simulating thousands of runs against modelled
human tap timing (σ = 25 / 45 / 75 ms). Sample of the tuned curve:

```
player                 1     5   *10    15    25    35    45   *50    65    75    85   *90    95    99  *100
expert  (σ 25ms)    100%  100%  100%  100%  100%  100%  100%  100%  100%  100%  100%   99%   99%   96%   34%
good    (σ 45ms)    100%  100%  100%  100%  100%  100%  100%  100%  100%   98%   78%    1%   38%   18%    0%
casual  (σ 75ms)    100%  100%  100%  100%  100%  100%   99%   81%   69%   38%    8%    0%    1%    0%    0%
```

Early levels are forgiving for anyone, the endgame is brutal, and nothing is
impossible — boss 100 is a genuine achievement rather than a coin flip or a wall.

---

## Single-file build

`game.html` loads `src/` and `vendor/` as separate files. To get the whole game
as one self-contained HTML file instead — everything inlined, no relative paths,
no network access — run:

```
npm run build
```

* `dist/block-stack-3d.html` — a complete standalone document. Drop it on any
  static host, open it from disk, or mail it to someone.
* `dist/block-stack-3d.artifact.html` — the body-only form for hosts that supply
  their own `<!doctype>`/`<head>`/`<body>` wrapper. It re-applies the head
  metadata at runtime, because the game needs `viewport-fit=cover` and pinch
  zoom disabled and a host's default viewport meta has neither.

`dist/` is generated, so it is not committed — the build is the source of truth.

---

## Project layout

```
game.html               markup, HUD, CSS, overlays
src/logic.js            pure rules: level curves, boss targets, slicing,
                        recovery, themes, persistence. No DOM, no WebGL.
src/render.js           three.js scene: rounded-box geometry, lighting,
                        camera framing, effects, decor
src/game.js             state machine, input, HUD wiring, debug hooks
vendor/three.min.js     three.js r180, bundled as a global (see vendor/README.md)
test/logic.test.cjs     29 unit tests over the rules
test/balance.mjs        difficulty simulation with assertions
test/e2e.mjs            343 checks driving the real game in headless Chromium
tools/build-artifact.js bundles everything into one self-contained HTML file
```

`src/logic.js` deliberately has zero dependencies on the DOM or WebGL, so every
rule in the game is unit-testable in Node and the renderer can never disagree
with the rules about what a drop did.

The moving block is a real rounded-box solid built from 6 flat faces, 12
quarter-cylinder edges and 8 spherical corners (≈200 triangles), with exact
normals — which is what produces the clean edge highlights. It is never a
billboard, a plane, or a scaled quad.

---

## Running the tests

```
npm test              # unit + balance + end-to-end
npm run test:unit
npm run test:balance
npm run test:e2e      # needs playwright + chromium
KEEP_SHOTS=1 npm run test:e2e     # keep screenshots in test/out/
node test/e2e.mjs --headed        # watch it play
```

The end-to-end suite boots the real game in headless Chromium (WebGL via
SwiftShader), starts its own static server on a free port, and covers:

* normal level clear flow, and the exact stack count that clears it
* overhang slicing and size inheritance on both axes
* the moving block's geometry **and rendered pixels** — it samples the colour of
  the top, front and side faces to prove three separately-lit faces are on
  screen, i.e. a solid, not a flat sheet
* boss levels on every 10th level with targets 10…100
* boss failure before the target, boss target then manual exit, boss target then
  continued climbing then a fall
* per-boss best heights, including that a worse run never overwrites a record
* persistence across a reload
* 3-perfect recovery, including that repeated refunds never breach the cap
* touch controls (including that a tap ending a run cannot also press the button
  that appears under the finger), keyboard controls
* layout at 320×568, 390×844, 430×932 and landscape: no scrolling, no overflow,
  44px touch targets
* a 100-stack boss climb with mesh culling and no runtime errors
