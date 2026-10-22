/* =====================================================================
   [UNDERWORLD] VEHICLES AND THE LAW (§13, §14, §45.30; Session 5B)
   - HOT. A stolen car is HOT: the flag lives on its record in the
     VehicleRegistry (a tracked car's r.hot, a fleet car's e.hot), so it
     survives pursuits, parking and save/reload. Only the Chop Shop's
     Clean takes it away. Police recognise a HOT car only by looking at
     it: a unit or cop that can see it within HOT_T.range may run the
     plates (about a 1-star response). Nothing knows citywide.
   - Pay & Spray (Okafor Motor Works) sheds a live pursuit when no cop is
     watching, repairs and resprays; it never cleans HOT or makes a car
     legally yours.
   - The Chop Shop buys HOT cars (Dirty Cash), cleans their title (one
     time, a real free parking space required), repairs, resprays and
     tunes them. Never with the police on you.
   - The impound lot: a physical yard (a CompoundSystem compound in
     impound mode). Your car goes there when seized at an arrest, found
     abandoned on the street for about a day of the economic clock, or
     recovered by police in a pursuit. It waits in a numbered space,
     still in your fleet (its home bay kept), until you drive it out:
     legally, after paying the release fee at the window (Clean Bank,
     scaled by value, fixed when it was seized), or not, by picking the
     gate lock or ramming the gate, which the police hear about. A car
     taken out unpaid is HOT from then on (they know its plates).
   ===================================================================== */
const HOT_T = { range: 26, chance: 0.28, tick: 0.5, cool: 30, pursuit: 50, pursuitSeen: 28 };
class HotWatch {
  constructor(g) { this.g = g; this.t = 0; this.cool = 0; }
  update(dt) {
    const g = this.g, P = g.police, p = g.player;
    if (!g.uw || g.state !== 'playing' || !P.enabled || g.uw.S.jail) return;
    if (P.level > 0) { this.cool = HOT_T.cool; return; }
    if ((this.cool -= dt) > 0) return;
    if ((this.t -= dt) > 0) return; this.t = HOT_T.tick;
    const v = p.state === 'vehicle' ? p.vehicle : null;
    if (!v || !g.vreg.isHot(v)) return;
    // a cop has to actually be looking: a unit or an officer with a line of sight, close enough to read the plates
    if (!P.copCanSee(v.pos.x, v.pos.z, HOT_T.range) || Math.random() >= HOT_T.chance) return;
    P.addHeat(HEAT_LEVELS[1], v.pos.x, v.pos.z);
    g.ui.toast(`Dispatch: plates on a ${v.spec.name} come back stolen. Unit in pursuit.`, 'radio');
    g.vreg.note('recognised (HOT)', v.type, {});
  }
}

