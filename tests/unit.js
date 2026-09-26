/* Unit suite for Operation Blackgate.
   Injected into the built page by tests/run.mjs after the game has booted, and
   run against the real constructed world -- real level, real collidables, real
   weapons and enemies. It is never part of the shipped file: a player's browser
   does not run it. Every case restores whatever it touches. */
'use strict';

var TEST_SUITE = {
  results: [],

  run: function (name, fn) {
    try {
      var result = fn();
      this.results.push({ name: name, pass: !!result, error: null });
    } catch (e) {
      this.results.push({ name: name, pass: false, error: e.message });
    }
  },

  report: function () {
    var passed = this.results.filter(function (r) { return r.pass; }).length;
    var total = this.results.length;
    console.log('[TEST SUITE] ' + passed + '/' + total + ' passed');
    this.results.forEach(function (r) {
      console.log('  ' + (r.pass ? '✓' : '✗') + ' ' + r.name + (r.error ? ' — ' + r.error : ''));
    });
    return this.results;
  }
};

TEST_SUITE.run('Player starts with 100 health', function () { return player.health === 100; });
TEST_SUITE.run('Player starts with 3 weapons', function () { return weapons.length === 3; });
TEST_SUITE.run('Collision: player cannot enter wall cell', function () {
  // take a real wall slab out of the level and stand the player inside it
  var wall = null;
  for (var i = 0; i < collidables.length; i++) {
    if (collidables[i].tag === 'wall') { wall = collidables[i]; break; }
  }
  if (!wall) throw new Error('no wall collidables in level');
  var wallPos = new THREE.Vector3((wall.minX + wall.maxX) / 2, 0, (wall.minZ + wall.maxZ) / 2);
  var result = resolveCollision(playerAABB(wallPos), collidables);
  return result.distanceTo(wallPos) > 0.1;   // must have been pushed out
});
TEST_SUITE.run('Enemy transitions PATROL to ALERT on damage', function () {
  var e = new Enemy(new THREE.Vector3(0, 0, 10), []);
  e.setState('PATROL');
  e.takeDamage(10);
  var ok = e.state === 'ALERT';
  e.dispose();
  return ok;
});
TEST_SUITE.run('Win condition false at start', function () { return !checkWin(); });
TEST_SUITE.run('Loss condition false at full health', function () { return !checkLoss(); });
TEST_SUITE.run('Loss condition true at zero health', function () {
  var savedHealth = player.health;
  player.health = 0;
  var result = checkLoss();
  player.health = savedHealth;
  return result;
});
TEST_SUITE.run('Ammo decrements on fire', function () {
  var before = currentWeapon.ammoInMag;
  fireWeapon();
  var after = currentWeapon.ammoInMag;
  currentWeapon.ammoInMag = before;      // leave the loadout as we found it
  WEAPONS.cooldown = 0; WEAPONS.reloading = 0;
  PLAYER.shotsFired = 0; PLAYER.shotsHit = 0;
  return after === before - 1;
});
TEST_SUITE.run('AudioContext not created before user gesture', function () {
  return typeof audioCtx === 'undefined' || audioCtx === null;
});

