/* Long-session soak: CYCLES rounds of everything a long play session does (travel, driving,
   reversing, fights, strategic days, deals, pursuits, arrests + jail, deaths, save / quit /
   continue, map use). After every round the world must be intact and behave like it did near
   startup: bounded entity / particle / audio counts, no NaN, no runaway listeners or timers,
   flat GPU memory, flat frame cost, no camera drift, sane physics, and a save that round-trips.
   Usage: CYCLES=10 node underworld/tests/soak.mjs */
import { launch, open, check, frames, startNew, finish, throughCourt } from './lib.mjs';
const CYCLES = +(process.env.CYCLES || 10);
// count live event listeners and intervals / pending timeouts from the very first script
const instrument = () => {
  const W = window; W.__lst = new Map(); W.__ivl = new Set(); W.__tmo = new Set();
  const key = (t, type, fn, cap) => { if (!t.__lid) t.__lid = Math.random().toString(36).slice(2); return t.__lid + '|' + type + '|' + (typeof cap === 'object' ? !!(cap && cap.capture) : !!cap); };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const fid = new WeakMap(); let n = 0; const idOf = fn => { if (!fn || (typeof fn !== 'function' && typeof fn !== 'object')) return 'x'; if (!fid.has(fn)) fid.set(fn, ++n); return fid.get(fn); };
  EventTarget.prototype.addEventListener = function (type, fn, opt) { const tag = this === W ? 'window' : this === document ? 'document' : this.id ? '#' + this.id : (this.constructor && this.constructor.name) || '?'; W.__lst.set(key(this, type, fn, opt) + '|' + idOf(fn), tag + ':' + type); return add.call(this, type, fn, opt); };
  EventTarget.prototype.removeEventListener = function (type, fn, opt) { W.__lst.delete(key(this, type, fn, opt) + '|' + idOf(fn)); return rem.call(this, type, fn, opt); };
  const si = W.setInterval, ci = W.clearInterval, st = W.setTimeout, ct = W.clearTimeout;
  W.setInterval = function (...a) { const id = si.apply(this, a); W.__ivl.add(id); return id; };
  W.clearInterval = function (id) { W.__ivl.delete(id); return ci.call(this, id); };
  W.setTimeout = function (fn, ms, ...rest) { let id; const wrap = typeof fn === 'function' ? function () { W.__tmo.delete(id); return fn.apply(this, arguments); } : fn; id = st.call(this, wrap, ms, ...rest); W.__tmo.add(id); return id; };
  W.clearTimeout = function (id) { W.__tmo.delete(id); return ct.call(this, id); };
};
const b = await launch();
const { page, errors } = await open(b, {}, instrument);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.input.wantLock = false; g.input.noLock = true; (g.money.W.clean = g.money.W.dirty.me = 200000); g.save.rep = 900; });
await page.mouse.move(240, 135);
const ev = (fn, a) => page.evaluate(fn, a);
// average frame cost over N rendered frames (wall clock) for the degradation check
const frameCost = async (n = 24) => { const t0 = Date.now(), f0 = await ev(() => window.game.frame); await frames(page, n); const f1 = await ev(() => window.game.frame); return (Date.now() - t0) / Math.max(1, f1 - f0); };
const health = () => ev(() => {
  const g = window.game, p = g.player, uw = g.uw, c = g.cam;
  const bad = [];
  if (![p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.z, p.h, p.health].every(Number.isFinite)) bad.push('player');
  for (const v of g.vehicles.list) {
    if (![v.pos.x, v.pos.y, v.pos.z, v.vel.x, v.vel.y, v.h].every(Number.isFinite)) { bad.push('veh NaN ' + v.type); break; }
    if (v.pos.y < -4 || v.pos.y > 80 || v.speed > 120) { bad.push(`veh unstable ${v.type} y=${v.pos.y.toFixed(1)} v=${v.speed.toFixed(1)}`); break; }
  }
  for (const q of g.peds.peds) if (![q.x, q.y, q.z].every(Number.isFinite)) { bad.push('ped ' + q.kind); break; }
  if (!Number.isFinite(g.money.total())) bad.push('money');
  for (const t of uw.S.turfs) for (const k in t.inf) if (!Number.isFinite(t.inf[k])) bad.push('inf');
  for (const z in uw.S.market) for (const k in uw.S.market[z]) if (!uw.S.market[z][k].every(Number.isFinite)) bad.push('market');
  // camera: finite, pitch inside its limits, looking at the player (no drift away)
  if (![c.yaw, c.pitch].every(Number.isFinite)) bad.push('cam NaN');
  if (c.pitch < -1.6 || c.pitch > 1.6) bad.push('cam pitch ' + c.pitch.toFixed(2));
  const cp = g.camera.position, camGap = Math.hypot(cp.x - p.pos.x, cp.z - p.pos.z);
  if (!Number.isFinite(camGap) || camGap > 15) bad.push('cam drift ' + camGap.toFixed(1));
  const mem = g.renderer.info.memory;
  return {
    bad, peds: g.peds.peds.length, gang: g.peds.peds.filter(q => q.kind === 'gang' || q.kind === 'crew').length, veh: g.vehicles.list.length, traffic: g.traffic.cars.length, groups: uw.gangs.groups.size,
    parts: g.fx.smoke.n + g.fx.glow.n, debris: g.fx.debris.length, markers: g.missions.markers.items.filter(m => m.used).length, opps: uw.S.opps.length, pickups: uw.pickups.list.length,
    pending: g.police.pending.length, units: g.police.units.length, cops: g.police.cops.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    geo: mem.geometries, tex: mem.textures, scene: g.scene.children.length, listeners: window.__lst.size, intervals: window.__ivl.size, timeouts: window.__tmo.size,
    vl: g.vehicles.list.filter(v => v.homeBlock === undefined || v.touched).map(v => `${v.type}:${Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))}${v.driver ? ':' + v.driver : ''}${v.mission ? ':m=' + (typeof v.mission === 'string' ? v.mission : 'obj') : ''}${v.owned ? ':own' : ''}${v.touched ? ':t' : ''}${v === p.lastVehicle ? ':last' : ''}${v.mode !== 'phys' ? ':' + v.mode : ''}${v.burnt ? ':burnt' : ''}${v.fac ? ':' + v.fac : ''}`).join(' '),
    orphans: g.vehicles.list.filter(v => (v.uwGroup && !uw.gangs.groups.has(v.uwGroup)) || ((v.mission === 'squad' || v.mission === 'shipment') && ![...uw.gangs.groups.values()].some(gr => (gr.cars || []).includes(v)))).length,
    loose: g.vehicles.list.filter(v => (v.homeBlock === undefined || v.touched) && !v.ai).length,
    sur: g.player.pose.surrender || 0, state: g.player.state, gs: g.state, day: uw.S.day, voices: g.audio.voices || 0, news: g.save.messages.length, phoneQ: g.content.phoneQ.length, toasts: document.getElementById('toasts').children.length
  };
});
const spots = [[1, 6], [10, 8], [7, 9], [5, 2], [9, 2], [1, 1], [8, 10], [6, 5]];
let base = null, cost0 = 0;
const hist = [];
for (let c = 0; c < CYCLES; c++) {
  const [bx, bz] = spots[c % spots.length];
  // travel and let the district stream in
  await ev(([bx, bz]) => { const g = window.game; g.resetPlayerState(bx * 80 + 40, bz * 80 + 2, Math.PI / 2); g.env.time = (g.env.time + 3.7) % 24; }, [bx, bz]);
  await frames(page, 40);
  // drive, reverse, exit
  await ev(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x, p.pos.z + 2, Math.PI / 2, { parked: true }); g.completeEnter(v); });
  await page.keyboard.down('KeyW'); await frames(page, 40); await page.keyboard.down('KeyA'); await frames(page, 15); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS'); await frames(page, 30); await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyE'); await frames(page, 8);
  // fight: provoke the nearest crew, knock one down, throw a combo
  await ev(() => { const g = window.game, uw = g.uw; const gr = [...uw.gangs.groups.values()].find(x => x.kind === 'hang' && x.members.length); if (gr) { const m = gr.members[0]; uw.onPedHit(m, 'light', 5); m.health = 1; g.peds.knock(m, 1, 1, 3, true, 'melee'); } });
  for (let k = 0; k < 3; k++) { await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 8); }
  await frames(page, 20);
  // a strategic day passes; a deal; a pursuit that is escaped
  await ev(() => { const g = window.game, uw = g.uw; for (let h = 0; h < 4; h++) uw.tickHours(6, h * 6); uw.tickDay(); uw.give({ green: 3 }); });
  await ev(() => { const g = window.game; g.police.setLevel(2); });
  await frames(page, 40);
  await ev(() => window.game.police.clear('soak escape'));
  await frames(page, 10);
  // map + overlay
  await page.keyboard.press('KeyM'); await frames(page, 3); await page.keyboard.press('KeyT'); await frames(page, 2); await page.keyboard.press('KeyT'); await frames(page, 2); await page.keyboard.press('KeyM'); await frames(page, 3);
  if (c % 2 === 1) {
    await ev(() => { const g = window.game; g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
    await throughCourt(page);
    await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000 });
    await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 2; });
    await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000 });
  }
  if (c % 3 === 2) {
    await ev(() => window.game.onPlayerDeath('soak'));
    await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading && window.game.player.state === 'foot', null, { timeout: 120000 });
  }
  if (c % 2 === 0) {
    // save, quit to the menu and continue: the save must round-trip exactly
    const sv = await ev(() => { const g = window.game; g.police.clear(); const ok = g.saveGame(true); const r = { ok, money: g.money.total(), day: g.uw.S.day, crew: g.uw.S.crew.length, own: g.uw.owner.join() }; g.quitToMenu(); return r; });
    await frames(page, 4);
    await page.click('#btnContinue');
    await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
    const ld = await ev(() => { const g = window.game; return { ok: true, money: g.money.total(), day: g.uw.S.day, crew: g.uw.S.crew.length, own: g.uw.owner.join() }; });
    check(`cycle ${c + 1}: save round-trips through quit + continue`, JSON.stringify(sv) === JSON.stringify(ld), JSON.stringify([sv, ld]).slice(0, 300));
  }
  // let one-shot timers (voices, toasts, fades) settle before measuring
  await ev(() => { const g = window.game; g.resetPlayerState(6 * 80 + 40, 6 * 80 + 2, 0); g.env.time = 12; });
  await frames(page, 60);
  const cost = await frameCost();
  const h = await health();
  hist.push({ cost: +cost.toFixed(0), ...h });
  if (!base) { base = h; cost0 = cost; }
  check(`cycle ${c + 1}: world intact`, h.bad.length === 0 && h.peds < 90 && h.veh < 130 && h.groups <= 14 && h.gang <= 22 && h.markers < 40 && h.pending < 8 && h.sur === 0 && h.gs === 'playing' && h.voices < 60 && h.parts < 2000 && h.debris < 400 && h.pickups <= 51 && h.toasts < 12 && h.news <= 60 && h.phoneQ < 30, JSON.stringify(h));
  check(`cycle ${c + 1}: no listener / timer growth, no orphaned or piling-up cars`, h.listeners <= base.listeners + 4 && h.intervals <= base.intervals + 1 && h.timeouts < 120 && h.orphans === 0 && h.loose <= 14,
    `listeners ${base.listeners}->${h.listeners} intervals ${base.intervals}->${h.intervals} timeouts ${h.timeouts} orphans ${h.orphans} loose cars ${h.loose}`);
}
const last = hist[hist.length - 1];
// GPU resources track what is on screen (car types, wreck geometry, interiors visited); they must
// plateau, not climb: the late third of the session may not exceed the middle third's peak by much
const third = Math.max(1, Math.floor(hist.length / 3));
const mid = hist.slice(third, 2 * third), late = hist.slice(2 * third);
const peak = (arr, k) => Math.max(...arr.map(q => q[k]));
for (const k of ['geo', 'tex', 'scene', 'veh']) check(`${k} plateaus (late peak <= mid peak x1.15 + 15)`, peak(late, k) <= peak(mid, k) * 1.15 + 15, `mid peak ${peak(mid, k)}, late peak ${peak(late, k)}, all ${hist.map(q => q[k]).join(',')}`);
const lateCost = hist.slice(-3).reduce((a, q) => a + q.cost, 0) / Math.min(3, hist.length), earlyCost = hist.slice(0, 3).reduce((a, q) => a + q.cost, 0) / Math.min(3, hist.length);
check('frame cost late in the session ~ early in the session (<= 1.5x)', lateCost <= earlyCost * 1.5, `early ${earlyCost.toFixed(0)} ms/frame, late ${lateCost.toFixed(0)} ms/frame (SwiftShader)`);
check('heap stays bounded over the session', !base.heap || last.heap < base.heap * 1.6, `${(base.heap / 1e6).toFixed(1)}MB -> ${(last.heap / 1e6).toFixed(1)}MB`);
for (const q of hist) console.log('vehicles:', q.veh, q.vl);
console.log('per-cycle:', JSON.stringify(hist.map(q => ({ cost: q.cost, heap: +(q.heap / 1e6).toFixed(1), peds: q.peds, veh: q.veh, traffic: q.traffic, geo: q.geo, tex: q.tex, lst: q.listeners, tmo: q.timeouts, parts: q.parts }))));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'soak');
