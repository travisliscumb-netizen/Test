import { describe, expect, it } from "vitest";
import { PixelCanvas, flipX, flipY, imageFromRows, maxIndex } from "../src/gfx/indexed";

describe("PixelCanvas", () => {
  it("snaps fractional coordinates instead of silently dropping pixels", () => {
    const pc = new PixelCanvas(8, 8);
    pc.set(2.6, 3.2, 5);
    expect(pc.get(2, 3)).toBe(5);
    pc.ellipse(0.5, 0.5, 6.3, 6.3, 1);
    expect(pc.get(3, 3)).toBe(1);
  });

  it("clips drawing to the canvas", () => {
    const pc = new PixelCanvas(4, 4);
    pc.rect(-2, -2, 10, 10, 3);
    expect([...pc.pixels].every((p) => p === 3)).toBe(true);
  });

  it("outlines shapes on transparent neighbours only", () => {
    const pc = new PixelCanvas(5, 5);
    pc.set(2, 2, 4);
    pc.outline(1);
    expect(pc.get(2, 1)).toBe(1);
    expect(pc.get(1, 2)).toBe(1);
    expect(pc.get(1, 1)).toBe(0);
    expect(pc.get(2, 2)).toBe(4);
  });

  it("fills polygons", () => {
    const pc = new PixelCanvas(10, 10);
    pc.polygon([0, 0, 10, 0, 10, 10, 0, 10], 2);
    expect(maxIndex(pc.toImage())).toBe(2);
    expect([...pc.pixels].filter((p) => p === 2)).toHaveLength(100);
  });
});

describe("indexed images", () => {
  it("builds from rows with a key and rejects unknown characters", () => {
    const img = imageFromRows([".ab", "ba."], ".ab");
    expect([...img.pixels]).toEqual([0, 1, 2, 2, 1, 0]);
    expect(() => imageFromRows(["xz"], ".x")).toThrow();
    expect(() => imageFromRows(["ab", "a"], ".ab")).toThrow();
  });

  it("flips", () => {
    const img = imageFromRows(["ab", "cd"], ".abcd");
    expect([...flipX(img).pixels]).toEqual([2, 1, 4, 3]);
    expect([...flipY(img).pixels]).toEqual([3, 4, 1, 2]);
  });
});
