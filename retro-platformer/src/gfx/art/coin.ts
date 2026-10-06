import { OUTLINE, ellipse, fillStroke, linear, type Ctx } from "../paint";

/**
 * A spinning gold coin centred at (0, 0), 9 units in radius. `spin` in [0, 1)
 * is one full turn: the face narrows to its edge and widens again.
 */
export function drawCoin(ctx: Ctx, spin: number): void {
  const turn = Math.cos(spin * Math.PI * 2);
  const w = Math.max(0.12, Math.abs(turn));
  const r = 9;
  ctx.save();
  ctx.lineJoin = "round";
  // Edge thickness shows as the coin turns.
  const edge = (1 - w) * 2.4;
  ellipse(ctx, edge * 0.5, 0, r * w + edge * 0.5, r);
  fillStroke(ctx, "#b06a00", OUTLINE, 1);
  ellipse(ctx, 0, 0, r * w, r);
  fillStroke(ctx, linear(ctx, -r * w, -r, r * w, r, [
    [0, "#fff6b0"],
    [0.35, "#ffd23a"],
    [0.7, "#e8a010"],
    [1, "#a86200"],
  ]), OUTLINE, 1);
  if (w > 0.35) {
    // Raised rim and an embossed leaf.
    ellipse(ctx, 0, 0, r * w * 0.74, r * 0.74);
    ctx.strokeStyle = "rgba(150, 80, 0, 0.6)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.save();
    ctx.scale(w * Math.sign(turn || 1), 1);
    ctx.beginPath();
    ctx.moveTo(0, -4.6);
    ctx.bezierCurveTo(3.4, -2.6, 3.2, 2.6, 0, 4.6);
    ctx.bezierCurveTo(-3.2, 2.6, -3.4, -2.6, 0, -4.6);
    ctx.fillStyle = "rgba(180, 100, 0, 0.55)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 245, 190, 0.8)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -3.6);
    ctx.lineTo(0, 3.8);
    ctx.stroke();
    ctx.restore();
  }
  // Glint.
  ellipse(ctx, -r * w * 0.35, -r * 0.45, Math.max(0.3, r * w * 0.18), r * 0.22, -0.4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fill();
  ctx.restore();
}
