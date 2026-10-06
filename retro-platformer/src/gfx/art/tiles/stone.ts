import { OUTLINE, linear, rgba, seededRandom, type Ctx } from "../../paint";
import type { Material } from "../materials";

/** Unbreakable carved stone block used for stairs and walls. */
export function drawStone(ctx: Ctx, m: Material): void {
  const [dark, mid, light] = m.stone;
  const b = 4;
  // Bevel faces: lit top and left, shaded bottom and right.
  const face = (pts: number[], fill: string | CanvasGradient): void => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  face([0, 0, 32, 0, 32 - b, b, b, b], light);
  face([0, 0, b, b, b, 32 - b, 0, 32], linear(ctx, 0, 0, 0, 32, [
    [0, light],
    [1, mid],
  ]));
  face([32, 0, 32, 32, 32 - b, 32 - b, 32 - b, b], dark);
  face([0, 32, b, 32 - b, 32 - b, 32 - b, 32, 32], dark);
  ctx.fillStyle = linear(ctx, b, b, 32 - b, 32 - b, [
    [0, mid],
    [1, dark],
  ]);
  ctx.fillRect(b, b, 32 - b * 2, 32 - b * 2);
  // Chisel texture and a hairline crack.
  const rnd = seededRandom(31);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgba(rnd() < 0.5 ? dark : light, 0.5);
    ctx.fillRect(b + 1 + rnd() * 22, b + 1 + rnd() * 22, 1, 0.8);
  }
  ctx.strokeStyle = rgba(OUTLINE, 0.5);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(9, 7);
  ctx.lineTo(12, 12);
  ctx.lineTo(11, 16);
  ctx.lineTo(14, 19);
  ctx.stroke();
  ctx.strokeStyle = rgba("#ffffff", 0.25);
  ctx.beginPath();
  ctx.moveTo(10, 7);
  ctx.lineTo(13, 12);
  ctx.stroke();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 31, 31);
}
