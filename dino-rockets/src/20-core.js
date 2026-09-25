/* ============================================================
   DINO ROCKETS — CORE   (pure, DOM-free; exercised by tests/core.mjs)

   Nothing here may touch the DOM, storage, audio or the clock. The whole
   learning model and every piece of choreography is data, so the rules
   that matter are held by tests rather than remembered by whoever edits
   an animation next.

   The learning model is built on two findings that are about as solid as
   education research gets:
     * RETRIEVAL beats re-reading or copying: spelling a word from memory
       fixes it far better than looking at it and copying it out;
     * SPACING beats cramming: a second retrieval later in the session
       (and on later days) is worth more than another one straight away.
   So every word ends in a from-memory spell (BLAST), words get less
   scaffolding as they are mastered, and the week's finale brings the
   shakiest words back for one more retrieval after a gap.
   ============================================================ */

/* ---------------- words ---------------- */
var DEFAULT_WORDS = ['THE', 'SAID', 'WENT', 'COME', 'LOOK'];
var MAX_WORDS = 30;

function cleanWord(raw){
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
}
function normalizeWords(list){
  var out = [], seen = {};
  (list || []).forEach(function(x){
    var w = cleanWord(x);
    if (w.length < 2 || w.length > 12 || seen[w]) return;
    seen[w] = true; out.push(w);
  });
  return out;
}
function parseWordInput(text){
  return normalizeWords(String(text == null ? '' : text).split(/[\s,;\/|.]+/).map(function(t){
    return t.replace(/^\d+\)?$/, '');
  }));
}
function addWords(list, text){ return normalizeWords((list || []).concat(parseWordInput(text))).slice(0, MAX_WORDS); }
function removeWord(list, word){ var w = cleanWord(word); return (list || []).filter(function(x){ return x !== w; }); }

