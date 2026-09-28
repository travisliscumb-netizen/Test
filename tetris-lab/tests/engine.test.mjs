import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Rng } from '../src/engine/rng.js';
import { SQUARE, HEX, canonicalKey, isConnected, hasEnclosedHole } from '../src/engine/lattice.js';
import { compilePiece, CLASSIC_DEFS, PieceError } from '../src/engine/pieces.js';
import { Board, makeCell, SPECIAL_BOMB, SPECIAL_WILD, colorOf } from '../src/engine/board.js';
import { compileRules, classicRules, normalizeConcept, RulesError, guidelineMsPerRow } from '../src/engine/rules.js';
import { Game, PHASE } from '../src/engine/game.js';
import { ScriptedRandomizer, BagRandomizer } from '../src/engine/randomizer.js';
import { Bot } from '../src/engine/bot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I = 0, O = 1, T = 2, S = 3, Z = 4, J = 5, L = 6;
const set = (cells) => new Set(cells.map((c) => c.join(',')));

/** A classic game whose pieces come from `seq` (then 7-bag). */
function classic(seq = [], opts = {}) {
  const rules = opts.rules || classicRules();
  const g = new Game(rules, { seed: 1, instant: opts.instant ?? true, randomizer: new ScriptedRandomizer(seq, new BagRandomizer(rules.pieces, new Rng(3))), previews: 5, ...opts });
  return g;
}
function fillRow(b, r, holes = []) { for (let c = 0; c < b.w; c++) if (!holes.includes(c)) b.set(c, r, makeCell(8)); }

describe('rng', () => {
  test('is deterministic and in range', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 1000; i++) { const x = a.next(); assert.equal(x, b.next()); assert.ok(x >= 0 && x < 1); }
  });
  test('weighted never picks zero-weight entries', () => {
    const r = new Rng(9);
    for (let i = 0; i < 2000; i++) assert.notEqual(r.weighted([0, 1, 0, 3]), 0);
  });
});

describe('lattice', () => {
  test('four square rotations and six hex rotations are the identity', () => {
    let c = [3, -2];
    for (let i = 0; i < 4; i++) c = SQUARE.rotateCW(c);
    assert.deepEqual(c, [3, -2]);
    let h = [2, -1];
    for (let i = 0; i < 6; i++) h = HEX.rotateCW(h);
    assert.deepEqual(h, [2, -1]);
    assert.deepEqual(HEX.rotateCCW(HEX.rotateCW([1, 2])), [1, 2]);
  });
  test('hex offset conversion round-trips', () => {
    for (let q = -5; q <= 5; q++) for (let r = -5; r <= 5; r++) {
      const [c, row] = HEX.axialToOffset(q, r);
      assert.deepEqual(HEX.offsetToAxial(c, row), [q, r]);
    }
  });
  test('canonical keys ignore translation and rotation', () => {
    const t1 = [[1, 0], [0, 1], [1, 1], [2, 1]];
    const t2 = [[5, 5], [5, 6], [5, 7], [6, 6]];
    assert.equal(canonicalKey('square', t1), canonicalKey('square', t2));
    assert.notEqual(canonicalKey('square', CLASSIC_DEFS[S].cells), canonicalKey('square', CLASSIC_DEFS[Z].cells));
    assert.equal(canonicalKey('square', CLASSIC_DEFS[S].cells, true), canonicalKey('square', CLASSIC_DEFS[Z].cells, true));
  });
  test('connectivity modes', () => {
    assert.ok(isConnected('square', [[0, 0], [1, 0]]));
    assert.ok(!isConnected('square', [[0, 0], [1, 1]]));
    assert.ok(isConnected('square', [[0, 0], [1, 1]], 'corner'));
    assert.ok(isConnected('square', [[0, 0], [2, 0]], 'loose'));
    assert.ok(!isConnected('square', [[0, 0], [3, 0]], 'loose'));
    assert.ok(isConnected('hex', [[0, 0], [1, -1]]));
  });
  test('detects enclosed holes', () => {
    const ring = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
    assert.ok(hasEnclosedHole('square', ring));
    assert.ok(!hasEnclosedHole('square', CLASSIC_DEFS[T].cells));
  });
});

