import { AudioEngine } from "./audio/engine";
import { Display } from "./core/display";
import { InputHub, attachKeyboard } from "./core/input";
import { runLoop } from "./core/loop";
import { attachTouch } from "./core/touch";
import { Game } from "./game/game";
import { bakeAssets } from "./gfx/assets";
import { loadLevels } from "./levels";
import { Renderer } from "./render/renderer";
import { World } from "./game/world";
import type { LevelData } from "./world/level";
import { TILE } from "./tuning";

const HIGH_SCORE_KEY = "sprout-quest:high-score";

function loadHighScore(): number {
  try {
    const n = Number(localStorage.getItem(HIGH_SCORE_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // Storage may be unavailable (private browsing, file://); the score just won't persist.
  }
}

/** Read-only state for automated tests and debugging. */
export interface Snapshot {
  mode: Game["mode"];
  /** Logical view width in pixels (32 per tile). */
  viewWidth: number;
  phase: string | null;
  level: number;
  score: number;
  coins: number;
  lives: number;
  player: { x: number; y: number; form: string } | null;
}

declare global {
  interface Window {
    __sproutQuest?: { snapshot(): Snapshot };
  }
}

function start(): void {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const touchRoot = document.getElementById("touch")!;
  const hub = new InputHub();
  attachKeyboard(hub);

  const levels = loadLevels();
  const renderer = new Renderer(bakeAssets());
  // The display reports its first width during construction, before the game exists.
  let g: Game | undefined;
  const display = new Display(canvas, (w) => g?.setViewWidth(w));
  const game = new Game(levels, display.viewWidth, loadHighScore());
  g = game;
  let savedHighScore = game.highScore;
  const persistHighScore = (): void => {
    if (game.highScore > savedHighScore) {
      savedHighScore = game.highScore;
      saveHighScore(savedHighScore);
    }
  };

  const audio = new AudioEngine();
  const unlock = (): void => audio.unlock();
  for (const type of ["touchstart", "touchend", "pointerdown", "keydown", "click"]) {
    window.addEventListener(type, unlock, { passive: true });
  }

  attachTouch(hub, touchRoot, () => (game.touchMode = true));

  document.addEventListener("visibilitychange", () => {
    audio.setHidden(document.hidden);
    hub.releaseAll();
    if (document.hidden) {
      game.requestPause();
      persistHighScore();
    }
  });
  window.addEventListener("blur", () => game.requestPause());

  window.__sproutQuest = {
    snapshot: () => ({
      mode: game.mode,
      viewWidth: display.viewWidth,
      phase: game.world?.phase ?? null,
      level: game.session.levelIndex,
      score: game.session.score,
      coins: game.session.coins,
      lives: game.session.lives,
      player: game.world ? { x: game.world.player.x, y: game.world.player.y, form: game.world.player.form } : null,
    }),
  };

  if (import.meta.env.DEV) devWarp(game, levels);

  runLoop(
    () => {
      const c = hub.sample();
      if (c.mutePressed) audio.toggleMute();
      game.step(c);
      for (const e of game.events) audio.handle(e);
      game.events.length = 0;
      // Persist between runs, not every frame of play.
      if (game.mode !== "play") persistHighScore();
    },
    (alpha) => {
      renderer.render(display.ctx, game, display.viewWidth, alpha, display.insets);
      display.present();
      audio.pump();
    },
  );
}

/**
 * Development only (stripped from production builds): `?level=2&x=40` jumps
 * straight into level 2 with the hero dropped at column 40.
 */
function devWarp(g: Game, levels: readonly LevelData[]): void {
  const params = new URLSearchParams(location.search);
  const level = params.get("level");
  if (level === null) return;
  const index = Math.min(levels.length, Math.max(1, Number(level))) - 1;
  g.session.levelIndex = index;
  g.world = new World(levels[index]!, g.session, g.backdrop.camera.width);
  g.mode = "play";
  const tx = Number(params.get("x") ?? NaN);
  if (Number.isFinite(tx)) {
    const p = g.world.player;
    p.x = p.prevX = tx * TILE;
    p.y = p.prevY = 0;
    g.world.camera.snapTo(p.x);
  }
}

start();
