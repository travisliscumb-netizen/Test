import { createCanvas } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import { drawCoin } from "../src/gfx/art/coin";
import { drawFinial, drawPennant, drawPole } from "../src/gfx/art/flag";
import { TOWER_HEIGHT, TOWER_WIDTH, drawGoalTower } from "../src/gfx/art/goalTower";
import { drawGrub } from "../src/gfx/art/grub";
import { BUILDS, drawHero, lowestFoot } from "../src/gfx/art/hero";
import { heroPose, type HeroState } from "../src/gfx/art/heroPose";
import { drawShellback } from "../src/gfx/art/shellback";
import { drawSprout } from "../src/gfx/art/sprout";
import { ArtCache, COIN_FRAMES, GROUND_VARIANTS } from "../src/gfx/artCache";
import { BACKDROPS } from "../src/gfx/backdrops";
import { context, makeSurface, setSurfaceFactory, type Ctx, type Surface } from "../src/gfx/paint";
import { THEMES } from "../src/world/level";
import { VIEW_HEIGHT, VIEW_MAX_WIDTH } from "../src/tuning";

beforeAll(() => {
  setSurfaceFactory((w, h) => createCanvas(w, h) as unknown as Surface);
});

const SCALE = 4;

/** Paints into a box (logical units) with the origin at (ox, oy); returns opaque-pixel stats. */
function paint(w: number, h: number, ox: number, oy: number, draw: (ctx: Ctx) => void): { opaque: number; edgeOpaque: number } {
  const s = makeSurface(w * SCALE, h * SCALE);
  const ctx = context(s);
  ctx.setTransform(SCALE, 0, 0, SCALE, ox * SCALE, oy * SCALE);
  draw(ctx);
  const data = ctx.getImageData(0, 0, s.width, s.height).data;
  let opaque = 0;
  let edgeOpaque = 0;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const a = data[(y * s.width + x) * 4 + 3]!;
      if (a > 16) {
        opaque++;
        if (x === 0 || y === 0 || x === s.width - 1 || y === s.height - 1) edgeOpaque++;
      }
    }
  }
  return { opaque, edgeOpaque };
}

const base: HeroState = { form: "big", onGround: true, vx: 0, vy: 0, skidding: false, stride: 0, frame: 40, sinceLanding: 99, sinceJump: 99, mode: "normal" };
const heroStates: Partial<HeroState>[] = [
  {},
  { vx: 2, stride: 10 },
  { vx: 5.1, stride: 33 },
  { onGround: false, vy: -9, sinceJump: 1 },
  { onGround: false, vy: 8 },
  { skidding: true, vx: 3 },
  { sinceLanding: 0 },
  { mode: "pole", onGround: false },
  { mode: "dead", onGround: false },
];

