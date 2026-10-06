import { describe, expect, it } from "vitest";
import { NO_CONTROLS, type Controls } from "../src/core/input";
import { createShellback, createWalker } from "../src/entities/enemies";
import { setForm } from "../src/entities/player";
import { Game } from "../src/game/game";
import { godBlockRect } from "../src/game/godBlock";
import { newSession } from "../src/game/session";
import { World } from "../src/game/world";
import { loadLevels } from "../src/levels";
import { parseLevel } from "../src/world/level";
import { Tile } from "../src/world/tiles";
import { RULES, TILE } from "../src/tuning";

const ctl = (over: Partial<Controls> = {}): Controls => ({ ...NO_CONTROLS, ...over });
const levels = loadLevels();

function flatWorld(god: boolean, time = 300): World {
  const width = 60;
  const row = ".S" + ".".repeat(46) + "F...T" + ".".repeat(width - 53);
  const rows = [...Array(11).fill(".".repeat(width)), row, "#".repeat(width), "#".repeat(width), "#".repeat(width)];
  const level = parseLevel(`name: T\ntheme: street\ntime: ${time}\n---\n${rows.join("\n")}`);
  return new World(level, newSession(god), 512);
}

function run(w: World, frames: number, c: Controls = ctl()): void {
  for (let i = 0; i < frames; i++) w.step(c);
}

describe("God mode block on the title", () => {
  const center = (viewW: number): [number, number] => {
    const r = godBlockRect(viewW);
    return [r.x + r.size / 2, r.y + r.size / 2];
  };

  it("toggles on and off with a sound, without starting the game", () => {
    const g = new Game(levels, 640, 0);
    g.events.length = 0;
    expect(g.tap(...center(640))).toBe(true);
    expect(g.godMode).toBe(true);
    expect(g.mode).toBe("title");
    expect(g.events).toContainEqual({ type: "sfx", id: "oneUp" });
    expect(g.tap(...center(640))).toBe(true);
    expect(g.godMode).toBe(false);
    expect(g.events).toContainEqual({ type: "sfx", id: "bump" });
  });

  it("ignores taps elsewhere, and taps outside the title screen", () => {
    const g = new Game(levels, 640, 0);
    expect(g.tap(320, 300)).toBe(false);
    expect(g.godMode).toBe(false);
    g.step(ctl({ startPressed: true }));
    expect(g.tap(...center(640))).toBe(false);
    expect(g.godMode).toBe(false);
  });

  it("stays on the visible screen and clear of the logo at every supported view width", () => {
    for (const w of [512, 640, 854, 1040, 1280]) {
      const r = godBlockRect(w);
      expect(r.x).toBeGreaterThanOrEqual(32);
      expect(r.x + r.size).toBeLessThan(w / 2 - 175);
    }
  });

  it("the armed mode carries into the run that starts next, and a normal run stays normal", () => {
    const g = new Game(levels, 640, 0);
    g.tap(...center(640));
    g.step(ctl({ startPressed: true }));
    for (let i = 0; i < RULES.levelIntroFrames; i++) g.step(ctl());
    expect(g.world!.session.god).toBe(true);
    const plain = new Game(levels, 640, 0);
    plain.step(ctl({ startPressed: true }));
    expect(plain.session.god).toBe(false);
  });
});

describe("God mode in play", () => {
  it("enemy contact neither shrinks nor kills", () => {
    for (const form of ["small", "big"] as const) {
      const w = flatWorld(true);
      setForm(w.player, form);
      const e = createWalker(0, 0);
      e.x = e.prevX = w.player.x + 4;
      e.y = e.prevY = 12 * TILE - e.h;
      w.enemies.push(e);
      run(w, 60);
      expect(w.phase).toBe("play");
      expect(w.player.form).toBe(form);
    }
  });

  it("a kicked shell sliding into Bud does nothing to him", () => {
    const w = flatWorld(true);
    const s = createShellback(0, 0);
    s.x = s.prevX = w.player.x + 200;
    s.y = s.prevY = 12 * TILE - s.h;
    s.state = "slide";
    s.dir = -1;
    w.enemies.push(s);
    run(w, 60);
    expect(w.phase).toBe("play");
  });

  it("stomping still works", () => {
    const w = flatWorld(true);
    const e = createWalker(0, 0);
    e.x = e.prevX = w.player.x;
    e.y = e.prevY = 12 * TILE - e.h;
    w.enemies.push(e);
    w.player.y = w.player.prevY = e.y - w.player.h - 2;
    w.player.vy = 4;
    w.player.onGround = false;
    run(w, 1);
    expect(e.state).toBe("squashed");
  });

  it("a pit returns Bud to the last ground he stood on, alive", () => {
    const w = flatWorld(true);
    run(w, 5);
    // Open a pit just ahead and walk into it.
    for (const tx of [4, 5, 6, 7]) for (const ty of [12, 13, 14]) w.map.set(tx, ty, Tile.Empty);
    const ground = 12 * TILE;
    let rescues = 0;
    let lowest = 0;
    let prevY = w.player.y;
    for (let i = 0; i < 400; i++) {
      w.step(ctl({ right: true }));
      lowest = Math.max(lowest, w.player.y);
      // A rescue: from deep in the pit straight back up onto the ledge.
      if (prevY > ground && w.player.y + w.player.h <= ground) {
        rescues++;
        expect(w.player.x + w.player.w).toBeGreaterThan(3 * TILE);
        expect(w.player.x).toBeLessThan(4 * TILE);
      }
      prevY = w.player.y;
      expect(w.phase).toBe("play");
    }
    expect(rescues).toBeGreaterThan(0);
    // He really fell (rescued in the same step he passes the bottom, so never seen below it).
    expect(lowest).toBeGreaterThan(ground + 2 * TILE);
    expect(w.outcome).toBeNull();
  });

  it("the clock running out does not kill", () => {
    const w = flatWorld(true, 1);
    run(w, RULES.timerUnitFrames * 3);
    expect(w.time).toBe(0);
    expect(w.phase).toBe("play");
  });

  it("without God mode the same pit and clock still kill (control)", () => {
    const pit = flatWorld(false);
    for (const tx of [1, 2, 3, 4, 5]) for (const ty of [12, 13, 14]) pit.map.set(tx, ty, Tile.Empty);
    run(pit, 200);
    expect(pit.deathCause).toBe("pit");
    const clock = flatWorld(false, 1);
    run(clock, RULES.timerUnitFrames * 3);
    expect(clock.deathCause).toBe("time");
  });
});
