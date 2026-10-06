import { OUTLINE, capsule, ellipse, fillStroke, linear, radial, type Ctx } from "../paint";

/** Shellback: a snail with a kickable spiral shell. Facing right, origin at the feet. */
export const SHELLBACK_COLORS = {
  shell: "#e8962a",
  shellDark: "#8a4410",
  shellLight: "#ffdc84",
  body: "#3fa8b0",
  bodyDark: "#1c5a64",
  bodyLight: "#a4eef0",
} as const;

const C = SHELLBACK_COLORS;
const LINE = 1.1;

export interface ShellbackPose {
  state: "walk" | "shell" | "peek";
  /** Walk cycle phase in radians (body ripple and eye-stalk bob). */
  step: number;
  /** Shell rotation in radians (spins while sliding). */
  spin: number;
}

/** The spiral shell centred at (cx, cy), radius r, rotated by `spin`. */
export function drawShell(ctx: Ctx, cx: number, cy: number, r: number, spin: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ellipse(ctx, 0, 0, r, r);
  fillStroke(ctx, radial(ctx, 0, 0, r, [
    [0, C.shellLight],
    [0.55, C.shell],
    [1, C.shellDark],
  ], -r * 0.35, -r * 0.4), OUTLINE, LINE);
  ctx.rotate(spin);
  // Spiral groove.
  ctx.strokeStyle = "rgba(110, 50, 10, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let t = 0; t <= Math.PI * 3.4; t += 0.15) {
    const rr = r * (0.08 + (t / (Math.PI * 3.4)) * 0.82);
    const x = Math.cos(t) * rr;
    const y = Math.sin(t) * rr;
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.rotate(-spin);
  // Fixed gloss (light doesn't spin with the shell).
  ellipse(ctx, -r * 0.35, -r * 0.45, r * 0.38, r * 0.18, -0.5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.fill();
  ctx.restore();
}

export function drawShellback(ctx: Ctx, pose: ShellbackPose): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (pose.state !== "walk") {
    drawShell(ctx, 0, -11.2, 11, pose.spin);
    if (pose.state === "peek") {
      // Eyes peeking out of the opening, about to wake.
      ellipse(ctx, 7.5, -3.6, 5, 3);
      ctx.fillStyle = "#1a0e14";
      ctx.fill();
      for (const ex of [5.6, 9.2]) {
        ellipse(ctx, ex, -3.6, 1.5, 1.8);
        fillStroke(ctx, "#ffffff", OUTLINE, 0.7);
        ellipse(ctx, ex + 0.4, -3.4, 0.7, 0.9);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  const ripple = Math.sin(pose.step) * 0.8;
  // Foot running along the ground, head rising at the front.
  ctx.beginPath();
  ctx.moveTo(-14 - ripple, 0);
  ctx.quadraticCurveTo(-14 - ripple, -5, -6, -5);
  ctx.lineTo(8, -5);
  ctx.quadraticCurveTo(13, -6, 13.5, -14);
  ctx.quadraticCurveTo(15, -19, 18.5 + ripple * 0.3, -16);
  ctx.quadraticCurveTo(20 + ripple * 0.3, -6, 15.5, 0);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, -18, 0, 0, [
    [0, C.bodyLight],
    [0.5, C.body],
    [1, C.bodyDark],
  ]), OUTLINE, LINE);
  // Eye stalks bobbing out of phase.
  for (const [i, base] of [
    [0, 15.5],
    [1, 18],
  ] as const) {
    const bob = Math.sin(pose.step * 1.3 + i * 1.7) * 1;
    const tipX = base + 1.5 + i * 1.5;
    const tipY = -26 + bob + i * 1.2;
    capsule(ctx, base, -15.5, tipX, tipY + 2, 0.9, 0.7);
    fillStroke(ctx, C.body, OUTLINE, 0.9);
    ellipse(ctx, tipX, tipY, 2.1, 2.3);
    fillStroke(ctx, "#ffffff", OUTLINE, 0.9);
    ellipse(ctx, tipX + 0.7, tipY + 0.3, 1, 1.2);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  }
  // Smile.
  ctx.strokeStyle = C.bodyDark;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(17.2, -11, 1.6, 0.2, Math.PI * 0.8);
  ctx.stroke();
  drawShell(ctx, -2.5, -15, 11.5, -0.4);
  ctx.restore();
}
