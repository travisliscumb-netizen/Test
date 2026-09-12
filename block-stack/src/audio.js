/* Synthesised audio. No asset downloads, so the game is fully playable offline
   and the first tap never waits on a network fetch. */

let ctx = null;
let master = null, sfxBus = null, musicBus = null, comp = null;
let soundOn = true, musicOn = true;
let musicTimer = null, musicStep = 0, nextNoteAt = 0, musicCfg = null;

const NOW = () => (ctx ? ctx.currentTime : 0);

export function init(settings) {
  soundOn = settings.sound !== false;
  musicOn = settings.music !== false;
}

/** Must be called from a user gesture. Safe to call repeatedly. */
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = 0.9;
    sfxBus = ctx.createGain(); sfxBus.gain.value = soundOn ? 1 : 0;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 1 : 0;
    sfxBus.connect(comp); musicBus.connect(comp);
    comp.connect(master); master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

export function setSound(on) {
  soundOn = on;
  if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, NOW(), 0.02);
}
export function setMusic(on) {
  musicOn = on;
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.85 : 0, NOW(), 0.05);
  if (!on) stopMusic(); else if (musicCfg) startMusic(musicCfg);
}
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

/* ------------------------------------------------------------- helpers -- */
function env(node, t, a, d, peak) {
  const g = node.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone({ freq, type = 'sine', t = 0, attack = 0.005, decay = 0.2, gain = 0.3,
                bus = 'sfx', detune = 0, slideTo = null, slideTime = 0.12 }) {
  if (!ctx) return;
  const start = NOW() + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (detune) o.detune.setValueAtTime(detune, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + slideTime);
  env(g, start, attack, decay, gain);
  o.connect(g).connect(bus === 'music' ? musicBus : sfxBus);
  o.start(start);
  o.stop(start + attack + decay + 0.05);
}

let noiseBuf = null;
function noise({ t = 0, decay = 0.12, gain = 0.2, freq = 1800, q = 1, type = 'bandpass', sweepTo = null }) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const start = NOW() + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, start); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), start + decay);
  const g = ctx.createGain();
  env(g, start, 0.004, decay, gain);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(start);
  src.stop(start + decay + 0.06);
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const hz = (semi, base = 440) => base * Math.pow(2, semi / 12);

/* ---------------------------------------------------------------- sfx ---- */
export const sfx = {
  place() {
    tone({ freq: 150, type: 'sine', decay: 0.16, gain: 0.34, slideTo: 72, slideTime: 0.12 });
    noise({ decay: 0.07, gain: 0.13, freq: 900, q: 0.7, type: 'lowpass', sweepTo: 260 });
  },
  cut() {
    noise({ decay: 0.16, gain: 0.13, freq: 2600, q: 1.1, sweepTo: 420 });
  },
  fall() {
    tone({ freq: 220, type: 'triangle', decay: 0.42, gain: 0.1, slideTo: 62, slideTime: 0.4 });
  },
  perfect(combo = 1) {
    const step = PENTA[Math.min(PENTA.length - 1, combo - 1)];
    const f = hz(step, 880);
    tone({ freq: f, type: 'sine', attack: 0.002, decay: 0.35, gain: 0.28 });
    tone({ freq: f * 2, type: 'sine', attack: 0.002, decay: 0.20, gain: 0.11 });
    tone({ freq: f * 3.01, type: 'sine', attack: 0.002, decay: 0.11, gain: 0.05 });
    noise({ decay: 0.06, gain: 0.05, freq: 6200, q: 1.6 });
  },
  recover() {
    [0, 4, 7, 12].forEach((s, i) =>
      tone({ freq: hz(s, 523.25), type: 'triangle', t: i * 0.055, decay: 0.3, gain: 0.2 }));
    noise({ t: 0.02, decay: 0.3, gain: 0.05, freq: 3200, q: 0.8, sweepTo: 7000 });
  },
  miss() {
    tone({ freq: 300, type: 'sawtooth', decay: 0.5, gain: 0.2, slideTo: 58, slideTime: 0.45 });
    noise({ decay: 0.35, gain: 0.1, freq: 700, q: 0.6, type: 'lowpass', sweepTo: 120 });
  },
  levelComplete() {
    [0, 4, 7, 12, 16].forEach((s, i) =>
      tone({ freq: hz(s, 523.25), type: 'triangle', t: i * 0.075, decay: 0.34, gain: 0.24 }));
  },
  worldComplete() {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => {
      tone({ freq: hz(s, 523.25), type: 'triangle', t: i * 0.085, decay: 0.5, gain: 0.22 });
      tone({ freq: hz(s - 12, 523.25), type: 'sine', t: i * 0.085, decay: 0.6, gain: 0.12 });
    });
    noise({ t: 0.1, decay: 0.8, gain: 0.05, freq: 2000, q: 0.5, sweepTo: 9000 });
  },
  bossIntro() {
    [0, 0, 3].forEach((s, i) =>
      tone({ freq: hz(s - 24, 523.25), type: 'sawtooth', t: i * 0.19, decay: 0.3, gain: 0.2 }));
    noise({ t: 0.38, decay: 0.6, gain: 0.07, freq: 300, q: 0.7, type: 'lowpass', sweepTo: 2400 });
  },
  bossClear() {
    [0, 4, 7, 11, 14].forEach((s, i) => {
      tone({ freq: hz(s, 440), type: 'sawtooth', t: i * 0.06, decay: 0.7, gain: 0.12 });
      tone({ freq: hz(s, 220), type: 'triangle', t: i * 0.06, decay: 0.8, gain: 0.14 });
    });
  },
  record() {
    [0, 5, 9, 14].forEach((s, i) =>
      tone({ freq: hz(s, 1046), type: 'sine', t: i * 0.05, decay: 0.22, gain: 0.15 }));
  },
  ui() { tone({ freq: 520, type: 'sine', decay: 0.07, gain: 0.12 }); },
  uiBack() { tone({ freq: 320, type: 'sine', decay: 0.08, gain: 0.1 }); }
};

