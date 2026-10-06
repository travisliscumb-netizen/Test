# Bud's Takeover

An original side-scrolling platformer with the mechanics and game feel of a 1985 console classic. Take **Bud** (black cap, black hoodie with his name on it, headphones round his neck, red bandana, white sneakers) across four parts of town: Main Street, Corner Park, a construction site and downtown. Stomp the local critters, kick the ones that tuck into shells, cans and hard hats, grow with **Sprouts**, and reach the flag.

Everything is made in code: smooth hand-painted-style vector art drawn at your screen's native resolution, text-file levels, and a WebAudio chiptune synth. The build is **one self-contained `index.html`** that runs from disk, including on an iPhone from Dropbox.

## Play

| | Keyboard | Touch |
|---|---|---|
| Move | ← → or A D | left pad |
| Run | X, Shift or J | B, or push the pad to its edge |
| Jump (hold to jump higher) | Z, Space, ↑, W or K | A |
| Pause | Enter, Esc or P | II |
| Mute | M | ♪ |

Turn your phone sideways to play the long way: the view widens to fill the screen (about 34 tiles of level instead of 16), and you can rotate at any time, even mid-level.

## Develop

```
npm install
npm run dev          # http://localhost:5173  (add ?level=3&x=40 to jump to level 3, column 40)
npm test             # unit tests (Vitest)
npm run build        # type-checks, then writes dist/index.html
npm run test:e2e     # builds, then runs Playwright against dist/index.html
```

Dev-only pages served by `npm run dev`:

- `/tools/art.html?scale=4`: every pose of Bud, every critter, tile and world material, painted large.
- `/tools/levels.html?level=2&enemies=1`: a whole level rendered in one image (`enemies=1` places every critter at its spawn).

## Layout

```
src/
  tuning.ts          every physics and rules constant
  main.ts            wiring: loop, input, display, renderer, audio
  core/              fixed-step loop, input hub, keyboard, touch, display scaling
  world/             tiles, collision, level parser, camera
  entities/          hero physics, enemies, items and effects
  game/              World (one level's rules), Game (title, lives, flow), events
  gfx/               painting toolkit, art cache, art/ (one module per piece), backdrops/
  render/            draws the game straight onto the screen at native resolution
  audio/             notation, songs, synth voices, sequencer, SFX, engine
  levels/            level-1.txt … level-4.txt (+ test-room.txt used by tests)
tests/               unit tests
e2e/                 Playwright tests against the production build
tools/               dev pages and a screenshot helper
```

## Editing levels

Each level is a text file: a short header, then exactly 15 rows of equal width.

```
name: Main Street
theme: street        # street | park | construction | downtown
time: 450
---
<15 rows>
```

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `.` | empty | `S` | hero start (must be directly above solid ground) |
| `#` | ground | `C` | checkpoint (likewise) |
| `B` | brick | `g` | ground-walker (critter from the theme's roster) |
| `M` | brick that pays coins | `k` | shell type (tucks in when stomped, then kicks) |
| `?` | mystery block (coin) | `F` | flagpole (the cell is its stone base) |
| `P` | mystery block (Sprout) | `T` | goal tower, bottom-left cell (4×6 tiles) |
| `X` | stone block | `o` | coin |
| `< >` | pipe top, left/right | `[ ]` | pipe body, left/right |

The parser rejects malformed files and names the map row and column of the problem. `npm test` then checks that every level can still be finished, from its start and from every checkpoint, using the real physics.

## Swapping in your own art

All art is painted in code with Canvas 2D (paths, gradients, outlines), one module per piece, in `src/gfx/art/`. Every module draws in *logical* pixels (1 tile = 32 units). The renderer scales the canvas to the screen, so art stays sharp at any resolution.

| Module | Draws | Coordinate frame |
|---|---|---|
| `hero.ts` (+ `heroPose.ts`) | Bud, posed from joint angles | origin at the feet, facing right |
| `critters/*.ts` | the ten critters, one file each; `critters/index.ts` lists which live in which theme | origin at the feet, facing right |
| `sprout.ts` | the power-up | origin at the base |
| `coin.ts`, `flag.ts`, `goalTower.ts` | coin spin, flagpole, goal tower | see each file |
| `tiles/*.ts` | ground, brick, stone, blocks, pipes | a 32×32 cell |
| `materials.ts` | each world's colours | — |
| `../backdrops/*.ts` | each world's parallax layers | layer box, tiles horizontally |

To use your own image instead, keep the function's signature and draw the image in that frame. For example, to replace the power-up:

```ts
// src/gfx/art/sprout.ts
import type { Ctx } from "../paint";
import sproutUrl from "./my-sprout.png"; // bundled into the single file by the build

const image = new Image();
image.src = sproutUrl;

/** Origin at the base; about 24 units wide. */
export function drawSprout(ctx: Ctx, _time: number): void {
  if (image.complete) ctx.drawImage(image, -12, -24, 24, 24);
}
```

Preview every piece, at any zoom, at `/tools/art.html?scale=4`. `npm test` renders all art and checks that it paints and stays inside its box.
