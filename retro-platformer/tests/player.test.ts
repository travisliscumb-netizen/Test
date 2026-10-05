import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { bounce, createPlayer, playerPose, setForm, stepPlayer, type Player } from "../src/entities/player";
import type { SolidGrid } from "../src/world/collision";
import { PLAYER, TILE } from "../src/tuning";

function grid(rows: string[]): SolidGrid {
  return {
    isSolid(tx, ty) {
      if (tx < 0) return true;
      return rows[ty]?.[tx] === "#";
    },
  };
}

const FLAT = grid([
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "................................................................................................................",
  "################################################################################################################",
]);

const ctl = (over: Partial<Controls> = {}): Controls => ({ ...NO_CONTROLS, ...over });

function run(p: Player, g: SolidGrid, frames: number, c: Controls | ((i: number) => Controls)): void {
  for (let i = 0; i < frames; i++) stepPlayer(p, typeof c === "function" ? c(i) : c, g, -Infinity);
}

/** Jumps from standstill; returns the peak rise in px. */
function jumpPeak(holdFrames: number, startSpeed = 0): number {
  const p = createPlayer(2, 9);
  p.vx = startSpeed;
  const ground = p.y;
  let peak = 0;
  const dir = startSpeed > 0 ? { right: true, run: startSpeed > PLAYER.walkMax } : {};
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, ctl({ ...dir, jump: i < holdFrames, jumpPressed: i === 0 }), FLAT, -Infinity);
    peak = Math.max(peak, ground - p.y);
    if (i > 0 && p.onGround) break;
  }
  return peak;
}

describe("variable jump height", () => {
  it("full hold from standstill reaches about four tiles", () => {
    const h = jumpPeak(999);
    expect(h).toBeGreaterThan(3.7 * TILE);
    expect(h).toBeLessThan(4.3 * TILE);
  });

  it("a tap gives a short hop, well under half of a full jump", () => {
    const tap = jumpPeak(1);
    expect(tap).toBeGreaterThan(0.6 * TILE);
    expect(tap).toBeLessThan(jumpPeak(999) / 2);
  });

  it("height grows monotonically with hold time", () => {
    let last = 0;
    for (const hold of [1, 4, 8, 12, 16, 24, 40]) {
      const h = jumpPeak(hold);
      expect(h).toBeGreaterThanOrEqual(last);
      last = h;
    }
  });

  it("a running jump goes higher than a standing jump", () => {
    expect(jumpPeak(999, PLAYER.runMax)).toBeGreaterThan(jumpPeak(999) + TILE / 2);
  });

  it("lands back on the floor exactly", () => {
    const p = createPlayer(2, 9);
    const y = p.y;
    run(p, FLAT, 90, (i) => ctl({ jump: i < 20, jumpPressed: i === 0 }));
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(y);
  });

  it("respects terminal velocity", () => {
    const p = createPlayer(2, 0);
    p.y = -2000;
    p.onGround = false;
    run(p, FLAT, 60, ctl());
    expect(p.vy).toBeLessThanOrEqual(PLAYER.maxFallSpeed);
  });
});

describe("coyote time", () => {
  // A ledge: floor ends at column 6.
  const LEDGE = grid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "######....",
  ]);

  /** Walks off the ledge and presses jump on the step after `delay` airborne steps. */
  function jumpsAfter(delay: number): boolean {
    const p = createPlayer(4, 4);
    p.vx = PLAYER.walkMax;
    let airborne = 0;
    for (let i = 0; i < 200; i++) {
      const pressNow = airborne === delay && airborne > 0;
      const r = stepPlayer(p, ctl({ right: true, jump: pressNow, jumpPressed: pressNow }), LEDGE, -Infinity);
      if (r.jumped) return true;
      if (!p.onGround) airborne++;
      if (airborne > delay + 1) return false;
    }
    return false;
  }

  it("allows a jump for about 100 ms after walking off a ledge", () => {
    expect(jumpsAfter(1)).toBe(true);
    expect(jumpsAfter(PLAYER.coyoteFrames)).toBe(true);
    expect(jumpsAfter(PLAYER.coyoteFrames + 1)).toBe(false);
    expect(jumpsAfter(PLAYER.coyoteFrames + 5)).toBe(false);
  });

  it("does not grant a second jump in mid-air after jumping", () => {
    const p = createPlayer(2, 9);
    stepPlayer(p, ctl({ jump: true, jumpPressed: true }), FLAT, -Infinity);
    const r = stepPlayer(p, ctl({ jump: true, jumpPressed: true }), FLAT, -Infinity);
    expect(r.jumped).toBe(false);
  });
});

