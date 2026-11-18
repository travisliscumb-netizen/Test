/* =====================================================================
   [UNDERWORLD] THE SOUTHSHORE FAIRGROUND: RIDES, KARTS, GAMES (129c, 179)
   - Rides: buy a ticket at a ride's gate (cash first, then the bank:
     'fairTicket') while it is loading and you are aboard (the player's
     'ride' state): seated where the scenery puts the seat, an onboard view
     you can look round in, off again at its gate when the ride stops (the
     Ferris wheel: after one turn, back at the bottom). Not with the police
     after you; nothing hurts you up there.
   - Go-karts: rent a kart at the booth for a five-minute session (you drive
     it: a real vehicle, 232) on the fair's own track with three other karts
     lapping it; laps timed through every sector, the best kept. Get out, or
     run out of time, and you hand it back at the booth.
   - Games: four carnival games at the midway's booths (509d's FairGame: a
     shooting gallery, a high striker, a ring toss, whack-a-mole), $5 a go;
     a good score wins a plush prize (small, big, giant), kept in the save.
     Prizes are never money: the fair is fun, not an income.
   - The Fair Office by the arch: what is running, the prices, your best
     lap and your prizes.
   ===================================================================== */
const FAIR_PRICE = { wheel: 10, coaster: 20, ship: 10, carousel: 5, drop: 15, kart: 25, game: 5 };
const FAIR_KART = { session: 300, ai: 3, near: 320 };
const FAIR_PRIZE = ['small plush', 'big plush', 'giant plush'];
class Fairground {
  constructor(g) { this.g = g; this.ride = null; this.kart = null; this.ai = []; this.game = null; this._seat = { p: null, f: null, u: null }; }
  get s() { const s = this.g.save; return s.fair || (s.fair = Fairground.fresh()); }
  static fresh() { return { rides: {}, kartBest: null, kartLaps: 0, prizes: [0, 0, 0], plays: 0 }; }
  get F() { return this.g.world && this.g.world.fair; }
  // a save's fair record: validated
  reset() {
    const s = this.g.save; if (!s) return;
    const T = s.fair && typeof s.fair === 'object' ? s.fair : Fairground.fresh();
    T.rides = T.rides && typeof T.rides === 'object' ? Object.fromEntries(Object.entries(T.rides).filter(([k, v]) => FAIR_PRICE[k] !== undefined && Number.isInteger(v) && v >= 0)) : {};
    T.kartBest = T.kartBest && isFinite(T.kartBest.t) && T.kartBest.t > 5 ? { t: T.kartBest.t } : null;
    T.kartLaps = Number.isInteger(T.kartLaps) && T.kartLaps >= 0 ? T.kartLaps : 0;
    T.prizes = [0, 1, 2].map(i => Array.isArray(T.prizes) && Number.isInteger(T.prizes[i]) && T.prizes[i] >= 0 ? T.prizes[i] : 0);
    T.plays = Number.isInteger(T.plays) && T.plays >= 0 ? T.plays : 0;
    s.fair = T;
    if (this.ride) this.endRide(true);
    if (this.kart) this.endKart(null);
    if (this.game) this.game.stop();
  }
  // ---------------------------------------------------------------- the rides
  // is ride `id` boarding now? { open, wait (s until it next opens), left }
  status(id, t = this.g.time) {
    if (id === 'wheel') return { open: true, wait: 0 };
    const st = FairClock[id](t);
    if (st.phase === 'load' && st.left > 2) return { open: true, wait: 0, left: st.left };
    return { open: false, wait: Math.ceil(st.phase === 'load' ? st.left + this.runOf(id) : st.left) };
  }
  runOf(id) { return id === 'coaster' ? fairCoaster().runT : id === 'carousel' ? FAIR.carousel.run : id === 'ship' ? FAIR.ship.run : id === 'drop' ? FAIR.drop.lift + FAIR.drop.hold + FAIR.drop.fall + FAIR.drop.brake + FAIR.drop.settle : 0; }
  findAction() {
    const g = this.g, p = g.player, F = this.F; if (!F || g.state !== 'playing' || this.ride) return null;
    if (p.state === 'foot' && !p.interior) {
      for (const R of Object.values(F.rides)) {
        if (Math.hypot(p.pos.x - R.at.x, p.pos.z - R.at.z) > 2.4) continue;
        if (R.id === 'kart') return this.kart ? null : { label: `Go-karts · a ${FAIR_KART.session / 60}-minute session · ${fmtMoney(FAIR_PRICE.kart)}`, act: () => this.rentKart() };
        const st = this.status(R.id);
        return st.open ? { label: `Ride ${R.name} · ${fmtMoney(FAIR_PRICE[R.id])}`, act: () => this.board(R.id) } : { label: `${R.name} · boarding in ${st.wait} s`, act: () => g.ui.toast(`${R.name} is running. Next boarding in ${st.wait} s.`, 'info') };
      }
      for (const G of F.games) if (Math.hypot(p.pos.x - G.x, p.pos.z - G.z) < 2.2) return { label: `${FAIR_GAMES[G.id].name} · ${fmtMoney(FAIR_PRICE.game)} a go`, act: () => this.play(G.id) };
      const d = g.world.places.fair && g.world.places.fair.door;
      if (d && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 2.4) return { label: 'Fair Office · Southshore Fairground', act: () => this.openOffice() };
    }
    return null;
  }
  board(id) {
    const g = this.g, p = g.player, R = this.F.rides[id];
    if (p.state !== 'foot' || this.ride) return '';
    if (g.police.level > 0) { g.ui.toast('Not with the police after you.', 'warn'); return 'wanted'; }
    if (!this.status(id).open) { g.ui.toast(`${R.name} is running. Wait for the next boarding.`, 'info'); return 'closed'; }
    if (!Money.pay(FAIR_PRICE[id], 'fairTicket')) { g.ui.toast(`A ticket is ${fmtMoney(FAIR_PRICE[id])}.`, 'warn'); return 'money'; }
    const t = g.time, k = id === 'wheel' ? FairClock.bottomGondola(t).i : 0;
    this.ride = { id, k, t0: t, started: id === 'wheel', end: id === 'wheel' ? t + FAIR.wheel.period : null };
    this.s.rides[id] = (this.s.rides[id] || 0) + 1;
    p.state = 'ride'; p.vel.set(0, 0, 0); p.invuln = 1e9;
    g.cam.yaw = 0; g.cam.pitch = 0;
    g.audio.play('cash');
    g.ui.toast(`${R.name}: ${id === 'wheel' ? 'one turn of the wheel' : 'hold on'}. Look around with the mouse or stick.`, 'info');
    this.rideStep(0);
    return '';
  }
  // per frame while aboard: the seat carries you; the ride ends when it has stopped again (the wheel: back at the bottom)
  rideStep(dt) {
    const g = this.g, p = g.player, r = this.ride; if (!r) return;
    const t = g.time, S = fairSeat(r.id, t, r.k, this._seat);
    p.pos.copy(S.p).addScaledVector(S.u, -0.9); p.h = Math.atan2(S.f.x, S.f.z); p.vel.set(0, 0, 0);
    if (r.id === 'wheel') { if (t >= r.end) this.endRide(); return; }
    const ph = FairClock[r.id](t).phase;
    if (ph === 'run') r.started = true; else if (r.started) this.endRide();
    void dt;
  }
  endRide(silent) {
    const g = this.g, p = g.player, r = this.ride; if (!r) return;
    const R = this.F.rides[r.id], e = R.exit;
    this.ride = null; p.state = 'foot'; p.invuln = 0.5;
    p.pos.set(e.x, groundY(e.x, e.z, FAIR.y + 2), e.z); p.vel.set(0, 0, 0); p.h = e.h;
    g.camera.up.set(0, 1, 0); g.cam.reset(e.h);
    if (!silent) g.ui.toast(`Off ${R.name}.`, 'info');
  }
  // the onboard view: from the seat, along the ride, the mouse or stick turning your head (rig.yaw, rig.pitch)
  rideCamera(rig, dt) {
    const g = this.g, r = this.ride; if (!r) return false;
    const S = fairSeat(r.id, g.time, r.k, this._seat), cam = rig.cam;
    rig.yaw = clamp(rig.yaw, -2.4, 2.4); rig.pitch = clamp(rig.pitch, -1.1, 0.9);
    const right = new THREE.Vector3().copy(S.f).cross(S.u).normalize(), dir = S.f.clone().applyAxisAngle(S.u, rig.yaw);
    dir.applyAxisAngle(right.clone().applyAxisAngle(S.u, rig.yaw), rig.pitch);
    const eye = S.p.clone().addScaledVector(S.u, 0.72);
    rig.pos.copy(eye); cam.position.copy(eye); cam.up.copy(S.u);
    cam.lookAt(eye.x + dir.x * 10, eye.y + dir.y * 10, eye.z + dir.z * 10);
    const fovT = clamp(g.save.settings.fov + 6, 40, 115); rig.fov = damp(rig.fov, fovT, 4, dt);
    if (Math.abs(cam.fov - rig.fov) > 0.01) { cam.fov = rig.fov; cam.updateProjectionMatrix(); }
    return true;
  }
  // ---------------------------------------------------------------- the karts
  rentKart() {
    const g = this.g, p = g.player, F = this.F;
    if (this.kart || p.state !== 'foot') return '';
    if (g.police.level > 0) { g.ui.toast('Not with the police after you.', 'warn'); return 'wanted'; }
    if (!Money.pay(FAIR_PRICE.kart, 'fairTicket')) { g.ui.toast(`A session is ${fmtMoney(FAIR_PRICE.kart)}.`, 'warn'); return 'money'; }
    // the first grid box with no kart on it
    const box = F.grid.find(q => !g.vehicles.list.some(v => Math.hypot(v.pos.x - q.x, v.pos.z - q.z) < 2.5)) || F.grid[F.grid.length - 1];
    const v = g.vehicles.spawn('kart', box.x, box.z, box.h, { color: VEHICLES.kart.colors[0] });
    v.legit = true; v.fairKart = 'rental';
    g.resetPlayerState(box.x + 1, box.z, box.h); g.completeEnter(v);
    this.kart = { v, until: g.time + FAIR_KART.session, laps: 0, best: 0, lapT: null, sect: 0, prev: null };
    this.s.rides.kart = (this.s.rides.kart || 0) + 1;
    g.ui.toast(`Your kart: ${FAIR_KART.session / 60} minutes on the track. Laps are timed from the line.`, 'money');
    return '';
  }
  endKart(why) {
    const g = this.g, K = this.kart; if (!K) return;
    this.kart = null;
    const p = g.player, B = this.F.rides.kart.exit;
    if (p.vehicle === K.v) g.exitVehicle(true);
    if (g.vehicles.list.includes(K.v)) g.vehicles.despawn(K.v);
    if (why !== null) { p.pos.set(B.x, groundY(B.x, B.z, FAIR.y + 2), B.z); p.vel.set(0, 0, 0); p.h = B.h; g.cam.reset(B.h); }
    if (why) g.ui.toast(`${why} ${K.laps} lap${K.laps === 1 ? '' : 's'}${K.best ? ', best ' + fmtRace(K.best) : ''}. You hand the kart back.`, 'info');
  }
  // the karts' safe speeds round the track (tight corners: √(6·R)), 19 m/s at most
  kartSpeeds() { const T = this.F.kart; return T._vs || (T._vs = loopSafeSpeeds(T, 6, 18.5, 6)); }
  kartStep(dt) {
    const g = this.g, K = this.kart, p = g.player;
    if (K) {
      if (!g.vehicles.list.includes(K.v) || K.v.burnt) { this.endKart('Your kart is out.'); return; }
      if (p.vehicle !== K.v) { this.endKart('Session over:'); return; }
      if (g.time > K.until) { this.endKart('Time’s up:'); return; }
      // lap timing: the line crossed forwards with every sector passed in order since the last time
      const T = this.F.kart, n = T.pts.length, k0 = T.sf.k, v = K.v;
      const sec = [0.25, 0.5, 0.75].map(f => T.pts[(k0 + Math.floor(n * f)) % n]);
      if (K.lapT !== null && K.sect < 3) { const q = sec[K.sect]; if (Math.hypot(v.pos.x - q[0], v.pos.z - q[1]) < 9) K.sect++; }
      const a = T.pts[(k0 - 1 + n) % n], b = T.pts[(k0 + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const along = ((v.pos.x - T.sf.x) * dx + (v.pos.z - T.sf.z) * dz) / l, lat = Math.abs((v.pos.x - T.sf.x) * dz - (v.pos.z - T.sf.z) * dx) / l;
      const crossed = K.prev !== null && K.prev < 0 && along >= 0 && lat < FAIR.kart.w / 2 + 1 && along < 6;
      K.prev = along;
      if (K.lapT !== null) K.lapT += dt;
      if (crossed) {
        if (K.lapT !== null && K.sect >= 3) {
          const t = Math.round(K.lapT * 100) / 100; K.laps++; this.s.kartLaps++;
          if (!K.best || t < K.best) K.best = t;
          const rec = !this.s.kartBest || t < this.s.kartBest.t; if (rec) this.s.kartBest = { t };
          g.ui.toast(`Lap ${K.laps}: ${fmtRace(t)}${rec ? ' · your best' : ''}`, rec ? 'money' : 'info');
        }
        K.lapT = 0; K.sect = 0;
      }
    }
    // the other karts lapping while you are near the fair
    const near = Math.hypot(p.pos.x - 1660, p.pos.z - 2010) < FAIR_KART.near;
    this.ai = this.ai.filter(v => g.vehicles.list.includes(v) && !v.burnt);
    if (near && this.ai.length < FAIR_KART.ai) {
      const T = this.F.kart, ck = loopCheckpoints(T, T.sf.k, { laps: 60 }, this.kartSpeeds());
      for (let i = this.ai.length; i < FAIR_KART.ai; i++) {
        const k = (T.sf.k + 30 + i * Math.floor(T.pts.length / (FAIR_KART.ai + 1))) % T.pts.length, q = T.pts[k], nx = T.pts[(k + 1) % T.pts.length];
        if (g.vehicles.list.some(o => Math.hypot(o.pos.x - q[0], o.pos.z - q[1]) < 4)) continue;
        const v = g.vehicles.spawn('kart', q[0], q[1], Math.atan2(nx[0] - q[0], nx[1] - q[1]), { driver: 'npc', color: VEHICLES.kart.colors[(i + 1) % VEHICLES.kart.colors.length] });
        v.fairKart = 'ai'; v.mission = 'fairkart';
        v.drive = new DriveAI(v, g, 'race');
        const start = ck.aiPath.reduce((b, c, j) => Math.hypot(c.x - q[0], c.z - q[1]) < Math.hypot(ck.aiPath[b].x - q[0], ck.aiPath[b].z - q[1]) ? j : b, 0);
        v.drive.path = ck.aiPath.slice(start + 1).map(c => ({ ...c })); v.drive.pi = 0; v.drive.wait = 0; v.drive.cruise = 15 - i * 1.2;
        this.ai.push(v);
      }
    } else if (!near && this.ai.length) { for (const v of this.ai) if (g.player.vehicle !== v) g.vehicles.despawn(v); this.ai = []; }
  }
  update(dt) {
    if (!this.F || dt <= 0) return;
    if (this.ride && this.g.player.state !== 'ride') this.ride = null;
    this.kartStep(dt);
  }
  // ---------------------------------------------------------------- the carnival games
  play(id) {
    const g = this.g; if (this.game) return '';
    if (!Money.pay(FAIR_PRICE.game, 'fairGame')) { g.ui.toast(`A go is ${fmtMoney(FAIR_PRICE.game)}.`, 'warn'); return 'money'; }
    this.s.plays++;
    this.game = new FairGame(g, id, tier => this.prize(id, tier));
    this.game.start();
    return '';
  }
  prize(id, tier) {
    const g = this.g; this.game = null; g.last = performance.now();
    if (tier > 0) { this.s.prizes[tier - 1]++; g.audio.play('cash'); g.ui.toast(`${FAIR_GAMES[id].name}: you win a ${FAIR_PRIZE[tier - 1]}!`, 'money'); }
    else g.ui.toast(`${FAIR_GAMES[id].name}: no prize this time.`, 'info');
    g.saveGame(true);
  }
  // ---------------------------------------------------------------- the Fair Office
  openOffice() {
    const g = this.g, C2 = g.content, F = this.F;
    const render = () => {
      const s = this.s, P = s.prizes;
      let h = `<div class="svcTop"><span>Rides ${Object.values(s.rides).reduce((a, b) => a + b, 0)}</span><span>Prizes ${P[0] + P[1] + P[2]}</span><span>${Money.html('fairTicket')}</span></div>`;
      h += '<h3>The rides</h3><div class="grid2">' + Object.values(F.rides).map(R => {
        const st = R.id === 'kart' ? { open: true } : this.status(R.id);
        const what = { wheel: 'A turn of the wheel, 44 m up over the fair and the beach.', coaster: `The Riptide: a ${Math.round(fairCoaster().ymax - FAIR.y)} m lift hill, the drop, a loop, the hills and the helix.`, ship: 'The Jolly Roger swings you up past the horizontal.', carousel: 'Twelve horses, round and round.', drop: `Freefall: ${FAIR.drop.h - 6} m up, then down.`, kart: `Your own kart on the fair’s track, ${FAIR_KART.session / 60} minutes, against three others.` }[R.id];
        return `<div class="card"><div class="t">${esc(R.name)}</div><div class="d">${esc(what)}</div><div class="stat"><span>Ticket</span><span>${fmtMoney(FAIR_PRICE[R.id])}</span></div><div class="stat"><span>Now</span><span>${st.open ? 'boarding' : 'running · ' + st.wait + ' s'}</span></div></div>`;
      }).join('') + '</div>';
      h += `<h3>The go-karts</h3><div class="stat"><span>Your best lap</span><span>${s.kartBest ? fmtRace(s.kartBest.t) : '—'}</span></div><div class="stat"><span>Laps</span><span>${s.kartLaps}</span></div>`;
      h += `<h3>The games</h3><div class="hint">${F.games.map(G => FAIR_GAMES[G.id].name).join(' · ')}: ${fmtMoney(FAIR_PRICE.game)} a go at the booths on the midway.</div>`;
      h += `<div class="stat"><span>Your prizes</span><span>${P[0]} small · ${P[1]} big · ${P[2]} giant</span></div>`;
      return h;
    };
    C2.openSvc('Fair Office', 'Attendant: “Rides at the gates, games on the midway, karts down the end. Cash or card.”', render, () => {});
  }
}
/* ---------------------------------------------------------------------- the carnival games (a full-screen 2D booth)
   Each: a few seconds of play on a canvas (pointer or touch to aim and act, Space or E to act, Esc to walk away),
   then a score and its prize tier (0 none, 1 small, 2 big, 3 giant). While a game is up the world waits (630). */
const FAIR_GAMES = {
  gallery: { name: 'Shooting Gallery', help: 'Twelve shots, thirty seconds. Tap or click a duck (or aim with the mouse and press Space).', tiers: [7, 9, 11] },
  striker: { name: 'High Striker', help: 'Three swings. Strike when the bar is at the top: ring the bell.', tiers: [70, 86, 97] },
  rings: { name: 'Ring Toss', help: 'Five rings. Press once to stop the aim, again to stop the power.', tiers: [2, 3, 4] },
  moles: { name: 'Whack-a-Mole', help: 'Twenty-five seconds. Whack the moles (tap, click, or keys 1–9).', tiers: [14, 20, 26] }
};
class FairGame {
  constructor(g, id, done) { this.g = g; this.id = id; this.def = FAIR_GAMES[id]; this.done = done; this.active = false; this.t = 0; this.score = 0; this.over = false; this.act = false; this.ptr = { x: 0.5, y: 0.5, down: false }; this.keys = []; }
  start() {
    const el = this.el = document.createElement('div');
    el.id = 'fairGame'; el.style.cssText = 'position:fixed;inset:0;z-index:60;background:#120d1c;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;font-family:inherit';
    el.innerHTML = `<div style="color:#ffd84d;font:700 22px/1.2 sans-serif;margin:8px">${esc(this.def.name)}</div><canvas width="960" height="540" style="width:min(96vw,170vh);max-height:78vh;aspect-ratio:16/9;border-radius:10px;background:#1d2b3a"></canvas><div class="fgHelp" style="color:#e8eef6;font:14px sans-serif;margin:8px;text-align:center;max-width:90vw">${esc(this.def.help)}</div><button class="sbtn" data-a="quit" style="margin:4px">Walk away</button>`;
    document.body.appendChild(el);
    this.cv = el.querySelector('canvas'); this.cx = this.cv.getContext('2d');
    const pos = e => { const r = this.cv.getBoundingClientRect(), q = e.touches ? e.touches[0] : e; this.ptr.x = (q.clientX - r.left) / r.width; this.ptr.y = (q.clientY - r.top) / r.height; };
    this._h = {
      move: e => pos(e),
      down: e => { pos(e); this.act = true; e.preventDefault(); },
      key: e => { if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { this.act = true; e.preventDefault(); } else if (e.code === 'Escape') this.finish(true); else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) this.keys.push(+e.code.slice(-1)); },
      click: e => { if (e.target.dataset && e.target.dataset.a === 'quit') this.finish(true); }
    };
    this.cv.addEventListener('pointermove', this._h.move); this.cv.addEventListener('pointerdown', this._h.down);
    window.addEventListener('keydown', this._h.key, true); el.addEventListener('click', this._h.click);
    this.active = true; this.init();
    this.g.audio.play('ui');
  }
  stop() { if (!this.el) return; this.active = false; window.removeEventListener('keydown', this._h.key, true); this.el.remove(); this.el = null; }
  finish(quit) {
    if (!this.active) return; const T = this.def.tiers, s = this.score, tier = quit ? 0 : s >= T[2] ? 3 : s >= T[1] ? 2 : s >= T[0] ? 1 : 0;
    this.stop(); this.done(tier);
  }
  // one frame from Game.tick while the game is up
  frame(dt) {
    dt = Math.min(dt, 0.05); this.t += dt;
    if (!this.over) this.step(dt); else if ((this.endT -= dt) <= 0) { this.finish(false); return; }
    this.act = false; this.keys.length = 0;
    if (this.active) this.draw();
  }
  end() { if (this.over) return; this.over = true; this.endT = 1.6; }
  // ---------------------------------------------------------------- each game's rules
  init() {
    const id = this.id;
    if (id === 'gallery') { this.shots = 12; this.ducks = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) this.ducks.push({ r, x: k / 5 + r * 0.07, up: true, hitT: 0 }); }
    if (id === 'striker') { this.swing = 0; this.best = 0; this.res = []; this.puck = 0; this.puckV = 0; }
    if (id === 'rings') { this.left = 5; this.stage = 0; this.aim = 0; this.pow = 0; this.flight = null; this.bottles = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) this.bottles.push({ x: 0.2 + k * 0.15 + (r % 2) * 0.075 - 0.0375, r, ring: false }); }
    if (id === 'moles') { this.holes = Array.from({ length: 9 }, () => ({ up: 0, t: 0, hit: 0 })); this.spawnT = 0.4; }
  }
  step(dt) {
    const id = this.id, P = this.ptr;
    if (id === 'gallery') {
      const sp = [0.16, -0.22, 0.3];
      for (const d of this.ducks) { d.x += sp[d.r] * dt; if (d.x > 1.08) d.x -= 1.16; if (d.x < -0.08) d.x += 1.16; if (d.hitT > 0 && (d.hitT -= dt) <= 0) d.up = true; }
      if (this.act && this.shots > 0) {
        this.shots--; this.g.audio.play('pistol', { gain: 0.35 });
        const hit = this.ducks.find(d => d.up && Math.abs(P.x - d.x) < 0.035 && Math.abs(P.y - (0.28 + d.r * 0.2)) < 0.06);
        if (hit) { hit.up = false; hit.hitT = 3; this.score++; }
      }
      if (this.shots <= 0 || this.t > 30) this.end();
    } else if (id === 'striker') {
      if (this.puckV || this.puck > 0) { this.puck += this.puckV * dt; this.puckV -= 2.6 * dt; if (this.puck <= 0) { this.puck = 0; this.puckV = 0; if (this.swing >= 3) this.end(); } }
      else if (this.act && this.swing < 3) {
        const ph = this.t * (2.2 + this.swing * 0.5), v = Math.abs(Math.sin(ph)), pc = Math.round(v * 100);
        this.swing++; this.res.push(pc); this.score = Math.max(this.score, pc); this.puckV = Math.sqrt(2 * 2.6 * v * 1.02); this.g.audio.play(pc >= 97 ? 'jackpot' : 'clank');
      }
    } else if (id === 'rings') {
      if (this.flight) { this.flight.t += dt * 1.6; if (this.flight.t >= 1) { const f = this.flight; this.flight = null; const b = this.bottles.find(q => !q.ring && Math.abs(q.x - f.x) < 0.03 && Math.abs((0.36 + q.r * 0.12) - f.y) < 0.045); if (b) { b.ring = true; this.score++; this.g.audio.play('cash'); } if (this.left <= 0) this.end(); } return; }
      if (this.stage === 0) { this.aim = 0.5 + 0.38 * Math.sin(this.t * 2.1); if (this.act) this.stage = 1; }
      else if (this.stage === 1) { this.pow = 0.5 + 0.5 * Math.sin(this.t * 2.9); if (this.act) { this.stage = 0; this.left--; this.flight = { x: this.aim, y: 0.3 + this.pow * 0.42, t: 0 }; } }
    } else if (id === 'moles') {
      if (this.t > 25) { this.end(); return; }
      this.spawnT -= dt;
      if (this.spawnT <= 0) { const free = this.holes.map((h, i) => h.up <= 0 ? i : -1).filter(i => i >= 0); if (free.length) { const h = this.holes[free[Math.floor(Math.random() * free.length)]]; h.up = 0.95 - this.t * 0.018; h.hit = 0; } this.spawnT = 0.62 - this.t * 0.012; }
      for (const h of this.holes) if (h.up > 0) h.up -= dt;
      const whack = i => { const h = this.holes[i]; if (h && h.up > 0 && !h.hit) { h.hit = 1; h.up = Math.min(h.up, 0.18); this.score++; this.g.audio.play('punch'); } };
      for (const k of this.keys) whack(k - 1);
      if (this.act) { const c = Math.floor(P.x * 3), r = Math.floor((P.y - 0.2) / 0.26); if (c >= 0 && c < 3 && r >= 0 && r < 3) whack(r * 3 + c); }
    }
  }
  draw() {
    const c = this.cx, W = 960, H = 540, id = this.id, P = this.ptr;
    c.fillStyle = '#1d2b3a'; c.fillRect(0, 0, W, H);
    // the booth's striped awning
    for (let k = 0; k < 12; k++) { c.fillStyle = k % 2 ? '#ffffff' : ({ gallery: '#2471a3', striker: '#d23a2a', rings: '#2e8b57', moles: '#e08a1e' })[id]; c.fillRect(k * 80, 0, 80, 46); }
    c.fillStyle = '#ffd84d'; c.font = '700 26px sans-serif'; c.textAlign = 'left'; c.fillText(`Score ${this.score}`, 24, 86);
    c.textAlign = 'right'; c.fillStyle = '#e8eef6';
    if (id === 'gallery') {
      c.fillText(`Shots ${this.shots} · ${Math.max(0, Math.ceil(30 - this.t))} s`, W - 24, 86);
      for (let r = 0; r < 3; r++) { c.fillStyle = '#3d2b1a'; c.fillRect(0, (0.28 + r * 0.2) * H + 26, W, 10); }
      for (const d of this.ducks) { const x = d.x * W, y = (0.28 + d.r * 0.2) * H; if (d.up) { c.fillStyle = '#f2c230'; c.beginPath(); c.ellipse(x, y, 30, 20, 0, 0, 7); c.fill(); c.beginPath(); c.arc(x + (d.r === 1 ? -22 : 22), y - 18, 12, 0, 7); c.fill(); c.fillStyle = '#e08a1e'; c.fillRect(x + (d.r === 1 ? -40 : 30), y - 20, 10, 6); } else { c.fillStyle = '#6a5a3a'; c.fillRect(x - 26, y + 14, 52, 8); } }
      c.strokeStyle = '#ff4a4a'; c.lineWidth = 3; c.beginPath(); c.arc(P.x * W, P.y * H, 18, 0, 7); c.moveTo(P.x * W - 28, P.y * H); c.lineTo(P.x * W + 28, P.y * H); c.moveTo(P.x * W, P.y * H - 28); c.lineTo(P.x * W, P.y * H + 28); c.stroke();
    } else if (id === 'striker') {
      c.fillText(`Swings ${3 - this.swing} · ${this.res.map(v => v + '%').join('  ')}`, W - 24, 86);
      const x = W / 2, y0 = H - 50, y1 = 110, top = y0 - (y0 - y1) * Math.min(1, this.puck);
      c.fillStyle = '#d8d2c4'; c.fillRect(x - 14, y1, 28, y0 - y1);
      for (let k = 0; k <= 10; k++) { c.fillStyle = '#2b2e33'; c.fillRect(x - 30, y0 - (y0 - y1) * k / 10, 60, 2); }
      c.fillStyle = this.score >= 97 && this.puck > 0.95 ? '#ffd84d' : '#c8a46a'; c.beginPath(); c.arc(x, y1 - 14, 26, Math.PI, 0); c.fill();
      c.fillStyle = '#d23a2a'; c.fillRect(x - 22, top - 10, 44, 20);
      // the power bar: where a strike now would send the puck
      if (!this.puckV && this.puck <= 0 && this.swing < 3) { const v = Math.abs(Math.sin(this.t * (2.2 + this.swing * 0.5))); c.fillStyle = '#2b2e33'; c.fillRect(120, y1, 40, y0 - y1); c.fillStyle = v > 0.96 ? '#ffd84d' : '#4ab3ff'; c.fillRect(120, y0 - (y0 - y1) * v, 40, (y0 - y1) * v); }
    } else if (id === 'rings') {
      c.fillText(`Rings ${this.left}`, W - 24, 86);
      for (const b of this.bottles) { const x = b.x * W, y = (0.36 + b.r * 0.12) * H; c.fillStyle = '#2e8b57'; c.fillRect(x - 9, y - 30, 18, 34); c.fillRect(x - 4, y - 44, 8, 16); if (b.ring) { c.strokeStyle = '#ffd84d'; c.lineWidth = 5; c.beginPath(); c.ellipse(x, y - 6, 20, 7, 0, 0, 7); c.stroke(); } }
      if (this.flight) { const f = this.flight, x = W / 2 + (f.x * W - W / 2) * f.t, y = H - 40 + (f.y * H - (H - 40)) * f.t - Math.sin(f.t * Math.PI) * 120; c.strokeStyle = '#ffd84d'; c.lineWidth = 5; c.beginPath(); c.ellipse(x, y, 22, 8, 0, 0, 7); c.stroke(); }
      else { c.strokeStyle = '#ff4a4a'; c.lineWidth = 3; c.beginPath(); c.moveTo(this.aim * W, H - 40); c.lineTo(this.aim * W, 120); c.stroke(); if (this.stage === 1) { c.fillStyle = '#2b2e33'; c.fillRect(40, 140, 30, 340); c.fillStyle = '#4ab3ff'; c.fillRect(40, 480 - 340 * this.pow, 30, 340 * this.pow); } }
    } else if (id === 'moles') {
      c.fillText(`${Math.max(0, Math.ceil(25 - this.t))} s`, W - 24, 86);
      this.holes.forEach((h, i) => { const x = (i % 3 + 0.5) / 3 * W, y = (0.2 + (Math.floor(i / 3) + 0.6) * 0.26) * H; c.fillStyle = '#3b2716'; c.beginPath(); c.ellipse(x, y + 26, 70, 22, 0, 0, 7); c.fill(); if (h.up > 0) { c.fillStyle = h.hit ? '#8a6a4a' : '#7a5230'; c.beginPath(); c.ellipse(x, y, 40, 44, 0, Math.PI, 0); c.fill(); c.fillRect(x - 40, y, 80, 24); c.fillStyle = '#111'; c.beginPath(); c.arc(x - 14, y - 16, 5, 0, 7); c.arc(x + 14, y - 16, 5, 0, 7); c.fill(); } c.fillStyle = '#e8eef6'; c.font = '16px sans-serif'; c.textAlign = 'center'; c.fillText(String(i + 1), x, y + 62); });
    }
    if (this.over) { const T = this.def.tiers, s = this.score, tier = s >= T[2] ? 3 : s >= T[1] ? 2 : s >= T[0] ? 1 : 0; c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, H / 2 - 50, W, 100); c.fillStyle = '#ffd84d'; c.font = '700 34px sans-serif'; c.textAlign = 'center'; c.fillText(tier ? `You win a ${FAIR_PRIZE[tier - 1]}!` : 'No prize this time', W / 2, H / 2 + 12); }
  }
}
