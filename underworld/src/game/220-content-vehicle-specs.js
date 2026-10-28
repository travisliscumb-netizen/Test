/* =====================================================================
   [CONTENT] VEHICLE SPECS
   ===================================================================== */
const VEHICLES = {
  compact: { rev: 0.46, name: 'Pico', l: 3.7, w: 1.68, h: 1.45, mass: 950, power: 4300, drift: 0.05, vmax: 45, steer: 0.62, grip: 1.05, brake: 13, soft: 1.1, wheelR: 0.3, camDist: 5.8, camH: 1.7, eng: 1.3, price: 0, profile: 'hatch',
    colors: [0xc0392b, 0x2e86c1, 0xf4d03f, 0x27ae60, 0xecf0f1, 0x8e44ad, 0xe67e22, 0x5d6d7e], blurb: 'Light and nimble. Parks anywhere.' },
  sedan: { rev: 0.42, name: 'Meridian', l: 4.6, w: 1.8, h: 1.44, mass: 1400, power: 7000, drift: 0.06, vmax: 53, steer: 0.55, grip: 1.0, brake: 12, soft: 1.15, wheelR: 0.33, camDist: 6.5, camH: 1.8, eng: 1.0, price: 2500, profile: 'sedan',
    colors: [0x1c2833, 0x7b241c, 0xd5d8dc, 0x2c3e50, 0x566573, 0x154360, 0x784212, 0xf0f3f4], blurb: 'Comfortable, predictable, everywhere.' },
  sports: { rev: 0.36, name: 'Vireo GT', l: 4.4, w: 1.9, h: 1.2, mass: 1300, power: 12500, drift: 0.14, vmax: 72, steer: 0.52, grip: 1.28, brake: 16, soft: 0.7, wheelR: 0.34, camDist: 6.3, camH: 1.55, eng: 1.5, price: 18000, profile: 'sports',
    colors: [0xd35400, 0xc0392b, 0xf1c40f, 0x17202a, 0xecf0f1, 0x1abc9c, 0x2471a3], blurb: 'Precise, fast and very loud.' },
  suv: { rev: 0.42, name: 'Bastion', l: 4.8, w: 1.95, h: 1.8, mass: 2100, power: 10000, drift: 0.05, vmax: 50, steer: 0.5, grip: 0.95, brake: 11, soft: 1.45, wheelR: 0.4, camDist: 7.2, camH: 2.1, eng: 0.85, price: 7500, profile: 'suv',
    colors: [0x17202a, 0x626567, 0x1b4f72, 0x641e16, 0xd0d3d4, 0x145a32], blurb: 'Heavy, tall and hard to stop.' },
  van: { rev: 0.45, name: 'Haulmark', l: 5.2, w: 2.0, h: 2.25, mass: 2400, power: 8600, drift: 0.04, vmax: 40, steer: 0.48, grip: 0.85, brake: 10, soft: 1.6, wheelR: 0.37, camDist: 8, camH: 2.4, eng: 0.75, price: 4000, profile: 'van',
    colors: [0xf8f9f9, 0xd5d8dc, 0x2874a6, 0xb03a2e, 0x1e8449], blurb: 'Hauls anything. Corners like a fridge.' },
  pickup: { rev: 0.42, name: 'Ridgeback', l: 5.3, w: 1.95, h: 1.85, mass: 2200, power: 10500, drift: 0.12, vmax: 49, steer: 0.5, grip: 0.95, brake: 11, soft: 1.4, wheelR: 0.41, camDist: 7.4, camH: 2.1, eng: 0.8, price: 6000, profile: 'pickup',
    colors: [0x7b241c, 0x1c2833, 0xd4ac0d, 0x5d6d7e, 0x196f3d, 0xf0f3f4], blurb: 'Torque for days.' },
  taxi: { rev: 0.42, name: 'Cabline', l: 4.6, w: 1.8, h: 1.44, mass: 1450, power: 7200, drift: 0.06, vmax: 52, steer: 0.55, grip: 1.0, brake: 12, soft: 1.15, wheelR: 0.33, camDist: 6.5, camH: 1.8, eng: 1.0, price: 3500, profile: 'sedan', taxi: true,
    colors: [0xf4c20d], blurb: 'Yellow, ubiquitous, gets right of way.' },
  police: { rev: 0.4, name: 'Interceptor', l: 4.7, w: 1.85, h: 1.46, mass: 1550, power: 11500, drift: 0.1, vmax: 62, steer: 0.56, grip: 1.15, brake: 14, soft: 1.0, wheelR: 0.34, camDist: 6.6, camH: 1.8, eng: 1.1, price: 40000, profile: 'sedan', police: true,
    colors: [0x111a2e], blurb: 'Retired pursuit unit. Siren included.' },
  muscle: { rev: 0.36, name: 'Brakken', l: 4.8, w: 1.9, h: 1.3, mass: 1600, power: 14500, drift: 0.42, vmax: 66, steer: 0.5, grip: 0.92, brake: 13, soft: 1.0, wheelR: 0.35, camDist: 6.6, camH: 1.7, eng: 0.7, price: 24000, profile: 'muscle', unlockOnly: true,
    colors: [0x922b21, 0x1a5276, 0x17202a, 0xd68910, 0xf4f6f6], blurb: 'Big block V8. Loves to go sideways.' },
  supercar: { rev: 0.35, name: 'Zephyr', l: 4.5, w: 2.0, h: 1.14, mass: 1350, power: 19000, drift: 0.12, vmax: 84, steer: 0.5, grip: 1.38, brake: 18, soft: 0.6, wheelR: 0.35, camDist: 6.4, camH: 1.5, eng: 1.7, price: 65000, profile: 'super', unlockOnly: true,
    colors: [0xe8e8e8, 0xf39c12, 0x27ae60, 0x8e44ad, 0x17202a], blurb: 'The fastest thing on the island.' }
,
  classic: { rev: 0.37, name: 'Corsair 68', l: 5.0, w: 1.95, h: 1.32, mass: 1650, power: 15200, drift: 0.38, vmax: 64, steer: 0.5, grip: 0.95, brake: 12, soft: 1.25, wheelR: 0.36, camDist: 6.9, camH: 1.7, eng: 0.62, price: 30000, profile: 'classic', unlockOnly: true, special: true, chromeBumpers: true, dualExhaust: true, stripes: true,
    colors: [0x1f3b2c, 0x7b1d1d, 0x1c2a4a, 0xd8c8a0], blurb: 'A restored 1968 legend. Chrome, stripes and a temper.' },
  coupe: { rev: 0.36, name: 'Aurel RS', l: 4.5, w: 1.96, h: 1.24, mass: 1380, power: 17500, drift: 0.12, vmax: 79, steer: 0.52, grip: 1.33, brake: 17, soft: 0.65, wheelR: 0.35, camDist: 6.4, camH: 1.55, eng: 1.6, price: 46000, profile: 'coupe', unlockOnly: true, special: true, dualExhaust: true,
    colors: [0xe6e6e8, 0x1b2430, 0xc8501e, 0x2a5f9e], blurb: 'Fastback grand tourer. Planted until you ask it not to be.' },
  offroad: { rev: 0.46, name: 'Mesa Trail', l: 4.9, w: 2.05, h: 2.0, mass: 2300, power: 13500, drift: 0.15, vmax: 52, steer: 0.5, grip: 1.0, brake: 11, soft: 1.85, wheelR: 0.5, camDist: 7.6, camH: 2.4, eng: 0.7, price: 22000, profile: 'offroad', unlockOnly: true, special: true, offroad: true,
    colors: [0x5a5f3a, 0xc8b48a, 0x2b2f33, 0xa0381e], blurb: 'Lifted, armoured and allergic to kerbs. Shrugs off jumps.' },
  unmarked: { rev: 0.4, name: 'Ghost Interceptor', l: 4.7, w: 1.85, h: 1.46, mass: 1560, power: 13200, drift: 0.1, vmax: 64, steer: 0.56, grip: 1.18, brake: 14.5, soft: 0.95, wheelR: 0.34, camDist: 6.6, camH: 1.8, eng: 1.05, price: 0, profile: 'sedan', unlockOnly: true, special: true, unmarked: true, dualExhaust: true,
    colors: [0x2a2d31], blurb: 'Retired undercover unit. Patrols tend to look the other way.' },
  truck: { rev: 0.5, name: 'Boxline', l: 7.2, w: 2.3, h: 3.2, mass: 5200, power: 22000, drift: 0.05, vmax: 34, steer: 0.42, grip: 0.8, brake: 8, soft: 1.5, wheelR: 0.48, camDist: 11, camH: 3.6, eng: 0.5, price: 9000, profile: 'truck',
    colors: [0xf2f2f0, 0x2e6fb5, 0xd8a227, 0xb03a2e], blurb: 'Box truck. Brakes are a suggestion.' },
  luxury: { rev: 0.4, name: 'Sovereign LX', l: 5.4, w: 1.92, h: 1.48, mass: 2050, power: 12500, drift: 0.06, vmax: 63, steer: 0.5, grip: 1.08, brake: 14, soft: 1.3, wheelR: 0.36, camDist: 7.2, camH: 1.9, eng: 0.8, price: 52000, profile: 'luxury', chromeBumpers: true, dualExhaust: true,
    colors: [0x0e0f12, 0xe8e6e0, 0x3a3f46, 0x4a1c22, 0x1c2a3a], blurb: 'Long wheelbase, armoured glass, deep leather. It says you have arrived.' },
  gangcar: { rev: 0.38, name: 'Cortez Lowline', l: 5.2, w: 1.95, h: 1.25, mass: 1700, power: 11000, drift: 0.3, vmax: 56, steer: 0.5, grip: 0.95, brake: 12, soft: 1.5, wheelR: 0.33, camDist: 6.9, camH: 1.7, eng: 0.66, price: 14000, profile: 'lowrider', chromeBumpers: true, dualExhaust: true, stripes: true,
    colors: [0x2a7a3a, 0x2e8c8a, 0x7a2b6e, 0xc9a227, 0x1b1b1e], blurb: 'Chrome, candy paint and a bad attitude. Every crew in town drives one.' },
  utility: { rev: 0.45, name: 'Workhorse', l: 5.3, w: 1.98, h: 1.9, mass: 2300, power: 10000, drift: 0.08, vmax: 46, steer: 0.5, grip: 0.95, brake: 11, soft: 1.4, wheelR: 0.41, camDist: 7.4, camH: 2.2, eng: 0.78, price: 7000, profile: 'pickup', utility: true,
    colors: [0xf2f2f0, 0xe0a020, 0x2e6fb5], blurb: 'City-works pickup with a light bar and a ladder rack. Nobody looks twice.' },
  // ---- v6 roster: thirteen more civilian models, each with its own silhouette (profile) and details
  metro: { rev: 0.47, name: 'Rook Metro', l: 3.2, w: 1.6, h: 1.55, mass: 820, power: 3600, drift: 0.05, vmax: 40, steer: 0.66, grip: 1.05, brake: 13, soft: 1.1, wheelR: 0.28, camDist: 5.4, camH: 1.7, eng: 1.4, price: 1500, profile: 'micro',
    colors: [0x9fd8cb, 0xf3c6a5, 0xe8e4d8, 0x6c8ebf, 0xd94f4f, 0x3a3f46], blurb: 'A city box on four wheels. Turns inside its own length.' },
  regent: { rev: 0.42, name: 'Calder Regent', l: 4.7, w: 1.78, h: 1.42, mass: 1450, power: 6200, drift: 0.08, vmax: 48, steer: 0.53, grip: 0.95, brake: 11, soft: 1.3, wheelR: 0.32, camDist: 6.5, camH: 1.8, eng: 0.95, price: 2600, profile: 'boxsedan', chromeBumpers: true,
    colors: [0x6e5a3a, 0x8a8f96, 0x2f4a3a, 0x7a2e2e, 0xd8d0bc, 0x2a3346], blurb: 'Square, soft and unkillable. Every uncle had one.' },
  crest: { rev: 0.43, name: 'Bellmore Crest', l: 4.45, w: 1.84, h: 1.62, mass: 1600, power: 8000, drift: 0.06, vmax: 50, steer: 0.54, grip: 1.0, brake: 12, soft: 1.3, wheelR: 0.37, camDist: 6.8, camH: 2.0, eng: 0.95, price: 5200, profile: 'crossover', roofRails: true,
    colors: [0xd5d8dc, 0x2c3e50, 0x8b1e2d, 0x5d6d7e, 0x1e5a4a, 0xece8dc], blurb: 'A crossover for the school run and the getaway alike.' },
  estate: { rev: 0.42, name: 'Marrow Estate', l: 4.85, w: 1.8, h: 1.5, mass: 1550, power: 7000, drift: 0.06, vmax: 51, steer: 0.54, grip: 1.0, brake: 12, soft: 1.2, wheelR: 0.33, camDist: 6.7, camH: 1.85, eng: 0.95, price: 4600, profile: 'wagon', roofRails: true,
    colors: [0x3a4a5c, 0x7d6b4f, 0xbfc5c9, 0x4f2a2a, 0x2e4d3a], blurb: 'A long roof and a longer boot. Fits a sofa, or two people who owe you.' },
  courier: { rev: 0.45, name: 'Vanta Courier', l: 4.4, w: 1.82, h: 1.95, mass: 1500, power: 6800, drift: 0.05, vmax: 44, steer: 0.55, grip: 0.95, brake: 11, soft: 1.4, wheelR: 0.33, camDist: 7.2, camH: 2.2, eng: 0.85, price: 3800, profile: 'minivan',
    colors: [0xf2f2f0, 0xe0e4e8, 0x2a6ac8, 0xd8a227, 0x3a3f46], blurb: 'A compact panel van. Parcel routes, plumbers, people who don’t want windows.' },
  apex: { rev: 0.38, name: 'Apex R', l: 4.05, w: 1.82, h: 1.42, mass: 1200, power: 10500, drift: 0.1, vmax: 62, steer: 0.6, grip: 1.25, brake: 16, soft: 0.75, wheelR: 0.33, camDist: 6.0, camH: 1.7, eng: 1.45, price: 15500, profile: 'hothatch', wing: 'roof', dualExhaust: true,
    colors: [0xd0312d, 0xf2f2f0, 0x1a5fb4, 0x1b1b1e, 0xf4c20d], blurb: 'A hot hatch with a roof wing. Small, angry, quicker than it has any right to be.' },
  hellion: { rev: 0.36, name: 'Hellion XR', l: 4.9, w: 1.95, h: 1.32, mass: 1750, power: 16500, drift: 0.34, vmax: 70, steer: 0.5, grip: 1.05, brake: 15, soft: 0.9, wheelR: 0.37, camDist: 6.7, camH: 1.7, eng: 0.68, price: 34000, profile: 'musclemod', scoop: true, wing: 'lip', dualExhaust: true,
    colors: [0x1b1b1e, 0xb8142a, 0x3a3f46, 0xf2a900, 0x1e3a8a], blurb: 'Modern muscle: supercharged, slab-sided and permanently in a bad mood.' },
  revenant: { rev: 0.37, name: 'Revenant 72', l: 5.05, w: 1.92, h: 1.3, mass: 1680, power: 15800, drift: 0.4, vmax: 66, steer: 0.49, grip: 0.93, brake: 12, soft: 1.2, wheelR: 0.35, camDist: 6.9, camH: 1.7, eng: 0.6, price: 38000, profile: 'fastback', special: true, chromeBumpers: true, dualExhaust: true, stripes: true,
    colors: [0xd2691e, 0x2f5233, 0x1c2a4a, 0xf2e6c8, 0x5a1a1a], blurb: 'A 1972 fastback with a ducktail and a carburettor that hates mornings.' },
  tempest: { rev: 0.34, name: 'Tempest R', l: 3.95, w: 1.78, h: 1.12, mass: 980, power: 11500, drift: 0.1, vmax: 68, steer: 0.64, grip: 1.45, brake: 18, soft: 0.55, wheelR: 0.31, camDist: 5.9, camH: 1.45, eng: 1.65, price: 28000, profile: 'roadster', wing: 'lip',
    colors: [0x2a7a3a, 0xf2f2f0, 0xd35400, 0x1a5fb4, 0xc0c4c8], blurb: 'Light, low and handling-obsessed. It corners like it read the road first.' },
  kodiak: { rev: 0.4, name: 'Kodiak XR', l: 5.0, w: 2.0, h: 1.72, mass: 2250, power: 15500, drift: 0.07, vmax: 62, steer: 0.5, grip: 1.12, brake: 15, soft: 1.15, wheelR: 0.42, camDist: 7.3, camH: 2.15, eng: 0.8, price: 64000, profile: 'lsuv', roofRails: true, lightbar: true, dualExhaust: true,
    colors: [0x0e0f12, 0xe8e6e0, 0x2a3346, 0x5a5f63, 0x3c2a1e], blurb: 'A performance SUV: two and a quarter tonnes that still out-accelerate taxis.' },
  monarch: { rev: 0.38, name: 'Monarch V12', l: 5.1, w: 1.98, h: 1.34, mass: 1950, power: 17000, drift: 0.1, vmax: 76, steer: 0.5, grip: 1.2, brake: 16, soft: 1.0, wheelR: 0.37, camDist: 6.9, camH: 1.7, eng: 0.75, price: 88000, profile: 'gtcoupe', chromeBumpers: true, dualExhaust: true,
    colors: [0x1c2a4a, 0x0e0f12, 0x6a1e2a, 0xd8d4c8, 0x2e3a2e], blurb: 'A twelve-cylinder grand tourer with a bonnet you can land a plane on.' },
  valkyr: { rev: 0.34, name: 'Valkyr V9', l: 4.55, w: 2.02, h: 1.15, mass: 1400, power: 20500, drift: 0.13, vmax: 86, steer: 0.53, grip: 1.42, brake: 19, soft: 0.55, wheelR: 0.36, camDist: 6.4, camH: 1.5, eng: 1.75, price: 120000, profile: 'mid', special: true, wing: 'swan', sideIntakes: true, dualExhaust: true,
    colors: [0xf2c230, 0x1aa34a, 0xe8e8e8, 0xd0312d, 0x6a2c91], blurb: 'Mid-engined, cab-forward and aggressive. The wing is not for decoration.' },
  obsidian: { rev: 0.34, name: 'Obsidian X', l: 4.85, w: 2.06, h: 1.18, mass: 1700, power: 21500, drift: 0.11, vmax: 88, steer: 0.49, grip: 1.36, brake: 18, soft: 0.7, wheelR: 0.37, camDist: 6.7, camH: 1.5, eng: 1.5, price: 150000, profile: 'wedge', special: true, sideIntakes: true, lightbar: true, louvers: true, dualExhaust: true,
    colors: [0x0b0b0d, 0x2a2d31, 0x3a0d14, 0x141c2c], blurb: 'A sinister luxury supercar. Black on black, and silent until it isn’t.' }
};
// traffic mix: ordinary cars dominate; the first eight entries (no taxis, vans or sports cars) are what parks
// in residential streets
const CIVIL_TYPES = ['compact', 'sedan', 'metro', 'regent', 'estate', 'crest', 'compact', 'sedan', 'sedan', 'suv', 'van', 'pickup', 'taxi', 'sports', 'courier', 'apex'];
// Visual tiers. A tier sets paint finish (flake, gloss, wear), trim (chrome, splitters, grilles),
// rims and lights. Common cars can also turn up as worn-out BEATERs in the poorer districts.
// RARE cars are the collectibles: hard to find, valuable, and they look it.
const VEH_TIER = { compact: 'common', sedan: 'common', taxi: 'common', van: 'common', pickup: 'common', utility: 'common', truck: 'common',
  suv: 'nice', police: 'nice', unmarked: 'nice', gangcar: 'sport', sports: 'sport', muscle: 'sport', luxury: 'luxury',
  coupe: 'rare', classic: 'rare', supercar: 'rare', offroad: 'rare',
  metro: 'common', regent: 'common', estate: 'common', courier: 'common', crest: 'nice', apex: 'sport', hellion: 'sport', tempest: 'sport',
  kodiak: 'luxury', monarch: 'luxury', revenant: 'rare', valkyr: 'rare', obsidian: 'rare' };
