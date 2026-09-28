/* The playfield grid.

   Storage is a flat Uint8Array, row-major, row 0 at the top. The first
   `buffer` rows are the hidden spawn zone above the visible field.

   Cell encoding (one byte):
     bits 0-4  palette colour index 1..31 (0 == empty)
     bits 5-7  special: 0 none, 1 bomb, 2 wild

   The board knows nothing about pieces beyond the compiled state variants
   produced by pieces.js, and nothing about scoring. Clear rules return a
   description of what to remove; the game decides when to apply it so the
   renderer can animate the clear first. */

import { getLattice } from './lattice.js';
import { GARBAGE_COLOR } from './pieces.js';

export const SPECIAL_NONE = 0;
export const SPECIAL_BOMB = 1;
export const SPECIAL_WILD = 2;

export const colorOf = (v) => v & 31;
export const specialOf = (v) => v >> 5;
export const makeCell = (color, special = 0) => (color & 31) | ((special & 7) << 5);

export class Board {
  constructor(width, height, { lattice = 'square', wrap = false, buffer = 4 } = {}) {
    this.w = width;
    this.h = height + buffer;      // total rows including hidden buffer
    this.visible = height;
    this.buffer = buffer;
    this.lattice = lattice;
    this.L = getLattice(lattice);
    this.wrap = !!wrap && lattice === 'square';
    this.cells = new Uint8Array(this.w * this.h);
  }

  clone() {
    const b = Object.create(Board.prototype);
    b.w = this.w; b.h = this.h; b.visible = this.visible; b.buffer = this.buffer;
    b.lattice = this.lattice; b.L = this.L; b.wrap = this.wrap;
    b.cells = this.cells.slice();
    return b;
  }

  copyFrom(other) { this.cells.set(other.cells); }

  clear() { this.cells.fill(0); }

  /** Horizontal coordinate normalisation (wrap-around boards). */
  col(c) { return this.wrap ? ((c % this.w) + this.w) % this.w : c; }

  get(c, r) {
    c = this.col(c);
    if (c < 0 || c >= this.w || r < 0 || r >= this.h) return 0;
    return this.cells[r * this.w + c];
  }

  set(c, r, v) {
    c = this.col(c);
    if (c < 0 || c >= this.w || r < 0 || r >= this.h) return;
    this.cells[r * this.w + c] = v;
  }

  /** Walls and floor count as solid, the open sky above row 0 does not. */
  solid(c, r) {
    c = this.col(c);
    if (c < 0 || c >= this.w || r >= this.h) return true;
    if (r < 0) return false;
    return this.cells[r * this.w + c] !== 0;
  }

  /** Can compiled state `st` sit with its anchor at (x, y)? */
  fits(st, x, y) {
    const v = st.v[x & 1];
    const o = v.offs, w = this.w, h = this.h, cells = this.cells, wrap = this.wrap;
    for (let i = 0; i < v.n; i++) {
      let cx = x + o[i * 2];
      const cy = y + o[i * 2 + 1];
      if (wrap) cx = ((cx % w) + w) % w;
      else if (cx < 0 || cx >= w) return false;
      if (cy >= h) return false;
      if (cy >= 0 && cells[cy * w + cx] !== 0) return false;
    }
    return true;
  }

  /** Board coordinates of a placed state, in cell order. */
  cellsOf(st, x, y) {
    const v = st.v[x & 1];
    const out = new Array(v.n);
    for (let i = 0; i < v.n; i++) out[i] = [this.col(x + v.offs[i * 2]), y + v.offs[i * 2 + 1]];
    return out;
  }

  /** Lowest y the state can fall to from (x, y). */
  dropY(st, x, y) {
    while (this.fits(st, x, y + 1)) y++;
    return y;
  }

  /**
   * Write a piece into the grid. `colors` / `specials` are per-cell arrays.
   * Returns { cells, above } where `above` counts cells that landed outside the
   * grid (above row 0) -- a lock-out condition.
   */
  place(st, x, y, colors, specials) {
    const pos = this.cellsOf(st, x, y);
    let above = 0;
    pos.forEach(([c, r], i) => {
      if (r < 0) { above++; return; }
      this.cells[r * this.w + c] = makeCell(colors[i], specials ? specials[i] : 0);
    });
    return { cells: pos, above };
  }

  rowCount(r) {
    let n = 0;
    for (let c = 0; c < this.w; c++) if (this.cells[r * this.w + c]) n++;
    return n;
  }

