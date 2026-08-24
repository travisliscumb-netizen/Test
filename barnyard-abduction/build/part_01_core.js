/* ============================================================================
   BARNYARD ABDUCTION
   Single evolving file (D-001) · Three.js r128 (D-003) · iPhone Safari first (D-004)

   SECTION 01 — CORE: tuning data, cheat modifiers, save, audio
   ----------------------------------------------------------------------------
   Per Technical Architecture Manual §6, every value likely to need balancing
   lives in TUNE. Nothing gameplay-tunable is buried in the systems below.
   ========================================================================== */
'use strict';

var BA = {};                 // one namespace; sections attach to it
BA.version = '1.0.0';

/* ---------------------------------------------------------------- TUNING -- */
var TUNE = {
  world: {
    size: 425,               // playable footprint, STEP2_WORLD_SPEC §1
    half: 212.5,
    fenceInset: 6,           // UFO stops this far inside the pickets
    scoutMargin: 1.05        // full fence + 5% border (D-012)
  },
  ufo: {
    accel: 62,               // units/s^2 toward stick target
    drag: 1.9,               // velocity damping -> momentum, not instant stop
    maxSpeed: 34,
    boostMult: 1.85,
    boostMax: 2.6,           // seconds of boost
    boostRegen: 0.42,        // per second
    boostDrain: 1.0,
    climbSpeed: 15,
    minAlt: 4,               // STEP2_WORLD_SPEC §1
    maxAlt: 35,
    radius: 5.2,
    bank: 0.34,              // radians of tilt at full speed
    bobAmp: 0.35,
    bobRate: 1.7,
    spin: 0.5
  },
  cam: {
    dist: 30, height: 17, lookAhead: 6,
    follow: 3.4,             // lerp rate
    scoutLerp: 2.6,
    fov: 58
  },
  beam: {
    radius: 9.5,             // ground radius of the cone
    reach: 46,               // max vertical reach
    coneHalfAngle: 0.42,
    lockRange: 34,           // auto-lock search radius (D-014)
    liftSpeed: 13,           // units/s once fully captured
    grabTime: 1.0            // base seconds, scaled per species resistance
  },
  farmer: {
    walk: 5.2, run: 9.4,
    sightRange: 74, sightCone: 0.95,
    suspicionRise: 1.35, suspicionFall: 0.5,
    alertAt: 1.0, chaseAt: 2.0, maxSuspicion: 3.0,
    fireInterval: 2.15, fireRange: 60,
    projSpeed: 30, projDamage: 12,
    abductTime: 3.0, returnDelay: 7.0
  },
  ufoHealth: { maxShield: 100, regenDelay: 6, regenRate: 5.5, iFrames: 0.7 },
  combo: { window: 4.2, tiers: [2, 3, 5, 8, 12, 20] },
  fx: { grassCount: 5200, dustRate: 26, maxParticles: 460 }
};

/* --------------------------------------------------------------- SPECIES -- */
/* Roster + personality from the original handoff §9/§10, spawn zones from
   STEP2_WORLD_SPEC §7. `resist` scales beam grab time — a chicken pops
   straight up, a cow takes real commitment. */
var SPECIES = {
  cow:     { name:'Cow',     points:60, resist:2.4, speed:2.2, turn:0.7, scale:1.00,
             flock:0.15, skittish:0.30, burst:0.0,  zones:['pasture','field'],    count:8,
             body:0xf3ede2, spot:0x40342a },
  horse:   { name:'Horse',   points:80, resist:2.2, speed:5.6, turn:1.7, scale:1.05,
             flock:0.25, skittish:0.95, burst:0.5,  zones:['pasture','fieldEdge'], count:5,
             body:0x8a5a34, spot:0x3a2418 },
  sheep:   { name:'Sheep',   points:25, resist:1.3, speed:3.1, turn:1.2, scale:0.70,
             flock:0.95, skittish:0.60, burst:0.2,  zones:['pasture'],            count:11,
             body:0xf7f4ee, spot:0x33291f },
  goat:    { name:'Goat',    points:30, resist:1.2, speed:3.8, turn:2.1, scale:0.66,
             flock:0.20, skittish:0.55, burst:0.7,  zones:['grove','pondside','margin'], count:6,
             body:0xd8cdb8, spot:0x5c4a35 },
  pig:     { name:'Pig',     points:35, resist:1.5, speed:2.8, turn:1.1, scale:0.66,
             flock:0.35, skittish:0.45, burst:0.8,  zones:['barnyard','pondside'], count:7,
             body:0xf2b8b8, spot:0xd08a8a },
  chicken: { name:'Chicken', points:10, resist:0.6, speed:5.0, turn:3.2, scale:0.34,
             flock:0.40, skittish:1.00, burst:1.0,  zones:['anywhere'],           count:15,
             body:0xfaf6ee, spot:0xd94f34 }
};
var SPECIES_KEYS = Object.keys(SPECIES);

