/* ============================================================
   SPELLOSAURUS — CORE   (pure, DOM-free; exercised by tests/core.mjs)

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

/*
  SPELL CHECK: the word and two believable misspellings — the mistakes
  children really make (a swapped pair, the wrong vowel, a letter left
  out or doubled). Never a real word, so nothing right is marked wrong.
*/
var SWAP_VOWEL = { A:'E', E:'I', I:'E', O:'U', U:'O', Y:'I' };
function misspellings(word, n, rnd){
  var w = cleanWord(word), r = rnd || Math.random, out = [], bank = {};
  WORD_BANK.forEach(function(x){ bank[x] = 1; });
  var cand = [];
  for (var i = 0; i < w.length - 1; i++) if (w[i] !== w[i + 1]) cand.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  for (var j = 0; j < w.length; j++) if (SWAP_VOWEL[w[j]]) cand.push(w.slice(0, j) + SWAP_VOWEL[w[j]] + w.slice(j + 1));
  if (w.length >= 3) for (var k = 1; k < w.length; k++) cand.push(w.slice(0, k) + w.slice(k + 1));
  for (var m = 1; m < w.length; m++) if (!VOWELS[w[m]] && w[m] !== w[m - 1] && w[m] !== w[m + 1]) cand.push(w.slice(0, m + 1) + w[m] + w.slice(m + 1));
  [['AI', 'E'], ['EE', 'EA'], ['EA', 'EE'], ['CK', 'K'], ['OO', 'U'], ['WH', 'W'], ['TH', 'F'], ['OU', 'OW'], ['OW', 'OU'], ['AY', 'AI'], ['IGH', 'I']].forEach(function(p){
    var at = w.indexOf(p[0]); if (at !== -1) cand.push(w.slice(0, at) + p[1] + w.slice(at + p[0].length));
  });
  shuffle(cand, r).forEach(function(c){ if (c !== w && c.length >= 2 && !bank[c] && out.indexOf(c) === -1 && out.length < (n || 2)) out.push(c); });
  var fill = 0;
  while (out.length < (n || 2) && fill++ < 50){
    var x = w + String.fromCharCode(65 + Math.floor(r() * 26));
    if (!bank[x] && out.indexOf(x) === -1) out.push(x);
  }
  return out;
}
function checkOptions(word, rnd){ return shuffle([cleanWord(word)].concat(misspellings(word, 2, rnd)), rnd); }

/*
  RHYME TIME uses hand-picked families of words that really rhyme. A rule
  on spelling alone would teach eye-rhymes that don't rhyme at all (COME /
  HOME, GOOD / FOOD), so a word outside these families simply does not get
  this activity.
*/
var RHYME_FAMILIES = {
  AT:'CAT BAT HAT SAT MAT THAT FLAT', AN:'CAN MAN RAN VAN FAN PAN', AP:'MAP CAP NAP TAP CLAP', AG:'BAG TAG RAG FLAG',
  ED:'BED RED FED SLED', EN:'TEN PEN HEN MEN THEN WHEN', ET:'GET LET NET PET WET SET YET JET', IG:'BIG PIG DIG WIG',
  IN:'WIN PIN FIN TIN SPIN', IT:'SIT HIT BIT FIT KIT', IP:'SHIP TRIP DIP HIP LIP ZIP', OG:'DOG FOG LOG FROG HOG JOG',
  OP:'TOP HOP MOP STOP SHOP POP', OT:'HOT POT GOT LOT NOT DOT SPOT', UG:'BUG HUG MUG RUG JUG', UN:'RUN SUN FUN BUN',
  UMP:'JUMP BUMP LUMP PUMP DUMP', ACK:'BACK PACK SACK TRACK', ICK:'PICK KICK SICK STICK QUICK', OCK:'ROCK SOCK LOCK CLOCK BLOCK',
  ELL:'WELL TELL SELL BELL SMELL SPELL', ILL:'HILL WILL FILL STILL', ALL:'ALL BALL CALL FALL TALL WALL SMALL',
  AKE:'CAKE MAKE TAKE LAKE BAKE SNAKE', ATE:'GATE LATE PLATE SKATE', AME:'GAME CAME SAME NAME', INE:'FINE LINE MINE NINE SHINE',
  IKE:'BIKE LIKE HIKE', IDE:'RIDE SIDE HIDE WIDE SLIDE', OAT:'BOAT GOAT COAT', EE:'SEE TREE FREE BEE THREE',
  AY:'DAY PLAY SAY WAY STAY MAY AWAY', ING:'KING RING SING THING WING', IGHT:'NIGHT LIGHT RIGHT BRIGHT MIGHT',
  OON:'MOON SOON SPOON NOON', OOK:'BOOK LOOK TOOK COOK', EAT:'EAT SEAT HEAT MEAT', EEP:'SLEEP SHEEP DEEP KEEP',
  OWE:'GROW SNOW SHOW SLOW LOW', OWW:'COW HOW NOW WOW', AND:'HAND LAND SAND BAND', EST:'BEST REST NEST TEST WEST',
  OLD:'COLD GOLD TOLD OLD HOLD', IND:'FIND KIND MIND', OUND:'FOUND ROUND SOUND GROUND', OUSE:'HOUSE MOUSE',
  AIN:'RAIN TRAIN MAIN PAIN', EAR:'HEAR NEAR YEAR DEAR', OOD:'GOOD WOOD HOOD STOOD'
};
var RHYME_OF = {};
Object.keys(RHYME_FAMILIES).forEach(function(k){ RHYME_FAMILIES[k].split(' ').forEach(function(w){ RHYME_OF[w] = k; }); });
/* the spelled ending that rhymes (for highlighting), e.g. JUMP -> UMP, GROW -> OW */
function rimeOf(word){
  var f = RHYME_OF[cleanWord(word)];
  if (!f) return '';
  return f.replace(/[EW]$/, function(c){ return f === 'OWE' || f === 'OWW' ? '' : c; }).replace(/^OW.$/, 'OW');
}
function hasRhyme(word){ return !!RHYME_OF[cleanWord(word)]; }
/* one real rhyme and two that are not, preferring ones that start alike */
function rhymeOptions(word, rnd){
  var w = cleanWord(word), r = rnd || Math.random, fam = RHYME_OF[w];
  if (!fam) return null;
  var yes = shuffle(RHYME_FAMILIES[fam].split(' ').filter(function(x){ return x !== w; }), r)[0];
  var all = Object.keys(RHYME_OF).filter(function(x){ return RHYME_OF[x] !== fam && x !== w; });
  var no = shuffle(all, r).sort(function(a, b){ return (b[0] === w[0]) - (a[0] === w[0]); }).slice(0, 2);
  return { answer: yes, options: shuffle([yes].concat(no), r) };
}

/* LETTER RACE: the word's letters plus a few strays, floating about */
function raceLetters(word, rnd){
  var w = cleanWord(word), r = rnd || Math.random, have = {}, extra = [];
  w.split('').forEach(function(c){ have[c] = 1; });
  var pool = [];
  for (var i = 0; i < 26; i++){ var c = String.fromCharCode(65 + i); if (!have[c]) pool.push(c); }
  extra = shuffle(pool, r).slice(0, Math.min(4, Math.max(2, 7 - w.length)));
  return shuffle(w.split('').concat(extra), r);
}

