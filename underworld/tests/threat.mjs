/* Threats against the player's empire (Session 4A: §10, §45.10, §45.16, §45.26).
   - Pressure comes only from what the player does to a gang (no pressure, no threats, no move on your turf), and
     its stage decides what they go for: intimidation, then hits on assets, then strikes on warehouses and turf.
   - A threat is a warning, then THREAT IMMINENT about 2 minutes of real active play later, then the attack about
     a minute after that. The pause menu, a hidden tab and loading freeze the clock; the map and phone don't; the
     world's day length doesn't change it.
   - Opening the threat sets the route to the asset. Threats persist through save/load with their clock, strength
     and dice; a reload never resets, rerolls, duplicates or stacks them.
   - With the player away (or jailed) the crew defend on their own, decided by what is really there: Enforcers, the
     district's Lieutenant, a warehouse's level, breaches and patches, cameras and staffing. Maximum Security with
     staffing turns back anything short of a coordinated strike. Losses are real and persistent.
   - With the player there, the attackers turn up in person: at a warehouse they bring a car for a gate it can break
     (and it breaks through the 3B ram rules), and are kept out by one it can't. A reload mid-fight settles it once. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game, uw = g.uw, M = g.money;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false; g.env.time = 13;
  window.__hire = (role, assign) => { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; const e = uw.crew.hire(0); if (e) throw new Error(e); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90; c.traits = []; c.skill = 60; if (role) { const r = uw.crew.assign(c.id, role, assign); if (r) throw new Error(r); } return c.id; };
  window.__T = (id, t) => { const st = uw.whse.st(id); for (const k of ['perimeter', 'surveillance', 'access', 'vault']) st.up[k] = typeof t === 'number' ? t : (t[k] || 0); uw.compounds.build(id); };
  const dl = uw.S.crew.find(c => c.role === 'dealer' && c.status !== 'gone'); if (dl) { window.__dealer = dl.id; window.__corner = dl.assign; }
  window.__fid = () => { const T = uw.T.find(t => uw.owner[t.i] && uw.owner[t.i] !== 'pc' && !uw.S.factions[uw.owner[t.i]].broken); return uw.owner[T.i]; };
});
await helpers();

// ---------------------------------------------------------------- 1. pressure only from what you do
const p0 = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  const start = Object.fromEntries(Object.keys(S.factions).map(k => [k, S.factions[k].press]));
  // a fortnight of days with no pressure at all
  const war0 = S.turfs.filter(t => t.war && t.war.d === 'pc').length;
  for (let d = 0; d < 14; d++) uw.tickDay();
  return { start, threats: uw.threats.open().length, log: uw.S.threats.log.length, warsOnYou: S.turfs.filter(t => t.war && t.war.d === 'pc').length - war0 };
});
check('a new career: no gang has a grievance, and two weeks pass with no threats and no move on your turf', Object.values(p0.start).every(v => v === 0) && p0.threats === 0 && p0.log === 0 && p0.warsOnYou <= 0, JSON.stringify(p0));
const p1 = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, fid = window.__fid(), f = S.factions[fid];
  const i = uw.T.findIndex(t => uw.owner[t.i] === fid && !S.turfs[t.i].war);
  uw.transferTurf(i, 'pc', 'take'); const afterTake = f.press;
  // knock two of their people down in a fight you started (room under the gang cap: the fortnight's police raid
  // scenes would otherwise fill it)
  for (const q of [...uw.gangs.groups.values()]) if (q.kind === 'raid' || q.kind === 'rguard') uw.gangs.removeGroup(q);
  const gr = uw.gangs.spawnGroup('presstest', 'raid', fid, { x: g.player.pos.x + 4, z: g.player.pos.z, h: 0 }, 2, {});
  const n = gr.members.length;
  for (const m of gr.members) { m.lastHitBy = 'pc'; uw.gangs.onDown(m, true, true); }
  uw.gangs.removeGroup(gr);
  return { fid, afterTake, afterKo: f.press, n, hist: f.hist.map(h => h.why) };
});
check('taking their turf and putting their people down builds their grievance, and it is recorded', p1.afterTake === 30 && p1.n > 0 && p1.afterKo === 30 + 2 * p1.n && p1.hist.some(h => /took/.test(h)) && p1.hist.some(h => /put down/.test(h)), JSON.stringify(p1));
const p2 = await ev(fid => { const uw = window.game.uw, f = uw.S.factions[fid]; const a = f.press; uw.threats.tickDay(false); const b2 = f.press; return { a, b: b2, expect: Math.max(0, a * 0.85 - 2) }; }, p1.fid);
check('a grievance fades each day (×0.85, −2) when nothing new happens', Math.abs(p2.b - p2.expect) < 1e-9, JSON.stringify(p2));

// ---------------------------------------------------------------- 2. an empire to threaten, and what each stage goes for
const emp = await ev(fid => {
  const g = window.game, uw = g.uw, S = uw.S, M = g.money;
  M.W.clean = 1e9; M.W.dirty.me = 1e6;
  for (const id of ['whse_w', 'linden', 'diner']) if (window.__pv.PROP_BY_ID[id] && !uw.props.owned(id)) uw.props.buy(id);
  const biz = window.__pv.PROPS.find(p => p.kind === 'business' && uw.props.owned(p.id)) || window.__pv.PROPS.find(p => p.kind === 'business'); if (!uw.props.owned(biz.id)) uw.props.buy(biz.id);
  // a corner of yours next to their ground, with a Dealer on it
  const mine = uw.T.findIndex(t => uw.owner[t.i] === 'pc' && !S.turfs[t.i].war && uw.turfNeighbors(t.i).some(j => uw.owner[j] === fid));
  S.threats.list = [];
  window.__dealer = window.__hire('dealer', mine); window.__corner = mine;
  window.__pv.Inv.add(S.storage.linden || (S.storage.linden = {}), 'green', 10, 100);
  const kinds = {};
  for (const [st, press] of [[1, 25], [2, 45], [3, 75]]) { S.factions[fid].press = press; const seen = new Set(); for (let k = 0; k < 300; k++) { const t = uw.threats.pickTarget(fid, uw.threats.stage(fid)); if (t) seen.add(t.kind); } kinds[st] = [...seen].sort(); }
  S.factions[fid].press = 0;
  return { kinds, biz: biz.id, corner: mine };
}, p1.fid);
check('intimidation goes for corners and businesses; hits add stashes; strikes add warehouses and turf', emp.kinds[1].join() === 'business,dealer' && emp.kinds[2].includes('stash') && !emp.kinds[2].includes('warehouse') && emp.kinds[3].includes('warehouse') && emp.kinds[3].includes('turf'), JSON.stringify(emp.kinds));

// ---------------------------------------------------------------- 3. the clock: real active play only
const c0 = await ev(fid => { const uw = window.game.uw; const o = uw.threats.create(fid, 'business', { prop: window.__pv.PROPS.find(p => p.kind === 'business' && uw.props.owned(p.id)).id }, 2); window.__th = o.id; return { state: o.state, left: o.left, msg: window.game.save.messages.slice(-1)[0].text }; }, p1.fid);
check('a threat starts as a message warning with about two minutes on the clock', c0.state === 'warned' && c0.left === 120 && /threat against/.test(c0.msg), JSON.stringify(c0));
// how much the clock ran down, and how much wall time passed between the threat system's own updates meanwhile
const tick = async (setup, ms, teardown) => {
  await ev(setup || (() => {}));
  const snap = () => ev(() => { const uw = window.game.uw; return { left: uw.S.threats.list.find(o => o.id === window.__th).left, t0: uw.threats.t0 }; });
  const a = await snap(); await new Promise(r => setTimeout(r, ms)); const z = await snap();
  await ev(teardown || (() => {}));
  return { ran: +(a.left - z.left).toFixed(3), wall: +((z.t0 - a.t0) / 1000).toFixed(3) };
};
const play = await tick(() => { window.game.save.settings.dayLength = 8; }, 3000);
const slowDay = await tick(() => { window.game.save.settings.dayLength = 120; }, 3000);
const paused = await tick(() => window.game.pause(), 3000, () => window.game.resume());
const map = await tick(() => { window.game.mapOpen = true; }, 3000, () => { window.game.mapOpen = false; });
const hidden = await tick(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); window.__vis = true; }, 2000, () => { delete document.hidden; });
const loading = await tick(() => { window.__st = window.game.state; window.game.state = 'loading'; }, 2000, () => { window.game.state = window.__st; });
const real = r => r.wall > 1 && Math.abs(r.ran - r.wall) < 0.02;
check('the clock runs in real seconds of play (exactly the wall time between frames), whatever the day length', real(play) && real(slowDay), JSON.stringify({ play, slowDay }));
check('the pause menu, a hidden tab and loading freeze it; the map does not', paused.ran === 0 && hidden.ran === 0 && loading.ran === 0 && real(map), JSON.stringify({ paused, map, hidden, loading }));
const c1 = await ev(() => { const uw = window.game.uw, o = uw.S.threats.list.find(x => x.id === window.__th); uw.threats.update(o.left + 0.01); return { state: o.state, left: o.left, msg: window.game.save.messages.slice(-1)[0].text }; });
check('when the warning runs out: THREAT IMMINENT, with about a minute left', c1.state === 'imminent' && c1.left === 60 && /THREAT IMMINENT/.test(c1.msg), JSON.stringify(c1));
const dl = await ev(() => { const g = window.game, uw = g.uw, o = uw.S.threats.list.find(x => x.id === window.__th); const html = uw.threats.feedHTML(s => s); const ok = uw.threats.openThreat(o.id); const w = g.content.waypoint; return { html: /data-act="threat:/.test(html) && /IMMINENT/.test(html), ok, opened: o.opened, wp: w && Math.hypot(w.x - o.x, w.z - o.z) < 0.5, label: w && w.label }; });
check('the Feed lists it with its clock; opening it routes you to the threatened asset', dl.html && dl.ok && dl.opened && dl.wp, JSON.stringify(dl));

// ---------------------------------------------------------------- 4. save/reload: same threat, same clock, same dice, never two
const s0 = await ev(() => { const g = window.game, uw = g.uw, o = uw.S.threats.list.find(x => x.id === window.__th); o.left = 37.5; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { ...o, n: uw.threats.open().length }; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await ev(() => window.game.pause());
await helpers();
const s1 = await ev(id => { const uw = window.game.uw, o = uw.S.threats.list.find(x => x.id === id); const dup = uw.threats.create(o.fid, o.kind, o.target, 2); for (let k = 0; k < 6; k++) uw.threats.tickDay(false); return { o: { ...o }, n: uw.threats.open().length, same: uw.threats.open().filter(x => x.key === o.key).length, dup: dup === null }; }, s0.id);
check('save → reload: the threat is still there with the same clock, strength and dice', s1.o.state === 'imminent' && Math.abs(s1.o.left - 37.5) < 0.6 && s1.o.power === s0.power && s1.o.roll === s0.roll && s1.o.opened, JSON.stringify({ s0, s1 }));
check('…and a reload or new days never stack a second threat on the same asset', s1.dup && s1.same === 1, JSON.stringify(s1));
await ev(() => window.game.resume());

// ---------------------------------------------------------------- 5. away: the crew defend with what is really there
const wh = await ev(fid => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  g.resetPlayerState(100, 100, 0); S.threats.list = [];
  window.__T('whse_w', 2);
  const mk = (stage) => { const o = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, stage); return o; };
  const o = mk(3); window.__wo = o.id;
  out.bare = uw.threats.defense(o).D;
  const e1 = window.__hire('enforcer', 'w:whse_w'), e2 = window.__hire('enforcer', 'w:whse_w');
  out.enforcers = uw.threats.defense(o).D;
  const lt = window.__hire('lieutenant', 'w:whse_w');
  out.lieutenant = uw.threats.defense(o).D;
  window.__T('whse_w', { perimeter: 2, surveillance: 4, access: 2, vault: 2 }); out.cameras = uw.threats.defense(o).D;
  window.__T('whse_w', 2);
  // a rammed gate still open, then patched, then repaired
  const br = uw.compounds.breaches('whse_w'); br.gate = { s: 'broken', t: S.econH, tier: 2 }; uw.compounds.build('whse_w', true); out.breached = uw.threats.defense(o).D; out.parts = uw.threats.defense(o).parts;
  br.gate.s = 'patched'; uw.compounds.build('whse_w', true); out.patched = uw.threats.defense(o).D;
  delete br.gate; uw.compounds.build('whse_w', true); out.repaired = uw.threats.defense(o).D;
  // Maximum Security with staffing: an ordinary hit (stage 2) is turned back whatever the dice; a strike is not automatic
  window.__T('whse_w', 4); window.__hire('enforcer', 'w:whse_w'); window.__hire('enforcer', 'w:whse_w');
  out.immune = uw.whse.immune('whse_w');
  const hit = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, 2) || o; hit.roll = 0.9999; hit.stage = 2; out.ordinary = uw.threats.resolve(hit);
  return out;
}, p1.fid);
check('the warehouse defense counts its Enforcers, its Lieutenant and its cameras', wh.enforcers > wh.bare && wh.lieutenant > wh.enforcers && wh.cameras > wh.lieutenant, JSON.stringify(wh));
check('an open breach weakens it, a patch less so, a full repair restores it', wh.breached < wh.patched && wh.patched < wh.repaired && wh.parts.breaches < 0, JSON.stringify(wh));
check('Maximum Security with its staffing turns back an ordinary hit even on the worst dice', wh.immune && wh.ordinary === 'held', JSON.stringify(wh));
// the same threat, the same dice, two different warehouses: the outcome follows the security
const fair = await ev(fid => {
  const g = window.game, uw = g.uw, S = uw.S, M = g.money, out = {};
  for (const c of uw.crew.active()) if (c.assign === 'w:whse_w') uw.crew.assign(c.id, 'idle', null);
  const run = (T, open) => {
    window.__T('whse_w', T); const br = uw.compounds.breaches('whse_w'); for (const k in br) delete br[k]; if (open) br.gate = { s: 'broken', t: S.econH, tier: T }; uw.compounds.build('whse_w', true);
    S.storage.whse_w = {}; window.__pv.Inv.add(S.storage.whse_w, 'green', 100, 100); M.W.dirty.prop.whse_w = 100000;
    const o = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, 3); o.power = 40; o.roll = 0.5;
    const r = uw.threats.defense(o), res = uw.threats.resolve(o);
    return { D: Math.round(r.D), res, stock: window.__pv.Inv.has(S.storage.whse_w, 'green'), vault: M.W.dirty.prop.whse_w, gate: uw.compounds.breaches('whse_w').gate ? uw.compounds.breaches('whse_w').gate.s : 'ok' };
  };
  out.strong = run(3, false);
  out.weak = run(1, true);
  out.log = uw.S.threats.log.slice(-1)[0];
  return out;
}, p1.fid);
check('same attack, same dice: a well-built warehouse holds; a weak one with its gate down is hit', fair.strong.res === 'held' && fair.weak.res === 'hit', JSON.stringify(fair));
const hist = await ev(fid => { const uw = window.game.uw, S = uw.S; S.threats.list = []; const o = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, 3); const b2 = o.bonus; S.threats.list = []; const other = uw.threats.create(fid, 'stash', { prop: 'linden' }, 3).bonus; S.threats.list = []; return { b: b2, other }; }, p1.fid);
check('history counts: after a successful hit on that warehouse the gang comes back to it stronger (not to other assets)', hist.b === 0.15 && hist.other === 0, JSON.stringify(hist));
check('a hit costs real stock and vault cash, and leaves the gate broken (a breach that persists until mended)', fair.strong.stock === 100 && fair.weak.stock === 70 && fair.weak.vault === 80000 && fair.weak.gate === 'broken' && fair.log.outcome === 'hit', JSON.stringify(fair));
const other = await ev(fid => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  const i = window.__corner; S.threats.list = [];
  // a Dealer's corner: Enforcers there and the district's Lieutenant make the difference
  const o1 = uw.threats.create(fid, 'dealer', { turf: i }, 2); out.alone = uw.threats.defense(o1).D;
  window.__hire('enforcer', i); out.guarded = uw.threats.defense(o1).D;
  window.__pv.Inv.add(uw.whse.turfStock(i), 'green', 20, 100); o1.power = 500; o1.roll = 0.99; out.res = uw.threats.resolve(o1);
  out.stock = window.__pv.Inv.has(uw.whse.turfStock(i), 'green'); out.dealer = uw.crew.find(window.__dealer).status;
  // a business hit wrecks the place until it is repaired
  const bid = window.__pv.PROPS.find(p => p.kind === 'business' && uw.props.owned(p.id)).id;
  const o2 = uw.threats.open().find(x => x.kind === 'business') || uw.threats.create(fid, 'business', { prop: bid }, 2);
  o2.power = 500; o2.roll = 0.99; out.biz = uw.threats.resolve(o2); out.dmg = uw.S.props[o2.target.prop].dmg;
  return out;
}, p1.fid);
check('a corner with an Enforcer on it is harder to hit; when it is hit, the Dealer is hurt and corner stock goes', other.guarded > other.alone && other.res === 'hit' && other.stock === 8 && other.dealer === 'hurt', JSON.stringify(other));
check('a business that is hit is wrecked (income stops) until you repair it', other.biz === 'hit' && other.dmg === 1, JSON.stringify(other));

// ---------------------------------------------------------------- 6. in jail, the crew settle it without you
await ev(fid => { const g = window.game, uw = g.uw; for (const o of uw.threats.open()) o.state = 'done'; uw.S.threats.list = []; const o = uw.threats.create(fid, 'stash', { prop: 'linden' }, 2); o.left = 3; o.state = 'imminent'; window.__jt = o.id; g.uw.S.rap.cur = { pickpocket: 1 }; g.police.enabled = true; g.police.setLevel(1); g.onBusted(); }, p1.fid);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
await page.waitForFunction(id => window.game.uw.S.threats.log.some(l => l.id === id), await ev(() => window.__jt), { timeout: 60000, polling: 250 });
const jail = await ev(id => { const uw = window.game.uw, l = uw.S.threats.log.find(x => x.id === id); return { l, live: uw.threats.live.size, still: uw.threats.open().some(o => o.id === id) }; }, await ev(() => window.__jt));
check('jailed: the threat still lands on time and the crew settle it without you (no fight spawned, one result)', jail.l && ['held', 'hit'].includes(jail.l.outcome) && jail.live === 0 && !jail.still && jail.l.parts.you === undefined, JSON.stringify(jail));
await ev(() => { const g = window.game; g.uw.S.jail = null; g.police.enabled = false; g.resetPlayerState(100, 100, 0); });
await frames(page, 10);

// ---------------------------------------------------------------- 7. there in person: the attackers come to the compound
const phys = async (T) => {
  await ev(([fid, T]) => {
    const g = window.game, uw = g.uw, C = g.world.compounds.whse_w;
    for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle && Math.hypot(v.pos.x - C.center.x, v.pos.z - C.center.z) < 80) { g.vreg.forget(v); g.vehicles.despawn(v); }
    window.__T('whse_w', T); const br = uw.compounds.breaches('whse_w'); for (const k in br) delete br[k]; uw.compounds.build('whse_w', true);
    g.resetPlayerState(C.door.x, C.door.z + Math.cos(C.door.h) * 2, 0);
    uw.S.threats.list = []; const o = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, 3); o.state = 'imminent'; o.left = 0.05; window.__pt = o.id;
  }, [p1.fid, T]);
  await frames(page, 12);
  const start = await ev(() => { const uw = window.game.uw, o = uw.S.threats.list.find(x => x.id === window.__pt), A = uw.threats.live.get(window.__pt); return { state: o && o.state, attackers: A ? A.gr.members.length : 0, car: !!(A && A.gr.cars) }; });
  let res = null;
  for (let k = 0; k < 200 && !res; k++) { await frames(page, 15); res = await ev(() => window.game.uw.S.threats.log.find(l => l.id === window.__pt) || null); if (k === 40 && !res) await ev(() => { const o = window.game.uw.S.threats.list.find(x => x.id === window.__pt); if (o) o.left = Math.min(o.left, 2); }); }
  const after = await ev(() => { const g = window.game, uw = g.uw, R = uw.compounds.R.whse_w, gr = [...uw.gangs.groups.values()].find(x => x.kind === 'assault'); return { gate: R.gate ? R.gate.state : 'none', saved: uw.compounds.breaches('whse_w').gate ? uw.compounds.breaches('whse_w').gate.s : 'none', groups: gr ? 1 : 0, inside: 0 }; });
  return { start, res: res && { outcome: res.outcome, you: res.parts.you }, after };
};
const weakGate = await phys(1), maxGate = await phys(4);
check('there in person at a basic gate: the attackers turn up, ram the gate down (a real breach), and the fight is settled', weakGate.start.state === 'live' && weakGate.start.attackers >= 3 && weakGate.start.car && weakGate.after.saved === 'broken' && weakGate.res && ['held', 'hit'].includes(weakGate.res.outcome) && weakGate.after.groups === 0, JSON.stringify(weakGate));
check('at Maximum Security they bring no car (nothing to ram) and the gate stays shut', maxGate.start.state === 'live' && !maxGate.start.car && maxGate.after.gate === 'ok' && maxGate.res && maxGate.after.groups === 0, JSON.stringify(maxGate));
// a reload in the middle of a fight settles it once, without a second assault
await ev(fid => { const g = window.game, uw = g.uw, C = g.world.compounds.whse_w; uw.S.threats.list = []; const o = uw.threats.create(fid, 'warehouse', { prop: 'whse_w' }, 3); o.state = 'imminent'; o.left = 0.05; window.__rt = o.id; }, p1.fid);
await frames(page, 10);
const midId = await ev(() => { const g = window.game; const o = g.uw.S.threats.list.find(x => x.id === window.__rt); const st = o && o.state; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { id: window.__rt, st }; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 20);
await helpers();
const mid = await ev(id => { const uw = window.game.uw; return { results: uw.S.threats.log.filter(l => l.id === id).length, open: uw.threats.open().filter(o => o.id === id).length, assaults: [...uw.gangs.groups.values()].filter(x => x.kind === 'assault').length }; }, midId.id);
check('reloaded in the middle of the assault: it is settled exactly once, with no second assault', midId.st === 'live' && mid.results === 1 && mid.open === 0 && mid.assaults === 0, JSON.stringify({ midId, mid }));

// ---------------------------------------------------------------- 8. a turf takeback is announced, then becomes the showdown
const turf = await ev(fid => { const uw = window.game.uw, S = uw.S; const i = window.__corner; S.threats.list = []; const o = uw.threats.create(fid, 'turf', { turf: i }, 3); uw.threats.update(o.left + 0.01); uw.threats.update(61); return { war: S.turfs[i].war && S.turfs[i].war.a, log: S.threats.log.slice(-1)[0].outcome }; }, p1.fid);
check('a turf threat ends in their showdown on that turf (decided by the war system, with your crew and you)', turf.war === p1.fid && turf.log === 'war', JSON.stringify(turf));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'threat');
