// Every screen and overlay. Built once; render() updates only what changed.

import { App } from './app.ts';
import { createMap, type MapApi } from './map.ts';
import { h, setText, clock, duration, ago, metres } from './dom.ts';
import { nextStop } from '../data/events.ts';
import type { Stop } from '../data/schema.ts';
import type { SegmentIntel } from '../intel/model.ts';
import { describeRate } from '../intel/weather.ts';
import { bearing, dist } from '../core/geo.ts';
import { VERSION } from '../version.ts';

const ICON = {
  logo: `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M16 2 L29 28 L16 22 L3 28 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 9 L22 22 L16 19 L10 22 Z" fill="currentColor" opacity=".55"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3 L19 20 L12 16 L5 20 Z" fill="currentColor"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 L22 20 H2 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10 v4.5 M12 17.2 v.3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  city: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 15 h12 l3-4 h3 v6 H3 Z M6 15 v-4 h6 v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
};

export class View {
  private root: HTMLElement;
  private mapApi: MapApi | null = null;
  private els: Record<string, HTMLElement> = {};
  private mapKey = '';
  private spineKey = '';
  private svcKey = '';
  private vehKey = '';
  private followAt = 0;
  private sheetTab: 'route' | 'intel' | 'plan' | 'night' | 'system' = 'route';
  private routeFilter = '';
  private openStop: number | null = null;
  private lastSeq: number | null = null;

  private app: App;

  constructor(app: App, mount: HTMLElement) {
    this.app = app;
    this.root = mount;
    this.build();
    app.on(() => this.render());
    this.render();
  }

  // ---------------------------------------------------------------- build
  private build(): void {
    const a = this.app;
    const mapEl = h('div', { id: 'map', class: 'map' });
    const rail = h(
      'header',
      { class: 'rail' },
      h('div', { class: 'brand', html: ICON.logo + '<span>ASTRA</span>' }),
      (this.els.gps = h('div', { class: 'pip', title: 'GPS' })),
      (this.els.cityPip = h('div', { class: 'pip', title: 'City feed' })),
      (this.els.wx = h('div', { class: 'pip wx', title: 'Weather' })),
      h('div', { class: 'spacer' }),
      (this.els.clock = h('div', { class: 'clock mono' })),
      (this.els.modeBtn = h('button', { class: 'mode', onclick: () => a.go(a.screen === 'drive' ? 'park' : 'drive') })),
    );

    // Drive HUD
    this.els.progress = h('div', { class: 'progress' },
      (this.els.count = h('div', { class: 'count mono' })),
      h('div', { class: 'bar' }, (this.els.barFill = h('div', { class: 'fill' })), (this.els.barTicks = h('div', { class: 'ticks' }))),
      (this.els.eta = h('div', { class: 'eta' })),
    );
    this.els.next = h('section', { class: 'next' },
      h('div', { class: 'next-head' },
        (this.els.seq = h('div', { class: 'seq mono' })),
        h('div', { class: 'next-main' }, (this.els.phase = h('div', { class: 'phase' })), (this.els.addr = h('div', { class: 'addr' }))),
        h('div', { class: 'nav' }, (this.els.navArrow = h('div', { class: 'nav-arrow', html: ICON.arrow })), (this.els.navDist = h('div', { class: 'nav-dist mono' }))),
      ),
      (this.els.note = h('div', { class: 'note' })),
      (this.els.cityLine = h('div', { class: 'city-line' })),
      (this.els.then = h('div', { class: 'then' })),
    );
    this.els.doneBtn = h('button', { class: 'done', 'aria-label': 'Mark this driveway done', onclick: () => void a.done() }, h('span', { class: 'done-icon', html: ICON.check }), h('span', { class: 'done-label' }, 'DONE'));
    this.els.street = h('button', { class: 'chip street', onclick: () => this.cycleStreet() });
    this.els.actions = h('div', { class: 'actions' },
      this.els.street,
      h('button', { class: 'chip', onclick: () => { const s = nextStop(a.state); if (s !== null) void a.defer(s); } }, 'LATER'),
      h('button', { class: 'chip bad', onclick: () => this.blockMenu() }, 'BLOCKED'),
      h('button', { class: 'chip', onclick: () => void a.undo(), 'aria-label': 'Undo last action' }, 'UNDO'),
    );
    const hud = h('div', { class: 'hud' }, this.els.progress, this.els.next, this.els.doneBtn, this.els.actions);

    // Park sheet
    this.els.tabs = h('nav', { class: 'tabs' },
      ...(['route', 'intel', 'plan', 'night', 'system'] as const).map((t) =>
        h('button', { class: 'tab', 'data-tab': t, onclick: () => { this.sheetTab = t; this.render(true); } }, t.toUpperCase()),
      ),
    );
    this.els.sheetBody = h('div', { class: 'sheet-body' });
    const sheet = h('section', { class: 'sheet' }, h('div', { class: 'grip' }), this.els.tabs, this.els.sheetBody);

    // Map overlay controls (park)
    this.els.mapCtl = h('div', { class: 'map-ctl' },
      h('button', { class: 'ctl', onclick: () => { a.imagery = !a.imagery; void a.savePrefs(); } }, 'IMAGERY'),
      h('button', { class: 'ctl', onclick: () => { a.radarLayer = !a.radarLayer; a.emit(); } }, 'RADAR'),
      h('button', { class: 'ctl', onclick: () => this.mapApi?.overview(a.route.stops.map((s) => s.target)) }, 'ROUTE'),
      h('button', { class: 'ctl', onclick: () => { if (a.track) this.mapApi?.follow(a.track.position, a.track.heading, false); } }, 'ME'),
    );

    this.els.toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    this.els.undo = h('div', { class: 'undo-bar' });
    this.els.prompt = h('div', { class: 'prompt' });
    this.els.saveErr = h('div', { class: 'save-error', role: 'alert' });
    this.els.modal = h('div', { class: 'modal' });
    this.els.screen = h('div', { class: 'screen' });

    this.root.append(mapEl, rail, this.els.mapCtl, hud, sheet, this.els.prompt, this.els.undo, this.els.toast, this.els.saveErr, this.els.modal, this.els.screen);
    this.els.map = mapEl;
    this.els.hud = hud;
    this.els.sheet = sheet;
  }

  private ensureMap(): void {
    if (this.mapApi || !this.app.route) return;
    this.mapApi = createMap(this.els.map, this.app.roads, this.app.route.stops);
    this.mapApi.map.on('click', 'stop-dot', (e) => {
      const seq = e.features?.[0]?.properties?.seq;
      if (typeof seq === 'number') this.showStop(seq);
    });
    this.mapApi.map.on('mouseenter', 'stop-dot', () => (this.mapApi!.map.getCanvas().style.cursor = 'pointer'));
    window.addEventListener('resize', () => this.mapApi?.resize());
  }

  // --------------------------------------------------------------- render
  render(forceSheet = false): void {
    const a = this.app;
    const root = this.root;
    root.dataset.screen = a.screen;
    root.dataset.vision = a.nightVision ? 'red' : 'normal';
    root.style.setProperty('--dim', String(a.dim));
    this.renderScreen();
    if (a.screen !== 'drive' && a.screen !== 'park') return;
    this.ensureMap();
    const now = Date.now();
    this.renderRail(now);
    this.renderMap(now);
    if (a.screen === 'drive') this.renderHud(now);
    if (a.screen === 'park') this.renderSheet(forceSheet);
    this.renderOverlays(now);
    if (this.openStop !== null) this.renderStopModal(this.openStop);
  }

  private renderRail(now: number): void {
    const a = this.app;
    const t = a.track;
    const gpsClass = !t ? (a.gpsError ? 'bad' : 'idle') : a.view.gpsUsable ? 'ok' : 'warn';
    this.els.gps.className = `pip ${gpsClass}`;
    setText(this.els.gps, t ? `GPS ${Math.round(t.accuracy)}m` : a.gpsPermission === 'denied' ? 'GPS OFF' : 'GPS …');
    const f = a.cityFreshness(now);
    // A failing feed is never shown green, however fresh the last snapshot.
    this.els.cityPip.className = `pip ${a.city.error ? (f === 'live' || f === 'recent' ? 'warn' : 'bad') : f === 'live' ? 'ok' : f === 'recent' ? 'warn' : 'bad'}`;
    const vehNow = a.city.vehicles.filter((v) => now - v.t < 20 * 60_000);
    const units = new Set(vehNow.map((v) => v.vehicle)).size;
    setText(this.els.cityPip, `CITY ${f === 'none' ? '—' : shortAge(a.city.checkedAt!, now)}${a.city.error ? '!' : ''}${units ? ` ▲${units}` : ''}`);
    const rate = a.radar ? (a.radar.cmPerHour > 0 ? `${a.radar.cmPerHour.toFixed(1)}cm/h` : 'dry') : '—';
    const temp = a.station?.airTempC != null ? `${Math.round(a.station.airTempC)}°` : '';
    setText(this.els.wx, `${temp} ${rate}`.trim());
    this.els.wx.className = `pip wx ${a.radar && a.radar.cmPerHour >= 2 ? 'heavy' : ''}`;
    setText(this.els.clock, clock(now));
    setText(this.els.modeBtn, a.screen === 'drive' ? 'PARK' : 'DRIVE');
  }

  private renderMap(now: number): void {
    const a = this.app;
    const m = this.mapApi;
    if (!m) return;
    const next = nextStop(a.state);
    const statusMap = new Map([...a.state.stops].map(([k, v]) => [k, v.status]));
    const key = `${a.state.events}|${next}|${a.screen}`;
    if (key !== this.mapKey) {
      this.mapKey = key;
      m.setStops(a.route.stops, statusMap, next, a.state.order);
    }
    const pos = a.track?.position ?? null;
    const sk = `${next}|${a.state.events}|${pos ? Math.round(pos[0] * 4000) + ',' + Math.round(pos[1] * 4000) : ''}`;
    if (sk !== this.spineKey) {
      this.spineKey = sk;
      m.setSpine(a.spine(6));
    }
    m.setTractor(pos, a.track?.heading ?? null, a.track?.accuracy ?? null);
    const svk = `${a.city.checkedAt}|${Math.floor(now / 60_000)}`;
    if (svk !== this.svcKey && a.city.serviced) {
      this.svcKey = svk;
      m.setServiceAges(a.city.serviced, a.operation(now)?.start ?? null, now);
    }
    const vk = `${a.city.vehiclesAt}|${a.city.vehicles.length}|${Math.floor(now / 60_000)}`;
    if (vk !== this.vehKey) {
      this.vehKey = vk;
      const by = new Map<string, { t: number; lng: number; lat: number }[]>();
      for (const p of a.city.vehicles) if (now - p.t < 90 * 60_000) (by.get(p.vehicle) ?? by.set(p.vehicle, []).get(p.vehicle)!).push(p);
      m.setVehicles([...by].map(([vehicle, ps]) => {
        ps.sort((x, y) => x.t - y.t);
        return { vehicle, coords: ps.map((p) => [p.lng, p.lat] as [number, number]), last: ps[ps.length - 1].t };
      }), now);
    }
    m.setImagery(a.imagery);
    m.setRadar(a.radarLayer);
    if (pos && now - this.followAt > 1500) {
      this.followAt = now;
      if (a.screen === 'drive') m.follow(pos, a.track?.heading ?? null, true);
    }
  }

  private renderHud(now: number): void {
    const a = this.app;
    const total = a.original.length;
    const done = a.state.doneCount;
    setText(this.els.count, `${done}/${total}`);
    this.els.barFill.style.width = `${(done / total) * 100}%`;
    const fc = a.forecast(now);
    this.els.eta.innerHTML = fc
      ? `<span class="lbl">FINISH</span> <b class="mono">${clock(fc.finishMs)}</b> <span class="range mono">${clock(fc.earlyMs)}–${clock(fc.lateMs)}</span> <span class="lbl">LEFT</span> <b class="mono">${duration(fc.remainingMin)}</b>`
      : `<span class="lbl">ROUTE COMPLETE</span>`;
    const seq = nextStop(a.state);
    this.els.hud.classList.toggle('complete', seq === null);
    if (seq === null) {
      setText(this.els.seq, '✓');
      setText(this.els.addr, 'All driveways done');
      setText(this.els.phase, 'MISSION COMPLETE');
      this.els.note.hidden = true;
      this.els.cityLine.hidden = true;
      setText(this.els.then, '');
      (this.els.doneBtn as HTMLButtonElement).disabled = true;
      setText(this.els.navDist, '');
      return;
    }
    (this.els.doneBtn as HTMLButtonElement).disabled = false;
    if (this.lastSeq !== seq) {
      if (this.lastSeq !== null) {
        this.els.next.classList.remove('swap');
        void this.els.next.offsetWidth;
        this.els.next.classList.add('swap');
      }
      this.lastSeq = seq;
    }
    const s = a.stop(seq);
    const st = a.state.stops.get(seq)!;
    setText(this.els.seq, String(seq));
    setText(this.els.addr, s.address);
    const revisit = st.status === 'deferred' || st.status === 'blocked';
    const phaseText = revisit ? `RETURN LIST · ${st.status === 'blocked' ? 'WAS BLOCKED' : 'DEFERRED'}` : a.state.focus === seq ? 'OUT OF ORDER · YOUR CHOICE' : a.view.phase === 'at' ? 'AT DRIVEWAY' : a.view.phase === 'approach' ? 'APPROACHING' : a.view.phase === 'leaving' ? 'LEAVING — NOT DONE' : 'NEXT';
    setText(this.els.phase, phaseText);
    this.els.next.dataset.phase = a.view.phase;
    // Distance + bearing
    if (a.track && a.view.gpsUsable) {
      const d = dist(a.track.position, s.target);
      setText(this.els.navDist, metres(d));
      const brg = bearing(a.track.position, s.target);
      const rel = a.track.heading !== null ? brg - a.track.heading : brg;
      this.els.navArrow.style.transform = `rotate(${rel}deg)`;
      this.els.navArrow.style.opacity = '1';
    } else {
      setText(this.els.navDist, a.track ? `±${Math.round(a.track.accuracy)}m` : '');
      this.els.navArrow.style.opacity = '.25';
    }
    // Note: verbatim, always.
    const confirmed = a.state.drivewayConfirm.get(seq);
    const dw = s.driveways[0];
    const dwLine = dw && (dw.street !== s.street || confirmed) ? `Driveway on ${confirmed ?? titleCase(dw.street)}${dw.streetConfidence === 'ambiguous' && !confirmed ? ' (unconfirmed)' : ''}` : '';
    const driverNotes = a.state.driverNotes.get(seq) ?? [];
    const hasNote = !!(s.note || dwLine || driverNotes.length || s.issues.some(isFieldIssue));
    this.els.note.hidden = !hasNote;
    if (hasNote) {
      this.els.note.innerHTML = '';
      if (s.note) this.els.note.append(h('div', { class: 'note-text' }, h('span', { class: 'note-ico', html: ICON.warn }), s.note));
      if (dwLine) this.els.note.append(h('div', { class: 'note-sub' }, dwLine));
      for (const n of driverNotes) this.els.note.append(h('div', { class: 'note-sub mine' }, `Your note: ${n}`));
      const fi = s.issues.filter(isFieldIssue);
      if (fi.length) this.els.note.append(h('div', { class: 'note-sub data' }, `Map data: ${fi.join('; ')}`));
    }
    // City line for this street.
    const intel = s.approachRoadId !== null ? a.routeIntel(now).get(s.approachRoadId) : undefined;
    this.els.cityLine.hidden = !intel;
    if (intel) {
      const f = a.cityFreshness(now);
      const age = f === 'stale' && a.city.checkedAt ? ` · City data ${ago(a.city.checkedAt, now).replace(' ago', '')} old` : a.city.error ? ' · City feed not answering' : '';
      this.els.cityLine.innerHTML = `${ICON.city}<span>${intelLine(intel, now)}${age}</span>`;
    }
    const up = a.upcoming(2).map((q) => `#${q} ${a.stop(q).address}`);
    setText(this.els.then, up.length ? `then ${up.join('  ·  ')}` : 'last driveway');
    // Street chip
    const chip = a.streetChip;
    this.els.street.className = `chip street ${chip ?? 'unknown'}`;
    setText(this.els.street, chip === 'plowed' ? 'STREET PLOWED' : chip === 'unplowed' ? 'STREET NOT PLOWED' : chip === 'unsure' ? 'STREET: NOT SURE' : 'STREET PLOWED?');
  }

  private renderOverlays(now: number): void {
    const a = this.app;
    const t = a.toast;
    this.els.toast.className = `toast ${t ? 'show ' + t.tone : ''}`;
    if (t) setText(this.els.toast, t.text);
    const u = a.lastUndo;
    this.els.undo.className = `undo-bar ${u && a.screen === 'drive' ? 'show' : ''}`;
    if (u) {
      const left = Math.max(0, (u.until - now) / 7000);
      this.els.undo.innerHTML = '';
      this.els.undo.append(h('span', {}, `✓ ${u.label}`), h('button', { onclick: () => void a.undo() }, 'UNDO'), h('i', { style: `transform:scaleX(${left})` }));
    }
    const p = a.prompt;
    this.els.prompt.className = `prompt ${p ? 'show' : ''}`;
    if (p) {
      this.els.prompt.innerHTML = '';
      const s = a.stop(p.seq);
      if (p.kind === 'leaving') {
        this.els.prompt.append(h('div', { class: 'prompt-t' }, `Leaving #${s.seq} ${s.address}`), h('div', { class: 'prompt-a' },
          h('button', { class: 'go', onclick: () => { a.prompt = null; void a.done(); } }, 'DONE'),
          h('button', { onclick: () => { a.prompt = null; a.emit(); } }, 'NOT YET'),
        ));
      } else {
        this.els.prompt.append(h('div', { class: 'prompt-t' }, `#${s.seq} ${s.address} is on your return list`), h('div', { class: 'prompt-a' },
          h('button', { class: 'go', onclick: () => { a.prompt = null; void a.focus(p.seq); } }, 'RETRY NOW'),
          h('button', { onclick: () => { a.prompt = null; a.emit(); } }, 'LATER'),
        ));
      }
    }
    this.els.saveErr.hidden = !a.saveError && a.store?.durable !== false;
    setText(this.els.saveErr, a.saveError ?? (a.store && !a.store.durable ? 'STORAGE UNAVAILABLE — progress is NOT being saved. Leave private browsing.' : ''));
  }

  // ---------------------------------------------------------------- sheet
  private sheetSig = '';
  private renderSheet(force: boolean): void {
    const a = this.app;
    for (const b of this.els.tabs.querySelectorAll('button')) b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.sheetTab);
    const sig = `${this.sheetTab}|${a.state.events}|${a.city.checkedAt}|${a.plan?.computedAt}|${a.planBusy}|${Math.floor(Date.now() / 15000)}|${this.routeFilter}`;
    if (!force && sig === this.sheetSig) return;
    this.sheetSig = sig;
    const body = this.els.sheetBody;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    if (this.sheetTab === 'route') body.append(this.routeTab());
    if (this.sheetTab === 'intel') body.append(this.intelTab());
    if (this.sheetTab === 'plan') body.append(this.planTab());
    if (this.sheetTab === 'night') body.append(this.nightTab());
    if (this.sheetTab === 'system') body.append(this.systemTab());
    body.scrollTop = scroll;
  }

  private routeTab(): HTMLElement {
    const a = this.app;
    const wrap = h('div', { class: 'tab-route' });
    const search = h('input', { class: 'search', type: 'search', placeholder: 'Find an address or stop #', value: this.routeFilter, oninput: (e: Event) => { this.routeFilter = (e.target as HTMLInputElement).value; this.render(true); } }) as HTMLInputElement;
    wrap.append(search);
    const rv = a.revisit();
    const wr = a.windrows();
    const skipped = a.skipped();
    if (skipped.length) wrap.append(h('div', { class: 'callout warn' }, `Not done and behind you: ${skipped.map((s) => `#${s}`).join(', ')}`));
    if (rv.length) {
      wrap.append(h('h3', {}, `RETURN LIST · ${rv.length}`));
      for (const s of rv) wrap.append(this.stopRow(s));
    }
    if (wr.length) {
      wrap.append(h('h3', {}, `WINDROW WATCH · ${wr.length}`), h('p', { class: 'fine' }, 'Cleared before the City serviced the street. A plow may have left a ridge across the end. “Serviced” can also be salt — check before returning.'));
      for (const w of wr) wrap.append(this.stopRow(w.stop, `${w.level === 'likely' ? 'LIKELY' : 'POSSIBLE'} · City ${clock(w.servicedAt)} after your ${clock(w.doneAt)}`));
    }
    wrap.append(h('h3', {}, a.state.planLabel ? `ORDER · ${a.state.planLabel.toUpperCase()}` : "ORDER · TED'S ROUTE (ORIGINAL)"));
    const f = this.routeFilter.trim().toLowerCase();
    for (const seq of a.state.order) {
      const s = a.stop(seq);
      if (f && !(`${seq} ${s.address} ${s.note} ${s.raw}`.toLowerCase().includes(f))) continue;
      wrap.append(this.stopRow(seq));
    }
    return wrap;
  }

  private stopRow(seq: number, sub?: string): HTMLElement {
    const a = this.app;
    const s = a.stop(seq);
    const st = a.state.stops.get(seq)!;
    const isNext = nextStop(a.state) === seq;
    return h('button', { class: `row ${st.status} ${isNext ? 'next' : ''}`, onclick: () => this.showStop(seq) },
      h('span', { class: 'row-seq mono' }, String(seq)),
      h('span', { class: 'row-main' }, h('span', { class: 'row-addr' }, s.address), sub ? h('span', { class: 'row-sub' }, sub) : s.note ? h('span', { class: 'row-note' }, s.note) : null),
      h('span', { class: 'row-st' }, isNext ? 'NEXT' : st.status === 'done' ? clock(st.at) : st.status === 'pending' ? '' : st.status.toUpperCase()),
    );
  }

  private intelTab(): HTMLElement {
    const a = this.app;
    const now = Date.now();
    const op = a.operation(now);
    const wrap = h('div', { class: 'tab-intel' });
    const units = new Set(a.city.vehicles.filter((v) => now - v.t < 20 * 60_000).map((v) => v.vehicle)).size;
    wrap.append(
      h('div', { class: 'kpis' },
        kpi('CITY CREWS', op ? `active since ${clock(op.start)}` : 'none in last 3 h', op ? 'city' : ''),
        kpi('UNITS REPORTING', units ? `${units} in last 20 min` : 'none', units ? 'city' : ''),
        kpi('CITY FEED', a.city.checkedAt ? `checked ${ago(a.city.checkedAt, now)}` : 'not yet', a.cityFreshness(now) === 'live' ? 'ok' : 'warn'),
        kpi('RADAR AT YOU', a.radar ? `${describeRate(a.radar.cmPerHour)}${a.radar.cmPerHour > 0 ? ` · ${a.radar.cmPerHour.toFixed(1)} cm/h` : ''}` : a.radarError ? 'unavailable' : '…', a.radar && a.radar.cmPerHour > 0 ? 'city' : ''),
      ),
    );
    if (a.city.error) wrap.append(h('div', { class: 'callout bad' }, `City feed: ${a.city.error}. Showing the last good snapshot${a.city.checkedAt ? ` from ${clock(a.city.checkedAt)}` : ''}.`));
    if (a.radar) wrap.append(h('p', { class: 'fine' }, `Radar scan ${clock(a.radar.scanAt)} (ECCC, 1 km, snow-rate product).${a.station?.airTempC != null ? ` ${a.station.station}: ${a.station.airTempC.toFixed(1)}°C at ${clock(a.station.observedAt)}.` : ''}`));
    wrap.append(h('div', { class: 'callout' }, h('b', {}, 'What “serviced” means. '), 'The City’s timestamp records the last time a street was plowed OR salted/sanded/brined — the feed does not say which. ASTRA shows it as “serviced” until you confirm the street with the STREET button at a stop.'));
    // Route streets
    const intel = a.routeIntel(now);
    const rows = [...intel.values()]
      .map((i) => ({ i, name: a.segById.get(i.seg)?.name ?? `#${i.seg}`, cls: a.segById.get(i.seg)?.plowClass ?? '', stops: a.route.stops.filter((s) => s.approachRoadId === i.seg).length }))
      .sort((x, y) => x.name.localeCompare(y.name));
    const tbl = h('div', { class: 'streets' });
    for (const r of rows) {
      tbl.append(h('div', { class: `street-row ${r.i.state}` },
        h('div', { class: 'st-name' }, titleCase(r.name), h('small', {}, `${r.cls === 'R' ? 'residential' : r.cls === 'S' ? 'secondary' : r.cls === 'P' ? 'priority' : ''} · ${r.stops} stop${r.stops === 1 ? '' : 's'}`)),
        h('div', { class: 'st-state' }, stateLabel(r.i), h('small', {}, r.i.lastServiced ? `last ${clock(r.i.lastServiced)} · ${ago(r.i.lastServiced, now)}` : 'no record')),
      ));
    }
    wrap.append(h('h3', {}, `YOUR STREETS · ${rows.length} SEGMENTS`), tbl);
    const ops = a.city.history.length;
    wrap.append(h('h3', {}, 'LEARNING'), h('p', { class: 'fine' }, `${ops} City service records collected on this phone. Predictions of when a street will be serviced need 3+ recorded storms with residential plowing; until then ASTRA shows the City’s published policy as a low-confidence prior.`));
    return wrap;
  }

  private planTab(): HTMLElement {
    const a = this.app;
    const wrap = h('div', { class: 'tab-plan' });
    wrap.append(h('p', {}, "Ted's order is the default and is never changed without you. This compares it with a re-ordering of whole streets that weighs driving and the chance the City plows a street after you've cleared it."));
    wrap.append(h('button', { class: 'wide', disabled: a.planBusy, onclick: () => void a.computePlan() }, a.planBusy ? 'ANALYZING…' : 'ANALYZE REMAINING ROUTE'));
    const p = a.plan;
    if (p) {
      const dMin = p.base.totalMin - p.plan.totalMin;
      const dTravel = p.base.travelMetres - p.plan.travelMetres;
      const dRisk = p.base.penaltyMin - p.plan.penaltyMin;
      wrap.append(h('div', { class: 'compare' },
        h('div', { class: 'col' }, h('h4', {}, 'CURRENT ORDER'), h('div', { class: 'big mono' }, clock(p.base.finishMs)), h('div', {}, `${(p.base.travelMetres / 1000).toFixed(1)} km driving`), p.basis === 'historical' ? h('div', {}, `${p.base.penaltyMin.toFixed(0)} min expected rework`) : null),
        h('div', { class: 'col' }, h('h4', {}, 'STREET-BLOCK PLAN'), h('div', { class: 'big mono' }, clock(p.plan.finishMs)), h('div', {}, `${(p.plan.travelMetres / 1000).toFixed(1)} km driving`), p.basis === 'historical' ? h('div', {}, `${p.plan.penaltyMin.toFixed(0)} min expected rework`) : null),
      ));
      const basis =
        p.basis === 'none'
          ? 'No snow event confirmed (no City operation, or no snow on radar since it began), so there is no plow timing to plan around — only driving was compared.'
          : p.basis === 'prior'
            ? 'Plow timing comes only from City policy (no storms recorded yet): the plan defers unserviced residential streets, but no rework estimate is shown — it would be a guess. LOW confidence.'
            : 'Plow timing from storms recorded on this phone. Rework estimates are model figures, not measurements.';
      wrap.append(h('p', { class: 'fine' }, basis));
      if (p.moved === 0 || dMin < 2) {
        wrap.append(h('div', { class: 'callout ok' }, `Keep the current order. The best alternative saves ${Math.max(0, dMin).toFixed(1)} min (${Math.max(0, dTravel).toFixed(0)} m) — not worth changing.`));
      } else {
        wrap.append(h('div', { class: 'callout' }, p.basis === 'historical' ? `Saves about ${dMin.toFixed(0)} min (${(dTravel / 1000).toFixed(2)} km driving, ${dRisk.toFixed(0)} min less expected rework). ${p.moved} stops change position.` : `Defers streets the City has not serviced yet. ${p.moved} stops change position; driving ${dTravel >= 0 ? 'saves' : 'adds'} ${Math.abs(dTravel / 1000).toFixed(2)} km.`));
        const firstDiff = p.plan.order.slice(0, 12).map((s) => `#${s}`).join(' ');
        wrap.append(h('p', { class: 'fine mono' }, `Plan starts: ${firstDiff}…`));
        wrap.append(h('button', { class: 'wide go', onclick: () => void a.applyPlan(a.planOrder(p.plan.order), p.label) }, 'APPLY THIS PLAN'));
      }
    }
    if (a.state.planLabel) wrap.append(h('button', { class: 'wide', onclick: () => void a.applyPlan(null, 'original') }, "RETURN TO TED'S ORDER"));
    return wrap;
  }

  private nightTab(): HTMLElement {
    const a = this.app;
    const now = Date.now();
    const st = a.state;
    const elapsed = st.startedAt ? (now - st.startedAt) / 60_000 : 0;
    const perHour = elapsed > 5 ? st.doneCount / (elapsed / 60) : 0;
    const fc = a.forecast(now);
    const counts = { deferred: 0, blocked: 0 };
    for (const v of st.stops.values()) if (v.status === 'deferred' || v.status === 'blocked') counts[v.status]++;
    return h('div', { class: 'tab-night' },
      h('div', { class: 'kpis' },
        kpi('STARTED', st.startedAt ? clock(st.startedAt) : '—'),
        kpi('ELAPSED', duration(elapsed)),
        kpi('DONE', `${st.doneCount} / ${a.original.length}`, 'ok'),
        kpi('PACE', perHour ? `${perHour.toFixed(1)} / h` : '—'),
        kpi('TRACTOR KM', (a.odometer / 1000).toFixed(2)),
        kpi('RETURN LIST', `${counts.deferred} later · ${counts.blocked} blocked`, counts.deferred + counts.blocked ? 'warn' : ''),
        kpi('FINISH', fc ? `${clock(fc.finishMs)} (${clock(fc.earlyMs)}–${clock(fc.lateMs)})` : 'done'),
        kpi('WINDROW WATCH', String(a.windrows().length), a.windrows().length ? 'warn' : ''),
      ),
      h('button', { class: 'wide bad', onclick: () => { if (confirm('End this shift? Progress is kept in the history.')) void a.endShift(); } }, 'END SHIFT'),
    );
  }

  private systemTab(): HTMLElement {
    const a = this.app;
    const r = a.route;
    const verified = r.stops.filter((s) => s.verified).length;
    const withDw = r.stops.filter((s) => s.driveways.length).length;
    const toggle = (label: string, on: boolean, fn: () => void) => h('button', { class: `toggle ${on ? 'on' : ''}`, onclick: fn }, h('span', {}, label), h('b', {}, on ? 'ON' : 'OFF'));
    const dim = h('input', { type: 'range', min: '0.35', max: '1', step: '0.05', value: String(a.dim), oninput: (e: Event) => { a.dim = Number((e.target as HTMLInputElement).value); void a.savePrefs(); } });
    const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) a.flash(await a.importBackup(f), 'ok', 6000); } }) as HTMLInputElement;
    return h('div', { class: 'tab-system' },
      h('h3', {}, 'ROUTE INTEGRITY'),
      h('div', { class: 'kpis' },
        kpi('SOURCE', `${r.source.subject} · ${r.source.from.split('@')[0]}`),
        kpi('STOPS', `${r.stops.length} of ${r.source.rows} rows`, r.stops.length === r.source.rows ? 'ok' : 'bad'),
        kpi('ADDRESS MATCH', `${r.stops.filter((s) => s.addressId).length}/${r.stops.length} City points`, 'ok'),
        kpi('DRIVEWAYS MAPPED', `${withDw}/${r.stops.length}`),
        kpi('CLEAN STOPS', `${verified}/${r.stops.length}`, verified === r.stops.length ? 'ok' : 'warn'),
        kpi('FILE CHECK', `sha256 ${a.routeSha.slice(0, 12)}… ✓`, 'ok'),
      ),
      h('h3', {}, 'COCKPIT'),
      toggle('Voice', a.fb.voiceOn, () => { a.fb.voiceOn = !a.fb.voiceOn; void a.savePrefs(); }),
      toggle('Sounds', a.fb.soundOn, () => { a.fb.soundOn = !a.fb.soundOn; void a.savePrefs(); }),
      toggle('Night vision (red)', a.nightVision, () => { a.nightVision = !a.nightVision; void a.savePrefs(); }),
      toggle('City imagery', a.imagery, () => { a.imagery = !a.imagery; void a.savePrefs(); }),
      h('label', { class: 'dimmer' }, h('span', {}, 'Dimmer'), dim),
      h('h3', {}, 'DEVICE'),
      h('div', { class: 'kpis' },
        kpi('STORAGE', a.store.durable ? (a.persisted ? 'saved · protected' : 'saved · not protected') : 'NOT SAVING', a.store.durable ? (a.persisted ? 'ok' : 'warn') : 'bad'),
        kpi('SCREEN AWAKE', a.wakeLock ? 'held' : 'not held', a.wakeLock ? 'ok' : 'warn'),
        kpi('EVENTS THIS SHIFT', String(a.state.events)),
        kpi('VERSION', VERSION),
      ),
      h('button', { class: 'wide', onclick: async () => { const b = await a.exportBackup(); const u = URL.createObjectURL(b); const l = h('a', { href: u, download: `astra-backup-${new Date().toISOString().slice(0, 16).replace(':', '')}.json` }); l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); } }, 'EXPORT BACKUP'),
      h('button', { class: 'wide', onclick: () => file.click() }, 'RESTORE BACKUP / IMPORT CITY HISTORY…'),
      file,
      h('button', { class: 'wide bad', onclick: () => { if (confirm('Remove the route key from this phone? You will need the unlock link again.')) void a.forgetKey(); } }, 'FORGET ROUTE KEY'),
      h('p', { class: 'fine' }, `Data: ${Object.keys(r.datasets).join(', ')} — © City of Barrie (no warranty of accuracy or currency). Radar and observations © ECCC. Built ${r.builtAt.slice(0, 10)}.`),
    );
  }

  // ----------------------------------------------------------- stop modal
  showStop(seq: number): void {
    this.openStop = seq;
    this.renderStopModal(seq);
  }

  private stopModalSig = '';
  private renderStopModal(seq: number): void {
    const a = this.app;
    const sig = `${seq}|${a.state.events}|${a.city.checkedAt}`;
    if (sig === this.stopModalSig && this.els.modal.classList.contains('show')) return;
    this.stopModalSig = sig;
    const s = a.stop(seq);
    const st = a.state.stops.get(seq)!;
    const close = () => {
      this.openStop = null;
      this.els.modal.className = 'modal';
      this.els.modal.innerHTML = '';
    };
    const intel = s.approachRoadId !== null ? a.routeIntel().get(s.approachRoadId) : undefined;
    const dw = s.driveways[0];
    const confirmed = a.state.drivewayConfirm.get(seq);
    const ln = a.learned.get(seq);
    const card = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', { class: 'seq mono' }, String(seq)), h('div', {}, h('div', { class: 'addr' }, s.address), h('div', { class: 'fine' }, `${st.status.toUpperCase()}${st.at ? ' · ' + clock(st.at) : ''}`)), h('button', { class: 'x', onclick: close, 'aria-label': 'Close' }, '×')),
      h('div', { class: 'raw' }, h('small', {}, "TED'S LINE (VERBATIM)"), h('div', { class: 'mono' }, s.raw)),
      s.note ? h('div', { class: 'note' }, h('div', { class: 'note-text' }, h('span', { class: 'note-ico', html: ICON.warn }), s.note)) : null,
      ...(a.state.driverNotes.get(seq) ?? []).map((n) => h('div', { class: 'note-sub mine' }, `Your note: ${n}`)),
      h('div', { class: 'facts' },
        fact('Driveway', dw ? `${confirmed ? titleCase(confirmed) + ' (you confirmed)' : titleCase(dw.street)}${dw.streetConfidence === 'ambiguous' && !confirmed ? ' — unconfirmed corner lot' : dw.streetConfidence === 'ortho-verified' ? ' — checked on 2023 imagery' : ''}` : 'not in City 2016 driveway map'),
        fact('City street', intel ? stateLabel(intel) : '—'),
        fact('Usual time here', ln && ln.n ? `${ln.median.toFixed(1)} min typical (${ln.n} visit${ln.n === 1 ? '' : 's'})` : `${(a.serviceMin(seq) / 1.046).toFixed(1)} min (estimate, no visits yet)`),
        s.issues.filter(isFieldIssue).length ? fact('Map data', s.issues.filter(isFieldIssue).join('; ')) : null,
      ),
      dw && dw.streetConfidence === 'ambiguous' && !confirmed
        ? h('div', { class: 'confirm' }, h('small', {}, 'WHICH STREET IS THE DRIVEWAY ON?'), ...[dw.street, ...dw.alternatives.map((x) => x.street)].map((name) => h('button', { onclick: () => void a.confirmDriveway(seq, name) }, titleCase(name))))
        : null,
      h('div', { class: 'card-actions' },
        st.status !== 'done' ? h('button', { class: 'go', onclick: () => { void a.focus(seq); close(); a.go('drive'); } }, 'WORK THIS NOW') : h('button', { onclick: () => void a.reopen(seq) }, 'REOPEN'),
        st.status === 'pending' ? h('button', { onclick: () => { void a.defer(seq); close(); } }, 'LATER') : null,
        st.status !== 'done' ? h('button', { class: 'bad', onclick: () => { void a.blocked(seq, 'vehicle'); close(); } }, 'BLOCKED') : null,
        h('button', { onclick: () => { const t = prompt(`Your note for #${seq} ${s.address} (Ted's note stays as is):`); if (t) void a.addNote(seq, t); } }, '+ NOTE'),
      ),
    );
    this.els.modal.innerHTML = '';
    this.els.modal.append(h('div', { class: 'scrim', onclick: close }), card);
    this.els.modal.className = 'modal show';
  }

  private cycleStreet(): void {
    const a = this.app;
    const order = [null, 'plowed', 'unplowed', 'unsure'] as const;
    const i = order.indexOf(a.streetChip as (typeof order)[number]);
    void a.setStreet(order[(i + 1) % order.length]);
  }

  private blockMenu(): void {
    const a = this.app;
    const seq = nextStop(a.state);
    if (seq === null) return;
    const close = () => {
      this.els.modal.className = 'modal';
      this.els.modal.innerHTML = '';
    };
    const pick = (r: 'vehicle' | 'obstacle' | 'other') => {
      close();
      void a.blocked(seq, r);
    };
    this.els.modal.innerHTML = '';
    this.els.modal.append(
      h('div', { class: 'scrim', onclick: close }),
      h('div', { class: 'card menu' },
        h('div', { class: 'fine' }, `#${seq} ${a.stop(seq).address} — why can't you clear it?`),
        h('button', { class: 'bad', onclick: () => pick('vehicle') }, 'CAR IN DRIVEWAY'),
        h('button', { class: 'bad', onclick: () => pick('obstacle') }, 'OBSTACLE / UNSAFE'),
        h('button', { onclick: () => pick('other') }, 'OTHER'),
        h('button', { onclick: close }, 'CANCEL'),
      ),
    );
    this.els.modal.className = 'modal show';
  }

  // -------------------------------------------------------------- screens
  private screenSig = '';
  private renderScreen(): void {
    const a = this.app;
    const sig = `${a.screen}|${a.unlockError}|${a.fatal}|${a.screen === 'preflight' ? Math.floor(Date.now() / 2000) + '|' + a.city.checkedAt + '|' + (a.track ? 1 : 0) + a.gpsPermission : ''}|${a.screen === 'debrief' ? a.state.events : ''}`;
    if (sig === this.screenSig) return;
    this.screenSig = sig;
    const el = this.els.screen;
    el.innerHTML = '';
    el.className = 'screen';
    if (a.screen === 'boot') {
      el.className = 'screen show boot';
      el.append(h('div', { class: 'boot-mark', html: ICON.logo }), h('div', { class: 'boot-t' }, 'ASTRA'), h('div', { class: 'fine' }, 'opening the route…'));
    } else if (a.screen === 'unlock') {
      el.className = 'screen show unlock';
      const input = h('input', { class: 'key', placeholder: 'Paste the unlock link or key', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
      const go = () => {
        const v = input.value.trim();
        const m = v.match(/[#&]k=([A-Za-z0-9_-]{43})/) ?? v.match(/^([A-Za-z0-9_-]{43})$/);
        void a.openRoute(m ? m[1] : v, true);
      };
      el.append(
        h('div', { class: 'boot-mark', html: ICON.logo }),
        h('h1', {}, 'ASTRA'),
        h('p', {}, 'The route is sealed. Open the unlock link you were given on this phone, or paste it here.'),
        input,
        h('button', { class: 'wide go', onclick: go }, 'OPEN ROUTE'),
        h('p', { class: 'fine' }, 'The key stays on this phone. The route file on the server is encrypted and unreadable without it.'),
      );
      if (a.unlockError) el.insertBefore(h('div', { class: 'callout bad' }, a.unlockError), el.lastChild);
    } else if (a.screen === 'preflight') {
      el.className = 'screen show preflight';
      el.append(this.preflight());
    } else if (a.screen === 'debrief') {
      el.className = 'screen show debrief';
      el.append(this.debrief());
    } else if (a.screen === 'fatal') {
      el.className = 'screen show unlock';
      el.append(h('h1', {}, 'ASTRA could not start'), h('div', { class: 'callout bad' }, a.fatal ?? 'Unknown error'), h('button', { class: 'wide', onclick: () => location.reload() }, 'RELOAD'));
    }
  }

  private preflight(): HTMLElement {
    const a = this.app;
    const now = Date.now();
    const r = a.route;
    const checks: [string, string, 'ok' | 'warn' | 'bad' | 'wait'][] = [
      ['Route', `${r.stops.length}/${r.source.rows} stops · integrity verified`, r.stops.length === r.source.rows ? 'ok' : 'bad'],
      ['Customer notes', `${r.stops.filter((s) => s.note).length} notes, verbatim`, 'ok'],
      ['Map data', `${r.stops.filter((s) => s.driveways.length).length} driveways mapped · ${r.stops.filter((s) => !s.verified).length} flagged`, 'ok'],
      ['Storage', a.store.durable ? (a.persisted ? 'saving · protected from eviction' : 'saving') : 'NOT SAVING (private mode?)', a.store.durable ? 'ok' : 'bad'],
      ['GPS', a.track ? `±${Math.round(a.track.accuracy)} m` : a.gpsPermission === 'denied' ? 'permission denied' : 'tap ENABLE GPS', a.track ? (a.view.gpsUsable ? 'ok' : 'warn') : a.gpsPermission === 'denied' ? 'bad' : 'wait'],
      ['City feed', a.city.checkedAt ? `${a.city.serviced?.size ?? 0} streets with service times · ${ago(a.city.checkedAt, now)}` : a.city.error ?? 'connecting…', a.city.checkedAt ? (a.cityFreshness(now) === 'live' ? 'ok' : 'warn') : a.city.error ? 'warn' : 'wait'],
      ['Radar', a.radar ? `${describeRate(a.radar.cmPerHour)} · scan ${clock(a.radar.scanAt)}` : a.radarError ? 'unavailable' : 'connecting…', a.radar ? 'ok' : a.radarError ? 'warn' : 'wait'],
      ['Voice & sound', a.fb.isUnlocked ? 'ready' : 'arms on first tap', a.fb.isUnlocked ? 'ok' : 'wait'],
    ];
    const resuming = !!a.shiftId && !a.state.endedAt;
    const op = a.operation(now);
    return h('div', { class: 'pf' },
      h('div', { class: 'pf-head' }, h('div', { class: 'boot-mark small', html: ICON.logo }), h('div', {}, h('div', { class: 'pf-t' }, 'PREFLIGHT'), h('div', { class: 'fine' }, `${r.title} · ${clock(now)}`))),
      h('ul', { class: 'checks' }, ...checks.map(([k, v, s], i) => h('li', { class: s, style: `--i:${i}` }, h('i', {}), h('b', {}, k), h('span', {}, v)))),
      h('div', { class: op ? 'callout city' : 'callout' }, crewsSentence(op, a.snowEvidence(now))),
      !a.track ? h('button', { class: 'wide', onclick: () => { a.fb.unlock(); a.startGps(); } }, 'ENABLE GPS') : null,
      h('button', { class: 'wide go big', onclick: () => void (resuming ? a.resumeShift() : a.beginShift()) }, resuming ? `RESUME SHIFT · ${a.state.doneCount}/${a.original.length}` : 'BEGIN SHIFT'),
      h('button', { class: 'wide ghost', onclick: () => { a.fb.unlock(); a.go('park'); } }, 'PLAN FIRST (PARKED)'),
    );
  }

  private debrief(): HTMLElement {
    const a = this.app;
    const st = a.state;
    const elapsed = st.startedAt && st.endedAt ? (st.endedAt - st.startedAt) / 60_000 : 0;
    return h('div', { class: 'pf' },
      h('div', { class: 'pf-head' }, h('div', { class: 'boot-mark small', html: ICON.logo }), h('div', {}, h('div', { class: 'pf-t' }, 'SHIFT COMPLETE'), h('div', { class: 'fine' }, `${clock(st.startedAt)} → ${clock(st.endedAt)}`))),
      h('div', { class: 'kpis' },
        kpi('DRIVEWAYS', `${st.doneCount} / ${a.original.length}`, 'ok'),
        kpi('TIME', duration(elapsed)),
        kpi('PACE', elapsed ? `${(st.doneCount / (elapsed / 60)).toFixed(1)} / h` : '—'),
        kpi('TRACTOR KM', (a.odometer / 1000).toFixed(2)),
        kpi('RETURN LIST LEFT', String(a.revisit().length), a.revisit().length ? 'warn' : 'ok'),
        kpi('WINDROW WATCH', String(a.windrows().length), a.windrows().length ? 'warn' : 'ok'),
      ),
      h('p', { class: 'fine' }, 'Tonight’s timings now feed the finish-time model for the next storm.'),
      h('button', { class: 'wide go big', onclick: () => void a.newShiftFromDebrief() }, 'DONE'),
    );
  }
}

// ----------------------------------------------------------------- helpers
function shortAge(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}

function crewsSentence(op: { start: number } | null, snow: 'snow' | 'no-snow' | 'unknown'): string {
  if (!op) return 'No City plow or salt trucks have serviced any street in the last 3 hours.';
  const base = `City crews active since ${clock(op.start)} (plow or salt — the feed does not say which).`;
  if (snow === 'no-snow') return `${base} No snow on radar since then: most likely salting or brine.`;
  if (snow === 'snow') return `${base} Radar has shown snow: plowing is possible.`;
  return base;
}

function kpi(label: string, value: string, tone = ''): HTMLElement {
  return h('div', { class: `kpi ${tone}` }, h('small', {}, label), h('b', {}, value));
}
function fact(label: string, value: string): HTMLElement {
  return h('div', { class: 'fact' }, h('small', {}, label.toUpperCase()), h('span', {}, value));
}
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(St|Rd|Ave|Cres|Crt|Sq)\b/g, (m) => m).replace(/\bE$/, 'E');
}
function isFieldIssue(i: string): boolean {
  return !i.startsWith('street suffix');
}
function stateLabel(i: SegmentIntel): string {
  switch (i.state) {
    case 'plowed-confirmed':
      return 'PLOWED (you saw it)';
    case 'serviced-unconfirmed':
      return `SERVICED ${clock(i.servicedThisOp)} · plow or salt?`;
    case 'not-serviced':
      return i.observed?.state === 'unplowed' ? 'NOT PLOWED (you saw it)' : 'not serviced since City crews started';
    default:
      return 'no operation';
  }
}
function intelLine(i: SegmentIntel, now: number): string {
  const base = stateLabel(i);
  if (i.state === 'not-serviced' && i.expected) return `${base} · City usually ${clock(i.expected.p50)} (${clock(i.expected.p10)}–${clock(i.expected.p90)}, ${i.expected.samples} storms)`;
  if (i.state === 'unknown' && i.lastServiced) return `no City operation · last serviced ${ago(i.lastServiced, now)}`;
  return base;
}
