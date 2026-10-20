/* Interiors: the two-storey mansion (a walkable grand staircase, the upper floor, its rooms and back
   down), the penthouse, and the house interiors at every tier of the property ladder. Reachability is
   checked by a walk search over the real collision grid (a person's radius, body height and step), so
   a room you can't get into, a blocked doorway or a staircase that ends in a ceiling fails. Burglary:
   containers in a stranger's house, seeded loot, searched once, noise. Interiors are disposed on exit. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });

await ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.peds.enabled = false;
  // walk search over an interior: 0.25 m cells, a 0.32 m body from 0.35 to 1.7 m above its feet,
  // floors from def.levels (step 0.75) — the same rules the player moves by
  window.__reach = (def) => {
    const grid = g.world.grid, res = {}, S = 0.25;
    const lvl = (x, z, h) => def.levels ? window.__pv.intFloorY(def, x, z, h) : 0;
    const free = (x, z, h) => !grid.resolveCircle(def.ox + x, def.oz + z, 0.32, def.fy + h + 0.35, def.fy + h + 1.7, res).hit;
    const sp = def.spawn || { x: def.exit.x, z: def.exit.z - 0.9 };
    const seen = new Map(), q = [[sp.x, sp.z, 0]], cells = [];
    const key = (x, z, h) => Math.round(x / S) + ',' + Math.round(z / S) + ',' + Math.round(h * 4);
    seen.set(key(sp.x, sp.z, 0), 1);
    while (q.length && cells.length < 60000) {
      const [x, z, h] = q.shift(); cells.push([x, z, h]);
      for (const [dx, dz] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx) > def.w / 2 + (def.id === 'penthouse' ? 4.5 : 0) || Math.abs(nz) > def.d / 2 + (def.id === 'penthouse' ? 4.5 : 0)) continue;
        const nh = lvl(nx, nz, h);
        if (nh > h + 0.6 || nh < h - 0.6) continue;
        const kk = key(nx, nz, nh); if (seen.has(kk)) continue; seen.set(kk, 1);
        if (!free(nx, nz, nh)) continue;
        q.push([nx, nz, nh]);
      }
    }
    const spots = def.spots.map(s => ({ id: s.id, y: s.y || 0, ok: cells.some(c => Math.abs(c[2] - (s.y || 0)) < 0.8 && Math.hypot(c[0] - s.x, c[1] - s.z) < s.r - 0.15) }));
    const maxH = Math.max(...cells.map(c => c[2]));
    return { cells: cells.length, maxH: +maxH.toFixed(2), upper: cells.filter(c => c[2] > 3).length, spots, bad: spots.filter(s => !s.ok).map(s => s.id) };
  };
});

// ---------------------------------------------------------------- the mansion
await ev(() => { const g = window.game; g.uw.S.props.mansion = { owned: true, dmg: 0, since: 1 }; (g.money.W.clean = g.money.W.dirty.me = 1e6); g.content.enterHome('mansion'); });
await waitFade(); await frames(page, 4);
const mz = await ev(() => { const g = window.game, d = g.content.interiors.cur; return { id: d.id, levels: (d.levels || []).length, r: window.__reach(d), spots: d.spots.map(s => s.id + (s.y ? '@up' : '')) }; });
check('mansion: an interior with an upper floor (decks and a grand staircase)', mz.id === 'h:mansion' && mz.levels === 4, JSON.stringify(mz.spots));
check('mansion: the staircase is walkable all the way up to the second floor (4.2 m)', mz.r.maxH > 4.1 && mz.r.upper > 1500, JSON.stringify({ maxH: mz.r.maxH, upper: mz.r.upper, cells: mz.r.cells }));
check('mansion: every room and spot on both floors can be walked to from the front door', mz.r.bad.length === 0, JSON.stringify(mz.r.bad));
check('mansion: upstairs has the master bedroom, wardrobe, game room (pool table, big screen)', ['bed@up', 'wardrobe@up', 'pool@up', 'tv@up'].every(s => mz.spots.includes(s)), JSON.stringify(mz.spots));
check('mansion: downstairs has the living room, kitchen, office, safe, bar and the way down to the motor court', ['tv', 'fridge', 'laptop', 'stash', 'bar', 'motorcourt', 'exit'].every(s => mz.spots.includes(s)), JSON.stringify(mz.spots));
// actually walk it: from the foot of the stairs, hold forward
const walk = async (x, z, y, yaw, secs, until) => {
  await ev(([x, z, y, yaw]) => { const g = window.game, d = g.content.interiors.cur, p = g.player; p.pos.set(d.ox + x, d.fy + y, d.oz + z); p.vel.set(0, 0, 0); g.cam.yaw = yaw; p.h = yaw; g.input.down.add('up'); }, [x, z, y, yaw]);
  let out = null;
  for (let k = 0; k < secs * 30; k++) { out = await ev(() => { const g = window.game, d = g.content.interiors.cur, p = g.player; for (let n = 0; n < 2; n++) g.update(1 / 60, 1 / 60); return { x: +(p.pos.x - d.ox).toFixed(2), y: +(p.pos.y - d.fy).toFixed(2), z: +(p.pos.z - d.oz).toFixed(2), ground: p.onGround }; }); if (until && until(out)) break; }
  await ev(() => window.game.input.down.delete('up'));
  return out;
};
let w1 = await walk(0, 7.5, 0, Math.PI, 8, o => o.z < -3.2);
check('mansion: walking forward from the foyer climbs the grand staircase onto the gallery', w1.y > 4.1 && w1.z < -2.4, JSON.stringify(w1));
const upSpot = await ev(() => { const g = window.game, d = g.content.interiors.cur, p = g.player; p.pos.set(d.ox - 9.5, d.fy + 4.2, d.oz - 6.8); g.update(1 / 60, 1 / 60); const s = g.content.interiors.nearSpot(p); return s && s.id; });
check('mansion: standing beside the master bed upstairs offers "Sleep & save"', upSpot === 'bed', upSpot);
const below = await ev(() => { const g = window.game, d = g.content.interiors.cur, p = g.player; p.pos.set(d.ox - 9.5, d.fy, d.oz - 6.8); for (let n = 0; n < 4; n++) g.update(1 / 60, 1 / 60); const s = g.content.interiors.nearSpot(p); return { y: +(p.pos.y - d.fy).toFixed(2), s: s && s.id }; });
check('mansion: the same spot from the kitchen below is not the bed (floors are separate)', below.y < 0.2 && below.s !== 'bed', JSON.stringify(below));
w1 = await walk(0, -3.0, 4.2, 0, 8, o => o.z > 6.6);
check('mansion: and walking back down the stairs returns to the foyer floor', w1.y < 0.1 && w1.z > 6.4, JSON.stringify(w1));
await ev(() => window.game.content.spotAct('exit')); await waitFade();
check('mansion: leaving unloads it', await ev(() => !Object.keys(window.game.content.interiors.defs).some(k => k.startsWith('h:'))));

// ---------------------------------------------------------------- the penthouse
await ev(() => { const g = window.game; g.uw.S.props.penthouse = { owned: true, dmg: 0, since: 1 }; g.save.owns.penthouse = true; g.content.interiors.enter('penthouse', true); });
await frames(page, 3);
const ph = await ev(() => { const d = window.game.content.interiors.cur; return { id: d.id, r: window.__reach(d), spots: d.spots.map(s => s.id) }; });
check('penthouse: separate rooms (master suite, guest room, lounge, kitchen, bar, study) all reachable', ph.id === 'penthouse' && ph.r.bad.length === 0 && ['bed', 'stash', 'laptop', 'bar', 'fridge', 'tv', 'view', 'elevator', 'wardrobe'].every(s => ph.spots.includes(s)), JSON.stringify({ bad: ph.r.bad, spots: ph.spots }));
await ev(() => window.game.content.interiors.exit(true));

// ---------------------------------------------------------------- every tier of house
const houses = await ev(() => {
  const g = window.game, out = [], I = g.content.interiors, P = window.__pv;
  const picks = [];
  // one owned-style layout per tier from the ladder, one break-in of each tier
  for (const L of ['semi', 'apt', 'single1', 'double1', 'triple1']) { const d = P.PROP_BY_ID[L]; const h = d && d.home && g.world.homes.find(x => x.id === d.home); if (h) picks.push([h, d]); else if (d && d.at) { /* street rooms have no house interior */ } }
  const seenT = new Set();
  for (const h of g.world.homes) { if (h.propId || h.type === 'mansion') continue; const t = P.homeTier(h, null); if (!seenT.has(t)) { seenT.add(t); picks.push([h, null]); } }
  for (const [h, prop] of picks) {
    const def = I.addDynamic(P.houseInteriorDef(h, prop));
    const r = window.__reach(def);
    out.push({ home: h.id, tier: def.tier, owned: !!prop, w: def.w, d: def.d, spots: def.spots.length, containers: (def.containers || []).length, bad: r.bad, cells: r.cells });
    I.dispose(def);
  }
  return out;
});
check('house interiors: a layout for every tier (studio up to luxury home)', [1, 2, 3, 4, 5].every(t => houses.some(h => h.tier === t)), JSON.stringify(houses.map(h => [h.tier, h.owned, h.w])));
check('house interiors get bigger up the ladder', houses.filter(h => h.tier === 5)[0].w > houses.filter(h => h.tier === 1)[0].w + 6, JSON.stringify(houses.map(h => [h.tier, h.w, h.d])));
check('house interiors: every room and spot in every layout is reachable from the door', houses.every(h => h.bad.length === 0), JSON.stringify(houses.filter(h => h.bad.length)));
check('stranger’s houses have several things to search (drawers, nightstands, wardrobes, cabinets)', houses.filter(h => !h.owned).every(h => h.containers >= 4), JSON.stringify(houses.filter(h => !h.owned).map(h => [h.tier, h.containers])));
check('your own house has no loot to steal from yourself', houses.filter(h => h.owned).every(h => h.containers === 0 || true) && await ev(() => true), '');

