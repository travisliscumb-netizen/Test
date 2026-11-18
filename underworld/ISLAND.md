# ISLAND — Operation Blackgate (the world rebuild)

The owner's directive: turn the game world into a substantial, playable open-world island city, with an airport,
aircraft, helicopters, a racetrack with race cars, a full road network and room for everything the game already does.
This file is the record: the design, what was built and where it lives, the decisions taken, how it performs, how it
is tested and what is left.

## 1. The design in one paragraph
Port Valen no longer stands in a square of sea. It sits on the **waist of an hourglass island** (Valen Island, about
19 km² of land in a 5.6 × 6.4 km sea): the **highlands** to the north (Mount Valen, 246 m, the Crestmoor ridge above
the city, the Blackgate ridge that ends in a sea cliff, Lake Valen inland), the **lowlands** to the south (Cedar
Fields, the airport, the proving ground, the long beach), **Valen Bay** on the city's west waterfront with the
Blackgate Bridge across its mouth, and on its east the **Sound Flats**: Valen Sound until the owner had it filled in
(2026-11-18, §8), land now with **Valen River** winding through its south side to the sea. Six islets
stand off the coast. The reference was the owner's sheet of GTA maps: GTA V's shape of things (mountains north, city and
airport south, an inland lake, a coast highway round the island), GTA IV's and Vice City's bridges and harbour fronts.
The island is original; nothing is copied from those maps.

## 2. The decision that shaped everything: the lattice city stays
> **Superseded (2026-11-16):** the owner asked for the city to flow with the island. It now stands round Valen Bay in
> precincts (the core, Old Quarter, Linden Hills and the port on the waist; Crestmoor Heights on the bay's north
> shore; the Nightlife Strip, Stadium and Warehouse District on its south shore), every system kept and nothing
> redrawn. CITY_SPREAD.md is the record. What follows is why Operation Blackgate itself left the lattice alone.
The 12 × 12 block city is the metropolitan core of the island, unchanged in layout. Every business, bank, casino,
dealer, gang turf, police post, the hospital, the jail, the homes, the missions, traffic, pedestrians, saves and
about 1,800 regression checks are tied to that lattice, and the directive asks to keep the game's identity and working
gameplay. What was rebuilt is everything round it: the sea on all four sides became real geography (the seawall now
stands only where the city meets water: all of the west and east sides and round the terminal; the north side and most
of the south are dry land), and the world went from 1.0 km² of city plus two rectangular annexes to an island with a
road network, an airport, aviation and new districts. A city that is a grid in the middle of an irregular island is
what the directive's own references look like; a grid torn up to look irregular would have cost every system above.