/* ---------------- mastery & the order of activities ---------------- */
/*
  Level 0  new:       MEET -> ZAP   -> BUILD            -> BLAST
  Level 1  familiar:  MEET -> RACE  -> MISSING          -> BLAST
  Level 2  strong:    MEET -> CHECK -> RHYME or MISSING -> BLAST
  Level 3  mastered:  MEET -> RACE or CHECK (taking turns) -> RHYME or MISSING -> BLAST
  The scaffold comes away as he earns it; the from-memory BLAST never does.
  Each level has something new, so a known word still feels fresh.
*/
function activitiesFor(level, stat, word){
  var l = Math.max(0, Number(level) || 0);
  var rhymeOrMissing = word && hasRhyme(word) ? 'rhyme' : 'missing';
  if (l === 0) return ['meet', 'zap', 'build', 'blast'];
  if (l === 1) return ['meet', 'race', 'missing', 'blast'];
  if (l === 2) return ['meet', 'check', rhymeOrMissing, 'blast'];
  var turn = ((stat && stat.plays) || 0) % 2 ? 'check' : 'race';
  return ['meet', turn, rhymeOrMissing, 'blast'];
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

/* ---------------- Dino Island: one spot per word ----------------
   Daytime places on the island, each with its own sky and ground. Never
   purple or pink: the crew's colours have to read on every one of them. */
var LANDS = [
  { id:'jungle',  name:'Jungle Grove',   sky:['#8FD6FF', '#D8F3FF'], ground:'#3FAE55', rim:'#8EE06A', rock:'#1E6E36', glow:'#B6FF6A', icon:'🌴' },
  { id:'volcano', name:'Volcano Valley', sky:['#FFB36B', '#FFE3B8'], ground:'#8C4A2F', rim:'#FF8A1F', rock:'#4E2A1C', glow:'#FF6A1F', icon:'🌋' },
  { id:'beach',   name:'Sandy Beach',    sky:['#6FC8FF', '#CFF1FF'], ground:'#F0CF7A', rim:'#FFF1B8', rock:'#B8873A', glow:'#FFE08A', icon:'🏖️' },
  { id:'falls',   name:'Fern Falls',     sky:['#7CD3E8', '#D9FAF2'], ground:'#2FA37A', rim:'#9FF0C8', rock:'#1A6B50', glow:'#8FFFE0', icon:'💦' },
  { id:'swamp',   name:'Muddy Swamp',    sky:['#9ED8C2', '#E4F5D8'], ground:'#6B7F3A', rim:'#B5CC6A', rock:'#3E4A20', glow:'#D6F07A', icon:'🐸' },
  { id:'snow',    name:'Snowy Peak',     sky:['#A8DCFF', '#EEF8FF'], ground:'#E6F3FF', rim:'#FFFFFF', rock:'#8FB8D8', glow:'#CFEFFF', icon:'🏔️' },
  { id:'canyon',  name:'Rocky Canyon',   sky:['#FFC98A', '#FFF0D6'], ground:'#C9763B', rim:'#FFB06B', rock:'#7A3E1A', glow:'#FFC53D', icon:'🪨' },
  { id:'cave',    name:'Crystal Cave',   sky:['#1C4E6B', '#3E8FA8'], ground:'#34C9B8', rim:'#B9FFF4', rock:'#16847A', glow:'#9CFFF0', icon:'💎' }
];
/* This week's trail: each word is a different spot on the island, starting
   from a place chosen per week, so a new list feels like a new adventure. */
function landFor(index, offset){
  var n = LANDS.length;
  return LANDS[(((index + (offset || 0)) % n) + n) % n];
}
function weekId(words){ return 'w' + hashStr((words || []).join(',')).toString(36); }

/* ---------------- the crew ---------------- */
/*
  SPECIES own the moves; a MEMBER is one particular dinosaur of a species.
  The six originals are members too (Rex, Trike, Dash, Swoop, Stretch and
  Spike), and every baby that hatches becomes a member with its own name,
  colours and one signature POWER on top of its species' moves.

    rex     — T. rex with a jet pack. Jet boosts, a ROAR that shakes letters
              loose, a tail whip, a chomping chase. Arms far too short.
    trike   — Triceratops. Ground-bound and strong: paws, charges, scoops
              letters on his horns, STOMPS, stacks, tows, boosts a buddy.
    dash    — Raptor. Speed and spring: blurs past, skids, spin-dashes into a
              whirlwind, lassos letters, leaps for high ones.
    swoop   — Pterosaur. Flight: dives, loops, gives rides, hooks letters off
              a line with a rope and hook.
    brachio — Stretch the brachiosaurus. Slow and tall: a neck that
              stretches up like a crane, and a neck that is a slide.
    stego   — Spike the stegosaurus. Back plates that carry letters like a
              rack, and a spiky tail that flips them up onto them.
*/
var CHARS = {
  rex:     { key:'rex',     name:'Rex',     species:'T. rex',        airborne:true,  falls:true,  spins:false, walks:true,  color:'#3FBF4F', hold:'mouth' },
  trike:   { key:'trike',   name:'Trike',   species:'triceratops',   airborne:false, falls:true,  spins:false, walks:true,  color:'#2F7BF5', hold:'horns' },
  dash:    { key:'dash',    name:'Dash',    species:'raptor',        airborne:false, falls:true,  spins:true,  walks:true,  color:'#FF8A1F', hold:'arms' },
  swoop:   { key:'swoop',   name:'Swoop',   species:'pterosaur',     airborne:true,  falls:false, spins:true,  walks:false, color:'#E53935', hold:'feet' },
  brachio: { key:'brachio', name:'Stretch', species:'brachiosaurus', airborne:false, falls:true,  spins:false, walks:true,  color:'#F2B233', hold:'back' },
  stego:   { key:'stego',   name:'Spike',   species:'stegosaurus',   airborne:false, falls:true,  spins:false, walks:true,  color:'#1FB5A8', hold:'plates' }
};
var CHAR_ORDER = ['rex', 'trike', 'dash', 'swoop', 'brachio', 'stego'];
var KINDS = CHAR_ORDER;
/* who was in the crew before Stretch and Spike arrived */
var FIRST_FOUR = ['rex', 'trike', 'dash', 'swoop'];

/* Signature powers: every baby hatches with one. */
var POWERS = {
  lasso:  { id:'lasso',  name:'Lasso',         icon:'🤠', says:'swings a lasso' },
  bubble: { id:'bubble', name:'Bubble Blower', icon:'🫧', says:'blows giant bubbles' },
  magnet: { id:'magnet', name:'Super Magnet',  icon:'🧲', says:'pulls letters with a magnet' },
  tunnel: { id:'tunnel', name:'Tunnel Digger', icon:'⛏️', says:'digs tunnels' },
  frost:  { id:'frost',  name:'Frost Breath',  icon:'❄️', says:'freezes letters into ice' },
  vine:   { id:'vine',   name:'Vine Swinger',  icon:'🌿', says:'swings on jungle vines' }
};
var POWER_ORDER = ['lasso', 'bubble', 'magnet', 'tunnel', 'frost', 'vine'];

/*
  Who may do what. A move belongs to species (and sometimes to a power as
  well): the planner will never let a dinosaur borrow a move that is not
  his, which is what keeps every character readable.
*/
var WALKERS = ['rex', 'trike', 'dash', 'brachio', 'stego'];
var ABILITY = {
  roar:{ kinds:['rex'] }, tailwhip:{ kinds:['rex'] }, reach:{ kinds:['rex'] }, jetgrab:{ kinds:['rex'] },
  scatter:{ kinds:['rex'] }, chomp:{ kinds:['rex'] },
  paw:{ kinds:['trike'] }, charge:{ kinds:['trike'] }, stomp:{ kinds:['trike'] }, scoop:{ kinds:['trike'] },
  backcatch:{ kinds:['trike'] }, hitch:{ kinds:['trike'] }, tow:{ kinds:['trike'] }, boost:{ kinds:['trike'] },
  pickup:{ kinds:['trike'] },
  zoom:{ kinds:['dash'] }, spindash:{ kinds:['dash'] }, skid:{ kinds:['dash'] }, dashpass:{ kinds:['dash'] },
  orbit:{ kinds:['dash'] }, sweep:{ kinds:['dash'] }, jumpgrab:{ kinds:['dash'] },
  lasso:{ kinds:['dash'], power:'lasso' },
  dive:{ kinds:['swoop'] }, loop:{ kinds:['swoop'] }, glide:{ kinds:['swoop'] }, ride:{ kinds:['swoop'] }, hook:{ kinds:['swoop'] },
  crane:{ kinds:['brachio'] }, neckslide:{ kinds:['brachio'] }, nosedown:{ kinds:['brachio'] },
  liftdown:{ kinds:['brachio'] },
  tailflip:{ kinds:['stego'] }, platewalk:{ kinds:['stego'] }, platecatch:{ kinds:['stego'] },
  thump:{ kinds:['brachio', 'stego'] }, haul:{ kinds:['trike', 'brachio', 'stego'] },
  ropewalk:{ kinds:WALKERS }, ropepick:{ kinds:WALKERS }, ropejump:{ kinds:WALKERS },
  vault:{ kinds:['rex', 'dash'] }, hopon:{ kinds:['rex', 'dash'] }, liftgrab:{ kinds:['rex', 'dash'] },
  bubble:{ power:'bubble' }, magnet:{ power:'magnet' }, pull:{ power:'magnet' },
  dig:{ power:'tunnel' }, popup:{ power:'tunnel' },
  frost:{ power:'frost' }, slide:{ power:'frost' },
  vine:{ power:'vine' }, vineswing:{ power:'vine' }, vinegrab:{ power:'vine' }
};
/* kept for tools that ask "whose move is this" of a single-species move */
var ABILITY_OWNER = {};
Object.keys(ABILITY).forEach(function(k){ var a = ABILITY[k]; if (a.kinds && a.kinds.length === 1 && !a.power) ABILITY_OWNER[k] = a.kinds[0]; });
function canUse(member, ability){
  var rule = ABILITY[ability];
  if (!rule) return true;
  if (!member) return false;
  if (rule.kinds && rule.kinds.indexOf(member.kind) !== -1) return true;
  return !!(rule.power && member.power === rule.power);
}
/*
  RESCUES: when a letter falls, the buddy who saves it does it his own way.
  Each way names the move it needs; running over and catching it (fetch)
  is open to everyone, so there is always somebody who can help.
*/
var RESCUE_NEEDS = { lasso:'lasso', magnet:'pull', bubble:'bubble', hook:'hook', crane:'crane', tailflip:'tailflip',
  tunnel:'popup', frost:'slide', jet:'jetgrab', horns:'scoop', fetch:null };
var RESCUE_ORDER = ['lasso', 'magnet', 'bubble', 'hook', 'crane', 'tailflip', 'tunnel', 'frost', 'jet', 'horns'];
/* his own special way when he has one (a power first, it is the rarer
   sight), and now and then a plain run-and-catch for contrast */
function rescueMethod(member, rnd){
  var r = rnd || Math.random;
  var own = RESCUE_ORDER.filter(function(m){ return canUse(member, RESCUE_NEEDS[m]); });
  if (!own.length) return 'fetch';
  var power = own.filter(function(m){ var n = ABILITY[RESCUE_NEEDS[m]]; return n && n.power && member.power === n.power; });
  if (power.length && r() < 0.7) return power[0];
  return r() < 0.85 ? own[Math.floor(r() * own.length) % own.length] : 'fetch';
}
var MAX_LEAN = 30;
function rotBudgetFor(key){ var c = CHARS[key]; return c && c.spins ? Infinity : (c && c.falls ? 110 : MAX_LEAN); }
function exitDirsFor(key){ var c = CHARS[key]; return c && c.airborne ? ['up', 'left', 'right'] : ['left', 'right']; }

/* ---------------- levels and growing up ---------------- */
/*
  Every scene a dinosaur is in earns experience; levels bring new moves
  (rope tricks at 2, tightrope and team-ups at 3) and, for a baby, growing
  up: baby at levels 1–2, kid at 3–4, fully grown at 5. Everyone starts at
  level 1 — the originals too — so every new trick is something he earned.
*/
var LEVEL_XP = [0, 6, 16, 32, 56];
var MAX_LEVEL = LEVEL_XP.length;
var ORIGINAL_START_XP = 0;
function levelFor(xp){ var x = Math.max(0, Number(xp) || 0), l = 0; LEVEL_XP.forEach(function(t){ if (x >= t) l++; }); return Math.max(1, l); }
function xpToNext(xp){ var l = levelFor(xp); return l >= MAX_LEVEL ? 0 : LEVEL_XP[l] - Math.max(0, Number(xp) || 0); }
function growFor(member, level){
  if (member && member.orig) return 'grown';
  var l = level || 1;
  return l <= 2 ? 'baby' : (l <= 4 ? 'kid' : 'grown');
}
var GROW_SCALE = { baby: 0.68, kid: 0.84, grown: 1 };
var XP_LEAD = 3, XP_SUPPORT = 1, XP_LAND = 1;

/* ---------------- baby dinos: the collection ---------------- */
var BABY_COLORS = ['#3FBF4F', '#2F7BF5', '#FF8A1F', '#E53935', '#FFC53D', '#1FB5A8', '#7A8BA6', '#1E88E5', '#FF6A3D', '#2ECC71'];
var BABY_SPOTS = ['#FFFFFF', '#0B2A66', '#FFE08A', '#14532D', '#FF8A1F', '#9FE3FF'];
var BABY_NAMES = ['Chomp', 'Pebble', 'Rocket', 'Sprout', 'Nugget', 'Bolt', 'Comet', 'Biscuit', 'Tank', 'Zippy', 'Nacho', 'Boulder',
  'Scout', 'Blaze', 'Pickle', 'Turbo', 'Fizz', 'Crunch', 'Waffle', 'Gizmo', 'Stomper', 'Jet', 'Rusty', 'Pip', 'Moose', 'Ziggy',
  'Taco', 'Flint', 'Buster', 'Cosmo', 'Spud', 'Diesel', 'Noodle', 'Ranger', 'Bonk', 'Echo'];
/* Babies hatched before Stretch and Spike (generation 1) are drawn from the
   old lists, so nobody he already has changes into somebody else. */
var BABY_KINDS_1 = ['rex', 'trike', 'dash', 'swoop'];
var POWERS_1 = ['lasso', 'bubble', 'magnet', 'tunnel', 'frost'];
var BABY_KINDS = CHAR_ORDER;
var BABY_GEN = 2;
/* the golden egg's baby: a gold coat and white spots, whatever its kind */
var GOLD = { body: '#FFC21A', spots: '#FFFFFF' };
/* A baby is fully determined by its seed, its generation and whether it came
   from a golden egg. The power is drawn last, so the babies hatched before
   powers existed keep every other feature. */
function makeBaby(seed, gen, gold){
  var r = rng(seed), g = gen >= 2 ? 2 : 1;
  var body = pickOne(BABY_COLORS, r), spots = pickOne(BABY_SPOTS, r);
  if (spots === body) spots = '#FFFFFF';
  var b = { id: (gold ? 'g' : 'b') + (seed >>> 0).toString(36), kind: pickOne(g === 2 ? BABY_KINDS : BABY_KINDS_1, r), body: body, spots: spots,
            name: pickOne(BABY_NAMES, r), pattern: pickOne(['spots', 'stripes', 'plain'], r), hat: pickOne(['none', 'helmet', 'cap', 'none'], r) };
  b.power = pickOne(g === 2 ? POWER_ORDER : POWERS_1, r);
  b.gen = g;
  if (gold){ b.gold = true; b.body = GOLD.body; b.spots = GOLD.spots; b.pattern = 'spots'; }
  return b;
}
function babyOf(rec){ return makeBaby(rec.seed, rec.gen || 1, !!rec.gold); }

/* ---------------- members: originals and babies as one list ---------------- */
function originalMember(key){
  var c = CHARS[key];
  return { id: key, kind: key, name: c.name, orig: true, body: null, spots: null, pattern: null, power: null };
}
/* Everyone he has: the six originals, then every baby in hatching order. */
function allMembers(settings){
  var out = CHAR_ORDER.map(originalMember), seen = {};
  ((settings && settings.babies) || []).forEach(function(rec){
    var b = babyOf(rec);
    if (seen[b.id]) return;
    seen[b.id] = 1;
    out.push({ id: b.id, kind: b.kind, name: b.name, orig: false, body: b.body, spots: b.spots, pattern: b.pattern, power: b.power,
               seed: rec.seed >>> 0, gen: b.gen, gold: !!b.gold });
  });
  return out;
}
/* A member with everything the stage and the screens need to know. */
function memberInfo(settings, id){
  var list = allMembers(settings), m = null;
  list.forEach(function(x){ if (x.id === id) m = x; });
  if (!m) return null;
  var xp = settings && settings.crew && settings.crew[id] != null ? settings.crew[id] : (m.orig ? ORIGINAL_START_XP : 0);
  var level = levelFor(xp);
  var grow = growFor(m, level);
  var out = {};
  Object.keys(m).forEach(function(k){ out[k] = m[k]; });
  out.xp = xp; out.level = level; out.grow = grow; out.scale = GROW_SCALE[grow];
  var hat = settings && settings.gear && settings.gear[id];
  out.hat = hat && gearUnlocked(settings.fossils || 0).indexOf(hat) !== -1 ? hat : null;
  return out;
}
function rosterMembers(settings){
  return ((settings && settings.roster) || CHAR_ORDER.slice(0, ROSTER_SIZE)).map(function(id){ return memberInfo(settings, id); }).filter(Boolean);
}
var ROSTER_SIZE = 4;
/* Put a member into the crew in place of another (both by id). */
function swapRoster(roster, outId, inId){
  var r = (roster || []).slice(), i = r.indexOf(outId);
  if (i === -1 || r.indexOf(inId) !== -1) return r;
  r[i] = inId;
  return r;
}
/* Experience for a scene: the lead gets the most, everyone in it some. */
function awardScene(crew, plan){
  var c = {};
  Object.keys(crew || {}).forEach(function(k){ c[k] = crew[k]; });
  var inIt = {};
  (plan && plan.events || []).forEach(function(e){ [e.char, e.other, e.leader].forEach(function(k){ if (k) inIt[k] = 1; }); });
  var ups = [];
  Object.keys(inIt).forEach(function(id){
    var before = c[id] == null ? (CHARS[id] ? ORIGINAL_START_XP : 0) : c[id];
    var after = before + (id === plan.lead ? XP_LEAD : XP_SUPPORT);
    c[id] = after;
    if (levelFor(after) > levelFor(before)) ups.push({ id: id, level: levelFor(after) });
  });
  return { crew: c, ups: ups };
}
function awardLand(crew, roster){
  var c = {};
  Object.keys(crew || {}).forEach(function(k){ c[k] = crew[k]; });
  var ups = [];
  (roster || []).forEach(function(id){
    var before = c[id] == null ? (CHARS[id] ? ORIGINAL_START_XP : 0) : c[id];
    c[id] = before + XP_LAND;
    if (levelFor(c[id]) > levelFor(before)) ups.push({ id: id, level: levelFor(c[id]) });
  });
  return { crew: c, ups: ups };
}

/* ---------------- fossils and dress-up ----------------
   Every island spot he finishes digs up a fossil, and calming the volcano
   at the end of the week digs up three more. Fossils are never spent: the
   more he has, the more hats and gear there are to dress the crew in. */
var FOSSIL_LAND = 1, FOSSIL_BOSS = 3;
var GEAR = [
  { id:'party',     name:'Party Hat',      fossils:0 },
  { id:'cowboy',    name:'Cowboy Hat',     fossils:3 },
  { id:'shades',    name:'Cool Shades',    fossils:6 },
  { id:'propeller', name:'Propeller Cap',  fossils:10 },
  { id:'pirate',    name:'Pirate Hat',     fossils:15 },
  { id:'chef',      name:'Chef Hat',       fossils:20 },
  { id:'knight',    name:'Knight Helmet',  fossils:26 },
  { id:'flower',    name:'Flower Crown',   fossils:32 },
  { id:'crown',     name:'Royal Crown',    fossils:40 }
];
function gearUnlocked(fossils){ return GEAR.filter(function(g){ return (fossils || 0) >= g.fossils; }).map(function(g){ return g.id; }); }
function nextGear(fossils){ var n = null; GEAR.forEach(function(g){ if (!n && g.fossils > (fossils || 0)) n = g; }); return n; }

/* A grown-up can give any word an example sentence; the word must be in it. */
function normalizeSentences(obj, words){
  var out = {};
  if (!obj || typeof obj !== 'object') return out;
  (words || []).forEach(function(w){
    var t = String(obj[w] == null ? '' : obj[w]).replace(/\s+/g, ' ').trim().slice(0, 140);
    if (t && sentenceHas(t, w)) out[w] = t;
  });
  return out;
}
function sentenceHas(text, word){
  var w = cleanWord(word);
  return String(text || '').split(/[^A-Za-z]+/).some(function(t){ return t.toUpperCase() === w; });
}

/* ---------------- settings, repaired on the way in ---------------- */
var SETTINGS_VERSION = 3;
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
  var gs = typeof wk.goldSeed === 'number' ? wk.goldSeed >>> 0 : null;
  var week = wk.id === id
    ? { id: id, done: (Array.isArray(wk.done) ? wk.done : []).filter(function(i){ return i >= 0 && i < words.length && Math.floor(i) === i; }),
        offset: Math.max(0, Math.floor(Number(wk.offset) || 0)) % LANDS.length, finale: !!wk.finale, eggs: eggs,
        goldSeed: gs, goldHatched: !!wk.goldHatched && gs != null }
    : { id: id, done: [], offset: hashStr(id) % LANDS.length, finale: false, eggs: {}, goldSeed: null, goldHatched: false };
  var seenDone = {};
  week.done = week.done.filter(function(i){ if (seenDone[i]) return false; seenDone[i] = 1; return true; });
  var babies = (Array.isArray(o.babies) ? o.babies : []).filter(function(b){ return b && typeof b.seed === 'number'; })
    .slice(-200).map(function(b){
      var rec = { seed: b.seed >>> 0, at: Number(b.at) || 0 };
      if (b.gen >= 2) rec.gen = 2;
      if (b.gold) rec.gold = true;
      return rec;
    });
  var sceneIds = {};
  SCENES.forEach(function(s){ sceneIds[s.id] = 1; });
  /* the crew: experience per member, and the four he takes on missions */
  var valid = {};
  allMembers({ babies: babies }).forEach(function(m){ valid[m.id] = 1; });
  var crew = {};
  if (o.crew && typeof o.crew === 'object') Object.keys(o.crew).forEach(function(k){
    var x = Math.floor(Number(o.crew[k]));
    if (valid[k] && x >= 0 && isFinite(x)) crew[k] = x;
  });
  var roster = [], inR = {};
  (Array.isArray(o.roster) ? o.roster : []).forEach(function(id){ if (valid[id] && !inR[id] && roster.length < ROSTER_SIZE){ roster.push(id); inR[id] = 1; } });
  CHAR_ORDER.forEach(function(id){ if (roster.length < ROSTER_SIZE && !inR[id]){ roster.push(id); inR[id] = 1; } });
  /* fossils: a week's rocket part from before the island counts as a boss win */
  var fossils = Math.max(Math.floor(Number(o.fossils) || 0), Math.floor(Number(o.parts) || 0) * FOSSIL_BOSS, 0);
  var open = gearUnlocked(fossils), gear = {};
  if (o.gear && typeof o.gear === 'object') Object.keys(o.gear).forEach(function(k){
    if (valid[k] && open.indexOf(o.gear[k]) !== -1) gear[k] = o.gear[k];
  });
  return {
    v: SETTINGS_VERSION, words: words, stats: stats, week: week, babies: babies,
    crew: crew, roster: roster, fossils: fossils, gear: gear, metNew: !!o.metNew,
    sentences: normalizeSentences(o.sentences, words),
    aSound: A_SOUND_CHOICES.indexOf(o.aSound) !== -1 ? o.aSound : LETTER_SOUND.A,
    eSound: E_SOUND_CHOICES.indexOf(o.eSound) !== -1 ? o.eSound : LETTER_SOUND.E,
    sfx: o.sfx !== false, music: o.music !== false,
    sceneHistory: (Array.isArray(o.sceneHistory) ? o.sceneHistory : []).filter(function(x){ return sceneIds[histId(x)]; }).slice(0, 12),
    leadHistory: (Array.isArray(o.leadHistory) ? o.leadHistory : []).filter(function(x){ return valid[x]; }).slice(0, 8)
  };
}
function letterOverrides(s){ return { A: (s && s.aSound) || LETTER_SOUND.A, E: (s && s.eSound) || LETTER_SOUND.E }; }
/* Next island spot to visit: the first not yet done, else -1 (the finale). */
function nextLand(week, count){
  for (var i = 0; i < count; i++) if ((week.done || []).indexOf(i) === -1) return i;
  return -1;
}

