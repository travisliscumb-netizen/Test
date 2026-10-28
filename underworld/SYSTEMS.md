# SYSTEMS — where each system lives (src/game)

| System | File(s) | Notes |
|---|---|---|
| Save, migrations | `030` | `SaveSystem.defaults/sanitize`; systems sanitize their own state |
| Money ledger (Dirty / Clean / debt) | `035` | every movement tagged in `MONEY_SOURCES` |
| World, blocks, places | `090`–`126` | lattice + curved streets + Valen Point + Cedar Fields South |
| Road graph, GPS, kerbs | `135` | `RoadGraph`, `kerbSpot`; authoritative for navigation |
| Vehicles: specs, physics, manager | `220`–`240` | one-offs in `225` |
| Traffic, driving AI | `280`, `290` | |
| Pedestrians | `300` | |
| Police (wanted 0–5, units, sight) | `310` | `copCanSee`, `crime()` |
| Missions/stage engine, contacts | `340`, `380` | `CAMPAIGN` (opening jobs to come, M12) |
| Interiors kit, homes, stores | `350` | burglary/register robbery |
| Content services: garage, dealers, secrets, burglary | `360` | |
| Activities: races, events | `370` | |
| Underworld data (props, goods, factions) | `390` | |
| Market, inventory, armory, crew, turf | `400`–`480` | |
| Property & businesses | `490` | income, perks, raids |
| Warehouses & compounds | `495`, `497` | |
| Homes/parking | `500` | |
| Vehicle registry; one-offs; HOT / impound / Chop Shop | `505`, `506`, `507` | |
| Street racing, pink slips, car wash; Valen Point; off-road park | `508`, `509`, `509b` | |
| Police pressure, corruption | `510` | |
| Prison | `520` | rebuild in M8 |
| Opportunities, fixer | `530`, `535` | |
| Phone / Empire UI | `540` | reorganised in M11 |
| Threats, rival warehouses, shipments | `545`–`549` | |
| Gambling / casino | `550` | house edge + new games in M9 |
| Taxis | `560` | |
| UI manager, map | `600` | |
| Game loop, boot | `630`, `650` | `window.__pv` exports for tests |
