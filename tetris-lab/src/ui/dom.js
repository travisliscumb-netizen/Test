/* Tiny DOM toolkit: element builder, icons, toasts, dialogs. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === undefined || sv === null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

/** Append children like h() does: arrays are flattened, null/false skipped. */
export function add(el, ...children) { append(el, children); return el; }

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* Stroke icons (24x24). */
const PATHS = {
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  lab: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  drop: '<path d="M12 3v14M6 11l6 6 6-6M5 21h14"/>',
  cw: '<path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 4v5h-5"/>',
  ccw: '<path d="M4 12a8 8 0 102.3-5.6"/><path d="M4 4v5h5"/>',
  hold: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/>',
  flip: '<path d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  medal: '<circle cx="12" cy="14" r="6"/><path d="M8.5 3L12 8l3.5-5M12 11v6M10 13l2-2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8M8 21v-7h8v7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  compare: '<path d="M8 4v16M16 4v16M4 8h8M12 16h8"/>',
  spark: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01M9 18h6"/><circle cx="12" cy="3" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  hex: '<path d="M7 4h10l5 8-5 8H7l-5-8z"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 00-14.9-3M4 13a8 8 0 0014.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>'
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || PATHS.star}</svg>`;
  return span.firstChild;
}

/* ------------------------------------------------------------- toasts -- */

export function toast(title, sub = '', { iconName = 'star', error = false, ms = 3400 } = {}) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' },
    h('div', { class: 'ti' }, icon(iconName)),
    h('div', {}, h('b', {}, title), sub ? h('small', {}, sub) : null));
  root.append(el);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

/* ------------------------------------------------------------ dialogs -- */

let openStack = [];

/**
 * Open a modal dialog. `build(close)` returns the dialog's content nodes.
 * Returns { close, el }. Escape and backdrop clicks call onDismiss.
 */
export function modal(build, { onDismiss = null, label = 'Dialog', wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    openStack = openStack.filter((o) => o !== api);
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
  };
  const dialog = h('div', { class: 'panel dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, style: wide ? { width: 'min(900px, 100%)' } : null });
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay && onDismiss) { onDismiss(); close(); } } }, dialog);
  const content = build(close);
  append(dialog, [content]);
  root.append(overlay);
  const onKey = (e) => {
    if (openStack[openStack.length - 1] !== api) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (onDismiss) onDismiss(); close(); }
    if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  const api = { close, el: dialog };
  openStack.push(api);
  requestAnimationFrame(() => {
    const target = dialog.querySelector('[autofocus]') || dialog.querySelector('.btn, button, input');
    target?.focus();
  });
  return api;
}

export function anyModalOpen() { return openStack.length > 0; }

export function confirmDialog(title, text, { ok = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    modal((close) => [
      h('h2', {}, title),
      h('p', {}, text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => { close(); resolve(false); } }, 'Cancel'),
        h('button', { class: `btn${danger ? ' danger' : ''}`, autofocus: true, onclick: () => { close(); resolve(true); } }, ok))
    ], { onDismiss: () => resolve(false), label: title });
  });
}

export function promptDialog(title, value = '', { ok = 'Save', max = 40, label = 'Name' } = {}) {
  return new Promise((resolve) => {
    let input;
    const submit = (close) => { const v = input.value.trim(); if (!v) { input.focus(); return; } close(); resolve(v.slice(0, max)); };
    modal((close) => [
      h('h2', {}, title),
      h('label', { class: 'field' }, h('span', {}, label),
        input = h('input', { type: 'text', value, maxlength: String(max), autofocus: true, onkeydown: (e) => { if (e.key === 'Enter') submit(close); } })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => { close(); resolve(null); } }, 'Cancel'),
        h('button', { class: 'btn', onclick: () => submit(close) }, ok))
    ], { onDismiss: () => resolve(null), label: title });
    setTimeout(() => { input?.select(); }, 30);
  });
}

export function fmtTime(ms) {
  const t = Math.max(0, Math.floor(ms / 10));
  const m = Math.floor(t / 6000), s = Math.floor((t % 6000) / 100), cs = t % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
export function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }

export function sw(checked, onChange, label) {
  const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label });
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

export function seg(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const [v, text] of options) {
    const b = h('button', { 'aria-pressed': String(v === value), onclick: () => {
      for (const x of wrap.children) x.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      onChange(v);
    } }, text);
    wrap.append(b);
  }
  return wrap;
}

export function slider(value, min, max, step, onInput, label) {
  const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
  const paint = () => r.style.setProperty('--fill', `${((r.value - min) / (max - min)) * 100}%`);
  paint();
  r.addEventListener('input', () => { paint(); onInput(Number(r.value)); });
  return r;
}