/* ---------------------------------------------------------------- CHEATS -- */
/* Constitution Rule 9 / §28: cheats are first-class centralized modifiers.
   Systems READ from CHEATS.mod — no cheat ever reaches into gameplay code. */
var CHEAT_DEFS = [
  { id:'god',        name:'God Mode',            desc:'UFO cannot be destroyed. Shield stays visible and still sparks when hit.' },
  { id:'lives',      name:'Unlimited Lives',     desc:'You still take hits, you just never run out of tries.' },
  { id:'megabeam',   name:'Mega Beam',           desc:'Enormously wider tractor beam.' },
  { id:'infbeam',    name:'Enhanced Beam',       desc:'Beam grabs everything almost instantly, whatever it weighs.' },
  { id:'speed',      name:'Super Speed UFO',     desc:'Much faster flight. Still steerable — barely.' },
  { id:'slowmo',     name:'Slow Motion',         desc:'The world slows down. You do not.' },
  { id:'tiny',       name:'Tiny UFO',            desc:'Shrinks the saucer. Beam and collision still work.', excl:'size' },
  { id:'giant',      name:'Giant UFO',           desc:'Comically enormous saucer.', excl:'size' },
  { id:'x2',         name:'Double Points',       desc:'2× score.', excl:'score' },
  { id:'x10',        name:'Ten Times Points',    desc:'10× score.', excl:'score' },
  { id:'stampede',   name:'Barnyard Stampede',   desc:'Every animal is wired and sprinting.' },
  { id:'herds',      name:'Giant Herds',         desc:'Roughly triple the livestock.', excl:'pop' },
  { id:'x10animals', name:'10× Animals',         desc:'Ten times the animals. Genuinely a stress test.', excl:'pop' },
  { id:'farmers',    name:'Farmer Army',         desc:'More farmers. Ten of them is pure chaos.', step:[1,2,5,10] },
  { id:'peaceful',   name:'Peaceful Farmer',     desc:'Farmers wander around but never attack. Great for little kids.' },
  { id:'rainbow',    name:'Rainbow Tractor Beam',desc:'The beam cycles through every colour.' },
  { id:'bighead',    name:'Big Head Mode',       desc:'Enormous heads on every animal and farmer.' },
  { id:'moon',       name:'Moon Gravity',        desc:'Everything floats and bounces.' },
  { id:'magnet',     name:'UFO Magnet',          desc:'Nearby animals drift helplessly toward you.' },
  { id:'weather',    name:'Weather Control',     desc:'Pick the sky.', opts:['Clear','Cloudy','Rain','Windy','Sunset'] },
  { id:'party',      name:'Party Mode',          desc:'The whole farm becomes a disco.' },
  { id:'chickens',   name:'Chicken Invasion',    desc:'Almost everything is now a chicken.', excl:'roster' },
  { id:'cows',       name:'Cowpocalypse',        desc:'Almost everything is now a cow.', excl:'roster' },
  { id:'horses',     name:'Horse Haven',         desc:'Almost everything is now a horse.', excl:'roster' },
  { id:'bigmals',    name:'Giant Animals',       desc:'Enormous livestock. Beam and collision still work.' }
];

