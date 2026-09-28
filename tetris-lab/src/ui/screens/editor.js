import { h, add, icon, clear, toast, seg, slider, sw, confirmDialog } from '../dom.js';
import { validateConcept } from '../../lab/validate.js';
import { describe, LAB_COLORS, PIECE_NAMES } from '../../lab/generator.js';
import { normalizeSquare, HEX } from '../../engine/lattice.js';
import { runLabJob, cancelLabJob } from '../labworker.js';
import { pieceCanvas, scoreRing, verdictChip } from '../thumbs.js';
import { randomSeed } from '../../engine/rng.js';

const ROT_OPTS = [['rotate', 'Rotate'], ['none', 'Fixed'], ['flip', 'Mirror'], ['full', 'Both']];
const CONNECT_OPTS = [['edge', 'Edges'], ['corner', 'Corners'], ['loose', 'Gapped']];

export function mount(root, params, app) {
  root.classList.add('scroll');
  const save = app.save;
  const original = params.concept;
  const c = JSON.parse(JSON.stringify(original));
  c.design = c.design || { journal: [] };
  c.design.journal = c.design.journal || [];
  let sel = 0;
  let form = 0;      // which morph shape is being edited
  let dirty = false;
  let testing = false;
  let validation = null;
  const inCollection = !!save.getConcept(original.id);

  const rulesEl = h('div', { class: 'panel' });
  const piecesEl = h('div', { class: 'panel' });
  const statusEl = h('div', { class: 'panel' });

  // Undo history: a snapshot of the working copy before every change.
  const history = [];
  const snapshot = () => JSON.stringify({ ...c, design: undefined, metrics: undefined });
  let lastSnap = snapshot();
  const changed = () => {
    history.push(lastSnap);
    if (history.length > 60) history.shift();
    lastSnap = snapshot();
    dirty = true; c.design.verdict = 'untested'; schedule();
  };
  const undo = () => {
    const prev = history.pop();
    if (!prev) return;
    const restored = JSON.parse(prev);
    for (const k of Object.keys(c)) if (k !== 'design' && k !== 'metrics') delete c[k];
    Object.assign(c, restored);
    lastSnap = prev;
    if (sel >= c.pieces.length) sel = c.pieces.length - 1;
    form = 0;
    app.audio.play('back');
    renderRules(); renderPieces(); renderStatus();
  };
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderStatus, 120); };

  const row = (title, control, sub) => h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null), control);
  const stepper = (value, lo, hi, on, label) => {
    const out = h('output', {}, String(value));
    return h('div', { class: 'stepper' },
      h('button', { class: 'silent', 'aria-label': `Decrease ${label}`, onclick: () => { value = Math.max(lo, value - 1); out.textContent = String(value); on(value); } }, '−'), out,
      h('button', { class: 'silent', 'aria-label': `Increase ${label}`, onclick: () => { value = Math.min(hi, value + 1); out.textContent = String(value); on(value); } }, '+'));
  };

  function renderRules() {
    clear(rulesEl);
    const rule = c.clear?.rule || 'line';
    const nameIn = h('input', { type: 'text', value: c.name, maxlength: '40', 'aria-label': 'Design name', oninput: (e) => { c.name = e.target.value || 'Untitled'; dirty = true; } });
    const garbageText = (v) => (v ? `A row rises every ${v} pieces` : 'Off');
    const gSub = h('small', {}, garbageText(c.garbage?.every || 0));
    const tSub = h('small', {}, `${Number(c.placement?.seconds ?? 4).toFixed(2)}s at level 1, shrinking 6% per level`);
    add(rulesEl, 
      h('h2', {}, icon('gear'), 'Rules'),
      h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn),
      row('Grid', h('span', { class: 'chip' }, c.lattice === 'hex' ? 'Hexagonal' : 'Square'), 'Fixed for this design (pieces are drawn on it)'),
      row('Width', stepper(c.board.width, 5, 20, (v) => { c.board.width = v; changed(); }, 'width')),
      row('Height', stepper(c.board.height, 10, 30, (v) => { c.board.height = v; changed(); }, 'height')),
      c.lattice === 'square' ? row('Wrap-around walls', sw(!!c.wrap, (v) => { c.wrap = v; changed(); }, 'Wrap-around walls')) : null,
      row('Clear rule', seg([['line', 'Full rows'], ['line-gap', 'Rows with gaps'], ['color-match', 'Colour match']], rule, (v) => {
        c.clear = { ...(c.clear || {}), rule: v, gaps: c.clear?.gaps || 1, matchSize: c.clear?.matchSize || 4 };
        if (v === 'color-match') { c.gravityMode = 'cascade'; c.colorMode = c.colorMode === 'piece' || !c.colorMode ? 'random-cells' : c.colorMode; if (!c.palette || c.palette.length < 3) c.palette = [5, 2, 4, 6]; }
        else { c.colorMode = 'piece'; if (c.specials) c.specials.wild = 0; }
        changed(); renderRules();
      }, 'Clear rule')),
      rule === 'line-gap' ? row('Gaps allowed', seg([[1, '1'], [2, '2']], c.clear.gaps || 1, (v) => { c.clear.gaps = v; changed(); }, 'Gaps')) : null,
      rule === 'color-match' ? row('Match size', stepper(c.clear.matchSize || 4, 3, 8, (v) => { c.clear.matchSize = v; changed(); }, 'match size')) : null,
      rule === 'color-match' ? row('Colours', stepper(c.palette?.length || 4, 3, 6, (v) => { c.palette = [5, 2, 4, 6, 3, 1].slice(0, v); changed(); }, 'colours')) : null,
      rule !== 'color-match' ? row('Gravity after clears', seg([['naive', 'Rows shift'], ['cascade', 'Cells cascade']], c.gravityMode || 'naive', (v) => { c.gravityMode = v; changed(); }, 'Gravity')) : null,
      row('Bomb cells', slider(c.specials?.bomb || 0, 0, 0.35, 0.01, (v) => { c.specials = { ...(c.specials || {}), bomb: v }; changed(); }, 'Bomb chance'), 'Chance a piece carries a bomb'),
      rule === 'color-match' ? row('Wild cells', slider(c.specials?.wild || 0, 0, 0.35, 0.01, (v) => { c.specials = { ...(c.specials || {}), wild: v }; changed(); }, 'Wild chance')) : null,
      h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, 'Rising garbage'), gSub),
        slider(c.garbage?.every || 0, 0, 30, 1, (v) => { c.garbage = { every: v }; changed(); gSub.textContent = garbageText(v); }, 'Garbage interval')),
      row('Speed curve', seg([['gentle', 'Gentle'], ['standard', 'Standard'], ['steep', 'Steep']], c.speed?.curve || 'standard', (v) => { c.speed = { ...(c.speed || {}), curve: v }; changed(); }, 'Speed curve')),
      row('Placement', seg([['gravity', 'Gravity'], ['timed', 'Clock (no gravity)']], c.placement?.mode || 'gravity', (v) => { c.placement = { seconds: 4, ...(c.placement || {}), mode: v }; changed(); renderRules(); }, 'Placement')),
      c.placement?.mode === 'timed' ? h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, 'Time per piece'), tSub),
        slider(c.placement.seconds ?? 4, 1.5, 10, 0.25, (v) => { c.placement.seconds = v; tSub.textContent = `${v.toFixed(2)}s at level 1, shrinking 6% per level`; changed(); }, 'Seconds per piece')) : null);
  }

  function renderPieces() {
    clear(piecesEl);
    if (sel >= c.pieces.length) sel = Math.max(0, c.pieces.length - 1);
    const p = c.pieces[sel];
    const pal = c.colorMode && c.colorMode !== 'piece' ? c.palette : null;
    add(piecesEl, 
      h('h2', {}, icon('grid'), `Pieces · ${c.pieces.length}`),
      h('div', { class: 'piece-grid' },
        c.pieces.map((q, i) => h('button', { class: 'piece-tile', 'aria-pressed': String(i === sel), onclick: () => { sel = i; form = 0; renderPieces(); } },
          pieceCanvas(app, c.lattice, q, { w: 64, hgt: 50, unit: 12, palette: pal }), h('b', {}, q.name))),
        c.pieces.length < 12 ? h('button', { class: 'piece-tile', onclick: addPiece, 'aria-label': 'Add a piece' }, icon('plus'), h('b', {}, 'Add piece')) : null));
    if (!p) return;
    const forms = p.rotation === 'morph' ? [p.cells, ...(p.morphs || [])] : [p.cells];
    if (form >= forms.length) form = 0;
    const nameIn = h('input', { type: 'text', value: p.name, maxlength: '18', 'aria-label': 'Piece name', oninput: (e) => { p.name = e.target.value || 'Piece'; dirty = true; } });
    add(piecesEl, 
      h('div', { style: { marginTop: '16px', display: 'grid', gap: '10px' } },
        h('div', { class: 'row' }, h('label', { class: 'field', style: { flex: 1 } }, h('span', {}, 'Piece name'), nameIn),
          h('button', { class: 'btn small ghost', disabled: c.pieces.length <= 1 ? true : null, onclick: async () => {
            if (!(await confirmDialog(`Remove ${p.name}?`, 'The piece will be removed from this design.', { ok: 'Remove', danger: true }))) return;
            c.pieces.splice(sel, 1); sel = Math.max(0, sel - 1); changed(); renderPieces();
          } }, icon('trash'), 'Remove')),
        p.rotation === 'morph'
          ? h('div', {}, h('div', { class: 'label-caps', style: { marginBottom: '6px' } }, 'Morph forms (all must have the same number of cells)'),
            seg(forms.map((_, i) => [i, `Form ${i + 1}`]), form, (v) => { form = v; renderPieces(); }, 'Morph form'))
          : row('Rotation', seg(ROT_OPTS, p.rotation === 'srs' || p.rotation === 'srs-i' || p.rotation === 'srs-o' ? 'rotate' : p.rotation, (v) => { p.rotation = v; changed(); }, 'Rotation')),
        row('Cells join by', seg(CONNECT_OPTS, p.connect || 'edge', (v) => { p.connect = v; changed(); }, 'Connectivity')),
        row('Weight', seg([[0.5, 'Light'], [1, 'Normal'], [2, 'Heavy']], p.fall && p.fall < 1 ? 0.5 : p.fall > 1 ? 2 : 1, (v) => { if (v === 1) delete p.fall; else p.fall = v; changed(); }, 'Weight')),
        h('div', { class: 'label-caps' }, 'Tap cells to edit the shape'),
        c.lattice === 'hex' ? hexGrid(forms, p) : squareGrid(forms, p)));
  }

  function setForm(p, cells) {
    if (p.rotation === 'morph') {
      if (form === 0) p.cells = cells;
      else p.morphs[form - 1] = cells;
    } else p.cells = cells;
    changed();
  }

  function squareGrid(forms, p) {
    const N = 6;
    const cells = forms[form] || [];
    const norm = cells.length ? normalizeSquare(cells) : [];
    let w = 0, hh = 0;
    for (const [x, y] of norm) { w = Math.max(w, x + 1); hh = Math.max(hh, y + 1); }
    const ox = Math.floor((N - w) / 2), oy = Math.floor((N - hh) / 2);
    const has = new Set(norm.map(([x, y]) => `${x + ox},${y + oy}`));
    const grid = h('div', { class: 'editor-grid', style: { gridTemplateColumns: `repeat(${N}, 34px)` }, role: 'grid', 'aria-label': 'Piece shape editor' });
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = `${x},${y}`;
        grid.append(h('button', { class: 'silent', 'aria-pressed': String(has.has(k)), 'aria-label': `Cell ${x + 1},${y + 1}`, onclick: () => {
          if (has.has(k)) { if (has.size <= 1) return; has.delete(k); } else { if (has.size >= 8) { toast('Pieces can have at most 8 cells'); return; } has.add(k); }
          app.audio.play('toggle');
          setForm(p, normalizeSquare([...has].map((s) => s.split(',').map(Number))));
          renderPieces();
        } }));
      }
    }
    return grid;
  }

  function hexGrid(forms, p) {
    const R = 2;
    const cells = forms[form] || [];
    const has = new Set(cells.map(([q, r]) => `${q},${r}`));
    const coords = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) coords.push([q, r]);
    // Shapes drawn outside the edit radius are recentred by their first cell.
    const outside = cells.some(([q, r]) => Math.abs(q) > R || Math.abs(r) > R || Math.abs(q + r) > R);
    if (outside) {
      const [q0, r0] = cells[0];
      has.clear();
      for (const [q, r] of cells) has.add(`${q - q0},${r - r0}`);
    }
    const S = 21;
    const wrap = h('div', { class: 'hex-editor', style: { width: `${S * 1.5 * (2 * R) + 36}px`, height: `${S * Math.sqrt(3) * (2 * R + 1) + 4}px` }, 'aria-label': 'Hex piece shape editor' });
    for (const [q, r] of coords) {
      const [x, y] = HEX.nativeCenter([q, r]);
      const k = `${q},${r}`;
      wrap.append(h('button', { class: 'silent', 'aria-pressed': String(has.has(k)), 'aria-label': `Hex ${q},${r}`,
        style: { left: `${x * S + S * 1.5 * R}px`, top: `${y * S + S * Math.sqrt(3) * R}px` }, onclick: () => {
          if (has.has(k)) { if (has.size <= 1) return; has.delete(k); } else { if (has.size >= 8) { toast('Pieces can have at most 8 cells'); return; } has.add(k); }
          app.audio.play('toggle');
          setForm(p, [...has].map((s) => s.split(',').map(Number)));
          renderPieces();
        } }));
    }
    return wrap;
  }

  function addPiece() {
    const used = new Set(c.pieces.map((q) => q.name));
    const name = PIECE_NAMES.find((n) => !used.has(n)) || `Piece ${c.pieces.length + 1}`;
    const usedC = new Set(c.pieces.map((q) => q.color));
    const color = LAB_COLORS.find((x) => !usedC.has(x)) || 9;
    c.pieces.push({ id: `e${Date.now().toString(36)}`, name, cells: c.lattice === 'hex' ? [[0, 0], [1, 0], [0, 1]] : [[0, 0], [1, 0], [1, 1]], color, rotation: 'rotate', connect: 'edge', weight: 1, tags: ['player'] });
    sel = c.pieces.length - 1;
    form = 0;
    changed();
    renderPieces();
  }

  function renderStatus() {
    validation = validateConcept(c);
    c.tagline = describe(c);
    clear(statusEl);
    const d = c.design;
    add(statusEl, 
      h('div', { class: 'row between' },
        h('h2', { style: { margin: 0 } }, icon('robot'), 'Status'),
        h('div', { class: 'row' }, verdictChip(d.verdict), scoreRing(d.verdict === 'untested' ? 0 : d.score, d.verdict))),
      h('p', { style: { marginTop: '10px' } }, c.tagline),
      validation.ok
        ? h('div', { class: 'chip good', style: { marginBottom: '8px' } }, icon('check'), 'Valid: safe to play and test')
        : h('div', {}, h('div', { class: 'chip bad', style: { marginBottom: '8px' } }, icon('x'), 'Not playable yet'), h('ul', { style: { margin: '0 0 8px', paddingLeft: '18px', color: '#ff9aa5' } }, validation.errors.slice(0, 6).map((e) => h('li', {}, e)))),
      validation.warnings.length ? h('ul', { style: { margin: '0 0 8px', paddingLeft: '18px', color: '#ffe27a' } }, validation.warnings.slice(0, 4).map((e) => h('li', {}, e))) : null,
      d.verdict !== 'untested' && d.weaknesses?.length ? h('ul', { style: { margin: '0 0 8px', paddingLeft: '18px', color: 'var(--text-dim)' } }, d.weaknesses.slice(0, 3).map((e) => h('li', {}, e))) : null,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'btn ghost', id: 'undo-edit', disabled: history.length ? null : true, 'aria-label': 'Undo last change', onclick: undo }, icon('ccw'), 'Undo'),
        h('button', { class: 'btn warm', id: 'test-design', disabled: !validation.ok || testing ? true : null, onclick: test }, icon('robot'), testing ? 'Testing…' : 'Test design'),
        h('button', { class: 'btn', disabled: !validation.ok ? true : null, onclick: () => app.go('play', { kind: 'lab', concept: JSON.parse(JSON.stringify(c)) }) }, icon('play'), 'Play'),
        inCollection ? h('button', { class: 'btn good', disabled: !validation.ok ? true : null, onclick: () => doSave(false) }, icon('save'), 'Save changes') : null,
        h('button', { class: `btn ${inCollection ? 'ghost' : 'good'}`, disabled: !validation.ok ? true : null, onclick: () => doSave(true) }, icon('copy'), inCollection ? 'Save as new' : 'Save to collection')));
  }

  async function test() {
    if (!validation?.ok || testing) return;
    testing = true;
    renderStatus();
    try {
      const [r] = await runLabJob({ type: 'design', concepts: [JSON.parse(JSON.stringify(c))], seed: randomSeed(), maxIterations: 1 });
      const entry = (r.journal || []).find((j) => j.stage === 'review');
      c.design = {
        ...c.design,
        verdict: r.verdict,
        score: r.concept.design?.score ?? r.score,
        components: r.concept.design?.components,
        strengths: r.concept.design?.strengths || [],
        weaknesses: r.concept.design?.weaknesses || r.reasons || [],
        journal: [...(c.design.journal || []), ...(entry ? [{ ...entry, version: (c.design.journal?.filter((j) => j.stage === 'review').length || 0) + 1, changes: ['Edited by you'] }] : [])]
      };
      c.metrics = r.concept.metrics;
      dirty = true;
      app.audio.play(r.verdict === 'accepted' ? 'labAccept' : 'labReject');
      toast(r.verdict === 'accepted' ? 'The critic approves' : 'The critic has concerns', r.verdict === 'accepted' ? `Score ${Math.round(r.score * 100)}` : (r.reasons?.[0] || ''), { iconName: 'robot', ms: 5000 });
      if (save.unlock('lab-edit')) toast('Achievement: Tinkerer', 'Modify a design and re-test it', { iconName: 'medal' });
      save.bump('designsTested');
    } catch (e) {
      if (!e.cancelled) toast('Test failed', e.message, { error: true, iconName: 'x' });
    }
    testing = false;
    renderStatus();
  }

  function doSave(asNew) {
    try {
      const copy = JSON.parse(JSON.stringify(c));
      if (asNew) { copy.id = `mod-${Date.now().toString(36)}`; if (copy.name === original.name) copy.name = `${copy.name} (mod)`.slice(0, 40); }
      const s = save.saveConcept(copy);
      dirty = false;
      toast(asNew ? 'Saved as a new design' : 'Changes saved', s.name, { iconName: 'save' });
      if (save.unlock('lab-save')) toast('Achievement: Curator', 'Save a design to your collection', { iconName: 'medal' });
      app.go('detail', { concept: s, saved: true }, { replace: true });
    } catch (e) { toast('Could not save', e.message, { error: true, iconName: 'x' }); }
  }

  async function leave() {
    if (dirty && !(await confirmDialog('Discard your changes?', 'Unsaved edits to this design will be lost.', { ok: 'Discard', danger: true }))) return;
    cancelLabJob();
    app.back();
  }

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar' },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: leave }, icon('back')),
      h('h1', {}, icon('edit'), 'Modify design'), h('span', { class: 'spacer' })),
    statusEl,
    h('div', { class: 'detail-grid' }, rulesEl, piecesEl)));
  renderRules();
  renderPieces();
  renderStatus();

  return {
    bgState: () => ({ intensity: testing ? 0.45 : 0.18 }),
    key(e) {
      if (e.key === 'Escape') { leave(); return true; }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.target.matches?.('input')) { e.preventDefault(); undo(); return true; }
      return false;
    },
    unmount() { clearTimeout(timer); if (testing) cancelLabJob(); }
  };
}
