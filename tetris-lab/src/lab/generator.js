/* On-device concept generator.

   Each ARCHETYPE is a design hypothesis: a gameplay problem with the classic
   formula, and a mechanic that attacks it. build() samples a concrete concept
   from the archetype's space -- lattice, board, a procedurally grown piece
   set, rules -- and writes down the rationale. A random "twist" from another
   archetype is sometimes grafted on, so the space of outputs is combinatorial
   rather than a fixed menu. Nothing here decides whether a concept is good;
   that is the simulator's and critic's job. */

import { Rng } from '../engine/rng.js';
import { canonicalKey, isConnected, hasEnclosedHole, getLattice, normalizeSquare } from '../engine/lattice.js';
import { CLASSIC_DEFS } from '../engine/pieces.js';

/* Palette indices 9..30 are the Lab's extended hue wheel (see render/palette.js). */
const LAB_COLORS = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

const PIECE_NAMES = [
  'Hook', 'Comet', 'Fang', 'Bridge', 'Kite', 'Zigzag', 'Anchor', 'Crown', 'Spark', 'Twin', 'Arc', 'Claw',
  'Wedge', 'Tower', 'Petal', 'Rune', 'Glyph', 'Prism', 'Shard', 'Crescent', 'Beacon', 'Ember', 'Orbit',
  'Pylon', 'Sickle', 'Keel', 'Talon', 'Ripple', 'Nova', 'Quill', 'Spire', 'Loop', 'Fern', 'Comb', 'Cinder',
  'Harp', 'Gate', 'Wisp', 'Tusk', 'Helix'
];

const ADJ = ['Amber', 'Velvet', 'Neon', 'Quiet', 'Molten', 'Crystal', 'Paper', 'Solar', 'Lunar', 'Electric',
  'Hollow', 'Tidal', 'Copper', 'Glass', 'Wild', 'Silent', 'Feral', 'Gilded', 'Frozen', 'Radiant'];

/* ------------------------------------------------------ piece growth -- */

function dirsFor(lattice, connect) {
  const L = getLattice(lattice);
  if (connect === 'corner') return L.allDirs;
  if (connect === 'loose') return [...L.edgeDirs, ...L.edgeDirs.map(([a, b]) => [a * 2, b * 2])];
  return L.edgeDirs;
}

/**
 * Grow a random piece of n cells. `compact` in [0,1] biases growth toward the
 * centroid (blobby) versus outward (spindly).
 */
export function growPiece(rng, lattice, n, { connect = 'edge', compact = 0.5 } = {}) {
  const dirs = dirsFor(lattice, connect);
  const cells = [[0, 0]];
  const has = new Set(['0,0']);
  let guard = 400;
  while (cells.length < n && guard-- > 0) {
    // Candidate frontier cells.
    const frontier = [];
    for (const [x, y] of cells) {
      for (const [dx, dy] of dirs) {
        const k = `${x + dx},${y + dy}`;
        if (!has.has(k)) frontier.push([x + dx, y + dy]);
      }
    }
    if (!frontier.length) break;
    let cx = 0, cy = 0;
    for (const [x, y] of cells) { cx += x; cy += y; }
    cx /= cells.length; cy /= cells.length;
    const weights = frontier.map(([x, y]) => {
      const d = Math.hypot(x - cx, y - cy);
      return compact >= 0.5 ? Math.exp(-(compact - 0.4) * 3 * d) : Math.exp((0.6 - compact) * 1.5 * d);
    });
    const pick = frontier[rng.weighted(weights)];
    const k = pick.join(',');
    if (has.has(k)) continue;
    has.add(k);
    cells.push(pick);
  }
  return lattice === 'square' ? normalizeSquare(cells) : cells;
}

/** Grow a set of distinct pieces with the given sizes. */
function growSet(rng, lattice, sizes, opts = {}, taken = new Set()) {
  const out = [];
  for (const n of sizes) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const connect = typeof opts.connect === 'function' ? opts.connect() : (opts.connect || 'edge');
      const cells = growPiece(rng, lattice, n, { connect, compact: opts.compact ?? rng.next() });
      if (cells.length !== n) continue;
      if (opts.requireLoose && isConnected(lattice, cells, 'corner')) continue;
      if (opts.requireCorner && isConnected(lattice, cells, 'edge')) continue;
      if (opts.noHoles !== false && hasEnclosedHole(lattice, cells)) continue;
      const key = canonicalKey(lattice, cells, opts.reflect === true);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ cells, connect });
      break;
    }
  }
  return out;
}

