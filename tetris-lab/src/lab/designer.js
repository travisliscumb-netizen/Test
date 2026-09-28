/* The design loop.

     GENERATE -> VALIDATE -> SIMULATE -> CRITIQUE -> REFINE -> (repeat) -> CONFIRM

   designConcept() takes one raw concept (from the local generator, from
   Claude, or from the player's editor) through the loop, keeping the best
   version seen and a journal of every round. An accepted design is then
   re-simulated on fresh seeds; if the confirmation run disagrees, the design
   is downgraded, so a lucky seed can never make a bad design look good.

   Everything here is synchronous and DOM-free: it runs in a Web Worker in the
   browser and directly under Node in the test suite. */

import { validateConcept } from './validate.js';
import { simulate } from './simulate.js';
import { critique, summarizeMetrics, ACCEPT_SCORE } from './critic.js';
import { refine } from './refine.js';
import { generateConcept, ARCHETYPES, describe } from './generator.js';
import { Rng } from '../engine/rng.js';

export const SIM_OPTIONS = { games: 3, pieces: 200 };

const round2 = (v) => Math.round(v * 100) / 100;

export function designConcept(raw, { seed = 1, maxIterations = 5, onProgress = () => {}, sim = SIM_OPTIONS, confirm = true } = {}) {
  const journal = [];
  let current = raw;
  let best = null;
  let pendingChanges = [];
  const name = raw?.name || 'Untitled';

  for (let iter = 0; iter < maxIterations; iter++) {
    const version = iter + 1;
    onProgress({ stage: 'validate', name: current?.name || name, version, concept: current });
    const v = validateConcept(current);
    if (!v.ok) {
      journal.push({ version, stage: 'validate', verdict: 'invalid', errors: v.errors.slice(0, 6), changes: pendingChanges.map((c) => c.text) });
      break;
    }
    onProgress({ stage: 'simulate', name: v.concept.name, version });
    const m = simulate(v.rules, { ...sim, seed: seed + iter * 17 });
    onProgress({ stage: 'critique', name: v.concept.name, version });
    const review = critique(v.concept, m, v);
    journal.push({
      version,
      stage: 'review',
      changes: pendingChanges.map((c) => c.text),
      score: round2(review.score),
      components: Object.fromEntries(Object.entries(review.components).map(([k, x]) => [k, round2(x)])),
      metrics: summarizeMetrics(m),
      weaknesses: review.weaknesses.map((w) => w.text),
      strengths: review.strengths,
      verdict: review.verdict,
      warnings: v.warnings.slice(0, 4)
    });
    const rank = (r) => (r.verdict === 'accepted' ? 1 : 0) + r.score;
    if (!best || rank(review) > rank(best.review)) best = { concept: v.concept, review, metrics: m, version };
    if (review.hardFail) break;
    if (review.verdict === 'accepted' && review.weaknesses.length === 0) break;
    if (review.verdict === 'accepted' && best.version !== version) break; // the polish round made it worse; stop
    onProgress({ stage: 'refine', name: v.concept.name, version });
    const next = refine(v.concept, review, seed * 31 + iter);
    if (!next.changes.length) {
      journal.push({ version, stage: 'refine', note: 'No further targeted fixes apply; design exploration exhausted.' });
      break;
    }
    pendingChanges = next.changes;
    current = next.concept;
  }

  if (!best) {
    return {
      verdict: 'rejected', score: 0, concept: sanitizeRejected(raw), journal,
      reasons: journal[journal.length - 1]?.errors || ['invalid design']
    };
  }

  let verdict = best.review.verdict;
  let confirmation = null;
  if (confirm && verdict === 'accepted') {
    onProgress({ stage: 'confirm', name: best.concept.name, version: best.version });
    const v = validateConcept(best.concept);
    const m2 = simulate(v.rules, { ...sim, seed: seed * 7 + 991 });
    const r2 = critique(v.concept, m2, v);
    confirmation = { score: round2(r2.score), verdict: r2.verdict };
    if (r2.hardFail || r2.score < ACCEPT_SCORE - 0.08) {
      verdict = 'needs-work';
      best.confirmFailed = `Scored ${round2(best.review.score)} in testing but only ${round2(r2.score)} when re-played on fresh seeds: ${r2.weaknesses[0]?.text || 'results were not repeatable.'}`;
      journal.push({ version: best.version, stage: 'confirm', note: `Confirmation run on fresh seeds scored ${round2(r2.score)} — not reliable enough to accept.`, score: round2(r2.score) });
    } else {
      journal.push({ version: best.version, stage: 'confirm', note: `Confirmation run on fresh seeds scored ${round2(r2.score)}. Accepted.`, score: round2(r2.score) });
    }
  }

  const concept = {
    ...best.concept,
    tagline: describe(best.concept),
    design: {
      ...(best.concept.design || raw.design || {}),
      journal,
      bestVersion: best.version,
      verdict,
      score: round2(best.review.score),
      components: Object.fromEntries(Object.entries(best.review.components).map(([k, x]) => [k, round2(x)])),
      strengths: best.review.strengths,
      weaknesses: best.review.weaknesses.map((w) => w.text),
      confirmation,
      testedAt: Date.now()
    },
    metrics: summarizeMetrics(best.metrics)
  };
  delete concept.design.tried;
  return {
    verdict,
    score: best.review.score,
    concept,
    journal,
    reasons: verdict === 'accepted' ? [] : best.confirmFailed ? [best.confirmFailed] : (best.review.hardReasons.length ? best.review.hardReasons : best.review.weaknesses.map((w) => w.text))
  };
}

function sanitizeRejected(raw) {
  try { return JSON.parse(JSON.stringify(raw)); } catch { return { name: 'Unreadable concept' }; }
}

/**
 * A full Lab session: generate `count` candidates from distinct archetypes and
 * take each through the design loop.
 */
export function runSession({ count = 4, seed = 1, archetypes = null, onProgress = () => {}, onResult = () => {}, maxIterations = 5, shouldStop = () => false } = {}) {
  const rng = new Rng(seed);
  const pool = rng.shuffle((archetypes && archetypes.length ? ARCHETYPES.filter((a) => archetypes.includes(a.id)) : ARCHETYPES).map((a) => a.id));
  const results = [];
  for (let i = 0; i < count; i++) {
    if (shouldStop()) break;
    const archetypeId = pool[i % pool.length];
    const cSeed = (rng.next() * 4294967296) >>> 0;
    onProgress({ stage: 'generate', index: i, count, archetype: archetypeId });
    let raw;
    try {
      raw = generateConcept(cSeed, { archetypeId });
    } catch (e) {
      const r = { verdict: 'rejected', score: 0, concept: { name: 'Generation failure' }, journal: [], reasons: [e.message] };
      results.push(r); onResult(r, i); continue;
    }
    let r;
    try {
      r = designConcept(raw, { seed: cSeed, maxIterations, onProgress: (p) => onProgress({ ...p, index: i, count }) });
    } catch (e) {
      r = { verdict: 'rejected', score: 0, concept: raw, journal: [], reasons: [`design loop crashed: ${e.message}`] };
    }
    results.push(r);
    onResult(r, i);
  }
  return results;
}