describe("jump buffering", () => {
  /** Drops the player and presses jump `early` steps before the step that lands; the jump fires on the next step. */
  function bufferedJumpWorks(early: number): boolean {
    // Find the landing frame first.
    const probe = createPlayer(2, 4);
    probe.onGround = false;
    probe.airFrames = 99;
    let landFrame = -1;
    for (let i = 0; i < 200 && landFrame < 0; i++) {
      if (stepPlayer(probe, ctl(), FLAT, -Infinity).landed) landFrame = i;
    }
    const p = createPlayer(2, 4);
    p.onGround = false;
    p.airFrames = 99;
    const pressAt = landFrame - early;
    for (let i = 0; i <= landFrame + PLAYER.jumpBufferFrames + 2; i++) {
      const r = stepPlayer(p, ctl({ jump: i >= pressAt, jumpPressed: i === pressAt }), FLAT, -Infinity);
      if (r.jumped) return true;
    }
    return false;
  }

  it("remembers a jump pressed up to ~100 ms before landing", () => {
    // The jump fires early + 1 steps after the press.
    expect(bufferedJumpWorks(0)).toBe(true);
    expect(bufferedJumpWorks(PLAYER.jumpBufferFrames - 1)).toBe(true);
    expect(bufferedJumpWorks(PLAYER.jumpBufferFrames)).toBe(false);
  });
});

describe("horizontal movement", () => {
  it("accelerates to walk speed and caps there", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 120, ctl({ right: true }));
    expect(p.vx).toBe(PLAYER.walkMax);
  });

  it("run modifier raises the cap", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 120, ctl({ right: true, run: true }));
    expect(p.vx).toBe(PLAYER.runMax);
  });

  it("releasing run bleeds speed back to walk speed gradually", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 120, ctl({ right: true, run: true }));
    stepPlayer(p, ctl({ right: true }), FLAT, -Infinity);
    expect(p.vx).toBeLessThan(PLAYER.runMax);
    expect(p.vx).toBeGreaterThan(PLAYER.walkMax);
    run(p, FLAT, 60, ctl({ right: true }));
    expect(p.vx).toBe(PLAYER.walkMax);
  });

  it("decelerates to a stop with no input", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 60, ctl({ right: true }));
    run(p, FLAT, 60, ctl());
    expect(p.vx).toBe(0);
    expect(playerPose(p)).toBe("idle");
  });

  it("skids when reversing at speed, facing the new direction", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 90, ctl({ right: true, run: true }));
    stepPlayer(p, ctl({ left: true }), FLAT, -Infinity);
    expect(p.skidding).toBe(true);
    expect(p.facing).toBe(-1);
    expect(playerPose(p)).toBe("skid");
    expect(p.vx).toBeGreaterThan(0);
    run(p, FLAT, 60, ctl({ left: true }));
    expect(p.skidding).toBe(false);
    expect(p.vx).toBeLessThan(0);
  });

  it("does not snag on tile seams over a long walk", () => {
    const p = createPlayer(1, 9);
    run(p, FLAT, 60, ctl({ right: true }));
    const x0 = p.x;
    run(p, FLAT, 300, ctl({ right: true }));
    expect(p.x - x0).toBe(300 * PLAYER.walkMax);
    expect(p.onGround).toBe(true);
  });

  it("keeps momentum in the air with no input", () => {
    const p = createPlayer(2, 9);
    run(p, FLAT, 60, ctl({ right: true }));
    stepPlayer(p, ctl({ right: true, jump: true, jumpPressed: true }), FLAT, -Infinity);
    const vx = p.vx;
    run(p, FLAT, 10, ctl({ jump: true }));
    expect(p.vx).toBe(vx);
  });

  it("cannot move left past the camera wall", () => {
    const p = createPlayer(5, 9);
    for (let i = 0; i < 60; i++) stepPlayer(p, ctl({ left: true }), FLAT, 4 * TILE);
    expect(p.x).toBe(4 * TILE);
    expect(p.vx).toBe(0);
  });

  it("walks the run cycle through all four frames", () => {
    const p = createPlayer(2, 9);
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, ctl({ right: true }), FLAT, -Infinity);
      seen.add(playerPose(p));
    }
    expect([...seen].filter((s) => s.startsWith("run")).sort()).toEqual(["run0", "run1", "run2", "run3"]);
  });
});