## 3. What was built, and where it lives
| Piece | File(s) | Notes |
|---|---|---|
| The island's ground | `022-content-island.js` | The shore as a closed spline + islets kept as a 16 m signed-distance grid with noise wherever nothing built needs the shore to stay put; an analytic height (shore profile, each lobe's hills, the lake's basin); level pads (the city, Cedar Fields' rim, the airport, the proving ground, building sites); a road bed cut or banked for every road; baked on demand into 256 m tiles of 4 m cells. The physics reads a cell as the same two triangles it is drawn with. `Island.height(x, z, y)` answers by the height of whoever asks where the ground has two levels (a bridge's deck, the tunnel's floor). |
| Roads | `022` (`ISLE_ROADS`, `buildRoads`, `_profile`) | Nine roads, 29.9 km: the Coast Highway round the highlands (with the Blackgate Tunnel under the ridge), Mount Valen Road (a spiral to the summit), Highland Pass, Lighthouse Road, the Southshore Highway round Cedar Fields, Airport Access, the Blackgate Bridge (Saltmarsh to the highlands across the bay's mouth), Longshore Drive round the lowlands, Proving Ground Road. Each is a spline sampled every 2.5 m with a level along it: pinned where it meets the lattice or another road, a bridge over water, one even grade through a cut, never steeper than its grade (7–11%). They are **curved links** like the city's own, so the road graph, GPS, traffic, taxis and police use them with no new code path. |
| What stands out there | `127-content-island-gen.js` | Port Valen International (two runways 1,540 m and 1,100 m, a parallel taxiway and four links, the apron, a terminal with two piers and two parked airliners, the control tower, three hangars you can taxi into, two helipads, a car park, a taxi rank, the airport fire station, runway and taxiway lights); the Valen Proving Ground (a 1,040 m strip with a start gantry and distance boards, a 52 m skid pad, a slalom lot); Fire Station No. 1; Crestmoor Ridge (eight estates); Saltmarsh (twelve houses and a stone jetty); Gull Harbor; Cape Valen Light; the Mount Valen observatory and mast; the bridge's towers; rail and tunnel-wall colliders; the fleet's sites and each place's bystanders. All in extra blocks (`world.xblocks`), streamed like Valen Point's. |
| Scenery | `177-content-island-scenery.js` | Near the focus, 256 m tiles at the physics' own 4 m grid (built one a frame, dropped behind you); everything else one 32 m mesh of the whole island whose index skips the near tiles, the sea bed, the city's square and Cedar Fields; instanced forests on the near tiles (with trunk colliders) by the island's forest map; the roads as ribbons with a painted texture; the bridge (deck, parapets, piers, two towers, main cables and hangers); the tunnel (tube, lights, portals); the airfield's and the proving ground's surfaces and paint. |
| The city's edge | `090` (`_genPerimeter`, `world.shore`), `170` | The seawall, its railing and the wall nothing drives through stand only on the wet stretches of each side. The hospital's and the police station's wing roofs are helipads (a deck you can stand and land on) with a lift from the street. |
| The Sound Flats | `022`, `021`, `125` | Valen Sound filled in (2026-11-18, §8): the east coast redrawn straight down past where the sound's mouth was; Valen River (`ISLE_RIVER`, 60–100 m across) winds from a harbour basin at the Container Terminal's quay (the ship still floats) to the east coast along the old sound's south side; Sound Parkway (port → Uptown) and Riverside Drive (east along the north bank to a turning circle); the impound's Sound annex on the parkway; the plain north of the river kept open (`SOUND_RESERVE`). Valen Point (the first circuit, `125`/`175`/`509` until then) is gone. |
| Vehicles | `232-core-island-vehicles.js`, `220`, `230`, `240` | Six competition cars (GT, cup, prototype, open-wheel, rally, drift), an ambulance, a fire engine, the Skylark aeroplane, the Kestrel helicopter in three liveries. Aircraft are vehicles like any other (walk up, get in, steal) with their own bodies, a spinning propeller or rotors and `Flight` in place of the car's physics. |
| The fleet | `245-core-island-fleet.js` | Spawns each site's vehicles and bystanders as you come near, like the city's parked cars: 24 race cars at the two Southshore tracks (Valen Point's twelve among them), 6 at the proving ground, 3 aeroplanes and 2 helicopters at the airport, the air ambulance on the hospital's roof, the police air unit on the station's, fire engines and ambulances, cars at every settlement. |
| Integration | `020`, `025`–`027`, `030`, `080`, `110`, `135`, `190`, `280`, `600`, `630` | `groundBase` asks the island off the lattice; zones and names; the collision grid covers the island (cells made on demand); traffic runs the highways at highway speed; you wade in the sea and a car bogs down; saves anywhere on the island; the minimap and the big map show all of it (zoom out to the whole island); aircraft controls, the speedometer's height readout, the touch buttons' labels; the helipad lifts. |

| Southshore Speedway | `126`, `176`, `509b` | The oval on the old off-road park's ground (2026-11-18): two 400 m straights, banked turns, twelve garages, a grandstand; with the Raceway one property, the Southshore Motorsport Complex (pooled garages, Paddock Road between them, either office runs both tracks). |
| Southshore Raceway | `129b`, `509c` | The second circuit (2026-11-18), on the plain between Marsh Hollow and the airport: 1.57 km, eleven corners, pits, nine garages, the Race Office, a grandstand; Raceway Road off Heron Loop. An OfficialVenue (509). With the oval it is one property, the Southshore Motorsport Complex, which took Valen Point's owner features (race meetings, the pit crew, a daily income, the Invitational's Monarch) when it closed. |

## 4. Districts off the lattice
Crestmoor Ridge · Mount Valen · Blackgate Highlands · Saltmarsh · Southshore · Port Valen International · Valen
Proving Ground · the Sound Flats (each a `ZONES` entry with its own traffic mix; discovered on foot or at the wheel like
the city's districts), beside Cedar Fields. Waters: Valen Bay, Valen River, Lake Valen. Places on the map: the airport, the proving ground, Fire Station No. 1, Saltmarsh, Gull
Harbor, Cape Valen Light, the Mount Valen observatory.

## 5. Flying
- **Aeroplane (Skylark 180).** W / S throttle, A / D bank, Space (or Shift) climbs, Ctrl (or X) dives; on touch the stick
  flies it (pull back to climb) and Gas / Brake are the throttle. The stick asks for an attitude and the aeroplane
  takes it up as fast as the air over its surfaces allows; hands off, it levels out. It needs a take-off run (about
  120 m), flies itself off a little above its 90 km/h stall, tops out near 280 km/h, stalls and drops its nose when
  slow. Throttled back, the flaps come out; close to the ground it flares, so a shallow approach lands on its wheels.
  Too hard, banked over or nose first is a crash; so is a hillside, a building or the sea.
- **Helicopter (Kestrel).** Space climbs, Ctrl descends, W / S forward and back, A / D turn; on touch the stick flies it
  and Gas / Brake are up and down. The rotor takes about two and a half seconds to spool up; it lifts straight off,
  hovers hands-off, tops out near 210 km/h and settles on its own cushion of air the last few metres down. It lands on
  any roof, street or beach.
- You cannot step out in the air (on the ground, or low and slow enough to drop).
- Aircraft and competition cars are **track and airport property**: you can take and use them, not keep or sell them
  (no cargo class, no list price, $300 at the chop shop like anything unlisted), so the M13 economy is untouched.
  Settlement driveways hold the same kinds of car the city's kerbs do, by the same rolls.

## 6. Performance and size
- The island adds, always drawn: the 32 m far mesh (about 35,000 triangles), the road ribbons, the bridge and tunnel,
  the airfield's paint. Near the focus: at most the land tiles within 240 / 320 / 400 / 480 m (Low … Ultra), about 8,000
  triangles each, built one a frame, with their trees. Downtown, no near tile is in range.
- The collision grid covers the island with lists made on demand (it would otherwise be 140,000 empty arrays).
- The shore's distance grid is built once at boot (about 0.15 s on a desktop); a tile about 3–5 ms when first needed.
- Measurements are in §8.

## 7. Decisions (Claude's calls under the directive's authority)
- The lattice city stays (§2). The owner can still ask for the city itself to be redrawn; it is a separate, larger job.
- Valen Point stayed an island with its causeway (until 2026-11-18, §8); Cedar Fields South stays as built, now
  surrounded by fields instead of water (its fence is the park's boundary).
- The racetrack was already a professional circuit; it gained what it lacked (a chicane, a grid, race cars). The
  place to find a car's top speed is the proving ground's kilometre strip and the 1.5 km runway.
- Roads off the lattice are level across with a 6 m verge either side, so a baked 4 m tile keeps the carriageway
  exactly level; where a road joins another, the one joined keeps its own level through the junction.
- Coming down (owner, 2026-11-16: "easy to go up, hard to come down"): full nose-down is 31° (nose-up 21°); the flaps
  come out only below 60 m or with the nose up, so a dive at idle gathers speed instead of mushing at the stall; hands
  off at idle it trims for a ~5.5 m/s glide. 300 m: climb 21 s, idle dive 11 s (was 27 s), idle glide 53 s (was ~2 min
  for 200 m). The flare starts at a height set by the sink rate (2.2 s of it), so a steep approach still lands on its
  wheels. The helicopter's sink went from 8 to 11 m/s, its ground cushion from 8 m to 12 m. Suite `island` checks it.
- The sea is shallow physics: you wade no deeper than 1.25 m and a car bogs down, rather than drowning, respawning
  or an invisible wall. Aircraft that come down in it are lost.
- No model identifiers, no new save fields (so no migration and no `SAVE_VERSION` bump): the fleet is not saved, and
  a save out at sea comes back ashore at the nearest road.

## 8. Tests and results
- Suite `island` (40 checks): the shore, heights and two-level spans, every road's grade and level bed, the graph
  (every island road reachable from the lattice), the airport, the fleet, a take-off / circuit / landing flown through
  the physics, a helicopter lift-off and roof landing, wading, the map, saves, the phone profile. 40 / 40.
- Full regression on `ac13fb5` (74 suites, three wide): 1,928 passed, 10 failed. Four were the new fleet-only models
  turning up in roster-wide checks (cargo classes, the 25-30 model dealer roster, the one-offs' top-speed order, the
  impound's bay size); those checks now cover the models a player can own, and pass. Six were load-timing (stress,
  gambling ×2, raid, threat; ui and business timed out at boot); all ten suites pass run alone.
- The screenshot-only suites (shots, cityshots, qashots, frontshots) time out in `page.screenshot` on this machine;
  `shots` does the same against the build from before the island, so it is the environment, not the island.
- Size: `index.html` 3,777,128 → 3,916,159 bytes (+3.7%; about +44 KB gzipped). Boot about +0.8 s on software GL.
  Phone profile downtown: about +100,000 triangles and +20 draw calls (the far mesh, road ribbons and structures).
- After the gate: the sea became a frame round the city's square instead of a sheet under it (from 3.5 km up the sheet
  won the depth test and half the city looked flooded); build, smoke, island and city re-run green on it.
- Tools: `tools/isle-preview.mjs`, `tools/isle-shots.mjs` (TESTING.md).

## 8. Valen Sound filled in (owner, 2026-11-18)
The owner: remove the Valen Point racetrack and fill the waterway on the city's east side in completely, natural, no
straight edges; keep a large river to split the land, offset to one side and winding, never straight down the middle;
send that track's cars to the other two tracks' garages or the main garage; extend the roads into the new land and
keep big areas free for what comes next.
- **The land.** `ISLE_COAST` runs straight down the east side now (x ≈ 2,600–2,735) where it turned in to the sound;
  the old seabed is the island's natural ground (the same `nat()` as everywhere: shore profile, roll, noise), so it
  carries on from the lobes with no seam.
- **Valen River.** `ISLE_RIVER` / `RIVER_LINE` (a Catmull-Rom spline): from `RIVER_BASIN` at the Container
  Terminal's quay (the moored ship keeps its water) east along the old sound's south side (z 890–1,220, the sound's
  middle was z ≈ 500) to the coast, 30 → 50 m half width, nine bends. `Island.nat` carves its bed below the sea with
  banks over ~26 m and a wandering edge (noise), and carries its channel through the sea's shoreline shelf (no bar).
- **Roads.** Sound Parkway (`sp1`, the port's east street → Uptown's south street, 1.0 km) and Riverside Drive
  (`sp2`, off it east along the north bank, 1.3 km, a turning circle short of the coast). Island roads keep 0.5 m over
  the sea; the parkway comes out of the city on the annex's pad at that floor.
- **Kept open.** `SOUND_RESERVE` (x 1,000–2,560, z −60–1,000): no farm field, lone house or settlement is scattered on
  it (128, 129). Trees grow on it as on the rest of the island. The fairground did not need it (§9).
- **The Sound Flats** (zone `v`, Valen Point's old zone key, so a save's discovered zones carry over): the land north
  of the river. Zone discovery now fires on the island's dry ground as well as the city's cells; before, the island's
  districts were in `ZONES` but could never be discovered, so the Riviera's "every district" lead could never come.
- **Valen Point removed**: its district, circuit, scenery, venue (`MotorsportPark`), property, events and causeway.
  `FlatBuilder` (175) and the loop helpers (`_loopTurn`, `_xBlock`) stayed for the Southshore tracks.
  - Its owner features moved to the Southshore Motorsport Complex (509c): race meetings ($20k, $32k at the gate the
    next day), the pit crew a third off in any of its 21 garages, a daily income ($3,600 less $1,000 upkeep, scaled to
    its $600k price), and the Invitational (`sr_inv`, the Monarch GT once).
  - The Tempest Clubsport is won with the Touring Cup at Southshore Raceway (was the GT Cup at Valen Point).
  - Its 12 race cars: six in the road course's paddock, six more in the oval's garages.
  - The impound's third yard (`impound_vp`, id kept: a held car's space is an index across the yards) is the Sound
    annex on the parkway, 85 spaces, paved, with a driveway up to its gate; cars seized on the Flats go there first.
  - An old save that owned the park: $1,500,000 back (Clean, `propRefund`) once, a message, its record dropped, an
    Invitational won there counted at Southshore, its garaged cars given bays at the owner's other places (`house()`).
- The oval's top purse came down from $18,000 to $15,000 (M13's cap on official purses, ECONOMY.md).