/* ============================================================
   SCENES — planned as data, executed by the stage.

   A scene names its lead by what he must be (a species, anyone, or a
   power), the level he needs, and anything it needs from the rest of the
   crew (a flyer for Tug of War, a jumper for Boost Jump). Events name
   crew MEMBERS, so two raptors can share a scene and a baby can lead one.
   ============================================================ */
/*
  Beat lengths in ms. Scenes are shows, not transitions: every grab is slow
  enough to see what happened, and nobody runs off the screen in a blur
  (the stage also caps how fast anyone may travel on the way out).
*/
var BEAT = {
  enter:900, approach:520, exit:1100, roar:1000, snatch:700, reach:700, tailwhip:700,
  paw:700, stomp:760, charge:1700, scoop:320, backcatch:700, skid:520, zoom:1500, sweep:260,
  spindash:1500, orbit:300, dive:900, loop:900, glide:2000, ride:320, wave:600,
  toss:700, catch:360, grab:420, tug:900, pop:480,
  fall:700, getup:520, carry:900, cheer:640, notice:420, march:2200, follow:2200,
  lasso:1300, hitch:760, tow:2300, stringline:1100, jetgrab:850, hook:1000, jumpgrab:950,
  boost:1100, vault:950, rigrope:1200, ropepick:280, wobble:1000, ropejump:800, anchor:600,
  bubble:1300, magnet:900, pull:800, dig:900, popup:760, frost:1100, slide:760, react:800,
  slip:600, rescue:3000, showoff:1300, victory:1000,
  scatter:1400, chomp:1150, pickup:1250, haul:2000, crane:2000, thump:900, neckslide:2300,
  hopon:1000, liftgrab:1700, liftdown:1100, tailflip:1500, platewalk:1400, platecatch:700,
  vine:1100, vineswing:2000, vinegrab:400, geyser:1300
};
/* scenes are shows, not transitions: long enough for a six-year-old to
   enjoy the dinosaurs doing their thing, capped so practice keeps moving */
