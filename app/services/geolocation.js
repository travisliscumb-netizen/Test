/**
 * Location.
 *
 * Two constraints pull against each other: the operator wants the map to know
 * where the truck is, and the phone has to survive a ten-hour day. A naive
 * `watchPosition({enableHighAccuracy:true})` left running is one of the most
 * expensive things a web page can do to a battery.
 *
 * So accuracy is spent, not assumed:
 *   - coarse tracking by default, which is enough to place the truck on a
 *     street and to compute distance-to-next
 *   - high accuracy only in the last few hundred metres of the approach, or
 *     for a few seconds when the operator explicitly asks
 *   - tracking suspends whenever the page is hidden, and resumes on return
 *
 * Nothing here ever completes work. A GPS fix is evidence, and evidence with
 * a 190 m error is not evidence of standing on a particular lawn.
 */

import { haversineKm } from '../core/geo.js';

export const GPS_STATE = {
  off: 'off',
  prompt: 'prompt',
  denied: 'denied',
  unavailable: 'unavailable',
  searching: 'searching',
  live: 'live',
  stale: 'stale',
};

/** Beyond this the fix cannot distinguish one property from its neighbours. */
export const USEFUL_ACCURACY_M = 65;
/** A fix older than this is history, not position. */
export const STALE_AFTER_MS = 90_000;

export class LocationService extends EventTarget {
  constructor() {
    super();
    this.state = GPS_STATE.off;
    this.position = null;
    this.error = null;
    this.mode = 'balanced';
    this._watchId = null;
    this._highUntil = 0;
    this._targets = [];
    this._onVisibility = this._onVisibility.bind(this);
  }

  get available() { return typeof navigator !== 'undefined' && 'geolocation' in navigator; }

  get fresh() {
    return this.position && Date.now() - this.position.at < STALE_AFTER_MS;
  }

  /** Human-readable reason the app is or is not offering location features. */
  describe() {
    switch (this.state) {
      case GPS_STATE.off: return 'Location is off. The map will still show the route, just not where you are.';
      case GPS_STATE.denied: return 'Location permission was declined. Distance-to-next and arrival hints are unavailable until it is allowed in Settings.';
      case GPS_STATE.unavailable: return 'This device did not provide a location.';
      case GPS_STATE.searching: return 'Looking for a GPS fix…';
      case GPS_STATE.stale: return `Last fix was ${Math.round((Date.now() - this.position.at) / 1000)}s ago.`;
      case GPS_STATE.live: return `Located to about ${Math.round(this.position.accuracy)} m.`;
      default: return '';
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'off') this.stop();
    else this.start();
  }

  start() {
    if (!this.available) { this._set(GPS_STATE.unavailable); return; }
    if (this.mode === 'off') return;
    if (this._watchId != null) return;
    this._set(this.position ? this.state : GPS_STATE.searching);
    document.addEventListener('visibilitychange', this._onVisibility);
    this._spawn();
  }

  _spawn() {
    const high = this.mode === 'precise' || Date.now() < this._highUntil;
    try {
      this._watchId = navigator.geolocation.watchPosition(
        (p) => this._accept(p),
        (e) => this._reject(e),
        {
          enableHighAccuracy: high,
          maximumAge: high ? 2000 : 25_000,
          timeout: 30_000,
        }
      );
    } catch (e) {
      this._reject(e);
    }
  }

  /** Re-arms high accuracy for a short window, then drops back down. */
  boost(ms = 25_000) {
    this._highUntil = Date.now() + ms;
    if (this._watchId != null) { this.stop(true); this.start(); }
    else this.start();
    setTimeout(() => {
      if (Date.now() >= this._highUntil && this._watchId != null && this.mode !== 'precise') {
        this.stop(true); this.start();
      }
    }, ms + 500);
  }

  stop(keepListeners = false) {
    if (this._watchId != null) {
      try { navigator.geolocation.clearWatch(this._watchId); } catch { /* already gone */ }
      this._watchId = null;
    }
    if (!keepListeners) {
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._set(GPS_STATE.off);
    }
  }

  _onVisibility() {
    if (document.visibilityState === 'hidden') this.stop(true);
    else if (this.mode !== 'off') this.start();
  }

  _accept(p) {
    this.error = null;
    this.position = {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy ?? null,
      heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
      speed: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
      at: p.timestamp || Date.now(),
    };
    this._set(GPS_STATE.live);
    this._maybeBoost();
  }

  _reject(e) {
    this.error = e;
    if (e?.code === 1) this._set(GPS_STATE.denied);
    else if (e?.code === 2) this._set(GPS_STATE.unavailable);
    else if (e?.code === 3 && this.position) this._set(GPS_STATE.stale);
    else this._set(GPS_STATE.unavailable);
  }

  _set(state) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('change', { detail: { state, position: this.position, error: this.error } }));
  }

  /** Tells the service where the next stops are, so it can spend accuracy well. */
  setTargets(points) { this._targets = points.filter((p) => Number.isFinite(p?.lat)); }

  _maybeBoost() {
    if (this.mode !== 'balanced' || !this.position || !this._targets.length) return;
    const near = this._targets.some((t) => haversineKm(this.position, t) < 0.4);
    if (near && Date.now() > this._highUntil) this.boost(40_000);
  }

  /**
   * Whether the current fix is good enough to claim the operator is at a stop.
   * Returns a reason when it is not, so the interface can explain its silence
   * instead of merely being silent.
   */
  arrivalVerdict(target) {
    if (!target || !Number.isFinite(target.lat)) {
      return { ok: false, reason: 'This property has no confirmed location yet.' };
    }
    if (!this.position) return { ok: false, reason: 'No GPS fix yet.' };
    if (!this.fresh) return { ok: false, reason: 'The last GPS fix is too old to rely on.' };
    const acc = this.position.accuracy ?? 9999;
    if (acc > USEFUL_ACCURACY_M) {
      // The accuracy has to travel with the verdict: the interface uses it to
      // explain *why* arrival hints have gone quiet, and without it the
      // explanation silently never renders.
      return {
        ok: false,
        accuracy: acc,
        reason: `GPS accuracy is only ${Math.round(acc)} m, which cannot tell this property from its neighbours.`,
      };
    }
    const metres = haversineKm(this.position, target) * 1000;
    const threshold = Math.max(45, acc * 1.5);
    return {
      ok: metres <= threshold,
      metres,
      accuracy: acc,
      reason: metres <= threshold ? null : `You are about ${Math.round(metres)} m away.`,
    };
  }

  distanceKmTo(target) {
    if (!this.position || !target || !Number.isFinite(target.lat)) return null;
    return haversineKm(this.position, target);
  }
}

export const locationService = new LocationService();
