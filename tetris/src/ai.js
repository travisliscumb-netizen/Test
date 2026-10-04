/* A placement-search bot. Drives the attract-mode demo behind the title screen
   and the long soak test in tests/.

   For every reachable (rotation, column) the piece is dropped straight down
   and the resulting board is scored with the El-Tetris feature weights
   (Islam El-Ashi's tuned version of Dellacherie's evaluator). The bot also
   considers swapping with hold. It plays through the real Game API one input
   at a time, so everything it does is something a human could do. */

import { SHAPES, TYPES } from './pieces.js';
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

/* Best placement for `type` on `board`: { rot, x, y, score }. */
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
      if (!best || s > best.score) best = { rot, x, y, score: s };
    }
  }
  return best;
}

/* The board as it would be after `type` lands in its best spot (full rows
   removed). Lets the picker look one piece ahead. */
export function boardAfter(board, type) {
  const place = bestPlacement(board, type);
  if (!place) return board;
  const b = board.slice();
  for (const [cx, cy] of SHAPES[type][place.rot]) {
    const y = place.y + cy;
    if (y < ROWS) b[y * COLS + place.x + cx] = 9;
  }
  const out = new Uint8Array(board.length);
  let ny = 0;
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!b[y * COLS + x]) { full = false; break; }
    if (full) continue;
    out.set(b.subarray(y * COLS, y * COLS + COLS), ny * COLS);
    ny++;
  }
  return out;
}

/* "Helpful" randomiser. Called when a piece spawns, with that piece as
   `placing`: it imagines that piece in its best spot, then chooses the piece
   AFTER it to suit the resulting stack. So the NEXT preview is decided once
   and always honoured; only the piece beyond it is being chosen.

   It is helpful, not robotic:
   - it draws among the good fits, weighted by how good they are, rather
     than always taking the single best;
   - the same piece never comes three times running, and recent repeats are
     penalised, so a well does not mean a stream of I-pieces;
   - a piece that has not been seen for a while gets a small boost. */
const PICK = { temperature: 3, repeatPenalty: 4, droughtBonus: 2, droughtWindow: 8 };

export function helpfulPiece(game, placing = null) {
  const board = placing ? boardAfter(game.board, placing) : game.board;
  const history = (game.recentTypes || []).slice();
  const last2 = history.slice(-2);
  const recent4 = history.slice(-4);
  const window = history.slice(-PICK.droughtWindow);
  const cands = [];
  for (const t of TYPES) {
    if (last2.length === 2 && last2[0] === t && last2[1] === t) continue; // never 3 in a row
    const place = bestPlacement(board, t);
    if (!place) continue;
    let score = place.score - recent4.filter((r) => r === t).length * PICK.repeatPenalty;
    if (history.length >= PICK.droughtWindow && !window.includes(t)) score += PICK.droughtBonus;
    cands.push({ t, score });
  }
  if (!cands.length) return TYPES[Math.floor(game.rng() * TYPES.length)];
  const best = Math.max(...cands.map((c) => c.score));
  const weights = cands.map((c) => Math.exp((c.score - best) / PICK.temperature));
  let r = game.rng() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i].t;
  }
  return cands[cands.length - 1].t;
}

export class Bot {
  /* gentle: instead of hard-dropping, the piece is soft-dropped and only
     locked once it rests, so the title-screen demo never jumps. */
  constructor(game, { stepMs = 55, gentle = false } = {}) {
    this.game = game;
    this.stepMs = stepMs;
    this.gentle = gentle;
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
    if (this.planFor !== g.piece || !this.plan) { g.setSoftDrop(false); this.replan(); }
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
    if (!this.gentle) { g.hardDrop(); return; }
    if (g.onGround()) { g.setSoftDrop(false); g.hardDrop(); } else g.setSoftDrop(true);
  }
}