describe("ceilings", () => {
  // A single block at column 3, row 6, above a floor at row 10.
  const BLOCK = grid([
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
    "...#....",
    "........",
    "........",
    "........",
    "########",
  ]);

  function jumpUnder(x: number): { bumped: { tx: number; ty: number } | null; peakY: number } {
    const p = createPlayer(0, 9);
    p.x = x;
    let bumped: { tx: number; ty: number } | null = null;
    let peakY = p.y;
    for (let i = 0; i < 80; i++) {
      const r = stepPlayer(p, ctl({ jump: true, jumpPressed: i === 0 }), BLOCK, -Infinity);
      bumped ??= r.bumped;
      peakY = Math.min(peakY, p.y);
    }
    return { bumped, peakY };
  }

  it("bumps a block hit squarely and stops rising", () => {
    const r = jumpUnder(3 * TILE + 6);
    expect(r.bumped).toEqual({ tx: 3, ty: 6 });
    expect(r.peakY).toBe(7 * TILE);
  });

  it("slides around a corner clipped by a few pixels", () => {
    // Player 20 wide, right edge 4 px into the block's left side.
    const r = jumpUnder(3 * TILE + 4 - PLAYER.small.width);
    expect(r.bumped).toBeNull();
    expect(r.peakY).toBeLessThan(6 * TILE);
  });

  it("does not correct a large overlap", () => {
    const r = jumpUnder(3 * TILE + 12 - PLAYER.small.width);
    expect(r.bumped).toEqual({ tx: 3, ty: 6 });
  });

  it("bumps the block nearest the player's centre when straddling two", () => {
    const TWO = grid(["......", "......", "......", "......", "......", "......", "..##..", "......", "......", "......", "######"]);
    const p = createPlayer(0, 9);
    p.x = 3 * TILE - 6; // centre is 4 px into column 3
    let bumped = null;
    for (let i = 0; i < 40 && !bumped; i++) bumped = stepPlayer(p, ctl({ jump: true, jumpPressed: i === 0 }), TWO, -Infinity).bumped;
    expect(bumped).toEqual({ tx: 3, ty: 6 });
  });
});

describe("form changes and bounce", () => {
  it("growing keeps the feet and centre in place", () => {
    const p = createPlayer(3, 9);
    const bottom = p.y + p.h;
    const cx = p.x + p.w / 2;
    setForm(p, "big");
    expect(p.h).toBe(PLAYER.big.height);
    expect(p.y + p.h).toBe(bottom);
    expect(p.x + p.w / 2).toBe(cx);
  });

  it("holding jump while stomping bounces higher", () => {
    const peak = (held: boolean): number => {
      const p = createPlayer(2, 9);
      const y0 = p.y;
      bounce(p, held);
      let top = 0;
      for (let i = 0; i < 60; i++) {
        stepPlayer(p, ctl({ jump: held }), FLAT, -Infinity);
        top = Math.max(top, y0 - p.y);
      }
      return top;
    };
    expect(peak(true)).toBeGreaterThan(peak(false));
  });

  it("is deterministic", () => {
    const sim = (): string => {
      const p = createPlayer(2, 9);
      run(p, FLAT, 300, (i) => ctl({ right: i % 50 < 40, run: i % 90 < 45, jump: i % 37 < 20, jumpPressed: i % 37 === 0 }));
      return `${p.x},${p.y},${p.vx},${p.vy}`;
    };
    expect(sim()).toBe(sim());
  });
});
