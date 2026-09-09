/**
 * Backup and restore.
 *
 * The rule this module exists to enforce: a restore never touches stored data
 * until the incoming file has been fully parsed, structurally validated,
 * checksum-verified and counted, and the operator has seen what it contains.
 * A malformed backup must be rejected with a specific reason, not applied
 * halfway and abandoned.
 *
 * `inspect()` is pure — it reads a file and returns a report. `apply()` is the
 * only function that writes, and it refuses any report that did not pass.
 */

import { SCHEMA_VERSION, BACKUP_FORMAT, DEFAULT_SETTINGS, STOP_STATUS } from './schema.js';
import { inServiceRegion } from '../core/geo.js';
import { APP_VERSION } from '../version.js';

/** FNV-1a over the canonical payload. Cheap, stable, and enough to catch a truncated or edited file. */
export function checksum(obj) {
  const s = canonical(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    if (s.charCodeAt(i) > 255) {
      h ^= (s.charCodeAt(i) >> 8) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

/** Key-sorted JSON so the checksum does not depend on property insertion order. */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

export function buildBackup({ properties, days, events, settings, dataOrigin }) {
  const payload = {
    properties: properties ?? [],
    days: days ?? [],
    events: events ?? [],
    settings: settings ?? DEFAULT_SETTINGS,
    dataOrigin: dataOrigin ?? null,
  };
  const now = Date.now();
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: now,
    createdAtLocal: new Date(now).toLocaleString(),
    counts: {
      properties: payload.properties.length,
      days: payload.days.length,
      events: payload.events.length,
    },
    checksum: checksum(payload),
    ...payload,
  };
}

export function backupFilename(at = Date.now()) {
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, '0');
  return `teds-route-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Reads and validates a candidate backup. Always resolves — a rejection is
 * reported as `ok:false` with an explanation the operator can act on, because
 * "Something went wrong" while holding the only copy of a season of work is
 * not an acceptable thing to show anyone.
 */
export async function inspect(fileOrText) {
  const report = {
    ok: false, errors: [], warnings: [], counts: {}, meta: {}, data: null,
  };

  let text;
  try {
    if (typeof fileOrText === 'string') {
      text = fileOrText;
    } else {
      if (fileOrText.size > MAX_BYTES) {
        report.errors.push({
          code: 'too-large',
          message: `That file is ${(fileOrText.size / 1048576).toFixed(0)} MB. A route backup is normally under 5 MB, so this is very unlikely to be one.`,
        });
        return report;
      }
      text = await fileOrText.text();
      report.meta.filename = fileOrText.name;
      report.meta.bytes = fileOrText.size;
    }
  } catch (e) {
    report.errors.push({ code: 'unreadable', message: 'The file could not be read from the device.', detail: String(e?.message || e) });
    return report;
  }

  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const m = /position (\d+)/.exec(String(e?.message || ''));
    report.errors.push({
      code: 'not-json',
      message: m
        ? `This file is not valid JSON — it breaks at character ${m[1]}. That usually means it was truncated during a download or edited by hand.`
        : 'This file is not valid JSON, so it is not a backup this app wrote.',
    });
    return report;
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    report.errors.push({ code: 'not-object', message: 'This file contains JSON, but not a backup — the top level is not an object.' });
    return report;
  }

  if (doc.format !== BACKUP_FORMAT) {
    report.errors.push({
      code: 'wrong-format',
      message: doc.format
        ? `This is a "${String(doc.format).slice(0, 40)}" file, not a Ted's Route backup.`
        : 'This file has no format marker, so it was not written by this app. Nothing has been changed.',
    });
    return report;
  }

  const sv = Number(doc.schemaVersion);
  if (!Number.isFinite(sv)) {
    report.errors.push({ code: 'no-schema', message: 'The backup does not say which schema version it uses, so it cannot be restored safely.' });
    return report;
  }
  if (sv > SCHEMA_VERSION) {
    report.errors.push({
      code: 'future-schema',
      message: `This backup was written by a newer version of the app (schema ${sv}, this app reads ${SCHEMA_VERSION}). Update the app before restoring it — restoring it now could silently drop fields.`,
    });
    return report;
  }
  report.meta.schemaVersion = sv;
  report.meta.appVersion = doc.appVersion ?? 'unknown';
  report.meta.createdAt = Number.isFinite(doc.createdAt) ? doc.createdAt : null;

  const properties = Array.isArray(doc.properties) ? doc.properties : null;
  const days = Array.isArray(doc.days) ? doc.days : [];
  const events = Array.isArray(doc.events) ? doc.events : [];
  if (!properties) {
    report.errors.push({ code: 'no-properties', message: 'The backup has no property list. There is nothing to restore.' });
    return report;
  }

  // Checksum before content checks: a mismatch means everything below is suspect.
  const payload = {
    properties, days, events,
    settings: doc.settings ?? DEFAULT_SETTINGS,
    dataOrigin: doc.dataOrigin ?? null,
  };
  if (doc.checksum) {
    const actual = checksum(payload);
    if (actual !== doc.checksum) {
      report.errors.push({
        code: 'checksum',
        message: `This backup's contents do not match its own checksum (expected ${doc.checksum}, computed ${actual}). The file has been altered or damaged since it was written, so it will not be restored.`,
      });
      return report;
    }
    report.meta.checksumVerified = true;
  } else {
    report.warnings.push({ code: 'no-checksum', message: 'This backup has no checksum, so damage to it cannot be ruled out. It looks structurally valid.' });
  }

  if (doc.counts) {
    for (const [k, arr] of [['properties', properties], ['days', days], ['events', events]]) {
      if (Number.isFinite(doc.counts[k]) && doc.counts[k] !== arr.length) {
        report.errors.push({
          code: 'count-mismatch',
          message: `The backup says it holds ${doc.counts[k]} ${k} but actually contains ${arr.length}. It is incomplete.`,
        });
        return report;
      }
    }
  }

  // --- structural checks -------------------------------------------------
  const seen = new Set();
  let noCoords = 0, outOfRegion = 0, inactive = 0;
  properties.forEach((p, i) => {
    if (!p || typeof p !== 'object') {
      report.errors.push({ code: 'bad-property', message: `Property ${i + 1} is not a record.` });
      return;
    }
    if (typeof p.id !== 'string' || !p.id) {
      report.errors.push({ code: 'bad-id', message: `Property ${i + 1} ("${String(p.address || '').slice(0, 30)}") has no id.` });
      return;
    }
    if (seen.has(p.id)) {
      report.errors.push({ code: 'duplicate-id', message: `Property id "${p.id}" appears more than once. Restoring would silently merge two different properties.` });
      return;
    }
    seen.add(p.id);
    if (typeof p.address !== 'string' || !p.address.trim()) {
      report.warnings.push({ code: 'no-address', message: `Property "${p.id}" has no address.` });
    }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) noCoords++;
    else if (!inServiceRegion(p)) {
      outOfRegion++;
      report.warnings.push({ code: 'out-of-region', message: `"${p.address || p.id}" has coordinates outside the service area (${p.lat}, ${p.lng}) and will not be mapped.` });
    }
    if (p.active === false) inactive++;
  });

  if (report.errors.length) return report;

  const propIds = seen;
  let orphanStops = 0;
  days.forEach((d) => {
    if (!d || typeof d.date !== 'string') {
      report.warnings.push({ code: 'bad-day', message: 'A day record has no date and will be skipped.' });
      return;
    }
    for (const id of d.order || []) if (!propIds.has(id)) orphanStops++;
    for (const [id, s] of Object.entries(d.stops || {})) {
      if (!propIds.has(id)) orphanStops++;
      if (s && s.status && !STOP_STATUS[s.status]) {
        report.warnings.push({ code: 'bad-status', message: `Day ${d.date} contains an unrecognised stop status "${s.status}".` });
      }
    }
  });
  if (orphanStops) {
    report.warnings.push({
      code: 'orphan-stops',
      message: `${orphanStops} stop reference${orphanStops === 1 ? '' : 's'} point to properties that are not in this backup. They will be ignored rather than restored as blanks.`,
    });
  }

  const completions = events.filter((e) => e && e.type === 'complete').length;
  const firstEvent = events.reduce((m, e) => (Number.isFinite(e?.at) && e.at < m ? e.at : m), Infinity);
  const lastEvent = events.reduce((m, e) => (Number.isFinite(e?.at) && e.at > m ? e.at : m), 0);

  report.ok = true;
  report.data = payload;
  report.counts = {
    properties: properties.length,
    active: properties.length - inactive,
    days: days.length,
    events: events.length,
    completions,
    withCoordinates: properties.length - noCoords,
    missingCoordinates: noCoords,
    outOfRegion,
  };
  report.meta.firstEventAt = Number.isFinite(firstEvent) && firstEvent !== Infinity ? firstEvent : null;
  report.meta.lastEventAt = lastEvent || null;
  if (noCoords) {
    report.warnings.push({
      code: 'missing-coords',
      message: `${noCoords} propert${noCoords === 1 ? 'y has' : 'ies have'} no coordinates. They will appear in the list but not on the map, and cannot take part in route optimisation.`,
    });
  }
  return report;
}

