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
| Missions/stage engine, contacts | `340`, `380` | `CAMPAIGN`: Rosa's six opening jobs (M12), `until` stages |
| Interiors kit, homes, stores | `350` | burglary/register robbery |
| Robbable business interiors | `352` | `ROB_THEMES`, `ROB_SEC`, `BURGLARY`, `bizInteriorDef` (M10) |
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
| Legal: case file, court, warrant | `511` | M7 |
| Prison | `520` | two-tier block, favours, two escape routes (M8) |
| Opportunities, fixer, fronts, tools | `530`, `535`, `536`, `537` | fronts (M9), lockpicks (M10) |
| Phone / Empire UI | `540` | six groups, header, inbox + deep links (M11) |
| Threats, rival warehouses, shipments | `545`–`549` | |
| Gambling / casino | `550`, `551` | honest odds, limits, progressive; baccarat, craps, 3-card, sportsbook (M9) |
| Taxis | `560` | `TAXI_RULES` (M11) |
| UI manager, map | `600` | Intel layer (M11) |
| Game loop, boot | `630`, `650` | `window.__pv` exports for tests |
