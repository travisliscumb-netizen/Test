/**
 * Minimal DOM helpers.
 *
 * There is no framework here on purpose. This app has a small number of
 * screens, but every one of them is doing something a virtual DOM actively
 * gets in the way of: measuring real geometry for FLIP, holding a canvas
 * across renders, keeping a dragged node under the finger while the list
 * beneath it re-sorts. Reconciling by key and mutating in place is both
 * smaller and more direct than fighting a diff.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('div.card', {onclick}, children) */
export function h(spec, props = null, ...children) {
  let tag = spec, id = null;
  const classes = [];
  const m = /^([a-zA-Z0-9-]+)?((?:[.#][^.#]+)*)$/.exec(spec);
  if (m) {
    tag = m[1] || 'div';
    for (const tok of (m[2] || '').match(/[.#][^.#]+/g) || []) {
      if (tok[0] === '.') classes.push(tok.slice(1));
      else id = tok.slice(1);
    }
  }
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;
  applyProps(el, props);
  append(el, children);
  return el;
}

export function svg(path, { size = 22, stroke = 2, fill = 'none', viewBox = '0 0 24 24' } = {}) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.setAttribute('fill', fill);
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', stroke);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  for (const d of Array.isArray(path) ? path : [path]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    el.appendChild(p);
  }
  return el;
}

function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v, k === 'ontouchstart' ? { passive: true } : undefined);
    } else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list' && typeof v !== 'object') {
      try { el[k] = v; } catch { el.setAttribute(k, v); }
    } else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false || c === '') continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/**
 * Reconciles a keyed list in place.
 *
 * Existing nodes are reused and only reordered, which is what makes FLIP and
 * in-flight drag gestures survive a re-render.
 */
export function reconcile(container, items, keyOf, create, update) {
  const existing = new Map();
  for (const node of [...container.children]) {
    const k = node.dataset.key;
    if (k != null) existing.set(k, node);
  }
  const seen = new Set();
  let cursor = null;

  for (const item of items) {
    const key = String(keyOf(item));
    seen.add(key);
    let node = existing.get(key);
    if (!node) {
      node = create(item);
      node.dataset.key = key;
      node.dataset.flipKey = key;
    } else if (update) {
      // An update may need to swap the element wholesale. It returns the
      // replacement so positioning below acts on the node that is actually in
      // the document — calling replaceWith() and letting this loop reinsert the
      // detached original is how a row ends up rendered twice.
      const replacement = update(node, item);
      if (replacement && replacement !== node) {
        replacement.dataset.key = key;
        replacement.dataset.flipKey = key;
        if (node.parentNode === container) node.replaceWith(replacement);
        node = replacement;
      }
    }
    const next = cursor ? cursor.nextSibling : container.firstChild;
    if (next !== node) container.insertBefore(node, next);
    cursor = node;
  }
  for (const [k, node] of existing) if (!seen.has(k)) node.remove();
  return container;
}

/** Debounced rAF batching for anything that would otherwise thrash layout. */
export function raf(fn) {
  let id = 0;
  return (...args) => {
    if (id) return;
    id = requestAnimationFrame(() => { id = 0; fn(...args); });
  };
}

export function on(el, type, handler, opts) {
  el.addEventListener(type, handler, opts);
  return () => el.removeEventListener(type, handler, opts);
}

/** Long-press that does not fight scrolling: cancels on any meaningful move. */
export function longPress(el, handler, { ms = 480, slop = 10 } = {}) {
  let timer = 0, sx = 0, sy = 0, fired = false;
  const clearTimer = () => { clearTimeout(timer); timer = 0; };
  const down = (e) => {
    const t = e.touches ? e.touches[0] : e;
    sx = t.clientX; sy = t.clientY; fired = false;
    timer = setTimeout(() => { fired = true; handler(e); }, ms);
  };
  const move = (e) => {
    if (!timer) return;
    const t = e.touches ? e.touches[0] : e;
    if (Math.abs(t.clientX - sx) > slop || Math.abs(t.clientY - sy) > slop) clearTimer();
  };
  const up = () => clearTimer();
  el.addEventListener('pointerdown', down, { passive: true });
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerup', up, { passive: true });
  el.addEventListener('pointercancel', up, { passive: true });
  return { destroy() { clearTimer(); }, get fired() { return fired; } };
}

export const ICON = {
  check: 'M20 6 9 17l-5-5',
  nav: 'M3 11l19-9-9 19-2-8-8-2z',
  map: ['M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z', 'M9 3v15', 'M15 6v15'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  chart: ['M3 3v18h18', 'M7 15l4-5 3 3 5-7'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z'],
  skip: ['M5 4l10 8-10 8V4z', 'M19 5v14'],
  push: ['M13 5l7 7-7 7', 'M4 12h16'],
  note: ['M4 4h13l3 3v13H4z', 'M8 10h8', 'M8 14h5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  pin: ['M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  grip: ['M9 6h.01', 'M9 12h.01', 'M9 18h.01', 'M15 6h.01', 'M15 12h.01', 'M15 18h.01'],
  undo: ['M3 10h11a5 5 0 0 1 0 10H9', 'M3 10l5-5', 'M3 10l5 5'],
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  download: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 21h16'],
  upload: ['M12 21V9', 'M7 13l5-5 5 5', 'M4 3h16'],
  warn: ['M12 3 2 20h20L12 3z', 'M12 9v5', 'M12 17h.01'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 12h.01'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 8v4l3 2'],
  chevron: 'M9 5l7 7-7 7',
  layers: ['M12 3 3 8l9 5 9-5-9-5z', 'M3 14l9 5 9-5'],
};
