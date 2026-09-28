/* Clear detection and application, shared by the Game and by the bot's
   look-ahead so both always agree on what a placement does. Pure functions
   over a Board and a compiled ruleset. */

/** Find what the current board would clear, or null. */
export function findClear(board, rules) {
  const rule = rules.clear.rule;
  let rows = [];
  let groups = [];
  const indices = new Set();
  if (rule === 'line' || rule === 'line-gap') {
    rows = board.findLines(rule === 'line-gap' ? rules.clear.gaps : 0);
    for (const r of rows) {
      for (let c = 0; c < board.w; c++) {
        const i = r * board.w + c;
        if (board.cells[i]) indices.add(i);
      }
    }
  } else {
    groups = board.findColorGroups(rules.clear.matchSize);
    for (const g of groups) for (const i of g.cells) indices.add(i);
  }
  if (!indices.size && !rows.length) return null;
  const before = indices.size;
  const { bombs } = board.expandBombs(indices);
  return {
    rows,
    groups: groups.length,
    groupSizes: groups.map((g) => g.cells.length),
    indices,
    lines: rows.length,
    bombs,
    bombCells: indices.size - before
  };
}

/** Remove what findClear found, applying the ruleset's gravity mode. */
export function applyClear(board, rules, f) {
  if (rules.gravityMode === 'cascade') {
    board.removeIndices(f.indices);
    board.cascade();
    return;
  }
  const rowSet = new Set(f.rows);
  for (const i of f.indices) if (!rowSet.has((i / board.w) | 0)) board.cells[i] = 0;
  board.removeRows(f.rows);
}

/**
 * Resolve every clear (including cascade chains) on a scratch board.
 * Returns totals; used by the bot and the assist projection.
 */
export function resolveAll(board, rules, maxChain = 12) {
  let lines = 0, cells = 0, groups = 0, chains = 0, bombs = 0;
  for (let k = 0; k < maxChain; k++) {
    const f = findClear(board, rules);
    if (!f) break;
    chains++;
    lines += f.lines;
    groups += f.groups;
    cells += f.indices.size;
    bombs += f.bombs;
    applyClear(board, rules, f);
    if (rules.gravityMode !== 'cascade') break;
  }
  return { lines, cells, groups, chains, bombs };
}
