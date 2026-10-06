import type { Placement, SafeInsets } from "../core/display";
import { drawCoin } from "../gfx/art/coin";
import { drawPennant } from "../gfx/art/flag";
import { drawGrub } from "../gfx/art/grub";
import { drawHero } from "../gfx/art/hero";
import { heroPose, type HeroState } from "../gfx/art/heroPose";
import { MATERIALS } from "../gfx/art/materials";
import { drawShellback } from "../gfx/art/shellback";
import { drawSprout } from "../gfx/art/sprout";
import { drawBrickChunk } from "../gfx/art/tiles/brick";
import { MYSTERY_FRAMES } from "../gfx/art/tiles/blocks";
import { TOWER_HEIGHT } from "../gfx/art/goalTower";
import { ArtCache, COIN_FRAMES, GROUND_VARIANTS, type ThemeArt } from "../gfx/artCache";
import { OUTLINE, ellipse, groundShadow, linear, radial, rgba, roundRect, seededRandom, type Ctx } from "../gfx/paint";
import { shellWaking, type Enemy } from "../entities/enemies";
import { DUST_FRAMES, type Effect, type Sprout } from "../entities/items";
import type { Game } from "../game/game";
import type { World } from "../game/world";
import { FLAG_TOP_ROW } from "../world/level";
import { Tile } from "../world/tiles";
import { RULES, TILE, VIEW_HEIGHT } from "../tuning";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** View pixels kept clear at the HUD's right end for the on-screen mute and pause buttons. */
const HUD_TOUCH_RESERVE = 150;

const FONT = "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Everything the renderer needs to know about where it is drawing. */
export interface Frame {
  ctx: Ctx;
  placement: Placement;
  /** Canvas size in device pixels. */
  canvasWidth: number;
  canvasHeight: number;
  viewW: number;
  insets: SafeInsets;
  alpha: number;
}

/** Draws the game at native device resolution, straight onto the screen canvas. */
export class Renderer {
  private art: ArtCache | null = null;