  isEmpty() {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) return false;
    return true;
  }

  /* ------------------------------------------------------ clear rules -- */

  /** Rows that satisfy a line rule. `gaps` = how many empty cells a row may keep. */
  findLines(gaps = 0) {
    const rows = [];
    const need = this.w - gaps;
    for (let r = 0; r < this.h; r++) if (this.rowCount(r) >= need) rows.push(r);
    return rows;
  }

  /** Connected same-colour groups of at least `min` cells. Wild matches any colour. */
  findColorGroups(min) {
    const w = this.w, h = this.h, cells = this.cells;
    const seen = new Uint8Array(w * h);
    const groups = [];
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (!v || seen[i]) continue;
      const col = colorOf(v);
      if (col === GARBAGE_COLOR || specialOf(v) === SPECIAL_WILD) continue;
      // Flood fill; wild cells join any group but are not marked as globally
      // seen so they can also join a neighbouring group of another colour.
      const group = [];
      const local = new Set();
      const stack = [i];
      local.add(i);
      while (stack.length) {
        const j = stack.pop();
        group.push(j);
        if (specialOf(cells[j]) !== SPECIAL_WILD) seen[j] = 1;
        const c = j % w, r = (j / w) | 0;
        for (const [nc0, nr] of this.L.boardNeighbors(c, r)) {
          const nc = this.col(nc0);
          if (nc < 0 || nc >= w || nr < 0 || nr >= h) continue;
          const k = nr * w + nc;
          if (local.has(k)) continue;
          const nv = cells[k];
          if (!nv) continue;
          if (specialOf(nv) === SPECIAL_WILD || (colorOf(nv) === col && !seen[k])) {
            local.add(k);
            stack.push(k);
          }
        }
      }
      if (group.length >= min) groups.push({ color: col, cells: group });
    }
    return groups;
  }

  /**
   * Given a set of flat indices to remove, add everything caught in bomb
   * blasts (chaining). Returns { indices:Set, bombs:number }.
   */
  expandBombs(indexSet) {
    const w = this.w, h = this.h;
    const queue = [...indexSet];
    let bombs = 0;
    const done = new Set();
    while (queue.length) {
      const i = queue.pop();
      if (done.has(i)) continue;
      done.add(i);
      const v = this.cells[i];
      if (specialOf(v) !== SPECIAL_BOMB) continue;
      bombs++;
      const c = i % w, r = (i / w) | 0;
      for (const [nc0, nr] of this.L.boardNeighbors(c, r, true)) {
        const nc = this.col(nc0);
        if (nc < 0 || nc >= w || nr < 0 || nr >= h) continue;
        const k = nr * w + nc;
        if (this.cells[k] && !indexSet.has(k)) { indexSet.add(k); queue.push(k); }
      }
    }
    return { indices: indexSet, bombs };
  }

  /** Remove whole rows and shift everything above down (classic behaviour). */
  removeRows(rows) {
    if (!rows.length) return;
    const w = this.w;
    const sorted = [...rows].sort((a, b) => a - b);
    const keep = [];
    const drop = new Set(sorted);
    for (let r = 0; r < this.h; r++) if (!drop.has(r)) keep.push(r);
    const next = new Uint8Array(this.cells.length);
    // Kept rows stack at the bottom in order.
    let dst = this.h - 1;
    for (let k = keep.length - 1; k >= 0; k--, dst--) {
      next.set(this.cells.subarray(keep[k] * w, keep[k] * w + w), dst * w);
    }
    this.cells = next;
  }

  removeIndices(indices) { for (const i of indices) this.cells[i] = 0; }

  /** Every column compacts downward (cells fall into holes). Returns cells moved. */
  cascade() {
    const w = this.w, h = this.h, cells = this.cells;
    let moved = 0;
    for (let c = 0; c < w; c++) {
      let write = h - 1;
      for (let r = h - 1; r >= 0; r--) {
        const v = cells[r * w + c];
        if (!v) continue;
        if (write !== r) { cells[write * w + c] = v; cells[r * w + c] = 0; moved++; }
        write--;
      }
    }
    return moved;
  }

  /**
   * Push `rows` garbage rows up from the bottom, each with a single hole at
   * `holeCol` (or random per row via holes array). Returns true if any filled
   * cell was pushed off the top (top-out).
   */
  pushGarbage(holeCols) {
    const w = this.w, n = holeCols.length;
    let overflow = false;
    for (let i = 0; i < n * w; i++) if (this.cells[i]) { overflow = true; break; }
    this.cells.copyWithin(0, n * w);
    for (let k = 0; k < n; k++) {
      const r = this.h - n + k;
      for (let c = 0; c < w; c++) this.cells[r * w + c] = c === holeCols[k] ? 0 : makeCell(GARBAGE_COLOR);
    }
    return overflow;
  }

  /** Column heights measured from the floor (0 = empty column). */
  heights(out = new Int16Array(this.w)) {
    const w = this.w, h = this.h, cells = this.cells;
    for (let c = 0; c < w; c++) {
      let r = 0;
      while (r < h && !cells[r * w + c]) r++;
      out[c] = h - r;
    }
    return out;
  }

  /** Highest filled row index (smallest r) or h if the board is empty. */
  topRow() {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) return (i / this.w) | 0;
    return this.h;
  }

  toString() {
    const lines = [];
    for (let r = 0; r < this.h; r++) {
      let s = '';
      for (let c = 0; c < this.w; c++) s += this.cells[r * this.w + c] ? '#' : '.';
      lines.push(s);
    }
    return lines.join('\n');
  }

  /** Test helper: fill from an array of strings aligned to the bottom. '#' = garbage, digits = colour. */
  static fromRows(width, visible, rows, opts = {}) {
    const b = new Board(width, visible, opts);
    const off = b.h - rows.length;
    rows.forEach((line, i) => {
      for (let c = 0; c < width; c++) {
        const ch = line[c];
        if (!ch || ch === '.') continue;
        const col = ch === '#' ? GARBAGE_COLOR : parseInt(ch, 36) || GARBAGE_COLOR;
        b.set(c, off + i, makeCell(col));
      }
    });
    return b;
  }
}
