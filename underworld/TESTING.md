# TESTING

- Suites: `underworld/tests/*.mjs` (Playwright + headless Chromium/SwiftShader, offline). Run one:
  `node underworld/tests/<suite>.mjs` from the repo root. `UW_FILE=<path>` runs against another build.
- Node-only checks: `build.mjs` (index matches src), `static-money.mjs` (ledger discipline).
- Regression runner (`underworld/tools/runall.mjs`, results in `underworld/.runs/<label>/`, git-ignored): runs suites N at a time, writes `results.json`, skips
  passed suites on resume: `CONC=3 node underworld/tools/runall.mjs <label> underworld/index.html [suites…]`. Its ORDER list must name every suite.
- Discipline: a milestone's own suite + affected suites, then the full regression; failures under load are
  re-run solo before being called flakes (see KNOWN_ISSUES.md). Fix deterministic failures before moving on.
- Performance: `node underworld/tests/perf.mjs <index.html>`; compare against the previous milestone's build with
  alternating runs (software GL is noisy, ±15%).
- Reload pattern in suites: `g.saveGame(true)`, `page.reload()`, click `#btnContinue`.
