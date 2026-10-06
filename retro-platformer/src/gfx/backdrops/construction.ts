import { linear, rgba, seededRandom, shade, type Ctx } from "../paint";
import { glow, ridge, tint, windows, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** A lattice mast or jib: two rails with zig-zag bracing between them. */
function lattice(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, thick: number, color: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * thick;
  const ny = (dx / len) * thick;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x0 + nx, y0 + ny);
  ctx.lineTo(x1 + nx, y1 + ny);
  const steps = Math.max(2, Math.round(len / (thick * 1.2)));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const a = i % 2 === 0 ? 0 : 1;
    ctx.moveTo(x0 + dx * t0 + nx * a, y0 + dy * t0 + ny * a);
    ctx.lineTo(x0 + dx * t1 + nx * (1 - a), y0 + dy * t1 + ny * (1 - a));
  }
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

/** A tower crane: mast, jib with a counterweight, cab and a hanging hook. */
function crane(ctx: Ctx, x: number, base: number, h: number, jib: number, color: string): void {
  const top = base - h;
  lattice(ctx, x, base, x, top, 8, color);
  lattice(ctx, x - jib * 0.3, top, x + jib, top, 6, color);
  ctx.fillStyle = color;
  ctx.fillRect(x - jib * 0.3 - 2, top - 2, 16, 12);
  ctx.fillRect(x - 3, top - 14, 14, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 4, top - 14);
  ctx.lineTo(x - jib * 0.3, top);
  ctx.moveTo(x + 4, top - 14);
  ctx.lineTo(x + jib, top);
  const hookX = x + jib * 0.7;
  ctx.moveTo(hookX, top + 6);
  ctx.lineTo(hookX, top + h * 0.35);
  ctx.stroke();
  ctx.fillRect(hookX - 3, top + h * 0.35, 6, 5);
}

