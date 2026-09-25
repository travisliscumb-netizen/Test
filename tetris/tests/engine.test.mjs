/* Rules tests. Run with: npm test  (node --test, no dependencies). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, COLS, ROWS, LOCK_DELAY, LINE_CLEAR_DELAY, MOVE_RESET_LIMIT, gravityInterval } from '../src/engine.js';
import { SHAPES, TYPES, typeId } from '../src/pieces.js';
import { Controls } from '../src/controls.js';
import { Bot } from '../src/ai.js';

/* Board literal helper: rows top-to-bottom, '#' filled, '.' empty; the last
   string is row 0. */
function setRows(g, rows) {
  g.board.fill(0);
  rows.forEach((line, i) => {
    const y = rows.length - 1 - i;
    [...line].forEach((ch, x) => { if (ch === '#') g.board[y * COLS + x] = 8; });
  });
}

/* Puts a specific piece in play at a given spot, bypassing the queue. */
function place(g, type, x, y, rot = 0) {
  g.state = 'playing';
  g.piece = { type, rot, x, y };
  g.lowestY = y;
  g.lockTimer = 0;
  g.moveResets = 0;
  g.lastMoveWasRotation = false;
}

function run(g, ms, step = 16) {
  for (let t = 0; t < ms; t += step) g.update(step);
}

test('shapes: 4 cells per orientation, rotations are distinct where they should be', () => {
  for (const t of TYPES) {
    for (let r = 0; r < 4; r++) assert.equal(SHAPES[t][r].length, 4);
  }
  // I in state R occupies box column 2, SRS reference position.
  assert.deepEqual(SHAPES.I[1].map((c) => c[0]), [2, 2, 2, 2]);
  // T in state R points right: nub at (2,1).
  assert.ok(SHAPES.T[1].some(([x, y]) => x === 2 && y === 1));
});

test('7-bag: every aligned group of 7 contains each piece once', () => {
  const g = new Game({ seed: 42 });
  const seq = g.queue.slice();           // the constructor already drew the preview
  while (seq.length < 7 * 50) seq.push(g.nextFromBag());
  for (let i = 0; i < seq.length; i += 7) {
    assert.deepEqual(seq.slice(i, i + 7).sort(), TYPES.slice().sort());
  }
});

test('seeded games are deterministic', () => {
  const a = new Game({ seed: 7 }), b = new Game({ seed: 7 });
  assert.deepEqual(a.queue, b.queue);
});

test('spawn: centred in rows 21-22 then drops one row into view', () => {
  const g = new Game({ seed: 1 });
  g.queue[0] = 'T';
  g.start();
  const ys = g.cellsOf().map((c) => c[1]).sort();
  const xs = g.cellsOf().map((c) => c[0]).sort();
  assert.deepEqual(ys, [19, 19, 19, 20]);
  assert.deepEqual([...new Set(xs)], [3, 4, 5]);
  assert.equal(g.drainEvents()[0].type, 'spawn');
});

test('gravity curve: relaxed start, monotone, capped low', () => {
  assert.equal(gravityInterval(1), 2000);
  for (let l = 2; l <= 20; l++) assert.ok(gravityInterval(l) < gravityInterval(l - 1), `level ${l} is faster than ${l - 1}`);
  assert.ok(Math.abs(gravityInterval(20) - 2000 * 0.92 ** 7) < 1e-6, 'level 20 = the old level 8 (~1.12 s/row)');
  assert.equal(gravityInterval(25), gravityInterval(20));
});

test('lock delay: piece locks 500 ms after landing, not before', () => {
  const g = new Game({ seed: 3 });
  g.start();
  place(g, 'O', 4, 0);
  run(g, LOCK_DELAY - 40);
  assert.ok(g.piece && g.piece.type === 'O', 'still active before lock delay');
  run(g, 60);
  assert.equal(g.board[0 * COLS + 4], typeId('O'));
});

test('extended placement: the move after the last lock reset locks the piece', () => {
  const g = new Game({ seed: 3 });
  g.start();
  g.board.fill(0);
  place(g, 'T', 3, -1);                  // resting on the floor (box row 0 is empty)
  const ref = g.piece;
  let moves = 0, dir = 1;
  while (g.piece === ref && moves < 40) {
    run(g, 400);                          // under the lock delay
    assert.equal(g.piece, ref, `still active after ${moves} resets`);
    if (!g.move(dir)) { dir = -dir; continue; }
    dir = -dir;
    moves++;
  }
  assert.equal(moves, MOVE_RESET_LIMIT + 1);
  assert.notEqual(g.piece, ref);
});

