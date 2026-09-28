import { h, icon, clear, toast, seg, promptDialog, confirmDialog, fmtNum, modal } from '../dom.js';
import { ARCHETYPES } from '../../lab/generator.js';
import { runLabJob, cancelLabJob, labBusy } from '../labworker.js';
import { requestConcepts, revise, ClaudeError } from '../../lab/claude.js';
import { randomSeed } from '../../engine/rng.js';
import { conceptCard, conceptThumbs, pieceCanvas, verdictChip } from '../thumbs.js';
import { randomExperiment, conceptFromSet } from '../labplay.js';
import { Demo } from '../demo.js';
import { validateConcept } from '../../lab/validate.js';

/* Session results survive navigating to a design and back. */
const memory = { results: [], feed: [], tab: 'design', count: 4, focus: [], source: 'local', theme: '', compare: [] };

const PIPELINE = [['generate', 'Generate', 'spark'], ['validate', 'Validate', 'check'], ['simulate', 'Play-test', 'robot'], ['critique', 'Critique', 'chart'], ['refine', 'Refine', 'edit'], ['confirm', 'Confirm', 'target']];

const STAGE_TEXT = {
  generate: 'Inventing a concept', validate: 'Validating geometry and rules', simulate: 'Play-testing with bots',
  critique: 'Critic reviewing the results', refine: 'Redesigning to fix weaknesses', confirm: 'Confirming on fresh seeds'
};

