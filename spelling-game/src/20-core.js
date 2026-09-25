/* ============================================================
   CORE-LOGIC-START   (pure, DOM-free — exercised by tests/core.mjs)

   Nothing in this block may touch the DOM, storage, audio or the clock.
   That is what lets the whole spelling model and the entire animation
   choreography be tested in node, without a browser and without a
   stopwatch. If a rule matters, it is expressed here so a test can hold
   it: "Blip never tumbles" is a bound on a number, not a convention
   someone has to remember while editing an animation.
   ============================================================ */

var DEFAULT_WORDS = ['THE','AND','TO','IT','IS'];

/* How many extra (decoy) letters join the real ones in the LEARN search. */
var SEARCH_EXTRA_LETTERS = 4;

/*
  Spoken names for letters. The voice is fed these strings, never the raw
  character, so iOS can never prefix "capital" and never mangles a lone
  vowel.

  A is spelled "eigh" (as in weigh, sleigh, neigh) rather than "ay". Most
  speech engines carry "ay" and "aye" in their dictionary as the
  interjection /aɪ/, which made AND spell out as "I - N - D". "eigh" has no
  dictionary entry to trip over, so the engine falls back to letter-to-sound
  rules and lands on /eɪ/. Engines still differ, so the grown-up can switch
  it on the device without editing the file.
*/
var LETTER_SOUND = {
  A:'eigh', B:'bee', C:'see', D:'dee', E:'eee', F:'eff', G:'gee', H:'aitch',
  I:'eye', J:'jay', K:'kay', L:'ell', M:'em', N:'en', O:'oh', P:'pee',
  Q:'cue', R:'ar', S:'ess', T:'tee', U:'you', V:'vee', W:'double-you',
  X:'ex', Y:'why', Z:'zee'
};

/*
  The two vowels whose sound genuinely varies between engines. E was 'ee',
  which several engines clip to a short /ɪ/ — closer to "ih" than to the
  name of the letter. 'eee' forces the engine to hold the vowel.
*/
var A_SOUND_CHOICES = ['eigh', 'ay', 'ey'];
var E_SOUND_CHOICES = ['eee', 'ee', 'eeh'];
var LETTER_FIX_CHOICES = { A: A_SOUND_CHOICES, E: E_SOUND_CHOICES };

function letterSound(ch, overrides){
  var c = String(ch == null ? '' : ch).toUpperCase();
  if (overrides && overrides[c]) return String(overrides[c]);
  return LETTER_SOUND[c] || c.toLowerCase();
}

function cleanWord(raw){
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
}

function normalizeWords(list){
  var out = [], seen = {};
  if (!list || !list.length) return out;
  for (var i = 0; i < list.length; i++){
    var w = cleanWord(list[i]);
    if (w.length < 2 || w.length > 12) continue;
    if (seen[w]) continue;
    seen[w] = true;
    out.push(w);
  }
  return out;
}

