/**
 * The property dossier.
 *
 * Not a "detail sheet" with a grid of icon buttons over a stack of cards.
 * A dossier: one continuous document about one lawn, in the order the
 * questions are actually asked while standing in front of it.
 *
 *   masthead    which stop this is, and what state it is in
 *   the order   the standing instruction, first, because it is the job
 *   the keys    the same two physical keys as Today, so the hands already know
 *   timing      how long this one takes, and how it compares to the rest
 *   rhythm      when it has been cut — cadence drawn on a real time axis
 *   ground      where the pin is, how it got there, how far away you are
 *
 * The rhythm strip is the only chart, and it is not decoration: each tick is
 * drawn at the weight the learning model actually gives that visit, so what
 * the app knows and how confident it is are the same picture.
 */

import { h, svg, ICON, clear } from '../dom.js';
import { openSheet, closeSheet } from '../sheet.js';
import { formatClock, formatDateHuman, formatDuration, DAY_FULL } from '../../core/time.js';
import { formatDistance } from '../../core/geo.js';
import { serviceMinutesFor } from '../../learning/predict.js';
import { recencyWeight } from '../../learning/robust.js';
import { canNavigate } from '../../services/navigation.js';
import { toast } from '../toast.js';
import { haptic } from '../motion/haptics.js';
import { GEO_SOURCE } from '../../data/schema.js';

const DAY_MS = 86400000;

