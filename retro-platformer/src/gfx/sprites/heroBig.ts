import type { SpriteSheet } from "../palette";
import { HERO_PALETTE, drawSide, type HeroBuild } from "./heroDraw";
import { HERO_POSES, type HeroPoseName } from "./heroPoses";

/** Big hero: 32×48 frames, feet on the bottom row, facing right. */
export type HeroBigFrame = HeroPoseName;

const BUILD: HeroBuild = { height: 48, headY: 5, torsoTop: 21, hipY: 34, footY: 46, torsoW: 12, armLen: 9 };

export function buildHeroBig(): SpriteSheet<HeroBigFrame> {
  const frames = Object.fromEntries(
    Object.entries(HERO_POSES).map(([name, pose]) => [name, drawSide(BUILD, pose)]),
  ) as Record<HeroPoseName, ReturnType<typeof drawSide>>;
  return { palette: HERO_PALETTE, frames };
}
