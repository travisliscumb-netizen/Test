# TESTING

- Suites: `underworld/tests/*.mjs` (Playwright + headless Chromium/SwiftShader, offline). Run one:
  `node underworld/tests/<suite>.mjs` from the repo root. `UW_FILE=<path>` runs against another build.
- Node-only checks: `build.mjs` (index matches src), `static-money.mjs` (ledger discipline), `layout.mjs` (the city
  layout, below).
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
  police storming in, guard violence on the case file, an unarmed robber held and arrested, draw cost inside; the
  follow-up: doors lit by their room, a vault door's swing and its solid open state, everyone inside drawn, the bag
  and paying out through a door, a full bag and making room, dye packs bursting or found, hostages and the
  negotiation, a hostage hurt or killed, hostages running, the rear staff door picked, an intruder in the back, out
  the back unseen or into the police). Skip days in suites with `__days(n)` (econH, day and the clock's econDay
  together), or the clock replays the days when play resumes.
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
- Operation Blackgate: `island` (the island's size, outline, waters and islets; the city's edge; meshes and physics
  on the same ground; districts and places; every island road a curved link, GPS routes to every place and back, road
  beds, the bridge's deck and the tunnel's floor by height; the airport; wading and a car in the sea; the fleet and
  the race cars, one taken and driven on the circuit; the aeroplane's take-off, climb, turn and landing and the
  helicopter from the hospital's roof, both flown by the physics alone at 1/60 s a step; highway traffic; the map; a
  save on the island; a touch phone). `offroad`, `roads` and `map` changed where the island changed what they assert
  (dry fields round the land bridge, ribbons outside the raster, zooming out to the whole island).
- Island tools (not tests): `node underworld/tools/isle-preview.mjs [out.png] [m per px]` draws the island without a
  browser and prints each road's length, grade, deepest cut, bridges, tunnel and sharpest kink (`ISLE_BEDS=1` adds the
  road-bed check); `node underworld/tools/isle-shots.mjs <out dir> [prefixes…]` captures the island's views
  (`ISLE_DPR=2` for presentation).
- The city into the island (CITY_SPREAD.md): `layout` (Node, no browser: `010`, `020`, `021` and `turfAt` run as built;
  the classic layout against the lattice arithmetic it replaced at 95,291 points, a layout cut in place, a layout whose
  precincts stand apart, eight bad layouts refused; mutation-checked, so extend it with every table that learns the
  layout). `island` gained the street-name check (a city street's name stops at the city).
- World fingerprint (not a test): `node underworld/tools/world-print.mjs [out.json] [index.html]` hashes every block,
  the world's lists, the road net and graph, every collider, the places and a lattice of samples of zone, ground, road
  and off-city; `--cmp a.json b.json` names what differs and exits 1. A change that must not move the world compares
  `IDENTICAL` against `docs/city-spread/world-print-classic.json` (18 s). Two runs of one build are identical.
- City siting (not a test): `node underworld/tools/city-siting.mjs [out.png] [m per px]` surveys the island's natural
  ground under the draft layout in its `LAYOUT` table and lists the candidate sites for each precinct;
  `SITING_AREAS=1` the best site per 640 m square, `SITING_SET="docks=11,21"` another offset, `SITING_JSON=` the
  heights and the layout for a labelled picture.
