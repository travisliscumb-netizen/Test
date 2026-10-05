/* The maze: layout, tile classification and lookups. Pure -- no DOM.

   Coordinates are maze-local. The maze is 28x31 tiles of 8 logical units; the
   renderer adds the arcade's three HUD rows above and two below. Pixel x/y of
   an entity is its centre point, so the centre of tile (c, r) is (c*8+4, r*8+4). */

export const COLS = 28;
export const ROWS = 31;
export const TILE = 8;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const TUNNEL_ROW = 14;
/* The tunnel continues two tiles past each edge so actors slide fully out of
   view before wrapping, exactly as the arcade hides them. */
export const TUNNEL_EXTRA = 2;
export const WRAP_SPAN = (COLS + TUNNEL_EXTRA * 2) * TILE;

/* Every maze shares the middle band -- ghost house, side tunnels and the
   fruit corridor -- so ghost-house logic, tunnels and spawn points hold for
   all of them. Only the top and bottom sections differ. */
const MIDDLE = [
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
];

const LAYOUTS = [
  {
    name: 'Classic',
    rows: [
      '############################',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o####.#####.##.#####.####o#',
      '#.####.#####.##.#####.####.#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      ...MIDDLE,
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#.####.#####.##.#####.####.#',
      '#o..##.......  .......##..o#',
      '###.##.##.########.##.##.###',
      '###.##.##.########.##.##.###',
      '#......##....##....##......#',
      '#.##########.##.##########.#',
      '#.##########.##.##########.#',
      '#..........................#',
      '############################',
    ]
  },
  {
    name: 'Orchid',
    rows: [
      '############################',
      '#o........................o#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#..........................#',
      '#.##.####.##.##.##.####.##.#',
      '#.##.####.##.##.##.####.##.#',
      '#.##.####.##.##.##.####.##.#',
      '#............##............#',
      ...MIDDLE,
      '#............##............#',
      '#.##.####.##.##.##.####.##.#',
      '#.##.####.##.##.##.####.##.#',
      '#o...........  ...........o#',
      '###.##.##.########.##.##.###',
      '###.##.##.########.##.##.###',
      '#............##............#',
      '#.####.##.##.##.##.##.####.#',
      '#.####.##.##.##.##.##.####.#',
      '#..........................#',
      '############################',
    ]
  },
  {
    name: 'Lagoon',
    rows: [
      '############################',
      '#....##..............##....#',
      '#.##.##.####.##.####.##.##.#',
      '#o##.##.####.##.####.##.##o#',
      '#..........................#',
      '#.##.#####.######.#####.##.#',
      '#.##.#####.######.#####.##.#',
      '#.##.#####.######.#####.##.#',
      '#............##............#',
      ...MIDDLE,
      '#............##............#',
      '#.###.##.###.##.###.##.###.#',
      '#.###.##.###.##.###.##.###.#',
      '#o...........  ...........o#',
      '####.##.###.####.###.##.####',
      '####.##.###.####.###.##.####',
      '#...........####...........#',
      '#.####.####.####.####.####.#',
      '#.####.####.####.####.####.#',
      '#..........................#',
      '############################',
    ]
  },
  {
    name: 'Ember',
    rows: [
      '############################',
      '#........##......##........#',
      '#.###.##.##.####.##.##.###.#',
      '#o###.##.##.####.##.##.###o#',
      '#..........................#',
      '###.###.##.######.##.###.###',
      '###.###.##.######.##.###.###',
      '###.###.##.######.##.###.###',
      '###..........##..........###',
      ...MIDDLE,
      '#..........######..........#',
      '#.#####.##.######.##.#####.#',
      '#.#####.##.######.##.#####.#',
      '#o...........  ...........o#',
      '##.###.##.########.##.###.##',
      '##.###.##.########.##.###.##',
      '#............##............#',
      '#.###.##.###.##.###.##.###.#',
      '#.###.##.###.##.###.##.###.#',
      '#..........................#',
      '############################',
    ]
  },
];

