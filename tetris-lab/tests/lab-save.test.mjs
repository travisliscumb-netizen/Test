import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { generateConcept, ARCHETYPES, growPiece } from '../src/lab/generator.js';
import { validateConcept } from '../src/lab/validate.js';
import { simulate } from '../src/lab/simulate.js';
import { critique, novelty } from '../src/lab/critic.js';
import { refine } from '../src/lab/refine.js';
import { designConcept, runSession } from '../src/lab/designer.js';
import { toConcept } from '../src/lab/claude.js';
import { resolvePlay, randomExperiment, conceptFromSet } from '../src/ui/labplay.js';
import { CLASSIC_CONCEPT, classicRules } from '../src/engine/rules.js';
import { Game } from '../src/engine/game.js';
import { Bot } from '../src/engine/bot.js';
import { Rng } from '../src/engine/rng.js';
import { isConnected } from '../src/engine/lattice.js';
import { SaveStore, memoryStorage, sanitize, SAVE_KEY, BACKUP_KEY, KEY_KEY, rankFor, MAX_SAVED_CONCEPTS } from '../src/save.js';

describe('lab: generation and validation', () => {
  test('every archetype produces valid, connected designs', () => {
    for (const a of ARCHETYPES) {
      let valid = 0;
      for (let s = 1; s <= 8; s++) {
        const c = generateConcept(s * 7919, { archetypeId: a.id });
        assert.equal(c.design.archetype, a.id);
        for (const p of c.pieces) assert.ok(isConnected(c.lattice, p.cells, p.connect), `${a.id}: ${p.name} is ${p.connect}-connected`);
        if (validateConcept(c).ok) valid++;
      }
      assert.ok(valid >= 6, `${a.id}: only ${valid}/8 valid`);
    }
  });

  test('stress: 300 random concepts never crash validation; valid ones play safely', () => {
    let valid = 0;
    for (let s = 0; s < 300; s++) {
      const c = generateConcept((s * 2654435761) >>> 0);
      const v = validateConcept(c);
      assert.ok(Array.isArray(v.errors));
      if (!v.ok) continue;
      valid++;
      const g = new Game(v.rules, { seed: s, instant: true });
      g.start();
      const bot = new Bot(v.rules, { skill: 0.6, rng: new Rng(s) });
      let last = 0;
      for (let k = 0; k < 40 && !g.isOver; k++) {
        bot.playOne(g);
        assert.ok(Number.isFinite(g.stats.score) && g.stats.score >= last, 'score is finite and never decreases');
        last = g.stats.score;
        for (const cell of g.board.cells) assert.ok(cell === 0 || ((cell & 31) >= 1 && (cell >> 5) <= 2), 'board holds only valid cells');
      }
    }
    assert.ok(valid >= 270, `${valid}/300 valid`);
  });

  test('hostile and malformed designs are rejected, never thrown', () => {
    const cases = [
      null, 42, 'concept', {}, { pieces: 'lots' }, { pieces: [null, 7, 'x'] },
      { pieces: [{ cells: [[0, 0], [3, 3]] }] },                                   // disconnected
      { board: { width: 6 }, pieces: [{ cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] }] }, // too wide
      { pieces: [{ cells: Array.from({ length: 9 }, (_, i) => [i, 0]) }] },         // too big
      { pieces: [{ cells: [[0, 0], [1, 0]], rotation: 'morph', morphs: [[[0, 0]]] }] }, // morph mismatch
      { pieces: [{ cells: [[0, NaN]] }] },
      { lattice: 'hex', pieces: [{ cells: [[0, 0], [1, 0]], rotation: 'srs' }] },
      { pieces: Array.from({ length: 30 }, () => ({ cells: [[0, 0]] })) }
    ];
    for (const c of cases) {
      const v = validateConcept(c);
      assert.equal(v.ok, false, JSON.stringify(c)?.slice(0, 60));
      assert.ok(v.errors.length > 0);
    }
  });

  test('pieces grow with the requested connectivity', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 50; i++) {
      assert.ok(isConnected('square', growPiece(rng, 'square', 5), 'edge'));
      assert.ok(isConnected('hex', growPiece(rng, 'hex', 4), 'edge'));
      assert.ok(isConnected('square', growPiece(rng, 'square', 4, { connect: 'corner' }), 'corner'));
    }
  });
});

