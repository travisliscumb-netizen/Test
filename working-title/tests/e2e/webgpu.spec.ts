import { expect, test } from '@playwright/test';

import { canvasPixelStats, expectNoProblems, snapshot, waitForRunning, watchPage } from './support';

const ORIGIN = 'http://localhost:4173';

/** Babylon's own report of the failure this test injects; expected here and nowhere else. */
const INJECTED_FAILURE_LOG =
  /^BJS - \[[\d:]+\]: A fatal error occurred during WebGPU creation\/initialization\.$/;

test('falls back to WebGL2 on a fresh canvas when WebGPU initialisation fails', async ({
  page,
}) => {
  // Detection reports WebGPU as supported, and initialisation fails only after the canvas has
  // handed out its 'webgpu' context. Such a canvas can never return a WebGL2 context, so this
  // passes only if the engine factory swaps in a fresh canvas before falling back.
  await page.addInitScript(() => {
    GPUCanvasContext.prototype.configure = () => {
      throw new Error('simulated WebGPU swap chain failure');
    };
  });
  const problems = watchPage(page, ORIGIN);
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') {
      warnings.push(msg.text());
    }
  });

  await page.goto('/');
  await waitForRunning(page);

  expect((await snapshot(page)).renderer).toBe('webgl2');
  expect(warnings.some((w) => w.includes('WebGPU initialisation failed'))).toBe(true);
  await expect(page.locator('#game canvas')).toHaveCount(1);
  await expect.poll(async () => (await snapshot(page)).ticks).toBeGreaterThan(30);
  expect((await canvasPixelStats(page)).distinctColors).toBeGreaterThan(8);

  expect(problems.consoleErrors.filter((e) => INJECTED_FAILURE_LOG.test(e))).toHaveLength(1);
  const unexpected = problems.consoleErrors.filter((e) => !INJECTED_FAILURE_LOG.test(e));
  problems.consoleErrors.splice(0, problems.consoleErrors.length, ...unexpected);
  expectNoProblems(problems);
});
