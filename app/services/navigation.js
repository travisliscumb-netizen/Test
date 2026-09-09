/**
 * Navigation handoff.
 *
 * Always by coordinate, never by address text. Handing "62 Sorrelwood Pl" to a
 * maps app asks it to geocode a string that this app has already resolved to a
 * confirmed pin, and re-geocoding is exactly how a driver ends up on the wrong
 * Sorrelwood. The address is passed only as a display label.
 */

const BUILDERS = {
  apple(stop) {
    const q = `${stop.lat},${stop.lng}`;
    const label = encodeURIComponent(stop.address || 'Stop');
    return {
      url: `https://maps.apple.com/?daddr=${q}&dirflg=d&t=m&q=${label}`,
      scheme: `maps://?daddr=${q}&dirflg=d`,
      name: 'Apple Maps',
    };
  },
  google(stop) {
    const q = `${stop.lat},${stop.lng}`;
    return {
      url: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
      scheme: `comgooglemaps://?daddr=${q}&directionsmode=driving`,
      name: 'Google Maps',
    };
  },
  waze(stop) {
    return {
      url: `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`,
      scheme: `waze://?ll=${stop.lat},${stop.lng}&navigate=yes`,
      name: 'Waze',
    };
  },
};

export const NAV_APPS = [
  { key: 'apple', label: 'Apple Maps' },
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  { key: 'ask', label: 'Ask each time' },
];

export function canNavigate(stop) {
  return !!stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

export function buildLink(stop, app = 'apple') {
  if (!canNavigate(stop)) return null;
  return (BUILDERS[app] || BUILDERS.apple)(stop);
}

/**
 * Opens the destination.
 *
 * The custom scheme is tried first because it goes straight into the installed
 * app rather than through the browser, but a scheme that is not installed
 * fails silently on iOS — so the https form is armed as a fallback and
 * cancelled if the page is actually backgrounded, which is the observable
 * signal that the app took over.
 */
export function navigateTo(stop, app = 'apple') {
  const link = buildLink(stop, app);
  if (!link) return { ok: false, reason: 'This property has no confirmed location, so it cannot be navigated to yet.' };

  let handedOff = false;
  const onHide = () => { handedOff = true; };
  document.addEventListener('visibilitychange', onHide, { once: true });
  window.addEventListener('pagehide', onHide, { once: true });

  try { window.location.href = link.scheme; } catch { /* scheme unsupported */ }

  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    if (!handedOff && document.visibilityState === 'visible') {
      window.open(link.url, '_blank', 'noopener');
    }
  }, 700);

  return { ok: true, app: link.name };
}
