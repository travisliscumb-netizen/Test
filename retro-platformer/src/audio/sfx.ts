import type { Sfx } from "../game/events";
import { freqOf, midiOf } from "./notation";
import { playTone, type ToneOptions } from "./synth";

type Voice = Omit<ToneOptions, "start">;

/** A sound effect is a list of tones at offsets (seconds) from its trigger time. */
type Effect = readonly (readonly [offset: number, tone: Voice])[];

const n = (name: string): number => freqOf(midiOf(name));

/** Evenly spaced notes on one wave. */
function arpeggio(wave: Voice["wave"], notes: readonly string[], step: number, volume: number, last = step): Effect {
  return notes.map((name, i) => [i * step, { wave, freq: n(name), duration: i === notes.length - 1 ? last : step, volume }] as const);
}

const EFFECTS: Readonly<Record<Sfx, Effect>> = {
  jump: [[0, { wave: "pulse25", freq: 320, slideTo: 880, duration: 0.16, volume: 0.16 }]],
  jumpBig: [[0, { wave: "pulse25", freq: 230, slideTo: 640, duration: 0.2, volume: 0.17 }]],
  coin: arpeggio("pulse25", ["E6", "G6", "C7"], 0.045, 0.14, 0.3),
  bump: [
    [0, { wave: "triangle", freq: 150, slideTo: 60, duration: 0.11, volume: 0.45 }],
    [0, { wave: "noise", freq: 0.5, slideTo: 0.2, duration: 0.06, volume: 0.12 }],
  ],
  break: [
    [0, { wave: "noise", freq: 1.2, slideTo: 0.15, duration: 0.32, volume: 0.28, sustain: 0.2 }],
    [0, { wave: "triangle", freq: 110, slideTo: 50, duration: 0.18, volume: 0.4 }],
  ],
  stomp: [[0, { wave: "pulse50", freq: 640, slideTo: 180, duration: 0.12, volume: 0.15 }]],
  kick: [
    [0, { wave: "noise", freq: 2, slideTo: 1, duration: 0.05, volume: 0.2 }],
    [0, { wave: "pulse50", freq: 420, slideTo: 210, duration: 0.07, volume: 0.13 }],
  ],
  sproutAppear: arpeggio("pulse12", ["C5", "E5", "G5", "C6", "E6", "G6"], 0.05, 0.13, 0.12),
  grow: arpeggio("pulse25", ["C5", "G5", "D5", "A5", "E5", "B5", "F#5", "C#6", "G6"], 0.045, 0.14),
  shrink: arpeggio("pulse25", ["G6", "C#6", "F#5", "B5", "E5", "A5", "D5", "G5", "C5"], 0.045, 0.14),
  oneUp: arpeggio("pulse25", ["C6", "E6", "G6", "C7", "G6", "C7"], 0.075, 0.14, 0.2),
  flagSlide: [[0, { wave: "pulse12", freq: 1400, slideTo: 260, duration: 1.1, volume: 0.12 }]],
  tally: [[0, { wave: "pulse50", freq: 1320, duration: 0.03, volume: 0.08 }]],
  hurry: arpeggio("pulse25", ["A5", "E6", "A5", "E6", "A5", "E6"], 0.07, 0.13),
  pause: [
    [0, { wave: "pulse50", freq: n("E6"), duration: 0.06, volume: 0.12 }],
    [0.1, { wave: "pulse50", freq: n("B5"), duration: 0.06, volume: 0.12 }],
    [0.2, { wave: "pulse50", freq: n("E6"), duration: 0.1, volume: 0.12 }],
  ],
};

export function playSfx(ctx: BaseAudioContext, dest: AudioNode, id: Sfx): void {
  const t = ctx.currentTime + 0.005;
  for (const [offset, tone] of EFFECTS[id]) playTone(ctx, dest, { ...tone, start: t + offset });
}