function shuffle(arr, rnd){
  var a = arr.slice(), r = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(r() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* Real, simple words used to build wrong answers. All are genuine words. */
var WORD_BANK = [
  'AM','AN','AS','AT','BE','BY','DO','GO','HE','IF','IN','IS','IT','ME','MY','NO','OF','ON','OR','SO','TO','UP','US','WE',
  'ALL','AND','ANY','ARE','ASK','BAT','BED','BIG','BOX','BOY','BUS','BUT','CAN','CAR','CAT','COW','CUP','CUT','DAD','DAY',
  'DID','DOG','EAT','EGG','END','FAR','FEW','FOR','FOX','FUN','GET','GOT','HAD','HAS','HAT','HER','HIM','HIS','HOT','HOW',
  'ICE','ITS','JOB','KEY','KID','LEG','LET','LOT','LOW','MAN','MAP','MAY','MOM','NEW','NOT','NOW','OLD','ONE','OUR','OUT',
  'OWN','PEN','PIG','PUT','RAN','RED','RUN','SAT','SAW','SAY','SEA','SEE','SET','SHE','SIT','SIX','SKY','SUN','TEN','THE',
  'TOO','TOP','TOY','TRY','TWO','USE','VAN','WAS','WAY','WET','WHO','WHY','WIN','YES','YET','YOU','ZOO',
  'ALSO','BABY','BACK','BALL','BEAR','BEEN','BEST','BIKE','BIRD','BLUE','BOAT','BOOK','BOTH','CAKE','CALL','CAME','CARE',
  'CITY','COLD','COME','CORN','DARK','DEEP','DOES','DONE','DOOR','DOWN','DUCK','EACH','EASY','EVEN','EVER','FACE','FALL',
  'FARM','FAST','FEEL','FEET','FIND','FINE','FIRE','FISH','FIVE','FOOD','FOOT','FOUR','FREE','FROG','FROM','FULL','GAME',
  'GATE','GAVE','GIVE','GOAT','GOES','GOLD','GONE','GOOD','GROW','HAND','HARD','HAVE','HEAD','HEAR','HELP','HERE','HIGH',
  'HILL','HOLD','HOME','HOPE','HOUR','HUGE','JUMP','JUST','KEEP','KIND','KING','KNOW','LAKE','LAND','LAST','LATE','LEAF',
  'LEFT','LESS','LIFE','LIKE','LINE','LION','LIST','LIVE','LONG','LOOK','LOST','LOUD','LOVE','MADE','MAKE','MANY','MEAL',
  'MEAN','MEET','MILK','MIND','MINE','MISS','MOON','MORE','MOST','MOVE','MUCH','MUST','NAME','NEAR','NEED','NEXT','NICE',
  'NINE','NOSE','NOTE','ONCE','ONLY','OPEN','OVER','PAGE','PARK','PART','PICK','PLAN','PLAY','PULL','PUSH','RACE','RAIN',
  'READ','REAL','REST','RIDE','RING','ROAD','ROCK','ROOM','ROSE','SAID','SAME','SAND','SEAT','SEEM','SEEN','SELL','SEND',
  'SHIP','SHOE','SHOP','SHOW','SIDE','SING','SLOW','SNOW','SOME','SONG','SOON','SORT','STAR','STAY','STEP','STOP','SUCH',
  'SURE','SWIM','TAKE','TALK','TALL','TEAM','TELL','THAN','THAT','THEM','THEN','THEY','THIN','THIS','TIME','TINY','TOLD',
  'TOOK','TREE','TRIP','TRUE','TURN','UPON','VERY','WAIT','WALK','WALL','WANT','WARM','WASH','WAVE','WEEK','WELL','WENT',
  'WERE','WHAT','WHEN','WILD','WILL','WIND','WISH','WITH','WOOD','WORD','WORK','YARD','YEAR','YOUR',
  'ABOUT','AFTER','AGAIN','ALONG','APPLE','BEACH','BEGIN','BELOW','BREAD','BRING','BROWN','BUILD','CHAIR','CHILD','CLEAN',
  'CLOSE','CLOUD','COLOR','COULD','DREAM','DRINK','DRIVE','EARLY','EARTH','EVERY','FIRST','FLOOR','FOUND','FRONT','FRUIT',
  'FUNNY','GRASS','GREAT','GREEN','GROUP','HAPPY','HEART','HORSE','HOUSE','LARGE','LAUGH','LEARN','LIGHT','MAYBE','MONEY',
  'MONTH','MOUSE','MUSIC','NEVER','NIGHT','NOISE','NORTH','OCEAN','ORDER','OTHER','PAPER','PARTY','PLACE','PLANT','POINT',
  'QUICK','QUIET','RIGHT','RIVER','ROUND','SEVEN','SHEEP','SHORT','SLEEP','SMALL','SMILE','SOUND','SOUTH','SPELL','SPORT',
  'START','STORY','SUGAR','SWEET','TABLE','TEACH','THANK','THEIR','THERE','THESE','THING','THINK','THIRD','THOSE','THREE',
  'TIGER','TODAY','TRAIN','TRUCK','UNDER','UNTIL','WATCH','WATER','WHEEL','WHERE','WHICH','WHILE','WHITE','WHOLE','WOMAN',
  'WORLD','WOULD','WRITE','YOUNG'
];

/* Square brackets mark the target word so the UI can highlight it. */
var SENTENCES = {
  THE:'I see [the] dog.',
  AND:'Mom [and] Dad.',
  TO:'I go [to] school.',
  IT:'[It] is fun!',
  IS:'The sun [is] hot.'
};

function sentenceFor(word){
  var w = cleanWord(word);
  if (SENTENCES[w]) return SENTENCES[w];
  return 'Can you spell [' + w.toLowerCase() + ']?';
}

function sentenceParts(raw){
  var s = String(raw == null ? '' : raw);
  var parts = [], i = 0;
  while (i < s.length){
    var open = s.indexOf('[', i);
    if (open === -1){ parts.push({ text:s.slice(i), mark:false }); break; }
    var close = s.indexOf(']', open);
    if (close === -1){ parts.push({ text:s.slice(i), mark:false }); break; }
    if (open > i) parts.push({ text:s.slice(i, open), mark:false });
    parts.push({ text:s.slice(open + 1, close), mark:true });
    i = close + 1;
  }
  return parts.filter(function(p){ return p.text.length > 0; });
}

function sentencePlain(raw){
  return sentenceParts(raw).map(function(p){ return p.text; }).join('');
}

function makeDecoys(word, count, rnd){
  var answer = cleanWord(word);
  var n = count == null ? 2 : count;
  var r = rnd || Math.random;
  var picked = [], used = {};
  used[answer] = true;

  function drawFrom(pool){
    var shuffled = shuffle(pool, r);
    for (var i = 0; i < shuffled.length && picked.length < n; i++){
      var w = shuffled[i];
      if (used[w]) continue;
      used[w] = true;
      picked.push(w);
    }
  }

  var exact = [], near = [], rest = [];
  for (var i = 0; i < WORD_BANK.length; i++){
    var w = WORD_BANK[i];
    if (w === answer) continue;
    var d = Math.abs(w.length - answer.length);
    if (d === 0) exact.push(w); else if (d === 1) near.push(w); else rest.push(w);
  }
  drawFrom(exact);
  if (picked.length < n) drawFrom(near);
  if (picked.length < n) drawFrom(rest);
  return picked;
}

function makeOptions(word, rnd){
  var answer = cleanWord(word);
  return shuffle(makeDecoys(answer, 2, rnd).concat([answer]), rnd);
}

function scrambleLetters(word, rnd){
  var letters = cleanWord(word).split('');
  if (letters.length < 2) return letters;
  var allSame = letters.every(function(c){ return c === letters[0]; });
  var out = shuffle(letters, rnd), tries = 0;
  while (!allSame && out.join('') === letters.join('') && tries < 25){
    out = shuffle(letters, rnd); tries++;
  }
  if (!allSame && out.join('') === letters.join('')){
    var t = out[0]; out[0] = out[out.length - 1]; out[out.length - 1] = t;
  }
  return out;
}

function isPermutationOf(tiles, word){
  var a = (tiles || []).slice().sort().join('');
  var b = cleanWord(word).split('').sort().join('');
  return a === b && a.length > 0;
}

function makeSearchLetters(word, extra, rnd){
  var letters = cleanWord(word).split('');
  var n = extra == null ? SEARCH_EXTRA_LETTERS : extra;
  var r = rnd || Math.random;
  var inWord = {};
  letters.forEach(function(c){ inWord[c] = true; });

  var pool = [];
  for (var i = 0; i < 26; i++){
    var c = String.fromCharCode(65 + i);
    if (!inWord[c]) pool.push(c);
  }
  var decoys = shuffle(pool, r).slice(0, Math.min(n, pool.length));
  return shuffle(letters.concat(decoys), r);
}

function scatterPositions(count, areaW, areaH, tile, gap, rnd){
  var r = rnd || Math.random;
  var g = gap == null ? 10 : gap;
  var n = Math.max(0, count | 0);
  if (n === 0) return { positions:[], height:0, cols:0, rows:0 };

  var cols = Math.floor((areaW + g) / (tile + g));
  if (cols < 1) cols = 1;
  if (cols > n) cols = n;
  var rows = Math.ceil(n / cols);

  var cellW = areaW / cols;
  var minCellH = tile + g;
  var cellH = Math.max(minCellH, (areaH || 0) / rows);
  var height = cellH * rows;

  var cells = [];
  for (var i = 0; i < cols * rows; i++) cells.push(i);
  cells = shuffle(cells, r).slice(0, n);

  var positions = cells.map(function(cell){
    var cx = (cell % cols) * cellW;
    var cy = Math.floor(cell / cols) * cellH;
    var slackX = Math.max(0, cellW - tile);
    var slackY = Math.max(0, cellH - tile);
    return {
      x: Math.round(cx + slackX * r()),
      y: Math.round(cy + slackY * r())
    };
  });

  return { positions:positions, height:Math.round(height), cols:cols, rows:rows };
}

function noOverlap(positions, tile){
  for (var i = 0; i < positions.length; i++){
    for (var j = i + 1; j < positions.length; j++){
      var a = positions[i], b = positions[j];
      if (Math.abs(a.x - b.x) < tile && Math.abs(a.y - b.y) < tile) return false;
    }
  }
  return true;
}

/* ============================================================
   THE FOUR CHARACTERS

   `mode` is the locked movement language and nothing may blur it:
     jet   — thrust, rocket rolls, hard braking.  Never tumbles.
     board — carving, ollies, grinds. May bail off the board, never tumbles.
     foot  — runs, stumbles, skids, lands on his backside. Never tumbles.
     acro  — cartwheels, handsprings, aerials. The ONLY tumbler.

   `falls` and `tumbles` are NOT the same thing, and conflating them is how
   the identities get blurred:
     falls   — tips over, lands on his backside, bails off the board. Messy,
               involuntary, and it stops somewhere past upright.
     tumbles — goes all the way round, on purpose, and lands it.
   Trip falls constantly and never tumbles. Zip bails off the board once in
   a while and never tumbles. Blip does neither — he brakes and recovers.
   Flip tumbles and never falls.

   GEAR: jet rig and skateboard only. The v4/v5 sword and shield are gone —
   gear is equipment layered on a recognisable base character, and two of
   the four carrying weapons made that read as identity instead.

   COLOUR: Flip is red. The visual-direction note proposed purple; that
   collides with a standing "no purple/pink" instruction, and teal (which v5
   used) sits too near Zip's blue once both are 74px on a phone. Red is the
   remaining primary that clears blue, green and the no-purple rule.
   ============================================================ */
var CHARS = {
  blip: { key:'blip', name:'Blip', mode:'jet',   rig:'jet rig',    airborne:true,  falls:false, tumbles:false, color:'#F0862B' },
  zip:  { key:'zip',  name:'Zip',  mode:'board', rig:'skateboard', airborne:false, falls:true,  tumbles:false, color:'#2E7DF7' },
  trip: { key:'trip', name:'Trip', mode:'foot',  rig:'on foot',    airborne:false, falls:true,  tumbles:false, color:'#34B764' },
  flip: { key:'flip', name:'Flip', mode:'acro',  rig:'no vehicle', airborne:true,  falls:false, tumbles:true,  color:'#FF4D4D' }
};
var CHAR_ORDER = ['blip', 'zip', 'trip', 'flip'];

/* ---- motion language, as maths ---- */
var MAX_NON_TUMBLE_ROT = 26;   /* degrees; a lean or a wobble, nothing more */
/*
  How far past upright a character who FALLS may end up. 115 degrees is flat
  on his back with his boots in the air — the far side of a pratfall.
  Anything at or beyond 180 would be going round, which is a tumble.
*/
var MAX_FALL_ROT = 115;

/* The most any character may rotate, by what he is allowed to do. */
function rotBudgetFor(key){
  var c = CHARS[key];
  if (!c) return MAX_NON_TUMBLE_ROT;
  if (c.tumbles) return Infinity;
  if (c.falls) return MAX_FALL_ROT;
  return MAX_NON_TUMBLE_ROT;
}

function styleRot(mode, p, dirX, spins){
  var t = Math.max(0, Math.min(1, Number(p) || 0));
  switch (mode){
    case 'jet':   return (Number(dirX) >= 0 ? 14 : -14) * Math.sin(Math.PI * t);
    case 'board': return 12 * Math.sin(t * Math.PI * 2);
    case 'foot':  return 7 * Math.sin(t * Math.PI * 6);
    case 'acro':  return 360 * (spins == null ? 2 : spins) * t;
    default:      return 0;
  }
}

function styleOffsetY(mode, p){
  var t = Math.max(0, Math.min(1, Number(p) || 0));
  switch (mode){
    case 'jet':   return -10 * Math.sin(t * Math.PI * 2);
    case 'board': return -24 * Math.max(0, Math.sin(t * Math.PI));
    case 'foot':  return -7 * Math.abs(Math.sin(t * Math.PI * 6));
    case 'acro':  return -30 * Math.sin(t * Math.PI);
    default:      return 0;
  }
}

/* Which way a character is allowed to haul a letter off the screen. */
function exitDirsFor(key){
  var c = CHARS[key];
  if (!c) return ['left', 'right'];
  if (!c.airborne) return ['left', 'right'];
  /* never 'down': leaving through the ground reads as a glitch, not a move */
  return ['up', 'left', 'right'];
}

function sidekickOf(leader, n){
  var others = CHAR_ORDER.filter(function(k){ return k !== leader; });
  if (!others.length) return CHAR_ORDER[0];
  var i = Math.abs(Math.floor(Number(n) || 0)) % others.length;
  return others[i];
}

/* ============================================================
   TOW CORD  (pure)

   A rope constraint, not a keyframe. While the character is near the letter
   the cord hangs slack and the letter does not move at all; once he travels
   past it the distance exceeds the cord length, the cord snaps taut and the
   letter is yanked into his wake. That snap is the whole point: without the
   slack that precedes it the cord is decoration.
   ============================================================ */
function ropeSolve(px, py, ax, ay, rest){
  var dx = px - ax, dy = py - ay;
  var d = Math.sqrt(dx * dx + dy * dy);
  var r = Math.max(0, Number(rest) || 0);
  if (d <= r || d === 0) return { x: px, y: py, taut: false, dist: d, pull: 0 };
  var k = (d - r) / d;
  return { x: px - dx * k, y: py - dy * k, taut: true, dist: d, pull: d - r };
}

/* The drawn cord: sags under its own weight when slack, straight when taut. */
function cordPath(ax, ay, px, py, rest){
  var d = Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  var slack = Math.max(0, (Number(rest) || 0) - d);
  var mx = (ax + px) / 2;
  var my = (ay + py) / 2 + slack * 0.55 + 3;
  return 'M' + Math.round(ax) + ' ' + Math.round(ay) +
         ' Q' + Math.round(mx) + ' ' + Math.round(my) +
         ' ' + Math.round(px) + ' ' + Math.round(py);
}

/* Off-screen start/end point for an entry or exit edge. */
function edgePoint(edge, vw, vh, size){
  var s = size == null ? 104 : size;
  switch (edge){
    case 'top':    return { x: vw * 0.5 - s / 2, y: -s - 40 };
    case 'bottom': return { x: vw * 0.5 - s / 2, y: vh + 40 };
    case 'left':   return { x: -s - 40,          y: vh * 0.45 };
    case 'right':  return { x: vw + 40,          y: vh * 0.45 };
    default:       return { x: vw * 0.5 - s / 2, y: -s - 40 };
  }
}

/*
  Staggered stack offsets. Letters must never sit squarely on top of each
  other — the whole point of stacking them is that Grayson can still read
  the word. Each block steps sideways and leans a little, so a four-letter
  stack reads as a staircase rather than one block.
*/
function stackOffsets(count, tile){
  var n = Math.max(0, Math.floor(Number(count) || 0));
  var t = Number(tile) || 68;
  var out = [];
  for (var i = 0; i < n; i++){
    var dir = (i % 2 === 0) ? 1 : -1;
    out.push({
      dx: Math.round(dir * t * 0.34 * Math.min(1, (i + 1) / 3)),
      dy: Math.round(-i * t * 0.62),
      rot: dir * (4 + (i % 3) * 2)
    });
  }
  return out;
}

/* Every stacked letter keeps a visible edge: no two share a centre. */
function stackReadable(offsets, tile){
  var t = Number(tile) || 68;
  for (var i = 0; i < offsets.length; i++){
    for (var j = i + 1; j < offsets.length; j++){
      var dx = Math.abs(offsets[i].dx - offsets[j].dx);
      var dy = Math.abs(offsets[i].dy - offsets[j].dy);
      if (dx < t * 0.22 && dy < t * 0.22) return false;
    }
  }
  return true;
}

/* ============================================================
   SCENE PLANNER

   A scene is planned as data first and executed second. Everything that
   could be wrong about a performance — a letter nobody takes, a cord that
   tows without ever going taut, Trip dropping something nobody picks up,
   Blip doing a cartwheel, a scene that runs 40 seconds — is a property of
   this plan, so the tests catch it without a browser or a stopwatch.
   ============================================================ */

/* Beat lengths in ms. */
var BEAT = {
  enter:700, approach:430, hook:340, slack:420, snap:240, tow:900,
  scoop:700, grab:520, stack:820, topple:700, pop:420, ollie:520,
  grind:900, brake:400, overshoot:520, fumble:800, rescue:700,
  shrug:780, flourish:640, exit:620, settle:240
};

/*
  Scene length is a TARGET, not a rule. 4-12s is where most scenes should
  land, but a scene that reads better at 3.4s or 13s is allowed to be that
  long. What is forbidden is manufacturing time: no scene is ever padded
  with dead beats to reach a floor, and none is rushed to duck a ceiling.

  SCENE_HARD_MAX is different — it is a bug bound, not a taste bound. A plan
  past it means the arithmetic ran away, and the suite fails.
*/
var SCENE_TARGET_MIN = 4000, SCENE_TARGET_MAX = 12000;
var SCENE_HARD_MAX = 20000;

/* Removal kinds — exactly one of these per letter, or the plan is invalid. */
var TAKE_KINDS = { tow:1, scoop:1, snatch:1, pop:1, carry:1, rescue:1, follow:1, haul:1 };

/*
  Beats that end with the character off the screen. Anyone who enters must
  finish on one of these, or they are left standing in the scene doing
  nothing — which is precisely the "walks to a letter and then stops" fault
  the rebuild exists to kill. A 'snatch' is NOT one of these: catching a
  block leaves you holding it, still on stage.
*/
var EXIT_KINDS = { exit:1, rescue:1, tow:1, scoop:1, carry:1, superpass:1, march:1, haul:1 };

function makeTimeline(){
  var events = [];
  return {
    events: events,
    /* returns the event so a caller can read back its end time */
    push: function(at, dur, kind, extra){
      var e = { at: Math.max(0, Math.round(at)), dur: Math.round(dur), kind: kind };
      for (var k in extra){ if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k]; }
      events.push(e);
      return e;
    },
    end: function(){
      var max = 0;
      for (var i = 0; i < events.length; i++){
        var t = events[i].at + events[i].dur;
        if (t > max) max = t;
      }
      return max;
    }
  };
}

/*
  The cord, staged properly, as four beats rather than one.

    hook  — he catches the block
    slack — he moves off and the cord pays out loose behind him
    snap  — the slack runs out and the cord goes taut with a jolt
    tow   — only now does the block actually travel

  Emitting these as separate events is what makes the staging testable:
  a `tow` with `roped:true` and no preceding snap is a bug the suite fails.
*/
function ropeBeats(tl, at, who, letter, dir){
  var t = at;
  tl.push(t, BEAT.hook, 'hook', { char: who, letter: letter });            t += BEAT.hook;
  tl.push(t, BEAT.slack, 'slack', { char: who, letter: letter });          t += BEAT.slack;
  tl.push(t, BEAT.snap, 'snap', { char: who, letter: letter });            t += BEAT.snap;
  var e = tl.push(t, BEAT.tow, 'tow', { char: who, letter: letter, dir: dir, roped: true });
  return t + BEAT.tow;
}

/*
  Nobody may act before they have arrived. Scenes call this instead of
  pushing a bare 'enter', so a character who is already on stage does not
  get a second entrance and one who is not gets a real one. This is the
  plan-level cure for the "character appears mid-scene" and "walks to a
  letter and then does nothing" faults.
*/
function ensureEnter(tl, entered, who, at){
  if (entered[who]) return at;
  entered[who] = true;
  tl.push(Math.max(0, at - BEAT.enter), BEAT.enter, 'enter', { char: who });
  return at;
}

function dirFor(who, i){
  var dirs = exitDirsFor(who);
  return dirs[Math.abs(i) % dirs.length];
}

/* ---------------------------------------------------------------
   THE SCENE LIBRARY

   `lead` is which character the scene is built around; 'any' means the
   choreography works in any of the four movement languages. `weight` sets
   how often it comes up — the chaotic and the rare ones are deliberately
   low so they stay surprising.
   --------------------------------------------------------------- */
var SCENES = [

  /* --- BLIP: the hero tow. Stack, hook the bottom, snap, topple. --- */
  { id:'jet-tow-stack', name:'Jet Pull', lead:'blip', weight:10, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0, entered = {};
      ensureEnter(tl, entered, 'blip', BEAT.enter);                     t += BEAT.enter;
      tl.push(t, BEAT.stack, 'stack', { char:'blip', count:c.letters }); t += BEAT.stack;
      /* hooks the BOTTOM block, so the tower has to answer for it */
      tl.push(t, BEAT.hook, 'hook', { char:'blip', letter:0 });          t += BEAT.hook;
      tl.push(t, BEAT.slack, 'slack', { char:'blip', letter:0 });        t += BEAT.slack;
      tl.push(t, BEAT.topple, 'topple', { from:1 });
      tl.push(t, BEAT.snap, 'snap', { char:'blip', letter:0 });          t += BEAT.snap;
      /* the yank is where the comedy is, so it happens on screen: too much
         thrust, overshoot, then a hard brake, and only then he tows it off */
      tl.push(t, BEAT.overshoot, 'overshoot', { char:'blip' });          t += BEAT.overshoot;
      tl.push(t, BEAT.brake, 'brake', { char:'blip' });                  t += BEAT.brake;
      var after = t + BEAT.tow;
      tl.push(t, BEAT.tow, 'tow', { char:'blip', letter:0, dir:'right', roped:true });
      /* the upper blocks come down and are caught, not deleted */
      var catchers = {};
      for (var i = 1; i < c.letters; i++){
        var who = i === 1 && c.has('flip') ? 'flip' : c.pick(i);
        var catchAt = after - 240 + i * 260;
        ensureEnter(tl, entered, who, catchAt);
        tl.push(catchAt, BEAT.grab, 'snatch', { char: who, letter: i });
        catchers[who] = Math.max(catchers[who] || 0, catchAt + BEAT.grab);
      }
      /* each catcher leaves with what he caught, rather than standing there */
      Object.keys(catchers).forEach(function(who, n){
        tl.push(catchers[who] + n * 120, BEAT.exit, 'exit',
          { char: who, dir: dirFor(who, n + 1) });
      });
      return tl;
    } },

  /* --- BLIP: too heavy. Thrust, resist, pop loose, hard brake. --- */
  { id:'jet-heavy', name:'Dead Weight', lead:'blip', weight:7, min:1,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'blip' }); t += BEAT.enter;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 620;
        /* the resist beat: cord taut, nothing moves, then it gives */
        tl.push(at, BEAT.hook, 'hook', { char:'blip', letter:i });
        tl.push(at + BEAT.hook, BEAT.slack, 'slack', { char:'blip', letter:i });
        tl.push(at + BEAT.hook + BEAT.slack, BEAT.snap, 'snap', { char:'blip', letter:i });
        tl.push(at + BEAT.hook + BEAT.slack + BEAT.snap, 420, 'resist', { char:'blip', letter:i });
        tl.push(at + BEAT.hook + BEAT.slack + BEAT.snap + 420, BEAT.tow, 'tow',
          { char:'blip', letter:i, dir:'up', roped:true });
      }
      var last = t + Math.max(0, c.letters - 1) * 620 + BEAT.hook + BEAT.slack + BEAT.snap + 420 + BEAT.tow;
      tl.push(last, BEAT.brake, 'brake', { char:'blip' });
      tl.push(last + BEAT.brake, BEAT.exit, 'exit', { char:'blip', dir:'up' });
      return tl;
    } },

  /* --- ZIP: carve through and sweep the letters onto the deck. --- */
  { id:'board-sweep', name:'Board Sweep', lead:'zip', weight:10, min:1,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'zip' }); t += BEAT.enter;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 520;
        tl.push(at, BEAT.approach, 'approach', { char:'zip', letter:i });
        tl.push(at + BEAT.approach, BEAT.scoop, 'scoop',
          { char:'zip', letter:i, dir:'left' });
      }
      var last = t + Math.max(0, c.letters - 1) * 520 + BEAT.approach + BEAT.scoop;
      tl.push(last, BEAT.exit, 'exit', { char:'zip', dir:'left' });
      return tl;
    } },

  /* --- ZIP: the grind. Letters pop loose in rhythm along the row. --- */
  { id:'board-grind', name:'Edge Grind', lead:'zip', weight:8, min:3,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'zip' }); t += BEAT.enter;
      tl.push(t, BEAT.grind, 'grind', { char:'zip' });
      /* each letter is knocked free on a beat as the board passes it */
      var step = Math.max(180, Math.floor(BEAT.grind / Math.max(1, c.letters)));
      for (var i = 0; i < c.letters; i++){
        tl.push(t + i * step, BEAT.scoop, 'scoop', { char:'zip', letter:i, dir:'right' });
      }
      var last = t + Math.max(0, c.letters - 1) * step + BEAT.scoop;
      tl.push(last, BEAT.exit, 'exit', { char:'zip', dir:'right' });
      return tl;
    } },

  /* --- TRIP + ZIP: Trip goes down, Zip ollies clean over him. --- */
  { id:'ollie-over-trip', name:'Ollie Over', lead:'zip', weight:7, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'trip' }); t += BEAT.enter;
      /* Trip carries the first one and immediately loses his feet */
      tl.push(t, BEAT.approach, 'approach', { char:'trip', letter:0 }); t += BEAT.approach;
      tl.push(t, BEAT.fumble, 'fumble', { char:'trip', letter:0 });
      tl.push(t + 200, BEAT.enter, 'enter', { char:'zip' });
      tl.push(t + 200 + BEAT.enter, BEAT.ollie, 'ollie', { char:'zip', over:'trip' });
      var after = t + 200 + BEAT.enter + BEAT.ollie;
      /* Zip picks up what Trip dropped without breaking momentum */
      tl.push(after, BEAT.rescue, 'rescue', { char:'zip', letter:0, dir:'left' });
      /* Trip picks himself up while Zip carries on — he is unlucky, not idle */
      tl.push(after - 120, 420, 'dustoff', { char:'trip' });
      var at = after + BEAT.rescue;
      for (var i = 1; i < c.letters; i++){
        tl.push(at + (i - 1) * 480, BEAT.scoop, 'scoop', { char:'zip', letter:i, dir:'left' });
      }
      var last = at + Math.max(0, c.letters - 2) * 480 + BEAT.scoop;
      tl.push(after + 300, BEAT.exit, 'exit', { char:'trip', dir:'right' });
      tl.push(last, BEAT.exit, 'exit', { char:'zip', dir:'left' });
      return tl;
    } },

  /* --- TRIP: too many at once. They slip; he gets every one back. --- */
  { id:'trip-overload', name:"Trip's Bad Idea", lead:'trip', weight:9, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0, entered = {};
      ensureEnter(tl, entered, 'trip', BEAT.enter); t += BEAT.enter;
      tl.push(t, BEAT.stack, 'stack', { char:'trip', count:c.letters }); t += BEAT.stack;
      /* he drops exactly one, and the rescue for it is in the same plan */
      var dropped = c.letters - 1;
      tl.push(t, BEAT.fumble, 'fumble', { char:'trip', letter:dropped });
      var resc = c.has('flip') ? 'flip' : c.pick(1);
      var rescAt = t + BEAT.fumble - 240;
      ensureEnter(tl, entered, resc, rescAt);
      tl.push(rescAt, BEAT.rescue, 'rescue',
        { char:resc, letter:dropped, dir:dirFor(resc, 0) });
      var at = t + BEAT.fumble + 120;
      for (var i = 0; i < dropped; i++){
        tl.push(at + i * 300, BEAT.grab, 'carry', { char:'trip', letter:i, dir:'left' });
      }
      var last = Math.max(at + Math.max(0, dropped - 1) * 300 + BEAT.grab,
                          t + BEAT.fumble - 240 + BEAT.rescue);
      tl.push(last, BEAT.exit, 'exit', { char:'trip', dir:'left' });
      return tl;
    } },

  /* --- TRIP: catches his foot on a cord somebody left behind. --- */
  { id:'cord-trip', name:'Left Cord', lead:'trip', weight:8, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      /* Blip lays the cord across the scene and goes */
      tl.push(t, BEAT.enter, 'enter', { char:'blip' }); t += BEAT.enter;
      var after = ropeBeats(tl, t, 'blip', 0, 'right');
      /* the cord is left lying across the scene: a world event, not one of
         Blip's actions, so it is not attributed to him */
      tl.push(after, 300, 'dropcord', {});
      tl.push(after, BEAT.exit, 'exit', { char:'blip', dir:'right' });
      /* Trip runs in and finds it with his foot */
      var tt = after + 260;
      tl.push(tt, BEAT.enter, 'enter', { char:'trip' }); tt += BEAT.enter;
      tl.push(tt, 300, 'snag', { char:'trip' }); tt += 300;
      tl.push(tt, BEAT.fumble, 'fumble', { char:'trip', letter:1 });
      tt += BEAT.fumble;
      tl.push(tt, 420, 'dustoff', { char:'trip' }); tt += 420;
      tl.push(tt, BEAT.rescue, 'rescue', { char:'trip', letter:1, dir:'left' });
      tt += BEAT.rescue;
      for (var i = 2; i < c.letters; i++){
        tl.push(tt + (i - 2) * 320, BEAT.grab, 'carry', { char:'trip', letter:i, dir:'left' });
      }
      var last = tt + Math.max(0, c.letters - 3) * 320 + (c.letters > 2 ? BEAT.grab : 0);
      tl.push(last, BEAT.exit, 'exit', { char:'trip', dir:'left' });
      return tl;
    } },

  /* --- FLIP: a letter caught on every rotation. Tumbling is his alone. --- */
  { id:'acro-collect', name:'Acro Collection', lead:'flip', weight:10, min:1,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'flip' }); t += BEAT.enter;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 480;
        tl.push(at, BEAT.grab, 'cartwheel', { char:'flip', letter:i });
        tl.push(at + BEAT.grab, BEAT.grab, 'snatch', { char:'flip', letter:i });
      }
      var last = t + Math.max(0, c.letters - 1) * 480 + BEAT.grab * 2;
      tl.push(last, BEAT.flourish, 'aerial', { char:'flip' });
      tl.push(last + BEAT.flourish, BEAT.exit, 'exit', { char:'flip', dir:'up' });
      return tl;
    } },

  /* --- FLIP saves a stack somebody else knocked over. --- */
  { id:'acro-save', name:'The Save', lead:'flip', weight:7, min:3,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      var builder = c.has('zip') ? 'zip' : 'blip';
      tl.push(t, BEAT.enter, 'enter', { char:builder }); t += BEAT.enter;
      tl.push(t, BEAT.stack, 'stack', { char:builder, count:c.letters }); t += BEAT.stack;
      tl.push(t, BEAT.topple, 'topple', { from:0 });
      tl.push(t - 120, BEAT.enter, 'enter', { char:'flip' });
      /* he watches his own tower go and reacts, rather than standing there */
      tl.push(t + 160, 320, 'notice', { char:builder });
      var at = t + 200;
      for (var i = 0; i < c.letters; i++){
        tl.push(at + i * 300, BEAT.grab, 'snatch', { char:'flip', letter:i });
      }
      var last = at + Math.max(0, c.letters - 1) * 300 + BEAT.grab;
      /* he leaves as soon as he has reacted — Flip has it covered */
      tl.push(t + 480, BEAT.exit, 'exit', { char:builder, dir:'right' });
      tl.push(last, BEAT.flourish, 'aerial', { char:'flip' });
      tl.push(last + BEAT.flourish, BEAT.exit, 'exit', { char:'flip', dir:'up' });
      return tl;
    } },

  /* --- Two characters pull opposite ways, realise, and let go. --- */
  { id:'tug-of-war', name:'Tug of War', lead:'any', weight:5, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      var a = c.lead, b = c.pick(1);
      tl.push(t, BEAT.enter, 'enter', { char:a });
      tl.push(t, BEAT.enter, 'enter', { char:b }); t += BEAT.enter;
      tl.push(t, BEAT.hook, 'hook', { char:a, letter:0 });
      tl.push(t, BEAT.hook, 'hook', { char:b, letter:0 }); t += BEAT.hook;
      tl.push(t, BEAT.slack, 'slack', { char:a, letter:0 }); t += BEAT.slack;
      tl.push(t, BEAT.snap, 'snap', { char:a, letter:0 }); t += BEAT.snap;
      tl.push(t, 620, 'tug', { char:a, other:b, letter:0 }); t += 620;
      tl.push(t, 320, 'realise', { char:a, other:b }); t += 320;
      tl.push(t, BEAT.tow, 'tow', { char:a, letter:0, dir:dirFor(a, 0), roped:true });
      var at = t + BEAT.tow;
      for (var i = 1; i < c.letters; i++){
        tl.push(at + (i - 1) * 380, BEAT.grab, 'carry',
          { char:b, letter:i, dir:dirFor(b, i) });
      }
      var last = Math.max(at, at + Math.max(0, c.letters - 2) * 380 + (c.letters > 1 ? BEAT.grab : 0));
      tl.push(last, BEAT.exit, 'exit', { char:a, dir:dirFor(a, 0) });
      tl.push(last, BEAT.exit, 'exit', { char:b, dir:dirFor(b, 1) });
      return tl;
    } },

  /* --- Handoff: the leader gets most of them, someone finishes the job. --- */
  { id:'handoff', name:'Handoff', lead:'any', weight:8, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      var a = c.lead, b = c.pick(1);
      tl.push(t, BEAT.enter, 'enter', { char:a }); t += BEAT.enter;
      var split = Math.max(1, c.letters - 1);
      for (var i = 0; i < split; i++){
        var at = t + i * 460;
        tl.push(at, BEAT.approach, 'approach', { char:a, letter:i });
        tl.push(at + BEAT.approach, BEAT.grab, 'carry',
          { char:a, letter:i, dir:dirFor(a, i) });
      }
      /* his last carry takes him off the screen; the one he missed is left
         sitting there for a beat, which is the whole joke */
      var mid = t + Math.max(0, split - 1) * 460 + BEAT.approach + BEAT.grab;
      /* the one he missed */
      tl.push(mid + 160, BEAT.enter, 'enter', { char:b });
      var bt = mid + 160 + BEAT.enter;
      for (var j = split; j < c.letters; j++){
        tl.push(bt, BEAT.grab, 'carry', { char:b, letter:j, dir:dirFor(b, j) });
        bt += BEAT.grab;
      }
      tl.push(bt, BEAT.exit, 'exit', { char:b, dir:dirFor(b, 1) });
      return tl;
    } },

  /* --- Rare: all four, one letter each where the count allows. --- */
  { id:'four-way', name:'All Four', lead:'any', weight:3, min:3,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      var order = c.order;
      for (var i = 0; i < c.letters; i++){
        var who = order[i % order.length];
        var at = t + i * 420;
        tl.push(at, BEAT.enter, 'enter', { char:who });
        tl.push(at + BEAT.enter, BEAT.grab, 'carry',
          { char:who, letter:i, dir:dirFor(who, i) });
        tl.push(at + BEAT.enter + BEAT.grab, BEAT.exit, 'exit',
          { char:who, dir:dirFor(who, i) });
      }
      return tl;
    } },

  /* --- Rare and quick: one fast pass takes the lot. --- */
  { id:'super-pass', name:'Super Pass', lead:'any', weight:3, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:c.lead }); t += BEAT.enter;
      tl.push(t, 900, 'superpass', { char:c.lead, count:c.letters });
      for (var i = 0; i < c.letters; i++){
        tl.push(t + 140 + i * 110, BEAT.tow, 'tow',
          { char:c.lead, letter:i, dir:dirFor(c.lead, 0), roped:false });
      }
      var last = t + 140 + Math.max(0, c.letters - 1) * 110 + BEAT.tow;
      tl.push(last, BEAT.exit, 'exit', { char:c.lead, dir:dirFor(c.lead, 0) });
      return tl;
    } },

  /* --- Pop chain. Used sparingly: it is the one non-physical removal. --- */
  { id:'pop-chain', name:'Pop Chain', lead:'any', weight:4, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:c.lead }); t += BEAT.enter;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 420;
        tl.push(at, BEAT.approach, 'approach', { char:c.lead, letter:i });
        tl.push(at + BEAT.approach, BEAT.pop, 'pop', { char:c.lead, letter:i });
      }
      var last = t + Math.max(0, c.letters - 1) * 420 + BEAT.approach + BEAT.pop;
      tl.push(last, BEAT.flourish, 'flourish', { char:c.lead });
      tl.push(last + BEAT.flourish, BEAT.exit, 'exit', { char:c.lead, dir:dirFor(c.lead, 0) });
      return tl;
    } },

  /* --- Letter parade: the letters hop into line and follow him off. --- */
  { id:'letter-parade', name:'Letter Parade', lead:'any', weight:4, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:c.lead }); t += BEAT.enter;
      /* he whistles them into formation; they hop down and line up behind him */
      tl.push(t, 1000, 'parade', { char:c.lead, count:c.letters }); t += 1000;
      var dir = dirFor(c.lead, 1) === 'up' || dirFor(c.lead, 1) === 'down' ? 'right' : dirFor(c.lead, 1);
      var march = 1500 + c.letters * 140;
      tl.push(t, march, 'march', { char:c.lead, dir:dir });
      for (var i = 0; i < c.letters; i++){
        /* each letter sets off a hop later, and all arrive off stage together */
        tl.push(t + 60 + i * 70, march - 60 - i * 70, 'follow', { leader:c.lead, letter:i, dir:dir });
      }
      return tl;
    } },

  /* --- ZIP, rarely: the kickflip goes wrong, he bails, gets the board back. --- */
  { id:'board-bail', name:'Board Bail', lead:'zip', weight:3, min:1,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'zip' }); t += BEAT.enter;
      tl.push(t, 620, 'kickflip', { char:'zip' }); t += 620;
      /* the board keeps going without him; he lands on his backside */
      tl.push(t, 760, 'bail', { char:'zip' }); t += 760;
      tl.push(t, 420, 'dustoff', { char:'zip' }); t += 420;
      tl.push(t, 720, 'remount', { char:'zip' }); t += 720;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 520;
        tl.push(at, BEAT.approach, 'approach', { char:'zip', letter:i });
        tl.push(at + BEAT.approach, BEAT.scoop, 'scoop', { char:'zip', letter:i, dir:'right' });
      }
      var last = t + Math.max(0, c.letters - 1) * 520 + BEAT.approach + BEAT.scoop;
      tl.push(last, BEAT.exit, 'exit', { char:'zip', dir:'right' });
      return tl;
    } },

  /* --- FLIP: a handspring kicks each letter skyward; he catches it. --- */
  { id:'handspring-launch', name:'Handspring Launch', lead:'flip', weight:8, min:1,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'flip' }); t += BEAT.enter;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 720;
        tl.push(at, 520, 'handspring', { char:'flip', letter:i });
        tl.push(at + 520, BEAT.grab, 'snatch', { char:'flip', letter:i });
      }
      var last = t + Math.max(0, c.letters - 1) * 720 + 520 + BEAT.grab;
      tl.push(last, BEAT.flourish, 'aerial', { char:'flip' });
      tl.push(last + BEAT.flourish, BEAT.exit, 'exit', { char:'flip', dir:'up' });
      return tl;
    } },

  /* --- BLIP: a rocket roll, then he darts in for each letter. --- */
  { id:'rocket-roll', name:'Rocket Roll', lead:'blip', weight:7, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'blip' }); t += BEAT.enter;
      tl.push(t, 640, 'roll', { char:'blip' }); t += 640;
      for (var i = 0; i < c.letters; i++){
        var at = t + i * 560;
        tl.push(at, BEAT.approach, 'approach', { char:'blip', letter:i });
        tl.push(at + BEAT.approach, BEAT.grab, 'carry', { char:'blip', letter:i, dir:'up' });
      }
      var last = t + Math.max(0, c.letters - 1) * 560 + BEAT.approach + BEAT.grab;
      tl.push(last, 640, 'roll', { char:'blip' });
      tl.push(last + 640, BEAT.brake, 'brake', { char:'blip' });
      tl.push(last + 640 + BEAT.brake, BEAT.exit, 'exit', { char:'blip', dir:'up' });
      return tl;
    } },

  /* --- TRIP, rarely: the overcomplicated carry WORKS... then the crash. --- */
  { id:'trip-lucky', name:'Lucky Trip', lead:'trip', weight:4, min:2,
    build: function(c){
      var tl = makeTimeline(), t = 0;
      tl.push(t, BEAT.enter, 'enter', { char:'trip' }); t += BEAT.enter;
      tl.push(t, BEAT.stack, 'stack', { char:'trip', count:c.letters }); t += BEAT.stack;
      tl.push(t, 1000, 'wobble', { char:'trip' }); t += 1000;
      tl.push(t, 520, 'cheer', { char:'trip' }); t += 520;
      for (var i = 0; i < c.letters; i++){
        tl.push(t, 1800, 'haul', { char:'trip', letter:i, dir:'right' });
      }
      /* the letters are safe; the crash happens off stage, where it is funniest */
      tl.push(t + 1950, 500, 'offcrash', { dir:'right' });
      return tl;
    } }
];

