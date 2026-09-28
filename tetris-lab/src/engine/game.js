/* The game state machine.

   One Game runs one ruleset: Classic, any Lab concept, a bot simulation. It is
   deterministic given (rules, seed, inputs, tick deltas) and has no DOM, audio
   or timing dependencies -- the UI calls tick(dtMs) from its frame loop, and
   drains `events` to drive rendering, particles and sound.

   Phases:
     ready     created, not started
     playing   a piece is active
     clearing  a clear is being animated; the board still shows the cells,
               `pending` describes what will be removed when the timer ends
     over      topped out (block out / lock out / garbage overflow)
     done      a goal was met (sprint lines, ultra time)                  */

import { Board, SPECIAL_BOMB, SPECIAL_WILD } from './board.js';
import { Rng } from './rng.js';
import { makeRandomizer } from './randomizer.js';
import { findClear, applyClear } from './clearing.js';

export const PHASE = Object.freeze({
  READY: 'ready', PLAYING: 'playing', CLEARING: 'clearing', OVER: 'over', DONE: 'done'
});

const GUIDELINE_LINES = [0, 100, 300, 500, 800];
const GUIDELINE_TSPIN = [400, 800, 1200, 1600];
const GUIDELINE_MINI = [100, 200, 400];
const GUIDELINE_PC = [0, 800, 1200, 1800, 2000];
const LAB_LINES = [0, 100, 300, 500, 800, 1200, 1600, 2000, 2500, 3000];

/* T-spin corners in the 3x3 SRS box, and which two are "front" per state. */
const T_CORNERS = [[0, 0], [2, 0], [2, 2], [0, 2]];
const T_FRONT = [[0, 1], [1, 2], [2, 3], [3, 0]];

