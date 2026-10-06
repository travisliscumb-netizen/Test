/* The "Drew edition" back-wall message. Only active in the build made with
   `npm run single -- --drew`, which sets window.__DREW__. */

export const MESSAGE = ['DREW', 'SUCKS'];

/* Opacity of the message on the well's back wall for a level: invisible on
   level 1, only just perceptible on level 2 (the wall is near-black, so even
   a little shows), fully solid by level 20. The steep ease keeps the early
   levels subtle and saves most of the reveal for the last few. */
export function messageAlpha(level) {
  if (level <= 1) return 0;
  if (level >= 20) return 1;
  return 0.025 + 0.975 * Math.pow((level - 2) / 18, 2.2);
}
