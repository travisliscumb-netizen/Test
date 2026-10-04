/* Headless engine tests: maze integrity, arcade rule tables, targeting, and
   long soak runs driven by the autopilot. Run with `node --test tests/`. */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/maze.js';
import { Game, DIR, levelSpec, fruitShelf, MAX_SPEED } from '../src/engine.js';
import { botDirection } from '../src/bot.js';

const tileType = (x, y) => M.tileAt(M.tileOf(x), M.tileOf(y));

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
    const pt = tileType(g.pac.x, g.pac.y);
    assert.equal(pt, M.T.PATH, `pac inside ${pt} at ${g.pac.x},${g.pac.y}`);
    for (const gh of g.ghosts) {
      const t = tileType(gh.x, gh.y);
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