class ImpoundLot {
  constructor(g) { this.g = g; this.pick = null; this.seenT = -99; }
  get id() { return IMPOUND.id; }
  get C() { return this.g.world.compounds[IMPOUND.id]; }
  get CS() { return this.g.uw.compounds; }
  econ() { return this.g.uw ? this.g.uw.S.econH : 0; }
  // the release fee: a share of what the car is worth, fixed when it is seized
  fee(e) { const F = IMPOUND.fee, val = carMsrp(e.type) * (TIER_LOOK[e.vtier] || TIER_LOOK.common).value; return Math.round(clamp(val * F.k, F.min, F.max) / 10) * 10; }
  held() { return this.g.save.garage.filter(e => e.imp); }
  slots() { return (this.C && this.C.slots) || []; }
  freeSlot() { const used = new Set(this.held().map(e => e.imp.slot)); const n = this.slots().length; for (let i = 0; i < n; i++) if (!used.has(i)) return i; return n ? n - 1 : 0; }
  slotPos(e) { const S = this.slots(); return S[clamp(e.imp.slot, 0, S.length - 1)] || null; }
  // your car is taken to the lot: why is 'arrest', 'abandoned' or 'pursuit'
  seize(e, why) {
    const g = this.g, R = g.vreg, v = R.live(e);
    if (v && v !== g.player.vehicle) g.vehicles.despawn(v);
    R.cars.delete(e.uid);
    e.imp = { why, since: this.econ(), fee: this.fee(e), slot: this.freeSlot(), paid: false };
    e.out = false; e.loc = null;
    R.note('impounded', e.type, { uid: e.uid, why, fee: e.imp.fee });
    const what = { arrest: 'seized when you were arrested', abandoned: 'found abandoned on the street', pursuit: 'recovered by the police after the chase' }[why] || 'impounded';
    if (!g.uw.S.jail || why === 'arrest') g.uw.news('pv', `Your ${VEHICLES[e.type].name} was ${what} and taken to the ${IMPOUND.name}. Release fee ${fmtMoney(e.imp.fee)} at the window, from your bank.`);
    return e.imp;
  }
  // ---------------------------------------------------------------- who the gate opens for (CompoundSystem.why)
  why(a) {
    const g = this.g, p = g.player, CS = this.CS;
    if (a && a.spec && a.ctl) {
      if (a.type === 'police' || a.type === 'unmarked' || a.towTruck) return '';
      if (a === p.vehicle && p.state === 'vehicle') { const e = g.vreg.entryOf(a); return e && e.imp && e.imp.paid ? '' : 'not released'; }
      return 'no business here';
    }
    if (a === p) {
      // anyone already inside is let out on foot; from the street, only to collect a car that has been released
      if (CS.inYard(this.id, p.pos.x, p.pos.z)) return '';
      return this.held().some(e => e.imp.paid) ? '' : 'closed to the public';
    }
    return 'no business here';
  }
  entitled() { const g = this.g, p = g.player, v = p.state === 'vehicle' ? p.vehicle : null; const e = v && g.vreg.entryOf(v); return v ? !!(e && e.imp && e.imp.paid) : this.held().some(e2 => e2.imp.paid); }
  // ---------------------------------------------------------------- break-ins
  heat(stars, why) {
    const P = this.g.police; if (!P.enabled) return;
    if (P.level < stars) P.addHeat(Math.max(0.01, HEAT_LEVELS[stars] - P.heat), this.C.gate.x, this.C.gate.z);
    this.g.ui.toast(`Impound alarm: ${why}. The precinct is next door.`, 'warn');
  }
  onRam() { this.heat(IMPOUND.stars.ram, 'the gate rammed'); }
  onSeen() {
    const g = this.g; if (this.entitled() || g.time - this.seenT < 60) return;
    this.seenT = g.time; this.heat(IMPOUND.stars.seen, 'someone in the yard');
  }
  // the gate's control box: a few seconds' work on foot opens it for a while (and trips the alarm)
  updatePick(dt) {
    const g = this.g, p = g.player, G = this.C.gate; if (!this.pick) return;
    if (p.state !== 'foot' || Math.hypot(p.pos.x - G.x, p.pos.z - G.z) > 4.2) { this.pick = null; return; }
    if ((this.pick.t += dt) < IMPOUND.pick) return;
    this.pick = null;
    const R = this.CS.R[this.id]; R.forceT = g.time + IMPOUND.open;
    g.audio.play('door');
    this.heat(IMPOUND.stars.pick, 'the gate lock forced');
  }
  // ---------------------------------------------------------------- the window
  openOffice() {
    const g = this.g, s = g.save;
    const render = () => {
      const list = this.held();
      return `<div class="svcTop"><span>${esc(IMPOUND.name)}</span><span>${Money.html('impoundFee')}</span></div>` + `<div class="btns"><button class="sbtn" data-act="pick:0">Pick the gate lock instead (the alarm will go)</button></div>` + (list.length ? '<div class="jobs">' + list.map(e => `<div class="job"><i>🚧</i><div><b>${esc(VEHICLES[e.type].name)} · space ${e.imp.slot + 1}</b><span>${esc({ arrest: 'Seized at your arrest', abandoned: 'Abandoned on the street', pursuit: 'Recovered after a pursuit' }[e.imp.why] || 'Impounded')} · fee ${fmtMoney(e.imp.fee)}${e.imp.paid ? ' · released: drive it out' : ''}</span></div>${e.imp.paid ? '' : `<button class="sbtn gold" data-act="pay:${e.uid}" ${Money.can(e.imp.fee, 'impoundFee') ? '' : 'disabled'}>Pay ${fmtMoney(e.imp.fee)}</button>`}</div>`).join('') + '</div>' : '<div class="hint">Nothing of yours in here.</div>');
    };
    g.content.openSvc('Impound window', 'Clerk: “Paperwork, then the fee, then you drive it out yourself. The gate opens for a released car.”', render, act => {
      const [k, id] = act.split(':');
      if (k === 'pick') { g.ui.back(); this.pick = { t: 0 }; g.ui.toast('Working on the lock… stay at the gate.', 'radio'); return; }
      if (k !== 'pay') return;
      const e = s.garage.find(x => x.uid === +id); if (!e || !e.imp || e.imp.paid) return;
      if (!Money.pay(e.imp.fee, 'impoundFee')) { g.content.refreshSvc('Not enough in the bank.'); return; }
      e.imp.paid = true; g.vreg.note('release paid', e.type, { uid: e.uid, fee: e.imp.fee });
      g.audio.play('cash'); g.saveGame(); g.content.refreshSvc(`Released. It’s in space ${e.imp.slot + 1}: the gate opens for it.`);
    });
  }
  findAction() {
    const g = this.g, p = g.player, C = this.C; if (!C || p.interior || p.state !== 'foot') return null;
    const G = C.gate, ox = G.x - G.n[0] * 3, oz = G.z - G.n[1] * 3;
    if (Math.hypot(p.pos.x - ox, p.pos.z - oz) < IMPOUND.office) {
      if (this.pick) return { label: `Picking the gate lock… ${Math.ceil(IMPOUND.pick - this.pick.t)} s`, act: () => {} };
      return { label: `Impound window · ${IMPOUND.name}`, act: () => this.openOffice() };
    }
    // from inside the yard, the control box on the gate post
    if (this.CS.inYard(this.id, p.pos.x, p.pos.z) && Math.hypot(p.pos.x - G.x, p.pos.z - G.z) < 4) {
      if (this.pick) return { label: `Picking the gate lock… ${Math.ceil(IMPOUND.pick - this.pick.t)} s`, act: () => {} };
      if (!this.entitled()) return { label: 'Pick the gate lock', act: () => { this.pick = { t: 0 }; } };
    }
    return null;
  }
  // ---------------------------------------------------------------- the cars in the lot, and the way out
  update(dt) {
    const g = this.g, R = g.vreg, p = g.player, P = g.police;
    if (!g.uw || g.state !== 'playing' || !this.C) return;
    this.updatePick(dt);
    const near = !(p.interior && !p.interior.vspace) && Math.hypot(p.pos.x - this.C.center.x, p.pos.z - this.C.center.z) < VREG.near;
    for (const e of g.save.garage) {
      if (!e.imp) {
        // recovered by police in a chase: an owned car left near a cop who can see it while they're after you
        if (e.out && P.level > 0) { const v = R.live(e); if (v && v !== p.vehicle && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) > HOT_T.pursuit && P.copCanSee(v.pos.x, v.pos.z, HOT_T.pursuitSeen)) this.seize(e, 'pursuit'); }
        continue;
      }
      let v = R.live(e);
      if (!v && near) { const sp = this.slotPos(e); if (sp) { v = R.spawnFor(e, { x: sp.x, z: sp.z, h: sp.h, y: CURB_H }); v.display = false; v.locked = false; v.impounded = true; } }
      else if (v && !near && v !== p.vehicle && v !== p.lastVehicle) { g.vehicles.despawn(v); R.cars.delete(e.uid); continue; }
      if (!v) continue;
      // out of the yard and away from the gate: retrieved (paid), or taken back (not)
      const inYard = this.CS.inYard(this.id, v.pos.x, v.pos.z), dG = Math.hypot(v.pos.x - this.C.gate.x, v.pos.z - this.C.gate.z);
      if (!inYard && dG > 10) this.retrieved(e, v);
    }
  }
  retrieved(e, v) {
    const g = this.g, R = g.vreg, paid = e.imp.paid;
    e.imp = null; e.out = true; e.loc = R.here(v); e.seen = this.econ(); v.impounded = false;
    if (paid) { R.note('retrieved', e.type, { uid: e.uid }); g.ui.toast(`Your ${VEHICLES[e.type].name} is out of the impound.`, 'money'); g.autosave('Vehicle retrieved'); return; }
    // taken back without paying: the fee is moot, the plate is wanted
    e.hot = true;
    R.note('taken back from the impound', e.type, { uid: e.uid });
    this.heat(IMPOUND.stars.drive, 'a car driven out unreleased');
  }
  reset() { this.pick = null; this.seenT = -99; }
}

