/* Synthesised sound. No samples: every effect is oscillators and envelopes,
   scheduled on the audio clock so timing never depends on frame rate.

   One continuous "loop voice" carries the background (siren, fright warble,
   retreating eyes); the game picks which each frame and the voice re-schedules
   itself a little ahead. Everything else is a fire-and-forget one-shot.

   The intro and intermission tunes are original compositions. */

const NOTE = (() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const map = {};
  for (let oct = 1; oct <= 7; oct++) {
    names.forEach((n, i) => { map[n + oct] = 440 * 2 ** ((oct - 4) + (i - 9) / 12); });
  }
  return map;
})();

const INTRO = {
  step: 0.13,
  lead: 'E5 G5 C6 G5 A5 F5 D5 F5 E5 G5 C6 E6 D6 B5 G5 B5 C6 E6 D6 C6 B5 G5 A5 B5 C6 - G5 - C6 . . .',
  bass: 'C3 G3 C3 G3 F2 C3 F2 C3 C3 G3 C3 G3 G2 D3 G2 D3 A2 E3 A2 E3 G2 D3 G2 D3 C3 G2 C3 G2 C2 . . .'
};

const INTERMISSION = {
  step: 0.15,
  lead: 'G5 E5 C5 E5 G5 - A5 G5 F5 D5 B4 D5 F5 - G5 F5 E5 C5 A4 C5 E5 - F5 E5 D5 F5 E5 D5 C5 - - .',
  bass: 'C3 . G2 . C3 . E3 . G2 . D3 . G2 . B2 . A2 . E3 . A2 . C3 . F2 . G2 . C3 . . .'
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.loopKind = null;
    this.loopStage = 0;
    this.wakaToggle = false;
  }

  /* Must run inside a user gesture the first time (autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.pulse = this.makePulse(0.25);
      this.pulseHalf = this.makePulse(0.5);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /* Scheduling onto a context that is still resuming is fine -- the notes
     play the moment it starts -- so only a missing or closed one is unusable. */
  get ready() { return !!this.ctx && this.ctx.state !== 'closed'; }

  makePulse(duty) {
    const n = 32;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return this.ctx.createPeriodicWave(real, imag);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.02);
    if (!on) this.setLoop(null);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  /* ------------------------------------------------------------ voices */

  voice(type, gainValue, t0, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (type === 'pulse') osc.setPeriodicWave(this.pulse);
    else if (type === 'pulseHalf') osc.setPeriodicWave(this.pulseHalf);
    else osc.type = type;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gainValue, t0 + 0.006);
    g.gain.setValueAtTime(gainValue, t0 + Math.max(0.007, dur - 0.025));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  }

  sweep(type, f0, f1, t0, dur, gain, curve = 'exp') {
    const osc = this.voice(type, gain, t0, dur);
    osc.frequency.setValueAtTime(f0, t0);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    else osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
  }

  can() { return this.enabled && this.ready; }

  /* ---------------------------------------------------------- one-shots */

  waka() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.wakaToggle = !this.wakaToggle;
    if (this.wakaToggle) this.sweep('triangle', 560, 220, t, 0.085, 0.32);
    else this.sweep('triangle', 220, 560, t, 0.085, 0.32);
  }

  power() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.sweep('sine', 180, 60, t, 0.22, 0.4);
    this.sweep('pulseHalf', 400, 900, t, 0.12, 0.06);
  }

  eatGhost() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.sweep('pulseHalf', 90, 1600, t, 0.48, 0.12);
    this.sweep('triangle', 180, 2400, t, 0.48, 0.12);
  }

  fruit() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    this.sweep('pulse', 300, 1200, t, 0.09, 0.12);
    this.sweep('pulse', 500, 1800, t + 0.1, 0.12, 0.12);
    this.sweep('triangle', 600, 2400, t + 0.1, 0.16, 0.12);
  }

  extraLife() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = this.voice('sine', 0.16, t + i * 0.13, 0.12);
      o.frequency.value = i % 2 ? NOTE.G6 : NOTE.C7;
    }
  }

  death() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 11; i++) {
      const base = 900 - i * 62;
      this.sweep('pulseHalf', base * 0.55, base, t + i * 0.105, 0.1, 0.11, 'lin');
    }
    const end = t + 11 * 0.105 + 0.05;
    this.sweep('triangle', 600, 80, end, 0.14, 0.25);
    this.sweep('triangle', 600, 80, end + 0.18, 0.14, 0.25);
  }

  levelClear() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    ['C6', 'E6', 'G6', 'C7', 'G6', 'C7'].forEach((n, i) => {
      const o = this.voice('pulse', 0.1, t + i * 0.08, 0.1);
      o.frequency.value = NOTE[n];
    });
  }

  gameOver() {
    if (!this.can()) return;
    const t = this.ctx.currentTime;
    ['G4', 'D#4', 'C4', 'G3'].forEach((n, i) => {
      const o = this.voice('pulse', 0.12, t + i * 0.22, 0.24);
      o.frequency.value = NOTE[n];
      const b = this.voice('triangle', 0.18, t + i * 0.22, 0.24);
      b.frequency.value = NOTE[n] / 2;
    });
  }

  click() {
    if (!this.can()) return;
    this.sweep('triangle', 900, 1400, this.ctx.currentTime, 0.04, 0.12);
  }

  tune(song) {
    if (!this.can()) return 0;
    const t0 = this.ctx.currentTime + 0.05;
    const play = (line, type, gain, transpose) => {
      const steps = line.split(/\s+/);
      for (let i = 0; i < steps.length; i++) {
        const n = steps[i];
        if (n === '.' || n === '-') continue;
        let len = 1;
        while (steps[i + len] === '-') len++;
        const dur = song.step * len * 0.92;
        const o = this.voice(type, gain, t0 + i * song.step, dur);
        o.frequency.value = NOTE[n] * transpose;
      }
    };
    play(song.lead, 'pulse', 0.11, 1);
    play(song.bass, 'triangle', 0.26, 1);
    return song.lead.split(/\s+/).length * song.step;
  }

  intro() { return this.tune(INTRO); }
  intermission() { return this.tune(INTERMISSION); }

  /* ------------------------------------------------------- loop voice */

  /* kind: 'siren' | 'fright' | 'eyes' | null; stage 0..4 raises the siren. */
  setLoop(kind, stage = 0) {
    if (!this.ctx) return;
    if (!this.enabled) kind = null;
    if (kind === this.loopKind && stage === this.loopStage) { this.pumpLoop(); return; }
    this.loopKind = kind;
    this.loopStage = stage;
    const now = this.ctx.currentTime;
    if (this.loopOsc) {
      const old = this.loopOsc, oldGain = this.loopGain;
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setTargetAtTime(0, now, 0.015);
      old.stop(now + 0.1);
      this.loopOsc = null;
    }
    if (!kind) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (kind === 'fright') osc.setPeriodicWave(this.pulseHalf);
    else osc.type = kind === 'eyes' ? 'triangle' : 'sine';
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(kind === 'siren' ? 0.16 : kind === 'fright' ? 0.05 : 0.1, now, 0.03);
    osc.connect(g).connect(this.master);
    osc.start(now);
    this.loopOsc = osc;
    this.loopGain = g;
    this.loopNext = now;
    this.pumpLoop();
  }

  pumpLoop() {
    if (!this.loopOsc) return;
    const f = this.loopOsc.frequency;
    const horizon = this.ctx.currentTime + 0.25;
    while (this.loopNext < horizon) {
      const t = this.loopNext;
      if (this.loopKind === 'siren') {
        const lo = 360 + this.loopStage * 70, hi = lo + 260 + this.loopStage * 20;
        const period = 0.42 - this.loopStage * 0.045;
        f.setValueAtTime(lo, t);
        f.linearRampToValueAtTime(hi, t + period / 2);
        f.linearRampToValueAtTime(lo, t + period);
        this.loopNext = t + period;
      } else if (this.loopKind === 'fright') {
        f.setValueAtTime(140, t);
        f.linearRampToValueAtTime(520, t + 0.13);
        this.loopNext = t + 0.135;
      } else {
        f.setValueAtTime(1500, t);
        f.exponentialRampToValueAtTime(700, t + 0.09);
        this.loopNext = t + 0.095;
      }
    }
  }
}
