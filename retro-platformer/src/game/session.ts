import type { Form } from "../entities/player";
import { RULES } from "../tuning";

/** Everything that persists across levels and lives. */
export interface Session {
  score: number;
  coins: number;
  lives: number;
  levelIndex: number;
  /** Index into the current level's checkpoints reached so far, or -1. */
  checkpoint: number;
  /** The hero's form carries over between levels (but not deaths). */
  form: Form;
  /** God mode (the title screen's hidden block): no damage, no death; pits put the hero back on solid ground. */
  god: boolean;
}

export function newSession(god = false): Session {
  return { score: 0, coins: 0, lives: RULES.startLives, levelIndex: 0, checkpoint: -1, form: "small", god };
}
