/* End-to-end playtest in Chromium. Drives the real page the way a player
   would -- keys, swipes, the D-pad, the pause button, the menus -- and checks
   persistence, the high-score flow, offline play and frame time. Fails on any
   console error, page exception or CSP violation.
   Usage: node tests/playtest.mjs */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, port } = await serve(ROOT);
/* Service workers need a secure context; localhost qualifies over http. */
const url = `http://localhost:${port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pacman && document.fonts.check('8px "Press Start 2P"'));
  return { ctx, page, errors };
}

const game = (page, fn) => page.evaluate(fn);
const waitPhase = (page, phase, timeout = 8000) =>
  page.waitForFunction((p) => window.__pacman.state.game && window.__pacman.state.game.phase === p, phase, { timeout });

/* ------------------------------------------------------------ desktop */
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } });

  const title = await page.isVisible('#screen-title');
  check('title screen visible on load', title);
  const demoMoving = await page.evaluate(async () => {
    const d = window.__pacman.state.demo;
    const a = d.tick;
    await new Promise((r) => setTimeout(r, 500));
    return window.__pacman.state.demo.tick > a;
  });
  check('attract-mode demo is running behind the title', demoMoving);

  await page.keyboard.press('Enter');
  check('Enter starts a game', await game(page, () => window.__pacman.state.mode === 'game'));
  check('pause button shown in game', await page.isVisible('#pause-btn'));
  const audio = await game(page, () => {
    const s = window.__pacman.state;
    return !!document.querySelector('canvas') && typeof AudioContext === 'function' && s.game.phase === 'ready';
  });
  check('game opens in READY phase', audio);

  await waitPhase(page, 'playing', 8000);
  const x0 = await game(page, () => window.__pacman.state.game.pac.x);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowLeft');
  const after = await game(page, () => ({ x: window.__pacman.state.game.pac.x, dots: window.__pacman.state.game.dotsEaten, score: window.__pacman.state.game.score }));
  check('arrow keys move Pac-Man and he eats dots', after.x < x0 && after.dots > 0 && after.score > 0, JSON.stringify(after));

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(800);
  const turned = await game(page, () => window.__pacman.state.game.pac.facing);
  check('a buffered turn is taken at the next opening', turned === 0, `facing ${turned}`);

  await page.keyboard.press('KeyP');
  check('P pauses', await page.isVisible('#screen-pause'));
  const frozen = await game(page, async () => {
    const t = window.__pacman.state.game.tick;
    await new Promise((r) => setTimeout(r, 300));
    return window.__pacman.state.game.tick === t;
  });
  check('simulation is frozen while paused', frozen);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
  check('pause menu takes keyboard focus', focused === 'RESUME', focused);
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate(() => document.activeElement.textContent.trim());
  check('arrow keys move focus through menus', moved === 'RESTART', moved);
  await page.keyboard.press('Escape');
  check('Escape resumes', !(await page.isVisible('#screen-pause')));

  await page.click('#pause-btn');
  check('pause button opens the pause menu', await page.isVisible('#screen-pause'));
  await page.click('[data-screen="pause"] [data-open="settings"]');
  check('settings open from pause', await page.isVisible('#screen-settings'));
  await page.click('[data-setting="crt"]', { force: true });
  await page.keyboard.press('KeyM');
  const st = await game(page, () => ({ ...window.__pacman.settings }));
  check('settings toggle and M mutes', st.crt === false && st.sound === false, JSON.stringify(st));
  await page.click('[data-screen="settings"] [data-action="back"]');
  check('back returns to pause', await page.isVisible('#screen-pause'));
  await page.click('[data-action="resume"]');

  /* Force a game over and walk the high-score entry. */
  await game(page, () => {
    const g = window.__pacman.state.game;
    g.lives = 0; g.score = 12340; g.setPhase('deathAnim', 2);
  });
  await page.waitForSelector('#screen-over:not([hidden])', { timeout: 6000 });
  check('game-over panel appears', true);
  check('initials form offered for a top-five score', await page.isVisible('#initials-form'));
  await page.fill('#initials', 'qz9!x');
  const typed = await page.inputValue('#initials');
  check('initials are sanitised to 3 uppercase characters', typed === 'QZ9', typed);
  await page.press('#initials', 'Enter');
  const saved = await game(page, () => window.__pacman.data.scores[0]);
  check('score saved to the table', saved && saved.name === 'QZ9' && saved.score === 12340, JSON.stringify(saved));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__pacman);
  const persisted = await game(page, () => ({ s: window.__pacman.data.scores[0], crt: window.__pacman.settings.crt, sound: window.__pacman.settings.sound }));
  check('scores and settings survive a reload', persisted.s && persisted.s.score === 12340 && persisted.crt === false && persisted.sound === false, JSON.stringify(persisted));
  await page.click('[data-open="scores"]');
  const rows = await page.$$eval('#score-table li', (li) => li.map((x) => x.textContent));
  check('high-score screen lists the entry', rows.length === 1 && rows[0].includes('QZ9') && rows[0].includes('12,340'), rows.join('|'));
  await page.keyboard.press('Escape');

  /* Offline: the service worker must serve the whole game. */
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'load' });
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check('service worker controls the page', controlled);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  const offlineOk = await page.waitForFunction(() => window.__pacman && window.__pacman.state.demo.tick > 10, null, { timeout: 6000 }).then(() => true, () => false);
  check('game loads and runs offline', offlineOk);
  await ctx.setOffline(false);

  /* Frame time with a busy board. */
  await game(page, () => window.__pacman.startGame());
  const perf = await page.evaluate(async () => {
    const { botDirection } = await import('./src/bot.js');
    const s = window.__pacman.state;
    const times = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (s.game) s.game.setInput(botDirection(s.game));
        if (++n < 240) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    times.sort((a, b) => a - b);
    return { p50: times[120], p95: times[228] };
  });
  check('frame time is smooth (p95 under 25 ms in headless)', perf.p95 < 25, `p50 ${perf.p50.toFixed(1)} ms, p95 ${perf.p95.toFixed(1)} ms`);

  /* Render soak: complete games at speed, drawing every phase the engine
     reaches -- intermissions, flashes, deaths, game over -- to catch any
     exception in rarely-drawn paths. */
  const soak = await page.evaluate(async () => {
    const { Game } = await import('./src/engine.js');
    const { botDirection } = await import('./src/bot.js');
    const renderer = window.__pacman.renderer;
    const phases = new Set();
    let frames = 0;
    for (const [seed, invincible] of [[11, true], [12, false], [13, false]]) {
      const g = new Game({ seed, invincible });
      for (let i = 0; i < 60 * 60 * 12 && g.phase !== 'gameover' && g.level <= 10; i++) {
        g.setInput(botDirection(g));
        g.step();
        g.drainEvents();
        phases.add(g.phase);
        if (i % 7 === 0 || g.phase === 'intermission') renderer.draw(g, 0.5, { time: i / 60, demo: false, highScore: 0 });
        frames++;
      }
      renderer.draw(g, 1, { time: 0, demo: false, highScore: 0 });
    }
    return { frames, phases: [...phases].sort() };
  });
  const need = ['deathAnim', 'dying', 'flash', 'gameover', 'ghostEaten', 'intermission', 'levelDone', 'playing', 'ready'];
  check('render soak reaches and draws every phase', need.every((p) => soak.phases.includes(p)), `${soak.frames} frames; ${soak.phases.join(',')}`);

  check('no console errors on desktop', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------- touch */
for (const vp of [{ name: 'iPhone SE', width: 375, height: 667 }, { name: 'iPhone 15', width: 393, height: 852 }, { name: 'landscape', width: 852, height: 393 }]) {
  const { ctx, page, errors } = await open({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  const fits = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#screen-title button')].filter((b) => b.offsetParent);
    return els.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  });
  check(`${vp.name}: every title button is on screen`, fits);
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).filter((b) => {
    const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44;
  }).map((b) => b.getAttribute('aria-label') || b.textContent.trim()));
  check(`${vp.name}: title touch targets are at least 44 px`, small.length === 0, small.join(', '));

  await page.tap('#btn-play');
  await waitPhase(page, 'playing', 8000);
  const layout = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const pad = document.querySelector('#dpad');
    const btn = r(document.querySelector('#pause-btn'));
    return { pad: pad.hidden ? null : r(pad).toJSON(), btn: btn.toJSON(), vw: innerWidth, vh: innerHeight };
  });
  const b = layout.btn;
  check(`${vp.name}: pause button on screen, >= 44 px`, b.left >= 0 && b.right <= layout.vw && b.top >= 0 && b.width >= 44, JSON.stringify(b));
  if (layout.pad) {
    const p = layout.pad;
    check(`${vp.name}: D-pad fully on screen and >= 120 px`, p.left >= 0 && p.right <= layout.vw && p.top >= 0 && p.bottom <= layout.vh && p.width >= 120, JSON.stringify(p));
    const overlap = !(p.right < b.left || p.left > b.right || p.bottom < b.top || p.top > b.bottom);
    check(`${vp.name}: D-pad does not overlap the pause button`, !overlap);

    /* Steer with the pad: press on its left arm. */
    for (const [dir, fx, fy] of [[3, 0.88, 0.5], [2, 0.5, 0.88], [1, 0.12, 0.5]]) {
      await page.touchscreen.tap(p.x + p.width * fx, p.y + p.height * fy);
      const want = await game(page, () => window.__pacman.state.game.pac.want);
      check(`${vp.name}: D-pad arm ${dir} sets direction`, want === dir, `want ${want}`);
    }
  }

  /* Swipe up on the board via pointer events. */
  await page.evaluate(() => {
    const el = document.querySelector('#stage');
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    fire('pointerdown', 150, 300); fire('pointermove', 152, 270); fire('pointerup', 152, 270);
  });
  const swiped = await game(page, () => window.__pacman.state.game.pac.want);
  check(`${vp.name}: swipe sets direction`, swiped === 0, `want ${swiped}`);

  check(`${vp.name}: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
