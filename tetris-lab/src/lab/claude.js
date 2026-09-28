/* Optional Claude designer.

   The on-device generator explores a fixed grammar of mechanics. Claude can
   explore that grammar far more freely -- inventing piece families, combining
   rules, writing the design rationale -- but it never gets a free pass: every
   concept it returns goes through the same validate -> simulate -> critique
   loop as local designs, and the critic's findings are sent back to Claude for
   a revision round.

   WHY RAW FETCH: this is a zero-build static site (like Cashpilot in this
   repo). Bundling @anthropic-ai/sdk would require a build step or a runtime
   CDN load that breaks offline play; the Messages API is one JSON endpoint.

   WHY THE KEY IS IN THE BROWSER: the player pastes their own key; it is kept
   only in this browser's localStorage and sent only to api.anthropic.com.
   Direct browser access is a documented, explicitly opted-in mode. */

import { LIMITS, CLEAR_RULES, GRAVITY_MODES, COLOR_MODES, SPEED_CURVES } from '../engine/rules.js';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (best designs)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster, cheaper)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest)' }
];
export const DEFAULT_MODEL = 'claude-opus-5';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class ClaudeError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = 'ClaudeError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function looksLikeKey(key) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(key || '').trim());
}

/* Structured-output schema. Structured outputs require additionalProperties:
   false on every object and do not support numeric bounds, so ranges are
   stated in the prompt and enforced by normalizeConcept()/validateConcept(). */
const CELL = { type: 'array', items: { type: 'integer' } };
const PIECE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'cells', 'rotation', 'connect', 'morphs', 'weight'],
  properties: {
    name: { type: 'string' },
    cells: { type: 'array', items: CELL },
    rotation: { type: 'string', enum: ['rotate', 'none', 'flip', 'full', 'morph'] },
    connect: { type: 'string', enum: ['edge', 'corner', 'loose'] },
    morphs: { type: 'array', items: { type: 'array', items: CELL } },
    weight: { type: 'string', enum: ['light', 'normal', 'heavy'] }
  }
};
const CONCEPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'problem', 'rationale', 'lattice', 'width', 'height', 'wrap', 'pieces', 'clearRule', 'gaps', 'matchSize',
    'colorMode', 'colors', 'gravityMode', 'garbageEvery', 'bombChance', 'wildChance', 'speedCurve', 'placement', 'placeSeconds'],
  properties: {
    name: { type: 'string' },
    problem: { type: 'string' },
    rationale: { type: 'string' },
    lattice: { type: 'string', enum: ['square', 'hex'] },
    width: { type: 'integer' },
    height: { type: 'integer' },
    wrap: { type: 'boolean' },
    pieces: { type: 'array', items: PIECE_SCHEMA },
    clearRule: { type: 'string', enum: CLEAR_RULES },
    gaps: { type: 'integer' },
    matchSize: { type: 'integer' },
    colorMode: { type: 'string', enum: COLOR_MODES },
    colors: { type: 'integer' },
    gravityMode: { type: 'string', enum: GRAVITY_MODES },
    garbageEvery: { type: 'integer' },
    bombChance: { type: 'number' },
    wildChance: { type: 'number' },
    speedCurve: { type: 'string', enum: SPEED_CURVES },
    placement: { type: 'string', enum: ['gravity', 'timed'] },
    placeSeconds: { type: 'number' }
  }
};
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: { concepts: { type: 'array', items: CONCEPT_SCHEMA } }
};

