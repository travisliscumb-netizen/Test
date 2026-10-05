import type { Button } from "./input";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface TouchLayout {
  /** The directional pad. Left of centre = left, right of centre = right. */
  pad: Rect;
  jump: Circle;
  run: Circle;
  pause: Rect;
  mute: Rect;
}

/** Fraction of the pad's half-width around the centre that does nothing. */
export const PAD_DEAD_ZONE = 0.12;
/** Pushing past this fraction of the pad's half-width also holds run. */
export const PAD_RUN_ZONE = 0.78;
/** Buttons accept touches a little outside their drawn circle; where A and B zones overlap, both are held. */
export const BUTTON_REACH = 1.3;
/** The pad's live area extends this far beyond its drawn bounds (fraction of its height). */
const PAD_SLOP = 0.6;

const inRect = (r: Rect, x: number, y: number, slop = 0): boolean =>
  x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;

/** Which buttons a touch at (x, y) is holding. */
export function buttonsAt(x: number, y: number, layout: TouchLayout): Button[] {
  if (inRect(layout.pause, x, y, 8)) return ["start"];
  if (inRect(layout.mute, x, y, 8)) return ["mute"];

  const pad = layout.pad;
  if (inRect(pad, x, y, (pad.bottom - pad.top) * PAD_SLOP)) {
    const cx = (pad.left + pad.right) / 2;
    const half = (pad.right - pad.left) / 2;
    const d = (x - cx) / half;
    if (Math.abs(d) < PAD_DEAD_ZONE) return [];
    const out: Button[] = [d < 0 ? "left" : "right"];
    if (Math.abs(d) > PAD_RUN_ZONE) out.push("run");
    return out;
  }

  const out: Button[] = [];
  const near = (c: Circle): boolean => Math.hypot(x - c.cx, y - c.cy) <= c.r * BUTTON_REACH;
  if (near(layout.jump)) out.push("jump");
  if (near(layout.run)) out.push("run");
  return out;
}
