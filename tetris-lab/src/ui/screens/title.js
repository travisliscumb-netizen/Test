import { h, icon } from '../dom.js';
import { Demo } from '../demo.js';
import { classicRules } from '../../engine/rules.js';
import { CHALLENGES } from '../../save.js';
import { PALETTE } from '../../render/theme.js';

const LETTERS = 'PRISMFALL';
const LETTER_COLORS = [1, 3, 5, 2, 4, 6, 7, 1, 3];

export function mount(root, params, app) {
  app.audio.setMusic('menu');
  app.audio.setIntensity(0.25);
  root.classList.add('title-screen');

  let taps = 0, tapTimer = null;
  const logo = h('h1', { class: 'logo', 'aria-label': 'Prismfall', onclick: () => {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 7) { taps = 0; app.debug?.toggle(); }
  } }, [...LETTERS].map((ch, i) => h('span', { style: { '--c': PALETTE[LETTER_COLORS[i]], '--i': String(i) }, 'aria-hidden': 'true' }, ch)));

  const rank = app.save.rank;
  const pct = Math.round((rank.into / rank.span) * 100);
  const badge = h('button', { class: 'rank-badge', onclick: () => app.go('progress'), 'aria-label': `Rank ${rank.level}, open progress` },
    h('span', { class: 'num', style: { '--p': String(pct) } }, h('b', {}, String(rank.level))),
    h('span', {}, h('b', {}, `Rank ${rank.level}`), h('small', {}, `${rank.into.toLocaleString()} / ${rank.span.toLocaleString()} XP`)));

  const ch = app.save.data.challenges.list;
  const strip = h('div', { class: 'challenge-strip', 'aria-label': "Today's challenges" },
    h('div', { class: 'label-caps' }, "Today's challenges"),
    ch.map((c) => {
      const def = CHALLENGES.find((d) => d.id === c.id);
      if (!def) return null;
      const p = Math.min(100, Math.round((c.progress / def.goal) * 100));
      return h('div', { class: 'ch' }, c.done ? icon('check') : icon('target'), h('span', {}, def.text), h('span', { class: 'bar' }, h('i', { style: { width: `${p}%` } })));
    }));

  const menu = h('nav', { class: 'menu', 'aria-label': 'Main menu' },
    h('button', { class: 'btn big', id: 'play-classic', onclick: () => app.go('classic') }, icon('play'), 'Play Classic'),
    h('button', { class: 'btn big warm', id: 'open-lab', onclick: () => app.go('lab') }, icon('lab'), 'AI Tetris Lab'),
    h('button', { class: 'btn ghost', onclick: () => app.go('progress') }, icon('trophy'), 'Progress & Records'));
  const row = h('div', { class: 'menu-row' },
    h('button', { class: 'btn ghost', onclick: () => app.go('settings') }, icon('gear'), 'Settings'),
    h('button', { class: 'btn ghost', onclick: () => app.go('help') }, icon('help'), 'How to Play'));

  const left = h('div', { class: 'title-left' },
    logo,
    h('p', { class: 'tagline' }, 'Falling blocks, reinvented — with a lab that invents new ones.'),
    menu, row, badge, strip);

  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const well = h('div', { class: 'demo-well' }, canvas, h('span', { class: 'demo-label' }, 'Live demo · the bot that play-tests the Lab'));
  const right = h('div', { class: 'title-right' }, well);
  root.append(left, right, h('div', { class: 'title-footer' }, 'Keyboard, touch and gamepad supported'));

  const demo = new Demo(canvas, app.painter, classicRules());
  const layout = () => {
    const narrow = innerWidth <= 980;
    const hAvail = narrow ? innerHeight * 0.95 : Math.min(innerHeight * 0.78, 720);
    const wAvail = narrow ? innerWidth * 0.9 : Math.min(innerWidth * 0.34, 420);
    demo.resize(wAvail, hAvail, Math.min(2, devicePixelRatio || 1));
    demo.configure({ theme: app.theme, highContrast: app.settings.highContrast, ghost: true, reduced: app.reduced });
  };
  layout();

  // Arrow-key navigation through the menu.
  const focusables = () => [...root.querySelectorAll('.menu .btn, .menu-row .btn, .rank-badge')];
  requestAnimationFrame(() => document.getElementById('play-classic')?.focus({ preventScroll: true }));

  if (!app.settings.seenIntro) {
    app.save.setSetting('seenIntro', true);
    setTimeout(() => app.go('help', { first: true }), 250);
  }

  return {
    frame(dt) { demo.update(dt); demo.draw(); },
    resize: layout,
    settingsChanged: layout,
    bgState: () => ({ intensity: 0.15 }),
    key(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const f = focusables();
        const i = f.indexOf(document.activeElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % f.length : (i - 1 + f.length) % f.length;
        f[n]?.focus();
        e.preventDefault();
        return true;
      }
      return false;
    },
    unmount() { clearTimeout(tapTimer); }
  };
}
