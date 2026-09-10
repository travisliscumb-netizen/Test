/*
 * Block Stack 3D - pure game logic.
 *
 * This file intentionally has ZERO dependencies on the DOM, WebGL or three.js so
 * that every rule in the game (level curves, boss targets, slicing, perfect
 * recovery, persistence, colour themes) can be unit tested in Node.
 *
 * Loaded as a classic script in the browser (window.StackLogic) and via
 * require() in tests.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var TOTAL_LEVELS   = 100;
  var LEVELS_PER_WORLD = 10;
  var BASE_SIZE      = 4.0;   // footprint of a full-size block, world units
  var BLOCK_HEIGHT   = 1.5;   // thickness of every block, world units
  var MIN_SIZE       = 0.34;  // a slice thinner than this topples the tower
  var EDGE_RADIUS    = 0.24;  // rounded-edge radius used by the renderer

  /* ------------------------------------------------------------------ *
   * Small math helpers
   * ------------------------------------------------------------------ */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  /* ------------------------------------------------------------------ *
   * Colour helpers (hex <-> hsl) - used by the theme generator
   * ------------------------------------------------------------------ */

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    var f = function (v) {
      var s = clamp(Math.round(v), 0, 255).toString(16);
      return s.length === 1 ? '0' + s : s;
    };
    return '#' + f(r) + f(g) + f(b);
  }

  function hexToHsl(hex) {
    var c = hexToRgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = ((b - r) / d + 2);
      else                h = ((r - g) / d + 4);
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if      (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else             { r = c; b = x; }
    var m = l - c / 2;
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  function adjust(hex, dHue, sMul, dLight) {
    var c = hexToHsl(hex);
    return hslToHex(c.h + (dHue || 0), c.s * (sMul == null ? 1 : sMul), c.l + (dLight || 0));
  }

  function mixHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(lerp(ca.r, cb.r, t), lerp(ca.g, cb.g, t), lerp(ca.b, cb.b, t));
  }

  /** Relative luminance (WCAG) - used to choose readable HUD text colour. */
  function luminance(hex) {
    var c = hexToRgb(hex);
    var f = function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  /* ------------------------------------------------------------------ *
   * Worlds - 10 bands of 10 levels, each with its own identity.
   *
   * Deliberate art direction: bright, rich, toy-like (think painted wooden
   * blocks). No pastels (saturation stays high), no neon (saturation never
   * pinned at 100% with high lightness), no cyberpunk (no magenta/cyan-on-black
   * schemes). Skies get progressively deeper from world 1 to world 10 so the
   * player feels they are climbing away from the ground and into the night.
   * ------------------------------------------------------------------ */

  var WORLDS = [
    {
      name: 'Meadow Rise', tagline: 'Where the climb begins',
      skyTop: '#3CA5DE', skyBottom: '#9FDCF2', ground: '#4F9E3F',
      palette: ['#E0463C', '#F0942A', '#EFC429', '#4FAE45', '#2C7CC4'],
      decor: 'clouds'
    },
    {
      name: 'Berry Orchard', tagline: 'Sweet and sun-warmed',
      skyTop: '#3FA3D6', skyBottom: '#EFD68C', ground: '#3F8F46',
      palette: ['#CE3247', '#E86C2B', '#E8B62A', '#57A83E', '#8B4AA8'],
      decor: 'clouds'
    },
    {
      name: 'Copper Canyon', tagline: 'Dust, stone and sun',
      skyTop: '#C4682E', skyBottom: '#EFD199', ground: '#A0562E',
      palette: ['#BE4029', '#DC7229', '#E0A934', '#2E9E96', '#7A462A'],
      decor: 'peaks'
    },
    {
      name: 'Harbour Deep', tagline: 'Salt air and steel',
      skyTop: '#2478BE', skyBottom: '#79C8E2', ground: '#1D6288',
      palette: ['#1C5C86', '#2A93C9', '#31B4AB', '#E8C33C', '#DE4E3B'],
      decor: 'clouds'
    },
    {
      name: 'Amber Ridge', tagline: 'The long golden hour',
      skyTop: '#D07B32', skyBottom: '#E9BA6B', ground: '#7A4224',
      palette: ['#9E3320', '#CE6127', '#DC9E2A', '#35703C', '#6B3A22'],
      decor: 'peaks'
    },
    {
      name: 'Pine Pass', tagline: 'Cold wind through the trees',
      skyTop: '#255F92', skyBottom: '#79ADCC', ground: '#1F5238',
      palette: ['#1E5A45', '#2C8C5F', '#88AE45', '#E0C05A', '#BB4130'],
      decor: 'peaks'
    },
    {
      name: 'Glacier Steps', tagline: 'Blue ice, thin air',
      skyTop: '#22568A', skyBottom: '#96CDE6', ground: '#2C6F94',
      palette: ['#6FC6E4', '#3E9BCE', '#2B6FA8', '#194266', '#D8583A'],
      decor: 'peaks'
    },
    {
      name: 'Sunset Deck', tagline: 'Above the weather',
      skyTop: '#1B3266', skyBottom: '#D2653A', ground: '#2A3E6E',
      palette: ['#F0693C', '#F2A32E', '#F0D34C', '#C33C6C', '#3159A6'],
      decor: 'clouds'
    },
    {
      name: 'Aurora Heights', tagline: 'The sky starts to glow',
      skyTop: '#101E48', skyBottom: '#2C6796', ground: '#16264F',
      palette: ['#2A9E85', '#3AA8C6', '#E4BC44', '#D44E39', '#2A3C6C'],
      decor: 'stars'
    },
    {
      name: 'Starlit Summit', tagline: 'The top of the world',
      skyTop: '#080F2C', skyBottom: '#1F2F62', ground: '#101A3C',
      palette: ['#E8C246', '#DC5138', '#F0DFA8', '#38A0C0', '#A64236'],
      decor: 'stars'
    }
  ];

  function worldOf(level)      { return clamp(Math.ceil(level / LEVELS_PER_WORLD), 1, WORLDS.length); }
  function levelInWorld(level) { return ((level - 1) % LEVELS_PER_WORLD) + 1; }
  function isBossLevel(level)  { return level % LEVELS_PER_WORLD === 0; }

  /** Boss required height: level 10 -> 10, level 20 -> 20 ... level 100 -> 100. */
  function bossTarget(level) { return isBossLevel(level) ? level : 0; }

  /**
   * Per-level theme. Every level inside a world rotates the palette and nudges
   * the sky, so no two consecutive levels look the same, while the world band
   * keeps its own recognisable identity.
   */
  function themeForLevel(level) {
    level = clamp(Math.round(level) || 1, 1, TOTAL_LEVELS);
    var w = worldOf(level);
    var world = WORLDS[w - 1];
    var idx = levelInWorld(level);          // 1..10
    var boss = isBossLevel(level);
    var step = idx - 1;                     // 0..9

    // Sky: rotate hue a touch and tighten/lift lightness per level in the band.
    var hueShift = (step - 4.5) * 3.2;
    var lightShift = (step % 3 === 0 ? 0.028 : (step % 3 === 1 ? -0.022 : 0.004));
    var skyTop    = adjust(world.skyTop,    hueShift,        1.0, lightShift * (boss ? -1.4 : 1));
    var skyBottom = adjust(world.skyBottom, hueShift * 0.65, 1.0, lightShift * 0.7 * (boss ? -1.2 : 1));
    if (boss) {
      // Boss levels: same world identity, dialled up - deeper sky, gold accent.
      skyTop    = adjust(skyTop, -4, 1.08, -0.08);
      skyBottom = adjust(skyBottom, -4, 1.05, -0.05);
    }

    // Palette: rotate the world palette so the tower colours differ each level.
    var pal = [];
    for (var i = 0; i < world.palette.length; i++) {
      var src = world.palette[(i + step) % world.palette.length];
      // small per-level hue/lightness signature keeps rotations from repeating
      pal.push(adjust(src, (step % 2 ? 1 : -1) * (step * 0.9), 1, (step % 4 === 2 ? 0.02 : 0)));
    }

    var accent = boss ? '#F2C339' : pal[2];
    // Pick the HUD text colour by measured WCAG contrast against the sky rather
    // than a fixed luminance cut - the crossover guarantees at least ~4:1.
    var mid = mixHex(skyTop, skyBottom, 0.5);
    var midL = luminance(mid);
    var DARK_INK = '#16202B';
    var darkRatio = (midL + 0.05) / (luminance(DARK_INK) + 0.05);
    var lightRatio = (luminance('#FFFFFF') + 0.05) / (midL + 0.05);
    var darkText = darkRatio >= lightRatio;

    return {
      level: level,
      world: w,
      worldName: world.name,
      tagline: world.tagline,
      isBoss: boss,
      skyTop: skyTop,
      skyBottom: skyBottom,
      fog: skyBottom,
      ground: adjust(world.ground, hueShift * 0.5, 1, 0),
      palette: pal,
      accent: accent,
      decor: boss && world.decor === 'clouds' ? 'clouds' : world.decor,
      decorCount: 6 + (w * 2) + (boss ? 6 : 0),
      textColor: darkText ? DARK_INK : '#FFFFFF',
      panelColor: darkText ? 'rgba(255,255,255,0.72)' : 'rgba(12,20,34,0.52)',
      panelBorder: darkText ? 'rgba(18,28,40,0.14)' : 'rgba(255,255,255,0.22)',
      lightKey: mixHex('#FFFFFF', accent, 0.10),
      lightRim: mixHex('#FFFFFF', skyTop, 0.55),
      shadowStrength: darkText ? 0.30 : 0.42
    };
  }

  /* ------------------------------------------------------------------ *
   * Level configuration
   *
   * Everything is a smooth, monotonic function of the level number, so
   * difficulty never spikes: no random per-level modifiers anywhere.
   * ------------------------------------------------------------------ */

  function levelConfig(level) {
    level = clamp(Math.round(level) || 1, 1, TOTAL_LEVELS);
    var t = (level - 1) / (TOTAL_LEVELS - 1);       // 0 .. 1
    var boss = isBossLevel(level);

    // Starting footprint shrinks with progression (1.00 -> 0.58 of base).
    var sizeScale = 1 - 0.42 * Math.pow(t, 0.9);
    // Bosses are long survival climbs, so they start a little more generous.
    if (boss) sizeScale = Math.min(1, sizeScale * 1.10);
    var baseSize = round3(BASE_SIZE * sizeScale);

    // Slide speed: 2.5 -> 7.6 units/sec. Bosses run slower at the start but
    // ramp up as the tower climbs (see speedAt).
    var speed = 2.5 + 5.1 * Math.pow(t, 1.05);
    if (boss) speed *= 0.80;

    // Perfect-drop tolerance is defined as a TIME window, not a distance.
    //
    // Defining it in world units would make late levels quadratically harder
    // (the block moves faster AND the target shrinks), which lands well past
    // human reaction limits and feels broken rather than hard. As a time window
    // the demand is honest: 90ms at level 1 down to 30ms at level 100, on top of
    // faster blocks, smaller starts and stronger movement variation.
    // The exact curve below is tuned against test/balance.mjs, which simulates
    // thousands of runs with modelled human timing error.
    var perfectWindow = lerp(0.095, 0.018, Math.pow(t, 1.45));   // seconds
    if (boss) perfectWindow *= 1.28;                    // boss runs are 10-100 drops long
    var perfectTol = speed * perfectWindow;

    // Movement variation: the slide velocity is modulated by a sine so late
    // levels cannot be beaten with pure metronome timing.
    var sway = clamp((t - 0.10) / 0.90, 0, 1) * 0.36;
    var swayFreq = 0.85 + 1.5 * t;

    return {
      level: level,
      world: worldOf(level),
      levelInWorld: levelInWorld(level),
      isBoss: boss,
      // Normal levels: fixed number of successful stacks to clear.
      goal: boss ? bossTarget(level) : 5 + Math.floor((level - 1) / 7),
      bossTarget: bossTarget(level),
      baseSize: baseSize,        // also the hard cap for perfect-streak recovery
      startSize: baseSize,
      blockHeight: BLOCK_HEIGHT,
      speed: round3(speed),
      speedRamp: boss ? 0.0035 : 0.0,   // per successful stack, bosses only
      speedRampMax: 0.25,
      perfectTol: round3(perfectTol),
      perfectWindow: round3(perfectWindow),
      sway: round3(sway),
      swayFreq: round3(swayFreq),
      travel: round3(BASE_SIZE * 0.80 + baseSize * 0.40),
      minSize: MIN_SIZE
    };
  }

  /** Slide speed at a given stack height (bosses accelerate as you climb). */
  function speedAt(cfg, height) {
    var ramp = Math.min(cfg.speedRampMax, (cfg.speedRamp || 0) * Math.max(0, height));
    return cfg.speed * (1 + ramp);
  }

  /** Total successful stacks needed to clear the level. */
  function levelGoal(level) {
    var cfg = levelConfig(level);
    return cfg.isBoss ? cfg.bossTarget : cfg.goal;
  }

  /* ------------------------------------------------------------------ *
   * Drop resolution - the core rule of the game
   * ------------------------------------------------------------------ */

  /**
   * Resolve a drop along one axis.
   *
   * @param {object} o
   *   movingPos, movingSize - the sliding block on the active axis
   *   anchorPos, anchorSize - the block directly underneath
   *   perfectTol            - absolute tolerance for a perfect drop
   *   minSize               - below this the remainder topples (optional)
   * @returns {object}
   *   missed  - true when there is no usable overlap left
   *   reason  - 'miss' | 'sliver' when missed
   *   perfect - true when the drop was inside tolerance
   *   size    - new size on this axis
   *   pos     - new centre on this axis
   *   slices  - [{pos,size}] pieces cut off (0, 1 or 2 of them)
   *   offset  - signed distance from the anchor centre
   */
  function resolveDrop(o) {
    var minSize = o.minSize == null ? MIN_SIZE : o.minSize;
    var mLo = o.movingPos - o.movingSize / 2, mHi = o.movingPos + o.movingSize / 2;
    var aLo = o.anchorPos - o.anchorSize / 2, aHi = o.anchorPos + o.anchorSize / 2;
    var lo = Math.max(mLo, aLo), hi = Math.min(mHi, aHi);
    var overlap = hi - lo;
    var offset = o.movingPos - o.anchorPos;

    if (overlap <= 0) {
      return { missed: true, reason: 'miss', perfect: false, size: 0, pos: o.movingPos,
               slices: [{ pos: o.movingPos, size: o.movingSize }], overlap: 0, offset: offset };
    }

    var perfect = Math.abs(offset) <= o.perfectTol;

    if (perfect) {
      // Perfect drop: keep the full incoming size, snapped to the anchor.
      return { missed: false, reason: null, perfect: true,
               size: o.movingSize, pos: o.anchorPos, slices: [],
               overlap: overlap, offset: offset };
    }

    if (overlap < minSize) {
      return { missed: true, reason: 'sliver', perfect: false, size: overlap,
               pos: (lo + hi) / 2,
               slices: [{ pos: o.movingPos, size: o.movingSize }],
               overlap: overlap, offset: offset };
    }

    // Everything of the moving block outside the anchor is sliced away. When the
    // block is wider than the anchor (possible after a recovery bonus) there can
    // be a slice on each side.
    var slices = [];
    if (mLo < aLo - 1e-6) slices.push({ pos: (mLo + Math.min(aLo, mHi)) / 2, size: Math.min(aLo, mHi) - mLo });
    if (mHi > aHi + 1e-6) slices.push({ pos: (Math.max(aHi, mLo) + mHi) / 2, size: mHi - Math.max(aHi, mLo) });

    return { missed: false, reason: null, perfect: false,
             size: overlap, pos: (lo + hi) / 2, slices: slices,
             overlap: overlap, offset: offset };
  }

  /* ------------------------------------------------------------------ *
   * Perfect-streak recovery
   * ------------------------------------------------------------------ */

  var RECOVERY_STREAK = 3;          // perfect drops needed to trigger a refund
  var RECOVERY_LOST_SHARE = 0.26;   // share of the size already lost
  var RECOVERY_FLAT_SHARE = 0.04;   // small flat bonus, share of level base size

  /** How much size a single axis gets back. Never exceeds the level base size. */
  function recoveryGain(size, baseSize) {
    var lost = baseSize - size;
    if (lost <= 1e-6) return 0;
    var gain = RECOVERY_LOST_SHARE * lost + RECOVERY_FLAT_SHARE * baseSize;
    return Math.min(gain, lost);    // hard cap: can never exceed baseSize
  }

  /**
   * Apply the 3-perfect recovery to both axes.
   * @returns {{x:number,z:number,gainX:number,gainZ:number,gained:boolean}}
   */
  function applyRecovery(sizeX, sizeZ, baseSize) {
    var gx = recoveryGain(sizeX, baseSize);
    var gz = recoveryGain(sizeZ, baseSize);
    var nx = Math.min(baseSize, sizeX + gx);
    var nz = Math.min(baseSize, sizeZ + gz);
    return { x: nx, z: nz, gainX: nx - sizeX, gainZ: nz - sizeZ,
             gained: (nx - sizeX) + (nz - sizeZ) > 1e-6 };
  }

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */

  function dropScore(opts) {
    var base = 10 + Math.floor(opts.level / 10) * 2;
    if (!opts.perfect) return base;
    return base + 25 + Math.min(10, opts.streak) * 10;
  }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */

  var SAVE_KEY = 'blockstack3d.save.v1';

  function memoryStorage() {
    var map = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; }
    };
  }

  function defaultSave() {
    return {
      version: 1,
      highestUnlocked: 1,
      bossBest: {},      // { '10': 14, '20': 23, ... }
      levelBestScore: {},
      bestScore: 0,
      totalPerfects: 0,
      totalDrops: 0,
      totalRecoveries: 0,
      muted: false
    };
  }

  function sanitizeSave(raw) {
    var out = defaultSave();
    if (!raw || typeof raw !== 'object') return out;
    var num = function (v, lo, hi, dflt) {
      v = Number(v);
      return isFinite(v) ? clamp(Math.floor(v), lo, hi) : dflt;
    };
    out.highestUnlocked = num(raw.highestUnlocked, 1, TOTAL_LEVELS, 1);
    out.bestScore       = num(raw.bestScore, 0, 1e12, 0);
    out.totalPerfects   = num(raw.totalPerfects, 0, 1e12, 0);
    out.totalDrops      = num(raw.totalDrops, 0, 1e12, 0);
    out.totalRecoveries = num(raw.totalRecoveries, 0, 1e12, 0);
    out.muted           = !!raw.muted;
    if (raw.bossBest && typeof raw.bossBest === 'object') {
      for (var k in raw.bossBest) {
        var lvl = num(k, 10, TOTAL_LEVELS, 0);
        if (!lvl || !isBossLevel(lvl)) continue;
        var h = num(raw.bossBest[k], 0, 100000, 0);
        if (h > 0) out.bossBest[String(lvl)] = h;
      }
    }
    if (raw.levelBestScore && typeof raw.levelBestScore === 'object') {
      for (var k2 in raw.levelBestScore) {
        var lvl2 = num(k2, 1, TOTAL_LEVELS, 0);
        if (!lvl2) continue;
        var s = num(raw.levelBestScore[k2], 0, 1e12, 0);
        if (s > 0) out.levelBestScore[String(lvl2)] = s;
      }
    }
    return out;
  }

  /**
   * Progress store. Pass a storage-like object for tests; defaults to
   * localStorage when available and silently degrades to memory when it is not
   * (private browsing, disabled storage, file:// restrictions).
   */
  function createProgress(storage) {
    if (!storage) {
      try {
        var probe = '__bs3d_probe__';
        global.localStorage.setItem(probe, '1');
        global.localStorage.removeItem(probe);
        storage = global.localStorage;
      } catch (e) {
        storage = memoryStorage();
      }
    }

    var data = defaultSave();

    function load() {
      var raw = null;
      try { raw = storage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (raw) {
        try { data = sanitizeSave(JSON.parse(raw)); }
        catch (e) { data = defaultSave(); }
      } else {
        data = defaultSave();
      }
      return data;
    }

    function save() {
      try { storage.setItem(SAVE_KEY, JSON.stringify(data)); return true; }
      catch (e) { return false; }
    }

    load();

    return {
      key: SAVE_KEY,
      get data() { return data; },
      load: load,
      save: save,
      reset: function () { data = defaultSave(); save(); return data; },

      highestUnlocked: function () { return data.highestUnlocked; },

      isUnlocked: function (level) { return level >= 1 && level <= data.highestUnlocked; },

      unlock: function (level) {
        level = clamp(Math.round(level) || 1, 1, TOTAL_LEVELS);
        if (level > data.highestUnlocked) { data.highestUnlocked = level; save(); return true; }
        return false;
      },

      bossBest: function (level) { return data.bossBest[String(level)] || 0; },

      /** Records a boss height. Returns true when it is a new personal best. */
      recordBossHeight: function (level, height) {
        if (!isBossLevel(level)) return false;
        height = Math.max(0, Math.floor(height) || 0);
        var key = String(level);
        if (height > (data.bossBest[key] || 0)) { data.bossBest[key] = height; save(); return true; }
        return false;
      },

      recordScore: function (level, score) {
        score = Math.max(0, Math.floor(score) || 0);
        var key = String(level);
        var isBest = score > (data.levelBestScore[key] || 0);
        if (isBest) data.levelBestScore[key] = score;
        if (score > data.bestScore) data.bestScore = score;
        if (isBest) save();
        return isBest;
      },

      levelBestScore: function (level) { return data.levelBestScore[String(level)] || 0; },

      addStats: function (drops, perfects, recoveries) {
        data.totalDrops += drops || 0;
        data.totalPerfects += perfects || 0;
        data.totalRecoveries += recoveries || 0;
        save();
      },

      setMuted: function (m) { data.muted = !!m; save(); },
      muted: function () { return data.muted; }
    };
  }

  /* ------------------------------------------------------------------ *
   * Export
   * ------------------------------------------------------------------ */

  var API = {
    TOTAL_LEVELS: TOTAL_LEVELS,
    LEVELS_PER_WORLD: LEVELS_PER_WORLD,
    BASE_SIZE: BASE_SIZE,
    BLOCK_HEIGHT: BLOCK_HEIGHT,
    MIN_SIZE: MIN_SIZE,
    EDGE_RADIUS: EDGE_RADIUS,
    RECOVERY_STREAK: RECOVERY_STREAK,
    SAVE_KEY: SAVE_KEY,
    WORLDS: WORLDS,

    clamp: clamp, lerp: lerp,
    hexToHsl: hexToHsl, hslToHex: hslToHex, hexToRgb: hexToRgb, rgbToHex: rgbToHex,
    adjust: adjust, mixHex: mixHex, luminance: luminance,

    worldOf: worldOf, levelInWorld: levelInWorld, isBossLevel: isBossLevel,
    bossTarget: bossTarget, themeForLevel: themeForLevel,
    levelConfig: levelConfig, levelGoal: levelGoal, speedAt: speedAt,
    resolveDrop: resolveDrop,
    recoveryGain: recoveryGain, applyRecovery: applyRecovery,
    dropScore: dropScore,
    createProgress: createProgress, sanitizeSave: sanitizeSave, defaultSave: defaultSave,
    memoryStorage: memoryStorage
  };

  global.StackLogic = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
