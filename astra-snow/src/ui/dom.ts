// Tiny DOM helpers. No framework: the HUD updates a handful of nodes per
// second and owns its animation timing directly.

type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

export function setText(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

export function clock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '--:--';
  return new Intl.DateTimeFormat('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto' }).format(ms);
}

export function duration(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const m = Math.max(0, Math.round(min));
  const hh = Math.floor(m / 60);
  return hh ? `${hh}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export function ago(ms: number | null | undefined, now: number): string {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = m / 60;
  return h < 36 ? `${h.toFixed(1)} h ago` : `${Math.round(h / 24)} d ago`;
}

export function metres(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return '—';
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

/** Long-press helper with a visible fill; resolves on completion. */
export function holdToConfirm(el: HTMLElement, ms: number, onDone: () => void): void {
  let timer: number | null = null;
  const start = (e: Event) => {
    e.preventDefault();
    el.classList.add('holding');
    el.style.setProperty('--hold-ms', `${ms}ms`);
    timer = window.setTimeout(() => {
      el.classList.remove('holding');
      timer = null;
      onDone();
    }, ms);
  };
  const cancel = () => {
    el.classList.remove('holding');
    if (timer) window.clearTimeout(timer);
    timer = null;
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
}
