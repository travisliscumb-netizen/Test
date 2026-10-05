import { imageFromRows } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/** Small 9×9 HUD icons, hand-drawn. Key: . transparent, k ink, then the ramps below. */
export type HudIcon = "coin" | "life" | "clock";

const KEY = ".kgGyYwlLsS";
const PALETTE = [
  "transparent",
  INK,
  RAMP.gold[1],
  RAMP.gold[2],
  RAMP.gold[3],
  RAMP.gold[4],
  WHITE,
  RAMP.leaf[1],
  RAMP.leaf[2],
  RAMP.skin[1],
  RAMP.skin[2],
] as const;

export function buildHudIcons(): SpriteSheet<HudIcon> {
  return {
    palette: PALETTE,
    frames: {
      coin: imageFromRows(
        [
          "..kkkk...",
          ".kGYYGk..",
          "kGYwYGgk.",
          "kGYYYGgk.",
          "kGYYYGgk.",
          "kGYYYGgk.",
          ".kGGGgk..",
          "..kkkk...",
          ".........",
        ],
        KEY,
      ),
      life: imageFromRows(
        [
          "....lk...",
          "..kkLkk..",
          ".kLLLLLk.",
          "kLLLLLLLk",
          "kLlSSSSk.",
          "klSSkSkk.",
          ".kSSSSSk.",
          "..kkkkk..",
          ".........",
        ],
        KEY,
      ),
      clock: imageFromRows(
        [
          "..kkkkk..",
          ".kwwwwwk.",
          "kwwwkwwwk",
          "kwwwkwwwk",
          "kwwwkkkwk",
          "kwwwwwwwk",
          ".kwwwwwk.",
          "..kkkkk..",
          ".........",
        ],
        KEY,
      ),
    },
  };
}
