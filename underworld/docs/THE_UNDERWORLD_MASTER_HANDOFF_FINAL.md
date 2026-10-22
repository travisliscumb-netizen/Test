# THE UNDERWORLD — MASTER OVERHAUL HANDOFF FOR CLAUDE CODE

> Transcribed into the repository in the orientation session (Session 0) from the brief the owner
> supplied, so later sessions do not depend on conversation history. Wording is unchanged; only the
> layout was converted to Markdown. If the owner supplies a newer revision, replace this file.
> §45 records the owner's Session 0 amendments; it overrides the sections it names.

## Purpose

This is the authoritative handoff for the overhaul of The Underworld after the latest reviewed build index 16(2).html. The current game is the foundation/template, but when current implementation conflicts with this document, this document wins.

Claude should read this whole document before editing. Preserve working engine foundations, but replace obsolete subsystems cleanly instead of stacking parallel logic on top of them.

Final production should use a new clean save generation/schema. Legacy saves may be migrated during development when practical, but must not constrain the architecture.

---

## 1. CORE DESIGN

> Amended by §45.7 (business influence) and §45.23 (Rank gates, money and crew loyalty, non-destructive downranking).


Primary progression loop:

Personal action → crew delegation → infrastructure → automation → empire-scale supply/control

The game must remain a free-roam crime/empire sandbox. Automation removes busywork, not strategy. Failure should hurt but never soft-lock the career.

### Visible player ranks

Only these seven player-facing Rank titles:

1. Nobody
2. Street Hustler
3. Known Operator
4. Crew Leader
5. Territory Holder
6. Underworld Power
7. City Kingpin

Reputation = who knows you. Rank = how powerful you are.

Numeric Reputation stays for contacts, opportunities, vehicles, tuning, stock, etc. Remove the old visible Reputation-title ladder.

Money does not buy Rank, Reputation, turf, contacts, crew loyalty, or political influence. However, if a player becomes rich early, they may buy any legitimate asset that is genuinely for sale and affordable.

---

## 2. MONEY — DIRTY CASH + CLEAN BANK

> Amended by §45.1 (no carry cap), §45.5 (casino currency), §45.6 (laundering fixer), §45.14 (classification review), §45.17-§45.21 (classifications, stunt cap, medical debt, payroll), §45.22 (remote income routing, hospital bill, jail money, stolen-car sale), §45.24 (vehicle provenance and resale).


Replace the single-money model.

### Dirty Cash

Criminal activity produces Dirty Cash: dealing, burglary, robbery, stolen-car sales, warehouse raids, illicit jobs, etc.

Dirty Cash can be:

- carried
- stored in safehouses
- stored in warehouse cash vaults
- used for criminal purchases/bribes where appropriate
- laundered

### Clean Bank

Legitimate income goes to Clean Bank: businesses, casino winnings, legal sales, legitimate prizes, laundered money.

Major legitimate assets/services generally use Clean Bank.

### Arrest rules

- carried Dirty Cash: confiscated
- Dirty Cash in the caught vehicle/trunk: confiscated
- Dirty Cash stashed in a safehouse/warehouse: safe from ordinary arrest
- Clean Bank: untouched by ordinary arrest
- a separate property raid may threaten stashed Dirty Cash

### Laundering

Fronts/businesses launder Dirty → Clean with time, capacity and fee.
Fee progression: about 25% → 20% → 15% → 10% → top end about 5%.
No unlimited instant laundering.

---

## 3. CONTRABAND / SUPPLY

Product ladder:

1. Bootleg Smokes
2. Green
3. Pharma
4. Snow
5. Black Tar

Hardware/guns remain separate.

Most products should become obtainable by Known Operator in small, expensive, risky quantities. Rank unlocks scale, reliable supply, cheap wholesale pricing, logistics, automation and cartel/import shipments, not merely basic product access.

---

## 4. TURF / TERRITORY

> Amended by §45.13 (no silent flips, rivals included) and §45.23 (property presence capped).


Use the full Map in Turf/Territory mode.

Rival turf flow:

1. inspect control
2. Weaken Turf
3. reach threshold
4. explicit Take Turf action
5. showdown
6. win flips ownership

No silent ownership flips from background influence.

After takeover, the player assigns Enforcer, Dealer and supply.
First turf can happen before warehouse; player manually resupplies early.

---

## 5. WAREHOUSES — FULL REBUILD

> Amended by §45.25 (Session 3B builds the physical warehouse; Drivers charge no per-run fee).

Warehouses become core empire infrastructure:

- bulk product storage
- Dirty Cash vault
- crew assignment hub
- logistics origin/destination
- shipment destination
- gang-war target
- defensive stronghold

Target assignment capacity: 15 slots. Typical composition can support up to 10 Enforcers, up to 4 Drivers and 1 Lieutenant.

### Driver

The current Driver behavior that passively steals cars for money is obsolete.
New Driver = logistics/transport:

- supplier/import → warehouse
- warehouse → turf/dealer
- vehicle/logistics relocation where relevant
- cartel/major shipment transport

Runner and Driver are merged into Driver.

### Dealer

Dealer is crew. Street buyers are NPC customers.

### Lieutenant

Manages warehouse/district, automates dispatch, coordinates defense.

---

## 6. WAREHOUSE FIVE-LEVEL SECURITY PATH

> Amended by §45.25 (functional physical layer in Session 3B, its regression tests).

### Level 1 — Basic

Exterior: open lot, no fence, no gate, weak lighting, plain roll-up door.
Interior: basic shelves/pallets, small office, exposed storage, no meaningful vault/security room.

### Level 2 — Reinforced

Exterior: chain-link fence, basic gate, cameras, stronger lights.
Interior: better shelves, lockable cages, stronger office, small safe.

### Level 3 — Secured

Exterior: taller fence, motorized gate, bollards, more cameras/floodlights, controlled loading area.
Interior: dedicated product cage, improved cash room, security desk/monitors, crew area, stronger doors.

### Level 4 — Fortified

Exterior: heavy anti-climb fencing/partial walling, reinforced powered gate, guard booth, anti-ram barriers, protected loading bay, dense cameras/floodlights.
Interior: proper vault, hardened product storage, Lieutenant office, larger security room, backup power, secure weapon storage, defensive choke points.

### Level 5 — Maximum Security

Exterior: full hardened perimeter, wall/fence combination, massive powered gate, access-control posts, reinforced guard booth, anti-ram protection, protected approach, comprehensive cameras/lights.
Interior: large Dirty Cash vault, product vault/cages, command/security room, Lieutenant office, crew ready room, secure armory, redundant power, reinforced internal doors, protected loading corridor.

