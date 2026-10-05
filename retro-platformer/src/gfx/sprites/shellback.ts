import { PixelCanvas, flipY, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE, type SpriteSheet } from "../palette";

/**
 * Shellback: a snail whose spiral shell can be kicked. Walking frames are
 * 32×40, shell frames 32×32; all have feet on the bottom row and face left.
 */
export type ShellbackFrame = "walk0" | "walk1" | "shell" | "peek" | "flipped";

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.shell[0], // 2
  RAMP.shell[1], // 3
  RAMP.shell[2], // 4
  RAMP.shell[3], // 5
  RAMP.slug[0], // 6
  RAMP.slug[1], // 7
  RAMP.slug[2], // 8
  RAMP.slug[3], // 9
  WHITE, // 10
] as const;

const WHITE_INDEX = 10;

/** Spiral shell occupying a 26×24 box at (x, y). */
function spiral(pc: PixelCanvas, x: number, y: number): void {
  pc.ellipse(x, y, 26, 24, 3);
  pc.ellipse(x + 2, y + 1, 21, 19, 4);
  pc.ellipse(x + 5, y + 2, 12, 8, 5);
  // Spiral groove.
  const cx = x + 13;
  const cy = y + 12;
  for (let t = 0; t < Math.PI * 3.2; t += 0.12) {
    const r = 2 + t * 1.15;
    pc.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.92), 2);
  }
  pc.rect(x + 3, y + 19, 20, 3, 2);
  pc.set(x + 7, y + 4, WHITE_INDEX);
}

function walker(stretch: 0 | 1): IndexedImage {
  const pc = new PixelCanvas(32, 40);
  // Foot: a long slug body along the ground.
  pc.rect(2 - stretch, 33, 28 + stretch, 5, 7);
  pc.hline(2 - stretch, 29, 37, 6);
  pc.hline(3, 28, 33, 8);
  // Shell riding on the back.
  spiral(pc, 5, 10);
  // Head and neck rising at the front (left), drawn over the shell's rim.
  pc.ellipse(1 - stretch, 21, 11, 15, 8);
  pc.ellipse(3 - stretch, 23, 5, 8, 9);
  // Eye stalks.
  pc.line(4 - stretch, 22, 2 - stretch, 13 + stretch, 7, 2);
  pc.line(8 - stretch, 22, 10 - stretch, 13 + stretch, 7, 2);
  for (const ex of [2 - stretch, 10 - stretch]) {
    pc.rect(ex - 1, 10 + stretch, 4, 4, WHITE_INDEX);
    pc.rect(ex, 11 + stretch, 2, 2, 1);
  }
  pc.hline(3 - stretch, 6 - stretch, 30, 1);
  pc.outline(1);
  return pc.toImage();
}

function shell(peek: boolean): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  if (peek) {
    pc.rect(5, 26, 4, 3, 8);
    pc.rect(23, 26, 4, 3, 8);
  }
  spiral(pc, 3, 6);
  if (peek) {
    pc.rect(5, 22, 3, 3, WHITE_INDEX);
    pc.set(6, 23, 1);
  }
  pc.outline(1);
  return pc.toImage();
}

export function buildShellback(): SpriteSheet<ShellbackFrame> {
  const closed = shell(false);
  return {
    palette: PALETTE,
    frames: { walk0: walker(0), walk1: walker(1), shell: closed, peek: shell(true), flipped: flipY(closed) },
  };
}