  render(game: Game, f: Frame): void {
    const { ctx, placement: p } = f;
    if (!this.art || this.art.scale !== p.scale) this.art = new ArtCache(p.scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, f.canvasWidth, f.canvasHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.clip.x, p.clip.y, p.clip.width, p.clip.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    // Tiles are drawn 1:1 and backdrops are soft, so plain bilinear filtering is all that's needed.
    ctx.imageSmoothingQuality = "low";
    switch (game.mode) {
      case "title":
        this.drawWorld(f, game.backdrop, 0, false);
        this.drawTitle(f, game);
        break;
      case "intro":
        this.drawIntro(f, game);
        break;
      case "play":
      case "paused":
        if (game.world) {
          this.drawWorld(f, game.world, game.mode === "paused" ? 1 : f.alpha, false);
          this.drawHud(f, game, game.world);
          if (game.mode === "paused") this.drawPaused(f);
        }
        break;
      case "gameOver":
        this.drawCard(f, game, "Game Over", null, "#f2603a");
        break;
      case "ending":
        this.drawEnding(f, game);
        break;
    }
    ctx.restore();
  }

  /** Fills the whole painted area (the view plus any snapping slack around it). */
  private fillClip(f: Frame, style: string | CanvasGradient): void {
    const c = f.placement.clip;
    f.ctx.setTransform(1, 0, 0, 1, 0, 0);
    f.ctx.fillStyle = style;
    f.ctx.fillRect(c.x, c.y, c.width, c.height);
  }

  /** Sets a transform so logical view coordinates (x right, y down) map onto the game rectangle. */
  private viewTransform(f: Frame): void {
    const p = f.placement;
    f.ctx.setTransform(p.scale, 0, 0, p.scale, p.x, p.y);
  }

  // ── world ───────────────────────────────────────────────────────────────

  drawWorld(f: Frame, world: World, alpha: number, hidePlayer: boolean): void {
    if (!this.art || this.art.scale !== f.placement.scale) this.art = new ArtCache(f.placement.scale);
    const theme = this.art.theme(world.level.theme);
    const s = f.placement.scale;
    // Camera snapped to whole device pixels so tiles and sprites never shimmer.
    const camDev = Math.round(world.camera.interpolated(alpha) * s);
    const cam = camDev / s;
    this.drawBackdrop(f, theme, cam, world.frame);
    this.drawGoal(f, world, camDev);
    for (const sp of world.items) if (sp.state === "emerge") this.drawSprout(f, sp, cam, alpha, world.frame);
    this.drawTiles(f, world, theme, camDev);
    this.drawFlag(f, world, cam);
    for (const sp of world.items) if (sp.state === "move") this.drawSprout(f, sp, cam, alpha, world.frame);
    for (const e of world.enemies) this.drawEnemy(f, e, cam, alpha, world.frame);
    if (!hidePlayer && !world.playerHidden) this.drawPlayer(f, world, cam, alpha);
    for (const fx of world.effects) this.drawEffect(f, fx, world, cam, alpha);
  }

  private drawBackdrop(f: Frame, theme: ThemeArt, cam: number, frame: number): void {
    const { ctx, placement: p } = f;
    const c = p.clip;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = linear(ctx, 0, p.y, 0, p.y + p.height, theme.sky);
    ctx.fillRect(c.x, c.y, c.width, c.height);
    for (const layer of theme.layers) {
      const w = layer.width * p.scale;
      const h = (layer.surface.height / layer.scale) * p.scale;
      const offset = (cam * layer.factor + frame * layer.drift) * p.scale;
      let x = p.x - (((offset % w) + w) % w);
      while (x > c.x) x -= w;
      for (; x < c.x + c.width; x += w) {
        ctx.drawImage(layer.surface, Math.round(x), Math.round(p.y + layer.y * p.scale), Math.ceil(w) + 1, Math.round(h));
      }
    }
    this.drawAmbient(f, theme, cam, frame);
  }

  /** Floating motes; positions are a pure function of time and camera, so no state is kept. */
  private drawAmbient(f: Frame, theme: ThemeArt, cam: number, frame: number): void {
    const { ctx } = f;
    const a = theme.ambient;
    const rnd = seededRandom(7);
    this.viewTransform(f);
    const W = f.viewW + 40;
    for (let i = 0; i < a.count; i++) {
      const sx = rnd() * W;
      const sy = rnd() * VIEW_HEIGHT;
      const speed = 0.6 + rnd() * 0.8;
      const phase = rnd() * Math.PI * 2;
      const size = a.size * (0.7 + rnd() * 0.6);
      const x = ((((sx + frame * a.vx * speed - cam * 0.5 + Math.sin(frame * 0.02 + phase) * 8) % W) + W) % W) - 20;
      const y = (((sy + frame * a.vy * speed) % VIEW_HEIGHT) + VIEW_HEIGHT) % VIEW_HEIGHT;
      const twinkle = 0.45 + 0.55 * Math.sin(frame * 0.05 + phase);
      const r = size * (a.glow ? 4 : 2.2);
      ctx.globalAlpha = 0.5 + 0.5 * twinkle;
      ctx.drawImage(theme.mote, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawTiles(f: Frame, world: World, theme: ThemeArt, camDev: number): void {
    const { ctx, placement: p } = f;
    const art = this.art!;
    const map = world.map;
    const t = art.tilePx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tx0 = Math.floor((camDev + p.clip.x - p.x) / t) - 1;
    const tx1 = Math.floor((camDev + p.clip.x + p.clip.width - p.x) / t) + 1;
    // Rows below the map (only visible in the snapping slack) repeat the bottom row.
    const rows = Math.min(map.height + 2, Math.ceil((p.clip.y + p.clip.height - p.y) / t));
    const mystery = art.mystery[Math.floor(world.frame / 6) % MYSTERY_FRAMES]!;
    const coin = art.coin[Math.floor(world.frame / 3) % COIN_FRAMES]!;
    const pad = art.groundPadPx;
    for (let ty = 0; ty < rows; ty++) {
      const y = p.y + ty * t;
      const below = ty >= map.height;
      for (let tx = tx0; tx <= tx1; tx++) {
        // Beyond the map (only visible in the snapping slack) the edge columns and bottom row continue as ground.
        const outside = below || tx < 0 || tx >= map.width;
        const cx = Math.min(map.width - 1, Math.max(0, tx));
        const id = outside ? (map.get(cx, Math.min(ty, map.height - 1)) === Tile.Ground ? Tile.Ground : Tile.Empty) : map.get(tx, ty);
        if (id === Tile.Empty) continue;
        const x = p.x + tx * t - camDev;
        const bump = Math.round(world.bumpOffset(tx, ty) * p.scale);
        switch (id) {
          case Tile.Ground: {
            const row = Math.min(ty, map.height - 1);
            const shape = {
              top: !below && (ty === 0 || map.get(cx, ty - 1) !== Tile.Ground),
              left: tx > 0 && tx < map.width && map.get(tx - 1, row) !== Tile.Ground,
              right: tx >= 0 && tx < map.width - 1 && map.get(tx + 1, row) !== Tile.Ground,
            };
            const variant = (((tx * 7 + ty * 13) % GROUND_VARIANTS) + GROUND_VARIANTS) % GROUND_VARIANTS;
            ctx.drawImage(theme.ground(shape, variant), x - pad, y - pad);
            break;
          }
          case Tile.Brick:
          case Tile.BrickCoins:
            ctx.drawImage(theme.brick, x, y + bump);
            break;
          case Tile.MysteryCoin:
          case Tile.MysterySprout:
            ctx.drawImage(mystery, x, y + bump);
            break;
          case Tile.Used:
            ctx.drawImage(art.used, x, y + bump);
            break;
          case Tile.Stone:
            ctx.drawImage(theme.stone, x, y);
            break;
          case Tile.PipeTopLeft:
            ctx.drawImage(theme.pipe.topLeft, x, y);
            break;
          case Tile.PipeTopRight:
            ctx.drawImage(theme.pipe.topRight, x, y);
            break;
          case Tile.PipeLeft:
            ctx.drawImage(theme.pipe.left, x, y);
            break;
          case Tile.PipeRight:
            ctx.drawImage(theme.pipe.right, x, y);
            break;
          case Tile.Coin:
            ctx.drawImage(coin, x, y);
            break;
        }
      }
    }
  }

  private drawFlag(f: Frame, world: World, cam: number): void {
    const { tx, baseTy } = world.level.flag;
    const x = tx * TILE - cam;
    if (x < -TILE * 2 || x > f.viewW + TILE) return;
    const { ctx, placement: p } = f;
    const art = this.art!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dx = p.x + Math.round(x * p.scale);
    ctx.drawImage(art.finial, dx, p.y + FLAG_TOP_ROW * art.tilePx);
    for (let ty = FLAG_TOP_ROW + 1; ty < baseTy; ty++) ctx.drawImage(art.pole, dx, p.y + ty * art.tilePx);
    this.viewTransform(f);
    ctx.translate(x, 0);
    drawPennant(ctx, world.flagY, world.frame);
  }

  private drawGoal(f: Frame, world: World, camDev: number): void {
    const { tx, ty } = world.level.goal;
    const { ctx, placement: p } = f;
    const art = this.art!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const x = p.x + tx * art.tilePx - camDev;
    const y = p.y + (ty + 1) * art.tilePx - Math.round(TOWER_HEIGHT * p.scale);
    if (x > p.x + p.width || x + art.tower.width < p.x) return;
    ctx.drawImage(art.tower, x, y);
  }

  /** Transform with the origin at a body's feet centre (logical coordinates), optionally mirrored. */
  private atFeet(f: Frame, feetX: number, feetY: number, cam: number, facing: 1 | -1): void {
    const p = f.placement;
    const x = p.x + Math.round((feetX - cam) * p.scale);
    const y = p.y + Math.round(feetY * p.scale);
    f.ctx.setTransform(p.scale * facing, 0, 0, p.scale, x, y);
  }

  private drawSprout(f: Frame, sp: Sprout, cam: number, alpha: number, frame: number): void {
    const x = lerp(sp.prevX, sp.x, alpha) + sp.w / 2;
    const y = lerp(sp.prevY, sp.y, alpha) + sp.h;
    this.atFeet(f, x, y, cam, 1);
    if (sp.state === "move" && sp.onGround) groundShadow(f.ctx, 0, 0, 11);
    drawSprout(f.ctx, frame);
  }

  private drawEnemy(f: Frame, e: Enemy, cam: number, alpha: number, frame: number): void {
    const ctx = f.ctx;
    const x = lerp(e.prevX, e.x, alpha) + e.w / 2;
    const y = lerp(e.prevY, e.y, alpha) + e.h;
    if (e.state === "flipped") {
      // Knocked out: drawn upside down about its middle.
      this.atFeet(f, x, y - e.h / 2, cam, e.dir);
      ctx.scale(1, -1);
      ctx.translate(0, -e.h / 2);
      if (e.kind === "walker") drawGrub(ctx, { step: 0, state: "walk" });
      else drawShellback(ctx, { state: "shell", step: 0, spin: frame * 0.2 });
      return;
    }
    this.atFeet(f, x, y, cam, e.dir);
    if (e.onGround) groundShadow(ctx, 0, 0, e.kind === "walker" ? 13 : 14);
    if (e.kind === "walker") {
      drawGrub(ctx, { step: e.stride * 0.35, state: e.state === "squashed" ? "squashed" : "walk" });
      return;
    }
    if (e.state === "walk") {
      drawShellback(ctx, { state: "walk", step: e.stride * 0.3, spin: 0 });
    } else if (e.state === "slide") {
      // Mirrored when moving left, so spinning "forward" is always the same sign here.
      drawShellback(ctx, { state: "shell", step: 0, spin: (e.x * e.dir) / 11 });
    } else {
      const waking = shellWaking(e);
      if (waking) ctx.translate(Math.sin(frame * 1.3) * 0.9, 0);
      drawShellback(ctx, { state: waking ? "peek" : "shell", step: 0, spin: 0 });
    }
  }

  private drawPlayer(f: Frame, world: World, cam: number, alpha: number): void {
    const ctx = f.ctx;
    const p = world.player;
    const x = lerp(p.prevX, p.x, alpha) + p.w / 2;
    const y = lerp(p.prevY, p.y, alpha) + p.h;
    const dead = world.phase === "dying" && world.deathCause !== "pit";
    let form = p.form;
    if (world.phase === "transform" && world.transformFrom && Math.floor(world.phaseTimer / 4) % 2 === 0) form = world.transformFrom;
    const state: HeroState = {
      form,
      onGround: p.onGround,
      vx: p.vx,
      vy: p.vy,
      skidding: p.skidding,
      stride: p.stride,
      frame: world.frame,
      sinceLanding: world.frame - world.landFrame,
      sinceJump: world.frame - world.jumpFrame,
      mode: dead ? "dead" : world.phase === "pole" ? "pole" : "normal",
    };
    this.atFeet(f, x, y, cam, dead ? 1 : p.facing);
    if (p.onGround && !dead) groundShadow(ctx, 0, 0, form === "big" ? 13 : 11);
    // Flicker while invulnerable.
    if (world.invuln > 0) ctx.globalAlpha = Math.floor(world.frame / 3) % 2 === 0 ? 0.35 : 0.9;
    drawHero(ctx, heroPose(state));
    ctx.globalAlpha = 1;
  }

  private drawEffect(f: Frame, fx: Effect, world: World, cam: number, alpha: number): void {
    const ctx = f.ctx;
    const x = lerp(fx.prevX, fx.x, alpha);
    const y = lerp(fx.prevY, fx.y, alpha);
    switch (fx.kind) {
      case "coin":
        this.atFeet(f, x + 16, y + 16, cam, 1);
        drawCoin(ctx, (fx.age / 10) % 1);
        // Sparkle trail.
        ctx.fillStyle = rgba("#fff6c0", Math.max(0, 0.8 - fx.age / 30));
        for (let i = 0; i < 4; i++) {
          const a = fx.age * 0.3 + i * 1.6;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "debris":
        this.atFeet(f, x + 6, y + 6, cam, 1);
        ctx.rotate(fx.age * 0.3 * Math.sign(fx.vx || 1));
        drawBrickChunk(ctx, MATERIALS[world.level.theme]);
        break;
      case "score": {
        this.atFeet(f, x + 8, y, cam, 1);
        ctx.globalAlpha = Math.min(1, (1 - fx.age / 48) * 3);
        this.text(ctx, fx.text, 0, 0, 11, "#fffbe8", "center");
        ctx.globalAlpha = 1;
        break;
      }
      case "dust": {
        this.atFeet(f, x + 6, y + 6, cam, 1);
        const t = fx.age / DUST_FRAMES;
        ctx.fillStyle = radial(ctx, 0, 0, 3 + t * 6, [
          [0, `rgba(255, 250, 240, ${0.7 * (1 - t)})`],
          [1, "rgba(255, 250, 240, 0)"],
        ]);
        ctx.fillRect(-10, -10, 20, 20);
        break;
      }
    }
  }

  // ── HUD and screens ─────────────────────────────────────────────────────

  /** Rounded bold text with a dark outline and soft shadow, in the current transform. */
  private text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string | CanvasGradient, align: CanvasTextAlign = "left"): void {
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = size * 0.4;
    ctx.shadowOffsetY = size * 0.08;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = size * 0.22;
    ctx.strokeText(s, x, y);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  private idleHero(form: "small" | "big", frame: number): HeroState {
    return { form, onGround: true, vx: 0, vy: 0, skidding: false, stride: 0, frame, sinceLanding: 99, sinceJump: 99, mode: "normal" };
  }

  private drawHud(f: Frame, game: Game, world: World): void {
    const ctx = f.ctx;
    this.viewTransform(f);
    const s = game.session;
    const reserve = game.touchMode && f.insets.underTopButtons ? HUD_TOUCH_RESERVE : 12;
    const left = 12 + Math.ceil(f.insets.left);
    const right = f.viewW - Math.ceil(f.insets.right) - reserve;
    // Frosted panel behind the readouts.
    roundRect(ctx, left - 4, 6, right - left + 8, 40, 14);
    ctx.fillStyle = linear(ctx, 0, 6, 0, 46, [
      [0, "rgba(20, 14, 40, 0.42)"],
      [1, "rgba(20, 14, 40, 0.22)"],
    ]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const col = (i: number): number => left + 8 + ((right - left - 8) / 5) * i;
    const label = (i: number, t: string): void => {
      ctx.font = `700 8.5px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillText(t.toUpperCase(), col(i), 17);
    };
    const value = (i: number, t: string, dx = 0, color = "#ffffff"): void => this.text(ctx, t, col(i) + dx, 33, 15, color);
    label(0, "Score");
    value(0, String(s.score).padStart(7, "0"));
    label(1, "Coins");
    ctx.save();
    ctx.translate(col(1) + 6, 33);
    ctx.scale(0.62, 0.62);
    drawCoin(ctx, 0.04);
    ctx.restore();
    value(1, `× ${String(s.coins).padStart(2, "0")}`, 15);
    label(2, "Level");
    value(2, `${s.levelIndex + 1} / ${game.levelCount}`);
    label(3, "Time");
    const flash = world.time <= RULES.hurryAt && Math.floor(world.frame / 15) % 2 === 0;
    value(3, String(world.time).padStart(3, "0"), 0, flash ? "#ff8a6a" : "#ffffff");
    label(4, "Lives");
    ctx.save();
    ctx.translate(col(4) + 5, 42);
    ctx.scale(0.42, 0.42);
    drawHero(ctx, heroPose(this.idleHero("small", world.frame)));
    ctx.restore();
    value(4, `× ${s.lives}`, 15);
  }

  private drawTitle(f: Frame, game: Game): void {
    const ctx = f.ctx;
    const W = f.viewW;
    const cx = W / 2;
    // Vignette to lift the logo off the scenery.
    const p = f.placement;
    this.fillClip(f, radial(ctx, p.x + cx * p.scale, p.y + 200 * p.scale, W * 0.75 * p.scale, [
      [0, "rgba(10, 6, 30, 0)"],
      [1, "rgba(10, 6, 30, 0.55)"],
    ]));
    this.viewTransform(f);
    const bob = Math.sin(game.timer * 0.04) * 3;
    ctx.save();
    ctx.translate(cx, 112 + bob);
    ctx.rotate(-0.03);
    this.text(ctx, "Sprout", 0, -32, 76, linear(ctx, 0, -70, 0, 6, [
      [0, "#d8ffb0"],
      [0.5, "#6fd05a"],
      [1, "#2a8a3a"],
    ]), "center");
    this.text(ctx, "Quest", 0, 42, 76, linear(ctx, 0, 4, 0, 80, [
      [0, "#fff6b0"],
      [0.5, "#ffc830"],
      [1, "#d07a00"],
    ]), "center");
    ctx.restore();
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(game.timer * 0.08);
    this.text(ctx, game.touchMode ? "Tap A to start" : "Press Jump to start", cx, 226, 24, "#ffffff", "center");
    ctx.globalAlpha = 1;
    const hints = game.touchMode ? ["Pad: move (push to the edge to run)", "A: jump   B: run"] : ["Arrows: move   Z: jump   X: run", "Enter: pause   M: mute"];
    hints.forEach((h, i) => this.text(ctx, h, cx, 318 + i * 22, 14, "rgba(255, 255, 255, 0.95)", "center"));
    this.text(ctx, `Best  ${String(game.highScore).padStart(7, "0")}`, cx, 372, 16, "#ffe25a", "center");
  }

  private drawIntro(f: Frame, game: Game): void {
    const level = game.currentLevel;
    // Paint the coming level's art while the card is up, so play starts without a hitch.
    this.art!.theme(level.theme);
    this.drawCard(f, game, `Level ${game.session.levelIndex + 1}`, level.name, MATERIALS[level.theme].accent);
    const ctx = f.ctx;
    const cx = f.viewW / 2;
    ctx.save();
    ctx.translate(cx - 34, 330);
    ctx.scale(1.6, 1.6);
    drawHero(ctx, heroPose(this.idleHero(game.session.form, game.timer)));
    ctx.restore();
    this.text(ctx, `× ${game.session.lives}`, cx, 306, 26, "#ffffff");
  }

  private drawEnding(f: Frame, game: Game): void {
    this.drawCard(f, game, "The gardens bloom again!", "Thank you for playing", "#86dd6c");
    this.text(f.ctx, `Final score  ${String(game.session.score).padStart(7, "0")}`, f.viewW / 2, 320, 20, "#ffe25a", "center");
  }

  /** A dark card with a glowing accent, a headline and an optional subtitle. */
  private drawCard(f: Frame, game: Game, title: string, subtitle: string | null, accent: string): void {
    const ctx = f.ctx;
    const p = f.placement;
    const W = f.viewW;
    this.fillClip(f, linear(ctx, 0, p.clip.y, 0, p.clip.y + p.clip.height, [
      [0, "#120c22"],
      [1, "#06040e"],
    ]));
    this.fillClip(f, radial(ctx, p.x + (W / 2) * p.scale, p.y + 190 * p.scale, 300 * p.scale, [
      [0, rgba(accent, 0.35)],
      [1, rgba(accent, 0)],
    ]));
    this.viewTransform(f);
    this.text(ctx, `Score  ${String(game.session.score).padStart(7, "0")}`, 20, 26, 14, "rgba(255,255,255,0.85)");
    this.text(ctx, title, W / 2, 170, title.length > 14 ? 36 : 54, "#ffffff", "center");
    if (subtitle) this.text(ctx, subtitle, W / 2, 228, 26, accent, "center");
  }

  private drawPaused(f: Frame): void {
    const ctx = f.ctx;
    this.fillClip(f, "rgba(10, 8, 24, 0.55)");
    this.viewTransform(f);
    this.text(ctx, "Paused", f.viewW / 2, 210, 56, "#ffffff", "center");
    ellipse(ctx, f.viewW / 2, 268, 60, 1);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fill();
  }
}
