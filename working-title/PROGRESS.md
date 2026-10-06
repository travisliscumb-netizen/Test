# Progress

**Current milestone:** M0 — Scaffold: **complete and verified** (2026-10-06).
**Next:** M1 — "Walk and shoot" vertical slice. Not started; waiting on the open questions below.

## M0 checklist

| Requirement (BRIEF §12)                                   | Status | Evidence                                                                                                                                              |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite + TypeScript + Babylon + Havok project runs          | Done   | `npm run build`; e2e boots the production build, Havok drops a crate that lands on the floor                                                          |
| Engine picks WebGPU or WebGL2 and logs which              | Done   | `[working-title] Renderer: WebGPU` / `WebGL2` asserted in e2e; both renderers tested                                                                  |
| Inspector toggles in dev only                             | Done   | dev e2e opens and closes it with backtick; `tools/check-bundle.mjs` fails the build if it reaches production; prod e2e confirms backtick does nothing |
| Lint, typecheck, unit test, Playwright smoke test all run | Done   | see verification below                                                                                                                                |

## What exists

- `src/render/createEngine.ts` picks the renderer. It tries WebGPU first, then WebGL2. On a WebGPU failure the canvas is swapped for a fresh one: a canvas that has handed out a `webgpu` context can never return `webgl2`, so without the swap the fallback fails. A mutation test confirmed the e2e test fails without the swap. `?renderer=webgl2` forces the baseline. WebGL1 is refused.
- `src/core/fixedTimestep.ts` and `src/core/gameLoop.ts` run the simulation on a fixed 60 Hz tick:
  - Clamped frame time and a cap on ticks per frame (guards against a spiral of death).
  - An interpolation alpha passed to rendering.
  - A clock reset when the tab becomes visible again.
- `src/core/physics.ts`: Havok, stepped **only** from the fixed tick. Babylon's own per-frame physics step is turned off (`scene.physicsEnabled = false`). Left on, it would run physics 2.4× too fast on a 144 Hz display. Babylon's before/after physics observables still fire.
- `src/world/bootScene.ts` is a throwaway M0 scene (lit floor + three Havok crates). The M1 room replaces it.
- `src/core/diagnostics.ts` adds:
  - `window.__workingTitle.snapshot()`: read-only state for tests and field debugging.
  - `<html data-state>`: `booting` / `running` / `error`.
- `src/ui/fatalError.ts` shows a readable error screen when boot fails (e.g. no WebGL2).
- Dev builds turn on Babylon 9's missing side-effect import warnings, and the dev e2e fails on any of them. Background: Babylon 9 replaces methods whose side-effect import is missing with silent stubs. That hid a real bug here: `scene.enablePhysics` silently returned `undefined` until `Physics/joinedPhysicsEngineComponent` was imported.

## Single-file build (for sandboxed hosts)

`npm run build:single` writes `dist-single/index.html`, one self-contained 4.6 MiB file (1.3 MiB gzip). All JS, CSS, the icon and the Havok wasm are inlined, and it makes **no network requests**. This is the build published as a claude.ai artifact so the game can be tried in chat.

- Havok loads from inlined bytes (`wasmBinary`), never a fetch. Havok's own default wasm URL is stripped in this mode; otherwise Vite would inline a second 2 MiB copy.
- With code splitting off, Vite 8 leaves its `__VITE_PRELOAD__` marker unreplaced in Babylon's inlined lazy imports, which broke every shader at runtime. The plugin substitutes "no deps", and `check-bundle` now fails any build that still contains the marker.
- An e2e test (`single-file.spec.ts`, on desktop WebGL2, desktop WebGPU and mobile) serves the file under a strict CSP (`default-src 'none'`, inline scripts plus `wasm-unsafe-eval` only), aborts every request, and requires zero attempted requests and zero CSP violations.
- Risk: if a host's CSP does not allow `wasm-unsafe-eval`, Havok cannot compile and the page shows its error screen.

## Verification (2026-10-06, this container)

| Command             | Result                                                              |
| ------------------- | ------------------------------------------------------------------- |
| `npm run typecheck` | pass (app + node projects, `skipLibCheck: false`)                   |
| `npm run lint`      | pass (typescript-eslint `strictTypeChecked` + Prettier, 0 warnings) |
| `npm run test`      | 37/37 pass                                                          |
| `npm run build`     | pass, bundle guard OK                                               |
| `npm run test:e2e`  | 21/21 pass                                                          |

E2E projects:

- `desktop-chromium` (WebGL2, 1280×720)
- `desktop-webgpu` (WebGPU via SwiftShader/Vulkan, plus the forced-failure fallback test)
- `mobile-chromium` (Pixel 7 landscape: touch emulation, DPR 2.625)
- `dev-inspector` (dev server)

Every smoke test asserts:

- zero console errors, uncaught exceptions and failed requests;
- **zero requests to other origins** (the game must work offline later);
- a non-blank canvas (pixel analysis of a screenshot);
- the simulation ticking and Havok stepping.

**Measured frame rate:** quality tiers do not exist until M5, so this is per renderer. The container has no GPU (software rendering, 4 vCPU Xeon 2.8 GHz), so these numbers **do not** predict real hardware:

| Project          | Renderer | FPS  | Sim ticks/s |
| ---------------- | -------- | ---- | ----------- |
| desktop-chromium | WebGL2   | 20.4 | 60.2        |
| desktop-webgpu   | WebGPU   | 14.1 | 60.5        |
| mobile-chromium  | WebGL2   | 10.6 | 59.0        |

