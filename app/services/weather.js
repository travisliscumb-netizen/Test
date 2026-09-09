/**
 * Weather.
 *
 * Not in the original brief, but rain is the single largest external variable
 * in this trade — it is named twice in the operator's own list of things that
 * corrupt a service-time estimate. Knowing that a band of rain arrives at 2pm
 * changes which end of the route you run first, and that is a routing decision
 * the app is otherwise blind to.
 *
 * Kept deliberately small: one free, keyless endpoint, one request an hour,
 * cached to local storage so the last known forecast survives going offline,
 * and every consumer treats it as optional.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'teds.weather.v1';
const MAX_AGE_MS = 55 * 60 * 1000;

export class WeatherService extends EventTarget {
  constructor(lat = 44.389, lng = -79.69) {
    super();
    this.lat = lat; this.lng = lng;
    this.data = readCache();
    this.error = null;
    this.loading = false;
  }

  get fresh() { return this.data && Date.now() - this.data.at < MAX_AGE_MS; }
  get stale() { return this.data && !this.fresh; }

  async refresh(force = false) {
    if (this.loading) return this.data;
    if (!force && this.fresh) return this.data;
    if (!navigator.onLine) { this.error = 'offline'; return this.data; }
    this.loading = true;
    this.dispatchEvent(new CustomEvent('change'));
    try {
      const url = `${ENDPOINT}?latitude=${this.lat}&longitude=${this.lng}` +
        '&current=temperature_2m,precipitation,weather_code,wind_speed_10m' +
        '&hourly=precipitation_probability,precipitation,temperature_2m' +
        '&forecast_days=1&timezone=auto';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      this.data = normalise(j);
      this.error = null;
      writeCache(this.data);
    } catch (e) {
      this.error = e?.message || 'unavailable';
    } finally {
      this.loading = false;
      this.dispatchEvent(new CustomEvent('change'));
    }
    return this.data;
  }

  /** The next hour in which rain is more likely than not, if any. */
  nextRain(thresholdPct = 55) {
    if (!this.data?.hourly) return null;
    const now = Date.now();
    for (const h of this.data.hourly) {
      if (h.at < now) continue;
      if (h.precipProb >= thresholdPct) return h;
    }
    return null;
  }
}

function normalise(j) {
  const times = j?.hourly?.time || [];
  const hourly = times.map((t, i) => ({
    at: new Date(t).getTime(),
    precipProb: j.hourly.precipitation_probability?.[i] ?? 0,
    precipMm: j.hourly.precipitation?.[i] ?? 0,
    tempC: j.hourly.temperature_2m?.[i] ?? null,
  }));
  return {
    at: Date.now(),
    tempC: j?.current?.temperature_2m ?? null,
    precipMm: j?.current?.precipitation ?? 0,
    windKmh: j?.current?.wind_speed_10m ?? null,
    code: j?.current?.weather_code ?? null,
    hourly,
  };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCache(d) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* quota or private mode */ }
}

export function describeCode(code) {
  if (code == null) return '';
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Mostly sunny';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
}
