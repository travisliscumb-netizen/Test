/**
 * Time handling.
 *
 * Every stored instant is an epoch millisecond number. Every *day* is a local
 * civil date string (YYYY-MM-DD) resolved in the operator's timezone, because
 * "which day's route is this" is a civil-calendar question, not a UTC one.
 * Mixing the two is the classic source of routes appearing on the wrong day
 * either side of midnight, so the conversion lives here and nowhere else.
 */

export const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DAY_FULL = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday',
  Sat: 'Saturday', Sun: 'Sunday',
};
const JS_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local civil date key for an instant. */
export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Weekday key ('Mon'…'Sun') for an instant or a date key. */
export function weekdayOf(tsOrKey = Date.now()) {
  const d = typeof tsOrKey === 'string' ? parseDateKey(tsOrKey) : new Date(tsOrKey);
  return JS_DAY[d.getDay()];
}

/** Parses YYYY-MM-DD as local midnight (never UTC — see module note). */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Local midnight epoch ms for a date key. */
export function startOfDay(key) {
  return parseDateKey(key).getTime();
}

/** Monday date key of the week containing the given instant/key. */
export function weekOf(tsOrKey = Date.now()) {
  const d = typeof tsOrKey === 'string' ? parseDateKey(tsOrKey) : new Date(tsOrKey);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return dateKey(d.getTime());
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d.getTime());
}

/** "07:30" -> minutes after local midnight. */
export function parseClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Minutes after midnight -> epoch ms on the given date key. */
export function clockToTs(dateK, minutes) {
  return startOfDay(dateK) + minutes * 60000;
}

/** Short 12-hour clock, the way it reads on a phone at a glance. */
export function formatClock(ts) {
  if (!Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

/** Compact duration: 47m, 3h 10m. Never "0h 47m". */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const sign = minutes < 0 ? '-' : '';
  const t = Math.abs(Math.round(minutes));
  if (t < 60) return `${sign}${t}m`;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

export function formatDateHuman(key) {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function daysBetween(aKey, bKey) {
  return Math.round((startOfDay(bKey) - startOfDay(aKey)) / 86400000);
}
