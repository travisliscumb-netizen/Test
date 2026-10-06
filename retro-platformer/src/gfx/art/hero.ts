import { OUTLINE, capsule, ellipse, fillStroke, linear, radial, roundRect, type Ctx } from "../paint";
import type { HeroPose, Limb } from "./heroPose";

/**
 * Moss, the hero: a gardener in a leaf hood with a sprout on top and a long
 * orange scarf. Drawn facing right with the origin at the feet (y up is
 * negative), in logical pixels. Mirror the context to face left.
 */

export const HERO_COLORS = {
  leafDark: "#1f5a30",
  leaf: "#3d9a48",
  leafLight: "#8fdc6a",
  sprout: "#a8ec74",
  skin: "#f2b48c",
  skinShade: "#c97a5a",
  blush: "#ff8a7a",
  scarf: "#f2742e",
  scarfDark: "#a83a1a",
  scarfLight: "#ffb470",
  tunic: "#3f63b8",
  tunicDark: "#22346e",
  tunicLight: "#7397e6",
  boot: "#6a3d22",
  bootDark: "#3a2012",
  belt: "#5a3420",
  gold: "#ffd24a",
  eye: "#2a1a30",
} as const;

const C = HERO_COLORS;
const LINE = 1.15;

interface Build {
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hipY: number;
  shoulderY: number;
  headY: number;
  headR: number;
  torsoW: number;
  limbR: number;
}

/** Body proportions: small is chibi (big head, short limbs); big is taller and leaner. */
export const BUILDS: Readonly<Record<HeroPose["form"], Build>> = {
  small: { thigh: 4.2, shin: 4.2, upperArm: 4, forearm: 3.6, hipY: -9.6, shoulderY: -15.5, headY: -21.5, headR: 8.2, torsoW: 9, limbR: 1.9 },
  big: { thigh: 7.2, shin: 7.2, upperArm: 6.4, forearm: 5.8, hipY: -16.4, shoulderY: -29.5, headY: -37.5, headR: 9, torsoW: 11, limbR: 2.4 },
};

interface Point {
  x: number;
  y: number;
}

/** End points of a two-segment limb hanging from (x, y). Legs bend backward at the knee, arms forward at the elbow. */
export function solveLimb(x: number, y: number, limb: Limb, upper: number, lower: number, leg: boolean): { joint: Point; end: Point } {
  const joint = { x: x + Math.sin(limb.swing) * upper, y: y + Math.cos(limb.swing) * upper };
  const lowerAngle = leg ? limb.swing - limb.bend : limb.swing + limb.bend;
  const end = { x: joint.x + Math.sin(lowerAngle) * lower, y: joint.y + Math.cos(lowerAngle) * lower };
  return { joint, end };
}

/** How far below the hip the lowest foot reaches, so planted poses can stand exactly on y = 0. */
export function lowestFoot(pose: HeroPose): number {
  const b = BUILDS[pose.form];
  const f = solveLimb(0, 0, pose.frontLeg, b.thigh, b.shin, true).end.y;
  const k = solveLimb(0, 0, pose.backLeg, b.thigh, b.shin, true).end.y;
  return Math.max(f, k);
}

export function drawHero(ctx: Ctx, pose: HeroPose): void {
  const b = BUILDS[pose.form];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Squash and stretch about the feet.
  ctx.scale(1 / Math.sqrt(pose.stretch), pose.stretch);
  // Keep a standing hero's lowest boot on the ground.
  const bootH = pose.form === "big" ? 2.6 : 2;
  const hipY = pose.planted ? -(lowestFoot(pose) + bootH) : b.hipY;
  const lift = hipY - b.hipY;
  const hip = { x: 0, y: hipY };
  const shoulder = { x: Math.sin(pose.lean) * (b.hipY - b.shoulderY) * -1, y: b.shoulderY + lift };
  const head = { x: shoulder.x + Math.sin(pose.lean) * 6 + 0.5, y: b.headY + lift };

  drawScarfTail(ctx, head, b, pose);
  drawArm(ctx, { x: shoulder.x - 1.2, y: shoulder.y + 1 }, pose.backArm, b, true);
  drawLeg(ctx, { x: hip.x - 1.6, y: hip.y }, pose.backLeg, b, bootH, true);
  drawTorso(ctx, hip, shoulder, b);
  drawLeg(ctx, { x: hip.x + 1.4, y: hip.y }, pose.frontLeg, b, bootH, false);
  drawHead(ctx, head, b.headR, pose);
  drawScarfWrap(ctx, head, b);
  drawArm(ctx, { x: shoulder.x + 1.3, y: shoulder.y + 1.2 }, pose.frontArm, b, false);
  ctx.restore();
}

