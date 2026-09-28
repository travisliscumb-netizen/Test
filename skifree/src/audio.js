// Every sound is synthesised at runtime with WebAudio: no samples, nothing
// borrowed. The palette is deliberately early-90s PC: square and triangle
// waves, filtered noise, quick envelopes.
//
// Two music layers run from one scheduler and crossfade: a sparse, cheerful
// "calm" loop and a driving minor-key "chase" loop that means THE YETI.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.vol = { master: 0.8, music: 0.45, sfx: 0.9 };
    this.mode = 'calm'; // calm | chase | silent
    this.nextBeat = 0;
    this.beat = 0;
    this.paused = false;
  }

  // Must be called from a user gesture (browsers keep audio locked until then).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return;
    }
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.calmBus = ctx.createGain();
    this.chaseBus = ctx.createGain();
    this.calmBus.connect(this.musicBus);
    this.chaseBus.connect(this.musicBus);
    this.chaseBus.gain.value = 0;

    // Two seconds of white noise, shared by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Continuous layers: skis on snow, turbo rush, mountain wind.
    this.ski = this.loopNoise('bandpass', 900, 0.8);
    this.carve = this.loopNoise('highpass', 2400, 0.7);
    this.rush = this.loopNoise('bandpass', 1800, 1.4);
    this.wind = this.loopNoise('lowpass', 420, 0.5);
    this.wind.gain.gain.value = 0.03;

    this.applyVolumes();
    this.nextBeat = ctx.currentTime + 0.1;
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start();
    return { src, filter, gain };
  }

  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  pause() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMusic(mode) {
    if (!this.ctx || mode === this.mode) return;
    this.mode = mode;
    const t = this.ctx.currentTime;
    this.calmBus.gain.setTargetAtTime(mode === 'calm' ? 1 : 0, t, mode === 'chase' ? 0.08 : 0.8);
    this.chaseBus.gain.setTargetAtTime(mode === 'chase' ? 1 : 0, t, mode === 'chase' ? 0.05 : 1.2);
  }

  // Called once per frame with the live skier state.
  frame(game, active) {
    if (!this.ctx || this.paused) return;
    const t = this.ctx.currentTime;
    const p = game?.player;
    const grounded = active && p && p.state === 'ski' && p.z <= 0;
    const sp = p ? Math.min(1.4, p.speed / 240) : 0;
    this.ski.gain.gain.setTargetAtTime(grounded ? 0.05 + sp * 0.13 : 0, t, 0.06);
    this.ski.filter.frequency.setTargetAtTime(500 + sp * 1300, t, 0.1);
    this.carve.gain.gain.setTargetAtTime(grounded ? p.skid * 0.14 * Math.min(1, sp * 1.5) : 0, t, 0.04);
    this.rush.gain.gain.setTargetAtTime(active && p && p.turbo ? 0.05 + sp * 0.07 : 0, t, 0.12);
    this.rush.filter.frequency.setTargetAtTime(1200 + sp * 1600, t, 0.2);
    this.wind.gain.gain.setTargetAtTime(active ? 0.035 + sp * 0.04 : 0.025, t, 0.5);
    this.scheduleMusic();
  }

  // ------------------------------------------------------------ primitives

  tone(type, f0, f1, dur, vol, when = 0, bus = this.sfxBus) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  burst(type, f0, f1, dur, vol, when = 0, q = 1, bus = this.sfxBus) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * Math.max(0, 1.9 - dur)); // stay inside the 2 s buffer
    src.stop(t + dur + 0.02);
  }

  // A cartoon voice: sawtooth through a formant filter.
  voice(f0, f1, dur, formant, vol, when = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = formant;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ sfx

  play(name, e = {}) {
    if (!this.ctx || !this.enabled || this.paused) return;
    const sp = Math.min(1.5, (e.speed || 0) / 240);
    switch (name) {
      case 'click':
        this.tone('square', 1200, 1200, 0.03, 0.05);
        break;
      case 'start':
        this.tone('square', 523, 523, 0.07, 0.07);
        this.tone('square', 784, 784, 0.1, 0.07, 0.07);
        break;
      case 'jump':
        this.tone('square', 320, 640, 0.12, 0.07);
        this.burst('highpass', 3000, 3000, 0.08, 0.05);
        break;
      case 'ramp':
        this.burst('bandpass', 500, 2600, 0.35, 0.16, 0, 1.5);
        this.tone('triangle', 260, 780, 0.3, 0.08);
        break;
      case 'land':
        this.burst('lowpass', 900, 200, 0.14, 0.2 + Math.min(0.2, e.air * 0.15));
        this.tone('sine', 140, 60, 0.12, 0.14);
        break;
      case 'mogul':
        this.burst('lowpass', 700, 250, 0.08, 0.12);
        this.tone('sine', 180, 120, 0.07, 0.07);
        break;
      case 'hit': {
        const hard = e.obj && (e.obj.startsWith('tree') || e.obj === 'rock_l' || e.obj === 'lift_tower');
        if (e.obj && e.obj.startsWith('rock')) {
          this.tone('square', 220, 90, 0.09, 0.12);
          this.burst('bandpass', 2200, 900, 0.08, 0.14, 0, 3);
        } else if (e.obj === 'lift_tower') {
          this.tone('triangle', 660, 640, 0.5, 0.1);
          this.tone('triangle', 990, 960, 0.4, 0.05);
        }
        this.tone('sine', 110 + (hard ? 0 : 60), 45, 0.22, 0.25 * (0.6 + sp * 0.4));
        this.burst('lowpass', 1200, 200, 0.2, 0.22);
        if (e.obj && e.obj.startsWith('tree')) this.burst('highpass', 4000, 2500, 0.45, 0.07, 0.03); // snow off the branches
        this.voice(260, 150, 0.16, 700, 0.12, 0.05); // "oof"
        break;
      }
      case 'wipeout':
        this.burst('lowpass', 1500, 180, 0.3, 0.25);
        this.voice(300, 140, 0.25, 650, 0.12, 0.02);
        break;
      case 'smash':
        this.burst('lowpass', 1800, 250, 0.35, 0.24);
        this.burst('highpass', 3500, 2000, 0.25, 0.06, 0.05);
        break;
      case 'flag':
        this.tone('triangle', 900, 700, 0.06, 0.07);
        break;
      case 'gate':
        this.tone('sine', 1319, 1319, 0.16, 0.06);
        this.tone('sine', 1760, 1760, 0.22, 0.05, 0.06);
        break;
      case 'woof':
        this.voice(420, 230, 0.11, 950, 0.2);
        this.voice(400, 220, 0.12, 950, 0.18, 0.17);
        break;
      case 'yelp':
        this.tone('sine', 900, 1500, 0.08, 0.08);
        this.tone('sine', 1400, 600, 0.14, 0.07, 0.08);
        break;
      case 'dog':
        this.play('yelp');
        this.tone('sine', 160, 70, 0.15, 0.15);
        break;
      case 'bump':
        this.burst('lowpass', 900, 200, 0.16, 0.2);
        this.voice(240, 140, 0.18, 650, 0.12);
        this.voice(340, 200, 0.16, 900, 0.09, 0.12); // "hey!"
        break;
      case 'npcfall':
        this.burst('lowpass', 700, 200, 0.12, 0.08);
        break;
      case 'turbo':
        this.burst('bandpass', 400, 2400, 0.3, 0.1, 0, 2);
        break;
      case 'yeti':
        this.roar(1.3);
        break;
      case 'yetibonk':
        this.tone('sine', 700, 180, 0.22, 0.14);
        this.burst('lowpass', 800, 150, 0.25, 0.22);
        break;
      case 'caught':
        this.caught();
        break;
      case 'escape':
        [60, 64, 67, 72].forEach((n, i) => this.tone('square', midi(n + 12), midi(n + 12), 0.1, 0.06, i * 0.08));
        this.roar(0.7, 0.35, 0.6);
        break;
      case 'gameover':
        [67, 63, 60, 55].forEach((n, i) => this.tone('square', midi(n), midi(n), 0.16, 0.06, 0.2 + i * 0.16));
        break;
    }
  }

  // Growl: detuned saws with vibrato through a distortion curve.
  roar(dur, when = 0, level = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 3.5);
    }
    shaper.curve = curve;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1400, t + dur * 0.3);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * level, t + 0.06);
    g.gain.setValueAtTime(0.28 * level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain);
    for (const [base, det] of [[82, 0], [123, 7]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.35, t + dur * 0.25);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
      o.detune.value = det;
      lfoGain.connect(o.frequency);
      o.connect(shaper);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    shaper.connect(f).connect(g).connect(this.sfxBus);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    this.burst('bandpass', 600, 300, dur * 0.9, 0.12 * level, when, 1.2);
  }

  // Timed to the eating animation in characters.js.
  caught() {
    this.roar(0.35, 0, 0.8);
    this.tone('sine', 380, 70, 0.45, 0.2, 0.5); // gulp
    this.burst('lowpass', 500, 120, 0.3, 0.15, 0.75);
    for (let i = 0; i < 4; i++) {
      this.burst('lowpass', 900, 200, 0.07, 0.22, 1.12 + i * 0.16); // chomp
      this.tone('square', 110, 80, 0.05, 0.05, 1.12 + i * 0.16);
    }
    this.voice(90, 70, 0.35, 380, 0.25, 1.78); // burp
    // Victory hoots on the hops.
    for (let i = 0; i < 3; i++) {
      this.voice(320, 420, 0.14, 800, 0.12, 1.95 + i * 0.45);
    }
  }

  // ---------------------------------------------------------------- music

  scheduleMusic() {
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 0.2;
    if (this.nextBeat < ctx.currentTime - 0.5) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ahead) {
      const when = this.nextBeat - ctx.currentTime;
      if (this.mode === 'chase') this.chaseStep(this.beat, when);
      else this.calmStep(this.beat, when);
      const bpm = this.mode === 'chase' ? 152 : 104;
      this.nextBeat += 60 / bpm / 2; // eighth notes
      this.beat++;
    }
  }

  // Sparse and sunny: a little bass walk and an occasional bell.
  calmStep(b, when) {
    const bar = Math.floor(b / 8) % 8;
    const step = b % 8;
    const roots = [60, 60, 65, 65, 57, 57, 67, 67]; // C C F F A- A- G G
    const root = roots[bar];
    const bus = this.calmBus;
    if (step === 0 || step === 4) this.tone('triangle', midi(root - 24), midi(root - 24), 0.35, 0.12, when, bus);
    if (step === 6 && bar % 2) this.tone('triangle', midi(root - 17), midi(root - 17), 0.2, 0.07, when, bus);
    const melody = [
      [72, -1, 76, -1, 79, -1, -1, -1],
      [-1, -1, 77, -1, 76, -1, 72, -1],
      [69, -1, 72, -1, 77, -1, -1, -1],
      [-1, -1, 76, -1, 74, -1, -1, -1],
      [72, -1, 69, -1, 64, -1, -1, -1],
      [-1, -1, 67, -1, 69, -1, 72, -1],
      [71, -1, 74, -1, 79, -1, -1, -1],
      [-1, -1, 77, -1, 74, -1, 71, -1],
    ][bar][step];
    if (melody > 0) {
      this.tone('sine', midi(melody), midi(melody), 0.5, 0.045, when, bus);
      this.tone('square', midi(melody + 12), midi(melody + 12), 0.05, 0.008, when, bus);
    }
  }

  // Driving minor ostinato, four-on-the-floor kick, offbeat hats.
  chaseStep(b, when) {
    const step = b % 16;
    const bus = this.chaseBus;
    const bass = [40, 40, 52, 40, 43, 40, 52, 43, 45, 45, 52, 45, 47, 46, 45, 43];
    const n = bass[step];
    this.tone('square', midi(n), midi(n), 0.13, 0.08, when, bus);
    if (step % 2 === 0) {
      this.tone('sine', 150, 45, 0.16, 0.3, when, bus); // kick
    } else {
      this.burst('highpass', 7000, 7000, 0.04, 0.05, when, 1, bus); // hat
    }
    if (step === 4 || step === 12) this.burst('bandpass', 1800, 900, 0.12, 0.12, when, 1, bus); // snare
    // Stabs that climb every other bar.
    if (step === 0 || step === 3 || step === 6) {
      const up = (Math.floor(b / 16) % 2) * 3;
      for (const k of [64, 67, 71]) this.tone('sawtooth', midi(k + up), midi(k + up), 0.09, 0.02, when, bus);
    }
  }
}
