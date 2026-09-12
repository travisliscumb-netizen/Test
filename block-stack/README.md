# Block Stack

A precision stacking game. 100 levels, 10 worlds, 10 bosses. Mobile-portrait
first, installable, fully playable offline.

**Tap to place. Anything hanging over the edge is cut away.** That is the whole
control scheme and it never changes.

---

## Running it

It is a static site with no build step and no dependencies.

```
cd block-stack && python3 -m http.server 8080
# then open http://localhost:8080
```

ES modules need a real origin, so `file://` will not work — any static server does.

---

## Layout

```
block-stack/
  index.html              shell + DOM for every screen
  manifest.webmanifest    PWA: standalone, portrait, full icon set
  sw.js                   precaches the shell; cache-first with background refresh
  icons/                  generated, see tools/make-icons.mjs
  src/
    config.js   worlds, palettes, balance tables, level generation   (pure)
    engine.js   placement, cutting, recovery, scoring, run state     (pure)
    render.js   fixed 2:1 dimetric canvas renderer + world scenery
    audio.js    synthesised SFX and per-world generative music
    save.js     versioned localStorage, records, achievements
    icon.js     the app icon artwork, as vector
    main.js     loop, input, screens, feedback, progression
    ui.css
tools/
  sim.mjs         headless balance telemetry across all 100 levels
  make-icons.mjs  renders the icon set from src/icon.js
  serve.mjs       tiny static server used by the tools
tests/
  playtest.mjs    end-to-end Chromium playtest at three iPhone sizes
```

`config.js` and `engine.js` import nothing from the DOM, which is what lets the
balance simulator drive the exact code the game runs.

---

## Design decisions worth knowing

**No rotation, anywhere.** Not the stack, camera, incoming block, world or
landing plane. The camera's only motion is a vertical follow so the landing
surface stays at a constant screen position. Difficulty comes from timing,
direction, rhythm, axis changes and precision — never from re-reading the
perspective.

**2.5D by hand, not by engine.** The projection is a fixed 2:1 dimetric: world
X runs down-right, Z down-left, Y straight up. With a fixed camera and no
intersecting geometry, painter's order is simply bottom-to-top, so a full 3D
engine would buy nothing and cost a large download plus GPU time on a phone.
Faces are drawn with per-face lighting, a chamfer plate, a specular sheen and a
crisp top edge.

**The landing shadow is a mechanic, not a decoration.** The incoming block's
footprint is drawn on the landing surface, and darker where it actually
overlaps. The player reads the cut before committing. Dashed guides extend the
platform edges along the travel axis. Poor readability is a bug, not difficulty.

**The perfect window is a time budget, not a distance.** `perfect` in the world
tables is in *seconds*; the engine multiplies it by the block's instantaneous
speed at the moment of placement. Defining it in world units — the obvious
first cut — means every speed increase secretly tightens precision too, and the
telemetry showed that compounding into an 11 ms window at level 100, which no
human can hit. As a bonus, a slow stretch of a rhythm is now honestly easier to
land, and an accelerating one honestly harder.

**Movement is learnable, never random.** Every rhythm is a pure function of
sweep progress: `constant`, `accel`, `decel`, `pulse`, `pause`, and `reverse`
(a scripted mid-sweep turn on a fixed six-sweep cycle). Nothing is generated at
runtime, so patterns can be mastered.

**Travel distance is short on purpose.** The block's path is about ±1.16–1.32
block widths around the target — roughly 30% shorter than a traditional wide
stacking path — so the player can compare block and platform without eye
movement. Difficulty never comes from moving the block far away.

**Hidden comeback assistance.** Below 45% platform width the next block gets
slightly slower, travels slightly less, and gets a slightly wider window,
scaling with how desperate things are. It is never announced.

---

## Balance, and how it was set

`node tools/sim.mjs` runs 220 simulated attempts per level per skill tier
through the real engine, using a timing-error player model (coincidence-
anticipation timing against predictable motion is roughly 20–50 ms SD in
humans; first-timers sit above it, practised action-game players below).

The `journey` tier models one player improving from 75 ms to 36 ms across the
game, which is the honest measure of the intended experience.

Current state:

| | level 1 | level 50 boss | level 100 boss |
|---|---|---|---|
| first-timer clear rate | 92% | 5% | 0% |
| journey attempts/clear | 1.09 | 1.29 | 7.86 |
| expert clear rate | 100% | 100% | 60% |
| expert 3-crown rate | 100% | 63% | 0% |

The hardest level in the game is level 100, the guards below pass, and no level
is more than ~2x its predecessor. Nobody has 3-crowned level 100 in simulation,
which is the intent.

The simulator earns its keep. It caught two real design bugs that no assertion
would have found: the perfect window being a distance rather than a time, and
the `pulse` rhythm placing its *slowest* moment exactly on the target centre —
which quietly made "rhythm" levels easier than constant-speed ones.

The simulator also enforces fairness guards and fails loudly on:

- a difficulty spike between consecutive levels
- levels 1–6 being hard for a first-timer
- any level grinding a practised player (>4.5 attempts, >9 for a boss)
- a late level handing out 3 crowns too freely
- runs that drag past 95 seconds

**One dynamic worth understanding:** shrink-versus-recovery is a bifurcation.
Above the equilibrium perfect rate a run is near-certain; below it, near-
hopeless. So clear rate on ordinary levels is a blunt instrument — they are
practice grounds — and the real late-game progression is the crown chase. The
guards are pointed at crowns accordingly.

---

## Testing

```
node tools/sim.mjs        # balance telemetry + fairness guards
node tests/playtest.mjs   # end-to-end Chromium playtest, writes .shots/
```

The playtest drives the real page: taps the canvas like a player, verifies
perfect play never shrinks the platform, that sloppy play resolves, that fail →
playing takes under 2 seconds, that pause actually stops the simulation, that
every world environment renders, that the boss continuation and banking work,
that progress and settings survive a reload, and that level 100 loads and
plays. It renders at 375/390/430-wide iPhone viewports, checks for page
overflow, fails on any console error, and verifies every manifest icon
resolves.

Both are dependency-light: `NODE_PATH` must point at a Playwright install for
the browser-driven ones.

---

## Regenerating icons

```
node tools/make-icons.mjs
```

Renders every manifest size, the Apple touch icons, the maskable variants and
`favicon.ico` from `src/icon.js` — vector artwork in the game's own projection,
supersampled 4x and downsampled so the bevels survive at 16px. It is a
purpose-built composition, not a scaled screenshot; the title screen draws the
same artwork, so the launcher icon and the game are literally the same picture.
