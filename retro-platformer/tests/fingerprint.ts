import type { Controls } from "../src/core/input";
import { createShellback, createWalker, stepEnemy } from "../src/entities/enemies";
import { createPlayer, stepPlayer } from "../src/entities/player";
import { TileMap, type LevelData } from "../src/world/level";

/**
 * Fingerprints that pin down what the reskin must not change. Each is a short
 * hash, so a golden test can compare it with the value recorded before the reskin.
 */

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Every tile, the start, flag, goal and checkpoints. */
export function geometryHash(level: LevelData): string {
  return fnv([level.width, level.height, Array.from(level.tiles).join(""), JSON.stringify([level.start, level.flag, level.goal, level.checkpoints])].join("|"));
}

/** Where every enemy is placed, and of which kind. */
export function spawnHash(level: LevelData): string {
  return fnv(level.spawns.map((s) => `${s.kind}@${s.tx},${s.ty}`).join(";"));
}

/** Each enemy patrolling the untouched level on its own for `frames` steps: its path, turns and falls. */
export function enemyTraceHash(level: LevelData, frames = 900): string {
  const grid = new TileMap(level);
  const parts: string[] = [];
  for (const s of level.spawns) {
    const e = s.kind === "walker" ? createWalker(s.tx, s.ty) : createShellback(s.tx, s.ty);
    for (let f = 0; f < frames && !e.remove; f++) {
      stepEnemy(e, grid, level.height * 16 * 2);
      if (f % 15 === 0) parts.push(`${e.x.toFixed(3)},${e.y.toFixed(3)},${e.dir}`);
    }
  }
  return fnv(parts.join(";"));
}

/** The hero driven by a fixed script of runs, walks and jumps of every length, with no enemies. */
export function playerTraceHash(level: LevelData, frames = 1500): string {
  const grid = new TileMap(level);
  const p = createPlayer(level.start.tx, level.start.ty, "small");
  const parts: string[] = [];
  let prevJump = false;
  for (let f = 0; f < frames; f++) {
    const jump = f % 47 < 3 + ((f / 47) | 0) % 20;
    const c: Controls = {
      left: f % 400 > 360,
      right: f % 400 <= 340,
      jump,
      run: f % 300 > 150,
      jumpPressed: jump && !prevJump,
      startPressed: false,
      mutePressed: false,
    };
    prevJump = jump;
    stepPlayer(p, c, grid, 0);
    parts.push(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.vx.toFixed(4)},${p.vy.toFixed(4)}`);
  }
  return fnv(parts.join(";"));
}
