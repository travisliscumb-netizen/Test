import type { ThemeName } from "../world/level";
import { INK } from "./palette";

/**
 * Themable tiles are authored against a fixed slot layout so one image can be
 * recoloured per world:
 *
 *   1      outline
 *   2..5   primary ramp, dark → light
 *   6..9   secondary ramp, dark → light (grass, mortar, moss…)
 *   10     specular highlight
 */
export type TilePalette = readonly string[];

function tilePalette(primary: readonly string[], secondary: readonly string[], highlight: string, outline = INK): TilePalette {
  if (primary.length !== 4 || secondary.length !== 4) throw new Error("tilePalette: ramps must have 4 shades");
  return ["transparent", outline, ...primary, ...secondary, highlight];
}

export interface ThemeColors {
  readonly ground: TilePalette;
  readonly brick: TilePalette;
  readonly stone: TilePalette;
  readonly pipe: TilePalette;
  /** Solid fill behind the parallax layers' top edge and for the HUD's backdrop text shadow. */
  readonly skyTop: string;
  readonly skyBottom: string;
  /** Tint for the "level intro" card. */
  readonly accent: string;
}

export const THEME_COLORS: Readonly<Record<ThemeName, ThemeColors>> = {
  meadow: {
    ground: tilePalette(["#4a2614", "#7a4424", "#a8683a", "#cf9358"], ["#1f5a2a", "#33923d", "#5cc451", "#a7ec74"], "#e6ffb0"),
    brick: tilePalette(["#5c1f14", "#963822", "#c85a32", "#ec8a58"], ["#8b6a52", "#c4a27c", "#e6caa0", "#fbe6c4"], "#ffd9b0"),
    stone: tilePalette(["#4b3b33", "#7e6858", "#ad937c", "#d6bea4"], ["#5e4a3e", "#8f7663", "#bba088", "#e2ccb2"], "#fff0dc"),
    pipe: tilePalette(["#0c3a3a", "#1b6a62", "#2fa18f", "#62d6b8"], ["#0c3a3a", "#1b6a62", "#2fa18f", "#62d6b8"], "#c8fff0"),
    skyTop: "#5aa8f0",
    skyBottom: "#bfe6ff",
    accent: "#86dd6c",
  },
  cavern: {
    ground: tilePalette(["#1c2238", "#2f3a5a", "#48587e", "#6a7ea6"], ["#174a4a", "#1f7a70", "#3ab39a", "#7aead0"], "#c4fff2"),
    brick: tilePalette(["#1d2340", "#2f3d6a", "#4a5f98", "#7088c4"], ["#151a2c", "#232c48", "#36446a", "#4c5e8a"], "#a8c0f0"),
    stone: tilePalette(["#232a3e", "#3c4766", "#5c6a8e", "#8494b8"], ["#2a3248", "#424e6c", "#5f6d90", "#8090b4"], "#c6d4f4"),
    pipe: tilePalette(["#4a1e08", "#874016", "#c06a2a", "#eda25a"], ["#4a1e08", "#874016", "#c06a2a", "#eda25a"], "#ffe0b4"),
    skyTop: "#05060f",
    skyBottom: "#1a1d3a",
    accent: "#7aead0",
  },
  dusk: {
    ground: tilePalette(["#4a1a24", "#7a2e30", "#ad4c3e", "#d87a52"], ["#4b2363", "#7b3a8e", "#b45fb8", "#eba0de"], "#ffd6f2"),
    brick: tilePalette(["#3c1838", "#6a2a5a", "#9a4680", "#c870a8"], ["#7a5a6a", "#b08c9a", "#dcb8c2", "#f6dce2"], "#ffd0ea"),
    stone: tilePalette(["#4a2a2a", "#7c4a40", "#ab7258", "#d8a07a"], ["#5a3434", "#8a5848", "#b88064", "#e0ac88"], "#ffe2c4"),
    pipe: tilePalette(["#2a1648", "#4a2a7e", "#7046b4", "#a07ae6"], ["#2a1648", "#4a2a7e", "#7046b4", "#a07ae6"], "#e2d0ff"),
    skyTop: "#3a2368",
    skyBottom: "#ff9a62",
    accent: "#ffbe73",
  },
  fortress: {
    ground: tilePalette(["#1e1c22", "#36323c", "#524c5a", "#776f80"], ["#2a2830", "#46424e", "#68626e", "#948c98"], "#c8c0cc"),
    brick: tilePalette(["#2c2830", "#4a4452", "#6a6274", "#908698"], ["#15131a", "#211e28", "#2e2a36", "#3c3846"], "#c0b6c8"),
    stone: tilePalette(["#3a1a1e", "#62282c", "#8c3a3a", "#b85a50"], ["#401c20", "#6a2c30", "#923e3e", "#bc6054"], "#f0a090"),
    pipe: tilePalette(["#2a3038", "#4a5664", "#72849a", "#a8bcd2"], ["#2a3038", "#4a5664", "#72849a", "#a8bcd2"], "#e8f2ff"),
    skyTop: "#070914",
    skyBottom: "#2a2050",
    accent: "#f2603a",
  },
};