/* Scenes this leader and this word length can actually support. */
function eligibleScenes(leadKey, letters){
  var n = Math.max(0, Math.floor(Number(letters) || 0));
  return SCENES.filter(function(s){
    if (s.lead !== 'any' && s.lead !== leadKey) return false;
    if (n < (s.min || 1)) return false;
    return true;
  });
}

/*
  Weighted pick that will not replay anything in `history` (most recent
  first) unless refusing would leave nothing to choose from. This is what
  stops the same performance turning up twice in one sitting.
*/
function pickScene(leadKey, letters, history, rnd){
  var r = rnd || Math.random;
  var pool = eligibleScenes(leadKey, letters);
  if (!pool.length) return null;
  /* the longest memory the pool can afford: five back if there is room,
     then three, then just "not the one he saw last" */
  var windows = [5, 3, 1];
  for (var w = 0; w < windows.length; w++){
    var recent = (history || []).slice(0, windows[w]);
    var fresh = pool.filter(function(s){ return recent.indexOf(s.id) === -1; });
    if (fresh.length >= 2 || (fresh.length && windows[w] === 1)){ pool = fresh; break; }
  }

  var total = 0;
  for (var i = 0; i < pool.length; i++) total += (pool[i].weight || 1);
  var roll = r() * total;
  for (var j = 0; j < pool.length; j++){
    roll -= (pool[j].weight || 1);
    if (roll <= 0) return pool[j];
  }
  return pool[pool.length - 1];
}