/** Construction site at golden hour: a warm sky, tower cranes, a steel skeleton going up, fences and spoil heaps. */
export function constructionBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#4a6ac0"],
      [0.5, "#e8a878"],
      [0.85, "#ffcf98"],
      [1, "#ffe6b8"],
    ],
    ambient: { count: 26, color: "#ffe2b0", size: 1.1, vx: 0.35, vy: -0.03, glow: false },
    layers: [
      {
        width: 1600,
        height: 480,
        y: 0,
        factor: 0.03,
        paint: (ctx) => {
          glow(ctx, 1200, 300, 300, [
            [0, "rgba(255, 236, 180, 0.9)"],
            [0.15, "rgba(255, 200, 130, 0.55)"],
            [1, "rgba(255, 170, 110, 0)"],
          ]);
          ctx.beginPath();
          ctx.arc(1200, 300, 48, 0, Math.PI * 2);
          ctx.fillStyle = linear(ctx, 0, 252, 0, 348, [
            [0, "#fff6d8"],
            [1, "#ffbe70"],
          ]);
          ctx.fill();
        },
      },
      {
        width: 1800,
        height: 300,
        y: 140,
        factor: 0.08,
        paint: (ctx) => {
          // Warm, hazy finished towers on the horizon.
          const rnd = seededRandom(501);
          let x = 0;
          while (x < 1800) {
            const w = 36 + rnd() * 60;
            const h = 80 + rnd() * 170;
            ctx.fillStyle = shade("#c8907a", (rnd() - 0.5) * 0.12);
            ctx.fillRect(x, 300 - h, w, h);
            windows(ctx, x + 3, 300 - h + 6, w - 6, h - 8, rnd, { cols: Math.max(2, Math.round(w / 12)), rows: Math.round(h / 14), lit: "rgba(255, 230, 170, 0.6)", dark: "rgba(150, 100, 90, 0.35)", litChance: 0.3 });
            x += w + rnd() * 14;
          }
          ctx.fillStyle = linear(ctx, 0, 120, 0, 300, [
            [0, "rgba(255, 210, 160, 0)"],
            [1, "rgba(255, 210, 160, 0.7)"],
          ]);
          ctx.fillRect(0, 120, 1800, 180);
        },
      },
      {
        width: 1700,
        height: 380,
        y: 40,
        factor: 0.17,
        paint: (ctx) => {
          for (const [x, h, jib] of [
            [180, 300, 220],
            [760, 340, 260],
            [1300, 280, 200],
          ] as const) {
            wrap(1700, (o) => crane(ctx, x + o, 380, h, jib, "#d8901a"));
          }
        },
      },
      {
        width: 1500,
        height: 330,
        y: 150,
        factor: 0.3,
        paint: (ctx) => {
          // A steel skeleton going up, partly clad, with scaffolding.
          for (const [x, floors, bays] of [
            [100, 8, 5],
            [820, 6, 4],
          ] as const) {
            const bw = 34;
            const fh = 34;
            const w = bays * bw;
            const top = 330 - floors * fh;
            ctx.fillStyle = rgba("#5a3a2a", 0.85);
            ctx.fillRect(x, 330 - 3 * fh, w, 3 * fh);
            windows(ctx, x + 2, 330 - 3 * fh + 2, w - 4, 3 * fh - 4, seededRandom(x), { cols: bays * 2, rows: 3, lit: "#ffd890", dark: "#2a2a38", litChance: 0.25 });
            ctx.strokeStyle = "#c2461e";
            ctx.lineWidth = 3;
            for (let f = 0; f <= floors; f++) {
              ctx.beginPath();
              ctx.moveTo(x, 330 - f * fh);
              ctx.lineTo(x + w, 330 - f * fh);
              ctx.stroke();
            }
            for (let b = 0; b <= bays; b++) {
              ctx.beginPath();
              ctx.moveTo(x + b * bw, 330);
              ctx.lineTo(x + b * bw, top);
              ctx.stroke();
            }
            // Cross-bracing and a few hanging tarps.
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#8a2e14";
            for (let f = 3; f < floors; f++) {
              ctx.beginPath();
              ctx.moveTo(x, 330 - f * fh);
              ctx.lineTo(x + bw, 330 - (f + 1) * fh);
              ctx.stroke();
            }
            ctx.fillStyle = rgba("#2a7ac8", 0.75);
            ctx.fillRect(x + w - bw + 2, top + fh + 2, bw - 4, fh * 1.6);
            // Scaffolding up the side.
            ctx.strokeStyle = "#9aa0aa";
            for (let f = 0; f < floors; f++) {
              ctx.strokeRect(x + w + 4, 330 - (f + 1) * fh, 14, fh);
            }
          }
          tint(ctx, "rgba(255, 200, 150, 0.15)", 1500, 330);
        },
      },
      {
        width: 1300,
        height: 200,
        y: 280,
        factor: 0.56,
        paint: (ctx) => {
          // Site fence with hazard barriers, girder stacks and spoil heaps.
          const top = ridge(ctx, 1300, 200, 120, 551, [[4, 14], [11, 5]], linear(ctx, 0, 90, 0, 200, [
            [0, "#7a5230"],
            [1, "#2a1a10"],
          ]));
          ctx.strokeStyle = "rgba(60, 60, 70, 0.8)";
          ctx.lineWidth = 0.7;
          for (let x = 0; x < 1300; x += 6) {
            ctx.beginPath();
            ctx.moveTo(x, 70);
            ctx.lineTo(x + 30, 118);
            ctx.moveTo(x + 30, 70);
            ctx.lineTo(x, 118);
            ctx.stroke();
          }
          ctx.fillStyle = "#3a3a44";
          for (let x = 0; x < 1300; x += 90) ctx.fillRect(x, 64, 3, 58);
          const rnd = seededRandom(553);
          for (let i = 0; i < 6; i++) {
            const x = rnd() * 1250;
            const y = top(x) - 12;
            wrap(1300, (o) => {
              for (let s = 0; s < 6; s++) {
                ctx.fillStyle = s % 2 === 0 ? "#ffcc1a" : "#1a1a20";
                ctx.beginPath();
                ctx.moveTo(x + o + s * 8, y);
                ctx.lineTo(x + o + s * 8 + 8, y);
                ctx.lineTo(x + o + s * 8 + 4, y + 10);
                ctx.lineTo(x + o + s * 8 - 4, y + 10);
                ctx.closePath();
                ctx.fill();
              }
            });
          }
        },
      },
    ],
  };
}
