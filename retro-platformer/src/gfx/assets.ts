import { bakeFacing, bakeImage, bakeSheet, type Baked, type Canvas, type Facing } from "./bake";
import { BACKGROUNDS } from "./backgrounds";
import { buildCoin, type CoinFrame } from "./sprites/coin";
import { buildFlag, type FlagFrame } from "./sprites/flag";
import { buildGoalTower, type GoalFrame } from "./sprites/goalTower";
import { buildGrub, type GrubFrame } from "./sprites/grub";
import { buildHeroBig, type HeroBigFrame } from "./sprites/heroBig";
import { buildHeroSmall, type HeroSmallFrame } from "./sprites/heroSmall";
import { buildHudIcons, type HudIcon } from "./sprites/hudIcons";
import { buildShellback, type ShellbackFrame } from "./sprites/shellback";
import { buildSprout, type SproutFrame } from "./sprites/sprout";
import { buildBlocks, type BlockFrame } from "./sprites/tiles/blocks";
import { buildBrick, buildBrickDebris } from "./sprites/tiles/brick";
import { buildGround, type GroundVariant } from "./sprites/tiles/ground";
import { buildPipe, type PipePiece } from "./sprites/tiles/pipe";
import { buildStone } from "./sprites/tiles/stone";
import { THEME_COLORS } from "./themes";
import { THEMES, type ThemeName } from "../world/level";

export interface ThemeAssets {
  readonly ground: Baked<GroundVariant>;
  readonly brick: Canvas;
  readonly debris: Baked<"debris0" | "debris1">;
  readonly stone: Canvas;
  readonly pipe: Baked<PipePiece>;
  readonly sky: readonly string[];
  readonly layers: readonly { canvas: Canvas; factor: number; y: number; drift: number }[];
}

export interface Assets {
  readonly heroSmall: Facing<HeroSmallFrame>;
  readonly heroBig: Facing<HeroBigFrame>;
  readonly grub: Facing<GrubFrame>;
  readonly shellback: Facing<ShellbackFrame>;
  readonly sprout: Baked<SproutFrame>;
  readonly coin: Baked<CoinFrame>;
  readonly blocks: Baked<BlockFrame>;
  readonly flag: Baked<FlagFrame>;
  readonly goal: Baked<GoalFrame>;
  readonly hud: Baked<HudIcon>;
  readonly themes: Readonly<Record<ThemeName, ThemeAssets>>;
}

/** Pre-renders every sprite, tile and background layer to offscreen canvases. */
export function bakeAssets(): Assets {
  const ground = buildGround();
  const brick = buildBrick();
  const debris = buildBrickDebris();
  const stone = buildStone();
  const pipe = buildPipe();
  const themes = {} as Record<ThemeName, ThemeAssets>;
  for (const theme of THEMES) {
    const colors = THEME_COLORS[theme];
    const bg = BACKGROUNDS[theme]();
    themes[theme] = {
      ground: bakeSheet({ palette: colors.ground, frames: ground }),
      brick: bakeImage(brick, colors.brick),
      debris: bakeSheet({ palette: colors.brick, frames: debris }),
      stone: bakeImage(stone, colors.stone),
      pipe: bakeSheet({ palette: colors.pipe, frames: pipe }),
      sky: bg.skyBands,
      layers: bg.layers.map((l) => ({ canvas: bakeImage(l.image, l.palette), factor: l.factor, y: l.y, drift: l.drift ?? 0 })),
    };
  }
  return {
    heroSmall: bakeFacing(buildHeroSmall()),
    heroBig: bakeFacing(buildHeroBig()),
    grub: bakeFacing(buildGrub()),
    shellback: bakeFacing(buildShellback()),
    sprout: bakeSheet(buildSprout()),
    coin: bakeSheet(buildCoin()),
    blocks: bakeSheet(buildBlocks()),
    flag: bakeSheet(buildFlag()),
    goal: bakeSheet(buildGoalTower()),
    hud: bakeSheet(buildHudIcons()),
    themes,
  };
}

