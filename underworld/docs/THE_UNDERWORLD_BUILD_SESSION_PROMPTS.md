# THE UNDERWORLD — BUILD SESSION PROMPTS

> Transcribed into the repository in the orientation session (Session 0) from the brief the owner
> supplied. Wording is unchanged; only the layout was converted to Markdown.
>
> Numbering note: these prompts number the implementation sessions 1–16. The Master Handoff §38
> lists phases 1–16 with "Architecture/orientation" as phase 1 and no graphics phase, so prompt
> Sessions 1–13 are handoff phases 2–14, prompt Session 14 (graphics) is handoff §44, and prompt
> Sessions 15–16 are handoff phases 15–16. OVERHAUL_STATUS.md uses the prompt numbering below
> (orientation = Session 0).

## GLOBAL PREFIX — USE AT THE START OF EVERY IMPLEMENTATION SESSION

Read THE_UNDERWORLD_MASTER_HANDOFF_FINAL.md in full enough to refresh all dependencies, then read OVERHAUL_STATUS.md and inspect the current repository state. The full master design remains in force even though this session has a narrow implementation scope.

You are encouraged to challenge the specification if you find a materially better solution, but do not silently change locked behavior. Use the DESIGN CHALLENGE format from the Master Handoff before making player-facing design changes.

Before editing:

1. identify the exact code paths/data structures this phase touches
2. identify already-completed systems that could regress
3. confirm the tests you will run
4. identify obsolete code this phase will delete/retire

During implementation:

- maintain one source of truth
- do not create parallel legacy/new systems
- preserve good existing feel unless the phase explicitly changes it
- keep iPhone Safari/PWA constraints active
- add tests before or alongside risky refactors

At the end:

- run targeted tests
- run regressions for affected completed phases
- run syntax/static checks
- update deprecation/schema notes
- benchmark if performance-sensitive
- update OVERHAUL_STATUS.md
- summarize changed systems/files, tests/results, known issues and design challenges
- leave a clean commit

---

## SESSION 0.5 — SOURCE MODULE SPLIT (added by owner amendment §45.3)

Split the single-file source into maintainable source modules with a build step that produces the deployable game. Behavior-preserving only: run the complete existing regression suite before and after, compare behavior and performance against the original build, and do not combine any gameplay change with the split. Leave a clean commit.

## SESSION 1 — SAVE SCHEMA + MONEY FOUNDATION

Work only on the new save foundation and money architecture: Dirty Cash, Clean Bank, cash stored by location, transaction APIs/source tagging, arrest seizure rules, and safe development migration. Find and eliminate hidden writes to the old single-money state. Do not rebalance all payouts yet.

Required tests: transfer/deposit/withdraw, arrest seizure, stash survival, vehicle-trunk seizure, save/reload, duplicate prevention, invalid/negative balance protection.

## SESSION 2 — RANK / REPUTATION / CORE PROGRESSION

Implement the seven player-facing Rank titles and numeric Reputation as separate concepts. Remove the old visible Reputation title ladder and obsolete text/gates. Ensure money cannot buy Rank/Rep/turf/contacts/loyalty/influence. Validate the full Nobody→City Kingpin dependency chain has no circular requirements.

## SESSION 2.5 — EARLY LAUNDERING FIXER (added by owner amendment §45.22)

Build the §45.6 early laundering fixer immediately after Session 2: a contact who converts carried Dirty Cash to Clean Bank at roughly 30–35%, with a low capacity and a delay, so the first Clean Bank needs no circular requirement. Fronts in Session 9 supersede it. Stolen-car resale must not act as laundering. Required tests: fee and capacity, delay and delivery across save/reload, arrest while money is in transit, no Clean from a known-stolen car sale.

## SESSION 3 — WAREHOUSES / VAULT / LOGISTICS

Build the new warehouse model: 15 assignment slots, Driver logistics role, Dealer supply, Lieutenant automation, Dirty Cash vault/capacity, five physical security levels, four security upgrade categories, visual persistence, authorized automatic gate, route-risk model and max-security normal-rival immunity with minimum staffing. Remove the old passive car-stealing Driver behavior and old small warehouse assumptions.

## SESSION 4 — WAREHOUSE RAIDS / SHIPMENTS / GANG WAR / THREATS

Implement physical major shipments, rival shipments, player warehouse raids, persistent remaining loot, 4.5-minute reinforcement start, stronger 7–10 minute response, physical evacuation, gang-war escalation from actual player pressure, threat messages and automatic crew defense. Close reload/duplication exploits.

## SESSION 5 — VEHICLE OWNERSHIP / HOT / PARKING / IMPOUND