describe('lab: simulation, critique, refinement', () => {
  test('simulation of Classic is stable and matches its calibration', () => {
    const m = simulate(classicRules(), { seed: 3 });
    assert.equal(m.errors.length, 0);
    assert.equal(m.invariantFailures, 0);
    assert.equal(m.expert.survival, 1);
    assert.ok(m.player.pieceRatio > 0.5 && m.player.pieceRatio < 1, `player ratio ${m.player.pieceRatio}`);
  });

  test('the critic rejects Classic as derivative and flags unfair designs', () => {
    const c = JSON.parse(JSON.stringify(CLASSIC_CONCEPT));
    assert.ok(novelty(c) < 0.25);
    const m = simulate(classicRules(), { seed: 3 });
    const r = critique(c, m);
    assert.notEqual(r.verdict, 'accepted');
    assert.ok(r.weaknesses.some((w) => w.id === 'derivative'));
    // A well two columns too narrow for its pieces: expert cannot survive.
    const cruel = { name: 'Cruel', board: { width: 7, height: 12 }, pieces: [{ id: 'a', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] }, { id: 'b', cells: [[0, 0], [1, 1], [0, 1], [1, 2], [0, 2]] }] };
    const v = validateConcept(cruel);
    assert.ok(v.ok, v.errors.join());
    const rc = critique(v.concept, simulate(v.rules, { seed: 1 }), v);
    assert.notEqual(rc.verdict, 'accepted');
    assert.ok(rc.weaknesses.some((w) => w.id === 'too-hard'));
    assert.ok(rc.score <= 0.55);
  });

  test('refinement makes targeted, described changes', () => {
    const c = generateConcept(12345, { archetypeId: 'megalith' });
    const review = { weaknesses: [{ id: 'too-hard', severity: 2, text: 'x' }] };
    const { concept, changes } = refine(c, review, 1);
    assert.ok(changes.length >= 1);
    assert.ok(changes.every((ch) => typeof ch.text === 'string' && ch.text.length > 5));
    assert.notDeepEqual(concept, c);
  });

  test('the design loop improves a bad design and records its journal', () => {
    const r = designConcept(generateConcept(77, { archetypeId: 'shapeshifter' }), { seed: 77 });
    assert.ok(['accepted', 'needs-work', 'rejected'].includes(r.verdict));
    assert.ok(r.journal.length >= 1);
    const reviews = r.journal.filter((j) => j.stage === 'review');
    assert.ok(reviews.every((j) => Number.isFinite(j.score) && j.metrics));
    if (r.verdict === 'accepted') {
      assert.ok(r.journal.some((j) => j.stage === 'confirm'), 'accepted designs are confirmed on fresh seeds');
      assert.ok(validateConcept(r.concept).ok);
    }
  });

  test('a full session yields accepted, playable designs', () => {
    const results = runSession({ count: 4, seed: 2024 });
    assert.equal(results.length, 4);
    const ok = results.filter((r) => r.verdict === 'accepted');
    assert.ok(ok.length >= 2, `${ok.length}/4 accepted`);
    for (const r of ok) {
      const v = validateConcept(r.concept);
      assert.ok(v.ok);
      assert.ok(r.concept.design.score >= 0.75);
      assert.ok(r.concept.metrics.playerPieces > 0);
    }
  });

  test('invalid concepts are rejected by the loop with reasons', () => {
    const r = designConcept({ name: 'Broken', pieces: [{ cells: [[0, 0], [4, 4]] }] });
    assert.equal(r.verdict, 'rejected');
    assert.ok(r.reasons.length > 0);
  });
});