var SCENE_TARGET_MIN = 4500, SCENE_TARGET_MAX = 22000, SCENE_HARD_MAX = 30000;
var TAKE_KINDS = { snatch:1, tailwhip:1, scoop:1, backcatch:1, sweep:1, orbit:1, dive:1, ride:1, catch:1, carry:1, follow:1,
  lasso:1, hitch:1, jetgrab:1, hook:1, jumpgrab:1, vault:1, ropepick:1, bubble:1, pull:1, popup:1, slide:1, rescue:1,
  chomp:1, pickup:1, crane:1, neckslide:1, liftgrab:1, tailflip:1, platecatch:1, vinegrab:1, geyser:1 };
/* Beats that let go of a letter someone had (it must then be taken again). */
var RELEASE_KINDS = { slip:1 };
/* Beats that leave the character off stage. */
var EXIT_KINDS = { exit:1, charge:1, zoom:1, glide:1, carry:1, march:1, tow:1 };

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
function sideDir(i){ return (Math.abs(i) % 2) ? 'left' : 'right'; }

/* A buddy who comes to watch: stands on the far side, gasps and cheers,
   and leaves with the lead. Only for scenes where nothing flies sideways. */
function addWatcher(tl, c, from, to){
  var w = c.watcher;
  if (!w) return;
  tl.push(from, BEAT.enter, 'enter', { char:w, side:'far', stay:'edge' });
  var mid = from + BEAT.enter + Math.max(0, (to - from - BEAT.enter) * 0.45);
  tl.push(mid, BEAT.react, 'react', { char:w, mood:'gasp' });
  tl.push(Math.max(mid + BEAT.react, to - BEAT.react), BEAT.react, 'react', { char:w, mood:'cheer' });
  tl.push(Math.max(mid + BEAT.react, to - BEAT.react) + BEAT.react, BEAT.exit, 'exit', { char:w, dir:c.exitFor(w, 3) });
}

/* A fumble: a letter slips, and a buddy comes to the rescue in his own way
   (a lasso, a magnet, a bubble, a hook, a long neck, a tail flip...). With
   `give`, he hands it back to whoever dropped it; otherwise he takes it off
   himself. Returns when the rescue is over. */
function wantFumble(c){ return c.fumbler && c.letters >= 3 && c.r() < 0.6; }
function addFumble(tl, c, letter, at, dir, give){
  var H = c.fumbler;
  tl.push(Math.max(0, at - 900), BEAT.enter, 'enter', { char:H, side:'far', stay:'edge' });
  tl.push(at, BEAT.slip, 'slip', { letter:letter });
  var r0 = at + 350;
  tl.push(r0, BEAT.rescue, 'rescue', { char:H, letter:letter, method:c.rescueFor(H), give:give || null });
  tl.push(r0 + BEAT.rescue, BEAT.exit, 'exit', { char:H, dir:dir || c.exitFor(H, 0) });
  return r0 + BEAT.rescue;
}
/* the end of a carrying scene: walk on with the load; perhaps the top one
   wobbles off, a buddy rescues it and hands it back, and off they go */
function haulAndGo(tl, c, t, top, dir, chance){
  var L = c.lead;
  tl.push(t, BEAT.haul, 'haul', { char:L, dir:dir });
  t += BEAT.haul;
  var fumble = c.fumbler && c.letters >= 2 && c.r() < chance;
  if (fumble){
    var end = addFumble(tl, c, top, t - 500, c.exitFor(c.fumbler, 1), L);
    tl.push(t - 200, BEAT.react, 'react', { char:L, mood:'gasp' });
    t = end - 300;
    tl.push(t, BEAT.react, 'react', { char:L, mood:'cheer' });
    t += BEAT.react;
  } else {
    tl.push(t, BEAT.cheer, 'cheer', { char:L });
    t += BEAT.cheer;
  }
  tl.push(t, BEAT.exit, 'exit', { char:L, dir:dir });
  return { t: t, fumble: fumble };
}

