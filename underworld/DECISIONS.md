# DECISIONS — the owner rulings that shape the remaining work

Full text: handoff §45.1–§45.39; history: OVERHAUL_STATUS.md. Highlights that constrain M7–M13:

- **Money:** Dirty Cash (no weight/cap, seized when carried or in the car at arrest) and Clean Bank (§45.1, §45.2).
  Casino and lottery are Clean Bank only, routine casino play has a modest house edge (§45.4, §45.5). Legal fees and
  fines are Clean Bank; Dirty only through risky corruption (§24).
- **Laundering:** early fixer ~30–35% (§45.6), fronts later; buying a business never buys Rank/influence/turf (§45.7).
- **Jail:** 1:1 world time; no jail income farming (§45.8); commissary separate (§45.18, §45.22); speeds 1×/3×/5×/7×
  (§24, §37.4); fugitive penalty modest (§37.5).
- **Ranks:** Nobody, Street Hustler, Known Operator, Crew Leader, Territory Holder, Underworld Power, City Kingpin.
  Rep = who knows you; Rank = power; money can't buy Rank; non-destructive downrank (§45.23).
- **Vehicles:** one fleet registry, real parking only, HOT until Chop Shop clean, physical impound (§45.29–31).
  One-offs: unsellable, unchoppable, never staked; Ambassador taken straight into a bay as HOT (§45.39).
- **Rooftop Zephyr:** one-time rare find (§45.39).
- **Roads:** the road graph is authoritative; curved-road architecture not reopened without a real bug (§45.38).
- **Autonomy:** §45.39 — ordinary decisions are Claude's; stop only for true blockers, very large rewrites,
  effort checkpoints, or CONTENT COMPLETE.

## Decisions taken in the autonomous phase (M7–M12; Claude's calls under §45.39)
- **Court (M7):** every arrest goes to a hearing; witnessed crimes build a case file that goes stale; small cases end
  in a Clean fine; a warrant is recognised by sight only; recapture adds a fifth of the new sentence (7–60 days).
- **Jail (M8):** two escape routes, neither certain (drain 30–90%, crew-run laundry truck 20–85%, needs Crew Leader);
  the jail tightens after repeat escapes; the truck route comes out at one star (nobody saw it).
- **Casino (M9):** the old player-favoured 60/40 tuning is removed outright (no knobs left). Limits $10k floor /
  $250k VIP at Rep 1,300 (tables, poker buy-in, sportsbook); Royale Billions ~95% (line game ~91%, jackpots 4%),
  billion = world-time progressive on a $10k spin only (~7,000 h of $10k play per hit). Payouts round down.
- **Fronts (M9, retuned M13):** carried Dirty Cash in person; capacity $15k/$40k/$100k a day by level at 25/15/10%
  (manager +20% capacity, −5 points, floor 5%; top-ups keep running in jail); a raid takes half the float.
- **Crime (M10):** robbable shop-front trades only; security +1 a robbery, −1 per 5 economic days; owner lockout.
  Lockpicks: $75 (M13; was $150) cash at Sully's, carry 5, one per break-in, charged and taken at arrest. Burglary: one 17.5%
  report roll on entry (call lands 20–45 s later); tier 4+ homes are contained while you hide inside.
- **Phone/taxi (M11):** six groups; a priority inbox with deep links; Intel map layer shows only what you know;
  cabs refuse wanted fares and loads over 2 units, and never Skip with product aboard.
- **Opening (M12):** six Rosa jobs finished by doing the real thing; modest Dirty pay; no Rank handed out.
- **Economy (M13, ECONOMY.md):** the daily economy turns on economic days (every 24 econ hours = 30 min of play),
  not visual midnight; one sleep a day and it skips no payday; no profit in jail (`JAIL_OPS`); influence = earned
  (turfs, crew, Lieutenants, infamy) + bought (businesses, paid officers) capped at earned; Rank needs
  100 / 400 / 400+2 crew / 800+1 turf / 1,500+4 crew+8 turfs+Lt+450 / 2,500+6 crew+16 turfs+2 Lts+800+warehouse;
  laundering ladder fixer 15% ($100k a hand-off; owner 2026-11-17) → fronts 25/20 → 15/10 → 10/5%; robbery tills ×0.8 / safes ×0.65; pickpocket
  wariness per district, much stronger in the rich districts (circling them ≈ $6.6k/h, was $31–38k/h); official purses $2k/$6k/$15k (VP) and $1.6k/$1.8k/$5k (Cedar Fields), Clean, no Rep;
  business upgrades 0.6×/1.2× of price; suppliers restock half a shelf a day; the Armorer buys hardware but no
  longer sells it; the Royale progressive is also won by other visitors (1 in 400 econ days), so it stays bounded
  (~$1.25B average) and the machine never turns positive. Royale Billions kept (95%, a lottery tail).
