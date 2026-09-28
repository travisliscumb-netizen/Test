/* Persistence, progression and achievements.

   One versioned JSON record in localStorage (the Claude API key lives under a
   separate key so exporting a save never leaks it). Every field is
   re-validated on load: a missing, truncated, hand-edited or future-version
   save degrades to defaults field by field instead of breaking the game. A
   save that cannot be parsed at all is copied to a backup key before being
   replaced, so nothing is ever silently destroyed.

   DOM-free: storage is injected, so the test suite can run it under Node. */

import { normalizeConcept } from './engine/rules.js';

export const SAVE_KEY = 'prismfall.save';
export const BACKUP_KEY = 'prismfall.save.corrupt';
export const KEY_KEY = 'prismfall.claudeKey';
export const VERSION = 2;
export const MAX_SAVED_CONCEPTS = 60;
export const MAX_SETS = 30;

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  soft: ['ArrowDown', 'KeyS'],
  hard: ['Space'],
  cw: ['ArrowUp', 'KeyX', 'KeyW'],
  ccw: ['KeyZ', 'ControlLeft'],
  r180: ['KeyQ'],
  flip: ['KeyF'],
  hold: ['KeyC', 'ShiftLeft'],
  pause: ['Escape', 'KeyP']
};

export const THEMES = ['prism', 'sunset', 'aurora', 'abyss', 'candy', 'noir', 'gilded'];
export const STYLES = ['gem', 'jelly', 'glass', 'neon', 'retro', 'flat'];

const DEFAULT_SETTINGS = () => ({
  master: 0.9, music: 0.55, sfx: 0.8, muted: false,
  theme: 'prism', style: 'gem',
  ghost: true, previews: 5, das: 150, arr: 33, softDrop: 'fast',
  touch: 'auto', haptics: true, shake: true, motion: 'auto', highContrast: false, glyphs: false,
  uiScale: 1, showFps: false,
  keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
  claudeModel: 'claude-opus-5',
  seenIntro: false
});

const STAT_KEYS = ['games', 'pieces', 'lines', 'tetrises', 'tspins', 'pcs', 'timeMs', 'maxCombo', 'maxChain', 'bombs',
  'labGames', 'labSessions', 'designsTested', 'designsAccepted', 'designsSaved', 'clutches', 'holds', 'bestLevel', 'xp'];

const DEFAULTS = () => ({
  v: VERSION,
  settings: DEFAULT_SETTINGS(),
  records: { marathon: [], sprint: [], ultra: [], lab: {} },
  stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
  achievements: {},
  challenges: { day: '', list: [] },
  lab: { saved: [], sets: [] }
});

/* ---------------------------------------------------------- validators -- */

const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, max, d) => (typeof v === 'string' ? v.slice(0, max) : d);

function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS();
  if (!s || typeof s !== 'object') return d;
  const keys = {};
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const list = Array.isArray(s.keys?.[action]) ? s.keys[action].filter((k) => typeof k === 'string' && k.length < 32).slice(0, 4) : null;
    keys[action] = list && list.length ? list : DEFAULT_KEYS[action].slice();
  }
  return {
    master: num(s.master, 0, 1, d.master),
    music: num(s.music, 0, 1, d.music),
    sfx: num(s.sfx, 0, 1, d.sfx),
    muted: bool(s.muted, d.muted),
    theme: pick(s.theme, THEMES, d.theme),
    style: pick(s.style, STYLES, d.style),
    ghost: bool(s.ghost, d.ghost),
    previews: int(s.previews, 1, 6, d.previews),
    das: int(s.das, 50, 300, d.das),
    arr: int(s.arr, 0, 100, d.arr),
    softDrop: pick(s.softDrop, ['slow', 'fast', 'instant'], d.softDrop),
    touch: pick(s.touch, ['auto', 'buttons', 'gestures', 'off'], d.touch),
    haptics: bool(s.haptics, d.haptics),
    shake: bool(s.shake, d.shake),
    motion: pick(s.motion, ['auto', 'full', 'reduced'], d.motion),
    highContrast: bool(s.highContrast, d.highContrast),
    glyphs: bool(s.glyphs, d.glyphs),
    uiScale: num(s.uiScale, 0.85, 1.3, d.uiScale),
    showFps: bool(s.showFps, d.showFps),
    keys,
    claudeModel: pick(s.claudeModel, ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'], d.claudeModel),
    seenIntro: bool(s.seenIntro, d.seenIntro)
  };
}