function drawLeg(ctx: Ctx, hip: Point, limb: Limb, b: Build, bootH: number, back: boolean): void {
  const { joint, end } = solveLimb(hip.x, hip.y, limb, b.thigh, b.shin, true);
  const r = b.limbR;
  const cloth = back ? C.tunicDark : C.tunic;
  ctx.save();
  capsule(ctx, hip.x, hip.y, joint.x, joint.y, r * 1.15, r);
  fillStroke(ctx, cloth, OUTLINE, LINE);
  capsule(ctx, joint.x, joint.y, end.x, end.y, r, r * 0.9);
  fillStroke(ctx, cloth, OUTLINE, LINE);
  // Boot, toe pointing forward.
  const len = r * 3.2;
  roundRect(ctx, end.x - r * 1.1, end.y - bootH * 0.4, len, bootH * 1.4, bootH * 0.7);
  fillStroke(ctx, linear(ctx, 0, end.y - bootH, 0, end.y + bootH, [
    [0, back ? C.bootDark : "#8a5430"],
    [1, back ? "#24140c" : C.bootDark],
  ]), OUTLINE, LINE);
  if (!back) {
    ctx.fillStyle = "rgba(255, 220, 180, 0.35)";
    ctx.fillRect(end.x - r * 0.6, end.y - bootH * 0.25, len * 0.55, 0.6);
  }
  ctx.restore();
}

function drawArm(ctx: Ctx, shoulder: Point, limb: Limb, b: Build, back: boolean): void {
  const { joint, end } = solveLimb(shoulder.x, shoulder.y, limb, b.upperArm, b.forearm, false);
  const r = b.limbR * 0.85;
  capsule(ctx, shoulder.x, shoulder.y, joint.x, joint.y, r * 1.2, r);
  fillStroke(ctx, back ? C.tunicDark : C.tunicLight, OUTLINE, LINE);
  capsule(ctx, joint.x, joint.y, end.x, end.y, r * 0.95, r * 0.85);
  fillStroke(ctx, back ? C.skinShade : C.skin, OUTLINE, LINE);
  ellipse(ctx, end.x, end.y, r * 1.25, r * 1.25);
  fillStroke(ctx, back ? C.skinShade : radial(ctx, end.x - 0.4, end.y - 0.5, r * 1.4, [
    [0, "#ffd9bf"],
    [1, C.skin],
  ]), OUTLINE, LINE);
}

function drawTorso(ctx: Ctx, hip: Point, shoulder: Point, b: Build): void {
  const w = b.torsoW;
  const top = shoulder.y - 1.5;
  const bottom = hip.y + 1.5;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - w * 0.42, top);
  ctx.quadraticCurveTo(shoulder.x, top - 1.2, shoulder.x + w * 0.42, top);
  ctx.quadraticCurveTo(hip.x + w * 0.62, (top + bottom) / 2, hip.x + w * 0.5, bottom);
  ctx.quadraticCurveTo(hip.x, bottom + 1.4, hip.x - w * 0.5, bottom);
  ctx.quadraticCurveTo(hip.x - w * 0.62, (top + bottom) / 2, shoulder.x - w * 0.42, top);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, hip.x - w / 2, 0, hip.x + w / 2, 0, [
    [0, C.tunicDark],
    [0.45, C.tunic],
    [0.8, C.tunicLight],
    [1, C.tunic],
  ]), OUTLINE, LINE);
  // Belt and buckle.
  const beltY = bottom - 2.6;
  ctx.fillStyle = C.belt;
  ctx.fillRect(hip.x - w * 0.52, beltY, w * 1.04, 1.5);
  roundRect(ctx, hip.x + w * 0.12, beltY - 0.4, 2.2, 2.3, 0.5);
  fillStroke(ctx, C.gold, OUTLINE, 0.5);
  // Overall straps.
  ctx.strokeStyle = C.tunicDark;
  ctx.lineWidth = 0.8;
  for (const dx of [-w * 0.22, w * 0.22]) {
    ctx.beginPath();
    ctx.moveTo(shoulder.x + dx, top + 0.6);
    ctx.lineTo(hip.x + dx, beltY);
    ctx.stroke();
  }
}

