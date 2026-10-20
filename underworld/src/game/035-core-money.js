/* =====================================================================
   [CORE] MONEY: the one authority over the player's money (overhaul Session 1).
   Two currencies (Master Handoff §2, §45):
   - Dirty Cash is physical and lives in places: on you (`me`), in the trunk of a car you own (`veh`, by garage
     uid), in a safehouse stash or a warehouse vault (`prop`, by property id). A car you don't own carries its own
     `cash` on the live vehicle, like its trunk, and loses it with the car.
   - Clean Bank is one account (`clean`), plus medical debt (`debt`) that incoming Clean pays off first (§45.20).
   Nothing else writes the player's money. Every change goes through earn / pay / move / seize with a source tag;
   MONEY_SOURCES fixes each tag's currency and where it lands or comes from, so a ruling changes one table entry,
   never a code path. Listeners (the +/- popups, the HUD) hear every change from here.
   ===================================================================== */
// Where income lands: 'me' (in your hands), 'stash' (passive criminal income: a warehouse vault, else your home,
// else any safehouse, else on you), 'clean' (the bank). How a cost is paid: 'dirty' (cash on you), 'payroll'
// (§45.21 order: warehouse vaults, then safehouse stashes, then cash on you), 'clean' (the bank), 'either' (cash
// on you first, then the bank), 'medical' (the bank; any shortfall becomes medical debt, §45.20).
// book: the line it adds to the empire's daily books (Empire › Overview), for the running of the operation only.
const MONEY_SOURCES = {
  // ---- Dirty income (§2, §45.17, §45.18)
  pickpocket: { earn: 'me' }, glovebox: { earn: 'me' }, pickup: { earn: 'me' }, chop: { earn: 'me' },
  fence: { earn: 'me' }, deal: { earn: 'me' }, arms: { earn: 'me' }, heist: { earn: 'me' }, burglary: { earn: 'me' },
  package: { earn: 'me' }, secret: { earn: 'me' }, contract: { earn: 'me' }, streetRace: { earn: 'me' }, event: { earn: 'me' },
  bounty: { earn: 'stash', book: 'bounties' }, dealers: { earn: 'stash', book: 'dealers' }, royalty: { earn: 'stash', book: 'territory tax' }, tribute: { earn: 'stash', book: 'tribute' },
  // ---- Clean income
  business: { earn: 'clean', book: 'businesses' }, carSale: { earn: 'clean' }, casino: { earn: 'clean' },
  stunt: { earn: 'clean', capped: true }, stuntMilestone: { earn: 'clean' },
  // ---- Dirty costs
  armorer: { pay: 'dirty' }, supplier: { pay: 'dirty' }, raceBuyIn: { pay: 'dirty' }, respect: { pay: 'dirty' },
  truce: { pay: 'dirty' }, payAndSpray: { pay: 'dirty' }, usedLot: { pay: 'either' },
  wages: { pay: 'payroll', book: 'wages' }, crewFee: { pay: 'payroll' }, delivery: { pay: 'payroll', book: 'deliveries' }, protection: { pay: 'payroll', book: 'protection' },
  bribe: { pay: 'payroll', book: 'bribes' }, jailBribe: { pay: 'payroll' }, contraband: { pay: 'payroll' },
  // ---- Clean costs
  property: { pay: 'clean' }, upkeep: { pay: 'clean', book: 'upkeep' }, garage: { pay: 'clean' }, shop: { pay: 'clean' },
  dealer: { pay: 'clean' }, training: { pay: 'clean' }, casinoStake: { pay: 'clean' }, lawyer: { pay: 'clean' },
  hospital: { pay: 'medical' },
  // ---- either (everyday purchases, §45.18)
  taxi: { pay: 'either' }, bar: { pay: 'either' }, tipLine: { pay: 'either' }, food: { pay: 'either' },
  // ---- development only
  debug: { earn: 'me' }
};
const STUNT_DAILY_CAP = 1500;
const MEDICAL_DEBT_CAP = 1500;    // one outstanding hospital bill at most (§45.20); the largest bill is $1,500      // repeatable stunt cash per in-game day (§45.19); milestones are uncapped
const MONEY_MAX = 1e15;            // anything larger is refused as corrupt input
const DIRTY_PROP_KINDS = new Set(['safehouse', 'warehouse']); // where Dirty Cash can be kept (§2)
const okAmount = n => typeof n === 'number' && isFinite(n) && n > 0 && n < MONEY_MAX;
const Money = {
  g: null, listeners: [], lastStunt: 0,
  bind(game) { this.g = game; },
  fresh() { return { v: 1, clean: 0, debt: 0, dirty: { me: 0, veh: {}, prop: {} }, stunt: { day: -1, paid: 0 } }; },
  // every number finite, non-negative, whole cents; unknown places dropped
  sanitize(w) {
    const d = this.fresh(), num = v => typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(Math.round(v * 100) / 100, MONEY_MAX) : 0;
    if (!w || typeof w !== 'object' || Array.isArray(w)) return d;
    const D = w.dirty && typeof w.dirty === 'object' && !Array.isArray(w.dirty) ? w.dirty : {};
    const map = (o, keyOk) => { const out = {}; if (o && typeof o === 'object' && !Array.isArray(o)) for (const k in o) { const v = num(o[k]); if (v > 0 && keyOk(k)) out[k] = v; } return out; };
    return {
      v: 1, clean: num(w.clean), debt: Math.min(num(w.debt), MEDICAL_DEBT_CAP),
      dirty: { me: num(D.me), veh: map(D.veh, k => /^\d+$/.test(k)), prop: map(D.prop, k => !!PROP_BY_ID[k]) },
      stunt: { day: w.stunt && Number.isFinite(w.stunt.day) ? Math.floor(w.stunt.day) : -1, paid: w.stunt ? num(w.stunt.paid) : 0 }
    };
  },
  get W() { const s = this.g && this.g.save; if (!s) return this.fresh(); if (!s.wallet) s.wallet = this.fresh(); return s.wallet; },
  get uw() { return this.g && this.g.uw; },
  // ------------------------------------------------------------ reading
  get clean() { return this.W.clean; },
  get debt() { return this.W.debt; },
  get onMe() { return this.W.dirty.me; },
  dirtyAtProp(id) { return this.W.dirty.prop[id] || 0; },
  dirtyInCar(uid) { return this.W.dirty.veh[uid] || 0; },
  dirtyTotal() { const D = this.W.dirty; let t = D.me; for (const k in D.veh) t += D.veh[k]; for (const k in D.prop) t += D.prop[k]; return t; },
  total() { return this.dirtyTotal() + this.W.clean; },
  // cash in a live vehicle: an owned car keeps it in the wallet (saved), any other car on the vehicle itself
  carCash(v) { return v ? (v.garageUid ? this.dirtyInCar(v.garageUid) : (+v.cash || 0)) : 0; },
  canHoldCash(id) { const d = PROP_BY_ID[id]; return !!(d && DIRTY_PROP_KINDS.has(d.kind) && this.uw && this.uw.props.owned(id)); },
  // the places payroll and other remote Dirty costs draw from, in §45.21 order (warehouse vaults, safehouses, you)
  payrollOrder(first) {
    const out = [], uw = this.uw;
    const owned = uw ? uw.props.ownedList() : [];
    const wh = owned.filter(d => d.kind === 'warehouse').map(d => d.id), sh = owned.filter(d => d.kind === 'safehouse').map(d => d.id);
    if (first && wh.includes(first)) out.push('p:' + first);
    for (const id of wh) if (id !== first) out.push('p:' + id);
    for (const id of sh) out.push('p:' + id);
    out.push('me');
    return out;
  },
  // the payroll sources in draw order, with what each holds (for the Crew screen)
  payrollSources() { return this.payrollOrder().map(k => ({ key: k, name: k === 'me' ? 'Cash on you' : PROP_BY_ID[k.slice(2)].name, kind: k === 'me' ? 'you' : PROP_BY_ID[k.slice(2)].kind, amt: this._get(k) })); },
  payrollReserve() { let t = 0; for (const k of this.payrollOrder()) t += this._get(k); return t; },
  // where passive criminal income is delivered: a warehouse vault, else your home, else any safehouse, else you
  stashFor() {
    const uw = this.uw; if (!uw) return 'me';
    const owned = uw.props.ownedList();
    const wh = owned.find(d => d.kind === 'warehouse'); if (wh) return 'p:' + wh.id;
    const home = this.g.save.home && owned.find(d => d.id === this.g.save.home && d.kind === 'safehouse'); if (home) return 'p:' + home.id;
    const sh = owned.find(d => d.kind === 'safehouse'); if (sh) return 'p:' + sh.id;
    return 'me';
  },
  _get(key, v) {
    const D = this.W.dirty;
    if (key === 'me') return D.me;
    if (key.startsWith('p:')) return D.prop[key.slice(2)] || 0;
    if (key.startsWith('car:')) return D.veh[key.slice(4)] || 0;
    if (key === 'live') return v ? (+v.cash || 0) : 0;
    return 0;
  },
  _set(key, n, v) {
    const D = this.W.dirty; n = Math.round(Math.max(0, n) * 100) / 100;
    if (key === 'me') D.me = n;
    else if (key.startsWith('p:')) { const id = key.slice(2); if (n > 0) D.prop[id] = n; else delete D.prop[id]; }
    else if (key.startsWith('car:')) { const id = key.slice(4); if (n > 0) D.veh[id] = n; else delete D.veh[id]; }
    else if (key === 'live' && v) { if (n > 0) v.cash = n; else delete v.cash; }
  },
  // how much a cost of this source could draw right now
  available(src) {
    const S = MONEY_SOURCES[src]; if (!S || !S.pay) return 0;
    const W = this.W;
    switch (S.pay) {
      case 'dirty': return W.dirty.me;
      case 'payroll': return this.payrollReserve();
      case 'clean': return W.clean;
      case 'either': return W.dirty.me + W.clean;
      case 'medical': return Infinity; // never refused: a shortfall becomes medical debt
    }
    return 0;
  },
  can(n, src) { return okAmount(n) && this.available(src) >= n - 1e-6; },
  // ------------------------------------------------------------ writing
  on(fn) { this.listeners.push(fn); },
  _emit(cur, d, src) { if (Math.abs(d) < 0.005) return; for (const f of this.listeners) try { f({ cur, d, src }); } catch (e) { console.warn(e); } },
  _book(src, n, inc) {
    const s = this.g.save, uw = this.uw, b = MONEY_SOURCES[src].book;
    if (inc) s.stats.earned += n; else s.stats.spent += n;
    if (b && uw && uw.S && uw.S.ledger) { const L = uw.S.ledger[inc ? 'inc' : 'exp']; L[b] = (L[b] || 0) + Math.round(n); }
  },
  // income. Returns what was credited (0 when refused). opts.at: override where Dirty lands ('me' or 'p:<id>')
  earn(n, src, opts = {}) {
    const S = MONEY_SOURCES[src];
    if (!S || !S.earn) throw new Error('Money.earn: unknown income source ' + src);
    if (!okAmount(n)) return 0;
    const W = this.W;
    if (S.capped) {
      const day = this.uw ? this.uw.S.day : 0;
      if (W.stunt.day !== day) { W.stunt.day = day; W.stunt.paid = 0; }
      n = Math.min(n, Math.max(0, STUNT_DAILY_CAP - W.stunt.paid));
      W.stunt.paid += n; this.lastStunt = n;
      if (!(n > 0)) return 0;
    }
    n = Math.round(n * 100) / 100;
    if (S.earn === 'clean') {
      const toDebt = Math.min(W.debt, n);
      W.debt = Math.round((W.debt - toDebt) * 100) / 100; W.clean = Math.round((W.clean + n - toDebt) * 100) / 100;
      this._book(src, n, true); this._emit('clean', n, src);
      if (toDebt > 0) this._emit('debt', -toDebt, src);
      return n;
    }
    const key = opts.at && (opts.at === 'me' || (opts.at.startsWith('p:') && this.canHoldCash(opts.at.slice(2)))) ? opts.at : S.earn === 'stash' ? this.stashFor() : 'me';
    this._set(key, this._get(key) + n);
    this._book(src, n, true); if (key === 'me') this._emit('dirty', n, src);
    return n;
  },
  // a cost. All or nothing unless opts.partial (payroll pays what it can). Returns what was paid.
  pay(n, src, opts = {}) {
    const S = MONEY_SOURCES[src];
    if (!S || !S.pay) throw new Error('Money.pay: unknown cost source ' + src);
    if (!okAmount(n)) return 0;
    n = Math.round(n * 100) / 100;
    const W = this.W;
    if (S.pay === 'medical') {
      const fromBank = Math.min(W.clean, n), owed = n - fromBank;
      W.clean = Math.round((W.clean - fromBank) * 100) / 100;
      const add = Math.min(owed, Math.max(0, MEDICAL_DEBT_CAP - W.debt));
      W.debt = Math.round((W.debt + add) * 100) / 100;
      if (fromBank > 0) { this._book(src, fromBank, false); this._emit('clean', -fromBank, src); }
      if (add > 0) this._emit('debt', add, src);
      return fromBank;
    }
    if (!opts.partial && !this.can(n, src)) return 0;
    let left = n;
    const take = (key, cur) => { const have = this._get(key); const a = Math.min(have, left); if (a > 0) { this._set(key, have - a); left = Math.round((left - a) * 100) / 100; if (cur) this._emit(cur, -a, src); } };
    if (S.pay === 'clean') { const a = Math.min(W.clean, left); W.clean = Math.round((W.clean - a) * 100) / 100; left -= a; this._emit('clean', -a, src); }
    else if (S.pay === 'dirty') take('me', 'dirty');
    else if (S.pay === 'either') { take('me', 'dirty'); if (left > 0) { const a = Math.min(W.clean, left); W.clean = Math.round((W.clean - a) * 100) / 100; left -= a; this._emit('clean', -a, src); } }
    else if (S.pay === 'payroll') for (const k of this.payrollOrder(opts.first)) { if (left <= 0) break; take(k, k === 'me' ? 'dirty' : null); }
    const paid = Math.round((n - Math.max(0, left)) * 100) / 100;
    if (paid > 0) this._book(src, paid, false);
    return paid;
  },
  // a casino bet settled in one step (§45.5): the stake leaves the bank and the payout arrives together
  wager(stake, win) {
    if (!(stake >= 0 && stake < MONEY_MAX) || !(win >= 0 && win < MONEY_MAX) || stake > this.W.clean + 1e-6) return false;
    if (stake > 0) this.pay(stake, 'casinoStake');
    if (win > 0) this.earn(win, 'casino');
    return true;
  },
  // move Dirty Cash between two places (keys as Underworld.locations() names them: 'inv', 'p:<id>', 'car:<uid>',
  // 'veh'/'last' for a car you don't own). The caller checks reach; this checks amounts and storage rules.
  keyOf(L) { if (!L) return null; if (L.key === 'inv') return 'me'; if (L.prop) return this.canHoldCash(L.prop) ? 'p:' + L.prop : null; if (L.uid) return 'car:' + L.uid; if (L.veh) return 'live'; return null; },
  cashAt(L) { const k = this.keyOf(L); return k ? this._get(k, L.veh) : 0; },
  move(A, B, n) {
    const ka = this.keyOf(A), kb = this.keyOf(B);
    if (!ka || !kb || (ka === kb && (ka !== 'live' || A.veh === B.veh)) || !okAmount(n)) return 0;
    const m = Math.min(Math.round(n * 100) / 100, this._get(ka, A.veh)); if (!(m > 0)) return 0;
    this._set(ka, this._get(ka, A.veh) - m, A.veh); this._set(kb, this._get(kb, B.veh) + m, B.veh);
    if (ka === 'me' || kb === 'me') this._emit('dirty', kb === 'me' ? m : -m, 'move');
    return m;
  },
  // police take what you carry and what is in the car you were caught in (§2). Stashes, vaults and the bank stay.
  seize(veh) {
    let n = this._get('me'); this._set('me', 0);
    if (veh) { if (veh.garageUid) { n += this.dirtyInCar(veh.garageUid); this._set('car:' + veh.garageUid, 0); } else { n += +veh.cash || 0; delete veh.cash; } }
    if (n > 0) this._emit('dirty', -n, 'seized');
    return n;
  },
  // a live car you don't own that becomes yours keeps the cash in it; a car you own that leaves your fleet hands
  // its cash to whoever is selling it (you, in person)
  adoptCar(v, uid) { const c = +v.cash || 0; delete v.cash; if (c > 0) this.W.dirty.veh[uid] = Math.round(((this.W.dirty.veh[uid] || 0) + c) * 100) / 100; },
  emptyCar(uid, v) { let c = 0; if (uid) { c = this.dirtyInCar(uid); this._set('car:' + uid, 0); } else if (v) { c = +v.cash || 0; delete v.cash; } if (c > 0) { this.W.dirty.me += c; this._emit('dirty', c, 'move'); } return c; },
  // crew theft takes Dirty Cash only from the stashes the crew can reach (warehouse vaults, safehouses), never
  // from your pockets or the bank (§45.18). frac of what they can reach, plus a flat amount, up to cap.
  crewTheft(frac, plus, cap) {
    const keys = this.payrollOrder().filter(k => k !== 'me');
    const reach = keys.reduce((a, k) => a + this._get(k), 0);
    const want = Math.round(Math.min(reach * frac + plus, cap, reach) * 100) / 100;
    if (!(want > 0)) return 0;
    let left = want;
    for (const k of keys) { if (left <= 0) break; const have = this._get(k), a = Math.min(have, left); this._set(k, have - a); left = Math.round((left - a) * 100) / 100; }
    const uw = this.uw; if (uw && uw.S && uw.S.ledger) uw.S.ledger.exp.theft = (uw.S.ledger.exp.theft || 0) + Math.round(want);
    return want;
  },
  // a property you no longer own: its cash comes with you if you are there, otherwise it is gone with the place
  dropProp(id) { const c = this.dirtyAtProp(id); this._set('p:' + id, 0); return c; },
  // display helpers: the balance that matters for a cost of this source, as HTML
  html(src) {
    const S = MONEY_SOURCES[src], W = this.W, b = v => `<b class="money">${fmtMoney(v)}</b>`;
    const mode = S ? (S.pay || S.earn) : 'either';
    if (mode === 'clean' || mode === 'medical') return `Bank ${b(W.clean)}${W.debt > 0 ? ` · debt ${fmtMoney(W.debt)}` : ''}`;
    if (mode === 'dirty' || mode === 'me') return `Cash on you ${b(W.dirty.me)}`;
    if (mode === 'payroll' || mode === 'stash') return `Dirty reserve ${b(this.payrollReserve())}`;
    return `Cash ${b(W.dirty.me)} · Bank ${b(W.clean)}`;
  }
};
