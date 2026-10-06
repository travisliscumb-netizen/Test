import { OUTLINE, ellipse, fillStroke, linear, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, pancake, tail, type Tone } from "./parts";

/** Street rat: a scruffy grey-brown rat with a long pink tail, red eyes and buck teeth. */
const FUR: Tone = ["#3e3640", "#7a6c70", "#b8a8a4"];
const PINK = "#f0a0aa";
const PINK_DARK = "#b86672";

export function drawRat(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    pancake(ctx, 28, 6, FUR, () => {
      tail(ctx, -12, -2, -15.5, -1, -17.5, -3, 1.1, 0.5, PINK);
      ellipse(ctx, 13, -3.4, 1.3, 1.1);
      fillStroke(ctx, PINK, OUTLINE, 0.6);
    });
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.9;
  const sway = Math.sin(step * 0.5) * 2;
  tail(ctx, -9, -6 + bob, -16, -2 + sway * 0.3, -17.4, -12 + sway, 1.6, 0.5, linear(ctx, -9, 0, -19, 0, [
    [0, PINK_DARK],
    [1, PINK],
  ]));
  // Far legs, darker.
  leg(ctx, -5, -6 + bob, step + Math.PI, 1.6, FUR[0], PINK_DARK);
  leg(ctx, 5, -6 + bob, step, 1.6, FUR[0], PINK_DARK);
  // Body: a hunched oval with a ruffled back.
  blob(ctx, -1, -9 + bob, 10.5, 7, FUR, -0.08);
  ctx.strokeStyle = FUR[0];
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const [x, y] of [[-6, -14], [-3, -15.4], [0, -15.6]] as const) {
    ctx.moveTo(x, y + bob + 1.6);
    ctx.lineTo(x - 1.2, y + bob - 0.2);
  }
  ctx.stroke();
  // Near legs.
  leg(ctx, -3, -5 + bob, step, 1.8, FUR[1], PINK);
  leg(ctx, 7, -5 + bob, step + Math.PI, 1.8, FUR[1], PINK);
  // Head with a long snout.
  blob(ctx, 9, -11 + bob, 6.4, 5.2, FUR, 0.18);
  ellipse(ctx, 14.5, -9.4 + bob, 3.6, 2.6, 0.25);
  fillStroke(ctx, FUR[2], OUTLINE, LINE);
  ellipse(ctx, 17.6, -9.6 + bob, 1.4, 1.2);
  fillStroke(ctx, PINK, OUTLINE, 0.7);
  // Whiskers.
  ctx.strokeStyle = "rgba(37, 24, 46, 0.7)";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (const dy of [-1, 0.4, 1.6]) {
    ctx.moveTo(15.5, -9 + bob);
    ctx.lineTo(18.8, -9 + bob + dy * 1.4);
  }
  ctx.stroke();
  // Buck teeth under the snout.
  ctx.fillStyle = "#fff8e4";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.5;
  ctx.fillRect(14.2, -7.4 + bob, 1.6, 2);
  ctx.strokeRect(14.2, -7.4 + bob, 1.6, 2);
  // Big round ear.
  ellipse(ctx, 6.2, -16.6 + bob, 3.2, 3.4, -0.3);
  fillStroke(ctx, FUR[1], OUTLINE, LINE);
  ellipse(ctx, 6.4, -16.4 + bob, 1.9, 2.2, -0.3);
  ctx.fillStyle = PINK;
  ctx.fill();
  eye(ctx, 11.2, -12.4 + bob, 1.7, { iris: "#d0202a", glow: true });
  ctx.restore();
}
