# CURRENT SESSION

- Phase: autonomous pre-graphics build (§45.39).
- Done this phase: M7 legal/court (`f1f5ed5`), M8 jail + M9 fronts/honest casino (`90d10ff`), M10 crime content
  (`c1c323e`), M11 phone/map/taxi (`3d5a1a3`), M12 opening jobs (`1098c0e`).
- Stopped at the **High-effort checkpoint before M13** (owner to switch effort, then continue).
- Last full regression: `m12-full` on `.stage-m12.html` (the M12 build) — results in
  `underworld/.runs/m12-full/results.json`; summary in OVERHAUL_STATUS.md (Autonomous phase M7–M12).

## Next: M13 — economy / progression balance (High effort)
Goal: one integrated tuning pass so the whole game plays from Nobody to City Kingpin with no dominant loop, no
soft lock and no money exploit. Concretely:
1. Build a measurement harness (Node, like royale-sim): income per real hour for each loop at each Rank — street
   sales by tier and district, chop shop, burglary (with the 17.5% report), business robbery (with security
   recovery), pickpocketing (district × hour), contracts, races/pink slips, businesses (Clean, by level, managed),
   fronts (wash capacity), dealers/warehouses/drivers (crew wages), casino (house edge), jail-time costs.
2. Compare against the Rank gates (RANKS.need: Rep, crew, lieutenants, turfs, influence, warehouses) and the price
   ladder (properties, warehouses, upgrades, cars, lawyers/fixes, fronts) so each Rank takes a sensible slice of play
   and no single loop dominates (e.g. robbery/chop vs. product; fronts vs. fixer; casino never a money engine).
3. Check soft locks: broke after an arrest (seizure + fines), no car, no crew; the opening's $150 front; a jail
   term with no businesses.
4. Retune provisional values found across M7–M12 (fines, quash price, lockpick price, robbery ranges, front
   capacity/fees, sportsbook margin, the Royale's ~4% profitable hours) with the harness as evidence.
5. A `progression` / `economy` suite asserting the bands; then the CONTENT COMPLETE gate (full regression, save/load,
   progression + mission flows, mobile perf baseline, docs) and STOP for the Extra High graphics phase.
