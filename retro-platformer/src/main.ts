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
  let game: Game | null = null;
  const display = new Display(canvas, (w) => game?.setViewWidth(w));
  const g = new Game(levels, display.viewWidth, loadHighScore());
  game = g;
  let savedHighScore = g.highScore;

  const audio = new AudioEngine();
  const unlock = (): void => audio.unlock();
  for (const type of ["touchstart", "touchend", "pointerdown", "keydown", "click"]) {
    window.addEventListener(type, unlock, { passive: true });
  }

  attachTouch(hub, touchRoot, () => (g.touchMode = true));

  const pauseIfPlaying = (): void => {
    if (g.mode === "play") g.requestPause();
  };
  document.addEventListener("visibilitychange", () => {
    audio.setHidden(document.hidden);
    hub.releaseAll();
    if (document.hidden) pauseIfPlaying();
  });
  window.addEventListener("blur", pauseIfPlaying);

  window.__sproutQuest = {
    snapshot: () => ({
      mode: g.mode,
      phase: g.world?.phase ?? null,
      level: g.session.levelIndex,
      score: g.session.score,
      coins: g.session.coins,
      lives: g.session.lives,
      player: g.world ? { x: g.world.player.x, y: g.world.player.y, form: g.world.player.form } : null,
    }),
  };

  if (import.meta.env.DEV) devWarp(g, levels);

  runLoop(
    () => {
      const c = hub.sample();
      if (c.mutePressed) audio.toggleMute();
      g.step(c);
      for (const e of g.events) audio.handle(e);
      g.events.length = 0;
      if (g.highScore > savedHighScore && g.mode !== "play") {
        savedHighScore = g.highScore;
        saveHighScore(savedHighScore);
      }
    },
    (alpha) => {
      renderer.render(display.ctx, g, display.viewWidth, alpha);
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