export const T = { PATH: 0, WALL: 1, DOOR: 2, HOUSE: 3, VOID: 4 };
export const ITEM = { NONE: 0, DOT: 1, POWER: 2 };

export const PAC_START = { x: 14 * TILE, y: 23 * TILE + 4 };
export const HOUSE_DOOR_X = 14 * TILE;            // between columns 13 and 14
export const HOUSE_EXIT_Y = 11 * TILE + 4;        // centre of the row above the door
export const HOUSE_CENTER_Y = 14 * TILE + 4;
export const FRUIT_POS = { x: 14 * TILE, y: 17 * TILE + 4 };

/* Ghosts may not turn upward on these tiles while scattering or chasing. */
export const RED_ZONES = new Set(['12,11', '15,11', '12,23', '15,23']);

function parse(layout) {
  if (layout.length !== ROWS || layout.some((r) => r.length !== COLS)) {
    throw new Error('maze layout has the wrong dimensions');
  }
  const tiles = new Uint8Array(COLS * ROWS);
  const items = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = layout[r][c];
      const i = r * COLS + c;
      tiles[i] = ch === '#' ? T.WALL : ch === '-' ? T.DOOR : T.VOID;
      if (ch === '.') { tiles[i] = T.PATH; items[i] = ITEM.DOT; }
      if (ch === 'o') { tiles[i] = T.PATH; items[i] = ITEM.POWER; }
    }
  }
  /* Blank cells are ambiguous: corridor, ghost-house interior, or the dead
     space beside the tunnels. Flood-fill to tell them apart. */
  const fill = (c0, r0, mark) => {
    const seen = new Uint8Array(COLS * ROWS);
    const stack = [[c0, r0]];
    while (stack.length) {
      const [c, r] = stack.pop();
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const i = r * COLS + c;
      if (seen[i] || tiles[i] === T.WALL || tiles[i] === T.DOOR) continue;
      seen[i] = 1;
      tiles[i] = mark;
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
  };
  fill(13, 23, T.PATH);
  fill(13, 14, T.HOUSE);
  return { tiles, items };
}

export class Maze {
  constructor(index, { name, rows }) {
    const { tiles, items } = parse(rows);
    this.index = index;
    this.name = name;
    this.layout = rows;
    this.tiles = tiles;
    this.items = items;
    this.totalDots = items.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  tileAt(c, r) {
    if (r === TUNNEL_ROW && (c < 0 || c >= COLS)) {
      const span = COLS + TUNNEL_EXTRA * 2;
      const n = (((c + TUNNEL_EXTRA) % span) + span) % span - TUNNEL_EXTRA;
      return n < 0 || n >= COLS ? T.PATH : this.tiles[r * COLS + n];
    }
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T.VOID;
    return this.tiles[r * COLS + c];
  }

  walkable(c, r) { return this.tileAt(c, r) === T.PATH; }

  isWall(c, r) {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS && this.tiles[r * COLS + c] === T.WALL;
  }
}

export const MAZES = LAYOUTS.map((l, i) => new Maze(i, l));

/* Three levels per maze, then the next; the cycle repeats indefinitely. */
export const LEVELS_PER_MAZE = 3;
export function mazeForLevel(level) {
  return MAZES[Math.floor((Math.max(1, level) - 1) / LEVELS_PER_MAZE) % MAZES.length];
}

/* The classic maze, kept as plain exports for callers that only need it. */
const CLASSIC = MAZES[0];
export const LAYOUT = CLASSIC.layout;
export const BASE_TILES = CLASSIC.tiles;
export const BASE_ITEMS = CLASSIC.items;
export const TOTAL_DOTS = CLASSIC.totalDots;
export const tileAt = (c, r) => CLASSIC.tileAt(c, r);
export const walkable = (c, r) => CLASSIC.walkable(c, r);
export const isWall = (c, r) => CLASSIC.isWall(c, r);
export const tileOf = (v) => Math.floor(v / TILE);
export const centerOf = (t) => t * TILE + 4;
