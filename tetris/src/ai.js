/* A placement-search bot. Drives the attract-mode demo behind the title screen
   and the long soak test in tests/.

   For every reachable (rotation, column) the piece is dropped straight down
   and the resulting board is scored with the El-Tetris feature weights
   (Islam El-Ashi's tuned version of Dellacherie's evaluator). The bot also
   considers swapping with hold. It plays through the real Game API one input
   at a time, so everything it does is something a human could do. */

import { SHAPES } from './pieces.js';
import { COLS, ROWS } from './engine.js';

const W = {
  landingHeight: -4.500158825082766,
  rowsEliminated: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  colTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  wells: -3.3855972247263626
};

const H = 24; // rows worth evaluating; nothing sane stacks above this

function fitsOn(board, cells, x, y) {
  for (const [cx, cy] of cells) {
    const bx = x + cx, by = y + cy;
    if (bx < 0 || bx >= COLS || by < 0) return false;
    if (by < ROWS && board[by * COLS + bx]) return false;
  }
  return true;
}

function evaluate(board, cells, x, y) {
  const b = board.slice(0, H * COLS);
  let landing = 0;
  for (const [cx, cy] of cells) {
    const by = y + cy;
    if (by >= H) return -Infinity;
    b[by * COLS + x + cx] = 1;
    landing += by;
  }
  landing = landing / 4 + 0.5;

  // Remove full rows.
  let eliminated = 0;
  let pieceCellsCleared = 0;
  const rows = [];
  for (let r = 0; r < H; r++) {
    let full = true;
    for (let c = 0; c < COLS; c++) if (!b[r * COLS + c]) { full = false; break; }
    if (full) {
      eliminated++;
      for (const [, cy] of cells) if (y + cy === r) pieceCellsCleared++;
    } else rows.push(r);
  }
  let g = b;
  if (eliminated) {
    g = new Uint8Array(H * COLS);
    rows.forEach((r, i) => g.set(b.subarray(r * COLS, r * COLS + COLS), i * COLS));
  }

  let rowT = 0, colT = 0, holes = 0, wells = 0;
  for (let r = 0; r < H; r++) {
    let prev = 1;
    for (let c = 0; c < COLS; c++) {
      const v = g[r * COLS + c] ? 1 : 0;
      if (v !== prev) rowT++;
      prev = v;
    }
    if (!prev) rowT++;
  }
  for (let c = 0; c < COLS; c++) {
    let prev = 1;
    let covered = false;
    for (let r = H - 1; r >= 0; r--) {
      const v = g[r * COLS + c] ? 1 : 0;
      if (v) covered = true;
      else if (covered) holes++;
    }
    for (let r = 0; r < H; r++) {
      const v = g[r * COLS + c] ? 1 : 0;
      if (v !== prev) colT++;
      prev = v;
    }
    // Wells: empty cells whose left and right neighbours are filled, weighted
    // by depth (1 + 2 + ... + d).
    let depth = 0;
    for (let r = H - 1; r >= 0; r--) {
      const empty = !g[r * COLS + c];
      const l = c === 0 || g[r * COLS + c - 1];
      const rr = c === COLS - 1 || g[r * COLS + c + 1];
      if (empty && l && rr) { depth++; wells += depth; } else depth = 0;
    }
  }

  return W.landingHeight * landing
    + W.rowsEliminated * eliminated * pieceCellsCleared
    + W.rowTransitions * rowT
    + W.colTransitions * colT
    + W.holes * holes
    + W.wells * wells;
}

/* Best placement for `type` on `board`: { rot, x, score }. */
export function bestPlacement(board, type) {
  let best = null;
  const rots = type === 'O' ? 1 : (type === 'I' || type === 'S' || type === 'Z') ? 2 : 4;
  for (let rot = 0; rot < rots; rot++) {
    const cells = SHAPES[type][rot];
    const minX = -Math.min(...cells.map((c) => c[0]));
    const maxX = COLS - 1 - Math.max(...cells.map((c) => c[0]));
    for (let x = minX; x <= maxX; x++) {
      let y = 20;
      if (!fitsOn(board, cells, x, y)) continue;
      while (fitsOn(board, cells, x, y - 1)) y--;
      const s = evaluate(board, cells, x, y);
      if (!best || s > best.score) best = { rot, x, score: s };
    }
  }
  return best;
}

export class Bot {
  constructor(game, { stepMs = 55 } = {}) {
    this.game = game;
    this.stepMs = stepMs;
    this.timer = 0;
    this.plan = null;
    this.planFor = null;
  }

  replan() {
    const g = this.game;
    const cur = g.piece.type;
    const here = bestPlacement(g.board, cur);
    const alt = g.holdUsed ? null : (g.hold || g.queue[0]);
    let useHold = false;
    if (alt && alt !== cur) {
      const there = bestPlacement(g.board, alt);
      if (there && (!here || there.score > here.score + 1)) useHold = true;
    }
    this.plan = useHold ? { hold: true } : here;
    this.planFor = g.piece;
  }

  /* Performs at most one input per step so the demo reads like play. */
  update(dt) {
    const g = this.game;
    if (!g.active) { this.plan = null; return; }
    this.timer += dt;
    if (this.timer < this.stepMs) return;
    this.timer = 0;
    if (this.planFor !== g.piece || !this.plan) this.replan();
    const p = g.piece, plan = this.plan;
    if (!plan) { g.hardDrop(); return; }
    if (plan.hold) { this.plan = null; if (!g.holdPiece()) g.hardDrop(); return; }
    if (p.rot !== plan.rot) {
      const diff = (plan.rot - p.rot + 4) % 4;
      if (!g.rotate(diff === 3 ? -1 : diff === 2 ? 2 : 1)) g.hardDrop();
      return;
    }
    if (p.x !== plan.x) {
      if (!g.move(Math.sign(plan.x - p.x))) g.hardDrop();
      return;
    }
    g.hardDrop();
  }
}
