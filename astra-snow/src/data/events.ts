// Event-sourced shift state.
//
// Every operator action is an immutable event written to IndexedDB before the
// UI treats it as committed. State is a pure fold over the events, so:
//  - a reload, crash or OS kill loses nothing that was written;
//  - a duplicated write (double tap, retry) is idempotent by event id;
//  - undo is an event, so history is auditable and undo is itself undoable;
//  - the dispatcher's route is never mutated — a plan is an overlay event.

import type { LngLat } from '../core/geo.ts';

export type StreetState = 'plowed' | 'unplowed' | 'unsure';
export type BlockReason = 'vehicle' | 'obstacle' | 'other';

interface Base {
  id: string;
  /** ms epoch, device clock */
  t: number;
  shift: string;
}

export type ShiftEvent = Base &
  (
    | { type: 'shift-start'; route: string; routeSha: string }
    | { type: 'shift-end' }
    | { type: 'done'; stop: number; street: StreetState | null; roadId: number | null; pos: LngLat | null; acc: number | null }
    | { type: 'undo'; target: string }
    | { type: 'defer'; stop: number }
    | { type: 'blocked'; stop: number; reason: BlockReason }
    | { type: 'reopen'; stop: number }
    | { type: 'street'; roadId: number; state: StreetState; pos: LngLat | null }
    | { type: 'plan'; order: number[] | null; label: string }
    | { type: 'driveway'; stop: number; street: string }
    | { type: 'note'; stop: number; text: string }
    | { type: 'focus'; stop: number | null }
  );

export type EventInput = ShiftEvent extends infer E ? (E extends ShiftEvent ? Omit<E, 'id' | 't' | 'shift'> : never) : never;

export type StopStatus = 'pending' | 'done' | 'deferred' | 'blocked';

export interface StopState {
  status: StopStatus;
  at: number | null;
  eventId: string | null;
  street: StreetState | null;
  reason: BlockReason | null;
}

export interface ShiftState {
  shift: string | null;
  route: string | null;
  startedAt: number | null;
  endedAt: number | null;
  stops: Map<number, StopState>;
  /** current working order (seq numbers) */
  order: number[];
  planLabel: string | null;
  streetObs: Map<number, { roadId: number; state: StreetState; t: number }>;
  driverNotes: Map<number, string[]>;
  drivewayConfirm: Map<number, string>;
  /** undoable events, newest last */
  undoStack: string[];
  /** a stop chosen to work out of order; cleared when it is resolved */
  focus: number | null;
  doneCount: number;
  lastDoneAt: number | null;
  events: number;
}

export function emptyState(originalOrder: number[]): ShiftState {
  return {
    shift: null,
    route: null,
    startedAt: null,
    endedAt: null,
    stops: new Map(originalOrder.map((s) => [s, { status: 'pending', at: null, eventId: null, street: null, reason: null }])),
    order: originalOrder.slice(),
    planLabel: null,
    streetObs: new Map(),
    driverNotes: new Map(),
    drivewayConfirm: new Map(),
    undoStack: [],
    focus: null,
    doneCount: 0,
    lastDoneAt: null,
    events: 0,
  };
}