/*
  Ease a long timeline back toward the target ceiling.

  A long word overruns because every letter adds beats. Those are pulled
  proportionally toward the start, but no move drops below 70% of its
  authored length — past that a move stops reading as an action and starts
  looking like a glitch, which is the trade the old build got wrong.

  A scene that is still over the target after that compression is LEFT
  LONG on purpose. Better a 13s scene that reads than a 12s scene that
  stutters. Short scenes are returned untouched: nothing is ever padded.
*/
function fitDuration(tl){
  var events = tl.events;
  if (!events.length) return 0;
  var total = tl.end();
  if (total <= SCENE_TARGET_MAX) return total;

  var squeeze = SCENE_TARGET_MAX / total;
  for (var i = 0; i < events.length; i++){
    events[i].at = Math.round(events[i].at * squeeze);
    events[i].dur = Math.round(events[i].dur * Math.max(0.70, squeeze));
  }
  return tl.end();
}

/*
  Plan one scene.
  opts: { letters, lead, stage:'build'|'learn', history:[ids], rnd }
*/
/*
  Drop an 'exit' that follows a beat which already took the character off the
  screen. Towing, scooping and carrying all end past the edge, so a further
  exit is time in which nothing visible happens — which is where the dead
  tails at the end of scenes were coming from.
*/
function trimRedundantExits(tl){
  var events = tl.events;
  var keep = [];
  for (var i = 0; i < events.length; i++){
    var e = events[i];
    if (e.kind !== 'exit'){ keep.push(e); continue; }
    var redundant = false;
    for (var j = 0; j < events.length; j++){
      var p = events[j];
      if (p === e || p.char !== e.char) continue;
      if (!EXIT_KINDS[p.kind] || p.kind === 'exit') continue;
      /* the earlier beat already carries him out, and nothing brings him back */
      if (p.at <= e.at && p.at + p.dur >= e.at - 40){ redundant = true; break; }
    }
    if (!redundant) keep.push(e);
  }
  tl.events.length = 0;
  for (var k = 0; k < keep.length; k++) tl.events.push(keep[k]);
  return tl;
}

