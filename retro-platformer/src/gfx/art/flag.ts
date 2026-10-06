import { OUTLINE, ellipse, fillStroke, linear, radial, type Ctx } from "../paint";

/** Pole is 4 units wide, centred on x = 16 of its 32-unit column. */
export const POLE_CENTER = 16;

/** A vertical run of polished pole from y0 to y1, centred on x = POLE_CENTER. */
export function drawPole(ctx: Ctx, y0: number, y1: number): void {
  ctx.fillStyle = linear(ctx, POLE_CENTER - 2, 0, POLE_CENTER + 2, 0, [
    [0, "#5a6478"],
    [0.3, "#ffffff"],
    [0.55, "#b8c2d8"],
    [1, "#3a4252"],
  ]);
  ctx.fillRect(POLE_CENTER - 2, y0, 4, y1 - y0);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(POLE_CENTER - 2, y0, 4, y1 - y0);
}

/** The golden ball on top of the pole, its centre at (POLE_CENTER, y). */
export function drawFinial(ctx: Ctx, y: number): void {
  ellipse(ctx, POLE_CENTER, y, 5.5, 5.5);
  fillStroke(ctx, radial(ctx, POLE_CENTER, y, 5.5, [
    [0, "#fff6c0"],
    [0.5, "#ffc830"],
    [1, "#a86200"],
  ], POLE_CENTER - 1.8, y - 2), OUTLINE, 1);
  ellipse(ctx, POLE_CENTER - 1.6, y - 2, 1.5, 1, -0.5);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
}

/**
 * The pennant hanging left of the pole, its top edge at y. `time` (frames)
 * ripples the cloth.
 */
export function drawPennant(ctx: Ctx, y: number, time: number): void {
  const x0 = POLE_CENTER - 2;
  const len = 28;
  const h = 22;
  const wave = (t: number): number => Math.sin(time * 0.15 - t * 4) * 1.6 * t;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(x0 - len * t, y + (h / 2) * t + wave(t));
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    ctx.lineTo(x0 - len * t, y + h - (h / 2) * t + wave(t));
  }
  ctx.closePath();
  fillStroke(ctx, linear(ctx, x0, y, x0 - len, y + h, [
    [0, "#3d9a48"],
    [0.5, "#6fcf5a"],
    [1, "#2a7a34"],
  ]), OUTLINE, 1.1);
  // A white leaf emblem.
  ctx.save();
  ctx.translate(x0 - 8, y + h / 2 + wave(0.3));
  ctx.beginPath();
  ctx.moveTo(-3.5, 0);
  ctx.bezierCurveTo(-2, -4, 2.5, -4, 4, 0);
  ctx.bezierCurveTo(2.5, 4, -2, 4, -3.5, 0);
  ctx.fillStyle = "#f6fff0";
  ctx.fill();
  ctx.strokeStyle = "#3d9a48";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(3.5, 0);
  ctx.stroke();
  ctx.restore();
}
