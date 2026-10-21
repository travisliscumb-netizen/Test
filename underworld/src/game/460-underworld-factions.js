/* =====================================================================
   [UNDERWORLD] FACTIONS: five rival organizations that earn, recruit, move
   product, fight each other, lose leaders and get raided whether or not the
   player is watching. Everything they do feeds the market, the territory
   map, police pressure and the opportunities feed.
   ===================================================================== */
class FactionSim {
  constructor(uw) { this.uw = uw; }
  get S() { return this.uw.S; }
  F(id) { return this.S.factions[id]; }
  absHour() { return this.S.day * 24 + Math.floor(this.uw.g.env.time); }
  zonesOf(fid) { const out = new Set(); this.uw.owner.forEach((o, i) => { if (o === fid) out.add(this.uw.T[i].zone); }); return [...out]; }
  // the player's fighting strength on a turf, defending it or calling a showdown for it: the hold already there,
  // overall influence, crew on the turf and the district's Lieutenant, owned property there and the player in person
  playerDefense(i) {
    const uw = this.uw, S = this.S, t = uw.T[i], g = uw.g;
    let d = 8 + (S.turfs[i].inf.pc || 0) * 0.25 + uw.influence / 25;
    for (const c of S.crew) {
      if (c.status !== 'active') continue;
      if ((c.role === 'enforcer' || c.role === 'dealer') && c.assign === i) d += c.role === 'enforcer' ? 14 + c.skill / 6 : 5;
      if (c.role === 'lieutenant' && c.assign === t.zone) d += 10 + c.skill / 10;
    }
    for (const id in S.props) if (S.props[id].owned) { const L = uw.loc('prop', id); if (L && turfAt(L.x, L.z) === i) d += 6; }
    if (dist2(g.player.pos.x, g.player.pos.z, t.cx, t.cz) < 110 * 110 && !g.player.interior) d += 30;
    return d;
  }
  tickHours(h, hour) {
    const uw = this.uw, S = this.S;
    // income, product use and heat
    for (const id of FAC_IDS) {
      const f = this.F(id); if (f.broken) continue;
      const n = uw.factionTurfs(id);
      f.money += n * 55 * h * (f.stock > 0 ? 1.3 : 0.8) * (1 - f.heat / 260);
      f.stock = Math.max(0, f.stock - n * 0.45 * h);
      f.heat = clamp(f.heat - 0.35 * h + n * 0.04 * h, 0, 100);
    }
    // influence drift and wars, turf by turf
    for (let i = 0; i < uw.T.length; i++) {
      const T = S.turfs[i], own = uw.owner[i];
      for (const k in T.inf) {
        if (k === 'pc') continue;
        const f = this.F(k);
        if (!f || f.broken) { T.inf[k] *= Math.exp(-0.05 * h); continue; }
        if (k === own) { const tgt = clamp(28 + f.strength * 0.7, 30, 100); T.inf[k] += (tgt - T.inf[k]) * (1 - Math.exp(-0.02 * h)); }
        else T.inf[k] = Math.max(0, T.inf[k] - 0.12 * h);
        if (T.inf[k] < 0.05) delete T.inf[k];
      }
      // the player's hold fades without people on the ground
      if (T.inf.pc) { if (!uw.crew.presence(i) && !uw.props.presence(i)) { T.inf.pc = Math.max(0, T.inf.pc - 0.1 * h); if (T.inf.pc < 0.05) delete T.inf.pc; } }
      T.police = clamp(T.police - 0.18 * h, 0, 100);
      if (T.war) this.warStep(i, h);
    }
    // shipments arrive on the hour they were due
    const sh = S.shipment;
    if (sh && !sh.done && this.absHour() >= sh.at) this.landShipment();
  }
  // a turf war is the showdown (§4, §45.13): it ends with the attacker taking the turf or going home. The player
  // can be either side; a war the player called is w.a === 'pc'.
  warStep(i, h) {
    const uw = this.uw, S = this.S, T = S.turfs[i], w = T.war, pcA = w.a === 'pc', A = pcA ? null : this.F(w.a);
    if (!pcA && (!A || A.broken)) { T.war = null; return; }
    S.warHours += h;
    const powA = pcA ? this.playerDefense(i) * (0.6 + Math.random() * 0.8) : A.strength * (0.6 + Math.random() * 0.8);
    const powD = w.d === 'pc' ? this.playerDefense(i) * (0.6 + Math.random() * 0.8) : w.d && this.F(w.d) && !this.F(w.d).broken ? this.F(w.d).strength * (0.7 + Math.random() * 0.8) * 1.15 : 6;
    // a fight the player is physically in is decided by the bodies on the ground, not the dice
    const live = uw.gangs.warLive(i);
    const k = live ? 0.3 : 1;
    const delta = clamp((powA - powD) / 60, -1.5, 1.5) * 3 * h * k;
    uw.addInf(i, w.a, delta);
    if (w.d) uw.addInf(i, w.d, -delta * 0.9);
    if (A) A.strength = Math.max(0, A.strength - 0.22 * h * Math.random());
    if (w.d && w.d !== 'pc' && this.F(w.d)) this.F(w.d).strength = Math.max(0, this.F(w.d).strength - 0.2 * h * Math.random());
    if (w.d === 'pc' || pcA) uw.crew.warAttrition(i, h);
    T.police = clamp(T.police + 1.1 * h, 0, 100);
    if (A) A.heat = clamp(A.heat + 0.3 * h, 0, 100); else S.pressure = clamp(S.pressure + 0.15 * h, 0, 100);
    w.hrs -= h;
    const ia = T.inf[w.a] || 0, id = w.d ? (T.inf[w.d] || 0) : 0;
    if (w.hrs <= 0 || ia > id + 30 || ia < 5) {
      T.war = null;
      const won = ia > id, t = uw.T[i], aName = pcA ? 'you' : FACTIONS[w.a].short;
      if (w.d === 'pc') {
        uw.news('pv', won ? `The ${aName} pushed your people off ${t.name}.` : `Your crew held ${t.name} against the ${aName}.`);
        if (!won) { uw.addRep(30, null); this.F(w.a).rel -= 5; }
      }
      if (pcA && !won) {
        uw.news('pv', `Your push on ${t.name} failed${w.d ? '. The ' + FACTIONS[w.d].short + ' held it' : ''}.`);
        if (w.d && this.F(w.d)) this.F(w.d).rel -= 5;
      }
      if (won) uw.transferTurf(i, w.a, 'showdown');
      // a beaten attacker leaves a weak spot for somebody else
      else if (!pcA) uw.opps.add({ kind: 'instability', title: `${aName} bloodied`, text: `The ${aName} lost their push on ${t.name} and are short of soldiers.`, turf: i, x: t.hang.x, z: t.hang.z, hours: 24 });
    }
  }
  // a rival calls a showdown for a turf. opts.force ignores truces (a betrayal, a crew coming back from the dead)
  startWar(att, i, why, opts = {}) {
    const uw = this.uw, S = this.S, T = S.turfs[i];
    if (T.war) return false;
    const d = uw.owner[i];
    if (d === att) return false;
    if (!opts.force) {
      if (d && d !== 'pc' && this.F(d) && this.F(d).truce > S.day && this.F(att).truce > S.day) return false;
      if (d === 'pc' && this.F(att).truce > S.day) return false;
    }
    T.war = { a: att, d, hrs: 14 + Math.random() * 30 };
    uw.addInf(i, att, 12);
    const t = uw.T[i], A = FACTIONS[att];
    if (d === 'pc') {
      uw.opps.add({ kind: 'war', title: `${A.short} are moving on ${t.name}`, text: `${A.name} soldiers are hitting your turf in ${ZONES[t.zone].name}. Get there and defend it, or send enforcers.`, turf: i, x: t.hang.x, z: t.hang.z, hours: Math.ceil(T.war.hrs), urgent: true });
      uw.g.audio.play('wanted');
    } else uw.opps.add({ kind: 'war', title: `Turf war: ${A.short} vs ${d ? FACTIONS[d].short : 'locals'}`, text: `Fighting over ${t.name}. Both sides are bleeding: a good time to pick off the winner.${why ? ' ' + why : ''}`, turf: i, x: t.hang.x, z: t.hang.z, hours: Math.ceil(T.war.hrs) });
    return true;
  }
  tickDay() {
    const uw = this.uw, S = this.S, g = uw.g;
    const ptShare = uw.playerTurfs() / uw.T.length;
    const coalition = ptShare >= 0.35;
    if (coalition && !S.flags.coalition) { S.flags.coalition = 1; uw.news('unknown', 'The bosses met at a restaurant in Downtown last night. You weren’t invited. They’ve agreed you are the problem.'); uw.opps.add({ kind: 'coalition', title: 'Rival coalition', text: 'The remaining bosses are working together against you. Expect hits on your turfs and businesses.', hours: 72, urgent: true }); }
    if (!coalition && S.flags.coalition && ptShare < 0.25) { S.flags.coalition = 0; uw.news('unknown', 'The coalition fell apart. Old grudges won.'); }
    for (const id of FAC_IDS) {
      const f = this.F(id), D = FACTIONS[id];
      if (f.broken) {
        if (S.day - f.broken > 10) this.revive(id);
        continue;
      }
      const n = uw.factionTurfs(id);
      // recruit with money
      if (f.money > 2500 && f.strength < 110) { const spend = Math.min(f.money * 0.3, 15000); f.strength = Math.min(110, f.strength + spend / 1500 * (1 - f.strength / 125)); f.money -= spend; }
      // restock: Tidewater imports, everyone else buys (Tidewater gets paid)
      if (id !== 'tidewater') { const want = Math.max(0, 40 + n * 6 - f.stock); const tw = this.F('tidewater'); const ok = !tw.broken && tw.stock > want * 0.5; const buy = ok ? want : want * 0.3; f.stock += buy; f.money = Math.max(0, f.money - buy * 30); if (ok) { tw.stock -= buy * 0.6; tw.money += buy * 30; } }
      // their product on the street keeps supply up where they rule
      const zones = this.zonesOf(id);
      if (f.stock > 10) for (const z of zones) for (const k of D.goods) { const m = S.market[z][k]; m[0] = clamp(m[0] + 0.04, 0.25, 2.6); }
      // boss succession
      if (f.bossDown > 0) { f.bossDown--; if (f.bossDown === 0) { f.boss = D.lts[f.lt % D.lts.length]; f.lt++; uw.news('unknown', `${f.boss} has taken over the ${D.short}. The new boss is still finding their feet.`); } }
      // aggression: pick a fight on a border
      let aggr = D.aggression * (f.strength / 60) * (f.bossDown > 0 ? 0.3 : 1);
      if (coalition && !uw.kingpin()) aggr *= 1.6;
      if (Math.random() < aggr * 0.32) this.chooseWar(id, coalition);
      // relations drift back toward neutral unless they're fresh
      f.rel += (0 - f.rel) * 0.03; f.fear = Math.max(0, f.fear - 1);
      if (coalition && f.rel > -30) f.rel -= 2;
      // tribute & concessions when the player towers over them
      const ratio = uw.powerRatio(id);
      if (f.tribute > 0) { if (ratio < 1.6 || f.rel < -50) { f.tribute = 0; uw.news('unknown', `The ${D.short} stopped paying. They don’t think you can make them anymore.`); } else { const paid = Math.min(f.money, f.tribute); f.money -= paid; Money.earn(paid, 'tribute'); } }
      if (ratio > 3.6 && f.rel > -40 && !f.tribute && Math.random() < 0.25) this.cedeTurf(id);
      // police raids: their heat, a city crackdown, or a dirty lieutenant pointing the way
      let rp = 0.025 + f.heat / 500 + (S.crackdown > 0 ? 0.08 : 0);
      if (S.redirect === id) rp += 0.65;
      if (Math.random() < rp) this.raid(id, S.redirect === id ? 'tipped' : 'routine');
      if (S.redirect === id) S.redirect = null;
      // a broken organization
      if (f.strength < 6 && uw.factionTurfs(id) === 0) { f.broken = S.day; uw.news('unknown', `The ${D.name} are finished. What’s left of them scattered.`); uw.addRep(80, null); }
    }
    // Tidewater schedules the next boat
    if (!S.shipment || S.shipment.done) { if (!this.F('tidewater').broken && Math.random() < 0.55) this.scheduleShipment(); }
    // rivals sometimes hit the player's businesses
    uw.props.rivalAttacks(coalition);
  }
  chooseWar(id, coalition) {
    const uw = this.uw, S = this.S, f = this.F(id);
    const cands = [], pcWar = S.turfs.some(t => t.war && t.war.d === 'pc');
    for (let i = 0; i < uw.T.length; i++) {
      if (uw.owner[i] !== id) continue;
      for (const j of uw.turfNeighbors(i)) {
        const o = uw.owner[j]; if (o === id || S.turfs[j].war) continue;
        let score = 50 + Math.random() * 30;
        if (o === 'pc') {
          if (f.truce > S.day) continue;
          // power is a deterrent: the more the player outweighs them, the less they dare. Against the
          // city's kingpin a crew moves only out of a real grudge, or as part of a coalition when it
          // isn't hopelessly outmatched, and the coalition makes one push at a time.
          const ratio = uw.powerRatio(id), kp = uw.kingpin();
          if (kp && (pcWar || (ratio > 1.5 && f.rel > -60 && (!coalition || ratio > 2.5)))) continue;
          score += f.rel < -20 ? 30 : -15; if (coalition) score += kp ? 10 : 45; score -= this.playerDefense(j) * 0.6;
          score -= clamp((ratio - 1) * 35, 0, 90);
        }
        else if (o && this.F(o)) { if (this.F(o).truce > S.day && f.truce > S.day) continue; score -= this.F(o).strength * 0.5; }
        else score += 25; // neutral ground is cheap
        cands.push([j, score]);
      }
    }
    cands.sort((a, b) => b[1] - a[1]);
    if (cands.length && cands[0][1] > 30) this.startWar(id, cands[0][0]);
  }
  cedeTurf(id) {
    const uw = this.uw, D = FACTIONS[id];
    for (let i = 0; i < uw.T.length; i++) {
      if (uw.owner[i] !== id) continue;
      if (!uw.turfNeighbors(i).some(j => uw.owner[j] === 'pc')) continue;
      // an offer, not a handover: the turf is yours when you Take Turf there within three days (§45.13)
      const T = this.S.turfs[i]; if (T.war || T.offer) continue;
      T.offer = { fid: id, until: this.S.day + 3 }; T.inf[id] = Math.min(T.inf[id] || 0, 20);
      uw.news('unknown', `${this.F(id).boss}: “Take ${uw.T[i].name}. Consider it a gesture.” The ${D.short} are backing off. (Take Turf there within three days.)`);
      uw.opps.add({ kind: 'instability', title: `${D.short} offer ${uw.T[i].name}`, text: `The ${D.short} will step aside from ${uw.T[i].name}. Take Turf there (Empire → Turf map) within three days and it is yours without a fight.`, turf: i, x: uw.T[i].hang.x, z: uw.T[i].hang.z, hours: 72 });
      uw.recompute();
      return;
    }
  }
  raid(id, cause) {
    const uw = this.uw, S = this.S, f = this.F(id), D = FACTIONS[id], g = uw.g;
    const seized = Math.round(f.stock * 0.55);
    f.stock -= seized; f.strength *= 0.85; f.money *= 0.82; f.heat = Math.max(0, f.heat - 35);
    const zones = this.zonesOf(id);
    // the supply shock: their product vanishes from their streets (and spills over city-wide)
    for (const k of D.goods) { uw.market.shock(zones, k, 0.45); uw.market.shock(Object.keys(DEMAND).filter(z => !zones.includes(z)), k, 0.12); }
    // a raided turf loses its grip
    let hit = null;
    for (let i = 0; i < uw.T.length; i++) if (uw.owner[i] === id) { S.turfs[i].inf[id] = Math.max(0, (S.turfs[i].inf[id] || 0) - 18); S.turfs[i].police = clamp(S.turfs[i].police + 25, 0, 100); if (!hit || Math.random() < 0.3) hit = i; }
    // sometimes a lieutenant or the boss goes down with it
    if (Math.random() < 0.18 && f.bossDown === 0) { uw.news('pv', `Valen Courier: ${f.boss} arrested in a dawn raid.`); f.bossDown = randi(4, 8); }
    S.st.seized += seized;
    const good = D.goods[0], ex = uw.market.extremes(good);
    uw.news('radio', `Police radio: narcotics team executing warrants on ${D.name} locations${hit !== null ? ' around ' + uw.T[hit].name : ''}.`);
    uw.opps.add({ kind: 'scarcity', title: `${GOODS[good].name} shortage`, text: `Police seized ${D.short} product${cause === 'tipped' ? ' (your friend at the precinct pointed the way)' : ''}. ${GOODS[good].name} now sells for ${fmtMoney(ex.hi.p)} in ${ZONES[ex.hi.z].name}. If you’re sitting on stock, this is the moment.`, good, hours: 36 });
    if (hit !== null) uw.opps.add({ kind: 'instability', title: `${D.short} reeling in ${uw.T[hit].name}`, text: 'Their corner crew was hauled off. The turf is wide open for a day or two.', turf: hit, x: uw.T[hit].hang.x, z: uw.T[hit].hang.z, hours: 30 });
    if (hit !== null) uw.gangs.raidScene(hit, id);
  }
  bossDown(id, byPlayer) {
    const uw = this.uw, S = this.S, f = this.F(id), D = FACTIONS[id];
    if (f.bossDown > 0) return;
    f.bossDown = randi(3, 7); f.strength *= 0.72; f.fear = 100;
    for (let i = 0; i < uw.T.length; i++) if (S.turfs[i].inf[id]) S.turfs[i].inf[id] = Math.max(0, S.turfs[i].inf[id] - 14);
    if (byPlayer) {
      S.st.bossesBeaten++; S.infamy = Math.min(400, S.infamy + 60); uw.addRep(150, `${f.boss} put down`);
      f.rel = Math.min(f.rel - 50, -60);
      for (const o of FAC_IDS) if (o !== id) this.F(o).fear = Math.min(100, this.F(o).fear + 25);
      uw.g.ui.banner('Boss Down', `${f.boss} · ${D.name}`, 'pass', 3.5);
      uw.news('pv', `Valen Courier: ${f.boss} hospitalised after a beating outside their own headquarters. Nobody saw anything.`);
    }
    uw.opps.add({ kind: 'instability', title: `${D.short} leaderless`, text: `With ${f.boss} out, the ${D.short} are fighting over the chair for a few days. Their turfs are soft.`, hours: f.bossDown * 24 });
  }
  revive(id) {
    const uw = this.uw, S = this.S, f = this.F(id), D = FACTIONS[id];
    // regroup on neutral ground in their home district if there is any
    let spot = -1;
    for (let i = 0; i < uw.T.length; i++) if (uw.T[i].zone === D.home && uw.owner[i] !== 'pc' && !S.turfs[i].war) { spot = i; break; }
    if (spot < 0) for (let i = 0; i < uw.T.length; i++) if (!uw.owner[i] && !S.turfs[i].war) { spot = i; break; }
    if (spot < 0) { f.broken = S.day; return; }
    f.broken = 0; f.strength = 22; f.money = 8000; f.stock = 20; f.rel = -30; f.boss = D.lts[f.lt % D.lts.length]; f.lt++; f.bossDown = 0;
    uw.addInf(spot, id, 55);
    // they come back by fighting for the ground, like anyone else (§45.13)
    this.startWar(id, spot, 'They are back.', { force: true });
    uw.news('unknown', `The ${D.short} are back, under ${f.boss}. They’re fighting for ${uw.T[spot].name} and they remember you.`);
  }
  scheduleShipment() {
    const uw = this.uw, S = this.S;
    const piers = uw.T.filter(t => t.zone === 'h');
    const t = pick(piers);
    const at = (S.day + 1) * 24 + randi(19, 23);
    const cargo = { snow: randi(14, 28), hardware: randi(3, 8), smokes: randi(20, 40) };
    S.shipment = { at, turf: t.i, cargo, done: false, x: t.hang.x, z: t.hang.z };
    uw.opps.add({ kind: 'shipment', title: 'Tidewater boat due', text: `A Tidewater boat lands near ${t.name} tomorrow around ${String(at % 24).padStart(2, '0')}:00. The cargo goes to their HQ by van. Steal the van and the load is yours — they will not forget it.`, x: t.hang.x, z: t.hang.z, until: at + 3, turf: t.i });
  }
  landShipment() {
    const uw = this.uw, S = this.S, sh = S.shipment, g = uw.g, tw = this.F('tidewater');
    sh.done = true;
    if (tw.broken) return;
    const near = !g.player.interior && !S.jail && dist2(g.player.pos.x, g.player.pos.z, sh.x, sh.z) < 380 * 380;
    // port surveillance can seize the boat before it unloads
    const seizeP = 0.12 + (S.crackdown > 0 ? 0.2 : 0) + tw.heat / 400;
    if (Math.random() < seizeP) {
      uw.news('radio', 'Police radio: harbour unit has a vessel stopped at the piers. Customs are on the way.');
      for (const k in sh.cargo) uw.market.shock(Object.keys(DEMAND), k, 0.3);
      tw.money *= 0.9; tw.heat = clamp(tw.heat + 10, 0, 100);
      uw.opps.add({ kind: 'scarcity', title: 'Port seizure', text: 'Customs took a whole Tidewater boat. Snow and hardware are scarce city-wide for days.', good: 'snow', hours: 48 });
      return;
    }
    if (near) uw.gangs.spawnShipment(sh);
    else { tw.stock += units(sh.cargo); }
  }
}

