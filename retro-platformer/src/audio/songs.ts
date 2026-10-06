import type { Song as SongId } from "../game/events";
import { compileSong, type Song, type SongSpec } from "./notation";

/** Original compositions for Bud's Takeover. One bar per string, 16 sixteenths each. */
const SPECS: Readonly<Record<SongId, SongSpec>> = {
  title: {
    bpm: 120,
    loop: true,
    chords: ["G", "C", "D", "G", "Em", "C", "D", "D"],
    melody: {
      wave: "pulse25",
      volume: 0.16,
      bars: [
        "D5/2 G5/2 B5/4 D6/4 B5/4",
        "C6/4 E6/4 G5/4 C6/4",
        "A5/2 B5/2 C6/2 D6/2 F#5/4 A5/4",
        "G5/8 D5/4 G5/4",
        "E5/2 G5/2 B5/4 E6/4 D6/4",
        "C6/2 B5/2 A5/4 G5/4 E5/4",
        "F#5/2 G5/2 A5/2 B5/2 C6/4 A5/4",
        "D6/8 -/4 D5/4",
      ],
    },
    harmony: { wave: "pulse12", volume: 0.07, pattern: "R/4 T/4 F/4 T/4", octave: 4 },
    bass: { volume: 0.32, pattern: "R/4 F/4 O/4 F/4", octave: 2 },
  },

  street: {
    bpm: 140,
    loop: true,
    chords: ["C", "Am", "F", "G", "C", "Am", "F", "C", "F", "G", "Em", "Am", "F", "G", "C", "G"],
    melody: {
      wave: "pulse25",
      volume: 0.15,
      bars: [
        "E5/2 G5/2 C6/4 B5/2 G5/2 E5/4",
        "A5/2 C6/2 E6/4 D6/2 C6/2 A5/4",
        "F5/2 A5/2 C6/2 A5/2 G5/4 F5/4",
        "G5/2 B5/2 D6/2 B5/2 G5/2 A5/2 B5/4",
        "C6/4 E6/2 C6/2 G5/4 E5/4",
        "A5/2 B5/2 C6/2 E6/2 D6/4 C6/4",
        "A5/2 F5/2 A5/2 C6/2 B5/2 G5/2 D6/4",
        "C6/6 -/2 G5/2 E5/2 C5/4",
        "A5/4 C6/4 F6/4 E6/4",
        "D6/2 C6/2 B5/4 G5/4 B5/4",
        "G5/4 B5/4 E6/4 D6/4",
        "C6/2 B5/2 A5/4 E5/4 A5/4",
        "F5/2 A5/2 C6/4 F6/2 E6/2 C6/4",
        "D6/2 B5/2 G5/4 A5/2 B5/2 D6/4",
        "E6/4 D6/2 C6/2 G5/4 E5/4",
        "C6/4 -/4 G5/2 B5/2 D6/4",
      ],
    },
    harmony: { wave: "pulse12", volume: 0.06, pattern: "-/2 T/2 -/2 F/2 -/2 T/2 -/2 F/2", octave: 4 },
    bass: { volume: 0.34, pattern: "R/4 R/2 F/2 R/4 F/4", octave: 2 },
    drums: { volume: 0.18, pattern: "k/2 h/2 s/2 h/2 k/2 k/2 s/2 h/2" },
  },

  downtown: {
    bpm: 112,
    loop: true,
    chords: ["Am", "Am", "F", "E", "Am", "G", "F", "E"],
    melody: {
      wave: "pulse50",
      volume: 0.11,
      bars: [
        "A4/4 -/2 C5/2 E5/4 -/4",
        "D5/2 C5/2 B4/4 A4/4 -/4",
        "F4/4 -/2 A4/2 C5/4 -/4",
        "B4/2 C5/2 B4/2 G#4/2 E4/8",
        "A4/2 B4/2 C5/4 E5/4 A5/4",
        "G5/4 F5/2 E5/2 D5/8",
        "C5/4 D5/2 E5/2 F5/4 A5/4",
        "G#5/4 E5/4 B4/4 -/4",
      ],
    },
    harmony: { wave: "pulse12", volume: 0.05, pattern: "-/4 F/2 -/6 T/2 -/2", octave: 4 },
    bass: { volume: 0.36, pattern: "R/2 O/2 R/2 O/2 R/2 O/2 R/2 O/2", octave: 2 },
    drums: { volume: 0.12, pattern: "k/4 -/2 h/2 s/4 -/2 h/2" },
  },

  park: {
    bpm: 128,
    loop: true,
    chords: ["D", "Bm", "G", "A", "D", "F#m", "G", "A", "Em", "G", "D", "A", "G", "A", "D", "D"],
    melody: {
      wave: "pulse25",
      volume: 0.14,
      bars: [
        "F#5/3 E5/1 D5/4 A5/4 F#5/4",
        "B5/3 A5/1 F#5/4 D5/4 B4/4",
        "D5/3 E5/1 G5/4 B5/4 A5/2 G5/2",
        "A5/6 E5/2 C#5/4 A4/4",
        "F#5/3 G5/1 A5/4 D6/4 A5/4",
        "C#6/3 B5/1 A5/4 F#5/4 C#5/4",
        "B5/3 A5/1 G5/4 E5/4 G5/4",
        "A5/8 -/4 E5/2 G5/2",
        "G5/4 F#5/2 E5/2 B5/4 G5/4",
        "D6/4 B5/2 G5/2 A5/4 B5/4",
        "A5/3 F#5/1 D5/4 F#5/4 A5/4",
        "E5/4 C#5/2 E5/2 A5/8",
        "B5/2 D6/2 B5/2 G5/2 A5/4 B5/4",
        "C#6/4 A5/4 E5/4 C#6/4",
        "D6/6 A5/2 F#5/4 A5/4",
        "D6/8 -/8",
      ],
    },
    harmony: { wave: "pulse12", volume: 0.06, pattern: "R/3 T/3 F/2 O/3 F/3 T/2", octave: 4 },
    bass: { volume: 0.34, pattern: "R/6 F/2 O/4 F/4", octave: 2 },
    drums: { volume: 0.14, pattern: "k/4 h/2 h/2 s/4 h/2 h/2" },
  },

  construction: {
    bpm: 150,
    loop: true,
    chords: ["Em", "Em", "C", "D", "Em", "Em", "C", "B"],
    melody: {
      wave: "pulse50",
      volume: 0.12,
      bars: [
        "E5/2 E5/2 G5/2 E5/2 B5/4 A5/4",
        "G5/2 F#5/2 E5/2 D5/2 E5/8",
        "C5/2 E5/2 G5/2 C6/2 B5/4 G5/4",
        "A5/2 F#5/2 D5/2 F#5/2 A5/4 D6/4",
        "B5/4 G5/2 E5/2 B5/2 C6/2 B5/4",
        "A5/2 G5/2 F#5/2 G5/2 E5/8",
        "E5/2 G5/2 C6/4 D6/2 C6/2 G5/4",
        "D#6/4 B5/4 F#5/4 D#5/4",
      ],
    },
    harmony: { wave: "pulse25", volume: 0.05, pattern: "R/2 F/2 R/2 F/2 T/2 F/2 T/2 F/2", octave: 4 },
    bass: { volume: 0.36, pattern: "R/2 R/2 O/2 R/2 R/2 O/2 R/2 F/2", octave: 2 },
    drums: { volume: 0.18, pattern: "k/2 h/2 s/2 h/2 k/2 h/2 s/2 s/2" },
  },

  clear: {
    bpm: 150,
    loop: false,
    chords: ["C", "G", "C"],
    melody: {
      wave: "pulse25",
      volume: 0.16,
      bars: ["C5/2 E5/2 G5/2 C6/2 E6/2 G6/2 E6/4", "F6/2 D6/2 B5/2 G5/2 D6/4 B5/4", "C6/12 -/4"],
    },
    harmony: { wave: "pulse12", volume: 0.07, pattern: "R/2 T/2 F/2 T/2 R/2 T/2 F/4", octave: 4 },
    bass: { volume: 0.34, pattern: "R/4 F/4 O/4 R/4", octave: 2 },
  },

  death: {
    bpm: 120,
    loop: false,
    chords: ["Am", "E"],
    melody: { wave: "pulse25", volume: 0.16, bars: ["E6/2 C6/2 A5/2 E5/2 F5/4 E5/4", "D5/2 C5/2 B4/4 A4/8"] },
    bass: { volume: 0.32, pattern: "R/8 F/8", octave: 2 },
  },

  gameOver: {
    bpm: 90,
    loop: false,
    chords: ["Am", "F", "E", "Am"],
    melody: { wave: "pulse50", volume: 0.12, bars: ["A4/4 C5/4 E5/4 D5/4", "C5/4 A4/4 F4/8", "G#4/4 B4/4 E4/8", "A4/16"] },
    bass: { volume: 0.32, pattern: "R/8 F/8", octave: 2 },
  },

  ending: {
    bpm: 110,
    loop: true,
    chords: ["C", "Am", "F", "G", "C", "Am", "F", "C"],
    melody: {
      wave: "pulse12",
      volume: 0.15,
      bars: [
        "E5/2 G5/2 C6/4 B5/2 G5/2 E5/4",
        "A5/2 C6/2 E6/4 D6/2 C6/2 A5/4",
        "F5/2 A5/2 C6/2 A5/2 G5/4 F5/4",
        "G5/2 B5/2 D6/2 B5/2 G5/2 A5/2 B5/4",
        "C6/4 E6/2 C6/2 G5/4 E5/4",
        "A5/2 B5/2 C6/2 E6/2 D6/4 C6/4",
        "A5/2 F5/2 A5/2 C6/2 B5/2 G5/2 D6/4",
        "C6/12 -/4",
      ],
    },
    harmony: { wave: "triangle", volume: 0.12, pattern: "R/2 T/2 F/2 O/2 F/2 T/2 R/4", octave: 4 },
    bass: { volume: 0.3, pattern: "R/8 F/8", octave: 2 },
  },
};

const cache = new Map<SongId, Song>();

export function getSong(id: SongId): Song {
  let song = cache.get(id);
  if (!song) {
    song = compileSong(SPECS[id]);
    cache.set(id, song);
  }
  return song;
}
