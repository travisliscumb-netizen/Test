import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { createShellback, createWalker, type Shellback, type Walker } from "../src/entities/enemies";
import { setForm } from "../src/entities/player";
import { World } from "../src/game/world";
import { newSession, type Session } from "../src/game/session";
import { parseLevel } from "../src/world/level";
import { Tile } from "../src/world/tiles";
import { ENEMY, ITEM, PLAYER, RULES, SCORE, TILE } from "../src/tuning";

const ctl = (over: Partial<Controls> = {}): Controls => ({ ...NO_CONTROLS, ...over });

/** 15-row level: `air` fills the bottom of the 12 air rows (right-padded), then 3 rows of ground. */
function makeWorld(air: string[], opts: { session?: Session; time?: number } = {}): World {
  const width = Math.max(16, ...air.map((r) => r.length));
  const padded = air.map((r) => r.padEnd(width, "."));
  const rows = [...Array(12 - air.length).fill(".".repeat(width)), ...padded, "#".repeat(width), "#".repeat(width), "#".repeat(width)];
  const level = parseLevel(`name: T\ntheme: street\ntime: ${opts.time ?? 300}\n---\n${rows.join("\n")}`);
  return new World(level, opts.session ?? newSession(), 512);
}

const FLAT = makeWorld.bind(null, [".S......................................F...T....."]);

function run(w: World, frames: number, c: Controls = ctl()): void {
  for (let i = 0; i < frames; i++) w.step(c);
}

function sfx(w: World): string[] {
  return w.events.flatMap((e) => (e.type === "sfx" ? [e.id] : []));
}

/** Puts an enemy directly in the world (bypassing spawn activation). */
function place<T extends Walker | Shellback>(w: World, e: T, x: number): T {
  e.x = x;
  e.prevX = x;
  e.y = 12 * TILE - e.h;
  e.prevY = e.y;
  w.enemies.push(e);
  return e;
}

/** Drops the player onto the enemy from just above. */
function dropOnto(w: World, e: { x: number; y: number; w: number }): void {
  const p = w.player;
  p.x = e.x + e.w / 2 - p.w / 2;
  p.y = e.y - p.h - 2;
  p.prevY = p.y;
  p.vy = 4;
  p.onGround = false;
  p.airborneFromJump = true;
}

describe("stomping", () => {
  it("squashes a walker, bounces the player and scores 100", () => {
    const w = FLAT();
    const g = place(w, createWalker(0, 0), 6 * TILE);
    dropOnto(w, g);
    w.step(ctl());
    expect(g.state).toBe("squashed");
    expect(w.player.vy).toBeLessThan(0);
    expect(w.session.score).toBe(100);
    expect(sfx(w)).toContain("stomp");
    run(w, ENEMY.walker.squashFrames + 1);
    expect(w.enemies).not.toContain(g);
  });

  it("chains stomps without landing: 100 then 200", () => {
    const w = FLAT();
    const a = place(w, createWalker(0, 0), 6 * TILE);
    const b = place(w, createWalker(0, 0), 12 * TILE);
    dropOnto(w, a);
    w.step(ctl());
    dropOnto(w, b);
    w.step(ctl());
    expect(w.session.score).toBe(300);
  });

  it("two enemies stomped in the same step both count as stomps", () => {
    const w = FLAT();
    const a = place(w, createWalker(0, 0), 6 * TILE);
    place(w, createWalker(0, 0), 6 * TILE + 4);
    dropOnto(w, a);
    w.step(ctl());
    expect(w.phase).toBe("play");
    expect(w.enemies.filter((e) => e.state === "squashed")).toHaveLength(2);
  });
});

