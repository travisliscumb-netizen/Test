import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { canvasPixelStats, expectNoProblems, snapshot, waitForRunning, watchPage } from './support';

const SINGLE_FILE = fileURLToPath(new URL('../../dist-single/index.html', import.meta.url));
const ORIGIN = 'https://single-file.test';

/**
 * A sandbox in the spirit of hosts that serve one page and nothing else: inline code only,
 * no network access of any kind. WebAssembly compilation must still be allowed for Havok.
 */
const STRICT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'none'",
].join('; ');

test('single-file build runs fully offline under a strict CSP', async ({ page }) => {
  const blocked: string[] = [];
  const cspViolations: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        headers: { 'Content-Security-Policy': STRICT_CSP },
        body: readFileSync(SINGLE_FILE, 'utf8'),
      });
      return;
    }
    blocked.push(url);
    await route.abort();
  });
  page.on('console', (msg) => {
    if (msg.text().includes('Content Security Policy')) {
      cspViolations.push(msg.text());
    }
  });
  const problems = watchPage(page, ORIGIN);

  await page.goto(`${ORIGIN}/`);
  await waitForRunning(page);

  await expect
    .poll(async () => (await snapshot(page)).probeHeight, { timeout: 20_000 })
    .toBeLessThan(3);
  expect((await canvasPixelStats(page)).distinctColors).toBeGreaterThan(8);

  expect(blocked, 'requests attempted by the single-file page').toEqual([]);
  expect(cspViolations, 'CSP violations').toEqual([]);
  expectNoProblems(problems);
});
