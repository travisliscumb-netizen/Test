import type { ThemeName } from "../../world/level";
import { constructionBackdrop } from "./construction";
import { downtownBackdrop } from "./downtown";
import { parkBackdrop } from "./park";
import { streetBackdrop } from "./street";
import type { Backdrop } from "./types";

export const BACKDROPS: Readonly<Record<ThemeName, () => Backdrop>> = {
  street: streetBackdrop,
  park: parkBackdrop,
  construction: constructionBackdrop,
  downtown: downtownBackdrop,
};
