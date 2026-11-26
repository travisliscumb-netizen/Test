// IndexedDB persistence. No library: four stores, a handful of operations.
//
// If IndexedDB is unavailable (private browsing, blocked storage) the app runs
// on an in-memory store and the UI says so plainly — progress would be lost on
// reload, and pretending otherwise is the one unforgivable failure here.

import type { ShiftEvent } from './events.ts';

const DB_NAME = 'astra';
const VERSION = 1;

export interface ServiceRow {
  seg: number;
  t: number;
  seenAt: number;
}
export interface PingRow {
  vehicle: string;
  t: number;
  lng: number;
  lat: number;
}

export interface Store {
  readonly durable: boolean;
  getKV<T>(key: string): Promise<T | undefined>;
  setKV(key: string, value: unknown): Promise<void>;
  delKV(key: string): Promise<void>;
  addEvent(e: ShiftEvent): Promise<void>;
  events(shift?: string): Promise<ShiftEvent[]>;
  addService(rows: ServiceRow[]): Promise<number>;
  service(sinceMs?: number): Promise<ServiceRow[]>;
  addPings(rows: PingRow[]): Promise<number>;
  pings(sinceMs?: number): Promise<PingRow[]>;
  clearShiftData(): Promise<void>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
  });
}

export async function openStore(): Promise<Store> {
  if (typeof indexedDB === 'undefined') return new MemoryStore();
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' }).createIndex('shift', 'shift');
        if (!d.objectStoreNames.contains('service')) d.createObjectStore('service', { keyPath: ['seg', 't'] }).createIndex('t', 't');
        if (!d.objectStoreNames.contains('pings')) d.createObjectStore('pings', { keyPath: ['vehicle', 't'] }).createIndex('t', 't');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('database blocked by another tab'));
    });
    // Probe a write: Safari can open a database it then refuses to write.
    const s = new IdbStore(db);
    await s.setKV('probe', Date.now());
    return s;
  } catch {
    return new MemoryStore();
  }
}

class IdbStore implements Store {
  readonly durable = true;
  private db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async getKV<T>(key: string): Promise<T | undefined> {
    return req(this.db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>;
  }
  async setKV(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    await done(tx);
  }
  async delKV(key: string): Promise<void> {
    const tx = this.db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    await done(tx);
  }
  async addEvent(e: ShiftEvent): Promise<void> {
    const tx = this.db.transaction('events', 'readwrite');
    tx.objectStore('events').put(e);
    await done(tx);
  }
  async events(shift?: string): Promise<ShiftEvent[]> {
    const os = this.db.transaction('events').objectStore('events');
    return req(shift ? os.index('shift').getAll(shift) : os.getAll()) as Promise<ShiftEvent[]>;
  }
  async addService(rows: ServiceRow[]): Promise<number> {
    if (!rows.length) return 0;
    // Keyed by (seg, t): put is idempotent, and no await inside the
    // transaction (older Safari auto-commits across promise boundaries).
    const tx = this.db.transaction('service', 'readwrite');
    const os = tx.objectStore('service');
    for (const r of rows) os.put(r);
    await done(tx);
    return rows.length;
  }
  async service(sinceMs = 0): Promise<ServiceRow[]> {
    return req(this.db.transaction('service').objectStore('service').index('t').getAll(IDBKeyRange.lowerBound(sinceMs))) as Promise<ServiceRow[]>;
  }
  async addPings(rows: PingRow[]): Promise<number> {
    if (!rows.length) return 0;
    const tx = this.db.transaction('pings', 'readwrite');
    const os = tx.objectStore('pings');
    for (const r of rows) os.put(r);
    await done(tx);
    return rows.length;
  }
  async pings(sinceMs = 0): Promise<PingRow[]> {
    return req(this.db.transaction('pings').objectStore('pings').index('t').getAll(IDBKeyRange.lowerBound(sinceMs))) as Promise<PingRow[]>;
  }
  async clearShiftData(): Promise<void> {
    const tx = this.db.transaction('events', 'readwrite');
    tx.objectStore('events').clear();
    await done(tx);
  }
}

export class MemoryStore implements Store {
  readonly durable = false;
  private kv = new Map<string, unknown>();
  private ev = new Map<string, ShiftEvent>();
  private svc = new Map<string, ServiceRow>();
  private pg = new Map<string, PingRow>();
  async getKV<T>(key: string) {
    return this.kv.get(key) as T | undefined;
  }
  async setKV(key: string, value: unknown) {
    this.kv.set(key, structuredClone(value));
  }
  async delKV(key: string) {
    this.kv.delete(key);
  }
  async addEvent(e: ShiftEvent) {
    this.ev.set(e.id, structuredClone(e));
  }
  async events(shift?: string) {
    return [...this.ev.values()].filter((e) => !shift || e.shift === shift);
  }
  async addService(rows: ServiceRow[]) {
    let n = 0;
    for (const r of rows) {
      const k = `${r.seg}:${r.t}`;
      if (!this.svc.has(k)) {
        this.svc.set(k, r);
        n++;
      }
    }
    return n;
  }
  async service(sinceMs = 0) {
    return [...this.svc.values()].filter((r) => r.t >= sinceMs);
  }
  async addPings(rows: PingRow[]) {
    for (const r of rows) this.pg.set(`${r.vehicle}:${r.t}`, r);
    return rows.length;
  }
  async pings(sinceMs = 0) {
    return [...this.pg.values()].filter((r) => r.t >= sinceMs);
  }
  async clearShiftData() {
    this.ev.clear();
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