### Automatic gate

Authorized player/crew/Driver/delivery vehicles trigger the gate to open and close automatically. Unauthorized/rival NPCs remain locked out.

### Upgrade categories

- Perimeter
- Surveillance
- Access Control
- Vault / Interior Security

Physical upgrades should visibly appear as purchased.

### Normal-rival immunity

At Maximum Security plus minimum staffing (roughly 4–6 Enforcers + 1 Lieutenant), ordinary rival raids cannot successfully knock the warehouse off.

This does not make it immune to exceptional threats such as a special gang-war assault, police/task-force raid, betrayal or sabotage.

---

## 7. WAREHOUSE DIRTY-CASH VAULT

> Amended by §45.1 (no carry cap) and §45.22 (operation warehouse and Treasury Warehouse receive remote Dirty income).


The player can deposit/withdraw Dirty Cash at warehouses.
Example: if carrying $5,000,000 Dirty Cash, the player can store it at a warehouse before doing risky work.

Warehouse UI should separate:

- Product
- Weapons/Ammo
- Dirty Cash
- Security
- Crew
- Logistics/Drivers

Dirty Cash has a dedicated vault capacity separate from product storage. Vault capacity expands with warehouse upgrades.

---

## 8. LOGISTICS

Mature loop:

Supplier/import → warehouse → Driver → turf → Dealer → street customers → cash

Route risk:

- own turf: near-zero normal rival hijack risk
- friendly: low
- neutral: moderate
- rival: high
- hostile/war: very high

Police risk is separate.

Cartel/major shipments arrive physically at docks/import points and only become warehouse inventory after a Driver/player safely transports them in a box/cube truck.

Rival gangs should have similar shipments that the player can hijack.

---

## 9. RIVAL WAREHOUSE RAIDS

Enemy warehouses are physical raid targets.
Early jobs may have the player deliver product/cash for gangs to these locations, teaching the system before the player later attacks them.

Raid flow: enter/fight → load product/cash → drive out → unload at own warehouse.

Persistence is mandatory. If the player takes half, leaves, unloads and returns, the remaining half is still there unless the gang has physically responded.

Reinforcement timing:

- first 4.5 minutes: safe window
- after ~4.5 min: reinforcements begin
- ~7–10 min: stronger response
- eventually gang may physically evacuate remaining product

Never silently reset/despawn remaining raid loot.

---

## 10. GANG WARS / THREATS

> Amended by §45.10 (real-time threat timer: ~2 min to THREAT IMMINENT, ~60 s more to execution) and §45.16 (when it runs, freezes, and jail resolution).


Gang war escalates due to actual player pressure: turf grabs, warehouse hits, shipment theft, killings, etc.

Escalation can include intimidation → hits on dealers/deliveries/stashes/businesses → coordinated warehouse strikes/turf takebacks.

Lieutenants coordinate defense so the player does not need to answer every incident personally.

Threat warning flow:

- first warning is a text/message, not modal
- response timer begins when first warning is opened
- if unopened for about 5 in-game minutes, second THREAT IMMINENT message
- threat then starts
- if player does not intervene, assigned crew defend automatically

Messages deep-link to the threatened asset.

---

## 11. CREW / CONTACTS

> Amended by §45.23 (money buys capped, temporary morale, never betrayal-proof loyalty).

Crew roles include Dealer, Enforcer, Driver, Lieutenant, Bodyguard, Business Manager, Scout and Unassigned.
Crew can be paid, hurt, arrested, loyal/disloyal and delegated meaningful work.

Contacts should feel like people with specialties. Unified Contacts area with useful tags such as Supplier, Fixer, Specialist, Job Contact. Unlock via numeric Rep, introductions, turf, missions or empire context.

No grindy gift meters for ordinary contacts.

---

## 12. VEHICLE HANDLING

Preserve the rich current physics where working: mass, power, top speed, steering, grip, braking, suspension, drift, traction, wheelspin, slope response, weight transfer, lateral grip, power oversteer, handbrake.

Target: arcade-realistic, forgiving at normal speed, skill ceiling at high speed/racing/drifting.

Add/refine touch speed-sensitive steering assist and vehicle-aware camera.

No fuel/tire/gearbox maintenance simulation.

---

## 13. DEALERSHIPS

> Amended by §45.24 (a car resells in the currency it was bought with, never above its price).

Keep identities:

- Saltworks Used Autos
- Meridian Motors
- Valen Prestige Motors

Rules:

- shady used lot may accept Dirty or Clean
- every dealer car offers Buy or Steal
- theft initial wanted roughly cheap=1 star, normal=3, prestige=5
- licensed new/prestige purchases use Clean Bank
- stolen dealer car remains HOT afterward
- core utility vehicles reasonably obtainable; rotation favors unusual/luxury stock
- loans belong to banking, not dealer finance

---

## 14. GARAGES / PARKING / HOT / IMPOUND

> Amended by §45.24 (vehicle provenance is tracked separately from HOT status).

Every permanent owned vehicle requires an actual physical slot at an owned compatible property.
No magical overflow storage.
Temporary street parking is allowed.

Fleet screen shows location, condition, HOT/clean state and role.

HOT remains HOT when parked. Cannot garage away an active pursuit.
Destroyed owned cars recover as wrecked and require repair.

### Impound

Abandoned/police-seized owned cars can go to a physical impound lot.
Two recovery paths:

1. pay Clean Bank release fee
2. break in/pick gate and steal own car back

Illegal recovery causes about 2–3 stars depending on method.
Unique/rare vehicles also go to impound rather than disappearing.

### HOT / Chop Shop

Stolen cars are HOT. Nearby police who recognize them may trigger ~1-star pursuit; no magical citywide detection.

Chop Shop: Sell, Clean, Repair, Respray, Upgrade.
Cleaning removes HOT and creates a legal owned car, requiring a parking slot.

Pay & Spray: clears active pursuit, repairs, repaints; does not remove HOT.
Own garage: normal clean-fleet repair/repaint/upgrade; no HOT cleaning.

---

## 15. VEHICLE TUNING / REPAIR / WASH

Tuning: four tracks × three stages:

- Engine
- Brakes
- Tyres & Suspension
- Reinforced Body

Use numeric Rep requirements, not old named tiers. Price scales by class/value.

Car Wash: interactive 5–10 sec brushes/foam, cleans appearance and fully repairs car, but does not clear wanted/HOT.

---

## 16. STREET RACES / TRACKS / HIDDEN CARS

Races give cash + Rep and situational police heat without becoming easiest money farm.
Special races may offer pink slips/prize vehicles.