- **Graphics overhaul (Session 14, GRAPHICS.md):** no engine rewrite was needed (three.js r160, one file, instanced
  and merged meshes stay the architecture). Interiors hide the outdoors group and pause the sun's shadow pass;
  Dirty Cash is green and Clean Bank blue everywhere money shows; map symbols keep their letters as data (tests
  and saves) and draw pictograms; the terrain shader only adds detail over the height field's own colours (physics
  untouched); interior lamps light per pixel with no shadows; wet-road reflections are analytic (sky film, lamp
  grid), not a reflection pass; the Royale's odds are untouched (presentation only); no save field added, so no
  migration and no `SAVE_VERSION` bump. The M13 snapshot (`releases/pre-graphics-m13/`) is frozen; the after build
  ships with the main save keys.

## The banks (owner request after the graphics gate; built on existing systems)
- Three branches open from day one (Old Quarter Neighborhood Bank, Downtown Commercial Bank, Port Valen Central
  Bank); no Rank, Rep, job or upgrade gate: the difficulty is the gate (guards 1/3/6, alarm 2★/3★/3★, the police
  through the door after 75/55/40 s, a star more every 60/45/30 s inside).
- Reserves vary by economic day (seeded per bank and day) and rise to the end of the economic week; your ranges
  are the full banks (Neighborhood ~$27–74k, Commercial ~$79–216k, Central ~$160–448k before the deposit boxes'
  spread). Recovery is slow on purpose (tills 2 days, cash room 10, vault 25, drilled boxes 21): robbing one
  branch every economic day earns 6–15% of a full robbery a day (ECONOMY.md §12).
- Proceeds are Dirty Cash in hand ('bankRob'); valuables from the boxes are hot goods; an arrest seizes what you
  carry, like any arrest.
- Legitimate banking is the Clean Bank account at the counter (balance, debt, yesterday's statement); the branch
  takes no cash over the counter (Dirty money still goes through a front or the fixer: no parallel laundering).
- Charges of their own on the case file, on the CCTV as an officer's report: Bank robbery (45 days, severe),
  Assaulting a security guard (8), Killing a security guard (90, severe). A guard downed by gunfire is a killing;
  by fists or a bat, an assault.
- Interiors gained an opt-in fight flag (only the banks set it): combat, guards and officers on the interior
  floor, police who came in can see and arrest you there. A guard holds an unarmed robber (an arrest); the
  guards shoot it out with an armed or violent one; at 3★ and above the police shoot, as on the street.
- Owner follow-up ("fix the vault; all the aspects a bank needs"; the owner chose the scope): the doors (vault, cash
  room, security) are drawn with their room's lamp-lit material (they had been lit by the street's sun: brown by
  day, black at night); a vault's wheel turns, its bolts draw, it swings open (the Commercial's right round against
  the wall; the Central's round door, now in a round steel frame, back into the vault) and stands solid open. The
  vault drill (a timed job lost if you are hit) and the Neighborhood branch having no vault are unchanged (not
  chosen).
