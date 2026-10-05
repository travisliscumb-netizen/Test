/* Autopilot. Drives the attract-mode demo on the title screen and the
   headless soak tests. Breadth-first search over the tile graph: chase a
   frightened ghost when one is close, otherwise head for the nearest dot,
   treating tiles near dangerous ghosts as walls. Pure -- no DOM. */

import * as M from './maze.js';
import { DX, DY, opposite } from './engine.js';

const N = M.COLS * M.ROWS;
const dist = new Int16Array(N);
const first = new Int8Array(N);
const queue = new Int16Array(N);

const norm = (c, r) => (r === M.TUNNEL_ROW ? ((c % M.COLS) + M.COLS) % M.COLS : c);
/* The maze being searched; set at the top of each botDirection call. */
let maze = M.MAZES[0];
const ok = (c, r) => c >= 0 && c < M.COLS && r >= 0 && r < M.ROWS && maze.walkable(c, r);

function dangerMap(game) {
  const danger = new Uint8Array(N);
  for (const g of game.ghosts) {
    if (g.state !== 'active' || g.frightened) continue;
    const gc = norm(M.tileOf(g.x), M.tileOf(g.y)), gr = M.tileOf(g.y);
    /* Flood a small radius around each ghost, reaching further ahead of it. */
    const stack = [[gc, gr, 0]];
    while (stack.length) {
      const [c, r, d] = stack.pop();
      if (!ok(c, r)) continue;
      const i = r * M.COLS + c;
      if (danger[i] && d > 0) continue;
      danger[i] = 1;
      if (d >= 2) continue;
      for (let k = 0; k < 4; k++) stack.push([norm(c + DX[k], r + DY[k]), r + DY[k], d + 1]);
    }
    const ac = norm(gc + DX[g.dir] * 3, gr), ar = gr + DY[g.dir] * 3;
    if (ok(ac, ar)) danger[ar * M.COLS + ac] = 1;
  }
  return danger;
}

function search(game, sc, sr, danger, goal) {
  dist.fill(-1);
  let head = 0, tail = 0;
  const s = sr * M.COLS + sc;
  dist[s] = 0; first[s] = -1; queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const c = i % M.COLS, r = (i / M.COLS) | 0;
    if (i !== s && goal(c, r, i)) return { dir: first[i], steps: dist[i] };
    for (let d = 0; d < 4; d++) {
      const nc = norm(c + DX[d], r + DY[d]), nr = r + DY[d];
      if (!ok(nc, nr)) continue;
      const j = nr * M.COLS + nc;
      if (dist[j] >= 0 || (danger && danger[j])) continue;
      dist[j] = dist[i] + 1;
      first[j] = i === s ? d : first[i];
      queue[tail++] = j;
    }
  }
  return null;
}

export function botDirection(game) {
  maze = game.maze;
  const p = game.pac;
  const sc = norm(M.tileOf(p.x), M.tileOf(p.y)), sr = M.tileOf(p.y);
  if (!ok(sc, sr)) return p.dir;
  const danger = dangerMap(game);

  const prey = game.ghosts.filter((g) => g.frightened && g.state === 'active');
  if (prey.length && game.frightTimer > 90) {
    const keys = new Set(prey.map((g) => M.tileOf(g.y) * M.COLS + norm(M.tileOf(g.x), M.tileOf(g.y))));
    const hunt = search(game, sc, sr, danger, (c, r, i) => keys.has(i));
    if (hunt && hunt.steps <= 12) return hunt.dir;
  }

  const fruit = game.fruit;
  const food = search(game, sc, sr, danger, (c, r, i) =>
    game.items[i] !== 0 || (fruit && r === 17 && (c === 13 || c === 14)));
  if (food) return food.dir;

  /* Boxed in: step to whichever neighbour is furthest from every threat. */
  let best = opposite(p.dir), bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    const nc = norm(sc + DX[d], sr), nr = sr + DY[d];
    if (!ok(nc, nr)) continue;
    let score = 0;
    for (const g of game.ghosts) {
      if (g.state !== 'active' || g.frightened) continue;
      score += Math.min(64, (M.tileOf(g.x) - nc) ** 2 + (M.tileOf(g.y) - nr) ** 2);
    }
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
