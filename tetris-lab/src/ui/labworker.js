/* Client for the Lab worker. One job at a time; cancel() terminates the
   worker (the design loop is synchronous) and a fresh one is created for the
   next job. Falls back to running on the main thread, in yielding chunks, if
   module workers are unavailable. */

let worker = null;
let seq = 0;
let current = null;

function spawn() {
  try {
    worker = new Worker(new URL('../lab/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (!current || m.id !== current.id) return;
      if (m.type === 'progress') current.onProgress?.(m);
      else if (m.type === 'result') current.onResult?.(m.result, m.index);
      else if (m.type === 'done') { const c = current; current = null; c.resolve(m.results); }
      else if (m.type === 'error') { const c = current; current = null; c.reject(new Error(m.message)); }
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      if (current) { const c = current; current = null; c.reject(new Error(e.message || 'Lab worker crashed')); }
      worker?.terminate();
      worker = null;
    };
    return true;
  } catch {
    worker = null;
    return false;
  }
}

async function runInline(msg, handlers) {
  const designer = await import('../lab/designer.js');
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  if (msg.type === 'session') {
    const results = [];
    for (let i = 0; i < msg.count; i++) {
      if (handlers.cancelled) break;
      await yieldFrame();
      const [r] = designer.runSession({ count: 1, seed: (msg.seed + i * 7919) >>> 0, archetypes: msg.archetypes, onProgress: (p) => handlers.onProgress?.({ ...p, index: i, count: msg.count }) });
      results.push(r);
      handlers.onResult?.(r, i);
    }
    return results;
  }
  const results = [];
  for (let i = 0; i < msg.concepts.length; i++) {
    if (handlers.cancelled) break;
    await yieldFrame();
    const r = designer.designConcept(msg.concepts[i], { seed: msg.seed + i * 101, maxIterations: msg.maxIterations ?? 5, onProgress: (p) => handlers.onProgress?.({ ...p, index: i, count: msg.concepts.length }) });
    results.push(r);
    handlers.onResult?.(r, i);
  }
  return results;
}

/**
 * Run a job. msg: { type: 'session' | 'design', ... }.
 * Returns a promise of results; handlers get progress and per-item results.
 */
export function runLabJob(msg, handlers = {}) {
  cancelLabJob();
  const id = ++seq;
  if (!worker && !spawn()) {
    const h = { ...handlers, cancelled: false };
    current = { id, inline: h };
    return runInline(msg, h).finally(() => { if (current?.id === id) current = null; });
  }
  return new Promise((resolve, reject) => {
    current = { id, resolve, reject, ...handlers };
    worker.postMessage({ ...msg, id });
  });
}

export function cancelLabJob() {
  if (!current) return;
  if (current.inline) { current.inline.cancelled = true; current = null; return; }
  const c = current;
  current = null;
  worker?.terminate();
  worker = null;
  c.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
}

export function labBusy() { return !!current; }