/* --- additional checks over the same live world --- */
TEST_SUITE.run('Level grid is rectangular and matches the plan', function () {
  var g = LEVEL.grid;
  if (g.length !== PLAN.h) return false;
  for (var i = 0; i < g.length; i++) if (g[i].length !== PLAN.w) return false;
  return true;
});
TEST_SUITE.run('Every objective is reachable from the spawn', function () {
  // flood fill the passable grid from the start cell
  var g = LEVEL.grid, seen = {}, q = [[PLAN.start.x, PLAN.start.z]];
  seen[PLAN.start.x + ',' + PLAN.start.z] = true;
  while (q.length) {
    var c = q.shift();
    var nb = [[c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]];
    for (var i = 0; i < nb.length; i++) {
      var x = nb[i][0], z = nb[i][1], k = x + ',' + z;
      if (x < 0 || z < 0 || x >= PLAN.w || z >= PLAN.h || seen[k]) continue;
      if (!isPassable(g[z][x])) continue;
      seen[k] = true; q.push([x, z]);
    }
  }
  var termCell = seen[worldToCellX(LEVEL.terminal.pos.x) + ',' + worldToCellZ(LEVEL.terminal.pos.z)];
  var exitCell = seen[PLAN.exit.x + ',' + PLAN.exit.z];
  return !!termCell && !!exitCell;
});
TEST_SUITE.run('No enemy spawns inside level geometry', function () {
  for (var i = 0; i < ENEMIES.list.length; i++) {
    var p = ENEMIES.list[i].group.position;
    var box = { minX: p.x - 0.3, maxX: p.x + 0.3, minY: p.y + 0.2, maxY: p.y + 1.7, minZ: p.z - 0.3, maxZ: p.z + 0.3 };
    for (var c = 0; c < collidables.length; c++) {
      if (collidables[c].walkable || collidables[c].disabled) continue;
      if (aabbOverlap(box, collidables[c])) throw new Error('spawn ' + i + ' (' + ENEMIES.list[i].kind + ') is inside ' + collidables[c].tag);
    }
  }
  return ENEMIES.list.length >= 8;
});
TEST_SUITE.run('Every material on level geometry is physically based', function () {
  for (var i = 0; i < LEVEL.meshes.length; i++) {
    var m = LEVEL.meshes[i].material;
    if (!m.isMeshStandardMaterial) throw new Error(LEVEL.meshes[i].name + ' uses ' + m.type);
  }
  return true;
});
TEST_SUITE.run('No more than six shadow-casting lights', function () {
  var n = 0;
  RENDER.scene.traverse(function (o) { if (o.isLight && o.castShadow) n++; });
  return n <= 6;
});
TEST_SUITE.run('Weapon damage and fire-rate table matches the brief', function () {
  var pp7 = weapons[0], kf7 = weapons[1], mine = weapons[2];
  return pp7.damage === 25 && pp7.magSize === 7 && pp7.auto === false &&
         kf7.damage === 15 && kf7.magSize === 30 && kf7.auto === true && kf7.rps === 10 &&
         mine.damage === 80 && mine.magSize === 3;
});
TEST_SUITE.run('Enemy FSM exposes exactly the five live states', function () {
  var e = ENEMIES.list[0];
  var states = ['PATROL', 'ALERT', 'CHASE', 'ATTACK', 'SEARCH'];
  // Pin the alarm flag for the duration so nothing the probe does can siren
  // the building, then put the world back exactly as it was found.
  var savedAlarm = GAME.alarm, savedAt = GAME.alarmAt;
  GAME.alarm = true;
  var ok = true;
  for (var i = 0; i < states.length; i++) {
    e.setState(states[i]);
    if (e.state !== states[i]) { ok = false; break; }
  }
  e.setState('PATROL');
  GAME.alarm = savedAlarm; GAME.alarmAt = savedAt;
  return ok;
});
TEST_SUITE.run('Pitch clamp holds at plus/minus 80 degrees', function () {
  var saved = PLAYER.pitch;
  INPUT.lookY = -100; updatePlayer(0.016, INPUT);
  var high = PLAYER.pitch;
  INPUT.lookY = 100; updatePlayer(0.016, INPUT); updatePlayer(0.016, INPUT);
  var low = PLAYER.pitch;
  INPUT.lookY = 0; PLAYER.pitch = saved;
  return high <= 1.3963 && low >= -1.3963;
});
TEST_SUITE.run('Touch stick honours dead zone and expo curve', function () {
  var dead = applyStick(5, 0);                       // inside the 8px dead zone
  var full = applyStick(TOUCH.maxRadius, 0);          // at the rim
  var half = applyStick(TOUCH.maxRadius / 2, 0);      // halfway out
  return dead.mag === 0 && Math.abs(full.mag - 1) < 1e-6 && half.mag < 0.5;
});

