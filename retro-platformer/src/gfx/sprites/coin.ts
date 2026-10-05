import { PixelCanvas, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/** Spinning coin, 4 frames, centred in a 32×32 cell. */
export type CoinFrame = "coin0" | "coin1" | "coin2" | "coin3";

const PALETTE = ["transparent", INK, RAMP.gold[0], RAMP.gold[1], RAMP.gold[2], RAMP.gold[3], RAMP.gold[4], WHITE] as const;

function coin(width: number, face: boolean): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  const h = 22;
  const x = 16 - Math.floor(width / 2);
  const y = 5;
  pc.ellipse(x, y, width, h, 3);
  if (width >= 6) {
    pc.ellipse(x + 1, y + 1, width - 2, h - 2, 4);
    pc.ellipse(x + 1, y + 1, Math.max(2, width - 5), h - 4, 5);
  }
  if (face) {
    // Embossed leaf.
    pc.polygon([16, 10, 20, 15, 16, 22, 12, 15], 3);
    pc.vline(16, 12, 20, 2);
    pc.set(13, 14, 6);
  }
  pc.vline(x + 1, y + 5, y + 9, 7);
  pc.outline(1);
  return pc.toImage();
}

export function buildCoin(): SpriteSheet<CoinFrame> {
  return {
    palette: PALETTE,
    frames: { coin0: coin(16, true), coin1: coin(10, false), coin2: coin(4, false), coin3: coin(10, false) },
  };
}
