
/* ============================================================================
   SECTION 05 — UFO, CONTROLLER, CAMERA
   ----------------------------------------------------------------------------
   D-013 / STEP4 §1: smooth analog movement with light momentum, touch-first,
   responsive rather than simulation-heavy. §46 of the original handoff:
   "responsive but slightly floaty — not a rigid car".
   ========================================================================== */
var UFO = {
  group: null, hull: null, dome: null, ring: null, lights: [], shieldMesh: null,
  emitter: null,
  pos: new THREE.Vector3(0, 16, 60),
  vel: new THREE.Vector3(),
  yaw: 0, bankX: 0, bankZ: 0,
  boost: TUNE.ufo.boostMax, boosting: false,
  shield: 100, maxShield: 100, hurtTimer: 0, regenTimer: 0, dead: false,
  _bob: 0, _spin: 0,

  build: function () {
    var g = new THREE.Group();

    // hull: two lathed shells give a proper saucer curve, not a flat disc
    var pts = [];
    for (var i = 0; i <= 12; i++) {
      var t = i / 12;
      pts.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.5) * 5.2 + 0.2, Math.cos(t * Math.PI * 0.5) * 1.05));
    }
    var hullGeo = new THREE.LatheBufferGeometry(pts, 28);
    var hullMat = new THREE.MeshPhongMaterial({
      color: 0xb9c6d2, shininess: 118, specular: 0x8fd9ff, flatShading: false });
    var hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = SETTINGS.shadows;
    g.add(hull); this.hull = hull;

    // underside bowl
    var lowPts = [];
    for (var j = 0; j <= 10; j++) {
      var t2 = j / 10;
      lowPts.push(new THREE.Vector2(Math.sin(t2 * Math.PI * 0.5) * 5.2 + 0.2, -Math.cos(t2 * Math.PI * 0.5) * 1.9));
    }
    var low = new THREE.Mesh(new THREE.LatheBufferGeometry(lowPts, 28),
      new THREE.MeshPhongMaterial({ color: 0x7c8b99, shininess: 70 }));
    g.add(low);

    // equator rim with panel segmentation (meso detail)
    var rim = new THREE.Mesh(new THREE.TorusBufferGeometry(5.3, 0.42, 8, 30),
      new THREE.MeshPhongMaterial({ color: 0xd8e2ea, shininess: 130, specular: 0xffffff }));
    rim.rotation.x = Math.PI / 2; g.add(rim);
    for (var p = 0; p < 12; p++) {
      var a = (p / 12) * Math.PI * 2;
      var panel = new THREE.Mesh(new THREE.BoxBufferGeometry(0.16, 0.5, 1.5),
        new THREE.MeshPhongMaterial({ color: 0x64727f, shininess: 60 }));
      panel.position.set(Math.cos(a) * 4.6, 0.1, Math.sin(a) * 4.6);
      panel.rotation.y = -a; g.add(panel);
    }

    // glass dome + a little alien pilot inside
    var dome = new THREE.Mesh(new THREE.SphereBufferGeometry(2.5, 20, 14, 0, 6.28, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x9de8ff, transparent: true, opacity: 0.42,
        shininess: 150, specular: 0xffffff }));
    dome.position.y = 0.9; g.add(dome); this.dome = dome;

    var pilot = new THREE.Group();
    var pbody = new THREE.Mesh(new THREE.SphereBufferGeometry(0.85, 10, 9),
      new THREE.MeshLambertMaterial({ color: 0x7ce0a8 }));
    pbody.scale.set(0.85, 1.15, 0.85); pilot.add(pbody);
    var phead = new THREE.Mesh(new THREE.SphereBufferGeometry(0.72, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x8ef0b8 }));
    phead.scale.set(1.15, 1.3, 1.0); phead.position.y = 1.15; pilot.add(phead);
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Mesh(new THREE.SphereBufferGeometry(0.24, 8, 7),
        new THREE.MeshPhongMaterial({ color: 0x101418, shininess: 120 }));
      eye.scale.set(0.7, 1.25, 0.5);
      eye.position.set(s * 0.3, 1.2, 0.58); pilot.add(eye);
    });
    pilot.position.y = 1.0; pilot.scale.setScalar(0.72);
    g.add(pilot); this.pilot = pilot;

    // glowing underside ring + emitter (beam origin)
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x7df2c8 });
    var ring = new THREE.Mesh(new THREE.TorusBufferGeometry(3.1, 0.28, 8, 26), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = -1.75;
    g.add(ring); this.ring = ring;

    var emitter = new THREE.Mesh(new THREE.CylinderBufferGeometry(1.5, 1.1, 0.7, 14),
      new THREE.MeshBasicMaterial({ color: 0xbdfff0 }));
    emitter.position.y = -2.1; g.add(emitter); this.emitter = emitter;

    // running lights around the rim
    this.lights = [];
    for (var k = 0; k < 8; k++) {
      var ang = (k / 8) * Math.PI * 2;
      var L = new THREE.Mesh(new THREE.SphereBufferGeometry(0.36, 8, 7),
        new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      L.position.set(Math.cos(ang) * 4.35, -0.85, Math.sin(ang) * 4.35);
      g.add(L); this.lights.push(L);
    }

    // shield bubble — hidden until God Mode or a hit (§27 cheat 1)
    var shield = new THREE.Mesh(new THREE.SphereBufferGeometry(7.4, 18, 14),
      new THREE.MeshPhongMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.0,
        shininess: 140, side: THREE.DoubleSide, depthWrite: false }));
    g.add(shield); this.shieldMesh = shield;

    // a real light under the craft so it feels physically present (§23)
    var glow = new THREE.PointLight(0x7df2c8, 1.5, 60, 2);
    glow.position.y = -3; g.add(glow); this.glow = glow;

    this.group = g;
    return g;
  },

  reset: function (map) {
    var s = map.ufoStart;
    this.pos.set(s[0], s[1], s[2]);
    this.vel.set(0, 0, 0);
    this.yaw = 0; this.bankX = this.bankZ = 0;
    this.boost = TUNE.ufo.boostMax;
    this.maxShield = TUNE.ufoHealth.maxShield + SAVE.data.upgrades.shields * 25;
    this.shield = this.maxShield;
    this.dead = false; this.hurtTimer = 0; this.regenTimer = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
  },

  /* Upgrades are permanent and additive (D-020). */
  speedMult: function () {
    return (1 + SAVE.data.upgrades.engine * 0.14) * CHEATS.mod.ufoSpeedMult;
  },
  scale: function () { return CHEATS.mod.ufoScale; },

  update: function (dt, input, map) {
    var T = TUNE.ufo, m = CHEATS.mod;

    /* --- horizontal: accelerate toward the stick vector, then damp.
       Velocity lerps rather than snapping — this is the momentum in D-013. */
    var maxS = T.maxSpeed * this.speedMult();
    var boosting = input.boost && this.boost > 0.02;
    if (boosting) {
      maxS *= T.boostMult * (1 + SAVE.data.upgrades.boost * 0.08);
      this.boost = Math.max(0, this.boost - T.boostDrain * dt);
    } else {
      this.boost = Math.min(TUNE.ufo.boostMax + SAVE.data.upgrades.boost * 0.5,
                            this.boost + T.boostRegen * dt);
    }
    this.boosting = boosting;

    var targetVX = input.x * maxS, targetVZ = input.y * maxS;
    var accel = T.accel * (boosting ? 1.4 : 1);
    this.vel.x = damp(this.vel.x, targetVX, accel / Math.max(1, maxS) * 1.5, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel / Math.max(1, maxS) * 1.5, dt);
    if (input.x === 0 && input.y === 0) {
      this.vel.x = damp(this.vel.x, 0, T.drag, dt);
      this.vel.z = damp(this.vel.z, 0, T.drag, dt);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    /* --- vertical within the locked envelope (spec §1) --- */
    var climb = input.up * T.climbSpeed * (SETTINGS.invertY ? -1 : 1);
    this.pos.y += climb * dt;
    var ground = WORLD.groundY(this.pos.x, this.pos.z);
    this.pos.y = clamp(this.pos.y, ground + T.minAlt, T.maxAlt);

    /* --- boundary: the fence is the hard edge (D-007) --- */
    var lim = map.size / 2 - TUNE.world.fenceInset - T.radius * this.scale();
    if (this.pos.x < -lim) { this.pos.x = -lim; this.vel.x *= -0.32; }
    if (this.pos.x >  lim) { this.pos.x =  lim; this.vel.x *= -0.32; }
    if (this.pos.z < -lim) { this.pos.z = -lim; this.vel.z *= -0.32; }
    if (this.pos.z >  lim) { this.pos.z =  lim; this.vel.z *= -0.32; }

    /* --- collision: radial push-out, forgiving rather than sticky (§19) --- */
    var R = T.radius * this.scale();
    for (var i = 0; i < WORLD.colliders.length; i++) {
      var c = WORLD.colliders[i];
      if (this.pos.y > c.h + 2) continue;             // clear the roof, fly over
      var dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var minD = c.r + R;
      // dead-centre overlap has no direction to push along — pick one so the
      // saucer can never end up parked inside a building
      if (d < 0.0001) { dx = 1; dz = 0; d = 0.0001; }
      if (d < minD) {
        var push = (minD - d);
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        // gentle rebound, never a hard stop
        var dot = (this.vel.x * dx + this.vel.z * dz) / d;
        if (dot < 0) { this.vel.x -= (dx / d) * dot * 1.25; this.vel.z -= (dz / d) * dot * 1.25; }
      }
    }

    /* --- presentation: bank into the turn, hover bob, slow spin --- */
    var sp = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    var nx = maxS > 0 ? this.vel.x / maxS : 0, nz = maxS > 0 ? this.vel.z / maxS : 0;
    this.bankZ = damp(this.bankZ, -nx * T.bank, 5, dt);
    this.bankX = damp(this.bankX,  nz * T.bank, 5, dt);
    this._bob += dt * T.bobRate;
    this._spin += dt * T.spin * (1 + sp * 0.02);

    this.group.position.set(this.pos.x, this.pos.y + Math.sin(this._bob) * T.bobAmp, this.pos.z);
    this.group.rotation.set(this.bankX, this._spin, this.bankZ);
    this.group.scale.setScalar(this.scale());

    /* --- shields: regen after a quiet spell (§13 architecture) --- */
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    this.regenTimer += dt;
    if (this.regenTimer > TUNE.ufoHealth.regenDelay && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + TUNE.ufoHealth.regenRate * dt);
    }

    /* --- lights / shield visuals --- */
    var t = performance.now() * 0.001;
    for (var L = 0; L < this.lights.length; L++) {
      var phase = t * 3 + L * 0.7;
      var on = (Math.sin(phase) * 0.5 + 0.5);
      var col = m.partyMode
        ? new THREE.Color().setHSL((t * 0.5 + L / this.lights.length) % 1, 0.9, 0.6)
        : new THREE.Color(0xffd166);
      this.lights[L].material.color.copy(col);
      this.lights[L].scale.setScalar(0.7 + on * 0.55);
    }
    if (m.partyMode) {
      this.ring.material.color.setHSL((t * 0.7) % 1, 0.95, 0.6);
      this.glow.color.setHSL((t * 0.7) % 1, 0.95, 0.6);
    } else {
      this.ring.material.color.setHex(0x7df2c8);
      this.glow.color.setHex(0x7df2c8);
    }
    this.glow.intensity = 1.2 + Math.sin(t * 4) * 0.25 + (boosting ? 1.2 : 0);

    var wantShield = m.invulnerable ? 0.26 : (this.hurtTimer > 0 ? 0.42 : 0);
    this.shieldMesh.material.opacity = damp(this.shieldMesh.material.opacity, wantShield, 8, dt);
    if (this.shieldMesh.material.opacity > 0.01) {
      this.shieldMesh.rotation.y += dt * 0.5;
      this.shieldMesh.material.color.setHex(this.hurtTimer > 0 ? 0xff8a7a : 0x5fd0ff);
    }
    this.pilot.rotation.y = -this._spin;   // pilot stays facing forward
  },

  damage: function (amount) {
    if (CHEATS.mod.invulnerable) { this.hurtTimer = 0.35; AUDIO.sfx('shield'); return false; }
    if (this.hurtTimer > TUNE.ufoHealth.iFrames * 0.4) return false;   // i-frames
    this.shield -= amount;
    this.hurtTimer = TUNE.ufoHealth.iFrames;
    this.regenTimer = 0;
    AUDIO.sfx('hit');
    if (this.shield <= 0) { this.shield = 0; this.dead = true; return true; }
    return false;
  },

  beamOrigin: function () {
    return new THREE.Vector3(this.group.position.x,
                             this.group.position.y - 2.1 * this.scale(),
                             this.group.position.z);
  }
};

