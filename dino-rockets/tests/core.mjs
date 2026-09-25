/* Pure-logic suite for Dino Rockets: the learning model, the week's route,
   the crew's rules and every scene plan. No browser, no clock. */
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
const J = JSON.stringify;

/* ---------------- words ---------------- */
check('parse: numbered list, commas, lines, full stops',
  J(C.parseWordInput('1. said, went\n3) come. look;the')) === J(['SAID', 'WENT', 'COME', 'LOOK', 'THE']), J(C.parseWordInput('1. said, went\n3) come. look;the')));
check('parse drops too short and too long', J(C.parseWordInput('a supercalifragilistic ok')) === J(['OK']));
check('add keeps order, drops duplicates', J(C.addWords(['SAID'], 'went said Come')) === J(['SAID', 'WENT', 'COME']));
check('add is capped', C.addWords([], Array.from({ length: 40 }, (_, i) => 'Q' + String.fromCharCode(65 + i % 26) + String.fromCharCode(65 + Math.floor(i / 26))).join(' ')).length === C.MAX_WORDS);
check('remove', J(C.removeWord(['SAID', 'WENT'], 'said')) === J(['WENT']));

/* ---------------- activities: each is solvable, every time ---------------- */
const SAMPLE = ['THE', 'SAID', 'WENT', 'LOOK', 'BUTTERFLY', 'GO', 'BIRTHDAY', 'SEE', 'FRIEND', 'WHERE'];
for (const w of SAMPLE) {
  for (let seed = 1; seed <= 25; seed++) {
    const r = C.rng(seed * 31 + w.length);
    const z = C.zapOptions(w, 3, r);
    check(`${w}: zap has 3, one right, no repeats (${seed})`, z.length === 3 && z.filter(x => x === w).length === 1 && new Set(z).size === 3, J(z));
    check(`${w}: zap decoys are real words`, z.every(x => x === w || C.WORD_BANK.includes(x)));
    check(`${w}: build crystals make the word`, C.isPermutationOf(C.scramble(w, r), w));
    check(`${w}: build never starts solved`, C.scramble(w, r).join('') !== w || new Set(w).size === 1);
    const keys = C.blastKeys(w, null, r);
    check(`${w}: blast keys can spell it`, w.split('').every(ch => keys.includes(ch)), J(keys));
    check(`${w}: blast keys are unique`, new Set(keys).size === keys.length);
    check(`${w}: blast keys include letters not in the word`, keys.some(k => !w.includes(k)));
    const miss = C.missingSlots(w, [], r);
    check(`${w}: missing leaves at least one letter showing`, miss.length >= 1 && miss.length < w.length, J(miss));
    check(`${w}: missing slots are in range and sorted`, miss.every((p, i) => p >= 0 && p < w.length && (i === 0 || p > miss[i - 1])));
    for (const p of miss) {
      const ch = C.missingChoices(w[p], r);
      check(`${w}: choices for ${w[p]} are 3 with the right one once`, ch.length === 3 && ch.filter(x => x === w[p]).length === 1 && new Set(ch).size === 3, J(ch));
    }
  }
}
check('missing favours the letter he got wrong', C.missingSlots('SAID', [0, 0, 0, 9], C.rng(3)).includes(3));
check('zap decoys make him read past the first letter',
  C.zapOptions('SAID', 3, C.rng(9)).filter(x => x !== 'SAID').some(x => x[0] === 'S'));