var MIRROR_DIR = { left:'right', right:'left' };
function mirrorTimeline(tl){
  for (var i = 0; i < tl.events.length; i++){
    var e = tl.events[i];
    if (e.dir && MIRROR_DIR[e.dir]) e.dir = MIRROR_DIR[e.dir];
  }
  return tl;
}

/* Play the whole scene a touch faster or slower. Never past the runaway bound. */
function applyTempo(tl, tempo){
  var k = Math.max(0.85, Math.min(1.15, Number(tempo) || 1));
  var end = tl.end();
  if (end * k > SCENE_HARD_MAX) k = SCENE_HARD_MAX / end;
  for (var i = 0; i < tl.events.length; i++){
    tl.events[i].at = Math.round(tl.events[i].at * k);
    tl.events[i].dur = Math.max(60, Math.round(tl.events[i].dur * k));
  }
  return tl.end();
}

/*
  Who leads the next scene. Whoever has gone longest without leading gets
  it, with a coin toss between equals — so all four take turns, but never in
  a fixed rota the child could learn.
*/
function pickLead(leadHistory, rnd){
  var r = rnd || Math.random;
  var h = leadHistory || [];
  var best = [], bestAge = -1;
  for (var i = 0; i < CHAR_ORDER.length; i++){
    var k = CHAR_ORDER[i];
    var at = h.indexOf(k);
    var age = at === -1 ? 1e6 : at;
    if (age > bestAge){ best = [k]; bestAge = age; }
    else if (age === bestAge) best.push(k);
  }
  return best[Math.floor(r() * best.length) % best.length];
}