const SYSTEM = `You are the lead designer of an experimental falling-block puzzle laboratory. Your designs are executed by a real engine and play-tested by bots before anyone sees them, so every field must be something the engine can run.

WHAT THE ENGINE SUPPORTS (the whole design space):
- lattice "square" (cells [x,y], y grows downward) or "hex" (flat-top hexes, axial [q,r]: neighbours are [1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]; [0,1] is straight down). Hex rows clear as zig-zag lines.
- board width ${LIMITS.width[0]}-${LIMITS.width[1]}, height ${LIMITS.height[0]}-${LIMITS.height[1]}. wrap=true (square only) makes the side walls wrap around.
- pieces: 1-8 cells each, 3-9 pieces per set. connect says how cells join: "edge", "corner" (diagonal joins allowed), "loose" (cells may be separated by one empty cell). A piece's widest orientation must be at most width-2.
- rotation: "rotate" (normal), "none" (fixed), "flip" (rotate button mirrors), "full" (rotate + separate mirror), "morph" (rotate cycles through the piece's cells and each shape in morphs; every morph must have exactly the same number of cells). morphs must be [] unless rotation is "morph".
- clearRule "line" (full rows), "line-gap" (rows with at most gaps empty cells clear; gaps 1-2), "color-match" (connected same-colour groups of matchSize 3-8 clear; forces cascade gravity; use colorMode "random-cells" or "random-piece" and colors 3-5).
- gravityMode "naive" (rows above shift down) or "cascade" (every cell falls into holes, enabling chain reactions).
- garbageEvery 0-40 (a garbage row rises every N pieces; 0 = off). bombChance 0-0.35 (chance a piece carries a bomb cell that blasts its neighbours when cleared). wildChance 0-0.35 (colour-match only: wildcard cells).
- speedCurve "gentle" | "standard" | "steep".
- placement "gravity" (pieces fall) or "timed" (no gravity: each piece hovers until placed, or drops itself after placeSeconds 1.5-10, shrinking with level).
- each piece's weight: "light" (drifts at half speed), "normal", or "heavy" (falls about twice as fast).

WHAT MAKES A DESIGN GOOD (this is how the critic scores it):
- A simulated average player should last most of a 200-piece test without it being trivial: the stack should average 30-60% of the well.
- Clears every 2-5 pieces. Placements should have real consequences (good and bad options), and orientation choices should matter.
- Every mechanic you enable must actually come into play.
- It must be clearly different from classic Tetris. Invent: new piece families, mechanic combinations nobody has tried, deliberate tensions between rules.

For each concept, "problem" names the gameplay problem or opportunity it addresses and "rationale" explains how the rules create interesting decisions. Keep both to two sentences.`;

async function call(apiKey, model, messages, signal) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
        'anthropic-beta': FALLBACK_BETA,
        // Required for browser calls; without it CORS preflight fails opaquely.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        ...(model.startsWith('claude-opus-5') ? { fallbacks: 'default' } : {}),
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
        messages
      })
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new ClaudeError('Cancelled.');
    throw new ClaudeError('Could not reach Claude. Check your connection.', { retryable: true });
  }
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = payload?.error?.message || `HTTP ${res.status}`;
    const friendly = res.status === 401 ? 'Claude rejected the API key. Check it in Settings.'
      : res.status === 429 ? 'Rate limited by the API. Wait a moment and try again.'
      : res.status === 529 || res.status >= 500 ? 'Claude is temporarily overloaded. Try again shortly.'
      : res.status === 400 ? `The request was rejected: ${msg}`
      : `Claude request failed: ${msg}`;
    throw new ClaudeError(friendly, { status: res.status, retryable: res.status === 429 || res.status >= 500 });
  }
  if (payload?.stop_reason === 'refusal') throw new ClaudeError('Claude declined this request.');
  if (payload?.stop_reason === 'max_tokens') throw new ClaudeError('Claude ran out of room before finishing. Try fewer concepts.');
  const text = (payload?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new ClaudeError('Claude returned malformed JSON.'); }
  if (!parsed || !Array.isArray(parsed.concepts)) throw new ClaudeError('Claude returned no concepts.');
  return { parsed, assistantContent: payload.content };
}

