import type { ThemeName } from "../../world/level";

/** Three tones of one material: shadow, base, light. */
export type Tone = readonly [dark: string, mid: string, light: string];

export interface Material {
  readonly soil: Tone;
  /** The surface layer on top of ground: grass, moss, flowery clay or a stone slab. */
  readonly top: Tone;
  readonly topKind: "grass" | "moss" | "blossom" | "slab";
  /** Pebbles embedded in the soil. */
  readonly pebble: Tone;
  readonly brick: Tone;
  readonly mortar: string;
  readonly stone: Tone;
  readonly pipe: Tone;
  /** Accent colour for the level intro card. */
  readonly accent: string;
}

export const MATERIALS: Readonly<Record<ThemeName, Material>> = {
  meadow: {
    soil: ["#5a3018", "#8a5230", "#b47a48"],
    top: ["#2a7a34", "#4cae46", "#9ee672"],
    topKind: "grass",
    pebble: ["#6c5a4c", "#a08a76", "#d8c6b0"],
    brick: ["#7a2a18", "#b44a2a", "#e8805a"],
    mortar: "#e2c8a2",
    stone: ["#6a5848", "#a48a72", "#dcc4a6"],
    pipe: ["#0e4a44", "#23927e", "#7ae8c8"],
    accent: "#86dd6c",
  },
  cavern: {
    soil: ["#1c2238", "#34405e", "#56668e"],
    top: ["#145a52", "#26a08a", "#7aeed4"],
    topKind: "moss",
    pebble: ["#2a3a5a", "#4c6a8e", "#9ac8e8"],
    brick: ["#1e2848", "#3a4e84", "#6c86c4"],
    mortar: "#141a2c",
    stone: ["#2a3248", "#4a5878", "#8494b8"],
    pipe: ["#5a2408", "#b05e22", "#ffb46a"],
    accent: "#7aead0",
  },
  dusk: {
    soil: ["#4a1a26", "#86343a", "#c0604a"],
    top: ["#5a2a72", "#a050b0", "#f2a6e6"],
    topKind: "blossom",
    pebble: ["#5a3040", "#906070", "#dca8b0"],
    brick: ["#4a1c46", "#86367a", "#c870a8"],
    mortar: "#e8c6d0",
    stone: ["#5a3432", "#9a624e", "#e0a682"],
    pipe: ["#2a1648", "#5a36a0", "#b896ff"],
    accent: "#ffbe73",
  },
  fortress: {
    soil: ["#1e1c24", "#3a3644", "#5c5668"],
    top: ["#3a3644", "#6a6476", "#a8a2b4"],
    topKind: "slab",
    pebble: ["#2c2a34", "#4e4a5a", "#8a8498"],
    brick: ["#2e2a36", "#524c5e", "#8a8298"],
    mortar: "#16141c",
    stone: ["#2e1a26", "#5a3048", "#946078"],
    pipe: ["#28303c", "#5a6a80", "#c8d8ec"],
    accent: "#f2603a",
  },
};
