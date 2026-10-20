/* =====================================================================
   [CORE] AUDIO SYSTEM  (fully synthesized with Web Audio)
   ===================================================================== */
class AudioSystem {
  constructor() {
    this.ctx = null; this.ready = false;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.vol = { master: 0.8, music: 0.55, sfx: 0.9 };
    this.station = 1; this.stations = ['Radio off', 'PV 88.1 · Lo-Fi Harbor', 'Coastline 101.7 · Night Drive'];
    this.musicOn = false; this.musicLevel = 0;
    this.lastFoot = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.vol.sfx; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = this.vol.sfx; this.amb.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0; this.mus.connect(this.master);
    // shared noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this._buildLoops();
    this._buildMusic();
    this.ready = true;
  }
  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.vol.master, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, this.ctx.currentTime, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.sfx, this.ctx.currentTime, 0.05);
  }
  _src(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  _buildLoops() {
    const ctx = this.ctx;
    // --- player engine ---
    const eg = this.engGain = ctx.createGain(); eg.gain.value = 0;
    const lp = this.engLP = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
    this.engO1 = ctx.createOscillator(); this.engO1.type = 'sawtooth';
    this.engO2 = ctx.createOscillator(); this.engO2.type = 'square';
    this.engO3 = ctx.createOscillator(); this.engO3.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.5; const g2 = ctx.createGain(); g2.gain.value = 0.25; const g3 = ctx.createGain(); g3.gain.value = 0.7;
    this.engO1.connect(g1).connect(lp); this.engO2.connect(g2).connect(lp); this.engO3.connect(g3).connect(lp);
    const en = this._src(this.noise); const enf = ctx.createBiquadFilter(); enf.type = 'bandpass'; enf.frequency.value = 300; enf.Q.value = 1;
    this.engNoiseG = ctx.createGain(); this.engNoiseG.gain.value = 0.15; this.engNoiseF = enf;
    en.connect(enf).connect(this.engNoiseG).connect(lp);
    lp.connect(eg).connect(this.sfx);
    this.engO1.start(); this.engO2.start(); this.engO3.start(); en.start();
    // --- tire squeal ---
    const ts = this._src(this.noise); const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1100; tf.Q.value = 9;
    const tf2 = ctx.createBiquadFilter(); tf2.type = 'peaking'; tf2.frequency.value = 2300; tf2.gain.value = 8;
    this.tireG = ctx.createGain(); this.tireG.gain.value = 0; this.tireF = tf;
    ts.connect(tf).connect(tf2).connect(this.tireG).connect(this.sfx); ts.start();
    // --- siren ---
    this.sirenO = ctx.createOscillator(); this.sirenO.type = 'triangle'; this.sirenO.frequency.value = 800;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); } sh.curve = curve;
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 3000;
    this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0; this.sirenPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.sirenO.connect(sh).connect(sf).connect(this.sirenG);
    if (this.sirenPan) this.sirenG.connect(this.sirenPan).connect(this.sfx); else this.sirenG.connect(this.sfx);
    this.sirenO.start(); this.sirenT = 0;
    // --- rain ---
    const rn = this._src(this.noise); const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 900;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0; rn.connect(rh).connect(rl).connect(this.rainG).connect(this.amb); rn.start();
    // --- city ambience (low rumble + distant traffic) ---
    const cb = this._src(this.brown); const cl = ctx.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.value = 420;
    this.cityG = ctx.createGain(); this.cityG.gain.value = 0.0; cb.connect(cl).connect(this.cityG).connect(this.amb); cb.start();
    const tn = this._src(this.noise); const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 160;
    this.trafG = ctx.createGain(); this.trafG.gain.value = 0; tn.connect(tl).connect(this.trafG).connect(this.amb); tn.start();
    // --- wind (speed) ---
    const wn = this._src(this.noise); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0; this.windF = wf; wn.connect(wf).connect(this.windG).connect(this.amb); wn.start();
    // --- crowd murmur (busy sidewalks) ---
    const cr = this._src(this.noise); const crf = ctx.createBiquadFilter(); crf.type = 'bandpass'; crf.frequency.value = 650; crf.Q.value = 0.9;
    const crf2 = ctx.createBiquadFilter(); crf2.type = 'lowpass'; crf2.frequency.value = 1600;
    this.crowdG = ctx.createGain(); this.crowdG.gain.value = 0; cr.connect(crf).connect(crf2).connect(this.crowdG).connect(this.amb); cr.start();
    // --- club bass (scheduled kicks through a wall: heavy lowpass) ---
    this.clubLP = ctx.createBiquadFilter(); this.clubLP.type = 'lowpass'; this.clubLP.frequency.value = 260;
    this.clubG = ctx.createGain(); this.clubG.gain.value = 0; this.clubLP.connect(this.clubG).connect(this.amb); this.clubNext = 0; this.clubStep = 0;
    // --- tension score (chases and fights): a low, slowly breathing drone ---
    this.tenG = ctx.createGain(); this.tenG.gain.value = 0; this.tenG.connect(this.master);
    const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 240; tlp.Q.value = 4; tlp.connect(this.tenG);
    for (const f of [55, 55.6, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = 0.33; o.connect(gg).connect(tlp); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18; const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(tlp.frequency); lfo.start();
    this.tenNext = 0;
    // --- fire crackle (burning car nearby) ---
    const fn = this._src(this.noise); const ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 2400; ff.Q.value = 0.8;
    this.fireG = ctx.createGain(); this.fireG.gain.value = 0; fn.connect(ff).connect(this.fireG).connect(this.sfx); fn.start();
  }
  // positional helper: returns {g, pan}
  spatial(x, z, ref = 12, max = 140) {
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const d = Math.hypot(dx, dz);
    if (d > max) return null;
    const g = ref / Math.max(ref, d) * (1 - d / max);
    const ang = Math.atan2(dx, dz) - this.listener.yaw;
    return { g, pan: clamp(-Math.sin(ang), -1, 1) * 0.8 };
  }
  _out(gain, pan) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (pan !== undefined && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }
  _noiseBurst(out, t, dur, type, freq, q, attack = 0.002, peak = 1, freqEnd) {
    const ctx = this.ctx;
    const s = this._src(this.noise, false); s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _tone(out, t, type, f0, f1, dur, peak = 0.5, attack = 0.005) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, opt = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    let gain = opt.gain ?? 1, pan;
    if (opt.x !== undefined) { const s = this.spatial(opt.x, opt.z, opt.ref || 10, opt.max || 160); if (!s) return; gain *= s.g; pan = s.pan; }
    if (gain < 0.01) return;
    // voice cap: a pile-up or explosion chain must not spawn unbounded audio graphs
    if ((this.voices || 0) > 48 && name !== 'pass' && name !== 'fail' && name !== 'wanted') return;
    this.voices = (this.voices || 0) + 1;
    const out = this._out(gain, pan);
    setTimeout(() => { this.voices--; try { out.disconnect(); } catch { /* already gone */ } }, 4000);
    switch (name) {
      case 'step': this._noiseBurst(out, t, 0.07, 'bandpass', 380 + Math.random() * 200, 1.3, 0.003, 0.35); break;
      case 'land': this._noiseBurst(out, t, 0.15, 'lowpass', 500, 1, 0.003, 0.7); break;
      case 'jump': this._noiseBurst(out, t, 0.12, 'bandpass', 900, 1, 0.01, 0.15); break;
      case 'crash': {
        const k = opt.k ?? 1;
        this._noiseBurst(out, t, 0.25 + 0.4 * k, 'lowpass', 2600, 0.7, 0.002, 0.9, 300);
        this._tone(out, t, 'sine', 120, 40, 0.3, 0.8 * k);
        if (k > 0.5) { for (let i = 0; i < 4; i++) this._tone(out, t + 0.05 + Math.random() * 0.25, 'square', 1800 + Math.random() * 2400, 900, 0.08, 0.05); }
        break;
      }
      case 'thud': this._tone(out, t, 'sine', 160, 50, 0.18, 0.7); this._noiseBurst(out, t, 0.1, 'lowpass', 800, 1, 0.002, 0.4); break;
      case 'horn': {
        const dur = opt.dur || 0.45;
        for (const f of [392, 494]) {
          const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (opt.pitch || 1);
          const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 1800;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(lpf).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
        }
        break;
      }
      case 'pistol': this._noiseBurst(out, t, 0.22, 'lowpass', 5000, 0.5, 0.001, 1, 400); this._tone(out, t, 'square', 180, 50, 0.12, 0.5); break;
      case 'smg': this._noiseBurst(out, t, 0.12, 'lowpass', 6000, 0.5, 0.001, 0.8, 600); this._tone(out, t, 'square', 220, 70, 0.07, 0.35); break;
      case 'copgun': this._noiseBurst(out, t, 0.2, 'lowpass', 3500, 0.5, 0.001, 0.9, 300); break;
      case 'shotgun': this._noiseBurst(out, t, 0.45, 'lowpass', 4200, 0.4, 0.001, 1.2, 160); this._tone(out, t, 'sine', 110, 35, 0.3, 0.9); this._noiseBurst(out, t + 0.35, 0.05, 'bandpass', 1500, 2, 0.002, 0.2); this._noiseBurst(out, t + 0.48, 0.05, 'bandpass', 1100, 2, 0.002, 0.25); break;
      case 'gangshot': this._noiseBurst(out, t, 0.2, 'lowpass', 4200, 0.5, 0.001, 0.85, 350); this._tone(out, t, 'square', 160, 50, 0.1, 0.35); break;
      case 'block': this._tone(out, t, 'triangle', 300, 220, 0.06, 0.4); this._noiseBurst(out, t, 0.05, 'bandpass', 900, 2, 0.002, 0.4); break;
      case 'clank': this._tone(out, t, 'square', 180 + Math.random() * 120, 90, 0.35, 0.18); this._noiseBurst(out, t, 0.25, 'bandpass', 2400, 5, 0.002, 0.25, 900); break;
      case 'buzzer': this._tone(out, t, 'sawtooth', 110, 110, 0.6, 0.15); this._tone(out, t, 'square', 220, 220, 0.6, 0.06); break;
      case 'ricochet': this._tone(out, t, 'sine', 2600 + Math.random() * 1500, 900, 0.18, 0.08); break;
      case 'empty': this._tone(out, t, 'square', 1400, 1300, 0.03, 0.1); break;
      case 'hitmark': this._tone(out, t, 'triangle', 2100, 1900, 0.04, 0.18); break;
      case 'kill': this._tone(out, t, 'triangle', 1600, 1600, 0.05, 0.2); this._tone(out, t + 0.06, 'triangle', 2400, 2400, 0.08, 0.2); break;
      case 'reload': this._tone(out, t, 'square', 900, 700, 0.04, 0.12); this._tone(out, t + 0.25, 'square', 1200, 1000, 0.04, 0.14); break;
      case 'swing': this._noiseBurst(out, t, 0.18, 'bandpass', 700, 2, 0.06, 0.35, 2200); break;
      case 'punch': this._noiseBurst(out, t, 0.08, 'lowpass', 1200, 1, 0.002, 0.8); this._tone(out, t, 'sine', 140, 60, 0.1, 0.6); break;
      case 'hurt': this._tone(out, t, 'sawtooth', 320, 180, 0.15, 0.12); break;
      case 'explosion': {
        this._noiseBurst(out, t, 2.2, 'lowpass', 1800, 0.6, 0.004, 1, 60);
        this._tone(out, t, 'sine', 90, 25, 1.4, 1);
        this._noiseBurst(out, t + 0.05, 0.6, 'bandpass', 3000, 0.5, 0.002, 0.4, 500);
        break;
      }
      case 'door': this._noiseBurst(out, t, 0.12, 'lowpass', 900, 1, 0.002, 0.6); this._tone(out, t + 0.02, 'sine', 220, 120, 0.1, 0.35); break;
      case 'splash': this._noiseBurst(out, t, 0.6, 'bandpass', 1400, 0.6, 0.01, 0.6, 400); break;
      case 'ui': this._tone(out, t, 'sine', 880, 880, 0.06, 0.12); break;
      case 'uiHover': this._tone(out, t, 'sine', 1320, 1320, 0.035, 0.05); break;
      case 'phone': this._tone(out, t, 'sine', 1320, 1320, 0.07, 0.16); this._tone(out, t + 0.1, 'sine', 1760, 1760, 0.09, 0.16); break;
      case 'ach': [784, 988, 1175, 1568].forEach((f, i) => this._tone(out, t + i * 0.09, 'triangle', f, f, 0.22, 0.2)); break;
      case 'stunt': this._noiseBurst(out, t, 0.35, 'bandpass', 900, 1.2, 0.05, 0.4, 2600); this._tone(out, t + 0.12, 'triangle', 1047, 1568, 0.25, 0.2); break;
      case 'confirm': this._tone(out, t, 'triangle', 660, 660, 0.08, 0.2); this._tone(out, t + 0.07, 'triangle', 990, 990, 0.12, 0.2); break;
      case 'deny': this._tone(out, t, 'square', 220, 180, 0.18, 0.12); break;
      case 'cash': for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.06, 'triangle', 1400 + i * 300, 1400 + i * 300, 0.12, 0.18); break;
      case 'win1': this._tone(out, t, 'triangle', 988, 988, 0.1, 0.2); this._tone(out, t + 0.08, 'triangle', 1319, 1319, 0.16, 0.2); break;
      case 'win2': [784, 988, 1175, 1568].forEach((f, i) => this._tone(out, t + i * 0.07, 'triangle', f, f, 0.18, 0.22)); for (let i = 0; i < 4; i++) this._tone(out, t + 0.3 + i * 0.05, 'triangle', 1800 + i * 250, 1800 + i * 250, 0.09, 0.12); break;
      case 'win3': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this._tone(out, t + i * 0.08, 'triangle', f, f, 0.3, 0.24); this._tone(out, t + i * 0.08, 'sine', f / 2, f / 2, 0.3, 0.15); }); for (let i = 0; i < 10; i++) this._tone(out, t + 0.5 + i * 0.045, 'triangle', 1400 + (i % 3) * 300, 1400 + (i % 3) * 300, 0.08, 0.14); break;
      case 'jackpot': for (let r = 0; r < 3; r++) [523, 659, 784, 1047].forEach((f, i) => { this._tone(out, t + r * 0.5 + i * 0.09, 'triangle', f * (1 + r * 0.25), f * (1 + r * 0.25), 0.32, 0.24); this._tone(out, t + r * 0.5 + i * 0.09, 'square', f / 2, f / 2, 0.25, 0.06); }); for (let i = 0; i < 24; i++) this._tone(out, t + 1.5 + i * 0.04, 'triangle', 1500 + Math.random() * 1500, 1500 + Math.random() * 1500, 0.07, 0.12); break;
      case 'scratch': this._noiseBurst(out, t, 0.09, 'bandpass', 3500, 1.5, 0.005, 0.35); break;
      case 'reelstop': this._noiseBurst(out, t, 0.06, 'lowpass', 1400, 1, 0.002, 0.6); this._tone(out, t, 'square', 420, 300, 0.05, 0.14); break;
      case 'lever': this._noiseBurst(out, t, 0.25, 'lowpass', 800, 1, 0.01, 0.5); this._tone(out, t + 0.05, 'sawtooth', 160, 90, 0.22, 0.12); for (let i = 0; i < 6; i++) this._tone(out, t + 0.25 + i * 0.09, 'square', 1100 + (i % 2) * 220, 1100 + (i % 2) * 220, 0.04, 0.05); break;
      case 'card': this._noiseBurst(out, t, 0.07, 'highpass', 2500, 0.8, 0.003, 0.3); break;
      case 'chip': this._tone(out, t, 'triangle', 2400, 2200, 0.04, 0.16); this._tone(out, t + 0.03, 'triangle', 2700, 2500, 0.04, 0.12); break;
      case 'checkpoint': this._tone(out, t, 'triangle', 784, 784, 0.1, 0.3); this._tone(out, t + 0.08, 'triangle', 1175, 1175, 0.18, 0.3); break;
      case 'pickup': this._tone(out, t, 'sine', 600, 1200, 0.18, 0.3); break;
      case 'pass': {
        const notes = [523, 659, 784, 1047, 784, 1047];
        notes.forEach((f, i) => { this._tone(out, t + i * 0.11, 'triangle', f, f, 0.35, 0.22); this._tone(out, t + i * 0.11, 'sine', f / 2, f / 2, 0.35, 0.18); });
        break;
      }
      case 'fail': [392, 330, 262, 196].forEach((f, i) => this._tone(out, t + i * 0.18, 'sawtooth', f, f * 0.97, 0.4, 0.1)); break;
      case 'wanted': this._tone(out, t, 'square', 700, 700, 0.09, 0.12); this._tone(out, t + 0.12, 'square', 520, 520, 0.12, 0.12); break;
      case 'radio': {
        this._noiseBurst(out, t, 0.12, 'bandpass', 1800, 1.5, 0.002, 0.25);
        for (let i = 0; i < 6; i++) this._noiseBurst(out, t + 0.15 + i * 0.12, 0.1, 'bandpass', 900 + Math.random() * 900, 3, 0.01, 0.2);
        this._tone(out, t + 0.9, 'sine', 1600, 1600, 0.06, 0.12);
        break;
      }
      case 'glass': for (let i = 0; i < 5; i++) this._tone(out, t + i * 0.025 + Math.random() * 0.03, 'sine', 3000 + Math.random() * 3000, 2500, 0.12, 0.08); this._noiseBurst(out, t, 0.2, 'highpass', 4000, 0.6, 0.002, 0.4); break;
      case 'thunder': {
        this._noiseBurst(out, t, 3.5, 'lowpass', 260, 0.5, 0.05, 0.9, 50);
        this._noiseBurst(out, t + 0.1, 1.2, 'lowpass', 900, 0.5, 0.01, 0.4, 120);
        break;
      }
      case 'water': this._noiseBurst(out, t, 1.5, 'highpass', 1500, 0.5, 0.05, 0.25); break;
      case 'scream': {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; const f0 = 700 + Math.random() * 300;
        o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.3, t + 0.15); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.6);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 3;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 0.75); break;
      }
    }
  }
  footstep(x, z, run) {
    if (!this.ready) return;
    this.play('step', { gain: run ? 0.9 : 0.6 });
  }
  // continuous layers, called every frame
  update(dt, s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // engine
    if (s.engine) {
      const rpm = s.engine.rpm, thr = s.engine.throttle, base = s.engine.base || 1;
      const f = (38 + rpm * 120) * base;
      this.engO1.frequency.setTargetAtTime(f, t, 0.03);
      this.engO2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      this.engO3.frequency.setTargetAtTime(f * 0.25, t, 0.03);
      this.engLP.frequency.setTargetAtTime(380 + rpm * 1500 + thr * 900, t, 0.05);
      this.engNoiseF.frequency.setTargetAtTime(f * 2.2, t, 0.05);
      this.engGain.gain.setTargetAtTime(0.10 + thr * 0.11 + rpm * 0.05, t, 0.06);
    } else this.engGain.gain.setTargetAtTime(0, t, 0.1);
    this.tireG.gain.setTargetAtTime(clamp(s.skid || 0, 0, 1) * 0.22, t, 0.05);
    this.tireF.frequency.setTargetAtTime(900 + (s.skid || 0) * 500, t, 0.1);
    // siren
    this.sirenT += dt;
    if (s.siren) {
      const yelp = s.siren.yelp;
      const ph = yelp ? (this.sirenT * 3.2) % 1 : (Math.sin(this.sirenT * Math.PI * 2 / 4.2) * 0.5 + 0.5);
      const f = yelp ? 700 + ph * 900 : 650 + ph * 750;
      this.sirenO.frequency.setTargetAtTime(f, t, 0.01);
      this.sirenG.gain.setTargetAtTime(s.siren.g * 0.11, t, 0.08);
      if (this.sirenPan) this.sirenPan.pan.setTargetAtTime(s.siren.pan, t, 0.1);
    } else this.sirenG.gain.setTargetAtTime(0, t, 0.2);
    this.rainG.gain.setTargetAtTime((s.rain || 0) * 0.16, t, 0.5);
    this.cityG.gain.setTargetAtTime(s.city || 0, t, 0.5);
    this.trafG.gain.setTargetAtTime(s.traffic || 0, t, 0.3);
    this.windG.gain.setTargetAtTime((s.wind || 0) * 0.12, t, 0.2);
    this.windF.frequency.setTargetAtTime(400 + (s.wind || 0) * 900, t, 0.2);
    this.fireG.gain.setTargetAtTime((s.fire || 0) * 0.12, t, 0.2);
    this.crowdG.gain.setTargetAtTime((s.crowd || 0) * (0.7 + Math.sin(t * 0.7) * 0.3), t, 0.4);
    const club = s.club || 0;
    this.clubG.gain.setTargetAtTime(club * 0.55, t, 0.3);
    if (club > 0.01) {
      // 124 bpm: kick every beat, a muffled stab every other bar
      const beat = 60 / 124;
      if (this.clubNext < t) this.clubNext = t + 0.05;
      while (this.clubNext < t + 0.2) {
        const k = this.clubNext, o = this.ctx.createOscillator(), gg = this.ctx.createGain();
        o.frequency.setValueAtTime(130, k); o.frequency.exponentialRampToValueAtTime(42, k + 0.14);
        gg.gain.setValueAtTime(0.9, k); gg.gain.exponentialRampToValueAtTime(0.0001, k + 0.32);
        o.connect(gg).connect(this.clubLP); o.start(k); o.stop(k + 0.34);
        if (this.clubStep % 8 === 4) this._tone(this.clubLP, k, 'sawtooth', 110, 110, beat * 1.5, 0.25);
        this.clubNext += beat; this.clubStep++;
      }
    }
    this.tenG.gain.setTargetAtTime((s.tension || 0) * 0.07 * this.vol.music, t, 1.2);
    if ((s.tension || 0) > 0.05) {
      // a pulse on top of the drone, quicker when it's worse
      const per = 0.9 - (s.tension || 0) * 0.35;
      if (this.tenNext < t) this.tenNext = t + 0.05;
      while (this.tenNext < t + 0.2) { this._tone(this.tenG, this.tenNext, 'sine', 73.4, 70, 0.22, 0.6); this.tenNext += per; }
    }
    // music
    const want = s.music ? 1 : 0;
    this.musicLevel = damp(this.musicLevel, want, 2, dt);
    this.mus.gain.setTargetAtTime(this.musicLevel * this.vol.music * 0.5, t, 0.1);
    this._scheduleMusic();
  }
  nextStation() {
    this.station = (this.station + 1) % this.stations.length;
    return this.stations[this.station];
  }
  // ---------- procedural radio ----------
  _buildMusic() {
    this.mNext = 0; this.mStep = 0; this.mBar = 0; this.mStation = -1;
    const ctx = this.ctx;
    this.musLP = ctx.createBiquadFilter(); this.musLP.type = 'lowpass'; this.musLP.frequency.value = 9000;
    this.musLP.connect(this.mus);
    // slight echo
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.33; const fb = ctx.createGain(); fb.gain.value = 0.25; const wet = ctx.createGain(); wet.gain.value = 0.25;
    this.musSend = ctx.createGain(); this.musSend.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(this.musLP);
  }
  _scheduleMusic() {
    if (this.musicLevel < 0.01 || this.station === 0) { this.mNext = 0; return; }
    const ctx = this.ctx;
    const st = this.station;
    if (st !== this.mStation) { this.mStation = st; this.mStep = 0; this.mBar = 0; this.mNext = 0; this.mSeed = Math.random() * 1000; }
    const bpm = st === 1 ? 78 : 104;
    const stepDur = 60 / bpm / 4;
    if (this.mNext < ctx.currentTime) this.mNext = ctx.currentTime + 0.05;
    while (this.mNext < ctx.currentTime + 0.25) {
      this._musicStep(st, this.mStep, this.mNext, stepDur);
      this.mNext += stepDur * (st === 1 && this.mStep % 2 === 1 ? 0.92 : (st === 1 ? 1.08 : 1)); // lo-fi swing
      this.mStep++; if (this.mStep >= 16) { this.mStep = 0; this.mBar++; }
    }
  }
  _musicStep(st, step, t, sd) {
    const ctx = this.ctx, out = this.musLP;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const prog = st === 1 ? [[57, 60, 64, 67], [50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 59, 64]]
                          : [[53, 56, 60, 63], [49, 53, 56, 60], [56, 60, 63, 67], [51, 55, 58, 62]];
    const chord = prog[this.mBar % 4];
    const rnd = hash2i(this.mBar, step, this.mSeed | 0);
    const voice = (type, f, dur, g, filt, dest = out) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + Math.min(0.08, dur * 0.3)); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (filt) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = filt; o.connect(f2).connect(gg); } else o.connect(gg);
      gg.connect(dest); o.start(t); o.stop(t + dur + 0.05);
      return gg;
    };
    const kick = (g) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const gg = ctx.createGain(); gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(gg).connect(out); o.start(t); o.stop(t + 0.32); };
    const hat = (g, d = 0.04) => this._noiseBurst(out, t, d, 'highpass', 7000, 0.7, 0.001, g);
    const snare = (g) => { this._noiseBurst(out, t, 0.16, 'bandpass', 1800, 0.8, 0.001, g); this._tone(out, t, 'triangle', 220, 160, 0.08, g * 0.5); };
    if (st === 1) {
      if (step === 0) chord.forEach(n => { voice('triangle', mtof(n), sd * 15, 0.045, 1400); voice('sine', mtof(n + 12) * 1.003, sd * 15, 0.02, 2000); });
      if (step === 0 || step === 7 || (step === 10 && rnd > 0.5)) kick(0.55);
      if (step === 4 || step === 12) snare(0.16);
      if (step % 2 === 0) hat(0.05 + (step % 4 === 2 ? 0.03 : 0));
      if (step === 0 || step === 8 || (step === 11 && rnd > 0.6)) voice('sine', mtof(chord[0] - 12), sd * 5, 0.22);
      if (rnd > 0.72 && step % 2 === 0) { const pent = [0, 3, 5, 7, 10]; const n = chord[0] + 12 + pent[Math.floor(hash2i(step, this.mBar, 7) * 5)]; const g = voice('sine', mtof(n), sd * 3, 0.05, 3000); g.connect(this.musSend); }
      if (step === 0) this._noiseBurst(out, t, sd * 16, 'bandpass', 3000, 0.4, 0.2, 0.012);
    } else {
      if (step % 4 === 0) kick(0.6);
      if (step === 4 || step === 12) { this._noiseBurst(out, t, 0.12, 'bandpass', 1500, 0.9, 0.001, 0.2); }
      if (step % 2 === 1) hat(0.05);
      const bassN = chord[0] - 24 + (step % 4 === 2 ? 12 : 0);
      if (step % 2 === 0) voice('sawtooth', mtof(bassN), sd * 1.8, 0.1, 600);
      const arp = chord[(step + this.mBar) % 4] + 12;
      const g = voice('square', mtof(arp), sd * 0.9, 0.028, 2400); g.connect(this.musSend);
      if (step === 0) chord.forEach(n => voice('sawtooth', mtof(n) * (1 + (Math.random() - 0.5) * 0.004), sd * 16, 0.018, 1200));
    }
  }
}

