/* =====================================================================
   [UNDERWORLD] CREW DELIVERIES: a crew member moves product from one of your
   stashes to another while you get on with something else. The goods leave
   the origin when the run starts and exist only in the run until it ends, so
   a save mid-run (or a reload) can never duplicate or lose them silently:
   every run ends in a report. Success chance comes from the runner (skill
   band 50-90%, loyalty, traits) and the route (your turf, rival turf, police
   pressure, wars, cargo value, size, your influence) - never a bare dice roll.
   Since Session 3 only Drivers make runs (§5), between your places, from a
   supplier ('spot:<id>', bought on the spot with the destination's vault
   cash) and to a dealer's corner ('turf:<i>'). Route risk follows §8: rival
   hijack risk by who holds each stretch, police risk separately.
   ===================================================================== */
const RUNNER_BANDS = [[0, 'ROOKIE', 0.5, 0.6], [35, 'DECENT', 0.6, 0.75], [55, 'EXPERIENCED', 0.75, 0.85], [75, 'ELITE', 0.85, 0.9]];
const RUN_OUTCOMES = { success: 'SUCCESS', partial: 'PARTIAL LOSS', robbed: 'ROBBED', seized: 'POLICE SEIZURE', abandoned: 'ABANDONED CARGO', betrayal: 'BETRAYAL', returned: 'RETURNED' };
class DeliveryManager {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  get g() { return this.uw.g; }
  absHour() { return this.S.day * 24 + Math.floor(this.g.env ? this.g.env.time : 0) % 24; }
  sanitizeRun(r, num) {
    if (!r || typeof r !== 'object' || !GOODS[r.good] || !this.placeOk(r.to) || r.to === 'inv' || this.isSpot(r.to)) return null;
    if (!this.placeOk(r.from) || this.isTurf(r.from)) return null;
    const n = Math.floor(num(r.n, 0, 0, 1e5)); if (!(n > 0)) return null;
    return { id: Math.floor(num(r.id, 0, 0, 1e7)), crew: Math.floor(num(r.crew, 0, 0, 1e7)), from: r.from, to: r.to, good: r.good, n, cost: num(r.cost, 0, 0, 1e9), start: num(r.start, 0, 0, 1e8), eta: num(r.eta, 0, 0, 1e8), chance: num(r.chance, 0.7, 0.05, 0.99), dist: num(r.dist, 200, 0, 5000), name: typeof r.name === 'string' ? r.name : 'Runner' };
  }
  band(c) { let b = RUNNER_BANDS[0]; for (const x of RUNNER_BANDS) if (c.skill >= x[0]) b = x; return b; }
  // places a run can start or end: 'inv' (you), a property id, 'turf:<i>' (a dealer's corner), 'spot:<id>' (a supplier)
  isTurf(id) { return typeof id === 'string' && /^turf:\d+$/.test(id) && +id.slice(5) < this.uw.T.length; }
  isSpot(id) { return typeof id === 'string' && id.startsWith('spot:') && SPOTS.some(s => s.id === id.slice(5) && s.sells && s.sells.length); }
  placeOk(id) { return id === 'inv' || !!PROP_BY_ID[id] || this.isTurf(id) || this.isSpot(id); }
  placeName(id) { return id === 'inv' ? 'your pockets' : this.isTurf(id) ? `the corner on ${this.uw.T[+id.slice(5)].name}` : this.isSpot(id) ? SPOTS.find(s => s.id === id.slice(5)).name : PROP_BY_ID[id] ? PROP_BY_ID[id].name : '?'; }
  locOf(id) {
    if (id === 'inv') { const p = this.g.player; return { x: p.pos.x, z: p.pos.z, name: 'you (pockets)' }; }
    if (this.isTurf(id)) { const t = this.uw.T[+id.slice(5)]; return { x: t.deal.x, z: t.deal.z, name: this.placeName(id) }; }
    const L = this.isSpot(id) ? this.uw.loc('spot', id.slice(5)) : this.uw.loc('prop', id);
    return L ? { x: L.x, z: L.z, name: this.placeName(id) } : null;
  }
  container(id) { return id === 'inv' ? this.S.inv : this.isTurf(id) ? this.uw.whse.turfStock(+id.slice(5)) : (this.S.storage[id] || (this.S.storage[id] = {})); }
  // room right now, before runs on the way
  rawFree(id) { return id === 'inv' ? this.uw.pocketFree() : this.isTurf(id) ? this.uw.whse.turfFree(+id.slice(5)) : this.uw.props.storageFree(id); }
  freeAt(id, excludeRun) {
    let free = this.rawFree(id);
    for (const r of this.S.runs) if (r !== excludeRun && r.to === id) free -= r.n * GOODS[r.good].size; // space promised to runs on the way
    return free;
  }
  // only Drivers make deliveries (§5: Runner and Driver are one role)
  available() { return this.uw.crew.active().filter(c => c.role === 'driver' && !this.S.runs.some(r => r.crew === c.id)); }
  // who holds a stretch of the route, for the §8 risk tiers
  stretch(i) {
    const uw = this.uw, own = uw.owner[i];
    if (this.S.turfs[i].war) return 'hostile';
    if (own === 'pc') return 'own';
    if (!own || !FACTIONS[own] || this.S.factions[own].broken) return 'neutral';
    const att = uw.attitude(own);
    return att === 'friendly' ? 'friendly' : att === 'hostile' ? 'hostile' : 'rival';
  }
  // chance of a clean run and why, for a runner, route, good and amount
  assess(c, from, to, good, n) {
    const uw = this.uw, S = this.S, A = this.locOf(from), B = this.locOf(to); if (!A || !B) return null;
    const [, bandName, lo, hi] = this.band(c), bk = clamp((c.skill - this.band(c)[0]) / 20, 0, 1);
    const why = [];
    let p = lo + (hi - lo) * bk; why.push([`${bandName} runner`, p]);
    const add = (label, d) => { if (Math.abs(d) >= 0.004) { p += d; why.push([label, d]); } };
    add('loyalty', (c.loyalty - 50) / 50 * 0.06);
    if (c.traits.includes('cautious')) add('cautious', 0.04);
    if (c.traits.includes('veteran')) add('veteran', 0.03);
    if (c.traits.includes('hothead')) add('hothead', -0.03);
    if (c.traits.includes('talker')) add('loose lips', -0.02);
    // the route (§8): start, middle and end. Rival hijack risk by who holds each stretch (own turf almost none,
    // friendly low, neutral moderate, rival high, hostile or at war very high); police risk separately
    const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, kinds = [];
    let rival = 0, police = 0;
    for (const q of [A, mid, B]) { const i = turfAt(q.x, q.z), k = this.stretch(i); kinds.push(k); rival += ROUTE_RISK[k]; police += S.turfs[i].police / 3; }
    add(`rival hijack risk (${kinds.join(', ')})`, -rival);
    const pol0 = p;
    add('police pressure', -S.pressure / 100 * 0.08); add('patrols on the route', -police / 100 * 0.05);
    if (S.taskforce > 0) add('state task force', -0.05);
    if (S.crackdown > 0) add('crackdown', -0.03);
    const policeRisk = pol0 - p;
    const value = n * uw.market.price(zoneKey(B.x, B.z), good);
    add('cargo value', -clamp(Math.log10(Math.max(1, value / 800)) * 0.035, 0, 0.09));
    add('load size', -clamp((n * GOODS[good].size - 20) / 20 * 0.02, 0, 0.06));
    add('your influence', clamp(uw.influence / 1000 * 0.06, 0, 0.06));
    if (uw.props.perk('delivery') > 0) add('your couriers and drivers', uw.props.perk('delivery'));
    p = clamp(p, 0.3, 0.95);
    const dist = Math.hypot(A.x - B.x, A.z - B.z);
    // Drivers are salaried crew: a run has no labour fee of its own (§45.25). It costs payroll, any product bought,
    // and whatever the route takes in losses.
    const hours = clamp(Math.round(dist / 220) + 1, 1, 6);
    return { p, why, hours, dist, value, rival, police: policeRisk, kinds };
  }
  // start a run: the goods leave the origin now
  // opts.auto: sent by a warehouse's Lieutenant (a supply run's purchase comes out of that warehouse's vault first)
  dispatch(crewId, from, to, good, n, opts = {}) {
    const uw = this.uw, S = this.S, g = this.g, c = uw.crew.find(crewId);
    if (!c || c.status !== 'active' || S.runs.some(r => r.crew === c.id)) return 'That crew member is not available.';
    if (c.role !== 'driver') return 'Only a Driver makes deliveries.';
    if (from === to) return 'Pick a different destination.';
    if (!GOODS[good] || !(n > 0)) return 'Nothing to send.';
    if (!this.placeOk(from) || this.isTurf(from)) return 'Pick a pickup.';
    if (from !== 'inv' && !this.isSpot(from) && !uw.props.owned(from)) return 'You don’t own that stash.';
    if (to === 'inv' || this.isSpot(to) || !this.placeOk(to)) return 'Pick a destination.';
    if (this.isTurf(to)) { const i = +to.slice(5); if (!uw.whse.dealersOn(i).length) return `You have no Dealer on ${uw.T[i].name}.`; if (GOODS[good].fence || GOODS[good].arms) return 'Dealers don’t move that.'; }
    else if (!uw.props.owned(to) || !PROP_BY_ID[to].storage) return 'The destination has no stash.';
    const base = WarehouseSystem.idOf(c.assign), first = PROP_BY_ID[to] && PROP_BY_ID[to].kind === 'warehouse' ? to : base;
    let buy = 0;
    if (this.isSpot(from)) {
      // a supply run: the Driver buys at the supplier's wholesale price, paid from the vault (§8)
      const sp = SPOTS.find(x => x.id === from.slice(5)), L = uw.loc('spot', sp.id);
      if (!sp.sells.includes(good)) return `${sp.name} doesn’t sell that.`;
      if (g.save.rep < (sp.rep || 0) && !(S.flags.intro && S.flags.intro[sp.id])) return `${sp.name} doesn’t deal with you yet.`;
      const stock = S.supply[sp.id] || (S.supply[sp.id] = {}); if (stock[good] === undefined) stock[good] = Math.round(30 * S.market[L.zone][good][0] / GOODS[good].size);
      n = Math.min(Math.floor(n), stock[good] | 0); if (n <= 0) return `${sp.name} is out of that.`;
      buy = Math.round(uw.market.wholesale(L.zone, good) * n);
    } else { const src = this.container(from); n = Math.min(Math.floor(n), Inv.has(src, good)); }
    if (n <= 0) return 'There is none of that at the pickup.';
    if (this.freeAt(to) < n * GOODS[good].size) return `Not enough room at ${this.placeName(to)} (with other runs on the way).`;
    const a = this.assess(c, from, to, good, n); if (!a) return 'No route.';
    if (buy && Money.payrollReserve() < buy) return `The product costs ${fmtMoney(buy)} in Dirty Cash, from the vault first.`;
    let cost;
    if (buy) { Money.pay(buy, 'supplyRun', { first }); S.supply[from.slice(5)][good] -= n; cost = buy; }
    else cost = Inv.remove(this.container(from), good, n);
    const now = this.absHour();
    const r = { id: S.nextRun++, crew: c.id, name: uw.crew.displayName(c), from, to, good, n, cost, start: now, eta: now + a.hours, chance: a.p, dist: a.dist, rival: a.rival, police: a.police };
    if (opts.auto) r.auto = true;
    S.runs.push(r); S.st.runs = (S.st.runs || 0) + 1;
    if (uw.compounds) uw.compounds.onRun('depart', r);
    if (!opts.auto) g.audio.play('confirm');
    return '';
  }
  // the hourly clock: finish every run that is due (works in jail too: the world keeps turning)
  tickHours() { const now = this.absHour(); for (const r of this.S.runs.slice()) if (now >= r.eta) this.resolve(r); }
  // roll / forced: deterministic replay (tests, and a future "inspect the odds" view); normally random
  resolve(r, roll, forced) {
    const uw = this.uw, S = this.S, c = uw.crew.find(r.crew);
    const i = S.runs.indexOf(r); if (i >= 0) S.runs.splice(i, 1);
    const dst = this.container(r.to), srcName = this.placeName(r.from);
    const z = uw.loc('prop', r.to) ? uw.loc('prop', r.to).zone : 'm';
    let outcome = 'success', delivered = r.n, lost = 0, extra = '';
    const R = roll !== undefined ? roll : Math.random();
    // runner gone (fired, jailed, dead) before the drop: they never made it
    const runnerOk = c && c.status === 'active';
    if (!runnerOk || R >= r.chance) {
      // what went wrong depends on the runner and the street, not just luck
      const disloyal = c && (c.loyalty < 30 || (c.loyalty < 45 && (c.traits.includes('greedy') || c.traits.includes('talker'))));
      // the route's own risks weigh what went wrong: a hijack where rivals hold the road, a stop where police do
      const rv = r.rival !== undefined ? r.rival / 0.09 : 1, pl = r.police !== undefined ? r.police / 0.06 : 1;
      const w = { partial: 0.42, robbed: 0.24 * rv * (1 + clamp((60 - (uw.influence / 10)) / 60, 0, 1)), seized: 0.18 * pl * (1 + S.pressure / 50), abandoned: 0.16, betrayal: disloyal ? 0.45 : 0 };
      if (!runnerOk) { w.partial = 0; w.robbed = 0.2; w.seized = c && c.status === 'jailed' ? 2 : 0.2; w.abandoned = 1; w.betrayal = 0; }
      const tot = Object.values(w).reduce((a, b) => a + b, 0); let q = (roll !== undefined ? ((R - r.chance) / Math.max(1e-6, 1 - r.chance)) : Math.random()) * tot;
      for (const k in w) { q -= w[k]; if (q <= 0) { outcome = k; break; } }
      if (q > 0) outcome = 'partial';
      if (forced && w[forced] !== undefined && (forced !== 'betrayal' || w.betrayal > 0)) outcome = forced;
      if (outcome === 'partial') { lost = Math.max(1, Math.round(r.n * rand(0.15, 0.45))); delivered = r.n - lost; extra = 'Some of it went missing on the way.'; }
      else { delivered = 0; lost = r.n; }
      if (outcome === 'robbed') { const near = turfAt((this.locOf(r.to).x + this.locOf(r.from === 'inv' ? r.to : r.from).x) / 2, (this.locOf(r.to).z + this.locOf(r.from === 'inv' ? r.to : r.from).z) / 2), fid = uw.owner[near] && FACTIONS[uw.owner[near]] ? uw.owner[near] : pick(FAC_IDS.filter(f => !S.factions[f].broken)); if (fid) { S.factions[fid].stock += lost; S.factions[fid].rel = clamp(S.factions[fid].rel - 4, -100, 100); extra = `The ${FACTIONS[fid].short} jumped the runner.`; } if (c && Math.random() < 0.35) uw.crew.hurt(c.id, 'a robbery on the road'); }
      if (outcome === 'seized') { S.pressure = clamp(S.pressure + 3 + lost * GOODS[r.good].heat * 0.05, 0, 100); S.st.seized += lost; extra = 'A patrol stopped the car.'; if (c && c.status === 'active' && Math.random() < 0.4) uw.crew.arrest(c, 'a traffic stop with product in the trunk'); }
      if (outcome === 'abandoned') { if (c) c.loyalty = clamp(c.loyalty - 4, 0, 100); extra = runnerOk ? 'The runner got spooked and dumped the load to get away.' : 'The runner never made it, and neither did the load.'; }
      if (outcome === 'betrayal') { extra = 'They kept the product and stopped answering.'; if (c) { c.status = 'gone'; c.role = 'idle'; c.assign = null; for (const o of uw.crew.active()) o.loyalty = clamp(o.loyalty - 3, 0, 100); } }
    }
    // the drop: what fits goes in, anything the stash can no longer take goes back (or is reported lost)
    let returned = 0, noRoom = 0;
    if (delivered > 0) {
      const costEach = r.cost / r.n, room = Math.floor(Math.max(0, this.rawFree(r.to)) / GOODS[r.good].size), put = Math.min(delivered, room);
      Inv.add(dst, r.good, put, costEach * put);
      let rest = delivered - put;
      if (rest > 0) { const back = this.isSpot(r.from) ? null : this.container(r.from), rr = !back ? 0 : Math.floor(Math.max(0, this.rawFree(r.from)) / GOODS[r.good].size); /* bought product can't go back to the supplier */ returned = Math.min(rest, rr); if (back && returned) Inv.add(back, r.good, returned, costEach * returned); noRoom = rest - returned; }
      delivered = put;
      if (returned || noRoom) extra += ` ${this.placeName(r.to)} was full: ${returned ? fmtQty(r.good, returned) + ' went back to ' + srcName : ''}${noRoom ? (returned ? ', ' : '') + fmtQty(r.good, noRoom) + ' had nowhere to go and was dumped' : ''}.`;
      lost += noRoom;
    }
    if (c && c.status === 'active') { if (outcome === 'success') { c.wins = (c.wins || 0) + 1; c.skill = clamp(c.skill + 0.6, 0, 100); } }
    if (outcome === 'success' || outcome === 'partial') S.st.runsOk = (S.st.runsOk || 0) + 1;
    const rep = { id: r.id, day: S.day, name: r.name, from: srcName, to: this.placeName(r.to), good: r.good, n: r.n, delivered, returned, lost, outcome, text: extra.trim(), chance: r.chance };
    S.runLog.push(rep); if (S.runLog.length > 20) S.runLog.splice(0, S.runLog.length - 20);
    if (delivered > 0 && uw.compounds) uw.compounds.onRun('arrive', r);
    const g = this.g, title = RUN_OUTCOMES[outcome];
    uw.news(r.name.split(' ')[0], `${title}: ${fmtQty(r.good, r.n)} ${GOODS[r.good].name} ${srcName} → ${this.placeName(r.to)}. ${delivered ? 'Delivered ' + fmtQty(r.good, delivered) + '.' : 'Nothing delivered.'}${lost ? ' Lost ' + fmtQty(r.good, lost) + '.' : ''} ${rep.text}`);
    if (!S.jail && g.state === 'playing') g.ui.toast(`Delivery ${title.toLowerCase()}: ${r.name.split(' ')[0]} · ${fmtQty(r.good, r.n)} ${GOODS[r.good].name} → ${this.placeName(r.to)}`, outcome === 'success' ? 'money' : 'warn');
    return rep;
  }
}

