# The Underworld — after the graphics / presentation / UI-UX overhaul

The game as commit `f42a110` built it: the content-complete M13 game with the Session 14 overhaul (GRAPHICS.md at
the repository's `underworld/` folder is the before/after record). It is the "after" half of the comparison; the
"before" is `../pre-graphics-m13/`.

| File | What it is |
|---|---|
| `Underworld_After_Graphics.html` | The whole game in one file: three.js, the code, the CSS, the icons and the web-app manifest. Nothing else is needed. |
| `index.html` | A one-line redirect to the file above, so the folder deploys as a site as is. |
| `RELEASE.json` | The commit, the size (raw / gzip / brotli), the SHA-256 and the packaging changes made. |

## Playing it
- **Vercel (or any static host):** deploy this folder; the site root redirects to the game. Or upload the HTML on its
  own.
- **On a computer:** open the HTML file in a browser. It runs offline from `file://`.
- **On an iPhone:** open the hosted URL in Safari; Share → Add to Home Screen gives a full-screen launcher.

## Saves
This build uses the main game's own browser keys, `pvunderworld.save.v1` and `pvunderworld.settings.v1`: it is the
build a deployment would ship, and it reads an existing M13 career as it is (the overhaul added, renamed and removed
no save field). The M13 snapshot keeps its careers under `pvunderworld.m13.*`, so the two can be served from one
site without touching each other.

## How it was made and checked
- `node underworld/tools/export-release.mjs --ref f42a110 --dir underworld/releases/after-graphics --name Underworld_After_Graphics.html`
  (refuses to export unless the committed `index.html` is byte-identical to that commit's `src/` in manifest order;
  the only changes are the icons and manifest inlined as `data:` URIs and a `<meta name="release">` line).
- `node underworld/tools/verify-release.mjs underworld/releases/after-graphics Underworld_After_Graphics.html`
  serves the folder over HTTP and plays it in two profiles, desktop and iPhone (touch, mobile Safari UA, 4× CPU
  throttle): boot, a new game, walking (keyboard, and the on-screen stick by touch), driving, the phone and the map,
  the core systems, save, reload and Continue, no errors and no outside requests.
- This is headless Chromium, not Safari on an iPhone. It proves the package, not the device.
