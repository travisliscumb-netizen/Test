import { linear, rgba, seededRandom } from "../paint";
import { glow, ridge, wrap } from "./shapes";
import type { Backdrop } from "./types";

/** Night fortress: a starfield, a haloed moon, towers with lit windows, drifting mist. */
export function fortressBackdrop(): Backdrop {
  return {
    sky: [
      [0, "#03040a"],
      [0.5, "#0e0f26"],
      [1, "#2a2050"],
    ],
    ambient: { count: 45, color: "#e8ecff", size: 1.2, vx: -0.12, vy: 0.35, glow: false },
    layers: [
      {
        width: 1600,
        height: 300,
        y: 0,
        factor: 0.02,
        paint: (ctx) => {
          const rnd = seededRandom(111);
          for (let i = 0; i < 320; i++) {
            const x = rnd() * 1600;
            const y = rnd() * 300;
            const r = rnd() < 0.08 ? 1.4 : 0.6;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = rgba("#ffffff", 0.4 + rnd() * 0.6);
            ctx.fill();
          }
          glow(ctx, 500, 90, 150, [
            [0, "rgba(220, 230, 255, 0.5)"],
            [1, "rgba(220, 230, 255, 0)"],
          ]);
          ctx.beginPath();
          ctx.arc(500, 90, 34, 0, Math.PI * 2);
          ctx.fillStyle = linear(ctx, 466, 56, 534, 124, [
            [0, "#ffffff"],
            [1, "#c8cce8"],
          ]);
          ctx.fill();
          for (const [x, y, r] of [
            [490, 80, 7],
            [512, 104, 5],
            [516, 76, 3.5],
          ] as const) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = rgba("#9aa0c8", 0.5);
            ctx.fill();
          }
        },
      },
      {
        width: 1800,
        height: 320,
        y: 140,
        factor: 0.14,
        paint: (ctx) => {
          ridge(ctx, 1800, 320, 250, 7, [[2, 14], [5, 6]], "#181530");
          const rnd = seededRandom(121);
          for (let i = 0; i < 8; i++) {
            const x = (i / 8) * 1800 + rnd() * 80;
            const w = 34 + rnd() * 30;
            const h = 110 + rnd() * 120;
            wrap(1800, (o) => {
              const top = 320 - h;
              ctx.fillStyle = "#181530";
              ctx.fillRect(x + o, top, w, h);
              for (let cx = 0; cx < w; cx += 9) ctx.fillRect(x + o + cx, top - 7, 6, 7);
              ctx.beginPath();
              ctx.moveTo(x + o - 5, top - 7);
              ctx.lineTo(x + o + w / 2, top - 60);
              ctx.lineTo(x + o + w + 5, top - 7);
              ctx.closePath();
              ctx.fill();
              for (let wy = top + 18; wy < 290; wy += 30) {
                glow(ctx, x + o + w / 2, wy + 5, 14, [
                  [0, "rgba(255, 200, 100, 0.6)"],
                  [1, "rgba(255, 200, 100, 0)"],
                ]);
                ctx.fillStyle = "#ffd070";
                ctx.fillRect(x + o + w / 2 - 2.5, wy, 5, 10);
                ctx.fillStyle = "#181530";
              }
            });
          }
        },
      },
      {
        width: 1600,
        height: 160,
        y: 260,
        factor: 0.26,
        drift: 0.2,
        paint: (ctx) => {
          const rnd = seededRandom(131);
          for (let i = 0; i < 14; i++) {
            const x = rnd() * 1600;
            const y = 40 + rnd() * 90;
            wrap(1600, (o) =>
              glow(ctx, x + o, y, 90 + rnd() * 60, [
                [0, "rgba(140, 130, 200, 0.22)"],
                [1, "rgba(140, 130, 200, 0)"],
              ]),
            );
          }
        },
      },
      {
        width: 1400,
        height: 200,
        y: 280,
        factor: 0.45,
        paint: (ctx) => {
          const top = ridge(ctx, 1400, 200, 80, 131, [[3, 12], [7, 5]], linear(ctx, 0, 60, 0, 200, [
            [0, "#14112a"],
            [1, "#06050e"],
          ]));
          ctx.fillStyle = "#14112a";
          for (let x = 0; x < 1400; x += 28) ctx.fillRect(x, top(x) - 10, 14, 11);
        },
      },
    ],
  };
}
