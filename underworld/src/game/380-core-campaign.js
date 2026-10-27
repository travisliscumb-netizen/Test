/* =====================================================================
   [CORE+CONTENT] CAMPAIGN: five story arcs told through a small stage engine.
   Each mission is a list of stages (talk, drive, steal, tail, race,
   hold, break in, escape...) plus watchers (fragile cargo, hot cargo,
   no police) that can fail it. Positions are resolved from the world at
   start so every mission works on the generated city.
   ===================================================================== */
const ARCS = [
  { id: 1, name: 'Fresh Off the Ferry', who: 'rosa', blurb: 'Rosa Calder runs a courier dispatch and needs a driver she can trust.' },
  { id: 2, name: 'Wheels for Hire', who: 'ines', blurb: 'Ines Varga brokers cars. Dex Okafor makes them disappear.' },
  { id: 3, name: 'Street Heat', who: 'tull', blurb: '"Sprocket" Tull runs the night races out in Saltworks.' },
  { id: 4, name: 'Pressure', who: 'moss', blurb: 'Somebody at Police HQ has started paying attention to you.' },
  { id: 5, name: 'The Long Haul', who: 'ferry', blurb: 'The Ferryman has one job left in him. It’s a big one.' }
];
// Underworld is free-roam: there is no scripted story. Contacts offer optional contracts
// through the stage/mission engine, which stays in place for them.
const CAMPAIGN = [];
const CAMPAIGN_BY_ID = Object.fromEntries(CAMPAIGN.map(m => [m.id, m]));
const CONTACT_GATE = { rosa: () => true, tull: s => s.rep >= 60, ines: s => s.rep >= 120, ferry: s => s.rep >= 400, dex: () => false, moss: () => false };

