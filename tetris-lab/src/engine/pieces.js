/* Generalised piece definitions and their compilation.

   A piece DEFINITION is plain JSON (so the Lab and the Claude designer can
   author it and the save system can store it):

     {
       id, name,
       cells:   [[x,y], ...]          native lattice coordinates of the spawn shape
       colors?: [idx, ...]            per-cell palette index (colour-match rules)
       color:   idx                   single palette index otherwise
       rotation: 'srs' | 'srs-i' | 'srs-o' | 'rotate' | 'none' | 'flip' | 'full' | 'morph'
       morphs?: [[[x,y],...], ...]    extra shapes a 'morph' piece cycles through
       weight?: number                relative spawn weight (default 1)
       fall?:   number                gravity multiplier: <1 drifts, >1 plummets (default 1)
       tags?:   [string]
     }

   Compilation produces a set of STATES (each an ordered list of native cells,
   order preserved across transitions so per-cell colours follow the cell) and a
   TRANSITION graph: which state rotate-CW / CCW / 180 / flip lead to, and the
   kick list to try for each transition.

   Rotation systems:
     srs, srs-i, srs-o   Super Rotation System (classic guideline behaviour)
     rotate              free rotation about the piece's box centre, generic kicks
     none                a single fixed orientation
     flip                rotate button mirrors the piece instead
     full                rotation plus a separate flip (8 / 12 orientations)
     morph               "rotation" cycles between distinct shapes of equal size */

import { getLattice, normalizeSquare, pivotHex } from './lattice.js';

export const ROTATION_SYSTEMS = ['srs', 'srs-i', 'srs-o', 'rotate', 'none', 'flip', 'full', 'morph'];

/* SRS tables from the guideline, converted to y-down (y negated). Index order
   of states is 0 (spawn), R, 2, L. */
