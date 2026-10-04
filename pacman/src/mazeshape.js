/* Wall geometry, derived from the tile layout. Pure -- no DOM.

   The arcade does not draw walls as filled tiles: it draws neon outlines inset
   into the wall tiles, single lines around solid blocks and double lines along
   one-tile-thick walls (the border and the ghost house). We reproduce that by
   eroding the union of wall tiles by a fixed inset, tracing the boundary of the
   result into closed polygons, and rounding each corner. Convex corners use a
   larger radius than concave ones, which keeps the two lines of every double
   wall concentric through its bends. */

import { COLS, ROWS, TILE, isWall } from './maze.js';

export const WALL_HALF = 1.25;                 // half-thickness of a 1-tile wall, in units
export const INSET = TILE / 2 - WALL_HALF;     // how far outlines sit inside the wall tiles
export const R_CONCAVE = 1.75;
export const R_CONVEX = R_CONCAVE + WALL_HALF * 2;

const STEP = 0.25;                             // tracing resolution, in units
const PAD = 1;                                 // tiles of margin outside the maze

/* The two walls bounding each tunnel continue off-screen so their outlines run
   out of the frame instead of closing in a cap at the screen edge. */
function solid(c, r) {
  if (c < 0 || c >= COLS) return (r === 13 || r === 15) && c >= -1 && c <= COLS;
  return isWall(c, r);
}

/* Which sub-cells of a wall tile survive the erosion depends only on which of
   its eight neighbours are walls, so each 3x3 pattern is computed once. */
const SUB = TILE / STEP;
const patterns = new Map();
function erodedTile(mask) {
  let pat = patterns.get(mask);
  if (pat) return pat;
  pat = new Uint8Array(SUB * SUB);
  for (let j = 0; j < SUB; j++) {
    for (let i = 0; i < SUB; i++) {
      const x = (i + 0.5) * STEP, y = (j + 0.5) * STEP;
      let keep = 1;
      for (let dr = -1; dr <= 1 && keep; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((!dr && !dc) || mask & (1 << ((dr + 1) * 3 + dc + 1))) continue;
          const dx = Math.max(dc * TILE - x, 0, x - (dc * TILE + TILE));
          const dy = Math.max(dr * TILE - y, 0, y - (dr * TILE + TILE));
          if (Math.max(dx, dy) < INSET) { keep = 0; break; }
        }
      }
      pat[j * SUB + i] = keep;
    }
  }
  patterns.set(mask, pat);
  return pat;
}

/* Returns closed loops of corner points, each with a per-corner radius. */
export function buildWallLoops() {
  const x0 = -PAD * TILE, y0 = 0;
  const nx = Math.round(((COLS + PAD * 2) * TILE) / STEP);
  const ny = Math.round((ROWS * TILE) / STEP);
  const grid = new Uint8Array(nx * ny);
  for (let r = 0; r < ROWS; r++) {
    for (let c = -PAD; c < COLS + PAD; c++) {
      if (!solid(c, r)) continue;
      let mask = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) if (solid(c + dc, r + dr)) mask |= 1 << ((dr + 1) * 3 + dc + 1);
      }
      const pat = erodedTile(mask);
      const gi = (c + PAD) * SUB, gj = r * SUB;
      for (let j = 0; j < SUB; j++) grid.set(pat.subarray(j * SUB, j * SUB + SUB), (gj + j) * nx + gi);
    }
  }
  const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? grid[j * nx + i] : 0);

  /* Directed boundary edges, clockwise around each filled cell (y points down).
     Erosion never leaves two regions touching at a single corner, so every
     vertex has at most one outgoing edge and a flat lookup table suffices. */
  const W = nx + 1;
  const next = new Int32Array(W * (ny + 1)).fill(-1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) next[j * W + i] = j * W + i + 1;
      if (!at(i + 1, j)) next[j * W + i + 1] = (j + 1) * W + i + 1;
      if (!at(i, j + 1)) next[(j + 1) * W + i + 1] = (j + 1) * W + i;
      if (!at(i - 1, j)) next[(j + 1) * W + i] = j * W + i;
    }
  }

  const loops = [];
  const used = new Uint8Array(next.length);
  for (let k0 = 0; k0 < next.length; k0++) {
    if (next[k0] < 0 || used[k0]) continue;
    const pts = [];
    for (let k = k0; !used[k]; k = next[k]) {
      used[k] = 1;
      pts.push([k % W, Math.floor(k / W)]);
    }
    /* Keep only corners. */
    const corners = [];
    for (let n = 0; n < pts.length; n++) {
      const a = pts[(n - 1 + pts.length) % pts.length], b = pts[n], c = pts[(n + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cross !== 0) corners.push({ x: x0 + b[0] * STEP, y: y0 + b[1] * STEP, convex: cross > 0 });
    }
    if (corners.length >= 4) loops.push(corners);
  }

  for (const loop of loops) {
    const n = loop.length;
    for (let m = 0; m < n; m++) {
      const p = loop[(m - 1 + n) % n], v = loop[m], q = loop[(m + 1) % n];
      const lenIn = Math.hypot(v.x - p.x, v.y - p.y);
      const lenOut = Math.hypot(q.x - v.x, q.y - v.y);
      v.radius = Math.min(v.convex ? R_CONVEX : R_CONCAVE, lenIn / 2, lenOut / 2);
    }
  }
  return loops;
}

/* Replays the loops onto any path-like target (CanvasRenderingContext2D or
   Path2D) with every corner rounded. */
export function traceLoops(target, loops) {
  for (const loop of loops) {
    const n = loop.length;
    const last = loop[n - 1], firstPt = loop[0];
    target.moveTo((last.x + firstPt.x) / 2, (last.y + firstPt.y) / 2);
    for (let m = 0; m < n; m++) {
      const v = loop[m], q = loop[(m + 1) % n];
      target.arcTo(v.x, v.y, q.x, q.y, v.radius);
    }
    target.closePath();
  }
}
