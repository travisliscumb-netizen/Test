/* Static game data: roster, move tables, stages, ladder and the difficulty
   curve. Pure -- no DOM, no state -- so the engine, the AI, the renderer and
   the headless balance tests all read the same numbers. */

export const HZ = 60;
export const VIEW_H = 720;          // logical screen height; width follows the device aspect
export const GROUND_Y = 604;        // logical screen y of the floor line
export const STAGE_W = 2600;        // world width
export const WALL = 70;             // closest a fighter may stand to a stage edge
export const ROUND_TIME = 99;       // seconds
export const ROUNDS_TO_WIN = 2;
export const LADDER_LENGTH = 10;    // the 10th fight is the boss; the ladder then goes endless
export const GRAVITY = 0.86;
export const BUFFER = 9;            // input buffer, ticks -- forgiving on a touch screen
export const MAX_HP = 1000;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ moves
   Frame data is in 60 Hz ticks. `fx` names the end effector that carries the
   hitbox (front/back fist, front/back foot); the hitbox is a circle on that
   joint of the *posed* skeleton, so what you see is what connects.
   level: 'high' and 'mid' are stopped by a standing block, 'low' needs a
   crouching block, 'overhead' (jump-ins) needs a standing block.          */
export const MOVES = {
  jab:   { pose: 'jab',   base: 'stance', startup: 4, active: 4, recovery: 9,  dmg: 42, stun: 15, bstun: 10, knock: 3.2, fx: 'hf', r: 26, level: 'high', hitstop: 5, sfx: 'light', chain: { p: 'jab2', k: 'kick' } },
  jab2:  { pose: 'jab2',  base: 'stance', startup: 4, active: 4, recovery: 10, dmg: 46, stun: 16, bstun: 10, knock: 3.6, fx: 'hb', r: 26, level: 'high', hitstop: 5, sfx: 'light', chain: { p: 'cross', k: 'kick' } },
  cross: { pose: 'cross', base: 'stance', startup: 6, active: 4, recovery: 16, dmg: 72, stun: 22, bstun: 13, knock: 9,   fx: 'hf', r: 30, level: 'high', hitstop: 8, sfx: 'heavy', step: 3.5, chain: { k: 'spin' } },
  kick:  { pose: 'kick',  base: 'stance', startup: 8, active: 5, recovery: 16, dmg: 78, stun: 20, bstun: 12, knock: 7,   fx: 'ff', r: 30, level: 'mid',  hitstop: 7, sfx: 'heavy', chain: { k: 'spin' } },
  spin:  { pose: 'spin',  base: 'stance', startup: 9, active: 5, recovery: 22, dmg: 96, stun: 0,  bstun: 15, knock: 10,  fx: 'fb', r: 32, level: 'mid',  hitstop: 10, sfx: 'heavy', knockdown: true, launch: 9 },
  upper: { pose: 'upper', base: 'crouch', end: 'stance', startup: 7, active: 6, recovery: 24, dmg: 118, stun: 0, bstun: 16, knock: 3.5, fx: 'hf', r: 32, level: 'mid', hitstop: 11, sfx: 'crush', knockdown: true, launch: 17.5 },
  sweep: { pose: 'sweep', base: 'crouch', end: 'crouch', startup: 7, active: 6, recovery: 22, dmg: 66, stun: 0, bstun: 13, knock: 3, fx: 'ff', r: 30, level: 'low', hitstop: 7, sfx: 'heavy', knockdown: true, launch: 4.5 },
  apunch:{ pose: 'apunch', base: 'jump', air: true, startup: 4, active: 99, recovery: 0, dmg: 66, stun: 18, bstun: 12, knock: 5, fx: 'hf', r: 28, level: 'overhead', hitstop: 7, sfx: 'heavy' },
  akick: { pose: 'akick', base: 'jump', air: true, startup: 5, active: 99, recovery: 0, dmg: 82, stun: 20, bstun: 13, knock: 6.5, fx: 'ff', r: 30, level: 'overhead', hitstop: 8, sfx: 'heavy' }
};

