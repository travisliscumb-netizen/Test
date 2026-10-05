import { bakeImage } from "../src/gfx/bake";
import type { SpriteSheet } from "../src/gfx/palette";
import { buildHeroSmall } from "../src/gfx/sprites/heroSmall";
import { buildHeroBig } from "../src/gfx/sprites/heroBig";
import { buildGround } from "../src/gfx/sprites/tiles/ground";
import { buildBrick } from "../src/gfx/sprites/tiles/brick";
import { buildStone } from "../src/gfx/sprites/tiles/stone";
import { buildPipe } from "../src/gfx/sprites/tiles/pipe";
import { buildBlocks } from "../src/gfx/sprites/tiles/blocks";
import { buildCoin } from "../src/gfx/sprites/coin";
import { buildBrickDebris } from "../src/gfx/sprites/tiles/brick";
import { buildGrub } from "../src/gfx/sprites/grub";
import { buildShellback } from "../src/gfx/sprites/shellback";
import { buildSprout } from "../src/gfx/sprites/sprout";
import { buildFlag } from "../src/gfx/sprites/flag";
import { buildGoalTower } from "../src/gfx/sprites/goalTower";
import { buildHudIcons } from "../src/gfx/sprites/hudIcons";
import { THEME_COLORS } from "../src/gfx/themes";
import { THEMES } from "../src/world/level";

const SCALE = 4;
const root = document.getElementById("root")!;

function section(title: string, sheet: SpriteSheet, palette: readonly string[] = sheet.palette): void {
  const h = document.createElement("h3");
  h.textContent = title;
  h.style.margin = "8px";
  root.append(h);
  const row = document.createElement("div");
  row.className = "row";
  for (const [name, img] of Object.entries(sheet.frames)) {
    const fig = document.createElement("figure");
    const src = bakeImage(img, palette);
    const c = document.createElement("canvas");
    c.width = img.width * SCALE;
    c.height = img.height * SCALE;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const cap = document.createElement("figcaption");
    cap.textContent = name;
    fig.append(c, cap);
    row.append(fig);
  }
  root.append(row);
}

section("Hero (small)", buildHeroSmall());
section("Hero (big)", buildHeroBig());
section("Grub", buildGrub());
section("Shellback", buildShellback());
section("Sprout", buildSprout());
section("Flag", buildFlag());
section("Goal", buildGoalTower());
section("HUD", buildHudIcons());
section("Debris", { palette: THEME_COLORS.meadow.brick, frames: buildBrickDebris() });
section("Blocks", buildBlocks());
section("Coin", buildCoin());
for (const theme of THEMES) {
  const t = THEME_COLORS[theme];
  section(`${theme}: ground`, { palette: t.ground, frames: buildGround() });
  const pipe = buildPipe();
  section(`${theme}: brick / stone / pipe`, { palette: t.brick, frames: { brick: buildBrick() } });
  section("", { palette: t.stone, frames: { stone: buildStone() } });
  section("", { palette: t.pipe, frames: pipe });
}
document.body.dataset.ready = "1";
