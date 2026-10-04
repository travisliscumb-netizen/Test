/* Screenshots of every screen at phone, tablet and desktop sizes, with the
   page's console errors and CSP violations collected. Visual review aid.
   Usage: node tools/shots.mjs [outDir] */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '.shots'));
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, touch: true, dpr: 3 },
  { name: 'phone-small', width: 375, height: 667, touch: true, dpr: 2 },
  { name: 'phone-landscape', width: 844, height: 390, touch: true, dpr: 3 },
  { name: 'tablet', width: 820, height: 1180, touch: true, dpr: 2 },
  { name: 'desktop', width: 1440, height: 900, touch: false, dpr: 1 }
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const problems = [];

for (const vp of VIEWPORTS.filter((v) => !only || only.includes(v.name))) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
    isMobile: vp.touch, hasTouch: vp.touch
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${vp.name}: console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${vp.name}: pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${vp.name}-${n}.png`) });
  await shot('01-title');

  /* Drive a real game with the autopilot to reach representative states. */
  await page.evaluate(async () => {
    const { botDirection } = await import('./src/bot.js');
    window.__bot = botDirection;
    window.__pacman.startGame();
  });
  await page.waitForTimeout(700);
  await shot('02-ready');
  await page.evaluate(() => {
    const g = window.__pacman.state.game;
    for (let i = 0; i < 252 + 60 * 14; i++) { g.setInput(window.__bot(g)); g.step(); g.drainEvents(); if (g.phase !== 'playing' && g.phase !== 'ready') break; }
  });
  await page.waitForTimeout(250);
  await shot('03-play');
  await page.evaluate(() => {
    const g = window.__pacman.state.game;
    while (g.phase !== 'playing') { g.step(); g.drainEvents(); }
    g.startFright();
    for (let i = 0; i < 40; i++) { g.setInput(window.__bot(g)); g.step(); g.drainEvents(); }
  });
  await page.waitForTimeout(120);
  await shot('04-fright');
  /* Transient moments, staged directly on the engine. */
  const stage = async (name, fn, wait = 120) => { await page.evaluate(fn); await page.waitForTimeout(wait); await shot(name); };
  await stage('04b-ghost-eaten', () => {
    const g = window.__pacman.state.game;
    const ghost = g.ghosts.find((x) => x.state === 'active') || g.ghosts[0];
    ghost.frightened = true; ghost.state = 'active';
    g.pac.x = ghost.x; g.pac.y = ghost.y; g.pac.px = g.pac.x; g.pac.py = g.pac.y;
    g.checkCollisions();
  }, 60);
  await stage('04c-death', () => {
    const g = window.__pacman.state.game;
    g.setPhase('deathAnim', 60);
  }, 40);
  await stage('04d-flash', () => {
    const g = window.__pacman.state.game;
    g.setPhase('flash', 107);
  }, 40);
  await stage('04e-intermission', () => {
    const g = window.__pacman.state.game;
    g.intermission = 0; g.setPhase('intermission', 330 - 230);
  }, 40);
  await page.evaluate(() => { const g = window.__pacman.state.game; g.lives = 2; g.resetActors(); g.setPhase('ready', 200); });
  await page.evaluate(() => window.__pacman.pause());
  await page.waitForTimeout(400);
  await shot('05-pause');
  await page.click('[data-screen="pause"] [data-open="settings"]');
  await page.waitForTimeout(400);
  await shot('06-settings');
  await page.evaluate(() => { window.__pacman.state.stack = []; });
  await page.evaluate(() => {
    window.__pacman.data.scores = [
      { name: 'AAA', score: 48210, level: 6 }, { name: 'PAC', score: 23110, level: 4 },
      { name: 'INK', score: 12960, level: 3 }, { name: 'CLY', score: 7340, level: 2 }
    ];
    const g = window.__pacman.state.game;
    g.lives = 0; g.score = 15020; g.phase = 'deathAnim'; g.phaseTimer = 1;
  });
  await page.waitForTimeout(3400);
  await shot('07-gameover');
  await page.evaluate(() => window.__pacman.quitToTitle());
  await page.waitForTimeout(300);
  await page.click('[data-open="scores"]');
  await page.waitForTimeout(400);
  await shot('08-scores');
  await page.keyboard.press('Escape');
  await page.click('[data-open="help"]');
  await page.waitForTimeout(400);
  await shot('09-help');
  await ctx.close();
}

await browser.close();
server.close();
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
else console.log(`ok: screenshots in ${OUT}`);