function sanitizeRecordList(list, kind) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const rec = {
      score: int(r.score, 0, 1e12, 0),
      lines: int(r.lines, 0, 1e7, 0),
      level: int(r.level, 1, 99, 1),
      timeMs: int(r.timeMs, 0, 1e9, 0),
      date: int(r.date, 0, 1e14, 0)
    };
    if (kind === 'sprint' && rec.timeMs <= 0) continue;
    out.push(rec);
  }
  return sortRecords(out, kind).slice(0, 10);
}

function sortRecords(list, kind) {
  return list.sort(kind === 'sprint' ? (a, b) => a.timeMs - b.timeMs : (a, b) => b.score - a.score);
}

/** A saved concept must survive normalisation and keep its design notes. */
export function sanitizeConcept(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.pieces)) return null;
  const n = normalizeConcept(c);
  if (!n.pieces.length) return null;
  n.id = str(c.id, 64, `saved-${Date.now().toString(36)}`);
  n.savedAt = int(c.savedAt, 0, 1e14, Date.now());
  n.pieces = n.pieces.filter((p) => p && Array.isArray(p.cells)).map((p, i) => ({
    id: str(p.id, 24, `p${i}`),
    name: str(p.name, 24, `Piece ${i + 1}`),
    cells: p.cells.filter((q) => Array.isArray(q) && Number.isInteger(q[0]) && Number.isInteger(q[1])).slice(0, 12).map((q) => [q[0], q[1]]),
    ...(Array.isArray(p.morphs) ? { morphs: p.morphs.filter(Array.isArray).slice(0, 4).map((m) => m.filter((q) => Array.isArray(q) && Number.isInteger(q[0]) && Number.isInteger(q[1])).map((q) => [q[0], q[1]])) } : {}),
    rotation: str(p.rotation, 12, 'rotate'),
    connect: pick(p.connect, ['edge', 'corner', 'loose'], 'edge'),
    color: int(p.color, 1, 31, 9),
    weight: num(p.weight, 0.1, 10, 1),
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string').slice(0, 6) : []
  }));
  if (!n.pieces.length) return null;
  if (c.design && typeof c.design === 'object') {
    try { n.design = JSON.parse(JSON.stringify(c.design)); } catch { n.design = undefined; }
  }
  if (c.metrics && typeof c.metrics === 'object') {
    n.metrics = {};
    for (const [k, v] of Object.entries(c.metrics)) if (Number.isFinite(v)) n.metrics[k] = v;
  }
  return n;
}

function sanitizeSet(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pieces)) return null;
  const pieces = s.pieces.filter((p) => p && Array.isArray(p.cells)).slice(0, 12);
  if (!pieces.length) return null;
  const lattice = pick(s.lattice, ['square', 'hex'], 'square');
  const wrapped = sanitizeConcept({ pieces, lattice });
  if (!wrapped) return null;
  return {
    id: str(s.id, 64, `set-${Date.now().toString(36)}`),
    name: str(s.name, 40, 'Custom Set'),
    lattice,
    pieces: wrapped.pieces,
    savedAt: int(s.savedAt, 0, 1e14, Date.now())
  };
}

/* Migrations: each takes the previous version's raw object. */
const MIGRATIONS = {
  // v1 stored saved concepts at the top level as `concepts`.
  1: (d) => ({ ...d, v: 2, lab: { saved: Array.isArray(d.concepts) ? d.concepts : [], sets: [] } })
};

