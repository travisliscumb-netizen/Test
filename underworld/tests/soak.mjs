/* Long-session soak: CYCLES rounds of everything a long play session does. After every
   round the world must be intact: bounded entity counts, no NaN anywhere, no stuck pose,
   no runaway timers or groups, heap roughly flat, no console errors.
   Usage: CYCLES=6 node underworld/tests/soak.mjs */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const CYCLES = +(process.env.CYCLES || 6);
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.input.wantLock = false; g.input.noLock = true; g.save.money = 200000; g.save.rep = 900; });
await page.mouse.move(240, 135);
const ev = (fn, a) => page.evaluate(fn, a);
const health = () => ev(() => {
  const g = window.game, p = g.player, uw = g.uw;
  const bad = [];
  if (![p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.z, p.h, p.health].every(Number.isFinite)) bad.push('player');
  for (const v of g.vehicles.list) if (![v.pos.x, v.pos.y, v.pos.z, v.vel.x, v.vel.y, v.h].every(Number.isFinite)) { bad.push('veh ' + v.type); break; }
  for (const q of g.peds.peds) if (![q.x, q.y, q.z].every(Number.isFinite)) { bad.push('ped ' + q.kind); break; }
  if (!Number.isFinite(g.save.money)) bad.push('money');
  for (const t of uw.S.turfs) for (const k in t.inf) if (!Number.isFinite(t.inf[k])) bad.push('inf');
  for (const z in uw.S.market) for (const k in uw.S.market[z]) if (!uw.S.market[z][k].every(Number.isFinite)) bad.push('market');
  return {
    bad, peds: g.peds.peds.length, gang: g.peds.peds.filter(q => q.kind === 'gang' || q.kind === 'crew').length, veh: g.vehicles.list.length, groups: uw.gangs.groups.size,
    parts: g.fx.smoke.n + g.fx.glow.n, debris: g.fx.debris.length, markers: g.missions.markers.items.filter(m => m.used).length, opps: uw.S.opps.length,
    pending: g.police.pending.length, units: g.police.units.length, cops: g.police.cops.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    sur: g.player.pose.surrender || 0, state: g.player.state, gs: g.state, day: uw.S.day, voices: g.audio.voices || 0
  };
});
const spots = [[1, 6], [10, 8], [7, 9], [5, 2], [9, 2], [1, 1], [8, 10], [6, 5]];
let heap0 = 0;
for (let c = 0; c < CYCLES; c++) {
  const [bx, bz] = spots[c % spots.length];
  // travel and let the district stream in
  await ev(([bx, bz]) => { const g = window.game; g.resetPlayerState(bx * 80 + 40, bz * 80 + 2, Math.PI / 2); g.env.time = (g.env.time + 3.7) % 24; }, [bx, bz]);
  await frames(page, 40);
  // drive for a bit
  await ev(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x, p.pos.z + 2, Math.PI / 2, { parked: true }); g.completeEnter(v); });
  await page.keyboard.down('KeyW'); await frames(page, 40); await page.keyboard.down('KeyA'); await frames(page, 15); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS'); await frames(page, 25); await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyE'); await frames(page, 8);
  // pick a fight with the nearest crew, knock one down
  await ev(() => { const g = window.game, uw = g.uw; const gr = [...uw.gangs.groups.values()].find(x => x.kind === 'hang' && x.members.length); if (gr) { const m = gr.members[0]; uw.onPedHit(m, 'light', 5); m.health = 1; g.peds.knock(m, 1, 1, 3, true, 'melee'); } });
  await frames(page, 30);
  // a strategic day passes; a deal; a pursuit that is escaped
  await ev(() => { const g = window.game, uw = g.uw; for (let h = 0; h < 4; h++) uw.tickHours(6, h * 6); uw.tickDay(); uw.give({ green: 3 }); });
  await ev(() => { const g = window.game; g.police.setLevel(2); });
  await frames(page, 40);
  await ev(() => window.game.police.clear('soak escape'));
  await frames(page, 10);
  if (c % 2 === 1) {
    await ev(() => { const g = window.game; g.police.setLevel(1); g.onBusted(); });
    await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000 });
    await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 25; window.game.uw.prison.setSpeed(20); });
    await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000 });
  }
  if (c % 3 === 2) {
    await ev(() => window.game.onPlayerDeath('soak'));
    await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading && window.game.player.state === 'foot', null, { timeout: 120000 });
  }
  if (c % 2 === 0) {
    // save, quit to the menu and continue
    await ev(() => { const g = window.game; g.police.clear(); g.saveGame(true); g.quitToMenu(); });
    await frames(page, 4);
    await page.click('#btnContinue');
    await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  }
  await frames(page, 30);
  const h = await health();
  if (!heap0) heap0 = h.heap;
  check(`cycle ${c + 1}: world intact`, h.bad.length === 0 && h.peds < 90 && h.veh < 130 && h.groups <= 14 && h.gang <= 22 && h.markers < 40 && h.pending < 8 && h.sur === 0 && h.gs === 'playing' && h.voices < 60, JSON.stringify(h));
}
const last = await health();
check('heap stays bounded over the session', !heap0 || last.heap < heap0 * 1.8, `${(heap0 / 1e6).toFixed(1)}MB -> ${(last.heap / 1e6).toFixed(1)}MB`);
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'soak');
