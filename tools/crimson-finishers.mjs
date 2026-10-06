/* Captures each fighter's execution at fixed moments, deterministically:
   the live loop is paused and the simulation and renderer are stepped
   together one 60 Hz tick at a time, so a slow machine cannot skip past
   the effect being inspected. Not part of the shipped game. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'crimson-realm');
const OUT = process.argv[2] || path.join(ROOT, '..', '.shots', 'crimson-finishers');
fs.mkdirSync(OUT, { recursive: true });
// two moments per execution: mid-effect, and just after the body breaks
const MOMENTS = { kael: [52, 108], ember: [70, 122], volta: [86, 100], granite: [44, 0], shade: [100, 138], malrath: [80, 104] };

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '/index.html');
await page.waitForFunction(() => !!window.__crimson);
for (const [id, moments] of Object.entries(MOMENTS)) {
  for (const [i, at] of moments.entries()) {
    const ok = await page.evaluate(([id, at]) => {
      const c = window.__crimson;
      window.__rendering = false;
      c.start(id, 5, 0, true, id === 'kael' ? 'shade' : 'kael');
      c.pause();
      const m = c.match, r = c.renderer;
      m.fighters[0].wins = 1;
      let landedAt = -1;
      const orig = m.emit.bind(m);
      m.emit = (e) => { if (e.type === 'shatter') landedAt = m.fin.t; orig(e); };
      const hud = { label: 'LEVEL 5' };
      for (let i = 0; i < 60 * 60 * 3; i++) {
        if (m.phase === 'fight' && m.fighters[1].hp > 30) m.fighters[1].hp = 30;
        if (m.phase === 'fight' && m.fighters[0].hp < 400) m.fighters[0].hp = 900;
        if (m.phase === 'finish' && m.koWinner === m.fighters[0]) m.fighters[0].buf.s = 9;
        c.fastForward(1);
        // from the EXECUTE! prompt on, render every tick so effects age exactly as in
        // play; earlier banners would long be over by then, so start with a clean queue
        if (m.phase === 'finish' && !window.__rendering) { window.__rendering = true; r.announce.length = 0; }
        if (window.__rendering) r.frame(m, 1 / 60, hud);
        // 0 means "a moment after the body breaks", whenever that is
        const target = at || (landedAt >= 0 ? landedAt + 12 : Infinity);
        if (m.fin && m.fin.t >= target) return true;
        if (m.over) return false;
      }
      return false;
    }, [id, at]);
    // pausing the live loop opens the pause menu; hide it for the capture
    await page.evaluate(() => document.getElementById('pause').classList.remove('show'));
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(OUT, `${id}-${i}.png`) });
    console.log(id, i, ok ? 'captured' : 'MISSED');
  }
}
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
server.close();
