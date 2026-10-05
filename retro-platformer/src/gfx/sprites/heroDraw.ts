import { PixelCanvas, type IndexedImage } from "../indexed";
import { INK, RAMP, WHITE } from "../palette";

/** Palette shared by both hero forms. */
export const HERO_PALETTE: readonly string[] = [
  "transparent",
  INK, // 1 outline / pupils
  RAMP.skin[0], // 2
  RAMP.skin[1], // 3
  RAMP.skin[2], // 4
  RAMP.leaf[0], // 5
  RAMP.leaf[1], // 6
  RAMP.leaf[2], // 7
  RAMP.leaf[3], // 8
  RAMP.scarf[0], // 9
  RAMP.scarf[1], // 10
  RAMP.scarf[2], // 11
  RAMP.denim[0], // 12
  RAMP.denim[1], // 13
  RAMP.denim[2], // 14
  RAMP.boot[0], // 15
  RAMP.boot[1], // 16
  WHITE, // 17
  RAMP.leaf[4], // 18
  RAMP.gold[3], // 19
];

const C = {
  ink: 1,
  skinD: 2,
  skin: 3,
  skinL: 4,
  leafD: 5,
  leaf: 6,
  leafL: 7,
  leafH: 8,
  scarfD: 9,
  scarf: 10,
  scarfL: 11,
  denimD: 12,
  denim: 13,
  denimL: 14,
  bootD: 15,
  boot: 16,
  white: 17,
  leafX: 18,
  gold: 19,
} as const;

/** Body proportions for one form. All y values are rows inside the frame. */
export interface HeroBuild {
  readonly height: number;
  /** Top row of the hood. */
  readonly headY: number;
  readonly torsoTop: number;
  readonly hipY: number;
  /** Bottom row of the boots (the outline goes one row below). */
  readonly footY: number;
  readonly torsoW: number;
  readonly armLen: number;
}

/** A pose for a side-facing (right) frame. Offsets are in pixels. */
export interface SidePose {
  /** Foot x offsets from the hip, and how far each foot is lifted. */
  readonly frontFoot: number;
  readonly backFoot: number;
  readonly frontLift: number;
  readonly backLift: number;
  /** Vertical body offset (negative = up). */
  readonly bob: number;
  /** Hand position relative to the shoulder. */
  readonly handX: number;
  readonly handY: number;
  /** Scarf tail wave: 0 resting, 1..3 flapping phases. */
  readonly scarf: number;
  /** Horizontal lean of head and torso. */
  readonly lean?: number;
}

const CENTER = 16;

export function drawSide(build: HeroBuild, pose: SidePose): IndexedImage {
  const pc = new PixelCanvas(32, build.height);
  const lean = pose.lean ?? 0;
  const bob = pose.bob;
  const hip = build.hipY + bob;
  const torsoX = CENTER - Math.floor(build.torsoW / 2) + lean;

  // Back leg first so the front leg overlaps it.
  drawLeg(pc, build, CENTER - 2 + lean, hip, pose.backFoot, pose.backLift, true);

  // Back arm peeks out behind the torso.
  const shoulderY = build.torsoTop + bob + 2;
  drawArm(pc, CENTER - 3 + lean, shoulderY, -pose.handX - 1, pose.handY, build.armLen, true);

  drawTorso(pc, build, torsoX, build.torsoTop + bob, hip);

  drawLeg(pc, build, CENTER + 2 + lean, hip, pose.frontFoot, pose.frontLift, false);

  drawHead(pc, build.headY + bob, lean, pose.scarf);

  drawArm(pc, CENTER + 1 + lean, shoulderY, pose.handX, pose.handY, build.armLen, false);

  pc.outline(C.ink);
  return pc.toImage();
}

