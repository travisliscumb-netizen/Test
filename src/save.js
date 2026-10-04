/* Versioned local persistence: settings and the top-five table. Every access
   is guarded -- private mode, blocked storage or a corrupt entry must never
   stop the game from starting. */

const KEY = 'pacman.save.v1';
export const TABLE_SIZE = 5;

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  volume: 0.7,
  crt: true,
  dpad: true,
  haptics: true
});

function clean(raw) {
  const out = { settings: { ...DEFAULT_SETTINGS }, scores: [] };
  if (!raw || typeof raw !== 'object') return out;
  const s = raw.settings || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof s[k] === typeof DEFAULT_SETTINGS[k]) out.settings[k] = s[k];
  }
  out.settings.volume = Math.min(1, Math.max(0, Number(out.settings.volume) || 0));
  if (Array.isArray(raw.scores)) {
    out.scores = raw.scores
      .filter((e) => e && Number.isFinite(e.score) && e.score > 0)
      .map((e) => ({
        name: String(e.name || '???').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 3).padEnd(3, ' '),
        score: Math.floor(e.score),
        level: Math.max(1, Math.floor(e.level) || 1)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TABLE_SIZE);
  }
  return out;
}

export function load() {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return clean(null);
  }
}

export function store(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* Storage unavailable: the session still works, it just won't persist. */
  }
}

export function qualifies(scores, score) {
  return score > 0 && (scores.length < TABLE_SIZE || score > scores[scores.length - 1].score);
}

export function insertScore(scores, entry) {
  const next = [...scores, entry].sort((a, b) => b.score - a.score).slice(0, TABLE_SIZE);
  return { scores: next, rank: next.indexOf(entry) };
}