describe('pieces', () => {
  test('classic pieces compile to the SRS guideline states', () => {
    const t = compilePiece(CLASSIC_DEFS[T]);
    assert.equal(t.states.length, 4);
    assert.deepEqual(set(t.states[1].cells), set([[1, 0], [1, 1], [2, 1], [1, 2]]));  // R: pointing right
    assert.deepEqual(set(t.states[2].cells), set([[0, 1], [1, 1], [2, 1], [1, 2]]));  // 2: pointing down
    const i = compilePiece(CLASSIC_DEFS[I]);
    assert.deepEqual(set(i.states[0].cells), set([[0, 1], [1, 1], [2, 1], [3, 1]]));
    assert.deepEqual(set(i.states[1].cells), set([[2, 0], [2, 1], [2, 2], [2, 3]]));
    assert.equal(compilePiece(CLASSIC_DEFS[O]).distinctStates.length, 1);
    assert.equal(i.distinctStates.length, 2);
  });
  test('cell order is preserved through rotation (per-cell colours follow cells)', () => {
    const p = compilePiece({ id: 'x', cells: [[0, 0], [1, 0], [1, 1]], rotation: 'rotate' });
    for (const st of p.states) assert.equal(st.cells.length, 3);
    // Cell 0 of state 1 is cell 0 of state 0 rotated.
    const box = p.box;
    const [x, y] = p.states[0].cells[0];
    assert.deepEqual(p.states[1].cells[0], [box - 1 - y, x]);
  });
  test('rotation systems', () => {
    assert.equal(compilePiece({ id: 'a', cells: [[0, 0], [1, 0], [1, 1]], rotation: 'none' }).states.length, 1);
    assert.equal(compilePiece({ id: 'a', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], rotation: 'flip' }).states.length, 2);
    const full = compilePiece({ id: 'a', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], rotation: 'full' });
    assert.equal(full.states.length, 8);
    assert.equal(full.trans[0].flip, 4);
    const morph = compilePiece({ id: 'm', cells: [[0, 0], [1, 0], [2, 0]], rotation: 'morph', morphs: [[[0, 0], [1, 0], [1, 1]]] });
    assert.equal(morph.states.length, 2);
    assert.equal(morph.trans[0].cw, 1);
    const hex = compilePiece({ id: 'h', cells: [[0, 0], [1, 0], [0, 1]], rotation: 'rotate' }, 'hex');
    assert.equal(hex.states.length, 6);
    assert.equal(hex.states[0].v.length, 2);
  });
  test('malformed definitions are rejected with PieceError', () => {
    const bad = [
      { id: 'dup', cells: [[0, 0], [0, 0]] },
      { id: 'big', cells: Array.from({ length: 13 }, (_, i) => [i % 5, (i / 5) | 0]) },
      { id: 'mal', cells: [[0, 'a']] },
      { id: 'none', cells: [] },
      { id: 'rot', cells: [[0, 0]], rotation: 'teleport' },
      { id: 'srs-hex', cells: [[0, 0]], rotation: 'srs' },
      { id: 'morph', cells: [[0, 0], [1, 0]], rotation: 'morph', morphs: [[[0, 0]]] }
    ];
    for (const d of bad) assert.throws(() => compilePiece(d, d.id === 'srs-hex' ? 'hex' : 'square'), PieceError, d.id);
  });
});

