/* =====================================================================
   [UNDERWORLD] RIVAL WAREHOUSES (§9, §45.27; Session 4B): each gang keeps
   its product and cash in a physical compound (RIVAL_WH), built by the same
   CompoundSystem as yours, with their own gate, cameras and guards.
   - Their stock is one authoritative saved inventory (save.uw.rivals[fid]).
     The rooms inside are drawn from it; nothing regenerates it. What you take
     is gone until they actually resupply (a delivery that arrives) or until
     they evacuate it (a van that loads it and drives it to their HQ).
   - You loot it through the ordinary transfer screen (the stock is a place
     like any other): from inside the building, or into the trunk of a car in
     their loading bay. The safe's cash takes time to crack.
   - A raid starts when they notice you: their cameras see you in the yard,
     you ram their gate or fence, force their door, or touch the stock. Its
     clock is real active play (like the threat clock) and is saved: about
     4.5 minutes with only the guards on site, then reinforcements, a
     stronger response from 7 minutes, and from 10 minutes an evacuation van
     that loads what is left and drives it away (it can be stopped or
     stolen). Walk away and the raid winds down; the stock stays as it is.
   ===================================================================== */
const RAID_T = { reinforce: 270, strong: 420, stronger: 540, evacuate: 600, away: 90, near: 320, load: 8, loadLot: 18, crack: 15, force: 5 };
class RivalWarehouses {
  constructor(uw) { this.uw = uw; this.squads = new Map(); this.evac = new Map(); this.crack = null; this.force = null; }
  get S() { return this.uw.S; }
  get g() { return this.uw.g; }
  static fresh() {
    const out = {};
    for (const fid in RIVAL_WH) out[fid] = RivalWarehouses.freshOne(fid);
    return out;
  }
  static freshOne(fid) {
    const R = RIVAL_WH[fid], D = FACTIONS[fid], stock = {}, goods = D.goods.filter(k => GOODS[k] && !GOODS[k].fence);
    // most of what the place holds, split over what they sell (sizes counted)
    let room = Math.round(R.cap * 0.7);
    goods.forEach((k, i) => { const share = Math.floor(room / (goods.length - i) / GOODS[k].size); if (share > 0) { stock[k] = share; room -= share * GOODS[k].size; } });
    return { up: { ...R.up }, breach: {}, stock, cash: R.cash, raid: null, evac: {}, alert: 0, resupplied: 0 };
  }
  static sanitize(all, num) {
    const out = RivalWarehouses.fresh();
    if (!all || typeof all !== 'object') return out;
    for (const fid in RIVAL_WH) {
      const w = all[fid]; if (!w || typeof w !== 'object') continue;
      const o = out[fid], R = RIVAL_WH[fid];
      for (const k of WH_CAT_IDS) o.up[k] = Math.floor(num(w.up && w.up[k], R.up[k], 0, 4));
      o.stock = {}; for (const k in (w.stock || {})) if (GOODS[k]) { const n = Math.floor(num(w.stock[k], 0, 0, 1e5)); if (n > 0) o.stock[k] = n; }
      o.evac = {}; for (const k in (w.evac || {})) if (GOODS[k]) { const n = Math.floor(num(w.evac[k], 0, 0, 1e5)); if (n > 0) o.evac[k] = n; }
      o.cash = Math.round(num(w.cash, R.cash, 0, 1e8));
      o.alert = num(w.alert, 0, 0, 1e7); o.resupplied = num(w.resupplied, 0, 0, 1e7);
      o.breach = {}; if (w.breach && typeof w.breach === 'object') for (const k in w.breach) { const b = w.breach[k]; if (b && (b.s === 'broken' || b.s === 'patched') && /^(gate|[nswe]:[\d.-]+:\d+)$/.test(k)) o.breach[k] = { s: b.s, t: num(b.t, 0, 0, 1e9), tier: Math.floor(num(b.tier, 1, 1, 4)) }; }
      o.raid = w.raid && typeof w.raid === 'object' ? { t: num(w.raid.t, 0, 0, 1e5), away: num(w.raid.away, 0, 0, 1e4), evacDone: !!w.raid.evacDone, start: num(w.raid.start, 0, 0, 1e9) } : null;
    }
    return out;
  }
  st(fid) { const S = this.S; if (!S.rivals) S.rivals = RivalWarehouses.fresh(); return S.rivals[fid] || (S.rivals[fid] = RivalWarehouses.freshOne(fid)); }
  id(fid) { return 'rwh_' + fid; }
  C(fid) { return this.g.world.compounds[this.id(fid)]; }
  units(fid) { return units(this.st(fid).stock); }
  // ---------------------------------------------------------------- the daily round (when nobody is raiding them)
  tickDay() {
    const S = this.S, uw = this.uw;
    for (const fid in RIVAL_WH) {
      const f = S.factions[fid], w = this.st(fid);
      if (f.broken || w.raid) continue;
      // their own people mend what was broken, a day later
      for (const k in w.breach) if (S.econH - w.breach[k].t >= 24) delete w.breach[k];
      // a resupply: what the gang can spare from its street stock goes on the road to it (ShipmentSystem: with you
      // near, a van you can see and stop). Only an arrival puts it on the shelves.
      if (S.day < w.alert) continue;
      const need = Math.max(0, RIVAL_WH[fid].cap * 0.8 - this.units(fid));
      const take = Math.min(need, Math.floor(f.stock * 0.5));
      if (take >= 6) {
        const cargo = this.cargoFor(fid, take);
        if (uw.shipments.rivalDelivery(fid, cargo)) f.stock = Math.max(0, f.stock - units(cargo));
      }
      // and some of their money goes back in the safe
      const cashNeed = Math.max(0, RIVAL_WH[fid].cash - w.cash), put = Math.min(cashNeed, Math.floor(f.money * 0.15));
      if (put > 0) { w.cash += put; f.money -= put; }
    }
  }
  // goods for a load of n units of space, in the gang's own product
  cargoFor(fid, n) {
    const goods = FACTIONS[fid].goods.filter(k => GOODS[k] && !GOODS[k].fence), out = {};
    let room = n;
    goods.forEach((k, i) => { const q = Math.floor(room / (goods.length - i) / GOODS[k].size); if (q > 0) { out[k] = q; room -= q * GOODS[k].size; } });
    return out;
  }
  // a delivery that arrived (ShipmentSystem): the cargo goes on the shelves
  delivered(fid, trunk) { const w = this.st(fid); for (const k in trunk) if (GOODS[k] && trunk[k] > 0) Inv.add(w.stock, k, Inv.has(trunk, k), 0); }
  // ---------------------------------------------------------------- raids
  alarm(fid, why) {
    const w = this.st(fid), uw = this.uw;
    if (w.raid || this.S.factions[fid].broken) { if (w.raid) w.raid.away = 0; return; }
    w.raid = { t: 0, away: 0, evacDone: false, start: this.S.econH };
    uw.threats.press(fid, 35, 'raided their warehouse');
    uw.gangs.provoke(fid, GANG_AGGRO.war, this.C(fid).center.x, this.C(fid).center.z);
    const gr = uw.gangs.groups.get('rg:' + fid); if (gr) gr.hostile = true;
    this.g.ui.toast(`⚠ The ${FACTIONS[fid].short} know you’re in their warehouse (${why}).`, 'warn');
    this.uw.g.audio.play('wanted');
    this.uw.g.autosave('Raid');
  }
  // you are at the raid: near their compound on the street, or inside their building
  near(fid, r = RAID_T.near) {
    const p = this.g.player, I = p.interior, C = this.C(fid);
    if (I) return !!(I.def && I.def.rival === fid);
    return Math.hypot(p.pos.x - C.center.x, p.pos.z - C.center.z) < r;
  }
  counting() { const g = this.g; return g.state === 'playing' && !(typeof document !== 'undefined' && document.hidden) && !this.S.jail; }
  // per frame: the raid clock (its own wall time, like the threat clock), guards, squads and the evacuation
  update(step) {
    let rdt = step;
    if (step === undefined) { const now = performance.now(); rdt = this.t0 === undefined ? 0 : (now - this.t0) / 1000; this.t0 = now; if (rdt > 5) rdt = 0; }
    if (!(rdt > 0) || !this.counting()) return;
    for (const fid in RIVAL_WH) {
      const w = this.st(fid);
      this.guards(fid);
      if (!w.raid) continue;
      const R = w.raid;
      if (this.near(fid)) { R.away = 0; R.t += rdt; } else { R.away += rdt; if (R.away > RAID_T.away) { this.endRaid(fid); continue; } }
      // the response, by the clock: guards only, then reinforcements, a stronger response, then evacuation
      if (R.t >= RAID_T.reinforce) this.squad(fid, 1, 3, false);
      if (R.t >= RAID_T.strong) this.squad(fid, 2, 4, true);
      if (R.t >= RAID_T.stronger) this.squad(fid, 3, 4, true);
      if (R.t >= RAID_T.evacuate && !R.evacDone) this.evacuate(fid, rdt);
    }
    this.updateCrack(rdt);
  }
  phase(fid) { const w = this.st(fid); if (!w.raid) return 'none'; const t = w.raid.t; return t >= RAID_T.evacuate ? 'evacuate' : t >= RAID_T.strong ? 'response' : t >= RAID_T.reinforce ? 'reinforce' : 'guards'; }
  endRaid(fid) {
    const w = this.st(fid);
    w.raid = null; w.alert = this.S.day + 1;
    for (const k of [1, 2, 3]) { const gr = this.squads.get(fid + ':' + k); if (gr) { this.uw.gangs.removeGroup(gr); this.squads.delete(fid + ':' + k); } }
    const E = this.evac.get(fid); if (E) this.finishEvac(fid, E, 'stood down');
    this.uw.news('unknown', `The ${FACTIONS[fid].short} are counting what’s left at ${RIVAL_WH[fid].name}. They’ll be watching it.`);
  }
  // their guards while you are near (more when they've been raided lately); hostile once there is a raid on
  guards(fid) {
    const uw = this.uw, gs = uw.gangs, C = this.C(fid), p = this.g.player, key = 'rg:' + fid, w = this.st(fid);
    const near = Math.hypot(p.pos.x - C.center.x, p.pos.z - C.center.z) < 160 && !p.interior;
    let gr = gs.groups.get(key);
    if (!near || this.S.factions[fid].broken) { if (gr && !w.raid) gs.removeGroup(gr); return; }
    if (gr) { if (w.raid) gr.hostile = true; return; }
    const n = clamp(2 + (w.up.access + w.up.perimeter) / 2 + (this.S.day < w.alert ? 2 : 0), 2, 6) | 0;
    gr = gs.spawnGroup(key, 'rguard', fid, { x: C.center.x, z: C.center.z, h: 0 }, n, {});
    if (!gr) return;
    gr.hostile = !!w.raid;
    const posts = uw.compounds.R[this.id(fid)].posts;
    gr.members.forEach((m, i) => { const P = posts[i % Math.max(1, posts.length)] || C.center; m.x = P.x + (i >= posts.length ? 1.5 : 0); m.z = P.z; m.home = { x: m.x, z: m.z, h: P.h || 0 }; m.gun = m.gun || i % 2 === 0; });
  }
  // a squad by car, once per stage of the response (a reload resumes the stage; it doesn't stack another)
  squad(fid, k, n, armed) {
    const key = fid + ':' + k; if (this.squads.has(key)) return;
    const g = this.g, uw = this.uw, C = this.C(fid), G = C.gate;
    const at = g.world.randomCurbSpot(G.x - G.n[0] * 30, G.z - G.n[1] * 30, 25, 60);
    const gr = uw.gangs.spawnGroup('rs:' + key, 'assault', fid, { x: at.x, z: at.z, h: at.h }, n, {});
    if (!gr) return;
    gr.hostile = true; gr.enemy = 'pc';
    for (const m of gr.members) { m.home = { x: G.x + G.n[0] * 4, z: G.z + G.n[1] * 4, h: 0 }; if (armed) m.gun = true; }
    this.squads.set(key, gr);
    g.ui.toast(k === 1 ? `The ${FACTIONS[fid].short} sent reinforcements.` : `More ${FACTIONS[fid].short} are coming, armed.`, 'warn');
  }
  // the evacuation: a van backs onto their dock, loads what is left (in lots, a few seconds each), and drives it
  // to their HQ. What is on the van is no longer on the shelves (w.evac, saved): stop the van, or take it, and the
  // load is yours or lost; let it reach the HQ and it is theirs again.
  evacuate(fid, dt) {
    const w = this.st(fid), g = this.g, uw = this.uw;
    let E = this.evac.get(fid);
    if (!E) {
      const V = uw.compounds.spawnVan(this.id(fid), 'arrive', {});
      if (!V) return;
      V.v.fac = fid; V.v.wh = null; V.v.trunk = w.evac; V.v.mission = 'evac'; V.v.health = 220; V.v.locked = false;
      const hq = uw.loc('hq', fid); V.goal = { x: hq.x, z: hq.z };
      E = { V, t: 0 }; this.evac.set(fid, E);
      g.ui.toast(`The ${FACTIONS[fid].short} are moving their stock out.`, 'warn');
      uw.opps.add({ kind: 'shipment', title: `${FACTIONS[fid].short} evacuating`, text: `A van is loading what’s left at ${RIVAL_WH[fid].name}. Stop it, or take it.`, x: this.C(fid).center.x, z: this.C(fid).center.z, hours: 1, urgent: true });
    }
    const v = E.V.v;
    // wrecked: the load is lost; gone from the world without a wreck (despawned out of your sight): it got there
    if (v.burnt || v.health <= 0) { this.finishEvac(fid, E, 'lost'); return; }
    if (!g.vehicles.list.includes(v)) { this.finishEvac(fid, E, 'arrived'); return; }
    if (v === g.player.vehicle) { this.finishEvac(fid, E, 'stolen'); return; }
    if (E.V.phase === 'unload') {
      // loading, not unloading: lots from the shelves into the van
      E.t += dt; E.V.t = 0;
      if (E.t >= RAID_T.load) {
        E.t = 0;
        const k = Object.keys(w.stock).find(q => w.stock[q] > 0);
        if (k) { const n = Math.min(w.stock[k], Math.max(1, Math.floor(RAID_T.loadLot / GOODS[k].size))); Inv.remove(w.stock, k, n); w.evac[k] = (w.evac[k] || 0) + n; }
        else E.V.t = 99; // empty: off it goes
      }
    }
    if (E.V.phase === 'gone') {
      // out on the street: its run to the HQ (or, out of your sight, it is simply there)
      const hq = uw.loc('hq', fid), d = Math.hypot(v.pos.x - hq.x, v.pos.z - hq.z), dp = Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z);
      if (d < 25 || dp > 260) this.finishEvac(fid, E, 'arrived');
    }
  }
  finishEvac(fid, E, how) {
    const w = this.st(fid), S = this.S, f = S.factions[fid], v = E.V.v;
    this.evac.delete(fid);
    if (how === 'arrived' || how === 'stood down') { f.stock += units(w.evac); w.evac = {}; if (this.g.vehicles.list.includes(v) && v !== this.g.player.vehicle && !this.g.inView(v.pos.x, 1, v.pos.z, 3)) this.g.vehicles.despawn(v); }
    if (how === 'stolen') { v.trunk = { ...w.evac }; w.evac = {}; v.fac = null; v.mission = null; v.drive = null; this.uw.threats.press(fid, 20, 'took their evacuation van'); this.g.ui.banner('Load Taken', goodsList(v.trunk), 'pass', 3); }
    if (how === 'lost') w.evac = {};
    if (w.raid) w.raid.evacDone = true;
    this.uw.g.autosave('Evacuation ' + how);
  }
  // ---------------------------------------------------------------- inside, and the stock as a place
  // where the stock can be reached from: inside their building, or from a car of yours in their loading bay
  reach(fid) {
    const g = this.g, p = g.player, I = p.interior, uw = this.uw;
    if (I && I.def && I.def.rival === fid) return 'inside';
    const v = p.state === 'vehicle' ? p.vehicle : null;
    if (v && uw.compounds.dockAt(v.pos.x, v.pos.z) === this.id(fid) && v.speed < 2) return 'dock';
    return null;
  }
  // locations() hook: the stock, when you can reach it; taking from it is noticed
  location(fid) {
    const w = this.st(fid), here = this.reach(fid);
    return { key: 'rival:' + fid, cls: 'RIVAL', name: `${RIVAL_WH[fid].name} · their stock`, o: w.stock, cap: RIVAL_WH[fid].cap, zone: zoneKey(this.C(fid).center.x, this.C(fid).center.z), here: !!here, rival: fid };
  }
  touched(fid) { this.alarm(fid, 'stock missing'); }
  findAction() {
    const g = this.g, p = g.player, uw = this.uw;
    if (p.state === 'vehicle') { for (const fid in RIVAL_WH) if (this.reach(fid) === 'dock') return { label: `Load from their stock · ${RIVAL_WH[fid].name}`, act: () => uw.ui.openRivalStock(fid) }; return null; }
    if (p.state !== 'foot' || p.interior) return null;
    for (const fid in RIVAL_WH) {
      const C = this.C(fid); if (Math.hypot(p.pos.x - C.door.x, p.pos.z - C.door.z) > 2.4) continue;
      if (this.S.factions[fid].broken) return null;
      if (this.force && this.force.fid === fid) return { label: `Forcing the door… ${Math.ceil(RAID_T.force - this.force.t)} s`, act: () => {} };
      return { label: `Force the door · ${RIVAL_WH[fid].name}`, act: () => { this.force = { fid, t: 0 }; } };
    }
    return null;
  }
  enter(fid) {
    const I = this.g.content.interiors;
    const def = I.addDynamic(rivalInteriorDef(this.C(fid), fid, this.st(fid)));
    return I.enter(def.id);
  }
  spot(s) {
    const I = this.g.content.interiors, fid = I.cur && I.cur.rival; if (!fid) return;
    if (s === 'stock') this.uw.ui.openRivalStock(fid);
    if (s === 'safe') { if (this.crack && this.crack.fid === fid) return; this.crack = { fid, t: 0 }; this.alarm(fid, 'the safe'); this.g.ui.toast('Cracking the safe… stay with it.', 'radio'); }
  }
  updateCrack(dt) {
    const g = this.g, p = g.player;
    if (this.force) {
      const C = this.C(this.force.fid);
      if (Math.hypot(p.pos.x - C.door.x, p.pos.z - C.door.z) > 2.6 || p.interior) this.force = null;
      else if ((this.force.t += dt) >= RAID_T.force) { const fid = this.force.fid; this.force = null; this.alarm(fid, 'the door'); this.enter(fid); }
    }
    if (this.crack) {
      const I = g.content.interiors, def = I.cur, fid = this.crack.fid;
      const sp = def && def.rival === fid && def.spots.find(q => q.id === 'rv:safe');
      if (!sp || Math.hypot(p.pos.x - (def.ox + sp.x), p.pos.z - (def.oz + sp.z)) > sp.r + 0.6) { this.crack = null; return; }
      if ((this.crack.t += dt) >= RAID_T.crack) {
        this.crack = null;
        const w = this.st(fid), n = w.cash; if (n <= 0) { g.ui.toast('Empty.', 'warn'); return; }
        w.cash = 0; Money.earn(n, 'heist'); this.uw.addRep(25, null);
        g.ui.banner('Safe Cracked', fmtMoney(n), 'pass', 3); g.audio.play('cash');
        this.uw.g.autosave('Safe cracked');
      }
    }
  }
  reset() { this.squads.clear(); this.evac.clear(); this.crack = null; this.force = null; this.t0 = undefined; }
}

