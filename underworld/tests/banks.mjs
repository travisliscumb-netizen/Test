/* Banks: the three branches of Port Valen, banked in and robbed on the game's own systems.
   - World: every bank has a street door (an "Enter" prompt), a facade, and a map entry once its district is known;
     inside, the city is hidden and the room costs a few dozen draw calls (an iPhone budget, not the street's).
   - Tiers: the Neighborhood Bank < the Commercial Bank < the Central Bank in guards, alarm stars, police and money;
     reserves vary by economic day (seeded: the same day is the same money) and rise toward the end of the week.
   - Robbery, from a new game, no Rank: a window (the fastest, smallest take), the manager's keycard, the cash room,
     the vault (Commercial and Central), deposit boxes; every take is Dirty Cash in hand ('bankRob'), never Clean.
   - Persistence: what was taken stays taken through leaving and re-entering, a save and reload, an arrest and a
     death; areas recover on the economic clock (tills daily, cash room in five days, vault in two weeks, boxes in
     two weeks); a robbery adds a security step (another guard) that wears off.
   - Response: a drawn gun is warned then alarmed; the guards turn on an armed robber; the silent alarm sets the
     stars, contains the building, escalates and the police storm in; an unarmed robber is held by a guard and
     arrested; hitting and killing guards are their own charges on the case file.
   - Economy: robbing the same bank every economic day is no money engine.
   - The doors: lit by the room they are in; a vault's wheel turns, its bolts draw, it swings, and stands solid open.
   - The bag: takings go into a bag that holds so much (small notes take more room than the vault's hundreds) and
     pay out only through a door; a full bag can dump bulkier notes for denser ones; what didn't fit stays in the bank.
   - Dye packs: in teller drawers and cash room straps; one that leaves the building bursts (its bundle and some of
     the rest ruined, the police shown where you came out), unless the bag was gone through first.
   - Hostages: the people in the bank are people (300); "everybody on the floor" makes them hostages (a charge, a
     star), the police negotiate before they storm, a hostage hurt ends that, a hostage out of sight makes a run.
   - The rear staff door: on the back of each building, picked from the street with a lockpick set; the staff and
     guards raise the alarm on an intruder in the back; out through it unseen, or into the police once they cover it. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

const setup = () => ev(() => {
  const g = window.game, P = window.__pv;
  g.events.cool = 1e9; g.save.settings.guide = false; g.player.health = g.player.maxHealth;
  // step the simulation (deterministic, fast on software GL); keep(): run while a channel is going
  window.__step = (secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (each) each(); g.update(1 / 60, 1 / 60); } };
  window.__toDoor = id => { const L = g.uw.loc('spot', 'bank_' + id); g.resetPlayerState(L.x, L.z, L.h + Math.PI); return L; };
  window.__at = (x, z) => { const d = g.content.interiors.cur; g.player.pos.set(d.ox + x, d.fy, d.oz + z); g.player.vel.set(0, 0, 0); };
  window.__spot = (key) => { const d = g.content.interiors.cur, s = d.spots.find(q => q.id === 'bk:' + key); window.__at(s.x, s.z); const a = g.content.findAction(); return a ? a.label : null; };
  window.__do = (key) => { const lbl = window.__spot(key); const a = g.content.findAction(); if (a) a.act(); return lbl; };
  // finish a timed job: step until the channel ends (or gives up)
  window.__finish = () => { let n = 0; while (g.content.chan && n++ < 60 * 120) g.update(1 / 60, 1 / 60); return !g.content.chan; };
  window.__noGuards = () => { const B = g.uw.banks; for (const p of B.guards) { const i = g.peds.peds.indexOf(p); if (i >= 0) g.peds.peds.splice(i, 1); } B.guards = []; };
  window.__quiet = () => { const B = g.uw.banks; for (const p of B.guards) { const i = g.peds.peds.indexOf(p); if (i >= 0) g.peds.peds.splice(i, 1); } B.guards = []; g.police.enabled = false; g.police.clear(); };
  window.__armed = on => { const s = g.save; s.weapons.pistol = true; s.ammo.pistol = 200; g.player.mag = Object.assign(g.player.mag || {}, { pistol: 12 }); for (let i = 0; i < 8; i++) { g.player.selectWeapon(i); if (g.player.wep.id === (on ? 'pistol' : 'fists')) break; } if (!on) g.player.weapon = 0; return g.player.wep.id; };
  window.__dirty = () => g.money.W.dirty.me; window.__clean = () => g.money.W.clean;
  window.__bag = () => g.uw.banks.R ? g.uw.banks.bagCash() : 0;
  // skip whole economic days (the clock's own count too, so it doesn't run them again when play resumes)
  window.__days = d => { const S = g.uw.S; S.econH += 24 * d; S.day += d; S.econDay = (S.econDay | 0) + d; };
  window.__noDye = () => { const D = P.BANK_T.dye; window.__dye0 = window.__dye0 || { win: D.win.slice(), cash: D.cash.slice(), note: D.note }; D.win = [0, 0, 0, 0]; D.cash = [0, 0, 0, 0]; D.note = 0; };
  void P;
});
await setup();
const enter = async id => {
  const lbl = await ev(id => { window.__toDoor(id); const a = window.game.uw.findAction(); return a ? a.label : null; }, id);
  await ev(() => window.game.uw.findAction().act());
  await page.waitForFunction(() => !window.game.fading && window.game.player.interior, null, { timeout: 60000, polling: 100 });
  return lbl;
};
const leave = async () => { await ev(() => window.game.content.interiors.exit(true)); await frames(page, 3); };
// out through a door (the bag pays out on the way): the front doors or the rear staff door
const walkOut = async (how = 'front') => { await ev(how => window.game.uw.banks.goOut(how, true), how); await frames(page, 3); return ev(() => window.game.uw.banks.last); };

// ---------------------------------------------------------------- 1. the world: doors, interiors, the map, the cost inside
const world = [];
for (const id of ['n', 'd', 'c']) {
  const lbl = await enter(id);
  world.push(await ev(([id, lbl]) => {
    const g = window.game, P = window.__pv, d = g.content.interiors.cur, B = g.uw.banks; g.render(); const i = g.renderer.info;
    const Y = P.BANK_LAYOUT[id]; let drawn = 0; g.peds.draw({ draw: () => drawn++ }, d.fy);
    return { id, lbl, int: d.id, fight: !!g.player.interior.fight, outdoor: g.outdoor.visible, calls: i.render.calls, tris: i.render.triangles, guards: B.guards.length,
      onFloor: B.guards.concat(B.civs).every(p => Math.abs(p.y - d.fy) < 0.05 && p.floor === d.fy), want: P.BANKS[id].guards, zone: g.uw.loc('spot', 'bank_' + id).zone,
      civs: B.civs.length, wantCivs: Y.staff.length + Y.customers.length, drawn, doorMat: Object.values(d.doors).every(D => D.mesh.material === d.group.children[0].material) };
  }, [id, lbl]));
  await leave();
}
const street = await ev(() => { const g = window.game; window.__toDoor('c'); g.render(); return g.renderer.info.render.calls; });
check('all three banks have a street door that says what it is, and you walk in from a new game (no Rank, Rep or job needed)', world.every(w => w.lbl === `Enter ${window_name(w.id)}` && w.int === 'bank:' + w.id), JSON.stringify(world.map(w => [w.id, w.lbl, w.int])));
function window_name(id) { return { n: 'Old Quarter Neighborhood Bank', d: 'Downtown Commercial Bank', c: 'Port Valen Central Bank' }[id]; }
check('three distinct districts: the Old Quarter, Downtown and the Financial District', world.map(w => w.zone).join('') === 'omc', JSON.stringify(world.map(w => w.zone)));
check('inside, the city is hidden and a bank is a few dozen draw calls (≤ 60, ≤ 90k triangles), far below the street', world.every(w => !w.outdoor && w.calls <= 60 && w.tris <= 90000) && street > Math.max(...world.map(w => w.calls)) * 2, JSON.stringify({ inside: world.map(w => [w.id, w.calls, w.tris]), street }));
check('fights can happen inside a bank (combat is on), and its guards stand on its floor', world.every(w => w.fight && w.onFloor), JSON.stringify(world.map(w => [w.id, w.fight, w.onFloor])));
check('guards by tier: 1 at the Neighborhood Bank, 3 at the Commercial, 6 at the Central', world.map(w => w.guards).join(',') === '1,3,6' && world.every(w => w.guards === w.want), JSON.stringify(world.map(w => w.guards)));
check('the tellers, the managers and the customers are people on the bank floor, and everyone inside is drawn (guards too)', world.every(w => w.civs === w.wantCivs && w.civs >= 5 && w.drawn === w.civs + w.guards), JSON.stringify(world.map(w => [w.id, w.civs, w.wantCivs, w.drawn, w.guards])));
check('every door that opens is drawn with its room’s own lamp-lit material (not the street’s sun)', world.every(w => w.doorMat), JSON.stringify(world.map(w => [w.id, w.doorMat])));
const rearSt = await ev(() => {
  const g = window.game, B = g.uw.banks, out = {};
  for (const id of ['n', 'd', 'c']) {
    const r = B.rear[id], L = g.uw.loc('spot', 'bank_' + id); if (!r) { out[id] = null; continue; }
    g.uw.tools.T.picks = 0; g.resetPlayerState(r.sx, r.sz, r.h + Math.PI); const a = g.uw.findAction();
    g.uw.tools.T.picks = 1; const b = g.uw.findAction();
    out[id] = { locked: a && a.label, pick: b && b.label, behind: Math.hypot(r.x - L.x, r.z - L.z) };
  }
  g.uw.tools.T.picks = 0;
  return out;
});
check('every bank has a rear staff door on the back of its building: locked from the street, a lockpick set opens it', ['n', 'd', 'c'].every(k => rearSt[k] && /locked$/.test(rearSt[k].locked) && /^Pick the staff entrance/.test(rearSt[k].pick) && rearSt[k].behind > 20), JSON.stringify(rearSt));
const map = await ev(() => {
  const g = window.game, B = g.uw.banks, Z = g.save.discovered.zones, keep = { ...Z };
  for (const z of ['o', 'm', 'c']) delete Z[z]; const none = B.mapEntries().length;
  for (const z of ['o', 'm', 'c']) Z[z] = 1; const all = B.mapEntries().map(e => [e.name, e.icon, e.cat]);
  for (const z in Z) delete Z[z]; Object.assign(Z, keep);
  return { none, all, glyph: !!window.__pv.MAP_GLYPHS.K, cat: !!window.__pv.MAP_CATS.bank, facade: B.facade ? B.facade.children.length : 0 };
});
check('on the map once their district is known (the bank pictogram), not before; each has its facade and name board', map.none === 0 && map.all.length === 3 && map.all.every(e => e[1] === 'K' && e[2] === 'bank') && map.glyph && map.cat && map.facade >= 5, JSON.stringify(map));

// ---------------------------------------------------------------- 2. what a bank holds: by tier, by economic day, by week
const res = await ev(() => {
  const g = window.game, B = g.uw.banks, out = {};
  for (const id of ['n', 'd', 'c']) {
    const v = []; for (let d = 1; d <= 70; d++) v.push(B.full(id, d));
    const byDow = [0, 0, 0, 0, 0, 0, 0]; for (let d = 1; d <= 70; d++) byDow[d % 7] += B.full(id, d) / 10;
    out[id] = { min: Math.min(...v), max: Math.max(...v), same: B.full(id, 9) === B.full(id, 9), varies: new Set(v).size > 50, early: byDow[0], late: byDow[6] };
  }
  return out;
});
check('reserves by tier: Neighborhood ~$20–80k, Commercial ~$75–220k, Central ~$175–450k (full banks, before the deposit boxes’ spread)',
  res.n.min >= 18000 && res.n.max <= 82000 && res.d.min >= 70000 && res.d.max <= 225000 && res.c.min >= 150000 && res.c.max <= 460000 && res.n.max < res.d.max && res.d.max < res.c.max, JSON.stringify(res));
check('reserves change every economic day (seeded: a reload can’t re-roll a day) and are strongest at the end of the economic week', ['n', 'd', 'c'].every(k => res[k].same && res[k].varies && res[k].late > res[k].early * 1.6), JSON.stringify(res));

// ---------------------------------------------------------------- 3. a quick robbery: one window, armed, then out (partial payout)
await enter('n');
const quick = await ev(() => {
  const g = window.game, B = g.uw.banks; window.__quiet(); window.__armed(true); window.__noDye();
  const d0 = window.__dirty(), c0 = window.__clean(), lbl = window.__do('w0'); const done = window.__finish();
  const bag = window.__bag(), inHand = window.__dirty() - d0, share = Math.round(B.areaFull('n', 'counter') / 2);
  window.__d0 = d0; window.__c0 = c0;
  return { lbl, done, bag, inHand, share, exit: window.__spot('exit'), filed: g.uw.legal.live().filter(it => it.t === 'bankrob').length, sec: B.sec('n'), guards: B.guardsFor('n'), alarm: B.R.alarm };
});
const quickOut = await walkOut('front');
const after = await ev(() => ({ got: window.__dirty() - window.__d0, clean: window.__clean() - window.__c0 }));
check('an armed robber at a window gets that teller’s drawer, into the bag (nothing in hand until you are out)', quick.lbl === 'Rob window 1' && quick.done && quick.bag > 0 && Math.abs(quick.bag - quick.share) <= 2 && quick.inHand === 0 && /^Leave · the bag: \$/.test(quick.exit), JSON.stringify(quick));
check('walk out of the front doors and the bag is Dirty Cash in hand; nothing to the Clean Bank; the window is the small, quick take', quickOut && quickOut.paid === quick.bag && after.got === quick.bag && after.clean === 0 && quick.bag < 0.1 * 82000, JSON.stringify({ quickOut, after }));
check('any robbery sets off the silent alarm, goes on the case file (CCTV: bank robbery) and adds a security step (another guard next time)', quick.alarm && quick.filed === 1 && quick.sec === 1 && quick.guards === 2, JSON.stringify(quick));

// ---------------------------------------------------------------- 4. the whole job at the Commercial Bank: keycard, cash room, vault, deposit boxes
await enter('d');
const full = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, P = window.__pv, d = R.def; window.__quiet(); window.__armed(true); window.__noDye();
  const d0 = window.__dirty(), steps = [], take = () => window.__bag();
  const before = { cash: B.avail('d', 'cash'), vault: B.avail('d', 'vault'), boxes: B.boxesLeft('d') };
  steps.push(['office', window.__do('office'), window.__finish(), R.keycard]);
  steps.push(['sec', window.__do('sec'), R.open.sec]);
  steps.push(['cashdoor', window.__do('cashdoor'), window.__finish(), R.open.cash]);
  const c0 = take(); for (let k = 0; k < 3; k++) { window.__do('cash'); window.__finish(); } const cashGot = take() - c0;
  steps.push(['vaultdoor', window.__do('vaultdoor'), window.__finish(), R.open.vault]);
  // the door: shut (its collider up) while the wheel turns and the bolts draw, then it swings and stands solid open
  const Lk = d.locks.vault, D = d.doors.vault, cols0 = d.cols.length, still = d.cols[Lk.col].on !== false, moved0 = D.mesh.geometry.attributes.position.array[0] !== D.base[0] ? 1 : 0;
  window.__step(Lk.times.swing[1] + 0.3);
  const o = P.bankDoorOpenBox(Lk), oc = d.cols[d.cols.length - 1], pa = D.mesh.geometry.attributes.position.array;
  let shift = 0; for (let i = 0; i < pa.length; i += 3) shift = Math.max(shift, Math.hypot(pa[i] - D.base[i], pa[i + 2] - D.base[i + 2]));
  const door = { still, moved0, cols: d.cols.length - cols0, open: Math.abs(oc.x0 - (d.ox + o.x0)) < 1e-6 && Math.abs(oc.z1 - (d.oz + o.z1)) < 1e-6 && oc.on !== false, shift: +shift.toFixed(2), anims: R.swing.length };
  const v0 = take(); for (let k = 0; k < 4; k++) { window.__do('vault'); window.__finish(); } const vaultGot = take() - v0;
  const b0 = take(), h0 = g.uw.S.inv.hot | 0; for (let k = 0; k < 8; k++) { window.__do('boxes'); window.__finish(); } const boxGot = take() - b0;
  return { steps, door, before, cashGot, vaultGot, boxGot, boxHot: (g.uw.S.inv.hot | 0) - h0, bag: take(), inHand: window.__dirty() - d0, leftCash: B.avail('d', 'cash'), leftVault: B.avail('d', 'vault'), boxesLeft: B.boxesLeft('d'), doorCol: R.def.cols[R.def.locks.vault.col].on, T: P.BANK_T.boxRefill, units: R.bag.units };
});
const fullOut = await walkOut('front');
check('the manager’s desk gives a keycard; it opens the security door and the cash room (no drilling)', full.steps[0][3] === true && full.steps[1][2] === true && full.steps[2][3] === true, JSON.stringify(full.steps));
// (the clock runs while you rob: an emptied area has recovered a sliver by the end, ~0.4% a minute for the cash room)
check('the cash room pays out what it holds, in three bags', full.cashGot > 0 && Math.abs(full.cashGot - full.before.cash) <= 3 && full.leftCash <= full.before.cash * 0.03, JSON.stringify({ got: full.cashGot, held: full.before.cash, left: full.leftCash }));
check('the vault door is drilled; it stays shut while its wheel turns and its bolts draw, then swings right round and stands solid where it opened', full.steps[3][3] === true && full.door.still && full.door.moved0 === 0 && full.door.cols === 1 && full.door.open && full.doorCol === false && full.door.shift > 2 && full.door.anims === 0, JSON.stringify(full.door));
check('then the vault is the biggest take', full.vaultGot > full.cashGot && Math.abs(full.vaultGot - full.before.vault) <= 4 && full.leftVault <= full.before.vault * 0.02, JSON.stringify({ vault: full.vaultGot, cash: full.cashGot, held: full.before.vault }));
check('deposit boxes are drilled one at a time, each different (cash and sometimes valuables)', full.boxesLeft === full.before.boxes - 8 && (full.boxGot > 0 || full.boxHot > 0), JSON.stringify({ boxGot: full.boxGot, hot: full.boxHot, left: full.boxesLeft }));
check('the whole Commercial job fits in one bag; nothing in hand until the doors, then all of it Dirty Cash in hand', full.inHand === 0 && full.units < 100 && fullOut.paid === full.bag && full.bag > 0, JSON.stringify({ bag: full.bag, units: full.units, inHand: full.inHand, out: fullOut }));
// walk straight back in: nothing has come back
await enter('d');
const again = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R; window.__quiet(); window.__armed(true);
  const d0 = window.__bag(); window.__do('office'); window.__finish(); window.__do('sec'); window.__do('cashdoor'); window.__finish();
  const lbl = window.__spot('cash'), b0 = window.__bag(); window.__do('cash'); window.__finish();
  return { lbl, bag: window.__bag() - b0, desk: b0 - d0, cash: B.avail('d', 'cash'), vault: B.avail('d', 'vault'), boxes: B.boxesLeft('d') };
});
check('leaving and walking straight back in brings nothing back (a sliver recovered at most; the petty cash comes out of the same tills)', again.bag <= full.cashGot * 0.03 && again.desk <= 2000 && again.vault <= full.vaultGot * 0.03, JSON.stringify({ again, first: { cash: full.cashGot, vault: full.vaultGot } }));
await leave();

// ---------------------------------------------------------------- 5. persistence: save and reload, an arrest, a death
const saved = await ev(() => { const g = window.game; g.saveGame(true); return JSON.stringify(g.save.uw.banks); });
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await setup();
const reload = await ev(saved => { const g = window.game, B = g.uw.banks; return { same: JSON.stringify(g.save.uw.banks) === saved, cash: B.avail('d', 'cash'), vault: B.avail('d', 'vault'), boxes: B.boxesLeft('d'), sec: B.sec('d'), counterN: +B.remOf('n', 'counter').toFixed(3) }; }, saved);
check('a save and reload keeps every bank as it was left (cash room and vault empty, boxes drilled, security up)', reload.same && reload.cash <= full.cashGot * 0.05 && reload.vault <= full.vaultGot * 0.05 && reload.boxes === full.boxesLeft && reload.sec >= 1 && reload.counterN < 1, JSON.stringify(reload));

// ---------------------------------------------------------------- 6. recovery on the economic clock, and the security step wearing off
const rec = await ev(() => {
  const g = window.game, B = g.uw.banks, S = g.uw.S, P = window.__pv, adv = d => { S.econH += 24 * d; S.day += d; };
  const sec0 = B.sec('d'), cash0 = B.remOf('d', 'cash'), vault0 = B.remOf('d', 'vault');
  adv(1); const r1 = { cash: +(B.remOf('d', 'cash') - cash0).toFixed(3), vault: +(B.remOf('d', 'vault') - vault0).toFixed(3), counter: B.remOf('n', 'counter'), boxes: B.boxesLeft('d') };
  adv(9); const r10 = { cash: B.remOf('d', 'cash'), boxes: B.boxesLeft('d') };
  adv(5); const r15 = { sec: B.sec('d'), guards: B.guardsFor('d') };
  adv(7); const r22 = { boxes: B.boxesLeft('d') };
  adv(4); const r26 = { vault: B.remOf('d', 'vault') };
  return { sec0, r1, r10, r15, r22, r26, all: P.BANKS.d.boxes, base: P.BANKS.d.guards, T: P.BANK_T };
});
check('banks recover on the economic clock: the tills in two days, a tenth of the cash room a day (full in ten), the vault 4% a day (full in 25)',
  rec.r1.counter === 1 && Math.abs(rec.r1.cash - 0.1) < 0.005 && Math.abs(rec.r1.vault - 0.04) < 0.005 && rec.r10.cash === 1 && rec.r26.vault === 1, JSON.stringify(rec));
check('drilled deposit boxes hold nothing for three weeks, then are full again; each security step wears off in 7 economic days', rec.r1.boxes < rec.all && rec.r10.boxes < rec.all && rec.r22.boxes === rec.all && rec.sec0 >= 1 && rec.r15.sec === 0 && rec.r15.guards === rec.base, JSON.stringify(rec));

// ---------------------------------------------------------------- 7. no money engine: the same bank robbed every economic day
const loop = await ev(() => {
  const g = window.game, B = g.uw.banks, S = g.uw.S, P = window.__pv, out = {};
  const all = id => { let t = 0; for (const a of ['counter', 'cash', 'vault']) if (P.BANKS[id].split[a]) t += B.take(id, a, 1); let bx; while ((bx = B.drillBox(id))) t += bx.cash; return t; };
  for (const id of ['n', 'd', 'c']) {
    window.__days(30); // everything recovered
    const first = all(id), days = [];
    for (let d = 0; d < 14; d++) { S.econH += 24; S.day += 1; days.push(all(id)); }
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    out[id] = { first, mean: Math.round(mean), ratio: +(mean / first).toFixed(3), perHour: Math.round(mean * 2) };
  }
  out.combinedPerHour = out.n.perHour + out.d.perHour + out.c.perHour;
  return out;
});
check('robbing the same bank every economic day pays a fraction of one full robbery a day (≤ 15%: a hit branch keeps less on hand for weeks)', ['n', 'd', 'c'].every(k => loop[k].ratio <= 0.15), JSON.stringify(loop));
check('no money engine: even robbed perfectly every economic day (each time 2–5★ and a 45-day charge), ≤ $15k / $30k / $45k an hour of play', loop.n.perHour <= 15000 && loop.d.perHour <= 30000 && loop.c.perHour <= 45000, JSON.stringify(loop));

// ---------------------------------------------------------------- 8. the response: a drawn gun, the guards, the alarm, the police at the door
await ev(() => { const g = window.game, S = g.uw.S; window.__days(30); g.police.enabled = true; g.police.clear(); g.player.health = g.player.maxHealth; });
await enter('c');
const gun = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, P = window.__pv; window.__armed(true);
  window.__at(0, 8); // in the hall, in front of the door guards
  const hold = () => { g.player.raiseT = 0.6; g.player.health = g.player.maxHealth; };
  window.__step(1, hold); const warned = R.warned, alarm1 = R.alarm;
  window.__step(P.BANK_T.warnT + 1.5, hold);
  const aiming = B.guards.filter(p => p.pose.aim === 1).length;
  return { warned, alarm1, alarm: R.alarm, hostile: R.hostile, stars: g.police.level, contain: g.police.contain, aiming, robbery: g.uw.legal.live().filter(it => it.t === 'bankrob').length };
});
check('a gun out in a bank: a guard sees it and warns you first (no alarm yet)', gun.warned && !gun.alarm1, JSON.stringify(gun));
check('keep it out and the alarm goes: the guards draw on you, the police are called (3★ at the Central) and the building is contained', gun.alarm && gun.hostile && gun.aiming >= 1 && gun.stars >= 3 && gun.contain === 'bank:c', JSON.stringify(gun));
const resp = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, d = R.def; window.__noGuards();
  const s0 = g.police.level, storm = B.stormAt('c'), esc = B.escalEvery('c');
  g.player.health = 1e9; g.player.maxHealth = 1e9; // stand there and take it: we are watching the response
  window.__step(storm + 1);
  const cops = g.police.cops.filter(c => c.bankCop);
  const onFloor = cops.every(c => Math.abs(c.y - d.fy) < 0.6 && c.floor === d.fy);
  window.__step(esc);
  return { s0, s1: g.police.level, storm, esc, cops: cops.length, onFloor, inside: g.police.cops.filter(c => c.bankCop).length, visible: g.police.visible, contained: g.police.contained() };
});
check('the police storm in after the response time (40 s at the Central), on the bank’s floor, and see you inside', resp.cops >= 1 && resp.onFloor && resp.visible, JSON.stringify(resp));
check('the longer you stay, the worse it gets: another star every 30 s at the Central (contained: the stars don’t fade while you are inside)', resp.s1 > resp.s0 && resp.s1 >= 4 && resp.contained, JSON.stringify(resp));
await ev(() => { const g = window.game; g.player.maxHealth = 300; g.player.health = 300; });
await leave();
const out = await ev(() => { const g = window.game; return { contain: g.police.contain, level: g.police.level, inside: g.police.cops.filter(c => c.bankCop).length, R: g.uw.banks.R }; });
check('walk out and the robbery is over: the stars come with you, the building is no longer contained, nobody inside follows through the floor', out.contain === null && out.level >= 3 && out.inside === 0 && out.R === null, JSON.stringify(out));

// ---------------------------------------------------------------- 9. guard violence: on the case file as its own charges
await ev(() => { const g = window.game; g.police.clear(); g.police.enabled = true; });
await enter('d');
const viol = await ev(() => {
  const g = window.game, B = g.uw.banks, p0 = B.guards[0], p1 = B.guards[1];
  // what combat (320) does for a hit and a kill: damage, the hit hook, the knock
  p0.health -= 20; g.uw.onPedHit(p0, 'heavy', 20); g.peds.knock(p0, 1, 0, 0, true, 'melee');
  p1.health -= 999; g.uw.onPedHit(p1, 'gun', 999); g.peds.knock(p1, 1, 0, 0, true, 'gun');
  const L = g.uw.legal.live().map(it => it.t), ch = g.uw.legal.charges().counts.map(c => c.name);
  return { assault: L.filter(t => t === 'assaultguard').length, kill: L.filter(t => t === 'killguard').length, ch, alarm: B.R.alarm, stars: g.police.level, hostile: B.R.hostile };
});
check('hitting a guard is assault on a guard and killing one is its own charge, both on the case file and in the charges a court hears', viol.assault >= 1 && viol.kill === 1 && viol.ch.includes('Killing a security guard') && viol.ch.includes('Assaulting a security guard'), JSON.stringify(viol));
check('violence sets the alarm and turns the guards on you; a death adds a star (4★ at the Commercial)', viol.alarm && viol.hostile && viol.stars >= 4, JSON.stringify(viol));
await leave();

// ---------------------------------------------------------------- 10. a death after a robbery: the hospital, and the bank still robbed
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); window.__days(30); g.player.health = g.player.maxHealth; });
await enter('n');
const dead = await ev(() => { const g = window.game, B = g.uw.banks; window.__quiet(); window.__armed(true); window.__do('w1'); window.__finish(); return JSON.stringify(g.save.uw.banks.n); });
const death = await ev(async () => {
  const g = window.game;
  g.onPlayerDeath('test');
  await new Promise(r => setTimeout(r, 7000));
  return { banks: JSON.stringify(g.save.uw.banks.n), state: g.state, R: !!g.uw.banks.R, interior: !!g.player.interior };
});
check('a death inside after a robbery: the hospital, the robbery over, and the bank exactly as robbed', death.banks === dead && death.state === 'playing' && !death.R && !death.interior, JSON.stringify({ death, dead: dead.slice(0, 120) }));

// ---------------------------------------------------------------- 12. the bag: what it holds, a full one, making room
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(30); while (S.day % 7 !== 6) window.__days(1); g.player.health = g.player.maxHealth; });
await enter('c');
const bagT = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, P = window.__pv, T = P.BANK_T.bag; window.__quiet(); window.__armed(true); window.__noDye();
  for (let i = 0; i < 6; i++) { window.__do('w' + i); window.__finish(); }
  const tills = { cash: window.__bag(), units: R.bag.units };
  window.__do('office'); window.__finish(); window.__do('sec'); window.__do('cashdoor'); window.__finish();
  for (let k = 0; k < 3; k++) { window.__do('cash'); window.__finish(); }
  const afterCash = R.bag.units;
  B.openDoor('vault'); window.__step(4.5);
  const v0 = B.avail('c', 'vault'); let n = 0;
  while (!B.bagFull() && n++ < 8) { window.__do('vault'); window.__finish(); }
  const fullLbl = window.__spot('vault'), units = R.bag.units, vLeft = B.avail('c', 'vault'), vTook = v0 - vLeft, bagVault = R.bag.items.filter(i => i.src === 'vault').reduce((a, i) => a + i.cash, 0);
  // a full bag and the vault still holding: dump the bulkier notes (the tills, the cash room) for its hundreds
  window.__do('vault'); const ask = !document.getElementById('confirmScreen').classList.contains('hidden');
  document.getElementById('confirmYes').click(); window.__finish();
  const after = { cash: window.__bag(), units: R.bag.units, srcs: [...new Set(R.bag.items.map(i => i.src))], vault: R.bag.items.filter(i => i.src === 'vault').reduce((a, i) => a + i.cash, 0) };
  return { tills, afterCash, units, full: units >= T.cap - 0.5, fullLbl, v0, vLeft, vTook, bagVault, ask, after, per: T.per };
});
const bagOut = await walkOut('front');
check('notes take room in the bag by what they are: small bills from the tills fill it fastest, the vault’s hundreds slowest', Math.abs(bagT.tills.units - bagT.tills.cash / bagT.per.counter) < 0.01 && bagT.per.counter < bagT.per.cash && bagT.per.cash < bagT.per.vault, JSON.stringify(bagT.tills));
check('the bag fills (a late-week Central holds more than one bag); it says so, and what didn’t fit stays in the vault', bagT.full && /the bag is full/.test(bagT.fullLbl) && bagT.vLeft > 1000 && Math.abs(bagT.vTook - bagT.bagVault) <= 4, JSON.stringify(bagT));
check('a full bag can dump its bulkier notes for the vault’s hundreds (you choose); out the doors, the bag is what you get', bagT.ask && bagT.after.srcs.join() === 'vault' && bagT.after.vault > bagT.bagVault && bagOut.paid === bagT.after.cash, JSON.stringify({ after: bagT.after, out: bagOut }));

// ---------------------------------------------------------------- 13. dye packs: a burst on the way out, or found in time
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); window.__days(30); g.player.health = g.player.maxHealth; });
await enter('n');
const dye1 = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, D = window.__pv.BANK_T.dye; window.__quiet(); window.__armed(true);
  D.win = [1, 1, 1, 1]; window.__do('w0'); window.__finish(); D.win = [0, 0, 0, 0]; window.__do('w1'); window.__finish();
  const items = R.bag.items.map(i => ({ cash: i.cash, dye: i.dye, risky: i.risky })), total = window.__bag();
  // the doors with bundles nobody has gone through: a choice first
  window.__do('exit'); const panel = g.ui.modal, btns = [...document.querySelectorAll('#svcBody [data-act]')].map(b => b.dataset.act); g.ui.back();
  window.__d0 = window.__dirty(); g.police.enabled = true; g.police.setLevel(2);
  return { items, total, panel, btns, stain: D.stain };
});
const dyeOut = await walkOut('front');
const dye1b = await ev(() => { const g = window.game, p = g.player.pos; return { got: window.__dirty() - window.__d0, seen: Math.hypot(g.police.lastSeen.x - p.x, g.police.lastSeen.z - p.z) }; });
const ruinedWant = dye1.items[0].cash + Math.round(dye1.items[1].cash * dye1.stain);
check('the doors with bundles from the tills nobody has gone through: go through the bag first, or walk out now', dye1.panel === 'svcScreen' && ['check', 'out', 'stay'].every(a => dye1.btns.includes(a)), JSON.stringify(dye1));
check('a dye pack that leaves the building bursts: its bundle and some of the rest ruined, and the police see where you came out', dye1.items[0].dye && !dye1.items[1].dye && dyeOut.burst === 1 && dyeOut.ruined === ruinedWant && dyeOut.paid === dye1.total - ruinedWant && dye1b.got === dyeOut.paid && dye1b.seen < 1, JSON.stringify({ items: dye1.items, dyeOut, dye1b }));
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); window.__days(30); });
await enter('n');
const dye2 = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, D = window.__pv.BANK_T.dye; window.__quiet(); window.__armed(true);
  D.win = [1, 1, 1, 1]; window.__do('w0'); window.__finish(); D.win = [0, 0, 0, 0];
  const cash = window.__bag(); B.checkBag(); window.__finish();
  const it = R.bag.items[0]; window.__d0 = window.__dirty();
  return { cash, after: it.cash, dye: it.dye, checked: it.checked, bait: D.bait, exit: window.__spot('exit') };
});
const dye2Out = await walkOut('front');
check('gone through in time, a dye pack is found and dumped with its bait money; nothing bursts on the way out', !dye2.dye && dye2.checked && dye2.after === dye2.cash - Math.round(dye2.cash * dye2.bait) && dye2Out.burst === 0 && dye2Out.paid === dye2.after, JSON.stringify({ dye2, dye2Out }));
await ev(() => { const D = window.__pv.BANK_T.dye; Object.assign(D, window.__dye0); });

// ---------------------------------------------------------------- 14. hostages: the hall on the floor, the police negotiate, a hostage hurt ends it
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(30); g.player.health = 1e9; g.player.maxHealth = 1e9; });
await enter('c');
const hos = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, P = window.__pv; window.__noGuards();
  window.__armed(false); const unarmed = window.__spot('hall'); window.__armed(true);
  const lbl = window.__do('hall');
  const n = B.hostages(), all = B.civs.length, filed = g.uw.legal.live().map(it => it.t), stars = g.police.level, names = g.uw.legal.charges().counts.map(c => c.name);
  const storm = B.stormAt('c'), wait = B.negotiation();
  window.__step(storm + 2);
  const at1 = { cops: g.police.cops.filter(c => c.bankCop).length, negotiating: !!R.negotiating, hostages: B.hostages(), alarmT: +R.alarmT.toFixed(1), at: B.stormAt('c'), stormed: !!R.stormed, same: R === B.R };
  window.__step(wait);
  const at2 = { cops: g.police.cops.filter(c => c.bankCop).length };
  return { unarmed, lbl, n, all, filed, stars, base: P.BANKS.c.stars, names, storm, wait, cap: P.BANK_T.hostage.cap, at1, at2 };
});
check('unarmed, the banking hall offers nothing; armed, “Everybody on the floor!” makes everyone in it a hostage', hos.unarmed === null && hos.lbl === 'Everybody on the floor! · take the hall' && hos.n === hos.all && hos.n >= 10, JSON.stringify(hos));
check('taking hostages is a robbery and its own charge (hostage-taking, on the CCTV), and a star more', hos.filed.includes('hostage') && hos.filed.includes('bankrob') && hos.names.includes('Hostage-taking') && hos.stars >= hos.base + 1, JSON.stringify(hos));
check('with hostages the police negotiate before they storm (12 s a hostage, at most a minute), then come in', hos.wait === hos.cap && hos.at1.cops === 0 && hos.at1.negotiating && hos.at1.hostages === hos.n && hos.at2.cops >= 1, JSON.stringify(hos));
const nerve = await ev(() => {
  const g = window.game, B = g.uw.banks;
  const h0 = B.hostages(); window.__at(-12, -4.6); // the far end of the back corridor: out of the hall's sight
  window.__step(45);
  return { h0, h1: B.hostages(), gone: B.civs.filter(c => c.cv === 'gone').length, stillDrawn: B.civs.filter(c => c.cv === 'gone' && g.peds.peds.includes(c)).length };
});
check('hostages left out of your sight make a run for the doors (fewer hostages, fewer seconds of negotiation)', nerve.h1 < nerve.h0 && nerve.gone >= 1 && nerve.stillDrawn === 0, JSON.stringify(nerve));
await ev(() => { const g = window.game; g.player.maxHealth = 300; g.player.health = 300; });
await leave();
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(30); g.player.health = 1e9; g.player.maxHealth = 1e9; });
await enter('n');
const hurt = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R; window.__noGuards(); window.__armed(true);
  window.__do('hall'); const storm = B.stormAt('n'); window.__step(storm + 2);
  const before = g.police.cops.filter(c => c.bankCop).length;
  const live = B.civs.filter(c => c.cv === 'floor' && !c.ko), a = live[0], b = live[1];
  a.health -= 10; g.uw.onPedHit(a, 'heavy', 10); g.peds.knock(a, 1, 0, 0, true, 'melee');
  const noDeal = R.noDeal; window.__step(1);
  const after = g.police.cops.filter(c => c.bankCop).length;
  b.health -= 999; g.uw.onPedHit(b, 'gun', 999); g.peds.knock(b, 1, 0, 0, true, 'gun');
  const L = g.uw.legal.live().map(it => it.t), names = g.uw.legal.charges().counts.map(c => c.name);
  return { before, noDeal, after, harm: L.filter(t => t === 'harmhostage').length, kill: L.filter(t => t === 'killhostage').length, names, want: B.wantStars(), stars: g.police.level };
});
check('a hostage hurt: its own charge, the police stop talking and storm in at once', hurt.before === 0 && hurt.noDeal && hurt.after >= 1 && hurt.harm >= 1 && hurt.names.includes('Assaulting a hostage'), JSON.stringify(hurt));
check('a hostage killed is a killing on the case file (Killing a hostage) and a star more', hurt.kill === 1 && hurt.names.includes('Killing a hostage') && hurt.stars >= 5, JSON.stringify(hurt));
await ev(() => { const g = window.game; g.player.maxHealth = 300; g.player.health = 300; });
await leave();

// ---------------------------------------------------------------- 15. the rear staff door: picked in, an intruder in the back, out unseen or into the police
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(30); g.player.health = 300; window.__armed(false); g.uw.tools.T.picks = 2; });
await ev(() => { const g = window.game, r = g.uw.banks.rear.n; g.resetPlayerState(r.sx, r.sz, r.h + Math.PI); g.uw.findAction().act(); window.__finish(); });
await page.waitForFunction(() => !window.game.fading && window.game.player.interior, null, { timeout: 60000, polling: 100 });
const backIn = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, d = R.def, P = window.__pv, Y = P.BANK_LAYOUT.n, p = g.player;
  const at = { x: +(p.pos.x - d.ox).toFixed(2), z: +(p.pos.z - d.oz).toFixed(2) }, r0 = { via: R.via, picks: g.uw.tools.picks, alarm: R.alarm };
  window.__step(P.BANK_T.warnT + 1); // the manager at the desk: an intruder in the office
  return { at, r0, rear: Y.rear, trespass: !!R.trespass, alarm: R.alarm, burglary: g.uw.legal.live().filter(it => it.t === 'burglary').length, bankrob: g.uw.legal.live().filter(it => it.t === 'bankrob').length };
});
check('a lockpick set opens the staff door: in at the back (one set used), behind the counter', backIn.r0.via === 'back' && backIn.r0.picks === 1 && Math.abs(backIn.at.x - backIn.rear.x) < 0.3 && Math.abs(backIn.at.z - backIn.rear.z) < 0.3 && !backIn.r0.alarm, JSON.stringify(backIn));
check('seen in the back by the staff (or a guard): told to get out, then the alarm and a break-in on the CCTV', backIn.trespass && backIn.alarm && backIn.burglary >= 1, JSON.stringify(backIn));
await ev(() => window.game.uw.banks.goOut('back', true)); await frames(page, 3);
const unseen = await ev(() => {
  const g = window.game, r = g.uw.banks.rear.n, L = g.uw.loc('spot', 'bank_n');
  return { d: +Math.hypot(g.player.pos.x - r.sx, g.player.pos.z - r.sz).toFixed(2), interior: !!g.player.interior, copsAtRear: g.police.cops.filter(c => Math.hypot(c.x - r.sx, c.z - r.sz) < 8).length, lastAtFront: +Math.hypot(g.police.lastSeen.x - L.x, g.police.lastSeen.z - L.z).toFixed(2), level: g.police.level };
});
check('out of the staff door before the police cover it: on the street behind the bank, and they are still watching the front', unseen.d < 0.6 && !unseen.interior && unseen.copsAtRear === 0 && unseen.lastAtFront < 1 && unseen.level >= 1, JSON.stringify(unseen));
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(30); g.player.health = 1e9; g.player.maxHealth = 1e9; });
await enter('n');
const covered = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R, d = R.def, Y = window.__pv.BANK_LAYOUT.n; window.__noGuards(); window.__armed(true);
  window.__do('w0'); window.__finish();
  R.stormed = true; R.stormT = R.alarmT - 11; window.__step(0.1);
  const cover = R.rearCovered; R.stormN = 1; B.stormIn();
  const atRear = g.police.cops.filter(c => c.bankCop && Math.hypot(c.x - (d.ox + Y.rear.x), c.z - (d.oz + Y.rear.z)) < 1.5).length;
  return { cover, atRear };
});
await ev(() => window.game.uw.banks.goOut('back', true)); await frames(page, 3);
const caught = await ev(() => { const g = window.game, r = g.uw.banks.rear.n; return { copsAtRear: g.police.cops.filter(c => Math.hypot(c.x - r.sx, c.z - r.sz) < 8).length, last: +Math.hypot(g.police.lastSeen.x - r.sx, g.police.lastSeen.z - r.sz).toFixed(2), paid: g.uw.banks.last && g.uw.banks.last.out }; });
check('once the police cover the back, every other wave comes in through the staff door', covered.cover && covered.atRear >= 1, JSON.stringify(covered));
check('out of the staff door after that: the police are waiting at the back, and the bag still pays out through it', caught.copsAtRear >= 2 && caught.last < 1 && caught.paid === 'back', JSON.stringify(caught));
await ev(() => { const g = window.game; g.police.clear(); g.player.maxHealth = 300; g.player.health = 300; });

// ---------------------------------------------------------------- 11. an unarmed robber: a note at the window, held by the guard, arrested; the bank stays robbed
await ev(() => { const g = window.game, S = g.uw.S; g.police.clear(); g.police.enabled = true; window.__days(10); window.__armed(false); g.player.health = g.player.maxHealth; });
await enter('n');
const held = await ev(() => {
  const g = window.game, B = g.uw.banks, R = B.R;
  const lbl = window.__do('w0'); const panel = g.ui.modal; // unarmed and no alarm: the teller's banking panel
  const rob = document.querySelector('#svcBody [data-act="rob"]'); if (rob) rob.click(); window.__finish();
  const took = R.took, alarm = R.alarm, hostile = R.hostile;
  let t = 0; while (g.state === 'playing' && t++ < 60 * 40) g.update(1 / 60, 1 / 60);
  return { lbl, panel, took, alarm, hostile, state: g.state, banks: JSON.stringify(g.save.uw.banks.n) };
});
check('unarmed, a window is a bank teller (your account, your statement); a note under the glass is a robbery', held.lbl === 'Window 1 · teller' && held.panel === 'svcScreen', JSON.stringify(held).slice(0, 300));
check('the teller pays half or refuses, the alarm goes either way, and a guard holds you until you are arrested', held.alarm && !held.hostile && held.state === 'busted', JSON.stringify(held).slice(0, 300));
await page.waitForFunction(() => window.game.state !== 'busted', null, { timeout: 60000, polling: 200 });
const arrest = await ev(() => { const g = window.game, B = g.uw.banks; return { R: !!B.R, banks: JSON.stringify(g.save.uw.banks.n), interior: !!g.player.interior, jail: !!g.uw.S.jail || !!g.uw.legal.L.hearing }; });
check('an arrest ends the robbery (no bank left half-open) and resets nothing: the branch is exactly as robbed', !arrest.R && arrest.banks === held.banks && !arrest.interior && arrest.jail, JSON.stringify({ arrest, held: held.banks.slice(0, 120) }));

check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'banks');
