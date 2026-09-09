/**
 * The domain store.
 *
 * One in-memory mirror of the database, one subscription channel, and one way
 * to change anything: `commit()`. Every mutation is
 *
 *   1. applied to memory and published, so the interface responds within the
 *      same frame the finger lifted — the animation never waits on the disk
 *   2. written in a single IndexedDB transaction together with its event
 *   3. rolled back and reported if that transaction fails
 *
 * That ordering is the whole reliability story. A double tap cannot produce
 * two completions because mutations are idempotent on their target state; a
 * refresh mid-write cannot produce a half-written day because the projection
 * and the event share one transaction; and a full storage failure cannot leave
 * the screen showing work that was never saved, because step 3 puts it back.
 */

import { STORE, withStore, StorageError } from './db.js';
import {
  SCHEMA_VERSION, STOP_STATUS, DEFAULT_SETTINGS, META_KEYS,
  makeProperty, makeDay, GEO_SOURCE, shouldReplaceGeo,
} from './schema.js';
import { dateKey, weekOf, weekdayOf } from '../core/time.js';

export const EVENT = {
  dayStart: 'day-start',
  complete: 'complete',
  uncomplete: 'uncomplete',
  skip: 'skip',
  push: 'push',
  restore: 'restore-stop',
  note: 'note',
  reorder: 'reorder',
  optimize: 'optimize-apply',
  revert: 'order-revert',
  pin: 'pin',
  geo: 'geo-correct',
  seed: 'seed',
  importData: 'import',
  restoreBackup: 'restore-backup',
};

export class Store extends EventTarget {
  constructor() {
    super();
    this.ready = false;
    this.properties = new Map();
    this.days = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.dataOrigin = null;
    this.lastError = null;
    this._undo = [];
    this._pendingWrites = 0;
  }

  // ---------------------------------------------------------------- lifecycle

  async init() {
    const data = await withStore(
      [STORE.properties, STORE.days, STORE.meta], 'readonly',
      async (tx) => ({
        properties: await tx.getAll(STORE.properties),
        days: await tx.getAll(STORE.days),
        meta: await tx.getAll(STORE.meta),
      })
    );
    this.properties = new Map(data.properties.map((p) => [p.id, p]));
    this.days = new Map(data.days.map((d) => [d.date, d]));
    for (const m of data.meta) {
      if (m.key === META_KEYS.settings) this.settings = { ...DEFAULT_SETTINGS, ...m.value };
      if (m.key === META_KEYS.dataOrigin) this.dataOrigin = m.value;
    }
    this.ready = true;
    this.publish('ready');
    return this;
  }

  get hasData() { return this.properties.size > 0; }

  publish(reason, detail = {}) {
    this.dispatchEvent(new CustomEvent('change', { detail: { reason, ...detail } }));
  }

  subscribe(fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener('change', h);
    return () => this.removeEventListener('change', h);
  }

  // ------------------------------------------------------------------- reads

  activeProperties(crew = this.settings.crew) {
    const out = [];
    for (const p of this.properties.values()) {
      if (p.active && (!crew || p.crew === crew)) out.push(p);
    }
    return out;
  }

  propertiesForWeekday(weekday, crew = this.settings.crew) {
    return this.activeProperties(crew)
      .filter((p) => p.day === weekday)
      .sort((a, b) => a.order - b.order || a.address.localeCompare(b.address));
  }

  /**
   * The day record for a date, materialised from the master route if it does
   * not exist yet. Materialising is *not* a write: a day the operator never
   * opened should not accumulate a database row, and a day they did open must
   * survive a reload, so the row is written on the first real mutation.
   */
  dayFor(date = dateKey(), crew = this.settings.crew) {
    const existing = this.days.get(dayId(date, crew));
    if (existing) return existing;
    const weekday = weekdayOf(date);
    const props = this.propertiesForWeekday(weekday, crew);
    return makeDay({
      date: dayId(date, crew),
      week: weekOf(date),
      weekday,
      crew,
      order: props.map((p) => p.id),
      masterOrder: props.map((p) => p.id),
      stops: {},
    });
  }

