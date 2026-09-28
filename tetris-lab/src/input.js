/* Input.

   InputController turns press/release of abstract actions into game calls
   with proper DAS (delayed auto shift) and ARR (auto repeat rate) handling:
   the last-pressed direction wins, ARR 0 means "slide to the wall", and every
   timer runs on the game's own dt so behaviour is identical at 60 or 144 Hz.

   GestureTracker turns raw pointer movement on the well into moves: drag to
   slide cell-by-cell, drag down to soft drop, flick down to hard drop, flick
   up to hold, tap to rotate. Both are pure and DOM-free; main.js feeds them. */

export const ACTIONS = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'flip', 'hold', 'pause'];

export class InputController {
  constructor(target, { das = 150, arr = 33, softDrop = 'fast' } = {}) {
    this.target = target;
    this.das = das;
    this.arr = arr;
    this.softDrop = softDrop;
    this.held = new Set();
    this.dirStack = [];
    this.dasT = 0;
    this.arrT = 0;
    this.charged = false;
    this.onAction = null; // optional hook (pause etc.)
  }

  setTiming({ das, arr, softDrop }) {
    if (das !== undefined) this.das = das;
    if (arr !== undefined) this.arr = arr;
    if (softDrop !== undefined) this.softDrop = softDrop;
  }

  get dir() { return this.dirStack.length ? this.dirStack[this.dirStack.length - 1] : 0; }

  press(action) {
    if (this.held.has(action)) return;       // OS key repeat
    this.held.add(action);
    const t = this.target;
    switch (action) {
      case 'left':
      case 'right': {
        const d = action === 'left' ? -1 : 1;
        this.dirStack = this.dirStack.filter((x) => x !== d);
        this.dirStack.push(d);
        this.dasT = 0; this.arrT = 0; this.charged = false;
        t.move(d);
        break;
      }
      case 'soft':
        if (this.softDrop === 'instant') { while (t.stepDown()) { /* sonic drop */ } }
        else t.setSoftDrop(true, this.softDrop === 'slow' ? 8 : 20);
        break;
      case 'hard': t.hardDrop(); break;
      case 'cw': t.rotate('cw'); break;
      case 'ccw': t.rotate('ccw'); break;
      case 'r180': t.rotate('r180'); break;
      case 'flip': t.rotate('flip'); break;
      case 'hold': t.holdPiece(); break;
      case 'pause': this.onAction?.('pause'); break;
      default: break;
    }
  }

  release(action) {
    if (!this.held.delete(action)) return;
    if (action === 'left' || action === 'right') {
      const d = action === 'left' ? -1 : 1;
      const wasActive = this.dir === d;
      this.dirStack = this.dirStack.filter((x) => x !== d);
      if (wasActive && this.dir) {
        // Falling back to the still-held opposite direction re-arms DAS.
        this.dasT = 0; this.arrT = 0; this.charged = false;
        this.target.move(this.dir);
      }
    } else if (action === 'soft') {
      this.target.setSoftDrop(false);
    }
  }

  /** Release everything (pause, focus loss, new game). */
  reset() {
    if (this.held.has('soft')) this.target.setSoftDrop(false);
    this.held.clear();
    this.dirStack = [];
    this.dasT = 0; this.arrT = 0; this.charged = false;
  }

  update(dtMs) {
    const d = this.dir;
    if (d) {
      this.dasT += dtMs;
      if (!this.charged) {
        if (this.dasT >= this.das) {
          this.charged = true;
          if (this.arr <= 0) this.target.shift(d);
          else { this.target.move(d); this.arrT = this.dasT - this.das; }
        }
      } else if (this.arr <= 0) {
        this.target.shift(d);
      } else {
        this.arrT += dtMs;
        let guard = 40;
        while (this.arrT >= this.arr && guard-- > 0) {
          this.arrT -= this.arr;
          if (!this.target.move(d)) { this.arrT = 0; break; }
        }
      }
    }
    if (this.held.has('soft') && this.softDrop === 'instant') {
      while (this.target.stepDown()) { /* keep sonic-dropping new pieces while held */ }
    }
  }
}

