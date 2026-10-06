// Dev page: every piece of art, painted at high resolution. Usage: tools/art.html?scale=4
import { drawHero } from "../src/gfx/art/hero";
import { heroPose, type HeroState } from "../src/gfx/art/heroPose";
import type { Ctx } from "../src/gfx/paint";

const scale = Number(new URLSearchParams(location.search).get("scale") ?? 4);
const root = document.getElementById("root")!;

function section(title: string): HTMLElement {
  const h = document.createElement("h3");
  h.textContent = title;
  const row = document.createElement("div");
  row.className = "row";
  root.append(h, row);
  return row;
}

function cell(row: HTMLElement, label: string, w: number, h: number, draw: (ctx: Ctx) => void, originX = 0, originY = 0): void {
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, originX * scale, originY * scale);
  draw(ctx);
  const fig = document.createElement("figure");
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  fig.append(c, cap);
  row.append(fig);
}

const base: HeroState = { form: "big", onGround: true, vx: 0, vy: 0, skidding: false, stride: 0, frame: 30, sinceLanding: 99, sinceJump: 99, mode: "normal" };
const states: [string, Partial<HeroState>][] = [
  ["idle", {}],
  ["blink", { frame: 3 }],
  ["run 0", { vx: 5, stride: 0 }],
  ["run 1", { vx: 5, stride: 13 }],
  ["run 2", { vx: 5, stride: 26 }],
  ["run 3", { vx: 5, stride: 39 }],
  ["walk", { vx: 2, stride: 13 }],
  ["jump up", { onGround: false, vy: -8, sinceJump: 2, vx: 3 }],
  ["apex", { onGround: false, vy: 0, vx: 3 }],
  ["fall", { onGround: false, vy: 7, vx: 3 }],
  ["land", { sinceLanding: 1 }],
  ["skid", { skidding: true, vx: 3 }],
  ["pole", { mode: "pole", onGround: false }],
  ["dead", { mode: "dead", onGround: false }],
];
for (const form of ["big", "small"] as const) {
  const row = section(`Hero (${form})`);
  for (const [label, over] of states) {
    cell(row, label, 44, 60, (ctx) => drawHero(ctx, heroPose({ ...base, form, ...over })), 22, 56);
  }
}
document.body.dataset.ready = "1";

import { drawGrub } from "../src/gfx/art/grub";
import { drawShellback } from "../src/gfx/art/shellback";
import { drawSprout } from "../src/gfx/art/sprout";
import { drawCoin } from "../src/gfx/art/coin";
{
  const row = section("Enemies, items");
  for (const step of [0, 1.5, 3]) cell(row, `grub ${step}`, 34, 30, (ctx) => drawGrub(ctx, { step, state: "walk" }), 17, 27);
  cell(row, "grub squashed", 34, 30, (ctx) => drawGrub(ctx, { step: 0, state: "squashed" }), 17, 27);
  for (const step of [0, 2]) cell(row, `shellback ${step}`, 40, 34, (ctx) => drawShellback(ctx, { state: "walk", step, spin: 0 }), 18, 31);
  cell(row, "shell", 30, 30, (ctx) => drawShellback(ctx, { state: "shell", step: 0, spin: 1 }), 15, 27);
  cell(row, "peek", 30, 30, (ctx) => drawShellback(ctx, { state: "peek", step: 0, spin: 0 }), 15, 27);
  cell(row, "sprout", 36, 34, (ctx) => drawSprout(ctx, 0), 18, 31);
  for (const s of [0, 0.15, 0.25, 0.4]) cell(row, `coin ${s}`, 24, 24, (ctx) => drawCoin(ctx, s), 12, 12);
}

import { MATERIALS } from "../src/gfx/art/materials";
import { GROUND_PAD, drawGround } from "../src/gfx/art/tiles/ground";
import { drawBrick } from "../src/gfx/art/tiles/brick";
import { drawStone } from "../src/gfx/art/tiles/stone";
import { drawMystery, drawUsedBlock } from "../src/gfx/art/tiles/blocks";
import { drawPipe } from "../src/gfx/art/tiles/pipe";
import { THEMES } from "../src/world/level";
for (const theme of THEMES) {
  const m = MATERIALS[theme];
  const row = section(`Tiles: ${theme}`);
  // A little ground diorama: a pit between two ledges, to judge seams and edges.
  cell(row, "ground", 32 * 7 + GROUND_PAD * 2, 32 * 2 + GROUND_PAD, (ctx) => {
    const cols = [true, true, true, false, false, true, true];
    for (let ty = 0; ty < 2; ty++)
      for (let tx = 0; tx < 7; tx++) {
        if (!cols[tx]) continue;
        ctx.save();
        ctx.translate(tx * 32, ty * 32);
        drawGround(ctx, m, { top: ty === 0, left: tx > 0 && !cols[tx - 1], right: tx < 6 && !cols[tx + 1] }, tx * 3 + ty);
        ctx.restore();
      }
  }, GROUND_PAD, GROUND_PAD);
  cell(row, "brick ×2", 64, 32, (ctx) => {
    drawBrick(ctx, m);
    ctx.translate(32, 0);
    drawBrick(ctx, m);
  });
  cell(row, "stone ×2", 64, 32, (ctx) => {
    drawStone(ctx, m);
    ctx.translate(32, 0);
    drawStone(ctx, m);
  });
  cell(row, "pipe", 64, 64, (ctx) => {
    drawPipe(ctx, m, "topLeft");
    ctx.translate(32, 0);
    drawPipe(ctx, m, "topRight");
    ctx.translate(-32, 32);
    drawPipe(ctx, m, "left");
    ctx.translate(32, 0);
    drawPipe(ctx, m, "right");
  });
}
{
  const row = section("Blocks");
  for (let f = 0; f < 8; f += 2) cell(row, `mystery ${f}`, 32, 32, (ctx) => drawMystery(ctx, f));
  cell(row, "used", 32, 32, (ctx) => drawUsedBlock(ctx));
}
