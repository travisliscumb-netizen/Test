import { Tile, isSolidTile, type TileId } from "./tiles";
import type { SolidGrid } from "./collision";

export const LEVEL_ROWS = 15;

export const THEMES = ["meadow", "cavern", "dusk", "fortress"] as const;
export type ThemeName = (typeof THEMES)[number];

export type SpawnKind = "walker" | "shell";

export interface Spawn {
  kind: SpawnKind;
  tx: number;
  ty: number;
}

export interface LevelData {
  readonly name: string;
  readonly theme: ThemeName;
  readonly time: number;
  readonly width: number;
  readonly height: number;
  /** Row-major tile ids. */
  readonly tiles: Uint8Array;
  readonly start: { tx: number; ty: number };
  /** The flagpole stands on the solid block at (tx, baseTy) and rises to row {@link FLAG_TOP_ROW}. */
  readonly flag: { tx: number; baseTy: number };
  /** Bottom-left cell of the decorative goal tower the hero walks into. */
  readonly goal: { tx: number; ty: number };
  /** Respawn cells (empty, directly above ground), ordered left to right. */
  readonly checkpoints: readonly { tx: number; ty: number }[];
  readonly spawns: readonly Spawn[];
}

/** Topmost row the flagpole's finial occupies. */
export const FLAG_TOP_ROW = 2;

/**
 * Map legend. Characters that place an object (start, spawns, flag, goal,
 * checkpoint) leave the cell empty, except the flag which stands on a stone block.
 */
const TILE_CHARS: Readonly<Record<string, TileId>> = {
  ".": Tile.Empty,
  "#": Tile.Ground,
  B: Tile.Brick,
  M: Tile.BrickCoins,
  "?": Tile.MysteryCoin,
  P: Tile.MysterySprout,
  X: Tile.Stone,
  "<": Tile.PipeTopLeft,
  ">": Tile.PipeTopRight,
  "[": Tile.PipeLeft,
  "]": Tile.PipeRight,
  o: Tile.Coin,
};

const OBJECT_CHARS = new Set(["S", "g", "k", "F", "T", "C"]);

export class LevelFormatError extends Error {
  constructor(source: string, message: string) {
    super(`${source}: ${message}`);
    this.name = "LevelFormatError";
  }
}

/**
 * Parses a level file:
 *
 * ```
 * name: Meadow Run
 * theme: meadow
 * time: 400
 * ---
 * <15 rows of equal width>
 * ```
 */
export function parseLevel(text: string, source = "level"): LevelData {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sep = lines.indexOf("---");
  if (sep < 0) throw new LevelFormatError(source, "missing '---' header separator");

  const header = new Map<string, string>();
  for (const raw of lines.slice(0, sep)) {
    const line = raw.trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new LevelFormatError(source, `bad header line '${line}'`);
    header.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const name = header.get("name");
  if (!name) throw new LevelFormatError(source, "header needs a name");
  const themeRaw = header.get("theme");
  const theme = THEMES.find((t) => t === themeRaw);
  if (!theme) throw new LevelFormatError(source, `unknown theme '${themeRaw ?? ""}'`);
  const time = Number(header.get("time"));
  if (!Number.isInteger(time) || time <= 0) throw new LevelFormatError(source, "time must be a positive integer");

  const rows = lines.slice(sep + 1);
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  if (rows.length !== LEVEL_ROWS) {
    throw new LevelFormatError(source, `expected ${LEVEL_ROWS} map rows, found ${rows.length}`);
  }
  const width = rows[0]!.length;
  if (width < 16) throw new LevelFormatError(source, "map must be at least 16 columns wide");

  const tiles = new Uint8Array(width * LEVEL_ROWS);
  let start: { tx: number; ty: number } | undefined;
  let flag: { tx: number; baseTy: number } | undefined;
  let goal: { tx: number; ty: number } | undefined;
  const checkpoints: { tx: number; ty: number }[] = [];
  const spawns: Spawn[] = [];

  rows.forEach((row, ty) => {
    if (row.length !== width) {
      throw new LevelFormatError(source, `row ${ty} is ${row.length} wide, expected ${width}`);
    }
    for (let tx = 0; tx < width; tx++) {
      const ch = row[tx]!;
      const tile = TILE_CHARS[ch];
      if (tile !== undefined) {
        tiles[ty * width + tx] = tile;
        continue;
      }
      if (!OBJECT_CHARS.has(ch)) {
        throw new LevelFormatError(source, `unknown character '${ch}' at column ${tx}, row ${ty}`);
      }
      const where = `column ${tx}, row ${ty}`;
      switch (ch) {
        case "S":
          if (start) throw new LevelFormatError(source, `second start at ${where}`);
          start = { tx, ty };
          break;
        case "g":
          spawns.push({ kind: "walker", tx, ty });
          break;
        case "k":
          spawns.push({ kind: "shell", tx, ty });
          break;
        case "F":
          if (flag) throw new LevelFormatError(source, `second flag at ${where}`);
          flag = { tx, baseTy: ty };
          tiles[ty * width + tx] = Tile.Stone;
          break;
        case "T":
          if (goal) throw new LevelFormatError(source, `second goal at ${where}`);
          goal = { tx, ty };
          break;
        case "C":
          checkpoints.push({ tx, ty });
          break;
      }
    }
  });

  if (!start) throw new LevelFormatError(source, "no start 'S'");
  if (!flag) throw new LevelFormatError(source, "no flag 'F'");
  if (!goal) throw new LevelFormatError(source, "no goal 'T'");
  if (flag.baseTy - FLAG_TOP_ROW < 4) throw new LevelFormatError(source, "flag base is too high for a pole");
  if (goal.tx <= flag.tx) throw new LevelFormatError(source, "goal must be right of the flag");

  const level: LevelData = {
    name,
    theme,
    time,
    width,
    height: LEVEL_ROWS,
    tiles,
    start,
    flag,
    goal,
    checkpoints: checkpoints.sort((a, b) => a.tx - b.tx),
    spawns,
  };

  const startGrid = new TileMap(level);
  for (const [what, cell] of [["start", start], ...checkpoints.map((c) => ["checkpoint", c] as const)] as const) {
    if (startGrid.isSolid(cell.tx, cell.ty) || !startGrid.isSolid(cell.tx, cell.ty + 1)) {
      throw new LevelFormatError(source, `${what} at column ${cell.tx} must be an empty cell directly above solid ground`);
    }
  }
  for (let i = 1; i < checkpoints.length; i++) {
    if (checkpoints[i]!.tx === checkpoints[i - 1]!.tx) throw new LevelFormatError(source, "two checkpoints in one column");
  }
  for (let ty = FLAG_TOP_ROW; ty < flag.baseTy; ty++) {
    if (startGrid.isSolid(flag.tx, ty)) throw new LevelFormatError(source, "flagpole passes through a solid tile");
  }
  return level;
}

/**
 * Mutable runtime copy of a level's tiles. Columns outside the map are solid
 * walls; rows above the map are open sky and rows below are a bottomless pit.
 */
export class TileMap implements SolidGrid {
  readonly width: number;
  readonly height: number;
  private readonly cells: Uint8Array;

  constructor(level: LevelData) {
    this.width = level.width;
    this.height = level.height;
    this.cells = level.tiles.slice();
  }

  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return Tile.Empty;
    return this.cells[ty * this.width + tx]!;
  }

  set(tx: number, ty: number, id: TileId): void {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return;
    this.cells[ty * this.width + tx] = id;
  }

  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.width) return true;
    if (ty < 0 || ty >= this.height) return false;
    return isSolidTile(this.cells[ty * this.width + tx]!);
  }
}