Implement physical parking capacity, remove abstract overflow, HOT lifecycle, dealer theft integration, Chop Shop cleaning, Pay & Spray distinction, physical impound lot, legal and illegal retrieval, persistent location/state, wreck recovery and unique-car-safe persistence.

## SESSION 6 — VEHICLE CONTENT / RACING / TRACKS / UNIQUE CARS

Finalize dealerships, tuning, repairs/respray, car wash, races/pink slips, paved motorsport complex, Cedar Fields off-road course/terrain and exactly 10 permanent unique hidden cars. Preserve good driving feel and budget geometry for mobile.

## SESSION 7 — POLICE / EVIDENCE / COURT / LEGAL

Implement five-level police escalation, observation-based knowledge, active pursuit vs investigative case/evidence, court/legal resolution, Clean Bank legal costs, influence/corruption, strong-but-not-guaranteed late-game legal outcomes, priors and escaped-prisoner consequences.

## SESSION 8 — JAIL REBUILD

Rebuild jail around the two-tier central cell block and connected cafeteria/day room/yard/services/restricted areas. Preserve/refine chores, work, named inmates, lawyers, contraband and escape play. Implement unified outside-world time, 1×/3×/5×/7× good-behavior speed, inmate favors, limited smuggled phone, crew-assisted escape, repeat-escape adaptation and modest recapture sentence enhancement.

## SESSION 9 — BUSINESSES / LAUNDERING / CASINO

Implement legitimate Clean Bank business income/operating costs, laundering capacity and fee progression, managers, robbery ownership lockout, casino Clean Bank winnings, world-time progressive growth, active-gambling drought pressure, billion-plus progressive and planned casino expansion/games. Close save/reload gambling exploits.

## SESSION 10 — CRIME CONTENT / INTERIORS / DYNAMIC EVENTS

Implement/refine burglary, store robbery, pharmacy, pickpocket economy, lockpicks, modular enterable-business interiors, robbery cooldown/security recovery, high-end burglary police containment, dynamic street events and mandatory collision/navigation clearance. Dedicated mugging remains removed.

## SESSION 11 — PHONE / MAP / GPS / TAXI

Consolidate phone architecture to Empire / Operations / Trade / Assets / City / Messages, persistent Rank|Dirty|Bank|Pressure header, location-based inventory/stashes, priorities/deep links, map intel layers, GPS routing and taxi rules that cannot bypass wanted/HOT/cargo/logistics gameplay.

## SESSION 12 — CONTACTS / ONBOARDING / MISSIONS

Implement the 5–7 opening jobs, contacts/fixers/suppliers, contextual mentor hints, progression teaching and later independent contracts. Remove stale old-rank/mugging/tutorial language. Preserve free-roam freedom and avoid fake urgency.

## SESSION 13 — FULL ECONOMY / PROGRESSION BALANCE

Now tune the integrated economy: crime payouts, product margins, crew wages, warehouse/security costs, vault capacity, businesses/upkeep, laundering, cars, properties, tracks, races, robberies, burglaries, legal/corruption costs and casino effects. Lucky windfalls must remain meaningful. Ensure no safe repeatable loop dominates everything and no loss state creates a soft lock.

## SESSION 14 — MAJOR GRAPHICS PASS

The systems/world/interior architecture should now be stable. Perform the dedicated graphics audit from the Master Handoff. Push Port Valen toward the highest believable visual quality that can ultimately ship on iPhone, while preserving gameplay geometry, collision, interaction points and readability. Do not optimize away visual ambition prematurely, but measure cost as you go.

Do not call the phase complete merely because assets look better. Audit lighting/materials/environment/roads/terrain/vehicles/characters/held weapons/animation/interiors/props/weather/time-of-day/FX/camera/LOD. Document every large performance cost for Session 15.

## SESSION 15 — IPHONE / PWA PERFORMANCE

Optimize the now-feature-complete, visually upgraded game on real iPhone Safari/Home Screen PWA. Target 60 FPS, ~45 acceptable in dense scenes, 30 absolute floor. Address hitches, memory, draw calls, LOD, streaming, interior unloading, NPC density, geometry/material reuse and adaptive resolution/quality. Compare before/after measurements and avoid degrading core visual identity more than necessary.

## SESSION 16 — FEATURE FREEZE / FULL REGRESSION

No new features. Run the complete cross-system regression suite from the Master Handoff plus all existing automated/manual tests. Deliberately attack persistence and economy for exploits. Fix only bugs, regressions, UI inconsistencies, performance failures, save corruption, progression blockers and stale legacy code until clean. Validate a fresh Nobody→City Kingpin career path without developer intervention.
