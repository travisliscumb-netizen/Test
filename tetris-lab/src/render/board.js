/* Board renderer.

   Draws one Game onto a canvas: well background and grid, locked cells, the
   ghost, the active piece, and the short animations that make the logic feel
   physical -- clear flashes, rows falling into place, hard-drop streaks, lock
   flashes, garbage rising, the game-over sweep.

   Logic positions are discrete; what you see is not. The active piece carries
   a pixel offset that absorbs every logical jump (move, fall, kick) and decays
   over ~55ms, so motion is smooth while the logic stays exact. Offsets larger
   than a few cells (hard drops, wrap-around seams) snap instead. */

import { BlockPainter } from './blocks.js';
import { getLattice, SQUARE, HEX } from '../engine/lattice.js';
import { colorOf, specialOf } from '../engine/board.js';
import { pieceColor, rgba, lighten, HIGH_CONTRAST } from './theme.js';

const SQRT3 = Math.sqrt(3);
const PEEK = 0.7;          // rows of the hidden spawn zone that stay visible

export class BoardRenderer {
  constructor(canvas, painter) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.painter = painter;
    this.game = null;
    this.theme = null;
    this.hc = false;
    this.ghost = true;
    this.reduced = false;
    this.dpr = 1;
    this.S = 24;            // square side or hex radius, css px
    this.cssW = 0; this.cssH = 0;
    this.off = { x: 0, y: 0 };
    this.lastAnchor = null;
    this.lastSpawnId = -1;
    this.spawnId = 0;
    this.clearAnim = null;
    this.rowShift = null;
    this.lockFlash = [];
    this.trails = [];
    this.rise = 0;
    this.overT = 0;
    this.time = 0;
    this.gridCache = null;
  }

  attach(game) {
    this.game = game;
    this.clearAnim = null;
    this.rowShift = null;
    this.lockFlash = [];
    this.trails = [];
    this.rise = 0;
    this.overT = 0;
    this.lastAnchor = null;
    this.gridCache = null;
  }

  configure({ theme, highContrast, ghost, reduced }) {
    if (theme !== undefined) { this.theme = theme; this.gridCache = null; }
    if (highContrast !== undefined) { this.hc = highContrast; this.gridCache = null; }
    if (ghost !== undefined) this.ghost = ghost;
    if (reduced !== undefined) this.reduced = reduced;
  }

  get lattice() { return this.game.rules.lattice; }

  /** Fit the board into an available css box. Returns the css size used. */
  resize(availW, availH, dpr) {
    const g = this.game;
    if (!g) return { w: 0, h: 0 };
    const w = g.board.w, vis = g.board.visible;
    let S, W, H;
    if (this.lattice === 'hex') {
      S = Math.min(availW / (1.5 * w + 0.5), availH / (SQRT3 * (vis + 0.5 + PEEK)));
      S = Math.max(5, Math.floor(S * 2) / 2);
      W = (1.5 * w + 0.5) * S;
      H = SQRT3 * (vis + 0.5 + PEEK) * S;
    } else {
      S = Math.min(availW / w, availH / (vis + PEEK));
      S = Math.max(6, Math.floor(S));
      W = w * S;
      H = (vis + PEEK) * S;
    }
    this.S = S;
    this.dpr = dpr;
    this.cssW = Math.round(W);
    this.cssH = Math.round(H);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.gridCache = null;
    return { w: this.cssW, h: this.cssH };
  }

  /** Cell size used for sprites: side (square) or radius (hex). */
  get unit() { return this.S; }
  /** Nominal cell pitch in px (for particle sizing). */
  get pitch() { return this.lattice === 'hex' ? this.S * 1.6 : this.S; }

  cellCenter(c, r) {
    const b = this.game.board;
    const rr = r - b.buffer;
    if (this.lattice === 'hex') {
      return [(1 + c * 1.5) * this.S, (SQRT3 * (rr + 0.5 + 0.5 * (c & 1)) + SQRT3 * PEEK) * this.S];
    }
    return [(c + 0.5) * this.S, (rr + PEEK + 0.5) * this.S];
  }

  /* --------------------------------------------------------- events -- */

  handle(events, fx, origin) {
    const g = this.game;
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          this.spawnId++;
          break;
        case 'lock':
          this.lockFlash.push({ cells: e.cells, t: 0 });
          break;
        case 'harddrop': {
          if (e.distance > 0) {
            const cols = new Map();
            for (const [c, r] of e.cells) {
              const [x, y] = this.cellCenter(c, r);
              const top = y - e.distance * (this.lattice === 'hex' ? SQRT3 * this.S : this.S);
              const prev = cols.get(c);
              if (!prev || y > prev.y1) cols.set(c, { x, y0: top, y1: y, color: pieceColor(e.colors[0], this.theme) });
            }
            this.trails.push({ cols: [...cols.values()], t: 0 });
            if (fx && origin) {
              let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const [c, r] of e.cells) {
                const [x, y] = this.cellCenter(c, r);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
              }
              fx.impact(origin.x + (minX + maxX) / 2, origin.y + maxY + this.pitch * 0.45, maxX - minX + this.pitch,
                lighten(pieceColor(e.colors[0], this.theme), 0.35), Math.min(1.6, 0.6 + e.distance / 12));
            }
          }
          break;
        }
        case 'clear': {
          const set = new Set();
          for (const [c, r] of e.removed) set.add(r * g.board.w + c);
          this.clearAnim = { cells: e.removed, set, t: 0, dur: Math.max(120, g.rules.clearDelay), burst: false, lines: e.lines, chain: e.chain };
          break;
        }
        case 'collapse': {
          this.finishClear(fx, origin);
          if (!e.cascade && e.rows.length) {
            const rows = [...e.rows].sort((a, b) => a - b);
            // Walk old rows from the bottom: a surviving row moves down by the
            // number of cleared rows beneath it. Index by its NEW row.
            const newShift = new Float32Array(g.board.h);
            let clearedBelow = 0;
            let ri = rows.length - 1;
            for (let old = g.board.h - 1; old >= 0; old--) {
              if (ri >= 0 && rows[ri] === old) { clearedBelow++; ri--; continue; }
              const nw = old + clearedBelow;
              if (nw < g.board.h) newShift[nw] = clearedBelow;
            }
            this.rowShift = { shift: newShift, t: 0, dur: 140 };
          }
          break;
        }
        case 'garbage':
          this.rise = 1;
          break;
        default: break;
      }
    }
  }

  finishClear(fx, origin) {
    const a = this.clearAnim;
    if (a && !a.burst && fx && origin) this.burst(a, fx, origin);
    this.clearAnim = null;
  }

  burst(a, fx, origin) {
    a.burst = true;
    const power = Math.min(2.2, 0.7 + (a.lines || 1) * 0.3 + (a.chain > 1 ? 0.3 * a.chain : 0));
    const step = a.cells.length > 60 ? 2 : 1;
    for (let i = 0; i < a.cells.length; i += step) {
      const [c, r, v] = a.cells[i];
      const [x, y] = this.cellCenter(c, r);
      fx.cellBurst(origin.x + x, origin.y + y, this.pitch, lighten(pieceColor(colorOf(v), this.theme), 0.25), power);
    }
    if (a.lines >= 2 || a.chain > 1) {
      let sx = 0, sy = 0;
      for (const [c, r] of a.cells) { const [x, y] = this.cellCenter(c, r); sx += x; sy += y; }
      sx /= a.cells.length; sy /= a.cells.length;
      fx.ring(origin.x + sx, origin.y + sy, this.theme?.accent2 || '#fff', this.cssW * (0.5 + 0.1 * a.lines), 0.55, 8);
    }
  }

  /* --------------------------------------------------------- update -- */

  update(dt, fx, origin) {
    this.time += dt;
    const k = Math.exp(-dt / 0.055);
    this.off.x *= k; this.off.y *= k;
    if (Math.abs(this.off.x) < 0.05) this.off.x = 0;
    if (Math.abs(this.off.y) < 0.05) this.off.y = 0;
    if (this.clearAnim) {
      this.clearAnim.t += dt * 1000;
      if (!this.clearAnim.burst && this.clearAnim.t > this.clearAnim.dur * 0.35) {
        if (fx && origin) this.burst(this.clearAnim, fx, origin); else this.clearAnim.burst = true;
      }
    }
    if (this.rowShift) { this.rowShift.t += dt * 1000; if (this.rowShift.t >= this.rowShift.dur) this.rowShift = null; }
    for (const f of this.lockFlash) f.t += dt;
    this.lockFlash = this.lockFlash.filter((f) => f.t < 0.18);
    for (const t of this.trails) t.t += dt;
    this.trails = this.trails.filter((t) => t.t < 0.22);
    if (this.rise > 0) this.rise = Math.max(0, this.rise - dt * 7);
    if (this.game?.isOver) this.overT += dt; else this.overT = 0;
  }

  /* ----------------------------------------------------------- draw -- */

  drawGrid(ctx) {
    const g = this.game;
    const key = `${this.cssW}x${this.cssH}|${this.dpr}|${this.hc}|${this.theme?.name}`;
    if (!this.gridCache || this.gridCache.key !== key) {
      const cv = document.createElement('canvas');
      cv.width = this.canvas.width; cv.height = this.canvas.height;
      const c = cv.getContext('2d');
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const boardCol = this.hc ? HIGH_CONTRAST.board : (this.theme?.board || '#0d0822');
      const grd = c.createLinearGradient(0, 0, 0, this.cssH);
      grd.addColorStop(0, rgba(boardCol, 0.82));
      grd.addColorStop(1, rgba(boardCol, 0.96));
      c.fillStyle = grd;
      c.fillRect(0, 0, this.cssW, this.cssH);
      c.strokeStyle = this.hc ? HIGH_CONTRAST.grid : (this.theme?.grid || 'rgba(255,255,255,0.06)');
      c.lineWidth = 1;
      const b = g.board;
      if (this.lattice === 'hex') {
        for (let r = b.buffer; r < b.h; r++) {
          for (let col = 0; col < b.w; col++) {
            const [x, y] = this.cellCenter(col, r);
            c.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i;
              const px = x + this.S * 0.94 * Math.cos(a), py = y + this.S * 0.94 * Math.sin(a);
              if (i) c.lineTo(px, py); else c.moveTo(px, py);
            }
            c.closePath();
            c.stroke();
          }
        }
      } else {
        c.beginPath();
        for (let col = 1; col < b.w; col++) {
          const x = Math.round(col * this.S) + 0.5;
          c.moveTo(x, PEEK * this.S); c.lineTo(x, this.cssH);
        }
        for (let r = 0; r <= b.visible; r++) {
          const y = Math.round((r + PEEK) * this.S) + 0.5;
          c.moveTo(0, y); c.lineTo(this.cssW, y);
        }
        c.stroke();
      }
      // Spawn zone fade.
      const top = c.createLinearGradient(0, 0, 0, PEEK * (this.lattice === 'hex' ? SQRT3 : 1) * this.S + 4);
      top.addColorStop(0, 'rgba(0,0,0,0.55)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = top;
      c.fillRect(0, 0, this.cssW, PEEK * (this.lattice === 'hex' ? SQRT3 : 1) * this.S + 4);
      // Wrap-around seams.
      if (g.board.wrap) {
        const accent = this.theme?.accent2 || '#45e3ff';
        for (const x of [1.5, this.cssW - 1.5]) {
          const lg = c.createLinearGradient(0, 0, 0, this.cssH);
          lg.addColorStop(0, rgba(accent, 0));
          lg.addColorStop(0.5, rgba(accent, 0.8));
          lg.addColorStop(1, rgba(accent, 0));
          c.strokeStyle = lg;
          c.lineWidth = 3;
          c.setLineDash([6, 6]);
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.cssH); c.stroke();
        }
        c.setLineDash([]);
      }
      this.gridCache = { key, canvas: cv };
    }
    ctx.drawImage(this.gridCache.canvas, 0, 0, this.cssW, this.cssH);
  }

  draw() {
    const g = this.game;
    if (!g) return;
    const ctx = this.ctx;
    const b = g.board;
    const L = this.lattice;
    const U = this.unit;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.drawGrid(ctx);

    // Danger: a red wash rising from the top of the well.
    if (g.danger > 0.02 && !g.isOver) {
      const pulse = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(this.time * (4 + g.danger * 5));
      const lg = ctx.createLinearGradient(0, 0, 0, this.cssH * 0.55);
      lg.addColorStop(0, `rgba(255,40,70,${0.32 * g.danger * pulse})`);
      lg.addColorStop(1, 'rgba(255,40,70,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, this.cssW, this.cssH * 0.55);
    }

    // Hard drop streaks (under the blocks).
    for (const t of this.trails) {
      const a = 1 - t.t / 0.22;
      for (const col of t.cols) {
        const w = this.pitch * 0.8;
        const lg = ctx.createLinearGradient(0, col.y0, 0, col.y1);
        lg.addColorStop(0, rgba(col.color, 0));
        lg.addColorStop(1, rgba(col.color, 0.55 * a));
        ctx.fillStyle = lg;
        ctx.fillRect(col.x - w / 2, col.y0, w, col.y1 - col.y0);
      }
    }

    // Locked cells.
    const minRow = Math.max(0, b.buffer - 1);
    const clearing = this.clearAnim;
    const riseOff = this.rise > 0 ? this.rise * (L === 'hex' ? SQRT3 * this.S : this.S) : 0;
    const shift = this.rowShift;
    const shiftT = shift ? 1 - easeOut(shift.t / shift.dur) : 0;
    const pitchY = L === 'hex' ? SQRT3 * this.S : this.S;
    const sweepRow = g.isOver && g.phase === 'over' ? b.buffer + Math.floor(this.overT * 30) : -1;
    for (let r = minRow; r < b.h; r++) {
      const yShift = (shift ? -shift.shift[r] * pitchY * shiftT : 0) + riseOff;
      for (let c = 0; c < b.w; c++) {
        const v = b.cells[r * b.w + c];
        if (!v) continue;
        if (clearing && clearing.set.has(r * b.w + c)) continue;
        const [x, y] = this.cellCenter(c, r);
        const variant = sweepRow >= 0 && r <= sweepRow ? 'dim' : 'solid';
        this.painter.draw(ctx, L, colorOf(v), specialOf(v), x, y + yShift, U, variant);
      }
    }

    // Clear animation: flash, then shrink away.
    if (clearing) {
      const p = Math.min(1, clearing.t / clearing.dur);
      for (const [c, r, v] of clearing.cells) {
        const [x, y] = this.cellCenter(c, r);
        if (p < 0.35) {
          this.painter.draw(ctx, L, colorOf(v), specialOf(v), x, y, U, 'solid');
          ctx.globalAlpha = Math.min(1, p / 0.2);
          this.painter.draw(ctx, L, colorOf(v), 0, x, y, U, 'flash');
          ctx.globalAlpha = 1;
        } else {
          const q = (p - 0.35) / 0.65;
          const spr = this.painter.sprite(L, colorOf(v), 0, U, 'flash');
          const s = 1 - easeIn(q);
          ctx.globalAlpha = 1 - q;
          ctx.drawImage(spr.canvas, x - (spr.w * s) / 2, y - (spr.h * s) / 2, spr.w * s, spr.h * s);
          ctx.globalAlpha = 1;
        }
      }
      // Row glow band for line clears.
      if (clearing.lines && p < 0.6) {
        const rowsDone = new Set();
        ctx.globalCompositeOperation = 'lighter';
        for (const [c, r] of clearing.cells) {
          if (rowsDone.has(r)) continue;
          rowsDone.add(r);
          const [, y] = this.cellCenter(c, r);
          const lg = ctx.createLinearGradient(0, y - pitchY, 0, y + pitchY);
          lg.addColorStop(0, 'rgba(255,255,255,0)');
          lg.addColorStop(0.5, `rgba(255,255,255,${0.5 * (1 - p / 0.6)})`);
          lg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = lg;
          ctx.fillRect(0, y - pitchY, this.cssW, pitchY * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Lock flashes.
    for (const f of this.lockFlash) {
      ctx.globalAlpha = 0.55 * (1 - f.t / 0.18);
      for (const [c, r] of f.cells) {
        if (r < minRow) continue;
        const [x, y] = this.cellCenter(c, r);
        this.painter.draw(ctx, L, 31, 0, x, y, U, 'flash');
      }
      ctx.globalAlpha = 1;
    }

    // Active piece and ghost.
    const a = g.active;
    if (a && (g.phase === 'playing')) {
      const st = a.p.states[a.s];
      const [ax, ay] = this.cellCenter(a.x, a.y);
      if (this.lastAnchor && this.lastSpawnId === this.spawnId) {
        const dx = this.lastAnchor[0] - ax, dy = this.lastAnchor[1] - ay;
        if (this.reduced || Math.abs(dx) > this.pitch * 3 || Math.abs(dy) > pitchY * 3) { this.off.x = 0; this.off.y = 0; }
        else { this.off.x += dx; this.off.y += dy; }
      } else { this.off.x = 0; this.off.y = 0; }
      this.lastAnchor = [ax, ay];
      this.lastSpawnId = this.spawnId;

      const cells = b.cellsOf(st, a.x, a.y);
      const connect = a.p.def?.connect;
      if (this.ghost) {
        const gy = g.ghostY();
        if (gy !== a.y) {
          const gcells = b.cellsOf(st, a.x, gy);
          if (connect === 'corner' || connect === 'loose') this.drawTethers(ctx, gcells, a.inst.colors[0], this.off.x, 0, 0.35);
          gcells.forEach(([c, r], i) => {
            if (r < minRow) return;
            const [x, y] = this.cellCenter(c, r);
            this.painter.draw(ctx, L, a.inst.colors[i], 0, x + this.off.x, y, U, 'ghost');
          });
        }
      }
      if (connect === 'corner' || connect === 'loose') this.drawTethers(ctx, cells, a.inst.colors[0], this.off.x, this.off.y, 1);
      // Lock-delay tension: the piece dims slightly as its lock timer runs out.
      const grounded = !b.fits(st, a.x, a.y + 1);
      const lockP = grounded ? Math.min(1, g.lockTimer / g.rules.lockDelay) : 0;
      cells.forEach(([c, r], i) => {
        if (r < minRow) return;
        const [x, y] = this.cellCenter(c, r);
        this.painter.draw(ctx, L, a.inst.colors[i], a.inst.specials[i], x + this.off.x, y + this.off.y, U, 'solid');
      });
      if (lockP > 0.05) {
        ctx.globalAlpha = lockP * 0.35;
        cells.forEach(([c, r]) => {
          if (r < minRow) return;
          const [x, y] = this.cellCenter(c, r);
          this.painter.draw(ctx, L, 31, 0, x + this.off.x, y + this.off.y, U, 'flash');
        });
        ctx.globalAlpha = 1;
      }
    }
  }

  drawTethers(ctx, cells, color, ox, oy, alpha) {
    const L = this.lattice;
    const adj = (a, b) => {
      if (L === 'hex') return HEX.boardNeighbors(a[0], a[1]).some(([c, r]) => c === b[0] && r === b[1]);
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(lighten(pieceColor(color, this.theme), 0.45), 0.9);
    ctx.shadowColor = pieceColor(color, this.theme);
    ctx.shadowBlur = this.reduced ? 0 : this.S * 0.4;
    ctx.lineWidth = Math.max(2, this.S * 0.14);
    ctx.beginPath();
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const A = cells[i], B = cells[j];
        if (Math.abs(A[0] - B[0]) > 2 || Math.abs(A[1] - B[1]) > 2) continue;
        if (adj(A, B)) continue;
        const d = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]));
        if (d > 2) continue;
        const [x1, y1] = this.cellCenter(A[0], A[1]);
        const [x2, y2] = this.cellCenter(B[0], B[1]);
        ctx.moveTo(x1 + ox, y1 + oy);
        ctx.lineTo(x2 + ox, y2 + oy);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => Math.pow(Math.min(1, Math.max(0, t)), 2);

/**
 * Draw a piece centred in a box (queue, hold, Lab thumbnails).
 * `cells` are native lattice coordinates of one orientation.
 */
export function drawPieceIcon(ctx, painter, lattice, cells, colors, specials, cx, cy, boxW, boxH, maxUnit = 28, variant = 'solid') {
  if (!(boxW > 0) || !(boxH > 0) || !cells?.length) return 0;
  const Lt = getLattice(lattice);
  const centers = cells.map((c) => Lt.nativeCenter(c));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of centers) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  // Extents in unit space include the cell itself.
  const ex = lattice === 'hex' ? 2 : 1, ey = lattice === 'hex' ? SQRT3 : 1;
  const spanX = maxX - minX + ex, spanY = maxY - minY + ey;
  const unit = Math.max(3, Math.min(maxUnit, (boxW * 0.92) / spanX, (boxH * 0.92) / spanY));
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  centers.forEach(([x, y], i) => {
    painter.draw(ctx, lattice, colors[i % colors.length], specials ? specials[i] : 0, cx + (x - midX) * unit, cy + (y - midY) * unit, unit, variant);
  });
  return unit;
}

export { SQUARE };
