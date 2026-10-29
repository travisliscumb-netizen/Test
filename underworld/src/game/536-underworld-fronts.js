/* =====================================================================
   [UNDERWORLD] FRONTS (M9, §26, §45.6): laundering through businesses you
   own. Any owned business with a laundering line (laundromat, boutique,
   car wash, construction firm: def.launder) washes Dirty Cash into Clean
   Bank through its books, at a much lower fee than the early fixer and
   at a capacity that grows with the business's level.
   - You put cash through the books in person at the business (carried
     Dirty Cash): it joins the front's float.
   - Each economic day the front washes up to its daily capacity from the
     float: the clean money (less the fee) lands in your bank.
   - A manager assigned to the business can keep the float topped up from
     your stashes and vaults (payroll order) and trims the fee: a managed
     front keeps working while you are in jail; an unmanaged one only
     washes what is already in its float.
   - Police raids on a front take half its float as evidence.
   - Buying a front buys no Rank, influence or turf (§45.7).
   State: save.uw.fronts[propId] = { float, washed, fees, auto }.
   ===================================================================== */
// the laundering ladder (M13): the fixer 32% → a front 25% → managed 20% → improved 15% (managed 10%) → fully
// developed 10% (managed 5%), with capacity growing at each level
const FRONT = { cap: [15000, 40000, 100000], fee: [0.25, 0.15, 0.10], mgrFee: 0.05, mgrCap: 1.2, min: 500, raidTake: 0.5 };
class Fronts {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  get F() { return this.S.fronts || (this.S.fronts = {}); }
  static sanitize(F, num) {
    const out = {};
    if (F && typeof F === 'object') for (const id in F) {
      const d = PROP_BY_ID[id], f = F[id]; if (!d || !d.launder || !f || typeof f !== 'object') continue;
      out[id] = { float: num(f.float, 0, 0, 1e12), washed: num(f.washed, 0, 0, 1e15), fees: num(f.fees, 0, 0, 1e15), auto: !!f.auto };
    }
    return out;
  }
  isFront(id) { const d = PROP_BY_ID[id]; return !!(d && d.launder && this.uw.props.owned(id)); }
  list() { return this.uw.props.ownedList().filter(d => d.launder); }
  st(id) { return this.F[id] || (this.F[id] = { float: 0, washed: 0, fees: 0, auto: false }); }
  // a day's washing capacity and the fee, by the business's level and whether a manager runs it
  cap(id) { const lv = Math.max(1, this.uw.props.level(id)); return Math.round(FRONT.cap[lv - 1] * (this.uw.props.manager(id) ? FRONT.mgrCap : 1)); }
  fee(id) { const lv = Math.max(1, this.uw.props.level(id)); return Math.max(0.05, Math.round((FRONT.fee[lv - 1] - (this.uw.props.manager(id) ? FRONT.mgrFee : 0)) * 100) / 100); }
  // how much more the float takes: up to two days of capacity waiting at once
  room(id) { return Math.max(0, this.cap(id) * 2 - this.st(id).float); }
  // put carried Dirty Cash through the books (in person); returns '' or why not
  deposit(id, n) {
    const uw = this.uw; if (!this.isFront(id)) return 'Not a front of yours.';
    if (uw.inJail) return 'Not from a cell.';
    const L = uw.loc('prop', id), p = uw.g.player; if (!L || Math.hypot(p.pos.x - L.x, p.pos.z - L.z) > 12) return 'Cash goes through the books in person: go to the business.';
    n = Math.floor(Math.min(n, this.room(id), Money.available('frontIn')));
    if (n < FRONT.min) return this.room(id) < FRONT.min ? 'The books can’t take more right now: let them wash what they have.' : `At least ${fmtMoney(FRONT.min)} in cash, on you.`;
    if (Money.pay(n, 'frontIn') !== n) return 'You don’t have it on you.';
    this.st(id).float += n;
    uw.g.autosave('Cash through the books');
    return '';
  }
  toggleAuto(id) { const f = this.st(id); if (!this.uw.props.manager(id)) return 'Only a manager can keep the float topped up.'; f.auto = !f.auto; return f.auto ? 'Your manager keeps the float topped up from your stashes.' : 'Top-ups off: only what you bring in gets washed.'; }
  // the economic day: managed fronts top up from your stashes, then every front washes up to its capacity
  tickDay() {
    const uw = this.uw;
    for (const d of this.list()) {
      const f = this.st(d.id), mgr = uw.props.manager(d.id);
      if (f.auto && mgr) { const want = Math.floor(Math.min(this.cap(d.id) - f.float, Money.available('frontAuto'))); if (want >= FRONT.min) f.float += Money.pay(want, 'frontAuto', { partial: true }); }
      const wash = Math.min(f.float, this.cap(d.id)); if (wash < 1) continue;
      const fee = Math.round(wash * this.fee(d.id)), clean = wash - fee;
      f.float -= wash; f.washed += wash; f.fees += fee;
      Money.earn(clean, 'frontOut');
    }
  }
  // a police raid on a front: half the float is evidence
  raided(id) { const f = this.F[id]; if (!f || f.float < 1) return 0; const take = Math.round(f.float * FRONT.raidTake); f.float -= take; return take; }
  html(id) {
    if (!this.isFront(id)) return '';
    const f = this.st(id), mgr = this.uw.props.manager(id), room = this.room(id), here = Money.available('frontIn');
    return `<h3>The books (laundering)</h3><div class="stats"><span>Washes a day</span><span>up to ${fmtMoney(this.cap(id))}</span><span>Fee</span><span>${Math.round(this.fee(id) * 100)}%${mgr ? ' (managed)' : ''}</span><span>Waiting in the float</span><span>${fmtMoney(f.float)}</span><span>Washed so far</span><span>${fmtMoney(f.washed)} (fees ${fmtMoney(f.fees)})</span></div>
      <div class="hint">Cash you put through the books is washed a day’s capacity at a time and arrives in your bank, less the fee. A manager can top the float up from your stashes, and keeps it going while you’re away. A police raid here takes half the float.</div>
      <div class="btns">${[5000, 20000, 50000].map(n => `<button class="sbtn gold" data-act="fdep:${n}" ${here >= Math.min(n, FRONT.min) && room >= FRONT.min ? '' : 'disabled'}>Put ${fmtMoney(Math.min(n, room))} through</button>`).join('')}<button class="sbtn" data-act="fdep:all" ${here >= FRONT.min && room >= FRONT.min ? '' : 'disabled'}>All I carry</button>${mgr ? `<button class="sbtn" data-act="fauto">${f.auto ? 'Manager top-ups: ON' : 'Manager top-ups: off'}</button>` : ''}</div>`;
  }
}