/*
  Push onto a most-recent-first history list, capped. Kept pure so the app
  can persist it: the scene Grayson saw last night counts tonight too.
*/
function remember(list, item, cap){
  var out = [item].concat((list || []).filter(function(x){ return x !== item; }));
  return out.slice(0, cap || 8);
}

/* ---------------------------------------------------------------
   WORLDS — the backdrop changes too, so the same scene in a new place
   still looks new. All four are built on the orange-and-blue palette.
   --------------------------------------------------------------- */
var THEMES = ['morning', 'sunset', 'night', 'beach'];
function pickTheme(prev, rnd){
  var r = rnd || Math.random;
  var pool = THEMES.filter(function(t){ return t !== prev; });
  return pool[Math.floor(r() * pool.length) % pool.length];
}

/* ---------------------------------------------------------------
   WORD ENTRY — a grown-up types or pastes this week's list however it
   arrives: one per line, commas, spaces, numbered, with punctuation.
   --------------------------------------------------------------- */
var MAX_WORDS = 30;
function parseWordInput(text){
  var raw = String(text == null ? '' : text).split(/[\s,;\/|]+/);
  return normalizeWords(raw);
}

/* Merge new words onto an existing list: order kept, duplicates dropped. */
function addWords(list, text){
  var merged = normalizeWords((list || []).concat(parseWordInput(text)));
  return merged.slice(0, MAX_WORDS);
}

