# CURRENT SESSION

- **The city into the island (CITY_SPREAD.md): S1–S7 DONE, the island layout is the DEFAULT.** The city stands round
  Valen Bay: downtown, the Old Quarter, Linden Hills, the port and the new **Linden Gardens** (curving streets on the
  ground the Strip left) on the island's waist; Crestmoor Heights on the bay's north shore; the Nightlife Strip,
  Stadium and Warehouse District on its south shore. Saves move with the layout. S7 found and fixed two real bugs
  (warehouse yard parking left behind by the bake; police spawning in open ground between precincts) and named
  Tanner's Row's far half Cooper's Lane; every affected suite passes on the final build (CITY_SPREAD.md §9).
  Next (owner): play it; rule on spreading wider (split the core, move more precincts out).

- **Round the grid (CITY_SPREAD.md §10): BUILT, commit `77549bd`.** The owner switched from relocation to building
  round the grid. Eight curving streets, five districts (Bayview Heights, Marsh Hollow, Blackgate Landing, Lake Valen
  Shore, more of Gull Harbor), Villa Valen and the Valen Vault (a drive-in bunker). Suite `districts` 8/8. Next:
  Villa Valen as a buyable home; more small rebuilds round the island.

- **The city into the island (CITY_SPREAD.md): stage S1 DONE; stage S2 is next.** The owner played the island, asked
  for the city to stop being a square in the middle of it, and ruled for true relocation (the lattice's districts
  moved out across the island, every system kept, nothing redrawn) over building new neighbourhoods round a fixed
  grid. CITY_SPREAD.md is the plan, the checklist of every place that still assumes a square (741 references in 55
  files), the stage gates and the log. Branch `claude/epic-galileo-m47k4d`.
  - S1 (`d228a94`): `CityLayout` (`021`: the lattice is the address, where a block stands is data), its rules, suite
    `layout`, `tools/world-print.mjs` and the baseline print; `offCity`, `zoneKey`, `districtNameAt`, `groundBase`,
    `turfAt` ask the layout. **Nothing moved**: the world fingerprint is identical to the island build.
  - A bug fixed on the way (`f4f42b9`): the HUD named city streets all over the island ("Elm St" on Mount Valen,
    "Dock St" on the runway). It is the only thing a player can see from this session.
  - Checks: fingerprint `IDENTICAL` (24 sections, 144 + 56 blocks); `layout` 23/23, and it fails on each of four
    deliberate faults; build 5/5, static-money 8/8, smoke 16/16, island 41/41, city 25/25, map 22/22, gangs 23/23,
    police 13/13, taxi 20/20, property 33/33; roadnet 41/42, the one failure being the estate-relocation reload
    check, which fails the same way here on three earlier builds (KNOWN_ISSUES). The full regression was not run:
    S1 moves nothing, and S2's gate is where it is due.
  - The draft siting (`tools/city-siting.mjs`, CITY_SPREAD.md §3) went to the owner as a picture: the city wrapped
    round Valen Bay. **Waiting on the owner's yes / no / move-that; it is needed at S5, not before.**
  - Next: CITY_SPREAD.md §4 stage S2, working §5's checklist from the top.

- **Operation Blackgate (the island rebuild): COMPLETE, delivered for owner review.** ISLAND.md is the record (design,
  what was built and where, decisions, performance, tests). Branch `claude/epic-galileo-m47k4d`. Gate: `island` 40/40;
  full regression 1,928 / 10 (four were roster checks now scoped to ownable models, six load-timing; all pass solo).
  Not done: the lattice city itself is unchanged in layout (ISLAND.md §2), no AI air traffic, no boats, no aircraft
  missions; the fleet is not saved. Next (owner): play it, rule on ISLAND.md §7.

- **Last addition (owner follow-up on the banks): the vault doors fixed, and the loot bag, dye packs, hostages and a
  rear staff door for every bank** (`353`, `512`; ECONOMY.md §12, DECISIONS.md "The banks", KNOWN_ISSUES "Banks").
  Also fixed: people inside interiors were not drawn (the bank guards and police were invisible). Suite `banks`
  55/55; affected suites interiors, smoke, legal, nanframes, static-money. Then STOP: no further milestone.
- Before it: the banks of Port Valen (`fc97fd5`, release `releases/banks/` from it).
- Phase: **Session 14 — graphics / presentation / UI-UX overhaul (Extra High): COMPLETE, STOPPED FOR REVIEW.**
  GRAPHICS.md is the before/after record (audit, what changed, performance, sizes, saves, checks, visual QA).
- Before: `releases/pre-graphics-m13/Underworld_M13_Before_Graphics.html` (`2f624b6`; tag
  `underworld-pre-graphics-m13` on `5b19596`, local only: the proxy refuses tag pushes). Byte-untouched since.
- After: `releases/after-graphics/Underworld_After_Graphics.html`, exported from `b389ca5` (the final code),
  verified 20/20 (desktop and iPhone profiles).
- Gate: full regression on `b389ca5` 1,827 / 6 (all six load-timing, all pass solo); economy and royale-sim green;
  74-scene before/after capture sets; phone-profile perf (three runs each); size table; shader coverage check.
- Not started, by instruction: the dedicated debugging, optimisation and release-candidate phases.
- Next (owner): review GRAPHICS.md §3–§6 and KNOWN_ISSUES "Graphics overhaul"; the measured trade-offs to rule on
  are the boot-time shader compile (+5 s on software GL), Medium's pixel-ratio cap on phones and the night-rain
  road film. Then the optimisation phase (recommended first: device measurement on an iPhone).
