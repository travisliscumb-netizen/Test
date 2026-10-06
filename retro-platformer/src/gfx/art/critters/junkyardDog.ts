import { OUTLINE, ellipse, fillStroke, roundRect, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, pancake, type Tone } from "./parts";

/** Junkyard dog: a stocky, bow-legged mutt with a studded collar, an underbite and a patched ear. */
const FUR: Tone = ["#4a3a30", "#8a7462", "#c8b49c"];
const PATCH = "#3a2c24";
const COLLAR = "#b42a2a";

export function drawJunkyardDog(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    pancake(ctx, 30, 7, FUR, () => {
      roundRect(ctx, 4, -6.4, 3, 5.6, 1);
      fillStroke(ctx, COLLAR, OUTLINE, 0.6);
    });
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.9;
  const wag = Math.sin(step * 2) * 0.5;
  // Stubby tail, wagging.
  ctx.save();
  ctx.translate(-10, -13 + bob);
  ctx.rotate(-0.9 + wag);
  roundRect(ctx, -1.2, -5, 2.6, 5.4, 1.3);
  fillStroke(ctx, FUR[1], OUTLINE, LINE);
  ctx.restore();
  leg(ctx, -6, -8 + bob, step + Math.PI, 2, FUR[0], FUR[0], 2.2);
  leg(ctx, 5, -8 + bob, step, 2, FUR[0], FUR[0], 2.2);
  // Barrel chest.
  blob(ctx, -1, -11 + bob, 10.6, 7, FUR);
  ellipse(ctx, -5, -13 + bob, 3.6, 2.6, 0.3);
  ctx.fillStyle = PATCH;
  ctx.fill();
  leg(ctx, -4, -7 + bob, step, 2.3, FUR[1], FUR[2], 2.2);
  leg(ctx, 7.4, -7 + bob, step + Math.PI, 2.3, FUR[1], FUR[2], 2.2);
  // Big square head.
  const hx = 10.4;
  const hy = -15 + bob;
  roundRect(ctx, hx - 6, hy - 5.6, 11.6, 10.4, 4.2);
  fillStroke(ctx, FUR[1], OUTLINE, LINE);
  ellipse(ctx, hx - 3, hy - 2, 3.6, 3);
  ctx.fillStyle = "rgba(255, 240, 220, 0.25)";
  ctx.fill();
  // Jowls and a jutting underbite with two fangs.
  roundRect(ctx, hx + 0.6, hy + 0.4, 6.4, 4.8, 2.2);
  fillStroke(ctx, FUR[2], OUTLINE, LINE);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.4;
  for (const x of [hx + 2.4, hx + 5.2]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.7, hy + 1.4);
    ctx.lineTo(x, hy - 0.6);
    ctx.lineTo(x + 0.7, hy + 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ellipse(ctx, hx + 5.6, hy - 1.8, 1.6, 1.2);
  ctx.fillStyle = "#1a1014";
  ctx.fill();
  // Floppy ear with a stitched patch.
  ctx.beginPath();
  ctx.moveTo(hx - 5.4, hy - 4.4);
  ctx.quadraticCurveTo(hx - 9, hy - 3, hx - 7.4, hy + 2);
  ctx.quadraticCurveTo(hx - 5, hy + 0.4, hx - 3.4, hy - 4.6);
  ctx.closePath();
  fillStroke(ctx, PATCH, OUTLINE, LINE);
  ctx.strokeStyle = "#d8c8a8";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(hx - 7.2, hy - 1.4);
  ctx.lineTo(hx - 5.6, hy - 0.6);
  ctx.moveTo(hx - 6.8, hy - 2.4);
  ctx.lineTo(hx - 6.2, hy - 0.2);
  ctx.stroke();
  eye(ctx, hx + 0.4, hy - 2.4, 1.5);
  eye(ctx, hx + 3.6, hy - 2.2, 1.3);
  // Studded collar.
  ctx.save();
  ctx.translate(hx - 5.4, hy + 3);
  ctx.rotate(-0.25);
  roundRect(ctx, -1.6, -4, 3.4, 9, 1.4);
  fillStroke(ctx, COLLAR, OUTLINE, LINE * 0.8);
  for (let i = 0; i < 3; i++) {
    ellipse(ctx, 0.1, -2.4 + i * 2.8, 0.8, 0.8);
    fillStroke(ctx, "#e4e8ee", OUTLINE, 0.4);
  }
  ctx.restore();
  ctx.restore();
}