var CHEATS = {
  on: {},            // id -> true | number | string
  mod: {},           // derived modifier table read by every system
  isOn: function (id) { return !!this.on[id]; },
  set: function (id, v) {
    if (v === false || v === undefined || v === 0) delete this.on[id];
    else this.on[id] = v;
    var d = CHEAT_DEFS.filter(function (x) { return x.id === id; })[0];
    if (d && d.excl && this.on[id]) {                       // mutual exclusion
      var self = this;
      CHEAT_DEFS.forEach(function (o) {
        if (o.id !== id && o.excl === d.excl) delete self.on[o.id];
      });
    }
    this.rebuild(); SAVE.queue();
  },
  clear: function () { this.on = {}; this.rebuild(); SAVE.queue(); },
  any: function () { return Object.keys(this.on).length > 0; },

  /* Single place where cheat state becomes numbers. Everything downstream
     reads CHEATS.mod.* and never checks a cheat id directly. */
  rebuild: function () {
    var o = this.on;
    var m = {
      invulnerable:  !!o.god,
      infiniteLives: !!o.god || !!o.lives,
      beamRadiusMult: o.megabeam ? 3.1 : 1,
      beamPowerMult:  o.infbeam ? 7 : 1,
      ufoSpeedMult:   o.speed ? 2.15 : 1,
      worldTimeScale: o.slowmo ? 0.42 : 1,
      ufoScale:       o.tiny ? 0.42 : (o.giant ? 2.7 : 1),
      scoreMult:      o.x10 ? 10 : (o.x2 ? 2 : 1),
      animalSpeedMult: o.stampede ? 2.6 : 1,
      animalJitter:    o.stampede ? 3.2 : 1,
      populationMult:  o.x10animals ? 10 : (o.herds ? 3 : 1),
      farmerCount:     o.peaceful ? (o.farmers || 1) : (o.farmers || 1),
      peacefulFarmer:  !!o.peaceful,
      rainbowBeam:     !!o.rainbow,
      bigHead:         o.bighead ? 2.6 : 1,
      gravityMult:     o.moon ? 0.22 : 1,
      magnet:          !!o.magnet,
      weather:         o.weather || 'Clear',
      partyMode:       !!o.party,
      animalScale:     o.bigmals ? 2.4 : 1,
      rosterOverride:  o.chickens ? 'chicken' : (o.cows ? 'cow' : (o.horses ? 'horse' : null))
    };
    this.mod = m;
    return m;
  }
};
CHEATS.rebuild();

/* ------------------------------------------------------------- SETTINGS -- */
var SETTINGS = {
  master: 0.8, music: 0.6, sfx: 0.9,
  quality: 'high',          // low | med | high
  shadows: true,
  particles: true,
  stickSize: 1.0,
  invertY: false,
  reduceMotion: false,
  showHints: true
};

/* ----------------------------------------------------------------- SAVE -- */
/* Autosave is the primary save model (D-019). Permanent upgrades persist
   across the whole campaign and never reset per mission (D-020). */
var SAVE = {
  key: 'barnyard-abduction-save-v1',
  data: null,
  _t: null,
  defaults: function () {
    return {
      v: 1,
      career: 0, spent: 0, totalAbducted: 0, bestCombo: 0,
      upgrades: { engine:0, beamWidth:0, beamPower:0, shields:0, boost:0 },
      progress: { unlocked: 1, missions: {} },
      settings: null, cheats: null
    };
  },
  load: function () {
    var d = null;
    try {
      var raw = window.localStorage.getItem(this.key);
      if (raw) d = JSON.parse(raw);
    } catch (e) { console.warn('[save] unreadable, starting fresh:', e); }
    if (!d || d.v !== 1) d = this.defaults();
    var def = this.defaults();
    for (var k in def) if (!(k in d)) d[k] = def[k];
    for (var u in def.upgrades) if (!(u in d.upgrades)) d.upgrades[u] = 0;
    this.data = d;
    if (d.settings) for (var s in d.settings) if (s in SETTINGS) SETTINGS[s] = d.settings[s];
    if (d.cheats) { CHEATS.on = d.cheats; CHEATS.rebuild(); }
    return d;
  },
  queue: function () {                     // debounced autosave
    var self = this;
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(function () { self.flush(); }, 400);
  },
  flush: function () {
    if (!this.data) return;
    this.data.settings = SETTINGS;
    this.data.cheats = CHEATS.on;
    try { window.localStorage.setItem(this.key, JSON.stringify(this.data)); }
    catch (e) { console.warn('[save] write failed:', e); }
  },
  wipe: function () {
    try { window.localStorage.removeItem(this.key); } catch (e) {}
    this.data = this.defaults(); CHEATS.clear();
  },
  bank: function () { return Math.max(0, this.data.career - this.data.spent); }
};

/* ---------------------------------------------------------------- AUDIO -- */
/* Everything is synthesised with WebAudio — no external asset fetches, so the
   file still works opened straight off Dropbox or offline (Arch Manual §19).
   Gameplay asks for semantic events; it never touches oscillators (§15). */
