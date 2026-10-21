/* =====================================================================
   [UNDERWORLD] POLICE PRESSURE & CORRUPTION: the long-term heat on the
   player (separate from the wanted stars of a single chase), per-turf
   police presence, dirty officers with real limits, honest officers who
   cannot be bought, outside task forces and political crackdowns.
   ===================================================================== */
// days added per offence (capped at six counts each); ordinary early mistakes stay short
const CRIME_DAYS = { hitped: 5, assault: 3, shoot: 8, carjack: 10, stealcop: 30, ramcop: 12, hitcop: 22, shootcop: 60, copcar: 45, explosion: 20, koped: 15, theft: 4, deal: 12, pickpocket: 2, robbery: 20, burglary: 6 };
class PressureSystem {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  // a paid officer's perks work unless an outside task force is in town
  perk(id) { const c = this.S.cops[id]; return !!(c && c.st === 'paid' && !(this.S.taskforce > 0)); }
  paidCount() { return Object.values(this.S.cops).filter(c => c.st === 'paid').length; }
  crime(type, sev, witnessed, x, z) {
    const uw = this.uw, S = this.S;
    const i = turfAt(x, z);
    let k = (CRIME_PRESSURE[type] || 1) * (witnessed ? 1 : 0.45);
    if (uw.owner[i] === 'pc' && this.perk('vale')) k *= 0.5;
    if (this.S.taskforce > 0) k *= 1.3;
    S.pressure = clamp(S.pressure + k, 0, 100);
    S.turfs[i].police = clamp(S.turfs[i].police + sev * 3, 0, 100);
    if (witnessed) { const r = S.rap.cur || (S.rap.cur = {}); r[type] = (r[type] || 0) + 1; }
    if (type === 'hitcop' || type === 'shootcop') S.rap.cops++;
    if (type === 'copcar') S.rap.copcars++;
  }
  onWanted(level) { this.S.pressure = clamp(this.S.pressure + level * 1.4, 0, 100); const r = this.S.rap; r.maxLvl = Math.max(r.maxLvl || 0, level); }
  // gunfire between gangs: the police notice the block, and the player if their crew pulled a trigger
  streetViolence(x, z, byCrew) {
    const S = this.S, i = turfAt(x, z);
    S.turfs[i].police = clamp(S.turfs[i].police + 2, 0, 100);
    if (byCrew) this.uw.g.police.crime('shoot', x, z);
  }
  // multipliers the core police manager reads
  patrolMul(x, z) {
    const S = this.S, i = turfAt(x, z);
    let k = 1 + S.pressure / 60 + S.turfs[i].police / 120 + (S.crackdown > 0 ? 0.6 : 0) + (S.taskforce > 0 ? 0.4 : 0);
    if (this.uw.owner[i] === 'pc' && this.perk('bramford')) k *= 0.4;
    return k;
  }
  perceptionMul() { return 1 + this.S.pressure / 400 + (this.S.taskforce > 0 ? 0.15 : 0); }
  escapeMul() { let k = 1 + this.S.pressure / 300; if (this.perk('pike')) k *= 0.75; return k; }
  dispatchDelay(level, x, z) {
    let d = 0;
    if (level <= 2 && this.perk('pike')) d += 6;
    const zn = zoneKey(x, z);
    if (zn === 'o' && this.perk('kerr')) d += 3;
    if (zn === 'h' && this.perk('park')) d += 4;
    return d;
  }
  // friends in the department shorten sentences; since v6 every sentence is already halved, so the perks are milder
  // (Okoro ×0.85, Vale ×0.7) and together never take more than 40% off what pressure and the record set
  sentenceMul() { let k = 1 + this.S.pressure / 150, f = 1; if (this.perk('okoro')) f *= 0.85; if (this.perk('vale')) f *= 0.7; return k * Math.max(0.6, f); }
  // witnesses are less eager to call when the player owns the block and is feared
  witnessCallMul(x, z) {
    const uw = this.uw, i = turfAt(x, z);
    let k = 1;
    if (uw.owner[i] === 'pc') k *= uw.S.rankMax >= 4 ? 0.35 : 0.7; // the peak Rank: fear outlasts a downrank (§45.23)
    k *= 1 - Math.min(0.4, uw.influence / 2000);
    return k;
  }
  tickHours(h) {
    const S = this.S;
    for (const t of S.turfs) t.police = clamp(t.police - 0.15 * h, 0, 100);
  }
  tickDay() {
    const uw = this.uw, S = this.S, g = uw.g;
    let decay = 2.2 + (S.slept ? 3 : 0);
    if (this.perk('bramford')) decay += 2;
    if (this.perk('kerr') || this.perk('park')) decay += 0.4;
    if (this.perk('pike')) decay += 0.6;
    if (S.taskforce > 0) decay *= 0.4;
    if (S.jail) decay += 1.5;
    S.pressure = clamp(S.pressure - decay, 0, 100);
    S.pikeCD = Math.max(0, S.pikeCD - 1);
    // weekly payments to dirty cops; miss one and they turn on you
    for (const id in S.cops) {
      const c = S.cops[id], O = OFFICER_BY_ID[id];
      if (c.st === 'paid' && S.day >= c.due) {
        if (Money.pay(O.fee, 'bribe')) c.due = S.day + 7;
        else { c.st = 'burned'; c.until = S.day + 14; S.pressure = clamp(S.pressure + 8, 0, 100); uw.news('unknown', `${O.name} wasn’t paid and stopped answering. Pressure is up.`); }
      }
      if (c.st === 'burned' && S.day >= c.until) delete S.cops[id];
    }
    // outside investigators: sustained heat or too many dirty cops on the books
    S.hiPressDays = S.pressure > 85 ? S.hiPressDays + 1 : 0;
    if (S.taskforce > 0) { S.taskforce--; if (!S.taskforce) uw.news('pv', 'Valen Courier: the state task force has packed up and gone home.'); }
    else if (S.hiPressDays >= 3 || (this.paidCount() >= 4 && Math.random() < 0.05)) {
      S.taskforce = 6; S.hiPressDays = 0;
      uw.news('pv', 'Valen Courier: a state organized-crime task force has arrived in Port Valen. Sgt. Lena Moss is assigned as local liaison.');
      uw.opps.add({ kind: 'taskforce', title: 'State task force in town', text: 'For six days your paid officers can’t help you, heat sticks, and stashes are more likely to be raided. Lie low.', hours: 144, urgent: true });
      // one of your dirty cops gets picked up and talks
      const paid = Object.keys(S.cops).filter(k => S.cops[k].st === 'paid');
      if (paid.length && Math.random() < 0.5) { const id = pick(paid); S.cops[id].st = 'burned'; S.cops[id].until = S.day + 30; S.pressure = clamp(S.pressure + 18, 0, 100); uw.news('unknown', `${OFFICER_BY_ID[id].name} was arrested by the task force and is cooperating. Expect questions.`); }
    }
    // political pressure: too much gang war in the papers means a crackdown
    if (S.crackdown > 0) S.crackdown--;
    else if (S.warHours > 70) { S.crackdown = 3; S.pressure = clamp(S.pressure + 5, 0, 100); uw.news('pv', 'Valen Courier: the mayor orders a crackdown after a week of gang violence. Extra patrols on every street.'); }
    S.warHours = 0;
  }
  canApproach(O) { return this.uw.rank >= O.minRank; }
  approach(id) {
    const uw = this.uw, S = this.S, g = uw.g, O = OFFICER_BY_ID[id];
    if (!O) return '';
    const c = S.cops[id];
    if (c && c.st === 'paid') return 'Already on your payroll.';
    if (c) return 'They won’t take your call.';
    if (!this.canApproach(O)) return `You’re not big enough for ${O.name} to risk it. (${RANKS[O.minRank].name})`;
    if (S.taskforce > 0) return 'Nobody at the precinct will touch your money while the task force is here.';
    if (!Money.can(O.fee, 'bribe')) return `The first envelope is ${fmtMoney(O.fee)} in Dirty Cash.`;
    if (Math.random() < O.honest) {
      S.cops[id] = { st: 'refused', due: 0, until: 0 };
      S.pressure = clamp(S.pressure + (O.honest >= 1 ? 15 : 9), 0, 100);
      uw.news('unknown', O.honest >= 1 ? `${O.name} reported the bribe attempt. Internal Affairs opened a file on you.` : `${O.name} turned you down flat — and mentioned it to a colleague.`);
      return O.honest >= 1 ? `${O.name} is honest. That was a mistake.` : `${O.name} said no.`;
    }
    Money.pay(O.fee, 'bribe');
    S.cops[id] = { st: 'paid', due: S.day + 7, until: 0 };
    uw.news('unknown', `${O.name}: “Same time every week. Don’t call me at the station.”`);
    g.audio.play('cash');
    return '';
  }
  drop(id) { const c = this.S.cops[id]; if (c && c.st === 'paid') { delete this.S.cops[id]; } }
  // Lt. Pike can point a narcotics raid at a rival every few days
  redirect(fid) {
    const S = this.S;
    if (!this.perk('pike')) return 'You need Lt. Pike on the payroll.';
    if (S.pikeCD > 0) return `Pike says wait ${S.pikeCD} more day${S.pikeCD > 1 ? 's' : ''}.`;
    if (!FACTIONS[fid] || S.factions[fid].broken) return 'Nobody to raid.';
    S.redirect = fid; S.pikeCD = 3;
    this.uw.news('unknown', `Pike: “Narcotics will be looking at the ${FACTIONS[fid].short} tomorrow. You didn’t hear it from me.”`);
    return '';
  }
}

