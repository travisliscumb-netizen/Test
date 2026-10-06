# Decisions

Choices made while building the game (first as Sprout Quest, now reskinned as Bud's Takeover), with the reasoning. Newest concerns are grouped by area, not by date.

## Identity and originality

- **Name and cast.** The game is *Bud's Takeover* (renamed from *Sprout Quest*). The hero is **Bud**, drawn from the supplied reference: a confident chibi kid in a black cap, a black hoodie with "BUD" across the front, headphones round his neck, a red bandana in his back pocket, white sneakers and a smirk. He strolls with a hand in his hoodie pocket and leans back when idle. The cap carries his own serif "B"; the shoes have no marks. No real team logo, brand mark or copyrighted imagery appears anywhere, including on the invented shop signs and billboards (BUD FM 101.5, NOODLE KING, SODA SPLASH, SKY TOURS, MEGA MELT). The grow power-up is still a **Sprout**. No Nintendo names, designs, layouts, music or sounds are used.
- **The mushroom walker from the suggested roster was left out on purpose.** A walking mushroom that you stomp is the single most recognisable enemy design in the genre, so it would undercut "fully original".
- **"Question blocks" carry a four-pointed sparkle, not a "?".** The mechanic is generic; the "?" emblem is strongly associated with one franchise, so the art avoids it. The level files still use `?` as the map character because it is just a legend.
- **Goal is a stone garden tower**, not a castle silhouette.
- **All music and sound is composed for this project**, and the effects were written to avoid the famous references: the coin sound is an E6–G6–C7 arpeggio rather than a two-note B–E, the extra-life sound is a plain C-major arpeggio, and the death jingle is a falling A-minor line.

## Tech stack

- **Vite 8 + TypeScript 7 + Canvas 2D + vite-plugin-singlefile 2.3, Vitest 5, Playwright 1.56**, as briefed. Playwright is pinned to 1.56.1 because that matches the Chromium build pre-installed in this environment (no browser download needed).
- **`npm audit` reports `braces` (via the singlefile plugin's `micromatch`).** No patched version of `braces` exists (the advisory covers every release). It only runs at build time over glob patterns we write, so it is not exploitable here. Left as is rather than downgrading the plugin to a 2019 release.
- **Two tsconfigs.** `tsconfig.json` covers browser code (`src`, `tools`) with DOM types only, so Node APIs cannot leak into the game. `tsconfig.node.json` covers unit tests, e2e and config files with Node types. `npm run build` type-checks both.

## Rendering

- **Smooth, high-resolution painted art (changed at your request).** The original brief asked for palette-indexed pixel arrays and nearest-neighbour scaling. After play-testing you asked for graphics "pushed to the limit", and chose a smooth hi-res painted look over richer pixel art. The pixel-art pipeline was removed entirely.
- **Everything is still made in code.** Characters, tiles, backdrops and effects are Canvas 2D paths with gradients, outlines, highlights and soft shadows (`src/gfx/art`, `src/gfx/backdrops`). The file stays small (about 137 KB) because art is generated rather than stored. You chose "optimise for looks, size doesn't matter"; adding bytes would not have improved the look.
- **Drawn at native device resolution.** There is no low-res buffer. The scale is snapped so one tile is a whole number of device pixels, which keeps tiles seamless. The fraction of a tile left over at the screen edges is painted too (extra backdrop, ground continued), so phones never show bars.
- **Pre-painted where possible, live where it matters.** Tiles, coin spin frames, mystery-block pulses, the pole, tower and backdrop layers are painted once per resolution (`ArtCache`); every ground variant is painted up front to avoid mid-scroll hitches. The level's art is warmed while the "Level N" card is up. Characters are painted live every frame from a skeletal pose (`heroPose`). That gives continuous animation instead of fixed frames: a run cycle that speeds up with velocity, squash on landing, stretch on take-off, blinking, breathing, a bandana that flaps with speed, and shells, cans and hard hats that spin as they slide.
- **Adaptive resolution.** The game measures its own frame rate. If it can't hold about 45 fps, it lowers the rendering density from 3× to 2× to 1.5× device pixels per CSS pixel, and never goes back up, so it can't oscillate. In this environment's CPU-only browser it settles at 2× and 60 fps. On a GPU-backed iPhone it is expected to stay at 3×, but no device was available to confirm.
- **Backdrops are baked at no more than 1.5×** (they're soft, so you can't tell) to stay well inside iOS Safari's canvas memory limit.
- **One art pixel = 1/32 of a tile; the view is always 15 tiles (480 px) tall.** The width follows the screen's aspect ratio, clamped to 16–34 tiles (512–1088 px). A phone held sideways fills its screen and shows about 34 tiles of level; upright it shows 16. Turning the phone mid-game re-fits the view instantly.
- **Notches and the Dynamic Island.** Sideways, the scenery runs under the notch, but the HUD is inset by the safe area. It also reserves the top-right corner for the mute and pause buttons only when the game extends under them.
- **Upright phones** place the game just below the mute and pause buttons, leave room below for the touch controls, and show a "turn your phone sideways" hint.
- **Text uses the system's rounded font** (SF Pro Rounded on iPhone) with an outline and soft shadow, instead of a bitmap font.

## Game feel (all values in `src/tuning.ts`)

- **Units are px/frame at 60 Hz, as exact multiples of 1/256**, so the simulation is bit-for-bit deterministic and tests can assert exact positions.
- **The constants started from the classic 16-px-tile values doubled for 32-px tiles.** Play-testing showed that was too low: a standing jump peaked at 3.9 tiles while level 1 has 4-tile pipes and 4-tile-high block tops, so they needed a running start. Jump velocity was raised so a held standing jump clears about 5.2 tiles. Tests now require that a 4-tile pipe can be climbed from a standstill, and that every level can be finished without pressing run.
- **Three jump tiers by take-off speed**, each with a light "held" gravity and a heavy gravity for falling or after releasing the button. That split is what produces variable jump height and the snappy fall.
- **Air control works like the original:** facing is fixed in the air, momentum is kept with no input, and the airborne speed cap is set at take-off (or raised by holding run).
- **Coyote time and jump buffering are exact 6-frame (100 ms) windows**, defined as "steps since leaving the ground" and "steps since the press", and tested at their boundaries.
- **Head-bonk corner correction (6 px).** Clipping a ceiling corner by a few pixels slides you around it instead of stopping the jump. This is a modern addition for "no snagging"; hits more central than that still bump the block, which is always the one nearest the hero's centre.
- **Collision moves each axis separately and scans every cell between the old and new edge**, so nothing tunnels at any speed. It ignores cells the body *already* overlaps, so a body pushed into a wall (for example, growing under a ledge) can walk out rather than being teleported.
- **The camera only scrolls forward** and its left edge is a wall, as in the 1985 game. The flagpole stands on a block, so it must be reached with a jump, also as in the original.

## Rules

- Stomps chain without landing: 100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000, then an extra life. A sliding shell's kills chain: 500, 800, 1000, 2000, 4000, 5000, 8000, then an extra life.
- Kicking a still shell: 400. Coin: 200. Breaking a brick: 50. Power-up: 1000. Flag: 5000/2000/800/400/100 by grab height. Time bonus: 50 per unit left.
- Shell types turn at ledges; ground-walkers walk off them (unchanged by the reskin, as briefed). Walkers bounce off each other and off still shells. A still shell wakes after 7 s (shaking for the last 1.5 s).
- Taking damage as big shrinks you (with an 800 ms freeze and flicker) and grants 2.5 s of invulnerability. Stomps still work while invulnerable.
- A fall counts as a stomp if your feet were within 16 px below the critter's top on the previous frame. Side contact only hurts if it goes more than 3 px into the critter's box.
- Timer: one unit every 0.4 s. At 100 the music speeds up; at 0 you die.
- **Checkpoints** (`C` in a level file) mark respawn cells. After a death you restart from the furthest one reached in that level; enemies behind it do not respawn. The hero's big/small form carries between levels but resets on death.
- The bricks that pay coins (`M`) pay one coin per bump for 4 s after the first hit, then one final coin.

## Levels

- **Four levels as text files**: Main Street, Corner Park, Hard Hat Zone, Billboard Row. Each is 196–216 columns, has at least one power-up, both enemy kinds and a checkpoint, and has its own palette, background and music. (Their maps are byte-for-byte the maps of the four Sprout Quest levels; only the headers changed.)
- I laid out the maps with a short helper script so 200-character rows stay aligned. The committed `.txt` files are the source of truth; edit them directly.
- **A test proves every level can be finished** from its start and from each checkpoint: a best-first search over short input chunks using the real player physics, as a small hero (bricks never break) with no enemies. Negative controls (an un-jumpable pit, a wall that is too tall) confirm that the solver reports "impossible" by exhausting every reachable state, not by running out of budget.

## Controls

- **Keyboard:** arrows or A/D to move; Z, Space, Up, W or K to jump; X, Shift or J to run; Enter, Esc or P to pause; M to mute.
- **Touch:** a d-pad on the left (pushing to its outer edge also holds run, so one thumb can walk or run) and B (run) and A (jump) buttons on the right. Their touch areas overlap between the buttons, so rolling a thumb from B onto A holds both, as on a controller. Every finger is tracked separately and re-hit-tested as it moves. Mute and pause sit top-right, and the HUD reserves that corner on touch screens.
- **Audio on iPhone:** the AudioContext is created and resumed inside the first touch, click or key press. `navigator.audioSession.type = "playback"` is set where supported, so sound plays even with the silent switch on.
- **The game pauses itself** when the page is hidden or loses focus, and audio is suspended while hidden.

## Testing hooks

- `window.__budsTakeover.snapshot()` returns read-only state (mode, render scale, view width and placement, phase, level, score, coins, lives, God mode, hero position) for the Playwright tests. It is in the production build and changes nothing.
- `?level=N&x=COL` jumps straight into a level, for development only. `import.meta.env.DEV` removes it from the build.

## The Bud's Takeover reskin

The brief: a reskin, a light difficulty tweak, a hidden Easter egg and a bug sweep, not a rebuild. No level geometry, platform position or enemy mechanic was to change.

- **Proof that nothing moved.** `tests/golden.test.ts` holds hashes recorded from the last Sprout Quest commit. They cover every tile, the start, flag, goal and checkpoints, every enemy spawn, a 900-frame patrol trace of every enemy, and a 1,500-frame scripted run of the hero through each level. All four levels still match exactly.
- **Themes, in the order given.** The brief listed 19 themes; with four levels, the first four were used: 1 Daytime street, 2 Park, 3 Construction site, 4 Downtown with billboards. **Unused:** Neon night market, Nighttime street, Alleyway, Graffiti underpass, Parking garage, Subway, Train yard, Waterfront, Bridge, Abandoned warehouse, Fire-escape maze, Rooftops, Rooftop basketball court, Catwalks, Sewers. Each theme has its own tiles (sidewalk, grass, gravel, granite slab), parallax backdrop and music (the four existing tunes, reassigned).
- **Critters: only the look changed.** The game has two enemy mechanics, and every critter is one of them:
  - **Ground-walkers** patrol, turn at walls, walk off ledges and are flattened by a stomp.
  - **Shell types** turn at ledges. A stomp tucks them into something kickable, which slides and spins when kicked.

  There are ten original ground-based critters; none fly.

  | Theme | Ground-walkers | Shell types |
  |---|---|---|
  | Street | street rat, alley cat, cone creature | trash-can raccoon (dives into a tin can) |
  | Park | groundhog, evil squirrel, street rat | possum (curls up and plays dead) |
  | Construction | junkyard dog, cone creature, rebar spider | hard-hat critter (ducks under its hat) |
  | Downtown | alley cat, street rat, rebar spider | hard-hat critter, trash-can raccoon |

  From the suggested roster, the crab and the sewer frog were not used: they belong to the waterfront and sewer themes, which have no level. The mushroom was left out for originality (see above).
- **Which critter is which** is decided by each enemy's position among its kind in the level file (the 1st walker, the 2nd, …), cycling through the theme's roster. Neighbours therefore differ, and an enemy keeps its look after a checkpoint respawn. The number is a cosmetic field (`variant`) that no rule reads.
- **Difficulty: slightly easier, through forgiveness only.**
  - Invulnerability after a hit: 2.0 → 2.5 s.
  - Stomp window: 12 → 16 px.
  - Side contact is forgiven up to 3 px deep.
  - Each level's clock: +50 s.

  Enemy speeds were *not* lowered, although the brief allowed it. That would have changed every enemy's patrol, and with it the proof that enemy behaviour is untouched; the forgiveness levers give the same mild easing without that cost. No physics value changed; the golden hero trace proves Bud moves exactly as before. `tests/difficulty.test.ts` pins each value.
- **God mode (hidden on purpose, so it is not in the README).** The title screen has one brick floating alone in the sky, up and left of the logo. Clicking or tapping it toggles God mode, with a flash and a sound: a rising arpeggio for on, a bump for off. While armed, the brick glows faintly gold. A run started while it is armed:
  - takes no damage from critters, shells or anything else;
  - is never killed by the clock;
  - is put back on the last ground Bud stood on, with a short flicker, instead of dying in a pit.

  Bud carries a faint golden aura, the only sign of it in play; there is no label. It stays armed for later runs until toggled off. The block's place depends only on the view width, so the renderer and the hit test share one function (`src/game/godBlock.ts`). Pointer events are used because they still arrive under the touch-control overlay.
