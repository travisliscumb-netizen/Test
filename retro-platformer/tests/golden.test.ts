import { describe, expect, it } from "vitest";
import { loadLevels } from "../src/levels";
import { enemyTraceHash, geometryHash, playerTraceHash, spawnHash } from "./fingerprint";

/**
 * Recorded from the last build before the Bud's Takeover reskin (commit
 * before it, levels then named Meadow Run, Crystal Cavern, Sunset Canopy,
 * Night Fortress). The reskin must not move a tile, an enemy or change how
 * anything moves, so these must never change.
 */
const BEFORE = [
  { geometry: "12b9c6f3", spawns: "9d5d1e6c", enemies: "e169403e", player: "23532d1a" },
  { geometry: "fd7f6ebd", spawns: "921dc124", enemies: "42980ed2", player: "cad51583" },
  { geometry: "557f7f3f", spawns: "17447e10", enemies: "01485340", player: "9b208161" },
  { geometry: "8cd09f32", spawns: "da4214ae", enemies: "26e74340", player: "d93dcf9c" },
] as const;

describe("golden: unchanged by the reskin", () => {
  const levels = loadLevels();
  it("has the same number of levels", () => expect(levels).toHaveLength(BEFORE.length));
  it.each(levels.map((l, i) => [l.name, i] as const))("%s: geometry, spawns, enemy patrols and hero physics", (_name, i) => {
    const l = levels[i]!;
    expect({ geometry: geometryHash(l), spawns: spawnHash(l), enemies: enemyTraceHash(l), player: playerTraceHash(l) }).toEqual(BEFORE[i]);
  });
});
