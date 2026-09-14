# Math Circus: Act 1 — fan rebuild

A single-file, touch-first rebuild of the twelve-activity structure of
*Math Circus: Act 1* (Logotron / Greygum Software, 1993), targeting iPhone
Safari in portrait.

**The deliverable is one file: `math-circus-act1.html`.** Everything — markup,
styles, game logic, sound synthesis, save system, icons and manifest — is inside
it. No build step, no CDN, no sibling assets.

## Running it

- Open `math-circus-act1.html` directly (double-click / `file://`), or
- serve the repo and open it over http:
  ```
  node -e "import('./tools/serve.mjs').then(m=>m.serve('.',8080)).then(s=>console.log(s.url))"
  ```
  then browse to `/math-circus-act1.html`.

On iPhone: Share → **Add to Home Screen** for a full-screen, chrome-free launch.

## Tests

```
npm install --no-save playwright@1.63.0        # once; browsers are preinstalled
node tests/math-circus.mjs                     # everything
node tests/math-circus.mjs cannon              # one suite
```

The playtest drives the real page in Chromium at iPhone viewport sizes: it taps
through the hub with synthetic touch events, plays **every game on every
difficulty to a win and to a deliberate failure**, reads the saved JSON back out
of `localStorage`, and fails on any console error or page exception. Suites: `seals trapeze magician traffic cannon riddle balance tickets elephant
bolts clowns lions` (gameplay), plus `chrome` (a way back to the hub and a
working pause menu in all twelve), `audio` (counts real oscillators, and
silence when sound is off), `pwa` (manifest/icon validity and the service
worker outcome), `viewports` and `cards` (nothing off screen or under 44px on
three iPhone sizes).

Screenshots land in `.shots/` (gitignored).

## Regenerating the icons / manifest

`node tools/mc-icon.mjs` regenerates the circus-tent PNGs and the inline
manifest and writes them back into the HTML. It is idempotent.

## Known limitations

- **Offline does not work, and the game says so.** A service worker is the only
  way to load a page with the network off, and every current engine (Chromium
  and WebKit) rejects a `blob:` or `data:` service-worker script URL — the spec
  only allows `http`/`https`. Registration is still attempted, the refusal is
  captured, and **Settings reports "Offline cache: not available here"** rather
  than implying an install. Making offline work would require shipping a
  same-origin `sw.js` next to the HTML, which breaks the single-file rule.
- **iOS has no install prompt.** The inline `manifest` data URI is what
  Android/Chrome reads; iOS Safari relies on the `apple-mobile-web-app-*` meta
  tags and the user choosing Share → Add to Home Screen by hand.
- One best score and one star count per game, shared across difficulties (this
  is the save schema the brief specified), so an Easy run can own the best score.
- Portrait only, by design.
