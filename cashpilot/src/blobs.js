// Cashpilot — local blob storage for receipt and pay-stub images.
//
// Images live in IndexedDB rather than localStorage: localStorage is a ~5 MB
// string-only store and a handful of phone photos would blow through it.

import { idbGet, idbSet, idbDel, idbKeys, IDB_STORE_BLOBS } from './idb.js';

export const putBlob = (key, blob) => idbSet(IDB_STORE_BLOBS, key, blob);
export const getBlob = (key) => idbGet(IDB_STORE_BLOBS, key);
export const deleteBlob = (key) => idbDel(IDB_STORE_BLOBS, key);
export const listBlobKeys = () => idbKeys(IDB_STORE_BLOBS);

const urlCache = new Map();

/**
 * Object URL for a stored blob, cached so repeated renders of the same thumbnail
 * do not leak a new URL each time.
 */
export async function blobUrl(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const blob = await getBlob(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export function releaseBlobUrl(key) {
  const url = urlCache.get(key);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(key); }
}

export function releaseAllBlobUrls() {
  for (const [key] of urlCache) releaseBlobUrl(key);
}

/** Total bytes held locally, for the Settings storage readout. */
export async function localBlobBytes() {
  const keys = await listBlobKeys();
  let total = 0;
  for (const k of keys) {
    const b = await getBlob(k);
    if (b) total += b.size || 0;
  }
  return total;
}

/** Drop blobs no document references any more. */
export async function pruneOrphanBlobs(documents) {
  const referenced = new Set(documents.map((d) => d.blobKey).filter(Boolean));
  const keys = await listBlobKeys();
  let removed = 0;
  for (const k of keys) {
    if (!referenced.has(k)) { await deleteBlob(k); releaseBlobUrl(k); removed++; }
  }
  return removed;
}
