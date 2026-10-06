import { describe, expect, it } from "vitest";
import { loadLevels } from "../src/levels";
import { ENEMY, PLAYER } from "../src/tuning";

/**
 * Bud's Takeover is slightly easier than the build it reskins, using only
 * forgiveness levers. Enemy speeds and every physics value are untouched
 * (the golden test proves enemy patrols and the hero's movement are identical).
 */
describe("difficulty tweak stays mild", () => {
  it("adds half a second of mercy after a hit (2.0 s → 2.5 s)", () => {
    expect(PLAYER.hurtInvulnFrames).toBe(150);
  });

  it("widens the stomp window from 12 to 16 px, still well under a critter's height", () => {
    expect(ENEMY.stompTolerance).toBe(16);
    expect(ENEMY.stompTolerance).toBeLessThan(ENEMY.walker.height);
  });

  it("forgives grazing contact by 3 px a side, leaving most of the hurt box", () => {
    expect(ENEMY.hurtInset).toBe(3);
    expect(ENEMY.walker.width - ENEMY.hurtInset * 2).toBeGreaterThanOrEqual(ENEMY.walker.width * 0.75);
  });

  it("keeps enemy speeds exactly as they were", () => {
    expect(ENEMY.walker.speed).toBe(1);
    expect(ENEMY.shell.speed).toBe(224 / 256);
    expect(ENEMY.shell.kickSpeed).toBe(7);
  });

  it("gives every level 50 more seconds on the clock", () => {
    expect(loadLevels().map((l) => l.time)).toEqual([450, 450, 350, 400]);
  });
});