for (const k in VEHICLES) VEHICLES[k].tier = VEH_TIER[k] || 'common';
VEHICLES.luxury.armorK = 1.15; VEHICLES.offroad.armorK = 1.2; VEHICLES.truck.armorK = 1.3;
// finish: x metallic flake, y gloss (0 matte .. 1 mirror), z wear (fade, rust, dirt), w rim style
const TIER_LOOK = {
  beater: { flake: 0.0, gloss: 0.15, wear: 1.0, rim: 0, label: 'BEATER', col: '#9a8a70', value: 0.55 },
  common: { flake: 0.25, gloss: 0.45, wear: 0.2, rim: 0, label: 'COMMON', col: '#c8ccd2', value: 1 },
  nice: { flake: 0.5, gloss: 0.62, wear: 0.05, rim: 1, label: 'NICE', col: '#7fb2ff', value: 1 },
  sport: { flake: 0.7, gloss: 0.78, wear: 0, rim: 2, label: 'SPORT', col: '#ff8a3d', value: 1 },
  luxury: { flake: 0.85, gloss: 0.92, wear: 0, rim: 3, label: 'LUXURY', col: '#e8d28a', value: 1 },
  rare: { flake: 1.0, gloss: 1.0, wear: 0, rim: 3, label: 'RARE', col: '#d28cff', value: 1.3 }
};
// collectibles: rare models turn up parked in the wealthy districts (deterministic per stall, so a
// street you know keeps its find until somebody takes it); collectors pay a premium for them
const RARE_TYPES = ['coupe', 'classic', 'supercar', 'offroad', 'revenant', 'valkyr', 'obsidian'];
const RARE_ZONES = { u: 0.035, c: 0.02, p: 0.02, g: 0.008 };
const tierChip = t => { const L = TIER_LOOK[t] || TIER_LOOK.common; return `<span class="chip" style="--c:${L.col}">${L.label}</span>`; };
// a common car parked or driving in a poor district is often an old beater
const BEATER_ZONES = { o: 0.38, s: 0.42, h: 0.35, w: 0.42, r: 0.5, m: 0.12, l: 0.06, a: 0.1, g: 0.08, p: 0.08 };
function beaterRoll(type, x, z, seed) {
  if (VEHICLES[type].tier !== 'common' || type === 'taxi' || type === 'utility' || VEHICLES[type].police) return false;
  const p = BEATER_ZONES[zoneKey(x, z)] || 0; return (seed !== undefined ? seed : Math.random()) < p;
}
const PROFILES = {
  hatch: { body: [[-1.85, 0.3], [1.85, 0.3], [1.85, 0.7], [1.6, 0.82], [0.9, 0.88], [-1.75, 0.9], [-1.85, 0.8]], cabin: [[0.9, 0.86], [0.2, 1.42], [-1.4, 1.42], [-1.78, 0.88]] },
  sedan: { body: [[-2.3, 0.32], [2.3, 0.32], [2.3, 0.68], [2.05, 0.8], [1.05, 0.86], [-1.55, 0.88], [-2.25, 0.86], [-2.3, 0.62]], cabin: [[1.05, 0.84], [0.25, 1.42], [-0.95, 1.42], [-1.6, 0.86]] },
  sports: { body: [[-2.2, 0.26], [2.2, 0.26], [2.2, 0.55], [1.9, 0.66], [0.7, 0.74], [-1.8, 0.78], [-2.2, 0.7]], cabin: [[0.75, 0.72], [-0.05, 1.18], [-0.9, 1.18], [-1.75, 0.76]] },
  suv: { body: [[-2.4, 0.45], [2.4, 0.45], [2.4, 0.95], [2.1, 1.05], [1.3, 1.1], [-2.35, 1.12], [-2.4, 1.0]], cabin: [[1.3, 1.08], [0.75, 1.76], [-2.25, 1.76], [-2.35, 1.1]] },
  van: { body: [[-2.6, 0.4], [2.6, 0.4], [2.6, 0.95], [2.4, 1.12], [1.75, 1.2], [1.2, 2.22], [-2.6, 2.22]], cabin: [[1.79, 1.2], [1.24, 2.1], [1.16, 2.1], [1.71, 1.2]] },
  pickup: { body: [[-2.65, 0.45], [2.65, 0.45], [2.65, 0.98], [2.4, 1.1], [1.45, 1.14], [-2.65, 1.14], [-2.65, 0.95]], cabin: [[1.45, 1.12], [0.9, 1.82], [-0.45, 1.82], [-0.6, 1.14]] },
  muscle: { body: [[-2.4, 0.3], [2.4, 0.3], [2.4, 0.68], [2.2, 0.8], [0.6, 0.86], [-1.7, 0.88], [-2.4, 0.82]], cabin: [[0.6, 0.84], [-0.1, 1.27], [-1.0, 1.27], [-1.75, 0.86]] },
  classic: { body: [[-2.5, 0.32], [2.5, 0.32], [2.5, 0.66], [2.35, 0.78], [0.7, 0.84], [-1.8, 0.86], [-2.5, 0.8]], cabin: [[0.7, 0.82], [0.05, 1.3], [-0.95, 1.3], [-1.75, 0.84]] },
  coupe: { body: [[-2.25, 0.26], [2.25, 0.26], [2.25, 0.52], [2.0, 0.64], [0.9, 0.72], [-1.9, 0.8], [-2.25, 0.72]], cabin: [[0.9, 0.7], [0.15, 1.22], [-0.5, 1.22], [-1.95, 0.8]] },
  offroad: { body: [[-2.45, 0.68], [2.45, 0.68], [2.45, 1.15], [2.2, 1.27], [1.25, 1.3], [-2.45, 1.3], [-2.45, 1.15]], cabin: [[1.25, 1.28], [0.7, 1.95], [-1.9, 1.95], [-2.15, 1.3]] },
  truck: { body: [[-3.6, 0.6], [3.6, 0.6], [3.6, 1.4], [3.3, 1.55], [2.62, 1.6], [2.32, 2.45], [1.6, 2.5], [1.6, 3.2], [-3.6, 3.2]], cabin: [[2.66, 1.62], [2.36, 2.38], [2.28, 2.38], [2.58, 1.62]] },
  luxury: { body: [[-2.7, 0.33], [2.7, 0.33], [2.7, 0.7], [2.42, 0.83], [1.3, 0.9], [-1.95, 0.92], [-2.65, 0.88], [-2.7, 0.64]], cabin: [[1.3, 0.88], [0.45, 1.48], [-1.25, 1.48], [-2.0, 0.9]] },
  lowrider: { body: [[-2.6, 0.24], [2.6, 0.24], [2.6, 0.56], [2.42, 0.68], [0.9, 0.74], [-1.95, 0.76], [-2.6, 0.7]], cabin: [[0.9, 0.72], [0.15, 1.18], [-1.05, 1.18], [-1.9, 0.74]] },
  super: { body: [[-2.25, 0.22], [2.25, 0.22], [2.25, 0.45], [1.9, 0.58], [0.9, 0.66], [-1.6, 0.8], [-2.25, 0.74]], cabin: [[0.95, 0.64], [0.05, 1.1], [-0.7, 1.1], [-1.7, 0.78]] },
  // v6 silhouettes
  micro: { body: [[-1.6, 0.3], [1.6, 0.3], [1.6, 0.72], [1.42, 0.84], [0.95, 0.9], [-1.55, 0.95], [-1.6, 0.85]], cabin: [[0.95, 0.88], [0.45, 1.52], [-1.42, 1.52], [-1.55, 0.93]] },
  boxsedan: { body: [[-2.35, 0.32], [2.35, 0.32], [2.35, 0.74], [2.27, 0.82], [1.0, 0.84], [-1.5, 0.84], [-2.33, 0.82], [-2.35, 0.6]], cabin: [[1.0, 0.82], [0.58, 1.4], [-1.08, 1.4], [-1.5, 0.84]] },
  crossover: { body: [[-2.22, 0.42], [2.22, 0.42], [2.22, 0.86], [2.0, 0.96], [1.15, 1.02], [-2.1, 1.04], [-2.22, 0.92]], cabin: [[1.15, 1.0], [0.5, 1.6], [-1.6, 1.58], [-2.1, 1.04]] },
  wagon: { body: [[-2.42, 0.32], [2.42, 0.32], [2.42, 0.68], [2.15, 0.8], [1.1, 0.86], [-2.38, 0.9], [-2.42, 0.8]], cabin: [[1.1, 0.84], [0.3, 1.44], [-2.25, 1.44], [-2.38, 0.88]] },
  minivan: { body: [[-2.2, 0.38], [2.2, 0.38], [2.2, 0.85], [2.02, 0.98], [1.5, 1.04], [0.95, 1.92], [-2.2, 1.94]], cabin: [[1.54, 1.04], [0.99, 1.84], [0.91, 1.84], [1.46, 1.04]] },
  hothatch: { body: [[-2.02, 0.26], [2.02, 0.26], [2.02, 0.64], [1.8, 0.77], [1.05, 0.84], [-1.92, 0.88], [-2.02, 0.76]], cabin: [[1.05, 0.82], [0.3, 1.36], [-1.55, 1.36], [-1.92, 0.86]] },
  musclemod: { body: [[-2.45, 0.3], [2.45, 0.3], [2.45, 0.72], [2.25, 0.86], [0.75, 0.93], [-1.6, 0.96], [-2.45, 0.92], [-2.45, 0.6]], cabin: [[0.75, 0.91], [0.0, 1.3], [-0.85, 1.3], [-1.65, 0.95]] },
  fastback: { body: [[-2.52, 0.32], [2.52, 0.32], [2.52, 0.7], [2.4, 0.78], [0.95, 0.84], [-2.1, 0.86], [-2.52, 0.94], [-2.52, 0.62]], cabin: [[0.95, 0.82], [0.25, 1.28], [-0.45, 1.28], [-2.12, 0.86]] },
  roadster: { body: [[-1.98, 0.25], [1.98, 0.25], [1.98, 0.5], [1.7, 0.62], [0.4, 0.7], [-1.98, 0.74], [-1.98, 0.6]], cabin: [[0.4, 0.68], [-0.08, 1.08], [-0.72, 1.08], [-1.2, 0.73]] },
  lsuv: { body: [[-2.5, 0.45], [2.5, 0.45], [2.5, 0.98], [2.25, 1.1], [1.25, 1.16], [-2.4, 1.16], [-2.5, 1.04]], cabin: [[1.25, 1.14], [0.55, 1.68], [-1.95, 1.62], [-2.4, 1.14]] },
  gtcoupe: { body: [[-2.55, 0.28], [2.55, 0.28], [2.55, 0.64], [2.3, 0.76], [0.55, 0.86], [-2.0, 0.86], [-2.55, 0.8], [-2.55, 0.58]], cabin: [[0.55, 0.84], [-0.25, 1.32], [-1.1, 1.32], [-2.0, 0.86]] },
  mid: { body: [[-2.27, 0.22], [2.27, 0.22], [2.27, 0.4], [2.0, 0.5], [1.35, 0.6], [-1.2, 0.84], [-2.27, 0.8], [-2.27, 0.6]], cabin: [[1.35, 0.58], [0.45, 1.1], [-0.35, 1.1], [-1.15, 0.82]] },
  wedge: { body: [[-2.42, 0.24], [2.42, 0.24], [2.42, 0.4], [2.05, 0.52], [0.8, 0.68], [-1.9, 0.86], [-2.42, 0.84], [-2.42, 0.62]], cabin: [[0.8, 0.66], [-0.2, 1.16], [-1.0, 1.16], [-1.85, 0.85]] }
};
// low, sporty bodies: blacked-out pillars, a small factory spoiler and side strakes
const SPORTY_PROFILES = new Set(['super', 'sports', 'coupe', 'mid', 'wedge', 'roadster', 'hothatch', 'musclemod', 'u_coupe', 'u_proto', 'u_club', 'hyper']);
const BOXY_PROFILES = new Set(['van', 'truck', 'minivan']);
function extrudeProfile(pts, width, bevel = 0.06, taper = 0) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world x
  const ng = g.index ? g.toNonIndexed() : g;
  if (taper) {
    const ys = pts.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), pa = ng.attributes.position;
    for (let i = 0; i < pa.count; i++) { const t = clamp((pa.getY(i) - y0) / (y1 - y0), 0, 1); pa.setX(i, pa.getX(i) * (1 - taper * t)); }
  }
  ng.computeVertexNormals();
  return templateFrom(ng);
}
const VEH_GEO = {};
// height of the body's upper outline at a given z (used to keep wheel arches below the hood/deck)
function profileTopAt(pts, z) {
  let best = 99;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((z - a[0]) * (z - b[0]) <= 0 && Math.abs(b[0] - a[0]) > 1e-4) { const t = (z - a[0]) / (b[0] - a[0]); const y = a[1] + (b[1] - a[1]) * t; if (y > 0.4) best = Math.min(best, y); }
  }
  return best;
}
function vehicleGeometry(type) {
  if (VEH_GEO[type]) return VEH_GEO[type];
  const s = VEHICLES[type], pr = PROFILES[s.profile];
  const g = new GeoBuilder({ part: true });
  const W = s.w, R = s.wheelR, wb = s.l * 0.6;
  const zs = pr.body.map(p => p[0]), ys = pr.body.map(p => p[1]);
  const zf = Math.max(...zs), zr = Math.min(...zs), yb = Math.min(...ys);
  // body outline with real wheel-arch cut-outs between the rear-bottom and front-bottom points
  const body = [pr.body[0]];
  for (const zc of [-wb / 2, wb / 2]) {
    const ra = Math.min(R + 0.08, profileTopAt(pr.body, zc) - R - 0.07, 0.75);
    if (ra < R * 0.6 || yb > R + ra - 0.05) continue;
    const startA = Math.PI - Math.asin(clamp((yb - R) / ra, -1, 1)), endA = Math.asin(clamp((yb - R) / ra, -1, 1));
    for (let k = 0; k <= 10; k++) { const a = startA + (endA - startA) * k / 10; body.push([zc + Math.cos(a) * ra, R + Math.sin(a) * ra]); }
    // dark wheel well filling the cut so the car isn't see-through
    g.box(0, R + ra * 0.35, zc, W * 0.62, ra * 1.25, ra * 1.9, null, 0, { part: 14 });
  }
  for (let i = 1; i < pr.body.length; i++) body.push(pr.body[i]);
  g.add(extrudeProfile(body, W, 0.1), M(0, 0, 0), null, { part: 0 });
  const glassW = W * (BOXY_PROFILES.has(s.profile) ? 0.94 : 0.88);
  g.add(extrudeProfile(pr.cabin, glassW, 0.06, BOXY_PROFILES.has(s.profile) ? 0 : 0.16), M(0, 0, 0), null, { part: 1 });
  const cabTop = Math.max(...pr.cabin.map(p => p[1]));
  const cz = pr.cabin.map(p => p[0]);
  const cabF = Math.max(...cz), cabR = Math.min(...cz);
  const belt = pr.cabin[0][1];
  const frontTop = pr.body.filter(p => p[0] >= zf - 0.01).reduce((a, p) => Math.max(a, p[1]), 0);
  const rearTop = pr.body.filter(p => p[0] <= zr + 0.01).reduce((a, p) => Math.max(a, p[1]), 0);
  const boxy = BOXY_PROFILES.has(s.profile);
  // roof panel and pillars painted body colour
  if (!boxy) {
    const roofL = (cabF - cabR) * 0.55;
    g.box(0, cabTop + 0.03, (cabF + cabR) / 2 - 0.05, W * 0.72, 0.06, roofL, null, 0, { part: 0 });
    // B-pillar
    for (const sx of [-1, 1]) g.box(sx * glassW * 0.43, (belt + cabTop) / 2, (cabF + cabR) / 2 + 0.05, 0.05, cabTop - belt, 0.16, null, 0, { part: 2 });
    // A- and C-pillars along the glasshouse edges, following its inward taper, so the cabin reads as
    // framed windows instead of one dark block; blacked out on sports cars, body colour otherwise
    const cy = pr.cabin.map(q => q[1]), cy0 = Math.min(...cy), cy1 = Math.max(...cy), taper = 0.16;
    const hwAt = y => (glassW / 2 + 0.05) * (1 - taper * clamp((y - cy0) / (cy1 - cy0), 0, 1)) + 0.012;
    const pp = SPORTY_PROFILES.has(s.profile) ? 2 : 0;
    const strut = (za, ya, zb, yb, sx, w2, d2, part) => {
      const xa = sx * hwAt(ya), xb = sx * hwAt(yb), dx = xb - xa, dy = yb - ya, dz = zb - za, L3 = Math.hypot(dx, dy, dz);
      g.add(TPL.box, M((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2, w2, L3, d2, 0, Math.atan2(dz, dy), -Math.asin(clamp(dx / L3, -1, 1))), null, { part });
    };
    const [c0, c1, c2, c3] = pr.cabin;
    for (const sx of [-1, 1]) {
      strut(c0[0], c0[1], c1[0], c1[1], sx, 0.06, 0.1, pp);   // A-pillar
      strut(c2[0], c2[1], c3[0], c3[1], sx, 0.06, 0.16, pp);  // C-pillar
      strut(c1[0], c1[1] - 0.02, c2[0], c2[1] - 0.02, sx, 0.05, 0.06, pp); // roof rail
      g.box(sx * (hwAt(belt) - 0.005), belt + 0.01, (cabF + cabR) / 2, 0.025, 0.035, cabF - cabR - 0.05, null, 0, { part: 2 }); // window seal
    }
    g.box(0, belt + 0.02, cabF - 0.04, glassW * 0.86, 0.04, 0.1, null, 0, { part: 2 }); // cowl under the windscreen
  } else {
    if (s.profile === 'minivan') for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.005), 1.46, 0.85, 0.04, 0.5, 0.9, null, 0, { part: 1 }); // cab door windows only: a panel van
    else for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.005), s.profile === 'truck' ? 2.0 : 1.65, s.profile === 'truck' ? 2.9 : 0.9, 0.04, 0.6, s.profile === 'truck' ? 0.7 : 1.1, null, 0, { part: 1 });
  }
  g.box(0, (yb + cabTop) / 2 + 0.1, (cabF + cabR) / 2, W * 0.8, (cabTop - yb) * 0.6, (cabF - cabR) * 0.75, null, 0, { part: 11 });
  // bumpers, grille, sills
  const bumpC = s.chromeBumpers ? 3 : (s.offroad ? 14 : 2);
  g.box(0, yb + 0.12, zf + 0.06, W * 0.98, 0.22, 0.16, null, 0, { part: bumpC });
  g.box(0, yb + 0.12, zr - 0.06, W * 0.98, 0.22, 0.16, null, 0, { part: bumpC });
  g.box(0, Math.min(frontTop - 0.22, yb + 0.42), zf + 0.075, W * 0.46, Math.min(0.24, frontTop - yb - 0.3), 0.04, null, 0, { part: 15 });
  g.box(0, yb + 0.02, 0, W * 0.92, 0.08, zf - zr - 0.5, null, 0, { part: 2 });
  for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.005), yb + 0.08, 0, 0.04, 0.1, wb - R * 2.4, null, 0, { part: 14 });
  // door seams and handles
  if (!boxy && s.l > 3.9) {
    const dz = [cabF - 0.05, (cabF + cabR) / 2 + 0.05, cabR + 0.1];
    for (const sx of [-1, 1]) {
      for (const z of dz) g.box(sx * (W / 2 + 0.003), (yb + belt) / 2 + 0.05, z, 0.01, belt - yb - 0.12, 0.018, null, 0, { part: 14 });
      g.box(sx * (W / 2 + 0.012), belt - 0.12, (dz[0] + dz[1]) / 2 - 0.25, 0.02, 0.04, 0.18, null, 0, { part: 3 });
      g.box(sx * (W / 2 + 0.012), belt - 0.12, (dz[1] + dz[2]) / 2 - 0.2, 0.02, 0.04, 0.18, null, 0, { part: 3 });
    }
  }
  // lights, indicators, plates, exhausts, mirrors
  for (const sx of [-1, 1]) {
    // dark bezels behind the lamps so head and tail lights read on any paint, light or dark
    g.box(sx * (W / 2 - 0.3), frontTop - 0.13, zf + 0.05, 0.43, 0.19, 0.05, null, 0, { part: 14 });
    g.box(sx * (W / 2 - 0.25), rearTop - 0.14, zr - 0.05, 0.47, 0.2, 0.05, null, 0, { part: 14 });
    g.box(sx * (W / 2 - 0.3), frontTop - 0.13, zf + 0.07, 0.36, 0.13, 0.05, null, 0, { part: 4 });
    g.box(sx * (W / 2 - 0.1), frontTop - 0.13, zf + 0.06, 0.1, 0.1, 0.05, null, 0, { part: 12 });
    g.box(sx * (W / 2 - 0.25), rearTop - 0.14, zr - 0.07, 0.4, 0.14, 0.05, null, 0, { part: 5 });
    g.box(sx * (W / 2 - 0.08), rearTop - 0.14, zr - 0.065, 0.08, 0.12, 0.05, null, 0, { part: 12 });
    g.box(sx * (W / 2 - 0.55), rearTop - 0.14, zr - 0.07, 0.14, 0.1, 0.05, null, 0, { part: 6 });
    g.box(sx * (W / 2 + 0.01), frontTop - 0.08, zf - 0.6, 0.03, 0.05, 0.12, null, 0, { part: 12 });
    g.box(sx * (W / 2 + 0.1), belt + 0.08, cabF - 0.15, 0.16, 0.12, 0.1, null, 0, { part: 0 });
    g.box(sx * (W / 2 + 0.05), belt + 0.04, cabF - 0.1, 0.08, 0.03, 0.06, null, 0, { part: 14 });
  }
  g.box(0, yb + 0.24, zr - 0.15, 0.52, 0.12, 0.02, null, 0, { part: 13 });
  g.box(0, yb + 0.22, zf + 0.15, 0.52, 0.12, 0.02, null, 0, { part: 13 });
  const ex = s.dualExhaust ? [-0.35, 0.35] : [0.45];
  for (const x of ex) g.add(TPL.cyl6, M(x * W / 2, yb + 0.08, zr - 0.06, 0.05, 0.18, 0.05, 0, Math.PI / 2), null, { part: 3 });
  if (s.taxi) {
    g.box(0, cabTop + 0.17, (cabF + cabR) / 2, 0.6, 0.22, 0.28, null, 0, { part: 9 });
    g.box(0, yb + 0.45, 0.2, W + 0.02, 0.1, 2.2, null, 0, { part: 2 });
  }
  if (s.police) {
    g.box(0, cabTop + 0.09, (cabF + cabR) / 2 - 0.05, 1.2, 0.1, 0.3, null, 0, { part: 2 });
    g.box(-0.32, cabTop + 0.18, (cabF + cabR) / 2 - 0.05, 0.5, 0.12, 0.26, null, 0, { part: 7 });
    g.box(0.32, cabTop + 0.18, (cabF + cabR) / 2 - 0.05, 0.5, 0.12, 0.26, null, 0, { part: 8 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.04), (yb + belt) / 2 + 0.06, 0.15, 0.03, 0.34, 2.0, null, 0, { part: 10 });
    g.box(0, yb + 0.3, zf + 0.2, W * 0.7, 0.3, 0.12, null, 0, { part: 2 });
  }
  if (s.unmarked) { // hidden grille strobes and a push bar
    g.box(-0.2, frontTop - 0.25, zf + 0.09, 0.14, 0.06, 0.02, null, 0, { part: 7 });
    g.box(0.2, frontTop - 0.25, zf + 0.09, 0.14, 0.06, 0.02, null, 0, { part: 8 });
    g.box(0, yb + 0.35, zf + 0.22, W * 0.5, 0.35, 0.08, null, 0, { part: 14 });
  }
  if (s.profile === 'pickup') {
    for (const sx of [-1, 1]) g.box(sx * (W / 2 - 0.06), 1.28, -1.6, 0.1, 0.3, 2.05, null, 0, { part: 0 });
    g.box(0, 1.28, -2.6, W - 0.1, 0.3, 0.1, null, 0, { part: 0 });
    g.box(0, 1.16, -1.6, W - 0.25, 0.04, 1.95, null, 0, { part: 2 });
  }
  if (s.utility) {
    g.box(0, cabTop + 0.1, (cabF + cabR) / 2 + 0.2, 1.3, 0.12, 0.28, null, 0, { part: 9 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 - 0.1), 1.95, -1.6, 0.06, 0.06, 2.2, null, 0, { part: 14 });
    for (const z of [-0.6, -2.6]) g.box(0, 1.95, z, W - 0.15, 0.06, 0.06, null, 0, { part: 14 });
    for (let k = 0; k < 5; k++) g.box(0, 1.99, -0.9 - k * 0.38, 0.4, 0.03, 0.05, null, 0, { part: 3 });
  }
  if (s.offroad) {
    for (const sx of [-1, 1]) g.box(sx * W * 0.38, cabTop + 0.07, (cabF + cabR) / 2, 0.06, 0.06, (cabF - cabR) * 0.8, null, 0, { part: 14 });
    g.box(0, cabTop + 0.14, cabF - 0.2, W * 0.7, 0.1, 0.12, null, 0, { part: 14 });
    for (let k = -2; k <= 2; k++) g.box(k * 0.26, cabTop + 0.14, cabF - 0.13, 0.2, 0.08, 0.04, null, 0, { part: 4 });
    g.box(0, yb + 0.45, zf + 0.3, W * 0.8, 0.5, 0.08, null, 0, { part: 14 });
    for (const sx of [-1, 1]) g.box(sx * W * 0.35, yb + 0.45, zf + 0.2, 0.06, 0.5, 0.25, null, 0, { part: 14 });
    g.add(TPL.cyl, M(0, belt + 0.25, zr - 0.08, R * 0.9, 0.3, R * 0.9, 0, Math.PI / 2), null, { part: 14 });
  }
  if (s.stripes) { for (const x of [-0.18, 0.18]) g.box(x, frontTop + 0.005, (zf + cabF) / 2, 0.16, 0.012, zf - cabF - 0.1, null, 0, { part: 10 }); }
  if (SPORTY_PROFILES.has(s.profile) && !s.wing) {
    g.box(0, rearTop + 0.16, zr + 0.25, W * 0.85, 0.05, 0.3, null, 0, { part: s.profile === 'super' ? 2 : 0 });
    for (const sx of [-0.3, 0.3]) g.box(sx * W, rearTop + 0.07, zr + 0.25, 0.06, 0.14, 0.15, null, 0, { part: 2 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 - 0.02), yb + 0.25, -wb * 0.15, 0.04, 0.16, 0.6, null, 0, { part: 14 });
  }
  if (s.profile === 'truck') {
    g.box(0, 3.21, -1.0, W - 0.1, 0.04, 5.0, null, 0, { part: 2 });
    g.box(0, 1.9, -3.62, W - 0.2, 2.4, 0.03, null, 0, { part: 10 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.01), 2.3, -1.0, 0.02, 1.0, 4.4, null, 0, { part: 10 });
  }
  // ---- model details (v6): what makes one model read differently from another at a glance
  if (s.wing === 'swan') { // a tall wing on two swan-neck uprights
    for (const sx of [-0.32, 0.32]) g.box(sx * W, rearTop + 0.24, zr + 0.42, 0.05, 0.42, 0.16, null, 0, { part: 2 });
    g.box(0, rearTop + 0.47, zr + 0.36, W * 0.92, 0.05, 0.42, null, 0, { part: 2 });
    for (const sx of [-1, 1]) g.box(sx * W * 0.46, rearTop + 0.42, zr + 0.36, 0.03, 0.2, 0.46, null, 0, { part: 0 });
  } else if (s.wing === 'roof') { // hot-hatch roof wing over the tailgate
    g.box(0, cabTop - 0.01, cabR + 0.05, W * 0.74, 0.05, 0.36, null, 0, { part: 0 });
    for (const sx of [-1, 1]) g.box(sx * W * 0.36, cabTop - 0.06, cabR + 0.12, 0.04, 0.12, 0.3, null, 0, { part: 2 });
  } else if (s.wing === 'lip') g.box(0, rearTop + 0.04, zr + 0.18, W * 0.82, 0.07, 0.14, null, 0, { part: 0 });
  if (s.scoop) { // a raised hood scoop with a black mouth
    g.box(0, frontTop + 0.07, (zf + cabF) / 2, 0.62, 0.14, 0.75, null, 0, { part: 0 });
    g.box(0, frontTop + 0.08, (zf + cabF) / 2 + 0.38, 0.52, 0.09, 0.02, null, 0, { part: 14 });
  }
  if (s.roofRails) for (const sx of [-1, 1]) g.box(sx * W * 0.36, cabTop + 0.07, (cabF + cabR) / 2, 0.05, 0.06, (cabF - cabR) * 0.72, null, 0, { part: 3 });
  if (s.lightbar) { // full-width light signatures front and back
    g.box(0, frontTop - 0.05, zf + 0.085, W * 0.82, 0.035, 0.03, null, 0, { part: 16 });
    g.box(0, rearTop - 0.06, zr - 0.085, W * 0.88, 0.05, 0.03, null, 0, { part: 5 });
  }
  if (s.sideIntakes) for (const sx of [-1, 1]) {
    g.box(sx * (W / 2 - 0.005), (yb + belt) / 2 + 0.04, -wb * 0.2, 0.05, 0.26, 0.62, null, 0, { part: 14 });
    g.box(sx * (W / 2 + 0.01), (yb + belt) / 2 + 0.18, -wb * 0.2, 0.03, 0.04, 0.7, null, 0, { part: 2 });
  }
  // one-off details (Session 6D): separate flared front wings with running boards, and a spare wheel on the tail
  if (s.fenders) for (const sx of [-1, 1]) {
    g.box(sx * (W / 2 - 0.06), R + 0.12, wb / 2, 0.24, 0.16, R * 2.6, null, 0, { part: 0 });
    g.box(sx * (W / 2 - 0.02), yb + 0.04, 0, 0.2, 0.05, wb - R * 2.2, null, 0, { part: 14 });
  }
  if (s.spare) g.add(TPL.cyl, M(0, (yb + rearTop) / 2 + 0.05, zr - 0.14, R * 0.95, 0.22, R * 0.95, 0, Math.PI / 2), null, { part: 14 });
  if (s.louvers) for (let k = 0; k < 4; k++) { const z = cabR - 0.12 - k * 0.11, y = profileTopAt(pr.body, z); if (y < 5) g.box(0, y + 0.012, z, W * 0.5, 0.025, 0.05, null, 0, { part: 14 }); }
  // ---- tier detail: what separates a junk runabout from a car people want to collect
  // a one-off (Session 6D) is dressed like a rare model
  const tier = s.tier === 'unique' ? 'rare' : s.tier || 'common', T = { nice: 1, sport: 2, luxury: 3, rare: 4 }[tier] || 0;
  const hoodZ = (zf + cabF) / 2;
  if (T >= 1) {
    // projector headlamp rings and a light strip (part 16)
    for (const sx of [-1, 1]) {
      g.box(sx * (W / 2 - 0.36), frontTop - 0.13, zf + 0.1, 0.1, 0.08, 0.02, null, 0, { part: 16 });
      g.box(sx * (W / 2 - 0.22), frontTop - 0.13, zf + 0.1, 0.1, 0.08, 0.02, null, 0, { part: 16 });
      g.box(sx * (W / 2 - 0.3), frontTop - 0.215, zf + 0.085, 0.42, 0.025, 0.02, null, 0, { part: 16 });
    }
    // window surround and belt-line trim
    if (!boxy) for (const sx of [-1, 1]) g.box(sx * (glassW / 2 + 0.012), belt - 0.005, (cabF + cabR) / 2, 0.012, 0.03, cabF - cabR - 0.1, null, 0, { part: T >= 3 ? 3 : 17 });
  }
  if (T === 2 || tier === 'rare' && (s.profile === 'super' || s.profile === 'coupe' || s.profile === 'mid' || s.profile === 'wedge')) {
    // sport: splitter, side skirts, diffuser fins, hood vents, quad tips
    g.box(0, yb + 0.02, zf + 0.12, W * 0.9, 0.04, 0.22, null, 0, { part: 17 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.01), yb + 0.05, 0, 0.05, 0.08, wb - R * 2.2, null, 0, { part: 17 });
    for (let k = -2; k <= 2; k++) g.box(k * 0.22, yb + 0.06, zr - 0.08, 0.03, 0.14, 0.2, null, 0, { part: 17 });
    for (const sx of [-1, 1]) g.box(sx * 0.32, frontTop + 0.012, hoodZ, 0.22, 0.02, 0.32, null, 0, { part: 17 });
    for (const x of [-0.42, -0.28, 0.28, 0.42]) g.add(TPL.cyl6, M(x * W / 2 * 2, yb + 0.1, zr - 0.08, 0.045, 0.14, 0.045, 0, Math.PI / 2), null, { part: 3 });
  }
  if (T >= 3) {
    // luxury / rare: chrome grille slats, chrome sill, hood ornament (luxury) or side intakes (rare)
    const gy0 = Math.min(frontTop - 0.22, yb + 0.42), gh = Math.min(0.24, frontTop - yb - 0.3);
    for (let k = 0; k < 4; k++) g.box(0, gy0 - gh / 2 + 0.03 + k * (gh - 0.06) / 3, zf + 0.1, W * 0.44, 0.018, 0.02, null, 0, { part: 3 });
    for (const sx of [-1, 1]) g.box(sx * (W / 2 + 0.012), yb + 0.16, 0, 0.012, 0.03, wb - R * 2.2, null, 0, { part: 3 });
    if (tier === 'luxury') g.box(0, frontTop + 0.06, zf - 0.12, 0.03, 0.1, 0.06, null, 0, { part: 3 });
    if (tier === 'rare' && s.profile === 'super' && !s.sideIntakes) for (const sx of [-1, 1]) g.box(sx * (W / 2 - 0.02), (yb + belt) / 2, -wb * 0.2, 0.05, 0.22, 0.5, null, 0, { part: 17 });
  }
  const geo = g.build();
  // LOD: body, cabin, lights and bumpers only, for cars far from the camera (traffic in the distance)
  const lg = new GeoBuilder({ part: true });
  lg.add(extrudeProfile(pr.body.slice(), W, 0.04), M(0, 0, 0), null, { part: 0 });
  lg.add(extrudeProfile(pr.cabin, glassW, 0.03, boxy ? 0 : 0.16), M(0, 0, 0), null, { part: 1 });
  if (s.wing === 'swan') lg.box(0, rearTop + 0.47, zr + 0.36, W * 0.92, 0.05, 0.42, null, 0, { part: 2 });
  lg.box(0, yb + 0.12, zf + 0.06, W * 0.98, 0.22, 0.16, null, 0, { part: bumpC }); lg.box(0, yb + 0.12, zr - 0.06, W * 0.98, 0.22, 0.16, null, 0, { part: bumpC });
  for (const sx of [-1, 1]) { lg.box(sx * (W / 2 - 0.3), frontTop - 0.13, zf + 0.07, 0.36, 0.13, 0.05, null, 0, { part: 4 }); lg.box(sx * (W / 2 - 0.25), rearTop - 0.14, zr - 0.07, 0.4, 0.14, 0.05, null, 0, { part: 5 }); }
  if (s.taxi) lg.box(0, cabTop + 0.17, (cabF + cabR) / 2, 0.6, 0.22, 0.28, null, 0, { part: 9 });
  if (s.police) { lg.box(-0.32, cabTop + 0.18, (cabF + cabR) / 2 - 0.05, 0.5, 0.12, 0.26, null, 0, { part: 7 }); lg.box(0.32, cabTop + 0.18, (cabF + cabR) / 2 - 0.05, 0.5, 0.12, 0.26, null, 0, { part: 8 }); }
  if (s.profile === 'truck') lg.box(0, 1.9, -1.0, W - 0.05, 2.6, 5.2, null, 0, { part: 10 });
  const lod = lg.build();
  VEH_GEO[type] = { geo, lod, wheels: [[W / 2 - 0.16, wb / 2], [-(W / 2 - 0.16), wb / 2], [W / 2 - 0.16, -wb / 2], [-(W / 2 - 0.16), -wb / 2]], yb, zf, zr, frontTop, rearTop, cabTop };
  return VEH_GEO[type];
}
// rim styles: 0 steel wheel with a small hubcap (beater / common), 1 five-spoke alloy (nice),
// 2 ten-spoke gunmetal with a lip (sport), 3 polished multi-spoke (luxury / rare)
function wheelGeometry(style = 1) {
  const g = new GeoBuilder();
  g.add(TPL.cyl, M(0, 0, 0, 1, 1, 1), C(0x1a1a1c));
  g.add(TPL.cyl, M(0, 0, 0, 0.82, 1.01, 0.82), C(0x232325)); // sidewall shoulder
  if (style === 0) {
    g.add(TPL.cyl, M(0, 0, 0, 0.6, 1.03, 0.6), C(0x5c6066));
    g.add(TPL.cyl, M(0, 0, 0, 0.36, 1.06, 0.36), C(0x8a8f96));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(TPL.box, M(Math.cos(a) * 0.47, 0, Math.sin(a) * 0.47, 0.07, 1.05, 0.07, a), C(0x2a2c30)); }
  } else if (style === 1) {
    g.add(TPL.cyl, M(0, 0, 0, 0.64, 1.03, 0.64), C(0x2c2f33));
    g.add(TPL.cyl6, M(0, 0, 0, 0.18, 1.08, 0.18), C(0x9aa0a6));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.add(TPL.box, M(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36, 0.12, 1.06, 0.4, a), C(0xb4b9c0)); }
  } else if (style === 2) {
    g.add(TPL.cyl, M(0, 0, 0, 0.7, 1.03, 0.7), C(0x15171a));
    g.add(TPL.cyl, M(0, 0, 0, 0.74, 1.02, 0.74), C(0x8a8f96)); // polished lip
    g.add(TPL.cyl6, M(0, 0, 0, 0.16, 1.09, 0.16), C(0xd8202a));
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; g.add(TPL.box, M(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0.07, 1.07, 0.5, a), C(0x4a4e55)); }
  } else {
    g.add(TPL.cyl, M(0, 0, 0, 0.72, 1.03, 0.72), C(0x8c9198));
    g.add(TPL.cyl6, M(0, 0, 0, 0.2, 1.09, 0.2), C(0xe8eaee));
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; g.add(TPL.box, M(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.09, 1.08, 0.5, a), C(0xf2f3f5)); }
  }
  const geo = g.build(); geo.rotateZ(Math.PI / 2);
  return geo;
}

