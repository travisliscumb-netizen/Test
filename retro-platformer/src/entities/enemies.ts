import type { SolidGrid } from "../world/collision";
import { ENEMY } from "../tuning";
import { fallThrough, ledgeAhead, makeActor, resizeKeepingFeet, walkPhysics, type Actor } from "./actor";

/** Grub: walks, turns at walls, walks off ledges. Stomp squashes it. */
export interface Walker extends Actor {
  kind: "walker";
  state: "walk" | "squashed" | "flipped";
  timer: number;
  /** Distance walked, drives the animation. */
  stride: number;
}

/**
 * Shellback: walks and turns at ledges. Stomp → shell; touching or stomping a
 * still shell kicks it; a sliding shell knocks out other enemies; stomping a
 * sliding shell stops it. A still shell eventually wakes up.
 */
export interface Shellback extends Actor {
  kind: "shell";
  state: "walk" | "shell" | "slide" | "flipped";
  /** Frames spent in the current state. */
  timer: number;
  /** Frames during which the player who kicked it is immune to it. */
  kickGrace: number;
  /** Kills made by this slide (indexes the shell combo score table). */
  chain: number;
  stride: number;
}

export type Enemy = Walker | Shellback;

export function createWalker(tx: number, ty: number): Walker {
  const a = makeActor(tx, ty, ENEMY.walker.width, ENEMY.walker.height);
  return { ...a, kind: "walker", state: "walk", timer: 0, stride: 0 };
}

export function createShellback(tx: number, ty: number): Shellback {
  const a = makeActor(tx, ty, ENEMY.shell.width, ENEMY.shell.walkHeight);
  return { ...a, kind: "shell", state: "walk", timer: 0, kickGrace: 0, chain: 0, stride: 0 };
}

/** Knocked out (by a shell or a block from below): flips over and falls off the screen. */
export function flipEnemy(e: Enemy, dir: 1 | -1): void {
  e.state = "flipped";
  e.vx = dir * 1;
  e.vy = -ENEMY.flipLaunchSpeed;
  e.timer = 0;
}

export function squashWalker(e: Walker): void {
  e.state = "squashed";
  e.vx = 0;
  e.timer = ENEMY.walker.squashFrames;
}

export function enterShell(e: Shellback): void {
  e.state = "shell";
  e.vx = 0;
  e.timer = 0;
  e.chain = 0;
  resizeKeepingFeet(e, ENEMY.shell.shellHeight);
}

export function kickShell(e: Shellback, dir: 1 | -1): void {
  e.state = "slide";
  e.dir = dir;
  e.vx = dir * ENEMY.shell.kickSpeed;
  e.timer = 0;
  e.chain = 0;
  e.kickGrace = ENEMY.shell.kickGraceFrames;
  if (e.h !== ENEMY.shell.shellHeight) resizeKeepingFeet(e, ENEMY.shell.shellHeight);
}

/** True while a still shell is about to wake (drawn shaking). */
export function shellWaking(e: Shellback): boolean {
  return e.state === "shell" && e.timer >= ENEMY.shell.reviveFrames - ENEMY.shell.wiggleFrames;
}

/** Whether this enemy can hurt the player or be stomped. */
export function isDangerous(e: Enemy): boolean {
  return e.state === "walk" || e.state === "slide";
}

export interface EnemyStep {
  /** The enemy bumped a wall this step (sliding shells make a sound). */
  hitWall: boolean;
}

export function stepEnemy(e: Enemy, grid: SolidGrid, levelBottom: number): EnemyStep {
  e.prevX = e.x;
  e.prevY = e.y;
  if (e.state === "flipped") {
    fallThrough(e, ENEMY.gravity);
    if (e.y > levelBottom + 64) e.remove = true;
    return { hitWall: false };
  }
  if (e.kind === "walker") return stepWalker(e, grid, levelBottom);
  return stepShellback(e, grid, levelBottom);
}

function stepWalker(e: Walker, grid: SolidGrid, levelBottom: number): EnemyStep {
  if (e.state === "squashed") {
    if (--e.timer <= 0) e.remove = true;
    return { hitWall: false };
  }
  e.vx = e.dir * ENEMY.walker.speed;
  if (walkPhysics(e, grid)) e.dir = -e.dir as 1 | -1;
  e.stride += ENEMY.walker.speed;
  if (e.y > levelBottom) e.remove = true;
  return { hitWall: false };
}

function stepShellback(e: Shellback, grid: SolidGrid, levelBottom: number): EnemyStep {
  if (e.kickGrace > 0) e.kickGrace--;
  e.timer++;
  let hitWall = false;
  switch (e.state) {
    case "walk":
      e.vx = e.dir * ENEMY.shell.speed;
      if (walkPhysics(e, grid) || ledgeAhead(e, grid)) e.dir = -e.dir as 1 | -1;
      e.stride += ENEMY.shell.speed;
      break;
    case "shell":
      e.vx = 0;
      walkPhysics(e, grid);
      if (e.timer >= ENEMY.shell.reviveFrames) {
        e.state = "walk";
        e.timer = 0;
        resizeKeepingFeet(e, ENEMY.shell.walkHeight);
      }
      break;
    case "slide":
      e.vx = e.dir * ENEMY.shell.kickSpeed;
      if (walkPhysics(e, grid)) {
        e.dir = -e.dir as 1 | -1;
        hitWall = true;
      }
      break;
  }
  if (e.y > levelBottom) e.remove = true;
  return { hitWall };
}

/** Walking enemies that meet turn around (only if they were heading toward each other). */
export function bounceApart(a: Enemy, b: Enemy): void {
  const aCenter = a.x + a.w / 2;
  const bCenter = b.x + b.w / 2;
  const aTowardB = (bCenter - aCenter) * a.dir > 0;
  const bTowardA = (aCenter - bCenter) * b.dir > 0;
  if (a.state === "walk" && aTowardB) a.dir = -a.dir as 1 | -1;
  if (b.state === "walk" && bTowardA) b.dir = -b.dir as 1 | -1;
}
