import { PixelCanvas, type IndexedImage } from "../../indexed";
import { S } from "./slots";

/** Unbreakable bevelled stone block used for stairs and walls. */
export function buildStone(): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  pc.rect(0, 0, 32, 32, S.p2);
  // Bevel: lit top-left, shaded bottom-right.
  pc.polygon([1, 1, 31, 1, 27, 5, 5, 5, 5, 27, 1, 31], S.p3);
  pc.polygon([31, 1, 31, 31, 1, 31, 5, 27, 27, 27, 27, 5], S.p1);
  pc.rect(5, 5, 22, 22, S.p2);
  pc.line(1, 1, 5, 5, S.hi);
  pc.line(27, 27, 30, 30, S.p0);
  // Chisel marks on the face.
  pc.line(9, 10, 13, 14, S.p1);
  pc.line(18, 19, 22, 21, S.p1);
  pc.set(9, 9, S.p3);
  pc.set(18, 18, S.p3);
  // Outline every edge so stacked blocks read as a grid.
  pc.hline(0, 31, 0, S.ink);
  pc.hline(0, 31, 31, S.ink);
  pc.vline(0, 0, 31, S.ink);
  pc.vline(31, 0, 31, S.ink);
  return pc.toImage();
}
