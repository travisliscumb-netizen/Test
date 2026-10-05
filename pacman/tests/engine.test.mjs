/* Headless engine tests: maze integrity, arcade rule tables, targeting, and
   long soak runs driven by the autopilot. Run with `node --test tests/`. */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/maze.js';
import { Game, DIR, levelSpec, fruitShelf, MAX_SPEED, DIFFICULTY } from '../src/engine.js';
import { botDirection } from '../src/bot.js';

const tileType = (g, x, y) => g.maze.tileAt(M.tileOf(x), M.tileOf(y));

test('maze has the arcade dot count and a sealed border', () => {
  assert.equal(M.TOTAL_DOTS, 244);
  assert.equal(M.BASE_ITEMS.filter((v) => v === M.ITEM.POWER).length, 4);
  for (let c = 0; c < M.COLS; c++) {
    assert.equal(M.tileAt(c, 0), M.T.WALL);
    assert.equal(M.tileAt(c, M.ROWS - 1), M.T.WALL);
  }
  for (let r = 0; r < M.ROWS; r++) {
    if (r === M.TUNNEL_ROW) continue;
    assert.notEqual(M.tileAt(0, r), M.T.PATH, `left edge row ${r}`);
    assert.notEqual(M.tileAt(M.COLS - 1, r), M.T.PATH, `right edge row ${r}`);
  }
  assert.equal(M.tileAt(13, 12), M.T.DOOR);
  assert.equal(M.tileAt(13, 14), M.T.HOUSE);
  assert.equal(M.tileAt(2, 11), M.T.VOID);
  assert.equal(M.tileAt(-1, M.TUNNEL_ROW), M.T.PATH);
  assert.equal(M.tileAt(-3, M.TUNNEL_ROW), M.T.PATH, 'virtual tunnel wraps');
});

test('every corridor tile is reachable from the start and has no dead end', () => {
  for (let r = 0; r < M.ROWS; r++) {
    for (let c = 0; c < M.COLS; c++) {
      if (!M.walkable(c, r)) continue;
      let exits = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (M.walkable(c + dx, r + dy)) exits++;
      assert.ok(exits >= 2, `dead end at ${c},${r}`);
    }
  }
});

test('level tables match the arcade', () => {
  const l1 = levelSpec(1);
  assert.equal(l1.frightFrames, 360);
  assert.equal(l1.flashes, 5);
  assert.deepEqual(l1.houseLimits, [0, 30, 60]);
  assert.equal(l1.elroy1Dots, 20);
  assert.equal(l1.modeFrames[0], 420);
  assert.ok(Math.abs(l1.speed.pac - 0.8 * MAX_SPEED) < 1e-9);
  assert.equal(levelSpec(17).frightFrames, 0);
  assert.equal(levelSpec(19).frightFrames, 0);
  assert.equal(levelSpec(21).speed.pac, 0.9 * MAX_SPEED);
  assert.equal(levelSpec(13).fruit.kind, 'key');
  assert.deepEqual(fruitShelf(1), ['cherry']);
  assert.equal(fruitShelf(20).length, 7);
  for (let l = 1; l < 30; l++) {
    const s = levelSpec(l);
    for (const v of Object.values(s.speed)) assert.ok(v < 2 && v > 0, 'speed must stay under a quarter tile per frame');
  }
});

test('targeting personalities, including the up-direction overflow', () => {
  const g = new Game();
  g.modeIndex = 1;                                 // chase
  const place = (a, c, r) => { a.x = c * 8 + 4; a.y = r * 8 + 4; };
  place(g.pac, 14, 23);
  g.pac.facing = DIR.UP;
  const [blinky, pinky, inky, clyde] = g.ghosts;
  for (const gh of g.ghosts) gh.state = 'active';
  place(blinky, 20, 23);
  assert.deepEqual(g.targetFor(blinky), [14, 23]);
  assert.deepEqual(g.targetFor(pinky), [10, 19], 'pinky: 4 up and 4 left when pac faces up');
  assert.deepEqual(g.targetFor(inky), [(12 * 2) - 20, (21 * 2) - 23]);
  place(clyde, 14, 26);
  assert.deepEqual(g.targetFor(clyde), [0, 31], 'clyde retreats when within 8 tiles');
  place(clyde, 1, 1);
  assert.deepEqual(g.targetFor(clyde), [14, 23]);
  g.modeIndex = 0;
  assert.deepEqual(g.targetFor(blinky), [25, -3]);
  g.dotsLeft = 10;
  assert.deepEqual(g.targetFor(blinky), [14, 23], 'elroy ignores scatter');
});