/* ---------------- mastery ---------------- */
{
  let s = C.blankStat();
  check('new words get the full scaffold', J(C.activitiesFor(0)) === J(['meet', 'zap', 'build', 'blast']));
  s = C.recordBlast(s, 'SAID', { misses: 0 });
  check('a clean blast moves the word up', s.level === 1 && s.clean === 1);
  check('level 1 swaps build for missing-letter', J(C.activitiesFor(1)) === J(['meet', 'zap', 'missing', 'blast']));
  s = C.recordBlast(s, 'SAID', { misses: 0 });
  check('strong words skip zap', J(C.activitiesFor(2)) === J(['meet', 'missing', 'blast']));
  s = C.recordBlast(s, 'SAID', { misses: 2, peeked: true, missPositions: [2, 2] });
  check('needing a peek gives the scaffold back', s.level === 1 && s.misses === 2 && s.posMisses[2] === 2, J(s));
  for (let k = 0; k < 10; k++) s = C.recordBlast(s, 'SAID', { misses: 0 });
  check('level is capped', s.level === 3);
  for (const lvl of [0, 1, 2, 3, 9]) check(`every level ends in a from-memory blast (${lvl})`, C.activitiesFor(lvl).slice(-1)[0] === 'blast');
  const stats = { THE: { level: 3, clean: 5 }, SAID: { level: 0, misses: 6 }, WENT: { level: 1, misses: 1 } };
  check('review brings the shakiest word first', C.reviewQueue(['THE', 'SAID', 'WENT'], stats, 2)[0] === 'SAID', J(C.reviewQueue(['THE', 'SAID', 'WENT'], stats, 2)));
  check('review is capped', C.reviewQueue(SAMPLE, {}, 4).length === 4);
}

/* ---------------- the week's route ---------------- */
{
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(C.planetFor(i, 3).id);
  check('eight words land on eight different planets', seen.size === 8);
  check('planet colours are not purple or pink', C.PLANETS.every(p => [p.ground, p.glow, p.rim, p.rock, ...p.sky].every(notPurple)), C.PLANETS.map(p => [p.ground, p.glow, p.rim, p.rock, ...p.sky].filter(x => !notPurple(x))).flat().join());
  check('a changed list is a new week', C.weekId(['SAID']) !== C.weekId(['SAID', 'WENT']));
  check('next planet skips the done ones', C.nextPlanet({ done: [0, 1, 3] }, 5) === 2 && C.nextPlanet({ done: [0, 1, 2] }, 3) === -1);
}

/* ---------------- settings survive anything ---------------- */
for (const junk of [null, 7, 'x', [], { words: 'said' }, { words: [1, null, 'ok'] }, { stats: 5 }, { week: { id: 'x', done: [9, 1] } },
  { babies: [{ seed: 'no' }, { seed: 5 }] }, { aSound: 'zz', sceneHistory: ['nope'], leadHistory: ['bob'] }]) {
  const s = C.normalizeSettings(junk);
  const ok = Array.isArray(s.words) && s.words.every(w => s.stats[w]) && s.week && Array.isArray(s.week.done) &&
    s.week.done.every(i => i < s.words.length) && s.babies.every(b => typeof b.seed === 'number') &&
    C.A_SOUND_CHOICES.includes(s.aSound) && s.sceneHistory.length === 0 && s.leadHistory.length === 0;
  check(`settings repaired from ${J(junk)}`, ok, J(s));
}
{
  const s1 = C.normalizeSettings({ words: ['said', 'went'] });
  s1.week.done = [0];
  const s2 = C.normalizeSettings(JSON.parse(J(s1)));
  check('progress this week survives a reload', J(s2.week.done) === J([0]));
  const s4 = C.normalizeSettings({ words: ['said', 'went'], week: { id: s1.week.id, done: [0], eggs: { 0: 77, 5: 3, x: 'no' } } });
  check('the egg hatched on each planet is remembered, junk dropped', J(s4.week.eggs) === J({ 0: 77 }), J(s4.week.eggs));
  const s3 = C.normalizeSettings({ ...s2, words: ['come', 'look'] });
  check('a new list starts a fresh route', s3.week.done.length === 0 && s3.week.id !== s2.week.id);
  check('babies survive a new week', C.normalizeSettings({ words: ['x1'], babies: [{ seed: 4, at: 1 }] }).babies.length === 1);
  check('an emptied list stays empty', C.normalizeSettings({ words: [] }).words.length === 0);
}

/* ---------------- baby dinos ---------------- */
{
  const a = C.makeBaby(12345), b = C.makeBaby(12345), c = C.makeBaby(999);
  check('a baby is reproducible from its seed', J(a) === J(b));
  check('different seeds, different babies', J(a) !== J(c));
  const kinds = new Set(), names = new Set();
  for (let i = 1; i < 400; i++) { const x = C.makeBaby(i * 7919); kinds.add(x.kind); names.add(x.name); check(`baby ${i} spots differ from body`, x.spots !== x.body); }
  check('all four kinds hatch', kinds.size === 4);
  check('plenty of names', names.size >= 25, `${names.size}`);
  check('baby colours are not purple or pink', C.BABY_COLORS.every(notPurple));
}