function nameSet(rng, count) {
  return rng.shuffle(PIECE_NAMES.slice()).slice(0, count);
}

function finishPieces(rng, raw, rotation, extra = {}) {
  const names = nameSet(rng, raw.length);
  const colors = rng.shuffle(LAB_COLORS.slice());
  return raw.map((p, i) => ({
    id: `x${i}`,
    name: names[i],
    cells: p.cells,
    color: colors[i % colors.length],
    rotation: p.rotation || rotation,
    ...(p.morphs ? { morphs: p.morphs } : {}),
    ...(p.fall && p.fall !== 1 ? { fall: p.fall } : {}),
    connect: p.connect || 'edge',
    weight: p.weight ?? 1,
    tags: p.tags || ['generated'],
    ...extra
  }));
}

const classicCopy = (ids) => CLASSIC_DEFS.filter((d) => ids.includes(d.id)).map((d) => ({ ...d, cells: d.cells.map((c) => c.slice()), rotation: 'rotate', tags: ['classic'] }));

/* --------------------------------------------------------- archetypes -- */

export const ARCHETYPES = [
  {
    id: 'hex-hive',
    title: 'Hex Hive',
    problem: 'On a square grid a gap either fits a piece or it does not. Six neighbours per cell give every cavity several ways to be filled, and rows become zig-zags you have to read differently.',
    build(rng) {
      const width = rng.pick([9, 10, 11, 12]);
      const sizes = rng.shuffle([2, 3, 3, 4, 4, 4, 4, 5].slice(0, rng.range(5, 7)));
      const pieces = growSet(rng, 'hex', sizes, { compact: 0.55 });
      return {
        lattice: 'hex', board: { width, height: rng.range(16, 19) },
        pieces: finishPieces(rng, pieces, 'rotate'),
        clear: { rule: 'line' }, gravityMode: rng.chance(0.35) ? 'cascade' : 'naive',
        speed: { curve: 'gentle', linesPerLevel: 8 }
      };
    }
  },
  {
    id: 'chroma-cascade',
    title: 'Chroma Cascade',
    problem: 'Line clears reward filling space, not planning. Clearing connected colour groups with cascading gravity rewards reading several moves ahead to set up chains.',
    build(rng) {
      const sizes = rng.shuffle([2, 3, 3, 3, 4, 4].slice(0, rng.range(4, 5)));
      const pieces = growSet(rng, 'square', sizes, { compact: 0.7 });
      const palette = rng.shuffle([5, 2, 4, 6, 3, 1]).slice(0, rng.range(3, 4));
      return {
        lattice: 'square', board: { width: rng.pick([8, 9, 10]), height: rng.range(16, 18) },
        pieces: finishPieces(rng, pieces, 'rotate'),
        colorMode: 'random-cells', palette,
        clear: { rule: 'color-match', matchSize: rng.pick([4, 4, 5]) }, gravityMode: 'cascade',
        specials: { wild: rng.chance(0.5) ? 0.08 : 0 },
        speed: { curve: 'gentle', linesPerLevel: 12 }
      };
    }
  },
  {
    id: 'mobius-well',
    title: 'Möbius Well',
    problem: 'Walls create dead corners and force every stack to be built around the edges. A wrap-around board has no edges: pieces can straddle the seam and the well can be anywhere.',
    build(rng) {
      const base = classicCopy(rng.shuffle(['I', 'O', 'T', 'S', 'Z', 'J', 'L']).slice(0, rng.range(3, 5)));
      const extra = growSet(rng, 'square', [rng.pick([3, 4, 5]), rng.pick([4, 5])], {}, new Set(base.map((d) => canonicalKey('square', d.cells))));
      return {
        lattice: 'square', wrap: true, board: { width: rng.pick([8, 9, 10]), height: 18 },
        pieces: [...base.map((d) => ({ ...d, connect: 'edge' })), ...finishPieces(rng, extra, 'rotate')],
        clear: { rule: 'line' }, gravityMode: 'naive',
        speed: { curve: 'standard', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'shapeshifter',
    title: 'Shapeshifter',
    problem: 'Rotation gives four views of the same shape. If "rotate" instead transforms a piece between distinct shapes of equal size, every piece becomes a small decision tree.',
    build(rng) {
      const count = rng.range(4, 6);
      const raw = [];
      const taken = new Set();
      for (let i = 0; i < count; i++) {
        const n = rng.pick([3, 4, 4, 5]);
        const forms = growSet(rng, 'square', new Array(rng.range(2, 3)).fill(n), {}, taken);
        if (forms.length < 2) continue;
        raw.push({ cells: forms[0].cells, morphs: forms.slice(1).map((f) => f.cells), rotation: 'morph', tags: ['generated', 'morph'] });
      }
      return {
        lattice: 'square', board: { width: 10, height: 20 },
        pieces: finishPieces(rng, raw, 'morph'),
        clear: { rule: 'line' }, gravityMode: 'naive',
        speed: { curve: 'gentle', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'micro-mosaic',
    title: 'Micro Mosaic',
    problem: 'Tiny pieces fit anywhere, so fitting stops being the challenge. Pressure moves to tempo: rising garbage and a narrow, fast well.',
    build(rng) {
      const sizes = [1, 2, 2, 3, 3, 3].slice(0, rng.range(4, 6));
      const pieces = growSet(rng, 'square', sizes, { compact: 0.5 });
      return {
        lattice: 'square', board: { width: rng.pick([6, 7, 8]), height: rng.range(16, 20) },
        pieces: finishPieces(rng, pieces, 'rotate'),
        clear: { rule: 'line' }, gravityMode: 'naive',
        garbage: { every: rng.range(5, 9) },
        speed: { curve: 'steep', linesPerLevel: 12 }
      };
    }
  },
  {
    id: 'megalith',
    title: 'Megalith',
    problem: 'Big pieces create holes you can never fix. Letting a row clear with one gap turns those holes from scars into part of the plan.',
    build(rng) {
      const sizes = rng.shuffle([4, 5, 5, 5, 6, 6]).slice(0, rng.range(4, 6));
      const pieces = growSet(rng, 'square', sizes, { compact: 0.75 });
      return {
        lattice: 'square', board: { width: rng.pick([12, 13, 14]), height: 22 },
        pieces: finishPieces(rng, pieces, 'rotate'),
        clear: { rule: 'line-gap', gaps: 1 }, gravityMode: 'naive',
        speed: { curve: 'gentle', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'constellation',
    title: 'Constellation',
    problem: 'Edge-connected pieces cannot reach diagonal pockets. Pieces joined at their corners slip into gaps nothing else can fill, at the cost of leaving checkerboard gaps behind.',
    build(rng) {
      const diag = growSet(rng, 'square', [2, 3, 3], { connect: 'corner', requireCorner: true });
      const normal = growSet(rng, 'square', [3, 4, 4], { compact: 0.7 });
      return {
        lattice: 'square', board: { width: 10, height: 20 },
        pieces: finishPieces(rng, [...diag, ...normal], 'rotate'),
        clear: { rule: rng.chance(0.5) ? 'line-gap' : 'line', gaps: 1 },
        gravityMode: rng.chance(0.5) ? 'cascade' : 'naive',
        speed: { curve: 'gentle', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'demolition',
    title: 'Demolition',
    problem: 'Holes are permanent punishment in the classic rules. Explosive cells turn buried holes into targets: clear a line through a bomb and it blasts its neighbours.',
    build(rng) {
      const pieces = growSet(rng, 'square', rng.shuffle([3, 4, 4, 4, 5]).slice(0, 5), { compact: 0.55 });
      return {
        lattice: 'square', board: { width: 10, height: 20 },
        pieces: finishPieces(rng, pieces, 'rotate'),
        clear: { rule: 'line' }, gravityMode: rng.chance(0.6) ? 'cascade' : 'naive',
        specials: { bomb: 0.16 + rng.next() * 0.12 },
        speed: { curve: 'standard', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'tethered',
    title: 'Tethered Twins',
    problem: 'A solid piece cannot straddle a hole. Pieces made of parts with a one-cell gap between them can bridge over cavities and plug two wells at once.',
    build(rng) {
      const loose = growSet(rng, 'square', [2, 3, 4], { connect: 'loose', requireLoose: true });
      const normal = growSet(rng, 'square', [3, 4, 4], { compact: 0.6 });
      return {
        lattice: 'square', board: { width: rng.pick([10, 11]), height: 20 },
        pieces: finishPieces(rng, [...loose, ...normal], 'rotate'),
        clear: { rule: 'line' }, gravityMode: 'naive',
        speed: { curve: 'gentle', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'mirror-guild',
    title: 'Mirror Guild',
    problem: 'Rotation lets any piece face any way, so shapes blur together. Pieces that can only mirror keep their identity, and the order you receive them matters again.',
    build(rng) {
      const pieces = growSet(rng, 'square', rng.shuffle([3, 4, 4, 4, 5, 5]).slice(0, 5), { compact: 0.55, reflect: true });
      return {
        lattice: 'square', board: { width: 10, height: 20 },
        pieces: finishPieces(rng, pieces, 'flip'),
        clear: { rule: 'line-gap', gaps: 1 }, gravityMode: 'naive',
        speed: { curve: 'gentle', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'hex-chroma',
    title: 'Honeycomb Chroma',
    problem: 'Colour matching on a hex grid: six neighbours per cell make groups form in every direction, so chains grow from unexpected angles.',
    build(rng) {
      const pieces = growSet(rng, 'hex', [2, 3, 3, 3], { compact: 0.8 });
      return {
        lattice: 'hex', board: { width: rng.pick([9, 10]), height: 16 },
        pieces: finishPieces(rng, pieces, 'rotate'),
        colorMode: 'random-cells', palette: rng.shuffle([5, 2, 4, 6, 3]).slice(0, 4),
        clear: { rule: 'color-match', matchSize: 4 }, gravityMode: 'cascade',
        speed: { curve: 'gentle', linesPerLevel: 12 }
      };
    }
  },
  {
    id: 'clockwork',
    title: 'Clockwork',
    problem: 'Falling speed turns the late game into a reflex test. Switch gravity off and give each piece a shrinking time budget instead: every placement becomes a deliberate decision made against the clock.',
    build(rng) {
      const sizes = rng.shuffle([3, 4, 4, 4, 5, 5]).slice(0, rng.range(5, 6));
      const pieces = growSet(rng, 'square', sizes, { compact: 0.6 });
      return {
        lattice: 'square', board: { width: rng.pick([10, 11]), height: rng.range(18, 20) },
        pieces: finishPieces(rng, pieces, 'rotate'),
        placement: { mode: 'timed', seconds: 3 + rng.next() * 2.5 },
        clear: { rule: 'line' }, gravityMode: 'naive',
        speed: { curve: 'standard', linesPerLevel: 8 }
      };
    }
  },
  {
    id: 'featherweight',
    title: 'Featherweight',
    problem: 'Every piece falls at the same speed, so weight is never a factor. Give pieces mass: light ones drift and leave time to think, heavy ones plummet and must be placed on instinct.',
    build(rng) {
      const pieces = growSet(rng, 'square', rng.shuffle([2, 3, 4, 4, 5, 5]).slice(0, 5), { compact: 0.55 });
      // Bigger pieces are heavier: the awkward ones give you the least time.
      pieces.sort((a, b) => a.cells.length - b.cells.length);
      pieces.forEach((p, i) => { p.fall = [0.45, 0.6, 1, 1.6, 2.2][Math.min(4, i)]; });
      return {
        lattice: 'square', board: { width: 10, height: 20 },
        pieces: finishPieces(rng, pieces, 'rotate'),
        clear: { rule: 'line' }, gravityMode: 'naive',
        speed: { curve: 'standard', linesPerLevel: 10 }
      };
    }
  },
  {
    id: 'free-form',
    title: 'Free Form',
    problem: 'No hypothesis: a random point in the design space, to find ideas nobody thought to ask for.',
    build(rng) {
      const lattice = rng.chance(0.3) ? 'hex' : 'square';
      const sizes = new Array(rng.range(4, 7)).fill(0).map(() => rng.range(2, lattice === 'hex' ? 4 : 5));
      const pieces = growSet(rng, lattice, sizes, { connect: () => (lattice === 'square' && rng.chance(0.2) ? 'corner' : 'edge') });
      return {
        lattice, board: { width: rng.range(8, 12), height: rng.range(16, 22) },
        wrap: lattice === 'square' && rng.chance(0.25),
        pieces: finishPieces(rng, pieces, rng.pick(['rotate', 'rotate', 'full', 'flip'])),
        clear: { rule: rng.pick(['line', 'line', 'line-gap']), gaps: 1 },
        gravityMode: rng.pick(['naive', 'cascade']),
        specials: { bomb: rng.chance(0.3) ? 0.15 : 0 },
        garbage: { every: rng.chance(0.25) ? rng.range(8, 14) : 0 },
        speed: { curve: rng.pick(['gentle', 'standard']), linesPerLevel: 10 }
      };
    }
  }
];

/* Twists grafted onto a concept from another archetype. Each returns a note. */
const TWISTS = [
  { id: 'bombs', ok: (c) => !c.specials?.bomb, apply: (c) => { c.specials = { ...(c.specials || {}), bomb: 0.12 }; return 'added explosive cells'; } },
  { id: 'cascade', ok: (c) => c.gravityMode !== 'cascade' && c.clear.rule !== 'color-match', apply: (c) => { c.gravityMode = 'cascade'; return 'switched to cascade gravity so cleared rows let cells fall into holes'; } },
  { id: 'wrap', ok: (c) => c.lattice === 'square' && !c.wrap, apply: (c) => { c.wrap = true; return 'made the walls wrap around'; } },
  { id: 'garbage', ok: (c) => !c.garbage?.every, apply: (c) => { c.garbage = { every: 12 }; return 'added a rising garbage tide every 12 pieces'; } },
  { id: 'gap', ok: (c) => c.clear.rule === 'line', apply: (c) => { c.clear = { rule: 'line-gap', gaps: 1 }; return 'allowed rows to clear with one gap'; } },
  { id: 'timed', ok: (c) => c.placement?.mode !== 'timed', apply: (c) => { c.placement = { mode: 'timed', seconds: 4 }; return 'switched gravity off in favour of a four-second placement clock'; } }
];

function conceptName(rng, archetype) {
  return `${rng.pick(ADJ)} ${archetype.title}`;
}

/** Build one raw candidate concept (unvalidated). */
export function generateConcept(seed, { archetypeId = null, twistChance = 0.35 } = {}) {
  const rng = new Rng(seed);
  const arch = archetypeId ? ARCHETYPES.find((a) => a.id === archetypeId) || rng.pick(ARCHETYPES) : rng.pick(ARCHETYPES);
  const body = arch.build(rng);
  const concept = {
    id: `lab-${(seed >>> 0).toString(36)}`,
    name: conceptName(rng, arch),
    tagline: '',
    generation: 'bag',
    colorMode: 'piece',
    gravityMode: 'naive',
    garbage: { every: 0 },
    specials: { bomb: 0, wild: 0 },
    scoring: { kind: 'lab' },
    ...body
  };
  concept.clear = { ...(concept.clear || { rule: 'line' }) };
  const notes = [];
  if (rng.chance(twistChance)) {
    const options = TWISTS.filter((t) => t.ok(concept));
    if (options.length) notes.push(rng.pick(options).apply(concept));
  }
  concept.tagline = describe(concept);
  concept.design = {
    archetype: arch.id,
    archetypeTitle: arch.title,
    problem: arch.problem,
    twists: notes,
    source: 'local',
    seed: seed >>> 0,
    journal: []
  };
  return concept;
}

/** One-line human description of a concept's rules. */
export function describe(c) {
  const parts = [];
  parts.push(c.lattice === 'hex' ? 'Hex grid' : 'Square grid');
  parts.push(`${c.board?.width}×${c.board?.height}`);
  if (c.wrap) parts.push('wrap-around walls');
  const sizes = (c.pieces || []).map((p) => p.cells.length);
  if (sizes.length) parts.push(`${sizes.length} pieces of ${Math.min(...sizes)}–${Math.max(...sizes)} cells`);
  const rule = c.clear?.rule;
  if (rule === 'color-match') parts.push(`match ${c.clear.matchSize}+ of a colour`);
  else if (rule === 'line-gap') parts.push(`rows clear with ${c.clear.gaps} gap`);
  else parts.push('full rows clear');
  if (c.gravityMode === 'cascade') parts.push('cells cascade');
  if (c.specials?.bomb > 0) parts.push('bomb cells');
  if (c.specials?.wild > 0) parts.push('wild cells');
  if (c.garbage?.every > 0) parts.push(`garbage every ${c.garbage.every}`);
  if (c.placement?.mode === 'timed') parts.push(`no gravity: ${Math.round(c.placement.seconds * 10) / 10}s to place each piece`);
  if ((c.pieces || []).some((p) => p.fall && p.fall !== 1)) parts.push('pieces have weight');
  const rots = new Set((c.pieces || []).map((p) => p.rotation));
  if (rots.has('morph')) parts.push('pieces morph instead of rotating');
  else if (rots.has('flip') && rots.size === 1) parts.push('pieces mirror instead of rotating');
  else if (rots.has('full')) parts.push('rotate and mirror');
  return parts.join(' · ');
}

export { LAB_COLORS, PIECE_NAMES };
