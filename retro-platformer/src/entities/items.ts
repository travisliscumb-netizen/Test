import type { SolidGrid } from "../world/collision";
import { ITEM, TILE } from "../tuning";
import { walkPhysics, type Actor } from "./actor";

/** The grow power-up. Rises out of its block, then slides along the ground. */
export interface Sprout extends Actor {
  kind: "sprout";
  state: "emerge" | "move";
  /** Top of the block it is emerging from; emerging ends when the feet reach it. */
  emergeTo: number;
  anim: number;
}

/** Spawns a sprout hidden inside the block at (tx, ty). */
export function createSprout(tx: number, ty: number): Sprout {
  const { width, height } = ITEM.sprout;
  const x = tx * TILE + (TILE - width) / 2;
  const y = ty * TILE + (TILE - height);
  return {
    x,
    y,
    w: width,
    h: height,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    dir: 1,
    onGround: false,
    remove: false,
    kind: "sprout",
    state: "emerge",
    emergeTo: ty * TILE,
    anim: 0,
  };
}

export function stepSprout(s: Sprout, grid: SolidGrid, levelBottom: number): void {
  s.prevX = s.x;
  s.prevY = s.y;
  s.anim++;
  if (s.state === "emerge") {
    s.y -= ITEM.sprout.emergeSpeed;
    if (s.y + s.h <= s.emergeTo) {
      s.y = s.emergeTo - s.h;
      s.state = "move";
    }
    return;
  }
  s.vx = s.dir * ITEM.sprout.speed;
  if (walkPhysics(s, grid)) s.dir = -s.dir as 1 | -1;
  if (s.y > levelBottom) s.remove = true;
}

/** A block bumped under a moving sprout makes it hop, heading away from the hit. */
export function hopSprout(s: Sprout, blockCenterX: number): void {
  if (s.state !== "move") return;
  s.vy = -ITEM.sprout.bounceSpeed;
  s.dir = s.x + s.w / 2 >= blockCenterX ? 1 : -1;
}

/** Visual-only particles and popups. */
export type Effect =
  | { kind: "coin"; x: number; y: number; prevX: number; prevY: number; vy: number; startY: number; age: number; remove: boolean }
  | { kind: "debris"; x: number; y: number; prevX: number; prevY: number; vx: number; vy: number; age: number; remove: boolean }
  | { kind: "score"; text: string; x: number; y: number; prevX: number; prevY: number; age: number; remove: boolean }
  | { kind: "dust"; x: number; y: number; prevX: number; prevY: number; age: number; remove: boolean };

/** Lifetime of score popups and dust puffs, in frames. */
const SCORE_POPUP_FRAMES = 48;
export const DUST_FRAMES = 18;

export function coinPop(tx: number, ty: number): Effect {
  const x = tx * TILE;
  const y = (ty - 1) * TILE;
  return { kind: "coin", x, y, prevX: x, prevY: y, vy: -ITEM.coinPopSpeed, startY: y, age: 0, remove: false };
}

export function brickDebris(tx: number, ty: number): Effect[] {
  return ITEM.debrisLaunch.map(({ vx, vy }, i) => {
    const x = tx * TILE + (i % 2) * 16 + 2;
    const y = ty * TILE + Math.floor(i / 2) * 16;
    return { kind: "debris" as const, x, y, prevX: x, prevY: y, vx, vy, age: 0, remove: false };
  });
}

export function scorePopup(text: string, x: number, y: number): Effect {
  return { kind: "score", text, x, y, prevX: x, prevY: y, age: 0, remove: false };
}

export function dustPuff(x: number, y: number): Effect {
  return { kind: "dust", x, y, prevX: x, prevY: y, age: 0, remove: false };
}

/** Advances an effect. Returns true when a block coin finished its arc (to spawn its score popup). */
export function stepEffect(e: Effect, levelBottom: number): boolean {
  e.prevX = e.x;
  e.prevY = e.y;
  e.age++;
  switch (e.kind) {
    case "coin":
      e.vy += ITEM.coinPopGravity;
      e.y += e.vy;
      if (e.vy > 0 && e.y >= e.startY - TILE / 2) {
        e.remove = true;
        return true;
      }
      return false;
    case "debris":
      e.vy += ITEM.debrisGravity;
      e.x += e.vx;
      e.y += e.vy;
      if (e.y > levelBottom + 64) e.remove = true;
      return false;
    case "score":
      e.y -= 1;
      if (e.age >= SCORE_POPUP_FRAMES) e.remove = true;
      return false;
    case "dust":
      e.y -= 0.25;
      if (e.age >= DUST_FRAMES) e.remove = true;
      return false;
  }
}
