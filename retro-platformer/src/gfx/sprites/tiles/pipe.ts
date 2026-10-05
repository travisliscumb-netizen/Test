import { PixelCanvas, type IndexedImage } from "../../indexed";
import { S } from "./slots";

export type PipePiece = "topLeft" | "topRight" | "left" | "right";

/** Cylinder shading across the full 64 px pipe width. */
function shadeAt(x: number): number {
  if (x < 5) return S.p1;
  if (x < 10) return S.p2;
  if (x < 18) return S.p3;
  if (x < 21) return S.hi;
  if (x < 40) return S.p2;
  if (x < 52) return S.p1;
  return S.p0;
}

const LIP_H = 14;
const INSET = 3;

function piece(half: 0 | 1, lip: boolean): IndexedImage {
  const pc = new PixelCanvas(32, 32);
  for (let x = 0; x < 32; x++) {
    const gx = x + half * 32;
    const inBody = gx >= INSET && gx <= 63 - INSET;
    for (let y = 0; y < 32; y++) {
      if (lip && y < LIP_H) pc.set(x, y, shadeAt(gx));
      else if (inBody) pc.set(x, y, shadeAt(Math.round(((gx - INSET) * 63) / (63 - 2 * INSET))));
    }
  }
  if (lip) {
    pc.hline(0, 31, 0, S.ink);
    pc.hline(0, 31, LIP_H - 1, S.ink);
    pc.hline(0, 31, 1, S.hi);
    pc.hline(0, 31, LIP_H - 2, S.p0);
    pc.vline(half === 0 ? 0 : 31, 0, LIP_H - 1, S.ink);
    // Shadow the lip casts on the body.
    for (let x = 0; x < 32; x++) {
      const gx = x + half * 32;
      if (gx > INSET && gx < 63 - INSET) pc.set(x, LIP_H, S.p0);
    }
  }
  const edgeX = half === 0 ? INSET : 31 - INSET;
  pc.vline(edgeX, lip ? LIP_H : 0, 31, S.ink);
  return pc.toImage();
}

export function buildPipe(): Record<PipePiece, IndexedImage> {
  return { topLeft: piece(0, true), topRight: piece(1, true), left: piece(0, false), right: piece(1, false) };
}
