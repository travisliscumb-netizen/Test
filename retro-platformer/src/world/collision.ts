import { TILE } from "../tuning";

/** Anything that can answer "is this cell solid?". Out-of-range cells are the grid's responsibility. */
export interface SolidGrid {
  isSolid(tx: number, ty: number): boolean;
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cell {
  tx: number;
  ty: number;
}

/** Guards against float noise putting an edge a hair across a cell boundary. */
const EPS = 1e-6;

/** First cell index covered by a span starting at `min`. */
export function firstCell(min: number): number {
  return Math.floor(min / TILE + EPS);
}

/** Last cell index covered by a half-open span ending at `max`. */
export function lastCell(max: number): number {
  return Math.ceil(max / TILE - EPS) - 1;
}

export function overlapsSolid(grid: SolidGrid, x: number, y: number, w: number, h: number): boolean {
  const c0 = firstCell(x);
  const c1 = lastCell(x + w);
  const r0 = firstCell(y);
  const r1 = lastCell(y + h);
  for (let ty = r0; ty <= r1; ty++) {
    for (let tx = c0; tx <= c1; tx++) {
      if (grid.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

export interface MoveXResult {
  /** -1 blocked moving left, +1 blocked moving right, 0 free. */
  blocked: -1 | 0 | 1;
}

/**
 * Moves the body horizontally by dx, stopping flush against the first solid
 * column it would enter. Every column between the old and new edge is checked,
 * so no speed can tunnel. Cells the body already overlapped are ignored, which
 * lets a body that was pushed into a wall walk back out instead of snapping.
 */
export function moveX(grid: SolidGrid, body: Body, dx: number): MoveXResult {
  if (dx === 0) return { blocked: 0 };
  const r0 = firstCell(body.y);
  const r1 = lastCell(body.y + body.h);
  if (dx > 0) {
    const from = lastCell(body.x + body.w) + 1;
    const to = lastCell(body.x + body.w + dx);
    for (let tx = from; tx <= to; tx++) {
      if (columnSolid(grid, tx, r0, r1)) {
        body.x = tx * TILE - body.w;
        return { blocked: 1 };
      }
    }
  } else {
    const from = firstCell(body.x) - 1;
    const to = firstCell(body.x + dx);
    for (let tx = from; tx >= to; tx--) {
      if (columnSolid(grid, tx, r0, r1)) {
        body.x = (tx + 1) * TILE;
        return { blocked: -1 };
      }
    }
  }
  body.x += dx;
  return { blocked: 0 };
}

export interface MoveYResult {
  /** -1 blocked moving up (ceiling), +1 blocked moving down (floor), 0 free. */
  blocked: -1 | 0 | 1;
  /** The solid cells in the blocking row that overlap the body horizontally. */
  cells: Cell[];
}

/** Vertical counterpart of {@link moveX}. Reports which cells stopped the body. */
export function moveY(grid: SolidGrid, body: Body, dy: number): MoveYResult {
  if (dy === 0) return { blocked: 0, cells: [] };
  const c0 = firstCell(body.x);
  const c1 = lastCell(body.x + body.w);
  if (dy > 0) {
    const from = lastCell(body.y + body.h) + 1;
    const to = lastCell(body.y + body.h + dy);
    for (let ty = from; ty <= to; ty++) {
      const cells = rowSolids(grid, ty, c0, c1);
      if (cells.length > 0) {
        body.y = ty * TILE - body.h;
        return { blocked: 1, cells };
      }
    }
  } else {
    const from = firstCell(body.y) - 1;
    const to = firstCell(body.y + dy);
    for (let ty = from; ty >= to; ty--) {
      const cells = rowSolids(grid, ty, c0, c1);
      if (cells.length > 0) {
        body.y = (ty + 1) * TILE;
        return { blocked: -1, cells };
      }
    }
  }
  body.y += dy;
  return { blocked: 0, cells: [] };
}

/** True when the body is resting exactly on a solid surface. */
export function standingOnSolid(grid: SolidGrid, body: Body): boolean {
  const bottom = body.y + body.h;
  const row = firstCell(bottom);
  if (Math.abs(row * TILE - bottom) > EPS) return false;
  return rowSolids(grid, row, firstCell(body.x), lastCell(body.x + body.w)).length > 0;
}

function columnSolid(grid: SolidGrid, tx: number, r0: number, r1: number): boolean {
  for (let ty = r0; ty <= r1; ty++) {
    if (grid.isSolid(tx, ty)) return true;
  }
  return false;
}

function rowSolids(grid: SolidGrid, ty: number, c0: number, c1: number): Cell[] {
  const cells: Cell[] = [];
  for (let tx = c0; tx <= c1; tx++) {
    if (grid.isSolid(tx, ty)) cells.push({ tx, ty });
  }
  return cells;
}

/** Axis-aligned overlap test between two bodies (touching edges do not overlap). */
export function overlaps(a: Body, b: Body): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Whether `a` overlaps `b` shrunk by `inset` on every side. */
export function overlapsInset(a: Body, b: Body, inset: number): boolean {
  return overlaps(a, { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2 });
}