function removeWord(list, word){
  var w = cleanWord(word);
  return (list || []).filter(function(x){ return x !== w; });
}

/*
  Settings, repaired on the way in. Whatever is in storage — nothing, an
  older version, a hand-edited blob, garbage — comes out as a complete,
  valid object, so no screen ever has to guard against a missing field.
*/
var SETTINGS_VERSION = 6;
function normalizeSettings(obj){
  var o = (obj && typeof obj === 'object') ? obj : {};
  var words = Array.isArray(o.words) ? normalizeWords(o.words).slice(0, MAX_WORDS) : DEFAULT_WORDS.slice();
  var a = A_SOUND_CHOICES.indexOf(o.aSound) !== -1 ? o.aSound : LETTER_SOUND.A;
  var e = E_SOUND_CHOICES.indexOf(o.eSound) !== -1 ? o.eSound : LETTER_SOUND.E;
  function ids(list, valid){
    return (Array.isArray(list) ? list : []).filter(function(x){ return valid(x); }).slice(0, 8);
  }
  var sceneIds = {};
  SCENES.forEach(function(s){ sceneIds[s.id] = true; });
  return {
    v: SETTINGS_VERSION,
    words: words,
    aSound: a,
    eSound: e,
    sfx: o.sfx !== false,
    sceneHistory: ids(o.sceneHistory, function(x){ return sceneIds[x]; }),
    leadHistory: ids(o.leadHistory, function(x){ return !!CHARS[x]; }),
    theme: THEMES.indexOf(o.theme) !== -1 ? o.theme : null
  };
}

function letterOverrides(settings){
  var s = settings || {};
  return { A: s.aSound || LETTER_SOUND.A, E: s.eSound || LETTER_SOUND.E };
}

/* The index to show next in a round of `n` words; -1 when the round is done. */
function nextIndex(i, n){
  var k = (Number(i) || 0) + 1;
  return k < n ? k : -1;
}

/*
  The launch self-check. Cheap enough to run on every load and it covers
  the things that would ruin a session: a word list that cannot be played,
  a scene that would strand a letter, a stage that is not spellable.
*/
function selfCheck(words){
  var problems = [];
  var list = normalizeWords(words || []);
  list.forEach(function(w){
    var opts = makeOptions(w);
    if (opts.length !== 3 || opts.filter(function(o){ return o === w; }).length !== 1){
      problems.push(w + ': FIND choices are wrong');
    }
    if (!isPermutationOf(scrambleLetters(w), w)) problems.push(w + ': BUILD letters do not make the word');
    var pool = makeSearchLetters(w);
    var ok = w.split('').every(function(ch){
      var at = pool.indexOf(ch); if (at === -1) return false; pool.splice(at, 1); return true;
    });
    if (!ok) problems.push(w + ': LEARN letters cannot spell it');
  });
  for (var n = 1; n <= 12; n++){
    for (var c = 0; c < CHAR_ORDER.length; c++){
      var plan = planScene({ letters: n, lead: CHAR_ORDER[c] });
      var p = validatePlan(plan);
      if (p.length) problems.push('scene ' + plan.id + ' (' + n + ' letters): ' + p[0]);
    }
  }
  return problems;
}