// the inside of a rival's warehouse: racking filled as far as their stock goes (drawn from it, never the other way
// round), a safe, and the way out
function rivalInteriorDef(C, fid, w) {
  const W = 30, D = 18, H = 7, hw = W / 2, hd = D / 2, full = clamp(units(w.stock) / RIVAL_WH[fid].cap, 0, 1);
  const def = {
    id: 'rv:' + fid, dynamic: true, name: RIVAL_WH[fid].name, w: W, d: D, h: H, seed: 900 + fid.length, rival: fid, place: null,
    at: { x: (C.bld.x0 + C.bld.x1) / 2, z: (C.bld.z0 + C.bld.z1) / 2 }, door: { x: C.door.x, z: C.door.z, h: C.door.h },
    exit: { x: -hw + 2.5, z: hd - 0.7 }, spawnH: Math.PI,
    spots: [{ id: 'rv:stock', x: 0, z: 2.6, r: 1.6, label: 'Their stock · take it' }, { id: 'rv:safe', x: hw - 2, z: -hd + 1.6, r: 1.2, label: w.cash > 0 ? 'The safe · crack it' : 'The safe (empty)' }],
    build(k, rng) {
      k.room(W, D, H, { floor: 0x5a5c5e, wall: 0x6a6258, ceil: 0x2a2c2e, trim: 0x2a2a2a, band: [0, 1.2], bandC: FACTIONS[fid].hex, lights: [4, 2], lightC: 0xf0e8d0 });
      k.door(-hw + 2.5, hd - 0.02, 0, 0x2a2e33, FACTIONS[fid].hex);
      // racks, loaded as far as the stock goes
      const racks = [-10, -6, -2, 2, 6, 10], cells = racks.length * 3 * 4, filled = Math.round(cells * full);
      let c = 0;
      for (const x of racks) {
        k.shelfUnit(x, -3, 1.2, 7, 3.4, 3, () => 1, [0x000000]);
        for (let lv = 0; lv < 3; lv++) for (let j = 0; j < 4; j++) if (c++ < filled) k.box(x, 0.3 + lv * 1.05, -5.6 + j * 1.75, 1.0, 0.7, 1.4, rng() < 0.5 ? 0x7a6a4a : 0x5a6a7a);
      }
      FURN.safe(k, hw - 0.6, 0, -hd + 1.6, 3);
      k.box(hw - 3, 0, -hd + 1, 1.6, 0.8, 0.8, 0x3a3e44, { col: true });
    }
  };
  return def;
}
