/* Warehouse compounds (Session 3B, DC-30): the physical security layer, at both warehouses.
   - Every security tier changes what you see: each step of perimeter, access and surveillance rebuilds the compound
     with something new; each vault tier rebuilds the rooms inside. All five security levels look different.
   - The tiers a compound shows survive save and reload (the compound is rebuilt from the saved tiers).
   - The gate opens for the player (on foot and driving), crew who work there, a Driver's van and a vehicle with a
     delivery for the warehouse; it stays shut for rival gangsters and their cars, ordinary traffic, a crew member
     who works somewhere else, a fired one and an expired delivery. Nobody it refuses gets into the yard.
   - Vans and the player's car drive in through the gate, dock, back out and leave without touching the fence, the
     gate or its posts; the loading bay moves cargo between the trunk and the warehouse and its dock door opens only
     for an authorized vehicle.
   - Inside, at every tier, the exit, every interaction point, every room's door and the stair to the mezzanine are
     reachable on foot (a flood fill with the player's own radius, step limit and floor heights).
   - Maximum Security's geometry does what it claims: the perimeter is closed, the gate and fence can't be rammed,
     the wedge stops a tailgater, the cameras cover the whole yard and the approach by day and by night. Lower tiers
     don't get any of that for free: an open lot is open, weak gates and fences break, the cameras leave gaps.
   - The compound stays within the mobile budget: its per-frame update, draw calls and triangles. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const IDS = ['whse_w', 'whse_d'];
await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, PV = window.__pv;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false; M.W.clean = 1e9; M.W.dirty.me = 1e6;
  g.env.time = 13;
  const CATS = ['perimeter', 'surveillance', 'access', 'vault'];
  window.__T = (id, t) => { const st = uw.whse.st(id); for (const k of CATS) st.up[k] = typeof t === 'number' ? t : (t[k] || 0); uw.compounds.build(id); };
  window.__hire = (role, id) => { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; const e = uw.crew.hire(0); if (e) throw new Error(e); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90; c.traits = []; c.skill = 70; if (role) { const r = uw.crew.assign(c.id, role, 'w:' + id); if (r) throw new Error(r); } return c.id; };
  // what the compound looks like: every vertex of its meshes, the gate leaf and the wedge
  window.__sig = id => { const R = uw.compounds.R[id]; let h = 0, n = 0; for (const grp of [R.group, R.gateGrp, R.wedgeGrp]) if (grp) grp.traverse(o => { if (!o.geometry) return; const p = o.geometry.attributes.position.array; n += p.length; for (let i = 0; i < p.length; i += 7) h = (h * 31 + Math.round(p[i] * 10)) | 0; }); return n + ':' + h; };
  // somewhere out of everyone's way (but close enough that the compound is simulated)
  window.__away = id => { const C = g.world.compounds[id]; g.resetPlayerState(C.gate.x - C.gate.n[0] * 45, C.gate.z - C.gate.n[1] * 45, 0); };
  window.__lot = (id, x, z) => { const L = g.world.compounds[id].lot; return x > L.x0 + 0.2 && x < L.x1 - 0.2 && z > L.z0 + 0.2 && z < L.z1 - 0.2; };
  // street-level flood fill from outside the gate: can someone on foot (or a car, r) get into the yard?
  window.__fill = (id, r = 0.3) => {
    const C = g.world.compounds[id], L = C.lot, B = C.bld, grid = g.world.grid, res = {}, s = 0.5, m = 7;
    const x0 = L.x0 - m, z0 = L.z0 - m, nx = Math.ceil((L.x1 - L.x0 + 2 * m) / s), nz = Math.ceil((L.z1 - L.z0 + 2 * m) / s);
    const seen = new Uint8Array(nx * nz), q = [];
    const free = (i, j) => { const x = x0 + i * s, z = z0 + j * s; return !grid.resolveCircle(x, z, r, PV.groundY(x, z) + 0.35, PV.groundY(x, z) + 1.7, res).hit; };
    const si = Math.round((C.gate.x - C.gate.n[0] * 5 - x0) / s), sj = Math.round((C.gate.z - C.gate.n[1] * 5 - z0) / s);
    seen[sj * nx + si] = 1; q.push(si, sj); let inYard = 0;
    while (q.length) { const j = q.pop(), i = q.pop(); const x = x0 + i * s, z = z0 + j * s; if (x > L.x0 + 0.5 && x < L.x1 - 0.5 && z > L.z0 + 0.5 && z < L.z1 - 0.5 && !(x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1)) inYard++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz || seen[c * nx + a]) continue; seen[c * nx + a] = 1; if (free(a, c)) q.push(a, c); } }
    return inYard;
  };
  // the inside: flood fill with the player's radius, floor heights (deck, stair) and step limit, from the spawn point
  window.__inside = () => {
    const I = g.content.interiors, def = I.cur, grid = g.world.grid, res = {}, s = 0.25, hw = def.w / 2, hd = def.d / 2;
    const nx = Math.ceil(def.w / s) + 1, nz = Math.ceil(def.d / s) + 1, seen = new Map(), q = [], cells = [];
    const key = (i, j, y) => (i * 1000 + j) * 10 + Math.round(y);
    const sp = def.spawn || { x: def.exit.x, z: def.exit.z - 0.9 };
    const start = [Math.round((sp.x + hw) / s), Math.round((sp.z + hd) / s), 0];
    seen.set(key(...start), 1); q.push(start);
    while (q.length) {
      const [i, j, y] = q.pop(); cells.push([-hw + i * s, -hd + j * s, y]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
        const lx = -hw + a * s, lz = -hd + c * s, ny = PV.intFloorY(def, lx, lz, y);
        if (Math.abs(ny - y) > 0.75) continue;
        const k = key(a, c, ny); if (seen.has(k)) continue; seen.set(k, 1);
        if (grid.resolveCircle(def.ox + lx, def.oz + lz, 0.34, def.fy + ny + 0.35, def.fy + ny + 1.7, res).hit) continue;
        q.push([a, c, ny]);
      }
    }
    const at = (x, z, y, r) => cells.some(([cx, cz, cy]) => Math.hypot(cx - x, cz - z) < r && Math.abs(cy - y) < 1.6);
    const spots = def.spots.map(p => ({ id: p.id, ok: at(p.x, p.z, p.y || 0, Math.max(0.4, p.r - 0.3)) }));
    return { cells: cells.length, exit: at(def.exit.x, def.exit.z, 0, 1.0), deck: cells.some(c => c[2] > 3), spots, def: def.id, tiers: def.tiers };
  };
  window.__pilot = null;
  const dc = g.driveControl.bind(g); g.driveControl = dt => { dc(dt); if (window.__pilot && g.player.vehicle === window.__pilot.v) window.__pilot.update(dt); };
  for (const id of ['whse_w', 'whse_d']) uw.props.buy(id);
});

// ---------------------------------------------------------------- 1. layout: two compounds, the door inside the yard, an unowned one open
const lay = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  for (const id of ['whse_w', 'whse_d']) { const C = g.world.compounds[id], L = uw.loc('prop', id); out[id] = { door: window.__lot(id, L.x, L.z), docks: C.docks.length, lanes: C.lanes.in.length, park: uw.props.bays(window.__pv.PROP_BY_ID[id]).filter(b => window.__lot(id, b.x, b.z)).length }; }
  return out;
});
check('both warehouses have a compound: the door is inside the yard, two loading docks with drive lanes, yard parking', ['whse_w', 'whse_d'].every(id => lay[id].door && lay[id].docks === 2 && lay[id].lanes === 2 && lay[id].park >= 1), JSON.stringify(lay));

// ---------------------------------------------------------------- 2. every security tier changes what you see
const vis = await ev(() => {
  const g = window.game, uw = g.uw, PV = window.__pv, out = {};
  for (const id of ['whse_w', 'whse_d']) {
    const o = out[id] = { cat: {}, levels: [], vault: [] };
    for (const k of ['perimeter', 'access', 'surveillance']) {
      const sigs = [], feat = [];
      for (let t = 0; t <= 4; t++) { window.__T(id, { [k]: t }); sigs.push(window.__sig(id)); const s = uw.compounds.status(id); feat.push(k === 'perimeter' ? s.fence : k === 'access' ? s.gate + (s.booth ? '+booth' : '') : s.cams + 'c' + s.lights + 'l'); }
      o.cat[k] = { distinct: new Set(sigs).size, feat };
    }
    for (let L = 1; L <= 5; L++) { window.__T(id, L - 1); o.levels.push(window.__sig(id)); }
    // the vault tier changes the rooms inside
    for (let t = 0; t <= 4; t++) { const def = PV.warehouseInteriorDef(g.world.compounds[id], id, { perimeter: 0, surveillance: 0, access: 0, vault: t }); const k = new PV.InteriorKit(def.h); def.build(k, () => 0.5, def); o.vault.push({ n: k.a.p.length, spots: def.spots.map(s => s.id.slice(2) + ':' + s.label.split(' ·')[0]).sort().join(',') }); }
    // a bought upgrade shows at once
    window.__T(id, 0); const s0 = window.__sig(id); g.money.W.clean = 1e9; const e = uw.whse.upgrade(id, 'perimeter'); o.bought = { e, changed: window.__sig(id) !== s0 };
  }
  return out;
});
for (const id of IDS) {
  const o = vis[id];
  check(`${id}: each perimeter tier looks different (open lot → chain-link → tall fence + bollards → anti-climb + barriers → wall)`, o.cat.perimeter.distinct === 5 && o.cat.perimeter.feat.join() === 'none,chain,tall,anticlimb,wall', JSON.stringify(o.cat.perimeter));
  check(`${id}: each access tier looks different (no gate → basic → motorised → reinforced + booth → massive + booth)`, o.cat.access.distinct === 5 && o.cat.access.feat.join() === 'none,basic,motor,reinforced+booth,massive+booth', JSON.stringify(o.cat.access));
  check(`${id}: each surveillance tier looks different (more cameras and more lights every step)`, o.cat.surveillance.distinct === 5 && o.cat.surveillance.feat.map(f => f.split('c')[0]).join() === '0,2,4,6,10' && o.cat.surveillance.feat.every((f, i) => i === 0 || parseInt(f.split('c')[1]) > parseInt(o.cat.surveillance.feat[i - 1].split('c')[1])), JSON.stringify(o.cat.surveillance));
  check(`${id}: each vault tier changes the rooms (cash box → safe and cages → cash room → vault and armory → large vault, product vault, ready room)`, new Set(o.vault.map(v => v.n + v.spots)).size === 5 && /vault:Cash box/.test(o.vault[0].spots) && /vault:Safe/.test(o.vault[1].spots) && /vault:Cash room/.test(o.vault[2].spots) && /armory/.test(o.vault[3].spots) && /pvault/.test(o.vault[4].spots) && /ready/.test(o.vault[4].spots), JSON.stringify(o.vault));
  check(`${id}: the five security levels all look different, and a bought upgrade rebuilds the compound at once`, new Set(o.levels).size === 5 && o.bought.e === '' && o.bought.changed, JSON.stringify({ levels: o.levels, bought: o.bought }));
}

// ---------------------------------------------------------------- 3. the tiers (and what they built) survive save and reload
const saved = await ev(() => {
  const g = window.game, uw = g.uw;
  window.__T('whse_w', { perimeter: 3, surveillance: 2, access: 4, vault: 1 }); window.__T('whse_d', { perimeter: 1, surveillance: 4, access: 2, vault: 3 });
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return Object.fromEntries(['whse_w', 'whse_d'].map(id => [id, { sig: window.__sig(id), st: JSON.stringify(uw.compounds.status(id)), up: JSON.stringify(uw.whse.st(id).up) }]));
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 4);
const loaded = await ev(() => {
  const g = window.game, uw = g.uw;
  const CATS = ['perimeter', 'surveillance', 'access', 'vault'];
  window.__sig = id => { const R = uw.compounds.R[id]; let h = 0, n = 0; for (const grp of [R.group, R.gateGrp, R.wedgeGrp]) if (grp) grp.traverse(o => { if (!o.geometry) return; const p = o.geometry.attributes.position.array; n += p.length; for (let i = 0; i < p.length; i += 7) h = (h * 31 + Math.round(p[i] * 10)) | 0; }); return n + ':' + h; };
  return Object.fromEntries(['whse_w', 'whse_d'].map(id => [id, { sig: window.__sig(id), st: JSON.stringify(uw.compounds.status(id)), up: JSON.stringify(uw.whse.st(id).up) }]));
});
check('save → reload: both compounds come back with the same tiers and the same fence, gate, cameras and lights', IDS.every(id => saved[id].up === loaded[id].up && saved[id].sig === loaded[id].sig && saved[id].st === loaded[id].st), JSON.stringify({ saved, loaded }));
// the helpers again (a reload drops the page's globals)
await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, PV = window.__pv;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false; M.W.clean = 1e9; M.W.dirty.me = 1e6; g.env.time = 13;
  const CATS = ['perimeter', 'surveillance', 'access', 'vault'];
  window.__T = (id, t) => { const st = uw.whse.st(id); for (const k of CATS) st.up[k] = typeof t === 'number' ? t : (t[k] || 0); uw.compounds.build(id); };
  window.__hire = (role, id) => { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; const e = uw.crew.hire(0); if (e) throw new Error(e); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90; c.traits = []; c.skill = 70; if (role) { const r = uw.crew.assign(c.id, role, 'w:' + id); if (r) throw new Error(r); } return c.id; };
  window.__away = id => { const C = g.world.compounds[id]; g.resetPlayerState(C.gate.x - C.gate.n[0] * 45, C.gate.z - C.gate.n[1] * 45, 0); };
  window.__lot = (id, x, z) => { const L = g.world.compounds[id].lot; return x > L.x0 + 0.2 && x < L.x1 - 0.2 && z > L.z0 + 0.2 && z < L.z1 - 0.2; };
  window.__fill = (id, r = 0.3) => {
    const C = g.world.compounds[id], L = C.lot, B = C.bld, grid = g.world.grid, res = {}, s = 0.5, m = 7;
    const x0 = L.x0 - m, z0 = L.z0 - m, nx = Math.ceil((L.x1 - L.x0 + 2 * m) / s), nz = Math.ceil((L.z1 - L.z0 + 2 * m) / s);
    const seen = new Uint8Array(nx * nz), q = [];
    const free = (i, j) => { const x = x0 + i * s, z = z0 + j * s; return !grid.resolveCircle(x, z, r, PV.groundY(x, z) + 0.35, PV.groundY(x, z) + 1.7, res).hit; };
    const si = Math.round((C.gate.x - C.gate.n[0] * 5 - x0) / s), sj = Math.round((C.gate.z - C.gate.n[1] * 5 - z0) / s);
    seen[sj * nx + si] = 1; q.push(si, sj); let inYard = 0;
    while (q.length) { const j = q.pop(), i = q.pop(); const x = x0 + i * s, z = z0 + j * s; if (x > L.x0 + 0.5 && x < L.x1 - 0.5 && z > L.z0 + 0.5 && z < L.z1 - 0.5 && !(x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1)) inYard++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz || seen[c * nx + a]) continue; seen[c * nx + a] = 1; if (free(a, c)) q.push(a, c); } }
    return inYard;
  };
  window.__inside = () => {
    const I = g.content.interiors, def = I.cur, grid = g.world.grid, res = {}, s = 0.25, hw = def.w / 2, hd = def.d / 2;
    const nx = Math.ceil(def.w / s) + 1, nz = Math.ceil(def.d / s) + 1, seen = new Map(), q = [], cells = [];
    const key = (i, j, y) => (i * 1000 + j) * 10 + Math.round(y);
    const sp = def.spawn || { x: def.exit.x, z: def.exit.z - 0.9 };
    const start = [Math.round((sp.x + hw) / s), Math.round((sp.z + hd) / s), 0];
    seen.set(key(...start), 1); q.push(start);
    while (q.length) {
      const [i, j, y] = q.pop(); cells.push([-hw + i * s, -hd + j * s, y]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
        const lx = -hw + a * s, lz = -hd + c * s, ny = PV.intFloorY(def, lx, lz, y);
        if (Math.abs(ny - y) > 0.75) continue;
        const k = key(a, c, ny); if (seen.has(k)) continue; seen.set(k, 1);
        if (grid.resolveCircle(def.ox + lx, def.oz + lz, 0.34, def.fy + ny + 0.35, def.fy + ny + 1.7, res).hit) continue;
        q.push([a, c, ny]);
      }
    }
    const at = (x, z, y, r) => cells.some(([cx, cz, cy]) => Math.hypot(cx - x, cz - z) < r && Math.abs(cy - y) < 1.6);
    const spots = def.spots.map(p => ({ id: p.id, ok: at(p.x, p.z, p.y || 0, Math.max(0.4, p.r - 0.3)) }));
    return { cells: cells.length, exit: at(def.exit.x, def.exit.z, 0, 1.0), deck: cells.some(c => c[2] > 3), spots, def: def.id, tiers: def.tiers };
  };
  window.__pilot = null;
  const dc = g.driveControl.bind(g); g.driveControl = dt => { dc(dt); if (window.__pilot && g.player.vehicle === window.__pilot.v) window.__pilot.update(dt); };
});

// ---------------------------------------------------------------- 4. who the gate opens for
// run the game for n frames and report the gate's widest opening (and the wedge's)
// clear the compounds of every car but the player's (vans that left, test cars), so each scenario starts alone
const clearCars = () => ev(() => { const g = window.game; for (const V of g.uw.compounds.vans) V.v.wh = null; g.uw.compounds.vans = []; for (const v of g.vehicles.list.slice()) { if (v === g.player.vehicle) continue; for (const id in g.world.compounds) { const c = g.world.compounds[id].center; if (Math.hypot(v.pos.x - c.x, v.pos.z - c.z) < 90) { g.vehicles.despawn(v); break; } } } });
const watch = async (id, n) => { await ev(id => { const R = window.game.uw.compounds.R[id]; window.__gmax = 0; window.__wmax = 0; window.__gby = new Set(); window.__gw = () => { if (R.gate && R.gate.want) window.__gby.add(R.gate.by); window.__gmax = Math.max(window.__gmax, R.gate ? R.gate.open : 0); window.__wmax = Math.max(window.__wmax, R.wedge ? R.wedge.down : 0); }; }, id); for (let k = 0; k < n; k += 5) { await frames(page, 5); await ev(() => window.__gw()); } return ev(() => ({ gate: +window.__gmax.toFixed(2), wedge: +window.__wmax.toFixed(2), by: [...window.__gby] })); };
for (const id of IDS) {
  await clearCars();
  await ev(id => { window.__T(id, { perimeter: 2, surveillance: 2, access: 4, vault: 0 }); window.__away(id); }, id);
  await frames(page, 30);
  // the player on foot, then in a car
  await ev(id => { const g = window.game, C = g.world.compounds[id]; g.resetPlayerState(C.gate.x - C.gate.n[0] * 3, C.gate.z - C.gate.n[1] * 3, 0); }, id);
  const foot = await watch(id, 70);
  await ev(id => { window.__away(id); }, id); await frames(page, 80);
  const shut = await ev(id => +window.game.uw.compounds.R[id].gate.open.toFixed(2), id);
  await ev(id => { const g = window.game, C = g.world.compounds[id]; const x = C.gate.x - C.gate.n[0] * 9, z = C.gate.z - C.gate.n[1] * 9; g.resetPlayerState(x + 3, z, 0); const v = g.vehicles.spawn('sedan', x, z, Math.atan2(C.gate.n[0], C.gate.n[1]), { parked: true }); v.touched = true; g.completeEnter(v); window.__pv0 = v; }, id);
  const drive = await watch(id, 70);
  await ev(id => { const g = window.game; g.exitVehicle(true); g.vehicles.despawn(window.__pv0); window.__away(id); }, id); await frames(page, 80);
  check(`${id}: the gate opens for the player on foot and driving, and closes behind them`, foot.gate === 1 && drive.gate === 1 && shut === 0 && foot.wedge === 1, JSON.stringify({ foot, shut, drive }));

  // crew who work here walk in through it; crew who work elsewhere, or who were fired, are left outside
  const crew = await ev(id => { const g = window.game, uw = g.uw; const enf = window.__hire('enforcer', id), other = window.__hire('enforcer', id === 'whse_w' ? 'whse_d' : 'whse_w'), fired = window.__hire('driver', id); uw.crew.find(fired).status = 'gone'; window.__crew = { enf, other, fired }; return { enf: uw.compounds.why(id, { crewId: enf }), other: uw.compounds.why(id, { crewId: other }), fired: uw.compounds.why(id, { crewId: fired }) }; }, id);
  await ev(id => { const g = window.game; g.uw.compounds.events.length = 0; window.__m = g.uw.compounds.walkIn(id, window.__crew.other); }, id);
  const outsider = await watch(id, 260);
  const outsiderIn = await ev(id => { const m = window.__m; return { inside: window.__lot(id, m.x, m.z), arrived: window.game.uw.compounds.events.some(e => e.kind === 'walkin') }; }, id);
  await ev(id => { const g = window.game, gs = g.uw.gangs; for (const w of g.uw.compounds.walkers || []) gs.removeGroup(w.gr); g.uw.compounds.walkers = []; window.__m = g.uw.compounds.walkIn(id, window.__crew.enf); }, id);
  const insider = await watch(id, 520);
  const insiderIn = await ev(id => ({ arrived: window.game.uw.compounds.events.some(e => e.kind === 'walkin' && e.crew === window.__crew.enf) }), id);
  check(`${id}: crew who work here are let in and walk through to the door`, crew.enf === '' && insider.gate === 1 && insiderIn.arrived, JSON.stringify({ crew, insider, insiderIn }));
  check(`${id}: crew from another warehouse, and a fired crew member, are refused and stay outside`, crew.other === 'works somewhere else' && crew.fired === 'not working for you' && outsider.gate === 0 && !outsiderIn.inside && !outsiderIn.arrived, JSON.stringify({ crew, outsider, outsiderIn }));

  // a Driver's van comes back with a delivery, docks, reverses out and leaves
  await ev(id => { const g = window.game, uw = g.uw; window.__away(id); uw.compounds.R[id].contacts = []; const drv = window.__hire('driver', id); window.__V = uw.compounds.spawnVan(id, 'arrive', { crew: drv, to: id, run: 1 }); window.__h0 = window.__V.v.health; }, id);
  const van = await watch(id, 30);
  for (let k = 0; k < 120; k++) { await frames(page, 10); if (await ev(() => window.__V.phase === 'unload')) break; }
  const vin = await ev(id => { const V = window.__V, v = V.v, b = window.game.world.compounds[id].docks[V.dock].bay; return { phase: V.phase, bay: +Math.hypot(v.pos.x - b.x, v.pos.z - b.z).toFixed(2), dock: +window.game.world.compounds[id].dockDoors[V.dock].open.toFixed(2) }; }, id);
  await frames(page, 40);
  const dockOpen = await ev(id => +window.game.world.compounds[id].dockDoors[window.__V.dock].open.toFixed(2), id);
  await ev(() => { window.__V.t = 99; });
  for (let k = 0; k < 160; k++) { await frames(page, 10); if (await ev(() => window.__V.phase === 'gone' || !window.game.vehicles.list.includes(window.__V.v))) break; }
  const vout = await ev(id => { const g = window.game, V = window.__V, v = V.v, R = g.uw.compounds.R[id]; return { phase: V.phase, outside: !window.__lot(id, v.pos.x, v.pos.z), stalls: V.stalls, hurt: window.__h0 - v.health, contacts: (R.contacts || []).length, gate: +R.gate.open.toFixed(2) }; }, id);
  check(`${id}: a Driver's van is let in, drives to its dock (the dock door opens for it), backs out and leaves through the gate`, vin.phase === 'unload' && vin.bay < 1.2 && dockOpen > 0.9 && vout.phase === 'gone' && vout.outside, JSON.stringify({ van, vin, dockOpen, vout }));
  check(`${id}: …without touching the fence, the gate, the wedge or a post (no contacts, no damage, never stuck)`, vout.contacts === 0 && vout.hurt === 0 && vout.stalls === 0, JSON.stringify(vout));

  // a vehicle with a delivery for this warehouse (and nobody of yours at the wheel) is let in; an expired one isn't
  const del = async (until) => {
    await clearCars();
    await ev(([id, until]) => { const g = window.game, C = g.world.compounds[id], lane = C.lanes.in[0], a = lane[0], b2 = lane[1]; window.__away(id); const v = g.vehicles.spawn('van', a.x, a.z, Math.atan2(b2.x - a.x, b2.z - a.z), { driver: 'npc', color: 0x5a3a2a }); v.touched = true; v.mission = 'test'; v.wh = { id, to: id, until: g.time + until }; v.drive = new window.__pv.LaneDriver(v, g, lane, { speed: 6 }); window.__dv = v; }, [id, until]);
    const w = await watch(id, 420);
    const r = await ev(id => { const v = window.__dv, b = window.game.world.compounds[id].docks[0].bay; const o = { inside: window.__lot(id, v.pos.x, v.pos.z), bay: +Math.hypot(v.pos.x - b.x, v.pos.z - b.z).toFixed(1) }; window.game.vehicles.despawn(v); return o; }, id);
    return { ...w, ...r };
  };
  const ok = await del(120), late = await del(-1);
  check(`${id}: a vehicle carrying a delivery for this warehouse is let in and reaches the dock; an expired delivery is not`, ok.gate === 1 && ok.inside && ok.bay < 1.5 && late.gate === 0 && !late.inside, JSON.stringify({ ok, late }));
}

// rival gangsters on foot and in a car, and ordinary traffic, at the Maximum Security gate and at a basic one
for (const [id, T] of [['whse_w', 4], ['whse_d', 1]]) {
  await clearCars();
  await ev(([id, T]) => {
    const g = window.game, uw = g.uw, C = g.world.compounds[id], gs = uw.gangs;
    window.__T(id, T);
    // you stand in the yard by the door; a hostile crew turns up at the gate looking for you
    g.resetPlayerState(C.door.x + Math.sin(C.door.h) * 1.5, C.door.z + Math.cos(C.door.h) * 1.5, 0);
    const fid = window.__pv.FACTIONS ? Object.keys(window.__pv.FACTIONS)[0] : 'vipers';
    const at = { x: C.gate.x - C.gate.n[0] * 8, z: C.gate.z - C.gate.n[1] * 8, h: Math.atan2(C.gate.n[0], C.gate.n[1]) };
    const gr = gs.spawnGroup('raidTest', 'raid', fid, at, 4, {}); gr.hostile = true;
    for (const m of gr.members) { m.gun = false; m.bat = true; }
    window.__rg = gr; window.__rgN = gr.members.length; window.__rgM = gr.members.slice();
    // their car and an ordinary car both drive straight at the gate along the delivery lane
    const lane = C.lanes.in[1], a = lane[0], b2 = lane[1];
    const mk = (dx, fac) => { const v = g.vehicles.spawn('sedan', a.x - C.gate.n[0] * dx, a.z - C.gate.n[1] * dx, Math.atan2(b2.x - a.x, b2.z - a.z), { driver: 'npc' }); v.touched = true; v.mission = 'test'; if (fac) v.fac = fac; v.drive = new window.__pv.LaneDriver(v, g, lane, { speed: 4 }); return v; };
    window.__rc = mk(0, fid); window.__tc = mk(12, null);
  }, [id, T]);
  const w = await watch(id, 600);
  const r = await ev(id => { const g = window.game, gr = window.__rg, out = { members: window.__rgN, inside: window.__rgM.filter(m => window.__lot(id, m.x, m.z)).length, rival: window.__lot(id, window.__rc.pos.x, window.__rc.pos.z), traffic: window.__lot(id, window.__tc.pos.x, window.__tc.pos.z), why: [g.uw.compounds.why(id, gr.members[0]), g.uw.compounds.why(id, window.__rc)] }; g.uw.gangs.removeGroup(gr); g.vehicles.despawn(window.__rc); g.vehicles.despawn(window.__tc); return out; }, id);
  check(`${id} at security ${T + 1}: the gate stays shut for a hostile rival crew, their car and ordinary traffic, and none of them gets into the yard`, w.gate === 0 && r.members > 0 && r.inside === 0 && !r.rival && !r.traffic && r.why.every(x => x === 'no business here'), JSON.stringify({ w, r }));
}

// ---------------------------------------------------------------- 5. the player's own car: in through the gate, to a dock, back out
for (const id of IDS) {
  await ev(id => {
    const g = window.game, C = g.world.compounds[id], PV = window.__pv;
    window.__T(id, 4); g.uw.compounds.R[id].contacts = [];
    const lane = C.lanes.in[0], a = lane[0], b2 = lane[1];
    g.resetPlayerState(a.x + 3, a.z, 0);
    const v = g.vehicles.spawn('pickup', a.x, a.z, Math.atan2(b2.x - a.x, b2.z - a.z), { parked: true }); v.touched = true; g.completeEnter(v);
    window.__pc = v; window.__pilot = new PV.LaneDriver(v, g, lane, { speed: 6 });
  }, id);
  for (let k = 0; k < 120; k++) { await frames(page, 10); if (await ev(() => window.__pilot.done)) break; }
  const pin = await ev(id => { const g = window.game, v = window.__pc, b = g.world.compounds[id].docks[0].bay; return { done: window.__pilot.done, bay: +Math.hypot(v.pos.x - b.x, v.pos.z - b.z).toFixed(2), stalls: window.__pilot.stalls }; }, id);
  // the loading bay: stopped at the dock, the prompt opens the warehouse with the trunk in reach; its door opens
  await frames(page, 50);
  const bay = await ev(id => {
    const g = window.game, uw = g.uw, v = window.__pc, PV = window.__pv;
    const a = uw.findAction(), dock = +g.world.compounds[id].dockDoors[0].open.toFixed(2);
    v.trunk = {}; PV.Inv.add(v.trunk, 'green', 5, 100);
    const st0 = PV.Inv.has(uw.S.storage[id] || {}, 'green');
    if (a) a.act();
    const svc = g.ui.stack.length > 0;
    uw.ui.propAct(id, 'st:green:-1');
    const out = { label: a && a.label, dock, svc, moved: PV.Inv.has(uw.S.storage[id], 'green') - st0, trunk: PV.Inv.has(v.trunk, 'green') };
    while (g.ui.stack.length) g.ui.back();
    return out;
  }, id);
  check(`${id}: you drive your own car in through the gate to a dock`, pin.done && pin.bay < 1.2 && pin.stalls === 0, JSON.stringify(pin));
  check(`${id}: the loading bay works: its door opens for you, and the prompt moves the trunk's cargo into the warehouse`, /Loading bay/.test(bay.label || '') && bay.dock > 0.9 && bay.svc && bay.moved === 5 && bay.trunk === 0, JSON.stringify(bay));
  await ev(id => { const g = window.game, C = g.world.compounds[id]; window.__pilot = new window.__pv.LaneDriver(window.__pc, g, C.lanes.out[0], { speed: 6 }); }, id);
  for (let k = 0; k < 160; k++) { await frames(page, 10); if (await ev(() => window.__pilot.done)) break; }
  const pout = await ev(id => { const g = window.game, v = window.__pc, R = g.uw.compounds.R[id]; const o = { done: window.__pilot.done, outside: !window.__lot(id, v.pos.x, v.pos.z), stalls: window.__pilot.stalls, contacts: (R.contacts || []).length }; window.__pilot = null; g.exitVehicle(true); g.vehicles.despawn(v); return o; }, id);
  check(`${id}: …and back out and away through the gate, without touching anything of the compound`, pout.done && pout.outside && pout.stalls === 0 && pout.contacts === 0, JSON.stringify(pout));
  // a car of nobody's in the other bay doesn't open that dock
  const stranger = await ev(id => { const g = window.game, C = g.world.compounds[id], b = C.docks[1].bay; const v = g.vehicles.spawn('sedan', b.x, b.z, b.h, { parked: true }); v.touched = true; window.__sv = v; return true; }, id);
  await frames(page, 60);
  const sd = await ev(id => { const g = window.game, o = +g.world.compounds[id].dockDoors[1].open.toFixed(2); g.vehicles.despawn(window.__sv); return o; }, id);
  check(`${id}: a stranger's car in the loading bay doesn't open the dock`, stranger && sd === 0, String(sd));
}

// ---------------------------------------------------------------- 6. inside: every room, door, stair and interaction point reachable, at every tier
const insideRes = [];
for (const id of IDS) {
  for (const T of [0, 1, 2, 3, 4, { vault: 4, surveillance: 0 }, { vault: 0, surveillance: 4 }, { vault: 2, surveillance: 3 }]) {
    await ev(([id, T]) => { const g = window.game, C = g.world.compounds[id]; window.__T(id, T); g.resetPlayerState(C.door.x, C.door.z, C.door.h); }, [id, T]);
    await frames(page, 4);
    const door = await ev(() => { const a = window.game.uw.findAction(); return a && a.label; });
    await ev(id => window.game.uw.compounds.enter(id), id);
    await page.waitForFunction(() => window.game.player.interior && !window.game.fading, null, { timeout: 30000 });
    const r = await ev(() => window.__inside());
    insideRes.push({ id, T, door, ...r, bad: r.spots.filter(s => !s.ok).map(s => s.id) });
    await ev(() => window.game.content.interiors.exit(true));
    await frames(page, 2);
  }
}
check('the warehouse door leads inside ("Enter …") at every tier', insideRes.every(r => /^Enter /.test(r.door || '')), JSON.stringify(insideRes.map(r => r.door)));
check('inside, at every tier of both warehouses: the exit, the mezzanine (up the stair) and every interaction point behind every door are reachable on foot', insideRes.every(r => r.exit && r.deck && r.bad.length === 0 && r.spots.length >= 3), JSON.stringify(insideRes.map(r => ({ id: r.id, T: r.T, exit: r.exit, deck: r.deck, n: r.spots.length, bad: r.bad, cells: r.cells }))));
const rooms = insideRes.filter(r => r.T === 4).map(r => r.spots.map(s => s.id).sort().join());
check('a Maximum Security interior has the vault, product vault, armory, ready room, office, command room and storage', rooms.every(s => ['w:vault', 'w:pvault', 'w:armory', 'w:ready', 'w:office', 'w:monitor', 'w:storage'].every(k => s.includes(k))), JSON.stringify(rooms));
// an interaction point opens the right part of the warehouse screen; an upgrade bought inside rebuilds the rooms around you
const spotRes = await ev(async () => {
  const g = window.game, uw = g.uw, C = g.world.compounds.whse_w;
  window.__T('whse_w', { vault: 2, surveillance: 2 }); g.resetPlayerState(C.door.x, C.door.z, C.door.h);
  uw.compounds.enter('whse_w'); await new Promise(r => { const t = setInterval(() => { if (g.player.interior && !g.fading) { clearInterval(t); r(); } }, 50); });
  g.content.spotAct('w:vault'); const tab = uw.ui.whTab, open = g.ui.stack.length > 0; while (g.ui.stack.length) g.ui.back();
  const before = g.content.interiors.cur.spots.map(s => s.id).join();
  g.money.W.clean = 1e9; const e = uw.whse.upgrade('whse_w', 'vault');
  const after = g.content.interiors.cur.spots.map(s => s.id).join(), still = !!g.player.interior;
  g.content.interiors.exit(true);
  return { tab, open, e, before, after, still };
});
check('inside: the vault point opens the Dirty Cash tab; buying the next vault tier rebuilds the rooms around you (an armory appears)', spotRes.tab === 'cash' && spotRes.open && spotRes.e === '' && !/armory/.test(spotRes.before) && /armory/.test(spotRes.after) && spotRes.still, JSON.stringify(spotRes));

// ---------------------------------------------------------------- 7. Maximum Security's geometry backs its claims; lower tiers don't inherit them
const geo = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  for (const id of ['whse_w', 'whse_d']) {
    window.__away(id);
    const o = out[id] = {};
    const closed = (T) => { window.__T(id, T); const R = uw.compounds.R[id]; if (R.gate) { R.gate.open = 0; R.gate.col.on = true; } if (R.wedge) { R.wedge.down = 0; R.wedge.col.on = true; } return window.__fill(id); };
    o.fill = { max: closed(4), l4: closed(3), l3: closed(2), l2: closed(1), open: closed(0), noGate: closed({ perimeter: 4, access: 0 }), noFence: closed({ perimeter: 0, access: 4 }) };
    o.cov = [0, 1, 2, 3, 4].map(T => { window.__T(id, T); const d = uw.compounds.coverage(id, 0), n = uw.compounds.coverage(id, 1); return [+d.frac.toFixed(3), +n.frac.toFixed(3)]; });
  }
  return out;
});
for (const id of IDS) {
  const f = geo[id].fill;
  check(`${id}: with the gate shut the perimeter is closed at every level from 2 up (nobody on foot reaches the yard)`, f.max === 0 && f.l4 === 0 && f.l3 === 0 && f.l2 === 0, JSON.stringify(f));
  check(`${id}: an open lot is open, a fence with no gate has a hole, a gate with no fence is walked round`, f.open > 100 && f.noGate > 100 && f.noFence > 100, JSON.stringify(f));
  const cv = geo[id].cov;
  check(`${id}: Maximum Security cameras cover the whole yard and the gate approach by day and by night`, cv[4][0] === 1 && cv[4][1] === 1, JSON.stringify(cv));
  check(`${id}: below Maximum Security the cameras leave gaps (more of them at night), and coverage grows with every tier`, cv.slice(0, 4).every(c => c[0] < 1 && c[1] < 1 && c[1] <= c[0]) && cv.every((c, i) => i === 0 || c[0] > cv[i - 1][0]), JSON.stringify(cv));
}
// ramming: a car driven hard at the gate (and at the fence away from the gate)
const ram = async (id, T, target, speed) => {
  await clearCars();
  await ev(([id, T, target, speed]) => {
    const g = window.game, C = g.world.compounds[id], R = g.uw.compounds.R[id];
    window.__T(id, T); window.__away(id);
    let tx, tz, nx, nz;
    if (target === 'gate') { tx = C.gate.x; tz = C.gate.z; nx = C.gate.n[0]; nz = C.gate.n[1]; }
    else {
      // the longest stretch of fence facing traffic that a car has a clear 9 m run at
      const grid = g.world.grid, res = {}, O = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
      const segs = C.perim.filter(s => C.front.includes(s.side)).sort((a, b) => (b.a1 - b.a0) - (a.a1 - a.a0));
      for (const seg of segs) { const o = O[seg.side], am = (seg.a0 + seg.a1) / 2, x = seg.side === 'n' || seg.side === 's' ? am : seg.e, z = seg.side === 'n' || seg.side === 's' ? seg.e : am; if (grid.resolveCircle(x + o[0] * 9, z + o[1] * 9, 1.4, 0.4, 1.6, res).hit) continue; tx = x; tz = z; nx = -o[0]; nz = -o[1]; break; }
    }
    const sx = tx - nx * 9, sz = tz - nz * 9, h = Math.atan2(nx, nz);
    const v = g.vehicles.spawn('pickup', sx, sz, h, { driver: 'npc' }); v.touched = true; v.mission = 'test'; v.health = 1e6;
    v.vel.set(Math.sin(h) * speed, Math.cos(h) * speed); const thr = speed > 6 ? 1 : 0; v.drive = { update() { v.ctl.throttle = thr; v.ctl.steer = 0; v.ctl.handbrake = false; } };
    window.__rv = v; window.__rt = { tx, tz, nx, nz };
  }, [id, T, target, speed]);
  await frames(page, 60);
  return ev(([id, target]) => { const g = window.game, R = g.uw.compounds.R[id], v = window.__rv, t = window.__rt; const past = (v.pos.x - t.tx) * t.nx + (v.pos.z - t.tz) * t.nz; const o = { broke: target === 'gate' ? !!(R.gate && R.gate.state === 'broken') : R.panels.some(p => p.state === 'broken'), past: +past.toFixed(1) }; g.vehicles.despawn(v); g.money.W.clean = 1e9; g.uw.compounds.repairNow(id); return o; }, [id, target]);
};
for (const id of IDS) {
  const g1 = await ram(id, { perimeter: 4, access: 1 }, 'gate', 16), g2 = await ram(id, { perimeter: 4, access: 2 }, 'gate', 16), g3 = await ram(id, { perimeter: 4, access: 3 }, 'gate', 22), g4 = await ram(id, 4, 'gate', 22), slow = await ram(id, { perimeter: 4, access: 1 }, 'gate', 4);
  check(`${id}: a basic or motorised gate breaks when a car hits it hard (and holds against a slow push); a reinforced or massive gate holds at any speed`, g1.broke && g1.past > 0 && g2.broke && !g3.broke && g3.past < 0 && !g4.broke && g4.past < 0 && !slow.broke && slow.past < 0, JSON.stringify({ g1, g2, g3, g4, slow }));
  const f1 = await ram(id, { perimeter: 1, access: 4 }, 'fence', 16), f3 = await ram(id, { perimeter: 3, access: 4 }, 'fence', 22), f4 = await ram(id, 4, 'fence', 22);
  check(`${id}: a chain-link fence gives way to a car; behind anti-ram barriers (and at Maximum Security) the line holds`, f1.broke && f1.past > 0 && !f3.broke && f3.past < 0 && !f4.broke && f4.past < 0, JSON.stringify({ f1, f3, f4 }));
}
// the wedge: even with the gate leaf held open (a tailgater), a car nobody admitted is stopped
await clearCars();
const wedge = await ev(() => {
  const g = window.game, id = 'whse_w', C = g.world.compounds[id], R = g.uw.compounds.R[id];
  window.__T(id, 4); window.__away(id);
  const lane = C.lanes.in[0], a = lane[0], b2 = lane[1];
  const v = g.vehicles.spawn('sedan', a.x, a.z, Math.atan2(b2.x - a.x, b2.z - a.z), { driver: 'npc' }); v.touched = true; v.mission = 'test';
  v.drive = new window.__pv.LaneDriver(v, g, lane, { speed: 5 }); window.__wv = v;
  window.__hold = setInterval(() => { R.gate.open = 1; }, 5);
  return true;
});
await frames(page, 300);
const wedgeRes = await ev(() => { clearInterval(window.__hold); const g = window.game, C = g.world.compounds.whse_w, v = window.__wv, past = (v.pos.x - C.gate.x) * C.gate.n[0] + (v.pos.z - C.gate.z) * C.gate.n[1]; const o = { past: +past.toFixed(1), wedge: g.uw.compounds.R.whse_w.wedge.down }; g.vehicles.despawn(v); return o; });
check('Maximum Security: with the gate held open for someone else, the wedge still stops a car nobody admitted', wedge && wedgeRes.past < 3.2 && wedgeRes.wedge === 0, JSON.stringify(wedgeRes));
const imm = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  window.__T('whse_w', 4); const enf = uw.whse.crewAt('whse_w', 'enforcer').length;
  for (let k = enf; k < 4; k++) window.__hire('enforcer', 'whse_w'); if (!uw.whse.crewAt('whse_w', 'lieutenant').length) window.__hire('lieutenant', 'whse_w');
  out.max = uw.whse.immune('whse_w');
  out.lower = [0, 1, 2, 3].map(T => { window.__T('whse_w', T); return uw.whse.immune('whse_w'); });
  window.__T('whse_w', { perimeter: 4, surveillance: 4, access: 4, vault: 3 }); out.oneShort = uw.whse.immune('whse_w');
  return out;
});
check('raid immunity is Maximum Security only: one category short of it, or any lower level, and it is gone', imm.max && imm.lower.every(x => !x) && !imm.oneShort, JSON.stringify(imm));

// ---------------------------------------------------------------- 8. guards, cameras and the alarm
const guards = await ev(() => {
  const g = window.game, uw = g.uw, C = g.world.compounds.whse_w;
  window.__T('whse_w', 4);
  g.resetPlayerState(C.door.x, C.door.z + Math.cos(C.door.h) * 2, 0); return true;
});
await frames(page, 90);
const gr = await ev(() => { const g = window.game, uw = g.uw, gr = uw.gangs.groups.get('wh:whse_w'); return gr ? { n: gr.members.length, enf: uw.whse.crewAt('whse_w', 'enforcer').length, posts: uw.compounds.R.whse_w.posts.length, posted: gr.members.every(m => window.__lot('whse_w', m.x, m.z)), crew: gr.members.every(m => uw.compounds.allows('whse_w', m)) } : null; });
check('Enforcers who work at a warehouse stand guard at their posts in the yard while you are near', guards && gr && gr.n === Math.min(gr.enf, gr.posts) && gr.n >= 4 && gr.posted && gr.crew, JSON.stringify(gr));
const alarm = await ev(() => {
  const g = window.game, uw = g.uw, C = g.world.compounds.whse_w, gs = uw.gangs;
  uw.compounds.events.length = 0; uw.compounds.alarmT = {};
  const fid = Object.keys(window.__pv.FACTIONS)[0];
  const gr = gs.spawnGroup('raidCam', 'raid', fid, { x: C.center.x - 8, z: C.gate.z + C.gate.n[1] * 8 + C.gate.n[0] * 0, h: 0 }, 1, {}); window.__cg = gr;
  return gr.members.length;
});
await frames(page, 40);
const alarmRes = await ev(() => { const g = window.game, uw = g.uw, o = { intruders: uw.compounds.events.filter(e => e.kind === 'intruder').length }; uw.gangs.removeGroup(window.__cg); return o; });
check('a stranger inside the fence is caught on camera and raises the alarm', alarm > 0 && alarmRes.intruders > 0, JSON.stringify(alarmRes));

// ---------------------------------------------------------------- 9. mobile budget
const perf = await ev(() => {
  const g = window.game, uw = g.uw, C = g.world.compounds.whse_w;
  window.__T('whse_w', 4); window.__T('whse_d', 4);
  g.resetPlayerState(C.gate.x - C.gate.n[0] * 18, C.gate.z - C.gate.n[1] * 18, 0);
  for (let k = 0; k < 30; k++) g.update(1 / 60, 1 / 60);
  const t0 = performance.now(); for (let k = 0; k < 600; k++) uw.compounds.update(1 / 60); const upd = (performance.now() - t0) / 600;
  const R = uw.compounds.R.whse_w, cam = g.camera; cam.position.set(C.gate.x - C.gate.n[0] * 30 + 10, 14, C.gate.z - C.gate.n[1] * 30 + 10); cam.lookAt(C.center.x, 0, C.center.z); cam.updateMatrixWorld();
  const info = g.renderer.info; info.autoReset = false;
  const draw = vis => { for (const id in uw.compounds.R) { const r = uw.compounds.R[id]; for (const grp of [r.group, r.gateGrp, r.wedgeGrp]) if (grp) grp.visible = vis; } info.reset(); g.renderer.render(g.scene, cam); return { calls: info.render.calls, tris: info.render.triangles }; };
  const on = draw(true), off = draw(false); draw(true); info.autoReset = true;
  let tris = 0; R.group.traverse(o => { if (o.geometry) tris += o.geometry.index.count / 3; });
  return { upd: +upd.toFixed(3), calls: on.calls - off.calls, tris: on.tris - off.tris, meshTris: tris, boxes: R.boxes };
});
check('mobile budget: a Maximum Security compound costs ≤ 0.35 ms of update a frame, ≤ 8 draw calls and ≤ 40k triangles', perf.upd <= 0.35 && perf.calls <= 8 && perf.tris <= 40000, JSON.stringify(perf));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'compound');