export function sanitize(raw) {
  const d = DEFAULTS();
  if (!raw || typeof raw !== 'object') return d;
  let data = raw;
  let guard = 10;
  while (Number.isInteger(data.v) && data.v < VERSION && MIGRATIONS[data.v] && guard-- > 0) data = MIGRATIONS[data.v](data);
  d.settings = sanitizeSettings(data.settings);
  d.records.marathon = sanitizeRecordList(data.records?.marathon, 'marathon');
  d.records.sprint = sanitizeRecordList(data.records?.sprint, 'sprint');
  d.records.ultra = sanitizeRecordList(data.records?.ultra, 'ultra');
  if (data.records?.lab && typeof data.records.lab === 'object') {
    for (const [k, v] of Object.entries(data.records.lab).slice(0, 200)) {
      if (typeof k === 'string' && Number.isFinite(v)) d.records.lab[k.slice(0, 64)] = Math.max(0, Math.round(v));
    }
  }
  for (const k of STAT_KEYS) d.stats[k] = int(data.stats?.[k], 0, 1e13, 0);
  if (data.achievements && typeof data.achievements === 'object') {
    for (const a of ACHIEVEMENTS) if (Number.isFinite(data.achievements[a.id])) d.achievements[a.id] = data.achievements[a.id];
  }
  if (data.challenges && typeof data.challenges.day === 'string' && Array.isArray(data.challenges.list)) {
    d.challenges.day = data.challenges.day.slice(0, 10);
    d.challenges.list = data.challenges.list.filter((c) => c && CHALLENGES.some((t) => t.id === c.id)).slice(0, 3)
      .map((c) => ({ id: c.id, progress: int(c.progress, 0, 1e9, 0), done: bool(c.done, false) }));
  }
  const saved = Array.isArray(data.lab?.saved) ? data.lab.saved : [];
  const seen = new Set();
  for (const c of saved) {
    const s = sanitizeConcept(c);
    if (s && !seen.has(s.id)) { seen.add(s.id); d.lab.saved.push(s); }
    if (d.lab.saved.length >= MAX_SAVED_CONCEPTS) break;
  }
  for (const s of Array.isArray(data.lab?.sets) ? data.lab.sets : []) {
    const set = sanitizeSet(s);
    if (set) d.lab.sets.push(set);
    if (d.lab.sets.length >= MAX_SETS) break;
  }
  return d;
}

/* ----------------------------------------------------------- the store -- */

export class SaveStore {
  constructor(storage = safeLocalStorage()) {
    this.storage = storage;
    this.data = DEFAULTS();
    this.listeners = new Set();
    this.timer = null;
    this.loadError = null;
  }

