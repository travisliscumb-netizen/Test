import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { buildUrl, snapshot, trackErrors, waitForMode } from "./helpers";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
}

test("on-screen controls start the game and drive the hero (iPhone landscape)", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__budsTakeover !== undefined);
  await expect(page.locator("#touch")).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const jump = await centre(page, '[data-zone="jump"]');
  await touch(cdp, "touchStart", [{ ...jump, id: 1 }]);
  await touch(cdp, "touchEnd", []);
  await waitForMode(page, "play");
  const start = (await snapshot(page)).player!.x;

  // Hold the right half of the pad, then slide to its far edge to run, while tapping A with another finger.
  const pad = (await page.locator('[data-zone="pad"]').boundingBox())!;
  const right = { x: pad.x + pad.width * 0.7, y: pad.y + pad.height / 2, id: 2 };
  await touch(cdp, "touchStart", [right]);
  await page.waitForTimeout(600);
  const runEdge = { ...right, x: pad.x + pad.width * 0.97 };
  await touch(cdp, "touchMove", [runEdge]);
  await expect(page.locator('[data-zone="pad"]')).toHaveClass(/down/);
  await touch(cdp, "touchStart", [runEdge, { ...jump, id: 3 }]);
  await page.waitForTimeout(250);
  await touch(cdp, "touchEnd", [runEdge]);
  await page.waitForTimeout(600);
  const moved = (await snapshot(page)).player?.x ?? start;
  await touch(cdp, "touchEnd", []);

  expect(moved).toBeGreaterThan(start + 64);
  expect(errors).toEqual([]);
});

test("the pause button pauses", async ({ page }) => {
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__budsTakeover !== undefined);
  const cdp = await page.context().newCDPSession(page);
  const jump = await centre(page, '[data-zone="jump"]');
  await touch(cdp, "touchStart", [{ ...jump, id: 1 }]);
  await touch(cdp, "touchEnd", []);
  await waitForMode(page, "play");
  const pause = await centre(page, '[data-zone="pause"]');
  await touch(cdp, "touchStart", [{ ...pause, id: 4 }]);
  await touch(cdp, "touchEnd", []);
  await waitForMode(page, "paused");
});