### Main motorsport complex

Full paved circuit with pits, garages, grandstands, parking. High-speed layout with long straights and broad sweepers; typical corners support roughly 70–80 mph. Drivable outside events.

Purchasable with Clean Bank, no Rank gate. Ownership gives large garage/storage, reduced race fees/private sessions/host events/passive income.

### Off-road track

Cedar Fields/farm region. Rough, bumpy, rocky, rutted, muddy, elevated terrain with obstacles and tighter turns. Normal cars can enter but struggle. Dedicated small garage compound. General Cedar Fields terrain should be genuinely rough.

### 10 permanent unique hidden cars

Mix classic/coupe/luxury/supercar/off-road/muscle/track/GT/vintage/ultimate top tier.
Reveal via contacts, races, Rep milestones, paid intel, exploration and/or hidden-package reward. Clues can first show a search area and later an exact pin.
No respawn while owned.

---

## 17. WEAPONS / ARMOR

> Amended by §45.11 (three shared ammo pools) and §45.15 (caps: Handgun 240, Shotgun 96, Rifle/SMG 480).


Weapons:

- Fists
- Brass Knuckles
- Baseball Bat
- Crowbar or Knife
- Pistol
- Heavy pistol/revolver
- Shotgun
- Compact SMG
- Rifle/carbine

No heavy military fantasy weapons.

Loadout: Melee + Secondary + Primary + Armor.

Ammo categories: Handgun, Shotgun, Rifle. Finite but easy enough to maintain; stashable; separate from product carry capacity.

Approx reserves:

- Pistol 12/240
- Heavy 6–8/144
- Shotgun 6/96
- SMG 30/480
- Rifle 30/360

Dealer vans: fixed neighborhood identity, rotate local parking spots, always active once unlocked, map-marked once unlocked, Dirty Cash, distinct stock.

Armor tiers: Light 50, Standard 100, Reinforced 150, Heavy 200. Higher tiers absorb larger damage share. One vest, depletes/replaced, numeric Rep gates.

---

## 18. PLAYER HEALTH / UPGRADES

> Amended by §45.12 (removal timing).


Health about 300 base to ~480 top.
Partial delayed regen to about 65%; none while wanted.
Food/meds heal more. Hospital/safehouse fully heal.

Melee: attack, heavy, block/dodge.

Death hurts but never removes empire/assets/rank progression.

Personal upgrades: Stamina and Health only, three levels each.
Remove universal player Handling, cooldown/“cops forget faster”, and base armor-damage upgrades.

---

## 19. HOMES / SAFEHOUSES / INTERIORS

Home classes: cheap room, starter/apartment, house, luxury, penthouse/estate.

Functions: sleep/save/lie low, full heal, wardrobe, personal stash for weapons/ammo/armor/Dirty Cash/loot, physical parking where applicable.

Homes = personal. Warehouses = bulk/logistics.

Enterable locations should be gameplay-relevant: owned homes, garages, warehouses, casino, key shops/services, selected businesses, robbery stores, some burglary houses, mission locations.

Use modular interior families. Every interior needs purpose.

Mandatory collision pass: keep doors, halls, stairs, interactions and navigation paths clear.

---

## 20. PICKPOCKET / BURGLARY / STORE HEISTS

Dedicated mugging subsystem is cut. Attack = assault/combat. Pickpocket remains.

Valuable pickpocket loot should be meaningful and location/time dependent. Phones ~$1k–$1.5k, good watches ~$10k–$20k. Wealthy districts should regularly offer some high-value targets instead of microscopic odds.

### Burglary

Quiet/exploratory/push-luck.
Overall report chance about 17–18%, not per-container stacking.
Wealthy home safe regularly ~$100k–$250k; top mansion safe ~$250k–$1M.
High-end reported burglary ≈ 3-star response with multiple units outside and persistent containment/search until actual escape. Wanted cannot decay just because player hides inside.

Lockpick set: purchased in weapon/gear ecosystem, required for locked rooms/safes, timed interaction, confiscated if carried on arrest, spare sets stashable.

### Store heists

Loud/fast/escape.
Register ~$1k–$4k. Safe ~$5k–$20k baseline, higher for special locations.

---

## 21. SHOPS / ROBBABLE BUSINESSES

Most meaningful business types should be physically enterable enough to rob front till and/or safe where appropriate.

Include jewelry, pharmacy, pawn, electronics, clothing/boutique, useful bars/restaurants, etc.

Pharmacy: register + back-office safe + locked medical storage containing Pharma.

Robbery response generally 1–3 stars, heavily biased to 1–2; 3 for loud/violent/lingering/high-value situations.

If player buys a business, they can no longer rob that business.
If unowned, it remains robbable and restocks/reopens after cooldown.
Small store cooldown ~1–2 days; jewelry/pharmacy after big hit ~3–5 days. Recently hit stores can have more security and less cash while recovering.

---

## 22. DYNAMIC STREET EVENTS

Short optional location-aware events: gang shakedown, exposed shipment, police chase, rare car sighting, street crime, etc.
Respect heat/turf/faction state. Never force the player. Avoid spam.

---

## 23. POLICE / HEAT

Five conceptual levels:

1. suspicion / one patrol
2. local active pursuit
3. serious search, likely roadblocks, occasional spikes, police vans
4. high-risk tactical response, heavier blocks, armored vans
5. extreme tactical deployment until genuinely lost

Police know what they observe/investigate through witnesses, cameras, plates and descriptions. No magical omniscience.

Switch cars, break LOS, hide after LOS is broken, lie low.
Properties are not magic shields if police saw the player enter.

Active pursuit is separate from longer investigative case/heat.

---

## 24. COURT / LEGAL / JAIL

> Amended by §45.8 (jail income farming prevented through operational efficiency) and §45.22 (commissary for jail spending; outside money only through a plausible channel).


Police handles arrest/evidence/charges. Court handles outcome/sentence/legal defense/corruption.
Evidence quality matters. Weak evidence helps the player.

Legal fees/fines generally use Clean Bank. Dirty Cash may be used only through explicitly risky corruption routes.

### Judge/corruption

Not a guaranteed magic button. Effectiveness scales with influence, resources, case severity and corruption network. At Kingpin/high influence it can be extremely strong, but preserve a small failure chance of around 5% so prison can still happen.

### Jail physical rebuild

Compact multi-room jail centered on a two-tier cell block:

- lower cells
- upper cells/catwalk
- stairs
- central day room
- cafeteria
- yard/gym
- visitation/legal
- work/service area
- medical/service area
- restricted maintenance/security area and escape path

