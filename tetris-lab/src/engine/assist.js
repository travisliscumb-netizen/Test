/* The hidden assist.

   A context-aware randomizer that replaces the 7-bag in Classic. It never
   hands out "the piece you need" outright; it reshapes probabilities.

   For every piece that enters the preview queue:

   1. PROJECT the board to the moment that piece will actually be played: the
      bot plays the active piece and everything already in the queue on a
      scratch copy of the board. Evaluating the *current* board would be
      pointless, because with five previews the new piece arrives five pieces
      later.
   2. UTILITY: for each candidate piece, the best evaluation the bot can get by
      placing it on the projected board. Wells that want an I, cavities that
      want an S/Z/T, flat surfaces that want an O all show up here naturally.
   3. SHAPE: convert utilities to z-scores and weight each piece by
      exp(beta * z). beta grows with DANGER (projected stack height, holes) and
      shrinks with MASTERY (the player's recent placement quality measured
      against the bot), so a struggling player gets recovery chances and a
      strong player gets a nearly natural sequence.
   4. DISGUISE: multiply in a long-run fairness term (pieces running behind
      their expected count are boosted), a drought term, and strong anti-repeat
      penalties; cap any single piece at 42% probability. The result has no
      detectable pattern: frequencies stay close to uniform over time and no
      piece ever appears three times in a row.

   Every decision is recorded in `lastDecision` / `log` for the debug panel. */

import { Bot } from './bot.js';
import { Board } from './board.js';
import { resolveAll } from './clearing.js';
import { Rng } from './rng.js';

const MAX_P = 0.42;

export class AssistRandomizer {
  constructor(rules, { rng = new Rng(1), strength = 0.7, enabled = true } = {}) {
    this.rules = rules;
    this.rng = rng;
    this.strength = strength;
    this.enabled = enabled;
    this.K = rules.pieces.length;
    this.bot = new Bot(rules, { skill: 1 });
    this.proj = new Board(rules.width, rules.height, { lattice: rules.lattice, wrap: rules.wrap, buffer: rules.buffer });
    this.counts = new Array(this.K).fill(0);
    this.since = new Array(this.K).fill(0);
    this.history = [];
    this.total = 0;
    this.skill = 0.7;          // EMA of placement quality 0..1
    this.skillSamples = 0;
    this.lastDecision = null;
    this.log = [];
    this.bag = [];              // fallback when disabled
  }

  setStrength(s) { this.strength = Math.max(0, Math.min(1, s)); }

  next(game) {
    if (!this.enabled || this.strength <= 0 || this.K < 2) return this.fallback();
    const decision = this.decide(game);
    const pick = this.rng.weighted(decision.probs);
    decision.pick = pick;
    this.commit(pick);
    this.lastDecision = decision;
    this.log.push({ pick, danger: decision.danger, beta: decision.beta, p: decision.probs[pick] });
    if (this.log.length > 200) this.log.shift();
    return pick;
  }

  fallback() {
    if (!this.bag.length) {
      this.bag = [];
      for (let i = 0; i < this.K; i++) this.bag.push(i);
      this.rng.shuffle(this.bag);
    }
    const pick = this.bag.pop();
    this.commit(pick);
    return pick;
  }

  commit(pick) {
    this.counts[pick]++;
    this.total++;
    for (let i = 0; i < this.K; i++) this.since[i]++;
    this.since[pick] = 0;
    this.history.push(pick);
    if (this.history.length > 8) this.history.shift();
  }

  /** Board as it will look when the next queued piece is played. */
  project(game) {
    const b = this.proj;
    b.cells.set(game.board.cells);
    const upcoming = [];
    if (game.active) upcoming.push(game.active.inst);
    for (const inst of game.queue) upcoming.push(inst);
    let failed = false;
    for (const inst of upcoming) {
      const pl = this.bot.choose(b, inst.p, inst.colors, inst.specials);
      if (!pl) { failed = true; break; }
      const st = this.rules.pieces[inst.p].states[pl.s];
      b.place(st, pl.x, pl.y, inst.colors, inst.specials);
      resolveAll(b, this.rules);
    }
    return { board: b, failed };
  }

