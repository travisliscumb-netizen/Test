import { OUTLINE, ellipse, fillStroke, linear, radial, type Ctx } from "../paint";

/** Grub: a glossy purple beetle-grub. Facing right, origin at the feet. */
export const GRUB_COLORS = {
  shell: "#7b3fb0",
  shellDark: "#3a1a5e",
  shellLight: "#c79af0",
  belly: "#efd6a8",
  bellyDark: "#b8946a",
  leg: "#2a1640",
  eyeRed: "#e2463a",
} as const;

const C = GRUB_COLORS;
const LINE = 1.1;

export interface GrubPose {
  /** Walk cycle phase in radians. */
  step: number;
  state: "walk" | "squashed";
}

export function drawGrub(ctx: Ctx, pose: GrubPose): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (pose.state === "squashed") {
    drawSquashed(ctx);
    ctx.restore();
    return;
  }
  const bob = Math.abs(Math.sin(pose.step)) * -0.8;
  // Six little legs, alternating.
  ctx.strokeStyle = C.leg;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const lx = -7 + i * 6;
    const phase = pose.step + (i % 2) * Math.PI;
    const reach = Math.sin(phase) * 2.2;
    const lift = Math.max(0, Math.cos(phase)) * 1.2;
    ctx.beginPath();
    ctx.moveTo(lx, -4 + bob);
    ctx.quadraticCurveTo(lx + reach * 0.5 - 1, -2.5 - lift, lx + reach, -0.6 - lift);
    ctx.stroke();
  }
  // Pale belly.
  ellipse(ctx, 0.5, -5.2 + bob, 11.5, 4.2);
  fillStroke(ctx, linear(ctx, 0, -9, 0, -1, [
    [0, C.belly],
    [1, C.bellyDark],
  ]), OUTLINE, LINE);
  // Domed, segmented back.
  ctx.beginPath();
  ctx.moveTo(-12, -5 + bob);
  ctx.bezierCurveTo(-12, -19 + bob, 9, -21 + bob, 11, -7 + bob);
  ctx.quadraticCurveTo(0, -3.5 + bob, -12, -5 + bob);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, -2, -16 + bob, 14, [
    [0, C.shellLight],
    [0.45, C.shell],
    [1, C.shellDark],
  ], -4, -17 + bob), OUTLINE, LINE);
  ctx.strokeStyle = "rgba(40, 10, 70, 0.55)";
  ctx.lineWidth = 0.8;
  for (const sx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(sx - 1.5, -16.5 + bob + Math.abs(sx) * 0.15);
    ctx.quadraticCurveTo(sx + 0.8, -10 + bob, sx - 0.5, -5 + bob);
    ctx.stroke();
  }
  // Specular highlight.
  ellipse(ctx, -3.5, -15.5 + bob, 4, 1.6, -0.25);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fill();
  // Face at the front.
  ellipse(ctx, 9.5, -8 + bob, 5.6, 5);
  fillStroke(ctx, radial(ctx, 10.5, -9.5 + bob, 6, [
    [0, "#fff0d4"],
    [1, C.belly],
  ]), OUTLINE, LINE);
  // Angry eyes under a heavy brow.
  for (const [ex, s] of [
    [8.2, 0.8],
    [11.6, 1],
  ] as const) {
    ellipse(ctx, ex, -9 + bob, 1.3 * s, 1.7);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ellipse(ctx, ex + 0.35, -8.7 + bob, 0.8 * s, 1.1);
    ctx.fillStyle = C.eyeRed;
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(6.6, -11.6 + bob);
  ctx.lineTo(9.8, -10.4 + bob);
  ctx.moveTo(13.2, -11.6 + bob);
  ctx.lineTo(10.4, -10.4 + bob);
  ctx.stroke();
  // A pair of curved pincers.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  for (const dy of [-0.6, 1.2]) {
    ctx.beginPath();
    ctx.moveTo(12.2, -5.8 + dy + bob);
    ctx.quadraticCurveTo(15.2, -5.6 + dy + bob, 14.4, -3.6 + dy * 0.4 + bob);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSquashed(ctx: Ctx): void {
  ellipse(ctx, 0, -2.6, 13.5, 2.8);
  fillStroke(ctx, linear(ctx, 0, -5, 0, 0, [
    [0, C.shell],
    [1, C.shellDark],
  ]), OUTLINE, LINE);
  ellipse(ctx, -2, -3.6, 6, 0.9);
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.9;
  for (const ex of [6, 9]) {
    ctx.beginPath();
    ctx.moveTo(ex - 0.9, -3.3);
    ctx.lineTo(ex + 0.9, -1.9);
    ctx.moveTo(ex + 0.9, -3.3);
    ctx.lineTo(ex - 0.9, -1.9);
    ctx.stroke();
  }
}
