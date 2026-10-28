/* =====================================================================
   [UNDERWORLD] THE LAW (Session 7 / M7): the case file, warrants and the
   court. The wanted stars of a chase (310) stay as they are; this is what
   the police KNOW about you afterwards, and what a court does with it.
   - The case file (save.uw.legal.items): one entry per crime somebody
     actually saw: an officer ('police', strong) or a civilian whose call
     got through ('witness', weaker). Nothing nobody saw is ever on file.
     Evidence goes stale (a witness after LEGAL.stale.witness economic
     days, an officer's report after LEGAL.stale.police) and cases go cold.
   - A warrant: once the file weighs LEGAL.warrant, any officer who gets a
     good look at you (close, in line of sight, not inside) may recognise
     you and start a 1★ stop. It lapses when the file cools below
     LEGAL.warrantClear, or a lawyer gets it quashed (Clean Bank, a real
     chance of failing).
   - The court: an arrest goes to an arraignment. Each count shows how good
     the evidence is. Plead guilty (a quarter off), take the public defender
     (free), or hire a firm or a QC (Clean Bank) to contest each count; or,
     with the influence and the friends for it, have the case fixed (Clean
     Bank, or Dirty Cash through your crew at more risk). Fixing is strong
     but never certain (at most LEGAL.fixMax). A small case ends in a fine
     instead of jail. A reload during the hearing comes back to the hearing.
   - Escaped prisoners: a recapture adds a modest enhancement (a fifth of
     the new sentence, LEGAL.fugitive.min..max days), not the unserved rest.
   ===================================================================== */
