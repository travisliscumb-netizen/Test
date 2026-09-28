import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { InputController, GestureTracker } from '../src/input.js';
import { AssistRandomizer, capProbs } from '../src/engine/assist.js';
import { classicRules } from '../src/engine/rules.js';
import { Game } from '../src/engine/game.js';
import { Bot } from '../src/engine/bot.js';
import { Rng } from '../src/engine/rng.js';
import { makeCell } from '../src/engine/board.js';

function recorder() {
  const log = [];
  let wall = Infinity;
  const t = {
    log,
    x: 0,
    setWall(n) { wall = n; },
    move(d) { if (Math.abs(t.x + d) > wall) return false; t.x += d; log.push(`move${d}`); return true; },
    shift(d) { let n = 0; while (t.move(d)) n++; return n; },
    rotate(k) { log.push(`rot:${k}`); return true; },
    hardDrop() { log.push('hard'); },
    holdPiece() { log.push('hold'); },
    setSoftDrop(on, f) { log.push(`soft:${on}${on ? `:${f}` : ''}`); },
    stepDown() { log.push('step'); return log.filter((x) => x === 'step').length < 5; }
  };
  return t;
}

describe('keyboard: DAS / ARR', () => {
  test('one move on press, then nothing until DAS elapses', () => {
    const t = recorder();
    const inp = new InputController(t, { das: 150, arr: 30 });
    inp.press('right');
    assert.equal(t.x, 1);
    inp.update(100);
    assert.equal(t.x, 1);
    inp.update(50);   // DAS reached: first repeat
    assert.equal(t.x, 2);
    inp.update(90);   // three more ARR intervals
    assert.equal(t.x, 5);
  });
  test('identical behaviour at 60 Hz and 144 Hz', () => {
    const run = (hz) => {
      const t = recorder();
      const inp = new InputController(t, { das: 133, arr: 17 });
      inp.press('left');
      for (let ms = 0; ms < 1000; ms += 1000 / hz) inp.update(1000 / hz);
      return t.x;
    };
    assert.ok(Math.abs(run(60) - run(144)) <= 1);
  });
  test('ARR 0 slides to the wall immediately after DAS', () => {
    const t = recorder();
    t.setWall(4);
    const inp = new InputController(t, { das: 100, arr: 0 });
    inp.press('right');
    inp.update(100);
    assert.equal(t.x, 4);
  });
  test('last pressed direction wins; releasing it falls back', () => {
    const t = recorder();
    const inp = new InputController(t, { das: 100, arr: 50 });
    inp.press('left');
    inp.press('right');
    assert.equal(t.x, 0);
    inp.update(100);
    assert.equal(t.x, 1);
    inp.release('right');
    assert.equal(t.x, 0, 'falls back to the held left key with a fresh move');
  });
  test('OS key repeat does not re-trigger actions', () => {
    const t = recorder();
    const inp = new InputController(t, {});
    inp.press('cw'); inp.press('cw'); inp.press('cw');
    assert.equal(t.log.filter((x) => x === 'rot:cw').length, 1);
    inp.release('cw');
    inp.press('cw');
    assert.equal(t.log.filter((x) => x === 'rot:cw').length, 2);
  });
  test('soft drop modes and reset', () => {
    const t = recorder();
    const inp = new InputController(t, { softDrop: 'slow' });
    inp.press('soft');
    assert.ok(t.log.includes('soft:true:8'));
    inp.reset();
    assert.ok(t.log.includes('soft:false'));
    const t2 = recorder();
    const inp2 = new InputController(t2, { softDrop: 'instant' });
    inp2.press('soft');
    assert.equal(t2.log.filter((x) => x === 'step').length, 5, 'sonic drop steps until blocked');
  });
});

describe('touch gestures', () => {
  test('tap rotates, drag slides cell by cell, drag down soft drops', () => {
    const t = recorder();
    const g = new GestureTracker(t, { cell: 30 });
    g.start(1, 100, 100, 0); g.end(1, 102, 101, 120);
    assert.deepEqual(t.log, ['rot:cw']);
    g.start(2, 100, 100, 200);
    for (let x = 100; x <= 190; x += 10) g.move(2, x, 102, 200 + x);
    g.end(2, 190, 102, 500);
    assert.equal(t.x, 3);
    g.start(3, 100, 100, 600);
    for (let y = 100; y <= 170; y += 10) g.move(3, 100, y, 600 + y * 3);
    g.end(3, 100, 170, 1200);
    assert.ok(t.log.filter((x) => x === 'step').length >= 2);
    assert.ok(!t.log.includes('hard'), 'a slow drag is not a flick');
  });
  test('flick down hard-drops, flick up holds', () => {
    const t = recorder();
    const g = new GestureTracker(t, { cell: 30 });
    g.start(1, 100, 100, 0); g.move(1, 100, 140, 30); g.move(1, 100, 200, 60); g.end(1, 100, 200, 80);
    assert.ok(t.log.includes('hard'));
    g.start(2, 100, 300, 100); g.move(2, 100, 240, 130); g.end(2, 100, 200, 160);
    assert.ok(t.log.includes('hold'));
  });
});

