import { PixelCanvas, seededRandom, type IndexedImage } from "../indexed";
import { INK, RAMP, type SpriteSheet } from "../palette";
import { GOAL } from "../../tuning";

/**
 * The goal: a round stone garden tower the hero walks into. 128×192 (4×6
 * tiles), anchored by its bottom-left corner. The doorway is centred.
 */
export type GoalFrame = "tower";

export const GOAL_WIDTH = 128;
export const GOAL_HEIGHT = 192;
const GOAL_DOOR_CENTER = GOAL.doorOffset;

const PALETTE = [
  "transparent",
  INK, // 1
  RAMP.steel[0], // 2
  RAMP.steel[1], // 3
  RAMP.steel[2], // 4
  RAMP.steel[3], // 5
  RAMP.ember[0], // 6
  RAMP.ember[1], // 7
  RAMP.ember[2], // 8
  RAMP.boot[0], // 9
  RAMP.boot[1], // 10
  RAMP.boot[2], // 11
  RAMP.gold[3], // 12
  RAMP.gold[4], // 13
  RAMP.leaf[1], // 14
  RAMP.leaf[2], // 15
] as const;

function tower(): IndexedImage {
  const pc = new PixelCanvas(GOAL_WIDTH, GOAL_HEIGHT);
  const rnd = seededRandom(5);
  const wallTop = 72;
  // Walls: rounded tower, shaded as a cylinder.
  for (let x = 14; x < 114; x++) {
    const t = (x - 14) / 100;
    const shade = t < 0.12 ? 2 : t < 0.35 ? 4 : t < 0.5 ? 5 : t < 0.8 ? 4 : t < 0.92 ? 3 : 2;
    pc.vline(x, wallTop, GOAL_HEIGHT - 2, shade);
  }
  // Masonry courses.
  for (let y = wallTop + 10; y < GOAL_HEIGHT - 2; y += 10) {
    pc.hline(16, 111, y, 3);
    const offset = (y / 10) % 2 === 0 ? 0 : 10;
    for (let x = 16 + offset; x < 112; x += 20) pc.vline(x, y - 9, y - 1, 3);
  }
  for (let i = 0; i < 40; i++) pc.set(16 + Math.floor(rnd() * 96), wallTop + Math.floor(rnd() * 110), 3);
  // Ivy climbing the left side.
  for (let i = 0; i < 26; i++) {
    const y = GOAL_HEIGHT - 6 - i * 4;
    const x = 18 + Math.round(Math.sin(i * 0.9) * 4);
    pc.ellipse(x, y, 6, 4, i % 3 === 0 ? 14 : 15);
  }
  // Conical roof with a gold finial.
  pc.polygon([6, wallTop + 2, 64, 6, 122, wallTop + 2], 7);
  pc.polygon([64, 6, 122, wallTop + 2, 84, wallTop + 2], 6);
  pc.polygon([64, 6, 40, wallTop + 2, 52, wallTop + 2], 8);
  for (let y = 18; y < wallTop; y += 9) {
    const half = ((y - 6) / (wallTop - 4)) * 58;
    pc.hline(Math.round(64 - half), Math.round(64 + half), y, 6);
  }
  pc.rect(6, wallTop, 116, 4, 6);
  pc.ellipse(59, 0, 10, 10, 12);
  pc.set(62, 2, 13);
  // Round window with warm light.
  pc.ellipse(52, 88, 24, 24, 1);
  pc.ellipse(54, 90, 20, 20, 12);
  pc.ellipse(57, 92, 8, 8, 13);
  pc.vline(64, 90, 109, 9);
  pc.hline(54, 73, 100, 9);
  // Arched wooden door at the bottom centre.
  const doorL = GOAL_DOOR_CENTER - 18;
  pc.rect(doorL - 3, 136, 42, GOAL_HEIGHT - 136, 1);
  pc.ellipse(doorL - 3, 122, 42, 30, 1);
  pc.rect(doorL, 140, 36, GOAL_HEIGHT - 140, 10);
  pc.ellipse(doorL, 125, 36, 26, 10);
  for (const px of [doorL + 8, doorL + 17, doorL + 26]) pc.vline(px, 128, GOAL_HEIGHT - 1, 9);
  pc.vline(doorL + 2, 134, GOAL_HEIGHT - 1, 11);
  pc.rect(doorL + 29, 162, 3, 3, 12);
  pc.outline(1);
  return pc.toImage();
}

export function buildGoalTower(): SpriteSheet<GoalFrame> {
  return { palette: PALETTE, frames: { tower: tower() } };
}
