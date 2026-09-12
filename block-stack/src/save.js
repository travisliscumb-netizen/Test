/* Persistence. One versioned localStorage record; every write is guarded so a
   private-mode / quota failure degrades to an in-memory session instead of
   breaking the game. */

const KEY = 'blockstack.save.v1';

const DEFAULTS = () => ({
  v: 1,
  highest: 1,                 // highest unlocked level
  completed: 0,               // highest completed level
  levels: {},                 // num -> { crowns, score, perfects, combo, remainPct, endless }
  records: {
    totalPerfects: 0, bestCombo: 0, smallest: 1, totalRuns: 0, totalBlocks: 0,
    bestScore: 0, bestEndless: 0, recoveries: 0
  },
  achievements: {},
  settings: { sound: true, music: true, haptics: true }
});

let state = DEFAULTS();
let dirty = false;
let timer = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1) {
        state = Object.assign(DEFAULTS(), parsed);
        state.records = Object.assign(DEFAULTS().records, parsed.records || {});
        state.settings = Object.assign(DEFAULTS().settings, parsed.settings || {});
        state.levels = parsed.levels || {};
        state.achievements = parsed.achievements || {};
      }
    }
  } catch (e) { /* corrupt or unavailable -> defaults */ }
  return state;
}

export function get() { return state; }

export function flush() {
  if (!dirty) return;
  dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota / private mode */ }
}

function touch() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 250);
}

export function setSetting(key, value) { state.settings[key] = value; touch(); }

export const ACHIEVEMENTS = [
  { id: 'first-perfect', name: 'Dead Centre', desc: 'Land your first Perfect' },
  { id: 'triple', name: 'Triple Perfect', desc: 'Three Perfects in a row' },
  { id: 'ten-perfect', name: 'Metronome', desc: 'Ten Perfects in a row' },
  { id: 'comeback', name: 'Comeback', desc: 'Recover width after dropping below a third' },
  { id: 'sliver', name: 'On a Thread', desc: 'Survive a platform under 10% width' },
  { id: 'first-boss', name: 'Gatecrasher', desc: 'Clear your first boss' },
  { id: 'world-clear', name: 'World Complete', desc: 'Finish every level in a world' },
  { id: 'level-50', name: 'Halfway Up', desc: 'Reach level 50' },
  { id: 'level-100', name: 'Summit', desc: 'Clear level 100' },
  { id: 'endless-25', name: 'Overtime', desc: 'Stack 25 extra blocks after a boss' }
];

export function unlock(id) {
  if (state.achievements[id]) return false;
  state.achievements[id] = Date.now();
  touch();
  return true;
}

export function hasAchievement(id) { return !!state.achievements[id]; }

export function levelRecord(n) { return state.levels[n] || null; }

/**
 * Merge a run into the save. Returns which records were beaten.
 * A boss banks its clear the moment the requirement is met and again when the
 * continuation ends, so `cumulative: false` on that first call keeps lifetime
 * totals from counting the same run twice.
 */
export function recordRun(summary, opts = {}) {
  const r = state.records;
  const beat = [];
  if (opts.cumulative !== false) {
    r.totalRuns++;
    r.totalBlocks += summary.placed;
    r.totalPerfects += summary.perfects;
    r.recoveries += summary.recoveries;
  }
  if (summary.bestCombo > r.bestCombo) { r.bestCombo = summary.bestCombo; beat.push('streak'); }
  if (summary.score > r.bestScore) { r.bestScore = summary.score; beat.push('score'); }
  if (summary.placed > 0 && summary.smallest < r.smallest) { r.smallest = summary.smallest; }
  if (summary.endlessBlocks > r.bestEndless) { r.bestEndless = summary.endlessBlocks; beat.push('endless'); }

  if (summary.cleared) {
    const n = summary.level;
    const prev = state.levels[n];
    const next = {
      crowns: Math.max(prev ? prev.crowns : 0, summary.crowns),
      score: Math.max(prev ? prev.score : 0, summary.score),
      perfects: Math.max(prev ? prev.perfects : 0, summary.perfects),
      combo: Math.max(prev ? prev.combo : 0, summary.bestCombo),
      remainPct: Math.max(prev ? prev.remainPct : 0, summary.remainingPct),
      endless: Math.max(prev ? prev.endless : 0, summary.endlessBlocks)
    };
    if (!prev || next.score > prev.score || next.crowns > prev.crowns) beat.push('level');
    state.levels[n] = next;
    state.completed = Math.max(state.completed, n);
    state.highest = Math.max(state.highest, Math.min(100, n + 1));
  }
  touch();
  return beat;
}

export function worldProgress(world) {
  let done = 0, crowns = 0;
  for (let i = 1; i <= 10; i++) {
    const rec = state.levels[(world - 1) * 10 + i];
    if (rec) { done++; crowns += rec.crowns; }
  }
  return { done, crowns, total: 10, maxCrowns: 30 };
}

export function isUnlocked(n) { return n <= state.highest; }

export function resetAll() {
  state = DEFAULTS();
  dirty = true;
  flush();
}
