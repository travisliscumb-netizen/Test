/* Rulesets.

   A CONCEPT is the JSON description of a whole game design. Classic mode is a
   concept; every AI Lab design is a concept; saved creations are concepts.
   compileRules() turns one into a RULESET the Game can run. It applies
   defaults, clamps every number into a safe range and compiles each piece,
   throwing RulesError for anything structurally impossible. Softer design
   judgements (is this fun? fair?) belong to the Lab critic, not here. */

import { compilePiece, CLASSIC_DEFS, PieceError } from './pieces.js';

export class RulesError extends Error {
  constructor(message, problems = []) { super(message); this.problems = problems; }
}

export const CLEAR_RULES = ['line', 'line-gap', 'color-match'];
export const GRAVITY_MODES = ['naive', 'cascade'];
export const COLOR_MODES = ['piece', 'random-piece', 'random-cells'];
export const GENERATORS = ['bag', 'weighted'];
export const SPEED_CURVES = ['gentle', 'standard', 'steep'];

export const LIMITS = {
  width: [5, 20],
  height: [10, 30],
  pieces: [1, 16],
  matchSize: [3, 8],
  gaps: [1, 2],
  garbageEvery: [0, 40],
  specialChance: [0, 0.35],
  linesPerLevel: [4, 30],
  startLevel: [1, 20]
};

const clamp = (v, [lo, hi], dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};
const clampInt = (v, range, dflt) => Math.round(clamp(v, range, dflt));
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

/** Guideline gravity: seconds per row = (0.8 - (L-1)*0.007)^(L-1). */
export function guidelineMsPerRow(level) {
  const L = Math.max(1, Math.min(20, level));
  return Math.max(0.5, Math.pow(0.8 - (L - 1) * 0.007, L - 1) * 1000);
}

export function curveMsPerRow(curve, level) {
  if (curve === 'gentle') return guidelineMsPerRow(1 + (level - 1) * 0.6);
  if (curve === 'steep') return guidelineMsPerRow(1 + (level - 1) * 1.35);
  return guidelineMsPerRow(level);
}

export const CLASSIC_CONCEPT = Object.freeze({
  id: 'classic',
  name: 'Classic',
  tagline: 'The seven tetrominoes, the Super Rotation System, guideline scoring.',
  lattice: 'square',
  board: { width: 10, height: 20 },
  wrap: false,
  pieces: CLASSIC_DEFS,
  generation: 'bag',
  colorMode: 'piece',
  clear: { rule: 'line' },
  gravityMode: 'naive',
  garbage: { every: 0 },
  specials: { bomb: 0, wild: 0 },
  scoring: { kind: 'guideline' },
  speed: { curve: 'standard', linesPerLevel: 10 }
});

/** Normalise and default a concept without compiling pieces. Never throws on bad types. */
export function normalizeConcept(c) {
  const src = c && typeof c === 'object' ? c : {};
  const lattice = oneOf(src.lattice, ['square', 'hex'], 'square');
  const clearRule = oneOf(src.clear?.rule, CLEAR_RULES, 'line');
  const out = {
    id: typeof src.id === 'string' && src.id ? src.id.slice(0, 64) : 'concept',
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 40) : 'Untitled Concept',
    tagline: typeof src.tagline === 'string' ? src.tagline.slice(0, 200) : '',
    lattice,
    board: {
      width: clampInt(src.board?.width, LIMITS.width, 10),
      height: clampInt(src.board?.height, LIMITS.height, 20)
    },
    wrap: lattice === 'square' && src.wrap === true,
    pieces: Array.isArray(src.pieces) ? src.pieces.slice(0, LIMITS.pieces[1]) : [],
    generation: oneOf(src.generation, GENERATORS, 'bag'),
    colorMode: oneOf(src.colorMode, COLOR_MODES, 'piece'),
    palette: Array.isArray(src.palette) ? src.palette.filter((n) => Number.isInteger(n) && n >= 1 && n <= 31 && n !== 8).slice(0, 8) : [],
    clear: {
      rule: clearRule,
      gaps: clampInt(src.clear?.gaps, LIMITS.gaps, 1),
      matchSize: clampInt(src.clear?.matchSize, LIMITS.matchSize, 4)
    },
    gravityMode: oneOf(src.gravityMode, GRAVITY_MODES, 'naive'),
    garbage: { every: clampInt(src.garbage?.every, LIMITS.garbageEvery, 0) },
    specials: {
      bomb: clamp(src.specials?.bomb, LIMITS.specialChance, 0),
      wild: clamp(src.specials?.wild, LIMITS.specialChance, 0)
    },
    scoring: { kind: src.scoring?.kind === 'guideline' ? 'guideline' : 'lab' },
    speed: {
      curve: oneOf(src.speed?.curve, SPEED_CURVES, 'standard'),
      linesPerLevel: clampInt(src.speed?.linesPerLevel, LIMITS.linesPerLevel, 10)
    },
    hold: src.hold !== false,
    design: src.design && typeof src.design === 'object' ? src.design : undefined,
    metrics: src.metrics && typeof src.metrics === 'object' ? src.metrics : undefined
  };
  // Colour-match needs cells to fall into holes or chains are impossible.
  if (out.clear.rule === 'color-match') out.gravityMode = 'cascade';
  if (out.clear.rule === 'color-match' && out.colorMode === 'piece') out.colorMode = 'random-cells';
  if (out.colorMode !== 'piece' && out.palette.length < 3) out.palette = [5, 2, 4, 6, 3].slice(0, 4);
  if (out.clear.rule !== 'color-match') out.specials.wild = 0;
  return out;
}

/**
 * Compile a concept into a runnable ruleset. Throws RulesError listing every
 * structural problem found.
 */
export function compileRules(concept) {
  const c = normalizeConcept(concept);
  const problems = [];
  if (!c.pieces.length) problems.push('the concept has no pieces');

  const pieces = [];
  c.pieces.forEach((def, i) => {
    try {
      const p = compilePiece({ ...def, id: def?.id ?? `p${i}` }, c.lattice);
      pieces.push(p);
    } catch (e) {
      problems.push(e instanceof PieceError ? e.message : `piece ${i}: ${e.message}`);
    }
  });

  let maxSpan = 1;
  for (const p of pieces) maxSpan = Math.max(maxSpan, p.maxSpan);
  for (const p of pieces) {
    if (!c.wrap && p.maxSpan > c.board.width) problems.push(`${p.name} is wider than the board`);
  }
  if (problems.length) throw new RulesError(`Invalid concept "${c.name}": ${problems[0]}`, problems);

  const buffer = Math.max(4, maxSpan + 1);
  const isColor = c.clear.rule === 'color-match';
  const clearDelay = c.gravityMode === 'cascade' ? 260 : 320;

  return {
    concept: c,
    id: c.id,
    name: c.name,
    lattice: c.lattice,
    width: c.board.width,
    height: c.board.height,
    buffer,
    wrap: c.wrap,
    pieces,
    generation: c.generation,
    colorMode: c.colorMode,
    palette: c.palette,
    clear: c.clear,
    gravityMode: c.gravityMode,
    garbageEvery: c.garbage.every,
    bombChance: c.specials.bomb,
    wildChance: c.specials.wild,
    scoring: c.scoring.kind,
    progressUnit: isColor ? 'groups' : 'lines',
    linesPerLevel: c.speed.linesPerLevel,
    msPerRow: (level) => curveMsPerRow(c.speed.curve, level),
    lockDelay: 500,
    lockResets: 15,
    clearDelay,
    hold: c.hold,
    maxLevel: 30
  };
}

export function classicRules() { return compileRules(CLASSIC_CONCEPT); }
