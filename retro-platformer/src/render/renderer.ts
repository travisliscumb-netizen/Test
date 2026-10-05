import type { Assets, ThemeAssets } from "../gfx/assets";
import type { Canvas } from "../gfx/bake";
import { INK, WHITE } from "../gfx/palette";
import { POLE_LEFT } from "../gfx/sprites/flag";
import { GOAL_HEIGHT } from "../gfx/sprites/goalTower";
import { TextRenderer } from "../gfx/text";
import { THEME_COLORS } from "../gfx/themes";
import { shellWaking, type Enemy } from "../entities/enemies";
import { DUST_FRAMES, type Effect } from "../entities/items";
import { playerPose } from "../entities/player";
import type { Game } from "../game/game";
import type { World } from "../game/world";
import { FLAG_TOP_ROW } from "../world/level";
import { Tile } from "../world/tiles";
import { RULES, TILE, VIEW_HEIGHT } from "../tuning";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** View pixels kept clear at the HUD's right end for the on-screen mute and pause buttons. */
const HUD_TOUCH_RESERVE = 150;

/** Draws the game into the low-resolution frame. */
export class Renderer {
  private readonly text = new TextRenderer();

  constructor(private readonly assets: Assets) {}

  render(ctx: CanvasRenderingContext2D, game: Game, viewW: number, alpha: number): void {
    ctx.imageSmoothingEnabled = false;
    switch (game.mode) {
      case "title":
        this.drawWorld(ctx, game.backdrop, viewW, 0, true);
        this.drawTitle(ctx, game, viewW);
        break;
      case "intro":
        this.drawIntro(ctx, game, viewW);
        break;
      case "play":
      case "paused":
        if (game.world) {
          this.drawWorld(ctx, game.world, viewW, game.mode === "paused" ? 1 : alpha, false);
          this.drawHud(ctx, game, game.world, viewW);
          if (game.mode === "paused") this.drawPaused(ctx, viewW);
        }
        break;
      case "gameOver":
        this.drawCard(ctx, viewW, ["GAME OVER"], game);
        break;
      case "ending":
        this.drawEnding(ctx, game, viewW);
        break;
    }
  }

  // ── world ───────────────────────────────────────────────────────────────