/** Fold events (any order, duplicates allowed) into state. */
export function reduce(originalOrder: number[], events: ShiftEvent[]): ShiftState {
  const seen = new Set<string>();
  const evs = events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Undo resolution: an undo cancels its target; undoing an undo restores it.
  const cancelled = new Set<string>();
  const byId = new Map(evs.map((e) => [e.id, e]));
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.type !== 'undo' || cancelled.has(e.id)) continue;
    const target = byId.get(e.target);
    if (target && target.t <= e.t) cancelled.add(target.id);
  }
  const s = emptyState(originalOrder);
  const valid = new Set(originalOrder);
  for (const e of evs) {
    s.events++;
    if (cancelled.has(e.id) || e.type === 'undo') continue;
    if (!s.shift) s.shift = e.shift;
    switch (e.type) {
      case 'shift-start':
        s.startedAt = s.startedAt ?? e.t;
        s.route = e.route;
        break;
      case 'shift-end':
        s.endedAt = e.t;
        break;
      case 'done':
      case 'defer':
      case 'blocked':
      case 'reopen': {
        if (!valid.has(e.stop)) break;
        const st = s.stops.get(e.stop)!;
        const status: StopStatus = e.type === 'done' ? 'done' : e.type === 'defer' ? 'deferred' : e.type === 'blocked' ? 'blocked' : 'pending';
        s.stops.set(e.stop, {
          status,
          at: e.t,
          eventId: e.id,
          street: e.type === 'done' ? e.street : st.street,
          reason: e.type === 'blocked' ? e.reason : null,
        });
        if (s.focus === e.stop && e.type !== 'reopen') s.focus = null;
        if (e.type === 'done') {
          s.lastDoneAt = e.t;
          if (e.street && e.roadId != null) s.streetObs.set(e.roadId, { roadId: e.roadId, state: e.street, t: e.t });
        }
        s.undoStack.push(e.id);
        break;
      }
      case 'street':
        s.streetObs.set(e.roadId, { roadId: e.roadId, state: e.state, t: e.t });
        s.undoStack.push(e.id);
        break;
      case 'plan':
        if (e.order === null) {
          s.order = originalOrder.slice();
          s.planLabel = null;
        } else if (isPermutationOf(e.order, originalOrder)) {
          s.order = e.order.slice();
          s.planLabel = e.label;
        }
        s.undoStack.push(e.id);
        break;
      case 'driveway':
        s.drivewayConfirm.set(e.stop, e.street);
        s.undoStack.push(e.id);
        break;
      case 'focus':
        s.focus = e.stop !== null && valid.has(e.stop) ? e.stop : null;
        s.undoStack.push(e.id);
        break;
      case 'note': {
        const list = s.driverNotes.get(e.stop) ?? [];
        list.push(e.text);
        s.driverNotes.set(e.stop, list);
        s.undoStack.push(e.id);
        break;
      }
    }
  }
  s.doneCount = [...s.stops.values()].filter((x) => x.status === 'done').length;
  return s;
}

export function isPermutationOf(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.slice().sort((x, y) => x - y);
  const sb = b.slice().sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/** The stop to work next: first pending in order, then the revisit queue. */
export function nextStop(s: ShiftState): number | null {
  if (s.focus !== null && s.stops.get(s.focus)?.status !== 'done') return s.focus;
  for (const seq of s.order) if (s.stops.get(seq)?.status === 'pending') return seq;
  for (const seq of s.order) {
    const st = s.stops.get(seq)?.status;
    if (st === 'deferred' || st === 'blocked') return seq;
  }
  return null;
}

/** Upcoming pending stops after the next one, in order. */
export function upcoming(s: ShiftState, count: number): number[] {
  const next = nextStop(s);
  const out: number[] = [];
  for (const seq of s.order) {
    if (seq === next || s.stops.get(seq)?.status !== 'pending') continue;
    out.push(seq);
    if (out.length >= count) break;
  }
  return out;
}

export function revisitQueue(s: ShiftState): number[] {
  return s.order.filter((seq) => {
    const st = s.stops.get(seq)?.status;
    return st === 'deferred' || st === 'blocked';
  });
}

/** Pending stops that sit BEFORE the last completed stop in the order: skipped by accident? */
export function skippedBehind(s: ShiftState): number[] {
  let lastDoneIdx = -1;
  s.order.forEach((seq, i) => {
    if (s.stops.get(seq)?.status === 'done') lastDoneIdx = i;
  });
  return s.order.slice(0, Math.max(0, lastDoneIdx)).filter((seq) => s.stops.get(seq)?.status === 'pending');
}

let counter = 0;
export function eventId(now: number): string {
  counter = (counter + 1) % 1_000_000;
  const rnd = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36) : Math.random().toString(36).slice(2);
  return `${now.toString(36)}-${counter.toString(36)}-${rnd}`;
}
