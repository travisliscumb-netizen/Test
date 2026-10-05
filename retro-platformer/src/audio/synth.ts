import type { Drum, Wave } from "./notation";

/** Per-context caches of pulse waves and the noise buffer. */
const pulseCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Band-limited pulse wave with the given duty cycle, from its Fourier series. */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let map = pulseCache.get(ctx);
  if (!map) {
    map = new Map();
    pulseCache.set(ctx, map);
  }
  const key = String(duty);
  let wave = map.get(key);
  if (!wave) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    wave = ctx.createPeriodicWave(real, imag);
    map.set(key, wave);
  }
  return wave;
}

/** One second of 15-bit LFSR noise, like an 8-bit console's noise channel. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lfsr = 1;
    const hold = Math.max(1, Math.round(ctx.sampleRate / 16000));
    for (let i = 0; i < data.length; i++) {
      if (i % hold === 0) {
        const bit = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (bit << 14);
      }
      data[i] = (lfsr & 1) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

export interface ToneOptions {
  wave: Wave;
  freq: number;
  /** Glide to this frequency over the note (exponential). */
  slideTo?: number;
  start: number;
  duration: number;
  volume: number;
  /** Fraction of the note held at full volume before the release ramp. */
  sustain?: number;
}

const DUTY: Readonly<Record<Exclude<Wave, "triangle" | "noise">, number>> = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };

/** Schedules one note on a fresh oscillator (or noise source) into `dest`. */
export function playTone(ctx: BaseAudioContext, dest: AudioNode, o: ToneOptions): void {
  const gain = ctx.createGain();
  const end = o.start + o.duration;
  const release = Math.min(0.06, o.duration * 0.5);
  const hold = o.start + Math.max(0.005, (o.duration - release) * (o.sustain ?? 1));
  gain.gain.setValueAtTime(0, o.start);
  gain.gain.linearRampToValueAtTime(o.volume, o.start + 0.004);
  gain.gain.setValueAtTime(o.volume, hold);
  gain.gain.linearRampToValueAtTime(0.0001, end);
  gain.connect(dest);

  let source: AudioScheduledSourceNode;
  if (o.wave === "noise") {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    src.playbackRate.setValueAtTime(o.freq, o.start);
    if (o.slideTo) src.playbackRate.exponentialRampToValueAtTime(o.slideTo, end);
    source = src;
  } else {
    const osc = ctx.createOscillator();
    if (o.wave === "triangle") osc.type = "triangle";
    else osc.setPeriodicWave(pulseWave(ctx, DUTY[o.wave]));
    osc.frequency.setValueAtTime(o.freq, o.start);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, end);
    source = osc;
  }
  source.connect(gain);
  source.start(o.start);
  source.stop(end + 0.02);
  source.onended = () => gain.disconnect();
}

/** Drum voicings on the noise channel: playback rate, length and level. */
const DRUMS: Readonly<Record<Drum, { rate: number; slide: number; duration: number; level: number }>> = {
  k: { rate: 0.25, slide: 0.08, duration: 0.12, level: 1 },
  s: { rate: 0.9, slide: 0.5, duration: 0.14, level: 0.8 },
  h: { rate: 2.5, slide: 2.5, duration: 0.04, level: 0.45 },
};

export function playDrum(ctx: BaseAudioContext, dest: AudioNode, drum: Drum, start: number, volume: number): void {
  const d = DRUMS[drum];
  playTone(ctx, dest, { wave: "noise", freq: d.rate, slideTo: d.slide, start, duration: d.duration, volume: volume * d.level, sustain: 0.1 });
}
