import { OUTLINE, linear, rgba, roundRect, type Ctx } from "../../paint";
import type { Material } from "../materials";

export type PipePiece = "topLeft" | "topRight" | "left" | "right";

const LIP = 13;
const INSET = 2.5;

/** One quarter of a 2-wide pipe: the full pipe is painted, and the cell clips it. */
export function drawPipe(ctx: Ctx, m: Material, piece: PipePiece): void {
  const [dark, mid, light] = m.pipe;
  const half = piece === "topLeft" || piece === "left" ? 0 : 1;
  const lip = piece === "topLeft" || piece === "topRight";
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 32, 32);
  ctx.clip();
  ctx.translate(-half * 32, 0);
  const cylinder = (x0: number, x1: number): CanvasGradient =>
    linear(ctx, x0, 0, x1, 0, [
      [0, dark],
      [0.12, mid],
      [0.28, light],
      [0.36, "#ffffff"],
      [0.42, light],
      [0.6, mid],
      [0.85, dark],
      [1, rgba(OUTLINE, 1)],
    ]);
  // Body.
  ctx.fillStyle = cylinder(INSET, 64 - INSET);
  ctx.fillRect(INSET, lip ? LIP - 1 : 0, 64 - INSET * 2, 33);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(INSET, lip ? LIP : 0);
  ctx.lineTo(INSET, 32);
  ctx.moveTo(64 - INSET, lip ? LIP : 0);
  ctx.lineTo(64 - INSET, 32);
  ctx.stroke();
  // Subtle horizontal rings.
  ctx.fillStyle = rgba(OUTLINE, 0.12);
  for (let y = lip ? LIP + 6 : 4; y < 32; y += 10) ctx.fillRect(INSET, y, 64 - INSET * 2, 1);
  if (lip) {
    ctx.fillStyle = linear(ctx, 0, LIP, 0, LIP + 4, [
      [0, rgba(OUTLINE, 0.55)],
      [1, rgba(OUTLINE, 0)],
    ]);
    ctx.fillRect(INSET, LIP, 64 - INSET * 2, 4);
    ctx.fillStyle = cylinder(0.5, 63.5);
    roundRect(ctx, 0.5, 0.5, 63, LIP, 2.5);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = rgba("#ffffff", 0.45);
    ctx.fillRect(3, 2, 58, 1);
  }
  ctx.restore();
}
