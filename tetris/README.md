# Tetris 3D

Guideline Tetris, rendered in real-time 3D. The rules follow the modern Tetris
Guideline closely. Everything around the playfield is a lit 3D scene built on
three.js. It runs in any modern browser on desktop or phone, installs as a PWA
and works offline.

---

## Running it

It is a static site with no build step. ES modules need a real origin, so
`file://` will not work. Serve the folder with any static server:

```
cd tetris && node tools/serve.mjs 8080
```

Then open <http://localhost:8080/>. WebGL 2 is required.

**One-file version.** `npm run single` writes `dist/tetris-3d.html`: the whole game (three.js, code, styles, fonts, icon) in a single ~820 KB HTML file that runs on its own: double-clicked from disk, attached to a message, or inside a sandboxed preview. It needs `npm install` first (for esbuild). `npm run single -- --drew` builds the joke "Drew edition" (`dist/tetris-3d-drew.html`): identical, except DREW SUCKS fades in on the back wall of the well, invisible on level 1 and fully solid by level 20 (see `src/joke.js`). In that build saved records and settings only persist where the host page allows storage.

## Tests

```
cd tetris
npm test            # rules: SRS, 7-bag, T-spins, scoring, lock delay, DAS/ARR, 1500-piece bot soak
npm run test:e2e    # real Chromium, desktop + phone: menus, play, pause, records, rebinding, touch
```

The e2e suite uses a globally installed Playwright and software WebGL, so it
runs without a GPU. Screenshots go to `../.shots/`.

---

## What's in it

**Rules (Tetris Guideline)**
- 10×20 matrix with a 20-row buffer. Pieces spawn in rows 21–22 and drop one row right away.
- Super Rotation System with the standard JLSTZ and I wall-kick tables, plus a 180° rotation (SRS+ kicks) as a modern extra.
- 7-bag randomiser, hold (once per piece), 5-piece preview, ghost piece.
- 1 s lock delay (double the guideline's 0.5 s) with extended placement: up to 30 resets per new lowest row.
- A very relaxed speed curve: 2 s per row at level 1, easing evenly to about 1.1 s per row at level 20 (under 1 row per second even at the top).
- Scoring: Single/Double/Triple/Tetris; T-Spin, T-Spin Mini (3-corner rule, front corners, and the TST-kick upgrade); back-to-back ×1.5; combos; perfect clears; soft and hard drop points.
- Top-outs: block out and lock out.

**Modes:** Marathon (200 lines, levels 1–20, selectable start level), Sprint (40 lines against the clock), Ultra (3 minutes for score), Endless (up to level 20).

**3D presentation**
- Rounded candy-glass blocks under an environment map, lit low and exposed high so they stay saturated. Each falling piece carries a coloured point light that glows onto its neighbours.
- A back panel that picks up the colour and the contact shadow of the blocks in front of it.
- Three camera modes (Flat 2D, Tilted 3D, Dynamic 3D), switched with the <kbd>V</kbd> key or the cube button. Dynamic mode drifts and leans toward the active piece.
- Selective bloom (only emissive things glow). A dark, slow nebula sky that changes theme every level (10 themes), a polished mirror floor under the well, and soft drifting light motes. The background is built once and never changes with quality tier, so nothing pops.
- The title screen is deliberately still: one fixed theme, a demo that glides pieces down with no flashes, and no pulsing UI.
- Line clears flash white-hot and shatter into physical shards. Hard drops leave light trails and shake the well on a spring. Tetrises and T-spins fire shockwave rings.
- The HOLD and NEXT pieces are 3D and float inside the HUD frames.
- Danger state when the stack gets high: red pulse, faster music.
- Quality tiers (High/Medium/Low). Auto mode steps down if the frame rate drops.

**Audio:** everything is synthesised with Web Audio. The music is Korobeiniki, the 19th-century folk song that became the Tetris theme (public domain), arranged for lead, bass, arpeggio and drums. Its tempo follows the level.

**Controls**

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | ← → | D-pad / stick |
| Soft drop | ↓ | D-pad down |
| Hard drop | Space | D-pad up |
| Rotate ↻ / ↺ / 180° | ↑ or X / Z or Ctrl / A | A / B / X |
| Hold | C or Shift | Y, LB, RB |
| Pause | Esc or P | Start |
| Camera | V | – |

All keys can be rebound, and DAS, ARR and soft-drop speed are adjustable. Phones get on-screen controls.

---

## Layout

```
tetris/
  index.html             shell + DOM for every screen
  manifest.webmanifest   PWA manifest
  sw.js                  offline precache (tests/e2e.mjs checks it matches the files)
  src/
    pieces.js    shapes, SRS kick tables, colours                (pure)
    engine.js    rules, timing, scoring, modes                   (pure)
    controls.js  DAS/ARR auto-shift over abstract actions        (pure)
    ai.js        placement-search bot for the title-screen demo  (pure)
    render.js    three.js scene, effects, camera, previews
    audio.js     synthesised SFX and music
    save.js      versioned localStorage for settings and records
    main.js      screens, input devices, loop, HUD
    ui.css
  vendor/three.js   tree-shaken three.js r186 + addons (generated: npm run vendor)
  fonts/            Orbitron + Exo 2, SIL OFL (generated: npm run vendor)
  icons/            icon.svg + PNGs (generated: npm run icons)
  tools/            vendor bundler, one-file builder, icon renderer, static server
  tests/            engine.test.mjs (node --test), e2e.mjs (Playwright)
```

The game code never imports npm packages at runtime. `npm install` is only
needed to regenerate `vendor/` or `fonts/`.

Tetris is a trademark of The Tetris Company. This is a personal, non-commercial fan project.