function drawLeg(pc: PixelCanvas, build: HeroBuild, hipX: number, hipY: number, footDx: number, lift: number, back: boolean): void {
  const footY = build.footY - lift;
  const footX = hipX + footDx;
  const legColor = back ? C.denimD : C.denim;
  // Leg as a 4px-wide stroke from hip to ankle.
  pc.line(hipX, hipY, footX, footY - 2, legColor, 4);
  // Boot: toe points forward (right).
  pc.rect(footX - 2, footY - 2, 6, 3, back ? C.bootD : C.boot);
  pc.hline(footX - 2, footX + 3, footY, C.bootD);
  if (!back) pc.set(footX + 2, footY - 2, C.scarfL);
}

function drawTorso(pc: PixelCanvas, build: HeroBuild, x: number, top: number, hip: number): void {
  const w = build.torsoW;
  const h = hip - top + 1;
  pc.rect(x, top, w, h, C.denim);
  pc.rect(x, top, 2, h, C.denimD);
  pc.vline(x + w - 2, top + 1, hip - 2, C.denimL);
  // Overall straps with buttons.
  pc.vline(x + 3, top, hip - 2, C.denimD);
  pc.vline(x + w - 4, top, hip - 2, C.denimD);
  pc.set(x + 3, top + 1, C.gold);
  pc.set(x + w - 4, top + 1, C.gold);
  // Belt and buckle.
  pc.hline(x, x + w - 1, hip - 1, C.boot);
  pc.rect(x + w - 5, hip - 2, 2, 2, C.gold);
  // Front pocket on the taller build.
  if (h >= 10) {
    pc.rect(x + 4, top + Math.floor(h / 2) - 1, w - 7, 3, C.denimD);
    pc.hline(x + 4, x + w - 4, top + Math.floor(h / 2) - 1, C.denimL);
  }
}

function drawArm(pc: PixelCanvas, sx: number, sy: number, hx: number, hy: number, len: number, back: boolean): void {
  const scale = len / 6;
  const ex = sx + Math.round(hx * scale);
  const ey = sy + Math.round(hy * scale);
  // Rolled sleeve at the shoulder, bare forearm, then the hand.
  const mx = Math.round(sx + (ex - sx) * 0.35);
  const my = Math.round(sy + (ey - sy) * 0.35);
  pc.line(sx, sy, ex, ey, back ? C.skinD : C.skin, 3);
  pc.line(sx, sy, mx, my, back ? C.denimD : C.denimL, 3);
  pc.rect(ex - 1, ey - 1, 3, 3, back ? C.skinD : C.skin);
  if (!back) pc.set(ex, ey - 1, C.skinL);
}

function drawHead(pc: PixelCanvas, top: number, lean: number, scarf: number): void {
  const x = 7 + lean;
  // Trailing hood tip, curling back like a leaf.
  pc.polygon([x + 3, top + 4, x - 4, top + 7, x - 3, top + 9, x + 3, top + 11], C.leafD);
  pc.set(x - 4, top + 7, C.leaf);
  // Hood.
  pc.ellipse(x, top, 19, 15, C.leaf);
  pc.ellipse(x, top + 6, 19, 9, C.leafD);
  pc.ellipse(x + 1, top, 16, 12, C.leaf);
  pc.ellipse(x + 5, top + 1, 10, 6, C.leafL);
  pc.ellipse(x + 8, top + 1, 5, 3, C.leafH);
  // Leaf vein down the middle of the hood.
  pc.line(x + 4, top + 2, x + 1, top + 9, C.leafD);
  // Sprout on top.
  pc.vline(x + 9, top - 3, top, C.leafD);
  pc.rect(x + 6, top - 4, 3, 2, C.leafL);
  pc.rect(x + 10, top - 5, 3, 2, C.leafX);
  pc.set(x + 6, top - 4, C.leafH);
  // Face in the hood opening.
  pc.ellipse(x + 8, top + 4, 11, 10, C.skin);
  pc.ellipse(x + 11, top + 4, 7, 7, C.skinL);
  pc.vline(x + 8, top + 6, top + 11, C.skinD);
  // Brim shadow across the forehead.
  pc.hline(x + 9, x + 17, top + 4, C.leafD);
  pc.hline(x + 10, x + 16, top + 5, C.skinD);
  // Eyes in three-quarter view: the far eye is narrower.
  pc.vline(x + 10, top + 7, top + 9, C.ink);
  pc.rect(x + 14, top + 7, 2, 3, C.ink);
  pc.set(x + 14, top + 7, C.white);
  // Rosy cheek and a small smile.
  pc.set(x + 16, top + 10, C.scarfL);
  pc.hline(x + 12, x + 14, top + 12, C.skinD);
  // Scarf wrapped at the neck.
  const neck = top + 14;
  pc.rect(x + 3, neck, 14, 3, C.scarf);
  pc.hline(x + 4, x + 16, neck, C.scarfL);
  pc.hline(x + 3, x + 16, neck + 2, C.scarfD);
  // Scarf tail streaming behind.
  const wave = [
    [0, 1, 2, 3],
    [-1, 0, 0, 1],
    [1, 0, -1, -1],
    [0, -1, 0, 1],
  ][scarf]!;
  const droop = scarf === 0 ? 3 : 0;
  for (let i = 0; i < 4; i++) {
    const tx = x + 2 - i * 2;
    const ty = neck + 1 + wave[i]! + (droop * i) / 2;
    pc.rect(tx - 1, Math.round(ty), 3, 2, i % 2 === 0 ? C.scarf : C.scarfL);
  }
}