describe('hidden assist', () => {
  test('probability capping keeps mass and respects the cap', () => {
    const p = capProbs([100, 1, 1, 1, 1, 1, 1], 0.42);
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(Math.max(...p) <= 0.42 + 1e-9);
    const q = capProbs([0, 0, 0], 0.42);
    assert.ok(q.every((x) => Math.abs(x - 1 / 3) < 1e-9));
  });

  test('sequence is unpredictable: no triple repeats, near-uniform frequencies', () => {
    const rules = classicRules();
    const counts = new Array(7).fill(0);
    let prev = -1, run = 0, maxRun = 0, total = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const a = new AssistRandomizer(rules, { rng: new Rng(seed * 101), strength: 1 });
      const g = new Game(rules, { seed, instant: true, randomizer: a });
      const orig = a.next.bind(a);
      a.next = (gm) => { const p = orig(gm); counts[p]++; total++; run = p === prev ? run + 1 : 1; prev = p; maxRun = Math.max(maxRun, run); return p; };
      g.start();
      const bot = new Bot(rules, { skill: 0.5, rng: new Rng(seed) });
      while (!g.isOver && g.stats.pieces < 700) bot.playOne(g);
    }
    assert.ok(maxRun <= 2, `max run ${maxRun}`);
    for (const c of counts) assert.ok(Math.abs(c / total - 1 / 7) < 0.03, `frequency ${(c / total).toFixed(3)} strays from uniform`);
  });

  test('responds to the board: an open I-well raises the I probability', () => {
    const rules = classicRules();
    const a = new AssistRandomizer(rules, { rng: new Rng(1), strength: 1 });
    const g = new Game(rules, { seed: 1, instant: true, randomizer: a, previews: 1 });
    g.start();
    // Deep well in column 9 under a flat stack.
    const b = g.board;
    for (let k = 0; k < 8; k++) for (let c = 0; c < 9; c++) b.set(c, b.h - 1 - k, makeCell(8));
    g.active = null;
    g.queue = [];
    const d = a.decide(g);
    const iProb = d.probs[0];
    assert.ok(iProb > 1 / 7 + 0.08, `I probability ${iProb.toFixed(2)} should be well above uniform`);
    assert.equal(d.util.indexOf(Math.max(...d.util)), 0, 'the I piece has the highest utility');
  });

  test('assistance scales with danger and backs off for skilled players', () => {
    const rules = classicRules();
    const a = new AssistRandomizer(rules, { rng: new Rng(1), strength: 1 });
    const g = new Game(rules, { seed: 1, instant: true, randomizer: a, previews: 1 });
    g.start(); g.active = null; g.queue = [];
    const calm = a.decide(g);
    const b = g.board;
    for (let k = 0; k < 15; k++) for (let c = 0; c < 10; c++) if ((c + k) % 4) b.set(c, b.h - 1 - k, makeCell(8));
    const tense = a.decide(g);
    assert.ok(tense.beta > calm.beta, 'more help under pressure');
    a.skill = 0.98;
    b.clear();
    const expert = a.decide(g);
    assert.ok(expert.beta < calm.beta, 'less help for a player placing like the bot');
  });

  test('helps a struggling player survive compared with the standard bag', () => {
    const rules = classicRules();
    const run = (assisted) => {
      let pieces = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const randomizer = assisted ? new AssistRandomizer(rules, { rng: new Rng(seed * 77), strength: 0.7 }) : undefined;
        const g = new Game(rules, { seed, instant: true, randomizer });
        g.start();
        const bot = new Bot(rules, { skill: 0.15, rng: new Rng(seed * 13) });
        while (!g.isOver && g.stats.pieces < 700) bot.playOne(g);
        pieces += g.stats.pieces;
      }
      return pieces;
    };
    const bag = run(false), assist = run(true);
    assert.ok(assist >= bag, `assisted ${assist} vs bag ${bag}`);
  });

  test('disabled assist falls back to a fair bag', () => {
    const rules = classicRules();
    const a = new AssistRandomizer(rules, { rng: new Rng(3), enabled: false });
    const seen = Array.from({ length: 14 }, () => a.next(null));
    assert.equal(new Set(seen.slice(0, 7)).size, 7);
    assert.equal(new Set(seen.slice(7)).size, 7);
  });
});