/* ---------------------------------------------------------------- fighters
   body: segment lengths before `scale`. look: everything the renderer needs
   to dress the skeleton. special: the one-button signature move.          */
const BODY = { torso: 106, neck: 11, head: 23, upperArm: 53, foreArm: 50, thigh: 68, shin: 66, foot: 27, bulk: 1 };

export const FIGHTERS = {
  kael: {
    id: 'kael', name: 'KAEL', title: 'The Exiled Blade', home: 'bridge',
    bio: 'A swordsman who swore off the sword. His kicks still cut.',
    hp: 1000, power: 1.0, speed: 1.0, scale: 1.06,
    body: { ...BODY, torso: 108, thigh: 70, shin: 68 },
    special: { type: 'rising', name: 'Crescent Rise', dmg: 120, cooldown: 60 },
    element: { core: '#f2f8ff', glow: '#8fc2ff', deep: '#2c5fae', name: 'steel' },
    look: {
      skin: '#e2b48f', top: 'gi', topColor: '#2e3550', topColor2: '#1b1f31', sleeve: 'none',
      pants: '#2a3048', pantsStyle: 'gi', boots: null, wraps: '#ece6d8', belt: '#9b1c24',
      sash: '#9b1c24', hair: { style: 'long', color: '#e8e8ee' }, band: '#9b1c24', scar: true
    }
  },
  ember: {
    id: 'ember', name: 'EMBER', title: 'Monk of the Last Flame', home: 'temple',
    bio: 'Keeper of a temple fire that has burned for nine hundred years.',
    hp: 1000, power: 1.0, speed: 1.02, scale: 1.02,
    body: { ...BODY, bulk: 1.02 },
    special: { type: 'projectile', name: 'Flame Palm', dmg: 92, cooldown: 72, speed: 10.5, kind: 'fire' },
    element: { core: '#fff3c4', glow: '#ff9a2e', deep: '#c2410c', name: 'fire' },
    look: {
      skin: '#c98b5e', top: 'robe', topColor: '#e8771a', topColor2: '#b4500d', sleeve: 'none',
      pants: '#d9661a', pantsStyle: 'gi', boots: null, wraps: '#f0dfc0', belt: '#7a2a10',
      sash: '#f4b13a', hair: { style: 'bald', color: '#3b2416' }, beads: '#5b2a14', mark: '#c81e1e'
    }
  },
  volta: {
    id: 'volta', name: 'VOLTA', title: 'Storm Warden', home: 'spire',
    bio: 'Sworn to the Spire. She arrives a moment before the thunder.',
    hp: 960, power: 0.97, speed: 1.12, scale: 1.0,
    body: { ...BODY, torso: 102, upperArm: 52, foreArm: 49, thigh: 70, shin: 68, bulk: 0.88 },
    special: { type: 'dash', name: 'Thunder Lance', dmg: 104, cooldown: 66 },
    element: { core: '#f0fffe', glow: '#5ff0ff', deep: '#1f7a9a', name: 'lightning' },
    look: {
      skin: '#f0c7a6', top: 'armor', topColor: '#1d8a99', topColor2: '#0c4a55', trim: '#e2b64a', sleeve: 'none',
      pants: '#13353f', pantsStyle: 'tight', boots: '#c79a35', wraps: null, gloves: '#c79a35', belt: '#e2b64a',
      sash: '#1d8a99', hair: { style: 'ponytail', color: '#1a1420' }, female: true
    }
  },
  granite: {
    id: 'granite', name: 'GRANITE', title: 'The Living Quarry', home: 'forge',
    bio: 'Carved from a mountain and woken by a war no one remembers.',
    hp: 1080, power: 1.07, speed: 0.86, scale: 1.14,
    body: { ...BODY, torso: 110, neck: 7, head: 23, upperArm: 56, foreArm: 54, thigh: 64, shin: 60, bulk: 1.34 },
    special: { type: 'slam', name: 'Fault Line', dmg: 104, cooldown: 80 },
    element: { core: '#ffe7b0', glow: '#ff8a3c', deep: '#7a3a12', name: 'stone' },
    look: {
      skin: '#7d7a73', stone: true, top: 'stone', topColor: '#6c6962', topColor2: '#46443f', sleeve: 'none',
      pants: '#3b3732', pantsStyle: 'tight', boots: null, wraps: null, belt: '#4e3b26', moss: '#56702f',
      sash: null, hair: { style: 'none', color: '#000' }, glowEyes: '#ff9a3c', cracks: '#ff8a3c'
    }
  },
  shade: {
    id: 'shade', name: 'SHADE', title: 'Whisper of the Grove', home: 'grove',
    bio: 'An assassin from a clan that left no records. Not even her name is real.',
    hp: 940, power: 1.0, speed: 1.08, scale: 1.0,
    body: { ...BODY, torso: 104, upperArm: 52, foreArm: 49, thigh: 69, shin: 67, bulk: 0.9 },
    special: { type: 'teleport', name: 'Shadow Step', dmg: 90, cooldown: 70 },
    element: { core: '#e9ffd6', glow: '#7dff8a', deep: '#14532d', name: 'shadow' },
    look: {
      skin: '#d7b199', top: 'wrap', topColor: '#22262b', topColor2: '#121417', trim: '#3f8f5a', sleeve: 'long',
      pants: '#1b1e22', pantsStyle: 'tight', boots: '#101214', wraps: '#2c3137', belt: '#3f8f5a',
      sash: '#3f8f5a', hair: { style: 'mask', color: '#1a1d21' }, mask: '#1a1d21', glowEyes: '#9dff7a', female: true
    }
  },
  malrath: {
    id: 'malrath', name: 'MALRATH', title: 'Sovereign of Ash', home: 'throne', boss: true,
    bio: 'He built the tournament. He has never lost it.',
    hp: 1180, power: 1.06, speed: 0.95, scale: 1.24,
    body: { ...BODY, torso: 110, neck: 10, head: 23, upperArm: 56, foreArm: 53, thigh: 70, shin: 68, bulk: 1.2 },
    special: { type: 'sovereign', name: 'Ashfall', dmg: 98, cooldown: 64, speed: 11.5, kind: 'void' },
    element: { core: '#ffe2f6', glow: '#c04dff', deep: '#4c0f6e', name: 'void' },
    look: {
      skin: '#a46a62', top: 'plate', topColor: '#2a1418', topColor2: '#14090c', trim: '#c9a227', sleeve: 'none',
      pants: '#231014', pantsStyle: 'tight', boots: '#2a1418', gloves: '#2a1418', wraps: null, belt: '#c9a227',
      sash: '#8e1023', hair: { style: 'horns', color: '#e9dfc8' }, glowEyes: '#ff5ad1', cape: '#5e0b1b'
    }
  }
};