  drawWorld(ctx: CanvasRenderingContext2D, world: World, viewW: number, alpha: number, hidePlayer: boolean): void {
    const theme = this.assets.themes[world.level.theme];
    const cam = Math.round(world.camera.interpolated(alpha));
    this.drawBackground(ctx, theme, cam, viewW, world.frame);
    this.drawGoal(ctx, world, cam);
    for (const s of world.items) {
      if (s.state === "emerge") this.drawSprout(ctx, s, cam, alpha);
    }
    this.drawTiles(ctx, world, theme, cam, viewW);
    this.drawFlag(ctx, world, cam);
    for (const s of world.items) {
      if (s.state === "move") this.drawSprout(ctx, s, cam, alpha);
    }
    for (const e of world.enemies) this.drawEnemy(ctx, e, cam, alpha, world.frame);
    if (!hidePlayer && !world.playerHidden) this.drawPlayer(ctx, world, cam, alpha);
    for (const fx of world.effects) this.drawEffect(ctx, fx, theme, cam, alpha);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, theme: ThemeAssets, cam: number, viewW: number, frame: number): void {
    const bands = theme.sky;
    const bandH = Math.ceil(VIEW_HEIGHT / bands.length);
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, i * bandH, viewW, bandH);
    });
    for (const layer of theme.layers) {
      const w = layer.canvas.width;
      const offset = Math.round(cam * layer.factor + frame * layer.drift);
      let x = -(((offset % w) + w) % w);
      for (; x < viewW; x += w) ctx.drawImage(layer.canvas, x, layer.y);
    }
  }

  private drawTiles(ctx: CanvasRenderingContext2D, world: World, theme: ThemeAssets, cam: number, viewW: number): void {
    const map = world.map;
    const a = this.assets;
    const tx0 = Math.floor(cam / TILE);
    const tx1 = Math.floor((cam + viewW) / TILE);
    const shimmer = (["mystery0", "mystery1", "mystery2", "mystery1"] as const)[Math.floor(world.frame / 10) % 4]!;
    const coinFrame = (["coin0", "coin1", "coin2", "coin3"] as const)[Math.floor(world.frame / 8) % 4]!;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = map.get(tx, ty);
        if (id === Tile.Empty) continue;
        let img: Canvas;
        switch (id) {
          case Tile.Ground: {
            const top = ty === 0 || map.get(tx, ty - 1) !== Tile.Ground;
            const left = tx > 0 && map.get(tx - 1, ty) !== Tile.Ground;
            const right = tx < map.width - 1 && map.get(tx + 1, ty) !== Tile.Ground;
            const sides = `${left ? "L" : ""}${right ? "R" : ""}` as "" | "L" | "R" | "LR";
            if (top) img = theme.ground[`top${sides}`];
            else if (sides === "" && (tx * 7 + ty * 13) % 5 === 0) img = theme.ground.fillB;
            else img = theme.ground[`fill${sides}`];
            break;
          }
          case Tile.Brick:
          case Tile.BrickCoins:
            img = theme.brick;
            break;
          case Tile.MysteryCoin:
          case Tile.MysterySprout:
            img = a.blocks[shimmer];
            break;
          case Tile.Used:
            img = a.blocks.used;
            break;
          case Tile.Stone:
            img = theme.stone;
            break;
          case Tile.PipeTopLeft:
            img = theme.pipe.topLeft;
            break;
          case Tile.PipeTopRight:
            img = theme.pipe.topRight;
            break;
          case Tile.PipeLeft:
            img = theme.pipe.left;
            break;
          case Tile.PipeRight:
            img = theme.pipe.right;
            break;
          case Tile.Coin:
            img = a.coin[coinFrame];
            break;
          default:
            continue;
        }
        ctx.drawImage(img, tx * TILE - cam, ty * TILE + world.bumpOffset(tx, ty));
      }
    }
  }

  private drawFlag(ctx: CanvasRenderingContext2D, world: World, cam: number): void {
    const { tx, baseTy } = world.level.flag;
    const x = tx * TILE - cam;
    if (x < -TILE * 2 || x > ctx.canvas.width + TILE) return;
    const f = this.assets.flag;
    ctx.drawImage(f.finial, x, FLAG_TOP_ROW * TILE);
    for (let ty = FLAG_TOP_ROW + 1; ty < baseTy; ty++) ctx.drawImage(f.pole, x, ty * TILE);
    const pennant = Math.floor(world.frame / 12) % 2 === 0 ? f.pennant0 : f.pennant1;
    ctx.drawImage(pennant, x + POLE_LEFT - pennant.width, Math.round(world.flagY));
  }

  private drawGoal(ctx: CanvasRenderingContext2D, world: World, cam: number): void {
    const { tx, ty } = world.level.goal;
    ctx.drawImage(this.assets.goal.tower, tx * TILE - cam, (ty + 1) * TILE - GOAL_HEIGHT);
  }

  private drawSprite(ctx: CanvasRenderingContext2D, img: Canvas, x: number, y: number, w: number, h: number, cam: number): void {
    ctx.drawImage(img, Math.round(x + w / 2 - img.width / 2) - cam, Math.round(y + h - img.height));
  }

  private drawSprout(ctx: CanvasRenderingContext2D, s: World["items"][number], cam: number, alpha: number): void {
    const img = Math.floor(s.anim / 10) % 2 === 0 ? this.assets.sprout.sprout0 : this.assets.sprout.sprout1;
    this.drawSprite(ctx, img, lerp(s.prevX, s.x, alpha), lerp(s.prevY, s.y, alpha), s.w, s.h, cam);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, cam: number, alpha: number, frame: number): void {
    const x = lerp(e.prevX, e.x, alpha);
    const y = lerp(e.prevY, e.y, alpha);
    // Art faces left; mirror when heading right.
    if (e.kind === "walker") {
      const set = e.dir > 0 ? this.assets.grub.mirrored : this.assets.grub.base;
      const img = e.state === "squashed" ? set.squashed : e.state === "flipped" ? set.flipped : Math.floor(e.stride / 8) % 2 === 0 ? set.walk0 : set.walk1;
      this.drawSprite(ctx, img, x, y, e.w, e.h, cam);
      return;
    }
    const set = e.dir > 0 ? this.assets.shellback.mirrored : this.assets.shellback.base;
    let img: Canvas;
    let shake = 0;
    if (e.state === "walk") img = Math.floor(e.stride / 10) % 2 === 0 ? set.walk0 : set.walk1;
    else if (e.state === "flipped") img = set.flipped;
    else if (shellWaking(e)) {
      img = set.peek;
      shake = Math.floor(frame / 3) % 2 === 0 ? -1 : 1;
    } else img = set.shell;
    this.drawSprite(ctx, img, x + shake, y, e.w, e.h, cam);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, world: World, cam: number, alpha: number): void {
    const p = world.player;
    // Blink while invulnerable.
    if (world.invuln > 0 && Math.floor(world.frame / 2) % 2 === 0) return;
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    const a = this.assets;
    if (world.phase === "dying" && world.deathCause !== "pit") {
      const img = Math.floor(world.phaseTimer / 8) % 2 === 0 ? a.heroSmall.base.dead0 : a.heroSmall.base.dead1;
      this.drawSprite(ctx, img, x, y, p.w, p.h, cam);
      return;
    }
    let form = p.form;
    if (world.phase === "transform" && world.transformFrom && Math.floor(world.phaseTimer / 4) % 2 === 0) {
      form = world.transformFrom;
    }
    const pose = world.phase === "pole" ? "pole" : world.phase === "transform" ? "idle" : playerPose(p);
    const sheet = form === "big" ? a.heroBig : a.heroSmall;
    const set = p.facing > 0 ? sheet.base : sheet.mirrored;
    this.drawSprite(ctx, set[pose], x, y, p.w, p.h, cam);
  }

  private drawEffect(ctx: CanvasRenderingContext2D, fx: Effect, theme: ThemeAssets, cam: number, alpha: number): void {
    const x = Math.round(lerp(fx.prevX, fx.x, alpha)) - cam;
    const y = Math.round(lerp(fx.prevY, fx.y, alpha));
    switch (fx.kind) {
      case "coin":
        ctx.drawImage(this.assets.coin[(["coin0", "coin1", "coin2", "coin3"] as const)[Math.floor(fx.age / 3) % 4]!], x, y);
        break;
      case "debris":
        ctx.drawImage(Math.floor(fx.age / 6) % 2 === 0 ? theme.debris.debris0 : theme.debris.debris1, x, y);
        break;
      case "score":
        this.text.draw(ctx, fx.text, x + 8, y, { scale: 1, align: "center" });
        break;
      case "dust": {
        const t = fx.age / DUST_FRAMES;
        const r = Math.round(2 + t * 4);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = WHITE;
        ctx.fillRect(x + 6 - r, y + 6 - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  // ── HUD and screens ─────────────────────────────────────────────────────

  private drawHud(ctx: CanvasRenderingContext2D, game: Game, world: World, viewW: number): void {
    const s = game.session;
    const t = this.text;
    // Five even columns; on touch screens the top-right corner holds the mute and pause buttons.
    const right = viewW - (game.touchMode ? HUD_TOUCH_RESERVE : 16);
    const col = (i: number): number => Math.round(16 + ((right - 16) / 5) * i);
    t.draw(ctx, "SCORE", col(0), 10);
    t.draw(ctx, String(s.score).padStart(7, "0"), col(0), 30);
    t.draw(ctx, "COINS", col(1), 10);
    ctx.drawImage(this.assets.hud.coin, col(1), 30, 18, 18);
    t.draw(ctx, `×${String(s.coins).padStart(2, "0")}`, col(1) + 22, 30);
    t.draw(ctx, "LEVEL", col(2), 10);
    t.draw(ctx, `${s.levelIndex + 1}/${game.levelCount}`, col(2), 30);
    t.draw(ctx, "TIME", col(3), 10);
    const hurry = world.time <= RULES.hurryAt && Math.floor(world.frame / 15) % 2 === 0;
    t.draw(ctx, String(world.time).padStart(3, "0"), col(3), 30, { color: hurry ? "#ff8a6a" : WHITE });
    t.draw(ctx, "LIVES", col(4), 10);
    ctx.drawImage(this.assets.hud.life, col(4), 28, 18, 18);
    t.draw(ctx, `×${s.lives}`, col(4) + 22, 30);
  }

  private drawTitle(ctx: CanvasRenderingContext2D, game: Game, viewW: number): void {
    ctx.fillStyle = "rgba(10, 8, 24, 0.35)";
    ctx.fillRect(0, 0, viewW, VIEW_HEIGHT);
    const cx = viewW / 2;
    const t = this.text;
    // Logo with a chunky outline.
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
    ] as const) {
      t.draw(ctx, "SPROUT", cx + dx, 70 + dy, { scale: 8, color: INK, shadow: null, align: "center" });
      t.draw(ctx, "QUEST", cx + dx, 140 + dy, { scale: 8, color: INK, shadow: null, align: "center" });
    }
    t.draw(ctx, "SPROUT", cx, 70, { scale: 8, color: "#86dd6c", shadow: "#24693a", align: "center" });
    t.draw(ctx, "QUEST", cx, 140, { scale: 8, color: "#ffe25a", shadow: "#b47400", align: "center" });
    if (Math.floor(game.timer / 30) % 2 === 0) {
      t.draw(ctx, game.touchMode ? "TAP JUMP TO START" : "PRESS JUMP TO START", cx, 250, { scale: 3, align: "center" });
    }
    const hints = game.touchMode
      ? ["PAD: MOVE (PUSH FAR TO RUN)", "A: JUMP   B: RUN"]
      : ["ARROWS: MOVE   Z: JUMP   X: RUN", "ENTER: PAUSE   M: MUTE"];
    hints.forEach((hint, i) => t.draw(ctx, hint, cx, 296 + i * 22, { scale: 2, align: "center" }));
    t.draw(ctx, `TOP ${String(game.highScore).padStart(7, "0")}`, cx, 354, { scale: 2, align: "center", color: "#ffe25a" });
  }

  private drawIntro(ctx: CanvasRenderingContext2D, game: Game, viewW: number): void {
    const level = game.currentLevel;
    const accent = THEME_COLORS[level.theme].accent;
    this.drawCard(ctx, viewW, [`LEVEL ${game.session.levelIndex + 1}`, level.name.toUpperCase()], game, accent);
    const cx = viewW / 2;
    ctx.drawImage(this.assets.heroSmall.base.idle, Math.round(cx - 60), 280);
    this.text.draw(ctx, `× ${game.session.lives}`, cx - 12, 296, { scale: 3 });
  }

  private drawEnding(ctx: CanvasRenderingContext2D, game: Game, viewW: number): void {
    this.drawCard(ctx, viewW, ["THE GARDENS BLOOM", "AGAIN!"], game, "#86dd6c");
    const cx = viewW / 2;
    this.text.draw(ctx, "THANK YOU FOR PLAYING", cx, 290, { scale: 2, align: "center" });
    this.text.draw(ctx, `FINAL SCORE ${String(game.session.score).padStart(7, "0")}`, cx, 330, { scale: 2, align: "center", color: "#ffe25a" });
  }

  /** Black card with large centred lines and the score line at the top. */
  private drawCard(ctx: CanvasRenderingContext2D, viewW: number, lines: readonly string[], game: Game, color = WHITE): void {
    ctx.fillStyle = "#0b0a14";
    ctx.fillRect(0, 0, viewW, VIEW_HEIGHT);
    this.text.draw(ctx, `SCORE ${String(game.session.score).padStart(7, "0")}`, 16, 12);
    lines.forEach((line, i) => {
      this.text.draw(ctx, line, viewW / 2, 150 + i * 48, { scale: 4, align: "center", color: i === 0 ? WHITE : color });
    });
  }

  private drawPaused(ctx: CanvasRenderingContext2D, viewW: number): void {
    ctx.fillStyle = "rgba(10, 8, 24, 0.55)";
    ctx.fillRect(0, 0, viewW, VIEW_HEIGHT);
    this.text.draw(ctx, "PAUSED", viewW / 2, 200, { scale: 5, align: "center" });
  }
}
