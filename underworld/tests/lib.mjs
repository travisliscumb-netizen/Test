/* Shared helpers for the Underworld test suites (headless Chromium + SwiftShader).
   Offline: set THREE_DIR to an unpacked three@0.160.0 package; requests to the CDN are
   then served from disk. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
export const { chromium } = playwright;
export const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const THREE_DIR = process.env.THREE_DIR;
const IGNORE = /GPU stall|swiftshader|WebGL-|Automatic fallback to software WebGL|GroupMarkerNotSet/i;
export let failures = 0;
export const results = [];
export function check(name, ok, detail = '') {
  if (!ok) failures++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
export async function open(browser, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 }, ...ctxOpts });
  if (THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => {
    const fp = path.join(THREE_DIR, route.request().url().replace('https://cdn.jsdelivr.net/npm/three@0.160.0/', ''));
    if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, body: fs.readFileSync(fp), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
  });
  // no pointer lock in tests: synthetic mouse moves must not turn the camera
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('disabled in tests')); }; });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + FILE);
  return { ctx, page, errors };
}
export const frames = async (page, n) => { const f0 = await page.evaluate(() => window.game.frame); await page.waitForFunction(t => window.game.frame >= t, f0 + n, { timeout: 240000, polling: 50 }); };
export async function boot(page, low = true) {
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  if (low) await page.evaluate(() => window.game.quality.setMode(0));
}
export async function startNew(page) {
  await boot(page);
  await page.click('#btnNew');
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000, polling: 100 });
  await frames(page, 3);
}
export function summary(name) {
  console.log(`\n${name}: ${results.length - failures} / ${results.length} passed`);
  if (failures) { console.log('FAILED'); process.exitCode = 1; } else console.log('ALL CHECKS PASSED');
}
// print the summary first, then close the browser; never hang on a stuck close()
export async function finish(browser, name) {
  summary(name);
  await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
  process.exit(process.exitCode || 0);
}
