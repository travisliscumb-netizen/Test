import { OUTLINE, linear, radial, rgba, roundRect, type Ctx } from "../../paint";

/** Frames of the mystery block's pulsing glow. */
export const MYSTERY_FRAMES = 8;

function bevelBlock(ctx: Ctx, light: string, mid: string, dark: string): void {
  roundRect(ctx, 0.5, 0.5, 31, 31, 3);
  ctx.fillStyle = linear(ctx, 0, 0, 32, 32, [
    [0, light],
    [0.45, mid],
    [1, dark],
  ]);
  ctx.fill();
  roundRect(ctx, 3.5, 3.5, 25, 25, 2);
  ctx.fillStyle = linear(ctx, 0, 3, 0, 29, [
    [0, mid],
    [1, dark],
  ]);
  ctx.fill();
  ctx.strokeStyle = rgba("#ffffff", 0.45);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(2, 29);
  ctx.lineTo(2, 3);
  ctx.quadraticCurveTo(2, 2, 3, 2);
  ctx.lineTo(29, 2);
  ctx.stroke();
  // Rivets.
  for (const [x, y] of [
    [6, 6],
    [26, 6],
    [6, 26],
    [26, 26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, x - 0.4, y - 0.4, 1.6, [
      [0, "#ffffff"],
      [1, dark],
    ]);
    ctx.fill();
  }
  roundRect(ctx, 0.5, 0.5, 31, 31, 3);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/** Golden mystery block; `frame` (0..MYSTERY_FRAMES-1) pulses the sparkle emblem. */
export function drawMystery(ctx: Ctx, frame: number): void {
  bevelBlock(ctx, "#fff1a0", "#f0b418", "#9a5a00");
  const pulse = 0.5 + 0.5 * Math.sin((frame / MYSTERY_FRAMES) * Math.PI * 2);
  // Glow behind the emblem.
  ctx.fillStyle = radial(ctx, 16, 16, 11, [
    [0, rgba("#fffbe0", 0.35 + pulse * 0.45)],
    [1, rgba("#fffbe0", 0)],
  ]);
  ctx.fillRect(4, 4, 24, 24);
  // Four-pointed sparkle.
  const star = (r: number, w: number): void => {
    ctx.beginPath();
    ctx.moveTo(16, 16 - r);
    ctx.quadraticCurveTo(16 + w, 16 - w, 16 + r, 16);
    ctx.quadraticCurveTo(16 + w, 16 + w, 16, 16 + r);
    ctx.quadraticCurveTo(16 - w, 16 + w, 16 - r, 16);
    ctx.quadraticCurveTo(16 - w, 16 - w, 16, 16 - r);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(0.8, 0.9);
  star(9, 1.6);
  ctx.fillStyle = rgba("#7a4200", 0.55);
  ctx.fill();
  ctx.restore();
  star(9 + pulse * 0.8, 1.6);
  ctx.fillStyle = radial(ctx, 16, 16, 9, [
    [0, "#ffffff"],
    [0.6, "#fff6c0"],
    [1, "#ffd24a"],
  ]);
  ctx.fill();
  ctx.strokeStyle = rgba("#9a5a00", 0.8);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

/** A spent block: dull bronze with the emblem worn away. */
export function drawUsedBlock(ctx: Ctx): void {
  bevelBlock(ctx, "#c49a6a", "#8a6440", "#4a3020");
}
