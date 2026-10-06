import { OUTLINE, capsule, ellipse, fillStroke, linear, radial, roundRect, type Ctx } from "../paint";
import type { HeroPose, Limb } from "./heroPose";

/**
 * Bud, the hero: a confident chibi kid in a black cap, a black hoodie with
 * his name across the front, headphones round his neck, a red bandana and
 * white sneakers. Drawn facing right with the origin at the feet (y up is
 * negative), in logical pixels. Mirror the context to face left.
 *
 * Everything here is original: the cap carries Bud's own "B", and the shoes
 * have no brand marks.
 */

export const HERO_COLORS = {
  skin: "#e9ebf0",
  skinShade: "#b4b9c4",
  skinDeep: "#8e94a2",
  brow: "#4a4c56",
  eye: "#141418",
  cap: "#18181e",
  capLight: "#3a3a46",
  hoodie: "#1c1c22",
  hoodieDark: "#0e0e12",
  hoodieLight: "#3c3c48",
  print: "#f4f4f6",
  pants: "#18181c",
  pantsLight: "#34343e",
  shoe: "#f2f3f6",
  shoeShade: "#c4c8d2",
  sole: "#dfe2e8",
  bandana: "#d42a26",
  bandanaDark: "#8a1414",
  bandanaLight: "#ff6a5a",
  phones: "#1a1a20",
  phonesLight: "#4a4a58",
} as const;

const C = HERO_COLORS;
const LINE = 1.1;

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
  /** Height of the sneakers. */
  shoeH: number;
}

/** Body proportions: both forms are chibi (a big head); the big form has a longer body and legs. */
export const BUILDS: Readonly<Record<HeroPose["form"], Build>> = {
  small: { thigh: 3.6, shin: 3.6, upperArm: 3.8, forearm: 3.4, hipY: -9.2, shoulderY: -14.8, headY: -21.6, headR: 8.6, torsoW: 10, limbR: 2, shoeH: 2.4 },
  big: { thigh: 6.6, shin: 6.4, upperArm: 6.2, forearm: 5.6, hipY: -16, shoulderY: -28.4, headY: -37, headR: 9.8, torsoW: 12.5, limbR: 2.5, shoeH: 3 },
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
  // Keep a standing hero's lowest shoe on the ground.
  const hipY = pose.planted ? -(lowestFoot(pose) + b.shoeH * 0.6) : b.hipY;
  const lift = hipY - b.hipY;
  const hip = { x: 0, y: hipY };
  const shoulder = { x: -Math.sin(pose.lean) * (b.hipY - b.shoulderY), y: b.shoulderY + lift };
  const head = { x: shoulder.x + Math.sin(pose.lean) * 6 + 0.6, y: b.headY + lift };

  // The front shoulder sits at the leading edge of the torso so the arm doesn't hide the print.
  const front = { x: shoulder.x + b.torsoW * 0.4, y: shoulder.y + 1.4 };
  drawArm(ctx, { x: shoulder.x - 1.4, y: shoulder.y + 1.2 }, pose.backArm, b, true);
  drawLeg(ctx, { x: hip.x - 1.8, y: hip.y }, pose.backLeg, b, true);
  drawBandana(ctx, { x: hip.x - b.torsoW * 0.36, y: hip.y + 0.6 }, b, pose);
  drawTorso(ctx, hip, shoulder, b, pose.form);
  drawLeg(ctx, { x: hip.x + 1.6, y: hip.y }, pose.frontLeg, b, false);
  drawHood(ctx, head, shoulder, b);
  drawHead(ctx, head, b.headR, pose);
  drawHeadphones(ctx, head, b);
  if (pose.pocket) drawPocketArm(ctx, front, hip, b);
  else drawArm(ctx, front, pose.frontArm, b, false);
  ctx.restore();
}

