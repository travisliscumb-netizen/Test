/* Pure-logic suite. No DOM, no browser, no stopwatch: the spelling model
   and the whole animation choreography are data, so they are checked here. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require(path.join(HERE, '..', 'src', '20-core.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`);
}

/* Deterministic RNG so a failure is always reproducible. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ---------------- words ---------------- */
check('cleanWord strips punctuation', C.cleanWord("don't!") === 'DONT');
check('cleanWord handles null', C.cleanWord(null) === '');
check('normalizeWords dedupes and filters',
  JSON.stringify(C.normalizeWords(['cat', 'CAT', 'a', 'dog', 'abcdefghijklmn'])) === JSON.stringify(['CAT', 'DOG']));

const SAMPLE = C.DEFAULT_WORDS.concat(['APPLE', 'HORSE', 'SPELL', 'TO', 'GO']);
for (const w of SAMPLE) {
  const opts = C.makeOptions(w, seeded(7));
  check(`${w}: three choices`, opts.length === 3, `got ${opts.length}`);
  check(`${w}: exactly one correct`, opts.filter(o => o === w).length === 1);
  check(`${w}: no duplicate choices`, new Set(opts).size === 3);
  for (const o of opts) {
    if (o === w) continue;
    check(`${w}: decoy ${o} is a real word`, C.WORD_BANK.indexOf(o) !== -1);
  }
  check(`${w}: build tiles are a permutation`, C.isPermutationOf(C.scrambleLetters(w, seeded(3)), w));

  const search = C.makeSearchLetters(w, C.SEARCH_EXTRA_LETTERS, seeded(11));
  check(`${w}: search tile count`, search.length === w.length + C.SEARCH_EXTRA_LETTERS);
  const pool = search.slice();
  const spellable = w.split('').every(ch => {
    const at = pool.indexOf(ch);
    if (at === -1) return false;
    pool.splice(at, 1);
    return true;
  });
  check(`${w}: spellable from the letters on screen`, spellable);
  check(`${w}: sentence highlights the word`, C.sentenceParts(C.sentenceFor(w)).some(p => p.mark));
}

/* scatter never overlaps, at any count */
for (const n of [3, 5, 7, 9, 11, 13, 16]) {
  const res = C.scatterPositions(n, 320, 400, 68, 12, seeded(n + 1));
  check(`scatter ${n}: right count`, res.positions.length === n);
  check(`scatter ${n}: no overlap`, C.noOverlap(res.positions, 68));
}

/* ---------------- letter voice ---------------- */
for (let i = 0; i < 26; i++) {
  const ch = String.fromCharCode(65 + i);
  check(`letter ${ch} has a spoken name`, !!C.LETTER_SOUND[ch] && C.letterSound(ch).length > 0);
}
check('A override applies', C.letterSound('A', { A: 'ay' }) === 'ay');
check('A default avoids the "aye" trap', C.LETTER_SOUND.A === 'eigh');
check('E default holds the vowel', C.LETTER_SOUND.E === 'eee');
for (const [letter, choices] of Object.entries(C.LETTER_FIX_CHOICES)) {
  check(`${letter} default is among its choices`, choices.indexOf(C.LETTER_SOUND[letter]) !== -1);
}

/* ---------------- characters ---------------- */
check('exactly four characters', C.CHAR_ORDER.length === 4);
check('only Flip tumbles',
  C.CHAR_ORDER.filter(k => C.CHARS[k].tumbles).join(',') === 'flip');
check('Blip never tumbles and never falls', !C.CHARS.blip.tumbles && !C.CHARS.blip.falls);
check('Zip may bail but never tumbles', C.CHARS.zip.falls && !C.CHARS.zip.tumbles);
check('Trip falls but never tumbles', C.CHARS.trip.falls && !C.CHARS.trip.tumbles);
check('Trip has no vehicle', !C.CHARS.trip.airborne && C.CHARS.trip.rig === 'on foot');
check('Flip has no vehicle', C.CHARS.flip.rig === 'no vehicle');
for (const k of C.CHAR_ORDER) {
  check(`${k}: no sword or shield`, !/sword|shield/i.test(C.CHARS[k].rig), C.CHARS[k].rig);
}
check('Zip rides a skateboard, not a hoverboard',
  C.CHARS.zip.rig === 'skateboard' && !/hover/i.test(C.CHARS.zip.rig));

/* Flip's colour must clear the standing no-purple/no-pink rule. */
function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const flipHue = hueOf(C.CHARS.flip.color);
check('Flip is not purple or pink', flipHue < 260 || flipHue > 340, `hue ${Math.round(flipHue)}`);
const hues = C.CHAR_ORDER.map(k => hueOf(C.CHARS[k].color));
for (let i = 0; i < hues.length; i++) {
  for (let j = i + 1; j < hues.length; j++) {
    const sep = Math.min(Math.abs(hues[i] - hues[j]), 360 - Math.abs(hues[i] - hues[j]));
    check(`${C.CHAR_ORDER[i]} vs ${C.CHAR_ORDER[j]}: hues separated`, sep >= 25, `${Math.round(sep)} deg apart`);
  }
}