var SCENES = [

  /* ---------- REX ---------- */
  /* He roars; the letters shake loose and float; he jets up and snatches each. */
  { id:'roar-float', name:'Big Roar', lead:{ kind:'rex' }, weight:10, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.roar, 'roar', { char:L }); t += BEAT.roar + 200;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 700, BEAT.snatch, 'snatch', { char:L, letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 700 + BEAT.snatch;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:'up' });
    addWatcher(tl, c, 300, last + BEAT.cheer);
    return tl;
  } },

  /* He can't reach. Tiny arms. So: the tail. */
  { id:'tiny-arms', name:'Tiny Arms', lead:{ kind:'rex' }, weight:9, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){
      tl.push(t, BEAT.approach, 'approach', { char:L, letter:i }); t += BEAT.approach;
      if (i === 0){ tl.push(t, BEAT.reach, 'reach', { char:L, letter:i }); t += BEAT.reach; }
      tl.push(t, BEAT.tailwhip, 'tailwhip', { char:L, letter:i, dir: sideDir(i) }); t += BEAT.tailwhip;
    }
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'up' });
    return tl;
  } },

  /* A little roar and the letters hop down and scurry off, giggling. He
     chases them round and chomps each one up. */
  { id:'chomp-chase', name:'Chomp Chase', lead:{ kind:'rex' }, weight:10, min:2, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.scatter, 'scatter', { char:L }); t += BEAT.scatter;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.chomp, 'chomp', { char:L, letter:i }); t += BEAT.chomp; }
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'up' });
    addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* The letters leap up onto a line strung high across the sky; Rex jets
     up under each one and grabs it in his jaws. */
  { id:'jet-jump', name:'Jet Jump', lead:{ kind:'rex' }, level:2, weight:9, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter - 200;
    tl.push(t, BEAT.stringline, 'stringline', {}); t += BEAT.stringline;
    /* sometimes his first big twang of the line knocks the far letter off */
    var fumble = wantFumble(c), far = c.letters - 1;
    var grabs = fumble ? c.letters - 1 : c.letters;
    for (var i = 0; i < grabs; i++) tl.push(t + i * 900, BEAT.jetgrab, 'jetgrab', { char:L, letter:(fumble ? c.letters - 2 : c.letters - 1) - i });
    if (fumble) addFumble(tl, c, far, t + BEAT.jetgrab * 0.6, 'right');
    var last = t + Math.max(0, grabs - 1) * 900 + BEAT.jetgrab;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:'up' });
    if (!fumble) addWatcher(tl, c, 400, last + BEAT.cheer);
    return tl;
  } },

  /* ---------- TRIKE ---------- */
  { id:'stomp-charge', name:'Stomp & Charge', lead:{ kind:'trike' }, weight:9, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.stomp, 'stomp', { char:L, mode:'drop' }); t += BEAT.stomp + 300;
    /* he backs up, paws the ground, snorts... paws again... and CHARGE */
    tl.push(t, BEAT.paw, 'paw', { char:L }); t += BEAT.paw;
    tl.push(t, BEAT.paw, 'paw', { char:L }); t += BEAT.paw + 200;
    var run = BEAT.charge + c.letters * 120;
    tl.push(t, run, 'charge', { char:L, dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 300 + i * Math.floor((run - 600) / Math.max(1, c.letters)), BEAT.scoop, 'scoop', { char:L, letter:c.letters - 1 - i });
    return tl;
  } },

  /* STOMP & STACK: one stomp and the letters tumble to the ground. He picks
     each one up on his horns and stacks them into a tower — last letter
     first, so the word reads top to bottom — then sets off with it. The
     top one may wobble off, and a buddy saves it and puts it back. */
  { id:'stomp-stack', name:'Stomp & Stack', lead:{ kind:'trike' }, weight:12, min:2, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.stomp, 'stomp', { char:L, mode:'drop' }); t += BEAT.stomp + 400;
    for (var k = 0; k < c.letters; k++){ tl.push(t, BEAT.pickup, 'pickup', { char:L, letter:c.letters - 1 - k }); t += BEAT.pickup; }
    var end = haulAndGo(tl, c, t, 0, 'right', 0.85);
    if (!end.fumble) addWatcher(tl, c, 300, end.t);
    return tl;
  } },

  { id:'bounce-catch', name:'Bounce House', lead:{ kind:'trike' }, weight:8, min:2, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.stomp, 'stomp', { char:L, mode:'launch' }); t += BEAT.stomp;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 520, BEAT.backcatch, 'backcatch', { char:L, letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 520 + BEAT.backcatch;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:'left' });
    addWatcher(tl, c, 200, last + BEAT.cheer);
    return tl;
  } },

  /* Tow truck: he backs up to each letter and ties it on with a rope, then
     drives off towing the whole word behind him like a train. */
  { id:'tow-truck', name:'Tow Truck', lead:{ kind:'trike' }, level:2, weight:9, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.hitch, 'hitch', { char:L, letter:i }); t += BEAT.hitch; }
    t += 200;
    tl.push(t, BEAT.tow + c.letters * 150, 'tow', { char:L, dir:'right' });
    /* a knot comes undone as he pulls away; a buddy saves the letter */
    if (wantFumble(c)) addFumble(tl, c, 0, t + 500, 'right');
    return tl;
  } },

  /* Team-up: the letters hang high on a line. The buddy runs up Trike's
     back, Trike flicks his head, and the buddy sails up to grab a letter. */
  { id:'boost-jump', name:'Boost Jump', lead:{ kind:'trike' }, level:3, weight:9, min:1,
    needs: function(c){ return !!c.find(function(m){ return m.kind === 'dash' || m.kind === 'rex'; }); },
    build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    var P = c.find(function(m){ return m.kind === 'dash' || m.kind === 'rex'; }).id;
    tl.push(t, BEAT.enter, 'enter', { char:L });
    tl.push(t + 150, BEAT.enter, 'enter', { char:P, side:'far' }); t += BEAT.enter + 150;
    tl.push(t - 250, BEAT.stringline, 'stringline', {}); t += BEAT.stringline - 250;
    for (var k = 0; k < c.letters; k++){
      var i = c.letters - 1 - k;
      tl.push(t, BEAT.boost, 'boost', { char:L, other:P, letter:i });
      tl.push(t + 140, BEAT.vault, 'vault', { char:P, other:L, letter:i });
      t += BEAT.boost + 100;
    }
    tl.push(t, BEAT.react, 'react', { char:L, mood:'cheer' });
    tl.push(t, BEAT.cheer, 'cheer', { char:P });
    tl.push(t + BEAT.react, BEAT.exit, 'exit', { char:L, dir:'left' });
    tl.push(t + BEAT.cheer, BEAT.exit, 'exit', { char:P, dir:'right' });
    return tl;
  } },

  /* ---------- DASH ---------- */
  { id:'speed-sweep', name:'Speed Sweep', lead:{ kind:'dash' }, weight:10, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    /* a warm-up lap: across, skid, back, skid — then the real run */
    tl.push(t, 900, 'dashpass', { char:L }); t += 900;
    tl.push(t, BEAT.skid, 'skid', { char:L }); t += BEAT.skid;
    tl.push(t, 900, 'dashpass', { char:L }); t += 900;
    tl.push(t, BEAT.skid, 'skid', { char:L }); t += BEAT.skid;
    var missed = c.letters >= 3 ? c.letters - 1 : -1;
    var takeN = missed === -1 ? c.letters : c.letters - 1;
    if (missed === -1){
      tl.push(t, BEAT.zoom, 'zoom', { char:L, dir:'right' });
      for (var i = 0; i < takeN; i++) tl.push(t + 150 + i * 130, BEAT.sweep, 'sweep', { char:L, letter:i });
      return tl;
    }
    tl.push(t, 900, 'dashpass', { char:L });
    for (var j = 0; j < takeN; j++) tl.push(t + 120 + j * 120, BEAT.sweep, 'sweep', { char:L, letter:j });
    t += 900;
    tl.push(t, BEAT.skid, 'skid', { char:L }); t += BEAT.skid;
    tl.push(t, BEAT.notice, 'notice', { char:L, letter:missed }); t += BEAT.notice + 200;
    tl.push(t, BEAT.zoom, 'zoom', { char:L, dir:'left' });
    tl.push(t + 180, BEAT.sweep, 'sweep', { char:L, letter:missed });
    return tl;
  } },

  { id:'whirlwind', name:'Whirlwind', lead:{ kind:'dash' }, weight:8, min:2, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    var spin = Math.max(2600, 250 + c.letters * 220 + BEAT.orbit + 1100);
    tl.push(t, spin, 'spindash', { char:L });
    for (var i = 0; i < c.letters; i++) tl.push(t + 250 + i * 220, BEAT.orbit, 'orbit', { char:L, letter:i });
    addWatcher(tl, c, 300, t + spin);
    t += spin;
    tl.push(t, BEAT.zoom, 'zoom', { char:L, dir:'left' });
    return tl;
  } },

  /* Yee-haw: he swings a lasso, ropes each letter and reels it in. */
  { id:'lasso-roundup', name:'Lasso Round-up', lead:{ kind:'dash', power:'lasso' }, level:2, powerLevel:1, weight:10, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.lasso, 'lasso', { char:L, letter:i }); t += BEAT.lasso - 200; }
    t += 200;
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* The letters hang on a line up high; he takes a run-up and leaps for each. */
  { id:'high-jump', name:'High Jump', lead:{ kind:'dash' }, level:2, weight:9, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter - 200;
    tl.push(t, BEAT.stringline, 'stringline', {}); t += BEAT.stringline;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.jumpgrab, 'jumpgrab', { char:L, letter:i }); t += BEAT.jumpgrab; }
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    addWatcher(tl, c, 400, t);
    return tl;
  } },

  /* ---------- SWOOP ---------- */
  { id:'dive-bomb', name:'Dive Bomb', lead:{ kind:'swoop' }, weight:10, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 1500, BEAT.dive, 'dive', { char:L, letter:i });
    var last = t + Math.max(0, c.letters - 1) * 1500 + BEAT.dive;
    tl.push(last, BEAT.loop, 'loop', { char:L });
    tl.push(last + BEAT.loop, BEAT.exit, 'exit', { char:L, dir:'up' });
    addWatcher(tl, c, 300, last + BEAT.loop);
    return tl;
  } },

  { id:'joy-ride', name:'Joy Ride', lead:{ kind:'swoop' }, weight:8, min:2, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.wave, 'wave', { char:L }); t += BEAT.wave;
    var run = BEAT.glide + c.letters * 160;
    tl.push(t, run, 'glide', { char:L, dir:'right' });
    var step = Math.floor((run - 700) / Math.max(1, c.letters));
    for (var i = 0; i < c.letters; i++) tl.push(t + 200 + i * step, BEAT.ride, 'ride', { char:L, letter:c.letters - 1 - i });
    /* the first one aboard bounces off as he picks up speed */
    if (wantFumble(c)) addFumble(tl, c, c.letters - 1, t + 200 + (c.letters - 1) * step + BEAT.ride + 160, 'right');
    return tl;
  } },

  /* He flies over trailing a rope with a hook, hooks each letter off the
     ground and flies away with the word dangling beneath him. */
  { id:'sky-hook', name:'Sky Hook', lead:{ kind:'swoop' }, level:2, weight:9, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.hook, 'hook', { char:L, letter:i }); t += BEAT.hook; }
    /* on the way up the bottom letter wriggles loose, and a buddy saves it */
    var fumble = wantFumble(c);
    if (fumble){ addFumble(tl, c, c.letters - 1, t + 200, c.exitFor(c.fumbler, 1)); t += 600; }
    tl.push(t, BEAT.exit + 400, 'exit', { char:L, dir:'up' });
    if (!fumble) addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* ---------- STRETCH (brachiosaurus) ---------- */
  /* CRANE NECK: he plods in, stretches his neck right up to each letter,
     plucks it gently and lowers it onto his back. */
  { id:'crane-lift', name:'Crane Neck', lead:{ kind:'brachio' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.crane, 'crane', { char:L, letter:i }); t += BEAT.crane; }
    var end = c.letters >= 3 ? haulAndGo(tl, c, t, 0, 'right', 0.5) : null;
    if (!end){
      tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
      tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    }
    if (!end || !end.fumble) addWatcher(tl, c, 300, end ? end.t : t);
    return tl;
  } },

  /* NECK SLIDE: a thump of his tail and the letters tumble down. He puts
     his nose to each one, lifts his head high, and — wheee — it slides all
     the way down his neck onto his back. */
  { id:'neck-slide', name:'Neck Slide', lead:{ kind:'brachio' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.thump, 'thump', { char:L }); t += BEAT.thump + 300;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.neckslide, 'neckslide', { char:L, letter:i }); t += BEAT.neckslide; }
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* Team-up: a buddy hops up onto Stretch's head, and Stretch lifts him
     right up to each letter like a crane, so he can grab it. */
  { id:'neck-lift', name:'Neck Lift', lead:{ kind:'brachio' }, level:3, weight:10, min:1,
    needs: function(c){ return !!c.find(function(m){ return m.kind === 'dash' || m.kind === 'rex'; }); },
    build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    var P = c.find(function(m){ return m.kind === 'dash' || m.kind === 'rex'; }).id;
    tl.push(t, BEAT.enter, 'enter', { char:L });
    tl.push(t + 200, BEAT.enter, 'enter', { char:P, side:'far' }); t += BEAT.enter + 300;
    tl.push(t, BEAT.hopon, 'hopon', { char:P, other:L }); t += BEAT.hopon;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.liftgrab, 'liftgrab', { char:P, other:L, letter:i }); t += BEAT.liftgrab; }
    tl.push(t, BEAT.liftdown, 'liftdown', { char:L, other:P }); t += BEAT.liftdown;
    tl.push(t, BEAT.cheer, 'cheer', { char:P });
    tl.push(t, BEAT.react, 'react', { char:L, mood:'cheer' });
    tl.push(t + BEAT.cheer, BEAT.exit, 'exit', { char:P, dir:'left' });
    tl.push(t + BEAT.react, BEAT.exit, 'exit', { char:L, dir:'right' });
    return tl;
  } },

  /* ---------- SPIKE (stegosaurus) ---------- */
  /* LETTER RAIN: he plods along right under the letters, and one by one
     they drop off onto his back plates like a letter rack. */
  { id:'letter-rain', name:'Letter Rain', lead:{ kind:'stego' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L, stay:'edge' }); t += BEAT.enter;
    var gap = 950, walk = BEAT.platewalk + c.letters * gap;
    tl.push(t, walk, 'platewalk', { char:L, dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 700 + i * gap, BEAT.platecatch, 'platecatch', { char:L, letter:i });
    t += walk;
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* TAIL FLIP: a thump and the letters tumble down. He backs his spiky tail
     up to each one and flips it high over his head onto his plates. */
  { id:'tail-flip', name:'Tail Flip', lead:{ kind:'stego' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.thump, 'thump', { char:L }); t += BEAT.thump + 300;
    for (var i = 0; i < c.letters; i++){ tl.push(t, BEAT.tailflip, 'tailflip', { char:L, letter:i }); t += BEAT.tailflip; }
    var end = c.letters >= 3 ? haulAndGo(tl, c, t, 0, 'right', 0.5) : null;
    if (!end){
      tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
      tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    }
    if (!end || !end.fumble) addWatcher(tl, c, 300, end ? end.t : t);
    return tl;
  } },

  /* ---------- anyone who walks ---------- */
  /* A tightrope strung across the sky; the letters sit on it. He wobbles
     across, picking them up, nearly falls, and a buddy holds the rope. */
  { id:'tightrope', name:'Tightrope', lead:{ walks:true }, level:3, weight:4, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead, H = c.helper;
    tl.push(t, BEAT.enter, 'enter', { char:L, stay:'edge' });
    if (H) tl.push(t + 150, BEAT.enter, 'enter', { char:H, side:'far', stay:'edge' });
    t += BEAT.enter + 150;
    tl.push(t - 250, BEAT.rigrope, 'rigrope', {}); t += BEAT.rigrope - 250;
    if (H) tl.push(t - BEAT.anchor, BEAT.anchor, 'anchor', { char:H });
    var walk = 1100 + c.letters * 650 + BEAT.wobble;
    tl.push(t, walk, 'ropewalk', { char:L, dir:'right' });
    var wob = Math.min(c.letters - 1, Math.floor(c.letters / 2));
    var tt = t + 850;
    for (var i = 0; i < c.letters; i++){
      tl.push(tt, BEAT.ropepick, 'ropepick', { char:L, letter:i });
      tt += 650;
      if (i === wob){
        tl.push(tt - 250, BEAT.wobble, 'wobble', { char:L });
        if (H) tl.push(tt - 120, BEAT.react, 'react', { char:H, mood:'gasp' });
        tt += BEAT.wobble;
      }
    }
    t += walk;
    tl.push(t, BEAT.ropejump, 'ropejump', { char:L, dir:'right' });
    tl.push(t + BEAT.ropejump, BEAT.exit, 'exit', { char:L, dir:'right' });
    if (H){
      tl.push(t, BEAT.react, 'react', { char:H, mood:'cheer' });
      tl.push(t + BEAT.react, BEAT.exit, 'exit', { char:H, dir:c.exitFor(H, 1) });
    }
    return tl;
  } },

  /* ---------- signature powers (babies) ---------- */
  { id:'bubble-float', name:'Bubble Float', lead:{ power:'bubble' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 700, BEAT.bubble, 'bubble', { char:L, letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 700 + BEAT.bubble;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:c.exitFor(L, 0) });
    addWatcher(tl, c, 300, last + BEAT.cheer);
    return tl;
  } },
  { id:'magnet-pull', name:'Super Magnet', lead:{ power:'magnet' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.magnet, 'magnet', { char:L }); t += BEAT.magnet - 200;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 560, BEAT.pull, 'pull', { char:L, letter:c.letters - 1 - i });
    var last = t + Math.max(0, c.letters - 1) * 560 + BEAT.pull;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:c.exitFor(L, 1) });
    addWatcher(tl, c, 300, last + BEAT.cheer);
    return tl;
  } },
  { id:'tunnel-pop', name:'Tunnel Pop', lead:{ power:'tunnel' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    for (var i = 0; i < c.letters; i++){
      tl.push(t, BEAT.dig, 'dig', { char:L, letter:i }); t += BEAT.dig;
      tl.push(t, BEAT.popup, 'popup', { char:L, letter:i }); t += BEAT.popup;
    }
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:c.exitFor(L, 2) });
    addWatcher(tl, c, 300, t);
    return tl;
  } },
  { id:'frost-slide', name:'Frost Slide', lead:{ power:'frost' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.frost, 'frost', { char:L }); t += BEAT.frost;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 560, BEAT.slide, 'slide', { char:L, letter:i });
    var last = t + Math.max(0, c.letters - 1) * 560 + BEAT.slide;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:c.exitFor(L, 3) });
    addWatcher(tl, c, 300, last + BEAT.cheer);
    return tl;
  } },
  /* VINE SWING: a jungle vine drops from the treetops; he grabs it and
     swings right across, snatching every letter on the way. */
  { id:'vine-swing', name:'Vine Swing', lead:{ power:'vine' }, weight:12, min:1, watch:true, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L, stay:'edge' }); t += BEAT.enter;
    tl.push(t, BEAT.vine, 'vine', { char:L }); t += BEAT.vine;
    var swing = BEAT.vineswing + c.letters * 260;
    tl.push(t, swing, 'vineswing', { char:L, dir:'right' });
    /* the swing's path is fixed in advance, so each grab is timed to the
       moment he sweeps past that letter */
    for (var i = 0; i < c.letters; i++) tl.push(t + Math.round(swing * (0.18 + 0.62 * (c.letters > 1 ? i / (c.letters - 1) : 0.5))), BEAT.vinegrab, 'vinegrab', { char:L, letter:i });
    t += swing;
    tl.push(t, BEAT.cheer, 'cheer', { char:L }); t += BEAT.cheer;
    tl.push(t, BEAT.exit, 'exit', { char:L, dir:'right' });
    addWatcher(tl, c, 300, t);
    return tl;
  } },

  /* ---------- anyone ---------- */
  /* GEYSER SURPRISE: he stamps on a steaming spot, and one by one a geyser
     whooshes each letter up out of the card and over into his arms. */
  { id:'geyser-pop', name:'Geyser Surprise', lead:{}, weight:3, min:1, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, BEAT.wave, 'wave', { char:L }); t += BEAT.wave;
    for (var i = 0; i < c.letters; i++) tl.push(t + i * 800, BEAT.geyser, 'geyser', { letter:i, other:L });
    var last = t + Math.max(0, c.letters - 1) * 800 + BEAT.geyser;
    tl.push(last, BEAT.cheer, 'cheer', { char:L });
    tl.push(last + BEAT.cheer, BEAT.exit, 'exit', { char:L, dir:c.exitFor(L, 1) });
    return tl;
  } },

  { id:'toss-relay', name:'Toss Relay', lead:{}, weight:3, min:2, needs: function(c){ return c.others.length >= 1; }, build: function(c){
    var tl = makeTimeline(), t = 0, a = c.lead, b = c.others[0];
    tl.push(t, BEAT.enter, 'enter', { char:a });
    tl.push(t + 150, BEAT.enter, 'enter', { char:b, side:'far' }); t += BEAT.enter + 150;
    for (var k = 0; k < c.letters; k++){
      var i = c.letters - 1 - k;
      tl.push(t, BEAT.toss, 'toss', { char:a, other:b, letter:i });
      tl.push(t + BEAT.toss - 60, BEAT.catch, 'catch', { char:b, letter:i });
      t += 620;
    }
    t += BEAT.catch;
    tl.push(t, BEAT.cheer, 'cheer', { char:b });
    tl.push(t, BEAT.exit, 'exit', { char:a, dir:c.exitFor(a, 1) });
    tl.push(t + BEAT.cheer, BEAT.exit, 'exit', { char:b, dir:c.exitFor(b, 2) });
    return tl;
  } },

  /* Two grab the same letter. Tug. It pops loose — and a flyer swoops in. */
  { id:'tug-pop', name:'Tug of War', lead:{}, weight:3, min:2,
    needs: function(c){ return !!c.tugTeam(); },
    build: function(c){
    var tl = makeTimeline(), t = 0, team = c.tugTeam();
    var a = team[0], b = team[1], f = team[2];
    tl.push(t, BEAT.enter, 'enter', { char:a });
    tl.push(t, BEAT.enter, 'enter', { char:b, side:'far' }); t += BEAT.enter;
    tl.push(t, BEAT.grab, 'grab', { char:a, letter:0 });
    tl.push(t, BEAT.grab, 'grab', { char:b, letter:0 }); t += BEAT.grab;
    tl.push(t, BEAT.tug * 1.8, 'tug', { char:a, other:b, letter:0 }); t += BEAT.tug * 1.8;
    tl.push(t, BEAT.pop, 'pop', { letter:0 });
    tl.push(t, BEAT.fall, 'fall', { char:a });
    tl.push(t, BEAT.fall, 'fall', { char:b }); t += BEAT.fall;
    tl.push(t - 300, BEAT.enter, 'enter', { char:f });
    tl.push(t, BEAT.dive, 'dive', { char:f, letter:0 });
    tl.push(t, BEAT.getup, 'getup', { char:a });
    tl.push(t, BEAT.getup, 'getup', { char:b }); t += BEAT.getup;
    var tt = t;
    for (var i = 1; i < c.letters; i++){
      var who = i % 2 ? a : b;
      tl.push(tt, BEAT.carry, 'carry', { char:who, letter:i, dir: who === a ? 'left' : 'right' });
      tt += 420;
    }
    if (c.letters < 3) tl.push(t, BEAT.exit, 'exit', { char:b, dir:'right' });
    tl.push(t - BEAT.getup + BEAT.dive, BEAT.exit, 'exit', { char:f, dir:'up' });
    return tl;
  } },

  { id:'dino-parade', name:'Dino Parade', lead:{}, weight:2, min:2, build: function(c){
    var tl = makeTimeline(), t = 0, L = c.lead;
    tl.push(t, BEAT.enter, 'enter', { char:L }); t += BEAT.enter;
    tl.push(t, 1700, 'parade', { char:L, count:c.letters }); t += 1700;
    var march = BEAT.march + 1000 + c.letters * 220;
    tl.push(t, march, 'march', { char:L, dir:'right' });
    for (var i = 0; i < c.letters; i++) tl.push(t + 60 + i * 70, march - 60 - i * 70, 'follow', { leader:L, letter:i, dir:'right' });
    return tl;
  } }
];
var SCENE_BY_ID = {};
SCENES.forEach(function(s){ SCENE_BY_ID[s.id] = s; });

