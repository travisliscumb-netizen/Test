import { PixelCanvas, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/**
 * Goal flagpole pieces. `pole` tiles vertically; `finial` sits on top; the
 * pennant hangs to the left of the pole and has two waving frames.
 */
export type FlagFrame = "pole" | "finial" | "pennant0" | "pennant1";

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.steel[0], // 2
  RAMP.steel[1], // 3
  RAMP.steel[2], // 4
  RAMP.steel[3], // 5
  RAMP.gold[1], // 6
  RAMP.gold[2], // 7
  RAMP.gold[3], // 8
  RAMP.leaf[1], // 9
  RAMP.leaf[2], // 10
  RAMP.leaf[3], // 11
  WHITE, // 12
] as const;

/** Pole occupies columns 14..17 of each 32 px tile. */
export const POLE_LEFT = 14;
export const POLE_WIDTH = 4;

function pole(): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  pc.rect(POLE_LEFT, 0, POLE_WIDTH, 32, 3);
  pc.vline(POLE_LEFT, 0, 31, 1);
  pc.vline(POLE_LEFT + 1, 0, 31, 5);
  pc.vline(POLE_LEFT + 3, 0, 31, 2);
  return pc.toImage();
}

function finial(): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  pc.stamp(pole(), 0, 0);
  pc.rect(0, 0, 32, 20, 0);
  pc.ellipse(10, 6, 12, 12, 7);
  pc.ellipse(12, 7, 6, 5, 8);
  pc.set(13, 8, 12);
  pc.rect(13, 17, 6, 3, 6);
  pc.outline(1);
  return pc.toImage();
}

function pennant(wave: 0 | 1): IndexedImage {
  const pc = new PixelCanvas(32, 28);
  // Triangle pointing left from the pole, with a ripple.
  const tip = wave === 0 ? 2 : 4;
  pc.polygon([31, 2, tip, 13 + wave, 31, 25], 10);
  pc.polygon([31, 2, tip + 4, 12 + wave, 31, 10], 11);
  pc.polygon([31, 18, tip + 4, 15 + wave, 31, 25], 9);
  // White leaf emblem.
  pc.polygon([25, 8, 29, 13, 25, 19, 21, 13], 12);
  pc.vline(25, 10, 17, 10);
  pc.outline(1);
  return pc.toImage();
}

export function buildFlag(): SpriteSheet<FlagFrame> {
  return { palette: PALETTE, frames: { pole: pole(), finial: finial(), pennant0: pennant(0), pennant1: pennant(1) } };
}
