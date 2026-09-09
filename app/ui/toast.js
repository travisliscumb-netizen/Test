/**
 * Toasts.
 *
 * Used for two things only: confirming an action that can be undone, and
 * reporting a failure. Anything else belongs on the screen where it applies.
 *
 * A toast carrying an Undo stays long enough to actually be used with gloves
 * on — five seconds, not the two that looks tidy in a demo.
 */

import { h, svg, ICON, clear } from './dom.js';
import { prefersCalm } from './motion/spring.js';

let layer = null;
const live = new Map();

function ensureLayer() {
  if (layer) return layer;
  layer = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(layer);
  return layer;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.body]
 * @param {'info'|'error'} [o.tone]
 * @param {{label:string, onAction:Function}} [o.action]
 * @param {number} [o.ms]
 * @param {string} [o.key]  replaces an existing toast with the same key
 */
export function toast({ title, body, tone = 'info', action = null, ms = null, key = null }) {
  ensureLayer();
  const id = key || `t${Math.random().toString(36).slice(2)}`;
  if (live.has(id)) dismiss(id, true);

  const timeout = ms ?? (action ? 5200 : tone === 'error' ? 7000 : 2600);
  const el = h('div.toast', { dataset: { tone }, role: tone === 'error' ? 'alert' : undefined },
    h('div', null, h('b', { text: title }), body ? h('span', { text: body }) : null),
    action
      ? h('button.act', {
          type: 'button',
          text: action.label,
          onclick: () => { dismiss(id); action.onAction?.(); },
        })
      : h('button.act', {
          type: 'button', 'aria-label': 'Dismiss',
          onclick: () => dismiss(id),
        }, svg(ICON.close, { size: 16 }))
  );
  layer.appendChild(el);

  const anim = prefersCalm()
    ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, fill: 'both' })
    : el.animate(
        [{ transform: 'translate3d(0,14px,0) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
      );

  const timer = setTimeout(() => dismiss(id), timeout);
  live.set(id, { el, timer, anim });
  return id;
}

export function dismiss(id, immediate = false) {
  const rec = live.get(id);
  if (!rec) return;
  live.delete(id);
  clearTimeout(rec.timer);
  if (immediate || prefersCalm()) { rec.el.remove(); return; }
  rec.el.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0,10px,0)', opacity: 0 }],
    { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' }
  ).finished.then(() => rec.el.remove()).catch(() => rec.el.remove());
}

export function clearToasts() {
  for (const id of [...live.keys()]) dismiss(id, true);
}

/**
 * Reports a failure the operator can act on.
 *
 * Every message answers the three questions that matter when something breaks
 * while you are holding the only copy of your day: what happened, whether the
 * data is safe, and what to do next.
 */
export function reportError(err, context = '') {
  const kind = err?.kind || err?.name || '';
  let title = 'That change was not saved';
  let body = 'Your existing data is untouched. Try again in a moment.';

  if (kind === 'unavailable') {
    title = 'No local storage available';
    body = 'Safari Private Browsing blocks the local database. Open this app in a normal tab and your route will save again.';
  } else if (String(err?.message || '').includes('out of space')) {
    title = 'The device is out of space';
    body = 'Nothing already saved has been lost. Free some storage, then repeat the last action.';
  } else if (kind === 'blocked') {
    title = 'Another tab has the data open';
    body = 'Close the other tab with Ted’s Route open, then try again.';
  } else if (err?.message) {
    body = `${err.message} Your existing data is untouched.`;
  }
  return toast({ title, body: context ? `${body} (${context})` : body, tone: 'error', key: 'error' });
}
