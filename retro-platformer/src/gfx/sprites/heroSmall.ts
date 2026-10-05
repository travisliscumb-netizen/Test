import type { SpriteSheet } from "../palette";
import { HERO_PALETTE, drawFront, drawSide, type HeroBuild } from "./heroDraw";
import { HERO_POSES, type HeroPoseName } from "./heroPoses";

/** Small hero: 32×32 frames, feet on the bottom row, facing right. */
export type HeroSmallFrame = HeroPoseName | "dead0" | "dead1";

const BUILD: HeroBuild = { height: 32, headY: 5, torsoTop: 20, hipY: 25, footY: 30, torsoW: 10, armLen: 6 };

export function buildHeroSmall(): SpriteSheet<HeroSmallFrame> {
  const side = Object.fromEntries(
    Object.entries(HERO_POSES).map(([name, pose]) => [name, drawSide(BUILD, pose)]),
  ) as Record<HeroPoseName, ReturnType<typeof drawSide>>;
  return {
    palette: HERO_PALETTE,
    frames: { ...side, dead0: drawFront(BUILD, true), dead1: drawFront(BUILD, false) },
  };
}
