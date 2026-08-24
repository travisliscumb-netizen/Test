
/* ============================================================================
   SECTION 06 — GAMEPLAY SYSTEMS
   Animals · Farmers · Tractor Beam · Projectiles · Particles
   ----------------------------------------------------------------------------
   Gameplay Systems Manual: every system states its state model, feedback and
   failure behaviour. Each entity below runs an explicit named state machine;
   no hidden state is spread across unrelated objects.
   ========================================================================== */

/* ------------------------------------------------------------------ FX ---- */
/* Pooled particles (§25 performance) — nothing is allocated mid-flight. */
var FX = {
  pool: [], active: [], root: null, max: TUNE.fx.maxParticles,

  init: function (scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    var geo = new THREE.SphereBufferGeometry(1, 5, 4);
    for (var i = 0; i < this.max; i++) {
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1, depthWrite: false }));
      m.visible = false;
      this.root.add(m);
      this.pool.push({ mesh: m, life: 0, maxLife: 1, vel: new THREE.Vector3(), grav: 0, size: 1 });
    }
  },
  spawn: function (x, y, z, opt) {
    if (!SETTINGS.particles) return;
    var p = this.pool.pop();
    if (!p) return;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(opt.color === undefined ? 0xffffff : opt.color);
    p.mesh.material.opacity = 1;
    p.mesh.visible = true;
    p.size = opt.size || 0.4;
    p.mesh.scale.setScalar(p.size);
    p.vel.set(opt.vx || 0, opt.vy || 0, opt.vz || 0);
    p.grav = opt.grav === undefined ? -9 : opt.grav;
    p.life = p.maxLife = opt.life || 0.8;
    this.active.push(p);
  },
  burst: function (x, y, z, n, opt) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, 6.28), s = rand(opt.spread || 3, (opt.spread || 3) * 2.2);
      this.spawn(x, y, z, {
        color: opt.color, size: rand(0.25, 0.7) * (opt.size || 1),
        vx: Math.cos(a) * s, vy: rand(opt.vy || 2, (opt.vy || 2) * 2.4), vz: Math.sin(a) * s,
        grav: opt.grav, life: rand(0.5, 1.2) * (opt.life || 1)
      });
    }
  },
  update: function (dt) {
    for (var i = this.active.length - 1; i >= 0; i--) {
      var p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.y += p.grav * dt * CHEATS.mod.gravityMult;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      var t = p.life / p.maxLife;
      p.mesh.material.opacity = t;
      p.mesh.scale.setScalar(p.size * (0.4 + t * 0.7));
    }
  },
  clear: function () {
    while (this.active.length) {
      var p = this.active.pop(); p.mesh.visible = false; this.pool.push(p);
    }
  }
};

/* -------------------------------------------------------------- ANIMALS ---- */
/* States: GRAZE · WANDER · IDLE · ALERT · FLEE · BEAMED · TAKEN
   Personality comes from SPECIES (flock, skittish, burst) — §10 of the
   original handoff. Update cost is throttled by distance (§25). */