Do not turn it into hallway-walking simulator.

### Unified world time

Every jail day/week/year equals the same outside-world time. Businesses earn and pay costs, payroll/upkeep continues, territory/suppliers/world advance, crew and lieutenants keep working.

### Good behavior / speed

Locked prison speeds: 1× / 3× / 5× / 7×.
Good-behavior points unlock higher speeds. Chores include trays, trash, laundry, work-related behavior. Misbehavior can reduce points and drop speed eligibility.

Three separate loops:

- Good behavior → faster sentence clock
- Work → commissary + good-behavior progress
- Inmate favors → protection/contraband/intel/escape/social advantages

Inmate favors do not directly reduce sentence length.

### Inmate favors can provide

Protection, contraband, tools, guard-routine intel, escape help, lookout/cover, smuggled-phone access, outside contact introductions.

Smuggled phone is limited/risky, not full unrestricted empire control.
Gym benefits must be capped to prevent arrest farming.

### Escape

Early poorly prepared escape should be hard (~20–30% feel). Prepared midgame around half. Advanced empire with crew help/contraband/distraction/getaway can reach ~75–85% feel, never automatic.
Kingpin escape is comparatively easy if jail occurs, but legal/corruption routes usually avoid jail first.

Repeat escapes get slightly harder because jail adapts, but remain fun and repeatable.

Successful escape sets fugitive/escaped-prisoner history. Next arrest adds a modest additional sentencing penalty and worsens treatment. Do not add the entire unserved prior sentence plus a huge flat penalty every time.

Guard bribe should require the right guard/opportunity/influence/resources/risk, not a simple universal pay-to-walk-out button.

---

## 25. CASINO / GAMBLING

> Amended by §45.4 (modest house edge for routine play) and §45.5 (Clean Bank only).


Casino winnings are Clean Bank.
Gambling is optional acceleration. Big wins genuinely make the game financially easier; do not secretly punish the player for luck.

Active-gambling drought pressure:

- ~1 hour without major: start nudging
- ~90 min: noticeable
- ~2 hours: strong pressure toward something exciting
- every further ~30 min increases pressure
- small wins do not reset major-jackpot drought

$10,000 max bet qualifies for the billion-plus progressive.

Main progressive:

- reset/seed around $1B
- no $1B cap; can reach $1.2B, $1.8B, $2B+
- grows from simulated unseen customers even while player is away
- target growth roughly $400k–$800k per in-game day, average ~$600k/day
- visibly ticks while player is in casino
- win resets around $1B and growth restarts
- world-time based persistence; no reload exploit

Slots: classic 3-reel, 5-reel video, multi-line progressive, high-limit, bonus-round, some mechanical flavor.
Tables/areas: blackjack, roulette, poker, baccarat, craps, three-card poker, sportsbook.
Skip Caribbean stud, pai gow, casino war, arcade, concert hall for now.

Casino expands into multi-room complex: central floor, sportsbook, VIP/high-roller, restaurant/bar, nightclub, hotel lobby/rooms, valet, back-of-house, large central jackpot display plus smaller displays.

---

## 26. BUSINESSES / LAUNDERING

> Amended by §45.6 (early laundering fixer) and §45.7 (gradual influence); §45.22 moves the fixer to immediately after Session 2.


Businesses produce Clean Bank, have operating costs, may act as laundering fronts, may use managers, and continue operating while player is jailed.

Buying a business removes robbery option for that business.

---

## 27. MAP / GPS / TAXI

Map: roads/districts/obvious public places visible from start. Knowledge layers in as learned.
Owned assets and known contacts stay marked. Rival turf/gang sites require intel. Hidden cars remain hidden until clues/intel/discovery.

Layer toggles: properties, gangs/turf, missions, races, vehicles, businesses, police/heat, collectibles/intel.
No omniscient citywide live enemy/cop locations.

GPS: preserve current pathfinding where sound; support map destination, rerouting, mission/property/business/impound/track/contact/clue destinations, no routes through inaccessible interiors. Deep links may set route.

Taxi: choose destination, see fare, ride, skip, change destination, exit early. No taxi while actively wanted. Taxi must not bypass HOT-car risk, cargo shipments or physical logistics.

---

## 28. CLOTHING

Cosmetic only. No stat bonuses or progression gates. Expand visual variety later after graphics/core systems are stable.

---

## 29. PHONE / UI

Canonical organization:

- Empire — Rank, Rep, turf, factions, influence, pressure, progression
- Operations — crew, warehouses, logistics, deliveries, defense, Lieutenants
- Trade — suppliers, contacts, market, product
- Assets — homes, businesses, garages, vehicles, tracks
- City — police, legal, opportunities, races, intel
- Messages — texts, threats, contact messages, opportunities, alerts

Map remains a major direct-access surface.

Persistent header: Rank | Dirty | Bank | Pressure.

Unify inventory/stashes around locations: On Me, Vehicle, Safehouse, Warehouse.
Property + Business live under Assets.

Messages deep-link to relevant action/location.
Priorities: Critical / Action / Opportunity / Info.

Locks show requirement + current progress + View Rank Progress where useful.

Dashboard evolves personal → crew/turf → automation/strategy.

---

## 30. BANKING / LOANS / INFLUENCE / POLITICS

> Amended by §45.7.


Loans belong to banking, not dealers. Use Clean Bank/payment structure. No infinite-money exploit; repayment/interest understandable rather than micromanagement-heavy.

Influence/corruption may affect police, legal outcomes, information and pressure. Influence cannot be bought directly with raw cash; it comes from empire position, turf, businesses, crew, contacts and corruption network.

---

## 31. ENDGAME

City Kingpin is a multi-system victory state, not a grind bar.
Requires meaningful empire power: turf, organization, infrastructure, influence/control.

After Kingpin, game continues. Rivals may form coalitions, investigators/state pressure may increase, lieutenants may become ambitious, and the player must hold the empire.

---

## 32. ACHIEVEMENTS / SECRETS / COLLECTIBLES

Achievements are optional recognition, never core progression gates.

Secrets/collectibles reward exploration and can reveal hidden-car intel, unique unlocks or completion rewards. Not required for basic progression.

---

## 33. WORLD / DISTRICTS / TIME / WEATHER

> Amended by §45.9 (economy independent of the day-length setting).


District identities should matter for wealth, police density, target value, gangs, businesses, races, hidden-car clues and terrain.

Major additions include motorsport complex, rough Cedar Fields/off-road area, expanded casino, physical impound, meaningful warehouses.

