import { moveX, moveY, standingOnSolid, type Body, type SolidGrid } from "../world/collision";
import { ENEMY, TILE } from "../tuning";

/** A simple physics body that walks, falls and turns at walls. */
export interface Actor extends Body {
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  onGround: boolean;
  /** Set when the actor should be removed from the world. */
  remove: boolean;
}

export function makeActor(tx: number, ty: number, w: number, h: number): Actor {
  const x = tx * TILE + (TILE - w) / 2;
  const y = (ty + 1) * TILE - h;
  return { x, y, w, h, prevX: x, prevY: y, vx: 0, vy: 0, dir: -1, onGround: false, remove: false };
}

/**
 * Moves with gravity and tile collision. Returns true if the actor hit a wall
 * (its velocity is not changed; callers decide whether to turn around).
 */
export function walkPhysics(a: Actor, grid: SolidGrid, gravity: number = ENEMY.gravity): boolean {
  a.vy = Math.min(a.vy + gravity, ENEMY.maxFallSpeed);
  const hitWall = moveX(grid, a, a.vx).blocked !== 0;
  const v = moveY(grid, a, a.vy);
  if (v.blocked !== 0) a.vy = 0;
  a.onGround = v.blocked === 1;
  return hitWall;
}

/** Ballistic motion with no collision (knocked-out enemies, debris). */
export function fallThrough(a: Actor, gravity: number): void {
  a.vy = Math.min(a.vy + gravity, ENEMY.maxFallSpeed * 2);
  a.x += a.vx;
  a.y += a.vy;
}

/** True when the cell just ahead of the actor's leading foot has no floor. */
export function ledgeAhead(a: Actor, grid: SolidGrid): boolean {
  if (!a.onGround) return false;
  const probe = { x: a.dir > 0 ? a.x + a.w : a.x - 1, y: a.y, w: 1, h: a.h };
  return !standingOnSolid(grid, probe);
}

/** Changes height keeping the feet in place. */
export function resizeKeepingFeet(a: Actor, h: number): void {
  const bottom = a.y + a.h;
  a.h = h;
  a.y = bottom - h;
  a.prevY = a.y;
}