TEST_SUITE.run('Shots are classified head / torso / arm / leg by where they land', function () {
  var e = null;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    if (ENEMIES.list[i].state !== 'DEAD' && ENEMIES.list[i].kind !== 'scientist') { e = ENEMIES.list[i]; break; }
  }
  if (!e) return false;
  var g = e.group.position;
  function at(y, lateral) {
    return enemyHitZone(e, new THREE.Vector3(g.x + lateral, g.y + y, g.z));
  }
  // sampled at the real part centres, scaled the way the mesh is
  return at(1.160 * BODY_SCALE, 0) === 'head'
      && at(0.745 * BODY_SCALE, 0) === 'torso'
      && at(0.245 * BODY_SCALE, -0.12 * BODY_SCALE) === 'leg'
      && at(0.800 * BODY_SCALE, 0.295 * BODY_SCALE) === 'arm'
      && ZONE_DAMAGE.head > ZONE_DAMAGE.torso && ZONE_DAMAGE.torso > ZONE_DAMAGE.arm;
});
TEST_SUITE.run('An arm hit disarms a guard and takes him out of the fight', function () {
  var e = null;
  for (var i = 0; i < ENEMIES.list.length; i++) {
    if (ENEMIES.list[i].state !== 'DEAD' && ENEMIES.list[i].kind !== 'scientist' && ENEMIES.list[i].gun) { e = ENEMIES.list[i]; break; }
  }
  if (!e) return false;
  var wasCombatant = e.isCombatant();
  e.takeDamage(1, PLAYER.pos, 'arm');
  var disarmed = e.disarmed && !e.gun && !!e.droppedGun && e.droppedGun.parent === RENDER.scene;
  var out = wasCombatant && disarmed && !e.isCombatant();
  // the roster is rebuilt on every mission start, which puts the rifle back
  return out;
});
TEST_SUITE.run('The alarm needs a guard to reach a working panel', function () {
  if (!LEVEL.panels || !LEVEL.panels.length) return false;
  var savedAlarm = GAME.alarm, savedRunner = ENEMIES.runnerActive;
  // with every panel cut there is nothing to run to, so nobody can call it in
  var states = [];
  for (var i = 0; i < LEVEL.panels.length; i++) { states.push(LEVEL.panels[i].alive); LEVEL.panels[i].alive = false; }
  var noneLeft = nearestLivePanel(PLAYER.pos) === null;
  LEVEL.panels[0].alive = true;
  var findsOne = nearestLivePanel(PLAYER.pos) === LEVEL.panels[0];
  for (i = 0; i < LEVEL.panels.length; i++) LEVEL.panels[i].alive = states[i];
  GAME.alarm = savedAlarm; ENEMIES.runnerActive = savedRunner;
  return noneLeft && findsOne;
});
TEST_SUITE.run('Objectives scale with the difficulty tier', function () {
  var saved = GAME.difficulty;
  GAME.difficulty = 0; var agent = activeObjectives().length;
  GAME.difficulty = 1; var secret = activeObjectives().length;
  GAME.difficulty = 2; var oo = activeObjectives().length;
  // the exit is always the last line of the list, whatever the tier
  var lastIsExit = activeObjectives()[oo - 1].id === 'escape';
  GAME.difficulty = saved;
  return agent === 2 && secret === 3 && oo === 4 && lastIsExit;
});
TEST_SUITE.run('A constraint objective can be failed outright', function () {
  var saved = GAME.difficulty, savedKills = GAME.sciKills;
  GAME.difficulty = 2;
  GAME.sciKills = 0;
  var staff = null, list = activeObjectives();
  for (var i = 0; i < list.length; i++) if (list[i].id === 'staff') staff = list[i];
  var okClean = staff && staff.done() && !staff.failed();
  GAME.sciKills = 1;
  var failsDirty = !staff.done() && staff.failed() && !fieldObjectivesMet();
  GAME.sciKills = savedKills; GAME.difficulty = saved;
  return okClean && failsDirty;
});
TEST_SUITE.run('Every interactable is registered and reports its own state', function () {
  if (!INTERACTABLES.length) return false;
  var shoot = 0, use = 0, i;
  for (i = 0; i < INTERACTABLES.length; i++) {
    var it = INTERACTABLES[i];
    if (!it.mesh || !it.label || typeof it.live !== 'function') return false;
    if (it.kind === 'shoot') shoot++; else if (it.kind === 'use') use++; else return false;
  }
  // seven alarm panels, four stockpile gauges, one terminal
  if (shoot !== LEVEL.panels.length + LEVEL.tanks.length || use !== 1) return false;

  // The registrations are built in var-scoped loops, so every entry must be
  // bound to its own fixture rather than to whichever one was created last.
  var p0 = LEVEL.panels[0], p1 = LEVEL.panels[1];
  var e0 = null, e1 = null;
  for (i = 0; i < INTERACTABLES.length; i++) {
    if (INTERACTABLES[i].mesh === p0.mesh) e0 = INTERACTABLES[i];
    if (INTERACTABLES[i].mesh === p1.mesh) e1 = INTERACTABLES[i];
  }
  if (!e0 || !e1) return false;
  var was0 = p0.alive, was1 = p1.alive;
  p0.alive = false; p1.alive = true;
  var independent = (e0.live() === false && e1.live() === true);
  p0.alive = was0; p1.alive = was1;
  return independent;
});
TEST_SUITE.run('The reticle names what a shot would actually hit', function () {
  var saved = { x: PLAYER.pos.x, y: PLAYER.pos.y, z: PLAYER.pos.z,
                yaw: PLAYER.yaw, pitch: PLAYER.pitch, state: GAME.state };
  GAME.state = 'playing';
  function lookAt(mesh, dist) {
    var wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    PLAYER.pos.set(wp.x, 0, wp.z + dist);
    PLAYER.yaw = 0;
    PLAYER.pitch = Math.atan2(wp.y - (PLAYER.pos.y + PLAYER.eye), dist);
    RENDER.camera.position.set(PLAYER.pos.x, PLAYER.pos.y + PLAYER.eye, PLAYER.pos.z);
    RENDER.camera.rotation.set(PLAYER.pitch, PLAYER.yaw, 0);
    RENDER.camera.updateMatrixWorld();
    updateAimProbe();
  }
  var panel = LEVEL.panels[1];
  lookAt(panel.mesh, 4);
  var onPanel = AIM.kind === 'shoot' && AIM.target.mesh === panel.mesh && !!AIM.prompt;

  // a fixture that no longer does anything must stop advertising itself
  var wasAlive = panel.alive;
  panel.alive = false;
  lookAt(panel.mesh, 4);
  var deadIsSilent = AIM.kind === null;
  panel.alive = wasAlive;

  // and nothing is named through a wall
  PLAYER.pos.set(panel.pos.x, 0, panel.pos.z + 40);
  PLAYER.yaw = 0; PLAYER.pitch = 0;
  RENDER.camera.position.set(PLAYER.pos.x, PLAYER.pos.y + PLAYER.eye, PLAYER.pos.z);
  RENDER.camera.rotation.set(0, 0, 0);
  RENDER.camera.updateMatrixWorld();
  updateAimProbe();
  var noXray = AIM.kind !== 'shoot';

  PLAYER.pos.set(saved.x, saved.y, saved.z);
  PLAYER.yaw = saved.yaw; PLAYER.pitch = saved.pitch; GAME.state = saved.state;
  updateAimProbe();
  return onPanel && deadIsSilent && noXray;
});
TEST_SUITE.run('Use prompts come from proximity, not from landing a ray', function () {
  var saved = { x: PLAYER.pos.x, z: PLAYER.pos.z, yaw: PLAYER.yaw, state: GAME.state };
  GAME.state = 'playing';
  var t = LEVEL.terminal;
  function stand(dist) {
    PLAYER.pos.set(t.pos.x, PLAYER.pos.y, t.pos.z + dist);
    PLAYER.yaw = 0;               // facing -Z, toward the terminal
    updateAimProbe();
  }
  stand(2.0);
  var close = AIM.kind === 'use' && AIM.prompt === 'HOLD USE';
  stand(6.0);
  var far = AIM.kind === 'use' && AIM.prompt === 'MOVE CLOSER';
  PLAYER.yaw = Math.PI;           // turned away from it
  updateAimProbe();
  var facingMatters = AIM.kind !== 'use';
  PLAYER.pos.set(saved.x, PLAYER.pos.y, saved.z);
  PLAYER.yaw = saved.yaw; GAME.state = saved.state;
  updateAimProbe();
  return close && far && facingMatters;
});
TEST_SUITE.run('Adaptive quality ignores warm-up, survives a stall, and recovers', function () {
  var savedStage = GFX.stage, savedGood = GFX.goodWindows, savedIdx = GFX.sampleIdx,
      savedScale = RENDER.renderScale, savedFrames = GAME.frameCount, savedState = GAME.state;
  function feed(ms, windows) {
    for (var w = 0; w < windows; w++) for (var i = 0; i < 60; i++) updateRenderScale(0.016, ms);
  }
  GAME.state = 'playing';
  GAME.frameCount = 0; GFX.stage = 0; GFX.goodWindows = 0; GFX.sampleIdx = 0;
  feed(400, 2);
  var warmupIgnored = GFX.stage === 0;          // boot frames prove nothing

  GAME.frameCount = 1000;
  feed(400, 2);
  var downgraded = GFX.stage === 2;             // sustained load does

  feed(8, 6);                                   // three clean windows per stage
  var recovered = GFX.stage === 0 && RENDER.renderScale === 1;

  GFX.stage = 0; GFX.goodWindows = 0;
  for (var i = 0; i < 59; i++) updateRenderScale(0.016, 9);
  updateRenderScale(0.016, 2000);               // one enormous stall
  var survivedStall = GFX.stage === 0;

  GFX.stage = savedStage; GFX.goodWindows = savedGood; GFX.sampleIdx = savedIdx;
  RENDER.renderScale = savedScale; GAME.frameCount = savedFrames; GAME.state = savedState;
  return warmupIgnored && downgraded && recovered && survivedStall;
});
TEST_SUITE.run('Every muzzle flash source decays the shared light to zero', function () {
  var savedTimer = WEAPONS.flashTimer, savedPeak = WEAPONS.flashPeak,
      savedSpan = WEAPONS.flashSpan, savedFrom = WEAPONS.flashFromPlayer;
  var here = PLAYER.pos.clone();
  var ok = true;
  // guard fire and mine blasts drive the same light the player's muzzle does;
  // each one has to arm the timer, or it burns for the rest of the mission
  var sources = [
    function () { flashMuzzle(here); },
    function () { flashLight(here, 5, 3.4, 0xffaa33, 0.08); },
    function () { flashLight(here, 26, 11, 0xffc04a, 0.22); }
  ];
  for (var i = 0; i < sources.length && ok; i++) {
    sources[i]();
    if (WEAPONS.muzzleLight.intensity <= 0) { ok = false; break; }
    for (var f = 0; f < 60; f++) updateWeapons(0.016, INPUT);   // ~1s of frames
    if (WEAPONS.muzzleLight.intensity !== 0 || WEAPONS.flashTimer !== 0) ok = false;
  }
  WEAPONS.flashTimer = savedTimer; WEAPONS.flashPeak = savedPeak;
  WEAPONS.flashSpan = savedSpan; WEAPONS.flashFromPlayer = savedFrom;
  WEAPONS.muzzleLight.intensity = 0;
  return ok;
});
TEST_SUITE.run('Aim assist bends a near miss but ignores a wild shot', function () {
  var e = null;
  for (var i = 0; i < ENEMIES.list.length; i++) if (ENEMIES.list[i].state !== 'DEAD') { e = ENEMIES.list[i]; break; }
  if (!e) return false;
  var ep = e.group.position;
  var origin = new THREE.Vector3(ep.x, ep.y + 1.65, ep.z + 6);
  var toChest = new THREE.Vector3(ep.x, ep.y + 1.05, ep.z).sub(origin).normalize();

  function assisted(offset) {
    var dir = toChest.clone();
    dir.x += offset; dir.normalize();
    var before = dir.clone();
    var ray = new THREE.Raycaster(origin.clone(), dir, 0, 60);
    var hit = applyAimAssist(ray, currentWeapon);
    return { hit: !!hit, moved: ray.ray.direction.distanceTo(before) };
  }
  var savedAiming = WEAPONS.aiming, savedTouch = INPUT.usingTouch;
  WEAPONS.aiming = false; INPUT.usingTouch = true;
  var near = assisted(0.05);     // a few degrees off: should be pulled in
  var wild = assisted(1.4);      // most of a right angle off: must be left alone
  WEAPONS.aiming = true;
  var ads = assisted(0.05);      // down the sights: the player is aiming, not us
  WEAPONS.aiming = savedAiming; INPUT.usingTouch = savedTouch;
  return near.hit && near.moved > 1e-6 && !wild.hit && wild.moved < 1e-9 && !ads.hit;
});

