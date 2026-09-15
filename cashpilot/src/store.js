// Cashpilot — runtime store: in-memory state, IndexedDB durability, Dropbox sync.
//
// Ownership model:
//   - IndexedDB is the local cache and the offline source of truth.
//   - Dropbox /Cashpilot/data.json is the shared source of truth across devices.
//   - Writes are local-first and immediate; sync is debounced and best-effort.
//
// The app must stay fully usable with Dropbox disconnected or offline. Sync is
// an enhancement, never a precondition for recording a transaction.

import { DBX_DATA, IDB_STORE_DATA, LS } from './config.js';
import { idbGet, idbSet } from './idb.js';
import * as dbx from './dropbox.js';
import { migrate, emptyData, SCHEMA_VERSION } from './model.js';
import { stableStringify, debounce } from './util.js';

const DATA_KEY = 'ledger';
const META_KEY = 'syncmeta';

const listeners = new Set();
let state = emptyData();
let syncMeta = { rev: null, lastSyncAt: null, lastError: null, pending: false };
let loaded = false;

// --- events ------------------------------------------------------------------

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) {
    try { fn(state, reason); } catch (err) { console.error('store listener failed', err); }
  }
}

export const getData = () => state;
export const getSyncMeta = () => ({ ...syncMeta });

// --- settings (separate from the ledger; device-local) -----------------------

export function getSettings() {
  try { return JSON.parse(localStorage.getItem(LS.settings) || '{}'); } catch { return {}; }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(LS.settings, JSON.stringify(next)); } catch { /* private mode */ }
  emit('settings');
  return next;
}

// --- load / persist ----------------------------------------------------------

export async function load() {
  if (loaded) return state;
  try {
    const [stored, meta] = await Promise.all([
      idbGet(IDB_STORE_DATA, DATA_KEY),
      idbGet(IDB_STORE_DATA, META_KEY),
    ]);
    if (stored) state = migrate(stored);
    if (meta) syncMeta = { ...syncMeta, ...meta };
  } catch (err) {
    // A broken local cache must not brick the app.
    console.error('Local data could not be read; starting empty.', err);
    state = emptyData();
  }
  loaded = true;
  emit('load');
  return state;
}

async function persistLocal() {
  state.updatedAt = new Date().toISOString();
  state.schemaVersion = SCHEMA_VERSION;
  try {
    await idbSet(IDB_STORE_DATA, DATA_KEY, structuredClone(state));
  } catch (err) {
    console.error('Could not write to IndexedDB', err);
    throw new Error('This device would not save the change locally. Check that site data is allowed for this page.');
  }
}

async function persistMeta() {
  try { await idbSet(IDB_STORE_DATA, META_KEY, syncMeta); } catch { /* non-fatal */ }
}

/**
 * Apply a mutation, persist locally, notify the UI, and schedule a sync.
 * Every write in the app goes through here so nothing can bypass persistence.
 */
export async function mutate(fn, reason = 'mutate') {
  await load();
  const result = fn(state);
  await persistLocal();
  emit(reason);
  scheduleSync();
  return result;
}

// --- merge -------------------------------------------------------------------

const COLLECTIONS = ['transactions', 'bills', 'budgets', 'goals', 'documents', 'rules'];

/**
 * Three-way-ish merge of two ledgers.
 *
 * Rows are identified by id and the newer `updatedAt` wins. Deletions are
 * carried as tombstones — without them, a row deleted on the phone is simply
 * absent from that side and the desktop copy silently resurrects it on the next
 * sync. That is the classic bug in naive JSON sync and it is unacceptable in a
 * ledger, so deletes are explicit and dated.
 */
