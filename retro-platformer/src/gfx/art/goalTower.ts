import { OUTLINE, ellipse, fillStroke, linear, radial, rgba, roundRect, seededRandom, type Ctx } from "../paint";

/** The goal: a round stone garden tower. 128 × 192 units, origin top-left. */
export const TOWER_WIDTH = 128;
export const TOWER_HEIGHT = 192;

export function drawGoalTower(ctx: Ctx): void {
  const rnd = seededRandom(5);
  const wallTop = 74;
  const left = 16;
  const right = 112;
  ctx.save();
  ctx.lineJoin = "round";
  // Cylindrical stone wall.
  roundRect(ctx, left, wallTop, right - left, TOWER_HEIGHT - wallTop, 2);
  ctx.fillStyle = linear(ctx, left, 0, right, 0, [
    [0, "#4a5266"],
    [0.18, "#8e98b0"],
    [0.42, "#d6deee"],
    [0.6, "#a8b2c8"],
    [0.85, "#6a7288"],
    [1, "#3a4052"],
  ]);
  ctx.fill();
  // Masonry courses, staggered.
  ctx.strokeStyle = rgba(OUTLINE, 0.35);
  ctx.lineWidth = 0.8;
  for (let y = wallTop + 10, row = 0; y < TOWER_HEIGHT; y += 10, row++) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    for (let x = left + (row % 2 ? 10 : 0); x < right; x += 20) {
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rgba(rnd() < 0.5 ? "#ffffff" : OUTLINE, 0.15);
    ctx.fillRect(left + 2 + rnd() * 92, wallTop + 2 + rnd() * 112, 1.2, 1);
  }
  roundRect(ctx, left, wallTop, right - left, TOWER_HEIGHT - wallTop, 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Ivy climbing the left side.
  for (let i = 0; i < 34; i++) {
    const y = TOWER_HEIGHT - 4 - i * 3.4;
    const x = left + 5 + Math.sin(i * 0.7) * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(3, 0, 0, 3);
    ctx.quadraticCurveTo(-3, 0, 0, -3);
    ctx.fillStyle = rnd() < 0.5 ? "#3d9a48" : "#6fcf5a";
    ctx.fill();
    ctx.restore();
  }
  // Conical tiled roof.
  ctx.beginPath();
  ctx.moveTo(4, wallTop + 3);
  ctx.quadraticCurveTo(40, wallTop - 20, 64, 8);
  ctx.quadraticCurveTo(88, wallTop - 20, 124, wallTop + 3);
  ctx.quadraticCurveTo(64, wallTop + 10, 4, wallTop + 3);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 4, 0, 124, 0, [
    [0, "#8a1c28"],
    [0.3, "#e0503c"],
    [0.45, "#ff8a64"],
    [0.65, "#c2342e"],
    [1, "#5a1018"],
  ]), OUTLINE, 1.4);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba("#3a0a10", 0.4);
  ctx.lineWidth = 0.9;
  for (let y = 18; y < wallTop + 6; y += 7) {
    ctx.beginPath();
    for (let x = 0; x <= 128; x += 6) ctx.arc(x + ((y / 7) % 2) * 3, y, 3, 0, Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  // Gold finial.
  ellipse(ctx, 64, 6, 5, 5);
  fillStroke(ctx, radial(ctx, 64, 6, 5, [
    [0, "#fff6c0"],
    [1, "#c88a00"],
  ], 62.5, 4.5), OUTLINE, 1);
  // Round window glowing warm.
  ctx.fillStyle = radial(ctx, 64, 100, 24, [
    [0, "rgba(255, 220, 120, 0.55)"],
    [1, "rgba(255, 220, 120, 0)"],
  ]);
  ctx.fillRect(40, 76, 48, 48);
  ellipse(ctx, 64, 100, 11, 11);
  fillStroke(ctx, radial(ctx, 64, 100, 11, [
    [0, "#fffbe0"],
    [0.6, "#ffd060"],
    [1, "#e08a20"],
  ]), OUTLINE, 1.6);
  ctx.strokeStyle = "#4a2a14";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(64, 89);
  ctx.lineTo(64, 111);
  ctx.moveTo(53, 100);
  ctx.lineTo(75, 100);
  ctx.stroke();
  // Arched wooden door.
  ctx.beginPath();
  ctx.moveTo(46, TOWER_HEIGHT);
  ctx.lineTo(46, 150);
  ctx.arc(64, 150, 18, Math.PI, 0);
  ctx.lineTo(82, TOWER_HEIGHT);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 46, 0, 82, 0, [
    [0, "#4a2612"],
    [0.4, "#8a5230"],
    [1, "#3a1c0c"],
  ]), OUTLINE, 1.6);
  ctx.strokeStyle = rgba("#24120a", 0.6);
  ctx.lineWidth = 0.9;
  for (const x of [55, 64, 73]) {
    ctx.beginPath();
    ctx.moveTo(x, 135);
    ctx.lineTo(x, TOWER_HEIGHT);
    ctx.stroke();
  }
  ellipse(ctx, 76, 168, 1.6, 1.6);
  fillStroke(ctx, "#ffd24a", OUTLINE, 0.6);
  ctx.restore();
}
