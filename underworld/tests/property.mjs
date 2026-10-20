/* Property ladder and vehicle storage: twenty-odd unique homes across six tiers; parking
   capacity grows with the tier; stored cars stand in their bays; garage doors open only for
   the owner; a full garage refuses another car; the mansion's ten-car motor court and the
   penthouse's lobby / elevator / garage all work; house interiors load on demand and are
   thrown away on exit; saves keep every car in its bay, and old saves are migrated. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = async () => { await page.waitForFunction(() => !window.game.fading, null, { timeout: 30000 }); await frames(page, 5); };
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; (g.money.W.clean = g.money.W.dirty.me = 5e6); });

// 1. the ladder
const lad = await ev(() => {
  const g = window.game, PM = g.uw.props, PB = window.__pv.PROP_BY_ID;
  const L = g.world.homeProps.map(id => { const d = PB[id], bs = PM.bays(d); const k = {}; for (const x of bs) k[x.kind] = (k[x.kind] || 0) + 1; return { id, tier: d.tier, name: d.name, price: d.price, cap: bs.length, k, home: d.home || null }; });
  return L;
});
const tiers = [1, 2, 3, 4, 5, 6].map(t => lad.filter(x => x.tier === t));
check('forty-five purchasable homes (v6 ladder)', lad.length === 45, lad.length + ' homes');
check('every tier from cheap rental to endgame has homes', tiers.every(t => t.length >= 1), tiers.map(t => t.length).join(','));
check('every home has its own name and its own building', new Set(lad.map(x => x.name)).size === lad.length && new Set(lad.filter(x => x.home).map(x => x.home)).size === lad.filter(x => x.home).length);
const T = id => lad.find(x => x.id === id) || { k: {}, cap: 0 };
check('tier 1: one kerbside space', tiers[0].every(x => x.cap === 1 && (x.k.street || x.k.lot)), JSON.stringify(tiers[0].map(x => x.k)));
check('tier 2: carport or lot, one or two cars', tiers[1].every(x => x.cap >= 1 && x.cap <= 2), JSON.stringify(tiers[1].map(x => x.k)));
check('single garage homes hold 1, double 2, triple 3', T('single1').k.single === 1 && T('double1').k.double === 2 && T('triple1').k.triple === 3, JSON.stringify([T('single1').k, T('double1').k, T('triple1').k]));
check('the mansion has a ten-car underground garage', T('mansion').k.under === 10, JSON.stringify(T('mansion').k));
check('the penthouse has one reserved outdoor space and four underground', T('penthouse').k.outdoor === 1 && T('penthouse').k.under === 4, JSON.stringify(T('penthouse').k));
const maxCap = tiers.map(t => Math.max(...t.map(x => x.cap)));
check('parking capacity grows up the ladder', maxCap[0] <= maxCap[2] && maxCap[2] <= maxCap[3] && maxCap[3] <= maxCap[4] && maxCap[4] < maxCap[5], maxCap.join(','));
check('prices rise with the tier', Math.max(...tiers[0].map(x => x.price)) < Math.min(...tiers[3].map(x => x.price)) && Math.max(...tiers[3].map(x => x.price)) < Math.min(...tiers[4].map(x => x.price)) && Math.max(...tiers[4].map(x => x.price)) < Math.min(...tiers[5].map(x => x.price)));

// 2. buy a double-garage house; the garage door is shut to strangers, open to the owner
const door0 = await ev(() => { const g = window.game, d = g.doors.byId('gd:double1'), h = g.world.homes.find(x => x.propId === 'double1'); const f = [[0, -1], [0, 1], [-1, 0], [1, 0]][h.face]; const x = h.garageFront.x + f[0] * 6, z = h.garageFront.z + f[1] * 6; g.resetPlayerState(x, z, 0); const v = g.vehicles.spawn('sedan', x, z, Math.atan2(-f[0], -f[1]), { parked: true }); v.touched = true; g.completeEnter(v); window.__v = v; window.__f = f; return !!d; });
await frames(page, 60);
const shut = await ev(() => { const d = window.game.doors.byId('gd:double1'); return { open: d.open, col: d.col.on }; });
check('a garage door stays shut for someone who does not own the house', door0 && shut.open === 0 && shut.col, JSON.stringify(shut));
const bought = await ev(() => window.game.uw.props.buy('double1'));
await frames(page, 80);
const opened = await ev(() => { const d = window.game.doors.byId('gd:double1'); return { open: +d.open.toFixed(2), col: d.col.on }; });
check('after buying it, the door opens as you drive up', bought === '' && opened.open > 0.9 && !opened.col, JSON.stringify({ bought, opened }));
// store two cars in the double garage, a third is refused
const store = async (type) => ev(([type]) => { const g = window.game, PM = g.uw.props, PB = window.__pv.PROP_BY_ID, bays = PM.bays(PB.double1), fb = PM.freeBay(PB.double1); let v = g.player.vehicle; if (!v) { const b0 = bays[0]; v = g.vehicles.spawn(type, b0.x + 9, b0.z + 9, 0, { parked: true }); v.touched = true; g.resetPlayerState(v.pos.x + 2.6, v.pos.z, 0); g.completeEnter(v); } const tgt = fb || bays[0]; v.pos.set(tgt.x, v.pos.y, tgt.z); v.h = tgt.h; v.vel.set(0, 0); return null; }, [type]);
await store('sedan'); await frames(page, 6);
const s1 = await ev(() => { const g = window.game, a = g.uw.findAction(); const l = a && a.label; if (a) a.act(); return { l, n: g.save.garage.length, st: g.player.state }; });
check('drive into a garage bay and stop: "Park & save" stores the car', /Park & save/.test(s1.l) && s1.n === 1 && s1.st === 'foot', JSON.stringify(s1));
await store('compact'); await frames(page, 6);
const s2 = await ev(() => { const g = window.game, a = g.uw.findAction(); const l = a && a.label; if (a) a.act(); return { l, n: g.save.garage.length }; });
check('the second bay takes a second car', s2.n === 2, JSON.stringify(s2));
const s3 = await ev(() => { const g = window.game, PM = g.uw.props, PB = window.__pv.PROP_BY_ID, b0 = PM.bays(PB.double1)[0]; const v = g.vehicles.spawn('van', b0.x + 12, b0.z + 12, 0, { parked: true }); v.touched = true; g.resetPlayerState(v.pos.x + 2.6, v.pos.z, 0); g.completeEnter(v); const ok = g.content.storeVehicle(v, { id: 'double1' }); return { ok, n: g.save.garage.length }; });
check('a full garage refuses a third car', s3.ok === false && s3.n === 2, JSON.stringify(s3));
await ev(() => { const g = window.game; g.exitVehicle(true); });
// the stored cars are physically in their bays
const phys = await ev(() => { const g = window.game, PM = g.uw.props, PB = window.__pv.PROP_BY_ID; return g.save.garage.map(e => { const bay = PM.bays(PB[e.at.p])[e.at.i], v = g.vehicles.list.find(x => x.garageUid === e.uid); return v ? +Math.hypot(v.pos.x - bay.x, v.pos.z - bay.z).toFixed(2) : -1; }); });
check('stored cars stand in their garage bays', phys.length === 2 && phys.every(d => d >= 0 && d < 0.6), JSON.stringify(phys));

// 3. saving keeps every car in its bay; old saves without bays are migrated
const before = await ev(() => { const g = window.game; g.saveGame(true); return g.save.garage.map(e => e.uid + ':' + e.at.p + ':' + e.at.i).join(','); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const after = await ev(() => { const g = window.game; return g.save.garage.map(e => e.uid + ':' + e.at.p + ':' + e.at.i).join(','); });
check('a save and reload keeps every stored car in its bay', before === after && after.length > 0, before + ' | ' + after);
await ev(() => { const g = window.game, h = g.world.homes.find(x => x.propId === 'double1'); g.events.cool = 1e9; g.police.enabled = false; g.resetPlayerState(h.door.x, h.door.z, 0); });
await frames(page, 40);
const reapp = await ev(() => window.game.vehicles.list.filter(v => v.garageUid && v.display).length);
check('after reloading, the stored cars are back in the garage when you arrive', reapp === 2, reapp + ' shown');
const mig = await ev(() => { const g = window.game; g.save.garage.push({ uid: 9001, type: 'muscle', color: 0x222222, origin: 'bought', dmg: 0, tune: { engine: 0, brakes: 0, grip: 0, armor: 0 } }); g.uw.props.assignBays(); const e = g.save.garage.find(x => x.uid === 9001); const r = { at: e.at }; g.save.garage.pop(); return r; });
check('a car from an old save (no bay) is given a free bay or waits in storage', mig.at === null || (mig.at && typeof mig.at.p === 'string'), JSON.stringify(mig));

// 4. the mansion: drive into the motor court, park, take the stairs up, come back, drive out
await ev(() => { const g = window.game; g.uw.S.props.mansion = { owned: true, dmg: 0, since: 1 }; g.uw.S.props.penthouse = { owned: true, dmg: 0, since: 1 }; g.save.owns.penthouse = true; (g.money.W.clean = g.money.W.dirty.me = 5e6); const D = g.vspaces.byProp('mansion'), S = D.street; g.resetPlayerState(S.x + 3, S.z + 14, 0); const v = g.vehicles.spawn('sports', S.x, S.z + 14, Math.PI, { parked: true }); v.touched = true; g.completeEnter(v); });
for (let k = 0; k < 140; k++) { await ev(() => window.game.input.down.add('gas')); await frames(page, 2); if (await ev(() => !!(window.game.player.interior && window.game.player.interior.vspace))) break; }
await ev(() => window.game.input.down.delete('gas')); await waitFade();
const m1 = await ev(() => { const g = window.game, p = g.player; return { vs: p.interior && p.interior.vspace, y: +p.vehicle.pos.y.toFixed(1), bays: g.vspaces.byProp('mansion').bays.length }; });
check('driving up to the motor court door takes you down into the underground garage', m1.vs === 'mansion' && m1.y === -30 && m1.bays === 10, JSON.stringify(m1));
await ev(() => { const g = window.game, D = g.vspaces.byProp('mansion'), v = g.player.vehicle, b0 = D.bays[3]; v.pos.set(b0.x, v.pos.y, b0.z); v.h = b0.h; v.vel.set(0, 0); }); await frames(page, 6);
const m2 = await ev(() => { const g = window.game, a = g.uw.findAction(); const l = a && a.label; if (a) a.act(); return { l, here: g.save.garage.filter(e => e.at && e.at.p === 'mansion').length }; });
check('park a car in the motor court', /Park & save/.test(m2.l) && m2.here === 1, JSON.stringify(m2));
await ev(() => { const g = window.game, D = g.vspaces.byProp('mansion'), s = D.spots[0]; g.player.pos.set(s.x, g.player.pos.y, s.z); const a = g.vspaces.findAction(); if (a) a.act(); }); await waitFade(); await frames(page, 10);
const m3 = await ev(() => { const g = window.game, c = g.content.interiors.cur; return { id: c && c.id, spots: c && c.spots.map(s => s.id) }; });
check('the stairs lead up into the mansion (bed, laptop, bar, stash, motor court)', m3.id === 'h:mansion' && ['bed', 'laptop', 'bar', 'stash', 'motorcourt'].every(k => m3.spots.includes(k)), JSON.stringify(m3));
await ev(() => window.game.content.spotAct('motorcourt')); await waitFade(); await frames(page, 10);
const m4 = await ev(() => { const g = window.game; return { vs: g.player.interior && g.player.interior.vspace, defs: Object.keys(g.content.interiors.defs).filter(k => k.startsWith('h:')) }; });
check('back down in the motor court; the house interior was unloaded', m4.vs === 'mansion' && m4.defs.length === 0, JSON.stringify(m4));
await ev(() => { const g = window.game, v = g.vehicles.list.find(x => x.garageUid && x.pos.y < -20); g.player.pos.set(v.pos.x + 2.4, g.player.pos.y, v.pos.z); g.completeEnter(v); const D = g.vspaces.byProp('mansion'); v.pos.set(D.entry.x - 3, v.pos.y, D.entry.z); v.h = Math.PI / 2; });
for (let k = 0; k < 100; k++) { await ev(() => window.game.input.down.add('gas')); await frames(page, 2); if (await ev(() => !window.game.player.interior)) break; }
await ev(() => window.game.input.down.delete('gas')); await waitFade(); await frames(page, 10);
const m5 = await ev(() => { const g = window.game, v = g.player.vehicle; return { int: g.player.interior, y: v && +v.pos.y.toFixed(2), d: v && +Math.hypot(v.pos.x - g.vspaces.byProp('mansion').street.x, v.pos.z - g.vspaces.byProp('mansion').street.z).toFixed(1) }; });
check('drive into the exit lane: back out on the estate drive, in the car', !m5.int && m5.y > 0 && m5.y < 1 && m5.d < 12, JSON.stringify(m5));

// 5. the penthouse: lobby, elevator, the view, the garage, and the drive out
await ev(() => { const g = window.game; g.exitVehicle(true); const d = g.world.places.tower.door; g.resetPlayerState(d.x, d.z + 1.2, Math.PI); }); await frames(page, 10);
const lob = await ev(() => { const g = window.game, a = g.content.findAction(); const l = a && a.label; if (a) a.act(); return l; }); await waitFade();
check('Valen Tower has a street door into a lobby', /Lobby/.test(lob) && await ev(() => window.game.player.interior.id === 'lobby'), lob);
const elev = async act => { await ev(() => window.game.content.openElevator()); await frames(page, 3); await ev(([a]) => document.querySelector(`#svcBody [data-act="${a}"]`).click(), [act]); await waitFade(); await frames(page, 20); };
await elev('ph');
const ph = await ev(() => { const g = window.game, p = g.player; return { id: p.interior.id, y: +p.pos.y.toFixed(1), top: g.world.towerTop.y, r: g.chunks.radius, chunks: g.chunks.visible.size, spots: g.content.interiors.cur.spots.map(s => s.id) }; });
check('the elevator goes up to the penthouse at the top of the real tower', ph.id === 'penthouse' && Math.abs(ph.y - ph.top) < 0.5 && ph.y > 200, JSON.stringify(ph));
check('the penthouse looks out over the real city (wide streaming) and has a terrace view spot', ph.r >= 5 && ph.chunks > 60 && ph.spots.includes('view'), JSON.stringify(ph));
await elev('garage');
const pg = await ev(() => { const g = window.game; return { vs: g.player.interior && g.player.interior.vspace, r: g.chunks.radius, bays: g.vspaces.byProp('penthouse').bays.length }; });
check('elevator to the garage: the four-car residents’ garage (streaming back to normal)', pg.vs === 'penthouse' && pg.r < 5 && pg.bays === 4, JSON.stringify(pg));
await ev(() => { const g = window.game, D = g.vspaces.byProp('penthouse'); const v = g.vehicles.spawn('coupe', D.entry.x - 4, D.entry.z, Math.PI / 2, { parked: true, y: -30 }); v.touched = true; g.completeEnter(v); });
for (let k = 0; k < 100; k++) { await ev(() => window.game.input.down.add('gas')); await frames(page, 2); if (await ev(() => !window.game.player.interior)) break; }
await ev(() => window.game.input.down.delete('gas')); await waitFade(); await frames(page, 10);
const po = await ev(() => { const g = window.game, v = g.player.vehicle, S = g.vspaces.byProp('penthouse').street; return { int: g.player.interior, y: v && +v.pos.y.toFixed(2), d: v && +Math.hypot(v.pos.x - S.x, v.pos.z - S.z).toFixed(1) }; });
check('drive out of the residents’ garage: the door opens onto the street', !po.int && po.y >= 0 && po.y < 1 && po.d < 12, JSON.stringify(po));
await ev(() => window.game.exitVehicle(true));

// 6. houses: your own home, a viewing, a break-in
const own = await ev(() => { const g = window.game, L = g.uw.loc('prop', 'double1'); g.resetPlayerState(L.x, L.z, 0); const a = g.uw.findAction(); const l = a && a.label; if (a) a.act(); return l; }); await waitFade();
const hin = await ev(() => { const g = window.game, c = g.content.interiors.cur; return { id: c && c.id, spots: c && c.spots.map(s => s.id), y: g.player.pos.y }; });
check('your own house can be entered (bed, wardrobe, stash, garage door)', /Enter/.test(own) && hin.id && hin.id.startsWith('h:') && ['bed', 'wardrobe', 'stash', 'garage'].every(k => hin.spots.includes(k)), JSON.stringify({ own, hin }));
await ev(() => window.game.content.spotAct('exit')); await waitFade();
check('leaving unloads the interior', await ev(() => !Object.keys(window.game.content.interiors.defs).some(k => k.startsWith('h:'))));
const brk = await ev(() => { const g = window.game; const h = g.world.homes.find(x => !x.propId && x.type !== 'farm' && window.__pv && Math.abs(Math.sin(x.x0 * 7)) >= 0 && g.content.nearHomeDoor({ pos: { x: x.door.x, z: x.door.z } })); if (!h) return null; g.resetPlayerState(h.door.x, h.door.z, 0); g.player.pos.x = h.door.x; g.player.pos.z = h.door.z; const a = g.content.findAction(); const l = a && a.label; if (a) a.act(); return l; });
await waitFade(); await frames(page, 5);
// every drawer, nightstand and wardrobe is searched in turn (the safe takes time and is skipped here)
const loot = await ev(() => { const g = window.game, c = g.content.interiors.cur; if (!c) return null; const m0 = g.money.total(), i0 = JSON.stringify(g.uw.S.inv), a0 = g.save.ammo.pistol; for (const ct of c.containers) if (ct.kind !== 'safe') g.content.spotAct('c:' + ct.i); return { id: c.id, n: c.containers.length, gained: g.money.total() - m0, goods: JSON.stringify(g.uw.S.inv) !== i0, ammo: g.save.ammo.pistol - a0 }; });
check('some other houses can be broken into and searched', /Break in|Slip into/.test(brk || '') && loot && loot.n >= 4 && (loot.gained > 0 || loot.goods || loot.ammo > 0), JSON.stringify({ brk, loot }));
await ev(() => window.game.content.spotAct('exit')); await waitFade();
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'property');
