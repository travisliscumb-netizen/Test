/**
 * The title screen's lone floating block. Tapping it toggles an undocumented
 * God mode. Its place depends only on the view width, so the renderer draws it
 * and the input code hit-tests it from the same numbers.
 */
export const GOD_BLOCK_SIZE = 32;
/** Extra reach around the block for a fingertip. */
const TOUCH_SLOP = 10;

export function godBlockRect(viewW: number): { x: number; y: number; size: number } {
  // Up in the empty sky to the left of the logo, clear of the on-screen buttons.
  return { x: Math.round(Math.max(40, viewW * 0.08)), y: 44, size: GOD_BLOCK_SIZE };
}

/** Whether the point (in logical view coordinates) is on the block. */
export function hitsGodBlock(viewW: number, x: number, y: number): boolean {
  const r = godBlockRect(viewW);
  return x >= r.x - TOUCH_SLOP && x <= r.x + r.size + TOUCH_SLOP && y >= r.y - TOUCH_SLOP && y <= r.y + r.size + TOUCH_SLOP;
}
