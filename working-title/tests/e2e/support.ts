import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

import type { DiagnosticsSnapshot } from '../../src/core/diagnostics';

export interface PageProblems {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly externalRequests: string[];
  readonly infoLogs: string[];
  /** Babylon warnings for calls into a feature whose side-effect import is missing. */
  readonly missingSideEffects: string[];
}

/** Records every console error, uncaught exception, failed request and off-origin request. */
export function watchPage(page: Page, origin: string): PageProblems {
  const problems: PageProblems = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    externalRequests: [],
    infoLogs: [],
    missingSideEffects: [],
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      problems.consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning' && msg.text().includes('requires a side-effect import')) {
      problems.missingSideEffects.push(msg.text());
    } else if (msg.type() === 'info') {
      problems.infoLogs.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    problems.pageErrors.push(`${error.name}: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    problems.failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin) {
      problems.externalRequests.push(request.url());
    }
  });
  return problems;
}

export function expectNoProblems(problems: PageProblems): void {
  expect(problems.pageErrors, 'uncaught exceptions').toEqual([]);
  expect(problems.consoleErrors, 'console errors').toEqual([]);
  expect(problems.failedRequests, 'failed requests').toEqual([]);
  expect(problems.externalRequests, 'requests to other origins').toEqual([]);
  expect(problems.missingSideEffects, 'missing Babylon side-effect imports').toEqual([]);
}

export async function snapshot(page: Page): Promise<DiagnosticsSnapshot> {
  const snap = await page.evaluate(() => window.__workingTitle?.snapshot() ?? null);
  if (snap === null) {
    throw new Error('Diagnostics accessor window.__workingTitle is missing.');
  }
  return snap;
}

export async function waitForRunning(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-state', /^(running|error)$/, {
    timeout: 30_000,
  });
  await expect(page.locator('html'), 'boot finished in error state').toHaveAttribute(
    'data-state',
    'running',
  );
}

export interface PixelStats {
  /** Distinct colours after quantising each channel to 32 levels. */
  readonly distinctColors: number;
  /** Fraction of pixels that differ noticeably from the top-left pixel. */
  readonly nonBackgroundFraction: number;
}

/** Screenshots the canvas as composited on screen and summarises its pixel content. */
export async function canvasPixelStats(page: Page): Promise<PixelStats> {
  const png = PNG.sync.read(await page.locator('#game canvas').screenshot());
  const { data, width, height } = png;
  const colors = new Set<number>();
  const [r0 = 0, g0 = 0, b0 = 0] = data;
  let differing = 0;
  for (let i = 0; i < width * height * 4; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 24) {
      differing += 1;
    }
  }
  return { distinctColors: colors.size, nonBackgroundFraction: differing / (width * height) };
}
