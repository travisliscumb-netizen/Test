# working-title

A modern sprite-based FPS for desktop and mobile browsers, built with Babylon.js and Havok.
The spec is in [BRIEF.md](BRIEF.md); current status and open questions are in [PROGRESS.md](PROGRESS.md).

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- For end-to-end tests: Playwright's Chromium (`npx playwright install chromium`, once)

## Commands

| Command             | What it does                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `npm install`       | Install dependencies                                                                             |
| `npm run dev`       | Dev server at http://localhost:5173 (backtick toggles the Babylon Inspector)                     |
| `npm run build`     | Production build to `dist/`, then fails if dev-only code leaked into it                          |
| `npm run preview`   | Serve `dist/` at http://localhost:4173 (`-- --host` to test from a phone on your LAN)            |
| `npm run typecheck` | TypeScript, strict, app and tooling projects                                                     |
| `npm run lint`      | ESLint (type-aware) and Prettier check                                                           |
| `npm run format`    | Apply Prettier                                                                                   |
| `npm run test`      | Unit tests (Vitest)                                                                              |
| `npm run test:e2e`  | Builds, then Playwright smoke tests: desktop WebGL2, desktop WebGPU, mobile touch, dev Inspector |

`PW_CHROMIUM_EXECUTABLE=/path/to/chrome` makes the e2e tests use a specific Chromium binary instead of the one Playwright installs.

## Renderer

WebGPU is used when the browser supports it, with WebGL2 as the fallback. `?renderer=webgl2` forces WebGL2.
The choice is logged to the console as `[working-title] Renderer: …`.
