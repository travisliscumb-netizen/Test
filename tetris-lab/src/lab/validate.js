/* Structural validation of a concept.

   This is the safety gate: nothing reaches the simulator, the gallery or the
   game unless it passes. It answers "can this run correctly?", never "is this
   fun?" (that is the critic's job). Every check is defensive -- a malformed
   concept from a corrupted save or a hallucinating model must produce an
   error list, never an exception. */

import { compileRules, normalizeConcept, RulesError } from '../engine/rules.js';
import { isConnected, hasEnclosedHole } from '../engine/lattice.js';
import { Game } from '../engine/game.js';
import { Bot } from '../engine/bot.js';
import { ScriptedRandomizer } from '../engine/randomizer.js';

export const MAX_PIECE_CELLS = 8;
export const MAX_PIECES = 12;

export function validateConcept(input) {
  const errors = [];
  const warnings = [];
  let rules = null;
  let concept = null;
  try {
    concept = normalizeConcept(input);
    if (!Array.isArray(input?.pieces)) errors.push('pieces must be an array');
    if (concept.pieces.length > MAX_PIECES) errors.push(`too many pieces (${concept.pieces.length} > ${MAX_PIECES}): unreadable`);

    concept.pieces.forEach((def, i) => {
      const label = def?.name || def?.id || `piece ${i + 1}`;
      if (!def || !Array.isArray(def.cells)) { errors.push(`${label}: missing cells`); return; }
      if (def.cells.length > MAX_PIECE_CELLS) errors.push(`${label}: ${def.cells.length} cells is too large to read at speed (max ${MAX_PIECE_CELLS})`);
      const malformed = def.cells.some((c) => !Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1]));
      if (malformed) return; // compilePiece reports it precisely
      const connect = ['edge', 'corner', 'loose'].includes(def.connect) ? def.connect : 'edge';
      if (!isConnected(concept.lattice, def.cells, connect)) errors.push(`${label}: cells are not ${connect}-connected`);
      for (const m of def.morphs || []) {
        if (Array.isArray(m) && m.every((c) => Array.isArray(c) && Number.isInteger(c[0])) && !isConnected(concept.lattice, m, connect)) {
          errors.push(`${label}: a morph shape is not ${connect}-connected`);
        }
      }
      if (hasEnclosedHole(concept.lattice, def.cells)) warnings.push(`${label} encloses a hole; it can never be filled`);
    });

    if (errors.length) return { ok: false, errors, warnings, rules: null, concept };

    rules = compileRules(concept);
  } catch (e) {
    if (e instanceof RulesError) errors.push(...e.problems);
    else errors.push(`compile failed: ${e.message}`);
    return { ok: false, errors, warnings, rules: null, concept };
  }

  try {
    const w = rules.width;
    for (const p of rules.pieces) {
      if (!rules.wrap && p.maxSpan > w - 2) errors.push(`${p.name} spans ${p.maxSpan} of ${w} columns: too wide to manoeuvre`);
      if (p.maxSpan > rules.buffer) errors.push(`${p.name} is taller than the spawn zone`);
    }
    if (rules.clear.rule === 'color-match') {
      if (rules.palette.length < 2) errors.push('colour-match needs at least two colours');
      if (rules.palette.length > 6) warnings.push('more than six colours makes matches rare');
    } else if (rules.colorMode === 'piece') {
      const seen = new Map();
      for (const p of rules.pieces) {
        const c = p.colors[0];
        if (seen.has(c)) warnings.push(`${p.name} shares its colour with ${seen.get(c)}`);
        else seen.set(c, p.name);
      }
    }

    // Every piece must spawn on an empty board, and every orientation must be
    // placeable somewhere; every rotation transition must succeed from spawn.
    const bot = new Bot(rules, { skill: 1 });
    rules.pieces.forEach((p, i) => {
      const g = new Game(rules, { seed: 1, instant: true, randomizer: new ScriptedRandomizer([i], null) });
      g.start();
      if (g.isOver || !g.active) { errors.push(`${p.name} cannot spawn on an empty board`); return; }
      const reach = new Set(bot.placements(g.board, i).map((pl) => pl.s));
      for (const s of p.distinctStates) {
        if (!reach.has(s)) errors.push(`${p.name} orientation ${s} can never be placed`);
      }
      for (const kind of ['cw', 'ccw', 'flip']) {
        const t = p.trans[0][kind];
        if (t === undefined || t < 0 || t === 0) continue;
        const g2 = new Game(rules, { seed: 1, instant: true, randomizer: new ScriptedRandomizer([i], null) });
        g2.start();
        // Let it fall a few rows so kicks have room, as a player would.
        for (let k = 0; k < 3; k++) g2.stepDown();
        if (!g2.rotate(kind)) warnings.push(`${p.name} cannot ${kind === 'flip' ? 'flip' : 'rotate'} from its spawn position`);
      }
    });
  } catch (e) {
    errors.push(`validation crashed: ${e.message}`);
  }

  return { ok: errors.length === 0, errors, warnings, rules: errors.length ? null : rules, concept };
}