What the numbers do show: at 10 FPS the simulation still runs at 60 ticks/s, i.e. gameplay speed does not depend on frame rate.

**Bundle:**

- Entry JS: 1.35 MiB (330 KiB gzip). Both WebGPU and WebGL2 back ends ship.
- Havok wasm: 2.0 MiB (649 KiB gzip).
- Shaders and texture loaders are lazy chunks.

## Manual test checklist (Travis)

Serve the production build on your LAN: `npm run build && npm run preview -- --host`, then open the printed network URL.

Note: browsers allow WebGPU only in a secure context, so over plain-HTTP LAN the phone will use WebGL2. That is still a valid test of the baseline.

Desktop (Chrome, Edge, Firefox, Safari):

1. The page shows three coloured crates falling onto a grey floor, under directional light.
2. DevTools console: one line `[working-title] Renderer: WebGPU` or `WebGL2`, and no red errors.
3. Load `?renderer=webgl2`. The log says `WebGL2` and the scene looks the same.
4. Resize the window. The scene fills it with no stretching or blur.
5. Dev only (`npm run dev`): backtick opens the Babylon Inspector, backtick again closes it.

iPhone (Safari, landscape):

1. Same scene renders, full screen, no white flash or scrollbars.
2. Rotate portrait ↔ landscape. The canvas refills the screen each time.
3. Tap and drag on the canvas. The page does not scroll, zoom or show a callout menu.
4. Switch apps for ~10 s and come back. The crates do not jump or fast-forward.

## Decisions taken (with reasons)

- **Location:** `working-title/` in this repo, matching `block-stack/` and `cashpilot/`. Moving it to its own repo later is a `git mv` (or `git subtree split`), nothing more.
- **TypeScript 6.0.3, not 7.0.2.** typescript-eslint 8.71 (latest) supports TypeScript `<6.1`. Moving to 7.x now would lose type-aware lint rules such as no-floating-promises. Revisit when typescript-eslint supports 7.
- **Inspector type shim** (`src/dev/inspector-types.d.ts`, wired up through tsconfig `paths`). `@babylonjs/inspector@9.29.0` ships declarations that import an unpublished package (`@babylonjs/shared-ui-components`), so they fail to type-check. The shim covers only `ShowInspector`, so `skipLibCheck` stays off for every other dependency. Runtime is unaffected.
- **No vendor chunk split.** A Babylon vendor chunk was tried. Rolldown then merged the lazily loaded shaders and texture loaders into it, adding ~425 KiB to the eager download. Revisit with the service-worker caching strategy in M5.
- **`antialias: false` on the context.** AA belongs to the post-processing pipeline and will be set per quality tier (M1/M5).
- **Two upstream console errors are allowlisted, each in exactly one test, matched by exact text:**
  - Fluent UI's `Keyborg … disposed incorrectly`, logged when the dev Inspector closes.
  - Babylon's own report of the WebGPU failure that the fallback test deliberately injects.
- **E2E always rebuilds.** The preview server is never reused, because a reused server would test a stale `dist/`. That actually happened once during development.

## Known gaps and risks

- **Automated tests cover Chromium only.** Safari/WebKit and Firefox are in the brief's targets but are not installed in this container. Their Playwright projects can be added on a machine with `npx playwright install`. Until then they are covered by the manual checklist.
- **Playwright browser pinning:** `@playwright/test@1.63.0` expects its own Chromium build. This container provides an older one, so e2e here runs with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`. Locally, run `npx playwright install chromium` once and leave the variable unset.
- **Render interpolation:** M0 has no player-driven objects, so the interpolation alpha is not used yet. Havok bodies show their latest physics state, so on displays faster than 60 Hz physics props will step visibly. M1 interpolates the player camera; physics-prop interpolation is an M1 decision.
- **WebGPU shader compilers:** Babylon fetches `glslang`/`twgsl` from its CDN only if a GLSL shader must compile under WebGPU. Core materials ship WGSL, so nothing is fetched today. The e2e "no off-origin requests" assertion would catch a regression, e.g. a custom sprite shader written only in GLSL.
- **`node_modules` is ~830 MB**, almost entirely the Inspector's peer dependencies (React/Fluent editors). Dev only; none of it ships.

## Open questions for Travis

1. **Title** (BRIEF §14). `working-title` stays until you name it.
2. **Jump and vertical aim:** confirm on (BRIEF §14 default).
3. **Levels:** Claude Code only (JSON), or will you also build in Blender (glTF)? This changes how much of the M1 level loader is designed for glTF now.
4. **Repo and hosting:** keep it in this repo under `working-title/`, or a dedicated repo? Deploy target: Vercel, like the sibling apps, or elsewhere?
5. **Proposed BRIEF changes** (not applied; per §15 these need your approval):
   - §13 requires e2e to prove "the player moves and the weapon fires". M0 has neither, so those assertions start in M1. Proposal: say explicitly that this requirement starts at M1.
   - §13 asks for "FPS per quality tier", but tiers arrive in M5. Proposal: report per renderer until M5.
   - M1 criterion 7 ("holds target frame rate on a recent iPhone") needs a render-scale cap before M5's dynamic resolution. The engine currently renders at full device pixel ratio, which is 3× on iPhone (9× the pixels of 1×). Proposal: bring a fixed per-device render-scale cap forward into M1, with dynamic scaling staying in M5.