const flipY = (list) => list.map(([x, y]) => [x, -y]);
const SRS_JLSTZ = {
  '0>1': flipY([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  '1>0': flipY([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  '1>2': flipY([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  '2>1': flipY([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  '2>3': flipY([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
  '3>2': flipY([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  '3>0': flipY([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  '0>3': flipY([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]])
};
const SRS_I = {
  '0>1': flipY([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  '1>0': flipY([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  '1>2': flipY([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
  '2>1': flipY([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  '2>3': flipY([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  '3>2': flipY([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  '3>0': flipY([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  '0>3': flipY([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]])
};
const KICK_180 = [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, 1]];
const KICK_GENERIC = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, 1], [0, -2]];
const KICK_NONE = [[0, 0]];

export class PieceError extends Error {}

/** Square shape placed in an n x n box, centred, n = max(w, h). */
function boxSquare(cells) {
  const norm = normalizeSquare(cells);
  let w = 0, h = 0;
  for (const [x, y] of norm) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  const n = Math.max(w, h);
  const ox = Math.floor((n - w) / 2), oy = Math.floor((n - h) / 2);
  return { n, cells: norm.map(([x, y]) => [x + ox, y + oy]) };
}

function rotBox(cells, n, dir) {
  // dir 1 = CW, -1 = CCW, 2 = 180 inside an n x n box.
  if (dir === 1) return cells.map(([x, y]) => [n - 1 - y, x]);
  if (dir === -1) return cells.map(([x, y]) => [y, n - 1 - x]);
  return cells.map(([x, y]) => [n - 1 - x, n - 1 - y]);
}
const reflBox = (cells, n) => cells.map(([x, y]) => [n - 1 - x, y]);

function rotHex(cells, dir, L) {
  if (dir === 1) return cells.map((c) => L.rotateCW(c));
  if (dir === -1) return cells.map((c) => L.rotateCCW(c));
  return cells.map((c) => L.rotateCW(L.rotateCW(L.rotateCW(c))));
}

/** Pre-compute per-parity board offsets and bounds for a native state. */
function variantsFor(latticeId, cells) {
  const L = getLattice(latticeId);
  const out = [];
  for (let parity = 0; parity < 2; parity++) {
    const offs = cells.map((c) => (latticeId === 'hex' ? L.toBoardOffsetParity(c, parity) : L.toBoardOffset(c)));
    const flat = new Int16Array(offs.length * 2);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    offs.forEach(([x, y], i) => {
      flat[i * 2] = x; flat[i * 2 + 1] = y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    out.push({ offs: flat, n: offs.length, minX, maxX, minY, maxY });
  }
  return out;
}

const sameShape = (a, b) => {
  if (a.length !== b.length) return false;
  const k = (c) => c.join(',');
  const s = new Set(a.map(k));
  return b.every((c) => s.has(k(c)));
};

/**
 * Compile a definition for a lattice. Throws PieceError with a readable
 * message on malformed input; the Lab validator catches these.
 */
export function compilePiece(def, latticeId = 'square') {
  if (!def || typeof def !== 'object') throw new PieceError('piece definition is not an object');
  const L = getLattice(latticeId);
  const raw = def.cells;
  if (!Array.isArray(raw) || raw.length === 0) throw new PieceError(`${def.id}: no cells`);
  if (raw.length > 12) throw new PieceError(`${def.id}: ${raw.length} cells exceeds the limit of 12`);
  for (const c of raw) {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || !Number.isInteger(c[1]) ||
        Math.abs(c[0]) > 12 || Math.abs(c[1]) > 12) {
      throw new PieceError(`${def.id}: malformed cell ${JSON.stringify(c)}`);
    }
  }
  const keys = new Set(raw.map((c) => c.join(',')));
  if (keys.size !== raw.length) throw new PieceError(`${def.id}: duplicate cells`);

  const rotation = def.rotation || 'rotate';
  if (!ROTATION_SYSTEMS.includes(rotation)) throw new PieceError(`${def.id}: unknown rotation "${rotation}"`);
  if (rotation.startsWith('srs') && latticeId !== 'square') throw new PieceError(`${def.id}: SRS needs the square lattice`);

  // Base shape in rotation-ready native form.
  let base, n = 0;
  if (latticeId === 'square') { const b = boxSquare(raw); base = b.cells; n = b.n; }
  else base = pivotHex(raw);

  const rotate = (cells, dir) => (latticeId === 'square' ? rotBox(cells, n, dir) : rotHex(cells, dir, L));
  const reflect = (cells) => (latticeId === 'square' ? reflBox(cells, n) : cells.map((c) => L.reflect(c)));

  const states = [];
  const trans = []; // per state: { cw, ccw, r180, flip } -> target index or -1
  const R = L.rotations;
  const kickKind = rotation === 'srs' ? 'srs' : rotation === 'srs-i' ? 'srs-i' :
    rotation === 'srs-o' || rotation === 'none' ? 'none' : 'generic';

  if (rotation === 'none') {
    states.push(base);
    trans.push({ cw: -1, ccw: -1, r180: -1, flip: -1 });
  } else if (rotation === 'flip') {
    states.push(base, reflect(base));
    trans.push({ cw: 1, ccw: 1, r180: -1, flip: 1 }, { cw: 0, ccw: 0, r180: -1, flip: 0 });
  } else if (rotation === 'morph') {
    const morphs = Array.isArray(def.morphs) ? def.morphs : [];
    if (morphs.length === 0) throw new PieceError(`${def.id}: morph rotation needs at least one extra shape`);
    const shapes = [raw, ...morphs];
    shapes.forEach((m, i) => {
      if (!Array.isArray(m) || m.length !== raw.length) throw new PieceError(`${def.id}: morph shape ${i} must have ${raw.length} cells`);
      for (const c of m) if (!Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) throw new PieceError(`${def.id}: malformed morph cell`);
      if (new Set(m.map((c) => c.join(','))).size !== m.length) throw new PieceError(`${def.id}: duplicate cells in morph ${i}`);
    });
    // Box every shape in a common box so morphs pivot about the same centre.
    if (latticeId === 'square') {
      const boxed = shapes.map((s) => boxSquare(s));
      const N = Math.max(...boxed.map((b) => b.n));
      boxed.forEach((b) => {
        const d = Math.floor((N - b.n) / 2);
        states.push(b.cells.map(([x, y]) => [x + d, y + d]));
      });
    } else shapes.forEach((s) => states.push(pivotHex(s)));
    const k = states.length;
    for (let i = 0; i < k; i++) trans.push({ cw: (i + 1) % k, ccw: (i - 1 + k) % k, r180: -1, flip: -1 });
  } else {
    // srs*, rotate, full: R rotations (optionally x2 chirality).
    const chir = rotation === 'full' ? 2 : 1;
    for (let c = 0; c < chir; c++) {
      let cur = c === 0 ? base : reflect(base);
      for (let i = 0; i < R; i++) { states.push(cur); cur = rotate(cur, 1); }
    }
    for (let c = 0; c < chir; c++) {
      for (let i = 0; i < R; i++) {
        trans.push({
          cw: c * R + ((i + 1) % R),
          ccw: c * R + ((i - 1 + R) % R),
          r180: R % 2 === 0 ? c * R + ((i + R / 2) % R) : -1,
          flip: chir === 2 ? (1 - c) * R + i : -1
        });
      }
    }
  }

  // Detect rotationally symmetric shapes so the bot does not waste work and the
  // lab can see how many *distinct* orientations a piece really has.
  const distinct = [];
  states.forEach((s, i) => {
    const norm = latticeId === 'square' ? normalizeSquare(s) : s;
    const dup = distinct.findIndex((j) => {
      const o = latticeId === 'square' ? normalizeSquare(states[j]) : states[j];
      return sameShape(o, norm);
    });
    if (dup === -1) distinct.push(i);
  });

  const compiledStates = states.map((cells) => ({ cells, v: variantsFor(latticeId, cells) }));

  const kicksFor = (from, to, kind) => {
    if (kickKind === 'none') return KICK_NONE;
    if (kind === 'r180') return KICK_180;
    if (kickKind === 'srs') return SRS_JLSTZ[`${from}>${to}`] || KICK_GENERIC;
    if (kickKind === 'srs-i') return SRS_I[`${from}>${to}`] || KICK_GENERIC;
    return KICK_GENERIC;
  };

  const colors = Array.isArray(def.colors) && def.colors.length === raw.length
    ? def.colors.map((c) => clampColor(c))
    : new Array(raw.length).fill(clampColor(def.color ?? 9));

  let w = 0, h = 0;
  {
    const v = compiledStates[0].v[0];
    w = v.maxX - v.minX + 1; h = v.maxY - v.minY + 1;
  }
  let maxSpan = 0;
  for (const s of compiledStates) for (const v of s.v) {
    maxSpan = Math.max(maxSpan, v.maxX - v.minX + 1, v.maxY - v.minY + 1);
  }

  return {
    id: String(def.id ?? 'piece'),
    name: String(def.name ?? def.id ?? 'Piece'),
    lattice: latticeId,
    rotation,
    size: raw.length,
    box: n,
    states: compiledStates,
    trans,
    kicksFor,
    distinctStates: distinct,
    colors,
    weight: Number.isFinite(def.weight) && def.weight > 0 ? def.weight : 1,
    fall: Number.isFinite(def.fall) ? Math.max(0.25, Math.min(3, def.fall)) : 1,
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
    spawnW: w,
    spawnH: h,
    maxSpan,
    tspin: def.tags?.includes('t') && rotation === 'srs',
    def
  };
}

export function clampColor(c) {
  const n = Number(c);
  if (!Number.isInteger(n) || n < 1 || n > 31) return 9;
  return n;
}

/* ------------------------------------------------------------ classic -- */

export const CLASSIC_DEFS = [
  { id: 'I', name: 'I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: 1, rotation: 'srs-i', tags: ['classic'] },
  { id: 'O', name: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: 2, rotation: 'srs-o', tags: ['classic'] },
  { id: 'T', name: 'T', cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: 3, rotation: 'srs', tags: ['classic', 't'] },
  { id: 'S', name: 'S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: 4, rotation: 'srs', tags: ['classic'] },
  { id: 'Z', name: 'Z', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: 5, rotation: 'srs', tags: ['classic'] },
  { id: 'J', name: 'J', cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: 6, rotation: 'srs', tags: ['classic'] },
  { id: 'L', name: 'L', cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: 7, rotation: 'srs', tags: ['classic'] }
];

export const GARBAGE_COLOR = 8;
