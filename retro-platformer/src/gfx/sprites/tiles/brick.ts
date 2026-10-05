import { PixelCanvas, seededRandom, type IndexedImage } from "../../indexed";
import { S } from "./slots";

/** Breakable brick: four courses of shaded bricks in running bond. */
export function buildBrick(): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  const rnd = seededRandom(21);
  pc.rect(0, 0, 32, 32, S.q1);
  for (let course = 0; course < 4; course++) {
    const y = course * 8;
    const offset = course % 2 === 0 ? 0 : -8;
    for (let bx = offset; bx < 32; bx += 16) {
      const x0 = Math.max(bx, 0);
      const x1 = Math.min(bx + 14, 31);
      pc.rect(x0, y, x1 - x0 + 1, 7, S.p2);
      pc.hline(x0, x1, y, S.p3);
      pc.hline(x0, x1, y + 6, S.p1);
      if (bx >= 0) pc.vline(x0, y, y + 5, S.p3);
      if (bx + 14 <= 31) pc.vline(x1, y + 1, y + 6, S.p1);
      if (bx >= 0) pc.set(x0 + 1, y + 1, S.hi);
      // A couple of pits per brick.
      for (let i = 0; i < 2; i++) {
        pc.set(x0 + 2 + Math.floor(rnd() * Math.max(1, x1 - x0 - 3)), y + 2 + Math.floor(rnd() * 3), S.p1);
      }
    }
    pc.hline(0, 31, y + 7, S.q0);
  }
  return pc.toImage();
}

/** Fragments thrown when a brick breaks, two rotations. 12×12, brick palette. */
export function buildBrickDebris(): { debris0: IndexedImage; debris1: IndexedImage } {
  const a = new PixelCanvas(12, 12);
  a.rect(1, 2, 10, 7, S.p2);
  a.hline(1, 10, 2, S.p3);
  a.hline(1, 10, 8, S.p1);
  a.set(2, 3, S.hi);
  a.outline(S.ink);
  const b = new PixelCanvas(12, 12);
  b.polygon([1, 6, 6, 1, 11, 6, 6, 11], S.p2);
  b.line(3, 5, 6, 2, S.p3);
  b.line(6, 10, 9, 7, S.p1);
  b.outline(S.ink);
  return { debris0: a.toImage(), debris1: b.toImage() };
}
