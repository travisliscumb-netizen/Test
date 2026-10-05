import type { Controls } from "../core/input";
import { moveX, moveY, overlapsSolid, type Body, type Cell, type SolidGrid } from "../world/collision";
import { PLAYER, TILE, type JumpTier } from "../tuning";

export type Form = "small" | "big";

export interface Player extends Body {
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  form: Form;
  onGround: boolean;
  /** Steps since the player last stood on the ground (0 while grounded). Drives coyote time. */
  airFrames: number;
  /** Steps since jump was last pressed (Infinity if not pending). Drives jump buffering. */
  jumpAge: number;
  /** Rising from a jump with the button still held (light gravity applies). */
  jumpHeld: boolean;
  /** True from takeoff until landing; selects the jump pose. */
  airborneFromJump: boolean;
  tier: JumpTier;
  /** Horizontal speed cap while airborne, fixed at takeoff. */
  airMax: number;
  skidding: boolean;
  /** Distance walked, drives the run cycle. */
  stride: number;
}

export function sizeFor(form: Form): { width: number; height: number } {
  return form === "big" ? PLAYER.big : PLAYER.small;
}

/** Creates a player standing with its feet on the bottom of cell (tx, ty). */
export function createPlayer(tx: number, ty: number, form: Form = "small"): Player {
  const { width, height } = sizeFor(form);
  const x = tx * TILE + (TILE - width) / 2;
  const y = (ty + 1) * TILE - height;
  return {
    x,
    y,
    w: width,
    h: height,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    facing: 1,
    form,
    onGround: true,
    airFrames: 0,
    jumpAge: Infinity,
    jumpHeld: false,
    airborneFromJump: false,
    tier: PLAYER.jumpTiers[0]!,
    airMax: PLAYER.walkMax,
    skidding: false,
    stride: 0,
  };
}

/** Switches form keeping the feet and horizontal centre in place. */
export function setForm(p: Player, form: Form): void {
  const { width, height } = sizeFor(form);
  const cx = p.x + p.w / 2;
  const bottom = p.y + p.h;
  p.form = form;
  p.w = width;
  p.h = height;
  p.x = cx - width / 2;
  p.y = bottom - height;
  p.prevX = p.x;
  p.prevY = p.y;
}

export function tierFor(speed: number): JumpTier {
  const abs = Math.abs(speed);
  return PLAYER.jumpTiers.find((t) => abs < t.belowSpeed) ?? PLAYER.jumpTiers[PLAYER.jumpTiers.length - 1]!;
}

export interface StepResult {
  jumped: boolean;
  landed: boolean;
  /** The block hit by the head this step, if any. */
  bumped: Cell | null;
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * Advances the player one fixed step: input → horizontal speed → jump →
 * gravity → axis-separated movement with collision. `minX` is the left wall
 * formed by the forward-only camera.
 */
export function stepPlayer(p: Player, c: Controls, grid: SolidGrid, minX: number): StepResult {
  p.prevX = p.x;
  p.prevY = p.y;
  const result: StepResult = { jumped: false, landed: false, bumped: null };
  const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);

  p.jumpAge = c.jumpPressed ? 0 : p.jumpAge + 1;

  if (p.onGround) groundControl(p, dir, c.run);
  else airControl(p, dir, c.run);

  // Jump: a press within the buffer window, while grounded or within coyote time.
  const canJump = p.onGround || (p.airFrames <= PLAYER.coyoteFrames && !p.airborneFromJump);
  if (p.jumpAge <= PLAYER.jumpBufferFrames && canJump) {
    p.tier = tierFor(p.vx);
    p.vy = -p.tier.velocity;
    p.jumpHeld = true;
    p.airborneFromJump = true;
    p.onGround = false;
    p.jumpAge = Infinity;
    p.skidding = false;
    p.airMax = Math.max(PLAYER.walkMax, Math.min(PLAYER.runMax, Math.abs(p.vx)));
    result.jumped = true;
  }

  if (!c.jump || p.vy >= 0) p.jumpHeld = false;
  const gravity = p.jumpHeld ? p.tier.holdGravity : p.tier.fallGravity;
  p.vy = Math.min(p.vy + gravity, PLAYER.maxFallSpeed);

  // Horizontal move, then the camera's left wall.
  if (moveX(grid, p, p.vx).blocked !== 0) p.vx = 0;
  if (p.x < minX) {
    p.x = minX;
    if (p.vx < 0) p.vx = 0;
  }

  // Vertical move with head-bonk corner correction.
  const wasOnGround = p.onGround;
  const startY = p.y;
  let vertical = moveY(grid, p, p.vy);
  if (vertical.blocked === -1 && cornerCorrect(p, grid, vertical.cells, startY)) {
    vertical = moveY(grid, p, p.vy);
  }

