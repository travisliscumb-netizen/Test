import { OUTLINE, ellipse, fillStroke, linear, radial, roundRect, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, peekingEyes, type Tone } from "./parts";
import type { ShellState } from "./types";

/**
 * Hard-hat critter: a mole-like site worker in work boots under an oversized
 * hard hat. Stomped, it ducks fully under the hat, which skids when kicked.
 */
const FUR: Tone = ["#4a3628", "#806050", "#b8988a"];
const HAT: Tone = ["#b07a00", "#ffc21a", "#fff0a0"];
const BOOT = "#6a3a14";

/** The hat on the ground, brim down. `spin` turns it about its vertical axis (the sticker sweeps round). */
function hat(ctx: Ctx, y: number, spin: number): void {
  // Dome.
  ctx.beginPath();
  ctx.moveTo(-11, y);
  ctx.bezierCurveTo(-11, y - 16, 11, y - 16, 11, y);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, 2, y - 10, 16, [
    [0, HAT[2]],
    [0.45, HAT[1]],
    [1, HAT[0]],
  ], 4, y - 11), OUTLINE, LINE);
  // Raised centre ridge.
  ctx.strokeStyle = HAT[0];
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const ridge = Math.sin(spin) * 6;
  ctx.moveTo(ridge * 0.5, y - 0.4);
  ctx.quadraticCurveTo(ridge, y - 11, ridge * 0.4, y - 12);
  ctx.stroke();
  // A round safety sticker that sweeps across as the hat turns.
  const c = Math.cos(spin);
  if (c > 0) {
    const sx = Math.sin(spin) * 7;
    ellipse(ctx, sx, y - 6, 2.6 * c, 2.6);
    fillStroke(ctx, "#2a8a3a", OUTLINE, 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sx - 0.4 * c, y - 7.6, 0.8 * c, 3.2);
    ctx.fillRect(sx - 1.6 * c, y - 6.4, 3.2 * c, 0.8);
  }
  // Brim.
  roundRect(ctx, -13, y - 1.6, 26, 3, 1.4);
  fillStroke(ctx, linear(ctx, 0, y - 1.6, 0, y + 1.4, [
    [0, HAT[1]],
    [1, HAT[0]],
  ]), OUTLINE, LINE);
}

export function drawHardHat(ctx: Ctx, state: ShellState, step: number, spin: number): void {
  begin(ctx);
  if (state !== "walk") {
    if (state === "peek") {
      // Eyes and boots peeking from under the brim.
      ellipse(ctx, 0, -1.6, 9, 2.2);
      ctx.fillStyle = "#140c10";
      ctx.fill();
      peekingEyes(ctx, 2, -1.8, 3.6);
    }
    hat(ctx, -3, spin);
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.9;
  // Boots.
  for (const [x, phase, far] of [
    [-4, step + Math.PI, true],
    [3.4, step, false],
  ] as const) {
    const lift = Math.max(0, Math.cos(phase)) * 1.5;
    const fx = x + Math.sin(phase) * 2;
    roundRect(ctx, fx - 2.4, -3.4 - lift, 5.8, 3.4, 1.4);
    fillStroke(ctx, far ? "#4a2808" : BOOT, OUTLINE, LINE);
    if (!far) {
      ctx.fillStyle = "#e8c070";
      ctx.fillRect(fx - 0.6, -2.8 - lift, 2.6, 0.7);
    }
  }
  // Round furry body in a hi-vis vest.
  blob(ctx, 0, -11 + bob, 8.6, 8.6, FUR);
  ctx.save();
  ellipse(ctx, 0, -11 + bob, 8.6, 8.6);
  ctx.clip();
  ctx.fillStyle = "#ff7a1a";
  ctx.fillRect(-9, -9 + bob, 18, 8);
  ctx.fillStyle = "#e8eef4";
  ctx.fillRect(-9, -6.6 + bob, 18, 1.4);
  ctx.restore();
  ellipse(ctx, 0, -11 + bob, 8.6, 8.6);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = LINE;
  ctx.stroke();
  // Snout and digging claws.
  ellipse(ctx, 8.4, -12.4 + bob, 3, 2.2);
  fillStroke(ctx, FUR[2], OUTLINE, LINE);
  ellipse(ctx, 11, -12.8 + bob, 1.3, 1.1);
  fillStroke(ctx, "#f08a9a", OUTLINE, 0.6);
  ctx.strokeStyle = "#f4ecdc";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const dy of [0, 1.2, 2.4]) {
    ctx.moveTo(7, -7.4 + bob + dy * 0.5);
    ctx.lineTo(9.6, -6.6 + bob + dy);
  }
  ctx.stroke();
  // Squinting eyes under the brim.
  eye(ctx, 3.4, -14.2 + bob, 1.4, { lid: 0.45, angry: false });
  eye(ctx, 6.6, -14 + bob, 1.2, { lid: 0.45, angry: false });
  // The oversized hat, tipped forward.
  ctx.save();
  ctx.translate(0.6, -15.4 + bob);
  ctx.rotate(0.12);
  ctx.scale(0.86, 0.86);
  hat(ctx, 0, 0.5);
  ctx.restore();
  ctx.restore();
}
