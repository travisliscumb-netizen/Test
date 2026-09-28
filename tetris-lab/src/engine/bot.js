/* A general placement bot.

   Works on any compiled ruleset (square or hex lattice, any piece set, any
   clear rule) because it only uses the engine's own primitives: enumerate
   every distinct orientation x every column, drop, resolve clears exactly as
   the game would, and score the resulting board.

   The evaluation is the El-Tetris feature set (Thiery & Scherrer's
   Dellacherie-derived weights), generalised to wrap-around boards, hex
   columns and colour-match rules. It is used for three different jobs:

     - the hidden assist's piece-utility estimates (assist.js),
     - Lab simulations that playtest generated concepts (lab/simulate.js),
     - the attract-mode demo on the title screen.

   A `skill` < 1 turns it into a plausible human: it samples from the top
   placements with a softmax instead of always taking the best, which is what
   the Lab critic uses to judge fairness for real players. */

import { Board } from './board.js';
import { resolveAll } from './clearing.js';
import { Rng } from './rng.js';

export const EL_TETRIS = {
  landing: -4.500158825082766,
  rows: 3.4181268101392694,
  rowTrans: -3.2178882868487753,
  colTrans: -9.348695305445199,
  holes: -7.899265427351652,
  wells: -3.3855972247263626
};

export class Bot {
  constructor(rules, { skill = 1, rng = new Rng(7), weights = EL_TETRIS } = {}) {
    this.rules = rules;
    this.skill = Math.max(0, Math.min(1, skill));
    this.rng = rng;
    this.w = weights;
    this.scratch = new Board(rules.width, rules.height, { lattice: rules.lattice, wrap: rules.wrap, buffer: rules.buffer });
    this.colorRule = rules.clear.rule === 'color-match';
  }

  /** Every legal drop placement for piece index `pi` with given per-cell colours. */
  placements(board, pi, colors, specials) {
    const p = this.rules.pieces[pi];
    const out = [];
    const cols = colors || p.colors;
    for (const s of p.distinctStates) {
      const st = p.states[s];
      let xs;
      if (board.wrap) xs = range(0, board.w - 1);
      else {
        // Any x where the piece lies within the walls for some parity.
        const lo = -Math.max(st.v[0].maxX, st.v[1].maxX) - 1;
        const hi = board.w - Math.min(st.v[0].minX, st.v[1].minX);
        xs = range(lo, hi);
      }
      for (const x of xs) {
        const v = st.v[x & 1];
        if (!board.wrap && (x + v.minX < 0 || x + v.maxX >= board.w)) continue;
        const y0 = board.buffer - 1 - v.maxY;
        if (!board.fits(st, x, y0)) continue;
        const y = board.dropY(st, x, y0);
        out.push({ s, x, y, score: this.evaluate(board, st, x, y, cols, specials) });
      }
    }
    return out;
  }

  /** Score of placing state `st` at (x, y) on `board`. Higher is better. */
  evaluate(board, st, x, y, colors, specials) {
    const b = this.scratch;
    b.cells.set(board.cells);
    const res = b.place(st, x, y, colors, specials);
    // Landing height: rows from the floor to the piece's vertical middle.
    let sumR = 0;
    for (const [, r] of res.cells) sumR += r;
    const landing = b.h - sumR / res.cells.length;
    const cleared = resolveAll(b, this.rules);
    if (res.above > 0) return -1e6;
    const f = this.features(b);
    const W = this.w;
    let score = W.landing * landing + W.rowTrans * f.rowTrans + W.colTrans * f.colTrans +
      W.holes * f.holes + W.wells * f.wells;
    if (this.colorRule) {
      const m = this.rules.clear.matchSize;
      score += 3.2 * cleared.cells / m * this.rules.width / 6 + 4 * Math.max(0, cleared.chains - 1) + 0.9 * this.sameColorPairs(b);
    } else {
      score += W.rows * cleared.lines;
      // Area clears from bombs are rows by another name.
      if (cleared.bombs) score += W.rows * (cleared.cells - cleared.lines * b.w) / b.w;
    }
    // Survival term: the flat El-Tetris weights ignore absolute height, which
    // matters on the short boards and big pieces the Lab produces.
    if (f.maxH > b.visible * 0.6) score -= (f.maxH - b.visible * 0.6) * 6;
    return score;
  }

