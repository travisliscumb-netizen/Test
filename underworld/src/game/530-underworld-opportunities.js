/* =====================================================================
   [UNDERWORLD] OPPORTUNITIES FEED: one list for rumours, scarcity, raids,
   rare cars, vulnerable shipments, turf instability, bounties and contacts.
   Nothing here is mandatory; everything comes from the simulation.
   ===================================================================== */
const OPP_ICON = { scarcity: '▲', demand: '$', shipment: '⚓', instability: '◆', war: '⚔', rarecar: '★', bounty: '✚', contract: '☎', race: '⚑', raidwarn: '!', taskforce: '!', coalition: '!', retaliate: '⚔' };
class OppFeed {
  // live cars for opportunities are kept here, never in the saved state
  constructor(uw) { this.uw = uw; this.mk = new Map(); this.cars = new Map(); this.carT = 0; }
  get S() { return this.uw.S; }
  absHour() { return this.S.day * 24 + Math.floor(this.uw.g.env.time); }
  add(o) {
    const S = this.S;
    o.id = S.nextOpp++;
    o.until = o.until || this.absHour() + (o.hours || 24);
    delete o.hours;
    // collapse duplicates (same kind and subject)
    S.opps = S.opps.filter(x => !(x.kind === o.kind && x.title === o.title));
    S.opps.push(o);
    if (S.opps.length > 30) S.opps.shift();
    if (!S.jail || S.jail.phone) { this.uw.g.ui.toast(`${OPP_ICON[o.kind] || '•'} ${o.title}`, o.urgent ? 'warn' : 'radio'); }
    this.rebuildMarkers();
    return o;
  }
  remove(o) { this.S.opps = this.S.opps.filter(x => x !== o); this.rebuildMarkers(); }
  rebuildMarkers() {
    const g = this.uw.g;
    for (const m of this.mk.values()) g.missions.markers.release(m);
    this.mk.clear();
  }
  active() { const h = this.absHour(); return this.S.opps.filter(o => o.until > h); }
  tickHours(h) {
    const now = this.absHour();
    const before = this.S.opps.length;
    this.S.opps = this.S.opps.filter(o => o.until > now - 1);
    if (this.S.opps.length !== before) this.rebuildMarkers();
  }
  tickDay() {
    const uw = this.uw, S = this.S;
    // demand hotspot: the district paying the most over normal for something
    let best = null;
    for (const z in DEMAND) for (const k of GOOD_IDS) { if (GOODS[k].fence || GOODS[k].arms) continue; const r = uw.market.ratio(z, k); if (!best || r > best.r) best = { z, k, r }; }
    if (best && best.r > 1.25) this.add({ kind: 'demand', title: `${ZONES[best.z].name} wants ${GOODS[best.k].name}`, text: `Street buyers in ${ZONES[best.z].name} are paying ${fmtMoney(uw.market.price(best.z, best.k))} a unit (${Math.round((best.r - 1) * 100)}% over normal).`, good: best.k, zone: best.z, hours: 30 });
    // a rare car somebody left parked
    if (Math.random() < 0.45) {
      const type = pick(['supercar', 'coupe', 'classic', 'luxury', 'sports', 'muscle']);
      const c = uw.g.world.randomCurbSpot(uw.g.player.pos.x, uw.g.player.pos.z, 300, 900);
      this.add({ kind: 'rarecar', title: `Rare car: ${VEHICLES[type].name}`, text: `A ${VEHICLES[type].name} has been parked in ${ZONES[zoneKey(c.x, c.z)].name} for days. Steal it for the chop shop, or keep it.`, x: c.x, z: c.z, h: c.h, type, hours: 48 });
    }
    // bounties: a faction at war pays you to hurt their enemy
    for (let i = 0; i < uw.T.length; i++) {
      const w = S.turfs[i].war; if (!w || !w.d || w.d === 'pc' || w.a === 'pc' || Math.random() > 0.5) continue;
      const payer = w.a, target = w.d;
      if (uw.attitude(payer) === 'hostile' || S.opps.some(o => o.kind === 'bounty' && o.turf === i)) continue;
      this.add({ kind: 'bounty', title: `${FACTIONS[payer].short} bounty on the ${FACTIONS[target].short}`, text: `${S.factions[payer].boss} pays ${fmtMoney(1500 + uw.rank * 600)} if you put three ${FACTIONS[target].short} soldiers on the ground in ${uw.T[i].name}.`, turf: i, payer, target, need: 3, got: 0, reward: 1500 + uw.rank * 600, x: uw.T[i].hang.x, z: uw.T[i].hang.z, hours: 30 });
      break;
    }
    // underground races and contact work, so the player hears about them
    if (Math.random() < 0.4) { const tull = uw.g.missions.contacts.find(c => c.id === 'tull'); if (tull) this.add({ kind: 'race', title: 'Races tonight in the Industrial Belt', text: '“Sprocket” Tull is running street races out of the Industrial Belt. Bring a fast car.', x: tull.x, z: tull.z, hours: 20 }); }
    if (Math.random() < 0.35) { const c = pick(uw.g.missions.contacts.filter(x => !x.storyOnly)); if (c) this.add({ kind: 'contract', title: `${c.name} has work`, text: `${c.name} (${c.role}) is offering paid jobs. Optional, as always.`, x: c.x, z: c.z, hours: 24 }); }
    // insider tips from a narcotics detective on the payroll
    if (uw.cops.perk('okoro') && Math.random() < 0.5) {
      const fid = pick(FAC_IDS.filter(f => !S.factions[f].broken));
      if (fid) { S.factions[fid].heat = clamp(S.factions[fid].heat + 40, 0, 100); this.add({ kind: 'raidwarn', title: `Raid planned on the ${FACTIONS[fid].short}`, text: `Okoro says narcotics are building a case on the ${FACTIONS[fid].name}. If it lands, ${FACTIONS[fid].goods.map(k => GOODS[k].name).join(' and ')} will get scarce. Stock up now.`, hours: 48 }); }
    }
  }
  onKill(p) {
    for (const o of this.S.opps) if (o.kind === 'bounty' && p.fac === o.target && turfAt(p.x, p.z) === o.turf) {
      o.got++;
      if (o.got >= o.need) {
        const uw = this.uw; Money.earn(o.reward, 'bounty'); uw.S.factions[o.payer].rel = clamp(uw.S.factions[o.payer].rel + 15, -100, 100); uw.S.factions[o.target].rel -= 10;
        uw.g.ui.toast(`Bounty paid by the ${FACTIONS[o.payer].short}: ${fmtMoney(o.reward)}.`, 'money'); uw.addRep(30, null);
        this.remove(o);
      } else uw_toastOnce(this.uw, `Bounty: ${o.got} / ${o.need}`);
      return;
    }
  }
  update(dt) {
    const uw = this.uw, g = uw.g, p = g.player, now = this.absHour();
    for (const o of this.S.opps) {
      if (o.until <= now) continue;
      // rare cars appear on the street when the player is near
      if (o.kind === 'rarecar' && !o.taken) {
        const d2 = dist2(o.x, o.z, p.pos.x, p.pos.z);
        let car = this.cars.get(o.id);
        if (car && (!g.vehicles.list.includes(car) || car.rareOpp !== o.id)) { this.cars.delete(o.id); car = null; }
        if (!car && d2 < 200 * 200 && !p.interior) { car = g.vehicles.spawn(o.type, o.x, o.z, o.h, { parked: true }); car.touched = true; car.rareOpp = o.id; this.cars.set(o.id, car); }
        if (car && p.vehicle === car) { o.taken = true; o.until = now; this.cars.delete(o.id); g.ui.toast(`You got the ${car.spec.name}. The chop shop will pay well; a garage will keep it.`, 'money'); }
      }
    }
    // world markers for the nearest few located opportunities
    this.carT -= dt; if (this.carT > 0) return; this.carT = 0.5;
    for (const [id, v] of this.cars) if (!g.vehicles.list.includes(v) || v.rareOpp !== id) this.cars.delete(id);
    const want = this.active().filter(o => o.x !== undefined && !o.taken && dist2(o.x, o.z, p.pos.x, p.pos.z) < 220 * 220).slice(0, 4);
    for (const [id, m] of this.mk) if (!want.find(o => o.id === id)) { g.missions.markers.release(m); this.mk.delete(id); }
    for (const o of want) if (!this.mk.has(o.id) && !p.interior) { const m = g.missions.markers.get(o.urgent ? 0xff4d5e : 0xd28cff, 2.2, true); m.g.position.set(o.x, groundY(o.x, o.z), o.z); this.mk.set(o.id, m); }
    if (p.interior) { for (const m of this.mk.values()) g.missions.markers.release(m); this.mk.clear(); }
  }
}
function uw_toastOnce(uw, text) { const g = uw.g; if (g.time - (uw._lastT || 0) > 1.5) { uw._lastT = g.time; g.ui.toast(text); } }

