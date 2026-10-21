/* =====================================================================
   [UNDERWORLD] LAUNDERING FIXER (§45.6, §45.22): the early, low-capacity
   way to turn Dirty Cash into Clean Bank before you own a front. You hand
   Dina Vance cash in person; she keeps her fee and puts the rest in your
   bank half an economic day later, at most so much a day. Money with her
   is not on you: an arrest can't seize it, and it still arrives while you
   are inside. State lives in save.uw.fixer; time is the economic clock.
   ===================================================================== */
class LaunderFixer {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  get F() { return this.S.fixer; }
  static fresh() { return { day: 0, used: 0, batches: [], next: 1, washed: 0, fees: 0 }; }
  static sanitize(f, num) {
    const d = LaunderFixer.fresh();
    if (!f || typeof f !== 'object') return d;
    const out = { day: Math.floor(num(f.day, 0, 0, 1e7)), used: num(f.used, 0, 0, FIXER_DAY_CAP), next: Math.floor(num(f.next, 1, 1, 1e9)), washed: num(f.washed, 0, 0, 1e15), fees: num(f.fees, 0, 0, 1e15), batches: [] };
    for (const b of Array.isArray(f.batches) ? f.batches : []) {
      if (!b || typeof b !== 'object') continue;
      // never more out than her fee allows for what went in
      const dirty = Math.floor(num(b.dirty, 0, 0, FIXER_DAY_CAP)), clean = num(b.clean, 0, 0, LaunderFixer.quote(dirty).clean);
      if (!(clean > 0)) continue;
      out.batches.push({ id: Math.floor(num(b.id, 0, 0, 1e9)), dirty, clean, due: num(b.due, 0, 0, 1e9) });
    }
    out.batches = out.batches.slice(0, 20);
    out.next = Math.max(out.next, ...out.batches.map(b => b.id + 1), 1);
    return out;
  }
  // the economic day the capacity counts against (24 economic hours)
  econDay() { return Math.floor(this.S.econH / 24); }
  capacityLeft() { const F = this.F; return F.day === this.econDay() ? Math.max(0, FIXER_DAY_CAP - F.used) : FIXER_DAY_CAP; }
  // what you would get for n and when, without doing it
  static quote(n) { const fee = Math.round(n * FIXER_FEE); return { dirty: n, fee, clean: n - fee }; }
  quote(n) { return LaunderFixer.quote(n); }
  // how much of n she would take right now, and why not more
  limit(n) {
    const have = Money.available('launderIn'), cap = this.capacityLeft();
    const take = Math.floor(Math.min(n, have, cap));
    if (cap < FIXER_MIN) return { take: 0, why: 'That’s all she’ll wash today. Come back tomorrow.' };
    if (have < FIXER_MIN) return { take: 0, why: `She doesn’t get out of bed for less than ${fmtMoney(FIXER_MIN)}. Bring cash, on you.` };
    if (take < FIXER_MIN) return { take: 0, why: `At least ${fmtMoney(FIXER_MIN)}.` };
    return { take, why: '' };
  }
  // hand her cash. Returns the batch, or a reason string
  hand(n) {
    const uw = this.uw, F = this.F;
    if (uw.inJail) return 'Not from a cell.';
    const L = this.limit(n);
    if (!L.take) return L.why;
    const q = this.quote(L.take);
    if (Money.pay(q.dirty, 'launderIn') !== q.dirty) return 'You don’t have it on you.';
    const day = this.econDay(); if (F.day !== day) { F.day = day; F.used = 0; }
    F.used += q.dirty;
    const b = { id: F.next++, dirty: q.dirty, clean: q.clean, due: this.S.econH + FIXER_DELAY };
    F.batches.push(b);
    uw.g.autosave('Cash with the fixer');
    return b;
  }
  // economic hours until a batch arrives, shown as world hours at the current pace
  hoursLeft(b) { return Math.max(0, (b.due - this.S.econH) / this.uw.econRate()); }
  pending() { return this.F.batches.reduce((a, b) => a + b.clean, 0); }
  // called from Underworld.tickHours after the economic clock moves
  tick() {
    const uw = this.uw, F = this.F, now = this.S.econH;
    const due = F.batches.filter(b => b.due <= now + 1e-9);
    if (!due.length) return;
    F.batches = F.batches.filter(b => b.due > now + 1e-9);
    for (const b of due) {
      const got = Money.earn(b.clean, 'launderOut');
      F.washed += b.dirty; F.fees += b.dirty - b.clean;
      uw.news('Dina', `It’s done. ${fmtMoney(got)} is in your bank, clean as a whistle. Pleasure doing business.`);
    }
  }
}
