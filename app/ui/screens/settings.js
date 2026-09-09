/**
 * Settings and data.
 *
 * Flat, short, and ordered by how often it is touched. There is no settings
 * tree: everything is on one screen because a personal tool with fifteen
 * preferences does not need navigation, it needs to be scrollable.
 *
 * Backup is at the top of the data section and is one tap, because the brief
 * is right that it must be extremely obvious.
 */

import { h, svg, ICON, clear } from '../dom.js';
import { openSheet, closeSheet } from '../sheet.js';
import { toast, reportError } from '../toast.js';
import { haptic, hapticsCapability } from '../motion/haptics.js';
import { buildBackup, backupFilename, deliver, inspect, apply } from '../../data/backup.js';
import { storageEstimate, requestPersistence } from '../../data/db.js';
import { NAV_APPS } from '../../services/navigation.js';
import { APP_VERSION } from '../../version.js';
import { formatDateHuman, formatClock } from '../../core/time.js';

export class SettingsScreen {
  constructor(ctx) { this.ctx = ctx; }

  mount(container) {
    this.el = h('div.page');
    container.appendChild(this.el);
    this.update();
    return this.el;
  }
  unmount() { this.el?.remove(); }

  update() {
    const { store, settings } = this.ctx;
    clear(this.el);

    // ---------------------------------------------------------------- data
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Your data' })),
      h('button.btn.primary', { type: 'button', style: { width: '100%' }, onclick: () => this.backup() },
        svg(ICON.download, { size: 20 }), 'Back up everything now'),
      h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
        text: 'Writes one file containing every property, every completed stop and every note, with a checksum. Save it to Files or iCloud.' }),
      h('button.btn.ghost', { type: 'button', style: { width: '100%', marginTop: 'var(--s4)' }, onclick: () => this.restore() },
        svg(ICON.upload, { size: 20 }), 'Restore from a backup file'),
      h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
        text: 'The file is checked and summarised before anything on this device is touched. A damaged or foreign file is refused outright.' }),
      this.storageBox = h('div', { style: { marginTop: 'var(--s5)' } })
    ));
    this.renderStorage();

    // ------------------------------------------------------------- working
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Working day' })),
      this.row('Crew', 'Which route this device runs.',
        this.seg([['south', 'South'], ['east', 'East']], settings.crew, (v) => this.set({ crew: v }))),
      this.row('Start time', 'Used for the finish estimate before the first stop is marked.',
        h('input.field', {
          type: 'time', value: settings.startTime, style: { width: '128px' },
          onchange: (e) => this.set({ startTime: e.target.value }),
        })),
      this.row(
        settings.depot ? 'Shop location' : 'Shop location not set',
        settings.depot
          ? `${settings.depot.label || 'Set'} — ${settings.depot.lat.toFixed(4)}, ${settings.depot.lng.toFixed(4)}`
          : 'Set it while standing at the yard. Until then the finish estimate leaves out the drive home.',
        h('button.btn.sm.ghost', { type: 'button', onclick: () => this.setDepot() },
          svg(ICON.target, { size: 17 }), settings.depot ? 'Update' : 'Set here')),
      this.row('Return to the shop', 'Counts the drive home in the finish estimate and the route optimiser.',
        this.toggle(settings.returnToDepot && !!settings.depot, (v) => this.set({ returnToDepot: v }))),
      this.row('Suggest reordering', 'Only interrupts when the saving clears the threshold below.',
        this.toggle(settings.autoOptimizePrompt, (v) => this.set({ autoOptimizePrompt: v }))),
      this.row('Worth interrupting for', 'Smaller savings are never raised.',
        this.seg([[4, '4 min'], [6, '6 min'], [10, '10 min'], [15, '15 min']], settings.optimizeThresholdMin,
          (v) => this.set({ optimizeThresholdMin: Number(v) })))
    ));

    // ---------------------------------------------------------- navigation
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Navigation' })),
      this.row('Open directions in', 'Destinations are always handed over as coordinates, never as text to re-look-up.',
        this.seg(NAV_APPS.map((a) => [a.key, a.label]), settings.navApp, (v) => this.set({ navApp: v })))
    ));

    // ---------------------------------------------------------------- gps
    const loc = this.ctx.location;
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Location' })),
      this.row('GPS', 'Balanced tracks coarsely and only sharpens within 400 m of the next stop, which is most of the battery difference.',
        this.seg([['off', 'Off'], ['balanced', 'Balanced'], ['precise', 'Precise']], settings.gpsMode,
          (v) => { this.set({ gpsMode: v }); loc.setMode(v); })),
      this.row('Arrival hints', 'Suggests marking a stop done when you are clearly standing at it. It never marks anything automatically.',
        this.toggle(settings.arrivalAssist, (v) => this.set({ arrivalAssist: v }))),
      h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' }, text: loc.describe() })
    ));

    // ------------------------------------------------------------ feel
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Look and feel' })),
      this.row('Theme', 'Daylight is built for direct sun: higher contrast, no translucency.',
        this.seg([['auto', 'Auto'], ['night', 'Night'], ['day', 'Daylight']], settings.theme, (v) => this.set({ theme: v }))),
      this.row('Text size', 'iOS text-size settings do not reach a web app, so this is the app\u2019s own. Buttons grow with it.',
        this.seg([['standard', 'Standard'], ['large', 'Large'], ['larger', 'Larger']], settings.textSize,
          (v) => this.set({ textSize: v }))),
      this.row('Motion', 'Calm keeps every transition but shortens it and removes overshoot and particles.',
        this.seg([['full', 'Full'], ['calm', 'Calm']], settings.motion, (v) => this.set({ motion: v }))),
      this.row('Haptics', hapticsDescription(),
        this.toggle(settings.haptics, (v) => this.set({ haptics: v }))),
      this.row('Map imagery', 'Tiles are cached as you use them, so a route driven once renders offline.',
        this.seg([['carto', 'Muted'], ['osm', 'Standard'], ['none', 'Off']], settings.mapTiles, (v) => this.set({ mapTiles: v })))
    ));

    // ----------------------------------------------------------- danger
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Reset' })),
      h('button.btn.danger', { type: 'button', style: { width: '100%' }, onclick: () => this.confirmWipe() },
        svg(ICON.warn, { size: 19 }), 'Erase everything on this device'),
      h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
        text: 'Back up first. This removes every property, every completed stop and all history from this phone. It cannot be undone from inside the app.' })
    ));

    this.el.appendChild(h('p', {
      class: 'muted',
      style: { font: 'var(--t-label)', textAlign: 'center', padding: 'var(--s5) 0' },
      text: `Ted's Route ${APP_VERSION} · ${store.properties.size} properties${store.dataOrigin?.label ? ` · ${store.dataOrigin.label}` : ''}`,
    }));
  }

  async renderStorage() {
    const est = await storageEstimate();
    const persisted = await requestPersistence();
    clear(this.storageBox);
    const parts = [];
    if (est.usage != null) parts.push(`${(est.usage / 1048576).toFixed(1)} MB used`);
    if (est.quota != null) parts.push(`${(est.quota / 1073741824).toFixed(1)} GB available`);
    this.storageBox.appendChild(h('div.row.between', { style: { font: 'var(--t-label)' } },
      h('span', { class: 'muted', text: parts.join(' · ') || 'Storage size unavailable' }),
      h('span', {
        class: 'chip', dataset: { kind: persisted ? 'note' : 'time' },
        text: persisted ? 'Protected' : 'Not protected',
      })
    ));
    if (!persisted) {
      this.storageBox.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s2)' },
        text: 'Safari can evict data from sites that are not used for a while. Adding this app to the Home Screen and using it usually earns protected storage. Backing up regularly is the real safeguard either way.' }));
    }
  }

  // ------------------------------------------------------------ primitives

  row(k, d, control) {
    return h('div.switchrow', null,
      h('div', null, h('div.k', { text: k }), h('div.d', { text: d })),
      control);
  }

  toggle(value, onChange) {
    const btn = h('button.seg', { type: 'button', style: { padding: 0, border: 0, background: 'none' } });
    const rebuild = (v) => {
      clear(btn);
      btn.appendChild(this.seg([[true, 'On'], [false, 'Off']], v, (nv) => { onChange(nv === 'true' || nv === true); }));
    };
    rebuild(value);
    return btn;
  }

  seg(options, current, onChange) {
    const wrap = h('div.seg');
    for (const [value, label] of options) {
      wrap.appendChild(h('button', {
        type: 'button', text: label,
        'aria-pressed': String(String(value) === String(current)),
        onclick: () => { haptic('select'); onChange(typeof value === 'boolean' ? value : String(value)); },
      }));
    }
    return wrap;
  }

  async set(patch) {
    await this.ctx.updateSettings(patch);
    this.update();
  }

  async setDepot() {
    const loc = this.ctx.location;
    if (!loc?.position) {
      toast({ title: 'No GPS fix', body: loc?.describe() || 'Location is unavailable right now.', tone: 'error' });
      loc?.boost?.();
      return;
    }
    const acc = loc.position.accuracy ?? 999;
    if (acc > 80) {
      toast({
        title: 'Fix is too rough',
        body: `Accuracy is about ${Math.round(acc)} m. Wait in the open for a few seconds and try again.`,
        tone: 'error',
      });
      loc.boost();
      return;
    }
    await this.set({ depot: { lat: loc.position.lat, lng: loc.position.lng, label: 'Set from here' } });
    haptic('success');
    toast({ title: 'Shop location set', body: `Saved to about ${Math.round(acc)} m.` });
  }

  // ------------------------------------------------------------------ data

  async backup() {
    haptic('tap');
    try {
      const raw = await this.ctx.store.exportRaw();
      const doc = buildBackup({
        properties: raw.properties,
        days: raw.days,
        events: raw.events,
        settings: this.ctx.settings,
        dataOrigin: this.ctx.store.dataOrigin,
      });
      const json = JSON.stringify(doc, null, 1);
      const name = backupFilename(doc.createdAt);
      const res = await deliver(json, name);
      if (res.method === 'cancelled') return;
      if (res.method === 'inline') {
        openSheet({
          title: 'Copy your backup',
          subtitle: 'The share sheet was unavailable, so here is the file as text.',
          content: h('textarea.field', { readonly: true, value: json, style: { minHeight: '50vh', fontFamily: 'ui-monospace, monospace', fontSize: '11px' } }),
        });
        return;
      }
      haptic('success');
      toast({
        title: 'Backup created',
        body: `${doc.counts.properties} properties, ${doc.counts.events} recorded events, checksum ${doc.checksum}.`,
      });
    } catch (e) {
      reportError(e, 'backup');
    }
  }

  restore() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const report = await inspect(file);
      this.showRestoreReport(report);
    });
    document.body.appendChild(input);
    input.click();
  }

  showRestoreReport(report) {
    const body = h('div', { style: { display: 'grid', gap: 'var(--s4)' } });

    if (!report.ok) {
      haptic('error');
      body.appendChild(h('div.banner', { dataset: { tone: 'warn' } },
        h('div.ico', null, svg(ICON.warn, { size: 18 })),
        h('div', null,
          h('h4', { text: 'This file was not restored' }),
          h('p', { text: report.errors[0]?.message || 'The file could not be validated.' }),
          h('p', { style: { marginTop: 'var(--s3)' }, text: 'Nothing on this device has been changed.' }))
      ));
      for (const e of report.errors.slice(1, 4)) {
        body.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)' }, text: e.message }));
      }
      openSheet({ title: 'Backup refused', subtitle: report.meta.filename || '', content: body });
      return;
    }

    const c = report.counts;
    body.appendChild(h('div.card.flat.tight', null,
      h('div.card-title', { text: 'This file contains' }),
      h('div', { style: { display: 'grid', gap: '6px', marginTop: 'var(--s3)', font: 'var(--t-label)' } },
        line('Properties', `${c.properties} (${c.active} active)`),
        line('With coordinates', `${c.withCoordinates}${c.missingCoordinates ? ` — ${c.missingCoordinates} missing` : ''}`),
        line('Recorded days', String(c.days)),
        line('Events', `${c.events}, of which ${c.completions} completions`),
        line('Written', report.meta.createdAt ? `${formatDateHuman(new Date(report.meta.createdAt).toISOString().slice(0, 10))} at ${formatClock(report.meta.createdAt)}` : 'unknown'),
        line('Checksum', report.meta.checksumVerified ? 'verified' : 'absent'),
      )
    ));

    for (const w of report.warnings.slice(0, 4)) {
      body.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)' }, text: `• ${w.message}` }));
    }

    const current = this.ctx.store.properties.size;
    body.appendChild(h('div.banner', { dataset: { tone: current ? 'warn' : 'info' } },
      h('div.ico', null, svg(current ? ICON.warn : ICON.info, { size: 18 })),
      h('div', null,
        h('h4', { text: current ? 'This replaces what is on the device' : 'This device is empty' }),
        h('p', {
          text: current
            ? `${current} properties and their history are here now and will be replaced. A safety copy is taken first and offered to you if the restore turns out to be the wrong file.`
            : 'Nothing will be overwritten.',
        }))
    ));

    openSheet({
      title: 'Restore this backup?',
      subtitle: report.meta.filename || '',
      content: body,
      footer: h('div', { style: { display: 'grid', gap: 'var(--s3)' } },
        h('button.btn.primary', {
          type: 'button',
          onclick: async () => {
            closeSheet();
            try {
              const res = await apply(this.ctx.store, report);
              haptic('success');
              toast({
                title: 'Restored',
                body: `${res.restored.properties} properties and ${res.restored.events} events are now on this device.`,
              });
              await this.ctx.reload();
            } catch (e) { reportError(e, 'restore'); }
          },
        }, 'Restore now'),
        h('button.btn.ghost', { type: 'button', text: 'Cancel', onclick: () => closeSheet() })
      ),
    });
  }

  confirmWipe() {
    openSheet({
      title: 'Erase everything?',
      subtitle: 'This cannot be undone from inside the app.',
      content: h('div', null,
        h('p', { style: { font: 'var(--t-body)' },
          text: `${this.ctx.store.properties.size} properties, every completed stop, every note and all learned timings will be removed from this phone.` }),
        h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s4)' },
          text: 'If you have not taken a backup in the last few minutes, cancel and do that first.' })),
      footer: h('div', { style: { display: 'grid', gap: 'var(--s3)' } },
        h('button.btn.ghost', { type: 'button', text: 'Back up first', onclick: () => { closeSheet(); this.backup(); } }),
        h('button.btn.danger', {
          type: 'button', text: 'Erase everything',
          onclick: async () => { closeSheet(); await this.ctx.store.wipeAll(); haptic('warn'); await this.ctx.reload(); },
        }),
        h('button.btn.ghost', { type: 'button', text: 'Cancel', onclick: () => closeSheet() })
      ),
    });
  }
}

function line(k, v) {
  return h('div.row.between', null, h('span', { class: 'muted', text: k }), h('span', { class: 'num', text: v }));
}

function hapticsDescription() {
  const cap = hapticsCapability();
  if (cap === 'vibration') return 'This browser supports vibration feedback.';
  if (cap === 'ios-switch') return 'iOS has no vibration API for web apps. The system switch haptic is used where it works; every action also has a visual response that stands on its own.';
  return 'This device exposes no haptic API to web apps, so feedback is visual only.';
}