function drawHead(ctx: Ctx, h: Point, R: number, pose: HeroPose): void {
  const { x, y } = h;
  // Sprout growing from the crown.
  ctx.save();
  ctx.translate(x + R * 0.05, y - R * 1.05);
  ctx.rotate(pose.sprout);
  ctx.strokeStyle = C.leafDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(R * 0.1, -R * 0.35, R * 0.05, -R * 0.55);
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(R * 0.05, -R * 0.5);
    ctx.bezierCurveTo(dir * R * 0.25, -R * 0.95, dir * R * 0.7, -R * 0.8, dir * R * 0.65, -R * 0.55);
    ctx.bezierCurveTo(dir * R * 0.5, -R * 0.42, dir * R * 0.2, -R * 0.42, R * 0.05, -R * 0.5);
    fillStroke(ctx, dir < 0 ? C.leaf : C.sprout, OUTLINE, 0.8);
  }
  ctx.restore();

  // Leaf hood with a trailing, curling tip.
  ctx.beginPath();
  ctx.moveTo(x + R * 0.95, y + R * 0.3);
  ctx.bezierCurveTo(x + R * 1.15, y - R * 0.95, x - R * 0.25, y - R * 1.4, x - R * 0.95, y - R * 0.65);
  ctx.bezierCurveTo(x - R * 1.45, y - R * 0.35, x - R * 1.95, y + R * 0.1, x - R * 2.05, y + R * 0.45);
  ctx.quadraticCurveTo(x - R * 1.35, y + R * 0.2, x - R * 0.95, y + R * 0.85);
  ctx.bezierCurveTo(x - R * 0.3, y + R * 1.15, x + R * 0.65, y + R * 1.0, x + R * 0.95, y + R * 0.3);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, x, y - R * 1.3, x - R * 0.3, y + R, [
    [0, C.leafLight],
    [0.45, C.leaf],
    [1, C.leafDark],
  ]), OUTLINE, LINE);
  // Leaf vein and a glossy highlight.
  ctx.strokeStyle = "rgba(20, 60, 30, 0.55)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + R * 0.1, y - R * 1.0);
  ctx.quadraticCurveTo(x - R * 0.9, y - R * 0.55, x - R * 1.85, y + R * 0.35);
  ctx.stroke();
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const vx = x + R * 0.1 + (-R * 1.95) * t;
    const vy = y - R * 1.0 + R * 1.3 * t * t;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + R * 0.15, vy + R * 0.4);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 220, 0.5)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(x + R * 0.05, y - R * 0.05, R * 0.95, -Math.PI * 0.82, -Math.PI * 0.55);
  ctx.stroke();

  // Face in the hood's opening.
  const fx = x + R * 0.38;
  const fy = y + R * 0.18;
  ellipse(ctx, fx, fy, R * 0.68, R * 0.66);
  fillStroke(ctx, radial(ctx, fx + R * 0.15, fy - R * 0.2, R * 0.9, [
    [0, "#ffd8bc"],
    [0.7, C.skin],
    [1, C.skinShade],
  ]), OUTLINE, LINE);
  // Hood brim shading the forehead.
  ctx.beginPath();
  ctx.moveTo(x - R * 0.2, y - R * 0.3);
  ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.72, x + R * 1.08, y - R * 0.18);
  ctx.quadraticCurveTo(x + R * 0.5, y - R * 0.42, x - R * 0.2, y - R * 0.05);
  ctx.closePath();
  fillStroke(ctx, C.leafDark, OUTLINE, 0.6);
  // Blush.
  ctx.fillStyle = radial(ctx, fx + R * 0.32, fy + R * 0.28, R * 0.28, [
    [0, "rgba(255, 120, 110, 0.55)"],
    [1, "rgba(255, 120, 110, 0)"],
  ]);
  ctx.fillRect(fx, fy, R * 0.7, R * 0.6);

  // Eyes (three-quarter view: the far eye is narrower).
  for (const [ex, scale] of [
    [fx - R * 0.2, 0.75],
    [fx + R * 0.3, 1],
  ] as const) {
    const ey = fy - R * 0.02;
    if (pose.dizzy) {
      ctx.strokeStyle = C.eye;
      ctx.lineWidth = 0.9;
      const s = R * 0.14 * scale;
      ctx.beginPath();
      ctx.moveTo(ex - s, ey - s);
      ctx.lineTo(ex + s, ey + s);
      ctx.moveTo(ex + s, ey - s);
      ctx.lineTo(ex - s, ey + s);
      ctx.stroke();
      continue;
    }
    const open = 1 - pose.blink;
    if (open < 0.15) {
      ctx.strokeStyle = C.eye;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex - R * 0.13 * scale, ey);
      ctx.quadraticCurveTo(ex, ey + R * 0.08, ex + R * 0.13 * scale, ey);
      ctx.stroke();
      continue;
    }
    ellipse(ctx, ex, ey, R * 0.15 * scale, R * 0.21 * open);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ellipse(ctx, ex + R * 0.03, ey + R * 0.02, R * 0.11 * scale, R * 0.17 * open);
    ctx.fillStyle = radial(ctx, ex + R * 0.03, ey + R * 0.05, R * 0.17, [
      [0, "#6a3a2a"],
      [1, C.eye],
    ]);
    ctx.fill();
    ellipse(ctx, ex + R * 0.07, ey - R * 0.07 * open, R * 0.045, R * 0.05 * open);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  // Smile.
  ctx.strokeStyle = "#8a3a30";
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  if (pose.dizzy) ctx.ellipse(fx + R * 0.15, fy + R * 0.42, R * 0.1, R * 0.13, 0, 0, Math.PI * 2);
  else ctx.arc(fx + R * 0.1, fy + R * 0.25, R * 0.2, Math.PI * 0.2, Math.PI * 0.75);
  ctx.stroke();
}