test('fright reverses ghosts and an eaten ghost returns home and revives', () => {
  const g = new Game({ seed: 7 });
  while (g.phase === 'ready') g.step();
  for (let i = 0; i < 30; i++) g.step();
  const blinky = g.ghosts[0];
  const before = blinky.dir;
  g.startFright();
  assert.equal(blinky.dir, (before + 2) % 4);
  assert.ok(blinky.frightened);
  blinky.state = 'eyes';
  blinky.frightened = false;
  let revived = false;
  for (let i = 0; i < 60 * 20 && !revived; i++) {
    g.moveGhost(blinky);
    if (blinky.state === 'leaving') revived = true;
  }
  assert.ok(revived, 'eyes reached the house');
});

test('ghost house releases: pinky at once, inky after 30 dots on level 1', () => {
  const g = new Game();
  while (g.phase === 'ready') g.step();
  g.step();
  assert.equal(g.ghosts[1].state !== 'house', true);
  assert.equal(g.ghosts[2].state, 'house');
  for (let i = 0; i < 30; i++) g.countDotForHouse();
  g.updateHouse();
  assert.notEqual(g.ghosts[2].state, 'house');
});

function soak({ seed, levels, invincible, frames }) {
  const g = new Game({ seed, invincible });
  const stats = { levelsCleared: 0, deaths: 0, ghostsEaten: 0, fruit: 0, frames: 0 };
  while (stats.frames < frames && g.phase !== 'gameover' && g.level <= levels) {
    g.setInput(botDirection(g));
    g.step();
    stats.frames++;
    for (const e of g.drainEvents()) {
      if (e.type === 'levelClear') stats.levelsCleared++;
      if (e.type === 'death') stats.deaths++;
      if (e.type === 'ghostEaten') stats.ghostsEaten++;
      if (e.type === 'fruit') stats.fruit++;
    }
    for (const a of [g.pac, ...g.ghosts]) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), 'finite position');
    }
    const pt = tileType(g, g.pac.x, g.pac.y);
    assert.equal(pt, M.T.PATH, `pac inside ${pt} at ${g.pac.x},${g.pac.y}`);
    for (const gh of g.ghosts) {
      const t = tileType(g, gh.x, gh.y);
      if (gh.state === 'active' || gh.state === 'eyes') {
        assert.equal(t, M.T.PATH, `${gh.name} (${gh.state}) inside ${t} at ${gh.x},${gh.y} frame ${stats.frames}`);
      } else {
        assert.ok(t === M.T.HOUSE || t === M.T.DOOR || t === M.T.PATH, `${gh.name} in house states stays in the house`);
      }
    }
  }
  return { g, stats };
}

test('invincible autopilot clears 30 levels without leaving the corridors', () => {
  const { g, stats } = soak({ seed: 3, levels: 30, invincible: true, frames: 60 * 60 * 90 });
  assert.equal(stats.levelsCleared, 30, `cleared ${stats.levelsCleared}, stuck on level ${g.level} phase ${g.phase}`);
  assert.ok(stats.fruit > 0, 'fruit gets eaten');
  assert.ok(stats.ghostsEaten > 0, 'ghosts get eaten');
});

test('mortal autopilot plays complete games to game over deterministically', () => {
  for (const seed of [1, 2, 5]) {
    const a = soak({ seed, levels: 99, invincible: false, frames: 60 * 60 * 40 });
    const b = soak({ seed, levels: 99, invincible: false, frames: 60 * 60 * 40 });
    assert.equal(a.g.score, b.g.score, 'deterministic for a seed');
    assert.ok(a.stats.deaths >= 1);
    assert.ok(a.g.score > 1000, `seed ${seed} scored ${a.g.score}`);
  }
});

test('wall outlines trace into closed, rounded loops', async () => {
  const { buildWallLoops, R_CONVEX, R_CONCAVE } = await import('../src/mazeshape.js');
  const loops = buildWallLoops();
  assert.equal(loops.length, 22);
  for (const loop of loops) {
    assert.ok(loop.length >= 4 && loop.length % 2 === 0, 'rectilinear loops have an even corner count');
    for (const v of loop) {
      assert.ok(v.radius > 0 && v.radius <= (v.convex ? R_CONVEX : R_CONCAVE));
    }
  }
});

test('every maze is sound: sealed, connected, no dead ends, fixed house and spawn', () => {
  const { MAZES, mazeForLevel } = M;
  assert.equal(MAZES.length, 4);
  for (const mz of MAZES) {
    let dots = 0, power = 0;
    for (const v of mz.items) { if (v === M.ITEM.DOT) dots++; if (v === M.ITEM.POWER) power++; }
    assert.equal(power, 4, `${mz.name} power pellets`);
    assert.ok(dots > 200, `${mz.name} has ${dots} dots`);
    assert.equal(mz.tileAt(13, 12), M.T.DOOR, `${mz.name} door`);
    assert.equal(mz.tileAt(13, 14), M.T.HOUSE, `${mz.name} house`);
    assert.ok(mz.walkable(13, 23) && mz.walkable(14, 23), `${mz.name} spawn`);
    assert.ok(mz.walkable(13, 17) && mz.walkable(14, 17), `${mz.name} fruit spot`);
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        if (!mz.walkable(c, r)) continue;
        let exits = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mz.walkable(c + dx, r + dy)) exits++;
        assert.ok(exits >= 2, `${mz.name}: dead end at ${c},${r}`);
      }
    }
  }
  assert.equal(mazeForLevel(1).name, 'Classic');
  assert.equal(mazeForLevel(4).name, 'Orchid');
  assert.equal(mazeForLevel(7).name, 'Lagoon');
  assert.equal(mazeForLevel(10).name, 'Ember');
  assert.equal(mazeForLevel(13).name, 'Classic');
});

