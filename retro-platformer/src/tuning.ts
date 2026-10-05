/**
 * Every gameplay constant lives here.
 *
 * Units: distances in art pixels (1 tile = 32 px), velocities in px/frame and
 * accelerations in px/frame² at the fixed 60 Hz step. Values are exact binary
 * fractions (multiples of 1/256) so the simulation is bit-for-bit deterministic.
 */

export const TILE = 32;
export const FIXED_HZ = 60;
export const FIXED_DT_MS = 1000 / FIXED_HZ;
/** Longest real-time gap the loop will try to catch up on (avoids a spiral of death after a stall). */
export const MAX_FRAME_MS = 250;

export const VIEW_HEIGHT = 480; // 15 tiles
export const VIEW_MIN_WIDTH = 512; // 16 tiles
export const VIEW_MAX_WIDTH = 960; // 30 tiles

export function msToFrames(ms: number): number {
  return Math.round(ms / FIXED_DT_MS);
}

export interface JumpTier {
  /** This tier applies while |vx| at takeoff is below this value. */
  readonly belowSpeed: number;
  readonly velocity: number;
  /** Gravity while rising with jump held. */
  readonly holdGravity: number;
  /** Gravity while falling, or rising after jump is released. */
  readonly fallGravity: number;
}

export const PLAYER = {
  small: { width: 20, height: 28 },
  big: { width: 22, height: 44 },

  minWalkSpeed: 38 / 256,
  walkMax: 800 / 256, // 3.125
  runMax: 1312 / 256, // 5.125
  walkAccel: 20 / 256,
  runAccel: 28 / 256,
  /** Ground friction with no direction held, and the bleed-off from run speed back down to walk speed. */
  releaseDecel: 26 / 256,
  skidDecel: 52 / 256,
  /** Skidding starts when reversing on the ground faster than this. */
  skidMinSpeed: 256 / 256,
  airAccel: 20 / 256,
  airRunAccel: 28 / 256,
  airReverseAccel: 40 / 256,

  jumpTiers: [
    { belowSpeed: 512 / 256, velocity: 8, holdGravity: 64 / 256, fallGravity: 224 / 256 },
    { belowSpeed: 1180 / 256, velocity: 8, holdGravity: 60 / 256, fallGravity: 192 / 256 },
    { belowSpeed: Infinity, velocity: 10, holdGravity: 80 / 256, fallGravity: 288 / 256 },
  ] as readonly JumpTier[],
  maxFallSpeed: 9,

  coyoteFrames: msToFrames(100),
  jumpBufferFrames: msToFrames(100),
  /** Head-bonk forgiveness: if a rising head clips a ceiling corner by at most this many px, slide around it. */
  cornerCorrection: 6,

  stompBounce: 8,
  stompBounceHeld: 10,

  hurtInvulnFrames: msToFrames(2000),
  transformFrames: msToFrames(800),
  deathPauseFrames: msToFrames(500),
  deathLaunchSpeed: 10,
  deathGravity: 128 / 256,

  flagSlideSpeed: 4,
  autoWalkSpeed: 2,
} as const;

export const ENEMY = {
  gravity: 128 / 256,
  maxFallSpeed: 8,
  /** Activate enemies this far beyond the right edge of the view. */
  activateMargin: TILE * 2,
  /** Discard entities that fall this far behind the left edge of the view. */
  despawnMargin: TILE * 4,
  /** A falling player counts as stomping if its bottom was within this distance below the enemy top last frame. */
  stompTolerance: 12,

  walker: { width: 24, height: 24, speed: 256 / 256, squashFrames: msToFrames(500) },
  shell: {
    width: 24,
    walkHeight: 30,
    shellHeight: 24,
    speed: 224 / 256,
    kickSpeed: 1792 / 256, // 7
    /** Frames after a kick during which the kicker cannot be hurt by that shell. */
    kickGraceFrames: msToFrames(200),
    reviveFrames: msToFrames(7000),
    wiggleFrames: msToFrames(1500),
  },
  flipLaunchSpeed: 6,
} as const;

export const ITEM = {
  sprout: { width: 24, height: 24, speed: 512 / 256, emergeSpeed: 160 / 256, bounceSpeed: 6 },
  coinPopSpeed: 9,
  coinPopGravity: 192 / 256,
  multiCoinFrames: msToFrames(4000),
  blockBumpFrames: 12,
  blockBumpHeight: 8,
  debrisLaunch: [
    { vx: -2, vy: -11 },
    { vx: 2, vy: -11 },
    { vx: -2, vy: -7 },
    { vx: 2, vy: -7 },
  ],
  debrisGravity: 128 / 256,
} as const;

export const SCORE = {
  coin: 200,
  brick: 50,
  sprout: 1000,
  flipKill: 100,
  /** Consecutive stomps without landing. The final entry is an extra life. */
  stompChain: [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000, "1UP"] as const,
  /** Consecutive kills by one moving shell. */
  shellChain: [500, 800, 1000, 2000, 4000, 5000, 8000, "1UP"] as const,
  shellKick: 400,
  /** Flag grab score by height band, from the top of the pole down. */
  flagBands: [5000, 2000, 800, 400, 100] as const,
  timeBonusPerUnit: 50,
  coinsPerLife: 100,
} as const;

export const RULES = {
  startLives: 3,
  /** One timer unit lasts this many frames (0.4 s). */
  timerUnitFrames: 24,
  hurryAt: 100,
  levelIntroFrames: msToFrames(2500),
  gameOverFrames: msToFrames(4000),
  levelClearHoldFrames: msToFrames(1500),
  /** Timer units converted to score per frame during the end-of-level tally. */
  tallyUnitsPerFrame: 1,
} as const;

export const CAMERA = {
  /** The camera scrolls once the player's centre passes this fraction of the view width. */
  followFraction: 0.4,
} as const;

/** Goal geometry shared by the simulation and the art. */
export const GOAL = {
  /** Horizontal centre of the goal tower's doorway, from the tower's left edge. */
  doorOffset: 64,
  /** While on the pole, the hero's centre sits this far left of the pole's centre. */
  gripOffset: 9,
  /** Delay at the bottom of the pole before hopping off. */
  poleHoldFrames: 20,
  /** Safety limit for the automatic walk to the door. */
  walkOutMaxFrames: 600,
  deathSequenceFrames: msToFrames(3000),
  pitSequenceFrames: msToFrames(2500),
} as const;
