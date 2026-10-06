import { createCanvas } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import { placeView } from "../src/core/display";
import { NO_CONTROLS } from "../src/core/input";
import { Game } from "../src/game/game";
import { World } from "../src/game/world";
import { setSurfaceFactory, type Ctx, type Surface } from "../src/gfx/paint";
import { loadLevels } from "../src/levels";
import { Renderer, type Frame } from "../src/render/renderer";
import { RULES, TILE, VIEW_HEIGHT } from "../src/tuning";

beforeAll(() => {
  setSurfaceFactory((w, h) => createCanvas(w, h) as unknown as Surface);
});

const W = 640;
const H = 360;
const levels = loadLevels();

function frame(viewW: number): { f: Frame; pixels: () => Uint8ClampedArray } {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  const placement = placeView(viewW, VIEW_HEIGHT, W, H, 0);
  return {
    f: { ctx, placement, canvasWidth: W, canvasHeight: H, viewW, insets: { left: 0, right: 0, underTopButtons: true }, alpha: 0.5 },
    pixels: () => ctx.getImageData(0, 0, W, H).data,
  };
}

/** Fraction of pixels that are not pure black (i.e. something was painted). */
function painted(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 0) n++;
  return n / (data.length / 4);
}

describe("renderer", () => {
  const viewW = 854;

  it("renders the title, intro, pause, game over and ending screens", () => {
    const renderer = new Renderer();
    const game = new Game(levels, viewW, 1234);
    const { f, pixels } = frame(viewW);
    renderer.render(game, f);
    expect(painted(pixels())).toBeGreaterThan(0.95);

    game.step({ ...NO_CONTROLS, startPressed: true });
    renderer.render(game, f);
    expect(game.mode).toBe("intro");
    expect(painted(pixels())).toBeGreaterThan(0.95);

    for (let i = 0; i < RULES.levelIntroFrames; i++) game.step(NO_CONTROLS);
    game.step({ ...NO_CONTROLS, startPressed: true });
    expect(game.mode).toBe("paused");
    renderer.render(game, f);

    game.mode = "gameOver";
    renderer.render(game, f);
    game.mode = "ending";
    renderer.render(game, f);
    expect(painted(pixels())).toBeGreaterThan(0.95);
  });

  it.each(levels.map((l, i) => [l.name, i] as const))("renders %s across its whole length", (_name, i) => {
    const renderer = new Renderer();
    const game = new Game(levels, viewW, 0);
    const world = new World(levels[i]!, game.session, viewW);
    game.world = world;
    game.mode = "play";
    const { f, pixels } = frame(viewW);
    for (let x = 0; x < world.level.width * TILE; x += viewW) {
      world.camera.x = world.camera.prevX = Math.min(x, world.camera.maxX);
      for (let s = 0; s < 3; s++) world.step({ ...NO_CONTROLS, right: true });
      renderer.render(game, f);
      expect(painted(pixels())).toBeGreaterThan(0.95);
    }
  });

  it("renders every hero phase (transform, dying, pole, tally)", () => {
    const renderer = new Renderer();
    const game = new Game(levels, viewW, 0);
    const world = new World(levels[0]!, game.session, viewW);
    game.world = world;
    game.mode = "play";
    const { f } = frame(viewW);
    for (const phase of ["transform", "dying", "pole", "walkOut", "tally"] as const) {
      world.phase = phase;
      world.transformFrom = "small";
      world.deathCause = "hit";
      expect(() => renderer.render(game, f)).not.toThrow();
    }
  });
});
