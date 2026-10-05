import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { createPlayer, stepPlayer, type Player } from "../src/entities/player";
import { LEVEL_SOURCES, loadLevels } from "../src/levels";
import { TileMap, parseLevel, type LevelData } from "../src/world/level";
import { CAMERA, TILE } from "../src/tuning";

/**
 * Proves each level can be finished with the real player physics: a greedy
 * best-first search over short input chunks, from the start to touching the
 * flagpole. Uses a small hero (the hardest case: bricks never break) and no
 * enemies, so it checks the level geometry, not combat.
 */

const CHUNK = 5;
const VIEW = 640;

interface Node {
  p: Player;
  camX: number;
  jumpHeld: boolean;
  depth: number;
}

const ACTIONS: readonly { dir: -1 | 0 | 1; run: boolean; jump: boolean }[] = [
  { dir: 1, run: true, jump: false },
  { dir: 1, run: true, jump: true },
  { dir: 1, run: false, jump: false },
  { dir: 1, run: false, jump: true },
  { dir: 0, run: false, jump: false },
  { dir: 0, run: false, jump: true },
  { dir: -1, run: false, jump: false },
  { dir: -1, run: false, jump: true },
];

function key(n: Node): string {
  const p = n.p;
  return `${Math.round(p.x / 4)},${Math.round(p.y / 4)},${Math.round(p.vx * 2)},${Math.round(p.vy)},${p.onGround ? 1 : 0},${n.jumpHeld ? 1 : 0}`;
}

/** Binary heap; `before(a, b)` is true when a should come out first. */
class Heap<T> {
  private readonly items: T[] = [];
  constructor(private readonly before: (a: T, b: T) => boolean) {}
  get size(): number {
    return this.items.length;
  }
  push(item: T): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(a[i]!, a[parent]!)) break;
      [a[i], a[parent]] = [a[parent]!, a[i]!];
      i = parent;
    }
  }
  pop(): T {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.before(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

interface SolveResult {
  reached: boolean;
  /** True when every reachable state was explored (so "not reached" is a proof). */
  exhausted: boolean;
  expansions: number;
  bestX: number;
}

function solve(level: LevelData, budget = 600_000): SolveResult {
  const map = new TileMap(level);
  const poleX = level.flag.tx * TILE + TILE / 2;
  const baseTop = level.flag.baseTy * TILE;
  const bottom = level.height * TILE;
  const start = createPlayer(level.start.tx, level.start.ty);
  const first: Node = { p: start, camX: 0, jumpHeld: false, depth: 0 };
  const open = new Heap<Node>((a, b) => a.p.x > b.p.x || (a.p.x === b.p.x && a.depth < b.depth));
  open.push(first);
  const seen = new Set<string>([key(first)]);
  let expansions = 0;
  let bestX = 0;
  while (open.size > 0 && expansions < budget) {
    // Greedy: always expand the node furthest right (ties: shallower first).
    const node = open.pop();
    expansions++;
    for (const act of ACTIONS) {
      const p: Player = { ...node.p };
      let camX = node.camX;
      let alive = true;
      let won = false;
      for (let f = 0; f < CHUNK; f++) {
        const c: Controls = {
          ...NO_CONTROLS,
          left: act.dir < 0,
          right: act.dir > 0,
          run: act.run,
          jump: act.jump,
          jumpPressed: act.jump && f === 0 && !node.jumpHeld,
        };
        stepPlayer(p, c, map, camX);
        camX = Math.min(Math.max(camX, p.x + p.w / 2 - VIEW * CAMERA.followFraction), level.width * TILE - VIEW);
        if (p.y > bottom) {
          alive = false;
          break;
        }
        if (p.x + p.w >= poleX - 2 && p.y + p.h <= baseTop) {
          won = true;
          break;
        }
      }
      if (won) return { reached: true, exhausted: false, expansions, bestX: poleX };
      if (!alive) continue;
      const child: Node = { p, camX, jumpHeld: act.jump, depth: node.depth + 1 };
      const k = key(child);
      if (seen.has(k)) continue;
      seen.add(k);
      bestX = Math.max(bestX, p.x);
      open.push(child);
    }
  }
  return { reached: false, exhausted: open.size === 0, expansions, bestX };
}

describe("every level can be completed", () => {
  const levels = loadLevels();
  it.each(LEVEL_SOURCES.map(([name], i) => [name, i] as const))(
    "%s: the flagpole is reachable from the start",
    (_name, i) => {
      const level = levels[i]!;
      const r = solve(level);
      expect(r.reached, `stuck near column ${Math.floor(r.bestX / TILE)} after ${r.expansions} expansions`).toBe(true);
    },
    60_000,
  );

  it.each(LEVEL_SOURCES.map(([name], i) => [name, i] as const))(
    "%s: the flagpole is reachable from every checkpoint",
    (_name, i) => {
      const level = levels[i]!;
      for (const cp of level.checkpoints) {
        const r = solve({ ...level, start: cp });
        expect(r.reached, `from checkpoint ${cp.tx}: stuck near column ${Math.floor(r.bestX / TILE)}`).toBe(true);
      }
    },
    60_000,
  );
});

describe("the solver is not trivially satisfied", () => {
  function level(air: string, ground: string): LevelData {
    const rows = [...Array(11).fill(".".repeat(air.length)), air, ground, ground, ground];
    return parseLevel(`name: T\ntheme: meadow\ntime: 300\n---\n${rows.join("\n")}`);
  }

  it("finds a path over a jumpable 4-tile pit", () => {
    expect(solve(level(".S..............F...T...", "#######....#############")).reached).toBe(true);
  });

  it("proves a 12-tile pit impossible", () => {
    const r = solve(level(".S......................F...T...", "#######............#############"));
    expect(r).toMatchObject({ reached: false, exhausted: true });
  }, 60_000);

  it("proves a wall taller than any jump impossible", () => {
    const wall = "........X...............";
    const rows = [...Array<string>(11).fill(wall), ".S......X.......F...T...", ...Array<string>(3).fill("#".repeat(24))];
    expect(solve(parseLevel(`name: T\ntheme: meadow\ntime: 300\n---\n${rows.join("\n")}`))).toMatchObject({ reached: false, exhausted: true });
  }, 60_000);
});
