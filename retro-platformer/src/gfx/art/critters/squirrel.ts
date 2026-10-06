import { OUTLINE, ellipse, fillStroke, linear, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, pancake, type Tone } from "./parts";

/** Evil squirrel: a hopping grey squirrel with a huge bushy tail, glowing red eyes and an acorn clutched tight. */
const FUR: Tone = ["#3c3a46", "#7c7888", "#c4c0cc"];
const BELLY = "#e8e2e6";

export function drawSquirrel(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    pancake(ctx, 26, 6, FUR, () => {
      ellipse(ctx, -12, -4.6, 4.6, 3, 0.2);
      fillStroke(ctx, FUR[1], OUTLINE, LINE);
    });
    ctx.restore();
    return;
  }
  // Squirrels hop: both feet together, body rising between landings.
  const hop = Math.abs(Math.sin(step));
  const lift = -hop * 2.4;
  const sway = Math.sin(step * 0.5) * 1.2;
  // The tail: a fluffy S rising behind.
  ctx.beginPath();
  ctx.moveTo(-6, -5 + lift);
  ctx.bezierCurveTo(-18, -4 + lift, -19 + sway, -18, -12 + sway, -24);
  ctx.bezierCurveTo(-8 + sway, -27, -2 + sway, -25, -4 + sway, -21);
  ctx.bezierCurveTo(-9 + sway, -22, -12, -16 + lift, -4, -10 + lift);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, -18, -24, -4, -6, [
    [0, FUR[2]],
    [0.5, FUR[1]],
    [1, FUR[0]],
  ]), OUTLINE, LINE);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-14, -12 + lift * 0.5);
  ctx.quadraticCurveTo(-15 + sway, -19, -11 + sway, -22.6);
  ctx.stroke();
  leg(ctx, -2, -5 + lift, Math.PI / 2 + hop, 1.8, FUR[0], FUR[0], 1.2);
  blob(ctx, 0, -8.6 + lift, 6.6, 6.4, FUR);
  ellipse(ctx, 2.4, -7.6 + lift, 3.4, 4.6);
  ctx.fillStyle = BELLY;
  ctx.fill();
  leg(ctx, 1.6, -5 + lift, Math.PI / 2 + hop, 1.9, FUR[1], FUR[1], 1.2);
  // Acorn in its paws.
  ellipse(ctx, 6.4, -8.8 + lift, 2.2, 2.6);
  fillStroke(ctx, "#a86a2a", OUTLINE, 0.7);
  ellipse(ctx, 6.4, -10.8 + lift, 2.6, 1.3);
  fillStroke(ctx, "#5a3a1a", OUTLINE, 0.7);
  ellipse(ctx, 4.6, -9.4 + lift, 1.4, 1.2);
  fillStroke(ctx, FUR[1], OUTLINE, 0.7);
  // Head with tufted ears.
  const hx = 5.4;
  const hy = -15.4 + lift;
  ctx.beginPath();
  ctx.moveTo(hx - 3.4, hy - 2.6);
  ctx.lineTo(hx - 2.6, hy - 8.4);
  ctx.lineTo(hx - 0.4, hy - 3.6);
  ctx.closePath();
  fillStroke(ctx, FUR[1], OUTLINE, LINE);
  blob(ctx, hx, hy, 5, 4.4, FUR);
  ellipse(ctx, hx + 3.4, hy + 1.4, 2.6, 2);
  fillStroke(ctx, BELLY, OUTLINE, 0.6);
  ellipse(ctx, hx + 5.4, hy + 0.6, 0.9, 0.7);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  eye(ctx, hx + 1.4, hy - 0.8, 1.6, { iris: "#e01818", glow: true });
  // A wicked grin.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(hx + 2.2, hy + 2.6);
  ctx.quadraticCurveTo(hx + 3.6, hy + 3.6, hx + 5.2, hy + 2.2);
  ctx.stroke();
  ctx.restore();
}
