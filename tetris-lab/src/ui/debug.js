/* Hidden developer panel. Open with Ctrl+Shift+D, ?debug in the URL, or by
   tapping the title logo seven times. Never shown to normal players and has
   no effect on play unless something in it is used. */

import { h, clear } from './dom.js';
import { Bot } from '../engine/bot.js';
import { makeCell } from '../engine/board.js';
import { GARBAGE_COLOR } from '../engine/pieces.js';
import { SOUND_NAMES } from '../audio/audio.js';
import { generateConcept } from '../lab/generator.js';
import { validateConcept } from '../lab/validate.js';
import { SAVE_KEY } from '../save.js';

export class Debug {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.el = null;
    this.session = null;
    this.assistStrength = 0.7;
    this.assistEnabled = true;
    this.autoplay = false;
    this.bot = null;
    this.autoT = 0;
    this.frozen = false;
    this.frames = [];
    this.fpsEl = null;
    this.refreshT = 0;
    app.frameHooks.add((dt) => this.tick(dt));
    if (app.settings.showFps) this.fps(true);
  }

  attach(session) {
    this.session = session;
    this.bot = session ? new Bot(session.rules, { skill: 1 }) : null;
    this.frozen = false;
    if (session?.assist) { session.assist.setStrength(this.assistStrength); session.assist.enabled = this.assistEnabled; }
    if (this.open) this.render();
  }

  onScreen() { if (this.open) this.render(); }

  toggle(force) {
    this.open = force ?? !this.open;
    if (this.open) this.render();
    else { this.el?.remove(); this.el = null; }
  }

  fps(on) {
    if (on && !this.fpsEl) { this.fpsEl = h('div', { class: 'fps' }, '-- fps'); document.body.append(this.fpsEl); }
    if (!on && this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; }
  }

  tick(dt) {
    this.frames.push(dt);
    if (this.frames.length > 90) this.frames.shift();
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    if (this.fpsEl) this.fpsEl.textContent = `${(1 / Math.max(1e-4, avg)).toFixed(0)} fps · ${(avg * 1000).toFixed(1)} ms`;
    const g = this.session?.game;
    if (g && this.autoplay && this.session.started && !this.session.paused && g.phase === 'playing') {
      this.autoT -= dt;
      if (this.autoT <= 0) { this.bot.playOne(g); this.autoT = 0.12; }
    }
    if (this.open) {
      this.refreshT -= dt;
      if (this.refreshT <= 0) { this.refreshT = 0.25; this.refreshLive(); }
    }
  }

  btn(label, fn) { return h('button', { onclick: () => { try { fn(); } catch (e) { console.error(e); } this.refreshLive(); } }, label); }

  render() {
    this.el?.remove();
    const app = this.app;
    const g = this.session?.game;
    this.live = h('div', {});
    const panel = h('div', { class: 'debug', role: 'dialog', 'aria-label': 'Developer panel' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('b', {}, 'PRISMFALL · DEV'), this.btn('close', () => this.toggle(false))),
      h('h4', {}, 'Perf'),
      this.btn(this.fpsEl ? 'hide fps' : 'show fps', () => { this.fps(!this.fpsEl); this.render(); }),
      h('div', { class: 'perf' }),
      g ? this.gameSection(g) : h('p', {}, 'Start a game to get game, board and assist controls.'),
      h('h4', {}, 'Effects'),
      this.btn('clear pulse', () => app.bg.pulse(1, app.theme.accent2)),
      this.btn('hue kick', () => app.bg.kickHue(1)),
      this.btn('motes', () => app.fx.motes(innerWidth * 0.3, innerHeight * 0.4, innerWidth * 0.4, innerHeight * 0.3, [app.theme.accent, app.theme.accent2, '#fff'], 80)),
      this.btn('burst', () => { for (let i = 0; i < 10; i++) app.fx.cellBurst(innerWidth / 2 + (i - 5) * 24, innerHeight / 2, 24, app.theme.accent, 1.5); }),
      this.btn('ring', () => app.fx.ring(innerWidth / 2, innerHeight / 2, app.theme.accent2, 300)),
      h('h4', {}, 'Audio'),
      h('div', {}, SOUND_NAMES.map((n) => this.btn(n, () => { app.audio.unlock(); app.audio.play(n, { lines: 4, combo: 3, chain: 3, distance: 16 }); }))),
      h('h4', {}, 'Save data'),
      this.btn('log save', () => console.log(JSON.parse(app.save.export()))),
      this.btn('corrupt + reload', () => { localStorage.setItem(SAVE_KEY, '{"v":2,"settings":{"theme":'); location.reload(); }),
      this.btn('garbage types + reload', () => { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, settings: { das: 'fast', theme: 42, keys: { left: 7 } }, records: { marathon: 'no' }, stats: { lines: -5 }, lab: { saved: [{ pieces: 'x' }, null, { name: 'ok', pieces: [{ cells: [[0, 0], [1, 0]] }] }] } })); location.reload(); }),
      this.btn('grant 5000 xp', () => { app.save.bump('xp', 5000); }),
      h('h4', {}, 'Lab stress'),
      this.btn('validate 40 random concepts', () => {
        let ok = 0; const t = performance.now(); const errs = {};
        for (let i = 0; i < 40; i++) { const v = validateConcept(generateConcept((Math.random() * 1e9) >>> 0)); if (v.ok) ok++; else errs[v.errors[0]] = (errs[v.errors[0]] || 0) + 1; }
        this.note(`${ok}/40 valid in ${(performance.now() - t).toFixed(0)} ms. ${Object.entries(errs).slice(0, 3).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
      }),
      this.btn('malformed concept', () => { const v = validateConcept({ name: 'bad', pieces: [{ cells: [[0, 0], [5, 5]] }, { cells: 'no' }, null], board: { width: 'x' } }); this.note(`rejected safely: ${v.errors.slice(0, 3).join(' | ')}`); }),
      this.noteEl = h('div', { style: { marginTop: '6px', color: '#9fe8ff' } }),
      this.live);
    this.el = panel;
    document.body.append(panel);
    this.refreshLive();
  }

  note(t) { if (this.noteEl) this.noteEl.textContent = t; }

  gameSection(g) {
    const s = this.session;
    const rules = g.rules;
    const board = g.board;
    const fillRows = (rows, hole) => {
      for (let k = 0; k < rows; k++) {
        const r = board.h - 1 - k;
        for (let c = 0; c < board.w; c++) board.set(c, r, c === hole ? 0 : makeCell(GARBAGE_COLOR));
      }
    };
    return h('div', {},
      h('h4', {}, 'Game'),
      this.btn(this.autoplay ? 'autoplay: ON' : 'autoplay: off', () => { this.autoplay = !this.autoplay; this.render(); }),
      this.btn(this.frozen ? 'gravity: FROZEN' : 'gravity: normal', () => { this.frozen = !this.frozen; if (this.frozen) g.msPerRow = () => 1e9; else delete g.msPerRow; this.render(); }),
      this.btn('level −', () => { g.stats.level = Math.max(1, g.stats.level - 1); }),
      this.btn('level +', () => { g.stats.level = Math.min(rules.maxLevel, g.stats.level + 1); g.emit({ type: 'levelup', level: g.stats.level }); }),
      this.btn('+10k score', () => { g.stats.score += 10000; }),
      this.btn('top out', () => g.gameOver('debug')),
      h('h4', {}, 'Force next piece'),
      h('div', {}, rules.pieces.map((p, i) => this.btn(p.name, () => g.forceNext([i])))),
      h('h4', {}, 'Board'),
      this.btn('clear', () => board.clear()),
      this.btn('garbage row', () => board.pushGarbage([Math.floor(Math.random() * board.w)])),
      this.btn('I-well (8 rows)', () => { board.clear(); fillRows(8, board.w - 1); }),
      rules.pieces.some((p) => p.tspin) ? this.btn('T-spin double setup', () => {
        board.clear();
        fillRows(2, 3);
        const r = board.h - 3;
        for (let c = 0; c < board.w; c++) if (c !== 2 && c !== 3 && c !== 4) board.set(c, r, makeCell(GARBAGE_COLOR));
        board.set(2, r, makeCell(GARBAGE_COLOR));
        board.set(3, board.h - 2, 0); board.set(4, board.h - 2, makeCell(GARBAGE_COLOR));
        const ti = rules.pieces.findIndex((p) => p.tspin);
        g.forceNext([ti]);
      }) : null,
      this.btn('danger stack', () => { board.clear(); for (let k = 0; k < board.visible - 4; k++) { const r = board.h - 1 - k; for (let c = 0; c < board.w; c++) if ((c + k) % 5) board.set(c, r, makeCell(GARBAGE_COLOR)); } }),
      s.assist ? h('div', {},
        h('h4', {}, 'Hidden assist'),
        this.btn(s.assist.enabled ? 'assist: ON' : 'assist: OFF', () => { s.assist.enabled = !s.assist.enabled; this.assistEnabled = s.assist.enabled; this.render(); }),
        h('label', {}, 'strength ',
          h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.assist.strength), oninput: (e) => { s.assist.setStrength(Number(e.target.value)); this.assistStrength = s.assist.strength; } }))) : null);
  }

  refreshLive() {
    if (!this.open || !this.el) return;
    const perf = this.el.querySelector('.perf');
    const avg = this.frames.reduce((a, b) => a + b, 0) / Math.max(1, this.frames.length);
    if (perf) perf.textContent = `frame ${(avg * 1000).toFixed(1)} ms · particles ${this.app.fx.count} · sprites ${this.app.painter.cache.size} · screen ${this.app.screenName}`;
    const live = this.live;
    clear(live);
    const s = this.session;
    if (!s?.game) return;
    const g = s.game;
    live.append(h('h4', {}, 'State'),
      h('div', {}, `phase ${g.phase} · level ${g.stats.level} · danger ${g.danger.toFixed(2)} · ms/row ${g.msPerRow().toFixed(1)} · lock ${g.lockTimer.toFixed(0)}/${g.rules.lockDelay} resets ${g.lockResets}`));
    const a = s.assist;
    if (!a) return;
    const d = a.lastDecision;
    live.append(h('div', {}, `skill ${a.skill.toFixed(2)} (${a.skillSamples} samples)`));
    if (!d) return;
    live.append(h('div', {}, `danger ${d.danger.toFixed(2)} · mastery ${d.mastery.toFixed(2)} · beta ${d.beta.toFixed(2)} · picked ${g.rules.pieces[d.pick]?.name} (p=${d.probs[d.pick].toFixed(2)})${d.failed ? ' · projection topped out' : ''}`),
      h('table', {}, h('tbody', {}, g.rules.pieces.map((p, i) => h('tr', {},
        h('td', {}, p.name), h('td', {}, `z ${d.z[i].toFixed(2)}`), h('td', {}, `${(d.probs[i] * 100).toFixed(0)}%`),
        h('td', { style: { width: '45%' } }, h('div', { class: 'pbar', style: { width: `${Math.min(100, (d.probs[i] / 0.42) * 100)}%`, background: i === d.pick ? '#ff4fd8' : undefined } })))))),
      h('div', {}, `recent: ${a.log.slice(-16).map((l) => g.rules.pieces[l.pick]?.name).join(' ')}`),
      h('div', {}, `counts: ${g.rules.pieces.map((p, i) => `${p.name}${a.counts[i]}`).join(' ')}`));
  }
}
