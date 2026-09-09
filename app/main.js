/**
 * Application controller.
 *
 * Holds the derived view of "today" and hands it to whichever screen is
 * mounted. Screens never touch the database and never recompute the model;
 * they read a context object and call actions on it. That boundary is what
 * makes the routing, learning and persistence layers testable in Node without
 * a DOM, and what would let a later rebuild put a sync engine underneath
 * without rewriting a single screen.
 */

import { store, StorageError } from './data/store.js';
import { STOP_STATUS, DEFAULT_SETTINGS, META_KEYS } from './data/schema.js';
import { buildDemoProperties, buildDemoEvents } from './data/demo.js';
import { apply as applyBackup } from './data/backup.js';
import { buildLearningModel, forecastDay, paceToday, serviceMinutesFor } from './learning/predict.js';
import { optimizeRoute, parseWindowFromNote } from './routing/optimize.js';
import { dateKey, weekdayOf, DAY_FULL, formatDateHuman, parseClock, clockToTs, formatDuration } from './core/time.js';
import { locationService } from './services/geolocation.js';
import { WeatherService } from './services/weather.js';
import { buildInsights } from './services/insights.js';
import { navigateTo, NAV_APPS } from './services/navigation.js';
import { h, svg, ICON, clear, reconcile } from './ui/dom.js';
import { toast, reportError, clearToasts } from './ui/toast.js';
import { openSheet, closeSheet } from './ui/sheet.js';
import { initHaptics, setHapticsEnabled, haptic } from './ui/motion/haptics.js';
import { burst, clearEffects } from './ui/motion/particles.js';
import { syncMotionPreference, prefersCalm } from './ui/motion/spring.js';
import { TodayScreen } from './ui/screens/today.js';
import { RouteScreen } from './ui/screens/route.js';
import { MapScreen } from './ui/screens/mapscreen.js';
import { InsightsScreen } from './ui/screens/insights.js';
import { SettingsScreen } from './ui/screens/settings.js';
import { OnboardingScreen } from './ui/screens/onboarding.js';
import { openPropertySheet } from './ui/screens/property.js';
import { APP_VERSION } from './version.js';

const TABS = [
  { key: 'today', label: 'Today', icon: ICON.home, screen: TodayScreen },
  { key: 'route', label: 'Route', icon: ICON.list, screen: RouteScreen },
  { key: 'map', label: 'Map', icon: ICON.map, screen: MapScreen },
  { key: 'insights', label: 'Learned', icon: ICON.chart, screen: InsightsScreen },
];

class App {
  constructor() {
    this.store = store;
    this.location = locationService;
    this.weather = new WeatherService();
    this.tab = 'today';
    this.date = dateKey();
    this.dismissed = new Set();
    this.model = null;
    this.optimization = null;
    this.screen = null;
    this.booted = false;
    this._optimizeKey = null;
  }

  get settings() { return this.store.settings; }
  get crew() { return this.settings.crew; }
  get theme() { return document.documentElement.dataset.theme; }

  // ------------------------------------------------------------------- boot

