/* Piece generators.

   A randomizer exposes next(game) -> piece index, and optionally
   observeLock(game, info). The game calls next() whenever the preview queue
   needs topping up, passing itself so context-aware generators (the hidden
   assist in assist.js) can look at the board. */

import { Rng } from './rng.js';

/** Bag: every piece appears round(weight) times per bag, bag order shuffled. */
export class BagRandomizer {
  constructor(pieces, rng = new Rng()) {
    this.rng = rng;
    this.template = [];
    pieces.forEach((p, i) => {
      const n = Math.max(1, Math.round(p.weight));
      for (let k = 0; k < n; k++) this.template.push(i);
    });
    this.bag = [];
  }
  next() {
    if (!this.bag.length) this.bag = this.rng.shuffle(this.template.slice());
    return this.bag.pop();
  }
}

/** Weighted draw with one re-roll against immediate repeats (history of 2). */
export class WeightedRandomizer {
  constructor(pieces, rng = new Rng()) {
    this.rng = rng;
    this.weights = pieces.map((p) => p.weight);
    this.history = [];
  }
  next() {
    let i = this.rng.weighted(this.weights);
    if (this.weights.length > 2 && this.history.includes(i)) i = this.rng.weighted(this.weights);
    this.history.push(i);
    if (this.history.length > 2) this.history.shift();
    return i;
  }
}

/** Replays a fixed sequence (tests / debug forcing), then defers to a fallback. */
export class ScriptedRandomizer {
  constructor(sequence, fallback) {
    this.seq = sequence.slice();
    this.fallback = fallback;
  }
  push(...ids) { this.seq.push(...ids); }
  next(game) {
    if (this.seq.length) return this.seq.shift();
    return this.fallback ? this.fallback.next(game) : 0;
  }
  observeLock(game, info) { this.fallback?.observeLock?.(game, info); }
}

export function makeRandomizer(rules, rng) {
  return rules.generation === 'weighted'
    ? new WeightedRandomizer(rules.pieces, rng)
    : new BagRandomizer(rules.pieces, rng);
}
