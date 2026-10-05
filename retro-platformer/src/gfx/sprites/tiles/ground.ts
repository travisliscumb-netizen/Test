import { PixelCanvas, seededRandom, type IndexedImage } from "../../indexed";
import { S } from "./slots";

/**
 * Ground tile variants. `top` tiles have open sky above; `L`/`R` mark an
 * exposed left/right side (cliff edges at pits). `fillB` is an alternate
 * texture used to break up repetition.
 */
export const GROUND_VARIANTS = ["top", "topL", "topR", "topLR", "fill", "fillB", "fillL", "fillR", "fillLR"] as const;
export type GroundVariant = (typeof GROUND_VARIANTS)[number];

function soil(pc: PixelCanvas, seed: number): void {
  const rnd = seededRandom(seed);
  pc.rect(0, 0, 32, 32, S.p2);
  // Soft strata.
  for (let y = 0; y < 32; y++) {
    if ((y + seed) % 11 === 0) pc.hline(0, 31, y, S.p1);
  }
  // Pebbles with a lit top-left pixel.
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rnd() * 28);
    const y = Math.floor(rnd() * 28) + 2;
    const w = 3 + Math.floor(rnd() * 3);
    pc.ellipse(x, y, w, 3, S.p1);
    pc.set(x + 1, y, S.p3);
  }
  // Specks.
  for (let i = 0; i < 14; i++) {
    pc.set(Math.floor(rnd() * 32), Math.floor(rnd() * 32), rnd() < 0.5 ? S.p0 : S.p3);
  }
}

function grassTop(pc: PixelCanvas): void {
  const rnd = seededRandom(7);
  const heights = Array.from({ length: 32 }, (_, x) => [0, 1, 2, 1, 0, 1, 1, 0][x % 8]!);
  for (let x = 0; x < 32; x++) {
    const top = heights[x]!;
    pc.vline(x, top, 8, S.q2);
    pc.set(x, top, S.q3);
    if (top > 0) pc.set(x, top - 1, S.ink);
    pc.vline(x, 9, 10, S.q1);
    // Roots dripping into the soil.
    if (rnd() < 0.3) pc.vline(x, 11, 11 + Math.floor(rnd() * 3), S.q0);
  }
  // Blade highlights.
  for (let x = 2; x < 32; x += 5) pc.set(x, heights[x]! + 2, S.hi);
  pc.hline(0, 31, 11, S.p0);
}

function edge(pc: PixelCanvas, side: "L" | "R", top: boolean): void {
  const outer = side === "L" ? 0 : 31;
  const inner = side === "L" ? 1 : 30;
  const from = top ? 3 : 0;
  pc.vline(outer, from, 31, S.ink);
  pc.vline(inner, from, 31, S.p0);
  if (top) {
    // Grass curls over the corner.
    pc.vline(outer, 1, 8, S.q1);
    pc.vline(inner, 0, 10, S.q2);
    pc.set(outer, 0, S.ink);
    pc.vline(side === "L" ? 2 : 29, 9, 12, S.q0);
  }
}

export function buildGround(): Record<GroundVariant, IndexedImage> {
  const make = (top: boolean, left: boolean, right: boolean, seed: number): IndexedImage => {
    const pc = new PixelCanvas(32, 32);
    soil(pc, seed);
    if (top) grassTop(pc);
    if (left) edge(pc, "L", top);
    if (right) edge(pc, "R", top);
    return pc.toImage();
  };
  return {
    top: make(true, false, false, 3),
    topL: make(true, true, false, 3),
    topR: make(true, false, true, 3),
    topLR: make(true, true, true, 3),
    fill: make(false, false, false, 3),
    fillB: make(false, false, false, 11),
    fillL: make(false, true, false, 3),
    fillR: make(false, false, true, 3),
    fillLR: make(false, true, true, 3),
  };
}