/**
 * Applies a verified report. Takes a safety copy of the current data first, so
 * a restore that turns out to be the wrong file is itself reversible.
 */
export async function apply(store, report, { mode = 'replace' } = {}) {
  if (!report?.ok || !report.data) {
    throw new Error('Refusing to restore from a backup that did not pass validation.');
  }
  const safety = buildBackup({
    properties: [...store.properties.values()],
    days: [...store.days.values()],
    events: (await store.exportRaw()).events,
    settings: store.settings,
    dataOrigin: store.dataOrigin,
  });

  const { properties, days, events, settings, dataOrigin } = report.data;
  if (mode === 'replace') await store.wipeAll();

  await store.replaceProperties(properties, dataOrigin || { label: 'Restored backup', at: Date.now() });
  await store.importDays(days.filter((d) => d && typeof d.date === 'string'));
  await store.importEvents(events.map(stripSeq));
  if (settings) await store.updateSettings({ ...DEFAULT_SETTINGS, ...settings });

  return { safety, restored: report.counts };
}

/** Event keys are auto-incremented by the local database; a foreign seq would collide. */
function stripSeq(e) {
  const { seq, ...rest } = e || {};
  return rest;
}

/**
 * Hands the file to the operating system. On iOS the share sheet is the only
 * route that reaches Files, iCloud Drive and AirDrop, so it is tried first; a
 * download link is the desktop path; showing the text is the last resort so
 * the data is never trapped inside the app.
 */
export async function deliver(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return { method: 'share' };
    } catch (e) {
      if (e?.name === 'AbortError') return { method: 'cancelled' };
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { method: 'download' };
  } catch (e) {
    return { method: 'inline', error: e };
  }
}