/** Convert Claude's flat schema into an engine concept. Never throws. */
export function toConcept(raw, index = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const palette = [5, 2, 4, 6, 3, 1].slice(0, Math.max(3, Math.min(6, Number(r.colors) || 4)));
  const colors = [9, 13, 17, 21, 25, 29, 11, 15, 19, 23, 27];
  const pieces = (Array.isArray(r.pieces) ? r.pieces : []).slice(0, 12).map((p, i) => ({
    id: `c${i}`,
    name: String(p?.name || `Form ${i + 1}`).slice(0, 18),
    cells: Array.isArray(p?.cells) ? p.cells : [],
    rotation: p?.rotation || 'rotate',
    ...(p?.rotation === 'morph' && Array.isArray(p?.morphs) && p.morphs.length ? { morphs: p.morphs } : {}),
    connect: p?.connect || 'edge',
    color: colors[i % colors.length],
    weight: 1,
    ...(p?.weight === 'light' ? { fall: 0.5 } : p?.weight === 'heavy' ? { fall: 2 } : {}),
    tags: ['claude']
  }));
  return {
    id: `claude-${Date.now().toString(36)}-${index}`,
    name: String(r.name || 'Claude Concept').slice(0, 40),
    lattice: r.lattice,
    board: { width: r.width, height: r.height },
    wrap: !!r.wrap,
    pieces,
    generation: 'bag',
    colorMode: r.clearRule === 'color-match' ? (r.colorMode === 'piece' ? 'random-cells' : r.colorMode) : 'piece',
    palette,
    clear: { rule: r.clearRule, gaps: r.gaps, matchSize: r.matchSize },
    gravityMode: r.gravityMode,
    garbage: { every: r.garbageEvery },
    specials: { bomb: r.bombChance, wild: r.wildChance },
    scoring: { kind: 'lab' },
    speed: { curve: r.speedCurve, linesPerLevel: 10 },
    placement: { mode: r.placement === 'timed' ? 'timed' : 'gravity', seconds: r.placeSeconds },
    design: {
      archetype: 'claude',
      archetypeTitle: 'Claude original',
      problem: String(r.problem || '').slice(0, 400),
      rationale: String(r.rationale || '').slice(0, 400),
      twists: [],
      source: 'claude',
      journal: []
    }
  };
}

/**
 * Ask Claude for `count` concepts. Returns { concepts, conversation } where
 * conversation can be passed to revise().
 */
export async function requestConcepts({ apiKey, model = DEFAULT_MODEL, count = 3, theme = '', signal }) {
  const ask = `Design ${count} distinct experimental concepts${theme ? ` around this theme: "${theme.slice(0, 200)}"` : ''}. Make them genuinely different from each other and from classic Tetris.`;
  const messages = [{ role: 'user', content: ask }];
  const { parsed, assistantContent } = await call(apiKey, model, messages, signal);
  messages.push({ role: 'assistant', content: assistantContent });
  return { concepts: parsed.concepts.slice(0, count).map(toConcept), conversation: messages };
}

/**
 * Send the critic's findings back and ask for revised versions of the
 * concepts that were not accepted.
 */
export async function revise({ apiKey, model = DEFAULT_MODEL, conversation, reviews, signal }) {
  const lines = reviews.map((r, i) => {
    const head = `Concept ${i + 1} "${r.name}": ${r.verdict}${Number.isFinite(r.score) ? ` (score ${r.score.toFixed(2)})` : ''}.`;
    const body = r.findings.length ? r.findings.map((f) => `  - ${f}`).join('\n') : '  - no specific findings';
    return `${head}\n${body}`;
  }).join('\n');
  const messages = [
    ...conversation,
    { role: 'user', content: `Our simulator and critic tested your designs. Findings:\n${lines}\n\nReturn revised versions of ONLY the concepts that were not accepted, in the same order, fixing the specific problems found while keeping each concept's core idea.` }
  ];
  const { parsed, assistantContent } = await call(apiKey, model, messages, signal);
  messages.push({ role: 'assistant', content: assistantContent });
  return { concepts: parsed.concepts.map(toConcept), conversation: messages };
}
