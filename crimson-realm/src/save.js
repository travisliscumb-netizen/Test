/* Versioned local save. Storage can be missing or throw (private mode,
   blocked site data) -- the game must still run, it just will not remember. */

const KEY = 'crimson-realm:v1';

export const DEFAULTS = {
  settings: { sound: true, music: true, voice: true, blood: true, haptics: true, size: 1, opacity: 0.85 },
  run: null,                 // { fighter, level, losses }
  best: 0,                   // highest level cleared
  champion: false,           // beat the boss at least once
  stats: { wins: 0, losses: 0, executions: 0, perfects: 0 },
  seenTutorial: false,
  fighter: 'kael',
  quality: 0                 // index into render.QUALITY, lowered automatically on slow devices
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const v = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS), ...v,
      settings: { ...DEFAULTS.settings, ...(v.settings || {}) },
      stats: { ...DEFAULTS.stats, ...(v.stats || {}) }
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* not persisted */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return structuredClone(DEFAULTS);
}
