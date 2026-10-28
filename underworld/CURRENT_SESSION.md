# CURRENT SESSION

- Phase: autonomous pre-graphics build (§45.39), effort Medium.
- Done this phase: M7 legal/court (`f1f5ed5`), M8 jail rebuild + M9 fronts/honest casino (`90d10ff`).
- Running: full regression `m9-full` on the staged copy `underworld/.stage-m9.html`
  (results in `underworld/.runs/m9-full/results.json`, progress in `underworld/.runs-m9.out`; build and
  static-money were run separately and pass). Known load flakes: threat clock, stress frame stall, gambling
  scratch timing.
- Now: **M10 — crime content** (ROADMAP.md): robbable business interiors (till + safe, cooldown, security
  recovery, owned-business lockout), lockpicks, burglary single report roll, pickpocket value ranges, events.
- Next action: audit the existing robbery / burglary / pickpocket code (`360`, `350`, `pedType`, `rollLoot`)
  and build the robbable business interior kit.
