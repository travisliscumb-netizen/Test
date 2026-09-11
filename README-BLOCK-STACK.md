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

## Live deployment

**https://operation-blackgate-2-git-claude-block-stacking-f0ee23-travis16.vercel.app**

Hosted on Vercel from this branch, serving the repository as static files with no
install or build step (`vercel.json`). `/` rewrites to `game.html`, which is what
lets iOS pick up the `apple-touch-icon` when the page is added to the home
screen.

### Install it on an iPhone

1. Open the URL in **Safari** (not Chrome - only Safari can install to the home
   screen).
2. Share button, then **Add to Home Screen**.
3. It launches full-screen with no browser chrome, using `icons/icon-180.png`.

### Notes

* `.vercelignore` excludes the repository's unrelated root `index.html` from the
  deployment, so the deployed site serves only the game.
* The Vercel project's production branch is `main`, which does not contain the
  game - so this is a branch deployment. Merging into `main` would additionally
  serve it from the short production URL.
* Progress is stored per origin, so the deployed game, the local file and any
  other copy each keep their own unlocks and boss records.

---

## How it plays

A block slides back and forth above the tower. Drop it, and whatever hangs over
the edge is sliced off — the next block inherits the smaller footprint. Miss the
tower entirely and the run is over.

* **Tap anywhere** or press **Space** / **Enter** to drop. **Esc** returns to the map.
* Land three **perfect** drops in a row and some of the lost size is restored,
  capped at the level's own starting size.
* The sliding block casts **no shadow**. A shadow directly under it is a free
  aiming reticle, so the drop is judged by eye.
* **Stars** are earned on how much of the block survives the level, measured as
  area of the starting square: above 80% is three stars, above 60% two, above
  40% one. 300 stars are available across the 100 levels.
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

## The HUD, and how it was chosen

The dashboard was rebuilt against published guidance rather than taste, then the
candidates were measured rather than eyeballed.

**Principles applied** — *contextual minimalism* (show only what is needed, when
it is needed), *match information load to gameplay speed* (a fast tap game gets
essentials and visual cues, not text panels), *progressive disclosure* (detail
when there is time to read it), a clear *thumb zone* (persistent chrome stays out
of the bottom third), and 44px minimum touch targets.

**Three candidates were built and measured** in a bright world, a night world and
a boss level, at 390x844:

| Candidate | HUD height (worst) | Min text contrast | Verdict |
|---|---|---|---|
| A — panelled cards | 19.0% | 16.5:1 | Passes, but heaviest |
| **B — one glass rail** | **16.4%** | **16.5:1** | **Chosen** |
| C — type straight on the sky | 14.0% | **3.0:1** | **Rejected** |

C was the most appealing on paper and the smallest on screen, and measurement
killed it: with no panel behind it, HUD text sits on whatever sky the level
paints, and a mid-tone sky drops it to 3.0:1 — far below the 4.5:1 AA floor. It
only worked on the very light and very dark worlds. That is the whole reason for
testing instead of choosing.

**The measurements then improved the winner.** The boss row had three chips
reading REQUIRED / HEIGHT / BEST, but the goal gauge already says "HEIGHT 4 / 20"
— only the record was new information, so it became a small `best 6` beside the
gauge and a whole row disappeared. The world name was being squeezed to
"World 2 · …" in the rail, and is not needed mid-drop, so it became a title card
shown once when the level opens. Touch targets were 32px and are now 44px with a
smaller visible key inside the hit area.

Final: **10.8% of the screen** in portrait (from 27%), 46px in landscape, one
row of live state.

The block meter is the centrepiece: it is a *meter with thresholds*, not a
number. The track carries ticks at 40 / 60 / 80%, the fill is coloured by the
star tier you are currently in, and the perfect-streak dots sit inside the same
gauge — because three perfect drops are what refund that bar.

---

## The mechanics ladder

Difficulty is carried by mechanics, not by pace. Each one is introduced alone,
at a level boundary, with a title card that names it — so it can be learned
before it is combined with anything else. By world 10 they all run together.

| Level | Mechanic | What changes |
|-------|----------|--------------|
| 1 | Tap to drop | One axis alternation, one entry side, constant speed |
| 4 | Both sides | The block enters from either side |
| 8 | Entry patterns | Sides follow a repeating four-beat pattern |
| 11 | Turning tower | The whole playfield turns 45° between drops |
| 21 | Quarter turns | 45° or 90°, every second drop |
| 31 | Uneven speed | Fast through the middle, slow at the ends |
| 41 | Three-eighth turns | 135° joins the set |
| 51 | Hesitation | A pause at the same point on every pass |
| 61 | Half turns | 180°, and a turn on every drop |
| 71 | Live rotation | The tower keeps turning while you aim |
| 81 | Reversals | The block can double back mid-travel |
| 91 | Everything | Every mechanic, tightest tolerance |

### Rotation turns the playfield, not the block

The tower, the landing pad and the incoming block are one rigid group, and it is
the **group** that turns. Every drop is still square-on-square: the geometry is
untouched and only the player's visual reference moves. Rotating the incoming
block on its own would change the landing shape, which is a different and worse
game.

A turn still in flight is snapped to its target before a new one starts, so the
tower can never drift off the 45° grid into an orientation the player was never
shown. A full 360° turn only exists from level 71, where the tower is *also*
turning while the block travels — a 360° turn that ends where it started asks
nothing of the player.

### Nothing is random

Every per-drop decision — entry side, whether the tower turns and by how much,
whether the block doubles back — is a pure function of `(level, stack height)`.
There is no `Math.random()` anywhere in the gameplay path. Retry a level and you
get the identical sequence, so a pattern can be read, learned and beaten.

The movement rhythm is a function of **position** along the travel, not elapsed
time. The previous version modulated speed by a sine of absolute time with a
random starting phase, so the block behaved differently on every pass and could
not be learned — arbitrary rather than skilful. Now the same place in the travel
always behaves the same way.

### Speed is not the difficulty system

| | Level 1 | Level 99 |
|---|---|---|
| slide speed | 2.5 u/s | 5.4 u/s (**1.9×**, was 3.0×) |
| perfect window | 95 ms | 52 ms (was 18 ms) |
| mechanic load | 0.00 | 1.04 |

Most of what speed growth there is happens in the first half. A late level is
barely faster than a mid one — it is turning every drop, hesitating, reversing,
and running a pattern. The perfect window no longer collapses to 18 ms either:
demanding a near-frame-perfect tap *and* a freshly rotated reference was
doubling up.

Boss levels run the same mechanics at a sustainable pace — half the turn
frequency and half the spin rate — because a 100-drop unbroken climb is a
different test from an eight-drop level.

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
human tap timing (σ = 25 / 45 / 75 ms), with each level's mechanic load added as
an independent error source in quadrature — about 32 ms of extra error at full
load. Modelling it as a multiplier instead punished weaker players far harder
than stronger ones, which is backwards: re-reading a turned tower is a cognitive
tax, not a motor one, and costs roughly the same accuracy whoever you are.
Sample of the tuned curve:

```
player                 1     5   *10    15    25    35    45   *50    65    75    85   *90    95    99  *100
expert  (σ 25ms)    100%  100%  100%  100%  100%  100%  100%  100%  100%  100%   96%   79%   86%   78%   36%
good    (σ 45ms)    100%  100%  100%  100%  100%  100%  100%  100%   98%   90%   60%    2%   34%   26%    0%
casual  (σ 75ms)    100%  100%  100%  100%  100%  100%   97%   56%   57%   29%    8%    0%    2%    1%    0%
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
