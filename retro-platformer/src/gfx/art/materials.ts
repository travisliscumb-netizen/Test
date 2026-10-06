import type { ThemeName } from "../../world/level";

/** Three tones of one material: shadow, base, light. */
export type Tone = readonly [dark: string, mid: string, light: string];

export interface Material {
  /** What fills the ground below its surface. */
  readonly soil: Tone;
  /** The surface layer on top of ground. */
  readonly top: Tone;
  readonly topKind: "sidewalk" | "grass" | "gravel" | "slab";
  /** Pebbles and aggregate embedded in the ground. */
  readonly pebble: Tone;
  readonly brick: Tone;
  readonly mortar: string;
  /** Unbreakable blocks (stairs and walls). */
  readonly stone: Tone;
  readonly pipe: Tone;
  /** Accent colour for the level intro card. */
  readonly accent: string;
}

export const MATERIALS: Readonly<Record<ThemeName, Material>> = {
  street: {
    soil: ["#26262e", "#3a3a44", "#56566a"],
    top: ["#8a8c94", "#b6b8c0", "#e6e8ee"],
    topKind: "sidewalk",
    pebble: ["#4a4a54", "#7a7a86", "#b4b4c0"],
    brick: ["#7a2a18", "#b44a2a", "#e8805a"],
    mortar: "#d8ccb8",
    stone: ["#64666e", "#9a9ca6", "#d2d4dc"],
    pipe: ["#26303e", "#4e5e74", "#a8b8cc"],
    accent: "#ffd24a",
  },
  park: {
    soil: ["#5a3018", "#8a5230", "#b47a48"],
    top: ["#2a7a34", "#4cae46", "#9ee672"],
    topKind: "grass",
    pebble: ["#6c5a4c", "#a08a76", "#d8c6b0"],
    brick: ["#4a4c3a", "#7a7c5e", "#b0b08a"],
    mortar: "#2e3024",
    stone: ["#6a5848", "#a48a72", "#dcc4a6"],
    pipe: ["#0e4a44", "#23927e", "#7ae8c8"],
    accent: "#86dd6c",
  },
  construction: {
    soil: ["#4a3018", "#7a5230", "#a8784a"],
    top: ["#6a5a48", "#9a8670", "#cab69c"],
    topKind: "gravel",
    pebble: ["#5a5a5e", "#8c8c92", "#c8c8ce"],
    brick: ["#55565c", "#86888e", "#bcbec4"],
    mortar: "#34363c",
    stone: ["#8a6a10", "#d0a01a", "#ffd65a"],
    pipe: ["#6a2a08", "#d0661a", "#ffb06a"],
    accent: "#ffa62a",
  },
  downtown: {
    soil: ["#1e1c26", "#34303e", "#4e4a5a"],
    top: ["#3a3a48", "#5c5c6e", "#9a9ab0"],
    topKind: "slab",
    pebble: ["#2c2a34", "#4e4a5a", "#8a8498"],
    brick: ["#3a1e22", "#6a3036", "#a85a5a"],
    mortar: "#1a1418",
    stone: ["#2a3448", "#4a5a7a", "#8aa0c8"],
    pipe: ["#28303c", "#5a6a80", "#c8d8ec"],
    accent: "#c86cff",
  },
};
