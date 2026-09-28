// Visual QA: stages specific moments (poses, eating frames, landmarks, mobile
// layouts) and captures each to .shots/moments-*.png.
//   NODE_PATH=$(npm root -g) node tools/moments.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve, ROOT } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const errors = [];

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(600);
  return page;
}

// Freezes the run, applies `setup` to the live game, redraws, screenshots.
async function stage(page, name, setup, arg) {
  await page.evaluate(
    ([src, a]) => {
      const S = window.__skifree;
      if (S.mode !== 'paused') S.pause();
      document.querySelector('#pause').classList.add('hidden');
      const g = S.game;
      new Function('g', 'a', src)(g, a);
      g.updateCamera(1);
      g.updateCamera(1);
      g.refreshWorld();
      S.renderer.updateEffects(g, 0);
      S.renderer.draw(g);
    },
    [setup, arg],
  );
  await page.screenshot({ path: path.join(OUT, `moments-${name}.png`) });
}

// ------------------------------------------------------------ desktop
{
  const page = await open({ width: 1280, height: 720 });
  await page.evaluate(() => window.__skifree.start(1991));
  await page.waitForTimeout(3000);

  const eat = `
    const p = g.player;
    g.nextYetiAt = 0; g.updateYeti(0.001);
    const y = g.yeti; y.state = 'eat'; y.eatTime = a; y.x = p.x; y.y = p.y - 4;
    p.state = 'caught';`;
  for (const t of [0.2, 0.6, 0.95, 1.4, 2.25]) await stage(page, `eat-${t}`, eat, t);

  // A line-up of every skier pose next to one another.
  await page.evaluate(() => window.__skifree.start(7));
  await page.waitForTimeout(200);
  await stage(
    page,
    'poses',
    `const p = g.player; p.x = 0; p.y = 20; p.state = 'ski'; p.heading = 0; p.travel = 0; p.speed = 0;
     g.actors.length = 0;
     const A = g.actors;
     const mk = (kind, dx, st) => { const o = Object.create(Object.getPrototypeOf(g.player)); };
     // Borrow the Actor class from a spawned actor if there is none.
     const poses = [
       {heading:-1.5708}, {heading:-0.9}, {heading:-0.4}, {heading:0.4}, {heading:0.9}, {heading:1.5708},
       {heading:0, turbo:true}, {heading:0, braking:true}, {heading:0.3, state:'air', z:30},
       {heading:0, state:'crash', travel:0.4, stateTime:0.5}, {heading:0, state:'tumble', travel:0.2}, {heading:0, state:'recover', stateTime:0.15},
       {heading:0, state:'air', z:20, trick:{kind:'flip', t:0.2, dur:0.62}}, {heading:0, state:'air', z:20, trick:{kind:'flip', t:0.35, dur:0.62}},
       {heading:0, state:'air', z:20, trick:{kind:'eagle', t:0.17, dur:0.34}}, {heading:0, state:'air', z:20, trick:{kind:'spin', t:0.1, dur:0.5}},
       {heading:0.3, speed:380, turbo:true}, {heading:0, speed:0},
     ];
     g.__poses = poses;`,
  );
  // Draw the pose line-up directly with the character module.
  await page.evaluate(async () => {
    const { drawSkier, drawDog, drawBoarder, drawYeti } = await import('./src/characters.js');
    const r = window.__skifree.renderer;
    const ctx = r.ctx;
    ctx.setTransform(r.dpr * 2.2, 0, 0, r.dpr * 2.2, 0, 0);
    ctx.fillStyle = '#f7fafe';
    ctx.fillRect(0, 0, 2000, 2000);
    const poses = window.__skifree.game.__poses;
    poses.forEach((pp, i) => {
      ctx.save();
      ctx.translate(30 + (i % 6) * 90, 60 + Math.floor(i / 6) * 62);
      drawSkier(ctx, { state: 'ski', anim: 1.3, travel: pp.heading, z: 0, outfit: 0, ...pp });
      ctx.restore();
    });
    const dogs = [{ state: 'sit' }, { state: 'go', speed: 100 }, { state: 'dash', speed: 250, heading: -1 }];
    dogs.forEach((d, i) => {
      ctx.save();
      ctx.translate(40 + i * 60, 250);
      drawDog(ctx, { heading: 1, anim: 0.4, look: i * 2, speed: 0, ...d });
      ctx.restore();
    });
    ctx.save();
    ctx.translate(250, 250);
    drawBoarder(ctx, { heading: 0.4, anim: 1, outfit: 3 });
    ctx.restore();
    for (const [i, st] of [['chase', 0], ['stumble', 1]].entries()) {
      ctx.save();
      ctx.translate(360 + i * 90, 270);
      drawYeti(ctx, { state: st[0], anim: 0.6, heading: 0.5, speed: 250, lunging: i === 0 });
      ctx.restore();
    }
  });
  await page.screenshot({ path: path.join(OUT, 'moments-poses.png') });

  // Landmarks.
  const at = `const p = g.player; p.x = a[0]; p.y = a[1]; p.state='ski'; p.speed = 0; g.camX = p.x; g.camY = p.y;`;
  await page.evaluate(() => window.__skifree.start(1991));
  await page.waitForTimeout(100);
  await stage(page, 'start-area', at, [-300, 120]);
  await stage(page, 'slalom', at, [-928, 3000]);
  await stage(page, 'freestyle', at, [992, 2600]);
  await stage(page, 'chairlift', at, [2080, 4000]);
  await stage(page, 'yeti-xing', at, [0, (2000 - 140) * 16 - 150]);
  await stage(page, 'course-start', at, [-928, 22 * 16 - 120]);
  await stage(page, 'deep', at, [0, 60000]);
  await stage(page, 'deeper', at, [4000, 120000]);
  await page.close();
}

// ------------------------------------------------------------- mobile
for (const [name, vp] of [['phone-landscape', { width: 844, height: 390 }], ['phone-portrait', { width: 390, height: 844 }]]) {
  const page = await open(vp, { touch: true, dpr: 2 });
  await page.screenshot({ path: path.join(OUT, `moments-${name}-title.png`) });
  await page.tap('[data-action="play"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `moments-${name}-play.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  if (overflow) errors.push(`${name}: page overflows the viewport`);
  await page.tap('#pause-btn');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `moments-${name}-pause.png`) });
  await page.close();
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
server.close();
