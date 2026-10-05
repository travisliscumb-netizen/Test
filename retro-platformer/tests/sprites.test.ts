import { describe, expect, it } from "vitest";
import { maxIndex, type IndexedImage } from "../src/gfx/indexed";
import type { SpriteSheet } from "../src/gfx/palette";
import { BACKGROUNDS } from "../src/gfx/backgrounds";
import { buildCoin } from "../src/gfx/sprites/coin";
import { buildFlag } from "../src/gfx/sprites/flag";
import { FONT_CHARS, GLYPH_H, GLYPH_W, glyph } from "../src/gfx/sprites/font";
import { GOAL_HEIGHT, GOAL_WIDTH, buildGoalTower } from "../src/gfx/sprites/goalTower";
import { buildGrub } from "../src/gfx/sprites/grub";
import { buildHeroBig } from "../src/gfx/sprites/heroBig";
import { buildHeroSmall } from "../src/gfx/sprites/heroSmall";
import { buildHudIcons } from "../src/gfx/sprites/hudIcons";
import { buildShellback } from "../src/gfx/sprites/shellback";
import { buildSprout } from "../src/gfx/sprites/sprout";
import { buildBlocks } from "../src/gfx/sprites/tiles/blocks";
import { buildBrick, buildBrickDebris } from "../src/gfx/sprites/tiles/brick";
import { GROUND_VARIANTS, buildGround } from "../src/gfx/sprites/tiles/ground";
import { buildPipe } from "../src/gfx/sprites/tiles/pipe";
import { buildStone } from "../src/gfx/sprites/tiles/stone";
import { THEME_COLORS } from "../src/gfx/themes";
import { THEMES } from "../src/world/level";
import { PLAYER } from "../src/tuning";

function opaque(img: IndexedImage): number {
  return img.pixels.reduce((n, p) => n + (p ? 1 : 0), 0);
}

function checkSheet(sheet: SpriteSheet, w: number, h: number | ((name: string) => number)): void {
  for (const [name, img] of Object.entries(sheet.frames)) {
    expect(img.width, name).toBe(w);
    expect(img.height, name).toBe(typeof h === "number" ? h : h(name));
    expect(maxIndex(img), name).toBeLessThan(sheet.palette.length);
    expect(opaque(img), name).toBeGreaterThan(0);
  }
  for (const c of sheet.palette.slice(1)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
}

describe("character sprites", () => {
  it("hero frames: small 32×32 and big 32×48 with every animation", () => {
    const small = buildHeroSmall();
    const big = buildHeroBig();
    checkSheet(small, 32, 32);
    checkSheet(big, 32, 48);
    for (const pose of ["idle", "run0", "run1", "run2", "run3", "jump", "skid", "pole"]) {
      expect(small.frames).toHaveProperty(pose);
      expect(big.frames).toHaveProperty(pose);
    }
    expect(small.frames).toHaveProperty("dead0");
    expect(small.frames).toHaveProperty("dead1");
  });

  it("hero art is at least as tall as its hitbox", () => {
    expect(buildHeroSmall().frames.idle.height).toBeGreaterThanOrEqual(PLAYER.small.height);
    expect(buildHeroBig().frames.idle.height).toBeGreaterThanOrEqual(PLAYER.big.height);
  });

  it("run frames are all distinct", () => {
    const f = buildHeroBig().frames;
    const keys = [f.run0, f.run1, f.run2, f.run3].map((img) => img.pixels.join(","));
    expect(new Set(keys).size).toBe(4);
  });

  it("enemies and items", () => {
    checkSheet(buildGrub(), 32, 32);
    checkSheet(buildShellback(), 32, (name) => (name.startsWith("walk") ? 40 : 32));
    checkSheet(buildSprout(), 32, 32);
    checkSheet(buildCoin(), 32, 32);
    checkSheet(buildHudIcons(), 9, 9);
  });

  it("goal pieces", () => {
    checkSheet(buildFlag(), 32, (name) => (name.startsWith("pennant") ? 28 : 32));
    checkSheet(buildGoalTower(), GOAL_WIDTH, GOAL_HEIGHT);
  });
});

describe("tiles", () => {
  it("fixed-palette blocks are 32×32", () => {
    checkSheet(buildBlocks(), 32, 32);
  });

  it.each(THEMES)("themable tiles fit the %s palettes", (theme) => {
    const t = THEME_COLORS[theme];
    const ground = buildGround();
    expect(Object.keys(ground).sort()).toEqual([...GROUND_VARIANTS].sort());
    checkSheet({ palette: t.ground, frames: ground }, 32, 32);
    checkSheet({ palette: t.brick, frames: { brick: buildBrick() } }, 32, 32);
    checkSheet({ palette: t.brick, frames: buildBrickDebris() }, 12, 12);
    checkSheet({ palette: t.stone, frames: { stone: buildStone() } }, 32, 32);
    checkSheet({ palette: t.pipe, frames: buildPipe() }, 32, 32);
  });

  it("ground tiles are fully opaque so no sky shows through", () => {
    for (const img of Object.values(buildGround())) expect(opaque(img)).toBe(32 * 32);
  });
});

describe("backgrounds", () => {
  it.each(THEMES)("%s layers are valid and tile horizontally", (theme) => {
    const bg = BACKGROUNDS[theme]();
    expect(bg.skyBands.length).toBeGreaterThan(3);
    expect(bg.layers.length).toBeGreaterThanOrEqual(2);
    for (const layer of bg.layers) {
      expect(maxIndex(layer.image)).toBeLessThan(layer.palette.length);
      expect(layer.factor).toBeGreaterThanOrEqual(0);
      expect(layer.factor).toBeLessThan(1);
      // Seamless wrap: the leftmost and rightmost columns match for most rows.
      const { width, height, pixels } = layer.image;
      let same = 0;
      for (let y = 0; y < height; y++) if (pixels[y * width] === pixels[y * width + width - 1]) same++;
      expect(same / height).toBeGreaterThan(0.85);
    }
  });
});

describe("font", () => {
  it("every glyph is 5×7 and uses only ink and blank", () => {
    for (const ch of FONT_CHARS) {
      const g = glyph(ch);
      expect(g).toHaveLength(GLYPH_H);
      for (const row of g) expect(row).toMatch(new RegExp(`^[#.]{${GLYPH_W}}$`));
    }
  });

  it("covers everything the game prints", () => {
    const strings = ["SCORE", "COINS", "LEVEL", "TIME", "PAUSED", "GAME OVER", "SPROUT QUEST", "THANK YOU FOR PLAYING!", "0123456789", "×", "/", ":", "1UP"];
    for (const s of strings) for (const ch of s) expect(FONT_CHARS).toContain(ch.toUpperCase());
  });
});
