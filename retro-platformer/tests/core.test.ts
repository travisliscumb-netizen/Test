import { describe, expect, it } from "vitest";
import { FixedStep } from "../src/core/loop";
import { InputHub, buttonForKey } from "../src/core/input";

describe("FixedStep", () => {
  it("emits whole steps and carries the remainder as alpha", () => {
    const fs = new FixedStep(10, 250);
    expect(fs.advance(25)).toEqual({ steps: 2, alpha: 0.5 });
    expect(fs.advance(5)).toEqual({ steps: 1, alpha: 0 });
  });

  it("runs exactly 60 steps per simulated second at 60 Hz regardless of frame rate", () => {
    for (const fps of [30, 60, 120, 144]) {
      const fs = new FixedStep();
      let steps = 0;
      for (let i = 0; i < fps; i++) steps += fs.advance(1000 / fps).steps;
      expect(steps).toBeGreaterThanOrEqual(59);
      expect(steps).toBeLessThanOrEqual(60);
    }
  });

  it("clamps huge stalls and negative deltas", () => {
    const fs = new FixedStep(10, 250);
    expect(fs.advance(10_000).steps).toBe(25);
    expect(fs.advance(-50).steps).toBe(0);
  });
});

describe("InputHub", () => {
  it("latches a tap that starts and ends between samples", () => {
    const hub = new InputHub();
    hub.setHeld("key:KeyZ", "jump", true);
    hub.setHeld("key:KeyZ", "jump", false);
    const c = hub.sample();
    expect(c.jumpPressed).toBe(true);
    expect(c.jump).toBe(false);
    expect(hub.sample().jumpPressed).toBe(false);
  });

  it("does not re-press when a second source holds an already-held button", () => {
    const hub = new InputHub();
    hub.setHeld("key:KeyZ", "jump", true);
    hub.sample();
    hub.setHeld("touch:1", "jump", true);
    expect(hub.sample().jumpPressed).toBe(false);
    hub.setHeld("key:KeyZ", "jump", false);
    expect(hub.sample().jump).toBe(true);
    hub.releaseSource("touch:1");
    expect(hub.sample().jump).toBe(false);
  });

  it("releaseAll drops everything held", () => {
    const hub = new InputHub();
    hub.setHeld("key:ArrowRight", "right", true);
    hub.setHeld("key:KeyX", "run", true);
    hub.releaseAll();
    const c = hub.sample();
    expect(c.right || c.run).toBe(false);
  });

  it("maps keys", () => {
    expect(buttonForKey("ArrowRight")).toBe("right");
    expect(buttonForKey("Space")).toBe("jump");
    expect(buttonForKey("ShiftLeft")).toBe("run");
    expect(buttonForKey("KeyQ")).toBeUndefined();
  });
});