test('SRS: I rotates off the right wall with a kick', () => {
  const g = new Game({ seed: 5 });
  g.start();
  g.board.fill(0);
  place(g, 'I', 7, 5, 1);                 // vertical, in column 9
  assert.deepEqual([...new Set(g.cellsOf().map((c) => c[0]))], [9]);
  assert.ok(g.rotate(1));                 // R -> 2 needs a kick left
  const xs = g.cellsOf().map((c) => c[0]);
  assert.ok(Math.max(...xs) <= 9 && Math.min(...xs) >= 6);
});

test('T-spin double: detected via rotation, scored 1200 x level', () => {
  const g = new Game({ seed: 9 });
  g.start();
  setRows(g, [
    '##........',
    '#...######',
    '##.#######'
  ]);
  place(g, 'T', 1, 0, 1);                 // pointing right, inside the slot
  assert.ok(g.rotate(1), 'R -> 2 into the slot');
  assert.equal(g.piece.rot, 2);
  assert.equal(g.lastKickIndex, 0);
  assert.deepEqual(g.cellsOf().map((c) => c.join(',')).sort(), ['1,1', '2,0', '2,1', '3,1']);
  g.drainEvents();
  g.hardDrop();
  const clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(clear.tspin, 'full');
  assert.equal(clear.lines, 2);
  assert.equal(clear.label, 'T-Spin Double');
  assert.equal(clear.points, 1200);
  assert.equal(clear.perfect, false);
  assert.equal(g.stats.tspins, 1);
});

test('T-spin mini vs full: front corners, and the TST kick upgrade', () => {
  const g = new Game({ seed: 9 });
  g.start();
  setRows(g, [
    '#.#.......',
    '...#######',
    '#..#######'
  ]);
  place(g, 'T', 0, 0, 2);                 // pointing down, centre (1,1)
  g.lastMoveWasRotation = true;
  g.lastKickIndex = 0;
  assert.equal(g.detectTSpin(), 'mini', 'both back corners + one front corner');
  g.lastKickIndex = 4;
  assert.equal(g.detectTSpin(), 'full', 'fifth kick upgrades a mini');
  g.lastMoveWasRotation = false;
  assert.equal(g.detectTSpin(), 'none', 'no rotation, no spin');
});

test('scoring: single/double/triple/tetris x level, B2B tetris x1.5, combo', () => {
  const g = new Game({ seed: 11, startLevel: 2 });
  g.start();
  setRows(g, [
    '#########.',
    '#########.',
    '#########.',
    '#########.'
  ]);
  place(g, 'I', 7, 5, 1);                 // vertical in column 9
  g.drainEvents();
  g.hardDrop();
  let clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(clear.lines, 4);
  assert.equal(clear.points, 800 * 2 + 2000 * 2, 'tetris + perfect clear');
  assert.equal(clear.perfect, true);
  run(g, LINE_CLEAR_DELAY + 20);

  setRows(g, [
    '#.........',
    '#########.',
    '#########.',
    '#########.',
    '#########.'
  ]);
  place(g, 'I', 7, 8, 1);
  g.drainEvents();
  g.hardDrop();
  clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(clear.b2b, true);
  assert.equal(clear.combo, 1);
  assert.equal(clear.points, 1200 * 2 + 50 * 1 * 2, 'B2B tetris + combo 1');
  run(g, LINE_CLEAR_DELAY + 20);
  // The leftover row keeps this from being a perfect clear.
  assert.equal(g.board[0 * COLS + 0], 8);
});

test('line clear delay then collapse shifts rows down', () => {
  const g = new Game({ seed: 12 });
  g.start();
  setRows(g, [
    '#.........',
    '#########.'
  ]);
  place(g, 'I', 7, 5, 1);
  g.hardDrop();
  assert.equal(g.state, 'clearing');
  run(g, LINE_CLEAR_DELAY + 20);
  assert.equal(g.state, 'playing');
  assert.equal(g.board[0 * COLS + 0], 8, 'row above fell into row 0');
  assert.equal(g.board[0 * COLS + 9], typeId('I'));
});