describe("hero", () => {
  it.each(["small", "big"] as const)("%s: every pose paints inside its box, never touching the edges", (form) => {
    for (const over of heroStates) {
      const r = paint(70, 80, 35, 70, (ctx) => drawHero(ctx, heroPose({ ...base, form, ...over })));
      expect(r.opaque, JSON.stringify(over)).toBeGreaterThan(500);
      expect(r.edgeOpaque, JSON.stringify(over)).toBe(0);
    }
  });

  it("planted poses keep the lowest boot on the ground line", () => {
    for (const form of ["small", "big"] as const) {
      for (const stride of [0, 7, 13, 26, 39]) {
        const pose = heroPose({ ...base, form, vx: 4, stride });
        expect(pose.planted).toBe(true);
        expect(lowestFoot(pose)).toBeGreaterThan(0);
      }
    }
  });

  it("the run cycle moves the legs through distinct positions", () => {
    const legs = [0, 13, 26, 39].map((stride) => {
      const leg = heroPose({ ...base, vx: 5, stride }).frontLeg;
      return `${leg.swing.toFixed(2)}/${leg.bend.toFixed(2)}`;
    });
    expect(new Set(legs).size).toBe(4);
  });

  it("blinks periodically and squashes on landing", () => {
    expect(heroPose({ ...base, frame: 3 }).blink).toBeGreaterThan(0.5);
    expect(heroPose({ ...base, frame: 100 }).blink).toBe(0);
    expect(heroPose({ ...base, sinceLanding: 0 }).stretch).toBeLessThan(1);
    expect(heroPose({ ...base, onGround: false, vy: -9, sinceJump: 0 }).stretch).toBeGreaterThan(1);
  });

  it("produces finite poses for any input", () => {
    for (let i = 0; i < 300; i++) {
      const pose = heroPose({ ...base, onGround: i % 2 === 0, vx: (i % 13) - 6, vy: (i % 21) - 10, stride: i * 3.7, frame: i * 11, sinceLanding: i % 9, sinceJump: i % 7, skidding: i % 5 === 0 });
      for (const v of [pose.lean, pose.stretch, pose.frontLeg.swing, pose.backArm.bend, pose.scarfLift]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("the big form is taller than the small one", () => {
    expect(BUILDS.big.headY).toBeLessThan(BUILDS.small.headY);
  });
});

describe("enemies, items and goal", () => {
  it("Grub walks and squashes within its box", () => {
    for (const step of [0, 1, 2, 3]) expect(paint(40, 34, 20, 30, (ctx) => drawGrub(ctx, { step, state: "walk" })).edgeOpaque).toBe(0);
    expect(paint(40, 34, 20, 30, (ctx) => drawGrub(ctx, { step: 0, state: "squashed" })).opaque).toBeGreaterThan(200);
  });

  it("Shellback walks, hides and peeks within its box", () => {
    for (const state of ["walk", "shell", "peek"] as const) {
      const r = paint(50, 40, 22, 36, (ctx) => drawShellback(ctx, { state, step: 1, spin: 2 }));
      expect(r.opaque, state).toBeGreaterThan(500);
      expect(r.edgeOpaque, state).toBe(0);
    }
  });

  it("sprout, coin and flag pieces paint", () => {
    expect(paint(40, 40, 20, 34, (ctx) => drawSprout(ctx, 10)).edgeOpaque).toBe(0);
    for (let i = 0; i < 8; i++) expect(paint(24, 24, 12, 12, (ctx) => drawCoin(ctx, i / 8)).opaque).toBeGreaterThan(50);
    expect(paint(40, 40, 4, 4, (ctx) => drawPennant(ctx, 6, 30)).opaque).toBeGreaterThan(500);
    expect(paint(32, 40, 0, 0, (ctx) => { drawPole(ctx, 10, 40); drawFinial(ctx, 8); }).opaque).toBeGreaterThan(200);
    expect(paint(TOWER_WIDTH, TOWER_HEIGHT, 0, 0, drawGoalTower).opaque).toBeGreaterThan(TOWER_WIDTH * TOWER_HEIGHT * SCALE * SCALE * 0.5);
  });
});

describe("art cache", () => {
  it.each([1, 2.4375, 3])("bakes every tile at whole-pixel size at scale %s", (scale) => {
    const art = new ArtCache(scale);
    expect(Number.isInteger(art.tilePx)).toBe(true);
    for (const s of [...art.mystery, art.used, ...art.coin, art.pole, art.finial]) {
      expect(s.width).toBe(art.tilePx);
      expect(s.height).toBe(art.tilePx);
    }
    expect(art.coin).toHaveLength(COIN_FRAMES);
    for (const theme of THEMES) {
      const t = art.theme(theme);
      for (const s of [t.brick, t.stone, ...Object.values(t.pipe)]) expect(s.width).toBe(art.tilePx);
      const g = t.ground({ top: true, left: false, right: false }, 0);
      expect(g.width).toBe(art.tilePx + art.groundPadPx * 2);
    }
  });

  it.each(THEMES)("%s ground fill is solid and its edges match between variants (no seams)", (theme) => {
    const art = new ArtCache(2);
    const t = art.theme(theme);
    const pad = art.groundPadPx;
    const n = art.tilePx;
    const edges: number[][] = [];
    for (let v = 0; v < GROUND_VARIANTS; v++) {
      const ctx = context(t.ground({ top: false, left: false, right: false }, v));
      const data = ctx.getImageData(pad, pad, n, n).data;
      for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
      // Average colour of the left and right edge columns.
      const avg = (x: number): number => {
        let sum = 0;
        for (let y = 0; y < n; y++) sum += data[(y * n + x) * 4]! + data[(y * n + x) * 4 + 1]! + data[(y * n + x) * 4 + 2]!;
        return sum / n;
      };
      edges.push([avg(0), avg(n - 1)]);
    }
    for (const [l] of edges) for (const [, r] of edges) expect(Math.abs(l! - r!)).toBeLessThan(40);
  });
});

describe("backdrops", () => {
  it.each(THEMES)("%s: layers paint, and the nearest reaches the bottom so pits never show bare sky", (theme) => {
    const b = BACKDROPS[theme]();
    expect(b.layers.length).toBeGreaterThanOrEqual(3);
    expect(b.sky.length).toBeGreaterThanOrEqual(3);
    let bottomCovered = false;
    for (const layer of b.layers) {
      expect(layer.factor).toBeGreaterThanOrEqual(0);
      expect(layer.factor).toBeLessThan(1);
      const s = makeSurface(layer.width / 4, layer.height / 4);
      const ctx = context(s);
      ctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
      layer.paint(ctx);
      if (layer.y + layer.height >= VIEW_HEIGHT) {
        const row = ctx.getImageData(0, s.height - 1, s.width, 1).data;
        let solid = 0;
        for (let i = 3; i < row.length; i += 4) if (row[i]! > 240) solid++;
        if (solid === s.width) bottomCovered = true;
      }
    }
    expect(bottomCovered).toBe(true);
  });

  it("layers holding a single sun or moon are wider than the widest view", () => {
    for (const theme of ["meadow", "dusk", "fortress"] as const) {
      expect(BACKDROPS[theme]().layers[0]!.width).toBeGreaterThan(VIEW_MAX_WIDTH);
    }
  });
});