const LEGAL = {
  w: { police: 3, witness: 1.5 },
  stale: { police: 30, witness: 10 },
  warrant: 8, warrantClear: 4,
  recog: { range: 24, every: 1.5, p: 0.22, night: 0.6 },
  // the chance a contested count is thrown out, by the evidence behind it
  dismiss: { police: 0.06, witness: 0.34, physical: 0.02 },
  fineMaxDays: 6, finePerDay: 400,
  severe: ['shootcop', 'hitcop', 'stealcop', 'copcar', 'robbery', 'koped', 'explosion', 'escape'],
  fixMax: 0.95, fixDirtyK: 1.25,
  fugitive: { k: 0.2, min: 7, max: 60 },
  quash: { base: 0.7, per: 900, min: 2000 }
};
const CHARGE_NAME = { hitped: 'Hit and run', assault: 'Assault', shoot: 'Discharging a firearm', carjack: 'Carjacking', stealcop: 'Theft of a police vehicle', ramcop: 'Ramming a police vehicle', hitcop: 'Assaulting an officer', shootcop: 'Shooting at police', copcar: 'Destroying police property', explosion: 'Arson / explosion', koped: 'Aggravated assault', theft: 'Auto theft', deal: 'Distribution', pickpocket: 'Theft from the person', robbery: 'Armed robbery', burglary: 'Burglary', escape: 'Escaping custody' };
const EVIDENCE_NAME = { police: 'an officer saw it', witness: 'a witness statement', physical: 'found on you' };
class Legal {
  constructor(uw) { this.uw = uw; this.recT = 0; this.open = false; }
  get S() { return this.uw.S; }
  get L() { return this.S.legal || (this.S.legal = Legal.fresh()); }
  static fresh() { return { items: [], warrant: false, hearing: null, escapes: 0, fines: 0, fixed: 0 }; }
  static sanitize(L, num, rap) {
    const d = Legal.fresh(); if (!L || typeof L !== 'object') L = d;
    const out = { items: [], warrant: !!L.warrant, hearing: null, escapes: Math.floor(num(L.escapes, 0, 0, 999)), fines: num(L.fines, 0, 0, 1e12), fixed: Math.floor(num(L.fixed, 0, 0, 1e6)) };
    for (const it of Array.isArray(L.items) ? L.items : []) if (it && CRIME_DAYS[it.t] && (it.q === 'police' || it.q === 'witness')) out.items.push({ t: it.t, q: it.q, day: Math.floor(num(it.day, 0, 0, 1e7)) });
    // a save from before the case file: what the old rap sheet held becomes officer evidence on file today
    if (rap && rap.cur && typeof rap.cur === 'object') { for (const k in rap.cur) if (CRIME_DAYS[k]) for (let n = 0; n < Math.min(6, rap.cur[k] | 0); n++) out.items.push({ t: k, q: 'police', day: 0 }); delete rap.cur; }
    out.items = out.items.slice(-60);
    const H = L.hearing;
    if (H && typeof H === 'object' && Array.isArray(H.counts)) out.hearing = { counts: H.counts.filter(c => c && typeof c.name === 'string' && Number.isFinite(c.days)).slice(0, 40).map(c => ({ name: c.name.slice(0, 80), days: clamp(Math.round(c.days), 0, 5000), q: ['police', 'witness', 'physical'].includes(c.q) ? c.q : 'police', t: CRIME_DAYS[c.t] || c.t === 'resist' || c.t === 'possession' || c.t === 'guns' || c.t === 'car' || c.t === 'fugitive' ? c.t : 'other', severe: !!c.severe })), mul: num(H.mul, 1, 0.3, 3), fugitive: !!H.fugitive, fixTried: !!H.fixTried };
    return out;
  }
  econDay() { return Math.floor(this.S.econH / 24); }
  // ---------------------------------------------------------------- the case file
  // a crime somebody saw (310 → PressureSystem.crime → here). q: 'police' or 'witness'
  add(type, q) {
    if (!CRIME_DAYS[type]) return;
    const L = this.L; L.items.push({ t: type, q: q === 'witness' ? 'witness' : 'police', day: this.econDay() });
    if (L.items.length > 60) L.items.splice(0, L.items.length - 60);
    this.review();
  }
  live() { const d = this.econDay(); return this.L.items.filter(it => d - it.day <= LEGAL.stale[it.q]); }
  weight() { return this.live().reduce((a, it) => a + LEGAL.w[it.q], 0); }
  // a warrant goes out at LEGAL.warrant and lapses below LEGAL.warrantClear
  review() {
    const L = this.L, w = this.weight();
    if (!L.warrant && w >= LEGAL.warrant) { L.warrant = true; this.uw.news('radio', 'Police radio: a warrant has been issued in your name. Officers have your description.'); }
    else if (L.warrant && w < LEGAL.warrantClear) { L.warrant = false; this.uw.news('pv', 'The case against you has gone cold. The warrant has lapsed.'); }
  }
  tickDay() { const d = this.econDay(), L = this.L; L.items = L.items.filter(it => d - it.day <= LEGAL.stale[it.q]); this.review(); }
  // a lawyer gets the warrant quashed: the witness statements go, the officers' reports stay (Clean Bank)
  quashPrice() { return Math.max(LEGAL.quash.min, Math.round(this.weight() * LEGAL.quash.per / 50) * 50); }
  quash(rnd = Math.random) {
    const L = this.L, g = this.uw.g; if (!L.warrant) return 'There is no warrant out for you.';
    const fee = this.quashPrice();
    if (!Money.can(fee, 'lawyer')) return `Castellan & Ward want ${fmtMoney(fee)} from your bank.`;
    Money.pay(fee, 'lawyer');
    const p = clamp(LEGAL.quash.base + this.uw.props.perk('legal') / 2 - this.L.items.filter(it => it.q === 'police').length * 0.04, 0.2, 0.92);
    if (rnd() >= p) { g.saveGame(); return `The judge refused. The warrant stands (the fee is gone).`; }
    L.items = L.items.filter(it => it.q === 'police'); L.warrant = false; this.review();
    g.saveGame();
    return 'Warrant quashed. The witness statements are out of the file.';
  }
  // an officer who gets a good look may recognise you (no stars yet, a warrant, out in the open)
  update(dt) {
    const uw = this.uw, g = uw.g, P = g.police, p = g.player;
    if (this.L.hearing && g.state === 'playing' && !this.open && !uw.S.jail) this.hearing();
    if (!this.L.warrant || P.level > 0 || !P.enabled || uw.S.jail || p.interior || g.state !== 'playing') return;
    this.recT -= dt; if (this.recT > 0) return; this.recT = LEGAL.recog.every;
    if (!this.sighted()) return;
    if (Math.random() >= LEGAL.recog.p * (1 - g.env.night * (1 - LEGAL.recog.night))) return;
    P.addHeat(HEAT_LEVELS[1], p.pos.x, p.pos.z);
    g.ui.toast('An officer recognised you from the warrant. Lose them, or get your lawyer onto it.', 'radio');
  }
  // is an officer close enough, with a clear line, to see your face? (no unit is adopted here)
  sighted() {
    const g = this.uw.g, P = g.police, p = g.player, grid = g.world.grid, R = LEGAL.recog.range, y = p.pos.y + 1.4;
    const look = (x, yy, z) => dist2(x, z, p.pos.x, p.pos.z) < R * R && grid.lineOfSight(x, yy, z, p.pos.x, y, p.pos.z);
    for (const c of P.cops) if (c.state !== 'down' && look(c.x, c.y + 1.6, c.z)) return true;
    for (const v of g.vehicles.list) if (v.patrol && look(v.pos.x, v.pos.y + 1.5, v.pos.z)) return true;
    for (const u of P.units) if (!u.v.burnt && look(u.v.pos.x, u.v.pos.y + 1.5, u.v.pos.z)) return true;
    return false;
  }
  // ---------------------------------------------------------------- the charges
  // every count, with the evidence behind it: the file, the chase, and what was on you
  charges() {
    const uw = this.uw, S = this.S, g = uw.g, counts = [];
    const lvl = Math.max(g.police.level, S.rap.maxLvl || 0);
    if (lvl > 0) counts.push({ t: 'resist', name: `Resisting arrest / evading (${lvl}★)`, days: SENTENCE_BASE[clamp(lvl, 1, 5)], q: 'police', severe: lvl >= 4 });
    // the file: at most six counts of any one crime, the best evidence first
    const by = {};
    for (const it of this.live()) (by[it.t] || (by[it.t] = [])).push(it.q);
    for (const t in by) { const qs = by[t].sort((a, b) => (a === 'police' ? 0 : 1) - (b === 'police' ? 0 : 1)).slice(0, 6); for (const q of qs) counts.push({ t, name: CHARGE_NAME[t] || t, days: CRIME_DAYS[t], q, severe: LEGAL.severe.includes(t) }); }
    // what was on you: product by the lot, guns you carried, the stolen car you were caught in
    const carried = uw.carried();
    for (const k of GOOD_IDS) { const n = carried[k] | 0; const d = Math.round(TIERS[GOODS[k].tier].charge * n * 0.5); if (d) counts.push({ t: 'possession', name: `Possession: ${fmtQty(k, n)} ${GOODS[k].name}`, days: d, q: 'physical' }); }
    const on = id => g.player.carries(id);
    if (on('pistol') || on('smg') || on('shotgun')) counts.push({ t: 'guns', name: 'Unlicensed firearms', days: (on('pistol') ? 14 : 0) + (on('smg') ? 45 : 0) + (on('shotgun') ? 30 : 0), q: 'physical' });
    const pv = g.player.lastVehicle;
    if (pv && !pv.owned && !pv.garageUid && pv.stolenBefore && dist2(pv.pos.x, pv.pos.z, g.player.pos.x, g.player.pos.z) < 20 * 20) counts.push({ t: 'car', name: 'Possession of a stolen vehicle', days: 10, q: 'physical' });
    const mul = Math.min(1.8, 1 + S.rap.priors * 0.08) * uw.cops.sentenceMul();
    const fugitive = !!(S.fugitive && S.fugitive.left > 0);
    if (fugitive) counts.push({ t: 'fugitive', name: 'Escaped custody (recapture enhancement)', days: 0, q: 'police', severe: true });
    return { counts, mul, fugitive };
  }
  // days for a set of counts after the multiplier and the 6.5 halving, plus the modest fugitive enhancement
  sentenceOf(counts, mul, fugitive, k = 1) {
    const raw = counts.reduce((a, c) => a + c.days, 0);
    let days = raw ? Math.max(3, Math.round(clamp(raw * mul, 5, SENTENCE_MAX) * SENTENCE_FACTOR * k)) : 0;
    if (fugitive && days > 0) days += clamp(Math.round(days * LEGAL.fugitive.k), LEGAL.fugitive.min, LEGAL.fugitive.max);
    else if (fugitive) days = LEGAL.fugitive.min;
    return days;
  }
  // ---------------------------------------------------------------- the defences
  defences() {
    const H = this.L.hearing, left = H ? this.sentenceOf(H.counts, H.mul, H.fugitive) : 0, L2 = this.uw.props.perk('legal'), f = v => Math.round(v * (1 - L2) / 50) * 50;
    return [
      { id: 'plead', name: 'Plead guilty', fee: 0, add: 0, k: 0.75, contest: false, desc: 'Every count stands; the judge knocks a quarter off for saving everyone the time.' },
      { id: 'pd', name: 'Public defender', fee: 0, add: 0.06, k: 1, contest: true, desc: 'Free. Overworked, but he read your file. Probably.' },
      { id: 'firm', name: 'Castellan & Ward', fee: f(Math.max(2500, left * 60)), add: 0.16, k: 0.88, contest: true, desc: 'A real criminal defence firm.' },
      { id: 'silk', name: 'Adrienne Voss, QC', fee: f(Math.max(15000, left * 240)), add: 0.3, k: 0.75, contest: true, desc: 'Judges listen when she talks. She knows it.' }
    ];
  }
  dismissChance(c, add) {
    if (c.t === 'fugitive') return 0;
    return clamp(LEGAL.dismiss[c.q] + add + this.uw.props.perk('legal') / 3 - this.S.rap.priors * 0.02, 0, 0.9);
  }
  // fixing a case: influence, Rank and friends on the force; a severe case is harder; never certain
  fixChance(dirty) {
    const uw = this.uw, H = this.L.hearing; if (!H) return 0;
    const paid = uw.cops.paidCount(), infl = uw.influence || 0, rank = uw.rank || 0;
    if (infl < 120 && rank < 3 && paid < 1) return 0;
    const severe = H.counts.filter(c => c.severe).length;
    return clamp(0.3 + infl / 800 + rank * 0.07 + paid * 0.07 - severe * 0.08 - (dirty ? 0.05 : 0), 0.05, LEGAL.fixMax);
  }
  fixPrice(dirty) { const H = this.L.hearing, d = H ? this.sentenceOf(H.counts, H.mul, H.fugitive) : 0; return Math.round((3000 + d * 200) * (dirty ? LEGAL.fixDirtyK : 1) / 50) * 50; }
  // ---------------------------------------------------------------- the hearing
  // called at booking (after the arrest has confiscated what was carried): open the hearing, saved
  arraign(pre) {
    const ch = pre && pre.counts ? pre : this.charges(), L = this.L;
    L.hearing = { counts: ch.counts, mul: ch.mul, fugitive: ch.fugitive, fixTried: false };
    this.uw.g.saveGame(true);
    this.hearing();
  }
  hearing() {
    const uw = this.uw, g = uw.g, C2 = g.content, L = this.L; if (!L.hearing) return;
    this.open = true; this.result = null;
    const render = () => {
      const H = L.hearing; if (!H) return `<div class="hint">${esc(this.result || '')}</div><div class="btns"><button class="sbtn gold" data-act="done">Continue</button></div>`;
      const full = this.sentenceOf(H.counts, H.mul, H.fugitive);
      let h = `<div class="hint">You are charged on ${H.counts.length} count${H.counts.length === 1 ? '' : 's'}. Facing about <b>${fmtSentence(full)}</b>${H.mul > 1.01 ? ` (×${H.mul.toFixed(2)} for your record and police pressure)` : ''}. ${Money.html('lawyer')}</div>`;
      h += `<div class="stats">${H.counts.map(c => `<span>${esc(c.name)}</span><span>${c.days ? fmtSentence(c.days) : '—'} · ${esc(EVIDENCE_NAME[c.q])}</span>`).join('')}</div>`;
      h += '<h3>Your defence</h3><div class="jobs">' + this.defences().map(d => {
        const ok = !d.fee || Money.can(d.fee, 'lawyer');
        const odds = d.contest ? ` · witness counts ~${Math.round(this.dismissChance({ q: 'witness' }, d.add) * 100)}% thrown out, officer counts ~${Math.round(this.dismissChance({ q: 'police' }, d.add) * 100)}%` : '';
        return `<div class="job"><div style="flex:1"><b>${d.name}</b><span>${esc(d.desc)}${odds}</span></div><button class="sbtn ${d.id === 'pd' ? 'gold' : ''}" data-act="def:${d.id}" ${ok ? '' : 'disabled'}>${d.fee ? fmtMoney(d.fee) : 'Choose'}</button></div>`;
      }).join('') + '</div>';
      const fc = this.fixChance(false), fd = this.fixChance(true), crew = !!uw.prison.courier();
      if (!H.fixTried && (fc > 0 || fd > 0)) h += `<h3>Make it go away</h3><div class="jobs"><div class="job"><div style="flex:1"><b>A word with the judge</b><span>A campaign donation from your bank. About ${Math.round(fc * 100)}% it works; if it doesn’t, obstruction is added and the public defender takes the case.</span></div><button class="sbtn" data-act="fix:clean" ${Money.can(this.fixPrice(false), 'lawyer') ? '' : 'disabled'}>${fmtMoney(this.fixPrice(false))}</button></div>
        <div class="job"><div style="flex:1"><b>Your crew handles it</b><span>Dirty Cash in an envelope, carried by your people. About ${Math.round(fd * 100)}%; if it goes wrong it adds a bribery count.</span></div><button class="sbtn" data-act="fix:dirty" ${crew && Money.can(this.fixPrice(true), 'judgeBribe') ? '' : 'disabled'}>${crew ? fmtMoney(this.fixPrice(true)) : 'no crew outside'}</button></div></div>`;
      else if (!H.fixTried) h += '<div class="hint">Nobody at the courthouse owes you anything yet (influence, Rank or a friend on the force would change that).</div>';
      return h;
    };
    C2.openSvc('Port Valen Magistrates’ Court', 'Arraignment', render, a => {
      if (a === 'done') { g.ui.back(); return; }
      const [k, v] = a.split(':');
      if (k === 'def') this.verdict(v);
      else if (k === 'fix') this.fix(v === 'dirty');
      C2.refreshSvc();
    });
    // walking away from the court is the public defender (the hearing is never skipped)
    C2._svcClose = () => { this.open = false; if (L.hearing) this.verdict('pd'); };
  }
  // the judge's decision on each count, then the sentence: time, a fine, or nothing left standing
  verdict(id, rnd = Math.random) {
    const uw = this.uw, g = uw.g, L = this.L, H = L.hearing; if (!H) return '';
    const D = this.defences().find(d => d.id === id) || this.defences()[1];
    if (D.fee) { if (!Money.can(D.fee, 'lawyer')) return 'You can’t pay them.'; Money.pay(D.fee, 'lawyer'); }
    const kept = [], thrown = [];
    for (const c of H.counts) { if (D.contest && rnd() < this.dismissChance(c, D.add)) thrown.push(c); else kept.push(c); }
    return this.sentence(kept, H, D.k, `${D.name}${thrown.length ? `: ${thrown.length} count${thrown.length === 1 ? '' : 's'} thrown out` : ''}`, thrown.length);
  }
  fix(dirty, rnd = Math.random) {
    const uw = this.uw, g = uw.g, H = this.L.hearing; if (!H || H.fixTried) return '';
    const p = this.fixChance(dirty), price = this.fixPrice(dirty); if (!(p > 0)) return 'Nobody to talk to.';
    if (dirty) { if (!uw.prison.courier() || !Money.can(price, 'judgeBribe')) return 'Not possible.'; Money.pay(price, 'judgeBribe'); }
    else { if (!Money.can(price, 'lawyer')) return 'Not enough in the bank.'; Money.pay(price, 'judgeFix'); }
    H.fixTried = true;
    if (rnd() < p) {
      this.L.fixed++;
      // fixed: only what was physically on you can't simply vanish; it ends in a fine at most
      const phys = H.counts.filter(c => c.q === 'physical');
      return this.sentence(phys, { ...H, fugitive: false }, 1, 'The case fell apart', H.counts.length - phys.length, true);
    }
    H.counts.push(dirty ? { t: 'other', name: 'Bribery of an official', days: 60, q: 'police', severe: true } : { t: 'other', name: 'Obstruction of justice', days: Math.max(10, Math.round(this.sentenceOf(H.counts, H.mul, false) * 0.2)), q: 'police', severe: false });
    g.saveGame(true);
    return this.verdict('pd');
  }
  // apply the outcome; fineOnly: a fixed case never ends in jail
  sentence(kept, H, k, how, thrown, fineOnly) {
    const uw = this.uw, g = uw.g, S = this.S, L = this.L;
    let days = this.sentenceOf(kept, H.mul, H.fugitive && !fineOnly, k);
    const severe = kept.some(c => c.severe);
    let fine = 0;
    if (days > 0 && (fineOnly || (days <= LEGAL.fineMaxDays && !severe))) {
      fine = days * LEGAL.finePerDay;
      const paid = Money.pay(fine, 'courtFine', { partial: true });
      L.fines += paid;
      // what the bank can't cover is served: a day per LEGAL.finePerDay owed (at least 3 days)
      const owed = fine - paid; days = owed > 0 && !fineOnly ? Math.max(3, Math.ceil(owed / LEGAL.finePerDay)) : 0;
    }
    // the record: a conviction if anything stood; the file and the chase are spent either way
    if (kept.length) S.rap.priors++;
    L.items = []; L.warrant = false; L.hearing = null; S.rap.maxLvl = 0; S.fugitive = null;
    const lines = kept.map(c => [c.name, c.days]);
    this.result = days > 0 ? `${how}. Sentenced to ${fmtSentence(days)}.${fine ? ` (${fmtMoney(fine)} fine, more than your bank could cover.)` : ''}` : fine ? `${how}. Fined ${fmtMoney(fine)} from your bank. You walk out of court.` : `${how}. Nothing stands. You walk out of court.`;
    uw.news('pv', this.result);
    if (days > 0) {
      const ch = { total: days, full: days, lines, mul: H.mul };
      this.open = false; g.content._svcClose = null; g.ui.closeAll();
      uw.prison.lockUp(ch);
    } else {
      g.ui.banner(fine ? 'Fined' : 'Case dismissed', fine ? fmtMoney(fine) : 'Free to go', 'pass', 3);
      g.saveGame(true);
    }
    return this.result;
  }
  // ---------------------------------------------------------------- the phone's Police page
  caseHtml() {
    const L = this.L, live = this.live(), w = this.weight(), d = this.econDay(), by = {};
    for (const it of live) { const k = it.t + ':' + it.q; by[k] = (by[k] || 0) + 1; }
    let h = `<h3>Your case file</h3><div class="stats"><span>Warrant</span><span style="color:${L.warrant ? 'var(--red)' : 'inherit'}">${L.warrant ? 'OUT · officers who see your face may stop you' : 'none'}</span><span>Evidence weight</span><span>${w.toFixed(1)} (warrant at ${LEGAL.warrant})</span>`;
    h += Object.keys(by).map(k => { const [t, q] = k.split(':'); return `<span>${esc(CHARGE_NAME[t] || t)} ×${by[k]}</span><span>${esc(EVIDENCE_NAME[q])}</span>`; }).join('') + '</div>';
    if (!live.length) h += '<div class="hint">Nothing on file. The police only know what somebody saw.</div>';
    else h += `<div class="hint">Witness statements go stale after ${LEGAL.stale.witness} days, officers’ reports after ${LEGAL.stale.police}. Oldest on file: day ${Math.min(...live.map(it => it.day))} (today ${d}).</div>`;
    if (L.warrant) h += `<div class="btns"><button class="sbtn gold" data-act="quash" ${Money.can(this.quashPrice(), 'lawyer') ? '' : 'disabled'}>Have the warrant quashed · ${fmtMoney(this.quashPrice())}</button></div>`;
    return h;
  }
}
