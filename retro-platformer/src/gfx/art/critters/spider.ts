import { OUTLINE, ellipse, fillStroke, type Ctx } from "../../paint";
import { LINE, begin, blob, eye, pancake, type Tone } from "./parts";

/** Rebar spider: a big, hairy ground spider with an orange-spotted back and a cluster of red eyes. */
const BODY: Tone = ["#2c2240", "#5a4878", "#a690c8"];
const LEG = "#4a3a62";
const SPOT = "#ff8a2a";
/** How far each leg reaches from where it joins the head: two back, two forward. */
const NEAR_REACH = [-14, -8.5, 7, 11.2] as const;
const FAR_REACH = [-12, -6.5, 5.5, 10.5] as const;

/** One jointed leg from the body out to a foot on the ground, the knee raised high. */
function spiderLeg(ctx: Ctx, x: number, y: number, reach: number, phase: number, far: boolean): void {
  const lift = Math.max(0, Math.cos(phase)) * 1.6;
  const foot = x + reach + Math.sin(phase) * 1.8;
  const knee = { x: x + reach * 0.62, y: y - 8.5 - lift * 0.5 };
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = far ? 2 : 2.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot, -0.6 - lift);
  ctx.stroke();
  ctx.strokeStyle = far ? "#33284a" : LEG;
  ctx.lineWidth = far ? 0.9 : 1.2;
  ctx.stroke();
  if (!far) {
    // Bristles at the knee.
    ctx.strokeStyle = "rgba(160, 140, 190, 0.6)";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(knee.x, knee.y);
    ctx.lineTo(knee.x - 0.6, knee.y - 1.4);
    ctx.moveTo(knee.x, knee.y);
    ctx.lineTo(knee.x + 0.8, knee.y - 1.2);
    ctx.stroke();
  }
}

export function drawSpider(ctx: Ctx, step: number, squashed: boolean): void {
  begin(ctx);
  if (squashed) {
    // Legs splayed flat around a flattened body.
    ctx.strokeStyle = LEG;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const dx of [-15, -11, 11, 15]) {
      ctx.moveTo(0, -2);
      ctx.lineTo(dx, -0.6);
    }
    ctx.stroke();
    pancake(ctx, 22, 6, BODY, () => {
      for (const x of [-4, 0]) {
        ellipse(ctx, x, -4, 1.2, 0.8);
        ctx.fillStyle = SPOT;
        ctx.fill();
      }
    });
    ctx.restore();
    return;
  }
  const bob = -Math.abs(Math.sin(step * 2)) * 0.6;
  const by = -9 + bob;
  // Far legs.
  for (let i = 0; i < 4; i++) spiderLeg(ctx, 2 + i * 0.8, by - 0.6, FAR_REACH[i]!, step + i * 1.6 + Math.PI, true);
  // Near legs, also behind the body so its silhouette stays clean.
  for (let i = 0; i < 4; i++) spiderLeg(ctx, 2.4 + i * 0.8, by + 1.6, NEAR_REACH[i]!, step + i * 1.6, false);
  // Abdomen and head.
  blob(ctx, -5, by - 3, 8, 6.6, BODY, -0.2);
  for (const [x, y, r] of [
    [-7, -5, 1.6],
    [-3.6, -6.4, 1.3],
    [-8.4, -1.6, 1],
    [-4.6, -2.6, 1.1],
  ] as const) {
    ellipse(ctx, x, by + y + 3, r, r * 0.8);
    ctx.fillStyle = SPOT;
    ctx.fill();
  }
  blob(ctx, 4.4, by + 0.2, 5.4, 4.4, BODY);
  // Fangs.
  ctx.fillStyle = "#e8e0d0";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.4;
  for (const x of [7, 8.8]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.6, by + 3.4);
    ctx.lineTo(x + 0.2, by + 5.6);
    ctx.lineTo(x + 0.8, by + 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Eye cluster: two big, two small.
  eye(ctx, 5.4, by - 1, 1.4, { iris: "#d01a2a", glow: true });
  eye(ctx, 8.2, by - 0.6, 1.2, { iris: "#d01a2a" });
  for (const [x, y] of [
    [4.4, by - 3.4],
    [7, by - 3.2],
  ] as const) {
    ellipse(ctx, x, y, 0.7, 0.7);
    fillStroke(ctx, "#ff4a4a", OUTLINE, 0.4);
  }
  ctx.lineWidth = LINE;
  ctx.restore();
}