  load() {
    let raw = null;
    try { raw = this.storage?.getItem(SAVE_KEY) ?? null; } catch (e) { this.loadError = 'storage unavailable'; }
    if (raw == null) { this.data = DEFAULTS(); return this.data; }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.loadError = 'save data was corrupted and has been reset (a backup was kept)';
      try { this.storage.setItem(BACKUP_KEY, raw); } catch { /* ignore */ }
      this.data = DEFAULTS();
      this.flush();
      return this.data;
    }
    if (parsed && Number.isInteger(parsed.v) && parsed.v > VERSION) {
      // Written by a newer build: read what we understand, never downgrade-write over it.
      this.readOnlyFuture = true;
    }
    this.data = sanitize(parsed);
    return this.data;
  }

  get settings() { return this.data.settings; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  touch() {
    for (const fn of this.listeners) { try { fn(this.data); } catch { /* listener bugs must not break saving */ } }
    if (this.timer) return;
    const run = () => { this.timer = null; this.flush(); };
    this.timer = typeof setTimeout === 'function' ? setTimeout(run, 200) : null;
    if (!this.timer) run();
  }

  flush() {
    if (this.readOnlyFuture) return false;
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      // Quota exceeded: drop design journals from saved concepts and retry once.
      try {
        for (const c of this.data.lab.saved) if (c.design) c.design.journal = (c.design.journal || []).slice(-2);
        this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
        return true;
      } catch { return false; }
    }
  }

  setSetting(key, value) {
    const next = sanitizeSettings({ ...this.data.settings, [key]: value });
    this.data.settings = next;
    this.touch();
    return next[key];
  }

  resetSettings() { this.data.settings = { ...DEFAULT_SETTINGS(), seenIntro: true }; this.touch(); }

  resetAll() {
    this.data = DEFAULTS();
    this.data.settings.seenIntro = true;
    this.readOnlyFuture = false;
    this.flush();
    this.touch();
  }

  export() { return JSON.stringify(this.data, null, 2); }

  import(text) {
    const parsed = JSON.parse(text); // throws on garbage; caller shows the error
    if (!parsed || typeof parsed !== 'object' || !('settings' in parsed || 'records' in parsed || 'lab' in parsed)) {
      throw new Error('That file is not a Prismfall save.');
    }
    this.data = sanitize(parsed);
    this.readOnlyFuture = false;
    this.flush();
    this.touch();
  }

  /* ---- records ---- */

  /** Returns { rank (1-based or 0), personalBest } */
  addRecord(mode, rec) {
    const list = this.data.records[mode];
    if (!Array.isArray(list)) return { rank: 0, personalBest: false };
    const entry = { score: rec.score | 0, lines: rec.lines | 0, level: rec.level | 0 || 1, timeMs: Math.round(rec.timeMs), date: Date.now() };
    if (mode === 'sprint' && !rec.completed) return { rank: 0, personalBest: false };
    list.push(entry);
    sortRecords(list, mode);
    list.length = Math.min(list.length, 10);
    const rank = list.indexOf(entry) + 1;
    this.touch();
    return { rank, personalBest: rank === 1 };
  }

  addLabRecord(conceptId, score) {
    const prev = this.data.records.lab[conceptId] || 0;
    if (score > prev) { this.data.records.lab[conceptId] = score; this.touch(); return true; }
    return false;
  }

  bump(stat, n = 1) {
    if (!(stat in this.data.stats)) return;
    this.data.stats[stat] += n;
    this.touch();
  }

  max(stat, v) {
    if (!(stat in this.data.stats)) return;
    if (v > this.data.stats[stat]) { this.data.stats[stat] = v; this.touch(); }
  }

  /* ---- achievements ---- */

  unlock(id) {
    if (this.data.achievements[id] || !ACHIEVEMENTS.some((a) => a.id === id)) return false;
    this.data.achievements[id] = Date.now();
    this.data.stats.xp += 250;
    this.touch();
    return true;
  }

  has(id) { return !!this.data.achievements[id]; }

  /* ---- progression ---- */

  get rank() { return rankFor(this.data.stats.xp); }

  isUnlocked(kind, id) {
    const u = UNLOCKS[kind]?.[id];
    if (!u) return true;
    if (u.rank && this.rank.level >= u.rank) return true;
    if (u.achievement && this.has(u.achievement)) return true;
    return false;
  }

  /* ---- daily challenges ---- */

  refreshChallenges(today = new Date()) {
    const day = today.toISOString().slice(0, 10);
    if (this.data.challenges.day === day && this.data.challenges.list.length === 3) return this.data.challenges.list;
    let h = 0;
    for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = CHALLENGES.slice();
    const list = [];
    while (list.length < 3 && pool.length) {
      h = (h * 1103515245 + 12345) >>> 0;
      const [c] = pool.splice(h % pool.length, 1);
      list.push({ id: c.id, progress: 0, done: false });
    }
    this.data.challenges = { day, list };
    this.touch();
    return list;
  }

  /** Feed a finished game summary; returns challenges completed by it. */
  progressChallenges(summary) {
    const done = [];
    for (const c of this.data.challenges.list) {
      if (c.done) continue;
      const def = CHALLENGES.find((t) => t.id === c.id);
      if (!def) continue;
      const v = def.measure(summary);
      if (def.cumulative) c.progress += v; else c.progress = Math.max(c.progress, v);
      if (c.progress >= def.goal) { c.done = true; this.data.stats.xp += def.xp; done.push(def); }
    }
    this.touch();
    return done;
  }

  /* ---- lab creations ---- */

  saveConcept(concept) {
    const s = sanitizeConcept({ ...concept, savedAt: Date.now() });
    if (!s) throw new Error('That design could not be saved.');
    const i = this.data.lab.saved.findIndex((c) => c.id === s.id);
    if (i >= 0) this.data.lab.saved[i] = s;
    else {
      if (this.data.lab.saved.length >= MAX_SAVED_CONCEPTS) throw new Error(`Your collection is full (${MAX_SAVED_CONCEPTS} designs). Delete one first.`);
      this.data.lab.saved.unshift(s);
      this.data.stats.designsSaved++;
    }
    this.touch();
    return s;
  }

  renameConcept(id, name) {
    const c = this.data.lab.saved.find((x) => x.id === id);
    const clean = String(name || '').trim().slice(0, 40);
    if (!c || !clean) return false;
    c.name = clean;
    this.touch();
    return true;
  }

  deleteConcept(id) {
    const n = this.data.lab.saved.length;
    this.data.lab.saved = this.data.lab.saved.filter((c) => c.id !== id);
    this.touch();
    return this.data.lab.saved.length < n;
  }

  getConcept(id) { return this.data.lab.saved.find((c) => c.id === id) || null; }

  saveSet(set) {
    const s = sanitizeSet({ ...set, savedAt: Date.now() });
    if (!s) throw new Error('A set needs at least one valid piece.');
    const i = this.data.lab.sets.findIndex((x) => x.id === s.id);
    if (i >= 0) this.data.lab.sets[i] = s;
    else {
      if (this.data.lab.sets.length >= MAX_SETS) throw new Error(`You can keep up to ${MAX_SETS} custom sets.`);
      this.data.lab.sets.unshift(s);
    }
    this.touch();
    return s;
  }

  deleteSet(id) {
    this.data.lab.sets = this.data.lab.sets.filter((s) => s.id !== id);
    this.touch();
  }

  /* ---- Claude key (separate storage key, never exported) ---- */
  getApiKey() { try { return this.storage?.getItem(KEY_KEY) || ''; } catch { return ''; } }
  setApiKey(k) {
    try {
      const t = String(k || '').trim();
      if (t) this.storage.setItem(KEY_KEY, t); else this.storage.removeItem(KEY_KEY);
    } catch { /* private mode */ }
  }
}

