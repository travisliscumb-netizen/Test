/** Sound effects the simulation can request. */
export const SFX = [
  "jump",
  "jumpBig",
  "coin",
  "bump",
  "break",
  "stomp",
  "kick",
  "sproutAppear",
  "grow",
  "shrink",
  "oneUp",
  "flagSlide",
  "tally",
  "hurry",
  "pause",
] as const;
export type Sfx = (typeof SFX)[number];

export const SONGS = ["title", "street", "park", "construction", "downtown", "clear", "death", "gameOver", "ending"] as const;
export type Song = (typeof SONGS)[number];

export type GameEvent =
  | { type: "sfx"; id: Sfx }
  | { type: "music"; song: Song | null }
  /** Music playback speed multiplier (the hurry-up warning speeds the music up). */
  | { type: "tempo"; scale: number }
  /** Pause or resume all audio. */
  | { type: "pause"; paused: boolean };