export class GestureTracker {
  constructor(target, { cell = 30 } = {}) {
    this.target = target;
    this.cell = cell;
    this.active = new Map();
    this.onTap = null;
  }

  setCell(px) { this.cell = Math.max(8, px); }

  start(id, x, y, t) {
    this.active.set(id, { x0: x, y0: y, t0: t, lx: x, ly: y, lastT: t, moved: 0, dropped: 0, vy: 0, mode: null });
  }

  move(id, x, y, t) {
    const g = this.active.get(id);
    if (!g) return;
    const dt = Math.max(1, t - g.lastT);
    g.vy = g.vy * 0.6 + ((y - g.ly) / dt) * 0.4;
    const step = this.cell * 0.85;
    const totalDx = x - g.x0, totalDy = y - g.y0;
    if (!g.mode) {
      if (Math.abs(totalDx) > this.cell * 0.45 && Math.abs(totalDx) > Math.abs(totalDy) * 0.8) g.mode = 'h';
      else if (totalDy > this.cell * 0.6 && totalDy > Math.abs(totalDx)) g.mode = 'v';
    }
    if (g.mode === 'h') {
      let dx = x - g.lx;
      while (Math.abs(dx) >= step) {
        const s = Math.sign(dx);
        this.target.move(s);
        g.lx += s * step;
        g.moved++;
        dx = x - g.lx;
      }
      // Allow switching to a vertical drag after a slide.
      if (y - g.ly > this.cell * 1.2 && Math.abs(x - g.lx) < this.cell) g.mode = 'v';
    }
    if (g.mode === 'v') {
      let dy = y - g.ly;
      while (dy >= step) {
        this.target.stepDown();
        g.ly += step;
        g.dropped++;
        dy = y - g.ly;
      }
      if (Math.abs(x - g.lx) > this.cell * 1.3) { g.mode = 'h'; }
    }
    g.lastT = t;
  }

  end(id, x, y, t) {
    const g = this.active.get(id);
    if (!g) return;
    this.active.delete(id);
    const dur = t - g.t0;
    const dx = x - g.x0, dy = y - g.y0;
    const fast = dur < 280;
    if (fast && dy > this.cell * 1.6 && g.vy > 0.9 && Math.abs(dy) > Math.abs(dx) * 1.5) { this.target.hardDrop(); return; }
    if (fast && dy < -this.cell * 1.6 && Math.abs(dy) > Math.abs(dx) * 1.5) { this.target.holdPiece(); return; }
    if (dur < 300 && Math.abs(dx) < this.cell * 0.45 && Math.abs(dy) < this.cell * 0.45 && !g.moved && !g.dropped) {
      if (this.onTap) this.onTap(x, y);
      else this.target.rotate('cw');
    }
  }

  cancel(id) { this.active.delete(id); }
}

/* Standard-mapping gamepad buttons -> actions. */
export const PAD_MAP = [
  [14, 'left'], [15, 'right'], [13, 'soft'], [12, 'hard'],
  [0, 'cw'], [1, 'ccw'], [3, 'r180'], [2, 'hold'], [4, 'hold'], [5, 'flip'], [9, 'pause']
];

export class GamepadReader {
  constructor(input) {
    this.input = input;
    this.prev = new Set();
  }
  poll() {
    const pads = globalThis.navigator?.getGamepads?.();
    if (!pads) return false;
    const now = new Set();
    let any = false;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      any = true;
      for (const [b, action] of PAD_MAP) if (p.buttons[b]?.pressed) now.add(action);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.5) now.add('left');
      if (ax > 0.5) now.add('right');
      if (ay > 0.6) now.add('soft');
    }
    for (const a of now) if (!this.prev.has(a)) this.input.press(a);
    for (const a of this.prev) if (!now.has(a)) this.input.release(a);
    this.prev = now;
    return any;
  }
}
