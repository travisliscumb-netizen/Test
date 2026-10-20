/* =====================================================================
   [CORE] GAME
   ===================================================================== */
let game = null;
class Game {
  // the save object is swapped on load / new career / quit; whichever is current reports money changes
  get save() { return this._save; }
  set save(v) { this._save = MoneyFeed.bind(v); }
  constructor() {
    const loaded = SaveSystem.load();
    this.save = loaded.data; this.hasSave = loaded.existed && loaded.data.stats.playTime > 3; this.migrated = !!loaded.migrated;
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fb0c0, 0.002);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.15, 3000);
    this.time = 0; this.frame = 0; this.state = 'loading'; this.focus = new THREE.Vector3(6.5 * P, 0, 5 * P);
    this.debug = { open: false, god: false, col: false };
    this.input = new InputManager(this.canvas);
    this.audio = new AudioSystem();
    this.audio.vol = { master: this.save.settings.volume, music: this.save.settings.music, sfx: this.save.settings.sfx };
    this.dyn = new DynHash(8);
    this.frustum = new THREE.Frustum(); this._sph = new THREE.Sphere(); this._pm = new THREE.Matrix4();
    this.fps = 60; this.menuT = 0; this.saveT = 30; this.slowT = 0; this.propT = 0; this.promptT = 0;
    this.usePost = true; this.propR = 170; this.parkedR = 130; this.mapOpen = false; this.lifeToken = 0; this.session = 0;
  }
  async init(progress) {
    initTemplates();
    progress(0.08, 'Surveying the island'); await nextFrame();
    this.world = new World(); this.world.generate();
    if (this.world.towerTop) Object.assign(INTERIOR_DEFS.penthouse, { at: { x: this.world.towerTop.x, z: this.world.towerTop.z }, floorY: this.world.towerTop.y });
    defineHomeProps(this.world);
    for (const id of this.world.homeProps) { const d = PROP_BY_ID[id], h = d.home && this.world.homes.find(x => x.id === d.home); if (h && h.garageRect) hollowGarage(this.world, h, id); }
    progress(0.3, 'Pouring concrete'); await nextFrame();
    this.scenery = buildStaticScenery(this.scene, this.world);
    this.env = new Environment(this);
    this.chunks = new ChunkManager(this);
    this.props = new PropManager(this);
    progress(0.5, 'Hiring pedestrians'); await nextFrame();
    this.chars = new CharacterRenderer(this.scene);
    this.player = new Player(this);
    this.cam = new CameraRig(this.camera, this);
    this.quality = new QualityManager(this);
    this.vehicles = new VehicleManager(this);
    this.traffic = new TrafficManager(this);
    this.peds = new PedManager(this);
    this.police = new PoliceManager(this);
    this.fx = new FXSystem(this);
    this.blobs = new ShadowBlobs(this.scene);
    this.combat = new CombatSystem(this);
    this.content = new ContentManager(this);
    this.gamble = new Gamble(this);
    this.taxi = new TaxiService(this);
    this.doors = new DoorSystem(this);
    this.vspaces = new VSpaces(this);
    this.campaign = new Campaign(this);
    this.race = new RaceManager(this);
    this.stunts = new StuntTracker(this);
    this.events = new EventManager(this);
    this.missions = new MissionManager(this);
    this.player.applyOutfit(this.save.outfit);
    this.ui = new UIManager(this);
    this.uw = new Underworld(this);
    this.garageDisplay = new GarageDisplay(this);
    this.dealers = new DealerLots(this);
    this.entrances = new EntranceDressing(this); this.bizSigns = this.entrances;
    this.tutorial = new Tutorial(this);
    progress(0.68, 'Fueling vehicles'); await nextFrame();
    this.quality.apply();
    const sh = this.missions.safe; this.player.spawn(sh.x + 3.2, sh.z + 0.6, Math.PI / 2);
    this.env.time = this.save.timeOfDay;
    this.menuCam(0);
    this.env.update(0.016);
    for (let k = 0; k < 6; k++) { this.chunks.update(this.focus.x, this.focus.z, this.frame++); }
    progress(0.85, 'Compiling shaders'); await nextFrame();
    try { this.renderer.compile(this.scene, this.camera); } catch { /* compile is an optimisation only */ }
    this._bindGlobal();
    this._bindDebug();
    progress(1, 'Ready'); await nextFrame();
    this.showMenu();
    this.last = performance.now();
    const loop = (t) => { requestAnimationFrame(loop); this.tick(t); };
    requestAnimationFrame(loop);
  }
  _bindGlobal() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    this.input.onLockLost = () => { if (this.state === 'playing' && !this.input.usingTouch && !this.ui.modal && !this.mapOpen) this.pause(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    const unlockAudio = () => { this.audio.init(); this.audio.setVolumes({ master: this.save.settings.volume, music: this.save.settings.music, sfx: this.save.settings.sfx }); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlockAudio, { passive: true }));
    if (IS_TOUCH) document.body.classList.add('touch');
    window.addEventListener('beforeunload', () => { if (this.state !== 'menu' && this.state !== 'loading') this.saveGame(); });
  }
  setupPost(msaa) {
    const r = this.renderer;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.38, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.fxaa = null;
    if (!msaa) { this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa); }
  }
  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.mapOpen && this.ui) this.ui.fitBigMap();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      if (this.fxaa) { const pr = this.renderer.getPixelRatio(); this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); }
    }
  }
  inView(x, y, z, r) { this._sph.center.set(x, y, z); this._sph.radius = r; return this.frustum.intersectsSphere(this._sph); }
  // ---------------- state flow ----------------
  showMenu() {
    this.state = 'menu'; MoneyFeed.live = false;
    $('loading').style.opacity = 0; setTimeout(() => $('loading').classList.add('hidden'), 600);
    this.ui.show('mainMenu', true); this.ui.show('hud', false); this.ui.show('touch', false); this.ui.show('pauseMenu', false);
    $('btnContinue').disabled = !this.hasSave;
    const uw = this.save.uw;
    $('continueSub').textContent = this.hasSave ? `${fmtMoney(this.save.money)} · ${uw && uw.jail ? 'in County Jail' : 'day ' + (uw ? Math.max(1, uw.day - (uw.dayOffset || 0)) : 1)} · ${this.uw ? STAGES[Math.min(6, (uw && uw.stageMax) || 0)].name : ''}` : 'No saved career yet';
    window.__pvBooted = true;
  }
  newGame() {
    const settings = this.save.settings;
    this.save = SaveSystem.defaults(); this.save.settings = settings;
    this.player.mag = { pistol: 0, smg: 0, shotgun: 0 }; this.player.weapon = 0; this.player.vest = 0; this.player.boostT = 0;
    this.player.applyOutfit(this.save.outfit);
    this.missions.cool = {};
    this.uw.bind(this.save); if (this.bizSigns) this.bizSigns.refresh();
    this.saveGame(true);
    this.hasSave = true;
    this.startPlay(true);
  }
  continueGame() { this.startPlay(false); }
  startPlay(fresh) {
    this.session++;
    this.audio.init();
    this.audio.setVolumes({ master: this.save.settings.volume, music: this.save.settings.music, sfx: this.save.settings.sfx });
    this.fade(() => {
      this.gamble.reset();
      this.ui.closeAll();
      MoneyFeed.live = true;
      const gmsg = this.gamble.recover();
      this.ui.show('mainMenu', false); this.ui.show('hud', true);
      this.ui.show('touch', IS_TOUCH);
      this.police.clear(); if (this.missions.active) this.missions.end();
      this.content.reset(); this.events.clear();
      this.player.applyOutfit(this.save.outfit);
      this.lifeToken++; $('gameover').classList.add('hidden');
      this.player.vest = clamp(this.save.vest || 0, 0, VEST_MAX);
      // fresh: on the street in the Old Quarter with nothing. continue: where you last saved
      const start = fresh ? null : this.save.pos;
      if (start) this.resetPlayerState(start.x, start.z, start.h);
      else { const lp = this.uw.loc('prop', 'pawn'), sp = sidewalkSpot(2, 6, 0, 52); this.resetPlayerState(sp.x, sp.z, Math.atan2(lp.x - sp.x, lp.z - sp.z)); }
      this.env.time = this.save.timeOfDay;
      this.uw.S.lastHour = Math.floor(this.env.time);
      this.uw.gangs.reset(); this.uw.pickups.clear();
      this.state = 'playing';
      if (this.uw.S.jail) this.uw.prison.enter(); else this.uw.ui.showJail(false);
      this.input.wantLock = !IS_TOUCH; this.relock();
      this.ui.lastMoney = -1;
      if (fresh) {
        this.ui.banner('Port Valen', 'Old Quarter \u00b7 $0 \u00b7 nobody knows your name', 'info', 3.5);
        this.later(1400, () => this.ui.toast(IS_TOUCH ? 'Left stick moves. Drag on the right to look around. PHONE opens your empire.' : 'WASD moves, mouse looks. Shift sprints, Space jumps. Tab opens your empire.'));
        this.later(5200, () => this.ui.toast('Ideas: lift a wallet from behind (E), mug someone, break into a parked car, or sell a stolen one at the chop shop.'));
        this.later(9000, () => this.content.phone('unknown', 'Heard you’re new and broke. Lucky’s Pawn on Ninth Street buys whatever falls into your pockets. No questions.'));
      } else {
        this.ui.toast(this.uw.S.jail ? 'You’re still inside. Serve your time or work the system.' : 'Back on the street.');
      }
      for (const m of gmsg) this.ui.toast(m, 'money');
      if (gmsg.length) this.saveGame();
    }, true);
  }
  pause() {
    if (this.state !== 'playing') return;
    if (this.mapOpen) this.ui.toggleMap(false);
    this.ui.closeConfirm();
    this.state = 'paused';
    const lf = this.missions.lastFailed;
    this.ui.show('btnRetry', !!lf && !this.missions.active);
    if (lf) $('retrySub').textContent = lf.title + (lf.contact ? ' \u00b7 ' + lf.contact.name : '');
    this.ui.show('pauseMenu', true);
    $('btnQuick').disabled = !this.canQuickSave();
    $('quickSub').textContent = this.canQuickSave() ? 'Safe right now' : this.quickSaveWhy();
    this.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
    this.saveGame();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.ui.closeAll(); this.ui.show('pauseMenu', false);
    this.state = 'playing'; this.relock();
  }
  relock() { if (!IS_TOUCH && !this.input.usingTouch && !this.input.noLock) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not available */ } } }
  quitToMenu() {
    this.session++; this.lifeToken++;
    this.saveGame();
    if (this.missions.active) this.missions.fail('Abandoned.');
    if (this.player.state === 'vehicle') this.exitVehicle(true);
    this.content.reset(); this.events.clear();
    this.police.clear();
    // Continue always resumes the last committed save, never unsaved chaos from memory
    const loaded = SaveSystem.load(); this.save = loaded.data; this.hasSave = loaded.existed;
    this.uw.ui.showJail(false); this.uw.bind(this.save); if (this.bizSigns) this.bizSigns.refresh(); this.player.applyOutfit(this.save.outfit);
    this.player.mag = { pistol: 0, smg: 0, shotgun: 0 }; this.player.weapon = 0;
    this.ui.closeAll(); this.ui.show('pauseMenu', false); this.ui.show('banner', false);
    this.input.wantLock = false;
    this.showMenu();
  }
  // Screen fade around a state change. One at a time: a second request while fading is
  // dropped (returns false) unless forced; the screen always comes back even if mid() throws.
  fade(mid, force) {
    if (this.fading && !force) return false;
    this.fading = true;
    const f = $('fade'); f.style.opacity = 1;
    setTimeout(() => {
      try { mid(); } finally { setTimeout(() => { f.style.opacity = 0; this.fading = false; }, 150); }
    }, 500);
    return true;
  }
  // Saving rules: a save is a snapshot of a calm moment. It is written only when the player is
  // stable (no wanted level, no fight, no job, not mid-transition) unless forced by a manual
  // save point or a state the game controls (jail, a new career). Settings save on their own.
  saveGame(force) {
    SaveSystem.lastError = null;
    if (!this.env || this.wiped) return false;
    SaveSystem.saveSettings(this.save.settings);
    if (!force && (this.state === 'menu' || this.state === 'loading')) return false;
    const jail = this.uw && this.uw.S.jail;
    if (!force && !jail && !(this.uw && this.uw.isStable())) return false;
    this.save.timeOfDay = this.env.time;
    const p = this.player;
    if (this.state !== 'menu' && this.state !== 'loading') this.save.vest = Math.round(clamp(p.vest || 0, 0, VEST_MAX) * 10) / 10;
    if (this.state === 'menu' || this.state === 'loading') { /* new career: keep the default start */ }
    else if (!jail && !p.interior && (p.state === 'foot' || p.state === 'vehicle') && isFinite(p.pos.x)) {
      // a vehicle save restores you standing beside it (owned cars are in the garage list)
      this.save.pos = { x: p.pos.x, z: p.pos.z, h: p.h };
    } else if (p.interior && p.interior.id !== 'prison') { const d = p.interior.def.door; this.save.pos = { x: d.x + Math.sin(d.h) * 2, z: d.z + Math.cos(d.h) * 2, h: d.h }; }
    const ok = SaveSystem.save(this.save);
    if (ok) this.lastSave = performance.now();
    return ok;
  }
  autosave(reason) {
    if (this.state !== 'playing') return;
    if (this.saveGame(false)) { this.ui.toast('Autosaved · ' + reason); this.pendingAutosave = null; return; }
    if (SaveSystem.lastError) { this.pendingAutosave = null; this.saveFailToast(); return; } // storage refused: don't retry every frame
    this.pendingAutosave = reason; // not a stable moment yet: retried when things calm down
  }
  saveFailToast() { if (performance.now() - (this._saveFailT || -1e9) > 20000) { this._saveFailT = performance.now(); this.ui.toast('Could not save: browser storage is full or blocked.', 'warn'); } }
  canQuickSave() {
    const p = this.player, v = p.state === 'vehicle' ? p.vehicle : null;
    return !!(this.uw && this.uw.isStable() && v && (v.garageUid || v.owned) && v.speed < 2 && !this.uw.S.jail);
  }
  quickSaveWhy() {
    const p = this.player, v = p.state === 'vehicle' ? p.vehicle : null;
    if (!v || !(v.garageUid || v.owned)) return 'Only in a car you own';
    if (this.police.level > 0) return 'Not while wanted';
    if (v.speed >= 2) return 'Stop the car first';
    return 'Not during a fight or job';
  }
  quickSave() {
    if (!this.canQuickSave()) { this.ui.toast('Quick save: ' + this.quickSaveWhy(), 'warn'); this.audio.play('deny'); return; }
    if (this.saveGame(true)) { this.ui.toast('Quick saved in your car.', 'money'); this.audio.play('confirm'); }
    else { this.saveFailToast(); this.audio.play('deny'); }
  }
  ach(id) { this.content.ach(id); }
  // a delayed call that is dropped if the player quits or starts a new career meanwhile
  later(ms, fn) { const s = this.session; setTimeout(() => { if (s === this.session && this.state !== 'menu' && this.state !== 'loading') fn(); }, ms); }
  addMoney(n, earned) {
    this.save.money = Math.max(0, this.save.money + n);
    if (earned && n > 0) { this.save.stats.earned += n; this.audio.play('cash'); }
  }
  // ---------------- death / arrest ----------------
  onPlayerDeath(src) {
    if (this.mapOpen) this.ui.toggleMap(false);
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.save.stats.wasted++;
    this.missions.onPlayerDown();
    if (this.player.state === 'vehicle') this.exitVehicle(true);
    this.player.state = 'dead'; this.player.pose.downDir = 1;
    this.slowT = 2;
    const go = $('gameover'); go.className = 'dead'; go.querySelector('.gt').textContent = 'Hospitalized';
    const fee = Math.round(Math.min(1500, Math.max(100, Math.round(this.save.money * 0.1))) * (1 - (this.uw ? this.uw.props.perk('medic') : 0)));
    go.querySelector('.gs').textContent = `Medical bills: ${fmtMoney(fee)}`;
    const token = ++this.lifeToken;
    setTimeout(() => { if (token === this.lifeToken && this.state === 'dead') go.classList.remove('hidden'); }, 900);
    setTimeout(() => { if (token === this.lifeToken) this.respawn('hospital', fee); }, 4200);
    void src;
  }
  onBusted() {
    if (this.mapOpen) this.ui.toggleMap(false);
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.save.stats.busted++;
    this.missions.onPlayerDown();
    if (this.player.state === 'vehicle') this.exitVehicle(true);
    this.player.state = 'busted';
    const go = $('gameover'); go.className = 'busted'; go.querySelector('.gt').textContent = 'Busted';
    const ch = this.uw.prison.charges();
    const lv = this.player.lastVehicle;
    this.uw.prison.pending = { ch, veh: lv && this.vehicles.list.includes(lv) && dist2(lv.pos.x, lv.pos.z, this.player.pos.x, this.player.pos.z) < 20 * 20 ? lv : null };
    go.querySelector('.gs').textContent = `Facing ${fmtDays(ch.total)} · everything you carry is evidence now`;
    this.audio.play('radio');
    this.input.releaseAll();
    const token = ++this.lifeToken;
    setTimeout(() => { if (token === this.lifeToken && this.state === 'busted') go.classList.remove('hidden'); }, 500);
    setTimeout(() => { if (token === this.lifeToken) this.respawn('jail', 0); }, 4000);
  }
  // The one path that puts the player back into a clean, controllable state.
  resetPlayerState(x, z, h) {
    const p = this.player;
    if (p.state === 'vehicle' && p.vehicle) this.exitVehicle(true);
    if (p.interior && p.interior.vspace) { p.interior = null; this.vspaces.reset(); }
    if (p.interior) this.content.interiors.exit(true);
    const sp = this.clearSpot(x, z);
    h = this.openHeading(sp.x, sp.z, h);
    p.spawn(sp.x, sp.z, h);
    this.input.releaseAll();
    this.cam.reset(h);
    this.slowT = 0; this.police.bust = 0;
    this.ui.prompt(null);
    $('bustbar').classList.add('hidden');
  }
  // nearest spot (spiralling out) where a standing player fits without touching anything
  clearSpot(x, z, rad = 0.7) {
    const grid = this.world.grid, res = {};
    const fits = (px, pz) => {
      const y = groundY(px, pz);
      if (grid.resolveCircle(px, pz, rad, y + 0.2, y + 1.7, res).hit) return false;
      for (const v of this.vehicles.nearby(px, pz, 4)) { const lp = v.toLocal(px, pz); if (Math.abs(lp.x) < v.spec.w / 2 + rad && Math.abs(lp.z) < v.spec.l / 2 + rad) return false; }
      return true;
    };
    if (fits(x, z)) return { x, z };
    for (let ring = 1; ring <= 10; ring++) for (let k = 0; k < 12; k++) {
      const a = (k + ring * 0.5) / 12 * Math.PI * 2, px = x + Math.cos(a) * ring * 0.6, pz = z + Math.sin(a) * ring * 0.6;
      if (fits(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }
  // keep the requested heading unless something is right in front; then turn toward open space
  openHeading(x, z, h) {
    const grid = this.world.grid, res = {}, y = groundY(x, z);
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const hh = h + k * Math.PI / 4, px = x + Math.sin(hh) * 1.6, pz = z + Math.cos(hh) * 1.6;
      if (!grid.resolveCircle(px, pz, 0.5, y + 0.2, y + 1.7, res).hit) return hh;
    }
    return h;
  }
  respawn(where, fee) {
    const token = this.lifeToken;
    this.fade(() => {
      if (token !== this.lifeToken || (this.state !== 'dead' && this.state !== 'busted')) return;
      $('gameover').classList.add('hidden');
      this.addMoney(-fee);
      if (where === 'hospital' && this.uw) { const inv = this.uw.S.inv, before = goodsList(inv); const lost = Inv.lose(inv, 0.5); if (lost) this.later(1500, () => this.ui.toast(`You woke up lighter: half of what you carried (${before}) went missing at the hospital.`, 'warn')); }
      if (where === 'hospital') { this.player.vest = 0; this.save.vest = 0; }
      const sentenceNow = where === 'jail';
      this.police.clear();
      for (const u of this.police.units.slice()) this.vehicles.despawn(u.v);
      this.police.units.length = 0;
      for (const c of this.police.cops) { const i = this.peds.peds.indexOf(c); if (i >= 0) this.peds.peds.splice(i, 1); }
      this.police.cops.length = 0;
      const b = this.world.block(SPECIAL[where === 'hospital' ? 'hospital' : 'police'].bx, SPECIAL[where === 'hospital' ? 'hospital' : 'police'].bz);
      this.content.reset(); this.events.clear();
      this.resetPlayerState(b.respawn.x, b.respawn.z, 0);
      this.state = 'playing';
      if (sentenceNow) { this.uw.prison.arrest(); return; }
      this.env.time = (this.env.time + 6) % 24;
      this.saveGame(true);
      this.ui.toast('Discharged from St. Alda Hospital.');
    }, true);
  }
  // ---------------- vehicles ----------------
  nearestVehicle(maxD) {
    const p = this.player; let best = null, bd = maxD;
    for (const v of this.vehicles.nearby(p.pos.x, p.pos.z, 8)) {
      if (v.burnt) continue;
      const lp = v.toLocal(p.pos.x, p.pos.z);
      const d = Math.hypot(Math.max(0, Math.abs(lp.x) - v.spec.w / 2), Math.max(0, Math.abs(lp.z) - v.spec.l / 2));
      if (d < bd && v.speed < 4) { bd = d; best = v; }
    }
    return best;
  }
  beginEnter(v) {
    const p = this.player;
    // freeze AI traffic so the car doesn't drive away mid-steal
    if (v.mode === 'kin') { this.traffic.release(v); v.mode = 'phys'; v.ai = null; v.vel.set(0, 0); v.aiBrake = false; }
    if (v.drive && v.driver === 'npc') { v.drive.wait = 5; }
    v.ctl.throttle = 0; v.ctl.handbrake = true;
    const side = v.toLocal(p.pos.x, p.pos.z).x >= 0 ? 1 : -1;
    p.state = 'entering'; p.trans = { v, t: 0, from: p.pos.clone(), side };
  }
  completeEnter(v) {
    const p = this.player, s = this.save;
    this.cam.revT = 0; this.cam.revCam = false; this.cam.revBack = false;
    const unitIdx = this.police.units.findIndex(u => u.v === v);
    if (unitIdx >= 0) { this.police.units.splice(unitIdx, 1); }
    if (v.driver === 'npc' || v.driver === 'cop') {
      const wasCop = v.driver === 'cop' || v.type === 'police';
      this.peds.ejectDriver(v, 'down');
      this.police.crime(wasCop ? 'stealcop' : 'carjack', v.pos.x, v.pos.z);
      s.stats.stolen++;
      this.ui.toast(`You jacked a ${v.spec.name}.`);
    } else if (!v.owned && !v.stolenBefore && !v.legit && v.origin !== 'found') {
      s.stats.stolen++; v.stolenBefore = true;
      if (v.type === 'police') this.police.crime('stealcop', v.pos.x, v.pos.z);
      else this.police.crime('theft', v.pos.x, v.pos.z);
      if (v.parked && Math.random() < 0.15) { v.alarmT = 5; this.ui.toast('Car alarm!', 'warn'); }
    }
    if (this.uw) {
      if (v.parked && !v.owned && !v.garageUid) this.uw.lootCar(v);
      if (v.fac && FACTIONS[v.fac] && !v.garageUid) { const f = this.uw.S.factions[v.fac]; f.rel = Math.max(-100, f.rel - 6); this.uw.gangs.provoke(v.fac, GANG_AGGRO.car, v.pos.x, v.pos.z); this.ui.toast(`That was a ${FACTIONS[v.fac].short} car. They’ll hear about it.`, 'warn'); }
    }
    v.driver = 'player'; v.drive = null; v.ai = null; v.mode = 'phys'; v.sleep = false; v.parked = false; v.touched = true;
    v.ctl.handbrake = false; v.siren = false;
    p.vehicle = v; p.lastVehicle = v; p.state = 'vehicle'; p.trans = null;
    this.audio.play('door');
    this.cam.yaw = v.h;
    HitchLog.mark('got into a ' + v.type);
  }
  exitVehicle(force) {
    const p = this.player, v = p.vehicle; if (!v) return;
    this.cam.revT = 0; this.cam.revCam = false; this.cam.revBack = false;
    const res = {};
    let spot = null;
    // driver side, passenger side, behind, in front; each must be clear of buildings and other cars
    const cands = [[1, 0.3], [-1, 0.3], [0, -1], [0, 1]].map(([sx, sz]) => sx ? v.toWorld(sx * (v.spec.w / 2 + 0.55), sz) : v.toWorld(0, sz * (v.spec.l / 2 + 0.8)));
    for (const w of cands) {
      const y = groundY(w.x, w.z, v.pos.y);
      this.world.grid.resolveCircle(w.x, w.z, 0.34, y + 0.35, y + 1.7, res);
      if (res.hit && res.depth >= 0.3) continue;
      let inCar = false;
      for (const o of this.vehicles.nearby(res.x, res.z, 4)) { if (o === v) continue; const lp = o.toLocal(res.x, res.z); if (Math.abs(lp.x) < o.spec.w / 2 + 0.3 && Math.abs(lp.z) < o.spec.l / 2 + 0.3) { inCar = true; break; } }
      if (!inCar) { spot = { x: res.x, z: res.z }; break; }
    }
    if (!spot) { const w = v.toWorld(v.spec.w / 2 + 0.55, 0); spot = this.clearSpot(w.x, w.z, 0.4); }
    const fast = v.speed > 12 && !force;
    p.state = 'foot'; p.vehicle = null;
    p.pos.set(spot.x, groundY(spot.x, spot.z, v.pos.y), spot.z);
    p.vel.set(fast ? v.vel.x * 0.5 : 0, 0, fast ? v.vel.y * 0.5 : 0);
    p.h = v.h;
    if (fast) { p.damage(10 * HP_SCALE, 'bail'); this.cam.shake(0.4); }
    v.driver = null; v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = v.speed < 3; v.siren = false;
    this.audio.play('door');
  }
  onVehicleCollision(A, B, sp) {
    const pv = this.player.state === 'vehicle' && !this.player.passenger ? this.player.vehicle : null;
    if (!pv || sp < 4) return;
    const other = A === pv ? B : B === pv ? A : null;
    if (!other) return;
    if (other.type === 'police' && (other.driver === 'cop' || other.siren)) this.police.crime('ramcop', other.pos.x, other.pos.z);
  }
  driveControl(dt) {
    const p = this.player, v = p.vehicle, inp = this.input;
    if (!v) return;
    // in the back of a cab: the driver drives, you ride
    if (p.passenger) { p.pos.set(v.pos.x, v.pos.y, v.pos.z); p.h = v.h; p.regen(dt); if (inp.pressed('horn')) this.audio.play('ui'); return; }
    const blocked = this.state !== 'playing' || this.ui.modal || this.mapOpen;
    let thr = (inp.isDown('up') ? 1 : 0) - (inp.isDown('down') ? 1 : 0) + (inp.isDown('gas') ? 1 : 0) - (inp.isDown('brake') ? 1 : 0);
    let steer = (inp.isDown('left') ? 1 : 0) - (inp.isDown('right') ? 1 : 0);
    if (inp.stick.active) steer -= inp.stick.x;
    if (inp.gp.active) { thr += inp.gp.rt - inp.gp.lt; steer -= inp.gp.lx; }
    v.ctl.throttle = blocked ? 0 : clamp(thr, -1, 1);
    v.ctl.steer = blocked ? 0 : clamp(steer, -1, 1);
    v.ctl.handbrake = !blocked && (inp.isDown('jump') || inp.isDown('handbrake'));
    if (inp.pressed('horn')) {
      if (v.type === 'police') { v.siren = !v.siren; this.ui.toast(v.siren ? 'Siren on' : 'Siren off'); }
      else { this.audio.play('horn', { dur: 0.5, gain: 0.9 }); this.peds.panic(v.pos.x + Math.sin(v.h) * 8, v.pos.z + Math.cos(v.h) * 8, 7, 0); }
    }
    if (inp.pressed('radio')) { const n = this.audio.nextStation(); const r = $('radio'); r.textContent = '♪ ' + n; r.classList.add('show'); clearTimeout(this._rt); this._rt = setTimeout(() => r.classList.remove('show'), 2500); }
    p.pos.set(v.pos.x, v.pos.y, v.pos.z); p.h = v.h;
    const s = this.save.stats;
    s.distDrive += v.speed * dt; s.topSpeed = Math.max(s.topSpeed, v.speed);
    p.regen(dt);
  }
  interact() {
    const p = this.player, m = this.missions;
    if (p.passenger) { this.taxi.getOut(); return; }
    const u = this.uw.findAction(); if (u) { u.act(); return; }
    if (this.uw.S.jail) return;
    if (m.offer && !m.active) { m.start(m.offer); return; }
    const a = this.content.findAction();
    if (a) { a.act(); return; }
    if (p.state === 'vehicle') { if (p.passenger) this.taxi.getOut(); else this.exitVehicle(false); return; }
    if (p.state !== 'foot' || (p.interior && !p.interior.vspace)) return;
    const v = this.nearestVehicle(1.8);
    if (v) {
      if (v.locked) { this.ui.toast(v.mission === 'sold' ? 'Delivered. Leave it.' : v.dealer ? `Locked. It’s for sale at ${DEALERSHIPS[v.dealer.lot].name}: inspect it to buy it.` : 'Locked.', 'warn'); this.audio.play('deny'); return; }
      this.beginEnter(v);
    }
  }
  updatePrompt() {
    const p = this.player, m = this.missions;
    let t = null;
    if (this.state === 'playing') {
      const u = this.uw.findAction();
      if (u) t = u.label;
      else if (this.uw.S.jail) t = null;
      else if (p.state === 'foot' && !m.offer) {
        const a = this.content.findAction();
        if (a) t = a.label;
        else if (!p.interior || p.interior.vspace) { const v = this.nearestVehicle(1.8); if (v) t = v.locked ? (v.mission === 'sold' || v.dealer ? null : 'Locked') : (v.driver === 'npc' || v.driver === 'cop' ? 'Steal ' : 'Enter ') + v.spec.name; }
      } else if (p.state === 'vehicle' && p.vehicle.health <= 0 && !p.vehicle.burnt) t = 'Get out \u2014 it\u2019s on fire!';
      else if (p.state === 'vehicle' && !m.offer) { const a = this.content.findAction(); if (a) t = a.label; }
    }
    this.ui.prompt(t);
  }
  // ---------------- main loop ----------------
  tick(now) {
    const rawMs = now - this.last, t0 = performance.now();
    let dt = (now - this.last) / 1000; this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-3), 0.05);
    const inp = this.input;
    inp.pollGamepad();
    if (inp.pressed('debug')) this.toggleDebug();
    if (this.state === 'playing') {
      if (inp.pressed('pause')) { if (this.ui.closeConfirm()) { /* dialog dismissed */ } else if (this.mapOpen) { this.ui.toggleMap(false); } else if (this.ui.modal) this.ui.back(); else this.pause(); }
      else if (inp.pressed('map')) this.ui.toggleMap(!this.mapOpen);
      if (inp.pressed('camera')) { this.cam.mode = (this.cam.mode + 1) % 3; }
      if (inp.pressed('empire') && !this.mapOpen) { if (this.ui.modal === 'empireScreen') this.ui.back(); else if (!this.ui.modal) this.uw.ui.open(); }
      if (inp.pressed('overlay') && this.mapOpen) this.uw.ui.toggleOverlay();
      if (inp.pressed('quicksave') && !this.ui.modal) this.quickSave();
      if (!this.ui.modal && !this.mapOpen && inp.pressed('interact')) this.interact();
    } else if (this.state === 'menu' && inp.pressed('pause')) { if (!this.ui.closeConfirm() && this.ui.modal) this.ui.back(); }
    else if (this.state === 'paused' && inp.pressed('pause')) { if (this.ui.closeConfirm()) { /* dialog dismissed */ } else if (this.ui.modal) this.ui.back(); else this.resume(); }
    let simDt = (this.state === 'paused' || this.state === 'loading' || this.mapOpen || (this.ui.modal && this.state === 'playing')) ? 0 : dt;
    if (this.slowT > 0) { this.slowT -= dt; simDt *= 0.35; }
    if (this.hitStop > 0) { this.hitStop -= dt; simDt *= 0.08; }
    // expose the game state to CSS (HUD layers hide themselves on pause / death / arrest)
    if (this.state !== this._gsShown) { this._gsShown = this.state; document.body.dataset.gs = this.state; }
    this.update(simDt, dt);
    this.render(simDt, dt);
    inp.endFrame();
    HitchLog.frame(this, rawMs, performance.now() - t0);
  }
  update(dt, rdt) {
    const p = this.player;
    this.time += dt; Signals.t += dt; U.uTime.value = this.time;
    if (this.state === 'playing') this.save.stats.playTime += dt;
    // player
    if (this.state === 'playing' || this.state === 'dead' || this.state === 'busted') {
      p.invuln = Math.max(0, p.invuln - dt); p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      if (p.state === 'foot' && dt > 0) p.updateFoot(dt);
      else if (p.state === 'vehicle') this.driveControl(dt);
      else if (p.state === 'entering') {
        const tr = p.trans; tr.t += dt;
        const v = tr.v;
        if (!this.vehicles.list.includes(v) || v.burnt) { p.state = 'foot'; p.trans = null; }
        else {
          const door = v.toWorld(tr.side * (v.spec.w / 2 + 0.45), 0.35);
          const k = Math.min(1, tr.t / 0.35);
          p.pos.x = lerp(tr.from.x, door.x, k); p.pos.z = lerp(tr.from.z, door.z, k); p.pos.y = groundY(p.pos.x, p.pos.z);
          p.h = dampAngle(p.h, v.h + (tr.side > 0 ? -Math.PI / 2 : Math.PI / 2), 12, dt);
          p.pose.amp = 0.5; p.pose.phase += dt * 8;
          if (tr.t >= 0.45) this.completeEnter(v);
        }
      } else if (p.state === 'dead' || p.state === 'busted') {
        p.pose.amp = 0;
        p.pose.down = damp(p.pose.down || 0, p.state === 'dead' ? 1 : 0, 4, dt);
        p.pose.surrender = damp(p.pose.surrender || 0, p.state === 'busted' ? 1 : 0, 6, dt);
        p.pose.crouch = damp(p.pose.crouch || 0, p.state === 'busted' ? 0.22 : 0, 4, dt);
      }
      if (p.state !== 'vehicle') {
        // player physics guard
        if (!(isFinite(p.pos.x) && isFinite(p.pos.y) && isFinite(p.pos.z) && isFinite(p.vel.x) && isFinite(p.vel.y) && isFinite(p.vel.z))) {
          const sf = this._pSafe || { x: this.missions.safe.x, y: CURB_H, z: this.missions.safe.z };
          p.pos.set(sf.x, sf.y, sf.z); p.vel.set(0, 0, 0);
        } else if (p.onGround) this._pSafe = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
        if (!isFinite(p.health)) p.health = p.maxHealth;
        p.syncChar();
      }
      if (dt > 0) { this.promptT -= dt; if (this.promptT <= 0) { this.promptT = 0.1; this.updatePrompt(); } }
    }
    // focus
    if (this.state === 'menu' || this.state === 'loading') this.menuCam(rdt);
    else this.focus.set(p.pos.x, 0, p.pos.z);
    // dynamic hash
    const dyn = this.dyn; dyn.clear();
    for (const v of this.vehicles.list) if (v.pos.y > -8) dyn.insert({ x: v.pos.x, z: v.pos.z, r: v.spec.l / 2, ref: v, veh: true });
    for (const c of this.peds.peds) if (c.state !== 'down') dyn.insert({ x: c.x, z: c.z, r: 0.45, ref: c, ped: true });
    if (p.state === 'foot' && (this.state === 'playing') && !p.interior) dyn.insert({ x: p.pos.x, z: p.pos.z, r: 0.45, ref: p });
    // world systems
    this.env.update(dt);
    this.content.interiors.update(dt);
    this.chunks.update(this.focus.x, this.focus.z, this.frame);
    this.propT -= rdt;
    if (this.propT <= 0) {
      this.propT = 0.5;
      const set = new Set();
      for (const b of this.world.blocks) if (Math.hypot(b.cx - this.focus.x, b.cz - this.focus.z) < this.propR) set.add(b.i);
      this.props.setActiveBlocks(set);
      this.props.respawnTick(this.focus.x, this.focus.z);
      this.vehicles.updateParked(this.focus.x, this.focus.z, this.parkedR);
    }
    if (dt > 0) {
      this.traffic.update(dt, this.frame);
      if (this.state === 'playing') this.taxi.update(dt);
      this.vehicles.update(dt);
      this.peds.update(dt, this.frame);
      if (this.state === 'playing') { this.police.update(dt); this.missions.update(dt); this.combat.update(dt); this.stunts.update(dt); this.events.update(dt); }
      else { this.missions.markers.update(this.time, this.camera.position); }
      this.fx.update(dt);
      // free agents far away get recycled
      for (const v of this.vehicles.list.slice()) {
        if (v.recycle && !v.mission && !v.taxiCab && v.driver !== 'player' && v !== p.lastVehicle && !v.owned) { this.vehicles.despawn(v); continue; }
        if (v.mode !== 'phys' || v.driver === 'player' || v.mission || v.taxiCab || v === p.lastVehicle || v.owned || v.homeBlock !== undefined && !v.touched) continue;
        if (this.police.units.some(u => u.v === v)) continue;
        if (this.police.roadblocks.some(rb => rb.cars.includes(v))) continue;
        const d = Math.hypot(v.pos.x - this.focus.x, v.pos.z - this.focus.z);
        if (d > 230 && !this.inView(v.pos.x, 1, v.pos.z, 3)) this.vehicles.despawn(v);
      }
    }
    this.props.update(rdt, this.env.night);
    this.chunks.updateMaterials(this.env.night, this.time);
    // camera
    if (this.state !== 'menu' && this.state !== 'loading') this.cam.update(rdt);
    this.camera.updateMatrixWorld();
    this._pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pm);
    U.uCam.value.copy(this.camera.position);
    this.content.update(dt, rdt);
    if (this.state === 'playing') { this.doors.update(dt); this.vspaces.update(dt); this.garageDisplay.update(dt); this.dealers.update(dt); this.entrances.update(dt); this.tutorial.update(dt); }
    this.uw.update(dt, rdt);
    this.mixAudio(rdt);
    this.ui.update(rdt);
    this.quality.update(rdt);
    // quiet background saves only while nothing is going on; queued autosaves land when it calms down
    if (this.state === 'playing') {
      this.saveT -= rdt;
      if (this.pendingAutosave && this.uw.isStable()) { const r = this.pendingAutosave; this.pendingAutosave = null; this.autosave(r); }
      if (this.saveT <= 0) { this.saveT = 90; this.saveGame(); }
    }
    if (this.debug.open) this.updateDebug(rdt);
    this.frame++;
  }
  menuCam(dt) {
    this.menuT += dt;
    const a = this.menuT * 0.035 + 0.6, cx = 5.6 * P, cz = 4.6 * P;
    const lx = cx + Math.cos(a + 0.5) * 30, lz = cz + Math.sin(a + 0.5) * 30, ly = 22;
    let px = cx + Math.cos(a) * 160, py = 84 + Math.sin(this.menuT * 0.11) * 10, pz = cz + Math.sin(a) * 160;
    // keep towers from blocking the view
    const dx = px - lx, dy = py - ly, dz = pz - lz, dl = Math.hypot(dx, dy, dz);
    const hit = this.world.grid.raycast(lx, ly, lz, dx / dl, dy / dl, dz / dl, dl, 0);
    const want = hit ? Math.max(25, hit.t - 6) : dl;
    this.menuDist = this.menuDist === undefined ? want : damp(this.menuDist, want, want < this.menuDist ? 6 : 1.2, dt);
    const k = this.menuDist / dl;
    this.camera.position.set(lx + dx * k, ly + dy * k, lz + dz * k);
    this.camera.lookAt(lx, ly, lz);
    if (Math.abs(this.camera.fov - 62) > 0.1) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
    this.focus.set(cx + Math.cos(a) * 95, 0, cz + Math.sin(a) * 95);
    this.cam.pos.copy(this.camera.position);
    this.cam.yaw = Math.atan2(cx - this.camera.position.x, cz - this.camera.position.z);
  }
  mixAudio(dt) {
    const a = this.audio; if (!a.ready) return;
    const p = this.player, cp = this.camera.position;
    a.listener.x = cp.x; a.listener.z = cp.z; a.listener.yaw = this.cam.yaw;
    const playing = this.state === 'playing' || this.state === 'dead' || this.state === 'busted';
    const pv = playing && p.state === 'vehicle' ? p.vehicle : null;
    let siren = null, sd = 220;
    for (const v of this.vehicles.list) if (v.siren && !v.burnt) { const d = Math.hypot(v.pos.x - cp.x, v.pos.z - cp.z); if (d < sd) { sd = d; siren = v; } }
    let sirenMix = null;
    if (siren) { const s = a.spatial(siren.pos.x, siren.pos.z, 15, 220); if (s) sirenMix = { g: s.g * (siren === pv ? 0.6 : 1) * (p.interior ? 0.25 : 1), pan: s.pan, yelp: this.police.level >= 3 && siren !== pv }; }
    let fire = 0;
    for (const v of this.vehicles.list) if (v.health <= 0 && !v.burnt) { const d = Math.hypot(v.pos.x - cp.x, v.pos.z - cp.z); fire = Math.max(fire, clamp(1 - d / 30, 0, 1)); }
    let near = 0; for (const v of this.traffic.cars) { const d = dist2(v.pos.x, v.pos.z, cp.x, cp.z); if (d < 60 * 60) near++; }
    const menu = this.state === 'menu';
    let peds = 0; for (const q of this.peds.peds) if (q.kind === 'civ' && dist2(q.x, q.z, cp.x, cp.z) < 26 * 26) peds++;
    let club = 0;
    if (this.uw && this.env.night > 0.35 && !p.interior) for (const id of ['club', 'motel', 'bar']) { const L = this.uw.loc('prop', id); if (L) club = Math.max(club, clamp(1 - Math.hypot(L.x - cp.x, L.z - cp.z) / 75, 0, 1)); }
    if (this.uw && this.env.night > 0.35 && !p.interior) { const L = this.uw.loc('hq', 'velvet'); if (L) club = Math.max(club, clamp(1 - Math.hypot(L.x - cp.x, L.z - cp.z) / 60, 0, 1) * 0.7); }
    const radioOn = pv && a.station > 0;
    const tension = playing && !radioOn ? clamp((this.police.level >= 2 ? 0.45 + this.police.level * 0.1 : 0) + (this.uw && this.uw.combatT > 0 ? 0.5 : 0), 0, 1) : 0;
    if (menu && a.station === 0) a.station = 1;
    a.update(dt, {
      engine: pv && !pv.burnt ? { rpm: pv.rpm, throttle: Math.abs(pv.ctl.throttle), base: pv.spec.eng } : null,
      skid: pv ? pv.skid : 0,
      siren: sirenMix,
      rain: this.env.rain * (pv ? 0.55 : 1) * (p.interior ? 0.15 : 1),
      city: (menu ? 0.05 : 0.07) * (1 - this.env.night * 0.4) * (this.state === 'paused' ? 0.3 : 1) * (p.interior ? 0.3 : 1),
      traffic: p.interior ? 0 : Math.min(1, near / 8) * 0.06,
      wind: pv ? clamp((pv.speed - 15) / 40, 0, 1) : 0,
      fire,
      crowd: p.interior || menu ? 0 : Math.min(1, peds / 10) * 0.05 * (pv ? 0.4 : 1),
      club: club * (pv ? 0.6 : 1),
      tension: this.state === 'paused' ? 0 : tension,
      music: (menu || (pv && a.station > 0)) && this.state !== 'paused'
    });
  }
  render(dt, rdt) {
    const p = this.player, r = this.renderer;
    this.scenery.sky.position.copy(this.camera.position);
    // characters
    const cr = this.chars; cr.begin(this.camera);
    const showPlayer = this.state !== 'menu' && this.state !== 'loading' && p.state !== 'vehicle';
    if (showPlayer) cr.draw(p.char, { wantHand: true, noHead: this.cam.mode === 2 && p.state === 'foot', force: true });
    this.peds.draw(cr);
    for (const c of this.missions.contacts) if ((c.marker.g.visible || this.state === 'menu' && !c.interior) || (c.interior && p.interior && p.interior.id === c.interior)) { c.ch.pose.phase += rdt; c.ch.pose.phone = !c.interior && Math.sin(this.time * 0.3 + c.x) > 0.3; cr.draw(c.ch); }
    this.content.drawChars(cr); this.campaign.drawChars(cr);
    cr.end();
    this.vehicles.render(dt, this.env.night, this.time, this.camera);
    // contact shadows ground everything that moves
    const bl = this.blobs, cp = this.camera.position; bl.begin();
    for (const v of this.vehicles.list) {
      if (!v.mesh.visible || dist2(v.pos.x, v.pos.z, cp.x, cp.z) > 130 * 130) continue;
      const gy = groundY(v.pos.x, v.pos.z), hgt = Math.max(0, v.pos.y - gy), k = 1 + hgt * 0.15;
      bl.add(v.pos.x, gy, v.pos.z, v.spec.w * 1.3 * k, v.spec.l * 1.12 * k, v.h);
    }
    for (const c of this.peds.peds) if (dist2(c.x, c.z, cp.x, cp.z) < 70 * 70) bl.add(c.x, groundY(c.x, c.z), c.z, c.state === 'down' ? 1.5 : 0.9, c.state === 'down' ? 1.9 : 0.9, c.h);
    if (showPlayer && !this.player.interior) bl.add(this.player.pos.x, groundY(this.player.pos.x, this.player.pos.z), this.player.pos.z, 0.95, 0.95, 0);
    bl.end(this.env.night);
    r.info.reset();
    if (this.usePost && this.composer) {
      this.bloom.strength = p.interior ? 0.28 : lerp(0.22, 0.6, this.env.night) + this.env.wet * 0.08;
      this.grade.uniforms.uTime.value = this.time % 100; this.grade.uniforms.uNight.value = this.env.night;
      this.composer.render(rdt);
    } else r.render(this.scene, this.camera);
  }
  // ---------------- debug ----------------
  toggleDebug() { this.debug.open = !this.debug.open; this.ui.show('debug', this.debug.open); }
  _bindDebug() {
    $('dbgTraffic').addEventListener('change', e => { this.traffic.enabled = e.target.checked; });
    $('dbgPeds').addEventListener('change', e => { this.peds.enabled = e.target.checked; });
    $('dbgPolice').addEventListener('change', e => { this.police.enabled = e.target.checked; if (!e.target.checked) this.police.clear(); });
    $('dbgWeather').addEventListener('change', e => { this.env.dynamic = e.target.checked; });
    $('dbgGod').addEventListener('change', e => { this.debug.god = e.target.checked; });
    $('dbgCol').addEventListener('change', e => { this.debug.col = e.target.checked; if (!e.target.checked && this.colViz) this.colViz.visible = false; });
    $('dbgTime').addEventListener('input', e => { this.env.timeScale = parseFloat(e.target.value); });
    document.querySelectorAll('#debug [data-w]').forEach(b => b.addEventListener('click', () => this.env.setWeather(b.dataset.w, true)));
    document.querySelectorAll('#debug [data-t]').forEach(b => b.addEventListener('click', () => { this.env.time = parseFloat(b.dataset.t); }));
    $('dbgCash').addEventListener('click', () => this.addMoney(5000, false));
    $('dbgHeat').addEventListener('click', () => { if (this.state === 'playing') this.police.setLevel(Math.min(5, this.police.level + 1)); });
    $('dbgClear').addEventListener('click', () => this.police.clear('Heat cleared (debug).'));
    $('dbgCar').addEventListener('click', () => { const p = this.player; const v = this.vehicles.spawn(pick(Object.keys(VEHICLES)), p.pos.x + Math.sin(p.h) * 5, p.pos.z + Math.cos(p.h) * 5, p.h + Math.PI / 2, { parked: true }); v.touched = true; });
  }
  updateDebug(dt) {
    this._dbgT = (this._dbgT || 0) - dt;
    if (this.debug.col) this.updateColViz(dt);
    if (this._dbgT > 0) return;
    this._dbgT = 0.25;
    const p = this.player, info = this.renderer.info;
    const civ = this.peds.peds.filter(x => x.kind === 'civ').length;
    $('dbgText').textContent =
      `FPS        ${Math.round(this.fps)}  (${(1000 / this.fps).toFixed(1)} ms)\n` +
      `Draw calls ${info.render.calls}   Tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `Quality    ${QUALITY[this.quality.level].name}${this.quality.mode === 'auto' ? ' (auto)' : ''}  PR ${this.renderer.getPixelRatio().toFixed(2)}\n` +
      `Vehicles   ${this.vehicles.list.length}  (traffic ${this.traffic.cars.length})\n` +
      `Peds       ${civ}  Cops on foot ${this.police.cops.length}\n` +
      `Police     ${this.police.units.length} units  heat ${this.police.heat.toFixed(1)}\n` +
      `Chunks     ${this.chunks.visible.size} shown / ${this.chunks.chunks.size} cached\n` +
      `Particles  ${this.fx.smoke.n + this.fx.glow.n}\n` +
      `Pos        ${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}\n` +
      `District   ${districtNameAt(p.pos.x, p.pos.z)}  ${this.env.timeString()} ${this.env.weather}`;
  }
  updateColViz(dt) {
    this._cvT = (this._cvT || 0) - dt;
    if (this._cvT > 0) return;
    this._cvT = 0.4;
    const p = this.player, pts = [];
    const list = this.world.grid.query(p.pos.x - 40, p.pos.z - 40, p.pos.x + 40, p.pos.z + 40, []);
    const box = (x0, y0, z0, x1, y1, z1) => {
      const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pts.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]); }
    };
    const circ = (x, z, r, y0, y1) => { for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, b = (i + 1) / 12 * 6.283; for (const y of [y0, y1]) pts.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r); } pts.push(x + r, y0, z, x + r, y1, z); };
    for (const c of list) { if (c.r !== undefined) circ(c.x, c.z, c.r, Math.max(0, c.y0), Math.min(c.y1, 12)); else box(c.x0, Math.max(0, c.y0), c.z0, c.x1, Math.min(c.y1, 12), c.z1); }
    for (const v of this.vehicles.nearby(p.pos.x, p.pos.z, 40)) for (const c of v.circleCenters([])) circ(c.x, c.z, v.spec.w / 2, v.pos.y + 0.3, v.pos.y + v.spec.h);
    if (!this.colViz) { this.colViz = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false, transparent: true, opacity: 0.7 })); this.colViz.frustumCulled = false; this.colViz.renderOrder = 10; this.scene.add(this.colViz); }
    this.colViz.geometry.dispose();
    this.colViz.geometry = new THREE.BufferGeometry(); this.colViz.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.colViz.visible = true;
  }
}

