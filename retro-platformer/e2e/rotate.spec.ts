import { expect, test, type Page } from "@playwright/test";
import { buildUrl, snapshot, trackErrors, waitForMode } from "./helpers";

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

/** Colour of the on-screen canvas at a CSS position. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([cx, cy]) => {
      const c = document.getElementById("screen") as HTMLCanvasElement;
      const k = c.width / window.innerWidth;
      return [...c.getContext("2d")!.getImageData(Math.round(cx! * k), Math.round(cy! * k), 1, 1).data];
    },
    [x, y],
  );
}

test("turning the phone sideways mid-game shows more of the level and fills the screen", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__budsTakeover !== undefined);
  await expect(page.locator("#rotate-hint")).toBeVisible();
  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  const upright = await snapshot(page);

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(300);
  const sideways = await snapshot(page);

  expect(sideways.viewWidth).toBeGreaterThan(upright.viewWidth * 1.9);
  expect(sideways.mode).toBe("play");
  expect(sideways.player!.x).toBeGreaterThanOrEqual(upright.player!.x);
  await expect(page.locator("#rotate-hint")).toBeHidden();
  // Both edges are game, not letterbox black.
  for (const x of [1, 851]) expect((await pixel(page, x, 200)).slice(0, 3)).not.toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
});
