/* Game rules. Pure: no DOM, no timers, no randomness except the seeded RNG
   passed in, so every behaviour here is reproducible in node tests.

   Follows the Tetris Guideline: 10x20 visible matrix with a 20-row buffer,
   SRS rotation, 7-bag randomiser, hold, 5-piece preview, ghost, 1 s lock
   delay with 30-move extended placement, guideline scoring including T-spins,
   back-to-back, combos and perfect clears, block-out and lock-out top-outs.

   Time only advances through update(dtMs). Everything the presentation layer
   needs to react to is pushed onto `events` and drained by the caller. */

import { TYPES, SHAPES, BOX, SPAWN, kicks, typeId, T_CORNERS, T_FRONT } from './pieces.js';

export const COLS = 10;
export const ROWS = 40;
export const VISIBLE = 20;
export const GREY = 8;

export const LOCK_DELAY = 1000;
export const MOVE_RESET_LIMIT = 30;
export const LINE_CLEAR_DELAY = 380;
export const PREVIEW = 5;

export const MODES = {
  marathon: { goalLines: 150, timeLimit: 0, levelUp: true, maxLevel: 15 },
  sprint: { goalLines: 40, timeLimit: 0, levelUp: false, maxLevel: 1 },
  ultra: { goalLines: 0, timeLimit: 180000, levelUp: false, maxLevel: 1 },
  endless: { goalLines: 0, timeLimit: 0, levelUp: true, maxLevel: 20 }
};

const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];
const MINI_SCORE = [100, 200, 400];
const PC_SCORE = [0, 800, 1200, 1800, 2000];
const PC_B2B_TETRIS = 3200;

export const CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris'];

/* Milliseconds per row. Tuned to be relaxed, far gentler than the guideline
   curve (which hits 20G by level 15): 2 s per row at level 1, each level 8%
   faster, so level 10 is ~1 row/s and level 20 ~2.4 rows/s. Floored at 200 ms. */
export function gravityInterval(level) {
  const l = Math.min(Math.max(level, 1), 20);
  return Math.max(200, 2000 * Math.pow(0.92, l - 1));
}

