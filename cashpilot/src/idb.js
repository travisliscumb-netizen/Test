// Minimal promise wrapper over IndexedDB. No dependency, no build step.

import { IDB_NAME, IDB_VERSION, IDB_STORE_DATA, IDB_STORE_BLOBS } from './config.js';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_DATA)) db.createObjectStore(IDB_STORE_DATA);
      if (!db.objectStoreNames.contains(IDB_STORE_BLOBS)) db.createObjectStore(IDB_STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab.'));
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    try { result = fn(os); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  });
}

export const idbGet = (store, key) => tx(store, 'readonly', (os) => os.get(key));
export const idbSet = (store, key, value) => tx(store, 'readwrite', (os) => os.put(value, key));
export const idbDel = (store, key) => tx(store, 'readwrite', (os) => os.delete(key));
export const idbKeys = (store) => tx(store, 'readonly', (os) => os.getAllKeys());

export { IDB_STORE_DATA, IDB_STORE_BLOBS };
