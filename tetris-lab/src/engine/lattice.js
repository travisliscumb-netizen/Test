/* Lattices: the geometry layer underneath every piece and board.

   A lattice owns everything that depends on the shape of a cell:
     - the native coordinate system pieces are authored in,
     - rotation / reflection of native coordinates,
     - adjacency (for connectivity checks, colour groups and bomb blasts),
     - conversion from (anchor, native offset) to board (col, row),
     - projection to screen space for renderers.

   Boards are always stored as col/row grids with row 0 at the top and gravity
   pointing to increasing rows. For the square lattice native == board space.
   For the hex lattice pieces are authored in axial (q, r) coordinates around a
   pivot cell and the board uses flat-top "odd-q" offset coordinates, so a
   column is a straight vertical stack of hexes and a row is a zig-zag line.

   Translation of a hex shape by one column changes the row offsets of half its
   cells, so compiled hex states carry two offset variants, one per anchor-column
   parity. Collision code then works identically for both lattices. */

const SQRT3 = Math.sqrt(3);

export const SQUARE = {
  id: 'square',
  rotations: 4,
  rotateCW: ([x, y]) => [-y, x],
  rotateCCW: ([x, y]) => [y, -x],
  reflect: ([x, y]) => [-x, y],
  /** Edge neighbours in native space. */
  edgeDirs: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  /** Edge + corner neighbours in native space. */
  allDirs: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  /** Native offset relative to an anchor column parity -> board offset. */
  toBoardOffset: ([x, y]) => [x, y],
  /** Board-space neighbours of (col,row). */
  boardNeighbors(col, row, corners = false) {
    const dirs = corners ? SQUARE.allDirs : SQUARE.edgeDirs;
    return dirs.map(([dx, dy]) => [col + dx, row + dy]);
  },
  /** Centre of a board cell in cell units (cell size 1). */
  cellCenter: (col, row) => [col + 0.5, row + 0.5],
  /** Centre of a native offset for piece previews. */
  nativeCenter: ([x, y]) => [x + 0.5, y + 0.5],
  /** Board extent in cell units. */
  extent: (w, h) => [w, h],
  cellSize: [1, 1]
};

/* Axial helpers for flat-top hexes, "odd-q" offset layout (odd columns sit
   half a cell lower). */
function axialToOffset(q, r) { return [q, r + ((q - (q & 1)) >> 1)]; }
function offsetToAxial(col, row) { return [col, row - ((col - (col & 1)) >> 1)]; }

export const HEX = {
  id: 'hex',
  rotations: 6,
  // Cube rotation by 60 degrees clockwise on a y-down screen.
  rotateCW: ([q, r]) => [-r, q + r],
  rotateCCW: ([q, r]) => [q + r, -q],
  reflect: ([q, r]) => [-q, r + q],
  edgeDirs: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
  allDirs: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
  /** Board offset of a native axial offset when the anchor sits in a column of
      the given parity (0 = even, 1 = odd). */
  toBoardOffsetParity([q, r], parity) {
    const [aq, ar] = offsetToAxial(parity, 0);
    const [c, rr] = axialToOffset(aq + q, ar + r);
    return [c - parity, rr];
  },
  boardNeighbors(col, row) {
    const [q, r] = offsetToAxial(col, row);
    return HEX.edgeDirs.map(([dq, dr]) => axialToOffset(q + dq, r + dr));
  },
  /* Cell size 1 == hex circumradius. Column pitch 1.5, row pitch sqrt(3). */
  cellCenter: (col, row) => [1 + col * 1.5, SQRT3 * (row + 0.5 + 0.5 * (col & 1))],
  nativeCenter: ([q, r]) => [q * 1.5, SQRT3 * (r + q / 2)],
  extent: (w, h) => [1.5 * w + 0.5, SQRT3 * (h + 0.5)],
  cellSize: [2, SQRT3],
  axialToOffset,
  offsetToAxial
};

export const LATTICES = { square: SQUARE, hex: HEX };

export function getLattice(id) {
  const l = LATTICES[id];
  if (!l) throw new Error(`Unknown lattice "${id}"`);
  return l;
}

/** Translate native cells so that the minimum x and y are 0 (square only). */
export function normalizeSquare(cells) {
  let mx = Infinity, my = Infinity;
  for (const [x, y] of cells) { if (x < mx) mx = x; if (y < my) my = y; }
  return cells.map(([x, y]) => [x - mx, y - my]);
}

/** Translate hex cells so the cell closest to the visual centroid sits at 0,0. */
export function pivotHex(cells) {
  let sx = 0, sy = 0;
  const centers = cells.map((c) => HEX.nativeCenter(c));
  for (const [x, y] of centers) { sx += x; sy += y; }
  sx /= cells.length; sy /= cells.length;
  let best = 0, bestD = Infinity;
  centers.forEach(([x, y], i) => {
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bestD - 1e-9) { bestD = d; best = i; }
  });
  const [pq, pr] = cells[best];
  return cells.map(([q, r]) => [q - pq, r - pr]);
}

/**
 * Translation- and rotation-invariant key for a shape (optionally
 * reflection-invariant). Used to de-duplicate generated pieces.
 */
export function canonicalKey(latticeId, cells, withReflection = false) {
  const L = getLattice(latticeId);
  const variants = [];
  let cur = cells.map((c) => c.slice());
  const push = (shape) => {
    let norm;
    if (latticeId === 'square') norm = normalizeSquare(shape);
    else {
      // Normalise hex in offset space-independent axial form: shift min q, then min r.
      let mq = Infinity; for (const [q] of shape) mq = Math.min(mq, q);
      let mr = Infinity; for (const [q, r] of shape) if (q === mq) mr = Math.min(mr, r);
      norm = shape.map(([q, r]) => [q - mq, r - mr]);
    }
    norm.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    variants.push(norm.map((c) => c.join(',')).join(';'));
  };
  for (let pass = 0; pass < (withReflection ? 2 : 1); pass++) {
    for (let i = 0; i < L.rotations; i++) {
      push(cur);
      cur = cur.map((c) => L.rotateCW(c));
    }
    cur = cells.map((c) => L.reflect(c));
  }
  variants.sort();
  return `${latticeId}:${variants[0]}`;
}

/** Are all cells connected under the given connectivity rule? */
export function isConnected(latticeId, cells, mode = 'edge') {
  if (cells.length <= 1) return true;
  const L = getLattice(latticeId);
  let dirs;
  if (mode === 'corner') dirs = L.allDirs;
  else if (mode === 'loose') {
    // Cells may be separated by at most one empty cell in a straight line.
    dirs = [...L.allDirs, ...L.edgeDirs.map(([a, b]) => [a * 2, b * 2])];
  } else dirs = L.edgeDirs;
  const key = (c) => c[0] + ',' + c[1];
  const set = new Set(cells.map(key));
  const seen = new Set([key(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of dirs) {
      const k = (x + dx) + ',' + (y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

/** True if the shape encloses at least one empty cell (a ring / donut). */
export function hasEnclosedHole(latticeId, cells) {
  const L = getLattice(latticeId);
  const key = (c) => c[0] + ',' + c[1];
  const set = new Set(cells.map(key));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // Flood fill the empty space from outside a padded bounding box.
  minX -= 2; minY -= 2; maxX += 2; maxY += 2;
  const outside = new Set();
  const stack = [[minX, minY]];
  outside.add(key([minX, minY]));
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of L.edgeDirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const k = nx + ',' + ny;
      if (set.has(k) || outside.has(k)) continue;
      outside.add(k);
      stack.push([nx, ny]);
    }
  }
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  return outside.size + set.size < area;
}