- The loot bag, dye packs (ECONOMY.md §12), hostages and a rear staff door for every bank, on the same systems: the
  staff and customers are people (`300`, kind `bankciv`) instead of figures; "Everybody on the floor!" (armed, in the
  hall) makes everyone in it a hostage: Hostage-taking (30 days, severe, a star); the police negotiate 12 s a
  hostage (at most a minute) before they storm; a hostage hurt is Assaulting a hostage (12 days, severe) and ends
  the talking (they come in at once); a hostage killed is Killing a hostage (90, severe, a star). Hostages are held
  while you're out in the hall with them; while you're in the back, each loses their nerve (20–40 s) and runs. The
  rear staff door is on the back wall of each building (a lockpick set opens it from the street: a break-in that
  witnesses can call in); staff or a guard who sees you in the back without the alarm tells you to get out, then
  hits it (a Burglary on the CCTV); the police start coming in through it 10 s after they first storm, and once they
  cover it, leaving that way walks into them; before that, it is the way out unseen.

## Operation Blackgate (the owner's world rebuild; full authority given; ISLAND.md is the record)
- The lattice city stays as the island's metropolitan core; the world round it was rebuilt (an hourglass island: the
  highlands north, the lowlands south, Valen Bay and Valen Sound either side of the city). The seawall stands only
  where the city meets water.
- Roads off the lattice are curved links (the Curved Roads architecture, used as built, not reopened).
- Aircraft and competition cars are vehicles (walk up, get in, steal), with flight physics in place of the car's.
  They and the emergency vehicles are island-only types: taken and used, never kept or sold (no cargo class, no list
  price), so the M13 economy is as it was. No save field was added.
- The sea is shallow physics (you wade to 1.25 m, a car bogs down); an aircraft that comes down in it is lost.
- The racetrack was already there (Valen Point): it gained a chicane, a grid and race cars; the proving ground and
  the airport's 1.5 km runway are where a car's top speed is found.

## The organic downtown (owner, 2026-11-18)
- The owner asked for the central grid (the Old Quarter, Linden Hills, the commercial core, Diner Row and the port
  strip) to read as a city that grew, its gameplay unchanged. Of the three ways offered (an organic overlay on the
  lattice, a true warp of the lattice, the map redrawn alone) the owner chose the overlay. The 80 m lattice stays the
  address system and the backbone every AI drives on.
- What was laid: 24 curved pieces forming 17 named streets, built with the Curved Roads machinery (122). They are
  winding lanes and a crescent through the Old Quarter's courtyards, with Saint Ivo Lane running three blocks. There is
  a diagonal avenue, Glass Mile, across three blocks of the core, plus Diner Row's crescent and lane, and works roads
  on the port strip. Eight lattice segments were closed to traffic (CITY_CLOSED, 020; dressed by 123): mews in the
  Old Quarter, squares in the core and yards on the port strip. Each turns its crossroads into T-junctions; a closure
  on an edge street leaves that street running straight on.
- Rules kept (the organic suite checks them):
  - No closure is on a race line or a precinct's edge street.
  - No road crosses a door, garage, place, home or flat, and every POI stands where it did.
  - Every block keeps two open sides.
  - Each district keeps its density: the owner allowed filler buildings to go, but the lanes are lined with new
    frontage (`_laneFrontage`), so no district lost any. The building counts are now core 210 (was 207), Old Quarter
    172 (168), Linden Hills 139 (137) and the port 41 (36).
- The organic Linden Hills streets (bends and crescents) were already organic and are untouched. So are Crestmoor,
  Midtown, Linden Gardens, Cedar Fields and Southport.

## The downtown rebuilt, district by district (owner, 2026-11-18, after the overlay)
- The owner was not happy with the overlay and ruled for a real rebuild, with three choices:
  - Only the financial core stays a grid.
  - Everything round it is redeveloped on curving streets, the way the island's districts are built.
  - The POIs move onto new plots in their district, and it ships one district at a time: Old Quarter, Linden Hills,
    Diner Row and the commercial ring, then the port strip.
- How a district is rebuilt: its cells become one superblock, so the lattice inside it closes and its streets are
  curved links. The cells stay the address system, so its zone, turfs and district name are unchanged. A door given
  as (block, side, along) on a street that no longer runs is found on the nearest new street: `sidewalkSpot` asks
  the district (`oldQuarterSpot`). The generator builds a front behind every such door before it lays the rest of
  the frontage. A side on an edge street that still runs keeps its spot.
