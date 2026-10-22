/* =====================================================================
   [UNDERWORLD] THREATS AND DEFENSE (§10, §45.10, §45.16, §45.26; Session 4A):
   how rival gangs come back at the player's empire.
   - Pressure: each faction keeps a grievance (0-100) built only from what
     the player does to it: turf taken, people put down, a boss beaten, a
     shipment stolen, product sold on its corners. It fades every day. Its
     stage decides what they dare: intimidation (20+), hits on the player's
     assets (40+), coordinated strikes on warehouses and turf (70+).
   - A threat is announced before it lands. A warning arrives as a message
     (never a modal); about two minutes of active play later comes THREAT
     IMMINENT; about a minute after that it executes. The clock runs on real
     active play: the pause menu, a hidden tab and loading freeze it, the
     phone and the map don't. Opening the message sets the route to the asset.
   - Execution: with the player there, the attackers turn up in person and
     the fight decides it (at a warehouse compound they come through the
     gate, a breach or not at all). Otherwise, or from a cell, the crew defend
     on their own, and the outcome comes from what is actually there: the
     asset's kind, Enforcers, the district's Lieutenant, a warehouse's
     security level, breaches and patches, camera coverage and staffing.
   - Every threat is saved with its clock, its strength and its dice, so a
     reload neither resets nor rerolls it, and one target never has two.
   State: save.uw.threats; pressure on each faction (press, hist).
   ===================================================================== */
