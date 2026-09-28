import { h, add, icon, clear, toast, seg, promptDialog, confirmDialog, fmtNum } from '../dom.js';
import { pieceCanvas, scoreRing, verdictChip, ruleChips } from '../thumbs.js';
import { SOURCES, sourcesFor } from '../labplay.js';
import { compilePiece } from '../../engine/pieces.js';

const COMPONENT_LABELS = { challenge: 'Challenge', fairness: 'Fairness', flow: 'Flow', decisions: 'Decisions', engagement: 'Mechanics', novelty: 'Novelty', readability: 'Readability' };
const ROTATION_LABELS = { srs: 'SRS', 'srs-i': 'SRS', 'srs-o': 'SRS', rotate: 'Rotates', none: 'Fixed', flip: 'Mirrors', full: 'Rotate + mirror', morph: 'Morphs' };

export function mount(root, params, app) {
  root.classList.add('scroll');
  app.audio.setMusic('lab');
  const save = app.save;
  let concept = JSON.parse(JSON.stringify(params.concept));
  const isSaved = () => !!save.getConcept(concept.id);
  const d = () => concept.design || {};
  let source = 'concept';
  let trialPiece = 0;

  const titleEl = h('h1', { style: { minWidth: 0 } });
  const actionsEl = h('div', { class: 'row' });
  const main = h('div', { class: 'detail-grid' });

  function render() {
    clear(titleEl);
    add(titleEl, icon('lab'), h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, concept.name));
    clear(actionsEl);
    add(actionsEl, 
      isSaved()
        ? h('button', { class: 'btn small ghost', onclick: rename }, icon('edit'), 'Rename')
        : h('button', { class: 'btn small good', id: 'save-design', onclick: doSave }, icon('save'), 'Save'),
      h('button', { class: 'btn small ghost', onclick: () => app.go('editor', { concept }) }, icon('spark'), 'Modify'),
      h('button', { class: 'btn small ghost', 'aria-label': 'Export as JSON', onclick: exportJson }, icon('download')),
      isSaved() ? h('button', { class: 'btn small ghost', 'aria-label': 'Delete design', onclick: del }, icon('trash')) : null);
    clear(main);
    add(main, leftCol(), rightCol());
  }

  function leftCol() {
    const best = save.data.records.lab[concept.id];
    const opts = sourcesFor(concept);
    if (!opts.includes(source)) source = 'concept';
    const trialPick = h('select', { 'aria-label': 'Piece to trial', class: source === 'single' ? '' : 'hidden', onchange: (e) => { trialPiece = Number(e.target.value); } },
      concept.pieces.map((p, i) => h('option', { value: String(i), selected: i === trialPiece ? true : null }, p.name)));
    const srcDesc = h('p', { class: 'faint', style: { margin: '8px 0 0' } }, SOURCES[source].desc);
    const play = h('div', { class: 'panel' },
      h('h2', {}, icon('play'), 'Play this design'),
      h('div', { class: 'label-caps', style: { marginBottom: '6px' } }, 'Pieces'),
      seg(opts.map((o) => [o, SOURCES[o].label]), source, (v) => { source = v; trialPick.classList.toggle('hidden', v !== 'single'); srcDesc.textContent = SOURCES[v].desc; }, 'Piece source'),
      srcDesc,
      h('div', { class: 'row', style: { marginTop: '12px' } },
        trialPick,
        h('button', { class: 'btn big', id: 'play-design', onclick: () => app.go('play', { kind: 'lab', concept, source, pieceIndex: trialPiece }) }, icon('play'), 'Play'),
        best ? h('span', { class: 'chip' }, icon('trophy'), `Your best ${fmtNum(best)}`) : null));

    const idea = h('div', { class: 'panel' },
      h('div', { class: 'row', style: { marginBottom: '8px' } }, verdictChip(d().verdict), d().archetypeTitle ? h('span', { class: 'chip' }, d().source === 'claude' ? icon('robot') : icon('lab'), d().archetypeTitle) : null),
      h('p', { style: { color: 'var(--text)', fontSize: '1.05rem' } }, concept.tagline || ''),
      d().problem ? h('div', {}, h('h3', {}, 'The idea'), h('p', {}, d().problem)) : null,
      d().rationale ? h('div', {}, h('h3', {}, 'Why it works'), h('p', {}, d().rationale)) : null,
      d().twists?.length ? h('p', { class: 'faint' }, `Twist: ${d().twists.join('; ')}.`) : null,
      ruleChips(concept));

    const pal = concept.colorMode && concept.colorMode !== 'piece' ? concept.palette : null;
    const pieces = h('div', { class: 'panel' },
      h('h2', {}, icon('grid'), `Pieces · ${concept.pieces.length}`),
      pal ? h('p', { class: 'faint' }, `Cells are coloured at random from ${pal.length} colours when each piece spawns.`) : null,
      h('div', { class: 'piece-grid' }, concept.pieces.map((p) => pieceTile(p, pal))));
    return h('div', { style: { display: 'grid', gap: '16px', minWidth: 0 } }, play, idea, pieces);
  }

  function pieceTile(p, pal) {
    let states = 1;
    try { states = compilePiece(p, concept.lattice).distinctStates.length; } catch { /* shown as-is */ }
    const orient = h('div', { class: 'row', style: { gap: '2px', justifyContent: 'center' } });
    let comp = null;
    try { comp = compilePiece(p, concept.lattice); } catch { /* ignore */ }
    const ids = comp ? comp.distinctStates.slice(0, 4) : [0];
    ids.forEach((s) => orient.append(pieceCanvas(app, concept.lattice, p, { w: 40, hgt: 34, unit: 8, state: s, palette: pal })));
    return h('div', { class: 'piece-tile' },
      pieceCanvas(app, concept.lattice, p, { w: 84, hgt: 64, unit: 16, palette: pal }),
      h('b', {}, p.name),
      h('span', {}, `${p.cells.length} cells · ${ROTATION_LABELS[p.rotation] || 'Rotates'}${p.connect === 'corner' ? ' · diagonal' : p.connect === 'loose' ? ' · gapped' : ''}`),
      states > 1 ? orient : h('span', { class: 'faint' }, 'Symmetric'));
  }

  function rightCol() {
    const comps = d().components;
    const m = concept.metrics;
    const critic = h('div', { class: 'panel' },
      h('div', { class: 'row between', style: { marginBottom: '12px' } },
        h('h2', { style: { margin: 0 } }, icon('robot'), 'Critic report'),
        scoreRing(d().score, d().verdict)),
      comps ? h('div', { class: 'bars' }, Object.entries(COMPONENT_LABELS).map(([k, label]) => {
        const v = comps[k] ?? 0;
        return h('div', { class: 'b' }, h('span', {}, label), h('span', { class: 't' }, h('i', { style: { width: `${Math.round(v * 100)}%` } })), h('b', {}, String(Math.round(v * 100))));
      })) : h('p', {}, 'This design has not been play-tested yet. Modify it and run a test to get a report.'),
      d().strengths?.length ? h('div', { style: { marginTop: '14px' } }, h('h3', {}, 'Strengths'), h('ul', { style: { margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' } }, d().strengths.map((s) => h('li', {}, s)))) : null,
      d().weaknesses?.length ? h('div', { style: { marginTop: '12px' } }, h('h3', {}, 'Remaining concerns'), h('ul', { style: { margin: 0, paddingLeft: '18px', color: 'var(--text-dim)' } }, d().weaknesses.map((s) => h('li', {}, s)))) : null);

    const metrics = m ? h('div', { class: 'panel' },
      h('h2', {}, icon('chart'), 'Play-test results'),
      h('div', { class: 'result-grid' },
        [['Player survival', `${Math.round(m.playerSurvival * 100)}%`], ['Avg pieces lasted', `${m.playerPieces}/${m.cap}`], ['Expert survival', `${Math.round(m.expertSurvival * 100)}%`],
          ['Avg stack height', `${Math.round(m.avgHeight * 100)}%`], ['Pieces per clear', String(m.piecesPerClear)], ['Good options / turn', String(m.goodOptions)],
          ['Rotation used', `${Math.round(m.rotationUse * 100)}%`], ['Chain rate', `${(m.chainRate * 100).toFixed(1)}%`], ['Sim speed', `${m.msPerPiece} ms/piece`]]
          .map(([k, v]) => h('div', { class: 'cell' }, h('div', { class: 'label-caps' }, k), h('div', { class: 'v' }, v)))),
      h('p', { class: 'faint', style: { marginTop: '10px' } }, 'Measured over simulated games by an expert bot and a human-like bot whose skill fades as the speed rises.')) : null;

    const journal = d().journal?.length ? h('div', { class: 'panel' },
      h('h2', {}, icon('edit'), 'Design journal'),
      h('div', { class: 'journal' }, d().journal.map((j) => h('div', { class: 'j' },
        h('span', { class: 'pin' }),
        h('h4', {}, j.stage === 'confirm' ? 'Confirmation' : j.stage === 'refine' ? `Round ${j.version} · no fixes left` : `Round ${j.version}`,
          j.verdict ? verdictChip(j.verdict) : null, Number.isFinite(j.score) ? h('span', { class: 'chip' }, `score ${Math.round(j.score * 100)}`) : null),
        h('ul', {},
          (j.changes || []).map((c) => h('li', { class: 'chg' }, `Changed: ${c}`)),
          j.note ? h('li', {}, j.note) : null,
          (j.errors || []).map((e) => h('li', {}, `Invalid: ${e}`)),
          (j.weaknesses || []).slice(0, 3).map((w) => h('li', {}, w)),
          (j.strengths || []).slice(0, 2).map((w) => h('li', {}, `✓ ${w}`))))))) : null;
    return h('div', { style: { display: 'grid', gap: '16px', minWidth: 0 } }, critic, metrics, journal);
  }

  function doSave() {
    try {
      concept = save.saveConcept(concept);
      app.audio.play('labAccept');
      toast('Saved to your collection', concept.name, { iconName: 'save' });
      if (save.unlock('lab-save')) toast('Achievement: Curator', 'Save a design to your collection', { iconName: 'medal' });
      render();
    } catch (e) { toast('Could not save', e.message, { error: true, iconName: 'x' }); }
  }

  async function rename() {
    const n = await promptDialog('Rename design', concept.name);
    if (n && save.renameConcept(concept.id, n)) { concept.name = n; render(); }
  }

  async function del() {
    if (!(await confirmDialog(`Delete “${concept.name}”?`, 'It will be removed from your collection. Your best score for it is kept.', { ok: 'Delete', danger: true }))) return;
    save.deleteConcept(concept.id);
    toast('Design deleted');
    app.back();
  }

  function exportJson() {
    const clean = JSON.parse(JSON.stringify(concept));
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${concept.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar', style: { flexWrap: 'wrap' } },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => app.back() }, icon('back')),
      titleEl, h('span', { class: 'spacer' }), actionsEl),
    main));
  render();
  requestAnimationFrame(() => document.getElementById('play-design')?.focus({ preventScroll: true }));
  return { bgState: () => ({ intensity: 0.2 }) };
}
