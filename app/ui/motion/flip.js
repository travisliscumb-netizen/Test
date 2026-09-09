/**
 * FLIP transitions.
 *
 * When the route reorders, the rows must appear to *move* rather than to
 * blink into a new arrangement. Reading every row's position before the change
 * and again after, then playing the difference back on the compositor, is the
 * only way to do that without animating layout properties.
 *
 * All reads happen in one pass and all writes in another, so the browser is
 * never forced into a synchronous reflow mid-loop.
 */

import { Spring, SPRING, ticker, prefersCalm } from './spring.js';

export function measure(elements) {
  const map = new Map();
  for (const el of elements) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    map.set(el.dataset.flipKey || el, { x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return map;
}

/**
 * Plays elements from their previously measured positions to where they are now.
 * @param {Map} before  result of measure() taken before the DOM changed
 * @param {Element[]} elements  the same elements, after the DOM changed
 */
export function play(before, elements, { config = SPRING.glide, stagger = 0 } = {}) {
  const moves = [];
  for (const el of elements) {
    if (!el) continue;
    const key = el.dataset.flipKey || el;
    const prev = before.get(key);
    if (!prev) { moves.push({ el, dx: 0, dy: 0, fresh: true }); continue; }
    const r = el.getBoundingClientRect();
    const dx = prev.x - r.left;
    const dy = prev.y - r.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    moves.push({ el, dx, dy, fresh: false });
  }
  if (!moves.length) return Promise.resolve();

  if (prefersCalm()) {
    for (const m of moves) {
      if (!m.fresh) continue;
      m.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
    }
    return Promise.resolve();
  }

  const anims = moves.map((m, i) => {
    if (m.fresh) {
      m.el.style.willChange = 'transform, opacity';
      const a = m.el.animate(
        [{ transform: 'translate3d(0,10px,0)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 260, delay: i * stagger, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }
      );
      return a.finished.then(() => { m.el.style.willChange = ''; }).catch(() => {});
    }
    return springTo(m.el, m.dx, m.dy, config, i * stagger);
  });
  return Promise.all(anims);
}

function springTo(el, dx, dy, config, delay) {
  return new Promise((resolve) => {
    const sx = new Spring(dx, config);
    const sy = new Spring(dy, config);
    sx.to(0); sy.to(0);
    el.style.willChange = 'transform';
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    let waited = 0;
    ticker.add((dt) => {
      if (delay && waited < delay / 1000) { waited += dt; return true; }
      const a = sx.advance(dt);
      const b = sy.advance(dt);
      el.style.transform = `translate3d(${sx.value.toFixed(2)}px, ${sy.value.toFixed(2)}px, 0)`;
      if (!a && !b) {
        el.style.transform = '';
        el.style.willChange = '';
        resolve();
        return false;
      }
      return true;
    });
  });
}

/**
 * Runs `mutate` between a measure and a play. The whole reorder animation is
 * this one call, which keeps the read/write discipline impossible to get wrong
 * at the call site.
 */
export async function transition(container, selector, mutate, opts) {
  const before = measure([...container.querySelectorAll(selector)]);
  await mutate();
  const after = [...container.querySelectorAll(selector)];
  return play(before, after, opts);
}
