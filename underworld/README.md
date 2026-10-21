# The Underworld

A free-roam systemic crime sandbox set in the city of Port Valen, in one HTML file (`index.html`).
The player-facing title is "The Underworld". Folder names, the save key and the code tags still say
`underworld` / Port Valen so existing saves keep loading. It was built from a copy of
`port-valen/templates/master-template-1.0-stable.html`. The master template has not been changed.

You start with $0, no car, no weapon, no property, no crew and no reputation. There is no scripted
opening. Your first money can come from pickpocketing, robbing gang members, glovebox loot, the chop shop, fencing,
street races (with a buy-in), dealing, street-fight bystander rewards, robbing criminals or a feed tip.
From there you can work up to City Kingpin.

## Overhaul in progress

The game is being overhauled against `docs/THE_UNDERWORLD_MASTER_HANDOFF_FINAL.md`, one scoped session at a time
(`docs/THE_UNDERWORLD_BUILD_SESSION_PROMPTS.md`). `OVERHAUL_STATUS.md` records the current phase, the code map,
design challenges, the deprecation list and the exact next task. Read it before changing anything.

## Money (overhaul Session 1, schema 8)

There are two currencies (`src/game/035-core-money.js`, the `Money` ledger, the only code that touches money):

- **Dirty Cash** is physical. It is on you, in a car, in a safehouse stash or in a warehouse vault, and you move it by
  hand in the phone's Inventory (pockets ↔ car ↔ stash, within reach). Crime pays it to you; empire income (dealers,
  territory tax, tribute, bounties) is delivered to the operation's warehouse, else your Treasury Warehouse, else
  your home safehouse, and only then to you. Selling a stolen car pays Dirty Cash. An arrest takes the cash on you
  and in the car you were caught in; stashes, vaults and the bank are safe.
- **Clean Bank** is business income, legal car sales, stunt cash (capped at $1,500 a day for repeatable stunts) and
  casino winnings. Property, licensed dealers and garages, shop goods, Training, lawyers and the casino are paid from
  it. The hospital bill is 10% of the bank (at least $1,000, at most $25,000); what the bank can't cover becomes
  medical debt (at most one bill), repaid from the next Clean income.

Wages, crew fees and police payroll come out of Dirty Cash in this order: warehouse vaults, safehouses, then what you
carry, never the bank (Crew shows the reserve and days covered). In jail, the commissary account (earned by jail work
and the dice table) pays small favours and contraband; bigger bribes need outside money brought in by a crew member
still on the street. `MONEY_SOURCES` maps every source of income and every cost to its currency; the HUD
shows cash on you and `BANK` beneath it. The save key is unchanged; schema 8 moves an older save's single balance
into Clean Bank.

## Rank, Reputation and turf (overhaul Session 2, schema 9)

- **Rank** is how powerful you are: Nobody, Street Hustler, Known Operator, Crew Leader, Territory Holder,
  Underworld Power, City Kingpin (`RANKS`, read only by `Underworld.rankOf`). Each Rank needs everything below it:
  100 / 400 Rep, then two active crew, one turf, then 8 turfs with a Lieutenant and 450 influence, then 16 turfs with
  two Lieutenants and 800 influence. The Empire overview says what the next Rank still needs.
- **Reputation** is a plain number (who knows you). It gates dealers, tuning, contacts and stock; there is no named
  ladder any more.
- **Money buys no power.** A purchase gives no Rep, no influence and no hold on a turf. A business adds influence
  only once established (nothing for 7 days, full after 21). Homes and neighbourhoods add none.
- **Turf ownership is saved state** and never changes from influence alone. Weaken a rival's hold until you lead it
  (40 influence and 8 more than the owner; 32 on neutral ground), then **Take Turf** on the Turf map card: that calls
  a showdown, fought live if you are there, otherwise by your people on the turf. Rivals change hands the same way
  (wars). A rival that cedes a turf only offers it; a betraying Lieutenant starts showdowns rather than flipping turf.
- Personal upgrades are Stamina and Health only. Schema 9 refunds a development save's Handling, Low Profile and
  Body Armor levels to Clean Bank and derives each turf's owner once from its saved influence.

## Run it

Open `underworld/index.html` in a desktop or mobile browser. It's fully self-contained and works
offline. Three.js r160 and the postprocessing addons the game uses (EffectComposer, RenderPass,
UnrealBloomPass, OutputPass, ShaderPass, FXAAShader) are bundled unmodified with esbuild. The bundle
is inlined in a `<script type="module" id="threeInline">` block and exposed as `window.__PV_THREE`.
There's no CDN, no import map, and no external asset. The bundle adds about 1.2 MB to the file.

To rebuild the bundle:

```
npm install esbuild@0.24.2 three@0.160.0
npx esbuild underworld/tools/three-entry.js --bundle --format=esm --target=es2020 --legal-comments=inline --charset=utf8 --outfile=underworld/src/vendor/three-r160-bundle.js
node underworld/tools/build.mjs
```

## Source layout and the build (Session 0.5)

`index.html` is the deployable game and it stays one self-contained offline file, but it is **generated**. The
source of truth is `underworld/src/`:

| Path | What |
| --- | --- |
| `src/manifest.json` | build order: every file below, listed exactly once |
| `src/shell/*.html` | the page around the scripts: `<head>` (including the `build-version` meta tag deployments bump), the HUD/menu markup, the small boot scripts, closing tags |
| `src/styles/main.css` | all CSS (the body of the page's `<style>` block) |
| `src/vendor/three-r160-bundle.js` | the unmodified three.js r160 + addons bundle (see above) |
| `src/game/NNN-*.js` | the game module, one file per subsystem in load order (`000-prologue.js` … `650-core-boot.js`) |

`node underworld/tools/build.mjs` concatenates the parts byte for byte (no transforms) and syntax-checks both
module scripts; a syntax error is reported as `src/<file>:<line>`. `--check` verifies without writing, and
`node underworld/tests/build.mjs` fails if `index.html` was edited by hand or `src/` changed without a rebuild.
All `game/` files share one `<script type="module">` scope exactly as before, so top-level names are visible
across files and the order in the manifest is the load order. The numbers leave gaps (`010`, `020`, …) so a new
subsystem can be inserted without renaming. Edit `src/`, rebuild, then run the tests: they load the built
`index.html`.

## Controls (keyboard / mouse)

| Key | Action |
| --- | --- |
| WASD, Shift, Ctrl/Alt | Move, sprint, walk |
| LMB / G / V | Light combo (third hit is a kick finisher) / heavy / kick. With a gun: LMB fires along the crosshair, V or G is a quick melee |
| RMB | Fists: block. Gun: aim down sights (tighter spread, closer camera, slower walk) |
| R (gun drawn, on foot) | Reload (R is the radio in a car) |
| X | Dodge |
| E / F | Interact, steal or enter a car, talk, deal, pickpocket |
| 1–5, Q | Weapons |
| Tab / I | Phone: a home screen of apps (Empire, Market, Street Connect, Inventory, Stashes, Crew, Property, Garage, Armory, Police, Feed, Map, Cabline) |
| M | Big map: wheel / pinch to zoom (1×–8×), drag to pan, Places index with search and categories, layer filters, tap a place for its card and "Track location" |
| T (map open) | Territory overlay (also a map layer; tap a turf for details) |
| E at a taxi / Taxi on the map | Hire the cab (or carjack it), pick a street on the map, see the fare, ride; Skip / Change / Get out on the ride panel |
| B (in a car) | Look back |
| F5 | Quick save (only when it is safe) |
| Esc / P | Pause |

Touch with a gun drawn uses a three-finger layout: the left thumb moves, the right side of the
screen aims, and a large FIRE button fires (drag from FIRE to keep aiming while you shoot). ADS,
RELOAD and a contextual MELEE button (shown when someone is within reach) sit around FIRE, and the
crosshair opens with the real spread and turns red over an enemy. Aim assist (Settings: off / low /
medium / high, touch and gamepad only) adds a little friction and a capped pull toward a visible
target in a narrow cone in front of you, never behind you or through walls.

Touch with fists: there is a stick, plus a tap for a light hit, a hold for a heavy hit, Blk to block,
Blk plus the stick to dodge. The top bar holds Map, Phone (Empire screen), Cam, Radio (in a car) and
Pause in one row that never covers the location label. In a car, Gas and Brake are large thumb
buttons at the bottom right with Drift and Horn above them. The speedometer, prompts and toasts are
placed by a layout pass (`HudLayout`) so they never sit under a control. That holds down to
320 px widths, in portrait and landscape.

## Where things live in the code

Each section below is now its own file in `src/game/` (named after its `[CORE]` / `[CONTENT]` / `[UNDERWORLD]`
header). The engine sections from the template (`[CORE] ...`) are still there and have been patched in place:
melee facing, the combat moveset, reverse speed and reverse camera, vehicle damage stages,
witnesses and the investigation, the zero-start save schema, and the district map.
The new layer, tagged `[UNDERWORLD]`, sits just before `[CORE] UI MANAGER`:

- Data tables: goods and risk tiers, factions and bosses, Ranks, properties, contacts, officers, crew roles and traits
- `Market`: prices per district, plus supply shocks and the night/day demand split
- `Underworld`: the strategic clock, influence, Rank, turf ownership (`transferTurf`, `takeTurf`) and inventory/storage. Its save lives in `save.uw`
- `FactionSim` and `GangManager`: five rival factions that run on their own, plus street crews, HQ guards, squads, buyers and brawls
- `CrewManager` and `PropertyManager`: the crew (roles, ranks, loyalty, fear and betrayal), plus safehouses, garages, warehouses and fronts
- `PressureSystem`: police pressure, corruption, honest officers and outside investigations
- `Prison`: arrest and sentencing, and the playable jail block (see "This pass" for how time works now)
- `OppFeed`, `EmpireUI`, `NeonSigns`

City and property layer (this pass):

- `RoadNet` and `SUPERBLOCKS`: the 12×12 lattice with segments closed inside superblocks (estate,
  park, stadium, terminal, fields). Traffic, GPS, races, police routing, peds and the ground shader
  read it. There are no dead ends and every node stays connected. Local lanes, drives, lots and
  paths are painted into a separate raster (`localRoadAt` / `localSurfaceAt`).
- `CITY v2` generators: suburbs (cul-de-sacs, crescents, street lots, low-rise), Crestmoor Heights
  (wealthy), the Crestmoor estate, Greenway Park, the Stadium District (bowl, lot, tunnel onto
  the pitch), the ferry terminal, Cedar Fields (the country edge), the multi-level parkade and the
  Saltworks drive-in chop shop.
- Prop sanity pass (`_propSanity` / `auditPlacement`): every pole, lamp, hydrant, bench, bin, sign,
  tree and shelter is checked against roads, lanes and driveways. A prop in the way slides to a
  clear spot or is removed, and the wires follow moved poles.
- `HOME_LADDER` / `defineHomeProps` (21 homes over six tiers), `PropertyManager` bays and capacity
  (street 1, carport/lot 1–2, single 1, double 2, triple 3, mansion 10 underground, penthouse 1
  outdoor + 4 underground), `GarageDisplay` (stored cars stand in their bays), `DoorSystem` (garage
  and service doors that open for whoever is allowed), `VSpaces` (underground garages at y = -30)
  and on-demand house interiors (`houseInteriorDef`, loaded on entry and unloaded on exit).
- Valen Tower: street lobby, elevator (Penthouse / Lobby / Garage), the penthouse at the real tower
  top with a terrace view (wide chunk streaming while you are up there), and the residents' garage.
- `MapView`: the vector big map with zoom-dependent labels, the Places index, layers (Locations,
  Properties, Businesses, Factions, Territory, Police, Garages, Landmarks), the property card and
  tracking. `MAP_CATS` gives one symbol per category on the big map, the index and the minimap.

Gameplay pass (this build):

- Shooting (`CombatSystem`, `CameraRig`): every shot is a ray from the rendered camera through the
  crosshair, traced again from the muzzle so walls in between still stop it. Per-weapon hip/ADS/
  moving spread, bloom and recovery, recoil that kicks the view up and settles back, reloads,
  headshots, hit markers. Gun stance levels the camera when you draw a weapon.
- Survivability: 300 health at the start (+60 per Constitution level). A body vest is a separate
  layer (150 points) that takes 75% of each hit until it is spent. A lone pistol needs 10-12 body
  hits. NPC fire against the player is slower and less accurate than before, so a gunfight with
  three gangsters lasts about three times as long (17-18 s before, ~53 s now, same setup).
- Vehicles: speed-sensitive steering (tight at parking speed, calm at speed), stronger brakes with
  class differences and weight transfer, better reverse steering, twice the durability with seven
  damage stages (normal, light, damaged, smoking, heavily damaged, critical, destroyed). Visual
  tiers BEATER / COMMON / NICE / SPORT / LUXURY / RARE (paint finish, trim, rims, lights) with LOD
  meshes. Rare models park in the wealthy districts; the garage screen is a collection view.
- Inventory (`Inv`, `Armory`): product is counted by weight or pieces with a cost basis in every
  location (on you, vehicle trunks, safehouse, property, warehouse). Market value, unrealised and
  realised profit. Guns are single items that live on you or in a stash; ammo is counted; the
  Armorer has Buy weapons / Buy ammo / Buy armor / Loadout / Stash tabs.
- `DeliveryManager`: crew runners move product between your locations for a fee, with a success
  chance from the runner and the route, and outcomes from SUCCESS to BETRAYAL, reported afterwards.
- `RoyaltySystem`: rival crews operating on your turf pay royalties that grow with your influence.
- `Gamble` (`[UNDERWORLD] GAMBLING`): Fuel & Go scratch cards ($5-$100, grand prizes $12,500 to
  $1,000,000) and the Lucky Pump slot; the Valen Royale casino on the Nightlife Strip (block 5,9)
  with a cashier, bar, slot floor (classic, 5-reel video, high-volatility, progressive, VIP),
  blackjack, European roulette and fixed-limit Hold'em against four AI personalities, with LOW /
  STANDARD / HIGH / VIP limits by standing. Every bet is settled in one step before its reveal; an
  open blackjack hand and poker chips survive a reload. Every game keeps a house edge.
- Roads (`splinePts`, `Links`, `GPS`): Greenway Park Drive and the Cedar Fields road are smooth
  curved through-roads. One polyline feeds the ground shader, both maps, traffic (which turns off
  onto them and merges back) and the GPS. The lattice graph is unchanged. District road styles
  (`ROAD_STYLE`) for the Old Quarter, Financial District, industrial areas, residential hills and
  the Strip.
- Map: tap open ground for a district card (police, turf, territory tax, property, street prices),
  tap a curved road for its card, and a Street prices layer.

## This pass (polish, fixes, expansion, mobile gameplay)

- Vehicle physics: vertical motion is a physics step (`Vehicle.ground`), the mesh pose is render
  only. Wheels are drawn at their ground contact inside the suspension limits (no wheel through the
  hood), the body pitches and rolls to the surface under it, slopes pull with gravity, collision
  height follows the pitch on ramps. Jumps launch, fly (capped air yaw, a little air control) and
  land with a damped compression. Steering is limited by total grip (no spin-outs at full lock),
  brakes ramp in over 0.15 s, reverse engages after 0.4 s stopped. Every stunt ramp has side
  skirts or guards and a cleared run-up and landing (`_rampSides`, `_clearJumpLane`).
- Central Parkade rebuilt: walled two-way 8 m ramps between four decks, rails at the openings,
  bays off the aisles, level signs and a clearance bar; the Quarter Garage has a top landing.
- Money feedback (`MoneyFeed`): every change to the money you hold, from any system, shows a +/−
  popup under the money readout (since Session 1 it listens to the `Money` ledger; bank changes read "+$n bank");
  quick same-sign changes merge, at most four lines stack.
- Interiors: a two-storey mansion (foyer with a grand staircase, living room, kitchen, study, bar,
  an upstairs gallery, master suite, game room with a pool table and big screen), a new penthouse layout, and house interiors by tier (1-5) with
  real furniture (`FURN`) and searchable containers.
- Burglary: drawers, nightstands, wardrobes and safes each searched once (`burgleState`), loot by
  house tier; breaking in is a crime, and every search (a safe most of all) is noise a neighbour
  may call in.
- Fuel & Go: five stations spread over the city, each with its own shop, staff door, back office
  (desk, stockroom, safe) and the Lucky Pump; rob the till with a gun, force the staff door, crack
  the safe; once a day for the till, once a week for the safe; silent alarm and police.
- Entrances (`EntranceDressing`): every usable door gets a framed contrasting leaf with a handle,
  a wall lamp that brightens after dark, a canopy over shop and public doors and a mat; a faint
  ground ring shows only when you are close.
- Taxis (`TaxiService`): a real cab drives to you (or hail one in traffic); hire it or carjack it;
  choose any street on the map and see the distance and fare first ($6 + $22/km); the AI drives
  you on the roads; Skip (short fade, agreed fare), Change destination, Get out (the cab pulls
  over, you pay the meter); no cab while wanted, thrown out if the police show up, stuck cabs
  reroute then take a shortcut. The old flat $40 cab is gone.
- Phone (`EmpireUI`): an app home screen in three groups with a back button and sub-pages.
  Market › My stock shows per product the quantity, average paid, cost basis, the price where you
  stand, the best known price, value now, unrealised and realised profit (per product) and where
  each lot is. Street Connect lists who sells each product to you and who buys it from you, with
  prices, districts and bust risk; suppliers stay unknown below their reputation and undiscovered
  districts stay hidden; Waypoint sets normal GPS tracking. Stashes and Garage say what is where.
- Map: separate BUY (suppliers, teal ↓) and SELL (street buyers per discovered district and the
  fence, gold $) layers; a place card sits beside the Places drawer instead of under it.
- Shooting: drawing a gun levels the view all the way (it used to stop at a pitch that put the
  crosshair on the pavement ~13 m out); a gun held with the view resting on the ground drifts
  back up when nobody is under the reticle.
- Factions: the player's power deters attacks. A crew outweighed 2.5:1 never starts a war with
  the kingpin; others only move as part of a coalition, one push at a time; rivals on a kingpin's
  turf pay their cut 88-97% of the time.
- Roads: four Linden Hills blocks have a curved lane that cuts the corner between two streets
  (Hawthorn Bend, Kestrel Curve, Millrace Lane, Willow Bend). They are real links for traffic,
  the GPS, taxis and the map. Home-ladder houses are pinned to their doors so layout changes
  never move a home someone owns.
- Tutorial (`Tutorial`): short contextual tips, each once (moving, prompts, first money, map,
  phone, driving, product, stash, first gun, police, property, garage, taxi, jail); switch them off
  or show them again in Settings.
- Jail: no speed buttons. A sentence day passes every two real seconds in the block (menus stop
  it); the street calendar moves a day per week served, so the career calendar stays readable.
  Sentences read "45 days" or "1 year 74 days" and start short (5-150 days by wanted level, capped
  at 3 years). Activities: lawyers (three tiers, odds shown), guard bribes that can backfire,
  shifts in the laundry or kitchen, cards, the yard workout (up to +15% health for good), inmates
  who become connections, Smokey's smuggled phone, the payphone, and a real escape at lights out.
- Diagnostics (`HitchLog`): frames over 120 ms are recorded with what happened just before them
  (getting into a car, an interior, a cab, the map) and renderer counters; Settings › Diagnostics
  shows the log and copies it. `window.__pvHitches` has it in the console.
- Vehicles: A- and C-pillars, roof rails, window seals and a cowl frame the glasshouse; dark
  bezels keep head and tail lamps readable on any paint.

The save key is `pvunderworld.save.v1` and the schema version is 5 (v3 and v4 saves migrate on
load; v4 → v5 moves the old jail-inflated day count into a calendar offset and drops the jail speed). Saves are versioned, sanitized
and written only in a stable state. Settings are stored under a separate key.

## v6 pass (schema 6)

Save key unchanged (`pvunderworld.save.v1`); schema 5 saves load and migrate (new fields default, jail
phone moves into the sentence, business levels start at 1, dealership stock starts empty and stocks
itself). The master template is untouched. Free roam stays free roam.

- **Homes (45):** six tiers from rented rooms to the estate, a signature home per neighbourhood; each
  home lists storage, parking, crew room, security, finish and its neighbourhood perk. Houses get seeded
  multi-room plans (`housePlan`: tier 2 four rooms, tier 3 five, tier 4 seven-eight, tier 5 ten, signature
  eleven, mansion more), built only when you walk in (`interiors.addDynamic`). A home for sale can be
  viewed, bought, or broken into; drawers hold named valuables that scale with the tier and feed the hot-goods
  market. Homes you own hold your bed, wardrobe, fridge and stash, not burglary containers. The Property app
  filters by owned / for sale, district, tier, parking and storage, and sorts and searches.
- **Businesses (50):** 30 kinds (`BIZ_CATS`), each with its own benefit (laundering, recruits, legal,
  fencing, crew room, storage, cheaper property, more income...). Three levels with a price, a name and a
  real change in income, running costs and benefit. A business manager raises income, cuts costs and
  strengthens the benefit. The Business app lists, filters, searches, sorts and upgrades; storefronts carry
  name boards that light up when improved.
- **Pickpocketing:** who you meet depends on the district (`PED_TYPES`); pockets follow a skewed curve,
  with rare $10K / $40K / $100K scores (the $100K one only in the richest districts).
- **Casino:** no table limits, quick bets to $1B plus MAX and custom; roulette multi-bet with a net
  result; one no-limit Hold'em table; ~60/40 player-favoured games (one constant each in `CASINO`); the
  Royale Billions slot with a $10K-$1B jackpot ladder and saved drought pressure. Fuel & Go slots stay small.
- **Jail:** sentences halved; every day inside is a street day; good-behaviour chores unlock 2x and 3x
  time; no phone or map unless you bribe a guard for one; release bribes with a real three-way roll.
- **On foot and camera:** auto-follow behind you while walking, fan-ray occlusion with a damped recovery,
  faster sprint with twice the stamina.
- **Police:** patrols, staffed parked cruisers and foot officers join a live chase (chase, intercept and
  flank roles, a capped unit count, no teleporting).
- **Cars (29 civilian models):** 13 new models with their own silhouettes (`PROFILES`) and details
  (wings, scoops, rails, light bars, intakes, louvres). One list price per model (`CAR_MSRP`).
- **Dealerships:** Saltworks Used Autos across the street from the chop shop (condition, mileage,
  bargains, stock turns over every two days), Meridian Motors (the practical new line-up, sold cars
  replaced overnight), Valen Prestige Motors (a glass showroom, six cars, rotating flagships, a turntable).
  The stock stands on the lot as real locked cars (`DealerLots`): walk up, inspect, buy, drive it off.
  Each has its own map category.
- **Entrances:** the casino forecourt; doors set back from the pavement move to the real facade and get
  a paved walk; parked cars are cleared from every door.
- **App icon:** `tools/icon.svg` → `icons/` (1024 master, 512, 192, Apple touch 180, favicon 32) via
  `node underworld/tools/make-icons.mjs`; `manifest.webmanifest` is linked only over http(s) (browsers
  refuse a manifest from `file://`, and the game must open offline from a file).

New suites: `casino`, `camera`, `police`, `homes`, `business`, `dealers`, `street`, `pwa`. Visual QA
scripts: `frontshots.mjs` (entrances by day, night and rain), `carshots.mjs` (every model side-on and from
above), `contact.mjs` (labelled contact sheets). `UW_FILE=path` runs any suite against another build.

## v7 pass (schema 7): cargo, inventory transfers, casino balance, gang cooldown

Save key unchanged; v6 saves load and migrate (see below). The master template is untouched.

- **Cargo by weight (`CARGO_LB`, `GOOD_CLB`, `cargoC` / `cargoFit` / `fmtLb`):** every model has its own capacity
  in pounds, set by its body: supercar/Valkyr 50, Tempest 60, Obsidian 70, Vireo GT 80, Aurel RS 100, Rook Metro
  110, Monarch 120, Apex 140, Pico 150, Lowline/Revenant 180, Hellion 190, Brakken 200, Corsair 220, Cabline 230,
  sedans 250-300, Crest 380, Marrow Estate 400, Mesa Trail/Kodiak 450, Bastion SUV 500, Ridgeback pickup 1,000,
  Workhorse utility 1,250, Vanta Courier 1,500, Haulmark van 2,000, Boxline box truck 5,000. Police cruisers carry
  nothing. The 13 v6 models used to have no trunk at all. Goods weigh what they are: Green 0.5 lb a lot, Pharma 0.25,
  Snow 0.1, a hot-goods item or a carton of smokes 1 lb, a hardware unit 5 lb. Weight is counted in hundredths of a
  pound (integers), so mixed loads never drift, and lots stay whole. Pockets and property stashes keep their space
  units (the warehouse overhaul is a later pass). Cargo capacity shows on every dealership inspect screen and dealer
  list, in the garage menu and in the Garage app.
- **Inventory as a transfer screen (`Underworld.access` / `locations` / `transfer`, `EmpireUI.t_stash`):** the
  Inventory app shows what is within reach (pockets, the car you are in or beside, the stash of the property you are
  at, the cars in that property's own garage, a car out front while you are indoors) as bright From/To chips with
  1 / 5 / 10 / Max buttons in the product's own units (lb or pieces), 46 px tall. Everything else you own is listed
  below as a dimmed read-only ledger (a stolen car you walked away from shows as "where you left it"). A move is capped
  by what the source holds and what fits, the cost basis moves with the goods, and a direct move to a place out of reach
  is refused. Crew runners stay the way to move product across town. A garage sale that would lose cargo is refused
  with the reason; the chop shop asks before keeping a loaded trunk.
- **Royale Billions (`ROYALE_MAJORS[].perH`, `ROYALE.fullBet` / `sph`, `royaleRollMajor`, `royaleSeedPressure`):**
  jackpot odds are tuned to play time (1,300 spins an hour: a spin settles in 1.95 s, measured, plus a tap). At a bet of
  $1,000 or more the tiers land on average: $10K 1.5/h, $25K 1.0/h, $50K 0.7/h, $100K 0.45/h, $250K 0.25/h,
  $500K 0.15/h, $1M every 14 h, $5M 20 h, $10M 22 h, $25M 24 h, $50M 25 h, $100M 26 h, $250M 28 h, $1B 30 h.
  Smaller bets get a proportionally smaller chance ($100 a tenth); very big bets keep the old 12%-of-stake rule as a
  floor, so the chance never drops for betting more. Every spin rolls every tier in play; nothing caps or schedules a
  win. The drought pressure is kept (chance × (1 + 4P²)), the base chance is divided by its mean factor so the
  averages above hold with the pressure included, and a never-played tier starts from a random point of a typical dry
  spell, so a new save gets the long-run rate from its first hour. The pressure is saved per tier. The INFO panel
  shows each tier as "on average every X of play" and marks a tier that is due. Line pays, presentation, tables and
  statistics are unchanged.
- **Gang aggression (`GANG_AGGRO`, `GangManager.provoke` / `sighting` / `coolDown` / `updateHostility`):** the long-term
  relationship (`f.rel`) and short-term aggression (`f.aggro`, 0-100, saved) are separate. Only hostile acts raise
  aggression (a hit, a knock-out, a boss, a stolen faction car or shipment, declaring war), repeat trouble raises it
  faster, and it cools at 0.35 a second whenever none of that faction's people can see you (a punch cools in ~13 s,
  a downed boss and three soldiers take ~4-5 minutes). Recognition takes a held look with line of sight: when cold,
  only an enemy on its own turf, on foot, within 12 m; when hot, any member within 20 m on foot or 9 m in a slow car.
  Hit squads need high aggression and a sighting in the last 2.5 minutes, spawn near and drive to where you were last
  seen, lock on only when they spot you, and give up after a short search. A hostile group that has lost you stands down
  after 12-37 s. A night's sleep clears aggression, never the relationship. The Factions screen says who is hunting you.
- **Save (schema 7):** faction `aggro` / `trouble` are new (default 0). Trunk contents are unchanged lots with their
  cost basis (the largest v6 load weighs far less than its car's new capacity). Royale pressure from v6 was counted
  against the old bet-proportional chances, so it is reset and seeded from the steady state on the next spin;
  spins, wins, hits and the biggest win are kept.

New suites: `cargo` (capacities, weight, dealership/garage display, reach, transfers, fuzzed conservation, sales,
save/reload, v6 migration), `gangs` (aggression and cooling, squads and sightings, standing down, recognition, save,
sleep), `royale-sim` (Monte Carlo of the real slot code in Node, no browser).

## Tests

The tests use Playwright with headless Chromium (SwiftShader). Run them from the repo root. Every
suite runs with the browser context offline. Any non-file request is aborted and counted as an
error, so a hidden network dependency fails the suite.

```
node underworld/tests/build.mjs     # Node only: index.html matches what src/ builds, manifest complete, both module scripts parse
node underworld/tests/static-money.mjs # Node only: no old single balance anywhere, the wallet only in the ledger, every money source tag valid and used
node underworld/tests/ledger.mjs    # Dirty/Clean ledger: deposit/withdraw/transfer, arrest seizure, stash survival, payroll order, debt, stunt cap, save/reload, v7 migration
node underworld/tests/progression.mjs # seven Ranks, Nobody -> Kingpin chain, money buys no power, turf only by showdown, schema 9
node underworld/tests/smoke.mjs     # boot, $0 start, every menu, map overlay, location layout
node underworld/tests/core.mjs      # melee facing (8 dirs, 180°, post-exit), combo + step-in stress, reverse speed, reverse-camera transitions
node underworld/tests/arrest.mjs    # 9 arrest situations (idle/walk/sprint/fight/vehicle exit/pursuit/map open/repeated) -> jail -> release -> stale-state audit; death respawns
node underworld/tests/session.mjs   # $0 -> first money -> property -> crew -> Take Turf showdown -> corruption -> drive/chase/bust/release -> save/reload/repair
node underworld/tests/ui.mjs        # minimap labels upright, big map layout, colours, input leaks, overlays, touch controls
node underworld/tests/offline.mjs   # no network at all: load, render, play, UI, vehicles, police, combat, map
node underworld/tests/phone.mjs     # phone layouts (8 sizes, 320–932 px, portrait + landscape): top bar, jail, driving HUD, menus
node underworld/tests/map.mjs       # pinch/pan/wheel zoom, limits, labels by zoom, index search, tap to centre, tracking, layers, cards
node underworld/tests/city.mjs      # road network (no dead ends, connected), prop placement, buildings, districts, landmarks, stadium, parkade
node underworld/tests/property.mjs  # 45 homes / 6 tiers, parking capacity, garage doors, bays, save/reload, mansion, penthouse, interiors
node underworld/tests/stress.mjs    # realistic phone session across every new system, HUD overlap audit after each step
node underworld/tests/cityshots.mjs # screenshots of the new districts for visual review (.shots/city)
CYCLES=10 node underworld/tests/soak.mjs  # long session: entities, listeners, timers, GPU memory, frame cost, heap, save round-trip
node underworld/tests/shots.mjs     # screenshots for visual review
node underworld/tests/shooting.mjs  # crosshair alignment, walls, hip fire, recoil, ADS, reload, aim assist, 3-touch layout
node underworld/tests/survival.mjs  # health pool, hits to kill, vest layer, regeneration, real AI gunfights
node underworld/tests/vehicles.mjs  # turning, reverse, braking, durability, damage stages, tiers, LOD, parking, collectibles
node underworld/tests/inventory.mjs # located inventory, cost basis, armory, deliveries, royalties, v3 migration
node underworld/tests/gambling.mjs  # scratch cards, slots, casino games, limits, records, no money duplication
node underworld/tests/roads.mjs     # curved roads, traffic on curves, GPS, road styles, interactive map
node underworld/tests/ramps.mjs     # parkade up/down, Quarter Garage, every stunt jump at three speeds, ramp sides, slopes per class
node underworld/tests/interiors.mjs # reachability walk-search, mansion stairs, penthouse, house tiers, burglary, loot tables
node underworld/tests/prison.mjs    # no speed buttons, sentence clock and calendar, lawyers, bribes, work, cards, escape, save/reload, v4 migration
node underworld/tests/stations.mjs  # five stations, doors, interiors, robbery, back office, once-only rules, police
node underworld/tests/taxi.mjs      # call, hire, map pick, fare, AI ride, change, get out, skip, arrival, police, stuck recovery, carjack
node underworld/tests/phoneapps.mjs # app home screen, every app at 390 px, back navigation, Market P/L, Street Connect, BUY/SELL layers, jail lock
node underworld/tests/kingpin.mjs   # rivals' wars and royalties for an ordinary boss vs a kingpin on the same turf map
node underworld/tests/tutorial.mjs  # contextual tips once each, one at a time, settings off/on, saved
node underworld/tests/money.mjs     # +/- money popups (cash on you and bank) from every path, merging, stacking, fading, placement
node underworld/tests/qashots.mjs   # visual-QA screenshots (.shots/qa): interiors, cars, doors, parkade, station, casino, phone, taxi, jail, districts
node underworld/tests/casino.mjs    # no limits, MAX/custom wagers, roulette multi-bet, Hold'em, 60/40 sims, Royale Billions ladder
node underworld/tests/camera.mjs    # on-foot follow, occlusion fan and recovery, sprint and stamina
node underworld/tests/police.mjs    # patrols, parked cruisers and foot cops join a chase; roles; unit cap
node underworld/tests/homes.mjs     # 45 homes, plans per tier, reachability, viewing, burglary, loot, Property app
node underworld/tests/business.mjs  # 50 businesses, levels, manager, perks, Business app, name boards, migration
node underworld/tests/dealers.mjs   # roster, three lots, stock, rotation, inspect/buy, showroom glass, drive-out, save
node underworld/tests/street.mjs    # pickpocket wealth curve, archetypes by district, jackpot rarity
node underworld/tests/pwa.mjs       # icons at every size, manifest over http, nothing requested from file://
node underworld/tests/cargo.mjs     # cargo by weight, dealership/garage capacity, reach-based transfers, conservation fuzz, sales, v6 migration
node underworld/tests/gangs.mjs     # aggression vs relationship, cooling, sightings, squads to last-seen, standing down, recognition, save
node underworld/tests/royale-sim.mjs # Royale Billions Monte Carlo on the real slot code (Node, 4 workers, ~6 min; QUICK=1 for a short run)
node underworld/tests/perf.mjs underworld/index.html   # frame-cost probe (THREE_DIR=... to compare the CDN-based template)
```

Each suite prints PASS/FAIL lines and a summary, and it exits non-zero if any check fails.

## Validation record (v7 pass)

Since the overhaul began, every session's test results, performance probes and flake analysis are recorded in
`OVERHAUL_STATUS.md`. The records below are for the pre-overhaul builds.

Final build `index.html` (schema 7). Every suite runs offline in headless Chromium (SwiftShader), two at a time.

| Suite | Result |
| --- | --- |
| cargo (new) | 36 / 36 |
| gangs (new) | 23 / 23 |
| royale-sim (new, Node) | 23 / 23 |
| casino (Royale checks updated for v7) | 39 / 39 |
| gambling | 57 / 57 alone; 56 / 57 two-at-a-time (the casino fps check, which fails the same way on the v6 build under that load) |
| inventory | 58 / 58 |
| arrest 126, business 40, camera 20, city 25, core 64, dealers 34, homes 26, interiors 22, kingpin 6, map 22, money 10, offline 14, phone 71, phoneapps 19, police 13, prison 47, property 33, pwa 5, ramps 21, roads 20, session 33, shooting 37, smoke 16, soak 22 (CYCLES=6), stations 17, street 11, stress 30, survival 9, taxi 20, tutorial 13, ui 23, vehicles 39 | all passed |

Timing-sensitive checks seen once under load (both pass on a re-run, and neither touches code changed here): gambling
"casino interior renders without a frame-rate collapse", gambling "reload at the poker table" (asserts at most one
blind was posted before the save; seat rotation sometimes posts two), casino "poker: ~60-68% of played hands win"
(a 1,500-hand random sample; 58.3% once, 63.9-64.5% on re-runs of both builds).

Royale Billions, measured (`royale-sim`, 208M spins of the jackpot roll at $1,000 plus 11.7M full spins):

| | measured |
| --- | --- |
| $1B | every 29.9 h on average (5,359 hits in 160,000 h); median gap 26.8 h; 99th percentile 74 h |
| 30 h of play | no $1B 25.3% · one 53.1% · two 17.6% · three or more 3.9%; a fresh save's first 30 h average 0.995 |
| 7 h of play | no $1M+ 6.8% · one 20.0% · two 27.2% · three or more 46.0% |
| $1M+ / $10M+ / $100M+ | every 2.8 h / 4.3 h / 9.3 h |
| 1-hour session at $1,000 | median +$301K, mean +$51.5M; 93.5% profitable; 39.2% of spins pay nothing; line game alone 98.0%; a $10K-$500K prize in 99.6% of sessions |
| 1-hour session at $100 | median +$1.8K; 56.7% profitable; a $10K-$500K prize in 35.1% of sessions |
| seen, not forced | $1B in the first hour (8 of 400 players), two $1B in the same hour (49), on consecutive days (77), a $250M within an hour after a $1B (203), jackpots on back-to-back spins (87 sessions) |
| droughts | no $1B for 30 / 60 / 90 h: 25.4% / 1.8% / <0.1% (without the pressure: 35.6% / 12.7% / 4.5%) |

Performance (`tests/perf.mjs`, desktop profile, low quality, four runs per build): game-logic update in a calm scene
0.84-1.08 ms (v6) and 0.98-1.30 ms (v7), inside the probe's run-to-run noise; draw calls 116-120 on both. The new
per-frame work is a five-faction aggression decay; sight checks run at most every 0.3-0.6 s; `royaleChances` is now
memoised per bet (cheaper than before).

## Validation record (schema 5 pass)

Every suite runs offline in headless Chromium with SwiftShader. Results below are for the final
build of this pass (`index.html`, 2767538 bytes, schema 5). A full run of all 26 suites, two at
a time, passed everything except four timing-sensitive checks. Each of those passed when its suite
was re-run on its own:

| Suite | Result |
| --- | --- |
| smoke | 16 / 16 |
| core (melee facing, combo stress, reverse speed and camera) | 64 / 64 |
| arrest (9 situations, stale-state audit, death respawns, jail calendar) | 126 / 126 |
| session | 33 / 33 |
| ui | 23 / 23 |
| offline | 14 / 14 |
| phone (8 phone sizes) | 71 / 71 |
| map | 22 / 22 |
| city | 25 / 25 |
| property | 33 / 33 |
| stress | 29 / 29 |
| soak (12 cycles: listeners 209 → 209, no timer growth, heap 91.7 → 91.7 MB, frame cost 197 → 208 ms) | 37 / 37 |
| shooting (now including the camera-tilted-down draw that failed before this pass) | 37 / 37 |
| survival | 9 / 9 |
| vehicles | 39 / 39 |
| inventory | 58 / 58 |
| gambling | 57 / 57 |
| roads (now with the four suburb bends) | 20 / 20 |
| ramps (new) | 21 / 21 |
| interiors (new) | 22 / 22 |
| prison (new) | 28 / 28 |
| stations (new) | 17 / 17 |
| taxi (new) | 20 / 20 |
| phoneapps (new) | 19 / 19 |
| kingpin (new) | 6 / 6 |
| tutorial (new) | 13 / 13 |
| money (new) | 10 / 10 |
| master checksum (`port-valen/templates/master-template-1.0-stable.html`) | unchanged |

Timing-sensitive under load (they passed on their own, and stress's frame-stall check also failed
on the original build before this pass): stress "no frame stall over 2.5 s", gambling "casino
renders without a frame-rate collapse" and "the three reels stop one after another", arrest
"hands-up arrest pose plays" (map open).

`port-valen/tests/playtest.mjs` (the original template's playtest) needs the jsDelivr CDN to boot the
template. It can't boot in an offline sandbox.

Performance from `tests/perf.mjs` (desktop profile, low quality, SwiftShader), three runs each,
the build at the start of this pass against this build:

| | start of pass | this build |
| --- | --- | --- |
| game-logic update, calm (ms/frame) | 1.11 / 1.09 / 0.79 | 2.00 / 1.43 / 1.02 |
| game-logic update, busy (ms/frame) | 1.23 / 1.30 / 0.97 | 1.26 / ~1.3 / ~1.0 |
| draw calls (calm) | 113-115 | 117-119 |
| triangles (calm) | 352k-356k | 361k-365k |

The extra draw calls are the city-wide entrance meshes and the door ring. Logic update is about
0.3 ms a frame higher in a calm scene (taxi service, tutorial, entrance ring, the vehicle ground
pass per physics substep), inside the run-to-run noise of this probe. Wall-clock frame times in
SwiftShader are GPU-bound and too noisy to compare.

The first-drive hitch on phones could not be reproduced in headless software rendering. Instead of
a speculative warm-up, this build records it: Settings › Diagnostics › Show hitch log lists every
frame over 120 ms with what happened just before it.