export class Game {
  /**
   * @param rules   compiled ruleset (rules.js)
   * @param opts    { seed, randomizer, previews, instant, goal, startLevel, mode }
   *                goal: { type: 'lines' | 'time', value }
   */
  constructor(rules, opts = {}) {
    this.rules = rules;
    this.seed = opts.seed >>> 0;
    this.rng = new Rng(this.seed || 1);
    this.cellRng = this.rng.fork();
    this.garbageRng = this.rng.fork();
    this.board = new Board(rules.width, rules.height, {
      lattice: rules.lattice, wrap: rules.wrap, buffer: rules.buffer
    });
    this.preBoard = this.board.clone();
    this.randomizer = opts.randomizer || makeRandomizer(rules, this.rng.fork());
    this.previews = Math.max(1, Math.min(6, opts.previews ?? 5));
    this.instant = !!opts.instant;
    this.goal = opts.goal || null;
    this.mode = opts.mode || 'marathon';
    this.startLevel = Math.max(1, Math.min(rules.maxLevel, opts.startLevel || 1));

    this.phase = PHASE.READY;
    this.queue = [];
    this.active = null;
    this.hold = null;
    this.holdUsed = false;
    this.softDrop = false;
    this.events = [];
    this.pending = null;
    this.clearTimer = 0;
    this.chain = 0;
    this.danger = 0;
    this.overReason = '';

    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = -Infinity;
    this.lastAction = '';
    this.lastKick = 0;
    this.piecesSinceGarbage = 0;

    this.stats = {
      score: 0, lines: 0, progress: 0, level: this.startLevel, pieces: 0, timeMs: 0,
      combo: -1, maxCombo: 0, b2b: false, b2bCount: 0, tetrises: 0, tspins: 0, pcs: 0,
      maxChain: 0, bombs: 0, groups: 0, cellsCleared: 0, softCells: 0, hardCells: 0,
      holds: 0, clears: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], perPiece: new Array(rules.pieces.length).fill(0),
      clutches: 0, garbageRows: 0, maxHeight: 0
    };
  }

  /* ------------------------------------------------------------ public -- */

  start() {
    if (this.phase !== PHASE.READY) return;
    this.phase = PHASE.PLAYING;
    this.fillQueue();
    this.emit({ type: 'start' });
    this.spawnNext();
  }

  get level() { return this.stats.level; }
  get isOver() { return this.phase === PHASE.OVER || this.phase === PHASE.DONE; }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  msPerRow() { return this.rules.msPerRow(this.stats.level); }

  /** Milliseconds a timed-placement piece may hover. */
  placeLimit() { return this.rules.placeSeconds(this.stats.level) * 1000; }

  /** 0..1 progress of the placement clock (timed placement only). */
  get placeProgress() {
    return this.rules.placement === 'timed' && this.active ? Math.min(1, (this.placeTimer || 0) / this.placeLimit()) : 0;
  }

  tick(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 250); // a backgrounded tab must not teleport the piece
    if (this.phase === PHASE.PLAYING || this.phase === PHASE.CLEARING) {
      this.stats.timeMs += dt;
      if (this.goal?.type === 'time' && this.stats.timeMs >= this.goal.value) {
        this.stats.timeMs = this.goal.value;
        this.finish('time');
        return;
      }
    }
    if (this.phase === PHASE.CLEARING) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.applyPending();
      return;
    }
    if (this.phase !== PHASE.PLAYING || !this.active) return;

    const a = this.active;
    const st = a.p.states[a.s];
    const timed = this.rules.placement === 'timed';
    const soft = this.softDrop;
    if (timed) {
      // Clockwork placement: no gravity; the piece drops itself when time runs out.
      this.placeTimer += dt;
      if (this.placeTimer >= this.placeLimit()) {
        this.emit({ type: 'timeout' });
        this.hardDrop();
        return;
      }
    }
    let ms = timed ? Infinity : this.msPerRow() / a.p.fall;
    if (soft) ms = Math.min(this.msPerRow() / (this.softFactor || 20), 50);
    // No gravity (timed placement): never bank time, or soft drop would teleport.
    this.gravityAcc = ms === Infinity ? 0 : this.gravityAcc + dt;
    let guard = this.board.h + 2;
    while (this.gravityAcc >= ms && guard-- > 0) {
      this.gravityAcc -= ms;
      if (this.board.fits(st, a.x, a.y + 1)) {
        a.y++;
        this.onFall();
        if (soft) { this.stats.score += 1; this.stats.softCells++; this.emit({ type: 'softdrop' }); }
      } else { this.gravityAcc = 0; break; }
    }
    if (guard <= 0) this.gravityAcc = 0;

    if (!this.board.fits(st, a.x, a.y + 1)) {
      this.lockTimer += dt;
      if (this.lockTimer >= this.rules.lockDelay) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  setSoftDrop(on, factor = 20) { this.softDrop = !!on; if (on) this.softFactor = Math.max(2, Math.min(40, factor)); }

  move(dx) {
    const a = this.active;
    if (this.phase !== PHASE.PLAYING || !a) return false;
    const nx = this.board.wrap ? this.board.col(a.x + dx) : a.x + dx;
    if (!this.board.fits(a.p.states[a.s], nx, a.y)) {
      this.emit({ type: 'blocked', dx });
      return false;
    }
    a.x = nx;
    this.lastAction = 'move';
    this.emit({ type: 'move', dx });
    this.onManipulate();
    return true;
  }

  /** Slide as far as possible (used for ARR = 0). Returns cells moved. */
  shift(dx) {
    let n = 0;
    const limit = this.board.w;
    while (n < limit && this.moveQuiet(dx)) n++;
    if (n) this.emit({ type: 'move', dx, n });
    return n;
  }

  moveQuiet(dx) {
    const a = this.active;
    if (this.phase !== PHASE.PLAYING || !a) return false;
    const nx = this.board.wrap ? this.board.col(a.x + dx) : a.x + dx;
    if (!this.board.fits(a.p.states[a.s], nx, a.y)) return false;
    a.x = nx;
    this.lastAction = 'move';
    this.onManipulate();
    return true;
  }

  /** One manual row of soft drop (touch drag). */
  stepDown() {
    const a = this.active;
    if (this.phase !== PHASE.PLAYING || !a) return false;
    if (!this.board.fits(a.p.states[a.s], a.x, a.y + 1)) return false;
    a.y++;
    this.onFall();
    this.stats.score += 1;
    this.stats.softCells++;
    this.emit({ type: 'softdrop' });
    return true;
  }

  rotate(kind = 'cw') {
    const a = this.active;
    // Initial Rotation System: a rotation pressed during the clear delay is
    // buffered and applied the moment the next piece spawns.
    if (this.phase === PHASE.CLEARING) { this.irs = kind; return true; }
    if (this.phase !== PHASE.PLAYING || !a) return false;
    const target = a.p.trans[a.s]?.[kind];
    if (target === undefined || target < 0) { this.emit({ type: 'blocked', rotate: true }); return false; }
    if (target === a.s) return false;
    const kicks = a.p.kicksFor(a.s, target, kind);
    const st = a.p.states[target];
    for (let i = 0; i < kicks.length; i++) {
      const nx = this.board.wrap ? this.board.col(a.x + kicks[i][0]) : a.x + kicks[i][0];
      const ny = a.y + kicks[i][1];
      if (this.board.fits(st, nx, ny)) {
        const from = a.s;
        a.s = target; a.x = nx; a.y = ny;
        this.lastAction = 'rotate';
        this.lastKick = i;
        this.emit({ type: 'rotate', kind, from, to: target, kicked: i > 0 });
        if (ny > this.lowestY) this.onFall();
        this.onManipulate();
        return true;
      }
    }
    this.emit({ type: 'blocked', rotate: true });
    return false;
  }

  flip() { return this.rotate('flip'); }

  hardDrop() {
    const a = this.active;
    if (this.phase !== PHASE.PLAYING || !a) return false;
    const st = a.p.states[a.s];
    const y0 = a.y;
    const y1 = this.board.dropY(st, a.x, a.y);
    const d = y1 - y0;
    if (d > 0) this.lastAction = 'drop';
    a.y = y1;
    this.stats.score += 2 * d;
    this.stats.hardCells += d;
    this.emit({ type: 'harddrop', distance: d, fromY: y0, cells: this.board.cellsOf(st, a.x, y1), colors: a.inst.colors });
    this.lock();
    return true;
  }

  holdPiece() {
    // Initial Hold System: buffered like IRS.
    if (this.phase === PHASE.CLEARING && this.rules.hold) { this.ihs = true; return true; }
    if (this.phase !== PHASE.PLAYING || !this.active || !this.rules.hold || this.holdUsed) return false;
    const cur = this.active.inst;
    const prev = this.hold;
    this.hold = cur;
    this.holdUsed = true;
    this.stats.holds++;
    this.emit({ type: 'hold' });
    if (prev) this.spawn(prev); else this.spawnNext();
    return true;
  }

  ghostY() {
    const a = this.active;
    if (!a) return 0;
    return this.board.dropY(a.p.states[a.s], a.x, a.y);
  }

  /** Bot / simulation: jump straight to a placement and lock it. */
  place(s, x) {
    const a = this.active;
    if (this.phase !== PHASE.PLAYING || !a) return false;
    const st = a.p.states[s];
    let y = a.y;
    if (!this.board.fits(st, x, y)) {
      // Search upward a few rows for a legal entry point (tall rotated shapes).
      let found = false;
      for (let dy = 1; dy <= this.board.buffer; dy++) if (this.board.fits(st, x, y - dy)) { y -= dy; found = true; break; }
      if (!found) return false;
    }
    a.s = s; a.x = x; a.y = this.board.dropY(st, x, y);
    this.lastAction = 'drop';
    this.lock();
    return true;
  }

  /** Force the next pieces (debug panel). */
  forceNext(indices) {
    this.queue.splice(0, indices.length, ...indices.map((i) => this.makeInstance(i)));
  }

  /* ----------------------------------------------------------- internal -- */

  emit(e) { this.events.push(e); }

  fillQueue() {
    let guard = 64;
    while (this.queue.length < this.previews && guard-- > 0) {
      let idx = this.randomizer.next(this);
      if (!Number.isInteger(idx) || idx < 0 || idx >= this.rules.pieces.length) idx = 0;
      this.queue.push(this.makeInstance(idx));
    }
  }

  makeInstance(idx) {
    const p = this.rules.pieces[idx];
    const n = p.size;
    const colors = new Uint8Array(n);
    const specials = new Uint8Array(n);
    const mode = this.rules.colorMode;
    const pal = this.rules.palette;
    if (mode === 'piece') colors.set(p.colors);
    else if (mode === 'random-piece') colors.fill(this.cellRng.pick(pal));
    else for (let i = 0; i < n; i++) colors[i] = this.cellRng.pick(pal);
    if (this.rules.bombChance > 0 && this.cellRng.chance(this.rules.bombChance)) {
      specials[this.cellRng.int(n)] = SPECIAL_BOMB;
    }
    if (this.rules.wildChance > 0 && this.cellRng.chance(this.rules.wildChance)) {
      const i = this.cellRng.int(n);
      if (!specials[i]) specials[i] = SPECIAL_WILD;
    }
    return { p: idx, colors, specials };
  }

  spawnNext() {
    this.fillQueue();
    const inst = this.queue.shift();
    this.fillQueue();
    this.spawn(inst);
  }

  spawnPosition(p, s = 0) {
    const w = this.board.w;
    const st = p.states[s];
    let x = Math.floor((w - (st.v[0].maxX - st.v[0].minX + 1)) / 2) - st.v[0].minX;
    const v = st.v[x & 1];
    x = Math.floor((w - (v.maxX - v.minX + 1)) / 2) - v.minX;
    const vv = st.v[x & 1];
    const y = this.board.buffer - 1 - vv.maxY;
    return { x, y };
  }

  spawn(inst) {
    const p = this.rules.pieces[inst.p];
    const { x, y } = this.spawnPosition(p);
    const st = p.states[0];
    if (!this.board.fits(st, x, y)) {
      this.active = { inst, p, s: 0, x, y };
      this.gameOver('blockout');
      return;
    }
    this.active = { inst, p, s: 0, x, y };
    // Guideline: drop one row immediately if nothing is in the way.
    if (this.board.fits(st, x, y + 1)) this.active.y++;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.placeTimer = 0;
    this.lowestY = this.active.y;
    this.lastAction = 'spawn';
    this.lastKick = 0;
    this.emit({ type: 'spawn', piece: inst.p });
    if (this.ihs) {
      this.ihs = false;
      if (this.holdPiece()) return;   // holdPiece() respawns, which applies any IRS
    }
    if (this.irs) {
      const k = this.irs;
      this.irs = null;
      this.rotate(k);
    }
  }

  onFall() {
    const a = this.active;
    if (a.y > this.lowestY) {
      this.lowestY = a.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
  }

  onManipulate() {
    const a = this.active;
    const grounded = !this.board.fits(a.p.states[a.s], a.x, a.y + 1);
    if (this.lockTimer > 0 || grounded) {
      if (this.lockResets < this.rules.lockResets) {
        this.lockResets++;
        this.lockTimer = 0;
      } else if (grounded) {
        // Out of resets: lock immediately rather than allowing infinite stalling.
        this.lock();
      }
    }
  }

  detectTSpin() {
    const a = this.active;
    if (!a.p.tspin || this.lastAction !== 'rotate') return null;
    let occupied = 0;
    const occ = T_CORNERS.map(([cx, cy]) => {
      const o = this.board.solid(a.x + cx, a.y + cy);
      if (o) occupied++;
      return o;
    });
    if (occupied < 3) return null;
    const [f1, f2] = T_FRONT[a.s];
    const full = (occ[f1] && occ[f2]) || this.lastKick === 4;
    return full ? 'full' : 'mini';
  }

  lock() {
    const a = this.active;
    if (!a || this.phase !== PHASE.PLAYING) return;
    const st = a.p.states[a.s];
    this.preBoard.copyFrom(this.board);
    const tspin = this.detectTSpin();
    const res = this.board.place(st, a.x, a.y, a.inst.colors, a.inst.specials);
    this.stats.pieces++;
    this.stats.perPiece[a.inst.p]++;
    const info = { piece: a.inst.p, s: a.s, x: a.x, y: a.y, cells: res.cells, tspin };
    this.lastLock = info;
    this.emit({ type: 'lock', ...info, colors: a.inst.colors });
    this.randomizer.observeLock?.(this, info);
    this.active = null;
    this.holdUsed = false;

    const allHidden = res.cells.every(([, r]) => r < this.board.buffer);
    if (res.above > 0 || allHidden) {
      this.gameOver('lockout');
      return;
    }
    this.chain = 0;
    this.lockTspin = tspin;
    this.preTop = this.preBoard.topRow();
    this.resolve(true);
  }

  /** Look for clears on the current board; schedule or finish the turn. */
  resolve(first) {
    const found = this.findClear();
    if (!found) {
      if (first) {
        // A lock with no clear breaks the combo.
        this.stats.combo = -1;
        if (this.lockTspin && this.rules.scoring === 'guideline') {
          const pts = (this.lockTspin === 'mini' ? GUIDELINE_MINI[0] : GUIDELINE_TSPIN[0]) * this.stats.level;
          this.stats.score += pts;
          this.stats.tspins++;
          this.emit({ type: 'tspin', mini: this.lockTspin === 'mini', lines: 0, points: pts });
        }
      }
      this.endTurn();
      return;
    }
    this.chain++;
    this.scoreClear(found, first);
    this.pending = found;
    this.emit({
      type: 'clear', rows: found.rows, removed: found.removedCells, lines: found.lines,
      groups: found.groups, bombs: found.bombs, chain: this.chain, tspin: first ? this.lockTspin : null,
      combo: this.stats.combo, b2b: found.b2b, points: found.points, label: found.label,
      clutch: found.clutch
    });
    if (this.instant) this.applyPending();
    else {
      this.phase = PHASE.CLEARING;
      this.clearTimer = this.rules.clearDelay;
    }
  }

  findClear() {
    const f = findClear(this.board, this.rules);
    if (!f) return null;
    f.removedCells = [];
    for (const i of f.indices) f.removedCells.push([i % this.board.w, (i / this.board.w) | 0, this.board.cells[i]]);
    return f;
  }

  scoreClear(f, first) {
    const s = this.stats;
    const lvl = s.level;
    const guideline = this.rules.scoring === 'guideline';
    const lines = f.lines;
    let pts = 0;
    let label = '';
    let difficult = false;
    if (first) s.combo++;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;

    if (guideline) {
      const ts = first ? this.lockTspin : null;
      if (ts === 'full') { pts = GUIDELINE_TSPIN[Math.min(3, lines)]; label = `T-SPIN ${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][Math.min(3, lines)]}`; }
      else if (ts === 'mini') { pts = GUIDELINE_MINI[Math.min(2, lines)]; label = `MINI T-SPIN ${['', 'SINGLE', 'DOUBLE'][Math.min(2, lines)]}`; }
      else { pts = GUIDELINE_LINES[Math.min(4, lines)]; label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][Math.min(4, lines)]; }
      if (ts) s.tspins++;
      difficult = lines >= 4 || (!!ts && lines > 0);
      pts *= lvl;
    } else {
      if (lines) {
        pts = (LAB_LINES[lines] ?? 3000 + (lines - 9) * 500) * lvl;
        label = lines >= 4 ? `${lines}-LINE CLEAR` : ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][lines];
        difficult = lines >= 4;
      }
      if (f.groups) {
        const cells = f.groupSizes.reduce((a, b) => a + b, 0);
        const extra = f.groupSizes.reduce((a, n) => a + Math.max(0, n - this.rules.clear.matchSize), 0);
        pts += (cells * 10 + extra * 20 + (f.groups - 1) * 60) * lvl;
        label = f.groups > 1 ? `${f.groups}× MATCH` : 'MATCH';
        difficult = f.groups >= 2 || cells >= this.rules.clear.matchSize + 3;
      }
      if (this.chain > 1) {
        pts = Math.round(pts * (1 + 0.6 * (this.chain - 1)));
        label = `CHAIN ×${this.chain}`;
      }
    }
    if (f.bombs) {
      pts += f.bombCells * 25 * lvl;
      s.bombs += f.bombs;
      if (!label) label = 'BLAST';
    }
    let b2b = false;
    if (first) {
      if (difficult && s.b2b) { pts = Math.round(pts * 1.5); b2b = true; s.b2bCount++; }
      if (lines > 0 || f.groups > 0) s.b2b = difficult;
      if (s.combo > 0) pts += 50 * s.combo * lvl;
    }
    s.score += pts;
    s.lines += lines;
    s.groups += f.groups;
    s.cellsCleared += f.indices.size;
    if (lines) s.clears[Math.min(9, lines)]++;
    if (lines >= 4) s.tetrises++;
    if (this.chain > s.maxChain) s.maxChain = this.chain;

    // A clear made while the stack was within four rows of the top: "clutch".
    const clutch = first && this.preTop < this.board.buffer + 4;
    if (clutch) s.clutches++;

    f.points = pts;
    f.label = label;
    f.b2b = b2b;
    f.clutch = clutch;

    const units = this.rules.progressUnit === 'groups' ? f.groups : lines;
    if (units > 0) {
      s.progress += units;
      const lvlNow = Math.min(this.rules.maxLevel, this.startLevel + Math.floor(s.progress / this.rules.linesPerLevel));
      if (lvlNow > s.level) {
        s.level = lvlNow;
        this.emit({ type: 'levelup', level: lvlNow });
      }
    }
  }

  applyPending() {
    const f = this.pending;
    this.pending = null;
    if (!f) { this.endTurn(); return; }
    const b = this.board;
    applyClear(b, this.rules, f);
    this.emit({ type: 'collapse', rows: f.rows, cascade: this.rules.gravityMode === 'cascade' });
    this.phase = PHASE.PLAYING;
    if (b.isEmpty()) {
      const s = this.stats;
      const idx = Math.min(4, f.lines || 4);
      let pts = (this.rules.scoring === 'guideline' ? GUIDELINE_PC[idx] : 1500) * s.level;
      if (this.rules.scoring === 'guideline' && f.lines >= 4 && f.b2b) pts = 3200 * s.level;
      s.score += pts;
      s.pcs++;
      this.emit({ type: 'perfect', points: pts });
    }
    if (this.rules.gravityMode === 'cascade') {
      this.resolve(false);   // chains
      return;
    }
    this.endTurn();
  }

  endTurn() {
    if (this.phase === PHASE.OVER || this.phase === PHASE.DONE) return;
    this.phase = PHASE.PLAYING;
    if (this.goal?.type === 'lines' && this.stats.lines >= this.goal.value) {
      this.finish('lines');
      return;
    }
    if (this.rules.garbageEvery > 0) {
      this.piecesSinceGarbage++;
      if (this.piecesSinceGarbage >= this.rules.garbageEvery) {
        this.piecesSinceGarbage = 0;
        const hole = this.garbageRng.int(this.board.w);
        const overflow = this.board.pushGarbage([hole]);
        this.stats.garbageRows++;
        this.emit({ type: 'garbage', rows: 1 });
        if (overflow) { this.gameOver('topout'); return; }
      }
    }
    this.updateDanger();
    this.spawnNext();
  }

  updateDanger() {
    const top = this.board.topRow();
    const height = this.board.h - top;
    const vis = this.board.visible;
    this.stats.maxHeight = Math.max(this.stats.maxHeight, Math.min(vis, height));
    this.danger = Math.max(0, Math.min(1, (height - vis * 0.55) / (vis * 0.4)));
  }

  gameOver(reason) {
    this.irs = null;
    this.ihs = false;
    this.phase = PHASE.OVER;
    this.overReason = reason;
    this.emit({ type: 'gameover', reason });
  }

  finish(reason) {
    this.phase = PHASE.DONE;
    this.active = null;
    this.overReason = reason;
    this.emit({ type: 'complete', reason });
  }
}