  async boot() {
    this.chrome = document.getElementById('chrome');
    this.view = document.getElementById('view');
    this.tabbar = document.getElementById('tabbar');

    this.applyTheme();
    initHaptics();

    try {
      await this.store.init();
    } catch (err) {
      this.renderFatal(err);
      return;
    }

    setHapticsEnabled(this.settings.haptics);
    syncMotionPreference(this.settings.motion);
    this.applyTheme();

    if (this.settings.gpsMode !== 'off') this.location.setMode(this.settings.gpsMode);
    this.location.addEventListener('change', () => this.onLocation());

    await this.rebuildModel();

    this.store.subscribe((detail) => this.onStoreChange(detail));
    window.addEventListener('online', () => this.renderChrome());
    window.addEventListener('offline', () => this.renderChrome());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { clearEffects(); return; }
      // A day boundary can pass while the phone is in a pocket.
      if (dateKey() !== this.date) { this.date = dateKey(); this.dismissed.clear(); }
      this.refresh();
    });
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => this.applyTheme());
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => {
      syncMotionPreference(this.settings.motion);
    });

    this.booted = true;
    document.body.dataset.booted = 'true';
    this.render();
    this.weather.refresh().then(() => this.refresh()).catch(() => {});
    this.registerServiceWorker();
  }

  renderFatal(err) {
    document.body.dataset.booted = 'true';
    clear(this.view);
    this.view.appendChild(h('div.page', null,
      h('div.banner', { dataset: { tone: 'warn' } },
        h('div.ico', null, svg(ICON.warn, { size: 18 })),
        h('div', null,
          h('h4', { text: 'Local storage is unavailable' }),
          h('p', { text: err?.message || 'The device would not open the local database.' }),
          h('p', { style: { marginTop: 'var(--s3)' },
            text: 'Nothing has been lost — your data is still on the device. In Safari this is almost always Private Browsing, which blocks storage entirely. Open this app in a normal tab.' }),
          h('div.row', null,
            h('button.btn.sm.primary', { type: 'button', text: 'Try again', onclick: () => location.reload() }))))
    ));
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast({
              title: 'Update ready',
              body: 'A newer version has been downloaded.',
              action: { label: 'Reload', onAction: () => location.reload() },
              ms: 9000,
            });
          }
        });
      });
    } catch { /* offline support is a bonus, never a requirement to run */ }
  }

  // ------------------------------------------------------------------ model

  async rebuildModel() {
    try {
      const [completions, dayStarts] = await Promise.all([
        this.store.allCompletions(),
        this.store.dayStarts(),
      ]);
      const props = [...this.store.properties.values()].map((p) => ({ ...p, day: p.day }));
      this.model = buildLearningModel(props, completions, {
        today: this.date,
        dayStarts,
        depot: this.settings.depot,
      });
    } catch (e) {
      this.model = null;
      console.error('[model]', e);
    }
  }

  // ------------------------------------------------------------- derivation

  get day() { return this.store.dayFor(this.date, this.crew); }

  computeStops() {
    const raw = this.store.stopsFor(this.date, this.crew);
    return raw.map((s) => {
      const w = parseWindowFromNote(s.note);
      return {
        ...s,
        earliestMin: Number.isFinite(s.earliestMin) ? s.earliestMin : w?.earliestMin ?? null,
        latestMin: Number.isFinite(s.latestMin) ? s.latestMin : w?.latestMin ?? null,
        pushMow: s.pushMow || !!w?.pushMow,
        preferLateInWeek: s.preferLateInWeek || !!w?.preferLateInWeek,
        pinned: (this.day.pinned || []).includes(s.id),
      };
    });
  }

  buildContext() {
    const stops = this.computeStops();
    const day = this.day;
    const currentIndex = stops.findIndex((s) => s.status === STOP_STATUS.pending);
    const remaining = stops.slice(Math.max(0, currentIndex)).filter((s) => s.status === STOP_STATUS.pending);
    const completed = stops.filter((s) => s.status === STOP_STATUS.done)
      .sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));

    // Where the truck is, in descending order of confidence: a live fix, the
    // last completed stop, the shop, or — when none of those exist — the first
    // stop of the day, which at least anchors the route in the right place.
    const origin = this.location.fresh ? this.location.position
      : completed.length ? completed[completed.length - 1]
      : this.settings.depot
      || (stops.find((s) => Number.isFinite(s.lat)) ?? null);

    const forecast = forecastDay({
      stops: remaining,
      startFrom: origin,
      nowTs: Date.now(),
      model: this.model,
      returnToDepot: this.settings.returnToDepot ? this.settings.depot : null,
    });

    const startTs = day.startedAt
      || (completed.length ? completed[0].doneAt - (this.model?.global?.minutes ?? 15) * 60000 : null);
    const pace = completed.length && startTs
      ? paceToday({ completed, model: this.model, dayStartTs: startTs, nowTs: Date.now() })
      : null;

    this.maybeOptimize(remaining, origin);

    const insights = buildInsights({
      stops, currentIndex, model: this.model, location: this.location,
      forecast, pace, optimization: this.optimization,
      dismissed: this.dismissed,
      weather: this.settings.mapTiles === 'none' ? null : this.weather,
      thresholdMin: this.settings.optimizeThresholdMin,
    }).filter((i) => this.settings.arrivalAssist || !i.id.startsWith('arrive:'));

    this.location.setTargets(remaining.slice(0, 3));

    return {
      store: this.store, settings: this.settings, model: this.model,
      location: this.location, weather: this.weather, theme: this.theme,
      date: this.date, crew: this.crew, day, stops, currentIndex,
      forecast, pace, insights, optimization: this.optimization,
      // actions
      completeStop: (s, el) => this.completeStop(s, el),
      setStatus: (s, st) => this.setStatus(s, st),
      navigate: (s) => this.navigate(s),
      openProperty: (s) => this.openProperty(s),
      goTo: (t) => this.goTo(t),
      selectOnMap: (s) => { this.pendingMapSelection = s; },
      moveStop: (from, to) => this.moveStop(from, to),
      applyOptimization: () => this.applyOptimization(),
      revertOrder: () => this.revertOrder(),
      dismissInsight: (id) => { this.dismissed.add(id); this.refresh(); },
      runInsightAction: (i, a, el) => this.runInsightAction(i, a, el),
      updateSettings: (p) => this.updateSettings(p),
      requestLocation: () => this.requestLocation(),
      refresh: () => this.refresh(),
      reload: () => this.reload(),
      loadDemo: () => this.loadDemo(),
      showRestoreReport: (r) => this.showRestoreReport(r),
    };
  }

  /**
   * Recomputes the optimisation proposal, but only when the thing being
   * optimised has actually changed. Recomputing on every render would be both
   * wasteful and unstable — the proposal would flicker as the GPS position
   * jitters, and a suggestion that appears and disappears is worse than none.
   */
  maybeOptimize(remaining, origin) {
    if (remaining.length < 3) { this.optimization = null; return; }
    const key = [
      remaining.map((s) => s.id).join(','),
      this.settings.returnToDepot,
      origin ? `${origin.lat?.toFixed(3)},${origin.lng?.toFixed(3)}` : 'none',
    ].join('|');
    if (key === this._optimizeKey) return;
    this._optimizeKey = key;

    const startMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    try {
      this.optimization = optimizeRoute({
        origin,
        stops: remaining,
        startMinutes,
        serviceOf: (s) => serviceMinutesFor(this.model, s),
        travelModel: this.model?.travel,
        depot: this.settings.depot,
        returnToDepot: this.settings.returnToDepot && !!this.settings.depot,
        stability: 0.45,
        timeBudgetMs: 45,
      });
    } catch (e) {
      this.optimization = null;
      console.error('[optimize]', e);
    }
  }

  // ---------------------------------------------------------------- actions

  /**
   * The completion.
   *
   * Order matters and is deliberate: the state is committed first, the
   * feedback is played over it. If the write were to fail, the store rolls
   * memory back and the screen follows — but the operator has already seen the
   * response, so the interface never feels like it is waiting on a disk.
   */
  async completeStop(stop, buttonEl) {
    if (!stop || stop.status === STOP_STATUS.done) return;
    haptic('success');
    if (buttonEl && !prefersCalm()) {
      try { burst(buttonEl.getBoundingClientRect(),
        cssVar('--accent'), cssVar('--accent-bright')); } catch { /* effects are optional */ }
    }
    const res = await this.store.completeStop(stop.id, { date: this.date, crew: this.crew });
    if (!res.ok) { reportError(res.error, stop.address); return; }
    if (res.already) return;

    const remaining = this.computeStops().filter((s) => s.status === STOP_STATUS.pending).length;
    toast({
      key: 'complete',
      title: `${stop.address} done`,
      body: remaining ? `${remaining} stop${remaining === 1 ? '' : 's'} to go.` : 'That is the whole route.',
      action: { label: 'Undo', onAction: () => this.undo() },
    });
  }

  async setStatus(stop, status) {
    haptic(status === STOP_STATUS.pending ? 'tap' : 'warn');
    const res = await this.store.setStopStatus(stop.id, status, { date: this.date, crew: this.crew });
    if (!res.ok) { reportError(res.error, stop.address); return; }
    const label = status === STOP_STATUS.skipped ? 'Skipped'
      : status === STOP_STATUS.pushed ? 'Pushed to the next visit'
      : status === STOP_STATUS.done ? 'Marked done' : 'Reopened';
    toast({
      key: 'status', title: `${stop.address}`, body: label,
      action: { label: 'Undo', onAction: () => this.undo() },
    });
  }

  async undo() {
    const res = await this.store.undo();
    if (!res.ok) return;
    haptic('tap');
  }

  navigate(stop) {
    const app = this.settings.navApp;
    if (app === 'ask') { this.askNavApp(stop); return; }
    const res = navigateTo(stop, app);
    if (!res.ok) { toast({ title: 'Cannot navigate there yet', body: res.reason, tone: 'error' }); return; }
    haptic('tap');
  }

  askNavApp(stop) {
    openSheet({
      title: 'Open directions in',
      subtitle: stop.address,
      content: h('div', { style: { display: 'grid', gap: 'var(--s3)' } },
        ...NAV_APPS.filter((a) => a.key !== 'ask').map((a) =>
          h('button.btn', { type: 'button', onclick: () => { closeSheet(); navigateTo(stop, a.key); } },
            svg(ICON.nav, { size: 19 }), a.label))),
    });
  }

  openProperty(stop) {
    if (!stop) return;
    haptic('tap');
    openPropertySheet(this.buildContext(), stop);
  }

  async moveStop(from, to) {
    const order = [...this.day.order];
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    const res = await this.store.reorderDay(order, { date: this.date, crew: this.crew });
    if (!res.ok) { reportError(res.error, 'reorder'); return; }
    this._optimizeKey = null;
    toast({
      key: 'reorder', title: 'Route reordered', body: 'Your master route is unchanged.',
      action: { label: 'Undo', onAction: () => this.undo() },
    });
  }

  async applyOptimization() {
    const opt = this.optimization;
    if (!opt?.changed) return;
    const stops = this.computeStops();
    const remaining = stops.filter((s) => s.status === STOP_STATUS.pending);
    const reordered = opt.order.map((i) => remaining[i].id);

    // Completed and skipped stops keep their achieved positions; only the
    // pending tail is rewritten.
    const newOrder = [];
    let k = 0;
    for (const id of this.day.order) {
      if (remaining.some((r) => r.id === id)) newOrder.push(reordered[k++]);
      else newOrder.push(id);
    }

    haptic('optimize');
    const res = await this.store.reorderDay(newOrder, {
      date: this.date, crew: this.crew, source: 'optimize',
      meta: { savedMinutes: opt.savedMinutes, moved: opt.moved.length },
    });
    if (!res.ok) { reportError(res.error, 'optimize'); return; }
    this._optimizeKey = null;
    this.optimization = null;
    toast({
      key: 'optimize',
      title: `Reordered — about ${formatDuration(opt.savedMinutes)} saved`,
      body: `${opt.moved.length} stops moved. Master route kept.`,
      action: { label: 'Undo', onAction: () => this.undo() },
      ms: 7000,
    });
  }

  async revertOrder() {
    const res = await this.store.revertOrder({ date: this.date, crew: this.crew });
    if (!res.ok) { reportError(res.error, 'restore order'); return; }
    this._optimizeKey = null;
    haptic('tap');
    toast({ title: 'Master route restored', action: { label: 'Undo', onAction: () => this.undo() } });
  }

  runInsightAction(insight, action, el) {
    this.dismissed.add(insight.id);
    if (action.kind === 'complete') {
      const stop = this.computeStops().find((s) => s.id === action.propertyId);
      if (stop) this.completeStop(stop, el);
    } else if (action.kind === 'skip') {
      const stop = this.computeStops().find((s) => s.id === action.propertyId);
      if (stop) this.setStatus(stop, STOP_STATUS.skipped);
    } else if (action.kind === 'apply-optimization') {
      this.applyOptimization();
    } else {
      this.refresh();
    }
  }

  requestLocation() {
    if (this.settings.gpsMode === 'off') {
      this.updateSettings({ gpsMode: 'balanced' });
      this.location.setMode('balanced');
    }
    this.location.boost();
    toast({ title: 'Looking for a GPS fix', body: this.location.describe() });
  }

  async updateSettings(patch) {
    const res = await this.store.updateSettings(patch);
    if (!res.ok) { reportError(res.error, 'settings'); return; }
    if ('haptics' in patch) setHapticsEnabled(patch.haptics);
    if ('motion' in patch) syncMotionPreference(patch.motion);
    if ('theme' in patch) this.applyTheme();
    if ('crew' in patch) { this._optimizeKey = null; await this.rebuildModel(); }
    if ('returnToDepot' in patch || 'optimizeThresholdMin' in patch) this._optimizeKey = null;
    this.refresh();
  }

  async loadDemo() {
    const props = buildDemoProperties();
    await this.store.replaceProperties(props, { label: 'Demo route', at: Date.now(), demo: true });
    await this.store.importEvents(buildDemoEvents(props));
    await this.reload();
  }

  showRestoreReport(report) {
    const settings = new SettingsScreen(this.buildContext());
    settings.ctx = this.buildContext();
    settings.showRestoreReport(report);
  }

  async reload() {
    await this.store.init();
    setHapticsEnabled(this.settings.haptics);
    syncMotionPreference(this.settings.motion);
    this.applyTheme();
    this._optimizeKey = null;
    this.dismissed.clear();
    await this.rebuildModel();
    this.render();
  }

  // ----------------------------------------------------------------- render

  applyTheme() {
    const pref = this.store?.settings?.theme ?? 'auto';
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
    const theme = pref === 'auto' ? (dark ? 'night' : 'day') : pref;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'day' ? '#eef1ec' : '#0a0e0c';
  }

  onStoreChange(detail) {
    if (detail.reason === 'write-failed') { reportError(detail.error); this.refresh(); return; }
    if (detail.reason === 'complete' || detail.reason === 'status' || detail.reason === 'undo') {
      this._optimizeKey = null;
      // The learning model changes with every completion, but rebuilding it is
      // a full pass over the event log — debounced so a fast run of Done taps
      // does not rebuild it five times.
      clearTimeout(this._modelTimer);
      this._modelTimer = setTimeout(() => this.rebuildModel().then(() => this.refresh()), 900);
    }
    this.refresh();
  }

  onLocation() {
    if (this.tab === 'map' || this.tab === 'today') this.refresh();
    this.renderChrome();
  }

  goTo(tab) {
    if (this.tab === tab) return;
    haptic('select');
    this.tab = tab;
    this.render();
  }

  render() {
    this.renderChrome();
    this.renderTabs();
    this.renderScreen();
  }

  renderScreen() {
    const ctx = this.buildContext();
    const needsOnboarding = this.store.properties.size === 0;
    const Screen = needsOnboarding ? OnboardingScreen
      : this.tab === 'settings' ? SettingsScreen
      : (TABS.find((t) => t.key === this.tab) || TABS[0]).screen;

    if (this.screen?.constructor !== Screen) {
      this.screen?.unmount();
      clear(this.view);
      this.view.scrollTop = 0;
      this.screen = new Screen(ctx);
      this.screen.mount(this.view);
      if (this.pendingMapSelection && this.screen.select) {
        this.screen.select(this.pendingMapSelection);
        this.pendingMapSelection = null;
      }
    } else {
      this.screen.ctx = ctx;
      this.screen.update();
    }
  }

  refresh() {
    if (!this.booted) return;
    this.renderChrome();
    this.renderTabs();
    if (!this.screen) { this.renderScreen(); return; }
    const needsOnboarding = this.store.properties.size === 0;
    const expected = needsOnboarding ? OnboardingScreen
      : this.tab === 'settings' ? SettingsScreen
      : (TABS.find((t) => t.key === this.tab) || TABS[0]).screen;
    if (this.screen.constructor !== expected) { this.renderScreen(); return; }
    this.screen.ctx = this.buildContext();
    this.screen.update();
  }

  renderChrome() {
    const stops = this.store.properties.size ? this.computeStops() : [];
    const remaining = stops.filter((s) => s.status === STOP_STATUS.pending).length;
    const offline = !navigator.onLine;
    const gps = this.location.state;

    clear(this.chrome);
    this.chrome.appendChild(h('div.chrome-row', null,
      h('div.daymark', null,
        h('div.dow', null,
          h('span', { text: DAY_FULL[weekdayOf(this.date)] || 'Today' }),
          h('span.livepill', {
            dataset: { state: offline ? 'offline' : remaining ? 'live' : 'idle' },
          },
            h('span.dot'),
            offline ? 'Offline' : remaining ? `${remaining} left` : 'Clear')
        ),
        h('div.date', { text: `${formatDateHuman(this.date)} · ${this.crew === 'south' ? 'South crew' : 'East crew'}${gps === 'live' ? '' : gps === 'denied' ? ' · GPS off' : ''}` })
      ),
      this.store.canUndo
        ? h('button.iconbtn', {
            type: 'button', 'aria-label': `Undo ${this.store.nextUndoLabel}`,
            onclick: () => this.undo(),
          }, svg(ICON.undo, { size: 20 }))
        : null,
      h('button.iconbtn', {
        type: 'button', 'aria-label': 'Settings',
        dataset: { on: String(this.tab === 'settings') },
        onclick: () => this.goTo(this.tab === 'settings' ? 'today' : 'settings'),
      }, svg(ICON.gear, { size: 20 }))
    ));
  }

  renderTabs() {
    const stops = this.store.properties.size ? this.computeStops() : [];
    const remaining = stops.filter((s) => s.status === STOP_STATUS.pending).length;
    reconcile(this.tabbar, TABS, (t) => t.key,
      (t) => {
        const el = h('button.tab', {
          type: 'button', role: 'tab',
          'aria-selected': String(this.tab === t.key),
          onclick: () => this.goTo(t.key),
        }, svg(t.icon, { size: 23 }), h('span', { text: t.label }));
        return el;
      },
      (el, t) => {
        el.setAttribute('aria-selected', String(this.tab === t.key));
        const badge = el.querySelector('.badge');
        if (t.key === 'today' && remaining) {
          if (badge) badge.textContent = String(remaining);
          else el.appendChild(h('span.badge', { text: String(remaining) }));
        } else if (badge) badge.remove();
      });
  }
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const app = new App();
window.__teds = app;   // the one global, for diagnostics and end-to-end tests
app.boot();