/** Front-facing pose used for the death animation. `armsUp` alternates per frame. */
export function drawFront(build: HeroBuild, armsUp: boolean): IndexedImage {
  const pc = new PixelCanvas(32, build.height);
  const top = build.headY;
  const hip = build.hipY;
  // Legs splayed.
  pc.line(13, hip, 10, build.footY - 2, C.denim, 4);
  pc.line(19, hip, 22, build.footY - 2, C.denim, 4);
  pc.rect(7, build.footY - 2, 6, 3, C.boot);
  pc.rect(20, build.footY - 2, 6, 3, C.boot);
  // Torso.
  const tw = build.torsoW;
  pc.rect(CENTER - tw / 2, build.torsoTop, tw, hip - build.torsoTop + 1, C.denim);
  pc.vline(CENTER - tw / 2, build.torsoTop, hip, C.denimD);
  pc.hline(CENTER - tw / 2, CENTER + tw / 2 - 1, hip - 1, C.boot);
  // Arms flailing.
  const hy = armsUp ? -7 : -3;
  pc.line(CENTER - tw / 2, build.torsoTop + 2, 5, build.torsoTop + hy, C.denimL, 3);
  pc.line(CENTER + tw / 2 - 1, build.torsoTop + 2, 26, build.torsoTop + hy + (armsUp ? 3 : -3), C.denimL, 3);
  pc.rect(4, build.torsoTop + hy - 1, 3, 3, C.skin);
  pc.rect(25, build.torsoTop + hy + (armsUp ? 2 : -4), 3, 3, C.skin);
  // Hood, symmetric.
  pc.ellipse(6, top, 20, 15, C.leaf);
  pc.ellipse(6, top + 6, 20, 9, C.leafD);
  pc.ellipse(8, top, 16, 11, C.leaf);
  pc.ellipse(11, top + 1, 10, 5, C.leafL);
  pc.vline(15, top - 3, top, C.leafD);
  pc.rect(12, top - 4, 3, 2, C.leafL);
  pc.rect(16, top - 5, 3, 2, C.leafX);
  // Face with dizzy eyes.
  pc.ellipse(9, top + 4, 14, 10, C.skin);
  pc.hline(10, 21, top + 4, C.leafD);
  for (const ex of [12, 18]) {
    pc.set(ex - 1, top + 6, C.ink);
    pc.set(ex + 1, top + 6, C.ink);
    pc.set(ex, top + 7, C.ink);
    pc.set(ex - 1, top + 8, C.ink);
    pc.set(ex + 1, top + 8, C.ink);
  }
  pc.rect(14, top + 10, 4, 2, C.skinD);
  // Scarf.
  pc.rect(9, top + 14, 14, 3, C.scarf);
  pc.hline(9, 22, top + 14, C.scarfL);
  pc.outline(C.ink);
  return pc.toImage();
}
