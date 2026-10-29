# The Underworld — M13, before the graphics overhaul

The content-complete game exactly as commit `5b19596` built it (git tag `underworld-pre-graphics-m13`). It is
the "before" half of the before/after comparison. Leave this folder unchanged: later builds go to their own
`releases/<name>/` folders.

| File | What it is |
|---|---|
| `Underworld_M13_Before_Graphics.html` | The whole game in one file: three.js, the code, the CSS, the icons and the web-app manifest. Nothing else is needed. |
| `index.html` | A one-line redirect to the file above, so the folder deploys as a site as is. |
| `RELEASE.json` | The commit, the size (raw / gzip / brotli), the SHA-256 and the packaging changes made. |

## Playing it
- **Vercel (or any static host):** deploy this folder; the site root redirects to the game. Or upload the HTML on its
  own.
- **On a computer:** open the HTML file in a browser. It runs offline from `file://`.
- **On an iPhone:** open the hosted URL in Safari; Share → Add to Home Screen gives a full-screen launcher.

## Saves
The game's own saves are unchanged in format, but this copy keeps them under its own browser keys:
`pvunderworld.m13.save.v1` and `pvunderworld.m13.settings.v1`, instead of the main build's `pvunderworld.save.v1`.

- Serving this file and a newer build from one site (one origin) can't let either read, migrate or overwrite the
  other's career.
- A career started here stays here: the newer build doesn't see it, and this one doesn't see the newer build's.

## How it was made and checked
- `node underworld/tools/export-release.mjs --ref underworld-pre-graphics-m13 --dir underworld/releases/pre-graphics-m13 --name Underworld_M13_Before_Graphics.html --save-ns m13`
  - It refuses to export unless the committed `index.html` is byte-identical to that commit's `src/` assembled
    in manifest order.
  - The only changes, each asserted to happen exactly once: the icons and manifest inlined as `data:` URIs, the
    two storage keys namespaced, the title suffixed "(m13)", and a `<meta name="release">` line.
- `node underworld/tools/verify-release.mjs underworld/releases/pre-graphics-m13 Underworld_M13_Before_Graphics.html`
  serves the folder over HTTP and plays it in two profiles: desktop, and iPhone (touch, mobile Safari UA, 4×
  CPU throttle). It checks:
  - boot;
  - a new game;
  - walking (keyboard, and the on-screen stick by touch);
  - driving;
  - the phone and the map;
  - the core systems;
  - save, reload and Continue;
  - no errors and no outside requests.
- This is headless Chromium, not Safari on an iPhone. It proves the package, not the device.
