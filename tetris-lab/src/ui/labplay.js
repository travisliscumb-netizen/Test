/* Resolving what to play in the Lab.

   Every Lab game goes through validateConcept() before it starts, whatever
   the source (saved design, fresh AI design, edited design, custom set,
   random experiment), so a bad design can never reach the Game. */

import { CLASSIC_DEFS } from '../engine/pieces.js';
import { validateConcept, MAX_PIECES } from '../lab/validate.js';
import { generateConcept, describe } from '../lab/generator.js';
import { randomSeed } from '../engine/rng.js';

export const SOURCES = {
  concept: { label: 'Design pieces', desc: "Play the design exactly as the AI built it." },
  mixed: { label: 'Design + classic', desc: 'The design’s rules with its own pieces and classic tetrominoes shuffled together.' },
  classic: { label: 'Classic pieces', desc: 'The design’s rules, but only the seven tetrominoes.' },
  single: { label: 'Piece trial', desc: 'One experimental piece mixed into a familiar set, appearing often.' }
};

const classicAsRotate = () => CLASSIC_DEFS.map((d) => ({ ...d, cells: d.cells.map((c) => c.slice()), rotation: 'rotate', connect: 'edge', tags: ['classic'] }));

/** Which sources make sense for a concept (classic pieces need a square grid). */
export function sourcesFor(concept) {
  const out = ['concept'];
  if (concept.lattice !== 'hex') {
    if ((concept.pieces?.length || 0) <= MAX_PIECES - 2) out.push('mixed');
    out.push('classic');
  }
  out.push('single');
  return out;
}

/**
 * Build the concept to actually play. Returns { ok, concept, rules, errors }.
 */
export function resolvePlay(concept, source = 'concept', pieceIndex = 0) {
  let c = JSON.parse(JSON.stringify(concept));
  const square = c.lattice !== 'hex';
  if (source === 'classic' && square) {
    c.pieces = classicAsRotate();
    c.name = `${concept.name} · Classic pieces`;
  } else if (source === 'mixed' && square) {
    // Add as many classics as fit under the readability limit, most useful first.
    const room = Math.max(0, MAX_PIECES - c.pieces.length);
    const order = ['I', 'T', 'L', 'J', 'O', 'S', 'Z'];
    const classics = classicAsRotate().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).slice(0, room);
    c.pieces = [...c.pieces, ...classics];
    c.name = `${concept.name} · Mixed`;
  } else if (source === 'single') {
    const p = c.pieces[Math.max(0, Math.min(c.pieces.length - 1, pieceIndex))];
    const base = square ? classicAsRotate() : c.pieces.filter((x) => x !== p);
    c.pieces = [{ ...p, weight: Math.max(2, Math.round(base.length / 3)) }, ...base].slice(0, MAX_PIECES);
    c.name = `${p.name} trial`;
  }
  c.scoring = { kind: 'lab' };
  const v = validateConcept(c);
  if (!v.ok) return { ok: false, errors: v.errors, concept: c };
  return { ok: true, concept: v.concept, rules: v.rules, errors: [] };
}

/** A custom set played on standard rules for its lattice. */
export function conceptFromSet(set) {
  const hex = set.lattice === 'hex';
  return {
    id: `set:${set.id}`,
    name: set.name,
    lattice: set.lattice,
    board: hex ? { width: 11, height: 18 } : { width: 10, height: 20 },
    pieces: set.pieces,
    clear: { rule: 'line' },
    gravityMode: 'naive',
    scoring: { kind: 'lab' },
    speed: { curve: 'gentle', linesPerLevel: 10 },
    design: { archetype: 'custom-set', archetypeTitle: 'Custom set', problem: 'Your own selection of pieces on standard rules.', source: 'player', journal: [] }
  };
}

/**
 * A random, structurally valid experiment: generated instantly and validated,
 * but deliberately not play-tested (the UI labels it "untested").
 */
export function randomExperiment(tries = 12) {
  for (let i = 0; i < tries; i++) {
    const seed = randomSeed();
    const c = generateConcept(seed);
    const v = validateConcept(c);
    if (v.ok) {
      v.concept.design = { ...(v.concept.design || {}), verdict: 'untested', journal: [] };
      v.concept.tagline = describe(v.concept);
      return v.concept;
    }
  }
  return null;
}
