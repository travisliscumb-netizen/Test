// Records and settings in localStorage. Every access is guarded: private
// windows, blocked storage and quota errors all degrade to "nothing saved"
// instead of breaking the game. Nothing ever leaves the browser.
import { CONFIG } from './config.js';

const KEY = 'skifree.save.v1';

export const DEFAULT_SETTINGS = {
  master: CONFIG.AUDIO_VOLUME,
  music: CONFIG.MUSIC_VOLUME,
  sfx: CONFIG.SFX_VOLUME,
  reducedMotion: false,
  effects: CONFIG.SNOW_EFFECTS,
  touch: 'auto', // auto | on | off
  seedMode: 'random', // random | fixed
  seed: '',
};

function blank() {
  return {
    v: 1,
    best: { score: 0, distance: 0, maxSpeed: 0, escapes: 0 },
    courses: {}, // slalom/tree: best total seconds (penalties in); freestyle: best style
    totals: { runs: 0, distance: 0, eaten: 0, escapes: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const unit = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

// Validates field by field so a corrupted or hand-edited save can't poison the game.
export function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object') return s;
  const b = raw.best || {};
  s.best = { score: num(b.score), distance: num(b.distance), maxSpeed: num(b.maxSpeed), escapes: num(b.escapes) };
  const cs = raw.courses && typeof raw.courses === 'object' ? raw.courses : {};
  for (const id of ['slalom', 'tree', 'freestyle']) {
    if (typeof cs[id] === 'number' && Number.isFinite(cs[id]) && cs[id] > 0) s.courses[id] = cs[id];
  }
  const t = raw.totals || {};
  s.totals = { runs: num(t.runs), distance: num(t.distance), eaten: num(t.eaten), escapes: num(t.escapes) };
  const st = raw.settings || {};
  const d = DEFAULT_SETTINGS;
  s.settings = {
    master: unit(st.master, d.master),
    music: unit(st.music, d.music),
    sfx: unit(st.sfx, d.sfx),
    reducedMotion: typeof st.reducedMotion === 'boolean' ? st.reducedMotion : d.reducedMotion,
    effects: typeof st.effects === 'boolean' ? st.effects : d.effects,
    touch: ['auto', 'on', 'off'].includes(st.touch) ? st.touch : d.touch,
    seedMode: ['random', 'fixed'].includes(st.seedMode) ? st.seedMode : d.seedMode,
    seed: typeof st.seed === 'string' ? st.seed.slice(0, 24) : d.seed,
  };
  return s;
}

export class Save {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    try {
      const txt = this.storage?.getItem(KEY);
      return sanitize(txt ? JSON.parse(txt) : null);
    } catch {
      return blank();
    }
  }

  write() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = sanitize({ ...this.data, settings: { ...this.data.settings, ...patch } }).settings;
    this.write();
  }

  // Folds a finished run into the records. Returns which records it broke.
  recordRun({ score, distance, maxSpeed, escapes, eaten }) {
    const b = this.data.best;
    const broke = {
      score: score > b.score,
      distance: distance > b.distance,
      maxSpeed: maxSpeed > b.maxSpeed,
    };
    b.score = Math.max(b.score, score);
    b.distance = Math.max(b.distance, distance);
    b.maxSpeed = Math.max(b.maxSpeed, maxSpeed);
    b.escapes = Math.max(b.escapes, escapes);
    const t = this.data.totals;
    t.runs++;
    t.distance += distance;
    t.escapes += escapes;
    if (eaten) t.eaten++;
    this.write();
    return broke;
  }

  // Returns true when this is a new best for the course: fastest total for
  // the slaloms, most style for freestyle.
  recordCourse(id, value) {
    const prev = this.data.courses[id];
    const higher = id === 'freestyle';
    const best = !(prev > 0) || (higher ? value > prev : value < prev);
    if (best && value > 0) {
      this.data.courses[id] = value;
      this.write();
    }
    return best;
  }

  resetRecords() {
    const settings = this.data.settings;
    this.data = blank();
    this.data.settings = settings;
    this.write();
  }
}
