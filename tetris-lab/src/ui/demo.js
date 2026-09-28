/* Attract-mode demo: the bot plays a real Game on a small board, executing
   its plan as visible inputs (rotate, slide, drop) so it looks like a person
   playing rather than pieces teleporting. Restarts itself on top-out. */

import { Game } from '../engine/game.js';
import { Bot } from '../engine/bot.js';
import { Rng, randomSeed } from '../engine/rng.js';
import { BoardRenderer } from '../render/board.js';

export class Demo {
  constructor(canvas, painter, rules, { skill = 0.96, speed = 1 } = {}) {
    this.canvas = canvas;
    this.rules = rules;
    this.renderer = new BoardRenderer(canvas, painter);
    this.skill = skill;
    this.speed = speed;
    this.reset();
  }

  reset() {
    const seed = randomSeed();
    this.game = new Game(this.rules, { seed, previews: 3 });
    this.bot = new Bot(this.rules, { skill: this.skill, rng: new Rng(seed ^ 0x55) });
    this.game.start();
    this.renderer.attach(this.game);
    this.plan = null;
    this.stepT = 0;
    this.overT = 0;
    if (this.box) this.renderer.resize(this.box.w, this.box.h, this.box.dpr);
  }

  configure(opts) { this.renderer.configure(opts); }

  resize(w, h, dpr) {
    this.box = { w, h, dpr };
    return this.renderer.resize(w, h, dpr);
  }

  update(dt) {
    const g = this.game;
    if (g.isOver) {
      this.overT += dt;
      this.renderer.update(dt);
      if (this.overT > 1.6) this.reset();
      return;
    }
    // Slow the demo's gravity so moves are visible; bot drives the rest.
    g.tick(dt * 1000 * 0.25);
    this.stepT -= dt * this.speed;
    if (g.phase === 'playing' && g.active && this.stepT <= 0) {
      if (!this.plan) {
        this.plan = this.bot.plan(g);
        this.tries = 0;
        if (this.plan?.hold) { g.holdPiece(); this.plan = null; this.stepT = 0.12; return; }
        if (!this.plan) { g.hardDrop(); this.stepT = 0.3; return; }
      }
      const a = g.active;
      const p = this.plan;
      if (++this.tries > 16) { g.place(p.s, p.x); this.plan = null; this.stepT = 0.25; return; }
      const R = a.p.lattice === 'hex' ? 6 : 4;
      if (a.p.rotation === 'full' && Math.floor(a.s / R) !== Math.floor(p.s / R)) {
        if (!g.rotate('flip')) { g.place(p.s, p.x); this.plan = null; }
        this.stepT = 0.07;
      } else if (a.s !== p.s) {
        // Rotate toward the target orientation along the shortest direction.
        const n = a.p.rotation === 'full' ? R : a.p.states.length;
        const cw = ((p.s % n) - (a.s % n) + n) % n;
        if (!g.rotate(cw <= n / 2 ? 'cw' : 'ccw')) { g.place(p.s, p.x); this.plan = null; }
        this.stepT = 0.07;
      } else if (a.x !== p.x) {
        if (!g.move(Math.sign(p.x - a.x))) { g.hardDrop(); this.plan = null; }
        this.stepT = 0.055;
      } else {
        g.hardDrop();
        this.plan = null;
        this.stepT = 0.28;
      }
    }
    this.renderer.handle(g.drainEvents(), null, null);
    this.renderer.update(dt);
  }

  draw() { this.renderer.draw(); }
}