class Campaign {
  constructor(game) { this.g = game; this.npcs = []; }
  get save() { return this.g.save; }
  isDone(id) { return !!this.save.story[id]; }
  doneCount() { return CAMPAIGN.filter(m => this.isDone(m.id)).length; }
  // why a mission can't start right now ('' when it can, null when its prerequisites aren't met)
  blocker(def) {
    if (!def.after.every(a => this.isDone(a))) return null;
    if (def.minRep && this.g.save.rep < def.minRep) return `Needs ${def.minRep} Rep.`;
    const t = this.g.env.time;
    if (def.night && !(t >= 20 || t < 5)) return 'This job only happens after dark (20:00–05:00).';
    return '';
  }
  nextJob() { for (const d of CAMPAIGN) if (!this.isDone(d.id) && this.blocker(d) !== null && this.contactVisible(d.giver)) return d; return null; }
  contactVisible(id) { const f = CONTACT_GATE[id]; return f ? f(this.save) : true; }
  contactStatus(id) {
    if (!this.contactVisible(id)) return 'Not taking your calls yet.';
    const mine = CAMPAIGN.filter(d => d.giver === id);
    const nx = mine.find(d => !this.isDone(d.id));
    if (!nx) return mine.length ? 'Story complete — side jobs available.' : 'Side jobs available.';
    const b = this.blocker(nx);
    if (b === null) return 'Nothing for you yet. Keep working.';
    return b ? `${nx.title}: ${b}` : `Has a job for you: ${nx.title}.`;
  }
  // offer card spec for a contact (story first, then Tull's races, then procedural side work)
  offerFor(c) {
    const g = this.g, s = this.save;
    if (c.storyOnly && !this.contactVisible(c.id)) return null;
    const def = CAMPAIGN.find(d => d.giver === c.id && !this.isDone(d.id) && this.blocker(d) !== null);
    if (def) {
      const b = this.blocker(def), arc = ARCS[def.arc - 1], idx = CAMPAIGN.filter(d => d.arc === def.arc).indexOf(def) + 1, tot = CAMPAIGN.filter(d => d.arc === def.arc).length;
      return { type: 'story', def, title: def.title, desc: def.brief, reward: def.reward, contact: c, locked: b || '', chip: `STORY · ${arc.name} · ${idx}/${tot}` };
    }
    if (c.id === 'tull') return this.raceOffer(c);
    if (c.storyOnly) return null;
    const spec = g.missions.generate(c);
    spec.chip = 'SIDE JOB'; spec.rep = Math.round(18 + spec.d * 8);
    return spec;
  }
  raceOffer(c) {
    const g = this.g, list = RACES.filter(r => !r.storyOnly);
    // the rotation: every race in turn (skipping one that can't run now), and once an economic day a pink slip
    // in the extra slot (§45.33); Vance's off-road special in a slot half way round (Session 6C), on its days
    const n = list.length + 2, dirtSlot = Math.floor(list.length / 2), at = i => i < dirtSlot ? i : i - 1;
    let def = null;
    for (let k = 0; k < n; k++) {
      this._ri = ((this._ri ?? -1) + 1) % n;
      if (this._ri === n - 1) { if (g.pinks && g.pinks.available(false)) return g.pinks.offer(c, false); continue; }
      if (this._ri === dirtSlot) { if (g.pinks && g.pinks.available(true)) return g.pinks.offer(c, true); continue; }
      def = list[at(this._ri)]; if (!raceAvailable(def, g)) break;
    }
    const why = raceAvailable(def, g), rec = this.save.races[def.id];
    const fee = Math.round(def.reward * 0.15 / 10) * 10;
    // today's purse for this race: full for the first win of the day, then a half, then a quarter
    const pay = g.raceRules ? g.raceRules.payout(def, 1) : { cash: def.reward, rep: def.rep, tier: 0 };
    const tier = pay.tier ? ` You’ve won this one today: the pot is down to ${fmtMoney(pay.cash)}.` : '';
    return { type: 'srace', race: def, title: def.name, desc: def.blurb + ` Buy-in ${fmtMoney(fee)}, winner takes the pot.` + tier + (rec && rec.best ? ` Your best: ${fmtRace(rec.best)}.` : ''), reward: pay.cash, fee, contact: c, locked: why, chip: `UNDERGROUND RACE · ${(def.laps || 1) > 1 ? def.laps + ' laps' : 'sprint'} · ${def.opp} rivals`, rep: pay.rep };
  }
  penthouseOpen() { const m = this.g.missions.active; return !!(m && m.spec.type === 'story' && m.spec.def.id === 'f1' && m.st && m.st.t === 'interior'); }
  depotOpen() { const m = this.g.missions.active; return !!(m && m.spec.type === 'story' && m.st && m.st.t === 'interior' && m.st.id === 'depot'); }
  canStore(v) { const m = this.g.missions.active; return !!(m && m.st && m.st.t === 'store' && m.refs[m.st.ref] === v); }
  startReplay(id) {
    const g = this.g, def = CAMPAIGN_BY_ID[id];
    if (!def || g.missions.active) return;
    const c = g.missions.contacts.find(x => x.id === def.giver);
    g.missions.start({ type: 'story', def, title: def.title, desc: def.brief, reward: Math.round(def.reward * 0.5), contact: c, replay: true });
  }
  // ------------------------------------------------------------ stage engine
  ctx() {
    const g = this.g, I = g.content.interiors;
    return {
      g, W: g.world, pl: g.world.places,
      ct: id => g.missions.contacts.find(c => c.id === id),
      curb: curbAt, near: curbNear,
      I: (id, lx, lz) => I.wp(id, lx, lz),
      release: (ref, despawn) => {
        const m = g.missions.active, v = m && m.refs[ref]; if (!v) return;
        if (g.player.vehicle === v) g.exitVehicle(true);
        v.mission = null; v.critical = false; delete m.refs[ref];
        if (despawn) setTimeout(() => { if (g.vehicles.list.includes(v) && g.player.vehicle !== v) g.vehicles.despawn(v); }, 2500);
      }
    };
  }
  begin(m) {
    const def = m.spec.def;
    m.refs = {}; m.watch = {}; m.vars = {}; m.bonus = 0; m.si = -1; m.timerOn = false; m.timer = 0;
    m.stages = def.stages(this.ctx());
    this.advance(m);
  }
  advance(m) {
    const g = this.g;
    for (let guard = 0; guard < 40; guard++) {
      m.si++;
      g.missions.clearObj();
      if (m.si >= m.stages.length) { m.st = null; g.missions.pass(); return; }
      const st = m.st = m.stages[m.si];
      st.time = 0;
      if (st.tip) g.ui.toast(st.tip);
      const instant = this.enter(m, st);
      if (g.missions.active !== m) return;
      if (!instant) return;
    }
  }
  // returns true for stages that finish immediately
  enter(m, st) {
    const g = this.g, C = this.ctx(), p = g.player;
    switch (st.t) {
      case 'say': g.content.say(st.who, st.text); return true;
      case 'msg': g.content.phone(st.from, st.text); return true;
      case 'wanted': if (g.police.level < st.level) g.police.setLevel(st.level); return true;
      case 'timer': m.timer = st.dur; m.timerOn = st.dur > 0; return true;
      case 'watch': Object.assign(m.watch, st); delete m.watch.t; delete m.watch.time; if (st.fragile) { const v = m.refs[st.fragile.ref]; m.watch.fragileBase = v ? v.health : 100; } return true;
      case 'unwatch': delete m.watch[st.key]; return true;
      case 'fn': st.f(C, m); return true;
      case 'npc': {
        if (st.remove) { this.npcs = this.npcs.filter(n => n.id !== st.id); return true; }
        const w = C.I(st.interior, st.lx, st.lz), look = randomLook(mulberry32(7));
        if (st.id === 'ferry') { look.shirt = C2(0x2b2b2b); look.pants = C2(0x1a1a1a); look.cap = C2(0x3a2a1a); }
        this.npcs.push({ id: st.id, interior: st.interior, x: w.x, y: IY, z: w.z, h: st.h, look, pose: { phase: 0, amp: 0 }, flash: 0 });
        return true;
      }
      case 'car': {
        const at = st.at;
        for (const o of g.vehicles.list.slice()) if (o !== p.vehicle && !o.mission && dist2(o.pos.x, o.pos.z, at.x, at.z) < 5 * 5) g.vehicles.despawn(o);
        let x = at.x, z = at.z;
        if (dist2(x, z, p.pos.x, p.pos.z) < 16) { x += Math.sin(at.h) * 7; z += Math.cos(at.h) * 7; }
        const v = g.vehicles.spawn(st.cls, x, z, at.h, { parked: !st.driver && !st.flee, driver: st.driver || st.flee ? 'npc' : null, color: st.color });
        v.mission = 'story'; v.touched = true; v.critical = !!st.critical; v.origin = 'mission'; v.alarmLvl = st.alarm || 0; v.legit = !!st.legit; v.npcOnly = !!(st.driver || st.flee);
        if (st.health) v.health = st.health;
        if (st.flee) { v.drive = new DriveAI(v, g, 'flee'); v.drive.cruise = st.cruise || 20; v.drive.setGoal(st.flee.x, st.flee.z); }
        if (st.driver) { v.drive = new DriveAI(v, g, 'race'); v.drive.wait = 1e9; v.drive.cruise = 12; }
        m.refs[st.ref] = v;
        return true;
      }
      case 'enter': { const v = m.refs[st.ref]; if (v) g.missions.objMarker(v.pos.x, v.pos.z, 0xffd84d, 2.2, false); return false; }
      case 'goto': case 'pickup': case 'hold': g.missions.objMarker(st.at.x, st.at.z, 0xffd84d, st.r ? Math.min(st.r, 8) : 4, st.t !== 'pickup' || true); if (st.t === 'pickup' || st.minY) this._markerY(st.at, st.minY); return false;
      case 'collect': st.left = st.pts.slice(); st.mk = st.pts.map(q => g.missions.objMarker(q.x, q.z, 0xffd84d, 5)); return false;
      case 'choose': st.mk = st.opts.map((o, i) => g.missions.objMarker(o.at.x, o.at.z, i ? 0xff8a3d : 0x46d4c4, 6)); return false;
      case 'race': {
        const def = RACES.find(r => r.id === st.race);
        g.race.begin(def, st.opts || {});
        return false;
      }
      case 'tail': { st.close = 0; st.far = 0; const v = m.refs[st.ref]; if (v && v.drive) { v.drive.wait = 0; v.drive.mode = 'race'; v.drive.cruise = 12; v.drive.setGoal(st.dest.x, st.dest.z); } return false; }
      case 'deliverCars': st.done = {}; for (const r of st.refs) { const v = m.refs[r]; if (v) g.missions.objMarker(v.pos.x, v.pos.z, 0xffd84d, 2.2, false); } return false;
      case 'interior': { const d = g.world.places[INTERIOR_DEFS[st.id].place].door; g.missions.objMarker(d.x, d.z, 0xffd84d, 1.6); return false; }
      default: return false;
    }
  }
  _markerY(at, minY) {
    const mk = this.g.missions.objMarkers[this.g.missions.objMarkers.length - 1];
    if (!mk) return;
    if (this.g.player.interior && at.y === undefined) mk.g.position.y = IY + 0.02;
    if (minY !== undefined) mk.g.position.y = at.y !== undefined ? at.y : minY + 2;
  }
  // per frame while a story mission is active; returns nothing, may pass/fail the mission
  update(dt, m) {
    const g = this.g, p = g.player, st = m.st;
    if (!st) return;
    st.time += dt;
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    const dTo = (t) => Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
    // critical vehicles
    for (const k in m.refs) {
      const v = m.refs[k];
      if (v.npcOnly && pv === v) { g.missions.fail('You were supposed to follow him, not take his car.'); return; }
      if (!v.critical) continue;
      if (!g.vehicles.list.includes(v) || v.burnt || v.health <= 0) { g.missions.fail(`The ${v.spec.name} was wrecked.`); return; }
    }
    // watchers
    const W = m.watch;
    if (W.fragile) {
      const v = m.refs[W.fragile.ref];
      if (v) { const lost = W.fragileBase - v.health; m.extra = ` · cargo ${Math.max(0, Math.round(100 - lost / W.fragile.max * 100))}%`; if (lost > W.fragile.max) { g.missions.fail('The cargo is ruined.'); return; } }
    } else m.extra = '';
    if (W.hot && g.police.level < 2 && !p.interior) {
      W.hotT = (W.hotT || 0) - dt;
      if (W.hotT <= 0) {
        W.hotT = 0.4;
        for (const v of g.traffic.cars) if (v.patrol && dist2(v.pos.x, v.pos.z, p.pos.x, p.pos.z) < 32 * 32 && g.world.grid.lineOfSight(v.pos.x, v.pos.y + 1.5, v.pos.z, p.pos.x, p.pos.y + 1.2, p.pos.z)) { g.police.adoptUnit(v); g.police.setLevel(2); g.ui.toast('A patrol car got a look at the case!', 'warn'); break; }
      }
    }
    if (W.noCops && g.police.level > 0) { g.missions.fail('You brought heat. The deal is off.'); return; }
    if (m.timerOn) { m.timer -= dt; if (m.timer <= 0) { g.missions.fail('Out of time.'); return; } }
    let done = false;
    const need = (st) => {
      if (st.need === 'any') return !!pv;
      if (st.need === 'foot') return p.state === 'foot';
      if (st.need) return pv && pv === m.refs[st.need];
      return true;
    };
    const needText = (st) => st.need === 'any' ? 'Get a vehicle' : st.need && st.need !== 'foot' ? `Get back in the ${m.refs[st.need] ? m.refs[st.need].spec.name : 'vehicle'}` : null;
    const cleanBlock = (st) => st.clean && g.police.level > 0;
    m.target = null;
    switch (st.t) {
      case 'wait': done = st.time >= st.dur; break;
      case 'lose': m.objective = st.obj; done = g.police.level === 0 && st.time > 1; break;
      case 'enter': {
        const v = m.refs[st.ref]; if (!v) { done = true; break; }
        m.target = { x: v.pos.x, z: v.pos.z }; m.objective = st.obj;
        const mk = g.missions.objMarkers[0]; if (mk) mk.g.position.set(v.pos.x, v.pos.y + v.spec.h + 0.2, v.pos.z);
        if (pv === v) { done = true; if (v.alarmLvl) { g.police.setLevel(Math.max(g.police.level, v.alarmLvl)); g.ui.toast('Car alarm! Someone called it in.', 'warn'); v.alarmT = 4; } }
        break;
      }
      case 'goto': {
        m.target = st.at;
        const ok = need(st);
        m.objective = ok ? (cleanBlock(st) ? 'Lose the police before you get there' : st.obj) : needText(st) || st.obj;
        if (ok && !cleanBlock(st) && dTo(st.at) < (st.r || 7) && (st.stop === false || !pv || pv.speed < 9) && (!p.interior || Math.abs(p.pos.y - IY) < 3)) done = true;
        break;
      }
      case 'collect': {
        const ok = need(st);
        for (let i = st.left.length - 1; i >= 0; i--) {
          const q = st.left[i];
          if (ok && dTo(q) < (st.r || 7) && (!pv || pv.speed < 9)) {
            st.left.splice(i, 1); g.audio.play('checkpoint'); g.ui.toast('Drop-off done.', 'money');
            const mk = st.mk[st.pts.indexOf(q)]; if (mk) { g.missions.markers.release(mk); const k = g.missions.objMarkers.indexOf(mk); if (k >= 0) g.missions.objMarkers.splice(k, 1); }
          }
        }
        let best = null, bd = 1e9; for (const q of st.left) { const d = dTo(q); if (d < bd) { bd = d; best = q; } }
        m.target = best;
        m.objective = ok ? `${st.obj} (${st.pts.length - st.left.length} / ${st.pts.length})` : needText(st);
        done = !st.left.length;
        break;
      }
      case 'choose': {
        const ok = need(st);
        let best = null, bd = 1e9; for (const o of st.opts) { const d = dTo(o.at); if (d < bd) { bd = d; best = o; } }
        m.target = best.at;
        m.objective = ok ? (cleanBlock(st) ? 'Lose the police before the drop' : st.obj) : needText(st);
        if (ok && !cleanBlock(st) && bd < 8 && (!pv || pv.speed < 9)) {
          m.bonus += best.bonus || 0;
          if (best.stages) m.stages.splice(m.si + 1, 0, ...best.stages);
          if (best.bonus) g.ui.toast(`${best.label} drop: +${fmtMoney(best.bonus)} bonus.`, 'money');
          done = true;
        }
        break;
      }
      case 'pickup': {
        m.target = st.at; m.objective = st.obj;
        if (p.state === 'foot' && dTo(st.at) < (st.r || 1.3)) { done = true; g.audio.play('pickup'); }
        break;
      }
      case 'interior': {
        const d = g.world.places[INTERIOR_DEFS[st.id].place].door;
        m.target = { x: d.x, z: d.z }; m.objective = st.obj;
        if (p.interior && p.interior.id === st.id) done = true;
        break;
      }
      case 'exitInt': m.objective = st.obj; if (p.interior) { const def = p.interior.def; m.target = { x: def.ox + def.exit.x, z: def.oz + def.exit.z }; } done = !p.interior; break;
      case 'hold': {
        m.target = st.at;
        const inside = dTo(st.at) < st.r && (st.minY === undefined || p.pos.y > st.minY);
        st.acc = (st.acc || 0) + (inside ? dt : 0);
        m.objective = inside ? `${st.obj} — ${Math.ceil(st.dur - st.acc)}s` : st.obj;
        done = st.acc >= st.dur;
        break;
      }
      case 'race': {
        const R = g.race.active;
        if (!R) { done = true; break; }
        m.target = R.target; m.objective = R.objective || '';
        const res = g.race.update(dt);
        if (res) {
          g.race.end();
          if (!res.win) { g.missions.fail(res.reason || `You finished ${ordinal(res.place)}.`); return; }
          g.ui.toast(`Winning time ${fmtRace(res.time)}${res.record ? ' — new record!' : ''}`, 'money');
          done = true;
        }
        break;
      }
      case 'tail': {
        const v = m.refs[st.ref]; if (!v) { done = true; break; }
        m.target = { x: v.pos.x, z: v.pos.z };
        const d = dTo(v.pos);
        if (d < st.min) { st.close += dt; m.objective = 'Too close! Back off'; if (st.close > 3) { g.missions.fail('He spotted you.'); return; } }
        else st.close = Math.max(0, st.close - dt * 0.5);
        if (d > st.max) { st.far += dt; m.objective = `You’re losing him! ${Math.ceil(8 - st.far)}`; if (st.far > 8) { g.missions.fail('You lost him.'); return; } }
        else st.far = 0;
        if (d >= st.min && d <= st.max) m.objective = st.obj;
        if (v.drive && (v.drive.arrived || Math.hypot(v.pos.x - st.dest.x, v.pos.z - st.dest.z) < 10)) done = true;
        break;
      }
      case 'wreck': {
        const v = m.refs[st.ref];
        if (!v || !g.vehicles.list.includes(v)) { g.missions.fail('He got away.'); return; }
        m.target = { x: v.pos.x, z: v.pos.z };
        m.objective = `${st.obj} (${Math.max(0, Math.round(v.health / (v.maxHp || (v.maxHp = Math.max(100, v.health))) * 100))}%)`;
        if (v.health <= 0) { done = true; break; }
        if (st.escape && Math.hypot(v.pos.x - st.escape.x, v.pos.z - st.escape.z) < 14) { g.missions.fail('He reached Quay Road and vanished.'); return; }
        if (v.drive && v.drive.arrived && st.escape) v.drive.setGoal(st.escape.x, st.escape.z);
        if (dTo(v.pos) > 380) { st.lost = (st.lost || 0) + dt; if (st.lost > 10) { g.missions.fail('He got away.'); return; } } else st.lost = 0;
        break;
      }
      case 'deliverCars': {
        let best = null, bd = 1e9;
        for (const r of st.refs) {
          if (st.done[r]) continue;
          const v = m.refs[r]; if (!v) continue;
          const mk = g.missions.objMarkers[st.refs.indexOf(r)]; if (mk && mk.g.visible) mk.g.position.set(v.pos.x, v.pos.y + v.spec.h + 0.2, v.pos.z);
          if (pv === v) {
            if (v.alarmLvl && !v.alarmDone) { v.alarmDone = true; g.police.setLevel(Math.max(g.police.level, v.alarmLvl)); g.ui.toast('Car alarm! Someone called it in.', 'warn'); }
            best = st.at; bd = 0;
            if (dTo(st.at) < 8 && v.speed < 4 && g.police.level === 0) {
              if (v.health < st.minHealth) { g.missions.fail('Ines won’t take a wreck.'); return; }
              st.done[r] = true; g.exitVehicle(true); v.critical = false; v.mission = 'sold'; v.locked = true;
              if (mk) mk.g.visible = false;
              g.audio.play('checkpoint'); g.ui.toast(`${v.spec.name} delivered.`, 'money');
            }
          } else { const d = dTo(v.pos); if (bd > 0 && d < bd) { bd = d; best = { x: v.pos.x, z: v.pos.z }; } }
        }
        const n = Object.keys(st.done).length;
        m.target = best;
        m.objective = pv && st.refs.some(r => m.refs[r] === pv) ? (g.police.level > 0 ? 'Lose the police before the drop-off' : `Drive it to Ines (${n} / ${st.refs.length})`) : `${st.obj} (${n} / ${st.refs.length})`;
        done = n >= st.refs.length;
        break;
      }
      case 'owned': {
        const bay = g.world.places.motorworks.bay;
        m.target = bay; m.objective = st.obj;
        if (pv && pv.garageUid && pv.speed < 3 && Math.hypot(pv.pos.x - bay.x, pv.pos.z - bay.z) < 6) { m.vars.ownedUid = pv.garageUid; done = true; }
        else if (pv && !pv.garageUid && Math.hypot(pv.pos.x - bay.x, pv.pos.z - bay.z) < 8) m.objective = 'This isn’t your car — bring one from your garage';
        break;
      }
      case 'store': {
        const v = m.refs[st.ref];
        const gp = g.content.garagePoints()[0].p;
        m.target = g.player.vehicle === v ? gp : v ? { x: v.pos.x, z: v.pos.z } : gp;
        m.objective = g.player.vehicle === v ? (g.police.level > 0 ? 'Lose the police first' : st.obj) : `Get back in the ${v ? v.spec.name : 'car'}`;
        if (m.vars.stored) done = true;
        break;
      }
      default: done = true;
    }
    if (done) this.advance(m);
  }
  onStored(e, gp) {
    const m = this.g.missions.active;
    if (m && m.st && m.st.t === 'store') { e.origin = 'reward'; m.vars.stored = true; delete m.refs[m.st.ref]; }
    void gp;
  }
  onService() { }
  onInterior() { }
  onAlarm() {
    const m = this.g.missions.active;
    if (m && m.spec.type === 'story' && m.spec.def.id === 'f3' && !m.vars.alarm) {
      m.vars.alarm = true; m.bonus -= 3000;
      this.g.content.say('ferry', 'They heard you. Grab the case and go — that noise is coming out of your cut.');
    }
  }
  // MissionManager hooks
  onPass(m) {
    const g = this.g, def = m.spec.def, s = this.save;
    if (m.spec.replay) { g.content.addRep(Math.round(def.rep * 0.2), 'replay'); return; }
    s.story[def.id] = Math.max(1, Math.round(m.t));
    s.stats.storyDone = this.doneCount();
    g.content.addRep(def.rep, def.title);
    if (def.onPass) def.onPass(g);
    // arc complete?
    const arcDone = CAMPAIGN.filter(d => d.arc === def.arc).every(d => this.isDone(d.id));
    if (arcDone) g.later(3800, () => g.ui.banner('Chapter Complete', ARCS[def.arc - 1].name, 'pass', 4));
  }
  cleanup(m) {
    const g = this.g;
    if (g.race.active) g.race.end();
    for (const k in m.refs || {}) {
      const v = m.refs[k];
      if (!g.vehicles.list.includes(v)) continue;
      if (v.mission === 'sold') { setTimeout(() => { if (g.vehicles.list.includes(v) && g.player.vehicle !== v) g.vehicles.despawn(v); }, 3000); continue; }
      v.mission = null; v.critical = false;
      if (v.drive && v.driver === 'npc') { v.drive.wait = 0; v.drive.mode = 'cruise'; v.drive.cruise = 13; const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 200, 600); v.drive.setGoal(c.x, c.z); }
    }
    this.npcs = [];
    g.content.clearSubs();
  }
  drawChars(cr) { const p = this.g.player; for (const n of this.npcs) if (p.interior && p.interior.id === n.interior) cr.draw(n); }
  // ------------------------------------------------------------ menus
  status(def) { if (this.isDone(def.id)) return 'done'; const b = this.blocker(def); return b === null ? 'locked' : b ? 'blocked' : 'open'; }
  boardHTML() {
    const g = this.g;
    let h = '';
    for (const arc of ARCS) {
      const ms = CAMPAIGN.filter(d => d.arc === arc.id);
      h += `<h3>${arc.id}. ${arc.name} <small>${ms.filter(d => this.isDone(d.id)).length} / ${ms.length}</small></h3><div class="hint">${arc.blurb}</div><div class="jobs">`;
      for (const d of ms) {
        const st = this.status(d), ct = g.missions.contacts.find(c => c.id === d.giver);
        const icon = st === 'done' ? '✓' : st === 'open' ? '●' : st === 'blocked' ? '◐' : '○';
        const note = st === 'blocked' ? this.blocker(d) : st === 'locked' ? 'Locked' : st === 'done' ? `Done · ${fmtMoney(Math.round(d.reward * 0.5))} replay` : `${ct ? ct.name : ''} · ${fmtMoney(d.reward)}`;
        h += `<div class="job ${st}"><i>${icon}</i><div><b>${d.title}</b><span>${note}</span></div>`;
        if (st === 'open' || st === 'blocked') h += `<button class="sbtn" data-act="wp:${d.giver}">Waypoint</button>`;
        if (st === 'done') h += `<button class="sbtn" data-act="replay:${d.id}" ${g.missions.active ? 'disabled' : ''}>Replay</button>`;
        h += '</div>';
      }
      h += '</div>';
    }
    return h;
  }
  arcsHTML() {
    if (!CAMPAIGN.length) return '';
    return '<h3>Story</h3><div class="arcs">' + ARCS.map(a => {
      const ms = CAMPAIGN.filter(d => d.arc === a.id), n = ms.filter(d => this.isDone(d.id)).length;
      return `<div class="arc${n === ms.length ? ' done' : ''}"><b>${a.name}</b><div class="bar"><i style="width:${n / ms.length * 100}%"></i></div><span>${n} / ${ms.length} · ${ms.map(d => this.isDone(d.id) ? '✓ ' + d.title : '').filter(Boolean).slice(-1)[0] || a.blurb}</span></div>`;
    }).join('') + '</div>';
  }
  percent() {
    const s = this.save, g = this.g;
    const races = RACES.filter(r => !r.storyOnly);
    const k = 0
      + Object.keys(s.packages).length / 30 * 15
      + Object.keys(s.jumps).length / Math.max(1, g.world.jumps.length) * 10
      + Object.keys(s.secrets).length / SECRETS.length * 8
      + races.filter(r => s.races[r.id] && s.races[r.id].won).length / races.length * 7
      + Object.keys(s.discovered.zones).length / Object.keys(ZONES).length * 5
      + Object.keys(s.achievements).length / ACHIEVEMENTS.length * 5;
    return Math.min(100, Math.floor(k));
  }
}
function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
function C2(hex) { return new THREE.Color(hex); }