var AUDIO = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  ready: false, started: false, danger: 0, _musicTimer: null, _step: 0,

  init: function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    this.ready = true;
  },
  applyVolumes: function () {
    if (!this.ready) return;
    this.master.gain.value = SETTINGS.master;
    this.musicGain.gain.value = SETTINGS.music * 0.42;
    this.sfxGain.gain.value = SETTINGS.sfx;
  },
  /* iOS requires a user gesture before audio will start. */
  unlock: function () {
    this.init();
    if (!this.ready) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone: function (opt) {
    if (!this.ready || SETTINGS.sfx <= 0) return;
    var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + opt.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, opt.vol || 0.25), t + (opt.atk || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    o.connect(g); g.connect(opt.bus || this.sfxGain);
    o.start(t); o.stop(t + opt.dur + 0.03);
  },
  noise: function (dur, vol, freq, q) {
    if (!this.ready || SETTINGS.sfx <= 0) return;
    var t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = this.ctx.createBufferSource(); src.buffer = buf;
    var f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = freq || 900; f.Q.value = q || 1.1;
    var g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
  },

  /* semantic events */
  sfx: function (name) {
    if (!this.ready) return;
    switch (name) {
      case 'beamOn':   this.tone({ type:'sawtooth', f0:150, f1:520, dur:0.30, vol:0.13 }); break;
      case 'beamOff':  this.tone({ type:'sine',     f0:420, f1:130, dur:0.20, vol:0.09 }); break;
      case 'lock':     this.tone({ type:'square',   f0:880, f1:1250,dur:0.09, vol:0.07 }); break;
      case 'capture':  this.tone({ type:'sine',     f0:520, f1:1500,dur:0.30, vol:0.24 });
                       this.tone({ type:'triangle', f0:780, f1:2100,dur:0.24, vol:0.13 }); break;
      case 'combo':    this.tone({ type:'square',   f0:660, f1:1760,dur:0.24, vol:0.16 }); break;
      case 'hit':      this.noise(0.26, 0.30, 420, 0.8);
                       this.tone({ type:'sawtooth', f0:210, f1:60,  dur:0.26, vol:0.18 }); break;
      case 'shield':   this.tone({ type:'sine',     f0:1250,f1:420, dur:0.20, vol:0.13 }); break;
      case 'fire':     this.noise(0.13, 0.20, 1500, 2.4); break;
      case 'alert':    this.tone({ type:'square',   f0:520, f1:760, dur:0.16, vol:0.13 }); break;
      case 'win':      [523,659,784,1046].forEach(function(f,i){
                         AUDIO.tone({ type:'triangle', f0:f, dur:0.42, vol:0.20, atk:0.02+i*0.10 }); }); break;
      case 'lose':     [440,392,330,262].forEach(function(f,i){
                         AUDIO.tone({ type:'triangle', f0:f, dur:0.40, vol:0.18, atk:0.02+i*0.13 }); }); break;
      case 'ui':       this.tone({ type:'square',   f0:620, dur:0.055, vol:0.07 }); break;
      case 'moo':      this.tone({ type:'sawtooth', f0:150, f1:105, dur:0.55, vol:0.11 }); break;
      case 'cluck':    this.tone({ type:'square',   f0:900, f1:640, dur:0.10, vol:0.07 }); break;
      case 'baa':      this.tone({ type:'sawtooth', f0:400, f1:330, dur:0.34, vol:0.08 }); break;
      case 'oink':     this.tone({ type:'sawtooth', f0:260, f1:180, dur:0.20, vol:0.09 }); break;
      case 'neigh':    this.tone({ type:'sawtooth', f0:640, f1:300, dur:0.42, vol:0.10 }); break;
      case 'yell':     this.tone({ type:'square',   f0:330, f1:230, dur:0.26, vol:0.10 }); break;
    }
  },
  animalCry: function (kind) {
    this.sfx({ cow:'moo', chicken:'cluck', sheep:'baa', goat:'baa', pig:'oink', horse:'neigh' }[kind] || 'cluck');
  },

  /* Relaxed cartoon loop that ramps with danger (D-018 / S09). */
  startMusic: function () {
    if (!this.ready || this._musicTimer) return;
    var self = this;
    var calm  = [0,4,7,12,7,4,0,-5];
    var tense = [0,3,7,10,12,10,7,3];
    this._musicTimer = setInterval(function () {
      if (SETTINGS.music <= 0 || !self.started) return;
      var scale = self.danger > 0.5 ? tense : calm;
      var n = scale[self._step % scale.length];
      var root = self.danger > 0.5 ? 98 : 87;
      var f = root * Math.pow(2, n / 12);
      self.tone({ type:'triangle', f0:f, dur:0.44,
                  vol:0.16 + self.danger * 0.10, bus:self.musicGain });
      if (self._step % 4 === 0)
        self.tone({ type:'sine', f0:f/2, dur:0.62, vol:0.13, bus:self.musicGain });
      if (self.danger > 0.5 && self._step % 2 === 1)
        self.tone({ type:'square', f0:f*2, dur:0.13, vol:0.05, bus:self.musicGain });
      self._step++;
    }, 300);
    this.started = true;
  },
  stopMusic: function () {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    this.started = false;
  },
  setDanger: function (d) { this.danger = Math.max(0, Math.min(1, d)); }
};

/* --------------------------------------------------------------- HELPERS -- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
