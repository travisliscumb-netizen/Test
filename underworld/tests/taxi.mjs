/* Cabline taxis: a real cab drives to you, you hire it (or carjack it), pick any street on the map,
   see the distance-based fare, and ride while the AI drives through town. Change destination,
   get out (meter fare), skip (agreed fare, short fade), arrival, police kick-out, stuck recovery.
   No flat $40 cab anywhere. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
const step = (sec) => ev(s => { const g = window.game; for (let n = 0; n < 60 * s; n++) g.update(1 / 60, 1 / 60); }, sec);

// fares scale with distance; a short hop is cheap, a cross-town ride is not $40
const fares = await ev(() => { const P = window.__pv; return { f0: P.fareFor(0), f500: P.fareFor(500), f2k: P.fareFor(2000), f5k: P.fareFor(5000) }; });
check('the fare is a base plus a per-kilometre rate (no flat $40)', fares.f0 >= 8 && fares.f500 < fares.f2k && fares.f2k < fares.f5k && fares.f5k > 100 && fares.f500 < 40, JSON.stringify(fares));

// put the player on a pavement next to a straight road, then call a cab
const call = await ev(() => {
  const g = window.game, P = window.__pv;
  g.save.money = 5000; g.police.clear();
  const kp = P.nearestRoadPoint(4 * 80 + 40, 6 * 80);
  g.resetPlayerState(kp.x, kp.z + 0, 0);
  const ok = g.taxi.call();
  const v = g.taxi.cab;
  return { ok, state: g.taxi.state, cab: !!v, type: v && v.type, d: v && Math.round(Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z)) };
});
check('calling a cab sends a real taxi (a car in the world, not a menu)', call.ok && call.state === 'coming' && call.cab && call.type === 'taxi' && call.d > 20, JSON.stringify(call));
const arrive = await ev(() => {
  const g = window.game, v = g.taxi.cab, p = g.player, d0 = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
  let t = 0; while (g.taxi.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  return { state: g.taxi.state, secs: Math.round(t / 60), d0: Math.round(d0), d: Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z)), sp: +v.speed.toFixed(2) };
});
check('the cab drives over and stops at the kerb beside you', arrive.state === 'waiting' && arrive.d < 14 && arrive.sp < 1.5, JSON.stringify(arrive));

// walk up: hire or carjack prompt, then the hire button opens the map in destination mode
const hire = await ev(() => {
  const g = window.game, v = g.taxi.cab, p = g.player;
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  const a = g.content.findAction(); const label = a && a.label; if (a) a.act();
  const btns = [...document.querySelectorAll('#svcBody [data-act]')].map(b => b.dataset.act);
  document.querySelector('#svcBody [data-act="hire"]').click();
  const mv = g.ui.mapView;
  return { label, btns, pick: !!mv.pickMode, mapOpen: !!g.mapOpen, panel: !document.getElementById('mapPick').classList.contains('hidden') };
});
check('at the cab: “hire or carjack”', /Taxi/.test(hire.label || '') && hire.btns.includes('hire') && hire.btns.includes('jack'), JSON.stringify(hire));
check('hiring opens the map to pick a destination', hire.pick && hire.mapOpen && hire.panel, JSON.stringify(hire));

const pick = await ev(() => {
  const g = window.game, P = window.__pv, mv = g.ui.mapView, v = g.taxi.cab;
  const tx = 9 * 80 + 40, tz = 2 * 80;
  mv.setPick(tx, tz);
  const q = mv.pickMode.q, html = document.getElementById('mapPick').textContent;
  const crow = Math.hypot(tx - v.pos.x, tz - v.pos.z);
  const m0 = g.save.money;
  document.querySelector('#mapPick [data-pk="ok"]').click();
  return { m: Math.round(q.m), crow: Math.round(crow), fare: q.fare, expect: P.fareFor(q.m), name: q.name, shown: html.includes(q.name) && html.includes('$'), state: g.taxi.state, passenger: !!g.player.passenger, inCab: g.player.vehicle === v, paidNow: m0 - g.save.money, hud: !document.getElementById('taxiHud').classList.contains('hidden'), mapOpen: !!g.mapOpen };
});
check('the pick panel shows the place, distance and the fare before you ride', pick.shown && pick.fare === pick.expect && pick.m >= pick.crow * 0.95, JSON.stringify(pick));
check('confirming puts you in the back of the cab (not driving) with the ride HUD up', pick.state === 'riding' && pick.passenger && pick.inCab && pick.hud && !pick.mapOpen && pick.paidNow === 0, JSON.stringify(pick));

// the AI drives: real movement along the roads, distance to go keeps falling
const ride = await ev(() => {
  const g = window.game, T = g.taxi, v = T.cab, d = T.dest;
  const r0 = T.remaining(), x0 = v.pos.x, z0 = v.pos.z;
  let maxOff = 0, n = 0;
  for (let k = 0; k < 25 * 60; k++) { g.update(1 / 60, 1 / 60); if (k % 30 === 0) { const P = window.__pv, nl = P.Links.nearest(v.pos.x, v.pos.z); const ln = P.isOnRoad(v.pos.x, v.pos.z) || (nl && nl.d < 7); if (!ln) n++; } }
  const thr = v.ctl.throttle;
  return { r0: Math.round(r0), r1: Math.round(T.remaining()), moved: Math.round(Math.hypot(v.pos.x - x0, v.pos.z - z0)), driven: Math.round(T.driven), offRoad: n, p: Math.round(Math.hypot(g.player.pos.x - v.pos.x, g.player.pos.z - v.pos.z)), state: T.state, buttonsBlocked: document.body.classList.contains('passenger'), meter: T.meterFare(), quote: T.quote, hud: document.querySelector('#taxiHud .tm').textContent };
});
check('the cab actually drives you through town (25 s: over 150 m covered, remaining route shrinks)', ride.state === 'riding' && ride.driven > 150 && ride.r1 < ride.r0 - 120 && ride.p < 1, JSON.stringify(ride));
check('it stays on the roads', ride.offRoad <= 2, JSON.stringify(ride));
check('the HUD shows distance left, fare and meter; car controls are hidden while a passenger', ride.buttonsBlocked && /to go/.test(ride.hud) && /meter/.test(ride.hud), JSON.stringify(ride));
const ctl = await ev(() => { const g = window.game; const a = g.content.findAction(); return { act: a && a.label }; });
check('no driver prompts (garage etc.) while in the back of a cab', !ctl.act, JSON.stringify(ctl));

// change destination mid-ride
const change = await ev(() => {
  const g = window.game, T = g.taxi, mv = g.ui.mapView, old = { ...T.dest };
  document.querySelector('#taxiHud [data-tx="change"]').click();
  const open = !!mv.pickMode;
  mv.setPick(2 * 80, 9 * 80 + 40); const q = mv.pickMode.q;
  document.querySelector('#mapPick [data-pk="ok"]').click();
  return { open, old: old.name, now: T.dest.name, moved: Math.hypot(old.x - T.dest.x, old.z - T.dest.z) > 50, quote: T.quote, fare: q.fare, goal: T.cab.drive.goal && Math.round(Math.hypot(T.cab.drive.goal.x - T.dest.x, T.cab.drive.goal.z - T.dest.z)), state: T.state };
});
check('“Change” reopens the map; the cab reroutes to the new destination with a new fare', change.open && change.moved && change.quote === change.fare && change.goal === 0 && change.state === 'riding', JSON.stringify(change));
await step(4);

// get out: the cab pulls over first, then the meter is charged (never more than the quote)
const out = await ev(() => {
  const g = window.game, T = g.taxi, v = T.cab, m0 = g.save.money, sp0 = v.speed, meter = Math.min(T.quote, T.meterFare());
  document.querySelector('#taxiHud [data-tx="out"]').click();
  let t = 0; while (T.state === 'riding' && t < 15 * 60) { g.update(1 / 60, 1 / 60); t++; }
  return { sp0: +sp0.toFixed(1), secs: +(t / 60).toFixed(1), paid: m0 - g.save.money, meter, state: T.state, foot: g.player.state === 'foot', passenger: !!g.player.passenger, cls: document.body.classList.contains('passenger'), hud: document.getElementById('taxiHud').classList.contains('hidden'), hp: g.player.health };
});
check('“Get out”: the cab pulls over, you step out and pay the meter', out.state === 'idle' && out.foot && !out.passenger && !out.cls && out.hud && out.paid > 0 && Math.abs(out.paid - out.meter) <= 2, JSON.stringify(out));

// a second cab: skip the drive, pay the agreed fare, end up at the destination
const skipSet = await ev(() => {
  const g = window.game, T = g.taxi, P = window.__pv;
  for (let k = 0; k < 60; k++) g.update(1 / 60, 1 / 60);
  const ok = T.call(); let t = 0; while (T.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state, ok };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); g.player.pos.set(w.x, g.player.pos.y, w.z);
  T.approach(v); document.querySelector('#svcBody [data-act="hire"]').click();
  const pl = g.world.places.casino || g.world.places.mall; g.ui.mapView.setPick(pl.door.x, pl.door.z);
  const q = g.ui.mapView.pickMode.q; document.querySelector('#mapPick [data-pk="ok"]').click();
  window.__skip = { m0: g.save.money, fare: q.fare, x: T.dest.x, z: T.dest.z };
  document.querySelector('#taxiHud [data-tx="skip"]').click();
  return { state: T.state, fare: q.fare };
});
await waitFade();
const skip = await ev(() => { const g = window.game, s = window.__skip || {}; return { paid: s.m0 - g.save.money, fare: s.fare, d: Math.round(Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z)), state: g.taxi.state, foot: g.player.state === 'foot' }; });
check('“Skip ride”: a short fade, you arrive, the agreed fare is charged', skip.state === 'idle' && skip.foot && skip.paid === skip.fare && skip.d < 20, JSON.stringify({ skipSet, skip }));

// a short ride all the way: the cab arrives by itself and charges the quote
const full = await ev(() => {
  const g = window.game, T = g.taxi, P = window.__pv, p = g.player;
  for (let k = 0; k < 60; k++) g.update(1 / 60, 1 / 60);
  const kp = P.nearestRoadPoint(p.pos.x, p.pos.z); g.resetPlayerState(kp.x, kp.z, 0);
  T.call(); let t = 0; while (T.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  T.approach(v); document.querySelector('#svcBody [data-act="hire"]').click();
  // a destination about two blocks away along the streets
  const tx = v.pos.x + Math.sin(v.h) * 170, tz = v.pos.z + Math.cos(v.h) * 170;
  g.ui.mapView.setPick(tx, tz); const q = g.ui.mapView.pickMode.q; const dest = g.ui.mapView.pickMode.dest;
  const m0 = g.save.money; document.querySelector('#mapPick [data-pk="ok"]').click();
  const trace = [[Math.round(v.pos.x), Math.round(v.pos.z), +v.h.toFixed(2)], [Math.round(dest.x), Math.round(dest.z)], v.drive.path.map(q => [Math.round(q.x), Math.round(q.z)])];
  t = 0; while (T.state === 'riding' && t < 120 * 60) { g.update(1 / 60, 1 / 60); t++; if (t % 120 === 0) trace.push([Math.round(v.pos.x), Math.round(v.pos.z), +v.speed.toFixed(1), v.drive.pi, T.recov || 0]); if (t === 30 * 60) { const fx = Math.sin(v.h), fz = Math.cos(v.h); trace.push({ ctl: v.ctl, wait: v.drive.wait, rev: v.drive.rev, driver: v.driver, mode: v.mode, sleep: v.sleep, ahead: g.dyn.query(v.pos.x + fx * 7, v.pos.z + fz * 7, 8, []).filter(e => e.ref !== v).map(e => { const l = v.toLocal(e.x, e.z); return [e.kind || (e.ref && e.ref.type) || (e.ref === g.player ? 'player' : '?'), +l.x.toFixed(1), +l.z.toFixed(1), e.ref && e.ref.parked, e.ref && e.ref.mode]; }) }); } }
  return { trace: T.state === 'riding' ? trace : null, secs: Math.round(t / 60), paid: m0 - g.save.money, fare: q.fare, m: Math.round(q.m), d: Math.round(Math.hypot(p.pos.x - dest.x, p.pos.z - dest.z)), state: T.state, recov: T.recov || 0, foot: p.state === 'foot' };
});
check('a full ride: the cab reaches the destination by road and you pay the quoted fare', full.state === 'idle' && full.foot && full.paid === full.fare && full.d < 20 && full.secs < 100, JSON.stringify(full));

// police: the cab won't come with heat on you, and a driver dumps you if the police show up mid-ride
const cops = await ev(() => {
  const g = window.game, T = g.taxi, p = g.player, out = {};
  g.police.addHeat(2, p.pos.x, p.pos.z); out.lvl = g.police.level; out.refused = !T.call(); g.police.clear();
  for (let k = 0; k < 60; k++) g.update(1 / 60, 1 / 60);
  T.call(); let t = 0; while (T.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  T.approach(v); document.querySelector('#svcBody [data-act="hire"]').click();
  g.ui.mapView.setPick(6 * 80, 11 * 80); document.querySelector('#mapPick [data-pk="ok"]').click();
  for (let k = 0; k < 3 * 60; k++) g.update(1 / 60, 1 / 60);
  g.police.addHeat(2, p.pos.x, p.pos.z); g.update(1 / 60, 1 / 60); g.update(1 / 60, 1 / 60);
  out.after = T.state; out.foot = p.state === 'foot'; g.police.clear();
  return out;
});
check('no cab with the police after you; mid-ride heat gets you thrown out', cops.lvl >= 1 && cops.refused && cops.after === 'idle' && cops.foot, JSON.stringify(cops));

// stuck recovery: a cab blocked in place reroutes, then takes a shortcut, and never strands you
const stuck = await ev(() => {
  const g = window.game, T = g.taxi, p = g.player;
  for (let k = 0; k < 60; k++) g.update(1 / 60, 1 / 60);
  T.call(); let t = 0; while (T.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  T.approach(v); document.querySelector('#svcBody [data-act="hire"]').click();
  g.ui.mapView.setPick(1 * 80, 1 * 80); document.querySelector('#mapPick [data-pk="ok"]').click();
  // pin the cab: wipe its speed every frame, like a car wedged in a jam
  const r0 = T.remaining();
  for (let k = 0; k < 40 * 60 && T.state === 'riding'; k++) { v.vel.set(0, 0); g.update(1 / 60, 1 / 60); }
  return { recov: T.recov || 0, r0: Math.round(r0), r1: Math.round(T.remaining()), state: T.state, fading: g.fading };
});
check('a stuck cab recovers (reroute, then a shortcut) instead of sitting forever', stuck.recov >= 2 && (stuck.r1 < stuck.r0 - 40 || stuck.state === 'idle' || stuck.fading), JSON.stringify(stuck));
await waitFade();
await ev(() => { const g = window.game; if (g.taxi.state === 'riding') { g.taxi.cab.vel.set(0, 0); g.taxi.getOut(); for (let k = 0; k < 120; k++) g.update(1 / 60, 1 / 60); } });

// carjacking a cab is a crime and you drive it yourself
const jack = await ev(() => {
  const g = window.game, T = g.taxi, p = g.player;
  for (let k = 0; k < 60; k++) g.update(1 / 60, 1 / 60);
  T.call(); let t = 0; while (T.state === 'coming' && t < 90 * 60) { g.update(1 / 60, 1 / 60); t++; }
  const v = T.cab; if (!v || T.state !== 'waiting') return { fail: T.state };
  const w = v.toWorld(v.spec.w / 2 + 0.6, 0); p.pos.set(w.x, p.pos.y, w.z);
  const crimes = [], C = g.police.crime.bind(g.police); g.police.crime = (t, x, z) => { crimes.push(t); return C(t, x, z); };
  const st0 = g.save.stats.stolen;
  T.approach(v); document.querySelector('#svcBody [data-act="jack"]').click();
  for (let k = 0; k < 4 * 60; k++) g.update(1 / 60, 1 / 60);
  g.police.crime = C;
  return { driving: p.state === "vehicle" && p.vehicle === v && !p.passenger && v.driver === "player", crimes, stolen: g.save.stats.stolen - st0, state: T.state, cab: !!T.cab };
});
check('carjacking the cab: you take the wheel and it’s a crime', jack.driving && jack.crimes.includes('carjack') && jack.stolen === 1 && jack.state === 'idle' && !jack.cab, JSON.stringify(jack));

// the map has a Taxi button; no legacy flat-fare cab stops remain
const ui = await ev(() => ({ btn: !!document.getElementById('mapTaxiBtn'), cats: Object.keys(window.__pv.MAP_CATS).includes('cab'), legacy: typeof window.game.content.fastTravel }));
check('the map has a Taxi button and the old $40 cab stops are gone', ui.btn && !ui.cats && ui.legacy === 'undefined', JSON.stringify(ui));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'taxi');