export function mount(root, params, app) {
  root.classList.add('scroll');
  app.audio.setMusic('lab');
  const save = app.save;
  if (params.tab) memory.tab = params.tab;
  let running = false;
  let progressEl, stageEl, feedEl, resultsEl, scanEl, pipelineEl, genBtn, cancelBtn;
  let demo = null, scanConcept = null, idle = null;
  const idleConcept = () => (idle = idle || randomExperiment());
  const body = h('div', { class: 'content' });

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Lab sections' },
    [['design', 'Design'], ['collection', `Collection (${save.data.lab.saved.length})`], ['sets', 'Piece sets'], ['compare', 'Compare']].map(([id, label]) =>
      h('button', { class: 'tab', role: 'tab', id: `labtab-${id}`, 'aria-selected': String(memory.tab === id), onclick: () => { if (running && id !== 'design') return toast('A design session is running', 'Wait for it to finish or cancel it first.', { iconName: 'lab' }); memory.tab = id; render(); } }, label)));

  function render() {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.id === `labtab-${memory.tab}`));
    tabs.children[1].textContent = `Collection (${save.data.lab.saved.length})`;
    clear(body);
    if (memory.tab === 'design') renderDesign();
    else if (memory.tab === 'collection') renderCollection();
    else if (memory.tab === 'sets') renderSets();
    else renderCompare();
  }

  /* ------------------------------------------------------ DESIGN -- */
  function renderDesign() {
    const hasKey = !!save.getApiKey();
    if (!hasKey && memory.source === 'claude') memory.source = 'local';
    const focusChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Focus the designer' },
      ARCHETYPES.map((a) => h('button', { class: 'chip', 'aria-pressed': String(memory.focus.includes(a.id)), title: a.problem, onclick: (e) => {
        const on = !memory.focus.includes(a.id);
        memory.focus = on ? [...memory.focus, a.id] : memory.focus.filter((x) => x !== a.id);
        e.currentTarget.setAttribute('aria-pressed', String(on));
      } }, a.title)));
    const claudeBox = h('div', { class: memory.source === 'claude' ? '' : 'hidden', style: { display: 'grid', gap: '8px' } },
      h('label', { class: 'field' }, h('span', {}, 'Optional theme for Claude'),
        h('input', { type: 'text', value: memory.theme, maxlength: '120', placeholder: 'e.g. gravity that fights back', oninput: (e) => { memory.theme = e.target.value; } })));
    const localBox = h('div', { class: memory.source === 'local' ? '' : 'hidden' }, h('div', { class: 'label-caps', style: { margin: '6px 0' } }, 'Focus (optional)'), focusChips);

    genBtn = h('button', { class: 'btn warm', id: 'lab-generate', onclick: () => startSession() }, icon('spark'), 'Generate designs');
    cancelBtn = h('button', { class: 'btn ghost hidden', onclick: () => { cancelLabJob(); abortClaude?.abort(); finish(true); } }, icon('x'), 'Cancel');

    const controls = h('div', { class: 'panel' },
      h('h2', {}, icon('lab'), 'Design session'),
      h('p', {}, 'The designer invents concepts, then builds, play-tests, critiques and refines each one until it is worth playing — or rejects it.'),
      h('div', { class: 'label-caps', style: { margin: '10px 0 6px' } }, 'Designer'),
      seg([['local', 'On-device AI'], ['claude', hasKey ? 'Claude' : 'Claude (add key)']], memory.source, (v) => {
        if (v === 'claude' && !hasKey) { app.go('settings', { tab: 'ai' }); return; }
        memory.source = v; localBox.classList.toggle('hidden', v !== 'local'); claudeBox.classList.toggle('hidden', v !== 'claude');
      }, 'Designer'),
      h('div', { class: 'label-caps', style: { margin: '12px 0 6px' } }, 'How many concepts'),
      seg([[2, '2'], [4, '4'], [6, '6']], memory.count, (v) => { memory.count = v; }, 'Concept count'),
      localBox, claudeBox,
      h('div', { class: 'row', style: { marginTop: '16px' } }, genBtn, cancelBtn),
      h('div', { style: { marginTop: '14px' } },
        h('button', { class: 'btn small ghost', onclick: () => playRandom() }, icon('bolt'), 'Random experiment'),
        h('small', { class: 'faint', style: { display: 'block', marginTop: '6px' } }, 'An instant, validated but untested design — for the adventurous.')));

    progressEl = h('i');
    stageEl = h('div', { class: 'muted', style: { minHeight: '1.4em' } }, running ? '' : memory.results.length ? `Last session: ${memory.results.filter((r) => r.verdict === 'accepted').length} of ${memory.results.length} designs accepted.` : 'Ready. Press Generate to start a session.');
    scanEl = h('div', { class: `scan${running ? '' : ' idle'}` });
    pipelineEl = h('div', { class: 'pipeline', 'aria-hidden': 'true' }, PIPELINE.map(([id, label, ic]) => h('span', { class: 'st', 'data-stage': id }, icon(ic), label)));
    feedEl = h('div', { class: 'feed', 'aria-live': 'polite' }, memory.feed.slice(-40).map((f) => feedLine(f)));
    const monitor = h('div', { class: 'panel' },
      h('h2', {}, icon('robot'), 'Lab monitor'),
      stageEl, h('div', { class: 'progress', style: { margin: '10px 0 4px' } }, progressEl),
      pipelineEl, scanEl, h('h3', { style: { marginTop: '14px' } }, 'Design log'), feedEl);

    resultsEl = h('div', {});
    renderResults();
    body.append(h('div', { class: 'designer' }, controls, monitor), resultsEl);
    showScan(scanConcept || idleConcept(), !running);
    if (running) { genBtn.disabled = true; cancelBtn.classList.remove('hidden'); }
  }

  function feedLine(f) {
    return h('div', { class: `line ${f.kind || ''}` }, h('span', { class: 'dot' }), h('span', {}, f.text));
  }
  function log(text, kind = '') {
    const f = { text, kind };
    memory.feed.push(f);
    if (memory.feed.length > 200) memory.feed.shift();
    if (feedEl && document.contains(feedEl)) {
      feedEl.append(feedLine(f));
      while (feedEl.children.length > 60) feedEl.firstChild.remove();
      feedEl.scrollTop = feedEl.scrollHeight;
    }
  }

  function renderResults() {
    if (!resultsEl) return;
    clear(resultsEl);
    const list = memory.results;
    if (!list.length) return;
    const good = list.filter((r) => r.verdict === 'accepted');
    const other = list.filter((r) => r.verdict !== 'accepted');
    resultsEl.append(h('h2', { style: { margin: '6px 0 12px' } }, `Results · ${good.length} accepted`));
    if (good.length) resultsEl.append(h('div', { class: 'lab-grid' }, good.map((r) => conceptCard(app, r.concept, { onOpen: () => openDetail(r.concept) }))));
    else resultsEl.append(h('div', { class: 'panel' }, h('p', {}, 'No design met the bar this time. The rejected ideas and the critic’s reasons are below — try again, or focus the designer on different ideas.')));
    if (other.length) {
      resultsEl.append(h('div', { class: 'panel', style: { marginTop: '16px' } },
        h('h2', {}, icon('x'), `Rejected or unfinished · ${other.length}`),
        other.map((r) => h('div', { class: 'setting' },
          h('div', { class: 'txt' }, h('b', {}, r.concept?.name || 'Unnamed'), h('small', {}, (r.reasons || []).slice(0, 2).join(' · ') || 'Did not reach the acceptance bar.')),
          h('div', { class: 'row' }, verdictChip(r.verdict),
            r.concept?.pieces?.length && r.verdict !== 'rejected' ? h('button', { class: 'btn small ghost', onclick: () => openDetail(r.concept) }, 'Inspect') : null)))));
    }
  }

  function openDetail(concept) {
    app.go('detail', { concept, saved: !!save.getConcept(concept.id) });
  }

  /* The scan window: a bot plays the concept under test, live. */
  function showScan(concept, isIdle = false) {
    if (!scanEl || !document.contains(scanEl) || !concept) return;
    scanConcept = isIdle ? null : concept;
    clear(scanEl);
    scanEl.classList.toggle('idle', isIdle);
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const v = validateConcept(concept);
    demo = null;
    if (v.ok) {
      demo = new Demo(canvas, app.painter, v.rules, { skill: 0.9, speed: 1.6 });
      demo.configure({ theme: app.theme, highContrast: app.settings.highContrast, ghost: false, reduced: app.reduced });
      demo.resize(120, 206, Math.min(2, devicePixelRatio || 1));
    }
    const t = conceptThumbs(app, concept, 6, 38);
    scanEl.append(
      h('div', { class: 'scan-well' }, canvas),
      h('div', { class: 'scan-info' },
        h('div', { class: 'label-caps' }, isIdle ? 'Bot sandbox · random experiment' : 'Under test'),
        h('b', { style: { fontSize: '1.1rem' } }, concept.name || 'Concept'),
        h('span', { class: 'faint', style: { fontSize: '.84rem' } }, concept.tagline || ''),
        t));
  }

  function lightPipeline(stageId) {
    if (!pipelineEl || !document.contains(pipelineEl)) return;
    const idx = PIPELINE.findIndex(([id]) => id === stageId);
    [...pipelineEl.children].forEach((el, i) => {
      el.classList.toggle('on', i === idx);
      el.classList.toggle('done', idx >= 0 && i < idx);
    });
  }

  function stage(p) {
    if (!stageEl || !document.contains(stageEl)) return;
    const name = p.name ? ` — ${p.name}` : '';
    stageEl.textContent = `${STAGE_TEXT[p.stage] || p.stage}${name}${p.version > 1 ? ` (round ${p.version})` : ''}`;
    lightPipeline(p.stage);
    const per = 1 / Math.max(1, p.count || memory.count);
    const within = { generate: 0.05, validate: 0.15, simulate: 0.45, critique: 0.7, refine: 0.8, confirm: 0.92 }[p.stage] || 0;
    progressEl.style.width = `${Math.min(100, ((p.index || 0) * per + within * per) * 100)}%`;
    app.audio.play('labTick');
  }

  let abortClaude = null;

  async function startSession() {
    if (running || labBusy()) return;
    running = true;
    memory.results = [];
    memory.feed = [];
    clear(feedEl);
    renderResults();
    genBtn.disabled = true;
    cancelBtn.classList.remove('hidden');
    const seed = randomSeed();
    const t0 = performance.now();
    try {
      if (memory.source === 'claude') await claudeSession(seed);
      else await localSession(seed);
      const ok = memory.results.filter((r) => r.verdict === 'accepted');
      log(`Session finished in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${ok.length}/${memory.results.length} accepted.`, ok.length ? 'ok' : 'bad');
      save.bump('labSessions');
      save.bump('designsTested', memory.results.length);
      save.bump('designsAccepted', ok.length);
      if (save.unlock('lab-session')) toast('Achievement: Mad Scientist', 'Run an AI Lab design session', { iconName: 'medal' });
      if (memory.source === 'claude' && ok.length && save.unlock('lab-claude')) toast('Achievement: Collaborator', 'Get an accepted design from Claude', { iconName: 'medal' });
      finish(false);
    } catch (e) {
      if (e.cancelled || e.message === 'Cancelled.') { log('Session cancelled.', 'bad'); finish(true); return; }
      console.error(e);
      log(e instanceof ClaudeError ? e.message : 'The design session failed unexpectedly.', 'bad');
      toast('Design session stopped', e instanceof ClaudeError ? e.message : 'Something went wrong in the lab.', { error: true, iconName: 'x', ms: 6000 });
      finish(true);
    }
  }

  function finish(cancelled) {
    running = false;
    abortClaude = null;
    if (genBtn && document.contains(genBtn)) {
      genBtn.disabled = false;
      cancelBtn.classList.add('hidden');
      progressEl.style.width = cancelled ? '0%' : '100%';
      const ok = memory.results.filter((r) => r.verdict === 'accepted').length;
      stageEl.textContent = cancelled ? 'Stopped.' : `Done: ${ok} of ${memory.results.length} designs accepted.`;
      lightPipeline(null);
      scanEl?.classList.add('idle');
    }
    renderResults();
    app.audio.play(memory.results.some((r) => r.verdict === 'accepted') ? 'labAccept' : 'labReject');
  }

  function onResult(r) {
    memory.results.push(r);
    const reason = r.verdict === 'accepted' ? `score ${Math.round(r.score * 100)}` : (r.reasons?.[0] || 'did not meet the bar');
    log(`${r.concept?.name || 'Concept'}: ${r.verdict === 'accepted' ? 'ACCEPTED' : r.verdict.toUpperCase()} — ${reason}`, r.verdict === 'accepted' ? 'ok' : 'bad');
    for (const j of r.journal || []) if (j.changes?.length) log(`  v${j.version}: ${j.changes.join('; ')}`);
    app.audio.play(r.verdict === 'accepted' ? 'labAccept' : 'labReject');
    renderResults();
  }

  async function localSession(seed) {
    log(`Starting on-device session (${memory.count} concepts${memory.focus.length ? `, focus: ${memory.focus.length} idea${memory.focus.length > 1 ? 's' : ''}` : ''}).`);
    await runLabJob({ type: 'session', count: memory.count, seed, archetypes: memory.focus }, {
      onProgress: (p) => {
        stage(p);
        if (p.stage === 'generate') log(`Concept ${p.index + 1}: ${ARCHETYPES.find((a) => a.id === p.archetype)?.title || 'new idea'}`);
        if (p.stage === 'validate' && p.concept) showScan(p.concept);
      },
      onResult: (r) => onResult(r)
    });
  }

  async function claudeSession(seed) {
    const apiKey = save.getApiKey();
    const model = save.settings.claudeModel;
    abortClaude = new AbortController();
    log(`Asking ${model} for ${memory.count} concepts…`);
    stageEl.textContent = 'Claude is designing concepts…';
    progressEl.style.width = '8%';
    let { concepts, conversation } = await requestConcepts({ apiKey, model, count: memory.count, theme: memory.theme, signal: abortClaude.signal });
    log(`Claude proposed: ${concepts.map((c) => c.name).join(', ')}`);
    let pending = concepts;
    const final = new Array(concepts.length).fill(null);
    let slots = concepts.map((_, i) => i);
    for (let round = 1; round <= 2 && pending.length; round++) {
      if (!running) return;
      pending.forEach((c) => showScan(c));
      const results = await runLabJob({ type: 'design', concepts: pending, seed: seed + round * 1000, maxIterations: 1 }, { onProgress: (p) => stage({ ...p, count: pending.length }) });
      const reviews = [];
      const nextSlots = [];
      results.forEach((r, i) => {
        const slot = slots[i];
        const journal = [...(final[slot]?.journal || []), ...(r.journal || []).map((j) => ({ ...j, version: round, changes: round > 1 ? ['Claude revised the design from the critic’s findings'] : ['Claude’s original proposal'] }))];
        r.journal = journal;
        if (r.concept?.design) { r.concept.design.journal = journal; r.concept.design.source = 'claude'; r.concept.design.archetypeTitle = 'Claude original'; }
        final[slot] = r;
        if (r.verdict !== 'accepted' && round < 2) {
          reviews.push({ name: r.concept?.name || `Concept ${slot + 1}`, verdict: r.verdict, score: r.score, findings: r.reasons?.length ? r.reasons : (r.journal?.at(-1)?.errors || []) });
          nextSlots.push(slot);
        }
        log(`${r.concept?.name}: ${r.verdict.toUpperCase()}${r.verdict === 'accepted' ? '' : ` — ${r.reasons?.[0] || 'failed validation'}`}`, r.verdict === 'accepted' ? 'ok' : 'bad');
      });
      if (!reviews.length || round === 2) break;
      log(`Sending ${reviews.length} critique${reviews.length > 1 ? 's' : ''} back to Claude for revision…`);
      stageEl.textContent = 'Claude is revising designs from the critique…';
      const rev = await revise({ apiKey, model, conversation, reviews, signal: abortClaude.signal });
      conversation = rev.conversation;
      pending = rev.concepts.slice(0, nextSlots.length);
      slots = nextSlots.slice(0, pending.length);
      log(`Claude revised: ${pending.map((c) => c.name).join(', ')}`);
    }
    for (const r of final) if (r) { memory.results.push(r); }
    renderResults();
  }

  function playRandom() {
    const c = randomExperiment();
    if (!c) { toast('No valid experiment found', 'Try again.', { error: true, iconName: 'x' }); return; }
    app.go('play', { kind: 'lab', concept: c, source: 'concept' });
  }

  /* -------------------------------------------------- COLLECTION -- */
  function renderCollection() {
    const list = [...save.data.lab.saved];
    if (!list.length) {
      body.append(h('div', { class: 'panel empty' }, icon('lab'), h('b', {}, 'Your collection is empty'), h('span', {}, 'Accepted designs you save from a session appear here.'),
        h('button', { class: 'btn', onclick: () => { memory.tab = 'design'; render(); } }, icon('spark'), 'Start a design session')));
      return;
    }
    let sort = 'recent';
    const grid = h('div', { class: 'lab-grid' });
    const paint = () => {
      clear(grid);
      const sorted = [...list].sort(sort === 'score' ? (a, b) => (b.design?.score || 0) - (a.design?.score || 0) : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      for (const c of sorted) {
        const best = save.data.records.lab[c.id];
        grid.append(conceptCard(app, c, { onOpen: () => app.go('detail', { concept: c, saved: true }), badge: best ? h('span', { class: 'chip' }, icon('trophy'), fmtNum(best)) : null }));
      }
    };
    body.append(h('div', { class: 'row between' }, h('span', { class: 'muted' }, `${list.length} saved design${list.length > 1 ? 's' : ''}`),
      seg([['recent', 'Recent'], ['score', 'Score'], ['name', 'Name']], sort, (v) => { sort = v; paint(); }, 'Sort')), grid);
    paint();
  }

  /* ------------------------------------------------------- SETS -- */
  function renderSets() {
    const sets = save.data.lab.sets;
    const saved = save.data.lab.saved;
    body.append(h('div', { class: 'panel' },
      h('h2', {}, icon('grid'), 'Piece sets'),
      h('p', {}, 'Mix your favourite pieces from any saved designs into your own set, then play it on standard rules.'),
      h('button', { class: 'btn', disabled: saved.length ? null : true, onclick: () => buildSet() }, icon('plus'), 'New set'),
      saved.length ? null : h('p', { class: 'faint', style: { marginTop: '8px' } }, 'Save at least one design to build a set.')));
    if (!sets.length) return;
    body.append(h('div', { class: 'lab-grid' }, sets.map((s) => h('div', { class: 'card' },
      conceptThumbs(app, { lattice: s.lattice, pieces: s.pieces }),
      h('h3', {}, s.name),
      h('p', {}, `${s.pieces.length} pieces · ${s.lattice === 'hex' ? 'hex grid' : 'square grid'}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => app.go('play', { kind: 'lab', concept: conceptFromSet(s), source: 'concept' }) }, icon('play'), 'Play'),
        h('button', { class: 'btn small ghost', onclick: async () => { const n = await promptDialog('Rename set', s.name); if (n) { save.saveSet({ ...s, name: n }); render(); } } }, icon('edit'), 'Rename'),
        h('button', { class: 'btn small ghost', 'aria-label': `Delete ${s.name}`, onclick: async () => { if (await confirmDialog(`Delete “${s.name}”?`, 'This set will be removed. The designs it came from are kept.', { ok: 'Delete', danger: true })) { save.deleteSet(s.id); render(); } } }, icon('trash')))))));
  }

  function buildSet() {
    const saved = save.data.lab.saved;
    let lattice = saved[0].lattice;
    const chosen = new Map();
    const view = h('div', {});
    const nameIn = h('input', { type: 'text', value: 'My Set', maxlength: '40', 'aria-label': 'Set name' });
    const status = h('span', { class: 'muted' });
    const paint = () => {
      clear(view);
      status.textContent = `${chosen.size} selected (max 10)`;
      for (const c of saved.filter((x) => x.lattice === lattice)) {
        view.append(h('h3', { style: { marginTop: '12px' } }, c.name), h('div', { class: 'piece-grid' }, c.pieces.map((p, i) => {
          const key = `${c.id}:${i}`;
          return h('button', { class: 'piece-tile', 'aria-pressed': String(chosen.has(key)), onclick: (e) => {
            if (chosen.has(key)) chosen.delete(key);
            else if (chosen.size < 10) chosen.set(key, { ...p, id: `s${chosen.size}${i}` });
            e.currentTarget.setAttribute('aria-pressed', String(chosen.has(key)));
            status.textContent = `${chosen.size} selected (max 10)`;
          } }, pieceCanvas(app, lattice, p), h('b', {}, p.name));
        })));
      }
    };
    const lattices = [...new Set(saved.map((c) => c.lattice))];
    modal((close) => [
      h('h2', {}, 'New piece set'),
      h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn),
      lattices.length > 1 ? h('div', { style: { margin: '10px 0' } }, seg(lattices.map((l) => [l, l === 'hex' ? 'Hex pieces' : 'Square pieces']), lattice, (v) => { lattice = v; chosen.clear(); paint(); }, 'Grid')) : null,
      h('div', { class: 'row between', style: { marginTop: '10px' } }, status),
      view,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
        h('button', { class: 'btn', onclick: () => {
          if (!chosen.size) { toast('Pick at least one piece', '', { error: true, iconName: 'x' }); return; }
          try {
            save.saveSet({ name: nameIn.value.trim() || 'My Set', lattice, pieces: [...chosen.values()] });
            close(); toast('Set saved', `${chosen.size} pieces`, { iconName: 'save' }); render();
          } catch (e) { toast('Could not save set', e.message, { error: true, iconName: 'x' }); }
        } }, icon('save'), 'Save set'))
    ], { wide: true, label: 'New piece set', onDismiss: () => {} });
    paint();
  }

  /* ---------------------------------------------------- COMPARE -- */
  function renderCompare() {
    const saved = save.data.lab.saved;
    if (saved.length < 2) {
      body.append(h('div', { class: 'panel empty' }, icon('compare'), h('b', {}, 'Save two or more designs to compare them'), h('span', {}, 'Compare critic scores, difficulty, flow and play-test metrics side by side.')));
      return;
    }
    memory.compare = memory.compare.filter((id) => saved.some((c) => c.id === id));
    if (memory.compare.length < 2) memory.compare = saved.slice(0, 2).map((c) => c.id);
    const tableWrap = h('div', {});
    const picker = h('div', { class: 'chips', role: 'group', 'aria-label': 'Designs to compare' });
    const paintPicker = () => {
      clear(picker);
      for (const c of saved) {
        picker.append(h('button', { class: 'chip', 'aria-pressed': String(memory.compare.includes(c.id)), onclick: () => {
          if (memory.compare.includes(c.id)) memory.compare = memory.compare.filter((x) => x !== c.id);
          else { memory.compare.push(c.id); if (memory.compare.length > 4) memory.compare.shift(); }
          paintPicker();
          paint();
        } }, c.name));
      }
    };
    paintPicker();
    const ROWS = [
      ['Critic score', (c) => c.design?.score, true, (v) => Math.round(v * 100)],
      ['Challenge', (c) => c.design?.components?.challenge, true, pct], ['Fairness', (c) => c.design?.components?.fairness, true, pct],
      ['Flow', (c) => c.design?.components?.flow, true, pct], ['Decisions', (c) => c.design?.components?.decisions, true, pct],
      ['Novelty', (c) => c.design?.components?.novelty, true, pct], ['Readability', (c) => c.design?.components?.readability, true, pct],
      ['Player survival', (c) => c.metrics?.playerSurvival, true, pct], ['Avg stack height', (c) => c.metrics?.avgHeight, null, pct],
      ['Pieces per clear', (c) => c.metrics?.piecesPerClear, false, (v) => v.toFixed(1)], ['Good options / turn', (c) => c.metrics?.goodOptions, null, (v) => v.toFixed(1)],
      ['Chain rate', (c) => c.metrics?.chainRate, null, (v) => `${(v * 100).toFixed(1)}%`], ['Pieces', (c) => c.pieces.length, null, String],
      ['Board', (c) => c.board.width * 100 + c.board.height, null, (v) => `${Math.floor(v / 100)}×${v % 100}`], ['Your best', (c) => save.data.records.lab[c.id], true, fmtNum]
    ];
    function pct(v) { return `${Math.round(v * 100)}%`; }
    const paint = () => {
      clear(tableWrap);
      const cols = memory.compare.map((id) => saved.find((c) => c.id === id)).filter(Boolean);
      if (cols.length < 2) { tableWrap.append(h('p', { class: 'muted' }, 'Select at least two designs.')); return; }
      tableWrap.append(h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'compare-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map((c) => h('th', {}, h('button', { class: 'chip', onclick: () => app.go('detail', { concept: c, saved: true }) }, c.name))))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Pieces'), cols.map((c) => h('td', {}, conceptThumbs(app, c, 5, 34)))),
          ROWS.map(([label, get, higher, fmt]) => {
            const vals = cols.map((c) => get(c));
            const nums = vals.filter((v) => Number.isFinite(v));
            const best = higher === null || !nums.length ? null : higher ? Math.max(...nums) : Math.min(...nums);
            return h('tr', {}, h('td', {}, label), vals.map((v) => h('td', { class: Number.isFinite(v) && v === best && nums.length > 1 ? 'best' : '' }, Number.isFinite(v) ? fmt(v) : '—')));
          })))));
    };
    body.append(h('div', { class: 'panel' }, h('h2', {}, icon('compare'), 'Compare designs'), h('p', { class: 'faint' }, 'Pick up to four. Best value in each row is highlighted.'), picker), h('div', { class: 'panel' }, tableWrap));
    paint();
  }

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar' },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => { if (running) { cancelLabJob(); abortClaude?.abort(); } app.home(); } }, icon('back')),
      h('h1', {}, icon('lab'), 'AI Tetris Lab'), h('span', { class: 'spacer' })),
    tabs, body));
  render();

  return {
    frame(dt) { if (demo && scanEl && document.contains(scanEl)) { demo.update(dt); demo.draw(); } },
    bgState: () => ({ intensity: running ? 0.45 : 0.2 }),
    key(e) {
      if (e.key === 'Escape') { if (running) { cancelLabJob(); abortClaude?.abort(); finish(true); } app.home(); return true; }
      return false;
    },
    unmount() { if (running) { cancelLabJob(); abortClaude?.abort(); running = false; } }
  };
}
