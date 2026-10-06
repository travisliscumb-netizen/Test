import type { Controls } from "../core/input";
import { NO_CONTROLS } from "../core/input";
import {
  bounceApart,
  createShellback,
  createWalker,
  enterShell,
  flipEnemy,
  isDangerous,
  kickShell,
  squashWalker,
  stepEnemy,
  type Enemy,
} from "../entities/enemies";
import {
  brickDebris,
  coinPop,
  createSprout,
  dustPuff,
  hopSprout,
  scorePopup,
  stepEffect,
  stepSprout,
  type Effect,
  type Sprout,
} from "../entities/items";
import { bounce, createPlayer, setForm, stepPlayer, type Form, type Player } from "../entities/player";
import { Camera } from "../world/camera";
import { firstCell, lastCell, overlaps, overlapsInset } from "../world/collision";
import { FLAG_TOP_ROW, TileMap, type LevelData, type Spawn } from "../world/level";
import { Tile, isBumpable } from "../world/tiles";
import { ENEMY, GOAL, ITEM, PLAYER, RULES, SCORE, TILE } from "../tuning";
import type { GameEvent, Sfx, Song } from "./events";
import type { Session } from "./session";

export type Phase = "play" | "transform" | "dying" | "pole" | "walkOut" | "tally" | "cleared" | "dead";
export type DeathCause = "hit" | "pit" | "time";

/** How long the hero flickers after God mode lifts it out of a pit. */
const GOD_RESCUE_FLICKER_FRAMES = 60;

/** Music for each theme. */
const THEME_SONG: Readonly<Record<LevelData["theme"], Song>> = {
  street: "street",
  park: "park",
  construction: "construction",
  downtown: "downtown",
};

/** One play-through of one level: the hero, the map, its inhabitants and the rules between them. */
export class World {
  readonly map: TileMap;
  readonly player: Player;
  readonly camera: Camera;
  readonly enemies: Enemy[] = [];
  readonly items: Sprout[] = [];
  readonly effects: Effect[] = [];
  /** Cell index → frames left in its bump animation. */
  readonly bumps = new Map<number, number>();
  readonly events: GameEvent[] = [];

  phase: Phase = "play";
  phaseTimer = 0;
  deathCause: DeathCause | null = null;
  /** Remaining time in timer units. */
  time: number;
  /** Frames left of post-hurt invulnerability. */
  invuln = 0;
  /** Where the hero last stood on solid ground (God mode returns it here from a pit). */
  private safeGround: { x: number; y: number };
  /** While transforming, the form being changed from (for the flicker). */
  transformFrom: Form | null = null;
  /** The pennant's top edge in world pixels. */
  flagY: number;
  /** The hero has walked into the goal and is no longer drawn. */
  playerHidden = false;
  /** Global animation counter. */
  frame = 0;
  /** Frames on which the hero last landed and last jumped (for squash-and-stretch). */
  landFrame = -1000;
  jumpFrame = -1000;

  private readonly pending: Spawn[];
  /** Cell index → frames left before a coin brick runs dry (0 = next hit is the last). */
  private readonly coinBricks = new Map<number, number>();
  private timeFrames = 0;
  private stompChain = 0;
  private hurried = false;

  constructor(
    readonly level: LevelData,
    readonly session: Session,
    viewWidth: number,
  ) {
    this.map = new TileMap(level);
    const spawnAt = session.checkpoint >= 0 ? level.checkpoints[session.checkpoint]! : level.start;
    this.player = createPlayer(spawnAt.tx, spawnAt.ty, session.form);
    this.safeGround = { x: this.player.x, y: this.player.y };
    this.camera = new Camera(viewWidth, level.width * TILE);
    this.camera.snapTo(this.player.x + this.player.w / 2);
    this.time = level.time;
    this.flagY = (FLAG_TOP_ROW + 1) * TILE;
    // Enemies behind a checkpoint respawn stay gone.
    this.pending = level.spawns
      .filter((s) => (s.tx + 1) * TILE > this.camera.x)
      .sort((a, b) => a.tx - b.tx);
    this.events.push({ type: "music", song: THEME_SONG[level.theme] }, { type: "tempo", scale: 1 });
  }

  get levelBottom(): number {
    return this.level.height * TILE;
  }

  get poleX(): number {
    return this.level.flag.tx * TILE + TILE / 2;
  }

  get outcome(): "cleared" | "dead" | null {
    return this.phase === "cleared" || this.phase === "dead" ? this.phase : null;
  }

