/* =====================================================================
   [CONTENT] THE TEN ONE-OFFS (Session 6D): permanent unique hidden cars.
   Each is a model of its own (a VEHICLES type nobody sells, parks, drives
   in traffic or stakes), with its own body, stance, wheels, paint finish
   and handling, and one permanent id (UNIQUE_CARS[i].id; the type maps to
   it one to one). There is exactly one of each, ever: the UniqueCars
   registry (506) keeps where each stands in its discovery (undiscovered,
   clue known, exact location known, acquired) and, once acquired, the car
   is an ordinary fleet entry of yours that can't be sold, chopped or put
   up in a pink slip.
   How each is found (the `how` field; the registry runs the stages):
   - find:   it stands somewhere in the world. A clue gives a search area
             on the map; close enough, its exact place is known; you take
             it by getting in (it needs a free parking space of yours).
   - reward: it is given to you (into a free space, or it waits with
             whoever gave it) when the condition is met.
   - pink:   Vance puts it up in a street pink slip once he is ready to.
   Values (speeds, prices, gates) are provisional until the balance pass.
   ===================================================================== */
// a body outline from an existing one: stretched along the car (sz), taller or lower (sy) and raised (dy, ride height)
const deriveProfile = (base, { sz = 1, sy = 1, dy = 0 } = {}) => {
  const f = pts => pts.map(([z, y]) => [z * sz, y * sy + dy]);
  return { body: f(PROFILES[base].body), cabin: f(PROFILES[base].cabin) };
};
Object.assign(PROFILES, {
  // a pre-war tourer: a tall, upright cabin set well back behind a long bonnet, high off the road
  vintage: { body: [[-2.2, 0.44], [2.2, 0.44], [2.2, 0.96], [2.06, 1.03], [0.5, 1.07], [-1.9, 1.07], [-2.2, 0.99]], cabin: [[0.5, 1.05], [0.32, 1.74], [-1.38, 1.74], [-1.62, 1.07]] },
  // a hypercar: lower and longer than anything else on the island, the cabin a bubble far forward
  hyper: { body: [[-2.35, 0.2], [2.35, 0.2], [2.35, 0.36], [2.0, 0.45], [1.25, 0.55], [-1.3, 0.78], [-2.35, 0.74], [-2.35, 0.56]], cabin: [[1.25, 0.53], [0.4, 1.02], [-0.38, 1.02], [-1.25, 0.76]] },
  u_coupe: deriveProfile('coupe', { sz: 1.04, dy: -0.02 }),
  u_limo: deriveProfile('luxury', { sz: 1.06, sy: 1.02 }),
  u_proto: deriveProfile('super', { dy: -0.02, sy: 0.96 }),
  u_baja: deriveProfile('offroad', { dy: 0.14 }),
  u_widow: deriveProfile('muscle', { dy: -0.04 }),
  u_club: deriveProfile('roadster', { dy: -0.03, sy: 0.97 }),
  u_gt: deriveProfile('gtcoupe', { sz: 1.03 })
});
// the ten. finish: paint flake, gloss, wear and rim style for the 'unique' tier look; paint2 the stripe colour.
// spot (find): where it stands, by name of a builder in UniqueCars.spotOf; area: the search area's radius (m);
// gate: what has to be true first (the registry reads it); keeper: who holds it for you without a free space
const UNIQUE_CARS = [
  { id: 'corsair', n: 1, type: 'u_corsair', kind: 'Classic', how: 'find', spot: 'corsair', area: 95, reveal: 45, origin: 'found', msrp: 42000, cargo: 220, keeper: 'the depot night man',
    spec: { rev: 0.37, name: 'Golden Corsair', l: 5.0, w: 1.95, h: 1.32, mass: 1620, power: 16400, drift: 0.36, vmax: 67, steer: 0.5, grip: 0.98, brake: 12.5, soft: 1.2, wheelR: 0.36, camDist: 6.9, camH: 1.7, eng: 0.6, profile: 'classic', chromeBumpers: true, dualExhaust: true, stripes: true,
      colors: [0xc9a227], paint2: 0x1a1408, finish: { flake: 1, gloss: 1, wear: 0, rim: 3 }, blurb: 'A 1968 Corsair finished in gold leaf, black pinstripes and every chrome part re-plated. The only one.' },
    clue: 'Fifteen packages: someone has noticed. A phone tip points to the Docklands, the alleys behind the depot on Harbor Row.', hint: 'Behind the depot, Harbor Row (Docklands)' },
  { id: 'spectre', n: 2, type: 'u_spectre', kind: 'Coupe', how: 'reward', origin: 'reward', msrp: 58000, cargo: 110, keeper: '"Sprocket" Tull',
    spec: { rev: 0.36, name: 'Calloway Spectre', l: 4.68, w: 1.98, h: 1.22, mass: 1340, power: 18200, drift: 0.16, vmax: 80, steer: 0.54, grip: 1.36, brake: 17.5, soft: 0.62, wheelR: 0.36, camDist: 6.4, camH: 1.55, eng: 1.55, profile: 'u_coupe', dualExhaust: true, wing: 'lip', sideIntakes: true,
      colors: [0x1d3d6b], finish: { flake: 0.9, gloss: 1, wear: 0, rim: 2 }, blurb: 'A coachbuilt fastback coupe on a racing chassis: longer, lower and sharper than the Aurel it started as.' },
    clue: 'Tull keeps a covered car in his back room for whoever wins every street race in the city.', hint: 'Win all five city street races (Tull)' },
  { id: 'ambassador', n: 3, type: 'u_ambassador', kind: 'Luxury', how: 'find', spot: 'ambassador', area: 120, reveal: 40, origin: 'stolen', msrp: 78000, cargo: 320, armorK: 1.6, keeper: 'Lucky',
    spec: { rev: 0.4, name: 'Sovereign Ambassador', l: 5.72, w: 1.98, h: 1.5, mass: 2450, power: 14200, drift: 0.04, vmax: 60, steer: 0.46, grip: 1.05, brake: 13, soft: 1.45, wheelR: 0.37, camDist: 7.6, camH: 2.0, eng: 0.75, profile: 'u_limo', chromeBumpers: true, dualExhaust: true, lightbar: true,
      colors: [0x0b0c10], finish: { flake: 0.6, gloss: 1, wear: 0, rim: 3 }, blurb: 'A consul’s stretched, armoured Sovereign: two and a half tonnes of glass that stops bullets. Stolen, it stays HOT until it is cleaned.' },
    clue: 'Lucky’s tip: a foreign consul’s armoured Sovereign sleeps on a driveway in Crestmoor Heights. Nobody guards it at night.', hint: 'A driveway in Crestmoor Heights', lead: 'Lucky (Old Quarter pawn shop) has something to sell about a diplomat’s car.' },
  { id: 'proto', n: 4, type: 'u_proto', kind: 'Supercar', how: 'find', spot: 'proto', area: 120, reveal: 40, origin: 'found', msrp: 160000, cargo: 40, keeper: 'Valen Prestige Motors',
    spec: { rev: 0.35, name: 'Zephyr Prototype', l: 4.5, w: 2.04, h: 1.1, mass: 1290, power: 21000, drift: 0.1, vmax: 89, steer: 0.52, grip: 1.44, brake: 19, soft: 0.55, wheelR: 0.36, camDist: 6.4, camH: 1.5, eng: 1.8, profile: 'u_proto', wing: 'swan', louvers: true, dualExhaust: true,
      colors: [0x3b3f45], finish: { flake: 0, gloss: 0.22, wear: 0, rim: 2 }, blurb: 'The test mule for a Zephyr that was never built: matte, unbadged, faster than anything in the showroom.' },
    clue: 'Valen Prestige Motors: the factory wrote its Zephyr test mule off and never crushed it. It was last stored in a bonded yard in the Warehouse District, papers in the glovebox.', hint: 'A bonded yard in the Warehouse District' },
  { id: 'baja', n: 5, type: 'u_baja', kind: 'Off-road', how: 'find', spot: 'baja', area: 150, reveal: 55, origin: 'found', msrp: 36000, cargo: 400, armorK: 1.3, trail: 1, keeper: 'the farm',
    spec: { rev: 0.46, name: 'Baja One', l: 4.9, w: 2.12, h: 2.1, mass: 2050, power: 14800, drift: 0.22, vmax: 55, steer: 0.53, grip: 1.02, brake: 12, soft: 2.1, wheelR: 0.53, camDist: 7.7, camH: 2.5, eng: 0.75, profile: 'u_baja', offroad: true, roofRails: true, lightbar: true,
      colors: [0xd07a2a], finish: { flake: 0.2, gloss: 0.5, wear: 0.15, rim: 1 }, blurb: 'A 1989 desert-rally Mesa on long-travel suspension. It went into a gully on the farm and nobody pulled it out.' },
    clue: 'A farmhand: a rally car went off the farm track in ’89, out in the far fields of Cedar Fields South, and nobody ever pulled it out.', hint: 'The far fields, Cedar Fields South' },
  { id: 'widow', n: 6, type: 'u_widow', kind: 'Muscle', how: 'pink', origin: 'pinkslip', msrp: 48000, cargo: 190, keeper: 'Vance', stake: 24000, wins: 3,
    spec: { rev: 0.36, name: 'Widowmaker', l: 4.8, w: 1.94, h: 1.26, mass: 1580, power: 17200, drift: 0.48, vmax: 70, steer: 0.5, grip: 0.96, brake: 13.5, soft: 0.95, wheelR: 0.36, camDist: 6.6, camH: 1.65, eng: 0.65, profile: 'u_widow', scoop: true, stripes: true, dualExhaust: true,
      colors: [0x121214], paint2: 0xb8142a, finish: { flake: 0.1, gloss: 0.32, wear: 0, rim: 2 }, blurb: 'Vance’s own Brakken: lowered, supercharged, satin black with a red stripe. Faster sideways than straight.' },
    clue: 'Vance: beat him in three pink slips and he puts up his own car, the Widowmaker, against something worth at least $24,000.', hint: 'Win three pink slips, then race Vance for it' },
  { id: 'club', n: 7, type: 'u_club', kind: 'Track', how: 'reward', origin: 'prize', msrp: 70000, cargo: 30, armorK: 0.8, keeper: 'Race Control',
    spec: { rev: 0.33, name: 'Tempest Clubsport', l: 3.96, w: 1.84, h: 1.08, mass: 880, power: 12800, drift: 0.08, vmax: 74, steer: 0.68, grip: 1.6, brake: 21, soft: 0.42, wheelR: 0.31, camDist: 5.9, camH: 1.42, eng: 1.75, profile: 'u_club', wing: 'swan', sideIntakes: true,
      colors: [0xf2f2f0], finish: { flake: 0.3, gloss: 0.8, wear: 0, rim: 2 }, blurb: 'Valen Point’s own club racer: stripped, caged, on slicks. It corners like nothing else and hates kerbs.' },
    clue: 'Race Control at Valen Point: win the GT Cup and the club hands over its old Clubsport.', hint: 'Win the GT Cup at Valen Point' },
  { id: 'riviera', n: 8, type: 'u_riviera', kind: 'GT', how: 'find', spot: 'riviera', area: 120, reveal: 40, origin: 'found', msrp: 110000, cargo: 140, keeper: 'the estate’s executor', rep: 1300,
    spec: { rev: 0.38, name: 'Monarch Riviera', l: 5.25, w: 2.0, h: 1.32, mass: 1880, power: 18600, drift: 0.09, vmax: 82, steer: 0.5, grip: 1.24, brake: 16.5, soft: 0.95, wheelR: 0.38, camDist: 7.0, camH: 1.7, eng: 0.72, profile: 'u_gt', chromeBumpers: true, dualExhaust: true, lightbar: true,
      colors: [0x5a1a24], finish: { flake: 0.95, gloss: 1, wear: 0, rim: 3 }, blurb: 'The long-tail Monarch a collector had built for the coast road: a V12 that cruises at two hundred and never tires.' },
    clue: 'The Valen Courier: the late collector Halloran’s estate is being cleared, and his long-tail Monarch was never found. It sat under a cover in a Linden Hills carport.', hint: 'A carport in Linden Hills', lead: 'Explore every district and make a name for yourself (Rep 1,300).' },
  { id: 'tourer', n: 9, type: 'u_tourer', kind: 'Vintage', how: 'find', spot: 'tourer', area: 90, reveal: 40, origin: 'found', msrp: 90000, cargo: 260, keeper: 'the Ferryman',
    spec: { rev: 0.5, name: 'Regent Tourer 1931', l: 4.4, w: 1.72, h: 1.75, mass: 1500, power: 5600, drift: 0.12, vmax: 41, steer: 0.5, grip: 0.82, brake: 8, soft: 1.7, wheelR: 0.42, camDist: 6.8, camH: 2.1, eng: 0.55, profile: 'vintage', chromeBumpers: true, fenders: true, spare: true,
      colors: [0x1f3a2a], finish: { flake: 0.15, gloss: 0.85, wear: 0, rim: 0 }, blurb: 'A 1931 Regent tourer, bottle green, still on its original wheels. Slow, soft, and worth more than a supercar.' },
    clue: 'The Ferryman: the last thing the ghost ferry ever carried was a 1931 Regent tourer, and it was never unloaded. Try the old slip on the west shore, by the Old Quarter seawall.', hint: 'The old ferry slip, west shore (Old Quarter)', lead: 'Something about the ghost ferry, if you ever see it.' },
  { id: 'aeterna', n: 10, type: 'u_aeterna', kind: 'Ultimate', how: 'find', spot: 'aeterna', area: 80, reveal: 40, origin: 'found', msrp: 250000, cargo: 40, armorK: 1.1, keeper: 'the Valen Tower night porter',
    spec: { rev: 0.33, name: 'Aeterna V16', l: 4.7, w: 2.1, h: 1.02, mass: 1420, power: 25500, drift: 0.11, vmax: 95, steer: 0.52, grip: 1.48, brake: 20, soft: 0.5, wheelR: 0.37, camDist: 6.6, camH: 1.45, eng: 1.6, profile: 'hyper', wing: 'lip', sideIntakes: true, louvers: true, lightbar: true, dualExhaust: true,
      colors: [0xe8e4dc], finish: { flake: 1, gloss: 1, wear: 0, rim: 3 }, blurb: 'Sixteen cylinders, one owner, built for the man who built Valen Tower. The last word in Port Valen.' },
    clue: 'An unknown number: “Nine. The tenth was built for the man who built Valen Tower. The night porter brings it up to the street for whoever owns the other nine.”', hint: 'At the foot of Valen Tower', lead: 'Find the other nine.' }
];
const UNIQUE_BY = {}, UNIQUE_OF_TYPE = {};
for (const u of UNIQUE_CARS) {
  UNIQUE_BY[u.id] = u; UNIQUE_OF_TYPE[u.type] = u;
  // a model nobody sells: never in traffic, on a lot, on a parked stall or staked by a rival (unique), and
  // valued like the one-off it is
  VEHICLES[u.type] = { ...u.spec, price: 0, unlockOnly: true, special: true, unique: u.id, tier: 'unique' };
  if (u.armorK) VEHICLES[u.type].armorK = u.armorK;
  if (u.trail) TRAIL[u.type] = u.trail;
}
TIER_LOOK.unique = { flake: 1.0, gloss: 1.0, wear: 0, rim: 3, label: 'ONE-OFF', col: '#ffd84d', value: 1 };
const isUniqueType = type => !!(VEHICLES[type] && VEHICLES[type].unique);