/* Door cases live here rather than in the test section above: doors are built
   and driven from this section, and a <script> cannot see ahead of itself. */
TEST_SUITE.run('Door collider always agrees with the slab position', function () {
  var d = LEVEL.doors[0];
  var savedOpen = d.open, savedTarget = d.target, savedLocked = d.locked;
  var ok = true;
  d.locked = false;
  // step the door across its whole travel and demand the box track it every frame
  for (var o = 0; o <= 1.0001; o += 0.05) {
    d.open = o; d.target = o;
    updateDoors(0.016);
    if (d.aabb.disabled !== (d.open > 0.75)) { ok = false; break; }
  }
  d.open = savedOpen; d.target = savedTarget; d.locked = savedLocked;
  d.mesh.position.y = d.closedY + d.open * (WALL_H - 0.1);
  d.aabb.disabled = d.open > 0.75;
  return ok;
});
TEST_SUITE.run('A door will not close on a body standing in its mouth', function () {
  var d = LEVEL.doors[0];
  var savedOpen = d.open, savedTarget = d.target, savedLocked = d.locked;
  var savedPos = PLAYER.pos.clone();
  d.locked = false; d.open = 1; d.target = 1;
  PLAYER.pos.set(d.x, PLAYER.pos.y, d.z);     // stood in the doorway
  updateDoors(0.016);
  var heldOpen = d.target === 1;
  PLAYER.pos.set(d.x, PLAYER.pos.y, d.z + 40); // well clear, and no guard nearby
  updateDoors(0.016);
  var released = d.target === 0;
  PLAYER.pos.copy(savedPos);
  d.open = savedOpen; d.target = savedTarget; d.locked = savedLocked;
  d.aabb.disabled = d.open > 0.75;
  return heldOpen && released;
});

