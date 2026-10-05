import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { Game } from "../src/game/game";
import { loadLevels } from "../src/levels";
import { RULES } from "../src/tuning";

const ctl = (over: Partial<Controls> = {}): Controls => ({ ...NO_CONTROLS, ...over });
const levels = loadLevels();

function startPlaying(): Game {
  const g = new Game(levels, 640, 0);
  g.step(ctl({ startPressed: true }));
  expect(g.mode).toBe("intro");
  for (let i = 0; i < RULES.levelIntroFrames; i++) g.step(ctl());
  expect(g.mode).toBe("play");
  return g;
}

/** Runs until the current world reports an outcome (or a mode change ends play). */
function runUntilOutcome(g: Game, c: Controls = ctl(), limit = 20_000): void {
  for (let i = 0; i < limit && g.mode === "play"; i++) g.step(c);
}

describe("game flow", () => {
  it("starts on the title with title music", () => {
    const g = new Game(levels, 640, 1234);
    expect(g.mode).toBe("title");
    expect(g.highScore).toBe(1234);
    expect(g.events).toContainEqual({ type: "music", song: "title" });
  });

  it("animates the title backdrop without simulating it", () => {
    const g = new Game(levels, 640, 0);
    const x = g.backdrop.player.x;
    for (let i = 0; i < 10; i++) g.step(ctl({ right: true }));
    expect(g.backdrop.frame).toBe(10);
    expect(g.backdrop.player.x).toBe(x);
  });

  it("jump also starts the game from the title", () => {
    const g = new Game(levels, 640, 0);
    g.step(ctl({ jumpPressed: true }));
    expect(g.mode).toBe("intro");
  });

  it("losing a life returns to the intro card with one fewer life", () => {
    const g = startPlaying();
    g.world!.player.y = 10_000; // into the pit
    runUntilOutcome(g);
    expect(g.mode).toBe("intro");
    expect(g.session.lives).toBe(RULES.startLives - 1);
    expect(g.world).toBeNull();
  });

  it("losing the last life is game over, then back to the title", () => {
    const g = startPlaying();
    g.session.lives = 1;
    g.world!.player.y = 10_000;
    runUntilOutcome(g);
    expect(g.mode).toBe("gameOver");
    expect(g.events).toContainEqual({ type: "music", song: "gameOver" });
    for (let i = 0; i < RULES.gameOverFrames; i++) g.step(ctl());
    expect(g.mode).toBe("title");
  });

  it("clearing a level advances to the next and resets the checkpoint", () => {
    const g = startPlaying();
    g.session.checkpoint = 0;
    g.world!.phase = "cleared";
    g.step(ctl());
    expect(g.mode).toBe("intro");
    expect(g.session.levelIndex).toBe(1);
    expect(g.session.checkpoint).toBe(-1);
  });

  it("clearing the last level shows the ending, which returns to the title", () => {
    const g = startPlaying();
    g.session.levelIndex = levels.length - 1;
    g.world!.phase = "cleared";
    g.step(ctl());
    expect(g.mode).toBe("ending");
    g.step(ctl({ startPressed: true }));
    expect(g.mode).toBe("ending"); // locked briefly so a held button doesn't skip it
    for (let i = 0; i < 200; i++) g.step(ctl());
    g.step(ctl({ startPressed: true }));
    expect(g.mode).toBe("title");
  });

  it("start pauses and resumes; the world does not advance while paused", () => {
    const g = startPlaying();
    g.step(ctl({ startPressed: true }));
    expect(g.mode).toBe("paused");
    expect(g.events).toContainEqual({ type: "pause", paused: true });
    const frame = g.world!.frame;
    for (let i = 0; i < 30; i++) g.step(ctl({ right: true }));
    expect(g.world!.frame).toBe(frame);
    g.step(ctl({ startPressed: true }));
    expect(g.mode).toBe("play");
  });

  it("requestPause only pauses during active play", () => {
    const title = new Game(levels, 640, 0);
    title.requestPause();
    expect(title.mode).toBe("title");
    const g = startPlaying();
    g.requestPause();
    expect(g.mode).toBe("paused");
  });

  it("forwards world events and tracks the high score", () => {
    const g = startPlaying();
    g.events.length = 0;
    g.step(ctl({ jump: true, jumpPressed: true }));
    expect(g.events).toContainEqual({ type: "sfx", id: "jump" });
    g.session.score = 5000;
    g.step(ctl());
    expect(g.highScore).toBe(5000);
  });

  it("view width changes reach the live world and the title backdrop", () => {
    const g = startPlaying();
    g.setViewWidth(900);
    expect(g.world!.camera.width).toBe(900);
    expect(g.backdrop.camera.width).toBe(900);
  });
});
