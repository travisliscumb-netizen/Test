# working-title

A modern sprite-based FPS for desktop and mobile browsers, built with Babylon.js and Havok.
The spec is in [BRIEF.md](BRIEF.md); current status and open questions are in [PROGRESS.md](PROGRESS.md).

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- For end-to-end tests: Playwright's Chromium (`npx playwright install chromium`, once)

## Get it running (first time)

You need a computer (Mac or Windows) for this part. The phone only opens the game in Safari.

1. Install Node.js 22 LTS from https://nodejs.org (the "LTS" download, default options).
2. Unzip the project, open a terminal in the `working-title` folder:
   - Mac: right-click the folder in Finder → **New Terminal at Folder**.
   - Windows: open the folder, type `cmd` in the address bar, press Enter.
3. Run `npm install` once. It takes a few minutes and downloads about 830 MB, mostly the dev-only Inspector.
4. Run `npm run dev` and open http://localhost:5173 in a desktop browser. Three crates should fall onto a floor.
   Press the backtick key (`` ` ``) to open the Babylon Inspector; press it again to close it. Stop the server with Ctrl+C.

## Play it on your phone

### Option A: same Wi-Fi, no account needed

Good for quick testing. Works only while your computer is on and the phone is on the same Wi-Fi network.

1. On the computer, run `npm run build` and then `npm run preview -- --host`.
2. The terminal prints a `Network:` address, for example `http://192.168.1.23:4173/`.
3. On the iPhone, open Safari and type that exact address.
4. If it does not load:
   - Check that the phone is on the same Wi-Fi network, not cellular.
   - Windows: allow Node.js through the firewall when asked, choosing **Private networks**.
   - Mac: if asked whether `node` may accept incoming connections, choose **Allow**.

Over plain `http://` on your local network, iPhone uses WebGL2 rather than WebGPU, because browsers allow WebGPU only on secure (`https://`) pages. That is expected.

For live editing, use `npm run dev -- --host` instead (port 5173): the phone reloads when you save a file.

### Option B: a permanent web address (Vercel, free)

Works anywhere, on any network, and can be set up entirely from a phone browser. The code must be on GitHub; this project is in `travisliscumb-netizen/Test`.

1. Go to https://vercel.com and sign in with GitHub.
2. Choose **Add New → Project**, then import the `Test` repository.
3. Set **Root Directory** to `working-title`. Vercel detects Vite: the build command is `npm run build` and the output directory is `dist`; leave both as detected.
4. Choose **Deploy**. When it finishes, Vercel shows an `https://….vercel.app` address. Open it in Safari on the phone.

Vercel publishes the repository's default branch (`main`) at that address. Work on other branches gets preview addresses, which by default only you can open while logged in to Vercel. Merge the work into `main` to update the public address.

### Add it to your home screen

In Safari, tap **Share → Add to Home Screen**. For now this is a shortcut that opens Safari. A full-screen app that works offline comes with the installable-app milestone (M5 in BRIEF.md).

## Commands

| Command                | What it does                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `npm install`          | Install dependencies                                                                             |
| `npm run dev`          | Dev server at http://localhost:5173 (backtick toggles the Babylon Inspector)                     |
| `npm run build`        | Production build to `dist/`, then fails if dev-only code leaked into it                          |
| `npm run build:single` | One self-contained HTML file in `dist-single/` (no network requests)                             |
| `npm run preview`      | Serve `dist/` at http://localhost:4173 (`-- --host` to test from a phone on your LAN)            |
| `npm run typecheck`    | TypeScript, strict, app and tooling projects                                                     |
| `npm run lint`         | ESLint (type-aware) and Prettier check                                                           |
| `npm run format`       | Apply Prettier                                                                                   |
| `npm run test`         | Unit tests (Vitest)                                                                              |
| `npm run test:e2e`     | Builds, then Playwright smoke tests: desktop WebGL2, desktop WebGPU, mobile touch, dev Inspector |

`PW_CHROMIUM_EXECUTABLE=/path/to/chrome` makes the e2e tests use a specific Chromium binary instead of the one Playwright installs.

## Renderer

WebGPU is used when the browser supports it, with WebGL2 as the fallback. `?renderer=webgl2` forces WebGL2.
The choice is logged to the console as `[working-title] Renderer: …`.
