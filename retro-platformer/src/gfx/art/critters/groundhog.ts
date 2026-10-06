import { OUTLINE, ellipse, fillStroke, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, pancake, type Tone } from "./parts";

/** Groundhog: a chubby burrower waddling upright, buck teeth out, fists balled for trouble. */
const FUR: Tone = ["#5a3414", "#9a6232", "#d6a26a"];
const BELLY = "#e8c89a";
const DARK = "#3a200c";

export function drawGroundhog(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    pancake(ctx, 26, 7, FUR, () => {
      ctx.fillStyle = "#fff6dc";
      ctx.fillRect(9, -2.6, 1.4, 1.6);
      ctx.fillRect(10.6, -2.6, 1.4, 1.6);
    });
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 1;
  const tilt = Math.sin(step) * 0.06;
  // Feet shuffling.
  for (const [x, phase, far] of [
    [-4, step + Math.PI, true],
    [3.6, step, false],
  ] as const) {
    const lift = Math.max(0, Math.cos(phase)) * 1.4;
    ellipse(ctx, x + Math.sin(phase) * 1.8 + 1, -1.4 - lift, 3.6, 1.8);
    fillStroke(ctx, far ? DARK : FUR[0], OUTLINE, LINE);
  }
  ctx.translate(0, bob);
  ctx.rotate(tilt);
  // Stubby tail.
  ellipse(ctx, -8.6, -4.6, 2.6, 2, -0.5);
  fillStroke(ctx, FUR[0], OUTLINE, LINE);
  // Pear-shaped body.
  blob(ctx, 0, -10, 9, 9.6, FUR);
  ellipse(ctx, 2, -8.6, 5.6, 6.8);
  ctx.fillStyle = BELLY;
  ctx.fill();
  // Head, merged into the shoulders.
  blob(ctx, 2.4, -19, 6.4, 5.6, FUR);
  for (const x of [-2, 5.4]) {
    ellipse(ctx, x, -23.4, 1.8, 1.6);
    fillStroke(ctx, FUR[0], OUTLINE, LINE * 0.8);
  }
  ellipse(ctx, 6.4, -16.8, 3.4, 2.6);
  fillStroke(ctx, BELLY, OUTLINE, 0.7);
  ellipse(ctx, 8.6, -18, 1.3, 1);
  ctx.fillStyle = DARK;
  ctx.fill();
  // Buck teeth.
  ctx.fillStyle = "#fff6dc";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.5;
  for (const x of [5.6, 7.2]) {
    ctx.fillRect(x, -15.4, 1.5, 2.2);
    ctx.strokeRect(x, -15.4, 1.5, 2.2);
  }
  eye(ctx, 2.8, -20, 1.5);
  eye(ctx, 6.2, -19.8, 1.3);
  // Little fists up front.
  for (const [x, y] of [
    [7.4, -10.6],
    [5, -9.2],
  ] as const) {
    ellipse(ctx, x, y, 2, 1.8);
    fillStroke(ctx, FUR[1], OUTLINE, LINE);
  }
  ctx.restore();
}