Time of day should matter for wealthy pickpocket targets, some races, gang activity, businesses, atmosphere and events.
Weather may modestly affect driving/presentation without becoming punitive simulation.

---

## 34. CONTROLS / MOBILE / PERFORMANCE

Primary target: iPhone Safari/Home Screen PWA.

Touch: large controls, readable HUD, no tiny fiddly prison/lockpick mechanics, good driving steering assist, usable combat, easy map/phone access.

Performance target:

- 60 FPS ideal
- ~45 acceptable in dense scenes
- 30 absolute floor, not target

Preserve/adapt quality manager and real-device hitch logging. Use streaming, LOD, inactive-interior unloading, bounded NPCs, distance simulation, geometry/material reuse, adaptive density/resolution.

Final signoff requires real iPhone testing.

---

## 35. SAVE / PERSISTENCE

> Amended by §45.2 (dev-save money → Clean Bank).


Final production uses a clean new save generation/schema.

Persistent state includes at minimum:

- Dirty Cash by storage location
- Clean Bank
- laundering
- warehouse security levels/components
- warehouse vault balance/capacity
- warehouse crew/logistics
- warehouse/rival warehouse inventories
- raid state where needed
- HOT/clean vehicles
- impound
- parking location
- unique cars/clues
- jail/escape history/inmate favors/legal history
- casino progressive/drought
- track ownership
- turf/factions/gang wars
- businesses/contacts/rank/rep/tutorial/world time

No reload duplication exploits.

---

## 36. ONBOARDING / MISSIONS

The game stays free-roam. Use about 5–7 early jobs across gangs/contacts to quietly teach systems while treating the player as cheap labor.

Examples: deliver product to gang warehouse, move cash/stolen goods, transport someone, steal a basic car, collect debt, scout warehouse, move cargo.

Teaches driving, product, warehouse/logistics, police risk, storage, Dirty Cash, map, contacts and vehicles.

After ~5–7 jobs, independence opens. Later the same locations/systems can be turned against former employers.

Midgame: independent operation, crew, turf, warehouse, businesses.
Late game: empire, retaliation, territory, major robberies, strategic choices, fewer petty errands.

No fake constant urgency. Free roam remains viable.

Contextual mentor/friend messages can notice repeated mistakes and suggest systems, then stop once the player demonstrates understanding.

---

## 37. CURRENT-BUILD CONFLICTS THAT MUST BE REMOVED

> Amended by §45.12.


Claude must deliberately search for and replace these conflicts in index 16(2).html:

1. single save.money model → Dirty Cash + Clean Bank
2. Driver currently passively steals cars → Driver logistics role
3. warehouse currently small/simple storage → 15-slot logistics/security hub with 5 visual levels and vault
4. jail speed currently 1×/2×/3× → 1×/3×/5×/7×
5. fugitive sentencing currently too punitive → modest repeatable escape penalty
6. impound can effectively return car to garage → physical impound + legal/illegal recovery
7. garage overflow can use abstract storage → permanent owned vehicles require physical capacity
8. obsolete player upgrades still exist → only Stamina + Health
9. old Reputation/title language → remove player-facing old ladder
10. mugging references → remove dedicated mugging subsystem/tutorial wording
11. jail largely single-block → multi-room two-tier rebuild
12. onboarding campaign structure → install 5–7 introductory teaching jobs while preserving free roam

Do not leave hidden fallback code paths that still mutate obsolete state.

---

## 38. DEVELOPMENT ORDER

> Amended by §45.3 (Session 0.5 module split before Session 1).


Claude should receive this entire specification every major session, but work on only one scoped phase at a time.

Recommended order:

1. Architecture/orientation only — code map, KEEP/REFACTOR/REPLACE/REMOVE, dependency graph, save risks
2. Save schema + Dirty/Clean money foundation
3. Rank/Rep/progression authority
4. Warehouses/logistics/security/vault
5. Warehouse raids/gang wars/threats
6. Vehicles/HOT/parking/impound
7. Vehicle content/tracks/races/hidden cars
8. Police/court/legal
9. Jail rebuild
10. Businesses/laundering/casino
11. Crime content/interiors/dynamic events
12. Phone/map/GPS/taxi
13. Onboarding/missions/contacts
14. Economy balance
15. iPhone performance
16. Feature freeze + full regression

---

## 39. REQUIRED CROSS-SYSTEM REGRESSION SCENARIOS

At minimum test:

1. New career → first money → contact → first product sale
2. Carry Dirty Cash → arrest → seized
3. Stash Dirty Cash → arrest → stash survives
4. Warehouse Dirty Cash → arrest elsewhere → survives
5. Vehicle trunk Dirty Cash → arrested in vehicle → seized
6. Casino jackpot → buy legal high-end asset early → no automatic Rank
7. Early billionaire → no automatic turf/contacts/political power
8. Buy/steal dealer car → HOT lifecycle → Chop Shop clean
9. Fill parking → acquire another car → no magical storage
10. Impound → legal retrieval
11. Impound → illegal retrieval → heat
12. Unique car → save/load → persists
13. Unique car destroyed → recovery works
14. Partial enemy warehouse raid → leave/return → remaining loot persists
15. > 4.5 min raid → reinforcements
16. > 7–10 min raid → stronger response/evacuation
17. Max-security warehouse + staffing → ordinary raid fails
18. Remove staffing → immunity drops
19. Driver through own turf → low rival risk
20. Driver through hostile turf → high rival risk
21. Jail days = outside-world days
22. Jail chores unlock 3×/5×/7×
23. Misbehavior can lower speed eligibility
24. Escape jail → fugitive persists
25. Recapture escaped prisoner → modest extra sentence
26. Repeat escape slightly harder but viable
27. High corruption legal outcome very strong but not guaranteed
28. Own business → robbery disabled
29. Rob unowned pharmacy → cooldown/security recovery
30. High-end burglary → persistent police containment
31. Hide indoors while wanted → wanted does not magically vanish
32. Taxi while wanted → denied
33. Taxi cannot bypass illicit shipment logistics
34. Threat message deep-links correctly
35. No Lieutenant while jailed → empire more vulnerable
36. Lieutenant while jailed → empire functions substantially better
37. Casino progressive grows while away
38. Reload does not reset jackpot pressure
39. Reload does not duplicate warehouse raid loot
40. Reload does not duplicate Dirty/Clean transfers
41. Lose all cash → recovery remains possible
42. Lose all turf → rebuild remains possible
43. Jailed while broke → no soft lock
44. Max police response → escape remains possible
45. 10 hidden cars → no duplicate respawn while owned
46. Pink-slip/prize car → persistent owned vehicle
47. Full Nobody → City Kingpin path → no circular requirement