  /** Frames a block at (tx, ty) has left in its bump, for drawing it raised. */
  bumpOffset(tx: number, ty: number): number {
    const left = this.bumps.get(ty * this.level.width + tx);
    if (left === undefined) return 0;
    const t = 1 - left / ITEM.blockBumpFrames;
    return -Math.round(Math.sin(t * Math.PI) * ITEM.blockBumpHeight);
  }

  step(c: Controls): void {
    this.frame++;
    this.camera.beginStep();
    switch (this.phase) {
      case "play":
        this.stepPlay(c);
        break;
      case "transform":
        this.freezeInterpolation();
        if (--this.phaseTimer <= 0) {
          this.phase = "play";
          this.transformFrom = null;
        }
        break;
      case "dying":
        this.stepDying();
        break;
      case "pole":
        this.stepPole();
        break;
      case "walkOut":
        this.stepWalkOut();
        break;
      case "tally":
        this.stepTally();
        break;
      case "cleared":
      case "dead":
        this.freezeInterpolation();
        break;
    }
  }

  setViewWidth(width: number): void {
    this.camera.setViewWidth(width);
  }

  // ── play ────────────────────────────────────────────────────────────────

  private stepPlay(c: Controls): void {
    const p = this.player;
    const r = stepPlayer(p, c, this.map, this.camera.x);
    if (r.jumped) {
      this.jumpFrame = this.frame;
      this.sfx(p.form === "big" ? "jumpBig" : "jump");
    }
    if (r.landed) {
      this.landFrame = this.frame;
      this.stompChain = 0;
    }
    if (r.bumped) this.bumpBlock(r.bumped.tx, r.bumped.ty);
    if (p.skidding && this.frame % 4 === 0) {
      this.effects.push(dustPuff(p.x + (p.vx > 0 ? p.w : 0) - 6, p.y + p.h - 12));
    }
    this.collectTileCoins();
    if (this.invuln > 0) this.invuln--;
    if (p.onGround) this.safeGround = { x: p.x, y: p.y };

    if (p.y > this.levelBottom) {
      if (this.session.god) this.rescueFromPit();
      else {
        this.killPlayer("pit");
        return;
      }
    }

    this.activateSpawns();
    this.stepActors();
    this.enemyInteractions();
    this.playerVersusEnemies(c);
    if (this.phase !== "play") return;
    this.playerVersusItems();
    if (this.phase !== "play") return;

    this.updateCheckpoint();
    this.camera.follow(p.x + p.w / 2);
    this.despawn();
    if (p.x + p.w >= this.poleX - 2 && p.y + p.h <= this.level.flag.baseTy * TILE) {
      this.grabPole();
      return;
    }
    this.tickTimer();
  }

  private stepActors(): void {
    for (const e of this.enemies) {
      if (stepEnemy(e, this.map, this.levelBottom).hitWall && this.onScreen(e.x, e.w)) this.sfx("bump");
    }
    for (const s of this.items) stepSprout(s, this.map, this.levelBottom);
    this.stepEffects();
    for (const [key, left] of this.bumps) {
      if (left <= 1) this.bumps.delete(key);
      else this.bumps.set(key, left - 1);
    }
    for (const [key, left] of this.coinBricks) if (left > 0) this.coinBricks.set(key, left - 1);
    prune(this.enemies);
    prune(this.items);
  }

  private stepEffects(): void {
    const popups: Effect[] = [];
    for (const e of this.effects) {
      if (stepEffect(e, this.levelBottom)) popups.push(scorePopup(String(SCORE.coin), e.x + 4, e.y));
    }
    prune(this.effects);
    this.effects.push(...popups);
  }

  private activateSpawns(): void {
    const edge = this.camera.x + this.camera.width + ENEMY.activateMargin;
    while (this.pending.length > 0 && this.pending[0]!.tx * TILE < edge) {
      const s = this.pending.shift()!;
      // Numbered among its kind across the whole level, so a respawn after a checkpoint keeps its look.
      const variant = this.level.spawns.filter((o) => o.kind === s.kind).indexOf(s);
      this.enemies.push(s.kind === "walker" ? createWalker(s.tx, s.ty, variant) : createShellback(s.tx, s.ty, variant));
    }
  }

  private despawn(): void {
    const left = this.camera.x - ENEMY.despawnMargin;
    // Wider than the activation margin, so nothing is culled right after spawning.
    const right = this.camera.x + this.camera.width + ENEMY.activateMargin + ENEMY.despawnMargin;
    const gone = (a: { x: number; w: number }): boolean => a.x + a.w < left || a.x > right;
    for (const e of this.enemies) if (gone(e)) e.remove = true;
    for (const s of this.items) if (gone(s)) s.remove = true;
    prune(this.enemies);
    prune(this.items);
  }