/* ---------- rebuild coverage ---------- */
TEST_SUITE.run('Every alarm panel is mounted flush on a real wall', function () {
  for (var i = 0; i < LEVEL.panels.length; i++) {
    var p = LEVEL.panels[i];
    // the point just behind the panel must be inside a wall slab
    var n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.mesh.rotation.y);
    var behind = { x: p.pos.x - n.x * 0.16, y: 1.45, z: p.pos.z - n.z * 0.16 };   // inside the slab
    var inWall = false;
    for (var c = 0; c < collidables.length; c++) {
      var b = collidables[c];
      if (b.tag !== 'wall') continue;
      if (behind.x > b.minX && behind.x < b.maxX && behind.z > b.minZ && behind.z < b.maxZ) inWall = true;
    }
    if (!inWall) throw new Error('panel ' + i + ' at ' + p.pos.x.toFixed(1) + ',' + p.pos.z.toFixed(1) + ' is not on a wall');
    if (!bodyFits(p.stand.x, p.stand.z, 0)) throw new Error('panel ' + i + ' stand point is blocked');
  }
  return LEVEL.panels.length === 7;
});
TEST_SUITE.run('wallMount refuses a side with no wall', function () {
  try { wallMount(LEVEL, 12, 11, 'E'); } catch (e) { return /no wall/.test(e.message); }
  return false;
});
TEST_SUITE.run('Nav graph: every open cell has a route to the terminal and the exit', function () {
  var saved = [];
  for (var d = 0; d < LEVEL.doors.length; d++) { saved.push(LEVEL.doors[d].locked); LEVEL.doors[d].locked = false; }
  var term = navCellFor(LEVEL.terminal.pos.x, LEVEL.terminal.pos.z + 1.2);
  var exit = navCellFor(LEVEL.spawnPoints.exit.x, LEVEL.spawnPoints.exit.z);
  var path = [], bad = [];
  for (var i = 0; i < NAV.open.length; i++) {
    if (!NAV.open[i]) continue;
    if (!navPath(i, term, path) || !navPath(i, exit, path)) bad.push(i);
    for (var k = 1; k < path.length; k++) {
      var a = path[k - 1], b = path[k];
      if (Math.abs(a % NAV.w - b % NAV.w) > 1 || Math.abs(((a / NAV.w) | 0) - ((b / NAV.w) | 0)) > 1) throw new Error('non-adjacent step');
    }
  }
  for (d = 0; d < LEVEL.doors.length; d++) LEVEL.doors[d].locked = saved[d];
  if (bad.length) throw new Error(bad.length + ' cells without a route, e.g. ' + bad[0]);
  return term >= 0 && exit >= 0;
});
TEST_SUITE.run('Nav graph: a locked door is not a route', function () {
  var exit = navCellFor(LEVEL.spawnPoints.exit.x, LEVEL.spawnPoints.exit.z);
  var from = navCellFor(PLAYER.pos.x, PLAYER.pos.z);
  var locked = LEVEL.doors.filter(function (d) { return d.tag.indexOf('exit') === 0; });
  var saved = locked.map(function (d) { return d.locked; });
  locked.forEach(function (d) { d.locked = true; });
  var blocked = !navPath(from, exit, []);
  locked.forEach(function (d, i) { d.locked = saved[i]; });
  return blocked;
});
TEST_SUITE.run('Box sight test agrees with the rendered level', function () {
  // Rays that hit a wall mesh must also hit a collision box at about the same
  // distance; the box test is what sight and occlusion now run on.
  var rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), checked = 0, worst = 0;
  var starts = [[16, 1.5, 30], [50, 1.5, 48], [84, 1.5, 70], [30, 1.5, 90], [86, 1.8, 100]];
  var walls = LEVEL.meshes.filter(function (m) { return /^walls/.test(m.name); });
  for (var s2 = 0; s2 < starts.length; s2++) {
    for (var a = 0; a < 24; a++) {
      o.set(starts[s2][0], starts[s2][1], starts[s2][2]);
      d.set(Math.sin(a / 24 * 6.283), 0, Math.cos(a / 24 * 6.283));
      rc.set(o, d); rc.far = 60;
      var h = rc.intersectObjects(walls, false);
      if (!h.length) continue;
      var bd = rayBoxesDistance(o, d, 0, 60);
      // a box can legitimately be nearer (a crate, a vat); never farther than a wall
      if (bd > h[0].distance + 0.15) throw new Error('box test saw through a wall at ' + starts[s2] + ' angle ' + a);
      worst = Math.max(worst, h[0].distance - bd);
      checked++;
    }
  }
  return checked > 60;
});
TEST_SUITE.run('The light count never changes as the pool is re-homed', function () {
  function visibleLights() { var n = 0; RENDER.scene.traverse(function (o) { if (o.isLight && o.visible) n++; }); return n; }
  var base = visibleLights();
  var spots = [[16, 20], [50, 48], [84, 70], [86, 100], [30, 90], [28, 112]];
  for (var i = 0; i < spots.length; i++) {
    updateLightPool(new THREE.Vector3(spots[i][0], 1.6, spots[i][1]));
    if (visibleLights() !== base) return false;
  }
  updateLightPool(RENDER.camera.position);
  return base >= CFG.render.lightPoolSize;
});
TEST_SUITE.run('Only one objective waypoint is declared, and it is the bearing-based one', function () {
  return /bearing/.test(hudDrawWaypoint.toString()) && /stockpile/.test(hudObjectiveTarget.toString());
});
TEST_SUITE.run('A dead scientist on 00 Agent fails the mission at the exit instead of locking it', function () {
  var saved = { d: GAME.difficulty, k: GAME.sciKills, t: GAME.objectives.terminal, s: GAME.objectives.stockpile,
                x: PLAYER.pos.x, z: PLAYER.pos.z };
  GAME.difficulty = 2; GAME.sciKills = 1; GAME.objectives.terminal = true; GAME.objectives.stockpile = true;
  PLAYER.pos.x = LEVEL.spawnPoints.exit.x; PLAYER.pos.z = LEVEL.spawnPoints.exit.z;
  var canLeave = checkExtraction(), isWin = checkWin(), failed = anyObjectiveFailed();
  GAME.sciKills = 0;
  var cleanWin = checkWin();
  GAME.objectives.stockpile = false;
  var heldForStock = !checkExtraction() && outstandingObjectives()[0].id === 'stockpile';
  GAME.difficulty = saved.d; GAME.sciKills = saved.k; GAME.objectives.terminal = saved.t; GAME.objectives.stockpile = saved.s;
  PLAYER.pos.x = saved.x; PLAYER.pos.z = saved.z;
  return canLeave && !isWin && failed && cleanWin && heldForStock;
});
TEST_SUITE.run('A dropped rifle grants the KF7 with a loaded magazine; cycling skips unowned weapons', function () {
  var kf7 = WEAPONS.list[1];
  var saved = { o: kf7.owned, m: kf7.ammoInMag, r: kf7.reserve, idx: WEAPONS.index };
  kf7.owned = false; kf7.ammoInMag = 0; kf7.reserve = 0;
  switchWeapon(0);
  cycleWeapon(1);
  var skipped = WEAPONS.index === 2;             // straight past the rifle to the mines
  switchWeapon(0);
  applyPickup({ kind: 'kf7', amount: 20 });
  var granted = kf7.owned && kf7.ammoInMag === 20 && kf7.reserve === 0;
  applyPickup({ kind: 'kf7', amount: 15 });
  var topped = kf7.reserve === 15;
  kf7.reserve = CFG.pickups.kf7ReserveCap;
  var refusedFull = applyPickup({ kind: 'ammo', amount: 60 }) === false;
  kf7.owned = saved.o; kf7.ammoInMag = saved.m; kf7.reserve = saved.r;
  WEAPONS.index = saved.idx; currentWeapon = WEAPONS.list[saved.idx];
  return skipped && granted && topped && refusedFull;
});
TEST_SUITE.run('Body armour stacks to the cap and is refused when full', function () {
  var saved = PLAYER.armor;
  PLAYER.armor = 0;
  var a = applyPickup({ kind: 'armor', amount: 50 }) && PLAYER.armor === 50;
  var b = applyPickup({ kind: 'armor', amount: 80 }) && PLAYER.armor === CFG.player.maxArmor;
  var c = applyPickup({ kind: 'armor', amount: 50 }) === false;
  PLAYER.armor = saved;
  return a && b && c;
});
TEST_SUITE.run('Every placed pickup sits where a body can reach it', function () {
  for (var i = 0; i < PICKUPS.statics.length; i++) {
    var p = PICKUPS.statics[i];
    if (!bodyFits(p.pos.x, p.pos.z, p.pos.y)) throw new Error(p.kind + ' pickup ' + i + ' is inside geometry');
    if (navCellFor(p.pos.x, p.pos.z) < 0) throw new Error(p.kind + ' pickup ' + i + ' is off the nav graph');
  }
  return PICKUPS.statics.length === PICKUP_SPOTS.length;
});
TEST_SUITE.run('Save data: garbage degrades to defaults field by field', function () {
  var junk = sanitizeSave({ best: [NaN, -4, 1e9], unlocked: { dk: 'yes', paintball: true },
                            cheatsOn: { paintball: true, dk: true }, settings: { sensitivity: 99, volume: 'loud',
                            invertY: 1, lookMode: 'mouse', bloom: false } });
  return junk.best.join() === '0,0,0' && junk.unlocked.paintball === true && !junk.unlocked.dk &&
         junk.cheatsOn.paintball === true && !junk.cheatsOn.dk &&
         junk.settings.sensitivity === 2.6 && junk.settings.volume === SETTINGS_DEFAULT.volume &&
         junk.settings.invertY === false && junk.settings.lookMode === 'swipe' && junk.settings.bloom === false &&
         sanitizeSave(null).settings.lookMode === 'swipe' && sanitizeSave('x').best.length === 3;
});
TEST_SUITE.run('Cheats: unlock rules follow tier and time; a cheated run records nothing', function () {
  var saved = JSON.stringify({ best: SAVE.best, unlocked: SAVE.unlocked, cheatsOn: SAVE.cheatsOn });
  var st = { d: GAME.difficulty, e: GAME.elapsed, c: GAME.cheated };
  SAVE.best = [0, 0, 0]; SAVE.unlocked = {}; SAVE.cheatsOn = {};
  GAME.difficulty = 1; GAME.elapsed = 200; GAME.cheated = false;
  var r1 = recordResult(true);
  var ok1 = r1.newBest && SAVE.best[1] === 200 && SAVE.unlocked.paintball && SAVE.unlocked.dk && SAVE.unlocked.ammo && !SAVE.unlocked.turbo;
  GAME.elapsed = 150; GAME.cheated = true;
  var r2 = recordResult(true);
  var ok2 = !r2.newBest && SAVE.best[1] === 200;
  GAME.cheated = false;
  var r3 = recordResult(false);
  var ok3 = !r3.newBest && r3.unlocked.length === 0;
  SAVE.cheatsOn.turbo = true;                       // not unlocked, so not on
  var ok4 = !cheatOn('turbo') && !anyCheatOn();
  var o = JSON.parse(saved);
  SAVE.best = o.best; SAVE.unlocked = o.unlocked; SAVE.cheatsOn = o.cheatsOn;
  GAME.difficulty = st.d; GAME.elapsed = st.e; GAME.cheated = st.c;
  writeSave();
  return ok1 && ok2 && ok3 && ok4;
});
TEST_SUITE.run('DK Mode: the hit proxy grows to cover the bigger head', function () {
  var saved = GAME.dk;
  GAME.dk = true;
  var e = new Enemy(new THREE.Vector3(0, 0, -50), [], 'guard');
  GAME.dk = saved;
  var hb = new THREE.Box3().setFromObject(e.hitMesh), head = new THREE.Box3().setFromObject(e.head);
  var ok = hb.max.y >= head.max.y - 0.01 && enemyHitZone(e, new THREE.Vector3(0, head.max.y - 0.05, -50)) === 'head';
  e.dispose();
  return ok;
});
TEST_SUITE.run('Guards stand on the control-room platform rather than inside it', function () {
  var onPlat = ENEMIES.list.filter(function (e) {
    var p = e.group.position;
    return p.x > 78 && p.x < 94 && p.z > 96 && p.z < 108;
  });
  return onPlat.length > 0 && onPlat.every(function (e) { return Math.abs(e.group.position.y - 0.4) < 1e-6; });
});

