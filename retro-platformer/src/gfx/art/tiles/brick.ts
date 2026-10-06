import { OUTLINE, linear, rgba, roundRect, seededRandom, type Ctx } from "../../paint";
import type { Material } from "../materials";

/** Breakable brick: four courses of bevelled bricks in running bond. */
export function drawBrick(ctx: Ctx, m: Material): void {
  const rnd = seededRandom(77);
  const [dark, mid, light] = m.brick;
  ctx.fillStyle = m.mortar;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = rgba(OUTLINE, 0.35);
  ctx.fillRect(0, 0, 32, 32);
  for (let course = 0; course < 4; course++) {
    const y = course * 8 + 0.6;
    const offset = course % 2 === 0 ? 0 : -8;
    for (let x = offset; x < 32; x += 16) {
      const tint = (rnd() - 0.5) * 0.12;
      roundRect(ctx, x + 0.6, y, 14.8, 6.8, 1.2);
      ctx.fillStyle = linear(ctx, 0, y, 0, y + 6.8, [
        [0, light],
        [0.3, mid],
        [1, dark],
      ]);
      ctx.fill();
      ctx.fillStyle = rgba(tint > 0 ? "#ffffff" : "#000000", Math.abs(tint));
      ctx.fill();
      // Lit top edge and a little wear.
      ctx.fillStyle = rgba("#ffffff", 0.28);
      ctx.fillRect(x + 1.6, y + 0.5, 12.8, 0.8);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = rgba(dark, 0.55);
        ctx.fillRect(x + 2 + rnd() * 11, y + 2 + rnd() * 3.5, 0.9, 0.9);
      }
    }
  }
}

/** A tumbling brick fragment, centred on the origin. */
export function drawBrickChunk(ctx: Ctx, m: Material): void {
  ctx.beginPath();
  ctx.moveTo(-4.5, -3);
  ctx.lineTo(3.8, -4);
  ctx.lineTo(5, 2.5);
  ctx.lineTo(-1, 4.2);
  ctx.lineTo(-5, 1.5);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, -4, 0, 4, [
    [0, m.brick[2]],
    [1, m.brick[0]],
  ]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
