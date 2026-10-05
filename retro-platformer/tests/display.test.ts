import { describe, expect, it } from "vitest";
import { placeView, viewWidthFor } from "../src/core/display";
import { VIEW_HEIGHT, VIEW_MAX_WIDTH, VIEW_MIN_WIDTH } from "../src/tuning";

describe("viewWidthFor", () => {
  it("follows the aspect ratio at a fixed height", () => {
    expect(viewWidthFor(1280, 720)).toBe(854);
    expect(viewWidthFor(640, 480)).toBe(640);
  });

  it("clamps to the supported range and stays even", () => {
    expect(viewWidthFor(390, 844)).toBe(VIEW_MIN_WIDTH); // portrait phone
    expect(viewWidthFor(3440, 1000)).toBe(VIEW_MAX_WIDTH); // ultrawide
    expect(viewWidthFor(844, 390) % 2).toBe(0);
    expect(viewWidthFor(0, 0)).toBe(VIEW_MIN_WIDTH);
  });
});

describe("placeView", () => {
  it("fills a landscape phone edge to edge vertically", () => {
    const w = viewWidthFor(844, 390);
    const p = placeView(w, VIEW_HEIGHT, 2532, 1170, 0);
    expect(p.height).toBe(1170);
    expect(p.y).toBe(0);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(2532);
  });

  it("letterboxes a too-wide screen and centres horizontally", () => {
    const p = placeView(VIEW_MAX_WIDTH, VIEW_HEIGHT, 4000, 1000, 0);
    expect(p.height).toBe(1000);
    expect(p.x).toBe(Math.floor((4000 - p.width) / 2));
  });

  it("pins the game near the top in portrait, below the safe-area inset", () => {
    const p = placeView(VIEW_MIN_WIDTH, VIEW_HEIGHT, 1170, 2532, 141);
    expect(p.width).toBe(1170);
    expect(p.y).toBeGreaterThanOrEqual(141);
    expect(p.y + p.height).toBeLessThan(2532 * 0.6);
  });
});
