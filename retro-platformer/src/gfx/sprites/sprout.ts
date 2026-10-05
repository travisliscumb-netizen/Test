import { PixelCanvas, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/** The grow power-up: a glowing seed with a fresh sprout. 32×32, base on the bottom row. */
export type SproutFrame = "sprout0" | "sprout1";

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.shell[1], // 2
  RAMP.shell[2], // 3
  RAMP.shell[3], // 4
  RAMP.gold[4], // 5
  RAMP.leaf[1], // 6
  RAMP.leaf[2], // 7
  RAMP.leaf[3], // 8
  WHITE, // 9
  RAMP.scarf[2], // 10
] as const;

function sprout(flutter: 0 | 1): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  // Seed body.
  pc.ellipse(5, 11, 22, 19, 2);
  pc.ellipse(7, 12, 17, 15, 3);
  pc.ellipse(9, 13, 9, 7, 4);
  pc.rect(11, 14, 3, 2, 5);
  // Face.
  pc.rect(11, 19, 2, 3, 1);
  pc.rect(19, 19, 2, 3, 1);
  pc.set(11, 19, 9);
  pc.set(19, 19, 9);
  pc.set(9, 23, 10);
  pc.set(22, 23, 10);
  pc.hline(14, 17, 24, 1);
  // Stem and two leaves.
  pc.vline(16, 4, 11, 6);
  pc.vline(17, 5, 11, 7);
  pc.ellipse(5, 3 - flutter, 11, 6, 7);
  pc.ellipse(6, 3 - flutter, 7, 3, 8);
  pc.ellipse(17, 1 + flutter, 11, 6, 7);
  pc.ellipse(19, 1 + flutter, 7, 3, 8);
  pc.line(8, 6 - flutter, 14, 6 - flutter, 6);
  pc.line(19, 4 + flutter, 25, 4 + flutter, 6);
  pc.outline(1);
  return pc.toImage();
}

export function buildSprout(): SpriteSheet<SproutFrame> {
  return { palette: PALETTE, frames: { sprout0: sprout(0), sprout1: sprout(1) } };
}
