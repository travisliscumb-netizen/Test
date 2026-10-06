import { OUTLINE, ellipse, fillStroke, radial, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, tail, xEye, type Tone } from "./parts";
import type { ShellState } from "./types";

/**
 * Possum: a pale, toothy park possum. Stomped, it curls into a ball and plays
 * dead, tail wrapped round, and rolls when kicked.
 */
const FUR: Tone = ["#6a6670", "#aaa6b0", "#e4e0e6"];
const FACE = "#f6f2f2";
const PINK = "#f2a2ae";
const EAR = "#2a2830";

function ball(ctx: Ctx, spin: number, peek: boolean): void {
  const cy = -11.2;
  const r = 11;
  ellipse(ctx, 0, cy, r, r);
  fillStroke(ctx, radial(ctx, 0, cy, r, [
    [0, FUR[2]],
    [0.55, FUR[1]],
    [1, FUR[0]],
  ], -3, cy - 4), OUTLINE, LINE);
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(spin);
  // Fur tufts round the edge.
  ctx.strokeStyle = FUR[0];
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    ctx.lineTo(Math.cos(a + 0.12) * r * 0.92, Math.sin(a + 0.12) * r * 0.92);
  }
  ctx.stroke();
  // The bare pink tail wrapped round the ball.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, -0.4, 2.4);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // Tucked face, playing dead (or one eye open when about to wake).
  ellipse(ctx, r * 0.15, -r * 0.05, 4.4, 3.6);
  fillStroke(ctx, FACE, OUTLINE, 0.7);
  ellipse(ctx, r * 0.15 + 4, -r * 0.05 + 0.4, 1, 0.8);
  ctx.fillStyle = PINK;
  ctx.fill();
  if (peek) {
    ellipse(ctx, r * 0.15 - 1.4, -r * 0.05 - 0.6, 1.3, 1.4);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ellipse(ctx, r * 0.15 - 1, -r * 0.05 - 1, 0.4, 0.4);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ellipse(ctx, r * 0.15 + 1.6, -r * 0.05 - 0.6, 1.1, 1.2);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  } else {
    xEye(ctx, r * 0.15 - 1.4, -r * 0.05 - 0.6, 0.9);
    xEye(ctx, r * 0.15 + 1.6, -r * 0.05 - 0.6, 0.8);
    // Tongue out: the classic act.
    ellipse(ctx, r * 0.15 + 2.4, -r * 0.05 + 2.6, 0.8, 1.2);
    fillStroke(ctx, "#e8607a", OUTLINE, 0.4);
  }
  ctx.restore();
  ellipse(ctx, -4.6, cy - 6, 3, 1.4, -0.6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fill();
}

export function drawPossum(ctx: Ctx, state: ShellState, step: number, spin: number): void {
  begin(ctx);
  if (state !== "walk") {
    ball(ctx, spin, state === "peek");
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.8;
  const sway = Math.sin(step * 0.5) * 1.6;
  tail(ctx, -9, -9 + bob, -17, -5, -19 + sway, -15, 1.8, 0.6, PINK);
  leg(ctx, -5, -8 + bob, step + Math.PI, 1.7, FUR[0], PINK, 2.4);
  leg(ctx, 5, -8 + bob, step, 1.7, FUR[0], PINK, 2.4);
  // Shaggy body with a darker underside.
  blob(ctx, -1, -12 + bob, 10, 7.4, FUR);
  ctx.strokeStyle = "rgba(60, 56, 70, 0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const x of [-7, -4, -1, 2]) {
    ctx.moveTo(x, -18.6 + bob);
    ctx.lineTo(x - 1, -16.8 + bob);
  }
  ctx.stroke();
  leg(ctx, -3, -7 + bob, step, 1.9, EAR, PINK, 2.4);
  leg(ctx, 7, -7 + bob, step + Math.PI, 1.9, EAR, PINK, 2.4);
  // Pointed white face with black ears and a pink nose.
  const hx = 10;
  const hy = -16 + bob;
  ellipse(ctx, hx - 2.6, hy - 5, 2.2, 2.4);
  fillStroke(ctx, EAR, OUTLINE, LINE);
  ctx.beginPath();
  ctx.moveTo(hx - 5, hy - 3);
  ctx.quadraticCurveTo(hx, hy - 6.4, hx + 3.6, hy - 2);
  ctx.lineTo(hx + 9.4, hy + 1.4);
  ctx.quadraticCurveTo(hx + 4, hy + 5, hx - 4, hy + 3);
  ctx.quadraticCurveTo(hx - 6.6, hy, hx - 5, hy - 3);
  ctx.closePath();
  fillStroke(ctx, FACE, OUTLINE, LINE);
  ellipse(ctx, hx + 9.4, hy + 1.2, 1.4, 1.1);
  fillStroke(ctx, PINK, OUTLINE, 0.6);
  eye(ctx, hx + 1, hy - 0.8, 1.5, { iris: "#140c14" });
  // A grin full of little teeth.
  ctx.beginPath();
  ctx.moveTo(hx + 2.6, hy + 2.6);
  ctx.quadraticCurveTo(hx + 5.6, hy + 4.4, hx + 8.4, hy + 2.4);
  ctx.quadraticCurveTo(hx + 5.6, hy + 3, hx + 2.6, hy + 2.6);
  fillStroke(ctx, "#5a1a24", OUTLINE, 0.5);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + 3.4 + i * 1.3, hy + 2.8);
    ctx.lineTo(hx + 3.9 + i * 1.3, hy + 3.7);
    ctx.lineTo(hx + 4.4 + i * 1.3, hy + 2.8);
    ctx.fill();
  }
  ctx.restore();
}
