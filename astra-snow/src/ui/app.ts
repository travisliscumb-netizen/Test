// Application controller: owns state, timers and side effects. UI modules
// read from it and call its actions; nothing else mutates state.

import type { RoadsDoc, RouteDoc, SealedDoc, Stop } from '../data/schema.ts';
import { unseal, isKeyString, UnsealError, sha256Hex, unwrapKeyWithPin } from '../core/crypto.ts';
import { openStore, requestPersistence, type Store, type PingRow } from '../data/db.ts';
import { reduce, nextStop, upcoming, revisitQueue, skippedBehind, eventId, type ShiftEvent, type ShiftState, type EventInput, type StreetState, type BlockReason } from '../data/events.ts';
import { GpsFilter, type Track } from '../core/kalman.ts';
import { buildGraph, locate, distanceMatrix, path, treeFrom, areaAround, type Graph, type Located } from '../core/graph.ts';
import { dist, type LngLat } from '../core/geo.ts';
import { Copilot, type Cue, type CopilotView } from '../copilot/copilot.ts';
import { Feedback, speakable } from '../copilot/feedback.ts';
import { fetchServiceStatus, fetchVehicles, diffService, freshness, CityFeedError, type Freshness } from '../intel/city.ts';
import { segmentIntel, currentOperation, segmentOperations, plowingOps, windrowRisk, reworkPenalty, type SegmentIntel, type ServiceEvent, type WindrowRisk } from '../intel/model.ts';
import { radarAt, stationNow, type RadarSample, type StationObs } from '../intel/weather.ts';
import { priorServiceMin, deriveSamples, learnedServiceMin, paceFactor, forecast, DEFAULT_ETA, MEAN_FACTOR, type Forecast } from '../routing/eta.ts';
import { evaluate, optimizeBlocks, blocksOf, type Schedule } from '../routing/optimize.ts';

export type Screen = 'boot' | 'unlock' | 'preflight' | 'drive' | 'park' | 'debrief' | 'fatal';

export interface CityState {
  serviced: Map<number, number> | null;
  checkedAt: number | null;
  newest: number | null;
  error: string | null;
  vehicles: PingRow[];
  vehiclesAt: number | null;
  vehicleError: string | null;
  history: ServiceEvent[];
}

export interface PlanResult {
  computedAt: number;
  base: Schedule;
  plan: Schedule;
  moved: number;
  basis: 'historical' | 'prior' | 'none';
  opActive: boolean;
  label: string;
}

type Listener = () => void;

const SEALED_URL = '/data/route.sealed.json';
const ROADS_URL = '/data/roads.json';
const KEY_KV = 'route-key';
export const DONE_DEBOUNCE_MS = 700;

export class App {
  screen: Screen = 'boot';
  fatal: string | null = null;
  unlockError: string | null = null;

  store!: Store;
  persisted: boolean | null = null;
  route!: RouteDoc;
  routeSha = '';
  roads!: RoadsDoc;
  segById = new Map<number, RoadsDoc['segments'][number]>();
  stops = new Map<number, Stop>();
  original: number[] = [];
  private index = new Map<number, number>(); // seq -> matrix index

  graph!: Graph;
  locs: Located[] = [];
  matrix!: Float64Array;

  events: ShiftEvent[] = [];
  state!: ShiftState;
  shiftId: string | null = null;
  saveError: string | null = null;

  gps = new GpsFilter();
  track: Track | null = null;
  gpsError: string | null = null;
  gpsPermission: 'unknown' | 'granted' | 'denied' = 'unknown';
  private watchId: number | null = null;
  odometer = 0;
  private lastOdo: LngLat | null = null;

  copilot = new Copilot();
  private zones = new Map<number, LngLat[][]>();
  view: CopilotView = { phase: 'far', distance: null, gpsUsable: false, dwell: 0 };
  fb = new Feedback();

  city: CityState = { serviced: null, checkedAt: null, newest: null, error: null, vehicles: [], vehiclesAt: null, vehicleError: null, history: [] };
  radar: RadarSample | null = null;
  /** radar snow-rate samples this app has taken (for "is this a snow event?") */
  radarLog: { t: number; cm: number }[] = [];
  radarError: string | null = null;
  station: StationObs | null = null;

  /** chip state for the next stop's street */
  streetChip: StreetState | null = null;
  lastUndo: { id: string; label: string; until: number } | null = null;
  toast: { text: string; tone: 'ok' | 'warn' | 'bad'; until: number } | null = null;
  prompt: { kind: 'leaving' | 'revisit'; seq: number; until: number } | null = null;

  learned = new Map<number, { mean: number; median: number; n: number }>();
  metresPerMin = DEFAULT_ETA.metresPerMin;
  plan: PlanResult | null = null;
  planBusy = false;

  dim = 1;
  nightVision = false;
  imagery = false;
  radarLayer = false;
  wakeLock: WakeLockSentinel | null = null;