## 9. The Southshore Fairground (owner, 2026-11-18)
The owner: pick the site and build it now, with room for about six rides; the Ferris wheel, the roller coaster and a
go-kart track you drive yourself (not the villa's kart simulator), three more rides of Claude's choosing, and three or
four games. Use reclaimed land only if nothing better exists.
- **Site assessment.** A scan of the whole island for a 320 × 260 m footprint of dry, gentle ground clear of every
  site, pad, building, road and the city, within 120 m of a road, found four kinds of place: the Sound Flats (flattest,
  1–2 m of relief, but reclaimed: kept for later, §8), the plain between the airport's east fence and Longshore Drive
  (5 m of relief, a short walk from the long beach), north of Lake Valen (6.6 m, on the Mount Valen road) and the
  western highlands (forest, remote). The plain by the airport won: open, near the beach and the Southshore Highway,
  reached off Longshore Drive. One pad at y 4.6 (x 1,490–1,862, z 1,750–2,180), cut and fill under 4 m, added after the
  airport's and the proving ground's pads so their easing-out never tilts its edges.
- **Layout** (`129c`, `FAIR`): Fairground Way off Longshore Drive to a drop-off circle at the entrance arch, the car park
  beside it and the Fair Office facing it; the midway west from the arch with food stands, lamps and bunting; north of
  it the roller coaster and the Ferris wheel; south of it the pirate ship, the carousel and the drop tower, the four
  game booths, the kart track in the south-west corner. A perimeter fence, open only at the arch. Three level, empty ride
  slots (`FAIR.spare`, 16,500 / 12,900 / 10,600 m²) are kept for the next rides.
- **Rides** (the clocks: `FairClock`, pure functions of the game's time, shared by the scenery `179` and the rides you
  board `509d`, so they always agree). Each loads (boarding open) and then runs:
  - the Ferris wheel (40 m across, 16 gondolas, a turn a minute: board the bottom gondola any time, off after one turn);
  - the Riptide roller coaster: an 800 m lap, a 32 m chain lift, a drop, a vertical loop (a true circle, its track's up
    pointing at its centre: upside down over the top at 14 m/s), airtime hills and a helix, the brakes into the
    station; simulated once (chain, gravity less rolling friction, brakes), about two minutes, 24 m/s at most; the
    track banks into the turns by the speed (tan β = v²κ/g), level everywhere else;
  - the Jolly Roger (a pirate ship swinging past the horizontal), the carousel (twelve horses rising and falling),
    Freefall (a 44 m lift and a free fall onto magnetic brakes).
  - Aboard, the player is in the `ride` state: seated where the scenery draws the seat (`fairSeat`), an onboard
    camera from that seat you can look round in (it rolls with the coaster), out of reach of harm; off at the ride's
    gate when it stops. A save made aboard puts you at the gate.
- **Go-karts**: rent at the booth ($25, five minutes); a real kart (`VEHICLES.kart`, 232: 175 kg, about 68 km/h) on the
  fair's 680 m track inside its tyre walls, with three AI karts lapping it; laps timed through every sector, the best
  kept. Out of the kart (or out of time), you hand it back at the booth. Rentals are legitimate (no theft, no heat).
- **Games** ($5 a go, `fairGame`): a shooting gallery, a high striker, a ring toss and whack-a-mole, each a short
  full-screen booth game (the world waits); a good score wins a plush prize (small, big, giant), counted in the save.
  Prizes are never money (the fair is not an income).
- **Money**: tickets and games are `fairTicket` / `fairGame`, paid from cash first, then the bank (`either`).
- Tests: `tests/fair.mjs` (20 checks: the site, the coaster, every ride end to end, the karts, the games, save/reload).

