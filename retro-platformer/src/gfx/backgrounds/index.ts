import type { ThemeName } from "../../world/level";
import { buildCavern } from "./cavern";
import { buildDusk } from "./dusk";
import { buildFortress } from "./fortress";
import type { Background } from "./layers";
import { buildMeadow } from "./meadow";

export const BACKGROUNDS: Readonly<Record<ThemeName, () => Background>> = {
  meadow: buildMeadow,
  cavern: buildCavern,
  dusk: buildDusk,
  fortress: buildFortress,
};