- Phase 1, the Old Quarter (124), is cells 0..2 × 4..6:
  - Streets: Saint Ivo Street, Market Street (in two staggered halves), Bell Lane, Cooper's Walk, Chapel Lane,
    Garage Row and Wick Lane. Saint Ivo Square has a fountain.
  - Buildings: terrace frontage lines both sides of every street and the inside of the four edge streets, with a
    second row behind it and gardens behind that. That is 268 buildings, where the nine grid blocks had 186.
  - Kept: the Quarter Garage stands where it stood.
  - Precincts: the oldquarter precinct now takes in column 3 (0..3 × 4..7; core 4..9). Both stand at offset 0, so
    nothing moved.
  - Races: the Wet Track runs (1,7)–(1,10)–(4,10)–(4,7).
  - Overlay: its Old Quarter lanes and its two mews were removed.

## Southshore Raceway (owner, 2026-11-18: a second racetrack wherever it fits)
- Site: chosen by a survey of the whole island for open ground clear of every road, pad, district, farm and site.
  The widest level ground left was the south lobe's plain between Marsh Hollow and the airport. The plain east of
  the airport was smaller, cut diagonally by Longshore Drive. The highlands are too steep.
- Constraints there:
  - The sea comes in at the south-west, the farms stand to the west, and the airport's level ground (140 m blend)
    lies to the east.
  - Longshore Drive passes on the diagonal: the circuit keeps 50 m from it, and the level site steps back from it in
    six pads.
- The circuit: 1.57 km, 13 m wide, eleven corners (28–56 m), built with `filletLoop`. It has a 240 m main straight,
  a fast east side, a long south straight, a hairpin and a chicane through the infield.
- Facilities:
  - Armco with run-off by corner speed, gravel traps, kerbs and paint.
  - A pit lane, a pit wall, nine drive-through garages (18 bays) and the paddock with the Race Office.
  - A grandstand in the infield.
  - Raceway Road runs off Heron Loop to a turning circle at the office door.
- The venue: `RacewayPark` is an OfficialVenue (Clean Bank, no Rep, no heat). Its three events are the Hot Hatch
  Trophy, the Touring Cup and Southshore GT. It also offers timed sessions. The raceway is a property (kind
  `raceway`, $420,000, provisional like the other venues): the owner races free and parks 18 cars in the garages.
  Save key `raceway`.

## The Southshore Motorsport Complex (owner, 2026-11-18): the oval, and one complex for both tracks
- The owner removed the Cedar Fields off-road park for an oval, kept the road course as a road course, and asked for
  one garage system feeding both tracks. Of three options offered they chose one complex, linked: one property,
  pooled garages, a road between the paddocks, and both offices running both tracks.
- Southshore Speedway (126; venue `OvalPark`, 509b) stands on the off-road park's ground:
  - The oval has two 400 m straights joined by 90 m turns, 1.37 km a lap and 15 m wide, driven anticlockwise.
  - The turns are banked: the outside is 1.8 m up, eased in over 40 m. The track is sealed (a new terrain surface,
    `asphalt`: full grip, no rough), with a sealed apron and a concrete wall with a catch fence. Armco runs round the
    infield.
  - The pits have a pit lane and pit wall on the front straight, twelve drive-through garages (24 bays), the paddock
    with the Speedway Office, and a grandstand on the back straight.
  - The ways in are the land bridge's track (as before) and Oval Gate Road from the Southshore Highway, through a
    gate in the west fence.
- The complex (property `raceway`) is renamed the Southshore Motorsport Complex. It costs $600,000 (provisional) and
  has 42 bays: the road course's 18 plus the oval's 24. Paddock Road runs from Raceway Road to the Southshore
  Highway. Either office (`complexOffice`) lists both tracks' six events and both tracks' sessions.
- Removed with the off-road park:
  - Its three official events, the countryside dirt races (Dust Devil, Ridge Run) and Vance's dirt pink slip, which
    all ran on its countryside tracks.
  - The `offroad` property and its save slot.
- Kept: Tull's Mesa Trail reward. It is for any five unique stunt jumps, not the course.
- A save that owned the park has its $180,000 back, Clean and once, as it loads (money source `propRefund`). Its
  cars parked there move to the street.
- The map's Cedar Fields ground had drawn far too dark: its colours were read as linear light. It now uses the
  surfaces' sRGB colours.
