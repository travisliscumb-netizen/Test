import { expect, test } from '@playwright/test';

import type { ProjectMetadata } from '../../playwright.config';
import { canvasPixelStats, expectNoProblems, snapshot, waitForRunning, watchPage } from './support';

const ORIGIN = 'http://localhost:4173';
/** Probe crate spawn height in the M0 boot scene (see src/world/bootScene.ts). */
const PROBE_SPAWN_Y = 8;
/** Simulation rate from src/config/simulation.ts. */
const TICK_HZ = 60;

test.describe('production build boots', () => {
  test('auto renderer: renders, simulates and stays error-free', async ({ page }, testInfo) => {
    const problems = watchPage(page, ORIGIN);
    await page.goto('/');
    await waitForRunning(page);

    const first = await snapshot(page);
    expect(['webgpu', 'webgl2']).toContain(first.renderer);
    const { expectedAutoRenderer } = testInfo.project.metadata as ProjectMetadata;
    if (expectedAutoRenderer !== undefined) {
      expect(first.renderer).toBe(expectedAutoRenderer);
    }
    const label = first.renderer === 'webgpu' ? 'WebGPU' : 'WebGL2';
    expect(problems.infoLogs).toContain(`[working-title] Renderer: ${label}`);
    testInfo.annotations.push({ type: 'renderer', description: label });

    // Frames are being produced and the fixed-step simulation is ticking.
    await expect.poll(async () => (await snapshot(page)).ticks).toBeGreaterThan(30);
    await expect.poll(async () => (await snapshot(page)).frames).toBeGreaterThan(first.frames);

    // Havok loaded from the build and is stepping: the probe crate falls and lands.
    await expect
      .poll(async () => (await snapshot(page)).probeHeight, { timeout: 20_000 })
      .toBeLessThan(3);
    const landed = await snapshot(page);
    expect(landed.probeHeight).not.toBeNull();
    expect(landed.probeHeight ?? 0).toBeGreaterThan(0.4);
    expect(landed.probeHeight ?? PROBE_SPAWN_Y).toBeLessThan(PROBE_SPAWN_Y);

    // The canvas shows a lit scene, not a blank clear colour.
    const pixels = await canvasPixelStats(page);
    expect(pixels.distinctColors).toBeGreaterThan(8);
    expect(pixels.nonBackgroundFraction).toBeGreaterThan(0.1);

    expectNoProblems(problems);
  });

  test('simulation never runs faster than real time', async ({ page }) => {
    const problems = watchPage(page, ORIGIN);
    await page.goto('/');
    await waitForRunning(page);

    const start = await snapshot(page);
    const startMs = Date.now();
    await page.waitForTimeout(2000);
    const end = await snapshot(page);
    const elapsed = (Date.now() - startMs) / 1000;

    const ticksPerSecond = (end.ticks - start.ticks) / elapsed;
    const fps = (end.frames - start.frames) / elapsed;
    test.info().annotations.push({
      type: 'rates',
      description: `${fps.toFixed(1)} fps, ${ticksPerSecond.toFixed(1)} ticks/s`,
    });
    expect(ticksPerSecond).toBeGreaterThan(0);
    // Allow for timer granularity across the two snapshots, never a whole-rate overshoot.
    expect(ticksPerSecond).toBeLessThanOrEqual(TICK_HZ * 1.1);
    expectNoProblems(problems);
  });

  test('WebGL2 path works when forced', async ({ page }) => {
    const problems = watchPage(page, ORIGIN);
    await page.goto('/?renderer=webgl2');
    await waitForRunning(page);

    expect((await snapshot(page)).renderer).toBe('webgl2');
    expect(problems.infoLogs).toContain('[working-title] Renderer: WebGL2');
    await expect.poll(async () => (await snapshot(page)).ticks).toBeGreaterThan(30);

    const pixels = await canvasPixelStats(page);
    expect(pixels.distinctColors).toBeGreaterThan(8);
    expectNoProblems(problems);
  });

  test('accepts pointer or touch input on the canvas without errors', async ({ page }) => {
    const problems = watchPage(page, ORIGIN);
    await page.goto('/');
    await waitForRunning(page);

    const canvas = page.locator('#game canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    if (test.info().project.use.hasTouch === true) {
      await page.touchscreen.tap(x, y);
    } else {
      await page.mouse.click(x, y);
    }
    const before = (await snapshot(page)).frames;
    await expect.poll(async () => (await snapshot(page)).frames).toBeGreaterThan(before);
    expectNoProblems(problems);
  });

  test('canvas fills the viewport', async ({ page }) => {
    await page.goto('/');
    await waitForRunning(page);
    const viewport = page.viewportSize();
    const box = await page.locator('#game canvas').boundingBox();
    expect(box?.width).toBe(viewport?.width);
    expect(box?.height).toBe(viewport?.height);
  });
});

test('backtick does not open the inspector in production', async ({ page }) => {
  const problems = watchPage(page, ORIGIN);
  await page.goto('/');
  await waitForRunning(page);
  const bodyChildren = () => page.evaluate(() => document.body.childElementCount);
  const baseline = await bodyChildren();
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(1000);
  expect(await bodyChildren()).toBe(baseline);
  expectNoProblems(problems);
});
