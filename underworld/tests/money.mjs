/* Money feedback: every change to the money you hold (Dirty Cash on you, Clean Bank), whatever system makes it
   (a sale, a purchase, a fare, a robbery, a fine), shows a +/− popup from the one place money changes, the
   Money ledger; bank changes say "bank"; quick same-sign changes in the same currency merge, opposite signs
   stack, at most four lines, they fade on their own, and nothing pops on the menu or when a save is loaded. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const feed = () => ev(() => [...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className })));
await ev(() => { const g = window.game; g.events.cool = 1e9; g.money.W.dirty.me = 1000; g.money.W.clean = 1000; for (let n = 0; n < 200; n++) g.update(1 / 60, 1 / 60); });

const inc = await ev(() => { const g = window.game; for (let n = 0; n < 200; n++) g.update(1 / 60, 1 / 60); g.earn(250, 'pickpocket'); return [...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className })); });
check('Dirty income shows a green +$ popup', inc.length >= 1 && inc[0].t === '+$250' && /up/.test(inc[0].c) && !/bank/.test(inc[0].c), JSON.stringify(inc));
const exp = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.money.pay(120, 'armorer'); r([...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className }))); }, 200)); });
check('an expense shows a red −$ popup above the last one', exp[0].t === '−$120' && /dn/.test(exp[0].c) && exp.length >= 2, JSON.stringify(exp));
// the bank pops too, marked as the bank; the old single balance no longer exists anywhere in the save
const bank = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.earn(500, 'business'); const e = document.querySelector('#moneyFeed b'); r({ t: e.textContent, c: e.className, legacy: 'money' in g.save }); }, 200)); });
check('Clean Bank income pops as "+$500 bank" and save.money no longer exists', bank.t === '+$500 bank' && /bank/.test(bank.c) && bank.legacy === false, JSON.stringify(bank));
// same-sign changes in one burst merge into one line
const merged = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.earn(10, 'pickpocket'); g.earn(15, 'pickpocket'); g.earn(5, 'pickpocket'); r([...document.querySelectorAll('#moneyFeed b')].map(e => e.textContent)); }, 200)); });
check('a burst of same-sign changes merges into one line (+$30)', merged[0] === '+$30', JSON.stringify(merged));
// stacking cap
const cap = await ev(() => { const g = window.game; return new Promise(r => { let k = 0; const iv = setInterval(() => { if (k % 2) g.earn(7, 'pickpocket'); else g.money.pay(7, 'armorer'); if (++k >= 8) { clearInterval(iv); r(document.querySelectorAll('#moneyFeed b').length); } }, 180); }); });
check('lines stack cleanly: never more than four', cap <= 4 && cap >= 2, String(cap));
const big = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.earn(25000, 'pickpocket'); const e = document.querySelector('#moneyFeed b'); r({ t: e.textContent, c: e.className }); }, 200)); });
check('big amounts get the large style', big.t === '+$25,000' && /big/.test(big.c), JSON.stringify(big));
// popups fade on their own
const fade = await ev(() => { const g = window.game; for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); return document.querySelectorAll('#moneyFeed b').length; });
check('popups fade away by themselves', fade === 0, String(fade));
// the popup sits under the money readout and never covers the top buttons
const pos = await ev(() => { const g = window.game; g.earn(99, 'pickpocket'); g.ui.placeFeed(); const f = document.getElementById('moneyFeed').getBoundingClientRect(), m = document.querySelector('#hud .tr').getBoundingClientRect(); const btns = [...document.querySelectorAll('#tbar .tbtn')].map(b => b.getBoundingClientRect()); const hit = btns.some(q => q.width && f.left < q.right && f.right > q.left && f.top < q.bottom && f.bottom > q.top); return { below: f.top >= m.bottom - 1, hit }; });
check('the feed hangs under the money readout and covers no button', pos.below && !pos.hit, JSON.stringify(pos));
// no popups for loading a save or on the menu
const quiet = await ev(() => { const g = window.game; for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); g.saveGame(true); g.showMenu(); const before = document.querySelectorAll('#moneyFeed b').length; g.money.earn(500, 'pickpocket'); const after = document.querySelectorAll('#moneyFeed b').length; return { before, after, live: window.__pv.MoneyFeed.live }; });
check('no popups on the menu (loading a save or menu previews never pop)', quiet.after === quiet.before && quiet.live === false, JSON.stringify(quiet));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'money');
