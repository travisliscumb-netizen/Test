import { h, icon, clear, fmtTime, fmtNum } from '../dom.js';
import { ACHIEVEMENTS, CHALLENGES, UNLOCKS } from '../../save.js';
import { THEMES } from '../../render/theme.js';

const STYLE_NAMES = { jelly: 'Jelly pieces', glass: 'Glass pieces', neon: 'Neon pieces', retro: 'Retro pieces' };

export function mount(root, params, app) {
  root.classList.add('scroll');
  const save = app.save;
  const d = save.data;
  const rank = save.rank;
  const pct = Math.round((rank.into / rank.span) * 100);

  const got = ACHIEVEMENTS.filter((a) => save.has(a.id)).length;

  const rankPanel = h('div', { class: 'panel' },
    h('div', { class: 'big-rank' },
      h('span', { class: 'rank-badge', style: { padding: 0, background: 'none', border: 0, cursor: 'default' } },
        h('span', { class: 'num', style: { '--p': String(pct) } }, h('b', {}, String(rank.level)))),
      h('div', {},
        h('div', { class: 'label-caps' }, 'Rank'),
        h('div', { style: { fontSize: '1.8rem', fontWeight: 700 } }, `Rank ${rank.level}`),
        h('div', { class: 'muted' }, `${fmtNum(rank.into)} / ${fmtNum(rank.span)} XP to rank ${rank.level + 1}`),
        h('div', { class: 'levelbar', style: { width: 'min(320px, 60vw)', height: '8px' } }, h('i', { style: { width: `${pct}%` } })))),
    h('p', { class: 'faint', style: { marginTop: '12px' } }, 'Earn XP from every game, achievement and daily challenge. Ranks unlock themes and piece styles.'));

  const challenges = h('div', { class: 'panel' },
    h('h2', {}, icon('target'), "Today's challenges"),
    d.challenges.list.map((c) => {
      const def = CHALLENGES.find((x) => x.id === c.id);
      if (!def) return null;
      const p = Math.min(100, Math.round((c.progress / def.goal) * 100));
      return h('div', { class: 'setting' },
        h('div', { class: 'txt' }, h('b', {}, def.text), h('small', {}, c.done ? `Complete · +${def.xp} XP` : `${fmtNum(Math.min(c.progress, def.goal))} / ${fmtNum(def.goal)} · ${def.xp} XP`)),
        c.done ? h('span', { class: 'chip good' }, icon('check'), 'Done') : h('div', { class: 'levelbar', style: { width: '120px' } }, h('i', { style: { width: `${p}%` } })));
    }),
    h('p', { class: 'faint', style: { marginTop: '8px' } }, 'New challenges every day.'));

  const unlockList = [
    ...Object.entries(UNLOCKS.theme).map(([id, u]) => ({ name: `${THEMES[id].name} theme`, u, ok: save.isUnlocked('theme', id) })),
    ...Object.entries(UNLOCKS.style).map(([id, u]) => ({ name: STYLE_NAMES[id], u, ok: save.isUnlocked('style', id) }))
  ];
  const unlocks = h('div', { class: 'panel' },
    h('h2', {}, icon('lock'), 'Unlockables'),
    unlockList.map((x) => h('div', { class: 'setting' },
      h('div', { class: 'txt' }, h('b', {}, x.name), h('small', {}, x.u.label)),
      x.ok ? h('span', { class: 'chip good' }, icon('check'), 'Unlocked') : h('span', { class: 'chip' }, icon('lock'), 'Locked'))),
    h('button', { class: 'btn small ghost', style: { marginTop: '10px' }, onclick: () => app.go('settings', { tab: 'visuals' }) }, icon('eye'), 'Choose theme & style'));

  const ach = h('div', { class: 'panel' },
    h('h2', {}, icon('medal'), `Achievements · ${got}/${ACHIEVEMENTS.length}`),
    h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((a) => h('div', { class: `ach${save.has(a.id) ? ' got' : ''}` },
      h('div', { class: 'medal' }, icon(save.has(a.id) ? 'medal' : 'lock')),
      h('div', {}, h('b', {}, a.name), h('small', {}, a.desc))))));

  const st = d.stats;
  const statRows = [
    ['Games played', fmtNum(st.games)], ['Time played', fmtTime(st.timeMs).split('.')[0]], ['Pieces placed', fmtNum(st.pieces)],
    ['Lines cleared', fmtNum(st.lines)], ['Tetrises', fmtNum(st.tetrises)], ['T-Spins', fmtNum(st.tspins)], ['Perfect clears', fmtNum(st.pcs)],
    ['Best combo', fmtNum(st.maxCombo)], ['Best Marathon level', fmtNum(st.bestLevel)], ['Clutch saves', fmtNum(st.clutches)],
    ['Lab games', fmtNum(st.labGames)], ['Lab sessions', fmtNum(st.labSessions)], ['Designs tested', fmtNum(st.designsTested)],
    ['Designs accepted', fmtNum(st.designsAccepted)], ['Designs saved', fmtNum(st.designsSaved)], ['Best chain', fmtNum(st.maxChain)], ['Bombs detonated', fmtNum(st.bombs)]
  ];
  const stats = h('div', { class: 'panel' },
    h('h2', {}, icon('chart'), 'Statistics'),
    h('div', { class: 'result-grid' }, statRows.map(([k, v]) => h('div', { class: 'cell' }, h('div', { class: 'label-caps' }, k), h('div', { class: 'v' }, v)))));

  let boardMode = 'marathon';
  const tableWrap = h('div', {});
  const boardTabs = h('div', { class: 'tabs', role: 'tablist', style: { marginBottom: '10px', alignSelf: 'flex-start' } },
    ['marathon', 'sprint', 'ultra'].map((m) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(m === boardMode), onclick: (e) => {
      boardMode = m;
      for (const b of boardTabs.children) b.setAttribute('aria-selected', 'false');
      e.currentTarget.setAttribute('aria-selected', 'true');
      renderTable();
    } }, m[0].toUpperCase() + m.slice(1))));
  function renderTable() {
    clear(tableWrap);
    const list = d.records[boardMode];
    if (!list.length) { tableWrap.append(h('div', { class: 'empty' }, icon('trophy'), h('span', {}, 'No records yet.'), h('button', { class: 'btn small', onclick: () => app.go('play', { kind: 'classic', mode: boardMode }) }, icon('play'), `Play ${boardMode}`))); return; }
    tableWrap.append(h('table', { class: 'scores-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, boardMode === 'sprint' ? 'Time' : 'Score'), h('th', {}, boardMode === 'sprint' ? 'Score' : 'Lines'), h('th', {}, 'Level'), h('th', {}, 'Date'))),
      h('tbody', {}, list.map((r, i) => h('tr', {},
        h('td', {}, String(i + 1)),
        h('td', {}, boardMode === 'sprint' ? fmtTime(r.timeMs) : fmtNum(r.score)),
        h('td', {}, boardMode === 'sprint' ? fmtNum(r.score) : String(r.lines)),
        h('td', {}, String(r.level)),
        h('td', { class: 'faint' }, r.date ? new Date(r.date).toLocaleDateString() : '—'))))));
  }
  renderTable();
  const scores = h('div', { class: 'panel' }, h('h2', {}, icon('trophy'), 'High scores'), boardTabs, tableWrap);

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar' },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => app.back() }, icon('back')),
      h('h1', {}, icon('trophy'), 'Progress & Records'), h('span', { class: 'spacer' })),
    h('div', { class: 'help-grid' }, rankPanel, challenges),
    scores, ach, h('div', { class: 'help-grid' }, stats, unlocks)));

  return { bgState: () => ({ intensity: 0.12 }) };
}
