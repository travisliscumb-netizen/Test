/**
 * The persisted shape, in one place.
 *
 * This version of the app is single-device on purpose, but the model is
 * deliberately sync-ready: every record has a stable string id and an
 * `updatedAt`, and every state change is also written to an append-only event
 * log. Those two properties are what a later multi-device rebuild needs in
 * order to merge, and they cost nothing now. What is *not* here — accounts,
 * ownership, tenancy, device identity — is absent on purpose.
 */

export const SCHEMA_VERSION = 3;
export const BACKUP_FORMAT = 'teds-route-backup';

export const STOP_STATUS = {
  pending: 'pending',
  done: 'done',
  skipped: 'skipped',
  pushed: 'pushed',
};

export const GEO_SOURCE = {
  manual: 'manual',       // a human dropped this pin; nothing may overwrite it
  imported: 'imported',   // carried over from a previous version's edits
  geocoded: 'geocoded',   // official address-point lookup
  seed: 'seed',           // shipped with the route list
  none: 'none',
};

/** Precedence for coordinate provenance. Higher wins. */
const GEO_RANK = { none: 0, seed: 1, geocoded: 2, imported: 3, manual: 4 };

/**
 * Decides whether an incoming coordinate may replace an existing one.
 * A field-confirmed pin outranks every automated source, permanently — that
 * rule is the whole reason the operator can trust correcting a bad marker.
 */
export function shouldReplaceGeo(existingSource, incomingSource) {
  return (GEO_RANK[incomingSource] ?? 0) > (GEO_RANK[existingSource] ?? 0);
}

export function makeProperty(init = {}) {
  const now = Date.now();
  return {
    id: init.id,
    address: init.address ?? '',
    city: init.city ?? 'Barrie',
    crew: init.crew ?? 'south',
    day: init.day ?? 'Mon',
    note: init.note ?? '',
    lat: Number.isFinite(init.lat) ? init.lat : null,
    lng: Number.isFinite(init.lng) ? init.lng : null,
    geoSource: init.geoSource ?? GEO_SOURCE.none,
    geoAccuracyM: init.geoAccuracyM ?? null,
    order: Number.isFinite(init.order) ? init.order : 0,
    active: init.active !== false,
    inactiveReason: init.inactiveReason ?? null,
    pushMow: !!init.pushMow,
    serviceOverrideMin: Number.isFinite(init.serviceOverrideMin) ? init.serviceOverrideMin : null,
    earliestMin: Number.isFinite(init.earliestMin) ? init.earliestMin : null,
    latestMin: Number.isFinite(init.latestMin) ? init.latestMin : null,
    preferLateInWeek: !!init.preferLateInWeek,
    needsLocationReview: !!init.needsLocationReview,
    legacyId: init.legacyId ?? init.id,
    createdAt: init.createdAt ?? now,
    updatedAt: init.updatedAt ?? now,
  };
}

export function makeDay(init = {}) {
  return {
    date: init.date,
    week: init.week,
    weekday: init.weekday,
    crew: init.crew ?? 'south',
    startedAt: init.startedAt ?? null,
    finishedAt: init.finishedAt ?? null,
    order: init.order ?? [],
    masterOrder: init.masterOrder ?? (init.order ? [...init.order] : []),
    stops: init.stops ?? {},
    optimizations: init.optimizations ?? [],
    pinned: init.pinned ?? [],
    updatedAt: init.updatedAt ?? Date.now(),
  };
}

export const DEFAULT_SETTINGS = {
  crew: 'south',
  startTime: '07:30',
  returnToDepot: true,
  navApp: 'apple',                 // apple | google | waze | ask
  theme: 'auto',                   // auto | night | day
  motion: 'full',                  // full | calm  (calm is also forced by the OS setting)
  textSize: 'standard',            // standard | large | larger
  haptics: true,
  gpsMode: 'balanced',             // off | balanced | precise
  arrivalAssist: true,
  autoOptimizePrompt: true,
  optimizeThresholdMin: 6,         // never interrupt for less than this
  mapTiles: 'carto',               // carto | osm | none
  // The shop is the operator's own address: it is customer/personal data and
  // is never shipped in the program. It arrives with the route file, or is set
  // from the current position in Settings. Everything that uses it degrades
  // gracefully when it is null.
  depot: null,
  units: 'metric',
};

export const META_KEYS = {
  settings: 'settings',
  schema: 'schema',
  learning: 'learning',
  dataOrigin: 'dataOrigin',
};
