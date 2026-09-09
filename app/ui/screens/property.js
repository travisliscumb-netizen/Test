/**
 * The property sheet.
 *
 * Every action the operator needs while standing at a property, one tap deep.
 * Nothing here is behind a menu, because a menu is two taps and a decision at
 * the exact moment both hands are busy.
 */

import { h, svg, ICON, clear } from '../dom.js';
import { openSheet, closeSheet } from '../sheet.js';
import { formatClock, formatDateHuman, formatDuration, DAY_FULL } from '../../core/time.js';
import { formatDistance } from '../../core/geo.js';
import { describeTiming } from '../../services/insights.js';
import { canNavigate } from '../../services/navigation.js';
import { toast } from '../toast.js';
import { haptic } from '../motion/haptics.js';
import { GEO_SOURCE } from '../../data/schema.js';

export function openPropertySheet(ctx, stop) {
  const content = h('div', { style: { display: 'grid', gap: 'var(--s4)' } });
  const timing = describeTiming(ctx.model, stop);
  const dist = ctx.location?.fresh ? ctx.location.distanceKmTo(stop) : null;

  // ---- primary actions ---------------------------------------------------
  content.appendChild(h('div.actiongrid', null,
    h('button.btn.nav', { type: 'button', disabled: !canNavigate(stop), onclick: () => { closeSheet(); ctx.navigate(stop); } },
      svg(ICON.nav, { size: 22 }), 'Navigate'),
    stop.status === 'done'
      ? h('button.btn.ghost', { type: 'button', onclick: () => { closeSheet(); ctx.setStatus(stop, 'pending'); } }, svg(ICON.undo, { size: 22 }), 'Reopen')
      : h('button.btn.primary', { type: 'button', onclick: (e) => { closeSheet(); ctx.completeStop(stop, e.currentTarget); } }, svg(ICON.check, { size: 22 }), 'Done'),
    h('button.btn.ghost', { type: 'button', onclick: () => { closeSheet(); ctx.goTo('map'); ctx.selectOnMap(stop); } }, svg(ICON.map, { size: 22 }), 'Map')
  ));
  content.appendChild(h('div.actiongrid', null,
    h('button.btn.ghost', { type: 'button', onclick: () => { closeSheet(); ctx.setStatus(stop, 'skipped'); } }, svg(ICON.skip, { size: 22 }), 'Skip'),
    h('button.btn.ghost', { type: 'button', onclick: () => { closeSheet(); ctx.setStatus(stop, 'pushed'); } }, svg(ICON.push, { size: 22 }), 'Push'),
    h('button.btn.ghost', { type: 'button', onclick: () => openNote(ctx, stop) }, svg(ICON.note, { size: 22 }), 'Note')
  ));

  // ---- standing instructions --------------------------------------------
  if (stop.note) {
    content.appendChild(h('div.card.flat.tight', null,
      h('div.card-title', { text: 'Standing instructions' }),
      h('p', { style: { marginTop: 'var(--s2)', font: 'var(--t-body)' }, text: stop.note })
    ));
  }
  if (stop.dayNote) {
    content.appendChild(h('div.card.flat.tight', null,
      h('div.card-title', { text: "Today's note" }),
      h('p', { style: { marginTop: 'var(--s2)', font: 'var(--t-body)' }, text: stop.dayNote })
    ));
  }

  // ---- timing ------------------------------------------------------------
  const s = ctx.model?.byProperty?.get(stop.id);
  content.appendChild(h('div.card.flat.tight', null,
    h('div.card-title', { text: 'Service time' }),
    h('div', { style: { font: 'var(--t-hero)', letterSpacing: 'var(--ls-title)', marginTop: 'var(--s2)' },
      text: s && s.samples ? `${Math.round(s.low)}–${Math.round(s.high)} min` : `~${Math.round(ctx.model?.global?.minutes ?? 15)} min` }),
    h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s2)' }, text: timing.text }),
    s && s.samples ? h('div', { style: { marginTop: 'var(--s4)' } },
      h('div.row.between', { style: { marginBottom: '5px' } },
        h('span', { class: 'muted', style: { font: 'var(--t-micro)', letterSpacing: 'var(--ls-micro)', textTransform: 'uppercase' }, text: 'Confidence' }),
        h('span', { class: 'muted num', style: { font: 'var(--t-micro)' }, text: `${Math.round(s.confidence * 100)}%` })),
      h('div.confbar', { dataset: { level: s.confidence > 0.55 ? 'good' : s.confidence > 0.25 ? 'low' : 'none' } },
        h('i', { style: { width: `${Math.max(4, s.confidence * 100)}%` } }))
    ) : null
  ));

  // ---- location ----------------------------------------------------------
  const geoLabel = {
    [GEO_SOURCE.manual]: 'Confirmed by you in the field',
    [GEO_SOURCE.imported]: 'Carried over from the previous app',
    [GEO_SOURCE.geocoded]: 'Official municipal address point',
    [GEO_SOURCE.seed]: 'From the original route list',
    [GEO_SOURCE.none]: 'Not located',
  }[stop.geoSource] || 'Unknown source';

  content.appendChild(h('div.card.flat.tight', null,
    h('div.card-title', { text: 'Location' }),
    h('p', { style: { marginTop: 'var(--s2)', font: 'var(--t-body)' },
      text: canNavigate(stop) ? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}` : 'No coordinates on file' }),
    h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: '2px' }, text: geoLabel }),
    dist != null ? h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: '2px' }, text: `${formatDistance(dist)} from you now` }) : null,
    h('button.btn.sm.ghost', {
      type: 'button', style: { marginTop: 'var(--s4)', width: '100%' },
      onclick: () => dropPin(ctx, stop),
    }, svg(ICON.target, { size: 17 }), canNavigate(stop) ? 'Correct this pin to where I am' : 'Set the pin to where I am')
  ));

  // ---- history -----------------------------------------------------------
  const historyBox = h('div.card.flat.tight', null,
    h('div.card-title', { text: 'History' }),
    h('div', { style: { marginTop: 'var(--s3)' } }, h('div.skel', { style: { height: '54px' } }))
  );
  content.appendChild(historyBox);

  ctx.store.historyFor(stop.id, 24).then((events) => {
    clear(historyBox);
    historyBox.appendChild(h('div.card-title', { text: 'History' }));
    const visits = events.filter((e) => e.type === 'complete');
    if (!visits.length) {
      historyBox.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
        text: 'No recorded visits yet.' }));
      return;
    }
    const list = h('div', { style: { display: 'grid', gap: 'var(--s2)', marginTop: 'var(--s3)' } });
    let prev = null;
    for (const v of visits.slice(0, 12)) {
      const gapDays = prev ? Math.round((prev.at - v.at) / 86400000) : null;
      list.appendChild(h('div.row.between', { style: { font: 'var(--t-label)', padding: '5px 0', borderBottom: '1px solid var(--hairline)' } },
        h('span', { text: formatDateHuman(new Date(v.at).toISOString().slice(0, 10)) }),
        h('span', { class: 'muted num', text: [formatClock(v.at), gapDays ? `${gapDays}d gap` : null].filter(Boolean).join(' · ') })
      ));
      prev = v;
    }
    historyBox.appendChild(list);
    historyBox.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
      text: `${visits.length} recorded visit${visits.length === 1 ? '' : 's'} in total.` }));
  }).catch(() => {
    clear(historyBox);
    historyBox.appendChild(h('div.card-title', { text: 'History' }));
    historyBox.appendChild(h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
      text: 'History could not be read from the device. Your route data is unaffected.' }));
  });

  return openSheet({
    title: stop.address,
    subtitle: [
      DAY_FULL[stop.day],
      stop.city && stop.city !== 'Barrie' ? stop.city : null,
      stop.pushMow ? 'Push mow' : null,
      statusWord(stop.status),
    ].filter(Boolean).join(' · '),
    content,
  });
}

function statusWord(s) {
  return s === 'done' ? 'Complete' : s === 'skipped' ? 'Skipped' : s === 'pushed' ? 'Pushed' : 'Remaining';
}

function openNote(ctx, stop) {
  const field = h('textarea.field', { placeholder: 'What happened here today?', value: stop.dayNote || '' });
  const perm = h('input', { type: 'checkbox', id: 'permnote' });
  openSheet({
    title: 'Note',
    subtitle: stop.address,
    content: h('div', { style: { display: 'grid', gap: 'var(--s4)' } },
      field,
      h('label.switchrow', { for: 'permnote' },
        h('div', null,
          h('div.k', { text: 'Keep permanently' }),
          h('div.d', { text: 'Saves it as a standing instruction for this property instead of just today.' })),
        perm)
    ),
    footer: h('button.btn.primary', {
      type: 'button',
      onclick: async () => {
        const text = field.value.trim();
        closeSheet();
        if (perm.checked) await ctx.store.setPermanentNote(stop.id, text);
        else await ctx.store.setDayNote(stop.id, text, { date: ctx.date, crew: ctx.crew });
        haptic('success');
        toast({ title: 'Note saved', body: perm.checked ? 'Kept as a standing instruction.' : 'Attached to today only.' });
        ctx.refresh();
      },
    }, 'Save note'),
  });
}

async function dropPin(ctx, stop) {
  const loc = ctx.location;
  if (!loc?.position) {
    toast({ title: 'No GPS fix', body: loc?.describe() || 'Location is unavailable right now.', tone: 'error' });
    return;
  }
  const acc = loc.position.accuracy ?? 999;
  if (acc > 40) {
    toast({
      title: 'Fix is too rough to pin',
      body: `Accuracy is about ${Math.round(acc)} m. Wait a few seconds in the open and try again — a pin saved now could be on the neighbour's lawn.`,
      tone: 'error',
    });
    loc.boost();
    return;
  }
  await ctx.store.correctLocation(stop.id, loc.position.lat, loc.position.lng, { accuracyM: acc });
  haptic('success');
  closeSheet();
  toast({
    title: 'Pin corrected',
    body: `Saved to ${Math.round(acc)} m accuracy. Nothing automatic will overwrite it.`,
    action: { label: 'Undo', onAction: () => ctx.store.undo().then(() => ctx.refresh()) },
  });
  ctx.refresh();
}
