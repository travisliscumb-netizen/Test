import { expect, test } from "@playwright/test";
import { buildUrl, snapshot, trackErrors, waitForMode } from "./helpers";

test("holding right and pressing jump for 5 seconds moves the hero, with no console errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__sproutQuest !== undefined);
  await waitForMode(page, "title");

  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  const start = (await snapshot(page)).player!.x;

  let furthest = start;
  await page.keyboard.down("ArrowRight");
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    await page.keyboard.down("KeyZ");
    await page.waitForTimeout(300);
    await page.keyboard.up("KeyZ");
    await page.waitForTimeout(150);
    const s = await snapshot(page);
    if (s.player) furthest = Math.max(furthest, s.player.x);
  }
  await page.keyboard.up("ArrowRight");

  console.log(`hero x: ${start} -> furthest ${furthest}`);
  expect(errors).toEqual([]);
  expect(furthest).toBeGreaterThan(start);
});

test("pause stops the simulation and resumes it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(buildUrl());
  await page.waitForFunction(() => window.__sproutQuest !== undefined);
  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  await page.keyboard.press("Enter");
  await waitForMode(page, "paused");
  const x = (await snapshot(page)).player!.x;
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(500);
  expect((await snapshot(page)).player!.x).toBe(x);
  await page.keyboard.press("Enter");
  await waitForMode(page, "play");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowRight");
  expect((await snapshot(page)).player!.x).toBeGreaterThan(x);
  expect(errors).toEqual([]);
});