describe('lab: Claude adapter and play resolution', () => {
  test('toConcept tolerates any shape of model output', () => {
    for (const raw of [null, {}, { pieces: 'x' }, { pieces: [{}], width: 'wide' }, { name: 5, lattice: 'cube', pieces: [{ cells: [[0, 0]], rotation: 'morph', morphs: [] }] }]) {
      const c = toConcept(raw);
      assert.equal(typeof c.name, 'string');
      assert.ok(Array.isArray(c.pieces));
      assert.equal(validateConcept(c).ok || validateConcept(c).errors.length > 0, true);
    }
    const good = toConcept({ name: 'Ok', problem: 'p', rationale: 'r', lattice: 'square', width: 10, height: 20, wrap: false,
      pieces: [{ name: 'Bar', cells: [[0, 0], [1, 0], [2, 0]], rotation: 'rotate', connect: 'edge', morphs: [] }, { name: 'Ell', cells: [[0, 0], [1, 0], [1, 1]], rotation: 'rotate', connect: 'edge', morphs: [] }],
      clearRule: 'line', gaps: 1, matchSize: 4, colorMode: 'piece', colors: 4, gravityMode: 'naive', garbageEvery: 0, bombChance: 0, wildChance: 0, speedCurve: 'gentle' });
    assert.ok(validateConcept(good).ok);
    assert.equal(good.design.source, 'claude');
  });

  test('every play source resolves to a validated ruleset', () => {
    const c = generateConcept(99, { archetypeId: 'constellation' });
    for (const src of ['concept', 'mixed', 'classic', 'single']) {
      const r = resolvePlay(c, src, 1);
      assert.ok(r.ok, `${src}: ${r.errors?.join()}`);
      assert.ok(r.rules.pieces.length >= 1);
    }
    const hex = generateConcept(5, { archetypeId: 'hex-hive' });
    assert.ok(resolvePlay(hex, 'single', 0).ok);
    assert.ok(randomExperiment());
    const setConcept = conceptFromSet({ id: 's', name: 'S', lattice: 'square', pieces: c.pieces.slice(0, 3) });
    assert.ok(validateConcept(setConcept).ok);
  });
});

