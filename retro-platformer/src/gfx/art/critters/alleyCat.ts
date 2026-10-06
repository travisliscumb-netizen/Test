import { OUTLINE, ellipse, fillStroke, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, pancake, tail, type Tone } from "./parts";

/** Alley cat: a scrappy ginger tabby with a notched ear, a raised striped tail and a mean squint. */
const FUR: Tone = ["#8a3e10", "#d8782a", "#ffc07a"];
const STRIPE = "#8a3a0e";
const MUZZLE = "#fff1dc";

export function drawAlleyCat(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    pancake(ctx, 28, 6.5, FUR, () => {
      for (const x of [-8, -3, 2]) {
        ctx.strokeStyle = STRIPE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, -6);
        ctx.lineTo(x + 1, -3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(7, -5.5);
      ctx.lineTo(9, -9);
      ctx.lineTo(11, -5.5);
      fillStroke(ctx, FUR[1], OUTLINE, LINE);
    });
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.8;
  const flick = Math.sin(step * 0.6) * 1.6;
  // Tail held high with a crooked tip.
  tail(ctx, -9, -11 + bob, -17, -14, -14 + flick, -25, 1.8, 1.3, FUR[1]);
  ctx.strokeStyle = STRIPE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of [0.4, 0.62, 0.84]) {
    const u = 1 - t;
    const x = u * u * -9 + 2 * u * t * -17 + t * t * (-14 + flick);
    const y = u * u * (-11 + bob) + 2 * u * t * -14 + t * t * -25;
    ctx.moveTo(x - 1.6, y);
    ctx.lineTo(x + 1.6, y + 0.4);
  }
  ctx.stroke();
  leg(ctx, -6, -8 + bob, step + Math.PI, 1.6, FUR[0], FUR[0], 2.6);
  leg(ctx, 5, -8 + bob, step, 1.6, FUR[0], FUR[0], 2.6);
  // Lean body, a little arched.
  blob(ctx, -1, -11.5 + bob, 10, 5.6, FUR, -0.05);
  ctx.strokeStyle = STRIPE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const x of [-7, -3, 1]) {
    ctx.moveTo(x, -16.4 + bob);
    ctx.quadraticCurveTo(x + 1.4, -13 + bob, x + 0.6, -10 + bob);
  }
  ctx.stroke();
  leg(ctx, -4, -8 + bob, step, 1.8, FUR[1], MUZZLE, 2.6);
  leg(ctx, 7, -8 + bob, step + Math.PI, 1.8, FUR[1], MUZZLE, 2.6);
  // Head.
  const hx = 10;
  const hy = -16 + bob;
  for (const [ex, notch] of [
    [hx - 3.2, false],
    [hx + 2.6, true],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(ex - 2.4, hy - 3);
    ctx.lineTo(ex, hy - 9.2);
    if (notch) {
      // The torn ear: a bite out of its tip.
      ctx.lineTo(ex + 0.9, hy - 7.2);
      ctx.lineTo(ex + 1.7, hy - 7.6);
    }
    ctx.lineTo(ex + 2.6, hy - 3);
    ctx.closePath();
    fillStroke(ctx, FUR[1], OUTLINE, LINE);
    ctx.beginPath();
    ctx.moveTo(ex - 1.1, hy - 3.6);
    ctx.lineTo(ex, hy - 7);
    ctx.lineTo(ex + 1.2, hy - 3.6);
    ctx.fillStyle = "#e88a8a";
    ctx.fill();
  }
  blob(ctx, hx, hy, 6.2, 5.4, FUR);
  ellipse(ctx, hx + 3.4, hy + 2.2, 3.2, 2.2);
  fillStroke(ctx, MUZZLE, OUTLINE, 0.7);
  // A scar across the brow.
  ctx.strokeStyle = "#7a2a10";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(hx - 1.4, hy - 4.2);
  ctx.lineTo(hx + 0.8, hy - 1.2);
  ctx.stroke();
  eye(ctx, hx + 0.6, hy - 0.8, 1.6, { iris: "#3a8a20", lid: 0.35 });
  eye(ctx, hx + 4.4, hy - 0.6, 1.4, { iris: "#3a8a20", lid: 0.35 });
  ellipse(ctx, hx + 6, hy + 1.4, 1, 0.75);
  ctx.fillStyle = "#c04a5a";
  ctx.fill();
  // A sneer showing one fang.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(hx + 3, hy + 3.4);
  ctx.quadraticCurveTo(hx + 4.6, hy + 2.6, hx + 6.2, hy + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 4.6, hy + 3.1);
  ctx.lineTo(hx + 5, hy + 4.5);
  ctx.lineTo(hx + 5.4, hy + 3);
  fillStroke(ctx, "#ffffff", OUTLINE, 0.4);
  // Whiskers.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (const dy of [-0.6, 0.8]) {
    ctx.moveTo(hx + 5.5, hy + 2);
    ctx.lineTo(hx + 9.4, hy + 1.4 + dy * 1.4);
  }
  ctx.stroke();
  ctx.restore();
}
