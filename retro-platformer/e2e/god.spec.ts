import { expect, test, type Page } from "@playwright/test";
import { godBlockRect } from "../src/game/godBlock";
import { buildUrl, snapshot, trackErrors, viewToPage, waitForMode } from "./helpers";

async function blockCenter(page: Page): Promise<{ x: number; y: number }> {
  const r = godBlockRect((await snapshot(page)).viewWidth);
  return viewToPage(page, r.x + r.size / 2, r.y + r.size / 2);
}

test("clicking the lone title block toggles God mode; with it Bud runs through enemies without losing a life", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__budsTakeover !== undefined);
  await waitForMode(page, "title");

  const at = await blockCenter(page);
  await page.mouse.click(at.x, at.y);
  expect((await snapshot(page)).god.armed).toBe(true);
  expect((await snapshot(page)).mode).toBe("title");
  await page.waitForTimeout(100);
  await page.screenshot({ path: "test-results/god-title-on.png" });
  await page.mouse.click(at.x, at.y);
  expect((await snapshot(page)).god.armed).toBe(false);
  await page.mouse.click(at.x, at.y);
  expect((await snapshot(page)).god.armed).toBe(true);
  // A click elsewhere does nothing.
  await page.mouse.click(640, 600);
  expect((await snapshot(page)).god.armed).toBe(true);

  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  expect((await snapshot(page)).god.active).toBe(true);

  // Run right into level 1's walkers, never jumping (pit rescue is covered by tests/god.test.ts).
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("KeyX");
  let furthest = 0;
  const until = Date.now() + 12_000;
  while (Date.now() < until) {
    await page.waitForTimeout(250);
    const s = await snapshot(page);
    expect(s.mode).toBe("play");
    expect(s.phase === "play" || s.phase === "transform").toBe(true);
    expect(s.lives).toBe(3);
    furthest = Math.max(furthest, s.player!.x);
  }
  await page.keyboard.up("KeyX");
  await page.keyboard.up("ArrowRight");
  console.log(`God mode run: furthest x ${furthest}, lives ${(await snapshot(page)).lives}`);
  expect(errors).toEqual([]);
});

test("without God mode, the same no-jump run loses a life (control)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__budsTakeover !== undefined);
  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  expect((await snapshot(page)).god.active).toBe(false);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("KeyX");
  await expect.poll(async () => (await snapshot(page)).phase, { timeout: 12_000 }).toBe("dying");
  await page.keyboard.up("KeyX");
  await page.keyboard.up("ArrowRight");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test("tapping the block toggles God mode without starting the game", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(buildUrl());
    await page.waitForFunction(() => window.__budsTakeover !== undefined);
    await waitForMode(page, "title");
    const at = await blockCenter(page);
    await page.touchscreen.tap(at.x, at.y);
    expect((await snapshot(page)).god.armed).toBe(true);
    expect((await snapshot(page)).mode).toBe("title");
    await page.screenshot({ path: "test-results/god-title-phone.png" });
    expect(errors).toEqual([]);
  });
});
