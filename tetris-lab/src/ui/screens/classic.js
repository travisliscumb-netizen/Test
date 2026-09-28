import { h, icon, fmtTime, fmtNum } from '../dom.js';
import { drawPieceIcon } from '../../render/board.js';
import { CLASSIC_DEFS } from '../../engine/pieces.js';

export const MODES = {
  marathon: { title: 'Marathon', desc: 'Endless. Every 10 lines the speed rises. How far can you climb?', goal: null, art: ['T', 'I', 'L'] },
  sprint: { title: 'Sprint', desc: 'Clear 40 lines as fast as you can. Pure speed and efficiency.', goal: { type: 'lines', value: 40 }, art: ['I', 'I', 'O'] },
  ultra: { title: 'Ultra', desc: 'Two minutes on the clock. Chase big clears, combos and T-Spins for score.', goal: { type: 'time', value: 120000 }, art: ['T', 'S', 'Z'] }
};

export function artCanvas(app, ids, w = 220, hgt = 100) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = h('canvas', { width: String(w * dpr), height: String(hgt * dpr), style: { width: `${w}px`, height: `${hgt}px` }, 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ids.forEach((id, i) => {
    const def = CLASSIC_DEFS.find((d) => d.id === id);
    ctx.save();
    const cx = (w / ids.length) * (i + 0.5);
    ctx.translate(cx, hgt / 2 + (i % 2 ? 8 : -6));
    ctx.rotate((i - 1) * 0.18);
    drawPieceIcon(ctx, app.painter, 'square', def.cells, [def.color], null, 0, 0, w / ids.length - 8, hgt - 16, 20);
    ctx.restore();
  });
  return c;
}

export function mount(root, params, app) {
  app.audio.setMusic('menu');
  root.classList.add('scroll');
  let startLevel = 1;
  const rec = app.save.data.records;

  const recLine = (mode) => {
    const best = rec[mode][0];
    if (!best) return h('div', { class: 'rec' }, h('span', {}, 'No record yet — set the first one.'));
    if (mode === 'sprint') return h('div', { class: 'rec' }, h('span', {}, 'Best ', h('b', {}, fmtTime(best.timeMs))), h('span', {}, 'Score ', h('b', {}, fmtNum(best.score))));
    return h('div', { class: 'rec' }, h('span', {}, 'Best ', h('b', {}, fmtNum(best.score))), h('span', {}, 'Lines ', h('b', {}, String(best.lines))), h('span', {}, 'Lv ', h('b', {}, String(best.level))));
  };

  const out = h('output', { 'aria-live': 'polite' }, '1');
  const stepper = h('div', { class: 'stepper', onclick: (e) => e.stopPropagation() },
    h('button', { class: 'silent', 'aria-label': 'Lower start level', onclick: () => { startLevel = Math.max(1, startLevel - 1); out.textContent = String(startLevel); app.audio.play('toggle'); } }, '−'),
    out,
    h('button', { class: 'silent', 'aria-label': 'Raise start level', onclick: () => { startLevel = Math.min(15, startLevel + 1); out.textContent = String(startLevel); app.audio.play('toggle'); } }, '+'));

  const card = (mode) => {
    const m = MODES[mode];
    const start = () => app.go('play', { kind: 'classic', mode, startLevel: mode === 'marathon' ? startLevel : 1 });
    return h('div', { class: 'card clickable', onclick: start },
      h('div', { class: 'art' }, artCanvas(app, m.art)),
      h('h3', {}, m.title),
      h('p', {}, m.desc),
      mode === 'marathon' ? h('div', { class: 'row', onclick: (e) => e.stopPropagation() }, h('span', { class: 'muted' }, 'Start level'), stepper) : null,
      recLine(mode),
      h('button', { class: 'btn small', id: `mode-${mode}`, onclick: (e) => { e.stopPropagation(); start(); } }, icon('play'), `Play ${m.title}`));
  };

  root.append(
    h('div', { class: 'content' },
      h('div', { class: 'topbar' },
        h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => app.back() }, icon('back')),
        h('h1', {}, icon('play'), 'Classic'),
        h('span', { class: 'spacer' })),
      h('div', { class: 'cards' }, card('marathon'), card('sprint'), card('ultra')),
      h('div', { class: 'panel' },
        h('h2', {}, icon('bolt'), 'The rules you know'),
        h('p', {}, 'Seven tetrominoes, the Super Rotation System with wall kicks, hold, ghost piece and a five-piece preview. Guideline scoring rewards Tetrises, T-Spins, back-to-back clears, combos and perfect clears.'))));

  requestAnimationFrame(() => document.getElementById('mode-marathon')?.focus({ preventScroll: true }));
  return { bgState: () => ({ intensity: 0.2 }) };
}
