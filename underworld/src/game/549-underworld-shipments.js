/* =====================================================================
   [UNDERWORLD] SHIPMENTS (§8, §45.27; Session 4B): every load of product
   that travels the city as one record (save.uw.ships), from the moment it
   leaves until it is delivered, stolen, seized, lost or expired.
   - Rival resupply: a gang's daily restock leaves its street stock and is
     on the road to its warehouse as cargo in the record. With you near
     either end it is a real van you can follow and take; otherwise it
     simply arrives. Only an arrival puts it on their shelves.
   - The Tidewater boat: lands at the piers; its cargo goes to their
     warehouse by van, with an escort. Port surveillance can seize it.
   - Imports (yours, rank-gated, §3/§8): a bulk order paid up front that
     lands at the docks and waits there a day. It becomes warehouse stock
     only once a Driver brings it in (a delivery run from the dock) or you
     load it into a van or box truck and unload it at a warehouse.
   One cargo, one place: while a van is on the road its trunk IS the
   record's cargo object, so a save mid-drive holds exactly what the van
   holds, and a reload resolves the drive once (it arrived), never twice.
   Taking the van moves the load out of the record into the van for good.
   ===================================================================== */
const SHIP_T = { near: 380, supplyLead: [2, 8], importLead: [8, 16], importWait: 24, dock: 12, stray: 260, drive: 600, hold: 1 };
// your imports: Territory Holder and up, one at a time, about half the supplier's wholesale price, a load a Driver
// (or you, in a van or box truck) has to bring in
const IMPORT = { rank: 4, lots: { green: 240, pills: 180, snow: 120 }, price: 0.55, seize: 0.08, vehicles: ['van', 'truck'], lead: 'Pier' };
const SHIP_KINDS = ['supply', 'boat', 'import'];
const SHIP_STATES = ['due', 'rolling', 'landed', 'done'];
const SHIP_ENDS = ['delivered', 'stolen', 'seized', 'lost', 'expired', 'collected'];
class ShipmentSystem {
  constructor(uw) { this.uw = uw; this.live = new Map(); this.crates = new Map(); }
  get S() { return this.uw.S; }
  get g() { return this.uw.g; }
  static fresh() { return { list: [], next: 1, log: [] }; }
  static sanitize(o, num) {
    const out = ShipmentSystem.fresh();
    if (!o || typeof o !== 'object') return out;
    const pt = p => p && typeof p === 'object' && isFinite(p.x) && isFinite(p.z) ? { x: +p.x, z: +p.z } : null;
    for (const r of Array.isArray(o.list) ? o.list : []) {
      if (!r || typeof r !== 'object' || !SHIP_KINDS.includes(r.kind) || !SHIP_STATES.includes(r.state) || r.state === 'done') continue;
      const fid = r.kind === 'import' ? 'pc' : FACTIONS[r.fid] ? r.fid : null; if (!fid) continue;
      const from = pt(r.from); if (!from) continue;
      const cargo = Inv.clean(r.cargo, num); if (!units(cargo)) continue;
      const s = { id: Math.floor(num(r.id, 0, 1, 1e7)), kind: r.kind, fid, cargo, state: r.state, at: num(r.at, 0, 0, 1e8), from, to: typeof r.to === 'string' ? r.to : '', n0: Math.floor(num(r.n0, units(cargo), 0, 1e6)), paid: Math.round(num(r.paid, 0, 0, 1e9)) };
      if (r.kind === 'import') { s.until = num(r.until, s.at + SHIP_T.importWait, 0, 1e8); if (!PROP_BY_ID[s.to] || PROP_BY_ID[s.to].kind !== 'warehouse') s.to = ''; }
      else if (!RIVAL_WH[fid]) continue;
      out.list.push(s);
    }
    out.list = out.list.slice(0, 24);
    out.next = Math.max(Math.floor(num(o.next, 1, 1, 1e7)), ...out.list.map(r => r.id + 1), 1);
    out.log = (Array.isArray(o.log) ? o.log : []).filter(e => e && typeof e === 'object' && SHIP_ENDS.includes(e.end) && SHIP_KINDS.includes(e.kind)).slice(-12)
      .map(e => ({ id: Math.floor(num(e.id, 0, 0, 1e7)), kind: e.kind, fid: typeof e.fid === 'string' ? e.fid : '', end: e.end, n: Math.floor(num(e.n, 0, 0, 1e6)), day: Math.floor(num(e.day, 0, 0, 1e6)) }));
    return out;
  }
  // a save from before Session 4B kept one Tidewater boat in save.uw.shipment: it becomes a boat record
  static migrate(S) {
    const sh = S.shipment; delete S.shipment;
    if (!sh || typeof sh !== 'object' || sh.done || !isFinite(sh.at) || !isFinite(sh.x) || !isFinite(sh.z) || !sh.cargo) return;
    const cargo = {}; for (const k in sh.cargo) if (GOODS[k] && sh.cargo[k] > 0) cargo[k] = Math.floor(sh.cargo[k]);
    if (!units(cargo)) return;
    S.ships.list.push({ id: S.ships.next++, kind: 'boat', fid: 'tidewater', cargo, state: 'due', at: +sh.at, from: { x: +sh.x, z: +sh.z }, to: 'rival:tidewater', n0: units(cargo), paid: 0 });
  }
  get D() { const S = this.S; if (!S.ships) S.ships = ShipmentSystem.fresh(); return S.ships; }
  list() { return this.D.list; }
  find(id) { return this.D.list.find(r => r.id === id) || null; }
  absHour() { return this.S.day * 24 + Math.floor(this.g.env ? this.g.env.time : 0) % 24; }
  add(r) { r.id = this.D.next++; r.n0 = units(r.cargo); this.D.list.push(r); return r; }
  // the record is finished: it leaves the list and the log keeps one line about it
  finish(r, end, keepLive) {
    const D = this.D, i = D.list.indexOf(r); if (i >= 0) D.list.splice(i, 1);
    r.state = 'done'; r.end = end;
    D.log.push({ id: r.id, kind: r.kind, fid: r.fid, end, n: r.n0, day: this.S.day }); if (D.log.length > 12) D.log.splice(0, D.log.length - 12);
    if (!keepLive) this.dropLive(r);
    this.dropCrate(r);
  }
  // ---------------------------------------------------------------- scheduling
  // a gang's restock (RivalWarehouses.tickDay): the cargo has left their street stock and is on its way
  rivalDelivery(fid, cargo) {
    const hq = this.uw.loc('hq', fid); if (!hq || !RIVAL_WH[fid] || this.D.list.some(r => r.kind === 'supply' && r.fid === fid)) return false;
    const r = this.add({ kind: 'supply', fid, cargo: Inv.clone(cargo), state: 'due', at: this.absHour() + randi(SHIP_T.supplyLead[0], SHIP_T.supplyLead[1]), from: { x: hq.x, z: hq.z }, to: 'rival:' + fid, paid: 0 });
    if (this.S.factions[fid].rel < 0) {
      const C = this.uw.rivalwh.C(fid);
      this.uw.opps.add({ kind: 'shipment', title: `${FACTIONS[fid].short} restocking`, text: `A ${FACTIONS[fid].short} van runs ${goodsList(r.cargo)} from their HQ to ${RIVAL_WH[fid].name} around ${String(r.at % 24).padStart(2, '0')}:00. Be near either end and you can take it.`, x: C.center.x, z: C.center.z, until: r.at + 2 });
    }
    return true;
  }
  // Tidewater's boat (FactionAI.tickDay): it lands near a pier tomorrow evening
  scheduleBoat() {
    const uw = this.uw;
    if (this.D.list.some(r => r.kind === 'boat')) return null;
    const t = pick(uw.T.filter(q => q.zone === 'h'));
    const at = (this.S.day + 1) * 24 + randi(19, 23);
    const r = this.add({ kind: 'boat', fid: 'tidewater', cargo: { snow: randi(14, 28), hardware: randi(3, 8), smokes: randi(20, 40) }, state: 'due', at, from: { x: t.hang.x, z: t.hang.z }, to: 'rival:tidewater', paid: 0 });
    uw.opps.add({ kind: 'shipment', title: 'Tidewater boat due', text: `A Tidewater boat lands near ${t.name} tomorrow around ${String(at % 24).padStart(2, '0')}:00. The cargo goes to their warehouse by van. Steal the van and the load is yours — they will not forget it.`, x: t.hang.x, z: t.hang.z, until: at + 3, turf: t.i });
    return r;
  }
  // ---------------------------------------------------------------- your imports
  // where your imports come ashore: the pier nearest your bonded shed on the docks
  importPoint() {
    if (this._ip) return this._ip;
    const L = this.uw.loc('prop', 'whse_d'), hs = this.uw.T.filter(q => q.zone === 'h');
    let best = hs[0];
    if (L) for (const t of hs) if (dist2(t.hang.x, t.hang.z, L.x, L.z) < dist2(best.hang.x, best.hang.z, L.x, L.z)) best = t;
    const c = curbNear(best.hang.x, best.hang.z);
    return (this._ip = { x: c.x, z: c.z, h: c.h, name: best.name });
  }
  importOpen() { return this.D.list.find(r => r.kind === 'import') || null; }
  importPrice(k) { const L = this.importPoint(); return Math.round(this.uw.market.wholesale(zoneKey(L.x, L.z), k) * IMPORT.price * IMPORT.lots[k]); }
  // why you can't order one right now ('' when you can)
  importBlock(k) {
    const uw = this.uw;
    if (uw.rank < IMPORT.rank) return `Imports open at ${RANKS[IMPORT.rank].name}.`;
    if (!IMPORT.lots[k]) return 'Nobody ships that by the boatload.';
    if (!uw.whse.list().length) return 'You need a warehouse to bring it into.';
    if (this.importOpen()) return 'You already have an import on its way.';
    if (this.S.jail) return 'Not from a cell.';
    if (Money.payrollReserve() < this.importPrice(k)) return `It costs ${fmtMoney(this.importPrice(k))} in Dirty Cash up front, from a vault first.`;
    return '';
  }
  orderImport(k) {
    const why = this.importBlock(k); if (why) return why;
    const uw = this.uw, L = this.importPoint(), paid = this.importPrice(k), at = this.absHour() + randi(SHIP_T.importLead[0], SHIP_T.importLead[1]);
    Money.pay(paid, 'importOrder');
    const cargo = {}; Inv.add(cargo, k, IMPORT.lots[k], paid);
    const r = this.add({ kind: 'import', fid: 'pc', cargo, state: 'due', at, until: at + SHIP_T.importWait, from: { x: L.x, z: L.z }, to: '', paid });
    uw.opps.add({ kind: 'shipment', title: 'Your import is at sea', text: `${goodsList(cargo)} lands at ${L.name} around ${String(at % 24).padStart(2, '0')}:00 (day ${Math.floor(at / 24) + 1}). Send a Driver for it, or bring a van or box truck. The port holds it for a day.`, x: L.x, z: L.z, until: at + SHIP_T.importWait });
    this.g.autosave('Import ordered');
    return '';
  }
  // landed and waiting at the dock: the record's cargo is the pile on the quay
  importAt(id) { const r = this.find(id); return r && r.kind === 'import' && r.state === 'landed' ? r : null; }
  // ---------------------------------------------------------------- the hourly clock
  tickHours() {
    const now = this.absHour();
    for (const r of this.D.list.slice()) {
      if (r.state === 'due' && now >= r.at) this.due(r);
      else if (r.state === 'landed' && r.kind === 'import' && now >= r.until) this.expire(r);
    }
  }
  // the player can see this happen: near either end, out on the street, not in a cell
  watching(r) {
    const g = this.g, p = g.player; if (this.S.jail || p.interior) return false;
    const A = r.from, B = this.dest(r);
    return dist2(p.pos.x, p.pos.z, A.x, A.z) < SHIP_T.near * SHIP_T.near || (B && dist2(p.pos.x, p.pos.z, B.x, B.z) < SHIP_T.near * SHIP_T.near);
  }
  dest(r) { if (r.to.startsWith('rival:')) { const C = this.uw.rivalwh.C(r.fid); return C ? { x: C.gate.x, z: C.gate.z } : null; } return null; }
  due(r) {
    const S = this.S, uw = this.uw, f = S.factions[r.fid];
    if (r.kind === 'import') { this.land(r); return; }
    if (f.broken) { this.finish(r, 'lost'); return; }
    if (r.kind === 'boat') {
      // port surveillance can seize the boat before it unloads
      const seizeP = 0.12 + (S.crackdown > 0 ? 0.2 : 0) + f.heat / 400;
      if (Math.random() < seizeP) {
        uw.news('radio', 'Police radio: harbour unit has a vessel stopped at the piers. Customs are on the way.');
        for (const k in r.cargo) if (GOODS[k]) uw.market.shock(Object.keys(DEMAND), k, 0.3);
        f.money *= 0.9; f.heat = clamp(f.heat + 10, 0, 100);
        uw.opps.add({ kind: 'scarcity', title: 'Port seizure', text: 'Customs took a whole Tidewater boat. Snow and hardware are scarce city-wide for days.', good: 'snow', hours: 48 });
        this.finish(r, 'seized'); return;
      }
    }
    // a warehouse being raided takes no deliveries: the van waits an hour
    const w = uw.rivalwh.st(r.fid);
    if (w.raid) { r.at += SHIP_T.hold; return; }
    if (this.watching(r) && this.roll(r)) return;
    this.arrive(r);
  }
  // it got there: on their shelves as far as the warehouse holds, the rest to their street stock
  arrive(r) {
    const uw = this.uw, w = uw.rivalwh.st(r.fid), f = this.S.factions[r.fid];
    let room = Math.max(0, RIVAL_WH[r.fid].cap - units(w.stock));
    const shelf = {};
    for (const k of GOOD_IDS) { const n = Inv.has(r.cargo, k); if (!n) continue; const put = Math.min(n, Math.floor(room / GOODS[k].size)); if (put > 0) { shelf[k] = put; room -= put * GOODS[k].size; } }
    uw.rivalwh.delivered(r.fid, shelf);
    for (const k in shelf) Inv.remove(r.cargo, k, shelf[k]);
    f.stock += units(r.cargo);
    Inv.clear(r.cargo);
    w.resupplied = this.S.day;
    this.finish(r, 'delivered');
  }
  // ---------------------------------------------------------------- your import at the dock
  land(r) {
    const uw = this.uw, S = this.S, L = r.from;
    if (Math.random() < IMPORT.seize + (S.crackdown > 0 ? 0.12 : 0) + (S.taskforce > 0 ? 0.08 : 0)) {
      uw.news('radio', `Police radio: customs are opening a container at ${this.importPoint().name}.`);
      uw.opps.add({ kind: 'shipment', title: 'Import seized', text: `Customs opened your container. ${goodsList(r.cargo)} gone, and the ${fmtMoney(r.paid)} with it.`, x: L.x, z: L.z, hours: 12 });
      S.pressure = clamp(S.pressure + 4, 0, 100);
      Inv.clear(r.cargo); this.finish(r, 'seized'); return;
    }
    r.state = 'landed'; r.until = this.absHour() + SHIP_T.importWait;
    this.buildCrate(r);
    uw.opps.add({ kind: 'shipment', title: 'Your import has landed', text: `${goodsList(r.cargo)} is on the quay at ${this.importPoint().name} until ${String(r.until % 24).padStart(2, '0')}:00 tomorrow. A Driver can bring it in (Empire → Drivers), or load it into a van or box truck yourself.`, x: L.x, z: L.z, until: r.until, urgent: true });
  }
  expire(r) {
    this.uw.opps.add({ kind: 'shipment', title: 'Import impounded', text: `Nobody came for it. The port impounded ${goodsList(r.cargo)}.`, x: r.from.x, z: r.from.z, hours: 12 });
    Inv.clear(r.cargo); this.finish(r, 'expired');
  }
  // a Driver's run took (part of) it: an empty pile is finished
  taken(r) { if (!units(r.cargo)) this.finish(r, 'collected'); }
  // you, in a van or box truck beside the pile: what fits goes into the trunk (cost basis with it)
  loadImport(r, v) {
    const uw = this.uw, g = this.g;
    if (!IMPORT.vehicles.includes(v.type)) { g.ui.toast('A load this size needs a van or a box truck.', 'warn'); return 0; }
    if (!v.trunk) v.trunk = {};
    let moved = 0;
    for (const k of GOOD_IDS) { const n = Inv.has(r.cargo, k); if (!n) continue; const put = Math.min(n, uw.trunkFit(v, k)); if (put > 0) { Inv.add(v.trunk, k, put, Inv.remove(r.cargo, k, put)); moved += put; } }
    if (!moved) { g.ui.toast('No room left in the back.', 'warn'); return 0; }
    g.audio.play('confirm');
    g.ui.toast(units(r.cargo) ? `Loaded ${moved} lots. The rest is still on the quay.` : 'Loaded. Take it to a warehouse loading bay.', 'money');
    this.taken(r);
    if (r.state === 'landed') this.buildCrate(r);
    g.autosave('Import loaded');
    return moved;
  }
  findAction() {
    const g = this.g, p = g.player;
    if (p.interior) return null;
    for (const r of this.D.list) {
      if (r.kind !== 'import' || r.state !== 'landed') continue;
      if (dist2(p.pos.x, p.pos.z, r.from.x, r.from.z) > 9 * 9) continue;
      if (p.state === 'vehicle') { const v = p.vehicle; if (v.speed > 2) return null; return { label: `Load your import · ${goodsList(r.cargo)}`, act: () => this.loadImport(r, v) }; }
      if (p.state === 'foot') return { label: `Your import · ${goodsList(r.cargo)}`, act: () => g.ui.toast('Too much to carry. Bring a van or a box truck, or send a Driver.', 'warn') };
    }
    return null;
  }
  // a stack of crates on the quay while it waits (drawn from the record: fewer lots, fewer crates)
  buildCrate(r) {
    this.dropCrate(r);
    const g = this.g; if (!g.scene || r.state !== 'landed') return;
    const k = new CompoundKit(), P = r.from, n = clamp(Math.ceil(units(r.cargo) / 30), 1, 8), h = this.importPoint().h || 0;
    for (let i = 0; i < n; i++) { const lx = (i % 4) * 1.3 - 1.95, lz = Math.floor(i / 4) * 1.3; k.box(P.x + lx * Math.cos(h) + lz * Math.sin(h), groundY(P.x, P.z), P.z - lx * Math.sin(h) + lz * Math.cos(h), 1.2, 1.1, 1.2, 0x6a5a3a, h); }
    const grp = k.build(); g.scene.add(grp); this.crates.set(r.id, grp);
  }
  dropCrate(r) {
    const grp = this.crates.get(r.id); if (!grp) return;
    this.g.scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.crates.delete(r.id);
  }
  // ---------------------------------------------------------------- the van on the road
  // a physical van (and, for the boat, an escort) carrying the record's own cargo object
  roll(r) {
    const g = this.g, uw = this.uw, C = uw.rivalwh.C(r.fid); if (!C) return false;
    const c = curbNear(r.from.x, r.from.z);
    const van = g.vehicles.spawn('van', c.x, c.z, c.h, { driver: 'npc', color: r.kind === 'boat' ? 0x1a3d4a : 0x2a2e33 });
    if (!van) return false;
    van.mission = 'shipment'; van.touched = true; van.fac = r.fid; van.trunk = r.cargo; van.health = r.kind === 'boat' ? 140 : 120;
    const lane = C.lanes.in[0][0];
    van.drive = new DriveAI(van, g, 'cruise'); van.drive.cruise = 11; van.drive.setGoal(lane.x, lane.z);
    const cars = [van];
    if (r.kind === 'boat') {
      const back = { x: c.x - Math.sin(c.h) * 10, z: c.z - Math.cos(c.h) * 10 };
      const esc = g.vehicles.spawn('suv', back.x, back.z, c.h, { driver: 'npc', color: 0x1a2a3a });
      if (esc) { esc.mission = 'shipment'; esc.touched = true; esc.fac = r.fid; esc.drive = new DriveAI(esc, g, 'cruise'); esc.drive.cruise = 12; esc.drive.target = () => ({ x: van.pos.x, z: van.pos.z, speed: 12 }); cars.push(esc); }
    }
    const gr = { key: 'ship' + r.id, kind: 'convoy', fid: r.fid, x: c.x, z: c.z, members: [], hostile: false, cars, van };
    for (const v of cars) v.uwGroup = gr.key;
    uw.gangs.groups.set(gr.key, gr);
    r.state = 'rolling';
    this.live.set(r.id, { r, van, gr, t: 0, V: null, after: 0 });
    uw.opps.add({ kind: 'shipment', title: r.kind === 'boat' ? 'Tidewater van rolling' : `${FACTIONS[r.fid].short} van rolling`, text: `${r.kind === 'boat' ? 'The boat is unloaded and the van is heading for their warehouse with an escort.' : `A ${FACTIONS[r.fid].short} van is taking ${goodsList(r.cargo)} to ${RIVAL_WH[r.fid].name}.`} This is your window.`, x: c.x, z: c.z, hours: 2, urgent: true });
    g.ui.toast(r.kind === 'boat' ? 'The Tidewater van is on the move.' : `A ${FACTIONS[r.fid].short} van is on the move.`, 'radio');
    return true;
  }
  dropLive(r) {
    const L = this.live.get(r.id); if (!L) return;
    this.live.delete(r.id);
    if (this.uw.gangs.groups.get(L.gr.key) === L.gr) this.uw.gangs.removeGroup(L.gr);
  }
  // per frame: each van on the road
  update(dt) {
    if (!(dt > 0) || !this.live.size) return;
    const g = this.g, p = g.player, uw = this.uw;
    for (const L of [...this.live.values()]) {
      const { r, van } = L;
      if (r.state === 'done') {
        // after a theft the escort keeps after you a while, then it's an ordinary car again
        if ((L.after += dt) > 120 || !L.gr.cars.some(v => g.vehicles.list.includes(v) && v !== van && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 200)) { this.live.delete(r.id); if (uw.gangs.groups.get(L.gr.key) === L.gr) uw.gangs.removeGroup(L.gr); }
        continue;
      }
      L.t += dt;
      if (van === p.vehicle) { this.stolen(r, L); continue; }
      // wrecked on the way: the load is lost with it
      if (van.burnt || van.health <= 0) { if (Math.hypot(van.pos.x - p.pos.x, van.pos.z - p.pos.z) < 80) uw.threats.press(r.fid, PRESSURE.ship, 'wrecked their delivery'); Inv.clear(r.cargo); this.finish(r, 'lost'); continue; }
      // gone without a wreck (despawned out of your sight), or out of your sight for long: it got there
      const dp = Math.hypot(van.pos.x - p.pos.x, van.pos.z - p.pos.z);
      if (!g.vehicles.list.includes(van) || (dp > SHIP_T.stray && !g.inView(van.pos.x, 1, van.pos.z, 3)) || L.t > SHIP_T.drive) { this.arriveLive(r, L); continue; }
      const id = uw.rivalwh.id(r.fid), C = uw.rivalwh.C(r.fid);
      if (!L.V) {
        // at their gate: the compound's own lane takes it onto a dock
        if (C.lanes.in.some(ln => Math.hypot(van.pos.x - ln[0].x, van.pos.z - ln[0].z) < SHIP_T.dock)) {
          const V = uw.compounds.spawnVan(id, 'arrive', { v: van });
          // the compound drives it from here (its lane, then off as traffic): it is no longer the convoy's car
          if (V) { V.v.locked = false; V.v.mission = 'whrun'; V.v.wh = null; V.v.uwGroup = null; L.gr.cars = L.gr.cars.filter(v => v !== van); const hq = uw.loc('hq', r.fid); V.goal = { x: hq.x, z: hq.z }; L.V = V; }
          else this.arriveLive(r, L); // every dock busy: it unloads at the gate
        }
      } else if (L.V.phase === 'unload' || L.V.phase === 'out' || L.V.phase === 'gone') this.arriveLive(r, L);
    }
  }
  // the van got there: the cargo goes on the shelves; the van itself drives off as an ordinary van
  arriveLive(r, L) {
    const van = L.van;
    this.arrive(r);
    if (this.g.vehicles.list.includes(van)) { van.trunk = {}; van.fac = null; if (!L.V) { if (!this.g.inView(van.pos.x, 1, van.pos.z, 3)) this.g.vehicles.despawn(van); } }
  }
  stolen(r, L) {
    const g = this.g, uw = this.uw, van = L.van, f = this.S.factions[r.fid], boat = r.kind === 'boat';
    // the load leaves the record for the van: one place for it from now on
    r.cargo = {};
    van.fac = null; van.mission = null; van.uwGroup = null;
    L.gr.cars = L.gr.cars.filter(v => v !== van);
    this.finish(r, 'stolen', true); // the escort's chase stays live a while
    uw.threats.press(r.fid, PRESSURE.ship, boat ? 'their shipment stolen' : 'took their delivery van');
    f.rel = Math.max(-100, f.rel - (boat ? 45 : 25));
    uw.gangs.provoke(r.fid, GANG_AGGRO.ship, van.pos.x, van.pos.z);
    g.ui.banner('Shipment Stolen', goodsList(van.trunk), 'pass', 3); uw.addRep(boat ? 80 : 40, null);
    if (boat) uw.news('unknown', 'Holm: “You took something of mine. I will be taking something of yours.”');
    g.police.crime('carjack', van.pos.x, van.pos.z);
    // the escort comes after you
    const p = g.player;
    for (const esc of L.gr.cars) if (g.vehicles.list.includes(esc) && esc.drive) { esc.drive.mode = 'pursue'; esc.drive.cruise = 26; esc.drive.target = () => ({ x: p.pos.x, z: p.pos.z, speed: 26, direct: dist2(esc.pos.x, esc.pos.z, p.pos.x, p.pos.z) < 30 * 30 }); esc.drive.targetRef = van; }
  }
  // ---------------------------------------------------------------- saves and resets
  // after a load nothing is on the road: a van that was rolling arrived (once); a landed import's pile is redrawn
  reset() {
    for (const id of [...this.crates.keys()]) this.dropCrate({ id });
    this.live.clear(); this._ip = null;
    if (!this.uw.S) return;
    for (const r of this.D.list.slice()) {
      if (r.state === 'rolling') this.arrive(r);
      else if (r.state === 'landed') this.buildCrate(r);
    }
  }
  // the Opportunities/feed view: what is on its way, for the player's own imports and what they've heard of
  summary() {
    return this.D.list.map(r => ({ id: r.id, kind: r.kind, fid: r.fid, state: r.state, at: r.at, until: r.until || 0, goods: goodsList(r.cargo), n: units(r.cargo) }));
  }
}
