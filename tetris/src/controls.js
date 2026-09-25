/* Turns raw press/release of abstract actions into game calls, with DAS/ARR
   auto-shift. Device-agnostic (keyboard, gamepad and touch all feed it) and
   pure, so the timing rules are unit-testable.

   - DAS: delay before a held direction starts repeating.
   - ARR: interval between repeats once charged; 0 = teleport to the wall.
   - The most recently pressed direction wins; releasing it falls back to the
     other direction if that is still held (with a fresh DAS charge).
   - DAS charge carries across pieces and line-clear delay, as in modern games,
     so a held direction shifts the next piece the moment it spawns. */

export const ACTIONS = ['left', 'right', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW', 'rotate180', 'hold'];

export class Controls {
  constructor(game, { das = 167, arr = 33 } = {}) {
    this.game = game;
    this.das = das;
    this.arr = arr;
    this.held = new Set();
    this.dir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
  }

  setGame(game) {
    this.game = game;
    game.setSoftDrop(this.held.has('softDrop'));
  }

  configure({ das, arr }) {
    if (das != null) this.das = das;
    if (arr != null) this.arr = arr;
  }

  press(action) {
    if (this.held.has(action)) return;
    this.held.add(action);
    const g = this.game;
    switch (action) {
      case 'left':
      case 'right': {
        this.dir = action === 'left' ? -1 : 1;
        this.dasTimer = 0;
        this.arrTimer = 0;
        g.move(this.dir);
        break;
      }
      case 'softDrop': g.setSoftDrop(true); break;
      case 'hardDrop': g.hardDrop(); break;
      case 'rotateCW': g.rotate(1); break;
      case 'rotateCCW': g.rotate(-1); break;
      case 'rotate180': g.rotate(2); break;
      case 'hold': g.holdPiece(); break;
    }
  }

  release(action) {
    if (!this.held.delete(action)) return;
    if (action === 'softDrop') this.game.setSoftDrop(false);
    if (action === 'left' || action === 'right') {
      const other = action === 'left' ? 'right' : 'left';
      const releasedDir = action === 'left' ? -1 : 1;
      if (this.dir === releasedDir) {
        if (this.held.has(other)) {
          this.dir = -releasedDir;
          this.dasTimer = 0;
          this.arrTimer = 0;
        } else {
          this.dir = 0;
        }
      }
    }
  }

  releaseAll() {
    for (const a of [...this.held]) this.release(a);
    this.dir = 0;
  }

  update(dt) {
    if (!this.dir) return;
    this.dasTimer += dt;
    if (this.dasTimer < this.das) return;
    const g = this.game;
    if (!g.active) return;             // keep the charge through clears and spawns
    if (this.arr === 0) {
      while (g.move(this.dir)) { /* slide to the wall */ }
      return;
    }
    // Carry any overshoot past DAS into the first ARR interval.
    this.arrTimer += Math.min(dt, this.dasTimer - this.das + this.arr);
    while (this.arrTimer >= this.arr) {
      this.arrTimer -= this.arr;
      if (!g.move(this.dir)) { this.arrTimer = 0; break; }
    }
  }
}
