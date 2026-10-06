import { AudioEngine } from "./audio/engine";
import { Display } from "./core/display";
import { InputHub, attachKeyboard } from "./core/input";
import { FrameBudget } from "./core/frameBudget";
import { runLoop } from "./core/loop";
import { readStored, writeStored } from "./core/storage";
import { attachTouch } from "./core/touch";
import { Game } from "./game/game";
import { loadLevels } from "./levels";
import { Renderer } from "./render/renderer";
import { World } from "./game/world";
import type { LevelData } from "./world/level";
import { TILE } from "./tuning";

const HIGH_SCORE_KEY = "buds-takeover:high-score";
const LEGACY_HIGH_SCORE_KEY = "sprout-quest:high-score";

function loadHighScore(): number {
  const n = Number(readStored(HIGH_SCORE_KEY, LEGACY_HIGH_SCORE_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function saveHighScore(score: number): void {
  writeStored(HIGH_SCORE_KEY, String(score));
}

/** Read-only state for automated tests and debugging. */
export interface Snapshot {
  mode: Game["mode"];
  /** Device pixels per logical pixel the game is rendering at. */
  renderScale: number;
  /** Logical view width in pixels (32 per tile). */
  viewWidth: number;
  /** Where the logical view sits on the canvas, in canvas pixels. */
  placement: { x: number; y: number; scale: number };
  phase: string | null;
  level: number;
  score: number;
  coins: number;
  lives: number;
  /** God mode as armed on the title screen, and whether the current run has it. */
  god: { armed: boolean; active: boolean };
  player: { x: number; y: number; form: string } | null;
}

declare global {
  interface Window {
    __budsTakeover?: { snapshot(): Snapshot };
  }
}

function start(): void {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const touchRoot = document.getElementById("touch")!;
  const hub = new InputHub();
  attachKeyboard(hub);

  const levels = loadLevels();
  const renderer = new Renderer();
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

  // Taps and clicks on the picture (mouse or finger; pointer events still fire under the touch overlay).
  window.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const p = display.placement;
    const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
    game.tap((px - p.x) / p.scale, (py - p.y) / p.scale);
  });

  document.addEventListener("visibilitychange", () => {
    audio.setHidden(document.hidden);
    hub.releaseAll();
    if (document.hidden) {
      game.requestPause();
      persistHighScore();
    }
  });
  window.addEventListener("blur", () => game.requestPause());

  window.__budsTakeover = {
    snapshot: () => ({
      mode: game.mode,
      renderScale: display.placement.scale,
      viewWidth: display.viewWidth,
      placement: { x: display.placement.x, y: display.placement.y, scale: display.placement.scale },
      phase: game.world?.phase ?? null,
      level: game.session.levelIndex,
      score: game.session.score,
      coins: game.session.coins,
      lives: game.session.lives,
      god: { armed: game.godMode, active: game.session.god },
      player: game.world ? { x: game.world.player.x, y: game.world.player.y, form: game.world.player.form } : null,
    }),
  };

  if (import.meta.env.DEV) devWarp(game, levels);
  const budget = new FrameBudget();

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
    (alpha, interval) => {
      const lower = budget.record(interval);
      if (lower !== null) display.limitDensity(lower);
      renderer.render(game, {
        ctx: display.ctx,
        placement: display.placement,
        canvasWidth: display.ctx.canvas.width,
        canvasHeight: display.ctx.canvas.height,
        viewW: display.viewWidth,
        insets: display.insets,
        alpha,
      });
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
