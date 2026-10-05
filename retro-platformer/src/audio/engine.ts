import type { GameEvent, Song as SongId } from "../game/events";
import { Sequencer } from "./sequencer";
import { playSfx } from "./sfx";
import { getSong } from "./songs";

const MUTE_KEY = "sprout-quest:muted";

type AudioContextCtor = typeof AudioContext;

/**
 * Owns the AudioContext. Browsers (iOS Safari especially) only allow audio
 * after a user gesture, so the context is created and resumed from
 * {@link unlock}, which main wires to the first touch, click or key press.
 * Events that arrive before then still update the current song, which starts
 * as soon as audio is unlocked.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private sequencer: Sequencer | null = null;
  private currentSong: SongId | null = null;
  private musicPaused = false;
  private tempo = 1;
  muted: boolean;

  constructor() {
    this.muted = readMuted();
  }

  /** Must be called from inside a user-gesture handler. */
  unlock(): void {
    const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    // Play through the iOS ring/silent switch, like a game should.
    if (audioSession) audioSession.type = "playback";
    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.sequencer = new Sequencer(ctx, this.music);
      if (this.currentSong) this.startSong(this.currentSong);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  /** Suspends the context while the page is hidden. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  handle(event: GameEvent): void {
    switch (event.type) {
      case "sfx":
        if (this.ctx && this.sfx && this.ctx.state === "running") playSfx(this.ctx, this.sfx, event.id);
        break;
      case "music":
        this.currentSong = event.song;
        this.musicPaused = false;
        this.tempo = 1;
        this.startSong(event.song);
        break;
      case "tempo":
        this.tempo = event.scale;
        this.sequencer?.setTempo(event.scale);
        break;
      case "pause":
        this.musicPaused = event.paused;
        if (event.paused) this.sequencer?.pause();
        else this.sequencer?.resume();
        if (this.music && this.ctx) this.music.gain.setTargetAtTime(event.paused ? 0 : 1, this.ctx.currentTime, 0.015);
        break;
    }
  }

  /** Schedules upcoming music; call every frame. */
  pump(): void {
    if (this.ctx?.state === "running") this.sequencer?.pump();
  }

  private startSong(id: SongId | null): void {
    if (!this.sequencer || !this.music || !this.ctx) return;
    this.sequencer.play(id ? getSong(id) : null);
    this.sequencer.setTempo(this.tempo);
    if (this.musicPaused) this.sequencer.pause();
    this.music.gain.setValueAtTime(this.musicPaused ? 0 : 1, this.ctx.currentTime);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode, file://); muting still works for this session.
  }
}
