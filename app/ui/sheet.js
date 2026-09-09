/**
 * The bottom sheet.
 *
 * Drag-dismissible with real momentum: the decision to close is made on
 * velocity as well as distance, so a quick flick closes from anywhere and a
 * slow drag that stops short springs back. The sheet tracks the finger exactly
 * while dragging — a sheet that lags behind the thumb is the single most
 * common tell that a web app is not native.
 */

import { h, clear, on } from './dom.js';
import { Spring, SPRING, ticker, prefersCalm } from './motion/spring.js';
import { haptic } from './motion/haptics.js';

let active = null;

export function openSheet({ title, subtitle, masthead, content, footer, onClose, labelledBy }) {
  closeSheet(true);

  const scrim = h('div.scrim', { dataset: { open: 'false' } });
  const sheet = h('section.sheet', {
    role: 'dialog', 'aria-modal': 'true',
    'aria-label': labelledBy ? undefined : (title || 'Details'),
  });

  const grabber = h('div.grabber', { 'aria-hidden': 'true' }, h('i'));
  sheet.appendChild(grabber);
  // A caller that brings its own masthead gets it verbatim: `title` then only
  // names the dialog for assistive tech rather than drawing a heading twice.
  if (masthead) sheet.appendChild(masthead);
  else if (title) {
    sheet.appendChild(h('header.sheet-title', null,
      h('h2', { text: title }),
      subtitle ? h('p', { text: subtitle }) : null));
  }
  const scroll = h('div.scroll');
  if (content) scroll.appendChild(content);
  sheet.appendChild(scroll);
  if (footer) sheet.appendChild(h('div.foot', null, footer));

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  const y = new Spring(sheet.getBoundingClientRect().height || 400, SPRING.settle);
  const apply = () => { sheet.style.transform = `translate3d(0, ${Math.max(0, y.value).toFixed(1)}px, 0)`; };

  const rec = { scrim, sheet, y, onClose, closing: false, cleanup: [] };
  active = rec;

  requestAnimationFrame(() => {
    const height = sheet.getBoundingClientRect().height;
    y.jump(height);
    apply();
    scrim.dataset.open = 'true';
    if (prefersCalm()) { y.jump(0); apply(); }
    else {
      y.to(0);
      ticker.add((dt) => { const m = y.advance(dt); apply(); return m; });
    }
    (sheet.querySelector('[autofocus]') || sheet).focus?.();
  });

  // ---- drag to dismiss ----------------------------------------------------
  //
  // The gesture arms on pointerdown but does not *take* the pointer until the
  // finger has actually travelled downward past a threshold. Capturing on
  // contact would redirect every subsequent event — including the click — to
  // the sheet, which silently kills every button inside it. That is a bug this
  // code had, and the threshold is the fix: a tap is never a drag.
  let armed = false, dragging = false;
  let startY = 0, startVal = 0, lastY = 0, lastT = 0, vel = 0, pid = null;
  const DRAG_THRESHOLD = 9;

  const isControl = (el) =>
    !!el?.closest?.('button, a, input, textarea, select, label, [role="button"]');

  const canDragFrom = (target) => {
    if (grabber.contains(target)) return true;
    if (isControl(target)) return false;
    return scroll.scrollTop <= 0;
  };

  const down = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (!canDragFrom(e.target)) return;
    armed = true;
    dragging = false;
    pid = e.pointerId;
    startY = e.clientY; lastY = e.clientY; lastT = performance.now();
    startVal = y.value; vel = 0;
  };

  const move = (e) => {
    if (!armed || e.pointerId !== pid) return;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (dy < DRAG_THRESHOLD) {
        // Moving up, or not yet past the threshold: leave the sheet alone so
        // the content can scroll and a tap can still become a click.
        if (dy < -DRAG_THRESHOLD) armed = false;
        return;
      }
      dragging = true;
      sheet.setPointerCapture?.(pid);
    }

    const next = dy < 0 ? startVal + dy * 0.22 : startVal + dy;
    y.jump(Math.max(-24, next));
    apply();
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    vel = ((e.clientY - lastY) / dt) * 1000;
    lastY = e.clientY; lastT = now;
  };

  const up = (e) => {
    if (e && pid != null && e.pointerId !== pid) return;
    const wasDragging = dragging;
    armed = false;
    dragging = false;
    pid = null;
    if (!wasDragging) return;   // a tap: the click proceeds untouched

    const height = sheet.getBoundingClientRect().height || 400;
    const shouldClose = vel > 780 || (y.value > height * 0.34 && vel > -240);
    if (shouldClose) { haptic('tap'); closeSheet(); }
    else {
      y.to(0, vel / 1000);
      ticker.add((dt) => { const m = y.advance(dt); apply(); return m; });
    }
  };

  rec.cleanup.push(on(sheet, 'pointerdown', down));
  rec.cleanup.push(on(sheet, 'pointermove', move));
  rec.cleanup.push(on(sheet, 'pointerup', up));
  rec.cleanup.push(on(sheet, 'pointercancel', up));
  rec.cleanup.push(on(scrim, 'click', () => closeSheet()));
  rec.cleanup.push(on(document, 'keydown', (e) => { if (e.key === 'Escape') closeSheet(); }));

  return { close: () => closeSheet(), element: sheet, scroll };
}

export function closeSheet(immediate = false) {
  const rec = active;
  if (!rec || rec.closing) return;
  rec.closing = true;
  active = null;
  for (const off of rec.cleanup) off();

  const finish = () => {
    rec.sheet.remove();
    rec.scrim.remove();
    rec.onClose?.();
  };
  rec.scrim.dataset.open = 'false';
  if (immediate || prefersCalm()) { finish(); return; }

  const height = rec.sheet.getBoundingClientRect().height || 400;
  rec.y.set(SPRING.snap).to(height + 30);
  ticker.add((dt) => {
    const moving = rec.y.advance(dt);
    rec.sheet.style.transform = `translate3d(0, ${rec.y.value.toFixed(1)}px, 0)`;
    if (!moving || rec.y.value > height) { finish(); return false; }
    return true;
  });
}

export function sheetIsOpen() { return !!active; }
