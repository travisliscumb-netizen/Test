/*
 * Block Stack 3D - game controller.
 *
 * Wires StackLogic (rules) to StackRender (visuals), owns the state machine,
 * input handling, HUD and menus. Exposes window.GameDebug for the automated
 * QA suite in test/e2e.mjs.
 */
(function (global) {
  'use strict';

  var L = global.StackLogic;
  var doc = global.document;

  function $(id) { return doc.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
  function txt(el, v) { if (el && el.textContent !== String(v)) el.textContent = String(v); }

  /* ================================================================== *
   * Sound - tiny WebAudio blips, created lazily on first gesture (iOS).
   * ================================================================== */

  var Sound = (function () {
    var ctx = null, muted = false, ready = false;
    function init() {
      if (ctx || ready) return;
      ready = true;
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (AC) ctx = new AC();
      } catch (e) { ctx = null; }
    }
    function resume() {
      init();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    }
    function tone(freq, dur, type, gain, slideTo) {
      if (muted) return;
      init();
      if (!ctx) return;
      try {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(gain || 0.14, ctx.currentTime + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + dur + 0.02);
      } catch (e) {}
    }
    return {
      resume: resume,
      setMuted: function (m) { muted = !!m; },
      isMuted: function () { return muted; },
      land:     function () { tone(196, 0.10, 'triangle', 0.10, 150); },
      perfect:  function (n) { tone(520 + Math.min(8, n) * 60, 0.16, 'triangle', 0.13); },
      recover:  function () { tone(330, 0.26, 'sine', 0.16, 780); },
      fail:     function () { tone(180, 0.42, 'sawtooth', 0.10, 60); },
      clear:    function () { tone(523, 0.16, 'triangle', 0.14); setTimeout(function () { tone(784, 0.26, 'triangle', 0.14); }, 130); },
      target:   function () { tone(660, 0.18, 'square', 0.09); setTimeout(function () { tone(990, 0.24, 'square', 0.09); }, 140); }
    };
  })();

  /* ================================================================== *
   * State
   * ================================================================== */

  var progress = L.createProgress();
  var view = null;                // renderer
  var cfg = null, theme = null;

  var S = {
    mode: 'boot',                 // boot | menu | playing | clear | fail
    level: 1,
    axis: 'x',
    topX: 0, topZ: 0, topY: 0,
    sizeX: 0, sizeZ: 0,
    height: 0,                    // successful stacks this run
    streak: 0,                    // consecutive perfect drops
    bestStreak: 0,
    score: 0,
    lastStars: 0,
    recoveries: 0,
    bossTargetMet: false,
    frozen: false,                // test hook only
    moving: null,                 // {pos, dir, t, active}
    elapsed: 0,
    shake: 0
  };

  var el = {};

  /* ------------------------------------------------------------------ *
   * Accidental-activation guard.
   *
   * A tap is delivered as pointerdown (which drops the block) and, later, as a
   * synthesised click. If that drop ends the run, the overlay button lands
   * under the finger and the trailing click would activate it. So every overlay
   * and the boss exit button ignore input for a moment after they appear, and
   * run-ending overlays wait long enough for the player to watch the block fall.
   * ------------------------------------------------------------------ */
  var UI_ARM_MS = 320;
  var FAIL_DELAY_MS = 680;
  var CLEAR_DELAY_MS = 460;
  var uiArmedAt = 0;
  var pendingOverlay = null;

  function now() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }
  function armUI(ms) { uiArmedAt = now() + (ms == null ? UI_ARM_MS : ms); }
  function uiLocked() { return now() < uiArmedAt; }
  function cancelPendingOverlay() {
    if (pendingOverlay) { clearTimeout(pendingOverlay); pendingOverlay = null; }
  }
  function showOverlayDelayed(overlay, delay) {
    cancelPendingOverlay();
    pendingOverlay = setTimeout(function () {
      pendingOverlay = null;
      show(overlay, true);
      armUI();
    }, delay);
  }

  /* ================================================================== *
   * Level lifecycle
   * ================================================================== */

  function blockColor(index) {
    var pal = theme.palette;
    var base = pal[index % pal.length];
    // gentle ombre so the tower reads as a climb rather than a stripe pattern
    var lift = Math.min(0.055, index * 0.0035);
    return L.adjust(base, 0, 1, lift);
  }

  function startLevel(level) {
    level = L.clamp(Math.round(level) || 1, 1, L.TOTAL_LEVELS);
    S.level = level;
    cfg = L.levelConfig(level);
    theme = L.themeForLevel(level);

    cancelPendingOverlay();
    el.stage.style.transform = '';
    view.reset();
    view.setTheme(theme);
    applyThemeToUI(theme);
    view.setFitBounds(cfg.travel + cfg.baseSize * 0.5 + 0.4, cfg.baseSize * 0.5 + 1.6,
                      cfg.hover * 0.58 + 1.2, cfg.hover * 0.42 + 2.8);

    view.setSpin(0);
    S.mode = 'playing';
    S.axis = 'x';
    S.topX = 0; S.topZ = 0; S.topY = 0;
    S.sizeX = cfg.baseSize; S.sizeZ = cfg.baseSize;
    S.height = 0; S.streak = 0; S.bestStreak = 0; S.score = 0;
    S.recoveries = 0; S.bossTargetMet = false; S.elapsed = 0; S.shake = 0;

    // Start on the floor. The concrete pad is the anchor for drop one and is
    // exactly the level's starting footprint, so the very first block can be
    // sliced or missed like any other - every block the player lands is theirs.
    view.setGround(theme, cfg.baseSize);

    view.focusOn(0, cfg.hover * 0.42, 0, true);
    spawnMoving();

    // the world identity is shown once, here, instead of sitting in the HUD
    if (el.worldCard) {
      txt(el.worldCardN, 'WORLD ' + cfg.world);
      txt(el.worldCardName, theme.worldName);
      el.worldCard.classList.remove('show');
      void el.worldCard.offsetWidth;
      el.worldCard.classList.add('show');
    }

    show(el.overlayMenu, false);
    show(el.overlayClear, false);
    show(el.overlayFail, false);
    show(el.overlayLevels, false);
    show(el.btnAdvance, false);
    show(el.banner, false);
    show(el.hud, true);
    updateHUD();
  }

  function spawnMoving() {
    S.axis = (S.height % 2 === 0) ? 'x' : 'z';
    var side = Math.random() < 0.5 ? -1 : 1;
    var start = side * cfg.travel;
    var y = S.topY + cfg.hover;      // hovering clear of the tower, not resting on it

    S.moving = { pos: start, dir: -side, t: 0, active: true, phase: Math.random() * Math.PI * 2 };

    var x = S.axis === 'x' ? start : S.topX;
    var z = S.axis === 'z' ? start : S.topZ;

    view.setMoving({
      x: x, z: z, y: y,
      anchorY: S.topY, anchorX: S.topX, anchorZ: S.topZ,
      anchorSx: S.sizeX, anchorSz: S.sizeZ,
      sx: S.sizeX, sz: S.sizeZ,
      color: blockColor(S.height + 1)
    });
  }

  /* ================================================================== *
   * Dropping
   * ================================================================== */

  function drop() {
    if (S.mode !== 'playing' || !S.moving || !S.moving.active) return;
    S.moving.active = false;

    var horiz = S.axis === 'x';
    var movingPos = S.moving.pos;
    var movingSize = horiz ? S.sizeX : S.sizeZ;
    var anchorPos = horiz ? S.topX : S.topZ;
    var anchorSize = movingSize;   // the block below has the same footprint

    var r = L.resolveDrop({
      movingPos: movingPos, movingSize: movingSize,
      anchorPos: anchorPos, anchorSize: anchorSize,
      perfectTol: cfg.perfectTol, minSize: cfg.minSize
    });

    var y = S.topY + L.BLOCK_HEIGHT;
    var color = blockColor(S.height + 1);
    var airY = S.topY + cfg.hover;

    if (r.missed) {
      // the whole block tumbles away from where it was hovering
      view.clearMoving();
      view.spawnSlice({
        x: horiz ? movingPos : S.topX, z: horiz ? S.topZ : movingPos, y: airY,
        sx: S.sizeX, sz: S.sizeZ, color: color,
        dir: horiz ? [Math.sign(r.offset) || 1, 0, 0] : [0, 0, Math.sign(r.offset) || 1]
      });
      S.shake = 0.35;
      Sound.fail();
      failRun();
      return;
    }

    // land the block
    var nx = horiz ? r.size : S.sizeX;
    var nz = horiz ? S.sizeZ : r.size;
    var px = horiz ? r.pos : S.topX;
    var pz = horiz ? S.topZ : r.pos;

    // The rules settle immediately - the next block must inherit the right size
    // straight away - while everything that happens *to* the tower waits for the
    // block to actually arrive.
    S.sizeX = nx; S.sizeZ = nz;
    S.topX = px; S.topZ = pz; S.topY = y;
    S.height += 1;
    S.score += L.dropScore({ level: S.level, perfect: r.perfect, streak: S.streak });

    var recovered = null;
    if (r.perfect) {
      S.streak += 1;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      Sound.perfect(S.streak);
      if (S.streak % L.RECOVERY_STREAK === 0) recovered = grantRecovery();
    } else {
      S.streak = 0;
      Sound.land();
    }

    // The block falls from where it was hovering. Its effects are held on this
    // drop's own closure, not on shared state, so two overlapping falls (a fast
    // player tapping again mid-flight) can never claim each other's refund.
    var perfect = r.perfect, slices = r.slices, cutFrom = r.pos;
    view.landMoving({
      x: px, z: pz, y: y, sx: nx, sz: nz, color: color,
      onLand: function () {
        for (var i = 0; i < slices.length; i++) {
          var sl = slices[i];
          var away = Math.sign(sl.pos - cutFrom) || 1;
          view.spawnSlice({
            x: horiz ? sl.pos : px, z: horiz ? pz : sl.pos, y: y,
            sx: horiz ? sl.size : nx, sz: horiz ? nz : sl.size,
            color: color, dir: horiz ? [away, 0, 0] : [0, 0, away]
          });
        }
        if (perfect) view.perfectFx(px, y, pz, color);
        if (recovered) {
          view.replaceTopBlock({ x: px, z: pz, y: y, sx: recovered.x, sz: recovered.z, color: color });
          view.recoveryFx(px, y, pz, theme.accent);
          flashToast('+ SIZE RESTORED');
        }
      }
    });

    progress.addStats(1, r.perfect ? 1 : 0, 0);

    if (cfg.isBoss) {
      progress.recordBossHeight(S.level, S.height);
      if (!S.bossTargetMet && S.height >= cfg.bossTarget) {
        S.bossTargetMet = true;
        show(el.btnAdvance, true);
        armUI(420);
        show(el.banner, true);
        el.banner.classList.remove('pop'); void el.banner.offsetWidth; el.banner.classList.add('pop');
        Sound.target();
      }
    }

    view.focusOn(S.topX, S.topY + cfg.hover * 0.42, S.topZ, false);

    if (!cfg.isBoss && S.height >= cfg.goal) {
      completeLevel('normal');
      return;
    }

    spawnMoving();
    updateHUD();
  }

  /**
   * 3-perfect streak refund. Never lets a footprint exceed the level base size.
   * The rules apply immediately, so the next block inherits the restored size.
   * Returns the refund for the caller to play back when the block lands, or
   * null when there was nothing to restore.
   */
  function grantRecovery() {
    var rec = L.applyRecovery(S.sizeX, S.sizeZ, cfg.baseSize);
    if (!rec.gained) return null;
    S.sizeX = rec.x; S.sizeZ = rec.z;
    S.recoveries += 1;
    Sound.recover();
    progress.addStats(0, 0, 1);
    return rec;
  }

  /* ================================================================== *
   * Run outcomes
   * ================================================================== */

  function failRun() {
    if (cfg.isBoss) {
      progress.recordBossHeight(S.level, S.height);
      if (S.bossTargetMet) {
        // Requirement: failing AFTER the target was reached still clears the boss.
        completeLevel('bossFallAfterTarget');
        return;
      }
    }
    S.mode = 'fail';
    S.moving = null;
    view.collapse(4);           // the top of the tower goes with it
    progress.recordScore(S.level, S.score);

    txt(el.failTitle, cfg.isBoss ? 'Boss Failed' : 'Tower Down');
    txt(el.failSub, cfg.isBoss
      ? 'You reached ' + S.height + ' of ' + cfg.bossTarget + ' - the climb resets.'
      : 'You stacked ' + S.height + ' of ' + cfg.goal + '.');
    txt(el.failScore, S.score);
    txt(el.failBest, cfg.isBoss ? progress.bossBest(S.level) : progress.levelBestScore(S.level));
    txt(el.failBestLabel, cfg.isBoss ? 'Best height' : 'Best score');
    show(el.btnAdvance, false);
    show(el.banner, false);
    showOverlayDelayed(el.overlayFail, FAIL_DELAY_MS);
    updateHUD();
  }

  /**
   * @param {string} how 'normal' | 'bossAdvance' | 'bossFallAfterTarget'
   */
  function completeLevel(how) {
    S.mode = 'clear';
    S.moving = null;
    view.clearMoving();
    progress.recordScore(S.level, S.score);
    if (cfg.isBoss) progress.recordBossHeight(S.level, S.height);
    var next = Math.min(L.TOTAL_LEVELS, S.level + 1);
    if (S.level < L.TOTAL_LEVELS) progress.unlock(next);
    Sound.clear();

    var isLast = S.level >= L.TOTAL_LEVELS;
    txt(el.clearTitle, cfg.isBoss ? (isLast ? 'Summit Reached' : 'Boss Cleared') : 'Level Cleared');
    var sub;
    if (how === 'bossFallAfterTarget') {
      sub = 'You passed the required height of ' + cfg.bossTarget +
            ' before falling - the boss counts as cleared. Final height ' + S.height + '.';
    } else if (cfg.isBoss) {
      sub = 'Required ' + cfg.bossTarget + ', climbed ' + S.height + '.';
    } else {
      sub = 'Stacked ' + S.height + ' with ' + S.bestStreak + ' perfect in a row.';
    }
    txt(el.clearSub, sub);

    // stars are earned on how much of the block survived the level
    var frac = L.sizeFraction(S.sizeX, S.sizeZ, cfg.baseSize);
    var stars = L.starsForFraction(frac);
    S.lastStars = stars;
    var improved = progress.recordStars(S.level, stars);
    txt(el.clearPct, Math.round(frac * 100) + '%');
    var cs = el.clearStars.children;
    for (var i = 0; i < cs.length; i++) {
      cs[i].classList.remove('on', 'pop');
      if (i < stars) {
        cs[i].classList.add('on');
        (function (node, idx) {
          setTimeout(function () { node.classList.add('pop'); }, 90 + idx * 130);
        })(cs[i], i);
      }
    }
    el.clearStars.setAttribute('data-best', improved ? 'new' : '');

    txt(el.clearScore, S.score);
    txt(el.clearStat1, S.bestStreak);
    txt(el.clearStat2, S.recoveries);
    txt(el.btnNext, isLast ? 'Back to Map' : 'Next Level');
    show(el.btnAdvance, false);
    show(el.banner, false);
    showOverlayDelayed(el.overlayClear, CLEAR_DELAY_MS);
    updateHUD();
  }

  /** Boss exit button - available only once the required height is reached. */
  function advanceFromBoss() {
    if (S.mode !== 'playing' || !cfg.isBoss || !S.bossTargetMet) return;
    completeLevel('bossAdvance');
  }

  /* ================================================================== *
   * HUD
   * ================================================================== */

  function applyThemeToUI(t) {
    var root = doc.documentElement;
    root.style.setProperty('--sky-top', t.skyTop);
    root.style.setProperty('--sky-bottom', t.skyBottom);
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--text', t.textColor);
    root.style.setProperty('--panel', t.panelColor);
    root.style.setProperty('--panel-border', t.panelBorder);
    root.style.setProperty('--on-accent', L.luminance(t.accent) > 0.45 ? '#1B1405' : '#FFFFFF');
    doc.body.classList.toggle('boss', !!t.isBoss);
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.skyTop);
  }

  function updateHUD() {
    if (!cfg) return;
    txt(el.hudLevel, 'LEVEL ' + S.level);
    txt(el.hudWorld, 'World ' + cfg.world + ' · ' + theme.worldName);
    txt(el.hudMode, cfg.isBoss ? 'BOSS' : 'NORMAL');
    el.hudMode.className = 'mode ' + (cfg.isBoss ? 'boss' : 'normal');
    txt(el.hudScore, S.score);

    var goal = cfg.isBoss ? cfg.bossTarget : cfg.goal;
    var label = cfg.isBoss ? 'HEIGHT' : 'STACKS';
    txt(el.progLabel, label);
    txt(el.progValue, S.height + ' / ' + goal);
    var pct = Math.min(100, (S.height / goal) * 100);
    el.progFill.style.width = pct.toFixed(1) + '%';
    el.progFill.classList.toggle('met', cfg.isBoss && S.bossTargetMet);

    // the goal gauge already reads "HEIGHT 4 / 20", so a boss only adds its record
    show(el.bossRow, cfg.isBoss);
    if (cfg.isBoss) {
      txt(el.bossReq, cfg.bossTarget);
      txt(el.bossNow, S.height);
      txt(el.bossBest, progress.bossBest(S.level));
    }

    txt(el.streakValue, S.streak);
    var dots = el.streakDots.children;
    var filled = S.streak % L.RECOVERY_STREAK;
    if (S.streak > 0 && filled === 0) filled = L.RECOVERY_STREAK;
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < filled);

    // how much of the starting block is left, and the star tier that earns
    var frac = L.sizeFraction(S.sizeX, S.sizeZ, cfg.baseSize);
    var stars = L.starsForFraction(frac);
    txt(el.sizePct, Math.round(frac * 100) + '%');
    el.sizeFill.style.width = (frac * 100).toFixed(1) + '%';
    el.sizeFill.style.background = STAR_FILL[stars];
    var starEls = el.stars.children;
    for (var j = 0; j < starEls.length; j++) starEls[j].classList.toggle('on', j < stars);
    el.sizeGauge.setAttribute('data-stars', String(stars));
  }

  /* fill colour per star tier - the meter reads as a tier, not just a number */
  var STAR_FILL = {
    3: 'linear-gradient(90deg,#F0A81E,#FFD95E)',
    2: 'linear-gradient(90deg,#3E9BD6,#8FD4F5)',
    1: 'linear-gradient(90deg,#E07A2C,#F5B86B)',
    0: 'linear-gradient(90deg,#C4453A,#E8867C)'
  };

  var toastTimer = null;
  function flashToast(msg) {
    txt(el.toast, msg);
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1100);
  }

  /* ================================================================== *
   * Menu / level map
   * ================================================================== */

  function openMenu() {
    cancelPendingOverlay();
    S.mode = 'menu';
    S.moving = null;
    el.stage.style.transform = '';
    view.reset();
    var t = L.themeForLevel(Math.min(L.TOTAL_LEVELS, progress.highestUnlocked()));
    theme = t;
    cfg = L.levelConfig(t.level);
    view.setTheme(t);
    applyThemeToUI(t);
    buildMenuBlocks(t);
    show(el.hud, false);
    show(el.overlayClear, false);
    show(el.overlayFail, false);
    show(el.overlayLevels, false);
    show(el.btnAdvance, false);
    show(el.banner, false);
    show(el.overlayMenu, true);
    armUI();
    txt(el.menuProgress, 'Level ' + progress.highestUnlocked() + ' of ' + L.TOTAL_LEVELS +
        ' · ' + progress.totalStars() + ' of 300 stars');
    txt(el.btnPlay, progress.highestUnlocked() > 1 ? 'Continue · Level ' + progress.highestUnlocked() : 'Start Climbing');
  }

  function buildMenuBlocks(t) {
    // A tall idle tower, framed so it runs past the top and bottom of the menu
    // card and turns slowly behind it.
    var n = 16;
    for (var i = 0; i < n; i++) {
      var sz = 3.5 - Math.abs(i - n / 2) * 0.06;
      view.addBlock({
        x: Math.sin(i * 0.8) * 0.22, z: Math.cos(i * 0.8) * 0.22,
        y: (i - n / 2) * L.BLOCK_HEIGHT,
        sx: sz, sz: sz, color: L.adjust(t.palette[i % t.palette.length], 0, 1, 0.02)
      });
    }
    view.setFitBounds(3.1, 2.6);
    view.focusOn(0, 0, 0, true);
    view.setSpin(0.14);
  }

  /** Stars earned across a world band, for the map header. */
  function bandStars(world) {
    var n = 0;
    for (var i = 1; i <= 10; i++) n += progress.stars((world - 1) * 10 + i);
    return n;
  }

  function openLevels() {
    var grid = el.levelGrid;
    grid.innerHTML = '';
    var unlocked = progress.highestUnlocked();
    for (var w = 1; w <= 10; w++) {
      var band = doc.createElement('div');
      band.className = 'band';
      var wt = L.themeForLevel(w * 10);
      var head = doc.createElement('div');
      head.className = 'band-head';
      head.innerHTML = '<span class="swatch" style="background:' + wt.palette[0] +
        ';border-color:' + wt.palette[1] + '"></span>' +
        '<b>World ' + w + '</b><span class="bandname">' + wt.worldName + '</span>' +
        '<span class="bandbest">' + bandStars(w) + ' ★ · boss ' + (progress.bossBest(w * 10) || '—') + '</span>';
      band.appendChild(head);
      var row = doc.createElement('div');
      row.className = 'band-row';
      for (var i = 1; i <= 10; i++) {
        var lvl = (w - 1) * 10 + i;
        var b = doc.createElement('button');
        var boss = L.isBossLevel(lvl);
        var earned = progress.stars(lvl);
        b.className = 'mapcell' + (boss ? ' boss' : '') + (lvl > unlocked ? ' locked' : '');
        b.innerHTML = '<span class="n">' + lvl + '</span>' +
          '<span class="cellstars" data-n="' + earned + '"><i></i><i></i><i></i></span>';
        b.setAttribute('aria-label', 'Level ' + lvl + (boss ? ' boss' : ''));
        if (lvl > unlocked) b.disabled = true;
        else b.addEventListener('click', (function (n) {
          return function (ev) { ev.stopPropagation(); ev.currentTarget.blur(); startLevel(n); };
        })(lvl));
        row.appendChild(b);
      }
      band.appendChild(row);
      grid.appendChild(band);
    }
    show(el.overlayLevels, true);
    armUI();
  }

  /* ================================================================== *
   * Input
   * ================================================================== */

  function tap() {
    Sound.resume();
    if (S.mode === 'playing') drop();
  }

  function bindInput() {
    var stage = el.stage;
    if (global.PointerEvent) {
      stage.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        tap();
      }, { passive: false });
    } else {
      var touched = false;
      stage.addEventListener('touchstart', function (e) {
        touched = true; e.preventDefault(); tap();
      }, { passive: false });
      stage.addEventListener('mousedown', function (e) {
        if (touched) { touched = false; return; }
        e.preventDefault(); tap();
      });
    }

    doc.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key;
      if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        e.preventDefault();
        if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
        if (S.mode === 'playing') tap();
        else if (S.mode === 'menu' && !el.overlayLevels.classList.contains('hidden')) { /* ignore */ }
        else if (S.mode === 'menu') startLevel(progress.highestUnlocked());
        else if (S.mode === 'clear') nextLevel();
        else if (S.mode === 'fail') startLevel(S.level);
      } else if (k === 'Escape') {
        openMenu();
      }
    });

    // iOS: stop pinch-zoom and double-tap zoom from fighting the game
    doc.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    doc.addEventListener('dblclick', function (e) { e.preventDefault(); });
  }

  function nextLevel() {
    if (S.level >= L.TOTAL_LEVELS) { openMenu(); return; }
    startLevel(S.level + 1);
  }

  function bindButtons() {
    var stop = function (fn) {
      return function (e) {
        e.preventDefault(); e.stopPropagation();
        if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
        if (uiLocked()) return;          // ignore the tail of the tap that opened this
        Sound.resume();
        fn(e);
      };
    };
    el.btnPlay.addEventListener('click', stop(function () { startLevel(progress.highestUnlocked()); }));
    el.btnLevels.addEventListener('click', stop(openLevels));
    el.btnLevelsClose.addEventListener('click', stop(function () { show(el.overlayLevels, false); }));
    el.btnAdvance.addEventListener('click', stop(advanceFromBoss));
    el.btnNext.addEventListener('click', stop(nextLevel));
    el.btnRetry.addEventListener('click', stop(function () { startLevel(S.level); }));
    el.btnFailMenu.addEventListener('click', stop(openMenu));
    el.btnClearMenu.addEventListener('click', stop(openMenu));
    el.btnMenu.addEventListener('click', stop(openMenu));
    el.btnMute.addEventListener('click', stop(function () {
      var m = !Sound.isMuted();
      Sound.setMuted(m);
      progress.setMuted(m);
      renderMuteIcon(m);
    }));
  }

  function renderMuteIcon(muted) {
    var waves = doc.getElementById('ico-waves'), cross = doc.getElementById('ico-mute');
    if (waves) waves.style.display = muted ? 'none' : '';
    if (cross) cross.style.display = muted ? '' : 'none';
    if (el.btnMute) el.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  /* ================================================================== *
   * Main loop
   * ================================================================== */

  var last = 0;

  function frame(now) {
    global.requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    view.render();
  }

  function step(dt) {
    S.elapsed += dt;

    if (S.mode === 'playing' && S.moving && S.moving.active && !S.frozen) {
      var speed = L.speedAt(cfg, S.height);
      var mod = 1 + cfg.sway * Math.sin(S.elapsed * cfg.swayFreq * Math.PI * 2 + S.moving.phase);
      S.moving.pos += S.moving.dir * speed * mod * dt;
      if (S.moving.pos >= cfg.travel) { S.moving.pos = cfg.travel; S.moving.dir = -1; }
      if (S.moving.pos <= -cfg.travel) { S.moving.pos = -cfg.travel; S.moving.dir = 1; }
      var x = S.axis === 'x' ? S.moving.pos : S.topX;
      var z = S.axis === 'z' ? S.moving.pos : S.topZ;
      view.moveMoving(x, z, dt);
    } else if (view.movingHandle) {
      view.moveMoving(view.movingHandle.mesh.position.x, view.movingHandle.mesh.position.z, dt);
    }

    if (S.shake > 0) {
      S.shake = Math.max(0, S.shake - dt);
      el.stage.style.transform = 'translate3d(' + (Math.random() - 0.5) * S.shake * 14 + 'px,' +
        (Math.random() - 0.5) * S.shake * 10 + 'px,0)';
      if (S.shake === 0) el.stage.style.transform = '';
    }

    view.update(dt);
  }

  /* ================================================================== *
   * Boot
   * ================================================================== */

  function boot() {
    el = {
      stage: $('stage'), canvas: $('scene'), hud: $('hud'),
      hudLevel: $('hud-level'), hudWorld: $('hud-world'), hudMode: $('hud-mode'),
      hudScore: $('hud-score'),
      progLabel: $('prog-label'), progValue: $('prog-value'), progFill: $('prog-fill'),
      sizePct: $('size-pct'), sizeFill: $('size-fill'), stars: $('stars'), sizeGauge: $('size-gauge'),
      bossRow: $('boss-row'), bossReq: $('boss-req'), bossNow: $('boss-now'), bossBest: $('boss-best'),
      streakValue: $('streak-value'), streakDots: $('streak-dots'),
      banner: $('banner'), btnAdvance: $('btn-advance'), toast: $('toast'),
      worldCard: $('worldcard'), worldCardN: $('worldcard-n'), worldCardName: $('worldcard-name'),
      overlayMenu: $('overlay-menu'), overlayClear: $('overlay-clear'),
      overlayFail: $('overlay-fail'), overlayLevels: $('overlay-levels'),
      menuProgress: $('menu-progress'),
      btnPlay: $('btn-play'), btnLevels: $('btn-levels'), btnLevelsClose: $('btn-levels-close'),
      levelGrid: $('level-grid'),
      clearStars: $('clear-stars'), clearPct: $('clear-pct'),
      clearTitle: $('clear-title'), clearSub: $('clear-sub'), clearScore: $('clear-score'),
      clearStat1: $('clear-stat1'), clearStat2: $('clear-stat2'),
      btnNext: $('btn-next'), btnClearMenu: $('btn-clear-menu'),
      failTitle: $('fail-title'), failSub: $('fail-sub'), failScore: $('fail-score'),
      failBest: $('fail-best'), failBestLabel: $('fail-best-label'),
      btnRetry: $('btn-retry'), btnFailMenu: $('btn-fail-menu'),
      btnMenu: $('btn-menu'), btnMute: $('btn-mute')
    };

    var quality = (global.devicePixelRatio || 1) > 2.6 ? 'medium' : 'high';
    try {
      view = global.StackRender.create(el.canvas, { quality: quality });
    } catch (e) {
      var err = $('fatal');
      if (err) { err.classList.remove('hidden'); err.textContent = 'WebGL could not start: ' + e.message; }
      return;
    }

    Sound.setMuted(progress.muted());
    renderMuteIcon(progress.muted());

    bindInput();
    bindButtons();

    var resize = function () {
      setViewportUnit();
      view.resize();
    };
    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { setTimeout(resize, 220); });
    if (global.visualViewport) global.visualViewport.addEventListener('resize', resize);
    resize();

    openMenu();
    global.requestAnimationFrame(frame);

    /* --- debug hooks used by the automated QA suite ------------------ */
    global.GameDebug = {
      get state() {
        return {
          mode: S.mode, level: S.level, isBoss: cfg ? cfg.isBoss : false,
          goal: cfg ? (cfg.isBoss ? cfg.bossTarget : cfg.goal) : 0,
          height: S.height, streak: S.streak, score: S.score,
          sizeX: S.sizeX, sizeZ: S.sizeZ, baseSize: cfg ? cfg.baseSize : 0,
          axis: S.axis, bossTargetMet: S.bossTargetMet, recoveries: S.recoveries,
          topX: S.topX, topZ: S.topZ, topY: S.topY,
          movingPos: S.moving ? S.moving.pos : null,
          movingActive: !!(S.moving && S.moving.active),
          perfectTol: cfg ? cfg.perfectTol : 0,
          hover: cfg ? cfg.hover : 0, dropGap: cfg ? cfg.dropGap : 0,
          sizePercent: cfg ? L.sizePercent(S.sizeX, S.sizeZ, cfg.baseSize) : 0,
          stars: cfg ? L.starsFor(S.sizeX, S.sizeZ, cfg.baseSize) : 0,
          savedStars: progress.stars(S.level), totalStars: progress.totalStars(),
          bossBest: cfg && cfg.isBoss ? progress.bossBest(S.level) : 0,
          highestUnlocked: progress.highestUnlocked(),
          blockCount: view.blockCount
        };
      },
      progress: progress,
      startLevel: startLevel,
      openMenu: openMenu,
      openLevels: openLevels,
      tap: tap,
      advance: advanceFromBoss,
      next: nextLevel,
      /** place the sliding block exactly over the block below */
      alignPerfect: function () {
        if (!S.moving) return;
        S.moving.pos = S.axis === 'x' ? S.topX : S.topZ;
        syncMovingMesh();
      },
      /** offset the sliding block from the block below by `d` world units */
      setOffset: function (d) {
        if (!S.moving) return;
        S.moving.pos = (S.axis === 'x' ? S.topX : S.topZ) + d;
        syncMovingMesh();
      },
      /** guaranteed complete miss */
      missNow: function () {
        if (!S.moving) return;
        var size = S.axis === 'x' ? S.sizeX : S.sizeZ;
        S.moving.pos = (S.axis === 'x' ? S.topX : S.topZ) + size + 0.5;
        syncMovingMesh();
      },
      step: step,
      /** test hook: hold the sliding block still so input tests are exact */
      freeze: function (on) { S.frozen = !!on; },
      uiLocked: uiLocked,
      constants: { UI_ARM_MS: UI_ARM_MS, FAIL_DELAY_MS: FAIL_DELAY_MS, CLEAR_DELAY_MS: CLEAR_DELAY_MS },
      movingBounds: function () {
        var h = view.movingHandle;
        if (!h) return null;
        h.mesh.geometry.computeBoundingBox();
        var bb = h.mesh.geometry.boundingBox;
        return {
          w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z,
          triangles: h.mesh.geometry.attributes.position.count / 3,
          y: h.mesh.position.y, x: h.mesh.position.x, z: h.mesh.position.z,
          hasShadow: !!h.shadow, castsShadow: h.mesh.castShadow, hasGlow: !!h.glow,
          anchorSx: h.anchorSx, anchorSz: h.anchorSz, anchorY: h.anchorY,
          glowOpacity: h.glow ? h.glow.material.opacity : 0
        };
      },
      /** Colours sampled from the three visible faces of the sliding block. */
      faceSamples: function () {
        var h = view.movingHandle;
        if (!h) return null;
        var p = h.mesh.position;
        var hy = L.BLOCK_HEIGHT / 2;
        // the camera sits on the +x/+z diagonal, so those two side faces are the
        // ones facing the player, along with the top
        return {
          top: view.sampleWorldPoint(p.x, p.y + hy + 0.001, p.z),
          front: view.sampleWorldPoint(p.x, p.y, p.z + h.sz / 2 + 0.001),
          side: view.sampleWorldPoint(p.x + h.sx / 2 + 0.001, p.y, p.z),
          silhouette: view.movingSilhouette()
        };
      },
      landedTopY: function () { return view.landedTopY(); },
      view: function () { return view; },
      logic: L
    };

    function syncMovingMesh() {
      var x = S.axis === 'x' ? S.moving.pos : S.topX;
      var z = S.axis === 'z' ? S.moving.pos : S.topZ;
      view.layoutMoving(x, z);
    }
  }

  /** iOS Safari 100vh workaround: publish a real pixel viewport height. */
  function setViewportUnit() {
    var h = (global.visualViewport && global.visualViewport.height) || global.innerHeight;
    doc.documentElement.style.setProperty('--vh', h + 'px');
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof self !== 'undefined' ? self : this);