function drawLeg(ctx: Ctx, hip: Point, limb: Limb, b: Build, back: boolean): void {
  const { joint, end } = solveLimb(hip.x, hip.y, limb, b.thigh, b.shin, true);
  const r = b.limbR;
  const cloth = back ? C.hoodieDark : C.pants;
  capsule(ctx, hip.x, hip.y, joint.x, joint.y, r * 1.2, r * 1.05);
  fillStroke(ctx, cloth, OUTLINE, LINE);
  capsule(ctx, joint.x, joint.y, end.x, end.y, r * 1.05, r * 1.0);
  fillStroke(ctx, cloth, OUTLINE, LINE);
  if (!back) {
    // A soft highlight down the front of the joggers and a gathered cuff.
    ctx.strokeStyle = C.pantsLight;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hip.x + r * 0.5, hip.y + 1);
    ctx.lineTo(joint.x + r * 0.5, joint.y);
    ctx.stroke();
  }
  ctx.strokeStyle = back ? "#202026" : C.pantsLight;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(end.x - r, end.y - b.shoeH * 0.55);
  ctx.lineTo(end.x + r, end.y - b.shoeH * 0.55);
  ctx.stroke();
  drawShoe(ctx, end, b, back);
}

/** Chunky white sneaker, toe forward, with a thick sole and laces. No brand marks. */
function drawShoe(ctx: Ctx, at: Point, b: Build, back: boolean): void {
  const h = b.shoeH;
  const len = b.limbR * 4.2;
  const x = at.x - b.limbR * 1.3;
  const y = at.y - h * 0.4;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.quadraticCurveTo(x + len * 0.35, y - h * 0.55, x + len * 0.62, y + h * 0.05);
  ctx.quadraticCurveTo(x + len, y + h * 0.15, x + len, y + h * 0.8);
  ctx.lineTo(x + len, y + h);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, y - h * 0.5, 0, y + h, [
    [0, back ? C.shoeShade : "#ffffff"],
    [1, back ? "#9aa0ac" : C.shoeShade],
  ]), OUTLINE, LINE);
  // Sole.
  ctx.fillStyle = back ? "#b0b4be" : C.sole;
  ctx.fillRect(x + 0.4, y + h * 0.62, len - 0.8, h * 0.34);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 0.4, y + h * 0.62);
  ctx.lineTo(x + len - 0.4, y + h * 0.62);
  ctx.stroke();
  if (!back) {
    // Laces.
    ctx.strokeStyle = "#a8aebc";
    ctx.lineWidth = 0.45;
    for (let i = 0; i < 3; i++) {
      const lx = x + len * (0.3 + i * 0.1);
      ctx.beginPath();
      ctx.moveTo(lx, y - h * 0.1 + i * 0.15);
      ctx.lineTo(lx + len * 0.06, y + h * 0.15 + i * 0.1);
      ctx.stroke();
    }
  }
}

function drawArm(ctx: Ctx, shoulder: Point, limb: Limb, b: Build, back: boolean): Point {
  const { joint, end } = solveLimb(shoulder.x, shoulder.y, limb, b.upperArm, b.forearm, false);
  const r = b.limbR;
  const sleeve = back ? C.hoodieDark : C.hoodie;
  capsule(ctx, shoulder.x, shoulder.y, joint.x, joint.y, r * 1.25, r * 1.1);
  fillStroke(ctx, sleeve, OUTLINE, LINE);
  capsule(ctx, joint.x, joint.y, end.x, end.y, r * 1.1, r * 1.05);
  fillStroke(ctx, sleeve, OUTLINE, LINE);
  if (!back) {
    ctx.strokeStyle = C.hoodieLight;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(shoulder.x + 0.6, shoulder.y - r * 0.6);
    ctx.lineTo(joint.x + 0.6, joint.y - r * 0.5);
    ctx.stroke();
  }
  ellipse(ctx, end.x, end.y, r * 1.15, r * 1.15);
  fillStroke(ctx, back ? C.skinShade : radial(ctx, end.x - 0.4, end.y - 0.5, r * 1.4, [
    [0, "#ffffff"],
    [1, C.skin],
  ]), OUTLINE, LINE);
  return end;
}

/** The front arm bent with the hand tucked into the hoodie's pocket. */
function drawPocketArm(ctx: Ctx, shoulder: Point, hip: Point, b: Build): void {
  const r = b.limbR;
  const elbow = { x: shoulder.x + r * 0.5, y: (shoulder.y + hip.y) / 2 + 0.5 };
  const hand = { x: hip.x + b.torsoW * 0.3, y: hip.y - 2.2 };
  capsule(ctx, shoulder.x, shoulder.y, elbow.x, elbow.y, r * 1.25, r * 1.1);
  fillStroke(ctx, C.hoodie, OUTLINE, LINE);
  capsule(ctx, elbow.x, elbow.y, hand.x, hand.y, r * 1.1, r * 1.0);
  fillStroke(ctx, C.hoodie, OUTLINE, LINE);
  ctx.strokeStyle = C.hoodieLight;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(shoulder.x + 0.6, shoulder.y - r * 0.6);
  ctx.lineTo(elbow.x + 0.8, elbow.y - r * 0.4);
  ctx.stroke();
}