describe("getting hurt", () => {
  it("a small hero touching a walker from the side dies", () => {
    const w = FLAT();
    const g = place(w, createWalker(0, 0), w.player.x + w.player.w + 1);
    g.dir = -1;
    // It walks 1 px per step; contact hurts once it is deeper than the forgiveness inset.
    run(w, 3 + ENEMY.hurtInset);
    expect(w.phase).toBe("dying");
    expect(w.deathCause).toBe("hit");
  });

  it("a big hero shrinks, then is briefly invulnerable", () => {
    const w = FLAT();
    setForm(w.player, "big");
    place(w, createWalker(0, 0), w.player.x + w.player.w + 1).dir = -1;
    run(w, 3 + ENEMY.hurtInset);
    expect(w.phase).toBe("transform");
    expect(w.player.form).toBe("small");
    run(w, PLAYER.transformFrames);
    expect(w.phase).toBe("play");
    run(w, 30);
    expect(w.phase).toBe("play");
    expect(w.invuln).toBeGreaterThan(0);
  });

  it("grazing a critter's edge is forgiven; real contact is not", () => {
    // Walking away from the hero, so the overlap only shrinks.
    const graze = FLAT();
    place(graze, createWalker(0, 0), graze.player.x + graze.player.w - ENEMY.hurtInset).dir = 1;
    run(graze, 10);
    expect(graze.phase).toBe("play");
    const hit = FLAT();
    place(hit, createWalker(0, 0), hit.player.x + hit.player.w - ENEMY.hurtInset - 3).dir = 1;
    run(hit, 1);
    expect(hit.phase).toBe("dying");
  });

  it("dying ends in the dead outcome and resets the carried form", () => {
    const w = FLAT();
    w.session.form = "big";
    place(w, createWalker(0, 0), w.player.x + w.player.w + 1).dir = -1;
    run(w, 400);
    expect(w.outcome).toBe("dead");
    expect(w.session.form).toBe("small");
  });

  it("falling into a pit kills", () => {
    const w = makeWorld([".S......F.T."]);
    w.map.set(3, 12, Tile.Empty);
    w.map.set(3, 13, Tile.Empty);
    w.map.set(3, 14, Tile.Empty);
    w.player.x = 3 * TILE + 6;
    run(w, 120);
    expect(w.deathCause).toBe("pit");
  });

  it("running out of time kills", () => {
    const w = makeWorld([".S................F.T."], { time: 2 });
    run(w, RULES.timerUnitFrames * 2 + 1);
    expect(w.deathCause).toBe("time");
  });
});

describe("shells", () => {
  function shellWorld(): { w: World; s: Shellback } {
    const w = FLAT();
    const s = place(w, createShellback(0, 0), 8 * TILE);
    dropOnto(w, s);
    w.step(ctl());
    return { w, s };
  }

  it("stomping a Shellback leaves a still shell", () => {
    const { w, s } = shellWorld();
    expect(s.state).toBe("shell");
    expect(s.h).toBe(ENEMY.shell.shellHeight);
    expect(w.session.score).toBe(100);
  });

  it("touching a still shell kicks it away from the player without hurting", () => {
    const { w, s } = shellWorld();
    const p = w.player;
    p.x = s.x - p.w - 1;
    p.y = s.y + s.h - p.h;
    p.vy = 0;
    p.onGround = true;
    p.airborneFromJump = false;
    run(w, 4, ctl({ right: true }));
    expect(s.state).toBe("slide");
    expect(s.dir).toBe(1);
    expect(w.phase).toBe("play");
  });

  it("a sliding shell knocks out enemies with a rising combo", () => {
    const w = FLAT();
    const s = place(w, createShellback(0, 0), 4 * TILE);
    s.state = "slide";
    s.h = ENEMY.shell.shellHeight;
    s.y = 12 * TILE - s.h;
    s.dir = 1;
    const a = place(w, createWalker(0, 0), 7 * TILE);
    const b = place(w, createWalker(0, 0), 10 * TILE);
    w.player.x = 0;
    w.player.prevX = 0;
    run(w, 60);
    expect(a.state).toBe("flipped");
    expect(b.state).toBe("flipped");
    expect(w.session.score).toBe(SCORE.shellChain[0] + SCORE.shellChain[1]);
  });

  it("a shell kicked far off the right of the screen is removed", () => {
    const w = makeWorld([".S" + ".".repeat(60) + "F...T."]);
    const s = place(w, createShellback(0, 0), 10 * TILE);
    s.state = "slide";
    s.h = ENEMY.shell.shellHeight;
    s.y = 12 * TILE - s.h;
    s.dir = 1;
    run(w, 200);
    expect(w.enemies).not.toContain(s);
  });

  it("enemies just past the right edge are kept", () => {
    const w = makeWorld([".S" + ".".repeat(60) + "F...T."]);
    const g = place(w, createWalker(0, 0), w.camera.x + w.camera.width + ENEMY.activateMargin);
    run(w, 5);
    expect(w.enemies).toContain(g);
  });

  it("stomping a sliding shell stops it", () => {
    const w = FLAT();
    const s = place(w, createShellback(0, 0), 10 * TILE);
    s.state = "slide";
    s.h = ENEMY.shell.shellHeight;
    s.y = 12 * TILE - s.h;
    s.dir = 1;
    s.vx = 0;
    dropOnto(w, { x: s.x + ENEMY.shell.kickSpeed, y: s.y, w: s.w });
    w.step(ctl());
    expect(s.state).toBe("shell");
  });

  it("a still shell wakes up and walks again", () => {
    const { w, s } = shellWorld();
    w.player.x = 0;
    run(w, ENEMY.shell.reviveFrames + 2);
    expect(s.state).toBe("walk");
    expect(s.h).toBe(ENEMY.shell.walkHeight);
  });

  it("walking Shellbacks turn around at ledges", () => {
    const w = makeWorld(["..............", ".S..............F..T."]);
    w.map.set(8, 12, Tile.Empty);
    w.map.set(8, 13, Tile.Empty);
    w.map.set(8, 14, Tile.Empty);
    const s = place(w, createShellback(0, 0), 5 * TILE);
    s.dir = 1;
    run(w, 200);
    expect(s.x + s.w).toBeLessThanOrEqual(8 * TILE);
    expect(s.state).toBe("walk");
  });
});