describe('save system', () => {
  test('fresh store has sane defaults', () => {
    const s = new SaveStore(memoryStorage());
    s.load();
    assert.equal(s.settings.theme, 'prism');
    assert.equal(s.data.lab.saved.length, 0);
    assert.equal(s.rank.level, 1);
  });

  test('corrupted JSON is backed up, reset and reported', () => {
    const st = memoryStorage({ [SAVE_KEY]: '{"v":2,"settings":{' });
    const s = new SaveStore(st);
    s.load();
    assert.ok(s.loadError);
    assert.equal(st.getItem(BACKUP_KEY), '{"v":2,"settings":{');
    assert.equal(s.settings.theme, 'prism');
  });

  test('wrong types degrade field by field', () => {
    const d = sanitize({ v: 2, settings: { das: 'fast', theme: 42, music: 7, keys: { left: 7, hold: ['KeyV'] } }, records: { marathon: 'no', sprint: [{ timeMs: -1 }, { timeMs: 50000, score: 10 }] }, stats: { lines: -5, games: 'x' }, achievements: { tetris: 1, bogus: 2 }, lab: { saved: [{ pieces: 'x' }, null, { name: 'ok', pieces: [{ cells: [[0, 0], [1, 0]] }] }] } });
    assert.equal(d.settings.das, 150);
    assert.equal(d.settings.theme, 'prism');
    assert.equal(d.settings.music, 1);
    assert.deepEqual(d.settings.keys.left, ['ArrowLeft', 'KeyA']);
    assert.deepEqual(d.settings.keys.hold, ['KeyV']);
    assert.deepEqual(d.records.marathon, []);
    assert.equal(d.records.sprint.length, 1);
    assert.equal(d.stats.lines, 0);
    assert.ok(d.achievements.tetris && !d.achievements.bogus);
    assert.equal(d.lab.saved.length, 1);
  });

  test('migrates v1 saves and refuses to overwrite newer versions', () => {
    const v1 = sanitize({ v: 1, concepts: [{ id: 'c1', name: 'Old', pieces: [{ cells: [[0, 0], [1, 0]] }] }] });
    assert.equal(v1.lab.saved[0].name, 'Old');
    const st = memoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 99, settings: { theme: 'aurora' } }) });
    const s = new SaveStore(st);
    s.load();
    assert.ok(s.readOnlyFuture);
    s.setSetting('music', 0.1);
    s.flush();
    assert.equal(JSON.parse(st.getItem(SAVE_KEY)).v, 99, 'future save untouched');
  });

  test('records sort, cap at ten, and sprint needs completion', () => {
    const s = new SaveStore(memoryStorage());
    s.load();
    for (let i = 0; i < 12; i++) s.addRecord('marathon', { score: i * 100, lines: i, level: 1, timeMs: 1000 });
    assert.equal(s.data.records.marathon.length, 10);
    assert.equal(s.data.records.marathon[0].score, 1100);
    assert.equal(s.addRecord('sprint', { score: 1, timeMs: 90000, completed: false }).rank, 0);
    assert.equal(s.addRecord('sprint', { score: 1, timeMs: 90000, completed: true }).rank, 1);
    assert.equal(s.addRecord('sprint', { score: 1, timeMs: 80000, completed: true }).personalBest, true);
  });

  test('lab creations: save, rename, delete, limits, sets', () => {
    const s = new SaveStore(memoryStorage());
    s.load();
    const c = generateConcept(5);
    const saved = s.saveConcept(c);
    assert.ok(s.getConcept(saved.id));
    assert.ok(s.renameConcept(saved.id, '  Better Name  '));
    assert.equal(s.getConcept(saved.id).name, 'Better Name');
    assert.equal(s.data.stats.designsSaved, 1);
    s.saveConcept({ ...saved, name: 'Updated' });
    assert.equal(s.data.lab.saved.length, 1, 'same id overwrites');
    assert.ok(s.deleteConcept(saved.id));
    for (let i = 0; i < MAX_SAVED_CONCEPTS; i++) s.saveConcept({ ...c, id: `c${i}` });
    assert.throws(() => s.saveConcept({ ...c, id: 'overflow' }), /full/);
    const set = s.saveSet({ name: 'Mine', lattice: 'square', pieces: c.pieces.slice(0, 2) });
    assert.equal(s.data.lab.sets.length, 1);
    s.deleteSet(set.id);
    assert.equal(s.data.lab.sets.length, 0);
    assert.throws(() => s.saveSet({ name: 'Empty', pieces: [] }));
  });

  test('export/import round-trips and never leaks the API key', () => {
    const st = memoryStorage();
    const s = new SaveStore(st);
    s.load();
    s.setApiKey('sk-ant-secret-key-value-1234567890');
    s.addRecord('ultra', { score: 5000, lines: 10, level: 3, timeMs: 120000 });
    const text = s.export();
    assert.ok(!text.includes('sk-ant'));
    assert.equal(st.getItem(KEY_KEY), 'sk-ant-secret-key-value-1234567890');
    const s2 = new SaveStore(memoryStorage());
    s2.load();
    s2.import(text);
    assert.equal(s2.data.records.ultra[0].score, 5000);
    assert.throws(() => s2.import('{"hello":1}'), /not a Prismfall save/);
    assert.throws(() => s2.import('garbage'));
  });

  test('progression, unlocks and daily challenges', () => {
    assert.equal(rankFor(0).level, 1);
    assert.equal(rankFor(600).level, 2);
    const s = new SaveStore(memoryStorage());
    s.load();
    assert.equal(s.isUnlocked('theme', 'sunset'), false);
    assert.equal(s.isUnlocked('style', 'flat'), true, 'accessibility style is never locked');
    s.bump('xp', 600);
    assert.equal(s.isUnlocked('theme', 'sunset'), true);
    assert.ok(s.unlock('tetris'));
    assert.equal(s.unlock('tetris'), false);
    assert.equal(s.isUnlocked('theme', 'candy'), true);
    const a = s.refreshChallenges(new Date('2026-01-02T10:00:00Z')).map((c) => c.id);
    const b = new SaveStore(memoryStorage()); b.load();
    assert.deepEqual(b.refreshChallenges(new Date('2026-01-02T18:00:00Z')).map((c) => c.id), a, 'same day, same challenges');
    assert.equal(new Set(a).size, 3);
    const done = s.progressChallenges({ mode: 'marathon', lines: 500, tetrises: 50, tspins: 50, maxCombo: 50, level: 20, score: 1e6, pieces: 5000, groups: 0, completed: true });
    assert.ok(done.length >= 1);
  });

  test('storage failures degrade to an in-memory session', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
    const s = new SaveStore(broken);
    assert.doesNotThrow(() => s.load());
    assert.doesNotThrow(() => { s.setSetting('music', 0.2); s.flush(); });
    assert.equal(s.settings.music, 0.2);
  });
});
