/* Block Stack — balance, worlds and level generation.
   Pure data + pure functions. No DOM, no canvas: importable by the headless
   balance simulator in tools/sim.mjs. */

export const BASE = 1.0;        // full block footprint, world units
export const BLOCK_H = 0.32;    // block height, world units
export const MIN_SIZE = 0.045;  // thinner than this and the sliver cannot hold
export const RECOVER = 0.18;    // width restored per 3-perfect recovery
export const PERFECT_STREAK = 3;

export const LEVELS_PER_WORLD = 10;
export const WORLD_COUNT = 10;
export const LEVEL_COUNT = LEVELS_PER_WORLD * WORLD_COUNT;

/* ---------------------------------------------------------------- worlds --
   Each world owns a palette, a sky, a scenery renderer key and a difficulty
   band. `perfect` is a TIME budget in seconds, not a distance: the engine
   multiplies it by the block's instantaneous speed. Defining it in world units
   makes every speed increase secretly tighten precision as well, which is how
   you end up with a level 100 nobody can clear. Blocks take their colour from a procedural HSL ramp so a tower reads
   as one continuous gradient that is unmistakably "this world".            */

export const WORLDS = [
  {
    id: 1, name: 'Meadow Dawn', subtitle: 'Fundamentals',
    hue: 150, hueRange: 58, sat: 52, light: 50,
    accent: '#FFB648', fog: '#9FD9A8',
    sky: ['#FFE3B0', '#FFA469', '#E8655B', '#4C3A6E'],
    scenery: 'hills', ambient: 'none', tempo: 86,
    speed: [1.45, 1.80], travel: [1.32, 1.28], perfect: [0.064, 0.058],
    target: [10, 13], startWidth: 1,
    axis: 'x', dir: 'fixed',
    rhythms: ['constant'], bossRhythms: ['constant']
  },
  {
    id: 2, name: 'Coral Bay', subtitle: 'Direction',
    hue: 338, hueRange: 62, sat: 62, light: 58,
    accent: '#FF6B81', fog: '#7FD3E2',
    sky: ['#A9ECF4', '#51C6DA', '#1E6F8E', '#0C3A55'],
    scenery: 'sea', ambient: 'none', tempo: 90,
    speed: [1.74, 2.00], travel: [1.30, 1.26], perfect: [0.056, 0.051],
    target: [12, 15], startWidth: 1,
    axis: 'x', dir: 'flip',
    rhythms: ['constant'], bossRhythms: ['constant']
  },
  {
    id: 3, name: 'Amber Desert', subtitle: 'Rhythm',
    hue: 186, hueRange: 52, sat: 55, light: 50,
    accent: '#F2A03D', fog: '#E9B27A',
    sky: ['#FFE6AE', '#F5AB5F', '#C96A3E', '#5E3327'],
    scenery: 'dunes', ambient: 'sand', tempo: 94,
    speed: [1.86, 2.06], travel: [1.28, 1.25], perfect: [0.050, 0.046],
    target: [13, 16], startWidth: 1,
    axis: 'x', dir: 'flip',
    rhythms: ['constant', 'accel', 'decel'], bossRhythms: ['accel', 'decel', 'constant']
  },
  {
    id: 4, name: 'Jade Terraces', subtitle: 'Axis Changes',
    hue: 22, hueRange: 46, sat: 62, light: 54,
    accent: '#3FBF7F', fog: '#8FC9A8',
    sky: ['#D4F0D6', '#74C48F', '#2E7A5C', '#10332E'],
    scenery: 'peaks', ambient: 'none', tempo: 96,
    speed: [1.92, 2.16], travel: [1.27, 1.24], perfect: [0.046, 0.043],
    target: [14, 17], startWidth: 1,
    axis: 'alt2', dir: 'flip',
    rhythms: ['constant', 'accel'], bossRhythms: ['constant', 'accel', 'decel']
  },
  {
    id: 5, name: 'Crimson Ridge', subtitle: 'Precision',
    hue: 198, hueRange: 56, sat: 54, light: 56,
    accent: '#E04B54', fog: '#C97A70',
    sky: ['#FFCDB4', '#EE7C64', '#9E3247', '#3A1330'],
    scenery: 'mesa', ambient: 'none', tempo: 100,
    speed: [2.00, 2.24], travel: [1.25, 1.22], perfect: [0.042, 0.039],
    target: [15, 18], startWidth: 1,
    axis: 'alt', dir: 'flip',
    rhythms: ['constant', 'decel'], bossRhythms: ['decel', 'constant', 'accel']
  },
  {
    id: 6, name: 'Frost Basin', subtitle: 'Combination',
    hue: 28, hueRange: 50, sat: 68, light: 55,
    accent: '#63C8E8', fog: '#BBDCEC',
    sky: ['#ECF8FF', '#AEDAF0', '#5E8FB5', '#21364B'],
    scenery: 'snow', ambient: 'snow', tempo: 102,
    speed: [2.10, 2.38], travel: [1.24, 1.21], perfect: [0.0355, 0.0330],
    target: [18, 21], startWidth: 1,
    axis: 'alt', dir: 'flip',
    rhythms: ['accel', 'decel', 'pulse'], bossRhythms: ['pulse', 'accel', 'decel']
  },
  {
    id: 7, name: 'Ember Reach', subtitle: 'Advanced Movement',
    hue: 176, hueRange: 58, sat: 52, light: 52,
    accent: '#FF7A33', fog: '#B4553A',
    sky: ['#FFB56B', '#E8562E', '#7C1D24', '#22090F'],
    scenery: 'volcano', ambient: 'ember', tempo: 106,
    speed: [2.24, 2.52], travel: [1.22, 1.20], perfect: [0.0330, 0.0312],
    target: [19, 22], startWidth: 1,
    axis: 'alt', dir: 'flip',
    rhythms: ['pulse', 'pause', 'accel'], bossRhythms: ['pause', 'pulse', 'accel', 'decel']
  },
  {
    id: 8, name: 'Abyss Tide', subtitle: 'Recovery Mastery',
    hue: 30, hueRange: 54, sat: 66, light: 56,
    accent: '#2FD0C0', fog: '#1F6E78',
    sky: ['#93E8DC', '#2E9E99', '#12525F', '#04202C'],
    scenery: 'deep', ambient: 'bubble', tempo: 108,
    speed: [2.30, 2.58], travel: [1.21, 1.19], perfect: [0.0325, 0.0305],
    target: [19, 22], startWidth: 0.90,
    axis: 'alt', dir: 'flip',
    rhythms: ['pause', 'reverse', 'constant'], bossRhythms: ['reverse', 'pause', 'pulse']
  },
  {
    id: 9, name: 'Aurora Vault', subtitle: 'Expert',
    hue: 48, hueRange: 88, sat: 60, light: 58,
    accent: '#A277FF', fog: '#3A2C63',
    sky: ['#2B1C4E', '#1C2B5F', '#123A5E', '#06121F'],
    scenery: 'aurora', ambient: 'star', tempo: 112,
    speed: [2.48, 2.78], travel: [1.19, 1.17], perfect: [0.0315, 0.0295],
    target: [20, 22], startWidth: 0.86,
    axis: 'alt', dir: 'flip',
    rhythms: ['accel', 'pulse', 'reverse', 'decel'], bossRhythms: ['reverse', 'pulse', 'accel', 'pause']
  },
  {
    id: 10, name: 'Cosmic Apex', subtitle: 'Mastery',
    hue: 44, hueRange: 300, sat: 60, light: 58,
    accent: '#FFD24A', fog: '#2A1745',
    sky: ['#1C1131', '#2C1247', '#3A1140', '#070310'],
    scenery: 'cosmos', ambient: 'star', tempo: 118,
    speed: [2.68, 3.08], travel: [1.18, 1.16], perfect: [0.0310, 0.0288],
    target: [20, 22], startWidth: 0.84,
    axis: 'alt', dir: 'flip',
    rhythms: ['pulse', 'reverse', 'pause', 'accel', 'decel'],
    bossRhythms: ['reverse', 'pulse', 'pause', 'accel', 'decel']
  }
];