var ANIMALS = {
  list: [], root: null, _acc: 0,

  spawn: function (scene, map) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.list = [];
    var m = CHEATS.mod;

    SPECIES_KEYS.forEach(function (kind) {
      var S = SPECIES[kind];
      var n = Math.round(S.count * m.populationMult);
      // roster-override cheats (Chicken Invasion / Cowpocalypse / Horse Haven)
      if (m.rosterOverride) n = (kind === m.rosterOverride)
        ? Math.round(58 * m.populationMult) : Math.round(n * 0.12);
      for (var i = 0; i < n; i++) ANIMALS.add(kind, map);
    });
  },

  add: function (kind, map) {
    var S = SPECIES[kind];
    var zoneName = pick(S.zones);
    var Z = map.spawnZones[zoneName] || map.spawnZones.anywhere;
    var a = rand(0, 6.28), r = Math.sqrt(Math.random()) * Z.r;
    var x = clamp(Z.x + Math.cos(a) * r, -map.size / 2 + 14, map.size / 2 - 14);
    var z = clamp(Z.z + Math.sin(a) * r, -map.size / 2 + 14, map.size / 2 - 14);

    var mesh = CREATURE.build(kind, S);
    var sc = S.scale * CHEATS.mod.animalScale;
    mesh.scale.setScalar(sc);
    if (CHEATS.mod.bigHead > 1 && mesh.userData.head)
      mesh.userData.head.scale.setScalar(CHEATS.mod.bigHead);
    mesh.position.set(x, WORLD.groundY(x, z), z);
    mesh.rotation.y = rand(0, 6.28);
    this.root.add(mesh);

    this.list.push({
      kind: kind, S: S, mesh: mesh, scale: sc,
      x: x, z: z, y: WORLD.groundY(x, z), yaw: mesh.rotation.y,
      vx: 0, vz: 0, state: 'GRAZE', timer: rand(0.5, 4),
      tx: x, tz: z, walkPhase: rand(0, 6.28), speedMod: rand(0.85, 1.15),
      beamT: 0, taken: false, cryTimer: rand(4, 20), bob: rand(0, 6.28)
    });
  },

  /* Distance-throttled AI (§25) — far animals think at a lower rate. */
  update: function (dt, map, ufoPos, beamActive) {
    var m = CHEATS.mod;
    var speedMul = m.animalSpeedMult;
    for (var i = 0; i < this.list.length; i++) {
      var A = this.list[i];
      if (A.taken) continue;

      var dToUfo = Math.sqrt(dist2(A.x, A.z, ufoPos.x, ufoPos.z));

      if (A.state === 'BEAMED') { this.tickBeamed(A, dt, ufoPos); continue; }

      // --- threat assessment
      var threat = 0;
      if (dToUfo < 42) threat = (1 - dToUfo / 42) * A.S.skittish;
      if (beamActive && dToUfo < 55) threat += 0.55 * A.S.skittish;
      if (m.magnet && dToUfo < 60) threat = 0;              // magnet overrides fear

      if (threat > 0.42 && A.state !== 'FLEE') {
        A.state = 'FLEE'; A.timer = rand(1.6, 3.4);
        if (Math.random() < 0.30) AUDIO.animalCry(A.kind);
      }

      A.timer -= dt;
      switch (A.state) {
        case 'GRAZE':
          A.vx = damp(A.vx, 0, 6, dt); A.vz = damp(A.vz, 0, 6, dt);
          if (A.timer <= 0) { A.state = Math.random() < 0.6 ? 'WANDER' : 'IDLE'; A.timer = rand(2, 6); this.retarget(A, map); }
          break;
        case 'IDLE':
          A.vx = damp(A.vx, 0, 6, dt); A.vz = damp(A.vz, 0, 6, dt);
          if (A.timer <= 0) { A.state = 'WANDER'; A.timer = rand(3, 8); this.retarget(A, map); }
          break;
        case 'WANDER':
          this.steer(A, A.tx, A.tz, A.S.speed * 0.55 * speedMul * A.speedMod, dt);
          if (A.timer <= 0 || dist2(A.x, A.z, A.tx, A.tz) < 9) {
            A.state = Math.random() < 0.55 ? 'GRAZE' : 'WANDER';
            A.timer = rand(2.5, 7); this.retarget(A, map);
          }
          break;
        case 'FLEE':
          var fx = A.x - ufoPos.x, fz = A.z - ufoPos.z;
          var fd = Math.sqrt(fx * fx + fz * fz) || 1;
          var burst = 1 + A.S.burst * (Math.sin(A.walkPhase * 3) > 0.6 ? 0.8 : 0);
          this.steer(A, A.x + (fx / fd) * 30, A.z + (fz / fd) * 30,
                     A.S.speed * 1.55 * speedMul * burst * A.speedMod, dt);
          if (A.timer <= 0 && threat < 0.2) { A.state = 'WANDER'; A.timer = rand(2, 5); this.retarget(A, map); }
          break;
      }

      // --- flocking: sheep clump, chickens loosely, cows barely (§10)
      if (A.S.flock > 0.3 && (i % 3 === 0)) this.flock(A, dt);

      // --- UFO Magnet cheat
      if (m.magnet && dToUfo < 60 && dToUfo > 3) {
        A.x += (ufoPos.x - A.x) / dToUfo * 9 * dt;
        A.z += (ufoPos.z - A.z) / dToUfo * 9 * dt;
      }

      // --- integrate + keep inside the fence
      A.x += A.vx * dt; A.z += A.vz * dt;
      var lim = map.size / 2 - 10;
      if (A.x < -lim || A.x > lim) { A.x = clamp(A.x, -lim, lim); A.vx *= -0.6; }
      if (A.z < -lim || A.z > lim) { A.z = clamp(A.z, -lim, lim); A.vz *= -0.6; }
      // animals walk around buildings, not through them (§19)
      for (var c = 0; c < WORLD.colliders.length; c++) {
        var col = WORLD.colliders[c];
        var ddx = A.x - col.x, ddz = A.z - col.z;
        var dd = Math.sqrt(ddx * ddx + ddz * ddz);
        var need = col.r + 2.5;
        if (dd < need && dd > 0.01) {
          A.x = col.x + ddx / dd * need;
          A.z = col.z + ddz / dd * need;
        }
      }
      A.y = WORLD.groundY(A.x, A.z);

      // --- animation: face travel, swing legs, bob head
      var sp = Math.sqrt(A.vx * A.vx + A.vz * A.vz);
      if (sp > 0.25) A.yaw = damp(A.yaw, Math.atan2(A.vx, A.vz) - Math.PI / 2, A.S.turn * 3, dt);
      A.walkPhase += dt * (2.6 + sp * 0.85);
      this.pose(A, sp, dt);

      // --- ambient noises
      A.cryTimer -= dt;
      if (A.cryTimer <= 0) {
        A.cryTimer = rand(9, 32);
        if (dToUfo < 90 && Math.random() < 0.35) AUDIO.animalCry(A.kind);
      }
    }
  },

  pose: function (A, sp, dt) {
    var mesh = A.mesh;
    mesh.position.set(A.x, A.y, A.z);
    mesh.rotation.y = A.yaw;
    var legs = mesh.userData.legs;
    if (legs) {
      var amp = clamp(sp * 0.10, 0, 0.62);
      for (var l = 0; l < legs.length; l++) {
        var phase = A.walkPhase + (l % 2 ? Math.PI : 0) + (l > 1 ? 0.5 : 0);
        legs[l].rotation.x = Math.sin(phase) * amp;
      }
    }
    if (mesh.userData.head) {
      // grazing dips the head toward the grass
      var target = (A.state === 'GRAZE') ? 0.62 : (A.state === 'FLEE' ? -0.22 : 0.0);
      mesh.userData.head.rotation.z = damp(mesh.userData.head.rotation.z,
        (A.kind === 'chicken' ? 0 : -0.12) + target, 4, dt);
    }
    if (mesh.userData.tail) {
      mesh.userData.tail.rotation.x = Math.sin(A.walkPhase * 1.6) * 0.28;
    }
  },

  steer: function (A, tx, tz, speed, dt) {
    var dx = tx - A.x, dz = tz - A.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    A.vx = damp(A.vx, dx / d * speed, 3.2, dt);
    A.vz = damp(A.vz, dz / d * speed, 3.2, dt);
  },

  retarget: function (A, map) {
    var Z = map.spawnZones[pick(A.S.zones)] || map.spawnZones.anywhere;
    var a = rand(0, 6.28), r = Math.sqrt(Math.random()) * Math.min(Z.r, 45);
    A.tx = clamp(Z.x + Math.cos(a) * r, -map.size / 2 + 14, map.size / 2 - 14);
    A.tz = clamp(Z.z + Math.sin(a) * r, -map.size / 2 + 14, map.size / 2 - 14);
  },

  flock: function (A, dt) {
    var cx = 0, cz = 0, n = 0;
    for (var j = 0; j < this.list.length; j += 2) {
      var B = this.list[j];
      if (B === A || B.taken || B.kind !== A.kind) continue;
      if (dist2(A.x, A.z, B.x, B.z) < 900) { cx += B.x; cz += B.z; n++; }
    }
    if (n > 0) {
      cx /= n; cz /= n;
      var d = Math.sqrt(dist2(A.x, A.z, cx, cz));
      if (d > 12) {
        A.vx += (cx - A.x) / d * A.S.flock * 5 * dt;
        A.vz += (cz - A.z) / d * A.S.flock * 5 * dt;
      }
    }
  },

  /* Beam capture: rise, spin, shrink, pop. Feedback is deliberately loud
     (GDD §18 feedback stack). */
  tickBeamed: function (A, dt, ufoPos) {
    A.beamT += dt;
    var pull = TUNE.beam.liftSpeed * (1 + SAVE.data.upgrades.beamPower * 0.16);
    A.x = damp(A.x, ufoPos.x, 3.4, dt);
    A.z = damp(A.z, ufoPos.z, 3.4, dt);
    A.y += pull * dt;
    A.mesh.position.set(A.x, A.y, A.z);
    A.mesh.rotation.y += dt * 5.5;
    A.mesh.rotation.z = Math.sin(A.beamT * 7) * 0.3;
    var shrink = clamp(1 - (A.y - WORLD.groundY(A.x, A.z)) / 46, 0.12, 1);
    A.mesh.scale.setScalar(A.scale * shrink);
    if (Math.random() < 0.4) {
      FX.spawn(A.x + rand(-2, 2), A.y, A.z + rand(-2, 2),
        { color: 0x9df7ff, size: 0.35, vy: rand(3, 7), grav: 1.5, life: 0.6 });
    }
  },

  remove: function (A) {
    A.taken = true;
    this.root.remove(A.mesh);
    var idx = this.list.indexOf(A);
    if (idx >= 0) this.list.splice(idx, 1);
  },

  clear: function (scene) {
    if (this.root) scene.remove(this.root);
    this.list = []; this.root = null;
  },

  countRemaining: function () { return this.list.length; }
};