export function openPropertySheet(ctx, stop) {
  const content = h('div.dossier');
  const s = ctx.model?.byProperty?.get(stop.id);
  const dist = ctx.location?.fresh ? ctx.location.distanceKmTo(stop) : null;
  const index = (ctx.stops || []).findIndex((x) => x.id === stop.id);

  // ---- the order ---------------------------------------------------------
  //
  // Above the actions, deliberately. An instruction read after the Done key is
  // an instruction read too late.
  if (stop.dayNote) {
    content.appendChild(h('div.order', { dataset: { tone: 'today' } },
      h('div.order-lab', { text: 'Today' }),
      h('p.order-t', { text: stop.dayNote })));
  }
  if (stop.note) {
    content.appendChild(h('div.order', null,
      h('div.order-lab', { text: 'Every visit' }),
      h('p.order-t', { text: stop.note })));
  }

  // ---- the keys ----------------------------------------------------------
  content.appendChild(h('div.live-act', null,
    h('button.act.act-nav', {
      type: 'button', disabled: !canNavigate(stop),
      onclick: () => { closeSheet(); ctx.navigate(stop); },
    }, svg(ICON.nav, { size: 20 }), 'Navigate'),
    stop.status === 'done'
      ? h('button.act.act-nav', { type: 'button', onclick: () => { closeSheet(); ctx.setStatus(stop, 'pending'); } },
          svg(ICON.undo, { size: 20 }), 'Reopen')
      : h('button.act.act-done', { type: 'button', onclick: (e) => { closeSheet(); ctx.completeStop(stop, e.currentTarget); } },
          svg(ICON.check, { size: 20 }), 'Done')
  ));

  content.appendChild(h('div.live-more', null,
    h('button.link', { type: 'button', text: 'Skip', onclick: () => { closeSheet(); ctx.setStatus(stop, 'skipped'); } }),
    h('button.link', { type: 'button', text: 'Push', onclick: () => { closeSheet(); ctx.setStatus(stop, 'pushed'); } }),
    h('button.link', { type: 'button', text: 'Note', onclick: () => openNote(ctx, stop) }),
    h('button.link', { type: 'button', text: 'On the map', onclick: () => { closeSheet(); ctx.goTo('map'); ctx.selectOnMap(stop); } })
  ));

  // ---- timing ------------------------------------------------------------
  const known = s && s.samples;
  const timeSec = h('section.seam', null, h('div.seam-lab', { text: 'How long it takes' }));
  timeSec.appendChild(h('div.figure', {
    text: known ? `${Math.round(s.low)}–${Math.round(s.high)} min` : `about ${Math.round(ctx.model?.global?.minutes ?? 15)} min`,
  }));
  // Not `timing.text`: it restates the headline range word for word. What the
  // headline cannot say is how much evidence is behind it and which way it is
  // moving.
  timeSec.appendChild(h('p.prose', { text: known
    ? `From ${s.samples} recorded visit${s.samples === 1 ? '' : 's'}.`
      + (s.trend ? ` Trending ${s.trend.direction} by about ${Math.abs(Math.round(s.trend.deltaMin))} min.` : '')
      + ` The app plans ${Math.round(s.minutes)} min for it.`
    : 'No timing history yet, so this is the day average until it has been cut a few times.' }));
  const span = spanLine(ctx, stop, s);
  if (span) timeSec.appendChild(span);
  content.appendChild(timeSec);

  // ---- rhythm ------------------------------------------------------------
  const rhythm = h('section.seam', null,
    h('div.seam-lab', { text: 'When it gets cut' }),
    h('div.skel', { style: { height: '64px' } }));
  content.appendChild(rhythm);

  ctx.store.historyFor(stop.id, 40).then((events) => {
    const visits = events.filter((e) => e.type === 'complete').sort((a, b) => b.at - a.at);
    clear(rhythm);
    rhythm.appendChild(h('div.seam-lab', { text: 'When it gets cut' }));
    if (!visits.length) {
      rhythm.appendChild(h('p.prose', { text: 'No recorded visits yet. The first few will set the pace.' }));
      return;
    }
    rhythm.append(...rhythmStrip(visits, s));
  }).catch(() => {
    clear(rhythm);
    rhythm.appendChild(h('div.seam-lab', { text: 'When it gets cut' }));
    rhythm.appendChild(h('p.prose', { text: 'History could not be read from the device. Your route data is unaffected.' }));
  });

  // ---- ground ------------------------------------------------------------
  const geoLabel = {
    [GEO_SOURCE.manual]: 'you confirmed this pin in the field',
    [GEO_SOURCE.imported]: 'carried over from the previous app',
    [GEO_SOURCE.geocoded]: 'official municipal address point',
    [GEO_SOURCE.seed]: 'from the original route list',
    [GEO_SOURCE.none]: 'never located',
  }[stop.geoSource] || 'source unknown';

  content.appendChild(h('section.seam', null,
    h('div.seam-lab', { text: 'Where the pin is' }),
    h('p.prose.num', { text: canNavigate(stop)
      ? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)} — ${geoLabel}${dist != null ? `, ${formatDistance(dist)} from you now` : ''}.`
      : 'No coordinates on file, so this stop cannot be navigated to yet.' }),
    h('button.link.go', {
      type: 'button',
      text: canNavigate(stop) ? 'Correct the pin to where I am standing' : 'Set the pin to where I am standing',
      onclick: () => dropPin(ctx, stop),
    })
  ));

  return openSheet({
    title: stop.address,
    masthead: h('header.masthead', null,
      h('div.masthead-eyebrow', { dataset: { status: stop.status } },
        [index >= 0 ? `Stop ${index + 1} of ${ctx.stops.length}` : null, statusWord(stop.status)].filter(Boolean).join(' · ')),
      h('h2.masthead-addr', { text: stop.address }),
      h('div.masthead-facts', { text: [
        DAY_FULL[stop.day],
        stop.city && stop.city !== 'Barrie' ? stop.city : null,
        stop.pushMow ? 'Push mow' : null,
        dist != null ? `${formatDistance(dist)} away` : null,
      ].filter(Boolean).join(' · ') })
    ),
    content,
  });
}

/**
 * Where this lawn sits in the day's spread of service times. A number on its
 * own says nothing; "one of the long ones" is what actually gets planned around.
 */
function spanLine(ctx, stop, s) {
  const mins = (ctx.stops || []).map((x) => serviceMinutesFor(ctx.model, x)).filter((m) => m > 0);
  if (mins.length < 4) return null;
  const mine = serviceMinutesFor(ctx.model, stop);
  const max = Math.max(...mins);
  const min = Math.min(...mins);
  if (!(max > min)) return null;

  // Inset so the marker for the longest stop is not half off the axis.
  const at = (m) => 2 + ((m - min) / (max - min)) * 96;
  const shorter = mins.filter((m) => m < mine).length;
  const pct = Math.round((shorter / mins.length) * 100);

  const wrap = h('div.span', null,
    h('div.span-axis', null,
      ...mins.map((m) => h('i.span-tick', { style: { left: `${at(m).toFixed(2)}%` } })),
      h('i.span-me', { style: { left: `${at(mine).toFixed(2)}%` } })),
    h('div.span-ends', null,
      h('span', { text: `${Math.round(min)} min` }),
      h('span', { text: `${Math.round(max)} min` })),
    h('p.prose', { text: 'Every stop on this day by the time the app plans for it, this one marked. '
      + (pct >= 80 ? `One of the longest — longer than ${pct}% of them.`
        : pct <= 20 ? `One of the quick ones — shorter than ${100 - pct}% of them.`
        : `About mid-length; longer than ${pct}% of them.`) })
  );
  return wrap;
}

/**
 * Visits drawn on a real time axis rather than listed as rows, so the cadence
 * — and any missed cycle — is a shape instead of arithmetic. Tick opacity is
 * the recency weight the model gives that visit, which is why a wall of faint
 * ticks and a low confidence figure always agree with each other.
 */
function rhythmStrip(visits, s) {
  const now = Date.now();
  const oldest = visits[visits.length - 1].at;
  const span = Math.max(now - oldest, 21 * DAY_MS);
  const x = (at) => 2 + (1 - (now - at) / span) * 96;

  const strip = h('div.rhythm');
  for (const v of visits) {
    const age = (now - v.at) / DAY_MS;
    strip.appendChild(h('i.rhythm-tick', {
      style: { left: `${x(v.at).toFixed(2)}%`, opacity: Math.max(0.16, recencyWeight(age)).toFixed(2) },
    }));
  }

  const gaps = [];
  for (let i = 0; i < visits.length - 1; i += 1) gaps.push((visits[i].at - visits[i + 1].at) / DAY_MS);
  const typical = gaps.length ? median(gaps) : null;
  const sinceLast = Math.round((now - visits[0].at) / DAY_MS);

  const ends = h('div.span-ends', null,
    h('span', { text: formatDateHuman(new Date(oldest).toISOString().slice(0, 10)) }),
    h('span', { text: 'now' }));

  const lines = [];
  lines.push(`${visits.length} recorded visit${visits.length === 1 ? '' : 's'}`
    + (typical ? `, usually about every ${Math.round(typical)} days` : '')
    + `. Last cut ${sinceLast === 0 ? 'today' : sinceLast === 1 ? 'yesterday' : `${sinceLast} days ago`}.`);
  if (s && s.samples) {
    lines.push(`The timing above leans on the recent ones: ${Math.round(s.confidence * 100)}% confident, `
      + `worth about ${s.nEff.toFixed(1)} full visits after older cuts are faded out.`);
  }

  const list = h('div.visits');
  let prev = null;
  for (const v of visits.slice(0, 10)) {
    const gapDays = prev ? Math.round((prev.at - v.at) / DAY_MS) : null;
    list.appendChild(h('div.visit', null,
      h('span', { text: formatDateHuman(new Date(v.at).toISOString().slice(0, 10)) }),
      h('span.num', { text: [formatClock(v.at), gapDays ? `${gapDays}d gap` : null].filter(Boolean).join(' · ') })));
    prev = v;
  }

  return [strip, ends, ...lines.map((t) => h('p.prose', { text: t })), list];
}

function median(xs) {
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function statusWord(s) {
  return s === 'done' ? 'Done' : s === 'skipped' ? 'Skipped' : s === 'pushed' ? 'Pushed to next week' : 'Still to do';
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
    footer: h('button.act.act-done', {
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
