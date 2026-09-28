/* Refinement: targeted changes that answer specific critic findings.

   Each weakness id maps to an ordered list of candidate fixes. The first fix
   that is applicable (and not already tried for this concept) is applied and
   described in plain language for the design journal. Fixes are small and
   local on purpose -- the loop re-simulates after every round, so the effect
   of each change is measured rather than assumed. */

import { Rng } from '../engine/rng.js';
import { canonicalKey, isConnected, hasEnclosedHole, normalizeSquare } from '../engine/lattice.js';
import { growPiece, LAB_COLORS, PIECE_NAMES, describe } from './generator.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

function keyOf(c, cells) { return canonicalKey(c.lattice, cells); }
function keys(c) { return new Set(c.pieces.map((p) => keyOf(c, p.cells))); }
const maxSpanOf = (p) => {
  const xs = p.cells.map((q) => q[0]), ys = p.cells.map((q) => q[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1;
};

function freshName(c, rng) {
  const used = new Set(c.pieces.map((p) => p.name));
  const free = PIECE_NAMES.filter((n) => !used.has(n));
  return free.length ? rng.pick(free) : `Form ${c.pieces.length + 1}`;
}
function freshColor(c, rng) {
  const used = new Set(c.pieces.map((p) => p.color));
  const free = LAB_COLORS.filter((n) => !used.has(n));
  return free.length ? rng.pick(free) : rng.pick(LAB_COLORS);
}

function makePiece(c, rng, size, opts = {}) {
  const taken = keys(c);
  for (let i = 0; i < 60; i++) {
    const cells = growPiece(rng, c.lattice, size, { connect: opts.connect || 'edge', compact: opts.compact ?? rng.next() });
    if (cells.length !== size || hasEnclosedHole(c.lattice, cells)) continue;
    if (taken.has(keyOf(c, cells))) continue;
    return {
      id: `x${Date.now().toString(36)}${rng.int(1e6).toString(36)}`,
      name: freshName(c, rng), cells, color: freshColor(c, rng),
      rotation: opts.rotation || dominantRotation(c), connect: opts.connect || 'edge', weight: 1, tags: ['generated']
    };
  }
  return null;
}

function dominantRotation(c) {
  const count = {};
  for (const p of c.pieces) count[p.rotation] = (count[p.rotation] || 0) + 1;
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const r = best ? best[0] : 'rotate';
  return r === 'morph' || r.startsWith('srs') ? 'rotate' : r;
}

/** Remove one cell from a piece while keeping it connected and distinct. */
function shrink(c, idx, rng) {
  const p = c.pieces[idx];
  if (!p || p.cells.length <= 2 || p.rotation === 'morph') return null;
  const taken = keys(c);
  taken.delete(keyOf(c, p.cells));
  const order = rng.shuffle(p.cells.map((_, i) => i));
  for (const i of order) {
    let cells = p.cells.filter((_, j) => j !== i);
    if (!isConnected(c.lattice, cells, p.connect || 'edge')) continue;
    if (c.lattice === 'square') cells = normalizeSquare(cells);
    if (taken.has(keyOf(c, cells))) continue;
    const before = p.cells.length;
    p.cells = cells;
    if (p.colors) p.colors = p.colors.slice(0, cells.length);
    return `trimmed ${p.name} from ${before} to ${cells.length} cells`;
  }
  return null;
}

function grow(c, idx, rng) {
  const p = c.pieces[idx];
  if (!p || p.cells.length >= 6 || p.rotation === 'morph') return null;
  const taken = keys(c);
  taken.delete(keyOf(c, p.cells));
  const dirs = c.lattice === 'hex' ? [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const has = new Set(p.cells.map((q) => q.join(',')));
  const options = [];
  for (const [x, y] of p.cells) for (const [dx, dy] of dirs) if (!has.has(`${x + dx},${y + dy}`)) options.push([x + dx, y + dy]);
  rng.shuffle(options);
  for (const cell of options) {
    let cells = [...p.cells, cell];
    if (hasEnclosedHole(c.lattice, cells)) continue;
    if (c.lattice === 'square') cells = normalizeSquare(cells);
    if (taken.has(keyOf(c, cells))) continue;
    if (maxSpanOf({ cells }) > c.board.width - 3 && !c.wrap) continue;
    const before = p.cells.length;
    p.cells = cells;
    return `grew ${p.name} from ${before} to ${cells.length} cells`;
  }
  return null;
}

function largestIndex(c) { let b = 0; c.pieces.forEach((p, i) => { if (p.cells.length > c.pieces[b].cells.length) b = i; }); return b; }
function smallestIndex(c) { let b = 0; c.pieces.forEach((p, i) => { if (p.cells.length < c.pieces[b].cells.length) b = i; }); return b; }

const CURVES = ['gentle', 'standard', 'steep'];

/* Fix catalogue. Each returns a description or null if not applicable. */
const FIX = {
  widen: (c) => (c.board.width < 14 ? (c.board.width++, `widened the well to ${c.board.width} columns`) : null),
  narrow: (c) => {
    const span = Math.max(...c.pieces.map(maxSpanOf));
    if (c.board.width <= 6 || (!c.wrap && span > c.board.width - 3)) return null;
    c.board.width--; return `narrowed the well to ${c.board.width} columns`;
  },
  taller: (c) => (c.board.height < 24 ? (c.board.height += 2, `raised the ceiling to ${c.board.height} rows`) : null),
  shorter: (c) => (c.board.height > 15 ? (c.board.height -= 2, `lowered the ceiling to ${c.board.height} rows`) : null),
  gentler: (c) => {
    const i = CURVES.indexOf(c.speed?.curve || 'standard');
    if (i <= 0) return null;
    c.speed = { ...(c.speed || {}), curve: CURVES[i - 1] }; return `slowed the speed curve to ${CURVES[i - 1]}`;
  },
  steeper: (c) => {
    const i = CURVES.indexOf(c.speed?.curve || 'standard');
    if (i >= 2) return null;
    c.speed = { ...(c.speed || {}), curve: CURVES[i + 1] }; return `sharpened the speed curve to ${CURVES[i + 1]}`;
  },
  lessGarbage: (c) => {
    const e = c.garbage?.every || 0;
    if (!e) return null;
    if (e >= 16) { c.garbage = { every: 0 }; return 'removed the rising garbage'; }
    c.garbage = { every: e + 4 }; return `slowed garbage to one row every ${e + 4} pieces`;
  },
  moreGarbage: (c) => {
    const e = c.garbage?.every || 0;
    if (!e) { c.garbage = { every: 12 }; return 'added a rising garbage row every 12 pieces'; }
    if (e <= 5) return null;
    c.garbage = { every: e - 3 }; return `sped garbage up to one row every ${e - 3} pieces`;
  },
  relaxClearIfColor: (c, rng) => (c.clear.rule === 'color-match' ? FIX.relaxClear(c, rng) : null),
  relaxClear: (c) => {
    if (c.clear.rule === 'line') { c.clear = { rule: 'line-gap', gaps: 1 }; return 'let rows clear with a single gap'; }
    if (c.clear.rule === 'color-match' && (c.palette?.length || 4) > 3) { c.palette = c.palette.slice(0, -1); return `reduced the palette to ${c.palette.length} colours`; }
    if (c.clear.rule === 'color-match' && c.clear.matchSize > 3) { c.clear.matchSize--; return `lowered the match size to ${c.clear.matchSize}`; }
    return null;
  },
  tightenClear: (c) => {
    if (c.clear.rule === 'line-gap') { c.clear = { rule: 'line' }; return 'required rows to be completely full again'; }
    if (c.clear.rule === 'color-match' && c.clear.matchSize < 6) { c.clear.matchSize++; return `raised the match size to ${c.clear.matchSize}`; }
    if (c.clear.rule === 'color-match' && (c.palette?.length || 4) < 5) {
      const pool = [5, 2, 4, 6, 3, 1].filter((x) => !c.palette.includes(x));
      c.palette = [...c.palette, pool[0]]; return `added a colour (now ${c.palette.length})`;
    }
    return null;
  },
  shrinkLargest: (c, rng) => shrink(c, largestIndex(c), rng),
  growSmallest: (c, rng) => grow(c, smallestIndex(c), rng),
  addRelief: (c, rng) => {
    if (c.pieces.length >= 9) return null;
    const p = makePiece(c, rng, 2, { compact: 1 });
    if (!p) return null;
    c.pieces.push(p); return `added ${p.name}, a two-cell relief piece`;
  },
  addBar: (c, rng) => {
    if (c.pieces.length >= 9) return null;
    const n = Math.min(4, Math.max(3, Math.floor(c.board.width / 3)));
    const cells = c.lattice === 'hex' ? Array.from({ length: n }, (_, i) => [0, i]) : Array.from({ length: n }, (_, i) => [i, 0]);
    if (keys(c).has(keyOf(c, cells))) return null;
    c.pieces.push({ id: `bar${n}`, name: freshName(c, rng), cells, color: freshColor(c, rng), rotation: dominantRotation(c), connect: 'edge', weight: 1, tags: ['generated'] });
    return `added a straight ${n}-cell bar to make rows easier to finish`;
  },
  addChiral: (c, rng) => {
    if (c.pieces.length >= 9) return null;
    const p = makePiece(c, rng, Math.min(5, Math.max(4, c.pieces[smallestIndex(c)].cells.length + 1)), { compact: 0.2 });
    if (!p) return null;
    c.pieces.push(p); return `added ${p.name}, an asymmetric ${p.cells.length}-cell piece that rewards orientation choices`;
  },
  enableRotation: (c) => {
    const fixed = c.pieces.filter((p) => p.rotation === 'none' || p.rotation === 'flip');
    if (!fixed.length) return null;
    for (const p of fixed) p.rotation = p.rotation === 'flip' ? 'full' : 'rotate';
    return `gave ${fixed.length} fixed piece${fixed.length > 1 ? 's' : ''} full rotation`;
  },
  moreBombs: (c) => {
    const b = c.specials?.bomb || 0;
    if (b >= 0.3) return null;
    c.specials = { ...(c.specials || {}), bomb: Math.min(0.3, b ? b * 1.6 : 0.12) };
    return b ? `made bombs more common (${Math.round(c.specials.bomb * 100)}% of pieces)` : 'added bomb cells to blast buried holes';
  },
  dropCascade: (c) => (c.gravityMode === 'cascade' && c.clear.rule !== 'color-match' ? (c.gravityMode = 'naive', 'removed cascade gravity, which never produced a chain') : null),
  dropWrap: (c) => (c.wrap ? (c.wrap = false, 'removed the wrap-around seam, which pieces never used') : null),
  removeLargest: (c) => {
    if (c.pieces.length <= 3) return null;
    const [p] = c.pieces.splice(largestIndex(c), 1);
    return `removed ${p.name}, the largest piece`;
  },
  twist: (c, rng) => {
    const options = [];
    if (!c.specials?.bomb) options.push(() => { c.specials = { ...(c.specials || {}), bomb: 0.12 }; return 'added bomb cells to break from Classic'; });
    if (c.lattice === 'square' && !c.wrap) options.push(() => { c.wrap = true; return 'made the walls wrap around to break from Classic'; });
    const classic = c.pieces.findIndex((p) => (p.tags || []).includes('classic'));
    if (classic >= 0) options.push(() => {
      const p = makePiece(c, rng, 4, {});
      if (!p) return null;
      const [old] = c.pieces.splice(classic, 1, p);
      return `replaced the classic ${old.name} with ${p.name}`;
    });
    return options.length ? rng.pick(options)() : null;
  }
};

const PLAYBOOK = {
  'too-hard': ['relaxClearIfColor', 'widen', 'gentler', 'lessGarbage', 'shrinkLargest', 'relaxClear', 'addRelief', 'taller', 'moreBombs'],
  'too-easy': ['narrow', 'steeper', 'growSmallest', 'moreGarbage', 'tightenClear', 'shorter'],
  tedious: ['addBar', 'relaxClear', 'moreBombs', 'shrinkLargest'],
  'flat-decisions': ['addChiral', 'enableRotation', 'growSmallest', 'narrow'],
  'inert-mechanic': [],
  unreadable: ['removeLargest', 'shrinkLargest'],
  derivative: ['twist', 'twist']
};

/**
 * Produce the next version of a concept given the critic's weaknesses.
 * Returns { concept, changes } -- changes is empty if nothing applicable is left.
 */
export function refine(concept, review, seed) {
  const rng = new Rng(seed);
  const c = clone(concept);
  c.pieces = c.pieces || [];
  const triedList = Array.isArray(c.design?.tried) ? c.design.tried : [];
  const tried = new Set(triedList);
  const tries = (id) => triedList.filter((t) => t === id).length;
  const changes = [];
  const sorted = [...review.weaknesses].sort((a, b) => b.severity - a.severity);
  const budget = sorted.length && sorted[0].severity >= 2 ? 2 : 1;

  for (const w of sorted) {
    if (changes.length >= budget) break;
    let plan = PLAYBOOK[w.id] ? [...PLAYBOOK[w.id]] : [];
    if (w.id === 'problem-piece') {
      const idx = w.data?.index ?? -1;
      const fix = shrink(c, idx, rng) || (() => {
        const old = c.pieces[idx];
        if (!old) return null;
        const p = makePiece(c, rng, old.cells.length, { rotation: old.rotation === 'morph' ? 'rotate' : old.rotation });
        if (!p) return null;
        c.pieces[idx] = p;
        return `replaced ${old.name} with ${p.name}, a different ${p.cells.length}-cell shape`;
      })();
      if (fix) { changes.push({ fix: 'problem-piece', text: fix, because: w.id }); triedList.push('problem-piece'); }
      continue;
    }
    if (w.id === 'inert-mechanic') {
      const which = w.data?.which || [];
      if (which.some((t) => t.startsWith('bomb'))) plan.push('moreBombs');
      if (which.some((t) => t.startsWith('cascade'))) plan.push('dropCascade');
      if (which.some((t) => t.startsWith('colour'))) plan.push('relaxClear');
      if (which.some((t) => t.startsWith('pieces rarely'))) plan.push(tried.has('narrow') ? 'dropWrap' : 'narrow');
    }
    for (const id of plan) {
      const repeatable = id === 'widen' || id === 'narrow' || id === 'twist';
      if (repeatable ? tries(id) >= 2 : tried.has(id)) continue;
      const text = FIX[id](c, rng);
      if (text) {
        tried.add(id);
        triedList.push(id);
        changes.push({ fix: id, text, because: w.id });
        break;
      }
    }
  }
  c.design = { ...(c.design || {}), tried: triedList };
  c.tagline = describe(c);
  return { concept: c, changes };
}