/* ---------------- motion identity, as a bound ---------------- */
for (const k of C.CHAR_ORDER) {
  const budget = C.rotBudgetFor(k);
  const mode = C.CHARS[k].mode;
  if (budget === Infinity) continue;
  let worst = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    for (const dir of [-1, 1]) {
      worst = Math.max(worst, Math.abs(C.styleRot(mode, p, dir, 2)));
    }
  }
  check(`${k}: rotation stays inside its budget`, worst <= budget, `${worst.toFixed(1)} > ${budget}`);
  check(`${k}: never goes all the way round`, worst < 180, `${worst.toFixed(1)} deg`);
}
check('Flip is allowed to go round', C.styleRot('acro', 1, 1, 2) === 720);

/* ---------------- tow cord ---------------- */
{
  const slack = C.ropeSolve(100, 100, 120, 100, 92);
  check('cord is slack when close', !slack.taut && slack.x === 100 && slack.y === 100);
  const taut = C.ropeSolve(100, 100, 400, 100, 92);
  check('cord goes taut when stretched', taut.taut && taut.pull > 0);
  check('taut cord drags the letter toward the hook', taut.x > 100);
  const sagPath = C.cordPath(0, 0, 20, 0, 92);
  const tightPath = C.cordPath(0, 0, 300, 0, 92);
  const sagY = Number(sagPath.split('Q')[1].trim().split(' ')[1]);
  const tightY = Number(tightPath.split('Q')[1].trim().split(' ')[1]);
  check('slack cord sags more than a taut one', sagY > tightY, `${sagY} vs ${tightY}`);
}

/* ---------------- stacking stays readable ---------------- */
for (const n of [2, 3, 4, 5, 6, 8]) {
  const offs = C.stackOffsets(n, 68);
  check(`stack of ${n}: every letter visible`, C.stackReadable(offs, 68));
  check(`stack of ${n}: letters are offset, not squared up`,
    new Set(offs.map(o => o.dx)).size > 1 || n < 2);
}

/* ---------------- the choreography ---------------- */
let planned = 0;
for (const lead of C.CHAR_ORDER) {
  for (let letters = 2; letters <= 8; letters++) {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = C.planScene({ letters, lead, stage: 'build', history: [], rnd: seeded(seed * 97 + letters) });
      planned++;
      const problems = C.validatePlan(plan);
      check(`plan ${plan.id} lead=${lead} n=${letters} seed=${seed}`,
        problems.length === 0, problems.join('; '));
      check(`plan ${plan.id} n=${letters}: within 4-12s`,
        plan.duration >= C.SCENE_MIN && plan.duration <= C.SCENE_MAX, `${plan.duration}ms`);
    }
  }
}

/* every scene in the library must be reachable and sound */
const seenIds = new Set();
for (const lead of C.CHAR_ORDER) {
  for (let letters = 2; letters <= 8; letters++) {
    for (const s of C.eligibleScenes(lead, letters)) seenIds.add(s.id);
  }
}
for (const s of C.SCENES) {
  check(`scene ${s.id} is reachable`, seenIds.has(s.id));
}

/* repeat-avoidance: the same scene must not come back inside three */
{
  const rnd = seeded(2024);
  const history = [];
  let repeats = 0;
  for (let i = 0; i < 300; i++) {
    const s = C.pickScene('blip', 5, history, rnd);
    if (history.slice(0, 3).indexOf(s.id) !== -1) repeats++;
    history.unshift(s.id);
  }
  check('no scene repeats within three', repeats === 0, `${repeats} repeats`);
}

/* a word of one letter must not produce a broken scene */
{
  const plan = C.planScene({ letters: 1, lead: 'flip', stage: 'build', history: [], rnd: seeded(5) });
  check('single-letter word plans cleanly', C.validatePlan(plan).length === 0, C.validatePlan(plan).join('; '));
}
/* zero letters must be inert, not a crash */
{
  const plan = C.planScene({ letters: 0, lead: 'blip', stage: 'build', history: [], rnd: seeded(5) });
  check('empty word yields an empty plan', plan.events.length === 0 && plan.duration === 0);
}

console.log(`\n${pass} passed, ${fail} failed  (${planned} scene plans validated)`);
if (fail) {
  const shown = failures.slice(0, 25);
  console.log('\nFailures:');
  for (const f of shown) console.log('  - ' + f);
  if (failures.length > shown.length) console.log(`  ... and ${failures.length - shown.length} more`);
  process.exit(1);
}
