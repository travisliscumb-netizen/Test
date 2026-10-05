# Sprout Quest

An original side-scrolling platformer with the mechanics and game feel of a 1985 console classic. Guide **Moss** through four gardens, stomp **Grubs**, kick **Shellback** shells, grow with **Sprouts**, and reach the flag.

Everything is made in code: palette-indexed sprites, text-file levels, and a WebAudio chiptune synth. The build is **one self-contained `index.html` (about 100 KB)** that runs from disk, including on an iPhone from Dropbox.

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

- `/tools/sheet.html`: every sprite, tile and theme palette, zoomed.
- `/tools/levels.html?level=2`: a whole level rendered in one image.

## Layout

```
src/
  tuning.ts          every physics and rules constant
  main.ts            wiring: loop, input, display, renderer, audio
  core/              fixed-step loop, input hub, keyboard, touch, display scaling
  world/             tiles, collision, level parser, camera
  entities/          hero physics, enemies, items and effects
  game/              World (one level's rules), Game (title, lives, flow), events
  gfx/               indexed images, baking, palettes, themes, font
    sprites/         one module per sprite (hero, enemies, items, tiles, HUD)
    backgrounds/     one module per world's parallax layers
  render/            draws the game into the low-resolution frame
  audio/             notation, songs, synth voices, sequencer, SFX, engine
  levels/            level-1.txt … level-4.txt (+ test-room.txt used by tests)
tests/               unit tests
e2e/                 Playwright tests against the production build
tools/               dev pages and a screenshot helper
```

## Editing levels

Each level is a text file: a short header, then exactly 15 rows of equal width.

```
name: Meadow Run
theme: meadow        # meadow | cavern | dusk | fortress
time: 400
---
<15 rows>
```

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `.` | empty | `S` | hero start (must be directly above solid ground) |
| `#` | ground | `C` | checkpoint (likewise) |
| `B` | brick | `g` | Grub |
| `M` | brick that pays coins | `k` | Shellback |
| `?` | mystery block (coin) | `F` | flagpole (the cell is its stone base) |
| `P` | mystery block (Sprout) | `T` | goal tower, bottom-left cell (4×6 tiles) |
| `X` | stone block | `o` | coin |
| `< >` | pipe top, left/right | `[ ]` | pipe body, left/right |

The parser rejects malformed files and names the map row and column of the problem. `npm test` then checks that every level can still be finished, from its start and from every checkpoint, using the real physics.

## Swapping in your own art

Every sprite module returns a `SpriteSheet`: a palette (index 0 is transparent) plus named frames of palette indices. The quickest way to replace one is with text rows (this sketch shows the format; real Sprout frames are 32×32):

```ts
// src/gfx/sprites/sprout.ts
import { imageFromRows } from "../indexed";
import type { SpriteSheet } from "../palette";

export type SproutFrame = "sprout0" | "sprout1";

export function buildSprout(): SpriteSheet<SproutFrame> {
  const key = ".kgGy"; // position in the key = palette index
  const palette = ["transparent", "#1b1424", "#24693a", "#3fa34d", "#efb10c"];
  const frame = imageFromRows([
    "..gg..",
    ".gGGg.",
    "..yy..",
  ], key);
  return { palette, frames: { sprout0: frame, sprout1: frame } };
}
```

Keep the frame names and sizes (the hero is 32×32 small and 32×48 big, with feet on the bottom row; `npm test` checks these). Preview the result at `/tools/sheet.html`.