  features(b) {
    const w = b.w, h = b.h, cells = b.cells, wrap = b.wrap;
    let rowTrans = 0, colTrans = 0, holes = 0, wells = 0, maxH = 0;
    for (let r = 0; r < h; r++) {
      let prev = wrap ? cells[r * w + w - 1] !== 0 : true;
      for (let c = 0; c < w; c++) {
        const f = cells[r * w + c] !== 0;
        if (f !== prev) rowTrans++;
        prev = f;
      }
      if (!wrap && !prev) rowTrans++;
    }
    for (let c = 0; c < w; c++) {
      let prev = false;
      let seenFilled = false;
      let well = 0;
      for (let r = 0; r < h; r++) {
        const f = cells[r * w + c] !== 0;
        if (f !== prev) colTrans++;
        prev = f;
        if (f) {
          if (!seenFilled) { seenFilled = true; maxH = Math.max(maxH, h - r); }
          well = 0;
        } else {
          if (seenFilled) holes++;
          else {
            const lc = wrap ? (c + w - 1) % w : c - 1;
            const rc = wrap ? (c + 1) % w : c + 1;
            const left = lc < 0 || cells[r * w + lc] !== 0;
            const right = rc >= w || cells[r * w + rc] !== 0;
            if (left && right) { well++; wells += well; } else well = 0;
          }
        }
      }
      if (!prev) colTrans++;
    }
    return { rowTrans, colTrans, holes, wells, maxH };
  }

  sameColorPairs(b) {
    const w = b.w, h = b.h, cells = b.cells;
    let pairs = 0;
    for (let r = b.topRow(); r < h; r++) {
      for (let c = 0; c < w; c++) {
        const v = cells[r * w + c] & 31;
        if (!v || v === 8) continue;
        if (c + 1 < w && (cells[r * w + c + 1] & 31) === v) pairs++;
        if (r + 1 < h && (cells[(r + 1) * w + c] & 31) === v) pairs++;
      }
    }
    return pairs;
  }

  /** Best (or skill-sampled) placement; null if the piece cannot be placed at all. */
  choose(board, pi, colors, specials) {
    const list = this.placements(board, pi, colors, specials);
    if (!list.length) return null;
    list.sort((a, b) => b.score - a.score);
    return this.pickFrom(list);
  }

  /** Pick from a list already sorted best-first, according to skill. */
  pickFrom(list) {
    if (this.skill >= 1 || list.length === 1) return list[0];
    // Occasional outright blunder: humans misjudge, misdrop and panic.
    const miss = 1 - this.skill;
    if (this.rng.chance(miss * miss * 0.45)) {
      return list[this.rng.int(Math.max(1, Math.ceil(list.length * (0.3 + miss * 0.5))))];
    }
    // Softmax over the top few with temperature rising as skill falls.
    const k = Math.min(list.length, 2 + Math.round((1 - this.skill) * 6));
    const temp = 0.5 + (1 - this.skill) * 9;
    const top = list.slice(0, k);
    const best = top[0].score;
    const weights = top.map((p) => Math.exp((p.score - best) / temp));
    return top[this.rng.weighted(weights)];
  }

  /** Best achievable score for a piece on a board (assist utility). */
  bestScore(board, pi) {
    const list = this.placements(board, pi);
    let best = -Infinity;
    for (const p of list) if (p.score > best) best = p.score;
    return best;
  }

  /**
   * Decide a full move for a live Game: which piece (current or hold) and
   * where. Returns { hold, s, x } or null when nothing fits.
   */
  plan(game) {
    const a = game.active;
    if (!a) return null;
    const cur = this.choose(game.board, a.inst.p, a.inst.colors, a.inst.specials);
    let alt = null;
    if (game.rules.hold && !game.holdUsed) {
      const other = game.hold || game.queue[0];
      if (other) alt = this.choose(game.board, other.p, other.colors, other.specials);
    }
    if (alt && (!cur || alt.score > cur.score + 4)) return { hold: true, ...alt };
    if (!cur) return null;
    return { hold: false, ...cur };
  }

  /** Execute one planned move on a game in instant/simulation mode. */
  playOne(game) {
    const plan = this.plan(game);
    if (!plan) { game.hardDrop(); return false; }
    if (plan.hold) game.holdPiece();
    if (!game.active) return false;
    if (!game.place(plan.s, plan.x)) game.hardDrop();
    return true;
  }
}

function range(lo, hi) {
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}
