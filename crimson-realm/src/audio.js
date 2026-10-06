/* All sound is synthesised with WebAudio -- no audio files to download.
   Impacts layer a pitched body thump with filtered noise; the score is a
   generative taiko/bass/drone loop whose tempo and density rise with the
   ladder level. The announcer uses the platform speech synthesiser.     */

const STAGE_KEYS = { temple: 50, bridge: 45, forge: 43, spire: 48, grove: 47, throne: 41 };
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfx = true;
    this.music = true;
    this.voice = true;
    this.musicState = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.master = ctx.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 4;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      this.reverb.connect(wet).connect(this.master);
      const n = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  get ready() { return this.ctx && this.ctx.state === 'running'; }

  /* ---------------------------------------------------------- voices */
  tone({ type = 'sine', f0, f1, t = 0, dur = 0.2, gain = 0.5, bus, verb = 0, attack = 0.004, filter }) {
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(gain, at + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = o;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type || 'lowpass';
      bq.frequency.value = filter.f;
      bq.Q.value = filter.q || 0.8;
      node.connect(bq);
      node = bq;
    }
    node.connect(gn).connect(bus || this.sfxBus);
    if (verb) { const s = ctx.createGain(); s.gain.value = verb; gn.connect(s).connect(this.reverb); }
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  noise({ t = 0, dur = 0.15, gain = 0.4, f = 2000, f1, q = 1, type = 'bandpass', bus, verb = 0, attack = 0.002 }) {
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(f, at);
    if (f1) bq.frequency.exponentialRampToValueAtTime(f1, at + dur);
    bq.Q.value = q;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(gain, at + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bq).connect(gn).connect(bus || this.sfxBus);
    if (verb) { const s = ctx.createGain(); s.gain.value = verb; gn.connect(s).connect(this.reverb); }
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /* ------------------------------------------------------------- sfx */
  play(name, o = {}) {
    if (!this.sfx || !this.ready) return;
    const p = o.power ?? 1;
    switch (name) {
      case 'light':
        this.tone({ f0: 180, f1: 60, dur: 0.12, gain: 0.6 });
        this.noise({ f: 1800, dur: 0.07, gain: 0.5, q: 0.7 });
        break;
      case 'heavy':
        this.tone({ f0: 140, f1: 40, dur: 0.22, gain: 0.85 });
        this.noise({ f: 1200, f1: 300, dur: 0.16, gain: 0.7, q: 0.6, verb: 0.2 });
        this.noise({ f: 5000, dur: 0.04, gain: 0.3, type: 'highpass' });
        break;
      case 'crush':
        this.tone({ f0: 110, f1: 30, dur: 0.4, gain: 1, verb: 0.3 });
        this.noise({ f: 900, f1: 150, dur: 0.3, gain: 0.9, q: 0.5, verb: 0.3 });
        this.noise({ f: 3000, dur: 0.08, gain: 0.5, q: 2 });
        break;
      case 'block':
        this.tone({ type: 'square', f0: 1400, f1: 900, dur: 0.07, gain: 0.12, filter: { f: 3000 } });
        this.noise({ f: 4200, dur: 0.06, gain: 0.35, q: 4 });
        break;
      case 'whoosh':
        this.noise({ f: o.heavy ? 500 : 900, f1: o.heavy ? 1600 : 2400, dur: o.heavy ? 0.2 : 0.12, gain: o.heavy ? 0.22 : 0.14, q: 1.4, attack: 0.03 });
        break;
      case 'jump': this.noise({ f: 600, f1: 1400, dur: 0.12, gain: 0.12, q: 1, attack: 0.02 }); break;
      case 'land': this.tone({ f0: 90, f1: 50, dur: 0.1, gain: 0.3 }); this.noise({ f: 400, dur: 0.08, gain: 0.2 }); break;
      case 'thud':
        this.tone({ f0: 80, f1: 34, dur: 0.35, gain: 0.5 + 0.4 * p, verb: 0.2 });
        this.noise({ f: 300, f1: 120, dur: 0.3, gain: 0.5, q: 0.5 });
        break;
      case 'fire':
        this.noise({ f: 700, f1: 2400, dur: 0.5, gain: 0.5, q: 0.7, attack: 0.03, verb: 0.3 });
        this.tone({ type: 'sawtooth', f0: 120, f1: 360, dur: 0.35, gain: 0.12, filter: { f: 1200 } });
        break;
      case 'void':
        this.tone({ type: 'sawtooth', f0: 70, f1: 220, dur: 0.6, gain: 0.25, filter: { f: 900, q: 6 }, verb: 0.5 });
        this.noise({ f: 300, f1: 1800, dur: 0.5, gain: 0.3, q: 3, verb: 0.4 });
        break;
      case 'zap':
        for (let i = 0; i < 5; i++) this.tone({ type: 'square', f0: 2000 + Math.random() * 3000, f1: 200, t: i * 0.035, dur: 0.06, gain: 0.08 });
        this.noise({ f: 6000, dur: 0.35, gain: 0.35, type: 'highpass', verb: 0.3 });
        break;
      case 'teleport':
        this.tone({ type: 'sine', f0: 900, f1: 120, dur: 0.3, gain: 0.25, verb: 0.5 });
        this.noise({ f: 2500, f1: 400, dur: 0.3, gain: 0.25, q: 5 });
        break;
      case 'rise':
        this.noise({ f: 800, f1: 5000, dur: 0.3, gain: 0.3, q: 2, attack: 0.02 });
        this.tone({ type: 'triangle', f0: 400, f1: 1600, dur: 0.25, gain: 0.15 });
        break;
      case 'quake':
        this.tone({ f0: 60, f1: 28, dur: 0.8, gain: 1, verb: 0.4 });
        this.noise({ f: 200, f1: 60, dur: 0.9, gain: 0.8, q: 0.5, type: 'lowpass' });
        break;
      case 'explode':
        this.tone({ f0: 90, f1: 30, dur: 0.6, gain: 0.8, verb: 0.4 });
        this.noise({ f: 1500, f1: 200, dur: 0.5, gain: 0.7, q: 0.4, verb: 0.4 });
        break;
      case 'ko':
        this.tone({ f0: 70, f1: 24, dur: 1.4, gain: 1, verb: 0.7 });
        this.noise({ f: 600, f1: 80, dur: 1.2, gain: 0.8, q: 0.4, verb: 0.6 });
        this.tone({ type: 'sawtooth', f0: 55, dur: 1.6, gain: 0.15, filter: { f: 300 }, verb: 0.5, attack: 0.05 });
        break;
      case 'gore':
        for (let i = 0; i < 4; i++) this.noise({ t: i * 0.06, f: 500 + Math.random() * 400, f1: 120, dur: 0.25, gain: 0.6, q: 1.5, verb: 0.2 });
        this.tone({ f0: 100, f1: 30, dur: 0.6, gain: 0.9, verb: 0.5 });
        break;
      case 'ui': this.tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.08, gain: 0.15 }); break;
      case 'select':
        this.tone({ type: 'triangle', f0: 440, dur: 0.1, gain: 0.18 });
        this.tone({ type: 'triangle', f0: 660, t: 0.07, dur: 0.16, gain: 0.18, verb: 0.3 });
        break;
      case 'gong':
        [110, 165.5, 221, 296].forEach((f, i) => this.tone({ f0: f, dur: 2.6, gain: 0.3 / (i + 1), verb: 0.8, attack: 0.01 }));
        this.noise({ f: 300, dur: 0.2, gain: 0.3, q: 1 });
        break;
    }
  }

  /* ------------------------------------------------------------ voice */
  say(text) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.toLowerCase().replace(/!/g, '!'));
      u.pitch = 0.45;
      u.rate = 0.88;
      u.volume = 1;
      const v = speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang) && /male|daniel|alex|fred|google uk english male/i.test(x.name))
        || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech is optional */ }
  }

  /* ------------------------------------------------------------ music */
  startMusic(stage, intensity = 0) {
    if (!this.ctx) return;
    this.stopMusic();
    if (!this.music) return;
    const ctx = this.ctx;
    const root = STAGE_KEYS[stage] || 45;
    const bpm = 92 + intensity * 34;
    const st = { root, step: 0, next: ctx.currentTime + 0.1, spb: 60 / bpm / 4, intensity, seed: root * 31, nodes: [] };
    // drone pad
    const pad = ctx.createGain();
    pad.gain.setValueAtTime(0.0001, ctx.currentTime);
    pad.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 240;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    for (const [semi, det] of [[0, -7], [0, 7], [7, 0], [-12, 3]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(root + semi - 12);
      o.detune.value = det;
      o.connect(lp);
      o.start();
      st.nodes.push(o);
    }
    lp.connect(pad).connect(this.musicBus);
    const pv = ctx.createGain(); pv.gain.value = 0.4; pad.connect(pv).connect(this.reverb);
    st.nodes.push(lfo);
    st.pad = pad;
    this.musicState = st;
    st.timer = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    const st = this.musicState;
    if (!st) return;
    clearInterval(st.timer);
    const now = this.ctx.currentTime;
    st.pad.gain.cancelScheduledValues(now);
    st.pad.gain.setValueAtTime(Math.max(0.0001, st.pad.gain.value), now);
    st.pad.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    for (const n of st.nodes) n.stop(now + 0.9);
    this.musicState = null;
  }

  rand() {
    const st = this.musicState;
    st.seed = (st.seed * 9301 + 49297) % 233280;
    return st.seed / 233280;
  }

  schedule() {
    const st = this.musicState;
    if (!st || !this.ctx) return;
    const ctx = this.ctx;
    while (st.next < ctx.currentTime + 0.18) {
      const s = st.step % 16;
      const bar = Math.floor(st.step / 16);
      const t = st.next - ctx.currentTime;
      const I = st.intensity;
      const bus = this.musicBus;
      // taiko: big hits on 1 and the "and" of 3, ghost notes as intensity rises
      if (s === 0 || s === 10 || (s === 6 && bar % 2) || (I > 0.4 && s === 14)) {
        this.tone({ f0: 92, f1: 42, t, dur: 0.5, gain: 0.9, bus, verb: 0.3 });
        this.noise({ t, f: 200, dur: 0.12, gain: 0.25, bus });
      } else if (I > 0.2 && s % 4 === 2 && this.rand() < 0.4 + I * 0.4) {
        this.tone({ f0: 160, f1: 90, t, dur: 0.18, gain: 0.35, bus });
      }
      // rim clicks
      if (s % 4 === 3 && this.rand() < 0.5 + I * 0.4) this.noise({ t, f: 3500, dur: 0.04, gain: 0.18, q: 6, bus });
      // ostinato bass
      if (s % 2 === 0) {
        const pat = [0, 0, 1, 0, 3, 0, 1, 0];
        const note = st.root - 24 + PHRYGIAN[pat[(s / 2) % 8]] + (bar % 4 === 3 ? 5 : 0);
        this.tone({ type: 'sawtooth', f0: midi(note), t, dur: st.spb * 1.8, gain: 0.32, bus, filter: { f: 260 + I * 500, q: 4 } });
      }
      // a koto-like pluck melody, sparse
      if ((s === 4 || s === 12 || (s === 7 && I > 0.5)) && this.rand() < 0.55) {
        const deg = PHRYGIAN[Math.floor(this.rand() * 7)];
        const note = st.root + 12 + deg;
        this.tone({ type: 'triangle', f0: midi(note), t, dur: 0.6, gain: 0.16, bus, verb: 0.6, attack: 0.002 });
        this.tone({ type: 'sine', f0: midi(note + 12), t, dur: 0.3, gain: 0.05, bus });
      }
      st.next += st.spb;
      st.step++;
    }
  }
}

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
