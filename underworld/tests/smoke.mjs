/* Integration smoke test: boots, starts a career from $0, exercises every Empire tab and
   every street menu, the territory overlay, a strategic day, and reports any error. */
import { launch, open, check, frames, startNew, summary, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const st = await page.evaluate(() => { const g = window.game; return { money: g.save.money, garage: g.save.garage.length, weapons: Object.keys(g.save.weapons).filter(k => g.save.weapons[k]), turfs: g.uw.T.length, own: g.uw.owner.filter(Boolean).length, stage: g.uw.stage, state: g.state }; });
check('starts with $0, no car, no weapon', st.money === 0 && st.garage === 0 && st.weapons.length === 0, JSON.stringify(st));
check('36 turfs, most owned by factions', st.turfs === 36 && st.own > 20, JSON.stringify(st));
await frames(page, 60);
for (const tab of ['overview', 'map', 'crew', 'assets', 'market', 'stash', 'factions', 'police', 'feed']) {
  await page.evaluate(t => window.game.uw.ui.open(t), tab);
  await frames(page, 2);
  const ok = await page.evaluate(() => document.getElementById('empBody').innerHTML.length > 50 && window.game.ui.modal === 'empireScreen');
  check(`empire tab ${tab} renders`, ok);
}
await page.evaluate(() => { while (window.game.ui.stack.length) window.game.ui.back(); });
// street menus
const menus = await page.evaluate(() => {
  const g = window.game, uw = g.uw, out = {};
  const tryOpen = (name, fn) => { try { fn(); out[name] = document.getElementById('svcBody').innerHTML.length > 20; } catch (e) { out[name] = 'ERR ' + e.message; } while (g.ui.stack.length) g.ui.back(); };
  for (const L of uw.locs) {
    if (L.kind === 'prop') tryOpen('prop:' + L.id, () => uw.ui.openProp(L.id));
    if (L.kind === 'spot' && !L.def.chop) tryOpen('spot:' + L.id, () => uw.ui.openSpot(L));
    if (L.kind === 'hq') tryOpen('boss:' + L.id, () => uw.ui.openBoss(L.id));
  }
  tryOpen('fence', () => uw.ui.openFence('pawn'));
  tryOpen('chop', () => uw.ui.openChopInfo());
  return out;
});
const bad = Object.entries(menus).filter(([k, v]) => v !== true);
check('every street menu renders', bad.length === 0, JSON.stringify(bad));
// strategic days
const days = await page.evaluate(() => { const g = window.game; for (let i = 0; i < 6; i++) { g.uw.tickHours(24, 12); g.uw.tickDay(); } return { day: g.uw.S.day, opps: g.uw.S.opps.length, ledger: !!g.uw.S.lastLedger }; });
check('six strategic days tick', days.day === 7, JSON.stringify(days));
// big map overlay
await page.keyboard.press('KeyM'); await frames(page, 3);
const mapOk = await page.evaluate(() => window.game.mapOpen);
await page.evaluate(() => window.game.uw.ui.mapClick(300, 300)); await frames(page, 2);
check('big map overlay + turf info', mapOk && await page.evaluate(() => !document.getElementById('turfInfo').classList.contains('hidden')));
await page.keyboard.press('KeyM'); await frames(page, 10);
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'smoke');
