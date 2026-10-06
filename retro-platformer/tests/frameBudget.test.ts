import { describe, expect, it } from "vitest";
import { FrameBudget } from "../src/core/frameBudget";

describe("FrameBudget", () => {
  it("keeps full density while frames are fast", () => {
    const b = new FrameBudget();
    for (let i = 0; i < 1000; i++) expect(b.record(16.7)).toBeNull();
    expect(b.density).toBe(3);
  });

  it("steps down one level per slow window, then stops at the floor", () => {
    const b = new FrameBudget([3, 2, 1.5], 22, 10);
    const drops: number[] = [];
    for (let i = 0; i < 100; i++) {
      const d = b.record(33);
      if (d !== null) drops.push(d);
    }
    expect(drops).toEqual([2, 1.5]);
    expect(b.density).toBe(1.5);
  });

  it("judges by the median, so occasional spikes don't trigger a drop", () => {
    const b = new FrameBudget([3, 2], 22, 10);
    for (let i = 0; i < 100; i++) expect(b.record(i % 4 === 0 ? 40 : 16.7)).toBeNull();
  });

  it("ignores stalls longer than a quarter second", () => {
    const b = new FrameBudget([3, 2], 22, 10);
    for (let i = 0; i < 100; i++) expect(b.record(1000)).toBeNull();
  });
});
