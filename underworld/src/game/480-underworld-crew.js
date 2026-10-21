/* =====================================================================
   [UNDERWORLD] CREW: recruits with skills, ranks, pay, loyalty, fear, traits
   and power. Loyalty moves for reasons the player can read (pay, wins,
   losses, promotions, fear, rival offers); disloyalty has escalating,
   explained consequences: skimming, desertion, leaks, defection, coups.
   ===================================================================== */
class CrewManager {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  sanitizeMember(c) {
    const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v)) ? clamp(v, lo, hi) : d;
    c.id = Math.floor(num(c.id, 0, 0, 1e7)); c.seed = Math.floor(num(c.seed, Math.random() * 1e6, 0, 1e9));
    c.role = CREW_ROLES[c.role] ? c.role : 'idle'; c.rank = Math.floor(num(c.rank, 0, 0, 4));
    c.skill = num(c.skill, 30, 1, 100); c.loyalty = num(c.loyalty, 60, 0, 100); c.fear = num(c.fear, 10, 0, 100);
    c.morale = num(c.morale, 0, 0, MORALE_CAP); c.boosts = num(c.boosts, 0, 0, 50); c.raiseLoyal = num(c.raiseLoyal, 0, 0, RAISE_LOYALTY_CAP);
    c.pay = Math.round(num(c.pay, 100, 10, 5000)); c.power = num(c.power, 0, 0, 100); c.days = num(c.days, 0, 0, 1e6);
    c.traits = Array.isArray(c.traits) ? c.traits.filter(t => TRAITS[t]).slice(0, 3) : [];
    c.status = ['active', 'jailed', 'hurt', 'gone', 'dead'].includes(c.status) ? c.status : 'active';
    c.out = num(c.out, 0, 0, 1e4); c.unpaid = Math.floor(num(c.unpaid, 0, 0, 999)); c.wins = num(c.wins, 0, 0, 1e6);
    if (typeof c.nick !== 'string') c.nick = '';
    if (c.assign !== null && c.assign !== undefined && typeof c.assign !== 'number' && typeof c.assign !== 'string') c.assign = null;
    if (c.assign === undefined) c.assign = null;
    c.fee = Math.round(num(c.fee, c.pay * 3, 0, 1e6));
    c.run = null; // runs reference crew ids; the crew never holds run state itself
    return c;
  }
  reset() { this._bg = null; }
  active() { return this.S.crew.filter(c => c.status === 'active'); }
  cap() {
    let n = 2 + Math.min(4, this.uw.rank);
    for (const id in this.S.props) if (this.S.props[id].owned && PROP_BY_ID[id]) n += PROP_BY_ID[id].crew || 0;
    n += Math.round(this.uw.props.perk('crewRoom'));
    return Math.min(40, n);
  }
  roster() { return this.S.crew.filter(c => c.status !== 'gone' && c.status !== 'dead'); }
  displayName(c) { return c.nick ? `${c.name.split(' ')[0]} “${c.nick}” ${c.name.split(' ').slice(1).join(' ')}` : c.name; }
  genCandidate() {
    const st = this.uw.rank, rng = Math.random;
    const traits = pickN(Object.keys(TRAITS), rng() < 0.4 ? 2 : 1);
    let skill = clamp(18 + st * 8 + rng() * 40 + (traits.includes('veteran') ? 15 : 0), 5, 99);
    const greedy = traits.includes('greedy');
    const pay = Math.round((50 + skill * 2.6) * (greedy ? 1.35 : 1) / 5) * 5;
    return this.sanitizeMember({
      id: 0, seed: Math.floor(rng() * 1e9), name: pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES), nick: rng() < 0.3 ? pick(NICKS) : '',
      role: 'idle', rank: 0, skill, loyalty: 52 + rng() * 22 + (traits.includes('loyal') ? 12 : 0), fear: 5 + st * 6, pay, traits, assign: null,
      power: 0, days: 0, status: 'active', fee: Math.round(pay * (3 + st * 0.5) / 10) * 10
    });
  }
  refreshCandidates(force) {
    const S = this.S;
    if (!force && S.cand.length && S.day - S.candDay < 2) return;
    S.candDay = S.day;
    const PM = this.uw.props, hoodR = PM.ownedList().some(d => d.kind === 'safehouse' && PM.hoodOf(d) && PM.hoodOf(d).recruit) ? 1 : 0;
    const extra = Math.round(PM.perk('recruit')) + hoodR, n = (this.uw.rank >= 1 ? 3 + Math.min(3, this.uw.rank) : 2) + extra;
    S.cand = Array.from({ length: n }, () => this.genCandidate());
    // tattoo studios, bars and clubs bring in harder people
    if (extra) for (const c of S.cand) c.skill = clamp(c.skill + extra * 2, 0, 99);
  }
  canRecruit() { return this.uw.g.save.rep >= 100 || this.uw.rank >= 1; }
  hire(idx) {
    const uw = this.uw, S = this.S, g = uw.g, c = S.cand[idx];
    if (!c) return 'Gone.';
    if (!this.canRecruit()) return 'Nobody works for a nobody. Earn 100 reputation first.';
    if (this.active().length >= this.cap()) return `You can only run ${this.cap()} people right now. More property means more room.`;
    if (!Money.can(c.fee, 'crewFee')) return `${c.name} wants ${fmtMoney(c.fee)} up front, in Dirty Cash.`;
    Money.pay(c.fee, 'crewFee');
    c.id = S.nextCrew++; c.days = 0; S.crew.push(c); S.cand.splice(idx, 1);
    uw.news('pv', `${this.displayName(c)} is on your payroll at ${fmtMoney(c.pay)} a day.`);
    g.audio.play('cash');
    g.autosave('Crew hired');
    return '';
  }
  find(id) { return this.S.crew.find(c => c.id === id); }
  // what the whole active crew costs per day, and how many days the Dirty reserve covers (§45.21)
  payroll() { return this.active().reduce((a, c) => a + this.dailyPay(c), 0); }
  payrollDays() { const w = this.payroll(); return w > 0 ? Math.floor(Money.payrollReserve() / w) : Infinity; }
  dailyPay(c) { return Math.round(c.pay * (1 + c.rank * 0.35) * (c.role === 'bodyguard' ? 1.2 : 1)); }
  fire(id) {
    const c = this.find(id); if (!c) return;
    c.status = 'gone'; c.role = 'idle'; c.assign = null;
    // firing a disgruntled lieutenant is a risk of its own
    if (c.rank >= 3 && c.loyalty < 40) { this.uw.S.pressure = clamp(this.uw.S.pressure + 6, 0, 100); this.uw.news('unknown', `${c.name} left angry and talked to the wrong people. Police pressure is up.`); }
    for (const o of this.active()) if (o !== c) o.loyalty = clamp(o.loyalty - 2, 0, 100);
  }
  promote(id) {
    const g = this.uw.g, c = this.find(id); if (!c || c.rank >= 4) return 'Already at the top.';
    const cost = PROMO_COST[c.rank + 1];
    if (!Money.can(cost, 'crewFee')) return `Promotion costs ${fmtMoney(cost)} in Dirty Cash.`;
    if (c.days < c.rank * 2) return `${c.name.split(' ')[0]} hasn’t been around long enough (${c.rank * 2} days).`;
    Money.pay(cost, 'crewFee');
    c.rank++; c.loyalty = clamp(c.loyalty + 15, 0, 100); c.power = clamp(c.power + 12, 0, 100); c.skill = clamp(c.skill + 4, 0, 99);
    g.audio.play('confirm');
    return '';
  }
  // a bonus settles any back pay and lifts morale for a while; each recent bonus counts for less (§45.23)
  bonus(id) {
    const g = this.uw.g, c = this.find(id); if (!c) return '';
    const amt = this.dailyPay(c) * 3;
    if (!Money.can(amt, 'crewFee')) return `A bonus costs ${fmtMoney(amt)} in Dirty Cash.`;
    Money.pay(amt, 'crewFee'); c.unpaid = 0; g.audio.play('cash');
    const gain = Math.min(BONUS_MORALE / (1 + c.boosts), MORALE_CAP - c.morale);
    c.morale += gain; c.boosts += 1;
    const who = c.name.split(' ')[0];
    return gain >= 1 ? `${who} is happy with it (morale +${Math.round(gain)}). It wears off in a few days.` : `${who} takes the money. It doesn’t change much any more.`;
  }
  discipline(id) {
    const c = this.find(id); if (!c) return;
    c.fear = clamp(c.fear + 28, 0, 100); c.loyalty = clamp(c.loyalty - 8, 0, 100);
    for (const o of this.active()) if (o !== c) o.fear = clamp(o.fear + 5, 0, 100);
    this.uw.g.audio.play('punch');
  }
  assign(id, role, target) {
    const c = this.find(id); if (!c || c.status !== 'active') return 'Not available.';
    const R = CREW_ROLES[role]; if (!R) return 'Unknown role.';
    if (R.minRank && c.rank < R.minRank) return `${R.name} needs ${CREW_RANKS[R.minRank]} rank.`;
    if (role === 'bodyguard' && this.active().filter(o => o.role === 'bodyguard' && o !== c).length >= 2) return 'Two bodyguards at most.';
    if (R.biz && !(this.S.props[target] && this.S.props[target].owned && PROP_BY_ID[target].kind === 'business')) return 'Pick one of your businesses.';
    if (role === 'manager' && this.active().some(o => o !== c && o.role === 'manager' && o.assign === target)) return 'That business already has a manager.';
    c.role = role; c.assign = R.turf ? (typeof target === 'number' ? target : null) : R.zone ? (ZONES[target] ? target : null) : R.biz ? target : null;
    if ((R.turf || R.zone) && c.assign === null) { c.role = 'idle'; return 'Pick a place.'; }
    return '';
  }
  presence(i) { const z = this.uw.T[i].zone; for (const c of this.S.crew) if (c.status === 'active' && (((c.role === 'dealer' || c.role === 'enforcer') && c.assign === i) || (c.role === 'lieutenant' && c.assign === z && this.uw.owner[i] === 'pc'))) return true; return false; }
  onTurf(i) { return this.S.crew.filter(c => c.status === 'active' && (c.role === 'dealer' || c.role === 'enforcer') && c.assign === i).map(c => c.id); }
  bodyguards() { const runs = this.S.runs || []; return this.active().filter(c => c.role === 'bodyguard' && !runs.some(r => r.crew === c.id)).slice(0, 2).map(c => c.id); }
  hurt(id, why) {
    const c = this.find(id); if (!c || c.status !== 'active') return;
    c.status = 'hurt'; c.out = randi(2, 5);
    this.uw.news('pv', `${c.name} is laid up for ${c.out} days after a ${why}.`);
  }
  warAttrition(i, h) {
    for (const c of this.S.crew) if (c.status === 'active' && (c.role === 'enforcer' || c.role === 'dealer') && c.assign === i && Math.random() < 0.012 * h * (c.role === 'dealer' ? 1.5 : 1) * (1 - c.skill / 200)) {
      if (Math.random() < 0.15) { c.status = 'dead'; this.uw.news('pv', `${c.name} didn’t make it out of ${this.uw.T[i].name}. The crew took it hard.`); for (const o of this.active()) o.loyalty = clamp(o.loyalty - 5, 0, 100); }
      else this.hurt(c.id, 'fight over ' + this.uw.T[i].name);
    }
  }
  tickHours() { }
  update(dt) { }
  storedStock() {
    // every unit sitting in owned storage, with where it is
    const S = this.S, out = [];
    for (const id in S.storage) if (S.props[id] && S.props[id].owned) for (const k of GOOD_IDS) if (S.storage[id][k] > 0) out.push({ id, k, n: S.storage[id][k] });
    return out;
  }
  takeStored(good, n) {
    const S = this.S; let got = 0; this.lastCost = 0;
    for (const id in S.storage) { if (!(S.props[id] && S.props[id].owned)) continue; const st = S.storage[id]; const a = Math.min(n - got, Inv.has(st, good)); if (a > 0) { this.lastCost += Inv.remove(st, good, a); got += a; } if (got >= n) break; }
    return got;
  }
  tickDay() {
    const uw = this.uw, S = this.S, g = uw.g;
    for (const c of S.crew) {
      if (c.status === 'hurt' || c.status === 'jailed') { c.out--; if (c.out <= 0) { const was = c.status; c.status = 'active'; uw.news('pv', `${c.name} is ${was === 'jailed' ? 'out of county' : 'back on their feet'} and reporting for work.`); } else if (c.status === 'jailed') c.loyalty = clamp(c.loyalty - 0.8, 0, 100); }
    }
    const act = this.active();
    // payroll: Dirty Cash only, from warehouse vaults, then safehouses, then your pockets (§45.17, §45.21)
    const wages = this.payroll();
    const paid = Money.pay(wages, 'wages', { partial: true });
    const short = wages > 0 && paid < wages - 0.5;
    const rank = uw.S.rankMax;
    let dealt = 0, dealIncome = 0;
    for (const c of act) {
      c.days++;
      const t = c.traits;
      // ---- loyalty, with the reasons that move it. Paid on time, it doesn't decay: it grows a little with time
      // together and with the respect your standing commands (the peak Rank: losing Rank doesn't sour the crew, §45.23)
      let dl = 0.4 + rank * 0.3;
      if (short) { c.unpaid++; dl -= 7 + c.unpaid * 3; } else c.unpaid = 0;
      if (t.includes('loyal')) dl += 1; if (t.includes('greedy')) dl -= 0.6;
      if (c.wins > 0) { dl += Math.min(4, c.wins); c.wins = 0; }
      if (c.fear > 75) dl -= 1;
      if (c.rank >= 3 && c.pay < 160 + c.rank * 60) dl -= 0.8; // senior people expect senior money
      // rival offers: strong, hostile factions court greedy and unhappy people
      const rival = this.bestRival();
      if (rival && (t.includes('greedy') || c.loyalty < 45) && Math.random() < 0.15) { dl -= 3; c.offer = rival; }
      c.loyalty = clamp(c.loyalty + dl, 0, 100);
      c.fear += ((rank * 8) - c.fear) * 0.05;
      c.morale = Math.max(0, c.morale - MORALE_DECAY); c.boosts *= BOOST_FADE;
      c.power = clamp(c.power + c.rank * 0.35 + (t.includes('ambitious') ? 0.6 : 0) + (c.role === 'lieutenant' ? 0.9 : 0), 0, 100);
      // ---- role work (a runner out on a delivery skips their usual job that day)
      const res = S.runs.some(r => r.crew === c.id) ? null : this.work(c);
      if (res) { dealt += res.units || 0; dealIncome += res.cash || 0; }
      // ---- disloyalty, from mild to catastrophic
      this.disloyalty(c, rival);
    }
    if (dealIncome > 0) Money.earn(dealIncome, 'dealers');
    if (short) uw.news('pv', `Payroll came up ${fmtMoney(wages - paid)} short. The crew noticed.`);
    // leadership challenge: an ambitious, powerful lieutenant wants more
    for (const c of act) if (c.status === 'active' && c.rank >= 3 && c.power > 60 && c.traits.includes('ambitious') && !S.decisions.some(d => d.crew === c.id) && Math.random() < 0.08) {
      S.decisions.push({ id: S.nextOpp++, kind: 'raise', crew: c.id, text: `${this.displayName(c)} wants a bigger cut: pay up 50% (to ${fmtMoney(Math.round(c.pay * 1.5))}/day) or be told no.`, day: S.day });
      uw.news(c.name.split(' ')[0], 'We need to talk about my cut. Check your phone.');
    }
    this.refreshCandidates(false);
  }
  bestRival() {
    let best = null;
    for (const id of FAC_IDS) { const f = this.S.factions[id]; if (f.broken || f.rel > -10) continue; if (!best || f.strength > this.S.factions[best].strength) best = id; }
    return best;
  }
  work(c) {
    const uw = this.uw, S = this.S, g = uw.g;
    const skill = c.skill / 100;
    if (c.role === 'dealer' && typeof c.assign === 'number') {
      const i = c.assign, t = uw.T[i], z = t.zone;
      const n = Math.floor(4 + skill * 8 + c.rank * 2);
      // sell the most valuable sellable product in storage that this district wants
      const stock = this.storedStock().filter(s => !GOODS[s.k].fence && !GOODS[s.k].arms);
      if (!stock.length) { if (Math.random() < 0.3) uw.news(c.name.split(' ')[0], 'I’ve got customers and nothing to sell. Stock the stash.'); return null; }
      stock.sort((a, b) => uw.market.price(z, b.k) - uw.market.price(z, a.k));
      let left = n, cash = 0, sold = 0;
      for (const s of stock) { if (left <= 0) break; const take = this.takeStored(s.k, Math.min(left, s.n)); if (!take) continue; const pr = uw.market.price(z, s.k) * 0.72 * (uw.owner[i] === 'pc' ? 1.1 : 1); cash += pr * take; sold += take; S.st.realized = (S.st.realized || 0) + pr * take - (this.lastCost || 0); S.realBy = S.realBy || {}; S.realBy[s.k] = Math.round((S.realBy[s.k] || 0) + pr * take - (this.lastCost || 0)); left -= take; uw.market.sold(z, s.k, take); S.pressure = clamp(S.pressure + take * GOODS[s.k].heat * 0.05, 0, 100); }
      S.turfs[i].police = clamp(S.turfs[i].police + 1.5 + sold * 0.1, 0, 100);
      uw.addInf(i, 'pc', 2.5);
      // skimming happens in disloyalty(); getting caught happens here
      const own = uw.owner[i];
      if (own && own !== 'pc' && uw.attitude(own) !== 'friendly') { S.factions[own].rel -= 2; if (Math.random() < 0.06) this.hurt(c.id, `beating from the ${FACTIONS[own].short} on their turf`); }
      const risk = 0.012 + S.turfs[i].police / 900 + S.pressure / 1600 - (c.traits.includes('cautious') ? 0.01 : 0) - skill * 0.008 - (uw.cops.perk('kerr') && z === 'o' ? 0.006 : 0);
      if (Math.random() < risk) { this.arrest(c, `selling on ${t.name}`); return { units: sold, cash: cash * 0.5 }; }
      c.wins += sold > 6 ? 1 : 0;
      S.st.sold += sold;
      return { units: sold, cash: Math.round(cash) };
    }
    if (c.role === 'enforcer' && typeof c.assign === 'number') {
      const i = c.assign; uw.addInf(i, 'pc', 3 + skill * 4 + c.rank);
      const own = uw.owner[i]; if (own && own !== 'pc') { uw.addInf(i, own, -(1.5 + skill * 2)); S.factions[own].rel -= 1.5; if (Math.random() < 0.05 * (1 - skill)) this.hurt(c.id, `scrap with the ${FACTIONS[own].short}`); }
      return null;
    }
    if (c.role === 'lieutenant' && typeof c.assign === 'string') {
      let n = 0;
      // a Lieutenant strengthens your hold on the district; there is no flat stipend (§45.18)
      for (let i = 0; i < uw.T.length; i++) if (uw.T[i].zone === c.assign && uw.owner[i] === 'pc') { uw.addInf(i, 'pc', 2 + skill * 2); n++; }
      return null;
    }
    // a Driver no longer steals cars for a daily payout (§37 #2, §45.18); Driver logistics arrive with the
    // warehouse rebuild (Session 3)
    if (c.role === 'driver') return null;
    if (c.role === 'manager') { if (!(S.props[c.assign] && S.props[c.assign].owned)) c.role = 'idle'; return null; }
    return null;
  }
  arrest(c, why) {
    const uw = this.uw, S = this.S;
    c.status = 'jailed'; c.out = randi(10, 60); c.loyalty = clamp(c.loyalty - 8, 0, 100);
    uw.news('radio', `Police radio: one in custody, ${why}.`);
    uw.news('pv', `${c.name} got picked up for ${why}. ${c.out} days inside${uw.cops.perk('okoro') ? ' — Okoro is losing the paperwork' : ''}.`);
    if (uw.cops.perk('okoro')) c.out = Math.ceil(c.out * 0.5);
    // people who talk, talk to detectives
    if (c.loyalty < 35 || c.traits.includes('talker')) { S.pressure = clamp(S.pressure + 6, 0, 100); uw.news('unknown', `${c.name.split(' ')[0]} said too much in the interview room. Police pressure is up.`); }
  }
  disloyalty(c, rival) {
    const uw = this.uw, S = this.S, g = uw.g;
    if (c.status !== 'active') return;
    // morale (what money bought) counts, but at most MORALE_CAP: it never buys anyone out of betrayal (§45.23)
    const L = c.loyalty + c.morale, F = c.fear, guard = L + F * 0.45;
    const why = `loyalty ${Math.round(L)}${c.unpaid ? `, unpaid ${c.unpaid} day${c.unpaid > 1 ? 's' : ''}` : ''}${F < 25 ? ', not afraid of you' : ''}`;
    // 1. skimming: greedy or unhappy people steal a little
    if (L < 45 && (c.traits.includes('greedy') || Math.random() < 0.4) && Math.random() < 0.25) {
      const amt = Money.crewTheft(0.03, 80, 4000);
      if (amt > 0) uw.news('pv', `The count is ${fmtMoney(amt)} short. ${c.name} has been skimming from the stash (${why}).`);
      return;
    }
    // 2. desertion
    if (L < 15 && guard < 30 && Math.random() < 0.35) { c.status = 'gone'; c.role = 'idle'; uw.news('pv', `${c.name} walked out and isn’t answering (${why}).`); return; }
    // 3. leaks
    if (L < 25 && (c.traits.includes('talker') || Math.random() < 0.3) && Math.random() < 0.2) { S.pressure = clamp(S.pressure + 8, 0, 100); uw.props.raidChanceBonus = (uw.props.raidChanceBonus || 0) + 0.25; uw.news('unknown', `Somebody in your crew is talking. Word is it’s ${c.name.split(' ')[0]} (${why}). Police pressure is up and your stashes are exposed.`); return; }
    // 4. defection to a rival who made an offer
    if (L < 22 && guard < 40 && c.offer && FACTIONS[c.offer] && Math.random() < 0.3) {
      const f = S.factions[c.offer];
      c.status = 'gone'; c.role = 'idle'; f.strength = Math.min(110, f.strength + 3 + c.skill / 15);
      if (typeof c.assign === 'number') { uw.addInf(c.assign, 'pc', -15); uw.addInf(c.assign, c.offer, 15); }
      uw.news('unknown', `${c.name} defected to the ${FACTIONS[c.offer].short} and took what they know with them (${why}).`);
      return;
    }
    // 5. betrayal: a powerful lieutenant stages a coup in their district
    if (c.rank >= 3 && c.power > 40 && L < 30 && F < 45 && Math.random() < 0.25) {
      const z = c.role === 'lieutenant' ? c.assign : uw.T[typeof c.assign === 'number' ? c.assign : 0].zone;
      const to = rival || this.bestRival() || FAC_IDS.find(id => !S.factions[id].broken);
      let n = 0;
      // the turfs aren't handed over: the rival they sold you to moves on them at once, with everything the traitor
      // knows (§45.13). The showdowns decide who keeps them.
      for (let i = 0; i < uw.T.length; i++) if (uw.T[i].zone === z && uw.owner[i] === 'pc') { uw.addInf(i, 'pc', -45); if (to) { uw.addInf(i, to, 40); uw.factions.startWar(to, i, 'Betrayal.', { force: true }); } n++; }
      const stolen = Money.crewTheft(0.12, 0, 60000);
      c.status = 'gone'; c.role = 'idle';
      if (to) S.factions[to].strength = Math.min(110, S.factions[to].strength + 10);
      for (const o of this.active()) o.loyalty = clamp(o.loyalty - 6, 0, 100);
      uw.recompute();
      g.ui.banner('Betrayed', `${c.name} turned on you`, 'fail', 4);
      uw.news('unknown', `${this.displayName(c)} sold you out: ${n} turf${n === 1 ? '' : 's'} in ${ZONES[z] ? ZONES[z].name : 'the city'} ${n === 1 ? 'is' : 'are'} ${to ? 'under attack from the ' + FACTIONS[to].short : 'exposed'}, and ${fmtMoney(stolen)} went with them. Why: ${why}, power ${Math.round(c.power)}.`);
    }
  }
  decide(did, yes) {
    const uw = this.uw, S = this.S, d = S.decisions.find(x => x.id === did); if (!d) return;
    S.decisions = S.decisions.filter(x => x !== d);
    const c = this.find(d.crew); if (!c || c.status === 'gone' || c.status === 'dead') return;
    if (d.kind === 'raise') {
      if (yes) { const add = Math.min(RAISE_LOYALTY, RAISE_LOYALTY_CAP - c.raiseLoyal); c.pay = Math.round(c.pay * 1.5); c.loyalty = clamp(c.loyalty + add, 0, 100); c.raiseLoyal += add; uw.news(c.name.split(' ')[0], 'Smart. You won’t regret it.'); }
      else { c.loyalty = clamp(c.loyalty - 25, 0, 100); c.fear = clamp(c.fear + 5, 0, 100); uw.news(c.name.split(' ')[0], 'Fine. I’ll remember this.'); }
    }
  }
}