  measureDanger(board) {
    const f = this.bot.features(board);
    const vis = board.visible;
    const heightD = Math.max(0, Math.min(1, (f.maxH - vis * 0.35) / (vis * 0.5)));
    const holeD = Math.min(1, f.holes / (board.w * 0.8));
    return { danger: Math.min(1, heightD * 0.75 + holeD * 0.45), maxH: f.maxH, holes: f.holes };
  }

  decide(game) {
    const { board, failed } = this.project(game);
    const K = this.K;
    const util = new Array(K);
    for (let i = 0; i < K; i++) {
      const u = this.bot.bestScore(board, i);
      util[i] = Number.isFinite(u) ? u : -1e4;
    }
    let mean = 0;
    for (const u of util) mean += u;
    mean /= K;
    let sd = 0;
    for (const u of util) sd += (u - mean) ** 2;
    sd = Math.max(4, Math.sqrt(sd / K));
    const z = util.map((u) => Math.max(-2.5, Math.min(2.5, (u - mean) / sd)));

    const dm = this.measureDanger(board);
    const danger = failed ? 1 : dm.danger;
    const mastery = Math.max(0, Math.min(1, (this.skill - 0.78) / 0.17)) * (1 - danger);
    const beta = Math.max(0, Math.min(3, this.strength * (0.9 + 2.4 * danger - 0.6 * mastery)));

    const expected = this.total / K;
    const weights = new Array(K);
    const last = this.history[this.history.length - 1];
    const last2 = this.history[this.history.length - 2];
    for (let i = 0; i < K; i++) {
      const base = this.rules.pieces[i].weight;
      const deficit = (expected - this.counts[i]) / Math.sqrt(expected + 2);
      const fair = Math.exp(Math.max(-1.5, Math.min(1.5, 0.28 * deficit)));
      const droughtLen = this.since[i] - 2 * K;
      const drought = droughtLen > 0 ? 1 + droughtLen * 0.25 : 1;
      let repeat = 1;
      if (i === last) repeat = i === last2 ? 0 : 0.4;
      weights[i] = base * fair * drought * repeat * Math.exp(beta * z[i]);
    }
    const probs = capProbs(weights, MAX_P);
    return { util, z, danger, mastery, beta, probs, failed, maxH: dm.maxH, holes: dm.holes, skill: this.skill };
  }

  /** Estimate player skill from how their placement compares to the bot's options. */
  observeLock(game, info) {
    if (!this.enabled) return;
    const list = this.bot.placements(game.preBoard, info.piece);
    if (list.length < 2) return;
    let best = -Infinity, worst = Infinity;
    for (const p of list) { if (p.score > best) best = p.score; if (p.score < worst) worst = p.score; }
    const st = this.rules.pieces[info.piece].states[info.s];
    const mine = this.bot.evaluate(game.preBoard, st, info.x, info.y, game.rules.pieces[info.piece].colors);
    const q = best - worst < 1e-6 ? 1 : Math.max(0, Math.min(1, (mine - worst) / (best - worst)));
    const a = this.skillSamples < 10 ? 0.25 : 0.08;
    this.skill = this.skill * (1 - a) + q * a;
    this.skillSamples++;
  }
}

/** Normalise weights to probabilities with no entry above `cap`. */
export function capProbs(weights, cap) {
  const n = weights.length;
  let p = weights.map((w) => (w > 0 && Number.isFinite(w) ? w : 0));
  let sum = p.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return new Array(n).fill(1 / n);
  p = p.map((w) => w / sum);
  if (cap * n < 1) return p;
  for (let iter = 0; iter < 8; iter++) {
    let excess = 0, freeMass = 0;
    for (let i = 0; i < n; i++) {
      if (p[i] > cap) { excess += p[i] - cap; p[i] = cap; } else freeMass += p[i];
    }
    if (excess < 1e-12) break;
    if (freeMass <= 0) {
      // Everything else was zeroed (repeat penalty): spread the excess evenly.
      const others = p.map((v, i) => (v < cap ? i : -1)).filter((i) => i >= 0);
      for (const i of others) p[i] += excess / others.length;
      break;
    }
    for (let i = 0; i < n; i++) if (p[i] < cap) p[i] += excess * (p[i] / freeMass);
  }
  return p;
}
