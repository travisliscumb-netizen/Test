import { describe, expect, it } from "vitest";
import { frameInsets, placeView, viewWidthFor } from "../src/core/display";
import { VIEW_HEIGHT, VIEW_MAX_WIDTH, VIEW_MIN_WIDTH } from "../src/tuning";

describe("viewWidthFor", () => {
  it("follows the aspect ratio at a fixed height", () => {
    expect(viewWidthFor(1280, 720)).toBe(854);
    expect(viewWidthFor(640, 480)).toBe(640);
  });

  it.each([
    ["iPhone SE", 667, 375],
    ["iPhone 15", 852, 393],
    ["iPhone 15 Pro Max", 932, 430],
    ["Android 20:9", 915, 412],
  ])("a %s held sideways fills the whole screen (no side bars)", (_name, w, h) => {
    const view = viewWidthFor(w, h);
    expect(view).toBeLessThan(VIEW_MAX_WIDTH);
    const p = placeView(view, VIEW_HEIGHT, w * 3, h * 3, 0);
    expect(p.clip).toEqual({ x: 0, y: 0, width: w * 3, height: h * 3 });
  });

  it("shows about twice as much level sideways as upright", () => {
    expect(viewWidthFor(852, 393) / viewWidthFor(393, 852)).toBeGreaterThan(1.9);
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
    expect(p.x).toBe(Math.floor((4000 - p.width) / 2));
    expect(p.clip.x).toBe(p.x);
    expect(p.clip.width).toBe(p.width);
  });

  it("makes every tile a whole number of device pixels", () => {
    for (const [w, h] of [
      [2532, 1170],
      [1920, 1080],
      [1366, 768],
      [750, 1334],
    ] as const) {
      const p = placeView(viewWidthFor(w / 2, h / 2), VIEW_HEIGHT, w, h, 0);
      expect(Number.isInteger(32 * p.scale)).toBe(true);
    }
  });

  it("pins the game near the top in portrait, below the top buttons", () => {
    const p = placeView(VIEW_MIN_WIDTH, VIEW_HEIGHT, 1170, 2532, 141);
    expect(p.clip.width).toBe(1170);
    expect(p.clip.height).toBe(p.height);
    expect(p.y).toBeGreaterThanOrEqual(141);
    expect(p.y + p.height).toBeLessThan(2532 * 0.6);
  });
});

describe("frameInsets", () => {
  it("converts a notch inset into view pixels when the frame reaches under it", () => {
    const p = { x: 0, y: 0, width: 2556, scale: 1179 / 480 };
    const insets = frameInsets(p, 2556, 59 * 3, 59 * 3, 138);
    expect(insets.left).toBeCloseTo((59 * 3) / p.scale);
    expect(insets.right).toBeCloseTo((59 * 3) / p.scale);
    expect(insets.underTopButtons).toBe(true);
  });

  it.each([
    ["notched iPhone", 1179, 2556, 177 + 138],
    ["iPhone SE", 750, 1334, 20 + 92],
  ])("an upright %s game sits below the top buttons", (_name, w, h, buttonsBottom) => {
    const p = placeView(512, 480, w, h, buttonsBottom);
    expect(frameInsets(p, w, 0, 0, buttonsBottom).underTopButtons).toBe(false);
  });

  it("is zero when the frame is letterboxed clear of the notch", () => {
    const p = { x: 300, y: 0, width: 1956, scale: 1179 / 480 };
    expect(frameInsets(p, 2556, 177, 177, 138)).toEqual({ left: 0, right: 0, underTopButtons: true });
  });
});