describe('board', () => {
  test('collision with walls, floor and cells; open sky above', () => {
    const b = new Board(10, 20);
    const t = compilePiece(CLASSIC_DEFS[T]).states[0];
    assert.ok(b.fits(t, 0, 0));
    assert.ok(!b.fits(t, -1, 5));
    assert.ok(!b.fits(t, 8, 5));
    assert.ok(b.fits(t, 3, -1));
    assert.equal(b.dropY(t, 3, 0), b.h - 2);
    b.set(4, b.h - 1, makeCell(3));
    assert.equal(b.dropY(t, 3, 0), b.h - 3);
  });
  test('wrap-around boards let pieces straddle the seam', () => {
    const b = new Board(10, 20, { wrap: true });
    const i = compilePiece(CLASSIC_DEFS[I]).states[0];
    assert.ok(b.fits(i, 8, 5));
    const cells = b.cellsOf(i, 8, 5).map(([c]) => c);
    assert.deepEqual(cells.sort(), [0, 1, 8, 9]);
  });
  test('line detection, gap lines, removal and shifting', () => {
    const b = new Board(4, 6, { buffer: 2 });
    fillRow(b, 7); fillRow(b, 6, [1]); b.set(2, 5, makeCell(4));
    assert.deepEqual(b.findLines(0), [7]);
    assert.deepEqual(b.findLines(1), [6, 7]);
    b.removeRows([7]);
    assert.equal(b.rowCount(7), 3);
    assert.equal(colorOf(b.get(2, 6)), 4);
  });
  test('cascade gravity fills holes', () => {
    const b = new Board(3, 4, { buffer: 1 });
    b.set(0, 1, makeCell(2));
    b.set(0, 4, makeCell(3));
    b.cascade();
    assert.equal(colorOf(b.get(0, 3)), 2);
    assert.equal(colorOf(b.get(0, 4)), 3);
  });
  test('colour groups, wild cells, bombs chain', () => {
    const b = new Board(6, 4, { buffer: 1 });
    [[0, 4], [1, 4], [2, 4]].forEach(([c, r]) => b.set(c, r, makeCell(5)));
    b.set(3, 4, makeCell(1, SPECIAL_WILD));
    let g = b.findColorGroups(4);
    assert.equal(g.length, 1);
    assert.equal(g[0].cells.length, 4);
    b.clear();
    b.set(0, 4, makeCell(2, SPECIAL_BOMB)); b.set(1, 4, makeCell(3, SPECIAL_BOMB)); b.set(2, 4, makeCell(4)); b.set(5, 4, makeCell(4));
    const idx = new Set([4 * 6 + 0]);
    const { bombs } = b.expandBombs(idx);
    assert.equal(bombs, 2);
    assert.ok(idx.has(4 * 6 + 2));
    assert.ok(!idx.has(4 * 6 + 5));
    g = b.findColorGroups(3);
    assert.equal(g.length, 0);
  });
  test('garbage pushes up and reports overflow', () => {
    const b = new Board(4, 4, { buffer: 1 });
    assert.equal(b.pushGarbage([1]), false);
    assert.equal(b.rowCount(b.h - 1), 3);
    b.set(0, 0, makeCell(2));
    assert.equal(b.pushGarbage([0]), true);
  });
});

describe('rules', () => {
  test('normalisation clamps hostile input', () => {
    const c = normalizeConcept({ board: { width: 999, height: -4 }, clear: { rule: 'nope' }, specials: { bomb: 5 }, lattice: 'triangle', pieces: 'x' });
    assert.equal(c.board.width, 20);
    assert.equal(c.board.height, 10);
    assert.equal(c.clear.rule, 'line');
    assert.equal(c.specials.bomb, 0.35);
    assert.equal(c.lattice, 'square');
    assert.deepEqual(c.pieces, []);
  });
  test('colour-match forces cascade and random colours', () => {
    const c = normalizeConcept({ clear: { rule: 'color-match' }, pieces: [] });
    assert.equal(c.gravityMode, 'cascade');
    assert.equal(c.colorMode, 'random-cells');
  });
  test('compile errors list every problem', () => {
    assert.throws(() => compileRules({ pieces: [] }), RulesError);
    try { compileRules({ board: { width: 5 }, pieces: [{ id: 'a', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] }, { id: 'b', cells: [[0, 0], [0, 0]] }] }); }
    catch (e) { assert.ok(e.problems.length >= 2); }
  });
  test('guideline gravity curve', () => {
    assert.equal(Math.round(guidelineMsPerRow(1)), 1000);
    assert.ok(guidelineMsPerRow(10) < 100);
    assert.ok(guidelineMsPerRow(15) < guidelineMsPerRow(10));
  });
});

