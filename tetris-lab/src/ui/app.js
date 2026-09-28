/* Application shell: shared services, settings application and the screen
   router. Screens are modules exporting mount(root, params, app) that return
   { unmount?, frame?(dt), key?(e) -> handled, resize? }. */

import { SaveStore } from '../save.js';
import { BlockPainter } from '../render/blocks.js';
import { Background } from '../render/background.js';
import { FX } from '../render/fx.js';
import { theme as getTheme } from '../render/theme.js';
import * as audio from '../audio/audio.js';
import { h, toast } from './dom.js';

export const app = {
  save: new SaveStore(),
  painter: new BlockPainter(),
  audio,
  bg: null,
  fx: null,
  root: null,
  screen: null,
  screenName: '',
  params: null,
  history: [],
  screens: {},
  reduced: false,
  touchDevice: false,
  theme: null,
  debug: null,
  frameHooks: new Set(),

  init() {
    this.root = document.getElementById('app');
    this.bg = new Background(document.getElementById('bg'));
    this.fx = new FX(document.getElementById('fx'));
    this.touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.save.load();
    if (this.save.loadError) setTimeout(() => toast('Save data reset', this.save.loadError, { iconName: 'save', error: true, ms: 6000 }), 800);
    if (this.save.readOnlyFuture) setTimeout(() => toast('Newer save detected', 'Progress from this session will not overwrite it.', { iconName: 'save', error: true, ms: 6000 }), 900);
    this.save.refreshChallenges();
    this.applySettings();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.applySettings());
    this.save.onChange(() => {});
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    // Button sounds, app-wide, by delegation.
    document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    document.addEventListener('keydown', () => audio.unlock(), { capture: true });
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('button');
      if (!b || b.closest('.touch') || b.classList.contains('silent')) return;
      audio.play(b.dataset.sfx || (b.classList.contains('back') ? 'back' : 'select'));
    }, true);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest?.('.btn, .card, .tab');
      if (b && !b.contains(e.relatedTarget)) audio.play('hover');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.screen?.blur?.(); audio.suspend(); this.save.flush(); }
      else audio.resume();
    });
    addEventListener('blur', () => this.screen?.blur?.());
    addEventListener('pagehide', () => this.save.flush());
    document.addEventListener('keydown', (e) => this.onKey(e));
  },

  get settings() { return this.save.settings; },

  applySettings() {
    const s = this.settings;
    const sysReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.reduced = s.motion === 'reduced' || (s.motion === 'auto' && sysReduced);
    const th = getTheme(this.save.isUnlocked('theme', s.theme) ? s.theme : 'prism');
    this.theme = th;
    const root = document.documentElement;
    root.style.setProperty('--accent', th.accent);
    root.style.setProperty('--accent2', th.accent2);
    root.style.setProperty('--text', th.text);
    root.style.setProperty('--ui-scale', String(s.uiScale));
    document.body.classList.toggle('reduced', this.reduced);
    document.body.classList.toggle('hc', s.highContrast);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.bg[0]);
    const style = this.save.isUnlocked('style', s.style) ? s.style : 'gem';
    this.painter.configure({ style, theme: th, highContrast: s.highContrast, glyphs: s.glyphs });
    this.bg.setTheme(th);
    this.bg.setReduced(this.reduced);
    this.fx.scale = this.reduced ? 0.35 : 1;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
    this.screen?.settingsChanged?.();
  },

  resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = window.innerWidth, h2 = window.innerHeight;
    this.bg.resize(w, h2, dpr);
    this.fx.resize(w, h2, Math.min(2, dpr));
    this.screen?.resize?.();
  },

  register(name, mod) { this.screens[name] = mod; },

  go(name, params = {}, { replace = false, noHistory = false } = {}) {
    const mod = this.screens[name];
    if (!mod) { console.error('unknown screen', name); return; }
    if (this.screen) {
      try { this.screen.unmount?.(); } catch (e) { console.error(e); }
      if (!replace && !noHistory && this.screenName) this.history.push({ name: this.screenName, params: this.params });
    }
    if (this.history.length > 20) this.history.shift();
    this.fx.clear();
    this.root.innerHTML = '';
    const el = h('div', { class: 'screen', 'data-screen': name });
    this.root.append(el);
    this.screenName = name;
    this.params = params;
    try {
      this.screen = mod.mount(el, params, this) || {};
    } catch (e) {
      console.error(e);
      this.screen = {};
      this.fail(e, name);
    }
    window.scrollTo(0, 0);
    this.debug?.onScreen?.(name);
  },

  back() {
    const prev = this.history.pop();
    if (prev) this.go(prev.name, prev.params, { noHistory: true });
    else this.go('title', {}, { noHistory: true });
  },

  home() {
    this.history = [];
    this.go('title', {}, { noHistory: true });
  },

  onKey(e) {
    if (e.target.matches?.('input, textarea, select') && e.key !== 'Escape') return;
    if (document.getElementById('modal-root').children.length) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); this.debug?.toggle(); return; }
    if (this.screen?.key?.(e)) return;
    if (e.key === 'Escape' && this.screenName !== 'title') { e.preventDefault(); this.back(); }
  },

  frame(dt) {
    const s = this.screen;
    try {
      s?.frame?.(dt);
    } catch (e) {
      console.error(e);
      this.fail(e, this.screenName);
    }
    for (const f of this.frameHooks) f(dt);
    const st = s?.bgState?.() || {};
    this.bg.update(dt, st);
    this.bg.draw();
    this.fx.update(dt);
    this.fx.draw();
  },

  /** Recover from an unexpected error without showing a stack trace. */
  fail(err, where) {
    console.error(`[prismfall] ${where}:`, err);
    if (this._failing) return;
    this._failing = true;
    toast('Something went wrong', 'Returned to the menu. Your progress is saved.', { iconName: 'x', error: true, ms: 5000 });
    setTimeout(() => {
      this._failing = false;
      this.history = [];
      if (this.screenName !== 'title') this.go('title', {}, { noHistory: true });
    }, 50);
  }
};