  private tickTimer(): void {
    if (++this.timeFrames < RULES.timerUnitFrames) return;
    this.timeFrames = 0;
    this.time = Math.max(0, this.time - 1);
    if (this.time === RULES.hurryAt && !this.hurried) {
      this.hurried = true;
      this.sfx("hurry");
      this.events.push({ type: "tempo", scale: 1.3 });
    }
    if (this.time === 0 && !this.session.god) this.killPlayer("time");
  }

  private updateCheckpoint(): void {
    const cps = this.level.checkpoints;
    for (let i = this.session.checkpoint + 1; i < cps.length; i++) {
      if (this.player.x >= cps[i]!.tx * TILE) this.session.checkpoint = i;
    }
  }

  // ── blocks and coins ────────────────────────────────────────────────────

  private bumpBlock(tx: number, ty: number): void {
    const id = this.map.get(tx, ty);
    if (!isBumpable(id)) {
      this.sfx("bump");
      return;
    }
    const key = ty * this.level.width + tx;
    switch (id) {
      case Tile.Brick:
        if (this.player.form === "big") {
          this.map.set(tx, ty, Tile.Empty);
          this.bumps.delete(key);
          this.effects.push(...brickDebris(tx, ty));
          this.addScore(SCORE.brick);
          this.sfx("break");
        } else {
          this.bumps.set(key, ITEM.blockBumpFrames);
          this.sfx("bump");
        }
        break;
      case Tile.BrickCoins: {
        this.bumps.set(key, ITEM.blockBumpFrames);
        const left = this.coinBricks.get(key);
        if (left === undefined) this.coinBricks.set(key, ITEM.multiCoinFrames);
        else if (left === 0) {
          this.map.set(tx, ty, Tile.Used);
          this.coinBricks.delete(key);
        }
        this.popCoin(tx, ty);
        break;
      }
      case Tile.MysteryCoin:
        this.bumps.set(key, ITEM.blockBumpFrames);
        this.map.set(tx, ty, Tile.Used);
        this.popCoin(tx, ty);
        break;
      case Tile.MysterySprout:
        this.bumps.set(key, ITEM.blockBumpFrames);
        this.map.set(tx, ty, Tile.Used);
        this.items.push(createSprout(tx, ty));
        this.sfx("sproutAppear");
        break;
    }
    this.hitFromBelow(tx, ty);
  }

  /** Whatever stands on a bumped block gets knocked: enemies flip, sprouts hop, coins are collected. */
  private hitFromBelow(tx: number, ty: number): void {
    const top = ty * TILE;
    const x0 = tx * TILE;
    const x1 = x0 + TILE;
    const center = x0 + TILE / 2;
    for (const e of this.enemies) {
      if (e.state === "flipped" || e.state === "squashed") continue;
      if (Math.abs(e.y + e.h - top) < 1 && e.x < x1 && e.x + e.w > x0) {
        flipEnemy(e, e.x + e.w / 2 >= center ? 1 : -1);
        this.award(SCORE.flipKill, e.x, e.y);
        this.sfx("kick");
      }
    }
    for (const s of this.items) {
      if (Math.abs(s.y + s.h - top) < 1 && s.x < x1 && s.x + s.w > x0) hopSprout(s, center);
    }
    if (this.map.get(tx, ty - 1) === Tile.Coin) {
      this.map.set(tx, ty - 1, Tile.Empty);
      this.popCoin(tx, ty - 1);
    }
  }

  private popCoin(tx: number, ty: number): void {
    this.effects.push(coinPop(tx, ty));
    this.addCoin();
  }

  private collectTileCoins(): void {
    const p = this.player;
    for (let ty = firstCell(p.y); ty <= lastCell(p.y + p.h); ty++) {
      for (let tx = firstCell(p.x); tx <= lastCell(p.x + p.w); tx++) {
        if (this.map.get(tx, ty) !== Tile.Coin) continue;
        // Coins are drawn smaller than a cell; require overlap with the coin itself.
        const coin = { x: tx * TILE + 6, y: ty * TILE + 4, w: 20, h: 24 };
        if (!overlaps(p, coin)) continue;
        this.map.set(tx, ty, Tile.Empty);
        this.addCoin();
      }
    }
  }

  // ── interactions ────────────────────────────────────────────────────────

