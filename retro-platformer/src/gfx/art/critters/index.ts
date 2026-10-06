import type { ThemeName } from "../../../world/level";
import { drawAlleyCat } from "./alleyCat";
import { drawCone } from "./cone";
import { drawGroundhog } from "./groundhog";
import { drawHardHat } from "./hardHat";
import { drawJunkyardDog } from "./junkyardDog";
import { drawPossum } from "./possum";
import { drawRaccoon } from "./raccoon";
import { drawRat } from "./rat";
import { drawSpider } from "./spider";
import { drawSquirrel } from "./squirrel";
import type { ShellSkin, WalkerSkin } from "./types";

export type { ShellSkin, ShellState, WalkerSkin } from "./types";

export const WALKER_SKINS = {
  rat: { name: "Street rat", draw: drawRat },
  alleyCat: { name: "Alley cat", draw: drawAlleyCat },
  cone: { name: "Cone creature", draw: drawCone },
  groundhog: { name: "Groundhog", draw: drawGroundhog },
  squirrel: { name: "Evil squirrel", draw: drawSquirrel },
  junkyardDog: { name: "Junkyard dog", draw: drawJunkyardDog },
  spider: { name: "Rebar spider", draw: drawSpider },
} as const satisfies Record<string, WalkerSkin>;

export const SHELL_SKINS = {
  hardHat: { name: "Hard-hat critter", draw: drawHardHat },
  raccoon: { name: "Trash-can raccoon", draw: drawRaccoon },
  possum: { name: "Possum", draw: drawPossum },
} as const satisfies Record<string, ShellSkin>;

export interface Roster {
  readonly walkers: readonly WalkerSkin[];
  readonly shells: readonly ShellSkin[];
}

const W = WALKER_SKINS;
const S = SHELL_SKINS;

/** Who lives where. Some critters cross over between neighbouring themes. */
export const ROSTERS: Readonly<Record<ThemeName, Roster>> = {
  street: { walkers: [W.rat, W.alleyCat, W.cone], shells: [S.raccoon] },
  park: { walkers: [W.groundhog, W.squirrel, W.rat], shells: [S.possum] },
  construction: { walkers: [W.junkyardDog, W.cone, W.spider], shells: [S.hardHat] },
  downtown: { walkers: [W.alleyCat, W.rat, W.spider], shells: [S.hardHat, S.raccoon] },
};

/** The skin for the `variant`-th enemy of its kind in a level: the roster in turn, so neighbours differ. */
export function pick<T>(skins: readonly T[], variant: number): T {
  return skins[((variant % skins.length) + skins.length) % skins.length]!;
}