/* ---------------- the crew ---------------- */
check('four crew', C.CHAR_ORDER.length === 4);
check('crew colours are not purple or pink', C.CHAR_ORDER.every(k => notPurple(C.CHARS[k].color)));
for (const [ab, owner] of Object.entries(C.ABILITY_OWNER)) check(`${ab} belongs to a real crew member`, !!C.CHARS[owner]);
check('only Swoop and Dash may spin all the way round', C.CHAR_ORDER.filter(k => C.rotBudgetFor(k) === Infinity).sort().join() === 'dash,swoop');
check('Swoop never falls over', !C.CHARS.swoop.falls);
check('ground crew never leave upward', ['trike', 'dash'].every(k => !C.exitDirsFor(k).includes('up')));
check('nobody leaves through the floor', C.CHAR_ORDER.every(k => !C.exitDirsFor(k).includes('down')));

/* ---------------- every scene plan ---------------- */
let planned = 0;
const durations = [];
for (const lead of C.CHAR_ORDER) for (let n = 1; n <= 12; n++) for (let seed = 1; seed <= 30; seed++) {
  const plan = C.planScene({ letters: n, lead, rnd: C.rng(seed * 97 + n) });
  planned++;
  const v = C.validatePlan(plan);
  check(`plan ${plan.id} lead=${lead} n=${n} seed=${seed}`, v.length === 0, v.join('; '));
  durations.push(plan.duration);
}
for (const s of C.SCENES) for (const mirror of [false, true]) for (const n of [Math.max(1, s.min), 4, 9]) {
  const plan = C.planScene({ letters: n, lead: s.lead === 'any' ? 'dash' : s.lead, forceId: s.id, mirror, rnd: C.rng(n) });
  check(`${s.id} n=${n} mirror=${mirror}`, plan.id === s.id && C.validatePlan(plan).length === 0, C.validatePlan(plan).join('; '));
  check(`${s.id}: nobody exits downward`, plan.events.every(e => e.dir !== 'down'));
}
check('an ability used by the wrong dino is caught',
  C.validatePlan({ letters: 1, duration: 100, events: [{ at: 0, dur: 50, kind: 'enter', char: 'trike' }, { at: 50, dur: 50, kind: 'roar', char: 'trike' }, { at: 60, dur: 40, kind: 'carry', char: 'trike', letter: 0 }] })
    .some(p => /Rex/.test(p)));
{
  let hist = [], leads = [], sigs = [];
  const r = C.rng(2026);
  for (let i = 0; i < 60; i++) {
    const lead = C.pickLead(leads, r);
    const plan = C.planScene({ letters: 3 + i % 5, lead, history: hist, rnd: r });
    sigs.push(`${plan.id}|${plan.mirror}|${plan.cast.join('')}`);
    if (i) check(`scene ${i} differs from the one before`, plan.id !== hist[0]);
    hist = C.remember(hist, plan.id, 8); leads = C.remember(leads, lead, 8);
  }
  const distinct = new Set(sigs).size;
  check('60 scenes in a row: 50+ distinct performances', distinct >= 50, `${distinct}`);
  console.log(`variation: ${distinct}/60 distinct performances`);
}
check('self-check passes on the sample words', C.selfCheck(C.DEFAULT_WORDS).length === 0, C.selfCheck(C.DEFAULT_WORDS).join('; '));
check('self-check passes on long words', C.selfCheck(['BUTTERFLY', 'BIRTHDAY', 'FRIENDS']).length === 0);
{
  const ms = durations.slice().sort((a, b) => a - b);
  console.log(`scene length: min ${ms[0]}ms  median ${ms[ms.length >> 1]}ms  max ${ms[ms.length - 1]}ms`);
}

function notPurple(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return true;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h < 250 || h > 345;
}

console.log(`\n${pass} passed, ${fail} failed  (${planned} scene plans)`);
if (fail) { console.log('\nFailures:'); failures.slice(0, 25).forEach(f => console.log('  - ' + f)); process.exit(1); }