/* Boss levels are not "a longer normal level": they push the world's own
   mechanic set instead of raising raw speed. The length multiplier scales with
   the world so the very first boss is a step, not a wall -- survival chance
   falls off exponentially with run length, so a flat 1.3x buries new players at
   level 10 while barely registering at level 100. */
function bossMul(world) {
  return {
    speed: 1.05,
    travel: 0.98,
    target: 1.18 + 0.015 * (world - 1),
    perfect: 0.970 - 0.004 * (world - 1)
  };
}

/* One short message when a mechanic genuinely changes. Nothing else. */
const HINTS = {
  1: 'Tap to Stack',
  2: 'Land it flush for a Perfect',
  4: '3 Perfects in a row restore width',
  11: 'New: Direction Change',
  21: 'New: Speed Shift',
  31: 'New: Axis Change',
  41: 'New: Tighter Window',
  51: 'New: Rhythm Mix',
  61: 'New: Pauses & Pulses',
  71: 'New: Reversals · Smaller Start',
  81: 'New: Expert Patterns',
  91: 'Mastery'
};

const lerp = (a, b, t) => a + (b - a) * t;

/** Build the full config for level `n` (1..100). Deterministic. */
export function levelConfig(n) {
  const num = Math.max(1, Math.min(LEVEL_COUNT, Math.round(n)));
  const wIdx = Math.floor((num - 1) / LEVELS_PER_WORLD);
  const w = WORLDS[wIdx];
  const inWorld = ((num - 1) % LEVELS_PER_WORLD) + 1; // 1..10
  const boss = inWorld === LEVELS_PER_WORLD;
  const t = (inWorld - 1) / (LEVELS_PER_WORLD - 1); // 0..1

  let speed = lerp(w.speed[0], w.speed[1], t);
  let travel = lerp(w.travel[0], w.travel[1], t);
  let perfect = lerp(w.perfect[0], w.perfect[1], t);
  let target = Math.round(lerp(w.target[0], w.target[1], t));

  if (boss) {
    const m = bossMul(w.id);
    speed *= m.speed;
    travel *= m.travel;
    perfect *= m.perfect;
    target = Math.round(target * m.target);
  }

  // Axis mode ramps inside world 4 so the mechanic is introduced, not dumped.
  let axis = w.axis;
  if (w.axis === 'alt2' && inWorld >= 6) axis = 'alt';

  return {
    num, world: w.id, worldIndex: wIdx, inWorld, boss,
    name: boss ? `World ${w.id} Boss` : `Level ${num}`,
    speed: +speed.toFixed(4),
    travel: +travel.toFixed(4),
    perfect: +perfect.toFixed(5),   // seconds of timing slack
    target,
    startWidth: w.startWidth,
    maxSize: BASE * w.startWidth,
    axis,
    dir: w.dir,
    rhythms: boss ? w.bossRhythms : w.rhythms,
    hint: HINTS[num] || null,
    palette: w
  };
}

export const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, i) => levelConfig(i + 1));

/** Block colour ramp — a slow hue drift through the world's band. */
export function blockColor(world, index) {
  const w = WORLDS[world - 1];
  const span = w.hueRange;
  const k = index * 0.17;
  const h = (w.hue + ((k * span) % span) + 360) % 360;
  const s = w.sat + 7 * Math.sin(index * 0.41);
  const l = w.light + 5 * Math.sin(index * 0.27 + 1.1);
  return { h, s: Math.max(18, Math.min(92, s)), l: Math.max(22, Math.min(76, l)) };
}

/** Crowns: complete = 1, then remaining platform and perfect rate. */
export function rateRun({ placed, perfects, remaining, maxSize }) {
  if (placed <= 0) return 1;
  const ratio = perfects / placed;
  const remain = remaining / maxSize;
  if (ratio >= 0.5 && remain >= 0.7) return 3;
  if (ratio >= 0.25 || remain >= 0.5) return 2;
  return 1;
}

export const RATING_RULES = [
  { crowns: 2, text: 'Keep 50% of the platform, or land 25% Perfects' },
  { crowns: 3, text: 'Keep 70% of the platform and land 50% Perfects' }
];