/* -------------------------------------------------------------- FARMERS ---- */
/* States: PATROL · SUSPICIOUS · ALERT · CHASE · AIM · BEAMED · GONE · RETURN
   Detection is a rising/falling suspicion meter so the alert level is legible
   to the player (STEP4 §4) rather than a binary snap. */
var FARMERS = {
  list: [], root: null, projectiles: [], projRoot: null,

  spawn: function (scene, map, count) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.projRoot = new THREE.Group(); scene.add(this.projRoot);
    this.list = []; this.projectiles = [];
    for (var i = 0; i < count; i++) this.add(map, i);
  },

  add: function (map, i) {
    var mesh = CREATURE.farmer();
    mesh.scale.setScalar(1.0);
    if (CHEATS.mod.bigHead > 1 && mesh.userData.head)
      mesh.userData.head.scale.setScalar(CHEATS.mod.bigHead);
    var home = map.farmerHome;
    var sx = home[0] + rand(-16, 16), sz = home[1] + rand(-16, 16);
    mesh.position.set(sx, WORLD.groundY(sx, sz), sz);
    this.root.add(mesh);
    this.list.push({
      mesh: mesh, x: sx, z: sz, y: 0, yaw: 0, vx: 0, vz: 0,
      state: 'PATROL', suspicion: 0, node: i % map.farmerPatrol.length,
      timer: 0, fireCd: rand(0.5, 2), walkPhase: rand(0, 6.28),
      beamT: 0, goneT: 0, id: i
    });
  },

  update: function (dt, map, ufoPos, beamActive) {
    var T = TUNE.farmer, m = CHEATS.mod;
    var maxSus = 0;

    for (var i = 0; i < this.list.length; i++) {
      var F = this.list[i];

      if (F.state === 'BEAMED') { this.tickBeamed(F, dt, ufoPos); continue; }
      if (F.state === 'GONE') {
        F.goneT -= dt;
        if (F.goneT <= 0) {
          // returns to the farmhouse and resumes duty — never harmed (§6)
          F.x = map.farmerHome[0] + rand(-8, 8);
          F.z = map.farmerHome[1] + rand(-8, 8);
          F.state = 'PATROL'; F.suspicion = 0;
          F.mesh.visible = true;
          F.mesh.scale.setScalar(1.0);
          GAME.toast('The farmer stomps back out of the farmhouse.');
        }
        continue;
      }

      var d = Math.sqrt(dist2(F.x, F.z, ufoPos.x, ufoPos.z));

      /* --- detection: proximity + beam use raise suspicion --- */
      var sees = d < T.sightRange;
      var rise = 0;
      if (sees) {
        rise = T.suspicionRise * (1 - d / T.sightRange) * 1.6;
        if (beamActive) rise *= 2.1;
        if (ufoPos.y < 14) rise *= 1.35;
      }
      if (m.peacefulFarmer) rise = 0;
      F.suspicion = clamp(F.suspicion + (rise > 0 ? rise : -T.suspicionFall) * dt,
                          0, T.maxSuspicion);
      maxSus = Math.max(maxSus, F.suspicion / T.maxSuspicion);

      var prev = F.state;
      if (m.peacefulFarmer) {
        if (F.state !== 'PATROL') F.state = 'PATROL';
      } else if (F.suspicion >= T.chaseAt) F.state = (d < T.fireRange) ? 'AIM' : 'CHASE';
      else if (F.suspicion >= T.alertAt) F.state = 'ALERT';
      else if (F.suspicion > 0.25) F.state = 'SUSPICIOUS';
      else F.state = 'PATROL';
      if (prev === 'PATROL' && F.state === 'ALERT') AUDIO.sfx('alert');
      if (prev !== 'AIM' && prev !== 'CHASE' && (F.state === 'AIM' || F.state === 'CHASE')) {
        AUDIO.sfx('yell');
        if (i === 0) GAME.toast('The farmer has spotted you!');
      }

      /* --- movement per state --- */
      var speed = 0, tx = F.x, tz = F.z;
      switch (F.state) {
        case 'PATROL':
          var node = map.farmerPatrol[F.node];
          tx = node[0]; tz = node[1]; speed = T.walk;
          if (dist2(F.x, F.z, tx, tz) < 36) F.node = (F.node + 1) % map.farmerPatrol.length;
          break;
        case 'SUSPICIOUS':
          tx = ufoPos.x; tz = ufoPos.z; speed = T.walk * 0.75;
          break;
        case 'ALERT':
          tx = ufoPos.x; tz = ufoPos.z; speed = T.walk * 1.15;
          break;
        case 'CHASE':
          tx = ufoPos.x; tz = ufoPos.z; speed = T.run;
          break;
        case 'AIM':
          // hold position at a comfortable firing distance
          if (d < T.fireRange * 0.55) { tx = F.x - (ufoPos.x - F.x); tz = F.z - (ufoPos.z - F.z); speed = T.walk; }
          else speed = 0;
          break;
      }
      if (speed > 0) {
        var dx = tx - F.x, dz = tz - F.z, dd = Math.sqrt(dx * dx + dz * dz) || 1;
        F.vx = damp(F.vx, dx / dd * speed, 4, dt);
        F.vz = damp(F.vz, dz / dd * speed, 4, dt);
      } else {
        F.vx = damp(F.vx, 0, 7, dt); F.vz = damp(F.vz, 0, 7, dt);
      }
      F.x += F.vx * dt; F.z += F.vz * dt;

      // never walk through buildings (§19)
      for (var c = 0; c < WORLD.colliders.length; c++) {
        var col = WORLD.colliders[c];
        var ox = F.x - col.x, oz = F.z - col.z, od = Math.sqrt(ox * ox + oz * oz);
        var need = col.r + 2.2;
        if (od < need && od > 0.01) { F.x = col.x + ox / od * need; F.z = col.z + oz / od * need; }
      }
      var lim = map.size / 2 - 8;
      F.x = clamp(F.x, -lim, lim); F.z = clamp(F.z, -lim, lim);
      F.y = WORLD.groundY(F.x, F.z);

      /* --- firing (§8): readable telegraph, slow projectile, obvious arc --- */
      F.fireCd -= dt;
      var canFire = !m.peacefulFarmer && (F.state === 'AIM' || F.state === 'CHASE')
                    && d < T.fireRange && ufoPos.y < TUNE.ufo.maxAlt + 4;
      if (canFire && F.fireCd <= 0) {
        F.fireCd = T.fireInterval * rand(0.85, 1.25);
        this.fire(F, ufoPos);
      }

      /* --- pose --- */
      var sp = Math.sqrt(F.vx * F.vx + F.vz * F.vz);
      var faceX, faceZ;
      if (F.state === 'AIM' || F.state === 'CHASE' || F.state === 'ALERT') {
        faceX = ufoPos.x - F.x; faceZ = ufoPos.z - F.z;
      } else { faceX = F.vx; faceZ = F.vz; }
      if (Math.abs(faceX) + Math.abs(faceZ) > 0.05)
        F.yaw = damp(F.yaw, Math.atan2(faceX, faceZ), 7, dt);

      F.walkPhase += dt * (2.4 + sp * 0.6);
      F.mesh.position.set(F.x, F.y, F.z);
      F.mesh.rotation.y = F.yaw;
      var amp = clamp(sp * 0.13, 0, 0.72);
      if (F.mesh.userData.legs) {
        F.mesh.userData.legs[0].rotation.x = Math.sin(F.walkPhase) * amp;
        F.mesh.userData.legs[1].rotation.x = -Math.sin(F.walkPhase) * amp;
      }
      if (F.mesh.userData.arms) {
        var aiming = (F.state === 'AIM');
        var swing = Math.sin(F.walkPhase) * amp * 0.8;
        F.mesh.userData.arms[0].rotation.x = damp(F.mesh.userData.arms[0].rotation.x,
          aiming ? -2.1 : -swing, 8, dt);
        F.mesh.userData.arms[1].rotation.x = damp(F.mesh.userData.arms[1].rotation.x,
          aiming ? -2.4 : swing, 8, dt);
      }
      if (F.mesh.userData.fork) {
        F.mesh.userData.fork.rotation.z = damp(F.mesh.userData.fork.rotation.z,
          (F.state === 'AIM') ? -1.55 : -0.22, 7, dt);
      }
      if (F.mesh.userData.head) {
        // look up at the saucer when alerted
        var lookUp = (F.state === 'AIM' || F.state === 'CHASE' || F.state === 'ALERT') ? -0.45 : 0;
        F.mesh.userData.head.rotation.x = damp(F.mesh.userData.head.rotation.x, lookUp, 6, dt);
      }
    }

    this.updateProjectiles(dt, map);
    return maxSus;
  },

  fire: function (F, ufoPos) {
    var T = TUNE.farmer;
    var ox = F.x, oy = F.y + 5.0, oz = F.z;
    var dx = ufoPos.x - ox, dy = ufoPos.y - oy, dz = ufoPos.z - oz;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var lead = d / T.projSpeed;
    dx += UFO.vel.x * lead * 0.55; dz += UFO.vel.z * lead * 0.55;
    d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // deliberate inaccuracy — difficulty stays forgiving by default (§7)
    var spread = 0.11;
    var vx = (dx / d) * T.projSpeed + rand(-spread, spread) * T.projSpeed;
    var vy = (dy / d) * T.projSpeed + T.projSpeed * 0.18;
    var vz = (dz / d) * T.projSpeed + rand(-spread, spread) * T.projSpeed;

    // cartoon projectile: a turnip. Not graphic, very readable.
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereBufferGeometry(0.85, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8d9c0 }));
    body.scale.set(1, 1.25, 1); g.add(body);
    var top = new THREE.Mesh(new THREE.SphereBufferGeometry(0.9, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xb85fa8 }));
    top.scale.set(1, 0.45, 1); top.position.y = 0.6; g.add(top);
    for (var l = 0; l < 3; l++) {
      var leaf = new THREE.Mesh(new THREE.SphereBufferGeometry(0.42, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x5aa83f }));
      leaf.scale.set(0.35, 1.1, 0.6);
      leaf.position.set(Math.cos(l * 2.1) * 0.28, 1.1, Math.sin(l * 2.1) * 0.28);
      g.add(leaf);
    }
    g.position.set(ox, oy, oz);
    this.projRoot.add(g);
    this.projectiles.push({ mesh: g, vx: vx, vy: vy, vz: vz, life: 4.5, spin: rand(-9, 9) });
    AUDIO.sfx('fire');
    FX.burst(ox, oy, oz, 4, { color: 0xd8c9a8, spread: 1.6, vy: 1.5, life: 0.4 });
  },

  updateProjectiles: function (dt, map) {
    var g = -20 * CHEATS.mod.gravityMult;
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var P = this.projectiles[i];
      P.vy += g * dt;
      P.mesh.position.x += P.vx * dt;
      P.mesh.position.y += P.vy * dt;
      P.mesh.position.z += P.vz * dt;
      P.mesh.rotation.x += P.spin * dt;
      P.mesh.rotation.z += P.spin * 0.6 * dt;
      P.life -= dt;

      var hit = false;
      var up = UFO.group.position;
      var rr = TUNE.ufo.radius * UFO.scale() + 1.2;
      if (dist2(P.mesh.position.x, P.mesh.position.z, up.x, up.z) < rr * rr &&
          Math.abs(P.mesh.position.y - up.y) < 4.5) {
        hit = true;
        FX.burst(P.mesh.position.x, P.mesh.position.y, P.mesh.position.z, 12,
          { color: 0xe8d9c0, spread: 5, vy: 3, life: 0.8 });
        var died = UFO.damage(TUNE.farmer.projDamage);
        GAME.onUfoHit(died);
      }
      if (P.mesh.position.y < WORLD.groundY(P.mesh.position.x, P.mesh.position.z)) {
        hit = true;
        FX.burst(P.mesh.position.x, 0.5, P.mesh.position.z, 7,
          { color: 0xb89a72, spread: 3, vy: 2, life: 0.6 });
      }
      if (hit || P.life <= 0) {
        this.projRoot.remove(P.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  },

  /* Farmer abduction (§6 / S08): comedic, never harmful, always returns. */
  tickBeamed: function (F, dt, ufoPos) {
    F.beamT += dt;
    F.x = damp(F.x, ufoPos.x, 3.2, dt);
    F.z = damp(F.z, ufoPos.z, 3.2, dt);
    F.y += TUNE.beam.liftSpeed * 0.8 * dt;
    F.mesh.position.set(F.x, F.y, F.z);
    F.mesh.rotation.y += dt * 4.5;
    // arms and legs flail — the joke is the point
    if (F.mesh.userData.arms) {
      F.mesh.userData.arms[0].rotation.x = Math.sin(F.beamT * 15) * 1.6 - 1.2;
      F.mesh.userData.arms[1].rotation.x = -Math.sin(F.beamT * 15) * 1.6 - 1.2;
    }
    if (F.mesh.userData.legs) {
      F.mesh.userData.legs[0].rotation.x = Math.sin(F.beamT * 13) * 0.9;
      F.mesh.userData.legs[1].rotation.x = -Math.sin(F.beamT * 13) * 0.9;
    }
    var shrink = clamp(1 - (F.y - WORLD.groundY(F.x, F.z)) / 46, 0.12, 1);
    F.mesh.scale.setScalar(shrink);
    if (Math.random() < 0.5)
      FX.spawn(F.x + rand(-2, 2), F.y, F.z + rand(-2, 2),
        { color: 0x9df7ff, size: 0.4, vy: rand(3, 7), grav: 1.5, life: 0.6 });
  },

  takeFarmer: function (F) {
    F.state = 'GONE';
    F.goneT = TUNE.farmer.returnDelay;
    F.suspicion = 0;
    F.mesh.visible = false;
    F.beamT = 0;
  },

  alertLevel: function () {
    var lv = 0;
    for (var i = 0; i < this.list.length; i++) {
      var F = this.list[i];
      if (F.state === 'GONE' || F.state === 'BEAMED') continue;
      lv = Math.max(lv, F.suspicion / TUNE.farmer.maxSuspicion);
    }
    return lv;
  },

  clear: function (scene) {
    if (this.root) scene.remove(this.root);
    if (this.projRoot) scene.remove(this.projRoot);
    this.list = []; this.projectiles = []; this.root = null; this.projRoot = null;
  }
};

/* --------------------------------------------------------- TRACTOR BEAM ---- */
/* D-014 / STEP4 §2 / Art Bible §12.
   Split into coordinated parts per Technical Architecture Manual §8:
   target acquisition · telegraph · renderer · lift · consequence.
   NOT one oversized script that owns every behaviour. */
var BEAM = {
  group: null, cone: null, inner: null, disc: null, halo: null,
  active: false, target: null, targetKind: null, grab: 0, wasActive: false,
  lockRing: null, _t: 0,

  build: function (scene) {
    var g = new THREE.Group();

    // outer volume — layered, with internal variation (Art Bible §12 forbids
    // "a single transparent cylinder with a glow texture")
    var coneGeo = new THREE.CylinderBufferGeometry(1, 1, 1, 26, 1, true);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0x9df7ff, transparent: true, opacity: 0.20,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.cone);

    this.inner = new THREE.Mesh(coneGeo.clone(), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(this.inner);

    // ground pool of light
    this.disc = new THREE.Mesh(new THREE.CircleBufferGeometry(1, 26),
      new THREE.MeshBasicMaterial({ color: 0xbdfff0, transparent: true,
        opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.disc.rotation.x = -Math.PI / 2;
    g.add(this.disc);

    // rings that travel up the beam, so the direction of pull is legible
    this.rings = [];
    for (var i = 0; i < 4; i++) {
      var r = new THREE.Mesh(new THREE.TorusBufferGeometry(1, 0.05, 5, 20),
        new THREE.MeshBasicMaterial({ color: 0xdcffff, transparent: true,
          opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      r.rotation.x = Math.PI / 2;
      g.add(r); this.rings.push(r);
    }
    g.visible = false;
    scene.add(g);
    this.group = g;

    // target lock indicator — the anticipation cue the GDD asks for (§12)
    var lr = new THREE.Mesh(new THREE.TorusBufferGeometry(2.4, 0.16, 6, 22),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9,
        depthWrite: false }));
    lr.rotation.x = -Math.PI / 2;
    lr.visible = false;
    scene.add(lr);
    this.lockRing = lr;
  },

  radius: function () {
    return TUNE.beam.radius
         * (1 + SAVE.data.upgrades.beamWidth * 0.14)
         * CHEATS.mod.beamRadiusMult
         * UFO.scale();
  },

  /* Auto-lock the closest eligible target — reduces precision burden for a
     young player (D-014). Farmers are eligible only when no animal is. */
  acquire: function (ufoPos) {
    var best = null, bestD = Infinity, kind = null;
    var R = this.radius() * 1.5 + TUNE.beam.lockRange * 0.35;
    var R2 = R * R;

    for (var i = 0; i < ANIMALS.list.length; i++) {
      var A = ANIMALS.list[i];
      if (A.taken || A.state === 'BEAMED') continue;
      var d = dist2(A.x, A.z, ufoPos.x, ufoPos.z);
      if (d < R2 && d < bestD) { bestD = d; best = A; kind = 'animal'; }
    }
    if (!best) {
      for (var f = 0; f < FARMERS.list.length; f++) {
        var F = FARMERS.list[f];
        if (F.state === 'GONE' || F.state === 'BEAMED') continue;
        var fd = dist2(F.x, F.z, ufoPos.x, ufoPos.z);
        if (fd < R2 && fd < bestD) { bestD = fd; best = F; kind = 'farmer'; }
      }
    }
    return { t: best, kind: kind };
  },

  update: function (dt, wantOn, ufoPos) {
    this._t += dt;

    if (wantOn && !this.wasActive) { AUDIO.sfx('beamOn'); }
    if (!wantOn && this.wasActive) { AUDIO.sfx('beamOff'); this.release(); }
    this.wasActive = wantOn;
    this.active = wantOn;
    this.group.visible = wantOn;
    this.lockRing.visible = false;

    if (!wantOn) { this.target = null; this.grab = 0; return; }

    var R = this.radius();
    var groundY = WORLD.groundY(ufoPos.x, ufoPos.z);
    var height = Math.max(1, ufoPos.y - groundY - 2.1 * UFO.scale());

    /* --- renderer --- */
    var topR = R * 0.30, botR = R;
    this.cone.geometry.dispose();
    this.cone.geometry = new THREE.CylinderBufferGeometry(topR, botR, height, 26, 1, true);
    this.inner.geometry.dispose();
    this.inner.geometry = new THREE.CylinderBufferGeometry(topR * 0.55, botR * 0.55, height, 20, 1, true);
    var cy = groundY + height / 2;
    this.group.position.set(ufoPos.x, 0, ufoPos.z);
    this.cone.position.y = cy;
    this.inner.position.y = cy;
    this.disc.position.y = groundY + 0.14;
    this.disc.scale.setScalar(botR * (1 + Math.sin(this._t * 6) * 0.03));

    // travelling rings
    for (var r = 0; r < this.rings.length; r++) {
      var f = ((this._t * 0.85 + r / this.rings.length) % 1);
      var y = groundY + f * height;
      var rr = lerp(botR, topR, f);
      this.rings[r].position.y = y;
      this.rings[r].scale.setScalar(rr);
      this.rings[r].material.opacity = 0.55 * (1 - f * 0.7);
    }

    // colour: rainbow cheat, party mode, or the house cyan
    var col;
    if (CHEATS.mod.rainbowBeam) col = new THREE.Color().setHSL((this._t * 0.55) % 1, 1, 0.62);
    else if (CHEATS.mod.partyMode) col = new THREE.Color().setHSL((this._t * 0.9) % 1, 0.95, 0.65);
    else col = new THREE.Color(0x9df7ff);
    this.cone.material.color.copy(col);
    this.disc.material.color.copy(col);
    this.cone.material.opacity = 0.20 + Math.sin(this._t * 8) * 0.03;

    // dust and grass kicked up inside the beam (§23 environmental reaction)
    if (SETTINGS.particles && Math.random() < 0.75) {
      var a = rand(0, 6.28), rd = Math.sqrt(Math.random()) * botR;
      FX.spawn(ufoPos.x + Math.cos(a) * rd, groundY + 0.3, ufoPos.z + Math.sin(a) * rd,
        { color: col.getHex(), size: rand(0.2, 0.5), vy: rand(4, 9), grav: 1.2, life: rand(0.5, 1.0) });
    }

    /* --- acquisition + lift --- */
    if (!this.target || this.target.taken || this.target.state === 'GONE') {
      var got = this.acquire(ufoPos);
      if (got.t) {
        this.target = got.t; this.targetKind = got.kind; this.grab = 0;
        AUDIO.sfx('lock');
      } else { this.target = null; }
    }

    if (this.target) {
      var T = this.target;
      var inRange = dist2(T.x, T.z, ufoPos.x, ufoPos.z) < Math.pow(botR * 1.45, 2);
      if (!inRange && T.state !== 'BEAMED') {
        this.target = null; this.grab = 0;
      } else {
        if (T.state !== 'BEAMED') {
          // telegraph: lock ring pulses on the ground before capture
          this.lockRing.visible = true;
          this.lockRing.position.set(T.x, WORLD.groundY(T.x, T.z) + 0.25, T.z);
          var pulse = 1 + Math.sin(this._t * 12) * 0.12;
          this.lockRing.scale.setScalar(pulse * (this.targetKind === 'farmer' ? 1.3 : 1.0));
          this.lockRing.material.color.setHex(this.grab > 0.5 ? 0x9df7ff : 0xffd166);

          var resist = (this.targetKind === 'farmer')
            ? TUNE.farmer.abductTime
            : TUNE.beam.grabTime * T.S.resist;
          var power = (1 + SAVE.data.upgrades.beamPower * 0.18) * CHEATS.mod.beamPowerMult;
          this.grab += dt * power;
          if (this.grab >= resist) {
            T.state = 'BEAMED'; T.beamT = 0;
            this.grab = 0;
            if (this.targetKind === 'animal') AUDIO.animalCry(T.kind);
            else AUDIO.sfx('yell');
          }
        } else {
          // fully captured once it reaches the saucer
          var reached = (T.y > ufoPos.y - 4);
          if (reached) {
            if (this.targetKind === 'animal') {
              GAME.onAbduct(T);
              ANIMALS.remove(T);
            } else {
              GAME.onFarmerAbducted(T);
              FARMERS.takeFarmer(T);
            }
            this.target = null;
          }
        }
      }
    }
  },

  release: function () {
    // dropping the button mid-lift lets the target fall back down
    if (this.target && this.target.state === 'BEAMED') {
      var T = this.target;
      T.state = 'FLEE';
      T.timer = 2.5;
      T.y = WORLD.groundY(T.x, T.z);
      T.mesh.scale.setScalar(this.targetKind === 'farmer' ? 1.0 : T.scale);
      T.mesh.rotation.z = 0;
    }
    this.target = null; this.grab = 0;
  },

  clear: function (scene) {
    if (this.group) { scene.remove(this.group); this.group = null; }
    if (this.lockRing) { scene.remove(this.lockRing); this.lockRing = null; }
    this.target = null; this.grab = 0; this.active = false; this.wasActive = false;
  }
};
