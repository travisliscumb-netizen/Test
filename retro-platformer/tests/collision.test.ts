import { describe, expect, it } from "vitest";
import { moveX, moveY, overlaps, overlapsSolid, standingOnSolid, type Body, type SolidGrid } from "../src/world/collision";
import { TILE } from "../src/tuning";

/** Builds a grid from rows of '#' (solid) and '.' (empty); outside is empty. */
function grid(rows: string[]): SolidGrid {
  return {
    isSolid(tx, ty) {
      return rows[ty]?.[tx] === "#";
    },
  };
}

const floor = grid([
  "..........",
  "..........",
  "..........",
  "##########",
]);

describe("moveY", () => {
  it("lands flush on a floor and reports the cells hit", () => {
    const b: Body = { x: 40, y: 50, w: 20, h: 28 };
    const r = moveY(floor, b, 20);
    expect(r.blocked).toBe(1);
    expect(b.y + b.h).toBe(3 * TILE);
    expect(r.cells).toEqual([{ tx: 1, ty: 3 }]);
  });

  it("reports both cells when straddling a seam", () => {
    const b: Body = { x: 54, y: 60, w: 20, h: 28 };
    const r = moveY(floor, b, 10);
    expect(r.cells).toEqual([
      { tx: 1, ty: 3 },
      { tx: 2, ty: 3 },
    ]);
  });

  it("does not tunnel through a one-tile floor at extreme speed", () => {
    const thin = grid(["....", "....", "####", "....", "...."]);
    const b: Body = { x: 10, y: 0, w: 20, h: 28 };
    const r = moveY(thin, b, 500);
    expect(r.blocked).toBe(1);
    expect(b.y + b.h).toBe(2 * TILE);
  });

  it("stops at a ceiling and reports it", () => {
    const ceil = grid(["####", "....", "....", "...."]);
    const b: Body = { x: 10, y: 50, w: 20, h: 28 };
    const r = moveY(ceil, b, -40);
    expect(r.blocked).toBe(-1);
    expect(b.y).toBe(TILE);
    expect(r.cells).toEqual([{ tx: 0, ty: 0 }]);
  });

  it("moves freely when nothing is in the way", () => {
    const b: Body = { x: 10, y: 0, w: 20, h: 28 };
    expect(moveY(floor, b, 30).blocked).toBe(0);
    expect(b.y).toBe(30);
  });
});

describe("moveX", () => {
  const wall = grid([
    ".....#....",
    ".....#....",
    ".....#....",
    "##########",
  ]);

  it("stops flush against a wall moving right", () => {
    const b: Body = { x: 100, y: 3 * TILE - 28, w: 20, h: 28 };
    const r = moveX(wall, b, 50);
    expect(r.blocked).toBe(1);
    expect(b.x + b.w).toBe(5 * TILE);
  });

  it("stops flush against a wall moving left", () => {
    const b: Body = { x: 6 * TILE + 10, y: 3 * TILE - 28, w: 20, h: 28 };
    const r = moveX(wall, b, -50);
    expect(r.blocked).toBe(-1);
    expect(b.x).toBe(6 * TILE);
  });

  it("does not snag on floor seams while walking", () => {
    const b: Body = { x: 0, y: 3 * TILE - 28, w: 20, h: 28 };
    for (let i = 0; i < 60; i++) expect(moveX(floor, b, 3.125).blocked).toBe(0);
    expect(b.x).toBe(60 * 3.125);
  });

  it("does not tunnel through a one-tile wall at extreme speed", () => {
    const b: Body = { x: 0, y: 3 * TILE - 28, w: 20, h: 28 };
    const r = moveX(wall, b, 1000);
    expect(r.blocked).toBe(1);
    expect(b.x + b.w).toBe(5 * TILE);
  });

  it("ignores cells already overlapped so an embedded body can walk out", () => {
    // Body embedded in the wall column (e.g. after growing under a ledge).
    const b: Body = { x: 5 * TILE - 6, y: 3 * TILE - 28, w: 20, h: 28 };
    expect(moveX(wall, b, -4).blocked).toBe(0);
    expect(b.x).toBe(5 * TILE - 10);
  });

  it("treats a body exactly touching a wall as not overlapping it", () => {
    const b: Body = { x: 5 * TILE - 20, y: 3 * TILE - 28, w: 20, h: 28 };
    expect(overlapsSolid(wall, b.x, b.y, b.w, b.h)).toBe(false);
    expect(moveX(wall, b, 1).blocked).toBe(1);
    expect(b.x).toBe(5 * TILE - 20);
  });
});

describe("helpers", () => {
  it("standingOnSolid is exact", () => {
    expect(standingOnSolid(floor, { x: 10, y: 3 * TILE - 28, w: 20, h: 28 })).toBe(true);
    expect(standingOnSolid(floor, { x: 10, y: 3 * TILE - 29, w: 20, h: 28 })).toBe(false);
  });

  it("overlaps excludes touching edges", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
  });
});
