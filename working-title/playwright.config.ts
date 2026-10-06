import { defineConfig, devices, type LaunchOptions } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:4173';
const DEV_URL = 'http://localhost:5173';
const isCI = Boolean(process.env['CI']);

/**
 * Optional override for the Chromium binary, for environments that provide a browser build
 * other than the one this Playwright version downloads (`npx playwright install chromium`).
 */
const executablePath = process.env['PW_CHROMIUM_EXECUTABLE'];

const chromiumLaunch: LaunchOptions = {
  // Headless Chromium has no GPU; this permits the SwiftShader software fallback for WebGL.
  args: ['--enable-unsafe-swiftshader'],
  ...(executablePath ? { executablePath } : {}),
};

/** Adds a software (SwiftShader/Vulkan) WebGPU adapter so the WebGPU path runs headless. */
const webgpuLaunch: LaunchOptions = {
  ...chromiumLaunch,
  args: [
    ...(chromiumLaunch.args ?? []),
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-vulkan=swiftshader',
    '--use-webgpu-adapter=swiftshader',
    '--use-angle=swiftshader',
  ],
};

/** Read by tests through `testInfo.project.metadata`. */
export interface ProjectMetadata {
  /** Renderer `auto` must pick in this project, or `undefined` if either is acceptable. */
  readonly expectedAutoRenderer?: 'webgpu' | 'webgl2';
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
    launchOptions: chromiumLaunch,
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: 'smoke.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_URL },
    },
    {
      name: 'desktop-webgpu',
      testMatch: ['smoke.spec.ts', 'webgpu.spec.ts'],
      metadata: { expectedAutoRenderer: 'webgpu' } satisfies ProjectMetadata,
      use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_URL, launchOptions: webgpuLaunch },
    },
    {
      name: 'mobile-chromium',
      testMatch: 'smoke.spec.ts',
      use: { ...devices['Pixel 7 landscape'], baseURL: PREVIEW_URL },
    },
    {
      name: 'dev-inspector',
      testMatch: 'inspector.dev.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: DEV_URL },
    },
  ],
  webServer: [
    {
      // Smoke tests run against a production build made for this run. Never reuse a running
      // preview server: it would serve whatever stale dist/ it was started with.
      command: 'npm run build && npm run preview',
      url: PREVIEW_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      url: DEV_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