  stopsFor(date = dateKey(), crew = this.settings.crew) {
    const day = this.dayFor(date, crew);
    const out = [];
    for (const id of day.order) {
      const p = this.properties.get(id);
      if (!p) continue;
      const s = day.stops[id] || { status: STOP_STATUS.pending };
      out.push({ ...p, stop: s, status: s.status, doneAt: s.at ?? null, dayNote: s.note ?? null });
    }
    return out;
  }

  /** Every recorded completion, oldest first — the input to the learning model. */
  async allCompletions() {
    const rows = await withStore(STORE.events, 'readonly', (tx) => tx.getAll(STORE.events));
    return rows
      .filter((e) => e.type === EVENT.complete && Number.isFinite(e.at) && e.propertyId)
      .map((e) => ({ propertyId: e.propertyId, at: e.at, dateKey: e.date }))
      .sort((a, b) => a.at - b.at);
  }

  async dayStarts() {
    const rows = await withStore(STORE.events, 'readonly', (tx) => tx.getAll(STORE.events));
    const out = {};
    for (const e of rows) {
      if (e.type === EVENT.dayStart && Number.isFinite(e.at)) {
        const k = String(e.date || '').split('|')[0];
        if (!out[k] || e.at < out[k]) out[k] = e.at;
      }
    }
    return out;
  }

