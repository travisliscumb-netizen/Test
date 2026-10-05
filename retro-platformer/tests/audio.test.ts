import { describe, expect, it } from "vitest";
import { chordTones, compilePattern, compilePhrase, compileSong, freqOf, midiOf, phraseLength } from "../src/audio/notation";
import { getSong } from "../src/audio/songs";
import { SONGS } from "../src/game/events";

describe("notation", () => {
  it("parses note names", () => {
    expect(midiOf("A4")).toBe(69);
    expect(midiOf("C4")).toBe(60);
    expect(midiOf("F#5")).toBe(78);
    expect(midiOf("Bb3")).toBe(58);
    expect(freqOf(69)).toBe(440);
    expect(() => midiOf("H2")).toThrow();
  });

  it("compiles phrases with rests and drums", () => {
    const ev = compilePhrase("C5/2 -/2 k/4", 16);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ at: 16, len: 2 });
    expect(ev[1]).toMatchObject({ at: 20, drum: "k" });
    expect(phraseLength("C5/2 -/2 k/4")).toBe(8);
  });

  it("builds chord tones", () => {
    expect(chordTones("Am")).toEqual({ root: 9, third: 3, fifth: 7 });
    expect(chordTones("F#")).toEqual({ root: 6, third: 4, fifth: 7 });
    const ev = compilePattern("R/4 T/4 F/4 O/4", "C", 3);
    expect(ev.map((e) => Math.round(e.freq))).toEqual([131, 165, 196, 262]);
  });

  it("rejects bars of the wrong length", () => {
    expect(() =>
      compileSong({ bpm: 120, loop: true, chords: ["C"], melody: { wave: "pulse25", volume: 1, bars: ["C5/4"] } }),
    ).toThrow(/sixteenths/);
  });
});

describe("songs", () => {
  it.each(SONGS)("'%s' compiles and all tracks are the same length", (id) => {
    const song = getSong(id);
    expect(song.tracks.length).toBeGreaterThan(0);
    const lengths = new Set(song.tracks.map((t) => t.length));
    expect(lengths.size).toBe(1);
    for (const t of song.tracks) {
      for (const e of t.events) {
        expect(e.at + e.len).toBeLessThanOrEqual(t.length);
        if (!e.drum) expect(e.freq).toBeGreaterThan(20);
      }
    }
  });

  it("level themes and the title loop; jingles do not", () => {
    for (const id of ["title", "meadow", "cavern", "dusk", "fortress", "ending"] as const) expect(getSong(id).loop).toBe(true);
    for (const id of ["clear", "death", "gameOver"] as const) expect(getSong(id).loop).toBe(false);
  });
});
