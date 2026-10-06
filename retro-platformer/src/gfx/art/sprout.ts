import { OUTLINE, ellipse, fillStroke, linear, radial, type Ctx } from "../paint";

/** The grow power-up: a glowing seed with a fresh pair of leaves. Origin at its base. */
export function drawSprout(ctx: Ctx, time: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Warm glow.
  ctx.fillStyle = radial(ctx, 0, -11, 17, [
    [0, "rgba(255, 230, 120, 0.45)"],
    [1, "rgba(255, 230, 120, 0)"],
  ]);
  ctx.fillRect(-17, -28, 34, 34);
  // Seed body.
  ellipse(ctx, 0, -9, 10, 9);
  fillStroke(ctx, radial(ctx, -3, -12, 13, [
    [0, "#ffe28a"],
    [0.5, "#f0a030"],
    [1, "#a85a14"],
  ], -4, -13), OUTLINE, 1.1);
  ellipse(ctx, -3.5, -13.5, 3, 1.6, -0.5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fill();
  // Face.
  for (const ex of [-3, 3]) {
    ellipse(ctx, ex, -9, 1.2, 1.7);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ellipse(ctx, ex + 0.35, -9.6, 0.4, 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, -6.8, 1.6, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 110, 90, 0.5)";
  ellipse(ctx, -5.5, -6.6, 1.5, 0.9);
  ctx.fill();
  ellipse(ctx, 5.5, -6.6, 1.5, 0.9);
  ctx.fill();
  // Stem and two fluttering leaves.
  const flutter = Math.sin(time * 0.12) * 0.15;
  ctx.strokeStyle = "#2f7a3a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -17.5);
  ctx.quadraticCurveTo(0.8, -20.5, 0, -22.5);
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(0, -22);
    ctx.rotate(dir * (0.35 + flutter * dir));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(dir * 2, -4.5, dir * 8, -4.5, dir * 9.5, -1);
    ctx.bezierCurveTo(dir * 7, 1.5, dir * 2.5, 1.5, 0, 0);
    fillStroke(ctx, linear(ctx, 0, -4, 0, 1.5, [
      [0, "#a8ec74"],
      [1, "#3d9a48"],
    ]), OUTLINE, 0.9);
    ctx.restore();
  }
  ctx.restore();
}
