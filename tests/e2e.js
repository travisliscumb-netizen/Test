/* End-to-end scenarios for Operation Blackgate.

   Injected into the built page by tests/run.mjs. Each scenario starts a real
   mission and drives the real simulation -- simulate(), the same function the
   frame loop calls -- in fixed 60Hz steps, with no rendering in between, so a
   minute of play runs in well under a second. Movement goes through the real
   input, collision and door code: the bot sets keys and a heading and walks. */
'use strict';

(function () {
  var STEP = 1 / 60;

  function fresh(tier) {
    GAME.difficulty = tier;
    startMission();
  }
  function run(seconds, until) {
    var n = Math.ceil(seconds / STEP);
    for (var i = 0; i < n; i++) {
      if (GAME.state !== 'playing') return true;
      simulate(STEP);
      if (until && until()) return true;
    }
    return false;
  }
  function keysOff() { INPUT.keys = {}; INPUT.fire = false; INPUT.interact = false; INPUT.fireLatched = false; }
  /* Take guards out of the picture for traversal tests: they stay in the
     world (doors still respond to them) but stop thinking. */
  function pacify() {
    for (var i = 0; i < ENEMIES.list.length; i++) ENEMIES.list[i].update = function () {};
  }
  function finite(v) { return isFinite(v.x) && isFinite(v.y) && isFinite(v.z); }

  /* Walk the player to a world point along the nav graph, using the real
     movement code. Returns true on arrival within `near` metres. */
  function walkTo(x, z, near, maxSeconds) {
    near = near || 0.9;
    var path = [], idx = 0, replan = 0, t = 0;
    var goal = navCellFor(x, z);
    while (t < (maxSeconds || 90)) {
      if (GAME.state !== 'playing') return false;
      var px = PLAYER.pos.x, pz = PLAYER.pos.z;
      if (Math.hypot(x - px, z - pz) < near) { keysOff(); return true; }
      replan -= STEP;
      if (replan <= 0) {
        replan = 0.5;
        if (walkClear(px, pz, x, z)) path.length = 0;          // straight there
        else {
          navPath(navCellFor(px, pz), goal, path);
          idx = furthestReachableNode(px, pz, path);
        }
      }
      var tx = x, tz = z;
      while (idx < path.length) {
        var c = path[idx];
        if (Math.hypot(NAV.nx[c] - px, NAV.nz[c] - pz) < 0.6) { idx++; continue; }
        tx = NAV.nx[c]; tz = NAV.nz[c];
        break;
      }
      if (idx >= path.length) { tx = x; tz = z; }
      // forward is (-sin yaw, -cos yaw)
      PLAYER.yaw = Math.atan2(-(tx - px), -(tz - pz));
      PLAYER.pitch = 0;
      INPUT.keys = { w: true };
      simulate(STEP);
      t += STEP;
    }
    keysOff();
    return false;
  }
  /* Point the camera at a world point and pull the trigger once. */
  function shootAt(p) {
    var eye = new THREE.Vector3(PLAYER.pos.x, PLAYER.pos.y + PLAYER.eye, PLAYER.pos.z);
    PLAYER.yaw = Math.atan2(-(p.x - eye.x), -(p.z - eye.z));
    PLAYER.pitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z));
    RENDER.camera.position.copy(eye);
    RENDER.camera.rotation.set(PLAYER.pitch, PLAYER.yaw, 0);
    RENDER.camera.updateMatrixWorld();
    WEAPONS.cooldown = 0; WEAPONS.reloading = 0;
    WEAPONS.aiming = true;           // aimed shots: no assist, tight spread
    var r = fireWeapon();
    WEAPONS.aiming = false;
    return r;
  }
  function useTerminal() {
    var t = LEVEL.terminal;
    PLAYER.yaw = Math.atan2(-(t.pos.x - PLAYER.pos.x), -(t.pos.z - PLAYER.pos.z));
    INPUT.interact = true;
    var done = run(3, function () { return t.used; });
    INPUT.interact = false;
    return done || t.used;
  }
  /* The full route for a tier: archive, stockpile if required, exit. */
  function playThrough(tier) {
    fresh(tier);
    pacify();
    var t = LEVEL.terminal;
    // the terminal's screen faces north, into the room; the south side is the wall
    if (!walkTo(t.pos.x, t.pos.z - 1.5, 0.6)) return { ok: false, detail: 'never reached the terminal (at ' + PLAYER.pos.x.toFixed(1) + ',' + PLAYER.pos.z.toFixed(1) + ')' };
    if (!useTerminal()) return { ok: false, detail: 'terminal did not complete on USE' };
    if (tier >= 1) {
      for (var i = 0; i < LEVEL.tanks.length; i++) {
        var tank = LEVEL.tanks[i];
        var g = new THREE.Vector3(); tank.gauge.getWorldPosition(g);
        if (!walkTo(g.x + 2.5, g.z, 0.8)) return { ok: false, detail: 'could not reach tank ' + i + ' (stopped at ' + PLAYER.pos.x.toFixed(1) + ',' + PLAYER.pos.z.toFixed(1) + ')' };
        for (var s = 0; s < 4 && tank.intact; s++) shootAt(g);
        if (tank.intact) return { ok: false, detail: 'tank ' + i + ' survived four aimed shots' };
      }
      if (!GAME.objectives.stockpile) return { ok: false, detail: 'stockpile objective not set' };
    }
    var e = LEVEL.spawnPoints.exit;
    walkTo(e.x, e.z, 1.0);
    run(1);
    return null;
  }

  var S = {};

  S['Agent: full mission completes end to end on foot'] = function () {
    var fail = playThrough(0);
    if (fail) return fail;
    var title = document.getElementById('endTitle').textContent;
    return { ok: GAME.state === 'over' && title === 'MISSION COMPLETE' && GAME.objectives.escaped,
             detail: GAME.state + ' / ' + title + ' in ' + fmtClock(GAME.elapsed) };
  };
  S['Secret Agent: archive, all four tanks, exit'] = function () {
    var fail = playThrough(1);
    if (fail) return fail;
    var title = document.getElementById('endTitle').textContent;
    return { ok: GAME.state === 'over' && title === 'MISSION COMPLETE', detail: title + ' in ' + fmtClock(GAME.elapsed) };
  };
  S['00 Agent: clean run completes; cheat targets are achievable'] = function () {
    var fail = playThrough(2);
    if (fail) return fail;
    var title = document.getElementById('endTitle').textContent;
    // the invincibility target has to be beatable by a direct route with room to fight
    return { ok: title === 'MISSION COMPLETE' && GAME.elapsed < 180 * 0.7,
             detail: title + ' in ' + fmtClock(GAME.elapsed) + ' (target 3:00)' };
  };
  S['00 Agent: a dead scientist fails the mission at the exit, not a soft lock'] = function () {
    fresh(2);
    pacify();
    var sci = ENEMIES.list.filter(function (e) { return e.kind === 'scientist'; })[0];
    sci.takeDamage(999, PLAYER.pos, 'torso');
    var failedRow = HUD.objRows.some(function (r) { return r.className === 'failed'; });
    GAME.objectives.terminal = true; GAME.objectives.stockpile = true;
    LEVEL.doors.forEach(function (d) { d.locked = false; });
    var e = LEVEL.spawnPoints.exit;
    walkTo(e.x, e.z, 1.0);
    run(1);
    var title = document.getElementById('endTitle').textContent;
    return { ok: failedRow && GAME.state === 'over' && title === 'MISSION FAILED',
             detail: 'hud failed row ' + failedRow + ', ' + GAME.state + ' / ' + title };
  };
  S['Standing at the exit with the stockpile intact says why'] = function () {
    fresh(1);
    pacify();
    GAME.objectives.terminal = true;
    LEVEL.doors.forEach(function (d) { d.locked = false; });
    var e = LEVEL.spawnPoints.exit;
    walkTo(e.x, e.z, 1.0);
    run(0.2);
    var prompt = HUD.el.interactPrompt.textContent;
    return { ok: GAME.state === 'playing' && /STOCKPILE/.test(prompt), detail: GAME.state + ' / "' + prompt + '"' };
  };
  S['Every guard who spots you can reach a live alarm panel'] = function () {
    var guards = SPAWNS.map(function (s, i) { return s.kind === 'guard' ? i : -1; }).filter(function (i) { return i >= 0; });
    var slow = [];
    for (var k = 0; k < guards.length; k++) {
      fresh(1);
      // player parked out of everyone's sight in the exit hall
      PLAYER.pos.set(LEVEL.spawnPoints.exit.x, 0, LEVEL.spawnPoints.exit.z + 2);
      var g = ENEMIES.list[guards[k]];
      for (var j = 0; j < ENEMIES.list.length; j++) if (ENEMIES.list[j] !== g) ENEMIES.list[j].update = function () {};
      g.setLastKnown(g.group.position.x + 2, g.group.position.z);
      g.setState('ALERT');
      var raised = run(40, function () { return GAME.alarm; });
      if (!raised) slow.push(guards[k] + '@' + g.group.position.x.toFixed(0) + ',' + g.group.position.z.toFixed(0) + ' ' + g.state);
    }
    return { ok: slow.length === 0, detail: slow.length ? 'never raised: ' + slow.join('; ') : guards.length + ' guards' };
  };
  S['With every panel cut the alarm can never be raised'] = function () {
    fresh(1);
    LEVEL.panels.forEach(function (p) { destroyPanel(p); });
    var g = ENEMIES.list[3];
    g.setLastKnown(g.group.position.x + 2, g.group.position.z);
    g.setState('ALERT');
    GAME.invincible = true;
    run(20);
    return { ok: !GAME.alarm && !ENEMIES.runnerActive, detail: 'alarm ' + GAME.alarm };
  };
  S['After the alarm, every guard paths across the facility to you'] = function () {
    fresh(1);
    GAME.invincible = true;
    var spot = new THREE.Vector3(cellToWorldX(21), 0, cellToWorldZ(17));   // the lab
    PLAYER.pos.copy(spot); PLAYER.lastClear.copy(spot);
    raiseAlarm(null);
    var guards = ENEMIES.list.filter(function (e) { return e.kind === 'guard'; });
    var closest = guards.map(function () { return Infinity; });
    run(60, function () {
      for (var i = 0; i < guards.length; i++) {
        var d = guards[i].group.position.distanceTo(spot);
        if (d < closest[i]) closest[i] = d;
      }
      return false;
    });
    var missed = [];
    for (var i = 0; i < guards.length; i++) if (closest[i] > 14) missed.push(SPAWNS.indexOf(SPAWNS.filter(function (s) { return s.kind === 'guard'; })[i]) + ':' + closest[i].toFixed(0) + 'm');
    return { ok: missed.length === 0, detail: missed.length ? 'never closed in: ' + missed.join(', ') : guards.length + ' guards all came within 14m' };
  };
  S['Dropping a guard leaves his rifle, and walking over it arms you'] = function () {
    fresh(1);
    pacify();
    var g = ENEMIES.list[2];
    var before = PICKUPS.list.length;
    g.takeDamage(999, PLAYER.pos, 'torso');
    var dropped = PICKUPS.list.length === before + 1 && PICKUPS.list[PICKUPS.list.length - 1].kind === 'kf7';
    var rifle = PICKUPS.list[PICKUPS.list.length - 1];
    walkTo(rifle.pos.x, rifle.pos.z, 0.5);
    run(0.2);
    var kf7 = WEAPONS.list[1];
    return { ok: dropped && kf7.owned && kf7.ammoInMag > 0, detail: 'dropped ' + dropped + ', owned ' + kf7.owned + ', mag ' + kf7.ammoInMag };
  };
  S['The washroom stall armour is collected on foot'] = function () {
    fresh(1);
    pacify();
    var a = PICKUPS.statics[0];
    walkTo(a.pos.x, a.pos.z, 0.5);
    run(0.2);
    return { ok: PLAYER.armor === CFG.pickups.armor, detail: 'armour ' + PLAYER.armor };
  };
  S['Dying plays the death cam, then the debrief'] = function () {
    fresh(1);
    pacify();
    damagePlayer(10000, PLAYER.pos);
    run(0.8);
    var stillPlaying = GAME.state === 'playing' && !PLAYER.alive;
    run(2);
    var title = document.getElementById('endTitle').textContent;
    return { ok: stillPlaying && GAME.state === 'over' && title === 'MISSION FAILED', detail: title };
  };
  S['Pause drops held input and resumes without a time jump'] = function () {
    fresh(1);
    INPUT.fire = true; INPUT.fireLatched = true; INPUT.keys = { w: true };
    pauseGame();
    var cleared = !INPUT.fire && !INPUT.fireLatched && !INPUT.keys.w && GAME.state === 'paused';
    var t = GAME.elapsed;
    resumeGame();
    return { ok: cleared && GAME.state === 'playing' && GAME.elapsed === t, detail: 'cleared ' + cleared };
  };
  /* Aim at the nearest guard in clear sight, if any, and hold the trigger. */
  function engage() {
    var eye = new THREE.Vector3(PLAYER.pos.x, PLAYER.pos.y + PLAYER.eye, PLAYER.pos.z);
    var best = null, bestD = 25;
    for (var i = 0; i < ENEMIES.list.length; i++) {
      var e = ENEMIES.list[i];
      if (e.state === 'DEAD') continue;
      var c = new THREE.Vector3(e.group.position.x, e.group.position.y + 1.1, e.group.position.z);
      var d = c.distanceTo(eye);
      if (d < bestD && hasLineOfSight(eye, c)) { bestD = d; best = c; }
    }
    if (!best) { INPUT.fire = false; return false; }
    PLAYER.yaw = Math.atan2(-(best.x - eye.x), -(best.z - eye.z));
    PLAYER.pitch = Math.atan2(best.y - eye.y, Math.hypot(best.x - eye.x, best.z - eye.z));
    INPUT.fire = true;
    return true;
  }
  S['Combat soak: three minutes of real fighting, no NaN, nobody inside a wall'] = function () {
    fresh(2);
    GAME.invincible = true;
    var kf7 = WEAPONS.list[1];
    kf7.owned = true; kf7.ammoInMag = 30; kf7.reserve = 240;
    switchWeapon(1);
    var problems = [], pickedUp = 0;
    var waypoints = [[16, 40], [50, 48], [84, 60], [84, 76], [86, 100], [60, 98], [30, 90], [20, 100], [28, 84]];
    function audit(tag) {
      if (!finite(PLAYER.pos)) problems.push('player NaN ' + tag);
      if (!playerIsClear(PLAYER.pos)) problems.push('player in geometry ' + tag);
      ENEMIES.list.forEach(function (e, i) {
        var p = e.group.position;
        if (!finite(p)) problems.push('enemy ' + i + ' NaN');
        if (e.state !== 'DEAD' && !bodyFits(p.x, p.z, p.y)) problems.push('enemy ' + i + ' in geometry at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1));
        if (e.state !== 'DEAD' && Math.hypot(p.x - PLAYER.pos.x, p.z - PLAYER.pos.z) < BODY_GAP - 0.05) problems.push('enemy ' + i + ' inside the player');
      });
    }
    for (var w = 0; GAME.state === 'playing' && GAME.elapsed < 180; w = (w + 1) % waypoints.length) {
      // stand and fight whatever is in sight, then move on
      var fought = 0;
      while (engage() && fought < 6 && GAME.state === 'playing') {
        INPUT.keys = {};
        if (kf7.ammoInMag === 0 && kf7.reserve < 30) kf7.reserve = 240;   // the soak is about the AI, not ammo
        run(0.25);
        fought += 0.25;
      }
      INPUT.fire = false;
      var armourBefore = PLAYER.armor, owned = kf7.reserve;
      walkTo(waypoints[w][0], waypoints[w][1], 1.2, 20);
      if (PLAYER.armor > armourBefore || kf7.reserve > owned) pickedUp++;
      audit('after waypoint ' + w);
      if (problems.length) break;
    }
    INPUT.fire = false;
    var guardsDown = ENEMIES.list.filter(function (e) { return e.kind === 'guard' && e.state === 'DEAD'; }).length;
    return { ok: problems.length === 0 && guardsDown >= 5,
             detail: problems.slice(0, 3).join('; ') || ('clean over ' + fmtClock(GAME.elapsed) + ': ' + GAME.kills + ' kills (' + guardsDown + ' guards), ' +
                     GAME.stats.hits + '/' + GAME.stats.shots + ' hits, ' + GAME.stats.head + ' head, alarm ' + GAME.alarm) };
  };
  S['Five restarts leave the scene graph and geometry count flat'] = function () {
    function count() { var n = 0; RENDER.scene.traverse(function () { n++; }); return n; }
    // the paint pool is a fixed ring built on first use; build it before the baseline
    paintSplat(new THREE.Vector3(0, -50, 0), null, null);
    fresh(1); run(2);
    var base = count(), geo = RENDER.renderer.info.memory.geometries;
    for (var i = 0; i < 5; i++) {
      fresh(i % 3);
      ENEMIES.list[1].takeDamage(999, PLAYER.pos, 'torso');     // leaves a rifle behind
      ENEMIES.list[4].takeDamage(1, PLAYER.pos, 'arm');         // and a disarmed guard's
      GAME.paintball = true; shootAt(new THREE.Vector3(PLAYER.pos.x, 1.5, PLAYER.pos.z + 3));
      run(1);
    }
    fresh(1); run(2);
    var after = count(), geo2 = RENDER.renderer.info.memory.geometries;
    return { ok: after === base && geo2 <= geo + 2, detail: 'objects ' + base + ' -> ' + after + ', geometries ' + geo + ' -> ' + geo2 };
  };
  S['Swipe look turns the view by the drag, not by a rate'] = function () {
    fresh(1);
    pacify();
    INPUT.lookMode = 'swipe';
    var y0 = PLAYER.yaw;
    INPUT.swipeDX = 100;
    run(STEP);
    var turned = y0 - PLAYER.yaw;
    run(0.5);                                    // no further drag: no further turn
    var settled = Math.abs((y0 - PLAYER.yaw) - turned) < 1e-9;
    INPUT.lookMode = SAVE.settings.lookMode;
    var expect = 100 * TOUCH.swipeRate * INPUT.sensitivity;
    return { ok: Math.abs(turned - expect) < 1e-6 && settled, detail: 'turned ' + turned.toFixed(4) + ' expected ' + expect.toFixed(4) };
  };
  S['Mission end returns everything to a clean title state'] = function () {
    fresh(1);
    run(1);
    abortMission();
    var ok = GAME.state === 'menu' && GAME.screen === 'screenTitle' && !HUD.el.hud.classList.contains('on');
    // leave the page on the title screen for the hygiene checks
    return { ok: ok, detail: GAME.state + ' / ' + GAME.screen };
  };

  window.__E2E__ = S;
  window.__E2E_HELPERS__ = { walkTo: walkTo, run: run, fresh: fresh, pacify: pacify, shootAt: shootAt, playThrough: playThrough };
})();