/* ============================================================================
   CAMERA — chase cam + hold-to-scout (D-012, STEP4 §8)
   ----------------------------------------------------------------------------
   Scout height is DERIVED from camera.fov and aspect every frame, never a
   hand-tuned constant, so the full fence plus a 5% margin is guaranteed in
   frame in both portrait and landscape on any iPhone.
   ========================================================================== */
var CAM = {
  cam: null, scouting: false, blend: 0,
  _look: new THREE.Vector3(),

  init: function (aspect) {
    this.cam = new THREE.PerspectiveCamera(TUNE.cam.fov, aspect, 0.5, 2000);
    this.cam.position.set(0, 40, 90);
    this._look.set(0, 0, 0);
    return this.cam;
  },

  /* Height at which a `size`-wide square exactly fills the smaller screen
     axis, times the margin. Derived, not eyeballed. */
  scoutHeight: function (map) {
    var half = (map.size / 2) * TUNE.world.scoutMargin;
    var vFov = this.cam.fov * Math.PI / 180;
    var hByVertical = half / Math.tan(vFov / 2);
    var hByHorizontal = half / (Math.tan(vFov / 2) * this.cam.aspect);
    return Math.max(hByVertical, hByHorizontal) + 12;
  },

  update: function (dt, map) {
    var target = this.scouting ? 1 : 0;
    this.blend = damp(this.blend, target, TUNE.cam.scoutLerp, dt);

    var up = UFO.group.position;
    // gameplay chase position, slightly ahead of travel
    var lead = new THREE.Vector3(UFO.vel.x, 0, UFO.vel.z).multiplyScalar(0.28);
    var gp = new THREE.Vector3(
      up.x - lead.x, up.y + TUNE.cam.height, up.z + TUNE.cam.dist - lead.z);
    var gl = new THREE.Vector3(up.x + lead.x * 0.5, up.y - 2, up.z + lead.z * 0.5);

    // scout position: straight above the centre of the property
    var sh = this.scoutHeight(map);
    var sp = new THREE.Vector3(0, sh, 0.001);
    var sl = new THREE.Vector3(0, 0, 0);

    var b = this.blend * this.blend * (3 - 2 * this.blend);      // smoothstep
    var wantPos = gp.clone().lerp(sp, b);
    var wantLook = gl.clone().lerp(sl, b);

    var rate = this.blend > 0.01 ? TUNE.cam.scoutLerp * 1.6 : TUNE.cam.follow;
    this.cam.position.lerp(wantPos, 1 - Math.exp(-rate * dt));
    this._look.lerp(wantLook, 1 - Math.exp(-rate * dt));
    this.cam.lookAt(this._look);
  },

  resize: function (aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }
};