function drawTorso(ctx: Ctx, hip: Point, shoulder: Point, b: Build, form: HeroPose["form"]): void {
  const w = b.torsoW;
  const top = shoulder.y - 1.6;
  const bottom = hip.y + 1.8;
  ctx.beginPath();
  ctx.moveTo(shoulder.x - w * 0.44, top);
  ctx.quadraticCurveTo(shoulder.x, top - 1.4, shoulder.x + w * 0.44, top);
  ctx.quadraticCurveTo(hip.x + w * 0.62, (top + bottom) / 2, hip.x + w * 0.52, bottom);
  ctx.quadraticCurveTo(hip.x, bottom + 1, hip.x - w * 0.52, bottom);
  ctx.quadraticCurveTo(hip.x - w * 0.64, (top + bottom) / 2, shoulder.x - w * 0.44, top);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, hip.x - w / 2, 0, hip.x + w / 2, 0, [
    [0, C.hoodieDark],
    [0.5, C.hoodie],
    [0.85, C.hoodieLight],
    [1, C.hoodie],
  ]), OUTLINE, LINE);
  // Ribbed hem.
  ctx.fillStyle = C.hoodieDark;
  ctx.fillRect(hip.x - w * 0.5, bottom - 1.6, w, 1.3);
  // His name across the front, turned three-quarters with the body.
  const cx = (shoulder.x + hip.x) / 2 - w * 0.1;
  const cy = top + (bottom - top) * 0.5;
  const size = form === "big" ? 5.2 : 3.8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.86, 1);
  ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.print;
  ctx.fillText("BUD", 0, 0);
  ctx.restore();
  // Kangaroo pocket.
  if (form === "big") {
    ctx.strokeStyle = C.hoodieLight;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(hip.x - w * 0.32, bottom - 2.2);
    ctx.lineTo(hip.x - w * 0.22, bottom - 6);
    ctx.lineTo(hip.x + w * 0.34, bottom - 6);
    ctx.lineTo(hip.x + w * 0.44, bottom - 2.2);
    ctx.stroke();
  }
}

/** The hood bunched behind the neck. */
function drawHood(ctx: Ctx, h: Point, shoulder: Point, b: Build): void {
  const R = b.headR;
  ellipse(ctx, shoulder.x - R * 0.62, h.y + R * 0.92, R * 0.55, R * 0.36, -0.3);
  fillStroke(ctx, linear(ctx, 0, h.y + R * 0.5, 0, h.y + R * 1.4, [
    [0, C.hoodieLight],
    [1, C.hoodieDark],
  ]), OUTLINE, LINE);
}

