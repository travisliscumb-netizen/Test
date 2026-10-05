import type { SidePose } from "./heroDraw";

/** Side-view key poses shared by both hero forms. */
export const HERO_POSES = {
  idle: { frontFoot: 2, backFoot: -2, frontLift: 0, backLift: 0, bob: 0, handX: 1, handY: 5, scarf: 0 },
  run0: { frontFoot: 5, backFoot: -5, frontLift: 0, backLift: 1, bob: 0, handX: -3, handY: 4, scarf: 1 },
  run1: { frontFoot: -1, backFoot: 2, frontLift: 0, backLift: 4, bob: -1, handX: 0, handY: 5, scarf: 2 },
  run2: { frontFoot: -5, backFoot: 5, frontLift: 1, backLift: 0, bob: 0, handX: 4, handY: 3, scarf: 3 },
  run3: { frontFoot: 2, backFoot: -1, frontLift: 4, backLift: 0, bob: -1, handX: 1, handY: 5, scarf: 2 },
  jump: { frontFoot: 4, backFoot: -4, frontLift: 5, backLift: 0, bob: 0, handX: 6, handY: -3, scarf: 1 },
  skid: { frontFoot: -4, backFoot: -7, frontLift: 0, backLift: 1, bob: 0, handX: 6, handY: 1, scarf: 3, lean: -3 },
  pole: { frontFoot: 2, backFoot: 0, frontLift: 4, backLift: 2, bob: 0, handX: 6, handY: -4, scarf: 0 },
} as const satisfies Record<string, SidePose>;

export type HeroPoseName = keyof typeof HERO_POSES;