function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return memoryStorage();
    const probe = '__prismfall_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m
  };
}

/* -------------------------------------------------------- progression -- */

export function rankFor(xp) {
  let level = 1;
  while (level < 50 && xp >= xpForRank(level + 1)) level++;
  const cur = xpForRank(level), next = xpForRank(level + 1);
  return { level, xp, into: xp - cur, span: next - cur, next };
}
export function xpForRank(n) { return 600 * (n - 1) * n / 2; }

export const UNLOCKS = {
  theme: {
    sunset: { rank: 2, label: 'Reach rank 2' },
    aurora: { rank: 4, label: 'Reach rank 4' },
    abyss: { rank: 6, label: 'Reach rank 6' },
    candy: { achievement: 'tetris', label: 'Clear four lines at once' },
    noir: { rank: 9, label: 'Reach rank 9' },
    gilded: { achievement: 'level-15', label: 'Reach level 15 in Marathon' }
  },
  style: {
    jelly: { rank: 3, label: 'Reach rank 3' },
    glass: { rank: 5, label: 'Reach rank 5' },
    neon: { achievement: 'lab-play', label: 'Play an AI Lab design' },
    retro: { achievement: 'lines-500', label: 'Clear 500 lines in total' }
    // 'flat' is an accessibility style and is never locked.
  }
};