function planScene(opts){
  opts = opts || {};
  var letters = Math.max(0, Math.floor(Number(opts.letters) || 0));
  var leadKey = CHARS[opts.lead] ? opts.lead : CHAR_ORDER[0];
  var stage = opts.stage === 'learn' ? 'learn' : 'build';
  var rnd = opts.rnd || Math.random;
  var history = opts.history || [];

  /*
    Variation that sits on top of the scene library, so one scene is not one
    performance. The supporting cast is drawn in a random order (so "who
    comes to help" changes), and the whole thing can be mirrored and played
    a little quicker or slower. None of these can break a plan: mirroring
    only swaps left for right, and tempo scales every beat together.
  */
  var others = CHAR_ORDER.filter(function(k){ return k !== leadKey; });
  var order = [leadKey].concat(opts.fixedCast ? others : shuffle(others, rnd));
  var mirror = opts.mirror == null ? rnd() < 0.5 : !!opts.mirror;
  var tempo = opts.tempo == null ? 0.92 + rnd() * 0.16 : Number(opts.tempo) || 1;
  var plan = {
    id: null, name: null, lead: leadKey, stage: stage, letters: letters,
    cast: order, events: [], duration: 0, mirror: mirror, tempo: tempo
  };
  if (!letters) return plan;

  /* forceId is for the scene lab and the suites: play exactly this one. */
  var scene = null;
  if (opts.forceId){
    for (var f = 0; f < SCENES.length; f++){
      if (SCENES[f].id === opts.forceId){ scene = SCENES[f]; break; }
    }
  }
  if (!scene) scene = pickScene(leadKey, letters, history, rnd);
  if (!scene){
    /* nothing this character leads fits a word this short: hand the scene to
       someone who has one, rather than letting the letters just sit there */
    for (var li = 0; li < CHAR_ORDER.length && !opts.noFallback; li++){
      if (CHAR_ORDER[li] === leadKey || !eligibleScenes(CHAR_ORDER[li], letters).length) continue;
      var copy = {};
      for (var ok in opts){ if (Object.prototype.hasOwnProperty.call(opts, ok)) copy[ok] = opts[ok]; }
      copy.lead = CHAR_ORDER[li]; copy.noFallback = true; copy.forceId = null;
      return planScene(copy);
    }
    return plan;
  }

  var ctx = {
    letters: letters, lead: leadKey, order: order,
    pick: function(i){ return order[Math.abs(i) % order.length]; },
    has: function(k){ return order.indexOf(k) !== -1; }
  };

  var tl = scene.build(ctx);
  trimRedundantExits(tl);
  if (mirror) mirrorTimeline(tl);
  plan.id = scene.id;
  plan.name = scene.name;
  fitDuration(tl);
  plan.duration = applyTempo(tl, tempo);
  plan.events = tl.events.slice().sort(function(a, b){ return a.at - b.at; });
  /* Reported, not enforced: useful for the tuning pass, never a gate. */
  plan.inTargetRange = plan.duration >= SCENE_TARGET_MIN && plan.duration <= SCENE_TARGET_MAX;
  return plan;
}

/* ---------------------------------------------------------------
   PLAN VALIDATION — the rules the tests hold the choreography to.
   Returns a list of problems; empty means the plan is sound.
   --------------------------------------------------------------- */
function validatePlan(plan){
  var problems = [];
  if (!plan || !plan.letters) return problems;
  if (!plan.events.length){ problems.push('no events'); return problems; }

  /* 1. every letter leaves, exactly once */
  var taken = {};
  plan.events.forEach(function(e){
    if (e.letter == null) return;
    if (!TAKE_KINDS[e.kind]) return;
    taken[e.letter] = (taken[e.letter] || 0) + 1;
  });
  for (var i = 0; i < plan.letters; i++){
    if (!taken[i]) problems.push('letter ' + i + ' is never taken');
    else if (taken[i] > 1) problems.push('letter ' + i + ' is taken ' + taken[i] + ' times');
  }

  /* 2. a roped tow must be staged: hook -> slack -> snap -> tow */
  plan.events.forEach(function(e){
    if (e.kind !== 'tow' || !e.roped) return;
    var need = ['hook', 'slack', 'snap'];
    var seen = need.filter(function(kind){
      return plan.events.some(function(p){
        return p.kind === kind && p.letter === e.letter && p.at < e.at;
      });
    });
    if (seen.length !== need.length){
      problems.push('letter ' + e.letter + ' is towed without slack then snap');
    }
  });

  /* 3. anything dropped is recovered */
  plan.events.forEach(function(e){
    if (e.kind !== 'fumble') return;
    var saved = plan.events.some(function(p){
      return (p.kind === 'rescue' || p.kind === 'carry' || p.kind === 'snatch') &&
             p.letter === e.letter && p.at >= e.at;
    });
    if (!saved) problems.push('letter ' + e.letter + ' is dropped and never recovered');
  });

  /* 4. movement identity is never blurred */
  var ACRO_ONLY = { cartwheel:1, aerial:1, handspring:1 };
  var FALL_ONLY = { fumble:1, snag:1, dustoff:1, bail:1 };
  plan.events.forEach(function(e){
    if (!e.char) return;
    var c = CHARS[e.char];
    if (!c){ problems.push('unknown character ' + e.char); return; }
    if (ACRO_ONLY[e.kind] && !c.tumbles){
      problems.push(c.name + ' must not ' + e.kind + ' — tumbling is Flip’s alone');
    }
    if (FALL_ONLY[e.kind] && !c.falls){
      problems.push(c.name + ' must not ' + e.kind + ' — he does not fall');
    }
  });

  /* 5. a character cannot act before arriving or after leaving */
  var IGNORE = { enter:1 };
  plan.events.forEach(function(e){
    if (!e.char || IGNORE[e.kind]) return;
    var arrived = plan.events.some(function(p){
      return p.kind === 'enter' && p.char === e.char && p.at <= e.at;
    });
    if (!arrived) problems.push(e.char + ' ' + e.kind + 's before entering');
  });

  /* 7. nobody is left standing on stage when the scene ends */
  var lastOf = {};
  plan.events.forEach(function(e){
    if (!e.char) return;
    var prev = lastOf[e.char];
    if (!prev || e.at + e.dur >= prev.at + prev.dur) lastOf[e.char] = e;
  });
  Object.keys(lastOf).forEach(function(who){
    if (!EXIT_KINDS[lastOf[who].kind]){
      problems.push(who + ' is stranded on stage — last beat is ' + lastOf[who].kind);
    }
  });

  /*
    6. Length. Only the runaway bound is a failure — 4-12s is a target the
    scenes aim for, not a contract they must satisfy, so a scene that reads
    better outside it is not a bug.
  */
  if (!(plan.duration > 0)) problems.push('scene has no duration');
  if (plan.duration > SCENE_HARD_MAX){
    problems.push('scene is ' + plan.duration + 'ms, past the ' + SCENE_HARD_MAX + 'ms runaway bound');
  }

  return problems;
}

var __CORE = {
  DEFAULT_WORDS:DEFAULT_WORDS, WORD_BANK:WORD_BANK, LETTER_SOUND:LETTER_SOUND,
  A_SOUND_CHOICES:A_SOUND_CHOICES, E_SOUND_CHOICES:E_SOUND_CHOICES,
  LETTER_FIX_CHOICES:LETTER_FIX_CHOICES, SEARCH_EXTRA_LETTERS:SEARCH_EXTRA_LETTERS,
  letterSound:letterSound, cleanWord:cleanWord, normalizeWords:normalizeWords,
  shuffle:shuffle, makeDecoys:makeDecoys, makeOptions:makeOptions,
  scrambleLetters:scrambleLetters, isPermutationOf:isPermutationOf,
  sentenceFor:sentenceFor, sentenceParts:sentenceParts, sentencePlain:sentencePlain,
  makeSearchLetters:makeSearchLetters, scatterPositions:scatterPositions, noOverlap:noOverlap,
  CHARS:CHARS, CHAR_ORDER:CHAR_ORDER, sidekickOf:sidekickOf, exitDirsFor:exitDirsFor,
  MAX_NON_TUMBLE_ROT:MAX_NON_TUMBLE_ROT, MAX_FALL_ROT:MAX_FALL_ROT,
  rotBudgetFor:rotBudgetFor, styleRot:styleRot, styleOffsetY:styleOffsetY,
  ropeSolve:ropeSolve, cordPath:cordPath, edgePoint:edgePoint,
  stackOffsets:stackOffsets, stackReadable:stackReadable,
  SCENES:SCENES, BEAT:BEAT, SCENE_TARGET_MIN:SCENE_TARGET_MIN,
  SCENE_TARGET_MAX:SCENE_TARGET_MAX, SCENE_HARD_MAX:SCENE_HARD_MAX,
  EXIT_KINDS:EXIT_KINDS, trimRedundantExits:trimRedundantExits, eligibleScenes:eligibleScenes, pickScene:pickScene, planScene:planScene,
  validatePlan:validatePlan, mirrorTimeline:mirrorTimeline, applyTempo:applyTempo,
  pickLead:pickLead, remember:remember, THEMES:THEMES, pickTheme:pickTheme,
  MAX_WORDS:MAX_WORDS, parseWordInput:parseWordInput, addWords:addWords, removeWord:removeWord,
  SETTINGS_VERSION:SETTINGS_VERSION, normalizeSettings:normalizeSettings,
  letterOverrides:letterOverrides, nextIndex:nextIndex, selfCheck:selfCheck
};
if (typeof module !== 'undefined' && module.exports) module.exports = __CORE;

/* ============================================================
   CORE-LOGIC-END
   ============================================================ */
