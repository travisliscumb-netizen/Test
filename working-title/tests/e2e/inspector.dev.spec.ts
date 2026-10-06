import { expect, test } from '@playwright/test';

import { expectNoProblems, waitForRunning, watchPage } from './support';

const ORIGIN = 'http://localhost:5173';

/**
 * Known upstream noise: closing the Inspector double-disposes a Fluent UI focus tracker
 * (keyborg 2.14), which logs this in non-production builds. It comes from inside
 * @babylonjs/inspector, never from game code, and only this exact message is excused.
 */
const UPSTREAM_INSPECTOR_TEARDOWN_ERROR = /^Keyborg instance k\d+ is being disposed incorrectly\.$/;

test('dev build boots with every Babylon side-effect import present', async ({ page }) => {
  const problems = watchPage(page, ORIGIN);
  await page.goto('/');
  await waitForRunning(page);
  // Let several frames render so per-frame feature probes have run.
  await page.waitForTimeout(2000);
  expectNoProblems(problems);
});

test('backtick toggles the Babylon Inspector in dev builds', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchPage(page, ORIGIN);
  await page.goto('/');
  await waitForRunning(page);

  const bodyChildren = () => page.evaluate(() => document.body.childElementCount);
  const baseline = await bodyChildren();

  await page.keyboard.press('Backquote');
  await expect.poll(bodyChildren, { timeout: 90_000 }).toBeGreaterThan(baseline);

  await page.keyboard.press('Backquote');
  await expect.poll(bodyChildren).toBe(baseline);

  const unexpected = problems.consoleErrors.filter(
    (e) => !UPSTREAM_INSPECTOR_TEARDOWN_ERROR.test(e),
  );
  problems.consoleErrors.splice(0, problems.consoleErrors.length, ...unexpected);
  expectNoProblems(problems);
});