---

## 40. IMPLEMENTATION RULES FOR CLAUDE

1. Read this entire document before editing.
2. Inspect the latest source before proposing changes.
3. Preserve proven engine systems unless this spec explicitly replaces them.
4. Prefer refactor/replacement over parallel duplicate logic.
5. One authoritative source of truth per system.
6. Do not silently invent design changes when this spec is clear.
7. If there is a genuine contradiction, stop and report it.
8. Keep each build session scoped.
9. After each session: summarize changed systems/files, schema changes, tests, regressions, and remaining conflicts; leave a clean commit.
10. Do not move to the next major phase while current phase has known data corruption or broken core tests.
11. Keep iPhone constraints in mind throughout.
12. At final feature freeze, add no new systems; only fix bugs, persistence, performance, UI inconsistencies and exploits until regression is clean.

---

## 41. DEFINITION OF DONE

The overhaul is done when:

- one authoritative implementation exists for each system
- obsolete logic is removed
- no hidden old-money writes remain
- no duplicate progression ladders remain
- save/load is deterministic
- reload exploits are closed
- all major loops connect
- no circular unlock conditions exist
- failure never permanently blocks recovery
- iPhone performance meets target
- UI explains state/consequences
- full regression suite is green
- a fresh production career can progress from Nobody to City Kingpin without manual save edits or developer intervention

---

## 42. DESIGN CHALLENGE MANDATE

Treat this Master Handoff as the current authoritative design, but do not assume it is perfect. You are expected to challenge it when your review of the existing code, system interactions, game-design principles, persistence model, UX, economy, implementation complexity, or mobile performance reveals a materially better solution.

Actively look for:

- contradictions between systems
- unnecessary complexity
- duplicated mechanics or duplicate sources of truth
- circular requirements or progression dead ends
- exploitable loops
- poor economy incentives
- mechanics likely to be frustrating rather than fun
- implementation approaches likely to create bugs or technical debt
- hidden coupling between systems
- iPhone/Safari performance hazards
- opportunities to simplify without reducing depth
- opportunities to improve progression, feedback, readability or player agency

Do not silently override a locked design decision.

When you believe the target design should change, create a section labeled DESIGN CHALLENGE and state:

1. Current specification
2. Problem observed
3. Proposed improvement
4. Why it is better
5. Systems affected
6. Tradeoffs / risks
7. Severity: OPTIONAL / RECOMMENDED / IMPORTANT

Minor engineering improvements that preserve intended player-facing behavior may be implemented directly and documented. Anything that changes progression, economy, consequences, core gameplay rules, major UI behavior, persistence semantics, or a locked design decision must be surfaced before implementation.

Your role is not merely to obey the specification. Your role is to help make The Underworld as coherent, fun, robust, performant and maintainable as possible.

---

## 43. ENGINEERING DISCIPLINE / SESSION CONTINUITY

Additional non-negotiable engineering rules:

- Preserve player-facing feel where it is already good. Do not rewrite driving, controls, combat or UI behavior merely because the code can be rewritten.
- Before risky refactors, create or strengthen tests around the behavior being replaced, especially save/load, money, vehicle persistence, warehouse inventory, jail/world time and casino persistence.
- Flag hidden coupling whenever one subsystem reaches directly into another subsystem’s internals. Prefer explicit APIs/interfaces when practical.
- Maintain a deprecation list of old fields, functions, UI paths and mechanics being removed. Search for stale references before declaring a phase complete.
- Benchmark before and after performance-sensitive phases.
- Do not expand scope merely because an adjacent idea is interesting. Surface it as a proposal instead.
- Maintain a running save/schema changelog even though the final release uses a fresh save generation.
- After each phase, run not only new feature tests but regression tests for every already-completed phase that the change could affect.
- Keep the working tree clean and make a meaningful commit at the end of each stable phase.
- Create/update OVERHAUL_STATUS.md after every session with: completed work, changed files/systems, schema changes, tests run/results, performance notes, open bugs, design challenges, and the exact next recommended task. This file is the continuity bridge when a new Claude session starts after a usage reset.

---

## 44. GRAPHICS PASS — TIMING AND SCOPE

Do not perform the huge visual overhaul before the major system/world/interior architecture is stable. The graphics pass belongs after core gameplay systems, world changes, interiors, UI architecture and economy/mission integration are substantially complete, but before final mobile optimization and release regression.

Recommended late sequence:

systems/world/interiors → UI → missions/economy → major graphics pass → iPhone optimization → final feature-freeze regression

The graphics pass should not mean “slightly prettier low-poly.” Its goal is:

> Determine the highest believable visual quality Port Valen can ship at the locked iPhone performance budget, then scale intelligently through the adaptive quality system.

Graphics audit order:

1. lighting / shadows / exposure / atmospheric balance
2. materials / surface definition / texture strategy
3. buildings / streetscape / environment
4. roads / terrain / vegetation / water / district identity
5. vehicles
6. player and NPC characters
7. animations and held weapons / hands / body presentation
8. interiors
9. props / signage / clutter / decals
10. time-of-day / weather presentation
11. particles / impacts / muzzle flashes / tire smoke / environmental FX
12. camera / motion / presentation polish
13. LOD / draw distance / streaming / instancing / material reuse / memory
14. adaptive quality presets and real-device performance

The graphics pass may improve art direction aggressively, but it must preserve collision, gameplay readability, interaction locations, GPS/world geometry assumptions and save identity. Any geometry change affecting gameplay must be regression-tested.

---

## 45. SESSION 0 OWNER AMENDMENTS (authoritative)

Decided by the owner after the Session 0 design-challenge review (see OVERHAUL_STATUS.md, DC-01 to DC-16).
Where these conflict with an earlier section, **this section wins**. Each affected section carries an
"Amended by §45.n" note.

1. **Dirty Cash carry (§2, §7).** Dirty Cash has no weight and no hard carry cap. Arrest exposure is the carrying
   penalty: everything carried and everything in the caught vehicle is seized.
2. **Development-save migration (§35).** Money in an existing development save migrates to Clean Bank. Final
   production still uses a fresh career and a new save generation/schema.
3. **Session 0.5 architecture refactor (§38, §43).** Before Session 1, split the single-file source into
   maintainable source modules with a build step that produces the deployable game. The split must be
   behavior-preserving, verified by the complete existing regression suite before and after, and must not be
   combined with gameplay changes.
4. **Casino economics (§25).** Routine casino play must not have strongly positive expected value: use ordinary
   casino economics with a modest house edge. Preserve the huge progressive, the $10,000 qualifying wager, the
   anti-drought excitement system and career-changing jackpot potential.