test('hold: swaps, returns to spawn orientation, once per piece', () => {
  const g = new Game({ seed: 13 });
  g.start();
  const first = g.piece.type;
  g.rotate(1);
  assert.ok(g.holdPiece());
  assert.equal(g.hold, first);
  assert.equal(g.holdPiece(), false, 'second hold in a row is refused');
  g.hardDrop();
  run(g, LINE_CLEAR_DELAY + 20);
  const cur = g.piece.type;
  assert.ok(g.holdPiece());
  assert.equal(g.piece.type, first);
  assert.equal(g.piece.rot, 0);
  assert.equal(g.hold, cur);
});

test('block out: spawning into an occupied cell ends the game', () => {
  const g = new Game({ seed: 14 });
  g.start();
  for (let x = 3; x < 7; x++) for (let y = 18; y < 22; y++) g.board[y * COLS + x] = 8;
  g.piece = null;
  g.spawn();
  assert.equal(g.state, 'over');
  assert.equal(g.overReason, 'Block out');
});

test('sprint finishes at 40 lines; ultra at 3:00', () => {
  const s = new Game({ mode: 'sprint', seed: 15 });
  s.start();
  s.lines = 39;
  setRows(s, ['#########.']);
  place(s, 'I', 7, 5, 1);
  s.hardDrop();
  run(s, LINE_CLEAR_DELAY + 20);
  assert.equal(s.state, 'finished');

  const u = new Game({ mode: 'ultra', seed: 16 });
  u.start();
  u.setSoftDrop(false);
  for (let i = 0; i < 180000 / 50 + 5 && u.state !== 'finished' && u.state !== 'over'; i++) {
    u.update(50);
    if (u.active && u.piece.y < 3) u.hardDrop();
  }
  assert.ok(u.state === 'finished' || u.state === 'over');
  if (u.state === 'finished') assert.equal(u.time, 180000);
});

test('marathon levels up every 10 lines from the start level', () => {
  const g = new Game({ seed: 17, startLevel: 3 });
  g.start();
  assert.equal(g.level, 3);
  g.lines = 9;
  setRows(g, ['#########.']);
  place(g, 'I', 7, 5, 1);
  g.drainEvents();
  g.hardDrop();
  assert.ok(g.drainEvents().some((e) => e.type === 'levelUp' && e.level === 4));
});

test('controls: DAS then ARR; ARR 0 slides to the wall', () => {
  const g = new Game({ seed: 18 });
  g.start();
  g.board.fill(0);
  place(g, 'O', 4, 10);
  const c = new Controls(g, { das: 100, arr: 20 });
  c.press('right');
  assert.equal(g.piece.x, 5, 'initial tap moves one');
  c.update(90);
  assert.equal(g.piece.x, 5, 'no repeat before DAS');
  c.update(20);
  assert.equal(g.piece.x, 6, 'first repeat at DAS');
  c.update(40);
  assert.equal(g.piece.x, 8, 'then every ARR, clamped at the wall');
  c.release('right');

  place(g, 'O', 4, 10);
  c.configure({ arr: 0 });
  c.press('left');
  c.update(120);
  assert.equal(g.piece.x, 0);
  c.release('left');
});

test('controls: last pressed direction wins, release falls back', () => {
  const g = new Game({ seed: 19 });
  g.start();
  g.board.fill(0);
  place(g, 'O', 4, 10);
  const c = new Controls(g, { das: 100, arr: 50 });
  c.press('left');
  c.press('right');
  assert.equal(c.dir, 1);
  c.release('right');
  assert.equal(c.dir, -1);
});

test('soak: bot plays 1500 pieces with consistent state and no exceptions', () => {
  const g = new Game({ mode: 'endless', seed: 2024 });
  const bot = new Bot(g, { stepMs: 0 });
  g.start();
  let clearedByEvents = 0;
  for (let i = 0; i < 400000 && g.stats.pieces < 1500 && g.state !== 'over'; i++) {
    for (let k = 0; k < 10; k++) bot.update(16); // a fast player: 10 inputs per frame
    g.update(16);
    for (const e of g.drainEvents()) if (e.type === 'clear') clearedByEvents += e.lines;
    // Invariant: the active piece never overlaps the stack.
    if (g.piece && g.state !== 'over') assert.ok(g.fits(g.piece.type, g.piece.rot, g.piece.x, g.piece.y));
  }
  assert.equal(g.lines, clearedByEvents);
  assert.ok(g.stats.pieces >= 1500, `bot survived ${g.stats.pieces} pieces`);
  // Every cell is either empty or a valid id; nothing below row 0 or above ROWS.
  for (const v of g.board) assert.ok(v >= 0 && v <= 8);
  assert.equal(g.board.length, COLS * ROWS);
});
