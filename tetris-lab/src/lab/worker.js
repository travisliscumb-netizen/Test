/* Lab worker. Runs design sessions off the main thread so the UI and the
   background animation stay smooth while dozens of simulated games are played.

   Protocol (every message carries the caller's `id`):
     in:  { type: 'session', count, seed, archetypes }
          { type: 'design', concepts: [raw...], seed, maxIterations }
     out: { type: 'progress', ... } { type: 'result', index, result }
          { type: 'done', results } { type: 'error', message }
   Cancellation is done by terminating the worker; the loop is synchronous. */

import { runSession, designConcept } from './designer.js';

self.onmessage = (ev) => {
  const msg = ev.data || {};
  const { id } = msg;
  const post = (m) => self.postMessage({ id, ...m });
  try {
    if (msg.type === 'session') {
      const results = runSession({
        count: Math.max(1, Math.min(8, msg.count | 0 || 4)),
        seed: msg.seed >>> 0,
        archetypes: msg.archetypes || null,
        onProgress: (p) => post({ type: 'progress', ...p }),
        onResult: (result, index) => post({ type: 'result', index, result })
      });
      post({ type: 'done', results });
    } else if (msg.type === 'design') {
      const list = Array.isArray(msg.concepts) ? msg.concepts : [];
      const results = [];
      list.forEach((raw, index) => {
        let result;
        try {
          result = designConcept(raw, {
            seed: (msg.seed >>> 0) + index * 101,
            maxIterations: msg.maxIterations ?? 5,
            onProgress: (p) => post({ type: 'progress', ...p, index, count: list.length })
          });
        } catch (e) {
          result = { verdict: 'rejected', score: 0, concept: raw, journal: [], reasons: [`design loop crashed: ${e.message}`] };
        }
        results.push(result);
        post({ type: 'result', index, result });
      });
      post({ type: 'done', results });
    } else {
      post({ type: 'error', message: `unknown request ${msg.type}` });
    }
  } catch (e) {
    post({ type: 'error', message: e.message || String(e) });
  }
};