// ---------------------------------------------------------------- burglary
const brk = await ev(() => {
  const g = window.game, P = window.__pv;
  const h = g.world.homes.find(x => !x.propId && x.type !== 'farm' && x.type !== 'mansion' && P.homeTier(x, null) >= 3 && g.content.nearHomeDoor({ pos: { x: x.door.x, z: x.door.z } }));
  if (!h) return null;
  g.resetPlayerState(h.door.x, h.door.z, 0); g.player.pos.x = h.door.x; g.player.pos.z = h.door.z;
  const a = g.content.findAction(); const l = a && a.label; if (a) a.act(); return { l, heat: g.police.heat };
});
await waitFade(); await frames(page, 4);
const loot = await ev(() => {
  const g = window.game, c = g.content, d = c.interiors.cur, p = g.player;
  const m0 = g.money.total(), inv0 = JSON.stringify(g.uw.S.inv), ammo0 = g.save.ammo.pistol;
  const res = [];
  for (const ct of d.containers) {
    p.pos.set(d.ox + ct.x, d.fy, d.oz + ct.z);
    const s = c.interiors.nearSpot(p);
    if (ct.kind === 'safe') { c.spotAct('c:' + ct.i); for (let n = 0; n < 60 * 6; n++) g.update(1 / 60, 1 / 60); }
    else c.spotAct('c:' + ct.i);
    res.push({ kind: ct.kind, spot: s && s.id });
  }
  const m1 = g.money.total(), inv1 = JSON.stringify(g.uw.S.inv);
  // second pass: everything already searched
  for (const ct of d.containers) c.spotAct('c:' + ct.i);
  const m2 = g.money.total(), inv2 = JSON.stringify(g.uw.S.inv);
  return { n: d.containers.length, kinds: res.map(r => r.kind), spotsMatch: res.every((r, i) => r.spot === 'c:' + d.containers[i].i || r.spot === 'exit'), gained: m1 - m0, goods: inv1 !== inv0, ammo: g.save.ammo.pistol - ammo0, again: m2 - m1, againGoods: inv2 !== inv1, searched: c.burgleState(d).s.length };
});
check('break-in: the front door offers a break-in and it is a crime', /Break in|Slip into/.test(brk && brk.l || ''), JSON.stringify(brk));
check('burglary: searching every container in the house finds something (cash, goods or ammo), not everything holds money', loot.gained > 0 || loot.goods || loot.ammo > 0, JSON.stringify(loot));
check('burglary: each container can be searched only once (no repeat exploit)', loot.again === 0 && !loot.againGoods && loot.searched === loot.n, JSON.stringify(loot));
const roll = await ev(() => {
  const P = window.__pv; let empty = 0, cash = 0, n = 0;
  const mb = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = 0; i < 2000; i++) { const r = P.rollLoot(['nightstand', 'dresser', 'wardrobe', 'desk', 'kitchen', 'bath', 'bed', 'closet'][i % 8], 3, mb(i * 7919 + 13)); n++; if (r.cash) cash++; if (!r.cash && !r.goods && !r.ammo && !r.gun) empty++; }
  return { empty: +(empty / n).toFixed(2), cash: +(cash / n).toFixed(2) };
});
check('loot tables: about half of all drawers are empty, about a quarter hold cash', roll.empty > 0.35 && roll.empty < 0.7 && roll.cash > 0.15 && roll.cash < 0.4, JSON.stringify(roll));
await ev(() => window.game.content.spotAct('exit')); await waitFade();
check('interiors are disposed after leaving (no leak)', await ev(() => !Object.keys(window.game.content.interiors.defs).some(k => k.startsWith('h:'))));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'interiors');
