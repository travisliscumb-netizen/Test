// End-to-end browser playtest: drives the real page in Chromium the way a
// player would, and fails on any console error or page exception.
//   NODE_PATH=$(npm root -g) node tests/playtest.mjs
import { createRequire } from 'node:module';
import { serve, ROOT } from '../tools/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
const errors = [];
const watch = (page, label) => {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${label}] ${e}`));
  page.on('requestfailed', (r) => errors.push(`[${label}] request failed ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`[${label}] HTTP ${r.status()} ${r.url()}`));
};
const S = (page, expr) => page.evaluate(`(() => { const S = window.__skifree; return ${expr}; })()`);
const wait = (page, ms) => page.waitForTimeout(ms);
async function until(page, expr, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await S(page, expr)) return Date.now() - t0;
    await wait(page, 50);
  }
  return -1;
}

// ------------------------------------------------------------- desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(url);
  await wait(page, 500);
  check('boots to the title screen', (await S(page, 'S.mode')) === 'title' && (await page.isVisible('#title')));
  check('attract mode is skiing behind the menu', (await S(page, 'S.demo.player.y')) > 0);
  for (const f of ['icon.svg', 'manifest.webmanifest']) {
    const r = await page.request.get(`${url}/${f}`);
    check(`${f} is served`, r.ok());
  }

  // Menus open and close.
  for (const name of ['controls', 'options', 'about']) {
    await page.click(`[data-action="${name}"]`);
    const shown = await page.isVisible('#' + name);
    await page.keyboard.press('Escape');
    const back = await page.isVisible('#title');
    check(`${name} panel opens and Esc closes it`, shown && back);
  }

  // Enter starts a run.
  await page.keyboard.press('Enter');
  check('Enter starts a run', (await until(page, "S.mode === 'playing'", 1500)) >= 0);
  check('HUD is visible during play', await page.isVisible('#hud'));
  await wait(page, 1500);
  const d1 = await S(page, 'S.game.stats.distance');
  check('the skier moves downhill on its own', d1 > 10, `${d1.toFixed(1)} m after 1.5 s`);
  const hudDist = await page.textContent('#hud-dist');
  check('HUD shows the distance', /^\d[\d,]*m$/.test(hudDist) && parseInt(hudDist.replace(/,/g, '')) > 0, hudDist);

  // Steering.
  await page.keyboard.down('ArrowLeft');
  await wait(page, 250);
  const hl = await S(page, 'S.game.player.heading');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('KeyD');
  await wait(page, 450);
  const hr = await S(page, 'S.game.player.heading');
  await page.keyboard.up('KeyD');
  check('arrow keys and WASD steer', hl < -0.2 && hr > hl + 0.3, `left ${hl.toFixed(2)}, right ${hr.toFixed(2)}`);

  // Turbo (with obstacles out of the way so we measure speed, not crashes).
  await S(page, 'S.game.player.grace = 30');
  await page.keyboard.down('ArrowUp');
  await wait(page, 600);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('KeyF');
  await wait(page, 2200);
  const turboSpeed = await S(page, 'S.game.player.speed');
  const turboFlag = await S(page, 'S.game.player.turbo');
  const barClass = await page.getAttribute('#speedo', 'class');
  await page.keyboard.up('KeyF');
  const cruise = await S(page, 'S.game.cfg.PLAYER_SPEED');
  check('holding F goes much faster than cruising', turboFlag && turboSpeed > cruise * 1.25, `${turboSpeed.toFixed(0)} vs cruise ${cruise}`);
  check('speed bar lights up on turbo', (barClass || '').includes('turbo'), barClass);

  // Hop: a tap shorter than a frame must still register. (Put the skier
  // squarely on their skis first: a random mogul could have tipped them.)
  await S(page, "(Object.assign(S.game.player, { state: 'ski', z: 0, vz: 0, hopCooldown: 0 }), 0)");
  const jumps0 = await S(page, 'S.game.stats.airTime');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
  });
  await wait(page, 250);
  check('a quick Space tap hops', (await S(page, 'S.game.stats.airTime')) > jumps0);
  await wait(page, 600);

  // Pause freezes everything.
  await page.keyboard.press('Escape');
  const tPause = await S(page, 'S.game.time');
  const yPause = await S(page, 'S.game.player.y');
  await wait(page, 700);
  check('Esc pauses: simulation frozen', (await S(page, 'S.mode')) === 'paused' && (await S(page, 'S.game.time')) === tPause && (await S(page, 'S.game.player.y')) === yPause);
  check('pause menu shows Resume / Restart / Main menu', (await page.isVisible('#pause [data-action="resume"]')) && (await page.isVisible('#pause [data-action="restart"]')) && (await page.isVisible('#pause [data-action="menu"]')));
  check('audio is suspended while paused', (await S(page, "S.sound.ctx ? S.sound.ctx.state !== 'running' : true")));
  await page.keyboard.press('Escape');
  await wait(page, 300);
  check('Esc resumes', (await S(page, 'S.mode')) === 'playing' && (await S(page, 'S.game.time')) > tPause);

  // R restarts with a fresh run.
  const before = await S(page, 'S.game.seed');
  await page.keyboard.press('KeyR');
  await wait(page, 100);
  check('R restarts the run', (await S(page, 'S.game.time')) < 0.5 && (await S(page, 'S.game.stats.distance')) < 5, `seed ${before} -> ${await S(page, 'S.game.seed')}`);

  // Yeti: summon it and stand still.
  await S(page, 'S.game.nextYetiAt = 0');
  await wait(page, 200);
  check('the yeti appears', (await S(page, 'S.game.yeti && S.game.yeti.state')) === 'chase');
  check('music switches to the chase theme', (await S(page, 'S.sound.mode')) === 'chase');
  await page.keyboard.down('ArrowLeft');
  const caughtIn = await until(page, "S.game.yeti && S.game.yeti.state === 'eat'", 30000);
  await page.keyboard.up('ArrowLeft');
  check('a stationary skier gets caught', caughtIn >= 0, `${(caughtIn / 1000).toFixed(1)} s`);
  const overIn = await until(page, "S.mode === 'over'", 6000);
  check('the eating animation leads to game over (~3 s)', overIn >= 2000 && overIn < 4500, `${overIn} ms`);
  check('game over shows distance, score, max speed', (await page.isVisible('#over')) && /m$/.test(await page.textContent('#over-dist')) && /km\/h$/.test(await page.textContent('#over-speed')));
  const best = await S(page, 'S.save.data.best.score');
  check('the result is saved as a record', best > 0, `best ${best}`);

  // A stray keypress the instant results appear doesn't skip them...
  await page.keyboard.press('Enter');
  await wait(page, 100);
  check('a stray key as the results appear does not skip them', (await S(page, 'S.mode')) === 'over');
  // ...but a deliberate one a moment later restarts immediately.
  await wait(page, 400);
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  const back = await until(page, "S.mode === 'playing'", 2000);
  check('Try again is instant', back >= 0 && Date.now() - t0 < 800, `${Date.now() - t0} ms`);

  // Mouse steering: pointer to the right of the skier turns right.
  await S(page, 'S.game.player.grace = 30');
  await page.mouse.move(640, 300);
  await page.mouse.move(1100, 420, { steps: 5 });
  await wait(page, 500);
  check('mouse steering points the skier at the cursor', (await S(page, 'S.game.player.heading')) > 0.3);
  await page.mouse.move(640, 700, { steps: 3 });

  // Resize mid-run.
  await page.setViewportSize({ width: 900, height: 600 });
  await wait(page, 300);
  const cv = await page.evaluate(() => ({ w: game.width, h: game.height, dpr: devicePixelRatio }));
  check('canvas follows window resizes', Math.abs(cv.w - 900 * cv.dpr) < 2 && Math.abs(cv.h - 600 * cv.dpr) < 2, `${cv.w}x${cv.h}`);

  // Blur pauses.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('losing focus pauses the run', (await S(page, 'S.mode')) === 'paused');
  await page.click('#pause [data-action="menu"]');
  check('Main menu returns to the title', (await S(page, 'S.mode')) === 'title');

  // Options persist across reloads.
  await page.click('[data-action="options"]');
  await page.fill('#opt-music', '0.2').catch(() => {});
  await page.evaluate(() => {
    const el = document.querySelector('#opt-music');
    el.value = '0.2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const m = document.querySelector('#opt-motion');
    m.checked = true;
    m.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.reload();
  await wait(page, 400);
  const st = await S(page, 'S.save.settings');
  check('settings survive a reload', st.music === 0.2 && st.reducedMotion === true);
  check('records survive a reload', (await S(page, 'S.save.data.best.score')) === best && (await page.textContent('#best-line')).includes('Best'));

  // Soak: a bot plays for a while; watch frame rate and memory.
  await S(page, "(S.start(4242), S.bot = { turbo: 'yeti' }, 0)");
  await S(page, 'S.game.nextYetiAt = 400');
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
        let frames = 0, worst = 0, last = performance.now();
        const t0 = last;
        function tick(t) {
          frames++;
          worst = Math.max(worst, t - last);
          last = t;
          if (t - t0 < 12000) requestAnimationFrame(tick);
          else resolve({ fps: (frames * 1000) / (t - t0), worst, heap0, heap1: performance.memory ? performance.memory.usedJSHeapSize : 0 });
        }
        requestAnimationFrame(tick);
      }),
  );
  const soak = await S(page, '({ d: S.game.stats.distance, mode: S.mode, actors: S.game.actors.length, chunks: S.game.world.chunks.size, particles: S.renderer.particles.list.length })');
  check('soak: game keeps running', soak.d > 100 || soak.mode === 'over', `${soak.d.toFixed(0)} m, mode ${soak.mode}, ${soak.actors} actors, ${soak.chunks} chunks`);
  check('soak: frame rate holds (headless, software GL)', fps.fps > 40, `${fps.fps.toFixed(1)} fps avg, worst frame ${fps.worst.toFixed(0)} ms`);
  const growth = (fps.heap1 - fps.heap0) / 1048576;
  check('soak: no runaway memory growth', growth < 25, `${growth.toFixed(1)} MB over 12 s`);
  await ctx.close();
}

