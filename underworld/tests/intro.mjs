/* The opening line of a new game ("$0 to your name…"): up when the game starts, gone after 30 s of real time (not
   play time, which a phone at a low frame rate counts slowly), and up again for a second new game in the same page. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await startNew(page);
const obj = () => page.evaluate(() => { const e = document.getElementById('objective'); const t = e && e.querySelector('.ot'); return { shown: !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none', text: t ? t.textContent : '', play: +window.game.save.stats.playTime.toFixed(1) }; });
const a = await obj(); check('the opening line shows when a new game starts', a.shown && /to your name/.test(a.text), JSON.stringify(a));
await page.waitForTimeout(20000); const m = await obj(); check('still up at 20 s', m.shown && /to your name/.test(m.text), JSON.stringify(m));
await page.waitForTimeout(20000); const z = await obj(); check("gone after 30 s of real time (checked at 40 s: the guide refreshes on game time, slow in software GL)", !/to your name/.test(z.text) || !z.shown, JSON.stringify(z));
// a second new game in the same page gets its own 30 s
await page.evaluate(() => { const g = window.game; g.ui.stack && (() => { while (g.ui.stack.length) g.ui.back(); })(); });
const again = await page.evaluate(() => { window.game.newGame(); return true; });
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
// (the guide refreshes every half second of game time, slow in software GL beside other suites: wait for it)
await page.waitForFunction(() => { const e = document.getElementById('objective'); return e && !e.classList.contains('hidden') && /to your name/.test(e.textContent); }, null, { timeout: 25000, polling: 200 }).catch(() => {});
const n = await obj(); check('a fresh save shows it again', n.shown && /to your name/.test(n.text), JSON.stringify({ n, again }));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'intro');