/* ============================================================================
   INPUT — touch-first (D-004). Keyboard is a secondary convenience for
   desktop review only; it is not the design target.
   ========================================================================== */
var INPUT = {
  x: 0, y: 0, up: 0, beam: false, boost: false, scout: false,
  _stickId: null, _origin: { x: 0, y: 0 }, _keys: {},

  init: function () {
    var self = this;
    var stick = document.getElementById('stick'), knob = document.getElementById('knob');

    function stickStart(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      self._stickId = e.changedTouches ? t.identifier : 'mouse';
      var r = stick.getBoundingClientRect();
      self._origin.x = r.left + r.width / 2;
      self._origin.y = r.top + r.height / 2;
      stickMove(e);
      e.preventDefault();
    }
    function stickMove(e) {
      if (self._stickId === null) return;
      var t = null;
      if (e.changedTouches) {
        for (var i = 0; i < e.changedTouches.length; i++)
          if (e.changedTouches[i].identifier === self._stickId) t = e.changedTouches[i];
        if (!t) return;
      } else t = e;
      var r = stick.getBoundingClientRect(), max = r.width * 0.40;
      var dx = t.clientX - self._origin.x, dy = t.clientY - self._origin.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; d = max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      self.x = dx / max; self.y = dy / max;
      e.preventDefault();
    }
    function stickEnd(e) {
      if (self._stickId === null) return;
      if (e.changedTouches) {
        var found = false;
        for (var i = 0; i < e.changedTouches.length; i++)
          if (e.changedTouches[i].identifier === self._stickId) found = true;
        if (!found) return;
      }
      self._stickId = null; self.x = 0; self.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
    stick.addEventListener('touchstart', stickStart, { passive: false });
    stick.addEventListener('touchmove', stickMove, { passive: false });
    stick.addEventListener('touchend', stickEnd);
    stick.addEventListener('touchcancel', stickEnd);
    stick.addEventListener('mousedown', stickStart);
    window.addEventListener('mousemove', stickMove);
    window.addEventListener('mouseup', stickEnd);

    // hold buttons
    this.hold('btn-beam',  function (v) { self.beam = v; });
    this.hold('btn-scout', function (v) { self.scout = v; CAM.scouting = v; });
    this.hold('btn-boost', function (v) { self.boost = v; });
    this.hold('btn-up',    function (v) { self.up = v ? 1 : (self.up > 0 ? 0 : self.up); });
    this.hold('btn-down',  function (v) { self.up = v ? -1 : (self.up < 0 ? 0 : self.up); });

    // keyboard (desktop review convenience only)
    window.addEventListener('keydown', function (e) { self._keys[e.code] = true; self.syncKeys(); });
    window.addEventListener('keyup',   function (e) { self._keys[e.code] = false; self.syncKeys(); });
  },

  hold: function (id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    function on(e) { el.classList.add('down'); fn(true); e.preventDefault(); }
    function off(e) { el.classList.remove('down'); fn(false); }
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off);
    el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  },

  syncKeys: function () {
    var k = this._keys;
    if (this._stickId === null) {
      this.x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      this.y = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    }
    this.up = (k.KeyR ? 1 : 0) - (k.KeyF ? 1 : 0);
    this.beam = !!k.Space;
    this.boost = !!k.ShiftLeft;
    var sc = !!k.KeyQ;
    if (sc !== this.scout) { this.scout = sc; CAM.scouting = sc; }
  },

  release: function () {
    this.x = this.y = 0; this.up = 0;
    this.beam = this.boost = false;
    this.scout = false; CAM.scouting = false;
    this._stickId = null; this._keys = {};
    var knob = document.getElementById('knob');
    if (knob) knob.style.transform = 'translate(0,0)';
    ['btn-beam','btn-scout','btn-boost','btn-up','btn-down'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.classList.remove('down');
    });
  }
};
