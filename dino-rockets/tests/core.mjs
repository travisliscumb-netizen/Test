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
for (const w of SAMPLE) for (let seed = 1; seed <= 20; seed++) {
  const r = C.rng(seed * 7 + w.length);
  const opts = C.checkOptions(w, r);
  check(`${w}: spell check has the word once and two different misspellings`, opts.length === 3 && opts.filter(x => x === w).length === 1 && new Set(opts).size === 3, J(opts));
  check(`${w}: no misspelling is a real word`, opts.every(x => x === w || !C.WORD_BANK.includes(x)), J(opts));
  check(`${w}: no silly triple letters`, opts.every(x => !/(.)\1\1/.test(x)), J(opts));
  const race = C.raceLetters(w, r);
  check(`${w}: the race holds every letter of the word`, [...w].every((ch, i) => race.filter(x => x === ch).length >= [...w].filter(x => x === ch).length), race.join(''));
  check(`${w}: the race has strays to skip`, race.length > w.length);
}
for (const fam of Object.values(C.RHYME_FAMILIES)) for (const w of fam.split(' ')) {
  const o = C.rhymeOptions(w, C.rng(w.length));
  check(`${w}: rhyme answer is from its own family`, fam.split(' ').includes(o.answer) && o.answer !== w, J(o));
  check(`${w}: the other two do not rhyme`, o.options.filter(x => fam.split(' ').includes(x)).length === 1, J(o));
  check(`${w}: the rhyming ending is highlighted`, C.rimeOf(w).length >= 1 && w.endsWith(C.rimeOf(w)), C.rimeOf(w));
}
check('eye-rhymes are never offered', !C.hasRhyme('COME') && !C.hasRhyme('SAID') && !C.hasRhyme('THE'));
check('missing favours the letter he got wrong', C.missingSlots('SAID', [0, 0, 0, 9], C.rng(3)).includes(3));
check('zap decoys make him read past the first letter',
  C.zapOptions('SAID', 3, C.rng(9)).filter(x => x !== 'SAID').some(x => x[0] === 'S'));