/* -------------------------------------------------------------- music ---- */
const SCALES = {
  major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10], lydian: [0, 2, 4, 6, 9], dorian: [0, 2, 3, 7, 9]
};

/** Idempotent: calling it with the same config while it is already playing is a
    no-op, so menu taps do not restart the loop. */
export function startMusic(cfg) {
  const same = musicCfg && musicTimer &&
    musicCfg.tempo === cfg.tempo && musicCfg.root === cfg.root && musicCfg.scale === cfg.scale;
  musicCfg = cfg;
  if (same) return;
  if (!ctx || !musicOn) return;
  stopMusic();
  musicStep = 0;
  nextNoteAt = NOW() + 0.08;
  musicTimer = setInterval(scheduleMusic, 26);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

function scheduleMusic() {
  if (!ctx || !musicOn || !musicCfg) return;
  const beat = 60 / musicCfg.tempo / 2; // eighth notes
  while (nextNoteAt < NOW() + 0.16) {
    playMusicStep(musicStep, nextNoteAt, beat);
    musicStep++;
    nextNoteAt += beat;
  }
}

function mNote(freq, at, dur, gain, type, filterHz) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = filterHz; f.Q.value = 0.6;
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(at); o.stop(at + dur + 0.05);
}

function playMusicStep(step, at, beat) {
  const s = SCALES[musicCfg.scale || 'major'];
  const root = musicCfg.root || 220;
  const bar = Math.floor(step / 8);
  const pos = step % 8;
  const chord = [0, 5, 3, 4][bar % 4];

  if (pos === 0 || pos === 4) {
    mNote(root / 2 * Math.pow(2, (s[chord % s.length]) / 12), at, beat * 3.2, 0.16, 'triangle', 420);
  }
  if (pos % 2 === 0) {
    const idx = (chord + [0, 2, 4, 2][(pos / 2) % 4]) % s.length;
    const oct = pos === 2 ? 2 : 1;
    mNote(root * oct * Math.pow(2, s[idx] / 12), at, beat * 1.4, 0.055, 'sine', 2200);
  }
  if (pos === 3 || pos === 7) {
    const idx = (chord + 4) % s.length;
    mNote(root * 2 * Math.pow(2, s[idx] / 12), at, beat * 0.9, 0.032, 'triangle', 3200);
  }
}

export function musicConfigForWorld(w) {
  const scales = ['major', 'major', 'lydian', 'dorian', 'minor', 'lydian', 'minor', 'dorian', 'minor', 'lydian'];
  const roots = [196, 208, 220, 175, 165, 233, 147, 156, 185, 262];
  return { tempo: w.tempo, scale: scales[w.id - 1], root: roots[w.id - 1] };
}
