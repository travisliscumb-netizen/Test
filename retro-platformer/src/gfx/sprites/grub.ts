import { PixelCanvas, flipY, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/** Grub: the stompable walker. 32×32 frames, feet on the bottom row. */
export type GrubFrame = "walk0" | "walk1" | "squashed" | "flipped";

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.grub[0], // 2
  RAMP.grub[1], // 3
  RAMP.grub[2], // 4
  RAMP.grub[3], // 5
  RAMP.cream[0], // 6
  RAMP.cream[1], // 7
  RAMP.cream[2], // 8
  WHITE, // 9
  RAMP.ember[1], // 10
] as const;

function body(step: 0 | 1): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  const bob = step;
  // Legs (three pairs, alternating).
  for (const [i, lx] of [7, 14, 21].entries()) {
    const forward = (i + step) % 2 === 0;
    pc.rect(lx + (forward ? 1 : -1), 26, 3, 4, 2);
    pc.rect(lx + (forward ? 2 : -2), 29, 4, 1, 1);
  }
  // Belly.
  pc.ellipse(4, 18 + bob, 24, 10, 7);
  pc.hline(7, 24, 26 + bob, 6);
  // Domed back with segment bands.
  pc.ellipse(3, 7 + bob, 26, 19, 3);
  pc.ellipse(6, 8 + bob, 20, 13, 4);
  pc.ellipse(10, 9 + bob, 9, 5, 5);
  for (const sx of [11, 17, 23]) pc.line(sx, 9 + bob, sx - 3, 20 + bob, 2);
  pc.set(12, 10 + bob, 9);
  // Face on the left (facing left by default; mirrored when walking right).
  pc.ellipse(2, 15 + bob, 13, 10, 7);
  pc.ellipse(3, 16 + bob, 9, 6, 8);
  // Angry eyes.
  pc.rect(4, 16 + bob, 3, 4, 9);
  pc.rect(9, 16 + bob, 3, 4, 9);
  pc.rect(4, 18 + bob, 2, 2, 1);
  pc.rect(9, 18 + bob, 2, 2, 1);
  pc.line(3, 15 + bob, 7, 16 + bob, 1);
  pc.line(12, 15 + bob, 9, 16 + bob, 1);
  // Mandibles.
  pc.rect(3, 23 + bob, 2, 2, 6);
  pc.rect(9, 23 + bob, 2, 2, 6);
  pc.set(6, 22 + bob, 10);
  pc.outline(1);
  return pc.toImage();
}

function squashed(): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  pc.ellipse(2, 21, 28, 10, 3);
  pc.ellipse(5, 22, 22, 6, 4);
  pc.rect(5, 26, 22, 3, 7);
  pc.hline(7, 11, 24, 1);
  pc.hline(15, 19, 24, 1);
  pc.outline(1);
  return pc.toImage();
}

export function buildGrub(): SpriteSheet<GrubFrame> {
  const walk0 = body(0);
  return { palette: PALETTE, frames: { walk0, walk1: body(1), squashed: squashed(), flipped: flipY(walk0) } };
}
