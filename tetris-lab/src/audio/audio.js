/* Audio engine.

   Everything is synthesised with Web Audio: no downloads, instant first
   sound, fully offline. All playback goes through play(name, params); game
   code never touches oscillators.

   Graph:  voices -> sfx bus  \
                              -> master -> compressor -> destination
           music  -> music bus /

   Music is generative: a lookahead scheduler writes a chord progression with
   up to six layers (pad, bass, kick, hats, arpeggio, lead). Layers enter as
   `intensity` rises (level, combo, danger), so the soundtrack tracks the game
   instead of looping a fixed track. */

let ctx = null;
let master = null, sfxBus = null, musicBus = null, comp = null, musicFilter = null;
let noiseBuf = null;
const vol = { master: 0.9, music: 0.55, sfx: 0.8, muted: false };

const state = {
  mode: null,          // 'menu' | 'game' | 'lab' | null
  intensity: 0,
  danger: 0,
  tempo: 112,
  step: 0,
  nextTime: 0,
  timer: null,
  chordIdx: 0,
  lastPlay: new Map()
};

const now = () => (ctx ? ctx.currentTime : 0);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function isReady() { return !!ctx && ctx.state === 'running'; }

/** Create / resume the context. Must be called from a user gesture. */
export function unlock() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 5200;
    musicBus.connect(musicFilter).connect(comp);
    sfxBus.connect(comp);
    comp.connect(master).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (state.mode && !state.timer) startScheduler();
  return true;
}

export function setVolumes(v) {
  Object.assign(vol, v);
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  const t = now();
  master.gain.setTargetAtTime(vol.muted ? 0 : vol.master, t, 0.02);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(vol.music * 0.7, t, 0.05);
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

/* ----------------------------------------------------------- voices -- */

function env(g, t, a, d, peak, sustain = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}

function tone({ freq, type = 'sine', t = 0, at = null, a = 0.004, d = 0.18, gain = 0.2, bus = sfxBus, slide = null, slideT = 0.1, detune = 0, filter = null, q = 1, pan = 0 }) {
  if (!ctx) return;
  const st = at != null ? Math.max(now(), at) : now() + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, st);
  if (detune) o.detune.setValueAtTime(detune, st);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), st + slideT);
  env(g, st, a, d, gain);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = q;
    node.connect(f); node = f;
  }
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p); node = p;
  }
  node.connect(g).connect(bus);
  o.start(st);
  o.stop(st + a + d + 0.05);
}

function noise({ t = 0, at = null, d = 0.12, gain = 0.2, freq = 2000, q = 1, type = 'bandpass', sweep = null, bus = sfxBus, a = 0.002 }) {
  if (!ctx) return;
  const st = at != null ? Math.max(now(), at) : now() + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, st); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, st + d);
  const g = ctx.createGain();
  env(g, st, a, d, gain);
  src.connect(f).connect(g).connect(bus);
  src.start(st, Math.random() * 0.5);
  src.stop(st + a + d + 0.05);
}

/* ------------------------------------------------------------- sfx -- */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/* Minimum spacing per sound so auto-repeat does not machine-gun. */
const MIN_GAP = { move: 0.028, softdrop: 0.045, rotate: 0.03, blocked: 0.09, hover: 0.05 };

