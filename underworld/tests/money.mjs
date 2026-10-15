/* Money feedback: every change to the player's cash, whatever system makes it (a sale, a purchase, a
   fare, a robbery, a fine), shows a +/− popup from the one place money changes; quick same-sign
   changes merge, opposite signs stack, at most four lines, they fade on their own, and nothing
   pops on the menu or when a save is loaded. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const feed = () => ev(() => [...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className })));
await ev(() => { const g = window.game; g.events.cool = 1e9; g.save.money = 1000; for (let n = 0; n < 200; n++) g.update(1 / 60, 1 / 60); });

const inc = await ev(() => { const g = window.game; for (let n = 0; n < 200; n++) g.update(1 / 60, 1 / 60); g.addMoney(250, true); return [...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className })); });
check('income shows a green +$ popup', inc.length >= 1 && inc[0].t === '+$250' && /up/.test(inc[0].c), JSON.stringify(inc));
const exp = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.content.spend(120); r([...document.querySelectorAll('#moneyFeed b')].map(e => ({ t: e.textContent, c: e.className }))); }, 200)); });
check('an expense shows a red −$ popup above the last one', exp[0].t === '−$120' && /dn/.test(exp[0].c) && exp.length >= 2, JSON.stringify(exp));
// systems that write save.money directly still go through the one path
const direct = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.save.money -= 35; r([...document.querySelectorAll('#moneyFeed b')].map(e => e.textContent)); }, 200)); });
check('a direct write to save.money (e.g. a cab fare or a fine) also pops', direct[0] === '−$35', JSON.stringify(direct));
// same-sign changes in one burst merge into one line
const merged = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.addMoney(10, true); g.addMoney(15, true); g.addMoney(5, true); r([...document.querySelectorAll('#moneyFeed b')].map(e => e.textContent)); }, 200)); });
check('a burst of same-sign changes merges into one line (+$30)', merged[0] === '+$30', JSON.stringify(merged));
// stacking cap
const cap = await ev(() => { const g = window.game; return new Promise(r => { let k = 0; const iv = setInterval(() => { g.addMoney(k % 2 ? 7 : -7, true); if (++k >= 8) { clearInterval(iv); r(document.querySelectorAll('#moneyFeed b').length); } }, 180); }); });
check('lines stack cleanly: never more than four', cap <= 4 && cap >= 2, String(cap));
const big = await ev(() => { const g = window.game; return new Promise(r => setTimeout(() => { g.addMoney(25000, true); const e = document.querySelector('#moneyFeed b'); r({ t: e.textContent, c: e.className }); }, 200)); });
check('big amounts get the large style', big.t === '+$25,000' && /big/.test(big.c), JSON.stringify(big));
// popups fade on their own
const fade = await ev(() => { const g = window.game; for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); return document.querySelectorAll('#moneyFeed b').length; });
check('popups fade away by themselves', fade === 0, String(fade));
// the popup sits under the money readout and never covers the top buttons
const pos = await ev(() => { const g = window.game; g.addMoney(99, true); g.ui.placeFeed(); const f = document.getElementById('moneyFeed').getBoundingClientRect(), m = document.querySelector('#hud .tr').getBoundingClientRect(); const btns = [...document.querySelectorAll('#tbar .tbtn')].map(b => b.getBoundingClientRect()); const hit = btns.some(q => q.width && f.left < q.right && f.right > q.left && f.top < q.bottom && f.bottom > q.top); return { below: f.top >= m.bottom - 1, hit }; });
check('the feed hangs under the money readout and covers no button', pos.below && !pos.hit, JSON.stringify(pos));
// no popups for loading a save or on the menu
const quiet = await ev(() => { const g = window.game; for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); g.saveGame(true); g.showMenu(); const before = document.querySelectorAll('#moneyFeed b').length; g.save.money += 500; const after = document.querySelectorAll('#moneyFeed b').length; return { before, after, live: window.__pv.MoneyFeed.live }; });
check('no popups on the menu (loading a save or menu previews never pop)', quiet.after === quiet.before && quiet.live === false, JSON.stringify(quiet));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'money');
