/* =====================================================================
   [UNDERWORLD] TERRITORY ROYALTIES: groups that keep operating on a turf you
   control owe you a cut. What a turf yields depends on its district's wealth,
   how much rival business still runs there, your grip on it and the crew you
   keep on it. Early on payers drag their feet, short you, refuse or even
   test you; as your influence and power grow, paying becomes automatic, and
   once you run the city the small fry simply pay.
   ===================================================================== */
const ROY_STATUS = { paid: ['PAID', '#7fe08f'], late: ['LATE', '#ffd84d'], under: ['SHORT', '#ffb547'], refused: ['REFUSED', '#ff8a3d'], challenge: ['CHALLENGED', '#ff4d5e'], none: ['—', '#9aa3b2'] };
class RoyaltySystem {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  // the biggest rival still doing business on a turf you hold
  payer(i) { const inf = this.S.turfs[i].inf; let best = null, bv = 4; for (const k in inf) if (k !== 'pc' && FACTIONS[k] && !this.S.factions[k].broken && inf[k] > bv) { bv = inf[k]; best = k; } return best; }
  // the full daily cut a turf should yield (before compliance)
  owed(i) {
    const uw = this.uw, S = this.S, t = uw.T[i], inf = S.turfs[i].inf;
    if (uw.owner[i] !== 'pc') return 0;
    let rival = 0; for (const k in inf) if (k !== 'pc' && FACTIONS[k] && !S.factions[k].broken) rival += inf[k];
    const biz = uw.props.ownedList().filter(d => { const L = uw.loc('prop', d.id); return L && d.kind === 'business' && turfAt(L.x, L.z) === i; }).length;
    const wealth = ZONE_WEALTH[t.zone] || 1;
    const activity = clamp(0.25 + rival / 60 + biz * 0.2, 0.25, 2.2);
    const grip = clamp((inf.pc || 0) / 80, 0.3, 1.2);
    const enforce = 1 + (uw.crew.onTurf(i).length ? 0.35 : 0) + (uw.crew.active().some(c => uw.crew.ltZone(c) === t.zone) ? 0.2 : 0);
    return Math.round(260 * wealth * activity * grip * enforce / 10) * 10;
  }
  // how likely a payer is to pay in full and on time
  compliance(i, fid) {
    const uw = this.uw, ratio = uw.powerRatio(fid), att = uw.attitude(fid);
    let p = 0.32 + clamp((ratio - 1) * 0.22, -0.2, 0.45) + uw.influence / 1000 * 0.35 + (uw.crew.onTurf(i).length ? 0.12 : 0);
    if (att === 'fearful' || att === 'friendly') p += 0.25;
    if (att === 'hostile') p -= 0.2;
    if (uw.kingpin()) p = Math.max(p, ratio > 1.5 ? 0.97 : 0.88); // the city knows who runs it
    return clamp(p, 0.08, 0.99);
  }
  tickDay() {
    const uw = this.uw, S = this.S; let total = 0, refused = 0;
    for (let i = 0; i < uw.T.length; i++) {
      const r = S.roy[i] || (S.roy[i] = { owed: 0, late: 0, status: 'none', payer: null, last: 0 });
      if (uw.owner[i] !== 'pc') { if (r.status !== 'none') { r.status = 'none'; r.owed = 0; r.late = 0; r.last = 0; } continue; }
      const fid = this.payer(i); r.payer = fid;
      let due = this.owed(i) + r.owed; r.owed = 0;
      // inside (M13, §45.8): only a Lieutenant collects, and only part of it reaches you
      if (S.jail) due = uw.crew.active().some(c => uw.crew.ltZone(c) === uw.T[i].zone) ? Math.round(due * JAIL_OPS.royLt / 10) * 10 : 0;
      if (!fid) { // nobody else operating here: your own street businesses pay a smaller protection cut
        const own = Math.round(due * 0.35 / 10) * 10; r.status = own > 0 ? 'paid' : 'none'; r.last = own; total += own; continue;
      }
      const p = this.compliance(i, fid), x = Math.random(), f = S.factions[fid];
      if (x < p) { r.status = 'paid'; r.last = due; r.late = 0; total += due; }
      else {
        const y = (x - p) / (1 - p), strong = f.strength > 55 && uw.powerRatio(fid) < 1.2 && FACTIONS[fid].aggression > 0.45;
        if (y < 0.4) { r.status = 'late'; r.owed = Math.round(due * 1.1); r.late++; r.last = 0; if (r.late >= 3) { r.status = 'refused'; r.owed = 0; r.late = 0; f.rel = clamp(f.rel - 4, -100, 100); refused++; } }
        else if (y < 0.7) { const part = Math.round(due * rand(0.4, 0.7) / 10) * 10; r.status = 'under'; r.last = part; total += part; }
        else if (y < 0.93 || !strong) { r.status = 'refused'; r.last = 0; f.rel = clamp(f.rel - 3, -100, 100); refused++; }
        else { // a challenge: they push back on the turf itself
          r.status = 'challenge'; r.last = 0;
          if (!S.turfs[i].war) { S.turfs[i].war = { a: fid, d: 'pc', hrs: 18 }; uw.news('unknown', `The ${FACTIONS[fid].short} won’t pay on ${uw.T[i].name}. They’re pushing back. Defend it.`); }
        }
      }
      if (r.status === 'refused' && fid) uw.opps.add({ kind: 'retaliate', title: `${FACTIONS[fid].short} won’t pay`, text: `They stopped paying their cut on ${uw.T[i].name}. Lean on their crew there and the money starts again.`, fid, turf: i, x: uw.T[i].hang.x, z: uw.T[i].hang.z, hours: 30 });
    }
    if (total > 0) { Money.earn(total, 'royalty'); S.st.royalties = (S.st.royalties || 0) + total; }
    if (refused && uw.influence < 600) uw.news('pv', `${refused} crew${refused > 1 ? 's' : ''} refused to pay their cut on your turf.`);
    return total;
  }
  // a quick read for the map / turf card
  card(i) {
    const r = this.S.roy[i], own = this.uw.owner[i] === 'pc';
    if (!own) return null;
    const fid = this.payer(i);
    return { expected: this.owed(i), last: r ? r.last : 0, status: r ? r.status : 'none', payer: fid, compliance: fid ? this.compliance(i, fid) : 1 };
  }
}

