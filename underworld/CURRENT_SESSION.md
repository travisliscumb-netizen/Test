# CURRENT SESSION

- **Last addition (owner request after the graphics gate): the banks of Port Valen.** Three branches, enterable and
  robbable from day one: the Old Quarter Neighborhood Bank, the Downtown Commercial Bank, Port Valen Central Bank
  (`353` content, `512` BankSystem; ECONOMY.md §12, DECISIONS.md "The banks"). Suite `banks`; targeted regression
  of the affected suites (TESTING.md). Then STOP: no further milestone, graphics pass or release prep.
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
