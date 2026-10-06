import type { Controls } from "../core/input";
import type { LevelData } from "../world/level";
import { RULES } from "../tuning";
import type { GameEvent } from "./events";
import { hitsGodBlock } from "./godBlock";
import { newSession, type Session } from "./session";
import { World } from "./world";

export type Mode = "title" | "intro" | "play" | "paused" | "gameOver" | "ending";

/** Frames before the ending screen accepts a button press. */
const ENDING_LOCK_FRAMES = 180;

/** Top-level flow: title, level intro cards, play, pause, game over and the ending. */
export class Game {
  mode: Mode = "title";
  /** Frames spent in the current mode. */
  timer = 0;
  session: Session = newSession();
  world: World | null = null;
  /** The first level, shown frozen behind the title screen. */
  backdrop: World;
  highScore: number;
  /** Set once any touch input is seen; switches on-screen hints. */
  touchMode = false;
  /** God mode, toggled by the title screen's hidden block; applies to the next run started. */
  godMode = false;
  /** {@link timer} value when God mode was last toggled (drives the block's flash), or null. */
  godToggledAt: number | null = null;
  readonly events: GameEvent[] = [];
  private viewWidth: number;

  constructor(
    private readonly levels: readonly LevelData[],
    viewWidth: number,
    highScore: number,
  ) {
    if (levels.length === 0) throw new Error("Game needs at least one level");
    this.viewWidth = viewWidth;
    this.highScore = highScore;
    this.backdrop = new World(levels[0]!, newSession(), viewWidth);
    this.events.push({ type: "music", song: "title" });
  }

  get levelCount(): number {
    return this.levels.length;
  }

  get currentLevel(): LevelData {
    return this.levels[Math.min(this.session.levelIndex, this.levels.length - 1)]!;
  }

  setViewWidth(width: number): void {
    this.viewWidth = width;
    this.world?.setViewWidth(width);
    this.backdrop.setViewWidth(width);
  }

  step(c: Controls): void {
    this.timer++;
    switch (this.mode) {
      case "title":
        // Animate the backdrop (drifting clouds, shimmering blocks) without simulating it.
        this.backdrop.frame++;
        if (c.startPressed || c.jumpPressed) {
          this.session = newSession(this.godMode);
          this.enter("intro");
          this.events.push({ type: "music", song: null });
        }
        break;
      case "intro":
        if (this.timer >= RULES.levelIntroFrames) {
          this.world = new World(this.currentLevel, this.session, this.viewWidth);
          this.enter("play");
        }
        break;
      case "play":
        this.stepPlay(c);
        break;
      case "paused":
        if (c.startPressed) {
          this.mode = "play";
          this.events.push({ type: "pause", paused: false });
        }
        break;
      case "gameOver":
        if (this.timer >= RULES.gameOverFrames) this.toTitle();
        break;
      case "ending":
        if (this.timer >= ENDING_LOCK_FRAMES && (c.startPressed || c.jumpPressed)) this.toTitle();
        break;
    }
  }

  /**
   * A tap or click at (x, y) in logical view coordinates. On the title screen,
   * hitting the lone block toggles God mode. Returns whether the tap was used.
   */
  tap(x: number, y: number): boolean {
    if (this.mode !== "title" || !hitsGodBlock(this.viewWidth, x, y)) return false;
    this.godMode = !this.godMode;
    this.godToggledAt = this.timer;
    this.events.push({ type: "sfx", id: this.godMode ? "oneUp" : "bump" });
    return true;
  }

  /** Pauses from outside the simulation (the page was hidden or lost focus). */
  requestPause(): void {
    if (this.mode === "play" && this.world && this.canPause(this.world)) this.pause();
  }

  private canPause(world: World): boolean {
    return world.phase === "play" || world.phase === "transform";
  }

  private pause(): void {
    this.mode = "paused";
    this.events.push({ type: "sfx", id: "pause" }, { type: "pause", paused: true });
  }

  private stepPlay(c: Controls): void {
    const world = this.world!;
    if (c.startPressed && this.canPause(world)) {
      this.pause();
      return;
    }
    world.step(c);
    this.events.push(...world.events);
    world.events.length = 0;
    this.highScore = Math.max(this.highScore, this.session.score);

    if (world.outcome === "dead") {
      this.session.lives--;
      if (this.session.lives <= 0) {
        this.world = null;
        this.enter("gameOver");
        this.events.push({ type: "music", song: "gameOver" });
      } else {
        this.world = null;
        this.enter("intro");
      }
    } else if (world.outcome === "cleared") {
      this.session.levelIndex++;
      this.session.checkpoint = -1;
      if (this.session.levelIndex >= this.levels.length) {
        this.session.levelIndex = this.levels.length - 1;
        this.world = null;
        this.enter("ending");
        this.events.push({ type: "music", song: "ending" });
      } else {
        this.world = null;
        this.enter("intro");
      }
    }
  }

  private toTitle(): void {
    this.world = null;
    this.enter("title");
    this.events.push({ type: "music", song: "title" });
  }

  private enter(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }
}
