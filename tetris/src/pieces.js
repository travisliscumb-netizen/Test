/* Tetromino definitions and Super Rotation System data.

   Coordinates are Y-UP throughout the game (row 0 is the floor), which is also
   the convention the SRS kick tables on the Tetris wiki are written in, so the
   tables below are transcribed verbatim with no sign flips.

   Each piece is defined once, in spawn orientation, inside an n x n bounding
   box. The other three orientations are derived by true rotation about the box
   centre -- exactly how SRS defines "basic rotation" -- so the shapes and the
   kick tables can never disagree. */

export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

/* Board cell values: 0 = empty, 1..7 = TYPES index + 1, GARBAGE for the
   game-over grey wash. */
export const typeId = (t) => TYPES.indexOf(t) + 1;
export const idType = (id) => TYPES[id - 1];

/* Guideline colours. */
export const COLORS = {
  I: 0x21e5f0,
  J: 0x2f6bff,
  L: 0xff8a1f,
  O: 0xffd81f,
  S: 0x3dff6e,
  T: 0xb44bff,
  Z: 0xff2d55
};

const SPAWN_SHAPES = {
  I: { n: 4, cells: [[0, 2], [1, 2], [2, 2], [3, 2]] },
  J: { n: 3, cells: [[0, 2], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 2], [0, 1], [1, 1], [2, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { n: 3, cells: [[1, 2], [2, 2], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 2], [0, 1], [1, 1], [2, 1]] },
  Z: { n: 3, cells: [[0, 2], [1, 2], [1, 1], [2, 1]] }
};

/* Clockwise quarter turn about the box centre c = (n-1)/2, in y-up space:
   (dx, dy) -> (dy, -dx). Results are always integral for n = 2, 3, 4. */
function rotateCW(cells, n) {
  const c = (n - 1) / 2;
  return cells.map(([x, y]) => [c + (y - c), c - (x - c)]);
}

/* SHAPES[type][rotation] -> [[x, y] x4], rotation 0 = spawn, 1 = R, 2 = 180, 3 = L. */
export const SHAPES = {};
export const BOX = {};
for (const t of TYPES) {
  const { n, cells } = SPAWN_SHAPES[t];
  BOX[t] = n;
  const states = [cells.map((c) => c.slice())];
  for (let r = 1; r < 4; r++) states.push(t === 'O' ? states[0] : rotateCW(states[r - 1], n));
  SHAPES[t] = states.map((s) => Object.freeze(s.map((c) => Object.freeze(c))));
}

/* Spawn box origin (bottom-left of the bounding box). The guideline spawns
   every piece in rows 21-22, horizontally centred (left-biased for 3-wide
   pieces). The engine then drops it one row immediately if it can. */
export const SPAWN = {
  I: [3, 18],
  J: [3, 19],
  L: [3, 19],
  O: [4, 20],
  S: [3, 19],
  T: [3, 19],
  Z: [3, 19]
};

/* Wall kicks, keyed "from>to". Offsets are (x, y) with +y up. */
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};

const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};

/* 180-degree rotation is not part of the original guideline; it is a modern
   addition (bound to A by default). These are the widely used SRS+ tables. */
const KICKS_180 = {
  '0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '2>0': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '1>3': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '3>1': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]]
};
const I_KICKS_180 = {
  '0>2': [[0, 0], [0, 1]],
  '2>0': [[0, 0], [0, -1]],
  '1>3': [[0, 0], [1, 0]],
  '3>1': [[0, 0], [-1, 0]]
};

const NO_KICK = [[0, 0]];

export function kicks(type, from, to) {
  const key = `${from}>${to}`;
  if (type === 'O') return NO_KICK;
  if ((from + 2) % 4 === to) return (type === 'I' ? I_KICKS_180 : KICKS_180)[key];
  return (type === 'I' ? I_KICKS : JLSTZ_KICKS)[key];
}

/* T-spin corner geometry, relative to the T's centre cell (box (1,1)).
   FRONT_CORNERS are the two corners on the side the T points toward. */
export const T_CORNERS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
export const T_FRONT = [
  [[-1, 1], [1, 1]],   // 0: points up
  [[1, 1], [1, -1]],   // R: points right
  [[-1, -1], [1, -1]], // 2: points down
  [[-1, 1], [-1, -1]]  // L: points left
];