  async historyFor(propertyId, limit = 40) {
    const rows = await withStore(STORE.events, 'readonly', (tx) =>
      tx.getAll(STORE.events).then((all) => all.filter((e) => e.propertyId === propertyId))
    );
    return rows.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  // --------------------------------------------------------------- mutations

  /**
   * Applies `patch` to memory, publishes, then persists. Returns a promise that
   * resolves when the write is durable; callers that care (backup, import) can
   * await it, and callers that do not (a Done tap) can ignore it and let the
   * rollback path handle failure.
   */
  async commit({ reason, event, days = [], properties = [], meta = [], undo = null }) {
    const snapshot = {
      days: days.map((d) => [d.date, this.days.get(d.date)]),
      properties: properties.map((p) => [p.id, this.properties.get(p.id)]),
      settings: meta.length ? { ...this.settings } : null,
    };

    for (const d of days) { d.updatedAt = Date.now(); this.days.set(d.date, d); }
    for (const p of properties) { p.updatedAt = Date.now(); this.properties.set(p.id, p); }
    for (const m of meta) {
      if (m.key === META_KEYS.settings) this.settings = m.value;
      if (m.key === META_KEYS.dataOrigin) this.dataOrigin = m.value;
    }
    if (undo) {
      this._undo.push(undo);
      if (this._undo.length > 40) this._undo.shift();
    }
    this.publish(reason, { event });

    this._pendingWrites++;
    try {
      await withStore([STORE.days, STORE.properties, STORE.meta, STORE.events], 'readwrite', async (tx) => {
        for (const d of days) await tx.put(STORE.days, d);
        for (const p of properties) await tx.put(STORE.properties, p);
        for (const m of meta) await tx.put(STORE.meta, m);
        if (event) await tx.add(STORE.events, { ...event, at: event.at ?? Date.now() });
      });
      this.lastError = null;
      return { ok: true };
    } catch (err) {
      // Put memory back exactly as it was, so the screen can never show work
      // that the device did not actually keep.
      for (const [k, v] of snapshot.days) { if (v) this.days.set(k, v); else this.days.delete(k); }
      for (const [k, v] of snapshot.properties) { if (v) this.properties.set(k, v); else this.properties.delete(k); }
      if (snapshot.settings) this.settings = snapshot.settings;
      if (undo) this._undo.pop();
      this.lastError = err;
      this.publish('write-failed', { error: err });
      return { ok: false, error: err };
    } finally {
      this._pendingWrites--;
    }
  }

  get writing() { return this._pendingWrites > 0; }

  startDay(date = dateKey(), crew = this.settings.crew, at = Date.now()) {
    const day = cloneDay(this.dayFor(date, crew));
    if (day.startedAt) return Promise.resolve({ ok: true, already: true });
    day.startedAt = at;
    return this.commit({
      reason: 'day-start',
      days: [day],
      event: { type: EVENT.dayStart, date: day.date, at },
    });
  }

  /**
   * Marks a stop complete. Idempotent: tapping Done twice, or a stray second
   * touch during the animation, leaves exactly one completion and one event.
   */
  completeStop(propertyId, { date = dateKey(), crew = this.settings.crew, at = Date.now(), source = 'manual' } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const cur = day.stops[propertyId];
    if (cur && cur.status === STOP_STATUS.done) return Promise.resolve({ ok: true, already: true });

    const prev = cur ? { ...cur } : null;
    day.stops[propertyId] = { ...(cur || {}), status: STOP_STATUS.done, at, source };
    if (!day.startedAt) day.startedAt = at;

    return this.commit({
      reason: 'complete',
      days: [day],
      event: { type: EVENT.complete, date: day.date, propertyId, at, source },
      undo: { kind: 'stop', date: day.date, propertyId, prev, label: 'Completion' },
    });
  }

  setStopStatus(propertyId, status, { date = dateKey(), crew = this.settings.crew, at = Date.now(), reason = null } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const cur = day.stops[propertyId];
    const prev = cur ? { ...cur } : null;
    if (status === STOP_STATUS.pending) delete day.stops[propertyId];
    else day.stops[propertyId] = { ...(cur || {}), status, at, reason };

    const type = status === STOP_STATUS.done ? EVENT.complete
      : status === STOP_STATUS.skipped ? EVENT.skip
      : status === STOP_STATUS.pushed ? EVENT.push
      : EVENT.uncomplete;

    return this.commit({
      reason: 'status',
      days: [day],
      event: { type, date: day.date, propertyId, at, reason },
      undo: { kind: 'stop', date: day.date, propertyId, prev, label: labelFor(status) },
    });
  }

  setDayNote(propertyId, text, { date = dateKey(), crew = this.settings.crew } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const cur = day.stops[propertyId] || { status: STOP_STATUS.pending };
    const prev = { ...cur };
    day.stops[propertyId] = { ...cur, note: text };
    return this.commit({
      reason: 'note',
      days: [day],
      event: { type: EVENT.note, date: day.date, propertyId, at: Date.now(), payload: { text } },
      undo: { kind: 'stop', date: day.date, propertyId, prev, label: 'Note' },
    });
  }

  setPermanentNote(propertyId, text) {
    const p = this.properties.get(propertyId);
    if (!p) return Promise.resolve({ ok: false });
    const next = { ...p, note: text };
    return this.commit({
      reason: 'property-note',
      properties: [next],
      event: { type: EVENT.note, propertyId, at: Date.now(), payload: { text, permanent: true } },
    });
  }

  reorderDay(newOrder, { date = dateKey(), crew = this.settings.crew, source = 'manual', meta = null } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const before = [...day.order];
    day.order = newOrder;
    if (source === 'optimize') {
      day.optimizations = [...day.optimizations, { at: Date.now(), before, after: [...newOrder], ...(meta || {}) }];
    }
    return this.commit({
      reason: 'reorder',
      days: [day],
      event: {
        type: source === 'optimize' ? EVENT.optimize : EVENT.reorder,
        date: day.date, at: Date.now(), payload: { before, after: newOrder, ...(meta || {}) },
      },
      undo: { kind: 'order', date: day.date, prev: before, label: source === 'optimize' ? 'Optimized order' : 'Reorder' },
    });
  }

  /** Puts the day back on the master route order. Never destructive of history. */
  revertOrder({ date = dateKey(), crew = this.settings.crew } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const before = [...day.order];
    const master = day.masterOrder && day.masterOrder.length
      ? [...day.masterOrder]
      : this.propertiesForWeekday(day.weekday, crew).map((p) => p.id);
    // Completed stops keep their achieved position; only the remainder resets.
    const doneIds = day.order.filter((id) => day.stops[id]?.status === STOP_STATUS.done);
    const rest = master.filter((id) => !doneIds.includes(id));
    day.order = [...doneIds, ...rest];
    return this.commit({
      reason: 'revert-order',
      days: [day],
      event: { type: EVENT.revert, date: day.date, at: Date.now(), payload: { before, after: day.order } },
      undo: { kind: 'order', date: day.date, prev: before, label: 'Restore master order' },
    });
  }

  togglePin(propertyId, { date = dateKey(), crew = this.settings.crew } = {}) {
    const day = cloneDay(this.dayFor(date, crew));
    const set = new Set(day.pinned || []);
    if (set.has(propertyId)) set.delete(propertyId); else set.add(propertyId);
    day.pinned = [...set];
    return this.commit({
      reason: 'pin',
      days: [day],
      event: { type: EVENT.pin, date: day.date, propertyId, at: Date.now(), payload: { pinned: set.has(propertyId) } },
    });
  }

  /**
   * Corrects a property's coordinates from the field. This is the only source
   * that outranks everything else, permanently — see shouldReplaceGeo.
   */
  correctLocation(propertyId, lat, lng, { accuracyM = null, source = GEO_SOURCE.manual } = {}) {
    const p = this.properties.get(propertyId);
    if (!p) return Promise.resolve({ ok: false });
    if (!shouldReplaceGeo(p.geoSource, source) && source !== GEO_SOURCE.manual) {
      return Promise.resolve({ ok: false, skipped: 'lower-precedence' });
    }
    const prev = { lat: p.lat, lng: p.lng, geoSource: p.geoSource };
    const next = { ...p, lat, lng, geoSource: source, geoAccuracyM: accuracyM, needsLocationReview: false };
    return this.commit({
      reason: 'geo',
      properties: [next],
      event: { type: EVENT.geo, propertyId, at: Date.now(), payload: { from: prev, to: { lat, lng, source } } },
      undo: { kind: 'geo', propertyId, prev, label: 'Location' },
    });
  }

  setProperty(propertyId, patch) {
    const p = this.properties.get(propertyId);
    if (!p) return Promise.resolve({ ok: false });
    return this.commit({
      reason: 'property',
      properties: [{ ...p, ...patch }],
      event: { type: 'property-edit', propertyId, at: Date.now(), payload: patch },
    });
  }

  updateSettings(patch) {
    const next = { ...this.settings, ...patch };
    return this.commit({
      reason: 'settings',
      meta: [{ key: META_KEYS.settings, value: next }],
    });
  }

  // ------------------------------------------------------------------- undo

  get canUndo() { return this._undo.length > 0; }
  get nextUndoLabel() { return this._undo.length ? this._undo[this._undo.length - 1].label : null; }

  async undo() {
    const u = this._undo.pop();
    if (!u) return { ok: false };
    if (u.kind === 'stop') {
      const day = cloneDay(this.days.get(u.date) || this.dayFor(u.date.split('|')[0], u.date.split('|')[1]));
      if (u.prev) day.stops[u.propertyId] = u.prev; else delete day.stops[u.propertyId];
      return this.commit({
        reason: 'undo', days: [day],
        event: { type: EVENT.uncomplete, date: day.date, propertyId: u.propertyId, at: Date.now(), payload: { undo: true } },
      });
    }
    if (u.kind === 'order') {
      const day = cloneDay(this.days.get(u.date));
      if (!day) return { ok: false };
      day.order = u.prev;
      return this.commit({
        reason: 'undo', days: [day],
        event: { type: EVENT.reorder, date: day.date, at: Date.now(), payload: { after: u.prev, undo: true } },
      });
    }
    if (u.kind === 'geo') {
      const p = this.properties.get(u.propertyId);
      if (!p) return { ok: false };
      return this.commit({
        reason: 'undo', properties: [{ ...p, ...u.prev }],
        event: { type: EVENT.geo, propertyId: u.propertyId, at: Date.now(), payload: { undo: true } },
      });
    }
    return { ok: false };
  }

  // ------------------------------------------------------------ bulk loading

  /** Replaces the property table wholesale. Used by seeding and restore. */
  async replaceProperties(list, origin) {
    const props = list.map((p) => makeProperty(p));
    await withStore([STORE.properties, STORE.meta, STORE.events], 'readwrite', async (tx) => {
      await tx.clear(STORE.properties);
      for (const p of props) await tx.put(STORE.properties, p);
      await tx.put(STORE.meta, { key: META_KEYS.dataOrigin, value: origin });
      await tx.put(STORE.meta, { key: META_KEYS.schema, value: { version: SCHEMA_VERSION, at: Date.now() } });
      await tx.add(STORE.events, {
        type: EVENT.seed, at: Date.now(),
        payload: { count: props.length, origin: origin?.label ?? null },
      });
    });
    this.properties = new Map(props.map((p) => [p.id, p]));
    this.dataOrigin = origin;
    this.publish('seeded', { count: props.length });
    return props.length;
  }

  /** Bulk-appends historical events (from a 1.0 import or a restore). */
  async importEvents(events) {
    if (!events.length) return 0;
    // Chunked so a single transaction never grows large enough to be at risk
    // of a Safari timeout on an older phone.
    const CHUNK = 400;
    let written = 0;
    for (let i = 0; i < events.length; i += CHUNK) {
      const slice = events.slice(i, i + CHUNK);
      await withStore(STORE.events, 'readwrite', async (tx) => {
        for (const e of slice) await tx.add(STORE.events, e);
      });
      written += slice.length;
    }
    this.publish('events-imported', { count: written });
    return written;
  }

  async importDays(days) {
    if (!days.length) return 0;
    await withStore(STORE.days, 'readwrite', async (tx) => {
      for (const d of days) await tx.put(STORE.days, d);
    });
    for (const d of days) this.days.set(d.date, d);
    this.publish('days-imported', { count: days.length });
    return days.length;
  }

  async wipeAll() {
    await withStore([STORE.properties, STORE.days, STORE.events, STORE.meta], 'readwrite', async (tx) => {
      await tx.clear(STORE.properties);
      await tx.clear(STORE.days);
      await tx.clear(STORE.events);
      await tx.clear(STORE.meta);
    });
    this.properties.clear();
    this.days.clear();
    this.settings = { ...DEFAULT_SETTINGS };
    this.dataOrigin = null;
    this._undo = [];
    this.publish('wiped');
  }

  async exportRaw() {
    return withStore([STORE.properties, STORE.days, STORE.events, STORE.meta], 'readonly', async (tx) => ({
      properties: await tx.getAll(STORE.properties),
      days: await tx.getAll(STORE.days),
      events: await tx.getAll(STORE.events),
      meta: await tx.getAll(STORE.meta),
    }));
  }
}

export function dayId(date, crew) {
  return `${date}|${crew}`;
}

function cloneDay(d) {
  return { ...d, order: [...d.order], masterOrder: [...(d.masterOrder || [])], stops: { ...d.stops }, pinned: [...(d.pinned || [])], optimizations: [...(d.optimizations || [])] };
}

function labelFor(status) {
  return status === STOP_STATUS.done ? 'Completion'
    : status === STOP_STATUS.skipped ? 'Skip'
    : status === STOP_STATUS.pushed ? 'Push'
    : 'Change';
}

export const store = new Store();
export { StorageError };