/* ---------------- randomness ---------------- */
/* A small seeded generator, so a baby dino or a scene is reproducible. */
function rng(seed){
  var s = (seed >>> 0) || 0x9E3779B9;
  return function(){
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd){
  var a = arr.slice(), r = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(r() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function pickOne(list, rnd){ return list[Math.floor((rnd || Math.random)() * list.length) % list.length]; }
function hashStr(s){
  var h = 2166136261;
  for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------- letter names ----------------
   The voice is fed a spoken name, never the bare character, so iOS never
   says "capital A" and never reads a lone vowel as a word. A is "eigh"
   because engines read "ay"/"aye" as the word "I". */
var LETTER_SOUND = {
  A:'eigh', B:'bee', C:'see', D:'dee', E:'eee', F:'eff', G:'gee', H:'aitch',
  I:'eye', J:'jay', K:'kay', L:'ell', M:'em', N:'en', O:'oh', P:'pee',
  Q:'cue', R:'ar', S:'ess', T:'tee', U:'you', V:'vee', W:'double-you',
  X:'ex', Y:'why', Z:'zee'
};
var A_SOUND_CHOICES = ['eigh', 'ay', 'ey'];
var E_SOUND_CHOICES = ['eee', 'ee', 'eeh'];
function letterSound(ch, overrides){
  var c = String(ch == null ? '' : ch).toUpperCase();
  if (overrides && overrides[c]) return String(overrides[c]);
  return LETTER_SOUND[c] || c.toLowerCase();
}

/* Real, simple words used as decoys. */
var WORD_BANK = (
  'AM AN AS AT BE BY DO GO HE IF IN IS IT ME MY NO OF ON OR SO TO UP US WE ' +
  'ALL AND ANY ARE ASK BAT BED BIG BOX BOY BUS BUT CAN CAR CAT COW CUP CUT DAD DAY DID DOG EAT EGG END FAR FEW FOR FOX FUN ' +
  'GET GOT HAD HAS HAT HER HIM HIS HOT HOW ICE ITS JOB KEY KID LEG LET LOT LOW MAN MAP MAY MOM NEW NOT NOW OLD ONE OUR OUT ' +
  'OWN PEN PIG PUT RAN RED RUN SAT SAW SAY SEA SEE SET SHE SIT SIX SKY SUN TEN THE TOO TOP TOY TRY TWO USE VAN WAS WAY WET ' +
  'WHO WHY WIN YES YET YOU ZOO ALSO BABY BACK BALL BEAR BEEN BEST BIKE BIRD BLUE BOAT BOOK BOTH CAKE CALL CAME CARE CITY ' +
  'COLD COME CORN DARK DEEP DOES DONE DOOR DOWN DUCK EACH EASY EVEN EVER FACE FALL FARM FAST FEEL FEET FIND FINE FIRE FISH ' +
  'FIVE FOOD FOOT FOUR FREE FROG FROM FULL GAME GATE GAVE GIVE GOAT GOES GOLD GONE GOOD GROW HAND HARD HAVE HEAD HEAR HELP ' +
  'HERE HIGH HILL HOLD HOME HOPE JUMP JUST KEEP KIND KING KNOW LAKE LAND LAST LATE LEAF LEFT LESS LIFE LIKE LINE LION LIST ' +
  'LIVE LONG LOOK LOST LOUD LOVE MADE MAKE MANY MEAN MEET MILK MIND MINE MISS MOON MORE MOST MOVE MUCH MUST NAME NEAR NEED ' +
  'NEXT NICE NINE NOSE NOTE ONCE ONLY OPEN OVER PAGE PARK PART PICK PLAN PLAY PULL PUSH RACE RAIN READ REAL REST RIDE RING ' +
  'ROAD ROCK ROOM SAID SAME SAND SEAT SEEN SELL SEND SHIP SHOE SHOP SHOW SIDE SING SLOW SNOW SOME SONG SOON STAR STAY STEP ' +
  'STOP SUCH SURE SWIM TAKE TALK TALL TELL THAN THAT THEM THEN THEY THIN THIS TIME TINY TOLD TOOK TREE TRIP TRUE TURN VERY ' +
  'WAIT WALK WALL WANT WARM WASH WAVE WEEK WELL WENT WERE WHAT WHEN WILD WILL WIND WISH WITH WOOD WORD WORK YARD YEAR YOUR ' +
  'ABOUT AFTER AGAIN APPLE BEACH BEGIN BRING BROWN BUILD CHAIR CLEAN CLOUD COULD DREAM DRINK EARLY EARTH EVERY FIRST FOUND ' +
  'FRONT FUNNY GRASS GREAT GREEN HAPPY HEART HORSE HOUSE LARGE LAUGH LEARN LIGHT MONEY MOUSE MUSIC NEVER NIGHT OCEAN OTHER ' +
  'PAPER PARTY PLACE PLANT QUICK RIGHT RIVER ROUND SEVEN SHEEP SHORT SLEEP SMALL SMILE SOUND SPACE SPELL START STORY SWEET ' +
  'TABLE THANK THEIR THERE THESE THING THINK THOSE THREE TIGER TODAY TRAIN TRUCK UNDER WATCH WATER WHEEL WHERE WHICH WHITE ' +
  'WORLD WOULD WRITE YOUNG').split(' ');

/*
  Decoys that make him LOOK, not guess: the best wrong answers share the
  first letter or the length of the right one, so he has to read past the
  first letter to tell them apart.
*/
function zapOptions(word, count, rnd){
  var w = cleanWord(word), n = count || 3, r = rnd || Math.random;
  var scored = WORD_BANK.filter(function(x){ return x !== w; }).map(function(x){
    var s = 0;
    if (x[0] === w[0]) s += 3;
    if (x.length === w.length) s += 2;
    else if (Math.abs(x.length - w.length) === 1) s += 1;
    if (x[x.length - 1] === w[w.length - 1]) s += 1;
    return { x: x, s: s + r() * 1.5 };
  }).sort(function(a, b){ return b.s - a.s; });
  var decoys = scored.slice(0, n - 1).map(function(o){ return o.x; });
  return shuffle(decoys.concat([w]), r);
}

function scramble(word, rnd){
  var letters = cleanWord(word).split('');
  if (letters.length < 2) return letters;
  var same = letters.every(function(c){ return c === letters[0]; });
  var out = shuffle(letters, rnd), tries = 0;
  while (!same && out.join('') === letters.join('') && tries++ < 30) out = shuffle(letters, rnd);
  if (!same && out.join('') === letters.join('')){ var t = out[0]; out[0] = out[out.length - 1]; out[out.length - 1] = t; }
  return out;
}
function isPermutationOf(tiles, word){
  var a = (tiles || []).slice().sort().join(''), b = cleanWord(word).split('').sort().join('');
  return a.length > 0 && a === b;
}

/*
  MISSING LETTER: which boxes to leave empty. The positions he has got
  wrong before come first (that is where the learning is), then vowels,
  which are the usual trap in sight words, then anything else.
*/
var VOWELS = { A:1, E:1, I:1, O:1, U:1 };
function missingSlots(word, posMisses, rnd){
  var w = cleanWord(word), r = rnd || Math.random;
  var n = w.length <= 3 ? 1 : (w.length <= 6 ? 2 : 3);
  var pm = posMisses || [];
  var order = w.split('').map(function(ch, i){
    return { i: i, s: (pm[i] || 0) * 10 + (VOWELS[ch] ? 3 : 0) + r() };
  }).sort(function(a, b){ return b.s - a.s; });
  return order.slice(0, Math.min(n, w.length - 1)).map(function(o){ return o.i; }).sort(function(a, b){ return a - b; });
}
/* Three letter choices for a missing box: the right one and two believable ones. */
var CONFUSABLE = { B:'DP', D:'BP', P:'BQ', Q:'PG', M:'NW', N:'MH', W:'MV', E:'AI', A:'EO', I:'EY', O:'AU', U:'OV', C:'KS', K:'CX', S:'CZ', G:'JQ', J:'GI', Y:'IV', V:'WU', F:'TH', T:'FL', H:'NK', L:'IT', R:'NP' };
function missingChoices(ch, rnd){
  var r = rnd || Math.random, c = cleanWord(ch)[0];
  var pool = (CONFUSABLE[c] || '').split('');
  while (pool.length < 2){
    var x = String.fromCharCode(65 + Math.floor(r() * 26));
    if (x !== c && pool.indexOf(x) === -1) pool.push(x);
  }
  return shuffle([c].concat(pool.slice(0, 2)), r);
}

/*
  BLAST keys: every distinct letter of the word plus a few that are not in
  it. Keys are reusable, so a double letter (LOOK) means pressing O twice —
  he has to know it is there, not just see two O keys.
*/
function blastKeys(word, extra, rnd){
  var w = cleanWord(word), r = rnd || Math.random, seen = {}, keys = [];
  w.split('').forEach(function(c){ if (!seen[c]){ seen[c] = 1; keys.push(c); } });
  var pool = [];
  for (var i = 0; i < 26; i++){ var c = String.fromCharCode(65 + i); if (!seen[c]) pool.push(c); }
  var n = extra == null ? Math.max(3, 8 - keys.length) : extra;
  return shuffle(keys.concat(shuffle(pool, r).slice(0, n)), r);
}

/* ---------------- mastery & the order of activities ---------------- */
/*
  Level 0  new:        MEET -> ZAP -> BUILD   -> BLAST
  Level 1  familiar:   MEET -> ZAP -> MISSING -> BLAST
  Level 2+ strong:     MEET ->        MISSING -> BLAST
  The scaffold comes away as he earns it; the from-memory BLAST never does.
*/
function activitiesFor(level){
  var l = Math.max(0, Number(level) || 0);
  if (l === 0) return ['meet', 'zap', 'build', 'blast'];
  if (l === 1) return ['meet', 'zap', 'missing', 'blast'];
  return ['meet', 'missing', 'blast'];
}
function blankStat(){ return { level: 0, plays: 0, clean: 0, misses: 0, posMisses: [], last: 0 }; }
/*
  Update a word's record after its BLAST. A clean spell from memory moves
  it up a level; needing a peek moves it back one, so a word that slipped
  gets its scaffolding back next time.
*/
function recordBlast(stat, word, result, now){
  var s = normalizeStat(stat, word);
  s.plays++;
  s.last = now || 0;
  var misses = (result && result.misses) || 0;
  s.misses += misses;
  ((result && result.missPositions) || []).forEach(function(p){
    if (p >= 0 && p < s.posMisses.length) s.posMisses[p]++;
  });
  if (result && result.peeked) s.level = Math.max(0, s.level - 1);
  else if (misses === 0){ s.clean++; s.level = Math.min(3, s.level + 1); }
  return s;
}
function normalizeStat(stat, word){
  var w = cleanWord(word), o = stat && typeof stat === 'object' ? stat : {};
  var s = blankStat();
  s.level = Math.max(0, Math.min(3, Math.floor(Number(o.level) || 0)));
  s.plays = Math.max(0, Math.floor(Number(o.plays) || 0));
  s.clean = Math.max(0, Math.floor(Number(o.clean) || 0));
  s.misses = Math.max(0, Math.floor(Number(o.misses) || 0));
  s.last = Math.max(0, Number(o.last) || 0);
  for (var i = 0; i < w.length; i++) s.posMisses.push(Math.max(0, Math.floor(Number((o.posMisses || [])[i]) || 0)));
  return s;
}
/* The shakiest words first: the finale's second retrieval goes where it helps most. */
function reviewQueue(words, stats, max){
  return (words || []).map(function(w, i){
    var s = normalizeStat((stats || {})[w], w);
    return { w: w, i: i, score: (3 - s.level) * 10 + s.misses * 2 - s.clean };
  }).sort(function(a, b){ return b.score - a.score || a.i - b.i; })
    .slice(0, Math.max(1, max || 4)).map(function(o){ return o.w; });
}

/* ---------------- planets: one per word ---------------- */
var PLANETS = [
  { id:'lava',    name:'Lava Land',     sky:['#0B1640', '#3A1A12'], ground:'#E0592A', rim:'#FFB067', rock:'#8C2F14', glow:'#FF8A1F' },
  { id:'ice',     name:'Frosty Moon',   sky:['#0A1C4A', '#1F4E8C'], ground:'#BFE6FF', rim:'#FFFFFF', rock:'#7FB8E6', glow:'#8FE3FF' },
  { id:'jungle',  name:'Jungle World',  sky:['#081D2E', '#10485A'], ground:'#3FAE55', rim:'#8EE06A', rock:'#1E6E36', glow:'#B6FF6A' },
  { id:'desert',  name:'Dune Planet',   sky:['#0E1B45', '#2E3A50'], ground:'#E9B64F', rim:'#FFE08A', rock:'#B27A22', glow:'#FFD24A' },
  { id:'crater',  name:'Crater Moon',   sky:['#05102A', '#1B2A4A'], ground:'#9AA6B8', rim:'#D6DEEA', rock:'#5E6B80', glow:'#E3ECFF' },
  { id:'ocean',   name:'Splash Planet', sky:['#06183F', '#0D4C7A'], ground:'#2B8FD8', rim:'#8FD1FF', rock:'#155A96', glow:'#6FE3FF' },
  { id:'volcano', name:'Rumble Rock',   sky:['#0F1830', '#43201A'], ground:'#5B4A43', rim:'#FF7A2F', rock:'#2E2420', glow:'#FF5A1F' },
  { id:'crystal', name:'Crystal Caves', sky:['#051B2E', '#0B4B55'], ground:'#34C9B8', rim:'#B9FFF4', rock:'#16847A', glow:'#9CFFF0' }
];
/* This week's route: each word lands on a different planet, starting from a
   place chosen per week, so a new list feels like a new journey. */
function planetFor(index, offset){
  var n = PLANETS.length;
  return PLANETS[(((index + (offset || 0)) % n) + n) % n];
}
function weekId(words){ return 'w' + hashStr((words || []).join(',')).toString(36); }

/* ---------------- the crew ---------------- */
/*
  Four dinosaur astronauts. Each one's movement is his identity, and the
  planner will refuse to let one borrow another's:
    Rex   — T. rex with a jet pack. Jet boosts, a ROAR that shakes letters
            loose, a tail whip. Arms far too short to grab anything — that
            is his running joke.
    Trike — Triceratops. Ground-bound and strong: paws the ground, charges,
            scoops letters on his horns, STOMPS so everything bounces.
    Dash  — Raptor. Speed: blurs across the screen, skids, spin-dashes into
            a whirlwind that sweeps letters into orbit.
    Swoop — Pterosaur. Flight: circles, dive-bombs, loops the loop, and
            gives letters a ride on his back.
*/
var CHARS = {
  rex:   { key:'rex',   name:'Rex',   airborne:true,  falls:true,  spins:false, color:'#3FBF4F', gear:'jet pack' },
  trike: { key:'trike', name:'Trike', airborne:false, falls:true,  spins:false, color:'#2F7BF5', gear:'none' },
  dash:  { key:'dash',  name:'Dash',  airborne:false, falls:true,  spins:true,  color:'#FF8A1F', gear:'none' },
  swoop: { key:'swoop', name:'Swoop', airborne:true,  falls:false, spins:true,  color:'#E53935', gear:'none' }
};
var CHAR_ORDER = ['rex', 'trike', 'dash', 'swoop'];
/* Abilities that belong to exactly one of them. */
var ABILITY_OWNER = {
  roar:'rex', tailwhip:'rex', reach:'rex', jetboost:'rex',
  paw:'trike', charge:'trike', stomp:'trike', scoop:'trike', backcatch:'trike',
  zoom:'dash', spindash:'dash', skid:'dash', dashpass:'dash', orbit:'dash', sweep:'dash',
  dive:'swoop', loop:'swoop', glide:'swoop', ride:'swoop'
};
var MAX_LEAN = 30;
function rotBudgetFor(key){ var c = CHARS[key]; return c && c.spins ? Infinity : (c && c.falls ? 110 : MAX_LEAN); }
function exitDirsFor(key){ var c = CHARS[key]; return c && c.airborne ? ['up', 'left', 'right'] : ['left', 'right']; }

/* ---------------- baby dinos: the collection ---------------- */
var BABY_COLORS = ['#3FBF4F', '#2F7BF5', '#FF8A1F', '#E53935', '#FFC53D', '#1FB5A8', '#7A8BA6', '#1E88E5', '#FF6A3D', '#2ECC71'];
var BABY_SPOTS = ['#FFFFFF', '#0B2A66', '#FFE08A', '#14532D', '#FF8A1F', '#9FE3FF'];
var BABY_NAMES = ['Chomp', 'Pebble', 'Rocket', 'Sprout', 'Nugget', 'Bolt', 'Comet', 'Biscuit', 'Tank', 'Zippy', 'Nacho', 'Boulder',
  'Scout', 'Blaze', 'Pickle', 'Turbo', 'Fizz', 'Crunch', 'Waffle', 'Gizmo', 'Stomper', 'Jet', 'Rusty', 'Pip', 'Moose', 'Ziggy',
  'Taco', 'Flint', 'Buster', 'Cosmo', 'Spud', 'Diesel', 'Noodle', 'Ranger', 'Bonk', 'Echo'];
var BABY_KINDS = ['rex', 'trike', 'dash', 'swoop'];
function makeBaby(seed){
  var r = rng(seed);
  var body = pickOne(BABY_COLORS, r), spots = pickOne(BABY_SPOTS, r);
  if (spots === body) spots = '#FFFFFF';
  return { id: 'b' + (seed >>> 0).toString(36), kind: pickOne(BABY_KINDS, r), body: body, spots: spots,
           name: pickOne(BABY_NAMES, r), pattern: pickOne(['spots', 'stripes', 'plain'], r), hat: pickOne(['none', 'helmet', 'cap', 'none'], r) };
}

/* ---------------- settings, repaired on the way in ---------------- */
var SETTINGS_VERSION = 1;
function normalizeSettings(obj){
  var o = obj && typeof obj === 'object' ? obj : {};
  var words = Array.isArray(o.words) ? normalizeWords(o.words).slice(0, MAX_WORDS) : DEFAULT_WORDS.slice();
  var stats = {};
  words.forEach(function(w){ stats[w] = normalizeStat(o.stats && o.stats[w], w); });
  var wk = o.week && typeof o.week === 'object' ? o.week : {};
  var id = weekId(words);
  var eggs = {};
  if (wk.id === id && wk.eggs && typeof wk.eggs === 'object'){
    Object.keys(wk.eggs).forEach(function(k){
      var i = Number(k), seed = wk.eggs[k];
      if (i >= 0 && i < words.length && Math.floor(i) === i && typeof seed === 'number') eggs[i] = seed >>> 0;
    });
  }
  var week = wk.id === id
    ? { id: id, done: (Array.isArray(wk.done) ? wk.done : []).filter(function(i){ return i >= 0 && i < words.length && Math.floor(i) === i; }),
        offset: Math.max(0, Math.floor(Number(wk.offset) || 0)) % PLANETS.length, finale: !!wk.finale, eggs: eggs }
    : { id: id, done: [], offset: hashStr(id) % PLANETS.length, finale: false, eggs: {} };
  var seenDone = {};
  week.done = week.done.filter(function(i){ if (seenDone[i]) return false; seenDone[i] = 1; return true; });
  var babies = (Array.isArray(o.babies) ? o.babies : []).filter(function(b){ return b && typeof b.seed === 'number'; })
    .slice(-200).map(function(b){ return { seed: b.seed >>> 0, at: Number(b.at) || 0 }; });
  var sceneIds = {};
  SCENES.forEach(function(s){ sceneIds[s.id] = 1; });
  return {
    v: SETTINGS_VERSION, words: words, stats: stats, week: week, babies: babies,
    aSound: A_SOUND_CHOICES.indexOf(o.aSound) !== -1 ? o.aSound : LETTER_SOUND.A,
    eSound: E_SOUND_CHOICES.indexOf(o.eSound) !== -1 ? o.eSound : LETTER_SOUND.E,
    sfx: o.sfx !== false, music: o.music !== false,
    sceneHistory: (Array.isArray(o.sceneHistory) ? o.sceneHistory : []).filter(function(x){ return sceneIds[x]; }).slice(0, 8),
    leadHistory: (Array.isArray(o.leadHistory) ? o.leadHistory : []).filter(function(x){ return CHARS[x]; }).slice(0, 8)
  };
}
function letterOverrides(s){ return { A: (s && s.aSound) || LETTER_SOUND.A, E: (s && s.eSound) || LETTER_SOUND.E }; }
/* Next planet to visit: the first not yet done, else -1 (the finale). */
function nextPlanet(week, count){
  for (var i = 0; i < count; i++) if ((week.done || []).indexOf(i) === -1) return i;
  return -1;
}

/* ============================================================
   SCENES — planned as data, executed by the stage.
   ============================================================ */
var BEAT = {
  enter:700, approach:420, exit:640, roar:900, snatch:520, reach:640, tailwhip:520,
  paw:620, stomp:620, charge:1100, scoop:300, backcatch:520, skid:460, zoom:900, sweep:260,
  spindash:1300, orbit:300, dive:640, loop:760, glide:1300, ride:300, wave:520,
  ship:900, beam:520, beamup:700, toss:560, catch:320, grab:360, tug:760, pop:420,
  fall:620, getup:420, carry:520, cheer:520, notice:360, march:1600, follow:1600
};
var SCENE_TARGET_MIN = 3500, SCENE_TARGET_MAX = 12000, SCENE_HARD_MAX = 20000;
var TAKE_KINDS = { snatch:1, tailwhip:1, scoop:1, backcatch:1, sweep:1, orbit:1, dive:1, ride:1, beam:1, catch:1, carry:1, follow:1 };
/* Beats that leave the character off stage. */
var EXIT_KINDS = { exit:1, charge:1, zoom:1, glide:1, beamup:1, carry:1, march:1 };

function makeTimeline(){
  var events = [];
  return {
    events: events,
    push: function(at, dur, kind, extra){
      var e = { at: Math.max(0, Math.round(at)), dur: Math.round(dur), kind: kind };
      for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k]; }
      events.push(e);
      return e;
    },
    end: function(){ var m = 0; events.forEach(function(e){ m = Math.max(m, e.at + e.dur); }); return m; }
  };
}
function dirFor(who, i){ var d = exitDirsFor(who); return d[Math.abs(i) % d.length]; }
function sideDir(who, i){ return (Math.abs(i) % 2) ? 'left' : 'right'; }

var SCENES = [

  /* REX roars; the letters shake loose and float; he jets up and snatches each. */
  { id:'roar-float', name:'Big Roar', lead:'rex', weight:10, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'rex' }); t += BEAT.enter;
    tl.push(t, BEAT.roar, 'roar', { char:'rex' }); t += BEAT.roar;
    /* last letter first: each catch lands on top of the stack in his jaws,
       so the word reads top to bottom and nothing slides underneath */
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 470, BEAT.snatch, 'snatch', { char:'rex', letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 470 + BEAT.snatch;
    tl.push(last, BEAT.cheer, 'cheer', { char:'rex' });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:'rex', dir:'up' });
    return tl;
  } },

  /* REX can't reach. Tiny arms. So: the tail. */
  { id:'tiny-arms', name:'Tiny Arms', lead:'rex', weight:9, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'rex' }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){
      tl.push(t, BEAT.approach, 'approach', { char:'rex', letter:i }); t += BEAT.approach;
      if (i === 0){ tl.push(t, BEAT.reach, 'reach', { char:'rex', letter:i }); t += BEAT.reach; }
      tl.push(t, BEAT.tailwhip, 'tailwhip', { char:'rex', letter:i, dir: sideDir('rex', i) }); t += BEAT.tailwhip - 80;
    }
    tl.push(t, BEAT.cheer, 'cheer', { char:'rex' }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:'rex', dir:'up' });
    return tl;
  } },

  /* TRIKE stomps: everything drops to the ground; then the charge scoops it all. */
  { id:'stomp-charge', name:'Stomp & Charge', lead:'trike', weight:10, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'trike' }); t += BEAT.enter;
    tl.push(t, BEAT.stomp, 'stomp', { char:'trike', mode:'drop' }); t += BEAT.stomp + 200;
    tl.push(t, BEAT.paw, 'paw', { char:'trike' }); t += BEAT.paw;
    var run = BEAT.charge + c.letters * 90;
    tl.push(t, run, 'charge', { char:'trike', dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 200 + i * Math.floor((run - 400) / Math.max(1, c.letters)), BEAT.scoop, 'scoop', { char:'trike', letter:c.letters - 1 - i });
    return tl;
  } },

  /* TRIKE stomps so hard they fly up; he runs under each and catches it on his back. */
  { id:'bounce-catch', name:'Bounce House', lead:'trike', weight:8, min:2, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'trike' }); t += BEAT.enter;
    tl.push(t, BEAT.stomp, 'stomp', { char:'trike', mode:'launch' }); t += BEAT.stomp;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 380, BEAT.backcatch, 'backcatch', { char:'trike', letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 380 + BEAT.backcatch;
    tl.push(last, BEAT.cheer, 'cheer', { char:'trike' });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:'trike', dir:'left' });
    return tl;
  } },

  /* DASH blurs past and the letters are sucked into his slipstream... all but one. */
  { id:'speed-sweep', name:'Speed Sweep', lead:'dash', weight:10, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'dash' }); t += BEAT.enter;
    tl.push(t, BEAT.skid, 'skid', { char:'dash' }); t += BEAT.skid;
    var missed = c.letters >= 3 ? c.letters - 1 : -1;
    var takeN = missed === -1 ? c.letters : c.letters - 1;
    if (missed === -1){
      tl.push(t, BEAT.zoom, 'zoom', { char:'dash', dir:'right' });
      for (var i = 0; i < takeN; i++) tl.push(t + 120 + i * 110, BEAT.sweep, 'sweep', { char:'dash', letter:i });
      return tl;
    }
    /* first pass: gets all but the last; he skids to a stop, spots it, goes back */
    tl.push(t, 700, 'dashpass', { char:'dash' });
    for (var j = 0; j < takeN; j++) tl.push(t + 100 + j * 100, BEAT.sweep, 'sweep', { char:'dash', letter:j });
    t += 700;
    tl.push(t, BEAT.skid, 'skid', { char:'dash' }); t += BEAT.skid;
    tl.push(t, BEAT.notice, 'notice', { char:'dash', letter:missed }); t += BEAT.notice;
    tl.push(t, BEAT.zoom, 'zoom', { char:'dash', dir:'left' });
    tl.push(t + 150, BEAT.sweep, 'sweep', { char:'dash', letter:missed });
    return tl;
  } },

  /* DASH spin-dashes into a whirlwind and the letters orbit him. */
  { id:'whirlwind', name:'Whirlwind', lead:'dash', weight:8, min:2, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'dash' }); t += BEAT.enter;
    /* the whirlwind lasts as long as it takes to pull every letter in */
    var spin = Math.max(BEAT.spindash, 250 + c.letters * 180 + BEAT.orbit);
    tl.push(t, spin, 'spindash', { char:'dash' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 250 + i * 180, BEAT.orbit, 'orbit', { char:'dash', letter:i });
    t += spin;
    tl.push(t, BEAT.zoom, 'zoom', { char:'dash', dir:'left' });
    return tl;
  } },

  /* SWOOP dive-bombs each letter from above, then loops the loop. */
  { id:'dive-bomb', name:'Dive Bomb', lead:'swoop', weight:10, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'swoop' }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 600, BEAT.dive, 'dive', { char:'swoop', letter:i });
    var last = t + Math.max(0, c.letters - 1) * 600 + BEAT.dive;
    tl.push(last, BEAT.loop, 'loop', { char:'swoop' });
    tl.push(last + BEAT.loop, BEAT.exit, 'exit', { char:'swoop', dir:'up' });
    return tl;
  } },

  /* SWOOP glides low; the letters hop on for a ride. */
  { id:'joy-ride', name:'Joy Ride', lead:'swoop', weight:8, min:2, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:'swoop' }); t += BEAT.enter;
    tl.push(t, BEAT.wave, 'wave', { char:'swoop' }); t += BEAT.wave;
    var run = BEAT.glide + c.letters * 120;
    tl.push(t, run, 'glide', { char:'swoop', dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 150 + i * Math.floor((run - 500) / Math.max(1, c.letters)), BEAT.ride, 'ride', { char:'swoop', letter:c.letters - 1 - i });
    return tl;
  } },

  /* Anyone: the rocket comes down and beams the letters aboard, then him. */
  { id:'beam-up', name:'Beam Me Up', lead:'any', weight:5, min:1, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:c.lead }); t += BEAT.enter;
    tl.push(t, BEAT.wave, 'wave', { char:c.lead }); t += BEAT.wave;
    tl.push(t, BEAT.ship, 'shiparrive', {}); t += BEAT.ship;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 260, BEAT.beam, 'beam', { letter:i });
    var last = t + Math.max(0, c.letters - 1) * 260 + BEAT.beam;
    tl.push(last, BEAT.beamup, 'beamup', { char:c.lead });
    tl.push(last + BEAT.beamup, BEAT.ship, 'shipleave', {});
    return tl;
  } },

  /* Two of them play catch with the letters. */
  { id:'toss-relay', name:'Toss Relay', lead:'any', weight:7, min:2, build: function(c){
    var tl = makeTimeline(), t = 0, a = c.lead, b = c.pick(1);
    tl.push(t, BEAT.enter, 'enter', { char:a });
    tl.push(t + 150, BEAT.enter, 'enter', { char:b, side:'far' }); t += BEAT.enter + 150;
    for (var k = 0; k < c.letters; k++){
      var i = c.letters - 1 - k;
      tl.push(t, BEAT.toss, 'toss', { char:a, other:b, letter:i });
      tl.push(t + BEAT.toss - 60, BEAT.catch, 'catch', { char:b, letter:i });
      t += 440;
    }
    t += BEAT.catch;
    tl.push(t, BEAT.cheer, 'cheer', { char:b });
    tl.push(t, BEAT.exit, 'exit', { char:a, dir:dirFor(a, 1) });
    tl.push(t + BEAT.cheer, BEAT.exit, 'exit', { char:b, dir:dirFor(b, 2) });
    return tl;
  } },

  /* Two grab the same letter. Tug. It pops loose — and Swoop swoops in. */
  { id:'tug-pop', name:'Tug of War', lead:'any', weight:6, min:2, build: function(c){
    var tl = makeTimeline(), t = 0;
    var grounders = c.order.filter(function(k){ return k !== 'swoop'; });
    var a = grounders[0], b = grounders[1];
    tl.push(t, BEAT.enter, 'enter', { char:a });
    tl.push(t, BEAT.enter, 'enter', { char:b, side:'far' }); t += BEAT.enter;
    tl.push(t, BEAT.grab, 'grab', { char:a, letter:0 });
    tl.push(t, BEAT.grab, 'grab', { char:b, letter:0 }); t += BEAT.grab;
    tl.push(t, BEAT.tug, 'tug', { char:a, other:b, letter:0 }); t += BEAT.tug;
    tl.push(t, BEAT.pop, 'pop', { letter:0 });
    tl.push(t, BEAT.fall, 'fall', { char:a });
    tl.push(t, BEAT.fall, 'fall', { char:b }); t += BEAT.fall;
    tl.push(t - 300, BEAT.enter, 'enter', { char:'swoop' });
    tl.push(t, BEAT.dive, 'dive', { char:'swoop', letter:0 });
    tl.push(t, BEAT.getup, 'getup', { char:a });
    tl.push(t, BEAT.getup, 'getup', { char:b }); t += BEAT.getup;
    var tt = t;
    for (var i = 1; i < c.letters; i++){
      var who = i % 2 ? a : b;
      tl.push(tt, BEAT.carry, 'carry', { char:who, letter:i, dir: who === a ? 'left' : 'right' });
      tt += 320;
    }
    /* with only two letters, b has nothing left to carry: he just goes */
    if (c.letters < 3) tl.push(t, BEAT.exit, 'exit', { char:b, dir:'right' });
    tl.push(t - BEAT.getup + BEAT.dive, BEAT.exit, 'exit', { char:'swoop', dir:'up' });
    return tl;
  } },

  /* The whole crew marches the letters off like a parade. */
  { id:'dino-parade', name:'Dino Parade', lead:'any', weight:4, min:2, build: function(c){
    var tl = makeTimeline(), t = 0;
    tl.push(t, BEAT.enter, 'enter', { char:c.lead }); t += BEAT.enter;
    tl.push(t, 1000, 'parade', { char:c.lead, count:c.letters }); t += 1000;
    var march = BEAT.march + c.letters * 140;
    tl.push(t, march, 'march', { char:c.lead, dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 60 + i * 70, march - 60 - i * 70, 'follow', { leader:c.lead, letter:i, dir:'right' });
    return tl;
  } }
];