export const ROSTER = ['kael', 'ember', 'volta', 'granite', 'shade'];
export const BOSS_ID = 'malrath';

/* ------------------------------------------------------------------ stages */
export const STAGES = {
  temple: { id: 'temple', name: 'Dusk Temple',   key: '#ffc58a', rim: '#ff5a8a', ambient: '#2b1630', reflect: 0.0 },
  bridge: { id: 'bridge', name: 'Moon Bridge',   key: '#c9dcff', rim: '#7aa8ff', ambient: '#0d1730', reflect: 0.0 },
  forge:  { id: 'forge',  name: 'Ember Forge',   key: '#ffb070', rim: '#ff4d1a', ambient: '#2a0f08', reflect: 0.08 },
  spire:  { id: 'spire',  name: 'Storm Spire',   key: '#d6f6ff', rim: '#3fd7ff', ambient: '#0b1f2a', reflect: 0.22 },
  grove:  { id: 'grove',  name: 'Shadow Grove',  key: '#c8ffd8', rim: '#5dffa0', ambient: '#06160f', reflect: 0.0 },
  throne: { id: 'throne', name: 'Throne of Ash', key: '#ffb0a0', rim: '#c04dff', ambient: '#1a0612', reflect: 0.26 }
};

/* ----------------------------------------------------------- difficulty
   One continuous dial, d in [0, 1], drives every AI parameter. It climbs a
   little every level -- never a cliff -- and the boss gets a fixed bump.
   Losing the same level repeatedly eases it ("mercy"), capped so the game
   cannot be farmed into a pushover.                                       */
