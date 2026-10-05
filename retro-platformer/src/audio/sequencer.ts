import type { Song } from "./notation";
import { playDrum, playTone } from "./synth";

/** How far ahead of the audio clock notes are scheduled. */
const LOOKAHEAD = 0.15;

interface Cursor {
  /** Index of the next event in the track. */
  index: number;
  /** Loop pass the cursor is on. */
  pass: number;
}

/**
 * Look-ahead music scheduler. Call {@link pump} regularly (every frame);
 * notes are queued on the audio clock slightly ahead of time so timing stays
 * sample-accurate even when frames are late.
 */
export class Sequencer {
  private song: Song | null = null;
  private cursors: Cursor[] = [];
  /** Audio time at which sixteenth 0 of the current tempo segment falls. */
  private origin = 0;
  /** Sixteenth at which the current tempo segment started. */
  private originStep = 0;
  private tempo = 1;
  private pausedAt: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {}

  play(song: Song | null): void {
    this.song = song;
    this.cursors = song ? song.tracks.map(() => ({ index: 0, pass: 0 })) : [];
    this.origin = this.ctx.currentTime + 0.05;
    this.originStep = 0;
    this.tempo = 1;
    this.pausedAt = null;
  }

  private secondsPerStep(): number {
    return 60 / (this.song?.bpm ?? 120) / 4 / this.tempo;
  }

  private timeOf(step: number): number {
    return this.origin + (step - this.originStep) * this.secondsPerStep();
  }

  /** Changes playback speed from now on without a jump in position. */
  setTempo(scale: number): void {
    if (scale === this.tempo) return;
    const now = Math.max(this.ctx.currentTime, this.origin);
    const step = this.originStep + (now - this.origin) / this.secondsPerStep();
    this.tempo = scale;
    this.origin = now;
    this.originStep = step;
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = this.ctx.currentTime;
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.origin += this.ctx.currentTime - this.pausedAt;
    this.pausedAt = null;
  }

  pump(): void {
    const song = this.song;
    if (!song || this.pausedAt !== null) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let finished = 0;
    song.tracks.forEach((track, i) => {
      const cur = this.cursors[i]!;
      for (;;) {
        if (cur.index >= track.events.length) {
          if (!song.loop || track.events.length === 0) {
            finished++;
            return;
          }
          cur.index = 0;
          cur.pass++;
        }
        const ev = track.events[cur.index]!;
        const step = cur.pass * track.length + ev.at;
        const start = this.timeOf(step);
        if (start > horizon) return;
        cur.index++;
        // Never schedule into the past (after a stall), just skip the note.
        if (start < this.ctx.currentTime - 0.01) continue;
        const duration = ev.len * this.secondsPerStep();
        if (ev.drum) playDrum(this.ctx, this.dest, ev.drum, start, track.volume);
        else playTone(this.ctx, this.dest, { wave: track.wave, freq: ev.freq, start, duration, volume: track.volume, sustain: 0.8 });
      }
    });
    if (finished === song.tracks.length) this.song = null;
  }
}
