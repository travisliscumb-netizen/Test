import { parseLevel, type LevelData } from "../world/level";
import level1 from "./level-1.txt?raw";
import level2 from "./level-2.txt?raw";
import level3 from "./level-3.txt?raw";
import level4 from "./level-4.txt?raw";

/** Level files in play order. */
export const LEVEL_SOURCES: readonly (readonly [name: string, text: string])[] = [
  ["level-1", level1],
  ["level-2", level2],
  ["level-3", level3],
  ["level-4", level4],
];

export function loadLevels(): LevelData[] {
  return LEVEL_SOURCES.map(([name, text]) => parseLevel(text, name));
}
