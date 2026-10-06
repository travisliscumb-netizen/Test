import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { seededRandom } from "../src/gfx/paint";
import { World } from "../src/game/world";
import { newSession } from "../src/game/session";
import { LEVEL_SOURCES, loadLevels } from "../src/levels";
import { overlapsSolid } from "../src/world/collision";

/** Random button mashing with held durations, biased toward moving right. */
function* mash(seed: number): Generator<Controls> {
  const rnd = seededRandom(seed);
  for (;;) {
    const hold = 4 + Math.floor(rnd() * 40);
    const right = rnd() < 0.75;
    const left = !right && rnd() < 0.6;
    const run = rnd() < 0.5;
    const jumpFor = rnd() < 0.6 ? Math.floor(rnd() * hold) : 0;
    for (let i = 0; i < hold; i++) yield { ...NO_CONTROLS, left, right, run, jump: i < jumpFor, jumpPressed: i === 0 && jumpFor > 0 };
  }
}

describe("collision invariants under fuzzed input", () => {
  const levels = loadLevels();
  it.each(LEVEL_SOURCES.map(([name], i) => [name, i] as const))("%s: the hero never ends a step inside solid tiles", (_name, index) => {
    for (const seed of [1, 2, 3]) {
      const w = new World(levels[index]!, newSession(), 640);
      const input = mash(seed * 97 + index);
      for (let f = 0; f < 4000 && w.phase === "play"; f++) {
        // Geometry only: no enemies to die to, no power-ups to grow into ceilings.
        w.enemies.length = 0;
        w.items.length = 0;
        w.step(input.next().value!);
        if (w.phase !== "play") break;
        const p = w.player;
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(overlapsSolid(w.map, p.x, p.y, p.w, p.h), `seed ${seed} frame ${f} at ${p.x},${p.y}`).toBe(false);
        expect(p.x).toBeGreaterThanOrEqual(w.camera.x);
      }
    }
  });
});
