import { OUTLINE, ellipse, fillStroke, linear, radial, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, leg, peekingEyes, tail, type Tone } from "./parts";
import type { ShellState } from "./types";

/**
 * Trash-can raccoon: a masked bandit with a ringed tail. Stomped, it dives into
 * a dented tin can, seen end-on, that rolls when kicked.
 */
const FUR: Tone = ["#3e4048", "#7c808c", "#c4c8d2"];
const MASK = "#1c1c24";
const CAN: Tone = ["#5a6270", "#a4acb8", "#eef2f6"];

function can(ctx: Ctx, spin: number, peek: boolean): void {
  const cy = -11.2;
  const r = 11;
  ellipse(ctx, 0, cy, r, r);
  fillStroke(ctx, radial(ctx, 0, cy, r, [
    [0, CAN[2]],
    [0.6, CAN[1]],
    [1, CAN[0]],
  ], -3.5, cy - 4), OUTLINE, LINE);
  // Rolled rim and the dark open end.
  ellipse(ctx, 0, cy, r * 0.8, r * 0.8);
  ctx.strokeStyle = CAN[0];
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ellipse(ctx, 0, cy, r * 0.62, r * 0.62);
  fillStroke(ctx, radial(ctx, 0, cy, r * 0.62, [
    [0, "#08060c"],
    [1, "#2a2a34"],
  ]), OUTLINE, 0.7);
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(spin);
  // A dent and rivets on the rim turn as it rolls.
  ellipse(ctx, r * 0.72, 0, 1.6, 2.4);
  ctx.fillStyle = "rgba(60, 66, 80, 0.55)";
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.8;
    ellipse(ctx, Math.cos(a) * r * 0.71, Math.sin(a) * r * 0.71, 0.7, 0.7);
    ctx.fillStyle = CAN[0];
    ctx.fill();
  }
  if (!peek) {
    // The ringed tail tip curled inside.
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0.4, 3.6);
    ctx.strokeStyle = FUR[1];
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 1.6, 2.2);
    ctx.strokeStyle = MASK;
    ctx.stroke();
  }
  ctx.restore();
  // Gloss that doesn't spin.
  ellipse(ctx, -5, cy - 6.4, 3.2, 1.4, -0.6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fill();
  if (peek) {
    ellipse(ctx, 0, cy, 4.2, 2.4);
    ctx.fillStyle = MASK;
    ctx.fill();
    peekingEyes(ctx, 0, cy, 3.6, "#fff2b0");
  }
}

export function drawRaccoon(ctx: Ctx, state: ShellState, step: number, spin: number): void {
  begin(ctx);
  if (state !== "walk") {
    can(ctx, spin, state === "peek");
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step)) * 0.9;
  const sway = Math.sin(step * 0.5) * 1.4;
  // Ringed tail.
  tail(ctx, -8, -12 + bob, -17, -12, -18 + sway, -22, 3, 2.4, FUR[1]);
  ctx.strokeStyle = MASK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const t of [0.35, 0.6, 0.85]) {
    const u = 1 - t;
    const x = u * u * -8 + 2 * u * t * -17 + t * t * (-18 + sway);
    const y = u * u * (-12 + bob) + 2 * u * t * -12 + t * t * -22;
    ctx.moveTo(x - 2.6, y + 0.6);
    ctx.lineTo(x + 2.6, y - 0.6);
  }
  ctx.stroke();
  leg(ctx, -5, -9 + bob, step + Math.PI, 1.8, MASK, MASK, 2.4);
  leg(ctx, 5, -9 + bob, step, 1.8, MASK, MASK, 2.4);
  blob(ctx, -1, -13 + bob, 10, 7.4, FUR);
  leg(ctx, -3, -8 + bob, step, 2, "#2a2a32", "#4a4a54", 2.4);
  leg(ctx, 7, -8 + bob, step + Math.PI, 2, "#2a2a32", "#4a4a54", 2.4);
  // Head: white cheeks, the black bandit mask and round ears.
  const hx = 10;
  const hy = -18 + bob;
  for (const x of [hx - 3.6, hx + 1.6]) {
    ellipse(ctx, x, hy - 5, 2.2, 2.4);
    fillStroke(ctx, FUR[1], OUTLINE, LINE);
    ellipse(ctx, x, hy - 4.8, 1.1, 1.3);
    ctx.fillStyle = MASK;
    ctx.fill();
  }
  blob(ctx, hx, hy, 6.4, 5.4, FUR);
  ellipse(ctx, hx + 1.4, hy + 1.6, 5.4, 3.2);
  ctx.fillStyle = "#f2f2f4";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 4.8, hy - 1.4);
  ctx.quadraticCurveTo(hx + 2, hy - 4.8, hx + 6.6, hy - 1.4);
  ctx.quadraticCurveTo(hx + 4.6, hy + 1.8, hx + 2.2, hy + 0.2);
  ctx.quadraticCurveTo(hx - 1, hy + 2.2, hx - 4.8, hy - 1.4);
  ctx.closePath();
  ctx.fillStyle = MASK;
  ctx.fill();
  ellipse(ctx, hx + 7.4, hy + 0.8, 1.2, 1);
  ctx.fillStyle = MASK;
  ctx.fill();
  eye(ctx, hx - 0.2, hy - 1, 1.4, { iris: "#e8a020", angry: false, lid: 0.3 });
  eye(ctx, hx + 3.6, hy - 0.8, 1.2, { iris: "#e8a020", angry: false, lid: 0.3 });
  // A sly grin.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(hx + 3, hy + 3);
  ctx.quadraticCurveTo(hx + 5, hy + 3.8, hx + 6.8, hy + 2.2);
  ctx.stroke();
  // A stolen bottle cap stuck in the fur.
  ellipse(ctx, -4, -16.6 + bob, 1.6, 1.6);
  fillStroke(ctx, linear(ctx, -5, -18, -3, -15, [
    [0, "#ff6a5a"],
    [1, "#a81a1a"],
  ]), OUTLINE, 0.5);
  ctx.restore();
}