export const MERCY_STEP = 0.35;     // levels of difficulty forgiven per consecutive loss
export const MERCY_MAX = 1.4;
/* Curve shape: d = x^gamma over `ramp` levels. gamma < 1 front-loads the
   (still trivial) opening levels and keeps every later step small, which
   is where a step decides fights. Tuned by tests/crimson-balance.mjs.  */
export const CURVE = { ramp: 34, gamma: 0.55, boss: -0.12 };

export function difficultyFor(level, losses = 0, boss = false) {
  const mercy = Math.min(MERCY_MAX, losses * MERCY_STEP);
  const eff = Math.max(1, level - mercy);
  let d = Math.pow(clamp((eff - 1) / (CURVE.ramp - 1), 0, 1), CURVE.gamma);
  // the boss's own kit (size, reach, health) is the step up; offset it
  if (boss) d = clamp(d + CURVE.boss, 0, 1);
  const over = clamp((eff - CURVE.ramp) / 10, 0, 1); // endless overflow: slow, damage only
  // Reflex dials stop at "very strong human", not "frame-perfect machine";
  // the late ladder leans on damage instead, which degrades smoothly.
  return {
    d,
    reaction: Math.round(lerp(42, 12, d)),           // ticks before the AI "sees" you
    think: Math.round(lerp(46, 12, d)),              // ticks between decisions
    aggression: lerp(0.12, 0.7, d),
    block: lerp(0.04, 0.66, d),                      // chance to block an attack it saw
    antiAir: lerp(0.0, 0.66, d),
    punish: lerp(0.0, 0.7, d),
    combo: lerp(0.0, 0.9, d),                        // chance to continue a string
    special: lerp(0.03, 0.3, d),
    lows: lerp(0.08, 0.42, d),                       // mixes in sweeps against blockers
    whiff: lerp(0.45, 0.06, d),                      // random mistakes
    finisher: lerp(0.15, 1, d),
    aiDamage: lerp(0.5, 1.15, d) * (1 + over * 0.25),
    playerDamage: lerp(1.5, 0.92, d),
    speed: lerp(0.86, 1.04, d)
  };
}

export const TIERS = [
  [1, 'Novice'], [3, 'Apprentice'], [5, 'Warrior'], [7, 'Veteran'],
  [9, 'Master'], [11, 'Grandmaster'], [14, 'Legend'], [17, 'Nightmare']
];
export function tierName(level) {
  let name = TIERS[0][1];
  for (const [l, n] of TIERS) if (level >= l) name = n;
  return name;
}

/* ------------------------------------------------------------------ ladder
   Levels 1-9 cycle through the other four fighters in a fixed per-character
   order; 10 is the boss. Past 10 the ladder is endless: anyone (mirror
   matches included) with the boss every fifth level.                      */
export function opponentFor(playerId, level) {
  if (level === LADDER_LENGTH || (level > LADDER_LENGTH && level % 5 === 0)) return BOSS_ID;
  const others = ROSTER.filter((id) => id !== playerId);
  const shift = ROSTER.indexOf(playerId);
  if (level < LADDER_LENGTH) return others[(level - 1 + shift) % others.length];
  return ROSTER[(level * 3 + shift) % ROSTER.length];
}

export function stageFor(opponentId, level) {
  const f = FIGHTERS[opponentId];
  return f ? f.home : Object.keys(STAGES)[level % 6];
}