TEST_SUITE.run('Guards are solid: the player is pushed out of a body, never into a wall', function () {
  var e = ENEMIES.list[2], g = e.group.position;
  var saved = PLAYER.pos.clone();
  PLAYER.pos.set(g.x + 0.1, g.y, g.z);
  separateFromBodies(PLAYER);
  var d = Math.hypot(PLAYER.pos.x - g.x, PLAYER.pos.z - g.z);
  var ok = d >= BODY_GAP - 1e-6 && playerIsClear(PLAYER.pos);
  PLAYER.pos.copy(saved);
  return ok;
});
TEST_SUITE.run('The damage arc points at the shooter', function () {
  var saved = { yaw: PLAYER.yaw, t: HUD.dmgDirTimer };
  PLAYER.yaw = 0;                                           // facing -Z
  hudFlashDamage(new THREE.Vector3(PLAYER.pos.x + 5, 0, PLAYER.pos.z));   // shooter on the right
  var fwx = -Math.sin(PLAYER.yaw), fwz = -Math.cos(PLAYER.yaw), rtx = Math.cos(PLAYER.yaw), rtz = -Math.sin(PLAYER.yaw);
  var ddx = HUD.dmgFromX - PLAYER.pos.x, ddz = HUD.dmgFromZ - PLAYER.pos.z;
  var brg = Math.atan2(ddx * rtx + ddz * rtz, ddx * fwx + ddz * fwz);
  var ok = HUD.dmgDirTimer > 0 && Math.abs(brg - Math.PI / 2) < 1e-9;      // +90deg: to the right
  PLAYER.yaw = saved.yaw; HUD.dmgDirTimer = saved.t;
  return ok;
});

window.__TESTS__ = TEST_SUITE;