  private listeners = new Set<Listener>();
  private timers: number[] = [];
  private prevSnapshot: Map<number, number> | null = null;

  // ------------------------------------------------------------- plumbing
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    for (const fn of this.listeners) fn();
  }

  stop(seq: number): Stop {
    const s = this.stops.get(seq);
    if (!s) throw new Error(`no stop ${seq}`);
    return s;
  }

  // ----------------------------------------------------------------- boot
  async boot(): Promise<void> {
    try {
      this.store = await openStore();
      this.persisted = await requestPersistence();
      const prefs = await this.store.getKV<{ dim?: number; nv?: boolean; voice?: boolean; sound?: boolean; imagery?: boolean }>('prefs');
      if (prefs) {
        this.dim = prefs.dim ?? 1;
        this.nightVision = !!prefs.nv;
        this.fb.voiceOn = prefs.voice ?? true;
        this.fb.soundOn = prefs.sound ?? true;
        this.imagery = !!prefs.imagery;
      }
      const fromHash = new URLSearchParams(location.hash.slice(1)).get('k');
      if (fromHash) history.replaceState(null, '', location.pathname + location.search);
      const key = fromHash ?? (await this.store.getKV<string>(KEY_KV)) ?? null;
      if (!key) {
        this.go('unlock');
        return;
      }
      await this.openRoute(key, !!fromHash);
    } catch (e) {
      this.fatal = (e as Error).message;
      this.go('fatal');
    }
  }

  unlocking = false;

  /** PIN unlock: derive the route key from the PIN, then open as usual. */
  async unlockWithPin(pin: string): Promise<boolean> {
    if (this.unlocking) return false;
    this.unlocking = true;
    this.unlockError = null;
    this.emit();
    try {
      const res = await fetch(SEALED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`route file unavailable (${res.status})`);
      const sealed: SealedDoc = await res.json();
      if (!sealed.pin) {
        this.unlockError = 'This route has no PIN set up. Use the unlock link.';
        return false;
      }
      const key = await unwrapKeyWithPin(sealed.pin, pin);
      await this.openRoute(key, true);
      return this.screen !== 'unlock';
    } catch (e) {
      this.unlockError = e instanceof UnsealError ? e.message : `Could not load the route file: ${(e as Error).message}`;
      this.fb.tone('alert');
      return false;
    } finally {
      this.unlocking = false;
      if (this.screen === 'unlock') this.go('unlock');
    }
  }

  async openRoute(key: string, remember: boolean): Promise<void> {
    this.unlockError = null;
    if (!isKeyString(key)) {
      this.unlockError = 'That is not an ASTRA route key.';
      this.go('unlock');
      return;
    }
    let sealed: SealedDoc;
    try {
      const res = await fetch(SEALED_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`route file unavailable (${res.status})`);
      sealed = await res.json();
    } catch (e) {
      this.unlockError = `Could not load the route file: ${(e as Error).message}`;
      this.go('unlock');
      return;
    }
    let text: string;
    try {
      text = await unseal(sealed, key);
    } catch (e) {
      this.unlockError = e instanceof UnsealError ? e.message : 'Could not open the route';
      this.go('unlock');
      return;
    }
    const doc = JSON.parse(text) as RouteDoc;
    this.validateRoute(doc);
    if (remember) await this.store.setKV(KEY_KV, key);
    this.route = doc;
    this.routeSha = sealed.sha256;
    for (const s of doc.stops) {
      this.stops.set(s.seq, s);
      this.zones.set(s.seq, [s.parcel, ...s.driveways.map((d) => d.polygon)].filter((r): r is LngLat[] => !!r && r.length >= 3));
    }
    this.original = doc.stops.map((s) => s.seq);
    this.original.forEach((seq, i) => this.index.set(seq, i));

    const roadsRes = await fetch(ROADS_URL);
    if (!roadsRes.ok) throw new Error('road network unavailable');
    this.roads = await roadsRes.json();
    for (const seg of this.roads.segments) this.segById.set(seg.id, seg);
    const area = areaAround(doc.stops.map((s) => s.stopPoint), 1500);
    this.graph = buildGraph(this.roads.segments, area);
    this.locs = doc.stops.map((s) => locate(this.graph, s.stopPoint, s.approachRoadId) ?? locate(this.graph, s.stopPoint)!);
    this.matrix = distanceMatrix(this.graph, this.locs);

    await this.loadHistory();
    this.radarLog = (await this.store.getKV<{ t: number; cm: number }[]>('radar-log')) ?? [];
    this.prevSnapshot = new Map((await this.store.getKV<[number, number][]>('city-snapshot')) ?? []);
    if (this.prevSnapshot.size) {
      this.city.serviced = this.prevSnapshot;
      this.city.checkedAt = (await this.store.getKV<number>('city-checked')) ?? null;
    }
    await this.loadShift();
    this.startTimers();
    this.go(this.shiftId && !this.state.endedAt ? 'drive' : 'preflight');
  }

  /** The dispatcher's list must arrive whole and unaltered. */
  private validateRoute(doc: RouteDoc): void {
    if (doc.schema !== 'astra.route/1') throw new Error('Unknown route format');
    const n = doc.stops.length;
    if (n !== doc.source.rows) throw new Error(`Route has ${n} stops but its source had ${doc.source.rows}`);
    const seqs = new Set(doc.stops.map((s) => s.seq));
    if (seqs.size !== n) throw new Error('Route has duplicate stop numbers');
    doc.stops.forEach((s, i) => {
      if (s.seq !== i + 1) throw new Error(`Stop order broken at position ${i + 1}`);
      if (!s.raw || !s.raw.includes(s.number)) throw new Error(`Stop ${s.seq} lost its original text`);
      if (s.note && !s.raw.replace(/\s+/g, ' ').includes(s.note)) throw new Error(`Stop ${s.seq} note does not match its original text`);
    });
  }

  private async loadHistory(): Promise<void> {
    const since = Date.now() - 45 * 86_400_000;
    this.city.history = (await this.store.service(since)).map((r) => ({ seg: r.seg, t: r.t }));
    this.city.vehicles = await this.store.pings(Date.now() - 3 * 3600_000);
    // Learn service times from every recorded shift.
    const all = await this.store.events();
    const byShift = new Map<string, ShiftEvent[]>();
    for (const e of all) {
      const l = byShift.get(e.shift);
      if (l) l.push(e);
      else byShift.set(e.shift, [e]);
    }
    const samples = new Map<number, number[]>();
    for (const evs of byShift.values()) {
      const st = reduce(this.original, evs);
      const done = [...st.stops.entries()]
        .filter(([, v]) => v.status === 'done' && v.at)
        .map(([stop, v]) => ({ stop, t: v.at! }))
        .sort((a, b) => a.t - b.t);
      for (const s of deriveSamples(done, (a, b) => this.legMetres(a, b), this.metresPerMin)) {
        const l = samples.get(s.stop) ?? [];
        l.push(s.minutes);
        samples.set(s.stop, l);
      }
    }
    for (const seq of this.original) {
      this.learned.set(seq, learnedServiceMin(priorServiceMin(this.stop(seq).flags), samples.get(seq) ?? [], DEFAULT_ETA.priorWeight));
    }
  }

  private async loadShift(): Promise<void> {
    const current = await this.store.getKV<string>('shift');
    this.shiftId = current ?? null;
    this.events = current ? await this.store.events(current) : [];
    this.state = reduce(this.original, this.events);
    this.odometer = (await this.store.getKV<number>('odometer')) ?? 0;
    this.syncChip();
  }

  go(s: Screen): void {
    this.screen = s;
    this.emit();
  }

  // -------------------------------------------------------------- actions
  /**
   * Record an event. The screen updates at once (a tap must feel instant);
   * the IndexedDB write runs concurrently and, if it fails, the event is
   * rolled back and the failure shown loudly. A crash inside that window
   * loses one tap, which then reappears as pending — never a false "done".
   */
  private async commit(input: EventInput): Promise<ShiftEvent | null> {
    if (!this.shiftId) return null;
    const now = Date.now();
    const e = { ...input, id: eventId(now), t: now, shift: this.shiftId } as ShiftEvent;
    this.events.push(e);
    this.apply();
    try {
      await this.store.addEvent(e);
      if (this.saveError) {
        this.saveError = null;
        this.emit();
      }
      return e;
    } catch (err) {
      this.events = this.events.filter((x) => x.id !== e.id);
      this.apply();
      this.saveError = `NOT SAVED — tap again. (${(err as Error).message})`;
      this.fb.tone('alert');
      this.emit();
      return null;
    }
  }

  private apply(): void {
    this.state = reduce(this.original, this.events);
    this.plan = this.plan && Date.now() - this.plan.computedAt < 60_000 ? this.plan : null;
    this.syncChip();
    this.refreshCopilot();
    this.emit();
  }

  async beginShift(): Promise<void> {
    this.fb.unlock();
    const id = `S-${new Date().toISOString().slice(0, 16)}-${Math.random().toString(36).slice(2, 6)}`;
    this.shiftId = id;
    this.events = [];
    await this.store.setKV('shift', id);
    this.odometer = 0;
    await this.store.setKV('odometer', 0);
    await this.commit({ type: 'shift-start', route: this.route.id, routeSha: this.routeSha });
    this.fb.tone('start');
    this.fb.say(`Shift started. ${this.original.length} driveways. First, ${speakable(this.stop(nextStop(this.state)!).address)}.`, 2);
    this.startGps();
    await this.requestWake();
    this.go('drive');
  }

  async resumeShift(): Promise<void> {
    this.fb.unlock();
    this.startGps();
    await this.requestWake();
    this.go('drive');
  }

  async endShift(): Promise<void> {
    await this.commit({ type: 'shift-end' });
    await this.store.delKV('shift');
    this.go('debrief');
  }

  async newShiftFromDebrief(): Promise<void> {
    this.shiftId = null;
    this.events = [];
    this.state = reduce(this.original, []);
    await this.loadHistory();
    this.go('preflight');
  }

  /** The big button. */
  private lastDoneTap = 0;

  async done(): Promise<void> {
    const seq = nextStop(this.state);
    if (seq === null) return;
    // A gloved double-bounce must not clear two driveways.
    const now = Date.now();
    if (now - this.lastDoneTap < DONE_DEBOUNCE_MS) return;
    this.lastDoneTap = now;
    this.fb.unlock();
    this.fb.haptic('success');
    const s = this.stop(seq);
    const roadId = s.approachRoadId;
    const pending = this.commit({
      type: 'done',
      stop: seq,
      street: this.streetChip,
      roadId,
      pos: this.track?.position ?? null,
      acc: this.track ? Math.round(this.track.accuracy) : null,
    });
    this.fb.tone('done');
    this.lastUndo = { id: this.events[this.events.length - 1].id, label: `#${seq} ${s.address} done`, until: Date.now() + 7000 };
    const e = await pending;
    if (!e) {
      this.lastUndo = null;
      return;
    }
    const nxt = nextStop(this.state);
    if (nxt === null) {
      this.fb.tone('complete');
      this.fb.say('Last driveway done. Route complete.', 3);
    } else {
      const n = this.stop(nxt);
      const note = n.note ? ` Note: ${speakable(n.note)}` : '';
      this.fb.say(`Next, ${speakable(n.address)}.${note}`, 2);
    }
    this.emit();
  }

  async undo(): Promise<void> {
    const target = this.state.undoStack[this.state.undoStack.length - 1];
    if (!target) return;
    this.fb.unlock();
    this.fb.haptic('warn');
    await this.commit({ type: 'undo', target });
    this.fb.tone('undo');
    this.lastUndo = null;
    this.flash('Undone', 'warn');
  }

  async defer(seq: number): Promise<void> {
    this.fb.haptic();
    await this.commit({ type: 'defer', stop: seq });
    this.flash(`#${seq} moved to the return list`, 'warn');
  }

  async blocked(seq: number, reason: BlockReason): Promise<void> {
    this.fb.haptic('warn');
    await this.commit({ type: 'blocked', stop: seq, reason });
    this.flash(`#${seq} blocked — on the return list`, 'bad');
  }

  async focus(seq: number | null): Promise<void> {
    this.fb.haptic();
    await this.commit({ type: 'focus', stop: seq });
  }

  async reopen(seq: number): Promise<void> {
    await this.commit({ type: 'reopen', stop: seq });
  }

  async setStreet(state: StreetState | null): Promise<void> {
    this.fb.unlock();
    this.fb.haptic();
    this.streetChip = state;
    const seq = nextStop(this.state);
    const roadId = seq !== null ? this.stop(seq).approachRoadId : null;
    if (state && roadId !== null) await this.commit({ type: 'street', roadId, state, pos: this.track?.position ?? null });
    else this.emit();
  }

  async confirmDriveway(seq: number, street: string): Promise<void> {
    await this.commit({ type: 'driveway', stop: seq, street });
    this.flash(`Driveway street saved for #${seq}`, 'ok');
  }

  async addNote(seq: number, text: string): Promise<void> {
    if (!text.trim()) return;
    await this.commit({ type: 'note', stop: seq, text: text.trim() });
  }

  async applyPlan(order: number[] | null, label: string): Promise<void> {
    await this.commit({ type: 'plan', order, label });
    this.flash(order ? `Plan applied: ${label}` : "Back to Ted's order", 'ok');
  }

  flash(text: string, tone: 'ok' | 'warn' | 'bad' = 'ok', ms = 3500): void {
    this.toast = { text, tone, until: Date.now() + ms };
    this.emit();
  }

  async savePrefs(): Promise<void> {
    await this.store.setKV('prefs', { dim: this.dim, nv: this.nightVision, voice: this.fb.voiceOn, sound: this.fb.soundOn, imagery: this.imagery });
    this.emit();
  }

  private syncChip(): void {
    const seq = this.state ? nextStop(this.state) : null;
    if (seq === null) {
      this.streetChip = null;
      return;
    }
    const road = this.stop(seq).approachRoadId;
    const obs = road !== null ? this.state.streetObs.get(road) : undefined;
    this.streetChip = obs?.state ?? null;
  }

  // ------------------------------------------------------------------ GPS
  startGps(): void {
    if (this.watchId !== null || !('geolocation' in navigator)) {
      if (!('geolocation' in navigator)) this.gpsError = 'This browser has no GPS access';
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.gpsPermission = 'granted';
        this.gpsError = null;
        this.onFix({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy, t: p.timestamp || Date.now(), speed: p.coords.speed, heading: p.coords.heading });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.gpsPermission = 'denied';
          this.gpsError = 'Location permission denied — proximity features are off. Allow it in Settings › Safari › Location.';
        } else this.gpsError = err.code === err.TIMEOUT ? 'Waiting for a GPS fix…' : 'GPS unavailable';
        this.emit();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  }

  onFix(fix: { lng: number; lat: number; accuracy: number; t: number; speed?: number | null; heading?: number | null }): void {
    this.track = this.gps.update(fix);
    if (this.track.accepted && this.track.accuracy <= 25) {
      if (this.lastOdo) {
        const d = dist(this.lastOdo, this.track.position);
        if (d >= 4 && d < 300) {
          this.odometer += d;
          this.lastOdo = this.track.position;
        }
      } else this.lastOdo = this.track.position;
    }
    this.refreshCopilot();
    this.emit();
  }

  private refreshCopilot(): void {
    if (!this.state || !this.stops.size) return;
    const seq = nextStop(this.state);
    const cs = (q: number) => ({ seq: q, stopPoint: this.stop(q).stopPoint, target: this.stop(q).target, zone: this.zones.get(q) });
    const active = seq !== null ? cs(seq) : null;
    const rv = revisitQueue(this.state).map(cs);
    const nxt = upcoming(this.state, 1)[0];
    const { view, cues } = this.copilot.update(this.track, active, rv, Date.now(), nxt !== undefined ? cs(nxt) : null);
    this.view = view;
    for (const c of cues) this.onCue(c);
  }

  private onCue(c: Cue): void {
    if (this.screen !== 'drive' && this.screen !== 'park') return;
    switch (c.kind) {
      case 'approach': {
        const s = this.stop(c.seq);
        this.fb.tone('approach');
        const hz = s.note ? ` ${speakable(s.note)}` : '';
        this.fb.say(`Approaching ${speakable(s.address)}.${hz}`, 1);
        break;
      }
      case 'arrived':
        break;
      case 'leaving-undone':
        this.prompt = { kind: 'leaving', seq: c.seq, until: Date.now() + 45_000 };
        this.fb.tone('alert');
        this.fb.say(c.reason === 'at-next' ? `${speakable(this.stop(c.seq).address)} is not marked done. Mark it done?` : `Leaving ${speakable(this.stop(c.seq).address)}. Mark it done?`, 2);
        break;
      case 'revisit-nearby':
        this.prompt = { kind: 'revisit', seq: c.seq, until: Date.now() + 45_000 };
        this.fb.tone('approach');
        this.fb.say(`You're at ${speakable(this.stop(c.seq).address)}, on the return list. Retry it?`, 1);
        break;
      case 'gps-poor':
        this.flash(`GPS weak (±${c.accuracy} m) — proximity paused`, 'warn', 5000);
        break;
      case 'gps-ok':
        break;
    }
  }

  // ------------------------------------------------------------ wake lock
  async requestWake(): Promise<void> {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          this.emit();
        });
      }
    } catch {
      this.wakeLock = null;
    }
    this.emit();
  }

  // ---------------------------------------------------------------- feeds
  private startTimers(): void {
    const every = (ms: number, fn: () => void) => {
      fn();
      this.timers.push(window.setInterval(fn, ms));
    };
    every(75_000, () => void this.pollCity());
    every(6 * 60_000, () => void this.pollRadar());
    every(15 * 60_000, () => void this.pollStation());
    every(1000, () => this.tick());
    every(60_000, () => void this.store.setKV('odometer', this.odometer));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.pollCity();
        if (this.screen === 'drive' || this.screen === 'park') void this.requestWake();
      }
    });
    window.addEventListener('online', () => void this.pollCity());
  }

  private tick(): void {
    const now = Date.now();
    if (this.toast && now > this.toast.until) this.toast = null;
    if (this.lastUndo && now > this.lastUndo.until) this.lastUndo = null;
    if (this.prompt && (now > this.prompt.until || this.state.stops.get(this.prompt.seq)?.status === 'done')) this.prompt = null;
    this.emit();
  }

  private cityPoll: Promise<void> | null = null;

  /** One poll at a time: overlapping polls could land out of order. */
  pollCity(): Promise<void> {
    if (document.visibilityState === 'hidden') return Promise.resolve();
    if (!this.cityPoll) this.cityPoll = this.doPollCity().finally(() => (this.cityPoll = null));
    return this.cityPoll;
  }

  private async doPollCity(): Promise<void> {
    try {
      const snap = await fetchServiceStatus();
      const fresh = diffService(this.prevSnapshot, snap.serviced);
      if (fresh.length) {
        await this.store.addService(fresh.map((f) => ({ ...f, seenAt: snap.checkedAt })));
        this.city.history.push(...fresh);
      }
      this.prevSnapshot = snap.serviced;
      this.city.serviced = snap.serviced;
      this.city.checkedAt = snap.checkedAt;
      this.city.newest = snap.newest;
      this.city.error = null;
      await this.store.setKV('city-snapshot', [...snap.serviced.entries()]);
      await this.store.setKV('city-checked', snap.checkedAt);
    } catch (e) {
      this.city.error = e instanceof CityFeedError ? e.detail.message : (e as Error).message;
    }
    try {
      const v = await fetchVehicles();
      if (v.pings.length) await this.store.addPings(v.pings);
      this.city.vehicles = await this.store.pings(Date.now() - 3 * 3600_000);
      this.city.vehiclesAt = v.checkedAt;
      this.city.vehicleError = null;
    } catch (e) {
      this.city.vehicleError = e instanceof CityFeedError ? e.detail.message : (e as Error).message;
    }
    this.emit();
  }

  async pollRadar(): Promise<void> {
    if (document.visibilityState === 'hidden') return;
    const at = this.track?.position ?? this.stop(this.original[0]).target;
    try {
      // ECCC GeoMet intermittently fails a request outright; one retry.
      this.radar = await radarAt(at[0], at[1]).catch(async () => {
        await new Promise((r) => setTimeout(r, 4000));
        return radarAt(at[0], at[1]);
      });
      this.radarError = null;
      this.radarLog.push({ t: this.radar.scanAt, cm: this.radar.cmPerHour });
      this.radarLog = this.radarLog.filter((r) => Date.now() - r.t < 48 * 3600_000);
      await this.store.setKV('radar-log', this.radarLog);
    } catch (e) {
      this.radarError = (e as Error).message;
    }
    this.emit();
  }

  async pollStation(): Promise<void> {
    if (document.visibilityState === 'hidden') return;
    this.station = await stationNow();
    this.emit();
  }

  // ------------------------------------------------------------- derived
  legMetres(a: number, b: number): number {
    const i = this.index.get(a);
    const j = this.index.get(b);
    if (i === undefined || j === undefined) return 0;
    return this.matrix[i * this.original.length + j];
  }

  cityFreshness(now = Date.now()): Freshness {
    return freshness(this.city.checkedAt, now);
  }

  private opMemo: { key: string; value: { start: number; latest: number } | null } | null = null;
  operation(now = Date.now()): { start: number; latest: number } | null {
    const key = `${this.city.history.length}|${Math.floor(now / 60_000)}`;
    if (this.opMemo?.key !== key) this.opMemo = { key, value: currentOperation(this.city.history, now) };
    return this.opMemo.value;
  }

  /**
   * Evidence that the current City operation is a snow event (so plowing is
   * possible), not salting on a dry or icy day: radar snow seen since the
   * operation began (or in the 6 h before it). Without radar samples: unknown.
   */
  snowEvidence(now = Date.now()): 'snow' | 'no-snow' | 'unknown' {
    const op = this.operation(now);
    const from = (op?.start ?? now) - 6 * 3600_000;
    const xs = this.radarLog.filter((r) => r.t >= from);
    if (!xs.length) return 'unknown';
    return xs.some((r) => r.cm > 0) ? 'snow' : 'no-snow';
  }

  /** Intel for every road segment that serves a stop. */
  private intelMemo: { key: string; value: Map<number, SegmentIntel> } | null = null;
  routeIntel(now = Date.now()): Map<number, SegmentIntel> {
    const key = `${this.city.history.length}|${this.city.checkedAt}|${this.state.events}|${Math.floor(now / 60_000)}`;
    if (this.intelMemo?.key === key) return this.intelMemo.value;
    const value = this.computeIntel(now);
    this.intelMemo = { key, value };
    return value;
  }

  private computeIntel(now: number): Map<number, SegmentIntel> {
    const op = this.operation(now);
    const history = plowingOps(segmentOperations(this.city.history).filter((o) => !op || o.start !== op.start), this.routeSegments());
    const plowClass = (seg: number) => this.segById.get(seg)?.plowClass ?? null;
    const out = new Map<number, SegmentIntel>();
    for (const seg of this.routeSegments()) {
      const last = this.city.serviced?.get(seg) ?? null;
      const obs = this.state.streetObs.get(seg) ?? null;
      out.set(seg, segmentIntel(seg, last, obs, { now, opStart: op?.start ?? null, plowClass, history }));
    }
    return out;
  }

  routeSegments(): number[] {
    return [...new Set(this.route.stops.map((s) => s.approachRoadId).filter((x): x is number => x !== null))];
  }

  /** Expected minutes at a stop (mean, for forecasting and planning). */
  serviceMin(seq: number): number {
    return this.learned.get(seq)?.mean ?? priorServiceMin(this.stop(seq).flags) * MEAN_FACTOR;
  }

  /** Stops still to do in working order: pending, then the return list. */
  remaining(): number[] {
    const n = nextStop(this.state);
    const pend = this.state.order.filter((s) => this.state.stops.get(s)?.status === 'pending' && s !== n);
    const rv = revisitQueue(this.state).filter((s) => s !== n);
    return n === null ? [] : [n, ...pend, ...rv];
  }

  forecast(now = Date.now()): Forecast | null {
    const rem = this.remaining();
    if (!rem.length) return null;
    const first = this.track ? this.metresFromHere(rem[0]) : this.state.lastDoneAt ? 0 : 0;
    const legs = rem.map((s, i) => (i === 0 ? first : this.legMetres(rem[i - 1], s)));
    // Tonight's pace: completed stops, predicted vs actual minutes.
    const done = [...this.state.stops.entries()]
      .filter(([, v]) => v.status === 'done' && v.at)
      .map(([stop, v]) => ({ stop, t: v.at! }))
      .sort((a, b) => a.t - b.t);
    const completed: { predicted: number; actual: number }[] = [];
    for (let i = 1; i < done.length; i++) {
      const actual = (done[i].t - done[i - 1].t) / 60_000;
      if (actual > 25) continue;
      completed.push({ predicted: this.legMetres(done[i - 1].stop, done[i].stop) / this.metresPerMin + this.serviceMin(done[i].stop), actual });
    }
    const learnedShare = rem.filter((s) => (this.learned.get(s)?.n ?? 0) > 0).length / rem.length;
    return forecast(now, rem.map((s) => this.serviceMin(s)), legs, this.metresPerMin, paceFactor({ completed }), learnedShare);
  }

  metresFromHere(seq: number): number {
    if (!this.track) return 0;
    const here = locate(this.graph, this.track.position);
    if (!here || here.offset > 80) return dist(this.track.position, this.stop(seq).stopPoint) * 1.3;
    const tree = treeFrom(this.graph, here);
    const to = this.locs[this.index.get(seq)!];
    const e = this.graph.edges[to.edge];
    let d = Math.min(tree.dist[e.a] + to.along, tree.dist[e.b] + (e.len - to.along));
    if (here.edge === to.edge) d = Math.min(d, Math.abs(here.along - to.along));
    return d + here.offset;
  }

  /** Path through the next few stops, from the tractor when it has a fix. */
  spine(count = 6): LngLat[] {
    const seqs = this.remaining().slice(0, count);
    if (!seqs.length) return [];
    const out: LngLat[] = [];
    let from: Located | null = null;
    if (this.track && this.view.gpsUsable) {
      const here = locate(this.graph, this.track.position);
      if (here && here.offset < 60) from = here;
    }
    for (const s of seqs) {
      const to = this.locs[this.index.get(s)!];
      if (from) {
        const p = path(this.graph, from, to);
        out.push(...(out.length ? p.coords.slice(1) : p.coords));
      } else out.push(to.point);
      from = to;
    }
    return out;
  }

  windrows(now = Date.now()): WindrowRisk[] {
    if (!this.city.serviced) return [];
    const out: WindrowRisk[] = [];
    const doneEvents = new Map<number, ShiftEvent>();
    for (const e of this.events) if (e.type === 'done') doneEvents.set(e.stop, e);
    for (const [seq, st] of this.state.stops) {
      if (st.status !== 'done' || !st.at) continue;
      const s = this.stop(seq);
      const seg = s.approachRoadId;
      if (seg === null) continue;
      const svc = this.city.serviced.get(seg) ?? null;
      const cls = this.segById.get(seg)?.plowClass ?? null;
      const r = windrowRisk(seq, seg, st.at, svc, st.street, cls);
      if (r && r.level !== 'unlikely' && now - r.servicedAt < 18 * 3600_000) out.push(r);
    }
    return out.sort((a, b) => a.stop - b.stop);
  }

  skipped(): number[] {
    return skippedBehind(this.state);
  }
  upcoming(n: number): number[] {
    return upcoming(this.state, n);
  }
  revisit(): number[] {
    return revisitQueue(this.state);
  }

  /**
   * Compare the current order with a street-block re-sequencing that weighs
   * travel and expected windrow rework. Advisory only.
   */
  async computePlan(): Promise<void> {
    this.planBusy = true;
    this.emit();
    await new Promise((r) => setTimeout(r, 30));
    const now = Date.now();
    const rem = this.state.order.filter((s) => this.state.stops.get(s)?.status === 'pending');
    if (rem.length < 3) {
      this.plan = null;
      this.planBusy = false;
      this.emit();
      return;
    }
    const n = this.original.length;
    const idx = rem.map((s) => this.index.get(s)!);
    const fromHere = new Float64Array(n);
    const anchor = this.track ? null : this.state.lastDoneAt ? [...this.state.stops.entries()].filter(([, v]) => v.status === 'done').sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))[0]?.[0] : null;
    for (const i of idx) {
      const seq = this.original[i];
      fromHere[i] = this.track ? this.metresFromHere(seq) : anchor ? this.legMetres(anchor, seq) : 0;
    }
    const intel = this.routeIntel(now);
    const op = this.operation(now);
    const horizon = now + 12 * 3600_000;
    const serviceMin = this.original.map((seq) => this.serviceMin(seq));
    // Everything the penalty needs is computed ONCE here: it is called
    // millions of times during the search.
    const segOf = this.original.map((seq) => this.stop(seq).approachRoadId);
    // Plow-risk penalties need POSITIVE evidence of a snow event: a City
    // operation AND radar snow. Unknown (radar not loaded) is not evidence.
    const snow = this.snowEvidence(now);
    const pin = { intel, reworkMin: 4, horizon, opActive: !!op && snow === 'snow' };
    const penalty = (i: number, t: number) => {
      const seg = segOf[i];
      return seg === null ? 0 : reworkPenalty(seg, t, pin);
    };
    const inp = { matrix: this.matrix, n, order: idx, fromHere, serviceMin, metresPerMin: this.metresPerMin, startMs: now, penalty, stability: 1.5, baseOrder: idx };
    const base = evaluate({ ...inp, stability: 0 }, idx);
    const blocks = blocksOf(idx, (i) => this.stop(this.original[i]).street);
    const best = optimizeBlocks(inp, blocks);
    const plan = evaluate({ ...inp, stability: 0 }, best.order);
    let moved = 0;
    best.order.forEach((v, k) => (moved += v !== idx[k] ? 1 : 0));
    const hasHistory = [...intel.values()].some((x) => x.basis === 'historical');
    this.plan = {
      computedAt: now,
      base: { ...base, order: base.order.map((i) => this.original[i]) },
      plan: { ...plan, order: plan.order.map((i) => this.original[i]) },
      moved,
      basis: !op || snow !== 'snow' ? 'none' : hasHistory ? 'historical' : 'prior',
      opActive: !!op,
      label: `Street-block plan ${new Date(now).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
    };
    this.planBusy = false;
    this.emit();
  }

  /** Full working order for applying a plan: done/deferred keep their places. */
  planOrder(plan: number[]): number[] {
    const set = new Set(plan);
    const fixed = this.state.order.filter((s) => !set.has(s));
    return [...fixed, ...plan];
  }

  async exportBackup(): Promise<Blob> {
    const body = {
      schema: 'astra.backup/1',
      exportedAt: new Date().toISOString(),
      route: { id: this.route.id, sha256: this.routeSha, stops: this.original.length },
      shift: this.shiftId,
      events: await this.store.events(),
      service: await this.store.service(0),
      prefs: await this.store.getKV('prefs'),
    };
    const text = JSON.stringify(body);
    return new Blob([JSON.stringify({ ...body, sha256: await sha256Hex(text) })], { type: 'application/json' });
  }

  async importBackup(file: File): Promise<string> {
    const text = await file.text();
    let doc: { schema?: string; route?: { id?: string }; events?: ShiftEvent[]; service?: { seg: number; t: number; seenAt?: number }[] };
    try {
      doc = JSON.parse(text);
    } catch {
      return 'That file is not a backup (not JSON).';
    }
    if ((doc as { schema?: string }).schema === 'astra.intel/1') {
      // City history from the background collector: service events only.
      const rows = (doc.service ?? []).filter((r) => Number.isFinite(r.seg) && Number.isFinite(r.t)).map((r) => ({ seg: r.seg, t: r.t, seenAt: r.seenAt ?? r.t }));
      await this.store.addService(rows);
      await this.loadHistory();
      this.emit();
      return `Imported ${rows.length} City service records from the collector.`;
    }
    if (doc.schema !== 'astra.backup/1') return 'That file is not an ASTRA backup or City history file.';
    if (doc.route?.id !== this.route.id) return `That backup is for route ${doc.route?.id ?? 'unknown'}, not ${this.route.id}.`;
    const evs = (doc.events ?? []).filter((e) => e && typeof e.id === 'string' && typeof e.t === 'number' && typeof e.shift === 'string');
    for (const e of evs) await this.store.addEvent(e);
    await this.store.addService((doc.service ?? []).filter((r) => Number.isFinite(r.seg) && Number.isFinite(r.t)).map((r) => ({ seg: r.seg, t: r.t, seenAt: r.seenAt ?? r.t })));
    await this.loadHistory();
    if (this.shiftId) {
      this.events = await this.store.events(this.shiftId);
      this.state = reduce(this.original, this.events);
    }
    this.emit();
    return `Restored ${evs.length} events and ${(doc.service ?? []).length} City service records.`;
  }

  async forgetKey(): Promise<void> {
    await this.store.delKV(KEY_KV);
    location.reload();
  }
}