const SFX = {
  hover: () => tone({ freq: 1320, type: 'sine', d: 0.04, gain: 0.03 }),
  select: () => { tone({ freq: 660, type: 'triangle', d: 0.08, gain: 0.09 }); tone({ freq: 990, type: 'triangle', t: 0.05, d: 0.12, gain: 0.08 }); },
  back: () => { tone({ freq: 520, type: 'triangle', d: 0.07, gain: 0.08 }); tone({ freq: 390, type: 'triangle', t: 0.05, d: 0.1, gain: 0.07 }); },
  toggle: () => tone({ freq: 880, type: 'square', d: 0.04, gain: 0.035, filter: 3000 }),
  move: () => tone({ freq: 240, type: 'triangle', d: 0.035, gain: 0.07, filter: 1800 }),
  rotate: (p) => tone({ freq: p.kicked ? 560 : 470, type: 'triangle', d: 0.06, gain: 0.08, slide: p.kicked ? 700 : 520, slideT: 0.05 }),
  blocked: () => tone({ freq: 140, type: 'square', d: 0.04, gain: 0.03, filter: 900 }),
  softdrop: () => tone({ freq: 180, type: 'sine', d: 0.03, gain: 0.04 }),
  harddrop: (p) => {
    const k = Math.min(1, 0.4 + (p.distance || 0) / 18);
    tone({ freq: 150, type: 'sine', d: 0.18, gain: 0.35 * k, slide: 48, slideT: 0.16 });
    noise({ d: 0.09, gain: 0.16 * k, freq: 900, sweep: 200, type: 'lowpass' });
  },
  lock: () => { tone({ freq: 320, type: 'triangle', d: 0.05, gain: 0.07, filter: 2500 }); noise({ d: 0.03, gain: 0.04, freq: 3000 }); },
  hold: () => { noise({ d: 0.14, gain: 0.07, freq: 600, sweep: 3200, type: 'bandpass', q: 2 }); tone({ freq: 330, type: 'sine', d: 0.12, gain: 0.05, slide: 660 }); },
  clear: (p) => {
    const lines = Math.max(1, Math.min(6, p.lines || p.groups || 1));
    const base = 72 + (p.combo > 0 ? Math.min(12, p.combo) : 0);
    const n = 2 + lines;
    for (let i = 0; i < n; i++) {
      tone({ freq: midi(base + PENTA[i]), type: 'triangle', t: i * 0.045, d: 0.28, gain: 0.1 });
      tone({ freq: midi(base + PENTA[i] + 12), type: 'sine', t: i * 0.045, d: 0.2, gain: 0.04 });
    }
    noise({ d: 0.25 + lines * 0.05, gain: 0.05 + lines * 0.02, freq: 6000, sweep: 1200, type: 'highpass' });
    if (lines >= 4) {
      tone({ freq: midi(48), type: 'sawtooth', d: 0.6, gain: 0.12, filter: 1200 });
      tone({ freq: midi(55), type: 'sawtooth', d: 0.6, gain: 0.08, filter: 1200, t: 0.02 });
      for (let i = 0; i < 6; i++) tone({ freq: midi(84 + PENTA[i]), type: 'sine', t: 0.25 + i * 0.05, d: 0.25, gain: 0.05 });
    }
  },
  tspin: () => { tone({ freq: 300, type: 'sawtooth', d: 0.3, gain: 0.08, slide: 1200, slideT: 0.25, filter: 2400 }); },
  combo: (p) => tone({ freq: midi(76 + Math.min(16, p.combo || 1)), type: 'square', d: 0.1, gain: 0.05, filter: 3000 }),
  chain: (p) => { const c = Math.min(8, p.chain || 2); for (let i = 0; i < 3; i++) tone({ freq: midi(70 + c * 2 + i * 4), type: 'triangle', t: i * 0.05, d: 0.2, gain: 0.09 }); },
  b2b: () => { for (let i = 0; i < 4; i++) tone({ freq: midi(88 + i * 3), type: 'sine', t: i * 0.035, d: 0.15, gain: 0.05 }); },
  perfect: () => {
    const chord = [60, 64, 67, 72, 76, 79, 84];
    chord.forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: i * 0.06, d: 0.9, gain: 0.08 }));
    noise({ t: 0.1, d: 1.2, gain: 0.05, freq: 8000, type: 'highpass' });
  },
  bomb: () => {
    tone({ freq: 90, type: 'sine', d: 0.5, gain: 0.4, slide: 30, slideT: 0.45 });
    noise({ d: 0.6, gain: 0.28, freq: 1800, sweep: 80, type: 'lowpass' });
  },
  garbage: () => { tone({ freq: 70, type: 'sawtooth', d: 0.25, gain: 0.1, filter: 400 }); noise({ d: 0.2, gain: 0.06, freq: 300, type: 'lowpass' }); },
  levelup: () => {
    [0, 4, 7, 12, 16].forEach((n, i) => tone({ freq: midi(67 + n), type: 'square', t: i * 0.07, d: 0.18, gain: 0.05, filter: 3500 }));
    noise({ t: 0.3, d: 0.5, gain: 0.04, freq: 7000, type: 'highpass' });
  },
  start: () => { [48, 55, 60, 67, 72].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: i * 0.08, d: 0.35, gain: 0.08 })); },
  countdown: (p) => tone({ freq: p.go ? 880 : 440, type: 'square', d: p.go ? 0.3 : 0.12, gain: 0.07, filter: 2500 }),
  gameover: () => {
    [67, 63, 60, 55, 48].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: i * 0.14, d: 0.5, gain: 0.09, filter: 1600 }));
    tone({ freq: midi(36), type: 'sawtooth', t: 0.6, d: 1.4, gain: 0.08, filter: 500 });
  },
  complete: () => { [60, 64, 67, 72, 67, 72, 76, 84].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: i * 0.08, d: 0.4, gain: 0.08 })); },
  achievement: () => { [76, 83, 88, 95].forEach((n, i) => tone({ freq: midi(n), type: 'sine', t: i * 0.07, d: 0.5, gain: 0.07 })); },
  danger: () => { tone({ freq: 55, type: 'sine', d: 0.18, gain: 0.25 }); tone({ freq: 55, type: 'sine', t: 0.22, d: 0.18, gain: 0.18 }); },
  labTick: () => tone({ freq: 1600 + Math.random() * 800, type: 'sine', d: 0.03, gain: 0.02 }),
  labAccept: () => { [72, 79, 84].forEach((n, i) => tone({ freq: midi(n), type: 'triangle', t: i * 0.06, d: 0.25, gain: 0.07 })); },
  labReject: () => { tone({ freq: 220, type: 'square', d: 0.12, gain: 0.04, filter: 1000 }); tone({ freq: 180, type: 'square', t: 0.1, d: 0.16, gain: 0.04, filter: 1000 }); }
};

export const SOUND_NAMES = Object.keys(SFX);

