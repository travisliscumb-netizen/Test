/* =====================================================================
   [CORE+CONTENT] MISSIONS (template-driven, endless, difficulty scaled)
   ===================================================================== */
const CONTACTS = [
  { id: 'rosa', name: 'Rosa Calder', role: 'Courier dispatch', bx: 6, bz: 3, side: 1, along: 30, color: 0x46d4c4, types: ['delivery', 'courier', 'delivery'] },
  { id: 'tull', name: '"Sprocket" Tull', role: 'Street racer', bx: 9, bz: 1, side: 0, along: 46, color: 0xff8a3d, types: ['race', 'race', 'chase'] },
  { id: 'ines', name: 'Ines Varga', role: 'Vehicle broker', bx: 4, bz: 7, side: 3, along: 36, color: 0xd28cff, types: ['theft', 'chase', 'theft'] },
  { id: 'ferry', name: 'The Ferryman', role: 'Fixer', bx: 2, bz: 2, side: 0, along: 50, color: 0xffd84d, types: ['escape', 'hidden', 'survive'] },
  { id: 'dex', name: 'Dex Okafor', role: 'Mechanic', interior: 'motorworks', lx: -2.4, lz: -4.55, h: 0, color: 0x4d8dff, types: [], storyOnly: true },
  { id: 'moss', name: 'Sgt. Lena Moss', role: 'Police sergeant', interior: 'police', lx: 2.2, lz: -2.75, h: 0, color: 0x7fb2ff, types: [], storyOnly: true }
];
const MISSION_NAMES = {
  delivery: ['Hot Delivery', 'Express Lane', 'Before It Melts', 'Signed, Sealed'],
  courier: ['Pick Up, Drop Off', 'The Envelope', 'Dead Drop', 'No Questions'],
  theft: ['Repo Job', 'Wish List', 'Borrowed Wheels', 'Order Up'],
  escape: ['Heat Check', 'Ghost Protocol', 'Lose the Tail'],
  race: ['Harbor Sprint', 'Neon Loop', 'Gridlock Run', 'Quayside Dash'],
  hidden: ['Buried Treasure', 'The Stash', 'X Marks It'],
  chase: ['Runaway', 'Catch & Crush', 'Debt Collector'],
  survive: ['Hold the Line', 'Stand Your Ground', 'Siege Night']
};
class MarkerPool {
  constructor(scene) {
    this.scene = scene; this.items = [];
    const tex = makeRadialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64);
    const beamTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 40, 20, 1, true); this.beamGeo.translate(0, 20, 0);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    this.gemGeo = new THREE.OctahedronGeometry(0.45);
    this.beamTex = beamTex; this.glowTex = tex;
  }
  get(color, r = 3, beam = true) {
    let m = this.items.find(i => !i.used);
    if (!m) {
      const g = new THREE.Group();
      const bm = new THREE.MeshBasicMaterial({ map: this.beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const beamM = new THREE.Mesh(this.beamGeo, bm);
      const rm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(this.ringGeo, rm); ring.position.y = 0.08;
      const gem = new THREE.Mesh(this.gemGeo, new THREE.MeshBasicMaterial());
      g.add(beamM, ring, gem); this.scene.add(g);
      m = { g, beam: beamM, ring, gem, used: false };
      this.items.push(m);
    }
    m.used = true; m.g.visible = true;
    const col = new THREE.Color(color);
    m.beam.material.color.copy(col).multiplyScalar(1.2); m.ring.material.color.copy(col).multiplyScalar(2); m.gem.material.color.copy(col).multiplyScalar(2.5);
    m.beam.scale.set(r * 0.6, 1, r * 0.6); m.beam.visible = beam; m.ring.scale.setScalar(r);
    return m;
  }
  release(m) { if (m) { m.used = false; m.g.visible = false; } }
  update(t, cam) {
    for (const m of this.items) if (m.used) {
      m.gem.rotation.y = t * 2; m.gem.position.y = 2.6 + Math.sin(t * 2.5) * 0.25;
      const d = cam ? Math.hypot(cam.x - m.g.position.x, cam.z - m.g.position.z) : 50;
      m.gem.visible = d > 4.5; // right on top of it the gem only fills the camera
      const near = clamp((d - 3) / 25, 0.08, 1);
      m.beam.material.opacity = 0.42 * near;
      m.ring.material.opacity = (0.5 + Math.sin(t * 4) * 0.2) * clamp(d / 6, 0.35, 1);
    }
  }
}
class MissionManager {
  constructor(game) {
    const g = this.g = game;
    this.markers = new MarkerPool(g.scene);
    this.active = null; this.offer = null; this.cool = {};
    this.contacts = CONTACTS.map(c => {
      if (c.interior) {
        const w = g.content.interiors.wp(c.interior, c.lx, c.lz);
        const look = c.id === 'moss' ? copLook() : randomLook(mulberry32(c.lx * 100 + 7));
        if (c.id === 'dex') { look.shirt = C(0x1d4f8a); look.pants = C(0x2c3e50); look.hairStyle = 0; look.skin = C(0x5a3825); look.cap = null; look.build = 1.15; }
        if (c.id === 'moss') { look.hairStyle = 2; look.cap = null; look.hair = C(0x2e2018); look.build = 1.0; }
        const ch = { x: w.x, y: IY, z: w.z, h: c.h, look, pose: { phase: 0, amp: 0 }, flash: 0 };
        return { ...c, x: w.x, y: IY, z: w.z, b: null, ch, marker: null };
      }
      const b = g.world.block(c.bx, c.bz);
      const o = ROAD_HALF + 2.6;
      const pos = g.peds.ringPos(c.bx, c.bz, o, c.side * (P - 2 * o) + c.along);
      const look = randomLook(mulberry32(c.bx * 31 + c.bz));
      if (c.id === 'ferry') { look.shirt = C(0x2b2b2b); look.pants = C(0x1a1a1a); look.cap = C(0x3a2a1a); }
      if (c.id === 'rosa') { look.shirt = C(0x2a8a8a); look.hairStyle = 2; }
      if (c.id === 'tull') { look.shirt = C(0xd35400); look.cap = C(0x111111); }
      if (c.id === 'ines') { look.shirt = C(0x6a3a8a); look.hairStyle = 2; look.hair = C(0x111111); }
      const ch = { x: pos.x, y: CURB_H, z: pos.z, h: pos.h + Math.PI / 2, look, pose: { phase: 0, amp: 0 }, flash: 0 };
      return { ...c, x: pos.x, z: pos.z, b, ch, marker: null };
    });
    for (const c of this.contacts) c.marker = this.markers.get(c.color, 1.6, true);
    const sb = g.world.block(SPECIAL.safehouse.bx, SPECIAL.safehouse.bz).safehouse;
    this.safe = sb;
    this.safeMarker = this.markers.get(0x8fe39b, 1.2, true);
    this.garageMarker = this.markers.get(0x8fe39b, 2.6, false);
    this.objMarkers = [];
    this.time = 0;
  }
  get difficulty() { return Math.min(3.2, 1 + this.g.save.missionsCompleted * 0.12); }
  get repK() { return 1 + (this.g.content ? this.g.content.repLevel : 0) * 0.06; }
  generate(contact) {
    const type = pick(contact.types), d = this.difficulty, g = this.g;
    const title = pick(MISSION_NAMES[type]);
    const spec = { type, title, contact, d, reward: 0, desc: '' };
    const from = { x: contact.x, z: contact.z };
    switch (type) {
      case 'delivery': {
        const dest = g.world.randomCurbSpot(from.x, from.z, 320, 620 + d * 80);
        const dist = Math.hypot(dest.x - from.x, dest.z - from.z);
        spec.dest = dest; spec.fragile = Math.random() < 0.35;
        spec.time = Math.round(dist * 1.4 / (13 + d) * (1.3 - d * 0.06) + 18);
        spec.reward = Math.round((250 + dist * 0.8 * d) * this.repK / 10) * 10;
        spec.desc = `Get a parcel to ${districtNameAt(dest.x, dest.z)} in ${fmtTime(spec.time)}.${spec.fragile ? ' Fragile — keep the vehicle in one piece.' : ''}`;
        break;
      }
      case 'courier': {
        const a = g.world.randomCurbSpot(from.x, from.z, 160, 380), b = g.world.randomCurbSpot(a.x, a.z, 380, 700);
        spec.a = a; spec.b = b; spec.time = Math.round((Math.hypot(a.x - from.x, a.z - from.z) + Math.hypot(b.x - a.x, b.z - a.z)) * 1.4 / 12 + 40);
        spec.reward = Math.round((300 + 180 * d + Math.hypot(b.x - a.x, b.z - a.z) * 0.5) * this.repK / 10) * 10;
        spec.desc = `Collect a package in ${districtNameAt(a.x, a.z)} and drop it in ${districtNameAt(b.x, b.z)}.`;
        break;
      }
      case 'theft': {
        const cls = pick(d > 1.6 ? ['sports', 'muscle', 'suv', 'sports'] : ['sports', 'suv', 'pickup', 'sedan']);
        const at = g.world.randomCurbSpot(from.x, from.z, 250, 600);
        spec.cls = cls; spec.at = at; spec.alarm = d > 1.4 || Math.random() < 0.3;
        spec.reward = Math.round((550 + VEHICLES[cls].price * 0.04 + d * 200) * this.repK / 10) * 10;
        spec.desc = `A client wants a ${VEHICLES[cls].name}. Steal it and bring it to the Saltworks chop shop in good shape.`;
        break;
      }
      case 'escape': {
        spec.level = Math.min(4, 2 + Math.floor(d - 0.6));
        spec.reward = Math.round(380 * spec.level * (0.8 + d * 0.2) / 10) * 10;
        spec.desc = `Someone tipped off the cops. Survive a ${spec.level}-star manhunt and lose them.`;
        break;
      }
      case 'race': {
        const pts = []; let i = clamp(Math.round(from.x / P), 0, N), j = clamp(Math.round(from.z / P), 0, N);
        let pdx = 0, pdz = 0;
        const n = 6 + Math.floor(d * 2);
        for (let k = 0; k < n; k++) {
          const opts = DIRS.filter(([dx, dz]) => !(dx === -pdx && dz === -pdz) && i + dx >= 0 && i + dx <= N && j + dz >= 0 && j + dz <= N);
          const [dx, dz] = Math.random() < 0.45 && opts.some(o => o[0] === pdx && o[1] === pdz) ? [pdx, pdz] : pick(opts);
          i += dx; j += dz; pdx = dx; pdz = dz;
          pts.push({ x: i * P, z: j * P });
        }
        let len = Math.hypot(pts[0].x - from.x, pts[0].z - from.z); for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
        spec.pts = pts; spec.time = Math.round(len / (16 + d * 1.8) + 14);
        spec.reward = Math.round((450 + len * 0.45 * d) / 10) * 10;
        spec.desc = `${pts.length} checkpoints, ${fmtTime(spec.time)} on the clock. Any vehicle.`;
        break;
      }
      case 'hidden': {
        const s = g.world.randomSecret(from.x, from.z, 250, 650) || g.world.randomSecret(from.x, from.z, 50, 2000);
        const a = Math.random() * 6.28, r = rand(10, 45);
        spec.stash = s; spec.area = { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, r: 65 };
        spec.time = Math.round(200 - d * 15);
        spec.reward = Math.round((450 + d * 160) / 10) * 10;
        spec.desc = 'A courier stashed a bag somewhere in the marked area. Find it before someone else does.';
        break;
      }
      case 'chase': {
        spec.reward = Math.round((650 + d * 260) / 10) * 10;
        spec.desc = 'A debtor is skipping town. Chase down their car and wreck it.';
        break;
      }
      case 'survive': {
        spec.dur = Math.round(45 + d * 15);
        spec.reward = Math.round((750 + d * 320) / 10) * 10;
        spec.desc = `Hold out against a 3-star police response for ${spec.dur} seconds.`;
        break;
      }
    }
    return spec;
  }
  // restart the job that failed most recently (from the pause menu)
  retry() {
    const g = this.g, s = this.lastFailed;
    if (!s || this.active) return false;
    this.lastFailed = null; this.cool = {};
    g.police.lockLevel = 0; g.police.clear();
    this.start(s);
    return !!this.active;
  }
  objMarker(x, z, color = 0xffd84d, r = 4, beam = true) { const m = this.markers.get(color, r, beam); m.g.position.set(x, groundY(x, z), z); this.objMarkers.push(m); return m; }
  clearObj() { for (const m of this.objMarkers) this.markers.release(m); this.objMarkers = []; }
  start(spec) {
    const g = this.g;
    if (spec.locked) { g.ui.toast(spec.locked, 'warn'); g.audio.play('deny'); return; }
    if (spec.fee) { if (g.save.money < spec.fee) { g.ui.toast(`The buy-in is ${fmtMoney(spec.fee)}.`, 'warn'); g.audio.play('deny'); return; } g.content.spend(spec.fee); }
    if (g.player.interior && spec.type !== 'story') { g.ui.toast('Step outside first.', 'warn'); return; }
    this.offer = null; g.ui.hideOffer();
    if (g.events) g.events.clear();
    const m = this.active = { spec, t: 0, phase: 0, objective: '', target: null, timer: spec.time || 0, data: {} };
    g.audio.play('confirm');
    g.ui.banner(spec.title, spec.replay ? 'Replay \u00b7 ' + spec.contact.name : spec.contact.name, 'info', 2.2);
    if (spec.type === 'story') { g.campaign.begin(m); return; }
    if (spec.type === 'srace') { g.race.begin(spec.race, {}); m.timer = 0; return; }
    const pv = () => g.player.state === 'vehicle' ? g.player.vehicle : null;
    switch (spec.type) {
      case 'delivery': m.target = spec.dest; m.objective = `Deliver the parcel to ${districtNameAt(spec.dest.x, spec.dest.z)}`; this.objMarker(spec.dest.x, spec.dest.z); m.startHealth = pv() ? pv().health : 100; break;
      case 'courier': m.target = spec.a; m.objective = 'Collect the package'; this.objMarker(spec.a.x, spec.a.z); m.timer = spec.time; break;
      case 'theft': {
        const v = g.vehicles.spawn(spec.cls, spec.at.x, spec.at.z, spec.at.h, { parked: true });
        v.mission = 'theft'; v.touched = true; m.data.car = v; m.target = { x: v.pos.x, z: v.pos.z };
        m.objective = `Find the ${VEHICLES[spec.cls].name}`; this.objMarker(v.pos.x, v.pos.z, 0xffd84d, 3);
        m.timer = 0; break;
      }
      case 'escape': g.police.setLevel(spec.level); m.objective = 'Lose the police'; m.timer = 0; break;
      case 'race': m.data.i = 0; m.objective = pv() ? 'Race! Reach the first checkpoint' : 'Get in a vehicle to start the race'; m.data.started = false; m.timer = spec.time; break;
      case 'hidden': m.target = { x: spec.area.x, z: spec.area.z }; m.area = spec.area; m.objective = 'Search the marked area for the stash'; m.timer = spec.time; break;
      case 'chase': {
        const c = g.world.randomCurbSpot(g.player.pos.x, g.player.pos.z, 90, 170);
        const v = g.vehicles.spawn(pick(['sedan', 'suv', 'sports', 'compact']), c.x, c.z, c.h, { driver: 'npc', speed: 6 });
        v.mission = 'chase'; v.touched = true; v.health = 100 + spec.d * 25;
        v.drive = new DriveAI(v, g, 'flee'); v.drive.cruise = 19 + spec.d * 3;
        const far = g.world.randomCurbSpot(c.x, c.z, 400, 900); v.drive.setGoal(far.x, far.z);
        m.data.car = v; m.objective = 'Wreck the debtor’s car'; m.timer = 0; m.data.lost = 0;
        break;
      }
      case 'survive': g.police.setLevel(3); g.police.lockLevel = 3; m.timer = spec.dur; m.objective = 'Survive the police assault'; break;
    }
  }
  pass() {
    if (!this.active || this.active.done) return; // completion is idempotent: never pay twice
    this.active.done = true;
    const g = this.g, m = this.active, s = m.spec;
    const best = g.save.best[s.type];
    let extra = '';
    if (s.type === 'race' || s.type === 'delivery' || s.type === 'courier') {
      const used = Math.round(m.t * 10) / 10;
      if (!best || used < best) { g.save.best[s.type] = used; if (best) extra = ' · NEW RECORD'; }
    }
    const pay = Math.max(0, s.reward + (m.bonus || 0));
    g.addMoney(pay, true);
    this.lastFailed = null;
    g.save.missionsCompleted++; g.save.stats.missionsPassed++;
    g.audio.play('pass');
    g.ui.banner(s.type === 'srace' ? (m.data.place === 1 ? 'Race Won' : `Finished ${ordinal(m.data.place)}`) : 'Mission Passed', (pay ? fmtMoney(pay) : 'Respect') + extra, 'pass', 3.5);
    if (s.type === 'story') g.campaign.onPass(m);
    else { g.save.stats.sideDone++; if (s.rep) g.content.addRep(s.rep); }
    g.fx.flashLight(g.player.pos.x, g.player.pos.y + 3, g.player.pos.z, 8, 0.6, 0xffd080);
    this.cool[s.contact.id] = this.time + 20;
    this.end();
    g.saveGame();
  }
  fail(reason) {
    const g = this.g; if (!this.active) return;
    g.save.stats.missionsFailed++;
    this.lastFailed = this.active.spec;
    g.audio.play('fail');
    g.ui.banner('Mission Failed', reason, 'fail', 3);
    this.cool[this.active.spec.contact.id] = this.time + 6;
    this.end();
    g.saveGame();
  }
  end() {
    const g = this.g, m = this.active; if (!m) return;
    this.clearObj();
    if (m.spec.type === 'story') g.campaign.cleanup(m);
    if (g.race.active) g.race.end();
    if (m.data.car && g.vehicles.list.includes(m.data.car)) { m.data.car.mission = null; }
    if (m.spec.type === 'survive') g.police.lockLevel = 0;
    this.active = null;
    g.ui.setObjective(null);
  }
  onEvaded(level) {
    const g = this.g; g.save.stats.escapes++;
    if (level >= 4) g.ach('escape4');
    if (level >= 2) g.content.addRep(level * 4, 'lost the police');
    if (this.active && this.active.spec.type === 'escape') this.pass();
  }
  onVehicleDestroyed(v) {
    this.g.content.onVehicleGone(v);
    if (this.active && this.active.data.car === v && this.active.spec.type === 'theft') this.fail('The car was destroyed.');
  }
  onPlayerDown() { if (this.active) this.fail('You were taken out of the action.'); }
  update(dt) {
    const g = this.g, p = g.player;
    this.time += dt;
    this.markers.update(this.time, g.camera.position);
    // contacts & offers
    const camp = g.campaign;
    this.markT = (this.markT || 0) - dt;
    for (const c of this.contacts) {
      c.marker.g.position.set(c.x, c.y !== undefined ? c.y : CURB_H, c.z);
      const cooling = (this.cool[c.id] || 0) > this.time;
      c.visible = camp.contactVisible(c.id);
      c.marker.g.visible = !this.active && !cooling && c.visible && (!c.storyOnly || !!CAMPAIGN.find(d => d.giver === c.id && !camp.isDone(d.id) && camp.blocker(d) !== null));
      if (this.markT <= 0) {
        // story jobs glow gold, everything else keeps the contact's colour
        const story = !!CAMPAIGN.find(d => d.giver === c.id && !camp.isDone(d.id) && camp.blocker(d) === '');
        if (c._story !== story) { c._story = story; const col = new THREE.Color(story ? 0xffd84d : c.color); c.marker.beam.material.color.copy(col).multiplyScalar(story ? 1.6 : 1.2); c.marker.ring.material.color.copy(col).multiplyScalar(2); c.marker.gem.material.color.copy(col).multiplyScalar(2.5); c.marker.beam.scale.x = c.marker.beam.scale.z = story ? 1.4 : 0.96; }
      }
    }
    if (this.markT <= 0) this.markT = 0.5;
    this.safeMarker.g.position.set(this.safe.x, CURB_H, this.safe.z);
    this.garageMarker.g.position.set(this.safe.garage.x, 0.02, this.safe.garage.z);
    const home = !!(g.uw && g.uw.props.owned('linden'));
    this.safeMarker.g.visible = home && !g.player.interior; this.garageMarker.g.visible = home && !g.player.interior;
    if (g.uw) for (const gp of g.uw.props.garagePoints()) { if (gp.id === 'linden') continue; const m = this._gm || (this._gm = {}); if (!m[gp.id]) { m[gp.id] = this.markers.get(0x8fe39b, 2.6, false); } m[gp.id].g.position.set(gp.p.x, groundY(gp.p.x, gp.p.z) + 0.02, gp.p.z); m[gp.id].g.visible = !g.player.interior && dist2(gp.p.x, gp.p.z, g.player.pos.x, g.player.pos.z) < 120 * 120; }
    if (!this.active && g.state === 'playing') {
      let near = null;
      for (const c of this.contacts) {
        if ((this.cool[c.id] || 0) > this.time) continue;
        const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
        const pv = p.state === 'vehicle' ? p.vehicle : null;
        if (!c.marker.g.visible) continue;
        if (d < (pv ? 6 : 2.6) && (!pv || pv.speed < 4) && Math.abs(p.pos.y - (c.y !== undefined ? c.y : CURB_H)) < 4) near = c;
      }
      if (near && (!this.offer || this.offer.contact !== near)) { this.offer = camp.offerFor(near); if (this.offer) { g.ui.showOffer(this.offer); g.audio.play('ui'); } }
      if (!near && this.offer) { this.offer = null; g.ui.hideOffer(); }
    }
    const m = this.active; if (!m) return;
    m.t += dt;
    const s = m.spec;
    if (s.type === 'story') {
      camp.update(dt, m);
      if (this.active === m) g.ui.setObjective(m.objective + (m.extra || ''), m.timerOn ? m.timer : null);
      return;
    }
    if (s.type === 'srace') {
      const R = g.race.active; if (!R) return;
      const res = g.race.update(dt);
      m.target = R.target; m.objective = R.objective || '';
      if (res) {
        m.data.place = res.place || 0;
        if (res.reason || !res.place || res.place > 3) { this.fail(res.reason || `You finished ${ordinal(res.place)}.`); return; }
        s.reward = Math.round(s.race.reward * [1, 0.4, 0.2][res.place - 1] / 10) * 10;
        s.rep = res.place === 1 ? s.race.rep : Math.round(s.race.rep / 3);
        if (res.record) g.ui.toast(`New record: ${fmtRace(res.time)}`, 'money');
        this.pass(); return;
      }
      if (this.active === m) g.ui.setObjective(m.objective, null);
      return;
    }
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    const dTo = (t) => Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
    if (m.timer > 0 && s.type !== 'survive') { m.timer -= dt; if (m.timer <= 0 && (s.type !== 'theft' && s.type !== 'escape' && s.type !== 'chase')) { this.fail('Out of time.'); return; } }
    switch (s.type) {
      case 'delivery': {
        if (s.fragile && pv && m.startHealth !== undefined) { if (!m.data.v || m.data.v !== pv) { m.data.v = pv; m.startHealth = pv.health; } if (m.startHealth - pv.health > 40) { this.fail('The cargo is ruined.'); return; } }
        if (dTo(s.dest) < 7 && (!pv || pv.speed < 9)) { this.pass(); return; }
        break;
      }
      case 'courier': {
        if (m.phase === 0 && dTo(s.a) < 6 && (!pv || pv.speed < 9)) { m.phase = 1; this.clearObj(); this.objMarker(s.b.x, s.b.z); m.target = s.b; m.objective = `Drop the package in ${districtNameAt(s.b.x, s.b.z)}`; g.audio.play('pickup'); g.ui.toast('Package collected.', 'money'); }
        else if (m.phase === 1 && dTo(s.b) < 6 && (!pv || pv.speed < 9)) { this.pass(); return; }
        break;
      }
      case 'theft': {
        const v = m.data.car;
        if (!g.vehicles.list.includes(v) || v.burnt) { this.fail('The car is gone.'); return; }
        if (m.phase === 0) {
          this.objMarkers[0] && this.objMarkers[0].g.position.set(v.pos.x, v.pos.y, v.pos.z);
          m.target = { x: v.pos.x, z: v.pos.z };
          if (pv === v) {
            m.phase = 1; this.clearObj(); const cs = g.world.block(SPECIAL.chopshop.bx, SPECIAL.chopshop.bz).chopshop;
            m.data.drop = cs; this.objMarker(cs.x, cs.z, 0xffd84d, 5); m.target = cs; m.objective = 'Deliver the car to the chop shop';
            if (s.alarm) { g.police.setLevel(Math.max(g.police.level, 2)); g.ui.toast('The car alarm alerted the police!', 'warn'); }
          }
        } else {
          if (pv !== v) m.objective = 'Get back in the car';
          else m.objective = 'Deliver the car to the chop shop';
          if (pv === v && dTo(m.data.drop) < 8 && v.speed < 5) {
            if (v.health < 40) { this.fail('The client rejected the damaged car.'); return; }
            if (g.police.level > 0) { m.objective = 'Lose the police before dropping the car'; break; }
            this.pass(); g.exitVehicle(true); v.mission = 'sold'; setTimeout(() => { if (g.vehicles.list.includes(v) && g.player.vehicle !== v) g.vehicles.despawn(v); }, 4000); return;
          }
        }
        break;
      }
      case 'escape': if (g.police.level === 0 && m.t > 2) { this.pass(); return; } break;
      case 'race': {
        if (!m.data.started) {
          if (pv) {
            m.data.started = true; m.data.count = 3.2; m.objective = 'Get ready…';
            this.objMarker(s.pts[0].x, s.pts[0].z, 0xff8a3d, 8);
          } else { m.timer = s.time; break; }
        }
        if (m.data.count > 0) {
          const prev = Math.ceil(m.data.count); m.data.count -= dt; m.timer = s.time;
          const now = Math.ceil(m.data.count);
          if (now !== prev && now > 0) { g.ui.banner(String(now), '', 'info', 0.8); g.audio.play('checkpoint'); }
          if (m.data.count <= 0) { g.ui.banner('GO!', '', 'pass', 0.8); g.audio.play('pass'); m.t = 0; }
          if (pv) { pv.ctl.throttle = Math.min(pv.ctl.throttle, 0); pv.ctl.handbrake = true; }
          break;
        }
        const cp = s.pts[m.data.i];
        m.target = cp;
        m.objective = `Checkpoint ${m.data.i + 1} / ${s.pts.length}`;
        if (dTo(cp) < 10) {
          m.data.i++; g.audio.play('checkpoint'); this.clearObj();
          if (m.data.i >= s.pts.length) { this.pass(); return; }
          const nx = s.pts[m.data.i]; this.objMarker(nx.x, nx.z, m.data.i === s.pts.length - 1 ? 0xffd84d : 0xff8a3d, 8);
          m.timer += 2;
        }
        break;
      }
      case 'hidden': {
        const st = s.stash;
        const d = dTo(st);
        if (d < 22 && !m.data.seen) { m.data.seen = true; this.objMarker(st.x, st.z, 0xffd84d, 1.2); m.target = st; m.objective = 'Grab the stash'; g.audio.play('ui'); }
        if (d < 2.4 && p.state === 'foot') { g.audio.play('pickup'); this.pass(); return; }
        break;
      }
      case 'chase': {
        const v = m.data.car;
        if (!g.vehicles.list.includes(v)) { this.fail('The debtor got away.'); return; }
        m.target = { x: v.pos.x, z: v.pos.z };
        if (v.health <= 0) { m.objective = 'Target wrecked!'; if (!m.data.done) { m.data.done = true; setTimeout(() => { if (this.active === m) this.pass(); }, 1200); } break; }
        const d = dTo(v.pos);
        if (d > 320) { m.data.lost += dt; m.objective = `Don't lose them! ${Math.ceil(10 - m.data.lost)}`; if (m.data.lost > 10) { this.fail('The debtor got away.'); return; } }
        else { m.data.lost = 0; m.objective = `Wreck the debtor's car (${Math.max(0, Math.round(v.health))}%)`; }
        if (v.drive && v.drive.arrived) { const far = g.world.randomCurbSpot(v.pos.x, v.pos.z, 400, 900); v.drive.setGoal(far.x, far.z); }
        break;
      }
      case 'survive': {
        m.timer -= dt;
        if (m.timer <= 0) { g.police.lockLevel = 0; this.pass(); g.ui.toast('The police are still after you!', 'warn'); return; }
        break;
      }
    }
    g.ui.setObjective(m.objective, (s.type === 'survive' || (m.timer > 0 && s.time)) ? m.timer : null);
  }
}