5. **Casino currency (§2, §25).** Casino wagers, chips and lottery purchases use Clean Bank only. Casino winnings
   are Clean Bank. The casino must not work as a Dirty Cash laundering route.
6. **Laundering bootstrap (§2, §26, §11).** Add an early, low-capacity laundering fixer charging roughly 30–35%, so
   the player can get their first Clean Bank without circular requirements. Proper fronts supersede the fixer later.
7. **Business influence (§1, §30).** Buying a business does not instantly grant Influence or Rank. Businesses may
   contribute Influence gradually, only after operating and establishing themselves.
8. **Jail and world time (§24).** Keep 1:1 prison/outside world-time progression. Prevent jail income farming
   through operational efficiency: managed legitimate businesses can stay strong; unmanaged operations decline;
   criminal logistics and distribution suffer substantially without Lieutenants or appropriate crew.
9. **Day length (§33).** Economic accrual must not be exploitable through the configurable visual day-length
   setting. Decouple or normalize the economic simulation from the user-selected day duration.
10. **Threat timing (§10).** Replace "about 5 in-game minutes" with a real-time response timer independent of
    world-clock speed: about 2 minutes from the first warning to THREAT IMMINENT, then about another 60 seconds to
    execution, subject to playtest tuning.
11. **Ammo (§17).** Ammo uses three authoritative shared reserve pools: Handgun, Shotgun, Rifle/SMG. Magazine sizes
    stay per weapon. The contradictory per-weapon reserve limits are removed.
12. **Obsolete money paths and upgrades (§18, §37).** Remove obsolete hidden-money paths, including the superseded
    ARMS shop, and the obsolete Handling / Cooldown / old Armor player upgrades when their replacement phase lands.
13. **Turf ownership (§4).** Turf ownership never flips silently from influence. Only an explicit Take Turf /
    showdown success changes ownership (this applies to rivals as well as to the player).
14. **Income classification review (§2).** Before income behavior changes, the Dirty/Clean classification of every
    income source (OVERHAUL_STATUS.md Appendix B) is presented for review, with genuinely ambiguous sources flagged.
15. **Ammo reserve caps (§17, DC-17).** Shared reserve caps are authoritative: Handgun 240, Shotgun 96,
    Rifle/SMG 480. Individual weapons keep their own magazine capacities. Contradictory per-weapon reserve caps are
    removed.
16. **Threat countdown rules (§10, DC-18).** The real-time threat countdown runs during active gameplay. The pause
    menu freezes it. The phone and map do not. App/browser suspension, backgrounding, an inactive tab and genuine
    loading states freeze it. While the player is jailed, outside threats do not wait for release: assigned crew
    and Lieutenants resolve the defense automatically, using the asset's actual security and crew state.
17. **Locked income/expense classifications (§2, §45.14).**
    - Hidden-package cash → Dirty Cash.
    - Stunt bonuses → Clean Bank.
    - Sale of a legally owned / clean vehicle → Clean Bank.
    - Sale of a HOT / stolen vehicle through a criminal channel → Dirty Cash.
    - Hospital bill → Clean Bank expense, with no silent Dirty Cash fallback; insufficient Clean funds must not
      create a soft lock.
    - Crew wages → Dirty Cash expense by default, with no silent Clean Bank fallback.

    The remaining ambiguous sources (OVERHAUL_STATUS.md Appendix B review table) must be approved before Session 1
    converts money behavior.
18. **Remaining income/expense classifications (§2, §45.14).** Approved, which clears the review:
    - Illegal street races use and pay Dirty Cash. Legitimate motorsport-complex events use and pay Clean Bank.
    - Crew theft can only take Dirty Cash from locations the crew member can plausibly access. Never Clean Bank.
    - Licensed garages and shops use Clean Bank. The Chop Shop and Pay & Spray use Dirty Cash.
    - Everyday low-level purchases may use either currency, Dirty Cash first.
    - Jail work and jail gambling use a separate commissary balance.
    - Generic civilian cash drops are removed. Gang/criminal drops may remain Dirty Cash.
    - Protection money is a Dirty Cash expense.
    - Passive Lieutenant and Driver stipends are removed.
19. **Stunt cash (DC-19).** One-time stunt/achievement milestones may pay full Clean rewards. Repeatable stunt cash is
    capped per in-game day. Rep can continue after the cash cap, with diminishing returns for repeatedly farming
    the same stunt/location if needed.
20. **Medical debt (DC-20).** Unpaid hospital cost becomes visible, interest-free medical debt, capped at one
    outstanding bill, automatically repaid from future Clean Bank income. It never touches Dirty Cash and never
    blocks respawning.
21. **Payroll (DC-21, partially approved).** Payroll draws Dirty Cash in this order: (1) the assigned warehouse's
    Dirty Cash vault, (2) other warehouse vaults, (3) safehouse Dirty Cash, (4) carried Dirty Cash. The Crew UI
    shows daily payroll, available payroll reserve, days covered and source locations. There is **no** ATM or
    Clean → Dirty conversion: Clean money does not become dirty merely because it is withdrawn. Crew wages remain
    Dirty Cash with no silent Clean fallback. A front/business payroll mechanism for covering criminal wages from
    Clean Bank, if it would improve the game, must be raised as a design challenge, not added silently.
22. **Session 1 follow-up (DC-22, DC-23, DC-24).**
    - **Remote Dirty income routing (DC-22, approved with refinement).** Dirty income the player does not collect
      in person lands, in order: (1) the warehouse assigned to the operation that produced it, where applicable;
      (2) the player-designated **Treasury Warehouse**; (3) the primary safehouse/home; (4) carried cash, only as
      the last fallback. "First warehouse purchased" is not a treasury rule. The player must be able to designate
      (and change) the Treasury Warehouse; that designation UI lands with the warehouse rebuild.
    - **Early laundering fixer timing (DC-23, approved).** The §45.6 fixer is built immediately after Session 2,
      before the warehouse and vehicle sessions. Stolen-car resale is not a laundering route: a known-stolen car
      sold before HOT exists pays Dirty Cash (or is blocked), never Clean Bank.
    - **In-person criminal purchases (DC-24, approved).** The Armorer and suppliers take carried Dirty Cash only.
    - **Phone-placed crew expenses (DC-24, approved).** Hiring, promotions, bonuses, police payroll and delivery
      fees draw Dirty Cash in the §45.21 payroll order.
    - **Hospital bill (DC-24, revised).** The bill is max($1,000, 10% of Clean Bank), capped at $25,000. §45.20
      still applies: Clean Bank only, the shortfall becomes medical debt capped at one outstanding bill.
    - **Money in jail (DC-24, outside-stash access rejected).** Jail bribes and contraband do not draw freely on
      the player's outside stashes. The commissary balance pays ordinary jail spending (small guard favours,
      contraband from inmates, jail gambling). Outside Dirty Cash reaches the jail only through a plausible
      channel: a crew member, contact, guard, inmate favour or smuggling route; with no such channel, outside
      money is unavailable.