function eligibleScenes(lead, letters){
  var n = Math.max(0, Math.floor(Number(letters) || 0));
  return SCENES.filter(function(s){ return (s.lead === 'any' || s.lead === lead) && n >= (s.min || 1); });
}
function pickScene(lead, letters, history, rnd){
  var r = rnd || Math.random, pool = eligibleScenes(lead, letters);
  if (!pool.length) return null;
  var windows = [5, 3, 1];
  for (var w = 0; w < windows.length; w++){
    var recent = (history || []).slice(0, windows[w]);
    var fresh = pool.filter(function(s){ return recent.indexOf(s.id) === -1; });
    if (fresh.length >= 2 || (fresh.length && windows[w] === 1)){ pool = fresh; break; }
  }
  var total = 0; pool.forEach(function(s){ total += s.weight || 1; });
  var roll = r() * total;
  for (var i = 0; i < pool.length; i++){ roll -= pool[i].weight || 1; if (roll <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function pickLead(history, rnd){
  var r = rnd || Math.random, h = history || [], best = [], bestAge = -1;
  CHAR_ORDER.forEach(function(k){
    var at = h.indexOf(k), age = at === -1 ? 1e6 : at;
    if (age > bestAge){ best = [k]; bestAge = age; } else if (age === bestAge) best.push(k);
  });
  return best[Math.floor(r() * best.length) % best.length];
}
function remember(list, item, cap){ return [item].concat((list || []).filter(function(x){ return x !== item; })).slice(0, cap || 8); }

/* A trailing exit is dead time if an earlier beat already carried him off. */
function trimRedundantExits(tl){
  var ev = tl.events, keep = ev.filter(function(e){
    if (e.kind !== 'exit') return true;
    return !ev.some(function(p){
      return p !== e && p.char === e.char && EXIT_KINDS[p.kind] && p.kind !== 'exit' && p.at <= e.at && p.at + p.dur >= e.at - 40;
    });
  });
  ev.length = 0; keep.forEach(function(e){ ev.push(e); });
  return tl;
}
function fitDuration(tl){
  var total = tl.end();
  if (total <= SCENE_TARGET_MAX) return total;
  var k = SCENE_TARGET_MAX / total;
  tl.events.forEach(function(e){ e.at = Math.round(e.at * k); e.dur = Math.round(e.dur * Math.max(0.7, k)); });
  return tl.end();
}
var MIRROR = { left:'right', right:'left' };
function mirrorTimeline(tl){ tl.events.forEach(function(e){ if (MIRROR[e.dir]) e.dir = MIRROR[e.dir]; }); return tl; }
function applyTempo(tl, tempo){
  var k = Math.max(0.85, Math.min(1.15, Number(tempo) || 1)), end = tl.end();
  if (end * k > SCENE_HARD_MAX) k = SCENE_HARD_MAX / end;
  tl.events.forEach(function(e){ e.at = Math.round(e.at * k); e.dur = Math.max(60, Math.round(e.dur * k)); });
  return tl.end();
}

/*
  Plan one scene. opts: { letters, lead, history, rnd, forceId, mirror, tempo, fixedCast }
  Every performance is a scene from the library PLUS variation on top:
  mirrored or not, a touch faster or slower, a random supporting cast.
*/
function planScene(opts){
  opts = opts || {};
  var letters = Math.max(0, Math.floor(Number(opts.letters) || 0));
  var lead = CHARS[opts.lead] ? opts.lead : CHAR_ORDER[0];
  var r = opts.rnd || Math.random;
  var others = CHAR_ORDER.filter(function(k){ return k !== lead; });
  var order = [lead].concat(opts.fixedCast ? others : shuffle(others, r));
  var mirror = opts.mirror == null ? r() < 0.5 : !!opts.mirror;
  var tempo = opts.tempo == null ? 0.92 + r() * 0.16 : Number(opts.tempo) || 1;
  var plan = { id:null, name:null, lead:lead, letters:letters, cast:order, events:[], duration:0, mirror:mirror, tempo:tempo };
  if (!letters) return plan;
  var scene = null;
  if (opts.forceId) SCENES.forEach(function(s){ if (s.id === opts.forceId) scene = s; });
  if (scene && (letters < (scene.min || 1))) scene = null;
  if (!scene) scene = pickScene(lead, letters, opts.history || [], r);
  if (!scene) return plan;
  var ctx = {
    letters: letters, lead: lead, order: order,
    pick: function(i){ return order[Math.abs(i) % order.length]; }
  };
  var tl = scene.build(ctx);
  trimRedundantExits(tl);
  if (mirror) mirrorTimeline(tl);
  fitDuration(tl);
  plan.id = scene.id; plan.name = scene.name;
  plan.duration = applyTempo(tl, tempo);
  plan.events = tl.events.slice().sort(function(a, b){ return a.at - b.at; });
  return plan;
}

/* The rules every plan is held to. Empty list = sound. */
function validatePlan(plan){
  var p = [];
  if (!plan || !plan.letters) return p;
  if (!plan.events.length) return ['no events'];
  var taken = {};
  plan.events.forEach(function(e){ if (e.letter != null && TAKE_KINDS[e.kind]) taken[e.letter] = (taken[e.letter] || 0) + 1; });
  for (var i = 0; i < plan.letters; i++){
    if (!taken[i]) p.push('letter ' + i + ' is never taken');
    else if (taken[i] > 1) p.push('letter ' + i + ' is taken ' + taken[i] + ' times');
  }
  plan.events.forEach(function(e){
    if (!e.char) return;
    if (!CHARS[e.char]){ p.push('unknown character ' + e.char); return; }
    var owner = ABILITY_OWNER[e.kind];
    if (owner && owner !== e.char) p.push(CHARS[e.char].name + ' used ' + e.kind + ', which is ' + CHARS[owner].name + '’s');
    if (e.kind === 'fall' && !CHARS[e.char].falls) p.push(CHARS[e.char].name + ' does not fall');
    if (e.kind !== 'enter' && !plan.events.some(function(q){ return q.kind === 'enter' && q.char === e.char && q.at <= e.at; })){
      p.push(e.char + ' ' + e.kind + 's before entering');
    }
  });
  var lastOf = {};
  plan.events.forEach(function(e){
    if (!e.char) return;
    var prev = lastOf[e.char];
    if (!prev || e.at + e.dur >= prev.at + prev.dur) lastOf[e.char] = e;
  });
  Object.keys(lastOf).forEach(function(k){
    if (!EXIT_KINDS[lastOf[k].kind]) p.push(k + ' is stranded on stage — last beat is ' + lastOf[k].kind);
  });
  if (!(plan.duration > 0)) p.push('scene has no duration');
  if (plan.duration > SCENE_HARD_MAX) p.push('scene is ' + plan.duration + 'ms, past the runaway bound');
  return p;
}

/* The launch self-check: cheap enough to run on every open. */
function selfCheck(words){
  var problems = [];
  normalizeWords(words || []).forEach(function(w){
    var z = zapOptions(w, 3);
    if (z.length !== 3 || z.filter(function(x){ return x === w; }).length !== 1) problems.push(w + ': Zap choices are wrong');
    if (!isPermutationOf(scramble(w), w)) problems.push(w + ': Build crystals do not make the word');
    var keys = blastKeys(w);
    if (!w.split('').every(function(ch){ return keys.indexOf(ch) !== -1; })) problems.push(w + ': Blast keys cannot spell it');
  });
  for (var n = 1; n <= 12; n++) CHAR_ORDER.forEach(function(k){
    var plan = planScene({ letters: n, lead: k });
    var v = validatePlan(plan);
    if (v.length) problems.push('scene ' + plan.id + ' (' + n + '): ' + v[0]);
  });
  return problems;
}

var __CORE = {
  DEFAULT_WORDS:DEFAULT_WORDS, MAX_WORDS:MAX_WORDS, cleanWord:cleanWord, normalizeWords:normalizeWords,
  parseWordInput:parseWordInput, addWords:addWords, removeWord:removeWord,
  rng:rng, shuffle:shuffle, pickOne:pickOne, hashStr:hashStr,
  LETTER_SOUND:LETTER_SOUND, A_SOUND_CHOICES:A_SOUND_CHOICES, E_SOUND_CHOICES:E_SOUND_CHOICES, letterSound:letterSound,
  WORD_BANK:WORD_BANK, zapOptions:zapOptions, scramble:scramble, isPermutationOf:isPermutationOf,
  missingSlots:missingSlots, missingChoices:missingChoices, blastKeys:blastKeys,
  activitiesFor:activitiesFor, blankStat:blankStat, normalizeStat:normalizeStat, recordBlast:recordBlast, reviewQueue:reviewQueue,
  PLANETS:PLANETS, planetFor:planetFor, weekId:weekId, nextPlanet:nextPlanet,
  CHARS:CHARS, CHAR_ORDER:CHAR_ORDER, ABILITY_OWNER:ABILITY_OWNER, MAX_LEAN:MAX_LEAN, rotBudgetFor:rotBudgetFor, exitDirsFor:exitDirsFor,
  BABY_COLORS:BABY_COLORS, BABY_NAMES:BABY_NAMES, makeBaby:makeBaby,
  SETTINGS_VERSION:SETTINGS_VERSION, normalizeSettings:normalizeSettings, letterOverrides:letterOverrides,
  BEAT:BEAT, SCENES:SCENES, TAKE_KINDS:TAKE_KINDS, EXIT_KINDS:EXIT_KINDS,
  SCENE_TARGET_MIN:SCENE_TARGET_MIN, SCENE_TARGET_MAX:SCENE_TARGET_MAX, SCENE_HARD_MAX:SCENE_HARD_MAX,
  eligibleScenes:eligibleScenes, pickScene:pickScene, pickLead:pickLead, remember:remember,
  planScene:planScene, validatePlan:validatePlan, selfCheck:selfCheck
};
if (typeof module !== 'undefined' && module.exports) module.exports = __CORE;
