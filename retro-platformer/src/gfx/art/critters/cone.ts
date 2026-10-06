import { OUTLINE, ellipse, fillStroke, linear, roundRect, type Ctx } from "../../paint";
import { LINE, begin, eye, xEye } from "./parts";

/** Cone creature: a traffic cone come to life, waddling on stubby legs with a jagged grin. */
const ORANGE = ["#a83a06", "#ff6a1a", "#ffb070"] as const;
const BAND = "#f4f4f0";
const BASE = "#2a2a30";

function cone(ctx: Ctx, top: number, base: number, halfBase: number, halfTop: number): void {
  ctx.beginPath();
  ctx.moveTo(-halfBase, base);
  ctx.lineTo(-halfTop, top);
  ctx.quadraticCurveTo(0, top - 1.6, halfTop, top);
  ctx.lineTo(halfBase, base);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, -halfBase, 0, halfBase, 0, [
    [0, ORANGE[0]],
    [0.6, ORANGE[1]],
    [0.82, ORANGE[2]],
    [1, ORANGE[1]],
  ]), OUTLINE, LINE);
}

/** A reflective band across the cone between two heights (as fractions down the cone). */
function band(ctx: Ctx, top: number, base: number, halfBase: number, halfTop: number, t0: number, t1: number): void {
  const at = (t: number): [number, number] => [top + (base - top) * t, halfTop + (halfBase - halfTop) * t];
  const [y0, w0] = at(t0);
  const [y1, w1] = at(t1);
  ctx.beginPath();
  ctx.moveTo(-w0, y0);
  ctx.lineTo(w0, y0);
  ctx.lineTo(w1, y1);
  ctx.lineTo(-w1, y1);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -w1, 0, w1, 0, [
    [0, "#b8b8c0"],
    [0.75, BAND],
    [1, "#d8d8de"],
  ]);
  ctx.fill();
}

export function drawCone(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    roundRect(ctx, -14, -3, 28, 3, 1);
    fillStroke(ctx, BASE, OUTLINE, LINE);
    cone(ctx, -8, -3, 11, 6);
    band(ctx, -8, -3, 11, 6, 0.3, 0.6);
    xEye(ctx, -2, -5.6, 1.2);
    xEye(ctx, 3.4, -5.6, 1.2);
    ctx.restore();
    return;
  }
  // Two stubby feet stepping under the base.
  for (const [x, phase] of [
    [-4.5, step],
    [4.5, step + Math.PI],
  ] as const) {
    const lift = Math.max(0, Math.cos(phase)) * 1.4;
    const fx = x + Math.sin(phase) * 1.6;
    roundRect(ctx, fx - 2.6, -2.6 - lift, 5.6, 2.6, 1.2);
    fillStroke(ctx, BASE, OUTLINE, LINE * 0.8);
  }
  const wobble = Math.sin(step) * 0.07;
  const bob = -Math.abs(Math.sin(step)) * 1;
  ctx.translate(0, -2.4 + bob);
  ctx.rotate(wobble);
  // The square rubber base.
  roundRect(ctx, -12.5, -3, 25, 3, 1);
  fillStroke(ctx, linear(ctx, 0, -3, 0, 0, [
    [0, "#4a4a54"],
    [1, BASE],
  ]), OUTLINE, LINE);
  const top = -24;
  const base = -3;
  cone(ctx, top, base, 9.6, 2.6);
  band(ctx, top, base, 9.6, 2.6, 0.18, 0.34);
  band(ctx, top, base, 9.6, 2.6, 0.72, 0.86);
  // Face between the bands, shifted toward the front.
  eye(ctx, 0.4, -12.6, 1.7);
  eye(ctx, 4.2, -12.4, 1.5);
  // A jagged grin.
  ctx.beginPath();
  ctx.moveTo(-0.6, -8.8);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-0.6 + i * 1.05, -8.8 + (i % 2 ? 1 : 0) + (i === 3 ? 0.4 : 0));
  ctx.lineTo(5.4, -7);
  ctx.quadraticCurveTo(2.4, -5.6, -0.6, -7.4);
  ctx.closePath();
  fillStroke(ctx, "#3a0e14", OUTLINE, 0.6);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-0.2 + i * 2, -8.6);
    ctx.lineTo(0.5 + i * 2, -7.6);
    ctx.lineTo(1.2 + i * 2, -8.6);
    ctx.fill();
  }
  // Scuffs.
  ellipse(ctx, -5, -6, 1.2, 0.6, 0.4);
  ctx.fillStyle = "rgba(60, 20, 0, 0.35)";
  ctx.fill();
  ctx.restore();
}