describe("blocks", () => {
  /** Hero standing right under the block at column 4, row 9 (2 rows above the hero's head room). */
  function blockWorld(ch: string): World {
    return makeWorld([`....${ch}.......................`, "........................", "........................", ".S..................F..T."]);
  }

  function jumpUnder(w: World, tx: number): void {
    const p = w.player;
    p.x = tx * TILE + (TILE - p.w) / 2;
    p.prevX = p.x;
    run(w, 1, ctl({ jump: true, jumpPressed: true }));
    run(w, 40, ctl({ jump: true }));
  }

  it("a mystery coin block pays a coin and becomes used", () => {
    const w = blockWorld("?");
    jumpUnder(w, 4);
    expect(w.map.get(4, 8)).toBe(Tile.Used);
    expect(w.session.coins).toBe(1);
    expect(w.session.score).toBe(SCORE.coin);
    expect(sfx(w)).toContain("coin");
  });

  it("a used block only thuds", () => {
    const w = blockWorld("?");
    jumpUnder(w, 4);
    run(w, 60);
    jumpUnder(w, 4);
    expect(w.session.coins).toBe(1);
  });

  it("a mystery sprout block releases a sprout that grows the hero", () => {
    const w = blockWorld("P");
    jumpUnder(w, 4);
    expect(w.items).toHaveLength(1);
    const s = w.items[0]!;
    run(w, 80);
    expect(s.state).toBe("move");
    // Put the hero in its path.
    const p = w.player;
    p.x = s.x + 40;
    p.prevX = p.x;
    s.dir = 1;
    run(w, 40);
    expect(w.player.form).toBe("big");
    expect(w.session.form).toBe("big");
    expect(w.session.score).toBe(SCORE.sprout);
  });

  it("small heroes bump bricks; big heroes break them", () => {
    const small = blockWorld("B");
    jumpUnder(small, 4);
    expect(small.map.get(4, 8)).toBe(Tile.Brick);

    const big = blockWorld("B");
    setForm(big.player, "big");
    jumpUnder(big, 4);
    expect(big.map.get(4, 8)).toBe(Tile.Empty);
    expect(big.session.score).toBe(SCORE.brick);
    expect(big.effects.filter((e) => e.kind === "debris")).toHaveLength(4);
  });

  it("a coin brick pays out repeatedly until its timer runs dry", () => {
    const w = blockWorld("M");
    jumpUnder(w, 4);
    run(w, 30);
    jumpUnder(w, 4);
    expect(w.session.coins).toBe(2);
    expect(w.map.get(4, 8)).toBe(Tile.BrickCoins);
    run(w, ITEM.multiCoinFrames);
    jumpUnder(w, 4);
    expect(w.session.coins).toBe(3);
    expect(w.map.get(4, 8)).toBe(Tile.Used);
  });

  it("bumping a block knocks out an enemy standing on it", () => {
    const w = blockWorld("B");
    const g = createWalker(4, 7);
    w.enemies.push(g);
    jumpUnder(w, 4);
    expect(g.state).toBe("flipped");
    expect(w.session.score).toBe(SCORE.flipKill);
  });
});