describe('game: classic mechanics', () => {
  test('spawns centred, fills the preview queue, drops one row on spawn', () => {
    const g = classic([T]);
    g.start();
    assert.equal(g.phase, PHASE.PLAYING);
    assert.equal(g.active.p.id, 'T');
    assert.equal(g.active.x, 3);
    assert.equal(g.queue.length, 5);
    const cells = g.board.cellsOf(g.active.p.states[0], g.active.x, g.active.y);
    assert.ok(cells.some(([, r]) => r === g.board.buffer), 'lowest row enters the visible field');
  });
  test('movement stops at walls', () => {
    const g = classic([O]);
    g.start();
    let moves = 0;
    while (g.move(-1)) moves++;
    assert.equal(moves, 4);
    assert.equal(g.move(-1), false);
    assert.equal(g.shift(1), 8);
  });
  test('SRS wall kick: I piece rotates off the left wall', () => {
    const g = classic([I]);
    g.start();
    g.rotate('cw');
    while (g.move(-1));
    assert.ok(g.rotate('ccw'), 'kick found');
    const xs = g.board.cellsOf(g.active.p.states[g.active.s], g.active.x, g.active.y).map(([c]) => c);
    assert.ok(Math.min(...xs) >= 0);
  });
  test('hard drop scores 2 per cell and locks', () => {
    const g = classic([O, T]);
    g.start();
    const y0 = g.active.y;
    const dist = g.board.dropY(g.active.p.states[0], g.active.x, y0) - y0;
    g.hardDrop();
    assert.equal(g.stats.score, dist * 2);
    assert.equal(g.stats.pieces, 1);
    assert.equal(g.active.p.id, 'T');
  });
  test('gravity moves the piece and soft drop scores', () => {
    const g = classic([T], { instant: false });
    g.start();
    const y = g.active.y;
    for (let k = 0; k < 4; k++) g.tick(250);   // tick clamps dt to 250ms by design
    g.tick(1);
    assert.equal(g.active.y, y + 1);
    g.setSoftDrop(true);
    g.tick(200);
    assert.ok(g.active.y > y + 1);
    assert.ok(g.stats.softCells > 0 && g.stats.score === g.stats.softCells);
  });
  test('lock delay locks after 500ms grounded; resets are limited', () => {
    const g = classic([O, T], { instant: false });
    g.start();
    while (g.stepDown());
    g.tick(250);
    assert.equal(g.stats.pieces, 0);
    g.tick(260);
    assert.equal(g.stats.pieces, 1);
    // Infinite stalling is impossible: after 15 resets the piece locks.
    while (g.stepDown());
    let moves = 0;
    while (g.stats.pieces === 1 && moves < 40) { g.move(moves % 2 ? 1 : -1); g.tick(100); moves++; }
    assert.equal(g.stats.pieces, 2);
    assert.ok(moves <= 17, `locked after ${moves} moves`);
  });
  test('hold swaps once per piece', () => {
    const g = classic([T, I, O]);
    g.start();
    assert.ok(g.holdPiece());
    assert.equal(g.hold.p, T);
    assert.equal(g.active.p.id, 'I');
    assert.equal(g.holdPiece(), false);
    g.hardDrop();
    assert.ok(g.holdPiece());
    assert.equal(g.active.p.id, 'T');
    assert.equal(g.hold.p, O);
  });
  test('7-bag: every aligned window of 7 draws contains all seven pieces', () => {
    const rules = classicRules();
    const r = new BagRandomizer(rules.pieces, new Rng(5));
    for (let k = 0; k < 50; k++) assert.equal(new Set(Array.from({ length: 7 }, () => r.next())).size, 7);
  });
  test('line clear scoring, level multiplier, tetris, combo and back-to-back', () => {
    const g = classic([I, I, I]);
    g.start();
    const b = g.board;
    for (let k = 0; k < 4; k++) fillRow(b, b.h - 1 - k, [9]);
    g.rotate('cw');
    g.shift(1);
    const before = g.stats.score;
    g.hardDrop();
    const drop = g.stats.hardCells * 2;
    assert.equal(g.stats.lines, 4);
    assert.equal(g.stats.tetrises, 1);
    assert.ok(b.isEmpty());
    assert.equal(g.stats.pcs, 1, 'that was also a perfect clear');
    assert.equal(g.stats.score - before, 800 + 2000 + drop, 'tetris 800 + tetris perfect clear 2000 + hard drop');
    // Second tetris is back-to-back (x1.5) and a combo continues only on consecutive clears.
    for (let k = 0; k < 4; k++) fillRow(b, b.h - 1 - k, [9]);
    g.rotate('cw'); g.shift(1);
    const s2 = g.stats.score;
    const hc = g.stats.hardCells;
    g.hardDrop();
    const pts = g.stats.score - s2 - (g.stats.hardCells - hc) * 2;
    assert.equal(g.stats.b2bCount, 1);
    assert.ok(pts >= 1200 + 50, `b2b tetris + combo, got ${pts}`);
  });
  test('T-spin double: reachable by an SRS rotation and detected by the three-corner rule', () => {
    const g = classic([T]);
    g.start();
    const b = g.board;
    const H = b.h;
    // Standard TSD slot: the T's flat side fills row H-2 cols 3-5, its stem fills
    // (4, H-1); an overhang at (5, H-3) stops it simply dropping in.
    fillRow(b, H - 1, [4]);
    fillRow(b, H - 2, [3, 4, 5]);
    b.set(5, H - 3, makeCell(8));
    b.set(6, H - 3, makeCell(8));
    const slot = set([[3, H - 2], [4, H - 2], [5, H - 2], [4, H - 1]]);
    const p = g.active.p;
    // Straight drops cannot fill the slot.
    for (let s = 0; s < 4; s++) for (let x = -2; x < 10; x++) {
      if (!b.fits(p.states[s], x, 0)) continue;
      const y = b.dropY(p.states[s], x, 0);
      assert.notDeepEqual(set(b.cellsOf(p.states[s], x, y)), slot, 'slot must need a spin');
    }
    // Find a legal resting position from which one rotation lands in the slot.
    let found = null;
    for (let s = 0; s < 4 && !found; s++) for (let x = -2; x < 10 && !found; x++) for (let y = H - 6; y < H; y++) {
      if (!b.fits(p.states[s], x, y)) continue;
      for (const kind of ['cw', 'ccw']) {
        const a = g.active;
        assert.equal(a.p.id, 'T');
        a.s = s; a.x = x; a.y = y;
        g.lockResets = 0; g.lockTimer = 0;   // each probe is a fresh approach
        if (!g.rotate(kind)) continue;
        if (set(b.cellsOf(p.states[a.s], a.x, a.y)).size && [...set(b.cellsOf(p.states[a.s], a.x, a.y))].every((k) => slot.has(k))) { found = { s, x, y, kind }; break; }
      }
      if (found) break;
    }
    assert.ok(found, 'an SRS rotation reaches the slot');
    g.drainEvents();
    g.hardDrop();
    const clear = g.drainEvents().find((e) => e.type === 'clear');
    assert.equal(g.lastLock.tspin, 'full');
    assert.equal(clear.lines, 2);
    assert.equal(clear.label, 'T-SPIN DOUBLE');
    assert.equal(g.stats.tspins, 1);
  });
  test('rotation and hold pressed during the clear delay are buffered (IRS / IHS)', () => {
    const g = classic([I, T, O, S], { instant: false });
    g.start();
    fillRow(g.board, g.board.h - 1, [0, 1, 2, 3]);
    while (g.move(-1));
    g.hardDrop();
    assert.equal(g.phase, PHASE.CLEARING);
    assert.ok(g.rotate('cw'));
    g.tick(250); g.tick(250);   // clear delay is 320ms; tick clamps to 250ms
    assert.equal(g.active.p.id, 'T');
    assert.equal(g.active.s, 1, 'buffered rotation applied on spawn');
    fillRow(g.board, g.board.h - 1, [0, 1, 2, 3]);
    g.forceNext([I]);
    g.hardDrop();          // T locks, no clear
    while (g.move(-1));
    g.hardDrop();          // I clears -> clear delay
    assert.equal(g.phase, PHASE.CLEARING);
    assert.ok(g.holdPiece());
    g.tick(250); g.tick(250);   // clear delay is 320ms; tick clamps to 250ms
    // forceNext replaced the queued O with the I, so S was next: it goes straight to hold.
    assert.equal(g.hold.p, S, 'the newly spawned piece went straight to hold');
    assert.equal(g.phase, PHASE.PLAYING);
    assert.ok(g.active && g.active.p.id !== 'S');
    assert.equal(g.holdUsed, true);
  });
  test('levels advance every 10 lines', () => {
    const g = classic([I]);
    g.start();
    g.stats.progress = 9;
    const b = g.board;
    fillRow(b, b.h - 1, [0, 1, 2, 3]);
    while (g.move(-1));
    g.hardDrop();
    const ev = g.drainEvents();
    assert.equal(g.stats.lines, 1);
    assert.equal(g.stats.level, 2);
    assert.ok(ev.some((e) => e.type === 'levelup' && e.level === 2));
    assert.ok(g.msPerRow() < 1000, 'gravity got faster');
  });
  test('block out ends the game', () => {
    const g = classic([O, O]);
    g.start();
    for (let r = g.board.buffer - 2; r < g.board.h; r++) g.board.set(4, r, makeCell(8));
    g.hardDrop();
    assert.equal(g.phase, PHASE.OVER);
  });
  test('sprint completes at 40 lines, ultra at two minutes', () => {
    const rules = classicRules();
    const g = new Game(rules, { seed: 3, instant: true, goal: { type: 'lines', value: 4 } });
    g.start();
    const bot = new Bot(rules);
    let guard = 200;
    while (!g.isOver && guard--) bot.playOne(g);
    assert.equal(g.phase, PHASE.DONE);
    assert.ok(g.stats.lines >= 4);
    const u = new Game(rules, { seed: 3, goal: { type: 'time', value: 1000 } });
    u.start();
    for (let k = 0; k < 20; k++) u.tick(100);
    assert.equal(u.phase, PHASE.DONE);
  });
  test('the expert bot survives 1500 classic pieces', () => {
    const rules = classicRules();
    const g = new Game(rules, { seed: 11, instant: true });
    g.start();
    const bot = new Bot(rules);
    while (!g.isOver && g.stats.pieces < 1500) { bot.playOne(g); g.drainEvents(); }
    assert.ok(!g.isOver);
    assert.ok(g.stats.lines > 550);
  });
});

