/**
 * IndexedDB access.
 *
 * Deliberately thin. The only guarantees this layer makes are the ones that
 * matter for not losing a work day:
 *
 *   - every mutation is a single transaction across every store it touches,
 *     so a write is either wholly applied or wholly absent
 *   - a transaction that aborts surfaces as a rejected promise with the real
 *     reason, never as a silent no-op
 *   - opening the database recovers from a browser that evicted it, and says
 *     so, instead of throwing on first use somewhere deep in the UI
 *
 * Safari is the target. It is the platform that most aggressively discards
 * storage from sites the user has not visited in a while, and the one whose
 * IndexedDB has historically dropped connections when a tab is backgrounded,
 * so `withStore` reopens rather than caching a connection forever.
 */

export const DB_NAME = 'teds-route';
export const DB_VERSION = 1;

export const STORE = {
  properties: 'properties',
  days: 'days',
  events: 'events',
  meta: 'meta',
};

let dbPromise = null;

export class StorageError extends Error {
  constructor(message, cause, kind = 'storage') {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
    this.kind = kind;
  }
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError(
        'This browser has no local database available. In Safari this usually means Private Browsing is on.',
        null, 'unavailable'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new StorageError('Could not open local storage.', e, 'unavailable'));
      return;
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const from = ev.oldVersion;
      if (from < 1) {
        db.createObjectStore(STORE.properties, { keyPath: 'id' });
        const days = db.createObjectStore(STORE.days, { keyPath: 'date' });
        days.createIndex('byWeek', 'week');
        const events = db.createObjectStore(STORE.events, { keyPath: 'seq', autoIncrement: true });
        events.createIndex('byDate', 'date');
        events.createIndex('byProperty', 'propertyId');
        events.createIndex('byAt', 'at');
        db.createObjectStore(STORE.meta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(new StorageError(
      'The local database refused to open. Your data is still on the device; reloading usually clears this.',
      req.error, 'open-failed'));
    req.onblocked = () => reject(new StorageError(
      'Another tab of this app is holding the database open. Close the other tab and try again.',
      null, 'blocked'));
  });
  return dbPromise;
}

/**
 * Runs `fn` inside one transaction over `stores`.
 *
 * `fn` receives a `tx` helper with promise-returning get/put/delete. It must
 * not await anything outside the transaction: IndexedDB auto-commits a
 * transaction as soon as its microtask queue drains, so awaiting a fetch in
 * the middle silently commits half the work. Everything here stays synchronous
 * with respect to the event loop.
 */
export async function withStore(stores, mode, fn) {
  const db = await openDb();
  const names = Array.isArray(stores) ? stores : [stores];
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(names, mode);
    } catch (e) {
      reject(new StorageError('Could not start a storage transaction.', e, 'tx-failed'));
      return;
    }
    let result;
    let failed = null;
    const helper = {
      store: (name) => tx.objectStore(name),
      get: (name, key) => wrap(tx.objectStore(name).get(key)),
      getAll: (name, query, count) => wrap(tx.objectStore(name).getAll(query, count)),
      put: (name, value) => wrap(tx.objectStore(name).put(value)),
      add: (name, value) => wrap(tx.objectStore(name).add(value)),
      delete: (name, key) => wrap(tx.objectStore(name).delete(key)),
      clear: (name) => wrap(tx.objectStore(name).clear()),
      count: (name) => wrap(tx.objectStore(name).count()),
      index: (name, idx) => tx.objectStore(name).index(idx),
      abort: () => tx.abort(),
    };
    tx.oncomplete = () => (failed ? reject(failed) : resolve(result));
    tx.onerror = () => reject(new StorageError(txMessage(tx.error), tx.error, 'tx-error'));
    tx.onabort = () => reject(failed || new StorageError(txMessage(tx.error), tx.error, 'tx-abort'));

    try {
      const r = fn(helper);
      if (r && typeof r.then === 'function') {
        r.then((v) => { result = v; }, (e) => { failed = e; try { tx.abort(); } catch { /* already done */ } });
      } else {
        result = r;
      }
    } catch (e) {
      failed = e instanceof StorageError ? e : new StorageError(String(e && e.message || e), e, 'callback');
      try { tx.abort(); } catch { /* already done */ }
    }
  });
}

function txMessage(err) {
  const name = err && err.name;
  if (name === 'QuotaExceededError') {
    return 'The device is out of space for this app, so the change was not saved. Free up storage, then try again — nothing already saved has been lost.';
  }
  if (name === 'ConstraintError') return 'That record already exists.';
  return 'The change could not be saved to the device.';
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(txMessage(req.error), req.error, 'request'));
  });
}

/** Rough storage headroom, for the diagnostics panel. */
export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? null, quota: e.quota ?? null };
    }
  } catch { /* not available */ }
  return { usage: null, quota: null };
}

/**
 * Asks the browser to exempt this origin from routine storage eviction.
 * Safari grants this after the app is added to the Home Screen and used; the
 * request is harmless and idempotent when it is refused.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* not available */ }
  return false;
}

export function resetConnection() {
  dbPromise = null;
}