/* mulberry32: tiny, fast, good enough for a piece randomiser. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor({ mode = 'marathon', startLevel = 1, seed = Date.now(), sdf = 20 } = {}) {
    if (!MODES[mode]) throw new Error(`unknown mode: ${mode}`);
    this.mode = mode;
    this.rules = MODES[mode];
    this.rng = makeRng(seed);
    this.sdf = sdf;              // soft drop factor; Infinity = instant
    this.board = new Uint8Array(COLS * ROWS);
    this.bag = [];
    this.queue = [];
    this.events = [];

    this.startLevel = this.rules.levelUp ? Math.min(Math.max(startLevel | 0, 1), this.rules.maxLevel) : 1;
    this.level = this.startLevel;
    this.score = 0;
    this.lines = 0;
    this.time = 0;
    this.stats = {
      pieces: 0, singles: 0, doubles: 0, triples: 0, tetrises: 0,
      tspins: 0, minis: 0, perfects: 0, maxCombo: 0, maxB2B: 0, holds: 0
    };

    this.combo = -1;
    this.b2b = -1;               // -1: no chain; >= 0: consecutive difficult clears after the first
    this.hold = null;
    this.holdUsed = false;

    this.piece = null;
    this.softDropping = false;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.moveResets = 0;
    this.lowestY = Infinity;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;

    this.state = 'ready';        // ready | playing | clearing | over | finished
    this.clearTimer = 0;
    this.clearingRows = [];
    this.pendingClear = null;
    this.overReason = '';

    this.fillQueue();
  }

  /* ---------- randomiser ---------- */

  nextFromBag() {
    if (this.bag.length === 0) {
      this.bag = TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  fillQueue() {
    while (this.queue.length < PREVIEW + 1) this.queue.push(this.nextFromBag());
  }

  /* ---------- board helpers ---------- */

  cell(x, y) {
    if (x < 0 || x >= COLS || y < 0) return 9; // walls and floor are solid
    if (y >= ROWS) return 0;
    return this.board[y * COLS + x];
  }

  fits(type, rot, x, y) {
    for (const [cx, cy] of SHAPES[type][rot]) {
      if (this.cell(x + cx, y + cy) !== 0) return false;
    }
    return true;
  }

  cellsOf(p = this.piece) {
    return SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  ghostY(p = this.piece) {
    let y = p.y;
    while (this.fits(p.type, p.rot, p.x, y - 1)) y--;
    return y;
  }

  onGround(p = this.piece) {
    return !this.fits(p.type, p.rot, p.x, p.y - 1);
  }

  stackHeight() {
    for (let y = ROWS - 1; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) if (this.board[y * COLS + x]) return y + 1;
    }
    return 0;
  }

  /* ---------- lifecycle ---------- */

  start() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.spawn();
  }

  spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
    }
    const [x, y] = SPAWN[type];
    const p = { type, rot: 0, x, y };
    if (!this.fits(type, 0, x, y)) {
      this.piece = p;
      return this.topOut('Block out');
    }
    // Guideline: the piece drops one row immediately if nothing is in the way.
    if (this.fits(type, 0, x, y - 1)) p.y--;
    this.piece = p;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.moveResets = 0;
    this.lowestY = p.y;
    this.lastMoveWasRotation = false;
    this.lastKickIndex = 0;
    this.emit({ type: 'spawn', piece: type });
    return true;
  }

  topOut(reason) {
    this.state = 'over';
    this.overReason = reason;
    this.emit({ type: 'gameOver', reason });
    return false;
  }

  emit(e) { this.events.push(e); }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get active() { return this.state === 'playing' && this.piece !== null; }

  /* ---------- player actions ---------- */

  /* Successful move or rotation while grounded resets the lock timer, up to
     MOVE_RESET_LIMIT times per new lowest row (guideline "extended placement"). */
  afterManipulation() {
    const p = this.piece;
    if (p.y < this.lowestY) {
      this.lowestY = p.y;
      this.moveResets = 0;
    }
    if (this.onGround()) {
      if (this.moveResets < MOVE_RESET_LIMIT) {
        this.moveResets++;
        this.lockTimer = 0;
      } else {
        this.lock();
      }
    }
  }

  move(dx) {
    if (!this.active) return false;
    const p = this.piece;
    if (!this.fits(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastMoveWasRotation = false;
    this.emit({ type: 'move', dx });
    this.afterManipulation();
    return true;
  }

  /* dir: +1 clockwise, -1 counter-clockwise, 2 half turn. */
  rotate(dir) {
    if (!this.active) return false;
    const p = this.piece;
    if (p.type === 'O') {
      // O never changes shape but a rotation input still counts as a manipulation.
      this.emit({ type: 'rotate', dir, kick: 0, dx: 0, dy: 0 });
      return false;
    }
    const to = (p.rot + (dir === 2 ? 2 : dir) + 4) % 4;
    const table = kicks(p.type, p.rot, to);
    for (let i = 0; i < table.length; i++) {
      const [kx, ky] = table[i];
      if (this.fits(p.type, to, p.x + kx, p.y + ky)) {
        const from = p.rot;
        p.x += kx;
        p.y += ky;
        p.rot = to;
        this.lastMoveWasRotation = true;
        this.lastKickIndex = i;
        this.emit({ type: 'rotate', dir, from, to, kick: i, dx: kx, dy: ky });
        this.afterManipulation();
        return true;
      }
    }
    return false;
  }

  hardDrop() {
    if (!this.active) return false;
    const p = this.piece;
    const fromY = p.y;
    const y = this.ghostY();
    const dist = fromY - y;
    if (dist > 0) this.lastMoveWasRotation = false;
    p.y = y;
    this.score += dist * 2;
    this.emit({ type: 'hardDrop', distance: dist, fromY, cells: this.cellsOf(), piece: p.type });
    this.lock();
    return true;
  }

  setSoftDrop(on) {
    this.softDropping = !!on;
  }

  holdPiece() {
    if (!this.active || this.holdUsed) return false;
    const current = this.piece.type;
    const swapIn = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.stats.holds++;
    this.emit({ type: 'hold', piece: current });
    this.piece = null;
    this.spawn(swapIn || undefined);
    return true;
  }

  /* ---------- gravity and locking ---------- */

  stepDown() {
    const p = this.piece;
    if (!this.fits(p.type, p.rot, p.x, p.y - 1)) return false;
    p.y--;
    this.lastMoveWasRotation = false;
    if (p.y < this.lowestY) {
      this.lowestY = p.y;
      this.moveResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  update(dt) {
    if (this.state === 'playing' || this.state === 'clearing') {
      this.time += dt;
      if (this.rules.timeLimit && this.time >= this.rules.timeLimit) {
        this.time = this.rules.timeLimit;
        return this.finish('Time');
      }
    }

    if (this.state === 'clearing') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.completeClear();
      return;
    }
    if (!this.active) return;

    const gravity = gravityInterval(this.level);
    const soft = this.softDropping;
    const interval = soft ? (this.sdf === Infinity ? 0 : Math.min(gravity, gravity / this.sdf)) : gravity;

    if (interval === 0) {
      // Instant soft drop: fall to the floor, scoring one point per row.
      const y = this.ghostY();
      const d = this.piece.y - y;
      if (d > 0) {
        this.piece.y = y;
        this.score += d;
        this.lastMoveWasRotation = false;
        if (y < this.lowestY) { this.lowestY = y; this.moveResets = 0; this.lockTimer = 0; }
        this.emit({ type: 'softDrop', rows: d });
      }
    } else {
      this.gravityAcc += dt;
      let rows = 0;
      while (this.gravityAcc >= interval) {
        this.gravityAcc -= interval;
        if (!this.stepDown()) { this.gravityAcc = 0; break; }
        rows++;
      }
      if (rows && soft) {
        this.score += rows;
        this.emit({ type: 'softDrop', rows });
      }
    }

    if (this.onGround()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  /* T-spin check per guideline: last manoeuvre was a rotation, and 3 of the 4
     diagonal corners of the T's centre are occupied. Full when both front
     corners are filled, or when the rotation used the final (TST) kick. */
  detectTSpin() {
    const p = this.piece;
    if (p.type !== 'T' || !this.lastMoveWasRotation) return 'none';
    const cx = p.x + 1, cy = p.y + 1;
    let filled = 0;
    for (const [dx, dy] of T_CORNERS) if (this.cell(cx + dx, cy + dy) !== 0) filled++;
    if (filled < 3) return 'none';
    const front = T_FRONT[p.rot].filter(([dx, dy]) => this.cell(cx + dx, cy + dy) !== 0).length;
    if (front === 2 || this.lastKickIndex === 4) return 'full';
    return 'mini';
  }

  lock() {
    const p = this.piece;
    const cells = this.cellsOf();
    const tspin = this.detectTSpin();
    const id = typeId(p.type);
    for (const [x, y] of cells) this.board[y * COLS + x] = id;
    this.piece = null;
    this.stats.pieces++;
    this.holdUsed = false;

    // Lock out: the whole piece came to rest above the visible matrix.
    if (cells.every(([, y]) => y >= VISIBLE)) {
      this.emit({ type: 'lock', cells, piece: p.type, tspin });
      return this.topOut('Lock out');
    }

    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) if (!this.board[y * COLS + x]) { full = false; break; }
      if (full) rows.push(y);
    }

    this.emit({ type: 'lock', cells, piece: p.type, tspin });
    this.scoreLock(rows.length, tspin, rows);

    if (rows.length) {
      this.state = 'clearing';
      this.clearTimer = LINE_CLEAR_DELAY;
      this.clearingRows = rows;
    } else {
      this.afterLock();
    }
  }

  scoreLock(n, tspin, rows) {
    const level = this.level;
    let base = 0;
    let difficult = false;
    let label = '';

    if (tspin === 'full') {
      base = TSPIN_SCORE[n];
      difficult = n > 0;
      label = n ? `T-Spin ${CLEAR_NAMES[n]}` : 'T-Spin';
      this.stats.tspins++;
    } else if (tspin === 'mini') {
      base = MINI_SCORE[Math.min(n, 2)];
      difficult = n > 0;
      label = n ? `T-Spin Mini ${CLEAR_NAMES[n]}` : 'T-Spin Mini';
      this.stats.minis++;
    } else if (n) {
      base = LINE_SCORE[n];
      difficult = n === 4;
      label = CLEAR_NAMES[n];
    }

    let b2bActive = false;
    if (n > 0) {
      if (difficult) {
        this.b2b++;
        b2bActive = this.b2b > 0;
        if (b2bActive) base = Math.floor(base * 1.5);
        this.stats.maxB2B = Math.max(this.stats.maxB2B, this.b2b);
      } else {
        this.b2b = -1;
      }
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      ['', 'singles', 'doubles', 'triples', 'tetrises'].forEach((k, i) => { if (i === n && k) this.stats[k]++; });
    } else {
      this.combo = -1;
    }

    let points = base * level;
    const comboBonus = n > 0 && this.combo > 0 ? 50 * this.combo * level : 0;
    points += comboBonus;

    // Perfect clear: nothing remains once the full rows are removed.
    let perfect = false;
    if (n > 0) {
      const cleared = new Set(rows);
      perfect = true;
      for (let y = 0; y < ROWS && perfect; y++) {
        if (cleared.has(y)) continue;
        for (let x = 0; x < COLS; x++) if (this.board[y * COLS + x]) { perfect = false; break; }
      }
      if (perfect) {
        points += (n === 4 && b2bActive ? PC_B2B_TETRIS : PC_SCORE[n]) * level;
        this.stats.perfects++;
      }
    }

    this.score += points;

    if (n > 0 || tspin !== 'none') {
      this.emit({
        type: 'clear', rows: rows.slice(), lines: n, tspin, label, b2b: b2bActive,
        b2bCount: this.b2b, combo: this.combo, perfect, points, level
      });
    }

    if (n > 0) {
      const before = this.level;
      this.lines += n;
      if (this.rules.levelUp) {
        this.level = Math.min(this.rules.maxLevel, this.startLevel + Math.floor(this.lines / 10));
      }
      if (this.level > before) this.emit({ type: 'levelUp', level: this.level });
    }
  }

  completeClear() {
    const rows = this.clearingRows;
    const cleared = new Set(rows);
    const next = new Uint8Array(COLS * ROWS);
    let ny = 0;
    for (let y = 0; y < ROWS; y++) {
      if (cleared.has(y)) continue;
      next.set(this.board.subarray(y * COLS, y * COLS + COLS), ny * COLS);
      ny++;
    }
    this.board = next;
    this.clearingRows = [];
    this.state = 'playing';
    this.emit({ type: 'collapse', rows });
    this.afterLock();
  }

  afterLock() {
    if (this.rules.goalLines && this.lines >= this.rules.goalLines) {
      return this.finish('Goal');
    }
    this.spawn();
  }

  finish(reason) {
    this.state = 'finished';
    this.piece = null;
    this.emit({ type: 'finish', reason });
    return false;
  }

  /* Plain snapshot for results screens and records. */
  summary() {
    const secs = this.time / 1000;
    return {
      mode: this.mode,
      score: this.score,
      lines: this.lines,
      level: this.level,
      time: Math.round(this.time),
      pieces: this.stats.pieces,
      pps: secs > 0 ? this.stats.pieces / secs : 0,
      ...this.stats,
      finished: this.state === 'finished',
      reason: this.state === 'finished' ? 'finish' : this.overReason
    };
  }
}

export { BOX };