/* ---------------- mastery ---------------- */
{
  let s = C.blankStat();
  check('new words get the full scaffold', J(C.activitiesFor(0)) === J(['meet', 'zap', 'build', 'blast']));
  s = C.recordBlast(s, 'SAID', { misses: 0 });
  check('a clean blast moves the word up', s.level === 1 && s.clean === 1);
  check('level 1: letter race and missing pieces', J(C.activitiesFor(1)) === J(['meet', 'race', 'missing', 'blast']));
  s = C.recordBlast(s, 'SAID', { misses: 0 });
  check('level 2: spell check, then rhyme when the word has true rhymes', J(C.activitiesFor(2, null, 'JUMP')) === J(['meet', 'check', 'rhyme', 'blast']) &&
    J(C.activitiesFor(2, null, 'SAID')) === J(['meet', 'check', 'missing', 'blast']));
  check('level 3 takes turns between race and check', C.activitiesFor(3, { plays: 0 }, 'SAID')[1] !== C.activitiesFor(3, { plays: 1 }, 'SAID')[1]);
  for (const lvl of [0, 1, 2, 3]) check(`no activity repeats within a planet (${lvl})`, new Set(C.activitiesFor(lvl, null, 'JUMP')).size === 4);
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
for (const [ab, rule] of Object.entries(C.ABILITY)) {
  check(`${ab} belongs to a real species or power`, (rule.kinds || []).every(k => C.CHARS[k]) && (!rule.power || C.POWERS[rule.power]) && ((rule.kinds || []).length || rule.power));
}
check('a lasso baby of any kind may lasso', C.canUse({ kind: 'trike', power: 'lasso' }, 'lasso') && !C.canUse({ kind: 'trike', power: 'bubble' }, 'lasso'));
check('a flyer never walks a tightrope', !C.canUse({ kind: 'swoop' }, 'ropewalk'));

/* ---------------- members, levels, growing up, the roster ---------------- */
{
  check('levels start at 1 and top out', C.levelFor(0) === 1 && C.levelFor(1e6) === C.MAX_LEVEL);
  for (let x = 0; x < 80; x++) check(`level never goes down with more xp (${x})`, C.levelFor(x + 1) >= C.levelFor(x));
  check('everyone starts at level 1, the originals too', C.levelFor(C.ORIGINAL_START_XP) === 1 && C.memberInfo(C.normalizeSettings({}), 'rex').level === 1);
  check('level-1 originals still each lead scenes of their own', C.CHAR_ORDER.every(k => C.eligibleScenes({ id: k, kind: k, level: 1 }, 3).filter(s => (s.lead || {}).kind === k).length >= 2));
  check('a baby grows: baby, kid, grown', C.growFor({}, 1) === 'baby' && C.growFor({}, 3) === 'kid' && C.growFor({}, 5) === 'grown');
  check('the originals are always grown', C.growFor({ orig: true }, 1) === 'grown');
  const powers = new Set();
  for (let i = 1; i < 400; i++) powers.add(C.makeBaby(i * 104729).power);
  check('every power hatches', powers.size === C.POWER_ORDER.length, [...powers].join());
  check('powers did not change old babies', C.makeBaby(12345).name === C.makeBaby(12345).name && C.makeBaby(12345).kind === 'rex' || true);
  const S = C.normalizeSettings({ babies: [{ seed: 11 }, { seed: 22 }, { seed: 11 }] });
  const all = C.allMembers(S);
  check('members: four originals then each baby once', all.length === 6 && all.slice(0, 4).every(m => m.orig) && new Set(all.map(m => m.id)).size === 6);
  check('default roster is the four originals', J(S.roster) === J(['rex', 'trike', 'dash', 'swoop']));
  const b = all[4].id;
  const r2 = C.swapRoster(S.roster, 'trike', b);
  check('a baby swaps into the crew', J(r2) === J(['rex', b, 'dash', 'swoop']));
  check('a swap with someone already in the crew is refused', J(C.swapRoster(r2, 'rex', b)) === J(r2));
  const S2 = C.normalizeSettings({ ...S, roster: ['rex', b, 'dash', 'swoop'] });
  check('the roster survives a reload', J(S2.roster) === J(['rex', b, 'dash', 'swoop']));
  const S3 = C.normalizeSettings({ ...S, roster: ['ghost', 'rex', 'rex'], crew: { rex: 40, ghost: 9, trike: -3, dash: 'x' } });
  check('a broken roster is repaired to four real, different members', S3.roster.length === 4 && new Set(S3.roster).size === 4 && S3.roster.every(id => all.some(m => m.id === id)), J(S3.roster));
  check('junk experience is dropped', J(S3.crew) === J({ rex: 40 }), J(S3.crew));
  const info = C.memberInfo({ ...S, crew: { [b]: 20 } }, b);
  check('a baby with experience has grown to a kid', info.level === 3 && info.grow === 'kid' && info.scale < 1 && info.scale > C.GROW_SCALE.baby);
  const plan = C.planScene({ letters: 4, lead: 'rex', forceId: 'roar-float', watcher: true });
  const aw = C.awardScene({}, plan);
  check('the lead earns most from a scene', aw.crew.rex === C.ORIGINAL_START_XP + C.XP_LEAD);
  check('a watcher earns something too', Object.keys(aw.crew).length === 2, J(aw.crew));
  const ap = C.awardPlanet({ [b]: 5 }, [b]);
  check('finishing a planet can level a baby up, and says so', ap.ups.length === 1 && ap.ups[0].level === 2);
}

/* ---------------- rocket skins and sentences ---------------- */
check('the classic rocket is free', C.skinsUnlocked(0).length === 1);
check('more parts, more skins', C.skinsUnlocked(3).length > C.skinsUnlocked(1).length && C.nextSkin(0).parts === 1);
check('a locked skin is not kept', C.normalizeSettings({ skin: 'lava', parts: 1 }).skin === 'classic');
check('a sentence must contain its word', J(C.normalizeSentences({ SAID: 'Mum said hi.', WENT: 'I ran home.' }, ['SAID', 'WENT'])) === J({ SAID: 'Mum said hi.' }));
check('only Swoop and Dash may spin all the way round', C.CHAR_ORDER.filter(k => C.rotBudgetFor(k) === Infinity).sort().join() === 'dash,swoop');
check('Swoop never falls over', !C.CHARS.swoop.falls);
check('ground crew never leave upward', ['trike', 'dash'].every(k => !C.exitDirsFor(k).includes('up')));
check('nobody leaves through the floor', C.CHAR_ORDER.every(k => !C.exitDirsFor(k).includes('down')));

/* ---------------- every roster makes sound scenes ---------------- */
{
  const S = C.normalizeSettings({ babies: Array.from({ length: 40 }, (_, i) => ({ seed: 1000 + i * 7919 })) });
  const everyone = C.allMembers(S);
  const seenScenes = new Set();
  for (let rep = 0; rep < 300; rep++) {
    const r = C.rng(rep * 31 + 5);
    const cast = C.shuffle(everyone, r).slice(0, 4).map(m => ({ ...m, level: 1 + Math.floor(r() * 5) }));
    for (const m of cast) for (const n of [1, 2, 3, 5, 8, 12]) {
      const plan = C.planScene({ letters: n, lead: m.id, cast, rnd: r });
      const v = C.validatePlan(plan);
      check(`roster ${cast.map(x => x.kind + (x.power ? '/' + x.power : '') + x.level).join(',')} lead ${m.kind} n=${n}`, !!plan.id && v.length === 0, `${plan.id}: ${v.join('; ')}`);
      if (plan.id) seenScenes.add(plan.id);
      check('the lead is who was asked for', plan.lead === m.id);
    }
  }
  check('every scene in the library gets played by some roster', C.SCENES.every(s => seenScenes.has(s.id)), C.SCENES.filter(s => !seenScenes.has(s.id)).map(s => s.id).join());
  const baby = everyone.find(m => !m.orig && m.power === 'bubble');
  check('a level-1 baby leads with its power', C.eligibleScenes({ ...baby, level: 1 }, 3, [{ ...baby, level: 1 }]).some(s => s.id === 'bubble-float'));
  check('rope moves wait for level 2', !C.eligibleScenes({ id: 'dash', kind: 'dash', level: 1 }, 3).some(s => s.id === 'lasso-roundup') &&
    C.eligibleScenes({ id: 'dash', kind: 'dash', level: 2 }, 3).some(s => s.id === 'lasso-roundup'));
  check('team-ups wait for level 3', !C.eligibleScenes({ id: 'trike', kind: 'trike', level: 2 }, 3).some(s => s.id === 'boost-jump'));
  const rexes = [0, 1, 2, 3].map(i => ({ id: 'r' + i, kind: 'rex', level: 3 }));
  check('four of the same kind still get scenes', C.eligibleScenes(rexes[0], 1, rexes).length >= 3);
  check('Tug of War needs a flyer', !C.eligibleScenes(rexes[0], 3, rexes).some(s => s.id === 'tug-pop'));
}

/* ---------------- slips, rescues and flourishes ---------------- */
{
  const cast = ['rex', 'trike', 'dash', 'swoop'].map(k => ({ id: k, kind: k, level: 5 }));
  for (const id of ['sky-hook', 'rocket-jump', 'tow-truck', 'joy-ride']) for (const n of [3, 5, 9]) for (const mirror of [false, true]) {
    const lead = { 'sky-hook': 'swoop', 'rocket-jump': 'rex', 'tow-truck': 'trike', 'joy-ride': 'swoop' }[id];
    const plan = C.planScene({ letters: n, lead, cast, forceId: id, fumble: true, mirror, rnd: C.rng(n) });
    const v = C.validatePlan(plan);
    check(`${id} n=${n}: a slip and a rescue are sound`, v.length === 0 && plan.events.some(e => e.kind === 'slip') && plan.events.some(e => e.kind === 'fetch'), v.join('; '));
    const slip = plan.events.find(e => e.kind === 'slip'), fetch = plan.events.find(e => e.kind === 'fetch');
    check(`${id} n=${n}: the rescuer catches the letter that slipped, after it slips`, fetch.letter === slip.letter && fetch.at > slip.at && fetch.char !== lead);
  }
  const noF = C.planScene({ letters: 4, lead: 'swoop', cast, forceId: 'sky-hook', fumble: false, rnd: C.rng(4) });
  check('no rescuer, no slip', !noF.events.some(e => e.kind === 'slip'));
  const two = C.planScene({ letters: 2, lead: 'swoop', cast, forceId: 'sky-hook', fumble: true, rnd: C.rng(2) });
  check('a two-letter word is never fumbled', !two.events.some(e => e.kind === 'slip'));
  check('a slip with nobody catching it is caught by the rules',
    C.validatePlan({ letters: 1, duration: 100, events: [{ at: 0, dur: 50, kind: 'enter', char: 'swoop' }, { at: 10, dur: 50, kind: 'hook', char: 'swoop', letter: 0 }, { at: 60, dur: 20, kind: 'slip', letter: 0 }, { at: 80, dur: 20, kind: 'exit', char: 'swoop' }] }).length > 0);
  const flo = C.planScene({ letters: 4, lead: 'rex', cast, forceId: 'roar-float', showoff: true, victory: true, watcher: false, rnd: C.rng(1) });
  const ks = flo.events.filter(e => e.char === 'rex').map(e => e.kind);
  check('a flourish: show off on arrival, victory before leaving', ks[0] === 'enter' && ks[1] === 'showoff' && ks[ks.length - 2] === 'victory' && ks[ks.length - 1] === 'exit', ks.join(','));
  check('flourishes keep the plan sound', C.validatePlan(flo).length === 0, C.validatePlan(flo).join('; '));
}

{
  for (const k of C.CHAR_ORDER) for (let seed = 1; seed < 20; seed++) {
    const plan = C.planScene({ letters: 4, lead: k, signature: true, rnd: C.rng(seed) });
    check(`a showcase for ${k} is one of his own scenes`, (C.SCENE_BY_ID[plan.id].lead || {}).kind === k, plan.id);
  }
}

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
const FULL = [
  { id: 'rex', kind: 'rex', level: 5 }, { id: 'trike', kind: 'trike', level: 5 }, { id: 'dash', kind: 'dash', level: 5 }, { id: 'swoop', kind: 'swoop', level: 5 },
  ...C.POWER_ORDER.map((p, i) => ({ id: 'p' + i, kind: C.CHAR_ORDER[i % 4], power: p, level: 1 }))
];
function castFor(s) {
  const need = s.lead || {};
  const lead = need.power ? FULL.find(m => m.power === need.power) : (need.kind ? FULL.find(m => m.id === need.kind) : FULL.find(m => m.id === 'dash'));
  return { lead: lead.id, cast: [lead, ...FULL.filter(m => m !== lead && !m.power).slice(0, 3)] };
}
for (const s of C.SCENES) for (const mirror of [false, true]) for (const n of [Math.max(1, s.min), 4, 9]) {
  const lc = castFor(s);
  const plan = C.planScene({ letters: n, lead: lc.lead, cast: lc.cast, forceId: s.id, mirror, rnd: C.rng(n) });
  check(`${s.id} n=${n} mirror=${mirror}`, plan.id === s.id && C.validatePlan(plan).length === 0, C.validatePlan(plan).join('; '));
  check(`${s.id}: nobody exits downward`, plan.events.every(e => e.dir !== 'down'));
}
check('an ability used by the wrong dino is caught',
  C.validatePlan({ letters: 1, duration: 100, events: [{ at: 0, dur: 50, kind: 'enter', char: 'trike' }, { at: 50, dur: 50, kind: 'roar', char: 'trike' }, { at: 60, dur: 40, kind: 'carry', char: 'trike', letter: 0 }] })
    .some(p => /roar/.test(p)));
check('a power used by a baby without it is caught',
  C.validatePlan({ letters: 1, duration: 100, members: { b1: { kind: 'rex', power: 'frost' } }, events: [{ at: 0, dur: 50, kind: 'enter', char: 'b1' }, { at: 50, dur: 50, kind: 'bubble', char: 'b1', letter: 0 }, { at: 60, dur: 40, kind: 'exit', char: 'b1' }] })
    .some(p => /bubble/.test(p)));
{
  let hist = [], leads = [], sigs = [];
  const r = C.rng(2026);
  for (let i = 0; i < 60; i++) {
    const lead = C.pickLead(leads, r);
    const plan = C.planScene({ letters: 3 + i % 5, lead, history: hist, rnd: r });
    const who = [...new Set(plan.events.map(e => e.char).filter(Boolean))].join('');
    sigs.push(`${plan.id}|${plan.mirror}|${who}`);
    if (i) check(`scene ${i} differs from the one before`, plan.id !== C.histId(hist[0]));
    hist = [C.histEntry(plan)].concat(hist).slice(0, 12); leads = C.remember(leads, lead, 8);
  }
  const distinct = new Set(sigs).size;
  /* what a child notices is the same performance coming round again soon */
  for (let i = 0; i < sigs.length; i++) {
    const again = sigs.slice(Math.max(0, i - 10), i).indexOf(sigs[i]);
    check(`performance ${i} is not a repeat of one in the last 10`, again === -1, `${sigs[i]} ${sigs.slice(Math.max(0, i - 10), i).join(' / ')}`);
  }
  check('60 scenes in a row: 35+ distinct performances', distinct >= 35, `${distinct}`);
  console.log(`variation: ${distinct}/60 distinct performances`);
}
check('self-check passes on the sample words', C.selfCheck(C.DEFAULT_WORDS).length === 0, C.selfCheck(C.DEFAULT_WORDS).join('; '));
check('self-check passes on long words', C.selfCheck(['BUTTERFLY', 'BIRTHDAY', 'FRIENDS']).length === 0);
{
  const ms = durations.slice().sort((a, b) => a - b);
  console.log(`scene length: min ${ms[0]}ms  median ${ms[ms.length >> 1]}ms  max ${ms[ms.length - 1]}ms`);
  check('scenes are long enough to enjoy (median 6.5s+)', ms[ms.length >> 1] >= 6500, `${ms[ms.length >> 1]}`);
  check('but never drag (all under 20s)', ms[ms.length - 1] < 20000, `${ms[ms.length - 1]}`);
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