/* ---------------- the cast a plan is made from ---------------- */
function defaultCast(){
  return CHAR_ORDER.map(function(k){ var m = originalMember(k); m.level = levelFor(ORIGINAL_START_XP); return m; });
}
function castOf(opts){
  var list = (opts && opts.cast && opts.cast.length) ? opts.cast : defaultCast();
  return list.filter(function(m){ return m && CHARS[m.kind]; }).map(function(m){
    return { id: m.id, kind: m.kind, power: m.power || null, level: m.level || 1, name: m.name || CHARS[m.kind].name };
  });
}
/* May this member lead this scene? */
function canLead(scene, m){
  var need = scene.lead || {};
  var byKind = need.kind && m.kind === need.kind, byPower = need.power && m.power === need.power;
  var byWalk = need.walks && CHARS[m.kind].walks;
  var open = !need.kind && !need.power && !need.walks;
  if (!(open || byKind || byPower || byWalk)) return false;
  var lvl = byPower && !byKind ? (scene.powerLevel || 1) : (scene.level || 1);
  return (m.level || 1) >= lvl;
}
function sceneCtx(lead, cast, letters, r){
  var others = shuffle(cast.filter(function(m){ return m.id !== lead.id; }), r);
  var ctx = {
    letters: letters, lead: lead.id, leadMember: lead, cast: cast,
    others: others.map(function(m){ return m.id; }),
    find: function(pred){ for (var i = 0; i < others.length; i++) if (pred(others[i])) return others[i]; return null; },
    kindOf: function(id){ for (var i = 0; i < cast.length; i++) if (cast[i].id === id) return cast[i].kind; return null; },
    exitFor: function(id, i){ var d = exitDirsFor(ctx.kindOf(id)); return d[Math.abs(i) % d.length]; },
    /* two who can grab and fall over, and a different one who can dive; the lead is one of them */
    tugTeam: function(){
      var walkers = cast.filter(function(m){ return m.kind !== 'swoop' && CHARS[m.kind].falls; });
      var flyers = cast.filter(function(m){ return m.kind === 'swoop'; });
      if (lead.kind === 'swoop'){
        var w2 = walkers.filter(function(m){ return m.id !== lead.id; });
        return w2.length >= 2 ? [w2[0].id, w2[1].id, lead.id] : null;
      }
      if (!CHARS[lead.kind].falls) return null;
      var mates = walkers.filter(function(m){ return m.id !== lead.id; });
      var fl = flyers.filter(function(m){ return m.id !== lead.id; });
      return mates.length && fl.length ? [lead.id, mates[0].id, fl[0].id] : null;
    }
  };
  ctx.memberOf = function(id){ for (var i = 0; i < cast.length; i++) if (cast[i].id === id) return cast[i]; return null; };
  /* how a buddy saves a dropped letter: his own way, or the way a test asked for */
  ctx.rescueFor = function(id){
    var m = ctx.memberOf(id);
    if (ctx.forceRescue && (RESCUE_NEEDS[ctx.forceRescue] === null || canUse(m, RESCUE_NEEDS[ctx.forceRescue]))) return ctx.forceRescue;
    return rescueMethod(m, ctx.r);
  };
  ctx.helper = ctx.find(function(m){ return m.kind !== 'swoop'; }) ? ctx.find(function(m){ return m.kind !== 'swoop'; }).id : null;
  ctx.fumbler = others.length ? others[others.length - 1].id : null;
  ctx.r = r || Math.random;
  return ctx;
}
function eligibleScenes(lead, letters, cast){
  var n = Math.max(0, Math.floor(Number(letters) || 0));
  var cs = cast || defaultCast();
  var m = typeof lead === 'object' && lead ? lead : null;
  if (!m){ cs.forEach(function(x){ if (x.id === lead) m = x; }); }
  if (!m){ var k = CHARS[lead] ? lead : CHAR_ORDER[0]; m = { id: k, kind: k, level: levelFor(ORIGINAL_START_XP) }; }
  return SCENES.filter(function(s){
    if (n < (s.min || 1) || !canLead(s, m)) return false;
    return !s.needs || s.needs(sceneCtx(m, cs, n, rng(1)));
  });
}
/* history entries are scene ids, with "~m" when it was played mirrored */
function histId(h){ return String(h).split('~')[0]; }
function histMirror(h){ return /~m$/.test(String(h)); }
function histEntry(plan){ return plan.id + (plan.mirror ? '~m' : ''); }
function pickScene(lead, letters, history, rnd, cast, signature){
  var r = rnd || Math.random, pool = eligibleScenes(lead, letters, cast);
  if (!pool.length) return null;
  /* a showcase: only scenes that are his own (his species or his power) */
  if (signature){
    var own = pool.filter(function(sc){ var n = sc.lead || {}; return n.kind || n.power; });
    if (own.length) pool = own;
  }
  var windows = [10, 6, 3, 1];
  for (var w = 0; w < windows.length; w++){
    var recent = (history || []).slice(0, windows[w]).map(histId);
    var fresh = pool.filter(function(s){ return recent.indexOf(s.id) === -1; });
    if (fresh.length >= 2 || (fresh.length && windows[w] === 1)){ pool = fresh; break; }
  }
  /* a new move he has just learned gets its moment: power and rope scenes weigh more */
  var total = 0; pool.forEach(function(s){ total += s.weight || 1; });
  var roll = r() * total;
  for (var i = 0; i < pool.length; i++){ roll -= pool[i].weight || 1; if (roll <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
/* Insert a beat for the lead, pushing everything from that moment on later. */
function addFlourish(tl, id, kind){
  var ev = tl.events, mine = ev.filter(function(e){ return e.char === id; });
  var at = null;
  if (kind === 'showoff'){
    var en = mine.filter(function(e){ return e.kind === 'enter'; })[0];
    if (!en || en.stay) return;
    at = en.at + en.dur;
  } else {
    var last = mine.slice().sort(function(a, b){ return (b.at + b.dur) - (a.at + a.dur); })[0];
    if (!last || last.kind !== 'exit') return;
    at = last.at;
  }
  var D = BEAT[kind];
  ev.forEach(function(e){ if (e.at >= at && !(kind === 'showoff' && e.kind === 'enter' && e.char === id)) e.at += D; });
  tl.push(at, D, kind, { char: id });
}

/* The member who has waited longest for a turn in the lead. */
function pickLead(history, rnd, ids){
  var r = rnd || Math.random, h = history || [], best = [], bestAge = -1;
  (ids && ids.length ? ids : CHAR_ORDER).forEach(function(k){
    var at = h.indexOf(k), age = at === -1 ? 1e6 : at;
    if (age > bestAge){ best = [k]; bestAge = age; } else if (age === bestAge) best.push(k);
  });
  return best[Math.floor(r() * best.length) % best.length];
}
function remember(list, item, cap){ return [item].concat((list || []).filter(function(x){ return x !== item; })).slice(0, cap || 8); }

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
  /* a scene already at full length is not stretched past it */
  if (k > 1) k = Math.min(k, Math.max(1, SCENE_TARGET_MAX / end));
  if (end * k > SCENE_HARD_MAX) k = SCENE_HARD_MAX / end;
  tl.events.forEach(function(e){ e.at = Math.round(e.at * k); e.dur = Math.max(60, Math.round(e.dur * k)); });
  return tl.end();
}

/*
  Plan one scene. opts: { letters, lead (member id), cast (members), history,
  rnd, forceId, mirror, tempo }. The library scene is the skeleton; the
  variation on top is who leads, who helps, who watches, mirrored or not
  and a touch faster or slower.
*/
function planScene(opts){
  opts = opts || {};
  var letters = Math.max(0, Math.floor(Number(opts.letters) || 0));
  var r = opts.rnd || Math.random;
  var cast = castOf(opts);
  var lead = null;
  cast.forEach(function(m){ if (m.id === opts.lead) lead = m; });
  if (!lead) lead = cast[0];
  var mirror = opts.mirror == null ? r() < 0.5 : !!opts.mirror;
  /* unhurried, so a six-year-old can follow every move */
  var tempo = opts.tempo == null ? 1.04 + r() * 0.1 : Number(opts.tempo) || 1;
  var members = {};
  cast.forEach(function(m){ members[m.id] = { kind: m.kind, power: m.power, level: m.level, name: m.name }; });
  var plan = { id:null, name:null, lead:lead.id, letters:letters, cast:cast.map(function(m){ return m.id; }), members:members,
               events:[], duration:0, mirror:mirror, tempo:tempo };
  if (!letters) return plan;
  var scene = null;
  if (opts.forceId && SCENE_BY_ID[opts.forceId]){
    var f = SCENE_BY_ID[opts.forceId];
    if (letters >= (f.min || 1) && canLead(f, lead) && (!f.needs || f.needs(sceneCtx(lead, cast, letters, rng(1))))) scene = f;
  }
  if (!scene) scene = pickScene(lead, letters, opts.history || [], r, cast, !!opts.signature);
  if (!scene) return plan;
  /* a scene that has to come round again soon is played the other way round */
  if (opts.mirror == null){
    var hist = (opts.history || []).slice(0, 10);
    for (var hi = 0; hi < hist.length; hi++) if (histId(hist[hi]) === scene.id){ plan.mirror = mirror = !histMirror(hist[hi]); break; }
  }
  var ctx = sceneCtx(lead, cast, letters, r);
  /* about half the solo scenes bring a buddy along to watch */
  ctx.watcher = scene.watch && ctx.others.length && (opts.watcher != null ? opts.watcher : r() < 0.7) ? ctx.others[0] : null;
  if (opts.fumbler && opts.fumbler !== lead.id && ctx.others.indexOf(opts.fumbler) !== -1) ctx.fumbler = opts.fumbler;
  if (opts.fumble === false) ctx.fumbler = null;
  if (opts.fumble === true) ctx.r = function(){ return 0; };
  if (opts.rescue && RESCUE_NEEDS.hasOwnProperty(opts.rescue)) ctx.forceRescue = opts.rescue;
  var tl = scene.build(ctx);
  /* the lead's own flourishes: showing off as he arrives, a victory move before he goes */
  if (opts.showoff !== false && (opts.showoff === true || r() < 0.9)) addFlourish(tl, lead.id, 'showoff');
  if (opts.victory !== false && (opts.victory === true || r() < 0.75)) addFlourish(tl, lead.id, 'victory');
  /* a scene that would be over in a blink gets both flourishes */
  if (tl.end() < 9000){
    if (opts.showoff !== false && !tl.events.some(function(e){ return e.kind === 'showoff'; })) addFlourish(tl, lead.id, 'showoff');
    if (opts.victory !== false && !tl.events.some(function(e){ return e.kind === 'victory'; })) addFlourish(tl, lead.id, 'victory');
  }
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
  var members = plan.members || {};
  function memberOf(id){ return members[id] || (CHARS[id] ? { kind: id, power: null } : null); }
  /* in time order: a letter is taken, maybe let go, taken again — and must end up taken exactly once */
  var taken = {}, ordered = plan.events.slice().sort(function(a, b){ return a.at - b.at; });
  ordered.forEach(function(e){
    if (e.letter == null) return;
    if (TAKE_KINDS[e.kind]) taken[e.letter] = (taken[e.letter] || 0) + 1;
    else if (RELEASE_KINDS[e.kind] && taken[e.letter] > 0) taken[e.letter]--;
  });
  for (var i = 0; i < plan.letters; i++){
    if (!taken[i]) p.push('letter ' + i + ' is never taken');
    else if (taken[i] > 1) p.push('letter ' + i + ' is taken ' + taken[i] + ' times');
  }
  plan.events.forEach(function(e){
    [e.char, e.other, e.leader].forEach(function(id){ if (id && !memberOf(id)) p.push('unknown crew member ' + id); });
    if (!e.char || !memberOf(e.char)) return;
    var m = memberOf(e.char);
    if (!canUse(m, e.kind)) p.push(e.char + ' (' + CHARS[m.kind].name + ' kind' + (m.power ? ', ' + m.power : '') + ') used ' + e.kind + ', which is not one of theirs');
    if (e.kind === 'fall' && !CHARS[m.kind].falls) p.push(e.char + ' does not fall');
    if (e.kind === 'rescue'){
      if (!RESCUE_NEEDS.hasOwnProperty(e.method)) p.push(e.char + ' rescues by an unknown way: ' + e.method);
      else if (RESCUE_NEEDS[e.method] && !canUse(m, RESCUE_NEEDS[e.method])) p.push(e.char + ' cannot rescue by ' + e.method);
      /* a letter handed back needs somebody still there to take it */
      if (e.give){
        var gIn = plan.events.some(function(q){ return q.kind === 'enter' && q.char === e.give && q.at <= e.at; });
        var gOut = plan.events.filter(function(q){ return q.char === e.give && EXIT_KINDS[q.kind]; })[0];
        if (!gIn || !gOut || gOut.at < e.at + e.dur) p.push(e.char + ' hands a letter to ' + e.give + ', who is not there to take it');
      }
    }
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
function selfCheck(words, cast){
  var problems = [];
  normalizeWords(words || []).forEach(function(w){
    var z = zapOptions(w, 3);
    if (z.length !== 3 || z.filter(function(x){ return x === w; }).length !== 1) problems.push(w + ': Zap choices are wrong');
    if (!isPermutationOf(scramble(w), w)) problems.push(w + ': Build crystals do not make the word');
    var keys = blastKeys(w);
    if (!w.split('').every(function(ch){ return keys.indexOf(ch) !== -1; })) problems.push(w + ': Blast keys cannot spell it');
  });
  var cs = castOf({ cast: cast });
  for (var n = 1; n <= 12; n++) cs.forEach(function(m){
    var plan = planScene({ letters: n, lead: m.id, cast: cs });
    if (!plan.id){ problems.push('no scene for ' + m.name + ' with ' + n + ' letters'); return; }
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
  misspellings:misspellings, checkOptions:checkOptions, RHYME_FAMILIES:RHYME_FAMILIES, hasRhyme:hasRhyme, rimeOf:rimeOf,
  rhymeOptions:rhymeOptions, raceLetters:raceLetters,
  activitiesFor:activitiesFor, blankStat:blankStat, normalizeStat:normalizeStat, recordBlast:recordBlast, reviewQueue:reviewQueue,
  LANDS:LANDS, landFor:landFor, weekId:weekId, nextLand:nextLand,
  CHARS:CHARS, CHAR_ORDER:CHAR_ORDER, FIRST_FOUR:FIRST_FOUR, KINDS:KINDS, ABILITY:ABILITY, ABILITY_OWNER:ABILITY_OWNER, canUse:canUse,
  RESCUE_NEEDS:RESCUE_NEEDS, RESCUE_ORDER:RESCUE_ORDER, rescueMethod:rescueMethod,
  MAX_LEAN:MAX_LEAN, rotBudgetFor:rotBudgetFor, exitDirsFor:exitDirsFor,
  POWERS:POWERS, POWER_ORDER:POWER_ORDER,
  LEVEL_XP:LEVEL_XP, MAX_LEVEL:MAX_LEVEL, ORIGINAL_START_XP:ORIGINAL_START_XP, levelFor:levelFor, xpToNext:xpToNext,
  growFor:growFor, GROW_SCALE:GROW_SCALE, XP_LEAD:XP_LEAD, XP_SUPPORT:XP_SUPPORT, XP_LAND:XP_LAND,
  BABY_COLORS:BABY_COLORS, BABY_NAMES:BABY_NAMES, BABY_KINDS_1:BABY_KINDS_1, POWERS_1:POWERS_1, BABY_GEN:BABY_GEN, GOLD:GOLD, makeBaby:makeBaby, babyOf:babyOf,
  originalMember:originalMember, allMembers:allMembers, memberInfo:memberInfo, rosterMembers:rosterMembers,
  ROSTER_SIZE:ROSTER_SIZE, swapRoster:swapRoster, awardScene:awardScene, awardLand:awardLand,
  FOSSIL_LAND:FOSSIL_LAND, FOSSIL_BOSS:FOSSIL_BOSS, GEAR:GEAR, gearUnlocked:gearUnlocked, nextGear:nextGear,
  normalizeSentences:normalizeSentences, sentenceHas:sentenceHas,
  SETTINGS_VERSION:SETTINGS_VERSION, normalizeSettings:normalizeSettings, letterOverrides:letterOverrides,
  BEAT:BEAT, SCENES:SCENES, TAKE_KINDS:TAKE_KINDS, EXIT_KINDS:EXIT_KINDS, RELEASE_KINDS:RELEASE_KINDS,
  SCENE_TARGET_MIN:SCENE_TARGET_MIN, SCENE_TARGET_MAX:SCENE_TARGET_MAX, SCENE_HARD_MAX:SCENE_HARD_MAX,
  SCENE_BY_ID:SCENE_BY_ID, defaultCast:defaultCast, castOf:castOf, canLead:canLead,
  eligibleScenes:eligibleScenes, pickScene:pickScene, pickLead:pickLead, remember:remember, histEntry:histEntry, histId:histId,
  planScene:planScene, validatePlan:validatePlan, selfCheck:selfCheck
};
if (typeof module !== 'undefined' && module.exports) module.exports = __CORE;
