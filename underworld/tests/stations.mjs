/* Fuel & Go stations: several, spread over the city (never one per block), each with a door, its own
   interior, a map / Places / minimap entry; the shop, scratch cards and the Lucky Pump; robbing the
   register, the staff door, the back office (desk, stockroom, safe), once-only rules and the police. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });

const dist = await ev(() => {
  const g = window.game, w = g.world, S = w.stations;
  let minPair = 1e9; for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) minPair = Math.min(minPair, Math.hypot(S[i].door.x - S[j].door.x, S[i].door.z - S[j].door.z));
  // worst case: how far is the furthest road node from its nearest station?
  let worst = 0; for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { if (!window.__pv.RoadNet.degree(i, j)) continue; let best = 1e9; for (const s of S) best = Math.min(best, Math.hypot(i * 80 - s.door.x, j * 80 - s.door.z)); worst = Math.max(worst, best); }
  const idx = g.ui.map ? null : null; void idx;
  return { n: S.length, ids: S.map(s => s.id), minPair: Math.round(minPair), worst: Math.round(worst), places: S.every(s => w.places[s.id] && w.places[s.id].door), interiors: S.every(s => g.content.interiors.defs[s.id] && g.content.interiors.defs[s.id].store) };
});
check('five Fuel & Go stations', dist.n === 5, JSON.stringify(dist));
check('spread out (no two within 180 m) yet never far (every junction within ~470 m of one)', dist.minPair >= 180 && dist.worst <= 470, JSON.stringify(dist));
check('every station has a street door and its own interior', dist.places && dist.interiors, JSON.stringify(dist));
const listed = await ev(() => { const g = window.game, m = g.ui.mapView || g.ui.map || g.ui; const idx = (g.ui.mapIndex ? g.ui.mapIndex() : null) || (g.ui.places ? g.ui.places : null); const fn = Object.values(g.ui).find(v => v && typeof v.buildIndex === 'function'); const list = fn ? fn.buildIndex() : []; return list.filter(e => /Fuel & Go/.test(e.name)).map(e => e.name); });
check('every station is in the map’s Places index (and so on the map and GPS)', listed.length === 5, JSON.stringify(listed));

// walk into the Northgate station
const inS = await ev(() => { const g = window.game, d = g.world.places.store2.door; g.resetPlayerState(d.x, d.z + 0.6, Math.PI); g.player.pos.set(d.x, g.player.pos.y, d.z); const a = g.content.findAction(); const l = a && a.label; if (a) a.act(); return l; });
await waitFade();
const inside = await ev(() => { const g = window.game, c = g.content.interiors.cur; return { id: c && c.id, spots: c && c.spots.map(s => s.id), door: c && c.staffOpen }; });
check('the station door leads into its own shop', /Fuel/.test(inS || '') && inside.id === 'store2' && ['clerk', 'register', 'slot', 'staff', 'safe', 'stock', 'desk', 'exit'].every(k => inside.spots.includes(k)), JSON.stringify({ inS, inside }));
check('the staff door starts locked', inside.door === false, JSON.stringify(inside));
const shop = await ev(() => { const g = window.game; g.content.spotAct('clerk'); const a = document.getElementById('svcTitle').textContent; while (g.ui.stack.length) g.ui.back(); g.content.spotAct('slot'); const b2 = !!g.ui.modal; while (g.ui.stack.length) g.ui.back(); return { a, slot: b2 }; });
check('the clerk sells and the Lucky Pump plays at every station', shop.a.length > 0 && shop.slot, JSON.stringify(shop));
// back office behind the locked door
const locked = await ev(() => { const g = window.game, m0 = g.money.total(); g.content.spotAct('safe'); return { m: g.money.total() - m0, chan: !!g.content.chan }; });
check('the safe can’t be reached while the staff door is locked', locked.m === 0 && !locked.chan, JSON.stringify(locked));
// rob the register with a gun drawn
const rob = await ev(() => {
  const g = window.game, p = g.player, d = g.content.interiors.cur;
  g.save.weapons.pistol = true; g.save.ammo.pistol = 30; p.weapon = 2; if (p.equip) p.equip(2);
  const R = Math.random; Math.random = () => 0.5;
  const m0 = g.money.total(); p.pos.set(d.ox + 2.4, d.fy, d.oz + 3.5);
  // the dice stay fixed until the till is emptied: the clerk's 75% silent alarm is the branch under test
  g.content.spotAct('register');
  try { for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); } finally { Math.random = R; }
  return { gained: g.money.total() - m0, open: d.staffOpen, lvl: g.police.level, armed: !!(p.wep && !p.wep.melee) };
});
check('robbing the register with a gun: a few hundred dollars, the clerk hands over the back-office key', rob.gained >= 150 && rob.open, JSON.stringify(rob));
check('the clerk’s silent alarm (or a witness) brings the police', rob.lvl >= 1, JSON.stringify(rob));
const again = await ev(() => { const g = window.game, m0 = g.money.total(); g.content.spotAct('register'); for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); return g.money.total() - m0; });
check('the same till can’t be robbed twice in a day', again === 0, again);
// the back office: safe (slow), desk, stockroom
const back = await ev(() => {
  const g = window.game, p = g.player, d = g.content.interiors.cur, out = {};
  const R = Math.random; Math.random = () => 0.9;
  p.pos.set(d.ox + 4.6, d.fy, d.oz - 4.4); let m0 = g.money.total(); g.content.spotAct('safe');
  for (let n = 0; n < 60 * 9; n++) g.update(1 / 60, 1 / 60);
  out.safe = g.money.total() - m0;
  m0 = g.money.total(); g.content.spotAct('safe'); for (let n = 0; n < 60 * 9; n++) g.update(1 / 60, 1 / 60); out.safeAgain = g.money.total() - m0;
  const inv0 = JSON.stringify(g.uw.S.inv); p.pos.set(d.ox - 3.6, d.fy, d.oz - 3.3); g.content.spotAct('stock'); out.stock = JSON.stringify(g.uw.S.inv) !== inv0;
  Math.random = () => 0.1; m0 = g.money.total(); p.pos.set(d.ox + 3.0, d.fy, d.oz - 3.6); g.content.spotAct('desk'); out.desk = g.money.total() - m0;
  Math.random = R;
  return out;
});
check('the office safe takes time to crack and pays thousands', back.safe >= 1000, JSON.stringify(back));
check('a cracked safe is empty until next week', back.safeAgain === 0, JSON.stringify(back));
check('the stockroom and the desk hold something (cartons, hot goods, petty cash)', back.stock && back.desk > 0, JSON.stringify(back));
await ev(() => { window.game.police.clear(); window.game.content.spotAct('exit'); }); await waitFade();
// a different station: force the staff door without robbing the till
const force = await ev(() => { const g = window.game; g.content.interiors.enter('store3', true); const d = g.content.interiors.cur, p = g.player; p.pos.set(d.ox + 3.2, d.fy, d.oz - 1.0); g.content.spotAct('staff'); for (let n = 0; n < 60 * 5; n++) g.update(1 / 60, 1 / 60); const r = { id: d.id, open: d.staffOpen, col: d.cols[d.staffCol].on }; g.content.interiors.exit(true); return r; });
check('the staff door can be forced (and its collider opens)', force.id === 'store3' && force.open && force.col === false, JSON.stringify(force));
const reset = await ev(() => { const g = window.game; g.content.interiors.enter('store3', true); const d = g.content.interiors.cur; const r = { open: d.staffOpen, col: d.cols[d.staffCol].on }; g.content.interiors.exit(true); return r; });
check('coming back later, the staff door is locked again', reset.open === false && reset.col === true, JSON.stringify(reset));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'stations');