export const ACHIEVEMENTS = [
  { id: 'first-clear', name: 'First Light', desc: 'Clear your first line' },
  { id: 'tetris', name: 'Four Alarm', desc: 'Clear four lines at once' },
  { id: 'tspin', name: 'Twist', desc: 'Land a T-Spin that clears lines' },
  { id: 'tspin-double', name: 'Double Helix', desc: 'Land a T-Spin Double' },
  { id: 'tspin-triple', name: 'Triple Helix', desc: 'Land a T-Spin Triple' },
  { id: 'b2b', name: 'Back to Back', desc: 'Chain two difficult clears back to back' },
  { id: 'combo-5', name: 'Rhythm', desc: 'Reach a 5 combo' },
  { id: 'combo-10', name: 'Metronome', desc: 'Reach a 10 combo' },
  { id: 'perfect', name: 'Clean Slate', desc: 'Clear the entire board' },
  { id: 'clutch', name: 'Clutch', desc: 'Clear lines with the stack in the top four rows' },
  { id: 'level-10', name: 'Double Digits', desc: 'Reach level 10 in Marathon' },
  { id: 'level-15', name: 'Terminal Velocity', desc: 'Reach level 15 in Marathon' },
  { id: 'lines-100', name: 'Centurion', desc: 'Clear 100 lines in total' },
  { id: 'lines-500', name: 'Stonemason', desc: 'Clear 500 lines in total' },
  { id: 'sprint-180', name: 'Quick Hands', desc: 'Finish Sprint in under 3:00' },
  { id: 'sprint-100', name: 'Lightning', desc: 'Finish Sprint in under 1:40' },
  { id: 'ultra-50k', name: 'Two-Minute Warning', desc: 'Score 50,000 in Ultra' },
  { id: 'score-250k', name: 'High Roller', desc: 'Score 250,000 in one Marathon' },
  { id: 'lab-session', name: 'Mad Scientist', desc: 'Run an AI Lab design session' },
  { id: 'lab-save', name: 'Curator', desc: 'Save a design to your collection' },
  { id: 'lab-play', name: 'Test Pilot', desc: 'Play an AI Lab design' },
  { id: 'lab-chain', name: 'Chain Reaction', desc: 'Trigger a ×3 chain in the Lab' },
  { id: 'lab-bomb', name: 'Demolition Expert', desc: 'Detonate 25 bombs in total' },
  { id: 'lab-edit', name: 'Tinkerer', desc: 'Modify a design and re-test it' },
  { id: 'lab-claude', name: 'Collaborator', desc: 'Get an accepted design from Claude' },
  { id: 'hex', name: 'Honeycomb', desc: 'Clear 20 lines on a hex grid' }
];

export const CHALLENGES = [
  { id: 'lines-40', text: 'Clear 40 lines in any mode', goal: 40, xp: 300, cumulative: true, measure: (s) => s.lines },
  { id: 'tetris-3', text: 'Score 3 four-line clears', goal: 3, xp: 350, cumulative: true, measure: (s) => s.tetrises },
  { id: 'tspin-2', text: 'Land 2 T-Spins', goal: 2, xp: 400, cumulative: true, measure: (s) => s.tspins },
  { id: 'combo-4', text: 'Reach a 4 combo', goal: 4, xp: 300, cumulative: false, measure: (s) => s.maxCombo },
  { id: 'marathon-lvl6', text: 'Reach level 6 in Marathon', goal: 6, xp: 350, cumulative: false, measure: (s) => (s.mode === 'marathon' ? s.level : 0) },
  { id: 'sprint', text: 'Finish a Sprint', goal: 1, xp: 300, cumulative: true, measure: (s) => (s.mode === 'sprint' && s.completed ? 1 : 0) },
  { id: 'ultra-20k', text: 'Score 20,000 in Ultra', goal: 20000, xp: 350, cumulative: false, measure: (s) => (s.mode === 'ultra' ? s.score : 0) },
  { id: 'lab-2', text: 'Play 2 AI Lab games', goal: 2, xp: 300, cumulative: true, measure: (s) => (s.mode === 'lab' ? 1 : 0) },
  { id: 'lab-lines', text: 'Clear 25 lines or groups in the Lab', goal: 25, xp: 350, cumulative: true, measure: (s) => (s.mode === 'lab' ? s.lines + s.groups : 0) },
  { id: 'pieces-300', text: 'Place 300 pieces', goal: 300, xp: 250, cumulative: true, measure: (s) => s.pieces },
  { id: 'score-30k', text: 'Score 30,000 in one game', goal: 30000, xp: 350, cumulative: false, measure: (s) => s.score }
];
