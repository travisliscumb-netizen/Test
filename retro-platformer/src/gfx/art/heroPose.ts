/**
 * Turns the hero's physical state into a skeletal pose. Pure maths, no
 * drawing: angles are in radians, 0 = limb hanging straight down, positive =
 * swung forward (toward the facing direction).
 */

export type HeroForm = "small" | "big";

export interface Limb {
  /** Upper segment angle (thigh / upper arm). */
  swing: number;
  /** Bend at the joint: legs fold back at the knee, arms fold forward at the elbow. */
  bend: number;
}

export interface HeroPose {
  form: HeroForm;
  /** Whole-body lean, positive = forward. */
  lean: number;
  /** Vertical scale: < 1 squashed (landing), > 1 stretched (take-off). */
  stretch: number;
  frontLeg: Limb;
  backLeg: Limb;
  frontArm: Limb;
  backArm: Limb;
  /** Bandana flutter phase and how far it streams out behind (0..1). */
  bandanaPhase: number;
  bandanaLift: number;
  /** Front hand tucked in the hoodie pocket (strolling, standing). */
  pocket: boolean;
  /** 0 = eyes open, 1 = shut. */
  blink: number;
  dizzy: boolean;
  /** Head tilt in radians (a cocky lean of the chin). */
  tilt: number;
  /** True when standing on the ground: the lowest foot is planted at y = 0. */
  planted: boolean;
}

export interface HeroState {
  form: HeroForm;
  onGround: boolean;
  vx: number;
  vy: number;
  skidding: boolean;
  /** Distance walked, drives the run cycle. */
  stride: number;
  /** Global frame counter, drives idle motion and blinking. */
  frame: number;
  /** Frames since the hero last landed (large if long ago). */
  sinceLanding: number;
  /** Frames since the hero last jumped (large if long ago). */
  sinceJump: number;
  mode: "normal" | "pole" | "dead";
}

const STRIDE_LENGTH = 52;
/** At or below this speed Bud strolls with a hand in his pocket; above it he runs. */
const STROLL_SPEED = 3.2;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function heroPose(s: HeroState): HeroPose {
  const speed = Math.abs(s.vx);
  const blinkCycle = s.frame % 200;
  const blink = blinkCycle < 6 ? Math.sin((blinkCycle / 6) * Math.PI) : 0;
  const base: HeroPose = {
    form: s.form,
    lean: 0,
    stretch: 1,
    frontLeg: { swing: 0.12, bend: 0.1 },
    backLeg: { swing: -0.12, bend: 0.1 },
    frontArm: { swing: 0.15, bend: 0.35 },
    backArm: { swing: -0.1, bend: 0.3 },
    bandanaPhase: s.frame * 0.12,
    bandanaLift: 0.1,
    pocket: true,
    blink,
    dizzy: false,
    tilt: 0,
    planted: s.onGround,
  };

  if (s.mode === "dead") {
    return {
      ...base,
      frontArm: { swing: 1.9, bend: -0.5 },
      backArm: { swing: -2.3, bend: 0.5 },
      frontLeg: { swing: 0.5, bend: 1.2 },
      backLeg: { swing: -0.4, bend: 0.6 },
      blink: 0,
      dizzy: true,
      pocket: false,
      bandanaLift: 0.6,
      planted: false,
    };
  }

  if (s.mode === "pole") {
    return {
      ...base,
      frontArm: { swing: 1.95, bend: 0.25 },
      backArm: { swing: 1.7, bend: 0.3 },
      frontLeg: { swing: 0.9, bend: 1.5 },
      backLeg: { swing: 0.5, bend: 1.2 },
      pocket: false,
      bandanaLift: 0.3,
      planted: false,
    };
  }

  if (!s.onGround) {
    // Rising: tuck the front knee and punch upward; falling: legs reach for the ground.
    const rise = clamp(-s.vy / 9, -1, 1);
    const stretch = s.sinceJump < 8 ? 1 + 0.12 * (1 - s.sinceJump / 8) : 1;
    return {
      ...base,
      lean: 0.08,
      stretch,
      frontLeg: { swing: 0.75 + rise * 0.25, bend: 1.1 + rise * 0.4 },
      backLeg: { swing: -0.35 - rise * 0.1, bend: 0.25 },
      frontArm: rise > 0 ? { swing: 2.05, bend: 0.15 } : { swing: 1.4, bend: 0.2 },
      pocket: false,
      backArm: { swing: -0.9, bend: 0.4 },
      bandanaLift: 0.5 + Math.min(0.5, speed / 8),
      bandanaPhase: s.frame * 0.25,
      planted: false,
    };
  }

  const squash = s.sinceLanding < 8 ? 1 - 0.16 * (1 - s.sinceLanding / 8) : 1;

  if (s.skidding) {
    return {
      ...base,
      lean: -0.28,
      stretch: squash,
      frontLeg: { swing: 0.75, bend: 0.05 },
      backLeg: { swing: 0.1, bend: 0.9 },
      frontArm: { swing: 1.6, bend: 0.2 },
      backArm: { swing: -1.2, bend: 0.3 },
      pocket: false,
      bandanaLift: 0.8,
      bandanaPhase: s.frame * 0.3,
    };
  }

  if (speed === 0) {
    const breathe = Math.sin(s.frame * 0.06);
    return {
      ...base,
      // Standing easy: leaning back a touch, chin up, one hand in the pocket.
      lean: -0.05,
      tilt: -0.06 + breathe * 0.02,
      stretch: squash * (1 + breathe * 0.012),
      frontArm: { swing: 0.15 + breathe * 0.04, bend: 0.35 },
      backArm: { swing: -0.05 - breathe * 0.04, bend: 0.2 },
    };
  }

  // Walking is a stroll (hand stays in the pocket, a little bounce); running pumps both arms.
  const phase = (s.stride / STRIDE_LENGTH) * TAU;
  const amp = clamp(0.35 + speed * 0.12, 0.35, 0.95);
  const sw = Math.sin(phase);
  const cw = Math.cos(phase);
  const strolling = speed <= STROLL_SPEED;
  return {
    ...base,
    lean: strolling ? -0.02 : 0.06 + speed * 0.025,
    tilt: strolling ? -0.05 + Math.abs(sw) * 0.04 : 0,
    stretch: squash,
    frontLeg: { swing: sw * amp, bend: 0.2 + Math.max(0, -cw) * 1.3 * amp },
    backLeg: { swing: -sw * amp, bend: 0.2 + Math.max(0, cw) * 1.3 * amp },
    frontArm: { swing: -sw * amp * 1.1, bend: 0.7 + amp * 0.5 },
    backArm: { swing: sw * amp * (strolling ? 0.6 : 1.1), bend: strolling ? 0.3 : 0.7 + amp * 0.5 },
    pocket: strolling,
    bandanaLift: clamp(speed / 5, 0.2, 1),
    bandanaPhase: s.frame * (0.15 + speed * 0.05),
  };
}