export function mergeLedgers(local, remote) {
  const out = migrate(structuredClone(remote));
  const tombstones = { ...(remote.tombstones || {}), ...(local.tombstones || {}) };
  // For an id deleted on both sides, keep the later deletion timestamp.
  for (const id of Object.keys(tombstones)) {
    const a = remote.tombstones?.[id] || '';
    const b = local.tombstones?.[id] || '';
    tombstones[id] = a > b ? a : b;
  }

  for (const key of COLLECTIONS) {
    const byId = new Map();
    for (const row of out[key] || []) byId.set(row.id, row);
    for (const row of local[key] || []) {
      const existing = byId.get(row.id);
      if (!existing) { byId.set(row.id, row); continue; }
      const a = String(row.updatedAt || row.addedAt || '');
      const b = String(existing.updatedAt || existing.addedAt || '');
      if (a >= b) byId.set(row.id, row);
    }
    // Drop anything whose tombstone is at least as new as the surviving row.
    out[key] = [...byId.values()].filter((row) => {
      const killed = tombstones[row.id];
      if (!killed) return true;
      return String(row.updatedAt || row.addedAt || '') > killed;
    });
  }

  out.tombstones = tombstones;
  // Settings: whichever ledger was written more recently.
  out.settings = String(local.updatedAt || '') >= String(remote.updatedAt || '')
    ? { ...out.settings, ...local.settings }
    : { ...local.settings, ...out.settings };
  out.updatedAt = new Date().toISOString();
  out.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/** Record a deletion so it survives a sync. */
export function tombstone(data, id) {
  if (!data.tombstones) data.tombstones = {};
  data.tombstones[id] = new Date().toISOString();
}

// --- sync --------------------------------------------------------------------

let syncing = false;
let syncQueued = false;

export const scheduleSync = debounce(() => { void sync(); }, 2500);

/**
 * Push local state to Dropbox, merging first if the remote moved underneath us.
 * Safe to call any time; no-ops when Dropbox is not connected.
 */
export async function sync({ force = false } = {}) {
  if (!dbx.isConnected()) {
    syncMeta = { ...syncMeta, pending: false, lastError: null };
    return { skipped: 'not-connected' };
  }
  if (syncing) { syncQueued = true; return { skipped: 'in-flight' }; }
  syncing = true;
  syncMeta = { ...syncMeta, pending: true, lastError: null };
  emit('sync-start');

  try {
    await load();
    const remoteMeta = await dbx.getMetadata(DBX_DATA);

    // Remote changed since our last read: pull, merge, then write the merge.
    if (remoteMeta && remoteMeta.rev !== syncMeta.rev) {
      const { text } = await dbx.downloadText(DBX_DATA);
      let remote;
      try { remote = JSON.parse(text); } catch {
        throw new Error('The Dropbox data.json is not valid JSON. Rename it and let Cashpilot recreate it.');
      }
      state = mergeLedgers(state, migrate(remote));
      await persistLocal();
      emit('merged');
    } else if (!remoteMeta) {
      await dbx.ensureFolders();
    }

    const body = new Blob([stableStringify(state)], { type: 'application/json' });
    const written = await dbx.upload(DBX_DATA, body, {
      // Only assert a rev we actually observed; on first write there is none.
      rev: remoteMeta && remoteMeta.rev === syncMeta.rev ? syncMeta.rev : null,
    });

    syncMeta = { rev: written.rev, lastSyncAt: new Date().toISOString(), lastError: null, pending: false };
    await persistMeta();
    emit('sync-ok');
    return { rev: written.rev };
  } catch (err) {
    // A conflict means someone else wrote between our read and our write. Clear
    // the rev so the next pass re-reads and merges rather than forcing.
    if (/conflict/i.test(err.message)) {
      syncMeta = { ...syncMeta, rev: null };
      await persistMeta();
      if (!force) {
        syncing = false;
        return sync({ force: true });
      }
    }
    syncMeta = { ...syncMeta, pending: false, lastError: err.message };
    await persistMeta();
    emit('sync-error');
    return { error: err.message };
  } finally {
    syncing = false;
    if (syncQueued) { syncQueued = false; scheduleSync(); }
  }
}

/** Pull remote and merge without pushing — used on app focus. */
export async function pull() {
  if (!dbx.isConnected()) return { skipped: 'not-connected' };
  await load();
  const remoteMeta = await dbx.getMetadata(DBX_DATA);
  if (!remoteMeta || remoteMeta.rev === syncMeta.rev) return { unchanged: true };
  const { text } = await dbx.downloadText(DBX_DATA);
  state = mergeLedgers(state, migrate(JSON.parse(text)));
  syncMeta = { ...syncMeta, rev: remoteMeta.rev };
  await persistLocal();
  await persistMeta();
  emit('pulled');
  return { merged: true };
}

// --- import / export ---------------------------------------------------------

export function exportJSON() {
  return stableStringify({ ...state, exportedAt: new Date().toISOString(), app: 'Cashpilot' });
}

/**
 * Import a ledger. `mode: 'merge'` folds it into the current data (the safe
 * default); `mode: 'replace'` swaps it wholesale.
 */
export async function importJSON(text, { mode = 'merge' } = {}) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    throw new Error('That file is not valid JSON.');
  }
  const incoming = migrate(parsed);
  await load();
  state = mode === 'replace' ? incoming : mergeLedgers(incoming, state);
  await persistLocal();
  emit('import');
  scheduleSync();
  return {
    transactions: incoming.transactions.length,
    bills: incoming.bills.length,
    total: state.transactions.length,
  };
}

/** Wipe local data. Does not touch Dropbox — that is a separate, explicit act. */
export async function resetLocal() {
  state = emptyData();
  syncMeta = { rev: null, lastSyncAt: null, lastError: null, pending: false };
  await persistLocal();
  await persistMeta();
  emit('reset');
}

/** Test seam: install a ledger directly without touching storage. */
export function _setStateForTest(next) { state = migrate(next); loaded = true; }
