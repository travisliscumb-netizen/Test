/* =====================================================================
   [UNDERWORLD] TAXIS: Cabline cabs are real cars. Taxis drive in traffic everywhere; call one (phone,
   or from the map) and the nearest free cab comes to you, or one is sent from round the corner.
   At the cab: hire it or carjack it. Hiring opens the map: tap any road, see the distance and the fare,
   confirm. You ride in the back while the driver takes the roads (the same routing as police and
   traffic); the HUD shows where to, how far and the fare, with Skip (fade to the destination, full
   fare), Change destination (meter so far + a new quote) and Get out (pay the meter). A driver who gets
   stuck backs up, reroutes, and as a last resort takes the short way round (a quick fade).
   ===================================================================== */
const FARE_BASE = 6, FARE_PER_KM = 22, CAB_SPEED = 13;
// a cab is not a way round the logistics (M11, §27): no fare while wanted; a load of product (more than `carry`
// units on you) is a delivery, not a fare; any product at all and the ride goes the whole way (no Skip)
const TAXI_RULES = { carry: 2 };
const taxiCarried = g => g.uw ? units(g.uw.S.inv) : 0;
function fareFor(m) { return Math.max(8, Math.round(FARE_BASE + m / 1000 * FARE_PER_KM)); }
function routeLen(x0, z0, x1, z1) { const r = gpsRoute(x0, z0, x1, z1); let d = 0, px = x0, pz = z0; for (const q of r) { d += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; } return d + Math.hypot(x1 - px, z1 - pz); }
// the nearest point on a street (any road but a circuit or a course: the lattice, the curved roads, the spurs and the
// extensions' routes), in the lane on that side, heading the way traffic drives there. On a lattice street it stays
// 6 m clear of the junctions at either end.
function nearestRoadPoint(x, z) {
  const q = RoadGraph.nearest(x, z, { kinds: RG_STREETS }); if (!q) return null;
  const e = q.e; let along = q.along;
  if (e.lat) along = clamp(clamp(e.lat.a0 + along, 6, P - 6) - e.lat.a0, 0, e.len);
  const [px, pz, tx, tz] = RoadGraph.pointAt(e, along), off = Math.min(LANE, e.w / 4) * q.side;
  // the right-hand lane of travel is to the right of the direction (-tz, tx): on the left side, traffic comes the other way
  const lx = px - tz * off, lz = pz + tx * off, h = q.side > 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz);
  return { x: lx, z: lz, h, d: Math.hypot(lx - x, lz - z) };
}
function placeNameAt(x, z) {
  const g = game; let best = null, bd = 60;
  const pl = g.world.places;
  for (const id in pl) { const d = pl[id].door; if (pl[id].hidden) continue; const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = pl[id].name; } }
  if (!best && g.uw) for (const L of g.uw.locs) if (L.kind === 'prop') { const dd = Math.hypot(L.x - x, L.z - z); if (dd < bd) { bd = dd; best = L.def.name; } }
  if (!best && inExtension(x, z)) return districtNameAt(x, z);
  const vi = Math.round(x / P), hj = Math.round(z / P);
  const street = Math.abs(x - vi * P) < Math.abs(z - hj * P) ? STREET_NAMES_X[clamp(vi, 0, N)] : STREET_NAMES_Z[clamp(hj, 0, N)];
  return best ? `${best}` : `${street}, ${districtNameAt(x, z)}`;
}
class TaxiService {
  constructor(g) {
    this.g = g; this.cab = null; this.state = 'idle'; this.dest = null; this.quote = 0; this.meter = 0; this.driven = 0; this.preset = null; this.t = 0;
    const el = $('taxiHud');
    if (el) el.addEventListener('click', e => {
      const b = e.target.closest('[data-tx]'); if (!b || this.state !== 'riding') return;
      e.stopPropagation();
      const k = b.dataset.tx;
      if (k === 'skip') this.skip(); else if (k === 'change') this.choose(true); else if (k === 'out') this.getOut();
    });
  }
  // a cab that belongs to the service (dispatched or hired); traffic taxis become one when hired
  isCab(v) { return v && v === this.cab; }
  canHail() {
    const g = this.g, p = g.player;
    if (g.police.level > 0) return 'No cab will stop for you with the police on your tail.';
    if (g.missions.active) return 'Finish or abandon the current job first.';
    if (p.interior) return 'Step outside first.';
    if (p.state === 'vehicle') return p.passenger ? 'You’re already in a cab.' : 'Get out of the car first.';
    if (g.uw && g.uw.S.jail) return 'Not from in here.';
    if (taxiCarried(g) > TAXI_RULES.carry) return 'Cabline: “We don’t do deliveries.” Not with that much product on you.';
    return null;
  }
  // call a cab: the nearest free taxi in traffic turns round for you, else one is sent from out of sight
  call(preset) {
    const g = this.g, p = g.player, why = this.canHail();
    if (why) { g.ui.toast(why, 'warn'); g.audio.play('deny'); return false; }
    this.preset = preset || null;
    if (this.cab && (this.state === 'coming' || this.state === 'waiting')) { g.ui.toast(this.state === 'waiting' ? 'Your cab is waiting.' : 'Your cab is on its way.'); return true; }
    const pick = nearestRoadPoint(p.pos.x, p.pos.z); if (!pick) return false;
    let v = null, bd = 220;
    for (const c of g.vehicles.list) if (c.type === 'taxi' && c.mode === 'kin' && !c.burnt && c.health > 50) { const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); if (d < bd && d > 25) { bd = d; v = c; } }
    if (v) { g.traffic.release(v); v.mode = 'phys'; v.ai = null; v.vel.set(Math.sin(v.h) * 6, Math.cos(v.h) * 6); }
    else v = this.spawnCab(p.pos.x, p.pos.z);
    if (!v) { g.ui.toast('Cabline: “All our drivers are busy. Try again in a minute.”', 'warn'); return false; }
    this.adopt(v);
    this.state = 'coming'; this.pick = pick; this.t = 0; this.best = 1e9; this.stall = 0;
    v.drive.setGoal(pick.x, pick.z);
    g.ui.toast(`Cabline: a car is on its way (${fmtDist(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))}). Wait by the road.`);
    g.audio.play('ui');
    return true;
  }
  // a cab on a road node out of sight, 110-220 m away
  spawnCab(x, z) {
    const g = this.g, cands = [];
    // on Valen Point or in Cedar Fields South: the cab comes along the causeway or the tracks (Sessions 6B, 6C)
    if (extSide(x, z)) {
      const sp = extRoadSpots(x, z).filter(s => spotToward(s, x, z)).map(s => ({ s, d: Math.hypot(s.x - x, s.z - z) })).filter(o => o.d > 60 && !g.inView(o.s.x, 1, o.s.z, 4)).sort((a, b) => a.d - b.d);
      for (const { s } of sp.slice(0, 8)) if (!g.vehicles.nearby(s.x, s.z, 6).some(v => Math.hypot(v.pos.x - s.x, v.pos.z - s.z) < 5)) return g.vehicles.spawn('taxi', s.x, s.z, s.h, {});
    }
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (!RoadNet.degree(i, j)) continue;
      const nx = i * P, nz = j * P, d = Math.hypot(nx - x, nz - z);
      if (d < 110 || d > 220) continue;
      if (g.inView(nx, 1, nz, 4)) continue;
      cands.push({ i, j, d });
    }
    if (!cands.length) for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) if (RoadNet.degree(i, j)) { const d = Math.hypot(i * P - x, j * P - z); if (d > 60) cands.push({ i, j, d }); }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    // the nearest node with nobody standing on it (a car parked on one node shouldn't mean "no cabs")
    for (const c of cands.slice(0, 8)) {
      const nx = c.i * P, nz = c.j * P, h = Math.atan2(x - nx, z - nz);
      if (g.vehicles.nearby(nx, nz, 6).some(v => Math.hypot(v.pos.x - nx, v.pos.z - nz) < 5)) continue;
      return g.vehicles.spawn('taxi', nx + LANE * Math.cos(h), nz - LANE * Math.sin(h), h, {});
    }
    return null;
  }
  adopt(v) {
    const g = this.g;
    if (this.cab && this.cab !== v) this.release();
    this.cab = v; v.taxiCab = true; v.driver = 'npc'; v.mode = 'phys'; v.sleep = false; v.parked = false; v.legit = true; v.locked = false;
    v.drive = new DriveAI(v, g, 'taxi'); v.drive.cruise = CAB_SPEED;
  }
  // the cab goes back to cruising and is recycled like any car once it is far away
  release() {
    const v = this.cab; this.cab = null; this.state = 'idle'; this.dest = null;
    if (!v || !this.g.vehicles.list.includes(v)) return;
    v.taxiCab = false;
    if (v.driver === 'npc' && v.health > 0) { v.drive = new DriveAI(v, this.g, 'cruise'); const c = this.g.world.randomCurbSpot(v.pos.x, v.pos.z, 250, 700); v.drive.setGoal(c.x, c.z); }
  }
  // at the cab: hire it or carjack it
  approach(v) {
    const g = this.g;
    if (!this.isCab(v)) { if (v.mode === 'kin') { g.traffic.release(v); v.mode = 'phys'; v.ai = null; v.vel.set(0, 0); } this.adopt(v); this.state = 'waiting'; }
    v.ctl.throttle = 0; v.ctl.handbrake = true;
    const render = () => `<div class="hint">Cabline · ${fmtMoney(FARE_BASE)} plus ${fmtMoney(FARE_PER_KM)} a kilometre. You pick the destination on the map.</div>
      <div class="btns" style="display:flex;flex-direction:column;gap:8px"><button class="sbtn gold" data-act="hire">Hire the cab</button><button class="sbtn" data-act="jack">Carjack it (a crime)</button><button class="sbtn" data-act="no">Never mind</button></div>`;
    g.content.openSvc('Taxi', 'The driver looks up.', render, a => {
      g.ui.back();
      if (a === 'hire') { const why = this.canHail(); if (why) { g.ui.toast(why, 'warn'); g.audio.play('deny'); this.cab = null; this.state = 'idle'; v.ctl.handbrake = false; return; } this.choose(false); }
      else if (a === 'jack') { this.cab = null; this.state = 'idle'; v.taxiCab = false; v.drive = null; g.beginEnter(v); }
    });
  }
  // the map in destination mode
  choose(changing) {
    const g = this.g, mv = g.ui.mapView;
    const from = () => { const v = this.cab || g.player; return v.pos; };
    mv.startPick({
      title: changing ? 'Change destination' : 'Where to?',
      preset: this.preset,
      quote: (x, z) => { const f = from(), m = routeLen(f.x, f.z, x, z); return { m, fare: changing ? Math.round(this.meterFare() + fareFor(m) - FARE_BASE) : fareFor(m), name: placeNameAt(x, z), from: { x: f.x, z: f.z } }; },
      confirm: (x, z, q) => {
        if (!Money.can(q.fare, 'taxi')) { g.ui.toast(`The fare is ${fmtMoney(q.fare)}. You have ${fmtMoney(Money.available('taxi'))} (cash on you and in the bank).`, 'warn'); g.audio.play('deny'); return false; }
        if (changing) this.reroute(x, z, q); else this.board(x, z, q);
        return true;
      },
      cancel: () => { if (!changing && this.state === 'waiting') g.ui.toast('The cab waits a little longer.'); }
    });
    this.preset = null;
  }
  meterFare() { return fareFor(this.driven); }
  board(x, z, q) {
    const g = this.g, p = g.player, v = this.cab; if (!v || !g.vehicles.list.includes(v)) return;
    this.dest = { x, z, name: q.name }; this.quote = q.fare; this.driven = 0; this.state = 'riding'; this.leaving = false; this.t = 0; this.best = 1e9; this.stall = 0; this.recov = 0;
    this.lastPos = { x: v.pos.x, z: v.pos.z };
    p.state = 'vehicle'; p.vehicle = v; p.passenger = true; p.trans = null; p.vel.set(0, 0, 0); HitchLog.mark('boarded a cab');
    v.ctl.handbrake = false; v.drive.setGoal(x, z);
    g.cam.yaw = v.h; g.cam.revT = 0;
    g.audio.play('door');
    this.showHud(true);
    g.ui.toast(`To ${q.name}: ${fmtDist(q.m)}, ${fmtMoney(q.fare)}.`);
  }
  reroute(x, z, q) {
    const v = this.cab; if (!v) return;
    this.dest = { x, z, name: q.name }; this.quote = q.fare; this.best = 1e9; this.stall = 0;
    v.drive.setGoal(x, z); this.g.ui.toast(`New destination: ${q.name}. Fare now ${fmtMoney(q.fare)}.`);
  }
  // remaining route length from the cab to the destination
  remaining() { const v = this.cab; return v && this.dest ? routeLen(v.pos.x, v.pos.z, this.dest.x, this.dest.z) : 0; }
  // end of the ride: pay and step out on the kerb
  finish(paid, msg) {
    const g = this.g, p = g.player, v = this.cab;
    this.showHud(false);
    if (paid > 0) { Money.pay(paid, 'taxi', { partial: true }); g.save.stats.fastTravels = (g.save.stats.fastTravels || 0) + 1; }
    if (v && p.vehicle === v) {
      g.exitVehicle(true);
      v.driver = 'npc';
    }
    p.passenger = false;
    if (msg) g.ui.toast(msg, 'money');
    this.release();
  }
  // ask the driver to stop: the cab pulls over, then you step out and pay what the meter shows
  getOut() {
    if (this.state !== 'riding') return;
    const v = this.cab;
    if (v && v.speed > 1.5) { if (!this.leaving) { this.leaving = true; this.g.ui.toast('“Pulling over.”'); } return; }
    this.leaving = false;
    const fare = Math.min(this.quote, this.meterFare());
    this.finish(fare, `You get out. Meter: ${fmtMoney(fare)}.`);
  }
  // skip the drive: the screen dips and you arrive; the full agreed fare
  skip() {
    const g = this.g, v = this.cab; if (this.state !== 'riding' || !v || !this.dest || g.fading) return;
    if (taxiCarried(g) > 0) { g.ui.toast('Not with product on you: the driver takes the long way, and so do you.', 'warn'); g.audio.play('deny'); return; }
    const left = this.remaining(), fare = this.quote, d = this.dest;
    g.fade(() => {
      const kp = nearestRoadPoint(d.x, d.z) || d;
      v.pos.set(kp.x, groundY(kp.x, kp.z), kp.z); v.h = kp.h || v.h; v.vel.set(0, 0); v.yawRate = 0; v.syncMesh(0);
      g.player.pos.set(v.pos.x, v.pos.y, v.pos.z);
      for (let k = 0; k < 4; k++) g.chunks.update(kp.x, kp.z, g.frame);
      g.env.time = (g.env.time + left / CAB_SPEED / (g.save.settings.dayLength * 60) * 24) % 24;
      this.finish(fare, `Cabline dropped you at ${d.name}. ${fmtMoney(fare)}.`);
    });
  }
  showHud(on) {
    const el = $('taxiHud'); if (!el) return;
    el.classList.toggle('hidden', !on);
    document.body.classList.toggle('passenger', !!on);
    this._hudT = 0;
  }
  update(dt) {
    const g = this.g, p = g.player, v = this.cab;
    if (!v) return;
    if (!g.vehicles.list.includes(v) || v.burnt || v.health <= 0) {
      if (this.state === 'riding') this.finish(Math.min(this.quote, this.meterFare()), 'The cab is wrecked. You climb out.');
      else { this.cab = null; this.state = 'idle'; }
      return;
    }
    if (dt <= 0) return;
    this.t += dt;
    if (this.state === 'coming') {
      const d = Math.hypot(v.pos.x - this.pick.x, v.pos.z - this.pick.z);
      if (d < 8 && v.speed < 1.5) { this.state = 'waiting'; this.t = 0; v.ctl.handbrake = true; g.ui.toast('Your cab is here. Walk up to it.'); g.audio.play('horn', { x: v.pos.x, z: v.pos.z, dur: 0.25, pitch: 1.3, gain: 0.7 }); }
      else this.watch(dt, v.drive.remaining(), () => { this.pick = nearestRoadPoint(p.pos.x, p.pos.z) || this.pick; v.drive.setGoal(this.pick.x, this.pick.z); });
      // the player wandered off: follow them (re-aim every few seconds)
      if (this.t > 4 && Math.hypot(p.pos.x - this.pick.x, p.pos.z - this.pick.z) > 25) { this.t = 0; this.pick = nearestRoadPoint(p.pos.x, p.pos.z) || this.pick; v.drive.setGoal(this.pick.x, this.pick.z); }
      if (g.police.level > 0) { g.ui.toast('The cab turns off. Not with the police around.', 'warn'); this.release(); }
    } else if (this.state === 'waiting') {
      v.ctl.throttle = 0; v.ctl.handbrake = true; v.drive.wait = 0.5;
      if (this.t > 90 || Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z) > 120) { g.ui.toast('Your cab gave up waiting.'); this.release(); }
    } else if (this.state === 'riding') {
      if (p.vehicle !== v) { this.showHud(false); p.passenger = false; this.release(); return; }
      this.driven += Math.hypot(v.pos.x - this.lastPos.x, v.pos.z - this.lastPos.z); this.lastPos.x = v.pos.x; this.lastPos.z = v.pos.z;
      const d = Math.hypot(v.pos.x - this.dest.x, v.pos.z - this.dest.z);
      if (g.police.level > 0) { this.finish(Math.min(this.quote, this.meterFare()), 'The driver pulls over: “Out. I don’t need that kind of trouble.”'); return; }
      if (this.leaving) { v.drive.wait = 0.5; v.ctl.throttle = 0; v.ctl.handbrake = true; if (v.speed <= 1.5) this.getOut(); return; }
      if ((v.drive.arrived || d < 9) && v.speed < 1.2) { this.finish(this.quote, `You’ve arrived at ${this.dest.name}. ${fmtMoney(this.quote)}.`); return; }
      this.watch(dt, v.drive.remaining(), () => this.recover());
      this._hudT = (this._hudT || 0) - dt;
      if (this._hudT <= 0) { this._hudT = 0.5; this.renderHud(); }
    }
  }
  // progress watchdog: no real progress for a while -> recover. Progress is the way still to go along the route (a road
  // that bends away from the destination for a while is not a stall)
  watch(dt, d, recover) {
    if (d < this.best - 3) { this.best = d; this.stall = 0; }
    else this.stall += dt;
    if (this.stall > 14) { this.stall = 0; recover(); this.best = 1e9; }
  }
  // a driver who can't get through: reroute first, then take the short way (a short fade to the next junction)
  recover() {
    const g = this.g, v = this.cab; if (!v || !this.dest || g.fading) return;
    this.recov = (this.recov || 0) + 1;
    if (this.recov === 1) { v.drive.rev = 1.2; v.drive.route(this.dest.x, this.dest.z); return; }
    if (this.recov >= 4) { g.ui.toast('The driver gives up on the traffic and takes you straight there.'); this.skip(); return; }
    const nxt = v.drive.ahead(40) || this.dest;
    g.fade(() => { const kp = nearestRoadPoint(nxt.x, nxt.z) || nxt; v.pos.set(kp.x, groundY(kp.x, kp.z), kp.z); v.vel.set(0, 0); v.yawRate = 0; v.h = Math.atan2(this.dest.x - kp.x, this.dest.z - kp.z); v.syncMesh(0); v.drive.route(this.dest.x, this.dest.z); g.ui.toast('“Shortcut,” says the driver.'); });
  }
  renderHud() {
    const el = $('taxiHud'); if (!el || !this.dest) return;
    const left = this.remaining();
    el.querySelector('.td').textContent = this.dest.name;
    el.querySelector('.tm').textContent = `${fmtDist(left)} to go · fare ${fmtMoney(this.quote)} · meter ${fmtMoney(Math.min(this.quote, this.meterFare()))}`;
    const sk = el.querySelector('[data-tx="skip"]'); if (sk) sk.disabled = taxiCarried(this.g) > 0;
  }
}

