/**
 * Haptics.
 *
 * The honest position, because pretending otherwise would produce an interface
 * that feels broken on the target device: **iOS Safari does not implement the
 * Vibration API.** `navigator.vibrate` is absent, and there is no web API that
 * drives the Taptic Engine directly.
 *
 * There is exactly one documented, non-hacky-adjacent route: since iOS 17.4,
 * toggling a `<input type="checkbox" switch>` through a real user gesture
 * produces a system haptic. That is used here, feature-detected, off the
 * critical path, and never depended upon — if it does nothing, nothing breaks.
 *
 * Everywhere else (Android, desktop Chrome) `navigator.vibrate` is used with
 * patterns chosen so the *kinds* of feedback are distinguishable by feel:
 * a completion is not the same shape as a warning.
 *
 * Because tactile feedback cannot be guaranteed, every haptic in this app is
 * paired with a visual response that carries the same information on its own.
 */

const PATTERNS = {
  tap: 8,
  select: [6],
  success: [14, 34, 22],
  warn: [26, 44, 26],
  error: [40, 60, 40, 60, 40],
  lift: 12,
  drop: [10, 24, 10],
  optimize: [10, 30, 10, 30, 24],
};

let enabled = true;
let switchEl = null;
let iosSwitchSupported = false;
let lastAt = 0;

export function initHaptics(root = document.body) {
  try {
    const el = document.createElement('input');
    el.type = 'checkbox';
    // Safari reflects an unknown attribute as ignored; the property is the tell.
    el.setAttribute('switch', '');
    // The switch haptic exists only on Apple touch devices running iOS 17.4+.
    // iPads report as "MacIntel" with touch points, hence the second clause.
    const platform = navigator.platform || '';
    const appleTouch =
      /iP(hone|ad|od)/.test(platform) ||
      (/Mac/.test(platform) && (navigator.maxTouchPoints || 0) > 1);
    iosSwitchSupported = appleTouch && el.matches('input[switch]');
    if (iosSwitchSupported) {
      el.className = 'sr';
      el.setAttribute('aria-hidden', 'true');
      el.tabIndex = -1;
      root.appendChild(el);
      switchEl = el;
    }
  } catch { iosSwitchSupported = false; }
  return { vibrate: typeof navigator.vibrate === 'function', iosSwitch: iosSwitchSupported };
}

export function setHapticsEnabled(on) { enabled = !!on; }

/**
 * Fires one haptic. Rate-limited: a burst of completions tapped in quick
 * succession should feel like taps, not like a phone alarm.
 */
export function haptic(kind = 'tap') {
  if (!enabled) return false;
  const now = performance.now();
  if (now - lastAt < 55) return false;
  lastAt = now;

  const pattern = PATTERNS[kind] ?? PATTERNS.tap;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
      return true;
    }
  } catch { /* blocked by policy */ }

  if (switchEl) {
    try {
      // Must run inside the user gesture that triggered it; callers do.
      switchEl.checked = !switchEl.checked;
      switchEl.dispatchEvent(new Event('change'));
      return true;
    } catch { /* ignore */ }
  }
  return false;
}

export function hapticsCapability() {
  if (typeof navigator.vibrate === 'function') return 'vibration';
  if (iosSwitchSupported) return 'ios-switch';
  return 'none';
}
