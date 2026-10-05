/**
 * Compact music notation, compiled to timed note events.
 *
 * A phrase is space-separated tokens `PITCH/LEN`, where LEN is in sixteenth
 * notes and PITCH is a note name with octave (`C5`, `F#4`, `Bb3`), `-` for a
 * rest, or a drum letter on noise tracks (`k` kick, `s` snare, `h` hat).
 *
 * Accompaniment patterns use chord degrees instead of pitches: `R` root,
 * `T` third, `F` fifth, `O` root an octave up; e.g. `R/4 F/4 O/4 F/4`.
 */

export type Wave = "pulse12" | "pulse25" | "pulse50" | "triangle" | "noise";
export type Drum = "k" | "s" | "h";

export interface NoteEvent {
  /** Start, in sixteenth notes from the start of the track. */
  readonly at: number;
  readonly len: number;
  /** Frequency in Hz; drums use their own voicing. */
  readonly freq: number;
  readonly drum?: Drum;
}

export interface Track {
  readonly wave: Wave;
  readonly volume: number;
  readonly events: readonly NoteEvent[];
  /** Total length in sixteenth notes. */
  readonly length: number;
}

export interface Song {
  readonly bpm: number;
  readonly loop: boolean;
  readonly tracks: readonly Track[];
}

const SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number for names like "C4", "F#5", "Bb3". */
export function midiOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note '${name}'`);
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + SEMITONE[m[1]!]! + accidental;
}

export function freqOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Token {
  sym: string;
  len: number;
}

function tokens(phrase: string): Token[] {
  return phrase
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => {
      const [sym, len] = t.split("/");
      const n = Number(len);
      if (!sym || !Number.isInteger(n) || n <= 0) throw new Error(`bad token '${t}'`);
      return { sym, len: n };
    });
}

/** Total length of a phrase in sixteenths. */
export function phraseLength(phrase: string): number {
  return tokens(phrase).reduce((sum, t) => sum + t.len, 0);
}

/** Compiles a melodic or drum phrase, starting at `offset`. */
export function compilePhrase(phrase: string, offset = 0): NoteEvent[] {
  const out: NoteEvent[] = [];
  let at = offset;
  for (const t of tokens(phrase)) {
    if (t.sym === "k" || t.sym === "s" || t.sym === "h") out.push({ at, len: t.len, freq: 0, drum: t.sym });
    else if (t.sym !== "-") out.push({ at, len: t.len, freq: freqOf(midiOf(t.sym)) });
    at += t.len;
  }
  return out;
}

/** Root MIDI note (octave 0-relative semitone) and intervals for chord symbols like "C", "Am", "F#m", "B7". */
export function chordTones(symbol: string): { root: number; third: number; fifth: number } {
  const m = /^([A-G])([#b]?)(m|7|dim)?$/.exec(symbol);
  if (!m) throw new Error(`bad chord '${symbol}'`);
  const root = (SEMITONE[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  const minor = m[3] === "m" || m[3] === "dim";
  return { root, third: minor ? 3 : 4, fifth: m[3] === "dim" ? 6 : 7 };
}

/**
 * Renders an accompaniment pattern over one bar of a chord. `octave` is the
 * octave of the root; thirds and fifths sit above it.
 */
export function compilePattern(pattern: string, chord: string, octave: number, offset = 0): NoteEvent[] {
  const { root, third, fifth } = chordTones(chord);
  const base = (octave + 1) * 12 + root;
  const out: NoteEvent[] = [];
  let at = offset;
  for (const t of tokens(pattern)) {
    const step = { R: 0, T: third, F: fifth, O: 12 }[t.sym];
    if (t.sym !== "-") {
      if (step === undefined) throw new Error(`bad pattern symbol '${t.sym}'`);
      out.push({ at, len: t.len, freq: freqOf(base + step) });
    }
    at += t.len;
  }
  return out;
}

export interface SongSpec {
  readonly bpm: number;
  readonly loop: boolean;
  /** Sixteenths per bar (16 for 4/4). */
  readonly barLength?: number;
  /** One chord symbol per bar. */
  readonly chords: readonly string[];
  readonly melody: { readonly wave: Wave; readonly volume: number; readonly bars: readonly string[] };
  readonly harmony?: { readonly wave: Wave; readonly volume: number; readonly pattern: string; readonly octave: number };
  readonly bass?: { readonly volume: number; readonly pattern: string; readonly octave: number };
  /** Drum bar repeated across the song. */
  readonly drums?: { readonly volume: number; readonly pattern: string };
}

/** Compiles a song spec, validating that every bar has the right length. */
export function compileSong(spec: SongSpec): Song {
  const bar = spec.barLength ?? 16;
  const bars = spec.chords.length;
  if (spec.melody.bars.length !== bars) throw new Error(`melody has ${spec.melody.bars.length} bars, chords have ${bars}`);
  const check = (phrase: string, what: string): void => {
    const len = phraseLength(phrase);
    if (len !== bar) throw new Error(`${what} is ${len} sixteenths, expected ${bar}`);
  };
  const length = bars * bar;
  const tracks: Track[] = [];

  const melody: NoteEvent[] = [];
  spec.melody.bars.forEach((phrase, i) => {
    check(phrase, `melody bar ${i + 1}`);
    melody.push(...compilePhrase(phrase, i * bar));
  });
  tracks.push({ wave: spec.melody.wave, volume: spec.melody.volume, events: melody, length });

  if (spec.harmony) {
    const h = spec.harmony;
    check(h.pattern, "harmony pattern");
    const events = spec.chords.flatMap((c, i) => compilePattern(h.pattern, c, h.octave, i * bar));
    tracks.push({ wave: h.wave, volume: h.volume, events, length });
  }
  if (spec.bass) {
    const b = spec.bass;
    check(b.pattern, "bass pattern");
    const events = spec.chords.flatMap((c, i) => compilePattern(b.pattern, c, b.octave, i * bar));
    tracks.push({ wave: "triangle", volume: b.volume, events, length });
  }
  if (spec.drums) {
    const d = spec.drums;
    check(d.pattern, "drum pattern");
    const events = spec.chords.flatMap((_, i) => compilePhrase(d.pattern, i * bar));
    tracks.push({ wave: "noise", volume: d.volume, events, length });
  }
  return { bpm: spec.bpm, loop: spec.loop, tracks };
}
