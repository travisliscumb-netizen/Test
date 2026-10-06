import type { ThemeName } from "../../world/level";
import { cavernBackdrop } from "./cavern";
import { duskBackdrop } from "./dusk";
import { fortressBackdrop } from "./fortress";
import { meadowBackdrop } from "./meadow";
import type { Backdrop } from "./types";

export const BACKDROPS: Readonly<Record<ThemeName, () => Backdrop>> = {
  meadow: meadowBackdrop,
  cavern: cavernBackdrop,
  dusk: duskBackdrop,
  fortress: fortressBackdrop,
};
