import { h, add, icon, clear, sw, seg, slider, toast, confirmDialog } from '../dom.js';
import { THEMES as THEME_IDS, STYLES, UNLOCKS, DEFAULT_KEYS } from '../../save.js';
import { THEMES } from '../../render/theme.js';
import { BlockPainter } from '../../render/blocks.js';
import { CLAUDE_MODELS, looksLikeKey } from '../../lab/claude.js';
import { keyLabel } from './help.js';
import { SOUND_NAMES } from '../../audio/audio.js';

const ACTION_LABELS = { left: 'Move left', right: 'Move right', soft: 'Soft drop', hard: 'Hard drop', cw: 'Rotate clockwise', ccw: 'Rotate counter-clockwise', r180: 'Rotate 180°', flip: 'Mirror', hold: 'Hold', pause: 'Pause' };
const STYLE_NAMES = { gem: 'Gem', jelly: 'Jelly', glass: 'Glass', neon: 'Neon', retro: 'Retro', flat: 'Flat (high clarity)' };
const TABS = [['audio', 'Audio'], ['controls', 'Controls'], ['visuals', 'Visuals'], ['access', 'Accessibility'], ['ai', 'AI'], ['data', 'Data']];

export function mount(root, params, app) {
  root.classList.add('scroll');
  const save = app.save;
  let tab = params.tab || 'audio';
  let listening = null;
  const body = h('div', { class: 'panel' });
  const set = (k, v) => { save.setSetting(k, v); app.applySettings(); };

  const row = (title, sub, control) => h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, title), sub ? h('small', {}, sub) : null), control);

  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings sections' },
    TABS.map(([id, label]) => h('button', { class: 'tab', role: 'tab', id: `tab-${id}`, 'aria-selected': String(id === tab), onclick: () => { tab = id; render(); } }, label)));

  function render() {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.id === `tab-${tab}`));
    clear(body);
    listening = null;
    const s = save.settings;
    if (tab === 'audio') {
      add(body, 
        h('h2', {}, icon('sound'), 'Audio'),
        row('Master volume', null, slider(s.master, 0, 1, 0.05, (v) => set('master', v), 'Master volume')),
        row('Music', 'Adaptive soundtrack that intensifies with the action', slider(s.music, 0, 1, 0.05, (v) => set('music', v), 'Music volume')),
        row('Sound effects', null, slider(s.sfx, 0, 1, 0.05, (v) => { set('sfx', v); app.audio.play('lock'); }, 'Effects volume')),
        row('Mute everything', null, sw(s.muted, (v) => set('muted', v), 'Mute')),
        row('Test', 'Play a line-clear sound', h('button', { class: 'btn small ghost silent', onclick: () => { app.audio.unlock(); app.audio.play('clear', { lines: 4 }); } }, icon('sound'), 'Play')));
    } else if (tab === 'controls') {
      add(body, 
        h('h2', {}, icon('grid'), 'Handling'),
        row('Auto-shift delay (DAS)', `${s.das} ms before a held direction starts repeating`, slider(s.das, 50, 300, 5, (v) => { set('das', v); body.querySelector('.das-sub').textContent = `${v} ms before a held direction starts repeating`; }, 'DAS')),
        row('Auto-repeat rate (ARR)', `${s.arr} ms between repeats (0 = instant)`, slider(s.arr, 0, 100, 1, (v) => { set('arr', v); body.querySelector('.arr-sub').textContent = `${v} ms between repeats (0 = instant)`; }, 'ARR')),
        row('Soft drop', null, seg([['slow', 'Slow'], ['fast', 'Fast'], ['instant', 'Instant']], s.softDrop, (v) => set('softDrop', v), 'Soft drop speed')),
        row('Next previews', null, seg([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], s.previews, (v) => set('previews', v), 'Preview count')),
        row('Ghost piece', 'Shows where the piece will land', sw(s.ghost, (v) => set('ghost', v), 'Ghost piece')),
        row('Touch controls', 'Auto shows buttons and gestures on touch screens', seg([['auto', 'Auto'], ['buttons', 'Buttons'], ['gestures', 'Gestures'], ['off', 'Off']], s.touch, (v) => set('touch', v), 'Touch controls')),
        row('Vibration', 'Haptic feedback on supported phones', sw(s.haptics, (v) => set('haptics', v), 'Vibration')),
        h('h2', { style: { marginTop: '18px' } }, icon('edit'), 'Key bindings'),
        h('p', { class: 'faint' }, 'Click a key to replace it, or + to add another. Press Escape to cancel.'),
        Object.keys(ACTION_LABELS).map((a) => bindRow(a)),
        h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn small ghost', onclick: () => { set('keys', JSON.parse(JSON.stringify(DEFAULT_KEYS))); render(); toast('Key bindings reset'); } }, icon('refresh'), 'Reset to defaults')));
      body.querySelectorAll('.setting small')[0].classList.add('das-sub');
      body.querySelectorAll('.setting small')[1].classList.add('arr-sub');
    } else if (tab === 'visuals') {
      add(body, 
        h('h2', {}, icon('eye'), 'Theme'),
        h('div', { class: 'swatches' }, THEME_IDS.map((id) => themeSwatch(id))),
        h('h2', { style: { marginTop: '20px' } }, icon('grid'), 'Piece style'),
        h('div', { class: 'swatches' }, STYLES.map((id) => styleSwatch(id))),
        h('h2', { style: { marginTop: '20px' } }, icon('spark'), 'Effects'),
        row('Screen shake', 'On big clears and hard drops', sw(s.shake, (v) => set('shake', v), 'Screen shake')),
        row('Show frame rate', null, sw(s.showFps, (v) => { set('showFps', v); app.debug?.fps(v); }, 'Show FPS')));
    } else if (tab === 'access') {
      add(body, 
        h('h2', {}, icon('eye'), 'Accessibility'),
        row('Motion', 'Reduced turns off shake, background motion and most animation', seg([['auto', 'System'], ['full', 'Full'], ['reduced', 'Reduced']], s.motion, (v) => set('motion', v), 'Motion')),
        row('High contrast', 'Pure black well, bold white outlines, flat pieces', sw(s.highContrast, (v) => set('highContrast', v), 'High contrast')),
        row('Colour-blind symbols', 'Every piece colour also gets a unique symbol', sw(s.glyphs, (v) => set('glyphs', v), 'Colour-blind symbols')),
        row('Text size', null, seg([[0.9, 'Small'], [1, 'Normal'], [1.12, 'Large'], [1.25, 'Huge']], s.uiScale, (v) => set('uiScale', v), 'Text size')),
        h('p', { class: 'faint', style: { marginTop: '12px' } }, 'Every sound has a visual counterpart: clears, combos, level-ups and danger are always shown on screen, and the well glows red when the stack gets high.'));
    } else if (tab === 'ai') {
      const key = save.getApiKey();
      let input;
      add(body, 
        h('h2', {}, icon('robot'), 'Claude designer (optional)'),
        h('p', {}, 'The Lab designs games on your device with no account needed. Add your own Anthropic API key and Claude can propose designs too. Its ideas go through the same validation, play-testing and critique as the Lab’s own.'),
        h('p', { class: 'faint' }, 'Your key is stored only in this browser, is never included in save exports, and is sent only to api.anthropic.com. Requests are billed to your Anthropic account.'),
        h('label', { class: 'field' }, h('span', {}, 'API key'),
          h('div', { class: 'row' },
            input = h('input', { type: 'password', placeholder: key ? '•••••••• (saved)' : 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', style: { flex: '1', minWidth: '200px' } }),
            h('button', { class: 'btn small', onclick: () => {
              const v = input.value.trim();
              if (!looksLikeKey(v)) { toast('That does not look like an API key', 'Anthropic keys start with sk-ant-', { error: true, iconName: 'x' }); return; }
              save.setApiKey(v); input.value = ''; toast('API key saved', 'Claude is now available in the Lab', { iconName: 'robot' }); render();
            } }, icon('save'), 'Save'),
            key ? h('button', { class: 'btn small ghost', onclick: () => { save.setApiKey(''); toast('API key removed'); render(); } }, icon('trash'), 'Remove') : null)),
        h('div', { style: { height: '12px' } }),
        row('Model', 'Opus designs best; Sonnet and Haiku are faster and cheaper',
          h('select', { 'aria-label': 'Claude model', onchange: (e) => set('claudeModel', e.target.value) },
            CLAUDE_MODELS.map((m) => h('option', { value: m.id, selected: m.id === s.claudeModel ? true : null }, m.label)))),
        row('Status', null, h('span', { class: `chip ${key ? 'good' : ''}` }, key ? 'Key saved' : 'No key — on-device designer only')));
    } else if (tab === 'data') {
      let file;
      add(body, 
        h('h2', {}, icon('save'), 'Your data'),
        h('p', {}, 'Progress, records, settings and your Lab collection are saved automatically in this browser.'),
        row('Export', 'Download everything as a JSON file (API key excluded)', h('button', { class: 'btn small ghost', onclick: () => {
          const blob = new Blob([save.export()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `prismfall-save-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } }, icon('download'), 'Export')),
        row('Import', 'Replace your data with an exported file', h('span', {},
          file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async () => {
            const f = file.files[0];
            if (!f) return;
            if (!(await confirmDialog('Import this save?', 'Your current progress, records, settings and collection will be replaced.', { ok: 'Import', danger: true }))) return;
            try {
              save.import(await f.text());
              app.applySettings();
              toast('Save imported', 'Everything has been restored', { iconName: 'check' });
              render();
            } catch (e) {
              toast('Import failed', e.message.includes('JSON') ? 'That file is not valid JSON.' : e.message, { error: true, iconName: 'x' });
            }
            file.value = '';
          } }),
          h('button', { class: 'btn small ghost', onclick: () => file.click() }, icon('upload'), 'Import'))),
        row('Reset settings', 'Restore every setting to its default', h('button', { class: 'btn small ghost', onclick: async () => {
          if (await confirmDialog('Reset all settings?', 'Controls, audio and visuals go back to defaults. Progress is kept.', { ok: 'Reset' })) { save.resetSettings(); app.applySettings(); render(); toast('Settings reset'); }
        } }, icon('refresh'), 'Reset')),
        row('Erase everything', 'Progress, records, achievements and your Lab collection', h('button', { class: 'btn small danger', onclick: async () => {
          if (!(await confirmDialog('Erase all data?', 'This permanently deletes your progress, records, achievements and every saved design.', { ok: 'Continue', danger: true }))) return;
          if (!(await confirmDialog('Are you absolutely sure?', 'There is no undo. Consider exporting first.', { ok: 'Erase everything', danger: true }))) return;
          save.resetAll(); app.applySettings(); render(); toast('All data erased');
        } }, icon('trash'), 'Erase')));
      void SOUND_NAMES;
    }
  }

  function bindRow(action) {
    const codes = save.settings.keys[action] || [];
    const caps = codes.map((c, i) => h('button', { class: 'keycap silent', 'aria-label': `${ACTION_LABELS[action]}: ${keyLabel(c)}. Click to rebind`, onclick: (e) => listen(action, i, e.currentTarget) }, keyLabel(c)));
    if (codes.length < 3) caps.push(h('button', { class: 'keycap silent', 'aria-label': `Add a key for ${ACTION_LABELS[action]}`, onclick: (e) => listen(action, codes.length, e.currentTarget) }, '+'));
    return row(ACTION_LABELS[action], null, h('span', { class: 'keys' }, caps));
  }

  function listen(action, index, el) {
    if (listening) listening.el.classList.remove('listening');
    listening = { action, index, el };
    el.classList.add('listening');
    el.textContent = '…';
  }

  function themeSwatch(id) {
    const th = THEMES[id];
    const unlocked = save.isUnlocked('theme', id);
    const u = UNLOCKS.theme[id];
    return h('button', { class: 'swatch', 'aria-pressed': String(save.settings.theme === id), 'aria-label': `${th.name} theme${unlocked ? '' : ' (locked)'}`, onclick: () => {
      if (!unlocked) { toast(`${th.name} is locked`, u.label, { iconName: 'lock' }); return; }
      set('theme', id); render();
    } },
    h('div', { class: 'sw', style: { background: `linear-gradient(135deg, ${th.bg[0]}, ${th.bg[1]} 55%, ${th.bg[2]})` } },
      h('div', { style: { display: 'flex', gap: '5px' } }, th.blobs.slice(0, 4).map((c) => h('i', { style: { width: '14px', height: '14px', borderRadius: '4px', background: c, boxShadow: `0 0 10px ${c}` } })))),
    h('span', { class: 'nm' }, th.name), h('small', { class: 'faint' }, th.desc),
    unlocked ? null : h('div', { class: 'lock' }, icon('lock'), u.label));
  }

  function styleSwatch(id) {
    const unlocked = save.isUnlocked('style', id);
    const u = UNLOCKS.style[id];
    const painter = new BlockPainter();
    painter.configure({ style: id, theme: app.theme, highContrast: false, glyphs: false });
    const dpr = Math.min(2, devicePixelRatio || 1);
    const c = h('canvas', { width: String(120 * dpr), height: String(56 * dpr), style: { width: '120px', height: '56px' }, 'aria-hidden': 'true' });
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    [1, 3, 5, 2].forEach((col, i) => painter.draw(ctx, 'square', col, 0, 21 + i * 26, 28, 24));
    return h('button', { class: 'swatch', 'aria-pressed': String(save.settings.style === id), 'aria-label': `${STYLE_NAMES[id]} pieces${unlocked ? '' : ' (locked)'}`, onclick: () => {
      if (!unlocked) { toast(`${STYLE_NAMES[id]} is locked`, u.label, { iconName: 'lock' }); return; }
      set('style', id); render();
    } }, h('div', { class: 'sw', style: { background: 'rgba(0,0,0,.35)' } }, c), h('span', { class: 'nm' }, STYLE_NAMES[id]),
    unlocked ? null : h('div', { class: 'lock' }, icon('lock'), u.label));
  }

  root.append(h('div', { class: 'content' },
    h('div', { class: 'topbar' },
      h('button', { class: 'iconbtn back', 'aria-label': 'Back', onclick: () => app.back() }, icon('back')),
      h('h1', {}, icon('gear'), 'Settings'), h('span', { class: 'spacer' })),
    tabs, body));
  render();

  return {
    key(e) {
      if (!listening) return false;
      e.preventDefault();
      if (e.key === 'Escape') { listening = null; render(); return true; }
      const { action, index } = listening;
      const keys = JSON.parse(JSON.stringify(save.settings.keys));
      // A key can only do one thing: remove it from every other action.
      for (const a of Object.keys(keys)) keys[a] = keys[a].filter((c) => c !== e.code);
      const list = keys[action];
      if (index < list.length) list[index] = e.code; else list.push(e.code);
      for (const a of Object.keys(keys)) if (!keys[a].length) keys[a] = DEFAULT_KEYS[a].filter((c) => !Object.values(keys).flat().includes(c)).slice(0, 1);
      set('keys', keys);
      app.audio.play('toggle');
      render();
      return true;
    },
    settingsChanged() {},
    bgState: () => ({ intensity: 0.1 })
  };
}