  if (vertical.blocked === 1) {
    p.vy = 0;
    p.onGround = true;
    p.jumpHeld = false;
    p.airborneFromJump = false;
    if (!wasOnGround) result.landed = true;
  } else {
    p.onGround = false;
    if (vertical.blocked === -1) {
      p.vy = 0;
      p.jumpHeld = false;
      result.bumped = closestCell(vertical.cells, p.x + p.w / 2);
    }
  }

  if (p.onGround) {
    p.airFrames = 0;
    p.tier = tierFor(p.vx);
    p.stride += Math.abs(p.vx);
  } else {
    p.airFrames++;
  }
  return result;
}

function groundControl(p: Player, dir: number, run: boolean): void {
  const max = run ? PLAYER.runMax : PLAYER.walkMax;
  if (dir === 0) {
    p.skidding = false;
    p.vx = sign(p.vx) * Math.max(0, Math.abs(p.vx) - PLAYER.releaseDecel);
    return;
  }
  p.facing = dir as 1 | -1;
  if (sign(p.vx) === -dir) {
    // Reversing: brake hard, showing a skid when moving fast enough.
    p.skidding = p.skidding || Math.abs(p.vx) >= PLAYER.skidMinSpeed;
    const speed = Math.abs(p.vx) - PLAYER.skidDecel;
    p.vx = speed > 0 ? -dir * speed : 0;
    if (p.vx === 0) p.skidding = false;
    return;
  }
  p.skidding = false;
  const speed = Math.abs(p.vx);
  if (speed < PLAYER.minWalkSpeed) p.vx = dir * PLAYER.minWalkSpeed;
  else if (speed < max) p.vx = dir * Math.min(max, speed + (run ? PLAYER.runAccel : PLAYER.walkAccel));
  else if (speed > max) p.vx = dir * Math.max(max, speed - PLAYER.releaseDecel);
}

function airControl(p: Player, dir: number, run: boolean): void {
  p.skidding = false;
  if (dir === 0) return; // Momentum is kept in the air.
  const max = run ? PLAYER.runMax : p.airMax;
  if (sign(p.vx) === -dir) {
    p.vx += dir * PLAYER.airReverseAccel;
    return;
  }
  const speed = Math.abs(p.vx);
  if (speed < max) p.vx = dir * Math.min(max, speed + (run ? PLAYER.airRunAccel : PLAYER.airAccel));
}

/**
 * If a rising head only clipped the corner of a ceiling by a few pixels, nudge
 * the player sideways around it. Returns true if the player was moved.
 */
function cornerCorrect(p: Player, grid: SolidGrid, cells: readonly Cell[], startY: number): boolean {
  if (cells.length === 0) return false;
  const minTx = Math.min(...cells.map((cell) => cell.tx));
  const maxTx = Math.max(...cells.map((cell) => cell.tx));
  const targetY = startY + p.vy;
  const candidates = [
    p.x + p.w - minTx * TILE, // ceiling sticks in from the right: shift left
    (maxTx + 1) * TILE - p.x, // ceiling sticks in from the left: shift right
  ];
  for (const [i, overlap] of candidates.entries()) {
    if (overlap <= 0 || overlap > PLAYER.cornerCorrection) continue;
    const nx = i === 0 ? p.x - overlap : p.x + overlap;
    if (!overlapsSolid(grid, nx, startY, p.w, p.h) && !overlapsSolid(grid, nx, targetY, p.w, p.h)) {
      p.x = nx;
      p.y = startY;
      return true;
    }
  }
  return false;
}

function closestCell(cells: readonly Cell[], centerX: number): Cell | null {
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (const cell of cells) {
    const d = Math.abs((cell.tx + 0.5) * TILE - centerX);
    if (d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }
  return best;
}

/** Bounce off a stomped enemy. Holding jump bounces higher. */
export function bounce(p: Player, jumpHeld: boolean): void {
  p.vy = -(jumpHeld ? PLAYER.stompBounceHeld : PLAYER.stompBounce);
  p.jumpHeld = jumpHeld;
  p.onGround = false;
  p.airborneFromJump = true;
}

export type PlayerPose = "idle" | "run0" | "run1" | "run2" | "run3" | "jump" | "skid";

/** Which animation pose to show. The run cycle advances faster at higher speed. */
export function playerPose(p: Player): PlayerPose {
  if (!p.onGround) return p.airborneFromJump ? "jump" : runFrame(p);
  if (p.skidding) return "skid";
  if (p.vx === 0) return "idle";
  return runFrame(p);
}

function runFrame(p: Player): PlayerPose {
  const frame = Math.floor(p.stride / 14) % 4;
  return (["run0", "run1", "run2", "run3"] as const)[frame]!;
}