function drawScarfWrap(ctx: Ctx, h: Point, b: Build): void {
  const R = b.headR;
  const y = h.y + R * 0.92;
  roundRect(ctx, h.x - R * 0.75, y - R * 0.2, R * 1.75, R * 0.48, R * 0.24);
  fillStroke(ctx, linear(ctx, 0, y - R * 0.2, 0, y + R * 0.28, [
    [0, C.scarfLight],
    [0.5, C.scarf],
    [1, C.scarfDark],
  ]), OUTLINE, LINE);
  // Knitted ridges.
  ctx.strokeStyle = "rgba(120, 30, 10, 0.35)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const sx = h.x - R * 0.55 + i * R * 0.33;
    ctx.beginPath();
    ctx.moveTo(sx, y - R * 0.12);
    ctx.lineTo(sx, y + R * 0.2);
    ctx.stroke();
  }
}

/** The scarf's free end streams behind as a tapered, waving ribbon. */
function drawScarfTail(ctx: Ctx, h: Point, b: Build, pose: HeroPose): void {
  const R = b.headR;
  const startX = h.x - R * 0.55;
  const startY = h.y + R * 1.0;
  const segments = 6;
  const length = R * 2.1;
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const droop = (1 - pose.scarfLift) * t * t * R * 1.6;
    const wave = Math.sin(pose.scarfPhase - t * 4.2) * R * 0.28 * t;
    pts.push({ x: startX - t * length * (0.45 + pose.scarfLift * 0.55), y: startY + droop + wave });
  }
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const p = pts[i]!;
    const q = pts[Math.min(segments, i + 1)]!;
    const o = pts[Math.max(0, i - 1)]!;
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    const half = R * 0.24 * (1 - (i / segments) * 0.45);
    left.push({ x: p.x - (dy / len) * half, y: p.y + (dx / len) * half });
    right.push({ x: p.x + (dy / len) * half, y: p.y - (dx / len) * half });
  }
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
  for (const p of right.reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, startX, 0, startX - length, 0, [
    [0, C.scarf],
    [1, C.scarfDark],
  ]), OUTLINE, LINE);
  // Fringe at the end.
  const end = pts[segments]!;
  ctx.strokeStyle = C.scarfLight;
  ctx.lineWidth = 0.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(end.x, end.y + i * R * 0.12);
    ctx.lineTo(end.x - R * 0.3, end.y + i * R * 0.18);
    ctx.stroke();
  }
}