describe("coins and lives", () => {
  it("collects coins by touch", () => {
    const w = makeWorld([".So.................F..T."]);
    run(w, 30, ctl({ right: true }));
    expect(w.session.coins).toBe(1);
    expect(w.map.get(2, 11)).toBe(Tile.Empty);
  });

  it("every 100 coins is an extra life", () => {
    const session = newSession();
    session.coins = 99;
    const w = makeWorld([".So.................F..T."], { session });
    run(w, 30, ctl({ right: true }));
    expect(session.coins).toBe(0);
    expect(session.lives).toBe(RULES.startLives + 1);
    expect(sfx(w)).toContain("oneUp");
  });
});

describe("goal and checkpoints", () => {
  it("touching the pole slides down, walks into the goal and tallies time", () => {
    const w = makeWorld(["..........................", ".S.........F....T........."]);
    // The pole stands on a block, so it has to be reached with a jump.
    for (let i = 0; i < 900 && !w.outcome; i++) w.step(ctl({ right: true, jump: i % 40 < 30, jumpPressed: i % 40 === 0 }));
    expect(w.outcome).toBe("cleared");
    expect(w.playerHidden).toBe(true);
    expect(w.time).toBe(0);
    // Flag score from the lowest band plus the time bonus for whatever time was left.
    expect(w.session.score).toBeGreaterThanOrEqual(Math.min(...SCORE.flagBands));
    expect(w.session.score % SCORE.timeBonusPerUnit).toBe(0);
  });

  it("records checkpoints and respawns there", () => {
    const session = newSession();
    const w = makeWorld([".S......C.................F...T....."], { session });
    run(w, 120, ctl({ right: true }));
    expect(session.checkpoint).toBe(0);
    const again = makeWorld([".S......C.................F...T....."], { session });
    expect(again.player.x).toBe(8 * TILE + (TILE - again.player.w) / 2);
  });
});

describe("critter skins", () => {
  it("number each enemy among its kind across the level, the same after a checkpoint respawn", () => {
    const air = [
      ".S...g...k...g..........................C.....g...k...g.........................F...T.....",
    ];
    const width = air[0]!.length;
    const rows = [...Array(11).fill(".".repeat(width)), air[0], "#".repeat(width), "#".repeat(width), "#".repeat(width)];
    const level = parseLevel(`name: T\ntheme: street\ntime: 300\n---\n${rows.join("\n")}`);
    const variants = (w: World): string[] => {
      run(w, 1);
      return w.enemies.map((e) => `${e.kind}@${Math.round(e.x / TILE)}:${e.variant}`);
    };
    const fresh = new World(level, newSession(), 2000);
    expect(variants(fresh)).toEqual(["walker@5:0", "shell@9:0", "walker@13:1", "walker@46:2", "shell@50:1", "walker@54:3"]);
    const session = newSession();
    session.checkpoint = 0;
    const respawned = new World(level, session, 512);
    // Only enemies past the checkpoint come back (those in range so far), each with the same number and so the same look.
    expect(variants(respawned)).toEqual(["walker@46:2", "shell@50:1"]);
  });
});
