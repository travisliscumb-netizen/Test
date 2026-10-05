/** Tile ids stored in a level's tile array. */
export const Tile = {
  Empty: 0,
  Ground: 1,
  Brick: 2,
  /** Brick that pays out coins on every bump for a few seconds. */
  BrickCoins: 3,
  MysteryCoin: 4,
  MysterySprout: 5,
  Used: 6,
  Stone: 7,
  PipeTopLeft: 8,
  PipeTopRight: 9,
  PipeLeft: 10,
  PipeRight: 11,
  Coin: 12,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

const SOLID = new Set<number>([
  Tile.Ground,
  Tile.Brick,
  Tile.BrickCoins,
  Tile.MysteryCoin,
  Tile.MysterySprout,
  Tile.Used,
  Tile.Stone,
  Tile.PipeTopLeft,
  Tile.PipeTopRight,
  Tile.PipeLeft,
  Tile.PipeRight,
]);

export function isSolidTile(id: number): boolean {
  return SOLID.has(id);
}

/** Tiles that react when hit from below. */
export function isBumpable(id: number): boolean {
  return (
    id === Tile.Brick ||
    id === Tile.BrickCoins ||
    id === Tile.MysteryCoin ||
    id === Tile.MysterySprout
  );
}
