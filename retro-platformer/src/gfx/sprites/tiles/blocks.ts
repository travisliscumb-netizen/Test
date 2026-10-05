import { PixelCanvas, type IndexedImage } from "../../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../../palette";

/** Gold mystery block (4 shimmer frames) and the spent block it turns into. */
export type BlockFrame = "mystery0" | "mystery1" | "mystery2" | "mystery3" | "used";

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.gold[0], // 2
  RAMP.gold[1], // 3
  RAMP.gold[2], // 4
  RAMP.gold[3], // 5
  RAMP.gold[4], // 6
  WHITE, // 7
  "#3e2a1e", // 8 used dark
  "#6a4a32", // 9 used mid
  "#93704e", // 10 used light
] as const;

function bevel(pc: PixelCanvas, dark: number, mid: number, light: number, shadow: number): void {
  pc.rect(0, 0, 32, 32, mid);
  pc.rect(1, 1, 30, 2, light);
  pc.rect(1, 1, 2, 30, light);
  pc.rect(1, 29, 30, 2, dark);
  pc.rect(29, 1, 2, 30, dark);
  pc.set(1, 30, mid);
  pc.set(30, 1, mid);
  for (const [x, y] of [
    [5, 5],
    [25, 5],
    [5, 25],
    [25, 25],
  ] as const) {
    pc.rect(x, y, 2, 2, shadow);
    pc.set(x, y, light);
  }
  pc.hline(0, 31, 0, 1);
  pc.hline(0, 31, 31, 1);
  pc.vline(0, 0, 31, 1);
  pc.vline(31, 0, 31, 1);
}

/** Four-pointed sparkle emblem centred in the block. */
function sparkle(pc: PixelCanvas, color: number, shadow: number): void {
  const draw = (ox: number, oy: number, c: number): void => {
    pc.polygon([16 + ox, 7 + oy, 18 + ox, 14 + oy, 25 + ox, 16 + oy, 18 + ox, 18 + oy, 16 + ox, 25 + oy, 14 + ox, 18 + oy, 7 + ox, 16 + oy, 14 + ox, 14 + oy], c);
  };
  draw(1, 1, shadow);
  draw(0, 0, color);
  pc.rect(15, 15, 2, 2, 7);
}

export function buildBlocks(): SpriteSheet<BlockFrame> {
  const mystery = (emblem: number): IndexedImage => {
    const pc = new PixelCanvas(32, 32);
    bevel(pc, 3, 4, 5, 2);
    sparkle(pc, emblem, 2);
    return pc.toImage();
  };
  const used = new PixelCanvas(32, 32);
  bevel(used, 8, 9, 10, 8);
  return {
    palette: PALETTE,
    frames: { mystery0: mystery(6), mystery1: mystery(7), mystery2: mystery(6), mystery3: mystery(5), used: used.toImage() },
  };
}
