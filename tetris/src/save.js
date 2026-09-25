/* Versioned localStorage for settings and records. Every access is guarded:
   private browsing, disabled storage or a full quota must never break play. */

const KEY = 'tetris3d.v1';

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'Numpad4'],
  right: ['ArrowRight', 'Numpad6'],
  softDrop: ['ArrowDown', 'Numpad2'],
  hardDrop: ['Space', 'Numpad8'],
  rotateCW: ['ArrowUp', 'KeyX'],
  rotateCCW: ['KeyZ', 'ControlLeft'],
  rotate180: ['KeyA', ''],
  hold: ['KeyC', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
  view: ['KeyV', '']
};

export const DEFAULT_SETTINGS = {
  das: 167,
  arr: 33,
  sdf: 20,             // 0 means instant (stored as 0 because JSON has no Infinity)
  ghost: true,
  grid: true,
  view: 'dynamic',
  quality: 'auto',
  shake: true,
  particles: true,
  music: 0.55,
  sfx: 0.8,
  startLevel: 1,
  touchControls: 'auto',
  bindings: DEFAULT_BINDINGS
};

const MODES = ['marathon', 'sprint', 'ultra', 'endless'];
const MAX_RECORDS = 10;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  out.das = num(out.das, 0, 500, DEFAULT_SETTINGS.das);
  out.arr = num(out.arr, 0, 200, DEFAULT_SETTINGS.arr);
  out.sdf = num(out.sdf, 0, 100, DEFAULT_SETTINGS.sdf);
  out.music = num(out.music, 0, 1, DEFAULT_SETTINGS.music);
  out.sfx = num(out.sfx, 0, 1, DEFAULT_SETTINGS.sfx);
  out.startLevel = num(out.startLevel, 1, 20, 1) | 0;
  if (!['flat', 'tilt', 'dynamic'].includes(out.view)) out.view = DEFAULT_SETTINGS.view;
  if (!['auto', 'high', 'medium', 'low'].includes(out.quality)) out.quality = 'auto';
  if (!['auto', 'on', 'off'].includes(out.touchControls)) out.touchControls = 'auto';
  const b = {};
  for (const [action, keys] of Object.entries(DEFAULT_BINDINGS)) {
    const saved = s && s.bindings && Array.isArray(s.bindings[action]) ? s.bindings[action] : keys;
    b[action] = [String(saved[0] || ''), String(saved[1] || '')];
  }
  out.bindings = b;
  return out;
}

export class Store {
  constructor() {
    const data = read() || {};
    this.settings = sanitizeSettings(data.settings);
    this.records = {};
    for (const m of MODES) this.records[m] = Array.isArray(data.records && data.records[m]) ? data.records[m] : [];
    this.seenHelp = !!data.seenHelp;
  }

  save() {
    return write({ settings: this.settings, records: this.records, seenHelp: this.seenHelp });
  }

  setSetting(key, value) {
    this.settings = sanitizeSettings({ ...this.settings, [key]: value });
    this.save();
  }

  resetSettings() {
    this.settings = sanitizeSettings({});
    this.save();
  }

  /* Sprint ranks by time (only completed runs count); the rest by score. */
  static better(mode, a, b) {
    if (mode === 'sprint') return a.time - b.time;
    return b.score - a.score || a.time - b.time;
  }

  /* Returns the 0-based rank of the new entry, or -1 if it did not place. */
  addRecord(summary) {
    const mode = summary.mode;
    if (!this.records[mode]) return -1;
    if (mode === 'sprint' && !summary.finished) return -1;
    if (mode !== 'sprint' && summary.score <= 0) return -1;
    const entry = {
      score: summary.score, lines: summary.lines, level: summary.level, time: summary.time,
      pps: Math.round(summary.pps * 100) / 100, tetrises: summary.tetrises, tspins: summary.tspins,
      date: new Date().toISOString().slice(0, 10), id: Math.random().toString(36).slice(2, 10)
    };
    const list = [...this.records[mode], entry].sort((a, b) => Store.better(mode, a, b)).slice(0, MAX_RECORDS);
    this.records[mode] = list;
    this.save();
    return list.findIndex((e) => e.id === entry.id);
  }

  best(mode) {
    return this.records[mode] && this.records[mode][0] || null;
  }
}