describe('game: experimental mechanics', () => {
  const lab = (over) => compileRules({ name: 't', scoring: { kind: 'lab' }, pieces: [{ id: 'a', cells: [[0, 0], [1, 0], [2, 0]] }], ...over });

  test('colour matches cascade into chain reactions', () => {
    const rules = compileRules({ board: { width: 6, height: 10 }, clear: { rule: 'color-match', matchSize: 3 }, palette: [5, 2, 4], pieces: [{ id: 'dot', cells: [[0, 0]] }] });
    const g = new Game(rules, { seed: 1, instant: true });
    g.start();
    const b = g.board;
    const B = b.h - 1;
    // Reds at the bottom-left, a yellow column with a red on top at column 2.
    b.set(0, B, makeCell(5)); b.set(1, B, makeCell(5));
    b.set(2, B, makeCell(2)); b.set(2, B - 1, makeCell(2)); b.set(2, B - 2, makeCell(5));
    // Drop a yellow at column 3: three yellows clear, the red falls onto the reds.
    g.active.inst.colors[0] = 2;
    assert.ok(g.place(0, 3));
    const clears = g.drainEvents().filter((e) => e.type === 'clear');
    assert.equal(clears.length, 2);
    assert.equal(clears[0].chain, 1);
    assert.equal(clears[1].chain, 2);
    assert.equal(clears[1].label, 'CHAIN ×2');
    assert.ok(b.isEmpty());
    assert.equal(g.stats.maxChain, 2);
  });
  test('garbage rises every N pieces', () => {
    const rules = lab({ garbage: { every: 2 } });
    const g = new Game(rules, { seed: 4, instant: true });
    g.start();
    for (let k = 0; k < 4 && !g.isOver; k++) g.hardDrop();
    assert.equal(g.stats.garbageRows, 2);
  });
  test('bombs blast neighbours when their row clears', () => {
    const rules = lab({ board: { width: 6, height: 10 }, specials: { bomb: 0 } });
    const g = new Game(rules, { seed: 1, instant: true });
    g.start();
    const b = g.board;
    fillRow(b, b.h - 1, [0, 1, 2]);
    b.set(3, b.h - 2, makeCell(9));   // adjacent to the bomb (col 2) -> blasted
    b.set(5, b.h - 2, makeCell(10));  // not adjacent -> shifts down with its row
    g.active.inst.specials[2] = SPECIAL_BOMB;
    g.active.x = 0;
    g.hardDrop();
    const clear = g.drainEvents().find((e) => e.type === 'clear');
    assert.ok(clear);
    assert.ok(clear.bombs >= 1);
    assert.equal(b.get(3, b.h - 1), 0, 'the blasted cell was destroyed, not shifted down');
    assert.equal(colorOf(b.get(5, b.h - 1)), 10, 'the untouched cell fell into the cleared row');
  });
  test('hex boards play, rotate through six states and clear zig-zag rows', () => {
    const rules = compileRules({ lattice: 'hex', board: { width: 8, height: 14 }, pieces: [{ id: 'bar', cells: [[0, 0], [1, 0], [2, 0]] }, { id: 'tri', cells: [[0, 0], [1, 0], [0, 1]] }] });
    const g = new Game(rules, { seed: 5, instant: true });
    g.start();
    for (let k = 0; k < 4; k++) g.stepDown();
    for (let k = 0; k < 6; k++) assert.ok(g.rotate('cw'), `rotation ${k + 1}`);
    assert.equal(g.active.s, 0, 'six 60-degree turns return to the spawn orientation');
    const bot = new Bot(rules);
    while (!g.isOver && g.stats.pieces < 400) bot.playOne(g);
    assert.ok(g.stats.lines > 20, `cleared ${g.stats.lines} hex rows`);
  });
  test('wrap boards let the bot use the seam and never crash', () => {
    const rules = compileRules({ wrap: true, board: { width: 8, height: 16 }, pieces: CLASSIC_DEFS.map((d) => ({ ...d, rotation: 'rotate' })) });
    const g = new Game(rules, { seed: 8, instant: true });
    g.start();
    const bot = new Bot(rules);
    while (!g.isOver && g.stats.pieces < 300) bot.playOne(g);
    assert.ok(g.stats.lines > 50);
    // Moving left from column 0 wraps.
    const g2 = new Game(rules, { seed: 8, instant: true });
    g2.start();
    while (g2.active.x > 0) g2.move(-1);
    assert.ok(g2.move(-1));
    assert.equal(g2.active.x, 7);
  });
  test('timed placement: no gravity, the piece drops itself when the clock runs out', () => {
    const rules = compileRules({ placement: { mode: 'timed', seconds: 2 }, pieces: [{ id: 'a', cells: [[0, 0], [1, 0], [2, 0]] }] });
    const g = new Game(rules, { seed: 1 });
    g.start();
    const y = g.active.y;
    for (let k = 0; k < 7; k++) g.tick(250);   // 1.75s: hovering
    assert.equal(g.active.y, y, 'no gravity');
    assert.ok(g.placeProgress > 0.8);
    assert.equal(g.stats.pieces, 0);
    g.tick(250);
    assert.equal(g.stats.pieces, 1, 'dropped itself at 2s');
    assert.ok(g.drainEvents().some((e) => e.type === 'timeout'));
    // Soft drop still works, without banked time teleporting the piece.
    for (let k = 0; k < 4; k++) g.tick(250);
    const y2 = g.active.y;
    g.setSoftDrop(true);
    g.tick(16);
    assert.ok(g.active.y - y2 <= 1);
    // The clock shrinks with level.
    g.stats.level = 10;
    assert.ok(g.placeLimit() < 2000 * 0.7);
  });
  test('piece weight changes fall speed', () => {
    const rules = compileRules({ pieces: [{ id: 'heavy', cells: [[0, 0], [1, 0]], fall: 2 }, { id: 'light', cells: [[0, 0], [0, 1]], fall: 0.5 }] });
    const fallIn = (idx, ms) => {
      const g = new Game(rules, { seed: 1, randomizer: new ScriptedRandomizer([idx], null) });
      g.start();
      const y = g.active.y;
      for (let t = 0; t < ms; t += 50) g.tick(50);
      return g.active.y - y;
    };
    assert.equal(fallIn(0, 2000), 4, 'heavy: a row every 500ms');
    assert.equal(fallIn(1, 2000), 1, 'light: a row every 2000ms');
  });
  test('morph "rotation" cycles shapes', () => {
    const rules = compileRules({ pieces: [{ id: 'm', cells: [[0, 0], [1, 0], [2, 0]], rotation: 'morph', morphs: [[[0, 0], [1, 0], [1, 1]]] }] });
    const g = new Game(rules, { seed: 1, instant: true });
    g.start();
    g.stepDown(); g.stepDown();
    assert.ok(g.rotate('cw'));
    assert.equal(g.active.s, 1);
    assert.ok(g.rotate('cw'));
    assert.equal(g.active.s, 0);
  });
});

describe('offline shell', () => {
  test('the service worker precaches every shipped file', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const files = walk(path.join(ROOT, 'src')).map((f) => `./${path.relative(ROOT, f).split(path.sep).join('/')}`);
    for (const f of files) assert.ok(sw.includes(`'${f}'`), `sw.js is missing ${f}`);
    for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) assert.ok(sw.includes(`'./icons/${f}'`), `sw.js is missing icons/${f}`);
  });
});