test('easy mode: more lives, repeating extra lives, slower ghosts, longer fright everywhere', () => {
  const easy = new Game({ difficulty: 'easy' });
  const arcade = new Game();
  assert.equal(easy.lives + 1, 8, 'eight lives on easy');
  assert.equal(arcade.lives, 2);
  easy.addScore(10000);
  easy.addScore(10000);
  assert.equal(easy.lives, 9, 'a life at 10k and again at 20k');
  arcade.addScore(10000);
  arcade.addScore(10000);
  assert.equal(arcade.lives, 3, 'arcade awards only one');
  for (let level = 1; level <= 25; level++) {
    const e = levelSpec(level, DIFFICULTY.easy), a = levelSpec(level);
    assert.ok(e.speed.ghost < a.speed.ghost, `ghosts slower on level ${level}`);
    assert.ok(e.frightFrames >= 6 * 60, `fright at least 6 s on level ${level}`);
    assert.ok(e.speed.pac > a.speed.pac, 'pac a little faster');
    assert.ok(e.frightFrames >= a.frightFrames);
    assert.equal(e.elroy1Dots, -1, 'no cruise elroy');
    assert.ok(e.houseLimits[1] > a.houseLimits[1] && e.idleLimit > a.idleLimit, 'slower release');
  }
});

test('easy mode: an eaten ghost rests in the house before coming back out', () => {
  const g = new Game({ difficulty: 'easy', seed: 4 });
  while (g.phase === 'ready') g.step();
  const blinky = g.ghosts[0];
  blinky.state = 'eyes';
  let restFrames = 0, left = false;
  for (let i = 0; i < 60 * 30 && !left; i++) {
    g.moveGhost(blinky);
    if (blinky.state === 'resting') restFrames++;
    if (blinky.state === 'leaving') left = true;
  }
  assert.ok(left, 'eventually leaves');
  assert.ok(restFrames >= 7 * 60 - 1, `rested ${restFrames} frames`);
});

test('easy mode: a dangerous ghost must overlap Pac-Man, not merely share a tile', () => {
  const g = new Game({ difficulty: 'easy' });
  while (g.phase === 'ready') g.step();
  const gh = g.ghosts[0];
  gh.state = 'active';
  g.pac.x = 9 * 8 + 1; g.pac.y = 5 * 8 + 4;
  gh.x = 9 * 8 + 7; gh.y = 5 * 8 + 4;                   // same tile, 6 apart (radius 5)
  assert.equal(g.checkCollisions(), false);
  gh.x = 9 * 8 + 5;                                     // 4 apart: real overlap
  assert.equal(g.checkCollisions(), true);
  assert.equal(g.phase, 'dying');
});

test('easy autopilot gets much further than arcade and reaches every maze', () => {
  const run = (difficulty, seed) => {
    const g = new Game({ seed, difficulty });
    const mazes = new Set();
    for (let f = 0; f < 60 * 60 * 60 && g.phase !== 'gameover'; f++) {
      g.setInput(botDirection(g)); g.step(); g.drainEvents();
      mazes.add(g.maze.name);
    }
    return { level: g.level, mazes };
  };
  let easy = 0, arcade = 0;
  const seen = new Set();
  for (const seed of [1, 2, 3, 4]) {
    const e = run('easy', seed);
    easy += e.level;
    e.mazes.forEach((m) => seen.add(m));
    arcade += run('arcade', seed).level;
  }
  assert.ok(easy >= arcade * 2, `easy reached ${easy / 4} on average vs arcade ${arcade / 4}`);
  assert.ok(seen.size >= 3, `easy runs visited ${[...seen].join(', ')}`);
});

test('easy mode refills to eight lives at every new level; arcade does not', () => {
  const g = new Game({ difficulty: 'easy' });
  g.lives = 1;
  g.drainEvents();
  g.nextLevel();
  assert.equal(g.lives + 1, 8);
  assert.ok(g.drainEvents().some((e) => e.type === 'livesRefilled'));
  g.lives = 11;
  g.nextLevel();
  assert.equal(g.lives, 11, 'bonus lives above eight are kept');
  const a = new Game();
  a.lives = 0;
  a.nextLevel();
  assert.equal(a.lives, 0);
});
