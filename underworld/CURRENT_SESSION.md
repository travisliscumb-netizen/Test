# CURRENT SESSION

- Phase: autonomous pre-graphics build (§45.39), effort Medium.
- Done this phase: M7 legal/court (`f1f5ed5`), M8 jail rebuild + M9 fronts/honest casino (`90d10ff`), M10 crime
  content (`c1c323e`).
- Running: full regression `m9-full` on the staged copy `underworld/.stage-m9.html`
  (results in `underworld/.runs/m9-full/results.json`, progress in `underworld/.runs-m9.out`; build and
  static-money were run separately and pass). Known load flakes: threat clock, stress frame stall, gambling
  scratch timing.
- Note: the m9-full runner uses the live tests/ against the staged pre-M10 build, so suites edited for M10
  (interiors, property, stations, gambling) must be rerun on the final build; do that in the CC regression.
- Now: **M11 — phone / map / GPS / taxi** (ROADMAP.md): regroup the phone into Empire / Operations / Trade /
  Assets / City / Messages + direct Map; the Rank · Dirty · Bank · Pressure header; inventory by location; message
  priorities and deep links; map intel layers; taxi refusal rules (wanted, HOT, cargo).
- Next action: audit the phone (`540` app grid, `phoneapps` suite), then regroup.
