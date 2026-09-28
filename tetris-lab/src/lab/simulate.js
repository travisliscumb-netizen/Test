/* Bot playtesting.

   Plays a compiled ruleset with two simulated players and records what
   happened in terms a designer cares about:

     expert   the bot at full strength -- can the design be survived at all?
     player   a human-like bot (softmax choices, occasional blunders) whose
              skill erodes as the level rises, standing in for speed pressure
              the instant simulation otherwise ignores

   Every game runs inside try/catch with an iteration budget, and invariants
   are checked after every placement, so a broken design surfaces as
   `errors` / `invariantFailures` instead of a crash or a hang. */

import { Game } from '../engine/game.js';
import { Bot } from '../engine/bot.js';
import { Rng } from '../engine/rng.js';
import { makeRandomizer } from '../engine/randomizer.js';

const SPEED_PRESSURE = { gentle: 0.012, standard: 0.02, steep: 0.032 };

export function simulate(rules, { games = 3, pieces = 200, seed = 1, playerSkill = 0.5, budgetMs = 6000 } = {}) {
  const t0 = now();
  const K = rules.pieces.length;
  const out = {
    games, cap: pieces,
    expert: blankSide(), player: blankSide(),
    goodOptions: 0, decisionSamples: 0, spread: 0, rotationUse: 0, rotationSamples: 0,
    pieceHoles: new Array(K).fill(0), pieceCount: new Array(K).fill(0),
    chainsMax: 0, chains: 0, bombs: 0, seamPlays: 0, garbageRows: 0, groups: 0,
    errors: [], invariantFailures: 0, msPerPiece: 0, placements: 0, timedOut: false
  };
  const curve = rules.concept?.speed?.curve || 'standard';
  const pressure = SPEED_PRESSURE[curve] ?? 0.02;

  for (const role of ['expert', 'player']) {
    for (let gi = 0; gi < games; gi++) {
      if (now() - t0 > budgetMs) { out.timedOut = true; break; }
      const side = out[role];
      const rng = new Rng((seed * 7919 + gi * 104729 + (role === 'player' ? 31 : 0)) >>> 0);
      let game;
      try {
        game = new Game(rules, { seed: rng.next() * 4294967296 >>> 0, instant: true, randomizer: makeRandomizer(rules, rng.fork()) });
        game.start();
      } catch (e) {
        out.errors.push(`start: ${e.message}`);
        continue;
      }
      const bot = new Bot(rules, { skill: role === 'expert' ? 1 : playerSkill, rng: rng.fork() });
      let lastScore = 0;
      let heightSum = 0, heightN = 0;
      let lastClearAt = 0, gaps = 0, gapN = 0;
      let guard = pieces * 4 + 50;
      try {
        while (!game.isOver && game.stats.pieces < pieces && guard-- > 0) {
          const a = game.active;
          if (!a) { out.errors.push('no active piece while playing'); break; }
          if (role === 'player') bot.skill = Math.max(0.1, playerSkill - pressure * (game.stats.level - 1));
          const list = bot.placements(game.board, a.inst.p, a.inst.colors, a.inst.specials);
          if (!list.length) { game.hardDrop(); continue; }
          list.sort((x, y) => y.score - x.score);

          if (role === 'expert') {
            // Decision richness: how many placements are close to the best, and
            // how far the worst is from it. One good option = no decision;
            // everything equal = no decision either.
            const best = list[0].score;
            let good = 0;
            for (const pl of list) if (best - pl.score <= 6) good++;
            out.goodOptions += good;
            out.spread += Math.min(200, best - list[list.length - 1].score);
            out.decisionSamples++;
          }
          const pick = bot.pickFrom(list);
          const p = rules.pieces[a.inst.p];
          if (p.distinctStates.length > 1) {
            out.rotationSamples++;
            if (pick.s !== p.distinctStates[0]) out.rotationUse++;
          }
          const holesBefore = role === 'expert' ? bot.features(game.board).holes : 0;
          const st = p.states[pick.s];
          if (rules.wrap) {
            const v = st.v[pick.x & 1];
            for (let i = 0; i < v.n; i++) {
              const cx = pick.x + v.offs[i * 2];
              if (cx < 0 || cx >= rules.width) { out.seamPlays++; break; }
            }
          }
          const pi = a.inst.p;
          if (!game.place(pick.s, pick.x)) game.hardDrop();
          if (role === 'expert') {
            out.pieceHoles[pi] += Math.max(0, bot.features(game.board).holes - holesBefore);
            out.pieceCount[pi]++;
          }
          for (const e of game.drainEvents()) {
            if (e.type === 'clear') {
              if (e.chain > 1) out.chains++;
              out.chainsMax = Math.max(out.chainsMax, e.chain);
              if (e.bombs) out.bombs += e.bombs;
              gaps += game.stats.pieces - lastClearAt; gapN++;
              lastClearAt = game.stats.pieces;
            }
          }
          // Invariants.
          const s = game.stats.score;
          if (!Number.isFinite(s) || s < lastScore) out.invariantFailures++;
          lastScore = s;
          for (let i = 0; i < game.board.cells.length; i++) {
            const v = game.board.cells[i];
            if (v && ((v & 31) === 0 || (v >> 5) > 2)) { out.invariantFailures++; break; }
          }
          const top = game.board.topRow();
          heightSum += Math.min(1, (game.board.h - top) / game.board.visible);
          heightN++;
          out.placements++;
        }
        if (guard <= 0) out.errors.push('simulation exceeded its iteration budget (possible soft lock)');
      } catch (e) {
        out.errors.push(`${role} game ${gi}: ${e.message}`);
      }
      side.games++;
      side.pieces += game.stats.pieces;
      side.survived += game.isOver ? 0 : 1;
      side.lines += game.stats.lines;
      side.groups += game.stats.groups;
      side.cellsCleared += game.stats.cellsCleared;
      side.score += game.stats.score;
      side.height += heightN ? heightSum / heightN : 0;
      side.clearGap += gapN ? gaps / gapN : pieces;
      side.maxLevel = Math.max(side.maxLevel, game.stats.level);
      out.garbageRows += game.stats.garbageRows;
    }
  }

  const avgCells = rules.pieces.reduce((a, p) => a + p.size * p.weight, 0) / rules.pieces.reduce((a, p) => a + p.weight, 0);
  for (const role of ['expert', 'player']) {
    const s = out[role];
    const g = Math.max(1, s.games);
    s.survival = s.survived / g;
    s.avgPieces = s.pieces / g;
    s.pieceRatio = s.avgPieces / pieces;
    s.clearRatio = s.pieces ? s.cellsCleared / (s.pieces * avgCells) : 0;
    s.avgHeight = s.height / g;
    s.piecesPerClear = s.clearGap / g;
    s.avgScore = s.score / g;
  }
  out.goodOptions = out.decisionSamples ? out.goodOptions / out.decisionSamples : 0;
  out.spread = out.decisionSamples ? out.spread / out.decisionSamples : 0;
  out.rotationUse = out.rotationSamples ? out.rotationUse / out.rotationSamples : 0;
  out.pieceHoles = out.pieceHoles.map((h, i) => (out.pieceCount[i] ? h / out.pieceCount[i] : 0));
  out.bombsPerPiece = out.placements ? out.bombs / out.placements : 0;
  out.chainRate = out.placements ? out.chains / out.placements : 0;
  out.seamRate = out.placements ? out.seamPlays / out.placements : 0;
  out.msPerPiece = out.placements ? (now() - t0) / out.placements : 0;
  out.avgCells = avgCells;
  return out;
}

function blankSide() {
  return { games: 0, pieces: 0, survived: 0, lines: 0, groups: 0, cellsCleared: 0, score: 0, height: 0, clearGap: 0, maxLevel: 1 };
}

function now() { return globalThis.performance?.now?.() ?? Date.now(); }
