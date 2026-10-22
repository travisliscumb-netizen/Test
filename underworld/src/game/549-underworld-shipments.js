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
   Out of sight a rival's load still runs its route (§8, DC-34 ruling): who
   holds each stretch sets the risk (own low, neutral moderate, rival or
   enemy high, a turf at war very high; police separately), with the dice
   saved on the record. Nothing disappears silently: a disruption is a
   delay, an interception (the cargo is now the other gang's), a van left
   stranded on the street (an opportunity, saved, until they recover it)
   or a police seizure, each logged.
   Imports run on the economic clock (S.econH, §45.9): the day-length
   setting doesn't change how long they take or wait in real time.
   ===================================================================== */
// hours are world-clock hours, except imports' lead and wait (economic hours); the physical van's times are seconds
const SHIP_T = { near: 380, supplyLead: [2, 8], importLead: [8, 16], importWait: 24, dock: 12, stray: 260, drive: 600, hold: 1, delay: [2, 5], strand: 6 };
// police risk on a rival's route, separate from who holds the streets: a base, the gang's heat, a crackdown, patrols
const SHIP_POLICE = { base: 0.004, heat: 1 / 2000, crackdown: 0.03, patrol: 1 / 3000 };
// your imports: Territory Holder and up, one at a time, about half the supplier's wholesale price, a load a Driver
// (or you, in a van or box truck) has to bring in
const IMPORT = { rank: 4, lots: { green: 240, pills: 180, snow: 120 }, price: 0.55, seize: 0.08, vehicles: ['van', 'truck'], lead: 'Pier' };
const SHIP_KINDS = ['supply', 'boat', 'import'];
const SHIP_STATES = ['due', 'rolling', 'landed', 'stranded', 'done'];
const SHIP_ENDS = ['delivered', 'stolen', 'seized', 'lost', 'expired', 'collected', 'intercepted', 'delayed', 'stranded', 'recovered'];
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
      // the route dice are saved with it (a reload never rerolls them)
      s.roll = num(r.roll, Math.random(), 0, 1); s.roll2 = num(r.roll2, Math.random(), 0, 1);
      if (r.kind === 'import') { s.until = num(r.until, s.at + SHIP_T.importWait, 0, 1e8); if (r.clk === 'e') s.clk = 'e'; if (!PROP_BY_ID[s.to] || PROP_BY_ID[s.to].kind !== 'warehouse') s.to = ''; }
      else if (!RIVAL_WH[fid]) continue;
      if (s.state === 'stranded') { s.pos = pt(r.pos); s.until = num(r.until, 0, 0, 1e8); if (!s.pos) s.state = 'due'; }
      if (s.kind === 'import' && s.state === 'stranded') continue;
      out.list.push(s);
    }
    out.list = out.list.slice(0, 24);
    out.next = Math.max(Math.floor(num(o.next, 1, 1, 1e7)), ...out.list.map(r => r.id + 1), 1);
    out.log = (Array.isArray(o.log) ? o.log : []).filter(e => e && typeof e === 'object' && SHIP_ENDS.includes(e.end) && SHIP_KINDS.includes(e.kind)).slice(-12)
      .map(e => ({ id: Math.floor(num(e.id, 0, 0, 1e7)), kind: e.kind, fid: typeof e.fid === 'string' ? e.fid : '', end: e.end, n: Math.floor(num(e.n, 0, 0, 1e6)), day: Math.floor(num(e.day, 0, 0, 1e6)), by: typeof e.by === 'string' ? e.by : '' }));
    return out;
  }
  // a save from before Session 4B kept one Tidewater boat in save.uw.shipment: it becomes a boat record
  static migrate(S) {
    const sh = S.shipment; delete S.shipment;
    if (!sh || typeof sh !== 'object' || sh.done || !isFinite(sh.at) || !isFinite(sh.x) || !isFinite(sh.z) || !sh.cargo) return;
    const cargo = {}; for (const k in sh.cargo) if (GOODS[k] && sh.cargo[k] > 0) cargo[k] = Math.floor(sh.cargo[k]);
    if (!units(cargo)) return;
    S.ships.list.push({ id: S.ships.next++, kind: 'boat', fid: 'tidewater', cargo, state: 'due', at: +sh.at, from: { x: +sh.x, z: +sh.z }, to: 'rival:tidewater', n0: units(cargo), paid: 0, roll: Math.random(), roll2: Math.random() });
  }
  get D() { const S = this.S; if (!S.ships) S.ships = ShipmentSystem.fresh(); return S.ships; }
  list() { return this.D.list; }
  find(id) { return this.D.list.find(r => r.id === id) || null; }
  absHour() { return this.S.day * 24 + Math.floor(this.g.env ? this.g.env.time : 0) % 24; }
  add(r) { r.id = this.D.next++; r.n0 = units(r.cargo); r.roll = Math.random(); r.roll2 = Math.random(); this.D.list.push(r); return r; }
  // the economic clock (§45.9) and the world hour it corresponds to now, for imports' times on the Feed and screens
  econ() { return this.S.econH; }
  worldHourOf(e) { return this.absHour() + Math.round((e - this.econ()) / Math.max(0.05, this.uw.econRate())); }
  // hours left on the world clock until economic time e
  hoursTo(e) { return Math.max(0, Math.ceil((e - this.econ()) / Math.max(0.05, this.uw.econRate()))); }
  // a line in the log for something that happened to a load that goes on (part intercepted, a delay)
  note(r, end, n, by) { const D = this.D; D.log.push({ id: r.id, kind: r.kind, fid: r.fid, end, n, day: this.S.day, by: by || '' }); if (D.log.length > 12) D.log.splice(0, D.log.length - 12); }
  // the record is finished: it leaves the list and the log keeps one line about it
  finish(r, end, keepLive) {
    const D = this.D, i = D.list.indexOf(r); if (i >= 0) D.list.splice(i, 1);
    r.state = 'done'; r.end = end;
    this.note(r, end, r.n0);
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
    const uw = this.uw, L = this.importPoint(), paid = this.importPrice(k), at = this.econ() + randi(SHIP_T.importLead[0], SHIP_T.importLead[1]);
    Money.pay(paid, 'importOrder');
    const cargo = {}; Inv.add(cargo, k, IMPORT.lots[k], paid);
    const r = this.add({ kind: 'import', fid: 'pc', cargo, state: 'due', at, until: at + SHIP_T.importWait, clk: 'e', from: { x: L.x, z: L.z }, to: '', paid });
    uw.opps.add({ kind: 'shipment', title: 'Your import is at sea', text: `${goodsList(cargo)} lands at ${L.name} in about ${this.hoursTo(at)} hours. Send a Driver for it, or bring a van or box truck. The port holds it for a day.`, x: L.x, z: L.z, until: this.worldHourOf(at + SHIP_T.importWait) });
    this.g.autosave('Import ordered');
    return '';
  }
  // landed and waiting at the dock: the record's cargo is the pile on the quay
  importAt(id) { const r = this.find(id); return r && r.kind === 'import' && r.state === 'landed' ? r : null; }
  // ---------------------------------------------------------------- the hourly clock
  tickHours() {
    const now = this.absHour(), e = this.econ();
    for (const r of this.D.list.slice()) {
      const t = r.kind === 'import' ? e : now;
      if (r.state === 'due' && t >= r.at) this.due(r);
      else if (r.state === 'landed' && r.kind === 'import' && t >= r.until) this.expire(r);
      else if (r.state === 'stranded' && now >= r.until) this.recover(r);
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
    this.travel(r, r.from);
  }
  // ---------------------------------------------------------------- the route, out of your sight
  // who holds a stretch, from the shipping gang's side (§8 tiers, as for your Drivers): its own turf, a coalition
  // partner's (friendly), nobody's (neutral), another gang's or yours (rival), or a turf at war (hostile)
  stretch(fid, i) {
    const S = this.S, own = this.uw.owner[i];
    if (S.turfs[i].war) return 'hostile';
    if (own === fid) return 'own';
    if (!own || (own !== 'pc' && (!FACTIONS[own] || S.factions[own].broken))) return 'neutral';
    if (own !== 'pc' && S.flags.coalition) return 'friendly';
    return 'rival';
  }
  // the route's stretches (start, middle, end) with their risk, and the police risk on it
  routeRisk(fid, A, B) {
    const S = this.S, f = S.factions[fid], pts = [A, { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, B];
    const legs = pts.map(q => { const i = turfAt(q.x, q.z); const k = this.stretch(fid, i); return { i, k, x: q.x, z: q.z, p: ROUTE_RISK[k] }; });
    const patrol = legs.reduce((a, l) => a + S.turfs[l.i].police, 0) / legs.length;
    const police = SHIP_POLICE.base + f.heat * SHIP_POLICE.heat + (S.crackdown > 0 ? SHIP_POLICE.crackdown : 0) + patrol * SHIP_POLICE.patrol;
    return { legs, rival: legs.reduce((a, l) => a + l.p, 0), police };
  }
  // a load on the road out of your sight, from P to their warehouse: the saved dice against the route
  travel(r, P) {
    const B = this.dest(r); if (!B) { this.arrive(r); return; }
    const R = this.routeRisk(r.fid, P, B);
    if (r.roll < R.police) { this.seize(r); return; }
    if (r.roll < R.police + R.rival) {
      // which stretch it went wrong on, by its share of the risk
      let q = r.roll2 * R.rival, leg = R.legs[R.legs.length - 1];
      for (const l of R.legs) { q -= l.p; if (q <= 0) { leg = l; break; } }
      this.disrupt(r, leg);
      return;
    }
    this.arrive(r);
  }
  // fresh dice for the next attempt (after a delay or a recovery)
  reroll(r) { r.roll = Math.random(); r.roll2 = Math.random(); }
  // second-level draws from the saved dice (which stretch used roll2; this keeps the rest independent of that)
  draw(r) { return (r.roll2 * 977.13) % 1; }
  disrupt(r, leg) {
    const uw = this.uw, S = this.S, own = uw.owner[leg.i], war = S.turfs[leg.i].war, F = FACTIONS[r.fid], tname = uw.T[leg.i].name;
    // who was on that stretch: the gang that holds it, or the other side of a war there
    let by = own && own !== r.fid ? own : null;
    if (war) { const other = war.a === r.fid ? war.d : war.d === r.fid ? war.a : (own === r.fid ? null : own); by = other || by; }
    if (by && by !== 'pc' && FACTIONS[by] && !S.factions[by].broken) { this.intercept(r, by, tname); return; }
    if (by === 'pc' || leg.k === 'hostile' || (leg.k === 'neutral' && this.draw(r) < 0.5)) { this.strand(r, leg, tname); return; }
    // their own ground, or nobody's: it just took longer
    r.at = this.absHour() + randi(SHIP_T.delay[0], SHIP_T.delay[1]); this.reroll(r);
    this.note(r, 'delayed', units(r.cargo));
    uw.news('unknown', `Word on the street: a ${F.short} delivery got held up around ${tname}.`);
  }
  // another gang took (some of) it: that part is their stock now; what they left goes on
  intercept(r, by, tname) {
    const uw = this.uw, S = this.S, share = 0.35 + 0.65 * this.draw(r), took = {};
    for (const k of GOOD_IDS) { const n = Inv.has(r.cargo, k); if (!n) continue; const t = Math.max(1, Math.round(n * share)); Inv.remove(r.cargo, k, t); took[k] = t; }
    const n = units(took);
    S.factions[by].stock += n;
    this.note(r, 'intercepted', n, by);
    uw.news('unknown', `The ${FACTIONS[by].short} jumped a ${FACTIONS[r.fid].short} delivery on ${tname} and took ${goodsList(took)}.`);
    if (units(r.cargo)) this.arrive(r); else this.finish(r, 'intercepted');
  }
  // the van is stuck on the street (a breakdown, a scare, a fight nearby): a saved opportunity until they fetch it
  strand(r, leg, tname) {
    const uw = this.uw, c = curbNear(leg.x, leg.z);
    r.state = 'stranded'; r.pos = { x: c.x, z: c.z }; r.until = this.absHour() + SHIP_T.strand;
    this.note(r, 'stranded', units(r.cargo));
    uw.opps.add({ kind: 'shipment', title: `${FACTIONS[r.fid].short} van stranded`, text: `A ${FACTIONS[r.fid].short} delivery van is stuck on ${tname} with ${goodsList(r.cargo)} in the back. They’ll send people for it within ${SHIP_T.strand} hours.`, x: c.x, z: c.z, until: r.until, urgent: true });
  }
  // their people fetched a stranded van: it finishes its trip (from where it stood, on fresh dice)
  recover(r) {
    const L = this.live.get(r.id), p = this.g.player;
    // not while you are standing over it
    if (L && this.g.vehicles.list.includes(L.van) && Math.hypot(L.van.pos.x - p.pos.x, L.van.pos.z - p.pos.z) < 120) { r.until += 1; return; }
    this.dropStranded(r);
    const P = r.pos; r.state = 'due'; delete r.pos; this.reroll(r);
    this.note(r, 'recovered', units(r.cargo));
    this.travel(r, P);
  }
  seize(r) {
    const uw = this.uw, f = this.S.factions[r.fid];
    uw.news('radio', `Police radio: a van stopped at a checkpoint, ${goodsList(r.cargo)} in the back. ${FACTIONS[r.fid].short} colours on the driver.`);
    f.heat = clamp(f.heat + 5, 0, 100);
    Inv.clear(r.cargo); this.finish(r, 'seized');
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
    r.state = 'landed'; r.until = this.econ() + SHIP_T.importWait;
    this.buildCrate(r);
    uw.opps.add({ kind: 'shipment', title: 'Your import has landed', text: `${goodsList(r.cargo)} is on the quay at ${this.importPoint().name} for about ${this.hoursTo(r.until)} hours. A Driver can bring it in (Empire → Drivers), or load it into a van or box truck yourself.`, x: L.x, z: L.z, until: this.worldHourOf(r.until), urgent: true });
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
  // a stranded van near you is a real, parked, unlocked van with the record's cargo in it
  updateStranded() {
    const g = this.g, p = g.player; if (this.S.jail || p.interior) return;
    for (const r of this.D.list) {
      if (r.state !== 'stranded' || this.live.has(r.id)) continue;
      if (Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z) > SHIP_T.near) continue;
      const c = curbNear(r.pos.x, r.pos.z);
      const van = g.vehicles.spawn('van', c.x, c.z, c.h, { parked: true, color: 0x2a2e33 });
      if (!van) continue;
      van.mission = 'shipment'; van.touched = true; van.fac = r.fid; van.trunk = r.cargo; van.locked = false; van.health = 120;
      const gr = { key: 'ship' + r.id, kind: 'convoy', fid: r.fid, x: c.x, z: c.z, members: [], hostile: false, cars: [van], van };
      van.uwGroup = gr.key; this.uw.gangs.groups.set(gr.key, gr);
      this.live.set(r.id, { r, van, gr, t: 0, V: null, after: 0, parked: true });
    }
  }
  // the parked van leaves the world (out of range, or recovered); the cargo stays in the record
  dropStranded(r) {
    const L = this.live.get(r.id); if (!L) return;
    const g = this.g;
    this.dropLive(r);
    if (g.vehicles.list.includes(L.van) && L.van !== g.player.vehicle) g.vehicles.despawn(L.van);
  }
  dropLive(r) {
    const L = this.live.get(r.id); if (!L) return;
    this.live.delete(r.id);
    if (this.uw.gangs.groups.get(L.gr.key) === L.gr) this.uw.gangs.removeGroup(L.gr);
  }
  // per frame: each van on the road
  update(dt) {
    if (!(dt > 0)) return;
    this.updateStranded();
    if (!this.live.size) return;
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
      const dp = Math.hypot(van.pos.x - p.pos.x, van.pos.z - p.pos.z);
      if (L.parked) {
        // a stranded van waits where it is; out of range it leaves the world and the record keeps the load
        if (!g.vehicles.list.includes(van) || dp > SHIP_T.near + 40) this.dropStranded(r);
        continue;
      }
      // out of your sight (despawned without a wreck, or far and unseen): the rest of its trip runs its route
      if (!g.vehicles.list.includes(van) || (dp > SHIP_T.stray && !g.inView(van.pos.x, 1, van.pos.z, 3))) { this.awayLive(r, L); continue; }
      if (L.t > SHIP_T.drive) { this.arriveLive(r, L); continue; }
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
  // the van went out of your sight on the road: the rest of the trip, from where it is, runs out of sight
  awayLive(r, L) {
    const van = L.van, g = this.g, P = g.vehicles.list.includes(van) ? { x: van.pos.x, z: van.pos.z } : r.from;
    this.dropLive(r);
    if (g.vehicles.list.includes(van)) g.vehicles.despawn(van);
    r.state = 'due';
    this.travel(r, P);
  }
  // the van got there: the cargo goes on the shelves; the van itself drives off as an ordinary van
  arriveLive(r, L) {
    const van = L.van;
    this.arrive(r);
    // still their van (their gate must let it back out): empty now
    if (this.g.vehicles.list.includes(van)) { van.trunk = {}; if (!L.V) { if (!this.g.inView(van.pos.x, 1, van.pos.z, 3)) this.g.vehicles.despawn(van); } }
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
      // an import saved before imports ran on the economic clock: its times move onto it
      if (r.kind === 'import' && r.clk !== 'e') { const rate = this.uw.econRate(), now = this.absHour(); r.at = this.econ() + (r.at - now) * rate; r.until = this.econ() + (r.until - now) * rate; r.clk = 'e'; }
      if (r.state === 'rolling') this.arrive(r);
      else if (r.state === 'landed') this.buildCrate(r);
    }
  }
  // the Opportunities/feed view: what is on its way, for the player's own imports and what they've heard of
  summary() {
    return this.D.list.map(r => ({ id: r.id, kind: r.kind, fid: r.fid, state: r.state, at: r.at, until: r.until || 0, pos: r.pos || null, goods: goodsList(r.cargo), n: units(r.cargo) }));
  }
}
