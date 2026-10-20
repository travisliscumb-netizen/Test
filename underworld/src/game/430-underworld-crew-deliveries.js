/* =====================================================================
   [UNDERWORLD] CREW DELIVERIES: a crew member moves product from one of your
   stashes to another while you get on with something else. The goods leave
   the origin when the run starts and exist only in the run until it ends, so
   a save mid-run (or a reload) can never duplicate or lose them silently:
   every run ends in a report. Success chance comes from the runner (skill
   band 50-90%, loyalty, traits) and the route (your turf, rival turf, police
   pressure, wars, cargo value, size, your influence) - never a bare dice roll.
   ===================================================================== */
const RUNNER_BANDS = [[0, 'ROOKIE', 0.5, 0.6], [35, 'DECENT', 0.6, 0.75], [55, 'EXPERIENCED', 0.75, 0.85], [75, 'ELITE', 0.85, 0.9]];
const RUN_OUTCOMES = { success: 'SUCCESS', partial: 'PARTIAL LOSS', robbed: 'ROBBED', seized: 'POLICE SEIZURE', abandoned: 'ABANDONED CARGO', betrayal: 'BETRAYAL', returned: 'RETURNED' };
class DeliveryManager {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  get g() { return this.uw.g; }
  absHour() { return this.S.day * 24 + Math.floor(this.g.env ? this.g.env.time : 0) % 24; }
  sanitizeRun(r, num) {
    if (!r || typeof r !== 'object' || !GOODS[r.good] || !PROP_BY_ID[r.to]) return null;
    if (r.from !== 'inv' && !PROP_BY_ID[r.from]) return null;
    const n = Math.floor(num(r.n, 0, 0, 1e5)); if (!(n > 0)) return null;
    return { id: Math.floor(num(r.id, 0, 0, 1e7)), crew: Math.floor(num(r.crew, 0, 0, 1e7)), from: r.from, to: r.to, good: r.good, n, cost: num(r.cost, 0, 0, 1e9), fee: Math.round(num(r.fee, 0, 0, 1e6)), start: num(r.start, 0, 0, 1e8), eta: num(r.eta, 0, 0, 1e8), chance: num(r.chance, 0.7, 0.05, 0.99), dist: num(r.dist, 200, 0, 5000), name: typeof r.name === 'string' ? r.name : 'Runner' };
  }
  band(c) { let b = RUNNER_BANDS[0]; for (const x of RUNNER_BANDS) if (c.skill >= x[0]) b = x; return b; }
  locOf(id) { if (id === 'inv') { const p = this.g.player; return { x: p.pos.x, z: p.pos.z, name: 'you (pockets)' }; } const L = this.uw.loc('prop', id); return L ? { x: L.x, z: L.z, name: PROP_BY_ID[id].name } : null; }
  container(id) { return id === 'inv' ? this.S.inv : (this.S.storage[id] || (this.S.storage[id] = {})); }
  freeAt(id, excludeRun) {
    if (id === 'inv') return this.uw.pocketFree();
    let free = this.uw.props.storageFree(id);
    for (const r of this.S.runs) if (r !== excludeRun && r.to === id) free -= r.n * GOODS[r.good].size; // space promised to runs on the way
    return free;
  }
  available() { return this.uw.crew.active().filter(c => !this.S.runs.some(r => r.crew === c.id)); }
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
    // the route: start, middle and end turfs
    const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    let turf = 0, war = 0, police = 0;
    for (const q of [A, mid, B]) {
      const i = turfAt(q.x, q.z), own = uw.owner[i];
      if (own === 'pc') turf += 0.03; else if (own && FACTIONS[own] && uw.attitude(own) === 'hostile') turf -= 0.045; else if (own) turf -= 0.012;
      if (uw.contested[i]) turf -= 0.02;
      if (S.turfs[i].war) war -= 0.05;
      police += S.turfs[i].police / 3;
    }
    add('route turf', turf); add('gang war on the route', war);
    add('police pressure', -S.pressure / 100 * 0.08); add('patrols on the route', -police / 100 * 0.05);
    if (S.taskforce > 0) add('state task force', -0.05);
    if (S.crackdown > 0) add('crackdown', -0.03);
    const value = n * uw.market.price(zoneKey(B.x, B.z), good);
    add('cargo value', -clamp(Math.log10(Math.max(1, value / 800)) * 0.035, 0, 0.09));
    add('load size', -clamp((n * GOODS[good].size - 20) / 20 * 0.02, 0, 0.06));
    add('your influence', clamp(uw.influence / 1000 * 0.06, 0, 0.06));
    if (uw.props.perk('delivery') > 0) add('your couriers and drivers', uw.props.perk('delivery'));
    p = clamp(p, 0.3, 0.95);
    const dist = Math.hypot(A.x - B.x, A.z - B.z);
    const fee = Math.round((150 + dist * 0.3 + Math.min(value * 0.025, 2500) + (1 - p) * 350) * (0.8 + c.skill / 100 * 0.6) / 10) * 10;
    const hours = clamp(Math.round(dist / 220) + 1, 1, 6);
    return { p, why, fee, hours, dist, value };
  }
  // start a run: the goods leave the origin now
  dispatch(crewId, from, to, good, n) {
    const uw = this.uw, S = this.S, g = this.g, c = uw.crew.find(crewId);
    if (!c || c.status !== 'active' || S.runs.some(r => r.crew === c.id)) return 'That crew member is not available.';
    if (from === to) return 'Pick a different destination.';
    if (!GOODS[good] || !(n > 0)) return 'Nothing to send.';
    if (from !== 'inv' && !uw.props.owned(from)) return 'You don’t own that stash.';
    if (!uw.props.owned(to) || !PROP_BY_ID[to].storage) return 'The destination has no stash.';
    const src = this.container(from); n = Math.min(Math.floor(n), Inv.has(src, good));
    if (n <= 0) return 'There is none of that at the pickup.';
    if (this.freeAt(to) < n * GOODS[good].size) return `Not enough room at ${PROP_BY_ID[to].name} (with other runs on the way).`;
    const a = this.assess(c, from, to, good, n); if (!a) return 'No route.';
    if (g.save.money < a.fee) return `The runner wants ${fmtMoney(a.fee)} up front.`;
    uw.expense('deliveries', a.fee);
    const cost = Inv.remove(src, good, n);
    const now = this.absHour();
    const r = { id: S.nextRun++, crew: c.id, name: uw.crew.displayName(c), from, to, good, n, cost, fee: a.fee, start: now, eta: now + a.hours, chance: a.p, dist: a.dist };
    S.runs.push(r); S.st.runs = (S.st.runs || 0) + 1;
    g.audio.play('confirm');
    return '';
  }
  // the hourly clock: finish every run that is due (works in jail too: the world keeps turning)
  tickHours() { const now = this.absHour(); for (const r of this.S.runs.slice()) if (now >= r.eta) this.resolve(r); }
  // roll / forced: deterministic replay (tests, and a future "inspect the odds" view); normally random
  resolve(r, roll, forced) {
    const uw = this.uw, S = this.S, c = uw.crew.find(r.crew);
    const i = S.runs.indexOf(r); if (i >= 0) S.runs.splice(i, 1);
    const dst = this.container(r.to), srcName = r.from === 'inv' ? 'your pockets' : PROP_BY_ID[r.from].name;
    const z = uw.loc('prop', r.to) ? uw.loc('prop', r.to).zone : 'm';
    let outcome = 'success', delivered = r.n, lost = 0, extra = '';
    const R = roll !== undefined ? roll : Math.random();
    // runner gone (fired, jailed, dead) before the drop: they never made it
    const runnerOk = c && c.status === 'active';
    if (!runnerOk || R >= r.chance) {
      // what went wrong depends on the runner and the street, not just luck
      const disloyal = c && (c.loyalty < 30 || (c.loyalty < 45 && (c.traits.includes('greedy') || c.traits.includes('talker'))));
      const w = { partial: 0.42, robbed: 0.24 * (1 + clamp((60 - (uw.influence / 10)) / 60, 0, 1)), seized: 0.18 * (1 + S.pressure / 50), abandoned: 0.16, betrayal: disloyal ? 0.45 : 0 };
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
      const costEach = r.cost / r.n, room = Math.floor(Math.max(0, this.uw.props.storageFree(r.to)) / GOODS[r.good].size), put = Math.min(delivered, room);
      Inv.add(dst, r.good, put, costEach * put);
      let rest = delivered - put;
      if (rest > 0) { const back = this.container(r.from), rr = r.from === 'inv' ? Math.floor(uw.pocketFree() / GOODS[r.good].size) : Math.floor(Math.max(0, uw.props.storageFree(r.from)) / GOODS[r.good].size); returned = Math.min(rest, rr); Inv.add(back, r.good, returned, costEach * returned); noRoom = rest - returned; }
      delivered = put;
      if (returned || noRoom) extra += ` ${PROP_BY_ID[r.to].name} was full: ${returned ? fmtQty(r.good, returned) + ' went back to ' + srcName : ''}${noRoom ? (returned ? ', ' : '') + fmtQty(r.good, noRoom) + ' had nowhere to go and was dumped' : ''}.`;
      lost += noRoom;
    }
    if (c && c.status === 'active') { if (outcome === 'success') { c.wins = (c.wins || 0) + 1; c.skill = clamp(c.skill + 0.6, 0, 100); } }
    if (outcome === 'success' || outcome === 'partial') S.st.runsOk = (S.st.runsOk || 0) + 1;
    const rep = { id: r.id, day: S.day, name: r.name, from: srcName, to: PROP_BY_ID[r.to].name, good: r.good, n: r.n, delivered, returned, lost, fee: r.fee, outcome, text: extra.trim(), chance: r.chance };
    S.runLog.push(rep); if (S.runLog.length > 20) S.runLog.splice(0, S.runLog.length - 20);
    const g = this.g, title = RUN_OUTCOMES[outcome];
    uw.news(r.name.split(' ')[0], `${title}: ${fmtQty(r.good, r.n)} ${GOODS[r.good].name} ${srcName} → ${PROP_BY_ID[r.to].name}. ${delivered ? 'Delivered ' + fmtQty(r.good, delivered) + '.' : 'Nothing delivered.'}${lost ? ' Lost ' + fmtQty(r.good, lost) + '.' : ''} Fee ${fmtMoney(r.fee)}. ${rep.text}`);
    if (!S.jail && g.state === 'playing') g.ui.toast(`Delivery ${title.toLowerCase()}: ${r.name.split(' ')[0]} · ${fmtQty(r.good, r.n)} ${GOODS[r.good].name} → ${PROP_BY_ID[r.to].name}`, outcome === 'success' ? 'money' : 'warn');
    return rep;
  }
}

