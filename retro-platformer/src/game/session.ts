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
}

export function newSession(): Session {
  return { score: 0, coins: 0, lives: RULES.startLives, levelIndex: 0, checkpoint: -1, form: "small" };
}