23. **Session 2 rulings (DC-25 to DC-28).**
    - **Rank gates (DC-25, approved as implemented).** Underworld Power needs one Lieutenant running a district and
      City Kingpin two; the influence marks stay 450 / 800. Do not lower them before the Session 13 economy pass,
      when influence, business, turf and warehouse systems are all in place.
    - **Money and crew loyalty (DC-26, revised).** Money may affect morale/satisfaction but may not buy permanent
      loyalty or remove betrayal risk. On-time wages prevent loyalty decay; raises may give a modest long-term
      loyalty benefit; bonuses give a temporary morale/loyalty boost; repeated money-based boosts have diminishing
      returns and a ceiling. Traits, history, treatment, promotions, fear/respect, mission outcomes and betrayal
      pressure still matter. No amount of bonus-spamming may make every crew member effectively betrayal-proof.
    - **Property presence on a turf (DC-27, approved with cap).** Owning property on a turf may modestly stabilize
      the player's hold there as local presence. It never grants ownership or Influence, never replaces Enforcers or
      crew, and several properties on one turf have a capped, diminishing effect: property stacking cannot make a
      turf invincible.
    - **Downranking (DC-28, approved with a non-destructive rule).** Rank reflects current power and may fall when
      turf, Lieutenants or other required conditions are lost. Falling never deletes or disables what was built:
      owned properties, vehicles, warehouses, upgrades and businesses remain, Lieutenants and crew assignments
      remain, and automation keeps running. The current Rank may restrict new expansion, promotions and unlocks
      until it is regained, but must not dismantle earlier systems or create a downward spiral.
24. **Vehicle provenance and resale (DC-29, approved with provenance tracking).**
    - A car bought with Dirty Cash is a Dirty-origin vehicle and resells for Dirty Cash; a car bought with Clean Bank
      is a Clean-origin vehicle and resells for Clean Bank.
    - Stolen / HOT vehicles sold through criminal channels pay Dirty Cash.
    - Vehicle provenance is tracked separately from HOT status: "not stolen" does not mean "clean-origin".
    - Normal resale never exceeds the player's recorded purchase price after depreciation, condition, market and
      dealer-spread rules. Ordinary dealer flipping has negative expected value and can't work as laundering or
      arbitrage.
    - Special, unique and prize vehicles may later get explicitly defined custom resale rules; ordinary stock never
      bypasses the money system.
    - Regression tests: Dirty-bought → Dirty resale; Clean-bought → Clean resale; stolen/HOT → Dirty criminal resale;
      no ordinary resale above purchase price; save/reload keeps provenance; no used-car laundering loop.
25. **Session 3 rulings (mixed provenance, DC-30, DC-31).**
    - **Mixed vehicle purchases (approved as implemented).** A legal purchase paid partly in Dirty Cash and partly from
      Clean Bank resells split in the same recorded proportions; the whole vehicle is not Dirty because some Dirty
      Cash was used. Payment provenance stays separate from HOT/acquisition status; stolen vehicles resell Dirty;
      ordinary resale stays capped below the invested cost; prize/found/mission vehicles keep explicit custom rules.
    - **Session 3B (DC-30, approved).** The functional physical warehouse is built now, not deferred to the late
      graphics pass, because raids and gang wars need it: visible security progression for levels 1-5 (fences and
      walls, gates, cameras, lighting and floodlights, bollards, barriers and a guard booth where appropriate,
      protected loading areas), the automatic authorized gate (rivals stay locked out), the interior and its
      functional rooms, and correct collision, navigation and access paths. Functional art and gameplay
      readability only; the cinematic/material/texture/lighting overhaul stays in the dedicated graphics session.
      Regression tests: every tier visibly changes; tier state survives save/reload; the gate opens for the player,
      authorized crew, Drivers and delivery vehicles and rejects rivals and unauthorized NPCs; vehicles enter and
      leave without clipping; the loading bay works; every interior gameplay area is reachable; no blocked doors,
      stairs or interactions; Maximum Security geometry actually supports its defensive behavior; lower tiers do
      not inherit Maximum Security protection; mobile performance stays within budget.
    - **Driver per-run fee removed (DC-31).** Drivers are salaried crew; their normal logistics runs carry no separate
      labour fee. Logistics costs the player through Driver payroll, product purchases, cargo losses, route/rival/
      police risk and vehicle consequences. If logistics needs more economic pressure later, raise a design
      challenge for transparent warehouse/fleet operating overhead; never quietly restore per-run fees.
    - **Development saves.** Dealer corners starting empty is acceptable; no complicated migration for old
      development careers (a small dev-only convenience may be proposed for testing).
26. **Session 3B rulings (DC-32).**
    - **Ramming thresholds (approved as implemented).** Lower-tier fences and gates break when rammed hard enough;
      reinforced and massive gates and the anti-ram barrier tiers never break. Exact speeds may be revisited during
      later vehicle/balance testing.
    - **Breaches (revised).** No silent end-of-day auto-heal. Breach state persists through save/load; a breached
      fence, gate or barrier stays compromised until repaired. Assigned crew may repair automatically after a delay
      and at an appropriate cost; emergency patching may restore partial protection quickly; a full repair restores
      the purchased security tier; an understaffed or unstaffed warehouse can stay vulnerable. Session 4 uses the
      current breach state in raid calculations and physical raid behavior.
    - **Authorization (approved with clarification).** Warehouse access is granted to the player, crew assigned to
      that warehouse, crew currently accompanying the player, and valid Driver/delivery vehicles for that warehouse.
      Ordinary Dealers are not permanently authorized because they belong to the player; a Dealer who must
      physically enter for a specific task or mission gets temporary task-based authorization.
    - **Warehouses for sale (approved).** An unowned warehouse shows an open lot so the player can enter the site and
      buy it.
    - **Camera alarms (approved for Session 3B).** Toast/news only for now. Session 4 connects alarms, cameras,
      guards, breaches and security staffing to raid detection and response.
    - **Map changes (approved).** Cannery Row replaces its block's ordinary buildings; Shed 4's yard removes some
      terminal containers.
