/* =====================================================================
   [UNDERWORLD] PROPERTY & BUSINESSES: safehouses (save, rest, storage,
   wardrobe), garages, warehouses and front businesses (income, storage,
   crew room, laundering, recruiting, fencing, respray).
   ===================================================================== */
class PropertyManager {
  constructor(uw) { this.uw = uw; this.raidChanceBonus = 0; }
  get S() { return this.uw.S; }
  owned(id) { const o = this.S.props[id]; return !!(o && o.owned); }
  ownedList() { return PROPS.filter(p => this.owned(p.id)); }
  // what owned property on a turf adds to your side of a showdown there: 6 for the first, half as much again for each
  // further one, never more than PROP_PRESENCE_MAX (§45.23: stacking property can't make a turf invincible)
  presenceDefense(i) { let n = 0; for (const p of this.ownedList()) { const L = this.uw.loc('prop', p.id); if (L && turfAt(L.x, L.z) === i) n++; } return n ? Math.min(PROP_PRESENCE_MAX, PROP_PRESENCE * (2 - Math.pow(0.5, n - 1))) : 0; }
  presence(i) { for (const p of this.ownedList()) { const L = this.uw.loc('prop', p.id); if (L && turfAt(L.x, L.z) === i) return true; } return false; }
  // stash space: a storage business grows with its level; a home in the Docklands holds a quarter more
  storageCap(id) {
    const d = PROP_BY_ID[id]; if (!d) return 0;
    if (d.kind === 'business' && d.cat && BIZ_CATS[d.cat].perk === 'storage') return BIZ_CATS[d.cat].lv[Math.max(1, this.level(id)) - 1];
    // a warehouse's floor grows with its vault and interior tier (§7)
    if (d.kind === 'warehouse') return Math.round((d.storage || 0) * (this.owned(id) ? this.uw.whse.storeMul(id) : 1));
    const hood = d.kind === 'safehouse' ? this.hoodOf(d) : null;
    return Math.round((d.storage || 0) * (hood && hood.store ? hood.store : 1));
  }
  hoodOf(d) { const L = this.uw.loc('prop', d.id); return L ? HOOD[L.zone] || null : null; }
  // ---- v6 business levels and perks
  level(id) { const o = this.S.props[id]; return o && o.owned ? clamp((o.lvl | 0) || 1, 1, 3) : 0; }
  manager(id) { return this.uw.crew.active().find(c => c.role === 'manager' && c.assign === id) || null; }
  // how established a business is, 0..1 (§45.7): nothing for its first BIZ_EST_DAYS days, then rising to full over
  // BIZ_EST_RAMP days. Only influence reads it; income and the other perks start on day one.
  established(id) { const o = this.S.props[id]; return o && o.owned ? clamp((this.S.day - o.since - BIZ_EST_DAYS) / BIZ_EST_RAMP, 0, 1) : 0; }
  // what every business you own of a kind adds up to (its level's value; damaged ones half; a manager +10%)
  perk(name) {
    let v = 0;
    for (const def of this.ownedList()) {
      if (def.kind !== 'business' || !def.cat) continue;
      const C2 = BIZ_CATS[def.cat], lv = this.level(def.id);
      let x = C2.perk === name ? C2.lv[lv - 1] : 0;
      if (name === 'crewRoom' && def.cat === 'gym') x += lv;            // the gym's back room
      if (name === 'delivery' && def.cat === 'arcade') x += 0.02 * lv;  // kids who know the streets
      if (name === 'delivery' && def.cat === 'logistics') x += 0.03 * lv;
      if (name === 'repair' && def.cat === 'bodyshop') x += 0.1;
      if (name === 'infl' && def.cat === 'hotel') x += 8 * lv;
      if (name === 'infl' && def.cat === 'nightclub') x += 5 * (lv - 1);
      if (!x) continue;
      if (name === 'infl') x *= this.established(def.id);
      if (this.S.props[def.id].dmg) x *= 0.5;
      if (this.manager(def.id)) x *= 1.1;
      v += x;
    }
    return Math.min(v, PERK_CAP[name] !== undefined ? PERK_CAP[name] : Infinity);
  }
  // one business's money per day at its level (before the luck of the day), and its running costs
  bizDay(def) {
    const uw = this.uw, S = this.S, o = S.props[def.id], C2 = BIZ_CATS[def.cat] || { inc: [1, 1, 1] };
    const lv = Math.max(1, this.level(def.id)), L = uw.loc('prop', def.id), i = L ? turfAt(L.x, L.z) : 0, own = uw.owner[i];
    let k = own === 'pc' ? 1.25 : !own ? 1 : uw.contested[i] ? 0.6 : 0.78;
    const mgr = this.manager(def.id);
    if (mgr) k *= 1.15 + mgr.skill / 400;
    for (const c of uw.crew.active()) if (L && uw.crew.ltZone(c) === L.zone) k *= 1.1;
    if (o && o.dmg > 0) k *= 0.4;
    if (S.pressure > 70) k *= 0.85;
    if (def.id === 'club' || def.id === 'motel') { const v = S.factions.velvet; if (!v.broken && v.rel < -40) k *= 0.8; }
    const gross = def.income * 1.2 * C2.inc[lv - 1] * k * (1 + this.perk('allIncome'));
    const upkeep = def.income * BIZ_UPKEEP[lv - 1] * (mgr ? 0.8 : 1);
    return { gross, upkeep, net: gross - upkeep, lv, own, mgr };
  }
  // what a business would make at level 1 if you bought it today
  bizPreview(def) {
    const uw = this.uw, L = uw.loc('prop', def.id), i = L ? turfAt(L.x, L.z) : 0, own = uw.owner[i];
    const k = (own === 'pc' ? 1.25 : !own ? 1 : uw.contested[i] ? 0.6 : 0.78) * (1 + this.perk('allIncome'));
    const gross = def.income * 1.2 * k, upkeep = def.income * BIZ_UPKEEP[0];
    return { gross, upkeep, net: gross - upkeep };
  }
  upgradeCost(id) { const d = PROP_BY_ID[id], lv = this.level(id); return d && d.kind === 'business' && lv >= 1 && lv < 3 ? bizUpgradeCost(d, lv) : 0; }
  upgrade(id) {
    const uw = this.uw, g = uw.g, d = PROP_BY_ID[id], o = this.S.props[id];
    if (!d || d.kind !== 'business' || !this.owned(id)) return 'You don’t own it.';
    const lv = this.level(id); if (lv >= 3) return 'Already fully developed.';
    const cost = this.upgradeCost(id);
    if (!Money.can(cost, 'property')) return `The work costs ${fmtMoney(cost)} from your bank.`;
    if (o.dmg) return 'Repair it first.';
    Money.pay(cost, 'property'); o.lvl = lv + 1;
    uw.computeInfluence();
    g.ui.banner(`${d.name}`, `${BIZ_LEVEL_NAME[lv]} · level ${lv + 1}`, 'pass', 2.6); g.audio.play('pass');
    if (g.bizSigns) g.bizSigns.refresh();
    g.autosave('Business upgraded');
    return '';
  }
  storageFree(id) { return this.storageCap(id) - units(this.S.storage[id]); }
  hasSafehouse() { return this.ownedList().some(p => p.kind === 'safehouse'); }
  price(def) {
    // high influence makes sellers cooperate; a hostile landlord gang makes them nervous; your own estate agents
    // find you a better deal
    const uw = this.uw, L = uw.loc('prop', def.id);
    let k = (1 - Math.min(0.2, uw.influence / 2500)) * (1 - this.perk('propDisc'));
    const own = L ? uw.owner[turfAt(L.x, L.z)] : null;
    if (own && own !== 'pc' && uw.attitude(own) === 'hostile') k *= 1.1;
    return Math.round(def.price * k / 50) * 50;
  }
  buy(id) {
    const uw = this.uw, g = uw.g, S = this.S, def = PROP_BY_ID[id];
    if (this.owned(id)) return 'You already own it.';
    const price = this.price(def);
    if (!Money.can(price, 'property')) return `It costs ${fmtMoney(price)} from your bank (property is bought with Clean Bank).`;
    if (def.kind === 'business' && g.save.rep < 300 && def.price > 20000) return 'The owner won’t sell to an unknown. (300 Rep)';
    if (def.luxury && uw.rank < 4) return `The building board turns you down. Come back when you’re somebody. (${RANKS[4].name})`;
    if (g.police.level > 0) return 'Not with the police on you.';
    Money.pay(price, 'property');
    S.props[id] = { owned: true, dmg: 0, since: S.day, lvl: 1 };
    if (!S.storage[id]) S.storage[id] = {};
    const L = uw.loc('prop', id), own = L ? uw.owner[turfAt(L.x, L.z)] : null;
    if (own && own !== 'pc' && FACTIONS[own]) { S.factions[own].rel -= 8; uw.news('unknown', `The ${FACTIONS[own].short} heard you bought ${def.name} on their turf. They’re not pleased.`); }
    // a purchase buys no Rep, no influence and no hold on the turf (§1, §45.7)
    if (def.id === 'penthouse') { g.save.owns.penthouse = true; g.content.ach('home'); }
    g.ui.banner('Property Acquired', def.name, 'pass', 3); g.audio.play('pass');
    uw.computeInfluence();
    g.autosave('Property purchased');
    return '';
  }
  garageActionFoot() {
    const g = this.uw.g, p = g.player;
    const gp = g.content.nearGarage(p.pos.x, p.pos.z, 3.2);
    if (gp) return { label: 'Garage', act: () => g.content.openGarage(gp) };
    return null;
  }
  doorAction(L) {
    const def = L.def, uw = this.uw;
    if (this.owned(def.id)) {
      if (def.interior) return null; // the interior door is handled by the interiors kit
      if (def.home) return { label: `Enter ${def.name}`, act: () => uw.g.content.enterHome(def.id) };
      if (def.kind === 'warehouse' && uw.compounds.R[def.id]) return { label: `Enter ${def.name}`, act: () => uw.compounds.enter(def.id) };
      return { label: def.name, act: () => uw.ui.openProp(def.id) };
    }
    return { label: `${def.name} · for sale ${fmtMoney(this.price(def))}`, act: () => uw.ui.openProp(def.id) };
  }
  interiorAction() { return null; }
  // a night's sleep in any owned safehouse: time passes, heat cools, the game saves
  sleep(id) {
    const uw = this.uw, g = uw.g, S = this.S;
    if (g.police.level > 0) { g.content.deny('You can’t sleep with sirens outside.'); return; }
    g.fade(() => {
      g.env.time = g.env.time < 7 ? 8 : (g.env.time < 19 ? 20 : 8);
      g.player.health = g.player.maxHealth; S.slept = true;
      for (const fid of FAC_IDS) if (uw.S.factions[fid]) { uw.S.factions[fid].aggro = 0; uw.S.factions[fid].trouble = 0; }
      uw.gangs.seen = {};
      S.pressure = clamp(S.pressure - 2, 0, 100);
      g.saveGame(true);
      g.ui.toast('Slept. Lying low cools things down. Game saved.', 'money');
    });
  }
  tickDay() {
    const uw = this.uw, S = this.S;
    for (const def of this.ownedList()) {
      if (def.kind !== 'business') continue;
      const B = this.bizDay(def);
      Money.earn(B.gross * rand(0.9, 1.1), 'business');
      Money.pay(Math.round(B.upkeep), 'upkeep', { partial: true });
      // protection money when it sits on someone else's turf (an accountant makes it smaller)
      if (B.own && B.own !== 'pc' && FACTIONS[B.own] && uw.attitude(B.own) !== 'fearful') { const fee = Math.round(def.income * 0.12 * (1 - this.perk('allIncome'))); const p = Money.pay(fee, 'protection', { partial: true }); S.factions[B.own].money += p; }
      if (B.mgr) S.pressure = clamp(S.pressure - 0.2, 0, 100);
    }
    // laundering and quiet funerals take the heat down
    S.pressure = clamp(S.pressure - this.perk('launder') - this.perk('heat'), 0, 100);
    // a decent meal and a place to sit keep the crew's morale up: a floor under it, capped like any money-bought
    // boost (§45.23), never loyalty itself
    const floor = Math.min(MORALE_CAP, this.perk('loyalty') * 10);
    if (floor > 0) for (const c of uw.crew.active()) c.morale = Math.max(c.morale, floor);
    this.policeRaids();
    this.raidChanceBonus = Math.max(0, this.raidChanceBonus - 0.1);
  }
  repairCost(def) { return Math.round(def.price * 0.12 / 10) * 10; }
  repair(id) { const g = this.uw.g, def = PROP_BY_ID[id], o = this.S.props[id]; if (!o || !o.dmg) return ''; const c = this.repairCost(def); if (!Money.can(c, 'property')) return `Repairs cost ${fmtMoney(c)} from your bank.`; Money.pay(c, 'property'); o.dmg = 0; g.audio.play('cash'); return ''; }
  policeRaids() {
    const uw = this.uw, S = this.S;
    for (const def of this.ownedList()) {
      const st = S.storage[def.id]; const n = units(st); if (!n) continue;
      const L = uw.loc('prop', def.id), i = turfAt(L.x, L.z);
      let p = Math.max(0, (S.pressure - 50) / 260) + S.turfs[i].police / 700 + this.raidChanceBonus + (S.taskforce > 0 ? 0.06 : 0);
      if (def.kind === 'business' && def.launder) p *= 0.7;
      if (def.kind === 'safehouse') { const h = HOOD[L.zone]; if (h) p *= h.raid; p *= [1.2, 1.2, 1, 0.85, 0.7, 0.55][clamp(def.sec || 1, 1, 5)]; }
      if (this.owned('security')) p *= 0.85;
      if (Math.random() >= p) continue;
      // tip-offs: a paid cop, a scout in the district, or what the barber, the salon and the security firm hear
      const scout = uw.crew.active().some(c => c.role === 'scout' && c.assign === L.zone);
      const tip = ((uw.cops.perk('kerr') || uw.cops.perk('okoro') || scout) && Math.random() < 0.7) || Math.random() < this.perk('intel');
      if (tip) { uw.news(scout ? 'pv' : 'unknown', `${scout ? 'Your scout' : 'Your friend at the precinct'} called it in time: police hit ${def.name} and found it clean. Stock was moved overnight.`); S.pressure = clamp(S.pressure - 3, 0, 100); continue; }
      const seizedList = goodsList(st);
      Inv.clear(st);
      S.pressure = clamp(S.pressure + 5, 0, 100); S.st.seized += n;
      uw.market.shock([L.zone], 'green', 0.15); uw.market.shock([L.zone], 'snow', 0.15);
      uw.news('radio', `Police radio: search warrant executed at ${def.name}. Evidence recovered.`);
      uw.news('pv', `Police raided ${def.name} and seized ${seizedList}.`);
      for (const c of uw.crew.active()) if ((c.role === 'dealer' || c.role === 'enforcer') && c.assign === i && Math.random() < 0.3) uw.crew.arrest(c, 'a raid on ' + def.name);
    }
  }
}