function drawHead(ctx: Ctx, h: Point, R: number, pose: HeroPose): void {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(pose.tilt);
  // Ear on the far side of the face (we see Bud three-quarters).
  ellipse(ctx, -R * 0.62, R * 0.12, R * 0.3, R * 0.38);
  fillStroke(ctx, radial(ctx, -R * 0.6, R * 0.1, R * 0.4, [
    [0, C.skin],
    [1, C.skinShade],
  ]), OUTLINE, LINE);
  ellipse(ctx, -R * 0.6, R * 0.14, R * 0.14, R * 0.2);
  ctx.fillStyle = C.skinDeep;
  ctx.fill();
  // Big round head.
  ellipse(ctx, 0, 0, R, R * 0.98);
  fillStroke(ctx, radial(ctx, R * 0.25, -R * 0.15, R * 1.25, [
    [0, "#ffffff"],
    [0.55, C.skin],
    [1, C.skinShade],
  ], R * 0.35, -R * 0.3), OUTLINE, LINE);
  // Cheek shading toward the back of the head.
  ellipse(ctx, -R * 0.3, R * 0.35, R * 0.4, R * 0.3);
  ctx.fillStyle = "rgba(140, 146, 162, 0.25)";
  ctx.fill();
  // Cap: crown, band and a brim pointing forward.
  ctx.beginPath();
  ctx.moveTo(-R * 1.0, -R * 0.08);
  ctx.bezierCurveTo(-R * 1.05, -R * 1.2, R * 1.0, -R * 1.25, R * 1.02, -R * 0.12);
  ctx.quadraticCurveTo(0, -R * 0.3, -R * 1.0, -R * 0.08);
  ctx.closePath();
  fillStroke(ctx, radial(ctx, R * 0.1, -R * 0.75, R * 1.2, [
    [0, C.capLight],
    [0.6, C.cap],
    [1, "#08080a"],
  ], R * 0.25, -R * 0.9), OUTLINE, LINE);
  // Panel seams and the top button.
  ctx.strokeStyle = "rgba(90, 90, 110, 0.6)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(R * 0.05, -R * 1.0);
  ctx.quadraticCurveTo(R * 0.5, -R * 0.6, R * 0.55, -R * 0.2);
  ctx.moveTo(R * 0.05, -R * 1.0);
  ctx.quadraticCurveTo(-R * 0.4, -R * 0.6, -R * 0.45, -R * 0.15);
  ctx.stroke();
  ellipse(ctx, R * 0.05, -R * 1.02, R * 0.1, R * 0.06);
  ctx.fillStyle = C.cap;
  ctx.fill();
  // Brim.
  ctx.beginPath();
  ctx.moveTo(R * 0.45, -R * 0.32);
  ctx.quadraticCurveTo(R * 1.35, -R * 0.42, R * 1.62, -R * 0.12);
  ctx.quadraticCurveTo(R * 1.25, -R * 0.02, R * 0.5, -R * 0.1);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, 0, -R * 0.42, 0, -R * 0.02, [
    [0, C.capLight],
    [1, "#06060a"],
  ]), OUTLINE, LINE);
  // Bud's own mark on the cap: a bold B.
  ctx.save();
  ctx.translate(R * 0.42, -R * 0.62);
  ctx.rotate(0.12);
  ctx.scale(0.8, 1);
  ctx.font = `900 ${R * 0.62}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = R * 0.08;
  ctx.strokeStyle = "#08080a";
  ctx.strokeText("B", 0, 0);
  ctx.fillStyle = "#f2f2f4";
  ctx.fillText("B", 0, 0);
  ctx.restore();

  // Thick, confident brows angled down toward the nose.
  ctx.fillStyle = C.brow;
  for (const [x0, dir, s] of [
    [R * 0.08, 1, 0.75],
    [R * 0.55, 1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0 - R * 0.2 * s, -R * 0.12);
    ctx.quadraticCurveTo(x0, -R * 0.24, x0 + R * 0.24 * s * dir, -R * 0.06);
    ctx.lineTo(x0 + R * 0.22 * s * dir, R * 0.0);
    ctx.quadraticCurveTo(x0, -R * 0.14, x0 - R * 0.2 * s, -R * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  // Eyes: big, glossy and heavy-lidded (three-quarter view: the far eye is narrower).
  for (const [ex, scale] of [
    [R * 0.12, 0.72],
    [R * 0.58, 1],
  ] as const) {
    const ey = R * 0.18;
    if (pose.dizzy) {
      ctx.strokeStyle = C.eye;
      ctx.lineWidth = 0.9;
      const s = R * 0.13 * scale;
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
      ctx.moveTo(ex - R * 0.14 * scale, ey);
      ctx.quadraticCurveTo(ex, ey + R * 0.06, ex + R * 0.14 * scale, ey);
      ctx.stroke();
      continue;
    }
    ellipse(ctx, ex, ey, R * 0.17 * scale, R * 0.2 * open);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ellipse(ctx, ex + R * 0.03, ey + R * 0.02, R * 0.13 * scale, R * 0.17 * open);
    ctx.fillStyle = radial(ctx, ex, ey, R * 0.18, [
      [0, "#3a3a44"],
      [1, C.eye],
    ]);
    ctx.fill();
    ellipse(ctx, ex + R * 0.07 * scale, ey - R * 0.06 * open, R * 0.05, R * 0.055 * open);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // Heavy upper lid: a flat, knowing look.
    ctx.fillStyle = C.skinShade;
    ctx.fillRect(ex - R * 0.19 * scale, ey - R * 0.22, R * 0.38 * scale, R * 0.1);
    ctx.strokeStyle = C.eye;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(ex - R * 0.19 * scale, ey - R * 0.12);
    ctx.lineTo(ex + R * 0.2 * scale, ey - R * 0.1);
    ctx.stroke();
  }
  // Small nose.
  ctx.strokeStyle = C.skinDeep;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(R * 0.86, R * 0.28);
  ctx.quadraticCurveTo(R * 0.98, R * 0.38, R * 0.84, R * 0.44);
  ctx.stroke();
  // The smirk: one corner lifted.
  ctx.strokeStyle = "#4a4c56";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  if (pose.dizzy) {
    ctx.ellipse(R * 0.45, R * 0.62, R * 0.09, R * 0.12, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(R * 0.2, R * 0.58);
    ctx.quadraticCurveTo(R * 0.5, R * 0.7, R * 0.78, R * 0.5);
  }
  ctx.stroke();
  if (!pose.dizzy) {
    ctx.beginPath();
    ctx.moveTo(R * 0.74, R * 0.47);
    ctx.lineTo(R * 0.8, R * 0.53);
    ctx.stroke();
  }
  ctx.restore();
}

/** Over-ear headphones resting around the neck. */
function drawHeadphones(ctx: Ctx, h: Point, b: Build): void {
  const R = b.headR;
  const y = h.y + R * 0.95;
  ctx.strokeStyle = C.phones;
  ctx.lineWidth = R * 0.16;
  ctx.beginPath();
  ctx.ellipse(h.x + R * 0.05, y, R * 0.62, R * 0.2, 0, 0.1, Math.PI - 0.1);
  ctx.stroke();
  // Far cup peeking behind, near cup in front.
  for (const [cx, near] of [
    [h.x - R * 0.48, false],
    [h.x + R * 0.58, true],
  ] as const) {
    roundRect(ctx, cx - R * 0.2, y - R * 0.22, R * 0.4, R * 0.5, R * 0.16);
    fillStroke(ctx, linear(ctx, cx - R * 0.2, 0, cx + R * 0.2, 0, [
      [0, near ? C.phonesLight : "#2a2a32"],
      [1, C.phones],
    ]), OUTLINE, LINE * 0.8);
    if (near) {
      ellipse(ctx, cx - R * 0.02, y + R * 0.02, R * 0.08, R * 0.13);
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fill();
    }
  }
}

/** A red bandana tucked into the back pocket, hanging under the hoodie's hem and flapping with motion. */
function drawBandana(ctx: Ctx, pocket: Point, b: Build, pose: HeroPose): void {
  const r = b.limbR;
  const len = r * (3.4 + pose.bandanaLift * 1.4);
  const steps = 6;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(pose.bandanaPhase - t * 3.4) * r * 0.55 * t;
    pts.push({
      x: pocket.x - t * len * (0.12 + pose.bandanaLift * 0.8) + wave * pose.bandanaLift,
      y: pocket.y + t * len * (1 - pose.bandanaLift * 0.7) + wave * (1 - pose.bandanaLift),
    });
  }
  // A folded cloth that narrows to its loose corner.
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x - r * 1.1, pts[0]!.y);
  for (let i = 1; i <= steps; i++) ctx.lineTo(pts[i]!.x - r * 1.1 * (1 - i / (steps + 1)), pts[i]!.y);
  for (let i = steps; i >= 0; i--) ctx.lineTo(pts[i]!.x + r * 1.1 * (1 - i / (steps + 1)), pts[i]!.y + i * 0.1);
  ctx.closePath();
  fillStroke(ctx, linear(ctx, pocket.x, pocket.y, pts[steps]!.x, pts[steps]!.y, [
    [0, C.bandanaDark],
    [0.3, C.bandana],
    [1, C.bandanaLight],
  ]), OUTLINE, LINE * 0.9);
  // Paisley-style flecks.
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  for (let i = 1; i < steps; i++) {
    const p = pts[i]!;
    ellipse(ctx, p.x + (i % 2 ? 0.35 : -0.35) * r, p.y, r * 0.17, r * 0.11, i);
    ctx.fill();
  }
}
