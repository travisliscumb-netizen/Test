/* Piece thumbnails and concept summary widgets shared by the Lab screens. */

import { h, icon } from './dom.js';
import { drawPieceIcon } from '../render/board.js';
import { compilePiece } from '../engine/pieces.js';

const PAL_FALLBACK = [5, 2, 4, 6];

export function pieceCanvas(app, lattice, def, { w = 64, hgt = 52, unit = 14, state = 0, palette = null } = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = h('canvas', { width: String(Math.round(w * dpr)), height: String(Math.round(hgt * dpr)), style: { width: `${w}px`, height: `${hgt}px` }, 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  let cells = def.cells;
  try {
    const p = compilePiece(def, lattice);
    cells = p.states[Math.min(state, p.states.length - 1)].cells;
  } catch { /* draw raw cells for invalid pieces */ }
  if (!Array.isArray(cells) || !cells.length || cells.some((q) => !Array.isArray(q))) return c;
  const colors = palette ? cells.map((_, i) => palette[i % palette.length]) : [def.color || 9];
  drawPieceIcon(ctx, app.painter, lattice, cells, colors, null, w / 2, hgt / 2, w, hgt, unit);
  return c;
}

export function conceptThumbs(app, concept, max = 8, size = 54) {
  const pal = concept.colorMode && concept.colorMode !== 'piece' ? (concept.palette?.length ? concept.palette : PAL_FALLBACK) : null;
  const list = (concept.pieces || []).slice(0, max).map((p) => pieceCanvas(app, concept.lattice || 'square', p, { w: size, hgt: size * 0.8, unit: size / 4.2, palette: pal }));
  const extra = (concept.pieces || []).length - max;
  return h('div', { class: 'thumbs' }, list, extra > 0 ? h('span', { class: 'chip' }, `+${extra}`) : null);
}

export function scoreRing(score, verdict) {
  const p = Math.round((score || 0) * 100);
  const ring = verdict === 'accepted' ? 'var(--good)' : verdict === 'rejected' ? 'var(--bad)' : verdict === 'untested' ? 'rgba(255,255,255,.4)' : 'var(--warn)';
  return h('div', { class: 'score-ring', style: { '--p': String(p), '--ring': ring }, title: 'Critic score' }, h('b', {}, verdict === 'untested' ? '?' : String(p)));
}

export function verdictChip(verdict) {
  const text = { accepted: 'Accepted', 'needs-work': 'Needs work', rejected: 'Rejected', untested: 'Untested' }[verdict] || 'Untested';
  return h('span', { class: `verdict ${verdict || 'needs-work'}` }, text);
}

export function ruleChips(c) {
  const chips = [];
  chips.push([c.lattice === 'hex' ? 'hex' : 'grid', c.lattice === 'hex' ? 'Hex grid' : 'Square grid']);
  chips.push(['grid', `${c.board?.width}×${c.board?.height}`]);
  if (c.wrap) chips.push(['refresh', 'Wrap-around']);
  const rule = c.clear?.rule;
  chips.push(['target', rule === 'color-match' ? `Match ${c.clear.matchSize}+` : rule === 'line-gap' ? `Rows with ${c.clear.gaps} gap` : 'Full rows']);
  if (c.gravityMode === 'cascade') chips.push(['down', 'Cascade']);
  if (c.specials?.bomb > 0) chips.push(['flame', `Bombs ${Math.round(c.specials.bomb * 100)}%`]);
  if (c.specials?.wild > 0) chips.push(['star', 'Wild cells']);
  if (c.garbage?.every > 0) chips.push(['upload', `Garbage /${c.garbage.every}`]);
  const rots = new Set((c.pieces || []).map((p) => p.rotation));
  if (rots.has('morph')) chips.push(['spark', 'Morphing']);
  if (rots.has('flip')) chips.push(['flip', 'Mirror-only']);
  if (rots.has('full')) chips.push(['flip', 'Rotate + mirror']);
  if ((c.pieces || []).some((p) => p.connect === 'corner')) chips.push(['spark', 'Diagonal pieces']);
  if ((c.pieces || []).some((p) => p.connect === 'loose')) chips.push(['spark', 'Gapped pieces']);
  chips.push(['bolt', `${c.speed?.curve || 'standard'} speed`]);
  return h('div', { class: 'chips' }, chips.map(([ic, t]) => h('span', { class: 'chip' }, icon(ic), t)));
}

export function conceptCard(app, concept, { onOpen, badge = null } = {}) {
  const d = concept.design || {};
  const verdict = d.verdict || 'untested';
  return h('button', { class: 'card concept-card', onclick: onOpen, 'aria-label': `${concept.name}, ${verdict}` },
    conceptThumbs(app, concept),
    h('div', { class: 'meta' },
      h('div', { style: { minWidth: 0 } },
        h('h3', { style: { fontSize: '1.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, concept.name),
        h('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } }, verdictChip(verdict), d.source === 'claude' ? h('span', { class: 'chip' }, icon('robot'), 'Claude') : null, badge)),
      scoreRing(d.score, verdict)),
    h('p', { style: { fontSize: '.86rem' } }, d.archetypeTitle ? `${d.archetypeTitle} · ` : '', concept.tagline || ''));
}
