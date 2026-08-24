
/* ============================================================================
   SECTION 07 — GAME CONTROLLER
   Mission state · scoring · combos · scene lifecycle · main loop
   ----------------------------------------------------------------------------
   Explicit phase machine (Tech Arch §5): BOOT · MENU · PLAYING · PAUSED · OVER.
   Nothing else in the file mutates the phase directly.
   ========================================================================== */
var GAME = {
  scene: null, renderer: null, clock: null,
  phase: 'BOOT', map: null, mission: null, freeplay: false,

  score: 0, taken: 0, goal: 0, timeLeft: 0,
  combo: 0, comboTimer: 0, bestCombo: 0,
  breakdown: {}, farmersTaken: 0,
  _raf: null, _t: 0, _fpsAcc: 0, _fpsN: 0, _autoQ: 0,

  /* ------------------------------------------------------------- BOOTSTRAP -- */
  init: function () {
    var self = this;
    var boot = document.getElementById('boot');
    var bar = document.querySelector('#bootbar i');
    var msg = document.getElementById('bootmsg');
    function step(p, text) { if (bar) bar.style.width = p + '%'; if (text && msg) msg.textContent = text; }

    if (typeof THREE === 'undefined') {
      document.getElementById('booterr').textContent =
        'Three.js could not load. This build needs one online load of the r128 library — check the connection and reload.';
      return;
    }
    step(20, 'Building the renderer…');

    this.renderer = new THREE.WebGLRenderer({
      antialias: SETTINGS.quality !== 'low',
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,
      SETTINGS.quality === 'high' ? 2 : 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = SETTINGS.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    CAM.init(window.innerWidth / window.innerHeight);
    INPUT.init();
    UI.init();
    step(55, 'Waking the livestock…');

    window.addEventListener('resize', function () { self.onResize(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self.onResize(); }, 260);
    });
    // iOS needs a gesture before audio will start
    ['touchstart', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, function once() {
        AUDIO.unlock();
        window.removeEventListener(ev, once);
      }, { once: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.phase === 'PLAYING') self.pause();
    });

    step(100, 'Ready.');
    setTimeout(function () {
      boot.classList.add('hidden');
      self.phase = 'MENU';
      UI.showTitle();
      self.loop();
    }, 380);
  },

  onResize: function () {
    if (!this.renderer) return;
    var w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    CAM.resize(w / h);   // scout framing re-derives from the new aspect
  },

  /* ---------------------------------------------------------- SCENE SETUP -- */
  buildScene: function (map) {
    this.teardown();
    var scene = new THREE.Scene();
    var weather = CHEATS.mod.weather;

    var skyTop = map.sky.top, skyBot = map.sky.bottom, fogCol = map.sky.fog;
    var sunInt = map.light.sunInt, ambInt = map.light.ambInt;
    if (weather === 'Cloudy') { skyTop = 0x8fa6b4; skyBot = 0xc9d6dd; fogCol = 0xc2ced4; sunInt *= 0.62; ambInt *= 1.15; }
    if (weather === 'Rain')   { skyTop = 0x62727e; skyBot = 0x9aa8b0; fogCol = 0x94a2aa; sunInt *= 0.45; ambInt *= 1.1; }
    if (weather === 'Sunset') { skyTop = 0xd97a4e; skyBot = 0xf6c98a; fogCol = 0xe8ac7c; sunInt *= 0.85; ambInt *= 0.95; }
    if (weather === 'Windy')  { skyTop = 0x6fb6dd; skyBot = 0xd8ecf5; }

    scene.background = new THREE.Color(skyBot);
    scene.fog = new THREE.Fog(fogCol, map.sky.fogNear, map.sky.fogFar);

    // sky dome with a vertical gradient — cheap, and much nicer than flat
    var skyGeo = new THREE.SphereBufferGeometry(900, 24, 16);
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(skyTop) },
                  bot: { value: new THREE.Color(skyBot) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; ' +
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; ' +
        'void main(){ float h = clamp(vP.y/900.0*0.5+0.5,0.0,1.0); ' +
        'gl_FragColor = vec4(mix(bot, top, pow(h,0.85)),1.0); }'
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // a few soft clouds
    if (weather !== 'Clear' || true) {
      var cloudMat = new THREE.MeshBasicMaterial({
        color: weather === 'Rain' ? 0x8d99a1 : 0xffffff,
        transparent: true, opacity: weather === 'Clear' ? 0.55 : 0.75, depthWrite: false });
      var nClouds = weather === 'Cloudy' || weather === 'Rain' ? 26 : 14;
      for (var c = 0; c < nClouds; c++) {
        var cl = new THREE.Group();
        for (var b = 0; b < 5; b++) {
          var puff = new THREE.Mesh(new THREE.SphereBufferGeometry(rand(14, 26), 8, 6), cloudMat);
          puff.position.set(rand(-30, 30), rand(-5, 5), rand(-18, 18));
          cl.add(puff);
        }
        var ca = rand(0, 6.28), cr = rand(120, 520);
        cl.position.set(Math.cos(ca) * cr, rand(150, 250), Math.sin(ca) * cr);
        scene.add(cl);
      }
    }

    var amb = new THREE.HemisphereLight(map.light.amb, 0x4a6a3a, ambInt);
    scene.add(amb);
    var sun = new THREE.DirectionalLight(map.light.sun, sunInt);
    sun.position.set(map.light.sunPos[0], map.light.sunPos[1], map.light.sunPos[2]);
    if (SETTINGS.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.width = sun.shadow.mapSize.height =
        SETTINGS.quality === 'high' ? 2048 : 1024;
      var S = map.size * 0.62;
      sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
      sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
      sun.shadow.camera.near = 20; sun.shadow.camera.far = 620;
      sun.shadow.bias = -0.0012;
    }
    scene.add(sun);
    this.sun = sun;

    scene.add(WORLD.build(map));
    scene.add(UFO.build());
    FX.init(scene);
    BEAM.build(scene);

    if (weather === 'Rain') this.buildRain(scene, map);

    this.scene = scene;
    return scene;
  },

  buildRain: function (scene, map) {
    var n = 900;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      pos[i*3] = rand(-map.size/2, map.size/2);
      pos[i*3+1] = rand(2, 120);
      pos[i*3+2] = rand(-map.size/2, map.size/2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: 0xbfd8e4, size: 0.9, transparent: true, opacity: 0.6 });
    this.rain = new THREE.Points(geo, mat);
    scene.add(this.rain);
  },

  teardown: function () {
    if (!this.scene) return;
    ANIMALS.clear(this.scene);
    FARMERS.clear(this.scene);
    BEAM.clear(this.scene);
    FX.clear();
    this.scene = null; this.rain = null;
  },

  /* ------------------------------------------------------------- MISSIONS -- */
  startMission: function (mapId, missionIdx, freeplay) {
    var map = MAPS[mapId];
    if (!map || !map.built) { UI.toastNow('That map has not been built yet.'); return; }

    this.map = map;
    this.freeplay = !!freeplay;
    this.mission = freeplay ? null : map.missions[missionIdx];
    this.missionIdx = missionIdx;

    CHEATS.rebuild();
    this.buildScene(map);

    UFO.reset(map);
    var farmerCount = CHEATS.on.farmers
      ? CHEATS.mod.farmerCount
      : (this.mission && this.mission.farmers ? this.mission.farmers : 1);
    ANIMALS.spawn(this.scene, map);
    FARMERS.spawn(this.scene, map, farmerCount);

    this.score = 0; this.taken = 0; this.combo = 0; this.comboTimer = 0;
    this.bestCombo = 0; this.breakdown = {}; this.farmersTaken = 0;
    this.goal = freeplay ? 0 : this.mission.goal;
    this.timeLeft = freeplay ? 0 : this.mission.time;

    INPUT.release();
    CAM.blend = 0; CAM.scouting = false;
    CAM.cam.position.set(0, 120, 160);

    UI.hideAll();
    UI.showHUD(true);
    this.phase = 'PLAYING';
    AUDIO.unlock(); AUDIO.startMusic(); AUDIO.setDanger(0);

    if (SETTINGS.showHints) {
      this.toast(freeplay
        ? 'Free flight — no timer. Hold BEAM over an animal.'
        : this.mission.blurb);
    }
    UI.syncHUD(this);
  },

  onAbduct: function (A) {
    var base = A.S.points;
    this.combo++;
    this.comboTimer = TUNE.combo.window;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    var mult = this.comboMultiplier();
    var gained = Math.round(base * mult * CHEATS.mod.scoreMult);
    this.score += gained;
    this.taken++;
    this.breakdown[A.kind] = (this.breakdown[A.kind] || 0) + 1;

    SAVE.data.totalAbducted++;
    SAVE.data.career += gained;
    if (this.bestCombo > SAVE.data.bestCombo) SAVE.data.bestCombo = this.bestCombo;
    SAVE.queue();

    AUDIO.sfx('capture');
    var p = UFO.group.position;
    FX.burst(p.x, p.y - 2, p.z, 16,
      { color: 0x9df7ff, spread: 4, vy: 2, grav: -3, life: 0.9 });

    if (mult > 1) { AUDIO.sfx('combo'); UI.popCombo(mult); }
    UI.floatScore('+' + gained + ' ' + A.S.name);

    if (!this.freeplay && this.taken >= this.goal) this.finish(true);
    UI.syncHUD(this);
  },

  onFarmerAbducted: function (F) {
    this.farmersTaken++;
    AUDIO.sfx('capture');
    var p = UFO.group.position;
    FX.burst(p.x, p.y - 2, p.z, 22, { color: 0xffd166, spread: 5, vy: 3, grav: -2, life: 1.1 });
    this.toast('Farmer abducted! He will be back shortly, unharmed and furious.');
    // small bonus, but no combo credit — animals are the objective
    var bonus = Math.round(40 * CHEATS.mod.scoreMult);
    this.score += bonus;
    SAVE.data.career += bonus; SAVE.queue();
    UI.syncHUD(this);
  },

  comboMultiplier: function () {
    var tiers = TUNE.combo.tiers;   // [2,3,5,8,12,20]
    var m = 1;
    for (var i = 0; i < tiers.length; i++) if (this.combo >= tiers[i]) m = i + 2;
    return m;
  },

  onUfoHit: function (died) {
    UI.flashDamage();
    if (died) {
      if (CHEATS.mod.infiniteLives) {
        UFO.shield = UFO.maxShield * 0.55;
        UFO.dead = false;
        this.toast('Shields collapsed — rebooting. (Unlimited Lives)');
      } else {
        this.finish(false, 'Your shields gave out.');
      }
    }
    UI.syncHUD(this);
  },

  finish: function (won, reason) {
    if (this.phase !== 'PLAYING') return;
    this.phase = 'OVER';
    INPUT.release();
    AUDIO.sfx(won ? 'win' : 'lose');
    AUDIO.setDanger(0);

    if (won && !this.freeplay) {
      var prog = SAVE.data.progress;
      var key = this.map.id + ':' + this.mission.id;
      var prev = prog.missions[key] || { best: 0, done: false };
      prog.missions[key] = {
        best: Math.max(prev.best, this.score), done: true
      };
      // unlock the next mission on this map, or the next map
      if (this.missionIdx + 1 >= this.map.missions.length) {
        prog.unlocked = Math.max(prog.unlocked, this.map.index + 1);
      }
      SAVE.queue();
    }
    UI.showResult(this, won, reason);
  },

  pause: function () {
    if (this.phase !== 'PLAYING') return;
    this.phase = 'PAUSED';
    INPUT.release();
    UI.showPause(this);
  },
  resume: function () {
    if (this.phase !== 'PAUSED') return;
    UI.hideAll(); UI.showHUD(true);
    this.phase = 'PLAYING';
    this.clock.getDelta();          // discard the paused interval
  },
  quitToTitle: function () {
    this.phase = 'MENU';
    this.teardown();
    AUDIO.stopMusic();
    UI.hideAll(); UI.showHUD(false);
    UI.showTitle();
  },

  toast: function (text) { UI.toastNow(text); },

  /* ------------------------------------------------------------ MAIN LOOP -- */
  loop: function () {
    var self = this;
    this._raf = requestAnimationFrame(function () { self.loop(); });

    var raw = this.clock.getDelta();
    var dt = Math.min(raw, 0.05);              // never let a stall teleport things
    this._t += dt;

    if (this.phase === 'PLAYING') {
      var scaled = dt * CHEATS.mod.worldTimeScale;

      // --- timer
      if (!this.freeplay) {
        this.timeLeft -= dt;                    // real time, slow-mo does not cheat it
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.finish(false, 'Out of time.');
        }
      }
      // --- combo decay
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; }
      }

      UFO.update(dt, INPUT, this.map);          // player is never slowed by slow-mo
      var ufoPos = UFO.group.position;

      BEAM.update(scaled, INPUT.beam, ufoPos);
      ANIMALS.update(scaled, this.map, ufoPos, BEAM.active);
      var alert = FARMERS.update(scaled, this.map, ufoPos, BEAM.active);
      FX.update(scaled);
      WORLD.update(scaled, this._t);

      AUDIO.setDanger(alert);

      if (this.rain) {
        var rp = this.rain.geometry.attributes.position;
        for (var i = 0; i < rp.count; i++) {
          var y = rp.getY(i) - 95 * dt;
          if (y < 0) { y = 120; rp.setX(i, rand(-this.map.size/2, this.map.size/2));
                       rp.setZ(i, rand(-this.map.size/2, this.map.size/2)); }
          rp.setY(i, y);
        }
        rp.needsUpdate = true;
      }

      CAM.update(dt, this.map);
      UI.syncLive(this);
      this.autoQuality(raw);
    } else if (this.phase === 'PAUSED' || this.phase === 'OVER') {
      if (this.scene) { WORLD.update(dt * 0.25, this._t); CAM.update(dt, this.map); }
    }

    if (this.scene) this.renderer.render(this.scene, CAM.cam);
  },

  /* Graceful degradation rather than dropping the art target outright
     (STEP2_WORLD_SPEC §12). Only ever steps down, and only once. */
  autoQuality: function (raw) {
    this._fpsAcc += raw; this._fpsN++;
    if (this._fpsN < 120) return;
    var avg = this._fpsAcc / this._fpsN;
    this._fpsAcc = 0; this._fpsN = 0;
    if (avg > 0.032 && this._autoQ === 0 && SETTINGS.shadows) {
      this._autoQ = 1;
      SETTINGS.shadows = false;
      this.renderer.shadowMap.enabled = false;
      if (this.sun) this.sun.castShadow = false;
      this.toast('Shadows off to keep things smooth.');
    } else if (avg > 0.040 && this._autoQ === 1) {
      this._autoQ = 2;
      this.renderer.setPixelRatio(1);
      this.toast('Lowered resolution to keep things smooth.');
    }
  }
};
