import type { IndexedImage } from "./indexed";

/**
 * Master colour ramps (dark → light). Sprite modules build their own small
 * palettes from these so the whole game shares one coherent look.
 */
export const INK = "#1b1424";
export const WHITE = "#fdf8ec";

export const RAMP = {
  skin: ["#7c3f2e", "#c47852", "#efb38a", "#ffdcbe"],
  leaf: ["#173d27", "#24693a", "#3fa34d", "#86dd6c", "#c9f59a"],
  scarf: ["#7e2418", "#c84a1e", "#f5803a", "#ffbe73"],
  denim: ["#1d2550", "#2e4285", "#4a6cc4", "#7fa3ef"],
  boot: ["#33190f", "#5e3520", "#8f5a33"],
  grub: ["#2e1640", "#5b2d82", "#8d52bd", "#c58ef0"],
  cream: ["#8a6a4a", "#d8b98c", "#f6e3bd"],
  shell: ["#5c2a0c", "#a85a14", "#e89a2a", "#ffd56a"],
  slug: ["#16404c", "#26727f", "#47aab3", "#9be6e6"],
  gold: ["#6a3e00", "#b47400", "#efb10c", "#ffe25a", "#fff6c2"],
  steel: ["#3a4152", "#6c7590", "#a7b0c8", "#e2e8f5"],
  ember: ["#7a1020", "#c22a2a", "#f2603a", "#ffb062"],
} as const;

/**
 * A set of frames plus the palette they are drawn with. palette[0] is a
 * placeholder for transparency and is never drawn.
 */
export interface SpriteSheet<K extends string = string> {
  readonly palette: readonly string[];
  readonly frames: Readonly<Record<K, IndexedImage>>;
}
