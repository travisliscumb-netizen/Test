# Decisions

Choices made while building Sprout Quest, with the reasoning. Newest concerns are grouped by area, not by date.

## Identity and originality

- **Name and cast.** The game is *Sprout Quest*. The hero is **Moss**, a gardener in a leaf hood with a sprout on top and an orange scarf. Enemies are the **Grub** (a stompable purple beetle-grub) and the **Shellback** (a snail whose spiral shell can be kicked). The grow power-up is a **Sprout** (a seed with leaves). No Nintendo names, designs, layouts, music or sounds are used.
- **"Question blocks" carry a four-pointed sparkle, not a "?".** The mechanic is generic; the "?" emblem is strongly associated with one franchise, so the art avoids it. The level files still use `?` as the map character because it is just a legend.
- **Goal is a stone garden tower**, not a castle silhouette.
- **All music and sound is composed for this project**, and the effects were written to avoid the famous references: the coin sound is an E6–G6–C7 arpeggio rather than a two-note B–E, the extra-life sound is a plain C-major arpeggio, and the death jingle is a falling A-minor line.

## Tech stack

- **Vite 8 + TypeScript 7 + Canvas 2D + vite-plugin-singlefile 2.3, Vitest 5, Playwright 1.56**, as briefed. Playwright is pinned to 1.56.1 because that matches the Chromium build pre-installed in this environment (no browser download needed).
- **`npm audit` reports `braces` (via the singlefile plugin's `micromatch`).** No patched version of `braces` exists (the advisory covers every release). It only runs at build time over glob patterns we write, so it is not exploitable here. Left as is rather than downgrading the plugin to a 2019 release.
- **Two tsconfigs.** `tsconfig.json` covers browser code (`src`, `tools`) with DOM types only, so Node APIs cannot leak into the game. `tsconfig.node.json` covers unit tests, e2e and config files with Node types. `npm run build` type-checks both.

## Rendering

- **One art pixel = one logical pixel; 32 px tiles; the view is always 15 tiles (480 px) tall.** The width follows the screen's aspect ratio, clamped to 16–30 tiles (512–960 px). On wide phones you see further ahead than on a 4:3 screen; I preferred that over letterboxing an iPhone held sideways. Enemy activation is tied to the view's right edge, so it adapts.
- **Crisp scaling at any size ("sharp bilinear").** Each frame is drawn at native resolution, scaled up by the nearest *integer* factor with nearest-neighbour, then scaled once, smoothly, to the exact display size. Pixels stay sharp and evenly sized even at non-integer scales such as 2.25× or 2.4× (an iPhone in landscape), where plain nearest-neighbour would make some pixels visibly wider than others. At exact integer scales it draws nearest-neighbour directly.
- **Portrait phones** pin the game near the top and leave the space below for the touch controls. Landscape is the intended way to play.
- **Sprites are generated in code as palette-indexed images**, mostly drawn with a small raster toolkit (`PixelCanvas`: ellipses, polygons, lines, auto-outline) and some hand-drawn as text rows (`imageFromRows`, used by the HUD icons). Generating the hero as a "paper doll" keeps all 18 frames on-model. Every module exports a `SpriteSheet` (palette plus indexed frames), so any one can be replaced by hand-drawn rows; see the README.
- **Themable tiles** use a fixed slot layout (outline, a four-shade primary ramp, a four-shade secondary ramp, a highlight). Each of the four worlds recolours the same ground, brick, stone and pipe art.
- **Death animation always uses the small hero's front-facing pose**, as in the original game: dying as a big hero shrinks you first.

## Game feel (all values in `src/tuning.ts`)

- **Units are px/frame at 60 Hz, as exact multiples of 1/256**, so the simulation is bit-for-bit deterministic and tests can assert exact positions.
- **The constants start from the classic 16-px-tile values doubled for 32-px tiles**, then were checked by measurement. Measured from the real code:

  | | Height | Length | Airtime |
  |---|---|---|---|
  | Standing jump (held) | 3.9 tiles | — | 51 frames |
  | Walking jump | 4.1 tiles | 5.4 tiles | 55 frames |
  | Running jump | 4.8 tiles | 8.5 tiles | 53 frames |

  Reaching walk speed takes 40 frames (0.67 s) and run speed 47 frames (0.78 s).
- **Three jump tiers by take-off speed**, each with a light "held" gravity and a heavy gravity for falling or after releasing the button. That split is what produces variable jump height and the snappy fall.
- **Air control works like the original:** facing is fixed in the air, momentum is kept with no input, and the airborne speed cap is set at take-off (or raised by holding run).
- **Coyote time and jump buffering are exact 6-frame (100 ms) windows**, defined as "steps since leaving the ground" and "steps since the press", and tested at their boundaries.
- **Head-bonk corner correction (6 px).** Clipping a ceiling corner by a few pixels slides you around it instead of stopping the jump. This is a modern addition for "no snagging"; hits more central than that still bump the block, which is always the one nearest the hero's centre.
- **Collision moves each axis separately and scans every cell between the old and new edge**, so nothing tunnels at any speed. It ignores cells the body *already* overlaps, so a body pushed into a wall (for example, growing under a ledge) can walk out rather than being teleported.
- **The camera only scrolls forward** and its left edge is a wall, as in the 1985 game. The flagpole stands on a block, so it must be reached with a jump, also as in the original.

## Rules

- Stomps chain without landing: 100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000, then an extra life. A sliding shell's kills chain: 500, 800, 1000, 2000, 4000, 5000, 8000, then an extra life.
- Kicking a still shell: 400. Coin: 200. Breaking a brick: 50. Power-up: 1000. Flag: 5000/2000/800/400/100 by grab height. Time bonus: 50 per unit left.
- Shellbacks turn at ledges; Grubs walk off them. Walkers bounce off each other and off still shells. A still shell wakes after 7 s (shaking for the last 1.5 s).
- Taking damage as big shrinks you (with an 800 ms freeze and flicker) and grants 2 s of invulnerability. Stomps still work while invulnerable.
- Timer: one unit every 0.4 s. At 100 the music speeds up; at 0 you die.
- **Checkpoints** (`C` in a level file) mark respawn cells. After a death you restart from the furthest one reached in that level; enemies behind it do not respawn. The hero's big/small form carries between levels but resets on death.
- The bricks that pay coins (`M`) pay one coin per bump for 4 s after the first hit, then one final coin.

## Levels

- **Four levels as text files**: Meadow Run, Crystal Cavern, Sunset Canopy, Night Fortress. Each is 196–216 columns, has at least one power-up, both enemy kinds and a checkpoint, and has its own palette, background and music.
- I laid out the maps with a short helper script so 200-character rows stay aligned. The committed `.txt` files are the source of truth; edit them directly.
- **A test proves every level can be finished** from its start and from each checkpoint: a best-first search over short input chunks using the real player physics, as a small hero (bricks never break) with no enemies. Negative controls (an un-jumpable pit, a wall that is too tall) confirm that the solver reports "impossible" by exhausting every reachable state, not by running out of budget.

## Controls

- **Keyboard:** arrows or A/D to move; Z, Space, Up, W or K to jump; X, Shift or J to run; Enter, Esc or P to pause; M to mute.
- **Touch:** a d-pad on the left (pushing to its outer edge also holds run, so one thumb can walk or run) and B (run) and A (jump) buttons on the right. Their touch areas overlap between the buttons, so rolling a thumb from B onto A holds both, as on a controller. Every finger is tracked separately and re-hit-tested as it moves. Mute and pause sit top-right, and the HUD reserves that corner on touch screens.
- **Audio on iPhone:** the AudioContext is created and resumed inside the first touch, click or key press. `navigator.audioSession.type = "playback"` is set where supported, so sound plays even with the silent switch on.
- **The game pauses itself** when the page is hidden or loses focus, and audio is suspended while hidden.

## Testing hooks

- `window.__sproutQuest.snapshot()` returns read-only state (mode, phase, level, score, coins, lives, hero position) for the Playwright tests. It is in the production build and changes nothing.
- `?level=N&x=COL` jumps straight into a level, for development only. `import.meta.env.DEV` removes it from the build.
