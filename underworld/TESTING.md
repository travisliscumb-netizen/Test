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
- Suites added in this phase: `legal` (M7), `prison` rewritten (M8), `fronts`, `tables`, `casino`/`royale-sim`
  rewritten (M9), `crime` (M10), `phoneapps` extended (M11), `opening` (M12), `economy` (M13: the balance
  invariants — resale ≤85%, the laundering ladder, the economic clock, sleep, no jail profit, casino RTP, the
  bounded progressive, race tiers, the jackpot stress test, broke recovery, payroll order, pickpocket wariness,
  supplier restock, Rank monotonicity and hints).
- Added after the graphics gate: `nanframes` (no shader writes a NaN or infinite pixel: seven scenes at Medium and
  High into a float target) and `banks` (the three banks: entry from a new game, tiers, reserves by economic day,
  every robbery stage and its payout as Dirty Cash, persistence through leaving, save/reload, arrest and death,
  recovery, the no-money-engine bound, guards' warning and fight, the alarm, containment, escalation and the
  police storming in, guard violence on the case file, an unarmed robber held and arrested, draw cost inside).
- Measurement tools (not tests; they print and write JSON under `.runs/`):
  `node underworld/tools/econ-probe.mjs [index.html] [out.json]` (prices, loot EVs, passive simulations: the
  tables in ECONOMY.md); `node underworld/tools/perf-scenarios.mjs [index.html] [out.json]` (the phone-profile
  baseline for downtown on foot, a downtown drive, the phone map, the casino, a jail cell; run it alone, never
  beside the regression runner). With `PHONE=1 tests/perf.mjs` it makes the CONTENT COMPLETE mobile baseline.
- A runner reads the live `tests/` folder: don't edit suites while it runs against a staged build.
- Stage a comparison build straight from its commit (`git show <ref>:underworld/index.html > .stage-x.html`) and
  check it (`cmp`) before measuring: at the graphics gate an old `.stage-pre13.html` turned out to be an M12 build
  and the first before-captures had to be retaken.
- Graphics overhaul tools (Session 14): `node underworld/tools/vqa-shots.mjs <build.html> <out dir> [scene
  prefixes]` (the same 70-odd scenes and cameras on any build: world, vehicles, people, interiors, UI on a touch
  phone viewport; `VQA_QUICK=1` for half-size look-dev); `node underworld/tools/build-cost.mjs <a.html> [b.html…]`
  (raw/gzip/brotli, boot ms, JS heap, live geometries/textures, medians of three cold loads; run on a quiet machine);
  `tools/export-release.mjs` + `tools/verify-release.mjs` (single-file release and its static-host check).