const THREAT_KINDS = { dealer: 'a Dealer’s corner', delivery: 'a delivery on the road', stash: 'a safehouse stash', business: 'a business', warehouse: 'a warehouse', turf: 'a turf' };
class ThreatSystem {
  constructor(uw) { this.uw = uw; this.live = new Map(); }
  get S() { return this.uw.S; }
  get g() { return this.uw.g; }
  get L() { return this.S.threats; }
  static fresh() { return { list: [], next: 1, log: [] }; }
  static sanitize(t, num) {
    const d = ThreatSystem.fresh();
    if (!t || typeof t !== 'object') return d;
    const out = { list: [], next: Math.floor(num(t.next, 1, 1, 1e9)), log: Array.isArray(t.log) ? t.log.filter(x => x && typeof x === 'object').slice(-20) : [] };
    for (const o of Array.isArray(t.list) ? t.list : []) {
      if (!o || typeof o !== 'object' || !FACTIONS[o.fid] || !THREAT_KINDS[o.kind] || !['warned', 'imminent', 'live'].includes(o.state)) continue;
      out.list.push({
        id: Math.floor(num(o.id, 0, 0, 1e9)), fid: o.fid, kind: o.kind, key: typeof o.key === 'string' ? o.key : o.kind, target: o.target && typeof o.target === 'object' ? o.target : {},
        label: typeof o.label === 'string' ? o.label : '', x: num(o.x, 0, -1e4, 1e4), z: num(o.z, 0, -1e4, 1e4), state: o.state,
        left: num(o.left, 0, 0, 3600), power: num(o.power, 10, 0, 1000), bonus: num(o.bonus, 0, 0, 0.45), roll: num(o.roll, 0.5, 0, 1), stage: Math.floor(num(o.stage, 1, 1, 3)), opened: !!o.opened, day: num(o.day, 0, 0, 1e7)
      });
    }
    out.list = out.list.slice(0, 12);
    out.next = Math.max(out.next, ...out.list.map(o => o.id + 1), 1);
    return out;
  }
  // ---------------------------------------------------------------- pressure
  press(fid, amt, why) {
    const f = this.S.factions[fid]; if (!f || !FACTIONS[fid] || f.broken) return;
    f.press = clamp((f.press || 0) + amt, 0, 100);
    if (amt > 0 && why) { f.hist = (f.hist || []).slice(-9); f.hist.push({ day: this.S.day, why, amt: Math.round(amt * 10) / 10 }); }
  }
  stage(fid) { const p = (this.S.factions[fid] || {}).press || 0; return p >= PRESS_STAGE.strike ? 3 : p >= PRESS_STAGE.hit ? 2 : p >= PRESS_STAGE.warn ? 1 : 0; }
  open() { return this.L.list.filter(o => o.state !== 'done'); }
  // ---------------------------------------------------------------- the daily decision: who comes after what
  tickDay(coalition) {
    const uw = this.uw, S = this.S;
    for (const fid of FAC_IDS) { const f = S.factions[fid]; if (!f.broken) f.press = Math.max(0, (f.press || 0) * PRESSURE.decay - PRESSURE.decayFlat); }
    for (const fid of FAC_IDS) {
      const f = S.factions[fid]; if (f.broken || f.truce > S.day || f.bossDown > 0) continue;
      const st = this.stage(fid); if (!st) continue;
      if (this.open().length >= 3 || this.open().some(o => o.fid === fid)) continue;
      // the grievance decides what they want to do; the player's power decides whether they dare (as before, §45.23)
      // (a coalition emboldens them, except against the kingpin: the old rule, DC-25)
      const p = [0, 0.35, 0.55, 0.8][st] * (coalition && !uw.kingpin() ? 1.3 : 1) * (uw.attitude(fid) === 'fearful' ? 0.4 : 1) * clamp(1.4 - uw.powerRatio(fid) * 0.35, 0.15, 1);
      if (Math.random() >= p) continue;
      const t = this.pickTarget(fid, st); if (t) this.create(fid, t.kind, t.target, st);
    }
  }
  // the asset they go for: one of the player's, near their own ground, of a kind their stage allows
  pickTarget(fid, st) {
    const uw = this.uw, S = this.S, PM = uw.props, ownT = uw.T.filter(t => uw.owner[t.i] === fid);
    const near = (x, z) => ownT.length ? Math.min(...ownT.map(t => Math.hypot(t.cx - x, t.cz - z))) : 600;
    const c = [];
    const add = (kind, target, x, z, w) => { if (!this.open().some(o => o.key === ThreatSystem.key(kind, target))) c.push({ kind, target, w: w / (1 + near(x, z) / 250) }); };
    for (let i = 0; i < uw.T.length; i++) if (uw.whse.dealersOn(i).length) add('dealer', { turf: i }, uw.T[i].deal.x, uw.T[i].deal.z, 3);
    for (const d of PM.ownedList()) {
      const L = uw.loc('prop', d.id); if (!L) continue;
      if (d.kind === 'business') add('business', { prop: d.id }, L.x, L.z, 2);
      if (st >= 2 && d.kind === 'safehouse' && (units(S.storage[d.id]) || Money.dirtyAtProp(d.id) > 0)) add('stash', { prop: d.id }, L.x, L.z, 2);
      if (st >= 3 && d.kind === 'warehouse') add('warehouse', { prop: d.id }, L.x, L.z, 2.5);
    }
    if (st >= 2) for (const r of S.runs) { const A = uw.runs.locOf(r.from), B = uw.runs.locOf(r.to); if (A && B) add('delivery', { run: r.id }, (A.x + B.x) / 2, (A.z + B.z) / 2, 1.5); }
    // a turf takeback against the kingpin (DC-25): one push at a time, and only out of a real grudge or as part of a
    // coalition that isn't hopelessly outmatched; a crew he outweighs 2.5 to 1 never challenges him
    const ratio = uw.powerRatio(fid), kp = uw.kingpin(), coal = !!S.flags.coalition, f = S.factions[fid];
    const dare = !kp || (!S.turfs.some(t => t.war && t.war.d === 'pc') && !this.open().some(o => o.kind === 'turf') && ratio <= 2.5 && (f.rel <= -60 || (coal && ratio <= 1.5)));
    // and the more you outweigh them, the less they fancy your ground at all (the old war-choice penalty, by power)
    const tw = 2 * clamp(1 - (ratio - 1) * 0.7, 0.1, 1);
    if (st >= 3 && dare) for (let i = 0; i < uw.T.length; i++) if (uw.owner[i] === 'pc' && !S.turfs[i].war && uw.turfNeighbors(i).some(j => uw.owner[j] === fid)) add('turf', { turf: i }, uw.T[i].cx, uw.T[i].cz, tw);
    if (!c.length) return null;
    let r = Math.random() * c.reduce((a, x) => a + x.w, 0);
    for (const x of c) { r -= x.w; if (r <= 0) return x; }
    return c[c.length - 1];
  }
  static key(kind, target) { return kind + ':' + (target.prop || target.run || (target.turf !== undefined ? target.turf : '')); }
  // where the asset is, and what to call it
  where(kind, target) {
    const uw = this.uw;
    if (kind === 'dealer' || kind === 'turf') { const t = uw.T[target.turf]; return t ? { x: kind === 'dealer' ? t.deal.x : t.cx, z: kind === 'dealer' ? t.deal.z : t.cz, label: kind === 'dealer' ? `your corner on ${t.name}` : t.name } : null; }
    if (kind === 'delivery') { const r = this.S.runs.find(q => q.id === target.run); if (!r) return null; const A = uw.runs.locOf(r.from), B = uw.runs.locOf(r.to); return A && B ? { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2, label: `${r.name.split(' ')[0]}’s run to ${uw.runs.placeName(r.to)}` } : null; }
    const d = PROP_BY_ID[target.prop], L = d && uw.loc('prop', d.id); if (!L) return null;
    if (kind === 'warehouse' && uw.compounds.R[d.id]) { const C = uw.compounds.R[d.id].C; return { x: C.gate.x - C.gate.n[0] * 6, z: C.gate.z - C.gate.n[1] * 6, label: d.name }; }
    return { x: L.x, z: L.z, label: d.name };
  }
  create(fid, kind, target, stage = this.stage(fid) || 1) {
    const S = this.S, f = S.factions[fid], key = ThreatSystem.key(kind, target);
    if (this.open().some(o => o.key === key)) return null;
    const w = this.where(kind, target); if (!w) return null;
    // history: a gang that has already hit this asset knows the way in (+15% for each earlier success, at most +45%)
    const prior = this.L.log.filter(l => l.fid === fid && l.outcome === 'hit' && ThreatSystem.key(l.kind, l.target || {}) === key).length, bonus = Math.min(0.45, prior * 0.15);
    const o = { id: this.L.next++, fid, kind, key, target, label: w.label, x: w.x, z: w.z, state: 'warned', left: THREAT_T.warn,
      power: Math.round(f.strength * (0.45 + stage * 0.25) * rand(0.85, 1.15) * (1 + bonus) * 10) / 10, bonus, roll: Math.random(), stage, opened: false, day: S.day };
    this.L.list.push(o);
    const boss = f.boss, D = FACTIONS[fid];
    const lines = { dealer: `Your boy on ${w.label.replace('your corner on ', '')} is selling where he shouldn’t. Not for long.`, delivery: 'We know which car is yours today.', stash: `Nice place, ${w.label}. Be a shame.`, business: `${w.label} has a lot of glass.`, warehouse: `We’re coming for ${w.label}. Lock the gate if you think it helps.`, turf: `${w.label} is ours again by tomorrow.` };
    this.uw.news('unknown', `${boss} (${D.short}): “${lines[kind]}” — threat against ${w.label}.`);
    this.g.ui.toast(`⚠ ${D.short} threaten ${w.label}`, 'warn');
    return o;
  }
  // ---------------------------------------------------------------- the clock (real time, active play only)
  counting() { const g = this.g; return g.state === 'playing' && !(typeof document !== 'undefined' && document.hidden); }
  // the threat clock keeps its own wall time (the game's per-frame step is capped, so a slow frame rate would
  // stretch it). A gap of more than five seconds between frames is a suspension (the app in the background, the
  // device asleep) and counts as frozen; a step that isn't counting (paused, hidden, loading) doesn't count at all. update(dt) with a number is
  // for tests: it advances the clock by exactly that.
  update(step) {
    let rdt = step;
    if (step === undefined) { const now = performance.now(); rdt = this.t0 === undefined ? 0 : (now - this.t0) / 1000; this.t0 = now; if (rdt > 5) rdt = 0; }
    if (!(rdt > 0) || !this.counting()) return;
    for (const o of this.L.list) {
      if (o.state === 'done') continue;
      if (o.state === 'live') { this.updateLive(o, rdt); continue; }
      o.left -= rdt;
      if (o.left > 0) continue;
      if (o.state === 'warned') {
        o.state = 'imminent'; o.left = THREAT_T.imminent;
        this.uw.news('unknown', `THREAT IMMINENT: the ${FACTIONS[o.fid].short} are on their way to ${o.label}.`);
        this.g.ui.toast(`⚠ THREAT IMMINENT · ${o.label}`, 'warn'); this.g.audio.play('wanted');
      } else this.execute(o);
    }
    this.L.list = this.L.list.filter(o => o.state !== 'done');
  }
  // the player opened the warning (or the Feed entry): route to the asset
  openThreat(id) {
    const o = this.L.list.find(x => x.id === id); if (!o) return false;
    o.opened = true;
    this.g.content.setWaypoint(o.x, o.z, `Threat · ${o.label}`);
    return true;
  }
  present(o) {
    const g = this.g, p = g.player;
    if (this.S.jail || g.state !== 'playing') return false;
    const I = p.interior, at = I && I.def && I.def.door ? I.def.door : p.pos;
    return Math.hypot(at.x - o.x, at.z - o.z) < THREAT_T.near;
  }
  execute(o) {
    if (o.kind === 'turf') {
      // a turf takeback is a showdown on the turf itself (the war system decides it, with your crew and you)
      const i = o.target.turf;
      if (this.uw.owner[i] === 'pc') this.uw.factions.startWar(o.fid, i, 'They warned you.', { force: true });
      return this.finish(o, 'war', { D: 0, A: o.power, parts: {} });
    }
    if (o.kind !== 'delivery' && this.present(o) && this.startAssault(o)) { o.state = 'live'; o.left = THREAT_T.fight; return; }
    this.resolve(o);
  }
  // ---------------------------------------------------------------- defense from what is actually there
  defense(o, present) {
    const uw = this.uw, S = this.S, W = uw.whse, parts = {};
    let D = 0; const add = (k, v) => { if (!v) return; parts[k] = Math.round(((parts[k] || 0) + v) * 10) / 10; D += v; };
    const zoneOf = () => { if (o.target.turf !== undefined) return uw.T[o.target.turf].zone; const L = o.target.prop && uw.loc('prop', o.target.prop); return L ? L.zone : zoneKey(o.x, o.z); };
    const z = zoneOf(), i = turfAt(o.x, o.z);
    // the district's Lieutenant runs the defense: their own weight, and the Enforcers on the neighbouring turfs
    const lts = uw.crew.active().filter(c => c.role === 'lieutenant' && uw.crew.ltZone(c) === z);
    for (const c of lts) add('lieutenant', 10 + c.skill / 10);
    const enf = j => uw.crew.active().filter(c => c.role === 'enforcer' && c.assign === j);
    if (lts.length) for (const j of uw.turfNeighbors(i)) for (const c of enf(j)) add('backup', (8 + c.skill / 10) * 0.5);
    switch (o.kind) {
      case 'dealer': { const j = o.target.turf; add('corner', 6); for (const c of enf(j)) add('enforcers', 14 + c.skill / 6); for (const c of uw.crew.active().filter(c => c.role === 'dealer' && c.assign === j)) add('dealers', 3); break; }
      case 'delivery': { const r = S.runs.find(q => q.id === o.target.run); if (r) add('runner', r.chance * 30); break; }
      case 'stash': { const d = PROP_BY_ID[o.target.prop]; add('security', (d.sec || 1) * 8); for (const c of enf(i)) add('enforcers', (14 + c.skill / 6) * 0.5); break; }
      case 'business': { const d = PROP_BY_ID[o.target.prop], B = uw.props.bizDay ? uw.props.bizDay(d) : null; add('staff', 10); if (B && B.mgr) add('manager', 8); if (uw.props.owned('security')) add('security firm', 10); break; }
      case 'warehouse': {
        const id = o.target.prop, R = uw.compounds.R[id];
        add('level', W.level(id) * 10);
        for (const c of W.crewAt(id, 'enforcer')) add('enforcers', 8 + c.skill / 10);
        for (const c of W.crewAt(id, 'lieutenant')) add('warehouse lieutenant', 15 + c.skill / 10);
        // cameras: seeing them coming is worth up to 12, by day or night as it is now
        const cov = uw.compounds.coverage(id).frac; add('cameras', cov * 12);
        // the fence as it stands: open breaches and weak patches count against it, and an open lot is open
        const br = uw.compounds.breaches(id); let open = 0, patched = 0; for (const k in br) { if (br[k].s === 'broken') open++; else patched++; }
        if (open) add('breaches', -Math.min(30, open * 8)); if (patched) add('patches', -Math.min(12, patched * 3));
        if (!W.tier(id, 'perimeter')) add('open lot', -10);
        if (!W.tier(id, 'access')) add('no gate', -6);
        if (R && R.gate && R.gate.state === 'ok' && WH_GATE[W.tier(id, 'access')] && WH_GATE[W.tier(id, 'access')].ram === Infinity) add('gate', 6);
        break;
      }
    }
    if (present) add('you', 30);
    return { D: Math.max(1, D), A: o.power, parts };
  }
  // §6: Maximum Security with minimum staffing turns back anything short of a coordinated strike; a strike still
  // has to get past it (the defense counts half again)
  resolve(o, forced) {
    // forced: 'won' / 'lost' (the fight decided it), 'stand' (time ran out with you there), 'away' (you left)
    const uw = this.uw, present = forced === 'stand';
    const r = this.defense(o, present);
    if (o.kind === 'warehouse' && uw.whse.immune(o.target.prop)) { if (o.stage < 3) return this.finish(o, 'held', r, 'Maximum Security'); r.D *= 1.5; r.parts.immune = 'strike: ×1.5'; }
    const won = forced === 'won' ? true : forced === 'lost' ? false : o.roll < r.D / (r.D + r.A);
    if (o.kind === 'delivery' && !this.S.runs.some(q => q.id === o.target.run)) return this.finish(o, 'missed', r);
    return this.finish(o, won ? 'held' : 'hit', r);
  }
  finish(o, outcome, r, note) {
    const uw = this.uw, S = this.S, f = S.factions[o.fid], D = FACTIONS[o.fid], loss = [];
    o.state = 'done';
    if (outcome === 'held') {
      f.strength = Math.max(0, f.strength - (2 + o.power / 20)); this.press(o.fid, PRESSURE.held);
      uw.addRep(10, null);
      uw.news('pv', `The ${D.short} came for ${o.label}${note ? ' and turned back at ' + note : ''}. ${note ? '' : 'Your people held.'}`.trim());
    } else if (outcome === 'hit') {
      this.press(o.fid, -20);
      switch (o.kind) {
        case 'dealer': { const i = o.target.turf; for (const c of uw.crew.active().filter(c => c.assign === i && (c.role === 'dealer' || c.role === 'enforcer'))) { uw.crew.hurt(c.id, `the ${D.short} hit on ${uw.T[i].name}`); loss.push(c.name.split(' ')[0] + ' hurt'); } const n = Inv.lose(uw.whse.turfStock(i), 0.6); if (n) loss.push(`${n} units of corner stock`); uw.addInf(i, 'pc', -8); break; }
        case 'delivery': { const r2 = S.runs.find(q => q.id === o.target.run); if (r2) { uw.runs.resolve(r2, 0.999, 'robbed'); loss.push('the load'); } break; }
        case 'stash': { const id = o.target.prop, n = Inv.lose(S.storage[id], 0.4), m = Money.robbedAt(id, 0.3, 50000); if (n) loss.push(`${n} units`); if (m) loss.push(fmtMoney(m)); break; }
        case 'business': { const id = o.target.prop; if (S.props[id]) S.props[id].dmg = 1; loss.push('the place is wrecked until you repair it'); break; }
        case 'warehouse': {
          const id = o.target.prop, n = Inv.lose(S.storage[id], 0.3), m = Money.robbedAt(id, 0.2, 250000);
          if (n) loss.push(`${n} units`); if (m) loss.push(fmtMoney(m) + ' from the vault');
          // they got in: the way they came is broken until it is mended (§45.26)
          const R = uw.compounds.R[id], br = uw.compounds.breaches(id), t = uw.whse.tier(id, 'access');
          if (t && R && R.gate && !br.gate) { br.gate = { s: 'broken', t: S.econH, tier: t }; if (uw.crew.active().some(c => c.assign === WarehouseSystem.key(id))) br.gate.w = S.econH; uw.compounds.build(id, true); loss.push('the gate'); }
          for (const c of uw.whse.crewAt(id, 'enforcer')) if (Math.random() < 0.3) uw.crew.hurt(c.id, `the ${D.short} raid on ${PROP_BY_ID[id].name}`);
          break;
        }
      }
      uw.news('pv', `The ${D.short} hit ${o.label}${loss.length ? ': ' + loss.join(', ') : ''}.`);
    } else if (outcome === 'war') uw.news('pv', `The ${D.short} are moving on ${o.label}. Defend it, or let your crew try.`);
    else if (outcome === 'missed') uw.news('pv', `The ${D.short} went looking for ${o.label}, but the run was already over.`);
    this.L.log.push({ id: o.id, day: S.day, fid: o.fid, kind: o.kind, target: o.target, label: o.label, outcome, D: Math.round(r.D), A: Math.round(r.A), parts: r.parts, loss });
    if (this.L.log.length > 20) this.L.log.shift();
    uw.g.autosave('Threat resolved');
    return outcome;
  }
  // ---------------------------------------------------------------- in person: the attackers turn up
  startAssault(o) {
    const uw = this.uw, g = this.g, gs = uw.gangs, n = clamp(Math.round(o.power / 14), 3, 6);
    let at, goal;
    if (o.kind === 'warehouse') {
      const C = uw.compounds.R[o.target.prop].C;
      const lat = C.gate.axis === 'x' ? [1, 0] : [0, 1];
      at = { x: C.gate.x - C.gate.n[0] * 12 + lat[0] * 7, z: C.gate.z - C.gate.n[1] * 12 + lat[1] * 7, h: Math.atan2(C.gate.n[0], C.gate.n[1]) };
      goal = { x: C.door.x, z: C.door.z };
    } else { at = { x: o.x, z: o.z, h: 0 }; goal = { x: o.x, z: o.z }; const c = g.world.randomCurbSpot(o.x, o.z, 30, 60); at.x = c.x; at.z = c.z; }
    const gr = gs.spawnGroup('as' + o.id, 'assault', o.fid, at, n, {});
    if (!gr || !gr.members.length) return false;
    gr.hostile = true; gr.enemy = 'pc';
    for (const m of gr.members) { m.home = { x: goal.x, z: goal.z, h: 0 }; m.courage = Math.max(m.courage, 0.6); }
    // at a warehouse whose gate a car can break, they bring one (the 3B ram rules decide whether it gives)
    if (o.kind === 'warehouse') {
      const id = o.target.prop, R = uw.compounds.R[id], C = R.C, A = WH_GATE[uw.whse.tier(id, 'access')];
      if (A && A.ram < Infinity && R.gate && R.gate.state === 'ok') {
        const h = Math.atan2(C.gate.n[0], C.gate.n[1]), sx = C.gate.x - C.gate.n[0] * 22, sz = C.gate.z - C.gate.n[1] * 22;
        const v = g.vehicles.spawn('pickup', sx, sz, h, { driver: 'npc' }); v.touched = true; v.mission = 'assault'; v.fac = o.fid; v.health = 400;
        v.vel.set(Math.sin(h) * 16, Math.cos(h) * 16); v.drive = { update() { v.ctl.throttle = 1; v.ctl.steer = 0; v.ctl.handbrake = false; } };
        gr.cars = [v];
      }
    }
    this.live.set(o.id, { gr, goal, at: 0, t: 0 });
    g.ui.toast(`⚠ The ${FACTIONS[o.fid].short} are here · ${o.label}`, 'warn'); g.audio.play('wanted');
    return true;
  }
  // a fight in progress: it ends when the attackers are all down, when one of them holds the door (or the corner)
  // for six seconds, when you leave, or when the clock runs out with both sides standing
  updateLive(o, dt) {
    const A = this.live.get(o.id);
    // reloaded mid-fight (the attackers are not in the save): the crew settle it on what is there, once
    if (!A) { this.resolve(o, 'away'); return; }
    A.t += dt; o.left -= dt;
    if (A.gr.cars) for (const v of A.gr.cars) if (v.drive && A.t > 2.5 && this.g.vehicles.list.includes(v)) { v.drive = null; v.driver = null; v.ctl.throttle = 0; v.ctl.handbrake = true; }
    const up = A.gr.members.filter(m => m.state !== 'down');
    if (up.some(m => Math.hypot(m.x - A.goal.x, m.z - A.goal.z) < 4)) A.at += dt; else A.at = Math.max(0, A.at - dt * 0.5);
    const out = !up.length ? 'won' : A.at > 6 ? 'lost' : !this.present(o) ? 'away' : o.left <= 0 ? 'stand' : null;
    if (!out) return;
    // at a warehouse, if nobody got into the yard (the gate and fence held) they took nothing
    const got = o.kind !== 'warehouse' || A.gr.members.some(m => this.uw.compounds.inYard(o.target.prop, m.x, m.z));
    this.live.delete(o.id);
    this.uw.gangs.removeGroup(A.gr);
    this.resolve(o, out === 'stand' && !got ? 'won' : out);
  }
  reset() { this.live.clear(); }
  // what the Feed shows: live threats with their clocks
  feedHTML(esc) {
    const list = this.open(); if (!list.length) return '';
    return '<h3>Threats</h3><div class="msgs">' + list.map(o => `<div class="msg"><i style="background:#ff4d5e">⚠</i><div><b>${esc(FACTIONS[o.fid].short)} · ${esc(o.label)}</b><small>${o.state === 'live' ? 'happening now' : o.state === 'imminent' ? `IMMINENT · ${Math.ceil(o.left)} s` : `about ${Math.ceil((o.left + THREAT_T.imminent) / 60)} min`}${o.opened ? '' : ' · new'}</small><p>Against ${esc(THREAT_KINDS[o.kind])}. Get there to defend it in person, or your crew will try on their own.</p><div class="btns"><button class="sbtn gold" data-act="threat:${o.id}">Go there</button></div></div></div>`).join('') + '</div>';
  }
}