  private enemyInteractions(): void {
    const list = this.enemies;
    for (const s of list) {
      if (s.kind !== "shell" || s.state !== "slide") continue;
      for (const e of list) {
        if (e === s || e.state === "flipped" || e.state === "squashed" || !overlaps(s, e)) continue;
        // Two sliding shells knock each other out.
        const headOn = e.kind === "shell" && e.state === "slide";
        flipEnemy(e, s.dir);
        this.award(SCORE.shellChain[Math.min(s.chain, SCORE.shellChain.length - 1)]!, e.x, e.y);
        s.chain++;
        this.sfx("kick");
        if (headOn) {
          flipEnemy(s, e.x > s.x ? -1 : 1);
          break;
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.state !== "walk") continue;
      for (let j = 0; j < list.length; j++) {
        const b = list[j]!;
        if (i === j || (b.state !== "walk" && b.state !== "shell") || !overlaps(a, b)) continue;
        bounceApart(a, b);
      }
    }
  }

  private playerVersusEnemies(c: Controls): void {
    const p = this.player;
    // Judge stomps from the player's motion before any bounce this step.
    const falling = p.vy > 0;
    const prevBottom = p.prevY + p.h;
    for (const e of this.enemies) {
      if (e.state === "flipped" || e.state === "squashed" || !overlaps(p, e)) continue;
      const stomp = falling && prevBottom <= e.prevY + ENEMY.stompTolerance;

      if (e.kind === "shell" && e.state === "shell") {
        kickShell(e, p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1);
        this.award(SCORE.shellKick, e.x, e.y);
        this.sfx("kick");
        if (stomp) bounce(p, c.jump);
        continue;
      }
      if (stomp) {
        bounce(p, c.jump);
        if (e.kind === "walker") squashWalker(e);
        else enterShell(e);
        this.award(SCORE.stompChain[Math.min(this.stompChain, SCORE.stompChain.length - 1)]!, e.x, e.y);
        this.stompChain++;
        this.sfx("stomp");
        continue;
      }
      if (!isDangerous(e)) continue;
      if (!overlapsInset(p, e, ENEMY.hurtInset)) continue;
      if (e.kind === "shell" && e.state === "slide" && e.kickGrace > 0) continue;
      if (this.invuln > 0) continue;
      this.hurtPlayer();
      if (this.phase !== "play") return;
    }
  }

  private playerVersusItems(): void {
    for (const s of this.items) {
      if (s.state !== "move" || !overlaps(this.player, s)) continue;
      s.remove = true;
      this.award(SCORE.sprout, s.x, s.y);
      if (this.player.form === "small") this.transform("big");
      else this.sfx("grow");
    }
    prune(this.items);
  }

  private hurtPlayer(): void {
    if (this.session.god) return;
    if (this.player.form === "big") {
      this.transform("small");
      this.invuln = PLAYER.hurtInvulnFrames;
    } else {
      this.killPlayer("hit");
    }
  }

  /** God mode: instead of dying in a pit, the hero is put back where it last stood, with a moment of flicker. */
  private rescueFromPit(): void {
    const p = this.player;
    p.x = p.prevX = this.safeGround.x;
    p.y = p.prevY = this.safeGround.y;
    p.vx = 0;
    p.vy = 0;
    this.invuln = GOD_RESCUE_FLICKER_FRAMES;
    this.camera.follow(p.x + p.w / 2);
  }

  private transform(to: Form): void {
    this.transformFrom = this.player.form;
    setForm(this.player, to);
    this.session.form = to;
    this.phase = "transform";
    this.phaseTimer = PLAYER.transformFrames;
    this.sfx(to === "big" ? "grow" : "shrink");
  }

  // ── death ───────────────────────────────────────────────────────────────

  private killPlayer(cause: DeathCause): void {
    const p = this.player;
    this.phase = "dying";
    this.phaseTimer = 0;
    this.deathCause = cause;
    if (p.form === "big") setForm(p, "small");
    this.session.form = "small";
    p.vx = 0;
    p.vy = 0;
    this.events.push({ type: "music", song: "death" });
  }

  private stepDying(): void {
    this.phaseTimer++;
    this.freezeInterpolation();
    const p = this.player;
    if (this.deathCause === "pit") {
      if (this.phaseTimer >= GOAL.pitSequenceFrames) this.phase = "dead";
      return;
    }
    if (this.phaseTimer === PLAYER.deathPauseFrames) p.vy = -PLAYER.deathLaunchSpeed;
    if (this.phaseTimer > PLAYER.deathPauseFrames) {
      p.vy += PLAYER.deathGravity;
      p.y += p.vy;
    }
    if (this.phaseTimer >= GOAL.deathSequenceFrames) this.phase = "dead";
  }

  // ── goal ────────────────────────────────────────────────────────────────

  private grabPole(): void {
    const p = this.player;
    const poleTop = FLAG_TOP_ROW * TILE;
    const poleBottom = this.level.flag.baseTy * TILE;
    const frac = (p.y + p.h - poleTop) / (poleBottom - poleTop);
    const bands = SCORE.flagBands;
    const band = Math.min(bands.length - 1, Math.max(0, Math.floor(frac * bands.length)));
    this.award(bands[band]!, this.poleX + 8, p.y);
    p.x = this.poleX - GOAL.gripOffset - p.w / 2;
    p.vx = 0;
    p.vy = 0;
    p.facing = 1;
    p.skidding = false;
    this.phase = "pole";
    this.phaseTimer = 0;
    this.events.push({ type: "music", song: null });
    this.sfx("flagSlide");
  }

  private stepPole(): void {
    this.freezeInterpolation();
    const p = this.player;
    const bottom = this.level.flag.baseTy * TILE;
    const flagBottom = bottom - TILE;
    p.y = Math.min(p.y + PLAYER.flagSlideSpeed, bottom - p.h);
    this.flagY = Math.min(this.flagY + PLAYER.flagSlideSpeed, flagBottom);
    this.stepEffects();
    if (p.y + p.h >= bottom && this.flagY >= flagBottom && ++this.phaseTimer >= GOAL.poleHoldFrames) {
      p.x = this.poleX + 6;
      p.prevX = p.x;
      p.onGround = true;
      p.airborneFromJump = false;
      this.phase = "walkOut";
      this.phaseTimer = 0;
      this.events.push({ type: "music", song: "clear" });
    }
  }

  private stepWalkOut(): void {
    this.freezeInterpolation();
    const p = this.player;
    const walk: Controls = { ...NO_CONTROLS, right: true };
    stepPlayer(p, walk, this.map, this.camera.x);
    p.vx = Math.min(p.vx, PLAYER.autoWalkSpeed);
    this.stepEffects();
    this.camera.follow(p.x + p.w / 2);
    const door = this.level.goal.tx * TILE + GOAL.doorOffset;
    if (p.x + p.w / 2 >= door || ++this.phaseTimer > GOAL.walkOutMaxFrames || p.y > this.levelBottom) {
      this.playerHidden = true;
      this.phase = "tally";
      this.phaseTimer = 0;
    }
  }

  private stepTally(): void {
    this.freezeInterpolation();
    this.stepEffects();
    if (this.time > 0) {
      const n = Math.min(this.time, RULES.tallyUnitsPerFrame);
      this.time -= n;
      this.addScore(n * SCORE.timeBonusPerUnit);
      if (this.frame % 4 === 0) this.sfx("tally");
      return;
    }
    if (++this.phaseTimer >= RULES.levelClearHoldFrames) this.phase = "cleared";
  }

  // ── scoring ─────────────────────────────────────────────────────────────

  private addScore(points: number): void {
    this.session.score += points;
  }

  private addCoin(): void {
    this.session.coins++;
    this.addScore(SCORE.coin);
    this.sfx("coin");
    if (this.session.coins >= SCORE.coinsPerLife) {
      this.session.coins -= SCORE.coinsPerLife;
      this.addLife();
    }
  }

  private addLife(): void {
    this.session.lives++;
    this.sfx("oneUp");
  }

  /** Awards points (or an extra life) with a popup at (x, y). */
  private award(value: number | "1UP", x: number, y: number): void {
    if (value === "1UP") this.addLife();
    else this.addScore(value);
    this.effects.push(scorePopup(String(value), x, y));
  }

  private sfx(id: Sfx): void {
    this.events.push({ type: "sfx", id });
  }

  private onScreen(x: number, w: number): boolean {
    return x + w > this.camera.x && x < this.camera.x + this.camera.width;
  }

  /** During freezes, keep render interpolation from replaying the last step's motion. */
  private freezeInterpolation(): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    for (const list of [this.enemies, this.items, this.effects] as const) {
      for (const a of list) {
        a.prevX = a.x;
        a.prevY = a.y;
      }
    }
  }
}

function prune<T extends { remove: boolean }>(list: T[]): void {
  let w = 0;
  for (const item of list) if (!item.remove) list[w++] = item;
  list.length = w;
}
