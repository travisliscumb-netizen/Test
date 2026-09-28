import { h, icon } from '../dom.js';

const LABELS = { left: 'Move left', right: 'Move right', soft: 'Soft drop', hard: 'Hard drop', cw: 'Rotate clockwise', ccw: 'Rotate counter-clockwise', r180: 'Rotate 180°', flip: 'Mirror (Lab pieces)', hold: 'Hold', pause: 'Pause' };

export function keyLabel(code) {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('ControlLeft', 'Ctrl').replace('ShiftLeft', 'Shift').replace('Escape', 'Esc');
}

export function mount(root, params, app) {
  root.classList.add('scroll');
  const keys = app.settings.keys;
  const first = !!params.first;

  const controls = h('div', { class: 'panel' },
    h('h2', {}, icon('grid'), 'Keyboard'),
    Object.entries(LABELS).map(([a, label]) => h('div', { class: 'keyrow' }, h('span', {}, label), h('span', { class: 'keys' }, (keys[a] || []).map((k) => h('span', { class: 'keycap' }, keyLabel(k)))))),
    h('p', { class: 'faint', style: { marginTop: '10px' } }, 'Rebind any key in Settings → Controls. Gamepads work too: D-pad moves, A/B rotate, X or LB holds, D-pad up hard-drops.'));

  const touch = h('div', { class: 'panel' },
    h('h2', {}, icon('target'), 'Touch'),
    h('div', { class: 'keyrow' }, h('span', {}, 'Tap the well'), h('span', { class: 'muted' }, 'Rotate (left third: counter-clockwise)')),
    h('div', { class: 'keyrow' }, h('span', {}, 'Drag sideways'), h('span', { class: 'muted' }, 'Slide cell by cell')),
    h('div', { class: 'keyrow' }, h('span', {}, 'Drag down'), h('span', { class: 'muted' }, 'Soft drop')),
    h('div', { class: 'keyrow' }, h('span', {}, 'Flick down'), h('span', { class: 'muted' }, 'Hard drop')),
    h('div', { class: 'keyrow' }, h('span', {}, 'Flick up'), h('span', { class: 'muted' }, 'Hold')),
    h('p', { class: 'faint', style: { marginTop: '10px' } }, 'On-screen buttons are shown on touch devices; choose buttons, gestures or both in Settings.'));

  const scoring = h('div', { class: 'panel' },
    h('h2', {}, icon('star'), 'Scoring'),
    [['Single / Double / Triple', '100 / 300 / 500 × level'], ['Tetris (4 lines)', '800 × level'], ['T-Spin Single / Double / Triple', '800 / 1200 / 1600 × level'],
      ['Back-to-back difficult clear', '× 1.5'], ['Combo', '+50 × combo × level'], ['Perfect clear', 'up to 3200 × level'], ['Soft / hard drop', '1 / 2 per cell']]
      .map(([k, v]) => h('div', { class: 'keyrow' }, h('span', {}, k), h('b', {}, v))));

  const lab = h('div', { class: 'panel' },
    h('h2', {}, icon('lab'), 'The AI Tetris Lab'),
    h('p', {}, 'The Lab designs new falling-block games. Each idea starts as a hypothesis about what could be better — hexagonal cells, colour matching, pieces that morph instead of rotating, walls that wrap around, explosive cells, pieces joined at their corners…'),
    h('p', {}, 'Every design is built, validated for safety, then play-tested by two bots: an expert (can it be survived at all?) and a human-like player (is it fair and fun?). A critic scores the results, names the weaknesses, and the designer changes the rules and tests again — up to five rounds, followed by a confirmation run on fresh seeds.'),
    h('p', {}, 'Accepted designs can be played, saved, renamed, edited and re-tested, compared side by side, or mined for pieces to build your own sets. With your own Claude API key (Settings → AI), Claude can propose designs too — and they go through exactly the same tests.'));

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar' },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => app.back() }, icon('back')),
      h('h1', {}, icon('help'), first ? 'Welcome to Prismfall' : 'How to Play'),
      h('span', { class: 'spacer' }),
      first ? h('button', { class: 'btn', onclick: () => app.go('classic', {}, { replace: true }) }, icon('play'), "Let's play") : null),
    first ? h('div', { class: 'panel' }, h('p', { style: { margin: 0, fontSize: '1.05rem' } }, 'Stack falling pieces, complete rows to clear them, and don’t let the stack reach the top. Here is everything you need — you can come back to this page from the main menu any time.')) : null,
    h('div', { class: 'help-grid' }, controls, touch, scoring, lab)));

  return { bgState: () => ({ intensity: 0.1 }) };
}
