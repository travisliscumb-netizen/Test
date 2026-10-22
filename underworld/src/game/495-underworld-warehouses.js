/* =====================================================================
   [UNDERWORLD] WAREHOUSES (§5-§8, Session 3): the empire's hub. Each owned
   warehouse has four security categories (perimeter, surveillance, access
   control, vault/interior) bought up in tiers; its security level is 1 +
   the weakest of them. It has 15 crew slots (Enforcers guard it, Drivers
   run its logistics, a Lieutenant runs it and its district), a Dirty Cash
   vault whose capacity grows with the vault tier, and product storage.
   Dealers on turf sell only the stock on their corner, which the player
   brings by hand or a Driver brings from the warehouse that supplies them.
   State: save.uw.whse[id]. The compound you can walk and drive (fence, gate,
   cameras, rooms) is built from these tiers by CompoundSystem (Session 3B).
   ===================================================================== */
class WarehouseSystem {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  static freshState() { return { up: { perimeter: 0, surveillance: 0, access: 0, vault: 0 }, auto: true, breach: {}, passes: [] }; }
  static sanitize(all, num) {
    const out = {};
    if (!all || typeof all !== 'object' || Array.isArray(all)) return out;
    for (const id in all) {
      const d = PROP_BY_ID[id], w = all[id]; if (!d || d.kind !== 'warehouse' || !w || typeof w !== 'object') continue;
      const up = {}; for (const k of WH_CAT_IDS) up[k] = Math.floor(num(w.up && w.up[k], 0, 0, 4));
      // breaches (§45.26) and task passes (crew let in for one job) persist
      const breach = {};
      if (w.breach && typeof w.breach === 'object') for (const k in w.breach) { const b = w.breach[k]; if (!b || (b.s !== 'broken' && b.s !== 'patched') || !/^(gate|[nswe]:[\d.-]+:\d+)$/.test(k)) continue; breach[k] = { s: b.s, t: num(b.t, 0, 0, 1e9), tier: Math.floor(num(b.tier, 1, 1, 4)) }; if (b.w !== undefined) breach[k].w = num(b.w, 0, 0, 1e9); }
      const passes = (Array.isArray(w.passes) ? w.passes : []).filter(q => q && typeof q === 'object').slice(0, 20).map(q => ({ crew: Math.floor(num(q.crew, 0, 0, 1e7)), until: num(q.until, 0, 0, 1e9), why: typeof q.why === 'string' ? q.why.slice(0, 80) : 'a job' }));
      out[id] = { up, auto: w.auto !== false, breach, passes };
    }
    return out;
  }
  list() { return this.uw.props.ownedList().filter(d => d.kind === 'warehouse'); }
  st(id) { const S = this.S; if (!S.whse[id]) S.whse[id] = WarehouseSystem.freshState(); return S.whse[id]; }
  tier(id, cat) { return this.st(id).up[cat] | 0; }
  level(id) { const u = this.st(id).up; return 1 + Math.min(...WH_CAT_IDS.map(k => u[k] | 0)); }
  levelName(id) { return WH_LEVEL_NAME[this.level(id) - 1]; }
  vaultCap(id) { return WH_VAULT[this.tier(id, 'vault')]; }
  storeMul(id) { return WH_STORE_MUL[this.tier(id, 'vault')]; }
  upgradeCost(id, cat) { const t = this.tier(id, cat), d = PROP_BY_ID[id]; return t >= 4 || !d ? 0 : Math.round(d.price * WH_TIER_COST[t] / 500) * 500; }
  upgrade(id, cat) {
    const uw = this.uw, d = PROP_BY_ID[id];
    if (!d || d.kind !== 'warehouse' || !uw.props.owned(id)) return 'You don’t own it.';
    if (!WH_CATS[cat]) return 'Unknown upgrade.';
    const t = this.tier(id, cat); if (t >= 4) return 'Already the best there is.';
    const cost = this.upgradeCost(id, cat);
    if (!Money.can(cost, 'property')) return `The work costs ${fmtMoney(cost)} from your bank.`;
    Money.pay(cost, 'property');
    const lv0 = this.level(id); this.st(id).up[cat] = t + 1; const lv1 = this.level(id);
    if (uw.compounds) { uw.compounds.build(id); uw.compounds.refreshInterior(id); }
    uw.g.ui.banner(d.name, lv1 > lv0 ? `Security level ${lv1} · ${this.levelName(id)}` : `${WH_CATS[cat].name}: ${WH_CATS[cat].tiers[t + 1]}`, 'pass', 2.6);
    uw.g.audio.play('pass'); uw.g.autosave('Warehouse upgraded');
    return '';
  }
  // ---- crew. A crew member's assignment to a warehouse is the string 'w:<id>'
  static key(id) { return 'w:' + id; }
  static idOf(assign) { return typeof assign === 'string' && assign.startsWith('w:') ? assign.slice(2) : null; }
  crewAt(id, role) { const k = WarehouseSystem.key(id); return this.uw.crew.active().filter(c => c.assign === k && (!role || c.role === role)); }
  slotsUsed(id) { const k = WarehouseSystem.key(id); return this.S.crew.filter(c => c.status !== 'gone' && c.status !== 'dead' && c.assign === k).length; }
  // can crew member c take role at warehouse id? '' or why not
  canAssign(c, role, id) {
    const d = PROP_BY_ID[id];
    if (!d || d.kind !== 'warehouse' || !this.uw.props.owned(id)) return 'Pick one of your warehouses.';
    if (!WH_MAX[role]) return `A ${CREW_ROLES[role].name} doesn’t work out of a warehouse.`;
    const k = WarehouseSystem.key(id), here = this.S.crew.filter(o => o !== c && o.status !== 'gone' && o.status !== 'dead' && o.assign === k);
    if (here.length >= WH_SLOTS) return `${d.name} is full (${WH_SLOTS} people).`;
    if (here.filter(o => o.role === role).length >= WH_MAX[role]) return `${d.name} already has ${WH_MAX[role]} ${CREW_ROLES[role].name}${WH_MAX[role] > 1 ? 's' : ''}.`;
    return '';
  }
  // ---- defense and status
  defense(id) {
    const lv = this.level(id), enf = this.crewAt(id, 'enforcer'), lt = this.crewAt(id, 'lieutenant');
    return lv * 10 + enf.reduce((a, c) => a + 8 + c.skill / 10, 0) + lt.reduce((a, c) => a + 15 + c.skill / 10, 0);
  }
  // §6 normal-rival immunity: Maximum Security and minimum staffing. Not against exceptional threats (a gang-war
  // assault, police or a task force, betrayal, sabotage).
  immune(id) { return this.level(id) >= WH_IMMUNE.level && this.crewAt(id, 'enforcer').length >= WH_IMMUNE.enforcers && this.crewAt(id, 'lieutenant').length >= WH_IMMUNE.lieutenants; }
  // an operating warehouse: run by a Lieutenant with at least one Driver (City Kingpin's infrastructure, DC-25)
  operating(id) { return this.uw.props.owned(id) && this.crewAt(id, 'lieutenant').length > 0 && this.crewAt(id, 'driver').length > 0; }
  operatingCount() { return this.list().filter(d => this.operating(d.id)).length; }
  // the warehouse that supplies a dealer: the one they were linked to, else the nearest you own
  supplierOf(c) {
    const own = this.list(); if (!own.length) return null;
    if (c.from && own.some(d => d.id === c.from)) return c.from;
    if (typeof c.assign !== 'number') return null;
    const t = this.uw.T[c.assign]; let best = null, bd = Infinity;
    for (const d of own) { const L = this.uw.loc('prop', d.id); if (!L) continue; const dd = dist2(L.x, L.z, t.deal.x, t.deal.z); if (dd < bd) { bd = dd; best = d.id; } }
    return best;
  }
  // ---- dealer stock on a turf's corner
  turfStock(i) { const S = this.S; return S.turfStock[i] || (S.turfStock[i] = {}); }
  turfFree(i) { return TURF_STOCK_CAP - units(this.turfStock(i)); }
  dealersOn(i) { return this.uw.crew.active().filter(c => c.role === 'dealer' && c.assign === i); }
  // ---- Lieutenant automation (daily): each warehouse with a Lieutenant sends its idle Drivers to top up the
  // corners of the dealers it supplies, from its own storage (a supply run's purchase comes from its vault first)
  automate() {
    const uw = this.uw, S = this.S, DM = uw.runs, out = [];
    for (const d of this.list()) {
      const id = d.id; if (!this.st(id).auto || !this.crewAt(id, 'lieutenant').length) continue;
      const drivers = this.crewAt(id, 'driver').filter(c => !S.runs.some(r => r.crew === c.id));
      if (!drivers.length) continue;
      const turfs = [...new Set(uw.crew.active().filter(c => c.role === 'dealer' && typeof c.assign === 'number' && this.supplierOf(c) === id).map(c => c.assign))];
      turfs.sort((a, b) => units(this.turfStock(a)) - units(this.turfStock(b)));
      for (const i of turfs) {
        if (!drivers.length) break;
        const have = units(this.turfStock(i)) + S.runs.filter(r => r.to === 'turf:' + i).reduce((a, r) => a + r.n * GOODS[r.good].size, 0);
        if (have >= TURF_STOCK_TARGET) continue;
        const z = uw.T[i].zone, st = S.storage[id] || {};
        const goods = GOOD_IDS.filter(k => Inv.has(st, k) > 0 && !GOODS[k].fence && !GOODS[k].arms).sort((a, b) => uw.market.price(z, b) - uw.market.price(z, a));
        if (!goods.length) continue;
        const k = goods[0], n = Math.min(Inv.has(st, k), Math.floor((TURF_STOCK_TARGET - have) / GOODS[k].size));
        if (n <= 0) continue;
        const c = drivers.shift();
        const r = DM.dispatch(c.id, id, 'turf:' + i, k, n, { auto: true });
        out.push(r || `${c.name.split(' ')[0]} → ${uw.T[i].name}`);
      }
      // the warehouse itself runs low: a free Driver buys more from a supplier who deals with you, paid from the
      // vault (supplier → warehouse, §8). Only product its Dealers sell, and only while it is below the reorder line.
      if (drivers.length && turfs.length) {
        const st = S.storage[id] || {}, have = GOOD_IDS.filter(k => !GOODS[k].fence && !GOODS[k].arms).reduce((a, k) => a + Inv.has(st, k) * GOODS[k].size, 0);
        if (have < WH_REORDER) {
          const known = SPOTS.filter(sp => sp.sells && sp.sells.length && (uw.g.save.rep >= (sp.rep || 0) || (S.flags.intro && S.flags.intro[sp.id])));
          const z = uw.T[turfs[0]].zone, opts2 = [];
          for (const sp of known) for (const k of sp.sells) if (!GOODS[k].fence && !GOODS[k].arms) { const L = uw.loc('spot', sp.id); opts2.push({ sp, k, margin: uw.market.price(z, k) - uw.market.wholesale(L.zone, k) }); }
          opts2.sort((a, b) => b.margin - a.margin);
          for (const o of opts2) {
            const room = Math.floor(Math.min(WH_REORDER_LOT, uw.runs.freeAt(id)) / GOODS[o.k].size);
            if (room <= 0) break;
            const r = DM.dispatch(drivers[0].id, 'spot:' + o.sp.id, id, o.k, room, { auto: true });
            if (!r) { out.push(`${drivers.shift().name.split(' ')[0]} → ${o.sp.name}`); break; }
          }
        }
      }
    }
    return out;
  }
}