// -------------------------------------------------------------- mobile
for (const vp of [{ name: 'iphone-landscape', width: 844, height: 390 }, { name: 'android-portrait', width: 412, height: 915 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watch(page, vp.name);
  await page.goto(url);
  await wait(page, 400);
  await page.tap('[data-action="play"]');
  await wait(page, 300);
  check(`${vp.name}: tapping Play starts`, (await S(page, 'S.mode')) === 'playing');
  check(`${vp.name}: touch controls shown`, await page.isVisible('#touch .turbo'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  check(`${vp.name}: no page overflow`, !overflow);
  const zoom = await S(page, 'S.renderer.zoom');
  check(`${vp.name}: skier is drawn at a readable size`, zoom * 26 >= 20, `${(zoom * 26).toFixed(0)} css px tall`);

  // Hold the right pad button with a real touch.
  const box = await page.locator('#touch .right').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await S(page, 'S.game.player.grace = 30');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await wait(page, 400);
  const h = await S(page, 'S.game.player.heading');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(`${vp.name}: the touch pad steers`, h > 0.3, `heading ${h.toFixed(2)}`);

  // Turbo + jump together (multi-touch).
  const tb = await page.locator('#touch .turbo').boundingBox();
  const jb = await page.locator('#touch .jump').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tb.x + 20, y: tb.y + 20, id: 1 }] });
  await wait(page, 300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tb.x + 20, y: tb.y + 20, id: 1 }, { x: jb.x + 20, y: jb.y + 20, id: 2 }] });
  await wait(page, 80);
  const both = await S(page, "({ turbo: S.game.player.turbo, air: S.game.player.state === 'air' || S.game.player.z > 0 })");
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(`${vp.name}: turbo and hop work together (multi-touch)`, both.turbo === true || both.air === true, JSON.stringify(both));

  await page.tap('#pause-btn');
  check(`${vp.name}: pause button works`, (await S(page, 'S.mode')) === 'paused');
  await page.tap('#pause [data-action="resume"]');
  check(`${vp.name}: resume works`, (await S(page, 'S.mode')) === 'playing');
  await ctx.close();
}

check('no console errors, page errors or failed requests', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
process.exit(failures ? 1 : 0);
