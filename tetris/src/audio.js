/* All audio is synthesised with Web Audio: no sample files to download.

   Music is "Korobeiniki", the 19th-century Russian folk song (public domain)
   that became the Tetris theme, arranged here for lead, bass, arpeggio and
   drums. Tempo follows the level and gets a push when the stack is high.
   The music bus runs through a low-pass filter that closes on the title
   screen and while paused, so the menus sound "behind glass". */

const NOTE = (() => {
  const names = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  return (n) => {
    const m = /^([A-G]#?)(\d)$/.exec(n);
    const midi = names[m[1]] + (Number(m[2]) + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  };
})();

/* Melody in [note, eighths]; null is a rest. */
const PART_A = [
  ['E5', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['C5', 1], ['B4', 1],
  ['A4', 2], ['A4', 1], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
  ['B4', 3], ['C5', 1], ['D5', 2], ['E5', 2],
  ['C5', 2], ['A4', 2], ['A4', 4],
  [null, 1], ['D5', 2], ['F5', 1], ['A5', 2], ['G5', 1], ['F5', 1],
  ['E5', 3], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
  ['B4', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['E5', 2],
  ['C5', 2], ['A4', 2], ['A4', 2], [null, 2]
];
const PART_B = [
  ['E5', 4], ['C5', 4],
  ['D5', 4], ['B4', 4],
  ['C5', 4], ['A4', 4],
  ['G#4', 4], ['B4', 4],
  ['E5', 4], ['C5', 4],
  ['D5', 4], ['B4', 4],
  ['C5', 2], ['E5', 2], ['A5', 4],
  ['G#5', 8]
];
/* One chord per bar: [bass root, arpeggio tones]. */
const CH = {
  E: ['E2', ['E4', 'G#4', 'B4', 'E5']],
  Am: ['A2', ['A4', 'C5', 'E5', 'A5']],
  Dm: ['D2', ['D4', 'F4', 'A4', 'D5']],
  C: ['C3', ['C4', 'E4', 'G4', 'C5']]
};
const CHORDS_A = ['E', 'Am', 'E', 'Am', 'Dm', 'C', 'E', 'Am'];
const CHORDS_B = ['Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E'];

function buildSong() {
  const melody = new Map();   // step (in eighths) -> { freq, len }
  const bars = [];     // chord name per bar
  let step = 0;
  const add = (part, chords) => {
    for (const [n, len] of part) {
      if (n) melody.set(step, { freq: NOTE(n), len });
      step += len;
    }
    bars.push(...chords);
  };
  add(PART_A, CHORDS_A);
  add(PART_A, CHORDS_A);
  add(PART_B, CHORDS_B);
  return { melody, bars, length: step };
}

const SONG = buildSong();

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.level = 1;
    this.danger = false;
    this.playing = false;
    this.muffled = true;
  }

  /* Must be called from a user gesture (autoplay policy). Idempotent. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = this.muffled ? 700 : 18000;
    this.musicFilter.Q.value = 0.8;
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol;
    this.music.connect(this.musicFilter).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    const rv = ctx.createGain();
    rv.gain.value = 0.28;
    this.reverb.connect(rv).connect(this.master);

    this.delay = ctx.createDelay(1);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.28;
    const dWet = ctx.createGain();
    dWet.gain.value = 0.22;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(dWet).connect(this.music);

    this.scheduler = null;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
  }

  setMuffled(on) {
    this.muffled = on;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, on ? 0.08 : 0.25);
  }

  setLevel(level) { this.level = level; }
  setDanger(on) { this.danger = on; }

  get bpm() {
    const base = Math.min(140 + (this.level - 1) * 5, 205);
    return base * (this.danger ? 1.08 : 1);
  }

  /* ---------- music ---------- */

  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    const tick = () => {
      if (!this.playing) return;
      const ahead = this.ctx.currentTime + 0.14;
      while (this.nextTime < ahead) {
        this.playStep(this.step % SONG.length, this.nextTime);
        this.nextTime += 30 / this.bpm;            // one eighth note
        this.step++;
      }
    };
    tick();
    this.scheduler = setInterval(tick, 25);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.scheduler);
    this.scheduler = null;
  }

  restartMusic() {
    this.stopMusic();
    this.startMusic();
  }

  playStep(step, t) {
    const eighth = 30 / this.bpm;
    const bar = Math.floor(step / 8);
    const inBar = step % 8;
    const [root, arp] = CH[SONG.bars[bar]];

    const n = SONG.melody.get(step);
    if (n) this.lead(n.freq, t, n.len * eighth);

    // Bass: octave-bouncing eighths, the signature of the arrangement.
    const bassF = NOTE(root) * (inBar % 2 ? 2 : 1);
    this.bass(bassF, t, eighth * 0.9);

    // Arpeggio in sixteenths, quietly underneath.
    for (let s = 0; s < 2; s++) {
      const f = NOTE(arp[(inBar * 2 + s) % arp.length]) * 2;
      this.arp(f, t + s * eighth / 2, eighth / 2);
    }

    // Drums.
    if (inBar === 0 || inBar === 4) this.kick(t, 0.8);
    if (inBar === 2 || inBar === 6) this.snare(t, 0.35);
    this.hat(t, inBar % 2 ? 0.1 : 0.05);
  }

  env(g, t, peak, a, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * 0.55, t + a, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, rel);
  }

  lead(freq, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + Math.min(dur, 0.3));
    f.Q.value = 3;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'square';
    o2.type = 'sawtooth';
    o1.frequency.value = freq;
    o2.frequency.value = freq;
    o2.detune.value = 9;
    const vib = ctx.createOscillator(), vibG = ctx.createGain();
    vib.frequency.value = 5.5;
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(freq * 0.006, t + Math.max(0.2, dur));
    vib.connect(vibG);
    vibG.connect(o1.frequency);
    vibG.connect(o2.frequency);
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.music);
    g.connect(this.delay);
    g.connect(this.reverb);
    this.env(g, t, 0.075, 0.008, dur * 0.92, 0.05);
    const end = t + dur + 0.4;
    for (const o of [o1, o2, vib]) { o.start(t); o.stop(end); }
  }

  bass(freq, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    f.Q.value = 6;
    o.connect(f).connect(g).connect(this.music);
    this.env(g, t, 0.16, 0.005, dur * 0.7, 0.03);
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  arp(freq, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(this.music);
    g.connect(this.reverb);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
    o.start(t);
    o.stop(t + dur * 2);
  }

  noiseHit(bus, t, { gain, dur, type, freq, q = 1 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  kick(t, v, bus = this.music) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.32);
  }

  snare(t, v) {
    this.noiseHit(this.music, t, { gain: v * 0.35, dur: 0.14, type: 'bandpass', freq: 1900, q: 0.7 });
    this.noiseHit(this.reverb, t, { gain: v * 0.12, dur: 0.1, type: 'bandpass', freq: 2500, q: 0.7 });
  }

  hat(t, v) {
    this.noiseHit(this.music, t, { gain: v * 0.35, dur: 0.035, type: 'highpass', freq: 8000 });
  }

  /* ---------- sound effects ---------- */

  tone(freq, dur, { type = 'triangle', gain = 0.15, to = null, delay = 0, rev = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfx);
    if (rev) {
      const r = ctx.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, arg) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move': this.tone(1320, 0.03, { type: 'square', gain: 0.025 }); break;
      case 'rotate': this.tone(700, 0.06, { type: 'triangle', gain: 0.07, to: 1100 }); break;
      case 'kick': this.tone(500, 0.1, { type: 'square', gain: 0.04, to: 1400 }); break;
      case 'softDrop': this.tone(220, 0.025, { type: 'triangle', gain: 0.03 }); break;
      case 'hold':
        this.noiseHit(this.sfx, t, { gain: 0.18, dur: 0.18, type: 'bandpass', freq: 1200, q: 2 });
        this.tone(440, 0.14, { type: 'sine', gain: 0.1, to: 880 });
        break;
      case 'lock': this.tone(180, 0.07, { type: 'triangle', gain: 0.14, to: 90 }); break;
      case 'hardDrop': {
        const v = 0.5 + Math.min(arg || 0, 18) / 36;
        this.kick(t, 1.3 * v, this.sfx);
        this.noiseHit(this.sfx, t, { gain: 0.3 * v, dur: 0.16, type: 'lowpass', freq: 1400 });
        break;
      }
      case 'clear': {
        const n = arg.lines;
        const base = [0, 523.25, 587.33, 659.25, 783.99][n] || 523.25;
        const steps = [1, 1.25, 1.5, 2, 2.5, 3];
        for (let i = 0; i < 2 + n; i++) {
          this.tone(base * steps[i], 0.22, { type: 'square', gain: 0.05, delay: i * 0.045, rev: 0.6 });
        }
        this.noiseHit(this.sfx, t, { gain: 0.12, dur: 0.35, type: 'highpass', freq: 3000 });
        if (arg.combo > 0) this.tone(880 * Math.pow(1.06, Math.min(arg.combo, 12)), 0.12, { type: 'sine', gain: 0.08, delay: 0.1 });
        break;
      }
      case 'tetris': {
        // Big major chord + riser + boom.
        [261.63, 329.63, 392.0, 523.25, 659.25].forEach((f, i) =>
          this.tone(f, 1.1, { type: 'sawtooth', gain: 0.045, delay: 0.02 * i, rev: 0.9 }));
        this.tone(120, 0.6, { type: 'sine', gain: 0.3, to: 40 });
        this.noiseHit(this.sfx, t, { gain: 0.35, dur: 0.8, type: 'lowpass', freq: 900 });
        this.noiseHit(this.reverb, t, { gain: 0.25, dur: 1.2, type: 'highpass', freq: 2000 });
        break;
      }
      case 'tspin':
        this.tone(330, 0.35, { type: 'sawtooth', gain: 0.06, to: 1320, rev: 0.8 });
        this.tone(660, 0.35, { type: 'square', gain: 0.03, to: 2640, delay: 0.05, rev: 0.6 });
        break;
      case 'perfect':
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
          this.tone(f, 0.5, { type: 'triangle', gain: 0.08, delay: i * 0.07, rev: 1 }));
        break;
      case 'levelUp':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(f, 0.2, { type: 'square', gain: 0.05, delay: i * 0.06, rev: 0.7 }));
        break;
      case 'count': this.tone(660, 0.14, { type: 'square', gain: 0.08, rev: 0.4 }); break;
      case 'go': this.tone(1320, 0.4, { type: 'square', gain: 0.08, rev: 0.6 }); break;
      case 'over':
        [392, 349.23, 311.13, 261.63, 196].forEach((f, i) =>
          this.tone(f, 0.45, { type: 'sawtooth', gain: 0.06, delay: i * 0.18, rev: 0.8 }));
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) =>
          this.tone(f, 0.3, { type: 'square', gain: 0.06, delay: i * 0.1, rev: 0.8 }));
        break;
      case 'ui': this.tone(900, 0.04, { type: 'triangle', gain: 0.05 }); break;
      case 'uiSelect': this.tone(660, 0.1, { type: 'square', gain: 0.05, to: 1320 }); break;
      case 'pause': this.tone(600, 0.12, { type: 'triangle', gain: 0.08, to: 300 }); break;
    }
  }
}
