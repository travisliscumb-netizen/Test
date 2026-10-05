import { describe, expect, it } from "vitest";
import { LevelFormatError, TileMap, parseLevel } from "../src/world/level";
import { Tile } from "../src/world/tiles";
import testRoom from "../src/levels/test-room.txt?raw";
import { LEVEL_SOURCES, loadLevels } from "../src/levels";
import { GOAL } from "../src/tuning";

function level(rows: string[], header = "name: T\ntheme: meadow\ntime: 300"): string {
  return `${header}\n---\n${rows.join("\n")}\n`;
}

const okRows = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".S....g...k.F.T.",
  "################",
  "################",
  "################",
];

describe("parseLevel", () => {
  it("parses the test room", () => {
    const l = parseLevel(testRoom, "test-room");
    expect(l.width).toBe(48);
    expect(l.height).toBe(15);
    expect(l.start).toEqual({ tx: 4, ty: 11 });
    expect(l.flag).toEqual({ tx: 37, baseTy: 11 });
    expect(l.spawns.map((s) => s.kind).sort()).toEqual(["shell", "walker"]);
    const map = new TileMap(l);
    expect(map.get(7, 6)).toBe(Tile.MysteryCoin);
    expect(map.get(8, 6)).toBe(Tile.MysterySprout);
    expect(map.get(18, 6)).toBe(Tile.BrickCoins);
    expect(map.get(37, 11)).toBe(Tile.Stone);
  });

  it("parses a minimal level and leaves object cells empty", () => {
    const l = parseLevel(level(okRows));
    const map = new TileMap(l);
    expect(map.get(6, 11)).toBe(Tile.Empty);
    expect(l.goal).toEqual({ tx: 14, ty: 11 });
  });

  it("accepts CRLF line endings", () => {
    expect(() => parseLevel(level(okRows).replace(/\n/g, "\r\n"))).not.toThrow();
  });

  it.each([
    ["ragged rows", okRows.map((r, i) => (i === 3 ? r + "." : r))],
    ["unknown chars", okRows.map((r, i) => (i === 3 ? "Z" + r.slice(1) : r))],
    ["missing start", okRows.map((r) => r.replace("S", "."))],
    ["missing flag", okRows.map((r) => r.replace("F", "."))],
    ["two starts", okRows.map((r, i) => (i === 11 ? r.replace("..g", ".Sg") : r))],
    ["too few rows", okRows.slice(1)],
    ["floating start", okRows.map((r, i) => (i === 11 ? r.replace("S", ".") : i === 5 ? "S" + r.slice(1) : r))],
  ])("rejects %s", (_name, rows) => {
    expect(() => parseLevel(level(rows))).toThrow(LevelFormatError);
  });

  it("rejects bad headers", () => {
    expect(() => parseLevel(level(okRows, "name: T\ntheme: lava\ntime: 300"))).toThrow(/theme/);
    expect(() => parseLevel(level(okRows, "name: T\ntheme: meadow\ntime: -1"))).toThrow(/time/);
    expect(() => parseLevel(okRows.join("\n"))).toThrow(/separator/);
  });
});

describe("TileMap bounds", () => {
  const map = new TileMap(parseLevel(level(okRows)));
  it("walls off the sides, opens the sky and the pit", () => {
    expect(map.isSolid(-1, 5)).toBe(true);
    expect(map.isSolid(16, 5)).toBe(true);
    expect(map.isSolid(3, -3)).toBe(false);
    expect(map.isSolid(3, 15)).toBe(false);
  });
  it("set mutates only the runtime copy", () => {
    map.set(0, 12, Tile.Empty);
    expect(map.isSolid(0, 12)).toBe(false);
    expect(new TileMap(parseLevel(level(okRows))).isSolid(0, 12)).toBe(true);
  });
});

describe("shipped levels", () => {
  const levels = loadLevels();

  it("there are four, with distinct themes", () => {
    expect(levels).toHaveLength(4);
    expect(new Set(levels.map((l) => l.theme)).size).toBe(4);
  });

  describe.each(LEVEL_SOURCES.map(([name], i) => [name, i] as const))("%s", (_name, i) => {
    const level = levels[i]!;
    const map = new TileMap(level);

    it("is long enough to be a real level and has a timer", () => {
      expect(level.width).toBeGreaterThanOrEqual(180);
      expect(level.time).toBeGreaterThanOrEqual(300);
    });

    it("has a power-up, both enemy kinds and a checkpoint", () => {
      expect(level.tiles.includes(Tile.MysterySprout)).toBe(true);
      expect(level.spawns.some((s) => s.kind === "walker")).toBe(true);
      expect(level.spawns.some((s) => s.kind === "shell")).toBe(true);
      expect(level.checkpoints.length).toBeGreaterThanOrEqual(1);
    });

    it("places every enemy standing on solid ground", () => {
      for (const s of level.spawns) {
        expect(map.isSolid(s.tx, s.ty), `${s.kind} at ${s.tx},${s.ty}`).toBe(false);
        expect(map.isSolid(s.tx, s.ty + 1), `${s.kind} at ${s.tx},${s.ty}`).toBe(true);
      }
    });

    it("builds pipes from matching halves", () => {
      for (let ty = 0; ty < level.height; ty++) {
        for (let tx = 0; tx < level.width; tx++) {
          const id = map.get(tx, ty);
          if (id === Tile.PipeTopLeft) expect(map.get(tx + 1, ty)).toBe(Tile.PipeTopRight);
          if (id === Tile.PipeLeft) expect(map.get(tx + 1, ty)).toBe(Tile.PipeRight);
          if (id === Tile.PipeTopLeft || id === Tile.PipeLeft) {
            const below = map.get(tx, ty + 1);
            expect(below === Tile.PipeLeft || map.isSolid(tx, ty + 1)).toBe(true);
          }
        }
      }
    });

    it("leaves a clear, pit-free walk from the flag to the goal door", () => {
      const doorTx = level.goal.tx + Math.floor(GOAL.doorOffset / 32);
      for (let tx = level.flag.tx + 1; tx <= doorTx; tx++) {
        expect(map.isSolid(tx, level.goal.ty), `column ${tx}`).toBe(false);
        expect(map.isSolid(tx, level.goal.ty + 1), `column ${tx}`).toBe(true);
      }
      expect(level.goal.ty).toBe(level.flag.baseTy);
    });

    it("keeps the goal tower's footprint free of solid tiles", () => {
      for (let tx = level.goal.tx; tx < level.goal.tx + 4; tx++) {
        for (let ty = level.goal.ty - 5; ty <= level.goal.ty; ty++) expect(map.isSolid(tx, ty)).toBe(false);
      }
    });
  });
});