// the Chop Shop's work on a stolen car in its yard (sell is UnderWorld.sellCar)
const CHOP_WORK = { clean: 0.12, cleanMin: 400, repair: 1.1, paint: 350 };
class ChopShop {
  constructor(g) { this.g = g; }
  // a car the chop shop will work on: one you don't own legally (tracked stolen, or a HOT car in your fleet)
  car(v) { const R = this.g.vreg; return !!v && !v.burnt && (v.trackId ? !!R.rec(v.trackId) : v.garageUid ? !!(R.entryOf(v) && R.entryOf(v).hot) : !v.owned); }
  cleanPrice(v) { return Math.max(CHOP_WORK.cleanMin, Math.round(carMsrp(v.type) * CHOP_WORK.clean * (TIER_LOOK[v.vtier] || TIER_LOOK.common).value / 10) * 10); }
  // why it can't be cleaned ('' when it can)
  cleanBlock(v) {
    const g = this.g, R = g.vreg;
    if (g.police.level > 0) return 'Not with the police on you.';
    if (v.garageUid) { const e = R.entryOf(v); if (!e || !e.hot) return 'Already clean.'; }
    else {
      const r = v.trackId && R.rec(v.trackId); if (!r) return 'They need to know where it came from.';
      if (!r.hot) return 'Already clean.';
      // a clean title is a legal car of yours: it needs a real space of its own (§45.30)
      if (!R.freeBays() || g.save.garage.length >= g.content.garageCap) return 'No free parking space for it: a clean car needs a space of its own.';
    }
    if (!Money.can(this.cleanPrice(v), 'chopWork')) return `Costs ${fmtMoney(this.cleanPrice(v))} in cash.`;
    return '';
  }
  // new papers: HOT gone, a legal car of yours (into your fleet if it wasn't), exactly once
  clean(v) {
    const g = this.g, R = g.vreg, why = this.cleanBlock(v); if (why) return why;
    Money.pay(this.cleanPrice(v), 'chopWork');
    if (v.garageUid) { const e = R.entryOf(v); e.hot = false; e.cleaned = true; R.note('cleaned', e.type, { uid: e.uid }); }
    else {
      const r = R.rec(v.trackId), e = g.content.addToGarage(v.type, 'stolen', v.colorHex, true);
      if (!e) return 'No free parking space.';
      e.hot = false; e.cleaned = true; e.vtier = v.vtier || VEHICLES[v.type].tier; e.dmg = clamp(100 - v.health, 0, 100);
      e.tune = r.tune ? { ...r.tune } : e.tune;
      e.trunk = r.trunk; v.trunk = e.trunk;
      e.out = true; e.loc = R.here(v); e.seen = R.econ();
      v.owned = true; v.garageUid = e.uid; v.origin = 'stolen'; v.tune = e.tune;
      R.forget(v, 'owned'); R.cars.set(e.uid, v);
      R.note('cleaned', e.type, { uid: e.uid });
    }
    g.audio.play('cash'); g.autosave('Car cleaned');
    return '';
  }
  open(v) {
    const g = this.g, uw = g.uw, R = g.vreg, C2 = g.content;
    if (g.police.level > 0) { C2.deny('The chop shop rolls the door down. “Not with cops on you.”'); return; }
    const COLORS = [0xc0392b, 0x1c2833, 0xecf0f1, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xd35400, 0x566573, 0x1abc9c];
    const ent = () => R.entryOf(v), rec = () => v.trackId ? R.rec(v.trackId) : null;
    const tuneOf = () => { const e = ent(), r = rec(); return e ? e.tune : r ? (r.tune || (r.tune = { engine: 0, brakes: 0, grip: 0, armor: 0 })) : null; };
    const render = () => {
      if (!g.vehicles.list.includes(v) || v.burnt) return '<div class="hint">Gone.</div>';
      const hot = R.isHot(v), cb = this.cleanBlock(v), cp = this.cleanPrice(v), rc = Math.round(C2.repairCost(v.type, v.health) * CHOP_WORK.repair / 10) * 10, t = tuneOf();
      let h = `<div class="svcTop"><span>${esc(v.spec.name)} ${hot ? '<span class="chip" style="--c:#ff4d5e">HOT</span>' : '<span class="chip" style="--c:#7fe08f">CLEAN PAPERS</span>'}</span><span>Condition <b>${Math.round(v.health)}%</b></span><span>${Money.html('chopWork')}</span></div><div class="grid2">`;
      if (!v.garageUid) h += `<div class="card"><div class="t">Sell</div><div class="d">They strip it for parts. Cash only.</div><button class="sbtn gold" data-act="sell">${fmtMoney(uw.chopValue(v))}</button></div>`;
      h += `<div class="card"><div class="t">Clean the title</div><div class="d">New plates, new papers: it stops being HOT and becomes a legal car of yours, in a space of its own. It still resells as a stolen car.</div><button class="sbtn gold" data-act="clean" ${cb ? 'disabled' : ''}>${cb ? esc(cb) : fmtMoney(cp)}</button></div>`;
      h += `<div class="card"><div class="t">Repair</div><div class="d">No questions about the dents.</div><button class="sbtn" data-act="repair" ${v.health >= 99.5 || !Money.can(rc, 'chopWork') ? 'disabled' : ''}>${v.health >= 99.5 ? 'No damage' : fmtMoney(rc)}</button></div>`;
      h += `<div class="card"><div class="t">Respray · ${fmtMoney(CHOP_WORK.paint)}</div><div class="d">Paint only: the plates still say what it is.</div><div class="swatches">${COLORS.map(c => `<button class="sw" data-act="paint:${c}" style="background:#${c.toString(16).padStart(6, '0')}" ${Money.can(CHOP_WORK.paint, 'chopWork') ? '' : 'disabled'}></button>`).join('')}</div></div>`;
      h += '</div><h3>Upgrade</h3><div class="grid2">' + (t ? TUNE.map(T => { const lv = t[T.id], max = lv >= 3, price = max ? 0 : C2.tunePrice(T, lv, v.type), need = TUNE_REP[lv] || 0, locked = !max && g.save.rep < need; return `<div class="card"><div class="t">${T.name}</div><div class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><button class="sbtn" data-act="tune:${T.id}" ${max || locked || !Money.can(price, 'chopWork') ? 'disabled' : ''}>${max ? 'Maxed' : locked ? 'Needs ' + need + ' Rep' : fmtMoney(price)}</button></div>`; }).join('') : '<div class="hint">They only tune a car they know.</div>') + '</div>';
      return h;
    };
    C2.openSvc('Saltworks Chop Shop', 'Knuckles: “Sell it, clean it, fix it, paint it, make it faster. Pick.”', render, act => {
      if (g.police.level > 0) { C2.refreshSvc('“Not with cops on you.”'); return; }
      const [k, a] = act.split(':');
      if (k === 'sell') { g.ui.back(); uw.sellCar(v); return; }
      if (k === 'clean') { const r = this.clean(v); C2.refreshSvc(r || 'New papers. It’s a legal car of yours now, in a space of its own.'); return; }
      if (k === 'repair') { const c = Math.round(C2.repairCost(v.type, v.health) * CHOP_WORK.repair / 10) * 10; if (!Money.pay(c, 'chopWork')) return; C2.repair(v); const e = ent(); if (e) e.dmg = 0; g.audio.play('cash'); }
      if (k === 'paint') { if (!Money.pay(CHOP_WORK.paint, 'chopWork')) return; v.colorHex = +a; v.mat.userData.u.uPaint.value.setHex(+a); const e = ent(), r = rec(); if (e) e.color = +a; if (r) r.color = +a; g.audio.play('cash'); }
      if (k === 'tune') { const t = tuneOf(), T = TUNE.find(x => x.id === a); if (!t || !T || t[a] >= 3) return; const price = C2.tunePrice(T, t[a], v.type); if (g.save.rep < (TUNE_REP[t[a]] || 0) || !Money.pay(price, 'chopWork')) return; t[a]++; v.tune = t; g.audio.play('cash'); }
      g.saveGame(); C2.refreshSvc();
    });
  }
}