export function play(name, params = {}) {
  if (!ctx || vol.muted || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (!fn) return;
  const gap = MIN_GAP[name];
  if (gap) {
    const last = state.lastPlay.get(name) || 0;
    if (now() - last < gap) return;
    state.lastPlay.set(name, now());
  }
  try { fn(params); } catch { /* audio must never break the game */ }
}

/* ----------------------------------------------------------- music -- */

const PROGRESSIONS = {
  menu: { root: 57, chords: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5]], tempo: 100 },   // A minor: i VI III VII (voiced)
  game: { root: 57, chords: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], tempo: 116 },
  lab: { root: 62, chords: [[0, 3, 7, 9], [5, 9, 12], [-2, 2, 5, 9], [3, 7, 10]], tempo: 104 }  // D dorian colour
};

export function setMusic(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  state.step = 0;
  state.chordIdx = 0;
  if (!ctx) return;
  if (mode) startScheduler(); else stopScheduler();
}

export function setIntensity(intensity, danger = 0, level = 1) {
  state.intensity = Math.max(0, Math.min(1, intensity));
  state.danger = Math.max(0, Math.min(1, danger));
  const prog = PROGRESSIONS[state.mode] || PROGRESSIONS.menu;
  state.tempo = prog.tempo + (state.mode === 'game' ? Math.min(40, (level - 1) * 3) : 0) + state.danger * 10;
  if (musicFilter && ctx) musicFilter.frequency.setTargetAtTime(1800 + state.intensity * 5000 + state.danger * 2000, now(), 0.3);
}

function startScheduler() {
  if (state.timer || !ctx) return;
  state.nextTime = now() + 0.08;
  state.timer = setInterval(schedule, 25);
}

function stopScheduler() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function schedule() {
  if (!ctx || ctx.state !== 'running' || !state.mode) return;
  const prog = PROGRESSIONS[state.mode] || PROGRESSIONS.menu;
  const stepDur = 60 / state.tempo / 4;
  while (state.nextTime < now() + 0.12) {
    playStep(state.step, state.nextTime, prog, stepDur);
    state.nextTime += stepDur;
    state.step++;
  }
}

function playStep(step, t, prog, dur) {
  const I = state.intensity, D = state.danger;
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const chord = prog.chords[bar % prog.chords.length];
  const root = prog.root;
  const bus = musicBus;
  const game = state.mode === 'game';

  if (s === 0) {
    // Pad: the chord, softly, one bar long.
    for (const n of chord) {
      tone({ freq: midi(root + n), type: 'sawtooth', at: t, a: 0.25, d: dur * 16, gain: 0.018, bus, filter: 900 + I * 800, detune: 6 });
      tone({ freq: midi(root + n), type: 'triangle', at: t, a: 0.3, d: dur * 16, gain: 0.02, bus, detune: -6 });
    }
  }
  // Bass
  if ((game || I > 0.2) && s % 4 === 0) {
    const n = root - 24 + chord[0] + (s === 8 ? 12 : 0);
    tone({ freq: midi(n), type: 'square', at: t, d: dur * 3, gain: 0.05 + I * 0.02, bus, filter: 420 + I * 300 });
  }
  // Kick
  if ((game ? I > 0.08 : I > 0.4) && (s === 0 || s === 8 || (I > 0.6 && s === 10))) {
    tone({ freq: 120, type: 'sine', at: t, d: 0.16, gain: 0.16, slide: 42, slideT: 0.12, bus });
  }
  // Snare
  if (I > 0.45 && (s === 4 || s === 12)) noise({ at: t, d: 0.12, gain: 0.05, freq: 1800, q: 0.8, bus });
  // Hats
  if (I > 0.18 || state.mode === 'menu') {
    const every = D > 0.3 || I > 0.75 ? 1 : 2;
    if (s % every === 0) noise({ at: t, d: 0.03, gain: (s % 4 === 2 ? 0.022 : 0.012) * (state.mode === 'menu' ? 0.6 : 1), freq: 9000, type: 'highpass', bus });
  }
  // Arpeggio
  if (I > 0.3 || state.mode !== 'game') {
    const order = [0, 1, 2, 1, 2, 0, 2, 1];
    const n = chord[order[s % order.length] % chord.length] + 12 + (s >= 8 ? 12 : 0);
    if (state.mode === 'game' || s % 2 === 0) {
      tone({ freq: midi(root + n), type: state.mode === 'lab' ? 'sine' : 'triangle', at: t, d: dur * 1.5, gain: state.mode === 'game' ? 0.03 : 0.022, bus });
    }
  }
  // Lead motif
  if (I > 0.65 && bar % 2 === 1 && s % 4 === 0) {
    const motif = [7, 5, 3, 0];
    tone({ freq: midi(root + 12 + motif[(s / 4) | 0] + chord[0]), type: 'square', at: t, d: dur * 3.5, gain: 0.025, bus, filter: 2600 });
  }
  // Danger heartbeat
  if (D > 0.5 && (s === 0 || s === 3)) tone({ freq: 50, type: 'sine', at: t, d: 0.2, gain: 0.12 * D, bus });
}
